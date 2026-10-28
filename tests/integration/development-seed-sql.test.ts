import { expect, it, vi } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { verifyPassword } from "better-auth/crypto";
import { buildDevelopmentSeedSql, exportStatement } from "../../scripts/development-seed/sql";
import { verifyDatabase } from "../../scripts/database-verification";
import { people, seedWorkspaceId } from "../../scripts/development-seed/catalog";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import { warehouseServices } from "@/lib/domain/warehouse-services";
import * as schema from "@/lib/db/schema";

it("serializes values safely and suppresses RETURNING without altering literal text", () => {
  expect(exportStatement('insert into "table" ("a","b") values (?,?) returning "a"', ["D'Addario ? RETURNING", null]))
    .toBe('insert into "table" ("a","b") values (\'D\'\'Addario ? RETURNING\',NULL);');
  expect(exportStatement("UPDATE example SET text='?' WHERE id=?", [5])).toBe("UPDATE example SET text='?' WHERE id=5;");
  expect(() => exportStatement("INSERT INTO x VALUES (?)", [])).toThrow(/Missing/);
});

it("replays standalone SQL with all triggers, valid passwords, balances and one-time guards", async () => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("BETTER_AUTH_SECRET", "development-sql-export-integration-secret-2026");
  vi.stubEnv("LOTI_EMAIL_MODE", "disabled");
  const password = "Development-sql-password-only-2026";
  const client = createClient({ url: "file::memory:" });
  const collision = createClient({ url: "file::memory:" });
  try {
    const generated = await buildDevelopmentSeedSql(password);
    expect(generated.sql).not.toContain(password);
    expect(generated.sql).not.toMatch(/PRAGMA\s+foreign_keys\s*=\s*OFF|DROP TRIGGER|INSERT INTO ["`]?__drizzle_migrations/i);
    await migrate(drizzle({ client, schema }), { migrationsFolder: "./drizzle" });
    await client.execute("INSERT INTO workspaces(id,name,created_at) VALUES('existing','Grupo existente',1)");
    await client.executeMultiple(generated.sql);
    expect(await verifyDatabase(client)).toMatchObject({ status: "ok", foreignKeyViolations: 0 });
    const credential = await client.execute({ sql: 'SELECT a.password, u.id FROM account a JOIN user u ON u.id=a.user_id WHERE u.email=? AND a.provider_id=\'credential\'', args: [people[0].email] });
    expect(await verifyPassword({ hash: String(credential.rows[0].password), password })).toBe(true);
    const db = drizzle({ client, schema }), actor = String(credential.rows[0].id);
    const warehouse = await warehouseServices(db, actor).list();
    expect(warehouse.rows).toHaveLength(35);
    expect(warehouse.rows.reduce((sum, row) => sum + row.availableUnits.length, 0)).toBe(22);
    const account = await client.execute({ sql: "SELECT id FROM hubbuy_accounts WHERE workspace_id=? AND label='Compras compartilhadas'", args: [seedWorkspaceId] });
    expect(await hubbuyBalanceServices(db, actor).getAccountBalance(String(account.rows[0].id))).toMatchObject({ ledgerBalanceCnyMinor: 53700, reconciled: true });
    const before = (await client.execute("SELECT count(*) AS n FROM financial_operations")).rows;
    await expect(client.executeMultiple(generated.sql)).rejects.toThrow(/_loti_development_seed_guard/);
    expect((await client.execute("SELECT count(*) AS n FROM financial_operations")).rows).toEqual(before);
    expect((await client.execute("SELECT name FROM workspaces WHERE id='existing'")).rows[0].name).toBe("Grupo existente");
    await migrate(drizzle({ client: collision, schema }), { migrationsFolder: "./drizzle" });
    await collision.execute({ sql: 'INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,0,1,1)', args: ["existing-user", "Conta existente", people[0].email] });
    await expect(collision.executeMultiple(generated.sql)).rejects.toThrow(/_loti_development_seed_guard/);
    expect((await collision.execute("SELECT count(*) AS n FROM user")).rows[0].n).toBe(1);
    expect((await collision.execute("SELECT count(*) AS n FROM workspaces")).rows[0].n).toBe(0);
    expect((await collision.execute("SELECT count(*) AS n FROM favorites")).rows[0].n).toBe(0);
  } finally { client.close(); collision.close(); vi.unstubAllEnvs(); }
}, 120_000);
