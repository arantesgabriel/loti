import { afterEach, beforeEach, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { favorite, fixture, type Fixture } from "./helpers";
import { createServices } from "@/lib/domain/services";
import { recordCommittedInsert, recordPreexisting } from "@/lib/onboarding/milestones";
import { favorites, onboardingMilestones, purchaseItems } from "@/lib/db/schema";
import { ensurePersonalWorkspace } from "@/lib/domain/personal-workspaces";

let f: Fixture;
beforeEach(async () => { f = await fixture(":memory:", "orders"); });
afterEach(() => f.client.close());
const item = { name: "Synthetic item", url: "https://example.test/item", quantity: 1, unitPriceCents: null, personId: "alice" };
const live = (id = "alice") => createServices(f.db, id, undefined, recordCommittedInsert);
const rows = () => f.db.select().from(onboardingMilestones).all();

it("records M1 once on favorite insert, across workspaces, and ignores edits/cancel/read/seed", async () => {
  await f.alice.saveFavorite(favorite); // trusted seed/import capability has no evidence recorder
  expect(await rows()).toEqual([]);
  const saved = await live().saveFavorite(favorite, undefined, "workspace");
  expect(await rows()).toEqual([expect.objectContaining({ userId: "alice", milestone: "M1", workspaceId: "workspace", evidence: "committed", source: "favorite", occurredAt: expect.any(Date) })]);
  const before = await rows();
  await live().saveFavorite({ ...favorite, name: "Edited" }, saved!.id, "workspace");
  await live().getData();
  const personal = (await ensurePersonalWorkspace(f.db, "alice")).workspace.id;
  await f.alice.selectWorkspace(personal, "workspace");
  await live().saveFavorite(favorite, undefined, personal);
  expect(await rows()).toEqual(before);
});
it("records M1+M2 on a manual insert for the actor, never the participant or viewer", async () => {
  await f.alice.savePurchase({ name: "Synthetic purchase" });
  expect(await rows()).toHaveLength(0);
  await live("bob").saveManualItem(item, undefined, "workspace");
  expect((await rows()).map(r => [r.userId, r.milestone, r.source])).toEqual([["bob", "M1", "purchase_item"], ["bob", "M2", "purchase_item"]]);
  await live().getData(); expect((await rows()).every(r => r.userId === "bob")).toBe(true);
});
it("records favorite-to-purchase M2 for the inserting actor and preserves snapshot behavior", async () => {
  const saved = await live().saveFavorite(favorite);
  await f.alice.savePurchase({ name: "Synthetic purchase" });
  const savedItem = await live("bob").addFavoriteToPurchase({ favoriteId: saved!.id, quantity: 1, unitPriceCents: null, personId: "alice" }, "workspace");
  expect((await rows()).filter(r => r.userId === "bob").map(r => r.milestone)).toEqual(["M1", "M2"]);
  await live().saveFavorite({ ...favorite, name: "Changed" }, saved!.id);
  expect((await f.db.select().from(purchaseItems).where(eq(purchaseItems.id, savedItem!.id)).get())!.name).toBe(favorite.name);
});
it("rolls back domain insert if the marker fails, and never marks invalid/unauthorized inserts", async () => {
  const broken = createServices(f.db, "alice", undefined, async (tx, value) => { await recordCommittedInsert(tx, value); throw new Error("Synthetic marker failure"); });
  await expect(broken.saveFavorite(favorite)).rejects.toThrow("Synthetic marker failure");
  expect(await f.db.select().from(favorites).all()).toHaveLength(0); expect(await rows()).toHaveLength(0);
  await expect(live().saveFavorite({ ...favorite, name: "" })).rejects.toThrow();
  await expect(live("outsider").saveFavorite(favorite, undefined, "workspace")).rejects.toMatchObject({ status: 403 });
  expect(await rows()).toEqual([]);
});
it("deduplicates simultaneous inserts and distinguishes preexisting evidence without a historical date", async () => {
  await Promise.all([live().saveFavorite(favorite), live().saveFavorite(favorite)]);
  expect(await rows()).toHaveLength(1);
  const old = await f.bob.saveFavorite(favorite);
  const reference = { userId: "bob", workspaceId: "workspace", source: "favorite" as const, entityId: old!.id };
  await f.db.transaction(tx => recordPreexisting(tx, reference));
  await f.db.transaction(tx => recordPreexisting(tx, reference));
  expect((await rows()).filter(r => r.userId === "bob")).toEqual([expect.objectContaining({ evidence: "preexisting", occurredAt: null })]);
  await expect(f.db.transaction(tx => recordPreexisting(tx, { ...reference, userId: "alice" }))).rejects.toMatchObject({ status: 409 });
  await live("bob").saveFavorite(favorite);
  expect((await rows()).find(r => r.userId === "bob")!.evidence).toBe("preexisting");
});
