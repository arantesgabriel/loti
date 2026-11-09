import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LandingPage } from "@/components/landing/landing-page";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  metadataBase: new URL("https://useloti.com"),
  title: { absolute: "Loti | Organize favoritos, compras e custos de importação" },
  description: "Organize seus favoritos, acompanhe compras e visualize custos de importação em um só lugar. Conheça o Loti.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Loti",
    url: "/",
    title: "Loti | Organize favoritos, compras e custos de importação",
    description: "Seus favoritos, compras e custos no mesmo lugar.",
    images: [
      {
        url: "/landing/social-card.png",
        width: 1200,
        height: 630,
        alt: "Loti. Suas importações, tudo em um só lugar. Favoritos, compras e custos.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Loti | Organize favoritos, compras e custos de importação",
    description: "Seus favoritos, compras e custos no mesmo lugar.",
    images: [
      {
        url: "/landing/social-card.png",
        alt: "Loti. Suas importações, tudo em um só lugar. Favoritos, compras e custos.",
      },
    ],
  },
  robots: { index: false, follow: false },
};

export default async function Home() {
  const requestHeaders = await headers();
  const cookieHeader = requestHeaders.get("cookie") ?? "";
  let isAuthenticated = false;

  if (cookieHeader.includes("better-auth.session_token")) {
    try {
      const session = await auth.api.getSession({ headers: requestHeaders });
      isAuthenticated = Boolean(session?.user);
    } catch {
      isAuthenticated = false;
    }
  }

  if (isAuthenticated) {
    redirect("/favorites");
  }

  return <LandingPage />;
}
