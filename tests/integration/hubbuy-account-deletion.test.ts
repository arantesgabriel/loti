import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { financialOperations, hubbuyAccounts, purchaseCostOrders, purchasePackages } from "@/lib/db/schema";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import { packageCostServices } from "@/lib/domain/package-cost-services";
import { fixture, type Fixture } from "./helpers";

let f: Fixture;
beforeEach(async () => { f = await fixture(); });
afterEach(() => f.client.close());
const deletion = (revision = 0) => ({ expectedRevision: revision, idempotencyKey: crypto.randomUUID(), reason: "Cadastro sintético criado por engano" });
async function account() {
  const input = { workspaceId: "workspace", idempotencyKey: crypto.randomUUID(), label: "Conta QA", confirmZeroBalance: true as const };
  return { ...await hubbuyBalanceServices(f.db, "alice").createAccount(input), input };
}
async function tracking() {
  const p = await f.alice.savePurchase({ name: "Exclusão QA" });
  await f.alice.saveManualItem({ name: "SSD", url: "https://example.test/ssd", quantity: 1, unitPriceCents: 1000, personId: "alice" });
  await f.alice.finalizePurchase(p!.id, true);
  const costs = packageCostServices(f.db, "alice");
  const t = await costs.startTracking(p!.id);
  let d = await costs.getTracking(t.id);
  d = await costs.saveItemCosts(t.id, { expectedRevision: d.tracking.revision, itemId: d.items[0].id, effectivePriceState: "known", effectivePriceUnitCents: 1000, chinaFreightState: "no_charge", chinaFreightUnitCents: null });
  d = await costs.saveCharge(t.id, d.productsCharge!.id, { expectedRevision: d.tracking.revision, chargeType: "products", paymentMethod: "pix" });
  d = await costs.markChargePaid(t.id, d.productsCharge!.id, { expectedRevision: d.tracking.revision });
  return { costs, t, d };
}
async function history(accountId: string, operationType = "prior_use") {
  await f.db.insert(financialOperations).values({ id: crypto.randomUUID(), workspaceId: "workspace", operationType, idempotencyKey: crypto.randomUUID(), payloadHash: "a".repeat(64), actorId: "alice", recordedAt: new Date(), contextJson: JSON.stringify({ before: { accountId } }) }).run();
}

