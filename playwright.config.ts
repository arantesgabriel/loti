import { defineConfig, devices } from "@playwright/test";
const theme = process.env.LOTI_E2E_THEME;
if (theme && theme !== "light" && theme !== "dark" && theme !== "system") throw new Error("Invalid LOTI_E2E_THEME.");
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, workers: 1, timeout: 45000, expect: { timeout: 10000 }, retries: 0,
  reporter: [["list"], ["html", { open: "never" }]], use: { baseURL: "http://localhost:3100", trace: "retain-on-failure", screenshot: "only-on-failure", ...(theme ? { storageState: { cookies: [], origins: [{ origin: "http://localhost:3100", localStorage: [{ name: "loti.theme", value: theme }] }] } } : {}) },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "npm run test:serve", url: "http://localhost:3100/login", reuseExistingServer: false, timeout: 120000 },
});
