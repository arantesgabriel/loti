"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, SlidersHorizontal, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrdersContextSurface as Surface } from "./orders-context-surface";
import { costRequest } from "@/components/packages/package-cost-client";
import { useWorkspace } from "@/components/workspace-provider";
import { formatMoney } from "@/lib/domain/money";
import { ordersSelectionSummary, reconcileOrdersSelection, type OrdersSelection } from "./orders-selection";
import { OrderPreparationPanel } from "./order-preparation-panel";
import "./orders-preparation.css";
import type { warehouseServices } from "@/lib/domain/warehouse-services";
import "./orders.css";
import { OrdersFeedback, OrdersWorkspace, useOrdersCompact, type OrdersPanel, type OrdersPanelState } from "./orders-workspace";
import { OrderDetailPanel } from "./order-detail-panel";
import { OrdersQcImport } from "./orders-qc-import";
import { OrdersCatalog } from "./orders-catalog";
import { OrdersFilterSurface } from "./orders-filter-surface";
import { emptyOrdersFilters, filtersUrl, ordersFilterKeys as filterKeys, type OrdersFilters, type OrdersView } from "./orders-list-state";
export type { OrdersFilters } from "./orders-list-state";

export type WarehouseData = Awaited<
  ReturnType<ReturnType<typeof warehouseServices>["list"]>
>;
type Row = WarehouseData["rows"][number];
function minimumReceivedCount(row: Row) {
  const eligible = Array.from({ length: row.quantity }, (_, index) => index).filter(
    (index) => !row.cancelledUnits.includes(index),
  );
  return row.reservations.reduce(
    (minimum, reservation) =>
      Math.max(minimum, eligible.indexOf(reservation.unitIndex) + 1),
    0,
  );
}

