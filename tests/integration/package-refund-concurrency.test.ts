import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { hubbuyAccounts } from "@/lib/db/schema";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import { packageCostServices } from "@/lib/domain/package-cost-services";
import { fixture, type Fixture } from "./helpers";

let f: Fixture;
const dbUrl = `file:./data/refunds-concurrency-${randomUUID()}.sqlite`;
const execFileAsync = promisify(execFile);

beforeAll(async () => {
  f = await fixture(dbUrl);
});
afterAll(async () => {
  await f.client.close();
});

async function race(action: string, trackingId: string, input: unknown, refundId?: string, packageId?: string, userId = "alice") {
  return racePair(trackingId, { action, input, refundId, packageId, userId }, { action, input, refundId, packageId, userId });
}

async function racePair(trackingId: string, first: { action: string; input: unknown; refundId?: string; packageId?: string; orderId?: string; trackingId?: string; userId?: string }, second: { action: string; input: unknown; refundId?: string; packageId?: string; orderId?: string; trackingId?: string; userId?: string }) {
  const run = async (candidate: typeof first) => {
  const env = {
    ...process.env,
    LOTI_REFUND_DATABASE_URL: dbUrl,
    LOTI_REFUND_TRACKING_ID: candidate.trackingId ?? trackingId,
    LOTI_REFUND_USER_ID: candidate.userId ?? "alice",
    LOTI_REFUND_ACTION: candidate.action,
    LOTI_REFUND_INPUT: JSON.stringify(candidate.input),
    ...(candidate.refundId ? { LOTI_REFUND_ID: candidate.refundId } : {}),
    ...(candidate.packageId ? { LOTI_REFUND_PACKAGE_ID: candidate.packageId } : {}),
    ...(candidate.orderId ? { LOTI_REFUND_ORDER_ID: candidate.orderId } : {}),
  };
    const result = await execFileAsync(process.execPath, ["--import", "tsx", "tests/integration/package-refund-concurrent-worker.ts"], { cwd: process.cwd(), env, timeout: 30_000 });
    return JSON.parse(result.stdout) as { ok: boolean; message?: string; code?: string | null };
  };
  return Promise.all([run(first), run(second)]);
}

async function paidTracking() {
  const purchase = await f.alice.savePurchase({ name: "Refund concurrency" });
  await f.bob.saveManualItem({ name: "SSD", url: "https://example.test/ssd", quantity: 2, unitPriceCents: 10_000, personId: "bob" });
  await f.alice.finalizePurchase(purchase!.id, true);
  const service = packageCostServices(f.db, "alice");
  const tracking = await service.startTracking(purchase!.id);
  let detail = await service.getTracking(tracking.id);
  detail = await service.saveItemCosts(tracking.id, { expectedRevision: detail.tracking.revision, itemId: detail.items[0].id, effectivePriceState: "known", effectivePriceUnitCents: 10_000, chinaFreightState: "known", chinaFreightUnitCents: 0 });
  detail = await service.saveCharge(tracking.id, detail.productsCharge!.id, { expectedRevision: detail.tracking.revision, chargeType: "products", paymentMethod: "pix" });
  detail = await service.markChargePaid(tracking.id, detail.productsCharge!.id, { expectedRevision: detail.tracking.revision });
  return { service, tracking, detail };
}

