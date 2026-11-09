import { expect, test, type Page, type Route, type BrowserContext } from "@playwright/test";
import sharp from "sharp";
import type { WarehouseData } from "@/components/orders/orders-screen";

const evidence = process.env.LOTI_ORDERS_EVIDENCE ?? "artifacts/qa/orders-retomada-f4/regression";
let auth: Awaited<ReturnType<BrowserContext["storageState"]>>;
test.beforeAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  const response = await context.request.post(`${baseURL}/api/auth/sign-in/email`, { headers: { Origin: baseURL! }, data: { email: "pessoa-a@loti.test", password: "Loti-Orders-QA-Only-2026!" } });
  expect(response.ok()).toBe(true);
  auth = await context.storageState();
  await context.close();
});
test.beforeEach(async ({ context }) => { await context.addCookies(auth.cookies); });
const detail = (page: Page) => page.locator(".orders-item-detail:visible");
const rows = (page: Page) => page.locator(".orders-catalog-row");
const open = (page: Page, name: string) => page.getByRole("button", { name: `Detalhes de ${name}`, exact: true }).click();
const close = async (page: Page) => {
  if (await page.locator(".orders-desktop-panel").count()) await page.getByRole("button", { name: "Fechar painel", exact: true }).click();
  else await page.getByRole("dialog").getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(detail(page)).toHaveCount(0);
};
const examples = [
  ["Anker USB-C Cable", 0], ["UGREEN Nexode 65W", 0], ["Baseus Blade Power Bank", 1],
  ["JBL Flip 6", 2], ["Fender 351 Premium Picks", 0], ["D’Addario EXL110", 1],
] as const;

