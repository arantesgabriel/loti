import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { openDatabase } from "@/lib/db/connection";
import { purchaseCostCharges, purchaseCostParticipants, purchaseCostTrackings, purchaseItemCosts, purchaseItems, purchases, user, workspaceMembers, workspaces } from "@/lib/db/schema";

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
      await db.insert(purchaseItemCosts).values({ id: "cost", trackingId: "tracking", purchaseItemId: "item", itemOrder: 0, effectivePriceState: "known", effectivePriceUnitCents: 5000, chinaFreightState: "known", chinaFreightUnitCents: 100 }).run();
      await db.insert(purchaseCostParticipants).values({ costItemId: "cost", personId: "alice", allocationOrder: 0, weightMode: "equal", weight: 1 }).run();
      await db.insert(purchaseCostCharges).values({ id: "charge", trackingId: "tracking", packageId: null, chargeType: "products", valueState: null, amountCents: null, paymentMethod: "pix", feeBps: 100, paymentStatus: "paid", paidAt: now, paidBy: "alice", createdAt: now, updatedAt: now }).run();

      await migrate(db, { migrationsFolder: resolve("drizzle") });
      await migrate(db, { migrationsFolder: resolve("drizzle") });
      expect(await db.select().from(purchaseCostTrackings).get()).toMatchObject({ id: "tracking", status: "open", revision: 7 });
      expect(await db.select().from(purchaseCostCharges).get()).toMatchObject({ id: "charge", paymentStatus: "paid", paymentMethod: "pix", feeBps: 100, paidAt: now });
      expect(await db.select().from(purchaseItems).get()).toMatchObject({ id: "item", name: "SSD", quantity: 2, unitPriceCents: 5000, visualKey: "ssd_nvme" });
      expect(await client.execute("SELECT COUNT(*) AS count FROM purchase_cost_refunds")).toMatchObject({ rows: [expect.objectContaining({ count: 0 })] });
      expect(await client.execute("SELECT COUNT(*) AS count FROM purchase_cost_refund_participants")).toMatchObject({ rows: [expect.objectContaining({ count: 0 })] });
      expect(await client.execute("SELECT COUNT(*) AS count FROM purchase_cost_refund_events")).toMatchObject({ rows: [expect.objectContaining({ count: 0 })] });
    } finally {
      client.close();
      rmSync(previousMigrations, { recursive: true, force: true });
    }
  });
});
