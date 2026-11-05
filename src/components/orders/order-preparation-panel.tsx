"use client";

import { ProductCategoryMarker } from "@/components/product-category-icons";
import { Button } from "@/components/ui/button";
import { OrdersStepper } from "./orders-stepper";
import type { OrdersSelection, OrderRow } from "./orders-selection";

export function OrderPreparationPanel({ selected, disabled, onSelect, onDetail }: {
  selected: OrdersSelection; disabled: boolean; onSelect: (row: OrderRow, quantity: number) => void; onDetail: (row: OrderRow) => void;
}) {
  const entries = Object.values(selected).filter(entry => entry.quantity > 0);
  return <div className="orders-preparation" aria-label="Itens do pacote">
    {!entries.length && <div className="orders-feedback"><strong>Nenhum produto selecionado</strong><p>Adicione unidades disponíveis na lista para preparar seu pacote.</p></div>}
    {entries.map(({ row, quantity }) => <section key={row.costItemId} className="orders-preparation-item">
      <button type="button" className="orders-preparation-product" aria-label={`Consultar ${row.name}`} onClick={() => onDetail(row)}><ProductCategoryMarker visualKey={row.source.visualKey} /><span><strong>{row.name}</strong><small>{row.source.variant || "Sem variação"}</small></span></button>
      <div className="orders-preparation-controls"><OrdersStepper name={row.name} value={quantity} max={row.availableUnits.length} disabled={disabled} onChange={quantity => onSelect(row, quantity)} /><Button type="button" variant="ghost" disabled={disabled} aria-label={`Remover ${row.name} do pacote`} onClick={() => onSelect(row, 0)}>Remover</Button></div>
      <small className="muted">{row.availableUnits.length} {row.availableUnits.length === 1 ? "unidade disponível" : "unidades disponíveis"}</small>
    </section>)}
  </div>;
}
