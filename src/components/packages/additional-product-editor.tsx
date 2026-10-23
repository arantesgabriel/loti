"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PackageSurface as Surface } from "./package-surface";
import type { CostTrackingView } from "@/lib/domain/package-cost-reading";
import { formatBrlMinor, formatCnyMinor, parseFinancialMinor } from "@/lib/domain/financial-money";
import { costRequest, basisPointsFromPercent, percentInputFromBasisPoints } from "./package-cost-client";
import "./additional-product-editor.css";
import { additionalProductTotal, productPriceEntry } from "@/lib/domain/additional-product-pricing";
import { AdditionalProductPriceInput } from "./additional-product-price-input";

type Preview = { balanceBeforeCnyMinor: number; balanceAfterCnyMinor: number; historicalBrlCents: number; principalBrlCents: number; feeBrlCents: number; totalCostBrlCents: number };
const inputMinor = (value: number) => (value / 100).toFixed(2).replace(".", ",");
function minor(value: string, currency: "CNY" | "BRL") {
  const result = parseFinancialMinor(value, currency);
  if (result === null) throw new Error("Informe todos os valores do pagamento.");
  return result;
}

export function AdditionalProductEditor({ detail, itemId, busy, onClose, mutate }: {
  detail: CostTrackingView; itemId: string; busy: boolean; onClose: () => void;
  mutate: (operation: string, rest: Record<string, unknown>) => Promise<boolean>;
}) {
  const order = detail.productOrders.find(order => order.items.some(row => row.cost.id === itemId))!;
  const row = order.items.find(row => row.cost.id === itemId)!;
  const item = row.item!;
  const externalComponent = order.paymentComponents.find(component => component.sourceType !== "balance");
  const hadBalance = order.paymentComponents.some(component => component.sourceType === "balance");
  const [name, setName] = useState(item.name), [url, setUrl] = useState(item.url);
  const [variant, setVariant] = useState(item.variant ?? ""), [notes, setNotes] = useState(item.notes ?? "");
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [productPrice, setProductPrice] = useState(() => productPriceEntry(row.cost.nativeProductCnyMinor ?? 0, item.quantity));
  const [china, setChina] = useState(inputMinor(row.cost.nativeChinaCnyMinor ?? 0));
  const [mode, setMode] = useState<"equal" | "percentage" | "fixed">(row.participants[0]?.weightMode ?? "equal");
  const [weights, setWeights] = useState(Object.fromEntries(row.participants.map(person => [person.personId, percentInputFromBasisPoints(person.weightMode === "percentage" ? person.weight : Math.round(10_000 / row.participants.length))])));
  const [useBalance, setUseBalance] = useState(hadBalance);
  const [external, setExternal] = useState(!!externalComponent);
  const [method, setMethod] = useState<"pix" | "card">(externalComponent?.sourceType === "card" ? "card" : "pix");
  const [externalCny, setExternalCny] = useState(inputMinor(order.paymentComponents.filter(component => component.sourceType !== "balance").reduce((sum, component) => sum + component.cnyMinor, 0)));
  const [externalBrl, setExternalBrl] = useState(inputMinor(order.principalBrlCents));
  const [fee, setFee] = useState(percentInputFromBasisPoints(externalComponent?.feeBps ?? detail.settings.pixBps));
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [advances, setAdvances] = useState<{ beneficiaryId: string; lenderId: string; component: "product" | "china"; amount: string }[]>([]);
  const [preview, setPreview] = useState<{ result: Preview; input: Record<string, unknown> } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);
  const disabled = busy || previewing;
  useEffect(() => {
    if (!preview) return;
    previewRef.current?.focus({ preventScroll: true });
    previewRef.current?.scrollIntoView({ block: "nearest" });
  }, [preview]);

  async function prepare() {
    setPreviewing(true); setError("");
    try {
      const account = await costRequest<{ account: { revision: number } }>(`/api/hubbuy/accounts/${encodeURIComponent(order.accountId!)}`);
      if (!account.ok || !account.data) throw new Error(account.error ?? "Não foi possível conferir o saldo.");
      const bps = basisPointsFromPercent(fee);
      if (external && bps === null) throw new Error("Informe uma taxa válida entre 0 e 100%.");
      const brl = external ? minor(externalBrl, "BRL") : 0;
      const productTotal = additionalProductTotal(productPrice.value, Number(quantity), productPrice.basis);
      if (productTotal === null) throw new Error("Informe o preço do produto em CNY.");
      const input = {
        expectedRevision: detail.tracking.revision, expectedAccountRevision: account.data.account.revision,
        idempotencyKey: crypto.randomUUID(), reason, confirmedIncorrectRegistration: confirmed,
        itemId, name, url, variant: variant || null, notes: notes || null, quantity: Number(quantity),
        nativeProductCnyMinor: productTotal, nativeChinaCnyMinor: minor(china, "CNY"),
        composition: { mode, participants: row.participants.map(person => ({ personId: person.personId, weight: mode === "equal" ? 1 : mode === "fixed" ? person.weight : basisPointsFromPercent(weights[person.personId]) ?? -1 })) },
        useOwnBalance: useBalance,
        balanceFunding: advances.map(advance => ({ costItemId: itemId, costComponent: advance.component, beneficiaryId: advance.beneficiaryId, lenderId: advance.lenderId, cnyMinor: minor(advance.amount, "CNY") })),
        external: external ? { paymentMethod: method, principalBrlCents: brl, conversionBrlCents: brl, conversionCnyMinor: minor(externalCny, "CNY"), feeBps: bps } : null,
      };
      const response = await costRequest<Preview>(`/api/packages/${encodeURIComponent(detail.tracking.id)}`, { operation: "order.additional.preview_correction", orderId: order.id, input });
      if (!response.ok || !response.data) throw new Error(response.error ?? "Não foi possível calcular a correção.");
      setPreview({ result: response.data, input });
    } catch (error) { setError(error instanceof Error ? error.message : "Confira os dados da correção."); }
    finally { setPreviewing(false); }
  }

  const relatedCorrections: typeof detail.orderCorrections = [];
  let historyOrderId = order.id;
  for (let index = 0; index < detail.orderCorrections.length; index++) {
    const correction = detail.orderCorrections.find(correction => correction.replacementOrderId === historyOrderId);
    if (!correction) break;
    relatedCorrections.push(correction);
    historyOrderId = correction.previousOrderId;
  }
  return <Surface sheet open title="Custos do produto" subtitle={item.name} description="Corrija o registro do pedido adicional e confira novamente o pagamento. O preço por unidade é multiplicado pela quantidade; o frete China é informado como total." onOpenChange={open => { if (!open && !disabled) onClose(); }}>
    <form className="cost-correction-form" onChange={() => { setPreview(null); setError(""); }} onSubmit={event => { event.preventDefault(); if (!disabled) void prepare(); }}>
      <fieldset disabled={disabled}>
        <label>Produto<input required maxLength={200} value={name} onChange={event => setName(event.target.value)}/></label>
        <label>Link<input required type="url" maxLength={2048} value={url} onChange={event => setUrl(event.target.value)}/></label>
        <label>Variação<input maxLength={500} value={variant} onChange={event => setVariant(event.target.value)}/></label>
        <label>Observações<textarea maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)}/></label>
        <label>Quantidade<input required type="number" min={1} max={10000} value={quantity} onChange={event => setQuantity(event.target.value)}/></label>
        <AdditionalProductPriceInput entry={productPrice} quantity={Number(quantity)} onChange={setProductPrice} required/>
        <label>Frete China — total (CNY)<input required inputMode="decimal" value={china} onChange={event => setChina(event.target.value)}/></label>
        <p className="muted">Informe 0,00 para um componente sem cobrança. O custo em reais do saldo é obtido dos créditos usados.</p>
        <label>Divisão entre pessoas<select value={mode} onChange={event => setMode(event.target.value as typeof mode)}><option value="equal">Divisão igual</option><option value="percentage">Percentuais</option>{row.participants[0]?.weightMode === "fixed" && <option value="fixed">Proporção original</option>}</select></label>
        {row.participants.map(person => mode === "percentage" ? <label key={person.personId}>{person.name} (%)<input required inputMode="decimal" value={weights[person.personId]} onChange={event => setWeights(current => ({ ...current, [person.personId]: event.target.value }))}/></label> : <p key={person.personId}>{person.name} · {mode === "equal" ? "Divisão igual" : "Proporção original"}</p>)}
        <h3>Pagamento corrigido do pedido</h3>
        {order.items.length > 1 && <p className="muted">O pagamento cobre os {order.items.length} produtos do pedido. Os demais produtos mantêm seus dados e sua divisão.</p>}
        <p className="muted">O débito registrado é compensado aos titulares originais e o pagamento corrigido é registrado em seguida. Não use esta edição para registrar uma devolução real de produto.</p>
        <label className="cost-correction-check"><input type="checkbox" checked={useBalance} onChange={event => setUseBalance(event.target.checked)}/>Usar saldo próprio disponível</label>
        <label className="cost-correction-check"><input type="checkbox" checked={external} onChange={event => setExternal(event.target.checked)}/>Pagamento externo ou complemento</label>
        {external && <><label>Método<select value={method} onChange={event => { const method = event.target.value as "pix" | "card"; setMethod(method); setFee(percentInputFromBasisPoints(detail.settings[method === "pix" ? "pixBps" : "cardBps"])); }}><option value="pix">Pix</option><option value="card">Cartão</option></select></label><div className="form-row"><label>Parcela externa (CNY)<input required inputMode="decimal" value={externalCny} onChange={event => setExternalCny(event.target.value)}/></label><label>Principal externo (R$)<input required inputMode="decimal" value={externalBrl} onChange={event => setExternalBrl(event.target.value)}/></label><label>Taxa (%)<input required inputMode="decimal" value={fee} onChange={event => setFee(event.target.value)}/></label></div></>}
        <details><summary>Adiantamento com saldo de outra pessoa</summary><p className="muted">Direcione explicitamente os valores em CNY deste produto.</p>{advances.map((advance, index) => <div key={index} className="cost-editor-preview"><label>Beneficiário<select required value={advance.beneficiaryId} onChange={event => setAdvances(current => current.map((row, i) => i === index ? { ...row, beneficiaryId: event.target.value } : row))}>{row.participants.map(person => <option key={person.personId} value={person.personId}>{person.name}</option>)}</select></label><label>Financiador<select required value={advance.lenderId} onChange={event => setAdvances(current => current.map((row, i) => i === index ? { ...row, lenderId: event.target.value } : row))}>{detail.members.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label>Componente<select value={advance.component} onChange={event => setAdvances(current => current.map((row, i) => i === index ? { ...row, component: event.target.value as "product" | "china" } : row))}><option value="product">Produto</option><option value="china">Frete China</option></select></label><label>Valor do adiantamento (CNY)<input required inputMode="decimal" value={advance.amount} onChange={event => setAdvances(current => current.map((row, i) => i === index ? { ...row, amount: event.target.value } : row))}/></label><Button type="button" variant="ghost" onClick={() => { setAdvances(current => current.filter((_, i) => i !== index)); setPreview(null); }}>Remover adiantamento</Button></div>)}<Button type="button" variant="outline" onClick={() => { setAdvances(current => [...current, { beneficiaryId: row.participants[0].personId, lenderId: detail.members.find(person => person.id !== row.participants[0].personId)?.id ?? "", component: "product", amount: "" }]); setPreview(null); }}>Adicionar adiantamento</Button></details>
        <label>Motivo da correção<textarea required minLength={1} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)}/></label>
        <label className="cost-correction-check"><input required type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>Confirmo que estou corrigindo um registro incorreto e que este é o pagamento efetivamente observado.</label>
      </fieldset>
      {error && <p role="alert" className="error">{error}</p>}
      {preview && <div ref={previewRef} tabIndex={-1} className="cost-editor-preview" role="status"><h3>Confira a correção</h3><p>Custo anterior do pedido: <strong>{formatBrlMinor(order.totalCostBrlCents)}</strong></p><p>Custo corrigido: <strong>{formatBrlMinor(preview.result.totalCostBrlCents)}</strong></p><p>Saldo da conta: {formatCnyMinor(preview.result.balanceBeforeCnyMinor)} → <strong>{formatCnyMinor(preview.result.balanceAfterCnyMinor)}</strong></p><p>Base histórica do saldo: {formatBrlMinor(preview.result.historicalBrlCents)} · Principal externo: {formatBrlMinor(preview.result.principalBrlCents)} · Taxa: {formatBrlMinor(preview.result.feeBrlCents)}</p><p>O pagamento anterior e o motivo da correção ficam no histórico.</p></div>}
      <div className="form-actions"><Button type="button" variant="outline" disabled={disabled} onClick={onClose}>Cancelar</Button>{preview ? <Button type="button" disabled={disabled} onClick={async () => { const ok = await mutate("order.additional.correct", { orderId: order.id, input: preview.input }); if (ok) { toast.success("Produto e pagamento corrigidos"); onClose(); } }}>Confirmar correção</Button> : <Button type="submit" disabled={disabled || !confirmed}>{previewing ? "Conferindo…" : "Conferir correção"}</Button>}</div>
    </form>
    {relatedCorrections.length > 0 && <details><summary>Histórico de correções</summary>{relatedCorrections.map(correction => <div key={correction.id} className="cost-editor-preview"><p>{correction.actorName} · {new Date(correction.recordedAt).toLocaleString("pt-BR")}</p><p>{correction.reason}</p><p>Registro anterior: {correction.previousItems.map(item => item.name).join(", ")} · {formatBrlMinor(correction.previousTotalBrlCents)}</p>{correction.previousComponents.map(component => <p key={component.id}>{component.sourceType === "balance" ? "Saldo" : component.sourceType === "pix" ? "Pix" : "Cartão"}: {formatCnyMinor(component.cnyMinor)} · {formatBrlMinor(component.principalBrlCents)} + taxa {formatBrlMinor(component.feeBrlCents)}</p>)}</div>)}</details>}
  </Surface>;
}
