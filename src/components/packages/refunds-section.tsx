"use client";

import { useId, useState } from "react";
import { ChevronDown, CircleCheck, CircleX, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { QcCostCover, useQcCostPresentations } from "@/components/qc/qc-components";
import type { CostTrackingView } from "@/lib/domain/package-cost-reading";
import { formatMoney } from "@/lib/domain/money";
import { parseCostCents } from "./package-cost-client";

type Detail = CostTrackingView;
type Refund = Detail["refunds"][number];
type Item = Detail["items"][number];
type Mutate = (operation: string, rest: Record<string, unknown>) => Promise<boolean>;
const formatInput = (cents: number) => (cents / 100).toFixed(2);
const itemLabel = (item: Item) => `${item.original.name}${item.original.variant ? ` · ${item.original.variant}` : ""}`;

export function RefundsSection({ detail, locked, busy, requestItemId, onRequestClose, onDetails, mutate }: {
  detail: Detail; locked: boolean; busy: boolean; requestItemId: string | null; onRequestClose: () => void; onDetails: (itemId: string) => void; mutate: Mutate;
}) {
  const [activeRefundId, setActiveRefundId] = useState<string | null>(null);
  const [mode, setMode] = useState<"receive" | "correct" | "void" | "edit">("receive");
  const activeRefund = detail.refunds.find(refund => refund.id === activeRefundId) ?? null;
  const requestItem = detail.items.find(item => item.id === requestItemId) ?? null;
  const requested = detail.refunds.filter(refund => refund.status === "requested");
  const received = detail.refunds.filter(refund => refund.status === "received");
  const voided = detail.refunds.filter(refund => refund.status === "voided");
  const receivedItems = new Set(received.map(refund => refund.costItemId)).size;
  const refundedItemIds = new Set(detail.refunds.map(refund => refund.costItemId));
  const qcPresentations = useQcCostPresentations(detail.purchase.id, detail.items.filter(item => refundedItemIds.has(item.id)).map(item => item.original.id));

  function openRefund(refund: Refund, nextMode: typeof mode) { setActiveRefundId(refund.id); setMode(nextMode); }
  async function submit(operation: string, refundId: string | undefined, input: unknown) {
    const ok = await mutate(operation, { ...(refundId ? { refundId } : {}), input });
    if (ok) { setActiveRefundId(null); onRequestClose(); }
  }

  return <>
    {detail.refunds.length > 0 && <div className="cost-section-content"><section className="refunds-section" aria-labelledby="refunds-title" data-cost-target="refunds-section" tabIndex={-1}>
      <header className="refunds-heading">
        <div><h2 id="refunds-title">Reembolsos</h2><p>{receivedItems > 0 ? `${receivedItems} ${receivedItems === 1 ? "item reembolsado" : "itens reembolsados"} nesta compra.` : requested.length > 0 ? "Aguardando recebimento do reembolso." : "Histórico de registros anulados."}{requested.length > 0 && receivedItems > 0 ? ` ${requested.length} ${requested.length === 1 ? "solicitação a receber" : "solicitações a receber"}.` : ""}</p></div>
        <div className="refunds-total"><span>Total reembolsado</span><strong>{formatMoney(detail.refundsSummary.receivedCents)}</strong>{requested.length > 0 && <small>A receber: {formatMoney(detail.refundsSummary.requestedCents)}</small>}</div>
      </header>
      <div className="refunds-list">
        {[...requested, ...received].map(refund => <RefundRow key={refund.id} refund={refund} detail={detail} cover={qcPresentations[detail.items.find(item => item.id === refund.costItemId)?.original.id ?? ""]?.coverPreview ?? undefined} locked={locked} busy={busy} onDetails={onDetails} onAction={openRefund} />)}
        {voided.length > 0 && <details className="refunds-voided"><summary>Histórico anulado · {voided.length}</summary>{voided.map(refund => <RefundRow key={refund.id} refund={refund} detail={detail} locked={locked} busy={busy} onDetails={onDetails} onAction={openRefund} />)}</details>}
      </div>
    </section></div>}
    {requestItem && <RefundRequestSurface item={requestItem} detail={detail} busy={busy} onClose={onRequestClose} onSubmit={input => submit("refund.request", undefined, input)} />}
    {activeRefund && <RefundActionSurface refund={activeRefund} item={detail.items.find(item => item.id === activeRefund.costItemId)!} mode={mode} detail={detail} locked={locked} busy={busy} onClose={() => setActiveRefundId(null)} onSubmit={(operation, input) => submit(operation, activeRefund.id, input)} />}
  </>;
}

type RefundRowProps = {
  refund: Refund; detail: Detail; locked: boolean; busy: boolean;
  cover?: React.ComponentProps<typeof QcCostCover>["cover"];
  onDetails: (itemId: string) => void;
  onAction: (refund: Refund, mode: "receive" | "correct" | "void" | "edit") => void;
};

function RefundRow({ refund, detail, cover, locked, busy, onDetails, onAction }: RefundRowProps) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const item = detail.items.find(value => value.id === refund.costItemId);
  const name = item ? itemLabel(item) : "Produto";
  const received = refund.status === "received";
  const amount = received ? (refund.receivedProductCents ?? 0) + (refund.receivedChinaCents ?? 0) : refund.requestedProductCents + refund.requestedChinaCents;
  const date = new Date(refund.status === "voided" ? refund.voidedAt ?? refund.requestedAt : received ? refund.receivedAt ?? refund.requestedAt : refund.requestedAt);
  const StatusIcon = received ? CircleCheck : refund.status === "requested" ? Clock3 : CircleX;
  const paymentMethod = refund.originalPaymentMethod === "pix" ? "Pix" : refund.originalPaymentMethod === "card" ? "Cartão" : null;
  return <article className={`refund-row status-${refund.status}`} id={`refund-${refund.id}`}>
    <div className="refund-row-summary">
      <div className="refund-product">
        {item && <QcCostCover purchaseId={detail.purchase.id} itemName={item.original.name} visualKey={item.original.visualKey} cover={cover}/>}
        <div><h3>{name}</h3><p>{refund.participants.length === 1 ? "Usuário" : "Participantes"}: {refund.participants.map(person => person.name).join(" · ")}</p></div>
      </div>
      <div className="refund-context"><span className="refund-status"><StatusIcon size={14} aria-hidden="true"/>{received ? "Reembolsado" : refund.status === "requested" ? "A receber" : "Anulado"}</span><p><time dateTime={date.toISOString()}>{date.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" }).replaceAll(" de ", " ")}</time><span aria-hidden="true"> · </span>{refund.status === "voided" ? refund.voidReason : refund.reason}</p></div>
      <div className="refund-amount"><strong>{refund.status === "voided" ? "Sem crédito ativo" : formatMoney(amount)}</strong><small>{refund.status === "requested" ? "Valor solicitado" : paymentMethod ? `Pagamento original · ${paymentMethod}` : ""}</small></div>
      <Button className="refund-details-toggle" size="sm" variant="outline" aria-expanded={expanded} aria-controls={panelId} aria-label={`${expanded ? "Recolher detalhes" : "Ver detalhes"} de ${name}`} onClick={() => setExpanded(value => !value)}>{expanded ? "Recolher detalhes" : "Ver detalhes"}<ChevronDown size={16} aria-hidden="true"/></Button>
    </div>
    <div className="refund-details-panel" id={panelId} inert={!expanded} aria-hidden={!expanded} data-expanded={expanded}><div>
      <RefundDetails refund={refund} item={item}/>
      <div className="refund-row-actions">
        {item && <Button size="sm" variant="ghost" onClick={() => onDetails(item.id)}>Ver composição</Button>}
        {!locked && <>
          {refund.status === "requested" && <><Button size="sm" disabled={busy} onClick={() => onAction(refund, "receive")}>Registrar recebimento</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => onAction(refund, "edit")}>Editar solicitação</Button></>}
          {received && <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction(refund, "correct")}>Corrigir valores recebidos</Button>}
          {refund.status !== "voided" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction(refund, "void")}>Anular registro</Button>}
        </>}
      </div>
    </div></div>
  </article>;
}

