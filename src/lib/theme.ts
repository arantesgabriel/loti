export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "loti.theme";
export const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";
const THEME_CHANGE_EVENT = "loti:theme-change";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

// Self-contained so the same initialization can run before paint, without React.
function initializeTheme(storageKey: string, mediaQuery: string) {
  let preference = "light";
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === "light" || stored === "dark" || stored === "system") preference = stored;
  } catch { /* A blocked browser store must never block the application. */ }
  let systemDark = false;
  try { systemDark = window.matchMedia(mediaQuery).matches; } catch { /* Use light without matchMedia. */ }
  const root = document.documentElement;
  root.dataset.themePreference = preference;
  root.dataset.theme = preference === "dark" || preference === "system" && systemDark ? "dark" : "light";
}

export const themeBootstrap = `(${initializeTheme.toString()})(${JSON.stringify(THEME_STORAGE_KEY)},${JSON.stringify(SYSTEM_THEME_QUERY)});`;

function preferenceFromRoot(): ThemePreference {
  const value = document.documentElement.dataset.themePreference;
  return isThemePreference(value) ? value : "light";
}

function applyPreference(preference: ThemePreference) {
  const systemDark = typeof window.matchMedia === "function" && window.matchMedia(SYSTEM_THEME_QUERY).matches;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = preference === "dark" || preference === "system" && systemDark ? "dark" : "light";
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

let themeAnimationTimer: ReturnType<typeof setTimeout> | undefined;

export function setThemePreference(preference: ThemePreference) {
  if (!isThemePreference(preference)) return;
  try { window.localStorage.setItem(THEME_STORAGE_KEY, preference); } catch { /* Keep the choice for this page session. */ }
  if (typeof window.matchMedia === "function" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    clearTimeout(themeAnimationTimer);
    const root = document.documentElement;
    root.dataset.themeAnimating = "";
    themeAnimationTimer = setTimeout(() => { delete root.dataset.themeAnimating; }, 700);
  }
  applyPreference(preference);
}

export function getThemeSnapshot() {
  return `${preferenceFromRoot()}:${document.documentElement.dataset.theme === "dark" ? "dark" : "light"}`;
}

export function getServerThemeSnapshot() { return "light:light"; }

export function subscribeToTheme(onChange: () => void) {
  const media = typeof window.matchMedia === "function" ? window.matchMedia(SYSTEM_THEME_QUERY) : null;
  const onSystemChange = () => {
    if (preferenceFromRoot() === "system") applyPreference("system");
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    // Ignore sessionStorage events and respect removal/clear in another tab.
    try { if (event.storageArea && event.storageArea !== window.localStorage) return; } catch { return; }
    applyPreference(isThemePreference(event.newValue) ? event.newValue : "light");
  };
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  media?.addEventListener("change", onSystemChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
    media?.removeEventListener("change", onSystemChange);
  };
}
