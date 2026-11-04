import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import { user, userPreferences, workspaceMembers, workspaces } from "../db/schema";
import { DomainError } from "./errors";
import { serializeDomainTransaction } from "./transaction-lock";

/**
 * Ensures one private workspace exists and initializes the active context only
 * when the stored selection is missing or no longer accessible. The partial
 * unique index is the concurrency boundary; insert-first transactions serialize
 * competing provisioners before they inspect preferences or group memberships.
 */
export async function ensurePersonalWorkspace(db: AppDatabase, userId: string) {
  const provision = () => serializeDomainTransaction(() => db.transaction(async tx => {
    const now = new Date();
    const inserted = await tx.insert(workspaces).values({
      id: crypto.randomUUID(), name: "Espaço pessoal", kind: "personal", ownerUserId: userId, createdAt: now,
    }).onConflictDoNothing().run();

    const account = await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).get();
    if (!account) throw new DomainError("Conta não encontrada para provisionar o espaço pessoal.", 404);

    const personal = await tx.select().from(workspaces).where(and(
      eq(workspaces.kind, "personal"),
      eq(workspaces.ownerUserId, userId),
    )).get();
    if (!personal) throw new DomainError("Não foi possível garantir o espaço pessoal.", 500);

    const groups = await tx.select({ id: workspaces.id }).from(workspaces)
      .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(and(eq(workspaceMembers.userId, userId), eq(workspaces.kind, "shared"))).all();
    const preference = await tx.select().from(userPreferences).where(eq(userPreferences.userId, userId)).get();
    const authorizedWorkspaceIds = new Set([...groups.map(group => group.id), personal.id]);
    const activeWorkspaceId = preference?.activeWorkspaceId && authorizedWorkspaceIds.has(preference.activeWorkspaceId)
      ? preference.activeWorkspaceId
      : groups.length === 1
        ? groups[0].id
        : personal.id;

    await tx.insert(userPreferences).values({
      userId,
      favoritesView: "list",
      activeWorkspaceId,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: userPreferences.userId,
      set: { activeWorkspaceId, updatedAt: now },
    }).run();

    return { workspace: personal, created: inserted.rowsAffected > 0 };
  }));

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await provision();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = /SQLITE_BUSY|database is locked|SQLITE_LOCKED/i.test(message);
      if (!retryable || attempt >= 4) throw error;
      await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
}
