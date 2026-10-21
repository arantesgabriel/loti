"use client";

import { Fragment, useId, useState } from "react";
import { Box, ChevronDown, CircleCheck, CircleX, Clock3, Info, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { ProductCategoryMarker } from "@/components/shared";
import { QcGalleryButton } from "@/components/qc/qc-components";
import type { CostTrackingView } from "@/lib/domain/package-cost-reading";
import { formatMoney } from "@/lib/domain/money";
import { formatCnyMinor } from "@/lib/domain/financial-money";
import { refundUnitRangeCapacityCents } from "@/lib/domain/refund-unit-capacity";
import { parseCostCents } from "./package-cost-client";

type Detail = CostTrackingView;
type Refund = Detail["refunds"][number];
type Item = Detail["items"][number];
type DisplayItem = Detail["financialDisplay"]["items"][number];
type RefundCapacity = Detail["financialDisplay"]["refundsById"][string];
type RefundItem = {
  id: string;
  origin: "purchase" | "additional";
  original: { id: string; name: string; variant: string | null; visualKey: string; quantity: number };
  calculation: Item["calculation"];
  refunds: Refund[];
  display: DisplayItem;
  productTotalCents: number | null;
  chinaTotalCents: number | null;
  nativeProductCnyMinor?: number;
  nativeChinaCnyMinor?: number;
  legacyItem: Item | null;
};
type RefundGroup = Detail["financialDisplay"]["refundGroups"][number] & {
  item: RefundItem | undefined;
  refunds: Refund[];
  display: DisplayItem;
};
type Mutate = (operation: string, rest: Record<string, unknown>) => Promise<boolean>;
const formatInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const itemLabel = (item: RefundItem) => `${item.original.name}${item.original.variant ? ` · ${item.original.variant}` : ""}`;
const eventCountLabel = (count: number) => `${count} ${count === 1 ? "evento" : "eventos"}`;
function itemUnitsSummary(item: RefundItem) {
  const purchased = item.original.quantity;
  const cancelled = item.calculation?.cancelledQuantity ?? 0;
  const shipping = item.calculation?.shippingQuantity ?? purchased;
  return `${purchased} ${purchased === 1 ? "unidade comprada" : "unidades compradas"} · ${cancelled} ${cancelled === 1 ? "unidade cancelada" : "unidades canceladas"} · ${shipping} ${shipping === 1 ? "unidade enviável" : "unidades enviáveis"}`;
}

function RefundQcIdentity({ purchaseId, itemId, itemName, visualKey, subtitle }: {
  purchaseId: string; itemId: string; itemName: string; visualKey: string; subtitle: string;
}) {
  return <QcGalleryButton
    purchaseId={purchaseId}
    itemId={itemId}
    itemName={itemName}
    canManageHere
    costThumbnails="desktop"
    costIdentity={{
      marker: <ProductCategoryMarker visualKey={visualKey}/>,
      label: <span className="cost-product-identity-text"><strong>{itemName}</strong><small>{subtitle}</small></span>,
    }}
  />;
}

function firstAvailableUnit(item: RefundItem, quantity: number) {
  let start = 0;
  for (const refund of item.refunds.filter(row => row.status !== "voided").sort((a, b) => a.unitStart - b.unitStart)) {
    if (start + quantity <= refund.unitStart) return start;
    start = Math.max(start, refund.unitStart + refund.quantity);
  }
  return start;
}

function fullAmounts(item: RefundItem, quantity: number) {
  const start = firstAvailableUnit(item, quantity);
  return {
    product: item.productTotalCents === null ? 0 : refundUnitRangeCapacityCents(item.productTotalCents, item.original.quantity, start, quantity),
    china: item.chinaTotalCents === null ? 0 : refundUnitRangeCapacityCents(item.chinaTotalCents, item.original.quantity, start, quantity),
    nativeProduct: refundUnitRangeCapacityCents(item.nativeProductCnyMinor ?? 0, item.original.quantity, start, quantity),
    nativeChina: refundUnitRangeCapacityCents(item.nativeChinaCnyMinor ?? 0, item.original.quantity, start, quantity),
    fee: item.display.remaining.productFee.finalCents === null ? null : refundUnitRangeCapacityCents(item.display.remaining.productFee.finalCents + (item.display.cancelled?.productFeeCents ?? 0), item.original.quantity, start, quantity),
  };
}

export function RefundsSection({ detail, locked, busy, requestItemId, onRequestClose, onDetails, mutate }: {
  detail: Detail; locked: boolean; busy: boolean; requestItemId: string | null; onRequestClose: () => void; onDetails: (itemId: string) => void; mutate: Mutate;
}) {
  const [activeRefundId, setActiveRefundId] = useState<string | null>(null);
  const [mode, setMode] = useState<"receive" | "correct" | "void" | "edit">("receive");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const displayById = new Map(detail.financialDisplay.items.map(item => [item.costItemId, item]));
  const totalBase = (display: DisplayItem, key: "product" | "china") => {
    const remaining = display.remaining[key].finalCents;
    return remaining === null ? null : remaining + (display.cancelled?.[key === "product" ? "productCents" : "chinaCents"] ?? 0);
  };
  const refundItems: RefundItem[] = [
    ...detail.items.map(item => { const display = displayById.get(item.id)!; return { id: item.id, origin: "purchase" as const, original: item.original, calculation: item.calculation, refunds: item.refunds,
      display, productTotalCents: totalBase(display, "product"), chinaTotalCents: totalBase(display, "china"), legacyItem: item }; }),
    ...detail.productOrders.filter(order => order.kind === "additional" && order.state === "recorded").flatMap(order => order.items.flatMap(row => row.item ? [{
      id: row.cost.id, origin: "additional" as const, original: { id: row.item.id, name: row.item.name, variant: row.item.variant, visualKey: row.item.visualKey, quantity: row.item.quantity },
      calculation: row.calculation, refunds: row.refunds,
      display: displayById.get(row.cost.id)!,
      productTotalCents: totalBase(displayById.get(row.cost.id)!, "product"),
      chinaTotalCents: totalBase(displayById.get(row.cost.id)!, "china"),
      legacyItem: null,
      nativeProductCnyMinor: row.cost.nativeProductCnyMinor ?? 0, nativeChinaCnyMinor: row.cost.nativeChinaCnyMinor ?? 0,
    }] : [])),
  ];
  const itemByCostId = new Map(refundItems.map(item => [item.id, item]));
  const activeRefund = detail.refunds.find(refund => refund.id === activeRefundId) ?? null;
  const requestItem = requestItemId ? itemByCostId.get(requestItemId) ?? null : null;
  const requested = detail.refunds.filter(refund => refund.status === "requested");
  const voided = detail.refunds.filter(refund => refund.status === "voided");
  const groups: RefundGroup[] = detail.financialDisplay.refundGroups.map(group => ({
    ...group,
    item: itemByCostId.get(group.costItemId),
    refunds: group.activeRefundIds.map(id => detail.refunds.find(refund => refund.id === id)).filter((refund): refund is Refund => !!refund),
    display: displayById.get(group.costItemId)!,
  }));
  const cancelledUnits = groups.reduce((sum, group) => sum + group.cancelledQuantity, 0);
  const retainedTotal = groups.reduce((sum, group) => sum + group.retainedCents, 0);
  const hubbuyReceipts = detail.refunds.filter(refund => refund.status === "received" && refund.refundDestination === "hubbuy");
  const hubbuyReceivedCny = hubbuyReceipts.reduce((sum, refund) => sum + (refund.receivedProductCnyMinor ?? 0) + (refund.receivedChinaCnyMinor ?? 0), 0);
  const hubbuyReceivedCents = hubbuyReceipts.reduce((sum, refund) => sum + (refund.receivedProductCents ?? 0) + (refund.receivedChinaCents ?? 0), 0);

  function openRefund(refund: Refund, nextMode: typeof mode) { setActiveRefundId(refund.id); setMode(nextMode); }
  async function submit(operation: string, refundId: string | undefined, input: unknown) {
    const ok = await mutate(operation, { ...(refundId ? { refundId } : {}), input });
    if (ok) { setActiveRefundId(null); onRequestClose(); }
  }

  return <>
    {detail.refunds.length > 0 && <div className="cost-section-content"><section className="refunds-section" aria-labelledby="refunds-title" data-cost-target="refunds-section" tabIndex={-1}>
      {hubbuyReceipts.length > 0 && <aside className="cost-hubbuy-credit" aria-label="Crédito recebido na HubBuy"><span className="cost-hubbuy-credit-icon" aria-hidden="true">↗</span><div><strong>Crédito de reembolso na HubBuy</strong><p>Recebimento registrado em saldo CNY na conta HubBuy.</p><small>O saldo pode ser usado depois; não é abatido automaticamente do pacote.</small></div><span className="cost-payment-register-status paid">Recebimento registrado</span><strong>{formatCnyMinor(hubbuyReceivedCny)} · {formatMoney(hubbuyReceivedCents)}</strong></aside>}
      <header className="refunds-heading"><div><h2 id="refunds-title">Produtos reembolsados</h2><p>{groups.length > 0 ? `${groups.length} ${groups.length === 1 ? "produto" : "produtos"} · ${cancelledUnits} ${cancelledUnits === 1 ? "unidade cancelada" : "unidades canceladas"}` : "Nenhum reembolso ativo."}</p></div>
        <div className="refunds-total"><span>Total recebido</span><strong>{formatMoney(detail.refundsSummary.receivedCents)}</strong>{requested.length > 0 && <small>A receber: {formatMoney(detail.refundsSummary.requestedCents)}</small>}{groups.length > 0 && <small>{groups.some(group => group.awaitingReceipt) ? "Custos mantidos até agora" : "Custos mantidos"}: {formatMoney(retainedTotal)}</small>}</div>
      </header>
      {groups.length > 0 && <>
        <div className="refunds-table-wrap"><table className="refunds-table"><caption className="sr-only">Reembolsos agrupados por produto</caption><thead><tr><th>Produto</th><th>Qtd.</th><th>Valor do item</th><th>Custo mantido</th><th>Recebido</th><th>Situação e detalhes</th></tr></thead><tbody>
          {groups.map(group => { const open = !!expandedGroups[group.costItemId], status = refundGroupStatus(group.refunds); return <Fragment key={group.costItemId}>
            <tr><td>{group.item ? <RefundQcIdentity purchaseId={detail.purchase.id} itemId={`${group.item.origin}:${group.item.original.id}`} itemName={itemLabel(group.item)} visualKey={group.item.original.visualKey} subtitle={group.refunds.flatMap(refund => refund.participants.map(person => person.name)).filter((name, index, all) => all.indexOf(name) === index).join(" · ")}/> : <strong>Produto</strong>}</td>
              <td>{group.cancelledQuantity}</td>
              <td><strong>{formatMoney(group.display.cancelled?.productCents ?? 0)}</strong><small>Produto cancelado</small></td>
              <td><strong>{formatMoney(group.retainedCents)}</strong><small>{group.awaitingReceipt ? "Mantido até agora" : "Não devolvido"}</small></td>
              <td><div className="refund-group-amounts">{group.refunds.some(refund => refund.status === "received") && <span><strong>{formatMoney(group.receivedCents)}</strong></span>}{group.requestedCents > 0 && <span>A receber <strong>{formatMoney(group.requestedCents)}</strong></span>}</div></td>
              <td><span className={`refund-group-status ${status.kind}`}>{status.label}</span><Button className="refund-details-toggle refund-group-toggle" size="sm" variant="outline" data-cost-target={`refund-group-${group.costItemId}`} aria-expanded={open} aria-controls={`refund-group-panel-desktop-${group.costItemId}`} onClick={() => setExpandedGroups(current => ({ ...current, [group.costItemId]: !current[group.costItemId] }))}>{open ? "Fechar composição" : "Ver composição"}<ChevronDown size={16} aria-hidden="true"/></Button></td>
            </tr>
            {open && <tr className="refund-group-details-row"><td colSpan={6}><RefundGroupDetails id={`refund-group-panel-desktop-${group.costItemId}`} group={group} detail={detail} item={group.item} locked={locked} busy={busy} onDetails={onDetails} onAction={openRefund}/></td></tr>}
          </Fragment>; })}
        </tbody></table></div>
        <div className="refunds-groups-mobile">{groups.map(group => { const open = !!expandedGroups[group.costItemId], status = refundGroupStatus(group.refunds); return <article className="refund-group-mobile" key={group.costItemId}>
          <div className="refund-group-mobile-heading">{group.item ? <RefundQcIdentity purchaseId={detail.purchase.id} itemId={`${group.item.origin}:${group.item.original.id}`} itemName={itemLabel(group.item)} visualKey={group.item.original.visualKey} subtitle={`${group.cancelledQuantity} ${group.cancelledQuantity === 1 ? "unidade cancelada" : "unidades canceladas"} · ${status.label}`}/> : <span className="refund-group-mobile-name"><strong>Produto</strong></span>}<strong>{formatMoney(group.retainedCents)}</strong></div>
          <div className="refund-group-mobile-amounts">{group.refunds.some(refund => refund.status === "received") && <span>Recebido {formatMoney(group.receivedCents)}</span>}{group.requestedCents > 0 && <span>A receber {formatMoney(group.requestedCents)}</span>}</div>
          <Button className="refund-details-toggle refund-group-toggle" size="sm" variant="outline" data-cost-target={`refund-group-${group.costItemId}`} aria-expanded={open} aria-controls={`refund-group-panel-mobile-${group.costItemId}`} onClick={() => setExpandedGroups(current => ({ ...current, [group.costItemId]: !current[group.costItemId] }))}>{open ? "Fechar composição" : "Ver composição"}<ChevronDown size={16} aria-hidden="true"/></Button>
          {open && <RefundGroupDetails id={`refund-group-panel-mobile-${group.costItemId}`} group={group} detail={detail} item={group.item} locked={locked} busy={busy} onDetails={onDetails} onAction={openRefund}/>}</article>; })}</div>
      </>}
      {voided.length > 0 && <details className="refunds-voided"><summary>Histórico anulado · {voided.length}</summary>{voided.map(refund => <RefundRow key={refund.id} refund={refund} detail={detail} item={itemByCostId.get(refund.costItemId)} capacity={detail.financialDisplay.refundsById[refund.id]} locked={locked} busy={busy} onDetails={onDetails} onAction={openRefund} />)}</details>}
      <p className="refunds-financial-note">Só recebimentos confirmados reduzem o custo. Taxas e valores não devolvidos continuam contabilizados.</p>
    </section></div>}
    {requestItem && <RefundRequestSurface item={requestItem} detail={detail} busy={busy} onClose={onRequestClose} onSubmit={input => submit("refund.request", undefined, input)} />}
    {activeRefund && itemByCostId.get(activeRefund.costItemId) && <RefundActionSurface refund={activeRefund} item={itemByCostId.get(activeRefund.costItemId)!} mode={mode} detail={detail} locked={locked} busy={busy} onClose={() => setActiveRefundId(null)} onSubmit={(operation, input) => submit(operation, activeRefund.id, input)} />}
  </>;
}

function refundGroupStatus(refunds: Refund[]) {
  const received = refunds.some(refund => refund.status === "received");
  const requested = refunds.some(refund => refund.status === "requested");
  if (received && requested) return { label: "Parte recebida · parte a receber", kind: "partial" };
  if (requested) return { label: "Aguardando reembolso", kind: "pending" };
  return { label: refunds.filter(refund => refund.status === "received").length > 1 ? "Recebimentos registrados" : "Recebimento registrado", kind: "received" };
}

function RefundGroupDetails({ id, group, detail, item, locked, busy, onDetails, onAction }: {
  id: string; group: RefundGroup; detail: Detail; item?: RefundItem; locked: boolean; busy: boolean;
  onDetails: (itemId: string) => void;
  onAction: RefundRowProps["onAction"];
}) {
  const costs = group.display.cancelled;
  if (!costs) return <div className="refund-group-composition" id={id}><p className="muted">A composição histórica deste item não está disponível.</p></div>;
  return <div className="refund-group-composition" id={id}>
    <div className="refund-group-composition-heading"><strong>Composição do reembolso</strong><span>{group.cancelledQuantity} {group.cancelledQuantity === 1 ? "unidade cancelada" : "unidades canceladas"}</span></div>
    <dl><div><dt>Produto das unidades canceladas</dt><dd>{formatMoney(costs.productCents)}</dd></div><div><dt>Frete China dessas unidades</dt><dd>{formatMoney(costs.chinaCents)}</dd></div><div><dt>Taxa do pagamento dessas unidades</dt><dd>{formatMoney(costs.productFeeCents)}</dd></div><div><dt>Recebido de volta</dt><dd>−{formatMoney(costs.receivedCents)}</dd></div>{costs.requestedCents > 0 && <div><dt>A receber, em separado</dt><dd>{formatMoney(costs.requestedCents)}</dd></div>}<div className="refund-group-retained"><dt>{costs.awaitingReceipt ? "Custo mantido até agora" : "Custo não devolvido"}</dt><dd>{formatMoney(costs.retainedCents)}</dd></div></dl>
    <p className="muted">Os encargos de pacote continuam nas unidades restantes. A composição acima mostra somente produto, frete China e taxa das unidades canceladas.</p>
    <div className="refund-group-records"><div className="refunds-list">{group.refunds.map(refund => <RefundRow grouped={group.refunds.length === 1 ? "single" : "multiple"} key={refund.id} refund={refund} detail={detail} item={item} capacity={detail.financialDisplay.refundsById[refund.id]} locked={locked} busy={busy} onDetails={onDetails} onAction={onAction}/>)}</div></div>
  </div>;
}

type RefundRowProps = {
  grouped?: "single" | "multiple"; refund: Refund; detail: Detail; item?: RefundItem; capacity?: RefundCapacity; locked: boolean; busy: boolean;
  onDetails: (itemId: string) => void;
  onAction: (refund: Refund, mode: "receive" | "correct" | "void" | "edit") => void;
};

function RefundRow({ grouped, refund, detail, item, capacity, locked, busy, onDetails, onAction }: RefundRowProps) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const name = item ? itemLabel(item) : "Produto";
  const received = refund.status === "received";
  const nativeRequested = !received && refund.requestedProductCnyMinor !== null ? (refund.requestedProductCnyMinor ?? 0) + (refund.requestedChinaCnyMinor ?? 0) : null;
  const nativeReceived = (refund.receivedProductCnyMinor ?? 0) + (refund.receivedChinaCnyMinor ?? 0);
  const amount = received ? (refund.receivedProductCents ?? 0) + (refund.receivedChinaCents ?? 0) : refund.requestedProductCents + refund.requestedChinaCents;
  const date = new Date(refund.status === "voided" ? refund.voidedAt ?? refund.requestedAt : received ? refund.receivedAt ?? refund.requestedAt : refund.requestedAt);
  const StatusIcon = received ? CircleCheck : refund.status === "requested" ? Clock3 : CircleX;
  const paymentMethod = refund.originalPaymentMethod === "pix" ? "Pix" : refund.originalPaymentMethod === "card" ? "Cartão" : null;
  if (grouped) return <article className={`refund-row refund-record-flat status-${refund.status}`} id={`refund-${refund.id}`}>
    <div className="refund-record-context"><span className="refund-status"><StatusIcon size={14} aria-hidden="true"/>{received ? "Recebimento registrado" : "Aguardando reembolso"}</span><time dateTime={date.toISOString()}>{date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</time>{paymentMethod && <span>Pagamento original · {paymentMethod}</span>}{grouped === "multiple" && <strong>{formatMoney(amount)}{nativeRequested !== null && <small>{formatCnyMinor(nativeRequested)} solicitado</small>}</strong>}</div>
    {refund.reason && <p className="refund-record-reason">{refund.reason}</p>}
    <RefundDetails refund={refund} detail={detail} capacity={capacity} compact={grouped}/>
    {!locked && <div className="refund-row-actions">
      {refund.status === "requested" && <><Button size="sm" disabled={busy} onClick={() => onAction(refund, "receive")}>Registrar recebimento</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => onAction(refund, "edit")}>Editar solicitação</Button></>}
      {received && <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction(refund, "correct")}>Corrigir valores recebidos</Button>}
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction(refund, "void")}>Anular registro</Button>
    </div>}
  </article>;
  return <article className={`refund-row status-${refund.status}`} id={`refund-${refund.id}`}>
    <div className="refund-row-summary">
      <div className="refund-product">
        {item ? <RefundQcIdentity purchaseId={detail.purchase.id} itemId={`${item.origin}:${item.original.id}`} itemName={name} visualKey={item.original.visualKey} subtitle={refund.participants.map(person => person.name).join(" · ")}/> : <div><h3>{name}</h3><p>{refund.participants.map(person => person.name).join(" · ")}</p></div>}
      </div>
      <div className="refund-context"><span className="refund-status"><StatusIcon size={14} aria-hidden="true"/>{received ? amount === 0 && nativeReceived === 0 ? "Recebimento encerrado sem devolução" : "Recebimento registrado" : refund.status === "requested" ? "Aguardando reembolso" : "Anulado"}</span><p><time dateTime={date.toISOString()}>{date.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" }).replaceAll(" de ", " ")}</time><span aria-hidden="true"> · </span>{refund.status === "voided" ? refund.voidReason : refund.reason}</p></div>
      <div className="refund-amount"><strong>{refund.status === "voided" ? "Sem crédito ativo" : nativeRequested !== null ? `${formatCnyMinor(nativeRequested)} · ${formatMoney(amount)}` : nativeReceived > 0 ? `${formatCnyMinor(nativeReceived)} · ${formatMoney(amount)}` : formatMoney(amount)}</strong><small>{refund.status === "requested" ? "Valor solicitado" : paymentMethod ? `Pagamento original · ${paymentMethod}` : ""}</small></div>
      <Button className="refund-details-toggle refund-record-toggle" size="sm" variant="outline" aria-expanded={expanded} aria-controls={panelId} aria-label={`${expanded ? "Recolher detalhes" : "Ver detalhes"} de ${name}`} onClick={() => setExpanded(value => !value)}>{expanded ? "Recolher detalhes" : "Ver detalhes"}<ChevronDown size={16} aria-hidden="true"/></Button>
    </div>
    <div className="refund-details-panel" id={panelId} inert={!expanded} aria-hidden={!expanded} data-expanded={expanded}><div>
      <RefundDetails refund={refund} capacity={capacity} detail={detail}/>
      <div className="refund-row-actions">
        {item?.legacyItem && <Button size="sm" variant="ghost" onClick={() => onDetails(item.legacyItem!.id)}>Ver composição</Button>}
        {!locked && <>
          {refund.status === "requested" && <><Button size="sm" disabled={busy} onClick={() => onAction(refund, "receive")}>Registrar recebimento</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => onAction(refund, "edit")}>Editar solicitação</Button></>}
          {received && <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction(refund, "correct")}>Corrigir valores recebidos</Button>}
          {refund.status !== "voided" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction(refund, "void")}>Anular registro</Button>}
        </>}
      </div>
    </div></div>
  </article>;
}

