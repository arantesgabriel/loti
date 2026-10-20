import type { Metadata } from "next";
import { AuthEmailScreen } from "@/components/auth-email-screen";
export const metadata: Metadata = { title: "Recuperar senha", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function ForgotPassword() { return <AuthEmailScreen mode="forgot"/>; }
