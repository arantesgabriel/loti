import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  metadataBase: new URL("https://useloti.com"),
  title: { absolute: "Loti | Organize favoritos, compras e custos de importação" },
  description: "Organize seus favoritos, acompanhe compras e visualize custos de importação em um só lugar. Conheça o Loti.",
  alternates: { canonical: "/landing" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Loti",
    url: "/landing",
    title: "Loti | Organize favoritos, compras e custos de importação",
    description: "Seus favoritos, compras e custos no mesmo lugar.",
    images: [{ url: "/landing/social-card.png", width: 1200, height: 630, alt: "Loti. Suas importações, tudo em um só lugar. Favoritos, compras e custos." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Loti | Organize favoritos, compras e custos de importação",
    description: "Seus favoritos, compras e custos no mesmo lugar.",
    images: [{ url: "/landing/social-card.png", alt: "Loti. Suas importações, tudo em um só lugar. Favoritos, compras e custos." }],
  },
  robots: { index: false, follow: false },
};

export default function Landing() {
  return <LandingPage />;
}
