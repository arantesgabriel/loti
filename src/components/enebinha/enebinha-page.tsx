"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bookmark, Search, Share2, X } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import type { ThemePreference } from "@/lib/theme";
import {
  ENEBINHA_BRAND_REFERENCES,
  ENEBINHA_DISCLOSURES,
  ENEBINHA_DISPLAY_COUNTS,
  ENEBINHA_HUBBUY,
  ENEBINHA_MARQUEE_SUPPLIERS,
  ENEBINHA_MASCOT,
  ENEBINHA_SUPPLIER_CATEGORIES,
  ENEBINHA_VITRINE,
  filterCommunity,
  filterGuides,
  filterSupplierCategories,
  normalizeEnebinhaSearch,
} from "@/lib/enebinha/manifest";
import { SupplierMarquee } from "./supplier-marquee";
import styles from "./enebinha.module.css";

type CatalogTab = "fornecedores" | "guias" | "comunidade";

const INITIAL_CATEGORY_PREVIEW_LIMIT = 6;

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
  { value: "system", label: "Sistema" },
];

export function EnebinhaPage() {
  const { preference, setPreference } = useTheme();

  const [activeTab, setActiveTab] = useState<CatalogTab>("fornecedores");
  const [selectedCategory, setSelectedCategory] = useState<string | "all">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [expandAllCategories, setExpandAllCategories] = useState<boolean>(false);
  const [isMobileCategoriesOpen, setIsMobileCategoriesOpen] = useState<boolean>(false);
  const [isBrandsOpen, setIsBrandsOpen] = useState<boolean>(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const tabRefs = useRef<Record<CatalogTab, HTMLButtonElement | null>>({
    fornecedores: null,
    guias: null,
    comunidade: null,
  });

  const normalizedQuery = useMemo(() => normalizeEnebinhaSearch(searchQuery), [searchQuery]);
  const hasActiveSearch = searchQuery.trim().length > 0;

  const filteredSupplierCategories = useMemo(
    () =>
      filterSupplierCategories({
        categorySlug: selectedCategory,
        query: searchQuery,
      }),
    [selectedCategory, searchQuery]
  );

  const filteredSupplierCount = useMemo(
    () => filteredSupplierCategories.reduce((acc, cat) => acc + cat.entries.length, 0),
    [filteredSupplierCategories]
  );

  const showVitrineCard = useMemo(() => {
    if (selectedCategory !== "all") return false;
    if (!normalizedQuery) return true;
    return normalizeEnebinhaSearch(
      `${ENEBINHA_VITRINE.title} ${ENEBINHA_VITRINE.subtitle} outfitlit enebinha vitrine`
    ).includes(normalizedQuery);
  }, [selectedCategory, normalizedQuery]);

  const filteredGuides = useMemo(() => filterGuides(searchQuery), [searchQuery]);
  const filteredCommunity = useMemo(() => filterCommunity(searchQuery), [searchQuery]);

  const handleShare = async () => {
    const shareUrl =
      typeof window !== "undefined" ? window.location.href : "https://loti.app/enebinha";
    const shareData = {
      title: "ENEBINHA · Curadoria de importação | Loti",
      text: "Fornecedores, catálogos e guias para importar da China selecionados por @enebinha.",
      url: shareUrl,
    };

    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share(shareData);
        setShareFeedback("Compartilhado!");
      } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setShareFeedback("Link copiado!");
      } else {
        setShareFeedback("Link pronto para copiar");
      }
    } catch {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(shareUrl);
          setShareFeedback("Link copiado!");
        } catch {
          setShareFeedback(null);
        }
      }
    }

    window.setTimeout(() => {
      setShareFeedback(null);
    }, 3000);
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const order: CatalogTab[] = ["fornecedores", "guias", "comunidade"];
    const currentIndex = order.indexOf(activeTab);
    if (currentIndex === -1) return;

    let nextTab: CatalogTab | null = null;
    if (event.key === "ArrowRight") {
      nextTab = order[(currentIndex + 1) % order.length] ?? null;
    } else if (event.key === "ArrowLeft") {
      nextTab = order[(currentIndex - 1 + order.length) % order.length] ?? null;
    } else if (event.key === "Home") {
      nextTab = order[0] ?? null;
    } else if (event.key === "End") {
      nextTab = order[order.length - 1] ?? null;
    }

    if (nextTab) {
      event.preventDefault();
      setActiveTab(nextTab);
      tabRefs.current[nextTab]?.focus();
    }
  };

  const toggleCategoryExpansion = (slug: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [slug]: !prev[slug],
    }));
  };

  const isCategoryExpanded = (slug: string, entryCount: number) => {
    if (selectedCategory !== "all" || hasActiveSearch || expandAllCategories) {
      return true;
    }
    if (entryCount <= INITIAL_CATEGORY_PREVIEW_LIMIT) {
      return true;
    }
    return Boolean(expandedCategories[slug]);
  };
  return (
    <div className={styles.page} data-testid="enebinha-page">
      <header className={styles.headerWrap} data-testid="enebinha-header">
        <div className={`${styles.container} ${styles.headerInner}`}>
          <Link
            href="/landing"
            className={styles.brandLink}
            aria-label="Loti — Página inicial"
            data-testid="enebinha-loti-brand"
          >
            <span className={styles.brandMark}>
              <Bookmark className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            </span>
            <span>Loti</span>
          </Link>

          <div className={styles.headerActions}>
            <div
              className={styles.themeGroup}
              role="group"
              aria-label="Aparência da página"
              data-testid="enebinha-theme-group"
            >
              <span className={styles.themeGroupLabel}>Tema</span>
              {THEME_OPTIONS.map((opt) => {
                const active = preference === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPreference(opt.value)}
                    aria-pressed={active}
                    className={`${styles.themeBtn} ${
                      active ? styles.themeBtnActive : ""
                    }`}
                    data-testid={`enebinha-theme-${opt.value}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleShare}
              className={styles.headerActionBtn}
              aria-label="Compartilhar página ENEBINHA"
              data-testid="enebinha-share-btn"
            >
              <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Compartilhar</span>
              <span aria-hidden="true">↗</span>
            </button>

            {shareFeedback && (
              <span
                role="status"
                aria-live="polite"
                className={styles.shareStatus}
                data-testid="enebinha-share-feedback"
              >
                {shareFeedback}
              </span>
            )}

            <Link
              href="/landing"
              className={styles.headerActionBtn}
              data-testid="enebinha-loti-cta"
            >
              <span>Conhecer Loti</span>
              <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>
      </header>

      <main className={`${styles.container} ${styles.mainStack}`}>
        {/* Hero ENEBINHA */}
        <section
          className={styles.heroCard}
          aria-labelledby="enebinha-hero-title"
          data-testid="enebinha-hero"
        >
          <div className={styles.heroCopy}>
            <p className={styles.heroEyebrow}>CURADORIA DE IMPORTAÇÃO</p>
            <h1 id="enebinha-hero-title" className={styles.heroTitle}>
              ENEBINHA
            </h1>
            <p className={styles.heroDescription}>
              Fornecedores, catálogos e guias para importar da China — reunidos em um só lugar.
            </p>
            <p className={styles.heroAttributionPill}>
              Conteúdo selecionado por <strong>@enebinha</strong>
            </p>
          </div>

          <div className={styles.mascotFrame} data-testid="enebinha-mascot-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ENEBINHA_MASCOT.publicPath}
              alt={ENEBINHA_MASCOT.alt}
              width={ENEBINHA_MASCOT.width}
              height={ENEBINHA_MASCOT.height}
              className={styles.mascotImage}
              data-testid="enebinha-mascot-img"
            />
          </div>
        </section>

        {/* D7 — Faixa animada horizontal de fornecedores com logos/avatares */}
        <SupplierMarquee suppliers={ENEBINHA_MARQUEE_SUPPLIERS} />

        {/* Ação principal — Cadastro HubBuy */}
        <section
          aria-labelledby="enebinha-hubbuy-title"
          className={styles.hubbuyCard}
          data-testid="enebinha-hubbuy-card"
        >
          <div className={styles.hubbuyCopy}>
            <h2 id="enebinha-hubbuy-title" className={styles.hubbuyTitle}>
              {ENEBINHA_HUBBUY.headline}
            </h2>
            <p className={`${styles.hubbuySubtitle} ${styles.hubbuySubtitleDesktop}`}>
              {ENEBINHA_HUBBUY.subtitleDesktop}
            </p>
            <p className={`${styles.hubbuySubtitle} ${styles.hubbuySubtitleMobile}`}>
              {ENEBINHA_HUBBUY.subtitleMobile}
            </p>
          </div>

          <a
            href={ENEBINHA_HUBBUY.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.hubbuyCta}
            data-testid="enebinha-hubbuy-cta"
          >
            <span>{ENEBINHA_HUBBUY.ctaLabel}</span>
            <span aria-hidden="true">↗</span>
          </a>
        </section>

        {/* Explore os links */}
        <section
          aria-labelledby="enebinha-catalog-title"
          className={styles.catalogCard}
          data-testid="enebinha-catalog"
        >
          <div className={styles.catalogHeader}>
            <h2 id="enebinha-catalog-title" className={styles.catalogTitle}>
              Explore os links
            </h2>
            <p className={styles.catalogMeta} data-testid="enebinha-catalog-meta">
              {ENEBINHA_DISPLAY_COUNTS.supplierEntries} fornecedores ·{" "}
              {ENEBINHA_DISPLAY_COUNTS.storefrontsIdentifiedWithinCatalog} lojas e vitrines
            </p>
          </div>

          <div className={styles.toolbarRow}>
            <div
              role="tablist"
              aria-label="Seções da curadoria"
              className={styles.tabList}
              onKeyDown={handleTabKeyDown}
            >
              <button
                ref={(el) => {
                  tabRefs.current.fornecedores = el;
                }}
                id="tab-fornecedores"
                role="tab"
                type="button"
                aria-selected={activeTab === "fornecedores"}
                aria-controls="panel-fornecedores"
                tabIndex={activeTab === "fornecedores" ? 0 : -1}
                onClick={() => setActiveTab("fornecedores")}
                className={`${styles.tabButton} ${
                  activeTab === "fornecedores" ? styles.tabButtonActive : ""
                }`}
                data-testid="tab-fornecedores"
              >
                Fornecedores ({ENEBINHA_DISPLAY_COUNTS.supplierEntries})
              </button>

              <button
                ref={(el) => {
                  tabRefs.current.guias = el;
                }}
                id="tab-guias"
                role="tab"
                type="button"
                aria-selected={activeTab === "guias"}
                aria-controls="panel-guias"
                tabIndex={activeTab === "guias" ? 0 : -1}
                onClick={() => setActiveTab("guias")}
                className={`${styles.tabButton} ${
                  activeTab === "guias" ? styles.tabButtonActive : ""
                }`}
                data-testid="tab-guias"
              >
                Guias ({ENEBINHA_DISPLAY_COUNTS.guides})
              </button>

              <button
                ref={(el) => {
                  tabRefs.current.comunidade = el;
                }}
                id="tab-comunidade"
                role="tab"
                type="button"
                aria-selected={activeTab === "comunidade"}
                aria-controls="panel-comunidade"
                tabIndex={activeTab === "comunidade" ? 0 : -1}
                onClick={() => setActiveTab("comunidade")}
                className={`${styles.tabButton} ${
                  activeTab === "comunidade" ? styles.tabButtonActive : ""
                }`}
                data-testid="tab-comunidade"
              >
                Comunidade ({ENEBINHA_DISPLAY_COUNTS.community})
              </button>
            </div>

            <div className={styles.searchWrap}>
              <Search className={styles.searchIcon} aria-hidden="true" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={
                  activeTab === "fornecedores"
                    ? "Buscar fornecedor, produto ou categoria..."
                    : activeTab === "guias"
                    ? "Buscar guia ou tutorial..."
                    : "Buscar canal da comunidade..."
                }
                aria-label="Buscar links na curadoria"
                className={styles.searchInput}
                data-testid="enebinha-search-input"
              />
              {hasActiveSearch && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className={styles.clearSearchBtn}
                  aria-label="Limpar busca"
                  data-testid="enebinha-search-clear"
                >
                  Limpar ×
                </button>
              )}
            </div>
          </div>
          {/* Painel: Fornecedores (73) */}
          {activeTab === "fornecedores" && (
            <div
              id="panel-fornecedores"
              role="tabpanel"
              aria-labelledby="tab-fornecedores"
              data-testid="panel-fornecedores"
            >
              {/* Mobile Quick Category Pills + Mais + */}
              <div
                className={styles.mobileCategoryBar}
                aria-label="Filtro rápido de categorias"
                data-testid="mobile-category-bar"
              >
                <button
                  type="button"
                  onClick={() => setSelectedCategory("all")}
                  className={`${styles.mobilePillBtn} ${
                    selectedCategory === "all" ? styles.mobilePillBtnActive : ""
                  }`}
                >
                  Todos ({ENEBINHA_DISPLAY_COUNTS.supplierEntries})
                </button>
                {ENEBINHA_SUPPLIER_CATEGORIES.slice(0, 2).map((cat) => (
                  <button
                    key={cat.slug}
                    type="button"
                    onClick={() => setSelectedCategory(cat.slug)}
                    className={`${styles.mobilePillBtn} ${
                      selectedCategory === cat.slug ? styles.mobilePillBtnActive : ""
                    }`}
                  >
                    {cat.shortLabel}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setIsMobileCategoriesOpen(true)}
                  aria-expanded={isMobileCategoriesOpen}
                  aria-controls="mobile-categories-sheet"
                  className={`${styles.mobilePillBtn} ${
                    selectedCategory !== "all" &&
                    !ENEBINHA_SUPPLIER_CATEGORIES.slice(0, 2).some(
                      (c) => c.slug === selectedCategory
                    )
                      ? styles.mobilePillBtnActive
                      : ""
                  }`}
                  data-testid="mobile-categories-more-btn"
                >
                  Mais +
                </button>
              </div>

              <div className={styles.summaryBar}>
                <span>
                  {hasActiveSearch ? (
                    <>
                      <strong>{filteredSupplierCount}</strong>{" "}
                      {filteredSupplierCount === 1 ? "resultado" : "resultados"} em{" "}
                      <strong>&ldquo;{searchQuery.trim()}&rdquo;</strong>
                    </>
                  ) : selectedCategory === "all" ? (
                    <>
                      Exibindo curadoria em{" "}
                      <strong>{ENEBINHA_SUPPLIER_CATEGORIES.length} categorias</strong> ·{" "}
                      {ENEBINHA_DISPLAY_COUNTS.supplierEntries} fornecedores e{" "}
                      {ENEBINHA_VITRINE.title}
                    </>
                  ) : (
                    <>
                      Categoria selecionada:{" "}
                      <strong>
                        {
                          ENEBINHA_SUPPLIER_CATEGORIES.find(
                            (c) => c.slug === selectedCategory
                          )?.category
                        }
                      </strong>{" "}
                      ({filteredSupplierCount} fornecedores)
                    </>
                  )}
                </span>

                {selectedCategory === "all" && !hasActiveSearch && (
                  <button
                    type="button"
                    onClick={() => setExpandAllCategories((prev) => !prev)}
                    className={styles.expandAllBtn}
                    aria-pressed={expandAllCategories}
                    data-testid="toggle-expand-all-suppliers"
                  >
                    {expandAllCategories
                      ? "Recolher destaques"
                      : "Mostrar todos os 73 links"}
                  </button>
                )}
              </div>

              <div className={styles.suppliersLayout}>
                <aside
                  aria-label="Categorias de fornecedores"
                  className={styles.categorySidebar}
                  data-testid="desktop-category-sidebar"
                >
                  <p className={styles.sidebarHeading}>CATEGORIAS</p>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory("all")}
                    className={`${styles.sidebarCategoryBtn} ${
                      selectedCategory === "all" ? styles.sidebarCategoryBtnActive : ""
                    }`}
                    data-testid="category-filter-all"
                  >
                    <span>Todos</span>
                    <span className={styles.sidebarCategoryCount}>
                      {ENEBINHA_DISPLAY_COUNTS.supplierEntries}
                    </span>
                  </button>

                  {ENEBINHA_SUPPLIER_CATEGORIES.map((cat) => {
                    const active = selectedCategory === cat.slug;
                    return (
                      <button
                        key={cat.slug}
                        type="button"
                        onClick={() => setSelectedCategory(cat.slug)}
                        className={`${styles.sidebarCategoryBtn} ${
                          active ? styles.sidebarCategoryBtnActive : ""
                        }`}
                        data-testid={`category-filter-${cat.slug}`}
                      >
                        <span>{cat.category}</span>
                        <span className={styles.sidebarCategoryCount}>{cat.count}</span>
                      </button>
                    );
                  })}
                </aside>

                <div className={styles.suppliersContent}>
                  {/* Vitrine Enebinha fixada */}
                  {showVitrineCard && (
                    <a
                      href={ENEBINHA_VITRINE.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.vitrineCard}
                      data-testid="enebinha-vitrine-card"
                    >
                      <div className={styles.vitrineLeft}>
                        <span className={styles.vitrineDot} aria-hidden="true">
                          ★
                        </span>
                        <div className={styles.vitrineText}>
                          <span className={styles.vitrineTitle}>
                            {ENEBINHA_VITRINE.title}
                          </span>
                          <span className={styles.vitrineSub}>
                            {ENEBINHA_VITRINE.subtitle} · outfitlit.com/@enebinha
                          </span>
                        </div>
                      </div>
                      <span className={styles.vitrineAction}>
                        {ENEBINHA_VITRINE.ctaLabel} ↗
                      </span>
                    </a>
                  )}

                  {filteredSupplierCategories.length === 0 ? (
                    <div
                      className={styles.emptyState}
                      data-testid="enebinha-empty-state"
                    >
                      <p className={styles.emptyTitle}>
                        0 resultados em &ldquo;{searchQuery.trim()}&rdquo;
                      </p>
                      <p className={styles.emptySub}>
                        Não encontramos fornecedores com esse termo.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery("");
                          setSelectedCategory("all");
                        }}
                        className={styles.emptyResetBtn}
                        data-testid="enebinha-empty-reset"
                      >
                        Limpar busca
                      </button>
                    </div>
                  ) : (
                    filteredSupplierCategories.map((categoryGroup) => {
                      const expanded = isCategoryExpanded(
                        categoryGroup.slug,
                        categoryGroup.entries.length
                      );
                      const visibleEntries = expanded
                        ? categoryGroup.entries
                        : categoryGroup.entries.slice(
                            0,
                            INITIAL_CATEGORY_PREVIEW_LIMIT
                          );
                      const hasMore =
                        categoryGroup.entries.length > INITIAL_CATEGORY_PREVIEW_LIMIT &&
                        selectedCategory === "all" &&
                        !hasActiveSearch &&
                        !expandAllCategories;

                      return (
                        <div
                          key={categoryGroup.slug}
                          className={styles.categoryBlock}
                          data-testid={`category-section-${categoryGroup.slug}`}
                        >
                          <div className={styles.categoryBlockHeader}>
                            <h3 className={styles.categoryBlockTitle}>
                              {categoryGroup.category}
                            </h3>
                            <span className={styles.categoryBlockCount}>
                              {categoryGroup.entries.length}{" "}
                              {categoryGroup.entries.length === 1 ? "link" : "links"}
                            </span>
                          </div>

                          <div className={styles.linksGrid}>
                            {visibleEntries.map((item) => (
                              <a
                                key={item.id}
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.linkRow}
                                data-testid={`supplier-link-${item.id}`}
                              >
                                <div className={styles.linkRowMain}>
                                  <span className={styles.linkRowTitle}>
                                    {item.title}
                                  </span>
                                  <span className={styles.linkRowSubtitle}>
                                    {item.platform}
                                    {item.isStorefront ? " · Loja / Vitrine" : ""}
                                  </span>
                                </div>
                                <span className={styles.externalArrow} aria-hidden="true">
                                  ↗
                                </span>
                              </a>
                            ))}
                          </div>

                          {(hasMore ||
                            (expanded &&
                              Boolean(expandedCategories[categoryGroup.slug]) &&
                              selectedCategory === "all" &&
                              !hasActiveSearch &&
                              !expandAllCategories)) && (
                            <button
                              type="button"
                              onClick={() => toggleCategoryExpansion(categoryGroup.slug)}
                              className={styles.categoryExpandFooterBtn}
                              aria-expanded={expanded}
                              data-testid={`category-expand-${categoryGroup.slug}`}
                            >
                              {expanded
                                ? "Mostrar menos"
                                : `Ver todos os ${categoryGroup.entries.length} links desta categoria ↗`}
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
          {/* Painel: Guias (8) */}
          {activeTab === "guias" && (
            <div
              id="panel-guias"
              role="tabpanel"
              aria-labelledby="tab-guias"
              data-testid="panel-guias"
            >
              {filteredGuides.length === 0 ? (
                <div
                  className={styles.emptyState}
                  data-testid="enebinha-empty-state"
                >
                  <p className={styles.emptyTitle}>
                    0 resultados em &ldquo;{searchQuery.trim()}&rdquo;
                  </p>
                  <p className={styles.emptySub}>
                    Não encontramos guias com esse termo.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className={styles.emptyResetBtn}
                    data-testid="enebinha-empty-reset"
                  >
                    Limpar busca
                  </button>
                </div>
              ) : (
                <div className={styles.linksGrid}>
                  {filteredGuides.map((guide) => (
                    <a
                      key={guide.id}
                      href={guide.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.linkRow}
                      data-testid={`guide-link-${guide.id}`}
                    >
                      <div className={styles.linkRowMain}>
                        <span className={styles.linkRowTitle}>{guide.title}</span>
                        <span className={styles.linkRowSubtitle}>
                          {guide.platform}
                        </span>
                      </div>
                      <span className={styles.externalArrow} aria-hidden="true">
                        ↗
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Painel: Comunidade (6) */}
          {activeTab === "comunidade" && (
            <div
              id="panel-comunidade"
              role="tabpanel"
              aria-labelledby="tab-comunidade"
              data-testid="panel-comunidade"
            >
              {filteredCommunity.length === 0 ? (
                <div
                  className={styles.emptyState}
                  data-testid="enebinha-empty-state"
                >
                  <p className={styles.emptyTitle}>
                    0 resultados em &ldquo;{searchQuery.trim()}&rdquo;
                  </p>
                  <p className={styles.emptySub}>
                    Não encontramos canais da comunidade com esse termo.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className={styles.emptyResetBtn}
                    data-testid="enebinha-empty-reset"
                  >
                    Limpar busca
                  </button>
                </div>
              ) : (
                <div className={styles.linksGrid}>
                  {filteredCommunity.map((entry) => (
                    <a
                      key={entry.id}
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.linkRow}
                      data-testid={`community-link-${entry.id}`}
                    >
                      <div className={styles.linkRowMain}>
                        <span className={styles.linkRowTitle}>{entry.title}</span>
                        <span className={styles.linkRowSubtitle}>
                          {entry.platform} · {entry.subtitle}
                        </span>
                      </div>
                      <span className={styles.externalArrow} aria-hidden="true">
                        ↗
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Marcas de referência (20) — recolhido por padrão */}
        <section
          aria-label="Marcas de referência"
          className={styles.brandsCard}
          data-testid="enebinha-brands-section"
        >
          <button
            type="button"
            onClick={() => setIsBrandsOpen((prev) => !prev)}
            aria-expanded={isBrandsOpen}
            aria-controls="enebinha-brands-panel"
            className={styles.brandsToggleHeader}
            data-testid="enebinha-brands-toggle"
          >
            <span className={styles.brandsHeaderLeft}>
              <span>Marcas de referência ({ENEBINHA_DISPLAY_COUNTS.referenceBrands})</span>
              <span className={styles.brandsSub}>
                Galeria editorial preservada · Sem afiliação oficial
              </span>
            </span>
            <span className={styles.brandsToggleAction}>
              {isBrandsOpen ? "Ocultar −" : "Ver +"}
            </span>
          </button>

          {isBrandsOpen && (
            <div
              id="enebinha-brands-panel"
              className={styles.brandsPanel}
              data-testid="enebinha-brands-panel"
            >
              <div className={styles.brandsGrid}>
                {ENEBINHA_BRAND_REFERENCES.map((brand) => (
                  <a
                    key={brand.id}
                    href={brand.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.brandItem}
                    data-testid={`brand-reference-${brand.id}`}
                  >
                    <span className={styles.brandLogoWell}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={brand.publicPath}
                        alt={`Logo de referência ${brand.name}`}
                        className={styles.brandLogoImg}
                        loading="lazy"
                        decoding="async"
                      />
                    </span>
                    <span className={styles.brandName}>{brand.name}</span>
                  </a>
                ))}
              </div>
              <p className={styles.brandsDisclaimer}>
                {ENEBINHA_DISCLOSURES.brandReferenceDisclaimer}
              </p>
            </div>
          )}
        </section>

        {/* Rodapé e avisos de curadoria */}
        <footer className={styles.footerSection} data-testid="enebinha-footer">
          <p className={styles.footerNoticeRow}>
            {ENEBINHA_DISCLOSURES.catalogDisclaimer}{" "}
            {ENEBINHA_DISCLOSURES.upcomingNotice}
          </p>
          <div className={styles.footerBottomRow}>
            <span>{ENEBINHA_DISCLOSURES.footerCopyright}</span>
            <span>
              {ENEBINHA_DISCLOSURES.footerAttribution} ·{" "}
              <Link href="/landing" className={styles.footerLotiLink}>
                Conhecer o Loti
              </Link>
            </span>
          </div>
        </footer>
      </main>

      {/* Sheet Mobile para selecionar qualquer uma das 7 categorias */}
      {isMobileCategoriesOpen && (
        <div
          className={styles.mobileSheetBackdrop}
          onClick={() => setIsMobileCategoriesOpen(false)}
          role="presentation"
        >
          <div
            id="mobile-categories-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Selecionar categoria de fornecedores"
            className={styles.mobileSheet}
            onClick={(e) => e.stopPropagation()}
            data-testid="mobile-categories-sheet"
          >
            <div className={styles.mobileSheetHeader}>
              <h3 className={styles.mobileSheetTitle}>Categorias (7)</h3>
              <button
                type="button"
                onClick={() => setIsMobileCategoriesOpen(false)}
                aria-label="Fechar categorias"
                className={styles.mobileSheetCloseBtn}
                data-testid="mobile-categories-close"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className={styles.mobileSheetList}>
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory("all");
                  setIsMobileCategoriesOpen(false);
                }}
                className={`${styles.sidebarCategoryBtn} ${
                  selectedCategory === "all" ? styles.sidebarCategoryBtnActive : ""
                }`}
                data-testid="mobile-category-option-all"
              >
                <span>Todos os fornecedores</span>
                <span className={styles.sidebarCategoryCount}>
                  {ENEBINHA_DISPLAY_COUNTS.supplierEntries}
                </span>
              </button>

              {ENEBINHA_SUPPLIER_CATEGORIES.map((cat) => (
                <button
                  key={cat.slug}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat.slug);
                    setIsMobileCategoriesOpen(false);
                  }}
                  className={`${styles.sidebarCategoryBtn} ${
                    selectedCategory === cat.slug ? styles.sidebarCategoryBtnActive : ""
                  }`}
                  data-testid={`mobile-category-option-${cat.slug}`}
                >
                  <span>{cat.category}</span>
                  <span className={styles.sidebarCategoryCount}>{cat.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}