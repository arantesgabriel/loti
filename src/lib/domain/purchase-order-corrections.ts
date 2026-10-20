import { createHash } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../db/connection";
import { financialOperations, hubbuyAccounts, hubbuyBalanceConsumptions, hubbuyBalanceCreditShares, hubbuyBalanceEntries, hubbuyExternalItems, memberBalanceFinancingEntries, purchaseAdditionalOrderItems, purchaseCostCharges, purchaseCostOrders, purchaseCostPackageEvents, purchaseCostParticipants, purchaseCostRefunds, purchaseCostTrackings, purchaseItemCosts, purchaseOrderCorrections, purchasePackageItems, purchasePackages, purchasePaymentAllocations, purchasePaymentComponents, qcAdditionalPresentations } from "../db/schema";
import { authorization } from "./authorization";
import { resolveProductCategory } from "./categories";
import { DomainError } from "./errors";
import { calculateHubBuyBalanceState } from "./hubbuy-balance-services";
import { purchaseCostOrderServices } from "./purchase-cost-order-services";
import { serializeDomainTransaction } from "./transaction-lock";

const minor = z.number().int().min(0).max(1_000_000_000_000);
const schema = z.object({
  expectedRevision: z.number().int().min(0), expectedAccountRevision: z.number().int().min(0),
  idempotencyKey: z.string().trim().min(1).max(200), reason: z.string().trim().min(1).max(1000),
  confirmedIncorrectRegistration: z.literal(true), itemId: z.string().min(1),
  name: z.string().trim().min(1).max(200), url: z.string().url().max(2048),
  variant: z.string().max(500).nullable(), notes: z.string().max(2000).nullable(),
  quantity: z.number().int().min(1).max(10_000),
  nativeProductCnyMinor: minor, nativeChinaCnyMinor: minor,
  composition: z.object({ mode: z.enum(["equal", "percentage", "fixed"]), participants: z.array(z.object({ personId: z.string().min(1), weight: minor }).strict()).min(1).max(100) }).strict(),
  useOwnBalance: z.boolean(),
  balanceFunding: z.array(z.object({ costItemId: z.string().min(1), costComponent: z.enum(["product", "china"]), beneficiaryId: z.string().min(1), lenderId: z.string().min(1), cnyMinor: minor.refine(value => value > 0) }).strict()).max(10_000).default([]),
  external: z.object({ paymentMethod: z.enum(["pix", "card"]), principalBrlCents: minor.refine(value => value > 0), conversionCnyMinor: minor.refine(value => value > 0), conversionBrlCents: minor.refine(value => value > 0), feeBps: z.number().int().min(0).max(10_000) }).strict().nullable(),
}).strict();

type Result = { replacementOrderId: string; operationId: string; replayed: boolean; balanceBeforeCnyMinor: number; balanceAfterCnyMinor: number; historicalBrlCents: number; principalBrlCents: number; feeBrlCents: number; totalCostBrlCents: number };
class PreviewRollback extends Error { constructor(readonly result: Result) { super("Correction preview rollback"); } }
function databaseBusy(error: unknown, seen = new Set<unknown>()): boolean {
  if (!error || typeof error !== "object" || seen.has(error)) return false;
  seen.add(error);
  const candidate = error as { code?: string; message?: string; cause?: unknown };
  return candidate.code === "SQLITE_BUSY" || /SQLITE_BUSY|database is locked/i.test(candidate.message ?? "") || databaseBusy(candidate.cause, seen);
}

