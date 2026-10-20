import type { Metadata } from "next";
import { AuthEmailScreen } from "@/components/auth-email-screen";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nova senha", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const params = await searchParams;
  return <AuthEmailScreen mode="reset" token={typeof params.token === "string" ? params.token : undefined} invalid={!!params.error}/>;
}
