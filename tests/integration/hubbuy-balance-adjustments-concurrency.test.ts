import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fixture, type Fixture } from "./helpers";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";

let f: Fixture, directory: string, url: string;
beforeEach(async () => { directory = mkdtempSync(join(tmpdir(), "loti-adjustment-race-")); url = `file:${join(directory, "race.sqlite")}`; f = await fixture(url); });
// Native SQLite handles can outlive close briefly on Windows. Like the existing
// account race fixtures, retain disposable files in the test temp directory.
afterEach(() => { f.client.close(); });
const occurredAt = "2026-10-21T12:00:00Z";
const input = (revision: number) => ({ expectedRevision: revision, idempotencyKey: crypto.randomUUID(), kind: "promotional_bonus", amountCnyMinor: 114, occurredAt, reason: "Bônus QA", externalReference: "same-qa-reference", shares: [{ personId: "alice", amountCnyMinor: 114 }] });
async function run(accountId: string, action: string, input: unknown) {
  const result = await promisify(execFile)(process.execPath, ["--import", "tsx", "tests/integration/hubbuy-balance-adjustments-worker.ts"], { cwd: process.cwd(), timeout: 30_000, env: { ...process.env, LOTI_ADJUSTMENT_RACE_DATABASE: url, LOTI_ADJUSTMENT_RACE_COMMAND: JSON.stringify({ accountId, action, input }) } });
  return JSON.parse(result.stdout) as { ok: boolean; code?: string; data?: { operationId: string } };
}
async function account() { return (await hubbuyBalanceServices(f.db, "alice").createAccount({ workspaceId: "workspace", label: "Race QA", confirmZeroBalance: true, idempotencyKey: crypto.randomUUID() })).accountId; }

describe("manual adjustments across independent processes", { timeout: 30_000 }, () => {
  it("replays the exact concurrent command with one financial effect", async () => {
    const id = await account(), command = input(0);
    const results = await Promise.all([run(id, "record", command), run(id, "record", command)]);
    expect(results.every(row => row.ok), JSON.stringify(results)).toBe(true);
    expect(results[0].data?.operationId).toBe(results[1].data?.operationId);
    expect((await hubbuyBalanceServices(f.db, "alice").getAccountBalance(id)).account.balanceCnyMinor).toBe(114);
  });
  it("allows only one concurrent revision and rejects a reused external reference afterwards", async () => {
    const id = await account();
    const results = await Promise.all([run(id, "record", input(0)), run(id, "record", input(0))]);
    expect(results.filter(row => row.ok), JSON.stringify(results)).toHaveLength(1);
    expect(await run(id, "record", input(1))).toMatchObject({ ok: false, code: "ADJUSTMENT_REFERENCE_DUPLICATE" });
  });
  it("serializes credit cancellation against consumption", async () => {
    const id = await account(), service = hubbuyBalanceServices(f.db, "alice");
    const credit = await service.recordManualAdjustment(id, input(0));
    const results = await Promise.all([
      run(id, "reverse", { expectedRevision: 1, idempotencyKey: crypto.randomUUID(), adjustmentId: credit.adjustmentId, occurredAt, reason: "Anular QA" }),
      run(id, "record", { ...input(1), kind: "documented_debit", externalReference: "debit-qa" }),
    ]);
    expect(results.filter(row => row.ok), JSON.stringify(results)).toHaveLength(1);
    expect(await service.getAccountBalance(id)).toMatchObject({ reconciled: true, account: { balanceCnyMinor: 0, revision: 2 } });
  });
  it("serializes deletion against a first bonus without leaving deleted-account writes", async () => {
    const id = await account();
    const results = await Promise.all([run(id, "record", input(0)), run(id, "delete", { expectedRevision: 0, idempotencyKey: crypto.randomUUID(), reason: "Excluir QA" })]);
    expect(results.filter(row => row.ok), JSON.stringify(results)).toHaveLength(1);
    expect((await f.client.execute("PRAGMA foreign_key_check")).rows).toHaveLength(0);
  });
});
