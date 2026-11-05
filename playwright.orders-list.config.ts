import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/orders-list", workers: 1, timeout: 60000,
  reporter: [["list"]], outputDir: "artifacts/qa/orders-freeze-phase2/playwright-output",
  use: { baseURL: "http://localhost:3142", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "node --conditions=react-server --import tsx scripts/qa-orders-list.ts", url: "http://localhost:3142/login", reuseExistingServer: false, timeout: 120000 },
});
