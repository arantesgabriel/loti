import type { Metadata } from "next";
import { ToolsPage } from "@/components/landing/tools-page";

export const metadata: Metadata = {
  metadataBase: new URL("https://useloti.com"),
  alternates: { canonical: "/ferramentas" },
  title: "Ferramentas para importação",
  description: "Conheça as ferramentas que o Loti está preparando para ajudar no planejamento da sua importação.",
  robots: { index: false, follow: false },
};

export default function Tools() { return <ToolsPage />; }
