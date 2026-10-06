import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { openDatabase } from "@/lib/db/connection";
import { invitationService } from "@/lib/domain/invitations";
import { account, user, workspaceInvitations, workspaceMembers, workspaces } from "@/lib/db/schema";
let directory: string, first: ReturnType<typeof openDatabase>, second: ReturnType<typeof openDatabase>;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "loti-invite-"));
  first = openDatabase(`file:${join(directory, "db.sqlite")}`);
  await migrate(first.db, { migrationsFolder: "./drizzle" });
  second = openDatabase(`file:${join(directory, "db.sqlite")}`);
  const now = new Date();
  await first.db.insert(user).values({ id: "operator", name: "Operator", email: "operator@test.local", createdAt: now, updatedAt: now }).run();
  await first.db.insert(workspaces).values({ id: "group", name: "Loti", createdAt: now }).run();
  await first.db.insert(workspaceMembers).values({ userId: "operator", workspaceId: "group", createdAt: now }).run();
});
afterEach(async () => { first.client.close(); second.client.close(); await rm(directory, { recursive: true, force: true }); });
const input = { name: "Invited", password: "Concurrent-Test-2026!" };
describe("independent connection invitation races", () => {
  it("grants only one account and membership for simultaneous acceptance", async () => {
    const a = invitationService(first.db), b = invitationService(second.db);
    const { token } = await a.issue("operator", "new@test.local");
    const results = await Promise.allSettled([a.accept(token, null, input), b.accept(token, null, input)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const member = await first.db.select().from(user).where(eq(user.email, "new@test.local")).all();
    expect(member).toHaveLength(1);
    expect(await first.db.select().from(account).where(eq(account.userId, member[0].id)).all()).toHaveLength(1);
    expect(await first.db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, member[0].id)).all()).toHaveLength(1);
  });
  it("makes acceptance and revocation mutually exclusive", async () => {
    const a = invitationService(first.db), b = invitationService(second.db);
    const { token } = await a.issue("operator", "new@test.local");
    const id = (await a.group("operator")).invitations[0].id;
    const results = await Promise.allSettled([a.accept(token, null, input), b.revoke("operator", id)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const invite = await first.db.select().from(workspaceInvitations).get();
    expect(Boolean(invite!.acceptedAt)).not.toBe(Boolean(invite!.revokedAt));
    const member = await first.db.select().from(user).where(eq(user.email, "new@test.local")).get();
    expect(Boolean(member)).toBe(Boolean(invite!.acceptedAt));
  });
  it("does not leave two pending invitations for simultaneous issuance", async () => {
    const a = invitationService(first.db), b = invitationService(second.db);
    const results = await Promise.allSettled([a.issue("operator", "new@test.local"), b.issue("operator", "new@test.local")]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await a.group("operator")).invitations.filter(i => i.state === "pending")).toHaveLength(1);
  });
});
