import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
beforeEach(() => {
  vi.resetModules();
  const values = {
    VERCEL: "", LOTI_E2E_QC_VIEWER: "1", TURSO_DATABASE_URL: "file:./data/e2e-refunds-synthetic.sqlite", BETTER_AUTH_URL: "http://localhost:3100",
    LOTI_QC_TEST_S3_ENDPOINT: "http://localhost:3102", R2_ACCOUNT_ID: "0".repeat(32), R2_BUCKET_NAME: "qc-fixture",
    R2_WRITE_ACCESS_KEY_ID: "test", R2_WRITE_SECRET_ACCESS_KEY: "test", R2_READ_ACCESS_KEY_ID: "test", R2_READ_SECRET_ACCESS_KEY: "test",
  };
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
});
afterEach(() => vi.unstubAllEnvs());
describe("local S3 fixture boundary", () => {
  it.each([
    ["VERCEL", "1"], ["LOTI_E2E_QC_VIEWER", ""], ["TURSO_DATABASE_URL", "libsql://remote.invalid"],
    ["TURSO_DATABASE_URL", "file:./data/e2e-refunds-../../real.sqlite"], ["BETTER_AUTH_URL", "https://example.invalid"],
    ["LOTI_QC_TEST_S3_ENDPOINT", "http://127.0.0.1:3102"], ["R2_BUCKET_NAME", "other"],
  ])("rejects the fixture when %s violates isolation", async (name, value) => {
    vi.stubEnv(name, value);
    const { assertQcStorageConfigured } = await import("@/lib/qc/storage");
    expect(() => assertQcStorageConfigured()).toThrow("isolated local E2E");
  });
  it("permits only the exact disposable localhost fixture", async () => {
    const { assertQcStorageConfigured } = await import("@/lib/qc/storage");
    expect(() => assertQcStorageConfigured()).not.toThrow();
  });
});
