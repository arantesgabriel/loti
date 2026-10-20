import { describe, expect, it } from "vitest";
import { presentIndividualRights, type AvailableCreditShare, type RefundProductOrigin } from "@/lib/domain/hubbuy-rights-presentation";

const entry = (id: string, sequence: number, sourceType = "refund_received", sourceId = id) => ({ id, sequence, sourceType, sourceId });
const share = (id: string, cny: number, brl: number, personId = "alice"): AvailableCreditShare => ({ id: `share-${id}-${personId}`, creditEntryId: id, personId, availableCnyMinor: cny, availableHistoricalBrlCents: brl });
const total = (cny: number, brl: number, personId = "alice") => ({ personId, availableCnyMinor: cny, availableHistoricalBrlCents: brl });
const product = (refundId: string, costItemId: string, name = "Produto X"): RefundProductOrigin => ({ refundId, costItemId, trackingId: `tracking-${costItemId}`, name, variant: "Modelo A" });

describe("individual right origins", () => {
  it("explains the exact remaining CNY and historical BRL instead of an original refund total", () => {
    const [right] = presentIndividualRights([total(1898, 1425)], [share("refund-1", 1898, 1425)], [entry("refund-1", 0)], [product("refund-1", "cost-x")]);
    expect(right.origins).toEqual([{ id: "refund-product:cost-x", kind: "refund_product", label: "Produto X", variant: "Modelo A", trackingId: "tracking-cost-x", costItemId: "cost-x", availableCnyMinor: 1898, availableHistoricalBrlCents: 1425 }]);
  });

  it("groups lots by product identity and person, keeping namesakes in other purchases separate", () => {
    const rights = presentIndividualRights([total(9, 6), total(3, 2, "bob")], [share("a", 3, 2), share("b", 2, 1), share("c", 4, 3), share("a", 3, 2, "bob")], [entry("a", 5), entry("b", 1), entry("c", 3)], [product("a", "x"), product("b", "x"), product("c", "y")]);
    expect(rights[0].origins.map(row => [row.id, row.availableCnyMinor, row.availableHistoricalBrlCents])).toEqual([["refund-product:x", 5, 3], ["refund-product:y", 4, 3]]);
    expect(rights[1].origins.map(row => [row.id, row.availableCnyMinor])).toEqual([["refund-product:x", 3]]);
  });

  it("omits exhausted lots while preserving positive CNY with zero BRL and residual BRL", () => {
    const [right] = presentIndividualRights([total(1, 1)], [share("empty", 0, 0), share("free", 1, 0), share("basis", 0, 1)], [entry("empty", 0), entry("free", 1), entry("basis", 2)], []);
    expect(right.origins.map(row => [row.id, row.availableCnyMinor, row.availableHistoricalBrlCents])).toEqual([["entry:free", 1, 0], ["entry:basis", 0, 1]]);
    expect(presentIndividualRights([total(0, 0)], [share("empty", 0, 0)], [entry("empty", 0)], [])[0].origins).toEqual([]);
  });

  it("labels reconciled, restored and unknown credits without inventing products or links", () => {
    const entries = [entry("a", 0, "opening_balance"), entry("b", 1, "manual_adjustment"), entry("c", 2, "reversal"), entry("d", 3, "refund_received"), entry("e", 4, "future-type")];
    const [right] = presentIndividualRights([total(5, 5)], entries.map(row => share(row.id, 1, 1)), entries, []);
    expect(right.origins.map(row => row.label)).toEqual(["Saldo inicial conciliado", "Crédito de conciliação", "Saldo restaurado por correção", "Origem não identificada", "Origem não identificada"]);
    expect(right.origins.every(row => row.trackingId === null && row.costItemId === null)).toBe(true);
  });

  it("keeps separate manual credits and orders equal sequences deterministically", () => {
    const entries = [entry("z", 0, "manual_adjustment"), entry("a", 0, "manual_adjustment")];
    const [right] = presentIndividualRights([total(2, 2)], entries.map(row => share(row.id, 1, 1)), entries, []);
    expect(right.origins.map(row => row.id)).toEqual(["entry:a", "entry:z"]);
  });

  it("rejects totals that would hide missing or mismatched rights", () => {
    expect(() => presentIndividualRights([total(2, 1)], [share("a", 1, 1)], [entry("a", 0)], [])).toThrow("não fecha");
    expect(() => presentIndividualRights([total(1, 2)], [share("a", 1, 1)], [entry("a", 0)], [])).toThrow("não fecha");
    expect(() => presentIndividualRights([], [share("a", 1, 1)], [entry("a", 0)], [])).toThrow("titular");
    expect(() => presentIndividualRights([total(0, 0)], [share("a", -1, 0)], [entry("a", 0)], [])).toThrow("inconsistente");
  });
});
