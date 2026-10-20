import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { hubbuyBalanceConsumptions } from "@/lib/db/schema";
import { financialOperations, hubbuyAccounts, hubbuyBalanceEntries, hubbuyExternalItems, purchaseAdditionalOrderItems, purchaseCostOrders, purchaseItemCosts, purchaseOrderCorrections, purchasePackageItems, purchasePaymentAllocations, purchasePaymentComponents, qcAdditionalPresentations } from "@/lib/db/schema";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import { packageCostServices } from "@/lib/domain/package-cost-services";
import { qcServices } from "@/lib/domain/qc-services";
import { fixture, type Fixture } from "./helpers";

let f: Fixture;
beforeEach(async () => { f = await fixture(); });
afterEach(() => f.client.close());

async function setup(source: "balance" | "pix" = "balance", beneficiary = "alice") {
  const purchase = await f.alice.savePurchase({ name: "Correção sintética" });
  await f.alice.saveManualItem({ name: "Camisa", url: "https://shop.test/shirt", unitPriceCents: 3_058, personId: "alice", quantity: 1 });
  await f.alice.finalizePurchase(purchase!.id, true);
  const service = packageCostServices(f.db, "alice"), tracking = await service.startTracking(purchase!.id);
  let detail = await service.getTracking(tracking.id);
  detail = await service.saveItemCosts(tracking.id, { expectedRevision: detail.tracking.revision, itemId: detail.items[0].id, effectivePriceState: "known", effectivePriceUnitCents: 3_058, chinaFreightState: "known", chinaFreightUnitCents: 800 });
  detail = await service.saveCharge(tracking.id, detail.productsCharge!.id, { expectedRevision: detail.tracking.revision, chargeType: "products", paymentMethod: "pix" });
  detail = await service.markChargePaid(tracking.id, detail.productsCharge!.id, { expectedRevision: detail.tracking.revision });
  const originalCharge = detail.productsCharge;
  const accounts = hubbuyBalanceServices(f.db, "alice");
  const account = await accounts.createAccount({ workspaceId: "workspace", idempotencyKey: "correct-account", label: "Conta sintética", confirmZeroBalance: true });
  await f.db.update(hubbuyAccounts).set({ status: "reconciling", reconciledBy: null, reconciledAt: null }).where(eq(hubbuyAccounts.id, account.accountId)).run();
  await accounts.reconcileAccount(account.accountId, { expectedRevision: 0, idempotencyKey: "correct-opening", observedBalanceCnyMinor: 2_500, reason: "Abertura sintética", shares: [{ personId: "alice", amountCnyMinor: 2_500, historicalBrlCents: 1_927 }] });
  const created = await service.createAdditionalOrder(tracking.id, { expectedRevision: detail.tracking.revision, idempotencyKey: "correct-draft", accountId: account.accountId, items: [{ name: "Elixir", url: "https://shop.test/elixir", platform: "Taobao", visualKey: "generic", quantity: 1, itemOrder: 0, nativeProductState: "known", nativeProductCnyMinor: 2_500, nativeChinaState: "no_charge", nativeChinaCnyMinor: null, participants: [{ personId: beneficiary, weightMode: "equal", weight: 1 }] }] });
  detail = await service.getTracking(tracking.id);
  await service.recordAdditionalOrderMixedPayment(tracking.id, created.orderId, { expectedRevision: detail.tracking.revision, idempotencyKey: "correct-original-payment", useOwnBalance: source === "balance", ...(beneficiary !== "alice" && source === "balance" ? { balanceFunding: [{ costItemId: detail.productOrders.find(order => order.id === created.orderId)!.items[0].cost.id, costComponent: "product", beneficiaryId: beneficiary, lenderId: "alice", cnyMinor: 2_500 }] } : {}), external: source === "pix" ? { paymentMethod: "pix", principalBrlCents: 2_000, conversionCnyMinor: 2_500, conversionBrlCents: 2_000 } : null });
  detail = await service.getTracking(tracking.id);
  const row = detail.productOrders.find(order => order.id === created.orderId)!.items[0];
  detail = await service.saveAllocations(tracking.id, { expectedRevision: detail.tracking.revision, packageId: detail.packages[0].id, allocations: [{ costItemId: detail.items[0].id, quantity: 1 }, { costItemId: row.cost.id, quantity: 1 }] });
  const balance = await accounts.getAccountBalance(account.accountId);
  const input = { expectedRevision: detail.tracking.revision, expectedAccountRevision: balance.account.revision, idempotencyKey: "correct-paid-item", reason: "Valor registrado incorretamente", confirmedIncorrectRegistration: true as const, itemId: row.cost.id, name: "Elixir corrigida", url: "https://shop.test/elixir-correct", variant: "Modelo corrigido", notes: "Observação corrigida", quantity: 1, nativeProductCnyMinor: 2_000, nativeChinaCnyMinor: 0, composition: { mode: "equal" as const, participants: [{ personId: beneficiary, weight: 1 }] }, useOwnBalance: source === "balance", external: source === "pix" ? { paymentMethod: "pix" as const, principalBrlCents: 1_600, conversionCnyMinor: 2_000, conversionBrlCents: 1_600, feeBps: 100 } : null };
  return { service, trackingId: tracking.id, orderId: created.orderId, accounts, accountId: account.accountId, detail, row, input, originalCharge };
}

