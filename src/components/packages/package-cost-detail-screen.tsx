"use client";

import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  CircleCheck,
  LockKeyhole,
  MoreVertical,
  Minus,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/surface";
import { PackageSurface as Surface } from "./package-surface";
import type { CostTrackingView } from "@/lib/domain/package-cost-reading";
import {
  packageCostPresentation,
  type CostSectionKey,
} from "@/lib/domain/package-cost-presentation";
import { formatMoney } from "@/lib/domain/money";
import { formatCnyMinor } from "@/lib/domain/financial-money";
import {
  costRequest,
  percentFromBasisPoints,
  percentInputFromBasisPoints,
  basisPointsFromPercent,
  parseCostCents,
} from "./package-cost-client";
import { ProductCostsList } from "./product-costs-list";
import { ItemCostSurface } from "./item-cost-surface";
import { AdditionalProductEditor } from "./additional-product-editor";
import "./purchase-cost-header.css";
import "./package-cost-layout.css";
import "./package-cost-v4.css";
import "./package-content-editor.css";
import { RefundsSection } from "./refunds-section";
import {
  AdditionalOrdersPanel,
  FinancingSettlementSurface,
  type FinancingPosition,
} from "./additional-orders-panel";
import { QcImportPanel } from "@/components/qc/qc-components";

type Detail = CostTrackingView;
type DetailPackage = Detail["packages"][number];
type ChargeType = "products" | "brazil_freight" | "customs";
type ChargeEditor = { id: string; type: ChargeType; name: string };
type ItemEditor = { id: string; name: string };
type PaymentReset = { operation: string; rest: Record<string, unknown> };
type PackageAllocationLine = {
  id: string;
  name: string;
  variant: string | null;
  quantity: number;
  shippingQuantity: number;
  cancelledQuantity: number;
  participants: string[];
};
type FinancingSettlement = { orderId: string; position: FinancingPosition };

const money = (amount: number | null | undefined) =>
  amount === null || amount === undefined
    ? "Falta informar"
    : formatMoney(amount);
const logisticName = (status: string) =>
  status === "received"
    ? "Recebido"
    : status === "sent"
      ? "Enviado"
      : "Em preparação";
const unitsLabel = (count: number) =>
  `${count} ${count === 1 ? "unidade" : "unidades"}`;
