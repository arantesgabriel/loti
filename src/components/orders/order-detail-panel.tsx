"use client";

import { ProductCategoryMarker } from "@/components/product-category-icons";
import { QcGalleryButton } from "@/components/qc/qc-components";
import { formatMoney } from "@/lib/domain/money";
import { OrdersBadge, useOrdersCompact } from "./orders-workspace";
import { orderStage } from "./orders-list-state";
import type { WarehouseData } from "./orders-screen";
import "./order-detail-panel.css";
import { OrdersStepper } from "./orders-stepper";
import { OrderItemActions } from "./order-item-actions";

type Row = WarehouseData["rows"][number];

export function OrderDetailPanel({ row, data, members, quantity, disabled, returnTo, onSelect, onReceive, onChanged }: {
  row: Row; data: WarehouseData; members: { id: string; name: string }[];
  quantity: number; disabled: boolean; returnTo: string;
  onSelect: (row: Row, quantity: number) => void; onReceive: (row: Row) => void; onChanged: (replacement?: { previousId: string; nextId: string }) => void;
}) {
  const compact = useOrdersCompact();
  const stage = orderStage(row, data.packages);
  const origin = data.origins.find(item => item.trackingId === row.cost.trackingId);
  return <div className="orders-item-detail" data-detail-item-id={row.costItemId}>
    <section className="orders-item-identity" aria-label="Identificação do item">
      <ProductCategoryMarker visualKey={row.source.visualKey} />
      <div><p>{row.source.variant || "Sem variação"}</p><OrdersBadge tone={stage.tone}>{stage.label}</OrdersBadge></div>
    </section>
    {stage.detail && <p className="orders-item-stage-detail">{stage.detail}</p>}
    <section aria-labelledby="orders-detail-units"><h3 id="orders-detail-units">Disponibilidade</h3>
      <p className="orders-item-available">{row.availableUnits.length} {row.availableUnits.length === 1 ? "unidade" : "unidades"}</p>
      <p>{row.reviewState === "pending_review" ? "Chegada a conferir" : `${row.receivedUnits.length} recebidas · ${row.reservations.length} vinculadas`}</p>
      <details className="orders-item-more"><summary>Quantidades e vínculos</summary><dl className="orders-item-quantities">
        {([["Compradas", row.quantity], ["Recebidas", row.reviewState === "pending_review" ? "A conferir" : row.receivedUnits.length], ["Vinculadas", row.reservations.length], ...(row.cancelledUnits.length ? [["Canceladas", row.cancelledUnits.length]] : [])] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      <p>{row.participants.map(person => members.find(member => member.id === person.personId)?.name ?? "Membro").join(", ") || "Participantes a conferir"}{row.accountId ? ` · ${data.accounts.find(account => account.id === row.accountId)?.label ?? "Conta vinculada"}` : " · Conta a conferir"}</p>
      {row.reservations.length > 0 && <ul className="orders-item-packages">{[...new Set(row.reservations.map(reservation => reservation.packageId))].map(id => {
        const count = row.reservations.filter(reservation => reservation.packageId === id).length;
        return <li key={id}><a href={`/packages/detail/${encodeURIComponent(id)}`}>{count} {count === 1 ? "unidade" : "unidades"} · {data.packages.find(pkg => pkg.id === id)?.name ?? "Ver pacote"}</a></li>;
      })}</ul>}
      </details>
    </section>
    <section aria-labelledby="orders-detail-cost"><h3 id="orders-detail-cost">Até o armazém</h3>
      {row.financial && <p className="orders-item-total">{formatMoney(row.financial.total.finalCents ?? row.financial.total.knownCents)}{row.financial.total.finalCents === null && <small>Base parcial</small>}</p>}
      {row.financial ? <details className="orders-item-more"><summary>Composição dos custos</summary><dl className="orders-item-costs">{([["Produto", row.financial.product], ["China", row.financial.china], ["Taxa", row.financial.productFee]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatMoney(value.finalCents ?? value.knownCents)}{value.finalCents === null && <small>Parcial</small>}</dd></div>)}</dl><p>{row.paymentStatus === "paid" ? "Produtos pagos" : "Pagamento não confirmado"}</p></details> : <p>Bases a conferir</p>}
    </section>
    <section className="orders-item-qc" aria-labelledby="orders-detail-qc"><h3 id="orders-detail-qc">Fotos QC</h3>
      {row.qcCount === 0 ? <p>Nenhuma foto QC disponível para este produto.</p> : origin ? <QcGalleryButton key={`${origin.purchaseId}:${row.costItemId}`} purchaseId={origin.purchaseId} itemId={row.cost.purchaseItemId ? `purchase:${row.cost.purchaseItemId}` : `additional:${row.cost.additionalOrderItemId}`} itemName={row.name} canManageHere galleryPreview bottomSheet={compact} triggerLabel="Ver fotos" triggerAriaLabel={`Ver fotos QC de ${row.name}`} /> : <p>Origem QC indisponível.</p>}
      <p>Fotos QC não confirmam chegada nem aprovação.</p>
    </section>
    <OrderItemActions row={row} data={data} disabled={disabled} returnTo={returnTo} onReceive={onReceive} onChanged={onChanged}>
      <div className="orders-item-selection"><span>Selecionar unidades</span><OrdersStepper name={row.name} value={quantity} max={row.availableUnits.length} disabled={disabled} onChange={quantity => onSelect(row, quantity)} /></div>
      {!row.availableUnits.length && <p>Sem unidades livres e conferidas para selecionar.</p>}
    </OrderItemActions>
  </div>;
}
