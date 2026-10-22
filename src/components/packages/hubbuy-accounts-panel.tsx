"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Archive, ArrowDown, ArrowUp, ChevronDown, ChevronRight, Coins, Info, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Confirm, Surface } from "@/components/ui/surface";
import type { CostTrackingView } from "@/lib/domain/package-cost-reading";
import { formatBrlMinor, formatCnyMinor, parseFinancialMinor } from "@/lib/domain/financial-money";
import { costRequest } from "./package-cost-client";
import type { IndividualRight } from "@/lib/domain/hubbuy-rights-presentation";
import { HubBuyIndividualRights } from "./hubbuy-individual-rights";
import type { PersonBalanceHistory } from "@/lib/domain/hubbuy-balance-traceability";
import { HubBuyBalanceAdjustmentSurface } from "./hubbuy-balance-adjustment-surface";
import type { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import "./hubbuy-accounts.css";

type Detail = CostTrackingView;
type Account = Detail["hubbuyAccounts"][number] & { canActivateWithZero?: boolean; canDelete?: boolean; canDiscardIncorrectRegistration?: boolean; deletionBlockReason?: string | null };
type AccountBalance = { account: Account; ledgerBalanceCnyMinor: number; reconciled: boolean; rights: IndividualRight[]; traceability: PersonBalanceHistory[]; reconciliation: null | { mode: "chronological" | "remainder"; priorActivityDescription: string | null; priorActivityOccurredAt: Date | null; events: { id: string; eventType: "legacy_receipt" | "synthetic_use"; description: string; sourceReference: string | null; amountCnyMinor: number; historicalBrlCents: number; occurredAt: Date; recordedAt: Date | null }[] } };
type Statement = Awaited<ReturnType<ReturnType<typeof hubbuyBalanceServices>["readStatement"]>>;
const localDateTime = () => { const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000); return date.toISOString().slice(0, 16); };
const formatBrlCents = formatBrlMinor;

