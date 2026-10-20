import { expect, test } from "@playwright/test";
import { login } from "./helpers";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

test("account selection, search, creation focus and statement retries preserve the selected context", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, "profile-qa", "Profile-QA-Old-2026!");
  const origin = test.info().project.use.baseURL ?? "http://localhost:3100";
  const suffix = Date.now();
  const names = [`Conta interface A ${suffix}`, `Conta interface B ${suffix}`];
  const ids: string[] = [];
  for (const label of names) {
    const response = await page.request.post("/api/hubbuy/accounts", { headers: { Origin: origin }, data: { operation: "createAccount", workspaceId: "profile-qa-workspace", label, idempotencyKey: crypto.randomUUID(), confirmZeroBalance: true } });
    expect(response.ok()).toBe(true);
    ids.push((await response.json()).data.accountId);
  }

  let failBalance = true, failStatement = true, failMore = true;
  let releaseStatement!: () => void;
  const heldStatement = new Promise<void>(resolve => { releaseStatement = resolve; });
  const entries = Array.from({ length: 12 }, (_, index) => ({
    id: `ui-entry-${index}`, sequence: index + 1, direction: index % 2 ? "debit" : "credit",
    amountCnyMinor: 100, historicalBrlCents: 70, sourceType: "manual_adjustment",
    occurredAt: null, operationRecordedAt: index === 0 ? null : "2026-10-17T12:00:00Z", reason: `Movimento sintético ${index + 1}`,
    balanceAfterCnyMinor: index % 2 ? 0 : 100,
  }));
  await page.route(`**/api/hubbuy/accounts/${ids[1]}`, async route => {
    if (failBalance) {
      failBalance = false;
      await route.fulfill({ status: 503, json: { error: "Direitos temporariamente indisponíveis" } });
    } else await route.continue();
  });
  await page.route(`**/api/hubbuy/accounts/${ids[1]}/statement?*`, async route => {
    const isMore = new URL(route.request().url()).searchParams.has("afterSequence");
    if (failStatement) {
      failStatement = false;
      await heldStatement;
      await route.fulfill({ status: 503, json: { error: "Extrato temporariamente indisponível" } });
    } else if (isMore && failMore) {
      failMore = false;
      await route.fulfill({ status: 503, json: { error: "Próxima página indisponível" } });
    } else await route.fulfill({ json: { data: { entries: isMore ? entries.slice(10) : entries.slice(0, 10), nextAfterSequence: isMore ? null : 10 } } });
  });
  await page.goto("/packages/accounts");
  const picker = page.getByRole("navigation", { name: "Contas HubBuy cadastradas" });
  const search = page.getByRole("searchbox", { name: "Buscar conta" });
  await search.fill(names[1]);
  await expect(picker.getByRole("button")).toHaveCount(1);
  await picker.getByRole("button").click();
  await expect(page.getByRole("heading", { name: names[1], exact: true })).toBeVisible();
  await expect(page.getByText("Carregando movimentações…")).toBeVisible();
  releaseStatement();
  await expect(page.getByRole("alert").filter({ hasText: "Direitos temporariamente" })).toBeVisible();
  await expect(page.locator(".hubbuy-balance-brl")).toContainText("Base histórica indisponível");
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(page.locator(".hubbuy-balance-brl")).toContainText("R$ 0,00");
  await page.getByRole("button", { name: "Tentar carregar extrato" }).click();
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(11);
  await expect(page.getByRole("table")).toContainText("Data não informada");
  await expect(page.getByRole("table")).toContainText("R$ 0,70");
  await page.getByRole("button", { name: "Carregar mais", exact: true }).click();
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(11);
  await page.getByRole("button", { name: "Tentar carregar extrato" }).click();
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(13);
  await expect(page.getByRole("button", { name: "Carregar mais", exact: true })).toHaveCount(0);

  await search.fill("conta inexistente");
  await expect(page.getByText("Nenhuma conta encontrada.")).toBeVisible();
  await expect(page.getByRole("heading", { name: names[1], exact: true })).toBeVisible();
  await search.fill(names[0]);
  await picker.getByRole("button").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: names[0], exact: true })).toBeVisible();
  await expect(page.getByText("Nenhuma movimentação registrada nesta conta.")).toBeVisible();
  await expect(page.locator(".hubbuy-account-notice")).toHaveCount(0);
  await expect(page.getByRole("table")).not.toContainText("Movimento sintético");
  await page.getByRole("button", { name: "Adicionar conta", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Adicionar conta HubBuy", exact: true })).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Adicionar conta HubBuy", exact: true })).toHaveCount(1);
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole("combobox", { name: "Conta selecionada" }).selectOption(ids[1]);
  await expect(page.getByRole("heading", { name: names[1], exact: true })).toBeVisible();
});

