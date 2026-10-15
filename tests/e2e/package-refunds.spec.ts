import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

test("requests, receives, corrects and voids product refunds without changing the original payment", async ({ page }) => {
  test.setTimeout(180_000);
  const screenshotDir = resolve(process.cwd(), "artifacts/qa/package-refunds");
  async function capture(name: string) {
    if (process.env.LOTI_CAPTURE_REFUNDS_QA !== "1") return;
    mkdirSync(screenshotDir, { recursive: true });
    await page.locator("[data-sonner-toast]").first().waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
    await page.screenshot({ path: join(screenshotDir, `${name}.png`), fullPage: true });
  }
  await page.setExtraHTTPHeaders({ "X-Forwarded-For": "203.0.113.200" });
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("profile-qa@loti.test");
  await page.getByLabel("Senha", { exact: true }).fill("Profile-QA-Old-2026!");
  const loginResponse = page.waitForResponse(response => response.url().includes("/api/auth/sign-in/email"));
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  const response = await loginResponse;
  expect(response.ok(), `Login response ${response.status()}: ${await response.text()}`).toBeTruthy();
  await page.waitForURL("**/favorites");
  const origin = test.info().project.use.baseURL ?? "http://localhost:3100";
  const created = await page.request.post("/api/app", { headers: { Origin: origin }, data: { operation: "purchase.save", input: { name: "Refund QA outubro" } } });
  expect(created.ok()).toBeTruthy();
  const purchaseData = await created.json();
  const purchase = purchaseData.result as { id: string };
  const personId = purchaseData.data.currentUser.id as string;
  const added = await page.request.post("/api/app", { headers: { Origin: origin }, data: { operation: "item.save", input: { name: "SSD NVMe refund QA", url: "https://example.test/ssd-refund", personId, quantity: 2, unitPriceCents: 10_000 } } });
  expect(added.ok()).toBeTruthy();
  expect((await page.request.post("/api/app", { headers: { Origin: origin }, data: { operation: "purchase.finalize", id: purchase.id, input: true } })).ok()).toBeTruthy();
  const rows = (await (await page.request.get("/api/packages")).json()).data as { tracking: { id: string }; purchase: { id: string } }[];
  const tracking = rows.find(row => row.purchase.id === purchase.id)!.tracking;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/packages/${tracking.id}`);
  await page.getByRole("button", { name: /Produtos e pagamento/ }).click();
  await page.getByRole("button", { name: "Editar valores", exact: true }).click();
  let surface = page.getByRole("dialog");
  await surface.getByLabel("Frete China por unidade").selectOption("known");
  await surface.getByLabel("Valor em R$").nth(1).fill("10,00");
  await surface.getByRole("button", { name: "Salvar custos", exact: true }).click();
  await page.locator(".cost-product-payment select").selectOption("pix");
  await page.getByRole("button", { name: "Marcar como pago", exact: true }).click();
  await expect(page.getByText("Custos do produto atualizados")).toBeHidden();
  await page.getByRole("button", { name: "Registrar reembolso", exact: true }).click();
  surface = page.getByRole("dialog");
  await expect(surface).toBeVisible();
  await expect(surface.getByLabel("Pacote 1 unidades a cancelar")).toBeFocused();
  await surface.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.locator(".refunds-section")).toHaveCount(0);
  await page.getByRole("button", { name: "Registrar reembolso", exact: true }).click();
  surface = page.getByRole("dialog");
  await expect(surface.getByText("2 compradas · 0 canceladas · 2 para envio")).toBeVisible();
  await surface.getByLabel("Pacote 1 unidades a cancelar").fill("1");
  await surface.getByLabel("Valor solicitado do produto (R$)").fill("70,00");
  await surface.getByLabel("Valor solicitado do frete China (R$)").fill("5,00");
  await surface.getByLabel("Motivo").fill("Fornecedor cancelou uma unidade");
  await capture("refund-request-form-desktop");
  await surface.getByRole("button", { name: "Registrar solicitação", exact: true }).click();
  await expect(page.locator(".refunds-total")).toContainText("R$ 0,00");
  await expect(page.locator(".refunds-total")).toContainText("A receber: R$ 75,00");
  await expect(page.locator(".refund-row .refund-status").first()).toHaveText("A receber");
  await expect(page.locator("#items-title")).toBeVisible();
  const toggle = page.locator(".refund-row").first().locator(".refund-details-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".refund-row").first().getByRole("button", { name: "Registrar recebimento", exact: true })).toHaveCount(0);
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await capture("refund-requested-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("refund-requested-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Registrar recebimento", exact: true }).first().click();
  surface = page.getByRole("dialog");
  await surface.getByLabel("Produto recebido (R$)").fill("80,00");
  await surface.getByLabel("Frete China recebido (R$)").fill("10,00");
  await capture("refund-receipt-form-desktop");
  await surface.getByRole("button", { name: "Registrar recebimento", exact: true }).click();
  await expect(page.locator(".refund-row .refund-status").first()).toHaveText("Reembolsado");
  await expect(page.locator(".refunds-heading")).toContainText("1 item reembolsado nesta compra.");
  await expect(page.locator(".refunds-total")).toContainText("R$ 90,00");
  await expect(page.locator(".refund-financial-summary")).toContainText("R$ 90,00");
  await expect(page.getByText("Pagamento confirmado", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Corrigir valores recebidos", exact: true }).click();
  surface = page.getByRole("dialog");
  await surface.getByLabel("Novo valor recebido do produto (R$)").fill("79,00");
  await surface.getByLabel("Novo valor recebido do frete China (R$)").fill("10,00");
  await surface.getByLabel("Motivo da correção").fill("Conferência do valor do produto");
  await surface.getByRole("button", { name: "Corrigir recebimento", exact: true }).click();
  await expect(page.locator(".refund-row").first()).toContainText("R$ 89,00");
  await capture("refund-received-desktop");
  await page.getByRole("button", { name: "Corrigir valores recebidos", exact: true }).click();
  surface = page.getByRole("dialog");
  await surface.getByLabel("Novo valor recebido do produto (R$)").fill("0,00");
  await surface.getByLabel("Novo valor recebido do frete China (R$)").fill("0,00");
  await surface.getByLabel("Motivo da correção").fill("Estorno do valor registrado por engano");
  const zeroCorrection = surface.getByRole("button", { name: "Corrigir recebimento", exact: true });
  await expect(zeroCorrection).toBeDisabled();
  await surface.getByLabel("Confirmo zerar o crédito recebido: ele será removido e o custo voltará a ficar integral.").check();
  await zeroCorrection.click();
  await expect(page.locator(".refund-row .refund-amount").first()).toContainText("R$ 0,00");
  await page.getByRole("button", { name: "Registrar reembolso", exact: true }).click();
  surface = page.getByRole("dialog");
  await surface.getByLabel("Pacote 1 unidades a cancelar").fill("1");
  await surface.getByLabel("Motivo").fill("Segunda unidade cancelada");
  await surface.getByRole("button", { name: "Registrar solicitação", exact: true }).click();
  await page.locator(".refund-row.status-requested").getByRole("button", { name: /Ver detalhes/ }).click();
  await page.locator(".refund-row.status-requested").getByRole("button", { name: "Anular registro", exact: true }).click();
  surface = page.getByRole("dialog");
  await surface.getByLabel("Motivo da anulação").fill("Solicitação aberta por engano");
  await surface.getByLabel("Confirmo este impacto.").check();
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("refund-void-confirmation-mobile");
  await surface.getByRole("button", { name: "Confirmar anulação", exact: true }).click();
  await expect(page.locator(".refunds-total")).not.toContainText("A receber");
  await expect(page.locator(".refunds-voided summary").first()).toHaveText("Histórico anulado · 1");
  await expect(page.locator(".refunds-voided")).toContainText("Solicitação aberta por engano");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Registrar reembolso", exact: true }).click();
  surface = page.getByRole("dialog");
  await expect(surface.getByLabel("Unidades sem pacote a cancelar")).toHaveValue("1");
  await surface.getByLabel("Motivo").fill("Cancelamento integral da segunda unidade");
  await surface.getByRole("button", { name: "Registrar solicitação", exact: true }).click();
  await expect(page.locator(".refund-row.status-requested")).toHaveCount(1);
  await expect(page.locator(".refund-row.status-received")).toHaveCount(1);
  await expect(page.locator("#items-title")).toHaveCount(0);
  await expect(page.locator(".cost-table")).toHaveCount(0);
  await expect(page.locator(".cost-product-mobile-card")).toHaveCount(0);
  await expect(page.locator(".refunds-total")).toContainText("A receber: R$ 110,00");
  await page.locator(".refund-row.status-requested").getByRole("button", { name: /Ver detalhes/ }).click();
  await expect(page.locator(".refund-row.status-requested")).toContainText("1 unidade cancelada");
  await expect(page.locator(".refund-financial-summary")).toContainText("A receber");
  await capture("refund-all-cancelled-desktop");
  await page.locator(".refund-row.status-requested").getByRole("button", { name: "Ver composição", exact: true }).click();
  const breakdown = page.getByRole("dialog");
  await expect(breakdown).toContainText("Custo bruto conhecido");
  await expect(breakdown).toContainText("Taxa dos produtos");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Divisão por pessoa/ }).click();
  await expect(page.locator(".cost-people-list")).toContainText("Crédito");
  await capture("refund-people-desktop");
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      content: document.documentElement.scrollWidth,
      offenders: [...document.querySelectorAll<HTMLElement>("body *")].map(element => {
        const rect = element.getBoundingClientRect();
        return { tag: element.tagName, className: typeof element.className === "string" ? element.className : "", text: element.innerText?.slice(0, 60), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width), scrollWidth: element.scrollWidth, parents: [element.parentElement, element.parentElement?.parentElement, element.parentElement?.parentElement?.parentElement].map(parent => parent ? { tag: parent.tagName, className: typeof parent.className === "string" ? parent.className : "", left: Math.round(parent.getBoundingClientRect().left), right: Math.round(parent.getBoundingClientRect().right), display: getComputedStyle(parent).display, grid: getComputedStyle(parent).gridTemplateColumns, flex: getComputedStyle(parent).flex } : null) };
      }).filter(element => element.right > window.innerWidth + 1 || element.left < -1).slice(0, 12),
    }));
    expect(dimensions.content, `Horizontal overflow at ${dimensions.viewport}px: ${dimensions.content}px; ${JSON.stringify(dimensions.offenders)}`).toBeLessThanOrEqual(dimensions.viewport);
  }
});

test("summarizes multiple refunded products and keeps only remaining units in product costs", async ({ page }) => {
  test.setTimeout(180_000);
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
  const purchaseData = await app("purchase.save", { name: "Resumo de múltiplos reembolsos" });
  const purchaseId = purchaseData.result.id as string;
  const personId = purchaseData.data.currentUser.id as string;
  for (const name of ["Camiseta reembolso", "Tênis reembolso"]) {
    await app("item.save", { name, url: "https://example.test/refund-summary", personId, quantity: 2, unitPriceCents: 10_000 });
  }
  await app("purchase.finalize", true, purchaseId);
  const rows = (await (await page.request.get("/api/packages")).json()).data;
  const trackingId = rows.find((row: { purchase: { id: string } }) => row.purchase.id === purchaseId).tracking.id;
  const url = `/api/packages/${trackingId}`;
  let detail = (await (await page.request.get(url)).json()).data;
  async function cost(operation: string, input: Record<string, unknown>, rest: Record<string, unknown> = {}) {
    const response = await page.request.post(url, { headers, data: { operation, ...rest, input: { expectedRevision: detail.tracking.revision, ...input } } });
    expect(response.ok(), await response.text()).toBeTruthy();
    detail = (await response.json()).data;
  }
  for (const item of detail.items) {
    await cost("item.save", { itemId: item.id, effectivePriceState: "known", effectivePriceUnitCents: 10_000, chinaFreightState: "no_charge", chinaFreightUnitCents: null });
  }
  await cost("charge.save", { chargeType: "products", paymentMethod: "pix" }, { chargeId: detail.productsCharge.id });
  await cost("charge.paid", {}, { chargeId: detail.productsCharge.id });
  const itemIds = detail.items.map((item: { id: string }) => item.id) as string[];
  const packageId = detail.packages[0].id;
  async function cancel(costItemId: string, quantity: number, productCents: number) {
    await cost("refund.request", { costItemId, quantity, requestedProductCents: productCents, requestedChinaCents: 0, reason: "Tamanho incorreto", packageRemovals: [{ packageId, quantity }], unassignedQuantity: 0 });
    const refundId = detail.refunds.at(-1).id;
    await cost("refund.receive", { receivedProductCents: productCents, receivedChinaCents: 0, confirmed: true }, { refundId });
  }
  await cancel(itemIds[0], 2, 15_000); // Partial monetary refund for a fully cancelled line.
  await page.goto(`/packages/${trackingId}`);
  await page.getByRole("button", { name: /Produtos e pagamento/ }).click();
  await expect(page.locator(".cost-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".refunds-total")).toContainText("R$ 150,00");
  await cancel(itemIds[1], 1, 10_000);
  await page.reload();
  await page.getByRole("button", { name: /Produtos e pagamento/ }).click();
  await expect(page.locator(".refunds-heading")).toContainText("2 itens reembolsados nesta compra.");
  await expect(page.locator(".refunds-total")).toContainText("R$ 250,00");
  await expect(page.locator(".cost-table tbody tr")).toHaveCount(1);
  await cancel(itemIds[1], 1, 8_000);
  await page.reload();
  await page.getByRole("button", { name: /Produtos e pagamento/ }).click();
  await expect(page.locator(".refund-row.status-received")).toHaveCount(3);
  await expect(page.locator(".refunds-heading")).toContainText("2 itens reembolsados nesta compra.");
  await expect(page.locator(".refunds-total")).toContainText("R$ 330,00");
  await expect(page.getByRole("heading", { name: "Custos por produto", exact: true })).toHaveCount(0);
  await expect(page.locator(".cost-table")).toHaveCount(0);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const section = page.getByRole("region", { name: "Reembolsos", exact: true });
    const toggle = section.locator(".refund-details-toggle").first();
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(section).toContainText("Pagamento original · Pix");
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
    if (process.env.LOTI_CAPTURE_REFUNDS_QA === "1") {
      mkdirSync(resolve("artifacts/qa/package-refunds"), { recursive: true });
      await section.screenshot({ path: resolve(`artifacts/qa/package-refunds/refunds-summary-${width}.png`) });
    }
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  const toggle = page.locator(".refund-details-toggle").first();
  await toggle.click();
  const transitionDuration = await page.locator(".refund-details-panel").first().evaluate(element => getComputedStyle(element).transitionDuration);
  expect(parseFloat(transitionDuration)).toBeLessThan(0.01);
  await cost("package.delete", {}, { packageId });
  await cost("tracking.close", { confirmed: true });
  await page.reload();
  await page.getByRole("button", { name: /Produtos e pagamento/ }).click();
  await page.locator(".refund-details-toggle").first().click();
  await expect(page.locator(".refunds-section").getByRole("button", { name: "Corrigir valores recebidos", exact: true })).toHaveCount(0);
  await expect(page.locator(".refunds-section").getByRole("button", { name: "Ver composição", exact: true })).toHaveCount(1);
});
