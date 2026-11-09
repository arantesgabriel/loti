import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { fixture, type Fixture } from "./helpers";
import { activationState } from "@/lib/auth/activation";
import { handleAuthRequest } from "@/lib/auth/handler";
import { handlePublicActivationResend, handlePublicSignup } from "@/lib/auth/registration";
import { account, accountActivationRequirements, authEmailDeliveries, user, userPreferences, workspaceMembers, workspaces } from "@/lib/db/schema";
import { authorization } from "@/lib/domain/authorization";
import { createServices } from "@/lib/domain/services";
import type { EmailTransport } from "@/lib/email/service";

const origin = "http://localhost:3000", email = "signup-qa@loti.test", password = "Signup-QA-Private-2026!";
let f: Fixture, messages: { to: string; text: string }[], sequence = 0;
const sent: EmailTransport = async message => { messages.push(message); return "sent"; };
const failed: EmailTransport = async () => "failed";
function request(path: string, body: unknown, ip = `198.51.100.${++sequence}`) {
  return new Request(`${origin}${path}`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "X-Forwarded-For": ip }, body: JSON.stringify(body) });
}
beforeEach(async () => { f = await fixture(":memory:", "orders"); messages = []; vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-05T12:00:02Z")); });
afterEach(() => { f.client.close(); vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("public signup and activation", () => {
  it("creates the account and personal workspace atomically, then activates through the native one-time email link", async () => {
    const mismatch = await handlePublicSignup(f.db, request("/api/activation/signup", { name: "Signup QA", email, password, confirmPassword: "Other-Password-2026!" }), { emailTransport: sent });
    expect(mismatch.status).toBe(400);
    const response = await handlePublicSignup(f.db, request("/api/activation/signup", { name: "Signup QA", email, password, confirmPassword: password }), { emailTransport: sent });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(messages).toHaveLength(1);

    const created = (await f.db.select().from(user).where(eq(user.email, email)).get())!;
    expect(created.emailVerified).toBe(false);
    expect(await f.db.select().from(account).where(eq(account.userId, created.id)).all()).toHaveLength(1);
    expect(await f.db.select().from(accountActivationRequirements).where(eq(accountActivationRequirements.userId, created.id)).get()).toMatchObject({ source: "public_signup" });
    const personal = await f.db.select().from(workspaces).where(and(eq(workspaces.kind, "personal"), eq(workspaces.ownerUserId, created.id))).get();
    expect(personal).toBeTruthy();
    expect(await f.db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, created.id)).all()).toHaveLength(0);
    expect(await f.db.select().from(userPreferences).where(eq(userPreferences.userId, created.id)).get()).toMatchObject({ activeWorkspaceId: personal!.id });
    expect(await activationState(f.db, created.id)).toEqual({ source: "public_signup", pending: true });
    await expect(authorization(f.db, created.id).requireWorkspaceAccess()).rejects.toMatchObject({ code: "EMAIL_ACTIVATION_REQUIRED" });
    await expect(createServices(f.db, created.id).getData()).rejects.toMatchObject({ code: "EMAIL_ACTIVATION_REQUIRED" });

    const direct = await handleAuthRequest(f.db, request("/api/auth/sign-up/email", { name: "Bypass", email: "bypass@loti.test", password }));
    expect(direct.status).toBeGreaterThanOrEqual(400);
    expect(await f.db.select().from(user).where(eq(user.email, "bypass@loti.test")).get()).toBeUndefined();

    const link = messages[0]!.text.match(/http:\/\/localhost:3000\/\S+/)![0];
    const verified = await handleAuthRequest(f.db, new Request(link), { emailTransport: sent });
    expect(verified.status).toBe(302);
    expect((await f.db.select().from(user).where(eq(user.id, created.id)).get())!.emailVerified).toBe(true);
    expect(await activationState(f.db, created.id)).toEqual({ source: "public_signup", pending: false });
    expect((await createServices(f.db, created.id).getData()).workspaceKind).toBe("personal");
    expect(await f.db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, created.id)).all()).toHaveLength(0);
  });

  it("keeps generic responses for duplicate emails, rolls back partial provisioning and lets failed mail be retried", async () => {
    await f.client.execute("CREATE TRIGGER fail_signup_workspace BEFORE INSERT ON workspaces WHEN NEW.kind = 'personal' BEGIN SELECT RAISE(ABORT, 'synthetic workspace failure'); END");
    const rollback = await handlePublicSignup(f.db, request("/api/activation/signup", { name: "Atomic rollback", email: "rollback-signup@loti.test", password, confirmPassword: password }), { emailTransport: sent });
    expect(rollback.status).toBe(503);
    expect(await f.db.select().from(user).where(eq(user.email, "rollback-signup@loti.test")).get()).toBeUndefined();
    expect(await f.db.select().from(accountActivationRequirements).innerJoin(user, eq(user.id, accountActivationRequirements.userId)).where(eq(user.email, "rollback-signup@loti.test")).all()).toHaveLength(0);
    await f.client.execute("DROP TRIGGER fail_signup_workspace");

    const partial = await handlePublicSignup(f.db, request("/api/activation/signup", { name: "Atomic", email: "atomic-signup@loti.test", password, confirmPassword: password }), { emailTransport: sent });
    expect(partial.status).toBe(202);
    const persisted = (await f.db.select().from(user).where(eq(user.email, "atomic-signup@loti.test")).get())!;
    const accountBefore = await f.db.select().from(account).where(eq(account.userId, persisted.id)).get();
    const duplicate = await handlePublicSignup(f.db, request("/api/activation/signup", { name: "Changed Name", email: "atomic-signup@loti.test", password: "Different-Password-2026!", confirmPassword: "Different-Password-2026!" }), { emailTransport: sent });
    expect(duplicate.status).toBe(partial.status);
    expect(await duplicate.json()).toEqual(await partial.json());
    expect((await f.db.select().from(user).where(eq(user.id, persisted.id)).get())!.name).toBe("Atomic");
    expect(await f.db.select().from(account).where(eq(account.userId, persisted.id)).get()).toEqual(accountBefore);

    vi.setSystemTime(Date.now() + 2000);
    const unavailable = await handlePublicSignup(f.db, request("/api/activation/signup", { name: "Retry", email: "retry-signup@loti.test", password, confirmPassword: password }), { emailTransport: failed });
    expect(unavailable.status).toBe(202);
    expect(await f.db.select().from(user).where(eq(user.email, "retry-signup@loti.test")).get()).toBeTruthy();
    expect(await f.db.select().from(authEmailDeliveries).where(eq(authEmailDeliveries.kind, "verification")).all()).toHaveLength(2);
    vi.setSystemTime(Date.now() + 61_000);
    const retry = await handlePublicActivationResend(f.db, request("/api/activation/resend", { email: "retry-signup@loti.test" }), { emailTransport: sent });
    expect(retry.status).toBe(202);
    expect(messages).toHaveLength(2);
    const absent = await handlePublicActivationResend(f.db, request("/api/activation/resend", { email: "absent-signup@loti.test" }), { emailTransport: sent });
    expect(absent.status).toBe(202);
    expect(await absent.json()).toEqual(await retry.json());
    expect(messages).toHaveLength(2);
  }, 15000);

  it("returns the generic accepted response for concurrent attempts using the same email", async () => {
    const input = { name: "Concurrent signup", email: "concurrent-signup@loti.test", password, confirmPassword: password };
    const responses = await Promise.all([
      handlePublicSignup(f.db, request("/api/activation/signup", input), { emailTransport: sent }),
      handlePublicSignup(f.db, request("/api/activation/signup", { ...input, name: "Changed concurrent name" }), { emailTransport: sent }),
    ]);

    expect(responses.map(response => response.status)).toEqual([202, 202]);
    expect(await responses[0]!.json()).toEqual(await responses[1]!.json());
    const created = await f.db.select().from(user).where(eq(user.email, input.email)).all();
    expect(created).toHaveLength(1);
    expect(await f.db.select().from(account).where(eq(account.userId, created[0]!.id)).all()).toHaveLength(1);
    expect(await f.db.select().from(accountActivationRequirements).where(eq(accountActivationRequirements.userId, created[0]!.id)).all()).toHaveLength(1);
    expect(await f.db.select().from(workspaces).where(and(eq(workspaces.kind, "personal"), eq(workspaces.ownerUserId, created[0]!.id))).all()).toHaveLength(1);
    expect(await f.db.select().from(userPreferences).where(eq(userPreferences.userId, created[0]!.id)).all()).toHaveLength(1);
    expect(created[0]!.name).toBe("Concurrent signup");
    expect(messages.filter(message => message.to === input.email)).toHaveLength(1);
  }, 15000);

  it("retries a transient SQLite write lock before creating the account", async () => {
    vi.spyOn(f.db, "transaction").mockImplementationOnce(() => { throw Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" }); });
    const response = await handlePublicSignup(f.db, request("/api/activation/signup", { name: "Retry transient lock", email: "busy-signup@loti.test", password, confirmPassword: password }), { emailTransport: sent });
    expect(response.status).toBe(202);
    expect(await f.db.select().from(user).where(eq(user.email, "busy-signup@loti.test")).all()).toHaveLength(1);
    expect(messages.filter(message => message.to === "busy-signup@loti.test")).toHaveLength(1);
  }, 15000);

  it("rejects cross-origin submissions", async () => {
    const response = await handlePublicSignup(f.db, new Request(`${origin}/api/activation/signup`, { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: JSON.stringify({ name: "Signup QA", email, password, confirmPassword: password }) }));
    expect(response.status).toBe(403);
    expect(await f.db.select().from(user).where(eq(user.email, email)).get()).toBeUndefined();
  });
});
