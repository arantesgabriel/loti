import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../db/connection";
import { purchaseCostCharges, purchaseCostParticipants, purchaseCostRefundEvents, purchaseCostRefundParticipants, purchaseCostRefunds, purchaseCostReopenings, purchaseCostTrackings, purchaseItemCosts, purchaseItems, purchasePackageItems, purchasePackages, workspaceCostSettings } from "../db/schema";
import { authorization } from "./authorization";
import { DomainError } from "./errors";
import { listCostTrackings, readCostTracking } from "./package-cost-reading";
import { initializePurchaseCosts, type CostTransaction } from "./purchase-cost-initialization";
import { serializeDomainTransaction } from "./transaction-lock";
import { splitByWeights } from "./package-cost-calculations";

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
  allocations: z.array(z.object({ packageId: z.string().min(1), costItemId: z.string().min(1), quantity: z.number().int().min(1).max(10_000) }).strict()).max(10_000),
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
  confirmPackagePaymentReset: z.boolean().optional(),
}).strict();
const refundValueSchema = z.object({ expectedRevision: revisionSchema, requestedProductCents: centsSchema, requestedChinaCents: centsSchema, reason: reasonSchema }).strict();
const refundReceiptSchema = z.object({ expectedRevision: revisionSchema, receivedProductCents: centsSchema, receivedChinaCents: centsSchema, confirmed: z.literal(true) }).strict();
const refundCorrectionSchema = z.object({ expectedRevision: revisionSchema, receivedProductCents: centsSchema, receivedChinaCents: centsSchema, reason: reasonSchema, confirmed: z.literal(true) }).strict();
const refundVoidSchema = z.object({ expectedRevision: revisionSchema, reason: reasonSchema, confirmed: z.literal(true) }).strict();

