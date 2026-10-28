"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { QcGalleryButton } from "@/components/qc/qc-components";
import { Button } from "@/components/ui/button";
import { PackageSurface as Surface } from "@/components/packages/package-surface";
import { costRequest } from "@/components/packages/package-cost-client";
import { useWorkspace } from "@/components/workspace-provider";
import { ProductCategoryMarker } from "@/components/product-category-icons";
import { formatMoney } from "@/lib/domain/money";
import { unitMinorCapacity } from "@/lib/domain/warehouse-calculations";
import type { warehouseServices } from "@/lib/domain/warehouse-services";
import "./orders.css";

export type WarehouseData = Awaited<
  ReturnType<ReturnType<typeof warehouseServices>["list"]>
>;
type Row = WarehouseData["rows"][number];
export type OrdersFilters = {
  search: string;
  account: string;
  person: string;
  origin: string;
  trackingId: string;
  status: string;
  page: number;
};

const filterKeys = [
  "search",
  "account",
  "person",
  "origin",
  "trackingId",
  "status",
] as const;

function sameFilters(left: OrdersFilters, right: OrdersFilters) {
  return filterKeys.every((key) => left[key] === right[key]);
}

function filtersUrl(filters: OrdersFilters) {
  const params = new URLSearchParams();
  for (const key of filterKeys) {
    if (filters[key]) params.set(key, filters[key]);
  }
  if (filters.page) params.set("page", String(filters.page));
  const search = params.toString();
  return search ? `/orders?${search}` : "/orders";
}

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
  const [data, setData] = useState<WarehouseData | null>(null);
  const [error, setError] = useState("");
  const [loadedRequestKey, setLoadedRequestKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState(initialFilters);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [packagePage, setPackagePage] = useState(0);
  const [selected, setSelected] = useState<
    Record<string, { quantity: number; row: Row }>
  >({});
  const [receive, setReceive] = useState<Row | null>(null);
  const [reserve, setReserve] = useState(false);
  const [receiveError, setReceiveError] = useState("");
  const [receiveErrorField, setReceiveErrorField] = useState<
    "account" | "quantity" | "reason" | null
  >(null);
  const [reserveError, setReserveError] = useState("");
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
  const filtersPending = !sameFilters(filters, draftFilters);
  const advancedCount =
    Number(Boolean(filters.account)) +
    Number(Boolean(filters.person)) +
    Number(Boolean(filters.origin)) +
    Number(Boolean(filters.trackingId));
  const hasAnyFilter = filterKeys.some((key) => Boolean(filters[key]));
  const hasDraftFilter = filterKeys.some((key) => Boolean(draftFilters[key]));

  useEffect(() => {
    let active = true;
    void costRequest<WarehouseData>(`/api/warehouse?${query}`)
      .then((result) => {
        if (!active) return;
        if (result.ok && result.data) {
          setData(result.data);
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
  }, [query, requestKey]);

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
  const selection = Object.values(selected)
    .filter((value) => value.quantity > 0)
    .map((value) => value.row);
  const selectedUnitCount = selection.reduce(
    (count, row) => count + selected[row.costItemId].quantity,
    0,
  );
  const selectedBase = selection.every((row) =>
    row.unitComponents?.every((component) => component.amountCents !== null),
  )
    ? selection.reduce(
        (sum, row) =>
          sum +
          row.availableUnits
            .slice(0, selected[row.costItemId].quantity)
            .reduce(
              (unitSum, index) =>
                unitSum +
                row.unitComponents!.reduce(
                  (componentSum, component) =>
                    componentSum +
                    unitMinorCapacity(
                      component.amountCents!,
                      row.quantity,
                      index,
                    ),
                  0,
                ),
              0,
            ),
        0,
      )
    : null;

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
  }

  function clearFilters() {
    const cleared: OrdersFilters = {
      search: "",
      account: "",
      person: "",
      origin: "",
      trackingId: "",
      status: "",
      page: 0,
    };
    window.history.replaceState(window.history.state, "", "/orders");
    setDraftFilters(cleared);
    setFilters(cleared);
  }

  function ordersReturnUrl() {
    return filtersUrl(filters);
  }

  function movePage(page: number) {
    const next = { ...filters, page };
    window.history.replaceState(window.history.state, "", filtersUrl(next));
    setFilters(next);
  }

  async function submit(
    command: Record<string, unknown>,
    onError: (message: string) => void = setError,
  ) {
    setBusy(true);
    const result = await costRequest("/api/warehouse", {
      workspaceId: workspace.workspaceId,
      idempotencyKey: crypto.randomUUID(),
      command,
    });
    setBusy(false);
    if (!result.ok) {
      onError(result.error ?? "A operação não foi concluída.");
      return false;
    }
    setError("");
    setReceiveError("");
    setReceiveErrorField(null);
    setReserveError("");
    setReceive(null);
    setReserve(false);
    setSelected({});
    setRefreshKey((current) => current + 1);
    return true;
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

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Pedidos</h1>
          <p className="muted">
            Da compra ao armazém. Confira a chegada e escolha o que vai junto.
          </p>
        </div>
      </div>
      {!loading && error && (
        <div className="orders-request-error">
          <p role="alert" className="form-error">{error}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setError("");
              setRefreshKey((current) => current + 1);
            }}
          >
            Tentar carregar novamente
          </Button>
        </div>
      )}

      <form className="orders-filters" onSubmit={applyFilters}>
        <div className="orders-filter-primary">
          <label>
            Buscar
            <input
              value={draftFilters.search}
              onChange={(event) => updateDraft("search", event.target.value)}
              placeholder="Nome do produto"
              maxLength={200}
            />
          </label>
          <label>
            Etapa
            <select
              value={draftFilters.status}
              onChange={(event) => updateDraft("status", event.target.value)}
            >
              <option value="">Todas</option>
              <option value="review">Conferência legada</option>
              <option value="awaiting">Aguardando chegada</option>
              <option value="warehouse">No armazém</option>
              <option value="available">Disponível para pacote</option>
              <option value="package">Em pacote</option>
              <option value="sent">Enviado</option>
              <option value="received">Recebido</option>
            </select>
          </label>
          <Button
            type="button"
            variant="outline"
            className="orders-filter-toggle"
            aria-expanded={filtersOpen}
            aria-controls="orders-advanced-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            Filtros <span className="orders-filter-count">{advancedCount}</span>
          </Button>
          <Button type="submit" disabled={!filtersPending || loading}>
            Aplicar filtros
          </Button>
        </div>

        <div
          id="orders-advanced-filters"
          className="orders-filter-advanced"
          hidden={!filtersOpen}
        >
          <label>
            Conta
            <select
              value={draftFilters.account}
              onChange={(event) => updateDraft("account", event.target.value)}
            >
              <option value="">Todas</option>
              {data?.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Pessoa
            <select
              value={draftFilters.person}
              onChange={(event) => updateDraft("person", event.target.value)}
            >
              <option value="">Todas</option>
              {workspace.members.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Origem
            <select
              value={draftFilters.origin}
              onChange={(event) => updateDraft("origin", event.target.value)}
            >
              <option value="">Todas</option>
              <option value="original">Compra</option>
              <option value="additional">Adicional</option>
            </select>
          </label>
          <label>
            Compra
            <select
              value={draftFilters.trackingId}
              onChange={(event) => updateDraft("trackingId", event.target.value)}
            >
              <option value="">Todas</option>
              {data?.origins.map((origin) => (
                <option key={origin.trackingId} value={origin.trackingId}>
                  {origin.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {(activeAdvancedFilters.length > 0 || hasAnyFilter || hasDraftFilter) && (
          <div className="orders-filter-state">
            {activeAdvancedFilters.length > 0 && (
              <div className="orders-active-filters" aria-label="Filtros aplicados">
                {activeAdvancedFilters.map((label) => (
                  <span className="orders-active-filter" key={label}>
                    {label}
                  </span>
                ))}
              </div>
            )}
            {filtersPending && (
              <p role="status">Há alterações de filtro ainda não aplicadas.</p>
            )}
            <Button
              type="button"
              variant="ghost"
              disabled={loading}
              onClick={clearFilters}
            >
              Limpar filtros
            </Button>
          </div>
        )}
      </form>

      <div className="orders-selection" aria-live="polite">
        <span>
          {selectedUnitCount} {selectedUnitCount === 1 ? "unidade selecionada" : "unidades selecionadas"} · {selectedBase === null ? "Base a conferir" : formatMoney(selectedBase)}
        </span>
        <Button
          disabled={!selection.length || busy || loading}
          onClick={() => {
            if (new Set(selection.map((row) => row.accountId)).size !== 1) {
              setError("Selecione unidades de uma única conta HubBuy.");
            } else {
              setReserveError("");
              setReserve(true);
            }
          }}
        >
          Montar pacote
        </Button>
        {selection.length > 0 && (
          <Button variant="ghost" disabled={busy} onClick={() => setSelected({})}>
            Limpar seleção
          </Button>
        )}
      </div>

      {loading && (
        <p role="status" className="orders-load-status">
          {data ? "Atualizando pedidos…" : "Carregando pedidos…"}
        </p>
      )}
      {!loading && !error && data && !rows.length && (
        <div className="orders-empty">
          <h2>
            {hasAnyFilter
              ? "Nenhum pedido corresponde aos filtros aplicados"
              : "Nenhum item no armazém"}
          </h2>
          <p>
            {hasAnyFilter
              ? "Revise os filtros ou use Limpar filtros para ver outros pedidos."
              : "Os pedidos aparecem após finalizar uma compra."}
          </p>
          {hasAnyFilter && (
            <Button type="button" variant="outline" onClick={clearFilters}>
              Limpar filtros
            </Button>
          )}
        </div>
      )}

      <div className="orders-list orders-table-wrap" aria-busy={loading}>
        {!loading && !error && rows.length > 0 && <table className="orders-table">
          <caption className="sr-only">Pedidos: quantidades físicas, custo até o armazém, pagamento e fotos QC. Recebidas inclui unidades vinculadas a pacotes.</caption>
          <thead><tr>
            <th scope="col">Produto</th>
            <th scope="col">Compradas</th>
            <th scope="col">Recebidas</th>
            <th scope="col">Disponíveis</th>
            <th scope="col">Vinculadas</th>
            <th scope="col">Até o armazém</th>
            <th scope="col">Pagamento / QC</th>
            <th scope="col">Selecionar</th>
            <th scope="col"><span className="sr-only">Ações</span></th>
          </tr></thead>
          <tbody>
        {!loading && !error && rows.map((row) => {
          const returnTo = ordersReturnUrl();
          const detailParams = new URLSearchParams({
            item: row.costItemId,
            returnTo,
          });
          const itemHref = `/orders/${encodeURIComponent(row.order.id)}?${detailParams.toString()}`;
          const expanded = !!expandedRows[row.costItemId];
          const detailsId = `order-details-${row.costItemId}`;
          const purchaseId = data?.origins.find(origin => origin.trackingId === row.cost.trackingId)?.purchaseId;
          const qcTarget = row.cost.purchaseItemId ? `purchase:${row.cost.purchaseItemId}` : `additional:${row.cost.additionalOrderItemId}`;
          return (
            <Fragment key={row.costItemId}>
            <tr className="orders-row orders-table-row" data-selected={!!selected[row.costItemId]?.quantity}>
              <th scope="row" className="orders-row-main">
                <div className="orders-product-heading">
                  <ProductCategoryMarker visualKey={row.source.visualKey} />
                  <Link className="orders-name" href={itemHref} aria-label={`Abrir compra e custos de ${row.name}`}>{row.name}</Link>
                </div>
                <p className="muted">{row.order.kind === "additional" ? "Adicional" : "Compra"} · {row.source.variant || "Sem variação"}</p>
                {row.reviewState === "pending_review" && <p className="orders-review-note">Conferência legada pendente</p>}
              </th>
              <td className="orders-unit-cell" data-label="Compradas">{row.quantity}</td>
              <td className="orders-unit-cell" data-label="Recebidas">{row.reviewState === "pending_review" ? <span aria-label="Recebidas a conferir">A conferir</span> : row.receivedUnits.length}</td>
              <td className="orders-unit-cell" data-label="Disponíveis">{row.availableUnits.length}</td>
              <td className="orders-unit-cell" data-label="Vinculadas">
                <button type="button" className="orders-linked-count" aria-label={`Ver ${row.reservations.length} unidades vinculadas de ${row.name}`} aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpandedRows(current => ({ ...current, [row.costItemId]: !expanded }))}>{row.reservations.length}</button>
              </td>
              <td className="orders-money-cell" data-label="Até o armazém">
                {row.financial ? <>{formatMoney(row.financial.total.finalCents ?? row.financial.total.knownCents)}{row.financial.total.finalCents === null && <small>Parcial</small>}</> : "A conferir"}
              </td>
              <td className="orders-status-cell" data-label="Pagamento e fotos">
                <span className="orders-payment" aria-label={`Pagamento: ${row.paymentStatus === "paid" ? "produtos pagos" : "não confirmado"}`}>{row.paymentStatus === "paid" ? "Produtos pagos" : "Não confirmado"}</span>
                <div className="orders-qc" aria-label="Fotos QC">
                  {row.qcCount > 0 && purchaseId ? <QcGalleryButton purchaseId={purchaseId} itemId={qcTarget} itemName={row.name} triggerLabel="Fotos QC" triggerAriaLabel={`Ver ${row.qcCount} fotos QC de ${row.name}`} /> : <span>Sem fotos QC</span>}
                </div>
              </td>
              <td className="orders-select-cell" data-label="Selecionar">
                  <input
                    type="number"
                    min="0"
                    max={row.availableUnits.length}
                    value={selected[row.costItemId]?.quantity ?? 0}
                    aria-label={`Unidades de ${row.name} para selecionar`}
                    disabled={!row.availableUnits.length || busy || loading}
                    onChange={(event) => setSelected({
                      ...selected,
                      [row.costItemId]: {
                        row,
                        quantity: Math.max(0, Math.min(row.availableUnits.length, Number(event.target.value))),
                      },
                    })}
                  />
              </td>
              <td className="orders-table-actions">
                <Button
                  variant="outline"
                  disabled={busy || loading}
                  aria-label={`Conferir chegada de ${row.name}`}
                  onClick={() => {
                    setReceiveError("");
                    setReceiveErrorField(null);
                    setReceive(row);
                  }}
                >
                  Chegada
                </Button>
                <Button variant="ghost" aria-label={`Detalhes de ${row.name}`} aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpandedRows(current => ({ ...current, [row.costItemId]: !expanded }))}>
                  Detalhes <ChevronDown size={14} aria-hidden="true" className={expanded ? "orders-chevron-open" : ""} />
                </Button>
              </td>
            </tr>
            <tr className="orders-details-row" id={detailsId} hidden={!expanded}>
              <td colSpan={9}><div className="orders-row-details">
                <div><h3>Produto e participantes</h3><p>{row.source.variant || "Sem variação"} · {row.participants.map(person => workspace.members.find(member => member.id === person.personId)?.name ?? "Membro").join(", ")}</p><p>{row.cancelledUnits.length} canceladas · Recebidas inclui unidades vinculadas.</p><Link href={itemHref}>Abrir compra e custos</Link></div>
                <div><h3>Composição até o armazém</h3>{row.financial ? <dl>{([["Produto", row.financial.product], ["China", row.financial.china], ["Taxa", row.financial.productFee]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatMoney(value.knownCents)}{value.finalCents === null ? " parcial" : ""}</dd></div>)}</dl> : <p>Bases a conferir</p>}</div>
                <div className="orders-reserved"><h3>Destino das unidades</h3>{row.reservations.length ? [...new Set(row.reservations.map(reservation => reservation.packageId))].map(id => {
                  const pkg = data?.packages.find(candidate => candidate.id === id);
                  const count = row.reservations.filter(reservation => reservation.packageId === id).length;
                  return <p key={id}><Link href={`/packages/detail/${encodeURIComponent(id)}`}>{count} {count === 1 ? "unidade" : "unidades"} · {pkg?.contentClosedAt && pkg.freightConfirmed ? pkg.stage === "sent" ? "Enviado em" : pkg.stage === "received" ? "Recebido em" : "Em pacote" : "Reservado no pacote"} {pkg?.name ?? "Ver pacote"}</Link></p>;
                }) : <p>Nenhuma unidade vinculada a pacote.</p>}<p className="muted">Fotos QC não confirmam chegada nem aprovação.</p></div>
              </div></td>
            </tr>
            </Fragment>
          );
        })}
          </tbody>
        </table>}
      </div>

      {!loading && !error && (data?.pagination.total ?? 0) > 20 && (
        <nav aria-label="Páginas de pedidos" className="orders-pagination">
          <Button variant="outline" disabled={filters.page === 0 || busy} onClick={() => movePage(filters.page - 1)}>
            Anterior
          </Button>
          <span>{filters.page + 1} / {Math.ceil((data?.pagination.total ?? 0) / 20)}</span>
          <Button variant="outline" disabled={!data?.pagination.hasMore || busy} onClick={() => movePage(filters.page + 1)}>
            Próxima
          </Button>
        </nav>
      )}

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
        sheet
      >
        {receive && (() => {
          const eligible = Array.from({ length: receive.quantity }, (_, index) => index)
            .filter((index) => !receive.cancelledUnits.includes(index));
          const minimum = minimumReceivedCount(receive);
          const maximum = eligible.length;
          const reservedCount = receive.reservations.length;
          const receivedCount = receive.receivedUnits.length;
          const productLabel = `${receive.name}${receive.source.variant ? ` · ${receive.source.variant}` : ""}`;
          return (
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
          );
        })()}
      </Surface>

      <Surface
        open={reserve}
        onOpenChange={(open) => {
          setReserve(open);
          if (!open) setReserveError("");
        }}
        title="Montar pacote"
        sheet
      >
        <form
          className="orders-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const packageId = String(form.get("package") ?? "");
            const pkg = data?.packages.find((candidate) => candidate.id === packageId);
            void submit({
              operation: "reserve",
              accountId: String(form.get("account")),
              ...(pkg ? { packageId: pkg.id, expectedRevision: pkg.revision } : { name: String(form.get("name")) }),
              selection: selection.map((row) => ({
                costItemId: row.costItemId,
                expectedRevision: row.revision,
                units: row.availableUnits.slice(0, selected[row.costItemId].quantity),
              })),
              reason: String(form.get("reason")),
            }, setReserveError);
          }}
        >
          <p>
            {selection.length} itens · {selection.reduce((count, row) => count + selected[row.costItemId].quantity, 0)} unidades. Somente itens da mesma conta podem viajar juntos.
          </p>
          {reserveError && <p ref={reserveErrorRef} tabIndex={-1} role="alert" className="orders-form-error">{reserveError}</p>}
          <label>
            Conta
            <select name="account" required defaultValue={selection[0]?.accountId ?? ""}>
              <option value="" disabled>Selecione</option>
              {data?.accounts.filter((account) => account.status === "active").map((account) => (
                <option key={account.id} value={account.id}>{account.label}</option>
              ))}
            </select>
          </label>
          {data && data.packageOptions.total > 100 && (
            <nav className="orders-pagination" aria-label="Opções de pacotes">
              <Button type="button" variant="outline" disabled={!packagePage} onClick={() => setPackagePage(packagePage - 1)}>Anterior</Button>
              <span>{packagePage + 1} / {Math.ceil(data.packageOptions.total / 100)}</span>
              <Button type="button" variant="outline" disabled={!data.packageOptions.hasMore} onClick={() => setPackagePage(packagePage + 1)}>Mais pacotes</Button>
            </nav>
          )}
          <label>
            Destino
            <select name="package">
              <option value="">Criar novo pacote</option>
              {data?.packages.filter((pkg) => pkg.stage === "preparing" && !pkg.contentClosedAt && pkg.reviewState === "confirmed" && !pkg.financialClosedAt).map((pkg) => (
                <option key={pkg.id} value={pkg.id}>{pkg.name}</option>
              ))}
            </select>
          </label>
          <label>Nome para novo pacote<input name="name" maxLength={120} placeholder="Ex.: Envio de novembro" /></label>
          <label>Motivo<textarea name="reason" required minLength={3} maxLength={1000} /></label>
          <Button disabled={busy} type="submit">Confirmar reserva</Button>
        </form>
      </Surface>
    </>
  );
}
