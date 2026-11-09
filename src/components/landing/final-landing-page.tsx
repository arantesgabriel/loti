"use client";

import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  Bookmark,
  Calculator,
  Check,
  FileSpreadsheet,
  Headphones,
  Keyboard,
  Layers,
  Mouse,
  Package,
  Percent,
  Plus,
  Receipt,
  ShoppingBag,
  Sparkles,
  User,
  UsersRound,
} from "lucide-react";
import styles from "./final-landing.module.css";

const DEMO_DRAG_ID = "loti-final-teclado";

const PURCHASE_STAGES = [
  {
    button: "01 / Escolher o favorito",
    cleanTitle: "Escolher o favorito",
    stepNumber: "01",
    shortLabel: "Favorito",
    nodeTitle: "Favorito salvo",
    nodeMeta: "Link + referência",
    nodeTime: "Marco 01",
    title: "Tudo começa por um favorito.",
    copy: "Guarde o item enquanto planeja o próximo envio.",
    icon: Bookmark,
    product: "Teclado mecânico",
    price: "¥ 169",
    result: "✓ Favorito salvo",
  },
  {
    button: "02 / Levar para a compra",
    cleanTitle: "Levar para a compra",
    stepNumber: "02",
    shortLabel: "Compra",
    nodeTitle: "Na compra ativa",
    nodeMeta: "Grupo · 3 pessoas",
    nodeTime: "Marco 02",
    title: "Agora ele faz parte da compra.",
    copy: "Os escolhidos do grupo entram no mesmo pacote.",
    icon: ShoppingBag,
    product: "Teclado · Compra atual",
    price: "¥ 169",
    result: "✓ Item incluído na compra fictícia",
  },
  {
    button: "03 / Entender o custo",
    cleanTitle: "Entender o custo",
    stepNumber: "03",
    shortLabel: "Custos",
    nodeTitle: "Rateio fechado",
    nodeMeta: "Frete + taxas",
    nodeTime: "Marco 03",
    title: "Cada valor tem um contexto.",
    copy: "Veja o peso de frete e taxas em cada item.",
    icon: Receipt,
    product: "Custo estimado · Teclado",
    price: "R$ 228,60",
    result: "✓ Custo demonstrativo por item",
  },
] as const;

const RAIL_PILLARS = [
  {
    icon: Bookmark,
    title: "Favoritos organizados",
    mobileTitle: "Favoritos",
    detail: "Links em coleções",
  },
  {
    icon: UsersRound,
    title: "Compras individuais ou em grupo",
    mobileTitle: "Solo ou grupo",
    detail: "Solo ou com amigos",
  },
  {
    icon: Package,
    title: "Pacotes acompanhados",
    mobileTitle: "Pacotes",
    detail: "Do pedido ao envio",
  },
  {
    icon: Layers,
    title: "Custos e rateio claros",
    mobileTitle: "Custos claros",
    detail: "Divisão por pessoa",
  },
] as const;

const PLANNED_TOOLS = [
  {
    icon: Calculator,
    title: "Calculadora de custo final",
    description: "Estimativa completa antes de fechar.",
  },
  {
    icon: Percent,
    title: "Calculadora de impostos",
    description: "Simulação rápida de tributos.",
  },
  {
    icon: ArrowLeftRight,
    title: "Conversor de moedas",
    description: "Câmbio entre CNY, USD e BRL.",
  },
  {
    icon: UsersRound,
    title: "Calculadora de rateio",
    description: "Divisão proporcional no grupo.",
  },
] as const;

const COST_TARGETS = {
  products: 456.9,
  taxes: 82.4,
  freight: 64.8,
  total: 604.1,
  shares: [
    { initials: "GA", name: "Gabriel", percent: 44 },
    { initials: "CA", name: "Camila", percent: 33 },
    { initials: "MA", name: "Mariana", percent: 23 },
  ],
} as const;

function formatBrlAnimated(target: number, progress: number): string {
  const current = target * progress;
  return `R$ ${current.toFixed(2).replace(".", ",")}`;
}

function LotiLogo({
  className,
  iconSize = 26,
  showDot = false,
}: {
  className?: string;
  iconSize?: number;
  showDot?: boolean;
}) {
  return (
    <span className={`${styles.brandMark}${className ? ` ${className}` : ""}`}>
      <Bookmark
        className={styles.brandIcon}
        size={iconSize}
        fill="currentColor"
        strokeWidth={0}
        aria-hidden="true"
      />
      <span>Loti{showDot ? "." : ""}</span>
    </span>
  );
}

