import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createServices } from "@/lib/domain/services";
import { openDatabase } from "@/lib/db/connection";
import { user, workspaces, workspaceMembers, purchaseItems, purchaseItemParticipants } from "@/lib/db/schema";

describe("purchase cost-sharing transaction boundaries", () => {
  it("rolls back a product when participant insertion fails, and serializes edits with finalization across connections", async () => {
    const directory = mkdtempSync(join(tmpdir(), "loti-sharing-concurrency-"));
    const first = openDatabase(`file:${join(directory, "loti.sqlite")}`);
    let second: ReturnType<typeof openDatabase> | undefined;
    let recovery: ReturnType<typeof openDatabase> | undefined;
    try {
      await migrate(first.db, { migrationsFolder: "./drizzle" });
      const now = new Date();
      await first.db.insert(user).values([
        { id: "alice", name: "Alice", email: "alice@sharing.test", emailVerified: true, createdAt: now, updatedAt: now },
        { id: "bob", name: "Bob", email: "bob@sharing.test", emailVerified: true, createdAt: now, updatedAt: now },
      ]).run();
      await first.db.insert(workspaces).values({ id: "workspace", name: "Loti", createdAt: now }).run();
      await first.db.insert(workspaceMembers).values([
        { workspaceId: "workspace", userId: "alice", createdAt: now },
        { workspaceId: "workspace", userId: "bob", createdAt: now },
      ]).run();
      second = openDatabase(`file:${join(directory, "loti.sqlite")}`);
      const alice = createServices(first.db, "alice"), bob = createServices(second.db, "bob");
      const purchase = await alice.savePurchase({ name: "Concurrent round" });
      const original = await alice.saveManualItem({ name: "Original RAM", url: "https://example.test/ram", personId: "alice", quantity: 1, unitPriceCents: 30_000 });
      expect(original).toBeTruthy();

      await first.client.execute("CREATE TRIGGER injected_participant_failure BEFORE INSERT ON purchase_item_participants BEGIN SELECT RAISE(ABORT, 'injected participant failure'); END");
      await expect(alice.saveManualItem({
        name: "Must roll back", url: "https://example.test/rollback", quantity: 1, unitPriceCents: 30_000, sharingMode: "equal",
        participants: [{ personId: "alice" }, { personId: "bob" }],
      })).rejects.toThrow();
      await first.client.execute("DROP TRIGGER injected_participant_failure");
      expect(await first.db.select().from(purchaseItems)).toHaveLength(1);
      expect(await first.db.select().from(purchaseItemParticipants)).toHaveLength(1);

      recovery = openDatabase(`file:${join(directory, "loti.sqlite")}`);
      const concurrentAlice = createServices(recovery.db, "alice");
      const edit = bob.saveManualItem({
        name: "Edited RAM", url: "https://example.test/ram", quantity: 1, unitPriceCents: 60_000, sharingMode: "equal",
        participants: [{ personId: "alice" }, { personId: "bob" }],
      }, original!.id);
      const finalize = concurrentAlice.finalizePurchase(purchase!.id, true);
      const [editResult, finalizeResult] = await Promise.allSettled([edit, finalize]);
      expect(finalizeResult.status, finalizeResult.status === "rejected" ? String(finalizeResult.reason) : undefined).toBe("fulfilled");
      const stored = (await concurrentAlice.getData()).items.find(item => item.id === original!.id)!;
      const storedParticipants = await first.db.select().from(purchaseItemParticipants);
      expect(stored.purchaseId).toBe(purchase!.id);
      if (editResult.status === "fulfilled") {
        expect(stored.name).toBe("Edited RAM");
        expect(stored.participants.map(participant => [participant.personId, participant.shareCents])).toEqual([["alice", 30_000], ["bob", 30_000]]);
        expect(storedParticipants).toHaveLength(2);
      } else {
        expect(String(editResult.reason)).toMatch(/finalizada/);
        expect(stored.name).toBe("Original RAM");
        expect(stored.participants.map(participant => participant.personId)).toEqual(["alice"]);
        expect(storedParticipants).toHaveLength(1);
      }
      await expect(bob.saveManualItem({ name: "Late edit", url: "https://example.test/ram", personId: "bob", quantity: 1, unitPriceCents: 1 }, original!.id)).rejects.toThrow(/finalizada/);
    } finally {
      recovery?.client.close();
      second?.client.close();
      first.client.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
