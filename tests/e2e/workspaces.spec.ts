import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { login } from "./helpers";

async function workspaceSelector(page: import("@playwright/test").Page) {
  const desktop = page.locator(".sidebar").getByLabel("Espaço atual", { exact: true });
  return await desktop.isVisible() ? desktop : page.locator(".mobile-header").getByLabel("Espaço atual", { exact: true });
}

test("personal Favorites and collections work without exposing group routes", async ({ page }) => {
  await login(page);
  const before = await (await page.request.get("/api/app")).json();
  expect(before.workspaces).toHaveLength(2);
  expect(before.workspaceKind).toBe("shared");
  await (await workspaceSelector(page)).selectOption({ label: "Espaço pessoal" });
  await expect.poll(async () => (await (await page.request.get("/api/app")).json()).workspaceKind).toBe("personal");
  let personal = await (await page.request.get("/api/app")).json();
  expect(personal.workspaces).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: personal.workspaceId, kind: "personal" }),
    expect.objectContaining({ id: before.workspaces.find((workspace: { kind: string }) => workspace.kind === "shared").id, kind: "shared" }),
  ]));
  await expect(page.locator(".sidebar").getByRole("link", { name: "Compra atual", exact: true })).toBeVisible();
  await expect(page.locator(".sidebar").getByRole("link", { name: "Histórico", exact: true })).toBeVisible();

  await page.locator(".sidebar").getByRole("link", { name: "Nova coleção", exact: true }).click();
  await page.getByLabel("Nome da coleção").fill("Coleção pessoal QA");
  await page.getByRole("button", { name: "Salvar coleção", exact: true }).click();
  await page.locator(".favorites-heading-add").click();
  await page.getByLabel("Link do produto").fill("https://weidian.com/item.html?itemID=personal-e2e");
  await page.getByLabel("Nome do produto", { exact: true }).fill("Favorito pessoal QA");
  await page.getByText("Mais detalhes", { exact: true }).click();
  await page.getByLabel("Coleção", { exact: true }).selectOption({ label: "Coleção pessoal QA" });
  await page.getByRole("button", { name: "Salvar favorito", exact: true }).click();
  await expect(page.getByRole("button", { name: "Favorito pessoal QA", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Adicionar Favorito pessoal QA à compra", exact: true })).toBeVisible();
  personal = await (await page.request.get("/api/app")).json();
  expect(personal.favorites.find((item: { name: string }) => item.name === "Favorito pessoal QA")?.workspaceId).toBe(personal.workspaceId);
  expect(personal.collections.find((item: { name: string }) => item.name === "Coleção pessoal QA")?.workspaceId).toBe(personal.workspaceId);

  await page.locator(".sidebar").getByRole("link", { name: "Compra atual", exact: true }).click();
  await expect(page).toHaveURL(/\/purchase$/);
  await expect(page.getByRole("heading", { name: "Compra atual", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar compra", exact: true })).toBeVisible();
  await (await workspaceSelector(page)).selectOption({ label: "Loti" });
  await expect.poll(async () => (await (await page.request.get("/api/app")).json()).workspaceKind).toBe("shared");
  await page.goto("/favorites");
  const sharedFavorites = await (await page.request.get("/api/app")).json();
  expect(sharedFavorites.favorites.some((item: { name: string }) => item.name === "Favorito pessoal QA")).toBe(false);
  if (sharedFavorites.favorites.length) {
    await page.getByLabel("Buscar favoritos").fill("Favorito pessoal QA");
    await expect(page.getByText("Nenhum favorito por aqui", { exact: true })).toBeVisible();
  } else {
    await expect(page.getByText("Seu próximo achado começa aqui", { exact: true })).toBeVisible();
  }
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 6000 });

  mkdirSync("artifacts/qa", { recursive: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    if (width < 768) await expect(page.locator(".mobile-header .workspace-context")).toBeVisible();
    const expectedMargin = width < 768 ? "0px" : width <= 1100 ? "210px" : "240px";
    await expect.poll(() => page.locator(".app-content").evaluate(element => getComputedStyle(element).marginLeft)).toBe(expectedMargin);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), { message: `horizontal overflow at ${width}px` }).toBe(true);
    await page.screenshot({ path: "artifacts/qa/workspace-context-" + width + ".png", fullPage: true });
  }
});

test("a stale tab cannot save a personal favorite after another tab changes the active space", async ({ page }) => {
  await login(page);
  await (await workspaceSelector(page)).selectOption({ label: "Espaço pessoal" });
  const personal = await (await page.request.get("/api/app")).json();
  const group = personal.workspaces.find((workspace: { kind: string }) => workspace.kind === "shared");
  expect(group).toBeTruthy();
  await page.route("**/api/app", async route => {
    if (route.request().method() === "GET") await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(personal) });
    else await route.continue();
  });

  const secondTab = await page.context().newPage();
  await secondTab.goto("/favorites");
  const switched = await secondTab.request.post("/api/app", {
    headers: { Origin: "http://localhost:3100" },
    data: { operation: "workspace.select", workspaceId: personal.workspaceId, input: { workspaceId: group.id } },
  });
  expect(switched.ok()).toBe(true);

  await page.locator(".favorites-heading-add").click();
  await page.getByLabel("Link do produto").fill("https://weidian.com/item.html?itemID=stale-context-e2e");
  await page.getByLabel("Nome do produto", { exact: true }).fill("Gravação de aba antiga QA");
  await page.getByRole("button", { name: "Salvar favorito", exact: true }).click();
  await expect(page.getByText("O espaço ativo mudou. Atualize a tela antes de salvar novamente.", { exact: true })).toBeVisible();
  const groupData = await (await secondTab.request.get("/api/app")).json();
  expect(groupData.workspaceId).toBe(group.id);
  expect(groupData.favorites.some((item: { name: string }) => item.name === "Gravação de aba antiga QA")).toBe(false);

  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.unroute("**/api/app");
  await secondTab.close();
});

