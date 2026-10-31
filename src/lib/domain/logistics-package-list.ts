import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../db/connection";
import * as s from "../db/schema";
import { authorization } from "./authorization";
import { DomainError } from "./errors";
import { logisticsPackageServices } from "./logistics-package-services";
import { readDatabaseSnapshot } from "../db/read-snapshot";

const filters = ["all", "pending", "preparing", "sent", "received", "content_closed", "review", "closed"] as const;
const sorts = ["recent", "oldest", "name_asc", "name_desc"] as const;

export const packageListQuerySchema = z.object({
  page: z.coerce.number().int().min(0).max(10000).default(0),
  filter: z.enum(filters).default("all"),
  pendingOnly: z.enum(["true", "false"]).default("false").transform(value => value === "true"),
  search: z.string().trim().max(200).default(""),
  sort: z.enum(sorts).default("recent"),
}).strict();

export type PackageListQuery = z.infer<typeof packageListQuerySchema>;
export type PackagePendingAction = {
  key: string;
  label: string;
  kind: "logistics" | "cost" | "order" | "refund";
  href: string;
};

type PackageDetail = Awaited<ReturnType<ReturnType<typeof logisticsPackageServices>["get"]>>;
type PackageRow = {
  pkg: typeof s.logisticsPackages.$inferSelect;
  unitCount: number;
  productCount: number;
  freightConfirmed: boolean;
  lastActivityAt: Date | null;
  costSummary: {
    knownCents: number;
    state: "closed" | "partial" | "pending" | "known" | "empty";
    title: string;
    description: string;
  };
  pendingActions: PackagePendingAction[];
};

const pageSize = 20;
const noop = (value: Date | null | undefined) => value?.getTime() ?? null;

function latestDate(...values: (Date | null | undefined)[]) {
  const dates = values.flatMap(value => value ? [value] : []);
  return dates.length ? new Date(Math.max(...dates.map(value => value.getTime()))) : null;
}

