import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/orders-detail", workers: 1, timeout: 60000,
  reporter: [["list"]], outputDir: "artifacts/qa/orders-freeze-phase3/playwright-output",
  use: { baseURL: "http://localhost:3143", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "node --conditions=react-server --import tsx scripts/qa-orders-detail.ts", url: "http://localhost:3143/login", reuseExistingServer: false, timeout: 120000 },
});
