import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { financialOperations, hubbuyAccounts, hubbuyBalanceEntries, hubbuyBalanceCreditShares, hubbuyBalanceConsumptions, purchaseCostOrders } from "@/lib/db/schema";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import { packageCostServices } from "@/lib/domain/package-cost-services";
import { fixture, type Fixture } from "./helpers";

let f: Fixture;
beforeEach(async () => { f = await fixture(); });
afterEach(() => f.client.close());
const input = (revision: number) => ({ expectedRevision: revision, idempotencyKey: crypto.randomUUID(), reason: "Valores informados por engano para tentar excluir o cadastro", confirmedIncorrectRegistration: true as const });
async function incorrect(mode: "remainder" | "chronological", amount = 5000, finalize = true, reference: string | null = null) {
  const service = hubbuyBalanceServices(f.db, "alice");
  const a = await service.createAccount({ workspaceId: "workspace", idempotencyKey: crypto.randomUUID(), label: "Cadastro incorreto QA", confirmZeroBalance: true });
  await f.db.update(hubbuyAccounts).set({ status: "reconciling", reconciledBy: null, reconciledAt: null }).where(eq(hubbuyAccounts.id, a.accountId)).run();
  let revision = 0;
  const shares = amount ? [{ personId: "alice", amountCnyMinor: amount, historicalBrlCents: 4300 }] : [];
  if (mode === "chronological") {
    await service.startReconciliation(a.accountId, { expectedRevision: revision++, idempotencyKey: crypto.randomUUID(), mode });
    if (amount) await service.recordReconciliationEvent(a.accountId, { expectedRevision: revision++, idempotencyKey: crypto.randomUUID(), eventType: "legacy_receipt", description: "Saldo informado por engano", sourceReference: reference, occurredAt: "2026-10-17T12:00:00Z", amountCnyMinor: amount, shares });
  }
  if (finalize) await service.reconcileAccount(a.accountId, { expectedRevision: revision++, idempotencyKey: crypto.randomUUID(), mode, observedBalanceCnyMinor: amount, reason: "Conciliação sintética incorreta", shares, ...(mode === "remainder" ? { priorActivityDescription: "Informado por engano" } : {}) });
  return { accountId: a.accountId, service, revision };
}

