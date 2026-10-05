"use client";
import { useForm, useWatch } from "react-hook-form";
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { ClientData } from "@/lib/domain/services";
import { parseMoney, moneyInput } from "@/lib/domain/money";
import { buildCanonicalProductKey, detectPlatform, platformLabels } from "@/lib/domain/urls";
import { Surface } from "../ui/surface";
import { Button } from "../ui/button";
import { useWorkspace } from "../workspace-provider";
export type ClientFavorite = ClientData["favorites"][number];
type Fields = { name: string; url: string; price: string; variant: string; notes: string; collectionId: string; qcStatus: "not_reviewed" | "approved" | "rejected" };
export function FavoriteEditor({ favorite, onClose, onExisting }: { favorite?: ClientFavorite; onClose: () => void; onExisting: (favorite: ClientFavorite) => void }) {
  const { data, busy, mutate } = useWorkspace(); const [error, setError] = useState("");
  const { register, handleSubmit, control, formState: { errors } } = useForm<Fields>({ defaultValues: { name: favorite?.name ?? "", url: favorite?.url ?? "", price: moneyInput(favorite?.priceCents ?? null), variant: favorite?.variant ?? "", notes: favorite?.notes ?? "", collectionId: favorite?.collectionId ?? "", qcStatus: favorite?.qcStatus ?? "not_reviewed" } });
  const url = useWatch({ control, name: "url" }), key = buildCanonicalProductKey(url);
  const duplicate = key ? data.favorites.find(f => f.canonicalProductKey === key && f.id !== favorite?.id) : undefined;
  async function save(fields: Fields) {
    setError(""); let priceCents;
    try { priceCents = parseMoney(fields.price); } catch (e) { setError((e as Error).message); return; }
    if (await mutate("favorite.save", { ...fields, priceCents, collectionId: fields.collectionId || null }, favorite?.id, "Favorito salvo")) onClose();
  }
  return <Surface sheet title={favorite ? "Editar favorito" : "Novo favorito"} description="Guarde o link. Os detalhes podem ficar para depois." open onOpenChange={v => { if (!v && !busy) onClose(); }}><form onSubmit={handleSubmit(save)}>
    <label>Link do produto<input type="url" autoFocus placeholder="https://…" {...register("url", { required: "Informe o link." })}/>{url && <small className="muted">{platformLabels[detectPlatform(url)]}</small>}{errors.url && <span className="field-error">{errors.url.message}</span>}</label>
    <label>Nome do produto<input placeholder="Ex.: Nike Vomero 18" maxLength={200} {...register("name", { required: "Informe um nome." })}/>{errors.name && <span className="field-error">{errors.name.message}</span>}</label>
    <label>Preço de referência (R$)<input inputMode="decimal" placeholder="Opcional" {...register("price")}/><small className="muted">Pode ser ajustado quando entrar na compra.</small></label>
    {duplicate && <div className="duplicate-warning" role="status"><AlertTriangle size={18}/><div><strong>Este link já está nos favoritos</strong><p>{duplicate.name} · {data.members.find(m => m.id === duplicate.ownerId)?.name}</p><Button type="button" variant="ghost" size="sm" onClick={() => onExisting(duplicate)}>Ver existente</Button></div></div>}
    <details open={!!favorite}><summary>Mais detalhes</summary><div className="details-fields">
      <label>Variação / modelo<input placeholder="Cor, tamanho, modelo…" maxLength={500} {...register("variant")}/></label>
      <label>Coleção<select {...register("collectionId")}><option value="">Sem coleção</option>{data.collections.filter(c => c.ownerId === data.currentUser.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Avaliação QC<select {...register("qcStatus")}><option value="not_reviewed">Não avaliado</option><option value="approved">Aprovado</option><option value="rejected">Reprovado</option></select></label>
      <label>Notas<textarea placeholder="O que você quer lembrar deste produto?" maxLength={4000} {...register("notes")}/></label>
    </div></details>{error && <p className="error" role="alert">{error}</p>}
    <div className="form-actions"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Salvando…" : duplicate ? "Salvar mesmo assim" : "Salvar favorito"}</Button></div>
  </form></Surface>;
}
