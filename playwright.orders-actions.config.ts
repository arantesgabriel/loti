import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/orders-actions", workers: 1, timeout: 90000, expect: { timeout: 15000 }, reporter: [["list"]],
  outputDir: "artifacts/qa/orders-phase56/playwright-output",
  use: { baseURL: "http://localhost:3156", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
