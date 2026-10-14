import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
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

async function racePair(trackingId: string, first: { action: string; input: unknown; refundId?: string; packageId?: string; userId?: string }, second: { action: string; input: unknown; refundId?: string; packageId?: string; userId?: string }) {
  const run = async (candidate: typeof first) => {
  const env = {
    ...process.env,
    LOTI_REFUND_DATABASE_URL: dbUrl,
    LOTI_REFUND_TRACKING_ID: trackingId,
    LOTI_REFUND_USER_ID: candidate.userId ?? "alice",
    LOTI_REFUND_ACTION: candidate.action,
    LOTI_REFUND_INPUT: JSON.stringify(candidate.input),
    ...(candidate.refundId ? { LOTI_REFUND_ID: candidate.refundId } : {}),
    ...(candidate.packageId ? { LOTI_REFUND_PACKAGE_ID: candidate.packageId } : {}),
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

  it("records one receipt when two independent processes submit the same requested refund", async () => {
    const { service, tracking, detail } = await paidTracking();
    const item = detail.items[0], pkg = detail.packages[0];
    const requested = await service.requestRefund(tracking.id, {
      expectedRevision: detail.tracking.revision, costItemId: item.id, quantity: 1,
      requestedProductCents: 10_000, requestedChinaCents: 0, reason: "Pedido concorrente",
      packageRemovals: [{ packageId: pkg.id, quantity: 1 }], unassignedQuantity: 0,
    });
    const receipt = { expectedRevision: requested.tracking.revision, receivedProductCents: 9_000, receivedChinaCents: 0, confirmed: true as const };
    const results = await race("receive", tracking.id, receipt, requested.refunds[0].id);
    expect(results.filter(result => result.ok), JSON.stringify(results)).toHaveLength(1);
    expect(results.filter(result => !result.ok)).toHaveLength(1);
    const latest = await service.getTracking(tracking.id);
    expect(latest.refunds[0]).toMatchObject({ status: "received", receivedProductCents: 9_000 });
    expect(latest.refunds[0].events.map(event => event.eventType)).toEqual(["requested", "received"]);
    expect(latest.calculation.summary.receivedRefundCents).toBe(9_000);
  });

  it("serializes request against allocation and shipment in separate processes", async () => {
    const { service, tracking, detail } = await paidTracking();
    const item = detail.items[0], pkg = detail.packages[0];
    const request = { expectedRevision: detail.tracking.revision, costItemId: item.id, quantity: 1, requestedProductCents: 10_000, requestedChinaCents: 0, reason: "Race request", packageRemovals: [{ packageId: pkg.id, quantity: 1 }], unassignedQuantity: 0 };
    const allocation = { expectedRevision: detail.tracking.revision, allocations: [] };
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
});
