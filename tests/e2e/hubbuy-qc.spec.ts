import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { login } from "./helpers";
import type { QcTransferSnapshot } from "@/components/qc/qc-import-progress";

async function createFinalizedPurchase(page: import("@playwright/test").Page, name: string, secondItem = false) {
  const origin = test.info().project.use.baseURL ?? "http://localhost:3100";
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
async function ensureProductsOpen(page: import("@playwright/test").Page) {
  const toggle = page.getByRole("button", { name: /Produtos e custos/ });
  await expect(toggle).toBeVisible();
  if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
  await expect(page.locator(".cost-table-wrap")).toBeVisible();
}
const transferSnapshot = (completed: number, revision = 1): QcTransferSnapshot => ({
  importId: "manual-selected", purchaseId: "synthetic-purchase", revision, status: "confirmed", expiresAt: null, bytesReserved: 0, bytesConsumed: 0,
  nextSourceId: completed < 4 ? `source-${completed + 1}` : null,
  rows: [{ externalKey: "manual", skuInfo: null, title: "Synthetic jersey from another listing", photoCount: 4, match: { status: "MATCHED", targetItemId: "synthetic-target", candidates: [] }, conflict: null }],
  photos: Array.from({ length: 4 }, (_, index) => ({ id: `photo-${index + 1}`, sourceId: `source-${index + 1}`, name: `IMG_00${index + 1}.jpg`, occurrence: "QC Marker Product", state: index < completed ? "ready" : "pending", errorCode: null, byteSize: null, imageId: null, previewUrl: null })),
});

test("QC preview offers only products without photos and explains when nothing new remains", async ({ page }) => {
  await login(page);
  const purchase = await createFinalizedPurchase(page, "QC new photos only", true);
  const emptyTarget = `purchase:${purchase.secondItemId}`;
  let emptyPreview = false;
  await page.route(`**/api/purchases/${purchase.purchaseId}/qc**`, route => {
    if (route.request().method() === "GET") return response(route, { canManage: true, counts: [{ itemId: `purchase:${purchase.firstItemId}`, count: 4 }], pendingRows: [] });
    return response(route, {
      importId: "new-photos-only", revision: 0, partial: false, orderCount: emptyPreview ? 0 : 1, photoCount: emptyPreview ? 0 : 4,
      skippedOccurrenceCount: emptyPreview ? 3 : 2, eligibleTargetKeys: [emptyTarget],
      rows: emptyPreview ? [] : [{ externalKey: "new", orderNo: null, orderGoodsId: "NEW-QC", orderGoodsNo: null, offerId: null, skuInfo: null, title: "New QC occurrence", quantity: 1, photoCount: 4, match: { status: "IGNORED", targetItemId: null, candidates: [] }, existingItemId: null, conflict: null }],
    });
  });
  await page.goto(`/packages/${purchase.trackingId}`);
  await page.getByRole("button", { name: "Importar QC", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const entryScreenshots = join(process.cwd(), "artifacts", "qa", "qc-drawer-compact");
  mkdirSync(entryScreenshots, { recursive: true });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const entry = await dialog.evaluate(element => {
      const input = element.querySelector("textarea")!.getBoundingClientRect();
      const main = element.querySelector(".qc-import-input-main")!.getBoundingClientRect();
      const footer = element.querySelector("footer")!.getBoundingClientRect();
      return { width: element.clientWidth, scroll: element.scrollWidth, unused: main.bottom - input.bottom, height: input.height, footer: footer.bottom, viewport: innerHeight };
    });
    expect(entry.scroll).toBeLessThanOrEqual(entry.width);
    expect(entry.unused).toBeLessThanOrEqual(8);
    expect(entry.height).toBeGreaterThan(160);
    expect(entry.footer).toBeLessThanOrEqual(entry.viewport);
    await page.screenshot({ path: join(entryScreenshots, `entry-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await dialog.getByLabel("JSON HubBuy").fill('{"code":0}');
  await dialog.getByRole("button", { name: "Analisar JSON" }).click();
  await expect(dialog.locator(".qc-occurrence-card")).toHaveCount(1);
  await expect(dialog.locator(".qc-import-summary")).toHaveAttribute("aria-label", "1 pedido(s), 1 ocorrência(s), 4 foto(s)");
  const select = dialog.getByRole("combobox", { name: "Associar New QC occurrence" });
  await expect(select.locator("option")).toHaveCount(2);
  await expect(select.locator("option").filter({ hasText: "QC Marker Product" })).toHaveCount(0);
  await expect(select.locator("option").filter({ hasText: "QC Second Candidate" })).toHaveCount(1);
  await select.selectOption(emptyTarget);
  await expect(dialog.getByText(/2 ocorrência\(s\) com QC já vinculado ou sem fotos/)).toBeVisible();
  const screenshots = join(process.cwd(), "artifacts", "qa", "qc-new-only");
  mkdirSync(screenshots, { recursive: true });
  await page.screenshot({ path: join(screenshots, "preview-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(select).toBeVisible();
  await page.screenshot({ path: join(screenshots, "preview-mobile.png") });
  await dialog.getByRole("button", { name: "Voltar", exact: true }).click();
  emptyPreview = true;
  await dialog.getByRole("button", { name: "Analisar JSON" }).click();
  await expect(dialog.getByText("Nenhum QC novo para vincular neste JSON.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Confirmar vínculos" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  // Exercise the real parser/service for an empty-photo response as well.
  await page.unroute(`**/api/purchases/${purchase.purchaseId}/qc**`);
  await page.getByRole("button", { name: "Importar QC", exact: true }).click();
  await dialog.getByLabel("JSON HubBuy").fill(JSON.stringify({ code: 0, data: { list: [{ orderNo: "EMPTY-ORDER", goodsList: [{ orderGoodsId: "EMPTY-PHOTOS", title: "Produto sem fotos", freePhotos: [] }] }] } }));
  await dialog.getByRole("button", { name: "Analisar JSON" }).click();
  await expect(dialog.getByText("Nenhum QC novo para vincular neste JSON.")).toBeVisible();
  await expect(dialog.getByRole("combobox")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Confirmar vínculos" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Concluir", exact: true }).click();
});

test("QC transfer shows only ten photos selected from three products in a larger JSON", async ({ page }) => {
  await login(page);
  const purchase = await createFinalizedPurchase(page, "QC only ten selected photos");
  let completed = 0;
  const snapshot = (): QcTransferSnapshot => ({
    importId: "ten-selected", purchaseId: purchase.purchaseId, revision: 1 + completed / 5, status: "confirmed", expiresAt: null, bytesReserved: 0, bytesConsumed: 0,
    rows: [], nextSourceId: completed < 10 ? `selected-source-${completed}` : null,
    photos: Array.from({ length: 10 }, (_, index) => ({ id: `selected-${index}`, sourceId: `selected-source-${index}`, name: `selected-${index}.png`, occurrence: `Selected product ${Math.min(2, Math.floor(index / 3)) + 1}`, state: index < completed ? "ready" : "pending", errorCode: null, byteSize: null, imageId: null, previewUrl: null })),
  });
  await page.route(`**/api/purchases/${purchase.purchaseId}/qc**`, route => {
    if (route.request().method() === "GET") return response(route, { canManage: true, counts: [], pendingRows: [] });
    return response(route, { importId: "ten-selected", revision: 0, partial: false, orderCount: 1, photoCount: 77, rows: [
      ...[3, 3, 4].map((photoCount, index) => ({ externalKey: `selected-${index}`, title: `Selected product ${index + 1}`, quantity: 1, photoCount, match: { status: "IGNORED", targetItemId: null, candidates: [] }, existingItemId: null, conflict: null })),
      { externalKey: "ignored", title: "Other occurrences", quantity: 1, photoCount: 67, match: { status: "IGNORED", targetItemId: null, candidates: [] }, existingItemId: null, conflict: null },
    ] });
  });
  await page.route("**/api/qc/imports/ten-selected", route => {
    if (route.request().method() === "GET") return response(route, snapshot());
    const body = route.request().postDataJSON();
    if (body.operation === "confirm") {
      expect(body.choices.filter((choice: { targetKey: string | null }) => choice.targetKey)).toHaveLength(3);
      return response(route, { revision: 1, linked: 3, ignored: 1, pendingMatching: 0, sources: 10, eligibleSources: 10 });
    }
    completed += 5;
    return response(route, { revision: 1 + completed / 5, processed: 5, imported: 5, existing: 0, failed: 0, pending: 0, remaining: 10 - completed, complete: completed === 10, snapshot: snapshot(), results: Array.from({ length: 5 }, (_, index) => ({ sourceId: `selected-source-${completed - 5 + index}`, status: "imported" })) });
  });
  await page.goto(`/packages/${purchase.trackingId}`);
  await page.getByRole("button", { name: "Importar QC", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("JSON HubBuy").fill('{"code":0}');
  await dialog.getByRole("button", { name: "Analisar JSON" }).click();
  for (let index = 0; index < 3; index++) {
    const card = dialog.locator(".qc-occurrence-card").nth(index);
    if (await card.locator("summary").getAttribute("aria-expanded") !== "true") await card.locator("summary").click();
    await card.getByRole("combobox").selectOption(`purchase:${purchase.firstItemId}`);
  }
  await dialog.getByRole("button", { name: "Confirmar vínculos" }).click();
  await expect(dialog.getByRole("status")).toContainText("Importação concluída");
  await expect(dialog.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "10");
  await expect(dialog.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "10");
  await expect(dialog.locator(".qc-transfer-row")).toHaveCount(10);
  await expect(dialog.getByText("Já existente", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("Other occurrences", { exact: true })).toHaveCount(0);
  const screenshots = join(process.cwd(), "artifacts", "qa", "qc-selected-transfer");
  mkdirSync(screenshots, { recursive: true });
  await page.screenshot({ path: join(screenshots, "ten-photos-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "10");
  await page.screenshot({ path: join(screenshots, "ten-photos-mobile.png") });
  await dialog.getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(dialog).not.toBeVisible();
});

test("QC import automatically drains more than twelve batches and resumes after a structured rate limit", async ({ page }) => {
  test.setTimeout(90000);
  await login(page);
  const purchase = await createFinalizedPurchase(page, "QC 92 photos automatic drain E2E");
  const total = 92;
  let transferred = 0, successfulBatches = 0, batchRequests = 0, snapshotGets = 0, manifestRevision = 1;
  const snapshot = (): QcTransferSnapshot => ({
    importId: "auto-drain-92", purchaseId: purchase.purchaseId, revision: manifestRevision, status: "confirmed", expiresAt: null, bytesReserved: 0, bytesConsumed: 0,
    nextSourceId: transferred < total ? `source-${transferred + 1}` : null,
    rows: [{ externalKey: "auto-drain", skuInfo: "Blue / 40", title: "QC Marker Product", photoCount: total, match: { status: "MATCHED", targetItemId: purchase.firstItemId, candidates: [] }, conflict: null }],
    photos: Array.from({ length: total }, (_, index) => ({ id: `photo-${index + 1}`, sourceId: `source-${index + 1}`, name: `IMG_${index + 1}.jpg`, occurrence: "QC Marker Product", state: index < transferred ? "ready" : "pending", errorCode: null, byteSize: null, imageId: null, previewUrl: null })),
  });
  await page.route(`**/api/purchases/${purchase.purchaseId}/qc**`, async route => {
    if (route.request().method() === "GET") return response(route, { canManage: true, counts: [], pendingRows: [], pendingMatching: 0, pendingTransfers: total - transferred, pendingDeletes: 0, pendingPreviews: 0 });
    const body = route.request().postDataJSON() as { operation: string };
    if (body.operation === "prepare") return response(route, { importId: "auto-drain-92", revision: 0, partial: false, orderCount: 1, photoCount: total, rows: [{ externalKey: "auto-drain", orderNo: "QC-92", orderGoodsId: "QC-92-GOODS", orderGoodsNo: null, offerId: null, skuInfo: "Blue / 40", title: "QC Marker Product", quantity: 1, photoCount: total, match: { status: "MATCHED", targetItemId: purchase.firstItemId, candidates: [] }, existingItemId: null, conflict: null }] });
    throw new Error(`Unexpected QC operation ${body.operation}`);
  });
  await page.route("**/api/qc/imports/auto-drain-92", async route => {
    if (route.request().method() === "GET") { snapshotGets++; return response(route, snapshot()); }
    const body = route.request().postDataJSON() as { operation: string; expectedRevision: number };
    if (body.operation === "confirm") return response(route, { importId: "auto-drain-92", revision: 1, linked: 1, ignored: 0, pendingMatching: 0, sources: total, eligibleSources: total });
    if (body.operation !== "batch") throw new Error(`Unexpected import operation ${body.operation}`);
    batchRequests++;
    if (batchRequests === 2) return route.fulfill({ status: 429, headers: { "Retry-After": "1" }, contentType: "application/json", body: JSON.stringify({ error: "Limite QC atingido. Tente novamente em 1 s.", code: "QC_RATE_LIMIT", retryAfterSeconds: 1 }) });
    const count = Math.min(5, total - transferred);
    const first = transferred + 1;
    transferred += count; successfulBatches++;
    manifestRevision = body.expectedRevision + 1;
    return response(route, { imported: count, existing: 0, failed: 0, pending: 0, processed: count, remaining: total - transferred, complete: transferred === total, hasMore: transferred < total, revision: manifestRevision, results: Array.from({ length: count }, (_, index) => ({ sourceId: `source-${first + index}`, status: "imported" })), snapshot: snapshot() });
  });
  await page.goto(`/packages/${purchase.trackingId}`);
  await page.getByRole("button", { name: "Importar QC", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const pasted = { code: 0, data: { count: 1, list: [{ orderNo: "QC-92", goodsList: [{ orderGoodsId: "QC-92-GOODS", offerUrl: "https://weidian.com/item.html?itemID=987654321", skuInfo: "Blue / 40", goodsName: "QC Marker Product", quantity: 1, freePhotos: Array.from({ length: total }, (_, index) => `https://scm.hubbuy.app/qc/92-${index + 1}.jpg`) }] }] } };
  await dialog.getByLabel("JSON HubBuy").fill(JSON.stringify(pasted));
  await dialog.getByRole("button", { name: "Analisar JSON" }).click();
  await dialog.getByRole("button", { name: "Confirmar vínculos" }).click();
  await expect(dialog.getByRole("status")).toContainText("Importação concluída", { timeout: 30000 });
  await expect(dialog.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "92");
  await expect(dialog.getByRole("button", { name: "Concluir", exact: true })).toBeEnabled();
  expect(successfulBatches).toBe(19);
  expect(batchRequests).toBe(20);
  expect(snapshotGets).toBe(1);
});

test("QC automatic drain pauses when a successful response repeats the persisted snapshot", async ({ page }) => {
  await login(page);
  const purchase = await createFinalizedPurchase(page, "QC repeated snapshot guard");
  let batchRequests = 0;
  const snapshot: QcTransferSnapshot = {
    importId: "repeated-snapshot", purchaseId: purchase.purchaseId, revision: 1, status: "confirmed", expiresAt: null, bytesReserved: 0, bytesConsumed: 0,
    nextSourceId: "source-1",
    rows: [{ externalKey: "repeat", skuInfo: null, title: "Repeated snapshot item", photoCount: 1, match: { status: "MATCHED", targetItemId: purchase.firstItemId, candidates: [] }, conflict: null }],
    photos: [{ id: "photo-1", sourceId: "source-1", name: "IMG_1.jpg", occurrence: "Repeated snapshot item", state: "pending", errorCode: null, byteSize: null, imageId: null, previewUrl: null }],
  };
  await page.route(`**/api/purchases/${purchase.purchaseId}/qc**`, async route => {
    if (route.request().method() === "GET") return response(route, { canManage: true, counts: [], pendingRows: [], pendingMatching: 0, pendingTransfers: 1, pendingDeletes: 0, pendingPreviews: 0 });
    const body = route.request().postDataJSON() as { operation: string };
    if (body.operation === "prepare") return response(route, { importId: "repeated-snapshot", revision: 0, partial: false, orderCount: 1, photoCount: 1, rows: [{ externalKey: "repeat", orderNo: "QC-REPEAT", orderGoodsId: "QC-REPEAT-GOODS", orderGoodsNo: null, offerId: null, skuInfo: null, title: "Repeated snapshot item", quantity: 1, photoCount: 1, match: { status: "MATCHED", targetItemId: purchase.firstItemId, candidates: [] }, existingItemId: null, conflict: null }] });
    throw new Error(`Unexpected QC operation ${body.operation}`);
  });
  await page.route("**/api/qc/imports/repeated-snapshot", async route => {
    if (route.request().method() === "GET") return response(route, snapshot);
    const body = route.request().postDataJSON() as { operation: string };
    if (body.operation === "confirm") return response(route, { importId: "repeated-snapshot", revision: 1, linked: 1, ignored: 0, pendingMatching: 0, sources: 1, eligibleSources: 1 });
    if (body.operation !== "batch") throw new Error(`Unexpected import operation ${body.operation}`);
    batchRequests++;
    return response(route, { imported: 1, existing: 0, failed: 0, pending: 0, processed: 1, remaining: 1, complete: false, hasMore: true, revision: 1, results: [{ sourceId: "source-1", status: "imported" }], snapshot });
  });
  await page.goto(`/packages/${purchase.trackingId}`);
  await page.getByRole("button", { name: "Importar QC", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const pasted = { code: 0, data: { list: [{ orderNo: "QC-REPEAT", goodsList: [{ orderGoodsId: "QC-REPEAT-GOODS", offerUrl: "https://weidian.com/item.html?itemID=987654321", goodsName: "Repeated snapshot item", quantity: 1, freePhotos: ["https://scm.hubbuy.app/qc/repeat.jpg"] }] }] } };
  await dialog.getByLabel("JSON HubBuy").fill(JSON.stringify(pasted));
  await dialog.getByRole("button", { name: "Analisar JSON" }).click();
  await dialog.getByRole("button", { name: "Confirmar vínculos" }).click();
  await expect(dialog.getByRole("alert")).toContainText("O estado QC não avançou neste lote.");
  expect(batchRequests).toBe(1);
});

async function mockQcMedia(page: import("@playwright/test").Page) {
  const artwork = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320"><rect width="480" height="320" rx="28" fill="#f5f2ee"/><rect x="28" y="28" width="424" height="264" rx="24" fill="#dce8f7"/><circle cx="370" cy="104" r="54" fill="#f77014"/><path d="M110 218h220l-28-92H138z" fill="#fff" stroke="#1c0113" stroke-width="8" stroke-linejoin="round"/><path d="M160 218v-52h112v52" fill="#f7bd81" stroke="#1c0113" stroke-width="8"/><text x="240" y="270" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" fill="#1c0113">QC SAMPLE · BLUE 40</text></svg>');
  const [preview, original] = await Promise.all([
    sharp(artwork).resize({ width: 160, height: 160, fit: "inside", withoutEnlargement: true }).webp().toBuffer(),
    sharp(artwork).png().toBuffer(),
  ]);
  await page.route("**/api/qc/images/*/preview", route => route.fulfill({ status: 200, contentType: "image/webp", body: preview }));
  await page.route("**/api/qc/images/*/source", route => response(route, { sourceUrl: "https://scm.hubbuy.app/qc/viewer-original.png" }));
  await page.route("https://scm.hubbuy.app/**", route => route.fulfill({ status: 200, contentType: "image/png", body: original }));
}

test("manual QC association completes only the four selected photos and can close", async ({ page }) => {
  await login(page);
  const purchase = await createFinalizedPurchase(page, "QC manual selected photos");
  let transferred = false;
  await page.route(`**/api/purchases/${purchase.purchaseId}/qc**`, route => {
    if (route.request().method() === "GET") return response(route, { canManage: true, counts: [], pendingRows: [], pendingMatching: 0, items: [] });
    return response(route, { importId: "manual-selected", revision: 0, partial: false, orderCount: 1, photoCount: 92, rows: [
      { externalKey: "manual", title: "Synthetic jersey from another listing", photoCount: 4, match: { status: "IGNORED", targetItemId: null, candidates: [] }, existingItemId: null, conflict: null },
      { externalKey: "ignored", title: "Other products", photoCount: 88, match: { status: "IGNORED", targetItemId: null, candidates: [] }, existingItemId: null, conflict: null },
    ] });
  });
  await page.route("**/api/qc/imports/manual-selected", route => {
    if (route.request().method() === "GET") {
      const snapshot = transferSnapshot(transferred ? 4 : 0, transferred ? 2 : 1);
      snapshot.photos.push(...Array.from({ length: 88 }, (_, index) => ({ id: `ignored-${index}`, sourceId: null, name: "Ignored photo", occurrence: "Other products", state: "ignored", errorCode: null, byteSize: null, imageId: null, previewUrl: null })));
      return response(route, snapshot);
    }
    const body = route.request().postDataJSON();
    if (body.operation === "confirm") {
      expect(body.choices).toEqual([{ externalKey: "manual", targetKey: `purchase:${purchase.firstItemId}` }, { externalKey: "ignored", targetKey: null }]);
      return response(route, { revision: 1, linked: 1, ignored: 1, sources: 4, eligibleSources: 4, pendingMatching: 0 });
    }
    transferred = true;
    return response(route, { revision: 2, imported: 4, existing: 0, failed: 0, pending: 0, processed: 4, remaining: 0, complete: true, hasMore: false, results: [1, 2, 3, 4].map(index => ({ sourceId: `source-${index}`, status: "imported" })), snapshot: transferSnapshot(4, 2) });
  });
  await page.goto(`/packages/${purchase.trackingId}`);
  await page.getByRole("button", { name: "Importar QC", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("JSON HubBuy").fill("{}");
  await dialog.getByRole("button", { name: "Analisar JSON" }).click();
  const occurrence = dialog.locator(".qc-occurrence-card").first();
  await expect(occurrence.getByRole("combobox")).toHaveValue("");
  await occurrence.getByRole("combobox").selectOption(`purchase:${purchase.firstItemId}`);
  await expect(occurrence.getByRole("status")).toContainText("Associação manual selecionada");
  await dialog.getByRole("button", { name: "Confirmar vínculos" }).click();
  await expect(dialog.getByRole("status")).toContainText("Importação concluída");
  await expect(dialog.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "4");
  await expect(dialog.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "4");
  await expect(dialog.getByText("100%", { exact: true })).toBeVisible();
  await expect(dialog.locator(".qc-transfer-row")).toHaveCount(4);
  await expect(dialog.getByText("Ignored photo")).toHaveCount(0);
  const qa = join(process.cwd(), "artifacts", "qa", "qc-import-progress");
  mkdirSync(qa, { recursive: true });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await dialog.screenshot({ path: join(qa, `manual-selected-${width}.png`) });
    await expect(dialog.getByRole("button", { name: "Concluir", exact: true })).toBeInViewport();
  }
  await dialog.getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Importar QC", exact: true })).toBeFocused();
});

test("product QC cover and distinct thumbnails open the exact preview on desktop and mobile", async ({ page }) => {
  await login(page);
  const purchase = await createFinalizedPurchase(page, "QC inline cover QA");
  const headers = { Origin: test.info().project.use.baseURL ?? "http://localhost:3100" };
  const costUrl = `/api/packages/${purchase.trackingId}`;
  let detail = (await (await page.request.get(costUrl)).json()).data;
  const accountResponse = await page.request.post("/api/hubbuy/accounts", { headers, data: { operation: "createAccount", workspaceId: detail.purchase.workspaceId, idempotencyKey: "qc-inline-account", label: "Conta sintética QC", confirmZeroBalance: true } });
  expect(accountResponse.ok(), await accountResponse.text()).toBeTruthy();
  const account = (await accountResponse.json()).data;
  const draftResponse = await page.request.post(costUrl, { headers, data: { operation: "order.additional.create", input: {
    expectedRevision: detail.tracking.revision, idempotencyKey: "qc-inline-draft", accountId: account.accountId,
    items: [{ name: "Corda sintética QC", url: "https://example.test/qc-string", platform: "other", visualKey: "generic", quantity: 1, itemOrder: 1,
      nativeProductState: "known", nativeProductCnyMinor: 1000, nativeChinaState: "no_charge", nativeChinaCnyMinor: null,
      participants: [{ personId: detail.items[0].participants[0].personId, weightMode: "equal", weight: 1 }] }],
  } } });
  expect(draftResponse.ok(), await draftResponse.text()).toBeTruthy();
  detail = (await draftResponse.json()).data;
  const order = detail.productOrders.find((value: { kind: string }) => value.kind === "additional");
  const paymentResponse = await page.request.post(costUrl, { headers, data: { operation: "order.additional.record_payment", orderId: order.id, input: {
    expectedRevision: detail.tracking.revision, idempotencyKey: "qc-inline-payment", paymentMethod: "pix", principalBrlCents: 1500, conversionCnyMinor: 1000, conversionBrlCents: 1500,
  } } });
  expect(paymentResponse.ok(), await paymentResponse.text()).toBeTruthy();
  const additionalKey = `additional:${order.items[0].item.id}`;
  const targetKey = `purchase:${purchase.firstItemId}`;
  let coverId = "inline-photo-1", coverRevision = 0;
  const images = Array.from({ length: 14 }, (_, index) => ({ id: `inline-photo-${index + 1}`, previewUrl: `/api/qc/images/inline-photo-${index + 1}/preview`, width: 480, height: 320, occurrence: "Synthetic / L" }));
  const originalRequests: string[] = [];
  await mockQcMedia(page);
  await page.route("**/api/qc/images/*/source", route => {
    originalRequests.push(route.request().url());
    return response(route, { sourceUrl: "https://scm.hubbuy.app/qc/viewer-original.png" });
  });
  await page.route(`**/api/purchases/${purchase.purchaseId}/items/*/qc-presentation`, route => {
    const body = route.request().postDataJSON();
    expect(body.expectedRevision).toBe(coverRevision);
    coverId = body.imageId; coverRevision++;
    return response(route, { primaryImageId: coverId, revision: coverRevision });
  });
  await page.route(`**/api/purchases/${purchase.purchaseId}/qc**`, route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.has("itemIds")) return response(route, { items: params.get("itemIds")!.split(",").map(itemId => ({ itemId, qcCount: images.length, primaryImageId: coverId, presentationRevision: coverRevision, canSetCover: true,
      coverPreview: { ...images.find(image => image.id === coverId)!, imageId: coverId }, previews: images.filter(image => image.id !== coverId).slice(0, 3).map(image => ({ ...image, imageId: image.id })) })) });
    if (!params.has("itemId")) return response(route, { canManage: true, counts: [targetKey, additionalKey].map(itemId => ({ itemId, count: images.length })), pendingRows: [], items: [] });
    const direct = params.get("imageId"), position = direct ? images.findIndex(image => image.id === direct) : -1;
    const offset = position >= 0 ? Math.floor(position / 12) * 12 : Number(params.get("offset") ?? 0);
    return response(route, { itemId: targetKey, pageOffset: offset, totalCount: images.length, presentationRevision: coverRevision, primaryImageId: coverId, canSetCover: true, images: images.slice(offset, offset + 12), nextOffset: offset + 12 < images.length ? offset + 12 : null });
  });
  await page.goto(`/packages/${purchase.trackingId}`);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const row = page.locator(".cost-compact-row").filter({ hasText: "QC Marker Product" });
  await expect(row.locator(".qc-product-cover img")).toBeVisible();
  await expect(row.locator(".qc-product-cover")).toHaveAttribute("data-qc-image-id", coverId);
  await expect(row.locator(".category-marker")).toHaveCount(0);
  await expect(row.locator(".qc-product-photos .qc-product-photo")).toHaveCount(3);
  await expect(row.locator(`.qc-product-photos [data-qc-image-id="${coverId}"]`)).toHaveCount(0);
  expect(originalRequests).toHaveLength(0);
  await row.locator('[data-qc-image-id="inline-photo-3"]').click();
  await expect(page.getByRole("dialog")).toContainText("Foto 3 de 14");
  await page.getByRole("button", { name: "Usar como capa QC" }).click();
  await expect(page.getByRole("button", { name: "Capa atual" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(row.locator(".qc-product-cover")).toHaveAttribute("data-qc-image-id", "inline-photo-3");
  await expect(row.locator('.qc-product-photos [data-qc-image-id="inline-photo-3"]')).toHaveCount(0);
  const additionalRow = page.locator(".cost-compact-row").filter({ hasText: "Corda sintética QC" });
  await expect(additionalRow.locator(".qc-product-cover img")).toBeVisible();
  await expect(additionalRow.locator(".category-marker")).toHaveCount(0);
  const qa = join(process.cwd(), "artifacts", "qa", "qc-product-photos");
  mkdirSync(qa, { recursive: true });
  await row.screenshot({ path: join(qa, "desktop.png") });
  // A cover from a later gallery page must still be rendered and opened exactly.
  coverId = "inline-photo-14";
  await page.reload();
  await expect(row.locator(".qc-product-cover")).toHaveAttribute("data-qc-image-id", coverId);
  await row.locator(".qc-product-cover").click();
  await expect(page.getByRole("dialog")).toContainText("Foto 14 de 14");
  await page.keyboard.press("Escape");
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const card = page.locator(".cost-product-mobile-card").filter({ hasText: "QC Marker Product" });
    await expect(card.locator(".qc-product-cover")).toBeVisible();
    await expect(card.locator(".qc-product-photo-badge")).toHaveText("14");
    await expect(card.locator(".qc-product-photos-mobile")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await card.evaluate(element => element.scrollIntoView({ block: "center" }));
    await card.screenshot({ path: join(qa, `mobile-${width}.png`) });
    await card.locator(".qc-product-cover").click();
    await expect(page.getByRole("dialog")).toContainText("Foto 14 de 14");
    await page.keyboard.press("Escape");
    await expect(card.locator(".qc-product-cover")).toBeFocused();
  }
  await page.route("**/api/qc/images/inline-photo-14/preview", route => route.fulfill({ status: 503 }));
  await page.reload();
  const fallbackCard = page.locator(".cost-product-mobile-card").filter({ hasText: "QC Marker Product" });
  await expect(fallbackCard.locator(".qc-product-cover")).toHaveCount(0);
  await expect(fallbackCard.getByRole("button", { name: "Ver 14 fotos QC de QC Marker Product" })).toBeVisible();
});

test("QC drawer shows the real queue, existing photos, failures, recovery and pending links", async ({ page }) => {
  test.setTimeout(90000);
  await login(page);
  const purchase = await createFinalizedPurchase(page, "QC visual states E2E");
  const snapshot = transferSnapshot(1);
  snapshot.photos[0]!.name = "IMG_001.jpg";
  Object.assign(snapshot.photos[0]!, { imageId: "qc-photo-1", previewUrl: "/api/qc/images/qc-photo-1/preview", byteSize: 2516582 });
  await mockQcMedia(page);
  snapshot.photos[1]!.name = "IMG_002_nome_extremamente_longo_para_validar_truncamento_sem_overflow.jpg";
  snapshot.photos[2]!.state = "matching";
  let releaseBatch: (() => void) | undefined;
  let batches = 0, snapshotRevision = 1;
  await page.route(`**/api/purchases/${purchase.purchaseId}/qc**`, route => {
    if (route.request().method() === "GET") {
      if (new URL(route.request().url()).searchParams.has("itemIds")) return response(route, { items: [] });
      return response(route, { canManage: true, counts: [], pendingRows: [], pendingMatching: 1 });
    }
    return response(route, { importId: "mock-visual-states", revision: 0, photoCount: 4, orderCount: 1, partial: false, rows: [{ externalKey: "visual", title: "QC Marker Product", photoCount: 4, match: { status: "MATCHED", targetItemId: purchase.firstItemId, candidates: [] }, existingItemId: null, conflict: null }] });
  });
  await page.route("**/api/qc/imports/mock-visual-states", async route => {
    if (route.request().method() === "GET") return response(route, snapshot);
    const body = route.request().postDataJSON() as { operation: string; expectedRevision: number };
    if (body.operation === "confirm") return response(route, { revision: 1, linked: 1, ignored: 0, sources: 4, eligibleSources: 2, pendingMatching: 1 });
    batches++;
    if (batches === 1) await new Promise<void>(resolve => { releaseBatch = resolve; });
    const sourceIndex = batches === 1 || batches === 3 ? 1 : 3;
    const state = batches === 1 ? "failed" : batches === 2 ? "pending" : "ready";
    Object.assign(snapshot.photos[sourceIndex]!, { state, errorCode: state === "failed" ? "QC_IMAGE_FAILED" : state === "pending" ? "QC_PUT_UNCERTAIN" : null });
    snapshotRevision = body.expectedRevision + 1;
    snapshot.revision = snapshotRevision;
    snapshot.nextSourceId = batches === 2 ? "source-2" : batches === 4 ? null : "source-4";
    return response(route, { imported: state === "ready" ? 1 : 0, existing: 0, failed: state === "failed" ? 1 : 0, pending: state === "pending" ? 1 : 0, processed: 1, remaining: batches === 4 ? 0 : 1, complete: batches === 4, hasMore: batches !== 4, revision: snapshotRevision, results: [{ sourceId: `source-${sourceIndex + 1}`, status: state === "ready" ? "imported" : state }], snapshot });
  });
  await page.goto(`/packages/${purchase.trackingId}`);
  await expect(page.getByRole("button", { name: /Produtos e custos/ })).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Importar QC", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("JSON HubBuy").fill("{}");
  await dialog.getByRole("button", { name: "Analisar JSON" }).click();
  await dialog.getByRole("button", { name: "Confirmar vínculos" }).click();
  await expect(dialog.getByRole("status")).toContainText("Processando suas fotos");
  await expect(dialog.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  await expect(dialog.locator(".qc-transfer-row").nth(0)).toContainText("Já existente");
  await expect(dialog.locator(".qc-transfer-thumbnail img")).toHaveCount(1);
  await expect(dialog.locator(".qc-transfer-row").nth(0)).toContainText("2,4 MB");
  await expect(dialog.getByRole("status")).toContainText("Processando suas fotos");
  await expect(dialog.locator(".qc-transfer-state").filter({ hasText: "Processando..." })).toHaveCount(0);
  await expect(dialog.locator(".qc-transfer-row")).toHaveCount(3);
  await expect(dialog.locator(".qc-transfer-row").nth(2)).toContainText("Aguardando...");
  await expect(dialog.getByRole("button", { name: "Nova importação" })).toBeDisabled();
  const qaFolder = join(process.cwd(), "artifacts", "qa", "qc-import-progress");
  mkdirSync(qaFolder, { recursive: true });
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(dialog.getByRole("button", { name: "Fechar" })).toBeVisible();
    await expect(dialog.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    await dialog.screenshot({ path: join(qaFolder, `processing-${width}.png`) });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(dialog.locator(".qc-transfer-spinner")).toHaveCount(0);
  await expect(dialog.getByRole("status")).toContainText("Processando suas fotos");
  releaseBatch!();
  await expect(dialog.getByRole("status")).toContainText("Importação interrompida");
  await expect(dialog.locator(".qc-transfer-row").nth(1)).toContainText("Falha");
  await expect(dialog.locator(".qc-transfer-row").nth(1)).toContainText("QC_IMAGE_FAILED");
  await dialog.screenshot({ path: join(qaFolder, "failure-320.png") });
  await page.setViewportSize({ width: 320, height: 480 });
  const photoList = dialog.getByRole("list", { name: "Fotos da importação QC" });
  await photoList.focus();
  await page.keyboard.press("End");
  await expect.poll(() => photoList.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect(dialog.getByRole("button", { name: "Continuar / tentar novamente" })).toBeInViewport();
  await page.setViewportSize({ width: 320, height: 844 });
  await dialog.getByRole("button", { name: "Continuar / tentar novamente" }).click();
  await expect(dialog.locator(".qc-transfer-row").nth(1)).toContainText("Falha");
  await expect(dialog.locator(".qc-transfer-row").nth(2)).toContainText("Pendente");
  await expect(dialog.locator(".qc-transfer-row").nth(2)).toContainText("QC_PUT_UNCERTAIN");
  await expect(dialog.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
  await page.setViewportSize({ width: 390, height: 600 });
  await dialog.screenshot({ path: join(qaFolder, "recovery-390.png") });
  await dialog.getByRole("button", { name: "Continuar / tentar novamente" }).click();
  await expect(dialog.getByRole("button", { name: "Concluir", exact: true })).toBeEnabled();
  await expect(dialog.getByRole("status")).toContainText("Importação concluída");
  await expect(dialog.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3");
  await expect(dialog.locator(".qc-transfer-row").nth(1)).toContainText("Importada");
  await expect(dialog.locator(".qc-transfer-summary")).toHaveCount(0);
  await expect(dialog.locator(".qc-transfer-row")).toHaveCount(3);
  await dialog.screenshot({ path: join(qaFolder, "partial-390.png") });
  expect(batches).toBe(4);
});

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
  await expect(dialog.getByRole("heading", { name: "Importar QC do HubBuy" })).toBeVisible();
  await expect(dialog.getByText("Cole uma resposta HubBuy. Somente freePhotos são processadas; os vínculos serão confirmados antes de qualquer transferência.")).toBeVisible();
  const widths = [1440, 390, 320];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  const pasted = {
    code: 0,
    data: { count: 1, list: [{ orderNo: "QC-E2E-1", goodsList: [
      { orderGoodsId: "QC-GOODS-1", offerUrl: "https://weidian.com/item.html?itemID=987654321", skuInfo: "Blue / 40", goodsName: "QC Marker Product", quantity: 1, freePhotos: [] },
      { orderGoodsId: "QC-GOODS-2", offerUrl: "https://example.invalid/item/2", skuInfo: "Red / 42", goodsName: "QC Unmatched Product with a very long HubBuy title that should stay compact", quantity: 1, freePhotos: [] },
    ] }] },
  };
  await dialog.getByLabel("JSON HubBuy").fill(JSON.stringify(pasted));
  await dialog.getByRole("button", { name: "Analisar JSON" }).click();
  await expect(dialog.getByText("Nenhum QC novo para vincular neste JSON.")).toBeVisible();
  await expect(dialog.locator(".qc-import-summary")).toContainText("0 pedido(s)");
  await expect(dialog.locator(".qc-import-summary")).toContainText("0 ocorrência(s)");
  await expect(dialog.locator(".qc-import-summary")).toContainText("0 foto(s)");
  await expect(dialog.locator(".qc-occurrence-card")).toHaveCount(0);
  await expect(dialog.getByRole("combobox")).toHaveCount(0);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    if (width <= 600) expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const dialogWidth = await dialog.evaluate(element => ({ left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right, viewport: window.innerWidth, client: element.clientWidth, scroll: element.scrollWidth }));
    expect(dialogWidth.left).toBeGreaterThanOrEqual(0);
    expect(dialogWidth.right).toBeLessThanOrEqual(dialogWidth.viewport + 1);
    expect(dialogWidth.scroll).toBeLessThanOrEqual(dialogWidth.client);
    await expect(dialog.getByRole("button", { name: "Concluir", exact: true })).toBeVisible();
    const footerFits = await dialog.locator(".qc-import-footer").evaluate(footer => footer.getBoundingClientRect().bottom <= footer.closest('[role="dialog"]')!.getBoundingClientRect().bottom + 1);
    expect(footerFits).toBeTruthy();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByRole("button", { name: "Confirmar vínculos" })).toHaveCount(0);
  await expect(dialog.getByRole("progressbar")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Processar próximo lote" })).toHaveCount(0);
  expect((await page.request.get(`/api/purchases/${purchaseId}/qc`)).ok()).toBeTruthy();
  await dialog.getByRole("button", { name: "Concluir", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await ensureProductsOpen(page);
  const noQcRow = page.locator(".cost-table tbody tr").filter({ hasText: "QC Marker Product" });
  const categoryMarker = noQcRow.locator(".category-marker");
  await expect(categoryMarker).toHaveCSS("width", "36px");
  await expect(categoryMarker.locator("svg")).toHaveCSS("width", "22px");
  mkdirSync(join(process.cwd(), "artifacts", "qa", "qc-cost-refinement"), { recursive: true });
  await noQcRow.screenshot({ path: join(process.cwd(), "artifacts", "qa", "qc-cost-refinement", "qc-cost-line-no-qc-desktop.png") });
});

test("HubBuy QC automatically completes four distinct photos and refreshes gallery counts", async ({ page }) => {
  await login(page);
  const purchase = await createFinalizedPurchase(page, "QC four photos E2E");
  let importedPhotos = 0, batches = 0, transferGets = 0, coverId: string | null = null, coverRevision = 0, manifestRevision = 1;
  let releaseFirstBatch: (() => void) | undefined;
  let releaseLastBatch: (() => void) | undefined;
  const photoIds = Array.from({ length: 4 }, (_, index) => `qc-photo-${index + 1}`);
  await page.route(`**/api/purchases/${purchase.purchaseId}/qc**`, async route => {
    const request = route.request();
    if (request.method() === "GET") {
      const params = new URL(request.url()).searchParams;
      if (params.has("itemIds")) {
        const itemIds = params.get("itemIds")?.split(",") ?? [];
        return response(route, { purchaseId: purchase.purchaseId, items: itemIds.map(itemId => ({ itemId, purchaseItemId: itemId.replace(/^purchase:/, ""), qcCount: itemId === `purchase:${purchase.firstItemId}` ? importedPhotos : 0, primaryImageId: itemId === `purchase:${purchase.firstItemId}` ? coverId : null, presentationRevision: itemId === `purchase:${purchase.firstItemId}` ? coverRevision : 0, coverPreview: itemId === `purchase:${purchase.firstItemId}` && coverId ? { imageId: coverId, previewUrl: `/api/qc/images/${coverId}/preview`, width: 160, height: 107, occurrence: "Blue / 40" } : null, canSetCover: true, previews: itemId === `purchase:${purchase.firstItemId}` ? photoIds.slice(0, importedPhotos).filter(id => id !== coverId).slice(0, 3).map(id => ({ imageId: id, previewUrl: `/api/qc/images/${id}/preview`, width: 160, height: 107, occurrence: "Blue / 40" })) : [], remainingCount: itemId === `purchase:${purchase.firstItemId}` ? Math.max(0, importedPhotos - 3) : 0 })) });
      }
      const itemId = params.get("itemId");
      return response(route, itemId ? { itemId, pageOffset: 0, totalCount: importedPhotos, presentationRevision: coverRevision, primaryImageId: coverId, canSetCover: true, images: photoIds.slice(0, importedPhotos).map(id => ({ id, previewUrl: `/api/qc/images/${id}/preview`, width: 1, height: 1, occurrence: "Blue / 40" })), nextOffset: null } : { purchaseId: purchase.purchaseId, canManage: true, counts: [{ itemId: purchase.firstItemId, count: importedPhotos }], pendingMatching: 0, pendingRows: [], pendingTransfers: 4 - importedPhotos, pendingDeletes: 0, pendingPreviews: 0 });
    }
    const body = request.postDataJSON() as { operation: string };
    if (body.operation === "prepare") return response(route, { importId: "mock-import-four", revision: 0, partial: false, orderCount: 1, photoCount: 4, rows: [{ externalKey: "QC-E2E-FOUR:id:QC-GOODS-FOUR", orderNo: "QC-E2E-FOUR", orderGoodsId: "QC-GOODS-FOUR", orderGoodsNo: null, offerId: null, skuInfo: "Blue / 40", title: "QC Marker Product", quantity: 1, photoCount: 4, match: { status: "MATCHED", targetItemId: purchase.firstItemId, candidates: [] }, existingItemId: null, conflict: null }] });
    throw new Error(`Unexpected QC operation ${body.operation}`);
  });
  await mockQcMedia(page);
  await page.route("**/api/qc/imports/mock-import-four", async route => {
    if (route.request().method() === "GET") {
      transferGets++;
      const snapshot = transferSnapshot(importedPhotos);
      snapshot.revision = manifestRevision;
      snapshot.photos.push(...Array.from({ length: 88 }, (_, index) => ({ id: `ignored-${index}`, sourceId: null, name: `Ignored photo ${index}`, occurrence: "Ignored product", state: "ignored", errorCode: null, byteSize: null, imageId: null, previewUrl: null })));
      return response(route, snapshot);
    }
    const body = route.request().postDataJSON() as { operation: string; expectedRevision: number };
    if (body.operation === "confirm") return response(route, { importId: "mock-import-four", revision: 1, linked: 1, pendingMatching: 0, ignored: 0, sources: 4, eligibleSources: 4 });
    if (body.operation === "batch") {
      if (batches === 0) await new Promise<void>(resolve => { releaseFirstBatch = resolve; });
      if (batches === 3) await new Promise<void>(resolve => { releaseLastBatch = resolve; });
      batches++;
      importedPhotos++;
      manifestRevision = body.expectedRevision + 1;
      if (!coverId) { coverId = `qc-photo-${importedPhotos}`; coverRevision++; }
      const remaining = 4 - batches;
      const snapshot = transferSnapshot(importedPhotos, manifestRevision);
      snapshot.photos.push(...Array.from({ length: 88 }, (_, index) => ({ id: `ignored-${index}`, sourceId: null, name: `Ignored photo ${index}`, occurrence: "Ignored product", state: "ignored", errorCode: null, byteSize: null, imageId: null, previewUrl: null })));
      return response(route, { imported: 1, existing: 0, failed: 0, pending: 0, processed: 1, remaining, hasMore: remaining > 0, complete: remaining === 0, partial: remaining > 0, revision: manifestRevision, results: [{ sourceId: `source-${batches}`, status: "imported" }], snapshot });
    }
    throw new Error(`Unexpected import operation ${body.operation}`);
  });
  await page.goto(`/packages/${purchase.trackingId}`);
  await expect(page.getByRole("button", { name: /Produtos e custos/ })).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Importar QC", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const pasted = { code: 0, data: { count: 1, list: [{ orderNo: "QC-E2E-FOUR", goodsList: [{ orderGoodsId: "QC-GOODS-FOUR", offerUrl: "https://weidian.com/item.html?itemID=987654321", skuInfo: "Blue / 40", goodsName: "QC Marker Product", quantity: 1, freePhotos: ["https://scm.hubbuy.app/a", "https://scm.hubbuy.app/b", "https://scm.hubbuy.app/c", "https://scm.hubbuy.app/d"] }] }] } };
  await dialog.getByLabel("JSON HubBuy").fill(JSON.stringify(pasted));
  await dialog.getByRole("button", { name: "Analisar JSON" }).click();
  await expect(dialog.getByRole("button", { name: "Confirmar vínculos" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Confirmar vínculos" }).click();
  await expect(dialog.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  await expect(dialog.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "4");
  await expect(dialog.locator(".qc-transfer-row")).toHaveCount(4);
  await expect(dialog.getByText("Ignored product")).toHaveCount(0);
  await expect(dialog.getByRole("status")).toContainText("Processando suas fotos");
  await expect(dialog.locator(".qc-transfer-state").filter({ hasText: "Processando..." })).toHaveCount(0);
  await expect(dialog.locator(".qc-transfer-state").filter({ hasText: "Aguardando..." })).toHaveCount(4);
  await page.setViewportSize({ width: 390, height: 844 });
  const progressQa = join(process.cwd(), "artifacts", "qa", "qc-import-progress");
  mkdirSync(progressQa, { recursive: true });
  await dialog.screenshot({ path: join(progressQa, "starting-390.png"), animations: "disabled" });
  releaseFirstBatch!();
  await expect(dialog.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3");
  await expect(dialog.locator(".qc-transfer-state").filter({ hasText: "Importada" })).toHaveCount(3);
  await expect(dialog.locator(".qc-transfer-state").filter({ hasText: "Processando..." })).toHaveCount(0);
  await expect(dialog.locator(".qc-transfer-state").filter({ hasText: "Aguardando..." })).toHaveCount(1);
  await dialog.screenshot({ path: join(progressQa, "progress-75-390.png"), animations: "disabled" });
  releaseLastBatch!();
  await expect(dialog.getByRole("status")).toContainText("Importação concluída");
  await expect(dialog.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "4");
  await expect(dialog.locator(".qc-transfer-state").filter({ hasText: "Importada" })).toHaveCount(4);
  await dialog.screenshot({ path: join(progressQa, "success-390.png"), animations: "disabled" });
  expect(batches).toBe(4);
  expect(transferGets).toBe(1);
  await dialog.getByRole("button", { name: "Concluir", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  const galleryButton = page.locator(".qc-product-photos-desktop:visible").getByRole("button", { name: /^Ver \d+ fotos QC de QC Marker Product$/ });
  await expect(galleryButton).toHaveText("Ver mais");
  await page.setViewportSize({ width: 1440, height: 900 });
  const qaFolder = join(process.cwd(), "artifacts", "qa", "qc-cost-refinement");
  mkdirSync(qaFolder, { recursive: true });
  const costRow = page.locator(".cost-table tbody tr").filter({ hasText: "QC Marker Product" });
  await expect(costRow.locator(".qc-product-cover")).toHaveAttribute("data-qc-image-id", "qc-photo-1");
  await expect(costRow.locator(".qc-product-photos .qc-product-photo")).toHaveCount(3);
  await costRow.screenshot({ path: join(qaFolder, "qc-cost-line-desktop.png") });
  await expect(page.locator(".qc-cost-list")).toHaveCount(0);
  const photoTrigger = costRow.locator(".qc-product-photos .qc-product-photo").nth(0);
  await photoTrigger.click();
  await expect(page.locator(".qc-viewer-toolbar")).toContainText("Foto 2 de 4");
  await expect(page.locator(".qc-gallery-card")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(photoTrigger).toBeFocused();
  await galleryButton.click();
  await expect(page.locator(".qc-viewer-toolbar")).toContainText("Foto 1 de 4");
  await expect(page.getByRole("button", { name: "Todas as fotos" })).toHaveCount(0);
  await expect(page.locator(".qc-viewer-thumb")).toHaveCount(4);
  await page.getByRole("button", { name: "Selecionar foto 2", exact: true }).click();
  await expect(page.locator(".qc-viewer-photo img")).toBeVisible();
  const fullPhoto = page.locator(".qc-viewer-photo img");
  await expect.poll(() => fullPhoto.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(480);
  const imageFit = await fullPhoto.evaluate(image => {
    const img = image as HTMLImageElement, photo = img.parentElement!.getBoundingClientRect(), bounds = img.getBoundingClientRect();
    return { fit: getComputedStyle(img).objectFit, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, width: bounds.width, height: bounds.height, photoWidth: photo.width, photoHeight: photo.height };
  });
  expect(imageFit.fit).toBe("contain");
  expect(imageFit.naturalWidth).toBe(480);
  expect(imageFit.naturalHeight).toBe(320);
  expect(imageFit.width).toBeLessThanOrEqual(imageFit.photoWidth + 1);
  expect(imageFit.height).toBeLessThanOrEqual(imageFit.photoHeight + 1);
  await page.locator(".qc-viewer-surface").screenshot({ path: join(qaFolder, "qc-viewer-full-photo.png") });
  await expect(page.locator(".qc-viewer-toolbar")).toContainText("Foto 2 de 4");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".qc-viewer-toolbar")).toContainText("Foto 3 de 4");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".qc-viewer-toolbar")).toContainText("Foto 2 de 4");

  await page.route(`**/api/purchases/${purchase.purchaseId}/items/*/qc-presentation`, async route => {
    const body = route.request().postDataJSON() as { imageId: string; expectedRevision: number };
    expect(body).toEqual({ imageId: "qc-photo-2", expectedRevision: coverRevision });
    coverId = body.imageId; coverRevision++;
    return response(route, { purchaseItemId: purchase.firstItemId, primaryImageId: coverId, revision: coverRevision });
  });
  await page.getByRole("button", { name: "Usar como capa QC" }).click();
  await expect(page.getByRole("button", { name: "Capa atual" })).toBeVisible();
  await page.locator(".qc-viewer-surface").getByRole("button", { name: "Fechar" }).click();
  await page.reload();
  await ensureProductsOpen(page);
  await expect(costRow.locator(".qc-product-cover")).toHaveAttribute("data-qc-image-id", "qc-photo-2");
  await expect(costRow.locator(".qc-product-cover img")).toHaveAttribute("alt", "Capa QC de QC Marker Product");
  await expect(costRow.locator(".qc-product-cover img")).toBeVisible();
  await page.locator(".qc-product-photos-desktop:visible").getByRole("button", { name: /^Ver \d+ fotos QC de QC Marker Product$/ }).click();
  await page.getByRole("button", { name: "Selecionar foto 2", exact: true }).click();
  await expect(page.getByRole("button", { name: "Capa atual" })).toBeVisible();
  await page.route("**/api/qc/images/qc-photo-2", async route => {
    if (route.request().method() !== "DELETE") throw new Error(`Unexpected image request ${route.request().method()}`);
    photoIds.splice(photoIds.indexOf("qc-photo-2"), 1); importedPhotos--; coverId = "qc-photo-1"; coverRevision++;
    return response(route, { status: "deleted" });
  });
  await page.getByRole("button", { name: "Excluir foto QC" }).click();
  const confirm = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Excluir foto QC?" }) });
  await confirm.getByRole("button", { name: "Excluir foto" }).click();
  await expect(page.locator(".qc-viewer-toolbar")).toContainText("Foto 2 de 3");
  await expect(page.locator(".qc-viewer-photo img")).toBeVisible();
  expect(coverId).toBe("qc-photo-1");
  await expect(costRow.locator(".qc-product-cover")).toHaveAttribute("data-qc-image-id", "qc-photo-1");
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const surface = await page.locator(".qc-viewer-surface").boundingBox();
    expect(surface).not.toBeNull();
    expect(surface!.x).toBeGreaterThanOrEqual(0);
    expect(surface!.x + surface!.width).toBeLessThanOrEqual(width + 1);
    const main = await page.locator(".qc-viewer-main").boundingBox();
    expect(main).not.toBeNull();
    expect(main!.x).toBeGreaterThanOrEqual(0);
    expect(main!.x + main!.width).toBeLessThanOrEqual(width + 1);
    if (process.env.LOTI_CAPTURE_QC_QA === "1") {
      const folder = join(process.cwd(), "artifacts", "qa", "qc-viewer");
      mkdirSync(folder, { recursive: true });
      await page.screenshot({ path: join(folder, `qc-viewer-${width}.png`) });
    }
  }
  await expect(page.locator(".qc-viewer-thumb")).toHaveCount(3);
  await page.locator(".qc-viewer-surface").getByRole("button", { name: "Fechar" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileCostCard = page.locator(".cost-product-mobile-card").filter({ hasText: "QC Marker Product" });
  await expect(mobileCostCard.locator(".qc-product-cover")).toHaveAttribute("data-qc-image-id", "qc-photo-1");
  await expect(mobileCostCard.locator(".qc-product-cover img")).toBeVisible();
  await expect(mobileCostCard.locator(".qc-product-photos .qc-product-photo")).toHaveCount(0);
  await expect(mobileCostCard.locator(".qc-product-photo-badge")).toHaveText("3");
  await mobileCostCard.screenshot({ path: join(qaFolder, "qc-cost-card-mobile.png") });
  await mobileCostCard.locator(".qc-product-cover").click();
  await page.getByRole("button", { name: "Selecionar foto 2", exact: true }).click();
  await expect(page.locator(".qc-viewer-toolbar")).toContainText("Foto 2 de 3");
  await page.keyboard.press("Escape");
  await page.goto(`/history/${purchase.purchaseId}`);
  await expect(page.locator(".qc-product-cover")).toHaveCount(0);
  await page.getByRole("button", { name: "QC Marker Product", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Ver QC de QC Marker Product" }).click();
  await expect(page.locator(".qc-viewer-surface")).toBeVisible();
  await expect(page.getByRole("button", { name: "Usar como capa QC" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Excluir foto QC" })).toHaveCount(0);
});

test("cost thumbnails open their exact photo across gallery pages", async ({ page }) => {
  await login(page);
  const purchase = await createFinalizedPurchase(page, "QC direct photo E2E");
  const photos = Array.from({ length: 14 }, (_, index) => ({ id: `direct-photo-${index + 1}`, previewUrl: `/api/qc/images/direct-photo-${index + 1}/preview`, width: 480, height: 320, occurrence: "Blue / 40" }));
  const cover = { imageId: photos[13]!.id, previewUrl: photos[13]!.previewUrl, width: 160, height: 107, occurrence: "Blue / 40" };
  const requestedOriginals: string[] = [];
  await mockQcMedia(page);
  page.on("request", request => { if (new URL(request.url()).pathname.endsWith("/source")) requestedOriginals.push(request.url()); });
  await page.route(`**/api/purchases/${purchase.purchaseId}/qc**`, async route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.has("itemIds")) return response(route, { purchaseId: purchase.purchaseId, items: [{ itemId: `purchase:${purchase.firstItemId}`, purchaseItemId: purchase.firstItemId, qcCount: 14, coverPreview: cover, previews: photos.slice(0, 3).map(photo => ({ ...photo, imageId: photo.id })), remainingCount: 11 }] });
    if (!params.has("itemId")) return response(route, { purchaseId: purchase.purchaseId, canManage: false, counts: [{ itemId: purchase.firstItemId, count: 14 }], pendingMatching: 0, pendingTransfers: 0, pendingDeletes: 0 });
    const target = photos.findIndex(photo => photo.id === params.get("imageId"));
    const offset = target >= 0 ? Math.floor(target / 12) * 12 : Number(params.get("offset") ?? 0);
    return response(route, { itemId: purchase.firstItemId, pageOffset: offset, totalCount: 14, presentationRevision: 0, primaryImageId: cover.imageId, canSetCover: false, images: photos.slice(offset, offset + 12), nextOffset: offset === 0 ? 12 : null });
  });
  await page.goto(`/packages/${purchase.trackingId}`);
  await expect(page.getByRole("button", { name: /Produtos e custos/ })).toHaveAttribute("aria-expanded", "true");
  const trigger = page.locator('.qc-product-photo[data-qc-image-id="direct-photo-14"]:visible');
  await expect(trigger).toBeVisible();
  expect(requestedOriginals).toHaveLength(0);
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qc-viewer-toolbar")).toContainText("Foto 14 de 14");
  await expect(page.locator(".qc-viewer-photo img")).toBeVisible();
  expect(requestedOriginals.every(url => url.includes("direct-photo-14/source"))).toBe(true);
  await expect(page.locator(".qc-gallery-card")).toHaveCount(0);
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".qc-viewer-toolbar")).toContainText("Foto 13 de 14");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".qc-viewer-toolbar")).toContainText("Foto 12 de 14");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".qc-viewer-toolbar")).toContainText("Foto 13 de 14");
  await expect(page.getByRole("button", { name: "Excluir foto QC" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("ambiguous QC occurrence requires a candidate and then transfers every photo", async ({ page }) => {
  await login(page);
  const purchase = await createFinalizedPurchase(page, "QC pending match E2E", true);
  let imports = 0, selectedItemId = "", batches = 0;
  await page.route(`**/api/purchases/${purchase.purchaseId}/qc**`, async route => {
    const request = route.request();
    if (request.method() === "GET") {
      const params = new URL(request.url()).searchParams;
      if (params.has("itemIds")) return response(route, { items: params.get("itemIds")!.split(",").map(itemId => ({ itemId, qcCount: itemId === `purchase:${purchase.secondItemId}` ? imports : 0, coverPreview: null, previews: [] })) });
      const itemId = new URL(request.url()).searchParams.get("itemId");
      return response(route, itemId ? { itemId, pageOffset: 0, totalCount: imports, presentationRevision: 0, primaryImageId: null, canSetCover: true, images: Array.from({ length: imports }, (_, index) => ({ id: `qc-pending-photo-${index + 1}`, previewUrl: `/api/qc/images/qc-pending-photo-${index + 1}/preview`, width: 1, height: 1, occurrence: "Navy / L" })), nextOffset: null } : { purchaseId: purchase.purchaseId, canManage: true, counts: [{ itemId: purchase.secondItemId, count: imports }], pendingMatching: selectedItemId ? 0 : 1, pendingRows: selectedItemId ? [] : [{ externalItemId: "qc-ambiguous", revision: 0, orderNo: "QC-PENDING", orderGoodsId: "QC-GOODS-PENDING", orderGoodsNo: null, skuInfo: "Navy / L", title: "QC Marker Product", quantity: 1, photoCount: 4, candidates: [{ itemId: purchase.firstItemId, name: "QC Marker Product", reasons: ["Mesmo anúncio"] }, { itemId: purchase.secondItemId, name: "QC Second Candidate", reasons: ["Mesmo anúncio"] }] }], pendingTransfers: selectedItemId ? 4 - imports : 0, pendingDeletes: 0, pendingPreviews: 0 });
    }
    const body = request.postDataJSON() as { operation: string; targetKey?: string; externalItemId?: string };
    if (body.operation === "resolve") { selectedItemId = body.targetKey ?? ""; return response(route, { externalItemId: body.externalItemId, purchaseItemId: selectedItemId, revision: 1, pendingSources: 4 }); }
    if (body.operation === "batch" && body.externalItemId === "qc-ambiguous") { batches++; imports++; const remaining = 4 - batches; return response(route, { imported: 1, existing: 0, failed: 0, pending: 0, processed: 1, remaining, hasMore: remaining > 0, complete: remaining === 0, partial: false, results: [{ status: "imported" }] }); }
    throw new Error(`Unexpected QC operation ${body.operation}`);
  });
  await mockQcMedia(page);
  await page.goto(`/packages/${purchase.trackingId}`);
  await expect(page.getByRole("button", { name: /Produtos e custos/ })).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: /Ações QC/ }).click();
  await page.getByRole("menuitem", { name: /Verificar vínculos pendentes/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("QC Marker Product", { exact: true })).toBeVisible();
  const select = dialog.getByLabel("Produto Loti para QC Marker Product");
  await select.selectOption(`purchase:${purchase.secondItemId}`);
  await dialog.getByRole("button", { name: "Associar e processar fotos" }).click();
  await expect(dialog.getByRole("status")).toContainText("Importação concluída.");
  expect(selectedItemId).toBe(`purchase:${purchase.secondItemId}`);
  expect(batches).toBe(4);
  await dialog.getByRole("button", { name: "Fechar" }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  const galleryButton = page.locator(".qc-product-photos-desktop:visible").getByRole("button", { name: /^Ver \d+ fotos QC de QC Second Candidate$/ });
  await expect(galleryButton).toHaveText("Ver mais");
  await galleryButton.click();
  await expect(page.locator(".qc-viewer-thumb")).toHaveCount(4);
});

test("QC transfer interruption stays partial, surfaces the error and refreshes completed photo counts", async ({ page }) => {
  await login(page);
  const purchase = await createFinalizedPurchase(page, "QC partial transfer E2E");
  let importedPhotos = 0, batches = 0;
  await page.route(`**/api/purchases/${purchase.purchaseId}/qc**`, async route => {
    const request = route.request();
    if (request.method() === "GET" && new URL(request.url()).searchParams.has("itemIds")) return response(route, { items: [{ itemId: `purchase:${purchase.firstItemId}`, qcCount: importedPhotos, coverPreview: null, previews: [] }] });
    if (request.method() === "GET") return response(route, { purchaseId: purchase.purchaseId, canManage: true, counts: [{ itemId: purchase.firstItemId, count: importedPhotos }], pendingMatching: 0, pendingRows: [], pendingTransfers: 4 - importedPhotos, pendingDeletes: 0 });
    const body = request.postDataJSON() as { operation: string };
    if (body.operation === "prepare") return response(route, { importId: "mock-import-interrupted", revision: 0, partial: false, orderCount: 1, photoCount: 4, rows: [{ externalKey: "QC-E2E-INTERRUPTED:id:QC-GOODS-INTERRUPTED", orderNo: "QC-E2E-INTERRUPTED", orderGoodsId: "QC-GOODS-INTERRUPTED", orderGoodsNo: null, offerId: null, skuInfo: "Blue / 40", title: "QC Marker Product", quantity: 1, photoCount: 4, match: { status: "MATCHED", targetItemId: purchase.firstItemId, candidates: [] }, existingItemId: null, conflict: null }] });
    throw new Error(`Unexpected QC operation ${body.operation}`);
  });
  await page.route("**/api/qc/imports/mock-import-interrupted", async route => {
    if (route.request().method() === "GET") return response(route, transferSnapshot(importedPhotos));
    const body = route.request().postDataJSON() as { operation: string; expectedRevision: number };
    if (body.operation === "confirm") return response(route, { importId: "mock-import-interrupted", revision: 1, linked: 1, pendingMatching: 0, ignored: 0, sources: 4, eligibleSources: 4 });
    if (body.operation === "batch") {
      batches++;
      if (batches === 2) return route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "Limite QC atingido. Tente novamente mais tarde." }) });
      importedPhotos++;
      return response(route, { imported: 1, existing: 0, failed: 0, pending: 0, processed: 1, remaining: 3, hasMore: true, complete: false, partial: true, revision: body.expectedRevision + 1, results: [{ sourceId: "source-1", status: "imported" }] });
    }
    throw new Error(`Unexpected import operation ${body.operation}`);
  });
  await page.goto(`/packages/${purchase.trackingId}`);
  await expect(page.getByRole("button", { name: /Produtos e custos/ })).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Importar QC", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const pasted = { code: 0, data: { count: 1, list: [{ orderNo: "QC-E2E-INTERRUPTED", goodsList: [{ orderGoodsId: "QC-GOODS-INTERRUPTED", offerUrl: "https://weidian.com/item.html?itemID=987654321", skuInfo: "Blue / 40", goodsName: "QC Marker Product", quantity: 1, freePhotos: ["https://scm.hubbuy.app/a", "https://scm.hubbuy.app/b", "https://scm.hubbuy.app/c", "https://scm.hubbuy.app/d"] }] }] } };
  await dialog.getByLabel("JSON HubBuy").fill(JSON.stringify(pasted));
  await dialog.getByRole("button", { name: "Analisar JSON" }).click();
  await dialog.getByRole("button", { name: "Confirmar vínculos" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Limite QC atingido");
  expect(batches).toBe(2);
  await expect(dialog.getByRole("button", { name: "Continuar / tentar novamente" })).toBeEnabled();
  await expect(dialog.getByRole("status")).toContainText("Importação interrompida");
  await expect(dialog.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  await expect(dialog.locator(".qc-transfer-state").filter({ hasText: "Importada" })).toHaveCount(1);
  await expect(dialog.locator(".qc-transfer-state").filter({ hasText: "Aguardando" })).toHaveCount(3);
  await dialog.getByRole("button", { name: "Fechar" }).click();
  await expect(page.locator(".qc-product-photos-desktop:visible").getByRole("button", { name: /^Ver \d+ fotos QC de QC Marker Product$/ })).toHaveText("Ver mais");
});

test("a fresh confirmation reimports all included photos after QC deletion", async ({ page }) => {
  await login(page);
  const purchase = await createFinalizedPurchase(page, "QC delete and reimport E2E");
  const photoIds = Array.from({ length: 4 }, (_, index) => `qc-photo-${index + 1}`);
  const importedIds = new Set<string>();
  let batches = 0, prepareCount = 0, confirmCount = 0, coverId: string | null = null, coverRevision = 0, transferActive = false, lastRestoreCount = 0;
  const imported = () => photoIds.filter(id => importedIds.has(id));
  await page.route(`**/api/purchases/${purchase.purchaseId}/qc**`, async route => {
    const request = route.request();
    if (request.method() === "GET") {
      const params = new URL(request.url()).searchParams;
      if (params.has("itemIds")) return response(route, { purchaseId: purchase.purchaseId, items: (params.get("itemIds")?.split(",") ?? []).map(itemId => ({ itemId, purchaseItemId: itemId.replace(/^purchase:/, ""), qcCount: itemId === `purchase:${purchase.firstItemId}` ? imported().length : 0, primaryImageId: itemId === `purchase:${purchase.firstItemId}` ? coverId : null, presentationRevision: itemId === `purchase:${purchase.firstItemId}` ? coverRevision : 0, coverPreview: itemId === `purchase:${purchase.firstItemId}` && coverId ? { imageId: coverId, previewUrl: `/api/qc/images/${coverId}/preview`, width: 160, height: 107, occurrence: "Blue / 40" } : null, canSetCover: true, previews: itemId === `purchase:${purchase.firstItemId}` ? imported().filter(id => id !== coverId).slice(0, 3).map(id => ({ imageId: id, previewUrl: `/api/qc/images/${id}/preview`, width: 160, height: 107, occurrence: "Blue / 40" })) : [], remainingCount: itemId === `purchase:${purchase.firstItemId}` ? Math.max(0, imported().length - 3) : 0 })) });
      const itemId = params.get("itemId");
      return response(route, itemId ? { itemId, pageOffset: 0, totalCount: imported().length, presentationRevision: coverRevision, primaryImageId: coverId, canSetCover: true, images: imported().map(id => ({ id, previewUrl: `/api/qc/images/${id}/preview`, width: 1, height: 1, occurrence: "Blue / 40" })), nextOffset: null } : { purchaseId: purchase.purchaseId, canManage: true, counts: [{ itemId: purchase.firstItemId, count: imported().length }], pendingMatching: 0, pendingRows: [], pendingTransfers: transferActive ? 4 - imported().length : 0, pendingDeletes: 0, pendingPreviews: 0 });
    }
    const body = request.postDataJSON() as { operation: string };
    if (body.operation === "prepare") {
      prepareCount++;
      return response(route, { importId: "mock-import-reimport", revision: 0, partial: false, orderCount: 1, photoCount: 4, rows: [{ externalKey: "QC-E2E-REIMPORT:id:QC-GOODS-REIMPORT", orderNo: "QC-E2E-REIMPORT", orderGoodsId: "QC-GOODS-REIMPORT", orderGoodsNo: null, offerId: null, skuInfo: "Blue / 40", title: "QC Marker Product", quantity: 1, photoCount: 4, match: { status: "MATCHED", targetItemId: purchase.firstItemId, candidates: [] }, existingItemId: prepareCount > 1 ? purchase.firstItemId : null, conflict: null }] });
    }
    throw new Error(`Unexpected QC operation ${body.operation}`);
  });
  await page.route("**/api/qc/imports/mock-import-reimport", async route => {
    if (route.request().method() === "GET") return response(route, transferSnapshot(imported().length));
    const body = route.request().postDataJSON() as { operation: string; expectedRevision: number };
    if (body.operation === "confirm") {
      confirmCount++;
      batches = 0;
      transferActive = true;
      lastRestoreCount = confirmCount === 2 ? 4 : 0;
      return response(route, { importId: "mock-import-reimport", revision: 1, linked: 1, pendingMatching: 0, ignored: 0, sources: 4, eligibleSources: 4, restored: lastRestoreCount });
    }
    if (body.operation === "batch") {
      const id = photoIds[batches]!;
      batches++;
      importedIds.add(id);
      if (!coverId) { coverId = id; coverRevision++; }
      const remaining = 4 - batches;
      transferActive = remaining > 0;
      return response(route, { imported: 1, existing: 0, failed: 0, pending: 0, processed: 1, remaining, hasMore: remaining > 0, complete: remaining === 0, partial: remaining > 0, revision: body.expectedRevision + 1, results: [{ sourceId: `source-${batches}`, status: "imported" }] });
    }
    throw new Error(`Unexpected import operation ${body.operation}`);
  });
  await page.route(url => new URL(url).pathname.match(/^\/api\/qc\/images\/qc-photo-\d+$/) !== null, async route => {
    const id = new URL(route.request().url()).pathname.split("/").pop()!;
    if (route.request().method() !== "DELETE") throw new Error(`Unexpected QC image request ${route.request().method()}`);
    importedIds.delete(id);
    if (coverId === id) { coverId = imported()[0] ?? null; coverRevision++; }
    return response(route, { status: "deleted" });
  });
  await mockQcMedia(page);
  await page.goto(`/packages/${purchase.trackingId}`);
  await expect(page.getByRole("button", { name: /Produtos e custos/ })).toHaveAttribute("aria-expanded", "true");
  const json = { code: 0, data: { count: 1, list: [{ orderNo: "QC-E2E-REIMPORT", goodsList: [{ orderGoodsId: "QC-GOODS-REIMPORT", offerUrl: "https://weidian.com/item.html?itemID=987654321", skuInfo: "Blue / 40", goodsName: "QC Marker Product", quantity: 1, freePhotos: ["https://scm.hubbuy.app/a", "https://scm.hubbuy.app/b", "https://scm.hubbuy.app/c", "https://scm.hubbuy.app/d"] }] }] } };
  const confirmImport = async () => {
    await page.getByRole("button", { name: "Importar QC", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("JSON HubBuy").fill(JSON.stringify(json));
    await dialog.getByRole("button", { name: "Analisar JSON" }).click();
    await dialog.getByRole("button", { name: "Confirmar vínculos" }).click();
    await expect(dialog.getByRole("status")).toContainText("Importação concluída");
    await dialog.getByRole("button", { name: "Fechar" }).click();
  };
  await confirmImport();
  expect(prepareCount).toBe(1);
  expect(confirmCount).toBe(1);
  expect(batches).toBe(4);
  await page.locator(".qc-product-photos-desktop:visible").getByRole("button", { name: /^Ver \d+ fotos QC de QC Marker Product$/ }).click();
  await expect(page.locator(".qc-viewer-thumb")).toHaveCount(4);
  for (let index = 0; index < 4; index++) {
    await page.getByRole("button", { name: "Excluir foto QC" }).click();
    const confirm = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Excluir foto QC?" }) });
    await confirm.getByRole("button", { name: "Excluir foto" }).click();
    if (index < 3) await expect(page.locator(".qc-viewer-toolbar")).toContainText(`de ${3 - index}`);
  }
  expect(imported()).toHaveLength(0);
  // The cost photo strip unmounts its viewer when no photos remain.
  await expect(page.locator(".qc-viewer-surface")).toContainText("Nenhuma foto QC disponível");
  await page.keyboard.press("Escape");

  await confirmImport();
  expect(prepareCount).toBe(2);
  expect(confirmCount).toBe(2);
  expect(lastRestoreCount).toBe(4);
  expect(batches).toBe(4);
  await expect(page.locator(".qc-product-photos-desktop:visible").getByRole("button", { name: /^Ver \d+ fotos QC de QC Marker Product$/ })).toHaveText("Ver mais");
  await page.locator(".qc-product-photos-desktop:visible").getByRole("button", { name: /^Ver \d+ fotos QC de QC Marker Product$/ }).click();
  await expect(page.locator(".qc-viewer-thumb")).toHaveCount(4);
});
