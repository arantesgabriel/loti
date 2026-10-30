import type { WarehouseData } from "./orders-screen";

export type OrdersView = "all" | "warehouse" | "available" | "awaiting";
export type OrdersFilters = {
  search: string; account: string; person: string; origin: string;
  trackingId: string; status: string; view: OrdersView; page: number;
};
export const emptyOrdersFilters: OrdersFilters = { search: "", account: "", person: "", origin: "", trackingId: "", status: "", view: "all", page: 0 };
export const ordersFilterKeys = ["search", "account", "person", "origin", "trackingId", "status", "view"] as const;

export function filtersUrl(filters: OrdersFilters) {
  const params = new URLSearchParams();
  for (const key of ordersFilterKeys) if (filters[key] && !(key === "view" && filters[key] === "all")) params.set(key, filters[key]);
  if (filters.page) params.set("page", String(filters.page));
  return params.size ? `/orders?${params}` : "/orders";
}

export function ordersView(value: string): OrdersView {
  return ["warehouse", "available", "awaiting"].includes(value) ? value as OrdersView : "all";
}

/** Stage labels describe physical units, never infer receipt from QC/payment. */
export function orderStage(row: WarehouseData["rows"][number], packages: WarehouseData["packages"]) {
  if (row.reviewState === "pending_review") return { label: "A conferir", tone: "warning" as const, detail: "Conferência legada pendente" };
  const cancelled = new Set(row.cancelledUnits);
  const received = row.receivedUnits.filter(unit => !cancelled.has(unit)).length;
  const awaiting = Math.max(0, row.quantity - cancelled.size - received);
  const counts = { warehouse: row.availableUnits.length, package: 0, sent: 0, received: 0 };
  for (const reservation of row.reservations) {
    const pkg = packages.find(candidate => candidate.id === reservation.packageId);
    if (!pkg) continue;
    if (pkg.stage === "sent") counts.sent++;
    else if (pkg.stage === "received") counts.received++;
    else if (pkg.contentClosedAt && pkg.freightConfirmed) counts.package++;
    else counts.warehouse++;
  }
  const stages = [
    { count: awaiting, label: "A caminho", detail: "a caminho", tone: "info" as const },
    { count: counts.warehouse, label: "Recebido", detail: "no armazém", tone: "success" as const },
    { count: counts.package, label: "Em pacote", detail: "em pacote", tone: "neutral" as const },
    { count: counts.sent, label: "Enviado", detail: "enviadas", tone: "info" as const },
    { count: counts.received, label: "Recebido no Brasil", detail: "recebidas no Brasil", tone: "success" as const },
  ].filter(stage => stage.count > 0);
  if (stages.length > 1) return { label: "Etapas diferentes", tone: "neutral" as const, detail: stages.map(stage => `${stage.count} ${stage.detail}`).join(" · ") };
  if (stages.length) return { label: stages[0].label, tone: stages[0].tone, detail: stages[0].label === "Recebido" ? "No armazém" : "" };
  return { label: cancelled.size === row.quantity ? "Cancelado" : "A conferir", tone: "neutral" as const, detail: "" };
}
