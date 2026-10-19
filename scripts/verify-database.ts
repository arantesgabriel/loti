import "dotenv/config";
import { client } from "../src/lib/db";

try {
  await client.execute("SELECT 1");
  const tables = ["workspaces", "workspace_members", "collections", "favorites", "purchases", "purchase_items", "purchase_item_participants", "user_preferences", "workspace_cost_settings", "purchase_cost_trackings", "purchase_cost_orders", "purchase_additional_order_items", "purchase_item_costs", "purchase_cost_participants", "purchase_packages", "purchase_cost_package_events", "purchase_package_items", "purchase_cost_charges", "purchase_payment_components", "purchase_payment_allocations", "purchase_cost_reopenings", "purchase_cost_refunds", "purchase_cost_refund_participants", "purchase_cost_refund_events", "purchase_refund_payment_allocations", "hubbuy_accounts", "hubbuy_reconciliation_runs", "hubbuy_reconciliation_events", "financial_operations", "hubbuy_balance_entries", "hubbuy_balance_credit_shares", "hubbuy_balance_consumptions", "member_balance_financing_entries", "hubbuy_external_items", "qc_imports", "qc_images", "qc_image_sources", "qc_image_previews", "qc_presentations", "qc_additional_presentations", "qc_events", "qc_rate_limits", "qc_transfer_locks", "user", "session", "account", "verification"];
  for (const table of tables) await client.execute(`SELECT COUNT(*) FROM "${table}"`);
  const foreignKeyViolations = await client.execute("PRAGMA foreign_key_check");
  if (foreignKeyViolations.rows.length) throw new Error(`Database contains ${foreignKeyViolations.rows.length} foreign-key violations.`);
  const requiredTriggers = ["financial_operations_no_update", "financial_operations_no_delete", "hubbuy_balance_entries_no_update", "hubbuy_balance_entries_no_delete", "hubbuy_balance_credit_shares_no_update", "hubbuy_balance_credit_shares_no_delete", "hubbuy_balance_consumptions_no_update", "hubbuy_balance_consumptions_no_delete", "member_balance_financing_entries_no_update", "member_balance_financing_entries_no_delete", "hubbuy_reconciliation_runs_no_update", "hubbuy_reconciliation_runs_no_delete", "hubbuy_reconciliation_events_no_update", "hubbuy_reconciliation_events_no_delete", "hubbuy_account_balance_matches_ledger", "hubbuy_accounts_no_delete", "purchase_payment_component_no_update", "purchase_payment_component_no_delete", "purchase_payment_allocation_no_update", "purchase_payment_allocation_no_delete", "purchase_payment_allocation_capacity_guard", "purchase_cost_order_recorded_no_update", "purchase_cost_order_recorded_no_delete", "additional_order_item_recorded_no_update", "additional_order_item_recorded_no_delete", "additional_order_cost_recorded_no_update", "additional_order_cost_recorded_no_delete", "refund_payment_allocation_workspace_guard", "refund_payment_allocations_no_update", "refund_payment_allocations_no_delete", "purchase_cost_package_events_no_update", "purchase_cost_package_events_no_delete"];
  requiredTriggers.push("hubbuy_account_tombstone_insert", "hubbuy_account_tombstone_update", "hubbuy_account_delete_eligibility", "financial_operations_live_account_insert", "refund_events_live_account_insert");
  for (const table of ["hubbuy_balance_entries", "hubbuy_reconciliation_runs", "hubbuy_reconciliation_events", "purchase_cost_orders", "purchase_packages", "purchase_payment_components", "purchase_cost_refunds"]) {
    requiredTriggers.push(`${table}_live_account_insert`, `${table}_live_account_update`);
  }
  const invalidTombstones = await client.execute("SELECT id FROM hubbuy_accounts WHERE NOT ((deleted_at IS NULL AND deleted_by IS NULL) OR (deleted_at IS NOT NULL AND deleted_by IS NOT NULL AND status = 'archived' AND balance_cny_minor = 0))");
  if (invalidTombstones.rows.length) throw new Error("Invalid HubBuy account tombstones.");
  for (const trigger of requiredTriggers) {
    const result = await client.execute({ sql: "SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = ?", args: [trigger] });
    if (!result.rows.length) throw new Error(`Required financial ledger trigger is missing: ${trigger}.`);
  }
  const accountDeletionGuard = await client.execute("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'hubbuy_account_delete_eligibility'");
  if (!String(accountDeletionGuard.rows[0]?.sql).includes("account_registration_discarded")) throw new Error("Missing audited incorrect-registration correction migration.");
  console.log(JSON.stringify({ status: "ok", schemaTables: tables.length, ledgerTriggers: requiredTriggers.length, foreignKeyViolations: 0 }));
} finally {
  client.close();
}
