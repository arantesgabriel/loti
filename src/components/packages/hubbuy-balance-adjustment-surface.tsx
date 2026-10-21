"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { formatBrlMinor, formatCnyMinor, parseFinancialMinor } from "@/lib/domain/financial-money";
import type { AdjustmentCommand, AdjustmentPreview, AdjustmentReversalCommand } from "@/lib/domain/hubbuy-balance-adjustments";
import { costRequest } from "./package-cost-client";

type Pending = { command: AdjustmentCommand | AdjustmentReversalCommand; reverse: boolean };
const localNow = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const moneyInput = (minor: number) => (minor / 100).toFixed(2).replace(".", ",");

export function HubBuyBalanceAdjustmentSurface({ account, workspaceId, actorId, members, reversal, onClose, onRefresh }: {
  account: { id: string; label: string; revision: number }; workspaceId: string; actorId: string;
  members: { id: string; name: string }[]; reversal?: { id: string; reason: string | null };
  onClose: () => void; onRefresh: () => Promise<void>;
}) {
  const storageKey = `loti.hubbuy.adjustment:${actorId}:${workspaceId}:${account.id}`;
  const [pending, setPending] = useState<Pending | null>(() => {
    try { const value = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as Pending | null; return value?.command?.idempotencyKey && typeof value.reverse === "boolean" ? value : null; } catch { return null; }
  });
  const [kind, setKind] = useState<AdjustmentCommand["kind"]>("promotional_bonus");
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(localNow);
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [shares, setShares] = useState<Record<string, { cny: string; brl: string }>>({});
  const [preview, setPreview] = useState<AdjustmentPreview | null>(null);
  const [prepared, setPrepared] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  function invalidate() { setPreview(null); setPrepared(null); setConfirmed(false); setError(null); }
  function clearPending() { setPending(null); try { sessionStorage.removeItem(storageKey); } catch { /* Storage unavailable: the in-memory key still protects retries. */ } }

  async function confirm(value: Pending) {
    if (busy) return;
    // Persist before sending; the exact command/key is retained after an uncertain response.
    try { sessionStorage.setItem(storageKey, JSON.stringify(value)); }
    catch { setError("Não foi possível guardar a tentativa neste navegador. Libere o armazenamento da sessão antes de confirmar."); return; }
    setPending(value); setBusy(true); setError(null);
    const result = await costRequest(`/api/hubbuy/accounts/${account.id}`, { operation: value.reverse ? "adjustment.reverse" : "adjustment.record", ...value.command });
    setBusy(false);
    if (!result.ok) {
      setError(result.status === 0 || result.status >= 500 ? "A confirmação ficou incerta. Confira a tentativa pendente para evitar um lançamento duplicado." : result.error ?? "Não foi possível confirmar.");
      if (result.status >= 400 && result.status < 500) { clearPending(); invalidate(); setError(result.error ?? "Confira uma nova prévia."); await onRefresh(); }
      return;
    }
    clearPending();
    toast.success(value.reverse ? "Ajuste anulado; histórico preservado." : "Ajuste registrado no saldo HubBuy.");
    await onRefresh(); onClose();
  }
  async function requestPreview(event: React.FormEvent) {
    event.preventDefault(); if (busy || pending) return;
    setError(null);
    try {
      const common = { expectedRevision: account.revision, idempotencyKey: crypto.randomUUID(), occurredAt: new Date(occurredAt).toISOString(), reason: reason.trim() };
      let command: Pending["command"];
      if (reversal) command = { ...common, adjustmentId: reversal.id };
      else {
        const amountCnyMinor = parseFinancialMinor(amount, "CNY");
        const parts = Object.entries(shares).map(([personId, row]) => {
          const amountCnyMinor = parseFinancialMinor(row.cny, "CNY");
          if (amountCnyMinor === null || amountCnyMinor <= 0) throw new Error("Informe uma parcela CNY positiva para cada pessoa selecionada.");
          const basis = kind === "documented_credit" ? parseFinancialMinor(row.brl, "BRL") : 0;
          if (basis === null) throw new Error("Informe a base histórica BRL de cada parcela, inclusive zero quando comprovado.");
          return { personId, amountCnyMinor, ...(kind === "documented_credit" ? { historicalBrlCents: basis } : {}) };
        });
        if (!amountCnyMinor || !parts.length) throw new Error("Informe o valor e escolha os titulares do ajuste.");
        command = { ...common, kind, amountCnyMinor, externalReference: reference.trim() || null, shares: parts } as AdjustmentCommand;
      }
      const value = { command, reverse: !!reversal };
      setBusy(true);
      const result = await costRequest<AdjustmentPreview>(`/api/hubbuy/accounts/${account.id}`, { operation: reversal ? "adjustment.reversal.preview" : "adjustment.preview", ...command });
      if (!result.ok || !result.data) { setError(result.error ?? "Não foi possível conferir a prévia."); if (result.status === 409) await onRefresh(); return; }
      setPreview(result.data); setPrepared(value); setConfirmed(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Confira os valores."); }
    finally { setBusy(false); }
  }
  function divideEqually() {
    try {
      const value = parseFinancialMinor(amount, "CNY"), people = Object.keys(shares).sort();
      if (!value || !people.length || value < people.length) throw new Error("Escolha as pessoas e um valor que permita pelo menos ¥0,01 para cada uma.");
      invalidate(); setShares(Object.fromEntries(people.map((id, index) => [id, { ...shares[id], cny: moneyInput(Math.floor(value / people.length) + (index < value % people.length ? 1 : 0)) }])));
    } catch (cause) { setError((cause as Error).message); }
  }
  function distributionLabel() {
    try {
      const total = Object.values(shares).reduce((sum, row) => sum + BigInt(parseFinancialMinor(row.cny, "CNY") ?? 0), 0n);
      const target = parseFinancialMinor(amount, "CNY");
      if (total > 1_000_000_000_000n) return "Revise os valores das parcelas.";
      return `${formatCnyMinor(Number(total))} distribuídos${target === null ? "" : ` de ${formatCnyMinor(target)}`}`;
    } catch { return "Confira os valores das parcelas."; }
  }
  return <Surface sheet open className="hubbuy-adjustment-sheet" title={reversal ? "Anular ajuste manual" : "Registrar crédito/ajuste"} subtitle={account.label} description="Registre uma movimentação já ocorrida na HubBuy." onOpenChange={open => { if (!open && !busy) onClose(); }}>
    {pending ? <section className="hubbuy-adjustment-form">
      <div className="hubbuy-adjustment-section"><h3>Tentativa pendente</h3><p className="muted">Confira o registro anterior para recuperar o resultado sem duplicar o lançamento.</p><p>{pending.command.reason}</p></div>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="form-actions hubbuy-adjustment-actions"><Button variant="outline" disabled={busy} onClick={onClose}>Fechar</Button><Button disabled={busy} onClick={() => void confirm(pending)}>{busy ? "Conferindo…" : "Conferir registro pendente"}</Button></div>
    </section> : <form className="hubbuy-adjustment-form" onSubmit={event => void requestPreview(event)}>
      <fieldset className="hubbuy-adjustment-fields" disabled={busy} onChange={invalidate}>
        {reversal ? <div className="hubbuy-adjustment-note"><strong>{reversal.reason ?? "Ajuste manual"}</strong><p>A anulação registra o movimento oposto e preserva o histórico. Você poderá registrar um novo ajuste depois.</p></div> : <>
          <section className="hubbuy-adjustment-section" aria-label="Movimentação">
            <label>Natureza
              <select value={kind} onChange={event => setKind(event.target.value as AdjustmentCommand["kind"])}>
                <option value="promotional_bonus">Bônus promocional</option><option value="documented_credit">Outro crédito documentado</option><option value="documented_debit">Ajuste de saída documentado</option>
              </select>
            </label>
            <label>Valor CNY
              <span className="hubbuy-adjustment-amount"><span aria-hidden="true">¥</span><input required aria-label="Valor CNY" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0,00"/></span>
            </label>
            <p className="hubbuy-adjustment-help">{kind === "promotional_bonus" ? "Base histórica R$0,00. Este bônus não teve desembolso em reais." : kind === "documented_debit" ? "A saída baixa o saldo das pessoas escolhidas e não aumenta o custo dos produtos." : "Informe uma base em reais comprovada. Use o fluxo próprio para reembolsos, pedidos e recargas."}</p>
          </section>
          <fieldset className="hubbuy-adjustment-people hubbuy-adjustment-section">
            <legend>{kind === "documented_debit" ? "Direitos a baixar" : "Titulares do crédito"}</legend>
            <div className="hubbuy-adjustment-people-heading"><p className="hubbuy-adjustment-help">{kind === "documented_debit" ? "Selecione de quem será retirado o valor." : "Selecione quem fica com o crédito."}</p><Button type="button" variant="ghost" size="sm" disabled={!Object.keys(shares).length} onClick={divideEqually}>Dividir CNY igualmente</Button></div>
            <div className="hubbuy-adjustment-people-list">
              {members.map(member => <div key={member.id} className={`hubbuy-adjustment-person${shares[member.id] ? " is-selected" : ""}`}>
                <label className="hubbuy-adjustment-person-choice">
                  <input className="hubbuy-adjustment-check" type="checkbox" checked={!!shares[member.id]} onChange={event => setShares(current => {
                    const next = { ...current };
                    if (event.target.checked) next[member.id] = { cny: Object.keys(current).length === 0 ? amount : "", brl: "" }; else delete next[member.id];
                    return next;
                  })}/>
                  <span>{member.name}</span>
                </label>
                {shares[member.id] && <div className="hubbuy-adjustment-values">
                  <label>Parcela CNY<input required aria-label={`Parcela CNY · ${member.name}`} inputMode="decimal" value={shares[member.id].cny} onChange={event => setShares(current => ({ ...current, [member.id]: { ...current[member.id], cny: event.target.value } }))}/></label>
                  {kind === "documented_credit" && <label>Base histórica BRL<input required aria-label={`Base BRL · ${member.name}`} inputMode="decimal" value={shares[member.id].brl} onChange={event => setShares(current => ({ ...current, [member.id]: { ...current[member.id], brl: event.target.value } }))}/></label>}
                </div>}
              </div>)}
            </div>
            <p className="hubbuy-adjustment-distribution" aria-live="polite">{Object.keys(shares).length ? distributionLabel() : "Nenhuma pessoa selecionada."}</p>
          </fieldset>
        </>}
        <section className="hubbuy-adjustment-section hubbuy-adjustment-registration" aria-label="Registro da movimentação">
          <h3>Registro da movimentação</h3>
          <label>Motivo<textarea required maxLength={1000} rows={2} value={reason} onChange={event => setReason(event.target.value)} placeholder={kind === "promotional_bonus" && !reversal ? "Bônus da roleta HubBuy" : "Explique a movimentação comprovada"}/></label>
          {!reversal && <label>Referência externa (opcional)<input maxLength={200} value={reference} onChange={event => setReference(event.target.value)} placeholder="Identificador da transação HubBuy"/></label>}
          <label>Data e hora da ocorrência<input required type="datetime-local" value={occurredAt} onChange={event => setOccurredAt(event.target.value)}/></label>
          <p className="hubbuy-adjustment-help">Fuso: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Confira o horário do comprovante.</p>
        </section>
      </fieldset>
      {preview && prepared && <section className="hubbuy-adjustment-preview" aria-label="Prévia do ajuste">
        <h3>Confira antes de confirmar</h3>
        <p className="hubbuy-adjustment-help">Este registro atualiza o saldo do Loti. Não movimenta dinheiro na HubBuy.</p>
        <dl><div><dt>Saldo anterior</dt><dd>{formatCnyMinor(preview.balanceBeforeCnyMinor)}</dd></div><div><dt>{preview.direction === "credit" ? "Entrada" : "Saída"}</dt><dd>{formatCnyMinor(preview.amountCnyMinor)}</dd></div><div className="hubbuy-adjustment-result"><dt>Saldo após</dt><dd>{formatCnyMinor(preview.balanceAfterCnyMinor)}</dd></div><div><dt>Base histórica {preview.direction === "debit" ? "baixada" : "registrada"}</dt><dd>{formatBrlMinor(preview.historicalBrlCents)}</dd></div></dl>
        <ul>{preview.shares.map(row => <li key={row.personId}><span>{members.find(member => member.id === row.personId)?.name ?? "Membro"}</span><strong>{formatCnyMinor(row.amountCnyMinor)}<small>{formatBrlMinor(row.historicalBrlCents)} de base</small></strong></li>)}</ul>
        <p className="hubbuy-adjustment-help">{preview.reason}<br/>{new Date(preview.occurredAt).toLocaleString("pt-BR")}{preview.externalReference ? ` · ${preview.externalReference}` : ""}</p>
        <label className="hubbuy-adjustment-agreement"><input className="hubbuy-adjustment-check" type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>Confirmo os valores e as pessoas afetadas.</span></label>
      </section>}
      {error && <p role="alert" className="error">{error}</p>}
      <div className="form-actions hubbuy-adjustment-actions">
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
        {preview && prepared ? <Button type="button" disabled={busy || !confirmed} onClick={() => void confirm(prepared)}>{reversal ? "Confirmar anulação" : "Confirmar registro"}</Button> : <Button type="submit" disabled={busy}>{busy ? "Conferindo…" : "Conferir prévia"}</Button>}
      </div>
    </form>}
  </Surface>;
}
