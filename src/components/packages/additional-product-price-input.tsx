"use client";

import { additionalProductTotal, productPriceEntry, productPriceSummary, type ProductPriceEntry, type ProductPriceBasis } from "@/lib/domain/additional-product-pricing";

export function AdditionalProductPriceInput({ entry, quantity, onChange, disabled = false, required = false }: {
  entry: ProductPriceEntry; quantity: number; onChange: (entry: ProductPriceEntry) => void; disabled?: boolean; required?: boolean;
}) {
  let total: number | null = null;
  let error = "";
  try { total = additionalProductTotal(entry.value, quantity, entry.basis); }
  catch (cause) { error = cause instanceof Error ? cause.message : "Confira o preço do produto."; }
  function changeBasis(basis: ProductPriceBasis) {
    if (total === null) { onChange({ basis, value: "" }); return; }
    const converted = productPriceEntry(total, basis === "unit" ? quantity : 1);
    onChange({ basis, value: basis === "unit" && converted.basis !== "unit" ? "" : converted.value });
  }
  return <>
    <label>Informar preço por<select disabled={disabled} value={entry.basis} onChange={event => changeBasis(event.target.value as ProductPriceBasis)}><option value="unit">Unidade</option><option value="total">Total das unidades</option></select></label>
    <label>{entry.basis === "unit" ? "Preço do produto por unidade (CNY)" : "Preço do produto — total (CNY)"}<input required={required} inputMode="decimal" disabled={disabled} value={entry.value} onChange={event => onChange({ ...entry, value: event.target.value })} placeholder="0,00" aria-invalid={!!error}/></label>
    <p className="muted" aria-live="polite">{disabled ? "Produto sem cobrança." : error || (total === null ? "Informe o preço para conferir o total do produto." : productPriceSummary(total, quantity))}{!disabled && entry.basis === "total" && " O valor informado cobre todas as unidades."}</p>
  </>;
}
