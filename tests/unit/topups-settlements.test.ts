import { describe, expect, it } from "vitest";
import { calculateTopup, previewTopupFee, principalFromTopupTotal } from "@/lib/domain/hubbuy-topup-calculations";
import { compensateSettlementPositions, convertSettlementPositions, directSettlementClaims, settlementPositionsFromClaims, type SettlementPosition } from "@/lib/domain/package-settlement-calculations";
import { allocateExactMinor, previewFifoConsumption } from "@/lib/domain/hubbuy-balance-calculations";
import { MAX_FINANCIAL_MINOR } from "@/lib/domain/financial-money";

const pair = { fromCnyMinor: 39830, toBrlCents: 34893 };
const vector = (values: number[]): SettlementPosition[] => values.map((amountMinor, order) => ({ personId: "ABCD"[order], order, amountMinor }));

describe("topup receipt contract", () => {
  it("recovers the exact principal and excludes the fee from the captured pair", () => {
    expect(principalFromTopupTotal(35242, 100)).toEqual({ principalBrlCents: 34893, feeBrlCents: 349, totalBrlCents: 35242 });
    expect(calculateTopup({ cnyMinor: 39830, principalBrlCents: 34893, feeBrlCents: 349, fee: { mode: "percentage", bps: 100 }, funders: [{ personId: "A", cnyMinor: 39830, principalBrlCents: 34893, feeBrlCents: 349 }] })).toMatchObject({ capturedPair: pair, totalBrlCents: 35242 });
  });

  it("rejects skipped integer totals instead of silently dividing", () => {
    expect(() => principalFromTopupTotal(50, 100)).toThrow(/discriminados/);
    expect(principalFromTopupTotal(51, 100)).toMatchObject({ principalBrlCents: 50, feeBrlCents: 1 });
    expect(principalFromTopupTotal(0, 0)).toMatchObject({ principalBrlCents: 0 });
    expect(() => principalFromTopupTotal(0, 10001)).toThrow();
  });

  it("supports a separate fee funder and rejects missing/duplicate financing", () => {
    const input = { cnyMinor: 100, principalBrlCents: 90, feeBrlCents: 2, fee: { mode: "effective" as const, reason: "Taxa do comprovante sintético" }, funders: [{ personId: "A", cnyMinor: 100, principalBrlCents: 90, feeBrlCents: 0 }, { personId: "B", cnyMinor: 0, principalBrlCents: 0, feeBrlCents: 2 }] };
    expect(calculateTopup(input).funders).toHaveLength(2);
    expect(() => calculateTopup({ ...input, funders: [input.funders[0]] })).toThrow(/fecham/);
    expect(() => calculateTopup({ ...input, funders: [...input.funders, input.funders[0]] })).toThrow(/duplicados/);
    expect(() => calculateTopup({ ...input, fee: { mode: "effective", reason: " " } })).toThrow(/motivo/);
    expect(() => calculateTopup({ ...input, fee: { mode: "percentage", bps: 100 } })).toThrow(/diverge/);
  });

  it("assigns a fee cumulatively across destinations and absorbs its final remainder", () => {
    const base = { creditedCnyMinor: 3, originalFeeBrlCents: 2, consumeCnyMinor: 1 };
    expect(previewTopupFee({ ...base, consumedBeforeCnyMinor: 0, assignedBeforeBrlCents: 0 }).assignedBrlCents).toBe(1);
    expect(previewTopupFee({ ...base, consumedBeforeCnyMinor: 1, assignedBeforeBrlCents: 1 }).assignedBrlCents).toBe(0);
    expect(previewTopupFee({ ...base, consumedBeforeCnyMinor: 2, assignedBeforeBrlCents: 1 }).assignedBrlCents).toBe(1);
    expect(() => previewTopupFee({ ...base, consumedBeforeCnyMinor: 2, assignedBeforeBrlCents: 2, explicitBrlCents: 1 })).toThrow(/excede/);
  });

  it("respects explicit prior assignment without assigning the fee twice", () => {
    expect(previewTopupFee({ creditedCnyMinor: 100, originalFeeBrlCents: 20, consumedBeforeCnyMinor: 10, consumeCnyMinor: 10, assignedBeforeBrlCents: 15 })).toEqual({ suggestedBrlCents: 0, assignedBrlCents: 0, remainingBrlCents: 5 });
    expect(() => previewTopupFee({ creditedCnyMinor: 0, originalFeeBrlCents: 0, consumedBeforeCnyMinor: 0, consumeCnyMinor: 0, assignedBeforeBrlCents: 0 })).toThrow();
  });

  it("inverts every generated receipt across fee percentages and integer boundaries", () => {
    for (const bps of [0, 1, 100, 500, 10000]) for (let principal = 0; principal < 150; principal++) {
      const fee = Number((BigInt(principal) * BigInt(bps) * 2n + 10000n) / 20000n);
      expect(principalFromTopupTotal(principal + fee, bps).principalBrlCents).toBe(principal);
    }
    expect(principalFromTopupTotal(MAX_FINANCIAL_MINOR, 0).principalBrlCents).toBe(MAX_FINANCIAL_MINOR);
  });
});

