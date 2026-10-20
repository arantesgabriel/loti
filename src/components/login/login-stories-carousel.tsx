"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import {
  SaveFavoritesStory,
  OrganizeGroupStory,
  BuildPurchaseStory,
} from "./login-stories";

const stories = [
  {
    title: "Salve tudo em um só lugar",
    description:
      "Guarde links, organize favoritos e encontre tudo mais rápido.",
    Scene: SaveFavoritesStory,
  },
  {
    title: "Organize com o seu grupo",
    description: "Cada pessoa salva seus achados e tudo fica no mesmo espaço.",
    Scene: OrganizeGroupStory,
  },
  {
    title: "Monte a compra juntos",
    description: "Transforme favoritos em compra atual sem perder o controle.",
    Scene: BuildPurchaseStory,
  },
];
const reducedQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(callback: () => void) {
  const media = window.matchMedia(reducedQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
function subscribeVisibility(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}

export function LoginStoriesCarousel({ submitting }: { submitting: boolean }) {
  const reduced = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(reducedQuery).matches,
    () => true,
  );
  const hidden = useSyncExternalStore(
    subscribeVisibility,
    () => document.hidden,
    () => false,
  );
  const [slide, setSlide] = useState({
    index: 0,
    previous: null as { index: number; revision: number } | null,
    revision: 0,
  });
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const paused =
    submitting || hovered || focused || stopped || hidden || reduced;
  const navigate = useCallback(
    (target: number | "next" | "previous", manual = true) => {
      setSlide((current) => {
        const index =
          typeof target === "number"
            ? target
            : (current.index + (target === "next" ? 1 : 2)) % 3;
        return {
          index,
          previous:
            index === current.index
              ? null
              : { index: current.index, revision: current.revision },
          revision: current.revision + 1,
        };
      });
      if (manual && typeof target === "number")
        setAnnouncement(
          `História ${target + 1} de 3: ${stories[target].title}`,
        );
    },
    [],
  );
  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => navigate("next", false), 6500);
    return () => window.clearTimeout(timer);
  }, [slide.index, slide.revision, paused, navigate]);
  useEffect(() => {
    if (slide.previous === null) return;
    const timer = window.setTimeout(
      () => setSlide((current) => ({ ...current, previous: null })),
      550,
    );
    return () => window.clearTimeout(timer);
  }, [slide.previous, slide.revision]);
  function manualNavigate(target: number | "next" | "previous") {
    if (submitting) return;
    const index =
      typeof target === "number"
        ? target
        : (slide.index + (target === "next" ? 1 : 2)) % 3;
    navigate(index);
  }
  function renderStory(index: number, revision: number, outgoing = false) {
    const { title, description, Scene } = stories[index];
    return (
      <div
        key={`${revision}-${reduced}`}
        className={`login-story story-${index + 1}${outgoing ? " story-outgoing" : ""}`}
        role="group"
        aria-roledescription="slide"
        aria-label={`${index + 1} de 3: ${title}`}
        aria-hidden={outgoing || undefined}
      >
        <div className="story-scene">
          <div className="story-stage">
            <Scene reducedMotion={reduced} />
          </div>
        </div>
        <div className="story-copy">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
    );
  }
  return (
    <section
      className="login-stories-pane"
      aria-label="Conheça o Loti"
      aria-roledescription="carrossel"
      data-testid="login-stories"
      data-slide={slide.index + 1}
      data-paused={paused}
      data-reduced-motion={reduced}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <div className="story-slides" id="login-story-slides" aria-live="off">
        {slide.previous !== null &&
          !reduced &&
          renderStory(slide.previous.index, slide.previous.revision, true)}
        {renderStory(slide.index, slide.revision)}
      </div>
      <div
        className="story-controls"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            manualNavigate(event.key === "ArrowRight" ? "next" : "previous");
          }
        }}
      >
        <button
          type="button"
          disabled={submitting}
          className="story-arrow"
          aria-label="História anterior"
          aria-controls="login-story-slides"
          onClick={() => manualNavigate("previous")}
        >
          <ChevronLeft aria-hidden="true" size={22} />
        </button>
        <div className="story-dots">
          {stories.map((story, index) => (
            <button
              type="button"
              key={story.title}
              className="story-dot"
              aria-label={`História ${index + 1}: ${story.title}`}
              aria-current={slide.index === index ? "true" : undefined}
              aria-controls="login-story-slides"
              disabled={submitting}
              onClick={() => manualNavigate(index)}
            >
              <span />
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={submitting}
          className="story-arrow"
          aria-label="Próxima história"
          aria-controls="login-story-slides"
          onClick={() => manualNavigate("next")}
        >
          <ChevronRight aria-hidden="true" size={22} />
        </button>
        {!reduced && (
          <button
            type="button"
            className="story-play"
            aria-label={stopped ? "Retomar histórias" : "Pausar histórias"}
            onClick={() => setStopped((value) => !value)}
          >
            {stopped ? (
              <Play size={16} aria-hidden="true" />
            ) : (
              <Pause size={16} aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      <span
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </span>
    </section>
  );
}
