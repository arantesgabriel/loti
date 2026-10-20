import { expect, test } from "@playwright/test";
import { login } from "./helpers";

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
    occurredAt: null, operationRecordedAt: "2026-10-17T12:00:00Z", reason: `Movimento sintético ${index + 1}`,
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
