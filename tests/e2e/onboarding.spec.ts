import { test, expect, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
let client = 60;
async function login(page: Page, name = "onboarding-new") {
  await page.setExtraHTTPHeaders({ "X-Forwarded-For": `203.0.113.${++client}` });
  await page.goto("/login");
  await page.waitForFunction(() => { const form = document.querySelector("form"); return form && Object.keys(form).some(key => key.startsWith("__reactProps$")); });
  await page.getByLabel("Email", { exact: true }).fill(`${name}@loti.test`);
  await page.getByLabel("Senha", { exact: true }).fill("Onboarding-QA-Only-2026!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("**/favorites");
}
test("H3-C visual evidence, optional answers, motion and first actual favorite", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await login(page);
  await expect(page.getByRole("heading", { name: "Da bagunça à clareza." })).toBeVisible();
  await expect(page.locator('input[type="radio"]:checked')).toHaveCount(0);
  await expect(page.getByRole("radiogroup")).toHaveCount(2);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const contrasts = [];
  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve(null))));
    const ratios = await page.evaluate(() => {
      function rgb(color: string) { return color.startsWith("#") ? [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)) : color.match(/[\d.]+/g)!.slice(0, 3).map(Number); }
      function luminance(color: string) { const channels = rgb(color).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722; }
      return [".h3c-primary", ".h3c-eyebrow", ".h3c-chip > span", ".h3c-story-description", ".h3c-text"].map(selector => {
        const node = document.querySelector<HTMLElement>(selector)!;
        let parent: HTMLElement | null = node, background = "";
        while (parent) { background = getComputedStyle(parent).backgroundColor; if (background !== "rgba(0, 0, 0, 0)" && background !== "transparent") break; parent = parent.parentElement; }
        const fg = luminance(getComputedStyle(node).color), bg = luminance(background);
        return { selector, ratio: (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05) };
      });
    });
    for (const ratio of ratios) expect(ratio.ratio).toBeGreaterThanOrEqual(4.5);
    contrasts.push({ theme, ratios });
  }
  await page.evaluate(() => document.documentElement.dataset.theme = "light");
  await test.info().attach("contrast", { body: JSON.stringify(contrasts, null, 2), contentType: "application/json" });
  const measurements = [];
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: width === 320 ? 958 : width < 901 ? 844 : width === 1920 ? 1080 : 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.screenshot({ path: `artifacts/qa/onboarding/browser-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    measurements.push(await page.locator(".h3c").evaluate(root => {
      const bounds = (selector: string) => { const rect = root.querySelector(selector)!.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; };
      return { viewport: innerWidth, title: bounds("h1"), card: bounds(".h3c-card"), cta: bounds(".h3c-primary"), form: bounds(".h3c-form"), font: getComputedStyle(root).fontFamily };
    }));
    await page.getByRole("button", { name: "Entrar no meu espaço", exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Entrar no meu espaço", exact: true })).toBeInViewport();
  }
  await test.info().attach("layout-measurements", { body: JSON.stringify(measurements, null, 2), contentType: "application/json" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.documentElement.dataset.theme = "dark");
  await page.screenshot({ path: "artifacts/qa/onboarding/browser-dark-390.png", fullPage: true });
  expect(await page.locator(".h3c-deck").getAttribute("data-ambient")).toBe("false");
  // Desktop 1440px at 200% zoom reflows to a 720 CSS-pixel viewport.
  // CSS zoom alone does not update media queries and is not browser zoom.
  await page.setViewportSize({ width: 720, height: 450 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/qa/onboarding/browser-zoom200.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const profiler = await page.context().newCDPSession(page);
  await profiler.send("Performance.enable");
  const beforeMetrics = (await profiler.send("Performance.getMetrics")).metrics;
  await page.getByRole("button", { name: "Próximo cartão", exact: true }).click();
  await expect(page.locator(".h3c-card h2")).toHaveText("Compra atual");
  await page.screenshot({ path: "artifacts/qa/onboarding/browser-r7-purchase-390.png", fullPage: true });
  const durations = await page.locator(".h3c-card").evaluate(card => card.getAnimations({ subtree: true }).map(a => a.effect?.getTiming().duration));
  expect(durations.filter((d): d is number => typeof d === "number").every(d => d >= 280 && d <= 420 || d === 720)).toBe(true);
  await test.info().attach("card-motion", { body: JSON.stringify(durations), contentType: "application/json" });
  await page.getByRole("button", { name: "Próximo cartão", exact: true }).click();
  await expect(page.locator(".h3c-card h2")).toHaveText("Pacotes");
  await page.screenshot({ path: "artifacts/qa/onboarding/browser-r7-packages-390.png", fullPage: true });
  await page.getByRole("button", { name: "Cartão anterior", exact: true }).click();
  const afterMetrics = (await profiler.send("Performance.getMetrics")).metrics;
  const motionProfile = ["TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration", "LayoutCount"].map(name => ({ name,
    delta: (afterMetrics.find(m => m.name === name)?.value ?? 0) - (beforeMetrics.find(m => m.name === name)?.value ?? 0) }));
  await test.info().attach("motion-performance", { body: JSON.stringify(motionProfile, null, 2), contentType: "application/json" });
  await profiler.detach();
  await page.getByRole("radio", { name: "Nunca importei", exact: true }).check();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Algumas vezes", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Entrar no meu espaço", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Favoritos", exact: true })).toBeVisible();
  const data = await (await page.request.get("/api/app")).json();
  let state = await (await page.request.get(`/api/onboarding?workspaceId=${data.workspaceId}`)).json();
  expect(state.profile).toMatchObject({ experience: "sometimes", usageIntent: "unspecified" });
  expect(state.introduction.status).toBe("completed"); expect(state.milestones).toEqual([]);
  await expect(page.getByRole("link", { name: "Ou iniciar pela Compra atual" })).toBeVisible();
  await page.getByRole("button", { name: "Adicionar favorito", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  state = await (await page.request.get(`/api/onboarding?workspaceId=${data.workspaceId}`)).json();
  expect(state.milestones).toEqual([]);
  await page.getByRole("button", { name: "Adicionar favorito", exact: true }).click();
  await page.getByLabel("Nome do produto", { exact: true }).fill("Produto sintético onboarding");
  await page.getByLabel(/Link/).fill("https://example.test/onboarding-product");
  await page.getByRole("button", { name: "Salvar favorito", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  state = await (await page.request.get(`/api/onboarding?workspaceId=${data.workspaceId}`)).json();
  expect(state.milestones).toEqual([expect.objectContaining({ milestone: "M1", evidence: "committed" })]);
  expect(errors).toEqual([]);
});
test("both questions can stay unanswered and purchase creation alone never becomes M1", async ({ page }) => {
  await login(page, "onboarding-blank");
  await expect(page.locator(".h3c")).toBeVisible();
  await page.getByRole("button", { name: "Entrar no meu espaço", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Favoritos", exact: true })).toBeVisible();
  const data = await (await page.request.get("/api/app")).json();
  let state = await (await page.request.get(`/api/onboarding?workspaceId=${data.workspaceId}`)).json();
  expect(state.profile).toMatchObject({ experience: "unspecified", usageIntent: "unspecified", revision: 0 });
  await page.getByRole("link", { name: "Ou iniciar pela Compra atual" }).click();
  await page.getByRole("button", { name: "Continuar na compra", exact: true }).click();
  await page.getByLabel("Nome da compra", { exact: true }).fill("Compra sintética H3-C");
  await page.getByRole("dialog").getByRole("button", { name: "Criar compra", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  state = await (await page.request.get(`/api/onboarding?workspaceId=${data.workspaceId}`)).json();
  expect(state.milestones).toEqual([]);
  // Exercise the real business HTTP contract without involving analytics.
  const response = await page.request.post("/api/app", { headers: { Origin: "http://localhost:3120" }, data: {
    operation: "item.save", workspaceId: data.workspaceId, input: { name: "Item sintético", url: "https://example.test/item", quantity: 1, unitPriceCents: null, personId: data.currentUser.id },
  } });
  expect(response.status()).toBe(200);
  state = await (await page.request.get(`/api/onboarding?workspaceId=${data.workspaceId}`)).json();
  expect(state.milestones.map((m: { milestone: string }) => m.milestone).sort()).toEqual(["M1", "M2"]);
});
test("a deep link and an editor opened during bootstrap take precedence", async ({ page }) => {
  expect((await page.request.post("/api/auth/sign-in/email", { headers: { Origin: "http://localhost:3120" }, data: { email: "onboarding-deep@loti.test", password: "Onboarding-QA-Only-2026!" } })).status()).toBe(200);
  await page.goto("/favorites?collection=none");
  await expect(page.getByRole("heading", { name: "Favoritos", exact: true })).toBeVisible();
  await expect(page.locator(".h3c")).toHaveCount(0);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/onboarding?*", async route => { await gate; await route.continue(); });
  await page.goto("/favorites");
  await page.getByRole("button", { name: "Novo favorito", exact: true }).first().click();
  await page.getByLabel("Nome do produto", { exact: true }).fill("Rascunho preservado");
  release();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Nome do produto", { exact: true })).toHaveValue("Rascunho preservado");
  await expect(page.locator(".h3c")).toHaveCount(0);
  await page.unroute("**/api/onboarding?*");
});
test("a second session cannot silently overwrite locally edited answers", async ({ page, browser }) => {
  await login(page, "onboarding-conflict");
  await expect(page.locator(".h3c")).toBeVisible();
  await page.getByRole("radio", { name: "Nunca importei", exact: true }).check();
  const data = await (await page.request.get("/api/app")).json();
  const second = await browser.newContext();
  expect((await second.request.post("http://localhost:3120/api/auth/sign-in/email", { headers: { Origin: "http://localhost:3120", "X-Forwarded-For": "203.0.113.190" }, data: { email: "onboarding-conflict@loti.test", password: "Onboarding-QA-Only-2026!" } })).status()).toBe(200);
  expect((await second.request.post("http://localhost:3120/api/onboarding", { headers: { Origin: "http://localhost:3120" }, data: { command: "profile.save", workspaceId: data.workspaceId, expectedRevision: 0, patch: { experience: "expert" } } })).status()).toBe(200);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("button", { name: "Entrar no meu espaço", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "outra sessão" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Nunca importei", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Recarregar estado confirmado", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Expert", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Entrar no meu espaço", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Favoritos", exact: true })).toBeVisible();
  await second.close();
});
test("activation and legacy accounts retain their current entry", async ({ page }) => {
  await login(page, "onboarding-pending");
  await expect(page.getByRole("heading", { name: "Confirme seu email." })).toBeVisible();
  expect((await page.request.get("/api/app")).status()).toBe(403);
  await page.context().clearCookies();
  await login(page, "onboarding-old");
  await expect(page.getByRole("heading", { name: "Favoritos", exact: true })).toBeVisible();
  await expect(page.locator(".h3c")).toHaveCount(0);
});
test("close, manual resume, skip and dismissed help remain distinct", async ({ page }) => {
  await login(page, "onboarding-other");
  await expect(page.locator(".h3c")).toBeVisible();
  await page.getByRole("button", { name: "Fechar por agora", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Favoritos", exact: true })).toBeVisible();
  await page.reload(); await expect(page.locator(".h3c")).toHaveCount(0);
  await page.goto("/profile");
  await page.getByRole("button", { name: "Conhecer o Loti / retomar introdução" }).click();
  await expect(page.locator(".h3c")).toBeVisible();
  await page.getByRole("button", { name: "Pular introdução por agora", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Favoritos", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ajuda com Favoritos", exact: true }).click();
  await page.getByRole("button", { name: "Não mostrar mais dicas", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ajuda com Favoritos", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ajuda com Favoritos", exact: true }).click();
  await expect(page.getByRole("button", { name: "Adicionar favorito", exact: true })).toBeVisible();
});

for (const width of [320, 390, 768, 1440, 1920]) test(`R8 matrix ${width}: themes, motion, partial form, rapid clicks and exit`, async ({ page }) => {
  if (width === 320) {
    await page.addInitScript(() => Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 2 }));
    const cpu = await page.context().newCDPSession(page);
    await cpu.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  await page.addInitScript(() => {
    const metrics = { cls: 0, longTasks: [] as number[] };
    (window as unknown as { onboardingQAMetrics: typeof metrics }).onboardingQAMetrics = metrics;
    new PerformanceObserver(list => { for (const entry of list.getEntries()) {
      const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
      if (!shift.hadRecentInput) metrics.cls += shift.value;
    } }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver(list => { for (const entry of list.getEntries()) metrics.longTasks.push(entry.duration); }).observe({ type: "longtask", buffered: true });
  });
  await page.setViewportSize({ width, height: width === 320 ? 958 : width === 1920 ? 1080 : width < 901 ? 844 : 900 });
  await login(page, `onboarding-matrix${width}`);
  await expect(page.locator(".h3c")).toBeVisible();
  const smallTargets = await page.locator(".h3c").evaluate(root => [...root.querySelectorAll<HTMLElement>("button,a,input[type=radio]")]
    .filter(element => { const rect = element.getBoundingClientRect(); return !element.hasAttribute("disabled") && getComputedStyle(element).visibility !== "hidden" && rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44); })
    .map(element => ({ label: element.getAttribute("aria-label") || element.textContent, width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })));
  expect(smallTargets).toEqual([]);
  for (const theme of ["light", "dark"]) for (const motion of ["reduce", "no-preference"] as const) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    await page.emulateMedia({ reducedMotion: motion });
    await page.getByRole("button", { name: "Próximo cartão", exact: true }).click();
    await expect(page.locator(".h3c-card h2")).toHaveText("Compra atual");
    await page.getByRole("button", { name: "Próximo cartão", exact: true }).click();
    await expect(page.locator(".h3c-card h2")).toHaveText("Pacotes");
    await page.getByRole("button", { name: "Cartão anterior", exact: true }).click();
    await page.getByRole("button", { name: "Cartão anterior", exact: true }).click();
    await page.getByRole("radio", { name: "Expert", exact: true }).check();
    await page.getByRole("radio", { name: "Em grupo", exact: true }).check();
    await page.screenshot({ path: `artifacts/qa/onboarding/matrix-${width}-${theme}-${motion}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (motion === "reduce") {
      expect(await page.locator(".h3c-deck").getAttribute("data-ambient")).toBe("false");
      expect(await page.locator(".h3c").evaluate(root => root.getAnimations({ subtree: true }).every(a => Number(a.effect?.getComputedTiming().duration ?? 0) <= 120))).toBe(true);
    }
    if (width === 320) expect(await page.locator(".h3c-deck").getAttribute("data-ambient")).toBe("false");
  }
  const before = await (await page.request.get("/api/app")).json();
  await page.getByRole("button", { name: "Entrar no meu espaço", exact: true }).click({ clickCount: 2 });
  await expect(page.getByRole("heading", { name: "Favoritos", exact: true })).toBeVisible();
  await expect(page.locator(".h3c-exiting")).toHaveCount(0);
  const after = await (await page.request.get("/api/app")).json();
  expect(after.workspaces).toEqual(before.workspaces);
  expect(after.favorites).toEqual([]); expect(after.purchases).toEqual([]);
  await test.info().attach(`runtime-${width}`, { body: JSON.stringify(await page.evaluate(() => (window as unknown as { onboardingQAMetrics: unknown }).onboardingQAMetrics)), contentType: "application/json" });
});