describe("signed settlement contract", () => {
  it("retains direct source pairs until compensation is explicitly selected", () => {
    const claims = directSettlementClaims([
      { id: "one", sourceId: "old-a", funderId: "A", beneficiaryId: "B", amountMinor: 100 },
      { id: "two", sourceId: "old-b", funderId: "B", beneficiaryId: "A", amountMinor: 40 },
      { id: "own", sourceId: "topup", funderId: "A", beneficiaryId: "A", amountMinor: 10 },
    ]);
    expect(claims).toHaveLength(2);
    expect(claims[0]).toMatchObject({ sourceId: "old-a", debtorId: "B", creditorId: "A", amountMinor: 100 });
    expect(claims[1]).toMatchObject({ sourceId: "old-b", debtorId: "A", creditorId: "B", amountMinor: 40 });
    expect(settlementPositionsFromClaims([{ personId: "A", order: 0 }, { personId: "B", order: 1 }, { personId: "C", order: 2 }], claims).map(row => row.amountMinor)).toEqual([-60, 60, 0]);
    expect(() => settlementPositionsFromClaims([{ personId: "A", order: 0 }], claims)).toThrow();
    expect(() => directSettlementClaims([{ id: "one", sourceId: "s", funderId: "A", beneficiaryId: "B", amountMinor: -1 }])).toThrow();
  });
  it("preserves the reference scenario without truncating a creditor to zero", () => {
    const principal = convertSettlementPositions(vector([-25877, 18598, -3646, 10925]), pair);
    expect(principal.map(row => row.amountMinor)).toEqual([-22670, 16293, -3194, 9571]);
    const dueFees = allocateExactMinor(349, [11, 8, 4, 7].map((weight, order) => ({ id: "ABCD"[order], order, weight })));
    expect(dueFees).toEqual([128, 93, 47, 81]);
    const totals = principal.map((row, index) => ({ ...row, amountMinor: row.amountMinor + dueFees[index] - (index === 0 ? 349 : 0) }));
    expect(totals.map(row => row.amountMinor)).toEqual([-22891, 16386, -3147, 9652]);
    expect(compensateSettlementPositions(totals, { mode: "centralized", centralizerId: "A" })).toEqual([
      { debtorId: "B", creditorId: "A", amountMinor: 16386 },
      { debtorId: "A", creditorId: "C", amountMinor: 3147 },
      { debtorId: "D", creditorId: "A", amountMinor: 9652 },
    ]);
    const consumed = previewFifoConsumption(39826, [{ creditId: "synthetic-topup", sequence: 1, availableCnyMinor: 39830, availableHistoricalBrlCents: 34893 }]);
    expect(consumed.historicalBrlCents).toBe(34889);
    expect(28868 + consumed.historicalBrlCents + 349).toBe(64106);
  });

  it("uses mathematical floor for negative fractions and stable persisted order for ties", () => {
    expect(convertSettlementPositions(vector([-1, 1]), { fromCnyMinor: 2, toBrlCents: 1 }).map(row => row.amountMinor)).toEqual([0, 0]);
    const input = vector([-5, 2, 1, 2]);
    const converted = convertSettlementPositions(input, pair);
    expect(convertSettlementPositions([...input].reverse(), pair).reverse()).toEqual(converted);
    expect(input).toEqual(vector([-5, 2, 1, 2]));
  });

  it("rejects unbalanced vectors, duplicate identities/order, invalid pairs and overflow", () => {
    expect(() => convertSettlementPositions(vector([1, 0]), pair)).toThrow(/zero/);
    expect(() => convertSettlementPositions([{ personId: "A", order: 0, amountMinor: -1 }, { personId: "A", order: 1, amountMinor: 1 }], pair)).toThrow(/únicos/);
    expect(() => convertSettlementPositions(vector([-1, 1]), { fromCnyMinor: 0, toBrlCents: 1 })).toThrow();
    expect(() => convertSettlementPositions(vector([-MAX_FINANCIAL_MINOR, MAX_FINANCIAL_MINOR]), { fromCnyMinor: 1, toBrlCents: 2 })).toThrow(/limite/);
    expect(() => compensateSettlementPositions(vector([-1, 1]), { mode: "centralized", centralizerId: "foreign" })).toThrow();
  });

  it("preserves both sides and zero-sum totals under deterministic generated inputs", () => {
    for (let seed = 1; seed <= 150; seed++) {
      const a = seed * 13 % 211, b = seed * 31 % 199, c = seed * 43 % 137;
      const converted = convertSettlementPositions(vector([-a - b + c, a, -c, b]), { fromCnyMinor: seed, toBrlCents: seed * 3 + 1 });
      expect(converted.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(0);
      for (const policy of [{ mode: "pairwise_netting" as const }, { mode: "centralized" as const, centralizerId: "A" }]) {
        const claims = compensateSettlementPositions(converted, policy);
        for (const person of converted) {
          const position = claims.reduce((sum, claim) => sum + (claim.debtorId === person.personId ? claim.amountMinor : 0) - (claim.creditorId === person.personId ? claim.amountMinor : 0), 0);
          expect(position).toBe(person.amountMinor);
        }
        expect(claims.every(claim => claim.debtorId !== claim.creditorId && claim.amountMinor > 0)).toBe(true);
      }
    }
  });
});
