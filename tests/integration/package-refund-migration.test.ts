import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { openDatabase } from "@/lib/db/connection";
import { purchaseCostCharges, purchaseCostOrders, purchaseCostPackageEvents, purchaseCostParticipants, purchaseCostTrackings, purchaseItemCosts, purchaseItems, purchasePackages, purchases, user, workspaceMembers, workspaces } from "@/lib/db/schema";

describe("package refund additive migration", () => {
  it("upgrades from migration 0004, preserves an existing paid snapshot and repeats without creating refunds", async () => {
    const previousMigrations = join(tmpdir(), `loti-refund-migrations-${crypto.randomUUID()}`);
    const { db, client } = openDatabase(":memory:");
    try {
      mkdirSync(join(previousMigrations, "meta"), { recursive: true });
      const journalPath = resolve("drizzle/meta/_journal.json");
      const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
      journal.entries = journal.entries.slice(0, 5);
      writeFileSync(join(previousMigrations, "meta/_journal.json"), JSON.stringify(journal));
      for (const entry of journal.entries) copyFileSync(resolve(`drizzle/${entry.tag}.sql`), join(previousMigrations, `${entry.tag}.sql`));
      await migrate(db, { migrationsFolder: previousMigrations });
      const now = new Date("2026-10-14T12:00:00Z");
      await db.insert(user).values({ id: "alice", name: "Alice", email: "alice@refund.test", emailVerified: true, createdAt: now, updatedAt: now }).run();
      await db.insert(workspaces).values({ id: "workspace", name: "Loti", createdAt: now }).run();
      await db.insert(workspaceMembers).values({ workspaceId: "workspace", userId: "alice", createdAt: now }).run();
      await db.insert(purchases).values({ id: "history", workspaceId: "workspace", name: "History", status: "finalized", createdBy: "alice", createdAt: now, finalizedAt: now }).run();
      await db.insert(purchaseItems).values({ id: "item", purchaseId: "history", sourceFavoriteId: null, personId: "alice", createdBy: "alice", name: "SSD", url: "https://example.test", platform: "other", visualKey: "ssd_nvme", variant: "1TB", notes: null, quantity: 2, unitPriceCents: 5000, cartStatus: "added", createdAt: now, updatedAt: now, sharingMode: "equal" }).run();
      await db.insert(purchaseCostTrackings).values({ id: "tracking", purchaseId: "history", workspaceId: "workspace", status: "open", revision: 7, createdBy: "alice", createdAt: now, updatedBy: "alice", updatedAt: now, closedAt: null, closedBy: null }).run();
      await client.execute({ sql: "INSERT INTO purchase_item_costs (id, tracking_id, purchase_item_id, item_order, effective_price_state, effective_price_unit_cents, china_freight_state, china_freight_unit_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", args: ["cost", "tracking", "item", 0, "known", 5000, "known", 100] });
      await db.insert(purchaseCostParticipants).values({ costItemId: "cost", personId: "alice", allocationOrder: 0, weightMode: "equal", weight: 1 }).run();
      await client.execute({ sql: "INSERT INTO purchase_cost_charges (id, tracking_id, package_id, charge_type, value_state, amount_cents, payment_method, fee_bps, payment_status, paid_at, paid_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", args: ["charge", "tracking", null, "products", null, null, "pix", 100, "paid", now.getTime(), "alice", now.getTime(), now.getTime()] });

      await migrate(db, { migrationsFolder: resolve("drizzle") });
      await migrate(db, { migrationsFolder: resolve("drizzle") });
      expect(await db.select().from(purchaseCostTrackings).get()).toMatchObject({ id: "tracking", status: "open", revision: 7 });
      expect(await db.select().from(purchaseCostOrders).get()).toMatchObject({ id: "legacy:tracking", trackingId: "tracking", kind: "original", state: "recorded", accountId: null });
      expect(await db.select().from(purchaseCostCharges).get()).toMatchObject({ id: "charge", orderId: "legacy:tracking", paymentModel: "legacy_single", paymentStatus: "paid", paymentMethod: "pix", feeBps: 100, paidAt: now });
      expect(await db.select().from(purchaseItemCosts).get()).toMatchObject({ id: "cost", orderId: "legacy:tracking", purchaseItemId: "item", additionalOrderItemId: null, effectivePriceUnitCents: 5000, nativeProductState: "unknown", nativeChinaState: "unknown", valuationVersion: 1 });
      expect(await db.select().from(purchaseItems).get()).toMatchObject({ id: "item", name: "SSD", quantity: 2, unitPriceCents: 5000, visualKey: "ssd_nvme" });
      expect((await client.execute("PRAGMA foreign_key_check")).rows).toHaveLength(0);
      expect(await client.execute("SELECT COUNT(*) AS count FROM purchase_cost_refunds")).toMatchObject({ rows: [expect.objectContaining({ count: 0 })] });
      expect(await client.execute("SELECT COUNT(*) AS count FROM purchase_cost_refund_participants")).toMatchObject({ rows: [expect.objectContaining({ count: 0 })] });
      expect(await client.execute("SELECT COUNT(*) AS count FROM purchase_cost_refund_events")).toMatchObject({ rows: [expect.objectContaining({ count: 0 })] });
    } finally {
      client.close();
      rmSync(previousMigrations, { recursive: true, force: true });
    }
  });

  it("locks legacy sent packages without inventing a shipment timestamp", async () => {
    const previousMigrations = join(tmpdir(), `loti-package-audit-migrations-${crypto.randomUUID()}`);
    const { db, client } = openDatabase(":memory:");
    try {
      mkdirSync(join(previousMigrations, "meta"), { recursive: true });
      const journalPath = resolve("drizzle/meta/_journal.json");
      const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
      journal.entries = journal.entries.slice(0, 11);
      writeFileSync(join(previousMigrations, "meta/_journal.json"), JSON.stringify(journal));
      for (const entry of journal.entries) copyFileSync(resolve(`drizzle/${entry.tag}.sql`), join(previousMigrations, `${entry.tag}.sql`));
      await migrate(db, { migrationsFolder: previousMigrations });

      const now = new Date("2026-10-14T12:00:00Z");
      await db.insert(user).values({ id: "alice", name: "Alice", email: "alice@package-migration.test", emailVerified: true, createdAt: now, updatedAt: now }).run();
      await db.insert(workspaces).values({ id: "workspace", name: "Loti", createdAt: now }).run();
      await db.insert(workspaceMembers).values({ workspaceId: "workspace", userId: "alice", createdAt: now }).run();
      await db.insert(purchases).values({ id: "history", workspaceId: "workspace", name: "History", status: "finalized", createdBy: "alice", createdAt: now, finalizedAt: now }).run();
      await db.insert(purchaseCostTrackings).values({ id: "tracking", purchaseId: "history", workspaceId: "workspace", status: "open", revision: 0, createdBy: "alice", createdAt: now, updatedBy: "alice", updatedAt: now, closedAt: null, closedBy: null }).run();
      await client.execute({ sql: "INSERT INTO purchase_packages (id, tracking_id, name, package_order, logistics_status, account_id, content_revision, content_sealed_at, content_sealed_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", args: ["sent-package", "tracking", "Pacote enviado", 0, "sent", null, 0, null, null, now.getTime(), now.getTime()] });

      await migrate(db, { migrationsFolder: resolve("drizzle") });
      const pkg = await db.select().from(purchasePackages).get();
      expect(pkg).toMatchObject({ id: "sent-package", logisticsStatus: "sent", contentSealSource: "legacy_locked", contentSealedAt: null, contentSealedBy: null });
      expect(await db.select().from(purchaseCostPackageEvents).all()).toHaveLength(0);
      expect((await client.execute("PRAGMA foreign_key_check")).rows).toHaveLength(0);
    } finally {
      client.close();
      rmSync(previousMigrations, { recursive: true, force: true });
    }
  });
});
