"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowDown, ChevronDown, ChevronRight, ListFilter, Package, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrdersBottomSheet } from "@/components/orders/orders-workspace";
import { costRequest } from "@/components/packages/package-cost-client";
import { formatMoney } from "@/lib/domain/money";
import type { listLogisticsPackages, PackageListQuery } from "@/lib/domain/logistics-package-list";
import "./orders.css";

type PackageList = Awaited<ReturnType<typeof listLogisticsPackages>>;
type MobileStageFilter = "all" | "preparing" | "sent" | "received";

const sortOptions: { value: PackageListQuery["sort"]; label: string }[] = [
  { value: "recent", label: "Mais recentes" },
  { value: "oldest", label: "Mais antigos" },
  { value: "name_asc", label: "Nome (A–Z)" },
  { value: "name_desc", label: "Nome (Z–A)" },
];

function listQueryString(query: PackageListQuery) {
  const params = new URLSearchParams();
  if (query.filter !== "all") params.set("filter", query.filter);
  if (query.pendingOnly) params.set("pendingOnly", "true");
  if (query.search) params.set("search", query.search);
  if (query.sort !== "recent") params.set("sort", query.sort);
  if (query.page) params.set("page", String(query.page));
  return params.toString();
}

function packageListHref(query: PackageListQuery) {
  const search = listQueryString(query);
  return search ? `/packages?${search}` : "/packages";
}

function costTitle(row: PackageList["rows"][number]) {
  if (row.costSummary.state === "closed") return row.costSummary.title;
  if (row.costSummary.state === "pending" || row.costSummary.state === "empty") return row.costSummary.title;
  return formatMoney(row.costSummary.knownCents);
}

