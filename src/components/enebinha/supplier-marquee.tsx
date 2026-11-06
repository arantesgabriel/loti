"use client";

import React, { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { EnebinhaSupplierEntry } from "@/lib/enebinha/manifest";
import styles from "./enebinha.module.css";

interface SupplierMarqueeProps {
  suppliers: EnebinhaSupplierEntry[];
}

const TARGET_SPEED_PX_PER_SECOND = 40;

export function SupplierMarquee({ suppliers }: SupplierMarqueeProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const primarySequenceRef = useRef<HTMLDivElement | null>(null);

  const [isManuallyPaused, setIsManuallyPaused] = useState(false);
  const [isDocumentHidden, setIsDocumentHidden] = useState(false);
  const [isInViewport, setIsInViewport] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState<number>(320);

  useEffect(() => {
    const seq = primarySequenceRef.current;
    if (!seq) return;

    const updateDuration = () => {
      const width = seq.getBoundingClientRect().width || seq.scrollWidth;
      if (width > 0) {
        const nextSeconds = Math.max(20, Math.round(width / TARGET_SPEED_PX_PER_SECOND));
        setDurationSeconds(nextSeconds);
      }
    };

    updateDuration();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => updateDuration());
      observer.observe(seq);
      return () => observer.disconnect();
    }
  }, [suppliers.length]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setPrefersReducedMotion(media.matches);
    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibility = () => {
      setIsDocumentHidden(document.visibilityState === "hidden");
    };
    handleVisibility();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setIsInViewport(entry.isIntersecting);
        }
      },
      { threshold: 0.01 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const effectivelyPaused =
    prefersReducedMotion || isManuallyPaused || isDocumentHidden || !isInViewport;

  const renderSupplierPill = (supplier: EnebinhaSupplierEntry, isClone: boolean) => {
    const isVerified =
      supplier.logoAudit.status === "verificado" && Boolean(supplier.logoAudit.logoAssetLocal);

    return (
      <a
        key={isClone ? `${supplier.id}-clone` : supplier.id}
        href={supplier.url}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.marqueeItem}
        tabIndex={isClone ? -1 : undefined}
        data-testid={isClone ? undefined : `marquee-supplier-${supplier.id}`}
        data-supplier-id={supplier.id}
        data-logo-status={supplier.logoAudit.status}
      >
        <span
          className={styles.marqueeLogoSlot}
          data-testid={isClone ? undefined : `marquee-logo-slot-${supplier.id}`}
          data-logo-status={supplier.logoAudit.status}
        >
          {isVerified && supplier.logoAudit.logoAssetLocal ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={supplier.logoAudit.logoAssetLocal}
              alt={isClone ? "" : `Logo de ${supplier.title}`}
              className={styles.marqueeLogoImg}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span
              className={styles.marqueeLogoPending}
              role={isClone ? undefined : "img"}
              aria-label={isClone ? undefined : `Ativo de logo pendente para ${supplier.title}`}
              title={`Pendente de ativo oficial (${supplier.logoAudit.status}): ${supplier.title}`}
            >
              PEND
            </span>
          )}
        </span>
        <span className={styles.marqueeItemText}>
          <span className={styles.marqueeItemTitle}>{supplier.title}</span>
          <span className={styles.marqueeItemPlatform}>· {supplier.platform}</span>
        </span>
      </a>
    );
  };

  return (
    <section
      ref={sectionRef}
      aria-label="Faixa de fornecedores da curadoria"
      className={styles.marqueeSection}
      data-testid="supplier-marquee"
      data-paused={effectivelyPaused ? "true" : "false"}
      data-reduced-motion={prefersReducedMotion ? "true" : "false"}
    >
      <div className={styles.marqueeLabelWrap}>
        <span className={styles.marqueeLabel}>FORNECEDORES</span>
        <span className={styles.marqueeCountBadge} title={"73 fornecedores na sequ\u00eancia"}>
          {suppliers.length}
        </span>
      </div>

      <div
        className={`${styles.marqueeViewport} ${
          prefersReducedMotion ? styles.marqueeViewportStatic : ""
        }`}
      >
        <div
          className={`${styles.marqueeTrack} ${
            effectivelyPaused ? styles.marqueeTrackPaused : ""
          }`}
          style={
            {
              "--marquee-duration": `${durationSeconds}s`,
            } as React.CSSProperties
          }
          data-testid="supplier-marquee-track"
        >
          <div
            ref={primarySequenceRef}
            className={styles.marqueeSequence}
            data-testid="supplier-marquee-primary-sequence"
          >
            {suppliers.map((supplier) => renderSupplierPill(supplier, false))}
          </div>

          {!prefersReducedMotion && (
            <div
              className={`${styles.marqueeSequence} ${styles.marqueeCloneSequence}`}
              aria-hidden="true"
              data-testid="supplier-marquee-clone-sequence"
            >
              {suppliers.map((supplier) => renderSupplierPill(supplier, true))}
            </div>
          )}
        </div>
      </div>

      {!prefersReducedMotion && (
        <button
          type="button"
          onClick={() => setIsManuallyPaused((prev) => !prev)}
          className={styles.marqueeControlBtn}
          aria-pressed={isManuallyPaused}
          aria-label={
            isManuallyPaused
              ? "Retomar movimento da faixa de fornecedores"
              : "Pausar movimento da faixa de fornecedores"
          }
          data-testid="supplier-marquee-toggle"
        >
          {isManuallyPaused ? (
            <>
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Retomar</span>
            </>
          ) : (
            <>
              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Pausar</span>
            </>
          )}
        </button>
      )}
    </section>
  );
}