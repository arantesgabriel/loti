"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Package, Plus } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { ProductCategoryMarker } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/surface";
import { PackageSurface as Surface } from "./package-surface";
import type { CostTrackingView } from "@/lib/domain/package-cost-reading";
import { allocateExactMinor } from "@/lib/domain/hubbuy-balance-calculations";
import { formatBrlMinor, formatCnyMinor, parseFinancialMinor } from "@/lib/domain/financial-money";
import { costRequest } from "./package-cost-client";
import { additionalProductTotal, productPriceEntry, type ProductPriceEntry } from "@/lib/domain/additional-product-pricing";
import { AdditionalProductPriceModeField, AdditionalProductPriceValueField } from "./additional-product-price-input";

type Detail = CostTrackingView;
type Order = Detail["productOrders"][number];
export type FinancingPosition = Order["items"][number]["financingPositions"][number];
type Balance = { accountId: string; rights: { personId: string; availableCnyMinor: number; availableHistoricalBrlCents: number }[] };
type AdvanceDraft = { component: "product" | "china"; beneficiaryId: string; lenderId: string; amount: string };

function readMinor(value: string, currency: "CNY" | "BRL", label: string) {
  try {
    const parsed = parseFinancialMinor(value, currency);
    if (parsed === null) throw new Error(`Informe ${label}.`);
    return parsed;
  } catch (error) { throw new Error(error instanceof Error ? error.message : `Valor inválido: ${label}.`); }
}

