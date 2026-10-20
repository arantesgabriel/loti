import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuth } from "@/lib/auth/config";
import { fixture, type Fixture } from "./helpers";

let data: Fixture;
beforeEach(async () => {
  vi.stubEnv("BETTER_AUTH_URL", "https://useloti.com");
  data = await fixture();
});
afterEach(() => { data.client.close(); vi.unstubAllEnvs(); });

const credentials = { email: "domain-qa@loti.test", password: "Private-Domain-QA-2026!" };
let requestSequence = 0;
async function checkedAuth() {
  const auth = createAuth(data.db);
  // Better Auth disables origin checks by default under Vitest. Exercise the
  // production middleware without changing application options or rate limits.
  (await auth.$context).skipOriginCheck = false;
  return auth;
}
function request(origin: string, path: string, body: object, extraHeaders = {}) {
  return new Request(`${origin}/api/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, "X-Forwarded-For": `198.51.100.${++requestSequence}`, ...extraHeaders },
    body: JSON.stringify(body),
  });
}

describe("official-domain authentication and isolation", () => {
  it.each(["https://useloti.com", "http://localhost:3000", "http://localhost:3100", "https://loti-feature.vercel.app"])("retains login, cookie policy, persisted identity and logout on %s", async origin => {
    vi.stubEnv("BETTER_AUTH_URL", origin);
    const registered = await createAuth(data.db, true).api.signUpEmail({ body: { name: "Domain QA", ...credentials } });
    const auth = await checkedAuth();
    const context = await auth.$context;
    expect(context.trustedOrigins).toEqual([origin]);
    expect(context.authCookies.sessionToken.attributes).toMatchObject({
      secure: origin.startsWith("https:"), httpOnly: true, sameSite: "lax", path: "/", maxAge: 14 * 86400,
    });
    expect(context.authCookies.sessionToken.attributes.domain).toBeUndefined();
    const login = await auth.handler(request(origin, "sign-in/email", credentials));
    expect(login.status).toBe(200);
    const tokenCookie = login.headers.getSetCookie().find(value => value.includes("session_token="));
    expect(tokenCookie).toBeDefined();
    // Never print cookie values; assert attributes separately.
    expect(/HttpOnly/i.test(tokenCookie!)).toBe(true);
    expect(/SameSite=Lax/i.test(tokenCookie!)).toBe(true);
    expect(/Path=\//i.test(tokenCookie!)).toBe(true);
    expect(/;\s*Domain=/i.test(tokenCookie!)).toBe(false);
    expect(/;\s*Secure(?:;|$)/i.test(tokenCookie!)).toBe(origin.startsWith("https:"));
    expect(tokenCookie!.startsWith("__Secure-better-auth.session_token=")).toBe(origin.startsWith("https:"));
    const headers = new Headers({ cookie: login.headers.getSetCookie().map(value => value.split(";")[0]).join("; "), Origin: origin });
    const freshAuth = await checkedAuth();
    const session = await freshAuth.api.getSession({ headers });
    expect(session?.user.id).toBe(registered.user.id);
    expect(Math.abs(session!.session.expiresAt.getTime() - session!.session.createdAt.getTime() - 14 * 86400 * 1000)).toBeLessThan(1000);
    const logout = await freshAuth.handler(request(origin, "sign-out", {}, { cookie: headers.get("cookie")! }));
    expect(logout.status).toBe(200);
    expect(await auth.api.getSession({ headers })).toBeNull();
  });

  it.each(["https://meuloti.com", "https://loti-omega.vercel.app", "http://localhost:3000", "https://unrelated.vercel.app", "https://useloti.com.attacker.test"])("rejects sign-in from unauthorized origin %s, even with spoofed proxy hosts", async origin => {
    const auth = await checkedAuth();
    const response = await auth.handler(request("https://useloti.com", "sign-in/email", credentials, {
      Origin: origin, Host: "useloti.com", "X-Forwarded-Host": "useloti.com", "Sec-Fetch-Site": "cross-site",
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("INVALID_ORIGIN");
  });

  it.each(["https://attacker.test", "//attacker.test", "https://loti-omega.vercel.app", "https://meuloti.com"])("rejects external callback %s", async callbackURL => {
    const response = await (await checkedAuth()).handler(request("https://useloti.com", "sign-in/email", { ...credentials, callbackURL }));
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("INVALID_CALLBACK_URL");
  });
});
