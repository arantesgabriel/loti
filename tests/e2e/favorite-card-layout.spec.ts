import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

test("favorite cards keep price, metadata and footer aligned across content variations", async ({ page }) => {
  const auth = await page.request.post("/api/auth/sign-in/email", { headers: { Origin: "http://localhost:3100" }, data: { email: "gabriel@loti.test", password: "Loti-Dev-Only-2026!" } });
  expect(auth.ok()).toBe(true);
  await page.goto("/favorites");
  const longName = "Alinhamento QA · Tênis para caminhada com acabamento especial e descrição muito longa para testar a leitura da grade de favoritos";
  const favorites = [
    { name: "Alinhamento QA · Tênis", variant: null, priceCents: 9500, platform: "hubbuy" },
    { name: "Alinhamento QA · Camiseta Uniqlo", variant: "Branco · Tamanho L", priceCents: null, platform: "weidian" },
    { name: longName, variant: null, priceCents: 0, platform: "taobao" },
    { name: "Alinhamento QA · SSD NVMe", variant: "Modelo com uma variação muito longa que deve continuar em uma única linha", priceCents: 99999999, platform: "other" },
    { name: longName, variant: "42", priceCents: null, platform: "shopee" },
    { name: "Alinhamento QA · Mouse", variant: null, priceCents: 12000, platform: "1688" },
  ];
  const headers = { Origin: "http://localhost:3100" };
  for (const [index, fields] of favorites.entries()) {
    const response = await page.request.post("/api/app", { headers, data: { operation: "favorite.save", input: { ...fields, url: `https://weidian.com/item.html?itemID=layout-${index}` } } });
    expect(response.ok()).toBe(true);
  }
  await page.request.post("/api/app", { headers, data: { operation: "preference.view", input: "cards" } });
  await page.reload();
  await page.getByLabel("Buscar favoritos").fill("Alinhamento QA");
  const cards = page.getByTestId("favorite");
  await expect(cards).toHaveCount(6);
  await expect(cards.filter({ has: page.getByRole("button", { name: "Alinhamento QA · Camiseta Uniqlo", exact: true }) }).locator(".favorite-price")).toHaveText("Preço não informado");
  await expect(cards.filter({ hasText: "R$ 0,00" }).locator(".favorite-price")).toHaveText("R$ 0,00");
  mkdirSync("artifacts/qa", { recursive: true });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await cards.evaluateAll(elements => elements.map(card => {
      const bounds = card.getBoundingClientRect();
      const areas = [".favorite-title", ".favorite-variant", ".favorite-price", ".favorite-meta", ".favorite-actions"];
      return {
        height: bounds.height,
        offsets: areas.map(selector => card.querySelector(selector)!.getBoundingClientRect().top - bounds.top),
        footerGap: bounds.bottom - card.querySelector(".favorite-actions")!.getBoundingClientRect().bottom,
        titleHeight: card.querySelector(".favorite-title")!.getBoundingClientRect().height,
        lineHeight: parseFloat(getComputedStyle(card.querySelector(".favorite-title")!).lineHeight),
        contained: areas.every(selector => {
          const box = card.querySelector(selector)!.getBoundingClientRect();
          return box.left >= bounds.left && box.right <= bounds.right && box.bottom <= bounds.bottom;
        }),
      };
    }));
    for (const card of geometry) {
      expect(card.contained).toBe(true);
      expect(card.titleHeight).toBeCloseTo(card.lineHeight * 2, 1);
      expect(card.height).toBeCloseTo(geometry[0].height, 1);
      expect(card.footerGap).toBeCloseTo(geometry[0].footerGap, 1);
      card.offsets.forEach((offset, index) => expect(offset).toBeCloseTo(geometry[0].offsets[index], 1));
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390 || width === 1440) await page.screenshot({ path: `artifacts/qa/favorite-card-alignment-${width}.png`, fullPage: true });
  }
  await cards.filter({ hasText: "R$ 0,00" }).getByRole("button", { name: longName, exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: longName, exact: true })).toBeVisible();
  const updated = await (await page.request.get("/api/app")).json();
  for (const favorite of updated.favorites.filter((f: { name: string }) => f.name.startsWith("Alinhamento QA"))) {
    expect((await page.request.post("/api/app", { headers, data: { operation: "favorite.delete", id: favorite.id } })).ok()).toBe(true);
  }
});
