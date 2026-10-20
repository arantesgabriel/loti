import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { financialOperations, hubbuyAccounts, hubbuyBalanceCreditShares, hubbuyBalanceEntries, hubbuyReconciliationEvents, hubbuyReconciliationRuns } from "@/lib/db/schema";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import { fixture, type Fixture } from "./helpers";

let f: Fixture;
beforeEach(async () => { f = await fixture(); });
afterEach(() => f.client.close());

describe("HubBuy account ledger foundation", () => {
  it("creates a reconciling account idempotently and enforces workspace access", async () => {
    const service = hubbuyBalanceServices(f.db, "alice");
    const input = { workspaceId: "workspace", idempotencyKey: "account-create-1", label: "Conta do grupo", email: "hub@group.test", confirmZeroBalance: true as const };
    const first = await service.createAccount(input);
    const replay = await service.createAccount(input);

    expect(first).toMatchObject({ replayed: false });
    expect(replay).toMatchObject({ accountId: first.accountId, operationId: first.operationId, replayed: true });
    expect(await f.db.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, first.accountId)).get()).toMatchObject({ status: "active", balanceCnyMinor: 0, revision: 0 });
    expect(await f.db.select().from(hubbuyBalanceEntries).where(eq(hubbuyBalanceEntries.accountId, first.accountId)).all()).toHaveLength(0);
    expect(await f.db.select().from(financialOperations).where(eq(financialOperations.id, first.operationId)).get()).toMatchObject({ operationType: "account_created", actorId: "alice", reason: "Saldo inicial conhecido em ¥0" });
    await expect(service.createAccount({ ...input, label: "Conta diferente" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(hubbuyBalanceServices(f.db, "outsider").createAccount(input)).rejects.toThrow();
    await expect(hubbuyBalanceServices(f.db, "foreign").createAccount(input)).rejects.toThrow();
  });

  it("activates only a reconciled balance whose individual rights and historical bases close", async () => {
    const service = hubbuyBalanceServices(f.db, "alice");
    const account = await service.createAccount({ workspaceId: "workspace", idempotencyKey: "account-create-2", label: "Conta HubBuy", confirmZeroBalance: true });
    await f.db.update(hubbuyAccounts).set({ status: "reconciling", reconciledBy: null, reconciledAt: null }).where(eq(hubbuyAccounts.id, account.accountId)).run();
    const input = {
      expectedRevision: 0, idempotencyKey: "account-reconcile-2", observedBalanceCnyMinor: 35_000,
      occurredAt: new Date("2026-09-10T12:00:00Z"), reason: "Conferência inicial sintética",
      shares: [
        { personId: "alice", amountCnyMinor: 21_000, historicalBrlCents: 14_700 },
        { personId: "bob", amountCnyMinor: 14_000, historicalBrlCents: 9_800 },
      ],
    };
    await expect(service.reconcileAccount(account.accountId, { ...input, shares: [input.shares[0]] })).rejects.toMatchObject({ code: "BALANCE_SHARES_MISMATCH" });
    const reconciled = await service.reconcileAccount(account.accountId, input);
    const replay = await service.reconcileAccount(account.accountId, input);
    const balance = await service.getAccountBalance(account.accountId);
    const statement = await service.readStatement(account.accountId);

    expect(reconciled).toMatchObject({ replayed: false, account: { status: "active", balanceCnyMinor: 35_000, revision: 1 } });
    expect(replay).toMatchObject({ replayed: true, accountId: account.accountId, operationId: reconciled.operationId });
    expect(balance).toMatchObject({ ledgerBalanceCnyMinor: 35_000, reconciled: true, rights: [
      { personId: "alice", availableCnyMinor: 21_000, availableHistoricalBrlCents: 14_700, origins: [{ kind: "opening_balance", label: "Saldo inicial conciliado", availableCnyMinor: 21_000, availableHistoricalBrlCents: 14_700, trackingId: null }] },
      { personId: "bob", availableCnyMinor: 14_000, availableHistoricalBrlCents: 9_800 },
    ] });
    expect(statement.entries).toHaveLength(1);
    expect(statement.entries[0]).toMatchObject({ direction: "credit", sourceType: "opening_balance", amountCnyMinor: 35_000, historicalBrlCents: 24_500 });
    const entryId = statement.entries[0].id;
    expect(await f.db.select().from(hubbuyBalanceCreditShares).where(eq(hubbuyBalanceCreditShares.creditEntryId, entryId)).all()).toHaveLength(2);
    await expect(f.db.update(hubbuyBalanceEntries).set({ amountCnyMinor: 1 }).where(eq(hubbuyBalanceEntries.id, entryId)).run()).rejects.toThrow();
    await expect(f.db.delete(hubbuyBalanceEntries).where(eq(hubbuyBalanceEntries.id, entryId)).run()).rejects.toThrow();
  });

  it("reconstructs legacy receipts and later uses chronologically before activation", async () => {
    const service = hubbuyBalanceServices(f.db, "alice");
    const account = await service.createAccount({ workspaceId: "workspace", idempotencyKey: "account-chronological", label: "Conta reconstruída", confirmZeroBalance: true });
    await f.db.update(hubbuyAccounts).set({ status: "reconciling", reconciledBy: null, reconciledAt: null }).where(eq(hubbuyAccounts.id, account.accountId)).run();
    const started = await service.startReconciliation(account.accountId, { expectedRevision: 0, idempotencyKey: "chronological-start", mode: "chronological" });
    expect(started).toMatchObject({ replayed: false, accountRevision: 1 });
    await expect(service.reconcileAccount(account.accountId, {
      expectedRevision: 1, idempotencyKey: "wrong-remainder", observedBalanceCnyMinor: 0, mode: "remainder",
      reason: "Tentativa de trocar o modo", shares: [],
    })).rejects.toMatchObject({ code: "RECONCILIATION_MODE_LOCKED" });

    await service.recordReconciliationEvent(account.accountId, {
      expectedRevision: 1, idempotencyKey: "legacy-refund-received", eventType: "legacy_receipt", sourceReference: "refund-old-42",
      description: "Refund antigo efetivamente recebido", occurredAt: new Date("2026-09-01T12:00:00Z"), amountCnyMinor: 10_000,
      shares: [
        { personId: "alice", amountCnyMinor: 6_000, historicalBrlCents: 4_200 },
        { personId: "bob", amountCnyMinor: 4_000, historicalBrlCents: 2_800 },
      ],
    });
    await service.recordReconciliationEvent(account.accountId, {
      expectedRevision: 2, idempotencyKey: "legacy-account-use", eventType: "synthetic_use",
      description: "Pedido pago antes do Loti", occurredAt: new Date("2026-09-08T12:00:00Z"), amountCnyMinor: 3_000, shares: [],
    });
    const reconstructed = await service.getAccountBalance(account.accountId);
    expect(reconstructed).toMatchObject({ ledgerBalanceCnyMinor: 7_000, reconciled: false, rights: [
      { personId: "alice", availableCnyMinor: 3_000, availableHistoricalBrlCents: 2_100, origins: [{ kind: "reconciliation", label: "Crédito de conciliação", availableCnyMinor: 3_000, availableHistoricalBrlCents: 2_100, trackingId: null }] },
      { personId: "bob", availableCnyMinor: 4_000, availableHistoricalBrlCents: 2_800 },
    ], reconciliation: { mode: "chronological", events: [
      { eventType: "legacy_receipt", sourceReference: "refund-old-42", amountCnyMinor: 10_000 },
      { eventType: "synthetic_use", amountCnyMinor: 3_000 },
    ] } });
    const events = await f.db.select().from(hubbuyReconciliationEvents).all();
    await expect(f.db.update(hubbuyReconciliationEvents).set({ description: "alterado" }).where(eq(hubbuyReconciliationEvents.id, events[0]!.id)).run()).rejects.toThrow();
    await expect(f.db.delete(hubbuyReconciliationEvents).where(eq(hubbuyReconciliationEvents.id, events[0]!.id)).run()).rejects.toThrow();
    await expect(f.db.update(hubbuyReconciliationRuns).set({ mode: "remainder" }).where(eq(hubbuyReconciliationRuns.accountId, account.accountId)).run()).rejects.toThrow();
    await expect(service.recordReconciliationEvent(account.accountId, {
      expectedRevision: 3, idempotencyKey: "out-of-order-use", eventType: "synthetic_use", description: "Evento fora de ordem",
      occurredAt: new Date("2026-09-07T12:00:00Z"), amountCnyMinor: 100, shares: [],
    })).rejects.toMatchObject({ code: "RECONCILIATION_EVENT_ORDER" });

    const activated = await service.reconcileAccount(account.accountId, {
      expectedRevision: 3, idempotencyKey: "chronological-activate", observedBalanceCnyMinor: 7_000, mode: "chronological",
      reason: "Saldo final conferido na conta compartilhada", shares: [
        { personId: "alice", amountCnyMinor: 3_000, historicalBrlCents: 2_100 },
        { personId: "bob", amountCnyMinor: 4_000, historicalBrlCents: 2_800 },
      ],
    });
    expect(activated).toMatchObject({ replayed: false, mode: "chronological", account: { status: "active", balanceCnyMinor: 7_000, revision: 4 } });
    const statement = await service.readStatement(account.accountId);
    expect(statement.entries.map(entry => [entry.sequence, entry.direction, entry.amountCnyMinor, entry.occurredAt?.toISOString()])).toEqual([
      [0, "credit", 10_000, "2026-09-01T12:00:00.000Z"],
      [1, "debit", 3_000, "2026-09-08T12:00:00.000Z"],
    ]);
  });

  it("opens only the documented remainder once and records the covered prior activity", async () => {
    const service = hubbuyBalanceServices(f.db, "alice");
    const account = await service.createAccount({ workspaceId: "workspace", idempotencyKey: "account-remainder", label: "Saldo remanescente", confirmZeroBalance: true });
    await f.db.update(hubbuyAccounts).set({ status: "reconciling", reconciledBy: null, reconciledAt: null }).where(eq(hubbuyAccounts.id, account.accountId)).run();
    const reconciled = await service.reconcileAccount(account.accountId, {
      expectedRevision: 0, idempotencyKey: "remainder-activate", observedBalanceCnyMinor: 5_000,
      priorActivityDescription: "Recebimentos e usos anteriores conferidos fora do ledger", priorActivityOccurredAt: new Date("2026-09-30T12:00:00Z"),
      reason: "Saldo remanescente de encerramento", shares: [{ personId: "alice", amountCnyMinor: 3_000, historicalBrlCents: 2_100 }, { personId: "bob", amountCnyMinor: 2_000, historicalBrlCents: 1_400 }],
    });
    expect(reconciled).toMatchObject({ mode: "remainder", account: { status: "active", balanceCnyMinor: 5_000 } });
    expect((await service.getAccountBalance(account.accountId)).reconciliation).toMatchObject({
      mode: "remainder", priorActivityDescription: "Recebimentos e usos anteriores conferidos fora do ledger", priorActivityOccurredAt: new Date("2026-09-30T12:00:00Z"), events: [],
    });
    expect((await service.readStatement(account.accountId)).entries).toMatchObject([{ direction: "credit", sourceType: "opening_balance", amountCnyMinor: 5_000 }]);
  });

  it("allows a reconciled zero-balance account to be archived and rejects stale revisions", async () => {
    const service = hubbuyBalanceServices(f.db, "alice");
    const account = await service.createAccount({ workspaceId: "workspace", idempotencyKey: "account-create-zero", label: "Conta vazia", confirmZeroBalance: true });
    await expect(service.archiveAccount(account.accountId, { expectedRevision: 1, idempotencyKey: "wrong-revision", reason: "Conta fechada pelo grupo" })).rejects.toThrow(/mudou/);
    await service.archiveAccount(account.accountId, { expectedRevision: 0, idempotencyKey: "archive-zero", reason: "Conta fechada pelo grupo" });
    expect(await f.db.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, account.accountId)).get()).toMatchObject({ status: "archived", balanceCnyMinor: 0, revision: 1 });
  });

  it("activates only an explicitly confirmed empty legacy account, idempotently", async () => {
    const service = hubbuyBalanceServices(f.db, "alice");
    const account = await service.createAccount({ workspaceId: "workspace", idempotencyKey: "legacy-zero-create", label: "Conta legada vazia", confirmZeroBalance: true });
    await f.db.update(hubbuyAccounts).set({ status: "reconciling", reconciledBy: null, reconciledAt: null }).where(eq(hubbuyAccounts.id, account.accountId)).run();
    expect(await service.listAccounts("workspace")).toMatchObject([{ id: account.accountId, status: "reconciling", canActivateWithZero: true }]);
    const input = { expectedRevision: 0, idempotencyKey: "legacy-zero-activate", confirmedNoPriorBalance: true as const };
    const activated = await service.activateEmptyAccountAtZero(account.accountId, input);
    const replay = await service.activateEmptyAccountAtZero(account.accountId, input);
    expect(activated).toMatchObject({ replayed: false, account: { status: "active", balanceCnyMinor: 0, revision: 1 }, ledgerBalanceCnyMinor: 0, rights: [] });
    expect(replay).toMatchObject({ replayed: true, operationId: activated.operationId });
    expect(await f.db.select().from(hubbuyBalanceEntries).where(eq(hubbuyBalanceEntries.accountId, account.accountId)).all()).toHaveLength(0);
    expect(await f.db.select().from(financialOperations).where(eq(financialOperations.operationType, "account_empty_activated_zero")).all()).toHaveLength(1);
  });

  it("does not offer or activate a legacy account that already has reconciliation history", async () => {
    const service = hubbuyBalanceServices(f.db, "alice");
    const account = await service.createAccount({ workspaceId: "workspace", idempotencyKey: "legacy-history-create", label: "Conta legada com histórico", confirmZeroBalance: true });
    await f.db.update(hubbuyAccounts).set({ status: "reconciling", reconciledBy: null, reconciledAt: null }).where(eq(hubbuyAccounts.id, account.accountId)).run();
    await service.startReconciliation(account.accountId, { expectedRevision: 0, idempotencyKey: "legacy-history-start", mode: "chronological" });
    expect(await service.listAccounts("workspace")).toMatchObject([{ id: account.accountId, status: "reconciling", canActivateWithZero: false }]);
    await expect(service.activateEmptyAccountAtZero(account.accountId, { expectedRevision: 1, idempotencyKey: "legacy-history-zero", confirmedNoPriorBalance: true })).rejects.toMatchObject({ code: "ACCOUNT_ZERO_ACTIVATION_INELIGIBLE" });
    expect(await f.db.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, account.accountId)).get()).toMatchObject({ status: "reconciling", revision: 1 });
  });
});
