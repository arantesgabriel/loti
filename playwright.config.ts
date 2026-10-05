import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, workers: 1, timeout: 45000, expect: { timeout: 10000 }, retries: 0,
  reporter: [["list"], ["html", { open: "never" }]], use: { baseURL: "http://localhost:3100", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "npm run test:serve", url: "http://localhost:3100/login", reuseExistingServer: false, timeout: 120000 },
});
