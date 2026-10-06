import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { fixture, type Fixture } from "./helpers";
import { invitationService, hashInviteToken, limitInvitations } from "@/lib/domain/invitations";
import { createAuth } from "@/lib/auth/config";
import { user, account, workspaceInvitations, workspaceMembers, userPreferences } from "@/lib/db/schema";
let f: Fixture;
beforeEach(async () => { f = await fixture(); });
afterEach(() => f.client.close());
const credentials = { name: "Nova pessoa", password: "Invitation-Test-2026!" };
const session = { id: "outsider", email: "outsider@test.local" };
describe("private group invitations", () => {
  it("creates an invitation, stores only its hash and restricts management", async () => {
    const service = invitationService(f.db);
    const issued = await service.issue("alice", "  NEW@test.local ");
    const row = await f.db.select().from(workspaceInvitations).get();
    expect(row!.email).toBe("new@test.local"); expect(row!.tokenHash).toBe(hashInviteToken(issued.token));
    expect(JSON.stringify(await service.group("bob"))).not.toContain(issued.token);
    await expect(service.issue("outsider", "x@test.local")).rejects.toThrow("espaço");
    await expect(service.revoke("foreign", row!.id)).rejects.toThrow();
    await expect(service.issue("alice", "alice@test.local")).rejects.toThrow("já faz parte");
    await expect(service.issue("bob", "new@test.local")).rejects.toThrow("pendente");
  });
  it("creates account and membership atomically, then authenticates using normal Better Auth", async () => {
    const service = invitationService(f.db), issued = await service.issue("alice", "new@test.local");
    await expect(service.accept(issued.token, null, { ...credentials, password: "short" })).rejects.toThrow();
    expect((await service.inspect(issued.token)).existingAccount).toBe(false);
    const result = await service.accept(issued.token, null, credentials);
    expect(result.created).toBe(true);
    const member = await f.db.select().from(user).where(eq(user.email, "new@test.local")).get();
    expect(await f.db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, member!.id)).get()).toBeTruthy();
    expect(await f.db.select().from(account).where(eq(account.userId, member!.id)).get()).toBeTruthy();
    const auth = createAuth(f.db);
    const response = await auth.handler(new Request("http://localhost:3000/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" }, body: JSON.stringify({ email: result.email, password: credentials.password }) }));
    expect(response.status).toBe(200);
    await expect(service.accept(issued.token, null, credentials)).rejects.toThrow("já foi usado");
  });
  it("rolls back user and credential account if membership fails", async () => {
    const service = invitationService(f.db), issued = await service.issue("alice", "rollback@test.local");
    await f.client.execute("CREATE TRIGGER fail_membership BEFORE INSERT ON workspace_members BEGIN SELECT RAISE(ABORT, 'simulated membership failure'); END");
    await expect(service.accept(issued.token, null, credentials)).rejects.toThrow();
    expect(await f.db.select().from(user).where(eq(user.email, "rollback@test.local")).get()).toBeUndefined();
    expect((await service.inspect(issued.token)).existingAccount).toBe(false);
    await f.client.execute("DROP TRIGGER fail_membership");
    await service.accept(issued.token, null, credentials);
  });
  it("requires existing account login and preserves credentials and invitation after wrong email", async () => {
    const service = invitationService(f.db), issued = await service.issue("alice", session.email);
    await expect(service.accept(issued.token, null, credentials)).rejects.toThrow("Entre");
    await expect(service.accept(issued.token, { id: "bob", email: "bob@test.local" }, credentials)).rejects.toThrow("email deste convite");
    expect((await service.inspect(issued.token)).existingAccount).toBe(true);
    expect((await service.accept(issued.token, session, {})).created).toBe(false);
    expect(await f.db.select().from(account).where(eq(account.userId, "outsider")).get()).toBeUndefined();
    expect(await f.db.select().from(workspaceMembers).where(and(eq(workspaceMembers.userId, "outsider"), eq(workspaceMembers.workspaceId, "workspace"))).get()).toBeTruthy();
  });
  it("regenerates, revokes and expires links", async () => {
    const service = invitationService(f.db), first = await service.issue("alice", "new@test.local");
    const id = (await service.group("alice")).invitations[0].id;
    const second = await service.issue("bob", "new@test.local", id);
    await expect(service.inspect(first.token)).rejects.toThrow("revogado");
    const newId = (await service.group("alice")).invitations.find(i => i.state === "pending")!.id;
    await service.revoke("alice", newId);
    await expect(service.accept(second.token, null, credentials)).rejects.toThrow("revogado");
    const third = await service.issue("alice", "new@test.local");
    await f.db.update(workspaceInvitations).set({ expiresAt: new Date(0) }).where(eq(workspaceInvitations.tokenHash, hashInviteToken(third.token))).run();
    await expect(service.accept(third.token, null, credentials)).rejects.toThrow("expirou");
    await service.issue("alice", "new@test.local");
  });
  it("activates the invited group while preserving previous membership and view preference", async () => {
    const service = invitationService(f.db), issued = await service.issue("alice", "foreign@test.local");
    await f.db.insert(userPreferences).values({ userId: "foreign", favoritesView: "cards", activeWorkspaceId: "other", createdAt: new Date(), updatedAt: new Date() }).run();
    await service.accept(issued.token, { id: "foreign", email: "foreign@test.local" }, {});
    expect((await f.foreign.getData()).members.map(m => m.id)).toContain("alice");
    expect((await f.foreign.getData()).view).toBe("cards");
    expect(await f.db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, "foreign")).all()).toHaveLength(2);
  });
  it("consumes the invite safely if an operator added membership before acceptance", async () => {
    const service = invitationService(f.db), issued = await service.issue("alice", session.email);
    await f.db.insert(workspaceMembers).values({ userId: session.id, workspaceId: "workspace", createdAt: new Date() }).run();
    expect((await service.inspect(issued.token, session)).alreadyMember).toBe(true);
    await service.accept(issued.token, session, {});
    expect(await f.db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, session.id)).all()).toHaveLength(1);
    await expect(service.inspect(issued.token, session)).rejects.toThrow("já foi usado");
  });
  it("enforces persistent rate limits", async () => {
    await limitInvitations(f.db, "test", 1);
    await expect(limitInvitations(f.db, "test", 1)).rejects.toThrow("Muitas tentativas");
  });
});