describe("HubBuy unused-account deletion", () => {
  it("lets another workspace member delete an unused account, retaining audit and replay without resurrection", async () => {
    const a = await account(), service = hubbuyBalanceServices(f.db, "bob"), input = deletion();
    expect((await service.listAccounts())[0]).toMatchObject({ canDelete: true, deletionBlockCode: null, deletedAt: null, deletedBy: null });
    const result = await service.deleteAccount(a.accountId, input);
    expect(await service.deleteAccount(a.accountId, input)).toEqual({ ...result, replayed: true });
    expect(await service.listAccounts()).toEqual([]);
    const retained = await f.db.select().from(hubbuyAccounts).get();
    expect(retained).toMatchObject({ id: a.accountId, status: "archived", deletedBy: "bob", revision: 1 });
    expect(retained!.deletedAt).toBeInstanceOf(Date);
    expect(await f.db.select().from(financialOperations).all()).toHaveLength(2);
    await expect(service.getAccountBalance(a.accountId)).rejects.toMatchObject({ status: 404 });
    await expect(service.readStatement(a.accountId)).rejects.toMatchObject({ status: 404 });
    await expect(service.deleteAccount(a.accountId, deletion(1))).rejects.toMatchObject({ code: "ACCOUNT_DELETED" });
    await expect(service.deleteAccount(a.accountId, { ...input, reason: "Outro motivo" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(hubbuyBalanceServices(f.db, "alice").createAccount(a.input)).rejects.toMatchObject({ status: 404 });
    await expect(f.client.execute({ sql: "DELETE FROM hubbuy_accounts WHERE id = ?", args: [a.accountId] })).rejects.toThrow(/retained for audit/);
    await expect(f.client.execute({ sql: "UPDATE hubbuy_accounts SET deleted_at = NULL, deleted_by = NULL WHERE id = ?", args: [a.accountId] })).rejects.toThrow(/immutable/);
  });

  it("requires membership before a replay, a current revision and a valid reason", async () => {
    const a = await account(), service = hubbuyBalanceServices(f.db, "alice"), input = deletion();
    await expect(service.deleteAccount(a.accountId, deletion(99))).rejects.toMatchObject({ code: "ACCOUNT_REVISION_CONFLICT" });
    await expect(service.deleteAccount(a.accountId, { ...input, reason: " " })).rejects.toThrow();
    for (const userId of ["outsider", "foreign"]) await expect(hubbuyBalanceServices(f.db, userId).deleteAccount(a.accountId, input)).rejects.toMatchObject({ status: 403 });
    await service.deleteAccount(a.accountId, input);
    await expect(hubbuyBalanceServices(f.db, "foreign").deleteAccount(a.accountId, input)).rejects.toMatchObject({ status: 403 });
    await expect(service.activateEmptyAccountAtZero(a.accountId, { expectedRevision: 1, idempotencyKey: "late-activate", confirmedNoPriorBalance: true })).rejects.toMatchObject({ status: 404 });
    await expect(service.archiveAccount(a.accountId, deletion(1))).rejects.toMatchObject({ status: 404 });
    await expect(service.startReconciliation(a.accountId, { expectedRevision: 1, idempotencyKey: "late-start", mode: "chronological" })).rejects.toMatchObject({ status: 404 });
  });

  it.each(["reconciling", "archived"] as const)("deletes an unused %s account without creating reconciliation or money", async status => {
    const a = await account(), service = hubbuyBalanceServices(f.db, "alice");
    if (status === "archived") await service.archiveAccount(a.accountId, deletion());
    else await f.db.update(hubbuyAccounts).set({ status }).where(eq(hubbuyAccounts.id, a.accountId)).run();
    await service.deleteAccount(a.accountId, deletion(status === "archived" ? 1 : 0));
    expect((await f.client.execute("SELECT count(*) AS n FROM hubbuy_balance_entries")).rows[0].n).toBe(0);
  });

  it("blocks started reconciliation even when no ledger entry exists", async () => {
    const a = await account(), service = hubbuyBalanceServices(f.db, "alice");
    await f.db.update(hubbuyAccounts).set({ status: "reconciling" }).where(eq(hubbuyAccounts.id, a.accountId)).run();
    await service.startReconciliation(a.accountId, { expectedRevision: 0, idempotencyKey: "start", mode: "chronological" });
    expect((await service.listAccounts())[0]).toMatchObject({ canDelete: false, deletionBlockCode: "ACCOUNT_HAS_RECONCILIATION" });
    await expect(service.deleteAccount(a.accountId, deletion(1))).rejects.toMatchObject({ code: "ACCOUNT_HAS_RECONCILIATION" });
  });

  it("blocks an active account with a reconciled positive balance", async () => {
    const a = await account(), service = hubbuyBalanceServices(f.db, "alice");
    await f.db.update(hubbuyAccounts).set({ status: "reconciling" }).where(eq(hubbuyAccounts.id, a.accountId)).run();
    await service.reconcileAccount(a.accountId, { expectedRevision: 0, idempotencyKey: "opening", mode: "remainder", observedBalanceCnyMinor: 100, reason: "Saldo anterior conferido", priorActivityDescription: "Histórico já conferido", shares: [{ personId: "alice", amountCnyMinor: 100, historicalBrlCents: 70 }] });
    expect((await service.listAccounts())[0]).toMatchObject({ canDelete: false, deletionBlockCode: "ACCOUNT_HAS_BALANCE" });
    await expect(service.deleteAccount(a.accountId, deletion(1))).rejects.toMatchObject({ code: "ACCOUNT_HAS_BALANCE" });
  });

  it("blocks a ledger with zero net balance, and a nonzero balance", async () => {
    const a = await account(), service = hubbuyBalanceServices(f.db, "alice");
    await f.db.update(hubbuyAccounts).set({ status: "reconciling" }).where(eq(hubbuyAccounts.id, a.accountId)).run();
    await service.startReconciliation(a.accountId, { expectedRevision: 0, idempotencyKey: "start", mode: "chronological" });
    await service.recordReconciliationEvent(a.accountId, { expectedRevision: 1, idempotencyKey: "credit", eventType: "legacy_receipt", description: "Recebimento sintético", occurredAt: "2026-10-01T12:00:00Z", amountCnyMinor: 100, shares: [{ personId: "alice", amountCnyMinor: 100, historicalBrlCents: 70 }] });
    await expect(service.deleteAccount(a.accountId, deletion(2))).rejects.toMatchObject({ code: "ACCOUNT_HAS_LEDGER" });
    await service.recordReconciliationEvent(a.accountId, { expectedRevision: 2, idempotencyKey: "debit", eventType: "synthetic_use", description: "Uso sintético", occurredAt: "2026-10-02T12:00:00Z", amountCnyMinor: 100, shares: [] });
    expect((await service.listAccounts())[0]).toMatchObject({ balanceCnyMinor: 0, canDelete: false, deletionBlockCode: "ACCOUNT_HAS_LEDGER" });
    await expect(service.deleteAccount(a.accountId, deletion(3))).rejects.toMatchObject({ code: "ACCOUNT_HAS_LEDGER" });
  });

  it("retains draft and voided order references, package links and nested audit history", async () => {
    const a = await account(), service = hubbuyBalanceServices(f.db, "alice");
    const { t, d } = await tracking();
    await f.db.update(purchasePackages).set({ accountId: a.accountId }).where(eq(purchasePackages.id, d.packages[0].id)).run();
    await expect(service.deleteAccount(a.accountId, deletion())).rejects.toMatchObject({ code: "ACCOUNT_HAS_REFERENCES" });
    await f.db.update(purchasePackages).set({ accountId: null }).where(eq(purchasePackages.id, d.packages[0].id)).run();
    const orderId = crypto.randomUUID();
    await f.db.insert(purchaseCostOrders).values({ id: orderId, trackingId: t.id, kind: "additional", accountId: a.accountId, state: "draft", createdBy: "alice", updatedBy: "alice", createdAt: new Date(), updatedAt: new Date() }).run();
    await expect(service.deleteAccount(a.accountId, deletion())).rejects.toMatchObject({ code: "ACCOUNT_HAS_REFERENCES" });
    await f.db.update(purchaseCostOrders).set({ state: "voided" }).where(eq(purchaseCostOrders.id, orderId)).run();
    await expect(service.deleteAccount(a.accountId, deletion())).rejects.toMatchObject({ code: "ACCOUNT_HAS_REFERENCES" });
    await f.db.delete(purchaseCostOrders).where(eq(purchaseCostOrders.id, orderId)).run();
    await history(a.accountId);
    expect((await service.listAccounts())[0]).toMatchObject({ canDelete: false, deletionBlockCode: "ACCOUNT_HAS_HISTORY" });
    await expect(service.deleteAccount(a.accountId, deletion())).rejects.toMatchObject({ code: "ACCOUNT_HAS_HISTORY" });
  });

  it("blocks a zero-CNY refund receipt with no ledger, preserving original payment", async () => {
    const a = await account(), service = hubbuyBalanceServices(f.db, "alice");
    const { t, d, costs } = await tracking();
    const requested = await costs.requestRefund(t.id, { expectedRevision: d.tracking.revision, costItemId: d.items[0].id, quantity: 1, requestedProductCents: 1000, requestedChinaCents: 0, reason: "Cancelamento QA", packageRemovals: [{ packageId: d.packages[0].id, quantity: 1 }], unassignedQuantity: 0 });
    const received = await costs.receiveRefund(t.id, requested.refunds[0].id, { expectedRevision: requested.tracking.revision, receivedProductCents: 0, receivedChinaCents: 0, confirmed: true, destination: "hubbuy", accountId: a.accountId, receivedProductCnyMinor: 0, receivedChinaCnyMinor: 0, nativeEvidence: "Encerrado sem crédito" });
    expect(received.productsCharge).toEqual(d.productsCharge);
    expect((await service.getAccountBalance(a.accountId)).ledgerBalanceCnyMinor).toBe(0);
    await expect(service.deleteAccount(a.accountId, deletion())).rejects.toMatchObject({ code: "ACCOUNT_HAS_REFERENCES" });
  });

  it("rolls back the tombstone if auditing fails", async () => {
    const a = await account(), service = hubbuyBalanceServices(f.db, "alice");
    await f.client.execute("CREATE TRIGGER fail_account_delete_audit BEFORE INSERT ON financial_operations WHEN NEW.operation_type = 'account_deleted' BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
    await expect(service.deleteAccount(a.accountId, deletion())).rejects.toThrow();
    expect((await service.listAccounts())[0]).toMatchObject({ id: a.accountId, revision: 0, canDelete: true, deletedAt: null });
    expect(await f.db.select().from(financialOperations).all()).toHaveLength(1);
  });

  it("hides deleted accounts from cost reads and guards every reference at the database boundary", async () => {
    const a = await account(), service = hubbuyBalanceServices(f.db, "alice"), { costs, t } = await tracking();
    await service.deleteAccount(a.accountId, deletion());
    expect((await costs.getTracking(t.id)).hubbuyAccounts).toEqual([]);
    for (const [table, column] of [["hubbuy_balance_entries", "account_id"], ["hubbuy_reconciliation_runs", "account_id"], ["hubbuy_reconciliation_events", "account_id"], ["purchase_cost_orders", "account_id"], ["purchase_packages", "account_id"], ["purchase_payment_components", "source_account_id"], ["purchase_cost_refunds", "hubbuy_account_id"]]) {
      await expect(f.client.execute({ sql: `INSERT INTO ${table} (${column}) VALUES (?)`, args: [a.accountId] })).rejects.toThrow(/account is deleted/);
    }
    await expect(history(a.accountId)).rejects.toThrow();
    await expect(f.client.execute({ sql: "INSERT INTO purchase_cost_refund_events (details_json) VALUES (?)", args: [JSON.stringify({ before: { accountId: a.accountId } })] })).rejects.toThrow(/account is deleted/);
    expect((await f.client.execute("PRAGMA foreign_key_check")).rows).toHaveLength(0);
  });
});
