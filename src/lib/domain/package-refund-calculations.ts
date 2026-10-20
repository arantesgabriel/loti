import { splitByWeights, type CostWeight } from "./package-cost-calculations";

export const MAX_REFUND_CENTS = 1_000_000_000_000;

export function checkedRefundCents(value: bigint, label = "O valor do reembolso excede o limite permitido.") {
  if (value < 0n || value > BigInt(MAX_REFUND_CENTS) || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(label);
  return Number(value);
}

/** Empty input is distinct from zero; accepts decimal comma or dot and explicit pt-BR grouping. */
export function parseCostCents(value: string): number | null {
  const input = value.trim();
  if (!input) return null;
  const grouped = /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(input);
  if (!grouped && !/^\d+(?:[,.]\d{1,2})?$/.test(input)) return null;
  const normalized = grouped ? input.replace(/\./g, "").replace(",", ".") : input.replace(",", ".");
  const [whole, fraction = ""] = normalized.split(".");
  const cents = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  if (cents > BigInt(MAX_REFUND_CENTS)) return null;
  return Number(cents);
}

export type RefundCreditWeights = Pick<CostWeight, "personId" | "allocationOrder"> & { cents: number };

/** Split an aggregate component credit against original personal shares, never a per-refund split. */
export function allocateRefundCredit(totalCents: number, originalShares: RefundCreditWeights[]) {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0 || totalCents > MAX_REFUND_CENTS) throw new Error("Valor recebido inválido.");
  const capacity = originalShares.reduce((total, share) => total + BigInt(share.cents), 0n);
  if (capacity > BigInt(MAX_REFUND_CENTS) || BigInt(totalCents) > capacity) throw new Error("O valor recebido excede o custo original deste componente.");
  if (!capacity) {
    if (totalCents) throw new Error("Não há valor original para distribuir este reembolso.");
    return originalShares.map(() => 0);
  }
  const result = splitByWeights(totalCents, originalShares.map(share => ({ ...share, weight: share.cents })));
  if (!result) throw new Error("Não foi possível distribuir o valor recebido.");
  result.forEach((share, index) => {
    if (share > originalShares[index].cents) throw new Error("A parcela recebida excede o custo original da pessoa.");
  });
  return result;
}

export function refundRequestedQuantity(refunds: { status: string; quantity: number }[]) {
  return refunds.reduce((sum, refund) => sum + (refund.status === "voided" ? 0 : refund.quantity), 0);
}
