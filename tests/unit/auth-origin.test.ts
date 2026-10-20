import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authOrigin } from "@/lib/auth/origin";

beforeEach(() => {
  for (const key of ["BETTER_AUTH_URL", "VERCEL", "VERCEL_ENV", "VERCEL_BRANCH_URL", "VERCEL_URL"]) vi.stubEnv(key, undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("authentication origin by environment", () => {
  it("uses the explicit official production origin instead of deployment aliases", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_BRANCH_URL", "loti-old-alias.vercel.app");
    vi.stubEnv("BETTER_AUTH_URL", "https://useloti.com/");
    expect(authOrigin()).toBe("https://useloti.com");
  });
  it("fails closed for missing or insecure production configuration", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_URL", "loti-deployment.vercel.app");
    expect(() => authOrigin()).toThrow("BETTER_AUTH_URL");
    vi.stubEnv("BETTER_AUTH_URL", "http://useloti.com");
    expect(() => authOrigin()).toThrow("HTTPS");
  });
  it("retains exact Preview branch origin and deployment fallback", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_BRANCH_URL", "loti-feature.vercel.app");
    vi.stubEnv("VERCEL_URL", "loti-deployment.vercel.app");
    expect(authOrigin()).toBe("https://loti-feature.vercel.app");
    vi.stubEnv("VERCEL_BRANCH_URL", undefined);
    expect(authOrigin()).toBe("https://loti-deployment.vercel.app");
    vi.stubEnv("VERCEL_URL", undefined);
    expect(() => authOrigin()).toThrow("Vercel");
  });
  it("preserves localhost and an explicitly configured local port", () => {
    expect(authOrigin()).toBe("http://localhost:3000");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3100");
    expect(authOrigin()).toBe("http://localhost:3100");
  });
  it("rejects non-web and malformed configured URLs", () => {
    for (const value of ["javascript:alert(1)", "file:///tmp/auth", "useloti.com"]) {
      vi.stubEnv("BETTER_AUTH_URL", value);
      expect(() => authOrigin()).toThrow();
    }
  });
});
