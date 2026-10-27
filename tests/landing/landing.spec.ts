import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { landingTools, toolHref } from "../../src/components/landing/landing-tools";

const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`responsive, theme and accessible content at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
    await page.addInitScript(() => localStorage.setItem("loti.theme", "dark"));
    const failures: string[] = [];
    page.on("pageerror", error => failures.push(error.message));
    page.on("request", request => {
      if (new URL(request.url()).pathname.startsWith("/api/")) failures.push(`Private API: ${request.url()}`);
    });
    await page.goto("/landing", { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toHaveCount(1);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    expect(await page.locator("[data-journey-stage]").evaluateAll(elements => elements.map(el => (el as HTMLElement).dataset.journeyStage))).toEqual(["favorites", "purchase", "costs"]);
    for (const image of await page.locator("main img").all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate((el: HTMLImageElement) => el.decode());
      expect(await image.getAttribute("alt")).toBeTruthy();
      expect(await image.evaluate((el: HTMLImageElement) => Math.abs(el.getBoundingClientRect().width / el.getBoundingClientRect().height - el.naturalWidth / el.naturalHeight))).toBeLessThan(.005);
    }
    for (const anchor of await page.locator('a[href^="#"]').all()) {
      await expect(page.locator((await anchor.getAttribute("href"))!)).toHaveCount(1);
    }
    for (const tool of landingTools) await expect(page.locator(`#ferramentas a[href="${toolHref(tool)}"]`)).toContainText(tool.title);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem("loti.theme"))).toBe("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await page.locator("[data-favorites-transformation]").getAttribute("data-motion")).toBeNull();
    await page.addScriptTag({ path: axePath });
    const violations = await page.evaluate(async () => {
      const engine = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: unknown[] }> } }).axe;
      return (await engine.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations;
    });
    expect(violations).toEqual([]);
    expect(failures).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`landing-${width}.png`), fullPage: true });
  });
}

test("FAQ keyboard, public construction destinations and metadata boundaries", async ({ page, request }) => {
  await page.goto("/landing");
  await expect(page).toHaveTitle("Loti | Organize favoritos, compras e custos de importação");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://useloti.com/landing");
  for (const detail of await page.locator("details").all()) {
    await detail.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(detail).toHaveAttribute("open", "");
    await page.keyboard.press("Space");
    await expect(detail).not.toHaveAttribute("open");
  }
  for (const tool of landingTools) {
    await page.goto(toolHref(tool));
    await expect(page.locator("h1")).toHaveText(tool.title);
    await expect(page.getByText("Em construção", { exact: true })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    await page.getByRole("link", { name: "Explorar outras ferramentas" }).click();
    await expect(page).toHaveURL(/\/ferramentas$/);
  }
  expect((await request.get("/ferramentas/inexistente")).status()).toBe(404);
  const root = await request.get("/", { maxRedirects: 0 });
  expect(root.headers().location).toBe("/favorites");
  const privateRoute = await request.get("/favorites", { maxRedirects: 0 });
  expect(privateRoute.headers().location).toBe("/login");
  const login = await request.get("/login");
  expect(await login.text()).not.toContain("social-card.png");
});

test("scroll is reversible and live reduced motion replaces spatial movement", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/landing");
  const scene = page.locator("[data-favorites-transformation]");
  await scene.locator("img").evaluate((el: HTMLImageElement) => el.decode());
  const move = async (progress: number) => {
    await scene.evaluate((el, p) => scrollTo(0, el.getBoundingClientRect().top + scrollY - innerHeight * .55 + innerHeight * .4 * p), progress);
    await expect(scene).toHaveAttribute("data-motion", "active");
    // Scroll/rAF updates are asynchronous; wait for the requested geometry.
    await expect.poll(() => scene.evaluate(el => el.getAttribute("data-stage"))).toBe(progress === 0 ? "S0" : progress === 1 ? "S3" : "S1");
    return scene.evaluate(el => Array.from(el.querySelectorAll("span")).map(label => getComputedStyle(label).transform));
  };
  const start = await move(0);
  const middle = await move(.3);
  await move(1);
  expect(await move(.3)).toEqual(middle);
  expect(await move(0)).toEqual(start);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(scene).not.toHaveAttribute("data-motion");
  expect(await scene.locator("span").evaluateAll(elements => elements.every(el => getComputedStyle(el).transform === "none"))).toBe(true);
});

test("essential content and tool navigation work without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto("/landing");
    await expect(page.locator("h1")).toBeVisible();
    await page.locator("summary").first().click();
    await expect(page.locator("details").first()).toHaveAttribute("open", "");
    await page.locator("#ferramentas li a").first().click();
    await expect(page.getByText("Em construção", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Explorar outras ferramentas" }).click();
    await expect(page).toHaveURL(/\/ferramentas$/);
  } finally { await context.close(); }
});
