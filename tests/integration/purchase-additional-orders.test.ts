import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { hubbuyAccounts, hubbuyBalanceConsumptions, memberBalanceFinancingEntries, purchaseCostCharges, purchaseCostOrders, purchaseItemCosts, purchasePackageItems, purchasePackages, purchasePaymentAllocations, purchasePaymentComponents } from "@/lib/db/schema";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import { packageCostServices } from "@/lib/domain/package-cost-services";
import { fixture, type Fixture } from "./helpers";

let f: Fixture;
beforeEach(async () => { f = await fixture(); });
afterEach(() => f.client.close());

describe("additional product orders", () => {
  it("preserves the original paid Pix charge through a balance-only additional order and reload", async () => {
    const purchase = await f.alice.savePurchase({ name: "Compra original paga" });
    await f.alice.saveManualItem({ name: "Camisa", url: "https://shop.test/shirt", unitPriceCents: 3_058, personId: "alice", quantity: 1 });
    await f.alice.finalizePurchase(purchase!.id, true);
    const service = packageCostServices(f.db, "alice");
    const tracking = await service.startTracking(purchase!.id);
    let detail = await service.getTracking(tracking.id);
    detail = await service.saveItemCosts(tracking.id, { expectedRevision: detail.tracking.revision, itemId: detail.items[0].id, effectivePriceState: "known", effectivePriceUnitCents: 3_058, chinaFreightState: "known", chinaFreightUnitCents: 800 });
    detail = await service.saveCharge(tracking.id, detail.productsCharge!.id, { expectedRevision: detail.tracking.revision, chargeType: "products", paymentMethod: "pix" });
    detail = await service.markChargePaid(tracking.id, detail.productsCharge!.id, { expectedRevision: detail.tracking.revision });
    const originalCharge = detail.productsCharge;
    const originalCalculation = detail.calculation.productsCharge;
    expect(originalCalculation).toMatchObject({ baseCents: 3_858, feeCents: 39 });
    const accounts = hubbuyBalanceServices(f.db, "alice");
    const account = await accounts.createAccount({ workspaceId: "workspace", idempotencyKey: "paid-original-account", label: "Saldo sintético", confirmZeroBalance: true });
    await f.db.update(hubbuyAccounts).set({ status: "reconciling", reconciledBy: null, reconciledAt: null }).where(eq(hubbuyAccounts.id, account.accountId)).run();
    await accounts.reconcileAccount(account.accountId, { expectedRevision: 0, idempotencyKey: "paid-original-opening", observedBalanceCnyMinor: 2_500, reason: "Saldo sintético", shares: [{ personId: "alice", amountCnyMinor: 2_500, historicalBrlCents: 1_927 }] });
    const draft = await service.createAdditionalOrder(tracking.id, {
      expectedRevision: detail.tracking.revision, idempotencyKey: "paid-original-draft", accountId: account.accountId,
      items: [{ name: "Elixir", url: "https://shop.test/elixir", platform: "Taobao", visualKey: "generic", quantity: 1, itemOrder: 0, nativeProductState: "known", nativeProductCnyMinor: 2_500, nativeChinaState: "no_charge", nativeChinaCnyMinor: null, participants: [{ personId: "alice", weightMode: "equal", weight: 1 }] }],
    });
    detail = await service.getTracking(tracking.id);
    expect(detail.productsCharge).toEqual(originalCharge);
    expect(detail.calculation.productsCharge).toEqual(originalCalculation);
    await service.recordAdditionalOrderMixedPayment(tracking.id, draft.orderId, { expectedRevision: detail.tracking.revision, idempotencyKey: "paid-original-balance", useOwnBalance: true });
    detail = await packageCostServices(f.db, "alice").getTracking(tracking.id);
    expect(detail.productsCharge).toEqual(originalCharge);
    expect(detail.calculation.productsCharge).toEqual(originalCalculation);
    expect(detail.items[0].calculation?.components.find(component => component.name === "Taxa dos produtos")).toMatchObject({ amountCents: 39 });
    expect(detail.productOrders.find(order => order.id === draft.orderId)).toMatchObject({ feeBrlCents: 0, historicalBrlCents: 1_927, newMoneyBrlCents: 0 });
    expect(detail.calculation.summary.partialCents).toBe(5_824);
    expect(await f.db.select().from(purchaseCostCharges).where(eq(purchaseCostCharges.id, originalCharge!.id)).get()).toEqual(originalCharge);
  });

  it("records an isolated order snapshot and an immutable single external payment", async () => {
    const purchase = await f.alice.savePurchase({ name: "Compra base" });
    await f.bob.saveManualItem({ name: "Camiseta", url: "https://shop.test/shirt", unitPriceCents: 1_000, sharingMode: "equal", participants: [{ personId: "bob" }], quantity: 1 });
    await f.alice.finalizePurchase(purchase!.id, true);
    const accountService = hubbuyBalanceServices(f.db, "alice");
    const account = await accountService.createAccount({ workspaceId: "workspace", idempotencyKey: "orders-account", label: "Conta de teste", confirmZeroBalance: true });
    const service = packageCostServices(f.db, "alice"), tracking = await service.startTracking(purchase!.id);
    let detail = await service.getTracking(tracking.id);
    const created = await service.createAdditionalOrder(tracking.id, {
      expectedRevision: detail.tracking.revision, idempotencyKey: "additional-order-draft", accountId: account.accountId,
      externalReference: "SYNTH-ORDER-42", occurredAt: new Date("2026-10-16T12:00:00Z"),
      items: [{
        name: "Boné", url: "https://shop.test/cap", platform: "Taobao", visualKey: "cap", quantity: 2, itemOrder: 0,
        nativeProductState: "known", nativeProductCnyMinor: 10_000,
        nativeChinaState: "known", nativeChinaCnyMinor: 1_000,
        participants: [{ personId: "alice", weightMode: "equal", weight: 1 }, { personId: "bob", weightMode: "equal", weight: 1 }],
      }],
    });
    await expect(service.createAdditionalOrder(tracking.id, {
      expectedRevision: 0, idempotencyKey: "additional-order-draft", accountId: account.accountId,
      externalReference: "SYNTH-ORDER-42", occurredAt: new Date("2026-10-16T12:00:00Z"),
      items: [{ name: "Boné", url: "https://shop.test/cap", platform: "Taobao", visualKey: "cap", quantity: 2, itemOrder: 0, nativeProductState: "known", nativeProductCnyMinor: 10_000, nativeChinaState: "known", nativeChinaCnyMinor: 1_000, participants: [{ personId: "alice", weightMode: "equal", weight: 1 }, { personId: "bob", weightMode: "equal", weight: 1 }] }],
    })).resolves.toMatchObject({ orderId: created.orderId, replayed: true });
    detail = await service.getTracking(tracking.id);
    expect(detail.productOrders.find(order => order.id === created.orderId)).toMatchObject({ state: "draft", nativeCnyMinor: 11_000, newMoneyBrlCents: 0, items: [{ quantity: 2 }] });
    const charge = await f.db.select().from(purchaseCostCharges).where(eq(purchaseCostCharges.orderId, created.orderId)).get();
    await expect(service.markChargePaid(tracking.id, charge!.id, { expectedRevision: detail.tracking.revision })).rejects.toMatchObject({ code: "PAYMENT_COMPONENT_FLOW_REQUIRED" });

    const payment = {
      expectedRevision: detail.tracking.revision, idempotencyKey: "additional-order-payment", paymentMethod: "card" as const,
      principalBrlCents: 15_000, conversionCnyMinor: 11_000, conversionBrlCents: 15_000,
    };
    const recorded = await service.recordAdditionalOrderPayment(tracking.id, created.orderId, payment);
    const replay = await service.recordAdditionalOrderPayment(tracking.id, created.orderId, payment);
    expect(replay).toMatchObject({ operationId: recorded.operationId, replayed: true });
    detail = await service.getTracking(tracking.id);
    const order = detail.productOrders.find(row => row.id === created.orderId)!;
    expect(order).toMatchObject({ state: "recorded", nativeCnyMinor: 11_000, principalBrlCents: 15_000, feeBrlCents: 750, newMoneyBrlCents: 15_750 });
    expect(order.paymentComponents[0]).toMatchObject({ sourceType: "card", sourceCurrency: "BRL", feeBps: 500, conversionCnyMinor: 11_000, conversionBrlCents: 15_000 });
    expect(order.paymentComponents[0].allocations.reduce((sum, row) => sum + row.cnyMinor, 0)).toBe(11_000);
    expect(order.paymentComponents[0].allocations.reduce((sum, row) => sum + row.principalBrlCents, 0)).toBe(15_000);
    expect(order.paymentComponents[0].allocations.reduce((sum, row) => sum + row.feeBrlCents, 0)).toBe(750);
    expect(await f.db.select().from(purchaseCostOrders).where(eq(purchaseCostOrders.id, created.orderId)).get()).toMatchObject({ state: "recorded" });
    expect(await f.db.select().from(purchasePaymentComponents).where(eq(purchasePaymentComponents.orderId, created.orderId)).all()).toHaveLength(1);
    expect(await f.db.select().from(purchasePaymentAllocations).all()).toHaveLength(4);
    await expect(service.saveCharge(tracking.id, charge!.id, { expectedRevision: detail.tracking.revision, chargeType: "products", paymentMethod: "pix" })).rejects.toMatchObject({ code: "PAYMENT_SNAPSHOT_IMMUTABLE" });
    await expect(f.db.delete(purchasePaymentComponents).where(eq(purchasePaymentComponents.orderId, created.orderId)).run()).rejects.toThrow();
    expect((await f.alice.getData()).purchases.find(row => row.id === purchase!.id)).toMatchObject({ name: "Compra base" });

    const costItems = await f.db.select().from(purchaseItemCosts).where(eq(purchaseItemCosts.trackingId, tracking.id)).all();
    const originalCost = costItems.find(item => item.purchaseItemId !== null)!;
    const additionalCost = costItems.find(item => item.additionalOrderItemId !== null)!;
    const pkg = await f.db.select().from(purchasePackages).where(eq(purchasePackages.trackingId, tracking.id)).get();
    detail = await service.saveAllocations(tracking.id, {
      expectedRevision: detail.tracking.revision, packageId: pkg!.id,
      allocations: [{ costItemId: originalCost.id, quantity: 1 }, { costItemId: additionalCost.id, quantity: 2 }],
    });
    const packageItems = await f.db.select().from(purchasePackageItems).where(eq(purchasePackageItems.packageId, pkg!.id)).orderBy(asc(purchasePackageItems.allocationOrder)).all();
    expect(packageItems.map(({ costItemId, quantity, allocationOrder }) => ({ costItemId, quantity, allocationOrder }))).toEqual([
      { costItemId: originalCost.id, quantity: 1, allocationOrder: 0 },
      { costItemId: additionalCost.id, quantity: 2, allocationOrder: 1 },
    ]);
    expect(detail.packages.find(row => row.id === pkg!.id)?.items).toHaveLength(2);
  });

  it("consumes FIFO balance, captures only the external fee, and records an explicit CNY advance", async () => {
    const purchase = await f.alice.savePurchase({ name: "Compra mista" });
    await f.alice.finalizePurchase(purchase!.id, true);
    const accountService = hubbuyBalanceServices(f.db, "alice");
    const account = await accountService.createAccount({ workspaceId: "workspace", idempotencyKey: "mixed-account", label: "Conta mista", confirmZeroBalance: true });
    await f.db.update(hubbuyAccounts).set({ status: "reconciling", reconciledBy: null, reconciledAt: null }).where(eq(hubbuyAccounts.id, account.accountId)).run();
    await accountService.reconcileAccount(account.accountId, {
      expectedRevision: 0, idempotencyKey: "mixed-reconcile", observedBalanceCnyMinor: 6_000, reason: "Fixture sintética proporcional",
      shares: [{ personId: "alice", amountCnyMinor: 6_000, historicalBrlCents: 4_200 }],
    });
    const service = packageCostServices(f.db, "alice"), tracking = await service.startTracking(purchase!.id);
    let detail = await service.getTracking(tracking.id);
    const created = await service.createAdditionalOrder(tracking.id, {
      expectedRevision: detail.tracking.revision, idempotencyKey: "mixed-draft", accountId: account.accountId,
      items: [{ name: "Jaqueta", url: "https://shop.test/jacket", platform: "Taobao", visualKey: "hoodie", quantity: 1, itemOrder: 0,
        nativeProductState: "known", nativeProductCnyMinor: 10_000, nativeChinaState: "known", nativeChinaCnyMinor: 1_000,
        participants: [{ personId: "alice", weightMode: "equal", weight: 1 }, { personId: "bob", weightMode: "equal", weight: 1 }] }],
    });
    detail = await service.getTracking(tracking.id);
    const orderCost = detail.productOrders.find(order => order.id === created.orderId)!.items[0].cost;
    const payment = await service.recordAdditionalOrderMixedPayment(tracking.id, created.orderId, {
      expectedRevision: detail.tracking.revision, idempotencyKey: "mixed-payment", useOwnBalance: true,
      balanceFunding: [{ costItemId: orderCost.id, costComponent: "product", beneficiaryId: "bob", lenderId: "alice", cnyMinor: 500 }],
      external: { paymentMethod: "pix", principalBrlCents: 8_000, conversionCnyMinor: 5_000, conversionBrlCents: 8_000 },
    });
    detail = await service.getTracking(tracking.id);
    const order = detail.productOrders.find(row => row.id === created.orderId)!;
    expect(payment).toMatchObject({ replayed: false, balanceCnyMinor: 6_000, historicalBrlCents: 4_200, externalCnyMinor: 5_000, feeBrlCents: 80 });
    expect(order).toMatchObject({ state: "recorded", principalBrlCents: 8_000, historicalBrlCents: 4_200, feeBrlCents: 80, totalCostBrlCents: 12_280, newMoneyBrlCents: 8_080 });
    expect(order.paymentComponents.reduce((sum, row) => sum + row.cnyMinor, 0)).toBe(11_000);
    expect(order.paymentComponents.filter(row => row.sourceType === "balance").every(row => row.feeBrlCents === 0 && row.feeBps === 0)).toBe(true);
    expect(await accountService.getAccountBalance(account.accountId)).toMatchObject({ ledgerBalanceCnyMinor: 0, reconciled: true, rights: [{ personId: "alice", availableCnyMinor: 0, availableHistoricalBrlCents: 0 }] });
    const consumptions = await f.db.select().from(hubbuyBalanceConsumptions).all();
    expect(consumptions).toHaveLength(3);
    expect(consumptions.every(row => row.paymentAllocationId !== null)).toBe(true);
    expect(await f.db.select().from(memberBalanceFinancingEntries).all()).toMatchObject([{ entryType: "advance", lenderId: "alice", beneficiaryId: "bob", amountCnyMinor: 500, historicalBrlCents: 350 }]);
    expect(await f.db.select().from(purchasePaymentComponents).where(eq(purchasePaymentComponents.orderId, created.orderId)).all()).toHaveLength(4);
    expect(await f.db.select().from(purchasePaymentAllocations).all()).toHaveLength(5);
  });
});
