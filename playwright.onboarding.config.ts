import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./tests/e2e", testMatch: "onboarding.spec.ts", workers: 1, timeout: 120000,
  reporter: [["list"], ["json", { outputFile: process.env.LOTI_ONBOARDING_QA_REPORT ?? "artifacts/qa/onboarding/playwright.json" }]],
  use: { baseURL: "http://localhost:3120", viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure", screenshot: "only-on-failure", video: { mode: "on", size: { width: 960, height: 600 } },
    ...(process.env.LOTI_QA_BROWSER_EXECUTABLE ? { launchOptions: { executablePath: process.env.LOTI_QA_BROWSER_EXECUTABLE } } : {}) },
});
