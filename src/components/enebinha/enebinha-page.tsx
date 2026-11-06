"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Bookmark, Search, Share2, ExternalLink, Star, BookOpen, FileText, Table2, ArrowUpRight, CarFront, Cpu, Footprints, Gamepad2, Glasses, LayoutGrid, Shirt, Trophy, type LucideIcon } from "lucide-react";
import { ThemeSwitch } from "@/components/theme-switch";
import { Button } from "@/components/ui/button";
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
} from "@/lib/enebinha/manifest";
import { SupplierMarquee } from "./supplier-marquee";
import styles from "./enebinha.module.css";

type CatalogTab = "fornecedores" | "guias" | "comunidade";

const INITIAL_CATEGORY_PREVIEW_LIMIT = 6;

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  all: LayoutGrid,
  "eletronicos-e-perifericos": Cpu,
  "relogios-e-oculos": Glasses,
  "roupas-e-moda": Shirt,
  "tenis-e-calcados": Footprints,
  "esportes-e-camisas": Trophy,
  "brinquedos-e-colecionaveis": Gamepad2,
  "automotivos-e-pecas": CarFront,
};

export function EnebinhaPage() {

  const [activeTab, setActiveTab] = useState<CatalogTab>("fornecedores");
  const [selectedCategory, setSelectedCategory] = useState<string | "all">("eletronicos-e-perifericos");
  // Each section retains its own query when visitors switch tabs.
  const [queries, setQueries] = useState<Record<CatalogTab, string>>({ fornecedores: "", guias: "", comunidade: "" });
  const searchQuery = queries[activeTab];
  const setSearchQuery = (value: string) => setQueries((prev) => ({ ...prev, [activeTab]: value }));
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [expandAllCategories, setExpandAllCategories] = useState<boolean>(false);
  const [isBrandsOpen, setIsBrandsOpen] = useState<boolean>(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const tabRefs = useRef<Record<CatalogTab, HTMLButtonElement | null>>({
    fornecedores: null,
    guias: null,
    comunidade: null,
  });

  const hasActiveSearch = searchQuery.trim().length > 0;

  const filteredSupplierCategories = useMemo(
    () =>
      filterSupplierCategories({
        categorySlug: searchQuery.trim() ? "all" : selectedCategory,
        query: searchQuery,
      }),
    [selectedCategory, searchQuery]
  );

  const filteredSupplierCount = useMemo(
    () => filteredSupplierCategories.reduce((acc, cat) => acc + cat.entries.length, 0),
    [filteredSupplierCategories]
  );

  const filteredGuides = useMemo(() => filterGuides(searchQuery), [searchQuery]);
  const filteredCommunity = useMemo(() => filterCommunity(searchQuery), [searchQuery]);

  const handleShare = async () => {
    const shareUrl =
      typeof window !== "undefined" ? window.location.href : "https://loti.app/enebinha";
    const shareData = {
      title: "ENEBINHA · Sua central de importações | Loti",
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
    if (hasActiveSearch || (selectedCategory === "all" && expandAllCategories)) {
      return true;
    }
    if (entryCount <= (selectedCategory === "all" ? 3 : INITIAL_CATEGORY_PREVIEW_LIMIT)) {
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
              <Bookmark size={27} fill="currentColor" strokeWidth={0} aria-hidden="true" />
            </span>
            <span>Loti</span>
          </Link>

          <div className={styles.headerActions}>
            <ThemeSwitch className={styles.headerThemeSwitch} />

            <Button
              variant="ghost" size="icon"
              type="button"
              onClick={handleShare}
              className={styles.headerActionBtn}
              aria-label="Compartilhar página ENEBINHA"
              data-testid="enebinha-share-btn"
            >
              <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>

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
              <ExternalLink size={15} aria-hidden="true" />
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
            <p className={styles.heroEyebrow}>CENTRAL DE IMPORTAÇÃO</p>
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

        <section className={styles.featuredLinks} aria-label="Destaques da importação">
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
              className={`button button-primary ${styles.hubbuyCta}`}
              data-testid="enebinha-hubbuy-cta"
            >
              <span>{ENEBINHA_HUBBUY.ctaLabel}</span>
              <ExternalLink size={15} aria-hidden="true" />
            </a>
          </section>

          <a
            href={ENEBINHA_VITRINE.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.vitrineCard}
            data-testid="enebinha-vitrine-card"
          >
            <span className={styles.vitrineIdentity}>
              <span className={styles.vitrineDot} aria-hidden="true">
                <Star size={18} aria-hidden="true" />
              </span>
              <span className={styles.vitrineText}>
                <span className={styles.vitrineEyebrow}>Curadoria da Enebinha</span>
                <span className={styles.vitrineTitle}>{ENEBINHA_VITRINE.title}</span>
                <span className={styles.vitrineSub}>{ENEBINHA_VITRINE.subtitle} · outfitlit.com/@enebinha</span>
              </span>
            </span>
            <span className={styles.vitrineAction}>
              {ENEBINHA_VITRINE.ctaLabel} <ExternalLink size={15} aria-hidden="true" />
            </span>
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
              {activeTab === "fornecedores"
                ? `${ENEBINHA_DISPLAY_COUNTS.supplierEntries} fornecedores · ${ENEBINHA_DISPLAY_COUNTS.storefrontsIdentifiedWithinCatalog} lojas e vitrines`
                : activeTab === "guias" ? `${ENEBINHA_DISPLAY_COUNTS.guides} guias` : `${ENEBINHA_DISPLAY_COUNTS.community} canais`}
            </p>
          </div>

          <div className={styles.toolbarRow}>
            <div
              role="tablist"
              aria-label="Seções da central de importação"
              className={`segmented ${styles.tabList}`}
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
                className={`${
                  activeTab === "fornecedores" ? "selected" : ""
                }`}
                data-testid="tab-fornecedores"
              >
                Fornecedores
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
                className={`${
                  activeTab === "guias" ? "selected" : ""
                }`}
                data-testid="tab-guias"
              >
                Guias
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
                className={`${
                  activeTab === "comunidade" ? "selected" : ""
                }`}
                data-testid="tab-comunidade"
              >
                Comunidade
              </button>
            </div>

            <div className={`search-input ${styles.searchWrap}`}>
              <Search size={19} className={styles.searchIcon} aria-hidden="true" />
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
                aria-label="Buscar links na central de importações"
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
              <div className={styles.categoryRail} role="group" aria-label="Categorias de fornecedores" data-testid="category-bar">
                {[{ slug: "all", category: "Todos" }, ...ENEBINHA_SUPPLIER_CATEGORIES].map((category) => {
                  const CategoryIcon = CATEGORY_ICONS[category.slug] ?? LayoutGrid;
                  return (
                    <button key={category.slug} type="button" aria-pressed={!hasActiveSearch && selectedCategory === category.slug}
                      onClick={(event) => {
                        setSelectedCategory(category.slug);
                        setSearchQuery("");
                        event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
                      }}
                      className={styles.categoryFilter} data-testid={`category-filter-${category.slug}`}>
                      <CategoryIcon className={styles.categoryIcon} size={15} aria-hidden="true" />
                      <span>{category.category}</span>
                    </button>
                  );
                })}
              </div>
              <p className="sr-only" role="status" aria-live="polite">
                {filteredSupplierCount} fornecedores{hasActiveSearch ? ` para “${searchQuery.trim()}”` : ` em ${selectedCategory === "all" ? "todas as categorias" : ENEBINHA_SUPPLIER_CATEGORIES.find((category) => category.slug === selectedCategory)?.category}`}.
              </p>

              <div className={styles.summaryBar}>
                <span>
                  {hasActiveSearch ? (
                    <>
                      <strong>{filteredSupplierCount}</strong>{" "}
                      {filteredSupplierCount === 1 ? "resultado" : "resultados"} em{" "}
                      <strong>&ldquo;{searchQuery.trim()}&rdquo;</strong>
                    </>
                  ) : null}
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


                <div className={styles.suppliersContent}>
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
                      const previewLimit = selectedCategory === "all" ? 3 : INITIAL_CATEGORY_PREVIEW_LIMIT;
                      const expanded = isCategoryExpanded(
                        categoryGroup.slug,
                        categoryGroup.entries.length
                      );
                      const visibleEntries = expanded
                        ? categoryGroup.entries
                        : categoryGroup.entries.slice(
                            0,
                            previewLimit
                          );
                      const hasMore =
                        categoryGroup.entries.length > previewLimit &&
                        !hasActiveSearch &&
                        !(selectedCategory === "all" && expandAllCategories);

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
                                  <ExternalLink size={16} aria-hidden="true" />
                                </span>
                              </a>
                            ))}
                          </div>

                          {(hasMore ||
                            (expanded &&
                              Boolean(expandedCategories[categoryGroup.slug]) &&
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
                                : `Ver todos os ${categoryGroup.entries.length} links`}
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
                <div className={styles.guidesGrid}>
                  {filteredGuides.map((guide) => (
                    <a
                      key={guide.id}
                      href={guide.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={guide.id === "guide-01" ? styles.guideFeatured : styles.guideCard}
                      data-testid={`guide-link-${guide.id}`}
                    >
                      <span className={styles.guideIcon} aria-hidden="true">{guide.id === "guide-01" ? <BookOpen size={28} /> : guide.platform === "Google Sheets" ? <Table2 size={20} /> : <FileText size={20} />}</span>
                      <div className={styles.linkRowMain}>
                        <span className={styles.linkRowTitle}>{guide.title}</span>
                        <span className={styles.linkRowSubtitle}>
                          {guide.platform}
                        </span>
                      </div>
                      {guide.id === "guide-01" && <span className={styles.guideAction}>Abrir guia</span>}
                      <span className={styles.externalArrow} aria-hidden="true">
                        <ExternalLink size={16} aria-hidden="true" />
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
                <div className={styles.communityGrid}>
                  {filteredCommunity.map((entry) => {
                    return (
                    <a
                      key={entry.id}
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.channelCard}
                      data-testid={`community-link-${entry.id}`}
                    >
                      <div className={styles.channelHeading}><Image src={`/enebinha/platforms/${entry.platform.toLowerCase()}.svg`} width={24} height={24} alt="" className={styles.platformLogo} />{entry.title !== entry.platform && <span className={styles.channelPlatform}>{entry.platform}</span>}</div>
                      <div className={styles.linkRowMain}>
                        <span className={styles.linkRowTitle}>{entry.title}</span>
                        <span className={styles.linkRowSubtitle}>
                          {entry.subtitle}
                        </span>
                      </div>
                      <span className={styles.channelAction}>{entry.platform === "Amazon" ? "Visitar" : entry.platform === "Telegram" ? "Abrir canal" : "Ver conteúdo"}<ArrowUpRight size={16} aria-hidden="true" /></span>
                    </a>
                  ); })}
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

    </div>
  );
}
