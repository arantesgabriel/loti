import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
const geist = localFont({ src: "../assets/GeistVariable.woff2", variable: "--font-geist", display: "swap" });
export const metadata: Metadata = { title: { default: "Loti", template: "%s · Loti" }, description: "Seus favoritos. A compra de todo mundo.", robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body className={geist.variable}>{children}</body></html>; }
