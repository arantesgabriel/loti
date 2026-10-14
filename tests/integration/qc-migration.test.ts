import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { openDatabase } from "@/lib/db/connection";
import { purchaseCostCharges, purchaseCostRefundEvents, purchaseCostRefundParticipants, purchaseCostRefunds, purchaseCostTrackings, purchaseItemCosts, purchaseItems, purchases, user, workspaceMembers, workspaces, qcImages, qcImports } from "@/lib/db/schema";
import { packageCostServices } from "@/lib/domain/package-cost-services";

describe("QC migration from the refund baseline", () => {
  it("preserves an open tracking, a closed tracking, snapshots, paid fees and received refund events", async () => {
    const migrations = join(tmpdir(), `loti-qc-migrations-${crypto.randomUUID()}`), { db, client } = openDatabase(":memory:");
    try {
      mkdirSync(join(migrations, "meta"), { recursive: true });
      const journal = JSON.parse(readFileSync(resolve("drizzle/meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
      journal.entries = journal.entries.slice(0, 6); // Existing migrations through 0005, including product refunds.
      writeFileSync(join(migrations, "meta/_journal.json"), JSON.stringify(journal));
      for (const entry of journal.entries) copyFileSync(resolve(`drizzle/${entry.tag}.sql`), join(migrations, `${entry.tag}.sql`));
      await migrate(db, { migrationsFolder: migrations });
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

      const costs = packageCostServices(db, "alice");
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

      const before = {
        tracking: await db.select().from(purchaseCostTrackings).orderBy(purchaseCostTrackings.id).all(),
        items: await db.select().from(purchaseItems).orderBy(purchaseItems.id).all(),
        costs: await db.select().from(purchaseItemCosts).orderBy(purchaseItemCosts.id).all(),
        charges: await db.select().from(purchaseCostCharges).orderBy(purchaseCostCharges.id).all(),
        refunds: await db.select().from(purchaseCostRefunds).orderBy(purchaseCostRefunds.id).all(),
        participants: await db.select().from(purchaseCostRefundParticipants).all(),
        events: await db.select().from(purchaseCostRefundEvents).orderBy(purchaseCostRefundEvents.eventOrder).all(),
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
        refunds: await db.select().from(purchaseCostRefunds).orderBy(purchaseCostRefunds.id).all(),
        participants: await db.select().from(purchaseCostRefundParticipants).all(),
        events: await db.select().from(purchaseCostRefundEvents).orderBy(purchaseCostRefundEvents.eventOrder).all(),
      }).toEqual(before);
      expect(await db.select().from(qcImports).all()).toEqual([]);
      expect(await db.select().from(qcImages).all()).toEqual([]);
      const reread = await packageCostServices(db, "alice").getTracking(closed.id);
      expect(detail.tracking.status).toBe("closed");
      expect(reread).toMatchObject({ tracking: { status: "closed" }, refunds: [{ status: "received", receivedProductCents: 19000, receivedChinaCents: 1800 }] });
    } finally {
      client.close();
      rmSync(migrations, { recursive: true, force: true });
    }
  });
});
