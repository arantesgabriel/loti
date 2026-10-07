import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("ownership, single input focus border and aligned prices", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await expect(page.locator(".mobile-header")).toBeHidden();
  await expect(page.getByRole("link", { name: "Perfil", exact: true })).toBeVisible();
  await expect(page.getByText("Minhas coleções", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Meus / }).click();
  for (const row of await page.getByTestId("favorite").all()) await expect(row).toContainText("Seu favorito");
  await page.locator(".favorite-person").first().click();
  expect(await page.getByTestId("favorite").count()).toBeGreaterThan(0);
  for (const row of await page.getByTestId("favorite").all()) {
    await expect(row.locator(".owner")).toContainText("De ");
    await expect(row).not.toContainText("Seu favorito");
  }
  await page.getByRole("button", { name: /^Todos / }).click();
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  for (const row of await page.getByTestId("favorite").all()) {
    const price = await row.locator(".favorite-price").boundingBox();
    const info = await row.locator(".favorite-info").boundingBox();
    expect(Math.abs(price!.y + price!.height / 2 - info!.y - info!.height / 2)).toBeLessThan(2);
  }
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 6000 });
  await page.screenshot({ path: "artifacts/qa/favorites-list-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Novo favorito", exact: true }).click();
  const field = page.getByLabel("Link do produto");
  await expect(field).toBeFocused();
  expect(await field.evaluate(el => getComputedStyle(el).outlineStyle)).toBe("none");
  expect(await field.evaluate(el => getComputedStyle(el).boxShadow)).toBe("none");
  await page.screenshot({ path: "artifacts/qa/input-focus.png", animations: "disabled" });
  await page.keyboard.press("Escape");
  await page.goto("/purchase");
  await expect(page.getByTestId("purchase-item").first()).toBeVisible();
  for (const group of await page.locator(".purchase-group").all()) {
    const headings = group.locator(".table-head>span");
    const row = group.getByTestId("purchase-item").first();
    for (const [index, selector] of [[1, ".item-unit-price"], [2, ".item-subtotal"]] as const) {
      const head = await headings.nth(index).boundingBox();
      const value = await row.locator(selector).boundingBox();
      expect(Math.abs(head!.x + head!.width - value!.x - value!.width)).toBeLessThan(2);
    }
    const actions = await row.locator(".purchase-row-actions").boundingBox();
    const item = await row.boundingBox();
    expect(Math.abs(actions!.y + actions!.height / 2 - item!.y - item!.height / 2)).toBeLessThan(2);
  }
});
