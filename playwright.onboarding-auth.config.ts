import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./tests/e2e", testMatch: ["onboarding-auth-regression.spec.ts", "signup.spec.ts"], workers: 1, timeout: 60000,
  reporter: [["list"], ["json", { outputFile: "artifacts/qa/onboarding/auth-browser.json" }]],
  outputDir: "artifacts/qa/onboarding/auth-test-results",
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure", screenshot: "only-on-failure",
    ...(process.env.LOTI_QA_BROWSER_EXECUTABLE ? { launchOptions: { executablePath: process.env.LOTI_QA_BROWSER_EXECUTABLE } } : {}) },
  webServer: { command: "npm run test:serve", url: "http://localhost:3100/login", reuseExistingServer: false, timeout: 120000 },
});
