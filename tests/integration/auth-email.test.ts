import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { fixture, type Fixture } from "./helpers";
import { createAuth } from "@/lib/auth/config";
import { handleAuthRequest } from "@/lib/auth/handler";
import { invitationService } from "@/lib/domain/invitations";
import { createServices } from "@/lib/domain/services";
import { account, authEmailDeliveries, user, workspaceMembers } from "@/lib/db/schema";
import type { EmailTransport } from "@/lib/email/service";

const origin = "http://localhost:3000", email = "email-qa@loti.test", password = "Email-QA-Old-2026!";
let f: Fixture, messages: { text: string; to: string }[], sequence = 0;
const transport: EmailTransport = async message => { messages.push(message); return "sent"; };
function request(path: string, body?: unknown, cookie = "") {
  return new Request(`${origin}/api/auth${path}`, { method: body === undefined ? "GET" : "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: cookie, "X-Forwarded-For": `198.51.100.${++sequence}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function call(path: string, body?: unknown, cookie = "") { return handleAuthRequest(f.db, request(path, body, cookie), { emailTransport: transport }); }
async function signIn(address = email, pass = password) {
  const response = await call("/sign-in/email", { email: address, password: pass });
  expect(response.status).toBe(200);
  return response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
}
async function createAccount() { return (await createAuth(f.db, true).api.signUpEmail({ body: { name: "Email QA", email, password } })).user; }
function messageUrl() { return new URL(messages.at(-1)!.text.match(/http:\/\/localhost:3000\/\S+/)![0]); }
beforeEach(async () => { f = await fixture(); messages = []; vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-20T12:00:02Z")); });
afterEach(() => { f.client.close(); vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("native password recovery", () => {
  it("returns identical generic responses, resets once, revokes sessions and preserves identity", async () => {
    const created = await createAccount();
    const cookie = await signIn(); await signIn();
    const known = await call("/request-password-reset", { email, redirectTo: "https://evil.example" });
    const unknown = await call("/request-password-reset", { email: "missing@loti.test" });
    expect(await known.json()).toEqual(await unknown.json()); expect(known.status).toBe(200); expect(messages).toHaveLength(1);
    const link = messageUrl(), token = link.pathname.split("/").at(-1)!;
    expect(link.searchParams.get("callbackURL")).toBe(`${origin}/reset-password`);
    expect((await f.db.select().from(authEmailDeliveries).get())!.id).not.toContain(token);
    const before = await f.db.select().from(user).where(eq(user.id, created.id)).get();
    expect((await call("/reset-password", { token, newPassword: "Email-QA-New-2026!" })).status).toBe(200);
    expect(await createAuth(f.db).api.getSession({ headers: new Headers({ Cookie: cookie }) })).toBeNull();
    expect((await call("/sign-in/email", { email, password })).status).toBe(401);
    await signIn(email, "Email-QA-New-2026!");
    expect((await call("/reset-password", { token, newPassword: "Reuse-Password-2026!" })).status).toBe(400);
    expect(await f.db.select().from(user).where(eq(user.id, created.id)).get()).toEqual(before);
  }, 15000);
  it("rejects missing, invalid and expired tokens and short passwords", async () => {
    await createAccount(); await call("/request-password-reset", { email });
    const token = messageUrl().pathname.split("/").at(-1)!;
    expect((await call("/reset-password", { newPassword: password })).status).toBe(400);
    expect((await call("/reset-password", { token: "invalid", newPassword: password })).status).toBe(400);
    expect((await call("/reset-password", { token, newPassword: "short" })).status).toBe(400);
    vi.setSystemTime(Date.now() + 1801_000);
    expect((await call("/reset-password", { token, newPassword: "Expired-Password-2026!" })).status).toBe(400);
    await signIn();
  });
  it("rolls back token, credential and sessions if revocation fails", async () => {
    await createAccount(); const cookie = await signIn();
    await call("/request-password-reset", { email }); const token = messageUrl().pathname.split("/").at(-1)!;
    const before = await f.db.select().from(account).all();
    await f.client.execute("CREATE TRIGGER fail_email_reset BEFORE DELETE ON session BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END");
    expect((await call("/reset-password", { token, newPassword: "Atomic-Password-2026!" })).status).toBeGreaterThanOrEqual(400);
    expect(await f.db.select().from(account).all()).toEqual(before);
    expect(await createAuth(f.db).api.getSession({ headers: new Headers({ Cookie: cookie }) })).not.toBeNull();
    await f.client.execute("DROP TRIGGER fail_email_reset");
    expect((await call("/reset-password", { token, newPassword: "Atomic-Password-2026!" })).status).toBe(200);
  });
  it("limits missing accounts too and preserves generic responses on provider failure", async () => {
    const auth = createAuth(f.db, false, { emailTransport: async () => "failed" });
    await createAccount();
    const failed = await auth.api.requestPasswordReset({ body: { email } });
    expect(failed.status).toBe(true);
    for (let i = 0; i < 3; i++) expect((await call("/request-password-reset", { email: "absent@loti.test" })).status).toBe(200);
    expect((await call("/request-password-reset", { email: "absent@loti.test" })).status).toBe(429);
  }, 15000);
});

describe("verified invitation membership", () => {
  it("registers without membership, verifies through native tokens, then requires authenticated acceptance", async () => {
    const service = invitationService(f.db), { token } = await service.issue("alice", email);
    const registered = await service.accept(token, null, { name: "Invited QA", password });
    expect(registered).toMatchObject({ created: true, verificationRequired: true });
    const created = (await f.db.select().from(user).where(eq(user.email, email)).get())!;
    await expect(createServices(f.db, created.id).getData()).rejects.toThrow("espaço");
    const cookie = await signIn();
    const sent = await call("/send-verification-email", { email, callbackURL: `/invite/${token}` }, cookie);
    expect(sent.status).toBe(200); expect(messages).toHaveLength(1);
    const link = messageUrl();
    expect((await handleAuthRequest(f.db, new Request(link), { emailTransport: transport })).status).toBe(302);
    expect((await f.db.select().from(user).where(eq(user.id, created.id)).get())!.emailVerified).toBe(true);
    expect(await f.db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, created.id)).all()).toHaveLength(0);
    await expect(service.accept(token, null, {})).rejects.toThrow("Entre");
    await expect(service.accept(token, { id: "bob", email: "bob@test.local" }, {})).rejects.toThrow("email");
    expect(await service.accept(token, { id: created.id, email }, {})).toMatchObject({ verificationRequired: false });
    expect(await f.db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, created.id)).all()).toHaveLength(1);
    const replay = await handleAuthRequest(f.db, new Request(link), { emailTransport: transport });
    expect(replay.headers.get("location")).toContain("error=INVALID_TOKEN");
  });
  it("rejects expired verification, anonymous resends and cross-account email requests", async () => {
    await createAccount(); const cookie = await signIn();
    expect((await call("/send-verification-email", { email })).status).toBe(401);
    expect((await call("/send-verification-email", { email: "alice@test.local" }, cookie)).status).toBe(401);
    expect((await call("/send-verification-email", { email }, cookie)).status).toBe(200);
    const link = messageUrl();
    expect((await call("/send-verification-email", { email }, cookie)).status).toBe(200); // same-second native JWT is deduplicated
    expect(messages).toHaveLength(1);
    vi.setSystemTime(Date.now() + 2000);
    expect((await call("/send-verification-email", { email }, cookie)).status).toBe(429);
    vi.setSystemTime(Date.now() + 1801_000);
    const expired = await handleAuthRequest(f.db, new Request(link), { emailTransport: transport });
    expect(expired.headers.get("location")).toContain("error=INVALID_TOKEN");
    expect((await f.db.select().from(user).where(eq(user.email, email)).get())!.emailVerified).toBe(false);
  });
  it("preserves existing unverified members while requiring verification for a new group", async () => {
    const created = await createAccount();
    await f.db.insert(workspaceMembers).values({ workspaceId: "other", userId: created.id, createdAt: new Date() }).run();
    await signIn(); expect((await createServices(f.db, created.id).getData()).currentUser.id).toBe(created.id);
    const service = invitationService(f.db), { token } = await service.issue("alice", email);
    expect(await service.accept(token, { id: created.id, email }, {})).toMatchObject({ verificationRequired: true });
    await service.revoke("alice", (await service.group("alice")).invitations[0].id);
    await expect(service.accept(token, { id: created.id, email }, {})).rejects.toThrow("revogado");
    expect(await f.db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, created.id)).all()).toHaveLength(1);
  });
});
