import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { hubbuyAccounts, hubbuyBalanceConsumptions, hubbuyBalanceEntries, purchaseRefundPaymentAllocations } from "@/lib/db/schema";
import { hubbuyBalanceServices as balanceServices } from "@/lib/domain/hubbuy-balance-services";
import { packageCostServices } from "@/lib/domain/package-cost-services";
import { fixture, type Fixture } from "./helpers";

let f: Fixture;
beforeEach(async () => { f = await fixture(); });
afterEach(() => f.client.close());

async function paidTracking() {
  const purchase = await f.alice.savePurchase({ name: "Reembolso HubBuy sintético" });
  await f.bob.saveManualItem({ name: "SSD", url: "https://example.test/ssd", quantity: 1, unitPriceCents: 10_000, personId: "bob" });
  await f.alice.finalizePurchase(purchase!.id, true);
  const service = packageCostServices(f.db, "alice"), tracking = await service.startTracking(purchase!.id);
  let detail = await service.getTracking(tracking.id);
  detail = await service.saveItemCosts(tracking.id, { expectedRevision: detail.tracking.revision, itemId: detail.items[0].id, effectivePriceState: "known", effectivePriceUnitCents: 10_000, chinaFreightState: "known", chinaFreightUnitCents: 1_000 });
  detail = await service.saveCharge(tracking.id, detail.productsCharge!.id, { expectedRevision: detail.tracking.revision, chargeType: "products", paymentMethod: "pix" });
  detail = await service.markChargePaid(tracking.id, detail.productsCharge!.id, { expectedRevision: detail.tracking.revision });
  return { service, tracking, detail };
}

async function activeAccount() {
  const service = balanceServices(f.db, "alice");
  const created = await service.createAccount({ workspaceId: "workspace", idempotencyKey: "refund-test-account", label: "HubBuy QA", confirmZeroBalance: true });
  return created.accountId;
}

async function requestOne(service: ReturnType<typeof packageCostServices>, trackingId: string, detail: Awaited<ReturnType<typeof service.getTracking>>) {
  return service.requestRefund(trackingId, {
    expectedRevision: detail.tracking.revision, costItemId: detail.items[0].id, quantity: 1,
    requestedProductCents: 10_000, requestedChinaCents: 1_000, reason: "Crédito de devolução confirmado",
    packageRemovals: [{ packageId: detail.packages[0].id, quantity: 1 }], unassignedQuantity: 0,
  });
}

async function paidAdditionalBalanceOrder() {
  const { service, tracking } = await paidTracking();
  const accountService = balanceServices(f.db, "alice");
  const account = await accountService.createAccount({ workspaceId: "workspace", idempotencyKey: "additional-refund-account", label: "HubBuy QA adicional", confirmZeroBalance: true });
  await f.db.update(hubbuyAccounts).set({ status: "reconciling", reconciledBy: null, reconciledAt: null }).where(eq(hubbuyAccounts.id, account.accountId)).run();
  await accountService.reconcileAccount(account.accountId, { expectedRevision: 0, idempotencyKey: "additional-refund-reconcile", observedBalanceCnyMinor: 1_000, reason: "Saldo sintético de teste", shares: [{ personId: "alice", amountCnyMinor: 1_000, historicalBrlCents: 700 }] });
  let detail = await service.getTracking(tracking.id);
  const draft = await service.createAdditionalOrder(tracking.id, {
    expectedRevision: detail.tracking.revision, idempotencyKey: "additional-refund-draft", accountId: account.accountId,
    items: [{ name: "Item adicional", url: "https://shop.test/additional", platform: "Taobao", visualKey: "generic", quantity: 1, itemOrder: 0,
      nativeProductState: "known", nativeProductCnyMinor: 1_000, nativeChinaState: "no_charge", nativeChinaCnyMinor: null,
      participants: [{ personId: "bob", weightMode: "equal", weight: 1 }] }],
  });
  detail = await service.getTracking(tracking.id);
  const item = detail.productOrders.find(order => order.id === draft.orderId)!.items[0];
  await service.recordAdditionalOrderMixedPayment(tracking.id, draft.orderId, {
    expectedRevision: detail.tracking.revision, idempotencyKey: "additional-refund-payment", useOwnBalance: true,
    balanceFunding: [{ costItemId: item.cost.id, costComponent: "product", beneficiaryId: "bob", lenderId: "alice", cnyMinor: 1_000 }], external: null,
  });
  return { service, trackingId: tracking.id, accountId: account.accountId, orderId: draft.orderId, costItemId: item.cost.id };
}

