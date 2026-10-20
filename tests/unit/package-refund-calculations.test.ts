import { describe, expect, it } from "vitest";
import { allocateRefundCredit, parseCostCents } from "@/lib/domain/package-refund-calculations";
import { calculateCostTracking, type CostLineInput } from "@/lib/domain/package-cost-calculations";

const equal = (ids: string[]) => ids.map((personId, allocationOrder) => ({ personId, allocationOrder, weight: 1 }));
const known = (amountCents: number) => ({ state: "known" as const, amountCents });
const noCharge = { state: "no_charge" as const, amountCents: null };

describe("package refund calculations", () => {
  it("parses decimal inputs and enforces the numeric cost ceiling", () => {
    expect(parseCostCents("100,00")).toBe(10_000);
    expect(parseCostCents("100.00")).toBe(10_000);
    expect(parseCostCents("0")).toBe(0);
    expect(parseCostCents("")).toBeNull();
    expect(parseCostCents("10.000.000.000,00")).toBe(1_000_000_000_000);
    expect(parseCostCents("10.000.000.000,01")).toBeNull();
    expect(parseCostCents("-1")).toBeNull();
    expect(parseCostCents("1e3")).toBeNull();
    expect(parseCostCents("1,234")).toBeNull();
  });

  it("aggregates tiny credits against the original participant shares", () => {
    const shares = ["alice", "bob", "cara"].map((personId, allocationOrder) => ({ personId, allocationOrder, cents: 1 }));
    expect(allocateRefundCredit(2, shares)).toEqual([1, 1, 0]);
    expect(allocateRefundCredit(0, shares)).toEqual([0, 0, 0]);
    expect(() => allocateRefundCredit(4, shares)).toThrow(/excede/);
  });

  it("keeps original gross, fee and purchased quantity while using shipping units for allocation", () => {
    const line: CostLineInput = {
      id: "item", itemOrder: 0, quantity: 3, effectivePrice: known(10_000), chinaFreight: known(1_000), participants: equal(["alice"]),
      shippingQuantity: 2,
      refunds: [{ status: "received", quantity: 1, requestedProductCents: 10_000, requestedChinaCents: 1_000, receivedProductCents: 10_000, receivedChinaCents: 1_000, participants: [{ ...equal(["alice"])[0], originalProductShareCents: 30_000, originalChinaShareCents: 3_000, originalProductFeeShareCents: 330 }] }],
    };
    const result = calculateCostTracking({
      items: [line],
      packages: [{ id: "p", name: "P", packageOrder: 0, logisticsStatus: "preparing", items: [{ costItemId: "item", quantity: 2, allocationOrder: 0 }], brazilFreight: { value: noCharge, paymentMethod: null, feeBps: null, paymentStatus: "pending" }, customs: { value: noCharge, paymentMethod: null, feeBps: null, paymentStatus: "pending" } }],
      productsCharge: { paymentMethod: "pix", feeBps: 100, paymentStatus: "paid" },
    });
    expect(result.productsCharge).toMatchObject({ baseCents: 33_000, feeCents: 330, totalCents: 33_330, paymentStatus: "paid" });
    expect(result.items[0]).toMatchObject({ purchasedQuantity: 3, cancelledQuantity: 1, shippingQuantity: 2, grossPartialCents: 33_330, receivedRefundCents: 11_000, partialCents: 22_330 });
    expect(result.summary).toMatchObject({ unitCount: 3, shippingUnits: 2, cancelledUnits: 1, grossPartialCents: 33_330, receivedRefundCents: 11_000, partialCents: 22_330 });
  });

  it("splits aggregate component credits after the stable original share calculation", () => {
    const participants = [{ personId: "alice", allocationOrder: 0, weight: 60 }, { personId: "bob", allocationOrder: 1, weight: 40 }];
    const line: CostLineInput = {
      id: "shared", itemOrder: 0, quantity: 1, effectivePrice: known(10_000), chinaFreight: known(1_000), participants,
      refunds: [{ status: "received", quantity: 1, requestedProductCents: 8_000, requestedChinaCents: 1_000, receivedProductCents: 8_000, receivedChinaCents: 1_000, participants: [
        { ...participants[0], originalProductShareCents: 6_000, originalChinaShareCents: 600, originalProductFeeShareCents: 66 },
        { ...participants[1], originalProductShareCents: 4_000, originalChinaShareCents: 400, originalProductFeeShareCents: 44 },
      ] }],
    };
    const result = calculateCostTracking({ items: [line], packages: [], productsCharge: { paymentMethod: "pix", feeBps: 100, paymentStatus: "paid" } });
    expect(result.items[0].shares.map(share => [share.grossPartialAmountCents, share.receivedRefundCents, share.partialAmountCents])).toEqual([[6_666, 5_400, 1_266], [4_444, 3_600, 844]]);
    expect(result.items[0].partialCents).toBe(2_110);
  });
});
