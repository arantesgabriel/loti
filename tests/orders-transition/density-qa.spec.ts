import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { WarehouseData } from "@/components/orders/orders-screen";

// Same deterministic 20-row presentation fixture before and after. Financial
// values and mixed unit states come from the real isolated workflow reader.
// This test never sends mutations for the cloned presentation-only identities.
test("compares 20 complete orders at 1440x900", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const origin = process.env.LOTI_ORDERS_TRANSITION_BASE_URL ?? "http://localhost:3139";
  expect((await page.request.post("/api/auth/sign-in/email", {
    headers: { Origin: origin },
    data: { email: "pessoa-a@loti.test", password: "Loti-Orders-QA-Only-2026!" },
  })).ok()).toBe(true);
  const original = (await (await page.request.get("/api/warehouse?pageSize=20")).json()).data as WarehouseData;
  const rows = Array.from({ length: 20 }, (_, index) => ({
    ...original.rows[index % original.rows.length],
    costItemId: `density-${index}`,
    name: `${original.rows[index % original.rows.length].name} ${index + 1}`,
  }));
  await page.route("**/api/warehouse?**", route => route.fulfill({ json: {
    data: { ...original, rows, pagination: { page: 0, pageSize: 20, total: 20, hasMore: false } },
  } }));
  await page.goto("/orders");
  await expect(page.locator(".orders-row")).toHaveCount(20);
  await page.evaluate(() => document.fonts.ready);
  const metrics = await page.locator(".orders-row").evaluateAll(elements => ({
    completeVisible: elements.filter(el => { const rect = el.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= 900; }).length,
    heights: elements.map(el => Math.round(el.getBoundingClientRect().height)),
    firstTop: Math.round(elements[0].getBoundingClientRect().top),
  }));
  const dir = "artifacts/qa/orders-transition";
  mkdirSync(dir, { recursive: true });
  const phase = process.env.LOTI_DENSITY_BASELINE === "1" ? "before" : "after";
  await page.screenshot({ path: `${dir}/density-${phase}-1440.png` });
  writeFileSync(`${dir}/density-${phase}.json`, JSON.stringify({ ...metrics, fixture: rows }, null, 2));
  if (phase === "after") {
    const baseline = JSON.parse(readFileSync(`${dir}/density-before.json`, "utf8"));
    // IDs differ between independent fixture databases; compare the same saved payload.
    expect(rows).toEqual(baseline.fixture);
    expect(metrics.completeVisible).toBeGreaterThanOrEqual(baseline.completeVisible * 2);
    expect(metrics.completeVisible).toBeGreaterThanOrEqual(5);
    await expect(page.getByRole("columnheader", { name: "Compradas", exact: true })).toBeVisible();
  }
});
