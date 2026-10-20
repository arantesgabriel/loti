import { createHash } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../db/connection";
import { financialOperations, hubbuyAccounts, hubbuyBalanceConsumptions, hubbuyBalanceCreditShares, hubbuyBalanceEntries, memberBalanceFinancingEntries, purchaseAdditionalOrderItems, purchaseCostCharges, purchaseCostOrders, purchaseOrderCorrections, purchaseCostPackageEvents, purchaseCostParticipants, purchaseCostRefundEvents, purchaseCostRefundParticipants, purchaseCostRefunds, purchaseCostReopenings, purchaseCostTrackings, purchaseItemCosts, purchaseItems, purchasePackageItems, purchasePackages, purchasePaymentAllocations, purchasePaymentComponents, purchaseRefundPaymentAllocations, workspaceCostSettings } from "../db/schema";
import { authorization } from "./authorization";
import { DomainError } from "./errors";
import { listCostTrackings, readCostTracking } from "./package-cost-reading";
import { initializePurchaseCosts, type CostTransaction } from "./purchase-cost-initialization";
import { serializeDomainTransaction } from "./transaction-lock";
import { splitByWeights } from "./package-cost-calculations";
import { purchaseCostOrderServices } from "./purchase-cost-order-services";
import { allocateExactMinor } from "./hubbuy-balance-calculations";
import { activateEmptyHubbuyAccountAtZeroInTransaction, calculateHubBuyBalanceState, createHubbuyZeroBalanceAccountInTransaction } from "./hubbuy-balance-services";
import { allocateRefundCredit } from "./package-refund-calculations";
import { refundUnitRangeCapacityCents } from "./refund-unit-capacity";
import { purchaseOrderCorrectionServices } from "./purchase-order-corrections";

const maxCost = 1_000_000_000_000;
const revisionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const stateSchema = z.enum(["pending", "known", "no_charge"]);
const centsSchema = z.number().int().min(0).max(maxCost);
const methodSchema = z.enum(["pix", "card"]).nullable();
const bpsSchema = z.number().int().min(0).max(10_000).nullable();

const itemCostSchema = z.object({
  expectedRevision: revisionSchema,
  itemId: z.string().min(1),
  effectivePriceState: stateSchema,
  effectivePriceUnitCents: centsSchema.nullable(),
  chinaFreightState: stateSchema,
  chinaFreightUnitCents: centsSchema.nullable(),
  composition: z.object({
    mode: z.enum(["equal", "percentage", "fixed"]),
    participants: z.array(z.object({ personId: z.string().min(1), weight: centsSchema }).strict()).min(1).max(100),
  }).strict().optional(),
  confirmPaymentReset: z.boolean().optional(),
}).strict();
const allocationSchema = z.object({
  expectedRevision: revisionSchema,
  packageId: z.string().min(1),
  allocations: z.array(z.object({ costItemId: z.string().min(1), quantity: z.number().int().min(0).max(10_000) }).strict()).max(10_000),
  confirmPaymentReset: z.boolean().optional(),
}).strict();
const productChargeSchema = z.object({
  expectedRevision: revisionSchema,
  chargeType: z.literal("products"),
  paymentMethod: methodSchema,
  feeBps: bpsSchema.optional(),
  confirmPaymentReset: z.boolean().optional(),
}).strict();
const freightChargeSchema = z.object({
  expectedRevision: revisionSchema,
  chargeType: z.literal("brazil_freight"),
  valueState: stateSchema,
  amountCents: centsSchema.nullable(),
  paymentMethod: methodSchema,
  feeBps: bpsSchema.optional(),
  confirmPaymentReset: z.boolean().optional(),
}).strict();
const customsChargeSchema = z.object({
  expectedRevision: revisionSchema,
  chargeType: z.literal("customs"),
  valueState: stateSchema,
  amountCents: centsSchema.nullable(),
  confirmPaymentReset: z.boolean().optional(),
}).strict();
const chargeSchema = z.discriminatedUnion("chargeType", [productChargeSchema, freightChargeSchema, customsChargeSchema]);
const reasonSchema = z.string().trim().min(1).max(1000);
const refundRequestSchema = z.object({
  expectedRevision: revisionSchema,
  costItemId: z.string().min(1),
  quantity: z.number().int().min(1).max(10_000),
  requestedProductCents: centsSchema,
  requestedChinaCents: centsSchema,
  reason: reasonSchema,
  packageRemovals: z.array(z.object({ packageId: z.string().min(1), quantity: z.number().int().min(1).max(10_000) }).strict()).max(100),
  unassignedQuantity: z.number().int().min(0).max(10_000),
}).strict();
const refundValueSchema = z.object({ expectedRevision: revisionSchema, requestedProductCents: centsSchema, requestedChinaCents: centsSchema, reason: reasonSchema }).strict();
const refundReceiptSchema = z.object({
  expectedRevision: revisionSchema, receivedProductCents: centsSchema, receivedChinaCents: centsSchema,
  destination: z.enum(["hubbuy", "external"]).default("external"), accountId: z.string().min(1).nullable().optional(),
  newAccountLabel: z.string().trim().min(1).max(100).optional(), confirmZeroBalance: z.literal(true).optional(),
  expectedAccountRevision: revisionSchema.optional(), confirmedNoPriorBalance: z.literal(true).optional(),
  receivedProductCnyMinor: centsSchema.nullable().optional(), receivedChinaCnyMinor: centsSchema.nullable().optional(),
  nativeEvidence: z.string().trim().min(3).max(1000).optional(), confirmed: z.literal(true),
}).strict().superRefine((value, context) => {
  const hasAccountId = typeof value.accountId === "string";
  const hasNewLabel = value.newAccountLabel !== undefined;
  if (hasAccountId && hasNewLabel) context.addIssue({ code: "custom", path: ["accountId"], message: "Escolha uma conta existente ou informe um novo nome, não ambos." });
  if (hasNewLabel && value.confirmZeroBalance !== true) context.addIssue({ code: "custom", path: ["confirmZeroBalance"], message: "Confirme que a nova conta começa com saldo zero." });
  if (value.confirmedNoPriorBalance === true && (!hasAccountId || value.expectedAccountRevision === undefined)) context.addIssue({ code: "custom", path: ["expectedAccountRevision"], message: "A confirmação de conta vazia exige uma conta e sua revisão." });
  if (value.destination === "external" && (hasAccountId || hasNewLabel || value.confirmZeroBalance || value.expectedAccountRevision !== undefined || value.confirmedNoPriorBalance || value.receivedProductCnyMinor != null || value.receivedChinaCnyMinor != null || value.nativeEvidence)) {
    context.addIssue({ code: "custom", path: ["destination"], message: "Campos HubBuy só podem ser enviados para um recebimento na conta HubBuy." });
  }
  if (value.destination === "hubbuy" && value.confirmZeroBalance && (!hasNewLabel || value.confirmedNoPriorBalance || value.expectedAccountRevision !== undefined)) {
    context.addIssue({ code: "custom", path: ["confirmZeroBalance"], message: "A confirmação de saldo zero só se aplica à criação de uma nova conta." });
  }
});
const refundCorrectionSchema = z.object({ expectedRevision: revisionSchema, receivedProductCents: centsSchema, receivedChinaCents: centsSchema, destination: z.enum(["hubbuy", "external"]).optional(), accountId: z.string().min(1).nullable().optional(), receivedProductCnyMinor: centsSchema.nullable().optional(), receivedChinaCnyMinor: centsSchema.nullable().optional(), nativeEvidence: z.string().trim().min(3).max(1000).nullable().optional(), reason: reasonSchema, confirmed: z.literal(true) }).strict();
const refundVoidSchema = z.object({ expectedRevision: revisionSchema, reason: reasonSchema, confirmed: z.literal(true) }).strict();
const financingSettlementSchema = z.object({
  expectedRevision: revisionSchema, idempotencyKey: z.string().trim().min(8).max(200), orderId: z.string().min(1),
  consumptionId: z.string().min(1), lenderId: z.string().min(1), beneficiaryId: z.string().min(1),
  amountCnyMinor: z.number().int().min(1).max(maxCost), settledAmountMinor: z.number().int().min(1).max(maxCost),
  settledCurrency: z.enum(["BRL", "CNY"]), occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: reasonSchema,
}).strict();

function assertRefundValues(quantity: number, productCents: number, chinaCents: number, productUnitCents: number, chinaUnitCents: number, requested = false) {
  const productCap = BigInt(quantity) * BigInt(productUnitCents), chinaCap = BigInt(quantity) * BigInt(chinaUnitCents);
  if (BigInt(productCents) > productCap || BigInt(chinaCents) > chinaCap) throw new DomainError("O valor excede o custo original das unidades selecionadas.", 409, "REFUND_AMOUNT_LIMIT");
  if (requested && productCents + chinaCents === 0) throw new DomainError("A solicitação precisa conter um valor de produto ou frete China.", 400, "REFUND_AMOUNT_REQUIRED");
}

function refundQuantityCapacity(totalCents: number, totalQuantity: number, startQuantity: number, quantity: number) {
  try {
    return refundUnitRangeCapacityCents(totalCents, totalQuantity, startQuantity, quantity);
  } catch {
    throw new DomainError("A faixa de unidades do reembolso é inválida.", 409, "REFUND_INELIGIBLE_UNITS");
  }
}

function assertRefundRangeAmounts(productCents: number, chinaCents: number, productCapacity: number, chinaCapacity: number, requested = false) {
  if (productCents > productCapacity || chinaCents > chinaCapacity) throw new DomainError("O valor excede a base histórica das unidades selecionadas.", 409, "REFUND_AMOUNT_LIMIT");
  if (requested && productCents + chinaCents === 0) throw new DomainError("A solicitação precisa conter um valor de produto ou frete China.", 400, "REFUND_AMOUNT_REQUIRED");
}

function proportionalMinor(total: number, numerator: number, denominator: number) {
  if (total < 0 || numerator < 0 || denominator < 0 || ![total, numerator, denominator].every(Number.isSafeInteger)) throw new DomainError("A proporção do reembolso é inválida.", 409);
  if (total === 0 || numerator === 0) return 0;
  if (denominator === 0 || numerator >= denominator) return total;
  const n = BigInt(total) * BigInt(numerator), d = BigInt(denominator);
  return Number((2n * n + d) / (2n * d));
}

async function refundCapacityForPosition(tx: CostTransaction, refund: typeof purchaseCostRefunds.$inferSelect, totalProductCents: number, totalChinaCents: number) {
  const start = refund.unitStart;
  return {
    start,
    product: refundQuantityCapacity(totalProductCents, refund.originalItemQuantity, start, refund.quantity),
    china: refundQuantityCapacity(totalChinaCents, refund.originalItemQuantity, start, refund.quantity),
  };
}

function firstAvailableRefundUnit(active: Array<{ unitStart: number; quantity: number }>, totalQuantity: number, quantity: number) {
  let start = 0;
  for (const range of [...active].sort((a, b) => a.unitStart - b.unitStart)) {
    if (start + quantity <= range.unitStart) return start;
    start = Math.max(start, range.unitStart + range.quantity);
  }
  if (start + quantity <= totalQuantity) return start;
  throw new DomainError("A quantidade solicitada excede as unidades ainda disponíveis.", 409, "REFUND_INELIGIBLE_UNITS");
}

async function appendRefundEvent(tx: CostTransaction, refundId: string, actorId: string, eventType: "requested" | "request_updated" | "received" | "receipt_corrected" | "voided", reason: string | null, details: unknown) {
  const existing = await tx.select({ eventOrder: purchaseCostRefundEvents.eventOrder }).from(purchaseCostRefundEvents).where(eq(purchaseCostRefundEvents.refundId, refundId)).all();
  const eventOrder = existing.reduce((max, event) => Math.max(max, event.eventOrder), -1) + 1;
  await tx.insert(purchaseCostRefundEvents).values({ id: crypto.randomUUID(), refundId, eventOrder, eventType, actorId, createdAt: new Date(), reason, detailsJson: JSON.stringify(details) }).run();
}

function assertValueState(state: z.infer<typeof stateSchema>, amount: number | null, label: string) {
  if (state === "known" && amount === null) throw new DomainError(`Informe ${label}.`);
  if (state !== "known" && amount !== null) throw new DomainError(`${label} deve ficar vazio enquanto estiver pendente ou sem cobrança.`);
}

function isUniqueConstraint(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; message?: string; cause?: unknown };
  return /unique|constraint/i.test(`${value.code ?? ""} ${value.message ?? ""}`) || isUniqueConstraint(value.cause);
}

function isDatabaseBusy(error: unknown, seen = new Set<unknown>()): boolean {
  if (!error || typeof error !== "object" || seen.has(error)) return false;
  seen.add(error);
  const candidate = error as { code?: string; message?: string; cause?: unknown };
  return candidate.code === "SQLITE_BUSY" || /SQLITE_BUSY|database is locked/i.test(candidate.message ?? "") || isDatabaseBusy(candidate.cause, seen);
}

