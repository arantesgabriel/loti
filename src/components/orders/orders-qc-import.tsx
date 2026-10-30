"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { costRequest } from "@/components/packages/package-cost-client";
import { invalidateQcPurchase } from "@/components/qc/qc-components";
import type { QcTransferSnapshot } from "@/components/qc/qc-import-progress";
import type { ordersQcImport } from "@/lib/domain/orders-qc-import";
import { OrdersIconButton } from "./orders-workspace";
import { OrdersContextSurface } from "./orders-context-surface";
import "./orders-actions.css";

type Preview = Awaited<ReturnType<ReturnType<typeof ordersQcImport>["preview"]>>;
type Prepared = Awaited<ReturnType<ReturnType<typeof ordersQcImport>["prepare"]>>["groups"][number];
type Group = Omit<Prepared, "error"> & { error: string | null; complete?: boolean; ready?: number; total?: number };
const endpoint = "/api/warehouse/qc-import";
async function request<T>(url: string, body?: Record<string, unknown>) {
  const result = await costRequest<T>(url, body);
  if (!result.ok || !result.data) throw new Error(result.error ?? "Não foi possível confirmar a resposta. Retome a operação.");
  return result.data;
}

export function OrdersQcImport({ onChanged }: { onChanged: () => void }) {
  const [allowed, setAllowed] = useState(false), [open, setOpen] = useState(false), [raw, setRaw] = useState("");
  const [fileName, setFileName] = useState("JSON colado"), [preview, setPreview] = useState<Preview | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({}), [groups, setGroups] = useState<Group[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const active = useRef(false), mounted = useRef(true);
  const groupsRef = useRef<Group[]>([]);
  useEffect(() => { mounted.current = true; void costRequest<{ canManage: boolean }>(endpoint).then(result => { if (mounted.current) setAllowed(!!result.data?.canManage); }); return () => { mounted.current = false; }; }, []);
  function updateGroups(next: Group[]) { groupsRef.current = next; if (mounted.current) setGroups([...next]); }
  async function readFile(file: File) {
    setError("");
    if (!/\.json$/i.test(file.name)) { setError("Selecione um arquivo .json."); return; }
    if (file.size > 1024 * 1024) { setError("O JSON excede 1 MiB."); return; }
    try { const text = await file.text(); setRaw(text); setFileName(file.name); setPreview(null); updateGroups([]); }
    catch { setError("Não foi possível ler o arquivo."); }
  }
  async function analyze() {
    if (active.current) return; active.current = true; setBusy(true); setError("");
    try {
      if (new TextEncoder().encode(raw).byteLength > 1024 * 1024) throw new Error("O JSON excede 1 MiB.");
      const data = await request<Preview>(endpoint, { operation: "preview", data: JSON.parse(raw) });
      if (!mounted.current) return;
      setPreview(data); setChoices(Object.fromEntries(data.rows.map(row => [row.externalKey, row.targetKey ?? ""]))); updateGroups([]);
    } catch (cause) { if (mounted.current) setError(cause instanceof SyntaxError ? "O arquivo precisa conter um JSON válido." : cause instanceof Error ? cause.message : "Confira o JSON."); }
    finally { active.current = false; if (mounted.current) setBusy(false); }
  }
  async function importPhotos() {
    if (active.current || !preview) return; active.current = true; setBusy(true); setError("");
    try {
      let work = [...groupsRef.current];
      if (!work.length || work.some(group => !group.importId)) {
        const retryKeys = work.length ? new Set(work.filter(group => !group.importId).flatMap(group => group.choices.map(choice => choice.externalKey))) : null;
        const selected = preview.rows.filter(row => !retryKeys || retryKeys.has(row.externalKey)).map(row => ({ externalKey: row.externalKey, targetKey: choices[row.externalKey] || null }));
        const prepared = await request<{ groups: Prepared[] }>(endpoint, { operation: "prepare", data: JSON.parse(raw), choices: selected });
        work = [...work.filter(group => !!group.importId), ...prepared.groups]; updateGroups(work);
      }
      for (const group of work) {
        if (!mounted.current) break;
        if (!group.importId || group.complete) continue;
        group.error = null; updateGroups(work);
        try {
          const url = `/api/qc/imports/${encodeURIComponent(group.importId)}`;
          let snapshot = await request<QcTransferSnapshot>(url);
          if (snapshot.status === "prepared") {
            try { await request(url, { operation: "confirm", expectedRevision: snapshot.revision, choices: group.choices }); }
            catch (cause) {
              // A lost response may already have confirmed the original manifest.
              snapshot = await request<QcTransferSnapshot>(url);
              if (snapshot.status !== "confirmed") throw cause;
            }
            snapshot = await request<QcTransferSnapshot>(url);
          }
          if (snapshot.status !== "confirmed") throw new Error("A prévia expirou. Analise o JSON novamente; fotos concluídas serão preservadas.");
          for (let batch = 0; batch < 40 && mounted.current; batch++) {
            group.ready = snapshot.photos.filter(photo => photo.state === "ready").length;
            group.total = snapshot.photos.length; updateGroups(work);
            if (!snapshot.nextSourceId) { group.complete = snapshot.photos.length > 0 && snapshot.photos.every(photo => photo.state === "ready"); break; }
            const result = await request<{ processed: number; remaining: number; failed: number }>(url, { operation: "batch", expectedRevision: snapshot.revision });
            snapshot = await request<QcTransferSnapshot>(url);
            if (!result.processed || result.failed) { group.error = "Parte das fotos ficou pendente. As concluídas estão salvas; use Retomar pendências."; break; }
          }
          group.ready = snapshot.photos.filter(photo => photo.state === "ready").length; group.total = snapshot.photos.length;
          group.complete = snapshot.photos.length > 0 && !snapshot.nextSourceId && snapshot.photos.every(photo => photo.state === "ready");
          if (!group.complete && !group.error) group.error = snapshot.photos.length ? "Há fotos pendentes. Retome para conferir o progresso salvo." : "Nenhuma foto elegível nesta confirmação. Analise o JSON novamente para conferir os destinos atualizados.";
        } catch (cause) { group.error = cause instanceof Error ? cause.message : "Não foi possível concluir esta compra."; }
        invalidateQcPurchase(group.purchaseId); updateGroups(work);
      }
      onChanged();
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Não foi possível preparar a importação."); }
    finally { active.current = false; if (mounted.current) setBusy(false); }
  }
  if (!allowed) return null;
  const selectedCount = preview?.rows.filter(row => !!choices[row.externalKey]).length ?? 0;
  const complete = groups.length > 0 && groups.every(group => group.complete);
  return <>
    <OrdersIconButton label="Importar fotos QC via JSON" onClick={() => setOpen(true)}><ImagePlus size={19} aria-hidden="true" /></OrdersIconButton>
    <OrdersContextSurface open={open} onOpenChange={value => { if (!busy) setOpen(value); }} title={groups.length ? complete ? "QC importado" : "Resultado da importação" : preview ? "Revisar importação" : "Importar fotos de QC"} description="Um único JSON atualiza as fotos dos pedidos identificados." className="orders-qc-import-surface">
      <div className="orders-qc-import">
        {!preview && <><label className="orders-qc-upload" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy && event.dataTransfer.files[0]) void readFile(event.dataTransfer.files[0]); }}><Upload size={24} aria-hidden="true"/><strong>Selecione um arquivo .json</strong><span>ou arraste o arquivo para esta área · até 1 MiB</span><input type="file" accept=".json,application/json" disabled={busy} onChange={event => { if (event.target.files?.[0]) void readFile(event.target.files[0]); }}/></label><label>Ou cole o JSON<textarea aria-label="JSON HubBuy" value={raw} disabled={busy} onChange={event => { setRaw(event.target.value); setFileName("JSON colado"); }} spellCheck={false} /></label><p className="muted">Somente freePhotos de origens permitidas. Fotos não confirmam chegada ou aprovação.</p></>}
        {preview && !groups.length && <><p><strong>{fileName}</strong> · {preview.photoCount} fotos encontradas</p><p role="status">{selectedCount} ocorrências selecionadas · {preview.rows.filter(row => row.status === "unchanged").length} sem alteração · {preview.rows.filter(row => row.status === "ignored").length} ignoradas · {preview.rows.filter(row => row.status === "ambiguous").length} incertas · {preview.rows.filter(row => row.status === "error").length} com erro</p>{preview.partial && <p className="orders-action-notice">O JSON contém apenas parte dos pedidos informados pela origem. Nada fora deste lote será removido.</p>}<ul className="orders-qc-rows">{preview.rows.map(row => <li key={row.externalKey}><strong>{row.title || row.orderNo || "Ocorrência HubBuy"}</strong><small>{row.photoCount} fotos · {row.message}</small>{["matched", "ambiguous"].includes(row.status) && <label>Destino de {row.title || row.orderNo || row.externalKey}<select disabled={busy} value={choices[row.externalKey] ?? ""} onChange={event => setChoices(current => ({ ...current, [row.externalKey]: event.target.value }))}><option value="">Ignorar esta ocorrência</option>{row.candidates.filter(candidate => !candidate.alreadyHasQc).map(candidate => <option key={candidate.targetKey} value={candidate.targetKey}>{candidate.purchaseName} · {new Date(candidate.purchaseDate).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {candidate.accountLabel} · {candidate.name} · {candidate.variant || "Sem variação"}</option>)}</select></label>}</li>)}</ul><p className="muted">Cada compra é confirmada separadamente. Em caso de falha parcial, as fotos concluídas permanecem salvas e as pendências podem ser retomadas. Capas existentes são preservadas.</p></>}
        {groups.length > 0 && <ul className="orders-qc-rows" aria-live="polite">{groups.map(group => <li key={group.purchaseId}><strong>{group.purchaseName}</strong><small>{group.complete ? "Concluída" : busy && !group.error ? "Processando…" : "Pendente"} · {group.ready ?? 0} de {group.total ?? "…"} fotos prontas</small>{group.error && <p className="form-error">{group.error}</p>}</li>)}</ul>}
        {error && <p role="alert" className="orders-form-error">{error}</p>}
        <div className="orders-action-footer"><Button variant="outline" disabled={busy} onClick={() => { if (preview) { setPreview(null); updateGroups([]); setError(""); } else setOpen(false); }}>{preview ? "Analisar outro JSON" : "Cancelar"}</Button>{!preview ? <Button disabled={busy || !raw.trim()} onClick={analyze}>{busy ? "Validando…" : "Continuar"}</Button> : !complete ? <Button disabled={busy || !selectedCount} onClick={importPhotos}>{busy ? "Importando…" : groups.length ? "Retomar pendências" : "Importar fotos"}</Button> : <Button onClick={() => setOpen(false)}>Concluir</Button>}</div>
      </div>
    </OrdersContextSurface>
  </>;
}
