export function parseMoney(value: string): number | null {
  const clean = value.trim().replace(/^R\$\s*/, "");
  if (!clean) return null;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error("Informe um preço válido, com até duas casas decimais.");
  const [whole, decimal = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > 100_000_000) throw new Error("Preço acima do limite permitido.");
  return cents;
}
export const formatMoney = (cents: number | null) => cents === null ? "Preço pendente" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
export const moneyInput = (cents: number | null) => cents === null ? "" : (cents / 100).toFixed(2).replace(".", ",");
export type PricedItem = { personId: string; quantity: number; unitPriceCents: number | null; cartStatus: "pending" | "added" };
export function subtotal(item: Pick<PricedItem, "quantity" | "unitPriceCents">) { return item.unitPriceCents === null ? null : item.quantity * item.unitPriceCents; }
export function purchaseSummary(items: PricedItem[]) {
  const units = items.reduce((n, i) => n + i.quantity, 0);
  const added = items.filter(i => i.cartStatus === "added").reduce((n, i) => n + i.quantity, 0);
  return { totalCents: items.reduce((n, i) => n + (subtotal(i) ?? 0), 0), units, added, pending: units - added, progress: units ? Math.round(added / units * 100) : 0,
    people: new Set(items.map(i => i.personId)).size, noPriceRows: items.filter(i => i.unitPriceCents === null).length, noPriceUnits: items.filter(i => i.unitPriceCents === null).reduce((n, i) => n + i.quantity, 0) };
}
export const personSummary = (items: PricedItem[], personId: string) => purchaseSummary(items.filter(i => i.personId === personId));
