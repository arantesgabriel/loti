import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { hubbuyAccounts, hubbuyBalanceConsumptions, hubbuyBalanceCreditShares, hubbuyBalanceEntries, purchaseItems } from "@/lib/db/schema";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import { packageCostServices } from "@/lib/domain/package-cost-services";
import { fixture, type Fixture } from "./helpers";
import { createQcMetricCollector, withQcMetricContext } from "@/lib/qc/metrics";

let f: Fixture;
beforeEach(async () => { f = await fixture(); });
afterEach(() => f.client.close());

async function refundedProduct(actor: "alice" | "foreign" = "alice", quantity = 1) {
  const workspaceId = actor === "alice" ? "workspace" : "other";
  const purchase = await f[actor].savePurchase({ name: "Origem sintética" });
  await f[actor].saveManualItem({ name: "Produto X", variant: "Modelo histórico", url: "https://shop.test/origin", quantity, unitPriceCents: 1425, personId: actor });
  await f[actor].finalizePurchase(purchase!.id, true);
  const service = packageCostServices(f.db, actor);
  const tracking = await service.startTracking(purchase!.id);
  let detail = await service.getTracking(tracking.id);
  detail = await service.saveItemCosts(tracking.id, { expectedRevision: detail.tracking.revision, itemId: detail.items[0].id, effectivePriceState: "known", effectivePriceUnitCents: 1425, chinaFreightState: "no_charge", chinaFreightUnitCents: null });
  detail = await service.saveCharge(tracking.id, detail.productsCharge!.id, { expectedRevision: detail.tracking.revision, chargeType: "products", paymentMethod: "pix" });
  detail = await service.markChargePaid(tracking.id, detail.productsCharge!.id, { expectedRevision: detail.tracking.revision });
  const accounts = hubbuyBalanceServices(f.db, actor);
  const account = await accounts.createAccount({ workspaceId, label: "Conta sintética", idempotencyKey: `origin-account-${actor}`, confirmZeroBalance: true });
  detail = await service.requestRefund(tracking.id, { expectedRevision: detail.tracking.revision, costItemId: detail.items[0].id, quantity: 1, requestedProductCents: 1425, requestedChinaCents: 0, reason: "Cancelamento sintético", packageRemovals: [{ packageId: detail.packages[0].id, quantity: 1 }], unassignedQuantity: 0 });
  const refundId = detail.refunds[0].id;
  detail = await service.receiveRefund(tracking.id, refundId, { expectedRevision: detail.tracking.revision, receivedProductCents: 1425, receivedChinaCents: 0, destination: "hubbuy", accountId: account.accountId, receivedProductCnyMinor: 1898, receivedChinaCnyMinor: 0, nativeEvidence: "Recebimento sintético confirmado", confirmed: true });
  return { service, accounts, account, tracking, detail, refundId };
}

