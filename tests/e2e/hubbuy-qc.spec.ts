import { expect, test } from "@playwright/test";
import { login } from "./helpers";

async function createFinalizedPurchase(page: import("@playwright/test").Page, name: string, secondItem = false) {
  const origin = "http://localhost:3100";
  const created = await page.request.post("/api/app", { headers: { Origin: origin }, data: { operation: "purchase.save", input: { name } } });
  expect(created.ok()).toBeTruthy();
  const purchaseData = await created.json();
  const purchaseId = (purchaseData.result as { id: string }).id;
  const personId = purchaseData.data.currentUser.id as string;
  const addItem = async (itemName: string, variant: string) => {
    const response = await page.request.post("/api/app", { headers: { Origin: origin }, data: { operation: "item.save", input: { name: itemName, url: "https://weidian.com/item.html?itemID=987654321", personId, variant, quantity: 1, unitPriceCents: 2500 } } });
    expect(response.ok()).toBeTruthy();
    return ((await response.json()).result as { id: string }).id;
  };
  const firstItemId = await addItem("QC Marker Product", "Blue / 40");
  const secondItemId = secondItem ? await addItem("QC Second Candidate", "Red / 42") : null;
  expect((await page.request.post("/api/app", { headers: { Origin: origin }, data: { operation: "purchase.finalize", id: purchaseId, input: true } })).ok()).toBeTruthy();
  const packages = (await (await page.request.get("/api/packages")).json()).data as { tracking: { id: string }; purchase: { id: string } }[];
  const tracking = packages.find(row => row.purchase.id === purchaseId)?.tracking;
  expect(tracking).toBeTruthy();
  return { purchaseId, firstItemId, secondItemId, trackingId: tracking!.id };
}

const response = (route: import("@playwright/test").Route, data: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });

test("HubBuy QC import is session-bound, manually confirmable and responsive", async ({ page }) => {
  await login(page);
  const { purchaseId, trackingId } = await createFinalizedPurchase(page, "QC HubBuy E2E");
  await page.goto(`/packages/${trackingId}`);

  const openImport = page.getByRole("button", { name: "Importar QC", exact: true });
  await expect(openImport).toBeVisible();
  await openImport.focus();
  await page.keyboard.press("Enter");
  let dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(openImport).toBeFocused();

  await openImport.click();
  dialog = page.getByRole("dialog");
  const widths = [1440, 390, 320];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  const pasted = {
    code: 0,
    data: { count: 1, list: [{ orderNo: "QC-E2E-1", goodsList: [{ orderGoodsId: "QC-GOODS-1", offerUrl: "https://weidian.com/item.html?itemID=987654321", skuInfo: "Blue / 40", goodsName: "QC Marker Product", quantity: 1, freePhotos: [] }] }] },
  };
  await dialog.getByLabel("JSON HubBuy").fill(JSON.stringify(pasted));
  await dialog.getByRole("button", { name: "Analisar JSON" }).click();
  await expect(dialog.getByText("Correspondência inequívoca")).toBeVisible();
  await dialog.getByRole("button", { name: "Confirmar vínculos" }).click();
  await expect(dialog.getByRole("status")).toContainText("1 ocorrência(s) associada(s)");
  await expect(dialog.getByRole("status")).toContainText("0 foto(s) registrada(s)");
  await expect(dialog.getByRole("button", { name: "Processar próximo lote" })).toHaveCount(0);
  expect((await page.request.get(`/api/purchases/${purchaseId}/qc`)).ok()).toBeTruthy();
});

