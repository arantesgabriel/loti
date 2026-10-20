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
export function parsePercentageBps(value: string): number | null {
  const clean = value.trim().replace(/%$/, "").replace(",", ".");
  if (!clean) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(clean)) throw new Error("Informe um percentual com até duas casas decimais.");
  const [whole, fraction = ""] = clean.split(".");
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(bps) || bps > 10_000) throw new Error("O percentual deve estar entre 0% e 100%.");
  return bps;
}
export const percentageBpsInput = (bps: number | null | undefined) => bps == null ? "" : moneyInput(bps);
export const formatMoney = (cents: number | null) => cents === null ? "Preço pendente" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
export const moneyInput = (cents: number | null) => cents === null ? "" : (cents / 100).toFixed(2).replace(".", ",");
export type PricedItem = {
  personId?: string;
  participants?: { personId: string; shareCents: number | null }[];
  quantity: number;
  unitPriceCents: number | null;
  cartStatus: "pending" | "added";
};
export function subtotal(item: Pick<PricedItem, "quantity" | "unitPriceCents">) { return item.unitPriceCents === null ? null : item.quantity * item.unitPriceCents; }
export function purchaseSummary(items: PricedItem[]) {
  const units = items.reduce((n, i) => n + i.quantity, 0);
  const added = items.filter(i => i.cartStatus === "added").reduce((n, i) => n + i.quantity, 0);
  return { totalCents: items.reduce((n, i) => n + (subtotal(i) ?? 0), 0), units, added, pending: units - added, progress: units ? Math.round(added / units * 100) : 0,
    people: new Set(items.flatMap(i => i.participants?.map(p => p.personId) ?? (i.personId ? [i.personId] : []))).size, noPriceRows: items.filter(i => i.unitPriceCents === null).length, noPriceUnits: items.filter(i => i.unitPriceCents === null).reduce((n, i) => n + i.quantity, 0) };
}
export function personSummary(items: PricedItem[], personId: string) {
  const owned = items.filter(item => item.participants?.some(participant => participant.personId === personId) ?? item.personId === personId);
  const personal = owned.filter(item => (item.participants?.length ?? 1) === 1);
  const shared = owned.filter(item => (item.participants?.length ?? 1) > 1);
  const units = owned.reduce((sum, item) => sum + item.quantity, 0);
  const added = owned.filter(item => item.cartStatus === "added").reduce((sum, item) => sum + item.quantity, 0);
  const noPrice = owned.filter(item => item.unitPriceCents === null);
  const totalCents = owned.reduce((sum, item) => {
    const participant = item.participants?.find(person => person.personId === personId);
    return sum + (participant ? participant.shareCents ?? 0 : subtotal(item) ?? 0);
  }, 0);
  return {
    totalCents, units, added, pending: units - added, progress: units ? Math.round(added / units * 100) : 0,
    people: owned.length ? 1 : 0, noPriceRows: noPrice.length, noPriceUnits: noPrice.reduce((sum, item) => sum + item.quantity, 0),
    personalUnits: personal.reduce((sum, item) => sum + item.quantity, 0), sharedItems: shared.length,
    hasPricedShare: owned.some(item => item.unitPriceCents !== null),
  };
}
