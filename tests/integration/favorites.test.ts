import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { favorites } from "@/lib/db/schema";
import { fixture, favorite, type Fixture } from "./helpers";

let f: Fixture;
beforeEach(async () => { f = await fixture(); });
afterEach(() => f.client.close());

describe("private workspace and favorites", () => {
  it("denies nonmembers", async () => {
    await expect(f.outsider.getData()).rejects.toThrow("espaço");
    await expect(f.outsider.saveFavorite(favorite)).rejects.toThrow("espaço");
  });
  it("scopes reads to workspace", async () => {
    await f.alice.saveFavorite(favorite);
    expect((await f.foreign.getData()).favorites).toHaveLength(0);
  });
  it("makes ownership server-assigned and workspace-visible", async () => {
    const saved = await f.alice.saveFavorite({ ...favorite, ownerId: "bob" });
    expect(saved?.ownerId).toBe("alice");
    expect((await f.bob.getData()).favorites[0]?.id).toBe(saved?.id);
  });
  it("rejects non-owner writes and deletion", async () => {
    const saved = await f.alice.saveFavorite(favorite);
    await expect(f.bob.saveFavorite(favorite, saved!.id)).rejects.toThrow("dono");
    await expect(f.bob.deleteFavorite(saved!.id)).rejects.toThrow("dono");
  });
  it("denies cross-workspace direct IDs", async () => {
    const saved = await f.alice.saveFavorite(favorite);
    await expect(f.foreign.requireFavorite(saved!.id)).rejects.toThrow("espaço");
  });
  it("preserves original URLs and nullable price", async () => {
    const saved = await f.alice.saveFavorite({ ...favorite, priceCents: null });
    expect(saved?.url).toBe(favorite.url);
    expect(saved?.canonicalProductKey).toBe("weidian:1");
    expect(saved?.priceCents).toBeNull();
  });
  it("warn-only duplicates can be saved", async () => {
    await f.alice.saveFavorite(favorite); await f.alice.saveFavorite(favorite);
    expect((await f.alice.getData()).favorites).toHaveLength(2);
  });
  it("rejects invalid URL and prices", async () => {
    await expect(f.alice.saveFavorite({ ...favorite, url: "javascript:alert(1)" })).rejects.toThrow();
    await expect(f.alice.saveFavorite({ ...favorite, priceCents: -1 })).rejects.toThrow();
    await expect(f.alice.saveFavorite({ ...favorite, priceCents: 0.1 })).rejects.toThrow();
  });
  it("persists independent view preferences", async () => {
    await f.alice.setView("cards");
    expect((await f.alice.getData()).view).toBe("cards");
    expect((await f.bob.getData()).view).toBe("list");
  });
});

describe("personal collections", () => {
  it("allows only owner mutations", async () => {
    const c = await f.alice.saveCollection({ name: "Tênis" });
    expect((await f.bob.getData()).collections[0]?.id).toBe(c?.id);
    await expect(f.bob.saveCollection({ name: "changed" }, c!.id)).rejects.toThrow();
    await expect(f.bob.deleteCollection(c!.id)).rejects.toThrow();
    await f.alice.saveCollection({ name: "Novos tênis" }, c!.id);
    expect((await f.alice.getData()).collections[0]?.name).toBe("Novos tênis");
  });
  it("preserves favorites when deleted", async () => {
    const c = await f.alice.saveCollection({ name: "Tênis" });
    const saved = await f.alice.saveFavorite({ ...favorite, collectionId: c!.id });
    await f.alice.deleteCollection(c!.id);
    expect((await f.db.select().from(favorites).where(eq(favorites.id, saved!.id)).get())?.collectionId).toBeNull();
  });
  it("cannot put a favorite in another owner's collection", async () => {
    const c = await f.bob.saveCollection({ name: "Bob" });
    await expect(f.alice.saveFavorite({ ...favorite, collectionId: c!.id })).rejects.toThrow();
  });
  it("enables SQLite foreign keys", async () => {
    const result = await f.client.execute("PRAGMA foreign_keys");
    expect(result.rows[0]?.foreign_keys).toBe(1);
  });
});