export function OrdersScreen({
  initialFilters,
}: {
  initialFilters: OrdersFilters;
}) {
  const { data: workspace } = useWorkspace();
  const compact = useOrdersCompact();
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState("");
  const [createdPackage, setCreatedPackage] = useState("");
  const [destination, setDestination] = useState("");
  const [packageName, setPackageName] = useState("");
  const [reason, setReason] = useState("");
  const busyRef = useRef(false);
  const checkingRef = useRef(false);
  const attempt = useRef<{ idempotencyKey: string; command: Record<string, unknown> } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [fromPreparation, setFromPreparation] = useState(false);
  const revalidateRef = useRef<(() => Promise<unknown>) | null>(null);
  const [data, setData] = useState<WarehouseData | null>(null);
  const [error, setError] = useState("");
  const [loadedRequestKey, setLoadedRequestKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState(initialFilters);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [panel, setPanel] = useState<OrdersPanelState>({ kind: "closed" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [packagePage, setPackagePage] = useState(0);
  const [selected, setSelected] = useState<OrdersSelection>({});
  const selectedRef = useRef<OrdersSelection>({});
  function replaceSelection(next: OrdersSelection) { selectedRef.current = next; setSelected(next); }
  const [receive, setReceive] = useState<Row | null>(null);
  const [reserve, setReserve] = useState(false);
  const [receiveError, setReceiveError] = useState("");
  const [receiveErrorField, setReceiveErrorField] = useState<
    "account" | "quantity" | "reason" | null
  >(null);
  const [reserveError, setReserveError] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const receiveErrorRef = useRef<HTMLParagraphElement>(null);
  const receiveAccountRef = useRef<HTMLSelectElement>(null);
  const receiveQuantityRef = useRef<HTMLInputElement>(null);
  const receiveReasonRef = useRef<HTMLTextAreaElement>(null);
  const reserveErrorRef = useRef<HTMLParagraphElement>(null);

  const query = useMemo(
    () =>
      new URLSearchParams({
        ...filters,
        page: String(filters.page),
        pageSize: "20",
        packagePage: String(packagePage),
      }).toString(),
    [filters, packagePage],
  );
  const requestKey = `${query}:${refreshKey}`;
  const loading = loadedRequestKey !== requestKey;
  const advancedCount =
    Number(Boolean(filters.account)) +
    Number(Boolean(filters.person)) +
    Number(Boolean(filters.origin)) +
    Number(Boolean(filters.trackingId)) + Number(Boolean(filters.status));
  const hasAnyFilter = filterKeys.some((key) => key === "view" ? filters.view !== "all" : Boolean(filters[key]));

  useEffect(() => {
    let active = true;
    void costRequest<WarehouseData>(`/api/warehouse?${query}`)
      .then((result) => {
        if (!active) return;
        if (result.ok && result.data) {
          const lastPage = Math.max(0, Math.ceil(result.data.pagination.total / 20) - 1);
          if (filters.page > lastPage) {
            const next = { ...filters, page: lastPage };
            window.history.replaceState(window.history.state, "", filtersUrl(next));
            setFilters(next);
          }
          setData(result.data);
          if (!attempt.current && Object.keys(selectedRef.current).length) void revalidateRef.current?.();
          setError("");
        }
        else setError(result.error ?? "Não foi possível carregar os pedidos.");
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar os pedidos.");
      })
      .finally(() => {
        if (active) setLoadedRequestKey(requestKey);
      });
    return () => {
      active = false;
    };
  }, [query, requestKey, filters]);

  useEffect(() => {
    if (draftFilters.search.trim() === filters.search) return;
    const timer = window.setTimeout(() => {
      const next = { ...filters, search: draftFilters.search.trim(), page: 0 };
      window.history.replaceState(window.history.state, "", filtersUrl(next));
      setFilters(next);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draftFilters.search, filters]);

  useEffect(() => {
    if (receiveError) {
      const target =
        receiveErrorField === "account"
          ? receiveAccountRef.current
          : receiveErrorField === "quantity"
            ? receiveQuantityRef.current
            : receiveErrorField === "reason"
              ? receiveReasonRef.current
              : receiveErrorRef.current;
      target?.focus();
    }
  }, [receiveError, receiveErrorField]);

  useEffect(() => {
    if (reserveError) reserveErrorRef.current?.focus();
  }, [reserveError]);

  const rows = data?.rows ?? [];
  const { entries, units: selectedUnitCount, base: selectedBase } = ordersSelectionSummary(selected);
  const selection = entries.map(entry => entry.row);
  const locked = busy || checking || uncertain;

  async function revalidateSelection() {
    if (checkingRef.current) return null;
    checkingRef.current = true; setChecking(true);
    try {
      const ids = Object.keys(selectedRef.current).filter(id => selectedRef.current[id].quantity > 0);
      const fresh: Row[] = [];
      for (let offset = 0; offset < ids.length; offset += 20) {
        const query = new URLSearchParams({ itemIds: ids.slice(offset, offset + 20).join(","), pageSize: "100" });
        const result = await costRequest<WarehouseData>(`/api/warehouse?${query}`);
        if (!result.ok || !result.data) throw new Error(result.error ?? "Não foi possível conferir a disponibilidade. Tente novamente.");
        fresh.push(...result.data.rows);
      }
      const reconciled = reconcileOrdersSelection(selectedRef.current, fresh, ids);
      replaceSelection(reconciled.selection);
      setNotice(reconciled.changed.length ? `Disponibilidade atualizada: ${reconciled.changed.join(", ")}. Revise as quantidades.` : "");
      return reconciled;
    } catch (error) { setSelectionError(error instanceof Error ? error.message : "Falha ao conferir disponibilidade."); return null; }
    finally { checkingRef.current = false; setChecking(false); }
  }

  useEffect(() => { revalidateRef.current = revalidateSelection; });
  useEffect(() => {
    const refresh = () => { if (!attempt.current && !busyRef.current) { void revalidateRef.current?.(); setRefreshKey(current => current + 1); } };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  function updateDraft<K extends (typeof filterKeys)[number]>(
    key: K,
    value: OrdersFilters[K],
  ) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = { ...draftFilters, page: 0 };
    window.history.replaceState(window.history.state, "", filtersUrl(next));
    setFilters(next);
    setFiltersOpen(false);
  }

  function clearFilters() {
    const cleared = { ...emptyOrdersFilters };
    window.history.replaceState(window.history.state, "", "/orders");
    setDraftFilters(cleared);
    setFilters(cleared);
  }

  function movePage(page: number) {
    const next = { ...filters, page };
    window.history.replaceState(window.history.state, "", filtersUrl(next));
    setFilters(next);
  }

  function changeView(view: OrdersView) {
    const next = { ...filters, view, page: 0 };
    window.history.replaceState(window.history.state, "", filtersUrl(next));
    setFilters(next);
    setDraftFilters(current => ({ ...current, view, page: 0 }));
  }

  function changeStage(status: string) {
    const next = { ...filters, status, page: 0 };
    window.history.replaceState(window.history.state, "", filtersUrl(next));
    setFilters(next);
    setDraftFilters(current => ({ ...current, status, page: 0 }));
  }

  function selectRow(row: Row, quantity: number) {
    if (locked || checkingRef.current || busyRef.current) return;
    const current = selectedRef.current;
    if (!current[row.costItemId] && Object.values(current).filter(entry => entry.quantity > 0).length >= 100) { setSelectionError("Selecione até 100 produtos por pacote."); return; }
    const safe = Number.isSafeInteger(quantity) ? Math.max(0, Math.min(row.availableUnits.length, quantity)) : 0;
    const next = { ...current };
    if (safe) next[row.costItemId] = { row, quantity: safe }; else delete next[row.costItemId];
    replaceSelection(next); setSelectionError(""); setNotice("");
  }

  async function prepareSelection() {
    setFromPreparation(false); setReserve(false); setPanel({ kind: "prepare" });
    if (!attempt.current) await revalidateSelection();
  }

  async function reviewSelection() {
    if (attempt.current) { setReserve(true); return; }
    const fresh = await revalidateSelection();
    if (!fresh) return;
    const summary = ordersSelectionSummary(fresh.selection);
    if (!summary.entries.length) { setSelectionError("Adicione unidades disponíveis para montar um pacote."); return; }
    if (new Set(summary.entries.map(entry => entry.row.accountId)).size !== 1 || !summary.entries[0].row.accountId) {
      setSelectionError("Selecione unidades de uma única conta HubBuy conferida."); return;
    }
    if (summary.units > 10000) { setSelectionError("Selecione até 10.000 unidades por operação."); return; }
    setSelectionError(""); setReserveError(""); setReserve(true);
  }

  async function submit(command: Record<string, unknown>, onError: (message: string) => void = setError) {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true);
    const isReserve = command.operation === "reserve";
    const payload = isReserve ? (attempt.current ??= { idempotencyKey: crypto.randomUUID(), command }) : { idempotencyKey: crypto.randomUUID(), command };
    const result = await costRequest<{ id: string }>("/api/warehouse", { workspaceId: workspace.workspaceId, ...payload });
    busyRef.current = false; setBusy(false);
    if (!result.ok) {
      if (isReserve) {
        const unknown = result.status === 0 || result.status >= 500;
        setUncertain(unknown);
        if (!unknown) { attempt.current = null; setRefreshKey(current => current + 1); }
        onError(unknown ? "A confirmação não chegou. Use Tentar confirmar novamente para consultar a mesma montagem com segurança." : result.error ?? "A operação não foi concluída. Revise a seleção.");
      } else onError(result.error ?? "A operação não foi concluída.");
      return false;
    }
    if (isReserve) { setCreatedPackage(result.data?.id ?? ""); setPanel({ kind: "closed" }); attempt.current = null; setUncertain(false); setDestination(""); setPackageName(""); setReason(""); }
    setError(""); setReceiveError(""); setReceiveErrorField(null); setReserveError(""); setReceive(null); setReserve(false);
    if (isReserve) replaceSelection({}); setRefreshKey(current => current + 1); return true;
  }

  async function confirmAssembly(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || checkingRef.current) return;
    if (attempt.current) { await submit(attempt.current.command, setReserveError); return; }
    const fresh = await revalidateSelection();
    if (!fresh) { setReserveError("Não foi possível conferir a seleção. Volte à preparação e tente novamente."); return; }
    if (fresh.changed.length) { setReserve(false); return; }
    const current = ordersSelectionSummary(fresh.selection);
    const accounts = new Set(current.entries.map(entry => entry.row.accountId));
    if (!current.entries.length || accounts.size !== 1 || !current.entries[0].row.accountId || current.units > 10000) { setReserve(false); setSelectionError("Revise as unidades disponíveis e selecione uma única conta HubBuy."); return; }
    const pkg = data?.packages.find(candidate => candidate.id === destination);
    if (destination && !pkg) { setReserveError("O pacote não está mais nesta página de opções. Selecione o destino novamente."); return; }
    await submit({ operation: "reserve", accountId: current.entries[0].row.accountId,
      ...(pkg ? { packageId: pkg.id, expectedRevision: pkg.revision } : { name: packageName.trim() }),
      selection: current.entries.map(({ row, quantity }) => ({ costItemId: row.costItemId, expectedRevision: row.revision, units: row.availableUnits.slice(0, quantity) })), reason: reason.trim(),
    }, setReserveError);
  }

  function receiveServerError(message: string) {
    setReceiveError(message);
    setReceiveErrorField(
      /conta/i.test(message)
        ? "account"
        : /reserv|unidade|chegada/i.test(message)
          ? "quantity"
          : null,
    );
  }

  const activeAdvancedFilters = [
    filters.account
      ? `Conta: ${data?.accounts.find((account) => account.id === filters.account)?.label ?? "selecionada"}`
      : "",
    filters.person
      ? `Pessoa: ${workspace.members.find((member) => member.id === filters.person)?.name ?? "selecionada"}`
      : "",
    filters.origin
      ? `Origem: ${filters.origin === "additional" ? "Adicional" : "Compra"}`
      : "",
    filters.trackingId
      ? `Compra: ${data?.origins.find((origin) => origin.trackingId === filters.trackingId)?.name ?? "selecionada"}`
      : "",
  ].filter(Boolean);

  const stages = [["", "Todas as etapas"], ["review", "Conferência legada"], ["awaiting", "Aguardando chegada"], ["warehouse", "No armazém"], ["available", "Disponível para pacote"], ["package", "Em pacote"], ["sent", "Enviado"], ["received", "Recebido no Brasil"]] as const;
  const total = data?.pagination.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const prepareDisabled = !selection.length || busy || checking || loading;
  const detailRow = panel.kind === "item-detail" ? (rows.find(row => row.costItemId === panel.itemId) ?? (fromPreparation ? selected[panel.itemId]?.row : undefined)) : undefined;
  const detailPanel: OrdersPanel | undefined = panel.kind === "item-detail" ? {
    state: panel,
    title: detailRow && !loading && !error ? detailRow.name : "Detalhe do item",
    description: "",
    footer: detailRow && !loading && !error ? <Button type="button" disabled={locked || !detailRow.availableUnits.length} onClick={() => { if (!selected[detailRow.costItemId]?.quantity) selectRow(detailRow, 1); void prepareSelection(); }}>Adicionar ao pacote</Button> : undefined,
    children: loading ? <OrdersFeedback title="Atualizando item…" /> : error ? <OrdersFeedback title="Não foi possível atualizar o item" error>Use Tentar carregar novamente na lista.</OrdersFeedback> : detailRow && data ? <>{(fromPreparation || selectedUnitCount > 0) && <Button type="button" variant="ghost" className="orders-detail-back" onClick={() => { setReserve(false); setPanel({ kind: "prepare" }); }}>{fromPreparation ? "Voltar à preparação" : "Ver seleção"} · {selectedUnitCount}</Button>}<OrderDetailPanel key={detailRow.costItemId} row={detailRow} data={data} members={workspace.members} quantity={selected[detailRow.costItemId]?.quantity ?? 0} disabled={locked} returnTo={filtersUrl(filters)} onSelect={selectRow} onChanged={replacement => { if (replacement) { const next = { ...selectedRef.current }; delete next[replacement.previousId]; replaceSelection(next); setPanel({ kind: "item-detail", itemId: replacement.nextId }); } setRefreshKey(current => current + 1); }} onReceive={row => { setReceiveError(""); setReceiveErrorField(null); setReceive(row); }} /></> : <OrdersFeedback title="Item não encontrado nesta listagem">O item pode ter mudado ou estar fora dos filtros/página atuais. Feche o detalhe e revise a lista.</OrdersFeedback>,
  } : undefined;

  const reviewForm = <form className="orders-form orders-review-form" onSubmit={confirmAssembly}>
    <ul className="orders-review-items">{entries.map(({ row, quantity }) => <li key={row.costItemId}><span><strong>{row.name}</strong><small>{row.source.variant || "Sem variação"}</small></span><strong>{quantity} un.</strong></li>)}</ul>
    <div className="orders-preparation-total"><span>{selectedUnitCount} unidades</span><strong>{selectedBase === null ? "Base a conferir" : formatMoney(selectedBase)}</strong></div>
    <p className="orders-review-note">A montagem vincula unidades ao pacote e preserva os custos originais.</p>
    <p>Conta HubBuy: <strong>{data?.accounts.find(account => account.id === selection[0]?.accountId)?.label ?? "A conferir"}</strong></p>
    <fieldset disabled={busy || checking || uncertain}>
      <label>Destino<select name="package" value={destination} onChange={event => setDestination(event.target.value)}><option value="">Criar novo pacote</option>{data?.packages.filter(pkg => pkg.accountId === selection[0]?.accountId && pkg.stage === "preparing" && !pkg.contentClosedAt && pkg.reviewState === "confirmed" && !pkg.financialClosedAt).map(pkg => <option key={pkg.id} value={pkg.id}>{pkg.name}</option>)}</select></label>
      {data && data.packageOptions.total > 100 && <nav className="orders-pagination" aria-label="Opções de pacotes"><Button type="button" variant="outline" disabled={!packagePage || loading} onClick={() => { setDestination(""); setPackagePage(packagePage - 1); }}>Anterior</Button><span>{packagePage + 1} / {Math.ceil(data.packageOptions.total / 100)}</span><Button type="button" variant="outline" disabled={!data.packageOptions.hasMore || loading} onClick={() => { setDestination(""); setPackagePage(packagePage + 1); }}>Mais pacotes</Button></nav>}
      {!destination && <label>Nome para novo pacote<input name="name" required maxLength={120} value={packageName} onChange={event => setPackageName(event.target.value)} placeholder="Ex.: Envio de novembro" /></label>}
      <label>Motivo<textarea name="reason" required minLength={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
    </fieldset>
    {reserveError && <p ref={reserveErrorRef} tabIndex={-1} role="alert" className="orders-form-error">{reserveError}</p>}
    <div className="orders-review-actions"><Button type="button" variant="outline" disabled={busy || checking} onClick={() => setReserve(false)}>Voltar</Button><Button type="submit" disabled={busy || checking || loading}>{busy ? "Confirmando…" : checking ? "Conferindo…" : uncertain ? "Tentar confirmar novamente" : "Montar pacote"}</Button></div>
  </form>;
  const preparationPanel: OrdersPanel | undefined = panel.kind === "prepare" ? {
    state: panel, title: compact && reserve ? "Revisar montagem" : "Preparar pacote",
    description: compact && reserve ? "Confirme as unidades antes de montar." : `${selection.length} produtos · ${selectedUnitCount} unidades`,
    children: compact && reserve ? reviewForm : <>{notice && <p role="status" className="orders-selection-notice">{notice}</p>}{selectionError && <p role="alert" className="orders-form-error">{selectionError}</p>}<OrderPreparationPanel selected={selected} disabled={locked} onSelect={selectRow} onDetail={row => { setFromPreparation(true); setPanel({ kind: "item-detail", itemId: row.costItemId }); }} /></>,
    footer: compact && reserve ? undefined : <><div className="orders-preparation-total"><span>{selectedUnitCount} unidades selecionadas</span><strong>{selectedBase === null ? "Base a conferir" : formatMoney(selectedBase)}</strong></div><Button type="button" disabled={!selection.length || busy || checking || loading} onClick={reviewSelection}>{checking ? "Conferindo…" : uncertain ? "Retomar confirmação" : "Montar pacote"}</Button></>,
  } : undefined;
  const activePanel = detailPanel ?? preparationPanel;

  const eligible = Array.from({ length: receive?.quantity ?? 0 }, (_, index) => index)
            .filter((index) => !(receive?.cancelledUnits ?? []).includes(index));
  const minimum = receive ? minimumReceivedCount(receive) : 0;
  const maximum = eligible.length;
  const reservedCount = receive?.reservations.length ?? 0;
  const receivedCount = receive?.receivedUnits.length ?? 0;
  const productLabel = receive ? `${receive.name}${receive.source.variant ? ` · ${receive.source.variant}` : ""}` : "";

  return (
    <OrdersWorkspace
      tools={<OrdersQcImport onChanged={() => setRefreshKey(current => current + 1)} />}
      {...(activePanel ? { panel: activePanel, onPanelClose: () => { if (reserve && compact) setReserve(false); else { setPanel({ kind: "closed" }); setReserve(false); } } } : { panel: undefined, onPanelClose: undefined })}
      toolbar={<form className="orders-list-toolbar" role="search" onSubmit={event => { event.preventDefault(); const next = { ...filters, search: draftFilters.search.trim(), page: 0 }; window.history.replaceState(window.history.state, "", filtersUrl(next)); setFilters(next); }}>
        <label className="orders-search"><span className="sr-only">Buscar produto ou pedido</span><Search size={17} aria-hidden="true" /><input type="search" value={draftFilters.search} onChange={event => updateDraft("search", event.target.value)} placeholder="Buscar produto ou pedido" maxLength={200} /></label>
        <label className="orders-stage-select"><span className="sr-only">Etapa</span><select aria-label="Etapa" value={filters.status} onChange={event => changeStage(event.target.value)}>{stages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <Button type="button" variant="outline" aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={() => { setDraftFilters(current => ({ ...filters, search: current.search })); setFiltersOpen(true); }}><SlidersHorizontal size={14} aria-hidden="true" />Filtros{advancedCount > 0 && <span className="orders-filter-count">{advancedCount}</span>}</Button>
        <Button type="button" className="orders-prepare-button" disabled={prepareDisabled} title={!selection.length ? "Selecione unidades disponíveis para preparar um pacote" : undefined} onClick={prepareSelection}>Preparar pacote<ArrowRight size={14} aria-hidden="true" /></Button>
      </form>}
    >
      {createdPackage && <p role="status" className="orders-assembly-success">Pacote montado. <a href={`/packages/detail/${encodeURIComponent(createdPackage)}`}>Abrir pacote</a></p>}
      {notice && panel.kind === "closed" && <p role="status">{notice}</p>}
      <div className="orders-tabs-bar">
        <nav className="orders-view-tabs" aria-label="Visualizações de pedidos">
          {([["all", "Todos", ""], ["warehouse", "No armazém", "orders-desktop-view"], ["available", "Disponíveis", ""], ["awaiting", "A caminho", "orders-mobile-view"]] as const).map(([view, label, className]) => <button key={view} type="button" className={className} aria-current={filters.view === view ? "true" : undefined} onClick={() => changeView(view)}>{label}</button>)}
        </nav>
        <span className="orders-result-count" aria-live="polite">{loading ? "Carregando…" : `${rows.length} ${rows.length === 1 ? "item exibido" : "itens exibidos"}`}</span>
      </div>
      {hasAnyFilter && <div className="orders-list-applied"><p>{[...activeAdvancedFilters, filters.status ? `Etapa: ${stages.find(([value]) => value === filters.status)?.[1] ?? filters.status}` : "", filters.search ? `Busca: ${filters.search}` : "", filters.view === "awaiting" ? "A caminho" : filters.view === "warehouse" ? "No armazém" : filters.view === "available" ? "Disponíveis" : ""].filter(Boolean).join(" · ")}</p><Button type="button" variant="ghost" onClick={clearFilters}>Limpar filtros</Button></div>}
      {!loading && error && <div className="orders-request-error"><p role="alert" className="form-error">{error}</p><Button type="button" variant="outline" onClick={() => { setError(""); setRefreshKey(current => current + 1); }}>Tentar carregar novamente</Button></div>}
      <div aria-busy={loading}>
        {loading && <div className="orders-list-loading" role="status"><p>{data ? "Atualizando pedidos…" : "Carregando pedidos…"}</p>{[0, 1, 2].map(index => <span key={index} aria-hidden="true" />)}</div>}
        {!loading && !error && data && !rows.length && <div className="orders-list-empty"><h2>{hasAnyFilter ? "Nenhum pedido corresponde aos filtros aplicados" : "Nenhum pedido por aqui"}</h2><p>{hasAnyFilter ? "Revise os filtros ou use Limpar filtros para ver outros pedidos." : "Os pedidos aparecem após finalizar uma compra."}</p></div>}
        {!loading && !error && data && rows.length > 0 && <OrdersCatalog data={data} selected={selected} disabled={locked || loading} detailItemId={panel.kind === "item-detail" ? panel.itemId : undefined} onOpenDetail={row => setPanel({ kind: "item-detail", itemId: row.costItemId })} onSelect={selectRow} />}
      </div>
      {!loading && !error && total > 0 && <footer className="orders-list-footer"><span>Mostrando {filters.page * 20 + 1}–{Math.min((filters.page + 1) * 20, total)} de {total} {total === 1 ? "item" : "itens"}</span>{totalPages > 1 && <nav aria-label="Páginas de pedidos" className="orders-list-pagination"><Button type="button" variant="ghost" aria-label="Página anterior" disabled={filters.page === 0 || busy} onClick={() => movePage(filters.page - 1)}><ChevronLeft size={16} aria-hidden="true" /></Button><span aria-current="page">{filters.page + 1} / {totalPages}</span><Button type="button" variant="ghost" aria-label="Próxima página" disabled={!data?.pagination.hasMore || busy} onClick={() => movePage(filters.page + 1)}><ChevronRight size={16} aria-hidden="true" /></Button></nav>}</footer>}
      {selection.length > 0 && <div className="orders-selection-summary" aria-live="polite"><span>{selection.length} {selection.length === 1 ? "produto" : "produtos"} · {selectedUnitCount} {selectedUnitCount === 1 ? "unidade selecionada" : "unidades selecionadas"} · {selectedBase === null ? "Base a conferir" : formatMoney(selectedBase)}</span><Button type="button" variant="ghost" disabled={locked} onClick={() => { replaceSelection({}); setSelectionError(""); }}>Limpar seleção</Button>{selectionError && <p role="alert">{selectionError}</p>}</div>}
      {selection.length > 0 && <div className="orders-preparation-mobile"><div><strong>{selection.length} {selection.length === 1 ? "produto" : "produtos"}</strong><small>{selectedUnitCount} {selectedUnitCount === 1 ? "unidade" : "unidades"}</small></div><Button type="button" disabled={prepareDisabled} onClick={prepareSelection}>Preparar pacote<ArrowRight size={14} aria-hidden="true" /></Button></div>}
      <OrdersFilterSurface open={filtersOpen} onOpenChange={setFiltersOpen}>
        <form className="orders-filter-form" onSubmit={applyFilters}>
          <label>Etapa<select value={draftFilters.status} onChange={event => updateDraft("status", event.target.value)}>{stages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Conta<select value={draftFilters.account} onChange={event => updateDraft("account", event.target.value)}><option value="">Todas as contas</option>{data?.accounts.map(account => <option key={account.id} value={account.id}>{account.label}</option>)}</select></label>
          <label>Pessoa<select value={draftFilters.person} onChange={event => updateDraft("person", event.target.value)}><option value="">Todas as pessoas</option>{workspace.members.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
          <label>Origem<select value={draftFilters.origin} onChange={event => updateDraft("origin", event.target.value)}><option value="">Todas as origens</option><option value="original">Compra</option><option value="additional">Adicional</option></select></label>
          <label>Compra<select value={draftFilters.trackingId} onChange={event => updateDraft("trackingId", event.target.value)}><option value="">Todas as compras</option>{data?.origins.map(origin => <option key={origin.trackingId} value={origin.trackingId}>{origin.name}</option>)}</select></label>
          <div className="orders-filter-actions"><Button type="button" variant="ghost" onClick={() => { setDraftFilters(current => ({ ...emptyOrdersFilters, search: current.search, view: current.view })); }}>Limpar campos</Button><Button type="submit">Aplicar filtros</Button></div>
        </form>
      </OrdersFilterSurface>
      <Surface
        open={!!receive}
        onOpenChange={(open) => {
          if (!open) {
            setReceive(null);
            setReceiveError("");
            setReceiveErrorField(null);
          }
        }}
        title="Conferir chegada ao armazém"
      >
        {receive && (
            <form
              className="orders-form orders-arrival-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const count = Number(form.get("quantity"));
                if (count < minimum) {
                  setReceiveError("Este total removeria unidades reservadas. Retire as reservas dos pacotes antes de corrigir a chegada.");
                  setReceiveErrorField("quantity");
                  return;
                }
                void submit({
                  operation: "receive",
                  costItemId: receive.costItemId,
                  expectedRevision: receive.revision,
                  accountId: String(form.get("account")),
                  units: eligible.slice(0, count),
                  reason: String(form.get("reason")),
                }, receiveServerError);
              }}
            >
              <section className="orders-arrival-context" aria-label="Resumo do produto e da chegada">
                <h3>{productLabel}</h3>
                <dl className="orders-arrival-summary">
                  <div><dt>Compradas</dt><dd>{receive.quantity}</dd></div>
                  <div><dt>Canceladas</dt><dd>{receive.cancelledUnits.length}</dd></div>
                  <div><dt>Já recebidas</dt><dd>{receivedCount}</dd></div>
                  <div><dt>Unidades reservadas</dt><dd>{reservedCount}</dd></div>
                  <div><dt>Disponíveis para pacote</dt><dd>{receive.availableUnits.length}</dd></div>
                </dl>
                <p className="muted">Informe o total acumulado até agora, não unidades adicionais. A correção substitui a contagem anterior. Fotos QC não confirmam chegada.</p>
              </section>
              {receiveError && (
                <p
                  ref={receiveErrorRef}
                  tabIndex={-1}
                  role="alert"
                  id="orders-arrival-error"
                  className="orders-form-error"
                >
                  {receiveError}
                </p>
              )}
              <label>
                Conta HubBuy
                <select
                  ref={receiveAccountRef}
                  name="account"
                  required
                  defaultValue={receive.accountId ?? ""}
                  aria-invalid={receiveErrorField === "account"}
                  aria-describedby={receiveErrorField === "account" ? "orders-arrival-error" : "orders-arrival-account-help"}
                  onChange={() => { setReceiveError(""); setReceiveErrorField(null); }}
                >
                  <option value="" disabled>Selecione a conta verificada</option>
                  {data?.accounts.filter((account) => account.status === "active").map((account) => (
                    <option key={account.id} value={account.id}>{account.label}</option>
                  ))}
                </select>
                <small id="orders-arrival-account-help">A conta deve corresponder à origem financeira e às reservas existentes.</small>
              </label>
              <label>
                Novo total recebido
                <input
                  ref={receiveQuantityRef}
                  name="quantity"
                  type="number"
                  required
                  min={0}
                  max={maximum}
                  defaultValue={receivedCount}
                  aria-invalid={receiveErrorField === "quantity"}
                  aria-describedby={receiveErrorField === "quantity" ? "orders-arrival-error" : "orders-arrival-quantity-help"}
                  onChange={() => { setReceiveError(""); setReceiveErrorField(null); }}
                />
                <small id="orders-arrival-quantity-help">
                  {minimum > 0
                    ? `Informe de ${minimum} a ${maximum}. Mantenha as ${reservedCount} unidades reservadas.`
                    : `Informe de 0 a ${maximum}.`}
                </small>
              </label>
              <label>
                Evidência e motivo
                <textarea
                  ref={receiveReasonRef}
                  name="reason"
                  required
                  minLength={3}
                  maxLength={1000}
                  aria-invalid={receiveErrorField === "reason"}
                  aria-describedby={receiveErrorField === "reason" ? "orders-arrival-error" : undefined}
                  onChange={() => { setReceiveError(""); setReceiveErrorField(null); }}
                />
              </label>
              <Button disabled={busy || loading} type="submit">Confirmar conferência</Button>
            </form>
        )}
      </Surface>

      <Surface open={reserve && !compact} onOpenChange={setReserve} title="Revisar montagem" description="Confirme as unidades antes de montar." className="orders-review-surface">{reviewForm}</Surface>
    </OrdersWorkspace>
  );
}