export function HubBuyAccountsPanel({ workspaceId, actorId, members, initialAccounts }: { workspaceId: string; actorId: string; members: { id: string; name: string }[]; initialAccounts: Account[] }) {
  const [adjustmentDraft, setAdjustmentDraft] = useState<{ accountId: string; reversal?: { id: string; reason: string | null } } | null>(null);
  const [statementDetail, setStatementDetail] = useState<Statement["entries"][number] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(initialAccounts[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [balanceErrors, setBalanceErrors] = useState<Record<string, string | null>>({});
  const [statementErrors, setStatementErrors] = useState<Record<string, string | null>>({});
  const [balanceLoading, setBalanceLoading] = useState<Record<string, boolean>>({});
  const [statementLoading, setStatementLoading] = useState<Record<string, boolean>>({});
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [observed, setObserved] = useState("");
  const [reason, setReason] = useState("");
  const [shares, setShares] = useState<Record<string, { cny: string; brl: string }>>({});
  const [reconciliationModes, setReconciliationModes] = useState<Record<string, "remainder" | "chronological">>({});
  const [priorDate, setPriorDate] = useState("");
  const [eventType, setEventType] = useState<"legacy_receipt" | "synthetic_use">("legacy_receipt");
  const [eventDescription, setEventDescription] = useState("");
  const [eventReference, setEventReference] = useState("");
  const [eventAmount, setEventAmount] = useState("");
  const [eventOccurredAt, setEventOccurredAt] = useState(localDateTime());
  const [balances, setBalances] = useState<Record<string, AccountBalance>>({});
  const [statements, setStatements] = useState<Record<string, Statement>>({});
  const [zeroActivation, setZeroActivation] = useState<Account | null>(null);
  const [zeroConfirmed, setZeroConfirmed] = useState(false);
  const [archiveDraft, setArchiveDraft] = useState<Account | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [deleteDraft, setDeleteDraft] = useState<{ account: Account; reason: string; idempotencyKey: string; discard?: boolean } | null>(null);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const createInput = useRef<HTMLInputElement>(null);
  const actionsTrigger = useRef<HTMLButtonElement>(null);
  const menuAction = useRef<(() => void) | null>(null);

  async function refreshAccounts() {
    const result = await costRequest<Account[]>(`/api/hubbuy/accounts?workspaceId=${encodeURIComponent(workspaceId)}`);
    if (result.ok && result.data) setAccounts(result.data);
  }

  const loadBalance = useCallback(async (accountId: string) => {
    setBalanceLoading(current => ({ ...current, [accountId]: true }));
    setBalanceErrors(current => ({ ...current, [accountId]: null }));
    const result = await costRequest<AccountBalance>(`/api/hubbuy/accounts/${encodeURIComponent(accountId)}`);
    if (result.ok && result.data) setBalances(current => ({ ...current, [accountId]: result.data! }));
    else setBalanceErrors(current => ({ ...current, [accountId]: result.error ?? "Não foi possível carregar os direitos da conta." }));
    setBalanceLoading(current => ({ ...current, [accountId]: false }));
    return result.data ?? null;
  }, []);

  const loadStatement = useCallback(async (accountId: string, afterSequence?: number) => {
    setStatementLoading(current => ({ ...current, [accountId]: true }));
    setStatementErrors(current => ({ ...current, [accountId]: null }));
    const query = new URLSearchParams({ limit: "10", ...(afterSequence === undefined ? {} : { afterSequence: String(afterSequence) }) });
    const result = await costRequest<Statement>(`/api/hubbuy/accounts/${encodeURIComponent(accountId)}/statement?${query}`);
    if (result.ok && result.data) setStatements(current => ({ ...current, [accountId]: { accountId, entries: [...(afterSequence === undefined ? [] : current[accountId]?.entries ?? []), ...result.data!.entries], nextAfterSequence: result.data!.nextAfterSequence } }));
    else setStatementErrors(current => ({ ...current, [accountId]: result.error ?? "Não foi possível carregar o extrato." }));
    setStatementLoading(current => ({ ...current, [accountId]: false }));
    return result.data ?? null;
  }, []);

  const selectedAccount = accounts.find(account => account.id === selectedAccountId) ?? accounts[0];
  const selectedId = selectedAccount?.id;
  const selectedRevision = selectedAccount?.revision;
  useEffect(() => {
    if (!selectedId) return;
    const request = setTimeout(() => {
      void loadBalance(selectedId);
      void loadStatement(selectedId);
    }, 0);
    return () => clearTimeout(request);
  }, [selectedId, selectedRevision, loadBalance, loadStatement]);

  function focusCreateAccount() {
    createInput.current?.scrollIntoView({ block: "center" });
    createInput.current?.focus({ preventScroll: true });
  }

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    if (!label.trim() || saving) return;
    setSaving(true);
    const result = await costRequest<{ accountId: string }>("/api/hubbuy/accounts", {
      operation: "createAccount", workspaceId, idempotencyKey: crypto.randomUUID(), label: label.trim(), confirmZeroBalance: true,
    });
    setSaving(false);
    if (!result.ok) { toast.error(result.error ?? "Não foi possível cadastrar a conta."); return; }
    setLabel("");
    setQuery("");
    await refreshAccounts();
    setSelectedAccountId(result.data?.accountId ?? null);
    toast.success("Conta criada · saldo ¥0");
  }

  async function activateAtZero(account: Account) {
    if (saving) return;
    setSaving(true);
    const result = await costRequest(`/api/hubbuy/accounts/${encodeURIComponent(account.id)}`, {
      operation: "activate.zero", expectedRevision: account.revision, idempotencyKey: crypto.randomUUID(), confirmedNoPriorBalance: true,
    });
    setSaving(false);
    if (!result.ok) { toast.error(result.error ?? "Não foi possível ativar esta conta com saldo zero."); return; }
    setZeroActivation(null);
    await refreshAccounts();
    await loadBalance(account.id);
    toast.success("Conta ativada com saldo ¥0.");
  }

  async function archiveAccount(account: Account) {
    if (saving || !archiveReason.trim()) return;
    setSaving(true);
    const result = await costRequest(`/api/hubbuy/accounts/${encodeURIComponent(account.id)}`, {
      operation: "archive", expectedRevision: account.revision, idempotencyKey: crypto.randomUUID(), reason: archiveReason.trim(),
    });
    setSaving(false);
    if (!result.ok) { toast.error(result.error ?? "Não foi possível arquivar esta conta."); return; }
    setArchiveDraft(null); setArchiveReason("");
    await refreshAccounts();
    toast.success("Conta arquivada.");
  }

  async function deleteAccount() {
    if (saving || !deleteDraft?.reason.trim() || (deleteDraft.discard && !deleteConfirmed)) return;
    const { account, reason, idempotencyKey } = deleteDraft;
    setSaving(true); setDeleteError(null);
    const result = await costRequest(`/api/hubbuy/accounts/${encodeURIComponent(account.id)}`, {
      operation: deleteDraft.discard ? "discard.incorrect" : "delete", expectedRevision: account.revision, idempotencyKey, reason: reason.trim(),
      ...(deleteDraft.discard ? { confirmedIncorrectRegistration: true } : {}),
    });
    setSaving(false);
    if (!result.ok) {
      setDeleteError(result.error ?? "Não foi possível excluir este cadastro.");
      if (result.status === 409) {
        await refreshAccounts();
        setDeleteDraft(null);
        toast.error(result.error ?? "A conta mudou. Confira os dados antes de tentar novamente.");
      }
      return;
    }
    setAccounts(current => current.filter(row => row.id !== account.id));
    setSelectedAccountId(null); setReconcilingId(null);
    setBalances(current => { const next = { ...current }; delete next[account.id]; return next; });
    setStatements(current => { const next = { ...current }; delete next[account.id]; return next; });
    setShares(current => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${account.id}:`))));
    setReconciliationModes(current => { const next = { ...current }; delete next[account.id]; return next; });
    setObserved(""); setReason(""); setPriorDate(""); setEventDescription(""); setEventReference(""); setEventAmount("");
    setDeleteDraft(null);
    await refreshAccounts();
    setTimeout(() => createInput.current?.focus(), 0);
    toast.success("Cadastro excluído do Loti.");
  }

  async function reconcile(event: React.FormEvent, account: Account) {
    event.preventDefault();
    if (saving) return;
    try {
      const observedCny = parseFinancialMinor(observed, "CNY");
      if (observedCny === null) throw new Error("Informe o saldo CNY conferido.");
      if (!reason.trim()) throw new Error("Informe como este saldo foi conferido.");
      const currentBalance = await loadBalance(account.id);
      const mode = currentBalance?.reconciliation?.mode ?? reconciliationModes[account.id] ?? "remainder";
      const normalizedShares = mode === "chronological" ? (currentBalance?.rights ?? []).filter(row => row.availableCnyMinor > 0).map(row => ({ personId: row.personId, amountCnyMinor: row.availableCnyMinor, historicalBrlCents: row.availableHistoricalBrlCents })) : members.flatMap(member => {
        const row = shares[`${account.id}:${member.id}`];
        const cny = row?.cny ? parseFinancialMinor(row.cny, "CNY") : null;
        const brl = row?.brl ? parseFinancialMinor(row.brl, "BRL") : null;
        if (cny === null || cny === 0) return [];
        if (brl === null) throw new Error(`Informe a base histórica BRL de ${member.name}.`);
        return [{ personId: member.id, amountCnyMinor: cny, historicalBrlCents: brl }];
      });
      if (normalizedShares.reduce((sum, row) => sum + BigInt(row.amountCnyMinor), 0n) !== BigInt(observedCny)) throw new Error("A soma dos direitos CNY individuais precisa fechar exatamente o saldo conferido.");
      setSaving(true);
      const result = await costRequest(`/api/hubbuy/accounts/${encodeURIComponent(account.id)}`, {
        operation: "reconcile", expectedRevision: currentBalance?.account.revision ?? account.revision, idempotencyKey: crypto.randomUUID(),
        mode, priorActivityDescription: mode === "remainder" ? reason.trim() : null,
        priorActivityOccurredAt: mode === "remainder" && priorDate ? new Date(`${priorDate}T12:00:00-03:00`).toISOString() : null,
        observedBalanceCnyMinor: observedCny, reason: reason.trim(), shares: normalizedShares,
      });
      setSaving(false);
      if (!result.ok) { toast.error(result.error ?? "Não foi possível concluir a conciliação."); return; }
      setReconcilingId(null); setObserved(""); setReason("");
      await refreshAccounts();
      toast.success("Conta conciliada e ativada.");
    } catch (error) {
      setSaving(false);
      toast.error(error instanceof Error ? error.message : "Confira os valores informados.");
    }
  }

  async function beginChronological(account: Account) {
    if (saving) return;
    setSaving(true);
    const result = await costRequest(`/api/hubbuy/accounts/${encodeURIComponent(account.id)}`, { operation: "reconcile.start", mode: "chronological", expectedRevision: balances[account.id]?.account.revision ?? account.revision, idempotencyKey: crypto.randomUUID() });
    setSaving(false);
    if (!result.ok) { toast.error(result.error ?? "Não foi possível iniciar a reconstrução."); return; }
    setReconciliationModes(current => ({ ...current, [account.id]: "chronological" }));
    await loadBalance(account.id); await refreshAccounts();
    toast.success("Reconstrução cronológica iniciada. Registre os recebimentos e usos conhecidos em ordem de data.");
  }

  async function recordEvent(event: React.FormEvent, account: Account) {
    event.preventDefault();
    if (saving) return;
    try {
      const amountCny = parseFinancialMinor(eventAmount, "CNY");
      if (amountCny === null || amountCny < 1) throw new Error("Informe o valor CNY do evento.");
      if (!eventDescription.trim() || !eventOccurredAt) throw new Error("Informe descrição e data real do evento.");
      const eventShares = eventType === "legacy_receipt" ? members.flatMap(member => {
        const row = shares[`${account.id}:${member.id}`];
        const cny = row?.cny ? parseFinancialMinor(row.cny, "CNY") : null;
        const brl = row?.brl ? parseFinancialMinor(row.brl, "BRL") : null;
        if (cny === null || cny === 0) return [];
        if (brl === null) throw new Error(`Informe a base histórica BRL de ${member.name}.`);
        return [{ personId: member.id, amountCnyMinor: cny, historicalBrlCents: brl }];
      }) : [];
      if (eventType === "legacy_receipt" && eventShares.reduce((sum, share) => sum + BigInt(share.amountCnyMinor), 0n) !== BigInt(amountCny)) throw new Error("Os direitos individuais precisam somar o recebimento CNY.");
      setSaving(true);
      const result = await costRequest(`/api/hubbuy/accounts/${encodeURIComponent(account.id)}`, {
        operation: "reconcile.event", expectedRevision: balances[account.id]?.account.revision ?? account.revision, idempotencyKey: crypto.randomUUID(),
        eventType, description: eventDescription.trim(), sourceReference: eventReference.trim() || null,
        occurredAt: new Date(eventOccurredAt).toISOString(), amountCnyMinor: amountCny, shares: eventShares,
      });
      setSaving(false);
      if (!result.ok) { toast.error(result.error ?? "Não foi possível registrar o evento."); return; }
      setEventDescription(""); setEventReference(""); setEventAmount("");
      await loadBalance(account.id); await refreshAccounts();
      toast.success(eventType === "legacy_receipt" ? "Recebimento legado vinculado à conta." : "Uso sintético registrado e consumido em FIFO.");
    } catch (error) { setSaving(false); toast.error(error instanceof Error ? error.message : "Confira os dados do evento."); }
  }

  function shareFields(accountId: string) {
    return members.map(member => <div className="cost-account-share" key={member.id}><strong>{member.name}</strong><label>CNY<input inputMode="decimal" placeholder="0,00" value={shares[`${accountId}:${member.id}`]?.cny ?? ""} onChange={event => setShares(current => ({ ...current, [`${accountId}:${member.id}`]: { cny: event.target.value, brl: current[`${accountId}:${member.id}`]?.brl ?? "" } }))}/></label><label>Base BRL<input inputMode="decimal" placeholder="0,00" value={shares[`${accountId}:${member.id}`]?.brl ?? ""} onChange={event => setShares(current => ({ ...current, [`${accountId}:${member.id}`]: { cny: current[`${accountId}:${member.id}`]?.cny ?? "", brl: event.target.value } }))}/></label></div>);
  }

  const filteredAccounts = accounts.filter(account => `${account.label} ${account.email ?? ""}`.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR")));

  return <section className="hubbuy-workspace" aria-labelledby="hubbuy-accounts-title">
    <aside className="hubbuy-account-picker" aria-labelledby="hubbuy-accounts-title">
      <h2 id="hubbuy-accounts-title">Minhas contas</h2>
      <Button variant="soft" onClick={focusCreateAccount}><Plus size={17} aria-hidden="true"/>Adicionar conta</Button>
      <label className="hubbuy-account-search"><Search size={18} aria-hidden="true"/><span className="sr-only">Buscar conta</span><input type="search" placeholder="Buscar conta…" value={query} onChange={event => setQuery(event.target.value)}/></label>
      <label className="hubbuy-account-select">Conta selecionada<select value={selectedId ?? ""} disabled={saving || !accounts.length} onChange={event => setSelectedAccountId(event.target.value)}>{!accounts.length && <option value="">Nenhuma conta cadastrada</option>}{accounts.map(account => <option key={account.id} value={account.id}>{account.label} · {formatCnyMinor(account.balanceCnyMinor)}</option>)}</select></label>
      <nav className="hubbuy-account-list" aria-label="Contas HubBuy cadastradas">
        {filteredAccounts.map(account => <button type="button" key={account.id} className={`hubbuy-account-option ${selectedId === account.id ? "is-selected" : ""}`} aria-current={selectedId === account.id ? "true" : undefined} disabled={saving} onClick={() => setSelectedAccountId(account.id)}>
          <span className="hubbuy-account-avatar" aria-hidden="true">{account.label.trim().slice(0, 1).toUpperCase()}</span>
          <span className="hubbuy-account-option-copy"><strong>{account.label}</strong><small>Saldo: {formatCnyMinor(account.balanceCnyMinor)}</small><small>{account.status === "active" ? "Ativa" : account.status === "archived" ? "Arquivada" : "Aguardando conciliação"}</small></span>
          <ChevronRight size={16} aria-hidden="true"/>
        </button>)}
      </nav>
      {!filteredAccounts.length && <p className="muted hubbuy-picker-empty">{accounts.length ? "Nenhuma conta encontrada." : "Nenhuma conta HubBuy cadastrada."}</p>}
    </aside>
    <div className="hubbuy-account-content">
      {selectedAccount ? (() => {
        const account = selectedAccount;
        const balance = balances[account.id], run = balance?.reconciliation, mode = run?.mode ?? reconciliationModes[account.id] ?? "remainder";
        const statement = statements[account.id];
        const historicalBrl = balance?.rights.reduce((sum, right) => sum + right.availableHistoricalBrlCents, 0);
        const archiveAllowed = account.status === "active" && balance?.reconciled && balance.ledgerBalanceCnyMinor === 0;
        const adjustmentAllowed = account.status === "active" && balance?.reconciled && balance.account.revision === account.revision && !balanceErrors[account.id] && !balanceLoading[account.id];
        const hasActions = account.canDelete || account.canDiscardIncorrectRegistration || account.status === "reconciling" || archiveAllowed || adjustmentAllowed;
        return <div className="hubbuy-selected-account" key={account.id}>
          <article className="cost-hubbuy-account hubbuy-account-overview" aria-labelledby="hubbuy-selected-title">
            <header className="hubbuy-account-header">
              <span className="hubbuy-account-avatar hubbuy-account-avatar-large" aria-hidden="true">{account.label.trim().slice(0, 1).toUpperCase()}</span>
              <div className="hubbuy-account-identity"><h2 id="hubbuy-selected-title">{account.label}</h2><span className={`hubbuy-account-status status-${account.status}`}>{account.status === "active" ? adjustmentAllowed ? "Ativa e conciliada" : balanceErrors[account.id] ? "Conferência indisponível" : balanceLoading[account.id] || !balance ? "Conferindo saldo…" : "Saldo precisa de conferência" : account.status === "archived" ? "Arquivada" : "Aguardando conciliação"}</span><p className="muted">Conta HubBuy{account.email && account.email !== account.label ? ` · ${account.email}` : ""}</p></div>
              <DropdownMenu.Root><DropdownMenu.Trigger asChild><Button ref={actionsTrigger} variant="outline" size="sm" disabled={saving || !hasActions}>Ações<ChevronDown size={16} aria-hidden="true"/></Button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="dropdown hubbuy-actions-menu" align="end" sideOffset={6} onCloseAutoFocus={event => {
                if (!menuAction.current) return;
                event.preventDefault();
                actionsTrigger.current?.focus();
                const action = menuAction.current;
                menuAction.current = null;
                action();
              }}>
                {adjustmentAllowed && <DropdownMenu.Item onSelect={() => { menuAction.current = () => setAdjustmentDraft({ accountId: account.id }); }}><Plus size={16} aria-hidden="true"/>Registrar crédito/ajuste</DropdownMenu.Item>}
                {account.status === "reconciling" && <>
                  {account.canActivateWithZero && <DropdownMenu.Item onSelect={() => { menuAction.current = () => { setZeroConfirmed(false); setZeroActivation(account); }; }}>Ativar com saldo zero</DropdownMenu.Item>}
                  <DropdownMenu.Item onSelect={() => { menuAction.current = () => { setReconcilingId(account.id); setReconciliationModes(current => ({ ...current, [account.id]: run?.mode ?? "remainder" })); }; }}>Conciliar saldo que já existia</DropdownMenu.Item>
                </>}
                {archiveAllowed && <DropdownMenu.Item onSelect={() => { menuAction.current = () => { setArchiveReason(""); setArchiveDraft(account); }; }}><Archive size={16} aria-hidden="true"/>Arquivar conta</DropdownMenu.Item>}
                {account.canDelete && <DropdownMenu.Item className="danger-text" onSelect={() => { menuAction.current = () => { setDeleteError(null); setDeleteConfirmed(false); setDeleteDraft({ account, reason: "", idempotencyKey: crypto.randomUUID() }); }; }}><Trash2 size={16} aria-hidden="true"/>Excluir conta</DropdownMenu.Item>}
                {!account.canDelete && account.canDiscardIncorrectRegistration && <DropdownMenu.Item className="danger-text" onSelect={() => { menuAction.current = () => { setDeleteError(null); setDeleteConfirmed(false); setDeleteDraft({ account, reason: "", idempotencyKey: crypto.randomUUID(), discard: true }); }; }}><Trash2 size={16} aria-hidden="true"/>Corrigir cadastro e excluir</DropdownMenu.Item>}
              </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
            </header>
            <div className="hubbuy-balance-card">
              <svg className="hubbuy-balance-waves" viewBox="0 0 900 200" preserveAspectRatio="none" aria-hidden="true"><path d="M140 200C300 180 380 65 510 110S720-45 900 40V200Z"/><path d="M280 200C430 120 500 165 620 100S800 180 900 110V200Z"/></svg>
              <span className="hubbuy-balance-label">Saldo atual <span title="Saldo registrado no Loti. O valor em reais representa a base histórica dos direitos individuais."><Info size={15} aria-hidden="true"/></span></span>
              <strong className="hubbuy-balance-value">{formatCnyMinor(account.balanceCnyMinor)}</strong>
              <span className="hubbuy-balance-brl">{historicalBrl === undefined ? balanceErrors[account.id] ? "Base histórica indisponível" : "Carregando base histórica…" : formatBrlCents(historicalBrl)} <small>· base histórica</small></span>
              <span className="hubbuy-balance-symbol" aria-hidden="true"><Coins size={32} strokeWidth={1.5}/></span>
            </div>
            <HubBuyIndividualRights key={account.id} traceability={balance?.traceability} members={members} loading={!!balanceLoading[account.id]} failed={!!balanceErrors[account.id]} reconciled={!!balance?.reconciled && account.status !== "reconciling"}/>
            {balanceErrors[account.id] && <div className="hubbuy-load-error" role="alert"><p>{balanceErrors[account.id]}</p><Button size="sm" variant="outline" disabled={balanceLoading[account.id]} onClick={() => void loadBalance(account.id)}>Tentar novamente</Button></div>}
            {!account.canDelete && account.deletionBlockReason && <div className="hubbuy-account-notice"><Info size={19} aria-hidden="true"/><p>{account.deletionBlockReason}</p></div>}
            {account.status === "reconciling" && reconcilingId === account.id && <div className="cost-account-reconcile">
            <label>Modo de conciliação<select disabled={!!run || saving} value={mode} onChange={event => setReconciliationModes(current => ({ ...current, [account.id]: event.target.value as "remainder" | "chronological" }))}><option value="remainder">Abrir pelo saldo remanescente</option><option value="chronological">Reconstruir eventos cronológicos</option></select></label>
            {mode === "chronological" && !run && <div className="cost-account-reconcile-guide"><p className="muted">Registre os recebimentos antigos e os usos posteriores em ordem de data real. A conta só será ativada quando saldo e direitos individuais fecharem.</p><Button type="button" size="sm" disabled={saving} onClick={() => void beginChronological(account)}>Iniciar reconstrução cronológica</Button></div>}
            {mode === "chronological" && run?.mode === "chronological" && <>
              <form className="cost-account-event" onSubmit={event => void recordEvent(event, account)}>
                <strong>Registrar evento histórico</strong>
                <label>Tipo<select value={eventType} onChange={event => setEventType(event.target.value as "legacy_receipt" | "synthetic_use")}><option value="legacy_receipt">Recebimento legado de refund</option><option value="synthetic_use">Uso posterior da conta</option></select></label>
                <label>Descrição<input required maxLength={1000} value={eventDescription} onChange={event => setEventDescription(event.target.value)} placeholder={eventType === "legacy_receipt" ? "Refund antigo recebido" : "Pedido já pago fora do Loti"}/></label>
                {eventType === "legacy_receipt" && <label>Referência do refund legado<input maxLength={200} value={eventReference} onChange={event => setEventReference(event.target.value)} placeholder="ID do refund existente (opcional, único)"/></label>}
                <div className="cost-account-event-values"><label>Data real<input required type="datetime-local" value={eventOccurredAt} onChange={event => setEventOccurredAt(event.target.value)}/></label><label>Valor CNY<input required inputMode="decimal" value={eventAmount} onChange={event => setEventAmount(event.target.value)} placeholder="0,00"/></label></div>
                {eventType === "legacy_receipt" && <><p className="muted">Vincule o crédito ao refund já recebido e informe os direitos individuais e suas bases BRL antigas. Este registro não cria um novo abatimento BRL.</p>{shareFields(account.id)}</>}
                <Button type="submit" size="sm" disabled={saving}>{saving ? "Salvando…" : eventType === "legacy_receipt" ? "Vincular recebimento legado" : "Registrar uso e consumir FIFO"}</Button>
              </form>
              <div className="cost-account-reconcile-check"><strong>Conferência antes de ativar</strong><p>Ledger: {formatCnyMinor(balance?.ledgerBalanceCnyMinor ?? 0)} · {balance?.rights.map(right => `${members.find(member => member.id === right.personId)?.name ?? "Membro"}: ${formatCnyMinor(right.availableCnyMinor)} (${formatBrlCents(right.availableHistoricalBrlCents)})`).join(" · ") || "Sem direitos remanescentes"}</p>{run.events.length > 0 && <ol>{run.events.map(row => <li key={row.id}>{row.eventType === "legacy_receipt" ? "Recebimento legado" : "Uso posterior"} · {row.description} · {formatCnyMinor(row.amountCnyMinor)} · {new Date(row.occurredAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}{row.sourceReference ? ` · ${row.sourceReference}` : ""}</li>)}</ol>}</div>
            </>}
            {(mode === "remainder" || run?.mode === "chronological") && <form className="cost-account-reconcile-finalize" onSubmit={event => void reconcile(event, account)}>
              <label>Saldo CNY conferido<input inputMode="decimal" placeholder="0,00" value={observed} onChange={event => setObserved(event.target.value)}/></label>
              {mode === "remainder" ? <>
                <p className="muted">Use quando eventos anteriores já estiverem cobertos por uma conciliação fora do ledger. O registro de abertura será somente o remanescente informado.</p>
                {shareFields(account.id)}
                <label>Até quando os eventos anteriores estão cobertos?<input type="date" value={priorDate} onChange={event => setPriorDate(event.target.value)}/></label>
                <label>Quais eventos anteriores estão cobertos?<textarea required maxLength={1000} rows={2} value={reason} onChange={event => setReason(event.target.value)}/></label>
              </> : <><p className="muted">Saldo reconstruído: {formatCnyMinor(balance?.ledgerBalanceCnyMinor ?? 0)}. Direitos individuais são calculados dos eventos em FIFO.</p><label>Como o saldo e os direitos foram comparados?<textarea required maxLength={1000} rows={2} value={reason} onChange={event => setReason(event.target.value)}/></label></>}
              <div className="form-actions"><Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => setReconcilingId(null)}>Fechar</Button><Button type="submit" size="sm" disabled={saving}>{saving ? "Salvando…" : "Conciliar e ativar"}</Button></div>
            </form>}
          </div>}
          </article>
          <section className="hubbuy-statement" aria-labelledby="hubbuy-statement-title">
            <div className="hubbuy-section-heading"><div><h2 id="hubbuy-statement-title">Extrato da conta</h2><p className="muted">Movimentações registradas nessa conta.</p></div><span className="muted hubbuy-statement-order">Ordem dos registros</span></div>
            <div className="hubbuy-statement-scroll" role="region" aria-label="Movimentações da conta" tabIndex={0} aria-busy={!!statementLoading[account.id]}>
              <table><caption className="sr-only">Extrato de {account.label}. Valores em reais são bases históricas.</caption><thead><tr><th scope="col">Data</th><th scope="col">Tipo</th><th scope="col">Descrição</th><th scope="col">Valor (CNY)</th><th scope="col">Base (R$)</th><th scope="col">Saldo após</th></tr></thead><tbody>
                {statement?.entries.map(entry => <tr key={entry.id}>
                  <td className="hubbuy-entry-date"><time>{entry.occurredAt ?? entry.operationRecordedAt ? new Date(entry.occurredAt ?? entry.operationRecordedAt!).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Data não informada"}</time></td>
                  <td><span className={`hubbuy-entry-type ${entry.direction}`}>{entry.direction === "credit" ? <ArrowUp size={14} aria-hidden="true"/> : <ArrowDown size={14} aria-hidden="true"/>}{entry.adjustment?.kind === "promotional_bonus" ? "Bônus promocional" : entry.adjustment?.kind === "documented_credit" ? "Crédito manual" : entry.adjustment?.kind === "documented_debit" ? "Ajuste de saída" : entry.adjustment?.kind === "reversal" ? "Anulação de ajuste" : entry.direction === "credit" ? "Crédito" : "Uso"}</span></td>
                  <td>{entry.reason ?? (entry.sourceType === "opening_balance" ? "Abertura de saldo" : entry.sourceType === "refund_received" ? "Reembolso recebido" : entry.sourceType === "reversal" ? "Estorno" : "Movimentação da conta")}{entry.adjustment && <><small>{entry.adjustment.reversedById ? "Anulado · " : ""}{entry.adjustment.externalReference}</small><Button variant="ghost" size="sm" onClick={() => setStatementDetail(entry)}>Detalhes do ajuste</Button></>}</td>
                  <td className="hubbuy-entry-amount">{entry.direction === "credit" ? "+" : "−"} {formatCnyMinor(entry.amountCnyMinor)}</td>
                  <td>{entry.historicalBrlCents === null ? "Não informada" : formatBrlCents(entry.historicalBrlCents)}</td><td className="hubbuy-entry-amount">{formatCnyMinor(entry.balanceAfterCnyMinor)}</td>
                </tr>)}
                {!statement?.entries.length && <tr><td colSpan={6} className="hubbuy-statement-empty">{statementLoading[account.id] || !statement && !statementErrors[account.id] ? "Carregando movimentações…" : statementErrors[account.id] ? "Extrato indisponível." : "Nenhuma movimentação registrada nesta conta."}</td></tr>}
              </tbody></table>
            </div>
            <p className="hubbuy-statement-mobile-hint muted">Deslize a tabela para ver os valores e o saldo após.</p>
            {statementErrors[account.id] && <div className="hubbuy-load-error" role="alert"><p>{statementErrors[account.id]}</p><Button variant="outline" size="sm" disabled={statementLoading[account.id]} onClick={() => void loadStatement(account.id, statement?.nextAfterSequence ?? undefined)}>Tentar carregar extrato</Button></div>}
            {statement?.nextAfterSequence !== null && statement?.nextAfterSequence !== undefined && !statementErrors[account.id] && <Button size="sm" variant="outline" disabled={statementLoading[account.id]} onClick={() => void loadStatement(account.id, statement.nextAfterSequence!)}>{statementLoading[account.id] ? "Carregando…" : "Carregar mais"}</Button>}
          </section>
        </div>;
      })() : <div className="hubbuy-no-accounts"><Coins size={28} aria-hidden="true"/><h2>Nenhuma conta HubBuy cadastrada.</h2><p className="muted">Adicione a conta usada pelo grupo para acompanhar saldo e movimentações.</p><Button variant="soft" onClick={focusCreateAccount}><Plus size={17} aria-hidden="true"/>Adicionar primeira conta</Button></div>}
      <section className="hubbuy-create-section" aria-labelledby="hubbuy-create-title"><h2 id="hubbuy-create-title">Adicionar conta HubBuy</h2><p className="muted">A conta começa com saldo conhecido em ¥0. O primeiro crédito pode ser um reembolso recebido ou um crédito manual documentado.</p><form className="cost-account-create" onSubmit={event => void createAccount(event)}><label><span className="sr-only">Adicionar conta HubBuy</span><input ref={createInput} required maxLength={100} value={label} onChange={event => setLabel(event.target.value)} placeholder="Ex.: Conta principal do grupo"/></label><Button type="submit" variant="soft" disabled={saving || !label.trim()}><Plus size={16} aria-hidden="true"/>{saving ? "Salvando…" : "Criar conta · saldo ¥0"}</Button></form></section>
    </div>
    {adjustmentDraft && accounts.find(row => row.id === adjustmentDraft.accountId) && <HubBuyBalanceAdjustmentSurface key={adjustmentDraft.accountId + (adjustmentDraft.reversal?.id ?? "")} account={accounts.find(row => row.id === adjustmentDraft.accountId)!} actorId={actorId} workspaceId={workspaceId} members={members} reversal={adjustmentDraft.reversal} onClose={() => setAdjustmentDraft(null)} onRefresh={async () => { await refreshAccounts(); await loadBalance(adjustmentDraft.accountId); await loadStatement(adjustmentDraft.accountId); }}/>}
    {statementDetail && <Surface open title="Detalhes do ajuste" onOpenChange={open => { if (!open) setStatementDetail(null); }}><div className="hubbuy-adjustment-form"><p>{statementDetail.reason}</p><p>Registrado por {statementDetail.actorName ?? "Membro"} · {statementDetail.operationRecordedAt ? new Date(statementDetail.operationRecordedAt).toLocaleString("pt-BR") : "Data não informada"}</p><p>Ocorrência: {statementDetail.occurredAt ? new Date(statementDetail.occurredAt).toLocaleString("pt-BR") : "Não informada"}</p><p>{statementDetail.direction === "credit" ? "Entrada" : "Saída"}: {formatCnyMinor(statementDetail.amountCnyMinor)} · Base: {statementDetail.historicalBrlCents === null ? "Não informada" : formatBrlCents(statementDetail.historicalBrlCents)}</p>{statementDetail.adjustment?.externalReference && <p>Referência: {statementDetail.adjustment.externalReference}</p>}<ul>{statementDetail.adjustment?.shares.map(row => <li key={row.personId}>{members.find(member => member.id === row.personId)?.name ?? "Membro"}: {formatCnyMinor(row.amountCnyMinor)} · {formatBrlCents(row.historicalBrlCents)}</li>)}</ul>{statementDetail.adjustment?.reversedById && <p>Anulado pelo ajuste {statementDetail.adjustment.reversedById}.</p>}{statementDetail.adjustment?.reversesAdjustmentId && <p>Anulação do ajuste {statementDetail.adjustment.reversesAdjustmentId}.</p>}{statementDetail.adjustment?.canReverse ? <Button variant="outline" onClick={() => { setStatementDetail(null); setTimeout(() => setAdjustmentDraft({ accountId: selectedAccount!.id, reversal: { id: statementDetail.adjustment!.id, reason: statementDetail.reason } }), 0); }}>Anular ajuste</Button> : statementDetail.adjustment?.kind !== "reversal" && !statementDetail.adjustment?.reversedById && <p className="muted">Anulação indisponível. Créditos já consumidos e contas inativas preservam seu histórico.</p>}</div></Surface>}
    <Confirm open={!!deleteDraft} title={deleteDraft?.discard ? "Anular cadastro incorreto?" : "Excluir cadastro do Loti?"} description={deleteDraft?.discard ? `${deleteDraft.account.label}: os valores de conciliação informados por engano serão estornados no Loti e o cadastro sairá da lista. Os registros originais e o motivo serão preservados na auditoria. Isso não movimenta dinheiro nem encerra sua conta no HubBuy.` : `${deleteDraft?.account.label ?? "A conta"} sairá da lista. A auditoria será preservada. Isso não encerra sua conta no HubBuy.`} label={deleteDraft?.discard ? "Anular e excluir" : "Excluir conta"} danger busy={saving} disabled={!deleteDraft?.reason.trim() || (!!deleteDraft?.discard && !deleteConfirmed)} onOpenChange={open => { if (!open && !saving) { setDeleteDraft(null); setDeleteError(null); setDeleteConfirmed(false); } }} onConfirm={() => void deleteAccount()}><label>Motivo da exclusão<textarea required maxLength={1000} rows={3} disabled={saving} value={deleteDraft?.reason ?? ""} onChange={event => setDeleteDraft(current => current && ({ ...current, reason: event.target.value, idempotencyKey: crypto.randomUUID() }))}/></label>{deleteDraft?.discard && <label className="cost-account-discard-confirmation"><input type="checkbox" disabled={saving} checked={deleteConfirmed} onChange={event => setDeleteConfirmed(event.target.checked)}/>Confirmo que os valores foram informados por engano e não correspondem a saldo ou recebimentos reais.</label>}{deleteError && <p role="alert">{deleteError}</p>}</Confirm>
    <Confirm open={!!zeroActivation} title="Confirmar saldo inicial zero?" description="Use esta recuperação apenas se a conta legada nunca teve saldo, lançamentos ou eventos anteriores. Contas com histórico precisam passar pela conciliação." label="Ativar com saldo ¥0" disabled={!zeroConfirmed} busy={saving} onOpenChange={open => { if (!open) { setZeroActivation(null); setZeroConfirmed(false); } }} onConfirm={() => zeroActivation && void activateAtZero(zeroActivation)}><label className="checkbox-label"><input type="checkbox" checked={zeroConfirmed} onChange={event => setZeroConfirmed(event.target.checked)}/>Confirmo que não havia saldo nem movimentações anteriores.</label></Confirm>
    <Confirm open={!!archiveDraft} title="Arquivar conta HubBuy?" description="Somente contas reconciliadas sem saldo podem ser arquivadas. O histórico permanece no extrato." label="Arquivar conta" danger disabled={!archiveReason.trim()} busy={saving} onOpenChange={open => { if (!open) { setArchiveDraft(null); setArchiveReason(""); } }} onConfirm={() => archiveDraft && void archiveAccount(archiveDraft)}><label>Motivo do arquivamento<textarea required maxLength={1000} rows={3} value={archiveReason} onChange={event => setArchiveReason(event.target.value)} /></label></Confirm>
  </section>;
}
