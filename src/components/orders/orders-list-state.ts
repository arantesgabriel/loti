import type { WarehouseData } from "./orders-screen";

export type OrdersView = "all" | "warehouse" | "available" | "awaiting";
export const orderSortOptions = [
  ["product", "Produto"], ["stage", "Etapa"], ["units", "Unidades"], ["cost", "Custo"],
] as const;
export type OrderSort = "" | typeof orderSortOptions[number][0];
export type OrdersFilters = {
  search: string; account: string; person: string; origin: string;
  trackingId: string; status: string; view: OrdersView; page: number; sort?: OrderSort; direction?: "asc" | "desc";
};
export const emptyOrdersFilters: OrdersFilters = { search: "", account: "", person: "", origin: "", trackingId: "", status: "", view: "all", page: 0 };
export const ordersFilterKeys = ["search", "account", "person", "origin", "trackingId", "status", "view"] as const;

export function filtersUrl(filters: OrdersFilters) {
  const params = new URLSearchParams();
  for (const key of ordersFilterKeys) if (filters[key] && !(key === "view" && filters[key] === "all")) params.set(key, filters[key]);
  if (filters.sort) { params.set("sort", filters.sort); params.set("direction", filters.direction ?? "asc"); }
  if (filters.page) params.set("page", String(filters.page));
  return params.size ? `/orders?${params}` : "/orders";
}

export function ordersView(value: string): OrdersView {
  return ["warehouse", "available", "awaiting"].includes(value) ? value as OrdersView : "all";
}

export function parseOrdersFilters(get: (key: string) => string): OrdersFilters {
  const page = Number(get("page"));
  const origin = get("origin"), status = get("status");
  return {
    search: get("search").trim().slice(0, 200),
    account: get("account").slice(0, 200),
    person: get("person").slice(0, 200),
    origin: ["original", "additional"].includes(origin) ? origin : "",
    trackingId: get("trackingId").slice(0, 200),
    status: ["review", "awaiting", "warehouse", "available", "package", "sent", "received"].includes(status) ? status : "",
    view: ordersView(get("view")),
    sort: orderSortOptions.find(([field]) => field === get("sort"))?.[0] ?? "",
    direction: get("direction") === "desc" ? "desc" : "asc",
    page: Number.isSafeInteger(page) && page >= 0 ? Math.min(page, 10000) : 0,
  };
}

/** This projection is for display. Keep the confirmed row for actions and reservations. */
export function projectArrival(row: WarehouseData["rows"][number], quantity: number) {
  const recorded = row.reviewState === "confirmed" ? row.receivedUnits : [];
  const excluded = new Set([...recorded, ...row.cancelledUnits]);
  const reserved = new Set(row.reservations.map(reservation => reservation.unitIndex));
  const arrivals = Array.from({ length: row.quantity }, (_, index) => index).filter(unit => !excluded.has(unit))
    .sort((left, right) => Number(reserved.has(right)) - Number(reserved.has(left))).slice(0, quantity);
  return {
    ...row, reviewState: "confirmed" as const, receivedUnits: [...recorded, ...arrivals],
    availableUnits: [...row.availableUnits, ...arrivals.filter(unit => !reserved.has(unit))],
  };
}

/** Stage labels describe physical units, never infer receipt from QC/payment. */
export function orderStage(row: WarehouseData["rows"][number], packages: WarehouseData["packages"]) {
  if (row.reviewState === "pending_review") return { label: "Chegada sem registro", tone: "warning" as const, detail: "" };
  const cancelled = new Set(row.cancelledUnits);
  const received = row.receivedUnits.filter(unit => !cancelled.has(unit)).length;
  const awaiting = Math.max(0, row.quantity - cancelled.size - received);
  const counts = { warehouse: row.availableUnits.length, package: 0, sent: 0, received: 0 };
  const reservationsByPackage = new Map<string, number>();
  for (const reservation of row.reservations) {
    const pkg = packages.find(candidate => candidate.id === reservation.packageId);
    if (!pkg) continue;
    reservationsByPackage.set(pkg.id, (reservationsByPackage.get(pkg.id) ?? 0) + 1);
    if (pkg.stage === "sent") counts.sent++;
    else if (pkg.stage === "received") counts.received++;
    else if (pkg.contentClosedAt && pkg.freightConfirmed) counts.package++;
    else counts.warehouse++;
  }
  const reservationDetails = [...reservationsByPackage].map(([packageId, quantity]) => {
    const pkg = packages.find(candidate => candidate.id === packageId);
    return `${quantity === 1 ? "Reservado" : "Reservadas"} no pacote ${pkg?.name ?? "vinculado"} · ${quantity} ${quantity === 1 ? "unidade" : "unidades"}`;
  });
  const hasOpenPackageReservation = row.reservations.some(reservation => {
    const pkg = packages.find(candidate => candidate.id === reservation.packageId);
    return pkg?.stage === "preparing" && !pkg.contentClosedAt;
  });
  const stages = [
    { count: awaiting, label: "A caminho", detail: "a caminho", tone: "info" as const },
    { count: counts.warehouse, label: "No armazém", detail: "no armazém", tone: "success" as const },
    { count: counts.package, label: "Em pacote", detail: "em pacote", tone: "neutral" as const },
    { count: counts.sent, label: "Enviado", detail: "enviadas", tone: "info" as const },
    { count: counts.received, label: "Recebido no Brasil", detail: "recebidas no Brasil", tone: "success" as const },
  ].filter(stage => stage.count > 0);
  if (stages.length > 1) return { label: "Etapas diferentes", tone: "neutral" as const, detail: [...stages.map(stage => `${stage.count} ${stage.detail}`), ...reservationDetails].join(" · ") };
  if (stages.length) {
    const linked = hasOpenPackageReservation && stages[0].label === "No armazém";
    return {
      label: linked ? "Vinculado" : stages[0].label,
      tone: linked ? "neutral" as const : stages[0].tone,
      detail: reservationDetails.length ? reservationDetails.join(" · ") : stages[0].label === "No armazém" ? "No armazém" : "",
    };
  }
  return { label: cancelled.size === row.quantity ? "Cancelado" : "Etapa indefinida", tone: "neutral" as const, detail: "" };
}

export function matchesArrivalFilters(row: WarehouseData["rows"][number], packages: WarehouseData["packages"], params: URLSearchParams) {
  const matchesStage = (stage: string | null) => {
    switch (stage) {
      case "review": return row.reviewState === "pending_review";
      case "available": return row.availableUnits.length > 0;
      case "awaiting": {
        const cancelled = new Set(row.cancelledUnits);
        return row.quantity - cancelled.size > row.receivedUnits.filter(unit => !cancelled.has(unit)).length;
      }
      case "warehouse":
        return row.availableUnits.length > 0 || row.reservations.some(reservation => {
          const pkg = packages.find(candidate => candidate.id === reservation.packageId);
          return pkg?.stage === "preparing" && (!pkg.contentClosedAt || !pkg.freightConfirmed);
        });
      // Package, sent and received membership cannot change when units arrive.
      default: return true;
    }
  };
  return (!params.get("account") || params.get("account") === row.accountId)
    && matchesStage(params.get("view")) && matchesStage(params.get("status"));
}
