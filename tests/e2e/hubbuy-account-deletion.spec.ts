import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { login } from "./helpers";

test("deletes an unused account with cancellation, keyboard focus and an idempotent retry after a lost response", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const origin = test.info().project.use.baseURL ?? "http://localhost:3100";
  const anonymous = await browser.newContext();
  expect((await anonymous.request.post(`${origin}/api/hubbuy/accounts/missing`, { headers: { Origin: origin }, data: { operation: "delete" } })).status()).toBe(401);
  await anonymous.close();
  await login(page, "profile-qa", "Profile-QA-Old-2026!");
  await page.goto("/packages/accounts");
  const name = `Conta para excluir ${Date.now()}`;
  await page.getByRole("button", { name: "Adicionar conta", exact: true }).click();
  await page.getByRole("textbox", { name: "Adicionar conta HubBuy", exact: true }).fill(name);
  await page.getByRole("button", { name: "Criar conta · saldo ¥0" }).click();
  const row = page.locator(".cost-hubbuy-account").filter({ hasText: name });
  await row.getByRole("button", { name: "Ações", exact: true }).click();
  await page.getByRole("menuitem", { name: "Excluir conta", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Excluir cadastro do Loti?" });
  await expect(dialog).toContainText("Isso não encerra sua conta no HubBuy");
  await expect(dialog.getByRole("button", { name: "Excluir conta", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: "Ações", exact: true })).toBeFocused();
  await row.getByRole("button", { name: "Ações", exact: true }).click();
  await page.getByRole("menuitem", { name: "Excluir conta", exact: true }).click();
  await dialog.getByLabel("Motivo da exclusão").fill("Cadastro sintético criado por engano");
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (process.env.LOTI_CAPTURE_HUBBUY_DELETE_QA === "1") {
      mkdirSync(resolve("artifacts/qa/hubbuy-account-deletion"), { recursive: true });
      await page.screenshot({ path: resolve(`artifacts/qa/hubbuy-account-deletion/confirmation-${width}.png`), fullPage: true });
    }
  }
  const submissions: Record<string, unknown>[] = [];
  let loseResponse = true;
  await page.route("**/api/hubbuy/accounts/*", async route => {
    const request = route.request();
    if (request.method() !== "POST" || request.postDataJSON().operation !== "delete") { await route.continue(); return; }
    submissions.push(request.postDataJSON());
    if (loseResponse) {
      loseResponse = false;
      const result = await route.fetch();
      expect(result.status()).toBe(200);
      await route.abort("failed");
    } else await route.continue();
  });
  await dialog.getByRole("button", { name: "Excluir conta", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Não foi possível conectar");
  await expect(row).toBeVisible();
  await dialog.getByRole("button", { name: "Excluir conta", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(row).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Adicionar conta HubBuy", exact: true })).toBeFocused();
  expect(submissions).toHaveLength(2);
  expect(submissions[1]).toEqual(submissions[0]);
  await page.reload();
  await expect(row).toHaveCount(0);
  const accounts = (await (await page.request.get("/api/hubbuy/accounts")).json()).data;
  expect(accounts.some((a: { label: string }) => a.label === name)).toBe(false);
  const unavailable = await page.request.post("/api/hubbuy/accounts/absent", { headers: { Origin: "https://untrusted.test" }, data: { operation: "delete" } });
  expect(unavailable.status()).toBe(403);
  expect(unavailable.headers()["cache-control"]).toContain("no-store");
});
