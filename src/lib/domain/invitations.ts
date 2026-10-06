import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../db/connection";
import { invitationLimits, workspaceInvitations as invites, workspaceMembers, workspaces, user, userPreferences } from "../db/schema";
import { createAuth } from "../auth/config";
import { authorization } from "./authorization";
import { DomainError } from "./errors";

const emailInput = z.string().trim().email().transform(v => v.toLowerCase());
const accountInput = z.object({ name: z.string().trim().min(1).max(200), password: z.string().min(12).max(128) });
export const hashInviteToken = (token: string) => createHash("sha256").update(token).digest("hex");
function tokenHash(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new DomainError("Convite inválido. Peça um novo link ao grupo.", 404);
  return hashInviteToken(token);
}
function state(invite: typeof invites.$inferSelect) {
  if (invite.revokedAt) return "revoked";
  if (invite.acceptedAt) return "accepted";
  return invite.expiresAt.getTime() <= Date.now() ? "expired" : "pending";
}
const stateErrors = { revoked: "Este convite foi revogado.", accepted: "Este convite já foi usado.", expired: "Este convite expirou." };
function requirePending(invite: typeof invites.$inferSelect | undefined) {
  if (!invite) throw new DomainError("Convite inválido. Peça um novo link ao grupo.", 404);
  const status = state(invite);
  if (status !== "pending") throw new DomainError(`${stateErrors[status]} Peça um novo link ao grupo.`, 410);
  return invite;
}

// Persistent fixed-window limits apply across application instances. Token keys are hashed.
export async function limitInvitations(db: AppDatabase, key: string, max: number) {
  const window = Math.floor(Date.now() / 60_000);
  await db.delete(invitationLimits).where(lt(invitationLimits.window, window - 60)).run();
  const row = await db.insert(invitationLimits).values({ key, window, count: 1 }).onConflictDoUpdate({
    target: invitationLimits.key,
    set: { window, count: sql`CASE WHEN ${invitationLimits.window} = ${window} THEN ${invitationLimits.count} + 1 ELSE 1 END` },
  }).returning().get();
  if (row.count > max) throw new DomainError("Muitas tentativas. Aguarde um minuto e tente novamente.", 429);
}

