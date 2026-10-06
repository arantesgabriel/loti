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
      for (const row of await page.getByTestId("favorite").all()) {
        await expect(row.locator("img")).toHaveCount(0);
        const marker = row.locator(".category-marker");
        await expect(marker).toHaveAttribute("aria-hidden", "true");
        const box = await marker.boundingBox();
        expect(box!.width).toBeLessThanOrEqual(view === "Cards" ? (width < 768 ? 28 : 36) : 30);
        expect(box!.height).toBeLessThanOrEqual(36);
        expect((await row.locator(".favorite-title").boundingBox())!.width).toBeGreaterThan(box!.width);
      }
      if (width === 390 || width === 1440) {
        await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 6000 });
        await page.screenshot({ path: `artifacts/qa/favorites-${view === "Cards" ? "cards" : "list"}-${width === 390 ? "mobile" : "desktop"}.png`, fullPage: true });
      }
    }
    if (width < 768) { const island = page.getByRole("navigation", { name: "Navegação móvel" }); await expect(island).toBeVisible(); const box = await island.boundingBox(); expect(box!.width).toBeLessThan(width); expect(parseFloat(await island.evaluate(el => getComputedStyle(el).borderRadius))).toBeGreaterThanOrEqual(40); await island.getByRole("link", { name: "Compra", exact: true }).click(); await expect(island.getByRole("link", { name: "Compra", exact: true })).toHaveAttribute("aria-current", "page"); }
    else await page.goto("/purchase");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const row of await page.getByTestId("purchase-item").all()) {
      await expect(row.locator("img")).toHaveCount(0);
      const marker = await row.locator(".category-marker").boundingBox();
      const status = await row.locator(".cart-toggle").boundingBox();
      expect(marker!.width).toBeLessThan(status!.width);
    }
    if (width === 390 || width === 1440) { await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 6000 }); await page.screenshot({ path: `artifacts/qa/purchase-${width === 390 ? "mobile" : "desktop"}.png`, fullPage: true }); }
    if (width < 768) { await page.getByRole("navigation", { name: "Navegação móvel" }).getByRole("link", { name: "Histórico", exact: true }).click(); await expect(page.getByRole("heading", { name: "Histórico", exact: true })).toBeVisible(); }
  }
  await page.goto("/favorites"); await page.getByRole("button", { name: "Novo favorito", exact: true }).click(); await expect(page.getByLabel("Link do produto")).toBeFocused(); await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.getByRole("button", { name: "Novo favorito", exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});
