import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import { openDatabase } from "@/lib/db/connection";
import { createServices } from "@/lib/domain/services";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import { purchaseCostOrderServices } from "@/lib/domain/purchase-cost-order-services";
import { packageCostServices } from "@/lib/domain/package-cost-services";
import { purchaseCostCharges, purchaseCostTrackings, user, workspaceMembers, workspaces } from "@/lib/db/schema";

describe("additional payment correction migration", () => {
  it("upgrades 0019 twice without changing payments, snapshots, ledger or package state", async () => {
    const tempRoot = resolve(tmpdir());
    const directory = mkdtempSync(join(tempRoot, "loti-order-correction-upgrade-"));
    const { db, client } = openDatabase(":memory:");
    try {
      mkdirSync(join(directory, "meta"));
      const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
      journal.entries = journal.entries.slice(0, 20);
      writeFileSync(join(directory, "meta/_journal.json"), JSON.stringify(journal));
      for (const entry of journal.entries) copyFileSync(resolve(`drizzle/${entry.tag}.sql`), join(directory, `${entry.tag}.sql`));
      await migrate(db, { migrationsFolder: directory });
      const now = new Date();
      await db.insert(user).values({ id: "alice", name: "Alice", email: "alice@correction.test", emailVerified: true, createdAt: now, updatedAt: now }).run();
      await db.insert(workspaces).values({ id: "workspace", name: "Loti", createdAt: now }).run();
      await db.insert(workspaceMembers).values({ workspaceId: "workspace", userId: "alice", createdAt: now }).run();
      const app = createServices(db, "alice");
      const purchase = await app.savePurchase({ name: "Upgrade sintético" });
      await app.saveManualItem({ name: "Original", url: "https://shop.test/original", quantity: 1, unitPriceCents: 1_000, personId: "alice" });
      await app.finalizePurchase(purchase!.id, true);
      const tracking = await db.select().from(purchaseCostTrackings).get();
      await db.update(purchaseCostCharges).set({ paymentMethod: "pix", feeBps: 100, paymentStatus: "paid", paidBy: "alice", paidAt: now }).where(eq(purchaseCostCharges.chargeType, "products")).run();
      const account = await hubbuyBalanceServices(db, "alice").createAccount({ workspaceId: "workspace", idempotencyKey: "upgrade-account", label: "Conta do upgrade", confirmZeroBalance: true });
      const orders = purchaseCostOrderServices(db, "alice");
      const draft = await orders.createDraft(tracking!.id, { expectedRevision: tracking!.revision, idempotencyKey: "upgrade-draft", accountId: account.accountId, items: [{ name: "Adicional", url: "https://shop.test/additional", platform: "Taobao", visualKey: "generic", quantity: 1, itemOrder: 0, nativeProductState: "known", nativeProductCnyMinor: 1_000, nativeChinaState: "no_charge", nativeChinaCnyMinor: null, participants: [{ personId: "alice", weightMode: "equal", weight: 1 }] }] });
      await orders.recordExternalPayment(tracking!.id, draft.orderId, { expectedRevision: tracking!.revision + 1, idempotencyKey: "upgrade-paid", paymentMethod: "pix", principalBrlCents: 800, conversionCnyMinor: 1_000, conversionBrlCents: 800 });
      const tables = ["purchase_items", "purchase_item_costs", "purchase_cost_orders", "purchase_cost_charges", "purchase_payment_components", "purchase_payment_allocations", "purchase_packages", "purchase_package_items", "hubbuy_balance_entries", "financial_operations"];
      const before = await Promise.all(tables.map(async table => (await client.execute(`SELECT * FROM ${table} ORDER BY rowid`)).rows));
      await migrate(db, { migrationsFolder: resolve("drizzle") });
      await migrate(db, { migrationsFolder: resolve("drizzle") });
      for (let index = 0; index < tables.length; index++) expect((await client.execute(`SELECT * FROM ${tables[index]} ORDER BY rowid`)).rows).toEqual(before[index]);
      expect((await client.execute("SELECT * FROM purchase_order_corrections")).rows).toHaveLength(0);
      expect((await client.execute("PRAGMA foreign_key_check")).rows).toHaveLength(0);
      const detail = await packageCostServices(db, "alice").getTracking(tracking!.id);
      expect(detail.productOrders.find(order => order.id === draft.orderId)).toMatchObject({ totalCostBrlCents: 808 });
      expect(detail.productsCharge).toMatchObject({ paymentStatus: "paid", feeBps: 100, paidBy: "alice", paidAt: now });
    } finally {
      client.close();
      const fromTemp = relative(tempRoot, resolve(directory));
      if (fromTemp.startsWith("..") || isAbsolute(fromTemp) || !fromTemp.startsWith("loti-order-correction-upgrade-")) throw new Error("Unsafe migration test cleanup path");
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
