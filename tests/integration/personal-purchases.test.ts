import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  purchaseCostOrders,
  purchaseCostTrackings,
  purchaseItems,
  purchasePackages,
  purchases,
} from "@/lib/db/schema";
import { ensurePersonalWorkspace } from "@/lib/domain/personal-workspaces";
import { fixture, type Fixture } from "./helpers";

let f: Fixture;
beforeEach(async () => { f = await fixture(":memory:", "orders"); });
afterEach(() => f.client.close());

const personalFavoriteInput = {
  name: "Favorito pessoal",
  url: "https://weidian.com/item.html?itemID=personal",
  priceCents: 2_500,
  variant: "azul",
  notes: null,
  collectionId: null,
};

const manualItemInput = (personId: string, name = "Item manual") => ({
  name,
  url: "https://example.com/manual",
  personId,
  quantity: 2,
  unitPriceCents: 1_250,
});

describe("personal purchases", () => {
  it("runs the full personal purchase and history flow for an account without a group", async () => {
    const { workspace } = await ensurePersonalWorkspace(f.db, "outsider");
    expect((await f.db.select().from(purchaseCostTrackings).all())).toHaveLength(0);

    const favorite = await f.outsider.saveFavorite(personalFavoriteInput, undefined, workspace.id);
    const purchase = await f.outsider.savePurchase({ name: "Compra privada" }, undefined, workspace.id);
    const fromFavorite = await f.outsider.addFavoriteToPurchase({
      favoriteId: favorite!.id,
      personId: "outsider",
      quantity: 2,
      unitPriceCents: 2_300,
      variant: personalFavoriteInput.variant,
    }, workspace.id);
    const manual = await f.outsider.saveManualItem(manualItemInput("outsider"), undefined, workspace.id);
    await f.outsider.setCartStatus(fromFavorite!.id, "added", workspace.id);

    const active = await f.outsider.getData(workspace.id);
    expect(active.purchases).toHaveLength(1);
    expect(active.purchases[0]).toMatchObject({ id: purchase!.id, workspaceId: workspace.id, status: "active" });
    expect(active.items).toHaveLength(2);
    expect(active.items.map(item => item.participants.map(participant => participant.personId))).toEqual([["outsider"], ["outsider"]]);
    expect(active.items.find(item => item.id === fromFavorite!.id)?.cartStatus).toBe("added");
    expect(active.items.find(item => item.id === manual!.id)?.cartStatus).toBe("pending");

    await f.outsider.finalizePurchase(purchase!.id, true, workspace.id);
    const tracking = await f.db.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.purchaseId, purchase!.id)).get();
    expect(tracking).toMatchObject({ purchaseId: purchase!.id, workspaceId: workspace.id });
    expect(await f.db.select().from(purchaseCostOrders).where(eq(purchaseCostOrders.trackingId, tracking!.id)).all()).toHaveLength(1);
    expect(await f.db.select().from(purchasePackages).where(eq(purchasePackages.trackingId, tracking!.id)).all()).toHaveLength(0);

    await f.outsider.saveFavorite({ ...personalFavoriteInput, name: "Favorito alterado", priceCents: 9_999 }, favorite!.id, workspace.id);
    await f.outsider.deleteFavorite(favorite!.id, workspace.id);
    const history = await f.outsider.getData(workspace.id);
    expect(history.purchases).toMatchObject([{ id: purchase!.id, status: "finalized", workspaceId: workspace.id }]);
    expect(history.items.find(item => item.id === fromFavorite!.id)).toMatchObject({
      name: personalFavoriteInput.name,
      url: personalFavoriteInput.url,
      unitPriceCents: 2_300,
      variant: "azul",
      sourceFavoriteId: null,
      visualKey: "generic",
    });
    await expect(f.outsider.saveManualItem(manualItemInput("outsider"), fromFavorite!.id, workspace.id)).rejects.toThrow("finalizada");
  });

  it("keeps a personal and shared purchase active independently and isolates their records", async () => {
    const { workspace: personal } = await ensurePersonalWorkspace(f.db, "alice");
    await f.alice.selectWorkspace(personal.id, "workspace");
    const favorite = await f.alice.saveFavorite(personalFavoriteInput, undefined, personal.id);
    const personalPurchase = await f.alice.savePurchase({ name: "Compra pessoal" }, undefined, personal.id);
    const personalItem = await f.alice.addFavoriteToPurchase({
      favoriteId: favorite!.id,
      personId: "alice",
      quantity: 1,
      unitPriceCents: 2_500,
    }, personal.id);

    await f.alice.selectWorkspace("workspace", personal.id);
    const groupPurchase = await f.alice.savePurchase({ name: "Compra do grupo" }, undefined, "workspace");
    await expect(f.alice.addFavoriteToPurchase({
      favoriteId: favorite!.id,
      personId: "alice",
      quantity: 1,
      unitPriceCents: 2_500,
    }, "workspace")).rejects.toMatchObject({ status: 403 });
    const groupItem = await f.bob.saveManualItem(manualItemInput("bob", "Item do grupo"), undefined, "workspace");

    const groupData = await f.alice.getData("workspace");
    expect(groupData.purchases.map(row => row.id)).toContain(groupPurchase!.id);
    expect(groupData.purchases.map(row => row.id)).not.toContain(personalPurchase!.id);
    expect(groupData.items.map(row => row.id)).toEqual([groupItem!.id]);

    await f.alice.selectWorkspace(personal.id, "workspace");
    const personalData = await f.alice.getData(personal.id);
    expect(personalData.purchases.map(row => row.id)).toEqual([personalPurchase!.id]);
    expect(personalData.items.map(row => row.id)).toEqual([personalItem!.id]);
    expect(personalData.members.map(row => row.id)).toEqual(["alice"]);
    await expect(f.bob.requirePurchaseAccess(personalPurchase!.id)).rejects.toMatchObject({ status: 403 });
    await expect(f.foreign.setCartStatus(personalItem!.id, "added", personal.id)).rejects.toMatchObject({ status: 403 });

    await expect(f.alice.saveManualItem({
      name: "Participante indevido",
      url: "https://example.com/participant",
      quantity: 1,
      unitPriceCents: 1_250,
      sharingMode: "equal",
      participants: [{ personId: "alice" }, { personId: "bob" }],
    }, undefined, personal.id)).rejects.toMatchObject({ status: 403 });
    expect(await f.db.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, personalPurchase!.id)).all()).toHaveLength(1);

    await f.alice.finalizePurchase(personalPurchase!.id, true, personal.id);
    const personalHistory = await f.alice.getData(personal.id);
    expect(personalHistory.purchases).toMatchObject([{ id: personalPurchase!.id, status: "finalized" }]);
    expect(personalHistory.purchases.map(row => row.id)).not.toContain(groupPurchase!.id);

    await f.alice.selectWorkspace("workspace", personal.id);
    const sharedPurchase = await f.alice.getData("workspace");
    expect(sharedPurchase.purchases).toMatchObject([{ id: groupPurchase!.id, status: "active" }]);
    expect(sharedPurchase.purchases.map(row => row.id)).not.toContain(personalPurchase!.id);
  });

  it("rejects stale-context creation, edits, removal, cart changes, and finalization without writes", async () => {
    const { workspace: personal } = await ensurePersonalWorkspace(f.db, "alice");
    await f.alice.selectWorkspace(personal.id, "workspace");
    const purchase = await f.alice.savePurchase({ name: "Compra pessoal" }, undefined, personal.id);
    const item = await f.alice.saveManualItem(manualItemInput("alice"), undefined, personal.id);
    const favorite = await f.alice.saveFavorite(personalFavoriteInput, undefined, personal.id);
    await f.alice.selectWorkspace("workspace", personal.id);

    const conflict = { status: 409, code: "WORKSPACE_CONTEXT_CHANGED" };
    await expect(f.alice.savePurchase({ name: "Compra antiga" }, undefined, personal.id)).rejects.toMatchObject(conflict);
    await expect(f.alice.savePurchase({ name: "Nome alterado" }, purchase!.id, personal.id)).rejects.toMatchObject(conflict);
    await expect(f.alice.saveManualItem({ ...manualItemInput("alice"), name: "Item alterado" }, item!.id, personal.id)).rejects.toMatchObject(conflict);
    await expect(f.alice.saveManualItem(manualItemInput("alice", "Item novo"), undefined, personal.id)).rejects.toMatchObject(conflict);
    await expect(f.alice.addFavoriteToPurchase({
      favoriteId: favorite!.id,
      personId: "alice",
      quantity: 1,
      unitPriceCents: 2_500,
    }, personal.id)).rejects.toMatchObject(conflict);
    await expect(f.alice.removePurchaseItem(item!.id, personal.id)).rejects.toMatchObject(conflict);
    await expect(f.alice.setCartStatus(item!.id, "added", personal.id)).rejects.toMatchObject(conflict);
    await expect(f.alice.setPersonItemsStatus(purchase!.id, { personId: "alice", status: "added" }, personal.id)).rejects.toMatchObject(conflict);
    await expect(f.alice.finalizePurchase(purchase!.id, true, personal.id)).rejects.toMatchObject(conflict);
    await expect(f.alice.selectWorkspace(personal.id, personal.id)).rejects.toMatchObject(conflict);

    const persisted = await f.db.select().from(purchases).where(eq(purchases.id, purchase!.id)).get();
    expect(persisted).toMatchObject({ status: "active", name: "Compra pessoal" });
    expect(await f.db.select().from(purchases).where(and(eq(purchases.workspaceId, personal.id), eq(purchases.status, "active"))).all()).toHaveLength(1);
    expect(await f.db.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, purchase!.id)).all()).toMatchObject([
      { id: item!.id, name: "Item manual", cartStatus: "pending" },
    ]);
    expect(await f.db.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.purchaseId, purchase!.id)).all()).toHaveLength(0);
  });

  it("makes concurrent finalization produce one immutable history and one cost tracking", async () => {
    const { workspace } = await ensurePersonalWorkspace(f.db, "outsider");
    const purchase = await f.outsider.savePurchase({ name: "Finalização concorrente" }, undefined, workspace.id);
    const results = await Promise.allSettled([
      f.outsider.finalizePurchase(purchase!.id, true, workspace.id),
      f.outsider.finalizePurchase(purchase!.id, true, workspace.id),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await f.db.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.purchaseId, purchase!.id)).all()).toHaveLength(1);
    const tracking = await f.db.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.purchaseId, purchase!.id)).get();
    expect(await f.db.select().from(purchaseCostOrders).where(eq(purchaseCostOrders.trackingId, tracking!.id)).all()).toHaveLength(1);
  });
});
