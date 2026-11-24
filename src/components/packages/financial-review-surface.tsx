"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { useWorkspace } from "@/components/workspace-provider";
import { formatBrlMinor, formatCnyMinor, parseFinancialMinor } from "@/lib/domain/financial-money";
import { costRequest } from "./package-cost-client";
import "./financial-forms.css";

export const moneyValue = (value: string, currency: "CNY" | "BRL") => {
  const amount = parseFinancialMinor(value, currency);
  if (amount === null) throw new Error(`Informe o valor em ${currency}, inclusive zero quando aplicável.`);
  return amount;
};
export const localOccurrence = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
export const inputMoney = (value: number) => `${Math.floor(value / 100)},${String(value % 100).padStart(2, "0")}`;
export const signedMoney = (value: number, currency: "BRL" | "CNY") => `${value < 0 ? "−" : ""}${currency === "BRL" ? formatBrlMinor(Math.abs(value)) : formatCnyMinor(Math.abs(value))}`;
export function MoneyField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label>{label}<input inputMode="decimal" value={value} onChange={event => onChange(event.target.value)} placeholder="0,00" required /></label>;
}
type Review = { content?:{labels?:Record<string,string>}; people?:{personId:string;equivalentMicrounits:number;obligationNativeMinor:number;ownFundingNativeMinor:number;feeDueBrlCents:number;feeFundedBrlCents:number}[]; cnyMinor?: number; nativeMinor?: number; nativeCurrency?: "CNY" | "BRL"; principalBrlCents?: number; feeBrlCents?: number; totalBrlCents?: number; historicalCostBrlCents?: number; balanceBeforeCnyMinor?: number; balanceAfterCnyMinor?: number; amountBrlCents?: number; allocatedBrlCents?: number; excessBrlCents?: number; restoredCnyMinor?: number; reopenedBrlCents?: number; claims?: { debtorId: string; creditorId: string; currency: "BRL" | "CNY"; amountMinor: number }[]; crosses?: { funderId: string; beneficiaryId: string; amountMinor: number; component: string }[]; fees?: { topupId: string; amountBrlCents: number; remainingBrlCents: number }[]; provisional?: boolean; allocations?: {component:string;allocations:{costItemId:string;unitIndex:number;personId:string;amountMinor:number}[]}[] };
export function FinancialReview({ value, members }: { value: Review; members: { id: string; name: string }[] }) {
  const person = (id: string) => members.find(row => row.id === id)?.name ?? "Participante";
  const facts: [string, string][] = [];
  if (value.cnyMinor !== undefined) facts.push(["CNY recebidos", formatCnyMinor(value.cnyMinor)]);
  if (value.nativeMinor !== undefined) facts.push(["Frete informado", value.nativeCurrency === "BRL" ? formatBrlMinor(value.nativeMinor) : formatCnyMinor(value.nativeMinor)]);
  if (value.principalBrlCents !== undefined) facts.push(["Principal / base histórica BRL", formatBrlMinor(value.principalBrlCents)]);
  if (value.feeBrlCents !== undefined) facts.push(["Taxa atribuída", formatBrlMinor(value.feeBrlCents)]);
  if (value.totalBrlCents !== undefined) facts.push(["Total do comprovante", formatBrlMinor(value.totalBrlCents)]);
  if (value.historicalCostBrlCents !== undefined) facts.push(["Custo histórico do frete", formatBrlMinor(value.historicalCostBrlCents)]);
  if (value.balanceBeforeCnyMinor !== undefined) facts.push(["Saldo antes", formatCnyMinor(value.balanceBeforeCnyMinor)]);
  if (value.balanceAfterCnyMinor !== undefined) facts.push(["Saldo depois", formatCnyMinor(value.balanceAfterCnyMinor)]);
  if (value.amountBrlCents !== undefined) facts.push(["Transferência registrada", formatBrlMinor(value.amountBrlCents)]);
  if (value.allocatedBrlCents !== undefined) facts.push(["Baixa em obrigações", formatBrlMinor(value.allocatedBrlCents)]);
  if (value.excessBrlCents !== undefined) facts.push(["Crédito a devolver", formatBrlMinor(value.excessBrlCents)]);
  if (value.restoredCnyMinor !== undefined) facts.push(["Saldo restaurado por anulação", formatCnyMinor(value.restoredCnyMinor)]);
  if (value.reopenedBrlCents !== undefined) facts.push(["Valor reaberto", formatBrlMinor(value.reopenedBrlCents)]);
  return <div className="financial-review" aria-live="polite"><h3>Confira antes de confirmar</h3>
    {value.provisional && <p className="muted">Conteúdo aberto: o pagamento será preservado, mas o rateio deverá ser conferido após o fechamento.</p>}
    <dl>{facts.map(([label, amount]) => <div key={label}><dt>{label}</dt><dd>{amount}</dd></div>)}</dl>
    {value.fees?.length ? <section><h4>Taxas das recargas</h4>{value.fees.map(row => <p key={row.topupId}>Atribuir {formatBrlMinor(row.amountBrlCents)} · restante {formatBrlMinor(row.remainingBrlCents)}</p>)}</section> : null}
    {value.crosses?.length ? <details><summary>Financiamentos entre participantes</summary><ul>{value.crosses.map((row, index) => <li key={index}>{person(row.funderId)} financia {person(row.beneficiaryId)}: {row.component === "native" && value.nativeCurrency !== "BRL" ? formatCnyMinor(row.amountMinor) : formatBrlMinor(row.amountMinor)}</li>)}</ul></details> : null}
    {value.people&&<details><summary>Posição de cada participante</summary>{value.people.map(row=><section key={row.personId}><h4>{person(row.personId)}</h4><p>Equivalência financeira: {(row.equivalentMicrounits/1000000).toLocaleString("pt-BR",{maximumFractionDigits:3})} unidades.</p><dl><div><dt>Obrigação do frete</dt><dd>{value.nativeCurrency==="BRL"?formatBrlMinor(row.obligationNativeMinor):formatCnyMinor(row.obligationNativeMinor)}</dd></div><div><dt>Financiamento próprio</dt><dd>{value.nativeCurrency==="BRL"?formatBrlMinor(row.ownFundingNativeMinor):formatCnyMinor(row.ownFundingNativeMinor)}</dd></div><div><dt>Posição principal</dt><dd>{signedMoney(row.obligationNativeMinor-row.ownFundingNativeMinor,value.nativeCurrency??"CNY")}</dd></div><div><dt>Taxa devida / financiada</dt><dd>{formatBrlMinor(row.feeDueBrlCents)} / {formatBrlMinor(row.feeFundedBrlCents)}</dd></div></dl></section>)}</details>}
    {value.claims && <section><h4>Valores a acertar</h4>{value.claims.length ? <ul>{value.claims.map((row, index) => <li key={index}>{person(row.debtorId)} paga {row.currency === "CNY" ? formatCnyMinor(row.amountMinor) : formatBrlMinor(row.amountMinor)} a {person(row.creditorId)}</li>)}</ul> : <p>Nenhuma obrigação em aberto nesta versão.</p>}</section>}
    {value.allocations && <details><summary>Cálculo por unidade e participante</summary><p className="muted">Cada unidade física conta uma vez. A parcela compartilhada segue os pesos preservados do produto.</p>{value.allocations.map(group=><section key={group.component}><h4>{group.component==="native"?"Obrigação nativa":group.component==="fee"?"Taxa BRL":"Base histórica BRL"}</h4><ul>{group.allocations.map((row,index)=><li key={index}>{value.content?.labels?.[row.costItemId]??"Produto"} · unidade {row.unitIndex+1} · {person(row.personId)} · {group.component==="native" && value.nativeCurrency!=="BRL"?formatCnyMinor(row.amountMinor):formatBrlMinor(row.amountMinor)}</li>)}</ul></section>)}</details>}
  </div>;
}
export function FinancialReviewSurface({ title, description, url, previewOperation, confirmOperation, makeCommand, children, onClose, onRefresh, identity }: {
  title: string; description: string; url: string; previewOperation: string; confirmOperation: string; makeCommand: () => Record<string, unknown>;
  children: React.ReactNode; onClose: () => void; onRefresh: () => Promise<void>; identity: string;
}) {
  const { data, registerWorkspaceDraft } = useWorkspace();
  const key = `loti.finance:${data.currentUser.id}:${data.workspaceId}:${identity}:${confirmOperation}`;
  const [pending, setPending] = useState<Record<string, unknown> | null>(() => { try { return JSON.parse(sessionStorage.getItem(key) ?? "null"); } catch { return null; } });
  const [prepared, setPrepared] = useState<Record<string, unknown> | null>(null), [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [confirmed, setConfirmed] = useState(false);
  useEffect(() => registerWorkspaceDraft(`finance:${identity}`, true), [registerWorkspaceDraft, identity]);
  const invalidate = () => { setPrepared(null); setReview(null); setConfirmed(false); };
  const clearPending = () => { try { sessionStorage.removeItem(key); } catch { /* A stale saved command remains safe to replay. */ } setPending(null); };
  async function preview(event: React.FormEvent) {
    event.preventDefault(); if (busy || pending) return;
    try {
      setError(""); setBusy(true);
      const command = { ...makeCommand(), idempotencyKey: crypto.randomUUID() };
      const response = await costRequest<Review>(url, { operation: previewOperation, command }, data.workspaceId);
      if (!response.ok || !response.data) { invalidate(); setError(response.error ?? "Não foi possível conferir."); if (response.status === 409) await onRefresh(); return; }
      setPrepared(command); setReview(response.data); setConfirmed(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Confira os campos."); }
    finally { setBusy(false); }
  }
  async function confirm(command: Record<string, unknown>) {
    if (busy) return;
    try { sessionStorage.setItem(key, JSON.stringify(command)); } catch { setError("Libere o armazenamento da sessão para guardar a tentativa e recuperar uma resposta perdida."); return; }
    setPending(command); setBusy(true); setError("");
    const response = await costRequest(url, { operation: confirmOperation, command }, data.workspaceId);
    setBusy(false);
    if (!response.ok) {
      if (response.status >= 400 && response.status < 500) { clearPending(); invalidate(); await onRefresh(); setError(response.error ?? "Confira uma nova prévia."); }
      else setError("A resposta ficou incerta. Confira a mesma tentativa abaixo antes de iniciar outra.");
      return;
    }
    clearPending(); await onRefresh(); onClose();
  }
  return <Surface sheet open title={title} description={description} onOpenChange={open => { if (!open && !busy) onClose(); }} className="financial-sheet">
    {pending ? <section className="financial-form"><h3>Tentativa pendente</h3><p>O registro pode ter sido confirmado. Recuperar esta tentativa usa os mesmos dados e evita duplicação.</p>{error && <p role="alert" className="error">{error}</p>}<Button disabled={busy} onClick={() => void confirm(pending)}>{busy ? "Conferindo…" : "Conferir tentativa pendente"}</Button></section> : <form className="financial-form" onSubmit={event => void preview(event)}>
      <fieldset disabled={busy} onChange={invalidate} onClick={event=>{if((event.target as HTMLElement).closest("button"))invalidate();}}>{children}</fieldset>
      {error && <p role="alert" className="error">{error}</p>}
      {review && <><FinancialReview value={review} members={data.members} /><label className="financial-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Conferi os valores, participantes e efeitos deste registro.</label></>}
      <div className="form-actions"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>{prepared && confirmed ? <Button type="button" disabled={busy} onClick={() => void confirm(prepared)}>{busy ? "Registrando…" : "Confirmar registro"}</Button> : <Button type="submit" disabled={busy}>{busy ? "Conferindo…" : "Conferir prévia"}</Button>}</div>
    </form>}
  </Surface>;
}