export function LogisticsPackagesScreen({ initialQuery }: { initialQuery: PackageListQuery }) {
  const [data, setData] = useState<PackageList | null>(null);
  const [error, setError] = useState("");
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const [queryState, setQueryState] = useState(initialQuery);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState<{ filter: MobileStageFilter; pendingOnly: boolean }>({ filter: "all", pendingOnly: false });
  const [retryKey, setRetryKey] = useState(0);
  const query = listQueryString(queryState);
  const requestKey = `${query}:${retryKey}`;
  const loading = loadedQuery !== requestKey;
  const listHref = packageListHref(queryState);

  useEffect(() => {
    let active = true;
    void costRequest<PackageList>(`/api/logistics/packages?${query}`)
      .then(result => {
        if (!active) return;
        if (result.ok && result.data) {
          setData(result.data);
          setError("");
        } else {
          setError(result.error ?? "Não foi possível carregar os pacotes.");
        }
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar os pacotes.");
      })
      .finally(() => {
        if (active) setLoadedQuery(requestKey);
      });
    return () => { active = false; };
  }, [query, requestKey]);

  function updateQuery(next: PackageListQuery) {
    setQueryState(next);
    const href = packageListHref(next);
    window.history.replaceState(null, "", href);
  }

  function updateFilter(filter: PackageListQuery["filter"]) {
    updateQuery({ ...queryState, filter, page: 0 });
  }

  function updatePendingOnly(pendingOnly: boolean) {
    updateQuery({ ...queryState, pendingOnly, page: 0 });
  }

  function openMobileFilters() {
    const stage = ["preparing", "sent", "received"].includes(queryState.filter) ? queryState.filter as MobileStageFilter : "all";
    setFilterDraft({ filter: stage, pendingOnly: queryState.pendingOnly || queryState.filter === "pending" });
    setFilterOpen(true);
  }

  function applyMobileFilters() {
    updateQuery({ ...queryState, filter: filterDraft.filter, pendingOnly: filterDraft.pendingOnly, page: 0 });
    setFilterOpen(false);
  }

  const rows = data?.rows ?? [];
  const counts = data?.counts ?? { all: 0, pending: 0, preparing: 0, sent: 0, received: 0 };
  const filtered = queryState.filter !== "all" || queryState.pendingOnly || !!queryState.search;
  const visibleCount = Math.min((queryState.page + 1) * 20, data?.pagination.total ?? 0);
  const currentSort = sortOptions.find(option => option.value === queryState.sort)?.label ?? "Mais recentes";

  return (
    <section className="orders-package-list" aria-labelledby="packages-heading">
      <header className="orders-package-heading">
        <div>
          <h1 id="packages-heading">Pacotes</h1>
          <p>Envios e custos do grupo em um só lugar.</p>
        </div>
        <Button asChild className="orders-package-create">
          <Link href="/orders"><Plus size={17} aria-hidden="true" /> Montar pacote</Link>
        </Button>
      </header>

      <div className="orders-package-tools">
        <label className="orders-package-search">
          <Search size={19} aria-hidden="true" />
          <span className="sr-only">Buscar pacote</span>
          <input
            type="search"
            value={queryState.search}
            placeholder="Buscar pacote..."
            onChange={event => updateQuery({ ...queryState, search: event.target.value, page: 0 })}
          />
        </label>
        <details className="orders-package-filter-menu">
          <summary><ListFilter size={19} aria-hidden="true" /><span>Filtros</span><ChevronDown size={15} aria-hidden="true" /></summary>
          <div className="orders-package-filter-popover">
            <label>
              Situação
              <select value={queryState.filter === "pending" ? "all" : queryState.filter} onChange={event => updateFilter(event.target.value as PackageListQuery["filter"])}>
                <option value="all">Todas as situações</option>
                <option value="preparing">Em montagem</option>
                <option value="sent">A caminho</option>
                <option value="received">Recebidos</option>
              </select>
            </label>
            <label className="orders-package-pending-option">
              <input type="checkbox" checked={queryState.pendingOnly || queryState.filter === "pending"} onChange={event => {
                if (queryState.filter === "pending") updateQuery({ ...queryState, filter: "all", pendingOnly: event.target.checked, page: 0 });
                else updatePendingOnly(event.target.checked);
              }} />
              <span>Somente com pendências</span>
            </label>
            <Button type="button" variant="outline" onClick={() => updateQuery({ ...queryState, filter: "all", pendingOnly: false, search: "", page: 0 })}>Limpar filtros</Button>
          </div>
        </details>
        <button className="orders-package-mobile-filter" type="button" onClick={openMobileFilters} aria-haspopup="dialog" aria-expanded={filterOpen}>
          <ListFilter size={18} aria-hidden="true" /><span>Filtros</span><ChevronDown size={15} aria-hidden="true" />
        </button>
        <label className="orders-package-sort">
          <ArrowDown size={17} aria-hidden="true" />
          <span>Ordenar</span>
          <select aria-label="Ordenar pacotes" value={queryState.sort} onChange={event => updateQuery({ ...queryState, sort: event.target.value as PackageListQuery["sort"], page: 0 })}>
            {sortOptions.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
          <ChevronDown size={15} aria-hidden="true" />
        </label>
      </div>

      <nav className="orders-package-counts" aria-label="Filtros rápidos de pacotes">
        <button type="button" className={queryState.filter === "all" && !queryState.pendingOnly ? "selected" : ""} onClick={() => updateQuery({ ...queryState, filter: "all", pendingOnly: false, page: 0 })} aria-pressed={queryState.filter === "all" && !queryState.pendingOnly}>
          <span>Todos</span><strong>{counts.all}</strong>
        </button>
        <button type="button" className={queryState.pendingOnly || queryState.filter === "pending" ? "selected" : ""} onClick={() => {
          if (queryState.filter === "pending") updateQuery({ ...queryState, filter: "all", pendingOnly: false, page: 0 });
          else updatePendingOnly(!queryState.pendingOnly);
        }} aria-pressed={queryState.pendingOnly || queryState.filter === "pending"}>
          <span className="orders-package-count-dot" aria-hidden="true" />
          <span className="orders-package-pending-label-desktop">Com pendências</span><span className="orders-package-pending-label-mobile">Pendências</span><strong>{counts.pending}</strong>
        </button>
        <button type="button" className={queryState.filter === "preparing" ? "selected" : ""} onClick={() => updateFilter(queryState.filter === "preparing" ? "all" : "preparing")} aria-pressed={queryState.filter === "preparing"}>
          <span>Em montagem</span><strong>{counts.preparing}</strong>
        </button>
        <button type="button" className={`orders-package-received-filter${queryState.filter === "received" ? " selected" : ""}`} onClick={() => updateFilter(queryState.filter === "received" ? "all" : "received")} aria-pressed={queryState.filter === "received"}>
          <span>Recebidos</span><strong>{counts.received}</strong>
        </button>
      </nav>

      <div className="orders-package-mobile-meta">
        <span>{data ? `${data.pagination.total} ${data.pagination.total === 1 ? "pacote" : "pacotes"}` : "Pacotes"}</span>
        <button type="button" className="orders-package-mobile-sort" onClick={() => setSortOpen(true)} aria-haspopup="dialog" aria-expanded={sortOpen}>
          <span>{currentSort}</span><ChevronDown size={15} aria-hidden="true" />
        </button>
      </div>

      {!loading && error && (
        <div className="orders-request-error">
          <p role="alert" className="form-error">{error}</p>
          <Button type="button" variant="outline" onClick={() => { setError(""); setRetryKey(value => value + 1); }}>Tentar novamente</Button>
        </div>
      )}
      {loading && <p className="orders-package-loading" role="status">Carregando pacotes…</p>}

      {!loading && !error && data && !rows.length && (
        <div className="orders-package-empty">
          <h2>{filtered ? "Nenhum pacote encontrado" : "Nenhum pacote por aqui ainda"}</h2>
          <p>{filtered ? "Ajuste a busca ou os filtros para ver outros pacotes." : "Monte um pacote com unidades que já estão disponíveis em Pedidos."}</p>
          <div>
            {filtered && <Button type="button" variant="outline" onClick={() => updateQuery({ ...queryState, filter: "all", pendingOnly: false, search: "", page: 0 })}>Limpar busca e filtros</Button>}
            <Button asChild><Link href="/orders"><Plus size={16} aria-hidden="true" /> Montar pacote</Link></Button>
          </div>
        </div>
      )}

      <div className="orders-package-table-wrap" aria-busy={loading}>
        {!!rows.length && <div className="orders-package-table-head" aria-hidden="true"><span>Pacote</span><span>Logística</span><span>Custos e pendências</span><span /> </div>}
        <div className="orders-package-table">
          {!loading && !error && rows.map(row => {
            const detailHref = `/packages/detail/${encodeURIComponent(row.pkg.id)}?returnTo=${encodeURIComponent(listHref)}`;
            const logisticsLabel = row.pkg.stage === "received" ? "Recebido" : row.pkg.stage === "sent" ? "A caminho" : "Em montagem";
            const logisticsClass = row.pkg.stage === "received" ? "received" : "preparing";
            const secondary = row.pkg.weightGrams
              ? `${row.unitCount} unidades · ${new Intl.NumberFormat("pt-BR").format(row.pkg.weightGrams)} g`
              : row.productCount ? `${row.unitCount} unidades · ${row.productCount} ${row.productCount === 1 ? "produto" : "produtos"}` : `${row.unitCount} unidades`;
            const amountVisible = row.costSummary.knownCents > 0 && row.costSummary.state !== "closed";
            const mainCost = amountVisible ? formatMoney(row.costSummary.knownCents) : costTitle(row);
            const actionsTitle = row.pendingActions.map(action => action.label).join(" · ");
            return (
              <article className="orders-package-card" key={row.pkg.id} data-has-pending={row.pendingActions.length > 0}>
                <div className="orders-package-identity">
                  <span className="orders-package-symbol" aria-hidden="true"><Package size={21} strokeWidth={1.8} /></span>
                  <div>
                    <Link className="orders-package-name" href={detailHref}>{row.pkg.name}</Link>
                    <p>{secondary}</p>
                    {row.pkg.reviewState === "pending_review" && <p className="orders-package-review">Conferência legada pendente</p>}
                  </div>
                </div>
                <div className="orders-package-logistics">
                  <span className={`orders-package-stage ${logisticsClass}`}>{logisticsLabel}</span>
                </div>
                <div className={`orders-package-finance ${row.costSummary.state}`} title={actionsTitle || undefined}>
                  <strong>{mainCost}</strong>
                  <p>{row.costSummary.description}</p>
                  {row.pendingActions.length > 0 && <span className="sr-only">Ações pendentes: {actionsTitle}</span>}
                </div>
                <div className="orders-package-open">
                  <Button variant="outline" asChild><Link href={detailHref} aria-label={`Abrir pacote ${row.pkg.name}`}><span>Abrir</span><ChevronRight size={15} aria-hidden="true" /></Link></Button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {!loading && !error && rows.length > 0 && <p className="orders-package-mobile-footer">Mostrando {visibleCount} de {data?.pagination.total ?? 0} pacotes</p>}

      {!loading && !error && (data?.pagination.total ?? 0) > 20 && (
        <nav className="orders-pagination" aria-label="Páginas de pacotes">
          <Button variant="outline" disabled={!queryState.page} onClick={() => updateQuery({ ...queryState, page: queryState.page - 1 })}>Anterior</Button>
          <span>{queryState.page + 1} / {Math.ceil((data?.pagination.total ?? 0) / 20)}</span>
          <Button variant="outline" disabled={!data?.pagination.hasMore} onClick={() => updateQuery({ ...queryState, page: queryState.page + 1 })}>Próxima</Button>
        </nav>
      )}

      <OrdersBottomSheet title="Filtros" open={filterOpen} onOpenChange={setFilterOpen} className={`orders-package-filter-sheet${counts.sent > 0 || filterDraft.filter === "sent" ? " has-sent" : ""}`}>
        <div className="orders-package-sheet-content">
          <fieldset className="orders-package-sheet-stages">
            <legend>Situação</legend>
            <label><input type="radio" name="package-stage-filter" value="all" checked={filterDraft.filter === "all"} onChange={() => setFilterDraft({ ...filterDraft, filter: "all" })} /><span>Todos os pacotes</span><strong>{counts.all}</strong></label>
            <label><input type="radio" name="package-stage-filter" value="preparing" checked={filterDraft.filter === "preparing"} onChange={() => setFilterDraft({ ...filterDraft, filter: "preparing" })} /><span>Em montagem</span><strong>{counts.preparing}</strong></label>
            {(counts.sent > 0 || filterDraft.filter === "sent") && <label><input type="radio" name="package-stage-filter" value="sent" checked={filterDraft.filter === "sent"} onChange={() => setFilterDraft({ ...filterDraft, filter: "sent" })} /><span>A caminho</span><strong>{counts.sent}</strong></label>}
            <label><input type="radio" name="package-stage-filter" value="received" checked={filterDraft.filter === "received"} onChange={() => setFilterDraft({ ...filterDraft, filter: "received" })} /><span>Recebidos</span><strong>{counts.received}</strong></label>
          </fieldset>
          <div className="orders-package-sheet-pending">
            <label htmlFor="packages-pending-only"><span>Pendências</span><span>Somente com pendências</span></label>
            <input id="packages-pending-only" type="checkbox" role="switch" checked={filterDraft.pendingOnly} onChange={event => setFilterDraft({ ...filterDraft, pendingOnly: event.target.checked })} />
          </div>
          <div className="orders-package-sheet-actions">
            <Button type="button" variant="outline" onClick={() => setFilterDraft({ filter: "all", pendingOnly: false })}>Limpar</Button>
            <Button type="button" onClick={applyMobileFilters}>Aplicar filtros</Button>
          </div>
        </div>
      </OrdersBottomSheet>

      <OrdersBottomSheet title="Ordenar pacotes" open={sortOpen} onOpenChange={setSortOpen} className="orders-package-sort-sheet">
        <fieldset className="orders-package-sheet-sort-options">
          <legend className="sr-only">Ordenar pacotes</legend>
          {sortOptions.map(option => (
            <label key={option.value}>
              <input type="radio" name="package-sort" value={option.value} checked={queryState.sort === option.value} onChange={() => {
                updateQuery({ ...queryState, sort: option.value, page: 0 });
                setSortOpen(false);
              }} />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
      </OrdersBottomSheet>
    </section>
  );
}
