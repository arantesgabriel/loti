import { defineConfig, devices } from "@playwright/test";
import { ordersTransitionTarget } from "./scripts/orders-transition-environment";

ordersTransitionTarget(process.env.LOTI_ORDERS_TRANSITION_DATABASE);
export default defineConfig({
  testDir: "./tests/orders-transition", fullyParallel: false, workers: 1, timeout: 120000,
  outputDir: "artifacts/qa/orders-transition/playwright-output", reporter: [["list"]],
  use: { baseURL: process.env.LOTI_ORDERS_TRANSITION_BASE_URL ?? "http://localhost:3139", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
