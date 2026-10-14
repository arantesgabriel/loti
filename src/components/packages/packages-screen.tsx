"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Package, ReceiptText } from "lucide-react";
import { EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { costRequest, type CostTrackingSummary } from "./package-cost-client";
import { formatMoney } from "@/lib/domain/money";

type Filter = "open" | "closed";

export function PackagesScreen() {
  const [rows, setRows] = useState<CostTrackingSummary[]>([]), [filter, setFilter] = useState<Filter>("open"), [loading, setLoading] = useState(true), [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void costRequest<CostTrackingSummary[]>("/api/packages").then(result => {
      if (!active) return;
      if (result.ok && result.data) setRows(result.data);
      else setError(result.error ?? "Não foi possível carregar os acompanhamentos.");
      setLoading(false);
    });
    return () => { active = false; };
  }, []);
  const counts = useMemo(() => ({ open: rows.filter(row => row.tracking.status === "open").length, closed: rows.filter(row => row.tracking.status === "closed").length }), [rows]);
  const visible = rows.filter(row => row.tracking.status === filter).sort((a, b) => new Date(b.tracking.updatedAt ?? 0).getTime() - new Date(a.tracking.updatedAt ?? 0).getTime());

  return <>
    <div className="page-heading"><div><h1>Pacotes e custos</h1><p className="muted">Acompanhe valores, pagamentos e pacotes de cada compra.</p></div></div>
    <div className="cost-filter" role="tablist" aria-label="Filtrar acompanhamentos">
      {(["open", "closed"] as const).map(value => <button key={value} role="tab" aria-selected={filter === value} className={filter === value ? "selected" : ""} onClick={() => setFilter(value)}>{value === "open" ? "Abertos" : "Encerrados"}<span>{counts[value]}</span></button>)}
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {loading ? <p className="muted cost-loading">Carregando acompanhamentos…</p> : visible.length ? <div className="cost-tracking-list">
      {visible.map(row => { const paymentPending = row.charges.some(charge => charge.chargeType === "products" ? charge.paymentStatus !== "paid" : charge.valueState === "pending" || charge.valueState === "known" && charge.paymentStatus !== "paid"); const refundPending = row.refundsSummary.requestedCount > 0; const hasPending = paymentPending || row.calculation.summary.pendingItemCount > 0 || refundPending; return <Link className="cost-tracking-row" key={row.tracking.id} href={`/packages/${row.tracking.id}`}>
        <span className="cost-tracking-icon"><Package size={22} aria-hidden="true" /></span>
        <span className="cost-tracking-copy"><strong>{row.purchase.name}</strong><small>{row.packages.length} {row.packages.length === 1 ? "pacote" : "pacotes"} · {row.calculation.summary.shippingUnits} de {row.calculation.summary.unitCount} unidades para envio{refundPending ? ` · ${row.refundsSummary.requestedCount} reembolso(s) a receber` : ""}</small><span className={`cost-status ${row.tracking.status}`}>{row.tracking.status === "open" ? "Custos abertos" : "Custos encerrados"}{hasPending && <em>{refundPending ? "Reembolso solicitado" : "Pendências financeiras"}</em>}</span></span>
        <span className="cost-tracking-total"><small>{row.calculation.summary.totalCents === null ? "Total parcial" : "Total final"}</small><strong>{row.calculation.summary.hasKnownAmount ? formatMoney(row.calculation.summary.totalCents ?? row.calculation.summary.partialCents) : "Falta informar"}</strong></span>
        <ArrowUpRight size={20} aria-hidden="true" />
      </Link>; })}
    </div> : <EmptyState icon={ReceiptText} title={filter === "open" ? "Nenhum custo em andamento" : "Nenhum acompanhamento encerrado"} description={filter === "open" ? "Ao finalizar uma compra, o acompanhamento dos custos aparece aqui. Compras antigas podem ser iniciadas pelo Histórico." : "Quando o acompanhamento de uma compra for encerrado, ele ficará disponível aqui."}>{filter === "open" && <Button asChild variant="outline"><Link href="/history">Abrir Histórico</Link></Button>}</EmptyState>}
  </>;
}
