import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { hubbuyAccounts } from "@/lib/db/schema";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import { packageCostServices } from "@/lib/domain/package-cost-services";
import { fixture, type Fixture } from "./helpers";

mkdirSync(resolve("data"), { recursive: true });
const dir = mkdtempSync(resolve("data/account-delete-races-"));
const url = `file:${join(dir, "race.sqlite").replaceAll("\\", "/")}`;
const runFile = promisify(execFile);
let f: Fixture;
beforeAll(async () => { f = await fixture(url); });
// On Windows libSQL can retain native file handles until the worker exits.
// Close here; remove this explicitly disposable directory after the runner exits.
afterAll(() => { f.client.close(); });
type Command = { action: string; accountId: string; input?: unknown; trackingId?: string; refundId?: string; packageId?: string };
async function run(command: Command) {
  const result = await runFile(process.execPath, ["--import", "tsx", "tests/integration/hubbuy-account-deletion-worker.ts"], {
    cwd: process.cwd(), timeout: 30_000, env: { ...process.env, LOTI_DELETE_RACE_DATABASE: url, LOTI_DELETE_RACE_COMMAND: JSON.stringify(command) },
  });
  return JSON.parse(result.stdout) as { ok: boolean; message?: string };
}
async function account(legacy = false) {
  const a = await hubbuyBalanceServices(f.db, "alice").createAccount({ workspaceId: "workspace", idempotencyKey: crypto.randomUUID(), label: "Conta corrida", confirmZeroBalance: true });
  if (legacy) await f.db.update(hubbuyAccounts).set({ status: "reconciling" }).where(eq(hubbuyAccounts.id, a.accountId)).run();
  return a.accountId;
}
const remove = (accountId: string): Command => ({ action: "delete", accountId, input: { expectedRevision: 0, idempotencyKey: crypto.randomUUID(), reason: "Exclusão concorrente QA" } });
async function tracking() {
  const p = await f.alice.savePurchase({ name: "Corrida de exclusão" });
  await f.alice.saveManualItem({ name: "Produto", url: "https://example.test/qa", quantity: 1, unitPriceCents: 1000, personId: "alice" });
  await f.alice.finalizePurchase(p!.id, true);
  const service = packageCostServices(f.db, "alice"), t = await service.startTracking(p!.id);
  return { service, t, d: await service.getTracking(t.id) };
}
function oneWinner(results: { ok: boolean }[]) { expect(results.filter(r => r.ok), JSON.stringify(results)).toHaveLength(1); }

