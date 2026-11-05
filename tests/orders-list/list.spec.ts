import { expect, test } from "@playwright/test";
import type { WarehouseData } from "@/components/orders/orders-screen";

const evidence = process.env.LOTI_ORDERS_EVIDENCE ?? "artifacts/qa/orders-retomada-f4/regression";
let authState: Awaited<ReturnType<import("@playwright/test").BrowserContext["storageState"]>>;
test.beforeAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  const response = await context.request.post(`${baseURL}/api/auth/sign-in/email`, { headers: { Origin: baseURL! }, data: { email: "pessoa-a@loti.test", password: "Loti-Orders-QA-Only-2026!" } });
  expect(response.ok()).toBe(true);
  authState = await context.storageState();
  await context.close();
});
test.beforeEach(async ({ context }) => { await context.addCookies(authState.cookies); });
const rows = (page: import("@playwright/test").Page) => page.locator(".orders-catalog-row");

test("five real columns, bounded pagination, variant search and item identity", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 930 });
  let writes = 0;
  page.on("request", request => { if (request.method() !== "GET" && /\/api\/(warehouse|packages|qc|logistics)/.test(request.url())) writes++; });
  await page.goto("/orders");
  await expect(rows(page)).toHaveCount(20);
  await expect(page.getByRole("columnheader")).toHaveText(["Produto", "Etapa", "Unidades", "Custo", "Ação"]);
  const firstIds = await rows(page).evaluateAll(elements => elements.map(element => element.getAttribute("data-item-id")));
  const table = (await page.locator(".orders-catalog-table").boundingBox())!;
  expect(Math.round(table.x)).toBe(280);
  expect(Math.round(table.width)).toBe(1192);
  // Layout-only check for the future panel slot; no item/preparation data is connected in F2.
  await page.locator(".orders-workspace").evaluate(element => { element.setAttribute("data-panel", "prepare"); });
  expect(Math.round((await page.locator(".orders-catalog-table").boundingBox())!.width)).toBe(800);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator(".orders-workspace").evaluate(element => { element.setAttribute("data-panel", "closed"); });
  expect(Math.round((await page.locator(".orders-catalog-table").boundingBox())!.width)).toBe(1192);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${evidence}/list-desktop-1500.png` });
  await page.getByRole("button", { name: "Próxima página", exact: true }).click();
  await expect(rows(page)).toHaveCount(7);
  await expect(page).toHaveURL(/page=1/);
  const secondIds = await rows(page).evaluateAll(elements => elements.map(element => element.getAttribute("data-item-id")));
  expect(new Set([...firstIds, ...secondIds]).size).toBe(27);
  await expect(page.getByRole("button", { name: "Próxima página", exact: true })).toBeDisabled();
  await page.getByPlaceholder("Buscar produto ou pedido").fill("Modelo exclusivo QA");
  await expect(rows(page)).toHaveCount(1);
  await expect(page).not.toHaveURL(/page=/);
  await expect(page.getByRole("navigation", { name: "Páginas de pedidos" })).toHaveCount(0);
  await expect(rows(page)).toContainText("Produto catálogo QA 24");
  const url = page.url();
  await page.getByRole("button", { name: "Detalhes de Produto catálogo QA 24", exact: true }).click();
  await expect(page.locator(".orders-desktop-panel h2")).toHaveText("Produto catálogo QA 24");
  expect(page.url()).toBe(url);
  const origin = page.getByRole("button", { name: "Compra de origem de Produto catálogo QA 24", exact: true });
  await origin.click();
  await expect(page.getByRole("dialog", { name: "Compra de origem", exact: true }).getByRole("link", { name: "Ver compra completa", exact: true })).toHaveAttribute("href", /item=/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".orders-catalog img")).toHaveCount(0);
  expect(writes).toBe(0);
});

test("tabs intersect stage and advanced filters, cancel is inert and URL survives reload", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 930 });
  await page.goto("/orders");
  await expect(rows(page)).toHaveCount(20);
  await page.getByRole("button", { name: "No armazém", exact: true }).click();
  await expect(rows(page)).toHaveCount(3);
  await expect(page).toHaveURL(/view=warehouse/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "No armazém", exact: true })).toBeVisible();
  await expect(rows(page)).toHaveCount(3);
  await page.setViewportSize({ width: 1500, height: 930 });
  await page.getByRole("combobox", { name: "Etapa", exact: true }).selectOption("awaiting");
  await expect(rows(page)).toHaveCount(2);
  const appliedUrl = page.url();
  await page.getByRole("button", { name: /^Filtros/ }).click();
  const dialog = page.getByRole("dialog", { name: "Filtros", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox", { name: "Origem", exact: true }).selectOption("additional");
  await page.keyboard.press("Escape");
  expect(page.url()).toBe(appliedUrl);
  await page.getByRole("button", { name: /^Filtros/ }).click();
  await expect(dialog.getByRole("combobox", { name: "Origem", exact: true })).toHaveValue("");
  await dialog.getByRole("combobox", { name: "Origem", exact: true }).selectOption("additional");
  await dialog.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nenhum pedido corresponde aos filtros aplicados" })).toBeVisible();
  await expect(page).toHaveURL(/origin=additional/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Nenhum pedido corresponde aos filtros aplicados" })).toBeVisible();
  await page.screenshot({ path: `${evidence}/list-empty-1500.png` });
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).first().click();
  await expect(rows(page)).toHaveCount(20);
  await expect(page).toHaveURL(/\/orders$/);
});

test("local selection survives filters without reserving and add never opens item details", async ({ page }) => {
  let writes = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().includes("/api/warehouse")) writes++; });
  await page.goto("/orders?view=available");
  await expect(rows(page)).toHaveCount(3);
  const add = page.getByRole("button", { name: "Adicionar Produto catálogo QA 24 à seleção", exact: true });
  await add.click();
  await expect(page.locator(".orders-selection-summary")).toContainText("1 unidade selecionada");
  await expect(page.locator(".orders-item-detail")).toHaveCount(0);
  await page.getByPlaceholder("Buscar produto ou pedido").fill("Camiseta retida QA");
  await expect(rows(page)).toHaveCount(1);
  await expect(page.locator(".orders-selection-summary")).toContainText("1 unidade selecionada");
  await page.getByRole("button", { name: "Limpar seleção", exact: true }).click();
  await expect(page.locator(".orders-selection-summary")).toHaveCount(0);
  expect(writes).toBe(0);
});

test("loading, error/retry and out-of-range URL recover without stale rows", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let call = 0;
  await page.route("**/api/warehouse?**", async route => {
    call++;
    if (call === 1) { await gate; await route.fulfill({ status: 503, json: { error: "Falha sintética recuperável" } }); }
    else await route.continue();
  });
  await page.goto("/orders");
  await expect(page.locator(".orders-list-loading")).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  release();
  await expect(page.locator(".orders-request-error [role=alert]")).toContainText("Falha sintética recuperável");
  await page.screenshot({ path: `${evidence}/list-error-1500.png` });
  await page.getByRole("button", { name: "Tentar carregar novamente", exact: true }).click();
  await expect(rows(page)).toHaveCount(20);
  await page.goto("/orders?page=999");
  await expect(rows(page)).toHaveCount(7);
  await expect(page).toHaveURL(/page=1/);
  await expect(page.locator(".orders-request-error [role=alert]")).toHaveCount(0);
});

test("mobile filters enter from bottom, close restores focus and apply uses the real reader", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/orders");
  await expect(rows(page)).toHaveCount(20);
  const trigger = page.getByRole("button", { name: /^Filtros/ });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Filtros", exact: true });
  await expect(dialog).toHaveClass(/orders-bottom-sheet/);
  await dialog.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.x).toBe(0);
  expect(Math.round(bounds.y + bounds.height)).toBe(844);
  await page.screenshot({ path: `${evidence}/filters-mobile-390.png` });
  await dialog.getByRole("combobox").first().selectOption("available");
  await dialog.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(rows(page)).toHaveCount(3);
  await expect(page.locator(".orders-catalog-cost").first()).toBeHidden();
  await page.getByRole("button", { name: "Detalhes de Produto catálogo QA 24", exact: true }).click();
  await expect(page.locator(".orders-item-detail .orders-item-total")).toContainText("R$");
  await page.getByRole("dialog").getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await expect(rows(page)).toHaveCount(20);
  await page.getByRole("button", { name: "A caminho", exact: true }).click();
  const result = await page.request.get("/api/warehouse?pageSize=20&view=awaiting");
  const data = (await result.json()).data as WarehouseData;
  await expect(rows(page)).toHaveCount(data.rows.length);
  await expect(page).toHaveURL(/view=awaiting/);
});

for (const width of [320, 360, 390, 430, 768, 1024, 1280, 1500, 1920]) {
  test(`real list stays within ${width}px in both themes`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: width < 500 ? 844 : 930 });
    await page.goto("/orders");
    await expect(rows(page)).toHaveCount(20);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${evidence}/list-light-${width}.png` });
    await page.getByRole("switch", { name: "Tema escuro", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.screenshot({ path: `${evidence}/list-dark-${width}.png` });
    await page.getByRole("button", { name: /^Filtros/ }).click();
    const dialog = page.getByRole("dialog", { name: "Filtros", exact: true });
    await expect(dialog).toBeVisible();
    if (width < 1200) await expect(dialog).toHaveClass(/orders-bottom-sheet/);
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
    await page.keyboard.press("Escape");
    expect(errors).toEqual([]);
  });
}
