import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { login } from "./helpers";
import type { CostTrackingView } from "@/lib/domain/package-cost-reading";

test("hybrid costs preserve real residuals and actions across desktop and mobile", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, "profile-qa", "Profile-QA-Old-2026!");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const headers = { Origin: test.info().project.use.baseURL ?? "http://localhost:3100" };
  const app = async (operation: string, input: unknown, id?: string) => {
    const response = await page.request.post("/api/app", { headers, data: { operation, input, id } });
    expect(response.ok(), `${operation}: ${await response.text()}`).toBeTruthy();
    return response.json();
  };
  const purchase = await app("purchase.save", { name: "Custos da compra do grupo · QA" });
  const personId = purchase.data.currentUser.id;
  for (const [name, price] of [["Tênis para caminhada", 10_000], ["Camiseta de algodão", 0], ["Fone de ouvido", 8_000], ["Memória RAM", 15_000], ["Teclado compacto com nome extenso para validar a leitura em telas pequenas", 6_000]] as const) {
    await app("item.save", { name, url: "https://example.test/hybrid", personId, quantity: 1, unitPriceCents: price });
  }
  await app("purchase.finalize", true, purchase.result.id);
  const list = await (await page.request.get("/api/packages")).json();
  const trackingId = list.data.find((row: { purchase: { id: string } }) => row.purchase.id === purchase.result.id).tracking.id;
  const url = `/api/packages/${trackingId}`;
  let detail: CostTrackingView = (await (await page.request.get(url)).json()).data;
  const cost = async (operation: string, input: Record<string, unknown>, rest: Record<string, unknown> = {}) => {
    const response = await page.request.post(url, { headers, data: { operation, ...rest, input: { expectedRevision: detail.tracking.revision, ...input } } });
    expect(response.ok(), `${operation}: ${await response.text()}`).toBeTruthy();
    detail = (await response.json()).data;
  };
  for (const item of detail.items) await cost("item.save", { itemId: item.id, effectivePriceState: "known", effectivePriceUnitCents: item.effectivePriceUnitCents, chinaFreightState: "no_charge", chinaFreightUnitCents: null });
  await cost("charge.save", { chargeType: "products", paymentMethod: "pix" }, { chargeId: detail.productsCharge!.id });
  await cost("charge.paid", {}, { chargeId: detail.productsCharge!.id });
  const paidSnapshot = { ...detail.productsCharge };
  const firstPackage = detail.packages[0];
  const refunded = detail.items.find(item => item.original.name === "Memória RAM")!;
  await cost("refund.request", { costItemId: refunded.id, quantity: 1, requestedProductCents: 15_000, requestedChinaCents: 0, packageRemovals: [{ packageId: firstPackage.id, quantity: 1 }], unassignedQuantity: 0, reason: "Fixture de cancelamento" });
  const refund = detail.refunds[0];
  await cost("refund.receive", { receivedProductCents: 12_000, receivedChinaCents: 0, confirmed: true, destination: "hubbuy", newAccountLabel: "Conta V4 QA", confirmZeroBalance: true, receivedProductCnyMinor: 12_000, receivedChinaCnyMinor: 0, nativeEvidence: "Crédito sintético para conferir a referência V4" }, { refundId: refund.id });
  // Put two products in a second, incomplete package to render complete and partial lines together.
  await cost("package.allocations", { packageId: firstPackage.id, allocations: detail.items.slice(0, 2).map(item => ({ costItemId: item.id, quantity: 1 })) });
  await cost("package.create", { name: "Pacote complementar" });
  const secondPackage = detail.packages.find(pkg => pkg.id !== firstPackage.id)!;
  await cost("package.allocations", { packageId: secondPackage.id, allocations: detail.items.filter(item => item.id !== refunded.id && !detail.packages[0].items.some(row => row.costItemId === item.id)).map(item => ({ costItemId: item.id, quantity: 1 })) });
  for (const charge of [detail.packages[0].brazilFreightCharge!, detail.packages[0].customsCharge!]) await cost("charge.save", { chargeType: charge.chargeType, valueState: "no_charge", amountCents: null, ...(charge.chargeType === "brazil_freight" ? { paymentMethod: null, feeBps: null } : {}) }, { chargeId: charge.id });
  expect(detail.productsCharge).toEqual(paidSnapshot);
  const expectedNet = detail.calculation.summary.partialCents;
  const shoe = detail.items.find(item => item.original.name === "Tênis para caminhada")!;
  await page.route(`**/api/purchases/${detail.purchase.id}/qc*`, route => route.fulfill({ json: { data: new URL(route.request().url()).searchParams.has("itemId")
    ? { itemId: `purchase:${shoe.original.id}`, pageOffset: 0, totalCount: 1, primaryImageId: "synthetic-qc", presentationRevision: 0, canSetCover: false, images: [{ id: "synthetic-qc", previewUrl: null, width: 1, height: 1, occurrence: "QC sintético" }], nextOffset: null }
    : { canManage: true, counts: [{ itemId: `purchase:${shoe.original.id}`, count: 1 }] } } }));
  await page.route("**/api/qc/images/synthetic-qc/source", route => route.fulfill({ json: { data: { sourceUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==" } } }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/packages/${trackingId}`);
  const header = page.locator(".cost-purchase-header");
  await expect(header.getByRole("button", { name: "Importar QC", exact: true })).toBeVisible();
  await expect(header.locator(".qc-import-primary img")).toHaveAttribute("src", "/icons/qc-import.svg");
  await expect(header.getByRole("link", { name: "Gerenciar contas HubBuy" })).toHaveAttribute("href", "/packages/accounts");
  await expect(page.locator(".cost-compact-row")).toHaveCount(4);
  await expect(page.getByRole("button", { name: /^Produtos e custos/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: /^Pagamentos e reembolsos/ })).toHaveAttribute("aria-expanded", "true");
  const packagesToggle = page.getByRole("button", { name: /^Pacotes / });
  await packagesToggle.click();
  await expect(packagesToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("details.cost-history-packages")).toHaveCount(0);
  await page.getByRole("button", { name: "Frete Brasil e Receita", exact: true }).click();
  await expect(packagesToggle).toHaveAttribute("aria-expanded", "true");
  await expect(packagesToggle).toBeFocused();
  const ram = page.locator(".cost-compact-row").filter({ hasText: "Memória RAM" });
  await expect(ram).toHaveCount(0);
  await expect(page.locator(".refunds-table-wrap")).toContainText("Memória RAM");
  await expect(page.locator(".refunds-table-wrap")).toContainText("R$ 31,50"); // Principal not refunded plus captured fee.
  await expect(page.getByRole("complementary", { name: "Crédito recebido na HubBuy" })).toContainText("R$ 120,00");
  await expect(page.getByRole("complementary", { name: "Crédito recebido na HubBuy" })).toContainText("não é abatido automaticamente");
  await expect(page.locator(".cost-compact-row").filter({ hasText: "Camiseta de algodão" })).toContainText("R$ 0,00");
  await expect(page.locator(".cost-row-status.complete").first()).toBeVisible();
  await expect(page.locator(".cost-row-status.partial").first()).toBeVisible();
  await page.getByRole("button", { name: "Ver composição de Tênis para caminhada", exact: true }).click();
  await expect(page.locator(".cost-table .cost-inline-components")).toContainText("Sem cobrança");
  await page.locator(".cost-table").getByRole("button", { name: /Ver QC/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Foto 1 de 1");
  await expect(page.locator(".qc-viewer-photo img")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".cost-table").getByRole("button", { name: /Ver QC/ })).toBeFocused();
  const screenshots = resolve("artifacts/qa/packages-figma");
  mkdirSync(screenshots, { recursive: true });
  for (const width of [1440, 1280, 768, 390, 360, 320]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    const visibleRows = width >= 1100 ? page.locator(".cost-compact-row") : page.locator(".cost-product-mobile-card");
    await expect(visibleRows).toHaveCount(4);
    await expect(visibleRows.first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const markerAlignment = await visibleRows.first().locator(".category-marker").evaluate(marker => {
      const square = marker.getBoundingClientRect();
      const icon = marker.querySelector("svg")!.getBoundingClientRect();
      return {
        x: Math.abs(square.left + square.width / 2 - icon.left - icon.width / 2),
        y: Math.abs(square.top + square.height / 2 - icon.top - icon.height / 2),
      };
    });
    expect(markerAlignment.x).toBeLessThanOrEqual(0.5);
    expect(markerAlignment.y).toBeLessThanOrEqual(0.5);
    const headerLayout = await header.evaluate(element => {
      const title = element.querySelector("h1")!.getBoundingClientRect();
      const statuses = element.querySelector(".cost-purchase-statuses")!.getBoundingClientRect();
      const actions = element.querySelector(".cost-purchase-actions")!.getBoundingClientRect();
      const icon = element.querySelector(".qc-import-primary img")!.getBoundingClientRect();
      return { titleTop: title.top, titleBottom: title.bottom, statusTop: statuses.top, actionLeft: actions.left, statusRight: statuses.right, iconWidth: icon.width, iconHeight: icon.height };
    });
    expect(headerLayout.iconWidth).toBe(19);
    expect(headerLayout.iconHeight).toBe(19);
    if (width >= 1280) {
      expect(headerLayout.statusTop).toBeLessThan(headerLayout.titleBottom);
      expect(headerLayout.actionLeft).toBeGreaterThanOrEqual(headerLayout.statusRight);
    }
    await header.screenshot({ path: resolve(screenshots, `header-${width}.png`) });
    await expect(page.locator(".cost-inline-composition").filter({ visible: true })).toHaveCount(1);
    // A compact sibling should stay compact while one product is expanded.
    expect((await visibleRows.nth(1).boundingBox())!.height).toBeLessThan(160);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: resolve(screenshots, `hybrid-${width}.png`), fullPage: true });
  }
  await page.locator(".cost-package-toggle").first().click();
  await expect(page.locator(".cost-package-body")).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: resolve(screenshots, `package-expanded-${width}.png`), fullPage: true });
  }
  for (const label of [/^Produtos e custos/, /^Pagamentos e reembolsos/, /^Pacotes /, /^Divisão por pessoa/]) {
    const toggle = page.getByRole("button", { name: label });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  }
  for (const width of [1440, 1280, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: resolve(screenshots, `v4-collapsed-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.screenshot({ path: resolve(screenshots, "collapsed-320.png"), fullPage: true });
  await page.getByRole("button", { name: /^Produtos e custos/ }).click();
  await page.getByRole("button", { name: /^Pagamentos e reembolsos/ }).click();
  await page.getByRole("button", { name: "Fechar composição de Tênis para caminhada", exact: true }).click();
  await expect(page.locator(".cost-inline-composition").filter({ visible: true })).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator(".refund-group-toggle:visible").first().click();
  await expect(page.locator(".refund-group-composition:visible")).toContainText("Taxa do pagamento dessas unidades");
  await expect(page.locator(".refund-group-composition:visible")).toContainText("Custo não devolvido");
  await expect(page.locator(".refund-record-flat:visible .refund-product")).toHaveCount(0);
  await expect(page.locator(".refund-record-toggle:visible")).toHaveCount(0);
  await expect(page.locator(".refund-record-flat:visible").getByRole("button", { name: "Corrigir valores recebidos" })).toBeVisible();
  for (const width of [1440, 1280, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: resolve(screenshots, `v4-refund-expanded-${width}.png`), fullPage: true });
  }
  const after: CostTrackingView = (await (await page.request.get(url)).json()).data;
  expect(after.calculation.summary.partialCents).toBe(expectedNet);
  expect(after.productsCharge).toEqual(paidSnapshot);
  expect(after.tracking.revision).toBe(detail.tracking.revision);
  // The original-item association reuses package allocation validation and retains other rows.
  const unassigned = detail.items.find(item => detail.packages[1].items.some(row => row.costItemId === item.id))!;
  await cost("package.allocations", { packageId: secondPackage.id, allocations: detail.packages[1].items.filter(row => row.costItemId !== unassigned.id).map(row => ({ costItemId: row.costItemId, quantity: row.quantity })) });
  await page.reload();
  await page.getByRole("button", { name: `Ver composição de ${unassigned.original.name}`, exact: true }).click();
  await page.getByRole("button", { name: "Associar ao pacote", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  const cancelled = (await (await page.request.get(url)).json()).data;
  expect(cancelled.tracking.revision).toBe(detail.tracking.revision);
  await page.getByRole("button", { name: "Associar ao pacote", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Pacote", exact: true }).selectOption(secondPackage.id);
  await dialog.getByRole("button", { name: "Associar produto", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const associated: CostTrackingView = (await (await page.request.get(url)).json()).data;
  expect(associated.packages.find(pkg => pkg.id === secondPackage.id)!.items.some(row => row.costItemId === unassigned.id && row.quantity === 1)).toBe(true);
  expect(associated.productsCharge).toEqual(paidSnapshot);
});
