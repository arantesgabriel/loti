import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { openDatabase } from "@/lib/db/connection";
import { invitationService } from "@/lib/domain/invitations";
import { account, user, workspaceInvitations, workspaceMembers, workspaces } from "@/lib/db/schema";
let first: ReturnType<typeof openDatabase>, second: ReturnType<typeof openDatabase>;
beforeAll(async () => {
  const sharedUrl = "file::memory:?cache=shared";
  first = openDatabase(sharedUrl);
  await migrate(first.db, { migrationsFolder: "./drizzle" });
  second = openDatabase(sharedUrl);
  const now = new Date();
  await first.db.insert(user).values({ id: "operator", name: "Operator", email: "operator@test.local", createdAt: now, updatedAt: now }).run();
  await first.db.insert(workspaces).values({ id: "group", name: "Loti", createdAt: now }).run();
  await first.db.insert(workspaceMembers).values({ userId: "operator", workspaceId: "group", createdAt: now }).run();
});
afterAll(() => { first.client.close(); second.client.close(); });
const input = { name: "Invited", password: "Concurrent-Test-2026!" };
describe("independent connection invitation races", () => {
  it("creates only one pending account for simultaneous registration, then one membership", async () => {
    const a = invitationService(first.db), b = invitationService(second.db);
    const email = `accept-${crypto.randomUUID()}@test.local`;
    const { token } = await a.issue("operator", email);
    const results = await Promise.allSettled([a.accept(token, null, input), b.accept(token, null, input)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const member = await first.db.select().from(user).where(eq(user.email, email)).all();
    expect(member).toHaveLength(1);
    expect(await first.db.select().from(account).where(eq(account.userId, member[0].id)).all()).toHaveLength(1);
    expect(await first.db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, member[0].id)).all()).toHaveLength(0);
    await first.db.update(user).set({ emailVerified: true }).where(eq(user.id, member[0].id)).run();
    const session = { id: member[0].id, email };
    const accepted = await Promise.allSettled([a.accept(token, session, {}), b.accept(token, session, {})]);
    expect(accepted.some(result => result.status === "fulfilled")).toBe(true);
    expect(await first.db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, member[0].id)).all()).toHaveLength(1);
  });
  it("makes acceptance and revocation mutually exclusive", async () => {
    const a = invitationService(first.db), b = invitationService(second.db);
    const email = `revoke-${crypto.randomUUID()}@test.local`;
    const { token } = await a.issue("operator", email);
    await a.accept(token, null, input);
    const registered = (await first.db.select().from(user).where(eq(user.email, email)).get())!;
    await first.db.update(user).set({ emailVerified: true }).where(eq(user.id, registered.id)).run();
    const id = (await a.group("operator")).invitations.find(invitation => invitation.email === email)!.id;
    const results = await Promise.allSettled([a.accept(token, { id: registered.id, email }, {}), b.revoke("operator", id)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const invite = await first.db.select().from(workspaceInvitations).where(eq(workspaceInvitations.id, id)).get();
    expect(Boolean(invite!.acceptedAt)).not.toBe(Boolean(invite!.revokedAt));
    const member = await first.db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, registered.id)).get();
    expect(Boolean(member)).toBe(Boolean(invite!.acceptedAt));
  });
  it("does not leave two pending invitations for simultaneous issuance", async () => {
    const a = invitationService(first.db), b = invitationService(second.db);
    const email = `issue-${crypto.randomUUID()}@test.local`;
    const results = await Promise.allSettled([a.issue("operator", email), b.issue("operator", email)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await a.group("operator")).invitations.filter(i => i.email === email && i.state === "pending")).toHaveLength(1);
  });
});
