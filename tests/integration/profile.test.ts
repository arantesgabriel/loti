import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createAuth } from "@/lib/auth/config";
import { account, purchaseItems, session, user, workspaceMembers } from "@/lib/db/schema";
import { createServices } from "@/lib/domain/services";
import { fixture, type Fixture } from "./helpers";

const origin = "http://localhost:3000";
const password = "Profile-QA-Old-2026!";
let data: Fixture;
let requestSequence = 0;

async function createMember(email = "profile-qa@loti.test") {
  const operator = createAuth(data.db, true);
  await operator.api.signUpEmail({ body: { name: "Profile QA", email, password } });
  const created = await data.db.select({ id: user.id }).from(user).where(eq(user.email, email)).get();
  if (!created) throw new Error("Profile test member was not created");
  await data.db.insert(workspaceMembers).values({ workspaceId: "workspace", userId: created.id, createdAt: new Date() }).run();
  return { id: created.id, auth: createAuth(data.db) };
}

async function request(auth: ReturnType<typeof createAuth>, path: string, body: unknown, cookie = "", requestOrigin = origin) {
  return auth.handler(new Request(`${origin}/api/auth${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: requestOrigin, "X-Forwarded-For": `203.0.113.${++requestSequence}`, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  }));
}

async function signIn(auth: ReturnType<typeof createAuth>, email = "profile-qa@loti.test", pass = password) {
  const response = await request(auth, "/sign-in/email", { email, password: pass });
  const cookie = response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  return { response, cookie };
}

beforeEach(async () => { data = await fixture(); });
afterEach(() => data.client.close());

describe("profile auth endpoints", () => {
  it("requires a session, workspace membership, trusted origin, and a strict self-only name payload", async () => {
    const member = await createMember();
    const other = await createMember("other-qa@loti.test");
    const service = createServices(data.db, member.id);
    const favorite = await service.saveFavorite({ name: "Snapshot stays stable", url: "https://weidian.com/item.html?itemID=5", priceCents: 12500, variant: "Blue", notes: "Original", collectionId: null, qcStatus: "approved" });
    const purchase = await service.savePurchase({ name: "Profile QA history", hubbuyAccount: null });
    const item = await service.addFavoriteToPurchase({ favoriteId: favorite!.id, personId: member.id, quantity: 2, unitPriceCents: 13000, variant: "Blue purchase", notes: "Snapshot" });
    const membershipsBefore = await data.db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, member.id)).all();
    const anon = await request(member.auth, "/update-user", { name: "New Name" });
    expect(anon.status).toBe(401);

    const { cookie } = await signIn(member.auth);
    expect((await request(member.auth, "/update-user", { name: "New Name" }, cookie, "https://evil.example")).status).toBe(403);
    expect((await request(member.auth, "/update-user", { name: "   " }, cookie)).status).toBe(400);
    expect((await request(member.auth, "/update-user", { name: "New Name", id: other.id }, cookie)).status).toBe(400);
    expect((await request(member.auth, "/update-user", { name: "New Name", email: "stolen@loti.test" }, cookie)).status).toBe(400);

    expect((await request(member.auth, "/update-user", { name: "  Ana Júlia  " }, cookie)).status).toBe(200);
    expect((await data.db.select({ name: user.name }).from(user).where(eq(user.id, member.id)).get())?.name).toBe("Ana Júlia");
    expect((await data.db.select({ name: user.name }).from(user).where(eq(user.id, other.id)).get())?.name).toBe("Profile QA");
    expect(await data.db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, member.id)).all()).toEqual(membershipsBefore);
    const savedItem = await data.db.select().from(purchaseItems).where(eq(purchaseItems.id, item!.id)).get();
    expect(savedItem).toMatchObject({ id: item!.id, purchaseId: purchase!.id, sourceFavoriteId: favorite!.id, name: "Snapshot stays stable", variant: "Blue purchase", quantity: 2, unitPriceCents: 13000, notes: "Snapshot" });
  });

  it("denies profile edits for a signed-in account without a workspace membership", async () => {
    const member = await createMember("unassigned-qa@loti.test");
    await data.db.delete(workspaceMembers).where(eq(workspaceMembers.userId, member.id)).run();
    const { cookie } = await signIn(member.auth, "unassigned-qa@loti.test");
    expect((await request(member.auth, "/update-user", { name: "Not allowed" }, cookie)).status).toBe(403);
  });

  it("rejects wrong/reused passwords without changing the credential or sessions", async () => {
    const member = await createMember();
    const { cookie } = await signIn(member.auth);
    expect((await request(member.auth, "/change-password", { currentPassword: "incorrect-password", newPassword: "Profile-QA-New-2026!" }, cookie)).status).toBe(400);
    expect((await request(member.auth, "/change-password", { currentPassword: password, newPassword: password }, cookie)).status).toBe(400);
    expect((await member.auth.api.getSession({ headers: new Headers({ Cookie: cookie }) }))?.user.id).toBe(member.id);
    expect((await signIn(member.auth)).response.status).toBe(200);
    expect((await data.db.select({ password: account.password }).from(account).where(eq(account.userId, member.id)).get())?.password).toBeTruthy();
  });

  it("forces other-session revocation and rotates the current session even when the caller sends false", async () => {
    const member = await createMember();
    const otherMember = await createMember("second-profile-qa@loti.test");
    const { cookie: firstCookie } = await signIn(member.auth);
    const secondAuth = createAuth(data.db);
    const { cookie: secondCookie } = await signIn(secondAuth);
    const { cookie: otherMemberCookie } = await signIn(otherMember.auth, "second-profile-qa@loti.test");
    const before = await data.db.select({ id: session.id }).from(session).where(eq(session.userId, member.id)).all();
    expect(before).toHaveLength(2);

    const changed = await request(member.auth, "/change-password", {
      currentPassword: password,
      newPassword: "Profile-QA-New-2026!",
      revokeOtherSessions: false,
    }, firstCookie);
    expect(changed.status).toBe(200);
    const newCookie = changed.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    expect(newCookie).toContain("session_token");
    expect(await member.auth.api.getSession({ headers: new Headers({ Cookie: newCookie }) })).toMatchObject({ user: { id: member.id } });
    expect(await secondAuth.api.getSession({ headers: new Headers({ Cookie: secondCookie }) })).toBeNull();
    expect(await member.auth.api.getSession({ headers: new Headers({ Cookie: firstCookie }) })).toBeNull();
    expect((await signIn(member.auth, "profile-qa@loti.test", password)).response.status).toBe(401);
    expect((await signIn(secondAuth, "profile-qa@loti.test", "Profile-QA-New-2026!")).response.status).toBe(200);

    const thirdSession = await signIn(secondAuth, "profile-qa@loti.test", "Profile-QA-New-2026!");
    const withoutPolicy = await request(member.auth, "/change-password", { currentPassword: "Profile-QA-New-2026!", newPassword: "Profile-QA-Next-2026!" }, newCookie);
    const nextCookie = withoutPolicy.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    expect(withoutPolicy.status).toBe(200);
    expect(await secondAuth.api.getSession({ headers: new Headers({ Cookie: thirdSession.cookie }) })).toBeNull();
    expect(await member.auth.api.getSession({ headers: new Headers({ Cookie: nextCookie }) })).toMatchObject({ user: { id: member.id } });
    expect(await otherMember.auth.api.getSession({ headers: new Headers({ Cookie: otherMemberCookie }) })).toMatchObject({ user: { id: otherMember.id } });
    expect((await signIn(otherMember.auth, "second-profile-qa@loti.test")).response.status).toBe(200);
  });
});
