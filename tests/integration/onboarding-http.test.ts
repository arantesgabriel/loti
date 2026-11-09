import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { fixture, type Fixture } from "./helpers";
import { createOnboardingHandlers } from "@/lib/onboarding/http";
import { DomainError } from "@/lib/domain/errors";
import { accountActivationRequirements, authLimits, onboardingRuns, user, userGuidanceProfiles } from "@/lib/db/schema";
import { privateKey } from "@/lib/auth/security-limits";

const origin = "http://localhost:3000";
let f: Fixture;
beforeEach(async () => { f = await fixture(":memory:", "orders"); });
afterEach(() => { f.client.close(); vi.restoreAllMocks(); });
const payload = { command: "profile.save", workspaceId: "workspace", expectedRevision: 0, patch: { experience: "expert" } };
const request = (body: unknown, requestOrigin = origin) => new Request(`${origin}/api/onboarding`, { method: "POST", headers: { origin: requestOrigin, "content-type": "application/json" }, body: JSON.stringify(body) });
const get = (query = "workspaceId=workspace") => new Request(`${origin}/api/onboarding?${query}`);
const handlers = (id = "alice") => createOnboardingHandlers({ db: f.db, origin: () => origin, requireUser: async () => ({ id }) });

describe("private onboarding HTTP boundary", () => {
  it("identifies missing onboarding migrations without exposing SQL or identity", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await f.client.execute("DROP TABLE onboarding_milestones");
    const response = await handlers().GET(get());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "ONBOARDING_SCHEMA_REQUIRED", error: "As orientações estão indisponíveis. O banco deste ambiente precisa receber as migrações de onboarding." });
    expect(log).toHaveBeenCalledWith("Loti onboarding unavailable", { code: "ONBOARDING_SCHEMA_REQUIRED" });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("derives identity from the session, returns only the caller's state, and never caches it publicly", async () => {
    const response = await handlers().POST(request(payload));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ profile: { experience: "expert", usageIntent: "unspecified", revision: 1 } });
    const own = await handlers().GET(get());
    const colleague = await handlers("bob").GET(get());
    expect((await colleague.json()).profile.revision).toBe(0);
    for (const item of [response, own, colleague]) {
      expect(item.headers.get("cache-control")).toBe("private, no-store");
      expect(item.headers.get("referrer-policy")).toBe("no-referrer");
      expect(item.headers.get("vary")).toBe("Cookie");
    }
    const body = await own.text();
    for (const forbidden of ["email", "favorites", "purchases", "token", "currentUser"]) expect(Object.keys(JSON.parse(body))).not.toContain(forbidden);
    expect(await f.db.select().from(onboardingRuns).all()).toHaveLength(0);
  });

  it("rejects unauthenticated, pending, foreign-space, stale and forged requests", async () => {
    const unauthenticated = createOnboardingHandlers({ db: f.db, origin: () => origin, requireUser: async () => { throw new DomainError("Entre na sua conta.", 401); } });
    expect((await unauthenticated.GET(get())).status).toBe(401);
    expect((await unauthenticated.POST(request(payload))).status).toBe(401);
    expect((await handlers().POST(request(payload, "https://foreign.test"))).status).toBe(403);
    for (const body of [{ ...payload, userId: "bob" }, { ...payload, milestone: "M1" }, { ...payload, patch: { experience: "expert", workspaceId: "other" } }, { ...payload, flowVersion: 2 }]) {
      expect((await handlers().POST(request(body))).status).toBe(400);
    }
    expect((await handlers().GET(get("workspaceId=other"))).status).toBe(403);
    expect((await handlers().GET(get("workspaceId=workspace&userId=bob"))).status).toBe(400);
    expect((await handlers().GET(get("workspaceId=workspace&workspaceId=other"))).status).toBe(400);
    expect((await handlers().POST(request(payload))).status).toBe(200);
    const stale = await handlers().POST(request({ ...payload, patch: { experience: "never" } }));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: "ONBOARDING_REVISION_CONFLICT" });
    await f.db.update(user).set({ emailVerified: false }).where(eq(user.id, "alice")).run();
    await f.db.insert(accountActivationRequirements).values({ userId: "alice", source: "public_signup", createdAt: new Date() }).run();
    expect((await handlers().GET(get())).status).toBe(403);
    expect((await handlers().POST(request({ ...payload, expectedRevision: 1 }))).status).toBe(403);
    expect((await f.db.select().from(userGuidanceProfiles).get())!.experience).toBe("expert");
  });

  it("bounds streamed input without trusting Content-Length and sanitizes failures", async () => {
    const large = await handlers().POST(new Request(`${origin}/api/onboarding`, { method: "POST", headers: { origin }, body: " ".repeat(4097) }));
    expect(large.status).toBe(413);
    const malformed = await handlers().POST(new Request(`${origin}/api/onboarding`, { method: "POST", headers: { origin }, body: "{invalid" }));
    expect(malformed.status).toBe(400);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await f.client.execute("CREATE TRIGGER fail_guidance_http BEFORE INSERT ON user_guidance_profiles BEGIN SELECT RAISE(ABORT, 'private-product-url-and-token'); END");
    const failed = await handlers().POST(request(payload));
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("private-product-url-and-token");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-product-url-and-token");
    for (const response of [large, malformed, failed]) expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("uses a persisted user limit across handler instances and leaves reads available", async () => {
    const window = Math.floor(Date.now() / 60000);
    await f.db.insert(authLimits).values({ key: `onboarding:${privateKey("alice")}:${window}`, count: 60, expiresAt: (window + 1) * 60000 }).run();
    const response = await handlers().POST(request(payload));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect((await handlers().GET(get())).status).toBe(200);
    expect((await handlers("bob").POST(request(payload))).status).toBe(200);
    expect(await f.db.select().from(userGuidanceProfiles).where(eq(userGuidanceProfiles.userId, "alice")).all()).toHaveLength(0);
  });
});
