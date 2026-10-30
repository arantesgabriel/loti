import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import type { WarehouseData } from "@/components/orders/orders-screen";

const evidence = "artifacts/qa/orders-retomada-f4/preparation";
let auth: Awaited<ReturnType<BrowserContext["storageState"]>>;
test.beforeAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  const response = await context.request.post(`${baseURL}/api/auth/sign-in/email`, { headers: { Origin: baseURL! }, data: { email: "pessoa-a@loti.test", password: "Loti-Orders-QA-Only-2026!" } });
  expect(response.ok()).toBe(true); auth = await context.storageState(); await context.close();
});
test.beforeEach(async ({ context }) => { await context.addCookies(auth.cookies); });
const preparation = (page: Page) => page.locator(".orders-preparation:visible");
async function select(page: Page, name = "JBL Flip 6") { await page.getByRole("button", { name: `Adicionar ${name} à seleção`, exact: true }).click(); }
async function prepare(page: Page) { await page.getByRole("button", { name: "Preparar pacote", exact: true }).filter({ visible: true }).click(); await expect(preparation(page)).toBeVisible(); await expect(preparation(page).getByRole("spinbutton", { name: "Unidades de JBL Flip 6 para selecionar", exact: true })).toBeEnabled(); }
for (const [width, height] of [[320,700],[360,800],[390,844],[430,932],[768,1024],[1024,768],[1280,800],[1500,930],[1920,1080]]) {
  test(`preparation, review, keyboard and themes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/orders?search=Seis%20exemplos"); await select(page); await select(page, "Baseus Blade Power Bank");
    const url = page.url(); await prepare(page);
    const stepper = preparation(page).getByRole("spinbutton", { name: "Unidades de JBL Flip 6 para selecionar", exact: true });
    await expect(stepper).toHaveValue("1"); await stepper.focus(); await page.keyboard.press("ArrowUp"); await expect(stepper).toHaveValue("2");
    await expect(preparation(page).getByRole("button", { name: "Aumentar JBL Flip 6", exact: true })).toBeDisabled();
    await preparation(page).getByRole("button", { name: "Consultar JBL Flip 6", exact: true }).click();
    await expect(page.locator(".orders-item-detail:visible")).toBeVisible(); await page.getByRole("button", { name: "Voltar à preparação · 3", exact: true }).click();
    await expect(preparation(page).getByRole("spinbutton", { name: "Unidades de JBL Flip 6 para selecionar", exact: true })).toHaveValue("2");
    await page.screenshot({ path: `${evidence}/prepare-light-${width}.png` });
    await page.locator(".orders-panel-footer:visible").getByRole("button", { name: "Montar pacote", exact: true }).click();
    const review = page.locator(".orders-review-form:visible"); await expect(review).toBeVisible();
    await expect(review.locator(".orders-preparation-total")).toContainText("3 unidades");
    await expect(review.getByRole("button", { name: "Montar pacote", exact: true })).toBeVisible();
    expect(page.url()).toBe(url);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const dialog = page.getByRole("dialog");
    if (width < 1200) { const box = (await dialog.boundingBox())!; expect(Math.round(box.x)).toBe(0); expect(Math.round(box.y + box.height)).toBe(height); expect(await dialog.evaluate(element => getComputedStyle(element).animationName)).toBe("none"); }
    await review.getByLabel("Nome para novo pacote").fill("Pacote de conferência visual"); await review.getByLabel("Motivo", { exact: true }).fill("Conferência visual sem envio");
    await review.getByRole("button", { name: "Montar pacote", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${evidence}/review-light-${width}.png` });
    await review.getByRole("button", { name: "Voltar", exact: true }).click(); await expect(preparation(page)).toBeVisible();
    await page.keyboard.press("Escape"); await expect(preparation(page)).toHaveCount(0);
    await page.getByRole("switch", { name: "Tema escuro", exact: true }).click(); await prepare(page);
    await page.screenshot({ path: `${evidence}/prepare-dark-${width}.png` });
    await preparation(page).getByRole("button", { name: "Remover Baseus Blade Power Bank do pacote", exact: true }).click();
    await expect(preparation(page).locator(".orders-preparation-item")).toHaveCount(1);
    await preparation(page).getByRole("button", { name: "Diminuir JBL Flip 6", exact: true }).click();
    await preparation(page).getByRole("button", { name: "Diminuir JBL Flip 6", exact: true }).click();
    await expect(preparation(page)).toContainText("Nenhum produto selecionado");
    await expect(page.locator(".orders-panel-footer:visible").getByRole("button", { name: "Montar pacote", exact: true })).toBeDisabled();
  });
}

