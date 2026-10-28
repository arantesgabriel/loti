"use client";

import { Fragment, useRef } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, MoreVertical, Pencil } from "lucide-react";
import { ProductCategoryMarker } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { QcGalleryButton } from "@/components/qc/qc-components";
import type { CostTrackingView } from "@/lib/domain/package-cost-reading";
import { formatMoney } from "@/lib/domain/money";
import { formatCnyMinor } from "@/lib/domain/financial-money";
import { productPriceSummary } from "@/lib/domain/additional-product-pricing";
import "./product-costs.css";

type Detail = CostTrackingView;
type DetailItem = Detail["items"][number];
type DisplayItem = Detail["financialDisplay"]["items"][number];
type CostCalculation = NonNullable<DetailItem["calculation"]>;
type ProductOrder = Detail["productOrders"][number];
type AdditionalOrderItem = ProductOrder["items"][number];
type CostProductRow = {
  id: string;
  itemOrder: number;
  origin: "purchase" | "additional";
  name: string;
  variant: string | null;
  visualKey: string;
  quantity: number;
  participants: { personId: string; name: string; weight: number }[];
  calculation?: CostCalculation;
  effectivePriceState: DetailItem["effectivePriceState"];
  effectivePriceUnitCents: number | null;
  chinaFreightState: DetailItem["chinaFreightState"];
  chinaFreightUnitCents: number | null;
  original?: DetailItem;
  additional?: AdditionalOrderItem;
  order?: ProductOrder;
  display: DisplayItem;
};

function productCostRows(detail: Detail): CostProductRow[] {
  const displayById = new Map(detail.financialDisplay.items.map(item => [item.costItemId, item]));
  const originalRows: CostProductRow[] = detail.items.map((item) => ({
    id: item.id,
    itemOrder: item.itemOrder,
    origin: "purchase",
    name: item.original.name,
    variant: item.original.variant,
    visualKey: item.original.visualKey,
    quantity: item.original.quantity,
    participants: item.participants.map((person) => ({
      personId: person.personId,
      name: person.name,
      weight: person.weight,
    })),
    calculation: item.calculation ?? undefined,
    effectivePriceState: item.effectivePriceState,
    effectivePriceUnitCents: item.effectivePriceUnitCents,
    chinaFreightState: item.chinaFreightState,
    chinaFreightUnitCents: item.chinaFreightUnitCents,
    original: item,
    display: displayById.get(item.id)!,
  }));
  const additionalRows: CostProductRow[] = detail.productOrders
    .filter(
      (order) => order.kind === "additional" && order.state === "recorded",
    )
    .flatMap((order) =>
      order.items.flatMap((row) => {
        if (!row.item) return [];
        return [
          {
            id: row.cost.id,
            itemOrder: row.cost.itemOrder,
            origin: "additional" as const,
            name: row.item.name,
            variant: row.item.variant,
            visualKey: row.item.visualKey,
            quantity: row.quantity,
            participants: row.participants.map((person) => ({
              personId: person.personId,
              name: person.name,
              weight: person.weight,
            })),
            calculation: row.calculation ?? undefined,
            effectivePriceState: row.cost.effectivePriceState,
            effectivePriceUnitCents: row.cost.effectivePriceUnitCents,
            chinaFreightState: row.cost.chinaFreightState,
            chinaFreightUnitCents: row.cost.chinaFreightUnitCents,
            additional: row,
            order,
            display: displayById.get(row.cost.id)!,
          },
        ];
      }),
    );
  return [...originalRows, ...additionalRows].filter(row => row.display && row.display.remainingQuantity > 0).sort(
    (a, b) => a.itemOrder - b.itemOrder || a.id.localeCompare(b.id),
  );
}

