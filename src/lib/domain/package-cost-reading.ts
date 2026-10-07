import { asc, desc, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import { purchaseCostCharges, purchaseCostParticipants, purchaseCostReopenings, purchaseCostTrackings, purchaseItemCosts, purchaseItems, purchasePackageItems, purchasePackages, purchases, user, workspaceMembers, workspaceCostSettings } from "../db/schema";
import { authorization } from "./authorization";
import { DomainError } from "./errors";
import { calculateCostTracking } from "./package-cost-calculations";
import { CostTransaction } from "./purchase-cost-initialization";

type CostReadDatabase = Pick<AppDatabase, "select">;
type CostDatabase = CostReadDatabase | CostTransaction;

function pendingPackageCharge() {
  return { value: { state: "pending" as const, amountCents: null }, paymentMethod: null, feeBps: null, paymentStatus: "pending" as const };
}

export async function readCostTracking(db: CostDatabase, userId: string, trackingId: string) {
  const tracking = await db.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.id, trackingId)).get();
  if (!tracking) throw new DomainError("Acompanhamento de custos não encontrado.", 404);
  await authorization(db, userId).requireWorkspaceMember(tracking.workspaceId);
  const purchase = await db.select().from(purchases).where(eq(purchases.id, tracking.purchaseId)).get();
  if (!purchase || purchase.workspaceId !== tracking.workspaceId) throw new DomainError("Acompanhamento de custos inválido.", 404);

  const [itemCosts, packages, charges, members, reopenings] = await Promise.all([
    db.select().from(purchaseItemCosts).where(eq(purchaseItemCosts.trackingId, trackingId)).orderBy(asc(purchaseItemCosts.itemOrder)).all(),
    db.select().from(purchasePackages).where(eq(purchasePackages.trackingId, trackingId)).orderBy(asc(purchasePackages.packageOrder)).all(),
    db.select().from(purchaseCostCharges).where(eq(purchaseCostCharges.trackingId, trackingId)).orderBy(asc(purchaseCostCharges.chargeType)).all(),
    db.select({ id: user.id, name: user.name, email: user.email }).from(user).innerJoin(workspaceMembers, eq(workspaceMembers.userId, user.id)).where(eq(workspaceMembers.workspaceId, tracking.workspaceId)).orderBy(asc(user.name)).all(),
    db.select().from(purchaseCostReopenings).where(eq(purchaseCostReopenings.trackingId, trackingId)).orderBy(desc(purchaseCostReopenings.reopenedAt)).all(),
  ]);
  const costIds = itemCosts.map(item => item.id), purchaseItemIds = itemCosts.map(item => item.purchaseItemId), packageIds = packages.map(pkg => pkg.id);
  const [purchaseItemRows, participantRows, assignmentRows] = await Promise.all([
    purchaseItemIds.length ? db.select().from(purchaseItems).where(inArray(purchaseItems.id, purchaseItemIds)).all() : Promise.resolve([]),
    costIds.length ? db.select().from(purchaseCostParticipants).where(inArray(purchaseCostParticipants.costItemId, costIds)).orderBy(asc(purchaseCostParticipants.costItemId), asc(purchaseCostParticipants.allocationOrder)).all() : Promise.resolve([]),
    packageIds.length ? db.select().from(purchasePackageItems).where(inArray(purchasePackageItems.packageId, packageIds)).orderBy(asc(purchasePackageItems.packageId), asc(purchasePackageItems.allocationOrder)).all() : Promise.resolve([]),
  ]);
  const purchaseItemsById = new Map(purchaseItemRows.map(item => [item.id, item]));
  const peopleById = new Map(members.map(member => [member.id, member]));
  const participantsByCostItem = new Map<string, typeof participantRows>();
  for (const participant of participantRows) participantsByCostItem.set(participant.costItemId, [...(participantsByCostItem.get(participant.costItemId) ?? []), participant]);
  const assignmentsByPackage = new Map<string, typeof assignmentRows>();
  for (const assignment of assignmentRows) assignmentsByPackage.set(assignment.packageId, [...(assignmentsByPackage.get(assignment.packageId) ?? []), assignment]);
  const chargeByScope = new Map(charges.map(charge => [`${charge.packageId ?? "purchase"}:${charge.chargeType}`, charge]));
  const productCharge = chargeByScope.get("purchase:products");
  let calculation: ReturnType<typeof calculateCostTracking>;
  try { calculation = calculateCostTracking({
    items: itemCosts.map(cost => {
      const original = purchaseItemsById.get(cost.purchaseItemId);
      if (!original) throw new DomainError("Um item do acompanhamento não existe no snapshot da compra.", 409);
      return {
        id: cost.id,
        itemOrder: cost.itemOrder,
        quantity: original.quantity,
        effectivePrice: { state: cost.effectivePriceState, amountCents: cost.effectivePriceUnitCents },
        chinaFreight: { state: cost.chinaFreightState, amountCents: cost.chinaFreightUnitCents },
        participants: (participantsByCostItem.get(cost.id) ?? []).map(person => ({ personId: person.personId, allocationOrder: person.allocationOrder, weight: person.weight })),
      };
    }),
    packages: packages.map(pkg => {
      const freight = chargeByScope.get(`${pkg.id}:brazil_freight`), customs = chargeByScope.get(`${pkg.id}:customs`);
      return {
        id: pkg.id,
        name: pkg.name,
        packageOrder: pkg.packageOrder,
        logisticsStatus: pkg.logisticsStatus,
        items: (assignmentsByPackage.get(pkg.id) ?? []).map(row => ({ costItemId: row.costItemId, quantity: row.quantity, allocationOrder: row.allocationOrder })),
        brazilFreight: freight ? { value: { state: freight.valueState!, amountCents: freight.amountCents }, paymentMethod: freight.paymentMethod, feeBps: freight.feeBps, paymentStatus: freight.paymentStatus } : pendingPackageCharge(),
        customs: customs ? { value: { state: customs.valueState!, amountCents: customs.amountCents }, paymentMethod: customs.paymentMethod, feeBps: customs.feeBps, paymentStatus: customs.paymentStatus } : pendingPackageCharge(),
      };
    }),
    productsCharge: { paymentMethod: productCharge?.paymentMethod ?? null, feeBps: productCharge?.feeBps ?? null, paymentStatus: productCharge?.paymentStatus ?? "pending" },
  }); }
  catch (error) { throw new DomainError(error instanceof Error ? error.message : "Não foi possível calcular este acompanhamento.", 409); }
  const calculatedItems = new Map(calculation.items.map(item => [item.id, item]));
  const calculatedPackages = new Map(calculation.packages.map(pkg => [pkg.id, pkg]));
  const items = itemCosts.map(cost => {
    const original = purchaseItemsById.get(cost.purchaseItemId)!;
    const participants = participantsByCostItem.get(cost.id) ?? [];
    return {
      ...cost,
      original: { id: original.id, name: original.name, variant: original.variant, visualKey: original.visualKey, quantity: original.quantity, originalUnitPriceCents: original.unitPriceCents },
      participants: participants.map(participant => {
        const share = calculatedItems.get(cost.id)?.shares.find(value => value.personId === participant.personId);
        return {
          ...participant,
          name: peopleById.get(participant.personId)?.name ?? "Membro",
          partialShareCents: share?.partialAmountCents ?? null,
          shareCents: share?.amountCents ?? null,
        };
      }),
      calculation: calculatedItems.get(cost.id),
    };
  });
  const packageData = packages.map(pkg => ({
    ...pkg,
    items: assignmentsByPackage.get(pkg.id) ?? [],
    brazilFreightCharge: chargeByScope.get(`${pkg.id}:brazil_freight`) ?? null,
    customsCharge: chargeByScope.get(`${pkg.id}:customs`) ?? null,
    calculation: calculatedPackages.get(pkg.id),
  }));
  const memberTotals = new Map<string, { personId: string; name: string; totalCents: number; hasKnownAmount: boolean; pending: boolean; personalUnits: number; sharedItems: number }>();
  for (const item of items) {
    for (const participant of item.participants) {
      const current = memberTotals.get(participant.personId) ?? { personId: participant.personId, name: participant.name, totalCents: 0, hasKnownAmount: false, pending: false, personalUnits: 0, sharedItems: 0 };
      if (participant.partialShareCents === null) current.pending = true;
      else { current.totalCents += participant.partialShareCents; current.hasKnownAmount = true; }
      if (participant.shareCents === null) current.pending = true;
      if (item.participants.length > 1) current.sharedItems += 1;
      else current.personalUnits += item.original.quantity;
      memberTotals.set(participant.personId, current);
    }
  }
  const settings = await db.select().from(workspaceCostSettings).where(eq(workspaceCostSettings.workspaceId, tracking.workspaceId)).get();
  return {
    tracking,
    purchase,
    items,
    packages: packageData,
    charges,
    productsCharge: productCharge ?? null,
    members,
    memberTotals: [...memberTotals.values()],
    reopenings: reopenings.map(event => ({ ...event, name: peopleById.get(event.reopenedBy)?.name ?? "Membro" })),
    settings: { pixBps: settings?.pixBps ?? 100, cardBps: settings?.cardBps ?? 500 },
    calculation,
  };
}

export type CostTrackingView = Awaited<ReturnType<typeof readCostTracking>>;

export async function listCostTrackings(db: CostReadDatabase, userId: string) {
  const membership = await authorization(db, userId).requireWorkspaceMember();
  const rows = await db.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.workspaceId, membership.workspaceId)).orderBy(desc(purchaseCostTrackings.updatedAt)).all();
  return Promise.all(rows.map(row => readCostTracking(db, userId, row.id)));
}
