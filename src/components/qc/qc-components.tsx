"use client";

import { useEffect, useState } from "react";
import { ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm, Surface } from "@/components/ui/surface";

type QcImage = { id: string; sourceUrl: string; width: number | null; height: number | null; occurrence: string };
type QcSummary = { canManage: boolean; counts: { itemId: string; count: number }[]; pending?: number; pendingDeletes?: number };
type QcPreview = { externalKey: string; orderNo: string | null; orderGoodsId: string | null; orderGoodsNo: string | null; offerId: string | null; skuInfo: string | null; title: string | null; quantity: number | null; photoCount: number; match: { status: string; targetItemId: string | null; candidates: { itemId: string; name: string; reasons: string[] }[] }; existingItemId: string | null; conflict: string | null };
type QcPrepared = { importId: string; revision: number; partial: boolean; orderCount: number; photoCount: number; rows: QcPreview[] };
type QcTarget = { id: string; name: string; variant: string | null; quantity: number };

const summaryCache = new Map<string, Promise<QcSummary>>();
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
function invalidateSummary(purchaseId: string) { summaryCache.delete(purchaseId); }
async function qcRequest<T>(url: string, body?: unknown, method = "POST") {
  const response = await fetch(url, { method, credentials: "same-origin", cache: "no-store", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Não foi possível concluir a operação QC.");
  return result.data as T;
}

export function QcImportPanel({ purchaseId, targets }: { purchaseId: string; targets: QcTarget[] }) {
  const [summary, setSummary] = useState<QcSummary | null>(null), [open, setOpen] = useState(false), [raw, setRaw] = useState(""), [prepared, setPrepared] = useState<QcPrepared | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [error, setError] = useState(""), [confirmed, setConfirmed] = useState(false), [revision, setRevision] = useState(0), [batchInfo, setBatchInfo] = useState("");
  const [confirmCorrections, setConfirmCorrections] = useState(false), [confirmReconcile, setConfirmReconcile] = useState(false);
  useEffect(() => { let active = true; void summaryFor(purchaseId).then(value => { if (active) setSummary(value); }).catch(() => {}); return () => { active = false; }; }, [purchaseId]);
  if (!summary?.canManage) return null;

  async function prepare() {
    setError(""); setBusy(true);
    try {
      if (new TextEncoder().encode(raw).byteLength > 1024 * 1024) throw new Error("O JSON excede 1 MiB.");
      const data = JSON.parse(raw);
      const result = await qcRequest<QcPrepared>(`/api/purchases/${encodeURIComponent(purchaseId)}/qc`, { operation: "prepare", data });
      setPrepared(result); setConfirmed(false); setSelections(Object.fromEntries(result.rows.map(row => [row.externalKey, row.match.targetItemId ?? ""])));
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
      const result = await qcRequest<{ revision: number; linked: number; ignored: number; sources: number }>(`/api/qc/imports/${encodeURIComponent(prepared.importId)}`, { operation: "confirm", expectedRevision: prepared.revision, choices });
      setRevision(result.revision); setConfirmed(true); setBatchInfo(`${result.linked} associada(s), ${result.ignored} ignorada(s), ${result.sources} fonte(s) de foto.`); invalidateSummary(purchaseId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível confirmar os vínculos."); }
    finally { setBusy(false); }
  }
  async function runBatch() {
    if (!prepared) return;
    setError(""); setBusy(true);
    try {
      const result = await qcRequest<{ processed: number; imported: number; existing: number; failed: number; pending: number; partial: boolean; revision: number }>(`/api/qc/imports/${encodeURIComponent(prepared.importId)}`, { operation: "batch", expectedRevision: revision });
      setRevision(result.revision); setBatchInfo(`${result.imported} enviada(s), ${result.existing} já existente(s), ${result.failed} falha(s), ${result.pending} pendente(s) neste lote.`); invalidateSummary(purchaseId);
      const next = await summaryFor(purchaseId); setSummary(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "O lote QC falhou."); }
    finally { setBusy(false); }
  }
  async function reconcile() {
    setError(""); setBusy(true);
    try {
      const result = await qcRequest<{ processed: number; partial: boolean }>(`/api/purchases/${encodeURIComponent(purchaseId)}/qc`, { operation: "reconcile" });
      setBatchInfo(`${result.processed} pendência(s) reconciliada(s).`); invalidateSummary(purchaseId); setSummary(await summaryFor(purchaseId));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível reconciliar QC."); }
    finally { setBusy(false); setConfirmReconcile(false); }
  }
  const hasCorrections = !!prepared?.rows.some(row => row.existingItemId && row.existingItemId !== (selections[row.externalKey] || null));
  const openPanel = () => { setOpen(true); setPrepared(null); setConfirmed(false); setError(""); setBatchInfo(""); };
  return <>
    <div className="qc-manager-actions"><Button variant="outline" size="sm" onClick={openPanel}><ImagePlus size={15}/>Importar QC</Button><Button variant="ghost" size="sm" onClick={() => setConfirmReconcile(true)}><RefreshCw size={15}/>Verificar pendências QC{((summary.pending ?? 0) + (summary.pendingDeletes ?? 0) > 0) ? ` (${(summary.pending ?? 0) + (summary.pendingDeletes ?? 0)})` : ""}</Button></div>
    <Surface open={open} onOpenChange={value => { if (!busy) setOpen(value); }} title="Importar QC do HubBuy" description="Cole uma resposta HubBuy. Somente freePhotos são processadas; os vínculos serão confirmados antes de qualquer transferência." sheet>
      {!prepared && <>
        <label className="qc-import-label">JSON HubBuy<textarea aria-label="JSON HubBuy" value={raw} onChange={event => setRaw(event.target.value)} rows={10} spellCheck={false} placeholder="Cole o JSON exportado do HubBuy" /></label>
        <div className="qc-panel-actions"><span className="muted">Limite: 1 MiB</span><Button disabled={busy || !raw.trim()} onClick={() => void prepare()}>{busy ? "Analisando…" : "Analisar JSON"}</Button></div>
      </>}
      {prepared && !confirmed && <>
        <p className="muted">{prepared.orderCount} pedido(s), {prepared.rows.length} ocorrência(s), {prepared.photoCount} foto(s). {prepared.partial ? "O HubBuy indica mais pedidos; esta prévia cobre apenas o JSON colado." : ""}</p>
        <div className="qc-preview-list">{prepared.rows.map(row => <label className="qc-preview-row" key={row.externalKey}>
          <span><strong>{row.title || row.skuInfo || row.orderGoodsId || row.orderGoodsNo}</strong><small>{row.skuInfo || "Sem variação"} · {row.photoCount} foto(s) · {row.conflict || row.match.candidates[0]?.reasons.join(" · ") || (row.match.status === "linked" ? "Correspondência inequívoca" : "Seleção manual")}</small></span>
          <select aria-label={`Associar ${row.title || row.skuInfo || row.externalKey}`} value={selections[row.externalKey] ?? ""} onChange={event => setSelections(current => ({ ...current, [row.externalKey]: event.target.value }))}>
            <option value="">Ignorar / revisar depois</option>
            {targets.map(target => <option key={target.id} value={target.id}>{target.name}{target.variant ? ` · ${target.variant}` : ""}</option>)}
          </select>
        </label>)}</div>
        <div className="qc-panel-actions"><Button variant="outline" disabled={busy} onClick={() => setPrepared(null)}>Voltar</Button><Button disabled={busy} onClick={() => hasCorrections ? setConfirmCorrections(true) : void confirmLinks()}>{busy ? "Salvando…" : "Confirmar vínculos"}</Button></div>
      </>}
      {prepared && confirmed && <>
        <p className="qc-status-note" role="status">{batchInfo || "Vínculos confirmados. Fotos ainda não foram transferidas."}</p>
        <p className="muted">O servidor processa até duas fotos por chamada para caber no prazo da transferência. Falhas ficam disponíveis para nova tentativa.</p>
        <div className="qc-panel-actions"><Button variant="outline" onClick={() => { setPrepared(null); setConfirmed(false); }}>Nova importação</Button><Button disabled={busy} onClick={() => void runBatch()}>{busy ? "Processando…" : "Processar próximo lote"}</Button></div>
      </>}
      {error && <p className="error" role="alert">{error}</p>}
    </Surface>
    <Confirm open={confirmCorrections} onOpenChange={setConfirmCorrections} title="Confirmar correção de vínculo?" description="As fotos continuarão ligadas à ocorrência HubBuy e não serão movidas no R2. Esta ação altera apenas o produto Loti associado." label="Confirmar correções" busy={busy} onConfirm={() => { setConfirmCorrections(false); void confirmLinks(); }} />
    <Confirm open={confirmReconcile} onOpenChange={setConfirmReconcile} title="Reconciliar QC pendente?" description="O servidor tentará novamente somente uploads e exclusões já conhecidos para esta compra. Nenhuma URL nova será recebida." label="Reconciliar pendências" busy={busy} onConfirm={() => void reconcile()} />
  </>;
}

export function QcGalleryButton({ purchaseId, itemId, itemName, canManageHere = false }: { purchaseId: string; itemId: string; itemName: string; canManageHere?: boolean }) {
  const [open, setOpen] = useState(false), [images, setImages] = useState<QcImage[]>([]), [manage, setManage] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(""), [broken, setBroken] = useState<Record<string, "source" | "fallback" | "failed">>({}), [confirmDelete, setConfirmDelete] = useState<string | null>(null), [deleting, setDeleting] = useState(false), [count, setCount] = useState<number | null>(null), [nextOffset, setNextOffset] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { let active = true; void summaryFor(purchaseId).then(value => { if (active) { setCount(value.counts.find(row => row.itemId === itemId)?.count ?? 0); setManage(value.canManage); } }).catch(() => { if (active) setCount(null); }); return () => { active = false; }; }, [itemId, purchaseId, refresh]);
  async function load(offset = 0) {
    setLoading(true); setError(""); setBroken({});
    try {
      const data = await qcRequest<{ images: QcImage[]; nextOffset: number | null }>(`/api/purchases/${encodeURIComponent(purchaseId)}/qc?itemId=${encodeURIComponent(itemId)}&offset=${offset}`, undefined, "GET");
      setImages(current => offset === 0 ? data.images : [...current, ...data.images]); setNextOffset(data.nextOffset);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar a galeria QC."); }
    finally { setLoading(false); }
  }
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
      await load(0); invalidateSummary(purchaseId); setRefresh(value => value + 1);
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
