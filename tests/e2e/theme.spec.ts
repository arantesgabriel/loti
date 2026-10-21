import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { login } from "./helpers";

async function capture(page: Page, name: string) {
  if (process.env.LOTI_CAPTURE_THEME_QA !== "1") return;
  mkdirSync("artifacts/qa/dark-mode/verified", { recursive: true });
  // Do not mutate input caret styles while a streamed page is hydrating.
  await page.screenshot({ path: `artifacts/qa/dark-mode/verified/${name}.png`, fullPage: true, caret: "initial" });
}

async function choose(page: Page, label: "Claro" | "Escuro" | "Sistema") {
  await page.getByRole("radio", { name: label, exact: true }).check();
  await expect(page.getByRole("radio", { name: label, exact: true })).toBeChecked();
}

test("light remains the default on a dark system; stored dark applies before hydration", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("theme-test-initialized")) {
      localStorage.removeItem("loti.theme");
      sessionStorage.setItem("theme-test-initialized", "1");
    }
  });
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
  await page.evaluate(() => localStorage.setItem("loti.theme", "dark"));
  // Blocking React bundles proves the head bootstrap resolves the preference itself.
  await page.route(/\/_next\/.*\.js(?:\?|$)/, route => route.abort());
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(27, 25, 26)");
});

test("preference persists through reload, navigation and logout; System responds live and supports keyboard", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && /hydrat/i.test(message.text())) errors.push(message.text()); });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await login(page);
  await page.goto("/profile");
  await choose(page, "Escuro");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByRole("radio", { name: "Escuro", exact: true })).toBeChecked();
  await choose(page, "Sistema");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await choose(page, "Claro");
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("radio", { name: "Claro", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Escuro", exact: true })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Sair da conta", exact: true }).click();
  await page.waitForURL("**/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await login(page, "brunna");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(errors).toEqual([]);
});

test("cross-tab theme changes preserve an open portal, focus and unsaved fields", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.getByRole("button", { name: "Novo favorito", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const name = dialog.getByLabel("Nome do produto", { exact: true });
  await name.fill("Rascunho preservado pelo tema");
  const settings = await context.newPage();
  await settings.goto("/profile");
  await choose(settings, "Escuro");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(dialog).toHaveCSS("background-color", "rgb(36, 33, 35)");
  await expect(name).toHaveValue("Rascunho preservado pelo tema");
  await expect(name).toBeFocused();
  await settings.evaluate(() => localStorage.removeItem("loti.theme"));
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await settings.close();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Novo favorito", exact: true })).toBeFocused();
});

test("blocked browser storage does not prevent changing or using the theme", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("Blocked", "SecurityError"); } });
  });
  await login(page);
  await page.goto("/profile");
  await choose(page, "Escuro");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("link", { name: "Favoritos", exact: true }).first().click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("both themes cover the public and authenticated routes at mobile and desktop widths", async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page);
  for (const theme of ["dark", "light"] as const) {
    await page.goto("/profile");
    await choose(page, theme === "dark" ? "Escuro" : "Claro");
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of ["/login", "/forgot-password", "/reset-password", "/verify-email", "/invite/invalid-theme-test", "/favorites", "/purchase", "/history", "/packages", "/packages/accounts", "/profile", "/group"]) {
        await page.goto(route);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator("body")).toHaveCSS("color", theme === "dark" ? "rgb(242, 236, 232)" : "rgb(34, 29, 33)");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} ${width} ${route}`).toBe(true);
        if (width === 390 || width === 1440) await capture(page, `${theme}-${route.slice(1).replaceAll("/", "-")}-${width}`);
      }
    }
  }
});

test("theme changes preserve financial data, paid states and finalized snapshots", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page, "theme-qa", "Theme-QA-Only-2026!");
  const headers = { Origin: "http://localhost:3100" };
  async function app(operation: string, input: unknown, id?: string) {
    const response = await page.request.post("/api/app", { headers, data: { operation, input, id } });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }
  const created = await app("purchase.save", { name: "Temas · financeiro sintético" });
  const purchaseId = created.result.id as string;
  await app("item.save", { name: "Produto do teste de tema", url: "https://example.test/theme", personId: created.data.currentUser.id, quantity: 2, unitPriceCents: 10_000 });
  await app("purchase.finalize", true, purchaseId);
  const rows = (await (await page.request.get("/api/packages")).json()).data;
  const trackingId = rows.find((row: { purchase: { id: string } }) => row.purchase.id === purchaseId).tracking.id;
  const url = `/api/packages/${trackingId}`;
  let detail = (await (await page.request.get(url)).json()).data;
  async function cost(operation: string, input: Record<string, unknown>, rest: Record<string, unknown> = {}) {
    const response = await page.request.post(url, { headers, data: { operation, ...rest, input: { expectedRevision: detail.tracking.revision, ...input } } });
    expect(response.ok(), await response.text()).toBe(true);
    detail = (await response.json()).data;
  }
  await cost("item.save", { itemId: detail.items[0].id, effectivePriceState: "known", effectivePriceUnitCents: 10_000, chinaFreightState: "known", chinaFreightUnitCents: 1_000 });
  await cost("charge.save", { chargeType: "products", paymentMethod: "pix" }, { chargeId: detail.productsCharge.id });
  await cost("charge.paid", {}, { chargeId: detail.productsCharge.id });
  await cost("refund.request", { costItemId: detail.items[0].id, quantity: 1, requestedProductCents: 10_000, requestedChinaCents: 0, reason: "Fixture de tema", packageRemovals: [{ packageId: detail.packages[0].id, quantity: 1 }], unassignedQuantity: 0 });
  const requested = detail.refunds.find((refund: { status: string }) => refund.status === "requested");
  await cost("refund.receive", { receivedProductCents: 10_000, receivedChinaCents: 0, confirmed: true }, { refundId: requested.id });
  const before = (await (await page.request.get(url)).json()).data;
  const beforeApp = await (await page.request.get("/api/app")).json();
  const snapshots = { purchases: beforeApp.purchases, items: beforeApp.items };
  for (const theme of ["dark", "light"] as const) {
    await page.goto("/profile");
    await choose(page, theme === "dark" ? "Escuro" : "Claro");
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/packages/${trackingId}`);
      await expect(page.locator(".cost-v4")).toHaveCSS("color", theme === "dark" ? "rgb(242, 236, 232)" : "rgb(33, 29, 27)");
      await expect(page.locator(".refunds-total")).toContainText("100,00");
      await capture(page, `${theme}-financial-${width}`);
      await page.goto(`/history/${purchaseId}`);
      await expect(page.getByText("Finalizada", { exact: true })).toBeVisible();
      await capture(page, `${theme}-history-detail-${width}`);
    }
  }
  expect((await (await page.request.get(url)).json()).data).toEqual(before);
  const afterApp = await (await page.request.get("/api/app")).json();
  expect({ purchases: afterApp.purchases, items: afterApp.items }).toEqual(snapshots);
});
