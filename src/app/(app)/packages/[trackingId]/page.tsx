import { redirect } from "next/navigation";

export default async function PackageCostDetailPage({ params }: { params: Promise<{ trackingId: string }> }) {
  const { trackingId } = await params;
  redirect(`/orders/${encodeURIComponent(trackingId)}`);
}
