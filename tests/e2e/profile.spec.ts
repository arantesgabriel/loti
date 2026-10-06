import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("profile name and password can be updated without losing the current session", async ({ page, browser }) => {
  await login(page, "profile-qa", "Profile-QA-Old-2026!");
  await page.getByRole("link", { name: "Perfil", exact: true }).click();
  const nameInput = page.getByLabel("Nome completo");
  await nameInput.fill("Ana Júlia D'Ávila-Santos");
  let failProfileRead = false;
  await page.route("**/api/app", route => {
    if (failProfileRead && route.request().method() === "GET") {
      failProfileRead = false;
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "temporary test failure" }) });
    }
    return route.continue();
  });
  failProfileRead = true;
  await page.getByRole("button", { name: "Salvar nome", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ana Júlia D'Ávila-Santos", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Perfil", exact: true })).toContainText("Ana Júlia D'Ávila-Santos");
  await expect(page.getByRole("status").filter({ hasText: "Nome salvo. Não foi possível atualizar todos os dados" })).toBeVisible();
  await page.unroute("**/api/app");
  await nameInput.fill("   ");
  await expect(page.getByText("Informe de 1 a 200 caracteres.")).toBeVisible();
  await nameInput.fill("Ana Júlia D'Ávila-Santos");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Ana Júlia D'Ávila-Santos", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Meu grupo/ }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Ana Júlia D'Ávila-Santos" })).toBeVisible();
  await page.goto("/favorites");
  await page.getByRole("button", { name: "Novo favorito", exact: true }).first().click();
  await page.getByLabel("Link do produto").fill("https://weidian.com/item.html?itemID=780099");
  await page.getByLabel("Nome do produto", { exact: true }).fill("Perfil QA identidade compartilhada");
  await page.getByRole("button", { name: "Salvar favorito", exact: true }).click();
  await expect(page.getByRole("button", { name: "Perfil QA identidade compartilhada", exact: true })).toBeVisible();
  const data = await (await page.request.get("/api/app")).json();
  const favorite = data.favorites.find((item: { name: string }) => item.name === "Perfil QA identidade compartilhada");
  const purchaseResponse = await page.request.post("/api/app", { headers: { Origin: "http://localhost:3100" }, data: { operation: "purchase.save", input: { name: "Compra de identidade QA", hubbuyAccount: null } } });
  expect(purchaseResponse.status()).toBe(200);
  const itemResponse = await page.request.post("/api/app", { headers: { Origin: "http://localhost:3100" }, data: { operation: "item.favorite", input: { favoriteId: favorite.id, personId: data.currentUser.id, variant: "QA", quantity: 1, unitPriceCents: 1000, notes: "" } } });
  expect(itemResponse.status()).toBe(200);
  await page.goto("/profile");

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  await login(secondPage, "profile-reader", "Profile-Reader-2026!");
  await secondPage.getByLabel("Buscar favoritos").fill("Perfil QA identidade compartilhada");
  await expect(secondPage.getByTestId("favorite")).toContainText("De Ana Júlia D'Ávila-Santos");
  await secondPage.goto("/purchase");
  await expect(secondPage.getByRole("heading", { name: "Ana Júlia D'Ávila-Santos", exact: true })).toBeVisible();
  await secondContext.close();
  const securityContext = await browser.newContext();
  const securityPage = await securityContext.newPage();
  await login(securityPage, "profile-qa", "Profile-QA-Old-2026!");

  await page.getByRole("button", { name: "Alterar senha", exact: true }).click();
  await expect(page.getByLabel("Senha atual", { exact: true })).toBeFocused();
  await page.getByLabel("Senha atual", { exact: true }).fill("wrong-profile-password");
  await page.getByLabel("Nova senha", { exact: true }).fill("Profile-QA-New-2026!");
  await page.getByLabel("Confirmar nova senha", { exact: true }).fill("Profile-QA-New-2026!");
  await page.getByRole("button", { name: "Salvar nova senha", exact: true }).click();
  await expect(page.getByText("A senha atual está incorreta.")).toBeVisible();
  await page.getByLabel("Senha atual", { exact: true }).fill("Profile-QA-Old-2026!");
  await page.getByLabel("Confirmar nova senha", { exact: true }).fill("different-password-2026!");
  await page.getByLabel("Confirmar nova senha", { exact: true }).press("Enter");
  await expect(page.getByText("As senhas não coincidem.")).toBeVisible();
  await expect(page.getByLabel("Nova senha", { exact: true })).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Mostrar nova senha", exact: true }).click();
  await expect(page.getByLabel("Nova senha", { exact: true })).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "Ocultar nova senha", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Ocultar nova senha", exact: true }).click();
  await expect(page.getByLabel("Nova senha", { exact: true })).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByLabel("Senha atual", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Alterar senha", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Alterar senha", exact: true }).click();
  await expect(page.getByLabel("Senha atual", { exact: true })).toBeVisible();

  let interruptedSubmissions = 0;
  await page.route("**/api/auth/change-password", route => { interruptedSubmissions += 1; return route.abort(); });
  await page.getByLabel("Senha atual", { exact: true }).fill("Profile-QA-Old-2026!");
  await page.getByLabel("Nova senha", { exact: true }).fill("Profile-QA-New-2026!");
  await page.getByLabel("Confirmar nova senha", { exact: true }).fill("Profile-QA-New-2026!");
  await page.getByRole("button", { name: "Salvar nova senha", exact: true }).click();
  await expect(page.getByText(/resultado pode ser desconhecido/i)).toBeVisible();
  expect(interruptedSubmissions).toBe(1);
  await page.unroute("**/api/auth/change-password");
  await page.getByLabel("Senha atual", { exact: true }).fill("Profile-QA-Old-2026!");
  await page.getByLabel("Nova senha", { exact: true }).fill("Profile-QA-New-2026!");
  await page.getByLabel("Confirmar nova senha", { exact: true }).fill("Profile-QA-New-2026!");
  await page.getByRole("button", { name: "Salvar nova senha", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Outras sessões foram encerradas." })).toBeVisible();
  expect((await securityPage.request.get("/api/app")).status()).toBe(401);
  await securityContext.close();

  await page.getByRole("button", { name: "Sair da conta", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email", { exact: true }).fill("profile-qa@loti.test");
  await page.getByLabel("Senha", { exact: true }).fill("Profile-QA-Old-2026!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("Email ou senha incorretos.", { exact: true })).toBeVisible();
  await page.getByLabel("Senha", { exact: true }).fill("Profile-QA-New-2026!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("**/favorites");
  await page.getByRole("link", { name: "Perfil", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ana Júlia D'Ávila-Santos", exact: true })).toBeVisible();

  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole("heading", { name: "Seu perfil" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (width <= 767) await expect(page.getByRole("navigation", { name: "Navegação móvel" })).toBeVisible();
  }
});
