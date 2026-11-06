import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";
import {
  ENEBINHA_BRAND_REFERENCES,
  ENEBINHA_COMMUNITY,
  ENEBINHA_GUIDES,
  ENEBINHA_HUBBUY,
  ENEBINHA_MASCOT,
  ENEBINHA_MARQUEE_PRIORITY_IDS,
  ENEBINHA_SUPPLIERS,
  ENEBINHA_VITRINE,
} from "../../src/lib/enebinha/manifest";

const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");
const qaDir = path.resolve(process.cwd(), "artifacts/qa/enebinha");

test.describe("Public /enebinha curation page (V2.1 + D7)", () => {
  test.describe.configure({ timeout: 90_000 });
  test("renders public page without auth, preserves all 89 links, 20 reference brands, mascot, and D7 marquee", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: "light" });
    await page.goto("/enebinha", { waitUntil: "domcontentloaded" });

    // 1. Header & Theme switch
    await expect(page.getByTestId("enebinha-header")).toBeVisible();
    await expect(page.getByTestId("enebinha-loti-brand")).toContainText("Loti");
    await expect(page.getByTestId("enebinha-share-btn")).toBeVisible();
    await expect(page.getByTestId("enebinha-loti-cta")).toHaveAttribute("href", "/landing");

    // 2. Hero & Untouchable Mascot
    await expect(page.locator("h1")).toHaveText("ENEBINHA");
    await expect(page.getByTestId("enebinha-hero")).toContainText("CURADORIA DE IMPORTAÇÃO");
    await expect(page.getByTestId("enebinha-hero")).toContainText("@enebinha");

    const mascotImg = page.getByTestId("enebinha-mascot-img");
    await expect(mascotImg).toBeVisible();
    await expect(mascotImg).toHaveAttribute("src", ENEBINHA_MASCOT.publicPath);
    const mascotMetrics = await mascotImg.evaluate((el: HTMLImageElement) => {
      const style = window.getComputedStyle(el);
      return {
        naturalWidth: el.naturalWidth,
        naturalHeight: el.naturalHeight,
        objectFit: style.objectFit,
        filter: style.filter,
      };
    });
    expect(mascotMetrics.naturalWidth).toBe(780);
    expect(mascotMetrics.naturalHeight).toBe(355);
    expect(mascotMetrics.objectFit).toBe("contain");
    expect(mascotMetrics.filter).toBe("none");

    // 3. D7 Supplier Marquee
    const marquee = page.getByTestId("supplier-marquee");
    await expect(marquee).toBeVisible();
    await expect(marquee).toContainText("FORNECEDORES");
    const primarySequence = page.getByTestId("supplier-marquee-primary-sequence");
    const marqueeItems = primarySequence.locator('[data-testid^="marquee-supplier-"]');
    await expect(marqueeItems).toHaveCount(73);

    // Check first 12 items match storyboard priority
    const first12Ids = await marqueeItems.evaluateAll((els) =>
      els.slice(0, 12).map((el) => el.getAttribute("data-supplier-id"))
    );
    expect(first12Ids).toEqual([...ENEBINHA_MARQUEE_PRIORITY_IDS]);

    // Check every marquee item has a dedicated logo slot
    await expect(
      primarySequence.locator('[data-testid^="marquee-logo-slot-"]')
    ).toHaveCount(73);

    // Pause / Resume control
    const marqueeToggle = page.getByTestId("supplier-marquee-toggle");
    await expect(marqueeToggle).toHaveAttribute("aria-pressed", "false");
    await marqueeToggle.click();
    await expect(marqueeToggle).toHaveAttribute("aria-pressed", "true");
    await expect(marquee).toHaveAttribute("data-paused", "true");
    await marqueeToggle.click();
    await expect(marqueeToggle).toHaveAttribute("aria-pressed", "false");

    // 4. HubBuy Featured Card with referral disclosure
    const hubbuyCard = page.getByTestId("enebinha-hubbuy-card");
    await expect(hubbuyCard).toContainText("Comece pela HubBuy");
    await expect(hubbuyCard).toContainText("Link de indicação");
    const hubbuyCta = page.getByTestId("enebinha-hubbuy-cta");
    await expect(hubbuyCta).toHaveAttribute("href", ENEBINHA_HUBBUY.url);
    const ctaBox = await hubbuyCta.boundingBox();
    expect(ctaBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    // 5. Explore os links: 73 suppliers + Vitrine + 8 guides + 6 community
    await expect(page.getByTestId("enebinha-catalog-meta")).toHaveText(
      "73 fornecedores · 5 lojas e vitrines"
    );
    const vitrineCard = page.getByTestId("enebinha-vitrine-card");
    await expect(vitrineCard).toBeVisible();
    await expect(vitrineCard).toHaveAttribute("href", ENEBINHA_VITRINE.url);

    // Search clear button is hidden when input is empty
    await expect(page.getByTestId("enebinha-search-clear")).toHaveCount(0);

    // Expand all 73 supplier links and verify every single URL is rendered
    await page.getByTestId("toggle-expand-all-suppliers").click();
    const renderedSupplierLinks = page.locator('[data-testid^="supplier-link-"]');
    await expect(renderedSupplierLinks).toHaveCount(73);

    const renderedHrefs = await renderedSupplierLinks.evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute("href"))
    );
    expect(renderedHrefs).toEqual(ENEBINHA_SUPPLIERS.map((s) => s.url));

    // Category filter check
    await page.getByTestId("category-filter-relogios-e-oculos").click();
    await expect(page.locator('[data-testid^="supplier-link-"]')).toHaveCount(10);
    await page.getByTestId("category-filter-all").click();

    // Search & Empty state check
    const searchInput = page.getByTestId("enebinha-search-input");
    await searchInput.fill("Husky Reps");
    await expect(page.getByTestId("enebinha-search-clear")).toBeVisible();
    await expect(page.locator('[data-testid^="supplier-link-"]')).toHaveCount(1);

    await searchInput.fill("termo-inexistente-xyz-999");
    await expect(page.getByTestId("enebinha-empty-state")).toBeVisible();
    await expect(page.getByTestId("enebinha-empty-state")).toContainText(
      "Não encontramos fornecedores com esse termo."
    );
    await page.getByTestId("enebinha-empty-reset").click();
    await expect(searchInput).toHaveValue("");
    await expect(page.getByTestId("enebinha-search-clear")).toHaveCount(0);

    // Tab: Guias (8)
    await page.getByTestId("tab-guias").click();
    await expect(page.getByTestId("panel-guias")).toBeVisible();
    const guideLinks = page.locator('[data-testid^="guide-link-"]');
    await expect(guideLinks).toHaveCount(8);
    expect(
      await guideLinks.evaluateAll((els) =>
        els.map((el) => (el as HTMLAnchorElement).getAttribute("href"))
      )
    ).toEqual(ENEBINHA_GUIDES.map((g) => g.url));

    // Tab: Comunidade (6)
    await page.getByTestId("tab-comunidade").click();
    await expect(page.getByTestId("panel-comunidade")).toBeVisible();
    const communityLinks = page.locator('[data-testid^="community-link-"]');
    await expect(communityLinks).toHaveCount(6);
    expect(
      await communityLinks.evaluateAll((els) =>
        els.map((el) => (el as HTMLAnchorElement).getAttribute("href"))
      )
    ).toEqual(ENEBINHA_COMMUNITY.map((c) => c.url));

    // Switch back to Fornecedores
    await page.getByTestId("tab-fornecedores").click();

    // 6. Reference Brands (20) collapsible disclosure
    const brandsToggle = page.getByTestId("enebinha-brands-toggle");
    await expect(brandsToggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("enebinha-brands-panel")).toHaveCount(0);

    await brandsToggle.click();
    await expect(brandsToggle).toHaveAttribute("aria-expanded", "true");
    const brandsPanel = page.getByTestId("enebinha-brands-panel");
    await expect(brandsPanel).toBeVisible();
    const brandTiles = brandsPanel.locator('[data-testid^="brand-reference-"]');
    await expect(brandTiles).toHaveCount(20);
    expect(
      await brandTiles.evaluateAll((els) =>
        els.map((el) => (el as HTMLAnchorElement).getAttribute("href"))
      )
    ).toEqual(ENEBINHA_BRAND_REFERENCES.map((b) => b.url));
    await expect(brandsPanel).toContainText(
      "Marcas apresentadas como referências de produtos. Não indicam parceria ou afiliação oficial com o ENEBINHA."
    );

    expect(errors).toEqual([]);
  });
  test("respects prefers-reduced-motion: reduce and mobile category sheet at 390x844 and 320x568", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
    await page.addInitScript(() => localStorage.setItem("loti.theme", "dark"));
    await page.goto("/enebinha", { waitUntil: "domcontentloaded" });

    // Reduced motion disables continuous clone track and pause button
    const marquee = page.getByTestId("supplier-marquee");
    await expect(marquee).toHaveAttribute("data-reduced-motion", "true");
    await expect(marquee).toHaveAttribute("data-paused", "true");
    await expect(page.getByTestId("supplier-marquee-clone-sequence")).toHaveCount(0);
    await expect(page.getByTestId("supplier-marquee-toggle")).toHaveCount(0);

    // Mascot remains un-inverted in dark mode
    const mascotFilter = await page
      .getByTestId("enebinha-mascot-img")
      .evaluate((el) => window.getComputedStyle(el).filter);
    expect(mascotFilter).toBe("none");

    // Mobile category drawer ("Mais +") allows selecting all 7 categories
    const moreBtn = page.getByTestId("mobile-categories-more-btn");
    await expect(moreBtn).toBeVisible();
    await moreBtn.click();
    const sheet = page.getByTestId("mobile-categories-sheet");
    await expect(sheet).toBeVisible();
    await page.getByTestId("mobile-category-option-automotivos-e-pecas").click();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('[data-testid^="supplier-link-"]')).toHaveCount(8);

    // Check 320x568 viewport zero horizontal overflow
    await page.setViewportSize({ width: 320, height: 568 });
    const hasOverflow320 = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(hasOverflow320).toBe(false);
    await page.screenshot({
      path: path.join(qaDir, "enebinha-320x568-dark-reduced-motion.png"),
      fullPage: true,
    });
  });

  const viewports = [
    { width: 320, height: 568, name: "320x568" },
    { width: 390, height: 844, name: "390x844" },
    { width: 768, height: 1024, name: "768x1024" },
    { width: 1440, height: 900, name: "1440x900" },
    { width: 1920, height: 1080, name: "1920x1080" },
  ] as const;

  for (const vp of viewports) {
    test(`visual QA, zero horizontal overflow, and WCAG AA axe audit at ${vp.name} (light & dark)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: "light" });
      await page.goto("/enebinha", { waitUntil: "domcontentloaded" });

      // Light mode checks
      await page.getByTestId("enebinha-theme-light").click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth
        )
      ).toBe(false);

      await page.addScriptTag({ path: axePath });
      const lightViolations = await page.evaluate(async () => {
        const engine = (
          window as unknown as {
            axe: {
              run: (
                context: unknown,
                options: unknown
              ) => Promise<{ violations: Array<{ id: string; help: string }> }>;
            };
          }
        ).axe;
        const res = await engine.run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
          },
        });
        return res.violations.map((v) => `${v.id}: ${v.help}`);
      });
      expect(lightViolations).toEqual([]);

      await page.screenshot({
        path: path.join(qaDir, `enebinha-${vp.name}-light.png`),
        fullPage: true,
      });

      // Dark mode checks
      await page.getByTestId("enebinha-theme-dark").click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth
        )
      ).toBe(false);

      const darkViolations = await page.evaluate(async () => {
        const engine = (
          window as unknown as {
            axe: {
              run: (
                context: unknown,
                options: unknown
              ) => Promise<{ violations: Array<{ id: string; help: string }> }>;
            };
          }
        ).axe;
        const res = await engine.run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
          },
        });
        return res.violations.map((v) => `${v.id}: ${v.help}`);
      });
      expect(darkViolations).toEqual([]);

      await page.screenshot({
        path: path.join(qaDir, `enebinha-${vp.name}-dark.png`),
        fullPage: true,
      });
    });
  }
});