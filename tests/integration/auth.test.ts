import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuth } from "@/lib/auth/config";
import { fixture, type Fixture } from "./helpers";

let data: Fixture;
beforeEach(async () => { data = await fixture(); });
afterEach(() => data.client.close());

describe("existing Better Auth email/password contract", () => {
  it("rejects public signup", async () => {
    const auth = createAuth(data.db);
    const response = await auth.handler(new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify({ name: "Test", email: "test@loti.test", password: "Private-Test-2026!" }),
    }));
    expect(response.status).toBe(400);
  });
  it("rejects an invalid password, creates a persisted session and invalidates it on logout", async () => {
    const operator = createAuth(data.db, true);
    await operator.api.signUpEmail({ body: { name: "Auth QA", email: "auth@loti.test", password: "Private-Test-2026!" } });
    const auth = createAuth(data.db);
    function signIn(password: string) {
      return auth.handler(new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
        body: JSON.stringify({ email: "auth@loti.test", password }),
      }));
    }
    expect((await signIn("wrong-password")).status).toBe(401);
    const response = await signIn("Private-Test-2026!");
    expect(response.status).toBe(200);
    const headers = new Headers({ cookie: response.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ") });
    expect(headers.get("cookie")).toContain("session_token");
    expect((await auth.api.getSession({ headers }))?.user.email).toBe("auth@loti.test");
    // A fresh auth instance reads the same persisted SQLite session.
    const freshAuth = createAuth(data.db);
    expect((await freshAuth.api.getSession({ headers }))?.user.email).toBe("auth@loti.test");
    await freshAuth.api.signOut({ headers });
    expect(await auth.api.getSession({ headers })).toBeNull();
  });
});
