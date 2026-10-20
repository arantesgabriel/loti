import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { login } from "./helpers";
test("mobile island, responsive layouts, category markers and keyboard dialogs", async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await login(page); mkdirSync("artifacts/qa", { recursive: true });
  let data = await (await page.request.get("/api/app")).json();
  if (!data.purchases.some((p: { status: string }) => p.status === "active")) {
    const response = await page.request.post("/api/app", { headers: { Origin: "http://localhost:3100" }, data: { operation: "purchase.save", input: { name: "Compra QA responsiva", hubbuyAccount: "" } } }); expect(response.ok()).toBe(true);
  }
  for (const [index, f] of data.favorites.entries()) {
    const response = await page.request.post("/api/app", { headers: { Origin: "http://localhost:3100" }, data: { operation: "item.favorite", input: { favoriteId: f.id, personId: f.ownerId, variant: f.variant, notes: f.notes, quantity: index % 3 + 1, unitPriceCents: f.priceCents } } }); expect(response.ok()).toBe(true);
  }
  data = await (await page.request.get("/api/app")).json(); const active = data.purchases.find((p: { status: string }) => p.status === "active");
  for (const [index, item] of data.items.filter((i: { purchaseId: string }) => i.purchaseId === active.id).entries()) if (index % 2 === 0) await page.request.post("/api/app", { headers: { Origin: "http://localhost:3100" }, data: { operation: "item.status", id: item.id, input: "added" } });
  await page.reload();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await page.goto("/favorites");
    for (const view of ["Cards", "Lista"]) {
      await page.getByRole("button", { name: view, exact: true }).click();
      await expect(page.getByTestId("favorites-content")).toHaveClass(view === "Cards" ? /cards/ : /list/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const favoritesBrowser = page.locator(".favorites-browser");
      const hasHorizontalOverflow = await favoritesBrowser.evaluate(element => element.scrollWidth > element.clientWidth + 2);
      await expect(favoritesBrowser).toHaveCSS("scrollbar-width", "none");
      if (hasHorizontalOverflow) {
        await expect(favoritesBrowser).toHaveClass(/has-fade-right/);
        await expect(favoritesBrowser).not.toHaveClass(/has-fade-left/);
        await favoritesBrowser.evaluate(element => { element.scrollLeft = element.scrollWidth; });
        await expect(favoritesBrowser).toHaveClass(/has-fade-left/);
        await expect(favoritesBrowser).not.toHaveClass(/has-fade-right/);
        await favoritesBrowser.evaluate(element => { element.scrollLeft = 0; });
        await expect(favoritesBrowser).toHaveClass(/has-fade-right/);
        await expect(favoritesBrowser).not.toHaveClass(/has-fade-left/);
      }
      for (const row of await page.getByTestId("favorite").all()) {
        await expect(row.locator("img")).toHaveCount(0);
        const marker = row.locator(".category-marker");
        await expect(marker).toHaveAttribute("aria-hidden", "true");
        const box = await marker.boundingBox();
        expect(box!.width).toBeLessThanOrEqual(view === "Cards" ? (width <= 420 ? 36 : width < 768 ? 40 : 42) : width < 768 ? 26 : 30);
        expect(box!.height).toBeLessThanOrEqual(view === "Cards" ? (width <= 420 ? 36 : width < 768 ? 40 : 42) : 36);
        expect((await row.locator(".favorite-title").boundingBox())!.width).toBeGreaterThan(box!.width);
        await expect(row.locator(".favorite-card-heading")).toHaveCount(view === "Cards" ? 1 : 0);
        if (view === "Cards") await expect(row.locator(".favorite-actions>.button")).toHaveCount(2);
      }
      if (width === 390 || width === 1440) {
        await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 6000 });
        await page.screenshot({ path: `artifacts/qa/favorites-${view === "Cards" ? "cards" : "list"}-${width === 390 ? "mobile" : "desktop"}.png`, fullPage: true });
      }
    }
    if (width < 768) { const island = page.getByRole("navigation", { name: "Navegação móvel" }); await expect(island).toBeVisible(); const box = await island.boundingBox(); expect(box!.width).toBeLessThan(width); expect(parseFloat(await island.evaluate(el => getComputedStyle(el).borderRadius))).toBeGreaterThanOrEqual(24); await island.getByRole("link", { name: "Compra atual", exact: true }).click(); await expect(island.getByRole("link", { name: "Compra atual", exact: true })).toHaveAttribute("aria-current", "page"); }
    else await page.goto("/purchase");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const row of await page.getByTestId("purchase-item").all()) {
      await expect(row.locator("img")).toHaveCount(0);
      const marker = await row.locator(".category-marker").boundingBox();
      const status = await row.locator(".cart-toggle").boundingBox();
      if (width < 768) {
        expect(marker!.width).toBeLessThanOrEqual(width <= 359 ? 36 : 40);
        expect(status!.width).toBeLessThan(marker!.width);
        await expect(row.locator(".purchase-row-main")).toBeVisible();
        await expect(row.locator(".purchase-row-cost .item-unit-price")).toBeVisible();
        await expect(row.locator(".purchase-mobile-status")).toBeVisible();
        await expect(row.locator(".purchase-row-actions")).toBeVisible();
        const rowBox = await row.boundingBox();
        const costBox = await row.locator(".purchase-row-cost").boundingBox();
        const actionsBox = await row.locator(".purchase-row-actions").boundingBox();
        expect(costBox!.x + costBox!.width).toBeLessThanOrEqual(actionsBox!.x + 1);
        expect(actionsBox!.x + actionsBox!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width);
      } else expect(marker!.width).toBeLessThan(status!.width);
    }
    if (width === 390 || width === 1440) { await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 6000 }); await page.screenshot({ path: `artifacts/qa/purchase-${width === 390 ? "mobile" : "desktop"}.png`, fullPage: true }); }
    if (width < 768) { await page.getByRole("navigation", { name: "Navegação móvel" }).getByRole("link", { name: "Histórico", exact: true }).click(); await expect(page.getByRole("heading", { name: "Histórico", exact: true })).toBeVisible(); }
  }
  await page.goto("/favorites"); await page.getByRole("button", { name: "Novo favorito", exact: true }).click(); await expect(page.getByLabel("Link do produto")).toBeFocused(); await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.getByRole("button", { name: "Novo favorito", exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});
