import { defineConfig, devices } from "@playwright/test";

// The explicitly started server must use a copy of the synthetic F3 database.
// No default .env database, seed, reset or migration is started by this config.
export default defineConfig({
  testDir: "./tests/orders-identity",
  workers: 1,
  timeout: 90000,
  reporter: [["list"]],
  outputDir: "artifacts/qa/orders-retomada-r1/playwright-output",
  use: { baseURL: "http://localhost:3151", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
