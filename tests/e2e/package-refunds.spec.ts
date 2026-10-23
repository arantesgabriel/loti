import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

test("requests, receives, corrects and voids product refunds without changing the original payment", async ({ page }) => {
  test.setTimeout(180_000);
  const screenshotDir = resolve(process.cwd(), "artifacts/qa/package-refunds");
  const mobileUxScreenshotDir = resolve(process.cwd(), "artifacts/qa/mobile-ux/after");
  async function capture(name: string, fullPage = true) {
    if (process.env.LOTI_CAPTURE_REFUNDS_QA !== "1") return;
    mkdirSync(screenshotDir, { recursive: true });
    await page.locator("[data-sonner-toast]").first().waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
    await page.screenshot({ path: join(screenshotDir, `${name}.png`), fullPage });
  }
  async function captureMobileUx(name: string, fullPage = false) {
    if (process.env.LOTI_CAPTURE_MOBILE_UX !== "1") return;
    mkdirSync(mobileUxScreenshotDir, { recursive: true });
    await page.locator("[data-sonner-toast]").first().waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
    await page.screenshot({ path: join(mobileUxScreenshotDir, `${name}.png`), fullPage });
  }
  async function openRefundRequest() {
    await page.getByRole("button", { name: "Mais ações para SSD NVMe refund QA", exact: true }).click();
    await page.getByRole("menuitem", { name: "Registrar reembolso", exact: true }).click();
  }
  async function expandRefundGroups() {
    await expect(page.getByRole("dialog")).toHaveCount(0);
    for (const button of await page.locator(".refund-group-toggle:visible").all()) {
      if (await button.getAttribute("aria-expanded") !== "true") await button.click();
    }
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
  await expect(page.getByRole("button", { name: /Produtos e custos/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Mais ações para SSD NVMe refund QA", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Ver composição de SSD NVMe refund QA", exact: true }).click();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  let surface = page.getByRole("dialog");
  await surface.getByLabel("Frete China por unidade").selectOption("known");
  await surface.getByLabel("Valor em R$").nth(1).fill("10,00");
  await surface.getByRole("button", { name: "Salvar custos", exact: true }).click();
  await page.getByRole("button", { name: "Ver pagamentos", exact: true }).click();
  await page.locator(".cost-product-payment select").selectOption("pix");
  await page.getByRole("button", { name: "Marcar como pago", exact: true }).click();
  await page.getByRole("button", { name: "Ocultar pagamentos", exact: true }).click();
  await expect(page.getByText("Custos do produto atualizados")).toBeHidden();
  for (const [width, height] of [[320, 640], [360, 800], [390, 844], [430, 932], [768, 1000], [1440, 1000]] as const) {
    await page.setViewportSize({ width, height });
    const row = width < 1200 ? page.locator(".cost-product-mobile-card") : page.locator(".cost-table .cost-compact-row");
    await row.evaluate(element => element.scrollIntoView({ block: "start" }));
    const actions = width < 1200 ? row.locator(".cost-inline-actions") : page.locator(".cost-table .cost-inline-actions");
    const layout = await actions.evaluate(element => {
      const buttons = [...element.querySelectorAll("button")].filter(button => button.textContent?.includes("Editar") || button.getAttribute("aria-label")?.startsWith("Mais ações")).map(button => button.getBoundingClientRect());
      return { editTop: buttons[0].top, menuTop: buttons[1].top, editRight: buttons[0].right, menuLeft: buttons[1].left, menuRight: buttons[1].right, viewport: window.innerWidth, scrollWidth: document.documentElement.scrollWidth };
    });
    expect(layout.editTop).toBe(layout.menuTop);
    expect(layout.editRight).toBeLessThan(layout.menuLeft);
    expect(layout.menuRight).toBeLessThanOrEqual(layout.viewport);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await actions.getByRole("button", { name: "Mais ações para SSD NVMe refund QA", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Registrar reembolso", exact: true })).toBeEnabled();
    await capture(`product-costs-actions-${width}`, false);
    await page.keyboard.press("Escape");
  }
  await expect(page.getByRole("button", { name: "Registrar reembolso", exact: true })).toHaveCount(0);
  const moreActions = page.getByRole("button", { name: "Mais ações para SSD NVMe refund QA", exact: true });
  await moreActions.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Registrar reembolso", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(moreActions).toBeFocused();
  await moreActions.click();
  await page.mouse.click(10, 10);
  await expect(page.getByRole("menu")).toBeHidden();
  await openRefundRequest();
  surface = page.getByRole("dialog");
  await expect(surface).toBeVisible();
  await expect(surface.getByLabel("Pacote 1 unidades a cancelar")).toBeFocused();
  await surface.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(moreActions).toBeFocused();
  await expect(page.locator(".refunds-section")).toHaveCount(0);
  await openRefundRequest();
  surface = page.getByRole("dialog");
  await expect(surface.getByText("2 unidades compradas · 0 unidades canceladas · 2 unidades enviáveis")).toBeVisible();
  await surface.getByRole("button", { name: "Diminuir quantidade · Pacote 1 · em preparação", exact: true }).click();
  await expect(surface.getByLabel("Pacote 1 unidades a cancelar", { exact: true })).toHaveValue("1");
  await expect(surface.getByRole("switch", { name: "Usar valor integral" })).toBeChecked();
  await surface.getByLabel("Valor do produto (R$)").fill("70,00");
  await surface.getByLabel("Valor do frete China (R$)").fill("5,00");
  await expect(surface.getByRole("switch", { name: "Usar valor integral" })).not.toBeChecked();
  await surface.getByRole("button", { name: "Aumentar quantidade · Pacote 1 · em preparação", exact: true }).click();
  await expect(surface.getByLabel("Valor do produto (R$)")).toHaveValue("70,00");
  await surface.getByRole("button", { name: "Diminuir quantidade · Pacote 1 · em preparação", exact: true }).click();
  await surface.getByRole("switch", { name: "Usar valor integral" }).click();
  await expect(surface.getByLabel("Valor do produto (R$)")).toHaveValue("100,00");
  await expect(surface.getByLabel("Valor do frete China (R$)")).toHaveValue("10,00");
  await surface.getByLabel("Valor do produto (R$)").fill("70,00");
  await surface.getByLabel("Valor do frete China (R$)").fill("5,00");
  await expect(surface.getByRole("button", { name: "Registrar solicitação", exact: true })).toBeDisabled();
  await surface.getByLabel("Motivo").fill("Fornecedor cancelou uma unidade");
  await expect(surface.locator("#refund-reason-count")).toHaveText("31/1000");
  await expect(surface.locator(".refund-request-receivable")).toContainText("R$ 75,00");
  for (const [width, height] of [[320, 640], [360, 800], [390, 844], [430, 932], [768, 1000], [1440, 1000]] as const) {
    await page.setViewportSize({ width, height });
    await surface.locator("textarea").scrollIntoViewIfNeeded();
    const layout = await surface.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const footer = element.querySelector(".refund-request-actions")!.getBoundingClientRect();
      const textarea = element.querySelector("textarea")!.getBoundingClientRect();
      return { width: element.clientWidth, scrollWidth: element.scrollWidth, left: bounds.left, right: bounds.right, footerTop: footer.top, footerBottom: footer.bottom, textareaBottom: textarea.bottom, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
    });
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.textareaBottom).toBeLessThanOrEqual(layout.footerTop + 1);
    expect(layout.footerBottom).toBeLessThanOrEqual(layout.viewportHeight);
    await surface.locator(".surface-head").scrollIntoViewIfNeeded();
    await capture(`refund-request-form-${width}`, false);
    await captureMobileUx(`refund-request-form-${width}`, false);
  }
  await capture("refund-request-form-desktop", false);
  await surface.getByRole("button", { name: "Registrar solicitação", exact: true }).click();
  await expandRefundGroups();
  await expect(page.locator(".refunds-total")).toContainText("R$ 0,00");
  await expect(page.locator(".refunds-total")).toContainText("A receber: R$ 75,00");
  await expect(page.locator(".refund-row:visible .refund-status").first()).toHaveText("Aguardando reembolso");
  await expect(page.locator("#cost-section-products-title")).toBeVisible();
  await expect(page.locator(".refund-record-toggle:visible")).toHaveCount(0);
  await expect(page.locator(".refund-row:visible").first().getByRole("button", { name: "Registrar recebimento", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 640 });
  await captureMobileUx("refund-summary-single-request-320-flat-after", false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ver pagamentos", exact: true })).toBeVisible();
  await expect(page.locator(".cost-product-payment")).toHaveCount(0);
  await page.getByRole("button", { name: "Ver pagamentos", exact: true }).click();
  const payment = page.locator(".cost-product-payment");
  await expect(payment.getByText("Informações de reembolso aparecem apenas quando houver itens reembolsados.")).toHaveCount(0);
  await expect(payment.getByText("Reembolso recebido", { exact: true })).toHaveCount(0);
  await expect(payment.locator(".refund-financial-summary")).toHaveCount(0);
  await expect(payment.locator(".cost-payment-order-heading")).toContainText("R$ 222,20");
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
  await expect(page.locator(".refund-row:visible .refund-status").first()).toHaveText("Recebimento registrado");
  await expect(page.locator(".refunds-heading")).toContainText("1 produto · 1 unidade cancelada");
  await expect(page.locator(".refunds-total")).toContainText("R$ 90,00");
  await expect(payment.locator(".cost-product-payment-summary")).toContainText("R$ 222,20");
  await expect(payment.getByText("A receber", { exact: true })).toHaveCount(0);
  await expect(page.locator(".cost-summary-total")).toContainText("R$ 132,20");
  await expect(page.getByText("Pagamento confirmado", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Corrigir valores recebidos", exact: true }).click();
  surface = page.getByRole("dialog");
  await surface.getByLabel("Novo valor recebido do produto (R$)").fill("79,00");
  await surface.getByLabel("Novo valor recebido do frete China (R$)").fill("10,00");
  await surface.getByLabel("Motivo da correção").fill("Conferência do valor do produto");
  await surface.getByRole("button", { name: "Corrigir recebimento", exact: true }).click();
  await expect(page.locator(".refunds-total")).toContainText("R$ 89,00");
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
  await expect(page.locator(".refunds-total")).toContainText("R$ 0,00");
  await expect(payment.locator(".refund-financial-summary")).toHaveCount(0);
  await expect(payment.locator(".cost-payment-order-heading")).toContainText("R$ 222,20");
  await openRefundRequest();
  surface = page.getByRole("dialog");
  await surface.getByLabel("Pacote 1 unidades a cancelar").fill("1");
  await surface.getByLabel("Motivo").fill("Segunda unidade cancelada");
  await surface.getByRole("button", { name: "Registrar solicitação", exact: true }).click();
  await expandRefundGroups();
  await expect(page.locator(".refund-record-toggle:visible")).toHaveCount(0);
  await page.locator(".refund-row.status-requested:visible").getByRole("button", { name: "Anular registro", exact: true }).click();
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
  await openRefundRequest();
  surface = page.getByRole("dialog");
  await expect(surface.getByLabel("Unidades sem pacote a cancelar")).toHaveValue("1");
  await surface.getByLabel("Motivo").fill("Cancelamento integral da segunda unidade");
  await surface.getByRole("button", { name: "Registrar solicitação", exact: true }).click();
  await expandRefundGroups();
  await expect(page.locator(".refund-row.status-requested:visible")).toHaveCount(1);
  await expect(page.locator(".refund-row.status-received:visible")).toHaveCount(1);
  await expect(page.locator("#cost-section-products-title")).toHaveCount(1);
  await expect(page.locator(".cost-table")).toHaveCount(0);
  await expect(page.locator(".cost-products-empty")).toContainText("Nenhum produto permanece no pedido");
  await expect(page.locator(".cost-product-mobile-card")).toHaveCount(0);
  await expect(page.locator(".refunds-total")).toContainText("A receber: R$ 110,00");
  await expect(page.locator(".refund-record-toggle:visible")).toHaveCount(0);
  await expect(page.locator(".refund-row.status-requested:visible")).toContainText("1 unidade cancelada");
  await expect(page.locator(".refund-row.status-requested:visible .refund-details")).toContainText("Produto solicitado");
  await capture("refund-all-cancelled-desktop");
  await expect(page.locator(".refund-group-composition:visible")).toContainText("Taxa do pagamento dessas unidades");
  await expect(page.locator(".refund-group-composition:visible")).toContainText("Custo mantido até agora");
  await expect(page.getByRole("button", { name: /Divisão por pessoa/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".cost-people-list")).toContainText("A receber");
  await capture("refund-people-desktop");
  for (const [width, height] of [[320, 640], [360, 800], [390, 844], [430, 932], [768, 1000], [1440, 1000]] as const) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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

test("summarizes multiple refunds while retaining cancelled product residuals", async ({ page }) => {
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
  async function expandRefundGroups() {
    await expect(page.getByRole("dialog")).toHaveCount(0);
    for (const button of await page.locator(".refund-group-toggle:visible").all()) {
      if (await button.getAttribute("aria-expanded") !== "true") await button.click();
    }
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
  await expect(page.getByRole("button", { name: /Produtos e custos/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".cost-table .cost-compact-row")).toHaveCount(1);
  await expect(page.locator(".refunds-total")).toContainText("R$ 150,00");
  await cancel(itemIds[1], 1, 10_000);
  await page.reload();
  await expect(page.getByRole("button", { name: /Produtos e custos/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".refunds-heading")).toContainText("2 produtos · 3 unidades canceladas");
  await expect(page.locator(".refunds-total")).toContainText("R$ 250,00");
  await expect(page.locator(".cost-table .cost-compact-row")).toHaveCount(1);
  await cancel(itemIds[1], 1, 8_000);
  await page.reload();
  await expect(page.getByRole("button", { name: /Produtos e custos/ })).toHaveAttribute("aria-expanded", "true");
  await expandRefundGroups();
  await expect(page.locator(".refund-row.status-received:visible")).toHaveCount(3);
  await expect(page.locator(".refunds-heading")).toContainText("2 produtos · 4 unidades canceladas");
  await expect(page.locator(".refunds-total")).toContainText("R$ 330,00");
  await expect(page.getByRole("heading", { name: "Custos por produto", exact: true })).toHaveCount(0);
  await expect(page.locator(".cost-table")).toHaveCount(0);
  await expect(page.locator(".cost-products-empty")).toContainText("Nenhum produto permanece no pedido");
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const section = page.getByRole("region", { name: "Produtos reembolsados", exact: true });
    const groupToggle = section.locator(".refund-group-toggle:visible").first();
    if (await groupToggle.getAttribute("aria-expanded") === "true") await groupToggle.click();
    await groupToggle.focus();
    await page.keyboard.press("Space");
    await expect(groupToggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(section.locator(".refund-record-toggle:visible")).toHaveCount(0);
    await expect(section).toContainText("Pagamento original · Pix");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
    if (process.env.LOTI_CAPTURE_REFUNDS_QA === "1") {
      mkdirSync(resolve("artifacts/qa/package-refunds"), { recursive: true });
      await section.screenshot({ path: resolve(`artifacts/qa/package-refunds/refunds-summary-${width}.png`) });
    }
    await groupToggle.click();
    await expect(groupToggle).toHaveAttribute("aria-expanded", "false");
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  const toggle = page.locator(".refund-group-toggle:visible").first();
  await toggle.click();
  await expect(page.locator(".refund-record-flat:visible").first()).toBeVisible();
  // Refund withdrawals retain content history; keep the empty package and resolve its obligations.
  await cost("charge.save", { chargeType: "brazil_freight", valueState: "no_charge", amountCents: null, paymentMethod: null, feeBps: null }, { chargeId: detail.packages[0].brazilFreightCharge.id });
  await cost("charge.save", { chargeType: "customs", valueState: "no_charge", amountCents: null }, { chargeId: detail.packages[0].customsCharge.id });
  await cost("tracking.close", { confirmed: true });
  await page.reload();
  await expect(page.getByRole("button", { name: /Produtos e custos/ })).toHaveAttribute("aria-expanded", "true");
  await expandRefundGroups();
  await expect(page.locator(".refund-record-toggle:visible")).toHaveCount(0);
  await expect(page.locator(".refunds-section").getByRole("button", { name: "Corrigir valores recebidos", exact: true })).toHaveCount(0);
  await expect(page.locator(".refunds-section").getByRole("button", { name: "Fechar composição", exact: true })).toHaveCount(2);
});
