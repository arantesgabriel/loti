import { unitMinorCapacity } from "@/lib/domain/warehouse-calculations";
import type { WarehouseData } from "./orders-screen";

export type OrderRow = WarehouseData["rows"][number];
export type OrdersSelection = Record<string, { quantity: number; row: OrderRow }>;

export function reconcileOrdersSelection(current: OrdersSelection, fresh: OrderRow[], checkedIds: string[]) {
  const next = { ...current };
  const changed: string[] = [];
  for (const id of checkedIds) {
    const prior = current[id];
    if (!prior) continue;
    const row = fresh.find(row => row.costItemId === id);
    if (row && row.revision < prior.row.revision) continue;
    const quantity = row ? Math.min(prior.quantity, row.availableUnits.length) : 0;
    if (quantity !== prior.quantity || !row || row.accountId !== prior.row.accountId || row.availableUnits.join() !== prior.row.availableUnits.join()) changed.push(prior.row.name);
    if (!quantity || !row) delete next[id];
    else next[id] = { row, quantity };
  }
  return { selection: next, changed };
}

/** Preserve the existing stable-unit cent allocation; never derive a new price. */
export function ordersSelectionSummary(selected: OrdersSelection) {
  const entries = Object.values(selected).filter(entry => entry.quantity > 0);
  const units = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const base = entries.every(({ row }) => row.unitComponents?.every(component => component.amountCents !== null))
    ? entries.reduce((sum, { row, quantity }) => sum + row.availableUnits.slice(0, quantity).reduce((total, index) => total + row.unitComponents!.reduce((value, component) => value + unitMinorCapacity(component.amountCents!, row.quantity, index), 0), 0), 0)
    : null;
  return { entries, units, base };
}
