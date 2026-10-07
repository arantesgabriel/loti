"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Plus, ShoppingCart, MoreHorizontal, Check, RotateCcw, Pencil, Trash2, LockKeyhole, ArrowLeft, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";
import { Confirm, Surface } from "../ui/surface";
import { Avatar, ProductCategoryMarker, OpenProduct, EmptyState, PlatformBadge } from "../shared";
import { useWorkspace } from "../workspace-provider";
import { formatMoney, purchaseSummary, personSummary, subtotal } from "@/lib/domain/money";
import { PurchaseEditor } from "./purchase-editor";
import { AddItemFlow, ItemEditor, type ClientItem } from "./item-editor";
import type { ClientData } from "@/lib/domain/services";

const totalOptions = [
  { label: "Todos os itens", status: "all" },
  { label: "Pendentes", status: "pending" },
  { label: "Adicionados", status: "added" },
] as const;

function bezierCoordinate(t: number, point1: number, point2: number) {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * point1 + 3 * inverse * t * t * point2 + t * t * t;
}

function selectionEase(progress: number) {
  if (progress <= 0 || progress >= 1) return progress;
  let low = 0, high = 1, t = progress;
  for (let iteration = 0; iteration < 12; iteration++) {
    t = (low + high) / 2;
    if (bezierCoordinate(t, 0.2, 0.2) < progress) low = t;
    else high = t;
  }
  return bezierCoordinate((low + high) / 2, 0.8, 1);
}

function PurchaseTotalCarousel({ items }: { items: ClientData["items"] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startScrollLeft: number; moved: boolean } | null>(null);
  const totals = totalOptions.map(option => ({
    ...option,
    summary: purchaseSummary(option.status === "all" ? items : items.filter(item => item.cartStatus === option.status)),
  }));

  useEffect(() => () => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
  }, []);

  function updateActiveIndex() {
    const viewport = viewportRef.current;
    if (!viewport || !viewport.clientWidth || animationFrameRef.current !== null) return;
    const nextIndex = Math.max(0, Math.min(totals.length - 1, Math.round(viewport.scrollLeft / viewport.clientWidth)));
    setActiveIndex(current => current === nextIndex ? current : nextIndex);
  }

  function cancelScrollAnimation(viewport = viewportRef.current) {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    viewport?.classList.remove("is-programmatic");
  }

  function animateScrollTo(viewport: HTMLDivElement, target: number) {
    cancelScrollAnimation(viewport);
    const start = viewport.scrollLeft;
    const distance = target - start;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || Math.abs(distance) < 1) {
      viewport.scrollTo({ left: target, behavior: "auto" });
      updateActiveIndex();
      return;
    }

    const duration = 260;
    const startedAt = performance.now();
    viewport.classList.add("is-programmatic");
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      viewport.scrollLeft = start + distance * selectionEase(progress);
      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(step);
      } else {
        animationFrameRef.current = null;
        viewport.classList.remove("is-programmatic");
        updateActiveIndex();
      }
    };
    animationFrameRef.current = requestAnimationFrame(step);
  }

  function goToIndex(index: number) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const nextIndex = Math.max(0, Math.min(totals.length - 1, index));
    setActiveIndex(nextIndex);
    animateScrollTo(viewport, nextIndex * viewport.clientWidth);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    cancelScrollAnimation(event.currentTarget);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startScrollLeft: event.currentTarget.scrollLeft, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(distance) > 4) {
      drag.moved = true;
      event.currentTarget.classList.add("is-dragging");
    }
    if (drag.moved) {
      event.currentTarget.scrollLeft = drag.startScrollLeft - distance;
      event.preventDefault();
    }
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    const drag = dragRef.current;
    dragRef.current = null;
    event.currentTarget.classList.remove("is-dragging");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.moved && event.currentTarget.clientWidth) {
      goToIndex(Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth));
    } else {
      updateActiveIndex();
    }
  }

  return <section className="total-panel" aria-label="Totais estimados da compra">
    <div className="total-carousel-heading">
      <span className="muted">Valor total (estimado)</span>
      <div className="total-carousel-arrows">
        <button className="total-carousel-arrow" type="button" aria-label="Total anterior" onClick={() => goToIndex(activeIndex - 1)} disabled={activeIndex === 0}><ChevronLeft size={17}/></button>
        <button className="total-carousel-arrow" type="button" aria-label="Próximo total" onClick={() => goToIndex(activeIndex + 1)} disabled={activeIndex === totals.length - 1}><ChevronRight size={17}/></button>
      </div>
    </div>
    <div className="total-carousel-viewport" ref={viewportRef} role="region" aria-roledescription="carrossel" aria-label="Totais da compra" tabIndex={0} onScroll={updateActiveIndex} onKeyDown={event => {
      if (event.key === "ArrowRight") { event.preventDefault(); goToIndex(activeIndex + 1); }
      if (event.key === "ArrowLeft") { event.preventDefault(); goToIndex(activeIndex - 1); }
      if (event.key === "Home") { event.preventDefault(); goToIndex(0); }
      if (event.key === "End") { event.preventDefault(); goToIndex(totals.length - 1); }
    }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerEnd} onPointerCancel={handlePointerEnd}>
      <div className="total-carousel-track">
        {totals.map((total, index) => <div className="total-carousel-slide" key={total.status} role="group" aria-roledescription="slide" aria-label={`${index + 1} de ${totals.length}: ${total.label}`} aria-hidden={index !== activeIndex}>
          <span className="total-carousel-scope" data-testid={index === activeIndex ? "purchase-total-scope" : undefined}>{total.label}</span>
          <strong data-testid={index === activeIndex ? "purchase-total" : undefined}>{formatMoney(total.summary.totalCents)}</strong>
          {total.summary.noPriceUnits > 0
            ? <small>{total.summary.noPriceUnits} {total.summary.noPriceUnits === 1 ? "unidade sem preço neste total" : "unidades sem preço neste total"}</small>
            : <small>{total.summary.units === 0 ? "Nenhuma unidade neste total" : `${total.summary.units} ${total.summary.units === 1 ? "unidade" : "unidades"} neste total`}</small>}
        </div>)}
      </div>
    </div>
    <div className="total-carousel-footer">
      <div className="total-carousel-dots" role="group" aria-label="Escolher total estimado">
        {totals.map((total, index) => <button key={total.status} type="button" aria-label={`Mostrar total: ${total.label}`} aria-pressed={activeIndex === index} onClick={() => goToIndex(index)}><span/></button>)}
      </div>
      <span className="total-carousel-hint">Arraste para ver</span>
      <span className="sr-only" aria-live="polite">{activeIndex + 1} de {totals.length}: {totals[activeIndex]?.label}</span>
    </div>
  </section>;
}

