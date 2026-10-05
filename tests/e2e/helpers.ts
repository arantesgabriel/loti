import type { Page } from "@playwright/test";
const clients = new WeakMap<Page, string>();
let clientSequence = 0;
export async function login(page: Page, name = "gabriel") {
  // Each isolated browser models a different client. Keep the real auth rate limiter enabled.
  if (!clients.has(page)) clients.set(page, `203.0.113.${++clientSequence}`);
  await page.setExtraHTTPHeaders({ "X-Forwarded-For": clients.get(page)! });
  await page.goto("/login"); await page.getByLabel("Email", { exact: true }).fill(`${name}@loti.test`); await page.getByLabel("Senha", { exact: true }).fill("Loti-Dev-Only-2026!"); await page.getByRole("button", { name: "Entrar", exact: true }).click(); await page.waitForURL("**/favorites");
}
