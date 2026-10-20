/**
 * Splits an integer-cent total into stable logical unit positions. Earlier
 * positions receive the remainder cents, matching the persisted refund range
 * contract used by the refund services.
 */
export function refundUnitRangeCapacityCents(
  totalCents: number,
  totalQuantity: number,
  unitStart: number,
  quantity: number,
) {
  if (
    ![totalCents, totalQuantity, unitStart, quantity].every(Number.isSafeInteger) ||
    totalCents < 0 ||
    totalQuantity < 1 ||
    unitStart < 0 ||
    quantity < 0 ||
    BigInt(unitStart) + BigInt(quantity) > BigInt(totalQuantity)
  ) {
    throw new Error("A faixa de unidades do reembolso é inválida.");
  }

  const total = BigInt(totalCents);
  const count = BigInt(totalQuantity);
  const start = BigInt(unitStart);
  const end = start + BigInt(quantity);
  const base = total / count;
  const remainder = total % count;
  const extra =
    (end < remainder ? end : remainder) -
    (start < remainder ? start : remainder);
  return Number(base * BigInt(quantity) + (extra > 0n ? extra : 0n));
}