function assertRefundValues(quantity: number, productCents: number, chinaCents: number, productUnitCents: number, chinaUnitCents: number, requested = false) {
  const productCap = BigInt(quantity) * BigInt(productUnitCents), chinaCap = BigInt(quantity) * BigInt(chinaUnitCents);
  if (BigInt(productCents) > productCap || BigInt(chinaCents) > chinaCap) throw new DomainError("O valor excede o custo original das unidades selecionadas.", 409, "REFUND_AMOUNT_LIMIT");
  if (requested && productCents + chinaCents === 0) throw new DomainError("A solicitação precisa conter um valor de produto ou frete China.", 400, "REFUND_AMOUNT_REQUIRED");
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
  const transact = <T>(operation: (tx: CostTransaction) => Promise<T>) => serializeDomainTransaction(async () => {
    for (let attempt = 0; ; attempt++) {
      try { return await db.transaction(operation); }
      catch (error) {
        // Separate server processes can contend longer than the short local
        // transaction queue. Retry only SQLite BUSY; optimistic revisions still
        // decide the winner once the writer commits.
        if (!isDatabaseBusy(error) || attempt >= 8) throw error;
        await new Promise(resolve => setTimeout(resolve, Math.min(2_000, 25 * 2 ** attempt)));
      }
    }
  });

  async function mutate<T>(trackingId: string, expectedRevision: number, operation: (tx: CostTransaction, tracking: typeof purchaseCostTrackings.$inferSelect) => Promise<T>, options: { requiredStatus?: "open" | "closed"; trackingPatch?: Partial<typeof purchaseCostTrackings.$inferInsert> } = {}) {
    return transact(async tx => {
      const tracking = await tx.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.id, trackingId)).get();
      if (!tracking) throw new DomainError("Acompanhamento de custos não encontrado.", 404);
      await authorization(tx, userId).requireWorkspaceMember(tracking.workspaceId);
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

  async function requestRefund(trackingId: string, input: unknown) {
    const value = refundRequestSchema.parse(input);
    return mutate(trackingId, value.expectedRevision, async tx => {
      const item = await tx.select().from(purchaseItemCosts).where(and(eq(purchaseItemCosts.id, value.costItemId), eq(purchaseItemCosts.trackingId, trackingId))).get();
      if (!item) throw new DomainError("Produto não encontrado neste acompanhamento.", 404);
      const original = await tx.select().from(purchaseItems).where(eq(purchaseItems.id, item.purchaseItemId)).get();
      if (!original) throw new DomainError("O snapshot do produto não existe.", 409);
      const [activeRefunds, packages, assignments, participants, productCharge, detail] = await Promise.all([
        tx.select().from(purchaseCostRefunds).where(and(eq(purchaseCostRefunds.costItemId, item.id), inArray(purchaseCostRefunds.status, ["requested", "received"]))).all(),
        tx.select().from(purchasePackages).where(eq(purchasePackages.trackingId, trackingId)).all(),
        tx.select().from(purchasePackageItems).all(),
        tx.select().from(purchaseCostParticipants).where(eq(purchaseCostParticipants.costItemId, item.id)).orderBy(asc(purchaseCostParticipants.allocationOrder)).all(),
        tx.select().from(purchaseCostCharges).where(and(eq(purchaseCostCharges.trackingId, trackingId), eq(purchaseCostCharges.chargeType, "products"))).get(),
        readCostTracking(tx, userId, trackingId),
      ]);
      if (productCharge?.paymentStatus !== "paid" || detail.calculation.productsCharge.baseCents === null || detail.calculation.productsCharge.feeCents === null) throw new DomainError("Confirme o pagamento dos produtos e resolva as bases antes de registrar reembolsos.", 409, "REFUND_PRODUCTS_UNRESOLVED");
      if (item.effectivePriceState === "pending" || item.chinaFreightState === "pending") throw new DomainError("Informe ou marque sem cobrança o preço e o frete China antes de solicitar.", 409, "REFUND_PRODUCTS_UNRESOLVED");
      const weights = participants.map(person => ({ personId: person.personId, allocationOrder: person.allocationOrder, weight: person.weight }));
      if (!splitByWeights(1, weights)) throw new DomainError("Defina uma divisão válida para o produto antes de solicitar o reembolso.", 409, "REFUND_COMPOSITION_REQUIRED");
      const productUnitCents = item.effectivePriceState === "no_charge" ? 0 : item.effectivePriceUnitCents!;
      const chinaUnitCents = item.chinaFreightState === "no_charge" ? 0 : item.chinaFreightUnitCents!;
      assertRefundValues(value.quantity, value.requestedProductCents, value.requestedChinaCents, productUnitCents, chinaUnitCents, true);
      const alreadyCancelled = activeRefunds.reduce((sum, refund) => sum + refund.quantity, 0);
      const shippingQuantity = original.quantity - alreadyCancelled;
      if (value.quantity > shippingQuantity) throw new DomainError("A quantidade solicitada excede as unidades ainda enviáveis.", 409, "REFUND_INELIGIBLE_UNITS");
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
        if (pkg.logisticsStatus !== "preparing") throw new DomainError("Só é possível cancelar unidades que ainda estejam em preparação ou sem pacote.", 409, "REFUND_INELIGIBLE_UNITS");
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
      const paidAffected = affectedCharges.filter(charge => charge.paymentStatus === "paid");
      if (paidAffected.length && !value.confirmPackagePaymentReset) throw new DomainError("A retirada altera encargos pagos dos pacotes afetados. Confirme para voltar somente esses pagamentos a pendente.", 409, "REFUND_PACKAGE_PAYMENT_RESET_REQUIRED");
      const priceTotal = item.effectivePriceState === "no_charge" ? 0 : productUnitCents * original.quantity;
      const chinaTotal = item.chinaFreightState === "no_charge" ? 0 : chinaUnitCents * original.quantity;
      const productShares = splitByWeights(priceTotal, weights)!, chinaShares = splitByWeights(chinaTotal, weights)!;
      const feeAmount = detail.items.find(row => row.id === item.id)?.calculation?.components.find(component => component.name === "Taxa dos produtos")?.amountCents ?? 0;
      const feeShares = splitByWeights(feeAmount, weights)!;
      const now = new Date(), refundId = crypto.randomUUID();
      await tx.insert(purchaseCostRefunds).values({
        id: refundId, trackingId, costItemId: item.id, status: "requested", quantity: value.quantity,
        requestedProductCents: value.requestedProductCents, requestedChinaCents: value.requestedChinaCents,
        receivedProductCents: null, receivedChinaCents: null, reason: value.reason,
        originalItemQuantity: original.quantity, originalProductUnitCents: productUnitCents, originalChinaUnitCents: chinaUnitCents,
        originalChargeBaseCents: detail.calculation.productsCharge.baseCents, originalChargeFeeCents: detail.calculation.productsCharge.feeCents,
        originalItemFeeCents: feeAmount, originalPaymentMethod: productCharge.paymentMethod, originalFeeBps: productCharge.feeBps,
        originalPaidAt: productCharge.paidAt, originalPaidBy: productCharge.paidBy,
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
      }
      if (paidAffected.length) await tx.update(purchaseCostCharges).set({ paymentStatus: "pending", paidAt: null, paidBy: null, updatedAt: now }).where(inArray(purchaseCostCharges.id, paidAffected.map(charge => charge.id))).run();
      await appendRefundEvent(tx, refundId, userId, "requested", value.reason, {
        quantity: value.quantity, requestedProductCents: value.requestedProductCents, requestedChinaCents: value.requestedChinaCents,
        packageRemovals: affectedPackages, unassignedQuantity: value.unassignedQuantity,
        resetPackageChargeIds: paidAffected.map(charge => charge.id), originalCharge: { baseCents: detail.calculation.productsCharge.baseCents, feeCents: detail.calculation.productsCharge.feeCents, paymentMethod: productCharge.paymentMethod, feeBps: productCharge.feeBps },
      });
      return undefined;
    });
  }

  async function updateRefundRequest(trackingId: string, refundId: string, input: unknown) {
    const value = refundValueSchema.parse(input);
    return mutate(trackingId, value.expectedRevision, async tx => {
      const refund = await tx.select().from(purchaseCostRefunds).where(and(eq(purchaseCostRefunds.id, refundId), eq(purchaseCostRefunds.trackingId, trackingId))).get();
      if (!refund || refund.status !== "requested") throw new DomainError("Somente uma solicitação pendente pode ser editada.", 409);
      assertRefundValues(refund.quantity, value.requestedProductCents, value.requestedChinaCents, refund.originalProductUnitCents, refund.originalChinaUnitCents, true);
      await tx.update(purchaseCostRefunds).set({ requestedProductCents: value.requestedProductCents, requestedChinaCents: value.requestedChinaCents, reason: value.reason, updatedBy: userId, updatedAt: new Date() }).where(eq(purchaseCostRefunds.id, refundId)).run();
      await appendRefundEvent(tx, refundId, userId, "request_updated", value.reason, { before: { productCents: refund.requestedProductCents, chinaCents: refund.requestedChinaCents }, after: { productCents: value.requestedProductCents, chinaCents: value.requestedChinaCents } });
      return undefined;
    });
  }

  async function receiveRefund(trackingId: string, refundId: string, input: unknown) {
    const value = refundReceiptSchema.parse(input);
    return mutate(trackingId, value.expectedRevision, async tx => {
      const refund = await tx.select().from(purchaseCostRefunds).where(and(eq(purchaseCostRefunds.id, refundId), eq(purchaseCostRefunds.trackingId, trackingId))).get();
      if (!refund || refund.status !== "requested") throw new DomainError("Este reembolso não está aguardando recebimento.", 409);
      assertRefundValues(refund.quantity, value.receivedProductCents, value.receivedChinaCents, refund.originalProductUnitCents, refund.originalChinaUnitCents);
      const other = await tx.select().from(purchaseCostRefunds).where(and(eq(purchaseCostRefunds.costItemId, refund.costItemId), inArray(purchaseCostRefunds.status, ["received"]))).all();
      const maxProduct = BigInt(refund.originalProductUnitCents) * BigInt(refund.quantity) + other.reduce((sum, row) => sum + BigInt(row.receivedProductCents ?? 0), 0n);
      const maxChina = BigInt(refund.originalChinaUnitCents) * BigInt(refund.quantity) + other.reduce((sum, row) => sum + BigInt(row.receivedChinaCents ?? 0), 0n);
      if (BigInt(value.receivedProductCents) > maxProduct || BigInt(value.receivedChinaCents) > maxChina) throw new DomainError("O recebido agregado excede o custo original dos componentes cancelados.", 409, "REFUND_AMOUNT_LIMIT");
      const now = new Date();
      await tx.update(purchaseCostRefunds).set({ status: "received", receivedProductCents: value.receivedProductCents, receivedChinaCents: value.receivedChinaCents, receivedAt: now, receivedBy: userId, updatedAt: now, updatedBy: userId }).where(and(eq(purchaseCostRefunds.id, refundId), eq(purchaseCostRefunds.status, "requested"))).run();
      await appendRefundEvent(tx, refundId, userId, "received", null, { requested: { productCents: refund.requestedProductCents, chinaCents: refund.requestedChinaCents }, received: { productCents: value.receivedProductCents, chinaCents: value.receivedChinaCents } });
      return undefined;
    });
  }

  async function correctRefundReceipt(trackingId: string, refundId: string, input: unknown) {
    const value = refundCorrectionSchema.parse(input);
    return mutate(trackingId, value.expectedRevision, async tx => {
      const refund = await tx.select().from(purchaseCostRefunds).where(and(eq(purchaseCostRefunds.id, refundId), eq(purchaseCostRefunds.trackingId, trackingId))).get();
      if (!refund || refund.status !== "received") throw new DomainError("Somente um recebimento registrado pode ser corrigido.", 409);
      assertRefundValues(refund.quantity, value.receivedProductCents, value.receivedChinaCents, refund.originalProductUnitCents, refund.originalChinaUnitCents);
      const other = await tx.select().from(purchaseCostRefunds).where(and(eq(purchaseCostRefunds.costItemId, refund.costItemId), eq(purchaseCostRefunds.status, "received"))).all();
      const productTotal = other.filter(row => row.id !== refundId).reduce((sum, row) => sum + BigInt(row.receivedProductCents ?? 0), 0n) + BigInt(value.receivedProductCents);
      const chinaTotal = other.filter(row => row.id !== refundId).reduce((sum, row) => sum + BigInt(row.receivedChinaCents ?? 0), 0n) + BigInt(value.receivedChinaCents);
      if (productTotal > BigInt(refund.originalProductUnitCents) * BigInt(refund.originalItemQuantity) || chinaTotal > BigInt(refund.originalChinaUnitCents) * BigInt(refund.originalItemQuantity)) throw new DomainError("A correção excede o custo original agregado do componente.", 409, "REFUND_AMOUNT_LIMIT");
      await tx.update(purchaseCostRefunds).set({ receivedProductCents: value.receivedProductCents, receivedChinaCents: value.receivedChinaCents, updatedAt: new Date(), updatedBy: userId }).where(and(eq(purchaseCostRefunds.id, refundId), eq(purchaseCostRefunds.status, "received"))).run();
      await appendRefundEvent(tx, refundId, userId, "receipt_corrected", value.reason, { before: { productCents: refund.receivedProductCents, chinaCents: refund.receivedChinaCents }, after: { productCents: value.receivedProductCents, chinaCents: value.receivedChinaCents } });
      return undefined;
    });
  }

  async function voidRefund(trackingId: string, refundId: string, input: unknown) {
    const value = refundVoidSchema.parse(input);
    return mutate(trackingId, value.expectedRevision, async tx => {
      const refund = await tx.select().from(purchaseCostRefunds).where(and(eq(purchaseCostRefunds.id, refundId), eq(purchaseCostRefunds.trackingId, trackingId))).get();
      if (!refund || refund.status === "voided") throw new DomainError("Este reembolso já está anulado ou não existe.", 409);
      const now = new Date();
      await tx.update(purchaseCostRefunds).set({ status: "voided", voidedAt: now, voidedBy: userId, voidReason: value.reason, updatedAt: now, updatedBy: userId }).where(and(eq(purchaseCostRefunds.id, refundId), inArray(purchaseCostRefunds.status, ["requested", "received"]))).run();
      await appendRefundEvent(tx, refundId, userId, "voided", value.reason, { previousStatus: refund.status, releasedQuantity: refund.quantity, removedCreditCents: (refund.receivedProductCents ?? 0) + (refund.receivedChinaCents ?? 0), quantityReturnsWithoutPackage: true });
      return undefined;
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
      const changed = costItem.effectivePriceState !== value.effectivePriceState || costItem.effectivePriceUnitCents !== value.effectivePriceUnitCents || costItem.chinaFreightState !== value.chinaFreightState || costItem.chinaFreightUnitCents !== value.chinaFreightUnitCents;
      const activeRefunds = await tx.select().from(purchaseCostRefunds).where(and(eq(purchaseCostRefunds.trackingId, trackingId), inArray(purchaseCostRefunds.status, ["requested", "received"]))).all();
      const currentComposition = await tx.select().from(purchaseCostParticipants).where(eq(purchaseCostParticipants.costItemId, costItem.id)).orderBy(asc(purchaseCostParticipants.allocationOrder)).all();
      const compositionChanged = !!value.composition && (value.composition.mode !== currentComposition[0]?.weightMode || value.composition.participants.length !== currentComposition.length || value.composition.participants.some((person, index) => person.personId !== currentComposition[index]?.personId || (value.composition!.mode === "equal" ? 1 : person.weight) !== currentComposition[index]?.weight));
      const itemHasActiveRefund = activeRefunds.some(refund => refund.costItemId === costItem.id);
      if (activeRefunds.length && changed) throw new DomainError("As bases dos produtos estão protegidas enquanto houver reembolso não anulado. Anule os reembolsos antes de corrigir esses valores.", 409, "REFUND_PRODUCTS_LOCKED");
      if (itemHasActiveRefund && compositionChanged) throw new DomainError("A divisão deste produto está protegida enquanto houver reembolso não anulado. Anule seus reembolsos antes de alterar a composição.", 409, "REFUND_PRODUCTS_LOCKED");
      const productsCharge = await tx.select().from(purchaseCostCharges).where(and(eq(purchaseCostCharges.trackingId, trackingId), eq(purchaseCostCharges.chargeType, "products"))).get();
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
      const [assignments, charges] = await Promise.all([
        tx.select().from(purchasePackageItems).where(eq(purchasePackageItems.packageId, packageId)).all(),
        tx.select().from(purchaseCostCharges).where(eq(purchaseCostCharges.packageId, packageId)).all(),
      ]);
      if (pkg.logisticsStatus !== "preparing" || assignments.length || charges.some(charge => charge.paymentStatus === "paid" || charge.valueState !== "pending")) throw new DomainError("Só é possível excluir um pacote vazio, em preparação, com cobranças pendentes.", 409);
      await tx.delete(purchaseCostCharges).where(eq(purchaseCostCharges.packageId, packageId)).run();
      await tx.delete(purchasePackages).where(eq(purchasePackages.id, packageId)).run();
      return undefined;
    });
  }

  async function saveAllocations(trackingId: string, input: unknown) {
    const value = allocationSchema.parse(input);
    return mutate(trackingId, value.expectedRevision, async tx => {
      const [packages, costItems] = await Promise.all([
        tx.select().from(purchasePackages).where(eq(purchasePackages.trackingId, trackingId)).all(),
        tx.select().from(purchaseItemCosts).where(eq(purchaseItemCosts.trackingId, trackingId)).orderBy(asc(purchaseItemCosts.itemOrder)).all(),
      ]);
      const packagesById = new Map(packages.map(pkg => [pkg.id, pkg]));
      const costItemsById = new Map(costItems.map(item => [item.id, item]));
      const activeRefunds = costItems.length ? await tx.select().from(purchaseCostRefunds).where(and(eq(purchaseCostRefunds.trackingId, trackingId), inArray(purchaseCostRefunds.status, ["requested", "received"]))).all() : [];
      const cancelledByItem = new Map<string, number>();
      for (const refund of activeRefunds) cancelledByItem.set(refund.costItemId, (cancelledByItem.get(refund.costItemId) ?? 0) + refund.quantity);
      const desired = new Map<string, number>();
      for (const row of value.allocations) {
        if (!packagesById.has(row.packageId) || !costItemsById.has(row.costItemId)) throw new DomainError("A alocação referencia um pacote ou produto de outra compra.", 403);
        const key = `${row.packageId}:${row.costItemId}`;
        if (desired.has(key)) throw new DomainError("Há produtos repetidos na alocação.");
        desired.set(key, row.quantity);
      }
      const originalItems = costItems.length ? await tx.select().from(purchaseItems).where(inArray(purchaseItems.id, costItems.map(item => item.purchaseItemId))).all() : [];
      const originalById = new Map(originalItems.map(item => [item.id, item]));
      const totalByCostItem = new Map(costItems.map(item => [item.id, 0]));
      for (const [key, quantity] of desired) {
        const costItemId = key.slice(key.indexOf(":") + 1), costItem = costItemsById.get(costItemId)!, original = originalById.get(costItem.purchaseItemId)!;
        const next = (totalByCostItem.get(costItemId) ?? 0) + quantity;
        if (next > original.quantity - (cancelledByItem.get(costItemId) ?? 0)) throw new DomainError("A quantidade alocada excede as unidades disponíveis para envio.", 409, "REFUND_INELIGIBLE_UNITS");
        totalByCostItem.set(costItemId, next);
      }
      const current = packages.length ? await tx.select().from(purchasePackageItems).where(inArray(purchasePackageItems.packageId, packages.map(pkg => pkg.id))).all() : [];
      const currentByKey = new Map(current.map(row => [`${row.packageId}:${row.costItemId}`, row.quantity]));
      const changedPackageIds = packages.filter(pkg => costItems.some(item => (currentByKey.get(`${pkg.id}:${item.id}`) ?? 0) !== (desired.get(`${pkg.id}:${item.id}`) ?? 0))).map(pkg => pkg.id);
      if (!changedPackageIds.length) return undefined;
      const paidCharges = await tx.select().from(purchaseCostCharges).where(and(inArray(purchaseCostCharges.packageId, changedPackageIds), eq(purchaseCostCharges.paymentStatus, "paid"))).all();
      if (paidCharges.length && !value.confirmPaymentReset) throw new DomainError("A mudança altera pacotes com cobranças pagas. Confirme para invalidar essas confirmações.", 409);
      if (paidCharges.length) await tx.update(purchaseCostCharges).set({ paymentStatus: "pending", paidAt: null, paidBy: null, updatedAt: new Date() }).where(inArray(purchaseCostCharges.id, paidCharges.map(charge => charge.id))).run();
      await tx.delete(purchasePackageItems).where(inArray(purchasePackageItems.packageId, changedPackageIds)).run();
      const rows = changedPackageIds.flatMap(packageId => costItems.flatMap(costItem => {
        const quantity = desired.get(`${packageId}:${costItem.id}`) ?? 0;
        return quantity ? [{ packageId, costItemId: costItem.id, quantity, allocationOrder: costItem.itemOrder }] : [];
      }));
      if (rows.length) await tx.insert(purchasePackageItems).values(rows).run();
      return undefined;
    });
  }

  async function savePackage(trackingId: string, packageId: string, input: unknown) {
    const value = z.object({ expectedRevision: revisionSchema, name: z.string().trim().min(1).max(80), logisticsStatus: z.enum(["preparing", "sent", "received"]) }).strict().parse(input);
    return mutate(trackingId, value.expectedRevision, async tx => {
      const updated = await tx.update(purchasePackages).set({ name: value.name, logisticsStatus: value.logisticsStatus, updatedAt: new Date() }).where(and(eq(purchasePackages.id, packageId), eq(purchasePackages.trackingId, trackingId))).returning().get();
      if (!updated) throw new DomainError("Pacote não encontrado.", 404);
      return undefined;
    });
  }

  async function saveCharge(trackingId: string, chargeId: string, input: unknown) {
    const value = chargeSchema.parse(input);
    return mutate(trackingId, value.expectedRevision, async tx => {
      const charge = await tx.select().from(purchaseCostCharges).where(and(eq(purchaseCostCharges.id, chargeId), eq(purchaseCostCharges.trackingId, trackingId), eq(purchaseCostCharges.chargeType, value.chargeType))).get();
      if (!charge) throw new DomainError("Cobrança não encontrada neste acompanhamento.", 404);
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

  return { startTracking, getTracking, list, getSettings, saveSettings, saveItemCosts, createPackage, deletePackage, saveAllocations, savePackage, saveCharge, markChargePaid, requestRefund, updateRefundRequest, receiveRefund, correctRefundReceipt, voidRefund, closeTracking, reopenTracking };
}
