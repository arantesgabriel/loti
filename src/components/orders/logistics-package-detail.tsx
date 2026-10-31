"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Surface as DialogSurface } from "@/components/ui/surface";
import { PackageSurface as Surface } from "@/components/packages/package-surface";
import { costRequest, parseCostCents } from "@/components/packages/package-cost-client";
import { formatMoney } from "@/lib/domain/money";
import type { logisticsPackageServices } from "@/lib/domain/logistics-package-services";
import type { WarehouseData } from "./orders-screen";
import { useWorkspace } from "@/components/workspace-provider";
import "./orders.css";

type Detail = Awaited<ReturnType<ReturnType<typeof logisticsPackageServices>["get"]>>;
type LogisticsStage = "preparing" | "sent" | "received";
const logisticsStageSequence: readonly LogisticsStage[] = ["preparing", "sent", "received"];
type Action =
  | "review"
  | "close_content"
  | "reopen_content"
  | "dispatch"
  | "receive"
  | "close_financial"
  | "reopen_financial"
  | "confirm_legacy_content"
  | "freight"
  | "customs"
  | "record_freight"
  | "record_customs"
  | "correct_freight"
  | "correct_customs"
  | "weight"
  | "release";

const titles: Record<Action, string> = {
  review: "Conferir pacote legado",
  close_content: "Fechar conteúdo",
  reopen_content: "Reabrir conteúdo",
  dispatch: "Registrar despacho",
  receive: "Registrar recebimento",
  close_financial: "Encerrar custos do pacote",
  reopen_financial: "Reabrir custos do pacote",
  confirm_legacy_content: "Confirmar conteúdo legado fechado",
  freight: "Confirmar frete",
  customs: "Confirmar Receita",
  record_freight: "Informar frete",
  record_customs: "Informar Receita",
  correct_freight: "Corrigir frete",
  correct_customs: "Corrigir Receita",
  weight: "Informar peso",
  release: "Retirar unidades do pacote",
};

const stageLabels = {
  preparing: "Em montagem",
  sent: "A caminho",
  received: "Recebido",
} as const;

const eventLabels: Record<string, string> = {
  review: "Conferência do pacote",
  close_content: "Conteúdo fechado",
  reopen_content: "Conteúdo reaberto",
  dispatch: "Despacho registrado",
  receive: "Recebimento registrado",
  regress_stage: "Etapa logística regredida",
  close_financial: "Custos encerrados",
  reopen_financial: "Custos reabertos",
  confirm_legacy_content: "Conteúdo legado confirmado",
  pay_charge: "Pagamento confirmado",
  record_charge: "Valor informado",
  correct_charge: "Cobrança corrigida",
  weight: "Peso informado",
};

function eventStage(value: unknown) {
  if (!value || typeof value !== "object" || !("stage" in value)) return null;
  const stage = (value as { stage?: unknown }).stage;
  return stage === "preparing" || stage === "sent" || stage === "received"
    ? stageLabels[stage]
    : null;
}

function eventRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function eventField(after: Record<string, unknown>, before: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(after, key) ? after[key] : before[key];
}

function packageChargeValue(state: unknown, amount: unknown) {
  if (state === "no_charge") return "Sem cobrança";
  if (state === "known" && typeof amount === "number") return formatMoney(amount);
  return "Pendente";
}

function packageChargeEventLabel(action: string, charge: unknown) {
  const chargeLabel = charge === "freight" ? "Frete Brasil" : "Receita";
  const verb = action === "pay_charge"
    ? "pagamento confirmado"
    : action === "correct_charge"
      ? "corrigido"
      : "informado";
  return `${chargeLabel} · ${verb}`;
}

function packageChargeEventDetails(beforeValue: unknown, afterValue: unknown) {
  const before = eventRecord(beforeValue);
  const after = eventRecord(afterValue);
  const command = eventRecord(after.command);
  const charge = command.charge === "freight" ? "freight" : command.charge === "customs" ? "customs" : null;
  if (!charge) return [];

  const amountKey = charge === "freight" ? "freightCents" : "customsCents";
  const stateKey = charge === "freight" ? "freightState" : "customsState";
  const paymentKey = charge === "freight" ? "freightPaidAt" : "customsPaidAt";
  const previousValue = packageChargeValue(before[stateKey], before[amountKey]);
  const nextValue = packageChargeValue(
    eventField(after, before, stateKey),
    eventField(after, before, amountKey),
  );
  const details = [`Valor: ${previousValue} → ${nextValue}`];

  if (charge === "freight") {
    details.push(`Taxa: ${packageChargeValue(
      before.freightState,
      before.freightFeeCents,
    )} → ${packageChargeValue(
      eventField(after, before, "freightState"),
      eventField(after, before, "freightFeeCents"),
    )}`);
  }

  const previousPayment = before[paymentKey] ? "Pago" : "Não confirmado";
  const nextPayment = eventField(after, before, paymentKey) ? "Pago" : "Não confirmado";
  details.push(`Pagamento: ${previousPayment} → ${nextPayment}`);
  return details;
}