function calculatedTotal(
  total: number | null | undefined,
  partial: number | null | undefined,
  hasKnownAmount: boolean | undefined,
) {
  if (total !== null && total !== undefined) return formatMoney(total);
  return hasKnownAmount ? formatMoney(partial ?? 0) : "Falta informar";
}
function amountInput(value: number | null) {
  return value === null ? "" : (value / 100).toFixed(2).replace(".", ",");
}
function packageAllocationLines(detail: Detail): PackageAllocationLine[] {
  const original = detail.items.map((item) => ({
    id: item.id,
    name: item.original.name,
    variant: item.original.variant,
    quantity: item.original.quantity,
    shippingQuantity:
      item.calculation?.shippingQuantity ?? item.original.quantity,
    cancelledQuantity: item.calculation?.cancelledQuantity ?? 0,
    participants: item.participants.map((person) => person.name),
  }));
  const additional = detail.productOrders
    .filter(
      (order) => order.kind === "additional" && order.state === "recorded",
    )
    .flatMap((order) =>
      order.items.map((row) => ({
        id: row.cost.id,
        name: row.item?.name ?? "Produto",
        variant: row.item?.variant ?? null,
        quantity: row.quantity,
        shippingQuantity: row.calculation?.shippingQuantity ?? row.quantity,
        cancelledQuantity: row.calculation?.cancelledQuantity ?? 0,
        participants: row.participants.map((person) => person.name),
      })),
    );
  return [...original, ...additional];
}
export function PackageCostDetailScreen({
  trackingId,
  orders = false,
  returnTo,
  focusItemId,
}: {
  trackingId: string;
  orders?: boolean;
  returnTo?: string;
  focusItemId?: string;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [itemEditor, setItemEditor] = useState<ItemEditor | null>(null),
    [chargeEditor, setChargeEditor] = useState<ChargeEditor | null>(null);
  const [itemDetailId, setItemDetailId] = useState<string | null>(null);
  const [closeConfirm, setCloseConfirm] = useState(false),
    [reopenOpen, setReopenOpen] = useState(false),
    [reopenReason, setReopenReason] = useState("");
  const [resetConfirm, setResetConfirm] = useState<PaymentReset | null>(null);
  const [refundItemId, setRefundItemId] = useState<string | null>(null);
  const [settlement, setSettlement] = useState<FinancingSettlement | null>(
    null,
  );
  const [resumeOrderId, setResumeOrderId] = useState<string | null>(null);
  const [additionalEditorId, setAdditionalEditorId] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<
    Record<CostSectionKey, boolean>
  >({ products: true, payments: true, packages: true, people: true });
  const [paymentsExpanded, setPaymentsExpanded] = useState(false);
  const [expandedProducts, setExpandedProducts] = useState<
    Record<string, boolean>
  >({});
  const [associateItemId, setAssociateItemId] = useState<string | null>(null);
  const [expandedPackages, setExpandedPackages] = useState<
    Record<string, boolean>
  >({});
  const focusTarget = useRef<string | null>(null);
  const initialProductFocusHandled = useRef(false);
  const [focusRequestId, setFocusRequestId] = useState(0);
  const url = `/api/packages/${encodeURIComponent(trackingId)}`;

  const setCurrentDetail = useCallback((value: Detail) => {
    setDetail(value);
  }, []);
  useEffect(() => {
    let active = true;
    void costRequest<Detail>(url).then((result) => {
      if (!active) return;
      if (result.status === 401)
        router.replace("/login?reason=session-expired");
      else if (result.ok && result.data) {
        setCurrentDetail(result.data);
        setError("");
      } else
        setError(
          result.error ?? "Não foi possível carregar este acompanhamento.",
        );
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [router, setCurrentDetail, url]);

  useEffect(() => {
    if (!focusRequestId) return;
    const requestedTarget = focusTarget.current;
    focusTarget.current = null;
    if (!requestedTarget) return;
    const target = [
      ...document.querySelectorAll<HTMLElement>("[data-cost-target]"),
    ].find(
      (element) =>
        element.dataset.costTarget === requestedTarget &&
        element.getClientRects().length > 0,
    );
    if (target) {
      target.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
      target.focus({ preventScroll: true });
    }
  }, [focusRequestId]);

  useEffect(() => {
    if (!orders || !focusItemId || !detail || initialProductFocusHandled.current)
      return;
    const exists =
      detail.items.some((item) => item.id === focusItemId) ||
      detail.productOrders.some((order) =>
        order.items.some((item) => item.cost.id === focusItemId),
      );
    initialProductFocusHandled.current = true;
    if (!exists) return;
    const target = [
      ...document.querySelectorAll<HTMLElement>("[data-cost-target]"),
    ].find(
      (element) =>
        element.dataset.costTarget === `order-product-${focusItemId}` &&
        element.getClientRects().length > 0,
    );
    if (target) {
      target.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
      target.focus({ preventScroll: true });
    }
  }, [detail, focusItemId, orders]);

  async function mutate(
    operation: string,
    rest: Record<string, unknown>,
    mayInvalidatePayment = false,
  ) {
    if (!detail || busy) return false;
    setBusy(true);
    const result = await costRequest<Detail>(url, { operation, ...rest });
    setBusy(false);
    if (result.status === 401) {
      router.replace("/login?reason=session-expired");
      return false;
    }
    if (result.ok && result.data) {
      if (operation === "order.additional.correct") {
        const correction = result.data.orderCorrections.find(row => row.previousOrderId === rest.orderId);
        const oldItem = detail.productOrders.find(order => order.id === rest.orderId)?.items.find(row => row.cost.id === (rest.input as { itemId?: string })?.itemId);
        const replacement = result.data.productOrders.find(order => order.id === correction?.replacementOrderId)?.items.find(row => row.cost.itemOrder === oldItem?.cost.itemOrder);
        if (replacement) {
          setExpandedProducts(current => ({ ...current, [replacement.cost.id]: true }));
          focusTarget.current = `item-cost-${replacement.cost.id}`;
          setFocusRequestId(current => current + 1);
        }
      }
      if (operation === "refund.request") {
        const costItemId = (rest.input as { costItemId?: string } | undefined)?.costItemId;
        if (costItemId) {
          setOpenSections(current => ({ ...current, payments: true }));
          focusTarget.current = `refund-group-${costItemId}`;
          setFocusRequestId(current => current + 1);
        }
      }
      setCurrentDetail(result.data);
      setError("");
      return true;
    }
    if (
      mayInvalidatePayment &&
      result.status === 409 &&
      result.error?.includes("Confirme")
    ) {
      setResetConfirm({ operation, rest });
      return false;
    }
    toast.error(result.error ?? "Não foi possível salvar.");
    return false;
  }

  async function confirmReset() {
    if (!resetConfirm || !detail) return;
    const { operation, rest } = resetConfirm;
    const input = {
      ...(rest.input as Record<string, unknown>),
      confirmPaymentReset: true,
    };
    setResetConfirm(null);
    await mutate(operation, { ...rest, input });
  }

  const locked = detail?.tracking.status === "closed";
  const totalUnits = detail?.calculation.summary.unitCount ?? 0;

  if (loading)
    return <p className="muted cost-loading">Carregando acompanhamento…</p>;
  if (!detail)
    return (
      <>
        <Link className="cost-back" href={orders ? returnTo ?? "/orders" : "/packages"}>
          <ArrowLeft size={16} />
          {orders ? "Pedidos" : "Pacotes"}
        </Link>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <EmptyState
          icon={Package}
          title="Acompanhamento indisponível"
          description="Ele pode não existir ou você pode não ter acesso a este grupo."
        />
      </>
    );

  const presentation = packageCostPresentation(detail);
  const nextAction = presentation.nextAction;

  function openNextAction() {
    if (!nextAction) return;
    if (nextAction.target === "close-costs") {
      setCloseConfirm(true);
      return;
    }
    setOpenSections((current) => ({ ...current, [nextAction.section]: true }));
    if (nextAction.section === "payments" && !nextAction.target.startsWith("refund-group-")) setPaymentsExpanded(true);
    if (nextAction.target.startsWith("item-cost-"))
      setExpandedProducts((current) => ({
        ...current,
        [nextAction.target.slice("item-cost-".length)]: true,
      }));
    if (nextAction.packageId)
      setExpandedPackages((current) => ({
        ...current,
        [nextAction.packageId!]: true,
      }));
    focusTarget.current = nextAction.target;
    setFocusRequestId((current) => current + 1);
  }

  function openRefundRequest(id: string) {
    setOpenSections((current) => ({ ...current, payments: true }));
    setRefundItemId(id);
  }

  function openRefundDetails(id: string) {
    setOpenSections(current => ({ ...current, payments: true }));
    focusTarget.current = `refund-group-${id}`;
    setFocusRequestId(current => current + 1);
  }

  async function saveAllocations(
    packageId: string,
    draft: Record<string, number>,
  ) {
    if (!detail) return;
    const lines = packageAllocationLines(detail);
    const allocations = lines.map((item) => ({
      costItemId: item.id,
      quantity: draft[item.id] ?? 0,
    }));
    const invalid = lines.some(
      (item) =>
        detail.packages
          .filter((pkg) => pkg.id !== packageId)
          .reduce(
            (sum, pkg) =>
              sum +
              (pkg.items.find((row) => row.costItemId === item.id)?.quantity ??
                0),
            0,
          ) +
          (draft[item.id] ?? 0) >
        item.shippingQuantity,
    );
    if (invalid) {
      toast.error(
        "A soma das unidades dos pacotes não pode superar as unidades disponíveis para envio.",
      );
      return false;
    }
    const rest = {
      input: {
        expectedRevision: detail.tracking.revision,
        packageId,
        allocations,
      },
    };
    return mutate("package.allocations", rest, true);
  }

  async function unsealPackage(pkg: DetailPackage, reason: string) {
    if (!detail) return false;
    const ok = await mutate("package.content.unseal", {
      packageId: pkg.id,
      input: { expectedRevision: detail.tracking.revision, reason },
    });
    if (ok) toast.success("Conteúdo reaberto para conferência");
    return ok;
  }

  async function saveProductMethod(method: string) {
    if (!detail?.productsCharge) return;
    const selected = method === "" ? null : (method as "pix" | "card");
    const fee =
      selected === "pix"
        ? detail.settings.pixBps
        : selected === "card"
          ? detail.settings.cardBps
          : null;
    await mutate(
      "charge.save",
      {
        chargeId: detail.productsCharge.id,
        input: {
          expectedRevision: detail.tracking.revision,
          chargeType: "products",
          paymentMethod: selected,
          ...(fee === null ? {} : { feeBps: fee }),
        },
      },
      true,
    );
  }

  async function markPaid(chargeId: string) {
    await mutate("charge.paid", {
      chargeId,
      input: { expectedRevision: detail!.tracking.revision },
    });
  }

  async function savePackage(
    pkg: DetailPackage,
    name: string,
    logisticsStatus: string,
  ) {
    if (!detail) return false;
    const ok = await mutate("package.save", {
      packageId: pkg.id,
      input: {
        expectedRevision: detail.tracking.revision,
        name,
        logisticsStatus,
      },
    });
    if (ok) toast.success("Pacote atualizado");
    return ok;
  }

  async function startCreatePackage() {
    if (!detail) return false;
    const name = `Pacote ${detail.packages.length + 1}`;
    const ok = await mutate("package.create", {
      input: { expectedRevision: detail.tracking.revision, name },
    });
    if (ok) toast.success(`${name} criado`);
    return ok;
  }

  async function closeTracking() {
    if (!detail) return;
    const ok = await mutate("tracking.close", {
      input: { expectedRevision: detail.tracking.revision, confirmed: true },
    });
    if (ok) {
      setCloseConfirm(false);
      toast.success("Acompanhamento encerrado");
    }
  }

  async function reopenTracking(event: React.FormEvent) {
    event.preventDefault();
    if (!detail) return;
    const ok = await mutate("tracking.reopen", {
      input: {
        expectedRevision: detail.tracking.revision,
        confirmed: true,
        reason: reopenReason,
      },
    });
    if (ok) {
      setReopenOpen(false);
      setReopenReason("");
      toast.success("Acompanhamento reaberto");
    }
  }

  const products = detail.calculation.productsCharge;
  const productsCharge = detail.productsCharge;
  const productsRate = products.feeCents === null ? null : products.feeCents;
  const productsPaid = productsCharge?.paymentStatus === "paid";
  const lastEdited = detail.tracking.updatedAt
    ? new Date(detail.tracking.updatedAt).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      })
    : "";
  const updatedByName =
    detail.members.find((person) => person.id === detail.tracking.updatedBy)
      ?.name ?? "membro";
  const finalizedDate = detail.purchase.finalizedAt
    ? new Date(detail.purchase.finalizedAt).toLocaleDateString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      })
    : "—";

  return (
    <>
      <div className="cost-v4">
      <Link className="cost-back" href={orders ? returnTo ?? "/orders" : "/packages"}>
        <ArrowLeft size={16} />
        {orders ? "Pedidos" : "Pacotes"}
      </Link>
      <header className="cost-purchase-header">
        <div className="cost-purchase-header-main">
          <div className="cost-purchase-title-row">
            <h1>{detail.purchase.name}</h1>
            <div
              className="cost-purchase-statuses"
              aria-label="Situação da compra e dos custos"
            >
              <span className="cost-status">
                <span className="sr-only">Compra </span>finalizada
              </span>
              <span className={`cost-status ${locked ? "closed" : "open"}`}>
                {locked ? (
                  <>
                    <LockKeyhole size={12} aria-hidden="true" />
                    Custos encerrados
                  </>
                ) : (
                  "Custos abertos"
                )}
              </span>
            </div>
          </div>
          <div className="cost-purchase-facts">
            <time
              dateTime={
                detail.purchase.finalizedAt
                  ? new Date(detail.purchase.finalizedAt).toISOString()
                  : undefined
              }
            >
              <span className="sr-only">Finalizada em </span>
              {finalizedDate}
            </time>
            <span>
              {unitsLabel(totalUnits)}{" "}
              {totalUnits === 1 ? "comprada" : "compradas"}
            </span>
            {!!detail.calculation.summary.cancelledUnits && (
              <span>
                {detail.calculation.summary.cancelledUnits}{" "}
                {detail.calculation.summary.cancelledUnits === 1
                  ? "unidade cancelada"
                  : "unidades canceladas"}
              </span>
            )}
          </div>
        </div>
        <div className="cost-purchase-actions">
          <QcImportPanel
            compact
            purchaseId={detail.purchase.id}
            targets={[
              ...detail.items.map((item) => ({
                id: `purchase:${item.original.id}`,
                origin: "purchase" as const,
                name: item.original.name,
                variant: item.original.variant,
                quantity: item.original.quantity,
              })),
              ...detail.productOrders
                .filter(
                  (order) =>
                    order.kind === "additional" && order.state === "recorded",
                )
                .flatMap((order) =>
                  order.items.flatMap((row) =>
                    row.item
                      ? [
                          {
                            id: `additional:${row.item.id}`,
                            origin: "additional" as const,
                            name: row.item.name,
                            variant: row.item.variant,
                            quantity: row.item.quantity,
                          },
                        ]
                      : [],
                  ),
                ),
            ]}
          />
          {locked && (
            <Button
              aria-label="Reabrir acompanhamento"
              variant="outline"
              size="sm"
              onClick={() => setReopenOpen(true)}
            >
              <RotateCcw size={14} aria-hidden="true" />
              Reabrir
            </Button>
          )}
        </div>
        <div className="cost-purchase-footer">
          <div className="cost-purchase-audit">
            <p>
              Atualizado por <strong>{updatedByName}</strong>
              {lastEdited && (
                <>
                  {" "}
                  ·{" "}
                  <time
                    dateTime={new Date(detail.tracking.updatedAt).toISOString()}
                  >
                    {lastEdited}
                  </time>
                </>
              )}
            </p>
            {detail.purchase.hubbuyAccount && (
              <p className="cost-purchase-account">
                Conta HubBuy: {detail.purchase.hubbuyAccount}
              </p>
            )}
          </div>
          <Link
            className="cost-purchase-accounts-link"
            href="/packages/accounts"
          >
            Gerenciar contas HubBuy<span aria-hidden="true"> ↗</span>
          </Link>
        </div>
      </header>

      <div className={`cost-summary-card ${detail.financialDisplay.refundGroups.length ? "has-refunds" : ""}`}>
        <div className="cost-summary-total">
          <div>
            <span>Custo líquido atual</span>
            <span className="cost-summary-status" role="status">
              {presentation.isPartial ? "Parcial" : "Final"}
            </span>
          </div>
          <strong>
            {presentation.hasKnownAmount
              ? formatMoney(presentation.totalCents)
              : "Falta informar"}
          </strong>
        </div>
        {detail.financialDisplay.refundGroups.length > 0 && <div className="cost-summary-breakdown">
          <div><span>Produtos ainda no pedido</span><strong>{detail.financialDisplay.summary.remaining.finalCents !== null ? formatMoney(detail.financialDisplay.summary.remaining.finalCents) : detail.financialDisplay.summary.remaining.hasKnownAmount ? `Parcial · ${formatMoney(detail.financialDisplay.summary.remaining.knownCents)}` : "Falta informar"}</strong></div>
          <div><span>{detail.financialDisplay.summary.cancelledAwaitingReceipt ? "Custos mantidos até agora" : "Custos mantidos no reembolso"}</span><strong>{formatMoney(detail.financialDisplay.summary.cancelledRetainedCents)}</strong></div>
          {detail.financialDisplay.summary.requestedRefundCents > 0 && <p>A receber {formatMoney(detail.financialDisplay.summary.requestedRefundCents)} · o valor solicitado não reduz o custo atual.</p>}
        </div>}
        {nextAction && (
          <div className="cost-next-action">
            <span>Próxima tarefa</span>
            <Button
              variant={
                nextAction.target === "close-costs" ? "default" : "outline"
              }
              data-cost-target="next-action"
              onClick={openNextAction}
            >
              {nextAction.label}
            </Button>
          </div>
        )}
      </div>

      <ProgressiveSection
        id="products"
        title="Produtos e custos"
        summary={presentation.productsSummary}
        open={openSections.products}
        onToggle={() =>
          setOpenSections((current) => ({
            ...current,
            products: !current.products,
          }))
        }
      >
        <div
          className="cost-section-content"
          aria-labelledby="cost-section-products-title"
        >
          <ProductCostsList
            toolbar={
              <AdditionalOrdersPanel
                detail={detail}
                locked={!!locked}
                busy={busy}
                mutate={mutate}
                createPackage={startCreatePackage}
                resumeOrderId={resumeOrderId}
                onResumeHandled={() => setResumeOrderId(null)}
              />
            }
            detail={detail}
            locked={!!locked}
            onDetails={setItemDetailId}
            onEditAdditional={setAdditionalEditorId}
            onEdit={(item) =>
              setItemEditor({ id: item.id, name: item.original.name })
            }
            onRefund={openRefundRequest}
            onRefundDetails={openRefundDetails}
            expanded={expandedProducts}
            onToggle={(id) =>
              setExpandedProducts((current) => ({
                ...current,
                [id]: !current[id],
              }))
            }
            onAssociate={setAssociateItemId}
            onResumeOrder={setResumeOrderId}
          />
        </div>
      </ProgressiveSection>

      <ProgressiveSection
        id="payments"
        title="Pagamentos e reembolsos"
        summary="Pagamentos, saldo HubBuy e devoluções"
        open={openSections.payments}
        onToggle={() =>
          setOpenSections((current) => ({
            ...current,
            payments: !current.payments,
          }))
        }
      >
        <div className="cost-section-content">
          <div className="cost-payments-heading"><h3>Pagamentos da compra</h3><span>{1 + detail.productOrders.filter(order => order.kind === "additional" && order.state === "recorded").length} registros</span></div>
          <div className="cost-payment-register">
            <button type="button" className="cost-payment-register-row" aria-label={paymentsExpanded ? "Ocultar pagamentos" : "Ver pagamentos"} aria-expanded={paymentsExpanded} aria-controls="cost-payment-history" onClick={() => setPaymentsExpanded(value => !value)}>
              <span className="cost-payment-number">01</span>
              <span className="cost-payment-register-name"><strong>Pedido original</strong><small>{finalizedDate} · {productsPaid ? "Pagamento confirmado" : "Pagamento pendente"}</small></span>
              <span className="cost-payment-register-source"><span>{productsCharge?.paymentMethod === "pix" ? "Pix" : productsCharge?.paymentMethod === "card" ? "Cartão" : "Método não definido"} · Base {money(products.baseCents)}</span><small>Taxa: {money(productsRate)}</small></span>
              <span className={`cost-payment-register-status ${productsPaid ? "paid" : ""}`}>{productsPaid ? "Pago" : "Pendente"}</span>
              <strong className="cost-payment-register-total">{money(products.totalCents)}</strong><span className="cost-payment-register-details">Detalhes {paymentsExpanded ? "⌃" : "›"}</span>
            </button>
          </div>
          <div id="cost-payment-history" hidden={!paymentsExpanded}>
          {paymentsExpanded && <div className="cost-payment-history">
          <div aria-labelledby="product-payment-title">
          <div className="cost-product-payment-panel">
            <div className="cost-product-payment">
              <p
                id="product-payment-title"
                className="muted cost-payment-scope"
              >
                Pagamento dos produtos e frete China da compra original. Pedidos
                adicionais têm pagamento próprio.
              </p>
              <div className="cost-payment-order-heading">
                <strong>Pedido original</strong>
                <span>{money(products.totalCents)} · {productsPaid ? "Pago" : "Pagamento pendente"} · {productsCharge?.paymentMethod === "pix" ? "Pix" : productsCharge?.paymentMethod === "card" ? "Cartão" : "Método não definido"}</span>
                {productsCharge?.paidAt && <small>{new Date(productsCharge.paidAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}{productsCharge.paidBy ? ` · ${detail.members.find(person => person.id === productsCharge.paidBy)?.name ?? "Membro"}` : ""}</small>}
              </div>
              {products.baseCents === null && (
                <p className="cost-payment-requirement">
                  Para configurar e confirmar esta cobrança, informe os campos
                  pendentes:{" "}
                  {detail.items
                    .flatMap((item) =>
                      [
                        item.effectivePriceState === "pending"
                          ? `${item.original.name} · preço efetivo`
                          : null,
                        item.chinaFreightState === "pending"
                          ? `${item.original.name} · frete China`
                          : null,
                      ].filter((value): value is string => value !== null),
                    )
                    .join("; ") || "a composição dos produtos"}
                  .
                </p>
              )}
              <div className="cost-product-payment-summary" role="group" aria-label="Composição da cobrança do pedido original">
                <div className="cost-product-payment-metric">
                  <span className="cost-detail-label">Base original</span>
                  <strong>{money(products.baseCents)}</strong>
                </div>
                <div className="cost-product-payment-metric">
                  <span className="cost-detail-label">
                    Taxa{" "}
                    {productsCharge?.feeBps === null ||
                    productsCharge?.feeBps === undefined
                      ? "pendente"
                      : `${percentFromBasisPoints(productsCharge.feeBps)}%`}
                  </span>
                  <strong>{money(productsRate)}</strong>
                </div>
                <div className="cost-product-payment-metric">
                  <span className="cost-detail-label">Total da cobrança original</span>
                  <strong>{money(products.totalCents)}</strong>
                </div>
              </div>
              <div className="cost-product-payment-settings">
                <div
                  className={`cost-product-payment-controls ${locked ? "locked" : ""}`}
                  role="group"
                  aria-label="Ações do pagamento dos produtos"
                >
                  <label>
                    Método
                    <select
                      data-cost-target="products-method"
                      disabled={!!locked || busy || products.baseCents === null}
                      value={productsCharge?.paymentMethod ?? ""}
                      onChange={(event) =>
                        void saveProductMethod(event.target.value)
                      }
                    >
                      <option value="">Escolher método</option>
                      <option value="pix">
                        Pix · padrão{" "}
                        {percentFromBasisPoints(detail.settings.pixBps)}%
                      </option>
                      <option value="card">
                        Cartão · padrão{" "}
                        {percentFromBasisPoints(detail.settings.cardBps)}%
                      </option>
                    </select>
                  </label>
                  {!locked && productsCharge && (
                    <Button
                      className="cost-payment-edit"
                      variant="outline"
                      disabled={busy || products.baseCents === null}
                      onClick={() =>
                        setChargeEditor({
                          id: productsCharge.id,
                          type: "products",
                          name: "Pagamento dos produtos",
                        })
                      }
                    >
                      Editar taxa
                    </Button>
                  )}
                  {!locked && productsCharge?.paymentStatus === "pending" && (
                    <Button
                      className="cost-payment-confirm"
                      data-cost-target="products-paid"
                      disabled={
                        busy ||
                        products.totalCents === null ||
                        ((products.baseCents ?? 0) > 0 &&
                          !productsCharge.paymentMethod)
                      }
                      onClick={() => void markPaid(productsCharge.id)}
                    >
                      Marcar como pago
                    </Button>
                  )}
                  {productsPaid && (
                    <span className="cost-payment-readonly" role="status">
                      <CircleCheck size={14} aria-hidden="true" />
                      Pagamento confirmado
                    </span>
                  )}
                </div>
              </div>
              <p className="muted cost-hint">
                O percentual fica registrado nesta cobrança mesmo se o padrão do
                grupo mudar.
              </p>
            </div>
          </div>
          </div>
          </div>}
          </div>
          <AdditionalPaymentHistory onPackages={() => {
            setOpenSections(current => ({ ...current, packages: true }));
            focusTarget.current = "packages-section";
            setFocusRequestId(current => current + 1);
          }} detail={detail}/>
        </div>
        <RefundsSection
          detail={detail}
          locked={!!locked}
          busy={busy}
          requestItemId={refundItemId}
          onRequestClose={() => setRefundItemId(null)}
          onDetails={setItemDetailId}
          mutate={mutate}
        />
      </ProgressiveSection>

      {!orders && <ProgressiveSection
        id="packages"
        title="Pacotes"
        summary={presentation.packagesSummary}
        open={openSections.packages}
        onToggle={() =>
          setOpenSections((current) => ({
            ...current,
            packages: !current.packages,
          }))
        }
        action={
          !locked && (
            <Button
              data-cost-target="package-create"
              variant="outline"
              onClick={() => void startCreatePackage()}
              disabled={busy}
            >
              <Plus size={16} />
              Novo pacote
            </Button>
          )
        }
        mobileAction={
          !locked && (
            <Button
              variant="outline"
              onClick={() => void startCreatePackage()}
              disabled={busy}
            >
              <Plus size={16} />
              Novo pacote
            </Button>
          )
        }
      >
        <div
          className="cost-section-content"
          aria-labelledby="cost-section-packages-title"
        >
          {!detail.packages.length ? (
            <EmptyState
              icon={Package}
              title="Adicione um pacote"
              description="Separe os produtos como chegam em cada envio."
            />
          ) : (
            <div className="cost-package-list">
              {detail.packages.map((pkg) => (
                <PackageCard
                  key={pkg.id}
                  pkg={pkg}
                  detail={detail}
                  expanded={!!expandedPackages[pkg.id]}
                  onExpandedChange={(open) =>
                    setExpandedPackages((current) => ({
                      ...current,
                      [pkg.id]: open,
                    }))
                  }
                  locked={!!locked}
                  busy={busy}
                  savePackage={savePackage}
                  saveAllocations={(draft) => saveAllocations(pkg.id, draft)}
                  unsealPackage={(reason) => unsealPackage(pkg, reason)}
                  openCharge={(charge) => setChargeEditor(charge)}
                  markPaid={markPaid}
                  mutate={mutate}
                />
              ))}
            </div>
          )}
        </div>
      </ProgressiveSection>

      }
      <ProgressiveSection
        id="people"
        title="Divisão por pessoa"
        summary={presentation.peopleSummary}
        open={openSections.people}
        onToggle={() =>
          setOpenSections((current) => ({
            ...current,
            people: !current.people,
          }))
        }
      >
        <div
          className="cost-section-content"
          aria-labelledby="cost-section-people-title"
        >
          {detail.calculation.summary.undistributedCents > 0 && (
            <p className="cost-undistributed" role="status">
              Há {formatMoney(detail.calculation.summary.undistributedCents)} em
              valores conhecidos sem divisão definida. Os totais pessoais exibem
              apenas as parcelas que já podem ser calculadas.
            </p>
          )}
          <p className="cost-people-explanation">
            Unidades individuais somam as quantidades dos itens atribuídos a uma só pessoa. Itens compartilhados contam uma linha do produto por participante, independentemente da quantidade.
          </p>
          <ul className="cost-people-list">
            {detail.memberTotals.map((person) => (
              <li key={person.personId}>
                <Avatar name={person.name} />
                <span>
                  <strong>{person.name}</strong>
                  <small>
                    {unitsLabel(person.personalUnits)}{" individuais"}
                    {person.sharedItems
                      ? ` · ${person.sharedItems} ${person.sharedItems === 1 ? "item compartilhado" : "itens compartilhados"}`
                      : ""}
                    {person.receivedRefundCents > 0
                      ? ` · Crédito recebido: ${formatMoney(person.receivedRefundCents)}`
                      : ""}
                    {person.requestedRefundCents
                      ? ` · A receber ${formatMoney(person.requestedRefundCents)}`
                      : ""}
                  </small>
                </span>
                <span className="cost-person-total">
                  <strong>
                    {person.hasKnownAmount
                      ? formatMoney(person.totalCents)
                      : person.pending
                        ? "Falta informar"
                        : formatMoney(person.totalCents)}
                  </strong>
                  {person.pending && <small>Parcial</small>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </ProgressiveSection>

      {associateItemId && (
        <ProductAssociationSurface
          detail={detail}
          itemId={associateItemId}
          busy={busy}
          onClose={() => setAssociateItemId(null)}
          saveAllocations={saveAllocations}
        />
      )}
      {additionalEditorId && detail.productOrders.some(order => order.items.some(row => row.cost.id === additionalEditorId)) && (
        <AdditionalProductEditor key={additionalEditorId} detail={detail} itemId={additionalEditorId} busy={busy} onClose={() => setAdditionalEditorId(null)} mutate={mutate}/>
      )}
      {itemEditor && (
        <ItemCostSurface
          key={itemEditor.id}
          detail={detail}
          editor={itemEditor}
          busy={busy}
          onClose={() => setItemEditor(null)}
          onSave={async (input) => {
            const ok = await mutate("item.save", { input }, true);
            if (ok) {
              setItemEditor(null);
              toast.success("Custos do produto atualizados");
            }
          }}
        />
      )}
      {itemDetailId && (
        <ItemBreakdownSurface
          detail={detail}
          itemId={itemDetailId}
          locked={!!locked}
          onClose={() => setItemDetailId(null)}
          onSettle={setSettlement}
        />
      )}
      {chargeEditor && (
        <ChargeSurface
          key={chargeEditor.id}
          detail={detail}
          editor={chargeEditor}
          busy={busy}
          onClose={() => setChargeEditor(null)}
          onSave={async (input) => {
            const ok = await mutate(
              "charge.save",
              { chargeId: chargeEditor.id, input },
              true,
            );
            if (ok) {
              setChargeEditor(null);
              toast.success("Cobrança atualizada");
            }
          }}
        />
      )}
      <Confirm
        open={closeConfirm}
        title="Encerrar acompanhamento?"
        description="Os custos ficarão somente para leitura. Você poderá reabrir depois informando o motivo."
        label="Encerrar custos"
        busy={busy}
        onOpenChange={setCloseConfirm}
        onConfirm={() => void closeTracking()}
      />
      <Surface
        open={reopenOpen}
        mobileFullScreen
        onOpenChange={(value) => {
          if (!busy) setReopenOpen(value);
        }}
        title="Reabrir acompanhamento"
        description="Informe por que os custos precisam de ajustes. A reabertura fica registrada no histórico."
      >
        <form onSubmit={(event) => void reopenTracking(event)}>
          <label>
            Motivo
            <textarea
              required
              maxLength={1000}
              rows={3}
              value={reopenReason}
              onChange={(event) => setReopenReason(event.target.value)}
            />
          </label>
          <div className="form-actions">
            <Button
              type="button"
              variant="outline"
              onClick={() => setReopenOpen(false)}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={busy || !reopenReason.trim()}>
              {busy ? "Reabrindo…" : "Confirmar reabertura"}
            </Button>
          </div>
        </form>
      </Surface>
      <Confirm
        open={!!resetConfirm}
        title="Voltar pagamento para pendente?"
        description="A edição altera o valor desta cobrança. Será preciso confirmar novamente o pagamento depois de salvar."
        label="Salvar e invalidar pagamento"
        danger
        busy={busy}
        onOpenChange={(value) => {
          if (!value && !busy) setResetConfirm(null);
        }}
        onConfirm={() => void confirmReset()}
      />
      {settlement && (
        <FinancingSettlementSurface
          orderId={settlement.orderId}
          position={settlement.position}
          detail={detail}
          busy={busy}
          onClose={() => setSettlement(null)}
          onSubmit={async (input) => {
            const ok = await mutate("order.additional.settle", { input });
            if (ok) {
              setSettlement(null);
              toast.success("Acerto da posição registrado.");
            }
          }}
        />
      )}
      </div>
    </>
  );
}

function ProgressiveSection({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
  action,
  mobileAction,
}: {
  id: CostSectionKey;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  action?: React.ReactNode;
  mobileAction?: React.ReactNode;
}) {
  const panelId = `cost-section-${id}-content`;
  return (
    <section
      className={`cost-section cost-progressive ${open ? "expanded" : ""}`}
      aria-labelledby={`cost-section-${id}-title`}
    >
      <div className="cost-progressive-header">
        <button
          className="cost-progressive-toggle"
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          data-cost-target={id === "packages" ? "packages-section" : undefined}
          onClick={onToggle}
        >
          <span>
            <strong id={`cost-section-${id}-title`}>{title}</strong>
            <small>{summary}</small>
          </span>
          <ChevronDown className={open ? "expanded" : ""} size={19} />
        </button>
        {action && <div className="cost-progressive-action">{action}</div>}
      </div>
      <div className="cost-progressive-body" id={panelId} hidden={!open}>
        {open && (
          <>
            {children}
            {mobileAction && (
              <div className="cost-progressive-mobile-action">
                {mobileAction}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function AdditionalPaymentHistory({ detail, onPackages }: { detail: Detail; onPackages: () => void }) {
  const orders = detail.productOrders.filter(order => order.kind === "additional" && order.state === "recorded");
  const corrections = detail.orderCorrections;
  const paymentLabel = (source: string) => source === "balance" ? "Saldo HubBuy" : source === "pix" ? "Pix" : "Cartão";
  return <div className="cost-payment-history-extra">
    <section className="cost-history-orders" aria-labelledby="additional-payments-title">
      <h3 id="additional-payments-title">Pedidos adicionais vigentes</h3>
      {orders.map((order, index) => <details className="cost-history-order" key={order.id}>
        <summary className="cost-payment-register-row"><span className="cost-payment-number">{String(index + 2).padStart(2, "0")}</span><span className="cost-payment-register-name"><strong>Pedido adicional{order.externalReference ? ` · ${order.externalReference}` : ""}</strong><small>{order.recordedAt ? new Date(order.recordedAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Data não registrada"} · Produtos para a mesma compra</small></span><span className="cost-payment-register-source"><span>{order.paymentComponents.map(component => component.sourceType === "balance" ? `Saldo HubBuy · ${formatCnyMinor(component.cnyMinor)} (histórico)` : paymentLabel(component.sourceType)).join(" + ")}</span><small>{order.paymentComponents.some(component => component.feeBrlCents > 0) ? `Taxa: ${formatMoney(order.paymentComponents.reduce((sum, component) => sum + component.feeBrlCents, 0))}` : "Sem taxa de processamento"}</small></span><span className="cost-payment-register-status">Registrado</span><strong className="cost-payment-register-total">{formatMoney(order.totalCostBrlCents)}</strong><span className="cost-payment-register-details">Detalhes ›</span></summary>
        <div className="cost-additional-payment-details">
        <header><div><strong>{order.externalReference ? `Pedido adicional · ${order.externalReference}` : "Pedido adicional"}</strong><small>{order.recordedAt ? new Date(order.recordedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }) : "Data não registrada"}{order.account ? ` · ${order.account.label}` : ""}</small></div><span>Registrado</span></header>
        <dl><div><dt>Custo histórico</dt><dd>{formatMoney(order.totalCostBrlCents)}</dd></div><div><dt>Dinheiro novo</dt><dd>{formatMoney(order.newMoneyBrlCents)}</dd></div>{order.historicalBrlCents > 0 && <div><dt>Base histórica do saldo</dt><dd>{formatMoney(order.historicalBrlCents)}</dd></div>}</dl>
        <ul aria-label="Fontes de pagamento do pedido adicional">
          {order.paymentComponents.map(component => <li key={component.id}>
            <strong>{paymentLabel(component.sourceType)}</strong>
            <span>{component.sourceType === "balance" ? `${formatMoney(component.principalBrlCents)} de base histórica · ${formatCnyMinor(component.cnyMinor)}` : `${formatMoney(component.principalBrlCents + component.feeBrlCents)} de dinheiro novo · ${formatMoney(component.principalBrlCents)} de base${component.feeBrlCents ? ` · ${formatMoney(component.feeBrlCents)} de taxa` : ""}`}</span>
          </li>)}
        </ul>
      </div></details>)}
    </section>
    {corrections.length > 0 && <details className="cost-payment-corrections"><summary>Pedidos substituídos · {corrections.length}</summary>{corrections.map(correction => <p key={correction.id}><strong>Pedido anterior · {formatMoney(correction.previousTotalBrlCents)}</strong><span>Substituído por um pedido adicional vigente · {correction.actorName} · {new Date(correction.recordedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}{correction.reason ? ` · ${correction.reason}` : ""}</span></p>)}</details>}
    {detail.packages.length > 0 && <p className="cost-package-charge-link"><button type="button" onClick={onPackages}>Frete Brasil e Receita</button> são informados por pacote, na seção abaixo.</p>}
  </div>;
}

function displayedValue(state: string, cents: number | null | undefined) {
  if (state === "no_charge") return "Sem cobrança";
  if (state !== "known" || cents === null || cents === undefined)
    return "Falta informar";
  return formatMoney(cents);
}

function ProductAssociationSurface({
  detail,
  itemId,
  busy,
  onClose,
  saveAllocations,
}: {
  detail: Detail;
  itemId: string;
  busy: boolean;
  onClose: () => void;
  saveAllocations: (
    packageId: string,
    draft: Record<string, number>,
  ) => Promise<boolean | undefined>;
}) {
  const item = packageAllocationLines(detail).find((row) => row.id === itemId)!;
  const eligible = detail.packages.filter(
    (pkg) =>
      pkg.logisticsStatus === "preparing" &&
      pkg.contentSealSource === null &&
      pkg.contentSealedAt === null,
  );
  const [packageId, setPackageId] = useState(eligible[0]?.id ?? "");
  const available = Math.max(
    0,
    item.shippingQuantity -
      detail.packages.reduce(
        (sum, pkg) =>
          sum +
          (pkg.items.find((row) => row.costItemId === itemId)?.quantity ?? 0),
        0,
      ),
  );
  const [quantity, setQuantity] = useState(available);
  const selected = eligible.find((pkg) => pkg.id === packageId);
  return (
    <Surface
      sheet
      open
      title="Associar ao pacote"
      subtitle={item.name}
      description={`${available} unidades disponíveis. O conteúdo atual do pacote será preservado.`}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!selected || quantity < 1 || quantity > available) return;
          const draft = Object.fromEntries(
            selected.items.map((row) => [row.costItemId, row.quantity]),
          );
          draft[itemId] = (draft[itemId] ?? 0) + quantity;
          if (await saveAllocations(selected.id, draft)) {
            toast.success("Produto associado ao pacote");
            onClose();
          }
        }}
      >
        {eligible.length ? (
          <>
            <label>
              Pacote
              <select
                value={packageId}
                disabled={busy}
                onChange={(event) => setPackageId(event.target.value)}
              >
                {eligible.map((pkg) => (
                  <option value={pkg.id} key={pkg.id}>
                    {pkg.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Unidades para associar
              <input
                required
                type="number"
                min={1}
                max={available}
                step={1}
                value={quantity}
                disabled={busy}
                onChange={(event) => setQuantity(Number(event.target.value))}
              />
            </label>
          </>
        ) : (
          <p className="muted">
            Crie um pacote em preparação ou reabra seu conteúdo na seção
            Pacotes.
          </p>
        )}
        <div className="form-actions">
          <Button
            variant="outline"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            disabled={
              busy ||
              !selected ||
              !Number.isInteger(quantity) ||
              quantity < 1 ||
              quantity > available
            }
            type="submit"
          >
            {busy ? "Salvando…" : "Associar produto"}
          </Button>
        </div>
      </form>
    </Surface>
  );
}

function ItemBreakdownSurface({
  detail,
  itemId,
  locked,
  onClose,
  onSettle,
}: {
  detail: Detail;
  itemId: string;
  locked: boolean;
  onClose: () => void;
  onSettle: (value: FinancingSettlement) => void;
}) {
  const item = detail.items.find((value) => value.id === itemId);
  if (!item) {
    const orderRow = detail.productOrders
      .flatMap((order) => order.items.map((row) => ({ order, row })))
      .find(
        (entry) =>
          entry.row.cost.id === itemId &&
          entry.order.kind === "additional" &&
          entry.order.state === "recorded",
      );
    if (!orderRow || !orderRow.row.item) return null;
    const { order, row } = orderRow;
    const additionalItem = row.item!;
    const calculation = row.calculation;
    return (
      <Surface
        sheet
        open
        title="Composição dos custos"
        subtitle={additionalItem.name}
        description="Custos capturados no pedido adicional, encargos, reembolsos e divisão atual desta linha."
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <div className="cost-breakdown-list">
          <span className="cost-additional-origin-flag">Pedido adicional</span>
          <h3>Pedido e valor líquido</h3>
          <div>
            <span>Conta HubBuy</span>
            <strong>{order.account?.label ?? "Conta removida"}</strong>
          </div>
          <div>
            <span>Valor do pedido</span>
            <strong>
              {order.nativeCnyMinor === null
                ? "Não informado"
                : formatCnyMinor(order.nativeCnyMinor)}
            </strong>
          </div>
          <div>
            <span>Unidades compradas</span>
            <strong>{row.quantity}</strong>
          </div>
          <div>
            <span>Unidades canceladas</span>
            <strong>{calculation?.cancelledQuantity ?? 0}</strong>
          </div>
          <div>
            <span>Unidades enviáveis</span>
            <strong>{calculation?.shippingQuantity ?? row.quantity}</strong>
          </div>
          <div>
            <span>Base histórica do saldo</span>
            <strong>{formatMoney(order.historicalBrlCents)}</strong>
          </div>
          <div>
            <span>Dinheiro novo</span>
            <strong>{formatMoney(order.newMoneyBrlCents)}</strong>
          </div>
          <div>
            <span>Taxas do pagamento</span>
            <strong>{formatMoney(order.feeBrlCents)}</strong>
          </div>
          <div>
            <span>Custo bruto conhecido</span>
            <strong>{money(calculation?.grossPartialCents)}</strong>
          </div>
          <div>
            <span>Reembolso recebido</span>
            <strong>{money(calculation?.receivedRefundCents)}</strong>
          </div>
          <div>
            <span>A receber</span>
            <strong>{money(calculation?.requestedRefundCents)}</strong>
          </div>
          <div className="cost-breakdown-total">
            <span>Custo líquido atual</span>
            <strong>{money(calculation?.partialCents)}</strong>
          </div>
          <h3>Valores por componente</h3>
          {calculation?.components.map((component) => (
            <div key={component.name}>
              <span>{component.name}</span>
              <strong>{money(component.amountCents)}</strong>
            </div>
          ))}
          <div className="cost-breakdown-total">
            <span>
              {calculation?.totalCents === null
                ? "Total parcial"
                : "Total final"}
            </span>
            <strong>
              {calculatedTotal(
                calculation?.totalCents,
                calculation?.partialCents,
                calculation?.hasKnownAmount,
              )}
            </strong>
          </div>
          {calculation?.pendingComponents.length ? (
            <p className="cost-mobile-pending">
              Falta informar: {calculation.pendingComponents.join(", ")}
            </p>
          ) : null}
          {calculation && calculation.undistributedCents > 0 && (
            <p className="cost-undistributed">
              Há {formatMoney(calculation.undistributedCents)} em valores
              conhecidos sem proporção suficiente para dividir.
            </p>
          )}
          <h3>Divisão por pessoa</h3>
          {row.participants.map((participant) => {
            const share = calculation?.shares.find(
              (value) => value.personId === participant.personId,
            );
            return (
              <div key={participant.personId}>
                <span>{participant.name}</span>
                <strong>
                  {share?.amountCents === null ||
                  share?.amountCents === undefined
                    ? share?.partialAmountCents === null ||
                      share?.partialAmountCents === undefined
                      ? "Parcela não determinável"
                      : `Parcial ${formatMoney(share.partialAmountCents)}`
                    : formatMoney(share.amountCents)}
                </strong>
              </div>
            );
          })}
          {row.financingPositions.filter(
            (position) => position.openCnyMinor > 0,
          ).length > 0 && (
            <>
              <h3>Adiantamentos em aberto</h3>
              {row.financingPositions
                .filter((position) => position.openCnyMinor > 0)
                .map((position) => {
                  const lender =
                    detail.members.find(
                      (member) => member.id === position.lenderId,
                    )?.name ?? "Financiador";
                  const beneficiary =
                    detail.members.find(
                      (member) => member.id === position.beneficiaryId,
                    )?.name ?? "Beneficiário";
                  return (
                    <div
                      className="cost-order-financing-position"
                      key={position.consumptionId}
                    >
                      <span>
                        <strong>
                          {beneficiary} → {lender}
                        </strong>
                        <small>
                          Em aberto: {formatCnyMinor(position.openCnyMinor)} ·
                          base histórica{" "}
                          {formatMoney(position.openHistoricalBrlCents)}
                        </small>
                      </span>
                      {!locked && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            onClose();
                            onSettle({ orderId: order.id, position });
                          }}
                        >
                          Registrar acerto
                        </Button>
                      )}
                    </div>
                  );
                })}
            </>
          )}
        </div>
      </Surface>
    );
  }
  const calculation = item.calculation;
  return (
    <Surface
      sheet
      open
      title="Composição dos custos"
      subtitle={item.original.name}
      description="Valores originais, encargos, créditos recebidos e divisão atual desta linha."
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <div className="cost-breakdown-list">
        <h3>Unidades e valor líquido</h3>
        <div>
          <span>Unidades compradas</span>
          <strong>{item.original.quantity}</strong>
        </div>
        <div>
          <span>Unidades canceladas</span>
          <strong>{calculation?.cancelledQuantity ?? 0}</strong>
        </div>
        <div>
          <span>Unidades enviáveis</span>
          <strong>
            {calculation?.shippingQuantity ?? item.original.quantity}
          </strong>
        </div>
        <div>
          <span>Custo bruto conhecido</span>
          <strong>{money(calculation?.grossPartialCents)}</strong>
        </div>
        <div>
          <span>Reembolso recebido</span>
          <strong>{money(calculation?.receivedRefundCents)}</strong>
        </div>
        <div>
          <span>A receber</span>
          <strong>{money(calculation?.requestedRefundCents)}</strong>
        </div>
        <div className="cost-breakdown-total">
          <span>Custo líquido atual</span>
          <strong>{money(calculation?.partialCents)}</strong>
        </div>
        <h3>Valores por componente</h3>
        {calculation?.components.map((component) => (
          <div key={component.name}>
            <span>{component.name}</span>
            <strong>{money(component.amountCents)}</strong>
          </div>
        ))}
        <div className="cost-breakdown-total">
          <span>
            {calculation?.totalCents === null ? "Total parcial" : "Total final"}
          </span>
          <strong>
            {calculatedTotal(
              calculation?.totalCents,
              calculation?.partialCents,
              calculation?.hasKnownAmount,
            )}
          </strong>
        </div>
        {calculation?.pendingComponents.length ? (
          <p className="cost-mobile-pending">
            Falta informar: {calculation.pendingComponents.join(", ")}
          </p>
        ) : null}
        {calculation && calculation.undistributedCents > 0 && (
          <p className="cost-undistributed">
            Há {formatMoney(calculation.undistributedCents)} em valores
            conhecidos sem proporção suficiente para dividir.
          </p>
        )}
        <h3>Divisão por pessoa</h3>
        {item.participants.map((participant) => (
          <div key={participant.personId}>
            <span>{participant.name}</span>
            <strong>
              {participant.shareCents === null
                ? participant.partialShareCents === null
                  ? "Parcela não determinável"
                  : `Parcial ${formatMoney(participant.partialShareCents)}`
                : formatMoney(participant.shareCents)}
            </strong>
          </div>
        ))}
      </div>
    </Surface>
  );
}

function PackageCard({
  pkg,
  detail,
  expanded,
  onExpandedChange,
  locked,
  busy,
  savePackage,
  saveAllocations,
  unsealPackage,
  openCharge,
  markPaid,
  mutate,
}: {
  pkg: DetailPackage;
  detail: Detail;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  locked: boolean;
  busy: boolean;
  savePackage: (
    pkg: DetailPackage,
    name: string,
    logisticsStatus: string,
  ) => Promise<boolean>;
  saveAllocations: (
    draft: Record<string, number>,
  ) => Promise<boolean | undefined>;
  unsealPackage: (reason: string) => Promise<boolean>;
  openCharge: (charge: ChargeEditor) => void;
  markPaid: (chargeId: string) => Promise<void>;
  mutate: (
    operation: string,
    rest: Record<string, unknown>,
    mayInvalidatePayment?: boolean,
  ) => Promise<boolean>;
}) {
  const [packageEditorOpen, setPackageEditorOpen] = useState(false),
    [allocationEditorOpen, setAllocationEditorOpen] = useState(false),
    [removeConfirmOpen, setRemoveConfirmOpen] = useState(false),
    [unsealOpen, setUnsealOpen] = useState(false),
    [unsealReason, setUnsealReason] = useState("");
  const [name, setName] = useState(pkg.name),
    [logistics, setLogistics] = useState(pkg.logisticsStatus);
  const [allocationDraft, setAllocationDraft] = useState<
    Record<string, number>
  >({});
  const freight = pkg.brazilFreightCharge,
    customs = pkg.customsCharge;
  const allocationLines = packageAllocationLines(detail);
  const assigned = pkg.calculation?.unitCount ?? 0;
  const shippingUnits = detail.calculation.summary.shippingUnits;
  const contentSealed =
    pkg.contentSealSource !== null ||
    pkg.contentSealedAt !== null ||
    pkg.logisticsStatus !== "preparing";
  const headingId = `cost-package-${pkg.id}-content`;

  function editPackage() {
    setName(pkg.name);
    setLogistics(pkg.logisticsStatus);
    setPackageEditorOpen(true);
  }

  function editContent() {
    const next: Record<string, number> = {};
    for (const item of allocationLines)
      next[item.id] =
        pkg.items.find((row) => row.costItemId === item.id)?.quantity ?? 0;
    setAllocationDraft(next);
    setAllocationEditorOpen(true);
  }

  async function savePackageForm(event: React.FormEvent) {
    event.preventDefault();
    const ok = await savePackage(pkg, name.trim(), logistics);
    if (ok) setPackageEditorOpen(false);
  }

  async function saveContent(event: React.FormEvent) {
    event.preventDefault();
    const ok = await saveAllocations(allocationDraft);
    if (ok) setAllocationEditorOpen(false);
  }

  async function submitUnseal(event: React.FormEvent) {
    event.preventDefault();
    const ok = await unsealPackage(unsealReason.trim());
    if (ok) {
      setUnsealOpen(false);
      setUnsealReason("");
    }
  }

  function updateAllocation(itemId: string, maximum: number, value: number) {
    setAllocationDraft((current) => ({
      ...current,
      [itemId]: Math.min(maximum, Math.max(1, value)),
    }));
  }

  const chargeMethod = (charge: NonNullable<typeof freight>) =>
    charge.paymentMethod === "pix"
      ? "Pix"
      : charge.paymentMethod === "card"
        ? "Cartão"
        : null;
  const packageFreight = pkg.calculation?.freightPaymentTotalCents;
  const packageCustoms = pkg.calculation?.customsPaymentTotalCents;
  const canDeleteEmptyPackage =
    !assigned &&
    pkg.contentEvents.length === 0 &&
    pkg.logisticsStatus === "preparing" &&
    freight?.valueState === "pending" &&
    customs?.valueState === "pending";
  const logisticsSummary = logisticName(pkg.logisticsStatus).toLocaleLowerCase(
    "pt-BR",
  );
  const associatedProducts = pkg.items.length;
  const packageSubtitle = `${associatedProducts ? `${associatedProducts} ${associatedProducts === 1 ? "produto associado" : "produtos associados"}` : "Sem produtos associados"} · Etapa logística: ${logisticsSummary}`;
  async function deleteEmptyPackage() {
    const ok = await mutate("package.delete", {
      packageId: pkg.id,
      input: { expectedRevision: detail.tracking.revision },
    });
    if (ok) setRemoveConfirmOpen(false);
  }
  const packageActions = !locked && (
    <div className="cost-package-header-actions">
      <div className="cost-package-direct-actions">
        <Button variant="outline" size="sm" disabled={busy} onClick={editPackage}>
          <Pencil size={15} aria-hidden="true" />Editar pacote
        </Button>
        <Button variant="outline" size="sm" disabled={busy || contentSealed} onClick={editContent} data-cost-target={`package-content-${pkg.id}`}>
          <Package size={15} aria-hidden="true" />{contentSealed ? "Conteúdo selado" : "Editar conteúdo"}
        </Button>
        {contentSealed && pkg.logisticsStatus === "preparing" && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setUnsealReason(""); setUnsealOpen(true); }}>Reabrir conteúdo com motivo</Button>
        )}
        {canDeleteEmptyPackage && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRemoveConfirmOpen(true)}><Trash2 size={15} aria-hidden="true" />Excluir pacote vazio</Button>
        )}
      </div>
      <div className="cost-package-mobile-actions">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button
            data-cost-target={`package-content-${pkg.id}`}
            variant="outline"
            size="sm"
            aria-label={`Ações para ${pkg.name}`}
            disabled={busy}
          >
            <MoreVertical size={16} aria-hidden="true" />
            <span>Ações do pacote</span>
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="dropdown" align="end" sideOffset={6}>
            <DropdownMenu.Item onSelect={editPackage}>
              <Pencil size={15} />
              <span>Editar pacote</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item disabled={contentSealed} onSelect={editContent}>
              <Package size={15} />
              <span>
                {contentSealed ? "Conteúdo selado" : "Editar conteúdo"}
              </span>
            </DropdownMenu.Item>
            {contentSealed && pkg.logisticsStatus === "preparing" && (
              <DropdownMenu.Item
                onSelect={() => {
                  setUnsealReason("");
                  setUnsealOpen(true);
                }}
              >
                <RotateCcw size={15} />
                <span>Reabrir conteúdo com motivo</span>
              </DropdownMenu.Item>
            )}
            {canDeleteEmptyPackage && (
              <>
                <DropdownMenu.Separator />
                <DropdownMenu.Item
                  className="danger-text"
                  onSelect={() => setRemoveConfirmOpen(true)}
                >
                  <Trash2 size={15} />
                  <span>Excluir pacote vazio</span>
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      </div>
    </div>
  );
  return (
    <article className="cost-package">
      <div className="cost-package-header">
        <button
          className="cost-package-toggle"
          type="button"
          aria-expanded={expanded}
          aria-controls={headingId}
          onClick={() => onExpandedChange(!expanded)}
        >
          <span className="cost-package-icon">
            <Package size={18} aria-hidden="true" />
          </span>
          <span className="cost-package-title">
            <strong>{pkg.name}</strong>
            <small>{packageSubtitle}</small>
          </span>
          <span className="cost-package-logistics-status">
            {logisticName(pkg.logisticsStatus)}
          </span>
          <ChevronDown
            className={expanded ? "expanded" : ""}
            size={18}
            aria-hidden="true"
          />
        </button>
        {packageActions}
      </div>
      <div className="cost-package-content" id={headingId} hidden={!expanded}>
        {expanded && (
          <div className="cost-package-body">
            <div className="cost-package-info-grid">
              <div className="cost-package-assigned">
                <small>Unidades atribuídas</small>
                <strong>
                  {assigned} de {shippingUnits}
                </strong>
              </div>
              <ChargeSummary
                label="Frete Brasil"
                target={`package-freight-${pkg.id}`}
                paidTarget={`package-freight-paid-${pkg.id}`}
                charge={freight}
                base={pkg.calculation?.freight.base}
                fee={pkg.calculation?.freight.fee}
                total={packageFreight}
                feeBps={freight?.feeBps ?? null}
                method={freight ? chargeMethod(freight) : null}
                showFee
                onEdit={() =>
                  freight &&
                  openCharge({
                    id: freight.id,
                    type: "brazil_freight",
                    name: `${pkg.name} · Frete Brasil`,
                  })
                }
                onPaid={() => freight && void markPaid(freight.id)}
                locked={locked}
                busy={busy}
              />
              <ChargeSummary
                label="Receita"
                target={`package-customs-${pkg.id}`}
                paidTarget={`package-customs-paid-${pkg.id}`}
                charge={customs}
                base={pkg.calculation?.customs.base}
                fee={0}
                total={packageCustoms}
                feeBps={null}
                method={null}
                onEdit={() =>
                  customs &&
                  openCharge({
                    id: customs.id,
                    type: "customs",
                    name: `${pkg.name} · Receita`,
                  })
                }
                onPaid={() => customs && void markPaid(customs.id)}
                locked={locked}
                busy={busy}
              />
            </div>
            {pkg.items.length ? (
              <div className="cost-package-items">
                <div className="cost-allocation-head">
                  <strong>Conteúdo</strong>
                  <span>{unitsLabel(assigned)}</span>
                </div>
                <ul>
                  {pkg.items.map((row) => {
                    const item = allocationLines.find(
                      (value) => value.id === row.costItemId,
                    );
                    if (!item) return null;
                    const people = item.participants.join(" · ");
                    return (
                      <li key={row.costItemId}>
                        <span>
                          <strong>{item.name}</strong>
                          <small>
                            {item.variant || "Sem variação"}
                            {people ? ` · ${people}` : ""}
                          </small>
                        </span>
                        <strong>{unitsLabel(row.quantity)}</strong>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <p className="muted cost-package-empty-content">
                Ainda não há produtos associados ao pacote.
              </p>
            )}
            {contentSealed && (
              <p className="muted">
                Conteúdo selado para preservar a conferência do pacote.
              </p>
            )}
          </div>
        )}
      </div>
      <Surface
        sheet
        open={packageEditorOpen}
        title="Editar pacote"
        subtitle={pkg.name}
        description="Atualize o nome e a etapa logística. A etapa não altera os valores financeiros."
        onOpenChange={(value) => {
          if (!busy) setPackageEditorOpen(value);
        }}
      >
        <form onSubmit={(event) => void savePackageForm(event)}>
          <label>
            Nome do pacote
            <input
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Etapa logística
            <select
              value={logistics}
              onChange={(event) =>
                setLogistics(event.target.value as typeof logistics)
              }
            >
              <option value="preparing">Em preparação</option>
              <option value="sent">Enviado</option>
              <option value="received">Recebido</option>
            </select>
          </label>
          <div className="form-actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setPackageEditorOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? "Salvando…" : "Salvar pacote"}
            </Button>
          </div>
        </form>
      </Surface>
      <Surface
        sheet
        open={allocationEditorOpen}
        className="cost-package-content-editor"
        title="Editar conteúdo"
        subtitle={pkg.name}
        description="Distribua as unidades físicas. O restante continua disponível nos outros pacotes."
        onOpenChange={(value) => {
          if (!busy) setAllocationEditorOpen(value);
        }}
      >
        <form onSubmit={(event) => void saveContent(event)}>
          <div className="cost-allocation-edit-list">
            {allocationLines.filter(item => item.shippingQuantity > 0 && (allocationDraft[item.id] ?? 0) > 0).map((item) => {
              const inOtherPackages = detail.packages
                .filter((other) => other.id !== pkg.id)
                .reduce(
                  (sum, other) =>
                    sum +
                    (other.items.find((row) => row.costItemId === item.id)
                      ?.quantity ?? 0),
                  0,
                );
              const shippingQuantity = item.shippingQuantity;
              const maximum = Math.max(0, shippingQuantity - inOtherPackages);
              const saved =
                pkg.items.find((row) => row.costItemId === item.id)?.quantity ??
                0;
              const quantity = allocationDraft[item.id] ?? saved;
              return (
                <div className="cost-allocation-edit-row" key={item.id}>
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {item.variant || "Sem variação"} · Unidades compradas:{" "}
                      {item.quantity} · Unidades canceladas:{" "}
                      {item.cancelledQuantity} · Neste pacote: {saved} · Em
                      outros: {inOtherPackages} · Disponíveis:{" "}
                      {maximum - quantity}
                    </small>
                  </span>
                  <div className="cost-allocation-controls">
                    <span id={`allocation-label-${pkg.id}-${item.id}`}>Unidades neste pacote</span>
                    <div className="cost-allocation-control-row">
                      <div className="cost-allocation-stepper" role="group" aria-labelledby={`allocation-label-${pkg.id}-${item.id}`}>
                        <Button type="button" variant="ghost" size="icon" aria-label={`Aumentar quantidade de ${item.name}`} disabled={busy || quantity >= maximum} onClick={() => updateAllocation(item.id, maximum, quantity + 1)}><Plus size={16} aria-hidden="true" /></Button>
                        <output aria-label={`${item.name} neste pacote`} aria-live="polite">{quantity}</output>
                        <Button type="button" variant="ghost" size="icon" aria-label={`Diminuir quantidade de ${item.name}`} disabled={busy || quantity <= 1} onClick={() => updateAllocation(item.id, maximum, quantity - 1)}><Minus size={16} aria-hidden="true" /></Button>
                      </div>
                      <Button type="button" variant="ghost" size="icon" aria-label={`Tirar ${item.name} do pacote`} title="Tirar produto do pacote" disabled={busy} onClick={() => setAllocationDraft(current => ({ ...current, [item.id]: 0 }))}><Trash2 size={17} aria-hidden="true" /></Button>
                    </div>
                  </div>
                </div>
              );
            })}
            {!allocationLines.some(item => item.shippingQuantity > 0 && (allocationDraft[item.id] ?? 0) > 0) && <p className="muted" role="status">Nenhum produto neste pacote. Inclua as unidades disponíveis ou salve para remover os produtos.</p>}
          </div>
          <div className="cost-allocation-footer">
          <Button
            className="cost-allocate-remaining"
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() =>
              setAllocationDraft(
                Object.fromEntries(
                  allocationLines.map((item) => {
                    const used = detail.packages
                      .filter((other) => other.id !== pkg.id)
                      .reduce(
                        (sum, other) =>
                          sum +
                          (other.items.find((row) => row.costItemId === item.id)
                            ?.quantity ?? 0),
                        0,
                      );
                    return [item.id, Math.max(0, item.shippingQuantity - used)];
                  }),
                ),
              )
            }
          >
            Incluir unidades disponíveis
          </Button>
          <div className="form-actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setAllocationEditorOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Salvando…" : "Salvar conteúdo"}
            </Button>
          </div>
          </div>
        </form>
      </Surface>
      <Surface
        sheet
        open={unsealOpen}
        title="Reabrir conteúdo"
        subtitle={pkg.name}
        description="O motivo ficará no histórico do pacote. Depois da alteração, confira novamente as unidades."
        onOpenChange={(value) => {
          if (!busy) setUnsealOpen(value);
        }}
      >
        <form onSubmit={(event) => void submitUnseal(event)}>
          <label>
            Motivo
            <textarea
              required
              minLength={1}
              maxLength={1000}
              value={unsealReason}
              onChange={(event) => setUnsealReason(event.target.value)}
            />
          </label>
          <div className="form-actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setUnsealOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={busy || !unsealReason.trim()}>
              {busy ? "Salvando…" : "Reabrir conteúdo"}
            </Button>
          </div>
        </form>
      </Surface>
      <Confirm
        open={removeConfirmOpen}
        onOpenChange={(value) => {
          if (!busy) setRemoveConfirmOpen(value);
        }}
        title="Excluir pacote vazio?"
        description="Este pacote ainda não contém unidades nem cobranças informadas. A exclusão ficará registrada no acompanhamento."
        danger
        label="Excluir pacote"
        busy={busy}
        onConfirm={() => void deleteEmptyPackage()}
      />
    </article>
  );
}

function ChargeSummary({
  label,
  target,
  paidTarget,
  charge,
  base,
  fee,
  total,
  feeBps,
  method,
  showFee = false,
  onEdit,
  onPaid,
  locked,
  busy,
}: {
  label: string;
  target: string;
  paidTarget: string;
  charge: DetailPackage["brazilFreightCharge"] | DetailPackage["customsCharge"];
  base: number | null | undefined;
  fee: number | null | undefined;
  total: number | null | undefined;
  feeBps: number | null;
  method: string | null;
  showFee?: boolean;
  onEdit: () => void;
  onPaid: () => void;
  locked: boolean;
  busy: boolean;
}) {
  if (!charge) return null;
  const valueIsPaid = charge.paymentStatus === "paid";
  const noCharge = charge.valueState === "no_charge";
  const pending = charge.valueState === "pending" || charge.valueState == null;
  const status = noCharge
    ? "Sem cobrança"
    : valueIsPaid
      ? "Pago"
      : pending
        ? "Falta informar"
        : "A pagar";
  if (pending)
    return (
      <div className="cost-charge-summary cost-charge-pending">
        <div className="cost-charge-top">
          <span className="cost-charge-pending-title">
            <strong>{label}</strong>
            <small role="status">Não informado</small>
          </span>
        </div>
        {!locked && (
          <div className="cost-charge-bottom">
            <div>
              <button
                className="cost-charge-inline-edit"
                type="button"
                data-cost-target={target}
                disabled={busy}
                onClick={onEdit}
              >
                {label === "Frete Brasil"
                  ? "Informar valor frete"
                  : "Informar taxa receita"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  return (
    <div className="cost-charge-summary">
      <div className="cost-charge-top">
        <span>
          <strong>{label}</strong>
        </span>
        {!noCharge && <small role="status">{status}</small>}
      </div>
      {noCharge ? (
        <p className="cost-charge-no-charge" role="status">
          Sem cobrança
        </p>
      ) : (
        <div className="cost-charge-breakdown">
          <div>
            <span>Base</span>
            <strong>
              {displayedValue(charge.valueState ?? "pending", base ?? null)}
            </strong>
          </div>
          {showFee && (
            <div>
              <span>
                Taxa de pagamento
                {feeBps === null
                  ? ""
                  : ` · ${method ?? "Método pendente"} ${percentFromBasisPoints(feeBps)}%`}
              </span>
              <strong>{money(fee)}</strong>
            </div>
          )}
          <div className="total">
            <span>{valueIsPaid ? "Total pago" : "Total a pagar"}</span>
            <strong>{money(total)}</strong>
          </div>
        </div>
      )}
      {!locked && (
        <div className="cost-charge-bottom">
          <div>
            <Button
              data-cost-target={target}
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={onEdit}
            >
              Editar {label}
            </Button>
            {!noCharge && !valueIsPaid && (
              <Button
                data-cost-target={paidTarget}
                size="sm"
                disabled={busy || total === null || total === undefined}
                onClick={onPaid}
              >
                Marcar como pago
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChargeSurface({
  detail,
  editor,
  busy,
  onClose,
  onSave,
}: {
  detail: Detail;
  editor: ChargeEditor;
  busy: boolean;
  onClose: () => void;
  onSave: (input: unknown) => Promise<void>;
}) {
  const charge = detail.charges.find((value) => value.id === editor.id)!;
  const [state, setState] = useState(charge.valueState ?? "pending"),
    [amount, setAmount] = useState(amountInput(charge.amountCents));
  const [method, setMethod] = useState(charge.paymentMethod ?? ""),
    [feePercent, setFeePercent] = useState(
      charge.feeBps === null
        ? charge.paymentMethod === "pix"
          ? percentInputFromBasisPoints(detail.settings.pixBps)
          : charge.paymentMethod === "card"
            ? percentInputFromBasisPoints(detail.settings.cardBps)
            : ""
        : percentInputFromBasisPoints(charge.feeBps),
    );
  const amountCents = state === "known" ? parseCostCents(amount) : null;
  const feeBps = feePercent === "" ? null : basisPointsFromPercent(feePercent);
  const base =
    editor.type === "products"
      ? detail.calculation.productsCharge.baseCents
      : state === "no_charge"
        ? 0
        : amountCents;
  const fee =
    base === null || feeBps === null
      ? null
      : Number((BigInt(base) * BigInt(feeBps) + 5_000n) / 10_000n);
  const total =
    base === null
      ? null
      : fee === null && (editor.type === "customs" || base === 0)
        ? base
        : fee === null
          ? null
          : base + fee;
  const valid =
    editor.type === "products"
      ? method !== "" && feeBps !== null
      : editor.type === "customs"
        ? state !== "known" || amountCents !== null
        : state !== "known" ||
          (amountCents !== null &&
            (amountCents === 0 || (method !== "" && feeBps !== null)));

  function save(event: React.FormEvent) {
    event.preventDefault();
    const expectedRevision = detail.tracking.revision;
    if (editor.type === "products") {
      void onSave({
        expectedRevision,
        chargeType: "products",
        paymentMethod: method || null,
        feeBps: method ? feeBps : null,
      });
    } else if (editor.type === "brazil_freight") {
      void onSave({
        expectedRevision,
        chargeType: editor.type,
        valueState: state,
        amountCents: state === "known" ? amountCents : null,
        paymentMethod: state === "known" ? method || null : null,
        feeBps: state === "known" && method ? feeBps : null,
      });
    } else {
      void onSave({
        expectedRevision,
        chargeType: editor.type,
        valueState: state,
        amountCents: state === "known" ? amountCents : null,
      });
    }
  }

  const chargeLabel =
    editor.type === "products"
      ? "pagamento dos produtos"
      : editor.type === "brazil_freight"
        ? "frete Brasil"
        : "Receita";
  const title =
    editor.type === "products"
      ? "Editar pagamento"
      : state === "pending"
        ? `Informar ${chargeLabel}`
        : `Editar ${chargeLabel}`;
  const description =
    editor.type === "customs"
      ? "Informe o valor da Receita. Ela não tem taxa de transação."
      : "Confira o valor, a taxa e o método antes de salvar. O pagamento continua manual.";
  return (
    <Surface
      sheet
      open
      title={title}
      subtitle={editor.name}
      description={description}
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
    >
      <form onSubmit={save}>
        {editor.type !== "products" && (
          <label>
            Estado do valor
            <select
              value={state}
              onChange={(event) => setState(event.target.value as typeof state)}
            >
              <option value="pending">Falta informar</option>
              <option value="known">Informado</option>
              <option value="no_charge">Sem cobrança</option>
            </select>
          </label>
        )}
        {editor.type !== "products" && state === "known" && (
          <label>
            Valor em R$
            <input
              required
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0,00"
            />
          </label>
        )}
        {editor.type !== "customs" && (
          <div className="form-row">
            <label>
              Método de pagamento
              <select
                value={method}
                disabled={editor.type === "brazil_freight" && state !== "known"}
                onChange={(event) => {
                  const value = event.target.value;
                  setMethod(value);
                  setFeePercent(
                    value === "pix"
                      ? percentInputFromBasisPoints(detail.settings.pixBps)
                      : value === "card"
                        ? percentInputFromBasisPoints(detail.settings.cardBps)
                        : "",
                  );
                }}
              >
                <option value="">Escolher método</option>
                <option value="pix">Pix</option>
                <option value="card">Cartão</option>
              </select>
            </label>
            <label>
              Taxa (%)
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                disabled={!method}
                value={feePercent}
                onChange={(event) => setFeePercent(event.target.value)}
              />
            </label>
          </div>
        )}
        <div className="cost-editor-preview">
          <span>
            Base <strong>{money(base)}</strong>
          </span>
          {editor.type !== "customs" && (
            <span>
              Taxa{" "}
              {feeBps === null
                ? "pendente"
                : `${percentFromBasisPoints(feeBps)}%`}{" "}
              <strong>{money(fee)}</strong>
            </span>
          )}
          <span>
            Total a pagar <strong>{money(total)}</strong>
          </span>
        </div>
        {editor.type === "customs" && state === "no_charge" && (
          <p className="muted">
            Sem cobrança resolve esta etapa sem pagamento.
          </p>
        )}
        <div className="form-actions">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || !valid}>
            {busy ? "Salvando…" : "Salvar cobrança"}
          </Button>
        </div>
      </form>
    </Surface>
  );
}
