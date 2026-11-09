import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { landingTools, toolHref } from "../../src/components/landing/landing-tools";

const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");

const SECTION_IDS = [
  "#d-hero",
  "#d-rail",
  "#d-story",
  "#d-favorites",
  "#d-purchases",
  "#d-cost",
  "#d-people",
  "#d-tools",
  "#d-faq",
  "#d-ending",
] as const;

for (const width of [320, 390, 768, 1024, 1440, 1920]) {
  test(`responsive, theme and accessible content at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
    await page.addInitScript(() => localStorage.setItem("loti.theme", "dark"));
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/")) failures.push(`Private API: ${request.url()}`);
    });
    await page.goto("/landing");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toContainText("Do favorito ao pacote.");
    await expect(page.locator("h1")).toContainText("Tudo no lugar.");

    // Skip link keyboard navigation focuses main (#variant-d)
    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Pular para o conteúdo" });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toHaveAttribute("href", "#variant-d");
    await skipLink.press("Enter");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("variant-d");

    // Brand logo uses Bookmark icon + Loti across header, favorites demo and footer
    await expect(page.locator('header a[href="#d-hero"] svg')).toBeVisible();
    await expect(page.locator('header a[href="#d-hero"]')).toContainText("Loti");

    // Internal navigation anchors: visible on desktop/tablet (>700px) and hidden on mobile (<=700px) to keep mobile header clean
    for (const target of ["#d-story", "#d-tools", "#d-people"]) {
      if (width > 700) {
        await expect(page.locator(`header a[href="${target}"]`)).toBeVisible();
      } else {
        await expect(page.locator(`header a[href="${target}"]`)).toBeHidden();
      }
    }

    // Dynamic island behavior on scroll: full-width at hero top -> compact island on scroll
    const headerDock = page.locator("header[data-scrolled]");
    const navBefore = await page.locator("header nav").boundingBox();
    await expect(headerDock).toHaveAttribute("data-scrolled", "false");
    await page.evaluate(() => window.scrollTo(0, 240));
    await expect.poll(() => headerDock.getAttribute("data-scrolled")).toBe("true");
    await page.waitForTimeout(600);
    const navAfter = await page.locator("header nav").boundingBox();
    expect(Math.round(navAfter!.width)).toBeLessThanOrEqual(Math.round(navBefore!.width));
    if (width >= 1024) {
      expect(Math.round(navAfter!.width)).toBeLessThan(Math.round(navBefore!.width));
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => headerDock.getAttribute("data-scrolled")).toBe("false");

    // Metadata & section structure
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    for (const id of SECTION_IDS) {
      await expect(page.locator(id)).toHaveCount(1);
    }

    // Semantic footer landmark exists in closing section
    await expect(page.locator("#d-ending footer")).toHaveCount(1);

    // Internal anchor links resolve to existing sections
    for (const anchor of await page.locator('a[href^="#"]').all()) {
      await expect(page.locator((await anchor.getAttribute("href"))!)).toHaveCount(1);
    }

    // Header includes Login (/login) and all 3 primary CTAs connect to real /signup route
    const loginLink = page.locator('header a[href="/login"]');
    await expect(loginLink).toBeVisible();
    await expect(loginLink).toHaveText("Entrar");

    const signupLinks = page.locator('a[href="/signup"]');
    await expect(signupLinks).toHaveCount(3);
    for (const cta of await signupLinks.all()) {
      await expect(cta).toContainText("Criar conta grátis");
    }

    // Public tools section highlights Reference Table and lists 4 Em breve tools without invented numbers
    await expect(page.locator("#d-tools")).toContainText("EM BREVE · TABELA DE REFERÊNCIAS");
    await expect(page.locator("#d-tools")).toContainText("Um lugar para consultar");
    await expect(page.locator("#d-tools")).toContainText("— USD");
    await expect(page.locator("#d-tools")).toContainText("Calculadora de custo final");
    await expect(page.locator("#d-tools")).toContainText("Calculadora de impostos");
    await expect(page.locator("#d-tools")).toContainText("Conversor de moedas");
    await expect(page.locator("#d-tools")).toContainText("Calculadora de rateio");

    // Zero horizontal overflow
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);

    // App theme isolation
    expect(await page.evaluate(() => localStorage.getItem("loti.theme"))).toBe("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // Reduced motion reveals all [data-reveal] elements immediately
    expect(
      await page
        .locator("[data-reveal]")
        .evaluateAll((els) => els.every((el) => getComputedStyle(el).opacity === "1"))
    ).toBe(true);

    // Full WCAG 2.0/2.1/2.2 A & AA accessibility audit INCLUDING color-contrast
    await page.addScriptTag({ path: axePath });
    const violations = await page.evaluate(async () => {
      const engine = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: unknown[] }> } })
        .axe;
      return (
        await engine.run({
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
        })
      ).violations;
    });
    expect(violations).toEqual([]);
    expect(failures).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`landing-${width}.png`), fullPage: true });
  });
}

test("interactive demos: Favorites click/keyboard/drag-and-drop validation and Purchase stages 1/2/3 stability", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
  });

  await page.goto("/landing");

  // 1. Foreign drop payload is rejected without adding favorite
  const dragSource = page.locator("#d-drag-source");
  const newFav = page.locator("#d-new-fav");
  const dropTarget = page.locator("#d-drop-target");

  await expect(newFav).toBeHidden();
  await expect(dropTarget).toContainText("+ Solte aqui para salvar um favorito");

  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "foreign-payload");
    document.getElementById("d-drop-target")?.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: dt }));
  });
  await expect(newFav).toBeHidden();

  // 2. Scroll to Favorites at 390x844 and activate via keyboard/click: confirmation visible in same viewport & 0px shift on next section
  await dragSource.scrollIntoViewIfNeeded();
  const purchasesTopBefore = await page.locator("#d-purchases").evaluate((el) => el.getBoundingClientRect().top);
  await dragSource.focus();
  await dragSource.press("Enter");

  await expect(newFav).toBeVisible();
  await expect(newFav).toContainText("Teclado mecânico");
  await expect(newFav).toContainText("Você · HubBuy");
  await expect(dropTarget).toContainText("✓ Teclado adicionado aos seus favoritos!");
  await expect(dragSource).toHaveAttribute("aria-label", "Teclado fictício já adicionado à demonstração");
  await expect(dragSource).toContainText("Salvo na demonstração");

  const dropBox = await dropTarget.boundingBox();
  expect(dropBox!.y + dropBox!.height).toBeLessThanOrEqual(844);
  const purchasesTopAfter = await page.locator("#d-purchases").evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.round(purchasesTopAfter)).toBe(Math.round(purchasesTopBefore));

  // 3. Purchase Current demo stages 1 / 2 / 3 with stable height at 390px
  const stage0 = page.locator('[data-d-stage="0"]');
  const stage1 = page.locator('[data-d-stage="1"]');
  const stage2 = page.locator('[data-d-stage="2"]');

  const costTopStage0 = await page.locator("#d-cost").evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  await expect(stage0).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#d-stage-title")).toHaveText("Tudo começa por um favorito.");
  await expect(page.locator("#d-stage-product")).toHaveText("Teclado mecânico");
  await expect(page.locator("#d-stage-price")).toHaveText("¥ 169");
  await expect(page.locator("#d-stage-result")).toHaveText("✓ Favorito salvo");

  await stage1.click();
  const costTopStage1 = await page.locator("#d-cost").evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  await expect(stage0).toHaveAttribute("aria-pressed", "false");
  await expect(stage1).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#d-stage-title")).toHaveText("Agora ele faz parte da compra.");
  await expect(page.locator("#d-stage-product")).toHaveText("Teclado · Compra atual");
  await expect(page.locator("#d-stage-price")).toHaveText("¥ 169");
  await expect(page.locator("#d-stage-result")).toHaveText("✓ Item incluído na compra fictícia");
  expect(Math.round(costTopStage1)).toBe(Math.round(costTopStage0));

  await stage2.click();
  const costTopStage2 = await page.locator("#d-cost").evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  await expect(stage1).toHaveAttribute("aria-pressed", "false");
  await expect(stage2).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#d-stage-title")).toHaveText("Cada valor tem um contexto.");
  await expect(page.locator("#d-stage-product")).toHaveText("Custo estimado · Teclado");
  await expect(page.locator("#d-stage-price")).toHaveText("R$ 228,60");
  await expect(page.locator("#d-stage-result")).toHaveText("✓ Custo demonstrativo por item");
  expect(Math.round(costTopStage2)).toBe(Math.round(costTopStage0));

  expect(apiRequests).toEqual([]);
});

test("FAQ keyboard, public construction destinations and metadata boundaries", async ({ page, request }) => {
  await page.goto("/landing", { waitUntil: "domcontentloaded" });
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
    await page.goto(toolHref(tool), { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toHaveText(tool.title);
    await expect(page.getByText("Em construção", { exact: true })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    await page.getByRole("link", { name: "Explorar outras ferramentas" }).click();
    await expect(page).toHaveURL(/\/ferramentas$/);
  }
  expect((await request.get("/ferramentas/inexistente")).status()).toBe(404);
  const root = await request.get("/", { maxRedirects: 0 });
  expect(root.status()).toBe(200);
  expect(await root.text()).toContain("Do favorito ao pacote.");
  const privateRoute = await request.get("/favorites", { maxRedirects: 0 });
  expect(privateRoute.headers().location).toBe("/login");
  const login = await request.get("/login");
  expect(await login.text()).not.toContain("social-card.png");
});

test("SSR/no-JS visibility, scroll reveal and prefers-reduced-motion behavior", async ({ browser, page }) => {
  // 1. Without JS, H1, CTAs and all [data-reveal] blocks are visible
  const noJsContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const noJsPage = await noJsContext.newPage();
  await noJsPage.goto("/landing", { waitUntil: "domcontentloaded" });
  expect(await noJsPage.locator("h1").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  expect(
    await noJsPage
      .locator("[data-reveal]")
      .evaluateAll((els) => els.filter((el) => getComputedStyle(el).opacity === "0").length)
  ).toBe(0);
  await noJsContext.close();

  // 2. With JS and normal motion, Hero is immediately visible and secondary sections reveal on scroll or focus
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/landing", { waitUntil: "domcontentloaded" });

  await expect.poll(() => page.locator("h1").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");

  const storyLead = page.locator("#d-story [data-reveal]").first();
  await storyLead.scrollIntoViewIfNeeded();
  await expect.poll(() => storyLead.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");

  // Switching to reduced motion reveals remaining sections immediately
  await page.emulateMedia({ reducedMotion: "reduce" });
  const faqBlock = page.locator("#d-faq [data-reveal]").first();
  await expect.poll(() => faqBlock.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
});
