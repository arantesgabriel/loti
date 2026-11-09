import { expect, test } from "@playwright/test";

const evidence = process.env.LOTI_ORDERS_FOUNDATION_EVIDENCE ?? "artifacts/qa/orders-retomada-r1/foundation";

test("desktop reallocates all space and restores focus without losing context", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 930 });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  expect(await page.getByRole("heading", { name: "Pedidos", exact: true }).evaluate(element => getComputedStyle(element).fontFamily)).toContain("Geist");
  expect(await page.evaluate(() => document.fonts.check('14px "Geist"'))).toBe(true);
  const list = page.locator(".qa-table");
  const fullWidth = (await list.boundingBox())!.width;
  expect(Math.round(fullWidth)).toBe(1192);
  const trigger = page.getByRole("button", { name: "Preparar pacote", exact: true });
  await page.getByPlaceholder("Buscar produto ou pedido").fill("JBL");
  await page.screenshot({ path: `${evidence}/desktop-closed-1500.png` });
  await trigger.click();
  await expect(page.locator(".orders-desktop-panel")).toBeVisible();
  await expect(page.locator(".orders-desktop-panel h2")).toBeFocused();
  expect((await list.boundingBox())!.width).toBeLessThan(fullWidth - 380);
  const bounds = await page.locator(".orders-desktop-panel").boundingBox();
  const tableBounds = await list.boundingBox();
  expect(bounds!.x).toBeGreaterThan(tableBounds!.x + tableBounds!.width);
  expect(Math.round(bounds!.width)).toBe(390);
  expect(Math.round(bounds!.x)).toBe(1110);
  expect(Math.round(tableBounds!.width)).toBe(800);
  await page.screenshot({ path: `${evidence}/desktop-prepare-1500.png` });
  await page.keyboard.press("Escape");
  await expect(page.locator(".orders-desktop-panel")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect((await list.boundingBox())!.width).toBeCloseTo(fullWidth, 0);
  await expect(page.getByPlaceholder("Buscar produto ou pedido")).toHaveValue("JBL");
  await page.getByRole("button", { name: "Abrir detalhe sintético" }).click();
  await expect(page.locator(".orders-desktop-panel h2")).toHaveText("Detalhes do item");
  await page.screenshot({ path: `${evidence}/desktop-detail-1500.png` });
  await page.getByRole("button", { name: "Fechar painel" }).click();
  await expect(page.getByRole("button", { name: "Abrir detalhe sintético" })).toBeFocused();
});

test("mobile sheet traps focus, scrolls, closes by backdrop and enters vertically", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Preparar pacote", exact: true });
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: "Preparar pacote", exact: true });
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate(element => getComputedStyle(element).animationName)).toBe("orders-sheet-enter");
  await sheet.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
  const bounds = (await sheet.boundingBox())!;
  expect(bounds.x).toBe(0);
  expect(Math.round(bounds.width)).toBe(390);
  expect(Math.round(bounds.y + bounds.height)).toBe(844);
  expect(await page.locator("body").evaluate(element => getComputedStyle(element).overflow)).toBe("hidden");
  await page.keyboard.press("Shift+Tab");
  expect(await sheet.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.screenshot({ path: `${evidence}/mobile-prepare-390.png` });
  await page.getByRole("button", { name: "Alternar conteúdo longo" }).click();
  expect(await sheet.locator(".surface-body").evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await sheet.locator(".surface-body").evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(page.getByRole("button", { name: "Voltar à lista" })).toBeInViewport();
  await page.screenshot({ path: `${evidence}/mobile-long-390.png` });
  await page.keyboard.press("Escape");
  await expect(sheet).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked");
  await trigger.click();
  await expect(sheet).toBeVisible();
  await page.locator(".modal-overlay").click({ position: { x: 10, y: 10 } });
  await expect(sheet).not.toBeVisible();
});

test("nested modal owns Escape, tooltip is keyboard accessible, resize preserves draft", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 930 });
  await page.goto("/");
  const icon = page.getByRole("button", { name: "Abrir teste de importação QC" });
  await icon.focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.getByRole("button", { name: "Preparar pacote", exact: true }).click();
  await page.getByRole("button", { name: "Abrir confirmação de teste" }).click();
  await expect(page.getByRole("dialog", { name: "Confirmação de teste" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".orders-desktop-panel")).toBeVisible();
  await page.getByPlaceholder("Buscar produto ou pedido").fill("JBL");
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.getByRole("dialog", { name: "Preparar pacote", exact: true })).toBeVisible();
  await expect(page.locator(".orders-desktop-panel")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByPlaceholder("Buscar produto ou pedido")).toHaveValue("JBL");
  await expect(page.getByRole("button", { name: "Preparar pacote", exact: true })).toBeFocused();
});

for (const width of [320, 360, 390, 430, 768, 1024, 1280, 1500, 1920]) {
  test(`shell and panel fit ${width}px with reduced motion`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: width < 500 ? 844 : 930 });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole("button", { name: "Preparar pacote", exact: true }).click();
    const surface = page.locator(width < 1200 ? ".orders-bottom-sheet" : ".orders-desktop-panel");
    await expect(surface).toBeVisible();
    const bounds = (await surface.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width < 1200) expect(await surface.evaluate(element => getComputedStyle(element).animationName)).toBe("none");
    await page.screenshot({ path: `${evidence}/panel-${width}.png` });
    await page.keyboard.press("Escape");
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    await page.screenshot({ path: `${evidence}/shell-dark-${width}.png` });
    expect(errors).toEqual([]);
  });
}
