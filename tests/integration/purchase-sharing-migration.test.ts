import { mkdtempSync, copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { openDatabase } from "@/lib/db/connection";

describe("purchase cost-sharing migration", () => {
  it("backfills active and finalized legacy rows without changing their item data", async () => {
    const previousMigrations = mkdtempSync(join(tmpdir(), "loti-sharing-old-migrations-"));
    const { db, client } = openDatabase(":memory:");
    try {
      mkdirSync(join(previousMigrations, "meta"));
      const metadataPath = resolve("drizzle/meta/_journal.json");
      const journal = JSON.parse(readFileSync(metadataPath, "utf8")) as { entries: { tag: string }[] };
      journal.entries = journal.entries.slice(0, 3);
      writeFileSync(join(previousMigrations, "meta/_journal.json"), JSON.stringify(journal));
      for (const entry of journal.entries) copyFileSync(resolve(`drizzle/${entry.tag}.sql`), join(previousMigrations, `${entry.tag}.sql`));

      await migrate(db, { migrationsFolder: previousMigrations });
      const now = Date.now();
      await client.execute({ sql: "INSERT INTO `user` (`id`,`name`,`email`,`email_verified`,`created_at`,`updated_at`) VALUES ('alice','Alice','alice@legacy.test',1,?,?),('bob','Bob','bob@legacy.test',1,?,?)", args: [now, now, now, now] });
      await client.execute({ sql: "INSERT INTO `workspaces` (`id`,`name`,`created_at`) VALUES ('w','Loti',?)", args: [now] });
      await client.execute({ sql: "INSERT INTO `workspace_members` (`workspace_id`,`user_id`,`created_at`) VALUES ('w','alice',?),('w','bob',?)", args: [now, now] });
      await client.execute({ sql: "INSERT INTO `purchases` (`id`,`workspace_id`,`name`,`status`,`created_by`,`created_at`,`finalized_at`) VALUES ('active','w','Active','active','alice',?,NULL),('history','w','History','finalized','alice',?,?)", args: [now, now, now] });
      await client.execute({
        sql: "INSERT INTO `purchase_items` (`id`,`purchase_id`,`source_favorite_id`,`person_id`,`created_by`,`name`,`url`,`platform`,`visual_key`,`variant`,`notes`,`quantity`,`unit_price_cents`,`cart_status`,`created_at`,`updated_at`) VALUES ('active-item','active',NULL,'alice','alice','RAM','https://example.test/ram','other','ram','DDR5','active notes',1,30000,'pending',?,?),('history-item','history',NULL,'bob','alice','SSD','https://example.test/ssd','other','ssd_nvme','1TB','historical notes',2,5000,'added',?,?)",
        args: [now, now, now, now],
      });

      await migrate(db, { migrationsFolder: resolve("drizzle") });
      const items = await client.execute("SELECT `id`,`purchase_id`,`person_id`,`name`,`visual_key`,`variant`,`notes`,`quantity`,`unit_price_cents`,`cart_status`,`sharing_mode` FROM `purchase_items` ORDER BY `id`");
      expect(items.rows).toEqual([
        expect.objectContaining({ id: "active-item", purchase_id: "active", person_id: "alice", name: "RAM", visual_key: "ram", variant: "DDR5", notes: "active notes", quantity: 1, unit_price_cents: 30_000, cart_status: "pending", sharing_mode: "equal" }),
        expect.objectContaining({ id: "history-item", purchase_id: "history", person_id: "bob", name: "SSD", visual_key: "ssd_nvme", variant: "1TB", notes: "historical notes", quantity: 2, unit_price_cents: 5_000, cart_status: "added", sharing_mode: "equal" }),
      ]);
      const participants = await client.execute("SELECT `purchase_item_id`,`person_id`,`allocation_order`,`percentage_bps`,`amount_cents` FROM `purchase_item_participants` ORDER BY `purchase_item_id`");
      expect(participants.rows).toEqual([
        expect.objectContaining({ purchase_item_id: "active-item", person_id: "alice", allocation_order: 0, percentage_bps: null, amount_cents: null }),
        expect.objectContaining({ purchase_item_id: "history-item", person_id: "bob", allocation_order: 0, percentage_bps: null, amount_cents: null }),
      ]);
    } finally {
      client.close();
      rmSync(previousMigrations, { recursive: true, force: true });
    }
  });
});
