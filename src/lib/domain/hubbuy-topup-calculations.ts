import { calculateExternalFeeBrl, MAX_FINANCIAL_MINOR, roundRatioHalfUp } from "./financial-money";

function minor(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_FINANCIAL_MINOR) {
    throw new Error("Valor monetário inválido.");
  }
}

/** Invert the integer receipt equation, never a floating point exchange rate. */
export function principalFromTopupTotal(totalBrlCents: number, feeBps: number) {
  minor(totalBrlCents);
  // Also validates the captured percentage for the zero-total case.
  calculateExternalFeeBrl(0, feeBps);
  let low = 0n, high = BigInt(totalBrlCents);
  const target = high;
  while (low <= high) {
    const principal = (low + high) / 2n;
    const fee = roundRatioHalfUp(principal * BigInt(feeBps), 10_000n);
    const total = principal + fee;
    if (total === target) return { principalBrlCents: Number(principal), feeBrlCents: Number(fee), totalBrlCents };
    if (total < target) low = principal + 1n;
    else high = principal - 1n;
  }
  // The equation is strictly increasing, so it has at most one solution.
  throw new Error("O total não corresponde ao percentual. Informe principal e taxa discriminados.");
}

export type TopupFunder = {
  personId: string;
  cnyMinor: number;
  principalBrlCents: number;
  feeBrlCents: number;
};

export function calculateTopup(input: {
  cnyMinor: number;
  principalBrlCents: number;
  feeBrlCents: number;
  fee: { mode: "percentage"; bps: number } | { mode: "effective"; reason: string };
  funders: TopupFunder[];
}) {
  [input.cnyMinor, input.principalBrlCents, input.feeBrlCents].forEach(minor);
  if (!input.cnyMinor || !input.principalBrlCents) throw new Error("Informe CNY recebidos e principal BRL positivos.");
  const total = BigInt(input.principalBrlCents) + BigInt(input.feeBrlCents);
  if (total > BigInt(MAX_FINANCIAL_MINOR)) throw new Error("O total da recarga excede o limite permitido.");
  if (input.fee.mode === "percentage") {
    if (calculateExternalFeeBrl(input.principalBrlCents, input.fee.bps) !== input.feeBrlCents) {
      throw new Error("A taxa diverge do percentual. Use taxa efetiva com motivo.");
    }
  } else if (!input.fee.reason.trim() || input.fee.reason.trim().length > 1000) {
    throw new Error("Informe o motivo da taxa efetiva.");
  }
  if (!input.funders.length || input.funders.length > 100) throw new Error("Informe os financiadores da recarga.");
  const people = new Set<string>();
  let cny = 0n, principal = 0n, fee = 0n;
  for (const funder of input.funders) {
    if (!funder.personId || people.has(funder.personId)) throw new Error("Financiadores inválidos ou duplicados.");
    people.add(funder.personId);
    [funder.cnyMinor, funder.principalBrlCents, funder.feeBrlCents].forEach(minor);
    // A person may finance only the fee; this does not create a zero-value credit share.
    if (funder.cnyMinor === 0 && funder.principalBrlCents !== 0) throw new Error("Principal sem parcela CNY.");
    if (funder.cnyMinor + funder.principalBrlCents + funder.feeBrlCents === 0) throw new Error("Financiador sem parcela.");
    cny += BigInt(funder.cnyMinor);
    principal += BigInt(funder.principalBrlCents);
    fee += BigInt(funder.feeBrlCents);
  }
  if (cny !== BigInt(input.cnyMinor) || principal !== BigInt(input.principalBrlCents) || fee !== BigInt(input.feeBrlCents)) {
    throw new Error("As parcelas dos financiadores não fecham o comprovante.");
  }
  return {
    cnyMinor: input.cnyMinor,
    principalBrlCents: input.principalBrlCents,
    feeBrlCents: input.feeBrlCents,
    totalBrlCents: Number(total),
    capturedPair: { fromCnyMinor: input.cnyMinor, toBrlCents: input.principalBrlCents },
    funders: input.funders.map(funder => ({ ...funder })),
  };
}

/** Cumulative proportional capacity; last consumption absorbs all remaining cents.
 * explicit fee allocations may be ahead of/behind the proportional suggestion.
 */
export function previewTopupFee(input: {
  creditedCnyMinor: number;
  originalFeeBrlCents: number;
  consumedBeforeCnyMinor: number;
  consumeCnyMinor: number;
  assignedBeforeBrlCents: number;
  explicitBrlCents?: number;
}) {
  [input.creditedCnyMinor, input.originalFeeBrlCents, input.consumedBeforeCnyMinor, input.consumeCnyMinor, input.assignedBeforeBrlCents].forEach(minor);
  if (input.explicitBrlCents !== undefined) minor(input.explicitBrlCents);
  if (!input.creditedCnyMinor || input.consumedBeforeCnyMinor + input.consumeCnyMinor > input.creditedCnyMinor || input.assignedBeforeBrlCents > input.originalFeeBrlCents) {
    throw new Error("A capacidade da recarga é inválida.");
  }
  const consumed = input.consumedBeforeCnyMinor + input.consumeCnyMinor;
  const cumulative = Number(roundRatioHalfUp(BigInt(input.originalFeeBrlCents) * BigInt(consumed), BigInt(input.creditedCnyMinor)));
  const available = input.originalFeeBrlCents - input.assignedBeforeBrlCents;
  const suggestedBrlCents = Math.max(0, cumulative - input.assignedBeforeBrlCents);
  const assignedBrlCents = input.explicitBrlCents ?? suggestedBrlCents;
  if (assignedBrlCents > available) throw new Error("A taxa atribuída excede o restante da recarga.");
  return { suggestedBrlCents, assignedBrlCents, remainingBrlCents: available - assignedBrlCents };
}