test("HubBuy QC automatically completes four distinct photos and refreshes gallery counts", async ({ page }) => {
  await login(page);
  const purchase = await createFinalizedPurchase(page, "QC four photos E2E");
  let importedPhotos = 0, batches = 0;
  await page.route(`**/api/purchases/${purchase.purchaseId}/qc**`, async route => {
    const request = route.request();
    if (request.method() === "GET") {
      const itemId = new URL(request.url()).searchParams.get("itemId");
      return response(route, itemId ? { itemId, images: Array.from({ length: importedPhotos }, (_, index) => ({ id: `qc-photo-${index + 1}`, sourceUrl: `https://scm.hubbuy.app/qc/photo-${index + 1}.png`, width: 1, height: 1, mimeType: "image/png", occurrence: "Blue / 40" })), nextOffset: null } : { purchaseId: purchase.purchaseId, canManage: true, counts: [{ itemId: purchase.firstItemId, count: importedPhotos }], pendingMatching: 0, pendingRows: [], pendingTransfers: 4 - importedPhotos, pendingDeletes: 0 });
    }
    const body = request.postDataJSON() as { operation: string };
    if (body.operation === "prepare") return response(route, { importId: "mock-import-four", revision: 0, partial: false, orderCount: 1, photoCount: 4, rows: [{ externalKey: "QC-E2E-FOUR:id:QC-GOODS-FOUR", orderNo: "QC-E2E-FOUR", orderGoodsId: "QC-GOODS-FOUR", orderGoodsNo: null, offerId: null, skuInfo: "Blue / 40", title: "QC Marker Product", quantity: 1, photoCount: 4, match: { status: "MATCHED", targetItemId: purchase.firstItemId, candidates: [] }, existingItemId: null, conflict: null }] });
    throw new Error(`Unexpected QC operation ${body.operation}`);
  });
  await page.route("https://scm.hubbuy.app/**", route => route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8WQAAAAASUVORK5CYII=", "base64") }));
  await page.route("**/api/qc/imports/mock-import-four", async route => {
    const body = route.request().postDataJSON() as { operation: string; expectedRevision: number };
    if (body.operation === "confirm") return response(route, { importId: "mock-import-four", revision: 1, linked: 1, pendingMatching: 0, ignored: 0, sources: 4, eligibleSources: 4 });
    if (body.operation === "batch") {
      batches++;
      importedPhotos++;
      const remaining = 4 - batches;
      return response(route, { imported: 1, existing: 0, failed: 0, pending: 0, processed: 1, remaining, hasMore: remaining > 0, complete: remaining === 0, partial: remaining > 0, revision: body.expectedRevision + 1, results: [{ status: "imported" }] });
    }
    throw new Error(`Unexpected import operation ${body.operation}`);
  });
  await page.goto(`/packages/${purchase.trackingId}`);
  await page.getByRole("button", { name: /Produtos e pagamento/ }).click();
  await page.getByRole("button", { name: "Importar QC", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const pasted = { code: 0, data: { count: 1, list: [{ orderNo: "QC-E2E-FOUR", goodsList: [{ orderGoodsId: "QC-GOODS-FOUR", offerUrl: "https://weidian.com/item.html?itemID=987654321", skuInfo: "Blue / 40", goodsName: "QC Marker Product", quantity: 1, freePhotos: ["https://scm.hubbuy.app/a", "https://scm.hubbuy.app/b", "https://scm.hubbuy.app/c", "https://scm.hubbuy.app/d"] }] }] } };
  await dialog.getByLabel("JSON HubBuy").fill(JSON.stringify(pasted));
  await dialog.getByRole("button", { name: "Analisar JSON" }).click();
  await expect(dialog.getByRole("button", { name: "Confirmar vínculos" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Confirmar vínculos" }).click();
  await expect(dialog.getByRole("status")).toContainText("Importação concluída.");
  expect(batches).toBe(4);
  await dialog.getByRole("button", { name: "Fechar" }).click();
  const galleryButton = page.locator(".qc-cost-list").getByRole("button", { name: "Ver QC de QC Marker Product" });
  await expect(galleryButton).toContainText("(4)");
  await galleryButton.click();
  await expect(page.locator(".qc-gallery-card")).toHaveCount(4);
  await expect(page.locator(".qc-gallery-card img").first()).toBeVisible();
});

test("ambiguous QC occurrence requires a candidate and then transfers every photo", async ({ page }) => {
  await login(page);
  const purchase = await createFinalizedPurchase(page, "QC pending match E2E", true);
  let imports = 0, selectedItemId = "", batches = 0;
  await page.route(`**/api/purchases/${purchase.purchaseId}/qc**`, async route => {
    const request = route.request();
    if (request.method() === "GET") {
      const itemId = new URL(request.url()).searchParams.get("itemId");
      return response(route, itemId ? { itemId, images: Array.from({ length: imports }, (_, index) => ({ id: `qc-pending-photo-${index + 1}`, sourceUrl: `https://scm.hubbuy.app/qc/pending-photo-${index + 1}.png`, width: 1, height: 1, mimeType: "image/png", occurrence: "Navy / L" })), nextOffset: null } : { purchaseId: purchase.purchaseId, canManage: true, counts: [{ itemId: purchase.secondItemId, count: imports }], pendingMatching: selectedItemId ? 0 : 1, pendingRows: selectedItemId ? [] : [{ externalItemId: "qc-ambiguous", revision: 0, orderNo: "QC-PENDING", orderGoodsId: "QC-GOODS-PENDING", orderGoodsNo: null, skuInfo: "Navy / L", title: "QC Marker Product", quantity: 1, photoCount: 4, candidates: [{ itemId: purchase.firstItemId, name: "QC Marker Product", reasons: ["Mesmo anúncio"] }, { itemId: purchase.secondItemId, name: "QC Second Candidate", reasons: ["Mesmo anúncio"] }] }], pendingTransfers: selectedItemId ? 4 - imports : 0, pendingDeletes: 0 });
    }
    const body = request.postDataJSON() as { operation: string; purchaseItemId?: string; externalItemId?: string };
    if (body.operation === "resolve") { selectedItemId = body.purchaseItemId ?? ""; return response(route, { externalItemId: body.externalItemId, purchaseItemId: selectedItemId, revision: 1, pendingSources: 4 }); }
    if (body.operation === "batch" && body.externalItemId === "qc-ambiguous") { batches++; imports++; const remaining = 4 - batches; return response(route, { imported: 1, existing: 0, failed: 0, pending: 0, processed: 1, remaining, hasMore: remaining > 0, complete: remaining === 0, partial: false, results: [{ status: "imported" }] }); }
    throw new Error(`Unexpected QC operation ${body.operation}`);
  });
  await page.goto(`/packages/${purchase.trackingId}`);
  await page.route("https://scm.hubbuy.app/**", route => route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8WQAAAAASUVORK5CYII=", "base64") }));
  await page.getByRole("button", { name: /Produtos e pagamento/ }).click();
  await page.getByRole("button", { name: /Verificar vínculos pendentes/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("QC Marker Product", { exact: true })).toBeVisible();
  const select = dialog.getByLabel("Produto Loti para QC Marker Product");
  await select.selectOption(purchase.secondItemId!);
  await dialog.getByRole("button", { name: "Associar e processar fotos" }).click();
  await expect(dialog.getByRole("status")).toContainText("Transferência concluída.");
  expect(selectedItemId).toBe(purchase.secondItemId);
  expect(batches).toBe(4);
  await dialog.getByRole("button", { name: "Fechar" }).click();
  const galleryButton = page.locator(".qc-cost-list").getByRole("button", { name: "Ver QC de QC Second Candidate" });
  await expect(galleryButton).toContainText("(4)");
  await galleryButton.click();
  await expect(page.locator(".qc-gallery-card")).toHaveCount(4);
});

test("QC transfer interruption stays partial, surfaces the error and refreshes completed photo counts", async ({ page }) => {
  await login(page);
  const purchase = await createFinalizedPurchase(page, "QC partial transfer E2E");
  let importedPhotos = 0, batches = 0;
  await page.route(`**/api/purchases/${purchase.purchaseId}/qc**`, async route => {
    const request = route.request();
    if (request.method() === "GET") return response(route, { purchaseId: purchase.purchaseId, canManage: true, counts: [{ itemId: purchase.firstItemId, count: importedPhotos }], pendingMatching: 0, pendingRows: [], pendingTransfers: 4 - importedPhotos, pendingDeletes: 0 });
    const body = request.postDataJSON() as { operation: string };
    if (body.operation === "prepare") return response(route, { importId: "mock-import-interrupted", revision: 0, partial: false, orderCount: 1, photoCount: 4, rows: [{ externalKey: "QC-E2E-INTERRUPTED:id:QC-GOODS-INTERRUPTED", orderNo: "QC-E2E-INTERRUPTED", orderGoodsId: "QC-GOODS-INTERRUPTED", orderGoodsNo: null, offerId: null, skuInfo: "Blue / 40", title: "QC Marker Product", quantity: 1, photoCount: 4, match: { status: "MATCHED", targetItemId: purchase.firstItemId, candidates: [] }, existingItemId: null, conflict: null }] });
    throw new Error(`Unexpected QC operation ${body.operation}`);
  });
  await page.route("**/api/qc/imports/mock-import-interrupted", async route => {
    const body = route.request().postDataJSON() as { operation: string; expectedRevision: number };
    if (body.operation === "confirm") return response(route, { importId: "mock-import-interrupted", revision: 1, linked: 1, pendingMatching: 0, ignored: 0, sources: 4, eligibleSources: 4 });
    if (body.operation === "batch") {
      batches++;
      if (batches === 2) return route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "Limite QC atingido. Tente novamente mais tarde." }) });
      importedPhotos++;
      return response(route, { imported: 1, existing: 0, failed: 0, pending: 0, processed: 1, remaining: 3, hasMore: true, complete: false, partial: true, revision: body.expectedRevision + 1, results: [{ status: "imported" }] });
    }
    throw new Error(`Unexpected import operation ${body.operation}`);
  });
  await page.goto(`/packages/${purchase.trackingId}`);
  await page.getByRole("button", { name: /Produtos e pagamento/ }).click();
  await page.getByRole("button", { name: "Importar QC", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const pasted = { code: 0, data: { count: 1, list: [{ orderNo: "QC-E2E-INTERRUPTED", goodsList: [{ orderGoodsId: "QC-GOODS-INTERRUPTED", offerUrl: "https://weidian.com/item.html?itemID=987654321", skuInfo: "Blue / 40", goodsName: "QC Marker Product", quantity: 1, freePhotos: ["https://scm.hubbuy.app/a", "https://scm.hubbuy.app/b", "https://scm.hubbuy.app/c", "https://scm.hubbuy.app/d"] }] }] } };
  await dialog.getByLabel("JSON HubBuy").fill(JSON.stringify(pasted));
  await dialog.getByRole("button", { name: "Analisar JSON" }).click();
  await dialog.getByRole("button", { name: "Confirmar vínculos" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Limite QC atingido");
  expect(batches).toBe(2);
  await expect(dialog.getByRole("button", { name: "Continuar / tentar novamente" })).toBeEnabled();
  await expect(dialog.getByRole("status")).not.toContainText("Importação concluída.");
  await dialog.getByRole("button", { name: "Fechar" }).click();
  await expect(page.locator(".qc-cost-list").getByRole("button", { name: "Ver QC de QC Marker Product" })).toContainText("(1)");
});
