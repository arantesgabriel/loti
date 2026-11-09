import { describe, expect, it } from "vitest";
import { ordersTransitionTarget } from "../../scripts/orders-transition-environment";

describe("orders transition fixture destination", () => {
  it("requires an explicit bounded local destination", () => {
    expect(() => ordersTransitionTarget(undefined, {})).toThrow();
    for (const value of ["libsql://example.test", "file:./data/loti.sqlite", "file:./data/e2e.sqlite", "file:./data/orders-transition-x.sqlite/../../loti.sqlite", "file:./data/nested/orders-transition-x.sqlite"]) expect(() => ordersTransitionTarget(value, {})).toThrow();
    expect(ordersTransitionTarget("file:./data/orders-transition-safety-test.sqlite", {}).url).toMatch(/^file:.*\/data\/orders-transition-safety-test\.sqlite$/);
  });
  it("rejects hosted execution and external credentials before opening a database", () => {
    for (const environment of [{ VERCEL: "1" }, { NODE_ENV: "production" }, { TURSO_AUTH_TOKEN: "synthetic-token" }, { RESEND_API_KEY: "synthetic-key" }, { R2_BUCKET_NAME: "synthetic-bucket" }, { AWS_SECRET_ACCESS_KEY: "synthetic-key" }]) expect(() => ordersTransitionTarget("file:./data/orders-transition-safety-test.sqlite", environment)).toThrow();
  });
});
