import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ensurePersonalWorkspace } from "@/lib/domain/personal-workspaces";
import { favorites, userPreferences, workspaceMembers } from "@/lib/db/schema";
import { fixture, type Fixture, favorite } from "./helpers";

let f: Fixture;
beforeEach(async () => { f = await fixture(":memory:", "orders"); });
afterEach(() => { if (f) f.client.close(); });

describe("workspace selection and expected mutation context", () => {
  it("lists only authorized spaces and idempotently selects the owner personal space", async () => {
    const personal = await ensurePersonalWorkspace(f.db, "alice");
    await f.db.insert(workspaceMembers).values({ workspaceId: "other", userId: "alice", createdAt: new Date() }).run();
    await f.alice.setView("cards", "workspace");

    const before = await f.alice.getData();
    expect(before.workspaces).toEqual(expect.arrayContaining([
      { id: personal.workspace.id, name: personal.workspace.name, kind: "personal" },
      { id: "workspace", name: "Loti", kind: "shared" },
      { id: "other", name: "Other", kind: "shared" },
    ]));
    expect(before.workspaces).not.toContainEqual(expect.objectContaining({ id: "outsider-personal" }));

    const selected = await f.alice.selectWorkspace(personal.workspace.id);
    expect(selected).toMatchObject({ workspaceId: personal.workspace.id, workspaceKind: "personal", view: "cards" });
    const preferenceAfterSelection = await f.db.select().from(userPreferences).where(eq(userPreferences.userId, "alice")).get();
    const repeated = await f.alice.selectWorkspace(personal.workspace.id);
    const preferenceAfterRepeat = await f.db.select().from(userPreferences).where(eq(userPreferences.userId, "alice")).get();

    expect(repeated.workspaceId).toBe(personal.workspace.id);
    expect(preferenceAfterRepeat).toMatchObject({ activeWorkspaceId: personal.workspace.id, favoritesView: "cards" });
    expect(preferenceAfterRepeat?.updatedAt).toEqual(preferenceAfterSelection?.updatedAt);
  });

  it("allows an authorized shared destination and rejects another account's personal space", async () => {
    const personal = await ensurePersonalWorkspace(f.db, "outsider");
    await f.db.insert(workspaceMembers).values({ workspaceId: "other", userId: "alice", createdAt: new Date() }).run();

    await expect(f.alice.selectWorkspace("other")).resolves.toMatchObject({ workspaceId: "other", workspaceKind: "shared" });
    await expect(f.alice.selectWorkspace(personal.workspace.id)).rejects.toMatchObject({ status: 403 });
    expect(await f.db.select().from(userPreferences).where(eq(userPreferences.userId, "alice")).get()).toMatchObject({ activeWorkspaceId: "other" });
  });

  it("rejects stale-tab favorite writes and binds accepted writes to the displayed space", async () => {
    const personal = await ensurePersonalWorkspace(f.db, "alice");
    await f.alice.selectWorkspace("workspace");

    await expect(f.alice.saveFavorite({ ...favorite, name: "Não deve mudar de espaço" }, undefined, personal.workspace.id))
      .rejects.toMatchObject({ status: 409, code: "WORKSPACE_CONTEXT_CHANGED" });
    expect(await f.db.select().from(favorites).where(eq(favorites.name, "Não deve mudar de espaço")).all()).toEqual([]);

    const saved = await f.alice.saveFavorite({ ...favorite, name: "Favorito do grupo" }, undefined, "workspace");
    expect(saved).toMatchObject({ workspaceId: "workspace", name: "Favorito do grupo" });

    await f.alice.selectWorkspace(personal.workspace.id);
    const privateFavorite = await f.alice.saveFavorite({ ...favorite, name: "Favorito pessoal", url: "https://example.com/pessoal" }, undefined, personal.workspace.id);
    await f.alice.selectWorkspace("workspace");
    await expect(f.alice.saveFavorite({ ...favorite, name: "Edição cruzada", url: "https://example.com/pessoal" }, privateFavorite!.id, "workspace"))
      .rejects.toMatchObject({ status: 409, code: "WORKSPACE_CONTEXT_CHANGED" });
    expect(await f.db.select().from(favorites).where(eq(favorites.id, privateFavorite!.id)).get()).toMatchObject({ workspaceId: personal.workspace.id, name: "Favorito pessoal" });
  });

  it("preserves collections and view preference when context changes", async () => {
    const personal = await ensurePersonalWorkspace(f.db, "alice");
    await f.alice.selectWorkspace(personal.workspace.id);
    const collection = await f.alice.saveCollection({ name: "Pessoal" }, undefined, personal.workspace.id);
    await f.alice.setView("cards", personal.workspace.id);
    await f.alice.selectWorkspace("workspace");
    const shared = await f.alice.saveCollection({ name: "Grupo" }, undefined, "workspace");

    const personalAgain = await f.alice.selectWorkspace(personal.workspace.id);
    expect(personalAgain.collections.map(item => item.id)).toEqual([collection!.id]);
    expect(personalAgain.view).toBe("cards");
    expect(personalAgain.workspaces).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: personal.workspace.id, kind: "personal" }),
      expect.objectContaining({ id: "workspace", kind: "shared" }),
    ]));
    expect(shared?.workspaceId).toBe("workspace");
  });
});
