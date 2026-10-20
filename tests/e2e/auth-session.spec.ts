import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("session persists across tabs and a restored browser context; logout revokes it everywhere", async ({ page, context, browser }) => {
  await login(page);
  const sessionCookie = (await context.cookies()).find(cookie => cookie.name.endsWith("better-auth.session_token"));
  expect(sessionCookie).toBeDefined();
  const { httpOnly, sameSite, path, domain, secure } = sessionCookie!;
  expect({ httpOnly, sameSite, path, domain, secure }).toEqual({ httpOnly: true, sameSite: "Lax", path: "/", domain: "localhost", secure: false });
  expect(sessionCookie!.expires).toBeGreaterThan(Date.now() / 1000 + 13 * 86400);
  expect(await page.evaluate(() => document.cookie.includes("better-auth.session_token"))).toBe(false);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Favoritos", exact: true })).toBeVisible();
  const second = await context.newPage();
  await second.goto("/profile");
  await expect(second.getByRole("heading", { name: "Seu perfil", exact: true })).toBeVisible();
  // Persisted cookies survive restoring a browser context, without writing tokens
  // to disk or logging them. This does not restart the user's actual browser.
  const restored = await browser.newContext({ storageState: await context.storageState() });
  try {
    const reopened = await restored.newPage();
    await reopened.goto("http://localhost:3100/favorites");
    await expect(reopened.getByRole("heading", { name: "Favoritos", exact: true })).toBeVisible();
    await second.getByRole("button", { name: "Sair da conta", exact: true }).click();
    await expect(second).toHaveURL(/\/login$/);
    for (const target of [page, reopened]) {
      await target.reload();
      await expect(target).toHaveURL(/\/login$/);
    }
  } finally { await restored.close(); }
});
