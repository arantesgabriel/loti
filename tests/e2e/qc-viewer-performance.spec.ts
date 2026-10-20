import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { login } from "./helpers";

test("private QC previews reuse warm bytes and load only visible presentations", async ({ page, request }) => {
  test.skip(process.env.LOTI_E2E_QC_VIEWER !== "1", "Requires the opt-in disposable S3 fixture");
  test.setTimeout(180000);
  const baseline = process.env.LOTI_QC_VIEWER_BASELINE === "1";
  const fixture = await (await request.get("http://localhost:3102/fixture")).json();
  await login(page);
  const rounds: unknown[] = [];
  for (let round = 0; round < 5; round++) {
    await page.goto("/favorites");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.clearBrowserCache");
    await cdp.detach();
    await request.post("http://localhost:3102/reset");
    const calls = { summary: 0, presentation: 0, gallery: 0, preview: 0 };
    const previews: string[] = [];
    const count = (req: import("@playwright/test").Request) => {
      const url = new URL(req.url());
      if (url.pathname.endsWith("/preview")) { calls.preview++; previews.push(url.pathname); }
      if (url.pathname === `/api/purchases/${fixture.purchaseId}/qc`) {
        if (url.searchParams.has("itemIds")) calls.presentation++;
        else if (url.searchParams.has("itemId")) calls.gallery++;
        else calls.summary++;
      }
    };
    page.on("request", count);
    const start = Date.now();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/packages/${fixture.trackingId}`);
    const cover = page.locator('.qc-product-cover[data-qc-image-id="qc-perf-image-0-13"]:visible img');
    await expect(cover).toBeVisible();
    const firstCoverMs = Date.now() - start;
    await page.waitForLoadState("networkidle");
    const cold = await (await request.get("http://localhost:3102/fixture")).json();
    const coldCalls = { ...calls }, coldMs = Date.now() - start;
    const toggle = page.getByRole("button", { name: /Produtos e custos/ });
    const warmStart = Date.now();
    for (let cycle = 0; cycle < 5; cycle++) {
      if (baseline) await request.post("http://localhost:3102/limits");
      await toggle.click(); await toggle.click();
      await expect(cover).toBeVisible();
    }
    await page.waitForLoadState("networkidle");
    const warmMs = Date.now() - warmStart, warm = await (await request.get("http://localhost:3102/fixture")).json();
    const warmRepeatedPreviews = previews.length - new Set(previews).size;
    if (!baseline) {
      expect(warmRepeatedPreviews).toBe(0);
      expect(calls.gallery).toBe(0);
      expect(cold.gets).toBeLessThan(84);
    }
    await request.post("http://localhost:3102/reset");
    const reloadStart = Date.now();
    await page.reload(); await expect(cover).toBeVisible(); await page.waitForLoadState("networkidle");
    const reload = await (await request.get("http://localhost:3102/fixture")).json();
    if (!baseline) expect(reload.gets).toBe(0);
    rounds.push({ firstCoverMs, coldMs, coldCalls, coldGets: cold.gets, coldBytes: cold.transferredBytes, warmMs, warmExtraGets: warm.gets - cold.gets, warmRepeatedPreviews, reloadMs: Date.now() - reloadStart, reloadGets: reload.gets, reloadBytes: reload.transferredBytes });
    page.off("request", count);
  }
  mkdirSync("artifacts/qa/qc-viewer-performance", { recursive: true });
  writeFileSync(`artifacts/qa/qc-viewer-performance/${baseline ? "baseline" : "optimized"}.json`, JSON.stringify(rounds, null, 2));
  if (!baseline) {
    const additional = page.locator('.qc-product-cover[data-qc-image-id="qc-perf-image-25-3"]:visible');
    await additional.scrollIntoViewIfNeeded(); await expect(additional.locator("img")).toBeVisible();
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page.locator('.qc-product-cover[data-qc-image-id="qc-perf-image-0-13"]:visible img')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: `artifacts/qa/qc-viewer-performance/${width}.png` });
    }
  }
});

test("cached previews still deny tombstones and expired sessions over real HTTP", async ({ page, request }) => {
  test.skip(process.env.LOTI_E2E_QC_VIEWER !== "1" || process.env.LOTI_QC_VIEWER_BASELINE === "1", "Requires optimized disposable QC fixture");
  const fixture = await (await request.get("http://localhost:3102/fixture")).json();
  await login(page);
  const url = "/api/qc/images/qc-perf-image-0-13/preview";
  const first = await page.request.get(url);
  expect(first.status()).toBe(200);
  const etag = first.headers().etag;
  expect(first.headers()["cache-control"]).toBe("private, no-cache");
  await request.post("http://localhost:3102/reset");
  const conditional = await page.request.get(url, { headers: { "If-None-Match": etag } });
  expect(conditional.status()).toBe(304);
  expect((await (await request.get("http://localhost:3102/fixture")).json()).gets).toBe(0);
  const deleted = await page.request.delete("/api/qc/images/qc-perf-image-0-13", { headers: { Origin: "http://localhost:3100" } });
  expect(deleted.ok()).toBe(true);
  const tombstone = await page.request.get(url, { headers: { "If-None-Match": etag } });
  expect(tombstone.status()).toBe(404); expect(tombstone.headers()["cache-control"]).toBe("private, no-store");
  await page.goto(`/packages/${fixture.trackingId}`);
  await expect(page.locator('.qc-product-cover[data-qc-image-id="qc-perf-image-0-13"]')).toHaveCount(0);
  await page.context().clearCookies();
  const expired = await page.request.get("/api/qc/images/qc-perf-image-0-0/preview", { headers: { "If-None-Match": "*" } });
  expect(expired.status()).toBe(401); expect(expired.headers()["cache-control"]).toBe("private, no-store");
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator(".qc-product-cover")).toHaveCount(0);
});
