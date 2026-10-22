"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

const options = [
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Escuro", Icon: Moon },
  { value: "system", label: "Sistema", Icon: Monitor },
] as const;

export function ProfileTheme() {
  const { preference, setPreference } = useTheme();
  return <div className="settings-theme-content">
    <fieldset className="theme-options settings-theme-options" aria-label="Tema da interface">
      <legend className="sr-only">Tema</legend>
      {options.map(({ value, label, Icon }) => <label className="theme-option" key={value}>
        <input type="radio" name="theme" value={value} checked={preference === value} onChange={() => setPreference(value)}/>
        <span><Icon size={18} aria-hidden="true"/>{label}</span>
      </label>)}
    </fieldset>
    <p className="muted settings-theme-note">A preferência será aplicada neste navegador.</p>
  </div>;
}
