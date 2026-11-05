import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/orders-foundation",
  workers: 1,
  timeout: 45000,
  reporter: [["list"]],
  outputDir: `${process.env.LOTI_ORDERS_FOUNDATION_EVIDENCE ?? "artifacts/qa/orders-retomada-r1/foundation"}/playwright-output`,
  use: { baseURL: "http://localhost:3141", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "node --import tsx scripts/qa-orders-foundation.ts", url: "http://localhost:3141", reuseExistingServer: false, timeout: 120000 },
});
