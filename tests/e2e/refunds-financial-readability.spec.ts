import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

test("captures refund readability states with synthetic purchase data", async ({ page }) => {
  test.setTimeout(180_000);
  const screenshotDir = resolve(process.cwd(), "artifacts/qa/refunds-financial-readability");
  mkdirSync(screenshotDir, { recursive: true });
  const capture = (name: string, fullPage = true) => page.screenshot({ path: join(screenshotDir, `${name}.png`), fullPage });

  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("profile-qa@loti.test");
  await page.getByLabel("Senha", { exact: true }).fill("Profile-QA-Old-2026!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("**/favorites");

  const headers = { Origin: test.info().project.use.baseURL ?? "http://localhost:3100" };
  async function app(operation: string, input: unknown, id?: string) {
    const response = await page.request.post("/api/app", { headers, data: { operation, input, id } });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  }
  const purchaseData = await app("purchase.save", { name: "Leitura financeira · QA sintético" });
  const purchaseId = purchaseData.result.id as string;
  const personId = purchaseData.data.currentUser.id as string;
  await app("item.save", {
    name: "Produto de leitura financeira",
    url: "https://example.test/synthetic-financial-readability",
    personId,
    quantity: 2,
    unitPriceCents: 10_000,
  });
  await app("purchase.finalize", true, purchaseId);

  const packageRows = (await (await page.request.get("/api/packages")).json()).data;
  const trackingId = packageRows.find((row: { purchase: { id: string } }) => row.purchase.id === purchaseId).tracking.id as string;
  const url = `/api/packages/${trackingId}`;
  let detail = (await (await page.request.get(url)).json()).data;
  async function cost(operation: string, input: Record<string, unknown>, rest: Record<string, unknown> = {}) {
    const response = await page.request.post(url, { headers, data: { operation, ...rest, input: { expectedRevision: detail.tracking.revision, ...input } } });
    expect(response.ok(), await response.text()).toBeTruthy();
    detail = (await response.json()).data;
  }
  const item = detail.items[0];
  await cost("item.save", { itemId: item.id, effectivePriceState: "known", effectivePriceUnitCents: 10_000, chinaFreightState: "known", chinaFreightUnitCents: 1_000 });
  await cost("charge.save", { chargeType: "products", paymentMethod: "pix" }, { chargeId: detail.productsCharge.id });
  await cost("charge.paid", {}, { chargeId: detail.productsCharge.id });
  await cost("charge.save", { chargeType: "brazil_freight", valueState: "no_charge", amountCents: null, paymentMethod: null, feeBps: null }, { chargeId: detail.packages[0].brazilFreightCharge.id });
  await cost("charge.save", { chargeType: "customs", valueState: "no_charge", amountCents: null }, { chargeId: detail.packages[0].customsCharge.id });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/packages/${trackingId}`);
  await expect(page.locator(".cost-table .cost-compact-row")).toHaveCount(1);
  const paymentTrigger = page.getByRole("button", { name: "Ver pagamentos", exact: true });
  await expect(paymentTrigger).toHaveAttribute("aria-expanded", "false");
  await capture("01-payment-collapsed-desktop");
  await paymentTrigger.click();
  await expect(page.locator(".cost-product-payment")).toBeVisible();
  await expect(page.locator(".cost-payment-order-heading")).toBeVisible();
  await capture("02-payment-expanded-desktop");

  const packageId = detail.packages[0].id as string;
  await cost("refund.request", {
    costItemId: item.id,
    quantity: 1,
    requestedProductCents: 10_000,
    requestedChinaCents: 0,
    reason: "Cancelamento de uma unidade sintética",
    packageRemovals: [{ packageId, quantity: 1 }],
    unassignedQuantity: 0,
  });
  await page.goto(`/packages/${trackingId}`);
  await expect(page.locator(".cost-table .cost-compact-row")).toHaveCount(1);
  await expect(page.locator(".refunds-heading")).toContainText("1 produto · 1 unidade cancelada");
  await expect(page.locator(".refunds-total")).toContainText("A receber");
  await capture("03-requested-desktop");

  const groupToggle = page.locator(".refund-group-toggle:visible").first();
  await groupToggle.click();
  await expect(page.locator(".refund-group-composition:visible")).toContainText("Taxa do pagamento dessas unidades");
  await expect(page.locator(".refund-record-flat:visible")).toContainText("Cancelamento de uma unidade sintética");
  await expect(page.locator(".refund-record-flat:visible .refund-events")).toBeVisible();
  await expect(page.locator(".refund-record-toggle")).toHaveCount(0);
  await capture("04-refund-composition-desktop");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".refund-group-toggle:visible").first().click();
  await page.locator(".refunds-section").scrollIntoViewIfNeeded();
  await capture("05-requested-mobile-390", false);
  await expect(page.locator(".cost-product-mobile-card")).toHaveCount(1);
  await expect(page.locator(".refund-group-toggle:visible")).toBeVisible();
  await page.locator(".refund-group-toggle:visible").first().click();
  await capture("06-refund-composition-mobile-390", false);

  const requested = detail.refunds.find((refund: { status: string }) => refund.status === "requested");
  await cost("refund.receive", { receivedProductCents: 10_000, receivedChinaCents: 0, confirmed: true }, { refundId: requested.id });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/packages/${trackingId}`);
  await expect(page.locator(".refund-group-status")).toContainText("Recebimento registrado");
  await expect(page.locator(".refunds-total")).toContainText("R$ 100,00");
  await page.locator(".refund-group-toggle:visible").first().click();
  await capture("07-received-desktop");

  await cost("refund.request", {
    costItemId: item.id,
    quantity: 1,
    requestedProductCents: 10_000,
    requestedChinaCents: 0,
    reason: "Cancelamento da unidade restante sintética",
    packageRemovals: [{ packageId, quantity: 1 }],
    unassignedQuantity: 0,
  });
  await page.goto(`/packages/${trackingId}`);
  await expect(page.locator(".cost-table .cost-compact-row")).toHaveCount(0);
  await expect(page.locator(".refunds-heading")).toContainText("1 produto · 2 unidades canceladas");
  await capture("08-all-cancelled-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".cost-product-mobile-card")).toHaveCount(0);
  await page.locator(".refunds-section").scrollIntoViewIfNeeded();
  await capture("09-all-cancelled-mobile-390", false);

  const secondRequest = detail.refunds.find((refund: { status: string }) => refund.status === "requested");
  await cost("refund.receive", { receivedProductCents: 0, receivedChinaCents: 0, confirmed: true }, { refundId: secondRequest.id });
  await cost("tracking.close", { confirmed: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/packages/${trackingId}`);
  await expect(page.getByText("Custos encerrados", { exact: true })).toBeVisible();
  await page.locator(".refund-group-toggle:visible").first().click();
  await expect(page.locator(".refunds-section").getByRole("button", { name: "Corrigir valores recebidos", exact: true })).toHaveCount(0);
  await capture("10-closed-desktop");
});