test("individual rights show remaining products, accessible expansion and full-width responsive composition", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, "profile-qa", "Profile-QA-Old-2026!");
  const origin = test.info().project.use.baseURL ?? "http://localhost:3100";
  const suffix = Date.now();
  async function appPost(data: Record<string, unknown>) {
    const response = await page.request.post("/api/app", { headers: { Origin: origin }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }
  const purchaseData = await appPost({ operation: "purchase.save", input: { name: `Composição QA ${suffix}` } });
  const memberId = purchaseData.data.currentUser.id as string;
  const memberName = purchaseData.data.currentUser.name as string;
  const names = ["Produto X com nome longo e variação histórica", "Produto Y", "Produto Z", "Produto W"];
  for (const name of names) await appPost({ operation: "item.save", input: { name, variant: "Modelo sintético", url: `https://example.test/origins-${suffix}`, personId: memberId, quantity: 1, unitPriceCents: 1425 } });
  await appPost({ operation: "purchase.finalize", id: purchaseData.result.id, input: true });
  const trackings = (await (await page.request.get("/api/packages")).json()).data as { tracking: { id: string }; purchase: { id: string } }[];
  const trackingId = trackings.find(row => row.purchase.id === purchaseData.result.id)!.tracking.id;
  const costUrl = `/api/packages/${trackingId}`;
  async function costPost(operation: string, input: Record<string, unknown>, extra: Record<string, unknown> = {}) {
    const response = await page.request.post(costUrl, { headers: { Origin: origin }, data: { operation, input, ...extra } });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).data;
  }
  let detail = (await (await page.request.get(costUrl)).json()).data;
  const costIds = detail.items.map((item: { id: string }) => item.id) as string[];
  for (const itemId of costIds) detail = await costPost("item.save", { expectedRevision: detail.tracking.revision, itemId, effectivePriceState: "known", effectivePriceUnitCents: 1425, chinaFreightState: "no_charge", chinaFreightUnitCents: null });
  detail = await costPost("charge.save", { expectedRevision: detail.tracking.revision, chargeType: "products", paymentMethod: "pix" }, { chargeId: detail.productsCharge.id });
  detail = await costPost("charge.paid", { expectedRevision: detail.tracking.revision }, { chargeId: detail.productsCharge.id });
  const label = `Origens QA ${suffix}`;
  const created = await page.request.post("/api/hubbuy/accounts", { headers: { Origin: origin }, data: { operation: "createAccount", workspaceId: "profile-qa-workspace", label, idempotencyKey: crypto.randomUUID(), confirmZeroBalance: true } });
  expect(created.ok()).toBe(true);
  const accountId = (await created.json()).data.accountId as string;
  for (const costItemId of costIds) {
    detail = await costPost("refund.request", { expectedRevision: detail.tracking.revision, costItemId, quantity: 1, requestedProductCents: 1425, requestedChinaCents: 0, reason: "Cancelamento sintético para composição", packageRemovals: [{ packageId: detail.packages[0].id, quantity: 1 }], unassignedQuantity: 0 });
    const refundId = detail.refunds.find((refund: { costItemId: string }) => refund.costItemId === costItemId).id;
    detail = await costPost("refund.receive", { expectedRevision: detail.tracking.revision, receivedProductCents: 1425, receivedChinaCents: 0, destination: "hubbuy", accountId, receivedProductCnyMinor: 1898, receivedChinaCnyMinor: 0, nativeEvidence: "Crédito sintético confirmado", confirmed: true }, { refundId });
  }
  await page.goto("/packages/accounts");
  await page.getByRole("navigation", { name: "Contas HubBuy cadastradas" }).getByRole("button").filter({ hasText: label }).click();
  const rights = page.getByRole("region", { name: "Direitos individuais", exact: true });
  const person = rights.getByRole("region", { name: `Direitos de ${memberName}`, exact: true });
  await expect(person).toContainText("¥ 75,92 · R$ 57,00");
  await expect(person.getByRole("listitem")).toHaveCount(3);
  await expect(person.getByRole("listitem").first()).toContainText("¥ 18,98 · R$ 14,25");
  await expect(page.getByRole("heading", { name: "Última revisão" })).toHaveCount(0);
  const expand = person.getByRole("button", { name: /Ver todas as origens \(4\)/ });
  await expand.focus();
  await page.keyboard.press("Enter");
  const collapse = person.getByRole("button", { name: /Recolher/ });
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await expect(person.getByRole("listitem")).toHaveCount(4);
  for (const name of names) await expect(person).toContainText(name);
  await expect(person.getByRole("link")).toHaveCount(0);
  await expect(person.getByText("Ver compra", { exact: true })).toHaveCount(0);
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1100 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const row of await person.getByRole("listitem").all()) {
      const layout = await row.evaluate(element => {
        const name = element.querySelector(".hubbuy-right-origin-identity")!.getBoundingClientRect();
        const amount = element.querySelector(".hubbuy-right-origin-balance")!.getBoundingClientRect();
        return { height: element.getBoundingClientRect().height, centerDifference: Math.abs((name.top + name.bottom) / 2 - (amount.top + amount.bottom) / 2) };
      });
      expect(layout.height).toBeLessThanOrEqual(44);
      expect(layout.centerDifference).toBeLessThan(2);
      for (const marker of await row.locator(".category-marker, .hubbuy-right-origin-marker").all()) {
        const style = await marker.evaluate(element => {
          const computed = getComputedStyle(element);
          return { border: computed.borderTopWidth, background: computed.backgroundColor, shadow: computed.boxShadow };
        });
        expect(style).toEqual({ border: "0px", background: "rgba(0, 0, 0, 0)", shadow: "none" });
      }
    }
    const sectionBox = await rights.boundingBox();
    const balanceBox = await page.locator(".hubbuy-balance-card").boundingBox();
    expect(Math.abs(sectionBox!.width - balanceBox!.width)).toBeLessThan(2);
    if (process.env.LOTI_CAPTURE_HUBBUY_QA === "1" && [1440, 390, 320].includes(width)) {
      mkdirSync(resolve("artifacts/qa/hubbuy-rights"), { recursive: true });
      await page.screenshot({ path: resolve(`artifacts/qa/hubbuy-rights/origins-${width}.png`), fullPage: true });
    }
  }
  await collapse.focus();
  await page.keyboard.press("Enter");
  await expect(person.getByRole("listitem")).toHaveCount(3);
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  await page.getByRole("combobox", { name: "Conta selecionada" }).selectOption(accountId);
  await expect(person.getByRole("listitem")).toHaveCount(3);
  // A divergent read must be identified before displaying its breakdown as confirmed.
  await page.route(`**/api/hubbuy/accounts/${accountId}`, async route => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, data: { ...body.data, reconciled: false } } });
  });
  await page.reload();
  await page.getByRole("combobox", { name: "Conta selecionada" }).selectOption(accountId);
  await expect(rights.getByRole("status")).toContainText("Direitos não conciliados");
});
