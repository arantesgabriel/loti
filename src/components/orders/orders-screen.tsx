"use client";

import { LoadingState } from "@/components/ui/loading-state";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, SlidersHorizontal, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCategoryMarker } from "@/components/product-category-icons";
import { OrdersContextSurface as Surface } from "./orders-context-surface";
import { keepPreviousData, useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { logisticsQuery, orderItemsParams, packageDestinationsParams } from "./logistics-query";
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
import { OrdersReservationActions } from "./orders-reservation-actions";
import { BulkArrivalFields, BulkOrderActions, arrivalAccounts, remainingArrivalUnits } from "./orders-bulk-actions";
import { OpenPackagePicker } from "./open-package-picker";
import { OrdersFilterSurface } from "./orders-filter-surface";
import { emptyOrdersFilters, filtersUrl, ordersFilterKeys as filterKeys, orderSortOptions, matchesArrivalFilters, parseOrdersFilters, type OrderSort, type OrdersFilters, type OrdersView } from "./orders-list-state";
export type { OrdersFilters } from "./orders-list-state";

export type WarehouseData = Awaited<
  ReturnType<ReturnType<typeof warehouseServices>["list"]>
>;
type Row = WarehouseData["rows"][number];
type ArrivalLine = { costItemId: string; expectedRevision: number; accountId: string; quantity: number; description?: string };
type ArrivalAttempt = { idempotencyKey: string; arrivals: ArrivalLine[] };
class ArrivalError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
  get uncertain() { return this.status === 0 || this.status >= 500; }
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
  initialItemId,
}: {
  initialFilters: OrdersFilters;
  initialItemId?: string;
}) {
  const { data: workspace, registerWorkspaceDraft } = useWorkspace();
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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState(() => workspace.workspaceKind === "personal" ? { ...initialFilters, person: "" } : initialFilters);
  const [draftFilters, setDraftFilters] = useState(() => workspace.workspaceKind === "personal" ? { ...initialFilters, person: "" } : initialFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [panel, setPanel] = useState<OrdersPanelState>(initialItemId ? { kind: "item-detail", itemId: initialItemId } : { kind: "closed" });
  const [linkedItem, setLinkedItem] = useState(initialItemId);
  const [packagePage, setPackagePage] = useState(0);
  const [packageSearch, setPackageSearch] = useState("");
  const [packageAccountId, setPackageAccountId] = useState("");
  const [selected, setSelected] = useState<OrdersSelection>({});
  const [reservationAction, setReservationAction] = useState<{ row: Row; mode: "release" | "move" } | null>(null);
  const selectedRef = useRef<OrdersSelection>({});
  function replaceSelection(next: OrdersSelection) { selectedRef.current = next; setSelected(next); }
  const [checkedRows, setCheckedRows] = useState<Record<string, Row>>({});
  const checkedCount = Object.keys(checkedRows).length;
  const [bulkArrival, setBulkArrival] = useState<Row[] | null>(null);
  const [bulkReviewVersion, setBulkReviewVersion] = useState(0);
  const [bulkDraft, setBulkDraft] = useState<ArrivalLine[]>([]);
  const [bulkConflict, setBulkConflict] = useState<{ attempt: ArrivalAttempt; fresh?: Row[]; accounts?: WarehouseData["accounts"] } | null>(null);
  const [bulkError, setBulkError] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [receive, setReceive] = useState<Row | null>(null);
  const [correctArrival, setCorrectArrival] = useState(false);
  const [arrivalQuantity, setArrivalQuantity] = useState<number | null>(null);
  const [arrivalRetry, setArrivalRetry] = useState<ArrivalAttempt | null>(null);
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

  useEffect(() => registerWorkspaceDraft("orders-warehouse-editor", reserve || !!bulkArrival || !!receive || !!packageName.trim() || !!reason.trim() || !!reservationAction), [registerWorkspaceDraft, reserve, bulkArrival, receive, packageName, reason, reservationAction]);

  useEffect(() => {
    if (workspace.workspaceKind === "personal" && initialFilters.person) {
      const next = { ...initialFilters, person: "", page: 0 };
      window.history.replaceState(window.history.state, "", filtersUrl(next));
    }
  }, [initialFilters, workspace.workspaceKind, workspace.workspaceId]);

  const client = useQueryClient();
  const scope = [workspace.currentUser.id, workspace.workspaceId] as const;
  const listParams = useMemo(() => new URLSearchParams({
    ...filters, sort: filters.sort ?? "", direction: filters.sort ? filters.direction ?? "asc" : "asc", page: String(filters.page), pageSize: "20", packageOptions: "exclude",
  }).toString(), [filters]);
  const warehouseQuery = (resource: string, params: string) => logisticsQuery<WarehouseData>(
    ...scope, resource, "/api/warehouse", params, "Não foi possível carregar os pedidos.",
  );
  const list = useQuery({ ...warehouseQuery("orders", listParams), placeholderData: keepPreviousData });
  const data = list.data;
  const loading = list.isPending || list.isPlaceholderData;
  const listError = list.error?.message;
  const detailId = panel.kind === "item-detail" ? panel.itemId : "";
  const detail = useQuery({
    ...warehouseQuery("order-items", orderItemsParams([detailId])),
    enabled: !!detailId,
  });
  const destinations = useQuery({
    ...warehouseQuery("destinations", packageDestinationsParams(packageAccountId, packageSearch, packagePage)),
    enabled: reserve,
  });
  const invalidateOrders = (affectsPackages = true) => {
    void client.invalidateQueries({ queryKey: [...scope, "orders"] });
    void client.invalidateQueries({ queryKey: [...scope, "order-items"] });
    if (affectsPackages) {
      void client.invalidateQueries({ queryKey: [...scope, "destinations"] });
      void client.invalidateQueries({ queryKey: [...scope, "packages"] });
    }
  };
  const arrivalKey = [...scope, "arrival"] as const;
  const activeArrivals = useMutationState({
    filters: { mutationKey: arrivalKey, exact: true, status: "pending" },
    select: mutation => mutation.state.variables as ArrivalAttempt,
  });
  const failedArrivals = useMutationState({
    filters: { mutationKey: arrivalKey, exact: true, status: "error" },
    select: mutation => mutation,
  });
  const retryArrivals = failedArrivals.filter(mutation => {
    const error = mutation.state.error;
    return error instanceof ArrivalError && error.uncertain;
  });
  const pendingItems = new Map([...activeArrivals, ...retryArrivals.map(mutation => mutation.state.variables as ArrivalAttempt)]
    .flatMap(attempt => attempt.arrivals.map(line => [line.costItemId, line] as const)));
  const arrivalMutation = useMutation({
    mutationKey: arrivalKey,
    mutationFn: async ({ idempotencyKey, arrivals }: ArrivalAttempt) => {
      const command = arrivals.length === 1 ? { operation: "register-arrival", ...arrivals[0] } : { operation: "register-arrivals", arrivals };
      const result = await costRequest<{ rows: Row[] }>("/api/warehouse", { idempotencyKey, command }, workspace.workspaceId);
      if (!result.ok || !result.data) throw new ArrivalError(result.error ?? "Não foi possível confirmar a chegada.", result.ok ? 0 : result.status);
      return result.data.rows;
    },
    gcTime: Infinity,
    onSuccess: async rows => {
      const affected = new Map(rows.map(row => [row.costItemId, row]));
      const relevantQuery = (key: readonly unknown[]) => key[2] === "orders" || key[2] === "order-items";
      const interrupted = client.getQueryCache().findAll({ queryKey: scope, fetchStatus: "fetching" })
        .filter(query => {
          const key = query.queryKey;
          if (key[2] === "order-items") {
            const ids = new URLSearchParams(String(key[3])).get("itemIds")?.split(",") ?? [];
            return ids.some(id => affected.has(id));
          }
          return key[2] === "orders";
        });
      await Promise.all(interrupted.map(query => client.cancelQueries({ queryKey: query.queryKey, exact: true })));
      const entries = client.getQueriesData<WarehouseData>({ queryKey: scope, predicate: query => relevantQuery(query.queryKey) });
      for (const [key, previous] of entries) {
        if (!previous || !previous.rows.some(row => affected.has(row.costItemId))) continue;
        await client.cancelQueries({ queryKey: key, exact: true });
        client.setQueryData<WarehouseData>(key, current => {
          if (!current) return current;
          const params = new URLSearchParams(String(key[3]));
          const rows = current.rows.flatMap(row => {
            const canonical = affected.get(row.costItemId);
            if (!canonical || canonical.revision < row.revision) return [row];
            return key[2] !== "orders" || matchesArrivalFilters(canonical, current.packages, params) ? [canonical] : [];
          });
          const total = current.pagination.total - (current.rows.length - rows.length);
          return { ...current, rows, pagination: {
            ...current.pagination, total,
            hasMore: (current.pagination.page + 1) * current.pagination.pageSize < total,
          } };
        });
      }
      void client.invalidateQueries({
        queryKey: [...scope, "orders"],
        predicate: query => {
          if (interrupted.includes(query)) return true;
          const params = new URLSearchParams(String(query.queryKey[3]));
          return ["review", "available", "warehouse", "awaiting"].some(stage => params.get("view") === stage || params.get("status") === stage)
            || !!params.get("account") || ["units", "stage"].includes(params.get("sort") ?? "");
        },
      });
      for (const query of interrupted.filter(query => query.queryKey[2] === "order-items")) {
        void client.invalidateQueries({ queryKey: query.queryKey, exact: true });
      }
    },
  });
  async function registerArrivals(attempt: ArrivalAttempt, complete: () => void, failed: (message: string) => void, onConflict?: (rows: Row[]) => void, onBatchConflict?: (attempt: ArrivalAttempt) => void) {
    const previous = retryArrivals.find(mutation => (mutation.state.variables as ArrivalAttempt).idempotencyKey === attempt.idempotencyKey);
    if (previous) client.getMutationCache().remove(previous);
    try {
      await arrivalMutation.mutateAsync(attempt);
      complete();
    } catch (error) {
      if (error instanceof ArrivalError && error.uncertain) {
        setArrivalRetry(attempt);
        failed("A confirmação não chegou. Tente confirmar novamente com os mesmos dados.");
      } else {
        setArrivalRetry(null);
        if (error instanceof ArrivalError && error.status === 409 && onBatchConflict) {
          onBatchConflict(attempt);
        } else if (error instanceof ArrivalError && error.status === 409) {
          void client.invalidateQueries({ queryKey: [...scope, "order-items"], refetchType: "none" });
          try {
            const fresh = await client.fetchQuery(warehouseQuery("order-items", orderItemsParams(attempt.arrivals.map(row => row.costItemId))));
            onConflict?.(fresh.rows);
          } catch { /* Keep the submitted fields if the current revisions cannot be loaded. */ }
          void client.invalidateQueries({ queryKey: [...scope, "orders"] });
        }
        failed(error instanceof Error ? error.message : "Não foi possível registrar a chegada.");
      }
    }
  }
  async function reloadBulkConflict(attempt: ArrivalAttempt) {
    setBulkConflict({ attempt });
    setBulkBusy(true);
    try {
      const fresh = await client.fetchQuery({ ...warehouseQuery("order-items", orderItemsParams(attempt.arrivals.map(row => row.costItemId))), staleTime: 0 });
      setBulkConflict({ attempt, fresh: fresh.rows, accounts: fresh.accounts });
    } catch {
      setBulkError("Não foi possível carregar as posições atuais. Tente novamente para revisar o lote.");
    } finally { setBulkBusy(false); }
  }

  function openArrival(row: Row, mode?: "correct") {
    setReceiveError(""); setReceiveErrorField(null); setArrivalQuantity(null); setArrivalRetry(null);
    setCorrectArrival(mode === "correct"); setReceive(row);
  }
  const advancedCount =
    Number(Boolean(filters.account)) +
    Number(workspace.workspaceKind !== "personal" && Boolean(filters.person)) +
    Number(Boolean(filters.origin)) +
    Number(Boolean(filters.trackingId)) + Number(Boolean(filters.status));
  const hasAnyFilter = filterKeys.some((key) => key === "view" ? filters.view !== "all" : Boolean(filters[key]));

  useEffect(() => {
    if (!data || loading) return;
    const lastPage = Math.max(0, Math.ceil(data.pagination.total / 20) - 1);
    if (filters.page <= lastPage) return;
    const timer = window.setTimeout(() => {
      const next = { ...filters, page: lastPage };
      window.history.replaceState(window.history.state, "", filtersUrl(next));
      setFilters(next);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [data, filters, loading]);

  useEffect(() => {
    if (draftFilters.search.trim() === filters.search) return;
    const timer = window.setTimeout(() => {
      const next = { ...filters, search: draftFilters.search.trim(), page: 0 };
      window.history.replaceState(window.history.state, "", filtersUrl(next));
      setFilters(next);
      if (checkedCount) { setCheckedRows({}); setBulkError("Itens desmarcados após alterar a busca."); }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draftFilters.search, filters, checkedCount]);

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
        const params = orderItemsParams(ids.slice(offset, offset + 20));
        const result = await client.fetchQuery({ ...warehouseQuery("order-items", params), staleTime: 0 });
        fresh.push(...result.rows);
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
    const refresh = () => { if (!attempt.current && !busyRef.current) { if (Object.keys(selectedRef.current).length) void revalidateRef.current?.(); } };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  function checkRows(rows: Row[], checked: boolean) {
    const next = { ...checkedRows };
    for (const row of rows) {
      if (checked) next[row.costItemId] = row;
      else delete next[row.costItemId];
    }
    if (Object.keys(next).length > 100) { setBulkError("Marque até 100 itens por operação."); return; }
    setCheckedRows(next);
    setBulkError("");
  }

  function clearChecked(message = "") {
    if (Object.keys(checkedRows).length) setBulkError(message);
    setCheckedRows({});
  }

  async function reviewChecked(action: "arrival" | "reserve") {
    const selectedRows = Object.values(checkedRows);
    if (!selectedRows.length || bulkBusy) return;
    setBulkBusy(true);
    setBulkError("");
    try {
      const params = orderItemsParams(selectedRows.map(row => row.costItemId));
      const fresh = await client.fetchQuery({ ...warehouseQuery("order-items", params), staleTime: 0 });
      const byId = new Map(fresh.rows.map(row => [row.costItemId, row]));
      const problems: string[] = [];
      for (const selectedRow of selectedRows) {
        const row = byId.get(selectedRow.costItemId);
        if (!row) problems.push(selectedRow.name + ": pedido indisponível.");
        else if (pendingItems.has(row.costItemId)) problems.push(row.name + ": chegada aguardando confirmação.");
        else if (action === "arrival") {
          if (!remainingArrivalUnits(row)) problems.push(row.name + ": todas as unidades vigentes já chegaram.");
          else if (!arrivalAccounts(row, fresh.accounts).length) problems.push(row.name + ": sem conta HubBuy ativa compatível.");
        } else if (!row.availableUnits.length || !row.accountId || !fresh.accounts.some(account => account.id === row.accountId && account.status === "active")) {
          problems.push(row.name + ": requer unidades recebidas, livres e uma conta ativa.");
        }
      }
      if (problems.length) { setBulkError(problems.join(" ")); return; }
      if (action === "arrival") { setArrivalRetry(null); setBulkConflict(null); setBulkDraft([]); setBulkArrival(fresh.rows); return; }
      if (new Set(fresh.rows.map(row => row.accountId)).size !== 1) {
        setBulkError("Há itens de contas HubBuy diferentes. Marque itens de uma conta por pacote."); return;
      }
      replaceSelection(Object.fromEntries(fresh.rows.map(row => [row.costItemId, { row, quantity: 1 }])));
      setPackageAccountId(fresh.rows[0].accountId ?? "");
      setPackagePage(0);
      await prepareSelection();
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : "Não foi possível revisar os itens marcados.");
    } finally {
      setBulkBusy(false);
    }
  }

  function updateDraft<K extends (typeof filterKeys)[number]>(
    key: K,
    value: OrdersFilters[K],
  ) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearChecked("Itens desmarcados após alterar os filtros.");
    const next = { ...draftFilters, page: 0 };
    window.history.pushState(window.history.state, "", filtersUrl(next));
    setFilters(next);
    setFiltersOpen(false);
  }

  function clearFilters() {
    clearChecked("Itens desmarcados após limpar os filtros.");
    const cleared = { ...emptyOrdersFilters };
    window.history.pushState(window.history.state, "", "/orders");
    setDraftFilters(cleared);
    setFilters(cleared);
  }

  function changeSort(sort: OrderSort, direction: "asc" | "desc") {
    clearChecked("Itens desmarcados após alterar a ordenação.");
    const next = { ...filters, sort, direction, page: 0 };
    window.history.pushState(window.history.state, "", filtersUrl(next));
    setFilters(next);
    setDraftFilters(next);
  }

  function movePage(page: number) {
    const next = { ...filters, page };
    window.history.pushState(window.history.state, "", filtersUrl(next));
    setFilters(next);
  }

  function changeView(view: OrdersView) {
    clearChecked("Itens desmarcados após alterar a visualização.");
    const next = { ...filters, view, page: 0 };
    window.history.pushState(window.history.state, "", filtersUrl(next));
    setFilters(next);
    setDraftFilters(current => ({ ...current, view, page: 0 }));
  }

  function changeStage(status: string) {
    clearChecked("Itens desmarcados após alterar a etapa.");
    const next = { ...filters, status, page: 0 };
    window.history.pushState(window.history.state, "", filtersUrl(next));
    setFilters(next);
    setDraftFilters(current => ({ ...current, status, page: 0 }));
  }

  useEffect(() => {
    const onPopState = () => {
      if (window.location.pathname !== "/orders") return;
      const params = new URLSearchParams(window.location.search);
      const next = parseOrdersFilters(key => params.get(key) ?? "");
      if (workspace.workspaceKind === "personal") next.person = "";
      if (filtersUrl({ ...next, page: 0 }) !== filtersUrl({ ...filters, page: 0 }) && checkedCount) {
        setCheckedRows({});
        setBulkError("Itens desmarcados após mudar a consulta.");
      }
      setFilters(next);
      setDraftFilters(next);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [checkedCount, filters, workspace.workspaceKind]);

  function selectRow(row: Row, quantity: number) {
    if (locked || checkingRef.current || busyRef.current || pendingItems.has(row.costItemId)) return;
    const current = selectedRef.current;
    if (!current[row.costItemId] && Object.values(current).filter(entry => entry.quantity > 0).length >= 100) { setSelectionError("Selecione até 100 produtos por pacote."); return; }
    const safe = Number.isSafeInteger(quantity) ? Math.max(0, Math.min(row.availableUnits.length, quantity)) : 0;
    const next = { ...current };
    if (safe) next[row.costItemId] = { row, quantity: safe }; else delete next[row.costItemId];
    replaceSelection(next);
    setPackageAccountId(Object.values(next).find(entry => entry.quantity > 0)?.row.accountId ?? "");
    setPackagePage(0);
    setSelectionError(""); setNotice("");
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
    if (summary.entries.some(entry => pendingItems.has(entry.row.costItemId))) { setSelectionError("Aguarde a confirmação de chegada antes de montar o pacote."); return; }
    if (summary.units > 10000) { setSelectionError("Selecione até 10.000 unidades por operação."); return; }
    setSelectionError(""); setReserveError(""); setReserve(true);
  }

  async function submit(command: Record<string, unknown>, onError: (message: string) => void = setError) {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true);
    const isReserve = command.operation === "reserve";
    const payload = isReserve ? (attempt.current ??= { idempotencyKey: crypto.randomUUID(), command }) : { idempotencyKey: crypto.randomUUID(), command };
    const result = await costRequest<{ id: string }>("/api/warehouse", { workspaceId: workspace.workspaceId, ...payload }, workspace.workspaceId);
    busyRef.current = false; setBusy(false);
    if (!result.ok) {
      if (isReserve) {
        const unknown = result.status === 0 || result.status >= 500;
        setUncertain(unknown);
        if (!unknown) { attempt.current = null; invalidateOrders(); }
        onError(unknown ? "A confirmação não chegou. Use Tentar confirmar novamente para consultar a mesma montagem com segurança." : result.error ?? "A operação não foi concluída. Revise a seleção.");
      } else onError(result.error ?? "A operação não foi concluída.");
      return false;
    }
    if (isReserve) { setCreatedPackage(result.data?.id ?? ""); setPanel({ kind: "closed" }); attempt.current = null; setUncertain(false); setDestination(""); setPackageName(""); setReason(""); }
    setError(""); setReceiveError(""); setReceiveErrorField(null); setReserveError(""); setReceive(null); setReserve(false);
    if (isReserve) { replaceSelection({}); setPackageAccountId(""); } invalidateOrders(); return true;
  }

  async function confirmAssembly(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || checkingRef.current) return;
    if (attempt.current) { await submit(attempt.current.command, setReserveError); return; }
    const fresh = await revalidateSelection();
    if (!fresh) { setReserveError("Não foi possível conferir a seleção. Volte à preparação e tente novamente."); return; }
    if (fresh.changed.length) { setReserve(false); return; }
    const current = ordersSelectionSummary(fresh.selection);
    if (current.entries.some(entry => pendingItems.has(entry.row.costItemId))) { setReserveError("Aguarde a confirmação de chegada."); return; }
    const accounts = new Set(current.entries.map(entry => entry.row.accountId));
    if (!current.entries.length || accounts.size !== 1 || !current.entries[0].row.accountId || current.units > 10000) { setReserve(false); setSelectionError("Revise as unidades disponíveis e selecione uma única conta HubBuy."); return; }
    const pkg = destinations.data?.packages.find(candidate => candidate.id === destination);
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
    workspace.workspaceKind !== "personal" && filters.person
      ? `Pessoa: ${workspace.members.find((member) => member.id === filters.person)?.name ?? "selecionada"}`
      : "",
    filters.origin
      ? `Origem: ${filters.origin === "additional" ? "Adicional" : "Compra"}`
      : "",
    filters.trackingId
      ? `Compra: ${data?.origins.find((origin) => origin.trackingId === filters.trackingId)?.name ?? "selecionada"}`
      : "",
  ].filter(Boolean);

  const stages = [["", "Todas as etapas"], ["review", "Chegada sem registro"], ["awaiting", "Aguardando chegada"], ["warehouse", "No armazém"], ["available", "Disponível para pacote"], ["package", "Em pacote"], ["sent", "Enviado"], ["received", "Recebido no Brasil"]] as const;
  const total = data?.pagination.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const prepareDisabled = !selection.length || busy || checking || loading;
  const detailRow = detail.data?.rows[0];
  const detailPanel: OrdersPanel | undefined = panel.kind === "item-detail" ? {
    state: panel,
    title: "Detalhe do pedido",
    description: "",
    footer: detailRow && detailRow.availableUnits.length > 0 && !detail.isPending && !detail.isError ? <Button type="button" disabled={locked || pendingItems.has(detailRow.costItemId) || !detailRow.availableUnits.length} onClick={() => { if (!selected[detailRow.costItemId]?.quantity) selectRow(detailRow, 1); void prepareSelection(); }}>Adicionar ao pacote</Button> : undefined,
    children: detail.isPending ? <LoadingState label="Atualizando item…" rows={2} /> : detail.isError ? <OrdersFeedback title="Não foi possível atualizar o item" error><Button type="button" onClick={() => void detail.refetch()}>Tentar novamente</Button></OrdersFeedback> : detailRow && detail.data ? <>{(fromPreparation || selectedUnitCount > 0) && <Button type="button" variant="ghost" className="orders-detail-back" onClick={() => { setReserve(false); setPanel({ kind: "prepare" }); }}>{fromPreparation ? "Voltar à preparação" : "Ver seleção"} · {selectedUnitCount}</Button>}<OrderDetailPanel key={detailRow.costItemId} row={detailRow} pendingArrival={pendingItems.get(detailRow.costItemId)?.expectedRevision === detailRow.revision ? pendingItems.get(detailRow.costItemId)?.quantity : undefined} data={detail.data} members={workspace.members} quantity={selected[detailRow.costItemId]?.quantity ?? 0} disabled={locked || pendingItems.has(detailRow.costItemId)} returnTo={filtersUrl(filters)} onSelect={selectRow} onChanged={replacement => { if (replacement) { const next = { ...selectedRef.current }; delete next[replacement.previousId]; replaceSelection(next); setPanel({ kind: "item-detail", itemId: replacement.nextId }); } invalidateOrders(); }} onReceive={openArrival} /></> : <OrdersFeedback title="Item não encontrado nesta listagem">O item pode ter mudado ou estar fora dos filtros/página atuais. Feche o detalhe e revise a lista.</OrdersFeedback>,
  } : undefined;

  const reviewForm = <form className="orders-form orders-review-form" onSubmit={confirmAssembly}>
    <ul className="orders-review-items">{entries.map(({ row, quantity }) => <li key={row.costItemId}><span><strong>{row.name}</strong><small>{row.source.variant || "Sem variação"}</small></span><strong>{quantity} un.</strong></li>)}</ul>
    <div className="orders-preparation-total"><span>{selectedUnitCount} unidades</span><strong>{selectedBase === null ? "Custo indefinido" : formatMoney(selectedBase)}</strong></div>
    <p className="orders-review-note">A montagem vincula unidades ao pacote e preserva os custos originais.</p>
    <p>Conta HubBuy: <strong>{data?.accounts.find(account => account.id === selection[0]?.accountId)?.label ?? "Sem conta"}</strong></p>
    <fieldset disabled={busy || checking || uncertain}>
      {destinations.isPending && <LoadingState label="Carregando destinos…" />}
      {destinations.isError && <p role="alert">{destinations.error.message} <Button type="button" onClick={() => void destinations.refetch()}>Tentar novamente</Button></p>}
      <OpenPackagePicker
        packages={destinations.data?.packages.filter(pkg => pkg.accountId === selection[0]?.accountId && pkg.stage === "preparing" && !pkg.contentClosedAt && pkg.reviewState === "confirmed" && !pkg.financialClosedAt) ?? []}
        selectedId={destination}
        onSelect={id => { setDestination(id); setPackageName(""); setReserveError(""); }}
        search={packageSearch}
        onSearchChange={value => { setPackageSearch(value); setPackagePage(0); setDestination(""); }}
        page={packagePage}
        total={destinations.data?.packageOptions.total ?? 0}
        hasMore={destinations.data?.packageOptions.hasMore ?? false}
        onPageChange={page => { setDestination(""); setPackagePage(page); }}
        includeNew
      />
      {!destination && <label>Nome para novo pacote<input name="name" required maxLength={120} value={packageName} onChange={event => setPackageName(event.target.value)} placeholder="Ex.: Envio de novembro" /></label>}
      <label>Motivo<textarea name="reason" required minLength={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
    </fieldset>
    {reserveError && <p ref={reserveErrorRef} tabIndex={-1} role="alert" className="orders-form-error">{reserveError}</p>}
    <div className="orders-review-actions"><Button type="button" variant="outline" disabled={busy || checking} onClick={() => setReserve(false)}>Voltar</Button><Button type="submit" disabled={busy || checking || loading}>{busy ? "Confirmando…" : checking ? "Conferindo…" : uncertain ? "Tentar confirmar novamente" : "Montar pacote"}</Button></div>
  </form>;
  const preparationPanel: OrdersPanel | undefined = panel.kind === "prepare" ? {
    state: panel, title: compact && reserve ? "Revisar montagem" : "Preparar pacote",
    description: compact && reserve ? "Confirme as unidades antes de montar." : `${selection.length} produtos, ${selectedUnitCount} unidades`,
    children: compact && reserve ? reviewForm : <>{notice && <p role="status" className="orders-selection-notice">{notice}</p>}{selectionError && <p role="alert" className="orders-form-error">{selectionError}</p>}<OrderPreparationPanel selected={selected} disabled={locked} onSelect={selectRow} onDetail={row => { setFromPreparation(true); setPanel({ kind: "item-detail", itemId: row.costItemId }); }} /></>,
    footer: compact && reserve ? undefined : <><div className="orders-preparation-total"><span>{selectedUnitCount} unidades selecionadas</span><strong>{selectedBase === null ? "Custo indefinido" : formatMoney(selectedBase)}</strong></div><Button type="button" disabled={!selection.length || busy || checking || loading} onClick={reviewSelection}>{checking ? "Conferindo…" : uncertain ? "Retomar confirmação" : "Montar pacote"}</Button></>,
  } : undefined;
  const activePanel = detailPanel ?? preparationPanel;

  const eligible = Array.from({ length: receive?.quantity ?? 0 }, (_, index) => index)
            .filter((index) => !(receive?.cancelledUnits ?? []).includes(index));
  const minimum = receive ? minimumReceivedCount(receive) : 0;
  const maximum = eligible.length;
  const reservedCount = receive?.reservations.length ?? 0;
  const receivedCount = receive?.reviewState === "confirmed" ? receive.receivedUnits.filter(unit => eligible.includes(unit)).length : 0;
  const remaining = maximum - receivedCount;
  const activeAccounts = (data?.accounts ?? detail.data?.accounts ?? []).filter(account => account.status === "active");
  const linkedAccount = receive?.order.accountId ?? receive?.accountId;
  const suggestedAccount = detail.data?.suggestedArrivalAccountId ?? data?.suggestedArrivalAccountId;
  const compatibleAccounts = activeAccounts.filter(account => correctArrival || !linkedAccount || account.id === linkedAccount);

  return (
    <OrdersWorkspace
      tools={<OrdersQcImport onChanged={() => invalidateOrders(false)} />}
      {...(activePanel ? { panel: activePanel, onPanelClose: () => {
        if (reserve && compact) { setReserve(false); return; }
        if (linkedItem) {
          window.history.replaceState(window.history.state, "", filtersUrl(filters));
          setLinkedItem(undefined);
        }
        setPanel({ kind: "closed" });
        setReserve(false);
      } } : { panel: undefined, onPanelClose: undefined })}
      toolbar={<form className="orders-list-toolbar" role="search" onSubmit={event => { event.preventDefault(); const next = { ...filters, search: draftFilters.search.trim(), page: 0 }; window.history.replaceState(window.history.state, "", filtersUrl(next)); setFilters(next); }}>
        <label className="orders-search"><span className="sr-only">Buscar produto ou pedido</span><Search size={17} aria-hidden="true" /><input type="search" value={draftFilters.search} onChange={event => updateDraft("search", event.target.value)} placeholder="Buscar produto ou pedido" maxLength={200} /></label>
        <label className="orders-stage-select"><span className="sr-only">Etapa</span><select aria-label="Etapa" value={filters.status} onChange={event => changeStage(event.target.value)}>{stages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <Button type="button" variant="outline" aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={() => { setDraftFilters(current => ({ ...filters, search: current.search })); setFiltersOpen(true); }}><SlidersHorizontal size={14} aria-hidden="true" />Filtros{advancedCount > 0 && <span className="orders-filter-count">{advancedCount}</span>}</Button>
        <Button type="button" className="orders-prepare-button" disabled={prepareDisabled} title={!selection.length ? "Selecione unidades disponíveis para preparar um pacote" : undefined} onClick={prepareSelection}>Preparar pacote<ArrowRight size={14} aria-hidden="true" /></Button>
      </form>}
    >
      {createdPackage && <p role="status" className="orders-assembly-success">Pacote montado. <a href={`/packages/detail/${encodeURIComponent(createdPackage)}`}>Abrir pacote</a></p>}
      {activeArrivals.length > 0 && <p role="status">Confirmando chegada ao armazém…</p>}
      {!receive && !bulkArrival && retryArrivals.map(mutation => {
        const request = mutation.state.variables as ArrivalAttempt;
        return <p key={request.idempotencyKey} role="status">Chegada aguardando confirmação. <Button type="button" variant="outline" onClick={() => void registerArrivals(request, () => setArrivalRetry(null), setError)}>Tentar confirmar novamente</Button></p>;
      })}
      {notice && panel.kind === "closed" && <p role="status">{notice}</p>}
      <div className="orders-tabs-bar">
        <nav className="orders-view-tabs" aria-label="Visualizações de pedidos">
          {([["all", "Todos", ""], ["warehouse", "No armazém", "orders-desktop-view"], ["available", "Disponíveis", ""], ["awaiting", "A caminho", "orders-mobile-view"]] as const).map(([view, label, className]) => <button key={view} type="button" className={className} aria-current={filters.view === view ? "true" : undefined} onClick={() => changeView(view)}>{label}</button>)}
        </nav>
        <span className="orders-result-count" aria-live="polite">{loading ? "" : `${rows.length} ${rows.length === 1 ? "item exibido" : "itens exibidos"}`}</span>
      </div>
      {hasAnyFilter && <div className="orders-list-applied"><p>{[...activeAdvancedFilters, filters.status ? `Etapa: ${stages.find(([value]) => value === filters.status)?.[1] ?? filters.status}` : "", filters.search ? `Busca: ${filters.search}` : "", filters.view === "awaiting" ? "A caminho" : filters.view === "warehouse" ? "No armazém" : filters.view === "available" ? "Disponíveis" : ""].filter(Boolean).join(" · ")}</p><Button type="button" variant="ghost" onClick={clearFilters}>Limpar filtros</Button></div>}
      {(error || listError) && <div className="orders-request-error"><p role="alert" className="form-error">{error || listError}</p><Button type="button" variant="outline" onClick={() => { setError(""); void list.refetch(); }}>Tentar carregar novamente</Button></div>}
      <label className="orders-mobile-sort">
        Ordenar pedidos
        <select value={filters.sort ? [filters.sort, filters.direction ?? "asc"].join(":") : ""} onChange={event => {
          const [sort, direction] = event.target.value.split(":");
          changeSort(orderSortOptions.find(([field]) => field === sort)?.[0] ?? "", direction === "desc" ? "desc" : "asc");
        }}>
          <option value="">Ordem padrão</option>
          {orderSortOptions.flatMap(([field,label]) => [
            <option key={field + ":asc"} value={field + ":asc"}>{label} (crescente)</option>,
            <option key={field + ":desc"} value={field + ":desc"}>{label} (decrescente)</option>,
          ])}
        </select>
      </label>
      {checkedCount > 0 && <BulkOrderActions count={checkedCount} disabled={bulkBusy || loading || locked} onClear={() => clearChecked()} onArrival={() => void reviewChecked("arrival")} onReserve={() => void reviewChecked("reserve")} />}
      {!loading && rows.length > 0 && <label className="orders-mobile-check"><input type="checkbox" className="orders-row-check"
        checked={rows.every(row => checkedRows[row.costItemId])}
        ref={input => { if (input) input.indeterminate = rows.some(row => checkedRows[row.costItemId]) && !rows.every(row => checkedRows[row.costItemId]); }}
        disabled={locked} onChange={event => checkRows(rows, event.target.checked)} />Selecionar itens desta página</label>}
      {!bulkArrival && bulkError && <p role="status" className="orders-form-error">{bulkError}</p>}
      <div aria-busy={loading}>
        {loading && <LoadingState label={data ? "Atualizando pedidos…" : "Carregando pedidos…"} rows={3} />}
        {!loading && data && !rows.length && <div className="orders-list-empty"><h2>{hasAnyFilter ? "Nenhum pedido corresponde aos filtros aplicados" : "Nenhum pedido por aqui"}</h2><p>{hasAnyFilter ? "Revise os filtros ou use Limpar filtros para ver outros pedidos." : "Os pedidos aparecem após finalizar uma compra."}</p></div>}
        {data && rows.length > 0 && <div inert={list.isPlaceholderData}><OrdersCatalog checked={new Set(Object.keys(checkedRows))} onCheck={checkRows} data={data} sort={filters.sort} direction={filters.direction} onSort={changeSort} pendingItems={pendingItems} selected={selected} disabled={locked || loading} detailItemId={panel.kind === "item-detail" ? panel.itemId : undefined} onOpenDetail={row => setPanel({ kind: "item-detail", itemId: row.costItemId })} onSelect={selectRow} onPackageAction={(row, mode) => setReservationAction({ row, mode })} /></div>}
      </div>
      {!loading && total > 0 && <footer className="orders-list-footer"><span>Mostrando {filters.page * 20 + 1}–{Math.min((filters.page + 1) * 20, total)} de {total} {total === 1 ? "item" : "itens"}</span>{totalPages > 1 && <nav aria-label="Páginas de pedidos" className="orders-list-pagination"><Button type="button" variant="ghost" aria-label="Página anterior" disabled={filters.page === 0 || busy} onClick={() => movePage(filters.page - 1)}><ChevronLeft size={16} aria-hidden="true" /></Button><span aria-current="page">{filters.page + 1} / {totalPages}</span><Button type="button" variant="ghost" aria-label="Próxima página" disabled={!data?.pagination.hasMore || busy} onClick={() => movePage(filters.page + 1)}><ChevronRight size={16} aria-hidden="true" /></Button></nav>}</footer>}
      {selection.length > 0 && <div className="orders-selection-summary" aria-live="polite"><span>{selection.length} {selection.length === 1 ? "produto" : "produtos"} · {selectedUnitCount} {selectedUnitCount === 1 ? "unidade selecionada" : "unidades selecionadas"} · {selectedBase === null ? "Custo indefinido" : formatMoney(selectedBase)}</span><Button type="button" variant="ghost" disabled={locked} onClick={() => { replaceSelection({}); setPackageAccountId(""); setSelectionError(""); }}>Limpar seleção</Button>{selectionError && <p role="alert">{selectionError}</p>}</div>}
      {selection.length > 0 && <div className="orders-preparation-mobile"><div><strong>{selection.length} {selection.length === 1 ? "produto" : "produtos"}</strong><small>{selectedUnitCount} {selectedUnitCount === 1 ? "unidade" : "unidades"}</small></div><Button type="button" disabled={prepareDisabled} onClick={prepareSelection}>Preparar pacote<ArrowRight size={14} aria-hidden="true" /></Button></div>}
      <OrdersFilterSurface open={filtersOpen} onOpenChange={setFiltersOpen} description={workspace.workspaceKind === "personal" ? "Combine etapa, conta e origem." : "Combine etapa, conta, pessoa e origem."}>
        <form className="orders-filter-form" onSubmit={applyFilters}>
          <label>Etapa<select value={draftFilters.status} onChange={event => updateDraft("status", event.target.value)}>{stages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Conta<select value={draftFilters.account} onChange={event => updateDraft("account", event.target.value)}><option value="">Todas as contas</option>{data?.accounts.map(account => <option key={account.id} value={account.id}>{account.label}</option>)}</select></label>
          {workspace.workspaceKind !== "personal" && <label>Pessoa<select value={draftFilters.person} onChange={event => updateDraft("person", event.target.value)}><option value="">Todas as pessoas</option>{workspace.members.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
          <label>Origem<select value={draftFilters.origin} onChange={event => updateDraft("origin", event.target.value)}><option value="">Todas as origens</option><option value="original">Compra</option><option value="additional">Adicional</option></select></label>
          <label>Compra<select value={draftFilters.trackingId} onChange={event => updateDraft("trackingId", event.target.value)}><option value="">Todas as compras</option>{data?.origins.map(origin => <option key={origin.trackingId} value={origin.trackingId}>{origin.name}</option>)}</select></label>
          <div className="orders-filter-actions"><Button type="button" variant="ghost" onClick={() => { setDraftFilters(current => ({ ...emptyOrdersFilters, search: current.search, view: current.view })); }}>Limpar campos</Button><Button type="submit">Aplicar filtros</Button></div>
        </form>
      </OrdersFilterSurface>
      <Surface open={!!bulkArrival} onOpenChange={open => { if (!open && !arrivalMutation.isPending) { setBulkArrival(null); setArrivalRetry(null); } }} title="Registrar chegada ao armazém">
        {bulkArrival && <form className="orders-form" onSubmit={event => {
          event.preventDefault();
          if (bulkConflict) return;
          const values = new FormData(event.currentTarget);
          const arrivals = bulkArrival.map(row => ({
            costItemId: row.costItemId, expectedRevision: row.revision,
            quantity: Number(values.get("quantity-" + row.costItemId)), accountId: String(values.get("account-" + row.costItemId)),
          }));
          if (!arrivalRetry && arrivals.reduce((total,row) => total + row.quantity,0) > 10000) { setBulkError("Registre até 10.000 unidades por operação."); return; }
          setBulkError("");
          void registerArrivals(arrivalRetry ?? { idempotencyKey: crypto.randomUUID(), arrivals }, () => {
            setBulkArrival(null); setArrivalRetry(null); clearChecked();
          }, message => setBulkError(bulkArrival.reduce((current, row) => current.replace("Item " + row.costItemId + ":", row.name + ":"), message)), undefined, attempt => void reloadBulkConflict(attempt));
        }}>
          {bulkConflict && <section aria-label="Revisar conflito de chegada">
            {bulkConflict.attempt.arrivals.map(line => {
              const previous = bulkArrival.find(row => row.costItemId === line.costItemId);
              const row = bulkConflict.fresh?.find(row => row.costItemId === line.costItemId);
              return <p key={line.costItemId}><strong>{previous?.name}</strong> · Quantidade informada: {line.quantity}.
                {row && <> Recebidas: {row.quantity - row.cancelledUnits.length - remainingArrivalUnits(row)}. Saldo: {remainingArrivalUnits(row)}. Contas compatíveis: {arrivalAccounts(row, bulkConflict.accounts ?? []).map(account => account.label).join(", ") || "nenhuma"}.</>}
                {!row && bulkConflict.fresh && " Pedido indisponível."}
              </p>;
            })}
            {bulkConflict.fresh ? <Button type="button" variant="outline" onClick={() => {
              const eligible = bulkConflict.fresh!.filter(row => remainingArrivalUnits(row) > 0 && arrivalAccounts(row, bulkConflict.accounts ?? []).length > 0);
              if (!eligible.length) { setBulkError("Nenhum item do lote continua elegível. Volte à lista."); return; }
              setBulkReviewVersion(version => version + 1);
              setBulkDraft(bulkConflict.attempt.arrivals);
              setBulkArrival(eligible);
              setBulkConflict(null);
              setBulkError("Confira as quantidades e contas atualizadas antes de confirmar a chegada.");
            }}>Revisar quantidades atualizadas</Button> : <Button type="button" disabled={bulkBusy} onClick={() => void reloadBulkConflict(bulkConflict.attempt)}>Carregar posições atuais</Button>}
          </section>}
          <BulkArrivalFields key={bulkReviewVersion} rows={bulkArrival} draft={bulkDraft} onRemove={id => setBulkArrival(current => current?.filter(row => row.costItemId !== id) ?? null)} accounts={data?.accounts ?? []} suggestion={data?.suggestedArrivalAccountId ?? null} disabled={arrivalMutation.isPending || !!arrivalRetry || !!bulkConflict} />
          {bulkError && <p role="alert" className="orders-form-error">{bulkError}</p>}
          <div className="orders-arrival-actions">
            <Button type="button" variant="outline" disabled={arrivalMutation.isPending} onClick={() => { setBulkArrival(null); setArrivalRetry(null); }}>Voltar</Button>
            <Button type="submit" disabled={!bulkArrival.length || arrivalMutation.isPending || !!bulkConflict}>{arrivalMutation.isPending ? "Confirmando…" : arrivalRetry ? "Tentar confirmar novamente" : "Confirmar chegadas"}</Button>
          </div>
        </form>}
      </Surface>
      <Surface
        open={!!receive}
        onOpenChange={(open) => {
          if (!open && !arrivalMutation.isPending && !busy) {
            setReceive(null);
            setReceiveError("");
            setReceiveErrorField(null);
          }
        }}
        title={correctArrival ? "Corrigir chegada ao armazém" : "Registrar chegada ao armazém"}
        className="orders-arrival-surface"
      >
        {receive && (
            <form
              className="orders-form orders-arrival-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const count = Number(form.get("quantity"));
                if (correctArrival && count < minimum) {
                  setReceiveError("Esse total é menor que a quantidade reservada. Retire as unidades do pacote antes de ajustar a chegada.");
                  setReceiveErrorField("quantity");
                  return;
                }
                if (!correctArrival) {
                  const request = arrivalRetry ?? {
                    idempotencyKey: crypto.randomUUID(),
                    arrivals: [{ costItemId: receive.costItemId, expectedRevision: receive.revision, accountId: String(form.get("account")), quantity: count, description: String(form.get("reason")) }],
                  };
                  void registerArrivals(request, () => { setArrivalRetry(null); setReceive(null); }, receiveServerError,
                    rows => { const current = rows.find(row => row.costItemId === receive.costItemId); if (current) setReceive(current); });
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
                <div className="surface-heading-with-icon orders-arrival-product">
                  <ProductCategoryMarker visualKey={receive.source.visualKey} />
                  <div><h3>{receive.name}</h3>{receive.source.variant && <p>{receive.source.variant}</p>}</div>
                </div>
                <dl className="orders-arrival-summary">
                  <div><dt>Compradas</dt><dd>{receive.quantity}</dd></div>
                  <div><dt>Já recebidas</dt><dd>{receive.reviewState === "pending_review" ? <small>Sem registro</small> : receivedCount}</dd></div>
                  <div><dt>Em pacotes</dt><dd>{reservedCount}</dd></div>
                </dl>
              </section>
              {!correctArrival && receive.reviewState === "pending_review" && <p>Chegada sem registro. Confira a quantidade antes de confirmar.</p>}
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
              <fieldset disabled={arrivalMutation.isPending || !!arrivalRetry} className="orders-arrival-fields">
              <label className="orders-arrival-quantity">
                {correctArrival ? "Total recebido" : "Quantidade que chegou agora"}
                <input
                  ref={receiveQuantityRef}
                  name="quantity"
                  type="number"
                  required
                  min={correctArrival ? 0 : 1}
                  max={correctArrival ? maximum : remaining}
                  defaultValue={correctArrival ? receivedCount : remaining}
                  aria-invalid={receiveErrorField === "quantity"}
                  aria-describedby={receiveErrorField === "quantity" ? "orders-arrival-error" : "orders-arrival-quantity-help"}
                  onChange={event => { setArrivalQuantity(event.target.valueAsNumber); setReceiveError(""); setReceiveErrorField(null); }}
                />
                <small id="orders-arrival-quantity-help">
                  {correctArrival ? `Informe o total recebido, de ${minimum} a ${maximum}.` : `Após confirmar: ${receivedCount + (Number.isFinite(arrivalQuantity) ? arrivalQuantity! : remaining)} unidades recebidas.`}
                  {receive.cancelledUnits.length > 0 && ` O limite exclui ${receive.cancelledUnits.length} ${receive.cancelledUnits.length === 1 ? "unidade cancelada" : "unidades canceladas"}.`}
                </small>
              </label>
              <label>
                Conta HubBuy
                <select
                  ref={receiveAccountRef}
                  name="account"
                  required
                  defaultValue={compatibleAccounts.find(account => account.id === (linkedAccount ?? suggestedAccount))?.id ?? (compatibleAccounts.length === 1 ? compatibleAccounts[0].id : "")}
                  aria-invalid={receiveErrorField === "account"}
                  aria-describedby={receiveErrorField === "account" ? "orders-arrival-error" : "orders-arrival-account-help"}
                  onChange={() => { setReceiveError(""); setReceiveErrorField(null); }}
                >
                  <option value="" disabled>Escolha a conta HubBuy</option>
                  {compatibleAccounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.label}</option>
                  ))}
                </select>
                <small id="orders-arrival-account-help">Use a mesma conta do pedido e dos pacotes já vinculados.</small>
              </label>
              <label>
                {correctArrival ? "Motivo da correção" : "Observação (opcional)"}
                <textarea
                  ref={receiveReasonRef}
                  name="reason"
                  required={correctArrival}
                  minLength={correctArrival ? 3 : undefined}
                  maxLength={1000}
                  rows={2}
                  placeholder="Ex.: chegada registrada na HubBuy"
                  aria-invalid={receiveErrorField === "reason"}
                  aria-describedby={receiveErrorField === "reason" ? "orders-arrival-error" : undefined}
                  onChange={() => { setReceiveError(""); setReceiveErrorField(null); }}
                />
              </label>
              </fieldset>
              <div className="orders-arrival-actions">
                <Button disabled={busy || arrivalMutation.isPending} variant="outline" type="button" onClick={() => { setReceive(null); setReceiveError(""); setReceiveErrorField(null); }}>Cancelar</Button>
                <Button disabled={busy || arrivalMutation.isPending} type="submit">{busy || arrivalMutation.isPending ? "Salvando…" : arrivalRetry ? "Tentar confirmar novamente" : correctArrival ? "Salvar correção" : "Confirmar chegada"}</Button>
              </div>
            </form>
        )}
      </Surface>

      <Surface open={reserve && !compact} onOpenChange={setReserve} title="Revisar montagem" description="Confirme as unidades antes de montar." className="orders-review-surface">{reviewForm}</Surface>
      {data && <OrdersReservationActions
        key={reservationAction ? `${reservationAction.mode}:${reservationAction.row.costItemId}` : "closed"}
        row={reservationAction?.row ?? null}
        data={data}
        mode={reservationAction?.mode ?? null}
        onOpenChange={open => { if (!open) setReservationAction(null); }}
        onChanged={() => invalidateOrders()}
      />}
    </OrdersWorkspace>
  );
}
