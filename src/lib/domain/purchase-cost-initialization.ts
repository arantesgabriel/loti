import { eq, inArray, asc } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import { purchaseCostCharges, purchaseCostTrackings, purchaseItemCosts, purchaseCostParticipants, purchaseItems, purchaseItemParticipants, purchasePackages, purchasePackageItems, type Purchase } from "../db/schema";

export type CostTransaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

export async function initializePurchaseCosts(tx: CostTransaction, purchase: Purchase, actorId: string) {
  const existing = await tx.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.purchaseId, purchase.id)).get();
  if (existing) return existing;

  const now = new Date(), trackingId = crypto.randomUUID();
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
    purchaseItemId: item.id,
    itemOrder,
    effectivePriceState: item.unitPriceCents === null ? "pending" as const : "known" as const,
    effectivePriceUnitCents: item.unitPriceCents,
    chinaFreightState: "pending" as const,
    chinaFreightUnitCents: null,
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

  const packageId = crypto.randomUUID();
  await tx.insert(purchasePackages).values({ id: packageId, trackingId, name: "Pacote 1", packageOrder: 0, logisticsStatus: "preparing", createdAt: now, updatedAt: now }).run();
  const packageRows = costRows.map((item, allocationOrder) => ({ packageId, costItemId: item.id, quantity: items[allocationOrder].quantity, allocationOrder: item.itemOrder }));
  if (packageRows.length) await tx.insert(purchasePackageItems).values(packageRows).run();
  await tx.insert(purchaseCostCharges).values([
    { id: crypto.randomUUID(), trackingId, packageId: null, chargeType: "products", valueState: null, amountCents: null, paymentMethod: null, feeBps: null, paymentStatus: "pending", paidAt: null, paidBy: null, createdAt: now, updatedAt: now },
    { id: crypto.randomUUID(), trackingId, packageId, chargeType: "brazil_freight", valueState: "pending", amountCents: null, paymentMethod: null, feeBps: null, paymentStatus: "pending", paidAt: null, paidBy: null, createdAt: now, updatedAt: now },
    { id: crypto.randomUUID(), trackingId, packageId, chargeType: "customs", valueState: "pending", amountCents: null, paymentMethod: null, feeBps: null, paymentStatus: "pending", paidAt: null, paidBy: null, createdAt: now, updatedAt: now },
  ]).run();
  return tracking;
}
