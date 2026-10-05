import "dotenv/config";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "../src/lib/db/connection";
export function migrateDatabase(path = process.env.DATABASE_PATH ?? "./data/loti.sqlite") {
  const { db, sqlite } = openDatabase(path);
  try { migrate(db, { migrationsFolder: "./drizzle" }); } finally { sqlite.close(); }
}
if (import.meta.url === new URL(process.argv[1], "file:").href) { migrateDatabase(); console.log("Loti: migrations applied."); }
