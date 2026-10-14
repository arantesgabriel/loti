"use client";

import { useCallback, useEffect, useState } from "react";
import { ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm, Surface } from "@/components/ui/surface";

type QcImage = { id: string; sourceUrl: string; width: number | null; height: number | null; occurrence: string };
type QcPendingMatch = { externalItemId: string; revision: number; orderNo: string | null; orderGoodsId: string | null; orderGoodsNo: string | null; skuInfo: string | null; title: string | null; quantity: number | null; photoCount: number; candidates: { itemId: string; name: string; reasons: string[] }[] };
type QcSummary = { canManage: boolean; counts: { itemId: string; count: number }[]; pendingMatching?: number; pendingRows?: QcPendingMatch[]; pendingTransfers?: number; pendingDeletes?: number };
type QcPreview = { externalKey: string; orderNo: string | null; orderGoodsId: string | null; orderGoodsNo: string | null; offerId: string | null; skuInfo: string | null; title: string | null; quantity: number | null; photoCount: number; match: { status: string; targetItemId: string | null; candidates: { itemId: string; name: string; reasons: string[] }[] }; existingItemId: string | null; conflict: string | null };
type QcPrepared = { importId: string; revision: number; partial: boolean; orderCount: number; photoCount: number; rows: QcPreview[] };
type QcTarget = { id: string; name: string; variant: string | null; quantity: number };