test("a delayed response from the previous workspace cannot replace the newly selected context", async ({ page }) => {
  await login(page);
  await (await workspaceSelector(page)).selectOption({ label: "Espaço pessoal" });
  const personal = await (await page.request.get("/api/app")).json();
  let releaseRequests: (() => void) | undefined;
  let requestSeen: (() => void) | undefined;
  const delayed = new Promise<void>(resolve => { releaseRequests = resolve; });
  const seen = new Promise<void>(resolve => { requestSeen = resolve; });
  page.on("request", request => { if (request.url().endsWith("/api/app") && request.method() === "GET") requestSeen?.(); });
  await page.route("**/api/app", async route => {
    if (route.request().method() === "GET") {
      await delayed;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(personal) });
    } else await route.continue();
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await seen;
  await (await workspaceSelector(page)).selectOption({ label: "Loti" });
  await expect.poll(async () => (await (await page.request.get("/api/app")).json()).workspaceKind).toBe("shared");
  releaseRequests?.();
  await page.waitForTimeout(100);
  const selector = await workspaceSelector(page);
  await expect(selector).toHaveValue(personal.workspaces.find((workspace: { kind: string }) => workspace.kind === "shared").id);
  const current = await (await page.request.get("/api/app")).json();
  expect(current.workspaceKind).toBe("shared");
  await page.unroute("**/api/app");
});

