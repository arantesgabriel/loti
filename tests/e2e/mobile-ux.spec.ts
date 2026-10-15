import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { login } from "./helpers";

const mobileUxScreenshotDir = resolve(process.cwd(), "artifacts/qa/mobile-ux/after");
const viewports = [[320, 640], [360, 800], [390, 844], [430, 932], [768, 1000], [1440, 1000]] as const;

async function capture(page: Page, name: string) {
  if (process.env.LOTI_CAPTURE_MOBILE_UX !== "1") return;
  mkdirSync(mobileUxScreenshotDir, { recursive: true });
  await page.locator("[data-sonner-toast]").first().waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
  await page.screenshot({ path: join(mobileUxScreenshotDir, name), fullPage: false });
}

async function expectSurfaceGeometry(page: Page, width: number, height: number) {
  const surface = page.getByRole("dialog");
  await expect(surface).toBeVisible();
  const layout = await surface.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const footer = element.querySelector(".form-actions")!.getBoundingClientRect();
    return {
      left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom,
      width: bounds.width, height: bounds.height,
      footerTop: footer.top, footerBottom: footer.bottom,
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  expect(layout.viewportWidth).toBe(width);
  expect(layout.viewportHeight).toBe(height);
  expect(layout.scrollWidth).toBeLessThanOrEqual(width);
  expect(layout.footerTop).toBeGreaterThanOrEqual(0);
  expect(layout.footerBottom).toBeLessThanOrEqual(height);
  if (width < 768) {
    expect(layout.left).toBe(0);
    expect(layout.top).toBe(0);
    expect(layout.right).toBe(width);
    expect(layout.bottom).toBe(height);
  } else {
    expect(layout.width).toBeLessThan(width);
    expect(layout.height).toBeLessThan(height);
  }
  return surface;
}

test("the global empty Favorites state keeps one mobile creation action", async ({ page }) => {
  await login(page, "profile-reader", "Profile-Reader-2026!");
  const data = await (await page.request.get("/api/app")).json();
  test.skip(data.favorites.length > 0, "The shared isolated workspace already has a favorite in this full-suite order.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/favorites");
  await expect(page.locator(".favorites-browser")).toBeHidden();
  await expect(page.locator(".favorites-toolbar")).toBeHidden();
  await expect(page.locator(".mobile-collections")).toBeHidden();
  await expect(page.locator(".favorites-mobile-add")).toBeVisible();
  await expect(page.locator(".favorites-empty-create")).toBeHidden();
});

test("collection editor fills mobile viewports, stays compact on desktop, and restores focus", async ({ page }) => {
  await login(page, "profile-qa", "Profile-QA-Old-2026!");
  const origin = test.info().project.use.baseURL ?? "http://localhost:3100";
  const favorite = await page.request.post("/api/app", {
    headers: { Origin: origin },
    data: { operation: "favorite.save", input: { name: "Mobile UX favorite", variant: null, priceCents: 12345678, platform: "weidian", url: "https://weidian.com/item.html?itemID=mobile-ux" } },
  });
  expect(favorite.ok()).toBeTruthy();

  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    if (width < 768) {
      await page.goto("/favorites");
      const trigger = page.getByRole("button", { name: "Nova coleção", exact: true });
      await trigger.click();
      const surface = await expectSurfaceGeometry(page, width, height);
      await expect(surface.getByLabel("Nome da coleção")).toBeVisible();
      if (width === 390) await capture(page, "collection-form-390-after.png");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(trigger).toBeFocused();
    } else {
      await page.goto("/favorites?newCollection=1");
      const surface = await expectSurfaceGeometry(page, width, height);
      await expect(surface.getByLabel("Nome da coleção")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
  }
});

test("purchase create and edit forms use complete mobile surfaces", async ({ page }) => {
  await login(page, "profile-qa", "Profile-QA-Old-2026!");
  await page.setViewportSize({ width: 320, height: 640 });
  const data = await (await page.request.get("/api/app")).json();
  const activePurchase = data.purchases.find((purchase: { status: string }) => purchase.status === "active");
  let createdPurchaseId: string | null = null;

  if (!activePurchase) {
    await page.goto("/purchase");
    const createTrigger = page.getByRole("button", { name: "Criar compra", exact: true });
    await createTrigger.click();
    let surface = await expectSurfaceGeometry(page, 320, 640);
    await expect(surface.getByLabel("Nome da compra")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(createTrigger).toBeFocused();

    await createTrigger.click();
    surface = await expectSurfaceGeometry(page, 320, 640);
    await surface.getByLabel("Nome da compra").fill("Compra UX mobile QA");
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      surface = await expectSurfaceGeometry(page, width, height);
      if (width === 390) await capture(page, "purchase-create-form-390-after.png");
    }
    await surface.getByRole("button", { name: "Criar compra", exact: true }).click();
    await expect(page.getByText("Em andamento", { exact: true })).toBeVisible();
    const savedData = await (await page.request.get("/api/app")).json();
    createdPurchaseId = savedData.purchases.find((purchase: { name: string; status: string }) => purchase.name === "Compra UX mobile QA" && purchase.status === "active")?.id ?? null;
    expect(createdPurchaseId).toBeTruthy();
  } else {
    await page.goto("/purchase");
  }

  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    if (width < 768) {
      await page.getByRole("button", { name: "Opções da compra", exact: true }).click();
      await page.getByRole("menuitem", { name: "Editar compra", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "Editar compra", exact: true }).click();
    }
    const surface = await expectSurfaceGeometry(page, width, height);
    await expect(surface.getByLabel("Nome da compra")).toBeVisible();
    if (width === 390) await capture(page, "purchase-edit-form-390-after.png");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }

  if (createdPurchaseId) {
    const finalize = await page.request.post("/api/app", {
      headers: { Origin: test.info().project.use.baseURL ?? "http://localhost:3100" },
      data: { operation: "purchase.finalize", id: createdPurchaseId, input: true },
    });
    expect(finalize.ok(), await finalize.text()).toBeTruthy();
  }
});
