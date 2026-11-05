import { LogisticsPackagesScreen } from "@/components/orders/logistics-packages-screen";
import { packageListQuerySchema } from "@/lib/domain/logistics-package-list";

type PageSearchParams = Record<string, string | string[] | undefined>;
export default async function PackagesPage({ searchParams }: { searchParams: Promise<PageSearchParams> }) {
  const params = await searchParams;
  const query = packageListQuerySchema.parse(Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])));
  return <LogisticsPackagesScreen initialQuery={query} />;
}
