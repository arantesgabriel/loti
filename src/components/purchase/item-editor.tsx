"use client";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { ArrowLeft, Search } from "lucide-react";
import type { ClientData } from "@/lib/domain/services";
import { formatMoney, moneyInput, parseMoney } from "@/lib/domain/money";
import { normalizeText } from "@/lib/domain/visuals";
import { Surface } from "../ui/surface";
import { Button } from "../ui/button";
import { ProductVisual, Avatar } from "../shared";
import { useWorkspace } from "../workspace-provider";
type Favorite = ClientData["favorites"][number]; export type ClientItem = ClientData["items"][number];
type Fields = { name: string; url: string; personId: string; quantity: number; price: string; variant: string; notes: string };
export function ItemEditor({ favorite, item, onClose, onBack }: { favorite?: Favorite; item?: ClientItem; onClose: () => void; onBack?: () => void }) {
  const { data, busy, mutate } = useWorkspace(); const [error, setError] = useState("");
  const { register, handleSubmit, control, formState: { errors } } = useForm<Fields>({ defaultValues: { name: item?.name ?? favorite?.name ?? "", url: item?.url ?? favorite?.url ?? "", personId: item?.personId ?? favorite?.ownerId ?? data.currentUser.id, quantity: item?.quantity ?? 1, price: moneyInput(item?.unitPriceCents ?? favorite?.priceCents ?? null), variant: item?.variant ?? favorite?.variant ?? "", notes: item?.notes ?? favorite?.notes ?? "" } });
  const [price, quantity] = useWatch({ control, name: ["price", "quantity"] });
  let estimate = "Preço pendente"; try { const cents = parseMoney(price); if (cents !== null && Number.isInteger(quantity) && quantity > 0) estimate = formatMoney(cents * quantity); } catch { /* Pricing errors appear at submit. */ }
  async function save(fields: Fields) {
    setError(""); let unitPriceCents;
    try { unitPriceCents = parseMoney(fields.price); } catch (e) { setError((e as Error).message); return; }
    if (await mutate(favorite ? "item.favorite" : "item.save", { ...fields, unitPriceCents, ...(favorite ? { favoriteId: favorite.id } : {}) }, item?.id, item ? "Alterações salvas" : "Adicionado à compra")) onClose();
  }
  return <Surface sheet title={item ? "Editar item" : favorite ? "Adicionar à compra" : "Item manual"} description="Defina para quem é e ajuste os detalhes desta compra." open onOpenChange={v => { if (!v && !busy) onClose(); }}>{onBack && <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft size={16}/>Voltar</Button>}<form onSubmit={handleSubmit(save)}>
  {favorite ? <div className="selected-favorite"><ProductVisual visualKey={favorite.visualKey}/><div><h3>{favorite.name}</h3><p className="muted">Uma cópia independente do favorito.</p></div></div> : <><label>Nome do produto<input autoFocus maxLength={200} {...register("name", { required: "Informe um nome." })}/>{errors.name && <span className="field-error">{errors.name.message}</span>}</label><label>Link do produto<input type="url" {...register("url", { required: "Informe um link." })}/>{errors.url && <span className="field-error">{errors.url.message}</span>}</label></>}
  <label>Para quem é?<select {...register("personId", { required: true })}>{data.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
  <label>Variação / modelo<input maxLength={500} placeholder="Cor, tamanho, modelo…" {...register("variant")}/></label>
  <div className="form-row"><label>Quantidade<input type="number" min={1} max={10000} step={1} {...register("quantity", { valueAsNumber: true, required: "Informe a quantidade.", min: { value: 1, message: "Quantidade mínima: 1." }, validate: n => Number.isInteger(n) || "Use uma quantidade inteira." })}/>{errors.quantity && <span className="field-error">{errors.quantity.message}</span>}</label><label>Preço unitário (R$)<input inputMode="decimal" placeholder="Opcional" {...register("price")}/></label></div>
  <div className="item-estimate"><span className="muted">Subtotal</span><strong>{estimate}</strong></div>
  <details open={!!item?.notes}><summary>Notas</summary><div className="details-fields"><label>Notas do item<textarea maxLength={4000} {...register("notes")}/></label></div></details>
  {error && <p className="error" role="alert">{error}</p>}<div className="form-actions"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Salvando…" : item ? "Salvar item" : "Adicionar item"}</Button></div></form></Surface>;
}
export function AddItemFlow({ initialFavorite, onClose }: { initialFavorite?: Favorite; onClose: () => void }) {
  const { data } = useWorkspace(); const [mode, setMode] = useState<"favorites" | "manual">("favorites"), [selected, setSelected] = useState<Favorite | undefined>(initialFavorite), [search, setSearch] = useState("");
  if (selected || mode === "manual") return <ItemEditor favorite={selected} onClose={onClose} onBack={() => { setSelected(undefined); setMode("favorites"); }}/>
  const results = data.favorites.filter(f => normalizeText(`${f.name} ${f.variant ?? ""}`).includes(normalizeText(search)));
  return <Surface sheet title="Adicionar item" description="Escolha um favorito ou crie um item só para esta compra." open onOpenChange={v => { if (!v) onClose(); }}><div className="segmented source-tabs"><button className="selected">Dos favoritos</button><button onClick={() => setMode("manual")}>Manual</button></div><div className="search-input"><Search size={18}/><input autoFocus aria-label="Buscar favorito para compra" placeholder="Buscar nos favoritos…" value={search} onChange={e => setSearch(e.target.value)}/></div><div className="favorite-picker">{results.map(f => <button key={f.id} onClick={() => setSelected(f)}><ProductVisual visualKey={f.visualKey}/><span><strong>{f.name}</strong><small>{f.variant}</small><span className="owner"><Avatar name={data.members.find(m => m.id === f.ownerId)?.name ?? ""}/>{data.members.find(m => m.id === f.ownerId)?.name}</span></span></button>)}{!results.length && <p className="muted">Nenhum favorito encontrado. Você pode adicionar um item manual.</p>}</div></Surface>;
}
