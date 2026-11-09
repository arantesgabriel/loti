import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import type { WarehouseData } from "@/components/orders/orders-screen";
import type { CostTrackingView } from "@/lib/domain/package-cost-reading";

const evidence = "artifacts/qa/orders-phase56";
let auth: Awaited<ReturnType<BrowserContext["storageState"]>>;
test.beforeAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  expect((await context.request.post(`${baseURL}/api/auth/sign-in/email`, { headers: { Origin: baseURL! }, data: { email: "pessoa-a@loti.test", password: "Loti-Orders-QA-Only-2026!" } })).ok()).toBe(true);
  auth = await context.storageState(); await context.close();
});
test.beforeEach(async ({ context }) => { await context.addCookies(auth.cookies); });
const goods = (id: number, name: string, variant: string) => ({ orderGoodsId: `f56-goods-${id}`, orderNo: `f56-order-${id}`, offerUrl: `https://weidian.com/item.html?itemID=${id}`, skuInfo: variant, quantity: 3, goodsName: name, freePhotos: [`https://scm.hubbuy.app/qc/f56-${id}.png`] });
const json = { code: 0, data: { count: 3, list: [goods(56001, "F56 Cabo azul", "Blue"), goods(56002, "F56 Carregador branco", "White"), goods(99999, "Item inexistente", "None")].map(row => ({ orderNo: row.orderNo, goodsList: [row] })) } };
async function item(page: Page, name: string) { await page.goto(`/orders?search=${encodeURIComponent(name)}`); await page.getByRole("button", { name: `Detalhes de ${name}`, exact: true }).click(); }
async function row(page: Page, search: string) { return ((await (await page.request.get(`/api/warehouse?search=${encodeURIComponent(search)}`)).json()).data as WarehouseData).rows[0]; }

