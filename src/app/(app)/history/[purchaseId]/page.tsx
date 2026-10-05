import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { createServices } from "@/lib/domain/services";
import { DomainError } from "@/lib/domain/errors";
import { HistoricalPurchase } from "@/components/purchase/history-screen";
export default async function Detail({ params }: { params: Promise<{ purchaseId: string }> }) {
  const { purchaseId } = await params;
  const user = await requireUser();
  try { if (createServices(db, user.id).requirePurchase(purchaseId).status !== "finalized") notFound(); }
  catch (e) { if (e instanceof DomainError) notFound(); throw e; }
  return <HistoricalPurchase id={purchaseId}/>;
}