export function purchaseOrderCorrectionServices(db: AppDatabase, actorId: string) {
  async function correct(trackingId: string, orderId: string, input: unknown, preview = false, attempt = 0): Promise<Result> {
    const value = schema.parse(input);
    const payloadHash = createHash("sha256").update(JSON.stringify({ trackingId, orderId, ...value })).digest("hex");
    // A lost response may be retried after closure, or after another writer has
    // committed. Authenticate before returning its persisted receipt, without
    // starting a second write transaction just to acknowledge that receipt.
    const replayTracking = await db.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.id, trackingId)).get();
    if (!replayTracking) throw new DomainError("Acompanhamento não encontrado.", 404);
    await authorization(db, actorId).requireWorkspaceMember(replayTracking.workspaceId);
    const receipt = await db.select().from(financialOperations).where(and(eq(financialOperations.workspaceId, replayTracking.workspaceId), eq(financialOperations.idempotencyKey, value.idempotencyKey))).get();
    if (receipt) {
      if (receipt.operationType !== "additional_order_corrected" || receipt.payloadHash !== payloadHash) throw new DomainError("Esta chave já foi usada com outros dados.", 409, "IDEMPOTENCY_CONFLICT");
      return { ...JSON.parse(receipt.contextJson) as Result, replayed: true };
    }
    try {
      return await serializeDomainTransaction(() => db.transaction(async tx => {
        const tracking = await tx.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.id, trackingId)).get();
        if (!tracking) throw new DomainError("Acompanhamento não encontrado.", 404);
        await authorization(tx, actorId).requireWorkspaceMember(tracking.workspaceId);
        const prior = await tx.select().from(financialOperations).where(and(eq(financialOperations.workspaceId, tracking.workspaceId), eq(financialOperations.idempotencyKey, value.idempotencyKey))).get();
        if (prior) {
          if (prior.operationType !== "additional_order_corrected" || prior.payloadHash !== payloadHash) throw new DomainError("Esta chave já foi usada com outros dados.", 409, "IDEMPOTENCY_CONFLICT");
          return { ...JSON.parse(prior.contextJson) as Result, replayed: true };
        }
        if (tracking.status !== "open" || tracking.revision !== value.expectedRevision) throw new DomainError("Os custos mudaram ou estão encerrados. Atualize a tela.", 409);
        const order = await tx.select().from(purchaseCostOrders).where(and(eq(purchaseCostOrders.id, orderId), eq(purchaseCostOrders.trackingId, trackingId))).get();
        if (!order || order.kind !== "additional" || order.state !== "recorded" || !order.accountId) throw new DomainError("Pedido adicional pago não encontrado.", 404);
        if (await tx.select().from(purchaseOrderCorrections).where(eq(purchaseOrderCorrections.previousOrderId, orderId)).get()) throw new DomainError("Este pedido já foi corrigido. Atualize a tela.", 409);
        const accountState = await calculateHubBuyBalanceState(tx, order.accountId);
        const account = accountState.account;
        if (account.workspaceId !== tracking.workspaceId || account.status !== "active" || !accountState.reconciled || account.balanceCnyMinor !== accountState.ledgerBalanceCnyMinor || account.revision !== value.expectedAccountRevision) throw new DomainError("O saldo mudou ou a conta precisa de conciliação. Atualize a prévia.", 409, "BALANCE_REVISION_CONFLICT");
        const costs = await tx.select().from(purchaseItemCosts).where(eq(purchaseItemCosts.orderId, orderId)).orderBy(asc(purchaseItemCosts.itemOrder)).all();
        if (!costs.some(cost => cost.id === value.itemId)) throw new DomainError("Produto não encontrado neste pedido.", 404);
        const costIds = costs.map(cost => cost.id);
        const [items, participants, refunds, assignments, components] = await Promise.all([
          tx.select().from(purchaseAdditionalOrderItems).where(eq(purchaseAdditionalOrderItems.orderId, orderId)).all(),
          tx.select().from(purchaseCostParticipants).where(inArray(purchaseCostParticipants.costItemId, costIds)).orderBy(asc(purchaseCostParticipants.allocationOrder)).all(),
          tx.select().from(purchaseCostRefunds).where(inArray(purchaseCostRefunds.costItemId, costIds)).all(),
          tx.select().from(purchasePackageItems).where(inArray(purchasePackageItems.costItemId, costIds)).all(),
          tx.select().from(purchasePaymentComponents).where(eq(purchasePaymentComponents.orderId, orderId)).all(),
        ]);
        if (refunds.some(refund => refund.status !== "voided")) throw new DomainError("Anule os reembolsos deste pedido antes de corrigir seu pagamento.", 409, "CORRECTION_REFUND_DEPENDENCY");
        const packages = assignments.length ? await tx.select().from(purchasePackages).where(inArray(purchasePackages.id, [...new Set(assignments.map(row => row.packageId))])).all() : [];
        if (packages.some(pkg => pkg.trackingId !== trackingId || pkg.logisticsStatus !== "preparing" || pkg.contentSealSource !== null)) throw new DomainError("O pedido possui unidades em pacote enviado, recebido ou selado. Corrija a situação do pacote antes de editar.", 409, "CORRECTION_PACKAGE_DEPENDENCY");
        if (assignments.filter(row => row.costItemId === value.itemId).reduce((sum, row) => sum + row.quantity, 0) > value.quantity) throw new DomainError("Retire as unidades excedentes dos pacotes antes de reduzir a quantidade.", 409);
        const originalPeople = participants.filter(person => person.costItemId === value.itemId);
        if (new Set(value.composition.participants.map(person => person.personId)).size !== originalPeople.length || value.composition.participants.length !== originalPeople.length || originalPeople.some(person => !value.composition.participants.some(row => row.personId === person.personId))) throw new DomainError("Mantenha as pessoas originais do produto na divisão.");
        const weights = value.composition.participants.map(person => value.composition.mode === "equal" ? 1 : person.weight);
        if (!weights.some(weight => weight > 0) || value.composition.mode === "percentage" && weights.reduce((sum, weight) => sum + BigInt(weight), 0n) !== 10_000n) throw new DomainError("A divisão deve ser positiva e os percentuais devem somar 100%.");
        const allocations = components.length ? await tx.select().from(purchasePaymentAllocations).where(inArray(purchasePaymentAllocations.componentId, components.map(row => row.id))).all() : [];
        const consumptions = allocations.length ? await tx.select().from(hubbuyBalanceConsumptions).where(inArray(hubbuyBalanceConsumptions.paymentAllocationId, allocations.map(row => row.id))).all() : [];
        const financing = consumptions.length ? await tx.select().from(memberBalanceFinancingEntries).where(inArray(memberBalanceFinancingEntries.consumptionId, consumptions.map(row => row.id))).all() : [];
        if (financing.some(row => row.entryType !== "advance")) throw new DomainError("Este pedido possui acertos ou compensações de adiantamento. A edição comum está bloqueada para preservar esses registros.", 409, "CORRECTION_FINANCING_DEPENDENCY");
        const now = new Date(), operationId = crypto.randomUUID(), replacementOrderId = crypto.randomUUID();
        // The audit operation is inserted last, after the replacement has been
        // computed. A separate compensation operation owns the ledger entries.
        const compensationId = crypto.randomUUID();
        await tx.insert(financialOperations).values({ id: compensationId, workspaceId: tracking.workspaceId, operationType: "additional_order_payment_reversed", idempotencyKey: `correction-reversal:${operationId}`, payloadHash, actorId, occurredAt: null, recordedAt: now, reason: value.reason, reversalOfId: order.operationId, contextJson: JSON.stringify({ accountId: account.id, orderId, trackingId, replacementOrderId }) }).run();
        // Return each original owner's exact CNY and historical basis as a new
        // credit. Original debits/consumptions/rights are never deleted or edited.
        const debitIds = [...new Set(consumptions.map(row => row.debitEntryId))];
        let sequence = Math.max(-1, ...accountState.entries.map(row => row.sequence)) + 1;
        let returnedCny = 0;
        for (const debitId of debitIds) {
          const used = consumptions.filter(row => row.debitEntryId === debitId);
          const debit = accountState.entries.find(row => row.id === debitId);
          const cny = used.reduce((sum, row) => sum + row.amountCnyMinor, 0), brl = used.reduce((sum, row) => sum + row.historicalBrlCents, 0);
          if (!debit || debit.direction !== "debit" || debit.amountCnyMinor !== cny || debit.historicalBrlCents !== brl) throw new DomainError("O débito original não pode ser compensado integralmente.", 409);
          const creditId = crypto.randomUUID();
          await tx.insert(hubbuyBalanceEntries).values({ id: creditId, accountId: account.id, operationId: compensationId, sequence: sequence++, direction: "credit", amountCnyMinor: cny, historicalBrlCents: brl, sourceType: "reversal", sourceId: orderId, reversalOfEntryId: debitId, createdAt: now }).run();
          const owners = new Map<string, { cny: number; brl: number }>();
          for (const use of used) {
            const owner = accountState.shares.find(share => share.id === use.creditShareId)?.personId;
            if (!owner) throw new DomainError("Titular original do saldo não encontrado.", 409);
            const total = owners.get(owner) ?? { cny: 0, brl: 0 }; total.cny += use.amountCnyMinor; total.brl += use.historicalBrlCents; owners.set(owner, total);
          }
          await tx.insert(hubbuyBalanceCreditShares).values([...owners].map(([personId, total], allocationOrder) => ({ id: crypto.randomUUID(), creditEntryId: creditId, personId, allocationOrder, amountCnyMinor: total.cny, historicalBrlCents: total.brl }))).run();
          returnedCny += cny;
        }
        // Outstanding advances belong to the superseded payment. The correction
        // link retires them from active projections; a fresh advance is created
        // only if the replacement explicitly authorizes that funding again.
        // Existing `reversal` entries reverse refund offsets, not advances.
        if (returnedCny) {
          if (BigInt(account.balanceCnyMinor) + BigInt(returnedCny) > 1_000_000_000_000n) throw new DomainError("A compensação supera o limite da conta.");
          const changed = await tx.update(hubbuyAccounts).set({ balanceCnyMinor: account.balanceCnyMinor + returnedCny, revision: account.revision + 1, updatedBy: actorId, updatedAt: now }).where(and(eq(hubbuyAccounts.id, account.id), eq(hubbuyAccounts.revision, account.revision))).returning().get();
          if (!changed) throw new DomainError("O saldo mudou. Atualize a tela.", 409);
        }
        await tx.insert(purchaseCostOrders).values({ ...order, id: replacementOrderId, state: "draft", revision: 0, externalReference: null, operationId: null, recordedAt: null, createdBy: actorId, createdAt: now, updatedBy: actorId, updatedAt: now }).run();
        const costMap = new Map<string, string>();
        for (const cost of costs) {
          const item = items.find(row => row.id === cost.additionalOrderItemId);
          if (!item) throw new DomainError("Snapshot do produto não encontrado.", 409);
          const edited = cost.id === value.itemId, newItemId = crypto.randomUUID(), newCostId = crypto.randomUUID();
          costMap.set(cost.id, newCostId);
          await tx.insert(purchaseAdditionalOrderItems).values({ ...item, id: newItemId, orderId: replacementOrderId, ...(edited ? { name: value.name, url: value.url, variant: value.variant?.trim() || null, notes: value.notes?.trim() || null, quantity: value.quantity, visualKey: resolveProductCategory(value.name) } : {}), createdBy: actorId, createdAt: now }).run();
          await tx.insert(purchaseItemCosts).values({ ...cost, id: newCostId, orderId: replacementOrderId, additionalOrderItemId: newItemId, ...(edited ? { nativeProductState: value.nativeProductCnyMinor === 0 ? "no_charge" as const : "known" as const, nativeProductCnyMinor: value.nativeProductCnyMinor || null, nativeChinaState: value.nativeChinaCnyMinor === 0 ? "no_charge" as const : "known" as const, nativeChinaCnyMinor: value.nativeChinaCnyMinor || null } : {}) }).run();
          const people = edited ? value.composition.participants.map((person, allocationOrder) => ({ costItemId: newCostId, personId: person.personId, allocationOrder, weightMode: value.composition.mode, weight: value.composition.mode === "equal" ? 1 : person.weight })) : participants.filter(person => person.costItemId === cost.id).map(person => ({ ...person, costItemId: newCostId }));
          await tx.insert(purchaseCostParticipants).values(people).run();
          await tx.update(hubbuyExternalItems).set({ additionalOrderItemId: newItemId, updatedAt: now }).where(eq(hubbuyExternalItems.additionalOrderItemId, item.id)).run();
          await tx.update(qcAdditionalPresentations).set({ additionalOrderItemId: newItemId }).where(eq(qcAdditionalPresentations.additionalOrderItemId, item.id)).run();
        }
        await tx.insert(purchaseCostCharges).values({ id: crypto.randomUUID(), trackingId, orderId: replacementOrderId, packageId: null, chargeType: "products", paymentModel: "components_v1", valueState: null, amountCents: null, paymentMethod: null, feeBps: null, paymentStatus: "pending", paidBy: null, paidAt: null, createdAt: now, updatedAt: now }).run();
        const payment = await purchaseCostOrderServices(db, actorId).recordMixedPaymentInTransaction(tx, trackingId, replacementOrderId, { expectedRevision: value.expectedRevision, idempotencyKey: `correction-payment:${operationId}`, useOwnBalance: value.useOwnBalance, balanceFunding: value.balanceFunding.map(row => ({ ...row, costItemId: costMap.get(row.costItemId) ?? row.costItemId })), external: value.external });
        if (payment.replayed) throw new DomainError("Operação de correção inconsistente.", 409);
        for (const assignment of assignments) {
          await tx.delete(purchasePackageItems).where(and(eq(purchasePackageItems.packageId, assignment.packageId), eq(purchasePackageItems.costItemId, assignment.costItemId))).run();
          await tx.insert(purchasePackageItems).values({ ...assignment, costItemId: costMap.get(assignment.costItemId)! }).run();
        }
        for (const pkg of packages) {
          await tx.update(purchasePackages).set({ contentRevision: pkg.contentRevision + 1, updatedAt: now }).where(eq(purchasePackages.id, pkg.id)).run();
          const events = await tx.select().from(purchaseCostPackageEvents).where(eq(purchaseCostPackageEvents.packageId, pkg.id)).all();
          await tx.insert(purchaseCostPackageEvents).values({ id: crypto.randomUUID(), trackingId, packageId: pkg.id, eventOrder: Math.max(-1, ...events.map(event => event.eventOrder)) + 1, eventType: "content_changed", contentRevision: pkg.contentRevision + 1, reason: null, actorId, createdAt: now }).run();
        }
        const finalState = await calculateHubBuyBalanceState(tx, account.id);
        if (!finalState.reconciled || finalState.ledgerBalanceCnyMinor !== finalState.account.balanceCnyMinor) throw new DomainError("A correção não conciliou o saldo.", 409);
        const result: Result = { replacementOrderId, operationId, replayed: false, balanceBeforeCnyMinor: account.balanceCnyMinor, balanceAfterCnyMinor: finalState.account.balanceCnyMinor, historicalBrlCents: payment.historicalBrlCents!, principalBrlCents: payment.principalBrlCents!, feeBrlCents: payment.feeBrlCents!, totalCostBrlCents: payment.historicalBrlCents! + payment.principalBrlCents! + payment.feeBrlCents! };
        await tx.insert(financialOperations).values({ id: operationId, workspaceId: tracking.workspaceId, operationType: "additional_order_corrected", idempotencyKey: value.idempotencyKey, payloadHash, actorId, occurredAt: null, recordedAt: now, reason: value.reason, reversalOfId: order.operationId, contextJson: JSON.stringify({ ...result, accountId: account.id, trackingId, previousOrderId: order.id }) }).run();
        await tx.insert(purchaseOrderCorrections).values({ id: crypto.randomUUID(), trackingId, previousOrderId: orderId, replacementOrderId, operationId }).run();
        if (preview) throw new PreviewRollback(result);
        return result;
      }));
    } catch (error) {
      if (preview && error instanceof PreviewRollback) return error.result;
      if (databaseBusy(error) && attempt < 8) {
        await new Promise(resolve => setTimeout(resolve, Math.min(1_000, 25 * 2 ** attempt)));
        return correct(trackingId, orderId, input, preview, attempt + 1);
      }
      throw error;
    }
  }
  return { correct };
}
