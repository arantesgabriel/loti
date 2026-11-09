import { eq, inArray, asc } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import { usesOrdersWorkflow } from "./orders-workflow";
import { DomainError } from "./errors";
import { purchaseCostCharges, purchaseCostOrders, purchaseCostTrackings, purchaseItemCosts, purchaseCostParticipants, purchaseItems, purchaseItemParticipants, purchasePackages, purchasePackageItems, type Purchase } from "../db/schema";

export type CostTransaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

export async function initializeLegacyPurchaseCosts(tx: CostTransaction, purchase: Purchase, actorId: string) {
  return initializeCosts(tx, purchase, actorId, true);
}

export async function initializePurchaseCosts(tx: CostTransaction, purchase: Purchase, actorId: string) {
  const existing = await tx.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.purchaseId,purchase.id)).get();
  if (existing) return existing;
  if (!await usesOrdersWorkflow(tx)) throw new DomainError("Atualize as migrations antes de finalizar uma compra.",409,"ORDERS_WORKFLOW_UPGRADE_REQUIRED");
  return initializeCosts(tx, purchase, actorId, false);
}

async function initializeCosts(tx: CostTransaction, purchase: Purchase, actorId: string, legacy: boolean) {
  const existing = await tx.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.purchaseId, purchase.id)).get();
  if (existing) return existing;

  const now = new Date(), trackingId = crypto.randomUUID(), orderId = crypto.randomUUID();
  const tracking = await tx.insert(purchaseCostTrackings).values({
    id: trackingId,
    purchaseId: purchase.id,
    workspaceId: purchase.workspaceId,
    status: "open",
    revision: 0,
    createdBy: actorId,
    createdAt: now,
    updatedBy: actorId,
    updatedAt: now,
    closedBy: null,
    closedAt: null,
  }).returning().get();

  await tx.insert(purchaseCostOrders).values({
    id: orderId, trackingId, kind: "original", accountId: null, externalReference: null, state: "recorded", revision: 0,
    createdBy: actorId, createdAt: now, updatedBy: actorId, updatedAt: now,
    occurredAt: null, recordedAt: now, operationId: null,
  }).run();

  const items = await tx.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, purchase.id)).orderBy(asc(purchaseItems.createdAt), asc(purchaseItems.id)).all();
  const itemIds = items.map(item => item.id);
  const participants = itemIds.length
    ? await tx.select().from(purchaseItemParticipants).where(inArray(purchaseItemParticipants.purchaseItemId, itemIds)).orderBy(asc(purchaseItemParticipants.purchaseItemId), asc(purchaseItemParticipants.allocationOrder)).all()
    : [];
  const participantMap = new Map<string, typeof participants>();
  for (const participant of participants) participantMap.set(participant.purchaseItemId, [...(participantMap.get(participant.purchaseItemId) ?? []), participant]);

  const costRows = items.map((item, itemOrder) => ({
    id: crypto.randomUUID(),
    trackingId,
    orderId,
    purchaseItemId: item.id,
    additionalOrderItemId: null,
    itemOrder,
    effectivePriceState: item.unitPriceCents === null ? "pending" as const : "known" as const,
    effectivePriceUnitCents: item.unitPriceCents,
    chinaFreightState: "pending" as const,
    chinaFreightUnitCents: null,
    nativeProductState: "unknown" as const,
    nativeProductCnyMinor: null,
    nativeChinaState: "unknown" as const,
    nativeChinaCnyMinor: null,
    valuationVersion: 1,
  }));
  if (costRows.length) await tx.insert(purchaseItemCosts).values(costRows).run();
  const costIdByPurchaseItem = new Map(costRows.map(row => [row.purchaseItemId, row.id]));

  const participantRows = items.flatMap(item => {
    const originals = participantMap.get(item.id) ?? [{ purchaseItemId: item.id, personId: item.personId, allocationOrder: 0, percentageBps: null, amountCents: null }];
    const mode = originals.length === 1 ? "equal" as const : item.sharingMode;
    return originals.map((participant, allocationOrder) => ({
      costItemId: costIdByPurchaseItem.get(item.id)!,
      personId: participant.personId,
      allocationOrder,
      weightMode: mode,
      weight: mode === "equal" ? 1 : mode === "percentage" ? participant.percentageBps ?? 0 : participant.amountCents ?? 0,
    }));
  });
  if (participantRows.length) await tx.insert(purchaseCostParticipants).values(participantRows).run();

  if (!legacy) {
    await tx.insert(purchaseCostCharges).values({ id: crypto.randomUUID(), trackingId, orderId, packageId: null, chargeType: "products", valueState: null, amountCents: null, paymentMethod: null, feeBps: null, paymentStatus: "pending", paidAt: null, paidBy: null, createdAt: now, updatedAt: now }).run();
    return tracking;
  }
  const packageId = crypto.randomUUID();
  await tx.insert(purchasePackages).values({ id: packageId, trackingId, name: "Pacote 1", packageOrder: 0, logisticsStatus: "preparing", createdAt: now, updatedAt: now }).run();
  const packageRows = costRows.map((item, allocationOrder) => ({ packageId, costItemId: item.id, quantity: items[allocationOrder].quantity, allocationOrder: item.itemOrder }));
  if (packageRows.length) await tx.insert(purchasePackageItems).values(packageRows).run();
  await tx.insert(purchaseCostCharges).values([
    { id: crypto.randomUUID(), trackingId, orderId, packageId: null, chargeType: "products", valueState: null, amountCents: null, paymentMethod: null, feeBps: null, paymentStatus: "pending", paidAt: null, paidBy: null, createdAt: now, updatedAt: now },
    { id: crypto.randomUUID(), trackingId, packageId, chargeType: "brazil_freight", valueState: "pending", amountCents: null, paymentMethod: null, feeBps: null, paymentStatus: "pending", paidAt: null, paidBy: null, createdAt: now, updatedAt: now },
    { id: crypto.randomUUID(), trackingId, packageId, chargeType: "customs", valueState: "pending", amountCents: null, paymentMethod: null, feeBps: null, paymentStatus: "pending", paidAt: null, paidBy: null, createdAt: now, updatedAt: now },
  ]).run();
  return tracking;
}
