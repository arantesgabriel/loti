"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Diamond, Check, Package, ShoppingCart } from "lucide-react";
import type { Experience, UsageIntent } from "@/lib/onboarding/contracts";
import { useGuidance } from "./onboarding-provider";

export const experiences = [["never", "Nunca importei"], ["sometimes", "Algumas vezes"], ["frequent", "Frequentemente"], ["expert", "Expert"]] as const;
export const intents = [["individual", "Sozinho"], ["group", "Em grupo"], ["both", "Ambos"], ["undecided", "Ainda não decidi"]] as const;
const cards = [
  { title: "Favoritos", Icon: Diamond, description: "Salve descobertas e encontre tudo de novo.", short: "Salve suas descobertas" },
  { title: "Compra atual", Icon: ShoppingCart, description: "Acompanhe itens, pedidos e movimentações.", short: "Acompanhe suas compras" },
  { title: "Pacotes", Icon: Package, description: "Organize envios, etapas e custos.", short: "Organize seus envios" },
];

export function ProfileQuestions({ experience, intent, onExperience, onIntent, className }: {
  experience: Experience; intent: UsageIntent; onExperience: (v: Experience) => void; onIntent: (v: UsageIntent) => void; className?: string;
}) {
  return <div className={"h3c-questions" + (className ? ` ${className}` : "")}>
    <fieldset role="radiogroup"><legend><span className="h3c-desktop">Qual é sua experiência com importação?</span><span className="h3c-mobile">Sua experiência</span></legend>
      <div className="h3c-chips">{experiences.map(([value, label]) => <label key={value} className="h3c-chip">
        <input type="radio" name="guidance-experience" value={value} checked={experience === value} onChange={() => onExperience(value)} />
        <span>{label}<Check size={14} aria-hidden="true" /></span>
      </label>)}</div>
    </fieldset>
    <fieldset role="radiogroup"><legend><span className="h3c-desktop">Como pretende usar o Loti?</span><span className="h3c-mobile">Como pretende usar?</span></legend>
      <div className="h3c-chips">{intents.map(([value, label]) => <label key={value} className="h3c-chip">
        <input type="radio" name="guidance-intent" value={value} checked={intent === value} onChange={() => onIntent(value)} />
        <span>{label}<Check size={14} aria-hidden="true" /></span>
      </label>)}</div>
    </fieldset>
  </div>;
}