function productUnitsSummary(
  item: CostProductRow,
) {
  const remaining = item.display.remainingQuantity;
  const cancelled = item.display.cancelledQuantity;
  return `${remaining} ${remaining === 1 ? "unidade no pedido" : "unidades no pedido"}${cancelled ? ` · ${cancelled} ${cancelled === 1 ? "unidade cancelada" : "unidades canceladas"}` : ""}`;
}

function displayAmount(value: DisplayItem["remaining"]["product"]) {
  if (value.state === "no_charge") return "Sem cobrança";
  if (value.finalCents !== null) return formatMoney(value.finalCents);
  return value.hasKnownAmount ? `Parcial · ${formatMoney(value.knownCents)}` : "Pendente";
}

function combineDisplayMoney(values: DisplayItem["remaining"]["product"][]) {
  const pendingReasons = [...new Set(values.flatMap(value => value.pendingReasons))];
  const knownCents = values.reduce((sum, value) => sum + value.knownCents, 0);
  const hasKnownAmount = values.some(value => value.hasKnownAmount);
  return {
    knownCents,
    hasKnownAmount,
    finalCents: pendingReasons.length ? null : knownCents,
    pendingReasons,
    state: pendingReasons.length ? hasKnownAmount ? "partial" as const : "pending" as const : "known" as const,
  };
}

function nativeAmountLabel(
  state: "unknown" | "known" | "no_charge",
  amount: number | null,
) {
  return state === "no_charge"
    ? "sem cobrança"
    : state === "unknown" || amount === null
      ? "não informado"
      : formatCnyMinor(amount);
}

type Props = {
  toolbar?: React.ReactNode;
  detail: Detail;
  locked: boolean;
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  onDetails: (id: string) => void;
  onEdit: (item: DetailItem) => void;
  onEditAdditional: (id: string) => void;
  onRefund: (id: string) => void;
  onRefundDetails: (id: string) => void;
  onResumeOrder: (id: string) => void;
  onAssociate: (id: string) => void;
};

