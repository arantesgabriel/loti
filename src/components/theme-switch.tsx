"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";
import "./theme-switch.css";

/** Shared verbatim with the authenticated desktop and mobile shell. */
export function ThemeSwitch({ className = "" }: { className?: string }) {
  const { resolvedTheme, setPreference } = useTheme();
  return <button className={`sidebar-theme ${className}`} type="button" role="switch" aria-label="Tema escuro" aria-checked={resolvedTheme === "dark"} title={resolvedTheme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"} onClick={() => setPreference(resolvedTheme === "dark" ? "light" : "dark")}>
    <Sun className="theme-sun" size={22} aria-hidden="true" />
    <Moon className="theme-moon" size={21} aria-hidden="true" />
    <span className="theme-track" aria-hidden="true"><span className="theme-thumb" /></span>
  </button>;
}