export function H3CIntroduction() {
  const { state, pending, error, reload, command, close } = useGuidance();
  const [experience, setExperience] = useState<Experience>(state?.profile.experience ?? "unspecified");
  const [intent, setIntent] = useState<UsageIntent>(state?.profile.usageIntent ?? "unspecified");
  const [active, setActive] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null), deck = useRef<HTMLDivElement>(null), locked = useRef(false);
  const profileRevision = useRef(state?.profile.revision ?? 0);
  const previousCard = useRef(active);
  const card = cards[active], Icon = card.Icon;
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (previousCard.current === active || !deck.current) return;
    const direction = active > previousCard.current ? 1 : -1;
    previousCard.current = active;
    const cardElement = deck.current.querySelector<HTMLElement>(".h3c-card");
    if (!cardElement || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tokens = getComputedStyle(deck.current);
    const duration = parseFloat(tokens.getPropertyValue("--h3c-card"));
    const easing = tokens.getPropertyValue("--h3c-ease-move").trim();
    const animation = cardElement.animate([
      { transform: "translate(0,0)" },
      { transform: `translate(${direction * -3}px,-3px)`, offset: .4 },
      { transform: "translate(0,0)" },
    ], { duration, easing });
    return () => animation.cancel();
  }, [active]);
  useEffect(() => {
    const root = deck.current;
    if (!root) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const limited = connection?.saveData || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
    const update = () => { root.dataset.ambient = String(!reduce.matches && !limited && !document.hidden); };
    update(); reduce.addEventListener("change", update); document.addEventListener("visibilitychange", update);
    return () => { reduce.removeEventListener("change", update); document.removeEventListener("visibilitychange", update); };
  }, []);
  if (!state) return null;
  async function enter(withAnswers: boolean) {
    if (locked.current) return; locked.current = true;
    try {
      if (withAnswers && state && (experience !== state.profile.experience || intent !== state.profile.usageIntent))
        await command({ command: "profile.save", expectedRevision: profileRevision.current, patch: { experience, usageIntent: intent } });
      await close("complete", "/favorites");
    } catch {} finally { locked.current = false; }
  }
  async function leave(kind: "complete" | "skip" | "close", destination?: string) {
    if (locked.current) return; locked.current = true;
    try { await close(kind, destination); } catch {} finally { locked.current = false; }
  }
  return <main className="h3c" aria-label="Boas-vindas ao Loti">
    <section className="h3c-story" aria-label="Conheça seu espaço">
      <a className="h3c-brand" href="/favorites" onClick={e => { e.preventDefault(); void leave("close"); }} aria-label="Loti — fechar por agora"><span aria-hidden="true"/>Loti</a>
      <p className="h3c-eyebrow h3c-story-eyebrow">SEU ESPAÇO, SUAS IMPORTAÇÕES</p>
      <h1 ref={heading} tabIndex={-1}>Da bagunça <br className="h3c-desktop"/>à clareza.</h1>
      <p className="h3c-story-description"><span className="h3c-desktop">Favoritos, compras e pacotes organizados em um só lugar.</span><span className="h3c-mobile h3c-mobile-wide">Um lugar para favoritos, compras e custos.</span><span className="h3c-mobile-compact">Favoritos, compras e pacotes em um só lugar.</span></p>
      <p className="h3c-eyebrow h3c-art-label h3c-desktop">O QUE VOCÊ PODE ORGANIZAR</p>
      <div className="h3c-deck" ref={deck} aria-roledescription="carrossel" aria-label="O que você pode organizar">
        <div className="h3c-layer h3c-layer-back" aria-hidden="true" />
        <div className="h3c-layer h3c-layer-middle" aria-hidden="true" />
        <div className="h3c-card" data-card={active}>
          <div className="h3c-card-content" key={active} aria-live="polite" aria-atomic="true">
            <div className="h3c-card-heading"><span className="h3c-card-icon"><Icon aria-hidden="true" size={24}/></span><div><h2>{card.title}</h2><p className="h3c-mobile">{card.short}</p></div></div>
            <p className="h3c-card-description h3c-desktop">{card.description}</p>
            <div className="h3c-card-lines h3c-desktop" aria-hidden="true"><i/><i/><i/></div>
          </div>
        </div>
        <span className="h3c-card-pill h3c-pill-upper h3c-desktop" aria-hidden="true">{cards[(active + 1) % 3].title}</span>
        <span className="h3c-card-pill h3c-pill-lower h3c-desktop" aria-hidden="true">{cards[(active + 2) % 3].title}</span>
        <div className="h3c-deck-controls">
          <button type="button" className="h3c-prev" aria-label="Cartão anterior" disabled={active === 0} onClick={() => setActive(v => Math.max(0, v - 1))}><ArrowLeft size={17}/></button>
          <span className="h3c-counter h3c-desktop" aria-live="polite">0{active + 1} / 03 · {card.title}</span>
          <button type="button" className="h3c-next" aria-label="Próximo cartão" disabled={active === 2} onClick={() => setActive(v => Math.min(2, v + 1))}><ArrowRight size={17}/></button>
        </div>
        <div className="h3c-dots" aria-hidden="true">{cards.map((c, index) => <span key={c.title} data-active={active === index}/>)}</div>
      </div>
      <p className="h3c-story-footer h3c-desktop">Você pode pular esta etapa e começar direto.</p>
    </section>
    <button type="button" className="h3c-skip" aria-label="Pular introdução por agora" onClick={() => void leave("skip")} disabled={pending}><span className="h3c-desktop">Pular por agora</span><span className="h3c-mobile">Pular</span> ↗</button>
    <section className="h3c-form" aria-labelledby="h3c-form-title">
      <p className="h3c-eyebrow">PERSONALIZAÇÃO OPCIONAL</p>
      <>
        <h2 id="h3c-form-title" className="h3c-desktop">Seu Loti, do seu jeito.</h2>
        <p className="h3c-form-description h3c-desktop">Responda se quiser. As dicas ficam mais úteis para você.</p>
        <div className="h3c-form-divider h3c-desktop"/>
        <ProfileQuestions experience={experience} intent={intent} onExperience={setExperience} onIntent={setIntent}/>
        <p className="h3c-hint h3c-desktop">Não é preciso responder para entrar. Favoritos é o caminho sugerido; Compra atual também vale.</p>
        <div className="h3c-actions"><button className="h3c-primary" disabled={pending} onClick={() => void enter(true)}>Entrar no meu espaço</button>
          <button className="h3c-text h3c-desktop" disabled={pending} onClick={() => void enter(false)}>Entrar sem responder</button></div>
      </>
      {error && <div className="h3c-error" role="alert"><p>{error}</p><button className="h3c-text" onClick={() => void reload().then(next => {
        if (next) { setExperience(next.profile.experience); setIntent(next.profile.usageIntent); profileRevision.current = next.profile.revision; }
      })}>Recarregar estado confirmado</button></div>}
      <p className="h3c-form-footer"><span className="h3c-desktop">As escolhas podem ser alteradas mais tarde.</span><button className="h3c-text h3c-mobile" disabled={pending} onClick={() => void leave("skip")}>Você também pode pular</button><button className="h3c-close h3c-text" disabled={pending} onClick={() => void leave("close")}>Fechar por agora</button></p>
    </section>
  </main>;
}
