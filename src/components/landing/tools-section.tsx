import { ArrowUpRight, Calculator, Coins, ReceiptText, Table2, UsersRound } from "lucide-react";
import Link from "next/link";
import { landingContent } from "./landing-content";
import { landingTools, toolHref, type LandingTool } from "./landing-tools";
import styles from "./tools.module.css";
import landingStyles from "./landing.module.css";

const icons = { calculator: Calculator, receipt: ReceiptText, currencies: Coins, people: UsersRound, table: Table2 };
export function ToolIcon({ tool, size = 24 }: { tool: LandingTool; size?: number }) {
  const Icon = icons[tool.icon];
  return <Icon size={size} aria-hidden="true" />;
}

export function ToolsList() {
  return <ul className={styles.list}>
    {landingTools.map(tool => <li key={tool.slug}>
      <Link className={styles.tool} href={toolHref(tool)} prefetch={false}>
        <span className={styles.icon}><ToolIcon tool={tool} /></span>
        <div className={styles.copy}><h3>{tool.title}</h3><p>{tool.description}</p></div>
        <ArrowUpRight className={styles.arrow} size={20} aria-hidden="true" />
      </Link>
    </li>)}
  </ul>;
}

export function ToolsSection() {
  return <section id="ferramentas" className={landingStyles.section} aria-labelledby="tools-title">
    <div className={landingStyles.sectionIntro}>
      <h2 id="tools-title">{landingContent.tools.title}</h2>
      <p>{landingContent.tools.description}</p>
    </div>
    <ToolsList />
    <Link className={styles.allTools} href="/ferramentas" prefetch={false}>Explorar todas as ferramentas <ArrowUpRight size={18} aria-hidden="true" /></Link>
  </section>;
}
