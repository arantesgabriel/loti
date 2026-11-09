import { Bookmark } from "lucide-react";
import styles from "./landing.module.css";

export function LandingFooter() {
  return <footer className={styles.footer}>
    <a className={styles.brand} href="#inicio" aria-label="Loti, voltar ao início"><Bookmark size={24} fill="currentColor" strokeWidth={0} aria-hidden="true"/>Loti</a>
    <p>Favoritos, compras e custos no mesmo lugar.</p>
    <a href="/login">Entrar no Loti</a>
  </footer>;
}
