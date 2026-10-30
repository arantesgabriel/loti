"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PackageSurfaceProvider } from "@/components/packages/package-surface";
import { AdditionalProductEditor } from "@/components/packages/additional-product-editor";
import { ItemCostSurface, type ItemCostDraft } from "@/components/packages/item-cost-surface";
import { OrderRefundForm, OrderRefundRecordForm } from "@/components/packages/refunds-section";
import { costRequest } from "@/components/packages/package-cost-client";
import type { CostTrackingView } from "@/lib/domain/package-cost-reading";
import { formatMoney } from "@/lib/domain/money";
import { OrdersContextSurface } from "./orders-context-surface";
import type { WarehouseData } from "./orders-screen";
import "./orders-actions.css";

type Row = WarehouseData["rows"][number];
type Action = "edit" | "refund" | "origin" | "refunds" | null;
type RefundAction = { id: string; mode: "receive" | "correct" | "void" | "edit" } | null;
export function OrderItemActions({ row, data, disabled, returnTo, children, onReceive, onChanged }: {
  row: Row; data: WarehouseData; disabled: boolean; returnTo: string; children: ReactNode;
  onReceive: (row: Row) => void; onChanged: (replacement?: { previousId: string; nextId: string }) => void;
}) {
  const [detail, setDetail] = useState<CostTrackingView | null>(null), [action, setAction] = useState<Action>(null);
  const [recordAction, setRecordAction] = useState<RefundAction>(null), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [error, setError] = useState(""), [version, setVersion] = useState(0);
  const [paymentReset, setPaymentReset] = useState<Record<string, unknown> | null>(null);
  const [editDraft, setEditDraft] = useState<ItemCostDraft | null>(null);
  const active = useRef(false), alive = useRef(true), trigger = useRef<HTMLElement | null>(null);
  const url = `/api/packages/${encodeURIComponent(row.cost.trackingId)}`;
  useEffect(() => {
    alive.current = true; let current = true;
    void costRequest<CostTrackingView>(url).then(result => {
      if (!current) return;
      setLoading(false);
      if (result.ok && result.data) { setDetail(result.data); setError(""); }
      else setError(result.error ?? "Não foi possível carregar as ações deste item.");
    });
    return () => { current = false; alive.current = false; };
  }, [url, row.revision, version]);
  function open(next: Action) { trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setError(""); if (next === "edit") setEditDraft(null); setAction(next); }
  function close() { if (!active.current) { setAction(null); setRecordAction(null); setPaymentReset(null); requestAnimationFrame(() => trigger.current?.isConnected && trigger.current.focus({ preventScroll: true })); } }
  async function mutate(operation: string, rest: Record<string, unknown>) {
    if (active.current) return false; active.current = true; setBusy(true); setError("");
    const result = await costRequest<CostTrackingView>(url, { operation, ...rest });
    active.current = false;
    if (!alive.current) return false;
    setBusy(false);
    if (!result.ok || !result.data) {
      if (operation === "item.save" && result.status === 409 && result.error?.includes("Confirme")) { setEditDraft(rest.input as ItemCostDraft); setPaymentReset(rest); setAction(null); }
      else setError(result.error ?? "Não foi possível salvar. Seus dados continuam no formulário.");
      return false;
    }
    setDetail(result.data);
    let replacement: { previousId: string; nextId: string } | undefined;
    if (operation === "order.additional.correct" && detail) {
      const correction = result.data.orderCorrections.find(change => change.previousOrderId === rest.orderId);
      const old = detail.productOrders.find(order => order.id === rest.orderId)?.items.find(item => item.cost.id === row.costItemId);
      const next = result.data.productOrders.find(order => order.id === correction?.replacementOrderId)?.items.find(item => item.cost.itemOrder === old?.cost.itemOrder);
      if (next) replacement = { previousId: row.costItemId, nextId: next.cost.id };
    }
    setAction(null); setRecordAction(null); setPaymentReset(null); onChanged(replacement);
    requestAnimationFrame(() => trigger.current?.isConnected && trigger.current.focus({ preventScroll: true }));
    return true;
  }
  const order = detail?.productOrders.find(order => order.id === row.order.id);
  const original = detail?.items.find(item => item.id === row.costItemId);
  const refunds = detail?.refunds.filter(refund => refund.costItemId === row.costItemId) ?? [];
  const freeUnits = row.quantity - row.cancelledUnits.length - row.reservations.length;
  const closed = !detail || detail.tracking.status === "closed";
  const financialReady = row.order.kind === "additional" || !!detail && detail.productsCharge?.paymentStatus === "paid" && detail.calculation.productsCharge.baseCents !== null && detail.calculation.productsCharge.feeCents !== null && original?.effectivePriceState !== "pending" && original?.chinaFreightState !== "pending";
  const canRefund = !closed && row.reviewState === "confirmed" && freeUnits > 0 && financialReady;
  const protectedRefunds = row.order.kind === "additional" ? detail?.refunds.some(refund => order?.items.some(item => item.cost.id === refund.costItemId) && refund.status !== "voided") : detail?.refunds.some(refund => refund.status !== "voided");
  const canEdit = !closed && !protectedRefunds && (row.order.kind === "additional" ? !!order?.accountId : !!original);
  const origin = data.origins.find(origin => origin.trackingId === row.cost.trackingId);
  const originHref = `/orders/${encodeURIComponent(row.order.id)}?${new URLSearchParams({ item: row.costItemId, returnTo })}`;
  const blocked = disabled || busy || loading;
  return <PackageSurfaceProvider orders error={error} intro={action === "edit" && row.order.kind === "original" ? <p className="orders-action-notice">Nome, variação e quantidade pertencem à compra finalizada e permanecem no histórico. Aqui você corrige somente custos e divisão permitidos.</p> : undefined}>
    <Button type="button" variant="ghost" className="orders-item-origin" aria-label={`Compra de origem de ${row.name}`} onClick={() => open("origin")}>Compra de origem{origin ? ` · ${origin.name}` : ""}</Button>
    <section aria-label="Ações do item"><h3>Ações do item</h3>{children}
      <div className="orders-item-context-actions"><Button type="button" variant="outline" disabled={disabled || busy} onClick={() => onReceive(row)} aria-label={`Conferir chegada de ${row.name}`}>Conferir chegada</Button><Button type="button" variant="ghost" disabled={blocked || !canEdit} title={!canEdit ? closed ? "Custos encerrados ou dados indisponíveis" : "Bases protegidas por reembolso" : undefined} onClick={() => open("edit")}>Editar item</Button>{canRefund && <Button type="button" variant="ghost" disabled={blocked} onClick={() => open("refund")}>Registrar reembolso</Button>}{refunds.length > 0 && <Button type="button" variant="ghost" disabled={blocked} onClick={() => open("refunds")}>Ver reembolsos · {refunds.length}</Button>}</div>
      {loading && <p role="status">Conferindo ações disponíveis…</p>}
      {!loading && !closed && !canRefund && freeUnits > 0 && <p>Para solicitar reembolso, confira a posição, as bases e o pagamento dos produtos na compra de origem.</p>}
      {freeUnits <= 0 && !closed && <p>Retire unidades do pacote explicitamente antes de solicitar reembolso.</p>}
      {error && <p role="alert" className="orders-item-action-error">{error}</p>}
      {!loading && !detail && <Button variant="outline" onClick={() => { setLoading(true); setVersion(current => current + 1); }}>Atualizar ações</Button>}
    </section>
    <OrdersContextSurface open={action === "origin"} onOpenChange={value => { if (!value) close(); }} title="Compra de origem" description="Resumo da origem do item selecionado.">
      <div className="orders-origin-summary"><h3>{origin?.name ?? "Compra registrada"}</h3><dl><div><dt>Produto</dt><dd>{row.name}</dd></div><div><dt>Variação</dt><dd>{row.source.variant || "Sem variação"}</dd></div><div><dt>Origem</dt><dd>{row.order.kind === "additional" ? "Pedido adicional" : "Compra original"}</dd></div><div><dt>Conta HubBuy</dt><dd>{data.accounts.find(account => account.id === row.accountId)?.label ?? "A conferir"}</dd></div><div><dt>Pagamento</dt><dd>{row.paymentStatus === "paid" ? "Confirmado" : "Não confirmado"}</dd></div></dl><Link href={originHref}>Ver compra completa</Link><Button variant="outline" onClick={close}>Voltar ao item</Button></div>
    </OrdersContextSurface>
    {detail && action === "edit" && (row.order.kind === "additional" ? <AdditionalProductEditor key={row.costItemId} detail={detail} itemId={row.costItemId} busy={busy} onClose={close} mutate={mutate}/> : <ItemCostSurface key={row.costItemId} detail={detail} editor={{ id: row.costItemId, name: row.name }} initialInput={editDraft} busy={busy} onClose={close} onSave={async input => { await mutate("item.save", { input }); }}/>) }
    {detail && action === "refund" && <OrderRefundForm key={row.costItemId} detail={detail} itemId={row.costItemId} reservedUnits={row.reservations.map(reservation => reservation.unitIndex)} busy={busy} onClose={close} onSubmit={async input => { await mutate("refund.request", { input }); }}/>}
    <OrdersContextSurface open={!!paymentReset} onOpenChange={value => { if (!value) { setPaymentReset(null); setAction("edit"); } }} title="Confirmar alteração dos custos" description="Esta alteração volta a confirmação do pagamento dos produtos para pendente. O histórico da compra é preservado.">
      {error && <p role="alert">{error}</p>}<div className="orders-action-footer"><Button variant="outline" disabled={busy} onClick={() => { setPaymentReset(null); setAction("edit"); }}>Voltar</Button><Button disabled={busy} onClick={() => { if (paymentReset) void mutate("item.save", { ...paymentReset, input: { ...(paymentReset.input as object), confirmPaymentReset: true } }); }}>Confirmar alteração</Button></div>
    </OrdersContextSurface>
    <OrdersContextSurface open={action === "refunds" && !recordAction} onOpenChange={value => { if (!value) close(); }} title="Reembolsos do item" description={row.name}>
      <ul className="orders-qc-rows">{refunds.map(refund => <li key={refund.id}><strong>{refund.quantity} unidades · {refund.status === "requested" ? "A receber" : refund.status === "received" ? "Recebido" : "Anulado"}</strong><small>{refund.reason}</small><p>{formatMoney(refund.status === "received" ? (refund.receivedProductCents ?? 0) + (refund.receivedChinaCents ?? 0) : refund.requestedProductCents + refund.requestedChinaCents)}</p>{!closed && refund.status !== "voided" && <div className="orders-item-context-actions">{refund.status === "requested" ? <><Button onClick={() => setRecordAction({ id: refund.id, mode: "receive" })}>Registrar recebimento</Button><Button variant="outline" onClick={() => setRecordAction({ id: refund.id, mode: "edit" })}>Editar solicitação</Button></> : <Button onClick={() => setRecordAction({ id: refund.id, mode: "correct" })}>Corrigir recebimento</Button>}<Button variant="ghost" onClick={() => setRecordAction({ id: refund.id, mode: "void" })}>Anular registro</Button></div>}</li>)}</ul>
    </OrdersContextSurface>
    {detail && recordAction && <OrderRefundRecordForm key={`${recordAction.id}:${recordAction.mode}`} detail={detail} refundId={recordAction.id} mode={recordAction.mode} busy={busy} onClose={() => { if (!busy) setRecordAction(null); }} onSubmit={async (operation, input) => { await mutate(operation, { refundId: recordAction.id, input }); }}/>} 
  </PackageSurfaceProvider>;
}
