import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("HubBuy QC import is session-bound, manually confirmable and responsive", async ({ page }) => {
  await login(page);
  const origin = "http://localhost:3100";
  const created = await page.request.post("/api/app", { headers: { Origin: origin }, data: { operation: "purchase.save", input: { name: "QC HubBuy E2E" } } });
  expect(created.ok()).toBeTruthy();
  const purchaseData = await created.json();
  const purchase = purchaseData.result as { id: string };
  const personId = purchaseData.data.currentUser.id as string;
  const itemResponse = await page.request.post("/api/app", { headers: { Origin: origin }, data: { operation: "item.save", input: { name: "QC Marker Product", url: "https://weidian.com/item.html?itemID=987654321", personId, variant: "Blue / 40", quantity: 1, unitPriceCents: 2500 } } });
  expect(itemResponse.ok()).toBeTruthy();
  expect((await page.request.post("/api/app", { headers: { Origin: origin }, data: { operation: "purchase.finalize", id: purchase.id, input: true } })).ok()).toBeTruthy();
  const packages = (await (await page.request.get("/api/packages")).json()).data as { tracking: { id: string }; purchase: { id: string } }[];
  const tracking = packages.find(row => row.purchase.id === purchase.id)?.tracking;
  expect(tracking).toBeTruthy();
  await page.goto(`/packages/${tracking!.id}`);

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
  await expect(dialog.getByRole("status")).toContainText("1 associada(s)");
  await expect(dialog.getByRole("status")).toContainText("0 fonte(s) de foto");
  await dialog.getByRole("button", { name: "Processar próximo lote" }).click();
  await expect(dialog.getByRole("status")).toContainText("0 enviada(s), 0 já existente(s), 0 falha(s), 0 pendente(s)");
  expect((await page.request.get(`/api/purchases/${purchase.id}/qc`)).ok()).toBeTruthy();
});
