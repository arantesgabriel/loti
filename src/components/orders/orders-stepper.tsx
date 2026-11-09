"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function OrdersStepper({ name, value, max, disabled = false, onChange }: {
  name: string; value: number; max: number; disabled?: boolean; onChange: (quantity: number) => void;
}) {
  const change = (quantity: number) => onChange(Math.max(0, Math.min(max, quantity)));
  return <div className="orders-stepper" role="group" aria-label={`Quantidade de ${name}`}>
    <Button type="button" variant="ghost" size="icon" disabled={disabled || value <= 0} aria-label={`Diminuir ${name}`} onClick={() => change(value - 1)}><Minus size={16} aria-hidden="true" /></Button>
    <input type="number" readOnly min={0} max={max} value={value} disabled={disabled || !max} aria-label={`Unidades de ${name} para selecionar`} onKeyDown={event => {
      if (!disabled && (event.key === "ArrowUp" || event.key === "ArrowDown")) { event.preventDefault(); change(value + (event.key === "ArrowUp" ? 1 : -1)); }
    }} />
    <Button type="button" variant="ghost" size="icon" disabled={disabled || value >= max} aria-label={`Aumentar ${name}`} onClick={() => change(value + 1)}><Plus size={16} aria-hidden="true" /></Button>
  </div>;
}