test("off-page selection is reconciled before review and refresh errors block confirmation", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 930 }); await page.goto("/orders?search=Seis%20exemplos"); await select(page);
  await page.getByRole("searchbox").fill("Baseus"); await expect(page.locator(".orders-catalog-row")).toHaveCount(1);
  await page.route("**/api/warehouse?*itemIds*", async route => { const response = await route.fetch(); const body = await response.json(); for (const row of body.data.rows) { row.availableUnits = []; row.revision++; } await route.fulfill({ response, json: body }); });
  await page.getByRole("button", { name: "Preparar pacote", exact: true }).click(); await expect(preparation(page)).toContainText("Nenhum produto selecionado"); await expect(page.getByRole("status").filter({ hasText: "Disponibilidade atualizada" })).toBeVisible();
  await page.unroute("**/api/warehouse?*itemIds*"); await page.keyboard.press("Escape"); await select(page, "Baseus Blade Power Bank");
  await page.route("**/api/warehouse?*itemIds*", route => route.abort());
  await page.getByRole("button", { name: "Preparar pacote", exact: true }).click(); await expect(page.locator(".orders-panel-content:visible").getByRole("alert")).toContainText(/conferir|conectar|conexão|servidor|carregar/i);
  await page.locator(".orders-panel-footer").getByRole("button", { name: "Montar pacote", exact: true }).click(); await expect(page.locator(".orders-review-form:visible")).toHaveCount(0);
});

test("real reservation retries a lost response with the same command and creates one package", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1500, height: 930 }); await page.goto("/orders?search=Seis%20exemplos"); await select(page); await prepare(page);
  await page.locator(".orders-panel-footer").getByRole("button", { name: "Montar pacote", exact: true }).click();
  const review = page.locator(".orders-review-form:visible"); await review.getByLabel("Nome para novo pacote").fill("F4 QA retry único"); await review.getByLabel("Motivo", { exact: true }).fill("Reserva sintética F4 com perda de resposta");
  const attempts: unknown[] = []; let committed = "";
  await page.route("**/api/warehouse", async route => {
    if (route.request().method() !== "POST") return route.continue();
    attempts.push(route.request().postDataJSON());
    if (attempts.length === 1) { const response = await route.fetch(); expect(response.ok()).toBe(true); committed = (await response.json()).data.id; return route.abort(); }
    return route.continue();
  });
  await review.getByRole("button", { name: "Montar pacote", exact: true }).dblclick();
  await expect(review.getByRole("alert")).toContainText("A confirmação não chegou");
  await expect(review.getByLabel("Nome para novo pacote")).toBeDisabled();
  await review.getByRole("button", { name: "Tentar confirmar novamente", exact: true }).click();
  await expect(page.getByRole("link", { name: "Abrir pacote", exact: true })).toHaveAttribute("href", `/packages/detail/${committed}`);
  expect(attempts).toHaveLength(2); expect(attempts[0]).toEqual(attempts[1]);
  const result = await page.request.get(`${baseURL}/api/warehouse?search=JBL`);
  const data = (await result.json()).data as WarehouseData;
  expect(data.rows[0].availableUnits).toHaveLength(1);
  expect(data.packages.filter(pkg => pkg.name === "F4 QA retry único")).toHaveLength(1);
  await page.getByRole("link", { name: "Abrir pacote", exact: true }).click(); await expect(page.getByRole("heading", { name: "F4 QA retry único", exact: true })).toBeVisible();
  await page.goto("/orders?search=Seis%20exemplos"); await select(page, "Baseus Blade Power Bank");
  await page.getByRole("button", { name: "Preparar pacote", exact: true }).click();
  await page.locator(".orders-panel-footer").getByRole("button", { name: "Montar pacote", exact: true }).click();
  await review.getByRole("combobox", { name: "Destino", exact: true }).selectOption(committed);
  await expect(review.getByLabel("Nome para novo pacote")).toHaveCount(0);
  await review.getByLabel("Motivo", { exact: true }).fill("Acrescentar unidade ao pacote existente");
  await review.getByRole("button", { name: "Montar pacote", exact: true }).click();
  await expect(page.getByRole("link", { name: "Abrir pacote", exact: true })).toHaveAttribute("href", `/packages/detail/${committed}`);
  const updated = (await (await page.request.get("/api/warehouse?search=Baseus")).json()).data as WarehouseData;
  expect(updated.rows[0].availableUnits).toHaveLength(0);
  expect(updated.rows[0].reservations.filter(reservation => reservation.packageId === committed)).toHaveLength(1);
  expect(updated.packages.filter(pkg => pkg.name === "F4 QA retry único")).toHaveLength(1);
});
