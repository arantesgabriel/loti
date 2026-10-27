import { defineConfig, devices } from "@playwright/test";

// This suite only visits a server already running locally. It never seeds or
// migrates a database and is deliberately separate from playwright.config.ts.
const baseURL = process.env.LOTI_LANDING_BASE_URL ?? "http://localhost:3121";
const target = new URL(baseURL);
if (target.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(target.hostname) || target.pathname !== "/") {
  throw new Error("Landing QA requires an HTTP loopback origin, without a path.");
}

export default defineConfig({
  testDir: "./tests/landing",
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  outputDir: "artifacts/qa/landing-l6/test-results",
  reporter: [["list"], ["json", { outputFile: "artifacts/qa/landing-l6/landing-test-results.json" }]],
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
