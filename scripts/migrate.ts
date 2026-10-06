import "dotenv/config";
import { migrate } from "drizzle-orm/libsql/migrator";
import { openDatabase } from "../src/lib/db/connection";
export async function migrateDatabase(url = process.env.TURSO_DATABASE_URL ?? "file:./data/loti.sqlite") {
  const { db, client } = openDatabase(url);
  try { await migrate(db, { migrationsFolder: "./drizzle" }); } finally { client.close(); }
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) { await migrateDatabase(); console.log("Loti: migrations applied."); }
