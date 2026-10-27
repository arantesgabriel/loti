"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Bookmark, Link2 } from "lucide-react";
import styles from "./transformation.module.css";

// The capture is server-rendered. Only its surrounding editorial labels move.
export function FavoritesTransformation({ children }: { children: ReactNode }) {
  const scene = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scene.current;
    if (!element) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    let frame = 0;
    let disposed = false;

    const render = () => {
      frame = 0;
      if (disposed || preference.matches || !visible) return;
      const { top } = element.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (window.innerHeight * .55 - top) / (window.innerHeight * .4)));
      // Smooth interpolation has no history: returning to a position restores it.
      const approach = Math.max(0, Math.min(1, (progress - .12) / .7));
      const eased = approach * approach * (3 - 2 * approach);
      element.style.setProperty("--scatter", String(1 - eased));
      element.style.setProperty("--ornament-opacity", String(1 - eased * .55));
      element.dataset.motion = "active";
      element.dataset.stage = progress < .12 ? "S0" : progress < .55 ? "S1" : progress < .82 ? "S2" : "S3";
    };
    const schedule = () => {
      if (!disposed && visible && !preference.matches && !frame) frame = requestAnimationFrame(render);
    };
    const reset = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      delete element.dataset.motion;
      delete element.dataset.stage;
      element.style.removeProperty("--scatter");
      element.style.removeProperty("--ornament-opacity");
      schedule();
    };
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!visible && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      schedule();
    });
    const resize = new ResizeObserver(schedule);
    intersection.observe(element);
    resize.observe(element);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    element.addEventListener("load", schedule, true);
    preference.addEventListener("change", reset);
    void document.fonts.ready.then(schedule);

    return () => {
      disposed = true;
      reset();
      intersection.disconnect();
      resize.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      element.removeEventListener("load", schedule, true);
      preference.removeEventListener("change", reset);
    };
  }, []);

  return <div ref={scene} className={styles.scene} data-favorites-transformation="">
    <div className={styles.links} aria-hidden="true">
      <span className={styles.link}><Link2 size={16} /> Um link salvo</span>
      <span className={styles.link}><Bookmark size={16} /> Uma coleção</span>
      <span className={styles.link}><Link2 size={16} /> Tudo por perto</span>
      <svg className={styles.parcel} viewBox="0 0 100 100" focusable="false">
        <defs>
          <linearGradient id="landing-box-top" x2="1" y2="1"><stop stopColor="#f5dfcc"/><stop offset="1" stopColor="#dfb99b"/></linearGradient>
          <linearGradient id="landing-box-front" x2="1" y2="1"><stop stopColor="#e9c9ac"/><stop offset="1" stopColor="#d2a687"/></linearGradient>
        </defs>
        <ellipse cx="50" cy="85" rx="32" ry="5" fill="#1c0113" opacity=".07"/>
        <path d="M16 31Q16 28 20 26L48 14Q51 13 54 15L83 29 50 46Z" fill="url(#landing-box-top)"/>
        <path d="M16 31L50 46V83L20 68Q16 66 16 62Z" fill="url(#landing-box-front)"/>
        <path d="M50 46L83 29V62Q83 66 79 68L50 83Z" fill="#c39a7d"/>
        <path d="M33 21L67 37V51L59 55V41L25 25Z" fill="#faf1e7" opacity=".8"/>
      </svg>
    </div>
    <div className={styles.capture}>{children}</div>
    <p className={styles.note}>Dos links dispersos aos favoritos organizados. Você salva cada link no Loti.</p>
  </div>;
}
