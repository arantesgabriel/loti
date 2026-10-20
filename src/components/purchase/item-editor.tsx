"use client";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { ArrowLeft, Search } from "lucide-react";
import type { ClientData } from "@/lib/domain/services";
import { formatMoney, moneyInput, parseMoney, parsePercentageBps, percentageBpsInput } from "@/lib/domain/money";
import { normalizeText } from "@/lib/domain/categories";
import { allocateItemCost, type CostParticipant, type SharingMode } from "@/lib/domain/cost-sharing";
import { Surface } from "../ui/surface";
import { Button } from "../ui/button";
import { ProductCategoryMarker, Avatar } from "../shared";
import { useWorkspace } from "../workspace-provider";

type Favorite = ClientData["favorites"][number];
export type ClientItem = ClientData["items"][number];
type Fields = { name: string; url: string; quantity: number; price: string; variant: string; notes: string };
type AllocationDrafts = { percentage: Record<string, string>; fixed: Record<string, string> };

function initialDrafts(item?: ClientItem): AllocationDrafts {
  return {
    percentage: Object.fromEntries(item?.participants.map(participant => [participant.personId, percentageBpsInput(participant.percentageBps)]) ?? []),
    fixed: Object.fromEntries(item?.participants.map(participant => [participant.personId, moneyInput(participant.amountCents)]) ?? []),
  };
}

function modeName(mode: SharingMode) {
  return mode === "percentage" ? "Percentual" : mode === "fixed" ? "Valores fixos" : "Divisão igual";
}