function minorToInput(value: number | null | undefined) {
  if (value == null) return "";
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

export function AdditionalOrdersPanel({ detail, locked, busy, mutate, createPackage, resumeOrderId, onResumeHandled }: {
  detail: Detail; locked: boolean; busy: boolean; mutate: (operation: string, rest: Record<string, unknown>, mayInvalidatePayment?: boolean) => Promise<boolean>;
  createPackage: () => Promise<boolean>; resumeOrderId: string | null; onResumeHandled: () => void;
}) {
  const activeAccounts = detail.hubbuyAccounts.filter(account => account.status === "active");
  const [open, setOpen] = useState(false), [activeOrderId, setActiveOrderId] = useState<string | null>(null), [autoSelectLatestDraft, setAutoSelectLatestDraft] = useState(false), [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(activeAccounts[0]?.id ?? "");
  const [name, setName] = useState(""); const [url, setUrl] = useState(""); const [platform, setPlatform] = useState("Taobao");
  const [variant, setVariant] = useState(""); const [quantity, setQuantity] = useState("1");
  const [productPrice, setProductPrice] = useState<ProductPriceEntry>({ basis: "unit", value: "" }); const [chinaCny, setChinaCny] = useState("");
  const [productFree, setProductFree] = useState(false); const [chinaFree, setChinaFree] = useState(false);
  const [participantIds, setParticipantIds] = useState<string[]>(detail.members.map(member => member.id));
  const [balances, setBalances] = useState<Record<string, Balance>>({});
  const [useOwnBalance, setUseOwnBalance] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card">("pix");
  const [externalBrl, setExternalBrl] = useState("");
  const [advances, setAdvances] = useState<AdvanceDraft[]>([]);
  const [discardOrder, setDiscardOrder] = useState<Order | null>(null);
  const [packageId, setPackageId] = useState("");

  const accountKey = activeAccounts.map(account => account.id).join("|");
  const selectedAccountId = activeAccounts.some(account => account.id === accountId) ? accountId : activeAccounts[0]?.id ?? "";
  useEffect(() => {
    let active = true;
    const ids = accountKey.split("|").filter(Boolean);
    for (const accountId of ids) void costRequest<{ account: { id: string }; rights: Balance["rights"] }>(`/api/hubbuy/accounts/${encodeURIComponent(accountId)}`).then(result => {
      if (active && result.ok && result.data) setBalances(current => ({ ...current, [accountId]: { accountId, rights: result.data!.rights } }));
    });
    return () => { active = false; };
  }, [accountKey]);

  const draftOrders = detail.productOrders.filter(order => order.kind === "additional" && order.state === "draft");
  const selectedOrderId = resumeOrderId ?? activeOrderId;
  const activeOrder = selectedOrderId
    ? detail.productOrders.find(order => order.id === selectedOrderId && order.kind === "additional") ?? null
    : autoSelectLatestDraft ? draftOrders[draftOrders.length - 1] ?? null : null;
  const eligiblePackages = activeOrder?.state === "recorded"
    ? detail.packages.filter(pkg => pkg.logisticsStatus === "preparing" && pkg.contentSealSource === null && pkg.contentSealedAt === null && (!pkg.accountId || pkg.accountId === activeOrder.accountId))
    : [];
  const selectedPackageId = eligiblePackages.some(pkg => pkg.id === packageId) ? packageId : eligiblePackages[0]?.id ?? "";
  const unassignedUnits = activeOrder?.state === "recorded" ? activeOrder.items.reduce((sum, row) => {
    const shippingQuantity = row.calculation?.shippingQuantity ?? row.quantity;
    const assigned = detail.packages.reduce((total, pkg) => total + (pkg.items.find(item => item.costItemId === row.cost.id)?.quantity ?? 0), 0);
    return sum + Math.max(0, shippingQuantity - assigned);
  }, 0) : 0;

  function beginDraftEdit(order: Order) {
    const row = order.items[0], item = row?.item;
    if (!row || !item || order.items.length !== 1) { toast.error("Este rascunho não pode ser editado neste fluxo."); return; }
    setEditingDraftId(order.id);
    setAccountId(order.accountId ?? activeAccounts[0]?.id ?? "");
    setName(item.name); setUrl(item.url); setPlatform(item.platform); setVariant(item.variant ?? ""); setQuantity(String(row.quantity));
    setProductPrice(productPriceEntry(row.cost.nativeProductCnyMinor, row.quantity)); setChinaCny(minorToInput(row.cost.nativeChinaCnyMinor));
    setProductFree(row.cost.nativeProductState === "no_charge"); setChinaFree(row.cost.nativeChinaState === "no_charge");
    setParticipantIds(row.participants.map(person => person.personId));
  }

  async function updateDraft(event: React.FormEvent) {
    event.preventDefault();
    if (!editingDraftId) return;
    try {
      if (!selectedAccountId) throw new Error("Cadastre e concilie uma conta HubBuy antes de editar o pedido.");
      if (!participantIds.length) throw new Error("Escolha ao menos uma pessoa para dividir o item.");
      const itemQuantity = Number(quantity);
      if (!Number.isInteger(itemQuantity) || itemQuantity < 1 || itemQuantity > 10_000) throw new Error("Informe uma quantidade entre 1 e 10.000.");
      const productAmount = productFree ? null : additionalProductTotal(productPrice.value, itemQuantity, productPrice.basis);
      const chinaAmount = chinaFree ? null : parseFinancialMinor(chinaCny, "CNY");
      const ok = await mutate("order.additional.update_draft", { orderId: editingDraftId, input: {
        expectedRevision: detail.tracking.revision, idempotencyKey: crypto.randomUUID(), accountId: selectedAccountId,
        item: {
          name: name.trim(), url: url.trim(), platform, variant: variant.trim() || null, quantity: itemQuantity,
          nativeProductState: productFree ? "no_charge" : productAmount === null ? "unknown" : "known", nativeProductCnyMinor: productFree ? null : productAmount,
          nativeChinaState: chinaFree ? "no_charge" : chinaAmount === null ? "unknown" : "known", nativeChinaCnyMinor: chinaFree ? null : chinaAmount,
          participants: participantIds.map(personId => ({ personId, weightMode: "equal", weight: 1 })),
        },
      } });
      if (ok) {
        setEditingDraftId(null); setActiveOrderId(editingDraftId); setAutoSelectLatestDraft(false); setAdvances([]); onResumeHandled();
        toast.success("Rascunho atualizado.");
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Confira os campos do rascunho."); }
  }

  async function createOrder(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (!selectedAccountId) throw new Error("Cadastre e concilie uma conta HubBuy antes de criar o pedido.");
      if (!participantIds.length) throw new Error("Escolha ao menos uma pessoa para dividir o item.");
      const itemQuantity = Number(quantity);
      if (!Number.isInteger(itemQuantity) || itemQuantity < 1 || itemQuantity > 10_000) throw new Error("Informe uma quantidade entre 1 e 10.000.");
      const product = productFree ? null : additionalProductTotal(productPrice.value, itemQuantity, productPrice.basis);
      if (!productFree && product === null) throw new Error("Informe o preço do produto em CNY.");
      const china = chinaFree ? null : readMinor(chinaCny, "CNY", "o frete China em CNY");
      if (!name.trim() || !url.trim()) throw new Error("Informe o nome e o link do produto.");
      const ok = await mutate("order.additional.create", { input: {
        expectedRevision: detail.tracking.revision, idempotencyKey: crypto.randomUUID(), accountId: selectedAccountId,
        items: [{ name: name.trim(), url: url.trim(), platform, visualKey: "generic", variant: variant.trim() || null, quantity: itemQuantity, itemOrder: 0,
          nativeProductState: productFree ? "no_charge" : "known", nativeProductCnyMinor: product,
          nativeChinaState: chinaFree ? "no_charge" : "known", nativeChinaCnyMinor: china,
          participants: participantIds.map(personId => ({ personId, weightMode: "equal", weight: 1 })) }],
      } });
      if (ok) { setName(""); setUrl(""); setVariant(""); setQuantity("1"); setProductPrice({ basis: "unit", value: "" }); setChinaCny(""); setProductFree(false); setChinaFree(false); setAdvances([]); setActiveOrderId(null); setAutoSelectLatestDraft(true); toast.success("Produto registrado. Confirme o pagamento para incluir no pacote."); }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Confira os campos do pedido."); }
  }

  function getTargets(order: Order) {
    return order.items.flatMap(row => ( [
      ["product", row.cost.nativeProductState === "known" ? row.cost.nativeProductCnyMinor ?? 0 : 0],
      ["china", row.cost.nativeChinaState === "known" ? row.cost.nativeChinaCnyMinor ?? 0 : 0],
    ] as const).flatMap(([component, amount]) => {
      if (amount <= 0) return [];
      const participantRows = row.participants.map(person => ({ id: person.personId, order: person.allocationOrder, weight: person.weight }));
      const shares = allocateExactMinor(amount, participantRows);
      return row.participants.flatMap((person, index) => shares[index] > 0 ? [{ costItemId: row.cost.id, costComponent: component, beneficiaryId: person.personId, cnyMinor: shares[index] }] : []);
    }));
  }

  function preview(order: Order) {
    try {
      const targets = getTargets(order);
      const requests = advances.filter(row => row.amount.trim()).map(row => {
        if (!row.beneficiaryId || !row.lenderId) throw new Error("Escolha quem recebe o adiantamento e quem empresta o saldo.");
        if (row.beneficiaryId === row.lenderId) throw new Error("O saldo próprio é calculado automaticamente; selecione outra pessoa como financiadora.");
        return { ...row, costItemId: order.items[0]?.cost.id ?? "", cnyMinor: readMinor(row.amount, "CNY", "o valor do adiantamento") };
      });
      let ownUsed = 0, crossUsed = 0;
      const lenderRemaining = new Map((balances[order.accountId ?? ""]?.rights ?? []).map(row => [row.personId, row.availableCnyMinor]));
      const directedByTarget = new Map<string, number>();
      for (const request of requests) {
        const targetKey = `${request.costItemId}:${request.component}:${request.beneficiaryId}`;
        const target = targets.find(row => row.costItemId === request.costItemId && row.costComponent === request.component && row.beneficiaryId === request.beneficiaryId);
        if (!target) throw new Error("O adiantamento referencia um componente sem custo para essa pessoa.");
        const directed = (directedByTarget.get(targetKey) ?? 0) + request.cnyMinor;
        if (directed > target.cnyMinor) throw new Error("O adiantamento supera a parcela CNY dessa pessoa.");
        directedByTarget.set(targetKey, directed);
        const available = lenderRemaining.get(request.lenderId) ?? 0;
        if (request.cnyMinor > available) throw new Error(`Saldo insuficiente de ${detail.members.find(member => member.id === request.lenderId)?.name ?? "quem financia"} para este adiantamento.`);
        lenderRemaining.set(request.lenderId, available - request.cnyMinor);
        crossUsed += request.cnyMinor;
      }
      for (const target of targets) {
        const targetKey = `${target.costItemId}:${target.costComponent}:${target.beneficiaryId}`;
        const directed = directedByTarget.get(targetKey) ?? 0;
        const ownAvailable = useOwnBalance ? lenderRemaining.get(target.beneficiaryId) ?? 0 : 0;
        const ownAmount = Math.min(target.cnyMinor - directed, ownAvailable);
        lenderRemaining.set(target.beneficiaryId, ownAvailable - ownAmount);
        ownUsed += ownAmount;
      }
      const externalCnyMinor = order.nativeCnyMinor! - ownUsed - crossUsed;
      if (externalCnyMinor < 0) throw new Error("O saldo e os adiantamentos ultrapassam o valor do pedido.");
      return { targets, requests, ownUsed, crossUsed, externalCnyMinor, error: "" };
    } catch (error) {
      return { targets: [], requests: [], ownUsed: 0, crossUsed: 0, externalCnyMinor: order.nativeCnyMinor ?? 0, error: error instanceof Error ? error.message : "Não foi possível calcular o pagamento." };
    }
  }

  function updateAdvance(index: number, patch: Partial<AdvanceDraft>) {
    setAdvances(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  async function payOrder(order: Order, event: React.FormEvent) {
    event.preventDefault();
    try {
      const estimate = preview(order);
      if (estimate.error) throw new Error(estimate.error);
      const external = estimate.externalCnyMinor > 0 ? {
        paymentMethod, principalBrlCents: readMinor(externalBrl, "BRL", "o principal externo em BRL"),
        conversionCnyMinor: estimate.externalCnyMinor, conversionBrlCents: readMinor(externalBrl, "BRL", "o BRL da conversão"),
      } : null;
      const ok = await mutate("order.additional.pay_mixed", { orderId: order.id, input: {
        expectedRevision: detail.tracking.revision, idempotencyKey: crypto.randomUUID(), useOwnBalance,
        balanceFunding: estimate.requests.map(row => ({ costItemId: row.costItemId, costComponent: row.component, beneficiaryId: row.beneficiaryId, lenderId: row.lenderId, cnyMinor: row.cnyMinor })),
        external,
      } });
      if (ok) { setActiveOrderId(order.id); setAutoSelectLatestDraft(false); toast.success("Pagamento registrado. Agora associe as unidades ao pacote."); }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Confira a composição do pagamento."); }
  }

  async function confirmDiscard() {
    if (!discardOrder) return;
    const ok = await mutate("order.additional.void", { orderId: discardOrder.id, input: { expectedRevision: detail.tracking.revision, idempotencyKey: crypto.randomUUID(), reason: "Rascunho descartado antes da compra." } });
    if (ok) { setDiscardOrder(null); setActiveOrderId(null); setAutoSelectLatestDraft(false); toast.success("Rascunho descartado."); }
  }

  async function associateWithPackage(order: Order) {
    const pkg = detail.packages.find(value => value.id === selectedPackageId);
    if (!pkg) { toast.error("Escolha ou crie um pacote em preparação para associar o produto."); return; }
    const costRows = [
      ...detail.items.map(item => ({ id: item.id, shippingQuantity: item.calculation?.shippingQuantity ?? item.original.quantity })),
      ...detail.productOrders.filter(value => value.kind === "additional" && value.state === "recorded").flatMap(value => value.items.map(row => ({ id: row.cost.id, shippingQuantity: row.calculation?.shippingQuantity ?? row.quantity }))),
    ];
    const additions = new Map(order.items.map(row => {
      const assigned = detail.packages.reduce((sum, existing) => sum + (existing.items.find(item => item.costItemId === row.cost.id)?.quantity ?? 0), 0);
      return [row.cost.id, Math.max(0, (row.calculation?.shippingQuantity ?? row.quantity) - assigned)];
    }));
    if ([...additions.values()].every(quantity => quantity === 0)) { toast.error("Todas as unidades deste pedido já estão associadas a pacotes."); return; }
    const allocations = costRows.map(line => {
      const currentlyAssigned = pkg.items.find(item => item.costItemId === line.id)?.quantity ?? 0;
      const assignedOutside = detail.packages.filter(existing => existing.id !== pkg.id).reduce((sum, existing) => sum + (existing.items.find(item => item.costItemId === line.id)?.quantity ?? 0), 0);
      const add = additions.get(line.id) ?? 0;
      return { costItemId: line.id, quantity: Math.min(line.shippingQuantity - assignedOutside, currentlyAssigned + add) };
    });
    const ok = await mutate("package.allocations", { input: { expectedRevision: detail.tracking.revision, packageId: pkg.id, allocations } }, true);
    if (ok) { setOpen(false); setActiveOrderId(null); setAutoSelectLatestDraft(false); setPackageId(""); onResumeHandled(); toast.success(`Produto associado a ${pkg.name}.`); }
  }

  const estimate = activeOrder?.state === "draft" ? preview(activeOrder) : null;
  const isEditingDraft = activeOrder?.state === "draft" && editingDraftId === activeOrder.id;
  const drawerTitle = activeOrder?.state === "recorded"
    ? "Associar ao pacote"
    : isEditingDraft
      ? "Editar produto comprado"
      : activeOrder?.state === "draft"
        ? "Confirmar compra"
        : "Adicionar produto comprado";
  const drawerDescription = activeOrder?.state === "recorded"
    ? "Associe as unidades disponíveis a um pacote em preparação."
    : isEditingDraft
      ? "Edite os dados do produto antes de confirmar o pagamento."
      : activeOrder?.state === "draft"
        ? "Revise o item e confirme o pagamento."
        : "Registre o item e associe as unidades a um pacote.";
  const paymentSummary = [
    { label: "Saldo próprio previsto", amount: estimate?.ownUsed ?? 0 },
    { label: "Adiantamento", amount: estimate?.crossUsed ?? 0 },
    { label: "Complemento", amount: estimate?.externalCnyMinor ?? 0 },
  ];
  const summaryHasUnknown = activeOrder?.items.some(row => row.cost.nativeProductState === "unknown" || row.cost.nativeChinaState === "unknown") ?? false;

  return <>
    {!locked && <Button className="cost-additional-order-trigger" type="button" variant="outline" disabled={busy} onClick={() => setOpen(true)}><Plus size={16}/><span>Adicionar produto</span>{draftOrders.length > 0 && <span className="cost-draft-count">{draftOrders.length} rascunhos</span>}</Button>}
    <Surface sheet open={open || !!resumeOrderId} title={drawerTitle} description={drawerDescription} onOpenChange={value => { if (!busy) { setOpen(value); if (!value) { setActiveOrderId(null); setAutoSelectLatestDraft(false); setEditingDraftId(null); onResumeHandled(); } } }} className="cost-additional-order-surface">
      {(!activeOrder || isEditingDraft) && <>
      {!locked && <form className="cost-additional-order-create" onSubmit={event => void (isEditingDraft ? updateDraft(event) : createOrder(event))}>
        <section className="cost-order-section cost-order-account-section">
          <h3 id="cost-order-account-title" className="cost-order-section-title">1. Conta HubBuy</h3>
          <label><span className="sr-only">Conta HubBuy</span><select required value={selectedAccountId} onChange={event => setAccountId(event.target.value)}><option value="">Escolher conta conciliada</option>{activeAccounts.map(account => <option key={account.id} value={account.id}>{account.label} · {formatCnyMinor(account.balanceCnyMinor)}</option>)}</select></label>
        </section>

        <section className="cost-order-section" aria-labelledby="cost-order-item-title">
          <h3 id="cost-order-item-title" className="cost-order-section-title">2. Dados do item</h3>
          <div className="cost-additional-order-fields">
            <label>Produto<input required maxLength={200} value={name} onChange={event => setName(event.target.value)} placeholder="Nome do produto"/></label>
            <label>Link<input required type="url" maxLength={2048} value={url} onChange={event => setUrl(event.target.value)} placeholder="https://…"/></label>
            <label>Plataforma<input required maxLength={100} value={platform} onChange={event => setPlatform(event.target.value)} /></label>
            <label>Variação<input maxLength={500} value={variant} onChange={event => setVariant(event.target.value)} placeholder="Opcional"/></label>
            <label>Quantidade<input required type="number" min={1} max={10000} value={quantity} onChange={event => setQuantity(event.target.value)}/></label>
            <AdditionalProductPriceModeField entry={productPrice} quantity={Number(quantity)} onChange={setProductPrice} disabled={productFree} label="Cobrar por"/>
          </div>
        </section>

        <section className="cost-order-section" aria-labelledby="cost-order-values-title">
          <h3 id="cost-order-values-title" className="cost-order-section-title">3. Valores e divisão</h3>
          <div className="cost-order-value-grid">
            <AdditionalProductPriceValueField entry={productPrice} quantity={Number(quantity)} onChange={setProductPrice} disabled={productFree}/>
            <label><span>Frete China total (CNY)</span><input inputMode="decimal" disabled={chinaFree} value={chinaCny} onChange={event => setChinaCny(event.target.value)} placeholder="0,00"/></label>
            <label className="cost-order-free"><input type="checkbox" checked={productFree} disabled={productPrice.value.trim().length > 0} onChange={event => setProductFree(event.target.checked)}/> Sem cobrança de produto</label>
            <label className="cost-order-free"><input type="checkbox" checked={chinaFree} disabled={chinaCny.trim().length > 0} onChange={event => setChinaFree(event.target.checked)}/> Sem cobrança de frete China</label>
          </div>
          <fieldset className="cost-order-participants"><legend>Dividir o custo igualmente</legend><div className="cost-order-participant-options">{detail.members.map(member => <label key={member.id} className={participantIds.includes(member.id) ? "is-selected" : ""}><input type="checkbox" checked={participantIds.includes(member.id)} onChange={event => setParticipantIds(current => event.target.checked ? [...current, member.id] : current.filter(id => id !== member.id))}/><span>{member.name}</span></label>)}</div></fieldset>
        </section>

        {isEditingDraft ? <div className="cost-order-footer is-edit-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => setEditingDraftId(null)}>Voltar ao pagamento</Button><Button type="submit" disabled={busy || !activeAccounts.length}>{busy ? "Salvando…" : "Salvar alterações"}</Button></div> : <div className="cost-order-footer"><Button type="submit" disabled={busy || !activeAccounts.length}>{busy ? "Salvando…" : "Continuar para o pagamento"}</Button></div>}
        {!activeAccounts.length && <small className="muted">Cadastre uma conta HubBuy ativa na <Link href="/packages/accounts">gestão de contas</Link> para registrar o pedido.</small>}
      </form>}
    {!activeOrder && draftOrders.length > 0 && <details className="cost-order-existing-drafts"><summary>Retomar rascunho pendente ({draftOrders.length})</summary><div>{draftOrders.map(order => <button key={order.id} type="button" disabled={busy} onClick={() => { setActiveOrderId(order.id); setAutoSelectLatestDraft(false); setEditingDraftId(null); }}><span><strong>{order.items[0]?.item?.name ?? "Produto adicional"}</strong><small>{order.account?.label ?? "Conta HubBuy"} · falta confirmar pagamento</small></span><ArrowRight size={16}/></button>)}</div></details>}
      </>}
      {activeOrder?.state === "draft" && !isEditingDraft && activeOrder.accountId && <div className="cost-additional-order-flow">
        <form className="cost-additional-order-payment" onSubmit={event => void payOrder(activeOrder, event)}>
          <article className="cost-order-product-summary" aria-label="Resumo do produto">
            <div className="cost-order-summary-items">{activeOrder.items.map(row => <div className="cost-order-summary-item" key={row.cost.id}>
              <ProductCategoryMarker visualKey={row.item?.visualKey ?? "generic"}/>
              <div className="cost-order-summary-copy"><strong>{row.item?.name ?? "Produto"}</strong><span>{row.item?.platform ?? "Outro"} · {row.quantity} un.{row.item?.variant ? ` · ${row.item.variant}` : ""}</span></div>
            </div>)}</div>
            <div className="cost-order-summary-actions"><strong>{summaryHasUnknown || activeOrder.nativeCnyMinor === null ? "Pendente" : formatCnyMinor(activeOrder.nativeCnyMinor ?? 0)}</strong>{!locked && activeOrder.items.length === 1 && <Button type="button" variant="outline" disabled={busy} onClick={() => beginDraftEdit(activeOrder)}>Editar</Button>}</div>
          </article>

          <section className="cost-order-payment-section" aria-labelledby="cost-order-payment-title">
            <h3 id="cost-order-payment-title">Pagamento</h3>
            <div className="cost-payment-summary" role="group" aria-label="Resumo do pagamento previsto">
              {paymentSummary.map(row => <div className="cost-payment-summary-row" key={row.label}><span>{row.label}</span><strong className={row.amount === 0 ? "is-zero" : ""}>{formatCnyMinor(row.amount)}</strong></div>)}
            </div>
          </section>

          <label className="cost-order-own-balance"><input type="checkbox" checked={useOwnBalance} onChange={event => setUseOwnBalance(event.target.checked)}/> Usar saldo próprio dos participantes</label>
          <div className="cost-order-advance-list">{advances.map((advance, index) => <div className="cost-order-advance" key={index}>
            <label>Quem recebe<select value={advance.beneficiaryId} onChange={event => updateAdvance(index, { beneficiaryId: event.target.value, lenderId: advance.lenderId === event.target.value ? "" : advance.lenderId })}><option value="">Escolher pessoa</option>{detail.members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
            <label>Quem financia<select value={advance.lenderId} onChange={event => updateAdvance(index, { lenderId: event.target.value })}><option value="">Escolher financiador</option>{detail.members.filter(member => member.id !== advance.beneficiaryId).map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
            <label>Componente<select value={advance.component} onChange={event => updateAdvance(index, { component: event.target.value as "product" | "china" })}><option value="product">Produto</option><option value="china">Frete China</option></select></label>
            <label>Valor CNY<input inputMode="decimal" value={advance.amount} onChange={event => updateAdvance(index, { amount: event.target.value })} placeholder="0,00"/></label>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdvances(current => current.filter((_, rowIndex) => rowIndex !== index))}>Remover adiantamento</Button>
          </div>)}<Button type="button" variant="outline" className="cost-order-add-advance" onClick={() => setAdvances(current => [...current, { component: "product", beneficiaryId: "", lenderId: "", amount: "" }])}>Adicionar adiantamento</Button></div>
          {(estimate?.externalCnyMinor ?? 0) > 0 && <div className="cost-order-external-fields"><label>Método do complemento<select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as "pix" | "card")}><option value="pix">PIX · {detail.settings.pixBps / 100}%</option><option value="card">Cartão · {detail.settings.cardBps / 100}%</option></select></label><label>Principal externo em BRL<input inputMode="decimal" required value={externalBrl} onChange={event => setExternalBrl(event.target.value)} placeholder="0,00"/></label></div>}
          {estimate?.error && <small className="error" role="alert">{estimate.error}</small>}
          <div className="cost-order-footer"><Button type="submit" disabled={busy || !!estimate?.error || (estimate?.externalCnyMinor ?? 0) > 0 && !externalBrl.trim()}>{busy ? "Salvando…" : "Confirmar compra"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setDiscardOrder(activeOrder)}>Descartar rascunho</Button></div>
        </form>
      </div>}
      {activeOrder?.state === "recorded" && <div className="cost-additional-order-flow">
        <div className="cost-order-payment-note">{activeOrder.account?.label ?? "Conta HubBuy"} · {formatCnyMinor(activeOrder.nativeCnyMinor ?? 0)} · Base de saldo {formatBrlMinor(activeOrder.historicalBrlCents)} · Dinheiro novo {formatBrlMinor(activeOrder.newMoneyBrlCents)} (taxas {formatBrlMinor(activeOrder.feeBrlCents)})</div>
        {unassignedUnits > 0 ? <>
          {eligiblePackages.length > 0 ? <label>Pacote<select value={selectedPackageId} onChange={event => setPackageId(event.target.value)}>{eligiblePackages.map(pkg => <option key={pkg.id} value={pkg.id}>{pkg.name}{pkg.accountId ? " · conta compatível" : " · vincular conta HubBuy"}</option>)}</select></label> : <p className="muted">Não há pacote em preparação compatível com esta conta.</p>}
          <p className="cost-package-association-note">{unassignedUnits} {unassignedUnits === 1 ? "unidade será associada" : "unidades serão associadas"} ao pacote escolhido.</p>
          <div className="form-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => void createPackage()}>Criar pacote</Button><Button type="button" disabled={busy || !selectedPackageId} onClick={() => void associateWithPackage(activeOrder)}><Package size={15}/>Associar ao pacote</Button></div>
        </> : <><p className="muted">Todas as unidades deste pedido já estão associadas a um pacote.</p><Button type="button" onClick={() => { setOpen(false); setActiveOrderId(null); onResumeHandled(); }}>Concluir</Button></>}
      </div>}
    </Surface>
    <Confirm open={!!discardOrder} title="Descartar este rascunho?" description="O rascunho e seus itens ficam no histórico como descartados. Nenhum saldo ou pagamento será lançado." label="Descartar rascunho" danger busy={busy} onOpenChange={open => { if (!open && !busy) setDiscardOrder(null); }} onConfirm={() => void confirmDiscard()}/>
  </>;
}

export function FinancingSettlementSurface({ orderId, position, detail, busy, onClose, onSubmit }: {
  orderId: string; position: FinancingPosition; detail: Detail; busy: boolean; onClose: () => void; onSubmit: (input: unknown) => Promise<void>;
}) {
  const [amountCny, setAmountCny] = useState(formatCnyMinor(position.openCnyMinor));
  const [currency, setCurrency] = useState<"BRL" | "CNY">("BRL");
  const [settledAmount, setSettledAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const amountCnyMinor = parseFinancialMinor(amountCny, "CNY");
  const settledAmountMinor = parseFinancialMinor(settledAmount, currency);
  const lender = detail.members.find(member => member.id === position.lenderId)?.name ?? "Financiador";
  const beneficiary = detail.members.find(member => member.id === position.beneficiaryId)?.name ?? "Beneficiário";
  const valid = !busy && amountCnyMinor !== null && amountCnyMinor > 0 && amountCnyMinor <= position.openCnyMinor && settledAmountMinor !== null && settledAmountMinor > 0 && /^\d{4}-\d{2}-\d{2}$/.test(occurredOn) && reason.trim().length > 0;
  return <Surface sheet open title="Registrar acerto" subtitle={`${beneficiary} → ${lender}`} description="Registre o CNY da obrigação quitada e o valor efetivamente pago. O lançamento não movimenta dinheiro nem altera o custo histórico do produto." onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <form onSubmit={event => { event.preventDefault(); if (!valid || amountCnyMinor === null || settledAmountMinor === null) return; void onSubmit({
      expectedRevision: detail.tracking.revision, idempotencyKey: crypto.randomUUID(), orderId, consumptionId: position.consumptionId,
      lenderId: position.lenderId, beneficiaryId: position.beneficiaryId, amountCnyMinor, settledAmountMinor,
      settledCurrency: currency, occurredOn, reason,
    }); }}>
      <label>Parte da obrigação quitada · CNY<input required inputMode="decimal" value={amountCny} onChange={event => setAmountCny(event.target.value)} aria-invalid={amountCnyMinor === null || amountCnyMinor > position.openCnyMinor}/></label>
      <div className="cost-order-settlement-amount"><label>Moeda do pagamento observado<select value={currency} onChange={event => { setCurrency(event.target.value as "BRL" | "CNY"); setSettledAmount(""); }}><option value="BRL">BRL</option><option value="CNY">CNY</option></select></label><label>Valor efetivamente pago<input required inputMode="decimal" value={settledAmount} onChange={event => setSettledAmount(event.target.value)} aria-invalid={settledAmountMinor === null}/></label></div>
      <label>Data real do acerto<input required type="date" value={occurredOn} onChange={event => setOccurredOn(event.target.value)}/></label>
      <label>Referência ou observação<textarea required minLength={1} maxLength={1000} rows={3} value={reason} onChange={event => setReason(event.target.value)} placeholder="Ex.: transferência entre os participantes"/></label>
      <div className="form-actions"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={!valid}>{busy ? "Salvando…" : "Registrar acerto"}</Button></div>
    </form>
  </Surface>;
}
