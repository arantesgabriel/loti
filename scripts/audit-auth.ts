import "dotenv/config";
import { openDatabase } from "../src/lib/db/connection";
import { resetDatabaseUrl } from "./password-reset";
import { parseArgs } from "node:util";

// Read-only aggregate audit. No identities, addresses, tokens or credentials in output.
const { values } = parseArgs({ options: { target: { type: "string" } } });
const url = resetDatabaseUrl(process.env);
if (values.target === "local" ? !url.startsWith("file:") : values.target === "loti-prod" ? !/^loti-prod(?:-[a-z0-9-]+)?\./.test(new URL(url).hostname) : true) {
  throw new Error("Selecione --target local ou --target loti-prod e configure explicitamente o banco correspondente. Nenhuma consulta foi executada.");
}
const connection = openDatabase(url);
try {
  const users = await connection.client.execute("SELECT COUNT(*) AS total, SUM(CASE WHEN email_verified = 1 THEN 1 ELSE 0 END) AS verified, SUM(CASE WHEN email_verified = 0 THEN 1 ELSE 0 END) AS unverified FROM user");
  const members = await connection.client.execute("SELECT COUNT(DISTINCT u.id) AS members, COUNT(DISTINCT CASE WHEN u.email_verified = 0 THEN u.id END) AS unverified_members FROM user u JOIN workspace_members m ON m.user_id = u.id");
  const tables = await connection.client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('auth_limits', 'auth_email_deliveries')");
  console.log(JSON.stringify({ database: process.env.TURSO_DATABASE_URL?.startsWith("file:") ? "local" : "remote", users: users.rows[0], membership: members.rows[0], emailSecurityMigrationApplied: tables.rows.length === 2 }));
} catch { console.error("Não foi possível concluir a auditoria. Verifique a seleção explícita do banco e suas permissões."); process.exitCode = 1; }
finally { connection.client.close(); }
