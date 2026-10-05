"use client";
import Link from "next/link";
import { History, ArrowUpRight, LockKeyhole } from "lucide-react";
import { useWorkspace } from "../workspace-provider";
import { EmptyState } from "../shared";
import { formatMoney, purchaseSummary } from "@/lib/domain/money";
import { PurchaseView } from "./purchase-screen";
export function HistoryScreen() {
  const { data } = useWorkspace();
  const history = data.purchases.filter(p => p.status === "finalized").sort((a, b) => (b.finalizedAt ?? "").localeCompare(a.finalizedAt ?? ""));
  return <><div className="page-heading"><div><h1>Histórico</h1><p className="muted">As compras que vocês fizeram juntos.</p></div></div><div className="history-list">{history.map(p => { const s = purchaseSummary(data.items.filter(i => i.purchaseId === p.id)); return <Link className="history-row" key={p.id} href={`/history/${p.id}`}><div className="history-icon"><History size={24}/></div><div><h2>{p.name}</h2><p className="muted">{p.finalizedAt && new Date(p.finalizedAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {s.people} {s.people === 1 ? "pessoa" : "pessoas"} · {s.units} {s.units === 1 ? "unidade" : "unidades"}</p><span className="badge"><LockKeyhole size={10}/>Finalizada</span></div><strong>{formatMoney(s.totalCents)}{s.noPriceUnits > 0 && <small>{s.noPriceUnits} unidades sem preço</small>}</strong><ArrowUpRight size={20}/></Link>; })}</div>{!history.length && <EmptyState icon={History} title="Cada compra, uma história" description="Quando você finalizar uma compra, ela fica guardada aqui com todos os detalhes."/>}</>;
}
export function HistoricalPurchase({ id }: { id: string }) { const { data } = useWorkspace(); const purchase = data.purchases.find(p => p.id === id && p.status === "finalized"); return purchase ? <PurchaseView key={id} purchase={purchase}/> : <EmptyState title="Compra não encontrada" description="Volte ao histórico para encontrar uma compra finalizada."/>; }
