import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { packageCostServices } from "@/lib/domain/package-cost-services";
import { financialOperations, hubbuyBalanceEntries, memberBalanceFinancingEntries, purchaseCostCharges, purchaseCostParticipants, purchaseCostRefundEvents, purchaseCostRefundParticipants, purchaseCostRefunds, purchaseItems, purchasePackageItems, purchasePackages, purchasePaymentAllocations, purchasePaymentComponents } from "@/lib/db/schema";
import { fixture, type Fixture } from "./helpers";

let f: Fixture;
beforeEach(async () => { f = await fixture(); });
afterEach(() => f.client.close());

async function paidTracking(quantity = 1) {
  const purchase = await f.alice.savePurchase({ name: "Reembolso QA" });
  const item = await f.bob.saveManualItem({ name: "SSD NVMe", url: "https://example.test/ssd", quantity, unitPriceCents: 10_000, personId: "bob" });
  await f.alice.finalizePurchase(purchase!.id, true);
  const service = packageCostServices(f.db, "alice"), tracking = await service.startTracking(purchase!.id);
  let detail = await service.getTracking(tracking.id);
  const costItem = detail.items[0];
  detail = await service.saveItemCosts(tracking.id, { expectedRevision: detail.tracking.revision, itemId: costItem.id, effectivePriceState: "known", effectivePriceUnitCents: 10_000, chinaFreightState: "known", chinaFreightUnitCents: 1_000 });
  const productsCharge = detail.productsCharge!;
  detail = await service.saveCharge(tracking.id, productsCharge.id, { expectedRevision: detail.tracking.revision, chargeType: "products", paymentMethod: "pix" });
  detail = await service.markChargePaid(tracking.id, productsCharge.id, { expectedRevision: detail.tracking.revision });
  return { purchase: purchase!, item: item!, service, tracking, detail };
}

