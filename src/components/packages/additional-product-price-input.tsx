"use client";

import { additionalProductTotal, productPriceEntry, productPriceSummary, type ProductPriceEntry, type ProductPriceBasis } from "@/lib/domain/additional-product-pricing";

function entryForBasis(entry: ProductPriceEntry, quantity: number, basis: ProductPriceBasis): ProductPriceEntry {
  let total: number | null = null;
  try { total = additionalProductTotal(entry.value, quantity, entry.basis); }
  catch { /* Preserve the current validation behavior while the user edits an invalid value. */ }
  if (total === null) return { basis, value: "" };
  const converted = productPriceEntry(total, basis === "unit" ? quantity : 1);
  return { basis, value: basis === "unit" && converted.basis !== "unit" ? "" : converted.value };
}

export function AdditionalProductPriceModeField({ entry, quantity, onChange, disabled = false, label = "Informar preço por" }: {
  entry: ProductPriceEntry; quantity: number; onChange: (entry: ProductPriceEntry) => void; disabled?: boolean; label?: string;
}) {
  return <label className="additional-product-price-mode">{label}<select disabled={disabled} value={entry.basis} onChange={event => onChange(entryForBasis(entry, quantity, event.target.value as ProductPriceBasis))}><option value="unit">Unidade</option><option value="total">Total das unidades</option></select></label>;
}

export function AdditionalProductPriceValueField({ entry, quantity, onChange, disabled = false, required = false }: {
  entry: ProductPriceEntry; quantity: number; onChange: (entry: ProductPriceEntry) => void; disabled?: boolean; required?: boolean;
}) {
  let total: number | null = null;
  let error = "";
  try { total = additionalProductTotal(entry.value, quantity, entry.basis); }
  catch (cause) { error = cause instanceof Error ? cause.message : "Confira o preço do produto."; }
  return <div className="additional-product-price-value">
    <label><span>{entry.basis === "unit" ? "Preço do produto por unidade (CNY)" : "Preço do produto — total (CNY)"}</span><input required={required} inputMode="decimal" disabled={disabled} value={entry.value} onChange={event => onChange({ ...entry, value: event.target.value })} placeholder="0,00" aria-invalid={!!error}/></label>
    <small className="muted" aria-live="polite">{disabled ? "Produto sem cobrança." : error || (total === null ? "Informe o preço do produto." : productPriceSummary(total, quantity))}</small>
  </div>;
}

export function AdditionalProductPriceInput({ entry, quantity, onChange, disabled = false, required = false }: {
  entry: ProductPriceEntry; quantity: number; onChange: (entry: ProductPriceEntry) => void; disabled?: boolean; required?: boolean;
}) {
  return <>
    <AdditionalProductPriceModeField entry={entry} quantity={quantity} onChange={onChange} disabled={disabled} />
    <AdditionalProductPriceValueField entry={entry} quantity={quantity} onChange={onChange} disabled={disabled} required={required} />
  </>;
}
