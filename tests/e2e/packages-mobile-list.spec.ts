import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("mobile package list applies bottom-sheet filters and sorting without losing search", async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/packages");

  await expect(page.getByRole("heading", { name: "Pacotes", exact: true })).toBeVisible();
  await expect(page.locator(".orders-package-counts > button:visible")).toHaveCount(3);
  await expect(page.getByText(/Mostrando \d+ de \d+ pacotes/)).toBeVisible();

  await page.locator(".orders-package-mobile-filter").click();
  const filters = page.getByRole("dialog", { name: "Filtros" });
  await expect(filters).toBeVisible();
  await expect(filters.getByRole("radio", { name: /Todos os pacotes/ })).toBeChecked();
  const sentOption = filters.getByRole("radio", { name: /A caminho/ });
  const sentCount = await sentOption.count();
  if (sentCount) await expect(sentOption).toBeVisible();
  await filters.locator("#packages-pending-only").check();
  await filters.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
  await expect(page).toHaveURL(/pendingOnly=true/);
  await expect(page.locator(".orders-package-counts > button").nth(1)).toHaveAttribute("aria-pressed", "true");

  await page.locator(".orders-package-mobile-sort").click();
  const sorting = page.getByRole("dialog", { name: "Ordenar pacotes" });
  await expect(sorting).toBeVisible();
  await expect(sorting.getByRole("radio", { name: "Mais recentes", exact: true })).toBeChecked();
  await sorting.getByRole("radio", { name: "Mais antigos", exact: true }).click();
  await expect(page).toHaveURL(/sort=oldest/);
  await expect(page.locator(".orders-package-mobile-sort")).toContainText("Mais antigos");

  const search = page.getByRole("searchbox", { name: "Buscar pacote" });
  await search.fill("pacote sem resultado de QA");
  await expect(page.getByRole("heading", { name: "Nenhum pacote encontrado" })).toBeVisible();
  await page.locator(".orders-package-mobile-filter").click();
  const reset = page.getByRole("dialog", { name: "Filtros" });
  await reset.getByRole("button", { name: "Limpar", exact: true }).click();
  await expect(reset.getByRole("radio", { name: /Todos os pacotes/ })).toBeChecked();
  await expect(reset.locator("#packages-pending-only")).not.toBeChecked();
  await reset.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
  await expect(page).toHaveURL(/search=pacote\+sem\+resultado\+de\+QA/);
  await expect(page).not.toHaveURL(/pendingOnly=true/);
  await expect(page).toHaveURL(/sort=oldest/);

  for (const [width, height] of [[320, 640], [360, 800], [390, 844], [430, 932]] as const) {
    await page.setViewportSize({ width, height });
    const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, content: document.documentElement.scrollWidth }));
    expect(dimensions.content, `Horizontal overflow at ${width}px: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(dimensions.viewport);
  }
});
