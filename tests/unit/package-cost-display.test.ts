import { describe, expect, it } from "vitest";
import { projectCostFinancialDisplay, type CostDisplayItemInput, type DisplayComponentInput } from "@/lib/domain/package-cost-display";

const known = (name: string, amountCents: number): DisplayComponentInput => ({ name, state: "known", amountCents });
const noCharge = (name: string): DisplayComponentInput => ({ name, state: "no_charge", amountCents: null });
const pending = (name: string): DisplayComponentInput => ({ name, state: "pending", amountCents: null });
const emptyCanonical = { totalCents: 0 as number | null, hasKnownAmount: true, requestedRefundCents: 0, receivedRefundCents: 0 };
function item(overrides: Partial<CostDisplayItemInput> = {}): CostDisplayItemInput {
  return {
    costItemId: "item",
    orderId: "order-original",
    itemOrder: 0,
    origin: "purchase",
    purchasedQuantity: 1,
    product: known("Preço efetivo", 0),
    china: noCharge("Frete China"),
    productFee: known("Taxa dos produtos", 0),
    packageCosts: [],
    pendingReasons: [],
    refunds: [],
    ...overrides,
  };
}
function project(rows: CostDisplayItemInput[], canonical: Partial<typeof emptyCanonical> & { partialCents: number }) {
  return projectCostFinancialDisplay(rows, { ...emptyCanonical, ...canonical });
}
function refund(overrides: Partial<CostDisplayItemInput["refunds"][number]> = {}): CostDisplayItemInput["refunds"][number] {
  return {
    id: "refund-1", status: "received", quantity: 1, unitStart: 0, originalItemQuantity: 1,
    requestedProductCents: 3_058, requestedChinaCents: 800, receivedProductCents: 3_058, receivedChinaCents: 0,
    originalItemFeeCents: 39, originalProductShareCents: 3_058, originalChinaShareCents: 800,
    ...overrides,
  };
}

