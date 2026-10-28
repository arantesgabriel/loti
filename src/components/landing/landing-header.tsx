import { Bookmark } from "lucide-react";
import styles from "./landing.module.css";

export function LandingHeader() {
  return <header className={styles.header}>
    <a className={styles.brand} href="#inicio" aria-label="Loti, início"><Bookmark size={27} fill="currentColor" strokeWidth={0} aria-hidden="true"/>Loti</a>
    <nav className={styles.navigation} aria-label="Navegação da página">
      <a href="#produto">Produto</a>
      <a href="#como-funciona">Como funciona</a>
      <a href="#ferramentas">Ferramentas</a>
    </nav>
    <a className={styles.login} href="/login">Entrar</a>
  </header>;
}
