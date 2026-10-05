import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../db/connection";
import { purchases, purchaseItems } from "../db/schema";
import { authorization } from "./authorization";
import { purchaseInput, itemInput, favoriteToItemInput } from "./validation";
import { detectPlatform } from "./urls";
import { resolveProductVisual } from "./visuals";
import { DomainError } from "./errors";
export function purchaseServices(db: AppDatabase, userId: string) {
  const guard = authorization(db, userId);
  function savePurchase(input: unknown, id?: string) {
    const value = purchaseInput.parse(input);
    return db.transaction(() => {
      const { workspaceId } = id ? guard.requireEditablePurchase(id) : guard.requireWorkspaceMember();
      if (id) return db.update(purchases).set(value).where(eq(purchases.id, id)).returning().get()!;
      if (db.select().from(purchases).where(and(eq(purchases.workspaceId, workspaceId), eq(purchases.status, "active"))).get()) throw new DomainError("Já existe uma compra ativa neste espaço.", 409);
      return db.insert(purchases).values({ id: crypto.randomUUID(), workspaceId, ...value, status: "active", createdBy: userId, createdAt: new Date(), finalizedAt: null }).returning().get()!;
    });
  }
  function requireItem(id: string) { const item = db.select().from(purchaseItems).where(eq(purchaseItems.id, id)).get(); if (!item) throw new DomainError("Item não encontrado.", 404); const purchase = guard.requireEditablePurchase(item.purchaseId); return { item, purchase }; }
  function requirePerson(personId: string, workspaceId: string) { authorization(db, personId).requireWorkspaceMember(workspaceId); }
  function addFavoriteToPurchase(input: unknown) {
    const value = favoriteToItemInput.parse(input);
    return db.transaction(() => {
      const purchase = guard.requireActivePurchase(); const favorite = guard.requireFavorite(value.favoriteId);
      if (favorite.workspaceId !== purchase.workspaceId) throw new DomainError("Favorito de outro espaço.", 403);
      requirePerson(value.personId, purchase.workspaceId);
      return db.insert(purchaseItems).values({ id: crypto.randomUUID(), purchaseId: purchase.id, sourceFavoriteId: favorite.id, personId: value.personId, createdBy: userId, name: favorite.name, url: favorite.url, platform: favorite.platform, visualKey: favorite.visualKey, variant: value.variant, notes: value.notes, quantity: value.quantity, unitPriceCents: value.unitPriceCents, cartStatus: "pending", createdAt: new Date(), updatedAt: new Date() }).returning().get()!;
    });
  }
  function saveManualItem(input: unknown, id?: string) {
    const value = itemInput.parse(input);
    return db.transaction(() => {
      const purchase = id ? requireItem(id).purchase : guard.requireActivePurchase();
      requirePerson(value.personId, purchase.workspaceId);
      const derived = { platform: detectPlatform(value.url), visualKey: resolveProductVisual(value.name), updatedAt: new Date() };
      if (id) return db.update(purchaseItems).set({ ...value, ...derived }).where(eq(purchaseItems.id, id)).returning().get()!;
      return db.insert(purchaseItems).values({ id: crypto.randomUUID(), purchaseId: purchase.id, sourceFavoriteId: null, ...value, ...derived, createdBy: userId, cartStatus: "pending", createdAt: new Date() }).returning().get()!;
    });
  }
  function removePurchaseItem(id: string) { return db.transaction(() => { requireItem(id); db.delete(purchaseItems).where(eq(purchaseItems.id, id)).run(); }); }
  function setCartStatus(id: string, input: unknown) {
    const status = z.enum(["pending", "added"]).parse(input);
    return db.transaction(() => { requireItem(id); db.update(purchaseItems).set({ cartStatus: status, updatedAt: new Date() }).where(eq(purchaseItems.id, id)).run(); });
  }
  function finalizePurchase(id: string, confirmed: unknown) {
    if (confirmed !== true) throw new DomainError("Confirme a finalização da compra.");
    return db.transaction(() => { guard.requireEditablePurchase(id); return db.update(purchases).set({ status: "finalized", finalizedAt: new Date() }).where(eq(purchases.id, id)).returning().get()!; });
  }
  return { savePurchase, addFavoriteToPurchase, saveManualItem, removePurchaseItem, setCartStatus, finalizePurchase };
}
