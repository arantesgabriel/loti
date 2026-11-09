import { landingContent } from "./landing-content";
import styles from "./landing.module.css";

export function LandingFaq() {
  return <section className={styles.section} aria-labelledby="faq-title">
    <div className={styles.faq}>
      <h2 id="faq-title">Ainda tem alguma dúvida?</h2>
      {landingContent.faq.map(item => <details key={item.question}>
        <summary>{item.question}</summary>
        <p>{item.answer}</p>
      </details>)}
    </div>
  </section>;
}
