import { Button } from "@/components/ui/button";
import Link from "next/link";
import { landingContent } from "./landing-content";
import { ProductCapture } from "./product-capture";
import styles from "./landing.module.css";

export function LandingHero() {
  return <section className={styles.hero} aria-labelledby="landing-title">
    <div className={styles.heroCopy}>
      <h1 id="landing-title">{landingContent.hero.title}</h1>
      <p>{landingContent.hero.description}</p>
      <div className={styles.actions}>
        <Button asChild className={styles.primaryAction}><a href={landingContent.hero.href}>{landingContent.hero.action}</a></Button>
        <Link className={styles.secondaryAction} href="/ferramentas" prefetch={false}>Explorar ferramentas gratuitas</Link>
      </div>
    </div>
    <ProductCapture />
  </section>;
}
