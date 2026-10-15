"use client";

import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays, ChevronDown, CircleCheck, CircleDollarSign, Clock3, Hash, LockKeyhole, MoreVertical, Package, Pencil, Plus, RotateCcw, Trash2, UserRound, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Avatar, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Confirm, Surface } from "@/components/ui/surface";
import type { CostTrackingView } from "@/lib/domain/package-cost-reading";
import { packageCostPresentation, type CostSectionKey } from "@/lib/domain/package-cost-presentation";
import { formatMoney } from "@/lib/domain/money";
import { splitByWeights } from "@/lib/domain/package-cost-calculations";
import { costRequest, percentFromBasisPoints, percentInputFromBasisPoints, basisPointsFromPercent, parseCostCents } from "./package-cost-client";
import { RefundsSection } from "./refunds-section";
import { QcCostCover, QcGalleryButton, QcImportPanel, useQcCostCovers } from "@/components/qc/qc-components";

type Detail = CostTrackingView;
type DetailItem = Detail["items"][number];
type DetailPackage = Detail["packages"][number];
type ChargeType = "products" | "brazil_freight" | "customs";
type ChargeEditor = { id: string; type: ChargeType; name: string };
type ItemEditor = { id: string; name: string };
type PaymentReset = { operation: string; rest: Record<string, unknown> };