async function requestAdditionalRefund(service: ReturnType<typeof packageCostServices>, trackingId: string, costItemId: string) {
  const detail = await service.getTracking(trackingId);
  return service.requestRefund(trackingId, { expectedRevision: detail.tracking.revision, costItemId, quantity: 1,
    requestedProductCents: 700, requestedChinaCents: 0, reason: "Cancelamento sintético do pedido adicional", packageRemovals: [], unassignedQuantity: 1 });
}

describe("HubBuy refund credits", () => {
  it("creates a new account and credits it atomically on the first confirmed HubBuy receipt", async () => {
    const { service, tracking, detail } = await paidTracking();
    let current = await requestOne(service, tracking.id, detail);
    const refundId = current.refunds[0].id;
    const receipt = {
      expectedRevision: current.tracking.revision, receivedProductCents: 8_000, receivedChinaCents: 1_000,
      destination: "hubbuy" as const, newAccountLabel: "Conta do primeiro reembolso", confirmZeroBalance: true as const,
      receivedProductCnyMinor: 10_000, receivedChinaCnyMinor: 1_000, nativeEvidence: "Crédito confirmado no refund inline QA", confirmed: true as const,
    };
    current = await service.receiveRefund(tracking.id, refundId, receipt);
    const accountId = current.refunds[0].hubbuyAccountId!;
    expect(current.refunds[0]).toMatchObject({ status: "received", refundDestination: "hubbuy", receivedProductCnyMinor: 10_000, receivedChinaCnyMinor: 1_000 });
    expect(await f.db.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, accountId)).get()).toMatchObject({ label: "Conta do primeiro reembolso", status: "active", balanceCnyMinor: 11_000, revision: 1 });
    expect(await f.db.select().from(hubbuyBalanceEntries).where(eq(hubbuyBalanceEntries.accountId, accountId)).all()).toMatchObject([{ direction: "credit", amountCnyMinor: 11_000, historicalBrlCents: 9_000, sourceType: "refund_received" }]);
    expect(await f.db.select().from(purchaseRefundPaymentAllocations).where(eq(purchaseRefundPaymentAllocations.operationId, current.refunds[0].receiptOperationId!)).all()).toHaveLength(2);

    const replay = await service.receiveRefund(tracking.id, refundId, { ...receipt, expectedRevision: current.tracking.revision - 1 });
    expect(replay.refunds[0].hubbuyAccountId).toBe(accountId);
    expect(await f.db.select().from(hubbuyAccounts).all()).toHaveLength(1);
    expect(await f.db.select().from(hubbuyBalanceEntries).where(eq(hubbuyBalanceEntries.accountId, accountId)).all()).toHaveLength(1);
  });

  it("rolls back inline account creation for a zero-CNY receipt", async () => {
    const { service, tracking, detail } = await paidTracking();
    const current = await requestOne(service, tracking.id, detail);
    await expect(service.receiveRefund(tracking.id, current.refunds[0].id, {
      expectedRevision: current.tracking.revision, receivedProductCents: 8_000, receivedChinaCents: 0,
      destination: "hubbuy", newAccountLabel: "Conta sem crédito", confirmZeroBalance: true,
      receivedProductCnyMinor: 0, receivedChinaCnyMinor: 0, nativeEvidence: "Comprovante sem crédito CNY", confirmed: true,
    })).rejects.toMatchObject({ code: "REFUND_ZERO_CREDIT_ACCOUNT_FORBIDDEN" });
    expect(await f.db.select().from(hubbuyAccounts).all()).toHaveLength(0);
    expect(await f.db.select().from(hubbuyBalanceEntries).all()).toHaveLength(0);
    expect((await service.getTracking(tracking.id)).refunds[0]).toMatchObject({ status: "requested", receiptOperationId: null });
  });

  it("activates an eligible empty legacy account together with its first refund credit", async () => {
    const { service, tracking, detail } = await paidTracking();
    const created = await balanceServices(f.db, "alice").createAccount({ workspaceId: "workspace", idempotencyKey: "legacy-refund-empty", label: "Conta antiga vazia", confirmZeroBalance: true });
    await f.db.update(hubbuyAccounts).set({ status: "reconciling", reconciledBy: null, reconciledAt: null }).where(eq(hubbuyAccounts.id, created.accountId)).run();
    const current = await requestOne(service, tracking.id, detail);
    const received = await service.receiveRefund(tracking.id, current.refunds[0].id, {
      expectedRevision: current.tracking.revision, receivedProductCents: 8_000, receivedChinaCents: 1_000,
      destination: "hubbuy", accountId: created.accountId, expectedAccountRevision: 0, confirmedNoPriorBalance: true,
      receivedProductCnyMinor: 10_000, receivedChinaCnyMinor: 1_000, nativeEvidence: "Primeiro crédito da conta antiga", confirmed: true,
    });
    expect(received.refunds[0].hubbuyAccountId).toBe(created.accountId);
    expect(await f.db.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, created.accountId)).get()).toMatchObject({ status: "active", balanceCnyMinor: 11_000, revision: 2 });
    expect(await f.db.select().from(hubbuyBalanceEntries).where(eq(hubbuyBalanceEntries.accountId, created.accountId)).all()).toHaveLength(1);
  });

  it("does not activate a legacy account with reconciliation history during refund receipt", async () => {
    const { service, tracking, detail } = await paidTracking();
    const accounts = balanceServices(f.db, "alice");
    const created = await accounts.createAccount({ workspaceId: "workspace", idempotencyKey: "legacy-refund-history", label: "Conta antiga com conferência", confirmZeroBalance: true });
    await f.db.update(hubbuyAccounts).set({ status: "reconciling", reconciledBy: null, reconciledAt: null }).where(eq(hubbuyAccounts.id, created.accountId)).run();
    await accounts.startReconciliation(created.accountId, { expectedRevision: 0, idempotencyKey: "legacy-refund-history-start", mode: "chronological" });
    const current = await requestOne(service, tracking.id, detail);
    await expect(service.receiveRefund(tracking.id, current.refunds[0].id, {
      expectedRevision: current.tracking.revision, receivedProductCents: 8_000, receivedChinaCents: 1_000,
      destination: "hubbuy", accountId: created.accountId, expectedAccountRevision: 1, confirmedNoPriorBalance: true,
      receivedProductCnyMinor: 10_000, receivedChinaCnyMinor: 1_000, nativeEvidence: "Crédito que não deve registrar", confirmed: true,
    })).rejects.toMatchObject({ code: "ACCOUNT_ZERO_ACTIVATION_INELIGIBLE" });
    expect(await f.db.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, created.accountId)).get()).toMatchObject({ status: "reconciling", revision: 1, balanceCnyMinor: 0 });
    expect(await f.db.select().from(hubbuyBalanceEntries).all()).toHaveLength(0);
    expect((await service.getTracking(tracking.id)).refunds[0]).toMatchObject({ status: "requested", receiptOperationId: null });
  });

  it("credits only confirmed CNY receipts and preserves the original payment snapshot", async () => {
    const { service, tracking, detail } = await paidTracking();
    const accountId = await activeAccount();
    let current = await requestOne(service, tracking.id, detail);
    const originalCharge = current.productsCharge!;
    current = await service.receiveRefund(tracking.id, current.refunds[0].id, {
      expectedRevision: current.tracking.revision, receivedProductCents: 8_000, receivedChinaCents: 1_000,
      destination: "hubbuy", accountId, receivedProductCnyMinor: 10_000, receivedChinaCnyMinor: 1_000,
      nativeEvidence: "Crédito efetivamente confirmado no pedido sintético QA-1", confirmed: true,
    });

    expect(current.refunds[0]).toMatchObject({ status: "received", refundDestination: "hubbuy", hubbuyAccountId: accountId, receivedProductCnyMinor: 10_000, receivedChinaCnyMinor: 1_000 });
    expect(current.productsCharge).toMatchObject({ paymentStatus: "paid", paidAt: originalCharge.paidAt, paidBy: originalCharge.paidBy, feeBps: 100 });
    expect(await f.db.select().from(hubbuyBalanceEntries).where(eq(hubbuyBalanceEntries.accountId, accountId)).all()).toHaveLength(1);
    expect(await f.db.select().from(purchaseRefundPaymentAllocations).all()).toHaveLength(2);
    expect(await f.db.select().from(hubbuyBalanceConsumptions).all()).toHaveLength(0);
    expect(await f.db.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, accountId)).get()).toMatchObject({ balanceCnyMinor: 11_000 });
    const replay = await service.receiveRefund(tracking.id, current.refunds[0].id, {
      expectedRevision: current.tracking.revision - 1, receivedProductCents: 8_000, receivedChinaCents: 1_000,
      destination: "hubbuy", accountId, receivedProductCnyMinor: 10_000, receivedChinaCnyMinor: 1_000,
      nativeEvidence: "Crédito efetivamente confirmado no pedido sintético QA-1", confirmed: true,
    });
    expect(replay.refunds[0].id).toBe(current.refunds[0].id);
    expect(await f.db.select().from(hubbuyBalanceEntries).where(eq(hubbuyBalanceEntries.accountId, accountId)).all()).toHaveLength(1);
  });

  it("reverses an untouched credit before correction and void, without deleting ledger history", async () => {
    const { service, tracking, detail } = await paidTracking();
    const accountId = await activeAccount();
    let current = await requestOne(service, tracking.id, detail);
    const refundId = current.refunds[0].id;
    current = await service.receiveRefund(tracking.id, refundId, {
      expectedRevision: current.tracking.revision, receivedProductCents: 8_000, receivedChinaCents: 1_000,
      destination: "hubbuy", accountId, receivedProductCnyMinor: 10_000, receivedChinaCnyMinor: 1_000,
      nativeEvidence: "Crédito efetivamente confirmado no pedido sintético QA-2", confirmed: true,
    });
    current = await service.correctRefundReceipt(tracking.id, refundId, {
      expectedRevision: current.tracking.revision, receivedProductCents: 8_000, receivedChinaCents: 1_000,
      destination: "hubbuy", accountId, receivedProductCnyMinor: 12_000, receivedChinaCnyMinor: 1_000,
      nativeEvidence: "Correção conferida no comprovante sintético QA-2", reason: "CNY originalmente digitado incorretamente", confirmed: true,
    });
    expect(await f.db.select().from(hubbuyBalanceEntries).where(eq(hubbuyBalanceEntries.accountId, accountId)).all()).toHaveLength(3);
    expect(await f.db.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, accountId)).get()).toMatchObject({ balanceCnyMinor: 13_000 });
    current = await service.voidRefund(tracking.id, refundId, { expectedRevision: current.tracking.revision, reason: "Registro sintético inválido", confirmed: true });
    expect(current.refunds[0].status).toBe("voided");
    expect(await f.db.select().from(hubbuyBalanceEntries).where(eq(hubbuyBalanceEntries.accountId, accountId)).all()).toHaveLength(4);
    expect(await f.db.select().from(hubbuyBalanceConsumptions).all()).toHaveLength(2);
    expect(await f.db.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, accountId)).get()).toMatchObject({ balanceCnyMinor: 0 });
  });

  it("keeps external receipts outside the HubBuy ledger", async () => {
    const { service, tracking, detail } = await paidTracking();
    let current = await requestOne(service, tracking.id, detail);
    current = await service.receiveRefund(tracking.id, current.refunds[0].id, {
      expectedRevision: current.tracking.revision, receivedProductCents: 8_000, receivedChinaCents: 1_000,
      destination: "external", confirmed: true,
    });
    expect(current.refunds[0]).toMatchObject({ status: "received", refundDestination: "external", hubbuyAccountId: null, creditOperationId: null });
    expect(await f.db.select().from(hubbuyBalanceEntries).all()).toHaveLength(0);
    expect(await f.db.select().from(purchaseRefundPaymentAllocations).all()).toHaveLength(2);
  });

  it("blocks correction after the credited CNY has funded another recorded order", async () => {
    const { service, tracking, detail } = await paidTracking();
    const accountId = await activeAccount();
    let current = await requestOne(service, tracking.id, detail);
    const refundId = current.refunds[0].id;
    current = await service.receiveRefund(tracking.id, refundId, {
      expectedRevision: current.tracking.revision, receivedProductCents: 8_000, receivedChinaCents: 1_000,
      destination: "hubbuy", accountId, receivedProductCnyMinor: 10_000, receivedChinaCnyMinor: 1_000,
      nativeEvidence: "Crédito efetivamente confirmado no pedido sintético QA-3", confirmed: true,
    });
    const draft = await service.createAdditionalOrder(tracking.id, {
      expectedRevision: current.tracking.revision, idempotencyKey: "refund-credit-use-draft", accountId,
      items: [{ name: "Camiseta", url: "https://shop.test/shirt", platform: "Taobao", visualKey: "apparel", quantity: 1, itemOrder: 0,
        nativeProductState: "known", nativeProductCnyMinor: 11_000, nativeChinaState: "no_charge", nativeChinaCnyMinor: null,
        participants: [{ personId: "bob", weightMode: "equal", weight: 1 }] }],
    });
    current = await service.getTracking(tracking.id);
    await service.recordAdditionalOrderMixedPayment(tracking.id, draft.orderId, { expectedRevision: current.tracking.revision, idempotencyKey: "refund-credit-use-payment", useOwnBalance: true });
    current = await service.getTracking(tracking.id);
    await expect(service.correctRefundReceipt(tracking.id, refundId, {
      expectedRevision: current.tracking.revision, receivedProductCents: 8_000, receivedChinaCents: 1_000,
      destination: "hubbuy", accountId, receivedProductCnyMinor: 9_000, receivedChinaCnyMinor: 1_000,
      nativeEvidence: "Tentativa de correção depois do consumo", reason: "Teste de bloqueio de crédito já utilizado", confirmed: true,
    })).rejects.toMatchObject({ code: "REFUND_CREDIT_ALREADY_USED" });
    expect(await f.db.select().from(hubbuyBalanceConsumptions).all()).toHaveLength(1);
    expect(await f.db.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, accountId)).get()).toMatchObject({ balanceCnyMinor: 0 });
  });

  it("routes a partial refund of an additional balance purchase to the lender up to the open advance", async () => {
    const { service, trackingId, accountId, costItemId } = await paidAdditionalBalanceOrder();
    let current = await requestAdditionalRefund(service, trackingId, costItemId);
    await service.settleAdditionalOrderAdvance(trackingId, {
      expectedRevision: current.tracking.revision, idempotencyKey: "additional-advance-partial-settlement", orderId: current.productOrders.find(order => order.kind === "additional")!.id,
      consumptionId: (await f.db.select().from(hubbuyBalanceConsumptions).all())[0].id, lenderId: "alice", beneficiaryId: "bob",
      amountCnyMinor: 800, settledAmountMinor: 650, settledCurrency: "BRL", occurredOn: "2026-10-16", reason: "Acerto parcial sintético",
    });
    current = await service.getTracking(trackingId);
    current = await service.receiveRefund(trackingId, current.refunds[0].id, {
      expectedRevision: current.tracking.revision, receivedProductCents: 280, receivedChinaCents: 0,
      destination: "hubbuy", accountId, receivedProductCnyMinor: 400, receivedChinaCnyMinor: 0,
      nativeEvidence: "Crédito sintético da devolução parcial adicional", confirmed: true,
    });
    const receiptRows = await f.db.select().from(purchaseRefundPaymentAllocations).all();
    const receipt = receiptRows.filter(row => row.operationId === current.refunds[0].receiptOperationId);
    expect(receipt.map(row => [row.personId, row.cnyMinor, row.historicalBrlCents])).toEqual([["alice", 200, 140], ["bob", 200, 140]]);
    expect(current.productOrders.find(order => order.kind === "additional")!.items[0].financingPositions[0]).toMatchObject({ openCnyMinor: 0, openHistoricalBrlCents: 0, settledCnyMinor: 800, offsetCnyMinor: 200 });
    const credit = (await f.db.select().from(hubbuyBalanceEntries).where(eq(hubbuyBalanceEntries.accountId, accountId)).all()).find(row => row.sourceType === "refund_received");
    expect(credit).toMatchObject({ amountCnyMinor: 400, historicalBrlCents: 280 });
    expect(current.productOrders.find(order => order.kind === "additional")!.items[0].calculation).toMatchObject({ receivedRefundCents: 280, partialCents: 420, shippingQuantity: 0 });
  });

  it("returns a refund to the borrower after the advance was fully settled", async () => {
    const { service, trackingId, accountId, orderId, costItemId } = await paidAdditionalBalanceOrder();
    let current = await requestAdditionalRefund(service, trackingId, costItemId);
    const consumptionId = (await f.db.select().from(hubbuyBalanceConsumptions).all())[0].id;
    await service.settleAdditionalOrderAdvance(trackingId, {
      expectedRevision: current.tracking.revision, idempotencyKey: "additional-advance-full-settlement", orderId, consumptionId,
      lenderId: "alice", beneficiaryId: "bob", amountCnyMinor: 1_000, settledAmountMinor: 700, settledCurrency: "BRL",
      occurredOn: "2026-10-16", reason: "Quitação integral sintética",
    });
    current = await service.getTracking(trackingId);
    current = await service.receiveRefund(trackingId, current.refunds[0].id, {
      expectedRevision: current.tracking.revision, receivedProductCents: 280, receivedChinaCents: 0,
      destination: "hubbuy", accountId, receivedProductCnyMinor: 400, receivedChinaCnyMinor: 0,
      nativeEvidence: "Crédito sintético depois do acerto integral", confirmed: true,
    });
    const receipt = (await f.db.select().from(purchaseRefundPaymentAllocations).all()).filter(row => row.operationId === current.refunds[0].receiptOperationId);
    expect(receipt.map(row => [row.personId, row.cnyMinor, row.historicalBrlCents])).toEqual([["bob", 400, 280]]);
    expect(current.productOrders.find(order => order.kind === "additional")!.items[0].financingPositions[0]).toMatchObject({ openCnyMinor: 0, settledCnyMinor: 1_000, offsetCnyMinor: 0 });
  });
});
