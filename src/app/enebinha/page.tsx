import type { Metadata } from "next";
import { EnebinhaPage } from "@/components/enebinha/enebinha-page";

export const metadata: Metadata = {
  metadataBase: new URL("https://useloti.com"),
  title: "Enebinha - Sua central de importação | Loti",
  description:
    "Fornecedores, catálogos e guias para importar da China — reunidos em um só lugar por @enebinha e disponibilizados pelo Loti.",
  alternates: {
    canonical: "/enebinha",
  },
  openGraph: {
    title: "Enebinha - Sua central de importação | Loti",
    description:
      "73 fornecedores em 7 categorias, Vitrine Enebinha, 8 guias, 6 canais da comunidade e acesso à HubBuy.",
    type: "website",
    url: "/enebinha",
    images: [
      {
        url: "/enebinha/mascote-original.webp",
        width: 780,
        height: 355,
        alt: "Mascote original ENEBINHA",
      },
    ],
  },
};

export default function EnebinhaRoutePage() {
  return <EnebinhaPage />;
}