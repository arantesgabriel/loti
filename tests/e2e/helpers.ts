import type { Page } from "@playwright/test";
export async function login(page: Page, name = "gabriel") {
  await page.goto("/login"); await page.getByLabel("Email", { exact: true }).fill(`${name}@loti.test`); await page.getByLabel("Senha", { exact: true }).fill("Loti-Dev-Only-2026!"); await page.getByRole("button", { name: "Entrar", exact: true }).click(); await page.waitForURL("**/favorites");
}
