export const MAX_FINANCIAL_MINOR = 1_000_000_000_000;

export type FinancialCurrency = "CNY" | "BRL";

function checkedMinor(value: bigint, label: string) {
  if (value < 0n || value > BigInt(MAX_FINANCIAL_MINOR) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(label);
  }
  return Number(value);
}

/** Parse a non-negative amount with at most two decimals without using floating point. */
export function parseFinancialMinor(value: string, currency: FinancialCurrency): number | null {
  const input = value.trim();
  if (!input) return null;
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(input)) {
    throw new Error(`Informe um valor válido em ${currency}, com até duas casas decimais.`);
  }
  const normalized = input.replace(",", ".");
  const [whole, fraction = ""] = normalized.split(".");
  const minor = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  return checkedMinor(minor, `O valor em ${currency} excede o limite permitido.`);
}

/** Round a non-negative integer ratio to nearest, with exact halves rounded up. */
export function roundRatioHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) throw new Error("A razão monetária é inválida.");
  return (numerator * 2n + denominator) / (denominator * 2n);
}

export function calculateExternalFeeBrl(principalBrlCents: number, feeBps: number): number {
  if (!Number.isSafeInteger(principalBrlCents) || principalBrlCents < 0 || principalBrlCents > MAX_FINANCIAL_MINOR) {
    throw new Error("O principal externo em BRL é inválido.");
  }
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new Error("O percentual externo deve estar entre 0% e 100%.");
  }
  return checkedMinor(
    roundRatioHalfUp(BigInt(principalBrlCents) * BigInt(feeBps), 10_000n),
    "A taxa externa excede o limite permitido.",
  );
}

/** Convert using a captured integer pair. The pair is an operation snapshot, not a market rate. */
export function convertByCapturedPair(
  amountMinor: number,
  capturedFromMinor: number,
  capturedToMinor: number,
): number {
  for (const amount of [amountMinor, capturedFromMinor, capturedToMinor]) {
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_FINANCIAL_MINOR) {
      throw new Error("Os valores da conversão devem ser centavos/unidades inteiros válidos.");
    }
  }
  if (capturedFromMinor === 0) throw new Error("A base da conversão não pode ser zero.");
  return checkedMinor(
    roundRatioHalfUp(BigInt(amountMinor) * BigInt(capturedToMinor), BigInt(capturedFromMinor)),
    "O valor convertido excede o limite permitido.",
  );
}

function formatMinor(value: number, symbol: string): string {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_FINANCIAL_MINOR) {
    throw new Error("O valor monetário é inválido.");
  }
  const whole = Math.floor(value / 100);
  const fraction = String(value % 100).padStart(2, "0");
  const groupedWhole = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(whole);
  return `${symbol}\u00a0${groupedWhole},${fraction}`;
}

export function formatCnyMinor(value: number): string {
  return formatMinor(value, "¥");
}

export function formatBrlMinor(value: number): string {
  return formatMinor(value, "R$");
}
