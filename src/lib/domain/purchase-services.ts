import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../db/connection";
import { purchases, purchaseItems, purchaseItemParticipants } from "../db/schema";
import { authorization } from "./authorization";
import { purchaseInput, itemInput, favoriteToItemInput } from "./validation";
import { detectPlatform } from "./urls";
import { resolveProductCategory } from "./categories";
import { DomainError } from "./errors";
import { allocateItemCost, type CostParticipant, type SharingMode } from "./cost-sharing";

// The local libSQL adapter fails fast when two BEGIN IMMEDIATE writers overlap.
let purchaseTransactionTail: Promise<void> = Promise.resolve();

async function serializePurchaseTransaction<T>(operation: () => Promise<T>): Promise<T> {
  const previous = purchaseTransactionTail;
  let release!: () => void;
  purchaseTransactionTail = new Promise(resolve => { release = resolve; });
  await previous;
  try { return await operation(); }
  finally { release(); }
}

function isUniqueConstraint(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; message?: string; cause?: unknown };
  return /unique|constraint/i.test(`${value.code ?? ""} ${value.message ?? ""}`) || isUniqueConstraint(value.cause);
}

function checkedComposition(quantity: number, unitPriceCents: number | null, sharingMode: SharingMode, participants: CostParticipant[]) {
  try {
    const allocation = allocateItemCost({ quantity, unitPriceCents, sharingMode }, participants);
    const stored = participants.map((participant, allocationOrder) => ({
      personId: participant.personId,
      allocationOrder,
      percentageBps: sharingMode === "percentage" ? participant.percentageBps! : null,
      amountCents: sharingMode === "fixed" ? participant.amountCents! : null,
    }));
    return { sharingMode, allocation, stored };
  } catch (error) {
    throw new DomainError(error instanceof Error ? error.message : "Divisão do item inválida.", 400);
  }
}

