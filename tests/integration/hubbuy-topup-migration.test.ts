import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db/connection";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import * as s from "@/lib/db/schema";

describe("typed topup schema upgrade", () => {
  it("preserves populated ledger, all prior guards and foreign keys, and reapplies without movements", async () => {
    const path = `artifacts/qa/topup-migration/${randomUUID()}`;
    mkdirSync(`${path}/meta`, { recursive: true });
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    journal.entries = journal.entries.filter((entry: {idx: number}) => entry.idx < 34);
    writeFileSync(`${path}/meta/_journal.json`, JSON.stringify(journal));
    for (const entry of journal.entries) writeFileSync(`${path}/${entry.tag}.sql`, readFileSync(`drizzle/${entry.tag}.sql`));
    const { db, client } = openDatabase(":memory:");
    try {
      await migrate(db, { migrationsFolder: path });
      const now = new Date();
      await db.insert(s.user).values({ id: "synthetic-owner", name: "Synthetic", email: "owner@synthetic.test", emailVerified: true, createdAt: now, updatedAt: now });
      await db.insert(s.workspaces).values({ id: "synthetic-workspace", name: "Synthetic", kind: "shared", createdAt: now });
      await db.insert(s.workspaceMembers).values({ workspaceId: "synthetic-workspace", userId: "synthetic-owner", createdAt: now });
      const service = hubbuyBalanceServices(db, "synthetic-owner", "synthetic-workspace");
      const { accountId } = await service.createAccount({ workspaceId: "synthetic-workspace", idempotencyKey: "create", label: "Synthetic", confirmZeroBalance: true });
      await service.recordManualAdjustment(accountId, { expectedRevision: 0, idempotencyKey: "baseline-credit", kind: "documented_credit", occurredAt: "2026-11-12T10:00:00Z", reason: "Synthetic baseline", amountCnyMinor: 37034, shares: [{ personId: "synthetic-owner", amountCnyMinor: 37034, historicalBrlCents: 28868 }] });
      await service.recordManualAdjustment(accountId, { expectedRevision: 1, idempotencyKey: "baseline-debit", kind: "documented_debit", occurredAt: "2026-11-12T10:01:00Z", reason: "Synthetic baseline consumption", amountCnyMinor: 1800, shares: [{ personId: "synthetic-owner", amountCnyMinor: 1800 }] });
      const names = ["hubbuy_accounts", "financial_operations", "hubbuy_balance_entries", "hubbuy_balance_credit_shares", "hubbuy_balance_consumptions", "hubbuy_balance_adjustments"];
      const snapshot = async () => Object.fromEntries(await Promise.all(names.map(async name => [name, (await client.execute(`SELECT * FROM ${name} ORDER BY id`)).rows])));
      const before = await snapshot();
      const triggers = (await client.execute("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name")).rows;
      expect(triggers).toHaveLength(103);
      // Inject failure after the rebuilt ledger and all restored/new guards.
      // An interrupted migration must roll back DDL and retain its old journal.
      const failedPath = `${path}/interrupted`;
      mkdirSync(`${failedPath}/meta`, { recursive: true });
      const fullJournal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
      writeFileSync(`${failedPath}/meta/_journal.json`, JSON.stringify(fullJournal));
      for (const entry of fullJournal.entries) writeFileSync(`${failedPath}/${entry.tag}.sql`, readFileSync(`drizzle/${entry.tag}.sql`));
      const failedMigration = `${failedPath}/0034_topup_financing_foundation.sql`;
      writeFileSync(failedMigration, readFileSync(failedMigration, "utf8") + "\n--> statement-breakpoint\nSELECT * FROM deliberately_missing_topup_table;\n");
      await expect(migrate(db, { migrationsFolder: failedPath })).rejects.toThrow();
      expect(await snapshot()).toEqual(before);
      expect((await client.execute("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name")).rows).toEqual(triggers);
      expect((await client.execute("SELECT name FROM sqlite_master WHERE name='hubbuy_topups'")).rows).toHaveLength(0);
      await migrate(db, { migrationsFolder: "drizzle" });
      expect(await snapshot()).toEqual(before);
      const afterTriggers = (await client.execute("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name")).rows;
      for (const trigger of triggers) {
        const after = afterTriggers.find(row => row.name === trigger.name);
        if (trigger.name === "hubbuy_credit_share_guard") {
          expect(String(after?.sql)).toContain("w.owner_user_id=NEW.person_id");
          expect(String(after?.sql)).toContain("workspace_members");
        } else expect(after).toEqual(trigger);
      }
      expect((await client.execute("PRAGMA foreign_key_check")).rows).toHaveLength(0);
      expect((await client.execute("SELECT * FROM hubbuy_topups")).rows).toHaveLength(0);
      await migrate(db, { migrationsFolder: "drizzle" });
      expect(await snapshot()).toEqual(before);
      expect((await client.execute("PRAGMA foreign_key_check")).rows).toHaveLength(0);
    } finally { client.close(); }
  });
});
