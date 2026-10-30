import { expect, test, type BrowserContext } from "@playwright/test";

let auth: Awaited<ReturnType<BrowserContext["storageState"]>>;
test.beforeAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  expect((await context.request.post(`${baseURL}/api/auth/sign-in/email`, { headers: { Origin: baseURL! }, data: { email: "pessoa-a@loti.test", password: "Loti-Orders-QA-Only-2026!" } })).ok()).toBe(true);
  auth = await context.storageState(); await context.close();
});
test.beforeEach(async ({ context }) => { await context.addCookies(auth.cookies); });

test("mobile arrival stays vertical and returns focus to the existing item action", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/orders?search=Seis%20exemplos");
  await page.getByRole("button", { name: "Detalhes de JBL Flip 6", exact: true }).click();
  const action = page.getByRole("button", { name: "Conferir chegada de JBL Flip 6", exact: true }); await action.click();
  const dialog = page.getByRole("dialog", { name: "Conferir chegada ao armazém", exact: true }); await expect(dialog).toHaveClass(/orders-bottom-sheet/);
  const box = (await dialog.boundingBox())!; expect(Math.round(box.x)).toBe(0); expect(Math.round(box.y + box.height)).toBe(844);
  await dialog.getByRole("spinbutton", { name: /Novo total recebido/ }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/qa/orders-retomada-f4/arrival-mobile.png" });
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(action).toBeFocused();
  await expect(page.locator(".orders-item-detail:visible")).toBeVisible();
});

test("mixed account selection is blocked before any reservation", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 930 }); let writes = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().includes("/api/warehouse")) writes++; });
  await page.route("**/api/warehouse?**", async route => { const response = await route.fetch(); const body = await response.json(); for (const row of body.data.rows) if (row.name === "Baseus Blade Power Bank") row.accountId = "other-account"; await route.fulfill({ response, json: body }); });
  await page.goto("/orders?search=Seis%20exemplos");
  for (const name of ["JBL Flip 6", "Baseus Blade Power Bank"]) await page.getByRole("button", { name: `Adicionar ${name} à seleção`, exact: true }).click();
  await page.getByRole("button", { name: "Preparar pacote", exact: true }).click();
  await page.locator(".orders-panel-footer").getByRole("button", { name: "Montar pacote", exact: true }).click();
  await expect(page.locator(".orders-panel-content").getByRole("alert")).toContainText("única conta HubBuy");
  await expect(page.locator(".orders-review-form:visible")).toHaveCount(0); expect(writes).toBe(0);
});

test("a known conflict preserves the review draft and keeps quantities editable", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 930 }); await page.goto("/orders?search=Seis%20exemplos");
  await page.getByRole("button", { name: "Adicionar JBL Flip 6 à seleção", exact: true }).click();
  await page.getByRole("button", { name: "Preparar pacote", exact: true }).click();
  await page.locator(".orders-panel-footer").getByRole("button", { name: "Montar pacote", exact: true }).click();
  const review = page.locator(".orders-review-form:visible");
  await review.getByLabel("Nome para novo pacote").fill("Rascunho preservado"); await review.getByLabel("Motivo", { exact: true }).fill("Revisão após concorrência");
  await page.route("**/api/warehouse", route => route.fulfill({ status: 409, json: { error: "A seleção mudou. Atualize os pedidos." } }));
  await review.getByRole("button", { name: "Montar pacote", exact: true }).click();
  await expect(review.getByRole("alert")).toContainText("A seleção mudou");
  await expect(review.getByLabel("Nome para novo pacote")).toHaveValue("Rascunho preservado");
  await expect(review.getByLabel("Nome para novo pacote")).toBeEnabled();
  await review.getByRole("button", { name: "Voltar", exact: true }).click();
  await expect(page.locator(".orders-preparation:visible").getByRole("spinbutton")).toHaveValue("1");
});
