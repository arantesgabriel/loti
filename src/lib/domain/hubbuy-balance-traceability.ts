import { DomainError } from "./errors";
import { MAX_FINANCIAL_MINOR } from "./financial-money";
import { describeOrigin, type ManualOrigin, type RefundProductOrigin, type RightOrigin } from "./hubbuy-rights-presentation";

export type PaidOriginCost = {
  scope: "item";
  principalBrlCents: number;
  feeBrlCents: number;
  totalBrlCents: number;
  newMoneyBrlCents: number | null;
  previousBalanceCnyMinor: number | null;
  previousBalanceHistoricalBrlCents: number | null;
};
export type TraceDestination = { allocationId: string; label: string; beneficiaryId: string; beneficiaryName: string; orderReference: string | null };
export type TraceOperation = { entryId: string; recordedAt: string | null; occurredAt: string | null; reason: string | null };
export type TraceUse = {
  entryId: string; sequence: number; kind: string; amountCnyMinor: number; historicalBrlCents: number;
  recordedAt: string | null; occurredAt: string | null; reason: string | null;
  destinations: (TraceDestination & { amountCnyMinor: number; historicalBrlCents: number })[];
  restored: { entryId: string; label: string; personCnyMinor: number }[];
};
export type TraceReceipt = {
  entryId: string; shareId: string; sequence: number; sourceReference: string;
  creditedCnyMinor: number; historicalBrlCents: number; receiptReversedCnyMinor: number;
  recordedAt: string | null; occurredAt: string | null; reason: string | null;
  uses: TraceUse[];
  restoredFrom: { entryId: string; sourceLabel: string; amountCnyMinor: number }[];
};
export type BalanceOriginHistory = Omit<RightOrigin, "availableCnyMinor" | "availableHistoricalBrlCents"> & {
  purchaseName: string | null;
  paidCost: PaidOriginCost | null;
  creditedCnyMinor: number; purchaseConsumedCnyMinor: number; adjustmentDeltaCnyMinor: number;
  availableCnyMinor: number; availableHistoricalBrlCents: number; validRefundCnyMinor: number | null;
  state: "available" | "partially_used" | "exhausted" | "adjusted";
  receipts: TraceReceipt[];
};
export type PersonBalanceHistory = { personId: string; availableCnyMinor: number; availableHistoricalBrlCents: number; origins: BalanceOriginHistory[] };
type Entry = { id: string; sequence: number; direction: string; sourceType: string; sourceId: string; reversalOfEntryId: string | null };
type Share = { id: string; creditEntryId: string; personId: string; amountCnyMinor: number; historicalBrlCents: number };
type Consumption = { debitEntryId: string; creditShareId: string; amountCnyMinor: number; historicalBrlCents: number; paymentAllocationId: string | null };
export type TraceState = { entries: Entry[]; shares: Share[]; consumptions: Consumption[]; rights: { personId: string; availableCnyMinor: number; availableHistoricalBrlCents: number }[] };
export type TraceContext = {
  products: RefundProductOrigin[]; adjustments: ManualOrigin[]; operations: TraceOperation[];
  destinations: TraceDestination[]; costs: { costItemId: string; personId: string; cost: PaidOriginCost }[];
};

function minor(value: bigint) {
  if (value < 0n || value > BigInt(MAX_FINANCIAL_MINOR)) throw new DomainError("O histórico do saldo não fecha com os lotes registrados.", 409, "BALANCE_RECONCILIATION_REQUIRED");
  return Number(value);
}
function add(a: number, b: number) { return minor(BigInt(a) + BigInt(b)); }

