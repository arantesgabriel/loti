import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import type { CostTrackingView } from "../../src/lib/domain/package-cost-reading";
import { login } from "./helpers";

test("package content has bounded steppers, explicit removal and a fixed footer", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, "profile-qa", "Profile-QA-Old-2026!");
  const headers = { Origin: test.info().project.use.baseURL ?? "http://localhost:3100" };
  const created = await page.request.post("/api/app", { headers, data: { operation: "purchase.save", input: { name: "Conteúdo QA" } } });
  expect(created.ok()).toBeTruthy();
  const purchase = await created.json();
  for (let index = 0; index < 14; index++) {
    const added = await page.request.post("/api/app", { headers, data: { operation: "item.save", input: { name: `Produto drawer ${index}`, url: `https://example.test/drawer-${index}`, personId: purchase.data.currentUser.id, quantity: index === 0 ? 3 : 1, unitPriceCents: 1000 } } });
    expect(added.ok()).toBeTruthy();
  }
  expect((await page.request.post("/api/app", { headers, data: { operation: "purchase.finalize", id: purchase.result.id, input: true } })).ok()).toBeTruthy();
  const rows = (await (await page.request.get("/api/packages")).json()).data as { tracking: { id: string }; purchase: { id: string } }[];
  const trackingId = rows.find(row => row.purchase.id === purchase.result.id)!.tracking.id;
  const url = `/api/packages/${trackingId}`;
  let detail = (await (await page.request.get(url)).json()).data as CostTrackingView;
  const pkg = detail.packages[0];
  const excluded = detail.items.find(item => item.original.name === "Produto drawer 13")!;
  const multiple = detail.items.find(item => item.original.name === "Produto drawer 0")!;
  const allocations = pkg.items.map(row => ({ costItemId: row.costItemId, quantity: row.costItemId === excluded.id ? 0 : row.costItemId === multiple.id ? 1 : row.quantity }));
  const saved = await page.request.post(url, { headers, data: { operation: "package.allocations", input: { expectedRevision: detail.tracking.revision, packageId: pkg.id, allocations } } });
  expect(saved.ok()).toBeTruthy();
  await page.goto(`/packages/${trackingId}`);
  for (const [width, height] of [[1440, 1000], [768, 1000], [390, 844], [320, 640]]) {
    await page.setViewportSize({ width, height });
    if (width >= 768) {
      await expect(page.getByRole("button", { name: `Ações para ${pkg.name}`, exact: true })).toBeHidden();
      await expect(page.getByRole("button", { name: "Editar pacote", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Editar conteúdo", exact: true }).click();
    } else {
      await page.getByRole("button", { name: `Ações para ${pkg.name}`, exact: true }).click();
      await page.getByRole("menuitem", { name: "Editar conteúdo", exact: true }).click();
    }
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("Produto drawer 13", { exact: true })).toHaveCount(0);
    const quantity = drawer.getByLabel("Produto drawer 0 neste pacote", { exact: true });
    const plus = drawer.getByRole("button", { name: "Aumentar quantidade de Produto drawer 0", exact: true });
    const minus = drawer.getByRole("button", { name: "Diminuir quantidade de Produto drawer 0", exact: true });
    await expect(minus).toBeDisabled();
    await plus.click();
    await plus.click();
    await expect(quantity).toHaveText("3");
    await expect(plus).toBeDisabled();
    await minus.click();
    await expect(quantity).toHaveText("2");
    const footer = drawer.locator(".cost-allocation-footer");
    const before = await footer.boundingBox();
    expect(await drawer.locator(".cost-allocation-edit-list").evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await drawer.locator(".cost-allocation-edit-list").evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(drawer.getByRole("button", { name: "Salvar conteúdo", exact: true })).toBeInViewport();
    const after = await footer.boundingBox();
    expect(after!.y).toBeCloseTo(before!.y, 0);
    expect(after!.y + after!.height).toBeLessThanOrEqual(height);
    expect(await drawer.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    mkdirSync("artifacts/qa/package-content", { recursive: true });
    await page.screenshot({ path: `artifacts/qa/package-content/drawer-${width}.png` });
    await drawer.getByRole("button", { name: "Tirar Produto drawer 1 do pacote", exact: true }).click();
    await expect(drawer.getByLabel("Produto drawer 1 neste pacote", { exact: true })).toHaveCount(0);
    await drawer.getByRole("button", { name: "Incluir unidades disponíveis", exact: true }).click();
    await expect(drawer.getByLabel("Produto drawer 13 neste pacote", { exact: true })).toHaveText("1");
    await drawer.getByRole("button", { name: "Cancelar", exact: true }).click();
  }
  detail = (await (await page.request.get(url)).json()).data as CostTrackingView;
  expect(detail.packages[0].items.find(row => row.costItemId === multiple.id)?.quantity).toBe(1);
  expect(detail.packages[0].items.find(row => row.costItemId === excluded.id)).toBeUndefined();
  await page.getByRole("button", { name: `Ações para ${pkg.name}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Editar conteúdo", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: "Tirar Produto drawer 1 do pacote", exact: true }).click();
  await drawer.getByRole("button", { name: "Salvar conteúdo", exact: true }).click();
  await expect(drawer).toBeHidden();
  await page.reload();
  await page.getByRole("button", { name: `Ações para ${pkg.name}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Editar conteúdo", exact: true }).click();
  await expect(page.getByRole("dialog").getByLabel("Produto drawer 1 neste pacote", { exact: true })).toHaveCount(0);
});