export function FinalLandingPage() {
  const rootRef = useRef<HTMLElement>(null);
  const purchasesRef = useRef<HTMLElement>(null);
  const costPanelRef = useRef<HTMLDivElement>(null);
  const [favoriteAdded, setFavoriteAdded] = useState(false);
  const [dropHover, setDropHover] = useState(false);
  const [activeStage, setActiveStage] = useState<0 | 1 | 2>(0);
  const [timelinePaused, setTimelinePaused] = useState(false);
  const [timelineInView, setTimelineInView] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [costProgress, setCostProgress] = useState(1);

  useEffect(() => {
    const updateScroll = () => {
      setIsScrolled(window.scrollY > 36);
    };
    updateScroll();
    window.addEventListener("scroll", updateScroll, { passive: true });
    return () => window.removeEventListener("scroll", updateScroll);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") {
      nodes.forEach((node) => {
        node.classList.remove(styles.revealPending);
        node.classList.add(styles.visible);
      });
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const revealAllImmediately = () => {
      nodes.forEach((node) => {
        node.classList.remove(styles.revealPending);
        node.classList.add(styles.visible);
      });
    };

    if (reducedMotion.matches) {
      revealAllImmediately();
      return;
    }

    const viewportThreshold = window.innerHeight * 0.88;
    nodes.forEach((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.top <= viewportThreshold) {
        node.classList.remove(styles.revealPending);
        node.classList.add(styles.visible);
      } else {
        node.classList.remove(styles.visible);
        node.classList.add(styles.revealPending);
      }
    });

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.remove(styles.revealPending);
            entry.target.classList.add(styles.visible);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -24px 0px" }
    );

    nodes.forEach((node) => {
      if (node.classList.contains(styles.revealPending)) {
        observer.observe(node);
      }
    });

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const pendingAncestor = target.closest<HTMLElement>("[data-reveal]");
      if (pendingAncestor) {
        pendingAncestor.classList.remove(styles.revealPending);
        pendingAncestor.classList.add(styles.visible);
        observer.unobserve(pendingAncestor);
      }
    };

    const handleMotionChange = () => {
      if (reducedMotion.matches) {
        revealAllImmediately();
        observer.disconnect();
      }
    };

    root.addEventListener("focusin", handleFocusIn);
    reducedMotion.addEventListener("change", handleMotionChange);
    return () => {
      observer.disconnect();
      root.removeEventListener("focusin", handleFocusIn);
      reducedMotion.removeEventListener("change", handleMotionChange);
    };
  }, []);

  // Auto-advancing Timeline in Motion for Section 3 (#d-purchases) when visible and not manually locked
  useEffect(() => {
    const sectionEl = purchasesRef.current;
    if (!sectionEl || typeof window === "undefined" || typeof IntersectionObserver === "undefined") {
      return;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setTimelineInView(entry.isIntersecting);
        }
      },
      { threshold: 0.45 }
    );

    observer.observe(sectionEl);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!timelineInView || timelinePaused || typeof window === "undefined") return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;

    const timer = window.setInterval(() => {
      setActiveStage((prev) => ((prev + 1) % 3) as 0 | 1 | 2);
    }, 3600);

    return () => window.clearInterval(timer);
  }, [timelineInView, timelinePaused]);

  // Fill animation for Cost Summary Card (monetary values + progress bars + percentages in lockstep)
  useEffect(() => {
    const panel = costPanelRef.current;
    if (!panel || typeof window === "undefined" || typeof IntersectionObserver === "undefined") {
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) {
      panel.dataset.costFill = "active";
      return;
    }

    panel.dataset.costFill = "pending";
    let rafId = 0;
    let initRafId = 0;
    let isAnimating = false;

    const startFillAnimation = () => {
      if (isAnimating) return;
      isAnimating = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      panel.dataset.costFill = "active";
      const durationMs = 2200;
      const startTime = performance.now();

      const tick = (now: number) => {
        if (reducedMotion.matches) {
          setCostProgress(1);
          return;
        }
        const elapsed = now - startTime;
        const t = Math.min(1, Math.max(0, elapsed / durationMs));
        setCostProgress(t);
        if (t < 1) {
          rafId = window.requestAnimationFrame(tick);
        } else {
          setCostProgress(1);
        }
      };

      setCostProgress(0);
      rafId = window.requestAnimationFrame(tick);
    };

    initRafId = window.requestAnimationFrame(() => {
      if (!isAnimating && !reducedMotion.matches) {
        setCostProgress(0);
      }
    });

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.28) {
            startFillAnimation();
          } else if (!entry.isIntersecting) {
            if (rafId) window.cancelAnimationFrame(rafId);
            isAnimating = false;
            panel.dataset.costFill = "pending";
            setCostProgress(0);
          }
        }
      },
      { threshold: [0, 0.28, 0.5] }
    );

    observer.observe(panel);

    const handleMotionChange = () => {
      if (reducedMotion.matches) {
        if (rafId) window.cancelAnimationFrame(rafId);
        if (initRafId) window.cancelAnimationFrame(initRafId);
        panel.dataset.costFill = "active";
        setCostProgress(1);
        observer.disconnect();
      }
    };

    reducedMotion.addEventListener("change", handleMotionChange);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      if (initRafId) window.cancelAnimationFrame(initRafId);
      observer.disconnect();
      reducedMotion.removeEventListener("change", handleMotionChange);
    };
  }, []);

  function handleSkipLinkClick(event: MouseEvent<HTMLAnchorElement>) {
    const mainEl = rootRef.current;
    if (!mainEl) return;
    event.preventDefault();
    mainEl.focus({ preventScroll: true });
    window.history.replaceState(null, "", "#variant-d");
  }

  function handleLogoClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: "auto" });
    window.history.replaceState(null, "", "#d-hero");
  }

  function addFavorite() {
    if (favoriteAdded) return;
    setFavoriteAdded(true);
  }

  function handleDragStart(event: DragEvent<HTMLButtonElement>) {
    event.dataTransfer.setData("text/plain", DEMO_DRAG_ID);
    event.dataTransfer.setData("application/x-loti-demo", DEMO_DRAG_ID);
    event.dataTransfer.effectAllowed = "copy";
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDropHover(true);
  }

  function handleDragLeave() {
    setDropHover(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDropHover(false);
    const payload =
      event.dataTransfer?.getData("application/x-loti-demo") ||
      event.dataTransfer?.getData("text/plain");
    if (payload !== DEMO_DRAG_ID) {
      return;
    }
    addFavorite();
  }

  function handleSelectStage(stageIndex: 0 | 1 | 2) {
    setTimelinePaused(true);
    setActiveStage(stageIndex);
  }

  const currentStage = PURCHASE_STAGES[activeStage];
  const StageIcon = currentStage.icon;
  const timelineFillPercent = activeStage === 0 ? 20 : activeStage === 1 ? 58 : 100;

  return (
    <div id="inicio" className={styles.root}>
      <a className={styles.skipLink} href="#variant-d" onClick={handleSkipLinkClick}>
        Pular para o conteúdo
      </a>

      <header
        className={`${styles.headerDock}${isScrolled ? ` ${styles.headerDockScrolled}` : ""}`}
        data-scrolled={isScrolled ? "true" : "false"}
      >
        <div className={styles.headerContainer}>
          <nav
            className={`${styles.siteNav} ${styles.finalNav}${isScrolled ? ` ${styles.navIsland}` : ""}`}
            aria-label="Navegação principal"
          >
            <a
              className={styles.logo}
              href="#d-hero"
              aria-label="Loti, voltar ao topo"
              onClick={handleLogoClick}
            >
              <LotiLogo iconSize={25} />
            </a>
            <div className={styles.navLinks}>
              <a href="#d-story">Como funciona</a>
              <a href="#d-tools">Ferramentas</a>
              <a href="#d-people">Para quem é</a>
            </div>
            <div className={styles.navRight}>
              <Link className={styles.navLogin} href="/login" prefetch={false}>
                Entrar
              </Link>
              <Link className={`${styles.btn} ${styles.btnDark} ${styles.navCta}`} href="/signup" prefetch={false}>
                Criar conta grátis
              </Link>
            </div>
          </nav>
        </div>
      </header>

      <main
        id="variant-d"
        ref={rootRef}
        className={styles.finalDirection}
        data-variant="d"
        tabIndex={-1}
      >
        <section className={`${styles.section} ${styles.finalHero}`} id="d-hero">
          <div className={styles.wrap}>
            <div className={styles.heroNavSpacer} aria-hidden="true" />

            <div className={styles.finalHeroMain}>
              <span className={styles.overline}>SUAS IMPORTAÇÕES, COM MAIS CLAREZA</span>
              <h1>
                Do favorito ao pacote.
                <br />
                <span className={styles.accent}>Tudo no lugar.</span>
              </h1>
              <p className={styles.subtitle}>
                Organize favoritos, compras e pacotes internacionais — sozinho ou em grupo.
              </p>
              <div className={styles.heroActions}>
                <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/signup" prefetch={false}>
                  Criar conta grátis
                </Link>
                <a className={styles.textLink} href="#d-story">
                  Descobrir o Loti
                </a>
              </div>
            </div>

            <div className={styles.finalScene} aria-label="Objetos de importação se organizam em três caixas estilizadas">
              <svg
                viewBox="0 0 1070 380"
                role="img"
                aria-label="Três embalagens com aparência tridimensional, ligadas por um caminho suave"
              >
                <defs>
                  <linearGradient id="d-a" x1="0" y1="0" x2="1" y2="1">
                    <stop stopColor="#FF9C54" />
                    <stop offset="1" stopColor="#F77014" />
                  </linearGradient>
                  <linearGradient id="d-b" x1="0" y1="0" x2="1" y2="1">
                    <stop stopColor="#F8D0A2" />
                    <stop offset="1" stopColor="#E7AC80" />
                  </linearGradient>
                </defs>
                <path
                  className={styles.scenePath}
                  d="M155 260 C294 173 343 308 501 236 S785 238 926 178"
                  fill="none"
                  stroke="#EA9471"
                  strokeWidth="2.5"
                  strokeDasharray="7 12"
                  opacity=".64"
                />
                <ellipse cx="540" cy="343" rx="280" ry="24" fill="#2D1022" opacity=".09" />
                <g className={styles.sceneBoxLeft}>
                  <g transform="translate(105 145) rotate(-7 112 100)">
                    <path d="M17 72 117 17 218 75 117 134Z" fill="#F8D5B4" />
                    <path d="M17 72 117 134 117 238 17 182Z" fill="#EAA775" />
                    <path d="M117 134 218 75 218 181 117 238Z" fill="#D98C57" />
                    <path d="M86 34 190 94 162 110 59 49Z" fill="#FFF3E6" />
                    <rect x="49" y="137" width="43" height="35" rx="2" fill="#FFF9F4" transform="skewY(27)" />
                  </g>
                </g>
                <g className={styles.sceneBoxCenter}>
                  <g transform="translate(355 31)">
                    <path d="M27 153 187 61 355 151 190 245Z" fill="#FFD3AA" />
                    <path d="M27 153 190 245 190 353 27 260Z" fill="url(#d-a)" />
                    <path d="M190 245 355 151 355 260 190 353Z" fill="#DC4A0C" />
                    <path d="M126 96 285 185 254 204 93 115Z" fill="#FFF6E9" />
                    <path d="M93 115 254 204 254 238 93 149Z" fill="#F8DFC9" />
                    <path d="M72 224 141 263 141 310 72 271Z" fill="#FFF9F4" />
                    <path d="M86 245 126 267" stroke="#775852" strokeWidth="3.5" opacity=".52" strokeLinecap="round" />
                    <path d="M86 260 116 278" stroke="#775852" strokeWidth="3" opacity=".25" strokeLinecap="round" />
                  </g>
                </g>
                <g className={styles.sceneBoxRight}>
                  <g transform="translate(799 168) rotate(9 86 86)">
                    <path d="M10 54 90 9 174 55 92 102Z" fill="#F3DAE2" />
                    <path d="M10 54 92 102 92 190 10 144Z" fill="#E6A3B4" />
                    <path d="M92 102 174 55 174 142 92 190Z" fill="#BC738A" />
                    <path d="M64 22 147 69 126 81 43 34Z" fill="#FFF9F4" />
                  </g>
                </g>
                <circle className={styles.sceneOrbA} cx="284" cy="98" r="8" fill="#F77014" opacity=".45" />
                <circle className={styles.sceneOrbB} cx="842" cy="86" r="12" fill="#E5A9B8" opacity=".47" />
              </svg>
            </div>
          </div>
        </section>

        <section className={styles.finalRail} id="d-rail" aria-label="Pilares da organização no Loti">
          <div className={styles.wrap}>
            <div className={styles.railHighlights} role="list">
              {RAIL_PILLARS.map((pillar, idx) => {
                const Icon = pillar.icon;
                return (
                  <div
                    key={pillar.title}
                    className={styles.railChip}
                    role="listitem"
                  >
                    <span
                      className={styles.railIconBox}
                      style={{ animationDelay: `${idx * 1.4}s` }}
                      aria-hidden="true"
                    >
                      <Icon size={16} strokeWidth={2.1} />
                    </span>
                    <div className={styles.railCopy}>
                      <strong className={styles.railTitleFull}>{pillar.title}</strong>
                      <strong className={styles.railTitleCompact}>{pillar.mobileTitle}</strong>
                      <span>{pillar.detail}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="d-story" className={`${styles.section} ${styles.sectionPad} ${styles.finalStory}`}>
          <div className={styles.wrap}>
            <div className={styles.storyLead}>
              <div className={styles.reveal} data-reveal="">
                <span className={styles.overline}>01 / O JEITO LOTI DE IMPORTAR</span>
                <h2 className={styles.storyLine}>
                  Um caminho
                  <br />
                  mais <span className={styles.accent}>simples.</span>
                </h2>
              </div>
              <p className={`${styles.storyIntro} ${styles.reveal} ${styles.d1}`} data-reveal="">
                Cada etapa no seu lugar — sem depender de planilhas soltas.
              </p>
            </div>
            <div className={styles.storyGrid}>
              <article className={`${styles.storyCard} ${styles.reveal}`} data-reveal="">
                <div className={styles.storyCardHead}>
                  <span className={styles.storyNumber}>01 · DESCUBRA</span>
                  <span className={styles.storySymbol} aria-hidden="true">
                    <Bookmark size={18} strokeWidth={2.1} />
                  </span>
                </div>
                <h3>Encontrou? Salve.</h3>
                <p>Links e referências prontos para consultar.</p>
              </article>
              <article className={`${styles.storyCard} ${styles.reveal} ${styles.d1}`} data-reveal="">
                <div className={styles.storyCardHead}>
                  <span className={styles.storyNumber}>02 · ORGANIZE</span>
                  <span className={styles.storySymbol} aria-hidden="true">
                    <Layers size={18} strokeWidth={2.1} />
                  </span>
                </div>
                <h3>Escolheu? Separe.</h3>
                <p>Itens organizados por compra e participante.</p>
              </article>
              <article className={`${styles.storyCard} ${styles.reveal} ${styles.d2}`} data-reveal="">
                <div className={styles.storyCardHead}>
                  <span className={styles.storyNumber}>03 · ACOMPANHE</span>
                  <span className={styles.storySymbol} aria-hidden="true">
                    <Package size={18} strokeWidth={2.1} />
                  </span>
                </div>
                <h3>Comprou? Entenda.</h3>
                <p>Pacotes, taxas e rateio em uma visão limpa.</p>
              </article>
            </div>
          </div>
        </section>

        <section id="d-favorites" className={`${styles.section} ${styles.sectionPad} ${styles.finalFavorites}`}>
          <div className={`${styles.wrap} ${styles.split}`}>
            <div className={styles.reveal} data-reveal="">
              <span className={styles.overline}>02 / FAVORITOS</span>
              <h2 className={styles.sectionTitle}>
                Seu próximo achado
                <br />
                <span className={styles.accent}>tem lugar certo.</span>
              </h2>
              <p className={styles.sectionCopy}>
                Guarde links e preços de referência para reencontrar quando for comprar.
              </p>
              <button
                type="button"
                className={`${styles.finalDemoSource}${favoriteAdded ? ` ${styles.finalDemoSourceAdded}` : ""}`}
                id="d-drag-source"
                draggable={!favoriteAdded}
                aria-pressed={favoriteAdded}
                aria-label={
                  favoriteAdded
                    ? "Teclado fictício já adicionado à demonstração"
                    : "Adicionar teclado fictício aos favoritos"
                }
                onClick={addFavorite}
                onDragStart={handleDragStart}
              >
                <span className={styles.thumb} aria-hidden="true">
                  <Keyboard size={20} strokeWidth={2} />
                </span>
                <span className={styles.demoSourceBody}>
                  <b>Teclado mecânico</b>
                  <small>
                    {favoriteAdded
                      ? "✓ Salvo na demonstração"
                      : "Periféricos · HubBuy"}
                  </small>
                </span>
                <span className={styles.demoSourcePrice}>¥ 169</span>
                <span
                  className={`${styles.plusCircle}${favoriteAdded ? ` ${styles.plusCircleAdded}` : ""}`}
                  aria-hidden="true"
                >
                  {favoriteAdded ? <Check size={17} strokeWidth={2.6} /> : <Plus size={17} strokeWidth={2.6} />}
                </span>
              </button>
              <p className={`${styles.muted} ${styles.demoHint}`}>
                {favoriteAdded
                  ? "✓ Produto incluído no painel."
                  : "Toque no cartão ou arraste para testar."}
              </p>
            </div>

            <div className={`${styles.demoShell} ${styles.reveal} ${styles.d1}`} data-reveal="">
              <div className={styles.demoTop}>
                <b className={styles.demoBrandHeader}>
                  <LotiLogo iconSize={19} />{" "}
                  <span className={styles.demoSubPath}>/ Favoritos</span>
                </b>
                <span className={styles.quietDemoTag}>Simulação</span>
              </div>
              <div className={styles.demoFilterStrip} aria-hidden="true">
                <span>Coleção: Periféricos</span>
                <span>{favoriteAdded ? "4 itens" : "3 itens"}</span>
              </div>
              <div
                className={`${styles.dropTarget}${dropHover ? ` ${styles.dropTargetHover}` : ""}${
                  favoriteAdded ? ` ${styles.dropTargetAdded}` : ""
                }`}
                id="d-drop-target"
                aria-live="polite"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {favoriteAdded
                  ? "✓ Teclado adicionado aos seus favoritos!"
                  : "+ Solte aqui para salvar um favorito"}
              </div>
              <div className={styles.favsGrid}>
                <div
                  className={`${styles.favTile} ${styles.favTileInserted}`}
                  id="d-new-fav"
                  style={{ display: favoriteAdded ? "flex" : "none" }}
                >
                  <span className={styles.thumb} aria-hidden="true">
                    <Keyboard size={19} strokeWidth={2} />
                  </span>
                  <div className={styles.favTileBody}>
                    <b>Teclado mecânico</b>
                    <small>Você · HubBuy</small>
                  </div>
                  <em className={styles.favTilePrice}>¥ 169</em>
                </div>
                <div className={styles.favTile}>
                  <span className={styles.thumb} aria-hidden="true">
                    <Headphones size={19} strokeWidth={2} />
                  </span>
                  <div className={styles.favTileBody}>
                    <b>Fone Bluetooth</b>
                    <small>Camila · HubBuy</small>
                  </div>
                  <em className={styles.favTilePrice}>¥ 89</em>
                </div>
                <div
                  className={`${styles.favTile}${
                    favoriteAdded ? ` ${styles.favTileMobileReplaced}` : ""
                  }`}
                >
                  <span className={`${styles.thumb} ${styles.thumbMint}`} aria-hidden="true">
                    <Mouse size={19} strokeWidth={2} />
                  </span>
                  <div className={styles.favTileBody}>
                    <b>Mouse sem fio</b>
                    <small>Gabriel · Goofish</small>
                  </div>
                  <em className={styles.favTilePrice}>¥ 45</em>
                </div>
                <div
                  className={`${styles.favTile} ${styles.favTileSecondary}${
                    favoriteAdded ? ` ${styles.favTileReplacedOnAdd}` : ""
                  }`}
                >
                  <span className={`${styles.thumb} ${styles.thumbRose}`} aria-hidden="true">
                    <Sparkles size={19} strokeWidth={2} />
                  </span>
                  <div className={styles.favTileBody}>
                    <b>Tênis de corrida</b>
                    <small>Mariana · HubBuy</small>
                  </div>
                  <em className={styles.favTilePrice}>¥ 129</em>
                </div>
              </div>
              <p className={styles.demoFootnote}>
                Exemplo visual fictício.
              </p>
            </div>
          </div>
        </section>

        <section
          id="d-purchases"
          ref={purchasesRef}
          className={`${styles.section} ${styles.sectionPad} ${styles.finalBuy}`}
        >
          <div className={styles.wrap}>
            <div className={`${styles.buyHeader} ${styles.reveal}`} data-reveal="">
              <div>
                <span className={`${styles.overline} ${styles.overlineLight}`}>
                  03 / COMPRA ATUAL
                </span>
                <h2 className={styles.sectionTitle}>
                  Da ideia à compra.
                  <br />
                  <span className={styles.accentPeach}>Linha do tempo em movimento.</span>
                </h2>
              </div>
              <p className={styles.sectionCopy}>
                Veja o item percorrer cada marco da linha do tempo, do favorito ao fechamento.
              </p>
            </div>

            <div
              className={`${styles.timelineStage} ${styles.reveal} ${styles.d1}`}
              data-reveal=""
              onMouseEnter={() => setTimelinePaused(true)}
              onMouseLeave={() => setTimelinePaused(false)}
            >
              {/* Clean Horizontal Timeline Axis */}
              <div className={styles.timelineAxis} aria-hidden="true">
                <span
                  className={styles.timelineAxisFill}
                  style={{ width: `${timelineFillPercent}%` }}
                />
              </div>

              {/* 3 Interactive Timeline Milestones */}
              <div className={styles.cJourneyTabs} role="group" aria-label="Etapas da demonstração de compras">
                {PURCHASE_STAGES.map((stage, index) => {
                  const stageIndex = index as 0 | 1 | 2;
                  const NodeIcon = stage.icon;
                  const isActive = activeStage === stageIndex;
                  const isPassed = stageIndex < activeStage;
                  return (
                    <button
                      key={stage.button}
                      type="button"
                      className={`${styles.cJourneyTab}${isActive ? ` ${styles.cJourneyTabActive}` : ""}`}
                      data-d-stage={stageIndex}
                      aria-label={stage.button}
                      aria-pressed={isActive}
                      onClick={() => handleSelectStage(stageIndex)}
                    >
                      <div className={styles.timelineMilestoneTop}>
                        <span className={styles.timelineMilestoneDot} aria-hidden="true">
                          <NodeIcon size={15} strokeWidth={2} />
                        </span>
                        <span className={styles.timelineMilestoneIndex}>Etapa {stage.stepNumber}</span>
                        <span className={styles.timelineMilestonePrice}>{stage.price}</span>
                      </div>
                      <span className={styles.tabLabelFull}>{stage.cleanTitle}</span>
                      <span className={styles.tabLabelCompact}>
                        <small>{stage.stepNumber}</small>
                        <strong>{stage.shortLabel}</strong>
                      </span>
                      <span className={styles.timelineMilestoneBar} aria-hidden="true">
                        <i
                          className={`${styles.timelineMilestoneBarFill}${
                            isActive ? ` ${styles.timelineMilestoneBarActive}` : ""
                          }${isPassed ? ` ${styles.timelineMilestoneBarDone}` : ""}`}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Clean Minimalist Live Status Dock */}
              <div className={styles.timelineLiveDock} aria-live="polite">
                <div className={styles.timelineLiveMeta}>
                  <div className={styles.timelineTopBar}>
                    <span className={styles.timelineStepIndicator}>
                      <i className={styles.timelinePulseDot} aria-hidden="true" />
                      {currentStage.nodeTime}
                    </span>
                    <span className={styles.timelineMetaSep} aria-hidden="true">·</span>
                    <span className={styles.timelineDemoLabel}>
                      Simulação com dados fictícios
                    </span>
                  </div>
                  <h3 id="d-stage-title" className={styles.stageTitle}>
                    {currentStage.title}
                  </h3>
                  <p id="d-stage-copy" className={styles.stageCopy}>
                    {currentStage.copy}
                  </p>
                </div>

                <div className={styles.timelineLiveReadout}>
                  <div className={styles.timelineCheckpointRow}>
                    <div className={styles.timelineCheckpointItem}>
                      <span
                        id="d-stage-symbol"
                        className={styles.stageSymbol}
                        aria-hidden="true"
                      >
                        <StageIcon size={18} strokeWidth={2} />
                      </span>
                      <div className={styles.cObjectMeta}>
                        <strong id="d-stage-product">{currentStage.product}</strong>
                        <span id="d-stage-result" className={styles.stageResult}>
                          {currentStage.result}
                        </span>
                      </div>
                    </div>
                    <strong id="d-stage-price" className={styles.stagePrice}>
                      {currentStage.price}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="d-cost" className={`${styles.section} ${styles.sectionPad} ${styles.finalCost}`}>
          <div className={`${styles.wrap} ${styles.split}`}>
            <div className={styles.reveal} data-reveal="">
              <span className={styles.overline}>04 / PACOTES E CUSTOS</span>
              <h2 className={styles.sectionTitle}>
                Ninguém gosta de
                <br />
                <span className={styles.accent}>valor perdido.</span>
              </h2>
              <p className={styles.sectionCopy}>
                Visualize produtos, taxas, frete e a participação exata de cada pessoa.
              </p>
              <p className={styles.quietDisclaimer}>Exemplo ilustrativo com dados fictícios.</p>
            </div>
            <div
              ref={costPanelRef}
              className={`${styles.costRows} ${styles.reveal} ${styles.d1}`}
              data-reveal=""
            >
              {(() => {
                const easedMain = 1 - Math.pow(1 - costProgress, 3);
                return (
                  <>
                    <div className={styles.costHeader}>
                      <div>
                        <small className={styles.overline}>RESUMO DA IMPORTAÇÃO</small>
                        <h3 className={styles.costPackageTitle}>Pacote demonstrativo</h3>
                      </div>
                      <span className={styles.costPackageIcon} aria-hidden="true">
                        <Package size={20} strokeWidth={2.1} />
                      </span>
                    </div>
                    <div className={styles.row}>
                      <span>Produtos</span>
                      <b>{formatBrlAnimated(COST_TARGETS.products, easedMain)}</b>
                    </div>
                    <div className={styles.row}>
                      <span>Taxas adicionais</span>
                      <b>{formatBrlAnimated(COST_TARGETS.taxes, easedMain)}</b>
                    </div>
                    <div className={styles.row}>
                      <span>Frete</span>
                      <b>{formatBrlAnimated(COST_TARGETS.freight, easedMain)}</b>
                    </div>
                    <div className={`${styles.row} ${styles.totalRow}`}>
                      <span
                        className={styles.totalRowFill}
                        style={{ width: `${(easedMain * 100).toFixed(2)}%` }}
                        aria-hidden="true"
                      />
                      <strong>Total ilustrativo</strong>
                      <strong className={styles.total}>
                        {formatBrlAnimated(COST_TARGETS.total, easedMain)}
                      </strong>
                    </div>
                    <h3 className={styles.personHeading}>Participação por pessoa</h3>
                    {COST_TARGETS.shares.map((share, idx) => {
                      const stagger = idx * 0.14;
                      const localT =
                        costProgress >= 1
                          ? 1
                          : Math.max(0, Math.min(1, (costProgress - stagger) / (1 - stagger)));
                      const easedPerson = 1 - Math.pow(1 - localT, 3);
                      const animatedPercent = Math.round(share.percent * easedPerson);
                      const animatedWidth = (share.percent * easedPerson).toFixed(2);
                      return (
                        <div key={share.name} className={styles.person}>
                          <span className={styles.avatar}>{share.initials}</span>
                          <span className={styles.personName}>{share.name}</span>
                          <span className={styles.personBar}>
                            <i
                              className={styles.personBarFill}
                              style={{ width: `${animatedWidth}%` }}
                            />
                          </span>
                          <b className={styles.personPercent}>{animatedPercent}%</b>
                        </div>
                      );
                    })}
                    <p className={styles.costFootnote}>
                      Valores ilustrativos para visualização.
                    </p>
                  </>
                );
              })()}
            </div>
          </div>
        </section>

        <section id="d-people" className={`${styles.section} ${styles.sectionPad} ${styles.finalPeople}`}>
          <div className={styles.wrap}>
            <div className={styles.peopleHeader}>
              <div className={styles.reveal} data-reveal="">
                <span className={styles.overline}>05 / SEU JEITO DE IMPORTAR</span>
                <h2 className={styles.sectionTitle}>
                  Seu espaço.{" "}
                  <span className={styles.accent}>Ou o de vocês.</span>
                </h2>
              </div>
              <p className={`${styles.sectionCopy} ${styles.peopleCopy} ${styles.reveal} ${styles.d1}`} data-reveal="">
                A mesma clareza para quem importa sozinho ou divide compras.
              </p>
            </div>
            <div className={styles.peopleGrid}>
              <article
                className={`${styles.peopleCard} ${styles.peopleCardLight} ${styles.reveal}`}
                data-reveal=""
                data-use-case="individual"
              >
                <div className={styles.peopleCardTop}>
                  <span className={styles.peopleMark} aria-hidden="true">
                    <User size={19} strokeWidth={2.1} />
                  </span>
                  <span className={styles.peopleTag}>Você no controle</span>
                </div>
                <div className={styles.peopleCardBody}>
                  <h3>Organize sozinho</h3>
                  <p>
                    Favoritos, compras e pacotes reunidos no seu espaço.
                  </p>
                </div>
                <div className={styles.peopleVisualStrip} aria-hidden="true">
                  <span className={styles.peopleStripPill}>Favoritos</span>
                  <span className={styles.peopleStripArrow}>→</span>
                  <span className={styles.peopleStripPill}>Compra</span>
                  <span className={styles.peopleStripArrow}>→</span>
                  <span className={styles.peopleStripPill}>Pacote</span>
                </div>
              </article>
              <article
                className={`${styles.peopleCard} ${styles.peopleCardWine} ${styles.reveal} ${styles.d1}`}
                data-reveal=""
                data-use-case="group"
              >
                <div className={styles.peopleCardTop}>
                  <span className={styles.peopleMarkWine} aria-hidden="true">
                    <UsersRound size={19} strokeWidth={2.1} />
                  </span>
                  <span className={styles.peopleTagWine}>Juntos, sem confusão</span>
                </div>
                <div className={styles.peopleCardBody}>
                  <h3>Importe em grupo</h3>
                  <p>
                    Cada pessoa vê seus itens e sua parte nos custos.
                  </p>
                </div>
                <div className={styles.peopleVisualStripWine} aria-hidden="true">
                  <div className={styles.peopleAvatarGroup}>
                    <span>GA</span>
                    <span>CA</span>
                    <span>MA</span>
                  </div>
                  <span className={styles.peopleStripMeta}>Divisão proporcional por item</span>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="d-tools" className={`${styles.section} ${styles.sectionPad} ${styles.finalTools}`}>
          <div className={styles.wrap}>
            <div className={styles.toolsHeading}>
              <div className={styles.reveal} data-reveal="">
                <span className={`${styles.overline} ${styles.toolsOverline}`}>
                  06 / FERRAMENTAS PÚBLICAS
                </span>
                <h2 className={styles.sectionTitle}>
                  Mais clareza
                  <br />
                  <span className={styles.toolsAccent}>antes de comprar.</span>
                </h2>
              </div>
              <p className={`${styles.sectionCopy} ${styles.toolsCopy} ${styles.reveal} ${styles.d1}`} data-reveal="">
                Utilitários gratuitos planejados para apoiar suas decisões.
              </p>
            </div>
            <div className={styles.toolsMain}>
              <article className={`${styles.referenceCard} ${styles.reveal}`} data-reveal="">
                <span className={styles.quietToolBadge}>
                  <FileSpreadsheet size={13} strokeWidth={2} aria-hidden="true" />
                  EM BREVE · TABELA DE REFERÊNCIAS
                </span>
                <h3>
                  Um lugar para consultar referências por item.
                </h3>
                <p className={styles.referenceCopy}>
                  Faixas de declaração em USD organizadas por categoria.
                </p>
                <div className={styles.referencePreview} aria-label="Categorias planejadas para consulta de referência">
                  <div className={styles.referenceChip}>
                    <span>Teclado</span>
                    <strong>— USD</strong>
                  </div>
                  <div className={styles.referenceChip}>
                    <span>Fones</span>
                    <strong>— USD</strong>
                  </div>
                  <div className={styles.referenceChip}>
                    <span>Calçados</span>
                    <strong>— USD</strong>
                  </div>
                </div>
              </article>

              <div className={`${styles.toolsRight} ${styles.reveal} ${styles.d1}`} data-reveal="">
                <ul className={styles.toolsList} aria-label="Outras ferramentas planejadas">
                  {PLANNED_TOOLS.map((tool) => {
                    const ToolIcon = tool.icon;
                    return (
                      <li key={tool.title} className={styles.smallTool}>
                        <span className={styles.toolGlyph} aria-hidden="true">
                          <ToolIcon size={18} strokeWidth={2.1} />
                        </span>
                        <div className={styles.smallToolCopy}>
                          <h3>{tool.title}</h3>
                          <p>{tool.description}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="d-faq" className={`${styles.section} ${styles.sectionPad} ${styles.finalFaq}`}>
          <div className={`${styles.wrap} ${styles.faqGrid}`}>
            <div className={styles.reveal} data-reveal="">
              <span className={styles.overline}>07 / PERGUNTAS FREQUENTES</span>
              <h2 className={styles.sectionTitle}>
                O que você
                <br />
                <span className={styles.accent}>precisa saber.</span>
              </h2>
              <p className={styles.sectionCopy}>
                Respostas diretas sobre como o Loti funciona.
              </p>
            </div>
            <div className={`${styles.faqs} ${styles.reveal} ${styles.d1}`} data-reveal="">
              <details>
                <summary>O Loti é gratuito?</summary>
                <p>
                  Sim. Crie sua conta grátis para organizar favoritos, compras e pacotes.
                </p>
              </details>
              <details>
                <summary>Ele faz compras nos fornecedores?</summary>
                <p>
                  Não. O Loti organiza produtos, pacotes e custos — não intermedia pagamentos.
                </p>
              </details>
              <details>
                <summary>Posso usar com meus amigos?</summary>
                <p>
                  Sim. Você pode organizar compras individuais ou compartilhadas em grupo.
                </p>
              </details>
              <details>
                <summary>E as ferramentas gratuitas?</summary>
                <p>
                  Estão em planejamento e serão liberadas em breve, inclusive sem login.
                </p>
              </details>
            </div>
          </div>
        </section>

        <section id="d-ending" className={styles.finalEnding}>
          <div className={styles.wrap}>
            <span className={`${styles.overline} ${styles.overlineLight}`}>
              SEU PRÓXIMO PASSO
            </span>
            <h2>
              O mundo é enorme.
              <br />
              <span className={styles.accentPeach}>Sua importação cabe no Loti.</span>
            </h2>
            <p>Um lugar para cada favorito, compra e pacote.</p>
            <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/signup" prefetch={false}>
              Criar conta grátis
            </Link>
            <footer className={styles.siteFoot}>
              <span className={styles.footBrandLine}>
                <LotiLogo className={styles.footLogo} iconSize={19} /> • Do favorito ao pacote.
              </span>
              <span>Organização para compras internacionais</span>
            </footer>
          </div>
        </section>
      </main>
    </div>
  );
}