export function ItemEditor({ favorite, item, onClose, onBack }: { favorite?: Favorite; item?: ClientItem; onClose: () => void; onBack?: () => void }) {
  const { data, busy, mutate } = useWorkspace();
  const [error, setError] = useState("");
  const savedParticipants = item?.participants ?? [];
  const defaultPeople = savedParticipants.length ? savedParticipants.map(participant => participant.personId) : [item?.personId ?? favorite?.ownerId ?? data.currentUser.id];
  const { register, handleSubmit, control, formState: { errors } } = useForm<Fields>({
    defaultValues: {
      name: item?.name ?? favorite?.name ?? "",
      url: item?.url ?? favorite?.url ?? "",
      quantity: item?.quantity ?? 1,
      price: moneyInput(item?.unitPriceCents ?? favorite?.priceCents ?? null),
      variant: item?.variant ?? favorite?.variant ?? "",
      notes: item?.notes ?? favorite?.notes ?? "",
    },
  });
  const [price, quantity] = useWatch({ control, name: ["price", "quantity"] });
  const [personIds, setPersonIds] = useState(defaultPeople);
  const [sharingMode, setSharingMode] = useState<SharingMode>(savedParticipants.length > 1 ? item?.sharingMode ?? "equal" : "equal");
  const [drafts, setDrafts] = useState<AllocationDrafts>(() => initialDrafts(item));
  const [compositionNeedsReview, setCompositionNeedsReview] = useState(false);
  const previousPricing = useRef(`${item?.quantity ?? 1}|${moneyInput(item?.unitPriceCents ?? favorite?.priceCents ?? null)}`);

  useEffect(() => {
    const currentPricing = `${quantity ?? ""}|${price ?? ""}`;
    if (sharingMode === "fixed" && currentPricing !== previousPricing.current) setCompositionNeedsReview(true);
    previousPricing.current = currentPricing;
  }, [price, quantity, sharingMode]);

  let unitPriceCents: number | null = null;
  let priceError = "";
  try { unitPriceCents = parseMoney(price ?? ""); } catch (cause) { priceError = (cause as Error).message; }
  const allocationParticipants: CostParticipant[] = personIds.map(personId => {
    if (sharingMode === "percentage") {
      try { return { personId, percentageBps: parsePercentageBps(drafts.percentage[personId] ?? "") }; }
      catch { return { personId, percentageBps: null }; }
    }
    if (sharingMode === "fixed") {
      try { return { personId, amountCents: parseMoney(drafts.fixed[personId] ?? "") }; }
      catch { return { personId, amountCents: null }; }
    }
    return { personId };
  });
  let preview: ReturnType<typeof allocateItemCost> | null = null;
  let allocationError = priceError;
  if (!allocationError) {
    try { preview = allocateItemCost({ quantity: Number(quantity), unitPriceCents, sharingMode }, allocationParticipants); }
    catch (cause) { allocationError = (cause as Error).message; }
  }
  const parsedPercentages = personIds.map(personId => {
    try { return parsePercentageBps(drafts.percentage[personId] ?? ""); } catch { return null; }
  });
  const totalPercentageBps = parsedPercentages.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const isPercentageComplete = parsedPercentages.every(value => value !== null);
  const fixedTotal = allocationParticipants.reduce<number>((sum, participant) => sum + (participant.amountCents ?? 0), 0);

  function togglePerson(personId: string, selected: boolean) {
    setError("");
    const next = selected ? [...personIds, personId] : personIds.filter(id => id !== personId);
    if (!next.length) { setError("Selecione ao menos uma pessoa para este item."); return; }
    setPersonIds(next);
    if (next.length === 1) {
      setSharingMode("equal");
      setCompositionNeedsReview(false);
    } else if (sharingMode !== "equal") setCompositionNeedsReview(true);
  }

  function changeMode(mode: SharingMode) {
    setSharingMode(mode);
    setCompositionNeedsReview(true);
    setError("");
  }

  function updateDraft(mode: "percentage" | "fixed", personId: string, value: string) {
    setDrafts(current => ({ ...current, [mode]: { ...current[mode], [personId]: value } }));
  }

  async function save(fields: Fields) {
    setError("");
    let parsedPrice: number | null;
    try { parsedPrice = parseMoney(fields.price); } catch (cause) { setError((cause as Error).message); return; }
    if (!personIds.length) { setError("Selecione ao menos uma pessoa para este item."); return; }
    if (compositionNeedsReview) { setError("Revise a nova composição e confirme a prévia antes de salvar."); return; }
    const mode: SharingMode = personIds.length === 1 ? "equal" : sharingMode;
    let participants: CostParticipant[];
    try {
      participants = personIds.map(personId => mode === "percentage"
        ? { personId, percentageBps: parsePercentageBps(drafts.percentage[personId] ?? "") }
        : mode === "fixed"
          ? { personId, amountCents: parseMoney(drafts.fixed[personId] ?? "") }
          : { personId });
      allocateItemCost({ quantity: fields.quantity, unitPriceCents: parsedPrice, sharingMode: mode }, participants);
    } catch (cause) { setError((cause as Error).message); return; }

    const sharedFields = { variant: fields.variant, notes: fields.notes, quantity: fields.quantity, unitPriceCents: parsedPrice, sharingMode: mode, participants };
    const payload = favorite ? { favoriteId: favorite.id, ...sharedFields } : { name: fields.name, url: fields.url, ...sharedFields };
    if (await mutate(favorite ? "item.favorite" : "item.save", payload, item?.id, item ? "Alterações salvas" : "Adicionado à compra")) onClose();
  }

  return <Surface sheet title={item ? "Editar item" : favorite ? "Adicionar à compra" : "Item manual"} description="A quantidade representa unidades físicas. Dividir o custo não cria produtos extras." open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    {onBack && <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft size={16}/>Voltar</Button>}
    <form onSubmit={handleSubmit(save)}>
      {favorite ? <div className="selected-favorite"><ProductCategoryMarker visualKey={favorite.visualKey}/><div><h3>{favorite.name}</h3><p className="muted">Uma cópia independente do favorito.</p></div></div> : <>
        <label>Nome do produto<input autoFocus maxLength={200} {...register("name", { required: "Informe um nome." })}/>{errors.name && <span className="field-error">{errors.name.message}</span>}</label>
        <label>Link do produto<input type="url" {...register("url", { required: "Informe um link." })}/>{errors.url && <span className="field-error">{errors.url.message}</span>}</label>
      </>}
      <fieldset className="sharing-fieldset">
        <legend>Quem divide o custo?</legend>
        <p className="muted">A seleção inicial continua sendo {favorite ? "a pessoa dona do favorito" : "você"}. Pessoas novas não entram automaticamente.</p>
        <div className="sharing-people-list">{data.members.map(member => {
          const selected = personIds.includes(member.id);
          return <div className={`sharing-person${selected ? " selected" : ""}`} key={member.id}>
            <label className="sharing-person-select"><input type="checkbox" checked={selected} onChange={event => togglePerson(member.id, event.target.checked)}/><Avatar name={member.name}/><span>{member.name}</span></label>
            {selected && sharingMode === "percentage" && <label className="sharing-person-value">Percentual de {member.name}<span className="sharing-input-suffix"><input inputMode="decimal" aria-label={`Percentual de ${member.name}`} placeholder="0,00" value={drafts.percentage[member.id] ?? ""} onChange={event => updateDraft("percentage", member.id, event.target.value)}/><span>%</span></span></label>}
            {selected && sharingMode === "fixed" && <label className="sharing-person-value">Parte de {member.name} (R$)<input inputMode="decimal" aria-label={`Parte de ${member.name} em reais`} placeholder="0,00" value={drafts.fixed[member.id] ?? ""} onChange={event => updateDraft("fixed", member.id, event.target.value)}/></label>}
          </div>;
        })}</div>
      </fieldset>
      {personIds.length > 1 && <label>Como dividir?<select value={sharingMode} onChange={event => changeMode(event.target.value as SharingMode)}>
        <option value="equal">Igualmente</option><option value="percentage">Por percentuais</option><option value="fixed">Por valores em reais</option>
      </select></label>}
      {sharingMode === "percentage" && personIds.length > 1 && <p className={`sharing-composition-total${totalPercentageBps === 10_000 && isPercentageComplete ? " closed" : ""}`}>Percentual informado: {moneyInput(totalPercentageBps)}%{totalPercentageBps !== 10_000 && <span> · deve fechar em 100%</span>}</p>}
      {sharingMode === "fixed" && personIds.length > 1 && <p className={`sharing-composition-total${preview ? " closed" : ""}`}>Distribuído: {formatMoney(fixedTotal)}{unitPriceCents !== null && <span> · subtotal físico: {formatMoney((Number(quantity) || 0) * unitPriceCents)}</span>}</p>}
      <div className="form-row"><label>Quantidade<input type="number" min={1} max={10000} step={1} {...register("quantity", { valueAsNumber: true, required: "Informe a quantidade.", min: { value: 1, message: "Quantidade mínima: 1." }, validate: value => Number.isInteger(value) || "Use uma quantidade inteira." })}/>{errors.quantity && <span className="field-error">{errors.quantity.message}</span>}</label><label>Preço unitário (R$)<input inputMode="decimal" placeholder="Opcional" {...register("price")}/></label></div>
      <div className="item-estimate"><span className="muted">Subtotal físico · {personIds.length} {personIds.length === 1 ? "participante" : "participantes"}</span><strong>{preview ? formatMoney(preview.subtotalCents) : unitPriceCents === null ? "Preço pendente" : "Confira a divisão"}</strong></div>
      {!!personIds.length && <div className="sharing-preview" aria-live="polite"><div className="sharing-preview-heading"><strong>Prévia da divisão</strong><span>{modeName(sharingMode)}</span></div>{personIds.map((personId, index) => <div className="sharing-preview-row" key={personId}><span>{data.members.find(member => member.id === personId)?.name ?? "Pessoa"}{personIds.length > 1 && <small>{sharingMode === "percentage" ? `${moneyInput(allocationParticipants[index]?.percentageBps ?? 0)}%` : sharingMode === "fixed" ? "valor fixo" : "parte igual"}</small>}</span><strong>{preview ? formatMoney(preview.participants[index]?.amountCents ?? null) : "—"}</strong></div>)}{allocationError && <p className="field-error" role="alert">{allocationError}</p>}</div>}
      {compositionNeedsReview && <div className="sharing-review"><p>Participantes ou modo alterados. Confira as parcelas antes de salvar.</p><Button type="button" variant="soft" size="sm" disabled={!!allocationError || !preview} onClick={() => setCompositionNeedsReview(false)}>Confirmar composição</Button></div>}
      <details open={!!item?.notes}><summary>Notas</summary><div className="details-fields"><label>Notas do item<textarea maxLength={4000} {...register("notes")}/></label></div></details>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy || !!allocationError || compositionNeedsReview}>{busy ? "Salvando…" : item ? "Salvar item" : "Adicionar item"}</Button></div>
    </form>
  </Surface>;
}

