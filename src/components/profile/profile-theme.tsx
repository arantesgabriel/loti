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
  return <section className="profile-section" aria-labelledby="appearance-title">
    <div className="profile-section-heading"><h2 id="appearance-title">Aparência</h2><p className="muted" id="appearance-description">Escolha o tema neste navegador ou acompanhe o sistema.</p></div>
    <fieldset className="theme-options" aria-describedby="appearance-description">
      <legend className="sr-only">Tema</legend>
      {options.map(({ value, label, Icon }) => <label className="theme-option" key={value}>
        <input type="radio" name="theme" value={value} checked={preference === value} onChange={() => setPreference(value)}/>
        <span><Icon size={18} aria-hidden="true"/>{label}</span>
      </label>)}
    </fieldset>
  </section>;
}
