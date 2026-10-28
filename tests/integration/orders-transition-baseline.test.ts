import { describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { legacyMigrationsFolder } from "../fixtures/orders-transition/legacy-migrations";
import { openDatabase } from "@/lib/db/connection";
import { user, workspaceMembers, workspaces } from "@/lib/db/schema";
import { buildLegacyScenario } from "../fixtures/orders-transition/scenario";
import { compareLegacyScenario } from "../fixtures/orders-transition/compare";
import { seedScenarioQc } from "../fixtures/orders-transition/qc";
import { qcServices } from "@/lib/domain/qc-services";
import type { QcStorage } from "@/lib/qc/storage";

describe("orders transition legacy contract", () => {
  it("reproduces exact anchors through real services, FIFO, corrections and private synthetic QC", async () => {
    const { db, client } = openDatabase(":memory:");
    try {
      await migrate(db, { migrationsFolder: legacyMigrationsFolder() });
      const people = ["qa-a", "qa-b", "qa-c", "qa-d"], now = new Date();
      await db.insert(user).values([...people, "qa-outsider", "qa-foreign"].map(id => ({ id, name: id, email: `${id}@loti.test`, emailVerified: true, createdAt: now, updatedAt: now }))).run();
      await db.insert(workspaces).values([{ id: "loti", name: "Loti QA", createdAt: now }, { id: "foreign", name: "Foreign QA", createdAt: now }]).run();
      await db.insert(workspaceMembers).values([...people.map(userId => ({ workspaceId: "loti", userId, createdAt: now })), { workspaceId: "foreign", userId: "qa-foreign", createdAt: now }]).run();
      const identity = await buildLegacyScenario(db, people);
      const before = await compareLegacyScenario(db, identity, { mode: "capture" });
      expect(before.failures).toEqual([]);
      expect(Object.keys(before.inventory).length).toBeGreaterThan(40);
      const objects = new Map<string, { bytes: Buffer; sha256: string }>();
      const storage: QcStorage = {
        async put(object) { objects.set(object.key, object); },
        async get(key) { const object = objects.get(key); if (!object) throw new Error("Missing synthetic object"); return object.bytes; },
        async head(key) { const object = objects.get(key); return object ? { exists: true, sha256: object.sha256 } : { exists: false }; },
        async delete(key) { objects.delete(key); }, async signRead() { throw new Error("No external URLs in fixture"); },
      };
      await seedScenarioQc(db, identity, storage);
      const after = await compareLegacyScenario(db, identity, { mode: "capture" });
      expect(after.failures).toEqual([]);
      for (const name of ["purchaseItems", "purchaseItemParticipants", "purchasePaymentComponents", "purchasePaymentAllocations", "hubbuyBalanceEntries", "hubbuyBalanceConsumptions", "purchaseCostRefunds"]) expect(after.inventory[name]).toEqual(before.inventory[name]);
      const reader = qcServices(db, people[1], { storage });
      const summary = await reader.getQcSummary(identity.purchaseId);
      expect(summary.counts).toHaveLength(6);
      expect(summary.counts.reduce((sum, row) => sum + row.count, 0)).toBe(24);
      await expect(qcServices(db, "qa-outsider", { storage }).getQcSummary(identity.purchaseId)).rejects.toMatchObject({ status: 403 });
      await expect(qcServices(db, "qa-foreign", { storage }).getQcSummary(identity.purchaseId)).rejects.toMatchObject({ status: 403 });
      expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
      const repeated = await compareLegacyScenario(db, identity, { mode: "verify", baseline: after });
      expect(repeated.inventory).toEqual(after.inventory);
      await migrate(db,{migrationsFolder:"./drizzle"});
      const upgraded=await compareLegacyScenario(db,identity,{mode:"verify",baseline:after});
      expect(upgraded.failures).toEqual([]);
      const {orderWarehousePositions,logisticsPackages,logisticsReservations}=await import("@/lib/db/schema");
      expect((await db.select().from(orderWarehousePositions).all()).every(p=>p.reviewState==="pending_review" && p.receivedUnits.length===0)).toBe(true);
      expect((await db.select().from(logisticsPackages).all())[0].reviewState).toBe("pending_review");
      expect(await db.select().from(logisticsReservations).all()).toHaveLength(26);
      await expect(client.execute("UPDATE purchase_packages SET name='unsafe old writer'")).rejects.toThrow("ORDERS_WORKFLOW_UPGRADE_REQUIRED");
      await migrate(db,{migrationsFolder:"./drizzle"});
      expect((await compareLegacyScenario(db,identity,{mode:"verify",baseline:after})).failures).toEqual([]);
      expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
    } finally { client.close(); }
  }, 60000);
});
