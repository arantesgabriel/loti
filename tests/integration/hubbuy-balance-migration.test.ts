import { copyFileSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { openDatabase } from "@/lib/db/connection";
import { financialOperations, hubbuyBalanceCreditShares, hubbuyBalanceEntries, hubbuyExternalItems, user, workspaceMembers, workspaces } from "@/lib/db/schema";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";

describe("HubBuy ledger migration", () => {
  it("preserves a reconciled credit and its individual shares across the ledger constraint rebuild", async () => {
    const previousMigrations = join(tmpdir(), `loti-hubbuy-ledger-migrations-${crypto.randomUUID()}`);
    const { db, client } = openDatabase(":memory:");
    try {
      mkdirSync(join(previousMigrations, "meta"), { recursive: true });
      const journalPath = resolve("drizzle/meta/_journal.json");
      const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
      journal.entries = journal.entries.slice(0, 9);
      writeFileSync(join(previousMigrations, "meta/_journal.json"), JSON.stringify(journal));
      for (const entry of journal.entries) copyFileSync(resolve(`drizzle/${entry.tag}.sql`), join(previousMigrations, `${entry.tag}.sql`));
      await migrate(db, { migrationsFolder: previousMigrations });

      const now = new Date("2026-10-17T12:00:00Z");
      await db.insert(user).values([
        { id: "alice", name: "Alice", email: "alice@ledger-migration.test", emailVerified: true, createdAt: now, updatedAt: now },
        { id: "bob", name: "Bob", email: "bob@ledger-migration.test", emailVerified: true, createdAt: now, updatedAt: now },
      ]).run();
      await db.insert(workspaces).values({ id: "workspace", name: "Loti", createdAt: now }).run();
      await db.insert(workspaceMembers).values([
        { workspaceId: "workspace", userId: "alice", createdAt: now },
        { workspaceId: "workspace", userId: "bob", createdAt: now },
      ]).run();
      const accountId = "account-before-rebuild", operationId = "operation-before-rebuild", entryId = "entry-before-rebuild";
      await db.insert(financialOperations).values({ id: operationId, workspaceId: "workspace", operationType: "account_reconciled", idempotencyKey: "reconcile-before-rebuild", payloadHash: "a".repeat(64), actorId: "alice", occurredAt: now, recordedAt: now, reason: "Fixture sintética de migração", reversalOfId: null, contextJson: JSON.stringify({ accountId }) }).run();
      // Use the historical columns: current Drizzle inserts also include future tombstones.
      await client.execute({ sql: "INSERT INTO hubbuy_accounts (id, workspace_id, label, currency, status, balance_cny_minor, revision, created_by, created_at, updated_by, updated_at, reconciled_by, reconciled_at) VALUES (?, 'workspace', 'Conta', 'CNY', 'active', 30000, 1, 'alice', ?, 'alice', ?, 'alice', ?)", args: [accountId, now.getTime(), now.getTime(), now.getTime()] });
      await db.insert(hubbuyBalanceEntries).values({ id: entryId, accountId, operationId, sequence: 0, direction: "credit", amountCnyMinor: 30_000, historicalBrlCents: 21_000, sourceType: "opening_balance", sourceId: `opening:${accountId}`, reversalOfEntryId: null, createdAt: now }).run();
      await db.insert(hubbuyBalanceCreditShares).values([
        { id: "share-alice-before-rebuild", creditEntryId: entryId, personId: "alice", allocationOrder: 0, amountCnyMinor: 20_000, historicalBrlCents: 14_000 },
        { id: "share-bob-before-rebuild", creditEntryId: entryId, personId: "bob", allocationOrder: 1, amountCnyMinor: 10_000, historicalBrlCents: 7_000 },
      ]).run();
      await client.execute({ sql: "INSERT INTO purchases (id, workspace_id, name, hubbuy_account, status, created_by, created_at, finalized_at) VALUES (?, ?, ?, NULL, 'finalized', ?, ?, ?)", args: ["purchase-before-qc-rebuild", "workspace", "Compra migrada", "alice", now.getTime(), now.getTime()] });
      await client.execute({ sql: "INSERT INTO purchase_items (id, purchase_id, source_favorite_id, person_id, created_by, name, url, platform, visual_key, variant, notes, quantity, unit_price_cents, cart_status, created_at, updated_at, sharing_mode) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 5000, 'added', ?, ?, 'equal')", args: ["item-before-qc-rebuild", "purchase-before-qc-rebuild", "alice", "alice", "Produto legado QC", "https://weidian.com/item.html?itemID=1", "weidian", "generic", "Black / M", now.getTime(), now.getTime()] });
      await client.execute({ sql: "INSERT INTO hubbuy_external_items (id, workspace_id, purchase_id, purchase_item_id, order_goods_id, order_goods_no, order_no, offer_id, channel, offer_url, sku_info, title, quantity, revision, confirmed_by, confirmed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, 1, 1, ?, ?, ?, ?)", args: ["external-before-qc-rebuild", "workspace", "purchase-before-qc-rebuild", "item-before-qc-rebuild", "GOODS-LEGACY", "ALT-LEGACY", "ORDER-LEGACY", "https://weidian.com/item.html?itemID=1", "Black / M", "Produto legado QC", "alice", now.getTime(), now.getTime(), now.getTime()] });
      const entryBefore = await db.select().from(hubbuyBalanceEntries).get();

      await migrate(db, { migrationsFolder: resolve("drizzle") });
      await migrate(db, { migrationsFolder: resolve("drizzle") });
      expect(await db.select().from(hubbuyBalanceEntries).all()).toMatchObject([
        { id: entryBefore!.id, amountCnyMinor: 30_000, historicalBrlCents: 21_000, sourceId: `opening:${accountId}` },
      ]);
      expect(await db.select().from(hubbuyBalanceCreditShares).all()).toHaveLength(2);
      expect(await db.select().from(hubbuyExternalItems).where(eq(hubbuyExternalItems.id, "external-before-qc-rebuild")).get()).toMatchObject({ id: "external-before-qc-rebuild", purchaseItemId: "item-before-qc-rebuild", additionalOrderItemId: null, orderGoodsId: "GOODS-LEGACY" });
      expect((await hubbuyBalanceServices(db, "alice").getAccountBalance(accountId)).reconciled).toBe(true);
      expect((await client.execute("PRAGMA foreign_key_check")).rows).toHaveLength(0);
      await expect(db.update(hubbuyBalanceEntries).set({ amountCnyMinor: 1 }).where(eq(hubbuyBalanceEntries.id, entryBefore!.id)).run()).rejects.toThrow();
    } finally {
      client.close();
      rmSync(previousMigrations, { recursive: true, force: true });
    }
  });
});