test("personal purchase flows from Favorites through editable cart and immutable History", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  await (await workspaceSelector(page)).selectOption({ label: "Espaço pessoal" });
  await expect.poll(async () => (await (await page.request.get("/api/app")).json()).workspaceKind).toBe("personal");
  await page.setViewportSize({ width: 1440, height: 900 });

  const favoriteName = "Favorito Frente 3 QA";
  await page.locator(".favorites-heading-add").click();
  await page.getByLabel("Link do produto").fill("https://weidian.com/item.html?itemID=frente-3-personal");
  await page.getByLabel("Nome do produto", { exact: true }).fill(favoriteName);
  await page.getByLabel("Preço de referência (R$)").fill("25,00");
  await page.getByRole("button", { name: "Salvar favorito", exact: true }).click();
  await expect(page.getByRole("button", { name: favoriteName, exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Adicionar " + favoriteName + " à compra", exact: true }).click();
  await expect(page).toHaveURL(/\/purchase\?favorite=/);
  await page.getByRole("button", { name: "Criar compra", exact: true }).click();
  await page.getByLabel("Nome da compra").fill("Compra pessoal Frente 3 QA");
  await page.getByRole("dialog").getByRole("button", { name: "Criar compra", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Adicionar à compra");
  await expect(dialog.getByText("Você é a única pessoa deste espaço e participa deste item.", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Quem divide o custo?", { exact: true })).toHaveCount(0);
  await dialog.getByLabel("Quantidade", { exact: true }).fill("2");
  await dialog.getByRole("button", { name: "Adicionar item", exact: true }).click();

  await page.locator(".purchase-add-button").click();
  await page.getByRole("button", { name: "Manual", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome do produto", { exact: true }).fill("Item manual pessoal QA");
  await dialog.getByLabel("Link do produto").fill("https://example.com/frente-3-personal-manual");
  await dialog.getByLabel("Quantidade", { exact: true }).fill("1");
  await dialog.getByLabel("Preço unitário (R$)").fill("5,00");
  await dialog.getByRole("button", { name: "Adicionar item", exact: true }).click();

  await page.getByRole("button", { name: "Opções de Item manual pessoal QA", exact: true }).click();
  await page.getByRole("menuitem", { name: "Editar item", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome do produto", { exact: true }).fill("Item manual pessoal editado QA");
  await dialog.getByRole("button", { name: "Salvar item", exact: true }).click();

  await page.locator(".purchase-add-button").click();
  await page.getByRole("button", { name: "Manual", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome do produto", { exact: true }).fill("Item pessoal para remover QA");
  await dialog.getByLabel("Link do produto").fill("https://example.com/frente-3-remove");
  await dialog.getByRole("button", { name: "Adicionar item", exact: true }).click();
  await page.getByRole("button", { name: "Opções de Item pessoal para remover QA", exact: true }).click();
  await page.getByRole("menuitem", { name: "Remover item", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remover item", exact: true }).click();
  await expect(page.getByTestId("purchase-item")).toHaveCount(2);

  await page.getByRole("button", { name: "Marcar " + favoriteName + " como adicionado", exact: true }).click();
  await page.getByRole("button", { name: "Marcar Item manual pessoal editado QA como adicionado", exact: true }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  await expect(page.getByTestId("purchase-total")).toContainText("55,00");

  const beforeFinalize = await (await page.request.get("/api/app")).json();
  const personalPurchase = beforeFinalize.purchases.find((purchase: { status: string }) => purchase.status === "active");
  const savedFavorite = beforeFinalize.favorites.find((favorite: { name: string }) => favorite.name === favoriteName);
  await page.locator(".purchase-desktop-actions").getByRole("button", { name: "Finalizar compra", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar finalização", exact: true }).click();
  await page.waitForURL(/\/history\//);
  await expect(page.getByRole("button", { name: favoriteName, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Item manual pessoal editado QA", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Adicionar item", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Marcar / })).toHaveCount(0);
  await expect(page.getByTestId("purchase-total")).toContainText("55,00");

  await page.goto("/favorites");
  await page.getByRole("button", { name: favoriteName, exact: true }).click();
  await page.getByRole("button", { name: "Editar favorito", exact: true }).click();
  await page.getByLabel("Nome do produto", { exact: true }).fill("Favorito alterado depois QA");
  await page.getByRole("button", { name: "Salvar favorito", exact: true }).click();
  await page.locator(".sidebar").getByRole("link", { name: "Histórico", exact: true }).click();
  await page.getByRole("link", { name: /Compra pessoal Frente 3 QA/ }).click();
  await expect(page).toHaveURL(/\/history\//);
  await expect(page.getByRole("button", { name: favoriteName, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Favorito alterado depois QA", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("purchase-item").locator("img")).toHaveCount(0);

  await page.goto("/purchase");
  await page.getByRole("button", { name: "Criar compra", exact: true }).click();
  await page.getByLabel("Nome da compra").fill("Compra pessoal ativa QA");
  await page.getByRole("dialog").getByRole("button", { name: "Criar compra", exact: true }).click();
  await page.locator(".purchase-add-button").click();
  await page.getByRole("button", { name: "Manual", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome do produto", { exact: true }).fill("Item da compra pessoal ativa QA");
  await dialog.getByLabel("Link do produto").fill("https://example.com/personal-active");
  await dialog.getByRole("button", { name: "Adicionar item", exact: true }).click();

  const personalContext = await (await page.request.get("/api/app")).json();
  const personalWorkspace = personalContext.workspaceId;
  const sharedWorkspace = personalContext.workspaces.find((workspace: { kind: string }) => workspace.kind === "shared");
  expect(sharedWorkspace).toBeTruthy();
  await (await workspaceSelector(page)).selectOption({ label: "Loti" });
  await expect.poll(async () => (await (await page.request.get("/api/app")).json()).workspaceId).toBe(sharedWorkspace.id);
  let sharedContext = await (await page.request.get("/api/app")).json();
  let sharedActive = sharedContext.purchases.find((purchase: { status: string }) => purchase.status === "active");
  if (!sharedActive) {
    await page.goto("/purchase");
    await page.getByRole("button", { name: "Criar compra", exact: true }).click();
    await page.getByLabel("Nome da compra").fill("Compra compartilhada para isolamento QA");
    await page.getByRole("dialog").getByRole("button", { name: "Criar compra", exact: true }).click();
    sharedContext = await (await page.request.get("/api/app")).json();
    sharedActive = sharedContext.purchases.find((purchase: { status: string }) => purchase.status === "active");
  }
  expect(sharedActive).toBeTruthy();
  expect(sharedContext.workspaceId).toBe(sharedWorkspace.id);
  expect(sharedContext.purchases.some((purchase: { id: string }) => purchase.id === personalPurchase.id)).toBe(false);

  await (await workspaceSelector(page)).selectOption({ label: "Espaço pessoal" });
  await expect.poll(async () => (await (await page.request.get("/api/app")).json()).workspaceId).toBe(personalWorkspace);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".mobile-island").getByRole("link", { name: "Favoritos", exact: true })).toBeVisible();
  await expect(page.locator(".mobile-island").getByRole("link", { name: "Compra atual", exact: true })).toBeVisible();
  await expect(page.locator(".mobile-island").getByRole("link", { name: "Histórico", exact: true })).toBeVisible();
  await expect(page.locator(".mobile-island a")).toHaveCount(3);
  await page.locator(".mobile-island").getByRole("link", { name: "Histórico", exact: true }).click();
  await expect(page.getByRole("link", { name: /Compra pessoal Frente 3 QA/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Compra compartilhada para isolamento QA/ })).toHaveCount(0);
  const groupHistoryPurchase = sharedContext.purchases.find((purchase: { status: string }) => purchase.status === "finalized");
  if (groupHistoryPurchase) {
    const response = await page.goto("/history/" + groupHistoryPurchase.id, { waitUntil: "domcontentloaded" });
    expect(response?.status()).not.toBe(500);
    await expect(page.getByText(groupHistoryPurchase.name, { exact: true })).toHaveCount(0);
    for (const item of sharedContext.items.filter((candidate: { purchaseId: string }) => candidate.purchaseId === groupHistoryPurchase.id)) {
      await expect(page.getByText(item.name, { exact: true })).toHaveCount(0);
    }
  }
  await page.locator(".mobile-island").getByRole("link", { name: "Compra atual", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Compra pessoal ativa QA", exact: true })).toBeVisible();
  const finalPersonalContext = await (await page.request.get("/api/app")).json();
  expect(finalPersonalContext.purchases.some((purchase: { id: string }) => purchase.id === personalPurchase.id)).toBe(true);
  expect(finalPersonalContext.purchases.some((purchase: { id: string }) => purchase.id === sharedActive.id)).toBe(false);
  await expect(page.locator(".mobile-island")).toHaveCount(1);
  expect(savedFavorite).toBeTruthy();
});

test("switching workspaces from a history detail opens the new workspace history", async ({ page }) => {
  test.setTimeout(60_000);
  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  async function appData() {
    return await (await page.request.get("/api/app")).json();
  }
  async function mutate(operation: string, workspaceId: string, input: unknown, id?: string) {
    const response = await page.request.post("/api/app", {
      headers: { Origin: "http://localhost:3100", "X-Loti-Workflow": "orders-v2" },
      data: { operation, workspaceId, input, ...(id ? { id } : {}) },
    });
    expect(response.ok()).toBe(true);
    return await response.json();
  }
  async function createHistoryPurchase(workspaceId: string, personId: string, name: string) {
    const current = await appData();
    let purchase = current.purchases.find((row: { status: string }) => row.status === "active");
    if (purchase) {
      await mutate("purchase.save", workspaceId, { name, hubbuyAccount: null }, purchase.id);
    } else {
      purchase = (await mutate("purchase.save", workspaceId, { name, hubbuyAccount: null })).result;
    }
    await mutate("item.save", workspaceId, {
      name: `Item de ${name}`,
      url: "https://example.com/history-workspace-switch",
      personId,
      quantity: 1,
      unitPriceCents: 1_000,
    });
    await mutate("purchase.finalize", workspaceId, true, purchase.id);
    return purchase.id as string;
  }

  let current = await appData();
  const shared = current.workspaces.find((workspace: { kind: string }) => workspace.kind === "shared");
  const personal = current.workspaces.find((workspace: { kind: string }) => workspace.kind === "personal");
  expect(shared).toBeTruthy();
  expect(personal).toBeTruthy();

  if (current.workspaceId !== shared.id) {
    await mutate("workspace.select", current.workspaceId, { workspaceId: shared.id });
  }
  current = await appData();
  const sharedPurchaseId = await createHistoryPurchase(shared.id, current.currentUser.id, "Histórico compartilhado antes da troca QA");

  await mutate("workspace.select", shared.id, { workspaceId: personal.id });
  current = await appData();
  const personalPurchaseName = "Histórico pessoal após troca QA";
  await createHistoryPurchase(personal.id, current.currentUser.id, personalPurchaseName);

  await mutate("workspace.select", personal.id, { workspaceId: shared.id });
  await page.goto("/history/" + sharedPurchaseId, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Histórico compartilhado antes da troca QA", exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");

  const selector = await workspaceSelector(page);
  await expect(selector).toHaveValue(shared.id);
  const selectionResponse = page.waitForResponse(response => {
    if (!response.url().endsWith("/api/app") || response.request().method() !== "POST") return false;
    try { return response.request().postDataJSON().operation === "workspace.select"; } catch { return false; }
  });
  await selector.selectOption({ label: "Espaço pessoal" });
  const response = await selectionResponse;
  expect(response.ok()).toBe(true);
  expect((await response.json()).data.workspaceId).toBe(personal.id);
  await expect(selector).toHaveValue(personal.id);
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole("link", { name: /Histórico pessoal após troca QA/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Histórico compartilhado antes da troca QA/ })).toHaveCount(0);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole("link", { name: /Histórico pessoal após troca QA/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Histórico compartilhado antes da troca QA/ })).toHaveCount(0);
});
