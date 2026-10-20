"use client";

import type { ReactNode } from "react";
import { ArrowUp, Check, CircleCheck, CircleAlert, Clock3, ImageIcon, LoaderCircle, ShieldCheck } from "lucide-react";
import "./qc-import-progress.css";

export type QcTransferPhoto = {
  id: string; sourceId: string | null; name: string; occurrence: string | null;
  state: string; errorCode: string | null; byteSize: number | null; imageId: string | null; previewUrl: string | null;
};
export type QcTransferSnapshot = { photos: QcTransferPhoto[]; nextSourceId: string | null };

function photoSize(bytes: number) {
  const unit = bytes < 1024 ? "B" : bytes < 1024 * 1024 ? "KB" : "MB";
  const divisor = unit === "B" ? 1 : unit === "KB" ? 1024 : 1024 * 1024;
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(bytes / divisor)} ${unit}`;
}

export function QcImportProgress({ photos: importPhotos, activeSourceId, importedIds, busy, complete, error, total, renderPreview }: {
  photos: QcTransferPhoto[] | null; activeSourceId: string | null; importedIds: Set<string>; busy: boolean; complete: boolean;
  error: string; total: number; renderPreview: (photo: QcTransferPhoto) => ReactNode;
}) {
  const photos = importPhotos?.filter(photo => !["ignored", "deleted", "matching"].includes(photo.state)) ?? null;
  const ready = photos?.filter(photo => photo.state === "ready").length ?? 0;
  const failed = photos?.filter(photo => photo.state === "failed").length ?? 0;
  const pending = photos?.filter(photo => photo.state === "pending" && photo.errorCode).length ?? 0;
  const count = photos?.length ?? total;
  const processed = ready + failed;
  const percent = count ? Math.round(processed / count * 100) : 0;
  const success = complete && !failed && !pending && ready > 0 && ready === count;
  const empty = count === 0;
  const title = empty ? "Nenhuma foto vinculada para importar" : busy ? "Processando suas fotos" : success ? "Importação concluída" : error ? "Importação interrompida" : "Importação parcial";
  const detail = empty ? "Selecione um produto com fotos de QC na etapa de vínculos para iniciar a importação." : busy ? <>Estamos importando e associando as imagens do QC.<br/>Isso pode levar alguns segundos.</> : success ? `${ready} ${ready === 1 ? "foto foi importada e associada" : "fotos foram importadas e associadas"} com sucesso.` : "As fotos concluídas estão salvas. Confira abaixo o que ainda precisa de atenção.";

  return <div className="qc-transfer-content">
    <div className="qc-transfer-hero" role="status" aria-live="polite" aria-atomic="true">
      <div className={`qc-transfer-art${success ? " is-complete" : ""}`} aria-hidden="true">
        <span className="qc-transfer-art-back left"><ImageIcon/></span><span className="qc-transfer-art-back right"><ImageIcon/></span>
        <span className="qc-transfer-art-front"><ImageIcon strokeWidth={1.4}/><i/><i/></span>
        <span className="qc-transfer-art-badge">{success ? <Check size={22}/> : empty ? <ImageIcon size={20}/> : error || failed ? <CircleAlert size={22}/> : <ArrowUp size={22}/>}</span>
      </div>
      <h3>{title}</h3><p>{detail}</p>
      {!empty && <span className="sr-only">{processed} de {count} fotos processadas. {percent}%.</span>}
    </div>
    {!empty && <>
      <div className="qc-transfer-progress">
        <div><strong>{processed} de {count} fotos processadas</strong><strong>{percent}%</strong></div>
        <div className="qc-transfer-track" role="progressbar" aria-label="Progresso da importação QC" aria-valuemin={0} aria-valuemax={count} aria-valuenow={processed} aria-valuetext={`${processed} de ${count} fotos processadas`}><span style={{ width: `${percent}%` }}/></div>
      </div>
      <ul className="qc-transfer-list" aria-label="Fotos da importação QC" aria-busy={busy} tabIndex={0}>
        {photos === null ? <li className="qc-transfer-loading"><LoaderCircle size={16} className="qc-transfer-spinner" aria-hidden="true"/>Carregando a lista de fotos…</li> : photos.map((photo, index) => {
          const active = busy && activeSourceId !== null && photo.sourceId === activeSourceId;
          const imported = photo.state === "ready" && !!photo.sourceId && importedIds.has(photo.sourceId);
          const status = active ? "processing" : photo.state === "ready" ? "success" : photo.state === "failed" ? "error" : photo.state === "matching" || photo.errorCode && photo.state === "pending" ? "pending" : "waiting";
          const label = active ? "Processando..." : photo.state === "ready" ? imported ? "Importada" : "Já existente" : photo.state === "failed" ? "Falha" : photo.state === "matching" ? "Sem vínculo" : photo.state === "ignored" ? "Ignorada" : photo.state === "deleted" ? "Excluída" : photo.errorCode ? "Pendente" : "Aguardando...";
          const Icon = active ? LoaderCircle : photo.state === "ready" ? CircleCheck : photo.state === "failed" ? CircleAlert : Clock3;
          return <li className={`qc-transfer-row ${status}`} key={photo.id}>
            <span className="qc-transfer-thumbnail">{photo.previewUrl && photo.imageId ? renderPreview(photo) : <ImageIcon size={23} aria-hidden="true"/>}</span>
            <span className="qc-transfer-file"><strong title={photo.name || `Foto ${index + 1}`}>{photo.name || `Foto ${index + 1}`}</strong>
              {photo.byteSize !== null ? <small>{photoSize(photo.byteSize)}</small> : photo.occurrence && <small title={photo.occurrence}>{photo.occurrence}</small>}
              {photo.state === "matching" && <small className="qc-transfer-explanation">Aguarda vínculo manual.</small>}
              {photo.errorCode && !active && <small className="qc-transfer-explanation">{photo.state === "failed" ? "Não foi possível importar. Tente novamente." : "A transferência aguarda recuperação."} <span>Código: {photo.errorCode}</span></small>}
            </span>
            <span className="qc-transfer-state"><Icon size={16} className={active ? "qc-transfer-spinner" : undefined} aria-hidden="true"/>{label}</span>
          </li>;
        })}
      </ul>
    </>}
    {(pending > 0 || failed > 0) && <p className="qc-transfer-summary">{[
      failed ? `${failed} ${failed === 1 ? "foto com falha" : "fotos com falha"}` : "",
      pending ? `${pending} ${pending === 1 ? "transferência pendente" : "transferências pendentes"}` : "",
    ].filter(Boolean).join(" · ")}</p>}
    <div className="qc-transfer-callout"><ShieldCheck size={18} aria-hidden="true"/><p>As fotos são transferidas em sequência. Os vínculos são confirmados antes de iniciar a transferência.</p></div>
  </div>;
}
