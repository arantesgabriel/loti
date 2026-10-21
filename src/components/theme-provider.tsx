"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { getServerThemeSnapshot, getThemeSnapshot, setThemePreference, subscribeToTheme, type ResolvedTheme, type ThemePreference } from "@/lib/theme";

const ThemeContext = createContext<{ preference: ThemePreference; resolvedTheme: ResolvedTheme; setPreference: typeof setThemePreference } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const [preference, resolvedTheme] = snapshot.split(":") as [ThemePreference, ResolvedTheme];
  return <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference: setThemePreference }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("Theme context missing");
  return context;
}
