import styles from "./landing.module.css";
import { landingMedia, type LandingCapture } from "./landing-media";

export function ProductCapture({ capture = landingMedia.hero, className = styles.productCapture, priority = true, mobileBreakpoint = 900 }: { capture?: LandingCapture; className?: string; priority?: boolean; mobileBreakpoint?: number }) {
  return <figure className={className}>
    <picture>
      <source media={`(max-width: ${mobileBreakpoint}px)`} srcSet={capture.mobile.src} width={capture.mobile.width} height={capture.mobile.height}/>
      {/* Native picture selects one authentic viewport capture before loading. */}
      <img src={capture.desktop.src} width={capture.desktop.width} height={capture.desktop.height} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} alt={capture.alt}/>
    </picture>
    <figcaption>{capture.caption}</figcaption>
  </figure>;
}
