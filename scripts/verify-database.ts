import "dotenv/config";
import { client } from "../src/lib/db";

try {
  await client.execute("SELECT 1");
  const tables = ["workspaces", "workspace_members", "collections", "favorites", "purchases", "purchase_items", "purchase_item_participants", "user_preferences", "workspace_cost_settings", "purchase_cost_trackings", "purchase_item_costs", "purchase_cost_participants", "purchase_packages", "purchase_package_items", "purchase_cost_charges", "purchase_cost_reopenings", "user", "session", "account", "verification"];
  for (const table of tables) await client.execute(`SELECT COUNT(*) FROM "${table}"`);
  console.log(JSON.stringify({ status: "ok", schemaTables: tables.length }));
} finally {
  client.close();
}
