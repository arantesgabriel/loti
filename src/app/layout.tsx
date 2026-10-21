import type { Metadata } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/theme-provider";
import { themeBootstrap } from "@/lib/theme";
import "./globals.css";
const geist = localFont({ src: "../assets/GeistVariable.woff2", variable: "--font-geist", display: "swap" });
export const metadata: Metadata = { title: { default: "Loti", template: "%s · Loti" }, description: "Seus favoritos. A compra de todo mundo.", robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR" suppressHydrationWarning><head><script id="loti-theme" dangerouslySetInnerHTML={{ __html: themeBootstrap }}/></head><body className={geist.variable}><ThemeProvider>{children}</ThemeProvider></body></html>; }