describe("package refund races across independent processes", () => {
  it("accepts only one request for the same final unit and rejects the stale revision", async () => {
    const { service, tracking, detail } = await paidTracking();
    const item = detail.items[0], pkg = detail.packages[0];
    const input = {
      expectedRevision: detail.tracking.revision, costItemId: item.id, quantity: 2,
      requestedProductCents: 20_000, requestedChinaCents: 0, reason: "Cancelamento concorrente",
      packageRemovals: [{ packageId: pkg.id, quantity: 2 }], unassignedQuantity: 0,
    };
    const results = await race("request", tracking.id, input);
    expect(results.filter(result => result.ok), JSON.stringify(results)).toHaveLength(1);
    expect(results.filter(result => !result.ok)).toHaveLength(1);
    const latest = await service.getTracking(tracking.id);
    expect(latest.refunds).toHaveLength(1);
    expect(latest.refunds[0].events).toHaveLength(1);
    expect(latest.items[0].calculation).toMatchObject({ cancelledQuantity: 2, shippingQuantity: 0, allocatedQuantity: 0 });
  });

  it("returns the same receipt when two independent processes submit the same confirmation", async () => {
    const { service, tracking, detail } = await paidTracking();
    const item = detail.items[0], pkg = detail.packages[0];
    const requested = await service.requestRefund(tracking.id, {
      expectedRevision: detail.tracking.revision, costItemId: item.id, quantity: 1,
      requestedProductCents: 10_000, requestedChinaCents: 0, reason: "Pedido concorrente",
      packageRemovals: [{ packageId: pkg.id, quantity: 1 }], unassignedQuantity: 0,
    });
    const receipt = { expectedRevision: requested.tracking.revision, receivedProductCents: 9_000, receivedChinaCents: 0, confirmed: true as const };
    const results = await race("receive", tracking.id, receipt, requested.refunds[0].id);
    expect(results.filter(result => result.ok), JSON.stringify(results)).toHaveLength(2);
    expect(results.filter(result => !result.ok)).toHaveLength(0);
    const latest = await service.getTracking(tracking.id);
    expect(latest.refunds[0]).toMatchObject({ status: "received", receivedProductCents: 9_000 });
    expect(latest.refunds[0].events.map(event => event.eventType)).toEqual(["requested", "received"]);
    expect(latest.calculation.summary.receivedRefundCents).toBe(9_000);
  });

  it("serializes request against allocation and shipment in separate processes", async () => {
    const { service, tracking, detail } = await paidTracking();
    const item = detail.items[0], pkg = detail.packages[0];
    const request = { expectedRevision: detail.tracking.revision, costItemId: item.id, quantity: 1, requestedProductCents: 10_000, requestedChinaCents: 0, reason: "Race request", packageRemovals: [{ packageId: pkg.id, quantity: 1 }], unassignedQuantity: 0 };
    const allocation = { expectedRevision: detail.tracking.revision, packageId: pkg.id, allocations: [{ costItemId: item.id, quantity: 1 }] };
    const allocationResults = await racePair(tracking.id, { action: "request", input: request }, { action: "allocate", input: allocation });
    expect(allocationResults.filter(result => result.ok)).toHaveLength(1);
    const latest = await service.getTracking(tracking.id);
    expect(latest.items[0].calculation!.allocatedQuantity + latest.items[0].calculation!.cancelledQuantity).toBeLessThanOrEqual(item.original.quantity);
    const sent = await racePair(tracking.id,
      { action: "request", input: { ...request, expectedRevision: latest.tracking.revision, packageRemovals: [{ packageId: latest.packages[0].id, quantity: 1 }] } },
      { action: "ship", packageId: latest.packages[0].id, input: { expectedRevision: latest.tracking.revision, name: latest.packages[0].name, logisticsStatus: "sent" } });
    expect(sent.filter(result => result.ok)).toHaveLength(1);
    const final = await service.getTracking(tracking.id);
    expect(final.items[0].calculation!.allocatedQuantity + final.items[0].calculation!.cancelledQuantity).toBeLessThanOrEqual(item.original.quantity);
    expect(final.packages[0].logisticsStatus).toBe(sent[0].ok ? "preparing" : "sent");
  });

  it("allows only one of a receipt and close attempt, keeping pending requests open", async () => {
    const { service, tracking, detail } = await paidTracking();
    const pkg = detail.packages[0], item = detail.items[0];
    const requested = await service.requestRefund(tracking.id, { expectedRevision: detail.tracking.revision, costItemId: item.id, quantity: 1, requestedProductCents: 10_000, requestedChinaCents: 0, reason: "Receive-close race", packageRemovals: [{ packageId: pkg.id, quantity: 1 }], unassignedQuantity: 0 });
    const refundId = requested.refunds[0].id;
    const receipt = { expectedRevision: requested.tracking.revision, receivedProductCents: 9_000, receivedChinaCents: 0, confirmed: true };
    const close = { expectedRevision: requested.tracking.revision, confirmed: true };
    const results = await racePair(tracking.id, { action: "receive", input: receipt, refundId }, { action: "close", input: close });
    expect(results.filter(result => result.ok), JSON.stringify(results)).toHaveLength(1);
    const latest = await service.getTracking(tracking.id);
    expect(latest.tracking.status).toBe("open");
    expect(latest.refunds[0].status).toBe("received");
  });

  it("allows only correction or void when those actions race on a received record", async () => {
    const { service, tracking, detail } = await paidTracking();
    const pkg = detail.packages[0], item = detail.items[0];
    let current = await service.requestRefund(tracking.id, { expectedRevision: detail.tracking.revision, costItemId: item.id, quantity: 1, requestedProductCents: 10_000, requestedChinaCents: 0, reason: "Correct-void race", packageRemovals: [{ packageId: pkg.id, quantity: 1 }], unassignedQuantity: 0 });
    const refundId = current.refunds[0].id;
    current = await service.receiveRefund(tracking.id, refundId, { expectedRevision: current.tracking.revision, receivedProductCents: 8_000, receivedChinaCents: 0, confirmed: true });
    const correction = { expectedRevision: current.tracking.revision, receivedProductCents: 7_000, receivedChinaCents: 0, reason: "Correção concorrente", confirmed: true };
    const voidInput = { expectedRevision: current.tracking.revision, reason: "Anulação concorrente", confirmed: true };
    const results = await racePair(tracking.id, { action: "correct", input: correction, refundId }, { action: "void", input: voidInput, refundId });
    expect(results.filter(result => result.ok)).toHaveLength(1);
    const latest = await service.getTracking(tracking.id);
    expect(["received", "voided"]).toContain(latest.refunds[0].status);
    expect(latest.calculation.summary.receivedRefundCents).toBe(latest.refunds[0].status === "received" ? 7_000 : 0);
  });

  it("allows only one independent tracking to consume the final shared account balance", async () => {
    const balance = hubbuyBalanceServices(f.db, "alice");
    const account = await balance.createAccount({ workspaceId: "workspace", idempotencyKey: "cross-tracking-account", label: "Saldo compartilhado concorrente", confirmZeroBalance: true });
    await f.db.update(hubbuyAccounts).set({ status: "reconciling", reconciledBy: null, reconciledAt: null }).where(eq(hubbuyAccounts.id, account.accountId)).run();
    await balance.reconcileAccount(account.accountId, { expectedRevision: 0, idempotencyKey: "cross-tracking-account-open", observedBalanceCnyMinor: 1_000, reason: "Saldo sintético de concorrência", shares: [{ personId: "alice", amountCnyMinor: 1_000, historicalBrlCents: 700 }] });
    const packages = packageCostServices(f.db, "alice");
    async function prepareOrder(name: string, suffix: string) {
      const purchase = await f.alice.savePurchase({ name });
      await f.alice.saveManualItem({ name: `${name} original`, url: `https://example.test/${suffix}`, personId: "alice", quantity: 1, unitPriceCents: 100 });
      await f.alice.finalizePurchase(purchase!.id, true);
      const tracking = await packages.startTracking(purchase!.id);
      let detail = await packages.getTracking(tracking.id);
      const draft = await packages.createAdditionalOrder(tracking.id, {
        expectedRevision: detail.tracking.revision, idempotencyKey: `${suffix}-draft`, accountId: account.accountId,
        items: [{ name: `${name} adicional`, url: `https://example.test/${suffix}-additional`, platform: "Taobao", visualKey: "generic", quantity: 1, itemOrder: 0,
          nativeProductState: "known", nativeProductCnyMinor: 1_000, nativeChinaState: "no_charge", nativeChinaCnyMinor: null,
          participants: [{ personId: "alice", weightMode: "equal", weight: 1 }] }],
      });
      detail = await packages.getTracking(tracking.id);
      return { trackingId: tracking.id, orderId: draft.orderId, expectedRevision: detail.tracking.revision };
    }
    const first = await prepareOrder("Tracking concorre A", "shared-balance-a");
    const second = await prepareOrder("Tracking concorre B", "shared-balance-b");
    const payment = (suffix: string, order: typeof first) => ({
      action: "mixed-payment", trackingId: order.trackingId, orderId: order.orderId,
      input: { expectedRevision: order.expectedRevision, idempotencyKey: `${suffix}-payment`, useOwnBalance: true, balanceFunding: [], external: null },
    });
    const results = await racePair(first.trackingId, payment("shared-balance-a", first), payment("shared-balance-b", second));
    expect(results.filter(result => result.ok), JSON.stringify(results)).toHaveLength(1);
    const [firstDetail, secondDetail, currentBalance] = await Promise.all([
      packages.getTracking(first.trackingId), packages.getTracking(second.trackingId), balance.getAccountBalance(account.accountId),
    ]);
    expect([firstDetail, secondDetail].filter(detail => detail.productOrders.some(order => order.kind === "additional" && order.state === "recorded"))).toHaveLength(1);
    expect(currentBalance).toMatchObject({ ledgerBalanceCnyMinor: 0, account: { balanceCnyMinor: 0 } });
    expect(currentBalance.rights).toMatchObject([{ personId: "alice", availableCnyMinor: 0, availableHistoricalBrlCents: 0 }]);
  });
});
