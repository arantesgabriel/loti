import { ArrowLeft, Bookmark } from "lucide-react";
import Link from "next/link";
import { ToolsList, ToolIcon } from "./tools-section";
import type { LandingTool } from "./landing-tools";
import styles from "./tools.module.css";

export function ToolsPage({ tool }: { tool?: LandingTool }) {
  return <div className={styles.shell}>
    <header className={styles.header}>
      <Link href="/landing" prefetch={false} className={styles.brand} aria-label="Loti, página inicial"><Bookmark size={27} fill="currentColor" strokeWidth={0} aria-hidden="true" />Loti</Link>
      <Link href={tool ? "/ferramentas" : "/landing"} prefetch={false} className={styles.back}><ArrowLeft size={16} aria-hidden="true" />{tool ? "Ferramentas" : "Conhecer o Loti"}</Link>
    </header>
    <main>
      {tool ? <section className={styles.construction} aria-labelledby="tool-title">
        <span className={styles.icon}><ToolIcon tool={tool} size={36} /></span>
        <span className={styles.status}>Em construção</span>
        <h1 id="tool-title">{tool.title}</h1>
        <p>Estamos preparando esta ferramenta para ajudar você a planejar suas importações com mais clareza. Ela ainda não está disponível para uso.</p>
        <div className={styles.actions}>
          <Link href="/ferramentas" prefetch={false}>Explorar outras ferramentas</Link>
          <Link href="/landing" prefetch={false}>Conhecer o Loti</Link>
        </div>
      </section> : <section className={styles.hub} aria-labelledby="tools-page-title">
        <div className={styles.intro}>
          <h1 id="tools-page-title">Ferramentas para planejar melhor.</h1>
          <p>Encontre apoio para pensar nos custos, comparar valores e organizar uma compra compartilhada.</p>
          <p>As cinco ferramentas estão em construção. Conheça o que estamos preparando.</p>
        </div>
        <ToolsList />
      </section>}
    </main>
    <footer><p className={styles.footnote}>Loti · Favoritos, compras e custos no mesmo lugar.</p></footer>
  </div>;
}