for (const [width, height] of [[320,700],[360,800],[390,844],[430,932],[768,1024],[1024,768],[1280,800],[1500,930],[1920,1080]]) test(`QC preview, origin and financial forms fit ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height }); await page.emulateMedia({ reducedMotion: "reduce" }); await page.goto("/orders?search=F56");
  const trigger = page.getByRole("button", { name: "Importar fotos QC via JSON", exact: true }); await trigger.click();
  const qc = page.getByRole("dialog", { name: "Importar fotos de QC", exact: true });
  await qc.getByLabel("JSON HubBuy").fill("{invalid"); await qc.getByRole("button", { name: "Continuar", exact: true }).click(); await expect(qc.getByRole("alert")).toContainText("JSON válido");
  await qc.locator('input[type="file"]').setInputFiles({ name: "qc-f56.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(json)) });
  await qc.getByRole("button", { name: "Continuar", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "Revisar importação", exact: true });
  await expect(preview.getByRole("status")).toContainText("2 ocorrências selecionadas"); await expect(preview).toContainText("1 ignoradas");
  expect(await preview.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  if (width < 1200) { const box = (await preview.boundingBox())!; expect(Math.round(box.x)).toBe(0); expect(Math.round(box.y + box.height)).toBe(height); await expect(preview).toHaveClass(/orders-bottom-sheet/); }
  await page.screenshot({ path: `${evidence}/qc-preview-light-${width}.png` }); await page.keyboard.press("Escape"); await expect(preview).toHaveCount(0); await expect(trigger).toBeFocused();
  await item(page, "F56 Cabo azul");
  const origin = page.getByRole("button", { name: "Compra de origem de F56 Cabo azul", exact: true }); await origin.click();
  const summary = page.getByRole("dialog", { name: "Compra de origem", exact: true }); await expect(summary).toContainText("F56 Compra 1"); await expect(summary.getByRole("link", { name: "Ver compra completa", exact: true })).toHaveAttribute("href", /item=.*returnTo=/);
  await page.screenshot({ path: `${evidence}/origin-light-${width}.png` }); await page.keyboard.press("Escape"); await expect(origin).toBeFocused();
  await page.getByRole("button", { name: "Editar item", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Custos do produto", exact: true }); await expect(edit).toContainText("permanecem no histórico");
  expect(await edit.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  if (width < 1200) await expect(edit).toHaveClass(/orders-bottom-sheet/);
  await page.screenshot({ path: `${evidence}/edit-light-${width}.png` }); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Registrar reembolso", exact: true }).click();
  const refund = page.getByRole("dialog", { name: "Registrar reembolso", exact: true }); await expect(refund.getByRole("spinbutton", { name: "Unidades sem pacote a cancelar", exact: true })).toHaveAttribute("max", "3");
  expect(await refund.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  if (width < 1200) await expect(refund).toHaveClass(/orders-bottom-sheet/);
  await page.screenshot({ path: `${evidence}/refund-light-${width}.png` }); await page.keyboard.press("Escape");
  // Theme switch lives in the shared shell, behind the detail sheet on mobile.
  await page.keyboard.press("Escape"); await page.getByRole("switch", { name: "Tema escuro", exact: true }).click(); await trigger.click();
  await page.screenshot({ path: `${evidence}/qc-dark-${width}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("one global confirmation runs per-purchase manifests and recovers a lost confirm response", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 930 });
  const batches = new Set<string>(), lost = new Set<string>();
  await page.route("**/api/qc/imports/*", async route => {
    const url = new URL(route.request().url()), id = url.pathname.split("/").at(-1)!;
    if (route.request().method() === "GET") {
      const response = await route.fetch(); const body = await response.json();
      if (batches.has(id)) { body.data.nextSourceId = null; body.data.photos = body.data.photos.map((photo: object) => ({ ...photo, state: "ready", errorCode: null })); }
      return route.fulfill({ response, json: body });
    }
    const command = route.request().postDataJSON();
    if (command.operation === "batch") { batches.add(id); return route.fulfill({ json: { data: { processed: 1, failed: 0, remaining: 0 } } }); }
    if (command.operation === "confirm" && !lost.has(id)) { lost.add(id); const response = await route.fetch(); expect(response.ok()).toBe(true); return route.abort(); }
    return route.continue();
  });
  await page.goto("/orders"); await page.getByRole("button", { name: "Importar fotos QC via JSON", exact: true }).click();
  await page.getByLabel("JSON HubBuy").fill(JSON.stringify(json)); await page.getByRole("dialog").getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Importar fotos", exact: true }).click();
  const result = page.getByRole("dialog", { name: "QC importado", exact: true }); await expect(result).toContainText("F56 Compra 1"); await expect(result).toContainText("F56 Compra 2"); expect(batches.size).toBe(2); expect(lost.size).toBe(2);
  await page.screenshot({ path: `${evidence}/qc-result-desktop.png` });
});

