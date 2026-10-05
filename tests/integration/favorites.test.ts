import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { favorites } from "@/lib/db/schema";
import { fixture, favorite } from "./helpers";
let f: ReturnType<typeof fixture>;
beforeEach(() => { f = fixture(); });
afterEach(() => f.sqlite.close());
describe("private workspace and favorites", () => {
  it("denies nonmembers", () => { expect(() => f.outsider.getData()).toThrow("espaço"); expect(() => f.outsider.saveFavorite(favorite)).toThrow("espaço"); });
  it("scopes reads to workspace", () => { f.alice.saveFavorite(favorite); expect(f.foreign.getData().favorites).toHaveLength(0); });
  it("makes ownership server-assigned and workspace-visible", () => { const saved = f.alice.saveFavorite({ ...favorite, ownerId: "bob" }); expect(saved.ownerId).toBe("alice"); expect(f.bob.getData().favorites[0].id).toBe(saved.id); });
  it("rejects non-owner writes and deletion", () => { const saved = f.alice.saveFavorite(favorite); expect(() => f.bob.saveFavorite(favorite, saved.id)).toThrow("dono"); expect(() => f.bob.deleteFavorite(saved.id)).toThrow("dono"); });
  it("denies cross-workspace direct IDs", () => { const saved = f.alice.saveFavorite(favorite); expect(() => f.foreign.requireFavorite(saved.id)).toThrow("espaço"); });
  it("preserves original URLs and nullable price", () => { const saved = f.alice.saveFavorite({ ...favorite, priceCents: null }); expect(saved.url).toBe(favorite.url); expect(saved.canonicalProductKey).toBe("weidian:1"); expect(saved.priceCents).toBeNull(); });
  it("warn-only duplicates can be saved", () => { f.alice.saveFavorite(favorite); f.alice.saveFavorite(favorite); expect(f.alice.getData().favorites).toHaveLength(2); });
  it("rejects invalid URL and prices", () => { expect(() => f.alice.saveFavorite({ ...favorite, url: "javascript:alert(1)" })).toThrow(); expect(() => f.alice.saveFavorite({ ...favorite, priceCents: -1 })).toThrow(); expect(() => f.alice.saveFavorite({ ...favorite, priceCents: 0.1 })).toThrow(); });
  it("persists independent view preferences", () => { f.alice.setView("cards"); expect(f.alice.getData().view).toBe("cards"); expect(f.bob.getData().view).toBe("list"); });
});
describe("personal collections", () => {
  it("allows only owner mutations", () => { const c = f.alice.saveCollection({ name: "Tênis" }); expect(f.bob.getData().collections[0].id).toBe(c.id); expect(() => f.bob.saveCollection({ name: "changed" }, c.id)).toThrow(); expect(() => f.bob.deleteCollection(c.id)).toThrow(); f.alice.saveCollection({ name: "Novos tênis" }, c.id); expect(f.alice.getData().collections[0].name).toBe("Novos tênis"); });
  it("preserves favorites when deleted", () => { const c = f.alice.saveCollection({ name: "Tênis" }); const saved = f.alice.saveFavorite({ ...favorite, collectionId: c.id }); f.alice.deleteCollection(c.id); expect(f.db.select().from(favorites).where(eq(favorites.id, saved.id)).get()?.collectionId).toBeNull(); });
  it("cannot put a favorite in another owner's collection", () => { const c = f.bob.saveCollection({ name: "Bob" }); expect(() => f.alice.saveFavorite({ ...favorite, collectionId: c.id })).toThrow(); });
  it("enables SQLite foreign keys", () => expect(f.sqlite.pragma("foreign_keys", { simple: true })).toBe(1));
});
