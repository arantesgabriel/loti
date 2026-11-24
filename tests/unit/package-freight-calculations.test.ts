import { describe, expect, it } from "vitest";
import { allocateFreightComponent, type FreightUnit } from "@/lib/domain/package-freight-calculations";

const personal = (costItemId: string, count: number, personId: string, start: number): FreightUnit[] => Array.from({ length: count }, (_, unitIndex) => ({ costItemId, unitIndex, order: start + unitIndex, participants: [{ personId, order: 0, weight: 1 }] }));

describe("freight physical-unit allocation", () => {
  it("splits five plus five physical units equally, independent of line counts", () => {
    const result = allocateFreightComponent({ units: [...personal("line-a", 5, "A", 0), ...personal("line-b", 5, "B", 5)], sources: [{ sourceId: "receipt", order: 0, amountMinor: 10000 }] });
    expect(result.allocations.filter(row => row.personId === "A").reduce((sum, row) => sum + row.amountMinor, 0)).toBe(5000);
    expect(result.allocations.filter(row => row.personId === "B").reduce((sum, row) => sum + row.amountMinor, 0)).toBe(5000);
  });

  it("reproduces the 30-unit native obligation with six shared units counted once", () => {
    const shared: FreightUnit[] = Array.from({ length: 6 }, (_, unitIndex) => ({ costItemId: "shared", unitIndex, order: 24 + unitIndex, participants: ["A", "C", "D"].map((personId, order) => ({ personId, order, weight: 1 })) }));
    const units = [...personal("a", 9, "A", 0), ...personal("b", 8, "B", 9), ...personal("c", 2, "C", 17), ...personal("d", 5, "D", 19), ...shared];
    const result = allocateFreightComponent({ units, sources: [{ sourceId: "freight", order: 0, amountMinor: 76860 }] });
    expect(result.units).toHaveLength(30);
    expect(["A", "B", "C", "D"].map(person => result.allocations.filter(row => row.personId === person).reduce((sum, row) => sum + row.amountMinor, 0))).toEqual([28182, 20496, 10248, 17934]);
    expect(allocateFreightComponent({ units: [...units].reverse(), sources: [{ sourceId: "freight", order: 0, amountMinor: 76860 }] })).toEqual(result);
  });

  it("preserves source and unit margins even with more units than cents", () => {
    for (let amount = 0; amount <= 35; amount++) {
      const units = personal("item", 7, "A", 0).map(unit => ({ ...unit, participants: [{ personId: "A", order: 0, weight: 3 }, { personId: "B", order: 1, weight: 2 }] }));
      const sources = [{ sourceId: "old", order: 0, amountMinor: Math.floor(amount / 3) }, { sourceId: "topup", order: 1, amountMinor: amount - Math.floor(amount / 3) }];
      const result = allocateFreightComponent({ units, sources });
      const single = allocateFreightComponent({ units, sources: [{ sourceId: "single", order: 0, amountMinor: amount }] });
      for (const personId of ["A", "B"]) expect(result.allocations.filter(row => row.personId === personId).reduce((sum, row) => sum + row.amountMinor, 0)).toBe(single.allocations.filter(row => row.personId === personId).reduce((sum, row) => sum + row.amountMinor, 0));
      for (const source of sources) expect(result.allocations.filter(row => row.sourceId === source.sourceId).reduce((sum, row) => sum + row.amountMinor, 0)).toBe(source.amountMinor);
      for (const unit of result.units) expect(result.allocations.filter(row => row.costItemId === unit.costItemId && row.unitIndex === unit.unitIndex).reduce((sum, row) => sum + row.amountMinor, 0)).toBe(unit.amountMinor);
    }
  });

  it("rejects empty/duplicate units, missing weights and inconsistent snapshots", () => {
    const unit = personal("item", 1, "A", 0)[0], sources = [{ sourceId: "s", order: 0, amountMinor: 1 }];
    expect(() => allocateFreightComponent({ units: [], sources })).toThrow();
    expect(() => allocateFreightComponent({ units: [unit, { ...unit, order: 1 }], sources })).toThrow();
    expect(() => allocateFreightComponent({ units: [{ ...unit, participants: [{ personId: "A", order: 0, weight: 0 }] }], sources })).toThrow();
    expect(() => allocateFreightComponent({ units: [unit, { ...unit, unitIndex: 1, order: 1, participants: [{ personId: "B", order: 0, weight: 1 }] }], sources })).toThrow(/composições/);
  });
});
