import {freightPaidSql} from "./logistics-package-status";
import {sql,type SQL} from "drizzle-orm";
import type {AppDatabase} from "../db/connection";
import type {warehouseQuerySchema} from "./warehouse-services";
import type {z} from "zod";

/** Filter and page identities before loading metadata, unit arrays or financial projections. */
export async function warehousePage(db:Pick<AppDatabase,"all">,workspaceId:string,q:z.infer<typeof warehouseQuerySchema>){
  const cancelled=sql`EXISTS(SELECT 1 FROM purchase_cost_refunds f WHERE f.cost_item_id=w.cost_item_id AND f.status!='voided' AND j.value>=f.unit_start AND j.value<f.unit_start+f.quantity)`;
  const reserved=sql`EXISTS(SELECT 1 FROM logistics_reservations r WHERE r.cost_item_id=w.cost_item_id AND r.released_at IS NULL AND r.unit_index=j.value)`;
  const promoted=sql`p.content_closed_at IS NOT NULL AND ${freightPaidSql("p")}`;
  const stage:Record<string,SQL>={
    review:sql`w.review_state='pending_review'`,
    available:sql`w.review_state='confirmed' AND EXISTS(SELECT 1 FROM json_each(w.received_units) j WHERE NOT ${cancelled} AND NOT ${reserved})`,
    warehouse:sql`EXISTS(SELECT 1 FROM json_each(w.received_units) j WHERE NOT ${cancelled} AND NOT EXISTS(SELECT 1 FROM logistics_reservations r JOIN logistics_packages p ON p.id=r.package_id WHERE r.cost_item_id=w.cost_item_id AND r.released_at IS NULL AND r.unit_index=j.value AND (p.stage!='preparing' OR (${promoted}))))`,
    awaiting:sql`coalesce(i.quantity,a.quantity)-(SELECT coalesce(sum(f.quantity),0) FROM purchase_cost_refunds f WHERE f.cost_item_id=w.cost_item_id AND f.status!='voided')>(SELECT count(*) FROM json_each(w.received_units) j WHERE NOT ${cancelled})`,
    package:sql`EXISTS(SELECT 1 FROM logistics_reservations r JOIN logistics_packages p ON p.id=r.package_id WHERE r.cost_item_id=w.cost_item_id AND r.released_at IS NULL AND p.stage='preparing' AND (${promoted}))`,
    sent:sql`EXISTS(SELECT 1 FROM logistics_reservations r JOIN logistics_packages p ON p.id=r.package_id WHERE r.cost_item_id=w.cost_item_id AND r.released_at IS NULL AND p.stage='sent')`,
    received:sql`EXISTS(SELECT 1 FROM logistics_reservations r JOIN logistics_packages p ON p.id=r.package_id WHERE r.cost_item_id=w.cost_item_id AND r.released_at IS NULL AND p.stage='received')`,
  };
  const filters=[sql`w.workspace_id=${workspaceId}`,sql`o.state='recorded'`,sql`NOT EXISTS(SELECT 1 FROM purchase_order_corrections x WHERE x.previous_order_id=o.id)`];
  if(q.search)filters.push(sql`instr(lower(coalesce(i.name,a.name)),lower(${q.search}))>0`);
  if(q.account)filters.push(sql`w.account_id=${q.account}`);
  if(q.person)filters.push(sql`EXISTS(SELECT 1 FROM purchase_cost_participants cp WHERE cp.cost_item_id=w.cost_item_id AND cp.person_id=${q.person})`);
  if(q.origin)filters.push(sql`o.kind=${q.origin}`);
  if(q.trackingId)filters.push(sql`c.tracking_id=${q.trackingId}`);
  if(q.packageId)filters.push(sql`EXISTS(SELECT 1 FROM logistics_reservations r WHERE r.cost_item_id=w.cost_item_id AND r.released_at IS NULL AND r.package_id=${q.packageId})`);
  if(q.status)filters.push(stage[q.status]);
  const from=sql`FROM order_warehouse_positions w JOIN purchase_item_costs c ON c.id=w.cost_item_id JOIN purchase_cost_orders o ON o.id=c.order_id LEFT JOIN purchase_items i ON i.id=c.purchase_item_id LEFT JOIN purchase_additional_order_items a ON a.id=c.additional_order_item_id WHERE ${sql.join(filters,sql` AND `)}`;
  const count=await db.all<{total:number}>(sql`SELECT count(*) AS total ${from}`);
  const ids=await db.all<{id:string}>(sql`SELECT w.cost_item_id AS id ${from} ORDER BY o.created_at DESC,o.id,c.item_order,c.id LIMIT ${q.pageSize} OFFSET ${q.page*q.pageSize}`);
  return {ids:ids.map(r=>r.id),total:count[0].total};
}
