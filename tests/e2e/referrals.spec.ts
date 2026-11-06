import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("profile creates and reuses a referral link; signup keeps its source through validation on desktop and mobile", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: /^Perfil(?: e configurações)?$/ }).click();
  await expect(page.getByRole("heading", { name: "Indicação" })).toBeVisible();
  let firstUrl = "";
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("button", { name: firstUrl ? "Consultar link" : "Gerar link de indicação" }).click();
    const input = page.getByLabel("Seu link de indicação");
    await expect(input).toHaveValue(/\/signup\?ref=[A-Za-z0-9_-]{43}$/);
    if (!firstUrl) firstUrl = await input.inputValue();
    await expect(input).toHaveValue(firstUrl);
  }
  await page.goto(firstUrl);
  await expect(page.locator('input[name="referralToken"]')).toHaveValue(new URL(firstUrl).searchParams.get("ref")!);
  await page.getByLabel("Nome completo", { exact: true }).fill("Pessoa indicada");
  await page.getByLabel("Email", { exact: true }).fill("referral-e2e@loti.test");
  await page.getByLabel("Senha", { exact: true }).fill("Referral-E2E-Private-2026!");
  await page.getByLabel("Confirmar senha", { exact: true }).fill("Different-Referral-2026!");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page.locator(".login-auth-content form .error")).toBeVisible();
  await expect(page.locator('input[name="referralToken"]')).toHaveValue(new URL(firstUrl).searchParams.get("ref")!);
});