export function PurchaseScreen() {
  const { data } = useWorkspace(); const params = useSearchParams(); const [create, setCreate] = useState(false);
  const purchase = data.purchases.find(p => p.status === "active");
  if (purchase) return <PurchaseView key={purchase.id} purchase={purchase}/>;
  return <><div className="page-heading"><div><h1>Compra atual</h1><p className="muted">O próximo pedido começa com seus favoritos.</p></div></div><EmptyState icon={ShoppingCart} title="Vamos comprar juntos?" description="Crie uma compra para reunir os itens de todo mundo e acompanhar o que já entrou no carrinho HubBuy."><Button onClick={() => setCreate(true)}><Plus size={18}/>Criar compra</Button>{params.get("favorite") && <p className="muted">Depois de criar a compra, você pode adicionar o favorito selecionado.</p>}</EmptyState>{create && <PurchaseEditor onClose={() => setCreate(false)}/>}</>;
}
export function PurchaseView({ purchase }: { purchase: ClientData["purchases"][number] }) {
  const { data, busy, mutate } = useWorkspace(), params = useSearchParams(), router = useRouter();
  const [filter, setFilter] = useState<"all" | "pending" | "added">("all"), [person, setPerson] = useState(""), [add, setAdd] = useState(false), [metadata, setMetadata] = useState(false), [finalize, setFinalize] = useState(false), [edit, setEdit] = useState<ClientItem | null>(null), [remove, setRemove] = useState<ClientItem | null>(null), [detail, setDetail] = useState<ClientItem | null>(null), [showFloatingAdd, setShowFloatingAdd] = useState(false);
  const filterRailRef = useRef<HTMLDivElement>(null), filterRefs = useRef(new Map<string, HTMLButtonElement>()), addButtonRef = useRef<HTMLButtonElement>(null);
  const [filterSelection, setFilterSelection] = useState<{ left: number; width: number } | null>(null);
  const readonly = purchase.status === "finalized", items = data.items.filter(i => i.purchaseId === purchase.id), summary = purchaseSummary(items);
  const favorite = !readonly ? data.favorites.find(f => f.id === params.get("favorite")) : undefined;
  const people = data.members.filter(m => items.some(i => i.personId === m.id));
  const filtered = items.filter(i => (!person || i.personId === person) && (filter === "all" || i.cartStatus === filter));
  useLayoutEffect(() => {
    const updateSelection = () => {
      const selected = filterRefs.current.get(filter);
      if (selected) setFilterSelection({ left: selected.offsetLeft, width: selected.offsetWidth });
    };
    updateSelection();
    window.addEventListener("resize", updateSelection);
    return () => window.removeEventListener("resize", updateSelection);
  }, [filter]);
  useEffect(() => {
    const target = addButtonRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setShowFloatingAdd(!entry.isIntersecting), { threshold: 0 });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  function closeAdd() { setAdd(false); if (params.get("favorite")) router.replace("/purchase", { scroll: false }); }
  return <>{readonly && <Link href="/history" className="back-link"><ArrowLeft size={16}/>Histórico</Link>}<div className="page-heading purchase-heading"><div><div className="purchase-title"><h1>{purchase.name}</h1><span className={`badge purchase-status ${readonly ? "finalized" : ""}`}>{readonly ? <LockKeyhole size={12}/> : <span className="status-dot"/>}{readonly ? "Finalizada" : "Em andamento"}</span></div><p className="muted">{summary.units} {summary.units === 1 ? "unidade" : "unidades"} · {summary.people} {summary.people === 1 ? "pessoa" : "pessoas"}{purchase.hubbuyAccount && <span> · Conta HubBuy: {purchase.hubbuyAccount}</span>}{readonly && purchase.finalizedAt && <span> · {new Date(purchase.finalizedAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>}</p></div>{!readonly && <div className="purchase-heading-actions"><div className="purchase-desktop-actions"><Button variant="outline" className="purchase-heading-option" aria-label="Editar compra" onClick={() => setMetadata(true)}><Pencil size={16}/><span className="purchase-heading-option-label">Editar compra</span></Button><Button variant="soft" className="purchase-heading-option" aria-label="Finalizar compra" onClick={() => setFinalize(true)}><Check size={16}/><span className="purchase-heading-option-label">Finalizar compra</span></Button></div><div className="purchase-mobile-options"><DropdownMenu.Root><DropdownMenu.Trigger asChild><Button variant="outline" size="icon" aria-label="Opções da compra"><MoreHorizontal size={20}/></Button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="dropdown" align="end" sideOffset={8}><DropdownMenu.Item onSelect={() => setMetadata(true)}><Pencil size={15}/>Editar compra</DropdownMenu.Item><DropdownMenu.Item onSelect={() => setFinalize(true)}><Check size={15}/>Finalizar compra</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></div><Button ref={addButtonRef} className="purchase-add-button" onClick={() => setAdd(true)} aria-label="Adicionar item"><Plus size={18}/><span className="desktop-label">Adicionar item</span></Button></div>}</div>
  <div className="purchase-summary"><div className="progress-panel"><div className="progress-label"><strong>{summary.added} de {summary.units} adicionadas</strong><span>{summary.progress}%</span></div><div className="progress-track" role="progressbar" aria-label="Itens adicionados ao carrinho" aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary.progress}><span style={{ width: `${summary.progress}%` }}/></div></div><PurchaseTotalCarousel items={items}/></div>
  <div className="purchase-toolbar"><div className="purchase-filter-rail" ref={filterRailRef} role="group" aria-label="Filtrar itens da compra" style={{ "--selection-left": `${filterSelection?.left ?? 0}px`, "--selection-width": `${filterSelection?.width ?? 0}px` } as React.CSSProperties}><span className={`purchase-filter-selection${filterSelection ? " ready" : ""}`} aria-hidden="true"/><button ref={element => { if (element) filterRefs.current.set("all", element); else filterRefs.current.delete("all"); }} className={`purchase-filter-option${filter === "all" ? " selected" : ""}`} aria-pressed={filter === "all"} onClick={() => setFilter("all")}><strong>Todos</strong><span>{summary.units}</span></button><button ref={element => { if (element) filterRefs.current.set("pending", element); else filterRefs.current.delete("pending"); }} className={`purchase-filter-option${filter === "pending" ? " selected" : ""}`} aria-pressed={filter === "pending"} onClick={() => setFilter("pending")}><strong>Pendentes</strong><span>{summary.pending}</span></button><button ref={element => { if (element) filterRefs.current.set("added", element); else filterRefs.current.delete("added"); }} className={`purchase-filter-option${filter === "added" ? " selected" : ""}`} aria-pressed={filter === "added"} onClick={() => setFilter("added")}><strong>Adicionados</strong><span>{summary.added}</span></button></div></div>
  {!readonly && <Button className={`purchase-floating-add${showFloatingAdd ? " is-visible" : ""}`} data-testid="purchase-floating-add" onClick={() => setAdd(true)} aria-label="Adicionar item"><Plus size={24}/></Button>}
  {!!people.length && <div className="person-strip">{people.map(m => { const s = personSummary(items, m.id); return <button className={`person-summary ${person === m.id ? "selected" : ""}`} key={m.id} onClick={() => setPerson(person === m.id ? "" : m.id)} aria-pressed={person === m.id}><Avatar name={m.name}/><span><strong>{m.name}</strong><small>{s.units} {s.units === 1 ? "unidade" : "unidades"} · {s.added}/{s.units} adicionadas</small><b>{formatMoney(s.totalCents)}</b></span></button>; })}</div>}
  {data.members.filter(m => filtered.some(i => i.personId === m.id)).map(m => { const group = filtered.filter(i => i.personId === m.id), s = personSummary(items, m.id); return <section className="purchase-group" key={m.id}><div className="group-heading"><Avatar name={m.name}/><div className="group-heading-copy"><h2>{m.name}</h2><p className="muted">{s.units} {s.units === 1 ? "unidade" : "unidades"} · {formatMoney(s.totalCents)}</p></div><div className="group-bulk-controls"><span className="group-added-count">{s.added}/{s.units} adicionados</span>{!readonly && <Button className="group-bulk-status" variant="soft" size="sm" aria-label={`Marcar todos como ${s.pending > 0 ? "adicionados" : "pendentes"}`} title={`Marcar todos como ${s.pending > 0 ? "adicionados" : "pendentes"}`} disabled={busy} onClick={() => mutate("item.status.person", { personId: m.id, status: s.pending > 0 ? "added" : "pending" }, purchase.id, s.pending > 0 ? `Itens de ${m.name} marcados como adicionados` : `Itens de ${m.name} marcados como pendentes`)}><span className="group-bulk-icon" aria-hidden="true">{s.pending > 0 ? <Check size={15}/> : <RotateCcw size={15}/>}</span><span className="group-bulk-label">{s.pending > 0 ? "Adicionar" : "Pendentes"}</span></Button>}</div></div><div className="table-head"><span>Produto</span><span>Qtd × Preço unitário</span><span>Subtotal</span></div>{group.map(i => <article className="purchase-row" key={i.id} data-testid="purchase-item">{readonly ? <span className={`cart-readonly ${i.cartStatus}`} aria-label={i.cartStatus === "added" ? "Adicionado" : "Pendente"}>{i.cartStatus === "added" ? <Check size={16}/> : <span/>}</span> : <button className={`cart-toggle ${i.cartStatus}`} aria-pressed={i.cartStatus === "added"} aria-label={`Marcar ${i.name} como ${i.cartStatus === "added" ? "pendente" : "adicionado"}`} disabled={busy} onClick={() => mutate("item.status", i.cartStatus === "added" ? "pending" : "added", i.id, i.cartStatus === "added" ? "Marcado como pendente" : "Marcado como adicionado")}>{i.cartStatus === "added" && <Check size={16}/>}</button>}<ProductCategoryMarker visualKey={i.visualKey}/><div className="purchase-item-info"><button className="favorite-title" onClick={() => setDetail(i)}>{i.name}</button><div className="purchase-item-meta"><p className="muted">{i.variant || "Sem variação"}</p><span className="cart-text">{i.cartStatus === "added" ? "Adicionado" : "Pendente"}</span></div><span className="mobile-item-price">{i.quantity} × {formatMoney(i.unitPriceCents)}</span></div><span className="item-unit-price">{i.quantity} × {formatMoney(i.unitPriceCents)}</span><strong className={`item-subtotal ${i.unitPriceCents === null ? "price-pending" : ""}`}>{formatMoney(subtotal(i))}</strong><div className="purchase-row-actions"><OpenProduct url={i.url} compact/>{!readonly && <DropdownMenu.Root><DropdownMenu.Trigger asChild><Button variant="ghost" size="icon" aria-label={`Opções de ${i.name}`}><MoreHorizontal size={18}/></Button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="dropdown" align="end" sideOffset={5}><DropdownMenu.Item onSelect={() => setEdit(i)}><Pencil size={15}/>Editar item</DropdownMenu.Item><DropdownMenu.Item className="danger-text" onSelect={() => setRemove(i)}><Trash2 size={15}/>Remover item</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>}</div></article>)}</section>; })}
  {!filtered.length && <EmptyState icon={ShoppingCart} title={items.length ? "Tudo certo por aqui" : "A compra ainda está vazia"} description={items.length ? "Nenhum item com estes filtros. Selecione Todos para ver a compra completa." : readonly ? "Esta compra foi finalizada sem itens." : "Adicione um favorito ou um item manual para começar."}/>}
  {!readonly && items.length > 0 && <div className="finalize-footer"><p className="muted">Terminou esta rodada?</p><Button variant="outline" onClick={() => setFinalize(true)}><Check size={16}/>Finalizar compra</Button></div>}
  {(add || favorite) && !readonly && <AddItemFlow key={favorite?.id ?? "new"} initialFavorite={favorite} onClose={closeAdd}/>} {edit && !readonly && <ItemEditor key={edit.id} item={edit} onClose={() => setEdit(null)}/>} {metadata && !readonly && <PurchaseEditor purchase={purchase} onClose={() => setMetadata(false)}/>}
  <Confirm open={!!remove && !readonly} onOpenChange={v => { if (!v) setRemove(null); }} title="Remover item?" description="O favorito de origem continua salvo." danger label="Remover item" busy={busy} onConfirm={async () => { if (remove && await mutate("item.delete", undefined, remove.id, "Item removido")) setRemove(null); }}/>
  <Confirm open={finalize && !readonly} onOpenChange={setFinalize} title="Finalizar esta compra?" description="A compra vai para o histórico e não poderá ser alterada." label="Confirmar finalização" busy={busy} onConfirm={async () => { if (await mutate("purchase.finalize", true, purchase.id, "Compra finalizada")) { setFinalize(false); router.push(`/history/${purchase.id}`); } }}>{(summary.pending > 0 || summary.noPriceRows > 0) && <div className="finalize-warning"><AlertTriangle size={18}/><div>{summary.pending > 0 && <p>{summary.pending} unidades ainda pendentes.</p>}{summary.noPriceRows > 0 && <p>{summary.noPriceUnits} unidades estão sem preço.</p>}<p>Você pode finalizar mesmo assim.</p></div></div>}</Confirm>
  {detail && <Surface sheet title={readonly ? "Item do histórico" : "Detalhes do item"} open onOpenChange={v => { if (!v) setDetail(null); }}><ProductCategoryMarker visualKey={detail.visualKey}/><div className="detail-heading"><h2>{detail.name}</h2><PlatformBadge platform={detail.platform}/></div><p className="muted">{detail.variant}</p><p className="detail-price">{formatMoney(subtotal(detail))}</p><p className="muted">{detail.quantity} × {formatMoney(detail.unitPriceCents)} · {data.members.find(m => m.id === detail.personId)?.name}</p><p className="muted">{detail.cartStatus === "added" ? "Adicionado ao carrinho" : "Pendente"}</p>{detail.notes && <div className="detail-notes"><h3>Notas</h3><p>{detail.notes}</p></div>}<div className="detail-actions"><OpenProduct url={detail.url}/>{!readonly && <Button variant="outline" onClick={() => { setEdit(detail); setDetail(null); }}><Pencil size={16}/>Editar item</Button>}</div>{readonly && <p className="readonly-notice"><LockKeyhole size={14}/>Registro somente leitura</p>}</Surface>}
  </>;
}
