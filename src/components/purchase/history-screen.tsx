"use client";
import Link from "next/link";
import { History, ArrowUpRight, LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "../workspace-provider";
import { EmptyState } from "../shared";
import { formatMoney, purchaseSummary } from "@/lib/domain/money";
import { PurchaseView } from "./purchase-screen";
import { Button } from "../ui/button";
import {
  costRequest,
  type CostTrackingSummary,
} from "../packages/package-cost-client";
export function HistoryScreen() {
  const { data } = useWorkspace();
  const [trackings, setTrackings] = useState<CostTrackingSummary[]>([]),
    [starting, setStarting] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void costRequest<CostTrackingSummary[]>("/api/packages").then((result) => {
      if (active && result.ok && result.data) setTrackings(result.data);
    });
    return () => {
      active = false;
    };
  }, []);
  const history = data.purchases
    .filter((p) => p.status === "finalized")
    .sort((a, b) => (b.finalizedAt ?? "").localeCompare(a.finalizedAt ?? ""));
  async function startCosts(purchaseId: string) {
    setStarting(purchaseId);
    const result = await costRequest<CostTrackingSummary[]>("/api/packages", {
      operation: "start",
      purchaseId,
    });
    if (result.ok && result.data) setTrackings(result.data);
    else toast.error(result.error ?? "Não foi possível iniciar os custos.");
    setStarting(null);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Histórico</h1>
          <p className="muted">As compras que vocês fizeram juntos.</p>
        </div>
      </div>
      <div className="history-list">
        {history.map((p) => {
          const s = purchaseSummary(
              data.items.filter((i) => i.purchaseId === p.id),
            ),
            tracking = trackings.find((row) => row.purchase.id === p.id);
          return (
            <article className="history-row" key={p.id}>
  <Link className="history-main" href={`/history/${p.id}`}>
    <div className="history-icon">
      <History size={24} />
    </div>

    <div>
      <h2>{p.name}</h2>

      <p className="muted">
        {p.finalizedAt &&
          new Date(p.finalizedAt).toLocaleDateString("pt-BR", {
            timeZone: "America/Sao_Paulo",
          })}{" "}
        · {s.people} {s.people === 1 ? "pessoa" : "pessoas"} ·{" "}
        {s.units} {s.units === 1 ? "unidade" : "unidades"}
      </p>

      <span className="badge">
        <LockKeyhole size={10} />
        Finalizada
      </span>
    </div>
  </Link>

  <div className="history-actions">
    <Link
      className="history-total"
      href={`/history/${p.id}`}
    >
      <strong>
        {formatMoney(s.totalCents)}

        {s.noPriceUnits > 0 && (
          <small>{s.noPriceUnits} unidades sem preço</small>
        )}
      </strong>

      <ArrowUpRight size={20} />
    </Link>

    <div className="history-cost-action">
      {tracking ? (
        <Button asChild variant="outline" size="sm">
          <Link href={`/packages/${tracking.tracking.id}`}>
            Ver custos
          </Link>
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={starting === p.id}
          onClick={() => void startCosts(p.id)}
        >
          {starting === p.id ? "Iniciando…" : "Iniciar custos"}
        </Button>
      )}
    </div>
  </div>
</article>
          );
        })}
      </div>
      {!history.length && (
        <EmptyState
          icon={History}
          title="Cada compra, uma história"
          description="Quando você finalizar uma compra, ela fica guardada aqui com todos os detalhes."
        />
      )}
    </>
  );
}
export function HistoricalPurchase({ id }: { id: string }) {
  const { data } = useWorkspace();
  const purchase = data.purchases.find(
    (p) => p.id === id && p.status === "finalized",
  );
  return purchase ? (
    <PurchaseView key={id} purchase={purchase} />
  ) : (
    <EmptyState
      title="Compra não encontrada"
      description="Volte ao histórico para encontrar uma compra finalizada."
    />
  );
}
