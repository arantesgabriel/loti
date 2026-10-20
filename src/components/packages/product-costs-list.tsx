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
import "./product-costs.css";

type Detail = CostTrackingView;
type DetailItem = Detail["items"][number];
const money = (value: number | null | undefined) =>
  value == null ? "Pendente" : formatMoney(value);
function sumComponents(
  calculation: CostCalculation | undefined,
  startsWith: string,
) {
  if (!calculation) return null;
  const values =
    calculation.components.filter((component) =>
      component.name.startsWith(startsWith),
    ) ?? [];
  if (!values.length) {
    const unassignedUnits = calculation?.pendingComponents.some((component) =>
      component.endsWith("unidades sem pacote"),
    );
    if (
      unassignedUnits &&
      (startsWith === "Frete Brasil" || startsWith === "Receita")
    )
      return null;
    return 0;
  }
  return values.some((component) => component.amountCents === null)
    ? null
    : values.reduce((sum, component) => sum + (component.amountCents ?? 0), 0);
}
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
};

function productCostRows(detail: Detail): CostProductRow[] {
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
          },
        ];
      }),
    );
  return [...originalRows, ...additionalRows].sort(
    (a, b) => a.itemOrder - b.itemOrder || a.id.localeCompare(b.id),
  );
}

function productUnitsSummary(
  quantity: number,
  calculation: CostCalculation | undefined,
) {
  const cancelled = calculation?.cancelledQuantity ?? 0;
  const shipping = calculation?.shippingQuantity ?? quantity;
  return `${quantity} ${quantity === 1 ? "unidade comprada" : "unidades compradas"} · ${cancelled} ${cancelled === 1 ? "unidade cancelada" : "unidades canceladas"} · ${shipping} ${shipping === 1 ? "unidade enviável" : "unidades enviáveis"}`;
}

function capturedComponent(item: CostProductRow, name: string) {
  return (
    item.calculation?.components.find((component) => component.name === name)
      ?.amountCents ?? null
  );
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
  onRefund: (id: string) => void;
  onResumeOrder: (id: string) => void;
  onAssociate: (id: string) => void;
};