export function packageCostServices(db: AppDatabase, userId: string) {
  const orders = purchaseCostOrderServices(db, userId);
  const correctAdditionalOrder = purchaseOrderCorrectionServices(db, userId).correct;
  const transact = <T>(operation: (tx: CostTransaction) => Promise<T>) => serializeDomainTransaction(async () => {
    for (let attempt = 0; ; attempt++) {
      try { return await db.transaction(operation); }
      catch (error) {
        // Separate server processes can contend longer than the short local
        // transaction queue. Retry only SQLite BUSY; optimistic revisions still
        // decide the winner once the writer commits.
        if (!isDatabaseBusy(error) || attempt >= 12) throw error;
        await new Promise(resolve => setTimeout(resolve, Math.min(2_000, 25 * 2 ** attempt)));
      }
    }
  });

  async function mutate<T>(trackingId: string, expectedRevision: number, operation: (tx: CostTransaction, tracking: typeof purchaseCostTrackings.$inferSelect) => Promise<T>, options: { requiredStatus?: "open" | "closed"; trackingPatch?: Partial<typeof purchaseCostTrackings.$inferInsert>; replayIf?: (tx: CostTransaction, tracking: typeof purchaseCostTrackings.$inferSelect) => Promise<boolean> } = {}) {
    return transact(async tx => {
      const tracking = await tx.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.id, trackingId)).get();
      if (!tracking) throw new DomainError("Acompanhamento de custos não encontrado.", 404);
      await authorization(tx, userId).requireWorkspaceMember(tracking.workspaceId);
      if (options.replayIf && await options.replayIf(tx, tracking)) return readCostTracking(tx, userId, trackingId);
      const requiredStatus = options.requiredStatus ?? "open";
      if (tracking.status !== requiredStatus) throw new DomainError(requiredStatus === "open" ? "Os custos estão encerrados. Reabra o acompanhamento para editar." : "Este acompanhamento ainda está aberto.", 409);
      if (tracking.revision !== expectedRevision) throw new DomainError("Os custos foram alterados em outra sessão. Atualize a tela e tente novamente.", 409);
      const result = await operation(tx, tracking);
      const now = new Date();
      const updated = await tx.update(purchaseCostTrackings).set({
        ...options.trackingPatch,
        revision: tracking.revision + 1,
        updatedBy: userId,
        updatedAt: now,
      }).where(and(eq(purchaseCostTrackings.id, trackingId), eq(purchaseCostTrackings.revision, expectedRevision), eq(purchaseCostTrackings.status, requiredStatus))).returning().get();
      if (!updated) throw new DomainError("Os custos foram alterados em outra sessão. Atualize a tela e tente novamente.", 409);
      if (result !== undefined) return result;
      return readCostTracking(tx, userId, trackingId);
    });
  }

  async function appendPackageEvent(tx: CostTransaction, trackingId: string, packageId: string, eventType: "content_sealed" | "content_changed" | "content_unsealed", contentRevision: number, reason: string | null = null) {
    const events = await tx.select({ eventOrder: purchaseCostPackageEvents.eventOrder }).from(purchaseCostPackageEvents).where(eq(purchaseCostPackageEvents.packageId, packageId)).all();
    const eventOrder = events.reduce((max, event) => Math.max(max, event.eventOrder), -1) + 1;
    await tx.insert(purchaseCostPackageEvents).values({ id: crypto.randomUUID(), trackingId, packageId, eventOrder, eventType, contentRevision, actorId: userId, reason, createdAt: new Date() }).run();
  }

  async function createRefundHubBuyCredit(tx: CostTransaction, tracking: typeof purchaseCostTrackings.$inferSelect, refund: typeof purchaseCostRefunds.$inferSelect, input: { accountId: string; productCnyMinor: number; chinaCnyMinor: number; productBrlCents: number; chinaBrlCents: number; idempotencyKey: string; operationType: string; reason: string | null }) {
    const amountCnyMinor = input.productCnyMinor + input.chinaCnyMinor;
    if (amountCnyMinor > maxCost) throw new DomainError("O crédito CNY excede o limite permitido.", 400);
    if (amountCnyMinor === 0) {
      if (input.productBrlCents + input.chinaBrlCents > 0) throw new DomainError("Um recebimento com valor BRL precisa informar o crédito CNY correspondente ou ter destino externo.", 409, "REFUND_CNY_REQUIRED");
      return null;
    }
    const participants = await tx.select().from(purchaseCostRefundParticipants).where(eq(purchaseCostRefundParticipants.refundId, refund.id)).orderBy(asc(purchaseCostRefundParticipants.allocationOrder)).all();
    if (!participants.length) throw new DomainError("A divisão histórica do reembolso está ausente.", 409);
    const componentAllocations = ([
      { component: "product" as const, cnyMinor: input.productCnyMinor, brlCents: input.productBrlCents, weightKey: "originalProductShareCents" as const },
      { component: "china" as const, cnyMinor: input.chinaCnyMinor, brlCents: input.chinaBrlCents, weightKey: "originalChinaShareCents" as const },
    ]).map(({ component, cnyMinor, brlCents, weightKey }) => {
      let cnyShares = participants.map(() => 0);
      if (cnyMinor > 0) {
        const totalWeight = participants.reduce((sum, person) => sum + BigInt(person[weightKey]), 0n);
        if (totalWeight === 0n) throw new DomainError(`Não há base histórica para atribuir crédito CNY ao componente ${component === "product" ? "produto" : "frete China"}.`, 409, "REFUND_CNY_ALLOCATION_UNAVAILABLE");
        cnyShares = allocateExactMinor(cnyMinor, participants.map(person => ({ id: person.personId, order: person.allocationOrder, weight: person[weightKey] })));
      }
      const brlShares = allocateRefundCredit(brlCents, participants.map(person => ({ personId: person.personId, allocationOrder: person.allocationOrder, cents: person[weightKey] })));
      return { component, cnyShares, brlShares };
    });
    const personTotals = participants.map((person, index) => ({
      personId: person.personId,
      allocationOrder: person.allocationOrder,
      amountCnyMinor: componentAllocations.reduce((sum, component) => sum + component.cnyShares[index], 0),
      historicalBrlCents: componentAllocations.reduce((sum, component) => sum + component.brlShares[index], 0),
    }));
    if (personTotals.some(person => person.amountCnyMinor === 0 && person.historicalBrlCents > 0)) {
      throw new DomainError("O valor CNY é pequeno demais para preservar a divisão individual em centavos BRL. Ajuste o valor nativo confirmado ou mantenha este recebimento fora da carteira.", 409, "REFUND_CNY_SPLIT_TOO_SMALL");
    }
    const accountState = await calculateHubBuyBalanceState(tx, input.accountId);
    if (accountState.account.workspaceId !== tracking.workspaceId) throw new DomainError("A conta HubBuy pertence a outro espaço de trabalho.", 403);
    if (accountState.account.status !== "active" || !accountState.reconciled || accountState.ledgerBalanceCnyMinor !== accountState.account.balanceCnyMinor) {
      throw new DomainError("Concilie e ative a conta HubBuy antes de registrar o crédito.", 409, "BALANCE_RECONCILIATION_REQUIRED");
    }
    const now = new Date(), operationId = crypto.randomUUID(), entryId = crypto.randomUUID();
    const payload = { refundId: refund.id, accountId: input.accountId, productCnyMinor: input.productCnyMinor, chinaCnyMinor: input.chinaCnyMinor, productBrlCents: input.productBrlCents, chinaBrlCents: input.chinaBrlCents };
    const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    await tx.insert(financialOperations).values({
      id: operationId, workspaceId: tracking.workspaceId, operationType: input.operationType,
      idempotencyKey: input.idempotencyKey, payloadHash, actorId: userId, occurredAt: now, recordedAt: now,
      reason: input.reason, reversalOfId: null, contextJson: JSON.stringify({ entryId, ...payload }),
    }).run();
    const sequence = accountState.entries.reduce((max, entry) => Math.max(max, entry.sequence), -1) + 1;
    await tx.insert(hubbuyBalanceEntries).values({
      id: entryId, accountId: input.accountId, operationId, sequence, direction: "credit", amountCnyMinor,
      historicalBrlCents: input.productBrlCents + input.chinaBrlCents, sourceType: "refund_received", sourceId: refund.id,
      reversalOfEntryId: null, createdAt: now,
    }).run();
    const shareRows = personTotals.filter(person => person.amountCnyMinor > 0);
    await tx.insert(hubbuyBalanceCreditShares).values(shareRows.map(person => ({
      id: crypto.randomUUID(), creditEntryId: entryId, personId: person.personId, allocationOrder: person.allocationOrder,
      amountCnyMinor: person.amountCnyMinor, historicalBrlCents: person.historicalBrlCents,
    }))).run();
    const allocationRows = componentAllocations.flatMap((component, componentOrder) => participants.flatMap((person, index) => {
      const cnyMinor = component.cnyShares[index], brlCents = component.brlShares[index];
      if (cnyMinor === 0 && brlCents === 0) return [];
      return [{
        id: crypto.randomUUID(), refundId: refund.id, operationId, paymentAllocationId: null,
        costComponent: component.component, sourceType: "legacy_single" as const, personId: person.personId,
        allocationOrder: componentOrder * 100 + person.allocationOrder,
        cnyMinor, principalBrlCents: brlCents, feeBrlCents: 0, historicalBrlCents: brlCents,
      }];
    }));
    if (allocationRows.length) await tx.insert(purchaseRefundPaymentAllocations).values(allocationRows).run();
    const updated = await tx.update(hubbuyAccounts).set({
      balanceCnyMinor: accountState.account.balanceCnyMinor + amountCnyMinor,
      revision: accountState.account.revision + 1, updatedBy: userId, updatedAt: now,
    }).where(and(eq(hubbuyAccounts.id, input.accountId), eq(hubbuyAccounts.revision, accountState.account.revision), eq(hubbuyAccounts.status, "active"))).returning().get();
    if (!updated) throw new DomainError("A conta HubBuy mudou durante o recebimento. Atualize a tela e tente novamente.", 409);
    return { operationId, entryId, amountCnyMinor };
  }

  async function recordExternalRefundOperation(tx: CostTransaction, tracking: typeof purchaseCostTrackings.$inferSelect, refund: typeof purchaseCostRefunds.$inferSelect, input: { productBrlCents: number; chinaBrlCents: number; idempotencyKey: string; operationType: string; reason: string | null }) {
    const participants = await tx.select().from(purchaseCostRefundParticipants).where(eq(purchaseCostRefundParticipants.refundId, refund.id)).orderBy(asc(purchaseCostRefundParticipants.allocationOrder)).all();
    if (!participants.length) throw new DomainError("A divisão histórica do reembolso está ausente.", 409);
    const components = [
      { component: "product" as const, value: input.productBrlCents, weightKey: "originalProductShareCents" as const },
      { component: "china" as const, value: input.chinaBrlCents, weightKey: "originalChinaShareCents" as const },
    ];
    const allocations = components.flatMap((component, componentOrder) => {
      const shares = allocateRefundCredit(component.value, participants.map(person => ({ personId: person.personId, allocationOrder: person.allocationOrder, cents: person[component.weightKey] })));
      return participants.flatMap((person, index) => shares[index] > 0 ? [{
        id: crypto.randomUUID(), refundId: refund.id, operationId: "", paymentAllocationId: null,
        costComponent: component.component, sourceType: "legacy_single" as const, personId: person.personId,
        allocationOrder: componentOrder * 100 + person.allocationOrder, cnyMinor: 0,
        principalBrlCents: shares[index], feeBrlCents: 0, historicalBrlCents: shares[index],
      }] : []);
    });
    const now = new Date(), operationId = crypto.randomUUID();
    const payload = { refundId: refund.id, destination: "external", productBrlCents: input.productBrlCents, chinaBrlCents: input.chinaBrlCents };
    const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    await tx.insert(financialOperations).values({
      id: operationId, workspaceId: tracking.workspaceId, operationType: input.operationType, idempotencyKey: input.idempotencyKey,
      payloadHash, actorId: userId, occurredAt: now, recordedAt: now, reason: input.reason, reversalOfId: null,
      contextJson: JSON.stringify(payload),
    }).run();
    if (allocations.length) await tx.insert(purchaseRefundPaymentAllocations).values(allocations.map(row => ({ ...row, operationId }))).run();
    return { operationId };
  }

  async function reverseRefundHubBuyCredit(tx: CostTransaction, tracking: typeof purchaseCostTrackings.$inferSelect, refund: typeof purchaseCostRefunds.$inferSelect, reason: string, idempotencyKey: string) {
    if (!refund.creditOperationId || !refund.hubbuyAccountId) return null;
    const state = await calculateHubBuyBalanceState(tx, refund.hubbuyAccountId);
    if (state.account.workspaceId !== tracking.workspaceId || state.account.status !== "active" || !state.reconciled || state.ledgerBalanceCnyMinor !== state.account.balanceCnyMinor) {
      throw new DomainError("Concilie a conta HubBuy antes de corrigir este crédito.", 409, "BALANCE_RECONCILIATION_REQUIRED");
    }
    const credit = state.entries.find(entry => entry.operationId === refund.creditOperationId && entry.direction === "credit");
    if (!credit) throw new DomainError("O crédito original do reembolso não foi encontrado no ledger.", 409);
    const shareIds = state.shares.filter(share => share.creditEntryId === credit.id);
    const usedShares = new Set(state.consumptions.filter(row => shareIds.some(share => share.id === row.creditShareId) && row.amountCnyMinor > 0).map(row => row.creditShareId));
    if (usedShares.size) throw new DomainError("Este crédito já foi usado. A correção ou anulação precisa de conciliação financeira antes de continuar.", 409, "REFUND_CREDIT_ALREADY_USED");
    const now = new Date(), operationId = crypto.randomUUID(), entryId = crypto.randomUUID();
    const payload = { refundId: refund.id, accountId: state.account.id, reversalOfOperationId: refund.creditOperationId, amountCnyMinor: credit.amountCnyMinor, reason };
    const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    await tx.insert(financialOperations).values({
      id: operationId, workspaceId: tracking.workspaceId, operationType: "refund_credit_reversed", idempotencyKey,
      payloadHash, actorId: userId, occurredAt: now, recordedAt: now, reason, reversalOfId: refund.creditOperationId,
      contextJson: JSON.stringify({ ...payload, entryId }),
    }).run();
    const sequence = state.entries.reduce((max, entry) => Math.max(max, entry.sequence), -1) + 1;
    await tx.insert(hubbuyBalanceEntries).values({
      id: entryId, accountId: state.account.id, operationId, sequence, direction: "debit", amountCnyMinor: credit.amountCnyMinor,
      historicalBrlCents: null, sourceType: "reversal", sourceId: refund.id, reversalOfEntryId: credit.id, createdAt: now,
    }).run();
    const orderedShares = shareIds.sort((a, b) => a.allocationOrder - b.allocationOrder);
    if (orderedShares.length) await tx.insert(hubbuyBalanceConsumptions).values(orderedShares.map((share, allocationOrder) => ({
      id: crypto.randomUUID(), debitEntryId: entryId, creditShareId: share.id, allocationOrder,
      amountCnyMinor: share.amountCnyMinor, historicalBrlCents: share.historicalBrlCents, paymentAllocationId: null, createdAt: now,
    }))).run();
    const priorAllocations = await tx.select().from(purchaseRefundPaymentAllocations).where(eq(purchaseRefundPaymentAllocations.operationId, refund.creditOperationId)).all();
    if (priorAllocations.length) await tx.insert(purchaseRefundPaymentAllocations).values(priorAllocations.map(row => ({ ...row, id: crypto.randomUUID(), operationId }))).run();
    const priorFinancingOffsets = await tx.select().from(memberBalanceFinancingEntries)
      .where(and(eq(memberBalanceFinancingEntries.operationId, refund.receiptOperationId ?? refund.creditOperationId), eq(memberBalanceFinancingEntries.entryType, "refund_offset"))).all();
    if (priorFinancingOffsets.length) await tx.insert(memberBalanceFinancingEntries).values(priorFinancingOffsets.map(row => ({
      id: crypto.randomUUID(), operationId, consumptionId: row.consumptionId, entryType: "reversal" as const,
      lenderId: row.lenderId, beneficiaryId: row.beneficiaryId, amountCnyMinor: row.amountCnyMinor,
      historicalBrlCents: row.historicalBrlCents, settledAmountCents: null, settledCurrency: null,
      occurredAt: now, recordedAt: now,
    }))).run();
    const updated = await tx.update(hubbuyAccounts).set({
      balanceCnyMinor: state.account.balanceCnyMinor - credit.amountCnyMinor,
      revision: state.account.revision + 1, updatedBy: userId, updatedAt: now,
    }).where(and(eq(hubbuyAccounts.id, state.account.id), eq(hubbuyAccounts.revision, state.account.revision), eq(hubbuyAccounts.status, "active"))).returning().get();
    if (!updated) throw new DomainError("A conta HubBuy mudou durante a correção. Atualize a tela e tente novamente.", 409);
    return { operationId, entryId, amountCnyMinor: credit.amountCnyMinor };
  }

  async function startTracking(purchaseId: string) {
    return transact(async tx => {
      const purchase = await authorization(tx, userId).requirePurchase(purchaseId);
      if (purchase.status !== "finalized") throw new DomainError("Finalize a compra antes de iniciar os custos.", 409);
      try { return await initializePurchaseCosts(tx, purchase, userId); }
      catch (error) { if (isUniqueConstraint(error)) { const existing = await tx.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.purchaseId, purchaseId)).get(); if (existing) return existing; } throw error; }
    });
  }

  async function getTracking(id: string) { return readCostTracking(db, userId, id); }
  async function list() { return listCostTrackings(db, userId); }

  async function getAdditionalRefundContext(tx: CostTransaction, trackingId: string, costItem: typeof purchaseItemCosts.$inferSelect) {
    if (await tx.select().from(purchaseOrderCorrections).where(eq(purchaseOrderCorrections.previousOrderId, costItem.orderId)).get()) throw new DomainError("Este pedido foi substituído por uma correção. Atualize a tela.", 409);
    if (!costItem.additionalOrderItemId || costItem.purchaseItemId !== null) throw new DomainError("Este produto não pertence a um pedido adicional.", 409);
    const [order, item, participants, joinedAllocations] = await Promise.all([
      tx.select().from(purchaseCostOrders).where(and(eq(purchaseCostOrders.id, costItem.orderId), eq(purchaseCostOrders.trackingId, trackingId))).get(),
      tx.select().from(purchaseAdditionalOrderItems).where(eq(purchaseAdditionalOrderItems.id, costItem.additionalOrderItemId)).get(),
      tx.select().from(purchaseCostParticipants).where(eq(purchaseCostParticipants.costItemId, costItem.id)).orderBy(asc(purchaseCostParticipants.allocationOrder)).all(),
      tx.select({ allocation: purchasePaymentAllocations, component: purchasePaymentComponents })
        .from(purchasePaymentAllocations).innerJoin(purchasePaymentComponents, eq(purchasePaymentAllocations.componentId, purchasePaymentComponents.id))
        .where(eq(purchasePaymentAllocations.costItemId, costItem.id)).orderBy(asc(purchasePaymentComponents.componentOrder), asc(purchasePaymentAllocations.allocationOrder)).all(),
    ]);
    if (!order || order.kind !== "additional" || order.state !== "recorded" || !item) throw new DomainError("O snapshot do pedido adicional não está registrado.", 409, "ORDER_SNAPSHOT_IMMUTABLE");
    const charge = await tx.select().from(purchaseCostCharges).where(and(eq(purchaseCostCharges.orderId, order.id), eq(purchaseCostCharges.chargeType, "products"))).get();
    if (!charge || charge.paymentStatus !== "paid" || charge.paymentModel !== "components_v1" || !joinedAllocations.length) throw new DomainError("Confirme o pagamento por componentes antes de registrar reembolsos deste pedido.", 409, "REFUND_PRODUCTS_UNRESOLVED");
    const funding = joinedAllocations.map(row => ({
      ...row.allocation,
      sourceType: row.component.sourceType,
      feeBps: row.component.feeBps,
      componentOrder: row.component.componentOrder,
    }));
    const total = (component: "product" | "china", field: "cnyMinor" | "principalBrlCents" | "feeBrlCents" | "historicalBrlCents") =>
      funding.filter(row => row.costComponent === component).reduce((sum, row) => sum + row[field], 0);
    const sharesByPerson = (component: "product" | "china", field: "principalBrlCents" | "feeBrlCents") => {
      const result = new Map<string, number>();
      for (const row of funding) if (row.costComponent === component) result.set(row.personId, (result.get(row.personId) ?? 0) + row[field]);
      return result;
    };
    return {
      order, item, charge, participants, funding,
      productCnyMinor: total("product", "cnyMinor"), chinaCnyMinor: total("china", "cnyMinor"),
      productBrlCents: total("product", "principalBrlCents"), chinaBrlCents: total("china", "principalBrlCents"),
      productFeeCents: total("product", "feeBrlCents"), chinaFeeCents: total("china", "feeBrlCents"),
      productShares: sharesByPerson("product", "principalBrlCents"), chinaShares: sharesByPerson("china", "principalBrlCents"),
      productFeeShares: sharesByPerson("product", "feeBrlCents"), chinaFeeShares: sharesByPerson("china", "feeBrlCents"),
    };
  }

  async function getAdditionalRefundReceiptAllocations(tx: CostTransaction, costItemId: string, excludeRefundId?: string) {
    const received = await tx.select().from(purchaseCostRefunds).where(and(eq(purchaseCostRefunds.costItemId, costItemId), eq(purchaseCostRefunds.status, "received"))).all();
    const operationIds = received.filter(refund => refund.id !== excludeRefundId && refund.receiptOperationId !== null).map(refund => refund.receiptOperationId!);
    return operationIds.length ? tx.select().from(purchaseRefundPaymentAllocations).where(inArray(purchaseRefundPaymentAllocations.operationId, operationIds)).all() : [];
  }

  async function recordAdditionalRefundOperation(tx: CostTransaction, tracking: typeof purchaseCostTrackings.$inferSelect, refund: typeof purchaseCostRefunds.$inferSelect, context: Awaited<ReturnType<typeof getAdditionalRefundContext>>, input: {
    destination: "hubbuy" | "external"; accountId: string | null; productCnyMinor: number; chinaCnyMinor: number;
    productBrlCents: number; chinaBrlCents: number; nativeEvidence: string | null; idempotencyKey: string; operationType: string; reason: string | null; excludeRefundId?: string;
  }) {
    const priorRows = await getAdditionalRefundReceiptAllocations(tx, refund.costItemId, input.excludeRefundId);
    const priorByAllocation = new Map<string, { cny: number; principal: number; historical: number }>();
    const priorByConsumption = new Map<string, { cny: number; principal: number; historical: number }>();
    for (const row of priorRows) {
      if (row.paymentAllocationId) {
        const prior = priorByAllocation.get(row.paymentAllocationId) ?? { cny: 0, principal: 0, historical: 0 };
        prior.cny += row.cnyMinor; prior.principal += row.principalBrlCents; prior.historical += row.historicalBrlCents;
        priorByAllocation.set(row.paymentAllocationId, prior);
      }
      if (row.balanceConsumptionId) {
        const prior = priorByConsumption.get(row.balanceConsumptionId) ?? { cny: 0, principal: 0, historical: 0 };
        prior.cny += row.cnyMinor; prior.principal += row.principalBrlCents; prior.historical += row.historicalBrlCents;
        priorByConsumption.set(row.balanceConsumptionId, prior);
      }
    }
    const requestedByComponent = {
      product: { cny: input.destination === "hubbuy" ? input.productCnyMinor : 0, brl: input.productBrlCents },
      china: { cny: input.destination === "hubbuy" ? input.chinaCnyMinor : 0, brl: input.chinaBrlCents },
    };
    const allocationDrafts: Omit<typeof purchaseRefundPaymentAllocations.$inferInsert, "operationId">[] = [];
    const creditByPerson = new Map<string, { cny: number; historical: number; order: number }>();
    const financingOffsets: { consumptionId: string; lenderId: string; beneficiaryId: string; cnyMinor: number; historicalBrlCents: number }[] = [];
    const shareCredit = (personId: string, cnyMinor: number, historicalBrlCents: number, order: number) => {
      if (!cnyMinor) return;
      const current = creditByPerson.get(personId) ?? { cny: 0, historical: 0, order };
      current.cny += cnyMinor; current.historical += historicalBrlCents; current.order = Math.min(current.order, order);
      creditByPerson.set(personId, current);
    };
    let eventOrder = 0;
    for (const costComponent of ["product", "china"] as const) {
      const requested = requestedByComponent[costComponent];
      const sourceRows = context.funding.filter(row => row.costComponent === costComponent);
      const capacities = sourceRows.map(row => {
        const prior = priorByAllocation.get(row.id) ?? { cny: 0, principal: 0, historical: 0 };
        return {
          row,
          availableCny: row.cnyMinor - prior.cny,
          availablePrincipal: row.principalBrlCents - prior.principal,
          availableHistorical: row.historicalBrlCents - prior.historical,
        };
      });
      if (capacities.some(row => row.availableCny < 0 || row.availablePrincipal < 0 || row.availableHistorical < 0)) throw new DomainError("As devoluções anteriores excedem a alocação histórica deste pedido.", 409, "REFUND_SOURCE_CAPACITY_CORRUPT");
      const availableCny = capacities.reduce((sum, row) => sum + row.availableCny, 0);
      const availablePrincipal = capacities.reduce((sum, row) => sum + row.availablePrincipal, 0);
      if (requested.cny > availableCny || requested.brl > availablePrincipal) throw new DomainError("O recebimento excede a capacidade remanescente das fontes deste componente.", 409, "REFUND_SOURCE_CAPACITY_EXCEEDED");
      const cnyShares = requested.cny ? allocateExactMinor(requested.cny, capacities.map(row => ({ id: row.row.id, order: row.row.allocationOrder, weight: row.availableCny }))) : capacities.map(() => 0);
      const principalShares = requested.brl ? allocateExactMinor(requested.brl, capacities.map(row => ({ id: row.row.id, order: row.row.allocationOrder, weight: row.availablePrincipal }))) : capacities.map(() => 0);
      for (let sourceIndex = 0; sourceIndex < capacities.length; sourceIndex++) {
        const capacity = capacities[sourceIndex], source = capacity.row, sourceCny = cnyShares[sourceIndex], sourcePrincipal = principalShares[sourceIndex];
        const sourceHistorical = input.destination === "hubbuy"
          ? proportionalMinor(capacity.availableHistorical, sourceCny, capacity.availableCny)
          : proportionalMinor(capacity.availableHistorical, sourcePrincipal, capacity.availablePrincipal);
        if (!sourceCny && !sourcePrincipal && !sourceHistorical) continue;
        if (source.sourceType !== "balance") {
          if (input.destination === "hubbuy") shareCredit(source.personId, sourceCny, sourceHistorical, source.allocationOrder);
          allocationDrafts.push({
            id: crypto.randomUUID(), refundId: refund.id, paymentAllocationId: source.id, balanceConsumptionId: null,
            costComponent, sourceType: source.sourceType as "pix" | "card", personId: source.personId, allocationOrder: eventOrder++,
            cnyMinor: sourceCny, principalBrlCents: sourcePrincipal, feeBrlCents: 0, historicalBrlCents: sourceHistorical,
          });
          continue;
        }
        const consumptionRows = await tx.select().from(hubbuyBalanceConsumptions).where(eq(hubbuyBalanceConsumptions.paymentAllocationId, source.id)).orderBy(asc(hubbuyBalanceConsumptions.allocationOrder)).all();
        if (!consumptionRows.length) throw new DomainError("A fonte de saldo não possui vínculos com os lotes consumidos.", 409, "REFUND_SOURCE_GENEALOGY_MISSING");
        const consumptionIds = consumptionRows.map(row => row.id), creditShareIds = consumptionRows.map(row => row.creditShareId);
        const [creditRows, financingRows] = await Promise.all([
          tx.select().from(hubbuyBalanceCreditShares).where(inArray(hubbuyBalanceCreditShares.id, creditShareIds)).all(),
          tx.select().from(memberBalanceFinancingEntries).where(inArray(memberBalanceFinancingEntries.consumptionId, consumptionIds)).all(),
        ]);
        const creditById = new Map(creditRows.map(row => [row.id, row]));
        const priorConsumptionRows = consumptionRows.map(row => {
          const prior = priorByConsumption.get(row.id) ?? { cny: 0, principal: 0, historical: 0 };
          return { row, availableCny: row.amountCnyMinor - prior.cny, availablePrincipal: row.historicalBrlCents - prior.principal, availableHistorical: row.historicalBrlCents - prior.historical };
        });
        if (priorConsumptionRows.some(row => row.availableCny < 0 || row.availablePrincipal < 0 || row.availableHistorical < 0)) throw new DomainError("Uma devolução anterior ultrapassou o lote de saldo consumido.", 409, "REFUND_SOURCE_CAPACITY_CORRUPT");
        const consumptionCnyShares = sourceCny ? allocateExactMinor(sourceCny, priorConsumptionRows.map(row => ({ id: row.row.id, order: row.row.allocationOrder, weight: row.availableCny }))) : priorConsumptionRows.map(() => 0);
        const consumptionHistoricalShares = sourceHistorical ? allocateExactMinor(sourceHistorical, priorConsumptionRows.map(row => ({ id: row.row.id, order: row.row.allocationOrder, weight: row.availableHistorical }))) : priorConsumptionRows.map(() => 0);
        const consumptionPrincipalShares = sourcePrincipal ? allocateExactMinor(sourcePrincipal, priorConsumptionRows.map(row => ({ id: row.row.id, order: row.row.allocationOrder, weight: row.availablePrincipal }))) : priorConsumptionRows.map(() => 0);
        for (let consumptionIndex = 0; consumptionIndex < priorConsumptionRows.length; consumptionIndex++) {
          const capacityRow = priorConsumptionRows[consumptionIndex], consumption = capacityRow.row;
          const consumptionCny = consumptionCnyShares[consumptionIndex], consumptionPrincipal = consumptionPrincipalShares[consumptionIndex], consumptionHistorical = consumptionHistoricalShares[consumptionIndex];
          if (!consumptionCny && !consumptionPrincipal && !consumptionHistorical) continue;
          if (input.destination === "external" || consumptionCny === 0) {
            if (consumptionPrincipal > 0 || consumptionHistorical > 0) allocationDrafts.push({
              id: crypto.randomUUID(), refundId: refund.id, paymentAllocationId: source.id, balanceConsumptionId: consumption.id,
              costComponent, sourceType: "balance", personId: source.personId, allocationOrder: eventOrder++,
              cnyMinor: 0, principalBrlCents: consumptionPrincipal, feeBrlCents: 0, historicalBrlCents: consumptionHistorical,
            });
            continue;
          }
          if (!creditById.has(consumption.creditShareId)) throw new DomainError("O titular original do saldo consumido não existe.", 409, "REFUND_SOURCE_GENEALOGY_MISSING");
          let offsetLeft = consumptionCny, offsetCnyUsed = 0, offsetPrincipalUsed = 0, offsetHistoricalUsed = 0;
          const advances = financingRows.filter(row => row.consumptionId === consumption.id && row.entryType === "advance")
            .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime() || a.id.localeCompare(b.id));
          const visitedAdvances = new Set<string>();
          for (const advance of advances) {
            const pairKey = `${advance.lenderId}:${advance.beneficiaryId}`;
            if (visitedAdvances.has(pairKey)) continue;
            visitedAdvances.add(pairKey);
            const related = financingRows.filter(row => row.consumptionId === consumption.id && row.lenderId === advance.lenderId && row.beneficiaryId === advance.beneficiaryId);
            const advanced = related.filter(row => row.entryType === "advance").reduce((sum, row) => sum + row.amountCnyMinor, 0);
            const settled = related.filter(row => row.entryType === "settlement").reduce((sum, row) => sum + row.amountCnyMinor, 0);
            const priorOffsets = related.filter(row => row.entryType === "refund_offset").reduce((sum, row) => sum + row.amountCnyMinor, 0);
            const restored = related.filter(row => row.entryType === "reversal").reduce((sum, row) => sum + row.amountCnyMinor, 0);
            const open = Math.max(0, advanced - settled - priorOffsets + restored);
            const offsetCny = Math.min(offsetLeft, open);
            if (!offsetCny) continue;
            offsetCnyUsed += offsetCny;
            const cumulativePrincipal = proportionalMinor(consumptionPrincipal, offsetCnyUsed, consumptionCny);
            const cumulativeHistorical = proportionalMinor(consumptionHistorical, offsetCnyUsed, consumptionCny);
            const offsetPrincipal = cumulativePrincipal - offsetPrincipalUsed;
            const offsetHistorical = cumulativeHistorical - offsetHistoricalUsed;
            offsetPrincipalUsed = cumulativePrincipal;
            offsetHistoricalUsed = cumulativeHistorical;
            financingOffsets.push({ consumptionId: consumption.id, lenderId: advance.lenderId, beneficiaryId: advance.beneficiaryId, cnyMinor: offsetCny, historicalBrlCents: offsetHistorical });
            shareCredit(advance.lenderId, offsetCny, offsetHistorical, eventOrder);
            allocationDrafts.push({
              id: crypto.randomUUID(), refundId: refund.id, paymentAllocationId: source.id, balanceConsumptionId: consumption.id,
              costComponent, sourceType: "balance", personId: advance.lenderId, allocationOrder: eventOrder++,
              cnyMinor: offsetCny, principalBrlCents: offsetPrincipal, feeBrlCents: 0, historicalBrlCents: offsetHistorical,
            });
            offsetLeft -= offsetCny;
          }
          const beneficiaryPrincipal = consumptionPrincipal - offsetPrincipalUsed;
          const beneficiaryHistorical = consumptionHistorical - offsetHistoricalUsed;
          if (offsetLeft > 0) shareCredit(source.personId, offsetLeft, beneficiaryHistorical, eventOrder);
          if (offsetLeft > 0 || beneficiaryPrincipal > 0 || beneficiaryHistorical > 0) allocationDrafts.push({
            id: crypto.randomUUID(), refundId: refund.id, paymentAllocationId: source.id, balanceConsumptionId: consumption.id,
            costComponent, sourceType: "balance", personId: source.personId, allocationOrder: eventOrder++,
            cnyMinor: offsetLeft, principalBrlCents: beneficiaryPrincipal, feeBrlCents: 0, historicalBrlCents: beneficiaryHistorical,
          });
        }
      }
    }
    const creditCny = input.productCnyMinor + input.chinaCnyMinor;
    if (input.destination === "hubbuy" && creditCny === 0 && input.productBrlCents + input.chinaBrlCents > 0) throw new DomainError("Um recebimento HubBuy com valor BRL precisa ter crédito CNY correspondente; selecione o destino externo se não entrou saldo.", 409, "REFUND_CNY_REQUIRED");
    if (input.destination === "hubbuy" && creditCny > 0) {
      if (!input.accountId) throw new DomainError("Informe a conta HubBuy para creditar o recebimento.", 400);
      const accountState = await calculateHubBuyBalanceState(tx, input.accountId);
      if (accountState.account.workspaceId !== tracking.workspaceId || accountState.account.status !== "active" || !accountState.reconciled || accountState.ledgerBalanceCnyMinor !== accountState.account.balanceCnyMinor) throw new DomainError("Concilie e ative a conta HubBuy antes de registrar o crédito.", 409, "BALANCE_RECONCILIATION_REQUIRED");
    }
    const now = new Date(), operationId = crypto.randomUUID(), payload = {
      refundId: refund.id, destination: input.destination, accountId: input.accountId,
      productBrlCents: input.productBrlCents, chinaBrlCents: input.chinaBrlCents,
      productCnyMinor: input.productCnyMinor, chinaCnyMinor: input.chinaCnyMinor,
      sourceAllocations: allocationDrafts.map(row => ({ paymentAllocationId: row.paymentAllocationId, balanceConsumptionId: row.balanceConsumptionId, component: row.costComponent, personId: row.personId, cnyMinor: row.cnyMinor, principalBrlCents: row.principalBrlCents, historicalBrlCents: row.historicalBrlCents })),
    };
    const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    await tx.insert(financialOperations).values({
      id: operationId, workspaceId: tracking.workspaceId, operationType: input.operationType, idempotencyKey: input.idempotencyKey,
      payloadHash, actorId: userId, occurredAt: now, recordedAt: now, reason: input.reason, reversalOfId: null, contextJson: JSON.stringify(payload),
    }).run();
    if (allocationDrafts.length) await tx.insert(purchaseRefundPaymentAllocations).values(allocationDrafts.map(row => ({ ...row, operationId }))).run();
    if (financingOffsets.length) await tx.insert(memberBalanceFinancingEntries).values(financingOffsets.map(row => ({
      id: crypto.randomUUID(), operationId, consumptionId: row.consumptionId, entryType: "refund_offset" as const,
      lenderId: row.lenderId, beneficiaryId: row.beneficiaryId, amountCnyMinor: row.cnyMinor, historicalBrlCents: row.historicalBrlCents,
      settledAmountCents: null, settledCurrency: null, occurredAt: now, recordedAt: now,
    }))).run();
    if (input.destination !== "hubbuy" || creditCny === 0) return { operationId, entryId: null, amountCnyMinor: 0 };
    const accountState = await calculateHubBuyBalanceState(tx, input.accountId!);
    const creditShares = [...creditByPerson.entries()].filter(([, share]) => share.cny > 0).sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]));
    if (creditShares.reduce((sum, [, share]) => sum + share.cny, 0) !== creditCny) throw new DomainError("As parcelas do crédito não conciliam com o CNY recebido.", 409, "REFUND_CREDIT_ALLOCATION_MISMATCH");
    const historicalBrlCents = creditShares.reduce((sum, [, share]) => sum + share.historical, 0);
    const entryId = crypto.randomUUID(), sequence = accountState.entries.reduce((max, entry) => Math.max(max, entry.sequence), -1) + 1;
    await tx.insert(hubbuyBalanceEntries).values({ id: entryId, accountId: input.accountId!, operationId, sequence, direction: "credit", amountCnyMinor: creditCny, historicalBrlCents, sourceType: "refund_received", sourceId: refund.id, reversalOfEntryId: null, createdAt: now }).run();
    await tx.insert(hubbuyBalanceCreditShares).values(creditShares.map(([personId, share], allocationOrder) => ({ id: crypto.randomUUID(), creditEntryId: entryId, personId, allocationOrder, amountCnyMinor: share.cny, historicalBrlCents: share.historical }))).run();
    const updatedAccount = await tx.update(hubbuyAccounts).set({ balanceCnyMinor: accountState.account.balanceCnyMinor + creditCny, revision: accountState.account.revision + 1, updatedBy: userId, updatedAt: now })
      .where(and(eq(hubbuyAccounts.id, accountState.account.id), eq(hubbuyAccounts.revision, accountState.account.revision), eq(hubbuyAccounts.status, "active"))).returning().get();
    if (!updatedAccount) throw new DomainError("A conta HubBuy mudou durante o recebimento. Atualize a tela e tente novamente.", 409, "BALANCE_REVISION_CONFLICT");
    return { operationId, entryId, amountCnyMinor: creditCny };
  }

  async function requestRefund(trackingId: string, input: unknown) {
    const value = refundRequestSchema.parse(input);
    return mutate(trackingId, value.expectedRevision, async tx => {
      const item = await tx.select().from(purchaseItemCosts).where(and(eq(purchaseItemCosts.id, value.costItemId), eq(purchaseItemCosts.trackingId, trackingId))).get();
      if (!item) throw new DomainError("Produto não encontrado neste acompanhamento.", 404);
      const additional = item.additionalOrderItemId ? await getAdditionalRefundContext(tx, trackingId, item) : null;
      const original = item.purchaseItemId ? await tx.select().from(purchaseItems).where(eq(purchaseItems.id, item.purchaseItemId)).get() : null;
      if (!original && !additional) throw new DomainError("O snapshot do produto não existe.", 409);
      const quantity = original?.quantity ?? additional!.item.quantity;
      const [activeRefunds, packages, assignments, participants, productCharge, detail] = await Promise.all([
        tx.select().from(purchaseCostRefunds).where(and(eq(purchaseCostRefunds.costItemId, item.id), inArray(purchaseCostRefunds.status, ["requested", "received"]))).orderBy(asc(purchaseCostRefunds.requestedAt), asc(purchaseCostRefunds.id)).all(),
        tx.select().from(purchasePackages).where(eq(purchasePackages.trackingId, trackingId)).all(),
        tx.select().from(purchasePackageItems).all(),
        tx.select().from(purchaseCostParticipants).where(eq(purchaseCostParticipants.costItemId, item.id)).orderBy(asc(purchaseCostParticipants.allocationOrder)).all(),
        tx.select().from(purchaseCostCharges).where(and(eq(purchaseCostCharges.orderId, item.orderId), eq(purchaseCostCharges.chargeType, "products"))).get(),
        readCostTracking(tx, userId, trackingId),
      ]);
      if (!additional && (productCharge?.paymentStatus !== "paid" || detail.calculation.productsCharge.baseCents === null || detail.calculation.productsCharge.feeCents === null)) throw new DomainError("Confirme o pagamento dos produtos e resolva as bases antes de registrar reembolsos.", 409, "REFUND_PRODUCTS_UNRESOLVED");
      if (!additional && (item.effectivePriceState === "pending" || item.chinaFreightState === "pending")) throw new DomainError("Informe ou marque sem cobrança o preço e o frete China antes de solicitar.", 409, "REFUND_PRODUCTS_UNRESOLVED");
      const weights = participants.map(person => ({ personId: person.personId, allocationOrder: person.allocationOrder, weight: person.weight }));
      if (!splitByWeights(1, weights)) throw new DomainError("Defina uma divisão válida para o produto antes de solicitar o reembolso.", 409, "REFUND_COMPOSITION_REQUIRED");
      const alreadyCancelled = activeRefunds.reduce((sum, refund) => sum + refund.quantity, 0);
      const shippingQuantity = quantity - alreadyCancelled;
      if (value.quantity > shippingQuantity) throw new DomainError("A quantidade solicitada excede as unidades ainda enviáveis.", 409, "REFUND_INELIGIBLE_UNITS");
      const unitStart = firstAvailableRefundUnit(activeRefunds.map(refund => ({ unitStart: refund.unitStart, quantity: refund.quantity })), quantity, value.quantity);
      const productTotalCents = additional ? additional.productBrlCents : (item.effectivePriceState === "no_charge" ? 0 : item.effectivePriceUnitCents!) * quantity;
      const chinaTotalCents = additional ? additional.chinaBrlCents : (item.chinaFreightState === "no_charge" ? 0 : item.chinaFreightUnitCents!) * quantity;
      const productCapacity = refundQuantityCapacity(productTotalCents, quantity, unitStart, value.quantity);
      const chinaCapacity = refundQuantityCapacity(chinaTotalCents, quantity, unitStart, value.quantity);
      assertRefundRangeAmounts(value.requestedProductCents, value.requestedChinaCents, productCapacity, chinaCapacity, true);
      const duplicatePackages = new Set(value.packageRemovals.map(row => row.packageId));
      if (duplicatePackages.size !== value.packageRemovals.length || value.packageRemovals.some(row => row.quantity <= 0) || value.packageRemovals.reduce((sum, row) => sum + row.quantity, 0) + value.unassignedQuantity !== value.quantity) throw new DomainError("Informe de quais pacotes e unidades sem pacote sairá exatamente a quantidade cancelada.", 400, "REFUND_REMOVALS_INVALID");
      const packageById = new Map(packages.map(pkg => [pkg.id, pkg]));
      const assignmentsForItem = assignments.filter(row => row.costItemId === item.id);
      const allocatedQuantity = assignmentsForItem.reduce((sum, row) => sum + row.quantity, 0);
      if (allocatedQuantity > shippingQuantity || value.unassignedQuantity > shippingQuantity - allocatedQuantity) throw new DomainError("A quantidade sem pacote informada não está disponível.", 409, "REFUND_INELIGIBLE_UNITS");
      const removalByPackage = new Map(value.packageRemovals.map(row => [row.packageId, row.quantity]));
      const affectedPackages = [] as { id: string; name: string; quantity: number; logisticsStatus: string }[];
      for (const [packageId, quantity] of removalByPackage) {
        const pkg = packageById.get(packageId), assignment = assignmentsForItem.find(row => row.packageId === packageId);
        if (!pkg || !assignment) throw new DomainError("Um pacote selecionado não contém este produto neste acompanhamento.", 403);
        if (pkg.logisticsStatus !== "preparing" || pkg.contentSealSource !== null || pkg.contentSealedAt !== null) throw new DomainError("Só é possível cancelar unidades que ainda estejam em preparação, sem selo e sem pacote enviado.", 409, "REFUND_INELIGIBLE_UNITS");
        if (quantity > assignment.quantity) throw new DomainError("A quantidade retirada excede a quantidade deste produto no pacote.", 409, "REFUND_INELIGIBLE_UNITS");
        affectedPackages.push({ id: pkg.id, name: pkg.name, quantity, logisticsStatus: pkg.logisticsStatus });
      }
      const affectedIds = [...removalByPackage.keys()];
      const affectedAssignments = affectedIds.length ? assignments.filter(row => affectedIds.includes(row.packageId)) : [];
      const nextUnitsByPackage = new Map<string, number>();
      for (const packageId of affectedIds) {
        const remaining = affectedAssignments.reduce((sum, row) => sum + row.quantity - (row.costItemId === item.id ? removalByPackage.get(packageId) ?? 0 : 0), 0);
        nextUnitsByPackage.set(packageId, remaining);
      }
      const affectedCharges = affectedIds.length ? await tx.select().from(purchaseCostCharges).where(inArray(purchaseCostCharges.packageId, affectedIds)).all() : [];
      for (const charge of affectedCharges) {
        const pkgRemaining = nextUnitsByPackage.get(charge.packageId!) ?? 0;
        if (pkgRemaining === 0 && charge.valueState === "known" && (charge.amountCents ?? 0) > 0) throw new DomainError(`${packageById.get(charge.packageId!)?.name ?? "Pacote"}: trate ${charge.chargeType === "customs" ? "a Receita" : "o frete Brasil"} antes de retirar todas as unidades.`, 409, "REFUND_EMPTY_PACKAGE_WITH_CHARGES");
      }
      const productShares = additional ? participants.map(person => additional.productShares.get(person.personId) ?? 0) : splitByWeights(productTotalCents, weights)!;
      const chinaShares = additional ? participants.map(person => additional.chinaShares.get(person.personId) ?? 0) : splitByWeights(chinaTotalCents, weights)!;
      const feeAmount = additional ? additional.productFeeCents + additional.chinaFeeCents : detail.items.find(row => row.id === item.id)?.calculation?.components.find(component => component.name === "Taxa dos produtos")?.amountCents ?? 0;
      const feeShares = additional ? participants.map(person => (additional.productFeeShares.get(person.personId) ?? 0) + (additional.chinaFeeShares.get(person.personId) ?? 0)) : splitByWeights(feeAmount, weights)!;
      const productUnitCents = Math.floor(productTotalCents / quantity), chinaUnitCents = Math.floor(chinaTotalCents / quantity);
      const chargeBaseCents = additional ? productTotalCents + chinaTotalCents : detail.calculation.productsCharge.baseCents!;
      const chargeFeeCents = additional ? feeAmount : detail.calculation.productsCharge.feeCents!;
      const originalPaymentMethod = additional
        ? additional.funding.length > 0 && additional.funding.every(row => row.sourceType === additional.funding[0].sourceType) && (additional.funding[0].sourceType === "pix" || additional.funding[0].sourceType === "card") ? additional.funding[0].sourceType : null
        : productCharge!.paymentMethod;
      const originalFeeBps = additional
        ? originalPaymentMethod ? additional.funding[0].feeBps : null
        : productCharge!.feeBps;
      const now = new Date(), refundId = crypto.randomUUID();
      await tx.insert(purchaseCostRefunds).values({
        id: refundId, trackingId, costItemId: item.id, status: "requested", quantity: value.quantity,
        requestedProductCents: value.requestedProductCents, requestedChinaCents: value.requestedChinaCents,
        receivedProductCents: null, receivedChinaCents: null, reason: value.reason,
        unitStart,
        originalItemQuantity: quantity, originalProductUnitCents: productUnitCents, originalChinaUnitCents: chinaUnitCents,
        originalChargeBaseCents: chargeBaseCents, originalChargeFeeCents: chargeFeeCents,
        originalItemFeeCents: feeAmount, originalPaymentMethod, originalFeeBps,
        originalPaidAt: productCharge!.paidAt, originalPaidBy: productCharge!.paidBy,
        requestedAt: now, requestedBy: userId, receivedAt: null, receivedBy: null, voidedAt: null, voidedBy: null, voidReason: null,
        createdAt: now, updatedAt: now, updatedBy: userId,
      }).run();
      await tx.insert(purchaseCostRefundParticipants).values(participants.map((person, index) => ({
        refundId, personId: person.personId, allocationOrder: person.allocationOrder, weightMode: person.weightMode, weight: person.weight,
        originalProductShareCents: productShares[index], originalChinaShareCents: chinaShares[index], originalProductFeeShareCents: feeShares[index],
      }))).run();
      for (const packageId of affectedIds) {
        const assignment = assignmentsForItem.find(row => row.packageId === packageId)!;
        const remaining = assignment.quantity - (removalByPackage.get(packageId) ?? 0);
        if (remaining === 0) await tx.delete(purchasePackageItems).where(and(eq(purchasePackageItems.packageId, packageId), eq(purchasePackageItems.costItemId, item.id))).run();
        else await tx.update(purchasePackageItems).set({ quantity: remaining }).where(and(eq(purchasePackageItems.packageId, packageId), eq(purchasePackageItems.costItemId, item.id))).run();
        const pkg = packageById.get(packageId)!;
        const contentRevision = pkg.contentRevision + 1;
        await tx.update(purchasePackages).set({ contentRevision, updatedAt: now }).where(and(eq(purchasePackages.id, packageId), eq(purchasePackages.contentRevision, pkg.contentRevision))).run();
        await appendPackageEvent(tx, trackingId, packageId, "content_changed", contentRevision);
      }
      await appendRefundEvent(tx, refundId, userId, "requested", value.reason, {
        quantity: value.quantity, requestedProductCents: value.requestedProductCents, requestedChinaCents: value.requestedChinaCents,
        packageRemovals: affectedPackages, unassignedQuantity: value.unassignedQuantity,
        originalCharge: { baseCents: chargeBaseCents, feeCents: chargeFeeCents, paymentMethod: originalPaymentMethod, feeBps: originalFeeBps },
      });
      return undefined;
    });
  }

  async function updateRefundRequest(trackingId: string, refundId: string, input: unknown) {
    const value = refundValueSchema.parse(input);
    return mutate(trackingId, value.expectedRevision, async tx => {
      const refund = await tx.select().from(purchaseCostRefunds).where(and(eq(purchaseCostRefunds.id, refundId), eq(purchaseCostRefunds.trackingId, trackingId))).get();
      if (!refund || refund.status !== "requested") throw new DomainError("Somente uma solicitação pendente pode ser editada.", 409);
      const item = await tx.select().from(purchaseItemCosts).where(eq(purchaseItemCosts.id, refund.costItemId)).get();
      if (!item) throw new DomainError("Produto do reembolso não encontrado.", 409);
      const additional = item.additionalOrderItemId ? await getAdditionalRefundContext(tx, trackingId, item) : null;
      const capacity = await refundCapacityForPosition(tx, refund,
        additional?.productBrlCents ?? refund.originalProductUnitCents * refund.originalItemQuantity,
        additional?.chinaBrlCents ?? refund.originalChinaUnitCents * refund.originalItemQuantity);
      assertRefundRangeAmounts(value.requestedProductCents, value.requestedChinaCents, capacity.product, capacity.china, true);
      await tx.update(purchaseCostRefunds).set({ requestedProductCents: value.requestedProductCents, requestedChinaCents: value.requestedChinaCents, reason: value.reason, updatedBy: userId, updatedAt: new Date() }).where(eq(purchaseCostRefunds.id, refundId)).run();
      await appendRefundEvent(tx, refundId, userId, "request_updated", value.reason, { before: { productCents: refund.requestedProductCents, chinaCents: refund.requestedChinaCents }, after: { productCents: value.requestedProductCents, chinaCents: value.requestedChinaCents } });
      return undefined;
    });
  }

  async function receiveRefund(trackingId: string, refundId: string, input: unknown) {
    const value = refundReceiptSchema.parse(input);
    return mutate(trackingId, value.expectedRevision, async (tx, tracking) => {
      const refund = await tx.select().from(purchaseCostRefunds).where(and(eq(purchaseCostRefunds.id, refundId), eq(purchaseCostRefunds.trackingId, trackingId))).get();
      if (!refund || refund.status !== "requested") throw new DomainError("Este reembolso não está aguardando recebimento.", 409);
      const costItem = await tx.select().from(purchaseItemCosts).where(eq(purchaseItemCosts.id, refund.costItemId)).get();
      if (!costItem) throw new DomainError("Produto do reembolso não encontrado.", 409);
      const additional = costItem.additionalOrderItemId ? await getAdditionalRefundContext(tx, trackingId, costItem) : null;
      const capacity = await refundCapacityForPosition(tx, refund,
        additional?.productBrlCents ?? refund.originalProductUnitCents * refund.originalItemQuantity,
        additional?.chinaBrlCents ?? refund.originalChinaUnitCents * refund.originalItemQuantity);
      assertRefundRangeAmounts(value.receivedProductCents, value.receivedChinaCents, capacity.product, capacity.china);
      let accountId: string | null = null, receivedProductCnyMinor: number | null = null, receivedChinaCnyMinor: number | null = null, nativeEvidence: string | null = null;
      let credit: { operationId: string; entryId: string | null; amountCnyMinor: number } | null = null;
      let externalOperation: { operationId: string } | null = null;
      if (value.destination === "hubbuy") {
        if (value.receivedProductCnyMinor === undefined || value.receivedProductCnyMinor === null || value.receivedChinaCnyMinor === undefined || value.receivedChinaCnyMinor === null || !value.nativeEvidence) {
          throw new DomainError("Informe os valores CNY efetivamente creditados e a evidência do recebimento HubBuy.", 400, "REFUND_HUBBUY_DATA_REQUIRED");
        }
        const amountCnyMinor = value.receivedProductCnyMinor + value.receivedChinaCnyMinor;
        if (value.newAccountLabel !== undefined) {
          if (amountCnyMinor === 0) throw new DomainError("Um recebimento sem crédito CNY não cria uma conta HubBuy.", 409, "REFUND_ZERO_CREDIT_ACCOUNT_FORBIDDEN");
          const created = await createHubbuyZeroBalanceAccountInTransaction(tx, userId, {
            workspaceId: tracking.workspaceId, idempotencyKey: `refund:${refund.id}:account-created`, label: value.newAccountLabel,
            email: null, confirmZeroBalance: true,
          });
          accountId = created.accountId;
        } else if (value.accountId) {
          accountId = value.accountId;
          const selectedAccount = await tx.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, accountId)).get();
          if (!selectedAccount || selectedAccount.deletedAt || selectedAccount.workspaceId !== tracking.workspaceId) throw new DomainError("A conta HubBuy não pertence a este espaço de trabalho.", 403);
          if (selectedAccount.status === "reconciling") {
            if (amountCnyMinor === 0) throw new DomainError("Um recebimento zerado não ativa uma conta em conciliação.", 409, "REFUND_ZERO_CREDIT_ACCOUNT_FORBIDDEN");
            if (value.confirmedNoPriorBalance !== true || value.expectedAccountRevision === undefined) {
              throw new DomainError("Confirme que esta conta vazia não tinha saldo nem movimentações anteriores.", 409, "ACCOUNT_ZERO_CONFIRMATION_REQUIRED");
            }
            await activateEmptyHubbuyAccountAtZeroInTransaction(tx, userId, accountId, {
              expectedRevision: value.expectedAccountRevision, idempotencyKey: `refund:${refund.id}:activate-empty-zero`, confirmedNoPriorBalance: true,
            });
          } else if (value.confirmedNoPriorBalance || value.expectedAccountRevision !== undefined) {
            throw new DomainError("A confirmação de conta vazia só pode ser usada com uma conta aguardando conciliação.", 409, "ACCOUNT_ZERO_ACTIVATION_INELIGIBLE");
          }
        } else {
          throw new DomainError("Escolha uma conta ativa ou crie uma conta HubBuy para este recebimento.", 400, "REFUND_HUBBUY_ACCOUNT_REQUIRED");
        }
        receivedProductCnyMinor = value.receivedProductCnyMinor;
        receivedChinaCnyMinor = value.receivedChinaCnyMinor;
        nativeEvidence = value.nativeEvidence;
        credit = additional
          ? await recordAdditionalRefundOperation(tx, tracking, refund, additional, {
            destination: "hubbuy", accountId, productCnyMinor: receivedProductCnyMinor, chinaCnyMinor: receivedChinaCnyMinor,
            productBrlCents: value.receivedProductCents, chinaBrlCents: value.receivedChinaCents, nativeEvidence,
            idempotencyKey: `refund:${refund.id}:received`, operationType: "refund_received_hubbuy", reason: nativeEvidence,
          })
          : await createRefundHubBuyCredit(tx, tracking, refund, {
            accountId, productCnyMinor: receivedProductCnyMinor, chinaCnyMinor: receivedChinaCnyMinor,
            productBrlCents: value.receivedProductCents, chinaBrlCents: value.receivedChinaCents,
            idempotencyKey: `refund:${refund.id}:received`, operationType: "refund_received_hubbuy", reason: nativeEvidence,
          });
      } else if ((value.accountId && value.accountId !== null) || value.receivedProductCnyMinor != null || value.receivedChinaCnyMinor != null || value.nativeEvidence) {
        throw new DomainError("Remova os campos de conta e CNY quando o destino do reembolso for externo.", 400, "REFUND_DESTINATION_FIELDS_INVALID");
      } else {
        if (additional) credit = await recordAdditionalRefundOperation(tx, tracking, refund, additional, {
          destination: "external", accountId: null, productCnyMinor: 0, chinaCnyMinor: 0,
          productBrlCents: value.receivedProductCents, chinaBrlCents: value.receivedChinaCents, nativeEvidence: null,
          idempotencyKey: `refund:${refund.id}:received`, operationType: "refund_received_external", reason: null,
        });
        else externalOperation = await recordExternalRefundOperation(tx, tracking, refund, {
          productBrlCents: value.receivedProductCents, chinaBrlCents: value.receivedChinaCents,
          idempotencyKey: `refund:${refund.id}:received`, operationType: "refund_received_external", reason: null,
        });
      }
      const now = new Date();
      await tx.update(purchaseCostRefunds).set({ status: "received", receivedProductCents: value.receivedProductCents, receivedChinaCents: value.receivedChinaCents, refundDestination: value.destination, hubbuyAccountId: accountId, receivedProductCnyMinor, receivedChinaCnyMinor, nativeEvidence, creditOperationId: value.destination === "hubbuy" && credit?.amountCnyMinor ? credit.operationId : null, receiptOperationId: credit?.operationId ?? externalOperation?.operationId ?? null, receivedAt: now, receivedBy: userId, updatedAt: now, updatedBy: userId }).where(and(eq(purchaseCostRefunds.id, refundId), eq(purchaseCostRefunds.status, "requested"))).run();
      await appendRefundEvent(tx, refundId, userId, "received", null, { requested: { productCents: refund.requestedProductCents, chinaCents: refund.requestedChinaCents }, received: { productCents: value.receivedProductCents, chinaCents: value.receivedChinaCents, destination: value.destination, accountId, productCnyMinor: receivedProductCnyMinor, chinaCnyMinor: receivedChinaCnyMinor, nativeEvidence, creditOperationId: credit?.operationId ?? null, entryId: credit?.entryId ?? null, externalOperationId: externalOperation?.operationId ?? null } });
      return undefined;
    }, { replayIf: async tx => {
      const refund = await tx.select().from(purchaseCostRefunds).where(and(eq(purchaseCostRefunds.id, refundId), eq(purchaseCostRefunds.trackingId, trackingId))).get();
      if (!refund || refund.status !== "received") return false;
      const destination = value.destination;
      let expectedAccountId = value.accountId ?? null;
      if (value.newAccountLabel !== undefined && refund.hubbuyAccountId) {
        const account = await tx.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, refund.hubbuyAccountId)).get();
        expectedAccountId = account?.label === value.newAccountLabel ? account.id : null;
        const createOperation = await tx.select().from(financialOperations).where(eq(financialOperations.idempotencyKey, `refund:${refund.id}:account-created`)).get();
        if (!createOperation || createOperation.operationType !== "account_created") expectedAccountId = null;
      }
      const sameReceipt = (refund.refundDestination ?? "external") === destination &&
        (refund.receivedProductCents ?? 0) === value.receivedProductCents && (refund.receivedChinaCents ?? 0) === value.receivedChinaCents &&
        (refund.receivedProductCnyMinor ?? null) === (destination === "hubbuy" ? value.receivedProductCnyMinor ?? null : null) &&
        (refund.receivedChinaCnyMinor ?? null) === (destination === "hubbuy" ? value.receivedChinaCnyMinor ?? null : null) &&
        (refund.nativeEvidence ?? null) === (destination === "hubbuy" ? value.nativeEvidence ?? null : null) &&
        (refund.hubbuyAccountId ?? null) === (destination === "hubbuy" ? expectedAccountId : null);
      if (!sameReceipt) throw new DomainError("Este reembolso já foi recebido com outros dados.", 409, "IDEMPOTENCY_CONFLICT");
      return true;
    } });
  }

  async function correctRefundReceipt(trackingId: string, refundId: string, input: unknown) {
    const value = refundCorrectionSchema.parse(input);
    return mutate(trackingId, value.expectedRevision, async (tx, tracking) => {
      const refund = await tx.select().from(purchaseCostRefunds).where(and(eq(purchaseCostRefunds.id, refundId), eq(purchaseCostRefunds.trackingId, trackingId))).get();
      if (!refund || refund.status !== "received") throw new DomainError("Somente um recebimento registrado pode ser corrigido.", 409);
      const costItem = await tx.select().from(purchaseItemCosts).where(eq(purchaseItemCosts.id, refund.costItemId)).get();
      if (!costItem) throw new DomainError("Produto do reembolso não encontrado.", 409);
      const additional = costItem.additionalOrderItemId ? await getAdditionalRefundContext(tx, trackingId, costItem) : null;
      const capacity = await refundCapacityForPosition(tx, refund,
        additional?.productBrlCents ?? refund.originalProductUnitCents * refund.originalItemQuantity,
        additional?.chinaBrlCents ?? refund.originalChinaUnitCents * refund.originalItemQuantity);
      assertRefundRangeAmounts(value.receivedProductCents, value.receivedChinaCents, capacity.product, capacity.china);
      if (additional) {
        const destination = value.destination ?? refund.refundDestination ?? "external";
        const accountId = destination === "hubbuy" ? value.accountId ?? refund.hubbuyAccountId : null;
        const productCnyMinor = destination === "hubbuy" ? value.receivedProductCnyMinor ?? refund.receivedProductCnyMinor : null;
        const chinaCnyMinor = destination === "hubbuy" ? value.receivedChinaCnyMinor ?? refund.receivedChinaCnyMinor : null;
        const nativeEvidence = destination === "hubbuy" ? value.nativeEvidence ?? refund.nativeEvidence : null;
        if (destination === "hubbuy" && (!accountId || productCnyMinor === null || productCnyMinor === undefined || chinaCnyMinor === null || chinaCnyMinor === undefined || !nativeEvidence)) {
          throw new DomainError("Informe a conta, os valores CNY e a evidência nativa para corrigir um crédito HubBuy.", 400, "REFUND_HUBBUY_DATA_REQUIRED");
        }
        if (destination === "external" && (value.accountId != null || value.receivedProductCnyMinor != null || value.receivedChinaCnyMinor != null || value.nativeEvidence)) {
          throw new DomainError("Remova a conta, os valores CNY e a evidência quando o destino for externo.", 400, "REFUND_DESTINATION_FIELDS_INVALID");
        }
        const receiptChanged = destination !== (refund.refundDestination ?? "external") || accountId !== refund.hubbuyAccountId ||
          value.receivedProductCents !== (refund.receivedProductCents ?? 0) || value.receivedChinaCents !== (refund.receivedChinaCents ?? 0) ||
          productCnyMinor !== refund.receivedProductCnyMinor || chinaCnyMinor !== refund.receivedChinaCnyMinor;
        const reversal = receiptChanged && refund.creditOperationId
          ? await reverseRefundHubBuyCredit(tx, tracking, refund, value.reason, `refund:${refund.id}:correct:${value.expectedRevision + 1}:reverse`)
          : null;
        const replacement = receiptChanged ? await recordAdditionalRefundOperation(tx, tracking, refund, additional, {
          destination, accountId, productCnyMinor: productCnyMinor ?? 0, chinaCnyMinor: chinaCnyMinor ?? 0,
          productBrlCents: value.receivedProductCents, chinaBrlCents: value.receivedChinaCents, nativeEvidence,
          idempotencyKey: `refund:${refund.id}:correct:${value.expectedRevision + 1}:${destination}`, operationType: destination === "hubbuy" ? "refund_receipt_corrected_hubbuy" : "refund_receipt_corrected_external", reason: value.reason,
          excludeRefundId: refund.id,
        }) : null;
        const nextCreditOperationId = destination === "hubbuy" && (replacement?.amountCnyMinor ?? (!receiptChanged && refund.creditOperationId ? 1 : 0)) > 0
          ? replacement?.operationId ?? refund.creditOperationId : null;
        const nextReceiptOperationId = replacement?.operationId ?? refund.receiptOperationId;
        const now = new Date();
        await tx.update(purchaseCostRefunds).set({ receivedProductCents: value.receivedProductCents, receivedChinaCents: value.receivedChinaCents,
          refundDestination: destination, hubbuyAccountId: accountId, receivedProductCnyMinor: productCnyMinor, receivedChinaCnyMinor: chinaCnyMinor,
          nativeEvidence, creditOperationId: nextCreditOperationId, receiptOperationId: nextReceiptOperationId, updatedAt: now, updatedBy: userId })
          .where(and(eq(purchaseCostRefunds.id, refundId), eq(purchaseCostRefunds.status, "received"))).run();
        await appendRefundEvent(tx, refundId, userId, "receipt_corrected", value.reason, {
          before: { productCents: refund.receivedProductCents, chinaCents: refund.receivedChinaCents, destination: refund.refundDestination, accountId: refund.hubbuyAccountId, productCnyMinor: refund.receivedProductCnyMinor, chinaCnyMinor: refund.receivedChinaCnyMinor, creditOperationId: refund.creditOperationId },
          after: { productCents: value.receivedProductCents, chinaCents: value.receivedChinaCents, destination, accountId, productCnyMinor, chinaCnyMinor, nativeEvidence, creditOperationId: nextCreditOperationId },
          reversalOperationId: reversal?.operationId ?? null, replacementEntryId: replacement?.entryId ?? null, replacementOperationId: replacement?.operationId ?? null,
        });
        return undefined;
      }
      assertRefundValues(refund.quantity, value.receivedProductCents, value.receivedChinaCents, refund.originalProductUnitCents, refund.originalChinaUnitCents);
      const other = await tx.select().from(purchaseCostRefunds).where(and(eq(purchaseCostRefunds.costItemId, refund.costItemId), eq(purchaseCostRefunds.status, "received"))).all();
      const productTotal = other.filter(row => row.id !== refundId).reduce((sum, row) => sum + BigInt(row.receivedProductCents ?? 0), 0n) + BigInt(value.receivedProductCents);
      const chinaTotal = other.filter(row => row.id !== refundId).reduce((sum, row) => sum + BigInt(row.receivedChinaCents ?? 0), 0n) + BigInt(value.receivedChinaCents);
      if (productTotal > BigInt(refund.originalProductUnitCents) * BigInt(refund.originalItemQuantity) || chinaTotal > BigInt(refund.originalChinaUnitCents) * BigInt(refund.originalItemQuantity)) throw new DomainError("A correção excede o custo original agregado do componente.", 409, "REFUND_AMOUNT_LIMIT");
      const destination = value.destination ?? refund.refundDestination ?? "external";
      const accountId = destination === "hubbuy" ? value.accountId ?? refund.hubbuyAccountId : null;
      const productCnyMinor = destination === "hubbuy" ? value.receivedProductCnyMinor ?? refund.receivedProductCnyMinor : null;
      const chinaCnyMinor = destination === "hubbuy" ? value.receivedChinaCnyMinor ?? refund.receivedChinaCnyMinor : null;
      const nativeEvidence = destination === "hubbuy" ? value.nativeEvidence ?? refund.nativeEvidence : null;
      if (destination === "hubbuy" && (!accountId || productCnyMinor === null || productCnyMinor === undefined || chinaCnyMinor === null || chinaCnyMinor === undefined || !nativeEvidence)) {
        throw new DomainError("Informe a conta, os valores CNY e a evidência nativa para corrigir um crédito HubBuy.", 400, "REFUND_HUBBUY_DATA_REQUIRED");
      }
      if (destination === "external" && (value.receivedProductCnyMinor != null || value.receivedChinaCnyMinor != null || value.nativeEvidence)) {
        throw new DomainError("Remova os valores CNY e a evidência quando o destino for externo.", 400, "REFUND_DESTINATION_FIELDS_INVALID");
      }
      const creditChanged = refund.creditOperationId !== null && (
        destination !== (refund.refundDestination ?? "external") || accountId !== refund.hubbuyAccountId ||
        value.receivedProductCents !== (refund.receivedProductCents ?? 0) || value.receivedChinaCents !== (refund.receivedChinaCents ?? 0) ||
        productCnyMinor !== refund.receivedProductCnyMinor || chinaCnyMinor !== refund.receivedChinaCnyMinor
      );
      const reversal = creditChanged ? await reverseRefundHubBuyCredit(tx, tracking, refund, value.reason, `refund:${refund.id}:correct:${value.expectedRevision + 1}:reverse`) : null;
      let nextCreditOperationId = creditChanged ? null : refund.creditOperationId;
      let replacementCredit: { operationId: string; entryId: string; amountCnyMinor: number } | null = null;
      if (destination === "hubbuy" && (creditChanged || refund.creditOperationId === null) && (productCnyMinor! + chinaCnyMinor! > 0)) {
        replacementCredit = await createRefundHubBuyCredit(tx, tracking, refund, {
          accountId: accountId!, productCnyMinor: productCnyMinor!, chinaCnyMinor: chinaCnyMinor!,
          productBrlCents: value.receivedProductCents, chinaBrlCents: value.receivedChinaCents,
          idempotencyKey: `refund:${refund.id}:correct:${value.expectedRevision + 1}:credit`, operationType: "refund_receipt_corrected_hubbuy", reason: value.reason,
        });
        nextCreditOperationId = replacementCredit?.operationId ?? null;
      }
      const externalOperation = destination === "external" ? await recordExternalRefundOperation(tx, tracking, refund, {
        productBrlCents: value.receivedProductCents, chinaBrlCents: value.receivedChinaCents,
        idempotencyKey: `refund:${refund.id}:correct:${value.expectedRevision + 1}:external`, operationType: "refund_receipt_corrected_external", reason: value.reason,
      }) : null;
      const now = new Date();
      const nextReceiptOperationId = destination === "external" ? externalOperation?.operationId ?? refund.receiptOperationId : replacementCredit?.operationId ?? (creditChanged ? null : refund.receiptOperationId ?? refund.creditOperationId);
      await tx.update(purchaseCostRefunds).set({ receivedProductCents: value.receivedProductCents, receivedChinaCents: value.receivedChinaCents, refundDestination: destination, hubbuyAccountId: accountId, receivedProductCnyMinor: productCnyMinor, receivedChinaCnyMinor: chinaCnyMinor, nativeEvidence, creditOperationId: nextCreditOperationId, receiptOperationId: nextReceiptOperationId, updatedAt: now, updatedBy: userId }).where(and(eq(purchaseCostRefunds.id, refundId), eq(purchaseCostRefunds.status, "received"))).run();
      await appendRefundEvent(tx, refundId, userId, "receipt_corrected", value.reason, { before: { productCents: refund.receivedProductCents, chinaCents: refund.receivedChinaCents, destination: refund.refundDestination, accountId: refund.hubbuyAccountId, productCnyMinor: refund.receivedProductCnyMinor, chinaCnyMinor: refund.receivedChinaCnyMinor, creditOperationId: refund.creditOperationId }, after: { productCents: value.receivedProductCents, chinaCents: value.receivedChinaCents, destination, accountId, productCnyMinor, chinaCnyMinor, nativeEvidence, creditOperationId: nextCreditOperationId }, reversalOperationId: reversal?.operationId ?? null, replacementEntryId: replacementCredit?.entryId ?? null, externalOperationId: externalOperation?.operationId ?? null });
      return undefined;
    });
  }

  async function voidRefund(trackingId: string, refundId: string, input: unknown) {
    const value = refundVoidSchema.parse(input);
    return mutate(trackingId, value.expectedRevision, async (tx, tracking) => {
      const refund = await tx.select().from(purchaseCostRefunds).where(and(eq(purchaseCostRefunds.id, refundId), eq(purchaseCostRefunds.trackingId, trackingId))).get();
      if (!refund || refund.status === "voided") throw new DomainError("Este reembolso já está anulado ou não existe.", 409);
      const reversal = refund.status === "received" && refund.creditOperationId
        ? await reverseRefundHubBuyCredit(tx, tracking, refund, value.reason, `refund:${refund.id}:void:${value.expectedRevision + 1}`)
        : null;
      const now = new Date();
      await tx.update(purchaseCostRefunds).set({ status: "voided", voidedAt: now, voidedBy: userId, voidReason: value.reason, updatedAt: now, updatedBy: userId }).where(and(eq(purchaseCostRefunds.id, refundId), inArray(purchaseCostRefunds.status, ["requested", "received"]))).run();
      await appendRefundEvent(tx, refundId, userId, "voided", value.reason, { previousStatus: refund.status, releasedQuantity: refund.quantity, removedCreditCents: (refund.receivedProductCents ?? 0) + (refund.receivedChinaCents ?? 0), removedCreditCnyMinor: reversal?.amountCnyMinor ?? 0, reversalOperationId: reversal?.operationId ?? null, quantityReturnsWithoutPackage: true });
      return undefined;
    });
  }

  async function settleAdditionalOrderAdvance(trackingId: string, input: unknown) {
    const value = financingSettlementSchema.parse(input);
    if (value.lenderId === value.beneficiaryId) throw new DomainError("Quem emprestou e quem recebeu o saldo precisam ser pessoas diferentes.", 400);
    const occurredAt = new Date(`${value.occurredOn}T12:00:00.000Z`);
    if (!Number.isFinite(occurredAt.getTime()) || occurredAt.toISOString().slice(0, 10) !== value.occurredOn) throw new DomainError("Informe uma data válida para o acerto.", 400);
    const payload = { trackingId, ...value };
    const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    return transact(async tx => {
      const tracking = await tx.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.id, trackingId)).get();
      if (!tracking) throw new DomainError("Acompanhamento de custos não encontrado.", 404);
      await authorization(tx, userId).requireWorkspaceMember(tracking.workspaceId);
      const prior = await tx.select().from(financialOperations).where(and(eq(financialOperations.workspaceId, tracking.workspaceId), eq(financialOperations.idempotencyKey, value.idempotencyKey))).get();
      if (prior) {
        if (prior.operationType !== "member_advance_settlement" || prior.payloadHash !== payloadHash) throw new DomainError("Esta chave de operação já foi usada com outros dados.", 409, "IDEMPOTENCY_CONFLICT");
        return { operationId: prior.id, replayed: true };
      }
      if (tracking.status !== "open" || tracking.revision !== value.expectedRevision) throw new DomainError("Os custos foram alterados ou encerrados. Atualize a tela.", 409);
      const order = await tx.select().from(purchaseCostOrders).where(and(eq(purchaseCostOrders.id, value.orderId), eq(purchaseCostOrders.trackingId, trackingId))).get();
      if (!order || order.kind !== "additional" || order.state !== "recorded" || !order.accountId) throw new DomainError("A posição não pertence a um pedido adicional registrado.", 409);
      if (await tx.select().from(purchaseOrderCorrections).where(eq(purchaseOrderCorrections.previousOrderId, order.id)).get()) throw new DomainError("O pedido foi corrigido. Atualize a tela.", 409);
      const source = await tx.select({ consumption: hubbuyBalanceConsumptions, allocation: purchasePaymentAllocations, component: purchasePaymentComponents })
        .from(hubbuyBalanceConsumptions)
        .innerJoin(purchasePaymentAllocations, eq(hubbuyBalanceConsumptions.paymentAllocationId, purchasePaymentAllocations.id))
        .innerJoin(purchasePaymentComponents, eq(purchasePaymentAllocations.componentId, purchasePaymentComponents.id))
        .where(and(eq(hubbuyBalanceConsumptions.id, value.consumptionId), eq(purchasePaymentComponents.orderId, order.id))).get();
      if (!source || source.component.sourceType !== "balance") throw new DomainError("A origem desta posição de adiantamento não pertence ao pedido ou não veio de saldo HubBuy.", 403);
      await authorization(tx, userId).requireWorkspaceMembers([value.lenderId, value.beneficiaryId], tracking.workspaceId);
      const entries = await tx.select().from(memberBalanceFinancingEntries).where(eq(memberBalanceFinancingEntries.consumptionId, value.consumptionId)).all();
      const pair = entries.filter(row => row.lenderId === value.lenderId && row.beneficiaryId === value.beneficiaryId);
      const advancedCny = pair.filter(row => row.entryType === "advance").reduce((sum, row) => sum + row.amountCnyMinor, 0);
      const advancedHistorical = pair.filter(row => row.entryType === "advance").reduce((sum, row) => sum + row.historicalBrlCents, 0);
      const settledCny = pair.filter(row => row.entryType === "settlement").reduce((sum, row) => sum + row.amountCnyMinor, 0);
      const settledHistorical = pair.filter(row => row.entryType === "settlement").reduce((sum, row) => sum + row.historicalBrlCents, 0);
      const offsetCny = pair.filter(row => row.entryType === "refund_offset").reduce((sum, row) => sum + row.amountCnyMinor, 0);
      const offsetHistorical = pair.filter(row => row.entryType === "refund_offset").reduce((sum, row) => sum + row.historicalBrlCents, 0);
      const restoredCny = pair.filter(row => row.entryType === "reversal").reduce((sum, row) => sum + row.amountCnyMinor, 0);
      const restoredHistorical = pair.filter(row => row.entryType === "reversal").reduce((sum, row) => sum + row.historicalBrlCents, 0);
      const openCny = advancedCny - settledCny - offsetCny + restoredCny;
      const openHistorical = advancedHistorical - settledHistorical - offsetHistorical + restoredHistorical;
      if (openCny < 0 || openHistorical < 0) throw new DomainError("A posição tem um histórico de acertos inconsistente.", 409, "FINANCING_POSITION_CORRUPT");
      if (value.amountCnyMinor > openCny) throw new DomainError("O acerto supera a posição CNY ainda aberta.", 409, "FINANCING_SETTLEMENT_EXCEEDS_OPEN");
      const historicalBrlCents = proportionalMinor(openHistorical, value.amountCnyMinor, openCny);
      const now = new Date(), operationId = crypto.randomUUID();
      await tx.insert(financialOperations).values({
        id: operationId, workspaceId: tracking.workspaceId, operationType: "member_advance_settlement", idempotencyKey: value.idempotencyKey,
        payloadHash, actorId: userId, occurredAt, recordedAt: now, reason: value.reason, reversalOfId: null,
        contextJson: JSON.stringify({ ...payload, historicalBrlCents }),
      }).run();
      await tx.insert(memberBalanceFinancingEntries).values({
        id: crypto.randomUUID(), operationId, consumptionId: value.consumptionId, entryType: "settlement",
        lenderId: value.lenderId, beneficiaryId: value.beneficiaryId, amountCnyMinor: value.amountCnyMinor,
        historicalBrlCents, settledAmountCents: value.settledAmountMinor, settledCurrency: value.settledCurrency,
        occurredAt, recordedAt: now,
      }).run();
      const updated = await tx.update(purchaseCostTrackings).set({ revision: tracking.revision + 1, updatedBy: userId, updatedAt: now })
        .where(and(eq(purchaseCostTrackings.id, trackingId), eq(purchaseCostTrackings.revision, value.expectedRevision), eq(purchaseCostTrackings.status, "open"))).returning().get();
      if (!updated) throw new DomainError("Os custos foram alterados em outra sessão. Atualize a tela.", 409);
      return { operationId, replayed: false, openCnyMinor: openCny - value.amountCnyMinor };
    });
  }

  async function getSettings() {
    const membership = await authorization(db, userId).requireWorkspaceMember();
    const value = await db.select().from(workspaceCostSettings).where(eq(workspaceCostSettings.workspaceId, membership.workspaceId)).get();
    return { workspaceId: membership.workspaceId, pixBps: value?.pixBps ?? 100, cardBps: value?.cardBps ?? 500, updatedAt: value?.updatedAt ?? null, updatedBy: value?.updatedBy ?? null };
  }

  async function saveSettings(input: unknown) {
    const value = z.object({ pixBps: z.number().int().min(0).max(10_000), cardBps: z.number().int().min(0).max(10_000) }).strict().parse(input);
    return transact(async tx => {
      const { workspaceId } = await authorization(tx, userId).requireWorkspaceMember();
      const now = new Date();
      await tx.insert(workspaceCostSettings).values({ workspaceId, ...value, updatedBy: userId, updatedAt: now }).onConflictDoUpdate({ target: workspaceCostSettings.workspaceId, set: { ...value, updatedBy: userId, updatedAt: now } }).run();
      return { workspaceId, ...value, updatedBy: userId, updatedAt: now };
    });
  }

  async function saveItemCosts(trackingId: string, input: unknown) {
    const value = itemCostSchema.parse(input);
    assertValueState(value.effectivePriceState, value.effectivePriceUnitCents, "o preço efetivo");
    assertValueState(value.chinaFreightState, value.chinaFreightUnitCents, "o frete China");
    return mutate(trackingId, value.expectedRevision, async tx => {
      const costItem = await tx.select().from(purchaseItemCosts).where(and(eq(purchaseItemCosts.id, value.itemId), eq(purchaseItemCosts.trackingId, trackingId))).get();
      if (!costItem) throw new DomainError("Produto não encontrado neste acompanhamento.", 404);
      if (costItem.additionalOrderItemId) {
        const order = await tx.select().from(purchaseCostOrders).where(eq(purchaseCostOrders.id, costItem.orderId)).get();
        if (!order || order.state !== "draft") throw new DomainError("O snapshot de um pedido registrado é imutável.", 409, "ORDER_SNAPSHOT_IMMUTABLE");
      }
      const changed = costItem.effectivePriceState !== value.effectivePriceState || costItem.effectivePriceUnitCents !== value.effectivePriceUnitCents || costItem.chinaFreightState !== value.chinaFreightState || costItem.chinaFreightUnitCents !== value.chinaFreightUnitCents;
      const activeRefunds = await tx.select().from(purchaseCostRefunds).where(and(eq(purchaseCostRefunds.trackingId, trackingId), inArray(purchaseCostRefunds.status, ["requested", "received"]))).all();
      const currentComposition = await tx.select().from(purchaseCostParticipants).where(eq(purchaseCostParticipants.costItemId, costItem.id)).orderBy(asc(purchaseCostParticipants.allocationOrder)).all();
      const compositionChanged = !!value.composition && (value.composition.mode !== currentComposition[0]?.weightMode || value.composition.participants.length !== currentComposition.length || value.composition.participants.some((person, index) => person.personId !== currentComposition[index]?.personId || (value.composition!.mode === "equal" ? 1 : person.weight) !== currentComposition[index]?.weight));
      const itemHasActiveRefund = activeRefunds.some(refund => refund.costItemId === costItem.id);
      if (activeRefunds.length && changed) throw new DomainError("As bases dos produtos estão protegidas enquanto houver reembolso não anulado. Anule os reembolsos antes de corrigir esses valores.", 409, "REFUND_PRODUCTS_LOCKED");
      if (itemHasActiveRefund && compositionChanged) throw new DomainError("A divisão deste produto está protegida enquanto houver reembolso não anulado. Anule seus reembolsos antes de alterar a composição.", 409, "REFUND_PRODUCTS_LOCKED");
      const productsCharge = await tx.select().from(purchaseCostCharges).where(and(eq(purchaseCostCharges.orderId, costItem.orderId), eq(purchaseCostCharges.chargeType, "products"))).get();
      if (changed && productsCharge?.paymentStatus === "paid" && !value.confirmPaymentReset) throw new DomainError("A cobrança dos produtos está marcada como paga. Confirme a edição para voltar o pagamento a pendente.", 409);
      await tx.update(purchaseItemCosts).set({ effectivePriceState: value.effectivePriceState, effectivePriceUnitCents: value.effectivePriceUnitCents, chinaFreightState: value.chinaFreightState, chinaFreightUnitCents: value.chinaFreightUnitCents }).where(eq(purchaseItemCosts.id, costItem.id)).run();
      if (changed && productsCharge?.paymentStatus === "paid") await tx.update(purchaseCostCharges).set({ paymentStatus: "pending", paidAt: null, paidBy: null, updatedAt: new Date() }).where(eq(purchaseCostCharges.id, productsCharge.id)).run();
      if (value.composition) {
        const current = await tx.select().from(purchaseCostParticipants).where(eq(purchaseCostParticipants.costItemId, costItem.id)).orderBy(asc(purchaseCostParticipants.allocationOrder)).all();
        const submittedIds = value.composition.participants.map(person => person.personId);
        if (submittedIds.length !== current.length || new Set(submittedIds).size !== submittedIds.length || current.some(person => !submittedIds.includes(person.personId))) throw new DomainError("A composição deve manter as mesmas pessoas da compra finalizada.");
        const weights = value.composition.mode === "equal" ? value.composition.participants.map(() => 1) : value.composition.participants.map(person => person.weight);
        if (value.composition.mode === "percentage" && weights.reduce((sum, weight) => sum + weight, 0) !== 10_000) throw new DomainError("Os percentuais precisam somar 100%.");
        if (value.composition.mode === "fixed" && weights.every(weight => weight === 0)) throw new DomainError("Informe uma composição positiva para distribuir os custos.");
        const nextRows = value.composition.participants.map((person, allocationOrder) => ({ costItemId: costItem.id, personId: person.personId, allocationOrder, weightMode: value.composition!.mode, weight: weights[allocationOrder] }));
        await tx.delete(purchaseCostParticipants).where(eq(purchaseCostParticipants.costItemId, costItem.id)).run();
        await tx.insert(purchaseCostParticipants).values(nextRows).run();
      }
      return undefined;
    });
  }

  async function createPackage(trackingId: string, input: unknown) {
    const value = z.object({ expectedRevision: revisionSchema, name: z.string().trim().min(1).max(80) }).strict().parse(input);
    return mutate(trackingId, value.expectedRevision, async tx => {
      const existing = await tx.select({ order: purchasePackages.packageOrder }).from(purchasePackages).where(eq(purchasePackages.trackingId, trackingId)).orderBy(asc(purchasePackages.packageOrder)).all();
      const packageOrder = existing.reduce((max, row) => Math.max(max, row.order), -1) + 1, now = new Date(), packageId = crypto.randomUUID();
      await tx.insert(purchasePackages).values({ id: packageId, trackingId, name: value.name, packageOrder, logisticsStatus: "preparing", createdAt: now, updatedAt: now }).run();
      await tx.insert(purchaseCostCharges).values([
        { id: crypto.randomUUID(), trackingId, packageId, chargeType: "brazil_freight", valueState: "pending", amountCents: null, paymentMethod: null, feeBps: null, paymentStatus: "pending", paidAt: null, paidBy: null, createdAt: now, updatedAt: now },
        { id: crypto.randomUUID(), trackingId, packageId, chargeType: "customs", valueState: "pending", amountCents: null, paymentMethod: null, feeBps: null, paymentStatus: "pending", paidAt: null, paidBy: null, createdAt: now, updatedAt: now },
      ]).run();
      return undefined;
    });
  }

  async function deletePackage(trackingId: string, packageId: string, input: unknown) {
    const value = z.object({ expectedRevision: revisionSchema }).strict().parse(input);
    return mutate(trackingId, value.expectedRevision, async tx => {
      const pkg = await tx.select().from(purchasePackages).where(and(eq(purchasePackages.id, packageId), eq(purchasePackages.trackingId, trackingId))).get();
      if (!pkg) throw new DomainError("Pacote não encontrado.", 404);
      const [assignments, charges, contentEvents] = await Promise.all([
        tx.select().from(purchasePackageItems).where(eq(purchasePackageItems.packageId, packageId)).all(),
        tx.select().from(purchaseCostCharges).where(eq(purchaseCostCharges.packageId, packageId)).all(),
        tx.select({ id: purchaseCostPackageEvents.id }).from(purchaseCostPackageEvents).where(eq(purchaseCostPackageEvents.packageId, packageId)).all(),
      ]);
      if (pkg.logisticsStatus !== "preparing" || assignments.length || contentEvents.length || charges.some(charge => charge.paymentStatus === "paid" || charge.valueState !== "pending")) throw new DomainError("Só é possível excluir um pacote vazio, sem histórico de conteúdo, em preparação e com cobranças pendentes.", 409);
      await tx.delete(purchaseCostCharges).where(eq(purchaseCostCharges.packageId, packageId)).run();
      await tx.delete(purchasePackages).where(eq(purchasePackages.id, packageId)).run();
      return undefined;
    });
  }

  async function saveAllocations(trackingId: string, input: unknown) {
    const value = allocationSchema.parse(input);
    return mutate(trackingId, value.expectedRevision, async tx => {
      const [packages, costItems, orders, assignments, activeRefunds] = await Promise.all([
        tx.select().from(purchasePackages).where(eq(purchasePackages.trackingId, trackingId)).all(),
        tx.select().from(purchaseItemCosts).where(eq(purchaseItemCosts.trackingId, trackingId)).orderBy(asc(purchaseItemCosts.itemOrder)).all(),
        tx.select().from(purchaseCostOrders).where(eq(purchaseCostOrders.trackingId, trackingId)).all(),
        tx.select().from(purchasePackageItems).all(),
        tx.select().from(purchaseCostRefunds).where(and(eq(purchaseCostRefunds.trackingId, trackingId), inArray(purchaseCostRefunds.status, ["requested", "received"]))).all(),
      ]);
      const packagesById = new Map(packages.map(pkg => [pkg.id, pkg]));
      const costItemsById = new Map(costItems.map(item => [item.id, item]));
      const ordersById = new Map(orders.map(order => [order.id, order]));
      const orderRank = new Map([...orders].sort((left, right) => {
        const kindOrder = Number(left.kind !== "original") - Number(right.kind !== "original");
        if (kindOrder) return kindOrder;
        const dateOrder = (left.createdAt?.getTime() ?? 0) - (right.createdAt?.getTime() ?? 0);
        return dateOrder || left.id.localeCompare(right.id);
      }).map((order, index) => [order.id, index]));
      const packageOrderedCostItems = [...costItems].sort((left, right) =>
        (orderRank.get(left.orderId) ?? 0) - (orderRank.get(right.orderId) ?? 0)
        || left.itemOrder - right.itemOrder
        || left.id.localeCompare(right.id),
      );
      const pkg = packagesById.get(value.packageId);
      if (!pkg) throw new DomainError("O pacote não pertence a este acompanhamento.", 403);
      if (pkg.logisticsStatus !== "preparing" || pkg.contentSealSource !== null || pkg.contentSealedAt !== null) throw new DomainError("O conteúdo de um pacote enviado ou selado não pode ser alterado.", 409, "PACKAGE_CONTENT_SEALED");
      const duplicateItems = new Set(value.allocations.map(row => row.costItemId));
      if (duplicateItems.size !== value.allocations.length) throw new DomainError("Há produtos repetidos na alocação.");
      const cancelledByItem = new Map<string, number>();
      for (const refund of activeRefunds) cancelledByItem.set(refund.costItemId, (cancelledByItem.get(refund.costItemId) ?? 0) + refund.quantity);
      const desired = new Map<string, number>();
      let selectedAccountId: string | null = null;
      for (const row of value.allocations) {
        const costItem = costItemsById.get(row.costItemId);
        if (!pkg || !costItem) throw new DomainError("A alocação referencia um pacote ou produto de outra compra.", 403);
        if (costItem.additionalOrderItemId && row.quantity > 0) {
          if (await tx.select().from(purchaseOrderCorrections).where(eq(purchaseOrderCorrections.previousOrderId, costItem.orderId)).get()) throw new DomainError("Este pedido foi corrigido. Atualize a tela antes de alocar unidades.", 409);
          const order = ordersById.get(costItem.orderId);
          if (!order || order.trackingId !== trackingId || order.kind !== "additional" || order.state !== "recorded") throw new DomainError("Somente pedidos adicionais registrados podem entrar em um pacote.", 409, "ORDER_NOT_ALLOCATABLE");
          if (!order.accountId) throw new DomainError("O pedido adicional não tem uma conta HubBuy registrada.", 409, "PACKAGE_ACCOUNT_REQUIRED");
          if (selectedAccountId && selectedAccountId !== order.accountId || pkg.accountId && pkg.accountId !== order.accountId) {
            throw new DomainError("Este pacote só pode receber pedidos da mesma conta HubBuy.", 409, "PACKAGE_ACCOUNT_MISMATCH");
          }
          selectedAccountId = order.accountId;
        }
        desired.set(row.costItemId, row.quantity);
      }
      const originalItems = costItems.some(item => item.purchaseItemId !== null) ? await tx.select().from(purchaseItems).where(inArray(purchaseItems.id, costItems.flatMap(item => item.purchaseItemId ? [item.purchaseItemId] : []))).all() : [];
      const additionalItems = costItems.some(item => item.additionalOrderItemId !== null) ? await tx.select().from(purchaseAdditionalOrderItems).where(inArray(purchaseAdditionalOrderItems.id, costItems.flatMap(item => item.additionalOrderItemId ? [item.additionalOrderItemId] : []))).all() : [];
      const originalById = new Map(originalItems.map(item => [item.id, item]));
      const additionalById = new Map(additionalItems.map(item => [item.id, item]));
      const quantityByCostItem = new Map(costItems.map(item => {
        const original = item.purchaseItemId ? originalById.get(item.purchaseItemId) : null;
        const additional = item.additionalOrderItemId ? additionalById.get(item.additionalOrderItemId) : null;
        if (!original && !additional) throw new DomainError("O snapshot do produto não existe.", 409);
        return [item.id, (original ?? additional)!.quantity] as const;
      }));
      for (const [costItemId, quantity] of desired) {
        const costItem = costItemsById.get(costItemId)!;
        const usedInOtherPackages = assignments.filter(row => row.costItemId === costItemId && row.packageId !== pkg.id).reduce((sum, row) => sum + row.quantity, 0);
        const next = usedInOtherPackages + quantity;
        if (next > quantityByCostItem.get(costItem.id)! - (cancelledByItem.get(costItemId) ?? 0)) throw new DomainError("A quantidade alocada excede as unidades disponíveis para envio.", 409, "REFUND_INELIGIBLE_UNITS");
      }
      const currentForPackage = assignments.filter(row => row.packageId === pkg.id);
      const currentByItem = new Map(currentForPackage.map(row => [row.costItemId, row.quantity]));
      const changed = costItems.some(item => (currentByItem.get(item.id) ?? 0) !== (desired.get(item.id) ?? 0));
      const bindAccount = selectedAccountId !== null && pkg.accountId === null;
      if (!changed && !bindAccount) return undefined;
      await tx.delete(purchasePackageItems).where(eq(purchasePackageItems.packageId, pkg.id)).run();
      let allocationOrder = 0;
      const rows = packageOrderedCostItems.flatMap(costItem => {
        const quantity = desired.get(costItem.id) ?? 0;
        return quantity ? [{ packageId: pkg.id, costItemId: costItem.id, quantity, allocationOrder: allocationOrder++ }] : [];
      });
      if (rows.length) await tx.insert(purchasePackageItems).values(rows).run();
      const now = new Date();
      const contentRevision = pkg.contentRevision + 1;
      await tx.update(purchasePackages).set({ accountId: selectedAccountId ?? pkg.accountId, contentRevision, updatedAt: now }).where(and(eq(purchasePackages.id, pkg.id), eq(purchasePackages.contentRevision, pkg.contentRevision))).run();
      await appendPackageEvent(tx, trackingId, pkg.id, "content_changed", contentRevision);
      return undefined;
    });
  }

  async function savePackage(trackingId: string, packageId: string, input: unknown) {
    const value = z.object({ expectedRevision: revisionSchema, name: z.string().trim().min(1).max(80), logisticsStatus: z.enum(["preparing", "sent", "received"]) }).strict().parse(input);
    return mutate(trackingId, value.expectedRevision, async tx => {
      const current = await tx.select().from(purchasePackages).where(and(eq(purchasePackages.id, packageId), eq(purchasePackages.trackingId, trackingId))).get();
      if (!current) throw new DomainError("Pacote não encontrado.", 404);
      const now = new Date();
      const newlySealed = current.contentSealSource === null && (value.logisticsStatus !== "preparing" || current.logisticsStatus !== "preparing");
      const updated = await tx.update(purchasePackages).set({
        name: value.name, logisticsStatus: value.logisticsStatus, updatedAt: now,
        ...(newlySealed ? { contentSealedAt: now, contentSealedBy: userId, contentSealSource: "user" as const, contentRevision: current.contentRevision + 1 } : {}),
      }).where(and(eq(purchasePackages.id, packageId), eq(purchasePackages.trackingId, trackingId))).returning().get();
      if (!updated) throw new DomainError("Pacote não encontrado.", 404);
      if (newlySealed) await appendPackageEvent(tx, trackingId, packageId, "content_sealed", updated.contentRevision);
      return undefined;
    });
  }

  async function unsealPackageContent(trackingId: string, packageId: string, input: unknown) {
    const value = z.object({ expectedRevision: revisionSchema, reason: reasonSchema }).strict().parse(input);
    return mutate(trackingId, value.expectedRevision, async tx => {
      const pkg = await tx.select().from(purchasePackages).where(and(eq(purchasePackages.id, packageId), eq(purchasePackages.trackingId, trackingId))).get();
      if (!pkg) throw new DomainError("Pacote não encontrado.", 404);
      if (pkg.logisticsStatus !== "preparing") throw new DomainError("Só é possível reabrir o conteúdo de um pacote ainda em preparação.", 409, "PACKAGE_CONTENT_NOT_PRE_SEND");
      if (pkg.contentSealSource === null) throw new DomainError("O conteúdo deste pacote já está aberto.", 409);
      const now = new Date(), contentRevision = pkg.contentRevision + 1;
      const updated = await tx.update(purchasePackages).set({ contentSealedAt: null, contentSealedBy: null, contentSealSource: null, contentRevision, updatedAt: now })
        .where(and(eq(purchasePackages.id, packageId), eq(purchasePackages.contentRevision, pkg.contentRevision))).returning().get();
      if (!updated) throw new DomainError("O conteúdo do pacote mudou. Atualize a tela e tente novamente.", 409);
      await appendPackageEvent(tx, trackingId, packageId, "content_unsealed", contentRevision, value.reason);
      return undefined;
    });
  }

  async function saveCharge(trackingId: string, chargeId: string, input: unknown) {
    const value = chargeSchema.parse(input);
    return mutate(trackingId, value.expectedRevision, async tx => {
      const charge = await tx.select().from(purchaseCostCharges).where(and(eq(purchaseCostCharges.id, chargeId), eq(purchaseCostCharges.trackingId, trackingId), eq(purchaseCostCharges.chargeType, value.chargeType))).get();
      if (!charge) throw new DomainError("Cobrança não encontrada neste acompanhamento.", 404);
      if (value.chargeType === "products" && charge.paymentModel === "components_v1") throw new DomainError("O pagamento por componentes é um registro imutável; edite o rascunho antes de pagar ou use uma compensação.", 409, "PAYMENT_SNAPSHOT_IMMUTABLE");
      let next = { valueState: charge.valueState, amountCents: charge.amountCents, paymentMethod: charge.paymentMethod, feeBps: charge.feeBps };
      if (value.chargeType === "products") {
        const feeBps = value.paymentMethod === null ? null : value.feeBps ?? (await tx.select().from(workspaceCostSettings).where(eq(workspaceCostSettings.workspaceId, (await tx.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.id, trackingId)).get())!.workspaceId)).get())?.[value.paymentMethod === "pix" ? "pixBps" : "cardBps"] ?? (value.paymentMethod === "pix" ? 100 : 500);
        if (value.paymentMethod === null && value.feeBps != null) throw new DomainError("Escolha um método para configurar a taxa.");
        next = { ...next, paymentMethod: value.paymentMethod, feeBps };
      } else if (value.chargeType === "brazil_freight") {
        assertValueState(value.valueState, value.amountCents, "o frete Brasil");
        const feeBps = value.valueState === "no_charge" || value.paymentMethod === null ? null : value.feeBps ?? (await tx.select().from(workspaceCostSettings).where(eq(workspaceCostSettings.workspaceId, (await tx.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.id, trackingId)).get())!.workspaceId)).get())?.[value.paymentMethod === "pix" ? "pixBps" : "cardBps"] ?? (value.paymentMethod === "pix" ? 100 : 500);
        if (value.paymentMethod === null && value.feeBps != null) throw new DomainError("Escolha um método para configurar a taxa.");
        if (value.valueState === "no_charge" && value.paymentMethod !== null) throw new DomainError("Frete sem cobrança não possui método de pagamento.");
        next = { valueState: value.valueState, amountCents: value.amountCents, paymentMethod: value.paymentMethod, feeBps };
      } else {
        assertValueState(value.valueState, value.amountCents, "a Receita");
        next = { valueState: value.valueState, amountCents: value.amountCents, paymentMethod: null, feeBps: null };
      }
      const changed = next.valueState !== charge.valueState || next.amountCents !== charge.amountCents || next.paymentMethod !== charge.paymentMethod || next.feeBps !== charge.feeBps;
      if (value.chargeType === "products" && changed) {
        const activeRefund = await tx.select({ id: purchaseCostRefunds.id }).from(purchaseCostRefunds).where(and(eq(purchaseCostRefunds.trackingId, trackingId), inArray(purchaseCostRefunds.status, ["requested", "received"]))).get();
        if (activeRefund) throw new DomainError("Método e taxa originais dos produtos estão protegidos enquanto houver reembolso não anulado.", 409, "REFUND_PRODUCTS_LOCKED");
      }
      if (changed && charge.paymentStatus === "paid" && !value.confirmPaymentReset) throw new DomainError("Esta cobrança está marcada como paga. Confirme a edição para voltar o pagamento a pendente.", 409);
      await tx.update(purchaseCostCharges).set({ ...next, paymentStatus: changed && charge.paymentStatus === "paid" ? "pending" : charge.paymentStatus, paidAt: changed && charge.paymentStatus === "paid" ? null : charge.paidAt, paidBy: changed && charge.paymentStatus === "paid" ? null : charge.paidBy, updatedAt: new Date() }).where(eq(purchaseCostCharges.id, chargeId)).run();
      return undefined;
    });
  }

  async function markChargePaid(trackingId: string, chargeId: string, input: unknown) {
    const value = z.object({ expectedRevision: revisionSchema }).strict().parse(input);
    return mutate(trackingId, value.expectedRevision, async tx => {
      const charge = await tx.select().from(purchaseCostCharges).where(and(eq(purchaseCostCharges.id, chargeId), eq(purchaseCostCharges.trackingId, trackingId))).get();
      if (!charge) throw new DomainError("Cobrança não encontrada neste acompanhamento.", 404);
      if (charge.chargeType === "products" && charge.paymentModel === "components_v1") throw new DomainError("Este pedido precisa ser registrado pela confirmação de pagamento por componentes.", 409, "PAYMENT_COMPONENT_FLOW_REQUIRED");
      if (charge.paymentStatus === "paid") throw new DomainError("Esta cobrança já está marcada como paga.", 409);
      const detail = await readCostTracking(tx, userId, trackingId);
      if (charge.chargeType === "products") {
        if (detail.calculation.productsCharge.totalCents === null) throw new DomainError("Resolva todos os preços e fretes China e escolha o método antes de confirmar o pagamento.", 409);
        if (detail.calculation.productsCharge.baseCents! > 0 && (charge.paymentMethod === null || charge.feeBps === null)) throw new DomainError("Escolha o método de pagamento dos produtos.", 409);
      } else if (charge.chargeType === "brazil_freight") {
        if (charge.valueState !== "known") throw new DomainError("Informe o frete Brasil antes de confirmar o pagamento.", 409);
        const pkg = detail.packages.find(item => item.id === charge.packageId);
        const freightPaymentTotal = pkg?.calculation?.freightPaymentTotalCents;
        if (freightPaymentTotal === null || freightPaymentTotal === undefined) throw new DomainError("Configure a taxa de pagamento do frete Brasil.", 409);
        if ((charge.amountCents ?? 0) > 0 && (charge.paymentMethod === null || charge.feeBps === null)) throw new DomainError("Escolha o método de pagamento do frete Brasil.", 409);
      } else {
        if (charge.valueState !== "known") throw new DomainError(charge.valueState === "no_charge" ? "Uma cobrança sem valor não precisa ser paga." : "Informe a Receita antes de confirmar o pagamento.", 409);
      }
      await tx.update(purchaseCostCharges).set({ paymentStatus: "paid", paidAt: new Date(), paidBy: userId, updatedAt: new Date() }).where(eq(purchaseCostCharges.id, chargeId)).run();
      return undefined;
    });
  }

  async function closeTracking(trackingId: string, input: unknown) {
    const value = z.object({ expectedRevision: revisionSchema, confirmed: z.literal(true) }).strict().parse(input);
    return mutate(trackingId, value.expectedRevision, async tx => {
      const detail = await readCostTracking(tx, userId, trackingId);
      const blockers: string[] = [];
      if (detail.calculation.summary.assignedUnits !== detail.calculation.summary.shippingUnits) blockers.push("Atribua todas as unidades enviáveis a pacotes.");
      if (detail.refundsSummary.requestedCount > 0) blockers.push("Registre o recebimento ou anule as solicitações de reembolso pendentes.");
      if (detail.items.some(item => item.effectivePriceState === "pending" || item.chinaFreightState === "pending")) blockers.push("Informe o preço efetivo e o frete China ou marque sem cobrança.");
      if (detail.items.some(item => item.participants.reduce((sum, participant) => sum + participant.weight, 0) <= 0)) blockers.push("Defina uma composição positiva para cada produto e pessoa.");
      if (!detail.productsCharge || detail.calculation.productsCharge.totalCents === null || detail.productsCharge.paymentStatus !== "paid") blockers.push("Confirme o pagamento dos produtos.");
      for (const pkg of detail.packages) {
        const freight = pkg.brazilFreightCharge, customs = pkg.customsCharge;
        if (!freight || freight.valueState === "pending") blockers.push(`${pkg.name}: informe ou isente o frete Brasil.`);
        else if (freight.valueState === "known" && (freight.paymentStatus !== "paid" || pkg.calculation?.freightPaymentTotalCents === null || pkg.calculation?.freightPaymentTotalCents === undefined)) blockers.push(`${pkg.name}: confirme o pagamento do frete Brasil.`);
        if (!customs || customs.valueState === "pending") blockers.push(`${pkg.name}: informe ou isente a Receita.`);
        else if (customs.valueState === "known" && customs.paymentStatus !== "paid") blockers.push(`${pkg.name}: confirme o pagamento da Receita.`);
      }
      if (blockers.length) throw new DomainError(`Não é possível encerrar. ${blockers[0]}`, 409);
      return undefined;
    }, { trackingPatch: { status: "closed", closedAt: new Date(), closedBy: userId } });
  }

  async function reopenTracking(trackingId: string, input: unknown) {
    const value = z.object({ expectedRevision: revisionSchema, confirmed: z.literal(true), reason: z.string().trim().min(1).max(1000) }).strict().parse(input);
    return mutate(trackingId, value.expectedRevision, async tx => {
      await tx.insert(purchaseCostReopenings).values({ id: crypto.randomUUID(), trackingId, reopenedBy: userId, reopenedAt: new Date(), reason: value.reason }).run();
      return undefined;
    }, { requiredStatus: "closed", trackingPatch: { status: "open", closedBy: null, closedAt: null } });
  }

  return { startTracking, getTracking, list, getSettings, saveSettings, saveItemCosts, correctAdditionalOrder, createAdditionalOrder: orders.createDraft, recordAdditionalOrderPayment: orders.recordExternalPayment, recordAdditionalOrderMixedPayment: orders.recordMixedPayment, voidAdditionalOrderDraft: orders.voidDraft, settleAdditionalOrderAdvance, createPackage, deletePackage, saveAllocations, savePackage, unsealPackageContent, saveCharge, markChargePaid, requestRefund, updateRefundRequest, receiveRefund, correctRefundReceipt, voidRefund, closeTracking, reopenTracking };
}
