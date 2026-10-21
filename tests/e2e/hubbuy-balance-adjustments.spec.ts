import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { login } from "./helpers";
import type { CostTrackingView } from "@/lib/domain/package-cost-reading";

for (const width of [390, 768, 1440]) test(`manual bonus and audited reversal at ${width}px`, async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width, height: 1000 });
  await login(page, "profile-qa", "Profile-QA-Old-2026!");
  const origin = test.info().project.use.baseURL ?? "http://localhost:3100";
  const label = `Bônus QA ${width} ${Date.now()}`;
  const response = await page.request.post("/api/hubbuy/accounts", { headers: { Origin: origin }, data: { operation: "createAccount", workspaceId: "profile-qa-workspace", label, idempotencyKey: crypto.randomUUID(), confirmZeroBalance: true } });
  expect(response.ok()).toBe(true);
  const accountId = (await response.json()).data.accountId as string;
  await page.goto("/packages/accounts");
  async function selectAccount() {
    if (width < 1101) await page.getByLabel("Conta selecionada").selectOption(accountId);
    else await page.getByRole("button", { name: new RegExp(label) }).click();
    await expect(page.getByText("Ativa e conciliada", { exact: true })).toBeVisible();
  }
  async function openAdjustment() {
    await page.getByRole("button", { name: "Ações", exact: true }).click();
    await page.getByRole("menuitem", { name: "Registrar crédito/ajuste" }).click();
    return page.getByRole("dialog", { name: "Registrar crédito/ajuste" });
  }
  await selectAccount();
  let drawer = await openAdjustment();
  await drawer.getByLabel("Valor CNY", { exact: true }).fill("1,14");
  await drawer.locator(".hubbuy-adjustment-people").getByRole("checkbox").first().check();
  const choice = drawer.locator(".hubbuy-adjustment-person-choice").first();
  const checkboxBounds = await choice.getByRole("checkbox").boundingBox();
  const nameBounds = await choice.locator("span").boundingBox();
  expect(checkboxBounds!.width).toBeLessThanOrEqual(20);
  expect(checkboxBounds!.height).toBeLessThanOrEqual(20);
  expect(nameBounds!.x - (checkboxBounds!.x + checkboxBounds!.width)).toBeGreaterThanOrEqual(7);
  expect(nameBounds!.x - (checkboxBounds!.x + checkboxBounds!.width)).toBeLessThanOrEqual(12);
  await drawer.getByRole("button", { name: "Dividir CNY igualmente" }).click();
  await drawer.getByLabel("Referência externa (opcional)").fill(`roulette-synthetic-${width}`);
  await drawer.getByLabel("Motivo", { exact: true }).fill("Bônus sintético da roleta");
  mkdirSync("artifacts/qa", { recursive: true });
  await drawer.locator(".surface-body").evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: `artifacts/qa/hubbuy-adjustment-form-${width}-${process.env.LOTI_E2E_THEME ?? "light"}.png` });
  await drawer.getByRole("button", { name: "Conferir prévia" }).click();
  const preview = drawer.getByRole("region", { name: "Prévia do ajuste" });
  await expect(preview).toContainText("1,14");
  await expect(preview).toContainText("0,00");
  await preview.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `artifacts/qa/hubbuy-adjustment-${width}-${process.env.LOTI_E2E_THEME ?? "light"}.png` });
  await drawer.getByRole("checkbox", { name: "Confirmo os valores e as pessoas afetadas." }).check();
  if (width === 390) {
    // The server commits, but the response is lost. Recovery must reuse the same key after reload.
    await page.route(`**/api/hubbuy/accounts/${accountId}`, async route => {
      if (route.request().method() === "POST" && route.request().postDataJSON()?.operation === "adjustment.record") {
        const committed = await route.fetch(); expect(committed.ok()).toBe(true); await route.abort("failed");
      } else await route.continue();
    });
    await drawer.getByRole("button", { name: "Confirmar registro", exact: true }).click();
    await expect(drawer.getByText("Tentativa pendente", { exact: true })).toBeVisible();
    await expect(drawer.getByRole("alert")).toContainText("incerta");
    await page.unroute(`**/api/hubbuy/accounts/${accountId}`);
    await page.reload(); await selectAccount(); drawer = await openAdjustment();
    await drawer.getByRole("button", { name: "Conferir registro pendente" }).click();
  } else await drawer.getByRole("button", { name: "Confirmar registro", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(page.getByRole("cell", { name: "Bônus promocional", exact: true })).toBeVisible();
  const statement = await page.request.get(`/api/hubbuy/accounts/${accountId}/statement`);
  const entries = (await statement.json()).data.entries;
  expect(entries).toHaveLength(1); expect(entries[0].amountCnyMinor).toBe(114); expect(entries[0].historicalBrlCents).toBe(0);
  await page.getByRole("button", { name: "Detalhes do ajuste" }).click();
  await page.getByRole("dialog", { name: "Detalhes do ajuste" }).getByRole("button", { name: "Anular ajuste", exact: true }).click();
  const reversal = page.getByRole("dialog", { name: "Anular ajuste manual" });
  await reversal.getByLabel("Motivo", { exact: true }).fill("Anulação do bônus sintético QA");
  await reversal.getByRole("button", { name: "Conferir prévia" }).click();
  await expect(reversal.getByRole("region", { name: "Prévia do ajuste" })).toContainText("Saída");
  await reversal.getByRole("checkbox", { name: "Confirmo os valores e as pessoas afetadas." }).check();
  await reversal.getByRole("button", { name: "Confirmar anulação", exact: true }).click();
  await expect(reversal).not.toBeVisible();
  const balance = await page.request.get(`/api/hubbuy/accounts/${accountId}`);
  expect((await balance.json()).data).toMatchObject({ reconciled: true, account: { balanceCnyMinor: 0, revision: 2 } });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("bonus-funded product supports native zero-BRL request, edit and receipt in the UI", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, "profile-qa", "Profile-QA-Old-2026!");
  const origin = test.info().project.use.baseURL ?? "http://localhost:3100", headers = { Origin: origin };
  const purchaseResponse = await page.request.post("/api/app", { headers, data: { operation: "purchase.save", input: { name: `Bônus nativo QA ${Date.now()}` } } });
  expect(purchaseResponse.ok()).toBe(true);
  const purchaseData = await purchaseResponse.json(), memberId = purchaseData.data.currentUser.id as string;
  const accountResponse = await page.request.post("/api/hubbuy/accounts", { headers, data: { operation: "createAccount", workspaceId: "profile-qa-workspace", label: "Conta de bônus nativo QA", idempotencyKey: crypto.randomUUID(), confirmZeroBalance: true } });
  const accountId = (await accountResponse.json()).data.accountId as string;
  const bonusResponse = await page.request.post(`/api/hubbuy/accounts/${accountId}`, { headers, data: { operation: "adjustment.record", kind: "promotional_bonus", expectedRevision: 0, idempotencyKey: crypto.randomUUID(), occurredAt: new Date().toISOString(), reason: "Bônus nativo sintético", amountCnyMinor: 115, shares: [{ personId: memberId, amountCnyMinor: 115 }] } });
  expect(bonusResponse.ok()).toBe(true);
  const added = await page.request.post("/api/app", { headers, data: { operation: "item.save", input: { name: "Original QA", url: "https://example.test/original", personId: memberId, quantity: 1, unitPriceCents: 100 } } });
  expect(added.ok()).toBe(true);
  const finalized = await page.request.post("/api/app", { headers, data: { operation: "purchase.finalize", id: purchaseData.result.id, input: true } });
  expect(finalized.ok()).toBe(true);
  const trackings = (await (await page.request.get("/api/packages")).json()).data as { tracking: { id: string }; purchase: { id: string } }[];
  const trackingId = trackings.find(row => row.purchase.id === purchaseData.result.id)!.tracking.id;
  let detail = (await (await page.request.get(`/api/packages/${trackingId}`)).json()).data as CostTrackingView;
  async function costPost(operation: string, input: Record<string, unknown>, extra: Record<string, unknown> = {}) {
    const response = await page.request.post(`/api/packages/${trackingId}`, { headers, data: { operation, input, ...extra } });
    expect(response.ok(), await response.text()).toBe(true);
    detail = (await response.json()).data as CostTrackingView;
  }
  await costPost("order.additional.create", { expectedRevision: detail.tracking.revision, accountId, idempotencyKey: crypto.randomUUID(), items: [{ name: "Item bônus UI", url: "https://example.test/native-bonus", platform: "other", visualKey: "generic", quantity: 2, itemOrder: 0, nativeProductState: "known", nativeProductCnyMinor: 115, nativeChinaState: "no_charge", nativeChinaCnyMinor: null, participants: [{ personId: memberId, weightMode: "equal", weight: 1 }] }] });
  const orderId = detail.productOrders.find(row => row.kind === "additional")!.id;
  await costPost("order.additional.pay_mixed", { expectedRevision: detail.tracking.revision, idempotencyKey: crypto.randomUUID(), useOwnBalance: true, external: null }, { orderId });
  await page.goto(`/packages/${trackingId}`);
  await page.getByRole("button", { name: "Ver composição de Item bônus UI", exact: true }).click();
  await page.getByRole("button", { name: "Mais ações para Item bônus UI", exact: true }).click();
  await page.getByRole("menuitem", { name: "Registrar reembolso", exact: true }).click();
  const request = page.getByRole("dialog", { name: "Registrar reembolso", exact: true });
  await expect(request.getByLabel("Produto solicitado (CNY)")).toHaveValue("1,15");
  await request.getByLabel("Motivo", { exact: true }).fill("Cancelamento sintético do bônus");
  await request.getByRole("button", { name: "Registrar solicitação", exact: true }).click();
  await expect(request).not.toBeVisible();
  const refundRow = page.getByRole("table", { name: "Reembolsos agrupados por produto" }).getByRole("row").filter({ hasText: "Item bônus UI" });
  await refundRow.getByRole("button", { name: "Ver composição", exact: true }).click();
  await expect(page.getByText("Valor nativo solicitado", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByRole("button", { name: "Editar solicitação", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Editar solicitação", exact: true });
  await edit.getByLabel("Motivo da alteração").fill("Solicitação nativa conferida QA");
  await edit.getByRole("button", { name: "Editar solicitação", exact: true }).click();
  await expect(edit).not.toBeVisible();
  await page.getByRole("button", { name: "Registrar recebimento", exact: true }).click();
  const receipt = page.getByRole("dialog", { name: "Registrar recebimento", exact: true });
  await expect(receipt.getByLabel("Produto recebido (R$)")).toHaveValue("0,00");
  await expect(receipt.getByLabel("Produto recebido (CNY)")).toHaveValue("1,15");
  await receipt.getByLabel("Comprovante ou referência do crédito na HubBuy").fill("Crédito nativo sintético recebido");
  await receipt.getByRole("button", { name: /Registrar recebimento e creditar/ }).click();
  await expect(receipt).not.toBeVisible();
  const balance = (await (await page.request.get(`/api/hubbuy/accounts/${accountId}`)).json()).data;
  expect(balance).toMatchObject({ reconciled: true, account: { balanceCnyMinor: 115 }, rights: [{ availableHistoricalBrlCents: 0 }] });
});