test("paid item cost changes require confirmation and preserve the draft when returning", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: "reduce" }); await item(page, "F56 Cabo azul"); const selected = await row(page, "F56 Cabo azul");
  await page.getByRole("button", { name: "Editar item", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Custos do produto", exact: true });
  await edit.locator('input[inputmode="decimal"]').first().fill("11,00");
  await page.route(`**/api/packages/${selected.cost.trackingId}`, route => route.request().method() === "POST" ? route.fulfill({ status: 503, json: { error: "Falha sintética recuperável" } }) : route.continue());
  await edit.getByRole("button", { name: "Salvar custos", exact: true }).click(); await expect(edit.getByRole("alert")).toContainText("Falha sintética recuperável"); await expect(edit.locator('input[inputmode="decimal"]').first()).toHaveValue("11,00");
  await page.unroute(`**/api/packages/${selected.cost.trackingId}`);
  await edit.getByRole("button", { name: "Salvar custos", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Confirmar alteração dos custos", exact: true }); await expect(confirm).toBeVisible(); await confirm.getByRole("button", { name: "Voltar", exact: true }).click();
  await expect(edit.locator('input[inputmode="decimal"]').first()).toHaveValue("11,00");
  await edit.getByRole("button", { name: "Salvar custos", exact: true }).click(); await confirm.getByRole("button", { name: "Confirmar alteração", exact: true }).click(); await expect(confirm).toHaveCount(0);
  const result = (await (await page.request.get(`/api/packages/${selected.cost.trackingId}`)).json()).data as CostTrackingView;
  expect(result.items[0].effectivePriceUnitCents).toBe(1100); expect(result.items[0].original.originalUnitPriceCents).toBe(1000); expect(result.productsCharge?.paymentStatus).toBe("pending");
});

test("item refund request and confirmed receipt preserve physical cancellation and original fee", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: "reduce" }); await item(page, "F56 Carregador branco"); const selected = await row(page, "F56 Carregador branco");
  const url = `/api/packages/${selected.cost.trackingId}`;
  const before = (await (await page.request.get(url)).json()).data as CostTrackingView;
  await page.getByRole("button", { name: "Registrar reembolso", exact: true }).click(); const refund = page.getByRole("dialog", { name: "Registrar reembolso", exact: true });
  await refund.getByRole("spinbutton", { name: "Unidades sem pacote a cancelar", exact: true }).fill("1"); await refund.getByRole("textbox", { name: "Motivo", exact: true }).fill("Cancelamento sintético solicitado F6");
  await refund.getByRole("button", { name: "Registrar solicitação", exact: true }).click(); await expect(refund).toHaveCount(0);
  const requested = (await (await page.request.get(url)).json()).data as CostTrackingView; expect(requested.refunds[0].status).toBe("requested"); expect(requested.refundsSummary.receivedCents).toBe(0); expect(requested.productsCharge).toEqual(before.productsCharge);
  await page.getByRole("button", { name: "Ver reembolsos · 1", exact: true }).click(); await page.getByRole("dialog", { name: "Reembolsos do item", exact: true }).getByRole("button", { name: "Registrar recebimento", exact: true }).click();
  const receipt = page.getByRole("dialog", { name: "Registrar recebimento", exact: true }); await expect(receipt).toHaveClass(/orders-bottom-sheet/);
  await page.screenshot({ path: `${evidence}/refund-receipt-mobile.png` }); await receipt.getByRole("button", { name: "Registrar recebimento", exact: true }).click(); await expect(receipt).toHaveCount(0);
  const received = (await (await page.request.get(url)).json()).data as CostTrackingView; expect(received.refunds[0].status).toBe("received"); expect(received.refundsSummary.receivedCents).toBe(1000); expect(received.productsCharge).toEqual(before.productsCharge); expect(received.items[0].original.quantity).toBe(3);
  expect((await row(page, "F56 Carregador branco")).cancelledUnits).toHaveLength(1);
});

test("additional item correction previews without writing and returns to the replacement item", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 930 }); await item(page, "F56 Adicional verde"); const selected = await row(page, "F56 Adicional verde");
  const url = `/api/packages/${selected.cost.trackingId}`, before = (await (await page.request.get(url)).json()).data as CostTrackingView;
  await page.getByRole("button", { name: "Editar item", exact: true }).click(); const edit = page.getByRole("dialog", { name: "Custos do produto", exact: true });
  await edit.getByRole("textbox", { name: "Produto", exact: true }).fill("F56 Adicional verde corrigido");
  await edit.getByRole("textbox", { name: "Motivo da correção", exact: true }).fill("Correção sintética de identificação"); await edit.getByRole("checkbox", { name: /Confirmo que estou corrigindo/ }).check();
  await edit.getByRole("button", { name: "Conferir correção", exact: true }).click(); await expect(edit.getByRole("status")).toBeVisible();
  expect(((await (await page.request.get(url)).json()).data as CostTrackingView).tracking.revision).toBe(before.tracking.revision);
  await page.screenshot({ path: `${evidence}/additional-preview-desktop.png` });
  await edit.getByRole("button", { name: "Confirmar correção", exact: true }).click(); await expect(edit).toHaveCount(0); await expect(page.locator(".orders-desktop-panel h2")).toHaveText("F56 Adicional verde corrigido");
  const after = (await (await page.request.get(url)).json()).data as CostTrackingView; expect(after.orderCorrections).toHaveLength(1); expect(after.productsCharge).toEqual(before.productsCharge);
});
