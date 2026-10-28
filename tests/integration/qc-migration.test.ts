import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getTableColumns, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { openDatabase } from "@/lib/db/connection";
import { hubbuyExternalItems, purchaseCostCharges, purchaseCostRefundEvents, purchaseCostRefundParticipants, purchaseCostRefunds, purchaseCostTrackings, purchaseItemCosts, purchaseItems, purchases, qcEvents, qcImagePreviews, qcImageSources, qcImages, qcImports, qcPresentations, user, workspaceMembers, workspaces } from "@/lib/db/schema";
import { packageCostServices } from "@/lib/domain/package-cost-services";
import {initializeLegacyPurchaseCosts} from "@/lib/domain/purchase-cost-initialization";
import {legacyMigrationsFolder} from "../fixtures/orders-transition/legacy-migrations";

describe("QC migration from the refund baseline", () => {
  it("preserves an open tracking, a closed tracking, snapshots, paid fees and received refund events", async () => {
    const migrations = join(tmpdir(), `loti-qc-migrations-${crypto.randomUUID()}`);
    const fixtureConnection = openDatabase(":memory:"), legacy = openDatabase(":memory:");
    let { db, client } = fixtureConnection;
    // Compare only historical columns against the pre-migration database.
    const legacyRefundColumns = Object.fromEntries(Object.entries(getTableColumns(purchaseCostRefunds)).filter(([key]) => !["requestedProductCnyMinor", "requestedChinaCnyMinor"].includes(key)));
    try {
      mkdirSync(join(migrations, "meta"), { recursive: true });
      const journal = JSON.parse(readFileSync(resolve("drizzle/meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
      journal.entries = journal.entries.slice(0, 16); // Current refund/order baseline, before QC target expansion and reconciliation append-only tables.
      writeFileSync(join(migrations, "meta/_journal.json"), JSON.stringify(journal));
      for (const entry of journal.entries) copyFileSync(resolve(`drizzle/${entry.tag}.sql`), join(migrations, `${entry.tag}.sql`));
      await migrate(legacy.db, { migrationsFolder: migrations });
      // Build the financial fixture with the current services on their matching
      // schema, then copy historical columns into the actual pre-QC database.
      // Current readers must never be run against an unmigrated account schema.
      await migrate(db, { migrationsFolder: legacyMigrationsFolder() });
      const now = new Date("2026-10-14T12:00:00.000Z");
      await db.insert(user).values([{ id: "alice", name: "Alice", email: "alice@qc-migration.test", emailVerified: true, createdAt: now, updatedAt: now }, { id: "bob", name: "Bob", email: "bob@qc-migration.test", emailVerified: true, createdAt: now, updatedAt: now }]).run();
      await db.insert(workspaces).values({ id: "workspace", name: "Loti", createdAt: now }).run();
      await db.insert(workspaceMembers).values([{ workspaceId: "workspace", userId: "alice", createdAt: now }, { workspaceId: "workspace", userId: "bob", createdAt: now }]).run();
      await db.insert(purchases).values([
        { id: "refund-history", workspaceId: "workspace", name: "Refund history", status: "finalized", createdBy: "alice", createdAt: now, finalizedAt: now },
        { id: "open-history", workspaceId: "workspace", name: "Open history", status: "finalized", createdBy: "alice", createdAt: now, finalizedAt: now },
      ]).run();
      await db.insert(purchaseItems).values([
        { id: "refund-item", purchaseId: "refund-history", sourceFavoriteId: null, personId: "bob", createdBy: "bob", name: "SSD", url: "https://weidian.com/item.html?itemID=1", platform: "weidian", visualKey: "ssd_nvme", variant: "2TB", notes: null, quantity: 2, unitPriceCents: 10000, cartStatus: "added", sharingMode: "equal", createdAt: now, updatedAt: now },
        { id: "open-item", purchaseId: "open-history", sourceFavoriteId: null, personId: "alice", createdBy: "alice", name: "Mouse", url: "https://weidian.com/item.html?itemID=2", platform: "weidian", visualKey: "accessory", variant: null, notes: null, quantity: 1, unitPriceCents: 5000, cartStatus: "added", sharingMode: "equal", createdAt: now, updatedAt: now },
      ]).run();

      const costs = packageCostServices(db, "alice",initializeLegacyPurchaseCosts);
      const closed = await costs.startTracking("refund-history");
      let detail = await costs.getTracking(closed.id);
      detail = await costs.saveItemCosts(closed.id, { expectedRevision: detail.tracking.revision, itemId: detail.items[0]!.id, effectivePriceState: "known", effectivePriceUnitCents: 10000, chinaFreightState: "known", chinaFreightUnitCents: 1000 });
      detail = await costs.saveCharge(closed.id, detail.productsCharge!.id, { expectedRevision: detail.tracking.revision, chargeType: "products", paymentMethod: "pix" });
      detail = await costs.markChargePaid(closed.id, detail.productsCharge!.id, { expectedRevision: detail.tracking.revision });
      detail = await costs.requestRefund(closed.id, { expectedRevision: detail.tracking.revision, costItemId: detail.items[0]!.id, quantity: 2, requestedProductCents: 20000, requestedChinaCents: 2000, reason: "Cancelamento registrado antes do QC", packageRemovals: [{ packageId: detail.packages[0]!.id, quantity: 2 }], unassignedQuantity: 0 });
      detail = await costs.receiveRefund(closed.id, detail.refunds[0]!.id, { expectedRevision: detail.tracking.revision, receivedProductCents: 19000, receivedChinaCents: 1800, confirmed: true });
      detail = await costs.saveCharge(closed.id, detail.packages[0]!.brazilFreightCharge!.id, { expectedRevision: detail.tracking.revision, chargeType: "brazil_freight", valueState: "no_charge", amountCents: null, paymentMethod: null });
      detail = await costs.saveCharge(closed.id, detail.packages[0]!.customsCharge!.id, { expectedRevision: detail.tracking.revision, chargeType: "customs", valueState: "no_charge", amountCents: null });
      detail = await costs.closeTracking(closed.id, { expectedRevision: detail.tracking.revision, confirmed: true });
      const open = await costs.startTracking("open-history");

      await db.run(sql`INSERT INTO hubbuy_external_items (id, workspace_id, purchase_id, purchase_item_id, order_goods_id, order_goods_no, order_no, offer_id, channel, offer_url, sku_info, title, quantity, revision, confirmed_by, confirmed_at, created_at, updated_at) VALUES (${"qc-legacy-external"}, ${"workspace"}, ${"refund-history"}, ${"refund-item"}, ${"legacy-goods"}, NULL, ${"legacy-order"}, NULL, NULL, NULL, ${"2TB"}, ${"SSD"}, ${2}, ${0}, ${"alice"}, ${now.getTime()}, ${now.getTime()}, ${now.getTime()})`);
      await db.insert(qcImages).values({ id: "qc-legacy-image", externalItemId: "qc-legacy-external", sourceUrl: "https://scm.hubbuy.app/qc/legacy.png", sourceUrlHash: "legacy-source-hash", contentSha256: "a".repeat(64), r2Key: "qc/legacy/legacy.png", status: "ready", deleteState: "none", mimeType: "image/png", byteSize: 100, width: 10, height: 10, ordinal: 0, revision: 1, claimToken: null, claimExpiresAt: null, errorCode: null, createdBy: "alice", createdAt: now, updatedAt: now, deletedAt: null, deletedBy: null }).run();
      await db.insert(qcImageSources).values({ id: "qc-legacy-source", importId: null, externalItemId: "qc-legacy-external", imageId: "qc-legacy-image", sourceUrl: "https://scm.hubbuy.app/qc/legacy.png", sourceUrlHash: "legacy-source-hash", ordinal: 0, state: "ready", attempts: 1, bytesReserved: 0, bytesConsumed: 100, errorCode: null, createdAt: now, updatedAt: now }).run();
      await db.insert(qcEvents).values({ id: "qc-legacy-event", workspaceId: "workspace", purchaseId: "refund-history", actorId: "alice", eventType: "QC_IMPORT", resultCode: "CONFIRMED", contextJson: JSON.stringify({ importId: "legacy" }), createdAt: now }).run();

      for (const table of ["user", "workspaces", "workspace_members", "purchases", "purchase_items", "workspace_cost_settings", "purchase_cost_trackings", "financial_operations", "purchase_cost_orders", "purchase_item_costs", "purchase_cost_participants", "purchase_packages", "purchase_package_items", "purchase_cost_charges", "purchase_cost_refunds", "purchase_cost_refund_participants", "purchase_cost_refund_events", "hubbuy_external_items", "qc_images", "qc_image_sources", "qc_events"]) {
        const columns = (await legacy.client.execute(`PRAGMA table_info("${table}")`)).rows.map(row => `"${row.name}"`);
        const rows = await client.execute(`SELECT ${columns.join(",")} FROM "${table}"`);
        for (const row of rows.rows) await legacy.client.execute({ sql: `INSERT INTO "${table}" (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`, args: columns.map(column => row[column.slice(1, -1)]) });
      }
      fixtureConnection.client.close();
      db = legacy.db; client = legacy.client;
      const before = {
        tracking: await db.select().from(purchaseCostTrackings).orderBy(purchaseCostTrackings.id).all(),
        items: await db.select().from(purchaseItems).orderBy(purchaseItems.id).all(),
        costs: await db.select().from(purchaseItemCosts).orderBy(purchaseItemCosts.id).all(),
        charges: await db.select().from(purchaseCostCharges).orderBy(purchaseCostCharges.id).all(),
        refunds: await db.select(legacyRefundColumns).from(purchaseCostRefunds).orderBy(purchaseCostRefunds.id).all(),
        participants: await db.select().from(purchaseCostRefundParticipants).all(),
        events: await db.select().from(purchaseCostRefundEvents).orderBy(purchaseCostRefundEvents.eventOrder).all(),
        qcImages: await db.select().from(qcImages).all(),
        qcSources: await db.select().from(qcImageSources).all(),
        qcEvents: await db.select().from(qcEvents).all(),
      };
      expect(before.tracking.find(row => row.id === closed.id)?.status).toBe("closed");
      expect(before.tracking.find(row => row.id === open.id)?.status).toBe("open");
      expect(before.refunds[0]?.status).toBe("received");

      await migrate(db, { migrationsFolder: resolve("drizzle") });
      await migrate(db, { migrationsFolder: resolve("drizzle") });
      expect({
        tracking: await db.select().from(purchaseCostTrackings).orderBy(purchaseCostTrackings.id).all(),
        items: await db.select().from(purchaseItems).orderBy(purchaseItems.id).all(),
        costs: await db.select().from(purchaseItemCosts).orderBy(purchaseItemCosts.id).all(),
        charges: await db.select().from(purchaseCostCharges).orderBy(purchaseCostCharges.id).all(),
        refunds: await db.select(legacyRefundColumns).from(purchaseCostRefunds).orderBy(purchaseCostRefunds.id).all(),
        participants: await db.select().from(purchaseCostRefundParticipants).all(),
        events: await db.select().from(purchaseCostRefundEvents).orderBy(purchaseCostRefundEvents.eventOrder).all(),
        qcImages: await db.select().from(qcImages).all(),
        qcSources: await db.select().from(qcImageSources).all(),
        qcEvents: await db.select().from(qcEvents).all(),
      }).toEqual(before);
      expect(await db.select({ product: purchaseCostRefunds.requestedProductCnyMinor, china: purchaseCostRefunds.requestedChinaCnyMinor }).from(purchaseCostRefunds)).toEqual([{ product: null, china: null }]);
      expect((await client.execute("PRAGMA foreign_key_check")).rows).toHaveLength(0);
      expect(await db.select().from(qcImports).all()).toEqual([]);
      expect(await db.select().from(qcPresentations).all()).toEqual([]);
      expect(await db.select().from(qcImagePreviews).all()).toEqual([]);
      expect(await db.select().from(hubbuyExternalItems)).toMatchObject([{ id: "qc-legacy-external", purchaseId: "refund-history", purchaseItemId: "refund-item", additionalOrderItemId: null, orderGoodsId: "legacy-goods", title: "SSD", quantity: 2 }]);
      const reread = await packageCostServices(db, "alice").getTracking(closed.id);
      expect(detail.tracking.status).toBe("closed");
      expect(reread).toMatchObject({ tracking: { status: "closed" }, refunds: [{ status: "received", receivedProductCents: 19000, receivedChinaCents: 1800 }] });
    } finally {
      fixtureConnection.client.close(); legacy.client.close();
      client.close();
      rmSync(migrations, { recursive: true, force: true });
    }
  });
});