function productStatus(item: CostProductRow) {
  const refunds = item.original?.refunds ?? item.additional?.refunds ?? [];
  if (refunds.some((refund) => refund.status === "requested"))
    return { label: "Reembolso solicitado", kind: "partial" };
  if ((item.calculation?.cancelledQuantity ?? 0) > 0)
    return {
      label: refunds.some((refund) => refund.status === "received")
        ? "Reembolso recebido"
        : "Unidades canceladas",
      kind: "refunded",
    };
  return item.calculation?.totalCents != null
    ? { label: "Completo", kind: "complete" }
    : { label: "Parcial", kind: "partial" };
}
function rowTotal(item: CostProductRow) {
  const calculation = item.calculation;
  return calculation?.totalCents != null
    ? formatMoney(calculation.totalCents)
    : calculation?.hasKnownAmount
      ? formatMoney(calculation.partialCents)
      : "Pendente";
}
function packageComponentLabel(
  detail: Detail,
  item: CostProductRow,
  component: "Frete Brasil" | "Receita",
) {
  const amount = sumComponents(item.calculation, component);
  if (amount === null) return "Pendente";
  const packages = detail.packages.filter((pkg) =>
    pkg.items.some((row) => row.costItemId === item.id),
  );
  if (!packages.length && item.calculation?.shippingQuantity === 0)
    return "Não aplicável";
  const charges = packages.map((pkg) =>
    component === "Frete Brasil" ? pkg.brazilFreightCharge : pkg.customsCharge,
  );
  return charges.length &&
    charges.every((charge) => charge?.valueState === "no_charge")
    ? "Sem cobrança"
    : money(amount);
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
          {mobile ? ` · ${item.quantity} un.` : ""}
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
  onRefund,
  onResumeOrder,
  onAssociate,
}: Omit<Props, "expanded" | "onToggle"> & { item: CostProductRow }) {
  const calculation = item.calculation;
  const associations = detail.packages.filter((pkg) =>
    pkg.items.some((row) => row.costItemId === item.id),
  );
  const unassigned = Math.max(
    0,
    (calculation?.shippingQuantity ?? item.quantity) -
      (calculation?.allocatedQuantity ?? 0),
  );
  const qcId =
    item.origin === "purchase"
      ? `purchase:${item.original!.original.id}`
      : `additional:${item.additional!.item!.id}`;
  // Components are already allocated in cents by the domain, including captured additional-order bases.
  const values = [
    [
      "Preço do produto",
      item.effectivePriceState === "no_charge"
        ? "Sem cobrança"
        : money(capturedComponent(item, "Preço efetivo")),
    ],
    [
      "Frete China",
      item.chinaFreightState === "no_charge"
        ? "Sem cobrança"
        : money(capturedComponent(item, "Frete China")),
    ],
    ["Taxa de pagamento", money(sumComponents(calculation, "Taxa"))],
    ["Frete Brasil", packageComponentLabel(detail, item, "Frete Brasil")],
    ["Receita", packageComponentLabel(detail, item, "Receita")],
  ];
  const refunds = item.original?.refunds ?? item.additional?.refunds ?? [];
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
        {productUnitsSummary(item.quantity, calculation)}
        {associations.length
          ? ` · ${associations.map((pkg) => pkg.name).join(", ")}`
          : " · Sem pacote"}
      </p>
      {item.additional && (
        <p className="cost-inline-note">
          Produto{" "}
          {nativeAmountLabel(
            item.additional.cost.nativeProductState,
            item.additional.cost.nativeProductCnyMinor,
          )}{" "}
          · Frete China{" "}
          {nativeAmountLabel(
            item.additional.cost.nativeChinaState,
            item.additional.cost.nativeChinaCnyMinor,
          )}
        </p>
      )}
      {refunds.some((refund) => refund.status !== "voided") && (
        <dl className="cost-inline-refund">
          <div>
            <dt>Crédito recebido</dt>
            <dd>{money(calculation?.receivedRefundCents)}</dd>
          </div>
          <div>
            <dt>A receber</dt>
            <dd>{money(calculation?.requestedRefundCents)}</dd>
          </div>
          <div>
            <dt>Custo líquido residual</dt>
            <dd>{rowTotal(item)}</dd>
          </div>
        </dl>
      )}
      {!!calculation?.pendingComponents.length && (
        <p className="cost-inline-note">
          Falta informar: {calculation.pendingComponents.join(", ")}
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
  if (!rows.length)
    return (
      <>
        <div className="cost-products-toolbar">{props.toolbar}</div>
        <p className="muted cost-empty-note">
          Nenhum produto neste acompanhamento.
        </p>
      </>
    );
  return (
    <div className="cost-hybrid-products">
      <div className="cost-products-toolbar">
        <p className="cost-products-count">
          {rows.length} {rows.length === 1 ? "produto" : "produtos"}
          <span>Abra a composição para consultar custos e ações.</span>
        </p>
        <div>{props.toolbar}</div>
      </div>
      <div className="cost-table-wrap">
        <table className="cost-table cost-compact-table">
          <caption className="sr-only">Custos por produto</caption>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Qtd.</th>
              <th>Preço do produto</th>
              <th>Encargos</th>
              <th>Total líquido</th>
              <th>Situação e detalhes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const open = !!expanded[item.id],
                status = productStatus(item);
              const product = capturedComponent(item, "Preço efetivo");
              const knownCharges =
                item.calculation?.components.filter(
                  (component) =>
                    component.name !== "Preço efetivo" &&
                    component.amountCents !== null,
                ) ?? [];
              const charges = knownCharges.length
                ? knownCharges.reduce(
                    (sum, component) => sum + (component.amountCents ?? 0),
                    0,
                  )
                : null;
              return (
                <Fragment key={item.id}>
                  <tr
                    className={`cost-compact-row ${open ? "is-expanded" : ""}`}
                  >
                    <td>
                      <Identity item={item} purchaseId={detail.purchase.id} />
                    </td>
                    <td>{item.quantity}</td>
                    <td>
                      <strong>{money(product)}</strong>
                      <small className="cost-unit-note">
                        {item.quantity > 1
                          ? `${item.quantity} unidades`
                          : "Produto"}
                      </small>
                    </td>
                    <td>
                      <strong>{money(charges)}</strong>
                      <small className="cost-unit-note">
                        {item.calculation?.totalCents == null
                          ? "Parciais"
                          : "Fretes e taxas"}
                      </small>
                    </td>
                    <td>
                      <strong>{rowTotal(item)}</strong>
                      {(item.calculation?.receivedRefundCents ?? 0) > 0 && (
                        <small className="cost-unit-note">Após crédito</small>
                      )}
                    </td>
                    <td>
                      <div className="cost-compact-status">
                        <span className={`cost-row-status ${status.kind}`}>
                          {status.label}
                        </span>
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
            <article className="cost-product-mobile-card" key={item.id}>
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
          {detail.calculation.summary.shippingUnits}{" "}
          {detail.calculation.summary.shippingUnits === 1
            ? "unidade enviável"
            : "unidades enviáveis"}
          {detail.calculation.summary.cancelledUnits
            ? ` · ${detail.calculation.summary.cancelledUnits} ${detail.calculation.summary.cancelledUnits === 1 ? "cancelada" : "canceladas"}`
            : ""}
        </small>
        <span>
          {detail.calculation.summary.totalCents === null
            ? "Total parcial"
            : "Total final"}
          <strong>
            {detail.calculation.summary.hasKnownAmount
              ? formatMoney(
                  detail.calculation.summary.totalCents ??
                    detail.calculation.summary.partialCents,
                )
              : "Pendente"}
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