test("writes comparable canonical Penpot/browser pairs", async ({ page }) => {
  const pairs = [];
  for (const width of [320, 390, 1440, 1920]) {
    const reference = await readFile(`artifacts/qa/onboarding/reference/${width}.png`);
    const actual = await readFile(`artifacts/qa/onboarding/browser-${width}.png`);
    const html = `<!doctype html><meta charset="utf-8"><title>H3-C ${width}: Penpot × browser</title><style>body{margin:0;background:#eee;font:14px Arial}main{display:grid;grid-template-columns:repeat(2,${width}px);gap:12px}figure{margin:0}figcaption{padding:10px;background:#fff}img{display:block;width:${width}px}</style><main><figure><figcaption>Penpot canônico · ${width}px</figcaption><img src="data:image/png;base64,${reference.toString("base64")}"></figure><figure><figcaption>Browser local · ${width}px · Geist e tokens Loti</figcaption><img src="data:image/png;base64,${actual.toString("base64")}"></figure></main>`;
    await writeFile(`artifacts/qa/onboarding/compare-${width}.html`, html);
    await page.setViewportSize({ width: width * 2 + 12, height: 1100 });
    await page.setContent(html); await page.screenshot({ path: `artifacts/qa/onboarding/compare-${width}.png`, fullPage: true });
    pairs.push({ width, reference: `reference/${width}.png`, browser: `browser-${width}.png`, pair: `compare-${width}.png` });
  }
  await writeFile("artifacts/qa/onboarding/comparisons.json", JSON.stringify(pairs, null, 2));
});

test("a pending invitation also silences proactive help after a completed introduction", async ({ page }) => {
  expect((await page.request.post("/api/auth/sign-in/email", { headers: { Origin: "http://localhost:3120" }, data: { email: "onboarding-invite-pause@loti.test", password: "Onboarding-QA-Only-2026!" } })).status()).toBe(200);
  const data = await (await page.request.get("/api/app")).json();
  expect((await page.request.post("/api/onboarding", { headers: { Origin: "http://localhost:3120" }, data: { command: "intro.complete", workspaceId: data.workspaceId, flowVersion: 1, expectedRevision: 0 } })).status()).toBe(200);
  await page.goto("/favorites");
  await expect(page.locator(".guidance-help")).toBeVisible();
  // Server-side invitation detection is tested against real rows in integration.
  // Here the private snapshot simulates an invitation arriving in another tab.
  await page.route("**/api/onboarding?*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), hasPendingInvitation: true } });
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "Ajuda com Favoritos", exact: true })).toBeVisible();
  await expect(page.locator(".guidance-help")).toHaveCount(0);
});
