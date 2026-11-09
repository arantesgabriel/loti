import { sql } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
export async function usesOrdersWorkflow(db: Pick<AppDatabase,"select">) {
  return !!await db.select({name:sql<string>`name`}).from(sql`sqlite_master`).where(sql`type='table' AND name='order_warehouse_positions'`).get();
}
