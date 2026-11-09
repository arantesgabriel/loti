import type { Metadata } from "next";
import { SignupScreen } from "@/components/signup-screen";
import "../login/login.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Criar conta", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function SignupPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  return <SignupScreen referralToken={ref && /^[A-Za-z0-9_-]{43}$/.test(ref) ? ref : ""} />;
}
