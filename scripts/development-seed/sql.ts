import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "../../src/lib/db/schema";
import journal from "../../drizzle/meta/_journal.json";
import { verifyDatabase } from "../database-verification";
import { seedDevelopmentWorkspace } from "./seed";
import { people, seedWorkspaceId } from "./catalog";

function literal(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "bigint") return String(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return value.includes("\0")
    ? `CAST(X'${Buffer.from(value, "utf8").toString("hex")}' AS TEXT)`
    : `'${value.replaceAll("'", "''")}'`;
  if (value instanceof Uint8Array) return `X'${Buffer.from(value).toString("hex")}'`;
  throw new Error("Unsupported SQL export value.");
}

/** Bind Drizzle's positional parameters; ignore placeholders in quoted SQL.
 * RETURNING is omitted so the CLI never echoes credential hashes or full rows.
 */
export function exportStatement(query: string, parameters: unknown[]) {
  let out = "", parameter = 0, quote = "", bracket = false;
  for (let index = 0; index < query.length; index++) {
    const char = query[index];
    if (quote) {
      out += char;
      if (char === quote) {
        if (query[index + 1] === quote) out += query[++index];
        else quote = "";
      }
    } else if (bracket) {
      out += char;
      if (char === "]") bracket = false;
    } else if (["'", '"', "`"].includes(char)) { quote = char; out += char; }
    else if (char === "[") { bracket = true; out += char; }
    else if (/^returning\b/i.test(query.slice(index)) && (index === 0 || /\s/.test(query[index - 1]))) break;
    else if (char === "?") {
      if (parameter >= parameters.length) throw new Error("Missing SQL export parameter.");
      out += literal(parameters[parameter++]);
    } else out += char;
  }
  // RETURNING in this schema contains column names only, never bind parameters.
  if (parameter !== parameters.length) throw new Error("Unused SQL export parameter.");
  return out.trim().replace(/;+$/, "") + ";";
}

/** Generates only from a fresh in-memory database. No remote source/dump exists. */
export async function buildDevelopmentSeedSql(password: string) {
  const client = createClient({ url: "file::memory:" });
  const statements: string[] = [];
  try {
    await migrate(drizzle({ client, schema }), { migrationsFolder: "./drizzle" });
    const db = drizzle({ client, schema, logger: {
      logQuery(query, parameters) {
        if (/^\s*(?:insert\b|update\b|delete\b|create\s+table\b)/i.test(query)) statements.push(exportStatement(query, parameters));
      },
    } });
    // Any failed command aborts generation. No partial script is ever returned.
    const summary = await seedDevelopmentWorkspace(db, password);
    await verifyDatabase(client);
    const latest = journal.entries.at(-1)!;
    const migration = readFileSync(resolve("drizzle", `${latest.tag}.sql`), "utf8").replaceAll("\r\n", "\n");
    const hashes = [migration, migration.replaceAll("\n", "\r\n")].map(content => literal(createHash("sha256").update(content).digest("hex")));
    const namespace = literal(seedWorkspaceId);
    const preflight = [
      `(SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1) = ${latest.when}`,
      `(SELECT hash FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1) IN (${hashes.join(",")})`,
      `NOT EXISTS (SELECT 1 FROM workspaces WHERE id=${namespace})`,
      `NOT EXISTS (SELECT 1 FROM user WHERE email IN (${people.map(person => literal(person.email)).join(",")}))`,
    ].join(" AND ");
    const source = [
      "-- LOTI: ONE-TIME DEVELOPMENT DATA. Import ONLY with: turso db shell loti-dev",
      "-- Generated locally by domain services. No production data, migrations, secrets or plaintext passwords.",
      "-- Existing application tables, constraints and triggers must remain enabled.",
      "-- SQL cannot identify a Turso database name: the CLI destination must be literally loti-dev.",
      "PRAGMA foreign_keys=ON;",
      "BEGIN IMMEDIATE;",
      "CREATE TEMP TABLE _loti_development_seed_guard (id INTEGER PRIMARY KEY ON CONFLICT ROLLBACK);",
      "INSERT INTO _loti_development_seed_guard VALUES(1);",
      "-- A duplicate guard ID rolls back if migrations differ or this seed/already-existing logins collide.",
      `INSERT INTO _loti_development_seed_guard SELECT 1 WHERE NOT coalesce((${preflight}),0);`,
      ...statements,
      "-- Assert counts and FKs before committing any application data.",
      `INSERT INTO _loti_development_seed_guard SELECT 1 WHERE (SELECT count(*) FROM favorites WHERE workspace_id=${namespace}) != 50 OR (SELECT count(*) FROM logistics_packages WHERE workspace_id=${namespace}) != 6 OR EXISTS(SELECT 1 FROM pragma_foreign_key_check);`,
      "DROP TABLE _loti_development_seed_guard;",
      "COMMIT;",
      `SELECT 'Loti: seed de desenvolvimento concluído' AS resultado, (SELECT count(*) FROM favorites WHERE workspace_id=${namespace}) AS favoritos, (SELECT count(*) FROM logistics_packages WHERE workspace_id=${namespace}) AS pacotes;`,
      "",
    ].join("\n");
    return { sql: source, summary, statements: statements.length };
  } finally { client.close(); }
}
