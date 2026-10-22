import { DomainError } from "./errors";
import { MAX_FINANCIAL_MINOR } from "./financial-money";

export type RightOrigin = {
  id: string;
  kind: "refund_product" | "opening_balance" | "reconciliation" | "restored_balance" | "promotional_bonus" | "manual_credit" | "manual_reversal" | "unknown";
  label: string;
  variant: string | null;
  trackingId: string | null;
  costItemId: string | null;
  availableCnyMinor: number;
  availableHistoricalBrlCents: number;
};

export type IndividualRight = {
  personId: string;
  availableCnyMinor: number;
  availableHistoricalBrlCents: number;
  origins: RightOrigin[];
};

export type AvailableCreditShare = {
  id: string;
  creditEntryId: string;
  personId: string;
  availableCnyMinor: number;
  availableHistoricalBrlCents: number;
};

export type RefundProductOrigin = {
  refundId: string;
  costItemId: string;
  trackingId: string;
  name: string;
  variant: string | null;
  purchaseName?: string;
};

type OriginEntry = { id: string; sequence: number; sourceType: string; sourceId: string };
type RightTotal = Omit<IndividualRight, "origins">;

function checkedMinor(value: bigint): number {
  if (value < 0n || value > BigInt(MAX_FINANCIAL_MINOR)) {
    throw new DomainError("A composição dos direitos da conta está inconsistente.", 409, "BALANCE_RECONCILIATION_REQUIRED");
  }
  return Number(value);
}

export type ManualOrigin = { entryId: string; kind: string; reason: string | null };
export function describeOrigin(entry: OriginEntry | undefined, creditEntryId: string, products: Map<string, RefundProductOrigin>, adjustments: ManualOrigin[]): Omit<RightOrigin, "availableCnyMinor" | "availableHistoricalBrlCents"> {
  const manual = adjustments.find(row => row.entryId === creditEntryId);
  if (manual) return { id: `entry:${creditEntryId}`, kind: manual.kind === "promotional_bonus" ? "promotional_bonus" : manual.kind === "reversal" ? "manual_reversal" : "manual_credit", label: `${manual.kind === "promotional_bonus" ? "Bônus promocional" : manual.kind === "reversal" ? "Saldo restaurado por anulação" : "Crédito manual"}${manual.reason ? ` · ${manual.reason}` : ""}`, variant: null, trackingId: null, costItemId: null };
  const product = entry?.sourceType === "refund_received" ? products.get(entry.sourceId) : undefined;
  if (product) return { id: `refund-product:${product.costItemId}`, kind: "refund_product", label: product.name, variant: product.variant, trackingId: product.trackingId, costItemId: product.costItemId };
  const kind = entry?.sourceType === "opening_balance" ? "opening_balance"
    : entry?.sourceType === "manual_adjustment" ? "reconciliation"
    : entry?.sourceType === "reversal" ? "restored_balance" : "unknown";
  const label = kind === "opening_balance" ? "Saldo inicial conciliado"
    : kind === "reconciliation" ? "Crédito de conciliação"
    : kind === "restored_balance" ? "Saldo restaurado por correção" : "Origem não identificada";
  return { id: `entry:${creditEntryId}`, kind, label, variant: null, trackingId: null, costItemId: null };
}

/** Presentation of persisted remaining lots; never replays FIFO or allocates a new exchange rate. */
export function presentIndividualRights(rights: RightTotal[], shares: AvailableCreditShare[], entries: OriginEntry[], products: RefundProductOrigin[], adjustments: ManualOrigin[] = []): IndividualRight[] {
  const entriesById = new Map(entries.map(entry => [entry.id, entry]));
  const productsByRefund = new Map(products.map(product => [product.refundId, product]));
  const byPerson = new Map<string, Map<string, { origin: RightOrigin; sequence: number }>>();
  for (const share of shares) {
    if (share.availableCnyMinor === 0 && share.availableHistoricalBrlCents === 0) continue;
    const entry = entriesById.get(share.creditEntryId);
    const descriptor = describeOrigin(entry, share.creditEntryId, productsByRefund, adjustments);
    const origins = byPerson.get(share.personId) ?? new Map<string, { origin: RightOrigin; sequence: number }>();
    const current = origins.get(descriptor.id);
    const sequence = Math.min(current?.sequence ?? Number.MAX_SAFE_INTEGER, entry?.sequence ?? Number.MAX_SAFE_INTEGER);
    const availableCnyMinor = checkedMinor(BigInt(current?.origin.availableCnyMinor ?? 0) + BigInt(share.availableCnyMinor));
    const availableHistoricalBrlCents = checkedMinor(BigInt(current?.origin.availableHistoricalBrlCents ?? 0) + BigInt(share.availableHistoricalBrlCents));
    origins.set(descriptor.id, { sequence, origin: { ...descriptor, availableCnyMinor, availableHistoricalBrlCents } });
    byPerson.set(share.personId, origins);
  }
  const result = rights.map(right => {
    const origins = [...(byPerson.get(right.personId)?.values() ?? [])]
      .sort((a, b) => a.sequence - b.sequence || a.origin.id.localeCompare(b.origin.id)).map(row => row.origin);
    const cny = origins.reduce((sum, origin) => sum + BigInt(origin.availableCnyMinor), 0n);
    const brl = origins.reduce((sum, origin) => sum + BigInt(origin.availableHistoricalBrlCents), 0n);
    if (cny !== BigInt(right.availableCnyMinor) || brl !== BigInt(right.availableHistoricalBrlCents)) {
      throw new DomainError("A composição dos direitos não fecha com o saldo da pessoa.", 409, "BALANCE_RECONCILIATION_REQUIRED");
    }
    byPerson.delete(right.personId);
    return { ...right, origins };
  });
  if (byPerson.size) throw new DomainError("A composição contém um titular sem saldo correspondente.", 409, "BALANCE_RECONCILIATION_REQUIRED");
  return result;
}
