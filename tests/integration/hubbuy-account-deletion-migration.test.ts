import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { openDatabase } from "@/lib/db/connection";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";

describe("HubBuy account tombstone migration", () => {
  it("upgrades the prior schema without marking accounts deleted or losing audit/triggers, and repeats safely", async () => {
    const dir = mkdtempSync(join(tmpdir(), "loti-account-delete-migrations-"));
    const { db, client } = openDatabase(":memory:");
    try {
      mkdirSync(join(dir, "meta"));
      const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
      journal.entries = journal.entries.slice(0, 18);
      writeFileSync(join(dir, "meta/_journal.json"), JSON.stringify(journal));
      for (const e of journal.entries) copyFileSync(resolve(`drizzle/${e.tag}.sql`), join(dir, `${e.tag}.sql`));
      await migrate(db, { migrationsFolder: dir });
      await client.execute("INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('alice', 'Alice', 'alice@delete-migration.test', 1, 1, 1)");
      await client.execute("INSERT INTO workspaces (id, name, created_at) VALUES ('workspace', 'Loti', 1)");
      await client.execute("INSERT INTO workspace_members (workspace_id, user_id, created_at) VALUES ('workspace', 'alice', 1)");
      await client.execute("INSERT INTO hubbuy_accounts (id, workspace_id, label, status, created_by, created_at, updated_by, updated_at) VALUES ('legacy', 'workspace', 'Legada', 'reconciling', 'alice', 1, 'alice', 1)");
      const before = (await client.execute("SELECT * FROM hubbuy_accounts")).rows[0];
      const triggers = (await client.execute("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name")).rows.map(r => r.name);
      await migrate(db, { migrationsFolder: resolve("drizzle") });
      await migrate(db, { migrationsFolder: resolve("drizzle") });
      const after = (await client.execute("SELECT * FROM hubbuy_accounts")).rows[0];
      expect(after).toEqual({ ...before, deleted_at: null, deleted_by: null });
      const upgradedTriggers = (await client.execute("SELECT name FROM sqlite_master WHERE type = 'trigger'")).rows.map(r => r.name);
      expect(upgradedTriggers).toEqual(expect.arrayContaining(triggers));
      expect(upgradedTriggers).toContain("hubbuy_account_delete_eligibility");
      await expect(client.execute("UPDATE hubbuy_accounts SET deleted_by = 'alice' WHERE id = 'legacy'")).rejects.toThrow(/tombstone/);
      await hubbuyBalanceServices(db, "alice").deleteAccount("legacy", { expectedRevision: 0, idempotencyKey: "migration-delete", reason: "Cadastro vazio legado" });
      await expect(client.execute("DELETE FROM hubbuy_accounts WHERE id = 'legacy'")).rejects.toThrow(/retained for audit/);
      expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
    } finally { client.close(); rmSync(dir, { recursive: true, force: true }); }
  });
});
