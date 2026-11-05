import { desc, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import { collections, favorites, purchases, purchaseItems, purchaseItemParticipants, userPreferences, user, workspaceMembers } from "../db/schema";
import { authorization } from "./authorization";
import { favoriteInput, collectionInput } from "./validation";
import { buildCanonicalProductKey, detectPlatform } from "./urls";
import { resolveProductCategory } from "./categories";
import { DomainError } from "./errors";
import { purchaseServices } from "./purchase-services";
import { allocateItemCost } from "./cost-sharing";
import { serializeDomainTransaction } from "./transaction-lock";

export function createServices(db: AppDatabase, userId: string, initializeCosts?: Parameters<typeof purchaseServices>[2]) {
  const guard = authorization(db, userId);

  async function collectionForFavorite(collectionId: string | null, workspaceId: string) {
    if (!collectionId) return;
    const collection = await guard.requireCollectionOwner(collectionId);
    if (collection.workspaceId !== workspaceId) throw new DomainError("Coleção de outro espaço.", 403);
  }

  async function getData(requestedWorkspaceId?: string) {
    const { workspaceId, workspace } = await guard.requireWorkspaceAccess(requestedWorkspaceId);
    const allPurchases = await db.select().from(purchases).where(eq(purchases.workspaceId, workspaceId)).orderBy(desc(purchases.createdAt)).all();
    const [currentUser, members, favoriteRows, collectionRows, itemRows, preference, accessibleWorkspaces] = await Promise.all([
      db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.id, userId)).get(),
      workspace.kind === "personal"
        ? db.select({ id: user.id, name: user.name }).from(user).where(eq(user.id, workspace.ownerUserId!)).orderBy(user.name).all()
        : db.select({ id: user.id, name: user.name }).from(user).innerJoin(workspaceMembers, eq(user.id, workspaceMembers.userId)).where(eq(workspaceMembers.workspaceId, workspaceId)).orderBy(user.name).all(),
      db.select().from(favorites).where(eq(favorites.workspaceId, workspaceId)).orderBy(desc(favorites.createdAt)).all(),
      db.select().from(collections).where(eq(collections.workspaceId, workspaceId)).orderBy(collections.name).all(),
      allPurchases.length ? db.select().from(purchaseItems).where(inArray(purchaseItems.purchaseId, allPurchases.map(p => p.id))).orderBy(purchaseItems.createdAt).all() : Promise.resolve([]),
      db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).get(),
      guard.listAccessibleWorkspaces(),
    ]);
    if (!currentUser) throw new DomainError("Conta não encontrada.", 401);
    const participantRows = itemRows.length ? await db.select().from(purchaseItemParticipants).where(inArray(purchaseItemParticipants.purchaseItemId, itemRows.map(item => item.id))).orderBy(purchaseItemParticipants.purchaseItemId, purchaseItemParticipants.allocationOrder).all() : [];
    const participantMap = new Map<string, typeof participantRows>();
    for (const participant of participantRows) participantMap.set(participant.purchaseItemId, [...(participantMap.get(participant.purchaseItemId) ?? []), participant]);
    const items = itemRows.map(item => {
      const stored = participantMap.get(item.id) ?? [{ purchaseItemId: item.id, personId: item.personId, allocationOrder: 0, percentageBps: null, amountCents: null }];
      const allocation = allocateItemCost(item, stored.map(p => ({ personId: p.personId, percentageBps: p.percentageBps, amountCents: p.amountCents })));
      return { ...item, participants: stored.map((participant, index) => ({ ...participant, shareCents: allocation.participants[index].amountCents })) };
    });
    return {
      workspaceId, workspaceKind: workspace.kind, workspaces: accessibleWorkspaces.map(item => ({ id: item.id, name: item.name, kind: item.kind })),
      currentUser, members, favorites: favoriteRows, collections: collectionRows,
      purchases: allPurchases, items, view: preference?.favoritesView ?? "list" as "list" | "cards",
    };
  }

  async function selectWorkspace(workspaceId: string, expectedWorkspaceId?: string) {
    await serializeDomainTransaction(() => db.transaction(async tx => {
      const txGuard = authorization(tx, userId);
      if (expectedWorkspaceId) await txGuard.requireActiveWorkspaceContext(expectedWorkspaceId);
      const access = await txGuard.requireWorkspaceAccess(workspaceId);
      const preference = await tx.select().from(userPreferences).where(eq(userPreferences.userId, userId)).get();
      if (preference?.activeWorkspaceId === access.workspaceId) return;
      const now = new Date();
      await tx.insert(userPreferences).values({ userId, activeWorkspaceId: access.workspaceId, favoritesView: preference?.favoritesView ?? "list", createdAt: preference?.createdAt ?? now, updatedAt: now })
        .onConflictDoUpdate({ target: userPreferences.userId, set: { activeWorkspaceId: access.workspaceId, updatedAt: now } }).run();
    }));
    return getData(workspaceId);
  }

  async function saveFavorite(input: unknown, id?: string, expectedWorkspaceId?: string) {
    const value = favoriteInput.parse(input);
    const context = expectedWorkspaceId ? await guard.requireActiveWorkspaceContext(expectedWorkspaceId) : null;
    const favorite = id ? await guard.requireFavoriteOwner(id) : null;
    if (favorite && expectedWorkspaceId && favorite.workspaceId !== expectedWorkspaceId) throw new DomainError("O favorito pertence a outro espaço. Atualize a tela antes de salvar novamente.", 409, "WORKSPACE_CONTEXT_CHANGED");
    const workspaceId = favorite?.workspaceId ?? context?.workspaceId ?? (await guard.requireWorkspaceAccess()).workspaceId;
    await collectionForFavorite(value.collectionId, workspaceId);
    const derived = { platform: detectPlatform(value.url), canonicalProductKey: buildCanonicalProductKey(value.url), visualKey: resolveProductCategory(value.name), updatedAt: new Date() };
    if (id) return db.update(favorites).set({ ...value, ...derived }).where(eq(favorites.id, id)).returning().get();
    return db.insert(favorites).values({ id: crypto.randomUUID(), workspaceId, ownerId: userId, ...value, ...derived, createdAt: new Date() }).returning().get();
  }

  async function deleteFavorite(id: string, expectedWorkspaceId?: string) {
    if (expectedWorkspaceId) await guard.requireActiveWorkspaceContext(expectedWorkspaceId);
    const favorite = await guard.requireFavoriteOwner(id);
    if (expectedWorkspaceId && favorite.workspaceId !== expectedWorkspaceId) throw new DomainError("O favorito pertence a outro espaço. Atualize a tela antes de salvar novamente.", 409, "WORKSPACE_CONTEXT_CHANGED");
    await db.delete(favorites).where(eq(favorites.id, id)).run();
  }

  async function saveCollection(input: unknown, id?: string, expectedWorkspaceId?: string) {
    const value = collectionInput.parse(input);
    const context = expectedWorkspaceId ? await guard.requireActiveWorkspaceContext(expectedWorkspaceId) : null;
    const collection = id ? await guard.requireCollectionOwner(id) : null;
    if (collection && expectedWorkspaceId && collection.workspaceId !== expectedWorkspaceId) throw new DomainError("A coleção pertence a outro espaço. Atualize a tela antes de salvar novamente.", 409, "WORKSPACE_CONTEXT_CHANGED");
    const workspaceId = collection?.workspaceId ?? context?.workspaceId ?? (await guard.requireWorkspaceAccess()).workspaceId;
    if (id) return db.update(collections).set({ ...value, updatedAt: new Date() }).where(eq(collections.id, id)).returning().get();
    const now = new Date();
    return db.insert(collections).values({ id: crypto.randomUUID(), workspaceId, ownerId: userId, ...value, createdAt: now, updatedAt: now }).returning().get();
  }

  async function deleteCollection(id: string, expectedWorkspaceId?: string) {
    if (expectedWorkspaceId) await guard.requireActiveWorkspaceContext(expectedWorkspaceId);
    const collection = await guard.requireCollectionOwner(id);
    if (expectedWorkspaceId && collection.workspaceId !== expectedWorkspaceId) throw new DomainError("A coleção pertence a outro espaço. Atualize a tela antes de salvar novamente.", 409, "WORKSPACE_CONTEXT_CHANGED");
    await db.delete(collections).where(eq(collections.id, id)).run();
  }

  async function setView(view: "list" | "cards", expectedWorkspaceId?: string) {
    if (expectedWorkspaceId) await guard.requireActiveWorkspaceContext(expectedWorkspaceId);
    else await guard.requireWorkspaceAccess();
    if (!(["list", "cards"] as const).includes(view)) throw new DomainError("Visualização inválida.");
    const now = new Date();
    await db.insert(userPreferences).values({ userId, favoritesView: view, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: userPreferences.userId, set: { favoritesView: view, updatedAt: now } }).run();
  }

  return { ...guard, ...purchaseServices(db, userId, initializeCosts), getData, selectWorkspace, saveFavorite, deleteFavorite, saveCollection, deleteCollection, setView };
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