function RefundDetails({ refund, item }: { refund: Refund; item?: Item }) {
  const received = refund.status === "received";
  return <div className="refund-details">
    <dl>
      <div><dt>Unidades</dt><dd>{refund.quantity} {refund.quantity === 1 ? "unidade cancelada" : "unidades canceladas"}{refund.status === "voided" ? " · cancelamento anulado" : ""}</dd></div>
      <div><dt>Base original das unidades</dt><dd>{formatMoney(refund.quantity * (refund.originalProductUnitCents + refund.originalChinaUnitCents))}</dd></div>
      {received && <div><dt>Valor solicitado</dt><dd>{formatMoney(refund.requestedProductCents + refund.requestedChinaCents)}</dd></div>}
      <div><dt>{received ? "Produto recebido" : "Produto solicitado"}</dt><dd>{formatMoney(received ? refund.receivedProductCents ?? 0 : refund.requestedProductCents)}</dd></div>
      <div><dt>{received ? "Frete China recebido" : "Frete China solicitado"}</dt><dd>{formatMoney(received ? refund.receivedChinaCents ?? 0 : refund.requestedChinaCents)}</dd></div>
      {item && <div><dt>Custo líquido da linha{item.calculation?.totalCents === null ? " (parcial)" : ""}</dt><dd>{formatMoney(item.calculation?.totalCents ?? item.calculation?.partialCents ?? 0)}</dd></div>}
    </dl>
    <p className="muted">A taxa do pagamento original permanece no custo. O custo líquido considera todos os reembolsos recebidos desta linha.</p>
    <details className="refund-events"><summary>Histórico deste reembolso · {refund.events.length} eventos</summary>{refund.events.map(event => <p key={event.id}><strong>{{ requested: "Solicitação", request_updated: "Solicitação editada", received: "Recebimento", receipt_corrected: "Recebimento corrigido", voided: "Anulação" }[event.eventType]}</strong> · {event.actorName} · {new Date(event.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}{event.reason ? ` · ${event.reason}` : ""}</p>)}</details>
  </div>;
}

function RefundRequestSurface({ item, detail, busy, onClose, onSubmit }: { item: Item; detail: Detail; busy: boolean; onClose: () => void; onSubmit: (input: unknown) => Promise<void> }) {
  const eligiblePackages = detail.packages.filter(pkg => pkg.logisticsStatus === "preparing" && pkg.items.some(row => row.costItemId === item.id && row.quantity > 0));
  const assigned = item.calculation?.allocatedQuantity ?? 0;
  const unassignedAvailable = Math.max(0, (item.calculation?.shippingQuantity ?? 0) - assigned);
  const defaultByPackage = Object.fromEntries(eligiblePackages.map(pkg => [pkg.id, eligiblePackages.length === 1 ? pkg.items.find(row => row.costItemId === item.id)?.quantity ?? 0 : 0]));
  const [packageQuantities, setPackageQuantities] = useState<Record<string, number>>(defaultByPackage);
  const [unassignedQuantity, setUnassignedQuantity] = useState(eligiblePackages.length === 0 ? unassignedAvailable : 0);
  const selectedQuantity = Object.values(packageQuantities).reduce((sum, quantity) => sum + quantity, 0) + unassignedQuantity;
  const productUnitCents = item.effectivePriceState === "no_charge" ? 0 : item.effectivePriceUnitCents ?? 0;
  const chinaUnitCents = item.chinaFreightState === "no_charge" ? 0 : item.chinaFreightUnitCents ?? 0;
  const [requestedProduct, setRequestedProduct] = useState(formatInput(productUnitCents * selectedQuantity));
  const [requestedChina, setRequestedChina] = useState(formatInput(chinaUnitCents * selectedQuantity));
  const [manualProduct, setManualProduct] = useState(false), [manualChina, setManualChina] = useState(false);
  const [reason, setReason] = useState("");
  const paidAffected = eligiblePackages.filter(pkg => (packageQuantities[pkg.id] ?? 0) > 0).flatMap(pkg => [pkg.brazilFreightCharge, pkg.customsCharge]).filter(charge => charge?.paymentStatus === "paid");
  const [confirmReset, setConfirmReset] = useState(false);
  const emptiedPaidPackage = eligiblePackages.some(pkg => {
    const removed = packageQuantities[pkg.id] ?? 0;
    const remaining = pkg.calculation?.unitCount ?? 0;
    return removed === remaining && [pkg.brazilFreightCharge, pkg.customsCharge].some(charge => charge?.valueState === "known" && (charge.amountCents ?? 0) > 0);
  });
  const productCents = parseCostCents(requestedProduct), chinaCents = parseCostCents(requestedChina);
  const removalTotal = Object.values(packageQuantities).reduce((sum, quantity) => sum + quantity, 0);
  const valid = selectedQuantity > 0 && removalTotal + unassignedQuantity === selectedQuantity && productCents !== null && chinaCents !== null && productCents + chinaCents > 0 && reason.trim().length > 0 && (!paidAffected.length || confirmReset) && !emptiedPaidPackage;

  function updateQuantity(packageId: string, next: number) {
    const safe = Math.max(0, Math.min(next, eligiblePackages.find(pkg => pkg.id === packageId)?.items.find(row => row.costItemId === item.id)?.quantity ?? 0));
    setPackageQuantities(current => ({ ...current, [packageId]: safe }));
    const selected = Object.entries({ ...packageQuantities, [packageId]: safe }).reduce((sum, [, quantity]) => sum + quantity, 0) + unassignedQuantity;
    if (!manualProduct) setRequestedProduct(formatInput(productUnitCents * selected));
    if (!manualChina) setRequestedChina(formatInput(chinaUnitCents * selected));
  }

  function updateUnassigned(next: number) {
    const safe = Math.max(0, Math.min(next, unassignedAvailable));
    setUnassignedQuantity(safe);
    const selected = Object.values(packageQuantities).reduce((sum, quantity) => sum + quantity, 0) + safe;
    if (!manualProduct) setRequestedProduct(formatInput(productUnitCents * selected));
    if (!manualChina) setRequestedChina(formatInput(chinaUnitCents * selected));
  }

  function useFullAmounts() { setManualProduct(false); setManualChina(false); setRequestedProduct(formatInput(productUnitCents * selectedQuantity)); setRequestedChina(formatInput(chinaUnitCents * selectedQuantity)); }

  return <Surface sheet open title={`Registrar reembolso · ${item.original.name}`} description="Somente unidades ainda em preparação ou sem pacote podem ser canceladas. O estado logístico é manual; confirme que as unidades não foram enviadas." onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <form onSubmit={event => { event.preventDefault(); if (!valid || productCents === null || chinaCents === null) return; void onSubmit({ expectedRevision: detail.tracking.revision, costItemId: item.id, quantity: selectedQuantity, requestedProductCents: productCents, requestedChinaCents: chinaCents, reason, packageRemovals: eligiblePackages.map(pkg => ({ packageId: pkg.id, quantity: packageQuantities[pkg.id] ?? 0 })).filter(row => row.quantity > 0), unassignedQuantity, ...(paidAffected.length ? { confirmPackagePaymentReset: true } : {}) }); }}>
      <p className="refund-item-context">{item.original.variant || "Sem variação"} · {item.original.quantity} compradas · {item.calculation?.cancelledQuantity ?? 0} canceladas · {item.calculation?.shippingQuantity ?? item.original.quantity} para envio</p>
      <fieldset className="refund-quantity-fields"><legend>De onde retirar as unidades</legend>
        {eligiblePackages.map((pkg, index) => <label key={pkg.id}>{pkg.name} · em preparação<input autoFocus={index === 0} aria-label={`${pkg.name} unidades a cancelar`} type="number" min="0" max={pkg.items.find(row => row.costItemId === item.id)?.quantity ?? 0} value={packageQuantities[pkg.id] ?? 0} onChange={event => updateQuantity(pkg.id, Number(event.target.value) || 0)} disabled={busy}/></label>)}
        {unassignedAvailable > 0 && <label>Sem pacote<input autoFocus={eligiblePackages.length === 0} aria-label="Unidades sem pacote a cancelar" type="number" min="0" max={unassignedAvailable} value={unassignedQuantity} onChange={event => updateUnassigned(Number(event.target.value) || 0)} disabled={busy}/></label>}
        <p>Quantidade selecionada: <strong>{selectedQuantity}</strong></p>
      </fieldset>
      <div className="refund-money-fields"><label>Valor solicitado do produto (R$)<input required inputMode="decimal" value={requestedProduct} onChange={event => { setManualProduct(true); setRequestedProduct(event.target.value); }} aria-invalid={productCents === null}/></label><label>Valor solicitado do frete China (R$)<input required inputMode="decimal" value={requestedChina} onChange={event => { setManualChina(true); setRequestedChina(event.target.value); }} aria-invalid={chinaCents === null}/></label></div>
      <Button type="button" size="sm" variant="ghost" disabled={busy || selectedQuantity === 0} onClick={useFullAmounts}>Usar valor integral</Button>
      <div className="refund-preview"><span>A receber <strong>{productCents === null || chinaCents === null ? "Confira os valores" : formatMoney(productCents + chinaCents)}</strong></span><span>Taxa dos produtos <strong>{formatMoney(item.calculation?.components.find(component => component.name === "Taxa dos produtos")?.amountCents ?? 0)} preservada</strong></span></div>
      {paidAffected.length > 0 && <label className="refund-confirm-reset"><input type="checkbox" checked={confirmReset} onChange={event => setConfirmReset(event.target.checked)}/><span>Confirmo voltar {paidAffected.length} encargo(s) dos pacotes afetados para pendente. O pagamento dos produtos permanece pago.</span></label>}
      {emptiedPaidPackage && <p className="error" role="alert">Um pacote ficaria vazio com frete ou Receita positiva. Resolva esse encargo antes de cancelar as unidades.</p>}
      <label>Motivo<textarea required minLength={1} maxLength={1000} rows={3} value={reason} onChange={event => setReason(event.target.value)}/></label>
      <div className="form-actions"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy || !valid}>{busy ? "Salvando…" : "Registrar solicitação"}</Button></div>
    </form>
  </Surface>;
}

