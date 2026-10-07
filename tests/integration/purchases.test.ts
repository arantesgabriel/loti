import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { purchaseItems, purchaseItemParticipants, purchases } from "@/lib/db/schema";
import { personSummary, purchaseSummary } from "@/lib/domain/money";
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
    const participants = await f.db.select().from(purchaseItemParticipants).where(eq(purchaseItemParticipants.purchaseItemId, saved.id)).all();
    expect(participants).toEqual([{ purchaseItemId: saved.id, personId: "alice", allocationOrder: 0, percentageBps: null, amountCents: null }]);
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
  it("shows one shared item in each selected member group without multiplying physical totals", async () => {
    await f.alice.savePurchase({ name: "Compartilhada" });
    const shared = await f.alice.saveManualItem({
      name: "RAM", url: "https://example.com/ram", quantity: 1, unitPriceCents: 30_000, sharingMode: "equal",
      participants: [{ personId: "alice" }, { personId: "bob" }],
    });
    const items = (await f.alice.getData()).items;
    const visible = items.find(row => row.id === shared?.id)!;
    expect(visible.personId).toBe("alice");
    expect(visible.participants.map(p => [p.personId, p.shareCents])).toEqual([["alice", 15_000], ["bob", 15_000]]);
    expect(purchaseSummary(items)).toMatchObject({ totalCents: 30_000, units: 1, people: 2 });
    expect(personSummary(items, "bob")).toMatchObject({ totalCents: 15_000, units: 1, sharedItems: 1, personalUnits: 0 });
  });
  it("rejects ambiguous old and shared item input formats", async () => {
    await f.alice.savePurchase({ name: "Compartilhada" });
    await expect(f.alice.saveManualItem({ ...item, sharingMode: "equal", participants: [{ personId: "bob" }] })).rejects.toThrow();
    await expect(f.alice.saveManualItem({ name: item.name, url: item.url, quantity: 1, unitPriceCents: 100, sharingMode: "percentage", participants: [{ personId: "bob", percentageBps: 9_900 }, { personId: "alice", percentageBps: 0 }] })).rejects.toThrow(/100%/);
    await expect(f.alice.saveManualItem({ name: item.name, url: item.url, quantity: 1, unitPriceCents: null, sharingMode: "fixed", participants: [{ personId: "bob", amountCents: 0 }, { personId: "alice", amountCents: 0 }] })).rejects.toThrow(/preço/);
    expect(await f.db.select().from(purchaseItems)).toHaveLength(0);
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
  it("marks only one person's active purchase items at once", async () => {
    const purchase = await f.alice.savePurchase({ name: "Bulk status" });
    const first = await f.alice.saveManualItem(item);
    const second = await f.bob.saveManualItem({ ...item, name: "Second", personId: "alice", quantity: 3 });
    await f.bob.setPersonItemsStatus(purchase!.id, { personId: "bob", status: "added" });
    expect((await f.alice.getData()).items.map(row => row.cartStatus)).toEqual(["added", "pending"]);
    await f.alice.setPersonItemsStatus(purchase!.id, { personId: "bob", status: "added" });
    expect((await f.bob.getData()).items.map(row => row.cartStatus)).toEqual(["added", "pending"]);
    await f.alice.setPersonItemsStatus(purchase!.id, { personId: "bob", status: "pending" });
    expect((await f.bob.getData()).items.map(row => row.cartStatus)).toEqual(["pending", "pending"]);
    await expect(f.outsider.setPersonItemsStatus(purchase!.id, { personId: "outsider", status: "added" })).rejects.toThrow();
    expect(first!.purchaseId).toBe(second!.purchaseId);
  });
  it("updates a shared item's one cart status from any participating person's group", async () => {
    const purchase = await f.alice.savePurchase({ name: "Shared checklist" });
    const shared = await f.alice.saveManualItem({ name: "RAM", url: "https://example.com/ram", quantity: 1, unitPriceCents: 30_000, sharingMode: "equal", participants: [{ personId: "alice" }, { personId: "bob" }] });
    await f.bob.setPersonItemsStatus(purchase!.id, { personId: "bob", status: "added" });
    const item = (await f.alice.getData()).items.find(row => row.id === shared?.id);
    expect(item?.cartStatus).toBe("added");
    expect((await f.bob.getData()).items.filter(row => row.id === shared?.id)).toHaveLength(1);
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
    await expect(f.bob.setPersonItemsStatus(p.id, { personId: "bob", status: "added" })).rejects.toThrow("finalizada");
    await expect(f.bob.finalizePurchase(p.id, true)).rejects.toThrow("finalizada");
    await expect(f.bob.saveManualItem(item)).rejects.toThrow();
    expect((await f.bob.savePurchase({ name: "Next" }))?.status).toBe("active");
  });
  it("rejects cross-workspace item access", async () => {
    const { saved } = await snapshot(); await expect(f.foreign.removePurchaseItem(saved.id)).rejects.toThrow();
  });
});
