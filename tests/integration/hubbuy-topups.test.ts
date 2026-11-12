import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { fixture, type Fixture } from "./helpers";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import { hubbuyTopupServices, type TopupCommand } from "@/lib/domain/hubbuy-topup-services";
import * as s from "@/lib/db/schema";
import * as t from "@/lib/db/topup-schema";
import { verifyDatabase } from "../../scripts/database-verification";

let f: Fixture;
beforeEach(async () => { f = await fixture(":memory:", "orders"); });
afterEach(() => f.client.close());
async function setup() {
  const { accountId } = await hubbuyBalanceServices(f.db, "alice").createAccount({ workspaceId: "workspace", idempotencyKey: "account", label: "Synthetic", confirmZeroBalance: true });
  return { accountId, service: hubbuyTopupServices(f.db, "alice", "workspace") };
}
const command = (): TopupCommand => ({ expectedRevision: 0, idempotencyKey: "topup", occurredAt: "2026-11-12T10:00:00-03:00", reason: "Synthetic receipt", cnyMinor: 39830, method: "pix", receipt: { mode: "total_with_fee", totalBrlCents: 35242 }, fee: { mode: "percentage", bps: 100 }, funders: [{ personId: "bob", cnyMinor: 39830, principalBrlCents: 34893, feeBrlCents: 349 }], externalReference: "synthetic-receipt-1", confirmedNoReference: false, confirmedReceived: true });

