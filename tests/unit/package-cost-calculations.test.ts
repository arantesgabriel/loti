import { describe, expect, it } from "vitest";
import { calculateCostTracking, roundFeeCents, splitByWeights, type CostLineInput, type CostPackageInput } from "@/lib/domain/package-cost-calculations";

const known = (amountCents: number) => ({ state: "known" as const, amountCents });
const noCharge = { state: "no_charge" as const, amountCents: null };
const equal = (ids: string[]) => ids.map((personId, allocationOrder) => ({ personId, allocationOrder, weight: 1 }));
const packageCharge = (value: ReturnType<typeof known> | typeof noCharge, feeBps: number | null = null, paymentMethod: "pix" | "card" | null = null) => ({ value, feeBps, paymentMethod, paymentStatus: "pending" as const });

describe("package cost calculations", () => {
  it("rounds each fee half up using integer arithmetic", () => {
    expect(roundFeeCents(50, 100)).toBe(1);
    expect(roundFeeCents(100_000, 100)).toBe(1_000);
  });

  it("splits weighted cents exactly and resolves ties by the captured order", () => {
    expect(splitByWeights(10_000, [
      { personId: "a", allocationOrder: 0, weight: 60 },
      { personId: "b", allocationOrder: 1, weight: 40 },
    ])).toEqual([6_000, 4_000]);
    expect(splitByWeights(100, equal(["a", "b", "c"]))).toEqual([34, 33, 33]);
  });

  it("charges products plus China freight once and allocates the fee by each item's base", () => {
    const items: CostLineInput[] = [
      { id: "ram", itemOrder: 0, quantity: 3, effectivePrice: known(10_000), chinaFreight: known(1_000), participants: equal(["a"]) },
      { id: "shirt", itemOrder: 1, quantity: 1, effectivePrice: known(3_000), chinaFreight: known(500), participants: equal(["b"]) },
    ];
    const result = calculateCostTracking({ items, packages: [], productsCharge: { paymentMethod: "pix", feeBps: 100, paymentStatus: "pending" } });
    expect(result.productsCharge.baseCents).toBe(36_500);
    expect(result.productsCharge.feeCents).toBe(365);
    expect(result.items.map(item => item.components[2].amountCents)).toEqual([330, 35]);
    expect(result.summary.totalCents).toBeNull(); // Brazil freight and customs still need a value/package.
  });

  it("splits package freight by physical unit and keeps no-charge customs at zero", () => {
    const items: CostLineInput[] = [
      { id: "ram", itemOrder: 0, quantity: 3, effectivePrice: known(10_000), chinaFreight: known(0), participants: equal(["a", "b"]) },
      { id: "shirt", itemOrder: 1, quantity: 1, effectivePrice: known(3_000), chinaFreight: known(0), participants: equal(["b"]) },
    ];
    const pkg: CostPackageInput = {
      id: "p1", name: "Pacote 1", packageOrder: 0, logisticsStatus: "preparing",
      items: [{ costItemId: "ram", quantity: 3, allocationOrder: 0 }, { costItemId: "shirt", quantity: 1, allocationOrder: 1 }],
      brazilFreight: packageCharge(known(40_000), 100, "pix"), customs: packageCharge(noCharge),
    };
    const result = calculateCostTracking({ items, packages: [pkg], productsCharge: { paymentMethod: "pix", feeBps: 0, paymentStatus: "paid" } });
    expect(result.packages[0].freightPaymentTotalCents).toBe(40_400);
    expect(result.items[0].components.slice(-3).map(component => component.amountCents)).toEqual([30_000, 300, 0]);
    expect(result.items[1].components.slice(-3).map(component => component.amountCents)).toEqual([10_000, 100, 0]);
    expect(result.summary.totalCents).toBe(73_400);
  });

  it("preserves captured fixed shares as weights after effective values change", () => {
    const line: CostLineInput = {
      id: "item", itemOrder: 0, quantity: 1, effectivePrice: known(18_000), chinaFreight: noCharge,
      participants: [
        { personId: "a", allocationOrder: 0, weight: 12_000 },
        { personId: "b", allocationOrder: 1, weight: 8_000 },
      ],
    };
    const result = calculateCostTracking({ items: [line], packages: [], productsCharge: { paymentMethod: "pix", feeBps: 0, paymentStatus: "paid" } });
    expect(result.items[0].shares.map(share => share.partialAmountCents)).toEqual([10_800, 7_200]);
    expect(result.items[0].shares.map(share => share.amountCents)).toEqual([null, null]);
  });

  it("keeps unknown values pending and distinguishes them from zero and no charge", () => {
    const items: CostLineInput[] = [
      { id: "item", itemOrder: 0, quantity: 1, effectivePrice: { state: "pending", amountCents: null }, chinaFreight: known(0), participants: equal(["a"]) },
    ];
    const result = calculateCostTracking({ items, packages: [], productsCharge: { paymentMethod: "pix", feeBps: 100, paymentStatus: "pending" } });
    expect(result.items[0].components[0].amountCents).toBeNull();
    expect(result.items[0].components[1].amountCents).toBe(0);
    expect(result.items[0].totalCents).toBeNull();
    expect(result.productsCharge.baseCents).toBeNull();
  });

  it("keeps known participant shares visible while other components are pending", () => {
    const line: CostLineInput = {
      id: "item", itemOrder: 0, quantity: 1, effectivePrice: known(10_001), chinaFreight: { state: "pending", amountCents: null },
      participants: equal(["a", "b", "c"]),
    };
    const result = calculateCostTracking({ items: [line], packages: [], productsCharge: { paymentMethod: null, feeBps: null, paymentStatus: "pending" } });

    expect(result.items[0].partialCents).toBe(10_001);
    expect(result.items[0].totalCents).toBeNull();
    expect(result.items[0].shares).toEqual([
      { personId: "a", partialAmountCents: 3_334, amountCents: null },
      { personId: "b", partialAmountCents: 3_334, amountCents: null },
      { personId: "c", partialAmountCents: 3_333, amountCents: null },
    ]);
  });

  it("splits each known component before adding participant partials", () => {
    const line: CostLineInput = {
      id: "item", itemOrder: 0, quantity: 1, effectivePrice: known(1), chinaFreight: known(1),
      participants: equal(["a", "b", "c"]),
    };
    const result = calculateCostTracking({ items: [line], packages: [], productsCharge: { paymentMethod: "pix", feeBps: 0, paymentStatus: "pending" } });

    expect(result.items[0].shares.map(share => share.partialAmountCents)).toEqual([2, 0, 0]);
    expect(result.items[0].shares.reduce((sum, share) => sum + (share.partialAmountCents ?? 0), 0)).toBe(2);
  });

  it("does not assign known amounts when the participant proportion is undefined", () => {
    const line: CostLineInput = {
      id: "item", itemOrder: 0, quantity: 1, effectivePrice: known(100), chinaFreight: noCharge,
      participants: [{ personId: "a", allocationOrder: 0, weight: 0 }, { personId: "b", allocationOrder: 1, weight: 0 }],
    };
    const result = calculateCostTracking({ items: [line], packages: [], productsCharge: { paymentMethod: null, feeBps: null, paymentStatus: "pending" } });

    expect(result.items[0].shares.map(share => share.partialAmountCents)).toEqual([null, null]);
    expect(result.items[0].shares.map(share => share.amountCents)).toEqual([null, null]);
    expect(result.items[0].undistributedCents).toBe(100);
    expect(result.summary.undistributedCents).toBe(100);
    expect(result.summary.partialCents).toBe(100);
  });

  it("allocates package remainders to physical units in stable row order", () => {
    const items: CostLineInput[] = ["a", "b", "c"].map((id, itemOrder) => ({ id, itemOrder, quantity: itemOrder === 1 ? 1 : 2, effectivePrice: known(0), chinaFreight: known(0), participants: equal(["person"]) }));
    const pkg: CostPackageInput = {
      id: "p", name: "P", packageOrder: 0, logisticsStatus: "preparing",
      items: items.map((item, allocationOrder) => ({ costItemId: item.id, quantity: item.quantity, allocationOrder })),
      brazilFreight: packageCharge(known(5)), customs: packageCharge(noCharge),
    };
    const result = calculateCostTracking({ items, packages: [pkg], productsCharge: { paymentMethod: "pix", feeBps: 0, paymentStatus: "paid" } });
    expect(result.items.map(item => item.components.at(-3)?.amountCents)).toEqual([2, 1, 2]);
  });
});
