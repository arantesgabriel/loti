import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createAuth } from "@/lib/auth/config";
import { account, session, user } from "@/lib/db/schema";
import { resetDatabaseUrl, resetMemberPassword } from "../../scripts/password-reset";
import { fixture, type Fixture } from "./helpers";

const email = "reset-qa@loti.test";
const oldPassword = "Reset-QA-Old-2026!";
const newPassword = "  Reset-QA-New-2026!  ";
let data: Fixture;
let requestSequence = 0;

async function signIn(address = email, password = oldPassword) {
  const auth = createAuth(data.db);
  const response = await auth.handler(new Request("http://localhost:3000/api/auth/sign-in/email", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3000", "X-Forwarded-For": `198.51.100.${++requestSequence}` },
    body: JSON.stringify({ email: address, password }),
  }));
  const headers = new Headers({ Cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") });
  return { auth, response, headers };
}

beforeEach(async () => {
  data = await fixture();
  await createAuth(data.db, true).api.signUpEmail({ body: { name: "Reset QA", email, password: oldPassword } });
});
afterEach(() => data.client.close());

describe("administrative password reset", () => {
  it("replaces the credential, revokes every target session and preserves other accounts", async () => {
    const first = await signIn();
    const second = await signIn();
    const otherEmail = "other-reset-qa@loti.test";
    await createAuth(data.db, true).api.signUpEmail({ body: { name: "Other QA", email: otherEmail, password: oldPassword } });
    const other = await signIn(otherEmail);
    const usersBefore = await data.db.select().from(user).all();
    const otherAccountBefore = await data.db.select().from(account).where(eq(account.userId, (await other.auth.api.getSession({ headers: other.headers }))!.user.id)).get();

    expect(await resetMemberPassword(data.db, { email: `  ${email.toUpperCase()}  `, password: newPassword }))
      .toEqual({ email, revokedSessions: 2 });
    expect(await first.auth.api.getSession({ headers: first.headers })).toBeNull();
    expect(await second.auth.api.getSession({ headers: second.headers })).toBeNull();
    expect((await signIn()).response.status).toBe(401);
    expect((await signIn(email, newPassword)).response.status).toBe(200);
    expect((await signIn(email, newPassword.trim())).response.status).toBe(401);
    expect(await other.auth.api.getSession({ headers: other.headers })).not.toBeNull();
    expect(await data.db.select().from(account).where(eq(account.id, otherAccountBefore!.id)).get()).toEqual(otherAccountBefore);
    expect(await data.db.select().from(user).all()).toEqual(usersBefore);
  });

  it("does not create missing users or credentials", async () => {
    const before = await data.db.select().from(account).all();
    await expect(resetMemberPassword(data.db, { email: "missing@loti.test", password: newPassword })).rejects.toThrow("Usuário não encontrado");
    await expect(resetMemberPassword(data.db, { email: "alice@test.local", password: newPassword })).rejects.toThrow("exatamente uma conta");
    expect(await data.db.select().from(account).all()).toEqual(before);
  });

  it("rejects ambiguous credentials without revoking sessions", async () => {
    await signIn();
    const original = await data.db.select().from(account).get();
    await data.db.insert(account).values({ ...original!, id: "duplicate-reset-credential" }).run();
    await expect(resetMemberPassword(data.db, { email, password: newPassword })).rejects.toThrow("exatamente uma conta");
    expect((await data.db.select().from(session).all())).toHaveLength(1);
    expect((await signIn()).response.status).toBe(200);
  });

  it("rolls back the password when session revocation fails", async () => {
    const signedIn = await signIn();
    const before = await data.db.select().from(account).all();
    await data.client.execute("CREATE TRIGGER fail_reset_revocation BEFORE DELETE ON session BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
    await expect(resetMemberPassword(data.db, { email, password: newPassword })).rejects.toThrow();
    expect(await data.db.select().from(account).all()).toEqual(before);
    expect(await signedIn.auth.api.getSession({ headers: signedIn.headers })).not.toBeNull();
    expect((await signIn()).response.status).toBe(200);
  });

  it.each(["short", "x".repeat(129)])("rejects invalid password lengths before changing data (%#)", async password => {
    const before = await data.db.select().from(account).all();
    await expect(resetMemberPassword(data.db, { email, password })).rejects.toThrow();
    expect(await data.db.select().from(account).all()).toEqual(before);
  });

  it("requires an explicit database and a token for remote access", () => {
    expect(() => resetDatabaseUrl({})).toThrow("explicitamente");
    expect(() => resetDatabaseUrl({ TURSO_DATABASE_URL: "libsql://example.turso.io" })).toThrow("TURSO_AUTH_TOKEN");
    expect(resetDatabaseUrl({ TURSO_DATABASE_URL: "libsql://example.turso.io", TURSO_AUTH_TOKEN: "test-only" })).toBe("libsql://example.turso.io");
    expect(resetDatabaseUrl({ TURSO_DATABASE_URL: "file::memory:" })).toBe("file::memory:");
  });
});
