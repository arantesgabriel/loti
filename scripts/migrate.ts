import "dotenv/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/libsql/migrator";
import { openDatabase } from "../src/lib/db/connection";
export async function migrateDatabase(url = process.env.TURSO_DATABASE_URL ?? "file:./data/loti.sqlite") {
  const { db, client } = openDatabase(url);
  try { await migrate(db, { migrationsFolder: "./drizzle" }); } finally { client.close(); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) { await migrateDatabase(); console.log("Loti: migrations applied."); }
