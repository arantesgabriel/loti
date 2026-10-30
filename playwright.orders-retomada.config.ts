import { defineConfig, devices } from "@playwright/test";

// Explicit isolated server only. No seed, migration or default environment DB.
export default defineConfig({
  testDir: "./tests", testMatch: process.env.LOTI_ORDERS_SUITE === "list" ? /orders-list\/.*\.spec\.ts/ : /orders-(identity|detail|preparation)\/.*\.spec\.ts/,
  workers: 1, timeout: 90000, reporter: [["list"]],
  outputDir: `${process.env.LOTI_ORDERS_EVIDENCE ?? "artifacts/qa/orders-retomada-f4"}/playwright-output-${process.env.LOTI_ORDERS_SUITE ?? "main"}`,
  use: { baseURL: process.env.LOTI_ORDERS_BASE_URL ?? (process.env.LOTI_ORDERS_SUITE === "list" ? "http://localhost:3155" : "http://localhost:3154"), trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