describe("package cost financial display projection", () => {
  it("reconciles the approved received example without changing its original payment", () => {
    const shirt = item({
      product: known("Preço efetivo", 3_058), china: known("Frete China", 800), productFee: known("Taxa dos produtos", 39),
      refunds: [refund()],
    });
    const additional = item({
      costItemId: "additional-item", orderId: "order-additional", itemOrder: 1, origin: "additional",
      product: known("Preço efetivo", 1_927), china: noCharge("Frete China"), productFee: known("Taxa dos produtos", 0),
    });
    const result = project([shirt, additional], { partialCents: 2_766, totalCents: 2_766, hasKnownAmount: true, requestedRefundCents: 0, receivedRefundCents: 3_058 });
    expect(result.items.map(row => [row.remainingQuantity, row.remaining.total.knownCents])).toEqual([[0, 0], [1, 1_927]]);
    expect(result.items[0].cancelled).toMatchObject({ productCents: 3_058, chinaCents: 800, productFeeCents: 39, receivedCents: 3_058, retainedCents: 839 });
    expect(result.summary).toMatchObject({ remaining: { knownCents: 1_927 }, cancelledRetainedCents: 839, current: { knownCents: 2_766, finalCents: 2_766 } });
  });

  it("keeps requested value in the cancelled cost until receipt", () => {
    const source = item({
      product: known("Preço efetivo", 3_058), china: known("Frete China", 800), productFee: known("Taxa dos produtos", 39),
      refunds: [refund({ status: "requested", receivedProductCents: null, receivedChinaCents: null })],
    });
    const result = project([source, item({ costItemId: "additional", orderId: "add", itemOrder: 1, origin: "additional", product: known("Preço efetivo", 1_927) })], {
      partialCents: 5_824, totalCents: null, hasKnownAmount: true, requestedRefundCents: 3_858, receivedRefundCents: 0,
    });
    expect(result.items[0].cancelled).toMatchObject({ requestedCents: 3_858, receivedCents: 0, retainedCents: 3_897, awaitingReceipt: true });
    expect(result.summary).toMatchObject({ cancelledRetainedCents: 3_897, requestedRefundCents: 3_858, current: { knownCents: 5_824, finalCents: null } });
  });

  it("partitions two bought units exactly into remaining and cancelled components", () => {
    const source = item({
      purchasedQuantity: 2, product: known("Preço efetivo", 20_000), china: known("Frete China", 2_000), productFee: known("Taxa dos produtos", 220),
      refunds: [refund({ quantity: 1, originalItemQuantity: 2, requestedProductCents: 10_000, requestedChinaCents: 0, receivedProductCents: 10_000, receivedChinaCents: 0, originalItemFeeCents: 220, originalProductShareCents: 20_000, originalChinaShareCents: 2_000 })],
    });
    const result = project([source], { partialCents: 12_220, totalCents: 12_220, hasKnownAmount: true, requestedRefundCents: 0, receivedRefundCents: 10_000 });
    expect(result.items[0]).toMatchObject({ remainingQuantity: 1, remaining: { product: { finalCents: 10_000 }, china: { finalCents: 1_000 }, productFee: { finalCents: 110 }, total: { finalCents: 11_110 } }, cancelled: { productCents: 10_000, chinaCents: 1_000, productFeeCents: 110, retainedCents: 1_110 } });
  });

  it("uses persisted unitStart ranges and exact captured additional-order bases", () => {
    const source = item({
      costItemId: "additional-item", orderId: "additional", origin: "additional", purchasedQuantity: 3,
      product: known("Preço efetivo", 100), china: known("Frete China", 2), productFee: known("Taxa dos produtos", 1),
      refunds: [refund({ unitStart: 1, quantity: 1, originalItemQuantity: 3, requestedProductCents: 33, requestedChinaCents: 1, receivedProductCents: 33, receivedChinaCents: 1, originalItemFeeCents: 1, originalProductShareCents: 100, originalChinaShareCents: 2 })],
    });
    const result = project([source], { partialCents: 69, totalCents: 69, hasKnownAmount: true, requestedRefundCents: 0, receivedRefundCents: 34 });
    expect(result.refundsById["refund-1"]).toEqual({ productCapacityCents: 33, chinaCapacityCents: 1, productFeeCapacityCents: 0 });
    expect(result.items[0]).toMatchObject({ remainingQuantity: 2, remaining: { product: { finalCents: 67 }, china: { finalCents: 1 }, productFee: { finalCents: 1 }, total: { finalCents: 69 } }, cancelled: { retainedCents: 0 } });
  });

  it("does not move fee or package charges onto cancelled units", () => {
    const source = item({
      costItemId: "kept", purchasedQuantity: 1, product: known("Preço efetivo", 10_000), china: noCharge("Frete China"), productFee: known("Taxa dos produtos", 100),
      packageCosts: [known("Frete Brasil · pacote", 4_000), known("Taxa do frete · pacote", 40), noCharge("Receita · pacote")],
      refunds: [],
    });
    const cancelled = item({
      costItemId: "cancelled", orderId: "order-2", itemOrder: 1, product: known("Preço efetivo", 10_000), china: noCharge("Frete China"), productFee: known("Taxa dos produtos", 100),
      refunds: [refund({ requestedProductCents: 10_000, requestedChinaCents: 0, receivedProductCents: 10_000, receivedChinaCents: 0, originalItemFeeCents: 100, originalProductShareCents: 10_000, originalChinaShareCents: 0 })],
    });
    const result = project([source, cancelled], { partialCents: 14_240, totalCents: 14_240, hasKnownAmount: true, requestedRefundCents: 0, receivedRefundCents: 10_000 });
    expect(result.items[0].remaining.total.finalCents).toBe(14_140);
    expect(result.items[1].cancelled).toMatchObject({ productFeeCents: 100, retainedCents: 100 });
  });

  it("preserves smaller and zero receipts without inventing another receivable", () => {
    const source = item({ product: known("Preço efetivo", 10_000), china: known("Frete China", 1_000), productFee: known("Taxa dos produtos", 110), refunds: [refund({ requestedProductCents: 10_000, requestedChinaCents: 1_000, receivedProductCents: 7_000, receivedChinaCents: 0 })] });
    const result = project([source], { partialCents: 4_110, totalCents: 4_110, hasKnownAmount: true, requestedRefundCents: 0, receivedRefundCents: 7_000 });
    expect(result.items[0].cancelled).toMatchObject({ receivedCents: 7_000, requestedCents: 0, retainedCents: 4_110, awaitingReceipt: false });
    const zero = project([item({ product: known("Preço efetivo", 10_000), china: known("Frete China", 1_000), productFee: known("Taxa dos produtos", 110), refunds: [refund({ requestedProductCents: 10_000, requestedChinaCents: 1_000, receivedProductCents: 0, receivedChinaCents: 0 })] })], { partialCents: 11_110, totalCents: 11_110, hasKnownAmount: true, requestedRefundCents: 0, receivedRefundCents: 0 });
    expect(zero.items[0].cancelled?.retainedCents).toBe(11_110);
  });

  it("aggregates multiple records for one item and excludes voided ranges from active totals", () => {
    const source = item({
      purchasedQuantity: 3, product: known("Preço efetivo", 300), china: noCharge("Frete China"), productFee: known("Taxa dos produtos", 3),
      refunds: [
        refund({ id: "r0", status: "voided", unitStart: 0, quantity: 1, originalItemQuantity: 3, requestedProductCents: 100, requestedChinaCents: 0, receivedProductCents: null, receivedChinaCents: null, originalItemFeeCents: 3, originalProductShareCents: 300, originalChinaShareCents: 0 }),
        refund({ id: "r1", status: "received", unitStart: 1, quantity: 1, originalItemQuantity: 3, requestedProductCents: 100, requestedChinaCents: 0, receivedProductCents: 90, receivedChinaCents: 0, originalItemFeeCents: 3, originalProductShareCents: 300, originalChinaShareCents: 0 }),
        refund({ id: "r2", status: "requested", unitStart: 2, quantity: 1, originalItemQuantity: 3, requestedProductCents: 100, requestedChinaCents: 0, receivedProductCents: null, receivedChinaCents: null, originalItemFeeCents: 3, originalProductShareCents: 300, originalChinaShareCents: 0 }),
      ],
    });
    const result = project([source], { partialCents: 213, totalCents: null, hasKnownAmount: true, requestedRefundCents: 100, receivedRefundCents: 90 });
    expect(result.refundGroups).toEqual([{ costItemId: "item", cancelledQuantity: 2, receivedCents: 90, requestedCents: 100, retainedCents: 112, awaitingReceipt: true, activeRefundIds: ["r1", "r2"] }]);
    expect(result.items[0].remainingQuantity).toBe(1);
    expect(result.refundsById.r0.productCapacityCents).toBe(100);
  });

  it("rejects overlapping ranges and a received amount above its exact range", () => {
    const overlap = item({ purchasedQuantity: 2, product: known("Preço efetivo", 200), refunds: [refund({ id: "one", quantity: 1, originalItemQuantity: 2, originalItemFeeCents: 0, originalProductShareCents: 200, originalChinaShareCents: 0 }), refund({ id: "two", unitStart: 0, quantity: 1, originalItemQuantity: 2, originalItemFeeCents: 0, originalProductShareCents: 200, originalChinaShareCents: 0 })] });
    expect(() => project([overlap], { partialCents: 0, totalCents: 0, hasKnownAmount: true, requestedRefundCents: 0, receivedRefundCents: 6_116 })).toThrow(/sobrepostas/);
    const overRefunded = item({ product: known("Preço efetivo", 100), refunds: [refund({ requestedProductCents: 100, requestedChinaCents: 0, receivedProductCents: 101, receivedChinaCents: 0, originalItemFeeCents: 0, originalProductShareCents: 100, originalChinaShareCents: 0 })] });
    expect(() => project([overRefunded], { partialCents: 0, totalCents: 0, hasKnownAmount: true, requestedRefundCents: 0, receivedRefundCents: 101 })).toThrow(/supera a base histórica/);
  });

  it("keeps known zero, no-charge, and unknown components distinct", () => {
    const result = project([item({ product: known("Preço efetivo", 0), china: noCharge("Frete China"), productFee: pending("Taxa dos produtos"), packageCosts: [known("Frete Brasil", 12)] })], {
      partialCents: 12, totalCents: null, hasKnownAmount: true, requestedRefundCents: 0, receivedRefundCents: 0,
    });
    expect(result.items[0].remaining.product).toMatchObject({ state: "known", hasKnownAmount: true, finalCents: 0 });
    expect(result.items[0].remaining.china).toMatchObject({ state: "no_charge", hasKnownAmount: true, finalCents: 0 });
    expect(result.items[0].remaining.total).toMatchObject({ state: "partial", knownCents: 12, finalCents: null, pendingReasons: ["Taxa dos produtos"] });
  });

  it("keeps cost-known and new-money concepts separate at the order boundary", () => {
    const fullyBalanceFundedAdditional = item({ costItemId: "additional", orderId: "order-additional", origin: "additional", product: known("Preço efetivo", 1_927) });
    const result = project([fullyBalanceFundedAdditional], { partialCents: 1_927, totalCents: 1_927, hasKnownAmount: true, requestedRefundCents: 0, receivedRefundCents: 0 });
    expect(result.items[0]).toMatchObject({ orderId: "order-additional", remaining: { total: { finalCents: 1_927 } } });
  });

  it("does not depend on display order and retains an empty operational projection", () => {
    const rows = [
      item({ costItemId: "z", orderId: "z", itemOrder: 9, product: known("Preço efetivo", 10) }),
      item({ costItemId: "a", orderId: "a", itemOrder: 1, product: known("Preço efetivo", 20) }),
    ];
    const first = project(rows, { partialCents: 30, totalCents: 30, hasKnownAmount: true, requestedRefundCents: 0, receivedRefundCents: 0 });
    const second = project([...rows].reverse(), { partialCents: 30, totalCents: 30, hasKnownAmount: true, requestedRefundCents: 0, receivedRefundCents: 0 });
    expect(first.summary).toEqual(second.summary);
    const allCancelled = project([item({ product: known("Preço efetivo", 10), china: noCharge("Frete China"), productFee: known("Taxa dos produtos", 2), refunds: [refund({ requestedProductCents: 10, requestedChinaCents: 0, receivedProductCents: 10, receivedChinaCents: 0, originalItemFeeCents: 2, originalProductShareCents: 10, originalChinaShareCents: 0 })] })], { partialCents: 2, totalCents: 2, hasKnownAmount: true, requestedRefundCents: 0, receivedRefundCents: 10 });
    expect(allCancelled.items[0].remainingQuantity).toBe(0);
    expect(allCancelled.summary).toMatchObject({ remaining: { knownCents: 0 }, cancelledRetainedCents: 2, current: { knownCents: 2 } });
  });
});