describe("package product refunds", () => {
  it("projects persisted refund ranges on read without writing financial or purchase state", async () => {
    const { item, service, tracking, detail: before } = await paidTracking(2);
    const itemCost = before.items[0], pkg = before.packages[0];
    const afterRequest = await service.requestRefund(tracking.id, {
      expectedRevision: before.tracking.revision, costItemId: itemCost.id, quantity: 1,
      requestedProductCents: 10_000, requestedChinaCents: 0, reason: "Fornecedor cancelou uma unidade",
      packageRemovals: [{ packageId: pkg.id, quantity: 1 }], unassignedQuantity: 0,
    });
    const snapshot = async () => ({
      purchaseItems: await f.db.select().from(purchaseItems).all(),
      participants: await f.db.select().from(purchaseCostParticipants).all(),
      charges: await f.db.select().from(purchaseCostCharges).all(),
      paymentComponents: await f.db.select().from(purchasePaymentComponents).all(),
      allocations: await f.db.select().from(purchasePaymentAllocations).all(),
      refundRows: await f.db.select().from(purchaseCostRefunds).all(),
      refundParticipants: await f.db.select().from(purchaseCostRefundParticipants).all(),
      refundEvents: await f.db.select().from(purchaseCostRefundEvents).all(),
      packageRows: await f.db.select().from(purchasePackages).all(),
      packageItems: await f.db.select().from(purchasePackageItems).all(),
      operations: await f.db.select().from(financialOperations).all(),
      balanceEntries: await f.db.select().from(hubbuyBalanceEntries).all(),
      financing: await f.db.select().from(memberBalanceFinancingEntries).all(),
    });
    const beforeRead = await snapshot();
    const read = await service.getTracking(tracking.id);
    const expected = read.financialDisplay.items.find(row => row.costItemId === itemCost.id)!;
    expect(expected).toMatchObject({
      purchasedQuantity: 2, remainingQuantity: 1, cancelledQuantity: 1,
      remaining: { product: { finalCents: 10_000 }, china: { finalCents: 1_000 }, productFee: { finalCents: 110 } },
      cancelled: { productCents: 10_000, chinaCents: 1_000, productFeeCents: 110, requestedCents: 10_000, receivedCents: 0, retainedCents: 11_110, awaitingReceipt: true },
    });
    expect(read.financialDisplay.summary.current.knownCents).toBe(read.calculation.summary.partialCents);
    expect(await snapshot()).toEqual(beforeRead);
    expect((await f.db.select().from(purchaseItems).where(eq(purchaseItems.id, item!.id)).get())?.quantity).toBe(2);
    expect(read.productsCharge).toEqual(afterRequest.productsCharge);
  });

  it("cancels selected units, preserves the original paid product charge and applies only received credit", async () => {
    const { item, service, tracking, detail: before } = await paidTracking();
    const itemCost = before.items[0], pkg = before.packages[0], chargeBefore = before.productsCharge!;
    let after = await service.requestRefund(tracking.id, {
      expectedRevision: before.tracking.revision, costItemId: itemCost.id, quantity: 1,
      requestedProductCents: 10_000, requestedChinaCents: 1_000, reason: "Fornecedor cancelou a unidade",
      packageRemovals: [{ packageId: pkg.id, quantity: 1 }], unassignedQuantity: 0,
    });
    expect(after.items[0].calculation).toMatchObject({ purchasedQuantity: 1, cancelledQuantity: 1, shippingQuantity: 0, requestedRefundCents: 11_000, receivedRefundCents: 0 });
    expect(after.calculation.summary.requestedRefundCount).toBe(1);
    expect(after.productsCharge).toMatchObject({ paymentStatus: "paid", paidAt: chargeBefore.paidAt, paidBy: chargeBefore.paidBy, paymentMethod: "pix", feeBps: 100 });
    expect(after.calculation.productsCharge).toMatchObject({ baseCents: 11_000, feeCents: 110, totalCents: 11_110 });
    expect(after.calculation.summary.partialCents).toBe(11_110);
    await expect(service.requestRefund(tracking.id, {
      expectedRevision: before.tracking.revision, costItemId: itemCost.id, quantity: 1,
      requestedProductCents: 10_000, requestedChinaCents: 0, reason: "Duplicado com revisão antiga",
      packageRemovals: [{ packageId: pkg.id, quantity: 1 }], unassignedQuantity: 0,
    })).rejects.toThrow(/alterados em outra sessão/);
    expect(after.items[0].calculation?.cancelledQuantity).toBe(1);
    await expect(service.closeTracking(tracking.id, { expectedRevision: after.tracking.revision, confirmed: true })).rejects.toThrow(/reembolso pendentes/);

    after = await service.receiveRefund(tracking.id, after.refunds[0].id, { expectedRevision: after.tracking.revision, receivedProductCents: 8_000, receivedChinaCents: 1_000, confirmed: true });
    expect(after.calculation.summary).toMatchObject({ requestedRefundCount: 0, receivedRefundCents: 9_000, partialCents: 2_110 });
    expect(after.productsCharge).toMatchObject({ paymentStatus: "paid", paidAt: chargeBefore.paidAt, paidBy: chargeBefore.paidBy });
    expect((await f.db.select().from(purchaseItems).where(eq(purchaseItems.id, item!.id)).get())?.unitPriceCents).toBe(10_000);
    expect(await f.db.select().from(purchaseCostRefundEvents).all()).toHaveLength(2);
    expect(await f.db.select().from(purchaseCostRefunds).all()).toHaveLength(1);
  });

  it("rejects a cancel request for a package that is already sent", async () => {
    const { service, tracking, detail } = await paidTracking();
    const pkg = detail.packages[0], item = detail.items[0];
    const sent = await service.savePackage(tracking.id, pkg.id, { expectedRevision: detail.tracking.revision, name: pkg.name, logisticsStatus: "sent" });
    await expect(service.requestRefund(tracking.id, {
      expectedRevision: sent.tracking.revision, costItemId: item.id, quantity: 1, requestedProductCents: 10_000,
      requestedChinaCents: 0, reason: "Cancelamento após envio", packageRemovals: [{ packageId: pkg.id, quantity: 1 }], unassignedQuantity: 0,
    })).rejects.toMatchObject({ code: "REFUND_INELIGIBLE_UNITS" });
  });

  it("requires explicit confirmation to reset only paid charges on affected packages", async () => {
    const { service, tracking, detail: initial } = await paidTracking(4);
    let detail = await service.createPackage(tracking.id, { expectedRevision: initial.tracking.revision, name: "Pacote 2" });
    let pkg = detail.packages[0], secondPackage = detail.packages[1];
    const item = detail.items[0];
    detail = await service.saveAllocations(tracking.id, { expectedRevision: detail.tracking.revision, packageId: pkg.id, allocations: [{ costItemId: item.id, quantity: 2 }] });
    detail = await service.saveAllocations(tracking.id, { expectedRevision: detail.tracking.revision, packageId: secondPackage.id, allocations: [{ costItemId: item.id, quantity: 2 }] });
    detail = await service.createPackage(tracking.id, { expectedRevision: detail.tracking.revision, name: "Não afetado" });
    pkg = detail.packages[0]; secondPackage = detail.packages[1];
    for (const affected of [pkg, secondPackage]) {
      detail = await service.saveCharge(tracking.id, affected.brazilFreightCharge!.id, { expectedRevision: detail.tracking.revision, chargeType: "brazil_freight", valueState: "known", amountCents: 1_000, paymentMethod: "pix" });
      detail = await service.markChargePaid(tracking.id, affected.brazilFreightCharge!.id, { expectedRevision: detail.tracking.revision });
    }
    const untouched = detail.packages[2];
    const request = {
      expectedRevision: detail.tracking.revision, costItemId: item.id, quantity: 2,
      requestedProductCents: 20_000, requestedChinaCents: 0, reason: "Cancelamento com fretes pagos",
      packageRemovals: [{ packageId: pkg.id, quantity: 1 }, { packageId: secondPackage.id, quantity: 1 }], unassignedQuantity: 0,
    };
    detail = await service.requestRefund(tracking.id, request);
    expect(detail.productsCharge?.paymentStatus).toBe("paid");
    expect(detail.packages[0].brazilFreightCharge?.paymentStatus).toBe("paid");
    expect(detail.packages[1].brazilFreightCharge?.paymentStatus).toBe("paid");
    expect(detail.packages[2]).toMatchObject({ id: untouched.id, brazilFreightCharge: { paymentStatus: "pending" }, customsCharge: { paymentStatus: "pending" } });
    expect(detail.packages.slice(0, 2).map(row => row.calculation?.unitCount)).toEqual([1, 1]);
  });

  it("rejects emptying a package with a positive charge without changing allocations", async () => {
    const { service, tracking, detail: initial } = await paidTracking();
    let detail = await service.saveCharge(tracking.id, initial.packages[0].brazilFreightCharge!.id, { expectedRevision: initial.tracking.revision, chargeType: "brazil_freight", valueState: "known", amountCents: 1_000, paymentMethod: "pix" });
    await expect(service.requestRefund(tracking.id, {
      expectedRevision: detail.tracking.revision, costItemId: detail.items[0].id, quantity: 1,
      requestedProductCents: 10_000, requestedChinaCents: 0, reason: "Pacote esvaziado",
      packageRemovals: [{ packageId: detail.packages[0].id, quantity: 1 }], unassignedQuantity: 0,
    })).rejects.toMatchObject({ code: "REFUND_EMPTY_PACKAGE_WITH_CHARGES" });
    detail = await service.getTracking(tracking.id);
    expect(detail.refunds).toHaveLength(0);
    expect(detail.items[0].calculation).toMatchObject({ cancelledQuantity: 0, allocatedQuantity: 1 });
  });

  it("supports received-zero confirmation and audited void without restoring old package contents", async () => {
    const { service, tracking, detail } = await paidTracking();
    const pkg = detail.packages[0], item = detail.items[0];
    let current = await service.requestRefund(tracking.id, { expectedRevision: detail.tracking.revision, costItemId: item.id, quantity: 1, requestedProductCents: 10_000, requestedChinaCents: 1_000, reason: "Pedido aberto", packageRemovals: [{ packageId: pkg.id, quantity: 1 }], unassignedQuantity: 0 });
    const refundId = current.refunds[0].id;
    current = await service.receiveRefund(tracking.id, refundId, { expectedRevision: current.tracking.revision, receivedProductCents: 0, receivedChinaCents: 0, confirmed: true });
    expect(current.calculation.summary.receivedRefundCents).toBe(0);
    current = await service.voidRefund(tracking.id, refundId, { expectedRevision: current.tracking.revision, reason: "Registro incorreto", confirmed: true });
    expect(current.refunds[0].status).toBe("voided");
    expect(current.items[0].calculation).toMatchObject({ cancelledQuantity: 0, shippingQuantity: 1, allocatedQuantity: 0 });
    expect(current.calculation.summary.receivedRefundCents).toBe(0);
    expect((await f.db.select().from(purchaseCostCharges).where(eq(purchaseCostCharges.trackingId, tracking.id)).all()).find(charge => charge.chargeType === "products")?.paymentStatus).toBe("paid");
    expect(await f.db.select().from(purchaseCostRefundEvents).all()).toHaveLength(3);
  });

  it("locks original bases and allocations to enviable units while a refund remains active", async () => {
    const { service, tracking, detail } = await paidTracking(2);
    const pkg = detail.packages[0], item = detail.items[0];
    const requested = await service.requestRefund(tracking.id, { expectedRevision: detail.tracking.revision, costItemId: item.id, quantity: 1, requestedProductCents: 10_000, requestedChinaCents: 0, reason: "Cancelou uma unidade", packageRemovals: [{ packageId: pkg.id, quantity: 1 }], unassignedQuantity: 0 });
    await expect(service.saveItemCosts(tracking.id, { expectedRevision: requested.tracking.revision, itemId: item.id, effectivePriceState: "known", effectivePriceUnitCents: 9_000, chinaFreightState: "known", chinaFreightUnitCents: 1_000 })).rejects.toMatchObject({ code: "REFUND_PRODUCTS_LOCKED" });
    await expect(service.saveAllocations(tracking.id, { expectedRevision: requested.tracking.revision, packageId: pkg.id, allocations: [{ costItemId: item.id, quantity: 2 }] })).rejects.toMatchObject({ code: "REFUND_INELIGIBLE_UNITS" });
    const received = await service.receiveRefund(tracking.id, requested.refunds[0].id, { expectedRevision: requested.tracking.revision, receivedProductCents: 10_000, receivedChinaCents: 0, confirmed: true });
    await expect(service.saveAllocations(tracking.id, { expectedRevision: received.tracking.revision, packageId: pkg.id, allocations: [{ costItemId: item.id, quantity: 2 }] })).rejects.toMatchObject({ code: "REFUND_INELIGIBLE_UNITS" });
  });

  it("locks composition only for items with an active refund while protecting all original bases", async () => {
    const purchase = await f.alice.savePurchase({ name: "Composições independentes" });
    await f.bob.saveManualItem({ name: "SSD", url: "https://example.test/ssd", quantity: 2, unitPriceCents: 10_000, personId: "bob" });
    await f.alice.saveManualItem({ name: "Mouse", url: "https://example.test/mouse", quantity: 1, unitPriceCents: 5_000, personId: "alice" });
    await f.alice.finalizePurchase(purchase!.id, true);
    const service = packageCostServices(f.db, "alice");
    const tracking = await service.startTracking(purchase!.id);
    let detail = await service.getTracking(tracking.id);
    for (const item of detail.items) detail = await service.saveItemCosts(tracking.id, { expectedRevision: detail.tracking.revision, itemId: item.id, effectivePriceState: "known", effectivePriceUnitCents: item.original.name === "Mouse" ? 5_000 : 10_000, chinaFreightState: "no_charge", chinaFreightUnitCents: null });
    detail = await service.saveCharge(tracking.id, detail.productsCharge!.id, { expectedRevision: detail.tracking.revision, chargeType: "products", paymentMethod: "pix" });
    detail = await service.markChargePaid(tracking.id, detail.productsCharge!.id, { expectedRevision: detail.tracking.revision });
    const ssd = detail.items.find(item => item.original.name === "SSD")!, mouse = detail.items.find(item => item.original.name === "Mouse")!;
    detail = await service.requestRefund(tracking.id, { expectedRevision: detail.tracking.revision, costItemId: ssd.id, quantity: 1, requestedProductCents: 10_000, requestedChinaCents: 0, reason: "Cancelou uma unidade do SSD", packageRemovals: [{ packageId: detail.packages[0].id, quantity: 1 }], unassignedQuantity: 0 });
    detail = await service.saveItemCosts(tracking.id, { expectedRevision: detail.tracking.revision, itemId: mouse.id, effectivePriceState: "known", effectivePriceUnitCents: 5_000, chinaFreightState: "no_charge", chinaFreightUnitCents: null, composition: { mode: "fixed", participants: [{ personId: "alice", weight: 500 }] } });
    expect(detail.items.find(item => item.id === mouse.id)?.participants[0].weight).toBe(500);
    await expect(service.saveItemCosts(tracking.id, { expectedRevision: detail.tracking.revision, itemId: ssd.id, effectivePriceState: "known", effectivePriceUnitCents: 10_000, chinaFreightState: "no_charge", chinaFreightUnitCents: null, composition: { mode: "fixed", participants: [{ personId: "bob", weight: 500 }] } })).rejects.toMatchObject({ code: "REFUND_PRODUCTS_LOCKED" });
    await expect(service.saveItemCosts(tracking.id, { expectedRevision: detail.tracking.revision, itemId: mouse.id, effectivePriceState: "known", effectivePriceUnitCents: 4_900, chinaFreightState: "no_charge", chinaFreightUnitCents: null })).rejects.toMatchObject({ code: "REFUND_PRODUCTS_LOCKED" });
  });

  it("rolls back the refund, participant snapshot, package removal and revision if the audit event fails", async () => {
    const { service, tracking, detail } = await paidTracking(2);
    const pkg = detail.packages[0], item = detail.items[0];
    await f.client.execute("CREATE TRIGGER injected_refund_event_failure BEFORE INSERT ON purchase_cost_refund_events BEGIN SELECT RAISE(ABORT, 'injected refund event failure'); END");
    await expect(service.requestRefund(tracking.id, {
      expectedRevision: detail.tracking.revision, costItemId: item.id, quantity: 1,
      requestedProductCents: 10_000, requestedChinaCents: 0, reason: "Falha de auditoria",
      packageRemovals: [{ packageId: pkg.id, quantity: 1 }], unassignedQuantity: 0,
    })).rejects.toThrow(/injected_refund_event_failure|purchase_cost_refund_events/);
    await f.client.execute("DROP TRIGGER injected_refund_event_failure");
    const after = await service.getTracking(tracking.id);
    expect(after.tracking.revision).toBe(detail.tracking.revision);
    expect(after.refunds).toHaveLength(0);
    expect(await f.db.select().from(purchaseCostRefundParticipants)).toHaveLength(0);
    expect(after.items[0].calculation).toMatchObject({ cancelledQuantity: 0, shippingQuantity: 2, allocatedQuantity: 2 });
  });

  it("rejects non-members before writing refund state", async () => {
    const { service, tracking, detail } = await paidTracking();
    const outsider = packageCostServices(f.db, "outsider");
    await expect(outsider.requestRefund(tracking.id, {
      expectedRevision: detail.tracking.revision, costItemId: detail.items[0].id, quantity: 1,
      requestedProductCents: 10_000, requestedChinaCents: 0, reason: "Acesso indevido",
      packageRemovals: [{ packageId: detail.packages[0].id, quantity: 1 }], unassignedQuantity: 0,
    })).rejects.toThrow(/parte deste espaço/);
    expect((await service.getTracking(tracking.id)).refunds).toHaveLength(0);
  });
});
