"use client";

import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCategoryMarker } from "@/components/product-category-icons";
import { formatMoney } from "@/lib/domain/money";
import { OrdersBadge } from "./orders-workspace";
import { orderStage } from "./orders-list-state";
import type { WarehouseData } from "./orders-screen";
import "./orders-catalog.css";

type Row = WarehouseData["rows"][number];
type Props = {
  data: WarehouseData;
  selected: Record<string, { quantity: number; row: Row }>;
  disabled: boolean;
  detailItemId?: string;
  onOpenDetail: (row: Row) => void;
  onSelect: (row: Row, quantity: number) => void;
};

/** The same item identity controls the row and the single workspace panel. */
export function OrdersCatalog({ data, selected, disabled, detailItemId, onOpenDetail, onSelect }: Props) {
  return <div className="orders-catalog">
    <table className="orders-catalog-table">
      <caption className="sr-only">Pedidos: etapa física, unidades disponíveis e custo até o armazém. Abra o produto para conferir quantidades, pagamento e QC.</caption>
      <thead><tr><th scope="col">Produto</th><th scope="col">Etapa</th><th scope="col">Unidades</th><th scope="col">Custo</th><th scope="col">Ação</th></tr></thead>
      <tbody>{data.rows.map(row => {
        const open = detailItemId === row.costItemId;
        const stage = orderStage(row, data.packages);
        const quantity = selected[row.costItemId]?.quantity ?? 0;
        return <tr key={row.costItemId} className="orders-catalog-row" data-item-id={row.costItemId} data-selected={quantity > 0} data-detail-open={open} onClick={event => { if (!(event.target as Element).closest("button, a, input, select, textarea")) { event.currentTarget.querySelector<HTMLButtonElement>(".orders-product-button")?.focus({ preventScroll: true }); onOpenDetail(row); } }}>
            <th scope="row" className="orders-catalog-product">
              <button type="button" className="orders-product-button" aria-label={`Detalhes de ${row.name}`} aria-expanded={open} onClick={() => onOpenDetail(row)}>
                <ProductCategoryMarker visualKey={row.source.visualKey} />
                <span><strong>{row.name}</strong><small>{row.order.kind === "additional" ? "Adicional · " : ""}{row.source.variant || "Sem variação"}</small></span>
              </button>
            </th>
            <td className="orders-catalog-stage" title={stage.detail || undefined}><OrdersBadge tone={stage.tone}>{stage.label}</OrdersBadge>{stage.detail && stage.detail !== "No armazém" && <small>{stage.detail}</small>}</td>
            <td className="orders-catalog-units" data-available={row.availableUnits.length > 0}><strong>{row.availableUnits.length} {row.availableUnits.length === 1 ? "disponível" : "disponíveis"}</strong>{row.reservations.length > 0 && <small>{row.reservations.length} {row.reservations.length === 1 ? "vinculada" : "vinculadas"}</small>}</td>
            <td className="orders-catalog-cost" title="Custo até o armazém, conforme as bases e reembolsos registrados">
              {row.financial ? <><strong>{formatMoney(row.financial.total.finalCents ?? row.financial.total.knownCents)}</strong>{row.financial.total.finalCents === null && <small>Parcial</small>}</> : <span>A conferir</span>}
            </td>
            <td className="orders-catalog-action">
              {row.availableUnits.length > 0 ? <Button type="button" variant={quantity ? "soft" : "ghost"} disabled={disabled} aria-pressed={quantity > 0} aria-label={`${quantity ? "Remover" : "Adicionar"} ${row.name} ${quantity ? "da" : "à"} seleção`} onClick={() => onSelect(row, quantity ? 0 : 1)}>{quantity ? <Check size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}<span>{quantity ? "Incluído" : "Adicionar"}</span></Button> : <span className="orders-unavailable" title="Sem unidades livres e conferidas para selecionar" aria-label="Sem unidades disponíveis para selecionar">—</span>}
            </td>
          </tr>;
      })}</tbody>
    </table>
  </div>;
}
