import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../db/connection";
import { purchases, purchaseItems } from "../db/schema";
import { authorization } from "./authorization";
import { purchaseInput, itemInput, favoriteToItemInput } from "./validation";
import { detectPlatform } from "./urls";
import { resolveProductCategory } from "./categories";
import { DomainError } from "./errors";

function isUniqueConstraint(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; message?: string; cause?: unknown };
  return /unique|constraint/i.test(`${value.code ?? ""} ${value.message ?? ""}`) || isUniqueConstraint(value.cause);
}

export function purchaseServices(db: AppDatabase, userId: string) {
  const guard = authorization(db, userId);

  async function savePurchase(input: unknown, id?: string) {
    const value = purchaseInput.parse(input);
    if (id) {
      await guard.requireEditablePurchase(id);
      const updated = await db.update(purchases).set(value).where(and(eq(purchases.id, id), eq(purchases.status, "active"))).returning().get();
      if (!updated) throw new DomainError("Esta compra foi finalizada e não pode ser alterada.", 409);
      return updated;
    }
    const { workspaceId } = await guard.requireWorkspaceMember();
    const active = await db.select().from(purchases).where(and(eq(purchases.workspaceId, workspaceId), eq(purchases.status, "active"))).get();
    if (active) throw new DomainError("Já existe uma compra ativa neste espaço.", 409);
    try {
      return await db.insert(purchases).values({ id: crypto.randomUUID(), workspaceId, ...value, status: "active", createdBy: userId, createdAt: new Date(), finalizedAt: null }).returning().get();
    } catch (error) {
      if (isUniqueConstraint(error)) throw new DomainError("Já existe uma compra ativa neste espaço.", 409);
      throw error;
    }
  }

  async function requireItem(id: string) {
    const item = await db.select().from(purchaseItems).where(eq(purchaseItems.id, id)).get();
    if (!item) throw new DomainError("Item não encontrado.", 404);
    const purchase = await guard.requireEditablePurchase(item.purchaseId);
    return { item, purchase };
  }

  async function requirePerson(personId: string, workspaceId: string) {
    await authorization(db, personId).requireWorkspaceMember(workspaceId);
  }

  async function addFavoriteToPurchase(input: unknown) {
    const value = favoriteToItemInput.parse(input);
    const purchase = await guard.requireActivePurchase();
    const favorite = await guard.requireFavorite(value.favoriteId);
    if (favorite.workspaceId !== purchase.workspaceId) throw new DomainError("Favorito de outro espaço.", 403);
    await requirePerson(value.personId, purchase.workspaceId);
    return db.insert(purchaseItems).values({ id: crypto.randomUUID(), purchaseId: purchase.id, sourceFavoriteId: favorite.id, personId: value.personId, createdBy: userId, name: favorite.name, url: favorite.url, platform: favorite.platform, visualKey: favorite.visualKey, variant: value.variant, notes: value.notes, quantity: value.quantity, unitPriceCents: value.unitPriceCents, cartStatus: "pending", createdAt: new Date(), updatedAt: new Date() }).returning().get();
  }

  async function saveManualItem(input: unknown, id?: string) {
    const value = itemInput.parse(input);
    const purchase = id ? (await requireItem(id)).purchase : await guard.requireActivePurchase();
    await requirePerson(value.personId, purchase.workspaceId);
    const derived = { platform: detectPlatform(value.url), visualKey: resolveProductCategory(value.name), updatedAt: new Date() };
    if (id) {
      const updated = await db.update(purchaseItems).set({ ...value, ...derived }).where(eq(purchaseItems.id, id)).returning().get();
      if (!updated) throw new DomainError("Item não encontrado.", 404);
      return updated;
    }
    return db.insert(purchaseItems).values({ id: crypto.randomUUID(), purchaseId: purchase.id, sourceFavoriteId: null, ...value, ...derived, createdBy: userId, cartStatus: "pending", createdAt: new Date() }).returning().get();
  }

  async function removePurchaseItem(id: string) {
    await requireItem(id);
    await db.delete(purchaseItems).where(eq(purchaseItems.id, id)).run();
  }

  async function setCartStatus(id: string, input: unknown) {
    const status = z.enum(["pending", "added"]).parse(input);
    await requireItem(id);
    await db.update(purchaseItems).set({ cartStatus: status, updatedAt: new Date() }).where(eq(purchaseItems.id, id)).run();
  }

  async function finalizePurchase(id: string, confirmed: unknown) {
    if (confirmed !== true) throw new DomainError("Confirme a finalização da compra.");
    await guard.requireEditablePurchase(id);
    const finalized = await db.update(purchases).set({ status: "finalized", finalizedAt: new Date() }).where(and(eq(purchases.id, id), eq(purchases.status, "active"))).returning().get();
    if (!finalized) throw new DomainError("Esta compra foi finalizada e não pode ser alterada.", 409);
    return finalized;
  }

  return { savePurchase, addFavoriteToPurchase, saveManualItem, removePurchaseItem, setCartStatus, finalizePurchase };
}
