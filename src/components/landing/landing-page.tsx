import { LandingHeader } from "./landing-header";
import { LandingHero } from "./landing-hero";
import { LandingOutline } from "./landing-outline";
import { LandingFooter } from "./landing-footer";
import styles from "./landing.module.css";

export function LandingPage() {
  return <div id="inicio" className={styles.page}>
    <a className={styles.skipLink} href="#conteudo">Pular para o conteúdo</a>
    <LandingHeader />
    <main id="conteudo" tabIndex={-1}>
      <LandingHero />
      <LandingOutline />
    </main>
    <LandingFooter />
  </div>;
}