test("real item identity, full-width recovery, preserved URL/selection and rapid switching", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 930 });
  let writes = 0;
  page.on("request", request => { if (request.method() !== "GET" && /\/api\/(warehouse|packages|qc)/.test(request.url())) writes++; });
  await page.goto("/orders?search=Seis%20exemplos");
  await expect(rows(page)).toHaveCount(6);
  const url = page.url();
  await page.getByRole("button", { name: "Adicionar JBL Flip 6 à seleção", exact: true }).click();
  await expect(detail(page)).toHaveCount(0);
  await open(page, "JBL Flip 6");
  const response = await page.request.get("/api/warehouse?search=JBL");
  const real = ((await response.json()).data as WarehouseData).rows[0];
  await expect(detail(page)).toHaveAttribute("data-detail-item-id", real.costItemId);
  await expect(page.locator(".orders-desktop-panel h2")).toHaveText("JBL Flip 6");
  await expect(detail(page).locator(".orders-item-available")).toHaveText("2 unidades");
  await expect(detail(page).getByRole("spinbutton")).toHaveValue("1");
  const table = (await page.locator(".orders-catalog-table").boundingBox())!;
  expect(Math.round(table.width)).toBe(800);
  expect(Math.round((await page.locator(".orders-desktop-panel").boundingBox())!.x)).toBe(1110);
  await page.screenshot({ path: `${evidence}/detail-real-desktop-1500.png` });
  await open(page, "Baseus Blade Power Bank");
  await expect(page.locator(".orders-desktop-panel h2")).toHaveText("Baseus Blade Power Bank");
  await expect(detail(page).locator(".orders-item-available")).toHaveText("1 unidade");
  await expect(detail(page).getByRole("spinbutton")).toHaveValue("0");
  await page.keyboard.press("Escape");
  await expect(detail(page)).toHaveCount(0);
  expect(Math.round((await page.locator(".orders-catalog-table").boundingBox())!.width)).toBe(1192);
  expect(page.url()).toBe(url);
  await expect(page.getByRole("button", { name: "Remover JBL Flip 6 da seleção", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Detalhes de Baseus Blade Power Bank", exact: true }).focus();
  await page.keyboard.press("Enter");
  await close(page);
  await expect(page.getByRole("button", { name: "Detalhes de Baseus Blade Power Bank", exact: true })).toBeFocused();
  // Row click targets the same item, not a purchase-level navigation.
  await rows(page).filter({ hasText: "Anker USB-C Cable" }).locator(".orders-catalog-units").click();
  await expect(page.locator(".orders-desktop-panel h2")).toHaveText("Anker USB-C Cable");
  const origin = detail(page).getByRole("button", { name: "Compra de origem de Anker USB-C Cable", exact: true });
  await origin.click();
  await expect(page.getByRole("dialog", { name: "Compra de origem", exact: true }).getByRole("link", { name: "Ver compra completa", exact: true })).toHaveAttribute("href", /item=.*returnTo=/);
  await page.keyboard.press("Escape");
  expect(page.url()).toBe(url);
  expect(writes).toBe(0);
});

for (const width of [320, 360, 390, 430, 768, 1024, 1280, 1500, 1920]) {
  test(`six real examples, focus and themes fit ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: width < 500 ? 844 : 930 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/orders?search=Seis%20exemplos");
    await expect(rows(page)).toHaveCount(6);
    for (const [index, [name, available]] of examples.entries()) {
      await open(page, name);
      await expect(detail(page).locator(".orders-item-available")).toHaveText(`${available} ${available === 1 ? "unidade" : "unidades"}`);
      const panel = width < 1200 ? page.getByRole("dialog") : page.locator(".orders-desktop-panel");
      await expect(panel.getByRole("heading", { name, exact: true })).toBeVisible();
      await expect(detail(page).getByRole("button", { name: "Editar item", exact: true })).toBeVisible();
      if (!available) await expect(detail(page).getByRole("spinbutton")).toBeDisabled();
      await expect(detail(page).getByText("Nenhuma foto QC disponível para este produto.", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await detail(page).evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      if (width < 1200) {
        await expect(panel).toHaveClass(/orders-bottom-sheet/);
        const bounds = (await panel.boundingBox())!;
        expect(Math.round(bounds.x)).toBe(0);
        expect(Math.round(bounds.y + bounds.height)).toBe(width < 500 ? 844 : 930);
        expect(await panel.evaluate(element => getComputedStyle(element).animationName)).toBe("none");
        // Last link remains reachable through internal scroll.
        await detail(page).getByRole("button", { name: `Compra de origem de ${name}`, exact: true }).scrollIntoViewIfNeeded();
        await expect(detail(page).getByRole("button", { name: `Compra de origem de ${name}`, exact: true })).toBeInViewport();
        await panel.locator(".surface-body").evaluate(element => { element.scrollTop = 0; });
      }
      if (index === 3) await page.screenshot({ path: `${evidence}/detail-light-${width}.png` });
      await close(page);
      await expect(page.getByRole("button", { name: `Detalhes de ${name}`, exact: true })).toBeFocused();
    }
    await page.getByRole("switch", { name: "Tema escuro", exact: true }).click();
    await open(page, "JBL Flip 6");
    await page.screenshot({ path: `${evidence}/detail-dark-${width}.png` });
    await close(page);
    expect(errors).toEqual([]);
  });
}

const json = (route: Route, data: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
async function mockQc(page: Page, additional = false) {
  // Transport fixtures exercise the existing renderer; no external storage or production media.
  const photo = await sharp({ create: { width: 280, height: 220, channels: 3, background: "#d6e4ee" } }).webp().toBuffer();
  let primary = "qc-detail-1", revision = 4, galleryFails = false;
  const covers: unknown[] = [];
  const target = (await (await page.request.get("/api/warehouse?search=JBL")).json()).data as WarehouseData;
  const row = target.rows[0], purchase = target.origins.find(origin => origin.trackingId === row.cost.trackingId)!;
  if (additional) {
    row.cost.purchaseItemId = null;
    row.cost.additionalOrderItemId = "qa-additional-item";
    row.order.kind = "additional";
  }
  await page.route("**/api/warehouse?**", async route => {
    const response = await route.fetch();
    const body = await response.json();
    for (const item of body.data.rows) if (item.costItemId === row.costItemId) { item.qcCount = 3; item.cost = row.cost; item.order = row.order; }
    return route.fulfill({ response, json: body });
  });
  const itemId = row.cost.purchaseItemId ? `purchase:${row.cost.purchaseItemId}` : `additional:${row.cost.additionalOrderItemId}`;
  const images = [1, 2, 3].map(index => ({ id: `qc-detail-${index}`, previewUrl: `/api/qc/images/qc-detail-${index}/preview`, previewVersion: "qa1", width: 280, height: 220, occurrence: "Ocorrência sintética JBL" }));
  const previews = images.map(image => ({ ...image, imageId: image.id }));
  await page.route("**/api/qc/images/qc-detail-*/preview", route => route.fulfill({ status: 200, contentType: "image/webp", body: photo }));
  await page.route("**/qa-detail-original-*.png", route => route.fulfill({ status: 200, contentType: "image/webp", body: photo }));
  await page.route("**/api/qc/images/qc-detail-*/source", route => json(route, { sourceUrl: `${new URL(page.url()).origin}/qa-detail-original-${route.request().url().split("/").at(-2)}.png` }));
  await page.route(`**/api/purchases/${purchase.purchaseId}/qc?**`, async route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.has("itemIds")) return json(route, { items: params.get("itemIds")!.split(",").map(id => ({ itemId: id, purchaseItemId: id.replace("purchase:", ""), qcCount: id === itemId ? 3 : 0, primaryImageId: id === itemId ? primary : null, presentationRevision: revision, canSetCover: true, coverPreview: id === itemId ? previews.find(image => image.id === primary) : null, previews: id === itemId ? previews.filter(image => image.id !== primary) : [] })) });
    expect(params.get("itemId")).toBe(itemId);
    if (galleryFails) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Galeria sintética indisponível" }) });
    return json(route, { itemId, pageOffset: 0, totalCount: 3, presentationRevision: revision, primaryImageId: primary, canSetCover: true, images, nextOffset: null });
  });
  await page.route(`**/api/purchases/${purchase.purchaseId}/qc`, route => json(route, { canManage: true, counts: [{ itemId, count: 3 }] }));
  await page.route(`**/api/purchases/${purchase.purchaseId}/items/*/qc-presentation`, route => {
    expect(decodeURIComponent(new URL(route.request().url()).pathname)).toContain(`/items/${itemId}/`);
    const body = route.request().postDataJSON();
    covers.push(body); primary = body.imageId; revision++;
    return json(route, { primaryImageId: primary, revision });
  });
  return { row, covers, fail: (value: boolean) => { galleryFails = value; } };
}

for (const width of [390, 1500]) test(`existing QC previews, zoom, cover and recovery at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 930 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const qc = await mockQc(page);
  await page.goto("/orders?search=Seis%20exemplos");
  await expect(rows(page)).toHaveCount(6);
  await open(page, "JBL Flip 6");
  await expect(detail(page).locator(".qc-gallery-preview img")).toHaveCount(3);
  await detail(page).locator(".orders-item-qc").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${evidence}/detail-qc-${width}.png` });
  await detail(page).getByRole("button", { name: "Abrir foto QC 2 de JBL Flip 6", exact: true }).click();
  const viewer = page.getByRole("dialog", { name: "QC · JBL Flip 6", exact: true });
  await expect(viewer.getByText("Foto 2 de 3", { exact: true })).toBeVisible();
  await expect(viewer.locator(".qc-viewer-photo img")).toBeVisible();
  await viewer.getByRole("button", { name: "Usar como capa QC", exact: true }).click();
  await expect(viewer.getByRole("button", { name: "Capa atual", exact: true })).toBeDisabled();
  expect(qc.covers).toEqual([{ imageId: "qc-detail-2", expectedRevision: 4 }]);
  await viewer.getByRole("button", { name: "Próxima foto", exact: true }).click();
  await expect(viewer.getByText("Foto 3 de 3", { exact: true })).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Próxima foto", exact: true })).toBeDisabled();
  if (width < 1200) {
    await expect(viewer).toHaveClass(/orders-bottom-sheet/);
    const bounds = (await viewer.boundingBox())!;
    expect(Math.round(bounds.x)).toBe(0);
    expect(Math.round(bounds.y + bounds.height)).toBe(844);
  }
  await page.screenshot({ path: `${evidence}/qc-viewer-${width}.png` });
  await expect(detail(page).locator(".qc-gallery-preview img")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(detail(page)).toHaveAttribute("data-detail-item-id", qc.row.costItemId);
  await expect(detail(page).locator('.qc-gallery-preview button[data-qc-image-id="qc-detail-2"]')).toBeFocused();
  qc.fail(true);
  await detail(page).getByRole("button", { name: "Ver fotos QC de JBL Flip 6", exact: true }).click();
  await expect(viewer.getByRole("alert")).toHaveText("Galeria sintética indisponível");
  await page.keyboard.press("Escape");
  qc.fail(false);
  await detail(page).getByRole("button", { name: "Ver fotos QC de JBL Flip 6", exact: true }).click();
  await expect(viewer.getByText("Foto 1 de 3", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await close(page);
  await open(page, "Anker USB-C Cable");
  await expect(detail(page).locator(".qc-gallery-preview img")).toHaveCount(0);
  await expect(detail(page)).not.toHaveAttribute("data-detail-item-id", qc.row.costItemId);
});

test("additional item retains its distinct QC target without reading a purchase target", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 930 });
  await mockQc(page, true);
  await page.goto("/orders?search=Seis%20exemplos");
  await expect(rows(page)).toHaveCount(6);
  await open(page, "JBL Flip 6");
  await expect(detail(page).locator(".qc-gallery-preview img")).toHaveCount(3);
  await detail(page).getByRole("button", { name: "Abrir foto QC 1 de JBL Flip 6", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "QC · JBL Flip 6", exact: true }).getByText("Foto 1 de 3", { exact: true })).toBeVisible();
});

test("filter removes current item without stale data and resizing preserves selection", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 930 });
  await page.goto("/orders?search=Seis%20exemplos");
  await expect(rows(page)).toHaveCount(6);
  await open(page, "JBL Flip 6");
  await detail(page).getByRole("button", { name: "Aumentar JBL Flip 6", exact: true }).click();
  await detail(page).getByRole("button", { name: "Aumentar JBL Flip 6", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("dialog", { name: "JBL Flip 6", exact: true })).toBeVisible();
  await expect(detail(page).getByRole("spinbutton")).toHaveValue("2");
  await close(page);
  await page.setViewportSize({ width: 1500, height: 930 });
  await open(page, "JBL Flip 6");
  await page.getByPlaceholder("Buscar produto ou pedido").fill("Anker");
  await expect(page.getByText("Item não encontrado nesta listagem", { exact: true })).toBeVisible();
  await expect(detail(page)).toHaveCount(0);
  await close(page);
  await expect(rows(page)).toHaveCount(1);
  await expect(page.locator(".orders-selection-summary")).toContainText("2 unidades selecionadas");
});

test("mobile sheet uses vertical keyframes, traps focus and backdrop returns to its trigger", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/orders?search=Seis%20exemplos");
  await expect(rows(page)).toHaveCount(6);
  await open(page, "JBL Flip 6");
  const sheet = page.getByRole("dialog", { name: "JBL Flip 6", exact: true });
  const motion = await sheet.evaluate(element => {
    const animation = element.getAnimations().find(animation => (animation as CSSAnimation).animationName === "orders-sheet-enter");
    return { name: getComputedStyle(element).animationName, frames: (animation?.effect as KeyframeEffect | null)?.getKeyframes().map(frame => frame.transform) ?? [] };
  });
  expect(motion.name).toBe("orders-sheet-enter");
  expect(motion.frames).toEqual(["translateY(100%)", "translateY(0px)"]);
  await sheet.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
  await sheet.getByRole("button", { name: "Fechar", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  expect(await sheet.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.mouse.click(8, 8);
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Detalhes de JBL Flip 6", exact: true })).toBeFocused();
});
