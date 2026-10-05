import { desc, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import { collections, favorites, purchases, purchaseItems, userPreferences, user, workspaceMembers } from "../db/schema";
import { authorization } from "./authorization";
import { favoriteInput, collectionInput } from "./validation";
import { buildCanonicalProductKey, detectPlatform } from "./urls";
import { resolveProductVisual } from "./visuals";
import { DomainError } from "./errors";
import { purchaseServices } from "./purchase-services";
export function createServices(db: AppDatabase, userId: string) {
  const guard = authorization(db, userId);
  function collectionForFavorite(collectionId: string | null, workspaceId: string) {
    if (!collectionId) return;
    const collection = guard.requireCollectionOwner(collectionId);
    if (collection.workspaceId !== workspaceId) throw new DomainError("Coleção de outro espaço.", 403);
  }
  function getData() {
    const { workspaceId } = guard.requireWorkspaceMember();
    const allPurchases = db.select().from(purchases).where(eq(purchases.workspaceId, workspaceId)).orderBy(desc(purchases.createdAt)).all();
    return {
      currentUser: db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.id, userId)).get()!,
      members: db.select({ id: user.id, name: user.name }).from(user).innerJoin(workspaceMembers, eq(user.id, workspaceMembers.userId)).where(eq(workspaceMembers.workspaceId, workspaceId)).orderBy(user.name).all(),
      favorites: db.select().from(favorites).where(eq(favorites.workspaceId, workspaceId)).orderBy(desc(favorites.createdAt)).all(),
      collections: db.select().from(collections).where(eq(collections.workspaceId, workspaceId)).orderBy(collections.name).all(),
      purchases: allPurchases,
      items: allPurchases.length ? db.select().from(purchaseItems).where(inArray(purchaseItems.purchaseId, allPurchases.map(p => p.id))).orderBy(purchaseItems.createdAt).all() : [],
      view: db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).get()?.favoritesView ?? "list" as "list" | "cards",
    };
  }
  function saveFavorite(input: unknown, id?: string) {
    const value = favoriteInput.parse(input);
    return db.transaction(() => {
      const { workspaceId } = id ? guard.requireFavoriteOwner(id) : guard.requireWorkspaceMember();
      collectionForFavorite(value.collectionId, workspaceId);
      const derived = { platform: detectPlatform(value.url), canonicalProductKey: buildCanonicalProductKey(value.url), visualKey: resolveProductVisual(value.name), updatedAt: new Date() };
      if (id) return db.update(favorites).set({ ...value, ...derived }).where(eq(favorites.id, id)).returning().get()!;
      return db.insert(favorites).values({ id: crypto.randomUUID(), workspaceId, ownerId: userId, ...value, ...derived, createdAt: new Date() }).returning().get()!;
    });
  }
  function deleteFavorite(id: string) { return db.transaction(() => { guard.requireFavoriteOwner(id); db.delete(favorites).where(eq(favorites.id, id)).run(); }); }
  function saveCollection(input: unknown, id?: string) {
    const value = collectionInput.parse(input);
    return db.transaction(() => {
      const { workspaceId } = id ? guard.requireCollectionOwner(id) : guard.requireWorkspaceMember();
      if (id) return db.update(collections).set({ ...value, updatedAt: new Date() }).where(eq(collections.id, id)).returning().get()!;
      return db.insert(collections).values({ id: crypto.randomUUID(), workspaceId, ownerId: userId, ...value, createdAt: new Date(), updatedAt: new Date() }).returning().get()!;
    });
  }
  function deleteCollection(id: string) { return db.transaction(() => { guard.requireCollectionOwner(id); db.delete(collections).where(eq(collections.id, id)).run(); }); }
  function setView(view: "list" | "cards") {
    guard.requireWorkspaceMember();
    if (!["list", "cards"].includes(view)) throw new DomainError("Visualização inválida.");
    const now = new Date();
    db.insert(userPreferences).values({ userId, favoritesView: view, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: userPreferences.userId, set: { favoritesView: view, updatedAt: now } }).run();
  }
  return { ...guard, ...purchaseServices(db, userId), getData, saveFavorite, deleteFavorite, saveCollection, deleteCollection, setView };
}
export type WorkspaceData = ReturnType<ReturnType<typeof createServices>["getData"]>;
// API serialization dates are represented as ISO strings; components never need database access.
export type ClientData = Omit<WorkspaceData, "favorites" | "collections" | "purchases" | "items"> & {
  favorites: (Omit<WorkspaceData["favorites"][number], "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string })[];
  collections: (Omit<WorkspaceData["collections"][number], "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string })[];
  purchases: (Omit<WorkspaceData["purchases"][number], "createdAt" | "finalizedAt"> & { createdAt: string; finalizedAt: string | null })[];
  items: (Omit<WorkspaceData["items"][number], "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string })[];
};
export function serializeData(data: WorkspaceData): ClientData { return JSON.parse(JSON.stringify(data)) as ClientData; }
