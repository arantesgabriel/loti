import { OrdersScreen } from "@/components/orders/orders-screen";
import { parseOrdersFilters } from "@/components/orders/orders-list-state";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const initialFilters = parseOrdersFilters(key => first(params[key]));
  const item = first(params.item);
  const initialItemId = item && item.length <= 200 && !item.includes(",") ? item : undefined;
  return <OrdersScreen key={JSON.stringify([initialFilters, initialItemId])} initialFilters={initialFilters} initialItemId={initialItemId} />;
}
