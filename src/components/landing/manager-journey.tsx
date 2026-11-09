import { Bookmark, ShoppingCart, Package } from "lucide-react";
import { landingContent } from "./landing-content";
import { landingMedia } from "./landing-media";
import { ProductCapture } from "./product-capture";
import styles from "./landing.module.css";

const stages = [
  { key: "favorites", icon: Bookmark, note: "Salve pelo link e organize em coleções." },
  { key: "purchase", icon: ShoppingCart, note: "Você faz a compra no site de origem e marca os itens no Loti." },
  { key: "costs", icon: Package, note: "Depois de finalizar a compra, registre fretes e taxas manualmente." },
] as const;

export function ManagerJourney() {
  return <div id="como-funciona" className={styles.managerJourney}>
    {stages.map((stage, index) => {
      const content = landingContent.journey[index];
      const isPurchase = stage.key === "purchase";
      return <section key={stage.key} className={`${styles.journeyStage}${isPurchase ? ` ${styles.purchaseBand}` : ""}`} aria-labelledby={`journey-${stage.key}-title`} data-journey-stage={stage.key}>
        <div className={`${styles.journeyRow}${isPurchase ? ` ${styles.journeyReverse}` : ""}`}>
          <div className={styles.journeyCopy}>
            <p className={styles.journeyLabel}><stage.icon size={18} aria-hidden="true"/>{content.label}</p>
            <h2 id={`journey-${stage.key}-title`}>{content.title}</h2>
            <p>{content.description}</p>
            <p className={styles.journeyNote}>{stage.note}</p>
          </div>
          <div className={styles.journeyProof}>
            <ProductCapture capture={landingMedia[stage.key]} className={styles.journeyCapture} priority={false} mobileBreakpoint={1100}/>
            {stage.key === "costs" && <ProductCapture capture={landingMedia.packages} className={styles.journeyCapture} priority={false} mobileBreakpoint={1100}/>}
          </div>
        </div>
      </section>;
    })}
  </div>;
}