function productStatus(item: CostProductRow) {
  return item.display.remaining.total.finalCents != null
    ? { label: "Completo", kind: "complete" }
    : { label: "Parcial", kind: "partial" };
}
function rowTotal(item: CostProductRow) {
  return displayAmount(item.display.remaining.total);
}
function Identity({
  item,
  purchaseId,
  mobile = false,
}: {
  item: CostProductRow;
  purchaseId: string;
  mobile?: boolean;
}) {
  return (
    <QcGalleryButton purchaseId={purchaseId} itemId={item.origin === "purchase" ? `purchase:${item.original!.original.id}` : `additional:${item.additional!.item!.id}`} itemName={item.name} canManageHere costThumbnails={mobile ? "mobile" : "desktop"} costIdentity={{ marker: <ProductCategoryMarker visualKey={item.visualKey}/>, label: <span className="cost-product-identity-text">
        <strong>{item.name}</strong>
        <small>
          {item.participants.map((person) => person.name).join(" · ") ||
            "Divisão pendente"}
          {mobile ? ` · ${item.display.remainingQuantity} un.` : ""}
        </small>
        {item.origin === "additional" && (
          <span className="cost-additional-origin-flag">Pedido adicional</span>
        )}
      </span> }}/>
  );
}
function CompositionToggle({
  item,
  open,
  onToggle,
  mobile = false,
}: {
  item: CostProductRow;
  open: boolean;
  onToggle: () => void;
  mobile?: boolean;
}) {
  return (
    <Button
      className="cost-inline-toggle"
      variant="ghost"
      size="sm"
      aria-expanded={open}
      aria-controls={`cost-composition-${mobile ? "mobile" : "desktop"}-${item.id}`}
      onClick={onToggle}
      aria-label={`${open ? "Fechar" : "Ver"} composição de ${item.name}`}
    >
      {open ? "Fechar composição" : "Ver composição"}
      <ChevronDown
        size={13}
        className={open ? "expanded" : ""}
        aria-hidden="true"
      />
    </Button>
  );
}
function RowComposition({
  item,
  detail,
  locked,
  onDetails,
  onEdit,
  onEditAdditional,
  onRefund,
  onRefundDetails,
  onResumeOrder,
  onAssociate,
}: Omit<Props, "expanded" | "onToggle"> & { item: CostProductRow }) {
  const calculation = item.calculation;
  const associations = detail.packages.filter((pkg) =>
    pkg.items.some((row) => row.costItemId === item.id),
  );
  const unassigned = Math.max(
    0,
    (calculation?.shippingQuantity ?? item.display.remainingQuantity) -
      (calculation?.allocatedQuantity ?? 0),
  );
  const qcId =
    item.origin === "purchase"
      ? `purchase:${item.original!.original.id}`
      : `additional:${item.additional!.item!.id}`;
  const values = [
    ["Preço das unidades restantes", displayAmount(item.display.remaining.product)],
    ["Frete China das unidades restantes", displayAmount(item.display.remaining.china)],
    ["Taxa dos produtos restante", displayAmount(item.display.remaining.productFee)],
    ["Custos de pacote das unidades restantes", displayAmount(item.display.remaining.packageCosts)],
    ["Custo atual das unidades restantes", displayAmount(item.display.remaining.total)],
  ];
  return (
    <div className="cost-inline-composition">
      <div className="cost-inline-composition-heading">
        <strong>Composição de custos</strong>
        <small>Valores pendentes não integram o total parcial.</small>
      </div>
      <dl className="cost-inline-components">
        {values.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className={value === "Pendente" ? "muted" : undefined}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {item.variant && (
        <p className="cost-inline-note">Variação: {item.variant}</p>
      )}
      <p className="cost-inline-note">
        {productUnitsSummary(item)}
        {associations.length
          ? ` · ${associations.map((pkg) => pkg.name).join(", ")}`
          : " · Sem pacote"}
      </p>
      {item.additional && (
        <p className="cost-inline-note">
          Produto{" "}
          {item.additional.cost.nativeProductState === "known" && item.additional.cost.nativeProductCnyMinor !== null
            ? productPriceSummary(item.additional.cost.nativeProductCnyMinor, item.quantity)
            : nativeAmountLabel(
            item.additional.cost.nativeProductState,
            item.additional.cost.nativeProductCnyMinor,
          )}{" "}
          · Frete China total{" "}
          {nativeAmountLabel(
            item.additional.cost.nativeChinaState,
            item.additional.cost.nativeChinaCnyMinor,
          )}
        </p>
      )}
      {item.display.cancelled && (
        <p className="cost-inline-note">
          O custo das {item.display.cancelledQuantity === 1 ? "unidade cancelada" : "unidades canceladas"} está conciliado em Reembolsos.
          <Button variant="ghost" size="sm" onClick={() => onRefundDetails(item.id)}>Ver reembolso e custos mantidos</Button>
        </p>
      )}
      {!!item.display.remaining.total.pendingReasons.length && (
        <p className="cost-inline-note">
          Falta informar: {item.display.remaining.total.pendingReasons.join(", ")}
        </p>
      )}
      <div className="cost-inline-actions">
        <QcGalleryButton
          purchaseId={detail.purchase.id}
          itemId={qcId}
          itemName={item.name}
          canManageHere
          triggerLabel="Ver QC"
        />
        <Button variant="ghost" size="sm" onClick={() => onDetails(item.id)}>
          Todos os detalhes
        </Button>
        {!locked && item.original && (
          <ProductCostActions
            id={item.id}
            name={item.name}
            editable
            allowRefund={detail.productsCharge?.paymentStatus === "paid"}
            refundDisabled={
              item.effectivePriceState === "pending" ||
              item.chinaFreightState === "pending" ||
              item.participants.every((person) => person.weight === 0)
            }
            onEdit={() => onEdit(item.original!)}
            onRefund={onRefund}
          />
        )}
        {!locked && item.additional && (
          <ProductCostActions
            id={item.id}
            name={item.name}
            editable
            onEdit={() => onEditAdditional(item.id)}
            allowRefund
            onRefund={onRefund}
          />
        )}
        {!locked && unassigned > 0 && (
          <Button
            className="cost-inline-associate"
            size="sm"
            variant="outline"
            onClick={() =>
              item.order ? onResumeOrder(item.order.id) : onAssociate(item.id)
            }
          >
            Associar ao pacote
          </Button>
        )}
      </div>
    </div>
  );
}
export function ProductCostsList(props: Props) {
  const { detail, expanded, onToggle } = props;
  const rows = productCostRows(detail);
  const remainingUnits = rows.reduce((sum, item) => sum + item.display.remainingQuantity, 0);
  const operationalSubtotal = combineDisplayMoney(rows.map(item => item.display.remaining.total));
  if (!rows.length)
    return (
      <div className="cost-hybrid-products">
        <div className="cost-products-toolbar"><div key="actions">{props.toolbar}</div></div>
        <div className="cost-products-empty">
          <p className="muted cost-empty-note">
            {detail.financialDisplay.refundGroups.length
              ? "Nenhum produto permanece no pedido. Consulte os reembolsos e os custos mantidos abaixo."
              : "Nenhum produto neste acompanhamento."}
          </p>
          {detail.financialDisplay.refundGroups[0] && <Button variant="outline" onClick={() => props.onRefundDetails(detail.financialDisplay.refundGroups[0].costItemId)}>Ver reembolsos</Button>}
        </div>
      </div>
    );
  return (
    <div className="cost-hybrid-products">
      <div className="cost-products-toolbar">
        <p className="cost-products-count">
          {rows.length} {rows.length === 1 ? "produto" : "produtos"} · {remainingUnits} {remainingUnits === 1 ? "unidade" : "unidades"} no pedido
          <span>Abra a composição para consultar custos e ações.</span>
        </p>
        <div key="actions">{props.toolbar}</div>
      </div>
      <div className="cost-table-wrap">
        <table className="cost-table cost-compact-table">
          <caption className="sr-only">Custos por produto</caption>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Qtd. no pedido</th>
              <th>Preço dos produtos</th>
              <th>Encargos</th>
              <th>Custo atual</th>
              <th>Situação e detalhes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const open = !!expanded[item.id],
                status = productStatus(item);
              const product = item.display.remaining.product;
              const charges = combineDisplayMoney([
                item.display.remaining.china,
                item.display.remaining.productFee,
                item.display.remaining.packageCosts,
              ]);
              return (
                <Fragment key={item.id}>
                  <tr
                    className={`cost-compact-row ${open ? "is-expanded" : ""}`}
                    data-cost-target={`order-product-${item.id}`}
                    tabIndex={-1}
                  >
                    <td>
                      <Identity item={item} purchaseId={detail.purchase.id} />
                    </td>
                    <td>{item.display.remainingQuantity}</td>
                    <td>
                      <strong>{displayAmount(product)}</strong>
                      <small className="cost-unit-note">
                        {item.display.remainingQuantity > 1
                          ? `${item.display.remainingQuantity} unidades restantes`
                          : "Unidade restante"}
                      </small>
                    </td>
                    <td>
                      <strong>{displayAmount(charges)}</strong>
                      <small className="cost-unit-note">
                        {charges.finalCents === null ? "Parciais" : "China, taxas e pacotes"}
                      </small>
                    </td>
                    <td>
                      <strong>{rowTotal(item)}</strong>
                      {item.display.remaining.total.finalCents === null && <small className="cost-unit-note">Parcial</small>}
                    </td>
                    <td>
                      <div className="cost-compact-status">
                        <span className={`cost-row-status ${status.kind}`}>
                          {status.label}
                        </span>
                        {item.display.cancelledQuantity > 0 && <Button className="cost-cancelled-link" variant="ghost" size="sm" onClick={() => props.onRefundDetails(item.id)}>{item.display.cancelledQuantity} {item.display.cancelledQuantity === 1 ? "cancelada" : "canceladas"} · Ver reembolsos</Button>}
                        <CompositionToggle
                          item={item}
                          open={open}
                          onToggle={() => onToggle(item.id)}
                        />
                      </div>
                    </td>
                  </tr>
                  {open && (
                    <tr className="cost-composition-row">
                      <td colSpan={6}>
                        <div id={`cost-composition-desktop-${item.id}`}>
                          <RowComposition {...props} item={item} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="cost-product-mobile-list" aria-label="Custos por produto">
        {rows.map((item) => {
          const open = !!expanded[item.id],
            status = productStatus(item);
          return (
            <article
              className="cost-product-mobile-card"
              key={item.id}
              data-cost-target={`order-product-${item.id}`}
              tabIndex={-1}
            >
              <div className="cost-compact-mobile-heading">
                <Identity item={item} purchaseId={detail.purchase.id} mobile />
                <div className="cost-compact-mobile-total">
                  <strong>{rowTotal(item)}</strong>
                  <small className={status.kind}>{status.label}</small>
                </div>
              </div>
              <CompositionToggle
                item={item}
                open={open}
                mobile
                onToggle={() => onToggle(item.id)}
              />
              {item.display.cancelledQuantity > 0 && <Button className="cost-cancelled-link cost-cancelled-link-mobile" variant="ghost" size="sm" onClick={() => props.onRefundDetails(item.id)}>{item.display.cancelledQuantity} {item.display.cancelledQuantity === 1 ? "unidade cancelada" : "unidades canceladas"} · Ver reembolsos</Button>}
              {open && (
                <div id={`cost-composition-mobile-${item.id}`}>
                  <RowComposition {...props} item={item} />
                </div>
              )}
            </article>
          );
        })}
      </div>
      <div className="cost-products-footer">
        <small>
          {remainingUnits} {remainingUnits === 1 ? "unidade no pedido" : "unidades no pedido"}
        </small>
        <span>
          {operationalSubtotal.finalCents === null ? "Subtotal parcial dos produtos no pedido" : "Subtotal dos produtos no pedido"}
          <strong>
            {displayAmount(operationalSubtotal)}
          </strong>
        </span>
      </div>
    </div>
  );
}

function ProductCostActions({
  id,
  name,
  allowRefund,
  refundDisabled = false,
  editable = false,
  onEdit,
  onRefund,
}: {
  id: string;
  name: string;
  allowRefund: boolean;
  refundDisabled?: boolean;
  editable?: boolean;
  onEdit?: () => void;
  onRefund: (itemId: string) => void;
}) {
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const refundSelected = useRef(false);
  return (
    <div className="cost-inline-edit-actions">
      {editable && onEdit && (
        <Button
          data-cost-target={`item-cost-${id}`}
          variant="outline"
          size="sm"
          onClick={onEdit}
        >
          <Pencil size={14} aria-hidden="true" />
          Editar
        </Button>
      )}
      {allowRefund && (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button
              ref={menuTrigger}
              className="cost-row-overflow"
              variant="outline"
              size="icon"
              aria-label={`Mais ações para ${name}`}
            >
              <MoreVertical size={18} aria-hidden="true" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="dropdown cost-product-menu"
              align="end"
              sideOffset={8}
              onCloseAutoFocus={(event) => {
                if (!refundSelected.current) return;
                // Open the sheet after the menu releases focus, and retain its trigger for return focus.
                event.preventDefault();
                refundSelected.current = false;
                menuTrigger.current?.focus();
                onRefund(id);
              }}
            >
              <DropdownMenu.Item
                disabled={refundDisabled}
                onSelect={() => {
                  refundSelected.current = true;
                }}
              >
                Registrar reembolso
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </div>
  );
}
