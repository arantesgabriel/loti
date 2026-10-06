import { desc, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import { collections, favorites, purchases, purchaseItems, userPreferences, user, workspaceMembers } from "../db/schema";
import { authorization } from "./authorization";
import { favoriteInput, collectionInput } from "./validation";
import { buildCanonicalProductKey, detectPlatform } from "./urls";
import { resolveProductCategory } from "./categories";
import { DomainError } from "./errors";
import { purchaseServices } from "./purchase-services";

export function createServices(db: AppDatabase, userId: string) {
  const guard = authorization(db, userId);

  async function collectionForFavorite(collectionId: string | null, workspaceId: string) {
    if (!collectionId) return;
    const collection = await guard.requireCollectionOwner(collectionId);
    if (collection.workspaceId !== workspaceId) throw new DomainError("Coleção de outro espaço.", 403);
  }

  async function getData() {
    const { workspaceId } = await guard.requireWorkspaceMember();
    const allPurchases = await db.select().from(purchases).where(eq(purchases.workspaceId, workspaceId)).orderBy(desc(purchases.createdAt)).all();
    const [currentUser, members, favoriteRows, collectionRows, items, preference] = await Promise.all([
      db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.id, userId)).get(),
      db.select({ id: user.id, name: user.name }).from(user).innerJoin(workspaceMembers, eq(user.id, workspaceMembers.userId)).where(eq(workspaceMembers.workspaceId, workspaceId)).orderBy(user.name).all(),
      db.select().from(favorites).where(eq(favorites.workspaceId, workspaceId)).orderBy(desc(favorites.createdAt)).all(),
      db.select().from(collections).where(eq(collections.workspaceId, workspaceId)).orderBy(collections.name).all(),
      allPurchases.length ? db.select().from(purchaseItems).where(inArray(purchaseItems.purchaseId, allPurchases.map(p => p.id))).orderBy(purchaseItems.createdAt).all() : Promise.resolve([]),
      db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).get(),
    ]);
    if (!currentUser) throw new DomainError("Conta não encontrada.", 401);
    return {
      currentUser, members, favorites: favoriteRows, collections: collectionRows,
      purchases: allPurchases, items, view: preference?.favoritesView ?? "list" as "list" | "cards",
    };
  }

  async function saveFavorite(input: unknown, id?: string) {
    const value = favoriteInput.parse(input);
    const { workspaceId } = id ? await guard.requireFavoriteOwner(id) : await guard.requireWorkspaceMember();
    await collectionForFavorite(value.collectionId, workspaceId);
    const derived = { platform: detectPlatform(value.url), canonicalProductKey: buildCanonicalProductKey(value.url), visualKey: resolveProductCategory(value.name), updatedAt: new Date() };
    if (id) return db.update(favorites).set({ ...value, ...derived }).where(eq(favorites.id, id)).returning().get();
    return db.insert(favorites).values({ id: crypto.randomUUID(), workspaceId, ownerId: userId, ...value, ...derived, createdAt: new Date() }).returning().get();
  }

  async function deleteFavorite(id: string) {
    await guard.requireFavoriteOwner(id);
    await db.delete(favorites).where(eq(favorites.id, id)).run();
  }

  async function saveCollection(input: unknown, id?: string) {
    const value = collectionInput.parse(input);
    const { workspaceId } = id ? await guard.requireCollectionOwner(id) : await guard.requireWorkspaceMember();
    if (id) return db.update(collections).set({ ...value, updatedAt: new Date() }).where(eq(collections.id, id)).returning().get();
    const now = new Date();
    return db.insert(collections).values({ id: crypto.randomUUID(), workspaceId, ownerId: userId, ...value, createdAt: now, updatedAt: now }).returning().get();
  }

  async function deleteCollection(id: string) {
    await guard.requireCollectionOwner(id);
    await db.delete(collections).where(eq(collections.id, id)).run();
  }

  async function setView(view: "list" | "cards") {
    await guard.requireWorkspaceMember();
    if (!(["list", "cards"] as const).includes(view)) throw new DomainError("Visualização inválida.");
    const now = new Date();
    await db.insert(userPreferences).values({ userId, favoritesView: view, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: userPreferences.userId, set: { favoritesView: view, updatedAt: now } }).run();
  }

  return { ...guard, ...purchaseServices(db, userId), getData, saveFavorite, deleteFavorite, saveCollection, deleteCollection, setView };
}

export type WorkspaceData = Awaited<ReturnType<ReturnType<typeof createServices>["getData"]>>;
// API serialization dates are represented as ISO strings; components never need database access.
export type ClientData = Omit<WorkspaceData, "favorites" | "collections" | "purchases" | "items"> & {
  favorites: (Omit<WorkspaceData["favorites"][number], "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string })[];
  collections: (Omit<WorkspaceData["collections"][number], "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string })[];
  purchases: (Omit<WorkspaceData["purchases"][number], "createdAt" | "finalizedAt"> & { createdAt: string; finalizedAt: string | null })[];
  items: (Omit<WorkspaceData["items"][number], "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string })[];
};
export function serializeData(data: WorkspaceData): ClientData { return JSON.parse(JSON.stringify(data)) as ClientData; }