describe("paid additional order corrections", () => {
  it("previews without writes, compensates exact rights, preserves snapshots, packages and original Pix, and replays", async () => {
    const s = await setup();
    const oldComponents = await f.db.select().from(purchasePaymentComponents).where(eq(purchasePaymentComponents.orderId, s.orderId)).all();
    const oldAllocations = await f.db.select().from(purchasePaymentAllocations).all();
    const oldItem = await f.db.select().from(purchaseAdditionalOrderItems).where(eq(purchaseAdditionalOrderItems.id, s.row.item!.id)).get();
    const oldCost = await f.db.select().from(purchaseItemCosts).where(eq(purchaseItemCosts.id, s.row.cost.id)).get();
    await f.db.insert(hubbuyExternalItems).values({ id: "qc-correction", workspaceId: "workspace", purchaseId: s.detail.purchase.id, additionalOrderItemId: oldItem!.id, revision: 0, createdAt: new Date(), updatedAt: new Date() }).run();
    await f.db.insert(qcAdditionalPresentations).values({ additionalOrderItemId: oldItem!.id, primaryImageId: null, revision: 0, updatedAt: new Date() }).run();
    const preview = await s.service.correctAdditionalOrder(s.trackingId, s.orderId, s.input, true);
    expect(preview).toMatchObject({ balanceBeforeCnyMinor: 0, balanceAfterCnyMinor: 500, historicalBrlCents: 1_542, totalCostBrlCents: 1_542, feeBrlCents: 0 });
    expect((await s.accounts.getAccountBalance(s.accountId)).account.balanceCnyMinor).toBe(0);
    expect(await f.db.select().from(purchaseOrderCorrections).all()).toHaveLength(0);
    expect((await s.service.getTracking(s.trackingId)).tracking.revision).toBe(s.input.expectedRevision);
    const result = await s.service.correctAdditionalOrder(s.trackingId, s.orderId, s.input);
    const detail = await s.service.getTracking(s.trackingId);
    expect(detail.productOrders.some(order => order.id === s.orderId)).toBe(false);
    const replacement = detail.productOrders.find(order => order.id === result.replacementOrderId)!;
    expect((await f.db.select().from(hubbuyExternalItems).where(eq(hubbuyExternalItems.id, "qc-correction")).get())?.additionalOrderItemId).toBe(replacement.items[0].item!.id);
    expect((await f.db.select().from(qcAdditionalPresentations).all())[0].additionalOrderItemId).toBe(replacement.items[0].item!.id);
    const targets = await qcServices(f.db, "alice").getTargets(s.detail.purchase.id);
    expect(targets.some(target => target.id === `additional:${oldItem!.id}`)).toBe(false);
    expect(targets.some(target => target.id === `additional:${replacement.items[0].item!.id}`)).toBe(true);
    expect(replacement).toMatchObject({ totalCostBrlCents: 1_542, feeBrlCents: 0, items: [{ item: { name: "Elixir corrigida", variant: "Modelo corrigido" } }] });
    expect(detail.calculation.summary.partialCents).toBe(3_897 + 1_542);
    expect(detail.productsCharge).toEqual(s.originalCharge);
    expect(detail.packages[0].items.some(row => row.costItemId === replacement.items[0].cost.id && row.quantity === 1)).toBe(true);
    expect(detail.packages[0].items.some(row => row.costItemId === s.row.cost.id)).toBe(false);
    expect(detail.packages[0].contentRevision).toBe(s.detail.packages[0].contentRevision + 1);
    expect(await f.db.select().from(purchaseAdditionalOrderItems).where(eq(purchaseAdditionalOrderItems.id, oldItem!.id)).get()).toEqual(oldItem);
    expect(await f.db.select().from(purchaseItemCosts).where(eq(purchaseItemCosts.id, oldCost!.id)).get()).toEqual(oldCost);
    expect(await f.db.select().from(purchasePaymentComponents).where(eq(purchasePaymentComponents.orderId, s.orderId)).all()).toEqual(oldComponents);
    expect((await f.db.select().from(purchasePaymentAllocations).all()).filter(row => oldAllocations.some(old => old.id === row.id))).toEqual(oldAllocations);
    expect(await s.accounts.getAccountBalance(s.accountId)).toMatchObject({ reconciled: true, ledgerBalanceCnyMinor: 500, rights: [{ personId: "alice", availableCnyMinor: 500, availableHistoricalBrlCents: 385 }] });
    await expect(s.service.correctAdditionalOrder(s.trackingId, s.orderId, s.input)).resolves.toMatchObject({ replacementOrderId: result.replacementOrderId, replayed: true });
    await expect(s.service.correctAdditionalOrder(s.trackingId, s.orderId, { ...s.input, reason: "Outro motivo" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await f.db.select().from(purchaseOrderCorrections).all()).toHaveLength(1);
    await expect(f.db.delete(purchaseOrderCorrections).run()).rejects.toThrow();
  });

  it("corrects an external payment without modifying the original fee or debiting wallet funds", async () => {
    const s = await setup("pix");
    const result = await s.service.correctAdditionalOrder(s.trackingId, s.orderId, s.input);
    expect(result).toMatchObject({ principalBrlCents: 1_600, feeBrlCents: 16, balanceBeforeCnyMinor: 2_500, balanceAfterCnyMinor: 2_500, totalCostBrlCents: 1_616 });
    const original = await f.db.select().from(purchasePaymentComponents).where(eq(purchasePaymentComponents.orderId, s.orderId)).get();
    expect(original).toMatchObject({ principalBrlCents: 2_000, feeBrlCents: 20, feeBps: 100 });
    expect((await s.service.getTracking(s.trackingId)).productsCharge).toEqual(s.originalCharge);
  });

  it("supports mixed replacement funding and a second correction without counting superseded units", async () => {
    const s = await setup();
    const first = await s.service.correctAdditionalOrder(s.trackingId, s.orderId, { ...s.input, nativeProductCnyMinor: 3_000, external: { paymentMethod: "pix", principalBrlCents: 400, conversionCnyMinor: 500, conversionBrlCents: 400, feeBps: 100 } });
    expect(first).toMatchObject({ historicalBrlCents: 1_927, principalBrlCents: 400, feeBrlCents: 4, totalCostBrlCents: 2_331, balanceAfterCnyMinor: 0 });
    let detail = await s.service.getTracking(s.trackingId);
    const firstOrder = detail.productOrders.find(order => order.id === first.replacementOrderId)!;
    const account = await s.accounts.getAccountBalance(s.accountId);
    const second = await s.service.correctAdditionalOrder(s.trackingId, first.replacementOrderId, { ...s.input, idempotencyKey: "correct-again", expectedRevision: detail.tracking.revision, expectedAccountRevision: account.account.revision, itemId: firstOrder.items[0].cost.id });
    detail = await s.service.getTracking(s.trackingId);
    expect(second).toMatchObject({ totalCostBrlCents: 1_542, balanceAfterCnyMinor: 500 });
    expect(detail.orderCorrections).toHaveLength(2);
    expect(detail.productOrders.filter(order => order.kind === "additional")).toHaveLength(1);
    expect(detail.calculation.summary.shippingUnits).toBe(2);
    expect(detail.calculation.summary.partialCents).toBe(3_897 + 1_542);
    expect(detail.productsCharge).toEqual(s.originalCharge);
  });

  it("corrects China freight after product funding exhausts an earlier credit lot", async () => {
    const s = await setup();
    const first = await s.service.correctAdditionalOrder(s.trackingId, s.orderId, s.input);
    const detail = await s.service.getTracking(s.trackingId);
    const order = detail.productOrders.find(row => row.id === first.replacementOrderId)!;
    const balance = await s.accounts.getAccountBalance(s.accountId);
    const input = {
      ...s.input,
      idempotencyKey: "correct-freight-across-lots",
      expectedRevision: detail.tracking.revision,
      expectedAccountRevision: balance.account.revision,
      itemId: order.items[0].cost.id,
      nativeChinaCnyMinor: 100,
    };
    const preview = await s.service.correctAdditionalOrder(s.trackingId, order.id, input, true);
    expect(preview).toMatchObject({ balanceBeforeCnyMinor: 500, balanceAfterCnyMinor: 400, historicalBrlCents: 1_619, feeBrlCents: 0 });
    expect((await s.accounts.getAccountBalance(s.accountId)).ledgerBalanceCnyMinor).toBe(500);
    const result = await s.service.correctAdditionalOrder(s.trackingId, order.id, input);
    expect(result).toMatchObject({ balanceAfterCnyMinor: 400, historicalBrlCents: 1_619 });
    const corrected = await s.service.getTracking(s.trackingId);
    const replacement = corrected.productOrders.find(row => row.id === result.replacementOrderId)!;
    const allocations = await f.db.select().from(purchasePaymentAllocations).all();
    const consumptionRows = await f.db.select().from(hubbuyBalanceConsumptions).all();
    const replacementIds = new Set(allocations.filter(row => row.costItemId === replacement.items[0].cost.id).map(row => row.id));
    const used = consumptionRows.filter(row => replacementIds.has(row.paymentAllocationId!));
    expect(used).toHaveLength(3);
    expect(used.every(row => row.amountCnyMinor > 0)).toBe(true);
    expect(used.reduce((sum, row) => sum + row.amountCnyMinor, 0)).toBe(2_100);
    expect(used.reduce((sum, row) => sum + row.historicalBrlCents, 0)).toBe(1_619);
    expect(await s.accounts.getAccountBalance(s.accountId)).toMatchObject({ reconciled: true, ledgerBalanceCnyMinor: 400, rights: [{ personId: "alice", availableCnyMinor: 400, availableHistoricalBrlCents: 308 }] });
    expect(corrected.productsCharge).toEqual(s.originalCharge);
    await expect(s.service.correctAdditionalOrder(s.trackingId, order.id, input)).resolves.toMatchObject({ replayed: true, replacementOrderId: result.replacementOrderId });
  });

  it("rejects foreign access, stale versions, invalid composition and insufficient funds without partial writes", async () => {
    const s = await setup();
    await expect(packageCostServices(f.db, "outsider").correctAdditionalOrder(s.trackingId, s.orderId, s.input)).rejects.toThrow();
    await expect(s.service.correctAdditionalOrder(s.trackingId, s.orderId, { ...s.input, expectedAccountRevision: 0 })).rejects.toMatchObject({ code: "BALANCE_REVISION_CONFLICT" });
    await expect(s.service.correctAdditionalOrder(s.trackingId, s.orderId, { ...s.input, nativeProductCnyMinor: 5_000 })).rejects.toMatchObject({ code: "EXTERNAL_PAYMENT_REQUIRED" });
    await expect(s.service.correctAdditionalOrder(s.trackingId, s.orderId, { ...s.input, composition: { mode: "percentage", participants: [{ personId: "alice", weight: 9_000 }] } })).rejects.toThrow(/100%/);
    expect(await f.db.select().from(purchaseOrderCorrections).all()).toHaveLength(0);
    expect((await f.db.select().from(purchaseCostOrders).all())).toHaveLength(2);
    expect((await s.accounts.getAccountBalance(s.accountId)).ledgerBalanceCnyMinor).toBe(0);
    expect((await s.service.getTracking(s.trackingId)).tracking.revision).toBe(s.input.expectedRevision);
  });

  it("rolls back compensation, replacement, audit and package updates on failure", async () => {
    const s = await setup();
    const entriesBefore = await f.db.select().from(hubbuyBalanceEntries).all();
    const operationsBefore = await f.db.select().from(financialOperations).all();
    const packagesBefore = await f.db.select().from(purchasePackageItems).all();
    await f.client.execute("CREATE TRIGGER correction_test_failure BEFORE INSERT ON purchase_order_corrections BEGIN SELECT RAISE(ABORT, 'injected correction failure'); END");
    await expect(s.service.correctAdditionalOrder(s.trackingId, s.orderId, s.input)).rejects.toThrow();
    expect(await f.db.select().from(hubbuyBalanceEntries).all()).toEqual(entriesBefore);
    expect(await f.db.select().from(financialOperations).all()).toEqual(operationsBefore);
    expect(await f.db.select().from(purchasePackageItems).all()).toEqual(packagesBefore);
    expect((await s.accounts.getAccountBalance(s.accountId)).ledgerBalanceCnyMinor).toBe(0);
  });

  it("blocks sent packages and active refunds and allows a refund of the corrected snapshot", async () => {
    const s = await setup();
    let detail = await s.service.savePackage(s.trackingId, s.detail.packages[0].id, { expectedRevision: s.detail.tracking.revision, name: s.detail.packages[0].name, logisticsStatus: "sent" });
    await expect(s.service.correctAdditionalOrder(s.trackingId, s.orderId, { ...s.input, expectedRevision: detail.tracking.revision })).rejects.toMatchObject({ code: "CORRECTION_PACKAGE_DEPENDENCY" });
    detail = await s.service.savePackage(s.trackingId, detail.packages[0].id, { expectedRevision: detail.tracking.revision, name: detail.packages[0].name, logisticsStatus: "preparing" });
    detail = await s.service.unsealPackageContent(s.trackingId, detail.packages[0].id, { expectedRevision: detail.tracking.revision, reason: "Correção sintética de envio" });
    const result = await s.service.correctAdditionalOrder(s.trackingId, s.orderId, { ...s.input, expectedRevision: detail.tracking.revision });
    detail = await s.service.getTracking(s.trackingId);
    const row = detail.productOrders.find(order => order.id === result.replacementOrderId)!.items[0];
    detail = await s.service.requestRefund(s.trackingId, { expectedRevision: detail.tracking.revision, costItemId: row.cost.id, quantity: 1, requestedProductCents: 1_542, requestedChinaCents: 0, reason: "Devolução sintética após correção", packageRemovals: [{ packageId: detail.packages[0].id, quantity: 1 }], unassignedQuantity: 0 });
    const account = await s.accounts.getAccountBalance(s.accountId);
    await expect(s.service.correctAdditionalOrder(s.trackingId, result.replacementOrderId, { ...s.input, idempotencyKey: "second-correction", itemId: row.cost.id, expectedRevision: detail.tracking.revision, expectedAccountRevision: account.account.revision })).rejects.toMatchObject({ code: "CORRECTION_REFUND_DEPENDENCY" });
    await expect(s.service.requestRefund(s.trackingId, { expectedRevision: detail.tracking.revision, costItemId: s.row.cost.id, quantity: 1, requestedProductCents: 1_000, requestedChinaCents: 0, reason: "Origem antiga", packageRemovals: [], unassignedQuantity: 1 })).rejects.toThrow(/correção/);
    expect(detail.refunds[0]).toMatchObject({ originalChargeBaseCents: 1_542, originalChargeFeeCents: 0 });
    expect(detail.productsCharge).toEqual(s.originalCharge);
  });

  it("replaces an outstanding advance only with explicitly authorized replacement funding", async () => {
    const s = await setup("balance", "bob");
    await expect(s.service.correctAdditionalOrder(s.trackingId, s.orderId, s.input)).rejects.toMatchObject({ code: "EXTERNAL_PAYMENT_REQUIRED" });
    const result = await s.service.correctAdditionalOrder(s.trackingId, s.orderId, { ...s.input, balanceFunding: [{ costItemId: s.row.cost.id, costComponent: "product", beneficiaryId: "bob", lenderId: "alice", cnyMinor: 2_000 }] });
    const detail = await s.service.getTracking(s.trackingId);
    const replacement = detail.productOrders.find(order => order.id === result.replacementOrderId)!;
    expect(replacement.items[0].financingPositions).toMatchObject([{ lenderId: "alice", beneficiaryId: "bob", openCnyMinor: 2_000, openHistoricalBrlCents: 1_542 }]);
    expect(detail.productOrders.flatMap(order => order.items.flatMap(item => item.financingPositions))).toHaveLength(1);
    expect((await s.accounts.getAccountBalance(s.accountId)).rights).toMatchObject([{ personId: "alice", availableCnyMinor: 500 }]);
  });

  it("serializes identical confirmations from independent processes without duplicate credit", async () => {
    await f.client.close();
    const dbUrl = `file:./data/correction-concurrency-${randomUUID()}.sqlite`;
    f = await fixture(dbUrl);
    await f.client.execute("PRAGMA journal_mode=WAL");
    const s = await setup();
    const run = async () => {
      const result = await promisify(execFile)(process.execPath, ["--import", "tsx", "tests/integration/package-refund-concurrent-worker.ts"], { cwd: process.cwd(), timeout: 30_000, env: { ...process.env, LOTI_REFUND_DATABASE_URL: dbUrl, LOTI_REFUND_TRACKING_ID: s.trackingId, LOTI_REFUND_USER_ID: "alice", LOTI_REFUND_ACTION: "correct-order", LOTI_REFUND_ORDER_ID: s.orderId, LOTI_REFUND_INPUT: JSON.stringify(s.input) } });
      return JSON.parse(result.stdout) as { ok: boolean };
    };
    const results = await Promise.all([run(), run()]);
    expect(results.every(result => result.ok), JSON.stringify(results)).toBe(true);
    expect(await f.db.select().from(purchaseOrderCorrections).all()).toHaveLength(1);
    expect((await s.accounts.getAccountBalance(s.accountId)).ledgerBalanceCnyMinor).toBe(500);
  }, 45_000);
});
