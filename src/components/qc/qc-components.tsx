"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleAlert, CircleHelp, FileText, ImagePlus, Info, MoreVertical, RefreshCw, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm, Surface } from "@/components/ui/surface";
import { ProductCategoryMarker } from "@/components/product-category-icons";
import { resolveProductCategory } from "@/lib/domain/categories";
import { useWorkspace } from "@/components/workspace-provider";
import { qcPreviewCache } from "./qc-preview-cache";
import { invalidateQcPresentation, isQcScopeActive, qcScope, resetQcClient, subscribeQcChanges } from "./qc-client-state";
import { useQcPresentation, useQcVisibility } from "./qc-reading-hooks";
import { QcImportProgress, type QcTransferSnapshot } from "./qc-import-progress";

type QcImage = { id: string; previewUrl: string | null; previewVersion?: string | null; width: number | null; height: number | null; occurrence: string };
type QcPendingMatch = { externalItemId: string; revision: number; orderNo: string | null; orderGoodsId: string | null; orderGoodsNo: string | null; skuInfo: string | null; title: string | null; quantity: number | null; photoCount: number; candidates: { itemId: string; name: string; reasons: string[] }[] };
type QcSummary = { canManage: boolean; counts: { itemId: string; count: number }[]; pendingMatching?: number; pendingRows?: QcPendingMatch[]; pendingTransfers?: number; pendingDeletes?: number; pendingPreviews?: number };
type QcPreview = { externalKey: string; orderNo: string | null; orderGoodsId: string | null; orderGoodsNo: string | null; offerId: string | null; skuInfo: string | null; title: string | null; quantity: number | null; photoCount: number; match: { status: string; targetItemId: string | null; candidates: { itemId: string; name: string; reasons: string[] }[] }; existingItemId: string | null; conflict: string | null };
type QcPrepared = { importId: string; revision: number; partial: boolean; orderCount: number; photoCount: number; rows: QcPreview[] };
type QcTarget = { id: string; origin: "purchase" | "additional"; name: string; variant: string | null; quantity: number };
type QcStatusTone = "success" | "warning" | "neutral" | "error";
type QcRun = { id: number; scope: string; controller: AbortController };
type QcBatchResult = { processed: number; imported: number; existing: number; failed: number; pending: number; remaining: number; complete: boolean; hasMore: boolean; revision?: number; stopReason?: "deadline" | "quota" | "recovery" | "failure"; retryAfterSeconds?: number; results: { sourceId?: string; status: string; code?: string }[]; snapshot?: QcTransferSnapshot };

class QcRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly retryAfterSeconds?: number, readonly upstreamStatus?: number) { super(message); this.name = "QcRequestError"; }
}

function waitForQcRetry(milliseconds: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, milliseconds);
    const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
  });
}
function qcRetryJitter() { return Math.floor(Math.random() * 251); }

function occurrenceAttributes(row: QcPreview) {
  const namedLabels: Record<string, string> = { color: "Cor", cor: "Cor", size: "Tamanho", tamanho: "Tamanho", weight: "Peso", peso: "Peso" };
  const variationParts = (row.skuInfo ?? "").split(/\s*[|;·]\s*/).filter(Boolean);
  const namedAttributes: { label: string; value: string }[] = [];
  const unnamedParts: string[] = [];
  for (const part of variationParts) {
    const match = part.match(/^(color|cor|size|tamanho|weight|peso)\s*:\s*(.+)$/i);
    if (match) namedAttributes.push({ label: namedLabels[match[1]!.toLowerCase()]!, value: match[2]!.trim() });
    else unnamedParts.push(part);
  }
  const attributes = namedAttributes.length
    ? [...namedAttributes, ...(unnamedParts.length ? [{ label: "Variação", value: unnamedParts.join(" · ") }] : [])]
    : row.skuInfo?.trim() ? [{ label: "Variação / SKU", value: row.skuInfo.trim() }] : [];
  if (row.quantity !== null) attributes.push({ label: "Quantidade", value: `${row.quantity} ${row.quantity === 1 ? "unidade" : "unidades"}` });
  attributes.push({ label: "Fotos", value: `${row.photoCount} ${row.photoCount === 1 ? "foto" : "fotos"}` });
  return attributes;
}

function occurrenceStatus(row: QcPreview): { tone: QcStatusTone; label: string; detail: string | null } {
  if (row.conflict) return { tone: "error", label: "Conflito entre identificadores", detail: row.conflict };
  if (row.match.status === "MATCHED") return { tone: "success", label: "Correspondência inequívoca", detail: null };
  if (row.match.status === "PENDING") return { tone: "warning", label: "Correspondência incerta · confirme a seleção", detail: row.match.candidates[0]?.reasons.join(" · ") ?? null };
  return { tone: "neutral", label: "Sem correspondência segura", detail: "O link do anúncio não identificou um produto. Selecione manualmente o produto desta compra ou mantenha a ocorrência ignorada." };
}

