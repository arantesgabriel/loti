import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { fixture, type Fixture } from "./helpers";
import { authEmailDeliveries, authLimits } from "@/lib/db/schema";
import { consumeLimit, persistentAuthStorage, privateKey, trustedClientIp } from "@/lib/auth/security-limits";
import { emailService, type EmailInput } from "@/lib/email/service";

let f: Fixture;
const input = (kind: EmailInput["kind"] = "reset", key = crypto.randomUUID()): EmailInput => ({ kind, token: key, email: `${key}@loti.test`, url: kind === "reset" ? `http://localhost:3000/api/auth/reset-password/${key}?callbackURL=%2Freset-password` : kind === "verification" ? `http://localhost:3000/api/auth/verify-email?token=${key}` : `http://localhost:3000/invite/${"a".repeat(43)}`, workspaceId: "workspace" });
beforeEach(async () => { f = await fixture(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-20T12:00:02Z")); });
afterEach(() => { f.client.close(); vi.useRealTimers(); vi.unstubAllEnvs(); });
const tick = (seconds = 61) => vi.setSystemTime(Date.now() + seconds * 1000);

describe("persistent authentication counters and mail budget", () => {
  it("atomically admits only the limit under concurrent independent service instances", async () => {
    const storageA = persistentAuthStorage(f.db), storageB = persistentAuthStorage(f.db);
    const result = await Promise.all(Array.from({ length: 20 }, (_, index) => (index % 2 ? storageA : storageB).consume("private@example.test:ip", { max: 3, window: 60 })));
    expect(result.filter(value => value.allowed)).toHaveLength(3);
    const rows = await f.db.select().from(authLimits).all();
    expect(JSON.stringify(rows)).not.toContain("example.test");
    expect(rows[0].count).toBe(3);
    tick(); expect((await storageA.consume("private@example.test:ip", { max: 3, window: 60 })).allowed).toBe(true);
  });
  it("deduplicates provider calls and does not release quota after uncertain delivery", async () => {
    const transport = vi.fn(async () => "uncertain" as const), service = emailService(f.db, transport), message = input();
    expect(await service.send(message)).toBe("uncertain");
    expect(await service.send(message)).toBe("duplicate");
    expect(transport).toHaveBeenCalledTimes(1);
    expect((await f.db.select().from(authLimits).where(like(authLimits.key, "email:day:%")).get())!.count).toBe(1);
    expect((await f.db.select().from(authEmailDeliveries).get())!.state).toBe("uncertain");
  });
  it("reserves critical recovery capacity and rolls back all reservations on limits", async () => {
    vi.stubEnv("LOTI_EMAIL_DAILY_LIMIT", "3"); vi.stubEnv("LOTI_EMAIL_RESET_RESERVE", "2");
    const transport = vi.fn(async () => "sent" as const), service = emailService(f.db, transport);
    await service.send(input("verification")); tick();
    await expect(service.send(input("invitation"))).rejects.toThrow("Muitas");
    expect(await f.db.select().from(authEmailDeliveries).all()).toHaveLength(1);
    expect((await f.db.select().from(authLimits).where(like(authLimits.key, "email:day:%")).get())!.count).toBe(1);
    await service.send(input()); tick(); await service.send(input()); tick();
    await expect(service.send(input())).rejects.toThrow("Muitas");
    expect(transport).toHaveBeenCalledTimes(3);
  });
  it("enforces monthly budget across days and resets only at the calendar month", async () => {
    vi.stubEnv("LOTI_EMAIL_MONTHLY_LIMIT", "1");
    const service = emailService(f.db, async () => "sent");
    await service.send(input()); tick(86400);
    await expect(service.send(input())).rejects.toThrow("Muitas");
    vi.setSystemTime(new Date("2026-11-01T00:00:02Z")); expect(await service.send(input())).toBe("sent");
  });
  it("limits verification resends per recipient/hour/day and invitation sends per workspace", async () => {
    const service = emailService(f.db, async () => "sent");
    const message = input("verification");
    await service.send(message);
    await expect(service.send({ ...message, token: "second" })).rejects.toThrow("Muitas");
    tick(); await service.send({ ...message, token: "second" }); tick();
    await expect(service.send({ ...message, token: "third" })).rejects.toThrow("Muitas");
    vi.stubEnv("LOTI_INVITE_WORKSPACE_DAILY_LIMIT", "1");
    await service.send(input("invitation")); tick();
    await expect(service.send(input("invitation"))).rejects.toThrow("Muitas");
  });
  it("rejects invalid recipients and origins before reserving quota", async () => {
    const transport = vi.fn(async () => "sent" as const), service = emailService(f.db, transport);
    await expect(service.send({ ...input(), email: "invalid" })).rejects.toThrow();
    await expect(service.send({ ...input(), url: "https://evil.example/api/auth/reset-password/a" })).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled(); expect(await f.db.select().from(authLimits).all()).toHaveLength(0);
  });
  it("does not send real email from Preview/development without an explicit allowlist", async () => {
    vi.stubEnv("LOTI_EMAIL_MODE", "resend"); vi.stubEnv("RESEND_API_KEY", "synthetic-key"); vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("LOTI_EMAIL_TEST_RECIPIENTS", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await emailService(f.db).send(input())).toBe("failed");
    expect(fetchSpy).not.toHaveBeenCalled(); fetchSpy.mockRestore();
  });
  it("handles provider 429 and network uncertainty without retries or credential persistence", async () => {
    vi.stubEnv("LOTI_EMAIL_MODE", "resend"); vi.stubEnv("RESEND_API_KEY", "re_synthetic_test_only"); vi.stubEnv("VERCEL_ENV", "preview");
    const first = input(), second = input();
    vi.stubEnv("LOTI_EMAIL_TEST_RECIPIENTS", `${first.email},${second.email}`);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ name: "rate_limit_exceeded", message: "Synthetic provider limit", statusCode: 429 }), { status: 429 })).mockRejectedValueOnce(new Error("Synthetic timeout"));
    try {
      expect(await emailService(f.db).send(first)).toBe("failed"); tick();
      expect(await emailService(f.db).send(second)).toBe("uncertain");
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(await f.db.select().from(authEmailDeliveries).all())).not.toContain("re_synthetic_test_only");
    } finally { fetchSpy.mockRestore(); }
  });
  it("uses only the trusted Vercel IP and retains a conservative fallback", () => {
    vi.stubEnv("VERCEL", "1");
    expect(trustedClientIp(new Request("https://useloti.com", { headers: { "x-forwarded-for": "1.2.3.4" } }))).toBe("unknown");
    expect(trustedClientIp(new Request("https://useloti.com", { headers: { "x-vercel-forwarded-for": "2.3.4.5", "x-forwarded-for": "1.2.3.4" } }))).toBe("2.3.4.5");
    expect(privateKey("address@loti.test")).not.toContain("address");
  });
  it("does not increment a full fixed bucket", async () => {
    expect((await consumeLimit(f.db, { key: "limited", max: 1, seconds: 60 })).allowed).toBe(true);
    expect((await consumeLimit(f.db, { key: "limited", max: 1, seconds: 60 })).allowed).toBe(false);
    expect((await f.db.select().from(authLimits).where(eq(authLimits.key, `limited:${Math.floor(Date.now() / 60000)}`)).get())!.count).toBe(1);
  });
});
