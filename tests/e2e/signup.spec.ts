import { test, expect } from "@playwright/test";
import { testEmailUrl } from "./email-helper";

test("public signup confirms email before opening a personal workspace", async ({ page, browser }) => {
  const email = "signup-front5@loti.test", password = "Signup-Front5-E2E-2026!";
  await page.goto("/signup");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 960 });
    await expect(page.getByRole("heading", { name: "Crie seu espaço no Loti." })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/qa/signup-${width}.png`, fullPage: true });
  }
  await page.getByLabel("Nome completo", { exact: true }).fill("Pessoa Front 5");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByLabel("Confirmar senha", { exact: true }).fill("Not-the-same-password-2026!");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page.locator(".login-auth-content form .error")).toContainText("confirmações devem coincidir");
  await page.getByLabel("Confirmar senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Confira seu email." })).toBeVisible();

  const pendingContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pending = await pendingContext.newPage();
  await pending.setExtraHTTPHeaders({ "X-Forwarded-For": "203.0.113.225" });
  await pending.goto("/login");
  await pending.getByLabel("Email", { exact: true }).fill(email);
  await pending.getByLabel("Senha", { exact: true }).fill(password);
  await pending.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(pending).toHaveURL(/\/favorites$/);
  await expect(pending.getByRole("heading", { name: "Confirme seu email." })).toBeVisible();
  expect((await pending.request.get("/api/app")).status()).toBe(403);

  const verificationContext = await browser.newContext();
  const verification = await verificationContext.newPage();
  const link = await testEmailUrl(page.request, email, "/api/auth/verify-email");
  await verification.goto(link);
  await expect(verification.getByRole("heading", { name: "Email confirmado" })).toBeVisible();
  expect((await verification.request.get("/api/app")).status()).toBe(401);

  await pending.getByRole("button", { name: "Já confirmei meu email", exact: true }).click();
  await expect(pending.getByRole("heading", { name: "Favoritos", exact: true })).toBeVisible();
  const data = await (await pending.request.get("/api/app")).json();
  expect(data.currentUser.email).toBe(email);
  expect(data.workspaceKind).toBe("personal");
  expect(data.workspaces).toEqual([expect.objectContaining({ kind: "personal" })]);
  await pendingContext.close();
  await verificationContext.close();
});
