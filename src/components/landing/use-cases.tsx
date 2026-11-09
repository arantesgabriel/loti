import { UserRound, UsersRound } from "lucide-react";
import { landingContent } from "./landing-content";
import styles from "./landing.module.css";

const cases = [
  { key: "individual", icon: UserRound, points: ["Seus produtos favoritos", "Coleções para organizar", "Custos por produto"] },
  { key: "group", icon: UsersRound, points: ["Produtos por participante", "Divisão de custos", "Uma compra compartilhada"] },
] as const;

export function UseCases() {
  const content = landingContent.contexts;
  return <section className={styles.section} aria-labelledby="contexts-title">
    <div className={styles.sectionIntro}>
      <h2 id="contexts-title">{content.title}</h2>
      <p>{content.description}</p>
    </div>
    <div className={styles.useCasesGrid}>
      {cases.map(item => <article className={styles.useCaseCard} key={item.key} data-use-case={item.key}>
        <span className={styles.useCaseIcon} aria-hidden="true"><item.icon size={24}/></span>
        <h3>{content[item.key].title}</h3>
        <p>{content[item.key].description}</p>
        <ul>{item.points.map(point => <li key={point}>{point}</li>)}</ul>
      </article>)}
    </div>
  </section>;
}
