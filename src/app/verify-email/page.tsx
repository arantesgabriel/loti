import type { Metadata } from "next";
import { AuthEmailScreen } from "@/components/auth-email-screen";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirmar email", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function VerifyEmail({ searchParams }: { searchParams: Promise<{ error?: string; returnTo?: string }> }) {
  const params = await searchParams;
  return <AuthEmailScreen mode="verified" invalid={!!params.error} returnTo={typeof params.returnTo === "string" ? params.returnTo : undefined}/>;
}