describe("HubBuy remaining product origins", () => {
  it("keeps exhausted refunds visible with exact paid costs and authorized payment destinations", async () => {
    const s = await refundedProduct();
    const draft = await s.service.createAdditionalOrder(s.tracking.id, { expectedRevision: s.detail.tracking.revision, idempotencyKey: "trace-full-draft", accountId: s.account.accountId, items: [{ name: "Cordas históricas", url: "https://shop.test/strings", platform: "Taobao", visualKey: "generic", quantity: 1, itemOrder: 0, nativeProductState: "known", nativeProductCnyMinor: 1898, nativeChinaState: "no_charge", nativeChinaCnyMinor: null, participants: [{ personId: "alice", weightMode: "equal", weight: 1 }] }] });
    const detail = await s.service.getTracking(s.tracking.id);
    await s.service.recordAdditionalOrderMixedPayment(s.tracking.id, draft.orderId, { expectedRevision: detail.tracking.revision, idempotencyKey: "trace-full-payment", useOwnBalance: true });
    const balance = await s.accounts.getAccountBalance(s.account.accountId);
    expect(balance.rights[0].origins).toEqual([]);
    expect(balance.traceability).toMatchObject([{ personId: "alice", availableCnyMinor: 0, origins: [{ label: "Produto X", creditedCnyMinor: 1898, purchaseConsumedCnyMinor: 1898, availableCnyMinor: 0, paidCost: { principalBrlCents: 1425, feeBrlCents: 14, totalBrlCents: 1439, newMoneyBrlCents: 1439 }, receipts: [{ uses: [{ destinations: [{ label: "Cordas históricas", beneficiaryId: "alice", amountCnyMinor: 1898 }] }] }] }] }]);
  });

  it("labels the full item cost for a partial refund without treating its snapshots as cancelled-unit totals", async () => {
    const s = await refundedProduct("alice", 3);
    const balance = await s.accounts.getAccountBalance(s.account.accountId);
    expect(balance.traceability[0].origins[0]).toMatchObject({ creditedCnyMinor: 1898, paidCost: { scope: "item", principalBrlCents: 4275, feeBrlCents: 43, totalBrlCents: 4318 } });
  });
  it("retains residual historical basis and flags an inconsistent exhausted lot for reconciliation", async () => {
    const accounts = hubbuyBalanceServices(f.db, "alice");
    const account = await accounts.createAccount({ workspaceId: "workspace", label: "Saldo divergente sintético", idempotencyKey: "residual-basis-account", confirmZeroBalance: true });
    await f.db.insert(hubbuyBalanceEntries).values([
      { id: "residual-credit", accountId: account.accountId, operationId: account.operationId, sequence: 0, direction: "credit", amountCnyMinor: 1, historicalBrlCents: 1, sourceType: "opening_balance", sourceId: "residual-opening", createdAt: new Date() },
      { id: "residual-debit", accountId: account.accountId, operationId: account.operationId, sequence: 1, direction: "debit", amountCnyMinor: 1, historicalBrlCents: 0, sourceType: "purchase_payment", sourceId: "residual-use", createdAt: new Date() },
    ]).run();
    await f.db.insert(hubbuyBalanceCreditShares).values({ id: "residual-share", creditEntryId: "residual-credit", personId: "alice", allocationOrder: 0, amountCnyMinor: 1, historicalBrlCents: 1 }).run();
    await f.db.insert(hubbuyBalanceConsumptions).values({ id: "residual-consumption", debitEntryId: "residual-debit", creditShareId: "residual-share", allocationOrder: 0, amountCnyMinor: 1, historicalBrlCents: 0, createdAt: new Date() }).run();
    expect(await accounts.getAccountBalance(account.accountId)).toMatchObject({ reconciled: false, ledgerBalanceCnyMinor: 0, rights: [{ availableCnyMinor: 0, availableHistoricalBrlCents: 1, origins: [{ kind: "opening_balance", availableCnyMinor: 0, availableHistoricalBrlCents: 1 }] }] });
  });

  it("reads remaining snapshot values without changing ledger, snapshots or revisions", async () => {
    const s = await refundedProduct();
    const first = await s.accounts.getAccountBalance(s.account.accountId);
    expect(first.rights[0].origins).toMatchObject([{ kind: "refund_product", label: "Produto X", variant: "Modelo histórico", availableCnyMinor: 1898, availableHistoricalBrlCents: 1425, trackingId: s.tracking.id }]);
    const draft = await s.service.createAdditionalOrder(s.tracking.id, { expectedRevision: s.detail.tracking.revision, idempotencyKey: "origin-use-draft", accountId: s.account.accountId, items: [{ name: "Outro produto", url: "https://shop.test/new", platform: "Taobao", visualKey: "generic", quantity: 1, itemOrder: 0, nativeProductState: "known", nativeProductCnyMinor: 1000, nativeChinaState: "no_charge", nativeChinaCnyMinor: null, participants: [{ personId: "alice", weightMode: "equal", weight: 1 }] }] });
    const current = await s.service.getTracking(s.tracking.id);
    await s.service.recordAdditionalOrderMixedPayment(s.tracking.id, draft.orderId, { expectedRevision: current.tracking.revision, idempotencyKey: "origin-use-payment", useOwnBalance: true });
    const before = await Promise.all([f.db.select().from(hubbuyBalanceEntries).all(), f.db.select().from(hubbuyBalanceCreditShares).all(), f.db.select().from(hubbuyBalanceConsumptions).all(), f.db.select().from(purchaseItems).all(), s.service.getTracking(s.tracking.id)]);
    const balance = await s.accounts.getAccountBalance(s.account.accountId);
    expect(balance).toMatchObject({ reconciled: true, ledgerBalanceCnyMinor: 898, rights: [{ personId: "alice", availableCnyMinor: 898, availableHistoricalBrlCents: 674, origins: [{ kind: "refund_product", label: "Produto X", availableCnyMinor: 898, availableHistoricalBrlCents: 674 }] }] });
    expect(balance.rights[0].origins).toHaveLength(1);
    expect(balance.traceability[0].origins[0]).toMatchObject({ creditedCnyMinor: 1898, purchaseConsumedCnyMinor: 1000, availableCnyMinor: 898 });
    expect(await s.accounts.getAccountBalance(s.account.accountId)).toEqual(balance);
    const after = await Promise.all([f.db.select().from(hubbuyBalanceEntries).all(), f.db.select().from(hubbuyBalanceCreditShares).all(), f.db.select().from(hubbuyBalanceConsumptions).all(), f.db.select().from(purchaseItems).all(), s.service.getTracking(s.tracking.id)]);
    expect(after).toEqual(before);
    await expect(hubbuyBalanceServices(f.db, "foreign").getAccountBalance(s.account.accountId)).rejects.toThrow();
    await expect(hubbuyBalanceServices(f.db, "outsider").getAccountBalance(s.account.accountId)).rejects.toThrow();
  });

  it("preserves unknown amounts, isolates accounts/workspaces and resolves references across bounded batches", async () => {
    const own = await refundedProduct();
    const foreign = await refundedProduct("foreign");
    const otherAccount = await own.accounts.createAccount({ workspaceId: "workspace", label: "Outra conta", idempotencyKey: "other-account-origins", confirmZeroBalance: true });
    // Deliberately malformed polymorphic references: these cannot name another account's product.
    const sources = [own.refundId, foreign.refundId, ...Array.from({ length: 402 }, (_, index) => `missing-refund-${index}`)];
    for (let offset = 0; offset < sources.length; offset += 25) {
      const batch = sources.slice(offset, offset + 25);
      await f.db.insert(hubbuyBalanceEntries).values(batch.map((sourceId, index) => ({ id: `unknown-credit-${offset + index}`, accountId: otherAccount.accountId, operationId: otherAccount.operationId, sequence: offset + index, direction: "credit" as const, amountCnyMinor: 1, historicalBrlCents: 1, sourceType: "refund_received" as const, sourceId, createdAt: new Date() }))).run();
      await f.db.insert(hubbuyBalanceCreditShares).values(batch.map((_, index) => ({ id: `unknown-share-${offset + index}`, creditEntryId: `unknown-credit-${offset + index}`, personId: "alice", allocationOrder: 0, amountCnyMinor: 1, historicalBrlCents: 1 }))).run();
    }
    await f.db.update(hubbuyAccounts).set({ balanceCnyMinor: sources.length }).where(eq(hubbuyAccounts.id, otherAccount.accountId)).run();
    // Reuse the driver's opt-in test instrumentation; no SQL/identifiers are logged.
    const metrics = createQcMetricCollector();
    const balance = await withQcMetricContext(metrics, () => own.accounts.getAccountBalance(otherAccount.accountId));
    expect(balance).toMatchObject({ reconciled: true, ledgerBalanceCnyMinor: 404, rights: [{ availableCnyMinor: 404, availableHistoricalBrlCents: 404 }] });
    expect(balance.rights[0].origins).toHaveLength(404);
    expect(balance.traceability[0].origins).toHaveLength(404);
    expect(balance.traceability[0].origins.every(origin => origin.kind === "unknown" && origin.paidCost === null && origin.costItemId === null)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(balance.traceability))).toBeLessThan(500_000);
    expect(metrics.snapshot().counters.dbCalls).toBeLessThanOrEqual(20);
    expect(balance.rights[0].origins.every(origin => origin.kind === "unknown" && origin.label === "Origem não identificada" && origin.trackingId === null && origin.costItemId === null)).toBe(true);
    // A valid reference in the second SQL batch is still found; no IN parameter limit is exceeded.
    const { readRefundProductOrigins } = await import("@/lib/domain/hubbuy-rights-reading");
    const resolved = await f.db.transaction(tx => readRefundProductOrigins(tx, { id: own.account.accountId, workspaceId: "workspace" }, [...sources.slice(2), own.refundId, foreign.refundId]));
    expect(resolved).toMatchObject([{ refundId: own.refundId, name: "Produto X", trackingId: own.tracking.id }]);
    expect(resolved).toHaveLength(1);
  });
});
