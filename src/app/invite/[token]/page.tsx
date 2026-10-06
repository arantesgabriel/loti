import type { Metadata } from "next";
import { InviteScreen } from "@/components/invite-screen";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Convite para o grupo", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  return <InviteScreen token={(await params).token}/>;
}
