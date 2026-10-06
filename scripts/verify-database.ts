import "dotenv/config";
import { client } from "../src/lib/db";

try {
  await client.execute("SELECT 1");
  const tables = ["workspaces", "workspace_members", "collections", "favorites", "purchases", "purchase_items", "user_preferences", "user", "session", "account", "verification"];
  for (const table of tables) await client.execute(`SELECT COUNT(*) FROM "${table}"`);
  console.log(JSON.stringify({ status: "ok", schemaTables: tables.length }));
} finally {
  client.close();
}