function moneySum(values: number[]) {
  const total = values.reduce((sum, value) => sum + BigInt(value), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new DomainError("O total do pacote excede o limite seguro de valores.", 409);
  return Number(total);
}

function addAction(actions: PackagePendingAction[], action: PackagePendingAction) {
  if (!actions.some(row => row.key === action.key)) actions.push(action);
}

function getChargeState(detail: PackageDetail, charge: "freight" | "customs") {
  const directState = charge === "freight" ? detail.pkg.freightState : detail.pkg.customsState;
  const directPaidAt = charge === "freight" ? detail.pkg.freightPaidAt : detail.pkg.customsPaidAt;
  const directAmount = charge === "freight" ? detail.pkg.freightCents : detail.pkg.customsCents;
  const legacyType = charge === "freight" ? "brazil_freight" : "customs";
  const legacy = detail.legacyCharges.find(row => row.chargeType === legacyType);
  const ownsDirectCharge = detail.ownership[charge];
  if (ownsDirectCharge || !legacy) {
    return {
      state: directState,
      paid: !!directPaidAt,
      known: directState === "known" && directAmount !== null,
      noCharge: directState === "no_charge",
    };
  }
  return {
    state: legacy.valueState ?? "pending",
    paid: legacy.paymentStatus === "paid" && legacy.paidAt !== null,
    known: legacy.valueState === "known" && legacy.amountCents !== null,
    noCharge: legacy.valueState === "no_charge",
  };
}

function makeActions(
  pkg: typeof s.logisticsPackages.$inferSelect,
  detail: PackageDetail | null,
  activeReservations: typeof s.logisticsReservations.$inferSelect[],
  costItems: typeof s.purchaseItemCosts.$inferSelect[],
  costsById: Map<string, typeof s.purchaseItemCosts.$inferSelect>,
  charges: typeof s.purchaseCostCharges.$inferSelect[],
  trackings: typeof s.purchaseCostTrackings.$inferSelect[],
  participants: typeof s.purchaseCostParticipants.$inferSelect[],
  positions: typeof s.orderWarehousePositions.$inferSelect[],
  accounts: typeof s.hubbuyAccounts.$inferSelect[],
  refunds: typeof s.purchaseCostRefunds.$inferSelect[],
) {
  const actions: PackagePendingAction[] = [];
  const detailHref = `/packages/detail/${encodeURIComponent(pkg.id)}`;
  const activeCostIds = new Set(activeReservations.map(row => row.costItemId));
  const activeCosts = costItems.filter(row => activeCostIds.has(row.id));
  const activePositions = positions.filter(row => activeCostIds.has(row.costItemId));
  const reviewReadyAccount = accounts.some(account => account.status === "active" &&
    activePositions.every(position => position.reviewState === "confirmed" && position.accountId === account.id));

  if (pkg.reviewState === "pending_review" && reviewReadyAccount) {
    addAction(actions, { key: "review", label: "Conferir pacote", kind: "logistics", href: detailHref });
  }

  const trackingById = new Map(trackings.map(row => [row.id, row]));
  const costChargeByOrder = new Map(charges.filter(row => row.chargeType === "products" && row.orderId).map(row => [row.orderId!, row]));
  const participantsByCost = new Map<string, typeof participants>();
  for (const participant of participants) participantsByCost.set(participant.costItemId, [...(participantsByCost.get(participant.costItemId) ?? []), participant]);
  for (const cost of activeCosts) {
    const tracking = trackingById.get(cost.trackingId);
    const orderHref = `/orders/${encodeURIComponent(cost.trackingId)}`;
    if (tracking?.status === "open" && (cost.effectivePriceState === "pending" || cost.chinaFreightState === "pending")) {
      addAction(actions, { key: `item-cost:${cost.id}`, label: "Informar custos do pedido", kind: "order", href: orderHref });
    }
    const shares = participantsByCost.get(cost.id) ?? [];
    if (tracking?.status === "open" && (!shares.length || shares.reduce((sum, person) => sum + person.weight, 0) === 0)) {
      addAction(actions, { key: `item-share:${cost.id}`, label: "Conferir divisão dos custos", kind: "order", href: orderHref });
    }
    const productCharge = costChargeByOrder.get(cost.orderId);
    if (tracking?.status === "open" && productCharge?.paymentStatus === "pending") {
      addAction(actions, { key: `products-payment:${cost.orderId}`, label: "Confirmar pagamento dos produtos", kind: "order", href: orderHref });
    }
  }

  const relatedRefunds = refunds.filter(refund => costsById.has(refund.costItemId) && activeCostIds.has(refund.costItemId));
  for (const refund of relatedRefunds.filter(row => row.status === "requested")) {
    const item = costsById.get(refund.costItemId)!;
    if (trackingById.get(item.trackingId)?.status === "open") {
      addAction(actions, { key: `refund:${refund.id}`, label: "Confirmar recebimento de reembolso", kind: "refund", href: `/orders/${encodeURIComponent(item.trackingId)}` });
    }
  }

  const readyForCommands = !!detail && pkg.reviewState === "confirmed" && !pkg.financialClosedAt;
  if (readyForCommands && activeReservations.length) {
    const freight = getChargeState(detail, "freight");
    const customs = getChargeState(detail, "customs");
    if (freight.state === "pending") addAction(actions, { key: "freight:value", label: "Informar frete", kind: "cost", href: detailHref });
    else if (freight.known && !freight.paid) addAction(actions, { key: "freight:payment", label: "Confirmar pagamento do frete", kind: "cost", href: detailHref });
    if (customs.state === "pending") addAction(actions, { key: "customs:value", label: "Informar Receita", kind: "cost", href: detailHref });
    else if (customs.known && !customs.paid) addAction(actions, { key: "customs:payment", label: "Confirmar pagamento da Receita", kind: "cost", href: detailHref });
  }

  if (readyForCommands && detail && detail.valuation && !detail.valuationError) {
    if (pkg.stage === "preparing" && !pkg.contentClosedAt && activeReservations.length) {
      addAction(actions, { key: "close-content", label: "Fechar conteúdo", kind: "logistics", href: detailHref });
    }
    if (pkg.legacyPackageId && !pkg.contentClosedAt && pkg.stage !== "preparing" && activeReservations.length) {
      addAction(actions, { key: "confirm-legacy-content", label: "Confirmar conteúdo legado", kind: "logistics", href: detailHref });
    }
    if (pkg.stage === "preparing" && pkg.contentClosedAt && detail.inPackage) {
      addAction(actions, { key: "dispatch", label: "Registrar despacho", kind: "logistics", href: detailHref });
    }
    if (pkg.stage === "sent") {
      addAction(actions, { key: "receive", label: "Registrar recebimento", kind: "logistics", href: detailHref });
    }
    const customs = getChargeState(detail, "customs");
    const customsResolved = customs.paid || customs.noCharge;
    if (pkg.contentClosedAt && detail.inPackage && customsResolved) {
      addAction(actions, { key: "close-financial", label: "Encerrar custos", kind: "cost", href: detailHref });
    }
  }

  return actions;
}

function makeCostSummary(pkg: typeof s.logisticsPackages.$inferSelect, detail: PackageDetail | null, actions: PackagePendingAction[]) {
  const activeLegacy = detail?.legacyProjections.filter(row => row.active) ?? [];
  const valuation = detail?.listValuation ?? detail?.valuation;
  const inherited = valuation?.items.flatMap(item => item.components.flatMap(component => component.units.map(unit => unit.amountCents))) ?? [];
  const newCharges = valuation?.charges.map(row => row.amountCents) ?? [];
  const legacyCharges = activeLegacy.map(row => row.knownCents);
  const directCharges = detail && !valuation ? [
    ...(detail.ownership.freight && detail.pkg.freightState === "known" ? [detail.pkg.freightCents ?? 0, detail.pkg.freightFeeCents ?? 0] : []),
    ...(detail.ownership.customs && detail.pkg.customsState === "known" ? [detail.pkg.customsCents ?? 0] : []),
  ] : [];
  const knownCents = moneySum([...inherited, ...newCharges, ...legacyCharges, ...directCharges]);
  const financialActions = actions.filter(row => row.kind !== "logistics");
  const unresolvedFinancialActions = financialActions.filter(row => row.key !== "close-financial");
  const freight = detail ? getChargeState(detail, "freight") : null;
  const customs = detail ? getChargeState(detail, "customs") : null;
  const paymentStatus = [
    freight?.paid ? "Frete Brasil pago" : freight?.noCharge ? "Frete sem cobrança" : freight?.state === "pending" ? "Frete a conferir" : freight?.known ? "Frete sem pagamento" : null,
    customs?.paid ? "Receita paga" : customs?.noCharge ? "Receita sem cobrança" : customs?.state === "pending" ? "Receita a conferir" : customs?.known ? "Receita sem pagamento" : null,
  ].filter((value): value is string => !!value);
  const pendingDescription = unresolvedFinancialActions[0]?.label ?? financialActions[0]?.label ?? actions[0]?.label;
  const description = pkg.financialClosedAt && unresolvedFinancialActions.length === 0
    ? "Sem pendências"
    : knownCents > 0 && unresolvedFinancialActions.length > 0
      ? `Parcial · ${paymentStatus.find(value => value.includes("a conferir") || value.includes("sem pagamento")) ?? pendingDescription ?? "custos a conferir"}`
      : unresolvedFinancialActions.length > 0
        ? pendingDescription ?? "Encargos pendentes"
        : paymentStatus[0] ?? (actions.length ? actions[0].label : "Sem pendências");
  const state = pkg.financialClosedAt && unresolvedFinancialActions.length === 0
    ? "closed"
    : unresolvedFinancialActions.length && knownCents > 0
      ? "partial"
      : unresolvedFinancialActions.length
        ? "pending"
        : knownCents > 0
          ? "known"
          : "empty";
  const title = state === "closed" ? "Custos encerrados" : state === "pending" ? "Encargos pendentes" : state === "empty" ? (actions.length ? "Ações pendentes" : "Custos a conferir") : "";
  return { knownCents, state, title, description } as const;
}

function passesFilter(row: PackageRow, filter: PackageListQuery["filter"], pendingOnly: boolean) {
  if (pendingOnly && row.pendingActions.length === 0) return false;
  switch (filter) {
    case "all": return true;
    case "pending": return row.pendingActions.length > 0;
    case "preparing": return row.pkg.stage === "preparing";
    case "sent": return row.pkg.stage === "sent";
    case "received": return row.pkg.stage === "received";
    case "content_closed": return row.pkg.stage === "preparing" && row.pkg.contentClosedAt !== null;
    case "review": return row.pkg.reviewState === "pending_review";
    case "closed": return row.pkg.financialClosedAt !== null;
  }
}

function compareRows(left: PackageRow, right: PackageRow, sort: PackageListQuery["sort"]) {
  const leftDate = noop(left.lastActivityAt) ?? noop(left.pkg.createdAt) ?? 0;
  const rightDate = noop(right.lastActivityAt) ?? noop(right.pkg.createdAt) ?? 0;
  if (sort === "recent" && leftDate !== rightDate) return rightDate - leftDate;
  if (sort === "oldest" && leftDate !== rightDate) return leftDate - rightDate;
  const byName = left.pkg.name.localeCompare(right.pkg.name, "pt-BR", { sensitivity: "base" });
  if (sort === "name_asc") return byName || left.pkg.id.localeCompare(right.pkg.id);
  if (sort === "name_desc") return -byName || left.pkg.id.localeCompare(right.pkg.id);
  return left.pkg.id.localeCompare(right.pkg.id);
}

export async function listLogisticsPackages(db: AppDatabase, userId: string, input: unknown) {
  const query = packageListQuerySchema.parse(input);
  return readDatabaseSnapshot(db, async tx => {
    const { workspaceId } = await authorization(tx, userId).requireWorkspaceMember();
    const packages = await tx.select().from(s.logisticsPackages).where(eq(s.logisticsPackages.workspaceId, workspaceId)).orderBy(asc(s.logisticsPackages.id)).all();
    const packageIds = packages.map(row => row.id);
    if (!packageIds.length) return { rows: [], counts: { all: 0, pending: 0, preparing: 0, sent: 0, received: 0 }, pagination: { page: query.page, total: 0, hasMore: false } };

    const [reservations, logisticsEvents, legacyPackages, legacyAssignments] = await Promise.all([
      tx.select().from(s.logisticsReservations).where(inArray(s.logisticsReservations.packageId, packageIds)).all(),
      tx.select().from(s.logisticsEvents).where(eq(s.logisticsEvents.workspaceId, workspaceId)).all(),
      tx.select().from(s.purchasePackages).where(inArray(s.purchasePackages.id, packages.flatMap(row => row.legacyPackageId ? [row.legacyPackageId] : []))).all(),
      packages.some(row => row.legacyPackageId)
        ? tx.select().from(s.purchasePackageItems).where(inArray(s.purchasePackageItems.packageId, packages.flatMap(row => row.legacyPackageId ? [row.legacyPackageId] : []))).all()
        : Promise.resolve([]),
    ]);
    const reservationsByPackage = new Map<string, typeof reservations>();
    for (const reservation of reservations) reservationsByPackage.set(reservation.packageId, [...(reservationsByPackage.get(reservation.packageId) ?? []), reservation]);
    const activeReservationsByPackage = new Map(packageIds.map(id => [id, (reservationsByPackage.get(id) ?? []).filter(row => row.releasedAt === null)]));
    const legacyById = new Map(legacyPackages.map(row => [row.id, row]));
    const legacyItemsByPackage = new Map<string, typeof legacyAssignments>();
    for (const row of legacyAssignments) legacyItemsByPackage.set(row.packageId, [...(legacyItemsByPackage.get(row.packageId) ?? []), row]);

    const costItemIds = [...new Set([
      ...reservations.map(row => row.costItemId),
      ...legacyAssignments.map(row => row.costItemId),
    ])];
    const costItems = costItemIds.length ? await tx.select().from(s.purchaseItemCosts).where(inArray(s.purchaseItemCosts.id, costItemIds)).all() : [];
    const costsById = new Map(costItems.map(row => [row.id, row]));
    const orderIds = [...new Set(costItems.map(row => row.orderId))];
    const trackingIds = [...new Set(costItems.map(row => row.trackingId))];
    const legacyPackageIds = packages.flatMap(row => row.legacyPackageId ? [row.legacyPackageId] : []);
    const refunds = costItemIds.length
      ? await tx.select().from(s.purchaseCostRefunds).where(inArray(s.purchaseCostRefunds.costItemId, costItemIds)).all()
      : [];
    const [charges, trackings, participants, positions, accounts, refundEvents, packageCostEvents, manifests, costOrders] = await Promise.all([
      orderIds.length || legacyPackageIds.length
        ? tx.select().from(s.purchaseCostCharges).where(or(
          orderIds.length ? inArray(s.purchaseCostCharges.orderId, orderIds) : undefined,
          legacyPackageIds.length ? inArray(s.purchaseCostCharges.packageId, legacyPackageIds) : undefined,
        )).all()
        : Promise.resolve([]),
      trackingIds.length ? tx.select().from(s.purchaseCostTrackings).where(inArray(s.purchaseCostTrackings.id, trackingIds)).all() : Promise.resolve([]),
      costItemIds.length ? tx.select().from(s.purchaseCostParticipants).where(inArray(s.purchaseCostParticipants.costItemId, costItemIds)).all() : Promise.resolve([]),
      costItemIds.length ? tx.select().from(s.orderWarehousePositions).where(inArray(s.orderWarehousePositions.costItemId, costItemIds)).all() : Promise.resolve([]),
      tx.select().from(s.hubbuyAccounts).where(and(eq(s.hubbuyAccounts.workspaceId, workspaceId), isNull(s.hubbuyAccounts.deletedAt))).all(),
      refunds.length ? tx.select().from(s.purchaseCostRefundEvents).where(inArray(s.purchaseCostRefundEvents.refundId, refunds.map(row => row.id))).all() : Promise.resolve([]),
      legacyPackageIds.length
        ? tx.select().from(s.purchaseCostPackageEvents).where(inArray(s.purchaseCostPackageEvents.packageId, legacyPackageIds)).all()
        : Promise.resolve([]),
      tx.select().from(s.logisticsManifests).where(inArray(s.logisticsManifests.packageId, packageIds)).all(),
      orderIds.length ? tx.select().from(s.purchaseCostOrders).where(inArray(s.purchaseCostOrders.id, orderIds)).all() : Promise.resolve([]),
    ]);
    const chargesByPackageOrOrder = new Map<string, typeof charges>();
    for (const charge of charges) {
      const key = charge.packageId ? `package:${charge.packageId}` : charge.orderId ? `order:${charge.orderId}` : "";
      if (key) chargesByPackageOrOrder.set(key, [...(chargesByPackageOrOrder.get(key) ?? []), charge]);
    }
    const eventsByPackage = new Map<string, typeof logisticsEvents>();
    for (const event of logisticsEvents) eventsByPackage.set(event.resourceId, [...(eventsByPackage.get(event.resourceId) ?? []), event]);
    const reservationsByCostItem = new Map<string, typeof reservations>();
    for (const reservation of reservations) reservationsByCostItem.set(reservation.costItemId, [...(reservationsByCostItem.get(reservation.costItemId) ?? []), reservation]);
    const packageEventsById = new Map<string, typeof packageCostEvents>();
    for (const event of packageCostEvents) packageEventsById.set(event.packageId, [...(packageEventsById.get(event.packageId) ?? []), event]);
    const manifestsByPackage = new Map<string, typeof manifests>();
    for (const manifest of manifests) manifestsByPackage.set(manifest.packageId, [...(manifestsByPackage.get(manifest.packageId) ?? []), manifest]);

    const packageServices = logisticsPackageServices(db, userId);
    const rows: PackageRow[] = [];
    for (const pkg of packages) {
      const activeReservations = activeReservationsByPackage.get(pkg.id) ?? [];
      const detail = activeReservations.length || pkg.legacyPackageId || pkg.reviewState === "pending_review"
        ? await packageServices.getFromSnapshot(tx, pkg.id)
        : null;
      const historyReservations = reservationsByPackage.get(pkg.id) ?? [];
      const activeItemIds = new Set(activeReservations.map(row => row.costItemId));
      const relatedItems = costItems.filter(row => activeItemIds.has(row.id));
      const relatedCharges = [
        ...(pkg.legacyPackageId ? chargesByPackageOrOrder.get(`package:${pkg.legacyPackageId}`) ?? [] : []),
        ...relatedItems.flatMap(item => chargesByPackageOrOrder.get(`order:${item.orderId}`) ?? []),
      ];
      const relatedChargeIds = new Set(relatedCharges.map(row => row.id));
      const relevantRefundIds = new Set(historyReservations.flatMap(reservation => refunds.filter(refund => refund.costItemId === reservation.costItemId).map(refund => refund.id)));
      const costItemIdsForLatest = new Set([
        ...historyReservations.map(row => row.costItemId),
        ...(pkg.legacyPackageId ? (legacyItemsByPackage.get(pkg.legacyPackageId) ?? []).map(row => row.costItemId) : []),
      ]);
      const orderIdsForLatest = new Set([...costItemIdsForLatest].flatMap(id => costsById.get(id)?.orderId ? [costsById.get(id)!.orderId] : []));
      const relatedOrderRows = costOrders.filter(row => orderIdsForLatest.has(row.id));
      const latest = latestDate(
        pkg.createdAt,
        pkg.contentClosedAt,
        pkg.dispatchedAt,
        pkg.receivedAt,
        pkg.financialClosedAt,
        ...historyReservations.flatMap(row => [row.createdAt, row.releasedAt]),
        ...(detail?.events.map(row => row.createdAt) ?? []),
        ...(eventsByPackage.get(pkg.id)?.map(row => row.createdAt) ?? []),
        ...(detail?.manifests.map(row => row.createdAt) ?? []),
        ...(pkg.legacyPackageId ? [legacyById.get(pkg.legacyPackageId)?.updatedAt, ...(packageEventsById.get(pkg.legacyPackageId)?.map(row => row.createdAt) ?? [])] : []),
        ...relatedCharges.filter(row => relatedChargeIds.has(row.id)).map(row => row.updatedAt),
        ...relatedOrderRows.map(row => row.updatedAt),
        ...refunds.filter(row => relevantRefundIds.has(row.id)).map(row => row.updatedAt),
        ...refundEvents.filter(row => relevantRefundIds.has(row.refundId)).map(row => row.createdAt),
      );
      const activeIds = new Set(activeReservations.map(row => row.costItemId));
      const activeCosts = costItems.filter(row => activeIds.has(row.id));
      const activeParticipants = participants.filter(row => activeIds.has(row.costItemId));
      const activePositions = positions.filter(row => activeIds.has(row.costItemId));
      const activeRefunds = refunds.filter(row => activeIds.has(row.costItemId));
      const activeProductCharges = charges.filter(row => row.chargeType === "products" && activeCosts.some(item => item.orderId === row.orderId));
      const actions = makeActions(pkg, detail, activeReservations, costItems, costsById, activeProductCharges, trackings, activeParticipants, activePositions, accounts, activeRefunds);
      const costSummary = makeCostSummary(pkg, detail, actions);
      rows.push({
        pkg,
        unitCount: activeReservations.length,
        productCount: activeIds.size,
        freightConfirmed: !!detail?.inPackage,
        lastActivityAt: latest,
        costSummary,
        pendingActions: actions,
      });
    }

    const counts = {
      all: rows.length,
      pending: rows.filter(row => row.pendingActions.length > 0).length,
      preparing: rows.filter(row => row.pkg.stage === "preparing").length,
      sent: rows.filter(row => row.pkg.stage === "sent").length,
      received: rows.filter(row => row.pkg.stage === "received").length,
    };
    const normalizedSearch = query.search.toLocaleLowerCase("pt-BR");
    const filtered = rows
      .filter(row => !normalizedSearch || row.pkg.name.toLocaleLowerCase("pt-BR").includes(normalizedSearch))
      .filter(row => passesFilter(row, query.filter, query.pendingOnly))
      .sort((left, right) => compareRows(left, right, query.sort));
    const pageRows = filtered.slice(query.page * pageSize, (query.page + 1) * pageSize);
    return {
      rows: pageRows,
      counts,
      pagination: { page: query.page, total: filtered.length, hasMore: (query.page + 1) * pageSize < filtered.length },
    };
  });
}
