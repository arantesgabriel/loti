import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Uses the existing disposable harness. Public-only checks remain in
// tests/landing, whose config never provisions a database.
test("landing preserves app theme and saved Favorites view across authenticated navigation", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Cards", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cards", exact: true })).toHaveAttribute("aria-pressed", "true");
  const before = await page.evaluate(() => ({ stored: localStorage.getItem("loti.theme"), resolved: document.documentElement.dataset.theme }));
  await page.goto("/landing");
  await expect(page.locator("h1")).toHaveText("Suas importações, tudo em um só lugar.");
  expect(await page.evaluate(() => ({ stored: localStorage.getItem("loti.theme"), resolved: document.documentElement.dataset.theme }))).toEqual(before);
  await page.goto("/favorites");
  await expect(page.getByRole("button", { name: "Cards", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByTestId("favorites-content")).toHaveClass(/cards/);
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Configurações", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Ações da conta", exact: true }).click();
  await page.getByRole("link", { name: "Acessar grupo", exact: true }).click();
  await expect(page).toHaveURL(/\/group$/);
  await page.goto("/favorites");
  await page.getByRole("button", { name: "Lista", exact: true }).click();
});

test("session restoration and logout still work through the current settings tabs", async ({ page, context, browser }) => {
  await login(page);
  const second = await context.newPage();
  await second.goto("/profile");
  await expect(second.getByRole("heading", { name: "Configurações", exact: true })).toBeVisible();
  const restored = await browser.newContext({ storageState: await context.storageState() });
  try {
    const reopened = await restored.newPage();
    await reopened.goto("http://localhost:3100/favorites");
    await expect(reopened.getByRole("heading", { name: "Favoritos", exact: true })).toBeVisible();
    await second.getByRole("tab", { name: "Ações da conta", exact: true }).click();
    await second.getByRole("button", { name: "Sair da conta", exact: true }).click();
    await expect(second).toHaveURL(/\/login$/);
    for (const target of [page, reopened]) {
      await target.reload();
      await expect(target).toHaveURL(/\/login$/);
    }
  } finally {
    await restored.close();
    await second.close();
  }
});