/** Read-only projection of actual persisted lots. Restorations never reassign old lots. */
export function presentBalanceTraceability(state: TraceState, context: TraceContext): PersonBalanceHistory[] {
  const entries = new Map(state.entries.map(row => [row.id, row]));
  const shares = new Map(state.shares.map(row => [row.id, row]));
  const products = new Map(context.products.map(row => [row.refundId, row]));
  const operations = new Map(context.operations.map(row => [row.entryId, row]));
  const destinations = new Map(context.destinations.map(row => [row.allocationId, row]));
  const costs = new Map(context.costs.map(row => [`${row.costItemId}:${row.personId}`, row.cost]));
  const byShare = new Map<string, Consumption[]>(), byDebit = new Map<string, Consumption[]>();
  const byCredit = new Map<string, Share[]>(), restorations = new Map<string, Entry[]>();
  for (const share of state.shares) byCredit.set(share.creditEntryId, [...(byCredit.get(share.creditEntryId) ?? []), share]);
  for (const use of state.consumptions) {
    byShare.set(use.creditShareId, [...(byShare.get(use.creditShareId) ?? []), use]);
    byDebit.set(use.debitEntryId, [...(byDebit.get(use.debitEntryId) ?? []), use]);
  }
  for (const entry of state.entries) if (entry.direction === "credit" && entry.reversalOfEntryId && entries.get(entry.reversalOfEntryId)?.direction === "debit") restorations.set(entry.reversalOfEntryId, [...(restorations.get(entry.reversalOfEntryId) ?? []), entry]);
  const people = new Map<string, Map<string, BalanceOriginHistory>>();
  for (const share of state.shares) {
    const entry = entries.get(share.creditEntryId);
    if (!entry || entry.direction !== "credit") throw new DomainError("Origem do lote indisponível.", 409);
    const descriptor = describeOrigin(entry, entry.id, products, context.adjustments);
    const groups = people.get(share.personId) ?? new Map<string, BalanceOriginHistory>();
    const group = groups.get(descriptor.id) ?? { ...descriptor, purchaseName: descriptor.costItemId ? products.get(entry.sourceId)?.purchaseName ?? null : null, paidCost: descriptor.costItemId ? costs.get(`${descriptor.costItemId}:${share.personId}`) ?? null : null, creditedCnyMinor: 0, purchaseConsumedCnyMinor: 0, adjustmentDeltaCnyMinor: 0, availableCnyMinor: 0, availableHistoricalBrlCents: 0, validRefundCnyMinor: descriptor.kind === "refund_product" ? 0 : null, state: "available" as const, receipts: [] };
    const useGroups = new Map<string, TraceUse>();
    let used = 0n, adjusted = 0n, usedBrl = 0n, receiptReversed = 0n;
    for (const use of byShare.get(share.id) ?? []) {
      const debit = entries.get(use.debitEntryId);
      if (!debit || debit.direction !== "debit") throw new DomainError("Destino do consumo indisponível.", 409);
      if (debit.sourceType === "purchase_payment") used += BigInt(use.amountCnyMinor); else adjusted += BigInt(use.amountCnyMinor);
      if (debit.reversalOfEntryId === entry.id) receiptReversed += BigInt(use.amountCnyMinor);
      usedBrl += BigInt(use.historicalBrlCents);
      const operation = operations.get(debit.id);
      const row = useGroups.get(debit.id) ?? { entryId: debit.id, sequence: debit.sequence, kind: debit.sourceType, amountCnyMinor: 0, historicalBrlCents: 0, recordedAt: operation?.recordedAt ?? null, occurredAt: operation?.occurredAt ?? null, reason: operation?.reason ?? null, destinations: [], restored: (restorations.get(debit.id) ?? []).flatMap(restored => {
        const amount = (byCredit.get(restored.id) ?? []).filter(row => row.personId === share.personId).reduce((sum, row) => add(sum, row.amountCnyMinor), 0);
        return amount ? [{ entryId: restored.id, label: describeOrigin(restored, restored.id, products, context.adjustments).label, personCnyMinor: amount }] : [];
      }) };
      row.amountCnyMinor = add(row.amountCnyMinor, use.amountCnyMinor);
      row.historicalBrlCents = add(row.historicalBrlCents, use.historicalBrlCents);
      const target = use.paymentAllocationId ? destinations.get(use.paymentAllocationId) : null;
      if (target) {
        const existing = row.destinations.find(row => row.allocationId === target.allocationId);
        if (existing) { existing.amountCnyMinor = add(existing.amountCnyMinor, use.amountCnyMinor); existing.historicalBrlCents = add(existing.historicalBrlCents, use.historicalBrlCents); }
        else row.destinations.push({ ...target, amountCnyMinor: use.amountCnyMinor, historicalBrlCents: use.historicalBrlCents });
      }
      useGroups.set(debit.id, row);
    }
    const operation = operations.get(entry.id);
    const restoredFrom = entry.reversalOfEntryId ? (byDebit.get(entry.reversalOfEntryId) ?? []).flatMap(use => {
      const original = shares.get(use.creditShareId);
      if (!original || original.personId !== share.personId) return [];
      return [{ entryId: original.creditEntryId, sourceLabel: describeOrigin(entries.get(original.creditEntryId), original.creditEntryId, products, context.adjustments).label, amountCnyMinor: use.amountCnyMinor }];
    }) : [];
    group.receipts.push({ entryId: entry.id, shareId: share.id, sequence: entry.sequence, sourceReference: descriptor.kind === "refund_product" ? entry.sourceId : entry.id, creditedCnyMinor: share.amountCnyMinor, historicalBrlCents: share.historicalBrlCents, receiptReversedCnyMinor: minor(receiptReversed), recordedAt: operation?.recordedAt ?? null, occurredAt: operation?.occurredAt ?? null, reason: operation?.reason ?? null, uses: [...useGroups.values()].sort((a, b) => a.sequence - b.sequence), restoredFrom });
    group.creditedCnyMinor = add(group.creditedCnyMinor, share.amountCnyMinor);
    group.purchaseConsumedCnyMinor = add(group.purchaseConsumedCnyMinor, minor(used));
    const adjustmentAmount = add(-group.adjustmentDeltaCnyMinor, minor(adjusted));
    group.adjustmentDeltaCnyMinor = adjustmentAmount ? -adjustmentAmount : 0;
    group.availableCnyMinor = add(group.availableCnyMinor, minor(BigInt(share.amountCnyMinor) - used - adjusted));
    group.availableHistoricalBrlCents = add(group.availableHistoricalBrlCents, minor(BigInt(share.historicalBrlCents) - usedBrl));
    if (group.validRefundCnyMinor !== null) group.validRefundCnyMinor = add(group.validRefundCnyMinor, minor(BigInt(share.amountCnyMinor) - receiptReversed));
    group.state = group.adjustmentDeltaCnyMinor ? "adjusted" : !group.availableCnyMinor ? "exhausted" : group.purchaseConsumedCnyMinor ? "partially_used" : "available";
    groups.set(descriptor.id, group); people.set(share.personId, groups);
  }
  const result = state.rights.map(right => {
    const origins = [...(people.get(right.personId)?.values() ?? [])].sort((a, b) => Math.min(...a.receipts.map(row => row.sequence)) - Math.min(...b.receipts.map(row => row.sequence)) || a.id.localeCompare(b.id));
    if (origins.reduce((s, o) => s + BigInt(o.availableCnyMinor), 0n) !== BigInt(right.availableCnyMinor) || origins.reduce((s, o) => s + BigInt(o.availableHistoricalBrlCents), 0n) !== BigInt(right.availableHistoricalBrlCents)) throw new DomainError("O histórico não fecha com o disponível da pessoa.", 409, "BALANCE_RECONCILIATION_REQUIRED");
    people.delete(right.personId);
    return { ...right, origins };
  });
  if (people.size) throw new DomainError("Histórico sem titular correspondente.", 409);
  return result;
}