describe("account deletion races in independent Node processes", () => {
  async function incorrectAccount() {
    const accountId = await account(true);
    await hubbuyBalanceServices(f.db, "alice").reconcileAccount(accountId, { expectedRevision: 0, idempotencyKey: crypto.randomUUID(), mode: "remainder", observedBalanceCnyMinor: 5000, shares: [{ personId: "alice", amountCnyMinor: 5000, historicalBrlCents: 4300 }], reason: "Conciliação incorreta QA", priorActivityDescription: "Valores informados por engano" });
    return accountId;
  }
  const discard = (accountId: string): Command => ({ action: "discard", accountId, input: { expectedRevision: 1, idempotencyKey: crypto.randomUUID(), reason: "Anulação sintética de cadastro incorreto", confirmedIncorrectRegistration: true } });

  it("replays one audited discard and reverses the original credit only once", async () => {
    const id = await incorrectAccount(), command = discard(id);
    const results = await Promise.all([run(command), run(command)]);
    expect(results.every(r => r.ok), JSON.stringify(results)).toBe(true);
    const reversals = await f.client.execute({ sql: "SELECT id FROM hubbuy_balance_entries WHERE account_id = ? AND source_type = 'reversal'", args: [id] });
    expect(reversals.rows).toHaveLength(1);
    expect(await f.db.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, id)).get()).toMatchObject({ balanceCnyMinor: 0, revision: 2 });
  });

  it("allows either an audited discard or a new real-use draft to win", async () => {
    const id = await incorrectAccount(), { t, d } = await tracking();
    const use: Command = { action: "order", accountId: id, trackingId: t.id, input: { expectedRevision: d.tracking.revision, idempotencyKey: crypto.randomUUID(), accountId: id,
      items: [{ name: "Novo", url: "https://example.test/new", platform: "other", visualKey: "generic", quantity: 1, itemOrder: 0, nativeProductState: "known", nativeProductCnyMinor: 100, nativeChinaState: "no_charge", nativeChinaCnyMinor: null, participants: [{ personId: "alice", weightMode: "equal", weight: 1 }] }] } };
    oneWinner(await Promise.all([run(discard(id)), run(use)]));
  });

  it("allows one deletion with different keys and replays one deletion with the same key", async () => {
    const id = await account();
    oneWinner(await Promise.all([run(remove(id)), run(remove(id))]));
    const second = await account(), command = remove(second);
    const repeated = await Promise.all([run(command), run(command)]);
    expect(repeated.every(r => r.ok), JSON.stringify(repeated)).toBe(true);
    const events = await f.client.execute({ sql: "SELECT id FROM financial_operations WHERE operation_type = 'account_deleted' AND json_extract(context_json, '$.accountId') = ?", args: [second] });
    expect(events.rows).toHaveLength(1);
  });

  it.each(["activate", "reconcile"])("serializes exclusion against %s", async action => {
    const id = await account(true);
    const input = { expectedRevision: 0, idempotencyKey: crypto.randomUUID(), ...(action === "activate" ? { confirmedNoPriorBalance: true } : { mode: "chronological" }) };
    oneWinner(await Promise.all([run(remove(id)), run({ action, accountId: id, input })]));
  });

  it("serializes exclusion against creation of a draft without relying on balance revision", async () => {
    const id = await account(), { t, d } = await tracking();
    const command: Command = { action: "order", accountId: id, trackingId: t.id, input: {
      expectedRevision: d.tracking.revision, idempotencyKey: crypto.randomUUID(), accountId: id,
      items: [{ name: "Novo", url: "https://example.test/new", platform: "other", visualKey: "generic", quantity: 1, itemOrder: 0, nativeProductState: "known", nativeProductCnyMinor: 100, nativeChinaState: "no_charge", nativeChinaCnyMinor: null, participants: [{ personId: "alice", weightMode: "equal", weight: 1 }] }],
    } };
    oneWinner(await Promise.all([run(remove(id)), run(command)]));
    expect((await f.client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });

  it("guards package assignment that does not increment the account revision", async () => {
    const id = await account(), { d } = await tracking();
    oneWinner(await Promise.all([run(remove(id)), run({ action: "package", accountId: id, packageId: d.packages[0].id })]));
    const rows = await f.client.execute({ sql: "SELECT p.id FROM purchase_packages p JOIN hubbuy_accounts a ON a.id = p.account_id WHERE a.deleted_at IS NOT NULL", args: [] });
    expect(rows.rows).toEqual([]);
  });

  it.each([0, 100])("serializes exclusion against receipt of %i CNY minor units", async value => {
    const id = await account(), { service, t } = await tracking();
    let d = await service.getTracking(t.id);
    d = await service.saveItemCosts(t.id, { expectedRevision: d.tracking.revision, itemId: d.items[0].id, effectivePriceState: "known", effectivePriceUnitCents: 1000, chinaFreightState: "no_charge", chinaFreightUnitCents: null });
    d = await service.saveCharge(t.id, d.productsCharge!.id, { expectedRevision: d.tracking.revision, chargeType: "products", paymentMethod: "pix" });
    d = await service.markChargePaid(t.id, d.productsCharge!.id, { expectedRevision: d.tracking.revision });
    d = await service.requestRefund(t.id, { expectedRevision: d.tracking.revision, costItemId: d.items[0].id, quantity: 1, requestedProductCents: 1000, requestedChinaCents: 0, reason: "Refund QA", packageRemovals: [{ packageId: d.packages[0].id, quantity: 1 }], unassignedQuantity: 0 });
    const command: Command = { action: "refund", accountId: id, trackingId: t.id, refundId: d.refunds[0].id, input: { expectedRevision: d.tracking.revision, receivedProductCents: value ? 70 : 0, receivedChinaCents: 0, confirmed: true, destination: "hubbuy", accountId: id, receivedProductCnyMinor: value, receivedChinaCnyMinor: 0, nativeEvidence: "Crédito sintético confirmado" } };
    oneWinner(await Promise.all([run(remove(id)), run(command)]));
  });
});
