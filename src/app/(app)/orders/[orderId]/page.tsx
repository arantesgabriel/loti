import {eq} from "drizzle-orm";
import {notFound} from "next/navigation";
import {db} from "@/lib/db";
import {purchaseCostOrders,purchaseCostTrackings} from "@/lib/db/schema";
import {requireUser} from "@/lib/auth/session";
import {authorization} from "@/lib/domain/authorization";
import {PackageCostDetailScreen} from "@/components/packages/package-cost-detail-screen";
type SearchParams = Record<string, string | string[] | undefined>;
function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function safeOrdersReturnTo(value: string) {
  try {
    const parsed = new URL(value, "https://loti.invalid");
    if (parsed.origin !== "https://loti.invalid" || parsed.pathname !== "/orders") return "/orders";
    const params = new URLSearchParams();
    for (const key of ["search", "account", "person", "origin", "trackingId", "status", "view", "page"]) {
      const content = parsed.searchParams.get(key);
      if (content && content.length <= 200) params.set(key, content);
    }
    const query = params.toString();
    return query ? `/orders?${query}` : "/orders";
  } catch { return "/orders"; }
}
export default async function OrderPage({params,searchParams}:{params:Promise<{orderId:string}>;searchParams:Promise<SearchParams>}){
  const user=await requireUser(),{orderId}=await params,query=await searchParams;
  const order=await db.select().from(purchaseCostOrders).where(eq(purchaseCostOrders.id,orderId)).get();
  const tracking=await db.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.id,order?.trackingId??orderId)).get();
  if(!tracking)notFound();
  await authorization(db,user.id).requireWorkspaceMember(tracking.workspaceId);
  return <PackageCostDetailScreen trackingId={tracking.id} orders returnTo={safeOrdersReturnTo(first(query.returnTo))} focusItemId={first(query.item).slice(0,200)}/>;
}
