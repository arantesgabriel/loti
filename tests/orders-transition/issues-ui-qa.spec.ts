import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { WarehouseData } from "@/components/orders/orders-screen";

test("open package selection, linked order actions, and participant rateio", async ({ page }) => {
  const database = process.env.LOTI_ORDERS_TRANSITION_DATABASE;
  if (!database?.startsWith("file:")) throw new Error("A synthetic Orders QA database is required.");
  const marker = JSON.parse(readFileSync(`${resolve(database.slice(5))}.scenario.json`, "utf8")) as {
    scenarioId: string;
    workspaceId: string;
    accountId: string;
    packageId: string;
  };
  test.skip(marker.scenarioId !== "orders-workflow-v2", "Uses the new workflow fixture.");
  const baseURL = process.env.LOTI_ORDERS_TRANSITION_BASE_URL ?? "http://localhost:3139";
  const login = await page.request.post("/api/auth/sign-in/email", {
    headers: { Origin: baseURL },
    data: { email: "pessoa-a@loti.test", password: "Loti-Orders-QA-Only-2026!" },
  });
  expect(login.ok()).toBe(true);

  const initialResponse = await page.request.get("/api/warehouse");
  expect(initialResponse.ok(), await initialResponse.text()).toBe(true);
  const initial = (await initialResponse.json()).data as WarehouseData;
  const currentShirt = initial.rows.find(row => row.name === "Camiseta retida QA");
  if (!currentShirt) throw new Error("Expected the synthetic Camiseta item in the workflow fixture.");
  if (currentShirt.reservations.length !== 1
    || currentShirt.reservations[0]?.packageId !== marker.packageId
    || currentShirt.reservations[0]?.unitIndex !== 1) {
    for (const packageId of new Set(currentShirt.reservations.map(reservation => reservation.packageId))) {
      const sourcePackage = initial.packages.find(pkg => pkg.id === packageId);
      if (!sourcePackage) throw new Error("A reservation package is missing from the warehouse response.");
      const releaseResponse = await page.request.post("/api/warehouse", {
        headers: { Origin: baseURL, "X-Loti-Workflow": "orders-v2" },
        data: {
          workspaceId: marker.workspaceId,
          idempotencyKey: `issues-ui-normalize-release-${randomUUID()}`,
          command: {
            operation: "release",
            packageId,
            expectedRevision: sourcePackage.revision,
            reservationIds: currentShirt.reservations.filter(reservation => reservation.packageId === packageId).map(reservation => reservation.id),
            reason: "Normalizar a fixture descartável para repetir o teste de interface",
          },
        },
      });
      expect(releaseResponse.ok(), await releaseResponse.text()).toBe(true);
    }
    const freeResponse = await page.request.get("/api/warehouse?search=Camiseta");
    const free = (await freeResponse.json()).data as WarehouseData;
    const sourcePackage = free.packages.find(pkg => pkg.id === marker.packageId);
    if (!sourcePackage) throw new Error("Expected the original package to remain open.");
    const restoreResponse = await page.request.post("/api/warehouse", {
      headers: { Origin: baseURL, "X-Loti-Workflow": "orders-v2" },
      data: {
        workspaceId: marker.workspaceId,
        idempotencyKey: `issues-ui-normalize-restore-${randomUUID()}`,
        command: {
          operation: "reserve",
          packageId: marker.packageId,
          expectedRevision: sourcePackage.revision,
          accountId: marker.accountId,
          selection: [{ costItemId: free.rows[0].costItemId, expectedRevision: free.rows[0].revision, units: [1] }],
          reason: "Restaurar a unidade original da fixture descartável",
        },
      },
    });
    expect(restoreResponse.ok(), await restoreResponse.text()).toBe(true);
  }
  const polo = initial.rows.find(row => row.name === "Polo compra posterior QA");
  if (!polo) throw new Error("Expected the synthetic Polo item in the workflow fixture.");

  let destinationId = initial.packages.find(pkg => pkg.name === "Pacote destino UI QA")?.id;
  if (!destinationId) {
    const destinationResponse = await page.request.post("/api/warehouse", {
      headers: { Origin: baseURL, "X-Loti-Workflow": "orders-v2" },
      data: {
        workspaceId: marker.workspaceId,
        idempotencyKey: `issues-ui-target-package-${randomUUID()}`,
        command: {
          operation: "reserve",
          accountId: marker.accountId,
          name: "Pacote destino UI QA",
          selection: [{ costItemId: polo.costItemId, expectedRevision: polo.revision, units: [1] }],
          reason: "Destino sintético para validar a troca entre pacotes",
        },
      },
    });
    expect(destinationResponse.ok(), await destinationResponse.text()).toBe(true);
    destinationId = (await destinationResponse.json()).data.id as string;
  }

  await page.goto("/orders");
  const shirt = page.locator(".orders-catalog-row").filter({ hasText: "Camiseta retida QA" });
  await expect(shirt).toBeVisible({ timeout: 30000 });
  await expect(shirt.locator(".orders-catalog-stage")).toContainText("Vinculado");
  await expect(shirt.getByRole("button", { name: "Adicionar Camiseta retida QA à seleção", exact: true })).toHaveCount(0);
  await shirt.locator(".orders-product-button").click();
  await page.getByRole("button", { name: "Adicionar ao pacote", exact: true }).click();
  await page.locator(".orders-panel-footer").getByRole("button", { name: "Montar pacote", exact: true }).click();

  const review = page.locator(".orders-review-form:visible");
  await review.getByRole("searchbox", { name: "Buscar pacotes em montagem" }).fill("Camiseta retida + compra posterior QA");
  const existingPackageRadio = review.getByRole("radio", { name: "Camiseta retida + compra posterior QA, pacote em montagem", exact: true });
  await existingPackageRadio.click();
  await expect(existingPackageRadio).toBeChecked();
  await review.getByLabel("Motivo", { exact: true }).fill("Acrescentar a unidade recebida ao pacote aberto");
  await review.getByRole("button", { name: "Montar pacote", exact: true }).click();
  await expect(page.getByRole("link", { name: "Abrir pacote", exact: true })).toHaveAttribute("href", `/packages/detail/${marker.packageId}`);

  await page.goto("/orders?search=Camiseta%20retida%20QA");
  const linkedShirt = page.locator(".orders-catalog-row").filter({ hasText: "Camiseta retida QA" });
  await expect(linkedShirt.locator(".orders-catalog-stage")).toContainText("Reservadas no pacote Camiseta retida + compra posterior QA · 2 unidades");
  await linkedShirt.getByRole("button", { name: "Ações de pacote para Camiseta retida QA", exact: true }).click();
  await page.getByRole("button", { name: "Remover do pacote", exact: true }).click();
  const release = page.getByRole("dialog", { name: "Remover do pacote", exact: true });
  await release.getByLabel("Motivo", { exact: true }).fill("Retirada conferida no fluxo de pedidos");
  await release.getByRole("button", { name: "Confirmar retirada", exact: true }).click();
  await expect(linkedShirt.getByRole("button", { name: "Adicionar Camiseta retida QA à seleção", exact: true })).toBeVisible();

  const releasedResponse = await page.request.get("/api/warehouse?search=Camiseta");
  const released = (await releasedResponse.json()).data as WarehouseData;
  expect(released.rows[0].reservations).toHaveLength(0);
  expect(released.rows[0].availableUnits).toEqual([0, 1]);
  const source = released.packages.find(pkg => pkg.id === marker.packageId);
  if (!source) throw new Error("Expected the source package to remain open.");
  const restoreResponse = await page.request.post("/api/warehouse", {
    headers: { Origin: baseURL, "X-Loti-Workflow": "orders-v2" },
    data: {
      workspaceId: marker.workspaceId,
      idempotencyKey: `issues-ui-restore-source-unit-${randomUUID()}`,
      command: {
        operation: "reserve",
        packageId: marker.packageId,
        expectedRevision: source.revision,
        accountId: marker.accountId,
        selection: [{ costItemId: released.rows[0].costItemId, expectedRevision: released.rows[0].revision, units: [1] }],
        reason: "Restaurar a reserva original da fixture sintética",
      },
    },
  });
  expect(restoreResponse.ok(), await restoreResponse.text()).toBe(true);

  async function moveShirtTo(packageName: string, reason: string) {
    await page.goto("/orders?search=Camiseta%20retida%20QA");
    const row = page.locator(".orders-catalog-row").filter({ hasText: "Camiseta retida QA" });
    await row.getByRole("button", { name: "Ações de pacote para Camiseta retida QA", exact: true }).click();
    await page.getByRole("button", { name: "Trocar pacote", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Trocar pacote", exact: true });
    await dialog.getByRole("searchbox", { name: "Buscar pacotes em montagem" }).fill(packageName);
    const option = dialog.getByRole("radio", { name: `${packageName}, pacote em montagem`, exact: true });
    await expect(option).toBeVisible();
    await option.check();
    await dialog.getByLabel("Motivo", { exact: true }).fill(reason);
    await dialog.getByRole("button", { name: "Trocar pacote", exact: true }).click();
    await expect(dialog).not.toBeVisible();
  }

  await moveShirtTo("Pacote destino UI QA", "Mover temporariamente para validar a troca");
  const movedResponse = await page.request.get("/api/warehouse?search=Camiseta");
  const moved = (await movedResponse.json()).data as WarehouseData;
  expect(moved.rows[0].reservations.map(reservation => reservation.packageId)).toEqual([destinationId]);
  await moveShirtTo("Camiseta retida + compra posterior QA", "Restaurar a reserva original");
  const restoredResponse = await page.request.get("/api/warehouse?search=Camiseta");
  const restored = (await restoredResponse.json()).data as WarehouseData;
  expect(restored.rows[0].reservations.map(reservation => reservation.packageId)).toEqual([marker.packageId]);

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`/packages/detail/${marker.packageId}`);
  await expect(page.getByRole("heading", { name: "Camiseta retida + compra posterior QA" })).toBeVisible();
  await page.getByRole("button", { name: "Rateios por participante ›", exact: true }).click();
  const rateio = page.getByRole("dialog", { name: "Rateios por participante", exact: true });
  await expect(rateio.locator(".orders-package-participant-list > li")).toHaveCount(2);
  await page.locator(".modal-overlay").last().evaluate(async overlay => {
    await Promise.all(overlay.getAnimations().map(animation => animation.finished.catch(() => undefined)));
  });
  const participant = rateio.locator(".orders-package-participant").first();
  await expect(participant.locator(".orders-package-participant-products")).toBeHidden();
  await expect(participant.locator(".orders-package-participant-total")).toContainText("R$");
  await page.screenshot({ path: "artifacts/qa/orders-transition/issues-rateio-desktop.png" });
  await participant.locator("summary").click();
  await expect(participant.locator(".orders-package-participant-products")).toContainText("Camiseta retida QA");
  await expect(participant.locator(".orders-package-participant-products")).toContainText("Polo compra posterior QA");

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/qa/orders-transition/issues-rateio-mobile.png" });
});
