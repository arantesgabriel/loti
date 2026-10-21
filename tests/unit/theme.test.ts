import { afterEach, describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import { getServerThemeSnapshot, getThemeSnapshot, setThemePreference, subscribeToTheme, themeBootstrap, THEME_STORAGE_KEY } from "@/lib/theme";

function browser(stored: string | null = null, dark = false, blocked = false) {
  const dataset: Record<string, string> = {};
  const media = Object.assign(new EventTarget(), { matches: dark });
  const storage = {
    getItem: vi.fn(() => { if (blocked) throw new Error("Blocked"); return stored; }),
    setItem: vi.fn((_key: string, value: string) => { if (blocked) throw new Error("Blocked"); stored = value; }),
  };
  const window = Object.assign(new EventTarget(), { localStorage: storage, matchMedia: () => media });
  const document = { documentElement: { dataset } };
  runInNewContext(themeBootstrap, { window, document });
  vi.stubGlobal("window", window);
  vi.stubGlobal("document", document);
  return { dataset, window, storage, media };
}

afterEach(() => vi.unstubAllGlobals());

describe("theme initialization and browser lifecycle", () => {
  it.each([null, "invalid", "<script>"])("keeps the existing light default for %s, even on a dark system", stored => {
    const { dataset } = browser(stored, true);
    expect(dataset).toEqual({ themePreference: "light", theme: "light" });
  });

  it.each([["light", true, "light"], ["dark", false, "dark"], ["system", true, "dark"], ["system", false, "light"]])("resolves persisted %s before React mounts", (stored, dark, resolved) => {
    const { dataset } = browser(stored as string, dark as boolean);
    expect(dataset.theme).toBe(resolved);
    expect(dataset.themePreference).toBe(stored);
  });

  it("works with unavailable storage and retains explicit changes in memory", () => {
    const { dataset, media } = browser(null, false, true);
    const cleanup = subscribeToTheme(() => {});
    expect(() => setThemePreference("dark")).not.toThrow();
    media.matches = false;
    media.dispatchEvent(new Event("change"));
    expect(dataset.theme).toBe("dark");
    expect(getThemeSnapshot()).toBe("dark:dark");
    cleanup();
  });

  it("follows system changes only while System is selected and removes listeners", () => {
    const { dataset, media, storage } = browser("system");
    const changed = vi.fn();
    const cleanup = subscribeToTheme(changed);
    media.matches = true;
    media.dispatchEvent(new Event("change"));
    expect(getThemeSnapshot()).toBe("system:dark");
    setThemePreference("light");
    expect(storage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, "light");
    media.matches = false;
    media.dispatchEvent(new Event("change"));
    expect(changed).toHaveBeenCalledTimes(2);
    expect(dataset.theme).toBe("light");
    setThemePreference("system");
    cleanup();
    media.matches = true;
    media.dispatchEvent(new Event("change"));
    expect(dataset.theme).toBe("light");
  });

  it("synchronizes other tabs, removal and clear without reacting to unrelated storage", () => {
    const { dataset, window, storage } = browser();
    const cleanup = subscribeToTheme(() => {});
    function event(key: string | null, newValue: string | null, storageArea: unknown = storage) {
      window.dispatchEvent(Object.assign(new Event("storage"), { key, newValue, storageArea }));
    }
    event("other", "dark");
    event(THEME_STORAGE_KEY, "dark", {});
    expect(dataset.theme).toBe("light");
    event(THEME_STORAGE_KEY, "dark");
    expect(dataset.theme).toBe("dark");
    event(THEME_STORAGE_KEY, null);
    expect(dataset.theme).toBe("light");
    event(THEME_STORAGE_KEY, "dark");
    event(null, null);
    expect(dataset.theme).toBe("light");
    cleanup();
  });

  it("provides a deterministic server snapshot without accessing the browser", () => {
    expect(getServerThemeSnapshot()).toBe("light:light");
    const document = { documentElement: { dataset: {} } };
    expect(() => runInNewContext(themeBootstrap, { document, window: {} })).not.toThrow();
    expect(document.documentElement.dataset).toEqual({ themePreference: "light", theme: "light" });
  });
});
