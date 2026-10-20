import { and, eq, inArray } from "drizzle-orm";
import { purchaseAdditionalOrderItems, purchaseCostOrders, purchaseCostRefunds, purchaseCostTrackings, purchaseItemCosts, purchaseItems, purchases } from "../db/schema";
import type { CostTransaction } from "./purchase-cost-initialization";
import type { RefundProductOrigin } from "./hubbuy-rights-presentation";

/** Resolve only references belonging to this authorized account/workspace, in bounded batches. */
export async function readRefundProductOrigins(tx: CostTransaction, account: { id: string; workspaceId: string }, refundIds: string[]): Promise<RefundProductOrigin[]> {
  const ids = [...new Set(refundIds)];
  const result: RefundProductOrigin[] = [];
  for (let offset = 0; offset < ids.length; offset += 400) {
    const rows = await tx.select({
      refundId: purchaseCostRefunds.id, costItemId: purchaseItemCosts.id, trackingId: purchaseCostTrackings.id,
      originalName: purchaseItems.name, originalVariant: purchaseItems.variant,
      additionalName: purchaseAdditionalOrderItems.name, additionalVariant: purchaseAdditionalOrderItems.variant,
    }).from(purchaseCostRefunds)
      .innerJoin(purchaseItemCosts, and(eq(purchaseItemCosts.id, purchaseCostRefunds.costItemId), eq(purchaseItemCosts.trackingId, purchaseCostRefunds.trackingId)))
      .innerJoin(purchaseCostTrackings, and(eq(purchaseCostTrackings.id, purchaseItemCosts.trackingId), eq(purchaseCostTrackings.workspaceId, account.workspaceId)))
      .innerJoin(purchases, and(eq(purchases.id, purchaseCostTrackings.purchaseId), eq(purchases.workspaceId, account.workspaceId)))
      .innerJoin(purchaseCostOrders, and(eq(purchaseCostOrders.id, purchaseItemCosts.orderId), eq(purchaseCostOrders.trackingId, purchaseCostTrackings.id)))
      .leftJoin(purchaseItems, and(eq(purchaseItems.id, purchaseItemCosts.purchaseItemId), eq(purchaseItems.purchaseId, purchaseCostTrackings.purchaseId), eq(purchaseCostOrders.kind, "original")))
      .leftJoin(purchaseAdditionalOrderItems, and(eq(purchaseAdditionalOrderItems.id, purchaseItemCosts.additionalOrderItemId), eq(purchaseAdditionalOrderItems.orderId, purchaseCostOrders.id), eq(purchaseCostOrders.kind, "additional"), eq(purchaseCostOrders.accountId, account.id)))
      .where(and(inArray(purchaseCostRefunds.id, ids.slice(offset, offset + 400)), eq(purchaseCostRefunds.hubbuyAccountId, account.id))).all();
    for (const row of rows) {
      const name = row.originalName ?? row.additionalName;
      if (name) result.push({ refundId: row.refundId, costItemId: row.costItemId, trackingId: row.trackingId, name, variant: row.originalName !== null ? row.originalVariant : row.additionalVariant });
    }
  }
  return result;
}