function RefundDetails({ refund, capacity, detail, compact }: { refund: Refund; capacity?: RefundCapacity; detail: Detail; compact?: "single" | "multiple" }) {
  const received = refund.status === "received";
  const accountLabel = detail.hubbuyAccounts.find(account => account.id === refund.hubbuyAccountId)?.label ?? "Conta removida";
  return <div className="refund-details">
    <dl>
      {refund.requestedProductCnyMinor !== null && <div><dt>Valor nativo solicitado</dt><dd>{formatCnyMinor((refund.requestedProductCnyMinor ?? 0) + (refund.requestedChinaCnyMinor ?? 0))} · base {formatMoney(refund.requestedProductCents + refund.requestedChinaCents)}</dd></div>}
      {compact !== "single" && <><div><dt>Unidades</dt><dd>{refund.quantity} {refund.quantity === 1 ? "unidade cancelada" : "unidades canceladas"}{refund.status === "voided" ? " · cancelamento anulado" : ""}</dd></div>
      <div><dt>Base original da faixa · produto</dt><dd>{capacity?.productCapacityCents == null ? "Não disponível no registro histórico" : formatMoney(capacity.productCapacityCents)}</dd></div>
      <div><dt>Base original da faixa · frete China</dt><dd>{capacity?.chinaCapacityCents == null ? "Não disponível no registro histórico" : formatMoney(capacity.chinaCapacityCents)}</dd></div>
      <div><dt>Taxa histórica das unidades</dt><dd>{capacity?.productFeeCapacityCents == null ? "Não disponível no registro histórico" : `${formatMoney(capacity.productFeeCapacityCents)} · preservada`}</dd></div>
      </>}{received && (!compact || refund.requestedProductCents + refund.requestedChinaCents !== (refund.receivedProductCents ?? 0) + (refund.receivedChinaCents ?? 0)) && <div><dt>Valor solicitado</dt><dd>{formatMoney(refund.requestedProductCents + refund.requestedChinaCents)}</dd></div>}
      {(compact !== "single" || (received ? refund.receivedChinaCents ?? 0 : refund.requestedChinaCents) > 0) && <><div><dt>{received ? "Produto recebido" : "Produto solicitado"}</dt><dd>{formatMoney(received ? refund.receivedProductCents ?? 0 : refund.requestedProductCents)}</dd></div>
      <div><dt>{received ? "Frete China recebido" : "Frete China solicitado"}</dt><dd>{formatMoney(received ? refund.receivedChinaCents ?? 0 : refund.requestedChinaCents)}</dd></div>
      </>}{received && <div><dt>Destino</dt><dd>{refund.refundDestination === "hubbuy" ? `Conta HubBuy · ${accountLabel}` : "Fora da HubBuy"}</dd></div>}
      {received && refund.refundDestination === "hubbuy" && <div><dt>Crédito CNY confirmado</dt><dd>{formatCnyMinor((refund.receivedProductCnyMinor ?? 0) + (refund.receivedChinaCnyMinor ?? 0))}</dd></div>}
    </dl>
    {!compact && <p className="muted">O custo mantido e a taxa aparecem uma vez na composição agrupada deste produto.</p>}
    <details className="refund-events"><summary>Histórico deste reembolso · {eventCountLabel(refund.events.length)}</summary>{refund.events.map(event => <p key={event.id}><strong>{{ requested: "Solicitação", request_updated: "Solicitação editada", received: "Recebimento", receipt_corrected: "Recebimento corrigido", voided: "Anulação" }[event.eventType]}</strong> · {event.actorName} · {new Date(event.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}{event.reason ? ` · ${event.reason}` : ""}</p>)}</details>
  </div>;
}

function RefundRequestSurface({ item, detail, busy, onClose, onSubmit }: { item: RefundItem; detail: Detail; busy: boolean; onClose: () => void; onSubmit: (input: unknown) => Promise<void> }) {
  const eligiblePackages = detail.packages.filter(pkg => pkg.logisticsStatus === "preparing" && pkg.contentSealSource === null && pkg.contentSealedAt === null && pkg.items.some(row => row.costItemId === item.id && row.quantity > 0));
  const assigned = item.calculation?.allocatedQuantity ?? 0;
  const unassignedAvailable = Math.max(0, (item.calculation?.shippingQuantity ?? 0) - assigned);
  const defaultByPackage = Object.fromEntries(eligiblePackages.map(pkg => [pkg.id, eligiblePackages.length === 1 ? pkg.items.find(row => row.costItemId === item.id)?.quantity ?? 0 : 0]));
  const [packageQuantities, setPackageQuantities] = useState<Record<string, number>>(defaultByPackage);
  const [unassignedQuantity, setUnassignedQuantity] = useState(eligiblePackages.length === 0 ? unassignedAvailable : 0);
  const selectedQuantity = Object.values(packageQuantities).reduce((sum, quantity) => sum + quantity, 0) + unassignedQuantity;
  const initialAmounts = fullAmounts(item, selectedQuantity);
  const selectedAmounts = fullAmounts(item, selectedQuantity);
  const [requestedProduct, setRequestedProduct] = useState(formatInput(initialAmounts.product));
  const [requestedChina, setRequestedChina] = useState(formatInput(initialAmounts.china));
  const [requestedProductCny, setRequestedProductCny] = useState(formatInput(initialAmounts.nativeProduct));
  const [requestedChinaCny, setRequestedChinaCny] = useState(formatInput(initialAmounts.nativeChina));
  const nativeOnly = item.origin === "additional" && selectedAmounts.product + selectedAmounts.china === 0 && selectedAmounts.nativeProduct + selectedAmounts.nativeChina > 0;
  const requestedProductCnyMinor = parseCostCents(requestedProductCny), requestedChinaCnyMinor = parseCostCents(requestedChinaCny);
  const [manualProduct, setManualProduct] = useState(false), [manualChina, setManualChina] = useState(false);
  const [reason, setReason] = useState("");
  const paidAffected = eligiblePackages.filter(pkg => (packageQuantities[pkg.id] ?? 0) > 0).flatMap(pkg => [pkg.brazilFreightCharge, pkg.customsCharge]).filter(charge => charge?.paymentStatus === "paid");
  const emptiedPaidPackage = eligiblePackages.some(pkg => {
    const removed = packageQuantities[pkg.id] ?? 0;
    const remaining = pkg.calculation?.unitCount ?? 0;
    return removed === remaining && [pkg.brazilFreightCharge, pkg.customsCharge].some(charge => charge?.valueState === "known" && (charge.amountCents ?? 0) > 0);
  });
  const productCents = parseCostCents(requestedProduct), chinaCents = parseCostCents(requestedChina);
  const removalTotal = Object.values(packageQuantities).reduce((sum, quantity) => sum + quantity, 0);
  const valid = selectedQuantity > 0 && removalTotal + unassignedQuantity === selectedQuantity && productCents !== null && chinaCents !== null && (productCents + chinaCents > 0 || nativeOnly && requestedProductCnyMinor !== null && requestedChinaCnyMinor !== null && requestedProductCnyMinor + requestedChinaCnyMinor > 0) && reason.trim().length > 0 && !emptiedPaidPackage;

  function updateQuantity(packageId: string, next: number) {
    const safe = Math.max(0, Math.min(next, eligiblePackages.find(pkg => pkg.id === packageId)?.items.find(row => row.costItemId === item.id)?.quantity ?? 0));
    setPackageQuantities(current => ({ ...current, [packageId]: safe }));
    const selected = Object.entries({ ...packageQuantities, [packageId]: safe }).reduce((sum, [, quantity]) => sum + quantity, 0) + unassignedQuantity;
    const amounts = fullAmounts(item, selected);
    setRequestedProductCny(formatInput(amounts.nativeProduct)); setRequestedChinaCny(formatInput(amounts.nativeChina));
    if (!manualProduct) setRequestedProduct(formatInput(amounts.product));
    if (!manualChina) setRequestedChina(formatInput(amounts.china));
  }

  function updateUnassigned(next: number) {
    const safe = Math.max(0, Math.min(next, unassignedAvailable));
    setUnassignedQuantity(safe);
    const selected = Object.values(packageQuantities).reduce((sum, quantity) => sum + quantity, 0) + safe;
    const amounts = fullAmounts(item, selected);
    setRequestedProductCny(formatInput(amounts.nativeProduct)); setRequestedChinaCny(formatInput(amounts.nativeChina));
    if (!manualProduct) setRequestedProduct(formatInput(amounts.product));
    if (!manualChina) setRequestedChina(formatInput(amounts.china));
  }

  function applyFullAmounts() { const amounts = fullAmounts(item, selectedQuantity); setManualProduct(false); setManualChina(false); setRequestedProduct(formatInput(amounts.product)); setRequestedChina(formatInput(amounts.china)); }

  return <Surface sheet open className="refund-request-sheet" title="Registrar reembolso" subtitle={item.original.name} description="Somente unidades ainda em preparação ou sem pacote podem ser canceladas. O status logístico é manual; confirme que as unidades não foram enviadas." onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <form onSubmit={event => { event.preventDefault(); if (!valid || productCents === null || chinaCents === null) return; void onSubmit({ expectedRevision: detail.tracking.revision, costItemId: item.id, quantity: selectedQuantity, requestedProductCents: productCents, requestedChinaCents: chinaCents, ...(nativeOnly ? { requestedProductCnyMinor, requestedChinaCnyMinor } : {}), reason, packageRemovals: eligiblePackages.map(pkg => ({ packageId: pkg.id, quantity: packageQuantities[pkg.id] ?? 0 })).filter(row => row.quantity > 0), unassignedQuantity }); }}>
      <p className="refund-request-context"><Box size={20} aria-hidden="true"/><span>{item.original.variant || "Sem variação"} · {itemUnitsSummary(item)}</span></p>
      <fieldset className="refund-request-units"><legend>Selecionar unidades</legend>
        <p className="refund-request-help">Escolha quantas unidades deseja retirar do estoque.</p>
        {eligiblePackages.map((pkg, index) => <RefundQuantityControl key={pkg.id} label={`${pkg.name} · em preparação`} inputLabel={`${pkg.name} unidades a cancelar`} autoFocus={index === 0} max={pkg.items.find(row => row.costItemId === item.id)?.quantity ?? 0} value={packageQuantities[pkg.id] ?? 0} onChange={next => updateQuantity(pkg.id, next)} busy={busy}/>)}
        {unassignedAvailable > 0 && <RefundQuantityControl label="Sem pacote" inputLabel="Unidades sem pacote a cancelar" autoFocus={eligiblePackages.length === 0} max={unassignedAvailable} value={unassignedQuantity} onChange={updateUnassigned} busy={busy}/>}
        <p className="refund-request-help">Quantidade selecionada: {selectedQuantity}</p>
      </fieldset>
      <section className="refund-request-values" aria-labelledby="refund-values-title">
        {nativeOnly && <><p className="muted">Estas unidades foram financiadas com base histórica R$0,00. Solicite o valor nativo sem criar custo em reais.</p><div className="refund-money-fields"><label>Produto solicitado (CNY)<input required inputMode="decimal" value={requestedProductCny} onChange={event => setRequestedProductCny(event.target.value)}/></label><label>Frete China solicitado (CNY)<input required inputMode="decimal" value={requestedChinaCny} onChange={event => setRequestedChinaCny(event.target.value)}/></label></div></>}
        <h3 id="refund-values-title">Valores</h3>
        <div className="refund-money-fields"><label>Valor do produto (R$)<input required inputMode="decimal" value={requestedProduct} onChange={event => { setManualProduct(true); setRequestedProduct(event.target.value); }} aria-invalid={productCents === null}/></label><label>Valor do frete China (R$)<input required inputMode="decimal" value={requestedChina} onChange={event => { setManualChina(true); setRequestedChina(event.target.value); }} aria-invalid={chinaCents === null}/></label></div>
        <div className="refund-request-full-amount"><button type="button" role="switch" aria-checked={!manualProduct && !manualChina} aria-label="Usar valor integral" aria-describedby="refund-full-amount-help" disabled={busy || selectedQuantity === 0} onClick={() => { if (manualProduct || manualChina) applyFullAmounts(); else { setManualProduct(true); setManualChina(true); } }}><span aria-hidden="true"/></button><span>Usar valor integral</span><Info size={16} aria-hidden="true"/></div>
        <p id="refund-full-amount-help" className="sr-only">Preenche os valores totais de produto e frete China das unidades selecionadas. Desative para manter valores manuais.</p>
      </section>
      <section className="refund-request-summary" aria-label="Resumo financeiro">
        <div className="refund-request-receivable"><div><h3>A receber</h3><p>Valor que será reembolsado ao comprador.</p></div><strong aria-live="polite">{productCents === null || chinaCents === null ? "Confira os valores" : nativeOnly && requestedProductCnyMinor !== null && requestedChinaCnyMinor !== null ? `${formatCnyMinor(requestedProductCnyMinor + requestedChinaCnyMinor)} · base R$0,00` : formatMoney(productCents + chinaCents)}</strong></div>
        <div className="refund-request-fee"><span>Taxa histórica destas unidades</span><span>{selectedAmounts.fee === null ? "Não disponível" : `${formatMoney(selectedAmounts.fee)} preservada`}</span></div>
      </section>
      {paidAffected.length > 0 && <p className="muted">Os encargos de pacote já pagos continuam pagos. O rateio será recalculado com as unidades remanescentes.</p>}
      {emptiedPaidPackage && <p className="error" role="alert">Um pacote ficaria vazio com frete ou Receita positiva. Resolva esse encargo antes de cancelar as unidades.</p>}
      <div className="refund-request-reason"><label htmlFor="refund-request-reason">Motivo</label><textarea id="refund-request-reason" required minLength={1} maxLength={1000} rows={3} placeholder="Vendedor não tem mais estoque" value={reason} aria-describedby="refund-reason-count" onChange={event => setReason(event.target.value)}/><span id="refund-reason-count">{reason.length}/1000</span></div>
      <div className="form-actions refund-request-actions"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy || !valid}>{busy ? "Salvando…" : "Registrar solicitação"}</Button></div>
    </form>
  </Surface>;
}

