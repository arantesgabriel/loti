import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { purchaseItems, purchases } from "@/lib/db/schema";
import { fixture, favorite, type Fixture } from "./helpers";

let f: Fixture;
beforeEach(async () => { f = await fixture(); });
afterEach(() => f.client.close());
const item = { name: "Manual", url: "https://example.com/product", personId: "bob", quantity: 2, unitPriceCents: 1000 };
async function snapshot() {
  const p = await f.alice.savePurchase({ name: "Compra teste" });
  const fav = await f.alice.saveFavorite(favorite);
  const saved = await f.bob.addFavoriteToPurchase({ favoriteId: fav!.id, personId: "alice", quantity: 3, unitPriceCents: 12500, variant: "42" });
  return { p: p!, fav: fav!, saved: saved! };
}

describe("purchase rules", () => {
  it("denies a second active purchase in service and database", async () => {
    await f.alice.savePurchase({ name: "First" });
    await expect(f.bob.savePurchase({ name: "Second" })).rejects.toThrow("ativa");
    await expect(f.db.insert(purchases).values({ id: "second", workspaceId: "workspace", name: "Second", createdBy: "bob", createdAt: new Date(), status: "active" }).run()).rejects.toThrow();
    expect(await f.db.select().from(purchases)).toHaveLength(1);
  });
  it("rejects purchase writes from outsiders", async () => {
    const p = await f.alice.savePurchase({ name: "First" });
    await expect(f.outsider.savePurchase({ name: "changed" }, p!.id)).rejects.toThrow();
    await expect(f.foreign.finalizePurchase(p!.id, true)).rejects.toThrow();
  });
  it("copies favorite snapshots and records creator and target separately", async () => {
    const { saved } = await snapshot();
    expect(saved.name).toBe(favorite.name); expect(saved.url).toBe(favorite.url);
    expect(saved.createdBy).toBe("bob"); expect(saved.personId).toBe("alice"); expect(saved.quantity).toBe(3);
  });
  it("editing favorite never alters snapshot", async () => {
    const { saved, fav } = await snapshot();
    await f.alice.saveFavorite({ ...favorite, name: "changed", priceCents: 1, variant: "different" }, fav.id);
    const stored = await f.db.select().from(purchaseItems).where(eq(purchaseItems.id, saved.id)).get();
    expect(stored?.name).toBe(favorite.name); expect(stored?.unitPriceCents).toBe(12500); expect(stored?.variant).toBe("42");
  });
  it("deleting source favorite preserves finalized item", async () => {
    const { p, saved, fav } = await snapshot();
    await f.alice.finalizePurchase(p.id, true); await f.alice.deleteFavorite(fav.id);
    const stored = await f.db.select().from(purchaseItems).where(eq(purchaseItems.id, saved.id)).get();
    expect(stored?.sourceFavoriteId).toBeNull(); expect(stored?.name).toBe(favorite.name); expect(stored?.url).toBe(favorite.url);
  });
  it("any member edits active items without changing favorite", async () => {
    const { saved, fav } = await snapshot();
    await f.alice.saveManualItem({ ...item, name: "new snapshot" }, saved.id);
    expect((await f.bob.getData()).items[0]?.name).toBe("new snapshot");
    expect((await f.bob.getData()).favorites.find(x => x.id === fav.id)?.name).toBe(favorite.name);
  });
  it("manual items do not create favorites", async () => {
    await f.alice.savePurchase({ name: "Manual" }); await f.bob.saveManualItem(item);
    expect((await f.alice.getData()).favorites).toHaveLength(0);
  });
  it("does not merge duplicate rows", async () => {
    await f.alice.savePurchase({ name: "Manual" }); await f.alice.saveManualItem(item); await f.alice.saveManualItem(item);
    expect((await f.alice.getData()).items).toHaveLength(2);
  });
  it("requires target membership", async () => {
    await f.alice.savePurchase({ name: "Manual" });
    await expect(f.alice.saveManualItem({ ...item, personId: "outsider" })).rejects.toThrow();
    await expect(f.alice.saveManualItem({ ...item, personId: "foreign" })).rejects.toThrow();
  });
  it.each([0, -1, 1.5])("rejects quantity %s at server and SQLite boundaries", async quantity => {
    const { saved } = await snapshot();
    await expect(f.alice.saveManualItem({ ...item, quantity }, saved.id)).rejects.toThrow();
    await expect(f.db.update(purchaseItems).set({ quantity }).where(eq(purchaseItems.id, saved.id)).run()).rejects.toThrow();
  });
  it.each([-1, 1.1])("rejects price %s at both boundaries", async unitPriceCents => {
    const { saved } = await snapshot();
    await expect(f.alice.saveManualItem({ ...item, unitPriceCents }, saved.id)).rejects.toThrow();
    await expect(f.db.update(purchaseItems).set({ unitPriceCents }).where(eq(purchaseItems.id, saved.id)).run()).rejects.toThrow();
  });
  it("keeps null prices and toggles status", async () => {
    await f.alice.savePurchase({ name: "Manual" });
    const saved = await f.alice.saveManualItem({ ...item, unitPriceCents: null });
    expect(saved?.unitPriceCents).toBeNull(); await f.bob.setCartStatus(saved!.id, "added");
    expect((await f.alice.getData()).items[0]?.cartStatus).toBe("added");
  });
  it("requires explicit confirmation but allows pending/no-price finalization", async () => {
    const { p } = await snapshot(); await f.alice.saveManualItem({ ...item, unitPriceCents: null });
    await expect(f.bob.finalizePurchase(p.id, false)).rejects.toThrow("Confirme");
    await f.bob.finalizePurchase(p.id, true); expect((await f.alice.getData()).purchases[0]?.status).toBe("finalized");
  });
  it("rejects all finalized mutations and allows a next purchase", async () => {
    const { p, saved } = await snapshot(); await f.alice.finalizePurchase(p.id, true);
    await expect(f.bob.savePurchase({ name: "changed" }, p.id)).rejects.toThrow("finalizada");
    await expect(f.bob.saveManualItem(item, saved.id)).rejects.toThrow("finalizada");
    await expect(f.bob.removePurchaseItem(saved.id)).rejects.toThrow("finalizada");
    await expect(f.bob.setCartStatus(saved.id, "added")).rejects.toThrow("finalizada");
    await expect(f.bob.finalizePurchase(p.id, true)).rejects.toThrow("finalizada");
    await expect(f.bob.saveManualItem(item)).rejects.toThrow();
    expect((await f.bob.savePurchase({ name: "Next" }))?.status).toBe("active");
  });
  it("rejects cross-workspace item access", async () => {
    const { saved } = await snapshot(); await expect(f.foreign.removePurchaseItem(saved.id)).rejects.toThrow();
  });
});
