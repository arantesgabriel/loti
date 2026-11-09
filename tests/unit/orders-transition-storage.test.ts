import { afterEach, describe, expect, it, vi } from "vitest";
import { ordersTransitionQcStorage } from "@/lib/qc/orders-transition-storage";

afterEach(() => vi.unstubAllEnvs());
describe("synthetic QC storage opt-in", () => {
  it("keeps ordinary runtime storage unchanged", () => {
    vi.stubEnv("LOTI_ORDERS_TRANSITION_QA", "");
    expect(ordersTransitionQcStorage()).toBeNull();
  });
  it("fails closed for remote databases and hosted runtimes", () => {
    vi.stubEnv("LOTI_ORDERS_TRANSITION_QA", "1");
    vi.stubEnv("TURSO_DATABASE_URL", "libsql://synthetic.test");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3139");
    expect(() => ordersTransitionQcStorage()).toThrow(/explicit local synthetic/);
    vi.stubEnv("TURSO_DATABASE_URL", "file:./data/orders-transition-unit.sqlite");
    vi.stubEnv("VERCEL", "1");
    expect(() => ordersTransitionQcStorage()).toThrow(/explicit local synthetic/);
  });
  it("rejects a non-QA path, database token and incorrect origin", () => {
    vi.stubEnv("LOTI_ORDERS_TRANSITION_QA", "1");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("TURSO_DATABASE_URL", "file:./data/loti.sqlite");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3139");
    expect(() => ordersTransitionQcStorage()).toThrow(/explicit local synthetic/);
    vi.stubEnv("TURSO_DATABASE_URL", "file:./data/orders-transition-unit.sqlite");
    vi.stubEnv("TURSO_AUTH_TOKEN", "synthetic-token");
    expect(() => ordersTransitionQcStorage()).toThrow(/explicit local synthetic/);
    vi.stubEnv("TURSO_AUTH_TOKEN", "");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    expect(() => ordersTransitionQcStorage()).toThrow(/explicit local synthetic/);
  });
});
