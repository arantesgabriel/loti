import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { WarehouseData } from "@/components/orders/orders-screen";

type Scenario = {
  scenarioId: string;
  workspaceId: string;
  accountId: string;
  packageId: string;
  people: string[];
  purchases: Array<{
    trackingId: string;
    orderId: string;
    costItemId: string;
  }>;
};

test("Stage 5 filters, arrival context, source navigation, empty state, terminology and responsive states", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const database = process.env.LOTI_ORDERS_TRANSITION_DATABASE;
  expect(database, "Use an isolated synthetic orders-workflow database").toBeTruthy();
  const marker = JSON.parse(
    readFileSync(`${resolve(database!.slice(5))}.scenario.json`, "utf8"),
  ) as Scenario;
  test.skip(marker.scenarioId !== "orders-workflow-v2", "Uses the isolated new workflow fixture");

  const baseURL = process.env.LOTI_ORDERS_TRANSITION_BASE_URL ?? "http://localhost:3139";
  const login = await page.request.post("/api/auth/sign-in/email", {
    headers: { Origin: baseURL },
    data: {
      email: "pessoa-a@loti.test",
      password: "Loti-Orders-QA-Only-2026!",
    },
  });
  expect(login.ok()).toBe(true);

  const warehouseResponse = await page.request.get("/api/warehouse");
  expect(warehouseResponse.ok()).toBe(true);
  const beforeWarehouse = (await warehouseResponse.json()).data as WarehouseData;
  const row = beforeWarehouse.rows.find((item) => item.name === "Camiseta retida QA");
  expect(row).toBeDefined();
  expect(row!.reservations).toHaveLength(1);
  const purchase = marker.purchases[0];
  const costResponse = await page.request.get(`/api/packages/${purchase.trackingId}`);
  expect(costResponse.ok()).toBe(true);
  const beforeCosts = (await costResponse.json()).data;

  // UI-002: draft filters do not fetch until Apply, combine, and leave selections intact.
  let warehouseGets = 0;
  let warehousePosts = 0;
  page.on("request", (request) => {
    if (!request.url().includes("/api/warehouse")) return;
    if (request.method() === "GET") warehouseGets += 1;
    if (request.method() === "POST") warehousePosts += 1;
  });

  await page.goto("/orders");
  await expect(page.getByRole("link", { name: "Abrir compra e custos de Camiseta retida QA" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Montar pacote" })).toBeDisabled();
  expect(warehouseGets).toBeGreaterThan(0);
  const initialWarehouseGets = warehouseGets;
  await page.getByLabel("Unidades de Camiseta retida QA para selecionar").fill("1");
  await expect(page.locator(".orders-selection")).toContainText("1 unidade selecionada");

  await page.getByLabel("Buscar").fill("Camiseta retida QA");
  await page.getByLabel("Etapa").selectOption("available");
  await page.getByRole("button", { name: /Filtros/ }).click();
  const advancedFilters = page.locator("#orders-advanced-filters select");
  await advancedFilters.nth(0).selectOption(marker.accountId);
  await advancedFilters.nth(1).selectOption(marker.people[0]);
  await advancedFilters.nth(2).selectOption("original");
  await advancedFilters.nth(3).selectOption(purchase.trackingId);
  expect(warehouseGets).toBe(initialWarehouseGets);
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page.getByRole("link", { name: "Abrir compra e custos de Camiseta retida QA" })).toBeVisible();
  await expect(page.locator(".orders-row")).toHaveCount(1);
  await expect(page.locator(".orders-selection")).toContainText("1 unidade selecionada");
  await expect.poll(() => new URL(page.url()).searchParams.get("trackingId")).toBe(purchase.trackingId);
  await page.getByRole("button", { name: /^Filtros/ }).click();
  await expect(advancedFilters.nth(0)).toHaveValue(marker.accountId);
  await page.getByRole("button", { name: /Filtros/ }).click();
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(page.getByLabel("Buscar")).toHaveValue("");
  await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe("/orders");
  await expect(page.locator(".orders-selection")).toContainText("1 unidade selecionada");

  // UI-008: arrival counts are contextual; an incompatible correction is blocked in the UI and by the server.
  const arrivalButton = page.getByRole("button", { name: "Conferir chegada de Camiseta retida QA" });
  await arrivalButton.focus();
  await arrivalButton.click();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".orders-arrival-summary dd")).toHaveText(["2", "0", "2", "1", "1"]);
  await expect(dialog).toContainText("Novo total recebido");
  await expect(dialog).toContainText("Fotos QC não confirmam chegada");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(arrivalButton).toBeFocused();
  await arrivalButton.click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Novo total recebido").fill("0");
  await dialog.getByLabel("Evidência e motivo").fill("Tentativa sintética sem remover reserva");
  await dialog.getByRole("button", { name: "Confirmar conferência" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Retire as reservas");
  await expect(dialog.getByLabel("Novo total recebido")).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByLabel("Novo total recebido")).toBeFocused();
  expect(warehousePosts).toBe(0);

  const rejected = await page.request.post("/api/warehouse", {
    headers: { Origin: baseURL },
    data: {
      workspaceId: marker.workspaceId,
      idempotencyKey: crypto.randomUUID(),
      command: {
        operation: "receive",
        costItemId: row!.costItemId,
        expectedRevision: row!.revision,
        accountId: row!.accountId,
        units: [0],
        reason: "Tentativa sintética que não pode remover unidade reservada",
      },
    },
  });
  expect(rejected.status()).toBe(409);
  const afterWarehouseResponse = await page.request.get("/api/warehouse");
  const afterWarehouse = (await afterWarehouseResponse.json()).data as WarehouseData;
  expect(afterWarehouse.rows).toEqual(beforeWarehouse.rows);
  expect(afterWarehouse.reservations).toEqual(beforeWarehouse.reservations);
  const afterCostsResponse = await page.request.get(`/api/packages/${purchase.trackingId}`);
  expect((await afterCostsResponse.json()).data).toEqual(beforeCosts);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  // UI-004 and UI-011: the item is the destination; the back link restores applied filters.
  await page.getByLabel("Buscar").fill("Camiseta retida QA");
  await page.getByLabel("Etapa").selectOption("available");
  await advancedFilters.nth(3).selectOption(purchase.trackingId);
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  const sourceLink = page.getByRole("link", { name: "Abrir compra e custos de Camiseta retida QA" });
  await expect(sourceLink).toBeVisible();
  await Promise.all([
    page.waitForURL((url) => url.pathname === `/orders/${purchase.orderId}`),
    sourceLink.click(),
  ]);
  const detailUrl = new URL(page.url());
  expect(detailUrl.pathname).toBe(`/orders/${purchase.orderId}`);
  expect(detailUrl.searchParams.get("item")).toBe(row!.costItemId);
  expect(detailUrl.searchParams.get("returnTo")).toContain("trackingId=");
  const targetName = `order-product-${row!.costItemId}`;
  await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.costTarget ?? "")).toBe(targetName);
  await expect(page.locator(".cost-people-explanation")).toContainText("Unidades individuais somam as quantidades");
  const personA = page.locator(".cost-people-list li").filter({ hasText: "Pessoa A" });
  const personB = page.locator(".cost-people-list li").filter({ hasText: "Pessoa B" });
  await expect(personA).toContainText("0 unidades individuais");
  await expect(personA).toContainText("1 item compartilhado");
  await expect(personB).toContainText("0 unidades individuais");
  await expect(personB).toContainText("1 item compartilhado");
  await page.locator("#main").getByRole("link", { name: "Pedidos", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/orders");
  await expect(page.getByLabel("Buscar")).toHaveValue("Camiseta retida QA");
  await expect(page.getByLabel("Etapa")).toHaveValue("available");
  await expect(page.locator("#orders-advanced-filters select").nth(3)).toHaveValue(purchase.trackingId);

  // UI-010: empty copy follows the selected stage and links to a real next step.
  await page.goto("/packages");
  await expect(page.getByRole("heading", { name: "Nenhum pacote com conteúdo fechado" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ver pacotes em montagem" })).toBeVisible();
  await page.getByRole("button", { name: "Ver pacotes em montagem" }).click();
  await expect(page.getByLabel("Etapa")).toHaveValue("preparing");
  await expect(page.getByRole("link", { name: "Camiseta retida + compra posterior QA" })).toBeVisible();
  const preparingEmptyRoute = async (route: import("@playwright/test").Route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("filter") !== "preparing") return route.continue();
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          rows: [],
          pagination: { page: 0, pageSize: 20, total: 0, hasMore: false },
        },
      }),
    });
  };
  await page.route("**/api/logistics/packages?**", preparingEmptyRoute);
  await page.getByLabel("Etapa").selectOption("sent");
  await expect(page.getByRole("heading", { name: "Nenhum pacote enviado nesta etapa" })).toBeVisible();
  await page.getByLabel("Etapa").selectOption("preparing");
  await expect(page.getByRole("heading", { name: "Nenhum pacote em montagem" })).toBeVisible();
  await page.unroute("**/api/logistics/packages?**", preparingEmptyRoute);
  const emptyPackagesRoute = (route: import("@playwright/test").Route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          rows: [],
          pagination: { page: 0, pageSize: 20, total: 0, hasMore: false },
        },
      }),
    });
  await page.route("**/api/logistics/packages?**", emptyPackagesRoute);
  for (const [filter, emptyHeading] of [
    ["sent", "Nenhum pacote enviado nesta etapa"],
    ["received", "Nenhum pacote recebido nesta etapa"],
    ["review", "Nenhum pacote aguardando conferência"],
    ["closed", "Nenhum pacote com custos encerrados"],
  ] as const) {
    await page.getByLabel("Etapa").selectOption(filter);
    await expect(page.getByRole("heading", { name: emptyHeading })).toBeVisible();
  }
  await page.unroute("**/api/logistics/packages?**", emptyPackagesRoute);

  // UI-012: loading, recoverable errors, keyboard use, themes, and requested viewport matrix.
  let failWarehouse = true;
  const warehouseFailure = async (route: import("@playwright/test").Route) => {
    if (failWarehouse) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Falha sintética ao carregar pedidos" }),
      });
    } else {
      await route.continue();
    }
  };
  await page.route("**/api/warehouse?**", warehouseFailure);
  await page.goto("/orders");
  await expect(page.getByRole("status")).toContainText("Carregando pedidos");
  await expect(page.locator(".orders-request-error [role=alert]")).toContainText("Falha sintética");
  failWarehouse = false;
  await page.getByRole("button", { name: "Tentar carregar novamente" }).click();
  await expect(page.getByRole("link", { name: "Abrir compra e custos de Camiseta retida QA" })).toBeVisible();
  await page.unroute("**/api/warehouse?**", warehouseFailure);

  let failPackages = true;
  const packageFailure = async (route: import("@playwright/test").Route) => {
    if (failPackages) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Falha sintética ao carregar pacotes" }),
      });
    } else {
      await route.continue();
    }
  };
  await page.route("**/api/logistics/packages?**", packageFailure);
  await page.goto("/packages");
  await expect(page.getByRole("status")).toContainText("Carregando pacotes");
  await expect(page.locator(".orders-request-error [role=alert]")).toContainText("Falha sintética");
  failPackages = false;
  await page.getByRole("button", { name: "Tentar carregar novamente" }).click();
  await expect(page.getByRole("heading", { name: "Nenhum pacote com conteúdo fechado" })).toBeVisible();
  await page.unroute("**/api/logistics/packages?**", packageFailure);

  mkdirSync("artifacts/qa/orders-transition", { recursive: true });
  const orderUrl = `/orders/${purchase.orderId}?${new URLSearchParams({ item: row!.costItemId, returnTo: "/orders" })}`;
  const screens = [
    { name: "orders", url: "/orders" },
    { name: "packages", url: "/packages" },
    { name: "order-detail", url: orderUrl },
    { name: "package-detail", url: `/packages/detail/${marker.packageId}` },
  ];
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((value) => localStorage.setItem("loti.theme", value), theme);
    for (const width of [320, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      for (const screen of screens) {
        await page.goto(screen.url, { waitUntil: "domcontentloaded" });
        await expect(page.locator(".page-content h1").first()).toBeVisible({ timeout: 30_000 });
        await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
        if (screen.name === "orders" || screen.name === "packages") {
          await expect(page.locator(".orders-list")).toHaveAttribute("aria-busy", "false");
        }
        if (screen.name === "orders") {
          const titleWidth = await page.locator(".orders-row-main").first().evaluate((element) => element.getBoundingClientRect().width);
          expect(titleWidth, `order title column at ${width}px`).toBeGreaterThanOrEqual(120);
        }
        const layout = await page.evaluate(() => {
          const overflow = document.documentElement.scrollWidth - window.innerWidth;
          const offenders = Array.from(document.body.querySelectorAll<HTMLElement>("*"))
            .map((element) => {
              const rect = element.getBoundingClientRect();
              return {
                element: `${element.tagName.toLowerCase()}${element.className && typeof element.className === "string" ? `.${element.className.trim().replace(/\s+/g, ".")}` : ""}`,
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                width: Math.round(rect.width),
                scrollWidth: element.scrollWidth,
                clientWidth: element.clientWidth,
              };
            })
            .filter((element) => element.right > window.innerWidth + 1 || element.left < -1)
            .sort((left, right) => right.right - left.right)
            .slice(0, 12);
          return { overflow, offenders };
        });
        if (layout.overflow > 1) {
          await page.screenshot({ path: `artifacts/qa/orders-transition/residual-overflow-${screen.name}-${theme}-${width}.png` });
        }
        expect(layout.overflow, `${screen.name} ${theme} ${width}px overflow; offenders: ${JSON.stringify(layout.offenders)}`).toBeLessThanOrEqual(1);
        await page.screenshot({
          path: `artifacts/qa/orders-transition/residual-${screen.name}-${theme}-${width}.png`,
        });
      }
    }
  }
});