function RefundActionSurface({ refund, item, mode, detail, locked, busy, onClose, onSubmit }: { refund: Refund; item: Item; mode: "receive" | "correct" | "void" | "edit"; detail: Detail; locked: boolean; busy: boolean; onClose: () => void; onSubmit: (operation: string, input: unknown) => Promise<void> }) {
  const initialProduct = refund.status === "received" ? refund.receivedProductCents ?? 0 : refund.requestedProductCents;
  const initialChina = refund.status === "received" ? refund.receivedChinaCents ?? 0 : refund.requestedChinaCents;
  const [product, setProduct] = useState(formatInput(initialProduct)), [china, setChina] = useState(formatInput(initialChina));
  const [reason, setReason] = useState(mode === "edit" ? refund.reason : ""), [confirmed, setConfirmed] = useState(false);
  const productCents = parseCostCents(product), chinaCents = parseCostCents(china);
  const eventCount = refund.events.length;
  const label = mode === "receive" ? "Registrar recebimento" : mode === "correct" ? "Corrigir recebimento" : mode === "void" ? "Anular reembolso" : "Editar solicitação";
  const title = mode === "void" ? "Anular registro de reembolso?" : label;
  const isZeroCredit = productCents === 0 && chinaCents === 0;
  const canSave = !locked && (mode === "receive" || reason.trim().length > 0) && (mode === "void" ? confirmed : productCents !== null && chinaCents !== null && (productCents + chinaCents > 0 || (mode === "receive" || mode === "correct") && confirmed));

  return <Surface sheet open title={title} description={`${itemLabel(item)} · ${refund.quantity} unidades canceladas. Solicitação ${formatMoney(refund.requestedProductCents + refund.requestedChinaCents)}. ${eventCount} evento(s) auditável(is).`} onOpenChange={open => { if (!open && !busy) onClose(); }}>
    {mode === "void" ? <div className="refund-impact"><p>{refund.status === "received" ? `O crédito recebido de ${formatMoney((refund.receivedProductCents ?? 0) + (refund.receivedChinaCents ?? 0))} voltará ao custo.` : "O valor solicitado deixará de aparecer como A receber."}</p><p>{refund.quantity} unidades ficarão sem pacote e precisarão ser organizadas novamente. Pacotes enviados não serão restaurados.</p><label className="refund-confirm-reset"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>Confirmo este impacto.</span></label></div> : <>
      {(mode === "receive" || mode === "correct") && <div className="refund-money-fields"><label>{mode === "receive" ? "Produto recebido (R$)" : "Novo valor recebido do produto (R$)"}<input autoFocus required inputMode="decimal" value={product} onChange={event => setProduct(event.target.value)} aria-invalid={productCents === null}/></label><label>{mode === "receive" ? "Frete China recebido (R$)" : "Novo valor recebido do frete China (R$)"}<input required inputMode="decimal" value={china} onChange={event => setChina(event.target.value)} aria-invalid={chinaCents === null}/></label></div>}
      {mode === "edit" && <div className="refund-money-fields"><label>Valor solicitado do produto (R$)<input autoFocus required inputMode="decimal" value={product} onChange={event => setProduct(event.target.value)} aria-invalid={productCents === null}/></label><label>Valor solicitado do frete China (R$)<input required inputMode="decimal" value={china} onChange={event => setChina(event.target.value)} aria-invalid={chinaCents === null}/></label></div>}
      {mode !== "edit" && <div className="refund-preview"><span>Solicitado <strong>{formatMoney(refund.requestedProductCents + refund.requestedChinaCents)}</strong></span><span>Recebido após a ação <strong>{productCents === null || chinaCents === null ? "Confira os valores" : formatMoney(productCents + chinaCents)}</strong></span><span>Taxa dos produtos <strong>Preservada</strong></span></div>}
      {(mode === "receive" || mode === "correct") && isZeroCredit && <label className="refund-confirm-reset"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>{mode === "receive" ? "Confirmo recebido zero: não haverá crédito e o custo permanecerá integral." : "Confirmo zerar o crédito recebido: ele será removido e o custo voltará a ficar integral."}</span></label>}
    </>}
    <label>{mode === "edit" ? "Motivo da alteração" : mode === "correct" ? "Motivo da correção" : mode === "void" ? "Motivo da anulação" : "Observação (opcional)"}<textarea required={mode !== "receive"} maxLength={1000} rows={3} value={reason} onChange={event => setReason(event.target.value)}/></label>
    <details className="refund-events"><summary>Histórico deste reembolso · {refund.events.length} eventos</summary>{refund.events.map(event => <p key={event.id}><strong>{event.eventType}</strong> · {event.actorName} · {new Date(event.createdAt).toLocaleString("pt-BR")} {event.reason ? `· ${event.reason}` : ""}</p>)}</details>
    <div className="form-actions"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button><Button type="button" variant={mode === "void" ? "destructive" : "default"} disabled={busy || !canSave} onClick={() => {
      const base = { expectedRevision: detail.tracking.revision };
      if (mode === "void") void onSubmit("refund.void", { ...base, reason, confirmed: true });
      else if (mode === "edit" && productCents !== null && chinaCents !== null) void onSubmit("refund.update", { ...base, requestedProductCents: productCents, requestedChinaCents: chinaCents, reason });
      else if (mode === "correct" && productCents !== null && chinaCents !== null) void onSubmit("refund.correct", { ...base, receivedProductCents: productCents, receivedChinaCents: chinaCents, reason, confirmed: true });
      else if (mode === "receive" && productCents !== null && chinaCents !== null) void onSubmit("refund.receive", { ...base, receivedProductCents: productCents, receivedChinaCents: chinaCents, confirmed: true });
    }}>{busy ? "Salvando…" : mode === "void" ? "Confirmar anulação" : label}</Button></div>
    {locked && <p className="muted">Reabra os custos com motivo antes de alterar este acompanhamento.</p>}
  </Surface>;
}
