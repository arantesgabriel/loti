import { describe, expect, it } from "vitest";
import { presentBalanceTraceability, type TraceContext, type TraceState } from "@/lib/domain/hubbuy-balance-traceability";

const context: TraceContext = { products: [{ refundId: "refund", costItemId: "ram", trackingId: "tracking", name: "RAM 5200 MHz", variant: "Histórica" }], adjustments: [], costs: [], operations: [], destinations: [] };
const credit = (id: string, sequence: number, sourceType = "refund_received", sourceId = "refund", reversalOfEntryId: string | null = null) => ({ id, sequence, direction: "credit", sourceType, sourceId, reversalOfEntryId });
const debit = (id: string, sequence: number, sourceType = "purchase_payment", reversalOfEntryId: string | null = null) => ({ id, sequence, direction: "debit", sourceType, sourceId: id, reversalOfEntryId });
const share = (id: string, creditEntryId: string, amountCnyMinor: number, historicalBrlCents = amountCnyMinor) => ({ id, creditEntryId, personId: "alice", amountCnyMinor, historicalBrlCents });
const use = (creditShareId: string, debitEntryId: string, amountCnyMinor: number, historicalBrlCents = amountCnyMinor) => ({ creditShareId, debitEntryId, amountCnyMinor, historicalBrlCents, paymentAllocationId: null });
const rights = (cny: number, brl = cny) => [{ personId: "alice", availableCnyMinor: cny, availableHistoricalBrlCents: brl }];

describe("balance traceability", () => {
  it("retains an exhausted source and zero-balance owner with historical receipt and destination", () => {
    const state: TraceState = { entries: [credit("c", 0), debit("d", 1)], shares: [share("s", "c", 8000, 6000)], consumptions: [{ ...use("s", "d", 8000, 6000), paymentAllocationId: "allocation" }], rights: rights(0) };
    const result = presentBalanceTraceability(state, { ...context, destinations: [{ allocationId: "allocation", label: "Cordas", beneficiaryId: "bob", beneficiaryName: "Bob", orderReference: "ORDER" }] });
    expect(result[0].origins).toMatchObject([{ label: "RAM 5200 MHz", creditedCnyMinor: 8000, purchaseConsumedCnyMinor: 8000, adjustmentDeltaCnyMinor: 0, availableCnyMinor: 0, state: "exhausted", receipts: [{ uses: [{ amountCnyMinor: 8000, destinations: [{ label: "Cordas", beneficiaryId: "bob", amountCnyMinor: 8000 }] }] }] }]);
  });

  it("distinguishes receipt reversal from purchase consumption and never multiplies original cost", () => {
    const state: TraceState = { entries: [credit("old", 0), debit("reverse", 1, "reversal", "old"), credit("new", 2)], shares: [share("a", "old", 478), share("b", "new", 492)], consumptions: [use("a", "reverse", 478)], rights: rights(492) };
    const cost = { scope: "item" as const, principalBrlCents: 500, feeBrlCents: 5, totalBrlCents: 505, newMoneyBrlCents: 505, previousBalanceCnyMinor: 0, previousBalanceHistoricalBrlCents: 0 };
    const origin = presentBalanceTraceability(state, { ...context, costs: [{ costItemId: "ram", personId: "alice", cost }] })[0].origins[0];
    expect(origin).toMatchObject({ paidCost: cost, creditedCnyMinor: 970, purchaseConsumedCnyMinor: 0, adjustmentDeltaCnyMinor: -478, availableCnyMinor: 492, validRefundCnyMinor: 492 });
    expect(origin.receipts).toHaveLength(2);
  });

  it("keeps mixed restorations separate and connects both directions without assigning suborigin remainders", () => {
    const state: TraceState = { entries: [credit("ram", 0), credit("bonus", 1, "opening_balance", "initial"), debit("old-order", 2), credit("restore", 3, "reversal", "old-order", "old-order"), debit("new-order", 4)], shares: [share("s1", "ram", 60), share("s2", "bonus", 40), share("s3", "restore", 100)], consumptions: [use("s1", "old-order", 60), use("s2", "old-order", 40), use("s3", "new-order", 20)], rights: rights(80) };
    const origins = presentBalanceTraceability(state, context)[0].origins;
    expect(origins.map(row => row.availableCnyMinor)).toEqual([0, 0, 80]);
    expect(origins[0].receipts[0].uses[0].restored).toEqual([{ entryId: "restore", label: "Saldo restaurado por correção", personCnyMinor: 100 }]);
    expect(origins[2].receipts[0].restoredFrom.map(row => row.amountCnyMinor)).toEqual([60, 40]);
    expect(origins[2].paidCost).toBeNull();
  });

  it("preserves zero BRL bonuses, unknown references and identities of same-named products", () => {
    const state: TraceState = { entries: [credit("c", 0), credit("c2", 1, "refund_received", "refund2"), credit("bonus", 2, "manual_adjustment", "bonus")], shares: [share("a", "c", 1, 0), share("b", "c2", 1, 0), share("z", "bonus", 114, 0)], consumptions: [], rights: rights(116, 0) };
    const result = presentBalanceTraceability(state, { ...context, products: [...context.products, { ...context.products[0], refundId: "refund2", costItemId: "another-ram" }], adjustments: [{ entryId: "bonus", kind: "promotional_bonus", reason: "Roleta" }] });
    expect(result[0].origins).toHaveLength(3);
    expect(result[0].origins[2]).toMatchObject({ kind: "promotional_bonus", availableCnyMinor: 114, availableHistoricalBrlCents: 0 });
    expect(presentBalanceTraceability(state, { ...context, products: [] })[0].origins[0].kind).toBe("unknown");
  });

  it("rejects a projection that fails to close against existing rights", () => {
    expect(() => presentBalanceTraceability({ entries: [credit("c", 0)], shares: [share("s", "c", 100)], consumptions: [], rights: rights(99) }, context)).toThrow("não fecha");
  });
});
