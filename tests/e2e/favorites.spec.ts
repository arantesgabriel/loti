import { test, expect } from "@playwright/test";
import { login } from "./helpers";
test("private routes redirect and public signup is disabled", async ({ page, request }) => {
  for (const path of ["/favorites", "/purchase", "/history", "/history/private-id", "/profile"]) { await page.goto(path); await expect(page).toHaveURL(/\/login/); } await expect(page.getByText(/cadast/i)).toHaveCount(0);
  const health = await request.get("/api/health"); expect(health.status()).toBe(200); expect(await health.json()).toEqual({ status: "ok", database: "ok" });
  const app = await request.get("/api/app"); expect(app.status()).toBe(401);
  const r = await request.post("/api/auth/sign-up/email", { data: { name: "Public", email: "public@loti.test", password: "Loti-Dev-Only-2026!" }, headers: { Origin: "http://localhost:3100" } }); expect(r.ok()).toBe(false);
});
test("favorite lifecycle: create, search, edit with category marker", async ({ page }) => {
  await login(page); await page.getByRole("button", { name: "Novo favorito", exact: true }).click();
  await page.getByLabel("Link do produto").fill("https://weidian.com/item.html?itemID=999999&spm=test"); await page.getByLabel("Nome do produto", { exact: true }).fill("Tênis E2E Gabriel"); await page.getByLabel("Preço de referência (R$)").fill("125,00"); await page.getByText("Mais detalhes", { exact: true }).click(); await page.getByLabel("Variação / modelo").fill("42"); await page.getByRole("button", { name: "Salvar favorito", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0); await page.getByLabel("Buscar favoritos").fill("E2E Gabriel");
  const row = page.getByTestId("favorite"); await expect(row).toHaveCount(1); await expect(row.locator(".category-marker")).toHaveAttribute("data-category", "sneaker"); await expect(row.locator("img")).toHaveCount(0);
  await page.getByRole("button", { name: "Tênis E2E Gabriel", exact: true }).click(); await page.getByRole("button", { name: "Editar favorito", exact: true }).click(); await page.getByLabel("Nome do produto", { exact: true }).fill("Tênis E2E Gabriel editado"); await page.getByRole("button", { name: "Salvar favorito", exact: true }).click(); await expect(row).toContainText("Tênis E2E Gabriel editado");
});
test("another member sees the favorite and cannot mutate it", async ({ page }) => {
  await login(page, "brunna"); await page.getByLabel("Buscar favoritos").fill("E2E Gabriel"); await page.getByRole("button", { name: "Tênis E2E Gabriel editado", exact: true }).click(); await expect(page.getByRole("button", { name: "Editar favorito", exact: true })).toHaveCount(0);
  const data = await (await page.request.get("/api/app")).json(); const favorite = data.favorites.find((f: { name: string }) => f.name === "Tênis E2E Gabriel editado");
  for (const operation of ["favorite.save", "favorite.delete"]) { const r = await page.request.post("/api/app", { headers: { Origin: "http://localhost:3100" }, data: { operation, id: favorite.id, input: { name: "Changed", url: favorite.url, priceCents: 100 } } }); expect(r.status()).toBe(403); }
});
test("view preference survives reload and a new login", async ({ page }) => {
  await login(page); await page.getByRole("button", { name: "Cards", exact: true }).click(); await expect(page.getByTestId("favorites-content")).toHaveClass(/cards/); await page.reload(); await expect(page.getByRole("button", { name: "Cards", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Lista", exact: true }).click(); await page.getByRole("link", { name: "Perfil", exact: true }).click(); await page.getByRole("button", { name: "Sair da conta", exact: true }).click(); await expect(page).toHaveURL(/\/login/); await login(page); await expect(page.getByTestId("favorites-content")).toHaveClass(/list/);
});
test("collections preserve favorites on deletion", async ({ page }) => {
  await login(page); await page.getByRole("link", { name: "Nova coleção", exact: true }).click(); await page.getByLabel("Nome da coleção").fill("Coleção E2E"); await page.getByRole("button", { name: "Salvar coleção" }).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Buscar favoritos").fill("E2E Gabriel"); await page.getByRole("button", { name: "Tênis E2E Gabriel editado", exact: true }).click(); await page.getByRole("button", { name: "Editar favorito", exact: true }).click(); await page.getByLabel("Coleção", { exact: true }).selectOption({ label: "Coleção E2E" }); await page.getByRole("button", { name: "Salvar favorito", exact: true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("navigation", { name: "Coleções" }).getByRole("link", { name: "Coleção E2E", exact: false }).click(); await page.getByRole("button", { name: "Editar coleção", exact: true }).click(); await page.getByRole("button", { name: "Excluir coleção", exact: true }).click(); await page.getByRole("dialog").last().getByRole("button", { name: "Cancelar", exact: true }).click(); await expect(page.getByRole("button", { name: "Excluir coleção", exact: true })).toBeFocused(); await page.getByRole("button", { name: "Excluir coleção", exact: true }).click(); await page.getByRole("dialog").last().getByRole("button", { name: "Excluir coleção", exact: true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/favorites"); await page.getByLabel("Buscar favoritos").fill("E2E Gabriel"); await expect(page.getByTestId("favorite")).toHaveCount(1); const data = await (await page.request.get("/api/app")).json(); expect(data.favorites.find((f: { name: string }) => f.name === "Tênis E2E Gabriel editado").collectionId).toBeNull();
});
