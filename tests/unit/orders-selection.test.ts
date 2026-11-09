import { expect, it } from "vitest";
import { ordersSelectionSummary, reconcileOrdersSelection, type OrderRow } from "@/components/orders/orders-selection";

const row = (overrides: Partial<OrderRow> = {}) => ({ costItemId: "item", name: "Cabo", revision: 3, accountId: "account", quantity: 3, availableUnits: [0, 2], unitComponents: [{ amountCents: 100 }], ...overrides }) as OrderRow;

it("reconciles refreshed identities across pages, clamps availability and removes missing items", () => {
  const original = row();
  const other = row({ costItemId: "off-page" });
  const result = reconcileOrdersSelection({ item: { row: original, quantity: 2 }, "off-page": { row: other, quantity: 1 } }, [row({ revision: 4, availableUnits: [2] })], ["item", "off-page"]);
  expect(result.selection.item.quantity).toBe(1);
  expect(result.selection.item.row.revision).toBe(4);
  expect(result.selection["off-page"]).toBeUndefined();
  expect(result.changed).toHaveLength(2);
});

it("ignores older responses and retains selections outside a checked batch", () => {
  const original = { item: { row: row(), quantity: 2 } };
  expect(reconcileOrdersSelection(original, [row({ revision: 2, availableUnits: [] })], ["item"]).selection).toEqual(original);
  expect(reconcileOrdersSelection(original, [], ["another-item"]).selection).toEqual(original);
});

it("keeps stable unit cent allocation and distinguishes partial financial bases", () => {
  expect(ordersSelectionSummary({ item: { row: row(), quantity: 2 } })).toMatchObject({ units: 2, base: 67 });
  expect(ordersSelectionSummary({ item: { row: row({ unitComponents: undefined }), quantity: 1 } }).base).toBeNull();
  expect(ordersSelectionSummary({})).toMatchObject({ units: 0, base: 0 });
});
