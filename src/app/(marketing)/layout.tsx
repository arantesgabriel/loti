import type { Metadata } from "next";
import styles from "./marketing.module.css";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function MarketingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={styles.boundary}>{children}</div>;
}
