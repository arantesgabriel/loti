import { MAX_FINANCIAL_MINOR } from "./financial-money";

export type SettlementPosition = { personId: string; order: number; amountMinor: number };
export type SettlementClaim = { debtorId: string; creditorId: string; amountMinor: number };

export type SettlementFundingAllocation = {
  id: string;
  sourceId: string;
  funderId: string;
  beneficiaryId: string;
  amountMinor: number;
};

/** Build direct obligations from actual funding lineage. This is deliberately
 * separate from netting: choosing no compensation retains every original pair.
 * Invoke separately for native principal and BRL fees, never for historical cost.
 */
export function directSettlementClaims(allocations: SettlementFundingAllocation[]) {
  const ids = new Set<string>();
  return allocations.flatMap(allocation => {
    checked(allocation.amountMinor);
    if (!allocation.id || ids.has(allocation.id) || !allocation.sourceId || !allocation.funderId || !allocation.beneficiaryId) throw new Error("Origem do financiamento inválida ou duplicada.");
    ids.add(allocation.id);
    if (!allocation.amountMinor || allocation.funderId === allocation.beneficiaryId) return [];
    return [{ allocationId: allocation.id, sourceId: allocation.sourceId, debtorId: allocation.beneficiaryId, creditorId: allocation.funderId, amountMinor: allocation.amountMinor }];
  });
}

/** Project signed positions from claims while retaining uninvolved participants.
 * The service supplies the authorized people including an explicitly selected
 * funder who has no physical unit in this package.
 */
export function settlementPositionsFromClaims(people: { personId: string; order: number }[], claims: SettlementClaim[]): SettlementPosition[] {
  const rows = people.map(person => ({ ...person, amountMinor: 0 }));
  positions(rows);
  const totals = new Map(rows.map(row => [row.personId, 0n]));
  for (const claim of claims) {
    checked(claim.amountMinor);
    if (claim.debtorId === claim.creditorId || !totals.has(claim.debtorId) || !totals.has(claim.creditorId) || !claim.amountMinor) throw new Error("Obrigação do acerto inválida.");
    totals.set(claim.debtorId, totals.get(claim.debtorId)! + BigInt(claim.amountMinor));
    totals.set(claim.creditorId, totals.get(claim.creditorId)! - BigInt(claim.amountMinor));
  }
  return rows.map(row => {
    const value = totals.get(row.personId)!;
    if (value < -BigInt(MAX_FINANCIAL_MINOR) || value > BigInt(MAX_FINANCIAL_MINOR)) throw new Error("A posição do acerto excede o limite permitido.");
    return { ...row, amountMinor: Number(value) };
  });
}

function checked(value: number, signed = false) {
  if (!Number.isSafeInteger(value) || value < (signed ? -MAX_FINANCIAL_MINOR : 0) || value > MAX_FINANCIAL_MINOR) {
    throw new Error("Valor do acerto inválido.");
  }
}

function positions(rows: SettlementPosition[]) {
  const ids = new Set<string>(), orders = new Set<number>();
  for (const row of rows) {
    checked(row.amountMinor, true);
    if (!row.personId || ids.has(row.personId) || !Number.isSafeInteger(row.order) || row.order < 0 || orders.has(row.order)) throw new Error("Participantes e ordem do acerto devem ser únicos.");
    ids.add(row.personId); orders.add(row.order);
  }
  if (!rows.length || rows.length > 100) throw new Error("Participantes do acerto inválidos.");
  if (rows.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n) !== 0n) throw new Error("As posições do acerto não fecham em zero.");
  return [...rows].sort((a, b) => a.order - b.order);
}

/** Signed floor (BigInt division alone truncates negative values towards zero). */
function floorRatio(numerator: bigint, denominator: bigint) {
  const quotient = numerator / denominator;
  return numerator < 0n && numerator % denominator !== 0n ? quotient - 1n : quotient;
}

/** Convert the whole zero-sum vector once, with an exact zero BRL target. */
export function convertSettlementPositions(rows: SettlementPosition[], pair: { fromCnyMinor: number; toBrlCents: number }) {
  checked(pair.fromCnyMinor); checked(pair.toBrlCents);
  if (!pair.fromCnyMinor || !pair.toBrlCents) throw new Error("O par de conversão deve ser positivo.");
  const denominator = BigInt(pair.fromCnyMinor);
  const parts = positions(rows).map(row => {
    const numerator = BigInt(row.amountMinor) * BigInt(pair.toBrlCents);
    const floor = floorRatio(numerator, denominator);
    return { row, value: floor, remainder: numerator - floor * denominator };
  });
  const missing = -parts.reduce((sum, part) => sum + part.value, 0n);
  if (missing < 0n || missing >= BigInt(parts.length)) throw new Error("Arredondamento do acerto inválido.");
  const ranked = [...parts].sort((a, b) => a.remainder === b.remainder ? a.row.order - b.row.order : a.remainder > b.remainder ? -1 : 1);
  for (let index = 0; index < Number(missing); index++) ranked[index].value++;
  const values = new Map(parts.map(part => {
    if (part.value < -BigInt(MAX_FINANCIAL_MINOR) || part.value > BigInt(MAX_FINANCIAL_MINOR)) throw new Error("O valor convertido excede o limite permitido.");
    return [part.row.personId, Number(part.value)] as const;
  }));
  return rows.map(row => ({ ...row, amountMinor: values.get(row.personId)! }));
}

/** Call only after the user explicitly chooses the compensation policy.
 * Direct claims with economic source lineage must be retained by the service.
 */
export function compensateSettlementPositions(rows: SettlementPosition[], policy: { mode: "pairwise_netting" } | { mode: "centralized"; centralizerId: string }): SettlementClaim[] {
  const sorted = positions(rows);
  if (policy.mode === "centralized") {
    if (!sorted.some(row => row.personId === policy.centralizerId)) throw new Error("Centralizador ausente do acerto.");
    return sorted.filter(row => row.personId !== policy.centralizerId && row.amountMinor !== 0).map(row => ({
      debtorId: row.amountMinor > 0 ? row.personId : policy.centralizerId,
      creditorId: row.amountMinor > 0 ? policy.centralizerId : row.personId,
      amountMinor: Math.abs(row.amountMinor),
    }));
  }
  const debtors = sorted.filter(row => row.amountMinor > 0).map(row => ({ ...row }));
  const creditors = sorted.filter(row => row.amountMinor < 0).map(row => ({ ...row, amountMinor: -row.amountMinor }));
  const claims: SettlementClaim[] = [];
  let debtor = 0, creditor = 0;
  while (debtor < debtors.length && creditor < creditors.length) {
    const amountMinor = Math.min(debtors[debtor].amountMinor, creditors[creditor].amountMinor);
    claims.push({ debtorId: debtors[debtor].personId, creditorId: creditors[creditor].personId, amountMinor });
    debtors[debtor].amountMinor -= amountMinor; creditors[creditor].amountMinor -= amountMinor;
    if (!debtors[debtor].amountMinor) debtor++;
    if (!creditors[creditor].amountMinor) creditor++;
  }
  return claims;
}
