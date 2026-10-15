import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { login } from "./helpers";

test("finalized purchase gets a separate cost tracking with payment, package, and reopen flow", async ({ page }) => {
  const screenshotDir = resolve(process.cwd(), "artifacts/qa/packages-costs-ux");
  const mobileUxScreenshotDir = resolve(process.cwd(), "artifacts/qa/mobile-ux/after");
  async function capture(name: string, fullPage = false) {
    if (process.env.LOTI_CAPTURE_PACKAGES_QA !== "1") return;
    mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: join(screenshotDir, `${name}.png`), fullPage });
  }
  async function captureMobileUx(name: string, fullPage = false) {
    if (process.env.LOTI_CAPTURE_MOBILE_UX !== "1") return;
    mkdirSync(mobileUxScreenshotDir, { recursive: true });
    await page.locator("[data-sonner-toast]").first().waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
    await page.screenshot({ path: join(mobileUxScreenshotDir, `${name}.png`), fullPage });
  }

  await login(page, "profile-qa", "Profile-QA-Old-2026!");
  const origin = test.info().project.use.baseURL ?? "http://localhost:3100";
  const created = await page.request.post("/api/app", { headers: { Origin: origin }, data: { operation: "purchase.save", input: { name: "Custos QA outubro", hubbuyAccount: "hubbuy-qa@example.test" } } });
  expect(created.ok()).toBeTruthy();
  const purchaseData = await created.json();
  const purchase = purchaseData.result as { id: string };
  const memberId = purchaseData.data.currentUser.id as string;
  const added = await page.request.post("/api/app", { headers: { Origin: origin }, data: { operation: "item.save", input: { name: "Tênis de teste", url: "https://example.test/shoe", personId: memberId, quantity: 1, unitPriceCents: 10_000 } } });
  expect(added.ok()).toBeTruthy();
  const finalized = await page.request.post("/api/app", { headers: { Origin: origin }, data: { operation: "purchase.finalize", id: purchase.id, input: true } });
  expect(finalized.ok()).toBeTruthy();
  const list = await page.request.get("/api/packages");
  expect(list.ok()).toBeTruthy();
  const rows = (await list.json()).data as { tracking: { id: string }; purchase: { id: string } }[];
  const tracking = rows.find(row => row.purchase.id === purchase.id)!.tracking;

  await page.goto(`/packages/${tracking.id}`);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole("heading", { name: "Custos QA outubro" })).toBeVisible();
  await expect(page.getByText("Conta HubBuy: hubbuy-qa@example.test")).toBeVisible();
  await capture("initial-1440");
  await captureMobileUx("packages-first-screen-1440");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("initial-390", false);
  await captureMobileUx("packages-first-screen-390", false);
  await page.setViewportSize({ width: 320, height: 640 });
  await expect(page.locator(".cost-summary-card")).toBeInViewport();
  await expect(page.locator('[data-cost-target="next-action"]')).toBeInViewport();
  const firstViewport = await page.evaluate(() => {
    const summary = document.querySelector(".cost-summary-card")!.getBoundingClientRect();
    const action = document.querySelector('[data-cost-target="next-action"]')!.getBoundingClientRect();
    return { width: window.innerWidth, height: window.innerHeight, scrollWidth: document.documentElement.scrollWidth, summaryBottom: summary.bottom, actionBottom: action.bottom };
  });
  expect(firstViewport.scrollWidth).toBeLessThanOrEqual(firstViewport.width);
  expect(firstViewport.summaryBottom).toBeLessThanOrEqual(firstViewport.height);
  expect(firstViewport.actionBottom).toBeLessThanOrEqual(firstViewport.height);
  await captureMobileUx("packages-first-screen-320", false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const productsSection = page.getByRole("button", { name: /Produtos e pagamento/ });
  await expect(productsSection).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("table")).toBeHidden();
  const packagesSection = page.locator(".cost-progressive-toggle").nth(1);
  await expect(packagesSection).toHaveAttribute("aria-expanded", "false");
  await packagesSection.click();
  await expect(page.locator(".cost-package-toggle")).toHaveAttribute("aria-expanded", "false");
  await packagesSection.click();
  await expect(page.getByRole("button", { name: /Divisão por pessoa/ })).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: /Informar frete China de Tênis/ }).click();
  await expect(page.locator(".cost-table").getByRole("button", { name: "Editar", exact: true })).toBeFocused();
  for (let column = 1; column <= 6; column++) await expect(page.locator(".cost-table thead th").nth(column)).toHaveCSS("text-align", "right");
  await capture("products-1440");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".cost-product-mobile-list")).toBeVisible();
  await expect(page.locator(".cost-table-wrap")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator(".cost-product-mobile-card").evaluate(element => element.scrollIntoView({ block: "start" }));
  await capture("products-390", false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".cost-table").getByRole("button", { name: "Ver composição", exact: true }).click();
  const composition = page.getByRole("dialog");
  await expect(composition.getByRole("heading", { name: "Composição dos custos" })).toBeVisible();
  await expect(composition.getByText("Tênis de teste", { exact: true })).toBeVisible();
  await expect(composition.getByText("Preço efetivo", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(composition).toHaveCSS("opacity", "1");
  await capture("product-breakdown-390", false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await composition.getByRole("button", { name: "Fechar" }).click();
  await expect(page.locator(".cost-table").getByRole("button", { name: "Ver composição", exact: true })).toBeFocused();
  await page.locator(".cost-table").getByRole("button", { name: "Editar", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Frete China por unidade").selectOption("known");
  await dialog.getByLabel("Valor em R$").nth(1).fill("10,00");
  await dialog.getByRole("button", { name: "Salvar custos", exact: true }).click();
  await page.locator(".cost-product-payment select").selectOption("pix");
  await page.getByRole("button", { name: "Marcar como pago", exact: true }).click();
  const payment = page.locator(".cost-product-payment");
  await expect(payment.locator(".cost-product-payment-summary > div")).toHaveCount(4);
  await expect(payment.getByText("Pago", { exact: true })).toBeVisible();
  await expect(payment.getByText("Parcial", { exact: true })).toBeVisible();
  await expect(payment.getByRole("status", { name: "Pagamento pago" })).toBeVisible();
  await expect(payment.getByRole("button", { name: "Pagamento confirmado", exact: true })).toHaveCount(0);
  await expect(payment.getByText("Reembolso recebido", { exact: true })).toHaveCount(0);
  await expect(payment.getByText("A receber", { exact: true })).toHaveCount(0);
  await expect(payment.getByText("Informações de reembolso aparecem apenas quando houver itens reembolsados.")).toHaveCount(0);
  await page.getByText("Custos do produto atualizados", { exact: true }).waitFor({ state: "hidden" });
  for (const [width, height] of [[320, 640], [360, 800], [390, 844], [430, 932], [768, 1000], [1440, 1000]] as const) {
    await page.setViewportSize({ width, height });
    const dimensions = await payment.evaluate(element => ({
      width: element.clientWidth,
      content: element.scrollWidth,
      offenders: [...element.querySelectorAll<HTMLElement>("*")].map(child => {
        const bounds = child.getBoundingClientRect();
        return { tag: child.tagName, className: child.className, text: child.innerText?.slice(0, 60), left: Math.round(bounds.left), right: Math.round(bounds.right), width: child.clientWidth, scrollWidth: child.scrollWidth };
      }).filter(child => child.scrollWidth > child.width + 1 || child.right > element.getBoundingClientRect().right + 1 || child.left < element.getBoundingClientRect().left - 1).slice(0, 10),
    }));
    expect(dimensions.content, `Payment overflow at ${width}px: ${JSON.stringify(dimensions.offenders)}`).toBeLessThanOrEqual(dimensions.width);
    if (process.env.LOTI_CAPTURE_PACKAGES_QA === "1") {
      mkdirSync(screenshotDir, { recursive: true });
      await payment.screenshot({ path: join(screenshotDir, `product-payment-${width}.png`) });
    }
  }
  await page.locator(".cost-table").getByRole("button", { name: "Editar", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Valor em R$").first().fill("101,00");
  await dialog.getByRole("button", { name: "Salvar custos", exact: true }).click();
  await page.getByRole("dialog").filter({ hasText: "Voltar pagamento para pendente?" }).getByRole("button", { name: "Salvar e invalidar pagamento", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Marcar como pago", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Marcar como pago", exact: true }).click();
  await page.getByRole("button", { name: /Informar frete Brasil de Pacote 1/i }).click();
  await expect(page.locator(".cost-charge-summary").first().getByRole("button", { name: "Informar Frete Brasil", exact: true })).toBeFocused();
  await expect(page.locator(".cost-package-toggle")).toHaveAttribute("aria-expanded", "true");
  await page.getByText("Custos do produto atualizados", { exact: true }).waitFor({ state: "hidden" });
  await capture("package-open-1440");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".cost-package-toggle").evaluate(element => element.scrollIntoView({ block: "start" }));
  await capture("package-open-390", false);
  await expect(page.getByLabel("Tênis de teste neste pacote")).toBeHidden();
  await page.getByRole("button", { name: "Ações para Pacote 1", exact: true }).click();
  await page.getByRole("menuitem", { name: "Editar conteúdo", exact: true }).click();
  const contentEditor = page.getByRole("dialog");
  await contentEditor.getByLabel("Tênis de teste neste pacote").fill("0");
  await contentEditor.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.locator(".cost-package-items")).toContainText("1 unidade");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".cost-charge-summary").nth(0).getByRole("button", { name: "Informar Frete Brasil", exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCSS("opacity", "1");
  await capture("charge-form-1440", false);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toHaveCSS("opacity", "1");
  await dialog.evaluate(element => { element.scrollTop = 0; });
  await capture("charge-form-390", false);
  await captureMobileUx("charge-form-390-after", false);
  await dialog.getByLabel("Estado do valor").selectOption("known");
  await dialog.getByLabel("Valor em R$").fill("25,00");
  await dialog.getByLabel("Método de pagamento").selectOption("pix");
  await dialog.getByRole("button", { name: "Salvar cobrança", exact: true }).click();
  await page.getByRole("button", { name: "Marcar como pago", exact: true }).click();
  await page.locator(".cost-charge-summary").nth(1).getByRole("button", { name: "Informar Receita", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Estado do valor").selectOption("no_charge");
  await dialog.getByRole("button", { name: "Salvar cobrança", exact: true }).click();
  await page.getByRole("button", { name: "Encerrar custos", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Encerrar custos", exact: true }).click();
  await expect(page.getByText("Custos encerrados", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Mais ações para/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Reabrir acompanhamento", exact: true }).click();
  await page.getByLabel("Motivo").fill("Ajuste solicitado na revisão QA");
  await page.getByRole("button", { name: "Confirmar reabertura", exact: true }).click();
  await expect(page.getByText("Custos abertos", { exact: true })).toBeVisible();
  for (const [width, height] of [[320, 640], [360, 800], [390, 844], [430, 932], [768, 1000], [1440, 1000]] as const) {
    await page.setViewportSize({ width, height });
    const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, content: document.documentElement.scrollWidth }));
    expect(dimensions.content, `Horizontal overflow at ${dimensions.viewport}px: ${dimensions.content}px`).toBeLessThanOrEqual(dimensions.viewport);
  }
  await expect(page.locator(".mobile-island a")).toHaveCount(4);
});
