import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import { ThemeProvider } from "@/components/theme-provider";
import { themeBootstrap } from "@/lib/theme";
import "./globals.css";
const geist = localFont({ src: "../assets/GeistVariable.woff2", variable: "--font-geist", display: "swap" });
export const metadata: Metadata = { title: { default: "Loti", template: "%s · Loti" }, description: "Seus favoritos. A compra de todo mundo.", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" suppressHydrationWarning>
    <head><Script id="loti-theme" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeBootstrap }}/></head>
    <body className={geist.variable}><ThemeProvider>{children}</ThemeProvider></body>
  </html>;
}
