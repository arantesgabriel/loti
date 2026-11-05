import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const before = process.env.LOTI_R1_CAPTURE_BEFORE === "1";
const evidence = process.env.LOTI_ORDERS_EVIDENCE ?? "artifacts/qa/orders-retomada-f4/regression";
let auth: Awaited<ReturnType<BrowserContext["storageState"]>>;

test.beforeAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  const response = await context.request.post(`${baseURL}/api/auth/sign-in/email`, {
    headers: { Origin: baseURL! },
    data: { email: "pessoa-a@loti.test", password: "Loti-Orders-QA-Only-2026!" },
  });
  expect(response.ok()).toBe(true);
  auth = await context.storageState();
  await context.close();
});

test.beforeEach(async ({ context }) => { await context.addCookies(auth.cookies); });

async function identity(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  return page.getByRole("heading", { level: 1 }).evaluate(element => {
    const style = getComputedStyle(element);
    return { font: style.fontFamily, size: style.fontSize, weight: style.fontWeight, color: style.color };
  });
}

for (const [width, height] of [[320, 700], [360, 800], [390, 844], [430, 932], [768, 1024], [1024, 768], [1280, 800], [1500, 930], [1920, 1080]]) {
  test(`shared identity and shell at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    const fontRequests: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => { if (/inter-tight/i.test(request.url())) fontRequests.push(request.url()); });
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const theme of ["light", "dark"]) {
      await page.goto("/favorites");
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      const favorite = await identity(page);
      const sharedShell = await page.locator(width < 768 ? ".mobile-header" : ".sidebar").evaluate(element => ({ font: getComputedStyle(element).fontFamily, background: getComputedStyle(element).backgroundColor, width: element.getBoundingClientRect().width }));
      await page.screenshot({ path: `${evidence}/favorites-${theme}-${width}.png` });
      await page.goto("/purchase");
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      const purchase = await identity(page);
      expect(purchase).toEqual(favorite);
      await page.screenshot({ path: `${evidence}/purchase-${theme}-${width}.png` });
      await page.goto("/orders?search=Seis%20exemplos");
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await expect(page.locator(".orders-catalog-row")).toHaveCount(6);
      const orders = await identity(page);
      const shell = await page.locator(width < 768 ? ".mobile-header" : ".sidebar").evaluate(element => ({ font: getComputedStyle(element).fontFamily, background: getComputedStyle(element).backgroundColor, width: element.getBoundingClientRect().width }));
      expect(shell).toEqual(sharedShell);
      if (!before) {
        expect(orders).toEqual(favorite);
        expect(orders.font.toLowerCase()).toContain("geist");
        expect(fontRequests).toEqual([]);
        expect(await page.locator(".orders-workspace").evaluate(element => getComputedStyle(element).backgroundColor)).toBe(await page.locator("body").evaluate(element => getComputedStyle(element).backgroundColor));
        expect(await page.getByRole("searchbox").evaluate(element => getComputedStyle(element).borderRadius)).toBe("10px");
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `${evidence}/orders-${theme}-${width}.png` });
      const tableWidth = (await page.locator(".orders-catalog-table").boundingBox())!.width;
      const url = page.url();
      const trigger = page.getByRole("button", { name: "Detalhes de JBL Flip 6", exact: true });
      await trigger.click();
      const panel = page.locator(width < 1200 ? ".orders-bottom-sheet" : ".orders-desktop-panel");
      await expect(panel).toBeVisible();
      if (!before) expect(await panel.evaluate(element => getComputedStyle(element).fontFamily)).toBe(orders.font);
      const bounds = (await panel.boundingBox())!;
      if (width < 1200) {
        expect(Math.round(bounds.x)).toBe(0);
        expect(Math.round(bounds.width)).toBe(width);
        expect(Math.round(bounds.y + bounds.height)).toBe(height);
      } else {
        expect(Math.round(bounds.width)).toBe(390);
        expect((await page.locator(".orders-catalog-table").boundingBox())!.width).toBeLessThan(tableWidth - 380);
      }
      await page.screenshot({ path: `${evidence}/detail-${theme}-${width}.png` });
      await page.keyboard.press("Escape");
      await expect(page.locator(".orders-item-detail")).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(page.url()).toBe(url);
      expect((await page.locator(".orders-catalog-table").boundingBox())!.width).toBeCloseTo(tableWidth, 0);
    }
    expect(errors).toEqual([]);
  });
}
