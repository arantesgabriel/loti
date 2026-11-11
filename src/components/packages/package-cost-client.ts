import type { CostTrackingView } from "@/lib/domain/package-cost-reading";

export type CostTrackingSummary = Pick<CostTrackingView, "tracking" | "purchase" | "packages" | "charges" | "calculation" | "items" | "refundsSummary">;
export type CostResponse<T> = { ok: boolean; status: number; data?: T; error?: string; code?: string };

export async function costRequest<T>(url: string, operation?: Record<string, unknown>, workspaceId?: string, signal?: AbortSignal): Promise<CostResponse<T>> {
  try {
    const target = workspaceId && !operation
      ? (() => { const parsed = new URL(url, window.location.origin); parsed.searchParams.set("workspaceId", workspaceId); return parsed.pathname + parsed.search; })()
      : url;
    if (operation && workspaceId && operation.workspaceId && operation.workspaceId !== workspaceId) return { ok: false, status: 409, code: "WORKSPACE_CONTEXT_CHANGED", error: "O espaço ativo mudou. Atualize a tela antes de salvar novamente." };
    const response = await fetch(target, operation ? { method: "POST", headers: { "Content-Type": "application/json", "X-Loti-Workflow":"orders-v2" }, body: JSON.stringify({ ...operation, ...(workspaceId ? { workspaceId } : {}) }) } : { cache: "no-store", signal });
    const result = await response.json();
    return { ok: response.ok, status: response.status, data: result.data as T | undefined, error: result.error as string | undefined, code: result.code as string | undefined };
  } catch {
    return { ok: false, status: 0, error: "Não foi possível conectar. Tente novamente." };
  }
}

export { parseCostCents } from "@/lib/domain/package-refund-calculations";

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