const money = (amount: number | null | undefined) => amount === null || amount === undefined ? "Falta informar" : formatMoney(amount);
const logisticName = (status: string) => status === "received" ? "Recebido" : status === "sent" ? "Enviado" : "Em preparação";
const unitsLabel = (count: number) => `${count} ${count === 1 ? "unidade" : "unidades"}`;
function sumComponents(item: DetailItem, startsWith: string) {
  const values = item.calculation?.components.filter(component => component.name.startsWith(startsWith)) ?? [];
  if (!values.length) {
    const unassignedUnits = item.calculation?.pendingComponents.some(component => component.endsWith("unidades sem pacote"));
    if (unassignedUnits && (startsWith === "Frete Brasil" || startsWith === "Receita")) return null;
    return 0;
  }
  return values.some(component => component.amountCents === null) ? null : values.reduce((sum, component) => sum + (component.amountCents ?? 0), 0);
}
function calculatedTotal(total: number | null | undefined, partial: number | null | undefined, hasKnownAmount: boolean | undefined) {
  if (total !== null && total !== undefined) return formatMoney(total);
  return hasKnownAmount ? formatMoney(partial ?? 0) : "Falta informar";
}
function amountInput(value: number | null) { return value === null ? "" : (value / 100).toFixed(2).replace(".", ","); }
function productUnitsSummary(item: DetailItem) {
  const cancelled = item.calculation?.cancelledQuantity ?? 0;
  const shipping = item.calculation?.shippingQuantity ?? item.original.quantity;
  return `${item.original.quantity} ${item.original.quantity === 1 ? "unidade comprada" : "unidades compradas"} · ${cancelled} ${cancelled === 1 ? "unidade cancelada" : "unidades canceladas"} · ${shipping} ${shipping === 1 ? "unidade enviável" : "unidades enviáveis"}`;
}
export function PackageCostDetailScreen({ trackingId }: { trackingId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [itemEditor, setItemEditor] = useState<ItemEditor | null>(null), [chargeEditor, setChargeEditor] = useState<ChargeEditor | null>(null);
  const [itemDetailId, setItemDetailId] = useState<string | null>(null);
  const [closeConfirm, setCloseConfirm] = useState(false), [reopenOpen, setReopenOpen] = useState(false), [reopenReason, setReopenReason] = useState("");
  const [resetConfirm, setResetConfirm] = useState<PaymentReset | null>(null);
  const [refundItemId, setRefundItemId] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<CostSectionKey, boolean>>({ products: false, packages: false, people: false });
  const [expandedPackages, setExpandedPackages] = useState<Record<string, boolean>>({});
  const focusTarget = useRef<string | null>(null);
  const [focusRequestId, setFocusRequestId] = useState(0);
  const url = `/api/packages/${encodeURIComponent(trackingId)}`;

  const setCurrentDetail = useCallback((value: Detail) => {
    setDetail(value);
  }, []);
  useEffect(() => {
    let active = true;
    void costRequest<Detail>(url).then(result => {
      if (!active) return;
      if (result.status === 401) router.replace("/login?reason=session-expired");
      else if (result.ok && result.data) { setCurrentDetail(result.data); setError(""); }
      else setError(result.error ?? "Não foi possível carregar este acompanhamento.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [router, setCurrentDetail, url]);

  useEffect(() => {
    if (!focusRequestId) return;
    const requestedTarget = focusTarget.current;
    focusTarget.current = null;
    if (!requestedTarget) return;
    const target = [...document.querySelectorAll<HTMLElement>("[data-cost-target]")].find(element => element.dataset.costTarget === requestedTarget && element.getClientRects().length > 0);
    if (target) {
      target.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      target.focus({ preventScroll: true });
    }
  }, [focusRequestId]);

  async function mutate(operation: string, rest: Record<string, unknown>, mayInvalidatePayment = false) {
    if (!detail || busy) return false;
    setBusy(true);
    const result = await costRequest<Detail>(url, { operation, ...rest });
    setBusy(false);
    if (result.status === 401) { router.replace("/login?reason=session-expired"); return false; }
    if (result.ok && result.data) { setCurrentDetail(result.data); setError(""); return true; }
    if (mayInvalidatePayment && result.status === 409 && result.error?.includes("Confirme")) {
      setResetConfirm({ operation, rest });
      return false;
    }
    toast.error(result.error ?? "Não foi possível salvar.");
    return false;
  }

  async function confirmReset() {
    if (!resetConfirm || !detail) return;
    const { operation, rest } = resetConfirm;
    const input = { ...(rest.input as Record<string, unknown>), confirmPaymentReset: true };
    setResetConfirm(null);
    await mutate(operation, { ...rest, input });
  }

  const locked = detail?.tracking.status === "closed";
  const assignedUnits = detail?.calculation.summary.assignedUnits ?? 0;
  const totalUnits = detail?.calculation.summary.unitCount ?? 0;
  const shippingUnits = detail?.calculation.summary.shippingUnits ?? 0;
  const remainingUnits = Math.max(0, shippingUnits - assignedUnits);

  if (loading) return <p className="muted cost-loading">Carregando acompanhamento…</p>;
  if (!detail) return <><Link className="cost-back" href="/packages"><ArrowLeft size={16}/>Pacotes e custos</Link>{error && <p className="error" role="alert">{error}</p>}<EmptyState icon={Package} title="Acompanhamento indisponível" description="Ele pode não existir ou você pode não ter acesso a este grupo." /></>;

  const presentation = packageCostPresentation(detail);
  const nextAction = presentation.nextAction;

  function openNextAction() {
    if (!nextAction) return;
    if (nextAction.target === "close-costs") { setCloseConfirm(true); return; }
    setOpenSections(current => ({ ...current, [nextAction.section]: true }));
    if (nextAction.packageId) setExpandedPackages(current => ({ ...current, [nextAction.packageId!]: true }));
    focusTarget.current = nextAction.target;
    setFocusRequestId(current => current + 1);
  }

  async function saveAllocations(packageId: string, draft: Record<string, number>) {
    if (!detail) return;
    const allocations = detail.packages.flatMap(pkg => detail.items.flatMap(item => {
      const savedQuantity = pkg.items.find(row => row.costItemId === item.id)?.quantity ?? 0;
      const quantity = pkg.id === packageId ? draft[item.id] ?? 0 : savedQuantity;
      return quantity > 0 ? [{ packageId: pkg.id, costItemId: item.id, quantity }] : [];
    }));
    const invalid = detail.items.some(item => allocations.filter(row => row.costItemId === item.id).reduce((sum, row) => sum + row.quantity, 0) > (item.calculation?.shippingQuantity ?? item.original.quantity));
    if (invalid) { toast.error("A soma das unidades dos pacotes não pode superar as unidades disponíveis para envio."); return false; }
    const rest = { input: { expectedRevision: detail.tracking.revision, allocations } };
    return mutate("package.allocations", rest, true);
  }

  async function saveProductMethod(method: string) {
    if (!detail?.productsCharge) return;
    const selected = method === "" ? null : method as "pix" | "card";
    const fee = selected === "pix" ? detail.settings.pixBps : selected === "card" ? detail.settings.cardBps : null;
    await mutate("charge.save", { chargeId: detail.productsCharge.id, input: { expectedRevision: detail.tracking.revision, chargeType: "products", paymentMethod: selected, ...(fee === null ? {} : { feeBps: fee }) } }, true);
  }

  async function markPaid(chargeId: string) {
    await mutate("charge.paid", { chargeId, input: { expectedRevision: detail!.tracking.revision } });
  }

  async function savePackage(pkg: DetailPackage, name: string, logisticsStatus: string) {
    if (!detail) return false;
    const ok = await mutate("package.save", { packageId: pkg.id, input: { expectedRevision: detail.tracking.revision, name, logisticsStatus } });
    if (ok) toast.success("Pacote atualizado");
    return ok;
  }

  async function startCreatePackage() {
    if (!detail) return;
    const name = `Pacote ${detail.packages.length + 1}`;
    const ok = await mutate("package.create", { input: { expectedRevision: detail.tracking.revision, name } });
    if (ok) toast.success(`${name} criado`);
  }

  async function closeTracking() {
    if (!detail) return;
    const ok = await mutate("tracking.close", { input: { expectedRevision: detail.tracking.revision, confirmed: true } });
    if (ok) { setCloseConfirm(false); toast.success("Acompanhamento encerrado"); }
  }

  async function reopenTracking(event: React.FormEvent) {
    event.preventDefault();
    if (!detail) return;
    const ok = await mutate("tracking.reopen", { input: { expectedRevision: detail.tracking.revision, confirmed: true, reason: reopenReason } });
    if (ok) { setReopenOpen(false); setReopenReason(""); toast.success("Acompanhamento reaberto"); }
  }

  const products = detail.calculation.productsCharge;
  const productsCharge = detail.productsCharge;
  const productsRate = products.feeCents === null ? null : products.feeCents;
  const productsPaid = productsCharge?.paymentStatus === "paid";
  const lastEdited = detail.tracking.updatedAt ? new Date(detail.tracking.updatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
  const updatedByName = detail.members.find(person => person.id === detail.tracking.updatedBy)?.name ?? "membro";
  const finalizedDate = detail.purchase.finalizedAt ? new Date(detail.purchase.finalizedAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

  return <>
    <Link className="cost-back" href="/packages"><ArrowLeft size={16}/>Pacotes e custos</Link>
    <div className="page-heading cost-detail-heading">
      <div className="cost-detail-title">
        <h1>{detail.purchase.name}</h1>
        <div className="cost-detail-facts">
          <span className="cost-detail-fact"><CalendarDays size={13} aria-hidden="true"/><span>Finalizada em {finalizedDate}</span></span>
          <span className="cost-detail-fact-separator" aria-hidden="true">·</span>
          <span className="cost-detail-fact"><Package size={13} aria-hidden="true"/><span>{unitsLabel(totalUnits)} compradas{detail.calculation.summary.cancelledUnits ? ` · ${detail.calculation.summary.cancelledUnits} canceladas` : ""}</span></span>
        </div>
        <div className="cost-detail-meta">
          {detail.purchase.hubbuyAccount && <p className="cost-account"><span className="cost-account-label">Conta HubBuy:</span>{" "}<strong>{detail.purchase.hubbuyAccount}</strong></p>}
          {detail.purchase.hubbuyAccount && lastEdited && <span className="cost-detail-meta-separator" aria-hidden="true">·</span>}
          <p className="cost-last-edited muted"><UserRound size={13} aria-hidden="true"/><span>Atualizado por <strong>{updatedByName}</strong>{lastEdited && <> · <time dateTime={new Date(detail.tracking.updatedAt).toISOString()}>{lastEdited}</time></>}</span></p>
        </div>
      </div>
      <div className="cost-heading-actions"><QcImportPanel purchaseId={detail.purchase.id} targets={detail.items.map(item => ({ id: item.original.id, name: item.original.name, variant: item.original.variant, quantity: item.original.quantity }))}/><span className="cost-status">Compra finalizada</span><span className={`cost-status ${locked ? "closed" : "open"}`}>{locked ? <><LockKeyhole size={13}/> Custos encerrados</> : "Custos abertos"}</span>{locked && <Button aria-label="Reabrir acompanhamento" variant="outline" onClick={() => setReopenOpen(true)}><RotateCcw size={16}/><span className="desktop-label">Reabrir</span></Button>}</div>
    </div>

    <div className="cost-summary-card">
      <div className="cost-summary-total"><div><span>Custo líquido atual</span><span className="cost-summary-status" role="status">{presentation.isPartial ? "Parcial" : "Final"}</span></div><strong>{presentation.hasKnownAmount ? formatMoney(presentation.totalCents) : "Falta informar"}</strong></div>
      {nextAction && <div className="cost-next-action"><span>Próxima tarefa</span><Button variant={nextAction.target === "close-costs" ? "default" : "outline"} data-cost-target="next-action" onClick={openNextAction}>{nextAction.label}</Button></div>}
    </div>

    <ProgressiveSection id="products" title="Produtos e pagamento" summary={presentation.productsSummary} open={openSections.products} onToggle={() => setOpenSections(current => ({ ...current, products: !current.products }))}>
    <div className="cost-section-content" aria-labelledby="product-payment-title">
      <div className="cost-product-payment">
        <div className="cost-product-payment-heading"><span className="cost-product-payment-icon" aria-hidden="true"><CircleDollarSign size={24}/></span><div><h2 id="product-payment-title">Pagamento dos produtos</h2><p className="muted">Uma cobrança para o preço efetivo e o frete China de toda a compra.</p></div></div>
        {products.baseCents === null && <p className="cost-payment-requirement">Para configurar e confirmar esta cobrança, informe os campos pendentes: {detail.items.flatMap(item => [item.effectivePriceState === "pending" ? `${item.original.name} · preço efetivo` : null, item.chinaFreightState === "pending" ? `${item.original.name} · frete China` : null].filter((value): value is string => value !== null)).join("; ") || "a composição dos produtos"}.</p>}
        <div className="cost-product-payment-summary" role="group" aria-label="Resumo da cobrança dos produtos">
          <div className="cost-product-payment-metric"><span className="cost-detail-label">Pagamento original · base</span><strong>{money(products.baseCents)}</strong></div>
          <div className="cost-product-payment-metric"><span className="cost-detail-label">Taxa {productsCharge?.feeBps === null || productsCharge?.feeBps === undefined ? "pendente" : `${percentFromBasisPoints(productsCharge.feeBps)}%`}</span><strong>{money(productsRate)}</strong></div>
          <div className="cost-product-payment-metric total"><span className="cost-detail-label">{productsPaid ? "Total pago" : "Total a pagar"}</span><div className="cost-product-payment-total"><strong>{money(products.totalCents)}</strong><span className={`cost-products-payment-status ${productsPaid ? "paid" : "pending"}`} role="status" aria-label={productsPaid ? "Pagamento pago" : "Pagamento a pagar"}>{productsPaid ? <CircleCheck size={13} aria-hidden="true"/> : <Clock3 size={13} aria-hidden="true"/>}{productsPaid ? "Pago" : "A pagar"}</span></div></div>
          <div className="cost-product-payment-metric"><span className="cost-detail-label">Custo líquido atual</span><div className="cost-product-payment-total"><strong>{formatMoney(detail.calculation.summary.totalCents ?? detail.calculation.summary.partialCents)}</strong>{detail.calculation.summary.totalCents === null && <span className="cost-products-payment-status pending"><Clock3 size={13} aria-hidden="true"/>Parcial</span>}</div></div>
        </div>
        <div className="cost-product-payment-settings">
        <div className="cost-product-payment-metric cost-product-payment-gross"><span className="cost-detail-label">Custo bruto conhecido</span><strong>{formatMoney(detail.calculation.summary.grossPartialCents)}</strong></div>
        <div className={`cost-product-payment-controls ${locked ? "locked" : ""}`} role="group" aria-label="Ações do pagamento dos produtos">
          <label>Método<select data-cost-target="products-method" disabled={!!locked || busy || products.baseCents === null} value={productsCharge?.paymentMethod ?? ""} onChange={event => void saveProductMethod(event.target.value)}><option value="">Escolher método</option><option value="pix">Pix · padrão {percentFromBasisPoints(detail.settings.pixBps)}%</option><option value="card">Cartão · padrão {percentFromBasisPoints(detail.settings.cardBps)}%</option></select></label>
          {!locked && productsCharge && <Button className="cost-payment-edit" variant="outline" disabled={busy || products.baseCents === null} onClick={() => setChargeEditor({ id: productsCharge.id, type: "products", name: "Pagamento dos produtos" })}>Editar taxa</Button>}
          {!locked && productsCharge?.paymentStatus === "pending" && <Button className="cost-payment-confirm" data-cost-target="products-paid" disabled={busy || products.totalCents === null || (products.baseCents ?? 0) > 0 && !productsCharge.paymentMethod} onClick={() => void markPaid(productsCharge.id)}>Marcar como pago</Button>}
          {productsPaid && <span className="cost-payment-readonly" role="status"><CircleCheck size={14} aria-hidden="true"/>Pagamento confirmado</span>}
        </div>
        </div>
        <p className="muted cost-hint">O percentual fica registrado nesta cobrança mesmo se o padrão do grupo mudar.</p>
        {detail.calculation.summary.receivedRefundCents > 0 && <p className="cost-product-payment-credit" role="status"><span>Crédito recebido</span><strong>{formatMoney(detail.calculation.summary.receivedRefundCents)}</strong></p>}
      </div>
    </div>
    {shippingUnits > 0 && <div className="cost-section-content" aria-labelledby="items-title">
      <div className="cost-section-heading"><div><h2 id="items-title">Custos por produto</h2><p className="muted">Valores unitários de preço e frete China; os demais encargos são rateados pelas unidades.</p></div><div className="cost-products-total"><span>{detail.calculation.summary.totalCents === null ? "Total parcial" : "Total final"}</span><strong>{detail.calculation.summary.hasKnownAmount ? formatMoney(detail.calculation.summary.totalCents ?? detail.calculation.summary.partialCents) : "Falta informar"}</strong></div></div>
      <ProductCostsList detail={detail} locked={!!locked} onDetails={setItemDetailId} onEdit={item => setItemEditor({ id: item.id, name: item.original.name })} onRefund={setRefundItemId}/>
    </div>}
    <RefundsSection key={refundItemId ?? "closed"} detail={detail} locked={!!locked} busy={busy} requestItemId={refundItemId} onRequestClose={() => setRefundItemId(null)} onDetails={setItemDetailId} mutate={mutate}/>
    </ProgressiveSection>

    <ProgressiveSection id="packages" title="Pacotes" summary={presentation.packagesSummary} open={openSections.packages} onToggle={() => setOpenSections(current => ({ ...current, packages: !current.packages }))}>
    <div className="cost-section-content" aria-labelledby="cost-section-packages-title">
      <div className="cost-section-heading"><div><p className="muted">Unidades enviáveis atribuídas: {assignedUnits} de {shippingUnits}{remainingUnits ? ` · ${remainingUnits} sem pacote` : " · Tudo atribuído"}</p></div>{!locked && <Button data-cost-target="package-create" variant="outline" onClick={() => void startCreatePackage()} disabled={busy}><Plus size={16}/>Novo pacote</Button>}</div>
      {!detail.packages.length ? <EmptyState icon={Package} title="Adicione um pacote" description="Separe os produtos como chegam em cada envio."/> : <div className="cost-package-list">{detail.packages.map(pkg => <PackageCard key={pkg.id} pkg={pkg} detail={detail} expanded={!!expandedPackages[pkg.id]} onExpandedChange={open => setExpandedPackages(current => ({ ...current, [pkg.id]: open }))} locked={!!locked} busy={busy} savePackage={savePackage} saveAllocations={draft => saveAllocations(pkg.id, draft)} openCharge={charge => setChargeEditor(charge)} markPaid={markPaid} mutate={mutate}/>)}</div>}
    </div>
    </ProgressiveSection>

    <ProgressiveSection id="people" title="Divisão por pessoa" summary={presentation.peopleSummary} open={openSections.people} onToggle={() => setOpenSections(current => ({ ...current, people: !current.people }))}>
    <div className="cost-section-content" aria-labelledby="cost-section-people-title">
      <div className="cost-section-heading"><div><p className="muted">Parcelas dos produtos compartilhados e seus encargos.</p></div></div>
      {detail.calculation.summary.undistributedCents > 0 && <p className="cost-undistributed" role="status">Há {formatMoney(detail.calculation.summary.undistributedCents)} em valores conhecidos sem divisão definida. Os totais pessoais exibem apenas as parcelas que já podem ser calculadas.</p>}
      <ul className="cost-people-list">{detail.memberTotals.map(person => <li key={person.personId}><Avatar name={person.name}/><span><strong>{person.name}</strong><small>{person.personalUnits} {person.personalUnits === 1 ? "unidade enviável pessoal" : "unidades enviáveis pessoais"}{person.sharedItems ? ` · ${person.sharedItems} ${person.sharedItems === 1 ? "item compartilhado" : "itens compartilhados"}` : ""} · Crédito recebido: {formatMoney(person.receivedRefundCents)}{person.requestedRefundCents ? ` · A receber ${formatMoney(person.requestedRefundCents)}` : ""}</small></span><strong>{person.pending ? person.hasKnownAmount ? `Parcial ${formatMoney(person.totalCents)}` : "Falta informar" : formatMoney(person.totalCents)}</strong></li>)}</ul>
    </div>
    </ProgressiveSection>

    {itemEditor && <ItemCostSurface key={itemEditor.id} detail={detail} editor={itemEditor} busy={busy} onClose={() => setItemEditor(null)} onSave={async input => { const ok = await mutate("item.save", { input }, true); if (ok) { setItemEditor(null); toast.success("Custos do produto atualizados"); } }} />}
    {itemDetailId && <ItemBreakdownSurface detail={detail} itemId={itemDetailId} onClose={() => setItemDetailId(null)} />}
    {chargeEditor && <ChargeSurface key={chargeEditor.id} detail={detail} editor={chargeEditor} busy={busy} onClose={() => setChargeEditor(null)} onSave={async input => { const ok = await mutate("charge.save", { chargeId: chargeEditor.id, input }, true); if (ok) { setChargeEditor(null); toast.success("Cobrança atualizada"); } }} />}
    <Confirm open={closeConfirm} title="Encerrar acompanhamento?" description="Os custos ficarão somente para leitura. Você poderá reabrir depois informando o motivo." label="Encerrar custos" busy={busy} onOpenChange={setCloseConfirm} onConfirm={() => void closeTracking()} />
    <Surface open={reopenOpen} mobileFullScreen onOpenChange={value => { if (!busy) setReopenOpen(value); }} title="Reabrir acompanhamento" description="Informe por que os custos precisam de ajustes. A reabertura fica registrada no histórico."><form onSubmit={event => void reopenTracking(event)}><label>Motivo<textarea required maxLength={1000} rows={3} value={reopenReason} onChange={event => setReopenReason(event.target.value)} /></label><div className="form-actions"><Button type="button" variant="outline" onClick={() => setReopenOpen(false)} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy || !reopenReason.trim()}>{busy ? "Reabrindo…" : "Confirmar reabertura"}</Button></div></form></Surface>
    <Confirm open={!!resetConfirm} title="Voltar pagamento para pendente?" description="A edição altera o valor desta cobrança. Será preciso confirmar novamente o pagamento depois de salvar." label="Salvar e invalidar pagamento" danger busy={busy} onOpenChange={value => { if (!value && !busy) setResetConfirm(null); }} onConfirm={() => void confirmReset()} />
  </>;
}

function ProgressiveSection({ id, title, summary, open, onToggle, children }: { id: CostSectionKey; title: string; summary: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  const panelId = `cost-section-${id}-content`;
  return <section className={`cost-section cost-progressive ${open ? "expanded" : ""}`} aria-labelledby={`cost-section-${id}-title`}>
    <button className="cost-progressive-toggle" type="button" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
      <span><strong id={`cost-section-${id}-title`}>{title}</strong><small>{summary}</small></span>
      <ChevronDown className={open ? "expanded" : ""} size={19}/>
    </button>
    <div className="cost-progressive-body" id={panelId} hidden={!open}>{open && children}</div>
  </section>;
}

function displayedValue(state: string, cents: number | null | undefined) {
  if (state === "no_charge") return "Sem cobrança";
  if (state !== "known" || cents === null || cents === undefined) return "Falta informar";
  return formatMoney(cents);
}

function pendingDetails(item: DetailItem) {
  return item.calculation?.pendingComponents ?? [];
}

function ProductCostsList({ detail, locked, onDetails, onEdit, onRefund }: { detail: Detail; locked: boolean; onDetails: (itemId: string) => void; onEdit: (item: DetailItem) => void; onRefund: (itemId: string) => void }) {
  const qcCovers = useQcCostCovers(detail.purchase.id, detail.items.map(item => item.original.id));
  const operationalItems = detail.items.filter(item => (item.calculation?.shippingQuantity ?? item.original.quantity) > 0);
  return <>
    {!!operationalItems.length && <>
    <div className="cost-table-wrap">
      <table className="cost-table"><thead><tr><th>Produto</th><th>Qtd.</th><th>Preço efetivo / un.</th><th>Frete China / un.</th><th>Taxa de pagamento</th><th>Frete Brasil</th><th>Receita</th><th>Total</th><th>Ações</th></tr></thead><tbody>
        {operationalItems.map(item => <tr key={item.id}>
          <td data-label="Produto"><div className="cost-product-name"><QcCostCover purchaseId={detail.purchase.id} itemName={item.original.name} visualKey={item.original.visualKey} cover={qcCovers[item.original.id]}/><span><strong>{item.original.name}</strong><small>{item.original.variant || "Sem variação"}</small>{item.participants.length > 0 && <small className="cost-product-participants"><UsersRound size={12} aria-hidden="true"/><span>{item.participants.map(person => person.name).join(" · ")}</span></small>}<small className="cost-cell-pending">{item.calculation?.cancelledQuantity ? productUnitsSummary(item) : ""}</small></span></div></td>
          <td data-label="Quantidade"><span className="cost-quantity"><Hash size={12} aria-hidden="true"/>{item.original.quantity}</span></td>
          <td className={item.effectivePriceState === "pending" ? "cost-value-pending" : undefined} data-label="Preço efetivo / un.">{displayedValue(item.effectivePriceState, item.effectivePriceUnitCents)}</td>
          <td className={item.chinaFreightState === "pending" ? "cost-value-pending" : undefined} data-label="Frete China / un.">{displayedValue(item.chinaFreightState, item.chinaFreightUnitCents)}</td>
          <td className={sumComponents(item, "Taxa") === null ? "cost-value-pending" : undefined} data-label="Taxa de pagamento">{money(sumComponents(item, "Taxa"))}</td>
          <td className={sumComponents(item, "Frete Brasil") === null ? "cost-value-pending" : undefined} data-label="Frete Brasil">{money(sumComponents(item, "Frete Brasil"))}</td>
          <td className={sumComponents(item, "Receita") === null ? "cost-value-pending" : undefined} data-label="Receita">{money(sumComponents(item, "Receita"))}</td>
          <td data-label="Total"><ProductCostTotal item={item} onDetails={onDetails}/></td>
          <td data-label="Ações">{!locked && <ProductCostActions item={item} allowRefund={detail.productsCharge?.paymentStatus === "paid"} refundDisabled={item.effectivePriceState === "pending" || item.chinaFreightState === "pending" || item.participants.every(person => person.weight === 0)} onEdit={onEdit} onRefund={onRefund}/>}</td>
        </tr>)}
      </tbody></table>
    </div>
    <div className="cost-product-mobile-list" aria-label="Custos por produto">
      {operationalItems.map(item => {
        const pending = pendingDetails(item);
        return <article className="cost-product-mobile-card" key={item.id}>
          <div className="cost-product-mobile-title"><QcCostCover purchaseId={detail.purchase.id} itemName={item.original.name} visualKey={item.original.visualKey} cover={qcCovers[item.original.id]}/><span><strong>{item.original.name}</strong><small>{item.original.variant || "Sem variação"}</small>{item.calculation?.cancelledQuantity ? <small>{productUnitsSummary(item)}</small> : null}{item.participants.length > 0 && <small className="cost-product-participants"><UsersRound size={12} aria-hidden="true"/><span>{item.participants.map(person => person.name).join(" · ")}</span></small>}</span></div>
          <dl className="cost-product-mobile-values">
            <div><dt>Quantidade</dt><dd>{unitsLabel(item.original.quantity)}</dd></div>
            <div><dt>Preço efetivo / un.</dt><dd>{displayedValue(item.effectivePriceState, item.effectivePriceUnitCents)}</dd></div>
            <div><dt>Frete China / un.</dt><dd>{displayedValue(item.chinaFreightState, item.chinaFreightUnitCents)}</dd></div>
          </dl>
          {pending.length > 0 && <p className="cost-mobile-pending">Falta informar: {pending.join(", ")}</p>}
          <div className="cost-product-mobile-footer"><ProductCostTotal item={item} onDetails={onDetails} showFinalLabel/>{!locked && <ProductCostActions item={item} allowRefund={detail.productsCharge?.paymentStatus === "paid"} onEdit={onEdit} onRefund={onRefund}/>}</div>
        </article>;
      })}
    </div>
    </>}
    <section className="qc-cost-list" aria-label="Controle de qualidade por produto"><h3>Controle de qualidade</h3><p className="muted">Fotos permanecem associadas à ocorrência comprada, mesmo após reembolso ou divisão em pacotes.</p><div>{detail.items.map(item => <div className="qc-cost-row" key={item.id}><span>{item.original.name}{item.original.variant ? ` · ${item.original.variant}` : ""}</span><QcGalleryButton purchaseId={detail.purchase.id} itemId={item.original.id} itemName={item.original.name} canManageHere/></div>)}</div></section>
  </>;
}

function ProductCostTotal({ item, onDetails, showFinalLabel = false }: { item: DetailItem; onDetails: (itemId: string) => void; showFinalLabel?: boolean }) {
  return <div className="cost-line-total" aria-label={item.calculation?.totalCents === null ? "Total parcial" : "Total final"}>
    {item.calculation?.totalCents === null ? <span className="cost-total-status">Parcial</span> : showFinalLabel && <span className="cost-total-label">Total final</span>}
    <strong>{calculatedTotal(item.calculation?.totalCents, item.calculation?.partialCents, item.calculation?.hasKnownAmount)}</strong>
    <Button className="cost-composition-link" variant="ghost" size="sm" onClick={() => onDetails(item.id)}>Ver composição<ArrowRight size={14} aria-hidden="true"/></Button>
  </div>;
}

function ProductCostActions({ item, allowRefund, refundDisabled = false, onEdit, onRefund }: { item: DetailItem; allowRefund: boolean; refundDisabled?: boolean; onEdit: (item: DetailItem) => void; onRefund: (itemId: string) => void }) {
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const refundSelected = useRef(false);
  return <div className="cost-row-actions">
    <Button data-cost-target={`item-cost-${item.id}`} variant="outline" size="sm" onClick={() => onEdit(item)}><Pencil size={14} aria-hidden="true"/>Editar</Button>
    {allowRefund && <DropdownMenu.Root><DropdownMenu.Trigger asChild><Button ref={menuTrigger} className="cost-row-overflow" variant="outline" size="icon" aria-label={`Mais ações para ${item.original.name}`}><MoreVertical size={18} aria-hidden="true"/></Button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="dropdown cost-product-menu" align="end" sideOffset={8} onCloseAutoFocus={event => {
      if (!refundSelected.current) return;
      // Open the sheet after the menu releases focus, and retain its trigger for return focus.
      event.preventDefault();
      refundSelected.current = false;
      menuTrigger.current?.focus();
      onRefund(item.id);
    }}><DropdownMenu.Item disabled={refundDisabled} onSelect={() => { refundSelected.current = true; }}>Registrar reembolso</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>}
  </div>;
}

function ItemBreakdownSurface({ detail, itemId, onClose }: { detail: Detail; itemId: string; onClose: () => void }) {
  const item = detail.items.find(value => value.id === itemId);
  if (!item) return null;
  const calculation = item.calculation;
  return <Surface sheet open title="Composição dos custos" subtitle={item.original.name} description="Valores originais, encargos, créditos recebidos e divisão atual desta linha." onOpenChange={open => { if (!open) onClose(); }}>
    <div className="cost-breakdown-list">
      <h3>Unidades e valor líquido</h3>
      <div><span>Unidades compradas</span><strong>{item.original.quantity}</strong></div>
      <div><span>Unidades canceladas</span><strong>{calculation?.cancelledQuantity ?? 0}</strong></div>
      <div><span>Unidades enviáveis</span><strong>{calculation?.shippingQuantity ?? item.original.quantity}</strong></div>
      <div><span>Custo bruto conhecido</span><strong>{money(calculation?.grossPartialCents)}</strong></div>
      <div><span>Reembolso recebido</span><strong>{money(calculation?.receivedRefundCents)}</strong></div>
      <div><span>A receber</span><strong>{money(calculation?.requestedRefundCents)}</strong></div>
      <div className="cost-breakdown-total"><span>Custo líquido atual</span><strong>{money(calculation?.partialCents)}</strong></div>
      <h3>Valores por componente</h3>
      {calculation?.components.map(component => <div key={component.name}><span>{component.name}</span><strong>{money(component.amountCents)}</strong></div>)}
      <div className="cost-breakdown-total"><span>{calculation?.totalCents === null ? "Total parcial" : "Total final"}</span><strong>{calculatedTotal(calculation?.totalCents, calculation?.partialCents, calculation?.hasKnownAmount)}</strong></div>
      {calculation?.pendingComponents.length ? <p className="cost-mobile-pending">Falta informar: {calculation.pendingComponents.join(", ")}</p> : null}
      {calculation && calculation.undistributedCents > 0 && <p className="cost-undistributed">Há {formatMoney(calculation.undistributedCents)} em valores conhecidos sem proporção suficiente para dividir.</p>}
      <h3>Divisão por pessoa</h3>
      {item.participants.map(participant => <div key={participant.personId}><span>{participant.name}</span><strong>{participant.shareCents === null ? participant.partialShareCents === null ? "Parcela não determinável" : `Parcial ${formatMoney(participant.partialShareCents)}` : formatMoney(participant.shareCents)}</strong></div>)}
    </div>
  </Surface>;
}

function PackageCard({ pkg, detail, expanded, onExpandedChange, locked, busy, savePackage, saveAllocations, openCharge, markPaid, mutate }: {
  pkg: DetailPackage; detail: Detail; expanded: boolean; onExpandedChange: (open: boolean) => void; locked: boolean; busy: boolean;
  savePackage: (pkg: DetailPackage, name: string, logisticsStatus: string) => Promise<boolean>; saveAllocations: (draft: Record<string, number>) => Promise<boolean | undefined>;
  openCharge: (charge: ChargeEditor) => void; markPaid: (chargeId: string) => Promise<void>;
  mutate: (operation: string, rest: Record<string, unknown>, mayInvalidatePayment?: boolean) => Promise<boolean>;
}) {
  const [packageEditorOpen, setPackageEditorOpen] = useState(false), [allocationEditorOpen, setAllocationEditorOpen] = useState(false), [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [name, setName] = useState(pkg.name), [logistics, setLogistics] = useState(pkg.logisticsStatus);
  const [allocationDraft, setAllocationDraft] = useState<Record<string, number>>({});
  const freight = pkg.brazilFreightCharge, customs = pkg.customsCharge;
  const assigned = pkg.calculation?.unitCount ?? 0;
  const pendingText = [
    freight?.valueState === "pending" ? "Frete Brasil: valor pendente" : null,
    freight?.valueState === "known" && freight.paymentStatus === "pending" ? "Frete Brasil: pagamento pendente" : null,
    customs?.valueState === "pending" ? "Receita: valor pendente" : null,
    customs?.valueState === "known" && customs.paymentStatus === "pending" ? "Receita: pagamento pendente" : null,
  ].filter((value): value is string => value !== null);
  const headingId = `cost-package-${pkg.id}-content`;

  function editPackage() {
    setName(pkg.name);
    setLogistics(pkg.logisticsStatus);
    setPackageEditorOpen(true);
  }

  function editContent() {
    const next: Record<string, number> = {};
    for (const item of detail.items) next[item.id] = pkg.items.find(row => row.costItemId === item.id)?.quantity ?? 0;
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

  function updateAllocation(itemId: string, maximum: number, value: string) {
    setAllocationDraft(current => ({ ...current, [itemId]: Math.min(maximum, Math.max(0, Number(value) || 0)) }));
  }

  const chargeMethod = (charge: NonNullable<typeof freight>) => charge.paymentMethod === "pix" ? "Pix" : charge.paymentMethod === "card" ? "Cartão" : null;
  const packageFreight = pkg.calculation?.freightPaymentTotalCents;
  const packageCustoms = pkg.calculation?.customsPaymentTotalCents;
  const canDeleteEmptyPackage = !assigned && pkg.logisticsStatus === "preparing" && freight?.valueState === "pending" && customs?.valueState === "pending";
  async function deleteEmptyPackage() {
    const ok = await mutate("package.delete", { packageId: pkg.id, input: { expectedRevision: detail.tracking.revision } });
    if (ok) setRemoveConfirmOpen(false);
  }
  return <article className="cost-package">
    <button className="cost-package-toggle" type="button" aria-expanded={expanded} aria-controls={headingId} onClick={() => onExpandedChange(!expanded)}>
      <span className="cost-package-icon"><Package size={20}/></span>
      <span className="cost-package-title"><strong>{pkg.name}</strong><small>{unitsLabel(assigned)} · {logisticName(pkg.logisticsStatus)} · {pendingText.join(" · ") || "Custos resolvidos"}</small></span>
      <span className="cost-package-summary"><span>Frete a pagar {money(packageFreight)}</span><span>Receita {money(packageCustoms)}</span></span>
      <ChevronDown className={expanded ? "expanded" : ""} size={18}/>
    </button>
    <div className="cost-package-content" id={headingId} hidden={!expanded}>
      {expanded && <div className="cost-package-body">
        <div className="cost-package-overview"><div><small>Etapa logística</small><strong>{logisticName(pkg.logisticsStatus)}</strong></div><div><small>Unidades neste pacote</small><strong>{unitsLabel(assigned)}</strong></div></div>
        <div className="cost-package-items"><div className="cost-allocation-head"><strong>Conteúdo</strong><span>{unitsLabel(assigned)}</span></div>{pkg.items.length ? <ul>{pkg.items.map(row => {
          const item = detail.items.find(value => value.id === row.costItemId);
          if (!item) return null;
          const people = item.participants.map(person => person.name).join(" · ");
          return <li key={row.costItemId}><span><strong>{item.original.name}</strong><small>{item.original.variant || "Sem variação"}{people ? ` · ${people}` : ""}</small></span><strong>{unitsLabel(row.quantity)}</strong></li>;
        })}</ul> : <p className="muted">Nenhuma unidade neste pacote.</p>}</div>
        <div className="cost-package-charges">
          <ChargeSummary label="Frete Brasil" target={`package-freight-${pkg.id}`} paidTarget={`package-freight-paid-${pkg.id}`} charge={freight} base={pkg.calculation?.freight.base} fee={pkg.calculation?.freight.fee} total={packageFreight} feeBps={freight?.feeBps ?? null} method={freight ? chargeMethod(freight) : null} showFee onEdit={() => freight && openCharge({ id: freight.id, type: "brazil_freight", name: `${pkg.name} · Frete Brasil` })} onPaid={() => freight && void markPaid(freight.id)} locked={locked} busy={busy}/>
          <ChargeSummary label="Receita" target={`package-customs-${pkg.id}`} paidTarget={`package-customs-paid-${pkg.id}`} charge={customs} base={pkg.calculation?.customs.base} fee={0} total={packageCustoms} feeBps={null} method={null} onEdit={() => customs && openCharge({ id: customs.id, type: "customs", name: `${pkg.name} · Receita` })} onPaid={() => customs && void markPaid(customs.id)} locked={locked} busy={busy}/>
        </div>
        {!locked && <div className="cost-package-actions"><DropdownMenu.Root><DropdownMenu.Trigger asChild><Button variant="outline" size="sm" aria-label={`Ações para ${pkg.name}`} disabled={busy}><MoreVertical size={16}/><span>Ações do pacote</span></Button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="dropdown" align="end" sideOffset={6}><DropdownMenu.Item onSelect={editPackage}><Pencil size={15}/>Editar pacote</DropdownMenu.Item><DropdownMenu.Item onSelect={editContent}><Package size={15}/>Editar conteúdo</DropdownMenu.Item>{canDeleteEmptyPackage && <><DropdownMenu.Separator/><DropdownMenu.Item className="danger-text" onSelect={() => setRemoveConfirmOpen(true)}><Trash2 size={15}/>Excluir pacote vazio</DropdownMenu.Item></>}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></div>}
      </div>}
    </div>
    <Surface sheet open={packageEditorOpen} title="Editar pacote" subtitle={pkg.name} description="Atualize o nome e a etapa logística. A etapa não altera os valores financeiros." onOpenChange={value => { if (!busy) setPackageEditorOpen(value); }}>
      <form onSubmit={event => void savePackageForm(event)}>
        <label>Nome do pacote<input required maxLength={80} value={name} onChange={event => setName(event.target.value)}/></label>
        <label>Etapa logística<select value={logistics} onChange={event => setLogistics(event.target.value as typeof logistics)}><option value="preparing">Em preparação</option><option value="sent">Enviado</option><option value="received">Recebido</option></select></label>
        <div className="form-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => setPackageEditorOpen(false)}>Cancelar</Button><Button type="submit" disabled={busy || !name.trim()}>{busy ? "Salvando…" : "Salvar pacote"}</Button></div>
      </form>
    </Surface>
    <Surface sheet open={allocationEditorOpen} title="Editar conteúdo" subtitle={pkg.name} description="Distribua as unidades físicas. O restante continua disponível nos outros pacotes." onOpenChange={value => { if (!busy) setAllocationEditorOpen(value); }}>
      <form onSubmit={event => void saveContent(event)}>
        <div className="cost-allocation-edit-list">{detail.items.map(item => {
          const inOtherPackages = detail.packages.filter(other => other.id !== pkg.id).reduce((sum, other) => sum + (other.items.find(row => row.costItemId === item.id)?.quantity ?? 0), 0);
          const shippingQuantity = item.calculation?.shippingQuantity ?? item.original.quantity;
          const maximum = Math.max(0, shippingQuantity - inOtherPackages);
          const saved = pkg.items.find(row => row.costItemId === item.id)?.quantity ?? 0;
          const quantity = allocationDraft[item.id] ?? saved;
          return <div className="cost-allocation-edit-row" key={item.id}><span><strong>{item.original.name}</strong><small>{item.original.variant || "Sem variação"} · Unidades compradas: {item.original.quantity} · Unidades canceladas: {item.calculation?.cancelledQuantity ?? 0} · Neste pacote: {saved} · Em outros: {inOtherPackages} · Disponíveis: {maximum - quantity}</small></span><label>Unidades neste pacote<input aria-label={`${item.original.name} neste pacote`} type="number" min="0" max={maximum} step="1" disabled={busy} value={quantity} onChange={event => updateAllocation(item.id, maximum, event.target.value)}/></label></div>;
        })}</div>
        <Button className="cost-allocate-remaining" type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setAllocationDraft(Object.fromEntries(detail.items.map(item => {
          const used = detail.packages.filter(other => other.id !== pkg.id).reduce((sum, other) => sum + (other.items.find(row => row.costItemId === item.id)?.quantity ?? 0), 0);
          return [item.id, Math.max(0, (item.calculation?.shippingQuantity ?? item.original.quantity) - used)];
        })))}>Incluir unidades disponíveis</Button>
        <div className="form-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => setAllocationEditorOpen(false)}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar conteúdo"}</Button></div>
      </form>
    </Surface>
    <Confirm open={removeConfirmOpen} onOpenChange={value => { if (!busy) setRemoveConfirmOpen(value); }} title="Excluir pacote vazio?" description="Este pacote ainda não contém unidades nem cobranças informadas. A exclusão ficará registrada no acompanhamento." danger label="Excluir pacote" busy={busy} onConfirm={() => void deleteEmptyPackage()} />
  </article>;
}

function ChargeSummary({ label, target, paidTarget, charge, base, fee, total, feeBps, method, showFee = false, onEdit, onPaid, locked, busy }: {
  label: string; target: string; paidTarget: string; charge: DetailPackage["brazilFreightCharge"] | DetailPackage["customsCharge"];
  base: number | null | undefined; fee: number | null | undefined; total: number | null | undefined; feeBps: number | null; method: string | null; showFee?: boolean;
  onEdit: () => void; onPaid: () => void; locked: boolean; busy: boolean;
}) {
  if (!charge) return null;
  const valueIsPaid = charge.paymentStatus === "paid";
  const noCharge = charge.valueState === "no_charge";
  const pending = charge.valueState === "pending" || charge.valueState == null;
  const status = noCharge ? "Sem cobrança" : valueIsPaid ? "Pago" : pending ? "Falta informar" : "A pagar";
  if (pending) return <div className="cost-charge-summary cost-charge-pending">
    <div className="cost-charge-top"><span><strong>{label}</strong><small role="status">Valor não informado</small></span></div>
    {!locked && <div className="cost-charge-bottom"><div><Button data-cost-target={target} size="sm" variant="outline" disabled={busy} onClick={onEdit}>Informar {label}</Button></div></div>}
  </div>;
  return <div className="cost-charge-summary">
    <div className="cost-charge-top"><span><strong>{label}</strong></span>{!noCharge && <small role="status">{status}</small>}</div>
    {noCharge ? <p className="cost-charge-no-charge" role="status">Sem cobrança</p> : <div className="cost-charge-breakdown">
      <div><span>Base</span><strong>{displayedValue(charge.valueState ?? "pending", base ?? null)}</strong></div>
      {showFee && <div><span>Taxa de pagamento{feeBps === null ? "" : ` · ${method ?? "Método pendente"} ${percentFromBasisPoints(feeBps)}%`}</span><strong>{money(fee)}</strong></div>}
      <div className="total"><span>{valueIsPaid ? "Total pago" : "Total a pagar"}</span><strong>{money(total)}</strong></div>
    </div>}
    {!locked && <div className="cost-charge-bottom"><div><Button data-cost-target={target} size="sm" variant="outline" disabled={busy} onClick={onEdit}>Editar {label}</Button>{!noCharge && !valueIsPaid && <Button data-cost-target={paidTarget} size="sm" disabled={busy || total === null || total === undefined} onClick={onPaid}>Marcar como pago</Button>}</div></div>}
  </div>;
}

function ItemCostSurface({ detail, editor, busy, onClose, onSave }: { detail: Detail; editor: ItemEditor; busy: boolean; onClose: () => void; onSave: (input: unknown) => Promise<void> }) {
  const item = detail.items.find(value => value.id === editor.id)!;
  const [priceState, setPriceState] = useState(item.effectivePriceState), [price, setPrice] = useState(amountInput(item.effectivePriceUnitCents));
  const [chinaState, setChinaState] = useState(item.chinaFreightState), [china, setChina] = useState(amountInput(item.chinaFreightUnitCents));
  const mode = item.participants[0]?.weightMode ?? "equal";
  const [compositionMode, setCompositionMode] = useState(mode), [weights, setWeights] = useState<Record<string, string>>(() => Object.fromEntries(item.participants.map(person => [person.personId, String(person.weight)])));
  const priceCents = priceState === "known" ? parseCostCents(price) : priceState === "no_charge" ? 0 : null, chinaCents = chinaState === "known" ? parseCostCents(china) : chinaState === "no_charge" ? 0 : null;
  const compositionChanged = compositionMode !== mode || item.participants.some(person => Number(weights[person.personId]) !== person.weight);
  const percentageValues = item.participants.map(person => Number(weights[person.personId]));
  const percentageInputsValid = item.participants.every((person, index) => weights[person.personId] !== "" && Number.isInteger(percentageValues[index]) && percentageValues[index] >= 0 && percentageValues[index] <= 10_000);
  const percentageTotal = percentageValues.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  const compositionValid = compositionMode === "equal" || (compositionMode === "percentage" ? percentageInputsValid && percentageTotal === 10_000 : item.participants.some(person => Number(weights[person.personId]) > 0));
  const originalProportions = splitByWeights(10_000, item.participants.map(person => ({ personId: person.personId, allocationOrder: person.allocationOrder, weight: person.weight })));

  function changeCompositionMode(value: string) {
    const nextMode = value as typeof compositionMode;
    if (nextMode === "equal") setWeights(Object.fromEntries(item.participants.map(person => [person.personId, "1"])));
    if (nextMode === "fixed" && mode === "fixed") setWeights(Object.fromEntries(item.participants.map(person => [person.personId, String(person.weight)])));
    if (nextMode === "percentage" && compositionMode !== "percentage") {
      const converted = splitByWeights(10_000, item.participants.map(person => ({ personId: person.personId, allocationOrder: person.allocationOrder, weight: Number(weights[person.personId]) || person.weight })));
      if (converted) setWeights(Object.fromEntries(item.participants.map((person, index) => [person.personId, String(converted[index])])))
    }
    setCompositionMode(nextMode);
  }

  const percentageTotalLabel = percentageInputsValid ? `${percentFromBasisPoints(percentageTotal)}%` : "—";

  function updatePercent(personId: string, value: string) {
    const basisPoints = basisPointsFromPercent(value);
    setWeights(current => ({ ...current, [personId]: value === "" ? "" : String(basisPoints ?? value) }));
  }

  const canSave = (priceState !== "known" || priceCents !== null) && (chinaState !== "known" || chinaCents !== null) && compositionValid;
  return <Surface sheet open title="Custos do produto" subtitle={editor.name} description="Preço e frete China são valores por unidade. O histórico da compra permanece intacto." onOpenChange={value => { if (!value && !busy) onClose(); }}>
    <form onSubmit={event => { event.preventDefault(); void onSave({ expectedRevision: detail.tracking.revision, itemId: item.id, effectivePriceState: priceState, effectivePriceUnitCents: priceState === "known" ? priceCents : null, chinaFreightState: chinaState, chinaFreightUnitCents: chinaState === "known" ? chinaCents : null, ...(compositionChanged ? { composition: { mode: compositionMode, participants: item.participants.map(person => ({ personId: person.personId, weight: compositionMode === "equal" ? 1 : Number(weights[person.personId]) || 0 })) } } : {}) }); }}>
      <div className="form-row"><label>Preço efetivo por unidade<select value={priceState} onChange={event => setPriceState(event.target.value as typeof priceState)}><option value="pending">Falta informar</option><option value="known">Informado</option><option value="no_charge">Sem cobrança</option></select></label>{priceState === "known" && <label>Valor em R$<input required inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} placeholder="0,00"/></label>}</div>
      <div className="form-row"><label>Frete China por unidade<select value={chinaState} onChange={event => setChinaState(event.target.value as typeof chinaState)}><option value="pending">Falta informar</option><option value="known">Informado</option><option value="no_charge">Sem cobrança</option></select></label>{chinaState === "known" && <label>Valor em R$<input required inputMode="decimal" value={china} onChange={event => setChina(event.target.value)} placeholder="0,00"/></label>}</div>
      <div className="cost-composition">
        <label>Divisão entre pessoas<select value={compositionMode} onChange={event => changeCompositionMode(event.target.value)}><option value="equal">Divisão igual</option><option value="percentage">Percentuais</option>{mode === "fixed" && <option value="fixed">Proporção original</option>}</select></label>
        {compositionMode === "percentage" && <p className="muted">Distribua os percentuais. A soma precisa fechar em 100%.</p>}
        {compositionMode === "fixed" && <p className="muted">Proporção derivada dos valores fixos originais. Os novos custos seguem esta proporção; os valores em reais não permanecem fixos.</p>}
        {item.participants.map((person, index) => compositionMode === "fixed"
          ? <div className="cost-composition-participant" key={person.personId}><span>{person.name}</span><strong>{originalProportions ? `${percentFromBasisPoints(originalProportions[index])}% · proporção original` : "Proporção não definida"}</strong></div>
          : compositionMode === "equal"
            ? <div className="cost-composition-participant" key={person.personId}><span>{person.name}</span><strong>Divisão igual</strong></div>
            : <label key={person.personId}>{person.name}<span className="cost-composition-input"><input type="text" inputMode="decimal" aria-label={`${person.name} (%)`} value={weights[person.personId] === "" ? "" : Number.isFinite(Number(weights[person.personId])) ? percentFromBasisPoints(Number(weights[person.personId])) : weights[person.personId]} onChange={event => updatePercent(person.personId, event.target.value)}/><small>Percentual</small></span></label>)}
        {compositionMode === "percentage" && <p className={compositionValid ? "cost-percent-total" : "error"} role={compositionValid ? "status" : "alert"}>Percentual distribuído: {percentageTotalLabel}{compositionValid ? " · total fechado" : " · precisa somar 100%"}</p>}
        {compositionMode === "percentage" && !compositionValid && <p className="error" role="alert">Ajuste os percentuais antes de salvar.</p>}
      </div>
      <div className="cost-editor-preview"><span>Quantidade <strong>{item.original.quantity}</strong></span><span>Subtotal efetivo <strong>{priceCents === null ? "Pendente" : formatMoney(priceCents * item.original.quantity)}</strong></span><span>Frete China total <strong>{chinaCents === null ? "Pendente" : formatMoney(chinaCents * item.original.quantity)}</strong></span></div>
      <div className="form-actions"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy || !canSave}>{busy ? "Salvando…" : "Salvar custos"}</Button></div>
    </form>
  </Surface>;
}

function ChargeSurface({ detail, editor, busy, onClose, onSave }: { detail: Detail; editor: ChargeEditor; busy: boolean; onClose: () => void; onSave: (input: unknown) => Promise<void> }) {
  const charge = detail.charges.find(value => value.id === editor.id)!;
  const [state, setState] = useState(charge.valueState ?? "pending"), [amount, setAmount] = useState(amountInput(charge.amountCents));
  const [method, setMethod] = useState(charge.paymentMethod ?? ""), [feePercent, setFeePercent] = useState(charge.feeBps === null ? (charge.paymentMethod === "pix" ? percentInputFromBasisPoints(detail.settings.pixBps) : charge.paymentMethod === "card" ? percentInputFromBasisPoints(detail.settings.cardBps) : "") : percentInputFromBasisPoints(charge.feeBps));
  const amountCents = state === "known" ? parseCostCents(amount) : null;
  const feeBps = feePercent === "" ? null : basisPointsFromPercent(feePercent);
  const base = editor.type === "products" ? detail.calculation.productsCharge.baseCents : state === "no_charge" ? 0 : amountCents;
  const fee = base === null || feeBps === null ? null : Number((BigInt(base) * BigInt(feeBps) + 5_000n) / 10_000n);
  const total = base === null ? null : fee === null && (editor.type === "customs" || base === 0) ? base : fee === null ? null : base + fee;
  const valid = editor.type === "products"
    ? method !== "" && feeBps !== null
    : editor.type === "customs"
      ? state !== "known" || amountCents !== null
      : state !== "known" || amountCents !== null && (amountCents === 0 || method !== "" && feeBps !== null);

  function save(event: React.FormEvent) {
    event.preventDefault();
    const expectedRevision = detail.tracking.revision;
    if (editor.type === "products") {
      void onSave({ expectedRevision, chargeType: "products", paymentMethod: method || null, feeBps: method ? feeBps : null });
    } else if (editor.type === "brazil_freight") {
      void onSave({ expectedRevision, chargeType: editor.type, valueState: state, amountCents: state === "known" ? amountCents : null, paymentMethod: state === "known" ? method || null : null, feeBps: state === "known" && method ? feeBps : null });
    } else {
      void onSave({ expectedRevision, chargeType: editor.type, valueState: state, amountCents: state === "known" ? amountCents : null });
    }
  }

  const chargeLabel = editor.type === "products" ? "pagamento dos produtos" : editor.type === "brazil_freight" ? "frete Brasil" : "Receita";
  const title = editor.type === "products" ? "Editar pagamento" : state === "pending" ? `Informar ${chargeLabel}` : `Editar ${chargeLabel}`;
  const description = editor.type === "customs" ? "Informe o valor da Receita. Ela não tem taxa de transação." : "Confira o valor, a taxa e o método antes de salvar. O pagamento continua manual.";
  return <Surface sheet open title={title} subtitle={editor.name} description={description} onOpenChange={value => { if (!value && !busy) onClose(); }}>
    <form onSubmit={save}>
      {editor.type !== "products" && <label>Estado do valor<select value={state} onChange={event => setState(event.target.value as typeof state)}><option value="pending">Falta informar</option><option value="known">Informado</option><option value="no_charge">Sem cobrança</option></select></label>}
      {editor.type !== "products" && state === "known" && <label>Valor em R$<input required inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0,00"/></label>}
      {editor.type !== "customs" && <div className="form-row"><label>Método de pagamento<select value={method} disabled={editor.type === "brazil_freight" && state !== "known"} onChange={event => { const value = event.target.value; setMethod(value); setFeePercent(value === "pix" ? percentInputFromBasisPoints(detail.settings.pixBps) : value === "card" ? percentInputFromBasisPoints(detail.settings.cardBps) : ""); }}><option value="">Escolher método</option><option value="pix">Pix</option><option value="card">Cartão</option></select></label><label>Taxa (%)<input type="number" min="0" max="100" step="0.01" disabled={!method} value={feePercent} onChange={event => setFeePercent(event.target.value)}/></label></div>}
      <div className="cost-editor-preview"><span>Base <strong>{money(base)}</strong></span>{editor.type !== "customs" && <span>Taxa {feeBps === null ? "pendente" : `${percentFromBasisPoints(feeBps)}%`} <strong>{money(fee)}</strong></span>}<span>Total a pagar <strong>{money(total)}</strong></span></div>
      {editor.type === "customs" && state === "no_charge" && <p className="muted">Sem cobrança resolve esta etapa sem pagamento.</p>}
      <div className="form-actions"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy || !valid}>{busy ? "Salvando…" : "Salvar cobrança"}</Button></div>
    </form>
  </Surface>;
}
