import { Button } from "@/components/ui/button";
import { landingContent as content } from "./landing-content";
import styles from "./landing.module.css";
import { ManagerJourney } from "./manager-journey";
import { UseCases } from "./use-cases";
import { FavoritesTransformation } from "./favorites-transformation";
import { ProductCapture } from "./product-capture";
import { landingMedia } from "./landing-media";
import { LandingFaq } from "./landing-faq";
import { ToolsSection } from "./tools-section";

export function LandingOutline() {
  return <>
    <section id="produto" className={styles.section} aria-labelledby="product-title">
      <div className={styles.sectionIntro}>
        <h2 id="product-title">{content.transformation.title}</h2>
        <p>{content.transformation.description}</p>
      </div>
      <FavoritesTransformation>
        <ProductCapture capture={landingMedia.favorites} className={styles.journeyCapture} priority={false} mobileBreakpoint={1100} />
      </FavoritesTransformation>
    </section>
    <ManagerJourney />
    <UseCases />
    <ToolsSection />
    <LandingFaq />
    <section className={`${styles.section} ${styles.closing}`} aria-labelledby="closing-title">
      <h2 id="closing-title">{content.closing.title}</h2>
      <p>{content.closing.description}</p>
      <Button asChild className={styles.primaryAction}><a href={content.hero.href}>{content.hero.action}</a></Button>
    </section>
  </>;
}