describe("discarding only a declared incorrect unused reconciliation", () => {
  it.each(["remainder", "chronological"] as const)("reverses %s credits and rights, retains originals and removes the registration atomically", async mode => {
    const { accountId, service, revision } = await incorrect(mode);
    const originals = await f.db.select().from(hubbuyBalanceEntries).all();
    const originalShares = await f.db.select().from(hubbuyBalanceCreditShares).all();
    expect((await service.listAccounts())[0]).toMatchObject({ canDelete: false, canDiscardIncorrectRegistration: true });
    const command = input(revision), result = await hubbuyBalanceServices(f.db, "bob").discardIncorrectAccount(accountId, command);
    expect(await service.discardIncorrectAccount(accountId, command)).toEqual({ ...result, replayed: true });
    expect(await service.listAccounts()).toEqual([]);
    expect(await f.db.select().from(hubbuyAccounts).get()).toMatchObject({ status: "archived", balanceCnyMinor: 0, deletedBy: "bob", revision: revision + 1 });
    const entries = await f.db.select().from(hubbuyBalanceEntries).orderBy(hubbuyBalanceEntries.sequence).all();
    expect(entries.slice(0, originals.length)).toEqual(originals);
    expect(entries.at(-1)).toMatchObject({ direction: "debit", sourceType: "reversal", reversalOfEntryId: originals[0].id, amountCnyMinor: 5000, historicalBrlCents: 4300 });
    expect(await f.db.select().from(hubbuyBalanceCreditShares).all()).toEqual(originalShares);
    expect(await f.db.select().from(hubbuyBalanceConsumptions).all()).toMatchObject([{ amountCnyMinor: 5000, historicalBrlCents: 4300, paymentAllocationId: null }]);
    expect(await f.db.select().from(financialOperations).where(eq(financialOperations.operationType, "account_registration_discarded")).all()).toHaveLength(1);
    expect((await f.client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
    await expect(service.getAccountBalance(accountId)).rejects.toMatchObject({ status: 404 });
    await expect(service.discardIncorrectAccount(accountId, { ...command, reason: "Outro motivo" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it.each([false, true])("allows an empty started or zero-finalized reconciliation (finalized=%s)", async finalize => {
    const { service, accountId, revision } = await incorrect("chronological", 0, finalize);
    await service.discardIncorrectAccount(accountId, input(revision));
    expect(await f.db.select().from(hubbuyBalanceEntries).all()).toEqual([]);
    expect(await service.listAccounts()).toEqual([]);
  });

  it("requires explicit confirmation, membership and the current revision", async () => {
    const { service, accountId, revision } = await incorrect("remainder"), command = input(revision);
    await expect(service.discardIncorrectAccount(accountId, { ...command, confirmedIncorrectRegistration: false })).rejects.toThrow();
    await expect(service.discardIncorrectAccount(accountId, { ...command, reason: " " })).rejects.toThrow();
    await expect(service.discardIncorrectAccount(accountId, input(999))).rejects.toMatchObject({ code: "ACCOUNT_REVISION_CONFLICT" });
    for (const userId of ["foreign", "outsider"]) await expect(hubbuyBalanceServices(f.db, userId).discardIncorrectAccount(accountId, command)).rejects.toMatchObject({ status: 403 });
    await expect(service.deleteAccount(accountId, { expectedRevision: revision, idempotencyKey: "normal-delete", reason: "Exclusão normal" })).rejects.toMatchObject({ code: "ACCOUNT_HAS_BALANCE" });
  });

  it("refuses any draft order reference, even without balance consumption", async () => {
    const { service, accountId, revision } = await incorrect("remainder");
    const p = await f.alice.savePurchase({ name: "Pedido sintético" });
    await f.alice.saveManualItem({ name: "Produto", url: "https://example.test/qa", quantity: 1, unitPriceCents: 100, personId: "alice" });
    await f.alice.finalizePurchase(p!.id, true);
    const t = await packageCostServices(f.db, "alice").startTracking(p!.id);
    await f.db.insert(purchaseCostOrders).values({ id: crypto.randomUUID(), trackingId: t.id, accountId, kind: "additional", state: "draft", createdBy: "alice", updatedBy: "alice", createdAt: new Date(), updatedAt: new Date() }).run();
    expect((await service.listAccounts())[0].canDiscardIncorrectRegistration).toBe(false);
    await expect(service.discardIncorrectAccount(accountId, input(revision))).rejects.toMatchObject({ code: "ACCOUNT_DISCARD_INELIGIBLE" });
  });

  it("refuses a linked legacy receipt or an account with any synthetic use", async () => {
    const linked = await incorrect("chronological", 5000, true, "refund-reference");
    await expect(linked.service.discardIncorrectAccount(linked.accountId, input(linked.revision))).rejects.toMatchObject({ code: "ACCOUNT_DISCARD_INELIGIBLE" });
    const used = await incorrect("chronological", 5000, false);
    await used.service.recordReconciliationEvent(used.accountId, { expectedRevision: used.revision, idempotencyKey: "use", eventType: "synthetic_use", description: "Uso posterior", occurredAt: "2026-10-17T13:00:00Z", amountCnyMinor: 100, shares: [] });
    await expect(used.service.discardIncorrectAccount(used.accountId, input(used.revision + 1))).rejects.toMatchObject({ code: "ACCOUNT_DISCARD_INELIGIBLE" });
  });

  it("rolls back the operation, reversals and shares if the tombstone cannot be written", async () => {
    const { service, accountId, revision } = await incorrect("remainder");
    const before = await f.db.select().from(hubbuyBalanceEntries).all();
    await f.client.execute("CREATE TRIGGER fail_discard BEFORE UPDATE OF deleted_at ON hubbuy_accounts WHEN NEW.deleted_at IS NOT NULL BEGIN SELECT RAISE(ABORT, 'injected discard failure'); END");
    await expect(service.discardIncorrectAccount(accountId, input(revision))).rejects.toThrow();
    expect(await f.db.select().from(hubbuyBalanceEntries).all()).toEqual(before);
    expect(await f.db.select().from(hubbuyBalanceConsumptions).all()).toEqual([]);
    expect(await f.db.select().from(financialOperations).where(eq(financialOperations.operationType, "account_registration_discarded")).all()).toEqual([]);
    expect(await service.getAccountBalance(accountId)).toMatchObject({ ledgerBalanceCnyMinor: 5000, rights: [{ availableCnyMinor: 5000, availableHistoricalBrlCents: 4300 }] });
  });

  it("does not let an audit marker alone bypass the database deletion guard", async () => {
    const { accountId, revision } = await incorrect("remainder");
    await f.db.insert(financialOperations).values({ id: "fake-discard", workspaceId: "workspace", operationType: "account_registration_discarded", idempotencyKey: "fake-discard", payloadHash: "a".repeat(64), actorId: "alice", reason: "Sem estorno completo", recordedAt: new Date(), contextJson: JSON.stringify({ accountId, accountRevision: revision, confirmedIncorrectRegistration: true }) }).run();
    await expect(f.client.execute({ sql: "UPDATE hubbuy_accounts SET status = 'archived', deleted_at = 100, deleted_by = 'alice', updated_by = 'alice', revision = revision + 1 WHERE id = ?", args: [accountId] })).rejects.toThrow();
  });
});