function formatRecordedAt(value: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

type AllocationUnit = {
  unitIndex: number;
  amountCents: number;
  people: { personId: string; amountCents: number }[];
};

function AllocationTable({
  caption,
  units,
  personName,
}: {
  caption: string;
  units: AllocationUnit[];
  personName: (id: string) => string;
}) {
  const subtotal = units.reduce((sum, unit) => sum + unit.amountCents, 0);

  return (
    <div className="orders-allocation-table-wrap">
      <table className="orders-allocation-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Unidade</th>
            <th scope="col">Participante</th>
            <th scope="col">Valor</th>
          </tr>
        </thead>
        {units.map((unit) => (
          <tbody key={unit.unitIndex}>
            {unit.people.length ? (
              unit.people.map((person, index) => (
                <tr key={person.personId}>
                  {index === 0 && (
                    <th scope="rowgroup" rowSpan={unit.people.length}>
                      <span>Unidade {unit.unitIndex + 1}</span>
                      <small>Total da unidade {formatMoney(unit.amountCents)}</small>
                    </th>
                  )}
                  <td>{personName(person.personId)}</td>
                  <td className="orders-allocation-money">{formatMoney(person.amountCents)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <th scope="row">
                  <span>Unidade {unit.unitIndex + 1}</span>
                  <small>Total da unidade {formatMoney(unit.amountCents)}</small>
                </th>
                <td>Sem participantes</td>
                <td className="orders-allocation-money">—</td>
              </tr>
            )}
          </tbody>
        ))}
        <tfoot>
          <tr>
            <th scope="row" colSpan={2}>Subtotal neste pacote</th>
            <td className="orders-allocation-money">{formatMoney(subtotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function LogisticsPackageDetail({
  packageId,
  returnTo = "/packages",
}: {
  packageId: string;
  returnTo?: string;
}) {
  const { data: workspace } = useWorkspace();
  const [data, setData] = useState<Detail | null>(null);
  const [warehouse, setWarehouse] = useState<WarehouseData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [allocationsOpen, setAllocationsOpen] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const [selectedLogisticsStage, setSelectedLogisticsStage] = useState<LogisticsStage>("preparing");
  const [regressionConfirmed, setRegressionConfirmed] = useState(false);
  const actionsPanelRef = useRef<HTMLElement | null>(null);
  const allocationsPanelRef = useRef<HTMLDivElement | null>(null);

  const url = "/api/logistics/packages/" + encodeURIComponent(packageId);
  const warehouseUrl = "/api/warehouse?packageId=" + encodeURIComponent(packageId) + "&pageSize=100";

  const load = useCallback(async () => {
    const [result, warehouseResult] = await Promise.all([
      costRequest<Detail>(url),
      costRequest<WarehouseData>(warehouseUrl),
    ]);
    if (result.ok && result.data) setData(result.data);
    else setError(result.error ?? "Não foi possível carregar o pacote.");
    if (warehouseResult.ok && warehouseResult.data) setWarehouse(warehouseResult.data);
  }, [url, warehouseUrl]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      costRequest<Detail>(url),
      costRequest<WarehouseData>(warehouseUrl),
    ]).then(([result, warehouseResult]) => {
      if (!active) return;
      if (result.ok && result.data) setData(result.data);
      else setError(result.error ?? "Não foi possível carregar o pacote.");
      if (warehouseResult.ok && warehouseResult.data) setWarehouse(warehouseResult.data);
    });
    return () => {
      active = false;
    };
  }, [url, warehouseUrl]);

  useEffect(() => {
    if (actionsOpen) actionsPanelRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [actionsOpen]);

  useEffect(() => {
    if (allocationsOpen) allocationsPanelRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [allocationsOpen]);

  function openLogisticsStageDialog() {
    if (!data || data.pkg.reviewState !== "confirmed") return;
    setSelectedLogisticsStage(data.pkg.stage);
    setRegressionConfirmed(false);
    setError("");
    setStageDialogOpen(true);
  }

  async function submit(form: FormData) {
    if (!data || !action) return;
    const common = { expectedRevision: data.pkg.revision, reason: String(form.get("reason")) };
    let command: Record<string, unknown> = { ...common, operation: action, confirmed: true };

    if (action === "review") {
      command = {
        ...command,
        accountId: String(form.get("account")),
        confirmClosedContent: form.get("closedContent") === "on",
      };
    }
    if (action === "weight") {
      command = { ...common, operation: "weight", weightGrams: Number(form.get("weight")) };
    }
    if (action === "freight" || action === "customs") {
      const amountCents = parseCostCents(String(form.get("amount")));
      if (amountCents === null) {
        setError("Informe um valor válido.");
        return;
      }
      command = {
        ...common,
        operation: "pay_charge",
        charge: action,
        amountCents,
        paymentMethod: String(form.get("method")),
        feeBps: action === "customs"
          ? 0
          : Math.round(Number(String(form.get("fee")).replace(",", ".")) * 100),
        confirmed: true,
      };
    }
    if (
      action === "record_freight"
      || action === "record_customs"
      || action === "correct_freight"
      || action === "correct_customs"
    ) {
      const valueState = String(form.get("state"));
      const amountCents = valueState === "known"
        ? parseCostCents(String(form.get("amount")))
        : null;
      if (valueState === "known" && amountCents === null) {
        setError("Informe o valor conhecido.");
        return;
      }
      const correcting = action.startsWith("correct_");
      command = {
        ...common,
        operation: correcting ? "correct_charge" : "record_charge",
        charge: action.endsWith("freight") ? "freight" : "customs",
        valueState,
        amountCents,
        paymentMethod: valueState === "known" ? "pix" : null,
        feeBps: valueState === "known" ? Math.round(Number(form.get("fee") ?? 0) * 100) : null,
        ...(correcting ? { confirmedPaymentReset: form.get("resetPayment") === "on" } : {}),
      };
    }

    setBusy(true);
    const result = action === "release"
      ? await costRequest("/api/warehouse", {
          workspaceId: workspace.workspaceId,
          idempotencyKey: crypto.randomUUID(),
          command: {
            ...common,
            operation: "release",
            packageId,
            reservationIds: form.getAll("reservation").map(String),
          },
        })
      : await costRequest(url, { idempotencyKey: crypto.randomUUID(), command });
    setBusy(false);

    if (!result.ok) {
      setError(result.error ?? "Operação não concluída.");
      return;
    }

    setAction(null);
    setError("");
    await load();
  }

  async function submitLogisticsStage(form: FormData) {
    if (!data || busy) return;
    const targetStage = String(form.get("stage")) as LogisticsStage;
    const currentStage = data.pkg.stage as LogisticsStage;
    const currentIndex = logisticsStageSequence.indexOf(currentStage);
    const targetIndex = logisticsStageSequence.indexOf(targetStage);
    if (targetIndex < 0 || targetStage === currentStage) return;

    const isRegression = targetIndex < currentIndex;
    if (isRegression && (currentIndex - targetIndex !== 1 || form.get("regressionConfirmed") !== "on")) {
      setError("Confirme a regressão para voltar uma etapa e registrar a alteração no histórico.");
      return;
    }
    if (!isRegression && targetStage === "sent" && (!data.pkg.contentClosedAt || !data.inPackage)) {
      setError("Feche o conteúdo e confirme o pagamento do frete antes de marcar A caminho.");
      return;
    }
    if (!isRegression && targetStage === "received" && currentStage !== "sent") {
      setError("Registre A caminho antes de confirmar o recebimento.");
      return;
    }

    const fromLabel = stageLabels[currentStage];
    const toLabel = stageLabels[targetStage];
    const command = isRegression
      ? {
          expectedRevision: data.pkg.revision,
          reason: `Regressão logística confirmada: ${fromLabel} → ${toLabel}.`,
          operation: "regress_stage",
          targetStage,
          confirmed: true,
          regressionConfirmed: true,
        }
      : {
          expectedRevision: data.pkg.revision,
          reason: `Movimentação logística confirmada: ${fromLabel} → ${toLabel}.`,
          operation: targetStage === "sent" ? "dispatch" : "receive",
          confirmed: true,
        };

    setBusy(true);
    const result = await costRequest<Detail>(url, {
      idempotencyKey: crypto.randomUUID(),
      command,
    });
    setBusy(false);
    if (!result.ok || !result.data) {
      const refresh = await costRequest<Detail>(url);
      if (refresh.ok && refresh.data) {
        setData(refresh.data);
        setSelectedLogisticsStage(refresh.data.pkg.stage);
        setRegressionConfirmed(false);
      }
      setError(result.error ?? "Não foi possível atualizar a etapa logística.");
      return;
    }

    setData(result.data);
    setSelectedLogisticsStage(targetStage);
    setRegressionConfirmed(false);
    setStageDialogOpen(false);
    setError("");
  }

  if (!data) {
    return (
      <div className="orders-package-detail orders-package-detail--loading">
        <Link className="orders-package-detail-back" href={returnTo}>‹ Voltar aos pacotes</Link>
        <p role={error ? "alert" : "status"}>{error || "Carregando pacote…"}</p>
      </div>
    );
  }

  const pkg = data.pkg;
  const editable = pkg.reviewState === "confirmed" && !pkg.financialClosedAt;
  const hasUnits = data.reservations.length > 0;
  const mounting = pkg.stage === "preparing" && !pkg.contentClosedAt;
  const contentClosed = !!pkg.contentClosedAt;
  const logisticsStage = stageLabels[pkg.stage];
  const stageIndex = pkg.stage === "preparing" ? 0 : pkg.stage === "sent" ? 1 : 2;
  const capturedManifest = contentClosed && data.manifests.length > 0;
  const sumUnits = (units: readonly { amountCents: number }[]) =>
    units.reduce((sum, unit) => sum + unit.amountCents, 0);
  const inherited = data.valuation?.items.reduce(
    (sum, item) => sum + item.components.reduce(
      (componentSum, component) => componentSum + sumUnits(component.units),
      0,
    ),
    0,
  );
  const legacyFreight = !data.ownership.freight
    ? data.legacyCharges.find((charge) => charge.chargeType === "brazil_freight")
    : undefined;
  const legacyCustoms = !data.ownership.customs
    ? data.legacyCharges.find((charge) => charge.chargeType === "customs")
    : undefined;
  const freight = pkg.freightState === "no_charge"
    ? 0
    : pkg.freightState === "known"
      ? pkg.freightCents
      : legacyFreight?.valueState === "no_charge"
        ? 0
        : legacyFreight?.amountCents ?? null;
  const fee = pkg.freightState === "no_charge"
    ? 0
    : pkg.freightState === "known"
      ? pkg.freightFeeCents
      : legacyFreight?.valueState === "no_charge"
        ? 0
        : legacyFreight?.amountCents !== null && legacyFreight?.amountCents !== undefined
          ? (data.legacyProjections.find((charge) => charge.chargeType === "brazil_freight")?.knownCents ?? 0)
            - legacyFreight.amountCents
          : null;
  const customs = pkg.customsState === "no_charge"
    ? 0
    : pkg.customsState === "known"
      ? pkg.customsCents
      : legacyCustoms?.valueState === "no_charge"
        ? 0
        : legacyCustoms?.amountCents ?? null;
  const finalKnown = inherited !== undefined && freight !== null && fee !== null && customs !== null;
  const freightPaid = data.ownership.freight
    ? !!pkg.freightPaidAt
    : legacyFreight?.paymentStatus === "paid" && !!legacyFreight.paidAt;
  const customsPaid = data.ownership.customs
    ? !!pkg.customsPaidAt
    : legacyCustoms?.paymentStatus === "paid" && !!legacyCustoms.paidAt;
  const customsResolved = customsPaid
    || pkg.customsState === "no_charge"
    || (!data.ownership.customs && legacyCustoms?.valueState === "no_charge");
  const freightPaymentPending = !freightPaid
    && (pkg.freightState === "known" || legacyFreight?.valueState === "known");
  const customsPaymentPending = !customsPaid
    && (pkg.customsState === "known" || legacyCustoms?.valueState === "known");
  const financePending = !pkg.financialClosedAt && (
    freight === null
    || fee === null
    || customs === null
    || freightPaymentPending
    || customsPaymentPending
  );
  const financeStatus = pkg.financialClosedAt
    ? "Encerrado"
    : financePending
      ? "Pendente"
      : "Sem pendências";
  const freightSummary = freight === null || fee === null
    ? "a conferir"
    : formatMoney(freight + fee);
  const customsSummary = customs === null
    ? "a conferir (cobrança independente)"
    : formatMoney(customs) + " (cobrança independente)";
  const financialTotal = (inherited ?? 0) + (freight ?? 0) + (fee ?? 0) + (customs ?? 0);
  const packageItems = [...new Set(data.reservations.map((reservation) => reservation.costItemId))]
    .map((costItemId) => {
      const row = warehouse?.rows.find((candidate) => candidate.costItemId === costItemId);
      return {
        costItemId,
        row,
        name: row?.name ?? "Item da origem financeira",
        count: data.reservations.filter((reservation) => reservation.costItemId === costItemId).length,
      };
    });
  const orderIds = [...new Set(packageItems.flatMap((item) => item.row ? [item.row.order.id] : []))];
  const productNameLines: string[] = [];
  for (let index = 0; index < packageItems.length; index += 2) {
    productNameLines.push(packageItems.slice(index, index + 2).map((item) => item.name).join(" · "));
  }
  const personName = (id: string) =>
    workspace.members.find((member) => member.id === id)?.name ?? "Membro";
  const recordChargeAvailable = editable && hasUnits;
  const recordFreightAvailable = recordChargeAvailable && !freightPaid;
  const freightAction: Action | null = recordFreightAvailable
    ? "record_freight"
    : recordChargeAvailable && freightPaid
      ? "correct_freight"
      : null;
  const freightActionLabel = freightAction === "correct_freight" ? "Corrigir frete" : "Informar frete";
  const canCloseFinancial = contentClosed && freightPaid && customsResolved;
  const canDispatch = pkg.reviewState === "confirmed" && contentClosed && freightPaid && data.inPackage;
  const allocationLinkLabel = allocationsOpen ? "Rateios por participante  ▾" : "Rateios por participante  ▸";
  const mobileCostParts = [
    freight === null ? "Frete" : null,
    fee === null ? "taxa" : null,
    customs === null ? "Receita" : null,
  ].filter((part): part is string => part !== null);
  const mobileCostNote = mobileCostParts.length
    ? `${mobileCostParts.length > 1
      ? mobileCostParts.slice(0, -1).join(", ") + " e " + mobileCostParts.at(-1)
      : mobileCostParts[0]} a conferir`
    : freightPaymentPending || customsPaymentPending
      ? [freightPaymentPending ? "pagamento do frete" : null, customsPaymentPending ? "pagamento da Receita" : null]
        .filter((part): part is string => part !== null)
        .join(" · ") + " pendente"
      : pkg.financialClosedAt ? "Custos encerrados" : "Valores e pagamentos conferidos";
  const logisticsProgressLabel = pkg.stage === "preparing"
    ? "Preparando para envio"
    : pkg.stage === "sent" ? "A caminho" : "Recebido";
  const mobileLogisticsSummary = pkg.stage === "preparing"
    ? `${data.unitCount} ${data.unitCount === 1 ? "unidade aguardando envio" : "unidades aguardando envio"}`
    : pkg.stage === "sent"
      ? `${data.unitCount} ${data.unitCount === 1 ? "unidade a caminho" : "unidades a caminho"}`
      : `${data.unitCount} ${data.unitCount === 1 ? "unidade recebida" : "unidades recebidas"}`;
  const mobileContentSummary = orderIds.length
    ? `${packageItems.length} ${packageItems.length === 1 ? "produto vinculado" : "produtos vinculados"} ao pacote`
    : "Itens do pacote sem pedido vinculado";
  const mobileFinanceChecks = [
    freight === null || fee === null ? "Frete, taxa" : null,
    customs === null ? "Receita" : null,
  ].filter((part): part is string => part !== null);
  const mobileFinancePayments = [
    freightPaymentPending ? "frete não pago" : null,
    customsPaymentPending ? "Receita não paga" : null,
  ].filter((part): part is string => part !== null);
  const mobileFinanceSummary = [
    mobileFinanceChecks.length ? `${mobileFinanceChecks.join(" e ")} a conferir` : null,
    ...mobileFinancePayments,
  ].filter((part): part is string => part !== null).join(" · ") || "Custos e pagamentos conferidos";

  return (
    <div className="orders-package-detail">
      <Link className="orders-package-detail-back" href={returnTo}>‹ Voltar aos pacotes</Link>
      <header className="orders-package-detail-header">
        <div>
          <h1>{pkg.name}</h1>
          <p className="orders-package-detail-subtitle-desktop">
            {data.unitCount} {data.unitCount === 1 ? "unidade" : "unidades"}
            {" · "}
            {contentClosed ? "conteúdo fechado" : "conteúdo em montagem"}
            {" · "}
            {logisticsStage.toLocaleLowerCase("pt-BR")}
          </p>
          <p className="orders-package-detail-subtitle-mobile">
            {data.unitCount} {data.unitCount === 1 ? "unidade" : "unidades"}
            {" · "}
            {contentClosed ? "conteúdo fechado" : "conteúdo em montagem"}
          </p>
        </div>
        {recordFreightAvailable && (
          <Button
            className="orders-package-header-action"
            onClick={() => setAction("record_freight")}
          >
            Informar frete
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="orders-package-more-actions-trigger"
          aria-label="Mais ações"
          onClick={() => setMoreActionsOpen(true)}
        >
          <MoreHorizontal size={20} aria-hidden="true" />
        </Button>
      </header>

      {error && <p role="alert" className="form-error">{error}</p>}
      {pkg.reviewState === "pending_review" && (
        <p className="orders-package-review-notice">
          Conferência legada pendente. Confira primeiro a conta e chegada dos itens em{" "}
          <Link href="/orders">Pedidos</Link>.
        </p>
      )}

      <section className="orders-package-tracker-card" aria-label="Etapa logística">
        <p className="orders-package-tracker-title">ETAPA LOGÍSTICA</p>
        <div className="orders-package-tracker" role="list" aria-label="Progresso logístico">
          {(["Preparando", "A caminho", "Recebido"] as const).map((label, index) => (
            <div className="orders-package-tracker-group" key={label}>
              <div
                className={
                  "orders-package-tracker-step"
                  + (index < stageIndex ? " is-complete" : "")
                  + (index === stageIndex ? " is-current" : "")
                }
                role="listitem"
                aria-current={index === stageIndex ? "step" : undefined}
              >
                <span className="orders-package-tracker-dot" aria-hidden="true" />
                <span className="orders-package-tracker-label">{label}</span>
              </div>
              {index < 2 && (
                <span
                  className={
                    "orders-package-tracker-line"
                    + (index < stageIndex ? " is-complete" : "")
                  }
                  aria-hidden="true"
                />
              )}
            </div>
          ))}
        </div>
        <div className="orders-package-mobile-tracker">
          <div className="orders-package-mobile-tracker-heading">
            <h2>Etapa logística</h2>
            <span>{stageIndex + 1} de 3</span>
          </div>
          <p>{logisticsProgressLabel}</p>
          <div className="orders-package-mobile-tracker-bars">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className={index <= stageIndex ? "is-active" : undefined}
              />
            ))}
          </div>
          <div className="orders-package-mobile-tracker-labels">
            <span>Preparando</span><span>A caminho</span><span>Recebido</span>
          </div>
        </div>
      </section>

      <div className="orders-package-detail-grid">
        <aside className="orders-package-cost-card" aria-labelledby="orders-package-cost-title">
          <div className="orders-package-cost-title-row">
            <h2 id="orders-package-cost-title">Resumo de custos</h2>
            <button
              type="button"
              className="orders-package-text-action orders-package-allocation-toggle"
              aria-controls="orders-package-rateios"
              aria-expanded={allocationsOpen}
              onClick={() => setAllocationsOpen((open) => !open)}
            >
              <span className="orders-package-allocation-desktop">{allocationLinkLabel}</span>
              <span className="orders-package-allocation-mobile">
                {allocationsOpen ? "Ocultar rateios" : "Ver rateios ›"}
              </span>
            </button>
          </div>
          <p className="orders-package-cost-state">
            {finalKnown ? "Total conhecido" : "Parcial conhecido"}
          </p>
          <p className="orders-package-cost-total">{formatMoney(financialTotal)}</p>
          <div className="orders-package-cost-mobile-total">
            <p className="orders-package-cost-total">{formatMoney(financialTotal)}</p>
            <span>{finalKnown ? "total conhecido" : "parcial conhecido"}</span>
          </div>
          <p className="orders-package-cost-final">
            {finalKnown ? "Custos finais disponíveis." : "Custo final ainda indisponível."}
          </p>
          <span className="orders-package-cost-mobile-divider" aria-hidden="true" />
          <p className="orders-package-cost-mobile-note" aria-label={mobileCostNote}>{mobileCostNote}</p>

          <dl className="orders-package-cost-rows">
            <div>
              <dt>Itens herdados</dt>
              <dd className={inherited === undefined ? "is-pending" : undefined}>
                {inherited === undefined ? "A conferir" : formatMoney(inherited)}
              </dd>
            </div>
            <div>
              <dt>Frete Brasil</dt>
              <dd className={freight === null ? "is-pending" : undefined}>
                {freight === null ? "A conferir" : formatMoney(freight)}
              </dd>
            </div>
            <div>
              <dt>Taxa do frete</dt>
              <dd className={fee === null ? "is-pending" : undefined}>
                {fee === null ? "A conferir" : formatMoney(fee)}
              </dd>
            </div>
            <div>
              <dt>Receita</dt>
              <dd className={customs === null ? "is-pending" : undefined}>
                {customs === null ? "A conferir" : formatMoney(customs)}
              </dd>
            </div>
          </dl>

          <p className="orders-package-cost-payment-note">
            Informar valor não confirma pagamento.
          </p>
          {recordFreightAvailable && (
            <Button
              className="orders-package-summary-cta"
              onClick={() => setAction("record_freight")}
            >
              Informar frete
            </Button>
          )}
        </aside>

        <div className="orders-package-step-list" role="group" aria-label="Etapas do pacote">
          <h2 className="orders-package-step-list-heading">Etapas do pacote</h2>
          <div className="orders-package-step-cards">
          <section className="orders-package-step-card" aria-labelledby="orders-package-logistics-title">
            <div className="orders-package-step-header">
              <span className="orders-package-step-number" aria-hidden="true">1</span>
              <h2 id="orders-package-logistics-title">Logística</h2>
              <span className={"orders-package-step-status " + "is-" + pkg.stage}>
                {logisticsStage}
              </span>
            </div>
            <div className="orders-package-step-body">
              <p className="orders-package-step-summary">
                <span className="orders-package-step-summary-desktop">
                  {logisticsStage} · {data.unitCount} {data.unitCount === 1 ? "unidade" : "unidades"} no pacote
                </span>
                <span className="orders-package-step-summary-mobile">{mobileLogisticsSummary}</span>
              </p>
              <p className="orders-package-step-description">
                Movimentação independente do conteúdo e dos pagamentos.
              </p>
              {pkg.reviewState === "confirmed" && (
                <button
                  type="button"
                  className="orders-package-step-link"
                  onClick={openLogisticsStageDialog}
                >
                  Atualizar etapa <span aria-hidden="true">→</span>
                </button>
              )}
            </div>
          </section>

          <section className="orders-package-step-card" aria-labelledby="orders-package-content-title">
            <div className="orders-package-step-header">
              <span className="orders-package-step-number" aria-hidden="true">2</span>
              <h2 id="orders-package-content-title">Conteúdo</h2>
              <span className={"orders-package-step-status " + (contentClosed ? "is-closed" : "is-preparing")}>
                {contentClosed ? "Fechado" : "Em montagem"}
              </span>
            </div>
            <div className="orders-package-step-body">
              <p className="orders-package-step-summary">
                <span className="orders-package-step-summary-desktop">
                  {data.unitCount} {data.unitCount === 1 ? "unidade" : "unidades"} · conteúdo {contentClosed ? "fechado" : "em montagem"}
                </span>
                <span className="orders-package-step-summary-mobile">{mobileContentSummary}</span>
              </p>
              <p className="orders-package-product-names">
                {productNameLines.length
                  ? productNameLines.map((line, index) => <span key={index}>{line}</span>)
                  : "Sem unidades neste pacote."}
              </p>
              <div className="orders-package-order-links">
                {orderIds.length === 1 ? (
                  <Link href={"/orders/" + encodeURIComponent(orderIds[0])}>
                    <span className="orders-package-order-link-desktop">Ver pedido, custos e QC</span>
                    <span className="orders-package-order-link-mobile">Ver produtos e QC</span>
                    <span aria-hidden="true"> →</span>
                  </Link>
                ) : orderIds.length > 1 ? (
                  orderIds.map((orderId, index) => (
                    <Link key={orderId} href={"/orders/" + encodeURIComponent(orderId)}>
                      <span className="orders-package-order-link-desktop">{"Ver pedido " + (index + 1) + ", custos e QC"}</span>
                      <span className="orders-package-order-link-mobile">{"Pedido " + (index + 1) + " · produtos e QC"}</span>
                      <span aria-hidden="true"> →</span>
                    </Link>
                  ))
                ) : (
                  <span>Pedido e QC indisponíveis</span>
                )}
              </div>
            </div>
          </section>

          <section className="orders-package-step-card" aria-labelledby="orders-package-financial-title">
            <div className="orders-package-step-header">
              <span className="orders-package-step-number" aria-hidden="true">3</span>
              <h2 id="orders-package-financial-title">Financeiro</h2>
              <span className={"orders-package-step-status " + (financePending ? "is-pending" : "is-closed")}>
                {financeStatus}
              </span>
            </div>
            <div className="orders-package-step-body">
              <p className="orders-package-step-summary">
                <span className="orders-package-step-summary-desktop">Frete Brasil e taxa: {freightSummary}</span>
                <span className="orders-package-step-summary-mobile">{mobileFinanceSummary}</span>
              </p>
              <p className="orders-package-step-description">Receita: {customsSummary}</p>
              <p className="orders-package-step-description">
                {freightPaid && customsPaid
                  ? "Pagamentos confirmados independentemente."
                  : "Pagamento ainda não confirmado."}
              </p>
              <button
                type="button"
                className="orders-package-step-link orders-package-step-link-desktop"
                aria-controls="orders-package-actions"
                aria-expanded={actionsOpen}
                onClick={() => setActionsOpen((open) => !open)}
              >
                {financePending ? "Conferir pendências" : "Ver ações do pacote"}
                {" "}
                <span aria-hidden="true">→</span>
              </button>
              <button
                type="button"
                className="orders-package-step-link orders-package-step-link-mobile"
                aria-controls="orders-package-actions"
                aria-expanded={actionsOpen}
                onClick={() => setActionsOpen((open) => !open)}
              >
                Revisar custos <span aria-hidden="true">→</span>
              </button>
            </div>
          </section>
          </div>
        </div>
      </div>

      <div
        id="orders-package-rateios"
        className="orders-package-allocation-panel"
        ref={allocationsPanelRef}
        hidden={!allocationsOpen}
        aria-label="Rateios por participante"
      >
        {data.valuation && (
          <section className="orders-package-section orders-inherited-distribution" aria-labelledby="orders-inherited-heading">
            <h2 id="orders-inherited-heading">Valores herdados dos produtos</h2>
            <p className="muted">
              {capturedManifest
                ? "Distribuição capturada no manifesto vigente. As versões anteriores permanecem no histórico."
                : "Prévia da montagem. A distribuição será capturada ao fechar o conteúdo."}
            </p>
            {data.valuation.items.map((item) => {
              const row = warehouse?.rows.find((candidate) => candidate.costItemId === item.costItemId);
              const origin = warehouse?.origins.find((candidate) => candidate.trackingId === item.trackingId);
              const productTotal = item.components.reduce(
                (sum, component) => sum + sumUnits(component.units),
                0,
              );
              return (
                <details className="orders-allocation-product" key={item.costItemId}>
                  <summary>
                    <span>
                      <strong>{row?.name ?? "Item da origem financeira"}</strong>
                      <small>
                        {row?.order.kind === "additional" ? "Adicional" : "Compra"}
                        {" · "}
                        {origin?.name ?? "Origem da compra"}
                        {row?.source.variant ? " · " + row.source.variant : ""}
                      </small>
                    </span>
                    <strong>Subtotal {formatMoney(productTotal)}</strong>
                  </summary>
                  {item.components.map((component) => (
                    <section className="orders-allocation-component" key={component.name}>
                      <div className="orders-allocation-component-heading">
                        <h3>{component.name}</h3>
                        <strong>Subtotal {formatMoney(sumUnits(component.units))}</strong>
                      </div>
                      <AllocationTable
                        caption={(row?.name ?? "Item da origem financeira") + " · " + component.name}
                        units={component.units}
                        personName={personName}
                      />
                    </section>
                  ))}
                </details>
              );
            })}
          </section>
        )}
        <section
          className="orders-package-section orders-charge-distribution"
          aria-label="Distribuição dos encargos do pacote"
        >
          <h2>Encargos do pacote</h2>
          <p className="muted">
            {capturedManifest
              ? "Rateio capturado no manifesto vigente; valores herdados dos produtos estão apresentados separadamente."
              : "Prévia da montagem; estes encargos serão capturados ao fechar o conteúdo."}
          </p>
          {data.valuation?.charges.map((charge) => (
            <details className="orders-package-charge" key={charge.name}>
              <summary>
                <span>{charge.name}</span>
                <strong>{formatMoney(charge.amountCents)}</strong>
              </summary>
              {[...new Set(charge.units.map((unit) => unit.costItemId))].map((costItemId) => {
                const units = charge.units.filter((unit) => unit.costItemId === costItemId);
                return (
                  <article className="orders-charge-allocation-item" key={costItemId}>
                    <h3>
                      {packageItems.find((item) => item.costItemId === costItemId)?.name ?? "Item"}
                      <span>Subtotal {formatMoney(sumUnits(units))}</span>
                    </h3>
                    <AllocationTable
                      caption={charge.name + " · " + (packageItems.find((item) => item.costItemId === costItemId)?.name ?? "Item")}
                      units={units}
                      personName={personName}
                    />
                  </article>
                );
              })}
            </details>
          ))}
          {data.legacyProjections.filter((charge) => charge.active).map((charge) => (
            <details className="orders-package-charge" key={charge.legacyChargeId}>
              <summary>
                <span>
                  {charge.chargeType === "brazil_freight"
                    ? "Encargo legado · frete e taxa"
                    : "Encargo legado · Receita"}
                </span>
                <strong>
                  {formatMoney(charge.knownCents)}
                  {charge.finalCents === null ? " parcial" : ""}
                </strong>
              </summary>
              <p className="muted">
                Parcelas preservadas da cobrança legada. Não são cobradas novamente nem possuem rateio físico por unidade.
              </p>
              {charge.items.map((item) => (
                <article className="orders-legacy-allocation-item" key={item.costItemId}>
                  <h3>
                    {packageItems.find((candidate) => candidate.costItemId === item.costItemId)?.name ?? "Item"}
                  </h3>
                  {item.components.map((component) => (
                    <div className="orders-legacy-allocation-component" key={component.name}>
                      <h4>{component.name}</h4>
                      <p>Componente: {component.amountCents === null ? "Pendente" : formatMoney(component.amountCents)}</p>
                      {component.people.map((person) => (
                        <p key={person.personId}>
                          Pessoa: {personName(person.personId)} · {person.amountCents === null ? "Pendente" : formatMoney(person.amountCents)}
                        </p>
                      ))}
                    </div>
                  ))}
                </article>
              ))}
            </details>
          ))}
          {data.valuation?.charges.length === 0 && data.legacyProjections.every((charge) => !charge.active) && (
            <p>Nenhum encargo alocado neste pacote.</p>
          )}
          {!data.valuation && <p>{data.valuationError ?? "Bases e parcelas a conferir antes da prévia."}</p>}
          {freight === null && <p>Frete Brasil: pendente</p>}
          {fee === null && <p>Taxa do frete: pendente</p>}
          {customs === null && <p>Receita: pendente</p>}
        </section>
      </div>

      <section
        id="orders-package-actions"
        className="orders-package-action-panel"
        ref={actionsPanelRef}
        hidden={!actionsOpen}
        aria-label="Ações disponíveis do pacote"
      >
        <section className="orders-package-section orders-package-financial" aria-labelledby="orders-costs-heading">
          <div className="orders-package-section-heading">
            <div>
              <h2 id="orders-costs-heading">Custos e pagamentos</h2>
              <p className="muted">Informar valores e confirmar pagamentos são ações independentes.</p>
            </div>
            {pkg.financialClosedAt
              ? <Button variant="outline" onClick={() => setAction("reopen_financial")}>Reabrir custos</Button>
              : editable && canCloseFinancial && <Button variant="outline" onClick={() => setAction("close_financial")}>Encerrar custos</Button>}
          </div>
          {!pkg.financialClosedAt && editable && !canCloseFinancial && (
            <p className="muted">Encerre após fechar o conteúdo e resolver frete e Receita.</p>
          )}
          <div className="orders-charge-controls">
            <article className="orders-charge-control">
              <div>
                <h3>Frete Brasil</h3>
                <p>{freight === null ? "A conferir" : formatMoney(freight)} · taxa {fee === null ? "a conferir" : formatMoney(fee)}</p>
                {pkg.weightGrams && <p className="muted">Peso: {pkg.weightGrams} g</p>}
              </div>
              <div className="orders-context-actions">
                {recordChargeAvailable && !freightPaid && (
                  <>
                    <Button variant="outline" onClick={() => setAction("record_freight")}>Informar frete</Button>
                    <Button variant="outline" onClick={() => setAction("freight")}>Confirmar frete pago</Button>
                  </>
                )}
                {recordChargeAvailable && freightPaid && (
                  <Button variant="outline" onClick={() => setAction("correct_freight")}>Corrigir frete</Button>
                )}
              </div>
            </article>
            <article className="orders-charge-control">
              <div>
                <h3>Receita</h3>
                <p>{customs === null ? "A conferir" : formatMoney(customs)}</p>
              </div>
              <div className="orders-context-actions">
                {recordChargeAvailable && !customsPaid && (
                  <>
                    <Button variant="outline" onClick={() => setAction("record_customs")}>Informar Receita</Button>
                    <Button variant="outline" onClick={() => setAction("customs")}>Confirmar Receita paga</Button>
                  </>
                )}
                {recordChargeAvailable && customsPaid && (
                  <Button variant="outline" onClick={() => setAction("correct_customs")}>Corrigir Receita</Button>
                )}
              </div>
            </article>
          </div>
          {data.legacyCharges.length > 0 && (
            <details className="orders-legacy-charges">
              <summary>Encargos legados preservados</summary>
              {data.legacyCharges.map((charge) => (
                <p key={charge.id}>
                  {charge.chargeType === "brazil_freight" ? "Frete" : "Receita"}:{" "}
                  {charge.valueState === "pending"
                    ? "Pendente"
                    : charge.valueState === "no_charge"
                      ? "Sem cobrança"
                      : formatMoney(charge.amountCents ?? 0)}
                  {" · "}
                  {charge.paymentStatus === "paid" ? "Pago" : "Não confirmado"}
                </p>
              ))}
            </details>
          )}
        </section>

        <section className="orders-package-section orders-package-content" aria-labelledby="orders-content-actions-heading">
          <div className="orders-package-section-heading">
            <div>
              <h2 id="orders-content-actions-heading">Conteúdo</h2>
              <p className="muted">
                {data.unitCount} {data.unitCount === 1 ? "unidade" : "unidades"} ·{" "}
                {contentClosed ? "Conteúdo fechado" : "Conteúdo em montagem"}
              </p>
            </div>
            <div className="orders-context-actions">
              {editable && mounting && (
                <>
                  <Button disabled={!data.reservations.length} onClick={() => setAction("close_content")}>Fechar conteúdo</Button>
                  <Button
                    variant="outline"
                    disabled={!data.reservations.length}
                    onClick={() => setAction("release")}
                  >
                    Retirar unidades
                  </Button>
                  <Link href="/orders">Acrescentar itens</Link>
                </>
              )}
              {editable && contentClosed && pkg.stage === "preparing" && (
                <Button variant="outline" onClick={() => setAction("reopen_content")}>Reabrir conteúdo</Button>
              )}
            </div>
          </div>
        </section>

        <section className="orders-package-section" aria-labelledby="orders-logistics-actions-heading">
          <div className="orders-package-section-heading">
            <div>
              <h2 id="orders-logistics-actions-heading">Logística</h2>
              <p className="muted">
                {logisticsStage} · {data.unitCount} {data.unitCount === 1 ? "unidade" : "unidades"} no pacote
              </p>
            </div>
            <div className="orders-context-actions">
              {pkg.reviewState === "pending_review" && (
                <Button onClick={() => setAction("review")}>Conferir legado</Button>
              )}
              {editable && pkg.legacyPackageId && !contentClosed && pkg.stage !== "preparing" && (
                <Button onClick={() => setAction("confirm_legacy_content")}>
                  Confirmar conteúdo legado fechado
                </Button>
              )}
              {pkg.reviewState === "confirmed" && (
                <Button variant="outline" onClick={openLogisticsStageDialog}>Atualizar etapa</Button>
              )}
              {data.inPackage && (
                <Button variant="outline" onClick={() => setAction("weight")}>Informar peso</Button>
              )}
            </div>
          </div>
        </section>
      </section>

      <details className="orders-package-history">
        <summary>
          <span className="orders-package-history-desktop-label">Histórico de movimentações e versões do manifesto</span>
          <span className="orders-package-history-mobile-label">Histórico e manifestos</span>
          <span className="orders-package-history-chevron" aria-hidden="true">▸</span>
        </summary>
        <div className="orders-package-history-list">
          {data.events.map((event) => {
            const after = eventRecord(event.after);
            const command = eventRecord(after.command);
            const chargeChange = ["pay_charge", "record_charge", "correct_charge"].includes(event.action);
            const previousStage = eventStage(event.before);
            const nextStage = eventStage(event.after);
            const stageChanged = previousStage && nextStage && previousStage !== nextStage;
            return (
              <article className="orders-package-history-entry" key={event.id}>
                <div className="orders-package-history-entry-heading">
                  <strong>{chargeChange
                    ? packageChargeEventLabel(event.action, command.charge)
                    : eventLabels[event.action] ?? event.action}</strong>
                  <span>{formatRecordedAt(event.createdAt)} · {personName(event.actorId)}</span>
                </div>
                {stageChanged && (
                  <p>Etapa logística: {previousStage} → {nextStage}</p>
                )}
                {chargeChange && packageChargeEventDetails(event.before, event.after).map((detail) => (
                  <p key={detail}>{detail}</p>
                ))}
                {event.reason && <p>{event.reason}</p>}
              </article>
            );
          })}
          {data.manifests.map((manifest) => (
            <article className="orders-package-history-entry" key={manifest.id}>
              <div className="orders-package-history-entry-heading">
                <strong>Manifesto · versão {manifest.revision}</strong>
                <span>{formatRecordedAt(manifest.createdAt)} · {personName(manifest.createdBy)}</span>
              </div>
            </article>
          ))}
          {!data.events.length && !data.manifests.length && (
            <p>Nenhuma movimentação ou versão registrada.</p>
          )}
        </div>
      </details>

      <DialogSurface
        open={moreActionsOpen}
        onOpenChange={setMoreActionsOpen}
        title="Ações do pacote"
        subtitle="Escolha uma ação para continuar."
        sheet
        className="orders-package-actions-sheet"
      >
        <div className="orders-package-action-options">
          {freightAction && (
            <Button
              type="button"
              className="orders-package-action-option is-primary"
              onClick={() => {
                setMoreActionsOpen(false);
                setAction(freightAction);
              }}
            >
              {freightActionLabel}
            </Button>
          )}
          {orderIds.length === 1 ? (
            <Link
              className="orders-package-action-option is-secondary"
              href={"/orders/" + encodeURIComponent(orderIds[0])}
              onClick={() => setMoreActionsOpen(false)}
            >
              Ver produtos e QC
            </Link>
          ) : orderIds.length > 1 ? (
            <Button
              type="button"
              variant="soft"
              className="orders-package-action-option is-secondary"
              onClick={() => {
                setMoreActionsOpen(false);
                document.getElementById("orders-package-content-title")?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              Ver produtos e QC
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="orders-package-action-option is-cancel"
            onClick={() => setMoreActionsOpen(false)}
          >
            Cancelar
          </Button>
        </div>
      </DialogSurface>

      <Surface
        open={stageDialogOpen}
        onOpenChange={(open) => {
          if (!open) setStageDialogOpen(false);
        }}
        title="Atualizar etapa logística"
        sheet={false}
        className="orders-package-stage-surface"
      >
        <form
          className="orders-package-stage-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submitLogisticsStage(new FormData(event.currentTarget));
          }}
        >
          <p className="orders-package-stage-desktop-subtitle">Escolha a etapa real de movimentação do pacote.</p>
          <p className="orders-package-stage-mobile-subtitle">Selecione a situação atual do pacote.</p>
          <fieldset className="orders-package-stage-options">
            <legend className="sr-only">Selecione uma etapa do pacote</legend>
            {logisticsStageSequence.map((stage) => {
              const currentIndex = logisticsStageSequence.indexOf(pkg.stage);
              const targetIndex = logisticsStageSequence.indexOf(stage);
              const isCurrent = stage === pkg.stage;
              const isRegressionTarget = targetIndex < currentIndex;
              const previousStepOnly = currentIndex - targetIndex === 1;
              const allowedForward = stage === "sent"
                ? pkg.stage === "preparing" && canDispatch
                : stage === "received" && pkg.stage === "sent";
              const allowed = isCurrent || (isRegressionTarget && previousStepOnly) || allowedForward;
              const description = isCurrent
                ? "Etapa atual"
                : !allowed && stage === "sent" && pkg.stage === "preparing"
                  ? "Feche o conteúdo e confirme o frete"
                  : !allowed && stage === "received" && pkg.stage === "preparing"
                    ? "Registre A caminho primeiro"
                    : stage === "sent" ? "Pacote enviado"
                      : stage === "received" ? "Entrega confirmada" : "Etapa de montagem";
              return (
                <label
                  key={stage}
                  className={
                    "orders-package-stage-option"
                    + (isCurrent ? " is-current" : "")
                    + (!allowed ? " is-disabled" : "")
                  }
                >
                  <input
                    type="radio"
                    name="stage"
                    value={stage}
                    checked={selectedLogisticsStage === stage}
                    disabled={!allowed}
                    onChange={() => {
                      setSelectedLogisticsStage(stage);
                      setRegressionConfirmed(false);
                      setError("");
                    }}
                  />
                  <span className="orders-package-stage-option-copy">
                    <strong>{stageLabels[stage]}</strong>
                    <small>{description}</small>
                  </span>
                </label>
              );
            })}
          </fieldset>

          {logisticsStageSequence.indexOf(selectedLogisticsStage) < logisticsStageSequence.indexOf(pkg.stage) ? (
            <label className="orders-package-stage-regression-confirmation">
              <input
                type="checkbox"
                name="regressionConfirmed"
                required
                checked={regressionConfirmed}
                onChange={(event) => setRegressionConfirmed(event.currentTarget.checked)}
              />
              <span>
                <strong>Confirmo a regressão: {logisticsStage} → {stageLabels[selectedLogisticsStage]}.</strong>
                <small>Responsável e horário ficam no histórico. Custos e pagamentos não mudam.</small>
              </span>
            </label>
          ) : (
            <aside className="orders-package-stage-notice">
              <p className="orders-package-stage-notice-desktop">
                <strong>A mudança não encerra custos.</strong>
                <span>Receita e pagamentos continuam independentes.</span>
              </p>
              <p className="orders-package-stage-notice-mobile">
                <strong>Mudanças não encerram custos.</strong>
                <span>Retroceder exige confirmação e histórico.</span>
              </p>
            </aside>
          )}

          {error && <p className="form-error orders-package-stage-error" role="alert">{error}</p>}
          <Button
            type="submit"
            className="orders-package-stage-save"
            disabled={
              busy
              || selectedLogisticsStage === pkg.stage
              || (logisticsStageSequence.indexOf(selectedLogisticsStage) < logisticsStageSequence.indexOf(pkg.stage)
                && (!regressionConfirmed || logisticsStageSequence.indexOf(pkg.stage) - logisticsStageSequence.indexOf(selectedLogisticsStage) !== 1))
              || (selectedLogisticsStage === "sent" && !canDispatch)
              || (selectedLogisticsStage === "received" && pkg.stage !== "sent")
            }
          >
            {busy ? "Salvando…" : "Salvar etapa"}
          </Button>
        </form>
      </Surface>

      <Surface
        open={!!action}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
        title={action ? titles[action] : "Pacote"}
        sheet
        className="orders-package-operation-sheet"
      >
        <form
          className="orders-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(new FormData(event.currentTarget));
          }}
        >
          {action === "review" && (
            <>
              <p>A confirmação registra a conferência de agora. Não cria chegada, pagamento ou despacho histórico.</p>
              <label>
                Conta
                <select name="account" required defaultValue={pkg.accountId ?? ""}>
                  <option value="" disabled>Selecione</option>
                  {warehouse?.accounts.filter((account) => account.status === "active").map((account) => (
                    <option key={account.id} value={account.id}>{account.label}</option>
                  ))}
                </select>
              </label>
              {!contentClosed && (
                <label>
                  <span>
                    <input type="checkbox" name="closedContent" />
                    {" "}Confirmei por evidência que o conteúdo legado está fechado agora.
                  </span>
                </label>
              )}
            </>
          )}
          {action === "confirm_legacy_content" && (
            <p>
              Registra a confirmação atual do conteúdo fechado. A data histórica de fechamento continua desconhecida; pagamentos e despacho não são alterados.
            </p>
          )}
          {action === "dispatch" && (
            <p role="status">
              {canDispatch
                ? "O despacho atualiza somente a etapa logística; não confirma frete nem altera custos."
                : "Para marcar A caminho, feche o conteúdo e confirme o pagamento do frete."}
            </p>
          )}
          {action === "receive" && (
            <p>O recebimento atualiza somente a etapa logística; não altera custos nem pagamentos.</p>
          )}
          {(action === "freight" || action === "customs") && (
            <>
              <label>
                Valor em reais
                <input name="amount" required inputMode="decimal" placeholder="0,00" />
              </label>
              <label>
                Forma de pagamento
                <select name="method">
                  <option value="pix">Pix</option>
                  <option value="card">Cartão</option>
                </select>
              </label>
              {action === "freight" && (
                <label>
                  Taxa capturada (%)
                  <input
                    name="fee"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    defaultValue="0"
                    required
                  />
                </label>
              )}
              <p>Confirme apenas um pagamento efetivamente realizado. Zero registra isenção explícita.</p>
            </>
          )}
          {(action === "record_freight" || action === "record_customs") && (
            <>
              <p>Informar o valor não confirma pagamento.</p>
              <label>
                Situação
                <select name="state">
                  <option value="known">Valor conhecido</option>
                  <option value="pending">Ainda não informado</option>
                  <option value="no_charge">Sem cobrança, conferido</option>
                </select>
              </label>
              <label>
                Valor conhecido em reais
                <input name="amount" inputMode="decimal" placeholder="0,00" />
              </label>
              {action === "record_freight" && (
                <label>
                  Taxa informada (%)
                  <input name="fee" type="number" min="0" max="100" step="0.01" defaultValue="0" />
                </label>
              )}
            </>
          )}
          {(action === "correct_freight" || action === "correct_customs") && (
            <>
              <p>O pagamento e o rateio anteriores permanecem no histórico. A cobrança corrigida volta a exigir confirmação; conteúdo e despacho permanecem preservados.</p>
              <label>
                Situação
                <select name="state">
                  <option value="known">Valor conhecido</option>
                  <option value="no_charge">Sem cobrança, conferido</option>
                </select>
              </label>
              <label>
                Valor corrigido em reais
                <input name="amount" inputMode="decimal" placeholder="0,00" />
              </label>
              {action === "correct_freight" && (
                <label>
                  Taxa corrigida (%)
                  <input name="fee" type="number" min="0" max="100" step="0.01" defaultValue="0" />
                </label>
              )}
              <label>
                <span>
                  <input type="checkbox" name="resetPayment" required />
                  {" "}Confirmo a correção e a nova conferência de pagamento.
                </span>
              </label>
            </>
          )}
          {action === "weight" && (
            <label>
              Peso em gramas
              <input
                name="weight"
                type="number"
                required
                min="1"
                max="1000000000"
                defaultValue={pkg.weightGrams ?? ""}
              />
            </label>
          )}
          {action === "release" && (
            <fieldset>
              <legend>Unidades que voltarão ao armazém</legend>
              {data.reservations.map((reservation) => (
                <label key={reservation.id}>
                  <span>
                    <input type="checkbox" name="reservation" value={reservation.id} />
                    {" "}
                    {packageItems.find((item) => item.costItemId === reservation.costItemId)?.name ?? "Item"}
                    {" · unidade "}
                    {reservation.unitIndex + 1}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {action === "close_content" && (
            <p>O manifesto congela as unidades e suas parcelas financeiras. O frete não registra despacho.</p>
          )}
          {action === "reopen_content" && (
            <p>O manifesto anterior permanece no histórico. A reabertura não estorna pagamentos.</p>
          )}
          <label>
            Evidência e motivo
            <textarea name="reason" required minLength={3} maxLength={1000} />
          </label>
          <Button
            type="submit"
            disabled={
              busy
              || (action === "dispatch" && !canDispatch)
              || (action === "receive" && pkg.stage !== "sent")
            }
          >
            Confirmar
          </Button>
        </form>
      </Surface>
    </div>
  );
}
