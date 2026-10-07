import { PackageCostDetailScreen } from "@/components/packages/package-cost-detail-screen";

export default async function PackageCostDetailPage({ params }: { params: Promise<{ trackingId: string }> }) {
  const { trackingId } = await params;
  return <PackageCostDetailScreen trackingId={trackingId} />;
}
