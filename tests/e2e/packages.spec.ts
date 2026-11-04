import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("personal warehouse arrival, explicit package assembly, and manual freight cost", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  const workspaceSelector = page.locator(".sidebar").getByLabel("Espaço atual", { exact: true });
  const personalWorkspaceId = await workspaceSelector.locator("option", { hasText: "Espaço pessoal" }).getAttribute("value");
  expect(personalWorkspaceId).toBeTruthy();
  await workspaceSelector.selectOption(personalWorkspaceId!);
  await expect(workspaceSelector).toHaveValue(personalWorkspaceId!, { timeout: 30_000 });
  const contextResponse = await page.request.get("/api/app");
  expect(contextResponse.ok()).toBeTruthy();
  const context = await contextResponse.json();
  expect(context.workspaceKind).toBe("personal");
  const workspaceId = context.workspaceId as string;
  const origin = test.info().project.use.baseURL ?? "http://localhost:3100";
  const itemName = "Produto pessoal Frente 4 QA";
  const packageName = "Envio pessoal Frente 4 QA";

  const accountResponse = await page.request.post("/api/hubbuy/accounts", {
    headers: { Origin: origin },
    data: {
      operation: "createAccount",
      workspaceId,
      idempotencyKey: "frente-4-personal-account",
      label: "Conta pessoal Frente 4 QA",
      confirmZeroBalance: true,
    },
  });
  expect(accountResponse.ok()).toBeTruthy();
  const accountId = (await accountResponse.json()).data.accountId as string;

  const purchaseResponse = await page.request.post("/api/app", {
    headers: { Origin: origin, "X-Loti-Workflow": "orders-v2" },
    data: { operation: "purchase.save", workspaceId, input: { name: "Compra pessoal Frente 4 QA", hubbuyAccount: null } },
  });
  expect(purchaseResponse.ok()).toBeTruthy();
  const purchaseResult = await purchaseResponse.json();
  const purchaseId = purchaseResult.result.id as string;
  const itemResponse = await page.request.post("/api/app", {
    headers: { Origin: origin, "X-Loti-Workflow": "orders-v2" },
    data: {
      operation: "item.save",
      workspaceId,
      input: { name: itemName, url: "https://example.test/frente-4-personal", personId: context.currentUser.id, quantity: 1, unitPriceCents: 10_000 },
    },
  });
  expect(itemResponse.ok()).toBeTruthy();
  const finalizeResponse = await page.request.post("/api/app", {
    headers: { Origin: origin, "X-Loti-Workflow": "orders-v2" },
    data: { operation: "purchase.finalize", id: purchaseId, workspaceId, input: true },
  });
  expect(finalizeResponse.ok()).toBeTruthy();

  const packagesBeforeArrival = await page.request.get(`/api/logistics/packages?workspaceId=${encodeURIComponent(workspaceId)}`);
  expect(packagesBeforeArrival.ok()).toBeTruthy();
  expect((await packagesBeforeArrival.json()).data.rows).toHaveLength(0);

  const costListResponse = await page.request.get(`/api/packages?workspaceId=${encodeURIComponent(workspaceId)}`);
  expect(costListResponse.ok()).toBeTruthy();
  const costRows = (await costListResponse.json()).data as { tracking: { id: string }; purchase: { id: string } }[];
  const costTracking = costRows.find(row => row.purchase.id === purchaseId)?.tracking;
  expect(costTracking).toBeTruthy();
  const costUrl = `/api/packages/${encodeURIComponent(costTracking!.id)}`;
  const costDetailResponse = await page.request.get(`${costUrl}?workspaceId=${encodeURIComponent(workspaceId)}`);
  expect(costDetailResponse.ok()).toBeTruthy();
  let costDetail = (await costDetailResponse.json()).data;
  async function costMutation(operation: string, chargeId: string | undefined, input: Record<string, unknown>) {
    const response = await page.request.post(costUrl, {
      headers: { Origin: origin, "X-Loti-Workflow": "orders-v2" },
      data: { workspaceId, operation, ...(chargeId ? { chargeId } : {}), input: { expectedRevision: costDetail.tracking.revision, ...input } },
    });
    expect(response.ok(), `${operation}: ${await response.text()}`).toBeTruthy();
    costDetail = (await response.json()).data;
  }
  const costItem = costDetail.items[0];
  await costMutation("item.save", undefined, {
    itemId: costItem.id,
    effectivePriceState: "known",
    effectivePriceUnitCents: costItem.effectivePriceUnitCents,
    chinaFreightState: "no_charge",
    chinaFreightUnitCents: null,
  });
  const productsChargeId = costDetail.productsCharge.id as string;
  await costMutation("charge.save", productsChargeId, { chargeType: "products", paymentMethod: "pix" });
  await costMutation("charge.paid", productsChargeId, {});

  await page.goto("/orders");
  await expect(page.getByRole("heading", { name: "Pedidos", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: `Detalhes de ${itemName}` })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: `Detalhes de ${itemName}` }).click();
  await page.getByRole("button", { name: `Registrar chegada de ${itemName}` }).click();
  const arrival = page.getByRole("dialog");
  await arrival.getByLabel("Total recebido").fill("1");
  await arrival.getByLabel("Conta HubBuy").selectOption(accountId);
  await arrival.getByLabel("Motivo do registro").fill("Chegada pessoal conferida para montagem.");
  await arrival.getByRole("button", { name: "Salvar chegada", exact: true }).click();
  await expect(page.getByRole("button", { name: `Adicionar ${itemName} à seleção`, exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: `Adicionar ${itemName} à seleção`, exact: true }).click();
  await page.getByRole("button", { name: "Fechar painel", exact: true }).click();
  await page.locator(".orders-workspace-toolbar").getByRole("button", { name: "Preparar pacote", exact: true }).click();
  const panel = page.locator(".orders-desktop-panel");
  await expect(panel.getByRole("heading", { name: "Preparar pacote", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Montar pacote", exact: true }).first().click();
  const review = page.getByRole("dialog").locator(".orders-review-form");
  await expect(review).toBeVisible();
  await review.getByLabel("Nome para novo pacote").fill(packageName);
  await review.getByLabel("Motivo").fill("Reserva pessoal de uma unidade recebida.");
  await review.getByRole("button", { name: "Montar pacote", exact: true }).click();
  const success = page.locator(".orders-assembly-success");
  await expect(success).toContainText("Pacote montado.");
  await success.getByRole("link", { name: "Abrir pacote", exact: true }).click();

  await expect(page.getByRole("heading", { name: packageName, exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("heading", { name: "Resumo de custos", exact: true })).toBeVisible();
  await page.getByText("Ver produtos do pacote (1)", { exact: true }).click();
  await expect(page.getByText(itemName, { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".mobile-island a")).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Informar frete", exact: true }).first().click();
  const freight = page.getByRole("dialog");
  await freight.getByLabel("Situação").selectOption("known");
  await freight.getByLabel("Valor conhecido em reais").fill("25,00");
  await freight.getByLabel("Motivo do registro").fill("Frete informado manualmente no espaço pessoal.");
  await freight.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.locator(".orders-package-cost-rows")).toContainText("25,00");
  await expect(page.getByText("R$ 25,00", { exact: true })).toBeVisible();
});
