import { MAX_FINANCIAL_MINOR, formatCnyMinor, parseFinancialMinor } from "./financial-money";

export type ProductPriceBasis = "unit" | "total";
export type ProductPriceEntry = { basis: ProductPriceBasis; value: string };

/** Additional-order API and persisted amounts remain totals, including legacy records. */
export function additionalProductTotal(value: string, quantity: number, basis: ProductPriceBasis): number | null {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10_000) throw new Error("Informe uma quantidade entre 1 e 10.000.");
  const amount = parseFinancialMinor(value, "CNY");
  if (amount === null) return null;
  const total = BigInt(amount) * BigInt(basis === "unit" ? quantity : 1);
  if (total > BigInt(MAX_FINANCIAL_MINOR)) throw new Error("O total do produto em CNY excede o limite permitido.");
  return Number(total);
}

export function productPriceEntry(total: number | null | undefined, quantity: number): ProductPriceEntry {
  if (total == null) return { basis: "unit", value: "" };
  // Never round a historical total just to populate a unit-price input.
  const basis = total % quantity === 0 ? "unit" : "total";
  const amount = basis === "unit" ? total / quantity : total;
  return { basis, value: `${Math.floor(amount / 100)},${String(amount % 100).padStart(2, "0")}` };
}

export function productPriceSummary(total: number, quantity: number) {
  const unit = total % quantity === 0 ? `${quantity} × ${formatCnyMinor(total / quantity)} = ` : `${quantity} unidades · `;
  return `${unit}${formatCnyMinor(total)} no total`;
}
