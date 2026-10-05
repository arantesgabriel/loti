import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import { workspaceMembers, favorites, collections, purchases } from "../db/schema";
import { DomainError } from "./errors";
export function authorization(db: AppDatabase, userId: string) {
  function requireWorkspaceMember(workspaceId?: string) {
    const membership = db.select().from(workspaceMembers).where(workspaceId ? and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId)) : eq(workspaceMembers.userId, userId)).get();
    if (!membership) throw new DomainError("Você não faz parte deste espaço.", 403);
    return membership;
  }
  function requireFavorite(id: string) {
    const favorite = db.select().from(favorites).where(eq(favorites.id, id)).get();
    if (!favorite) throw new DomainError("Favorito não encontrado.", 404);
    requireWorkspaceMember(favorite.workspaceId); return favorite;
  }
  function requireFavoriteOwner(id: string) { const f = requireFavorite(id); if (f.ownerId !== userId) throw new DomainError("Só o dono pode alterar este favorito.", 403); return f; }
  function requireCollectionOwner(id: string) {
    const c = db.select().from(collections).where(eq(collections.id, id)).get();
    if (!c) throw new DomainError("Coleção não encontrada.", 404);
    requireWorkspaceMember(c.workspaceId);
    if (c.ownerId !== userId) throw new DomainError("Só o dono pode alterar esta coleção.", 403);
    return c;
  }
  function requirePurchase(id: string) { const p = db.select().from(purchases).where(eq(purchases.id, id)).get(); if (!p) throw new DomainError("Compra não encontrada.", 404); requireWorkspaceMember(p.workspaceId); return p; }
  function requireEditablePurchase(id: string) { const p = requirePurchase(id); if (p.status !== "active") throw new DomainError("Esta compra foi finalizada e não pode ser alterada.", 409); return p; }
  function requireActivePurchase() { const { workspaceId } = requireWorkspaceMember(); const p = db.select().from(purchases).where(and(eq(purchases.workspaceId, workspaceId), eq(purchases.status, "active"))).get(); if (!p) throw new DomainError("Crie uma compra antes de adicionar itens.", 409); return p; }
  return { requireWorkspaceMember, requireFavorite, requireFavoriteOwner, requireCollectionOwner, requirePurchase, requireEditablePurchase, requireActivePurchase };
}