const summaryCache = new Map<string, Promise<QcSummary>>();
const summaryListeners = new Map<string, Set<() => void>>();
function subscribeSummary(purchaseId: string, listener: () => void) {
  const listeners = summaryListeners.get(purchaseId) ?? new Set<() => void>();
  listeners.add(listener); summaryListeners.set(purchaseId, listeners);
  return () => { listeners.delete(listener); if (!listeners.size) summaryListeners.delete(purchaseId); };
}
function summaryFor(purchaseId: string) {
  let cached = summaryCache.get(purchaseId);
  if (!cached) {
    cached = fetch(`/api/purchases/${encodeURIComponent(purchaseId)}/qc`, { cache: "no-store", credentials: "same-origin" }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar o QC.");
      return body.data as QcSummary;
    });
    summaryCache.set(purchaseId, cached);
    void cached.catch(() => { summaryCache.delete(purchaseId); });
  }
  return cached;
}
function invalidateSummary(purchaseId: string) {
  summaryCache.delete(purchaseId);
  for (const listener of summaryListeners.get(purchaseId) ?? []) listener();
}
function useQcSummary(purchaseId: string) {
  const [summary, setSummary] = useState<QcSummary | null>(null), [version, setVersion] = useState(0);
  useEffect(() => subscribeSummary(purchaseId, () => setVersion(current => current + 1)), [purchaseId]);
  useEffect(() => {
    let active = true;
    void summaryFor(purchaseId).then(value => { if (active) setSummary(value); }).catch(() => { if (active) setSummary(null); });
    return () => { active = false; };
  }, [purchaseId, version]);
  return { summary };
}
async function qcRequest<T>(url: string, body?: unknown, method = "POST") {
  const response = await fetch(url, { method, credentials: "same-origin", cache: "no-store", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Não foi possível concluir a operação QC.");
  return result.data as T;
}

export function QcImportPanel({ purchaseId, targets }: { purchaseId: string; targets: QcTarget[] }) {
  const { summary } = useQcSummary(purchaseId);
  const [open, setOpen] = useState(false), [matchingOpen, setMatchingOpen] = useState(false), [raw, setRaw] = useState(""), [prepared, setPrepared] = useState<QcPrepared | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [error, setError] = useState(""), [confirmed, setConfirmed] = useState(false), [transferComplete, setTransferComplete] = useState(false), [revision, setRevision] = useState(0), [pendingMatchingCount, setPendingMatchingCount] = useState(0), [batchInfo, setBatchInfo] = useState("");
  const [pendingSelections, setPendingSelections] = useState<Record<string, string>>({}), [confirmCorrections, setConfirmCorrections] = useState(false), [confirmReconcile, setConfirmReconcile] = useState(false);
  if (!summary?.canManage) return null;

  async function prepare() {
    setError(""); setBusy(true);
    try {
      if (new TextEncoder().encode(raw).byteLength > 1024 * 1024) throw new Error("O JSON excede 1 MiB.");
      const data = JSON.parse(raw);
      const result = await qcRequest<QcPrepared>(`/api/purchases/${encodeURIComponent(purchaseId)}/qc`, { operation: "prepare", data });
      setPrepared(result); setConfirmed(false); setTransferComplete(false); setSelections(Object.fromEntries(result.rows.map(row => [row.externalKey, row.match.targetItemId ?? ""])));
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
        return { externalKey: row.externalKey, purchaseItemId: targetId, ...(correction ? { correctExisting: true, expectedItemId: row.existingItemId } : {}) };
      });
      const result = await qcRequest<{ revision: number; linked: number; ignored: number; pendingMatching: number; sources: number; eligibleSources: number }>(`/api/qc/imports/${encodeURIComponent(prepared.importId)}`, { operation: "confirm", expectedRevision: prepared.revision, choices });
      setRevision(result.revision); setConfirmed(true); setPendingMatchingCount(result.pendingMatching); invalidateSummary(purchaseId);
      const matchingNote = result.pendingMatching ? ` ${result.pendingMatching} ocorrência(s) aguardam vínculo manual.` : "";
      if (result.eligibleSources > 0) { setBatchInfo("Importando as fotos associadas…"); await drainImport(prepared.importId, result.revision, result.pendingMatching, matchingNote); }
      else { setTransferComplete(true); setBatchInfo(`${result.linked} ocorrência(s) associada(s), ${result.ignored} ignorada(s), ${result.sources} foto(s) registrada(s).${matchingNote}`); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível confirmar os vínculos."); }
    finally { setBusy(false); invalidateSummary(purchaseId); }
  }
  async function drainImport(importId: string, initialRevision: number, pendingMatching = 0, matchingNote = "") {
    let nextRevision = initialRevision, imported = 0, existing = 0, failed = 0, pending = 0, remaining = 0, complete = false;
    for (let call = 0; call < 12; call++) {
      const result = await qcRequest<{ processed: number; imported: number; existing: number; failed: number; pending: number; remaining: number; complete: boolean; revision: number }>(`/api/qc/imports/${encodeURIComponent(importId)}`, { operation: "batch", expectedRevision: nextRevision });
      nextRevision = result.revision; imported += result.imported; existing += result.existing; failed += result.failed; pending += result.pending; remaining = result.remaining; complete = result.complete;
      setRevision(nextRevision);
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
    finally { setBusy(false); invalidateSummary(purchaseId); }
  }
  async function resolvePending(row: QcPendingMatch) {
    const purchaseItemId = pendingSelections[row.externalItemId];
    if (!purchaseItemId) return;
    setError(""); setBusy(true);
    try {
      const result = await qcRequest<{ externalItemId: string; revision: number; pendingSources: number }>(`/api/purchases/${encodeURIComponent(purchaseId)}/qc`, { operation: "resolve", externalItemId: row.externalItemId, expectedRevision: row.revision, purchaseItemId });
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
  const openPanel = () => { setOpen(true); setPrepared(null); setConfirmed(false); setTransferComplete(false); setError(""); setBatchInfo(""); };
  return <>
    <div className="qc-manager-actions"><Button variant="outline" size="sm" onClick={openPanel}><ImagePlus size={15}/>Importar QC</Button><Button variant="ghost" size="sm" onClick={() => setMatchingOpen(true)}>Verificar vínculos pendentes{(summary.pendingMatching ?? 0) ? ` (${summary.pendingMatching})` : ""}</Button><Button variant="ghost" size="sm" onClick={() => setConfirmReconcile(true)}><RefreshCw size={15}/>Repetir pendências QC{((summary.pendingTransfers ?? 0) + (summary.pendingDeletes ?? 0) > 0) ? ` (${(summary.pendingTransfers ?? 0) + (summary.pendingDeletes ?? 0)})` : ""}</Button></div>
    <Surface open={open} onOpenChange={value => { if (!busy) setOpen(value); }} title="Importar QC do HubBuy" description="Cole uma resposta HubBuy. Somente freePhotos são processadas; os vínculos serão confirmados antes de qualquer transferência." sheet>
      {!prepared && <>
        <label className="qc-import-label">JSON HubBuy<textarea aria-label="JSON HubBuy" value={raw} onChange={event => setRaw(event.target.value)} rows={10} spellCheck={false} placeholder="Cole o JSON exportado do HubBuy" /></label>
        <div className="qc-panel-actions"><span className="muted">Limite: 1 MiB</span><Button disabled={busy || !raw.trim()} onClick={() => void prepare()}>{busy ? "Analisando…" : "Analisar JSON"}</Button></div>
      </>}
      {prepared && !confirmed && <>
        <p className="muted">{prepared.orderCount} pedido(s), {prepared.rows.length} ocorrência(s), {prepared.photoCount} foto(s). {prepared.partial ? "O HubBuy indica mais pedidos; esta prévia cobre apenas o JSON colado." : ""}</p>
        <div className="qc-preview-list">{prepared.rows.map(row => <label className="qc-preview-row" key={row.externalKey}>
          <span><strong>{row.title || row.skuInfo || row.orderGoodsId || row.orderGoodsNo}</strong><small>{row.skuInfo || "Sem variação"} · {row.photoCount} foto(s) · {row.conflict || row.match.candidates[0]?.reasons.join(" · ") || (row.match.status === "MATCHED" ? "Correspondência inequívoca" : row.match.status === "PENDING" ? "Selecione uma correspondência" : "Sem candidato seguro; será ignorada")}</small></span>
          {row.match.status !== "IGNORED" || row.conflict ? <select aria-label={`Associar ${row.title || row.skuInfo || row.externalKey}`} value={selections[row.externalKey] ?? ""} onChange={event => setSelections(current => ({ ...current, [row.externalKey]: event.target.value }))}>
            <option value="">{row.match.status === "PENDING" ? "Manter pendente" : row.conflict ? "Descartar ocorrência conflitante" : "Ignorar ocorrência"}</option>
            {(row.match.status === "PENDING" ? row.match.candidates.map(candidate => targets.find(target => target.id === candidate.itemId)).filter((target): target is QcTarget => !!target) : row.conflict ? [] : targets).map(target => <option key={target.id} value={target.id}>{target.name}{target.variant ? ` · ${target.variant}` : ""}</option>)}
          </select> : <small className="muted">Ignorada</small>}
        </label>)}</div>
        <div className="qc-panel-actions"><Button variant="outline" disabled={busy} onClick={() => setPrepared(null)}>Voltar</Button><Button disabled={busy} onClick={() => hasCorrections ? setConfirmCorrections(true) : void confirmLinks()}>{busy ? "Salvando…" : "Confirmar vínculos"}</Button></div>
      </>}
      {prepared && confirmed && <>
        <p className="qc-status-note" role="status">{batchInfo || "Vínculos confirmados. Fotos ainda não foram transferidas."}</p>
        <p className="muted">As fotos serão transferidas em sequência. Se houver falhas, você poderá tentar novamente.</p>
        <div className="qc-panel-actions"><Button variant="outline" onClick={() => { setPrepared(null); setConfirmed(false); setTransferComplete(false); }}>Nova importação</Button><Button disabled={busy || transferComplete} onClick={() => void runBatch()}>{busy ? "Processando…" : transferComplete ? "Transferências concluídas" : "Continuar / tentar novamente"}</Button></div>
      </>}
      {error && <p className="error" role="alert">{error}</p>}
    </Surface>
    <Surface open={matchingOpen} onOpenChange={value => { if (!busy) setMatchingOpen(value); }} title="Vínculos QC pendentes" description="Revise cada ocorrência ambígua e escolha um dos produtos candidatos. Só depois de salvar o vínculo as fotos dessa ocorrência começam a ser transferidas." sheet>
      {!summary.pendingRows?.length && <p className="muted">Nenhuma ocorrência com candidatos aguarda vínculo.</p>}
      {!!summary.pendingRows?.length && <div className="qc-preview-list">{summary.pendingRows.map(row => <div className="qc-preview-row" key={row.externalItemId}>
        <span><strong>{row.title || row.skuInfo || row.orderGoodsId || row.orderGoodsNo || row.externalItemId}</strong><small>{row.skuInfo || "Sem variação"} · {row.photoCount} foto(s) aguardando vínculo{row.quantity === null ? "" : ` · quantidade HubBuy ${row.quantity}`}</small></span>
        <div className="qc-pending-match-controls"><select aria-label={`Produto Loti para ${row.title || row.skuInfo || row.externalItemId}`} value={pendingSelections[row.externalItemId] ?? ""} onChange={event => setPendingSelections(current => ({ ...current, [row.externalItemId]: event.target.value }))}>
          <option value="">Selecione um candidato</option>
          {row.candidates.map(candidate => <option key={candidate.itemId} value={candidate.itemId}>{candidate.name} · {candidate.reasons.join(" · ")}</option>)}
        </select><Button disabled={busy || !pendingSelections[row.externalItemId]} onClick={() => void resolvePending(row)}>{busy ? "Salvando…" : "Associar e processar fotos"}</Button></div>
      </div>)}</div>}
      {batchInfo && <p className="qc-status-note" role="status">{batchInfo}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </Surface>
    <Confirm open={confirmCorrections} onOpenChange={setConfirmCorrections} title="Confirmar correção de vínculo?" description="As fotos continuarão ligadas à ocorrência HubBuy e não serão movidas no R2. Esta ação altera apenas o produto Loti associado." label="Confirmar correções" busy={busy} onConfirm={() => { setConfirmCorrections(false); void confirmLinks(); }} />
    <Confirm open={confirmReconcile} onOpenChange={setConfirmReconcile} title="Tentar transferências ou remoções novamente?" description="O Loti tentará novamente as transferências e remoções pendentes. Essa ação não altera vínculos de ocorrências." label="Tentar novamente" busy={busy} onConfirm={() => void reconcile()} />
  </>;
}

export function QcGalleryButton({ purchaseId, itemId, itemName, canManageHere = false }: { purchaseId: string; itemId: string; itemName: string; canManageHere?: boolean }) {
  const [open, setOpen] = useState(false), [images, setImages] = useState<QcImage[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState(""), [broken, setBroken] = useState<Record<string, "source" | "fallback" | "failed">>({}), [confirmDelete, setConfirmDelete] = useState<string | null>(null), [deleting, setDeleting] = useState(false), [nextOffset, setNextOffset] = useState<number | null>(null);
  const { summary } = useQcSummary(purchaseId);
  const count = summary ? summary.counts.find(row => row.itemId === itemId)?.count ?? 0 : null;
  const manage = !!summary?.canManage;
  const load = useCallback(async (offset = 0) => {
    setLoading(true); setError(""); setBroken({});
    try {
      const data = await qcRequest<{ images: QcImage[]; nextOffset: number | null }>(`/api/purchases/${encodeURIComponent(purchaseId)}/qc?itemId=${encodeURIComponent(itemId)}&offset=${offset}`, undefined, "GET");
      setImages(current => offset === 0 ? data.images : [...current, ...data.images]); setNextOffset(data.nextOffset);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar a galeria QC."); }
    finally { setLoading(false); }
  }, [itemId, purchaseId]);
  useEffect(() => subscribeSummary(purchaseId, () => { if (open) void load(0); }), [load, open, purchaseId]);
  function openGallery() { setOpen(true); void load(0); }
  async function requestFallback(imageId: string) {
    setBroken(current => ({ ...current, [imageId]: "fallback" }));
    try {
      const result = await qcRequest<{ url: string }>(`/api/qc/images/${encodeURIComponent(imageId)}/fallback`);
      const imageElement = document.querySelector<HTMLImageElement>(`img[data-qc-image="${CSS.escape(imageId)}"]`);
      if (imageElement) imageElement.src = result.url;
    } catch { setBroken(current => ({ ...current, [imageId]: "failed" })); }
  }
  async function remove(imageId: string) {
    setDeleting(true); setError("");
    try {
      const result = await qcRequest<{ status: string; message?: string }>(`/api/qc/images/${encodeURIComponent(imageId)}`, undefined, "DELETE");
      if (result.status === "pending") setError(result.message ?? "O backup aguarda remoção física.");
      await load(0); invalidateSummary(purchaseId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível excluir a foto."); }
    finally { setDeleting(false); setConfirmDelete(null); }
  }
  return <>
    <Button type="button" variant="ghost" size="sm" onClick={openGallery} aria-label={`Ver QC de ${itemName}`}>Ver QC{count === null ? "" : ` (${count})`}</Button>
    <Surface open={open} onOpenChange={value => setOpen(value)} title={`QC · ${itemName}`} description="Fotos de controle de qualidade por ocorrência comprada; não representam a divisão de unidades de um pacote." sheet>
      {loading && <p className="muted">Carregando fotos…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {!loading && !error && !images.length && <p className="muted">Nenhuma foto QC disponível para este produto.</p>}
      {!!images.length && <div className="qc-gallery">{images.map((image, index) => <figure className="qc-gallery-card" key={image.id}>
        {broken[image.id] === "failed" && <div className="qc-image-unavailable" role="status"><span>Foto indisponível</span><Button variant="outline" size="sm" onClick={() => void requestFallback(image.id)}>Renovar backup</Button></div>}
        {/* The browser fetches only the validated HubBuy source or authorized R2 URL; Next's optimizer must not proxy this URL. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img data-qc-image={image.id} style={broken[image.id] === "failed" ? { display: "none" } : undefined} src={image.sourceUrl} loading="lazy" referrerPolicy="no-referrer" alt={`${itemName}, foto QC ${index + 1}${image.occurrence ? `, ${image.occurrence}` : ""}`} onLoad={() => setBroken(current => { if (!current[image.id]) return current; const next = { ...current }; delete next[image.id]; return next; })} onError={() => { if (!broken[image.id] || broken[image.id] === "source") void requestFallback(image.id); else setBroken(current => ({ ...current, [image.id]: "failed" })); }} />
        <figcaption>{image.occurrence || `Foto ${index + 1}`}</figcaption>
        {canManageHere && manage && <Button className="qc-delete-button" variant="destructive" size="sm" onClick={() => setConfirmDelete(image.id)}><Trash2 size={14}/>Excluir</Button>}
      </figure>)}</div>}
      {nextOffset !== null && <Button variant="outline" disabled={loading} onClick={() => void load(nextOffset)}>Carregar mais fotos</Button>}
    </Surface>
    <Confirm open={!!confirmDelete} onOpenChange={value => { if (!deleting && !value) setConfirmDelete(null); }} title="Excluir foto QC?" description="Ela sairá imediatamente do Loti. O backup privado será removido ou ficará pendente de nova tentativa; o tombstone impede que a foto volte. A CDN original do HubBuy permanece fora do controle do Loti." danger label="Excluir foto" busy={deleting} onConfirm={() => confirmDelete && void remove(confirmDelete)} />
  </>;
}
