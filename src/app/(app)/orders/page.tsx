import { OrdersScreen, type OrdersFilters } from "@/components/orders/orders-screen";
import { ordersView } from "@/components/orders/orders-list-state";

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
  const page = Number(first(params.page));
  const initialFilters: OrdersFilters = {
    search: first(params.search).slice(0, 200),
    account: first(params.account).slice(0, 200),
    person: first(params.person).slice(0, 200),
    origin: ["original", "additional"].includes(first(params.origin))
      ? first(params.origin)
      : "",
    trackingId: first(params.trackingId).slice(0, 200),
    status: ["review", "awaiting", "warehouse", "available", "package", "sent", "received"].includes(first(params.status))
      ? first(params.status)
      : "",
    view: ordersView(first(params.view)),
    page: Number.isSafeInteger(page) && page >= 0 ? Math.min(page, 10000) : 0,
  };
  return <OrdersScreen key={JSON.stringify(initialFilters)} initialFilters={initialFilters} />;
}
