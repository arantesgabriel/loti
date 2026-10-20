import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import { openDatabase } from "@/lib/db/connection";
import { hubbuyAccounts, user, workspaceMembers, workspaces } from "@/lib/db/schema";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";

describe("incorrect-registration correction migration", () => {
  it("preserves an existing reconciliation and ledger through 0019 and permits only audited reversal afterward", async () => {
    const dir = mkdtempSync(join(tmpdir(), "loti-discard-upgrade-"));
    const { db, client } = openDatabase(":memory:");
    try {
      mkdirSync(join(dir, "meta"));
      const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
      journal.entries = journal.entries.slice(0, 19);
      writeFileSync(join(dir, "meta/_journal.json"), JSON.stringify(journal));
      for (const e of journal.entries) copyFileSync(resolve(`drizzle/${e.tag}.sql`), join(dir, `${e.tag}.sql`));
      await migrate(db, { migrationsFolder: dir });
      const now = new Date();
      await db.insert(user).values({ id: "alice", name: "Alice", email: "alice@discard.test", emailVerified: true, createdAt: now, updatedAt: now }).run();
      await db.insert(workspaces).values({ id: "workspace", name: "Loti", createdAt: now }).run();
      await db.insert(workspaceMembers).values({ workspaceId: "workspace", userId: "alice", createdAt: now }).run();
      const service = hubbuyBalanceServices(db, "alice");
      const a = await service.createAccount({ workspaceId: "workspace", idempotencyKey: "create", label: "Cadastro legado", confirmZeroBalance: true });
      await db.update(hubbuyAccounts).set({ status: "reconciling" }).where(eq(hubbuyAccounts.id, a.accountId)).run();
      await service.reconcileAccount(a.accountId, { expectedRevision: 0, idempotencyKey: "reconcile", mode: "remainder", observedBalanceCnyMinor: 5000, reason: "Informado por engano", priorActivityDescription: "Cadastro incorreto", shares: [{ personId: "alice", amountCnyMinor: 5000, historicalBrlCents: 4300 }] });
      const before = (await client.execute("SELECT * FROM hubbuy_balance_entries")).rows;
      await migrate(db, { migrationsFolder: resolve("drizzle") });
      await migrate(db, { migrationsFolder: resolve("drizzle") });
      expect((await client.execute("SELECT * FROM hubbuy_balance_entries")).rows).toEqual(before);
      await service.discardIncorrectAccount(a.accountId, { expectedRevision: 1, idempotencyKey: "discard", reason: "Anulação solicitada do cadastro incorreto", confirmedIncorrectRegistration: true });
      expect((await client.execute("SELECT * FROM hubbuy_balance_entries WHERE direction = 'credit'")).rows).toEqual(before);
      expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
    } finally { client.close(); rmSync(dir, { recursive: true, force: true }); }
  });
});