describe("typed topup ledger transactions", () => {
  it("previews without writes, records explicit funder independently of actor and replays stale revision", async () => {
    const { accountId, service } = await setup();
    expect(await service.preview(accountId, command())).toMatchObject({ principalBrlCents: 34893, feeBrlCents: 349, balanceAfterCnyMinor: 39830 });
    expect(await f.db.select().from(t.hubbuyTopups)).toHaveLength(0);
    expect(await f.db.select().from(s.hubbuyBalanceEntries)).toHaveLength(0);
    const result = await service.record(accountId, command());
    expect(result).toMatchObject({ accountRevision: 1, replayed: false });
    expect(await service.record(accountId, command())).toMatchObject({ operationId: result.operationId, replayed: true });
    const balance = await hubbuyBalanceServices(f.db, "alice").getAccountBalance(accountId);
    expect(balance).toMatchObject({ ledgerBalanceCnyMinor: 39830, reconciled: true, rights: [{ personId: "bob", availableCnyMinor: 39830, availableHistoricalBrlCents: 34893 }] });
    expect(await f.db.select().from(s.memberBalanceFinancingEntries)).toHaveLength(0);
    expect(await f.db.select().from(s.hubbuyBalanceEntries)).toMatchObject([{ sourceType: "topup", historicalBrlCents: 34893 }]);
    expect(await verifyDatabase(f.client)).toMatchObject({ status: "ok", foreignKeyViolations: 0 });
    await expect(service.record(accountId, { ...command(), reason: "different" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(service.record(accountId, { ...command(), idempotencyKey: "new" })).rejects.toMatchObject({ code: "BALANCE_REVISION_CONFLICT" });
  });

  it("reverses the registration exactly with append-only compensation", async () => {
    const { accountId, service } = await setup(), original = await service.record(accountId, command());
    const reverse = { expectedRevision: 1, idempotencyKey: "reverse", occurredAt: "2026-11-12T11:00:00-03:00", reason: "Synthetic registration error", topupId: original.topupId, confirmedRegistrationError: true };
    expect(await service.previewReversal(accountId, reverse)).toMatchObject({ balanceAfterCnyMinor: 0, feeBrlCents: 349 });
    expect(await f.db.select().from(s.hubbuyBalanceEntries)).toHaveLength(1);
    const first = await service.reverse(accountId, reverse);
    expect(await service.reverse(accountId, reverse)).toMatchObject({ operationId: first.operationId, replayed: true });
    expect(await hubbuyBalanceServices(f.db, "alice").getAccountBalance(accountId)).toMatchObject({ ledgerBalanceCnyMinor: 0, reconciled: true });
    expect(await f.db.select().from(t.hubbuyTopups)).toHaveLength(1);
    expect(await f.db.select().from(s.hubbuyBalanceEntries)).toHaveLength(2);
    await expect(f.client.execute("DELETE FROM hubbuy_topups")).rejects.toThrow(/append-only/);
    await expect(f.client.execute("UPDATE hubbuy_topup_funders SET fee_brl_cents=0")).rejects.toThrow(/append-only/);
  });

  it("supports fee-only funder and blocks other workspaces even on replay", async () => {
    const { accountId, service } = await setup();
    const input = command(); input.funders = [{ personId: "bob", cnyMinor: 39830, principalBrlCents: 34893, feeBrlCents: 0 }, { personId: "alice", cnyMinor: 0, principalBrlCents: 0, feeBrlCents: 349 }];
    await service.record(accountId, input);
    expect(await f.db.select().from(s.hubbuyBalanceCreditShares)).toHaveLength(1);
    expect(await f.db.select().from(t.hubbuyTopupFunders)).toHaveLength(2);
    await expect(hubbuyTopupServices(f.db, "foreign", "workspace").record(accountId, input)).rejects.toThrow();
    await expect(hubbuyTopupServices(f.db, "alice", "other").record(accountId, input)).rejects.toMatchObject({ code: "WORKSPACE_CONTEXT_CHANGED" });
  });

  it("rejects duplicate references across topups and legacy manual adjustments", async () => {
    const { accountId, service } = await setup();
    await service.record(accountId, command());
    await expect(service.record(accountId, { ...command(), idempotencyKey: "second", expectedRevision: 1 })).rejects.toMatchObject({ code: "FINANCIAL_REFERENCE_DUPLICATE" });
    await expect(hubbuyBalanceServices(f.db, "alice", "workspace").recordManualAdjustment(accountId, { expectedRevision: 1, idempotencyKey: "manual", kind: "promotional_bonus", occurredAt: "2026-11-12T12:00:00Z", reason: "Synthetic", externalReference: "synthetic-receipt-1", amountCnyMinor: 1, shares: [{ personId: "alice", amountCnyMinor: 1 }] })).rejects.toThrow();
    expect(await f.db.select().from(s.hubbuyBalanceEntries)).toHaveLength(1);
  });

  it("rolls back ledger, shares, header, funders and revision after an injected late failure", async () => {
    const { accountId, service } = await setup();
    await f.db.run(sql`CREATE TRIGGER fail_topup_projection BEFORE UPDATE ON hubbuy_accounts WHEN NEW.revision=1 BEGIN SELECT RAISE(ABORT,'injected late failure'); END`);
    await expect(service.record(accountId, command())).rejects.toMatchObject({ cause: expect.objectContaining({ message: expect.stringContaining("injected late failure") }) });
    for (const table of [t.hubbuyTopups, t.hubbuyTopupFunders, s.hubbuyBalanceEntries, s.hubbuyBalanceCreditShares]) expect(await f.db.select().from(table)).toHaveLength(0);
    expect(await f.db.select().from(s.hubbuyAccounts).where(eq(s.hubbuyAccounts.id, accountId))).toMatchObject([{ revision: 0, balanceCnyMinor: 0 }]);
  });

  it("keeps consumption dependencies intact and rejects reversal of used funds", async () => {
    const { accountId, service } = await setup(), original = await service.record(accountId, command());
    await hubbuyBalanceServices(f.db, "alice", "workspace").recordManualAdjustment(accountId, { expectedRevision: 1, idempotencyKey: "consume", kind: "documented_debit", occurredAt: "2026-11-12T12:00:00Z", reason: "Synthetic observed debit", externalReference: null, amountCnyMinor: 1, shares: [{ personId: "bob", amountCnyMinor: 1 }] });
    await expect(service.reverse(accountId, { expectedRevision: 2, idempotencyKey: "reverse", occurredAt: "2026-11-12T12:01:00Z", reason: "Synthetic registration error", topupId: original.topupId, confirmedRegistrationError: true })).rejects.toMatchObject({ code: "TOPUP_HAS_DEPENDENCIES" });
    expect(await f.db.select().from(t.hubbuyTopupReversals)).toHaveLength(0);
  });

  it("records and reverses in an owner-only personal workspace without memberships", async () => {
    const now = new Date();
    await f.db.insert(s.workspaces).values({ id: "personal", name: "Synthetic personal", kind: "personal", ownerUserId: "alice", createdAt: now });
    await f.db.insert(s.userPreferences).values({ userId: "alice", activeWorkspaceId: "personal", favoritesView: "list", createdAt: now, updatedAt: now });
    const { accountId } = await hubbuyBalanceServices(f.db, "alice", "personal").createAccount({ workspaceId: "personal", idempotencyKey: "personal-account", label: "Synthetic personal", confirmZeroBalance: true });
    const service = hubbuyTopupServices(f.db, "alice", "personal"), input = command();
    input.funders[0].personId = "alice";
    const result = await service.record(accountId, input);
    expect(result).toMatchObject({ accountRevision: 1 });
    expect(await f.db.select().from(s.workspaceMembers).where(eq(s.workspaceMembers.workspaceId, "personal"))).toHaveLength(0);
    await expect(service.preview(accountId, { ...input, expectedRevision: 1, idempotencyKey: "foreign-person", externalReference: null, confirmedNoReference: true, funders: [{ ...input.funders[0], personId: "bob" }] })).rejects.toThrow();
    await service.reverse(accountId, { expectedRevision: 1, idempotencyKey: "personal-reverse", occurredAt: "2026-11-12T12:01:00Z", reason: "Synthetic error", topupId: result.topupId, confirmedRegistrationError: true });
    expect(await hubbuyBalanceServices(f.db, "alice").getAccountBalance(accountId)).toMatchObject({ ledgerBalanceCnyMinor: 0, reconciled: true });
  });
});
