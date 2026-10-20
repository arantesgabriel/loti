import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { login } from "./helpers";

test("creates zero-balance HubBuy accounts and credits the first confirmed refund inline", async ({ page }) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  const screenshotDir = resolve(process.cwd(), "artifacts/qa/hubbuy-account-creation");
  const drawerScreenshotDir = resolve(process.cwd(), "artifacts/qa/additional-product-drawers");
  async function capture(name: string) {
    if (process.env.LOTI_CAPTURE_HUBBUY_QA !== "1") return;
    mkdirSync(screenshotDir, { recursive: true });
    await page.locator("[data-sonner-toast]").first().waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
    await page.screenshot({ path: join(screenshotDir, `${name}.png`), fullPage: true });
  }
  async function captureDrawer(name: string) {
    if (process.env.LOTI_CAPTURE_HUBBUY_QA !== "1") return;
    mkdirSync(drawerScreenshotDir, { recursive: true });
    await page.locator("[data-sonner-toast]").first().waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
    await page.screenshot({ path: join(drawerScreenshotDir, `${name}.png`) });
  }

  await login(page, "profile-qa", "Profile-QA-Old-2026!");
  const origin = test.info().project.use.baseURL ?? "http://localhost:3100";
  const suffix = Date.now().toString();
  const independentAccountName = `Conta zero QA ${suffix}`;
  const refundAccountName = `Conta refund QA ${suffix}`;

  await page.goto("/packages/accounts");
  await expect(page.getByRole("heading", { name: "Contas HubBuy", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Contas HubBuy" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Acompanhamentos" })).toHaveCount(0);
  const accountManager = page.locator('section[aria-labelledby="hubbuy-accounts-title"]');
  await accountManager.getByRole("textbox", { name: "Adicionar conta HubBuy", exact: true }).fill(independentAccountName);
  await accountManager.getByRole("button", { name: "Criar conta · saldo ¥0" }).click();
  const independentAccount = accountManager.locator(".cost-hubbuy-account").filter({ hasText: independentAccountName });
  await expect(independentAccount).toContainText("Ativa e conciliada");
  await expect(independentAccount).toContainText("¥ 0,00");

  const created = await page.request.post("/api/app", { headers: { Origin: origin }, data: { operation: "purchase.save", input: { name: `HubBuy inline QA ${suffix}` } } });
  expect(created.ok()).toBeTruthy();
  const purchaseData = await created.json();
  const purchase = purchaseData.result as { id: string };
  const memberId = purchaseData.data.currentUser.id as string;
  const memberName = purchaseData.data.currentUser.name as string;
  const added = await page.request.post("/api/app", { headers: { Origin: origin }, data: { operation: "item.save", input: { name: "Item base QA", url: `https://example.test/base-${suffix}`, personId: memberId, quantity: 1, unitPriceCents: 1_000 } } });
  expect(added.ok()).toBeTruthy();
  const finalized = await page.request.post("/api/app", { headers: { Origin: origin }, data: { operation: "purchase.finalize", id: purchase.id, input: true } });
  expect(finalized.ok()).toBeTruthy();
  const rows = (await (await page.request.get("/api/packages")).json()).data as { tracking: { id: string }; purchase: { id: string } }[];
  const trackingId = rows.find(row => row.purchase.id === purchase.id)!.tracking.id;
  const costUrl = `/api/packages/${trackingId}`;
  async function costPost(operation: string, input: Record<string, unknown>, extra: Record<string, unknown> = {}) {
    const response = await page.request.post(costUrl, { headers: { Origin: origin }, data: { operation, input, ...extra } });
    expect(response.ok(), await response.text()).toBeTruthy();
    return (await response.json()).data;
  }

  let detail = (await (await page.request.get(costUrl)).json()).data;
  detail = await costPost("item.save", {
    expectedRevision: detail.tracking.revision, itemId: detail.items[0].id,
    effectivePriceState: "known", effectivePriceUnitCents: 1_000,
    chinaFreightState: "no_charge", chinaFreightUnitCents: null,
  });
  detail = await costPost("charge.save", { expectedRevision: detail.tracking.revision, chargeType: "products", paymentMethod: "pix" }, { chargeId: detail.productsCharge.id });
  detail = await costPost("charge.paid", { expectedRevision: detail.tracking.revision }, { chargeId: detail.productsCharge.id });
  await costPost("refund.request", {
    expectedRevision: detail.tracking.revision, costItemId: detail.items[0].id, quantity: 1,
    requestedProductCents: 500, requestedChinaCents: 0, reason: "Solicitação sintética para validar conta inline",
    packageRemovals: [{ packageId: detail.packages[0].id, quantity: 1 }], unassignedQuantity: 0,
  });

  await page.goto(`/packages/${trackingId}`);
  await expect(page.getByRole("button", { name: /Produtos e custos/ })).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("row").filter({ hasText: "Item base QA" }).getByRole("button", { name: "Ver composição", exact: true }).click();
  await page.getByRole("button", { name: "Registrar recebimento" }).click();
  const refundDialog = page.getByRole("dialog").filter({ hasText: "Registrar recebimento" });
  await refundDialog.getByLabel("Produto recebido (R$)").fill("3,50");
  await refundDialog.getByLabel("Frete China recebido (R$)").fill("0,00");
  await refundDialog.getByLabel("Onde o reembolso foi recebido?").selectOption("hubbuy");
  await refundDialog.getByRole("combobox").nth(1).selectOption("__create__");
  await refundDialog.getByLabel("Nome da nova conta").fill(refundAccountName);
  await refundDialog.getByLabel("Produto recebido (CNY)").fill("5,00");
  await refundDialog.getByLabel("Frete China recebido (CNY)").fill("0,00");
  await refundDialog.getByLabel("Comprovante ou referência do crédito na HubBuy").fill("Crédito sintético efetivamente confirmado");
  await expect(refundDialog.getByRole("button", { name: /Registrar recebimento e creditar/ })).toBeEnabled();
  await refundDialog.getByRole("button", { name: /Registrar recebimento e creditar/ }).click();

  await page.goto("/packages/accounts");
  const creditedAccount = page.locator(".cost-hubbuy-account").filter({ hasText: refundAccountName });
  await page.getByRole("navigation", { name: "Contas HubBuy cadastradas" }).getByRole("button").filter({ hasText: refundAccountName }).click();
  await expect(creditedAccount).toContainText("Ativa e conciliada");
  await expect(creditedAccount).toContainText("¥ 5,00");
  await expect(creditedAccount.getByRole("region", { name: "Direitos individuais", exact: true })).toContainText(memberName);
  await expect(creditedAccount.getByRole("region", { name: "Direitos individuais", exact: true })).toContainText("¥ 5,00 · R$ 3,50");
  await expect(creditedAccount.getByRole("region", { name: "Direitos individuais", exact: true })).toContainText("Item base QA");
  await expect(creditedAccount.getByRole("heading", { name: "Última revisão" })).toHaveCount(0);
  await expect(page.getByRole("table")).toContainText("Crédito");
  await expect(page.getByRole("table")).toContainText("R$ 3,50");
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width <= 1100) {
      const picker = page.getByRole("combobox", { name: "Conta selecionada" });
      await expect(picker).toBeVisible();
      await expect(picker.locator("option:checked")).toContainText(refundAccountName);
    } else await expect(page.locator('.hubbuy-account-option[aria-current="true"]')).toBeInViewport({ ratio: 0.95 });
    await capture(`accounts-overview-${width}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(creditedAccount.getByRole("button", { name: "Ações", exact: true })).toBeDisabled();
  await expect(creditedAccount).toContainText("Esta conta tem saldo");

  await page.goto(`/packages/${trackingId}`);
  await expect(page.getByRole("button", { name: /Produtos e custos/ })).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: /Adicionar produto/ }).click();
  const additional = page.locator(".cost-additional-order-surface");
  const accountSelector = additional.getByLabel("Conta HubBuy").last();
  const refundOption = accountSelector.locator("option").filter({ hasText: refundAccountName });
  await accountSelector.selectOption(await refundOption.getAttribute("value")!);
  await additional.getByRole("textbox", { name: "Produto", exact: true }).fill(`Moletom adicional QA ${suffix}`);
  await additional.getByLabel("Link").fill(`https://weidian.com/item.html?itemID=${suffix}`);
  await additional.getByLabel("Preço do produto por unidade (CNY)").fill("10,00");
  await additional.getByLabel("Sem cobrança de frete China").check();
  const participants = additional.locator(".cost-order-participants label");
  for (const participant of await participants.all()) {
    const checkbox = participant.locator("input[type=checkbox]");
    const participantName = await participant.innerText();
    if (participantName.includes(memberName) || participantName.includes("Profile Reader QA")) await checkbox.check();
    else await checkbox.uncheck();
  }
  await expect(additional.getByRole("heading", { name: "1. Conta HubBuy" })).toBeVisible();
  await expect(additional.getByRole("heading", { name: "2. Dados do item" })).toBeVisible();
  await expect(additional.getByRole("heading", { name: "3. Valores e divisão" })).toBeVisible();
  await expect(additional.getByRole("button", { name: "Continuar para o pagamento" })).toBeInViewport();
  await captureDrawer("add-product-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(additional).toBeVisible();
  expect(await additional.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await expect(additional.getByRole("button", { name: "Continuar para o pagamento" })).toBeInViewport();
  await captureDrawer("add-product-mobile");
  await additional.locator(".surface-body").evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(additional.locator(".cost-order-participant-options")).toBeInViewport({ ratio: 0.8 });
  await captureDrawer("add-product-mobile-participants");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await additional.getByRole("button", { name: "Continuar para o pagamento" }).click();
  await expect(additional.getByRole("heading", { name: "Pagamento", exact: true })).toBeVisible();
  await expect(additional).toContainText("Saldo próprio previsto");
  await expect(additional).toContainText("Adiantamento");
  await expect(additional).toContainText("Complemento");
  await expect(additional.getByRole("button", { name: "Editar", exact: true })).toBeVisible();
  await captureDrawer("confirm-purchase-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(additional).toBeVisible();
  expect(await additional.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await expect(additional.getByRole("button", { name: "Confirmar compra", exact: true })).toBeInViewport();
  await captureDrawer("confirm-purchase-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const useOwnBalance = additional.getByRole("checkbox", { name: "Usar saldo próprio dos participantes" });
  await expect(useOwnBalance).toBeChecked();
  await useOwnBalance.uncheck();
  await additional.getByRole("button", { name: "Adicionar adiantamento", exact: true }).click();
  const advance = additional.locator(".cost-order-advance");
  await advance.getByLabel("Quem recebe").selectOption({ label: "Profile Reader QA" });
  await advance.getByLabel("Quem financia").selectOption({ label: memberName });
  await advance.getByLabel("Valor CNY").fill("5,00");
  await expect(additional.locator(".cost-payment-summary-row").filter({ hasText: "Adiantamento" })).toContainText("¥ 5,00");
  await expect(additional.locator(".cost-payment-summary-row").filter({ hasText: "Saldo próprio previsto" })).toContainText("¥ 0,00");
  await additional.getByLabel("Principal externo em BRL").fill("8,00");
  await additional.getByRole("button", { name: "Confirmar compra", exact: true }).click();
  await expect(additional).toContainText("1 unidade será associada ao pacote escolhido.");
  await expect(additional).toContainText("Base de saldo R$ 3,50 · Dinheiro novo R$ 8,08 (taxas R$ 0,08)");
  await additional.getByRole("button", { name: "Associar ao pacote" }).click();
  await expect(additional).toBeHidden();
  await expect(page.getByRole("row").filter({ hasText: `Moletom adicional QA ${suffix}` }).getByText("Pedido adicional", { exact: true })).toBeVisible();

  await expect(page.getByRole("button", { name: /^Pacotes / })).toHaveAttribute("aria-expanded", "true");
  const packageCard = page.locator(".cost-package").first();
  await packageCard.locator(".cost-package-toggle").click();
  await expect(packageCard).toContainText(`Moletom adicional QA ${suffix}`);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await capture("account-creation-desktop");
  await page.setViewportSize({ width: 320, height: 720 });
  await capture("account-creation-320");
  const mobileWidth = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll<HTMLElement>("body *")].map(element => {
      const bounds = element.getBoundingClientRect();
      return { tag: element.tagName, className: String(element.className).slice(0, 80), text: element.innerText?.slice(0, 70), left: Math.round(bounds.left), right: Math.round(bounds.right), width: element.clientWidth, scrollWidth: element.scrollWidth };
    }).filter(element => element.right > window.innerWidth + 1 || element.left < -1).sort((a, b) => b.right - a.right).slice(0, 12),
  }));
  expect(mobileWidth.scrollWidth, JSON.stringify(mobileWidth.offenders)).toBeLessThanOrEqual(320);
});