export function invitationService(db: AppDatabase) {
  async function group(userId: string) {
    const { workspaceId } = await authorization(db, userId).requireWorkspaceMember();
    const workspace = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).get();
    const members = await db.select({ id: user.id, name: user.name, email: user.email }).from(user).innerJoin(workspaceMembers, eq(user.id, workspaceMembers.userId)).where(eq(workspaceMembers.workspaceId, workspaceId)).orderBy(user.name).all();
    const rows = await db.select().from(invites).where(eq(invites.workspaceId, workspaceId)).orderBy(invites.createdAt).all();
    return { workspace, members, invitations: rows.map(i => ({ id: i.id, email: i.email, createdBy: i.createdBy, expiresAt: i.expiresAt.toISOString(), state: state(i) })) };
  }
  async function issue(userId: string, emailValue: unknown, previousId?: string) {
    const { workspaceId } = await authorization(db, userId).requireWorkspaceMember();
    const email = emailInput.parse(emailValue);
    const token = randomBytes(32).toString("base64url"), now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    await db.transaction(async tx => {
      // A write first obtains the SQLite writer lock before reading membership or invitations.
      if (previousId) {
        const previous = await tx.update(invites).set({ revokedAt: now, revokedBy: userId }).where(and(eq(invites.id, previousId), eq(invites.workspaceId, workspaceId), eq(invites.email, email), isNull(invites.acceptedAt), isNull(invites.revokedAt))).returning().get();
        if (!previous) throw new DomainError("Este convite não pode ser substituído. Atualize a página.", 409);
      } else {
        await tx.update(invites).set({ revokedAt: now, revokedBy: userId }).where(and(eq(invites.workspaceId, workspaceId), eq(invites.email, email), isNull(invites.acceptedAt), isNull(invites.revokedAt), sql`${invites.expiresAt} <= ${now.getTime()}`)).run();
      }
      const existingMember = await tx.select({ id: user.id }).from(user).innerJoin(workspaceMembers, eq(user.id, workspaceMembers.userId)).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(user.email, email))).get();
      if (existingMember) throw new DomainError("Esta pessoa já faz parte do grupo.", 409);
      const open = await tx.select().from(invites).where(and(eq(invites.workspaceId, workspaceId), eq(invites.email, email), isNull(invites.acceptedAt), isNull(invites.revokedAt))).get();
      if (open) throw new DomainError("Já existe um convite pendente para este email. Use Gerar novo link.", 409);
      await tx.insert(invites).values({ id: crypto.randomUUID(), workspaceId, email, tokenHash: hashInviteToken(token), createdBy: userId, createdAt: now, expiresAt }).run();
    });
    return { token, expiresAt: expiresAt.toISOString() };
  }
  async function revoke(userId: string, id: string) {
    const { workspaceId } = await authorization(db, userId).requireWorkspaceMember();
    const result = await db.update(invites).set({ revokedAt: new Date(), revokedBy: userId }).where(and(eq(invites.id, id), eq(invites.workspaceId, workspaceId), isNull(invites.acceptedAt), isNull(invites.revokedAt))).returning().get();
    if (!result) throw new DomainError("Este convite não pode ser revogado. Atualize a página.", 409);
  }
  async function inspect(token: string, sessionUser?: { id: string; email: string } | null) {
    const invite = requirePending(await db.select().from(invites).where(eq(invites.tokenHash, tokenHash(token))).get());
    const workspace = await db.select().from(workspaces).where(eq(workspaces.id, invite.workspaceId)).get();
    const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, invite.email)).get();
    const member = sessionUser ? await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, invite.workspaceId), eq(workspaceMembers.userId, sessionUser.id))).get() : undefined;
    return { email: invite.email, groupName: workspace!.name, expiresAt: invite.expiresAt.toISOString(), existingAccount: !!existing, sessionEmail: sessionUser?.email ?? null, alreadyMember: !!member && sessionUser?.email.toLowerCase() === invite.email };
  }
  async function accept(token: string, sessionUser: { id: string; email: string } | null, input: unknown) {
    const hash = tokenHash(token);
    return db.transaction(async tx => {
      const now = new Date();
      // Claim first: concurrent acceptance/revocation is serialized; all changes roll back on failure.
      const invite = await tx.update(invites).set({ acceptedAt: now }).where(and(eq(invites.tokenHash, hash), isNull(invites.acceptedAt), isNull(invites.revokedAt), gt(invites.expiresAt, now))).returning().get();
      if (!invite) { requirePending(await tx.select().from(invites).where(eq(invites.tokenHash, hash)).get()); throw new DomainError("Não foi possível aceitar o convite.", 409); }
      if (sessionUser && sessionUser.email.toLowerCase() !== invite.email) throw new DomainError("Entre com o email deste convite para continuar.", 403);
      const existing = await tx.select().from(user).where(eq(user.email, invite.email)).get();
      if (existing && (!sessionUser || existing.id !== sessionUser.id)) throw new DomainError("Esta conta já existe. Entre para aceitar o convite.", 401);
      const member = existing ?? (await createAuth(tx, true).api.signUpEmail({ body: { ...accountInput.parse(input), email: invite.email } })).user;
      await tx.insert(workspaceMembers).values({ workspaceId: invite.workspaceId, userId: member.id, createdAt: now }).onConflictDoNothing().run();
      await tx.insert(userPreferences).values({ userId: member.id, activeWorkspaceId: invite.workspaceId, createdAt: now, updatedAt: now }).onConflictDoUpdate({
        target: userPreferences.userId, set: { activeWorkspaceId: invite.workspaceId, updatedAt: now },
      }).run();
      await tx.update(invites).set({ acceptedBy: member.id }).where(eq(invites.id, invite.id)).run();
      return { email: invite.email, created: !existing };
    });
  }
  return { group, issue, revoke, inspect, accept };
}
export type GroupData = Awaited<ReturnType<ReturnType<typeof invitationService>["group"]>>;
export type InviteData = Awaited<ReturnType<ReturnType<typeof invitationService>["inspect"]>>;
