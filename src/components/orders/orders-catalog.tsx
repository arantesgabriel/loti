"use client";

import { Check, MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCategoryMarker } from "@/components/product-category-icons";
import { QcGalleryButton } from "@/components/qc/qc-components";
import { formatMoney } from "@/lib/domain/money";
import { OrdersBadge, useOrdersCompact } from "./orders-workspace";
import { orderSortOptions, orderStage, projectArrival, type OrderSort } from "./orders-list-state";
import type { WarehouseData } from "./orders-screen";
import "@/components/packages/product-costs.css";
import "./orders-catalog.css";

type Row = WarehouseData["rows"][number];
type Props = {
  checked: ReadonlySet<string>;
  onCheck: (rows: Row[], checked: boolean) => void;
  sort?: OrderSort;
  direction?: "asc" | "desc";
  onSort: (sort: OrderSort, direction: "asc" | "desc") => void;
  pendingItems: ReadonlyMap<string, { quantity: number; expectedRevision: number }>;
  data: WarehouseData;
  selected: Record<string, { quantity: number; row: Row }>;
  disabled: boolean;
  detailItemId?: string;
  onOpenDetail: (row: Row) => void;
  onSelect: (row: Row, quantity: number) => void;
  onPackageAction: (row: Row, mode: "release" | "move") => void;
};

/** The same item identity controls the row and the single workspace panel. */
export function OrdersCatalog({ checked, onCheck, sort, direction, onSort, data, pendingItems, selected, disabled, detailItemId, onOpenDetail, onSelect, onPackageAction }: Props) {
  const compact = useOrdersCompact();
  const purchasesByTracking = new Map(data.origins.map(origin => [origin.trackingId, origin.purchaseId]));
  const checkedCount = data.rows.filter(row => checked.has(row.costItemId)).length;
  return <div className="orders-catalog">
    <table className="orders-catalog-table">
      <caption className="sr-only">Pedidos: etapa física, unidades disponíveis e custo até o armazém. Abra o produto para conferir quantidades, pagamento e QC.</caption>
      <thead><tr>{orderSortOptions.map(([field,label]) => <th key={field} scope="col" aria-sort={sort === field ? direction === "desc" ? "descending" : "ascending" : undefined}>{field === "product" && <input type="checkbox" className="orders-row-check" aria-label="Selecionar itens desta página" checked={checkedCount === data.rows.length && checkedCount > 0} ref={input => { if (input) input.indeterminate = checkedCount > 0 && checkedCount < data.rows.length; }} disabled={disabled} onChange={event => onCheck(data.rows, event.target.checked)} />}<button type="button" className="orders-column-sort" onClick={() => onSort(field, sort === field && direction !== "desc" ? "desc" : "asc")}>{label}{sort === field && <span aria-hidden="true">{direction === "desc" ? " ↓" : " ↑"}</span>}</button></th>)}<th scope="col">Ação</th></tr></thead>
      <tbody>{data.rows.map(row => {
        const pending = pendingItems.get(row.costItemId);
        const open = detailItemId === row.costItemId;
        const stage = orderStage(pending?.expectedRevision === row.revision ? projectArrival(row, pending.quantity) : row, data.packages);
        const quantity = selected[row.costItemId]?.quantity ?? 0;
        const purchaseId = purchasesByTracking.get(row.cost.trackingId);
        const qcItemId = row.cost.purchaseItemId ? `purchase:${row.cost.purchaseItemId}`
          : row.cost.additionalOrderItemId ? `additional:${row.cost.additionalOrderItemId}` : null;
        const marker = <ProductCategoryMarker visualKey={row.source.visualKey} />;
        const showQc = row.qcCount > 0 && purchaseId && qcItemId;
        const productButton = <button type="button" className="orders-product-button" aria-label={`Detalhes de ${row.name}`} aria-expanded={open} onClick={() => onOpenDetail(row)}>
          {!showQc && marker}
          <span><strong>{row.name}</strong><small>{row.order.kind === "additional" ? "Adicional · " : ""}{row.source.variant || "Sem variação"}</small></span>
        </button>;
        return <tr key={row.costItemId} className="orders-catalog-row" data-item-id={row.costItemId} data-selected={quantity > 0 || checked.has(row.costItemId)} data-detail-open={open} onClick={event => { if (!(event.target as Element).closest("button, a, input, label, select, textarea, summary")) { event.currentTarget.querySelector<HTMLButtonElement>(".orders-product-button")?.focus({ preventScroll: true }); onOpenDetail(row); } }}>
            <th scope="row" className="orders-catalog-product">
              <input type="checkbox" className="orders-row-check" aria-label={"Selecionar " + row.name} checked={checked.has(row.costItemId)} disabled={disabled} onChange={event => onCheck([row], event.target.checked)} />
              {showQc ? <div className="orders-catalog-qc">
                <QcGalleryButton purchaseId={purchaseId} itemId={qcItemId} itemName={row.name} canManageHere costThumbnails={compact ? "mobile" : "desktop"} costIdentity={{ marker, label: productButton }} bottomSheet={compact} />
              </div> : productButton}
            </th>
            <td className="orders-catalog-stage" title={stage.detail || undefined}><OrdersBadge tone={stage.tone}>{stage.label}</OrdersBadge>{pending && <small>Chegada pendente (+{pending.quantity})</small>}{!pending && stage.detail && stage.detail !== "No armazém" && <small>{stage.detail}</small>}</td>
            <td className="orders-catalog-units" data-available={row.availableUnits.length > 0}><strong>{row.availableUnits.length} {row.availableUnits.length === 1 ? "disponível" : "disponíveis"}</strong>{row.reservations.length > 0 && <small>{row.reservations.length} {row.reservations.length === 1 ? "vinculada" : "vinculadas"}</small>}</td>
            <td className="orders-catalog-cost" title="Custo até o armazém, conforme as bases e reembolsos registrados">
              {row.financial ? <><strong>{formatMoney(row.financial.total.finalCents ?? row.financial.total.knownCents)}</strong>{row.financial.total.finalCents === null && <small>Parcial</small>}</> : <span>Custo indefinido</span>}
            </td>
            <td className="orders-catalog-action">
              <div className="orders-catalog-action-controls">
                {row.availableUnits.length > 0 && row.reservations.length === 0 && <Button type="button" variant={quantity ? "soft" : "ghost"} disabled={disabled || !!pending} aria-pressed={quantity > 0} aria-label={`${quantity ? "Remover" : "Adicionar"} ${row.name} ${quantity ? "da" : "à"} seleção`} onClick={() => onSelect(row, quantity ? 0 : 1)}>{quantity ? <Check size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}<span>{quantity ? "Incluído" : "Adicionar"}</span></Button>}
                {row.reservations.length > 0 && <details className="orders-catalog-package-menu">
                  <summary role="button" aria-label={`Ações de pacote para ${row.name}`}><MoreHorizontal size={18} aria-hidden="true" /></summary>
                  <div className="orders-catalog-package-menu-items">
                    <button type="button" onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); onPackageAction(row, "release"); }}>Remover do pacote</button>
                    <button type="button" onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); onPackageAction(row, "move"); }}>Trocar pacote</button>
                  </div>
                </details>}
                {!row.availableUnits.length && !row.reservations.length && <span className="orders-unavailable" title="Sem unidades livres e conferidas para selecionar" aria-label="Sem unidades disponíveis para selecionar">—</span>}
              </div>
            </td>
          </tr>;
      })}</tbody>
    </table>
  </div>;
}
