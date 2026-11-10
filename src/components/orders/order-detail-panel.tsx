"use client";
import { ProductCategoryMarker } from "@/components/product-category-icons";

import { QcGalleryButton } from "@/components/qc/qc-components";
import { formatMoney } from "@/lib/domain/money";
import { OrdersBadge, useOrdersCompact } from "./orders-workspace";
import { orderStage, projectArrival } from "./orders-list-state";
import type { WarehouseData } from "./orders-screen";
import "./order-detail-panel.css";
import { OrdersStepper } from "./orders-stepper";
import { OrderItemActions } from "./order-item-actions";

type Row = WarehouseData["rows"][number];

type DetailProps = {
  pendingArrival?: number;
  row: Row; data: WarehouseData; members: { id: string; name: string }[];
} & ({ readOnly: true } | {
  readOnly?: false;
  quantity: number; disabled: boolean; returnTo: string;
  onSelect: (row: Row, quantity: number) => void; onReceive: (row: Row, mode?: "correct") => void; onChanged: (replacement?: { previousId: string; nextId: string }) => void;
});

export function OrderDetailPanel(props: DetailProps) {
  const { row, data, members } = props;
  const compact = useOrdersCompact();
  const displayed = props.pendingArrival ? projectArrival(row, props.pendingArrival) : row;
  const stage = orderStage(displayed, data.packages);
  const origin = data.origins.find(item => item.trackingId === row.cost.trackingId);
  const metrics = <>
    <div className="orders-item-metrics">
      <section aria-labelledby="orders-detail-units"><h3 id="orders-detail-units">Disponíveis para pacote</h3>
        <p className="orders-item-metric">{row.availableUnits.length} un.</p>
      </section>
      <section aria-labelledby="orders-detail-cost"><h3 id="orders-detail-cost">Custo até o armazém</h3>
        <p className="orders-item-metric">{row.financial ? formatMoney(row.financial.total.finalCents ?? row.financial.total.knownCents) : "Indefinido"}</p>
        {row.financial?.total.finalCents === null && <small>Parcial</small>}
      </section>
    </div>
    {!props.readOnly && row.availableUnits.length > 0 && <div className="orders-item-selection"><span>Selecionar unidades</span><OrdersStepper name={row.name} value={props.quantity} max={row.availableUnits.length} disabled={props.disabled} onChange={quantity => props.onSelect(row, quantity)} /></div>}
    <section className="orders-item-qc" aria-labelledby="orders-detail-qc"><h3 id="orders-detail-qc">Fotos QC</h3>
      {row.qcCount === 0 ? <p>Sem fotos.</p> : origin ? <QcGalleryButton key={`${origin.purchaseId}:${row.costItemId}`} purchaseId={origin.purchaseId} itemId={row.cost.purchaseItemId ? `purchase:${row.cost.purchaseItemId}` : `additional:${row.cost.additionalOrderItemId}`} itemName={row.name} canManageHere galleryPreview bottomSheet={compact} triggerLabel="Ver fotos" triggerAriaLabel={`Ver fotos QC de ${row.name}`} /> : <p>Fotos indisponíveis.</p>}
    </section>
    <div className="orders-item-secondary">
      <details className="orders-item-more orders-item-breakdown"><summary>Quantidades e pacotes</summary><dl className="orders-item-quantities">
        {([["Compradas", row.quantity], ["Recebidas", displayed.reviewState === "pending_review" ? "Sem registro" : displayed.receivedUnits.filter(unit => !row.cancelledUnits.includes(unit)).length], ["Em pacotes", row.reservations.length], ...(row.cancelledUnits.length ? [["Canceladas", row.cancelledUnits.length]] : [])] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd data-missing={typeof value === "string"}>{value}</dd></div>)}
      </dl>
      <dl className="orders-item-package-meta">
        <div><dt>Participantes</dt><dd>{row.participants.map(person => members.find(member => member.id === person.personId)?.name ?? "Membro").join(", ") || "Sem participantes"}</dd></div>
        <div><dt>Conta HubBuy</dt><dd>{row.accountId ? data.accounts.find(account => account.id === row.accountId)?.label ?? "Conta vinculada" : "Sem conta vinculada"}</dd></div>
      </dl>
      {row.reservations.length > 0 && <ul className="orders-item-packages">{[...new Set(row.reservations.map(reservation => reservation.packageId))].map(id => {
        const count = row.reservations.filter(reservation => reservation.packageId === id).length;
        return <li key={id}><a href={`/packages/detail/${encodeURIComponent(id)}`}><span>{data.packages.find(pkg => pkg.id === id)?.name ?? "Ver pacote"}</span><small>{count} {count === 1 ? "unidade" : "unidades"}</small></a></li>;
      })}</ul>}
      </details>
      {row.financial && <details className="orders-item-more"><summary>Composição dos custos</summary><dl className="orders-item-costs">{([["Produto", row.financial.product], ["Frete na China", row.financial.china], ["Taxa", row.financial.productFee]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatMoney(value.finalCents ?? value.knownCents)}{value.finalCents === null && <small>Parcial</small>}</dd></div>)}</dl><p>{row.paymentStatus === "paid" ? "Produtos pagos" : "Pagamento não confirmado"}</p></details>}
    </div>
  </>;
  return <div className="orders-item-detail" data-detail-item-id={row.costItemId}>
    {props.readOnly ? <div><OrdersBadge tone={stage.tone}>{stage.label}</OrdersBadge></div> :
      <section className="orders-item-identity">
        <ProductCategoryMarker visualKey={row.source.visualKey} />
        <div><h3>{row.name}</h3>{row.source.variant && <p>{row.source.variant}</p>}<OrdersBadge tone={stage.tone}>{stage.label}</OrdersBadge></div>
      </section>}
    {!!props.pendingArrival && <p role="status">Confirmando a chegada de {props.pendingArrival} {props.pendingArrival === 1 ? "unidade" : "unidades"}.</p>}
    {stage.detail && <p className="orders-item-stage-detail">{stage.detail}</p>}
    {props.readOnly ? metrics : <OrderItemActions row={row} data={data} disabled={props.disabled} returnTo={props.returnTo} onReceive={props.onReceive} onChanged={props.onChanged}>
      {metrics}
    </OrderItemActions>}
  </div>;
}