function RefundQuantityControl({ label, inputLabel, autoFocus, max, value, onChange, busy }: { label: string; inputLabel: string; autoFocus: boolean; max: number; value: number; onChange: (next: number) => void; busy: boolean }) {
  return <div className="refund-request-unit-row"><span>{label}</span><div className="refund-request-stepper">
    <Button type="button" variant="ghost" size="icon" aria-label={`Diminuir quantidade · ${label}`} disabled={busy || value <= 0} onClick={() => onChange(value - 1)}><Minus size={16} aria-hidden="true"/></Button>
    <input autoFocus={autoFocus} aria-label={inputLabel} type="number" min="0" max={max} value={value} onChange={event => onChange(Number(event.target.value) || 0)} disabled={busy}/>
    <Button type="button" variant="ghost" size="icon" aria-label={`Aumentar quantidade · ${label}`} disabled={busy || value >= max} onClick={() => onChange(value + 1)}><Plus size={16} aria-hidden="true"/></Button>
  </div></div>;
}

function RefundActionSurface({ refund, item, mode, detail, locked, busy, onClose, onSubmit }: { refund: Refund; item: RefundItem; mode: "receive" | "correct" | "void" | "edit"; detail: Detail; locked: boolean; busy: boolean; onClose: () => void; onSubmit: (operation: string, input: unknown) => Promise<void> }) {
  const initialProduct = refund.status === "received" ? refund.receivedProductCents ?? 0 : refund.requestedProductCents;
  const initialChina = refund.status === "received" ? refund.receivedChinaCents ?? 0 : refund.requestedChinaCents;
  const activeAccounts = detail.hubbuyAccounts.filter(account => account.status === "active");
  const emptyLegacyAccounts = detail.hubbuyAccounts.filter(account => account.status === "reconciling" && account.canActivateWithZero);
  const [product, setProduct] = useState(formatInput(initialProduct)), [china, setChina] = useState(formatInput(initialChina));
  const [destination, setDestination] = useState<"hubbuy" | "external">(refund.refundDestination ?? (refund.requestedProductCnyMinor !== null ? "hubbuy" : "external"));
  const [accountId, setAccountId] = useState(refund.hubbuyAccountId ?? activeAccounts[0]?.id ?? "");
  const [newAccountLabel, setNewAccountLabel] = useState("");
  const [confirmedNoPriorBalance, setConfirmedNoPriorBalance] = useState(false);
  const [productCny, setProductCny] = useState(formatInput(refund.receivedProductCnyMinor ?? refund.requestedProductCnyMinor ?? 0));
  const [chinaCny, setChinaCny] = useState(formatInput(refund.receivedChinaCnyMinor ?? refund.requestedChinaCnyMinor ?? 0));
  const [nativeEvidence, setNativeEvidence] = useState(refund.nativeEvidence ?? "");
  const [reason, setReason] = useState(mode === "edit" ? refund.reason : ""), [confirmed, setConfirmed] = useState(false);
  const productCents = parseCostCents(product), chinaCents = parseCostCents(china), productCnyMinor = parseCostCents(productCny), chinaCnyMinor = parseCostCents(chinaCny);
  const selectedAccount = detail.hubbuyAccounts.find(account => account.id === accountId);
  const createAccountInline = mode === "receive" && accountId === "__create__";
  const label = mode === "receive" ? "Registrar recebimento" : mode === "correct" ? "Corrigir recebimento" : mode === "void" ? "Anular reembolso" : "Editar solicitação";
  const title = mode === "void" ? "Anular reembolso?" : label;
  const description = mode === "receive" || mode === "correct"
    ? "Confirme os valores efetivamente recebidos. Só o crédito confirmado reduz o custo líquido."
    : mode === "edit"
      ? "Atualize os valores e o motivo da solicitação sem alterar o crédito recebido."
      : "O registro será anulado e as unidades ficarão sem pacote para nova organização.";
  const isZeroCredit = productCents === 0 && chinaCents === 0 && (destination === "external" || productCnyMinor === 0 && chinaCnyMinor === 0);
  const positiveCnyCredit = productCnyMinor !== null && chinaCnyMinor !== null && productCnyMinor + chinaCnyMinor > 0;
  const zeroReceipt = productCents === 0 && chinaCents === 0 && productCnyMinor === 0 && chinaCnyMinor === 0;
  const selectedExistingIsEligible = activeAccounts.some(account => account.id === accountId) || emptyLegacyAccounts.some(account => account.id === accountId);
  const hubbuyInputValid = mode === "edit" || destination === "external" || (productCnyMinor !== null && chinaCnyMinor !== null && nativeEvidence.trim().length >= 3 && (
    createAccountInline ? newAccountLabel.trim().length > 0 && positiveCnyCredit
      : (mode === "receive" ? selectedExistingIsEligible : activeAccounts.some(account => account.id === accountId))
        && (positiveCnyCredit || zeroReceipt && !selectedAccount?.canActivateWithZero && confirmed)
        && (selectedAccount?.canActivateWithZero ? mode === "receive" && positiveCnyCredit && confirmedNoPriorBalance : true)
  ));
  const canSave = !locked && (mode === "receive" || reason.trim().length > 0) && (mode === "void" ? confirmed : productCents !== null && chinaCents !== null && hubbuyInputValid && (productCents + chinaCents > 0 || (mode === "receive" || mode === "correct") && (destination === "hubbuy" && positiveCnyCredit || confirmed) || mode === "edit" && refund.requestedProductCnyMinor !== null && positiveCnyCredit));

  return <Surface sheet open title={title} subtitle={itemLabel(item)} description={description} onOpenChange={open => { if (!open && !busy) onClose(); }}>
    {mode === "void" ? <div className="refund-impact"><p>{refund.status === "received" ? `O crédito recebido de ${formatMoney((refund.receivedProductCents ?? 0) + (refund.receivedChinaCents ?? 0))} voltará ao custo.` : "O valor solicitado deixará de aparecer como A receber."}</p><p>{refund.quantity === 1 ? "A unidade ficará" : `${refund.quantity} unidades ficarão`} sem pacote e precisarão ser organizadas novamente. Pacotes enviados não serão restaurados.</p><label className="refund-confirm-reset"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>Confirmo este impacto.</span></label></div> : <>
      {(mode === "receive" || mode === "correct") && <div className="refund-money-fields"><label>{mode === "receive" ? "Produto recebido (R$)" : "Novo valor recebido do produto (R$)"}<input autoFocus required inputMode="decimal" value={product} onChange={event => setProduct(event.target.value)} aria-invalid={productCents === null}/></label><label>{mode === "receive" ? "Frete China recebido (R$)" : "Novo valor recebido do frete China (R$)"}<input required inputMode="decimal" value={china} onChange={event => setChina(event.target.value)} aria-invalid={chinaCents === null}/></label></div>}
      {(mode === "receive" || mode === "correct") && <section className="refund-request-values" aria-label="Destino e moeda do reembolso"><h3>Destino do valor</h3><label>Onde o reembolso foi recebido?<select value={destination} onChange={event => setDestination(event.target.value as "hubbuy" | "external")}><option value="external">Fora da HubBuy · sem crédito CNY</option><option value="hubbuy">Saldo na conta HubBuy</option></select></label>{destination === "hubbuy" && <><label>Conta HubBuy<select required value={accountId} onChange={event => { setAccountId(event.target.value); setConfirmedNoPriorBalance(false); }}><option value="">Escolher conta</option>{activeAccounts.map(account => <option key={account.id} value={account.id}>{account.label} · ativa · {formatCnyMinor(account.balanceCnyMinor)}</option>)}{mode === "receive" && emptyLegacyAccounts.map(account => <option key={account.id} value={account.id}>{account.label} · legado sem histórico</option>)}{mode === "receive" && <option value="__create__">Criar conta HubBuy</option>}</select></label>{createAccountInline && <><label>Nome da nova conta<input required maxLength={100} value={newAccountLabel} onChange={event => setNewAccountLabel(event.target.value)} placeholder="Ex.: Conta principal do grupo"/></label><p className="muted">A conta começa com saldo zero; este reembolso será o primeiro crédito.</p></>}{selectedAccount?.canActivateWithZero && mode === "receive" && <label className="refund-confirm-reset"><input type="checkbox" checked={confirmedNoPriorBalance} onChange={event => setConfirmedNoPriorBalance(event.target.checked)}/><span>Confirmo que não havia saldo nem movimentações anteriores.</span></label>}<div className="refund-money-fields"><label>Produto recebido (CNY)<input required inputMode="decimal" value={productCny} onChange={event => setProductCny(event.target.value)} aria-invalid={productCnyMinor === null}/></label><label>Frete China recebido (CNY)<input required inputMode="decimal" value={chinaCny} onChange={event => setChinaCny(event.target.value)} aria-invalid={chinaCnyMinor === null}/></label></div><label>Comprovante ou referência do crédito na HubBuy<textarea required minLength={3} maxLength={1000} rows={2} value={nativeEvidence} onChange={event => setNativeEvidence(event.target.value)} placeholder="Ex.: reembolso do pedido 123, crédito confirmado na carteira"/></label><p className="muted">Informe os valores efetivamente creditados. O sistema não converte valores BRL por uma cotação atual e não cobra taxa sobre o saldo.</p></>}</section>}
      {mode === "edit" && refund.requestedProductCnyMinor !== null && <div className="refund-money-fields"><label>Produto solicitado (CNY)<input required inputMode="decimal" value={productCny} onChange={event => setProductCny(event.target.value)}/></label><label>Frete China solicitado (CNY)<input required inputMode="decimal" value={chinaCny} onChange={event => setChinaCny(event.target.value)}/></label></div>}
      {mode === "edit" && <div className="refund-money-fields"><label>Valor solicitado do produto (R$)<input autoFocus required inputMode="decimal" value={product} onChange={event => setProduct(event.target.value)} aria-invalid={productCents === null}/></label><label>Valor solicitado do frete China (R$)<input required inputMode="decimal" value={china} onChange={event => setChina(event.target.value)} aria-invalid={chinaCents === null}/></label></div>}
      {mode !== "edit" && <div className="refund-preview"><span>Solicitado <strong>{formatMoney(refund.requestedProductCents + refund.requestedChinaCents)}</strong></span><span>Recebido após a ação <strong>{productCents === null || chinaCents === null ? "Confira os valores" : formatMoney(productCents + chinaCents)}</strong></span><span>Taxa dos produtos <strong>Preservada</strong></span></div>}
      {(mode === "receive" || mode === "correct") && isZeroCredit && <label className="refund-confirm-reset"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>{mode === "receive" ? "Confirmo recebido zero: não haverá crédito e o custo permanecerá integral." : "Confirmo zerar o crédito recebido: ele será removido e o custo voltará a ficar integral."}</span></label>}
    </>}
    <label>{mode === "edit" ? "Motivo da alteração" : mode === "correct" ? "Motivo da correção" : mode === "void" ? "Motivo da anulação" : "Observação (opcional)"}<textarea required={mode !== "receive"} maxLength={1000} rows={3} value={reason} onChange={event => setReason(event.target.value)}/></label>
    <details className="refund-events"><summary>Histórico deste reembolso · {eventCountLabel(refund.events.length)}</summary>{refund.events.map(event => <p key={event.id}><strong>{event.eventType}</strong> · {event.actorName} · {new Date(event.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} {event.reason ? `· ${event.reason}` : ""}</p>)}</details>
    <div className="form-actions"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button><Button type="button" variant={mode === "void" ? "destructive" : "default"} disabled={busy || !canSave} onClick={() => {
      const base = { expectedRevision: detail.tracking.revision };
      if (mode === "void") void onSubmit("refund.void", { ...base, reason, confirmed: true });
      else if (mode === "edit" && productCents !== null && chinaCents !== null) void onSubmit("refund.update", { ...base, requestedProductCents: productCents, requestedChinaCents: chinaCents, ...(refund.requestedProductCnyMinor !== null ? { requestedProductCnyMinor: productCnyMinor, requestedChinaCnyMinor: chinaCnyMinor } : {}), reason });
      else if (mode === "correct" && productCents !== null && chinaCents !== null) void onSubmit("refund.correct", { ...base, receivedProductCents: productCents, receivedChinaCents: chinaCents, destination, ...(destination === "hubbuy" ? { accountId, receivedProductCnyMinor: productCnyMinor, receivedChinaCnyMinor: chinaCnyMinor, nativeEvidence } : { accountId: null, receivedProductCnyMinor: null, receivedChinaCnyMinor: null, nativeEvidence: null }), reason, confirmed: true });
      else if (mode === "receive" && productCents !== null && chinaCents !== null) {
        const accountFields = createAccountInline
          ? { newAccountLabel: newAccountLabel.trim(), confirmZeroBalance: true as const }
          : { accountId, ...(selectedAccount?.canActivateWithZero ? { expectedAccountRevision: selectedAccount.revision, confirmedNoPriorBalance: true as const } : {}) };
        const hubbuyFields = destination === "hubbuy" ? { ...accountFields, receivedProductCnyMinor: productCnyMinor, receivedChinaCnyMinor: chinaCnyMinor, nativeEvidence } : {};
        void onSubmit("refund.receive", { ...base, receivedProductCents: productCents, receivedChinaCents: chinaCents, destination, ...hubbuyFields, confirmed: true });
      }
    }}>{busy ? "Salvando…" : mode === "void" ? "Confirmar anulação" : mode === "receive" && destination === "hubbuy" && positiveCnyCredit ? `Registrar recebimento e creditar ${formatCnyMinor((productCnyMinor ?? 0) + (chinaCnyMinor ?? 0))}` : label}</Button></div>
    {locked && <p className="muted">Reabra os custos com motivo antes de alterar este acompanhamento.</p>}
  </Surface>;
}
