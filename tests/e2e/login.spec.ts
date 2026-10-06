import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const titles = ["Salve tudo em um só lugar", "Organize com o seu grupo", "Monte a compra juntos"];

test("stories fit desktop and tablet while mobile centers the auth form", async ({ page }) => {
  mkdirSync("artifacts/qa/login-stories", { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  for (const width of [320, 390, 767, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    const auth = page.locator(".login-auth-pane");
    const stories = page.getByTestId("login-stories");
    await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeInViewport();
    await expect(page.getByLabel("Email", { exact: true })).toBeInViewport();
    await expect(page.locator(".login-card")).toHaveCount(0);
    const formBox = (await auth.boundingBox())!;
    const storiesBox = (await stories.boundingBox())!;
    if (width >= 768) {
      expect(formBox.x + formBox.width).toBeLessThanOrEqual(storiesBox.x);
      expect(formBox.width / width).toBeCloseTo(width >= 1280 ? .44 : width >= 1024 ? .46 : .48, 2);
    } else {
      await expect(stories).toBeHidden();
      expect(formBox.y).toBe(0);
      expect(formBox.height).toBeGreaterThanOrEqual(844);
      const contentBox = (await page.locator(".login-auth-content").boundingBox())!;
      expect(contentBox.width).toBeLessThanOrEqual(360);
      expect(Math.abs(contentBox.x + contentBox.width / 2 - width / 2)).toBeLessThanOrEqual(1);
      continue;
    }
    for (let index = 0; index < 3; index++) {
      await page.getByRole("button", { name: `História ${index + 1}: ${titles[index]}`, exact: true }).click();
      await expect(stories).toHaveAttribute("data-slide", String(index + 1));
      await expect(stories.getByRole("heading", { name: titles[index], exact: true })).toBeVisible();
      await expect.poll(() => page.locator(".login-page img:visible").evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const heading = (await page.locator(".story-copy").boundingBox())!;
      const cards = await page.locator(".story-ui").all();
      for (const card of cards) {
        const box = (await card.boundingBox())!;
        expect(box.y + box.height).toBeLessThanOrEqual(heading.y);
      }
      await expect(page.locator(".story-decoration:visible").first()).toHaveAttribute("aria-hidden", "true");
      await page.screenshot({ path: `artifacts/qa/login-stories/${width}-story-${index + 1}.png`, fullPage: true });
    }
    await expect(stories.getByText("R$ 778,80", { exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("autoplay, manual navigation, keyboard, timer reset and pauses work", async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/login");
  const stories = page.getByTestId("login-stories");
  await expect(stories).toHaveAttribute("data-reduced-motion", "false");
  await page.mouse.move(0, 0);
  await page.clock.runFor(6500);
  await expect(stories).toHaveAttribute("data-slide", "2");
  await page.clock.runFor(550);
  await expect(page.locator(".story-outgoing")).toHaveCount(0);
  await stories.hover();
  await page.clock.runFor(13000);
  await expect(stories).toHaveAttribute("data-slide", "2");
  await page.getByRole("button", { name: "Próxima história", exact: true }).click();
  await expect(stories).toHaveAttribute("data-slide", "3");
  await expect(page.getByRole("status")).toHaveText("História 3 de 3: Monte a compra juntos");
  await page.mouse.move(0, 0);
  await page.clock.runFor(13000);
  await expect(stories).toHaveAttribute("data-slide", "3"); // control still focused
  await page.keyboard.press("ArrowRight");
  await expect(stories).toHaveAttribute("data-slide", "1");
  await page.getByLabel("Email", { exact: true }).focus();
  await page.clock.runFor(6499);
  await expect(stories).toHaveAttribute("data-slide", "1");
  await page.clock.runFor(1);
  await expect(stories).toHaveAttribute("data-slide", "2");
  await page.getByRole("button", { name: "Pausar histórias", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).focus();
  await page.mouse.move(0, 0);
  await page.clock.runFor(13000);
  await expect(stories).toHaveAttribute("data-slide", "2");
  await page.getByRole("button", { name: "Retomar histórias", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).focus();
  await page.mouse.move(0, 0);
  await page.clock.runFor(6500);
  await expect(stories).toHaveAttribute("data-slide", "3");
});

test("purchase narrative transfers items, updates checks and progress, then rests", async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.goto("/login");
  await page.getByRole("button", { name: `História 3: ${titles[2]}`, exact: true }).click();
  const scene = page.locator(".login-story:not(.story-outgoing)");
  const progress = scene.getByRole("progressbar");
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  await page.clock.runFor(700);
  await expect(scene.locator(".purchase-line-0")).toHaveAttribute("data-arrived", "true");
  await expect(scene.getByRole("checkbox", { name: "Tênis casual: Pendente", exact: true })).toHaveAttribute("aria-checked", "false");
  await page.clock.runFor(450);
  await expect(scene.getByRole("checkbox", { name: "Tênis casual: Adicionado", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(progress).toHaveAttribute("aria-valuenow", "1");
  await page.clock.runFor(650);
  await expect(progress).toHaveAttribute("aria-valuenow", "2");
  await expect(scene.getByText("2 de 3 itens adicionados", { exact: true })).toBeVisible();
  await expect(scene.getByText("R$ 778,80", { exact: true })).toBeVisible();
  await page.clock.runFor(4000);
  expect(await scene.evaluate(element => element.getAnimations({ subtree: true }).some(animation => animation.effect?.getTiming().iterations === Infinity))).toBe(false);
  await expect(progress).toHaveAttribute("aria-valuenow", "2");
});

test("reduced motion disables autoplay and animations while manual navigation works", async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  const stories = page.getByTestId("login-stories");
  await page.clock.runFor(20000);
  await expect(stories).toHaveAttribute("data-slide", "1");
  expect(await page.locator(".login-page").evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
  await page.getByRole("button", { name: "Próxima história", exact: true }).click();
  await expect(stories).toHaveAttribute("data-slide", "2");
  await page.keyboard.press("ArrowRight");
  await expect(stories).toHaveAttribute("data-slide", "3");
  await expect(stories.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
  expect(await page.locator(".login-page").evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
  await page.getByRole("button", { name: "História anterior", exact: true }).click();
  await expect(stories).toHaveAttribute("data-slide", "2");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(stories).toBeHidden();
  }
});

test("login preserves labels, Enter, validation, errors, loading, redirect, session and logout", async ({ page }) => {
  await page.goto("/login");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.locator("form").evaluate((form: HTMLFormElement) => form.checkValidity())).toBe(false);
  await page.getByLabel("Email", { exact: true }).fill("gabriel@loti.test");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Senha", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Mostrar senha", exact: true }).click();
  await expect(page.getByLabel("Senha", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Ocultar senha", exact: true }).click();
  await expect(page.getByLabel("Senha", { exact: true })).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Esqueceu a senha?", exact: true }).click();
  await expect(page.locator(".login-recovery-help")).toHaveText("Para redefinir sua senha, peça ajuda a quem configurou seu acesso ao Loti.");
  await page.getByLabel("Senha", { exact: true }).fill("incorrect-password");
  await page.getByLabel("Senha", { exact: true }).press("Enter");
  await expect(page.locator("form").getByRole("alert")).toHaveText("Email ou senha incorretos.");
  await expect(page).toHaveURL(/\/login$/);
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  let releaseRequest!: () => void;
  const gate = new Promise<void>(resolve => { releaseRequest = resolve; });
  await page.route("**/api/auth/sign-in/email", async route => { await gate; await route.continue(); });
  await page.getByLabel("Senha", { exact: true }).fill("Loti-Dev-Only-2026!");
  await page.getByLabel("Senha", { exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "Entrando…" })).toBeDisabled();
  await expect(page.locator("form")).toHaveAttribute("aria-busy", "true");
  const stories = page.getByTestId("login-stories");
  const index = await stories.getAttribute("data-slide");
  await expect(stories).toHaveAttribute("data-paused", "true");
  await expect(page.getByRole("button", { name: "Próxima história", exact: true })).toBeDisabled();
  await page.clock.runFor(13000);
  await expect(stories).toHaveAttribute("data-slide", index!);
  releaseRequest();
  await page.clock.resume();
  await expect(page).toHaveURL(/\/favorites$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Favoritos", exact: true })).toBeVisible();
  await page.goto("/profile");
  await page.getByRole("button", { name: "Sair da conta", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/favorites");
  await expect(page).toHaveURL(/\/login$/);
});

test("connection errors and rate-limit feedback keep the form usable", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("gabriel@loti.test");
  await page.getByLabel("Senha", { exact: true }).fill("Loti-Dev-Only-2026!");
  await page.route("**/api/auth/sign-in/email", route => route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ message: "Too many attempts" }) }));
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("Muitas tentativas. Aguarde um pouco e tente novamente.");
  await page.unroute("**/api/auth/sign-in/email");
  await page.route("**/api/auth/sign-in/email", route => route.abort("failed"));
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("Não foi possível conectar. Tente novamente.");
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeEnabled();
});
