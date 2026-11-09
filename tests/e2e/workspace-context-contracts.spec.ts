import { expect, test } from "@playwright/test";
import { login } from "./helpers";

const origin = "http://localhost:3100";

test("group payment settings submit the workspace shown on Meu grupo", async ({ page }) => {
  await login(page);
  await page.goto("/group");
  const group = await (await page.request.get("/api/group")).json();
  expect(group.workspace.id).toBeTruthy();

  await page.getByLabel("Pix (%)").fill("1.25");
  await page.getByLabel("Cartão (%)").fill("5.75");
  const saveRequest = page.waitForRequest(request => request.url().includes("/api/cost-settings") && request.method() === "POST");
  await page.getByRole("button", { name: "Salvar taxas", exact: true }).click();
  const request = await saveRequest;
  expect(request.postDataJSON()).toEqual({ workspaceId: group.workspace.id, pixBps: 125, cardBps: 575 });
  await expect(page.locator("[data-sonner-toast]")).toContainText("Taxas padrão atualizadas");
});

test("legacy History start-cost action submits its displayed workspace", async ({ page }) => {
  await login(page);
  const context = await (await page.request.get("/api/app")).json();
  expect(context.workspaceKind).toBe("shared");
  const workspaceId = context.workspaceId as string;
  const purchaseName = "Início de custos pelo histórico QA";

  const purchaseResponse = await page.request.post("/api/app", {
    headers: { Origin: origin, "X-Loti-Workflow": "orders-v2" },
    data: { operation: "purchase.save", workspaceId, input: { name: purchaseName, hubbuyAccount: null } },
  });
  expect(purchaseResponse.ok()).toBeTruthy();
  const purchaseId = (await purchaseResponse.json()).result.id as string;
  const itemResponse = await page.request.post("/api/app", {
    headers: { Origin: origin, "X-Loti-Workflow": "orders-v2" },
    data: {
      operation: "item.save",
      workspaceId,
      input: { name: "Produto histórico QA", url: "https://example.test/history-cost-start", personId: context.currentUser.id, quantity: 1, unitPriceCents: 1000 },
    },
  });
  expect(itemResponse.ok()).toBeTruthy();
  const finalizeResponse = await page.request.post("/api/app", {
    headers: { Origin: origin, "X-Loti-Workflow": "orders-v2" },
    data: { operation: "purchase.finalize", id: purchaseId, workspaceId, input: true },
  });
  expect(finalizeResponse.ok()).toBeTruthy();

  await page.route("**/api/packages**", async route => {
    if (route.request().method() === "GET") await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
    else await route.continue();
  });
  await page.goto("/history");
  const row = page.locator(".history-row").filter({ hasText: purchaseName });
  await expect(row).toBeVisible();
  const startRequest = page.waitForRequest(request => new URL(request.url()).pathname === "/api/packages" && request.method() === "POST");
  await row.getByRole("button", { name: "Iniciar custos", exact: true }).click();
  expect((await startRequest).postDataJSON()).toEqual({ operation: "start", purchaseId, workspaceId });
  await expect(row.getByRole("link", { name: "Ver custos", exact: true })).toBeVisible();
});
