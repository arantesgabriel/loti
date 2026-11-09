import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

test("legacy QA is navigable with exact anchors, private QC and responsive themes", async ({ page }) => {
  const path = resolve(process.env.LOTI_ORDERS_TRANSITION_DATABASE!.slice(5));
  const marker = JSON.parse(readFileSync(`${path}.scenario.json`, "utf8"));
  const externalRequests: string[] = [];
  page.on("request", request => { const url = new URL(request.url()); if (!["localhost", "127.0.0.1"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol)) externalRequests.push(url.hostname); });
  await page.goto("/login");
  await page.getByLabel("Email").fill("pessoa-a@loti.test");
  await page.getByLabel("Senha", { exact: true }).fill("Loti-Orders-QA-Only-2026!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/favorites/, { timeout: 60000 });
  const response = await page.request.get(`/api/packages/${marker.trackingId}`);
  expect(response.ok()).toBe(true);
  const data = (await response.json()).data;
  expect(data.calculation.summary).toMatchObject({ purchasedUnits: 41, cancelledUnits: 10, shippingUnits: 31, assignedUnits: 0, partialCents: 134623 });
  const warehouse=await page.request.get("/api/warehouse");
  expect(warehouse.ok()).toBe(true);
  const logistics=(await warehouse.json()).data;
  const later=(await (await page.request.get("/api/warehouse?page=1&pageSize=20")).json()).data;
  expect([...logistics.reservations,...later.reservations]).toHaveLength(26);
  expect(logistics.rows.every((row:{reviewState:string;receivedUnits:number[]})=>row.reviewState==="pending_review" && row.receivedUnits.length===0)).toBe(true);
  await page.goto(`/packages/${marker.trackingId}`);
  await expect(page.getByRole("heading", { name: "Compra QA original" })).toBeVisible();
  const screenshots = resolve("artifacts/qa/orders-transition");
  mkdirSync(screenshots, { recursive: true });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `${screenshots}/legacy-${theme}-${width}.png`, fullPage: false });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const qc = page.getByRole("button", { name: "Abrir capa QC de Polo QA", exact: true }).filter({ visible: true });
  await expect(qc).toBeVisible({ timeout: 30000 });
  await qc.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".qc-viewer-photo img")).toBeVisible({ timeout: 30000 });
  await expect.poll(() => page.locator(".qc-viewer-photo img").evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(360);
  await page.screenshot({ path: `${screenshots}/legacy-qc.png` });
  await page.keyboard.press("Escape");
  await page.goto("/packages/accounts");
  await expect(page.getByRole("heading", { name: "Conta QA", exact: true })).toBeVisible();
  await expect(page.locator(".hubbuy-balance-brl")).toContainText("288,68");
  await page.screenshot({ path: `${screenshots}/legacy-balance.png` });
  expect(externalRequests).toEqual([]);
});
