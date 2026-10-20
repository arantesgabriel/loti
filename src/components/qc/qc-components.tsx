"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleAlert, CircleHelp, FileText, ImagePlus, Info, MoreVertical, RefreshCw, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm, Surface } from "@/components/ui/surface";
import { ProductCategoryMarker } from "@/components/product-category-icons";
import { resolveProductCategory } from "@/lib/domain/categories";
import { useWorkspace } from "@/components/workspace-provider";
import { QcImportProgress, type QcTransferSnapshot } from "./qc-import-progress";

type QcImage = { id: string; previewUrl: string | null; width: number | null; height: number | null; occurrence: string };
type QcPendingMatch = { externalItemId: string; revision: number; orderNo: string | null; orderGoodsId: string | null; orderGoodsNo: string | null; skuInfo: string | null; title: string | null; quantity: number | null; photoCount: number; candidates: { itemId: string; name: string; reasons: string[] }[] };
type QcSummary = { canManage: boolean; counts: { itemId: string; count: number }[]; pendingMatching?: number; pendingRows?: QcPendingMatch[]; pendingTransfers?: number; pendingDeletes?: number; pendingPreviews?: number };
type QcPreview = { externalKey: string; orderNo: string | null; orderGoodsId: string | null; orderGoodsNo: string | null; offerId: string | null; skuInfo: string | null; title: string | null; quantity: number | null; photoCount: number; match: { status: string; targetItemId: string | null; candidates: { itemId: string; name: string; reasons: string[] }[] }; existingItemId: string | null; conflict: string | null };
type QcPrepared = { importId: string; revision: number; partial: boolean; orderCount: number; photoCount: number; rows: QcPreview[] };
type QcTarget = { id: string; origin: "purchase" | "additional"; name: string; variant: string | null; quantity: number };
type QcStatusTone = "success" | "warning" | "neutral" | "error";

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
const previewRequests = new Map<string, Promise<Blob>>();
let activeUserScope: string | null = null;
const summaryKey = (userId: string, purchaseId: string) => `${userId}:${purchaseId}`;
function resetQcUserScope(userId: string) {
  if (activeUserScope === userId) return;
  activeUserScope = userId;
  summaryCache.clear(); summaryListeners.clear(); previewRequests.clear();
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
function invalidateSummary(purchaseId: string) {
  for (const [key] of summaryCache) if (key.endsWith(`:${purchaseId}`)) summaryCache.delete(key);
  for (const [key, listeners] of summaryListeners) if (key.endsWith(`:${purchaseId}`)) for (const listener of listeners) listener();
}
function useQcSummary(purchaseId: string) {
  const { data } = useWorkspace();
  const userId = data.currentUser.id, key = summaryKey(userId, purchaseId);
  const [result, setResult] = useState<{ key: string; summary: QcSummary } | null>(null), [version, setVersion] = useState(0);
  useEffect(() => { resetQcUserScope(userId); return subscribeSummary(key, () => setVersion(current => current + 1)); }, [key, userId]);
  useEffect(() => {
    let active = true;
    void summaryFor(userId, purchaseId).then(value => { if (active) setResult({ key, summary: value }); }).catch(() => { if (active) setResult(current => current?.key === key ? null : current); });
    return () => { active = false; };
  }, [key, purchaseId, userId, version]);
  return { summary: result?.key === key ? result.summary : null };
}
async function qcRequest<T>(url: string, body?: unknown, method = "POST") {
  const response = await fetch(url, { method, credentials: "same-origin", cache: "no-store", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Não foi possível concluir a operação QC.");
  return result.data as T;
}

export function QcImportPanel({ purchaseId, targets, compact = false }: { purchaseId: string; targets: QcTarget[]; compact?: boolean }) {
  const { data: workspace } = useWorkspace();
  const { summary } = useQcSummary(purchaseId);
  const [open, setOpen] = useState(false), [matchingOpen, setMatchingOpen] = useState(false), [raw, setRaw] = useState(""), [prepared, setPrepared] = useState<QcPrepared | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({}), [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({}), [busy, setBusy] = useState(false), [error, setError] = useState(""), [confirmed, setConfirmed] = useState(false), [transferComplete, setTransferComplete] = useState(false), [revision, setRevision] = useState(0), [pendingMatchingCount, setPendingMatchingCount] = useState(0), [batchInfo, setBatchInfo] = useState("");
  const [pendingSelections, setPendingSelections] = useState<Record<string, string>>({}), [confirmCorrections, setConfirmCorrections] = useState(false), [confirmReconcile, setConfirmReconcile] = useState(false);
  const [transfer, setTransfer] = useState<QcTransferSnapshot | null>(null), [activeSourceId, setActiveSourceId] = useState<string | null>(null), [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  if (!summary?.canManage) return null;

  async function refreshTransfer(importId: string) {
    const snapshot = await qcRequest<QcTransferSnapshot>(`/api/qc/imports/${encodeURIComponent(importId)}`, undefined, "GET");
    setTransfer(snapshot);
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
    setError(""); setBusy(true);
    try {
      const choices = prepared.rows.map(row => {
        const targetId = selections[row.externalKey] || null;
        const correction = !!row.existingItemId && row.existingItemId !== targetId;
        return { externalKey: row.externalKey, targetKey: targetId, ...(correction ? { correctExisting: true, expectedTargetKey: row.existingItemId } : {}) };
      });
      const result = await qcRequest<{ revision: number; linked: number; ignored: number; pendingMatching: number; sources: number; eligibleSources: number }>(`/api/qc/imports/${encodeURIComponent(prepared.importId)}`, { operation: "confirm", expectedRevision: prepared.revision, choices });
      setRevision(result.revision); setConfirmed(true); setPendingMatchingCount(result.pendingMatching); setTransfer(null); setImportedIds(new Set()); invalidateSummary(purchaseId);
      const matchingNote = result.pendingMatching ? ` ${result.pendingMatching} ocorrência(s) aguardam vínculo manual.` : "";
      if (result.eligibleSources > 0) { setBatchInfo("Importando as fotos associadas…"); await drainImport(prepared.importId, result.revision, result.pendingMatching, matchingNote); }
      else { setTransferComplete(true); await refreshTransfer(prepared.importId); setBatchInfo(`${result.linked} ocorrência(s) associada(s), ${result.ignored} ignorada(s), ${result.sources} foto(s) registrada(s).${matchingNote}`); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível confirmar os vínculos."); }
    finally { setBusy(false); setActiveSourceId(null); invalidateSummary(purchaseId); }
  }
  async function drainImport(importId: string, initialRevision: number, pendingMatching = 0, matchingNote = "") {
    let nextRevision = initialRevision, imported = 0, existing = 0, failed = 0, pending = 0, remaining = 0, complete = false;
    let snapshot = await refreshTransfer(importId);
    for (let call = 0; call < 12; call++) {
      setActiveSourceId(snapshot.nextSourceId);
      const result = await qcRequest<{ processed: number; imported: number; existing: number; failed: number; pending: number; remaining: number; complete: boolean; revision: number; results: { sourceId?: string; status: string }[] }>(`/api/qc/imports/${encodeURIComponent(importId)}`, { operation: "batch", expectedRevision: nextRevision });
      nextRevision = result.revision; imported += result.imported; existing += result.existing; failed += result.failed; pending += result.pending; remaining = result.remaining; complete = result.complete;
      setRevision(nextRevision);
      setImportedIds(current => new Set([...current, ...result.results.filter(row => row.status === "imported" && row.sourceId).map(row => row.sourceId!)]));
      setActiveSourceId(null);
      snapshot = await refreshTransfer(importId);
      setBatchInfo(`${imported} foto(s) importada(s), ${existing} já existente(s), ${failed} falha(s), ${pending} pendente(s); ${remaining} foto(s) ainda aguardam transferência.${matchingNote}`);
      if (failed || pending || complete) break;
    }
    if (!complete && !failed && !pending) setBatchInfo(`${imported} foto(s) importada(s), ${existing} já existente(s). Importação parcial: ${remaining} foto(s) ainda aguardam transferência.${matchingNote}`);
    setTransferComplete(complete);
    if (complete && !pendingMatching) setBatchInfo(`${imported} foto(s) importada(s), ${existing} já existente(s), ${failed} falha(s), ${pending} pendente(s). Importação concluída.${matchingNote}`);
    else if (complete && pendingMatching) setBatchInfo(`${imported} foto(s) importada(s), ${existing} já existente(s). Transferências concluídas; ${pendingMatching} ocorrência(s) ainda aguardam vínculo manual.`);
    invalidateSummary(purchaseId);
  }
  async function drainOccurrence(externalItemId: string) {
    let imported = 0, existing = 0, failed = 0, pending = 0, remaining = 0, complete = false;
    for (let call = 0; call < 12; call++) {
      const result = await qcRequest<{ imported: number; existing: number; failed: number; pending: number; remaining: number; complete: boolean }>(`/api/purchases/${encodeURIComponent(purchaseId)}/qc`, { operation: "batch", externalItemId });
      imported += result.imported; existing += result.existing; failed += result.failed; pending += result.pending; remaining = result.remaining; complete = result.complete;
      setBatchInfo(`${imported} foto(s) importada(s), ${existing} já existente(s), ${failed} falha(s), ${pending} pendente(s); ${remaining} foto(s) ainda aguardam transferência.`);
      if (failed || pending || complete) break;
    }
    if (!complete && !failed && !pending) setBatchInfo(`${imported} foto(s) importada(s), ${existing} já existente(s). Ainda há ${remaining} foto(s) para transferir; continue a importação.`);
    if (complete && !pending) setBatchInfo(`${imported} foto(s) importada(s), ${existing} já existente(s), ${failed} falha(s), ${pending} pendente(s). Transferência concluída.`);
    invalidateSummary(purchaseId);
  }
  async function runBatch() {
    if (!prepared) return;
    setError(""); setBusy(true);
    try { await drainImport(prepared.importId, revision, pendingMatchingCount, pendingMatchingCount ? ` ${pendingMatchingCount} ocorrência(s) ainda aguardam vínculo manual.` : ""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "O lote QC falhou."); invalidateSummary(purchaseId); }
    finally { setBusy(false); setActiveSourceId(null); invalidateSummary(purchaseId); }
  }
  async function resolvePending(row: QcPendingMatch) {
    const targetKey = pendingSelections[row.externalItemId];
    if (!targetKey) return;
    setError(""); setBusy(true);
    try {
      const result = await qcRequest<{ externalItemId: string; targetKey: string; revision: number; pendingSources: number }>(`/api/purchases/${encodeURIComponent(purchaseId)}/qc`, { operation: "resolve", externalItemId: row.externalItemId, expectedRevision: row.revision, targetKey });
      setBatchInfo("Vínculo salvo. Iniciando a transferência das fotos desta ocorrência."); invalidateSummary(purchaseId);
      if (result.pendingSources > 0) await drainOccurrence(result.externalItemId);
      else setBatchInfo("Vínculo salvo. Esta ocorrência não tem fotos pendentes.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível resolver o vínculo."); }
    finally { setBusy(false); invalidateSummary(purchaseId); }
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
          <QcImportProgress photos={transfer?.photos ?? null} activeSourceId={activeSourceId} importedIds={importedIds} busy={busy} complete={transferComplete} error={error} total={prepared.rows.reduce((count, row) => count + (selections[row.externalKey] ? row.photoCount : 0), 0)} renderPreview={photo => <QcPreviewImage image={{ id: photo.imageId!, previewUrl: photo.previewUrl, width: null, height: null, occurrence: photo.occurrence ?? "" }} userId={workspace.currentUser.id} purchaseId={purchaseId} alt=""/>}/>
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
type CostGallery = { images: QcImage[]; cover: QcImage | null };
const costGalleryPages = new WeakMap<QcSummary, Map<string, Promise<CostGallery>>>();

function previewBlob(userId: string, purchaseId: string, imageId: string, previewUrl: string | null) {
  if (!previewUrl) return undefined;
  const key = `${userId}:${purchaseId}:${imageId}:preview-v1`;
  let request = previewRequests.get(key);
  if (!request) {
    request = fetch(previewUrl, { credentials: "same-origin", cache: "no-store", referrerPolicy: "no-referrer" }).then(async response => {
      if (!response.ok) throw new Error("Preview indisponível");
      return response.blob();
    });
    previewRequests.set(key, request);
    void request.then(() => { if (previewRequests.get(key) === request) previewRequests.delete(key); }, () => { if (previewRequests.get(key) === request) previewRequests.delete(key); });
  }
  return request;
}

function QcPreviewImage({ image, userId, purchaseId, alt, onUnavailable }: { image: QcImage; userId: string; purchaseId: string; alt: string; onUnavailable?: () => void }) {
  const key = `${userId}:${purchaseId}:${image.id}:${image.previewUrl ?? "missing"}`;
  const [view, setView] = useState<{ key: string; src: string | null; failed: boolean }>({ key: "", src: null, failed: false });
  const current = view.key === key ? view : null;
  useEffect(() => {
    let active = true, objectUrl: string | null = null;
    if (!image.previewUrl) return;
    const request = previewBlob(userId, purchaseId, image.id, image.previewUrl);
    if (!request) return;
    void request.then(blob => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob); setView({ key, src: objectUrl, failed: false });
    }).catch(() => { if (active) { setView({ key, src: null, failed: true }); onUnavailable?.(); } });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [image.id, image.previewUrl, key, purchaseId, userId, onUnavailable]);
  if (!image.previewUrl || current?.failed) return <span className="qc-preview-placeholder" aria-label="Preview QC indisponível">Preview indisponível</span>;
  if (!current?.src) return <span className="qc-preview-placeholder" aria-label="Carregando preview QC">Carregando preview…</span>;
  // The authenticated API returns a private, bounded WebP. Keep it out of Next's image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={current.src} loading="lazy" referrerPolicy="no-referrer" alt={alt} onError={onUnavailable} />;
}

export function QcGalleryButton({ purchaseId, itemId, itemName, canManageHere = false, triggerLabel = "Ver QC", triggerAriaLabel, costThumbnails, costIdentity }: { purchaseId: string; itemId: string; itemName: string; canManageHere?: boolean; triggerLabel?: string; triggerAriaLabel?: string; costThumbnails?: "desktop" | "mobile"; costIdentity?: { marker: ReactNode; label: ReactNode } }) {
  const { data } = useWorkspace();
  const userId = data.currentUser.id;
  const [open, setOpen] = useState(false), [images, setImages] = useState<QcImage[]>([]), [loading, setLoading] = useState(false), [pageLoading, setPageLoading] = useState(false), [error, setError] = useState(""), [selectedImageId, setSelectedImageId] = useState<string | null>(null), [pageOffset, setPageOffset] = useState(0), [totalCount, setTotalCount] = useState(0), [primaryImageId, setPrimaryImageId] = useState<string | null>(null), [presentationRevision, setPresentationRevision] = useState(0), [canSetCover, setCanSetCover] = useState(false), [original, setOriginal] = useState<{ imageId: string | null; url: string; stage: "idle" | "loading" | "source" | "fallback-loading" | "fallback" | "failed" }>({ imageId: null, url: "", stage: "idle" }), [confirmDelete, setConfirmDelete] = useState<string | null>(null), [deleting, setDeleting] = useState(false), [savingCover, setSavingCover] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const { summary } = useQcSummary(purchaseId);
  const countValue = summary ? summary.counts.find(row => row.itemId === itemId)?.count ?? 0 : null;
  const [costPreview, setCostPreview] = useState<{ scope: string; summary: QcSummary } & CostGallery | null>(null);
  const [failedCover, setFailedCover] = useState<QcImage | null>(null);
  const previewScope = `${userId}:${purchaseId}:${itemId}`;
  const costImages = costPreview?.scope === previewScope && countValue ? costPreview.images : [];
  const costCover = costPreview?.scope === previewScope && countValue && costPreview.cover?.previewUrl && costPreview.cover !== failedCover ? costPreview.cover : null;
  const unavailableCover = useCallback(() => { setFailedCover(costCover); }, [costCover]);
  useEffect(() => {
    if (!costThumbnails || !summary || !countValue) return;
    let active = true;
    let pages = costGalleryPages.get(summary);
    if (!pages) { pages = new Map(); costGalleryPages.set(summary, pages); }
    let request = pages.get(previewScope);
    if (!request) {
      const url = `/api/purchases/${encodeURIComponent(purchaseId)}/qc?itemId=${encodeURIComponent(itemId)}`;
      request = qcRequest<GalleryPage>(url, undefined, "GET").then(async page => {
        let cover = page.images.find(image => image.id === page.primaryImageId) ?? null;
        if (page.primaryImageId && !cover) {
          const coverPage = await qcRequest<GalleryPage>(`${url}&imageId=${encodeURIComponent(page.primaryImageId)}`, undefined, "GET");
          cover = coverPage.images.find(image => image.id === page.primaryImageId) ?? null;
        }
        return { cover, images: page.images.filter(image => image.previewUrl && image.id !== page.primaryImageId).slice(0, 3) };
      });
      pages.set(previewScope, request);
    }
    void request.then(page => { if (active) setCostPreview({ scope: previewScope, summary, ...page }); }).catch(() => { pages.delete(previewScope); if (active) setCostPreview({ scope: previewScope, summary, cover: null, images: [] }); });
    return () => { active = false; };
  }, [costThumbnails, countValue, itemId, previewScope, purchaseId, summary]);
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
  const openGallery = (imageId?: string) => { setOpen(true); setSelectedImageId(null); invalidateSummary(purchaseId); void load(0, imageId); };
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
      setPrimaryImageId(result.primaryImageId); setPresentationRevision(result.revision); invalidateSummary(purchaseId);
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
    {costThumbnails ? <div className="cost-compact-identity">
      {costCover ? <button type="button" className={`qc-product-photo qc-product-cover${costThumbnails === "mobile" ? " qc-product-photo-count" : ""}`} data-qc-image-id={costCover.id} aria-label={`Abrir capa QC de ${itemName}${costThumbnails === "mobile" ? ` · ${countValue} fotos` : ""}`} onClick={() => openGallery(costCover.id)}><QcPreviewImage image={costCover} userId={userId} purchaseId={purchaseId} alt={`Capa QC de ${itemName}`} onUnavailable={unavailableCover}/>{costThumbnails === "mobile" && <span className="qc-product-photo-badge" aria-hidden="true">{countValue}</span>}</button> : costIdentity?.marker}
      {costIdentity?.label}
      {!!countValue && (costThumbnails !== "mobile" || !costCover) && <div className={`qc-product-photos qc-product-photos-${costThumbnails}`}>
      {costThumbnails === "mobile" ? <button type="button" className="qc-product-photo qc-product-photo-count" onClick={() => openGallery()} aria-label={`Ver ${countValue} fotos QC de ${itemName}`} title={`Ver ${countValue} fotos QC`}>
        {costImages[0] ? <QcPreviewImage image={costImages[0]} userId={userId} purchaseId={purchaseId} alt=""/> : <ImagePlus size={20} aria-hidden="true"/>}<span className="qc-product-photo-badge" aria-hidden="true">{countValue}</span>
      </button> : <>
        {costImages.map((image, index) => <button type="button" className="qc-product-photo" key={image.id} data-qc-image-id={image.id} aria-label={`Abrir foto QC ${index + 1} de ${itemName}`} onClick={() => openGallery(image.id)}><QcPreviewImage image={image} userId={userId} purchaseId={purchaseId} alt=""/></button>)}
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
        <div className="qc-viewer-thumbnails" aria-label="Navegação por previews">{images.map((image, index) => <button type="button" className={`qc-viewer-thumb${selectedImage.id === image.id ? " is-selected" : ""}`} key={image.id} aria-label={`Selecionar foto ${pageOffset + index + 1}`} aria-current={selectedImage.id === image.id ? "true" : undefined} onClick={() => setSelectedImageId(image.id)}><QcPreviewImage image={image} userId={userId} purchaseId={purchaseId} alt="" /></button>)}</div>
        <div className="qc-viewer-actions">
          {canManageHere && manage && canSetCover && <Button type="button" variant="ghost" size="sm" disabled={savingCover || primaryImageId === selectedImage.id} onClick={() => void saveCover()}><Star size={16} fill={primaryImageId === selectedImage.id ? "currentColor" : "none"}/>{savingCover ? "Salvando capa…" : primaryImageId === selectedImage.id ? "Capa atual" : "Usar como capa QC"}</Button>}
          {canManageHere && manage && <Button type="button" variant="ghost" size="sm" className="qc-viewer-delete" disabled={deleting} onClick={() => setConfirmDelete(selectedImage.id)}><Trash2 size={15}/>Excluir foto QC</Button>}
        </div>
      </div>}
    </Surface>
    <Confirm open={!!confirmDelete} onOpenChange={value => { if (!deleting && !value) setConfirmDelete(null); }} title="Excluir foto QC?" description="Ela sai imediatamente da galeria. A capa será atualizada para outra foto disponível, ou ficará vazia. A remoção física do original e do preview privado pode exigir nova tentativa. Depois que terminar, uma nova análise e confirmação do JSON pode importar novamente as fotos incluídas. A CDN original do HubBuy permanece fora do controle do Loti." danger label="Excluir foto" busy={deleting} onConfirm={() => confirmDelete && void remove(confirmDelete)} />
  </>;
}
