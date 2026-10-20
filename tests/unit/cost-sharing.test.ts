import { describe, expect, it } from "vitest";
import { allocateItemCost, type CostParticipant } from "@/lib/domain/cost-sharing";
import { parsePercentageBps, percentageBpsInput } from "@/lib/domain/money";

const equal = (personIds: string[]): CostParticipant[] => personIds.map(personId => ({ personId }));

describe("allocateItemCost", () => {
  it("parses decimal percentages exactly as basis points", () => {
    expect(parsePercentageBps("33,33")).toBe(3_333);
    expect(parsePercentageBps("33.34%")).toBe(3_334);
    expect(parsePercentageBps("100,00")).toBe(10_000);
    expect(parsePercentageBps(percentageBpsInput(3_333))).toBe(3_333);
    expect(() => parsePercentageBps("33,333")).toThrow(/duas casas/);
    expect(() => parsePercentageBps("100,01")).toThrow(/entre 0% e 100%/);
  });
  it("splits the physical subtotal equally without changing units", () => {
    expect(allocateItemCost({ quantity: 1, unitPriceCents: 30_000, sharingMode: "equal" }, equal(["gabriel", "amiga1", "amiga2"]))).toEqual({
      subtotalCents: 30_000,
      participants: [
        { personId: "gabriel", allocationOrder: 0, amountCents: 10_000 },
        { personId: "amiga1", allocationOrder: 1, amountCents: 10_000 },
        { personId: "amiga2", allocationOrder: 2, amountCents: 10_000 },
      ],
    });
    expect(allocateItemCost({ quantity: 2, unitPriceCents: 30_000, sharingMode: "equal" }, equal(["a", "b", "c"])).subtotalCents).toBe(60_000);
  });

  it("assigns equal-division remainder cents by participant order", () => {
    expect(allocateItemCost({ quantity: 1, unitPriceCents: 10_000, sharingMode: "equal" }, equal(["a", "b", "c"])).participants.map(p => p.amountCents)).toEqual([3_334, 3_333, 3_333]);
    expect(allocateItemCost({ quantity: 1, unitPriceCents: 1, sharingMode: "equal" }, equal(["a", "b", "c"])).participants.map(p => p.amountCents)).toEqual([1, 0, 0]);
  });

  it("uses percentage basis points and largest-remainder rounding", () => {
    const shares = allocateItemCost({ quantity: 1, unitPriceCents: 30_000, sharingMode: "percentage" }, [
      { personId: "a", percentageBps: 5_000 }, { personId: "b", percentageBps: 3_000 }, { personId: "c", percentageBps: 2_000 },
    ]);
    expect(shares.participants.map(p => p.amountCents)).toEqual([15_000, 9_000, 6_000]);
    const largestRemainder = allocateItemCost({ quantity: 1, unitPriceCents: 1, sharingMode: "percentage" }, [
      { personId: "a", percentageBps: 3_333 }, { personId: "b", percentageBps: 3_333 }, { personId: "c", percentageBps: 3_334 },
    ]);
    expect(largestRemainder.participants.map(p => p.amountCents)).toEqual([0, 0, 1]);
  });

  it("accepts zero and fixed amounts only when they close exactly", () => {
    expect(allocateItemCost({ quantity: 1, unitPriceCents: 30_000, sharingMode: "fixed" }, [
      { personId: "a", amountCents: 12_000 }, { personId: "b", amountCents: 10_000 }, { personId: "c", amountCents: 8_000 },
    ]).participants.map(p => p.amountCents)).toEqual([12_000, 10_000, 8_000]);
    expect(allocateItemCost({ quantity: 1, unitPriceCents: 0, sharingMode: "equal" }, equal(["a", "b"])).participants.map(p => p.amountCents)).toEqual([0, 0]);
    expect(() => allocateItemCost({ quantity: 1, unitPriceCents: 30_000, sharingMode: "fixed" }, [
      { personId: "a", amountCents: 11_999 }, { personId: "b", amountCents: 10_000 }, { personId: "c", amountCents: 8_000 },
    ])).toThrow(/somar exatamente/);
  });

  it("preserves pending equal and percentage compositions when price is null", () => {
    expect(allocateItemCost({ quantity: 1, unitPriceCents: null, sharingMode: "equal" }, equal(["a", "b"])).participants.map(p => p.amountCents)).toEqual([null, null]);
    expect(allocateItemCost({ quantity: 1, unitPriceCents: null, sharingMode: "percentage" }, [
      { personId: "a", percentageBps: 7_500 }, { personId: "b", percentageBps: 2_500 },
    ]).participants.map(p => p.amountCents)).toEqual([null, null]);
    expect(() => allocateItemCost({ quantity: 1, unitPriceCents: null, sharingMode: "fixed" }, [
      { personId: "a", amountCents: 0 },
    ])).toThrow(/preço/);
  });

  it("rejects invalid membership shapes and unclosed percentages", () => {
    expect(() => allocateItemCost({ quantity: 1, unitPriceCents: 100, sharingMode: "equal" }, [])).toThrow(/ao menos/);
    expect(() => allocateItemCost({ quantity: 1, unitPriceCents: 100, sharingMode: "equal" }, equal(["a", "a"]))).toThrow(/únicas/);
    expect(() => allocateItemCost({ quantity: 1, unitPriceCents: 30_000, sharingMode: "percentage" }, [
      { personId: "a", percentageBps: 4_950 }, { personId: "b", percentageBps: 5_050 },
    ])).not.toThrow();
    expect(() => allocateItemCost({ quantity: 1, unitPriceCents: 30_000, sharingMode: "percentage" }, [
      { personId: "a", percentageBps: 4_900 }, { personId: "b", percentageBps: 5_050 },
    ])).toThrow(/somar 100%/);
    expect(() => allocateItemCost({ quantity: 10_001, unitPriceCents: 1, sharingMode: "equal" }, equal(["a"]))).toThrow(/Quantidade/);
  });
});
