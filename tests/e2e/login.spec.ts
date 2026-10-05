import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

test("login fits desktop, tablet and mobile with a simplified decorative scene", async ({ page }) => {
  mkdirSync("artifacts/qa", { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  await expect(page.getByTestId("orbital-scene")).toHaveAttribute("aria-hidden", "true");
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeInViewport();
    await expect(page.getByLabel("Email", { exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const scene = (await page.getByTestId("orbital-scene").boundingBox())!;
    const form = (await page.locator(".login-card").boundingBox())!;
    if (width >= 1024) expect(scene.x + scene.width).toBeLessThan(form.x);
    else {
      expect(scene.y + scene.height).toBeLessThanOrEqual(form.y);
      expect(await page.locator(".orbit-track:visible img").count()).toBeLessThan(7);
    }
    const missing = await page.locator(".login-page img").evaluateAll(images => images.some(image => !(image as HTMLImageElement).complete || !(image as HTMLImageElement).naturalWidth));
    expect(missing).toBe(false);
    await page.screenshot({ path: `artifacts/qa/login-${width}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});

test("products orbit continuously and stay upright throughout each revolution", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/login");
  const object = page.locator(".orbit-middle .orbit-upright").first();
  const initial = (await object.boundingBox())!;
  await expect.poll(async () => {
    const current = (await object.boundingBox())!;
    return Math.hypot(current.x - initial.x, current.y - initial.y);
  }).toBeGreaterThan(3);
  // Seek the actual browser animations to verify pose at every quadrant,
  // including the top of a reverse orbit where uncorrected content flips.
  const poses = await page.locator(".orbit-track").evaluateAll(tracks => tracks.flatMap(track => {
    const upright = track.querySelector(".orbit-upright")!;
    const animations = [track.getAnimations()[0], upright.getAnimations()[0]];
    const duration = Number(animations[0].effect!.getTiming().duration);
    return [0, .25, .5, .75].map(progress => {
      animations.forEach(animation => { animation.pause(); animation.currentTime = duration * progress; });
      const rotation = new DOMMatrix(getComputedStyle(track).transform).multiply(new DOMMatrix(getComputedStyle(upright).transform));
      return { x: rotation.a, y: rotation.b };
    });
  }));
  for (const pose of poses) { expect(pose.x).toBeCloseTo(1, 4); expect(pose.y).toBeCloseTo(0, 4); }
});

test("reduced motion keeps a balanced, fully static composition", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  await expect(page.locator(".orbital-center img")).toBeVisible();
  expect(await page.locator(".login-page").evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
  await page.getByLabel("Email", { exact: true }).click();
  expect(await page.locator(".orbital-field").evaluate(element => getComputedStyle(element).transform)).toBe("none");
  expect(await page.locator(".login-page").evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
  await page.screenshot({ path: "artifacts/qa/login-reduced-motion.png", fullPage: true });
});

test("login preserves focus, Enter, errors, loading, redirect, session and logout", async ({ page }) => {
  await page.goto("/login");
  const scene = page.getByTestId("orbital-scene");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  await expect(scene).toHaveAttribute("data-state", "email");
  await page.getByLabel("Email", { exact: true }).fill("gabriel@loti.test");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Senha", { exact: true })).toBeFocused();
  await expect(scene).toHaveAttribute("data-state", "password");
  await page.getByLabel("Senha", { exact: true }).fill("incorrect-password");
  await page.getByLabel("Senha", { exact: true }).press("Enter");
  await expect(page.locator("form").getByRole("alert")).toHaveText("Email ou senha incorretos.");
  await expect(page).toHaveURL(/\/login$/);

  let releaseRequest!: () => void;
  const gate = new Promise<void>(resolve => { releaseRequest = resolve; });
  await page.route("**/api/auth/sign-in/email", async route => { await gate; await route.continue(); });
  await page.getByLabel("Senha", { exact: true }).fill("Loti-Dev-Only-2026!");
  await page.getByLabel("Senha", { exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "Entrando…" })).toBeDisabled();
  await expect(page.locator("form")).toHaveAttribute("aria-busy", "true");
  await expect(scene).toHaveAttribute("data-state", "submitting");
  releaseRequest();
  await expect(page).toHaveURL(/\/favorites$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Favoritos", exact: true })).toBeVisible();
  await page.goto("/profile");
  await page.getByRole("button", { name: "Sair da conta", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/favorites");
  await expect(page).toHaveURL(/\/login$/);
});