const summaryCache = new Map<string, { promise: Promise<QcSummary>; expiresAt: number }>();
const summaryListeners = new Map<string, Set<() => void>>();
let activeUserScope: string | null = null;
const summaryKey = (userId: string, purchaseId: string) => `${userId}:${purchaseId}`;
function resetQcUserScope(userId: string) {
  if (activeUserScope === userId) return;
  activeUserScope = userId;
  summaryCache.clear(); summaryListeners.clear();
}
function subscribeSummary(key: string, listener: () => void) {
  const listeners = summaryListeners.get(key) ?? new Set<() => void>();
  listeners.add(listener); summaryListeners.set(key, listeners);
  return () => { listeners.delete(listener); if (!listeners.size) summaryListeners.delete(key); };
}
function summaryFor(userId: string, purchaseId: string) {
  const key = summaryKey(userId, purchaseId);
  let cached = summaryCache.get(key);
  if (cached && cached.expiresAt <= Date.now()) { summaryCache.delete(key); cached = undefined; }
  if (!cached) {
    const promise = fetch(`/api/purchases/${encodeURIComponent(purchaseId)}/qc`, { cache: "no-store", credentials: "same-origin" }).then(async response => {
      if (response.status === 401) resetQcClient();
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar o QC.");
      return body.data as QcSummary;
    });
    cached = { promise, expiresAt: Date.now() + 5_000 };
    summaryCache.set(key, cached);
    void promise.catch(() => { summaryCache.delete(key); });
  }
  return cached.promise;
}
function invalidateSummary(purchaseId: string, clearBytes = true) {
  invalidateQcPresentation(purchaseId, clearBytes);
  for (const [key] of summaryCache) if (key.endsWith(`:${purchaseId}`)) summaryCache.delete(key);
  for (const [key, listeners] of summaryListeners) if (key.endsWith(`:${purchaseId}`)) for (const listener of listeners) listener();
}
function useQcSummary(purchaseId: string, enabled = true) {
  const { data } = useWorkspace();
  const userId = data.currentUser.id, key = summaryKey(userId, purchaseId);
  const [result, setResult] = useState<{ key: string; summary: QcSummary } | null>(null), [version, setVersion] = useState(0);
  useEffect(() => { resetQcUserScope(userId); return subscribeSummary(key, () => setVersion(current => current + 1)); }, [key, userId]);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void summaryFor(userId, purchaseId).then(value => { if (active) setResult({ key, summary: value }); }).catch(() => { if (active) setResult(current => current?.key === key ? null : current); });
    return () => { active = false; };
  }, [enabled, key, purchaseId, userId, version]);
  return { summary: result?.key === key ? result.summary : null };
}
async function qcRequest<T>(url: string, body?: unknown, method = "POST", signal?: AbortSignal) {
  const response = await fetch(url, { method, credentials: "same-origin", cache: "no-store", ...(signal ? { signal } : {}), ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  if (response.status === 401) resetQcClient();
  let result: { data?: T; error?: string; code?: string; retryAfterSeconds?: number; upstreamStatus?: number } = {};
  let invalidBody = false;
  try { result = await response.json(); } catch { invalidBody = true; }
  if (!response.ok) {
    const retryAfter = Number(result.retryAfterSeconds ?? response.headers.get("Retry-After"));
    throw new QcRequestError(result.error ?? "Não foi possível concluir a operação QC.", response.status, result.code, Number.isSafeInteger(retryAfter) && retryAfter > 0 ? retryAfter : undefined, Number.isInteger(result.upstreamStatus) ? result.upstreamStatus : undefined);
  }
  if (invalidBody || !result || typeof result !== "object" || !("data" in result)) throw new QcRequestError("A resposta QC não pôde ser confirmada.", 502, "QC_RESPONSE_INVALID");
  return result.data as T;
}

export function QcImportPanel({ purchaseId, targets, compact = false }: { purchaseId: string; targets: QcTarget[]; compact?: boolean }) {
  const { data: workspace } = useWorkspace();
  const { summary } = useQcSummary(purchaseId);
  const [open, setOpen] = useState(false), [matchingOpen, setMatchingOpen] = useState(false), [raw, setRaw] = useState(""), [prepared, setPrepared] = useState<QcPrepared | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({}), [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({}), [busy, setBusy] = useState(false), [error, setError] = useState(""), [confirmed, setConfirmed] = useState(false), [transferComplete, setTransferComplete] = useState(false), [revision, setRevision] = useState(0), [pendingMatchingCount, setPendingMatchingCount] = useState(0), [batchInfo, setBatchInfo] = useState("");
  const [pendingSelections, setPendingSelections] = useState<Record<string, string>>({}), [confirmCorrections, setConfirmCorrections] = useState(false), [confirmReconcile, setConfirmReconcile] = useState(false);
  const [transfer, setTransfer] = useState<QcTransferSnapshot | null>(null), [activeSourceId, setActiveSourceId] = useState<string | null>(null), [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const activeRun = useRef<QcRun | null>(null), runSequence = useRef(0);
  const currentUserId = workspace.currentUser.id;
  const scope = `${currentUserId}:${purchaseId}`;
  const [stateScope, setStateScope] = useState(scope);
  if (stateScope !== scope) { setStateScope(scope); setBusy(false); setActiveSourceId(null); setError(""); }
  useEffect(() => {
    activeRun.current?.controller.abort();
    activeRun.current = null;
    return () => { activeRun.current?.controller.abort(); activeRun.current = null; };
  }, [currentUserId, purchaseId]);
  if (!summary?.canManage) return null;

  function beginRun(): QcRun | null {
    if (activeRun.current?.scope === scope) return null;
    activeRun.current?.controller.abort();
    const run = { id: ++runSequence.current, scope, controller: new AbortController() };
    activeRun.current = run; setBusy(true); setError("");
    return run;
  }
  function isRunCurrent(run: QcRun) { return activeRun.current?.id === run.id && !run.controller.signal.aborted; }
  function finishRun(run: QcRun) {
    if (!isRunCurrent(run)) return;
    activeRun.current = null; setBusy(false); setActiveSourceId(null); invalidateSummary(purchaseId);
  }
  async function refreshTransfer(importId: string, run?: QcRun) {
    const snapshot = await qcRequest<QcTransferSnapshot>(`/api/qc/imports/${encodeURIComponent(importId)}`, undefined, "GET", run?.controller.signal);
    if (!run || isRunCurrent(run)) setTransfer(snapshot);
    return snapshot;
  }

  async function prepare() {
    setError(""); setBusy(true);
    try {
      if (new TextEncoder().encode(raw).byteLength > 1024 * 1024) throw new Error("O JSON excede 1 MiB.");
      const data = JSON.parse(raw);
      const result = await qcRequest<QcPrepared>(`/api/purchases/${encodeURIComponent(purchaseId)}/qc`, { operation: "prepare", data });
      setPrepared(result); setConfirmed(false); setTransferComplete(false); setSelections(Object.fromEntries(result.rows.map(row => [row.externalKey, row.match.targetItemId ?? ""])));
      setExpandedRows(Object.fromEntries(result.rows.map((row, index) => [row.externalKey, index === 0])));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Confira o JSON HubBuy."); }
    finally { setBusy(false); }
  }
  async function confirmLinks() {
    if (!prepared) return;
    const run = beginRun();
    if (!run) return;
    try {
      const choices = prepared.rows.map(row => {
        const targetId = selections[row.externalKey] || null;
        const correction = !!row.existingItemId && row.existingItemId !== targetId;
        return { externalKey: row.externalKey, targetKey: targetId, ...(correction ? { correctExisting: true, expectedTargetKey: row.existingItemId } : {}) };
      });
      const result = await qcRequest<{ revision: number; linked: number; ignored: number; pendingMatching: number; sources: number; eligibleSources: number }>(`/api/qc/imports/${encodeURIComponent(prepared.importId)}`, { operation: "confirm", expectedRevision: prepared.revision, choices }, "POST", run.controller.signal);
      if (!isRunCurrent(run)) return;
      setRevision(result.revision); setConfirmed(true); setPendingMatchingCount(result.pendingMatching); setTransfer(null); setImportedIds(new Set()); invalidateSummary(purchaseId);
      const matchingNote = result.pendingMatching ? ` ${result.pendingMatching} ocorrência(s) aguardam vínculo manual.` : "";
      if (result.eligibleSources > 0) { setBatchInfo("Importando as fotos associadas…"); await drainBatches(run, { importId: prepared.importId, revision: result.revision, matchingNote }); }
      else { setTransferComplete(true); await refreshTransfer(prepared.importId, run); if (isRunCurrent(run)) setBatchInfo(`${result.linked} ocorrência(s) associada(s), ${result.ignored} ignorada(s), ${result.sources} foto(s) registrada(s).${matchingNote}`); }
    } catch (cause) { if (isRunCurrent(run)) setError(cause instanceof Error ? cause.message : "Não foi possível confirmar os vínculos."); }
    finally { finishRun(run); }
  }
  async function drainBatches(run: QcRun, options: { importId?: string; externalItemId?: string; revision?: number; matchingNote?: string }) {
    const { importId, externalItemId, matchingNote = "" } = options;
    let nextRevision = options.revision, imported = 0, existing = 0, failed = 0, pending = 0, remaining = 0, complete = false;
    let consecutive429 = 0, transportRecoveries = 0, revisionRecoveries = 0, activeLeaseWaited = false, deadlineNoProgressRetry = false;
    let previousNoProgress = "", paused = false;
    const snapshotFingerprint = (snapshot: QcTransferSnapshot) => `${snapshot.importId}:${snapshot.revision}:${snapshot.nextSourceId ?? ""}:${snapshot.photos.map(photo => `${photo.id}:${photo.sourceId ?? ""}:${photo.state}:${photo.errorCode ?? ""}`).join("|")}`;
    const pause = (message: string) => { paused = true; setError(message); };
    const progressUrl = importId ? `/api/qc/imports/${encodeURIComponent(importId)}` : `/api/purchases/${encodeURIComponent(purchaseId)}/qc`;
    const readProgress = async () => {
      if (importId) {
        const snapshot = await refreshTransfer(importId, run);
        nextRevision = snapshot.revision;
        return snapshot;
      }
      await qcRequest<QcSummary>(progressUrl, undefined, "GET", run.controller.signal);
      return null;
    };
    let previousSnapshotFingerprint: string | null = null;
    if (importId) {
      const initialSnapshot = await readProgress();
      if (initialSnapshot) previousSnapshotFingerprint = snapshotFingerprint(initialSnapshot);
    }
    while (isRunCurrent(run)) {
      let result: QcBatchResult;
      try {
        result = await qcRequest<QcBatchResult>(progressUrl, importId
          ? { operation: "batch", expectedRevision: nextRevision }
          : { operation: "batch", externalItemId }, "POST", run.controller.signal);
      } catch (cause) {
        if (!isRunCurrent(run)) return;
        if (cause instanceof QcRequestError && cause.code === "QC_TRANSFER_ACTIVE") {
          if (activeLeaseWaited || !cause.retryAfterSeconds) {
            pause("Outra transferência QC continua ativa. O progresso salvo ficará disponível ao retomar.");
            break;
          }
          activeLeaseWaited = true;
          setBatchInfo("Outra transferência QC está terminando. Aguardando a concessão atual…");
          await waitForQcRetry(Math.min(180, cause.retryAfterSeconds) * 1000 + qcRetryJitter(), run.controller.signal);
          await readProgress();
          continue;
        }
        if (cause instanceof QcRequestError && cause.code === "QC_REVISION_CONFLICT") {
          if (revisionRecoveries >= 1) { pause("O progresso QC mudou novamente em outra sessão. Atualize o painel para continuar."); break; }
          revisionRecoveries++;
          await readProgress();
          continue;
        }
        if (cause instanceof QcRequestError && cause.status === 429) {
          consecutive429++;
          if (consecutive429 >= 3) { pause("A importação pausou após limites temporários repetidos. Retome quando o prazo informado terminar."); break; }
          if (!cause.retryAfterSeconds) { pause(cause.message); break; }
          setBatchInfo("Limite temporário atingido. A importação continuará automaticamente após a espera.");
          await waitForQcRetry(cause.retryAfterSeconds * 1000 + qcRetryJitter(), run.controller.signal);
          continue;
        }
        const transportFailure = cause instanceof TypeError || cause instanceof QcRequestError && [502, 503, 504].includes(cause.status);
        if (transportFailure) {
          if (transportRecoveries >= 2) { pause("A resposta da transferência não pôde ser confirmada. O estado salvo foi mantido para retomada."); break; }
          const delay = (transportRecoveries + 1) * 1000 + qcRetryJitter();
          transportRecoveries++;
          setBatchInfo("Reconectando para conferir o progresso salvo antes de continuar…");
          await waitForQcRetry(delay, run.controller.signal);
          await readProgress();
          continue;
        }
        throw cause;
      }
      if (!isRunCurrent(run)) return;
      const nextSnapshotFingerprint = result.snapshot ? snapshotFingerprint(result.snapshot) : null;
      if (!result.complete && nextSnapshotFingerprint && nextSnapshotFingerprint === previousSnapshotFingerprint) {
        setActiveSourceId(null);
        pause("O estado QC não avançou neste lote. O progresso salvo foi mantido para retomada.");
        break;
      }
      if (nextSnapshotFingerprint) previousSnapshotFingerprint = nextSnapshotFingerprint;
      consecutive429 = 0; transportRecoveries = 0; revisionRecoveries = 0;
      imported += result.imported; existing += result.existing; failed += result.failed; pending += result.pending; remaining = result.remaining; complete = result.complete;
      nextRevision = result.snapshot?.revision ?? result.revision ?? nextRevision;
      if (nextRevision !== undefined) setRevision(nextRevision);
      setImportedIds(current => new Set([...current, ...result.results.filter(row => row.status === "imported" && row.sourceId).map(row => row.sourceId!)]));
      if (result.snapshot) setTransfer(result.snapshot);
      else if (importId) await refreshTransfer(importId, run);
      setTransferComplete(complete);
      setActiveSourceId(null);
      setBatchInfo(`${imported} foto(s) importada(s), ${existing} já existente(s), ${failed} falha(s), ${pending} pendente(s); ${remaining} foto(s) ainda aguardam transferência.${matchingNote}`);
      if (complete) {
        setTransferComplete(true);
        setBatchInfo(pendingMatchingCount
          ? `${imported} foto(s) importada(s), ${existing} já existente(s). Transferências concluídas; ${pendingMatchingCount} ocorrência(s) ainda aguardam vínculo manual.`
          : `${imported} foto(s) importada(s), ${existing} já existente(s), ${failed} falha(s), ${pending} pendente(s). Importação concluída.${matchingNote}`);
        break;
      }
      if (result.stopReason && result.stopReason !== "deadline") {
        const reasons = { quota: "A cota desta importação foi atingida. As fotos concluídas foram preservadas para retomada.", recovery: "Uma transferência permanece incerta e aguarda reconciliação segura.", failure: "Uma ou mais fotos falharam. Confira os estados salvos e retome após corrigir o problema." };
        pause(reasons[result.stopReason]);
        break;
      }
      if ((failed || pending) && result.stopReason !== "deadline") {
        pause("Uma ou mais fotos precisam de atenção antes de continuar. Os resultados concluídos foram preservados.");
        break;
      }
      const madeProgress = result.imported + result.existing > 0;
      if (result.stopReason === "deadline" && !madeProgress) {
        if (deadlineNoProgressRetry) { pause("O prazo do lote terminou sem novo progresso. As fotos restantes podem ser retomadas."); break; }
        deadlineNoProgressRetry = true;
      } else if (madeProgress) deadlineNoProgressRetry = false;
      const fingerprint = `${remaining}:${result.results.map(row => `${row.sourceId ?? ""}:${row.status}:${row.code ?? ""}`).join("|")}`;
      if (!madeProgress && result.stopReason !== "deadline" && fingerprint === previousNoProgress) {
        pause("O estado QC não avançou neste lote. O progresso salvo foi mantido para retomada.");
        break;
      }
      previousNoProgress = madeProgress ? "" : fingerprint;
    }
    if (!isRunCurrent(run)) return;
    if (complete && !pendingMatchingCount) setBatchInfo(`${imported} foto(s) importada(s), ${existing} já existente(s), ${failed} falha(s), ${pending} pendente(s). Importação concluída.${matchingNote}`);
    else if (!complete && !paused && !failed && !pending) setBatchInfo(`${imported} foto(s) importada(s), ${existing} já existente(s). Importação parcial: ${remaining} foto(s) ainda aguardam transferência.${matchingNote}`);
    invalidateSummary(purchaseId);
  }
  async function runBatch() {
    if (!prepared) return;
    const run = beginRun();
    if (!run) return;
    try { await drainBatches(run, { importId: prepared.importId, revision, matchingNote: pendingMatchingCount ? ` ${pendingMatchingCount} ocorrência(s) ainda aguardam vínculo manual.` : "" }); }
    catch (cause) { if (isRunCurrent(run)) setError(cause instanceof Error ? cause.message : "O lote QC falhou."); }
    finally { finishRun(run); }
  }
  async function resolvePending(row: QcPendingMatch) {
    const targetKey = pendingSelections[row.externalItemId];
    if (!targetKey) return;
    const run = beginRun();
    if (!run) return;
    try {
      const result = await qcRequest<{ externalItemId: string; targetKey: string; revision: number; pendingSources: number }>(`/api/purchases/${encodeURIComponent(purchaseId)}/qc`, { operation: "resolve", externalItemId: row.externalItemId, expectedRevision: row.revision, targetKey }, "POST", run.controller.signal);
      if (!isRunCurrent(run)) return;
      setBatchInfo("Vínculo salvo. Iniciando a transferência das fotos desta ocorrência."); invalidateSummary(purchaseId);
      if (result.pendingSources > 0) await drainBatches(run, { externalItemId: result.externalItemId });
      else setBatchInfo("Vínculo salvo. Esta ocorrência não tem fotos pendentes.");
    } catch (cause) { if (isRunCurrent(run)) setError(cause instanceof Error ? cause.message : "Não foi possível resolver o vínculo."); }
    finally { finishRun(run); }
  }
  async function reconcile() {
    setError(""); setBusy(true);
    try {
      await qcRequest<{ processed: number; partial: boolean }>(`/api/purchases/${encodeURIComponent(purchaseId)}/qc`, { operation: "reconcile" });
      setBatchInfo("A tentativa de transferência ou remoção foi concluída.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível reconciliar QC."); }
    finally { setBusy(false); setConfirmReconcile(false); invalidateSummary(purchaseId); }
  }
  const hasCorrections = !!prepared?.rows.some(row => row.existingItemId && row.existingItemId !== (selections[row.externalKey] || null));
  const openPanel = () => { setOpen(true); setPrepared(null); setConfirmed(false); setTransferComplete(false); setError(""); setBatchInfo(""); setTransfer(null); setActiveSourceId(null); setImportedIds(new Set()); };
  const pendingMatches = summary.pendingMatching ?? 0;
  const pendingOperations = (summary.pendingTransfers ?? 0) + (summary.pendingDeletes ?? 0) + (summary.pendingPreviews ?? 0);
  return <>
    <div className={`qc-manager-actions${compact ? " qc-manager-actions-compact" : ""}`}><Button className="qc-import-primary" variant="outline" size={compact ? "icon" : "sm"} aria-label="Importar QC" title={compact ? "Importar QC" : undefined} onClick={openPanel}>{compact ? <>
      {/* Local icon from the approved Figma header. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/qc-import.svg" alt="" aria-hidden="true"/>
    </> : <><ImagePlus size={15} aria-hidden="true"/>Importar QC</>}</Button><DropdownMenu.Root><DropdownMenu.Trigger asChild><Button variant="ghost" size="sm" aria-label={`Ações QC${pendingMatches + pendingOperations ? ` · ${pendingMatches + pendingOperations} pendências` : ""}`}><MoreVertical size={16}/><span>Ações QC</span>{pendingMatches + pendingOperations > 0 && <span className="qc-pending-count" aria-hidden="true">{pendingMatches + pendingOperations}</span>}</Button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="dropdown" align="end" sideOffset={6}><DropdownMenu.Item onSelect={() => setMatchingOpen(true)}><CircleHelp size={15}/>Verificar vínculos pendentes{pendingMatches ? ` (${pendingMatches})` : ""}</DropdownMenu.Item><DropdownMenu.Item onSelect={() => setConfirmReconcile(true)}><RefreshCw size={15}/>Repetir pendências QC{pendingOperations ? ` (${pendingOperations})` : ""}</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></div>
    <Surface open={open} onOpenChange={value => { if (!busy) setOpen(value); }} title="Importar QC do HubBuy" description="Cole uma resposta HubBuy. Somente freePhotos são processadas; os vínculos serão confirmados antes de qualquer transferência." sheet className={`qc-import-sheet${confirmed ? " qc-import-transfer-sheet" : ""}`}>
      {!prepared && <div className="qc-import-stage">
        <div className="qc-import-main qc-import-input-main">
          <label className="qc-import-label">JSON HubBuy<textarea aria-label="JSON HubBuy" value={raw} onChange={event => setRaw(event.target.value)} rows={10} spellCheck={false} placeholder="Cole o JSON exportado do HubBuy" /></label>
          {busy && <p className="qc-import-progress">Analisando resposta HubBuy…</p>}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <footer className="qc-import-footer qc-import-entry-footer"><span className="muted">Limite: 1 MiB</span><Button disabled={busy || !raw.trim()} onClick={() => void prepare()}>{busy ? "Analisando…" : "Analisar JSON"}</Button></footer>
      </div>}
      {prepared && !confirmed && <div className="qc-import-stage">
        <div className="qc-import-summary" aria-label={`${prepared.orderCount} pedido(s), ${prepared.rows.length} ocorrência(s), ${prepared.photoCount} foto(s)`}>
          <FileText size={20} aria-hidden="true" />
          <span><strong>{prepared.orderCount}</strong> pedido(s)</span><span className="qc-summary-separator" aria-hidden="true">·</span>
          <span><strong>{prepared.rows.length}</strong> ocorrência(s)</span><span className="qc-summary-separator" aria-hidden="true">·</span>
          <span><strong>{prepared.photoCount}</strong> foto(s)</span>
        </div>
        {prepared.partial && <p className="qc-import-partial" role="status">O HubBuy indica mais pedidos. Esta prévia cobre apenas o JSON colado.</p>}
        <div className="qc-preview-list" aria-label="Ocorrências importadas">
          {prepared.rows.length === 0 && <div className="qc-preview-empty"><Info size={20} aria-hidden="true"/><p>Nenhuma ocorrência encontrada neste JSON.</p></div>}
          {prepared.rows.map((row, index) => {
            const productName = row.title || row.skuInfo || row.orderGoodsId || row.orderGoodsNo || "Produto sem título";
            const expanded = expandedRows[row.externalKey] ?? index === 0;
            const status = occurrenceStatus(row);
            const StatusIcon = status.tone === "success" ? Check : status.tone === "warning" ? CircleHelp : status.tone === "error" ? CircleAlert : Info;
            const selectedTarget = selections[row.externalKey];
            const manualSelection = !!selectedTarget && selectedTarget !== row.match.targetItemId && !row.match.candidates.some(candidate => candidate.itemId === selectedTarget);
            const attributes = occurrenceAttributes(row);
            return <details className={`qc-occurrence-card${expanded ? " is-expanded" : ""}`} key={row.externalKey} open={expanded} onToggle={event => {
              const nextExpanded = event.currentTarget.open;
              setExpandedRows(current => current[row.externalKey] === nextExpanded ? current : { ...current, [row.externalKey]: nextExpanded });
            }}>
              <summary className="qc-occurrence-trigger" aria-expanded={expanded}>
                <ProductCategoryMarker visualKey={resolveProductCategory(productName)} />
                <span className="qc-occurrence-title" title={productName}>{productName}</span>
                {expanded ? <ChevronUp size={20} aria-hidden="true"/> : <ChevronDown size={20} aria-hidden="true"/>}
              </summary>
              {expanded && <div className="qc-occurrence-details" id={`qc-occurrence-details-${index}`}>
                <div className="qc-occurrence-attributes">
                  {attributes.map((attribute, attributeIndex) => <div className="qc-occurrence-attribute" key={`${attribute.label}-${attributeIndex}`}><span>{attribute.label}</span><strong>{attribute.value}</strong></div>)}
                </div>
                <div className={`qc-match-state ${status.tone}`}><StatusIcon size={18} aria-hidden="true"/><span>{status.label}</span></div>
                {status.detail && <p className={`qc-match-detail${status.tone === "error" ? " is-error" : ""}`}>{status.detail}</p>}
                <label className="qc-product-select">Produto correspondente<select aria-label={`Associar ${productName}`} value={selections[row.externalKey] ?? ""} onChange={event => setSelections(current => ({ ...current, [row.externalKey]: event.target.value }))}>
                  <option value="">{row.match.status === "PENDING" ? "Manter pendente" : row.conflict ? "Descartar ocorrência conflitante" : "Ignorar ocorrência"}</option>
                  {(row.conflict ? [] : targets).map(target => <option key={target.id} value={target.id}>{target.origin === "additional" ? "Pedido adicional · " : "Produto · "}{target.name}{target.variant ? ` · ${target.variant}` : ""}</option>)}
                </select></label>
                {manualSelection && <p className="qc-match-detail" role="status">Associação manual selecionada. Confira o produto e a variação antes de confirmar os vínculos.</p>}
              </div>}
            </details>;
          })}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <footer className="qc-import-footer"><Button variant="outline" disabled={busy} onClick={() => setPrepared(null)}>Voltar</Button><Button disabled={busy} onClick={() => hasCorrections ? setConfirmCorrections(true) : void confirmLinks()}>{busy ? "Salvando…" : "Confirmar vínculos"}</Button></footer>
      </div>}
      {prepared && confirmed && <div className="qc-import-stage">
        <div className="qc-import-main qc-import-confirmed-main">
          <QcImportProgress photos={transfer?.photos ?? null} activeSourceId={activeSourceId} importedIds={importedIds} busy={busy} complete={transferComplete} error={error} total={prepared.rows.reduce((count, row) => count + (selections[row.externalKey] ? row.photoCount : 0), 0)} renderPreview={photo => <QcPreviewImage image={{ id: photo.imageId!, previewUrl: photo.previewUrl, width: null, height: null, occurrence: photo.occurrence ?? "" }} userId={workspace.currentUser.id} workspaceId={workspace.workspaceId} purchaseId={purchaseId} alt=""/>}/>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <footer className="qc-import-footer"><Button variant="outline" disabled={busy} onClick={() => { setPrepared(null); setConfirmed(false); setTransferComplete(false); }}>Nova importação</Button><Button disabled={busy} onClick={() => transferComplete ? setOpen(false) : void runBatch()}>{busy ? "Processando…" : transferComplete ? "Concluir" : "Continuar / tentar novamente"}</Button></footer>
      </div>}
    </Surface>
    <Surface open={matchingOpen} onOpenChange={value => { if (!busy) setMatchingOpen(value); }} title="Vínculos QC pendentes" description="Revise cada ocorrência ambígua e escolha um produto desta compra. As sugestões ajudam na escolha, mas você pode associar manualmente outro produto. Só depois de salvar o vínculo as fotos dessa ocorrência começam a ser transferidas." sheet>
      {!summary.pendingRows?.length && <p className="muted">Nenhuma ocorrência com candidatos aguarda vínculo.</p>}
      {!!summary.pendingRows?.length && <div className="qc-preview-list">{summary.pendingRows.map(row => <div className="qc-preview-row" key={row.externalItemId}>
        <span><strong>{row.title || row.skuInfo || row.orderGoodsId || row.orderGoodsNo || row.externalItemId}</strong><small>{row.skuInfo || "Sem variação"} · {row.photoCount} foto(s) aguardando vínculo{row.quantity === null ? "" : ` · quantidade HubBuy ${row.quantity}`}</small></span>
        <div className="qc-pending-match-controls"><select aria-label={`Produto Loti para ${row.title || row.skuInfo || row.externalItemId}`} value={pendingSelections[row.externalItemId] ?? ""} onChange={event => setPendingSelections(current => ({ ...current, [row.externalItemId]: event.target.value }))}>
          <option value="">Selecione um produto</option>
          {targets.map(target => { const candidate = row.candidates.find(value => value.itemId === target.id); return <option key={target.id} value={target.id}>{target.origin === "additional" ? "Pedido adicional · " : "Produto · "}{target.name}{target.variant ? ` · ${target.variant}` : ""}{candidate ? ` · Sugestão: ${candidate.reasons.join(" · ")}` : " · Associação manual"}</option>; })}
        </select><Button disabled={busy || !pendingSelections[row.externalItemId]} onClick={() => void resolvePending(row)}>{busy ? "Salvando…" : "Associar e processar fotos"}</Button></div>
      </div>)}</div>}
      {batchInfo && <p className="qc-status-note" role="status">{batchInfo}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </Surface>
    <Confirm open={confirmCorrections} onOpenChange={setConfirmCorrections} title="Confirmar correção de vínculo?" description="As fotos continuarão ligadas à ocorrência HubBuy e não serão movidas no R2. Esta ação altera apenas o produto Loti associado." label="Confirmar correções" busy={busy} onConfirm={() => { setConfirmCorrections(false); void confirmLinks(); }} />
    <Confirm open={confirmReconcile} onOpenChange={setConfirmReconcile} title="Tentar transferências ou remoções novamente?" description="O Loti tentará novamente as transferências e remoções pendentes. Essa ação não altera vínculos de ocorrências." label="Tentar novamente" busy={busy} onConfirm={() => void reconcile()} />
  </>;
}

type GalleryPage = { itemId: string; pageOffset: number; totalCount: number; presentationRevision: number; primaryImageId: string | null; canSetCover: boolean; images: QcImage[]; nextOffset: number | null };
function QcPreviewImage({ image, userId, workspaceId, purchaseId, alt, priority = 1, onUnavailable }: { image: QcImage; userId: string; workspaceId: string; purchaseId: string; alt: string; priority?: number; onUnavailable?: () => void }) {
  const scope = qcScope(userId, workspaceId);
  const [version, setVersion] = useState(0);
  const cacheKey = JSON.stringify([scope, purchaseId, image.id, image.previewVersion ?? image.previewUrl]);
  const key = `${cacheKey}:${version}`;
  const [view, setView] = useState<{ key: string; src: string | null; failed: boolean }>({ key: "", src: null, failed: false });
  useEffect(() => subscribeQcChanges(() => setVersion(current => current + 1)), []);
  const onUnavailableRef = useRef(onUnavailable);
  useEffect(() => { onUnavailableRef.current = onUnavailable; }, [onUnavailable]);
  const current = view.key === key ? view : null;
  useEffect(() => {
    let active = true, objectUrl: string | null = null;
    if (!image.previewUrl || !isQcScopeActive(scope)) return;
    const request = qcPreviewCache.acquire(cacheKey, image.previewUrl, priority);
    void request.promise.then(blob => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob); setView({ key, src: objectUrl, failed: false });
    }).catch(error => {
      if (error?.status === 401) resetQcClient();
      if (active && error?.name !== "AbortError") { setView({ key, src: null, failed: true }); onUnavailableRef.current?.(); }
    });
    return () => { active = false; request.release(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [cacheKey, image.previewUrl, key, priority, scope]);
  if (!image.previewUrl || current?.failed) return <span className="qc-preview-placeholder" aria-label="Preview QC indisponível">Preview indisponível</span>;
  if (!current?.src) return <span className="qc-preview-placeholder" aria-label="Carregando preview QC">Carregando preview…</span>;
  // Authenticated, bounded private WebP; never send it through Next's optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={current.src} referrerPolicy="no-referrer" alt={alt} onError={() => onUnavailableRef.current?.()} />;
}

export function QcGalleryButton({ purchaseId, itemId, itemName, canManageHere = false, triggerLabel = "Ver QC", triggerAriaLabel, costThumbnails, costIdentity }: { purchaseId: string; itemId: string; itemName: string; canManageHere?: boolean; triggerLabel?: string; triggerAriaLabel?: string; costThumbnails?: "desktop" | "mobile"; costIdentity?: { marker: ReactNode; label: ReactNode } }) {
  const { data } = useWorkspace();
  const userId = data.currentUser.id;
  const [open, setOpen] = useState(false), [images, setImages] = useState<QcImage[]>([]), [loading, setLoading] = useState(false), [pageLoading, setPageLoading] = useState(false), [error, setError] = useState(""), [selectedImageId, setSelectedImageId] = useState<string | null>(null), [pageOffset, setPageOffset] = useState(0), [totalCount, setTotalCount] = useState(0), [primaryImageId, setPrimaryImageId] = useState<string | null>(null), [presentationRevision, setPresentationRevision] = useState(0), [canSetCover, setCanSetCover] = useState(false), [original, setOriginal] = useState<{ imageId: string | null; url: string; stage: "idle" | "loading" | "source" | "fallback-loading" | "fallback" | "failed" }>({ imageId: null, url: "", stage: "idle" }), [confirmDelete, setConfirmDelete] = useState<string | null>(null), [deleting, setDeleting] = useState(false), [savingCover, setSavingCover] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const { summary } = useQcSummary(purchaseId, !costThumbnails || open);
  const { ref: identityRef, visible, near } = useQcVisibility();
  const presentation = useQcPresentation(qcScope(userId, data.workspaceId), purchaseId, itemId, !!costThumbnails && visible, near);
  const countValue = costThumbnails ? presentation?.qcCount ?? 0 : summary ? summary.counts.find(row => row.itemId === itemId)?.count ?? 0 : null;
  const [failedCover, setFailedCover] = useState<QcImage | null>(null);
  const asImage = (image: NonNullable<typeof presentation>["previews"][number]): QcImage => ({ ...image, id: image.imageId });
  const costImages = presentation?.previews.map(asImage) ?? [];
  const candidateCover = presentation?.coverPreview ? asImage(presentation.coverPreview) : null;
  const costCover = candidateCover && !(failedCover?.id === candidateCover.id && failedCover.previewUrl === candidateCover.previewUrl) ? candidateCover : null;
  const unavailableCover = useCallback(() => { setFailedCover(costCover); }, [costCover]);
  const manage = !!summary?.canManage;
  const selectedIndex = images.findIndex(image => image.id === selectedImageId);
  const selectedImage = selectedIndex >= 0 ? images[selectedIndex] : null;
  const load = useCallback(async (offset = 0, targetImageId?: string) => {
    setLoading(true); setError("");
    try {
      const target = targetImageId ? `&imageId=${encodeURIComponent(targetImageId)}` : "";
      const page = await qcRequest<GalleryPage>(`/api/purchases/${encodeURIComponent(purchaseId)}/qc?itemId=${encodeURIComponent(itemId)}&offset=${offset}${target}`, undefined, "GET");
      setImages(page.images); setPageOffset(page.pageOffset); setTotalCount(page.totalCount); setPrimaryImageId(page.primaryImageId); setPresentationRevision(page.presentationRevision); setCanSetCover(page.canSetCover);
      setSelectedImageId(current => page.images.some(image => image.id === (targetImageId ?? current)) ? targetImageId ?? current : page.images[0]?.id ?? null);
      return page;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar a galeria QC."); return null; }
    finally { setLoading(false); }
  }, [itemId, purchaseId]);
  useEffect(() => subscribeSummary(summaryKey(userId, purchaseId), () => { if (open) void load(pageOffset); }), [load, open, pageOffset, purchaseId, userId]);
  useEffect(() => {
    if (!open || !selectedImageId) return;
    let active = true;
    const imageId = selectedImageId;
    void qcRequest<{ sourceUrl: string }>(`/api/qc/images/${encodeURIComponent(imageId)}/source`, undefined, "GET").then(result => {
      if (active) setOriginal({ imageId, url: result.sourceUrl, stage: "source" });
    }).catch(cause => { if (active) { setOriginal({ imageId, url: "", stage: "failed" }); setError(cause instanceof Error ? cause.message : "Não foi possível abrir a foto QC."); } });
    return () => { active = false; };
  }, [open, selectedImageId]);
  const openGallery = (imageId?: string) => { setOpen(true); setSelectedImageId(null); void load(0, imageId); };
  const navigate = useCallback(async (direction: -1 | 1) => {
    if (pageLoading || !images.length || selectedIndex < 0) return;
    const nextIndex = selectedIndex + direction;
    if (nextIndex >= 0 && nextIndex < images.length) { setSelectedImageId(images[nextIndex]!.id); return; }
    if (direction > 0 && pageOffset + images.length < totalCount) {
      setPageLoading(true);
      try { const page = await load(pageOffset + images.length); if (page?.images[0]) setSelectedImageId(page.images[0].id); }
      finally { setPageLoading(false); }
    } else if (direction < 0 && pageOffset > 0) {
      const offset = Math.max(0, pageOffset - 12);
      setPageLoading(true);
      try { const page = await load(offset); if (page?.images.length) setSelectedImageId(page.images[page.images.length - 1]!.id); }
      finally { setPageLoading(false); }
    }
  }, [images, load, pageLoading, pageOffset, selectedIndex, totalCount]);
  useEffect(() => {
    if (!open || !selectedImageId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || ["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement)?.tagName ?? "")) return;
      if (event.key === "ArrowLeft") { event.preventDefault(); void navigate(-1); }
      else if (event.key === "ArrowRight") { event.preventDefault(); void navigate(1); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, open, selectedImageId]);
  async function requestFallback() {
    if (!selectedImageId) return;
    const imageId = selectedImageId;
    setOriginal({ imageId, url: "", stage: "fallback-loading" });
    try {
      const result = await qcRequest<{ url: string }>(`/api/qc/images/${encodeURIComponent(imageId)}/fallback`);
      if (selectedImageId === imageId) setOriginal({ imageId, url: result.url, stage: "fallback" });
    } catch { if (selectedImageId === imageId) setOriginal({ imageId, url: "", stage: "failed" }); }
  }
  function onOriginalError() {
    if (originalView.stage === "source") void requestFallback();
    else if (originalView.stage === "fallback") setOriginal({ imageId: selectedImageId, url: "", stage: "failed" });
  }
  async function saveCover() {
    if (!selectedImageId) return;
    setSavingCover(true); setError("");
    try {
      const result = await qcRequest<{ primaryImageId: string; revision: number }>(`/api/purchases/${encodeURIComponent(purchaseId)}/items/${encodeURIComponent(itemId)}/qc-presentation`, { imageId: selectedImageId, expectedRevision: presentationRevision });
      setPrimaryImageId(result.primaryImageId); setPresentationRevision(result.revision); invalidateSummary(purchaseId, false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar a capa QC."); }
    finally { setSavingCover(false); }
  }
  async function remove(imageId: string) {
    const removingCurrent = selectedImageId === imageId;
    const oldIndex = images.findIndex(image => image.id === imageId);
    const preferredId = removingCurrent ? images[oldIndex + 1]?.id ?? images[oldIndex - 1]?.id ?? null : selectedImageId;
    setDeleting(true); setError("");
    try {
      const result = await qcRequest<{ status: string; message?: string }>(`/api/qc/images/${encodeURIComponent(imageId)}`, undefined, "DELETE");
      let page = await qcRequest<GalleryPage>(`/api/purchases/${encodeURIComponent(purchaseId)}/qc?itemId=${encodeURIComponent(itemId)}&offset=${pageOffset}`, undefined, "GET");
      if (!page.images.length && page.pageOffset > 0) page = await qcRequest<GalleryPage>(`/api/purchases/${encodeURIComponent(purchaseId)}/qc?itemId=${encodeURIComponent(itemId)}&offset=${Math.max(0, page.pageOffset - 12)}`, undefined, "GET");
      setImages(page.images); setPageOffset(page.pageOffset); setTotalCount(page.totalCount); setPrimaryImageId(page.primaryImageId); setPresentationRevision(page.presentationRevision); setCanSetCover(page.canSetCover);
      if (removingCurrent) setSelectedImageId(page.images.some(image => image.id === preferredId) ? preferredId : page.images[0]?.id ?? null);
      if (result.status === "pending") setError(result.message ?? "A remoção privada ficou pendente de reconciliação.");
      invalidateSummary(purchaseId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível excluir a foto."); }
    finally { setDeleting(false); setConfirmDelete(null); }
  }
  const currentPosition = selectedIndex < 0 ? 0 : pageOffset + selectedIndex + 1;
  const originalView = open && selectedImageId && original.imageId === selectedImageId ? original : { imageId: selectedImageId, url: "", stage: open && selectedImageId ? "loading" as const : "idle" as const };
  return <>
    {costThumbnails ? <div className="cost-compact-identity" ref={identityRef}>
      {costCover ? <button type="button" className={`qc-product-photo qc-product-cover${costThumbnails === "mobile" ? " qc-product-photo-count" : ""}`} data-qc-image-id={costCover.id} aria-label={`Abrir capa QC de ${itemName}${costThumbnails === "mobile" ? ` · ${countValue} fotos` : ""}`} onClick={() => openGallery(costCover.id)}><QcPreviewImage image={costCover} priority={0} userId={userId} workspaceId={data.workspaceId} purchaseId={purchaseId} alt={`Capa QC de ${itemName}`} onUnavailable={unavailableCover}/>{costThumbnails === "mobile" && <span className="qc-product-photo-badge" aria-hidden="true">{countValue}</span>}</button> : costIdentity?.marker}
      {costIdentity?.label}
      {!!countValue && (costThumbnails !== "mobile" || !costCover) && <div className={`qc-product-photos qc-product-photos-${costThumbnails}`}>
      {costThumbnails === "mobile" ? <button type="button" className="qc-product-photo qc-product-photo-count" onClick={() => openGallery()} aria-label={`Ver ${countValue} fotos QC de ${itemName}`} title={`Ver ${countValue} fotos QC`}>
        {costImages[0] ? <QcPreviewImage image={costImages[0]} userId={userId} workspaceId={data.workspaceId} purchaseId={purchaseId} alt=""/> : <ImagePlus size={20} aria-hidden="true"/>}<span className="qc-product-photo-badge" aria-hidden="true">{countValue}</span>
      </button> : <>
        {costImages.map((image, index) => <button type="button" className="qc-product-photo" key={image.id} data-qc-image-id={image.id} aria-label={`Abrir foto QC ${index + 1} de ${itemName}`} onClick={() => openGallery(image.id)}><QcPreviewImage image={image} userId={userId} workspaceId={data.workspaceId} purchaseId={purchaseId} alt=""/></button>)}
        <button type="button" className="qc-product-photos-more" aria-label={`Ver ${countValue} fotos QC de ${itemName}`} onClick={() => openGallery()}>Ver mais</button>
      </>}
    </div>}</div> : <Button type="button" variant="ghost" size="sm" onClick={() => openGallery()} aria-label={triggerAriaLabel ?? `Ver QC de ${itemName}`}>{triggerLabel}{countValue === null ? "" : ` (${countValue})`}</Button>}
    <Surface open={open} onOpenChange={value => { setOpen(value); if (!value) { setSelectedImageId(null); setError(""); } }} title={`QC · ${itemName}`} className="qc-viewer-surface">
      {loading && <p className="muted" role="status">Carregando fotos QC…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {!selectedImageId && !loading && !images.length && !error && <p className="muted">Nenhuma foto QC disponível para este produto.</p>}
      {selectedImage && <div className="qc-viewer-content">
        <div className="qc-viewer-toolbar"><span aria-live="polite">Foto {currentPosition} de {totalCount}</span></div>
        <div className="qc-viewer-main" onTouchStart={event => { touchStart.current = { x: event.touches[0]!.clientX, y: event.touches[0]!.clientY }; }} onTouchEnd={event => { const start = touchStart.current; if (!start) return; const dx = event.changedTouches[0]!.clientX - start.x, dy = event.changedTouches[0]!.clientY - start.y; touchStart.current = null; if (Math.abs(dx) > 44 && Math.abs(dy) < 90) void navigate(dx < 0 ? 1 : -1); }}>
          <Button className="qc-viewer-prev" variant="ghost" size="icon" aria-label="Foto anterior" disabled={pageLoading || currentPosition <= 1} onClick={() => void navigate(-1)}><ChevronLeft size={22}/></Button>
          <div className="qc-viewer-photo" aria-label={`Foto QC ${currentPosition} de ${totalCount}`}>
            {originalView.stage === "loading" && <p className="muted" role="status">Carregando foto original…</p>}
            {originalView.stage === "fallback-loading" && <p className="muted" role="status">Renovando backup privado…</p>}
            {originalView.stage === "failed" && <div className="qc-image-unavailable" role="status"><span>Foto indisponível</span><Button variant="outline" size="sm" onClick={() => void requestFallback()}>Renovar backup</Button></div>}
            {originalView.url && (originalView.stage === "source" || originalView.stage === "fallback") && <>
              {/* Only the selected original is loaded at full size; this image is never passed through Next's optimizer. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={originalView.url} referrerPolicy="no-referrer" alt={`${itemName}, foto QC ${currentPosition}, ${selectedImage.occurrence}`} onError={onOriginalError} />
            </>}
          </div>
          <Button className="qc-viewer-next" variant="ghost" size="icon" aria-label="Próxima foto" disabled={pageLoading || currentPosition >= totalCount} onClick={() => void navigate(1)}><ChevronRight size={22}/></Button>
        </div>
        <p className="qc-viewer-occurrence">{selectedImage.occurrence || "Ocorrência HubBuy"}</p>
        {pageLoading && <p className="muted" role="status">Carregando próxima página…</p>}
        <div className="qc-viewer-thumbnails" aria-label="Navegação por previews">{images.map((image, index) => <button type="button" className={`qc-viewer-thumb${selectedImage.id === image.id ? " is-selected" : ""}`} key={image.id} aria-label={`Selecionar foto ${pageOffset + index + 1}`} aria-current={selectedImage.id === image.id ? "true" : undefined} onClick={() => setSelectedImageId(image.id)}><QcPreviewImage image={image} userId={userId} workspaceId={data.workspaceId} purchaseId={purchaseId} alt="" /></button>)}</div>
        <div className="qc-viewer-actions">
          {canManageHere && manage && canSetCover && <Button type="button" variant="ghost" size="sm" disabled={savingCover || primaryImageId === selectedImage.id} onClick={() => void saveCover()}><Star size={16} fill={primaryImageId === selectedImage.id ? "currentColor" : "none"}/>{savingCover ? "Salvando capa…" : primaryImageId === selectedImage.id ? "Capa atual" : "Usar como capa QC"}</Button>}
          {canManageHere && manage && <Button type="button" variant="ghost" size="sm" className="qc-viewer-delete" disabled={deleting} onClick={() => setConfirmDelete(selectedImage.id)}><Trash2 size={15}/>Excluir foto QC</Button>}
        </div>
      </div>}
    </Surface>
    <Confirm open={!!confirmDelete} onOpenChange={value => { if (!deleting && !value) setConfirmDelete(null); }} title="Excluir foto QC?" description="Ela sai imediatamente da galeria. A capa será atualizada para outra foto disponível, ou ficará vazia. A remoção física do original e do preview privado pode exigir nova tentativa. Depois que terminar, uma nova análise e confirmação do JSON pode importar novamente as fotos incluídas. A CDN original do HubBuy permanece fora do controle do Loti." danger label="Excluir foto" busy={deleting} onConfirm={() => confirmDelete && void remove(confirmDelete)} />
  </>;
}
