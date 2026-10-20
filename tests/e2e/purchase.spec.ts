import { test, expect } from "@playwright/test";
import { login } from "./helpers";

async function showTotal(page: import("@playwright/test").Page, label: string, amount: string) {
  await page.getByRole("button", { name: `Mostrar total: ${label}`, exact: true }).click();
  await expect(page.getByTestId("purchase-total-scope")).toHaveText(label);
  await expect(page.getByTestId("purchase-total")).toContainText(amount);
}

test("favorite → collaborative purchase → HubBuy checklist → immutable history → next purchase", async ({ page, browser }) => {
  await login(page); await page.getByLabel("Buscar favoritos").fill("E2E Gabriel"); await page.getByRole("link", { name: "Adicionar Tênis E2E Gabriel editado à compra", exact: true }).click();
  await page.getByRole("button", { name: "Criar compra", exact: true }).click(); await page.getByLabel("Nome da compra").fill("Compra E2E Outubro/2026"); await page.getByLabel("Conta HubBuy", { exact: true }).fill("test-account@loti.test"); await page.getByRole("dialog").getByRole("button", { name: "Criar compra", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Adicionar à compra"); await page.getByRole("checkbox", { name: "Brunna" }).check(); await page.getByRole("checkbox", { name: "Gabriel" }).uncheck(); await page.getByLabel("Quantidade", { exact: true }).fill("3"); await page.getByLabel("Preço unitário (R$)").fill("100,00"); await page.getByRole("dialog").getByRole("button", { name: "Adicionar item", exact: true }).click();
  await expect(page.getByTestId("purchase-total")).toContainText("300,00"); await expect(page.getByRole("heading", { name: "Brunna", exact: true })).toBeVisible(); await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0"); await expect(page.locator(".purchase-desktop-actions")).toBeVisible(); await expect(page.getByRole("button", { name: "Opções da compra", exact: true })).toBeHidden();
  const carousel = page.locator(".total-carousel-viewport"); const carouselBox = await carousel.boundingBox(); expect(carouselBox).not.toBeNull(); await page.mouse.move(carouselBox!.x + carouselBox!.width * .8, carouselBox!.y + carouselBox!.height / 2); await page.mouse.down(); await page.mouse.move(carouselBox!.x + carouselBox!.width * .2, carouselBox!.y + carouselBox!.height / 2, { steps: 8 }); await page.mouse.up(); await expect(page.getByTestId("purchase-total-scope")).toHaveText("Pendentes"); await expect(page.getByTestId("purchase-total")).toContainText("300,00"); await showTotal(page, "Adicionados", "0,00"); await showTotal(page, "Todos os itens", "300,00");
  await page.goto("/favorites"); await expect(page.getByRole("link", { name: "Ver compra atual com Tênis E2E Gabriel editado", exact: true })).toBeVisible(); await page.getByRole("link", { name: "Ver compra atual com Tênis E2E Gabriel editado", exact: true }).click();
  await page.getByRole("button", { name: "Opções de Tênis E2E Gabriel editado", exact: true }).click(); await page.getByRole("menuitem", { name: "Remover item", exact: true }).click(); await page.getByRole("dialog").getByRole("button", { name: "Remover item", exact: true }).click();
  await page.goto("/favorites"); await expect(page.getByRole("link", { name: "Adicionar Tênis E2E Gabriel editado à compra", exact: true })).toBeVisible(); await page.getByRole("link", { name: "Adicionar Tênis E2E Gabriel editado à compra", exact: true }).click(); await page.getByRole("checkbox", { name: "Brunna" }).check(); await page.getByRole("checkbox", { name: "Gabriel" }).uncheck(); await page.getByLabel("Quantidade", { exact: true }).fill("3"); await page.getByLabel("Preço unitário (R$)").fill("100,00"); await page.getByRole("dialog").getByRole("button", { name: "Adicionar item", exact: true }).click(); await page.goto("/favorites"); await expect(page.getByRole("link", { name: "Ver compra atual com Tênis E2E Gabriel editado", exact: true })).toBeVisible(); await page.goto("/purchase");
  // Another member edits the shared purchase, including an item added by Gabriel.
  const context = await browser.newContext(); const brunna = await context.newPage(); await login(brunna, "brunna"); await brunna.goto("/purchase"); await brunna.getByRole("button", { name: "Opções de Tênis E2E Gabriel editado", exact: true }).click(); await brunna.getByRole("menuitem", { name: "Editar item" }).click(); await brunna.getByLabel("Preço unitário (R$)").fill("110,00"); await brunna.getByRole("button", { name: "Salvar item", exact: true }).click(); await expect(brunna.getByTestId("purchase-total")).toContainText("330,00"); await context.close();
  await page.reload(); await page.getByRole("button", { name: "Adicionar item", exact: true }).click(); await page.getByRole("button", { name: "Manual", exact: true }).click(); await page.getByLabel("Nome do produto", { exact: true }).fill("Camiseta manual sem preço"); await page.getByLabel("Link do produto").fill("https://example.com/shirt"); await page.getByLabel("Quantidade", { exact: true }).fill("2"); await page.getByRole("dialog").getByRole("button", { name: "Adicionar item", exact: true }).click(); await expect(page.locator('.total-carousel-slide[aria-hidden="false"]').getByText("2 unidades sem preço neste total", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Pendentes/ }).click(); await expect(page.getByTestId("purchase-item")).toHaveCount(2); const brunnaGroup = page.locator(".purchase-group").filter({ has: page.getByRole("heading", { name: "Brunna", exact: true }) }); await expect(brunnaGroup.locator(".group-added-count")).toHaveText("0 de 3 no carrinho"); await expect(brunnaGroup.locator(".group-bulk-label")).toHaveText("Adicionar"); await brunnaGroup.getByRole("button", { name: "Marcar todos como adicionados", exact: true }).click(); await expect(page.getByTestId("purchase-item")).toHaveCount(1); await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "60"); await showTotal(page, "Adicionados", "330,00"); await showTotal(page, "Pendentes", "0,00"); await showTotal(page, "Todos os itens", "330,00"); await page.getByRole("button", { name: /^Todos/ }).click(); await expect(brunnaGroup.locator(".group-added-count")).toHaveText("3 de 3 no carrinho"); await expect(brunnaGroup.locator(".group-bulk-label")).toHaveText("Pendentes"); await brunnaGroup.getByRole("button", { name: "Marcar todos como pendentes", exact: true }).click(); await expect(brunnaGroup.locator(".group-added-count")).toHaveText("0 de 3 no carrinho"); await expect(brunnaGroup.locator(".group-bulk-label")).toHaveText("Adicionar"); await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0"); await page.getByRole("button", { name: /^Pendentes/ }).click(); await expect(page.getByTestId("purchase-item")).toHaveCount(2); await page.getByRole("button", { name: "Marcar Tênis E2E Gabriel editado como adicionado", exact: true }).click(); await expect(page.getByTestId("purchase-item")).toHaveCount(1); await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "60"); await page.getByRole("button", { name: /^Adicionados/ }).click(); await expect(page.getByTestId("purchase-item")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 }); await expect(page.locator(".purchase-mobile-options")).toBeVisible(); await expect(page.locator(".purchase-desktop-actions")).toBeHidden(); await expect(page.getByTestId("purchase-floating-add")).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 600 }); const floatingAdd = page.getByTestId("purchase-floating-add"); await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await expect(floatingAdd).toBeVisible(); await floatingAdd.click(); await expect(page.getByRole("dialog")).toContainText("Escolha um favorito"); await page.keyboard.press("Escape"); await page.evaluate(() => window.scrollTo(0, 0)); await expect(floatingAdd).toBeHidden();
  const data = await (await page.request.get("/api/app")).json(); const purchase = data.purchases.find((p: { status: string }) => p.status === "active"); const item = data.items.find((i: { purchaseId: string }) => i.purchaseId === purchase.id);
  await page.locator(".purchase-desktop-actions").getByRole("button", { name: "Finalizar compra", exact: true }).click(); await expect(page.getByRole("dialog")).toContainText("2 unidades ainda pendentes"); await expect(page.getByRole("dialog")).toContainText("2 unidades estão sem preço"); await page.getByRole("button", { name: "Confirmar finalização", exact: true }).click(); await page.waitForURL(/\/history\//); await expect(page.getByText("Finalizada", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Adicionar item", exact: true })).toHaveCount(0); await expect(page.getByRole("button", { name: /^Marcar / })).toHaveCount(0); await expect(page.getByTestId("purchase-total")).toContainText("330,00");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await expect(page.getByTestId("purchase-item").locator("img")).toHaveCount(0);
    await expect(page.getByTestId("purchase-item").locator('[data-category="sneaker"]')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 6000 });
    await page.screenshot({ path: `artifacts/qa/history-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Tênis E2E Gabriel editado", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".category-marker")).toHaveAttribute("data-category", "sneaker");
  await expect(page.getByRole("dialog").locator("img")).toHaveCount(0);
  await page.keyboard.press("Escape");
  for (const payload of [{ operation: "item.status", id: item.id, input: "pending" }, { operation: "item.delete", id: item.id }, { operation: "item.save", id: item.id, input: { name: "overwrite", url: item.url, personId: item.personId, quantity: 1, unitPriceCents: 1 } }, { operation: "purchase.save", id: purchase.id, input: { name: "overwrite" } }]) { const r = await page.request.post("/api/app", { headers: { Origin: "http://localhost:3100" }, data: payload }); expect(r.status()).toBe(409); }
  const source = data.favorites.find((f: { name: string }) => f.name === "Tênis E2E Gabriel editado"); await page.request.post("/api/app", { headers: { Origin: "http://localhost:3100" }, data: { operation: "favorite.delete", id: source.id } }); await page.reload(); await expect(page.getByRole("button", { name: "Tênis E2E Gabriel editado", exact: true })).toBeVisible();
  await page.goto("/history"); await expect(page.getByRole("link", { name: /Compra E2E Outubro/ })).toBeVisible(); await page.goto("/purchase"); await page.getByRole("button", { name: "Criar compra", exact: true }).click(); await page.getByRole("dialog").getByRole("button", { name: "Criar compra", exact: true }).click(); await expect(page.getByText("Em andamento", { exact: true })).toBeVisible();
});

test("one purchase item supports equal, percentage and fixed cost shares", async ({ page }) => {
  await login(page);
  await page.goto("/purchase");
  const createPurchase = page.getByRole("button", { name: "Criar compra", exact: true });
  if (await createPurchase.isVisible()) {
    await createPurchase.click();
    await page.getByRole("dialog").getByRole("button", { name: "Criar compra", exact: true }).click();
  }
  async function openManualItem() {
    await page.locator(".purchase-add-button").click();
    await page.getByRole("button", { name: "Manual", exact: true }).click();
  }
  async function selectThreePeople(dialog: import("@playwright/test").Locator) {
    await dialog.getByRole("checkbox", { name: "Brunna" }).check();
    await dialog.getByRole("checkbox", { name: "Amanda" }).check();
  }
  async function editItem(name: string, person: string) {
    const group = page.locator(".purchase-group").filter({ has: page.getByRole("heading", { name: person, exact: true }) });
    await group.getByRole("button", { name: `Opções de ${name}`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Editar item", exact: true }).click();
  }
  async function removeItem(name: string, person: string) {
    const group = page.locator(".purchase-group").filter({ has: page.getByRole("heading", { name: person, exact: true }) });
    await group.getByRole("button", { name: `Opções de ${name}`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Remover item", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("removido da compra para todas as pessoas participantes");
    await page.getByRole("dialog").getByRole("button", { name: "Remover item", exact: true }).click();
  }

  await openManualItem();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome do produto", { exact: true }).fill("RAM compartilhada");
  await dialog.getByLabel("Link do produto").fill("https://example.com/ram-shared");
  await selectThreePeople(dialog);
  await dialog.getByLabel("Quantidade", { exact: true }).fill("1");
  await dialog.getByLabel("Preço unitário (R$)").fill("300,00");
  await expect(dialog.locator(".sharing-preview-row strong")).toHaveText(["R$ 100,00", "R$ 100,00", "R$ 100,00"]);
  await dialog.getByRole("button", { name: "Adicionar item", exact: true }).click();
  await expect(page.getByTestId("purchase-total")).toContainText("300,00");
  await expect(page.locator(".purchase-heading")).toContainText("1 unidade · 3 pessoas");
  await expect(page.locator(".purchase-group")).toHaveCount(3);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflows = await page.locator(".person-summary small, .group-added-count").evaluateAll((elements) =>
      elements.filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => element.className),
    );
    expect(overflows, `summary text overflowed at ${width}px`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `page overflowed at ${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const brunnaGroup = page.locator(".purchase-group").filter({ has: page.getByRole("heading", { name: "Brunna", exact: true }) });
  await brunnaGroup.getByRole("button", { name: "Marcar RAM compartilhada como adicionado", exact: true }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  await expect(page.locator(".cart-toggle.added")).toHaveCount(3);

  await editItem("RAM compartilhada", "Brunna");
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Como dividir?").selectOption("percentage");
  await dialog.getByLabel("Percentual de Gabriel").fill("50");
  await dialog.getByLabel("Percentual de Brunna").fill("30");
  await dialog.getByLabel("Percentual de Amanda").fill("20");
  await expect(dialog.locator(".sharing-preview-row strong")).toHaveText(["R$ 150,00", "R$ 90,00", "R$ 60,00"]);
  await dialog.getByRole("button", { name: "Confirmar composição", exact: true }).click();
  await dialog.getByRole("button", { name: "Salvar item", exact: true }).click();
  await expect(brunnaGroup.locator(".item-subtotal")).toHaveText("R$ 90,00");

  await editItem("RAM compartilhada", "Brunna");
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Preço unitário (R$)").fill("600,00");
  await expect(dialog.locator(".sharing-preview-row strong")).toHaveText(["R$ 300,00", "R$ 180,00", "R$ 120,00"]);
  await dialog.getByRole("button", { name: "Salvar item", exact: true }).click();
  await expect(page.getByTestId("purchase-total")).toContainText("600,00");

  await openManualItem();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome do produto", { exact: true }).fill("Monitor de custo fixo");
  await dialog.getByLabel("Link do produto").fill("https://example.com/monitor-shared");
  await selectThreePeople(dialog);
  await dialog.getByLabel("Quantidade", { exact: true }).fill("1");
  await dialog.getByLabel("Preço unitário (R$)").fill("300,00");
  await dialog.getByLabel("Como dividir?").selectOption("fixed");
  await dialog.getByLabel("Parte de Gabriel em reais").fill("120,00");
  await dialog.getByLabel("Parte de Brunna em reais").fill("100,00");
  await dialog.getByLabel("Parte de Amanda em reais").fill("80,00");
  await expect(dialog.locator(".sharing-preview-row strong")).toHaveText(["R$ 120,00", "R$ 100,00", "R$ 80,00"]);
  await dialog.getByRole("button", { name: "Confirmar composição", exact: true }).click();
  await dialog.getByRole("button", { name: "Adicionar item", exact: true }).click();
  await expect(page.getByTestId("purchase-total")).toContainText("900,00");

  await editItem("Monitor de custo fixo", "Brunna");
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Preço unitário (R$)").fill("299,99");
  await expect(dialog.getByText("Os valores precisam somar exatamente o subtotal do item.", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Salvar item", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();

  await removeItem("Monitor de custo fixo", "Brunna");
  await removeItem("RAM compartilhada", "Brunna");
  await expect(page.getByTestId("purchase-total")).toContainText("0,00");
  await expect(page.locator(".purchase-heading")).toContainText("0 unidades · 0 pessoas");
});
