import { and, eq, inArray, sql } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import { accountActivationRequirements, user, workspaceMembers, userPreferences, favorites, collections, purchases, workspaces } from "../db/schema";
import { DomainError } from "./errors";
type AuthorizationDatabase = Pick<AppDatabase, "select"> & Partial<Pick<AppDatabase, "all" | "update">>;
export function authorization(db: AuthorizationDatabase, userId: string) {
  let hasWorkspaceKind: Promise<boolean> | undefined;
  let hasActivationRequirements: Promise<boolean> | undefined;

  function supportsWorkspaceKinds() {
    if (!db.all) return Promise.resolve(true);
    return hasWorkspaceKind ??= db.all<{ name: string }>(sql`PRAGMA table_info(workspaces)`)
      .then(columns => columns.some(column => column.name === "kind"));
  }

  function supportsActivationRequirements() {
    if (!db.all) return Promise.resolve(false);
    return hasActivationRequirements ??= db.all<{ name: string }>(sql`PRAGMA table_info(account_activation_requirements)`)
      .then(columns => columns.length > 0);
  }

  async function requireActivatedAccount() {
    if (!await supportsActivationRequirements()) return;
    const accountState = await db.select({
      required: accountActivationRequirements.userId,
      verified: user.emailVerified,
    }).from(user).leftJoin(accountActivationRequirements, eq(accountActivationRequirements.userId, user.id))
      .where(eq(user.id, userId)).get();
    if (accountState?.required && !accountState.verified) {
      throw new DomainError("Confirme seu email para acessar o Loti.", 403, "EMAIL_ACTIVATION_REQUIRED");
    }
  }

  async function legacySharedWorkspace(id: string) {
    if (!db.all) throw new DomainError("Não foi possível identificar este espaço.", 500);
    const rows = await db.all<{ id: string; name: string; created_at: number | string }>(sql`
      SELECT id, name, created_at FROM workspaces WHERE id = ${id} LIMIT 1
    `);
    const row = rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      kind: "shared" as const,
      ownerUserId: null,
      createdAt: new Date(Number(row.created_at)),
    };
  }

  async function getWorkspace(id: string) {
    return await supportsWorkspaceKinds()
      ? db.select().from(workspaces).where(eq(workspaces.id, id)).get()
      : legacySharedWorkspace(id);
  }

  async function listSharedWorkspaces() {
    if (await supportsWorkspaceKinds()) {
      return db.select({ workspace: workspaces }).from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
        .where(and(eq(workspaceMembers.userId, userId), eq(workspaces.kind, "shared"))).all();
    }

    if (!db.all) throw new DomainError("Não foi possível identificar os espaços autorizados.", 500);
    const rows = await db.all<{ id: string; name: string; created_at: number | string }>(sql`
      SELECT w.id, w.name, w.created_at
      FROM workspaces w
      INNER JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = ${userId}
      ORDER BY w.created_at
    `);
    return rows.map(row => ({ workspace: {
      id: row.id,
      name: row.name,
      kind: "shared" as const,
      ownerUserId: null,
      createdAt: new Date(Number(row.created_at)),
    } }));
  }

  async function canAccessWorkspace(workspace: typeof workspaces.$inferSelect) {
    if (workspace.kind === "personal") return workspace.ownerUserId === userId;
    if (workspace.kind !== "shared") return false;
    return !!await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspace.id))).get();
  }

  async function resolveActiveWorkspace() {
    for (;;) {
      const preference = await db.select({ id: userPreferences.activeWorkspaceId }).from(userPreferences).where(eq(userPreferences.userId, userId)).get();
      if (!preference?.id) break;
      const active = await getWorkspace(preference.id);
      if (active && await canAccessWorkspace(active)) return active;
      // Compare-and-clear so a concurrent invitation acceptance or workspace
      // switch cannot have its newer selection erased by this stale read.
      if (!db.update) break;
      await db.update(userPreferences).set({ activeWorkspaceId: null, updatedAt: new Date() })
        .where(and(eq(userPreferences.userId, userId), eq(userPreferences.activeWorkspaceId, preference.id))).run();
      // Re-read after both a successful clear and a lost compare-and-clear race.
    }

    const supportsKinds = await supportsWorkspaceKinds();
    const [groups, personal] = await Promise.all([
      listSharedWorkspaces(),
      supportsKinds
        ? db.select().from(workspaces).where(and(eq(workspaces.kind, "personal"), eq(workspaces.ownerUserId, userId))).get()
        : Promise.resolve(undefined),
    ]);
    // Preserve a single legacy group when no valid preference exists. Multiple
    // groups are ambiguous, so provisioned users fall back to their private space.
    if (groups.length === 1) return groups[0].workspace;
    if (personal) return personal;
    if (groups.length > 1) throw new DomainError("Escolha um espaço autorizado antes de continuar.", 409, "WORKSPACE_SELECTION_REQUIRED");
    throw new DomainError("Você ainda não tem um espaço pessoal ou compartilhado disponível.", 403, "NO_WORKSPACE_AVAILABLE");
  }

  async function listAccessibleWorkspaces() {
    const [groups, supportsKinds] = await Promise.all([listSharedWorkspaces(), supportsWorkspaceKinds()]);
    const personal = supportsKinds
      ? await db.select().from(workspaces).where(and(eq(workspaces.kind, "personal"), eq(workspaces.ownerUserId, userId))).get()
      : undefined;
    return [
      ...(personal ? [personal] : []),
      ...groups.map(({ workspace }) => workspace),
    ].sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "personal" ? -1 : 1;
      return left.name.localeCompare(right.name, "pt-BR");
    });
  }

  async function requireWorkspaceAccess(workspaceId?: string) {
    await requireActivatedAccount();
    const workspace = workspaceId
      ? await getWorkspace(workspaceId)
      : await resolveActiveWorkspace();
    if (!workspace || !await canAccessWorkspace(workspace)) throw new DomainError("Você não tem acesso a este espaço.", 403);
    return { workspaceId: workspace.id, kind: workspace.kind, ownerUserId: workspace.ownerUserId, workspace };
  }

  async function requireActiveWorkspaceContext(workspaceId: string) {
    // Establish access to the requested workspace before comparing the active
    // context; otherwise a non-member gets a misleading 409 for an inaccessible ID.
    const requested = await requireWorkspaceAccess(workspaceId);
    const active = await resolveActiveWorkspace();
    if (active.id !== workspaceId) throw new DomainError("O espaço ativo mudou. Atualize a tela antes de salvar novamente.", 409, "WORKSPACE_CONTEXT_CHANGED");
    return requested;
  }

  async function requireWorkspaceMember(workspaceId?: string) {
    await requireActivatedAccount();
    const workspace = workspaceId ? await getWorkspace(workspaceId) : await resolveActiveWorkspace();
    if (!workspace) throw new DomainError("Você não tem acesso a este espaço.", 403);
    if (workspace.kind === "personal") {
      if (!await canAccessWorkspace(workspace)) throw new DomainError("Você não tem acesso a este espaço.", 403);
      throw new DomainError("Esta ação exige participação em um espaço compartilhado.", 403);
    }
    if (workspace.kind !== "shared") throw new DomainError("Você não tem acesso a este espaço.", 403);
    const membership = await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspace.id))).get();
    if (!membership) throw new DomainError("Você não faz parte deste espaço.", 403);
    return membership;
  }

  async function requireWorkspaceMembers(userIds: string[], workspaceId: string) {
    if (!userIds.length || new Set(userIds).size !== userIds.length) throw new DomainError("Selecione pessoas diferentes para dividir o item.", 400);
    const access = await requireWorkspaceAccess(workspaceId);
    if (access.kind === "personal") {
      if (userIds.some(id => id !== access.ownerUserId)) throw new DomainError("O espaço pessoal aceita apenas seu titular.", 403);
      return userIds.map(personId => ({ userId: personId }));
    }
    const rows = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), inArray(workspaceMembers.userId, userIds))).all();
    if (rows.length !== userIds.length) throw new DomainError("Todas as pessoas precisam fazer parte deste espaço.", 403);
    return rows;
  }
  async function requireFavorite(id: string) {
    const favorite = await db.select().from(favorites).where(eq(favorites.id, id)).get();
    if (!favorite) throw new DomainError("Favorito não encontrado.", 404);
    await requireWorkspaceAccess(favorite.workspaceId); return favorite;
  }
  async function requireFavoriteOwner(id: string) { const f = await requireFavorite(id); if (f.ownerId !== userId) throw new DomainError("Só o dono pode alterar este favorito.", 403); return f; }
  async function requireCollectionOwner(id: string) {
    const c = await db.select().from(collections).where(eq(collections.id, id)).get();
    if (!c) throw new DomainError("Coleção não encontrada.", 404);
    await requireWorkspaceAccess(c.workspaceId);
    if (c.ownerId !== userId) throw new DomainError("Só o dono pode alterar esta coleção.", 403);
    return c;
  }
  async function requirePurchaseAccess(id: string) {
    const purchase = await db.select().from(purchases).where(eq(purchases.id, id)).get();
    if (!purchase) throw new DomainError("Compra não encontrada.", 404);
    await requireWorkspaceAccess(purchase.workspaceId);
    return purchase;
  }
  // Keep logistics/QC shared-only. Purchase itself supports owner access in personal spaces.
  async function requirePurchase(id: string) {
    const purchase = await requirePurchaseAccess(id);
    await requireWorkspaceMember(purchase.workspaceId);
    return purchase;
  }
  async function requireEditablePurchase(id: string) {
    const purchase = await requirePurchaseAccess(id);
    await requireActiveWorkspaceContext(purchase.workspaceId);
    if (purchase.status !== "active") throw new DomainError("Esta compra foi finalizada e não pode ser alterada.", 409);
    return purchase;
  }
  async function requireActivePurchase(workspaceId?: string) {
    const access = await requireWorkspaceAccess(workspaceId);
    const purchase = await db.select().from(purchases).where(and(eq(purchases.workspaceId, access.workspaceId), eq(purchases.status, "active"))).get();
    if (!purchase) throw new DomainError("Crie uma compra antes de adicionar itens.", 409);
    return purchase;
  }
  return { requireWorkspaceAccess, requireActiveWorkspaceContext, listAccessibleWorkspaces, resolveActiveWorkspace, requireWorkspaceMember, requireWorkspaceMembers, requireFavorite, requireFavoriteOwner, requireCollectionOwner, requirePurchase, requirePurchaseAccess, requireEditablePurchase, requireActivePurchase };
}