export function AddItemFlow({ initialFavorite, onClose }: { initialFavorite?: Favorite; onClose: () => void }) {
  const { data } = useWorkspace();
  const [mode, setMode] = useState<"favorites" | "manual">("favorites");
  const [selected, setSelected] = useState<Favorite | undefined>(initialFavorite);
  const [search, setSearch] = useState("");
  if (selected || mode === "manual") return <ItemEditor favorite={selected} onClose={onClose} onBack={() => { setSelected(undefined); setMode("favorites"); }}/>
  const results = data.favorites.filter(candidate => normalizeText(`${candidate.name} ${candidate.variant ?? ""}`).includes(normalizeText(search)));
  return <Surface sheet title="Adicionar item" description="Escolha um favorito ou crie um item só para esta compra." open onOpenChange={open => { if (!open) onClose(); }}>
    <div className="segmented source-tabs"><button className="selected">Dos favoritos</button><button onClick={() => setMode("manual")}>Manual</button></div>
    <div className="search-input"><Search size={18}/><input autoFocus aria-label="Buscar favorito para compra" placeholder="Buscar nos favoritos…" value={search} onChange={event => setSearch(event.target.value)}/></div>
    <div className="favorite-picker">{results.map(candidate => <button key={candidate.id} onClick={() => setSelected(candidate)}><ProductCategoryMarker visualKey={candidate.visualKey}/><span><strong>{candidate.name}</strong><small>{candidate.variant}</small><span className="owner"><Avatar name={data.members.find(member => member.id === candidate.ownerId)?.name ?? ""}/>{data.members.find(member => member.id === candidate.ownerId)?.name}</span></span></button>)}{!results.length && <p className="muted">Nenhum favorito encontrado. Você pode adicionar um item manual.</p>}</div>
  </Surface>;
}
