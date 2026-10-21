import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { openDatabase } from "@/lib/db/connection";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import { packageCostServices } from "@/lib/domain/package-cost-services";
import { fixture } from "./helpers";

describe("manual adjustment migration", () => {
  it("upgrades populated 0021 refunds with their children and preserves all existing guards", async () => {
    const source = await fixture(), legacy = openDatabase(":memory:");
    const folder = mkdtempSync(join(tmpdir(), "loti-adjustment-migrations-"));
    try {
      const account = await hubbuyBalanceServices(source.db, "alice").createAccount({ workspaceId: "workspace", label: "Legacy zero", confirmZeroBalance: true, idempotencyKey: "old-account" });
      const p = await source.alice.savePurchase({ name: "Refund before 0022" });
      await source.alice.saveManualItem({ name: "Original", url: "https://example.test/old", quantity: 1, unitPriceCents: 1000, personId: "alice" });
      await source.alice.finalizePurchase(p!.id, true);
      const costs = packageCostServices(source.db, "alice"), tracking = await costs.startTracking(p!.id);
      let d = await costs.getTracking(tracking.id);
      d = await costs.saveItemCosts(tracking.id, { expectedRevision: d.tracking.revision, itemId: d.items[0].id, effectivePriceState: "known", effectivePriceUnitCents: 1000, chinaFreightState: "no_charge", chinaFreightUnitCents: null });
      d = await costs.saveCharge(tracking.id, d.productsCharge!.id, { expectedRevision: d.tracking.revision, chargeType: "products", paymentMethod: "pix" });
      d = await costs.markChargePaid(tracking.id, d.productsCharge!.id, { expectedRevision: d.tracking.revision });
      d = await costs.requestRefund(tracking.id, { expectedRevision: d.tracking.revision, costItemId: d.items[0].id, quantity: 1, requestedProductCents: 1000, requestedChinaCents: 0, reason: "Legacy cancellation", packageRemovals: [{ packageId: d.packages[0].id, quantity: 1 }], unassignedQuantity: 0 });
      await costs.receiveRefund(tracking.id, d.refunds[0].id, { expectedRevision: d.tracking.revision, receivedProductCents: 900, receivedChinaCents: 0, confirmed: true });
      const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { idx: number; tag: string }[] };
      journal.entries = journal.entries.filter(row => row.idx < 22);
      mkdirSync(join(folder, "meta")); writeFileSync(join(folder, "meta/_journal.json"), JSON.stringify(journal));
      for (const row of journal.entries) copyFileSync(`drizzle/${row.tag}.sql`, join(folder, `${row.tag}.sql`));
      await migrate(legacy.db, { migrationsFolder: folder });
      const tables = ["user", "workspaces", "workspace_members", "purchases", "purchase_items", "purchase_item_participants", "workspace_cost_settings", "purchase_cost_trackings", "hubbuy_accounts", "financial_operations", "purchase_cost_orders", "purchase_item_costs", "purchase_cost_participants", "purchase_packages", "purchase_package_items", "purchase_cost_charges", "purchase_cost_refunds", "purchase_cost_refund_participants", "purchase_cost_refund_events", "purchase_refund_payment_allocations"];
      const historical = new Map<string, { columns: string; rows: unknown[] }>();
      for (const table of tables) {
        const names = (await legacy.client.execute(`PRAGMA table_info("${table}")`)).rows.map(row => `"${row.name}"`);
        const rows = (await source.client.execute(`SELECT ${names.join(",")} FROM "${table}" ORDER BY rowid`)).rows;
        for (const row of rows) await legacy.client.execute({ sql: `INSERT INTO "${table}" (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`, args: names.map(name => row[name.slice(1, -1)]) });
        historical.set(table, { columns: names.join(","), rows: (await legacy.client.execute(`SELECT ${names.join(",")} FROM "${table}" ORDER BY rowid`)).rows });
      }
      const guards = (await legacy.client.execute("SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name")).rows.map(row => row.name);
      await migrate(legacy.db, { migrationsFolder: "drizzle" });
      await migrate(legacy.db, { migrationsFolder: "drizzle" });
      for (const [table, value] of historical) expect((await legacy.client.execute(`SELECT ${value.columns} FROM "${table}" ORDER BY rowid`)).rows, table).toEqual(value.rows);
      const nextGuards = (await legacy.client.execute("SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name")).rows.map(row => row.name);
      expect(nextGuards).toEqual(expect.arrayContaining(guards));
      expect(nextGuards.length).toBe(guards.length + 4);
      expect((await legacy.client.execute("PRAGMA foreign_key_check")).rows).toHaveLength(0);
      expect((await legacy.client.execute("SELECT requested_product_cny_minor, requested_china_cny_minor FROM purchase_cost_refunds")).rows).toEqual([{ requested_product_cny_minor: null, requested_china_cny_minor: null }]);
      const result = await hubbuyBalanceServices(legacy.db, "alice").recordManualAdjustment(account.accountId, { expectedRevision: 0, idempotencyKey: "after-upgrade", kind: "promotional_bonus", amountCnyMinor: 114, occurredAt: "2026-10-21T12:00:00Z", reason: "Bônus após upgrade", shares: [{ personId: "alice", amountCnyMinor: 114 }] });
      expect(result.balanceAfterCnyMinor).toBe(114);
    } finally { source.client.close(); legacy.client.close(); rmSync(folder, { recursive: true, force: true }); }
  });
});
