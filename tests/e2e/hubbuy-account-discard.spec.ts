import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { openDatabase } from "@/lib/db/connection";
import { hubbuyAccounts } from "@/lib/db/schema";
import { login } from "./helpers";

test("explicitly annuls a mistaken legacy reconciliation and removes only its registration", async ({ page }) => {
  test.setTimeout(90_000);
  const dbUrl = process.env.LOTI_E2E_DATABASE_URL;
  if (!dbUrl || !/^file:\.\/data\/e2e-refunds-[\w-]+\.sqlite$/.test(dbUrl)) throw new Error("Discard E2E requires an explicit disposable database.");
  const origin = test.info().project.use.baseURL ?? "http://localhost:3100";
  await login(page, "profile-qa", "Profile-QA-Old-2026!");
  const label = `Cadastro incorreto QA ${Date.now()}`;
  // Provision the legacy fixture before opening the account manager: its
  // automatic balance request must not race a test-only schema-state write.
  const created = await page.request.post("/api/hubbuy/accounts", { headers: { Origin: origin }, data: { operation: "createAccount", workspaceId: "profile-qa-workspace", label, idempotencyKey: crypto.randomUUID(), confirmZeroBalance: true } });
  expect(created.status()).toBe(200);
  const accounts = (await (await page.request.get("/api/hubbuy/accounts")).json()).data;
  const accountId = accounts.find((a: { label: string }) => a.label === label).id;
  const fixture = openDatabase(dbUrl);
  try {
    // Synthetic legacy state only, in the explicitly isolated E2E database.
    await fixture.db.update(hubbuyAccounts).set({ status: "reconciling", reconciledBy: null, reconciledAt: null }).where(eq(hubbuyAccounts.id, accountId)).run();
    const url = `/api/hubbuy/accounts/${accountId}`;
    async function post(operation: string, payload: Record<string, unknown>) {
      const response = await page.request.post(url, { headers: { Origin: origin }, data: { operation, ...payload } });
      expect(response.status(), await response.text()).toBe(200);
    }
    const shares = [{ personId: accounts.find((a: { id: string }) => a.id === accountId).createdBy, amountCnyMinor: 5000, historicalBrlCents: 4300 }];
    await post("reconcile.start", { expectedRevision: 0, idempotencyKey: crypto.randomUUID(), mode: "chronological" });
    await post("reconcile.event", { expectedRevision: 1, idempotencyKey: crypto.randomUUID(), eventType: "legacy_receipt", description: "Saldo sintético informado por engano", occurredAt: "2026-10-17T12:00:00Z", amountCnyMinor: 5000, shares });
    await post("reconcile", { expectedRevision: 2, idempotencyKey: crypto.randomUUID(), mode: "chronological", observedBalanceCnyMinor: 5000, reason: "Conciliação sintética equivocada", shares });
    await page.goto("/packages/accounts");
    const row = page.locator(".cost-hubbuy-account").filter({ hasText: label });
    await page.getByRole("navigation", { name: "Contas HubBuy cadastradas" }).getByRole("button").filter({ hasText: label }).click();
    await expect(row).toContainText("¥ 50,00");
    await row.getByRole("button", { name: "Ações", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Excluir conta", exact: true })).toHaveCount(0);
    await page.getByRole("menuitem", { name: "Corrigir cadastro e excluir" }).click();
    const dialog = page.getByRole("dialog", { name: "Anular cadastro incorreto?" });
    await dialog.getByLabel("Motivo da exclusão").fill("Informei os valores apenas para tentar excluir o cadastro");
    await expect(dialog.getByRole("button", { name: "Anular e excluir" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(row).toContainText("¥ 50,00");
    await row.getByRole("button", { name: "Ações", exact: true }).click();
    await page.getByRole("menuitem", { name: "Corrigir cadastro e excluir" }).click();
    await dialog.getByLabel("Motivo da exclusão").fill("Informei os valores apenas para tentar excluir o cadastro");
    await dialog.getByRole("checkbox").check();
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (process.env.LOTI_CAPTURE_HUBBUY_DELETE_QA === "1") {
        mkdirSync(resolve("artifacts/qa/hubbuy-account-deletion"), { recursive: true });
        await page.screenshot({ path: resolve(`artifacts/qa/hubbuy-account-deletion/discard-${width}.png`), fullPage: true });
      }
    }
    await dialog.getByRole("button", { name: "Anular e excluir" }).focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(row).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Adicionar conta HubBuy", exact: true })).toBeFocused();
    expect((await page.request.get(url)).status()).toBe(404);
    const ledger = await fixture.client.execute({ sql: "SELECT direction, amount_cny_minor, historical_brl_cents FROM hubbuy_balance_entries WHERE account_id = ? ORDER BY sequence", args: [accountId] });
    expect(ledger.rows.map(r => ({ ...r }))).toEqual([{ direction: "credit", amount_cny_minor: 5000, historical_brl_cents: 4300 }, { direction: "debit", amount_cny_minor: 5000, historical_brl_cents: 4300 }]);
  } finally { fixture.client.close(); }
});
