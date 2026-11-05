import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { and, eq } from "drizzle-orm";
import { fixture, type Fixture } from "./helpers";
import { openDatabase } from "@/lib/db/connection";
import { ensurePersonalWorkspace } from "@/lib/domain/personal-workspaces";
import { invitationService } from "@/lib/domain/invitations";
import { userPreferences, favorites, workspaceMembers, workspaces } from "@/lib/db/schema";
import { createServices } from "@/lib/domain/services";
import { authorization } from "@/lib/domain/authorization";

let f: Fixture;
beforeEach(async () => { f = await fixture(":memory:", "orders"); });
afterEach(() => { if (f) f.client.close(); });

describe("personal workspaces", () => {
  it("provisions one private space and lets its owner read and save private favorites", async () => {
    const ensured = await ensurePersonalWorkspace(f.db, "outsider");
    expect(ensured.created).toBe(true);
    expect(ensured.workspace).toMatchObject({ kind: "personal", ownerUserId: "outsider" });
    expect(await f.db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, ensured.workspace.id)).all()).toEqual([]);

    const data = await f.outsider.getData();
    expect(data.workspaceId).toBe(ensured.workspace.id);
    expect(data.members).toEqual([{ id: "outsider", name: "outsider" }]);
    expect(data.purchases).toEqual([]);

    const collection = await f.outsider.saveCollection({ name: "Privados" });
    const saved = await f.outsider.saveFavorite({ name: "Fone privado", url: "https://example.com/fone", priceCents: null, variant: null, notes: null, collectionId: collection!.id });
    expect(saved).toMatchObject({ workspaceId: ensured.workspace.id, ownerId: "outsider", collectionId: collection!.id, name: "Fone privado" });
    await expect(f.bob.getData()).resolves.toMatchObject({ favorites: [] });
    await expect(f.bob.getData()).resolves.toMatchObject({ collections: [] });
    await expect(createServices(f.db, "bob").saveFavorite({ name: "Tentativa", url: "https://example.com/t", priceCents: null, variant: null, notes: null, collectionId: null }, saved!.id)).rejects.toThrow("acesso");
    await expect(f.bob.deleteCollection(collection!.id)).rejects.toThrow("acesso");
  });

  it("is idempotent and preserves the valid active group and other preferences", async () => {
    await f.db.insert(userPreferences).values({ userId: "alice", favoritesView: "cards", activeWorkspaceId: "workspace", createdAt: new Date(), updatedAt: new Date() }).run();
    const first = await ensurePersonalWorkspace(f.db, "alice");
    const second = await ensurePersonalWorkspace(f.db, "alice");
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(first.workspace.id).toBe(second.workspace.id);
    expect(await f.db.select().from(workspaces).where(and(eq(workspaces.kind, "personal"), eq(workspaces.ownerUserId, "alice"))).all()).toHaveLength(1);
    expect(await f.db.select().from(userPreferences).where(eq(userPreferences.userId, "alice")).get()).toMatchObject({ favoritesView: "cards", activeWorkspaceId: "workspace" });
    expect((await f.alice.getData()).workspaceId).toBe("workspace");
  });

  it("uses the personal space when multiple legacy groups have no valid selection", async () => {
    const personal = await ensurePersonalWorkspace(f.db, "alice");
    await f.db.insert(workspaceMembers).values({ workspaceId: "other", userId: "alice", createdAt: new Date() }).run();
    await f.db.update(userPreferences).set({ activeWorkspaceId: null }).where(eq(userPreferences.userId, "alice")).run();
    expect((await f.alice.getData()).workspaceId).toBe(personal.workspace.id);

    await f.db.update(userPreferences).set({ activeWorkspaceId: "other" }).where(eq(userPreferences.userId, "alice")).run();
    expect((await f.alice.getData()).workspaceId).toBe("other");
    await f.db.update(userPreferences).set({ activeWorkspaceId: "workspace" }).where(eq(userPreferences.userId, "alice")).run();
    expect((await f.alice.getData()).workspaceId).toBe("workspace");
  });

  it("discards a foreign active preference and falls back only to an authorized space", async () => {
    const personal = await ensurePersonalWorkspace(f.db, "outsider");
    await f.db.update(userPreferences).set({ activeWorkspaceId: "other" }).where(eq(userPreferences.userId, "outsider")).run();
    expect((await f.outsider.getData()).workspaceId).toBe(personal.workspace.id);
    expect((await f.db.select().from(userPreferences).where(eq(userPreferences.userId, "outsider")).get())?.activeWorkspaceId).toBeNull();
  });

  it("does not clear a valid workspace selected while discarding a stale preference", async () => {
    await f.db.insert(userPreferences).values({ userId: "outsider", activeWorkspaceId: "other", createdAt: new Date(), updatedAt: new Date() }).run();
    const originalUpdate = f.db.update.bind(f.db);
    let invitationAccepted = false;
    const concurrentDb = {
      all: f.db.all.bind(f.db),
      select: f.db.select.bind(f.db),
      update(table: Parameters<typeof f.db.update>[0]) {
        const builder = originalUpdate(table);
        return {
          set(values: Parameters<typeof builder.set>[0]) {
            const setBuilder = builder.set(values);
            return {
              where(condition: Parameters<typeof setBuilder.where>[0]) {
                const query = setBuilder.where(condition);
                return {
                  async run() {
                    if (!invitationAccepted && table === userPreferences) {
                      invitationAccepted = true;
                      await f.db.insert(workspaceMembers).values({ workspaceId: "workspace", userId: "outsider", createdAt: new Date() }).run();
                      await originalUpdate(userPreferences).set({ activeWorkspaceId: "workspace" }).where(eq(userPreferences.userId, "outsider")).run();
                    }
                    return query.run();
                  },
                };
              },
            };
          },
        };
      },
    };

    const active = await authorization(concurrentDb as unknown as Parameters<typeof authorization>[0], "outsider").resolveActiveWorkspace();
    expect(invitationAccepted).toBe(true);
    expect(active.id).toBe("workspace");
    expect((await f.db.select().from(userPreferences).where(eq(userPreferences.userId, "outsider")).get())?.activeWorkspaceId).toBe("workspace");
  });

  it("rejects group invitations from personal context and mixed favorite/purchase writes", async () => {
    const personal = await ensurePersonalWorkspace(f.db, "alice");
    await f.db.update(userPreferences).set({ activeWorkspaceId: personal.workspace.id }).where(eq(userPreferences.userId, "alice")).run();
    await expect(invitationService(f.db).issue("alice", "invite@test.local", personal.workspace.id)).rejects.toThrow("compartilhado");

    const favorite = await f.alice.saveFavorite({ name: "Pessoal", url: "https://example.com/pessoal", priceCents: 100, variant: null, notes: null, collectionId: null });
    await f.db.update(userPreferences).set({ activeWorkspaceId: "workspace" }).where(eq(userPreferences.userId, "alice")).run();
    const sharedFavorite = await f.alice.saveFavorite({ name: "Compartilhado", url: "https://example.com/compartilhado", priceCents: 200, variant: null, notes: null, collectionId: null });
    const purchase = await f.alice.savePurchase({ name: "Compra compartilhada", hubbuyAccount: null });
    await expect(f.alice.addFavoriteToPurchase({ favoriteId: favorite!.id, participants: [{ personId: "alice" }], sharingMode: "equal", quantity: 1, unitPriceCents: 100 })).rejects.toThrow("outro espaço");
    await expect(f.alice.addFavoriteToPurchase({ favoriteId: sharedFavorite!.id, participants: [{ personId: "alice" }], sharingMode: "equal", quantity: 1, unitPriceCents: 200 })).resolves.toMatchObject({ purchaseId: purchase!.id, name: "Compartilhado" });
    expect(await f.db.select().from(favorites).where(eq(favorites.workspaceId, purchase!.workspaceId)).all()).toHaveLength(1);
  });

  it("enforces kind, owner and membership invariants in SQLite", async () => {
    await expect(f.db.insert(workspaces).values({ id: "invalid-personal", name: "Inválido", kind: "personal", ownerUserId: null, createdAt: new Date() }).run()).rejects.toThrow();
    await expect(f.db.insert(workspaces).values({ id: "invalid-shared", name: "Inválido", kind: "shared", ownerUserId: "alice", createdAt: new Date() }).run()).rejects.toThrow();
    const personal = await ensurePersonalWorkspace(f.db, "outsider");
    await expect(f.db.insert(workspaceMembers).values({ workspaceId: personal.workspace.id, userId: "outsider", createdAt: new Date() }).run()).rejects.toThrow();
  });

  it("accepts only the titleholder as a personal-space participant", async () => {
    const personal = await ensurePersonalWorkspace(f.db, "outsider");
    const guard = (await import("@/lib/domain/authorization")).authorization(f.db, "outsider");
    await expect(guard.requireWorkspaceMembers(["outsider"], personal.workspace.id)).resolves.toEqual([{ userId: "outsider" }]);
    await expect(guard.requireWorkspaceMembers(["bob"], personal.workspace.id)).rejects.toThrow("titular");
  });

  it("recovers the same personal space from concurrent calls on independent connections", async () => {
    const directory = await mkdtemp(join(tmpdir(), "loti-personal-race-"));
    const race = await fixture(join(directory, "db.sqlite"), "orders");
    const second = openDatabase(join(directory, "db.sqlite"));
    try {
      const settled = await Promise.allSettled([
        ensurePersonalWorkspace(race.db, "outsider"),
        ensurePersonalWorkspace(second.db, "outsider"),
      ]);
      const rejection = settled.find(result => result.status === "rejected");
      if (rejection?.status === "rejected") throw rejection.reason;
      const results = settled.map(result => (result as PromiseFulfilledResult<Awaited<ReturnType<typeof ensurePersonalWorkspace>>>).value);
      expect(results[0].workspace.id).toBe(results[1].workspace.id);
      expect(await race.db.select().from(workspaces).where(and(eq(workspaces.kind, "personal"), eq(workspaces.ownerUserId, "outsider"))).all()).toHaveLength(1);
    } finally {
      race.client.close();
      second.client.close();
      try { await rm(directory, { recursive: true, force: true }); }
      catch (error) {
        // Windows may retain libSQL file handles until this Vitest worker exits.
        if (!(error && typeof error === "object" && "code" in error && ["EBUSY", "EPERM"].includes(String(error.code)))) throw error;
      }
    }
  }, 30_000);
});
