import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixture } from "./helpers";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";

describe("topup independent-process confirmations", () => {
  it("recovers one operation for identical concurrent requests", async () => {
    const directory = mkdtempSync(join(tmpdir(), "loti-topup-race-")), url = `file:${join(directory, "synthetic.sqlite")}`;
    const f = await fixture(url, "orders");
    try {
      await f.client.execute("PRAGMA journal_mode=WAL");
      const { accountId } = await hubbuyBalanceServices(f.db, "alice").createAccount({ workspaceId: "workspace", idempotencyKey: "create", label: "Synthetic", confirmZeroBalance: true });
      const input = { expectedRevision: 0, idempotencyKey: "same-receipt", occurredAt: "2026-11-12T10:00:00Z", reason: "Synthetic race", cnyMinor: 39830, method: "pix", receipt: { mode: "total_with_fee", totalBrlCents: 35242 }, fee: { mode: "percentage", bps: 100 }, funders: [{ personId: "alice", cnyMinor: 39830, principalBrlCents: 34893, feeBrlCents: 349 }], externalReference: "synthetic-race-receipt", confirmedNoReference: false, confirmedReceived: true };
      const run = async (command: unknown) => {
        const result = await promisify(execFile)(process.execPath, ["--import", "tsx", "tests/integration/hubbuy-topup-worker.ts"], { cwd: process.cwd(), timeout: 30000, env: { ...process.env, TURSO_AUTH_TOKEN: "", LOTI_TOPUP_RACE_DATABASE: url, LOTI_TOPUP_RACE_COMMAND: JSON.stringify({ accountId, input: command }) } });
        return JSON.parse(result.stdout) as { ok: boolean; code?: string; data?: { operationId: string } };
      };
      const results = await Promise.all([run(input), run(input)]);
      expect(results.every(result => result.ok), JSON.stringify(results)).toBe(true);
      expect(results[0].data?.operationId).toBe(results[1].data?.operationId);
      expect((await f.client.execute("SELECT * FROM hubbuy_topups")).rows).toHaveLength(1);
      expect((await f.client.execute("SELECT * FROM hubbuy_balance_entries")).rows).toHaveLength(1);
      const next = { ...input, expectedRevision: 1, externalReference: null, confirmedNoReference: true };
      const different = await Promise.all([run({ ...next, idempotencyKey: "second-a" }), run({ ...next, idempotencyKey: "second-b" })]);
      expect(different.filter(result => result.ok), JSON.stringify(different)).toHaveLength(1);
      expect(await hubbuyBalanceServices(f.db, "alice").getAccountBalance(accountId)).toMatchObject({ ledgerBalanceCnyMinor: 79660, reconciled: true });
      expect((await f.client.execute("PRAGMA foreign_key_check")).rows).toHaveLength(0);
    } finally { f.client.close(); }
  }, 60000);
});
