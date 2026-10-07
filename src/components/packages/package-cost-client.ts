import type { CostTrackingView } from "@/lib/domain/package-cost-reading";

export type CostTrackingSummary = Pick<CostTrackingView, "tracking" | "purchase" | "packages" | "charges" | "calculation" | "items">;
export type CostResponse<T> = { ok: boolean; status: number; data?: T; error?: string };

export async function costRequest<T>(url: string, operation?: Record<string, unknown>): Promise<CostResponse<T>> {
  try {
    const response = await fetch(url, operation ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(operation) } : { cache: "no-store" });
    const result = await response.json();
    return { ok: response.ok, status: response.status, data: result.data as T | undefined, error: result.error as string | undefined };
  } catch {
    return { ok: false, status: 0, error: "Não foi possível conectar. Tente novamente." };
  }
}

export function percentFromBasisPoints(value: number) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100);
}
export function percentInputFromBasisPoints(value: number) { return (value / 100).toFixed(2); }
export function basisPointsFromPercent(value: string) {
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  const basisPoints = Math.round(parsed * 100);
  return Math.abs(parsed * 100 - basisPoints) < 1e-8 ? basisPoints : null;
}
