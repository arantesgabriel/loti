import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import type { WarehouseData } from "@/components/orders/orders-screen";

test("compares unit columns, contextual destinations, selection and keyboard disclosure", async ({ page }) => {
  const origin = process.env.LOTI_ORDERS_TRANSITION_BASE_URL ?? "http://localhost:3139";
  expect((await page.request.post("/api/auth/sign-in/email", {
    headers: { Origin: origin }, data: { email: "pessoa-a@loti.test", password: "Loti-Orders-QA-Only-2026!" },
  })).ok()).toBe(true);
  const before = (await (await page.request.get("/api/warehouse?pageSize=100")).json()).data as WarehouseData;
  const row = before.rows.find(item => item.receivedUnits.length && item.reservations.length && item.availableUnits.length);
  test.skip(!row, "Needs the untouched workflow fixture with mixed physical states");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/orders?search=${encodeURIComponent(row!.name)}`);
  const item = page.locator(".orders-table-row").filter({ hasText: row!.name });
  await expect(item.locator(".orders-unit-cell")).toHaveText([
    String(row!.quantity), String(row!.receivedUnits.length), String(row!.availableUnits.length), String(row!.reservations.length),
  ]);
  await expect(item.locator(".orders-payment")).toHaveText(row!.paymentStatus === "paid" ? "Produtos pagos" : "Não confirmado");
  await expect(item.locator(".orders-qc")).toContainText("Sem fotos QC");
  const select = item.getByRole("spinbutton");
  await expect(select).toHaveAttribute("max", String(row!.availableUnits.length));
  await select.fill("999");
  await expect(select).toHaveValue(String(row!.availableUnits.length));
  const disclosure = item.getByRole("button", { name: `Detalhes de ${row!.name}` });
  await disclosure.focus();
  await page.keyboard.press("Enter");
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  const details = page.locator(`#order-details-${row!.costItemId}`);
  await expect(details).toContainText(`${row!.cancelledUnits.length} canceladas`);
  for (const id of new Set(row!.reservations.map(reservation => reservation.packageId))) {
    const count = row!.reservations.filter(reservation => reservation.packageId === id).length;
    const link = details.locator(`a[href="/packages/detail/${id}"]`);
    await expect(link).toContainText(`${count} ${count === 1 ? "unidade" : "unidades"}`);
    await expect(link).toContainText(before.packages.find(pkg => pkg.id === id)!.name);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(details.locator(".orders-row-details")).toHaveCSS("animation-name", "none");
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const control of await item.locator("button,input").all()) {
      const rect = await control.boundingBox();
      expect(rect!.height).toBeGreaterThanOrEqual(44);
      expect(rect!.x).toBeGreaterThanOrEqual(0);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
  await disclosure.focus();
  await page.keyboard.press("Enter");
  await expect(details).toBeHidden();
  await expect(disclosure).toBeFocused();
  const after = (await (await page.request.get("/api/warehouse?pageSize=100")).json()).data as WarehouseData;
  expect(after).toEqual(before);
});

test("QC presentation endpoints and gallery preserve arrival and financial values", async ({ page }) => {
  const origin = process.env.LOTI_ORDERS_TRANSITION_BASE_URL ?? "http://localhost:3139";
  expect((await page.request.post("/api/auth/sign-in/email", {
    headers: { Origin: origin }, data: { email: "pessoa-a@loti.test", password: "Loti-Orders-QA-Only-2026!" },
  })).ok()).toBe(true);
  const before = (await (await page.request.get("/api/warehouse?pageSize=100")).json()).data as WarehouseData;
  const results: Array<{ purchaseId: string; targets: string[]; status: number }> = [];
  for (const source of before.origins) {
    const rows = before.rows.filter(row => row.cost.trackingId === source.trackingId);
    for (let index = 0; index < rows.length; index += 20) {
      const targets = rows.slice(index, index + 20).map(row => row.cost.purchaseItemId ? `purchase:${row.cost.purchaseItemId}` : `additional:${row.cost.additionalOrderItemId}`);
      const response = await page.request.get(`/api/purchases/${source.purchaseId}/qc?${new URLSearchParams({ itemIds: targets.join(",") })}`);
      results.push({ purchaseId: source.purchaseId, targets, status: response.status() });
      expect(response.status(), await response.text()).toBe(200);
      const items = (await response.json()).data.items as Array<{ itemId: string; qcCount: number }>;
      expect(items.map(item => item.qcCount)).toEqual(rows.slice(index, index + 20).map(row => row.qcCount));
    }
  }
  const photoRow = before.rows.find(row => row.qcCount > 0);
  if (photoRow) {
    mkdirSync("artifacts/qa/orders-transition", { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/orders?search=${encodeURIComponent(photoRow.name)}`);
    const row = page.locator(".orders-table-row").filter({ hasText: photoRow.name });
    await expect(row.locator(".orders-qc")).toContainText(`(${photoRow.qcCount})`);
    await expect(row.locator("img")).toHaveCount(0);
    await row.locator(".orders-qc button").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`Foto 1 de ${photoRow.qcCount}`, { exact: true })).toBeVisible();
    await expect(dialog.locator(".qc-viewer-photo img")).toBeVisible();
    await expect.poll(() => dialog.locator(".qc-viewer-photo img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.screenshot({ path: "artifacts/qa/orders-transition/residual-qc-gallery-light-1440.png" });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(row.locator(".orders-qc button")).toBeFocused();
    await page.goto("/orders");
    await expect(page.locator(".orders-list")).toHaveAttribute("aria-busy", "false");
    await page.screenshot({ path: "artifacts/qa/orders-transition/residual-legacy-orders-light-1440.png" });
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "artifacts/qa/orders-transition/residual-legacy-orders-dark-320.png" });
  }
  const after = (await (await page.request.get("/api/warehouse?pageSize=100")).json()).data as WarehouseData;
  expect(after).toEqual(before);
  mkdirSync("artifacts/qa/orders-transition", { recursive: true });
  writeFileSync(`artifacts/qa/orders-transition/qc-http-${photoRow ? "photos" : "empty"}.json`, JSON.stringify({ results, galleryOpened: !!photoRow, warehouseUnchanged: true }, null, 2));
});