export function purchaseServices(db: AppDatabase, userId: string) {
  const guard = authorization(db, userId);
  type PurchaseTransaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

  async function transact<T>(operation: (tx: PurchaseTransaction) => Promise<T>): Promise<T> {
    return serializePurchaseTransaction(() => db.transaction(operation));
  }

  async function savePurchase(input: unknown, id?: string) {
    const value = purchaseInput.parse(input);
    try {
      return await transact(async tx => {
        const txGuard = authorization(tx, userId);
        if (id) {
          await txGuard.requireEditablePurchase(id);
          const updated = await tx.update(purchases).set(value).where(and(eq(purchases.id, id), eq(purchases.status, "active"))).returning().get();
          if (!updated) throw new DomainError("Esta compra foi finalizada e não pode ser alterada.", 409);
          return updated;
        }
        const { workspaceId } = await txGuard.requireWorkspaceMember();
        const active = await tx.select().from(purchases).where(and(eq(purchases.workspaceId, workspaceId), eq(purchases.status, "active"))).get();
        if (active) throw new DomainError("Já existe uma compra ativa neste espaço.", 409);
        return tx.insert(purchases).values({ id: crypto.randomUUID(), workspaceId, ...value, status: "active", createdBy: userId, createdAt: new Date(), finalizedAt: null }).returning().get();
      });
    } catch (error) {
      if (isUniqueConstraint(error)) throw new DomainError("Já existe uma compra ativa neste espaço.", 409);
      throw error;
    }
  }

  async function requireEditableItem(tx: Parameters<Parameters<AppDatabase["transaction"]>[0]>[0], id: string) {
    const item = await tx.select().from(purchaseItems).where(eq(purchaseItems.id, id)).get();
    if (!item) throw new DomainError("Item não encontrado.", 404);
    const purchase = await authorization(tx, userId).requireEditablePurchase(item.purchaseId);
    return { item, purchase };
  }

  async function persistParticipants(tx: Parameters<Parameters<AppDatabase["transaction"]>[0]>[0], itemId: string, stored: ReturnType<typeof checkedComposition>["stored"]) {
    await tx.delete(purchaseItemParticipants).where(eq(purchaseItemParticipants.purchaseItemId, itemId)).run();
    await tx.insert(purchaseItemParticipants).values(stored.map(participant => ({ purchaseItemId: itemId, ...participant }))).run();
  }

  async function addFavoriteToPurchase(input: unknown) {
    const value = favoriteToItemInput.parse(input);
    return transact(async tx => {
      const txGuard = authorization(tx, userId);
      const purchase = await txGuard.requireActivePurchase();
      const favorite = await txGuard.requireFavorite(value.favoriteId);
      if (favorite.workspaceId !== purchase.workspaceId) throw new DomainError("Favorito de outro espaço.", 403);
      await txGuard.requireWorkspaceMembers(value.participants.map(p => p.personId), purchase.workspaceId);
      const composition = checkedComposition(value.quantity, value.unitPriceCents, value.sharingMode, value.participants);
      const now = new Date(), id = crypto.randomUUID();
      const item = await tx.insert(purchaseItems).values({ id, purchaseId: purchase.id, sourceFavoriteId: favorite.id, personId: value.personId, sharingMode: composition.sharingMode, createdBy: userId, name: favorite.name, url: favorite.url, platform: favorite.platform, visualKey: favorite.visualKey, variant: value.variant ?? null, notes: value.notes ?? null, quantity: value.quantity, unitPriceCents: value.unitPriceCents, cartStatus: "pending", createdAt: now, updatedAt: now }).returning().get();
      await persistParticipants(tx, id, composition.stored);
      return item;
    });
  }

  async function saveManualItem(input: unknown, id?: string) {
    const value = itemInput.parse(input);
    const composition = checkedComposition(value.quantity, value.unitPriceCents, value.sharingMode, value.participants);
    const derived = { platform: detectPlatform(value.url), visualKey: resolveProductCategory(value.name), updatedAt: new Date() };
    return transact(async tx => {
      const txGuard = authorization(tx, userId);
      const purchase = id ? (await requireEditableItem(tx, id)).purchase : await txGuard.requireActivePurchase();
      await txGuard.requireWorkspaceMembers(value.participants.map(p => p.personId), purchase.workspaceId);
      const fields = { name: value.name, url: value.url, personId: value.personId, sharingMode: composition.sharingMode, variant: value.variant ?? null, notes: value.notes ?? null, quantity: value.quantity, unitPriceCents: value.unitPriceCents, ...derived };
      if (id) {
        const updated = await tx.update(purchaseItems).set(fields).where(and(eq(purchaseItems.id, id), eq(purchaseItems.purchaseId, purchase.id))).returning().get();
        if (!updated) throw new DomainError("Item não encontrado.", 404);
        await persistParticipants(tx, id, composition.stored);
        return updated;
      }
      const newId = crypto.randomUUID(), now = new Date();
      const item = await tx.insert(purchaseItems).values({ id: newId, purchaseId: purchase.id, sourceFavoriteId: null, ...fields, createdBy: userId, cartStatus: "pending", createdAt: now }).returning().get();
      await persistParticipants(tx, newId, composition.stored);
      return item;
    });
  }

  async function removePurchaseItem(id: string) {
    await transact(async tx => {
      const { item } = await requireEditableItem(tx, id);
      await tx.delete(purchaseItems).where(and(eq(purchaseItems.id, item.id), eq(purchaseItems.purchaseId, item.purchaseId))).run();
    });
  }

  async function setCartStatus(id: string, input: unknown) {
    const status = z.enum(["pending", "added"]).parse(input);
    await transact(async tx => {
      const { item } = await requireEditableItem(tx, id);
      await tx.update(purchaseItems).set({ cartStatus: status, updatedAt: new Date() }).where(and(eq(purchaseItems.id, item.id), eq(purchaseItems.purchaseId, item.purchaseId))).run();
    });
  }

  async function setPersonItemsStatus(id: string, input: unknown) {
    const value = z.object({ personId: z.string().min(1), status: z.enum(["pending", "added"]) }).strict().parse(input);
    await transact(async tx => {
      const txGuard = authorization(tx, userId), purchase = await txGuard.requireEditablePurchase(id);
      await txGuard.requireWorkspaceMember(purchase.workspaceId);
      await authorization(tx, value.personId).requireWorkspaceMember(purchase.workspaceId);
      const previousStatus = value.status === "added" ? "pending" : "added";
      const participantRows = await tx.select({ itemId: purchaseItemParticipants.purchaseItemId }).from(purchaseItemParticipants).where(eq(purchaseItemParticipants.personId, value.personId)).all();
      const itemIds = [...new Set(participantRows.map(row => row.itemId))];
      if (!itemIds.length) return;
      await tx.update(purchaseItems).set({ cartStatus: value.status, updatedAt: new Date() }).where(and(eq(purchaseItems.purchaseId, id), eq(purchaseItems.cartStatus, previousStatus), inArray(purchaseItems.id, itemIds))).run();
    });
  }

  async function finalizePurchase(id: string, confirmed: unknown) {
    if (confirmed !== true) throw new DomainError("Confirme a finalização da compra.");
    return transact(async tx => {
      await authorization(tx, userId).requireEditablePurchase(id);
      const finalized = await tx.update(purchases).set({ status: "finalized", finalizedAt: new Date() }).where(and(eq(purchases.id, id), eq(purchases.status, "active"))).returning().get();
      if (!finalized) throw new DomainError("Esta compra foi finalizada e não pode ser alterada.", 409);
      return finalized;
    });
  }

  return { savePurchase, addFavoriteToPurchase, saveManualItem, removePurchaseItem, setCartStatus, setPersonItemsStatus, finalizePurchase, requireWorkspaceMember: guard.requireWorkspaceMember };
}
