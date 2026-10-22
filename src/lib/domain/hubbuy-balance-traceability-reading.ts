import { and, eq, inArray } from "drizzle-orm";
import { financialOperations, hubbuyBalanceEntries, purchaseAdditionalOrderItems, purchaseCostCharges, purchaseCostOrders, purchaseCostRefundParticipants, purchaseCostRefunds, purchaseCostTrackings, purchaseItemCosts, purchaseItems, purchasePaymentAllocations, purchasePaymentComponents, purchases, user } from "../db/schema";
import type { CostTransaction } from "./purchase-cost-initialization";
import type { RefundProductOrigin, ManualOrigin } from "./hubbuy-rights-presentation";
import type { PaidOriginCost, TraceContext } from "./hubbuy-balance-traceability";
import { MAX_FINANCIAL_MINOR } from "./financial-money";
import { DomainError } from "./errors";

const iso = (date: Date | null) => date?.toISOString() ?? null;
function addCost(...values: number[]) {
  if (values.some(value => !Number.isSafeInteger(value) || value < 0)) throw new DomainError("Base histórica inválida.", 409);
  const total = values.reduce((sum, value) => sum + BigInt(value), 0n);
  if (total > BigInt(MAX_FINANCIAL_MINOR)) throw new DomainError("A base histórica excede o limite permitido.", 409);
  return Number(total);
}

/** Only authorized relationships are used to label financial sources and destinations. */
export async function readBalanceTraceContext(tx: CostTransaction, account: { id: string; workspaceId: string }, products: RefundProductOrigin[], adjustments: ManualOrigin[]): Promise<TraceContext> {
  const operations = await tx.select({ entryId: hubbuyBalanceEntries.id, recordedAt: financialOperations.recordedAt, occurredAt: financialOperations.occurredAt, reason: financialOperations.reason })
    .from(hubbuyBalanceEntries).innerJoin(financialOperations, and(eq(financialOperations.id, hubbuyBalanceEntries.operationId), eq(financialOperations.workspaceId, account.workspaceId)))
    .where(eq(hubbuyBalanceEntries.accountId, account.id)).all();
  const destinations = await tx.select({ allocationId: purchasePaymentAllocations.id, beneficiaryId: purchasePaymentAllocations.personId, beneficiaryName: user.name, originalName: purchaseItems.name, additionalName: purchaseAdditionalOrderItems.name, orderId: purchaseCostOrders.id, orderReference: purchaseCostOrders.externalReference })
    .from(hubbuyBalanceEntries)
    .innerJoin(purchaseCostOrders, and(eq(purchaseCostOrders.id, hubbuyBalanceEntries.sourceId), eq(purchaseCostOrders.accountId, account.id)))
    .innerJoin(purchaseCostTrackings, and(eq(purchaseCostTrackings.id, purchaseCostOrders.trackingId), eq(purchaseCostTrackings.workspaceId, account.workspaceId)))
    .innerJoin(purchases, and(eq(purchases.id, purchaseCostTrackings.purchaseId), eq(purchases.workspaceId, account.workspaceId)))
    .innerJoin(purchaseItemCosts, and(eq(purchaseItemCosts.orderId, purchaseCostOrders.id), eq(purchaseItemCosts.trackingId, purchaseCostTrackings.id)))
    .innerJoin(purchasePaymentComponents, and(eq(purchasePaymentComponents.orderId, purchaseCostOrders.id), eq(purchasePaymentComponents.operationId, hubbuyBalanceEntries.operationId), eq(purchasePaymentComponents.sourceAccountId, account.id)))
    .innerJoin(purchasePaymentAllocations, and(eq(purchasePaymentAllocations.componentId, purchasePaymentComponents.id), eq(purchasePaymentAllocations.costItemId, purchaseItemCosts.id)))
    .innerJoin(user, eq(user.id, purchasePaymentAllocations.personId))
    .leftJoin(purchaseItems, and(eq(purchaseItems.id, purchaseItemCosts.purchaseItemId), eq(purchaseItems.purchaseId, purchaseCostTrackings.purchaseId), eq(purchaseCostOrders.kind, "original")))
    .leftJoin(purchaseAdditionalOrderItems, and(eq(purchaseAdditionalOrderItems.id, purchaseItemCosts.additionalOrderItemId), eq(purchaseAdditionalOrderItems.orderId, purchaseCostOrders.id), eq(purchaseCostOrders.kind, "additional")))
    .where(and(eq(hubbuyBalanceEntries.accountId, account.id), eq(hubbuyBalanceEntries.sourceType, "purchase_payment"), eq(hubbuyBalanceEntries.direction, "debit"))).all();

  const costs: TraceContext["costs"] = [];
  const refundIds = [...new Set(products.map(row => row.refundId))];
  const legacyCosts = new Map<string, { costItemId: string; personId: string; cost: PaidOriginCost | null }>();
  for (let offset = 0; offset < refundIds.length; offset += 400) {
    const rows = await tx.select({ costItemId: purchaseCostRefunds.costItemId, personId: purchaseCostRefundParticipants.personId, product: purchaseCostRefundParticipants.originalProductShareCents, china: purchaseCostRefundParticipants.originalChinaShareCents, fee: purchaseCostRefundParticipants.originalProductFeeShareCents, paidAt: purchaseCostRefunds.originalPaidAt, method: purchaseCostRefunds.originalPaymentMethod, kind: purchaseCostOrders.kind })
      .from(purchaseCostRefunds)
      .innerJoin(purchaseCostRefundParticipants, eq(purchaseCostRefundParticipants.refundId, purchaseCostRefunds.id))
      .innerJoin(purchaseItemCosts, and(eq(purchaseItemCosts.id, purchaseCostRefunds.costItemId), eq(purchaseItemCosts.trackingId, purchaseCostRefunds.trackingId)))
      .innerJoin(purchaseCostOrders, and(eq(purchaseCostOrders.id, purchaseItemCosts.orderId), eq(purchaseCostOrders.trackingId, purchaseItemCosts.trackingId)))
      .innerJoin(purchaseCostTrackings, and(eq(purchaseCostTrackings.id, purchaseItemCosts.trackingId), eq(purchaseCostTrackings.workspaceId, account.workspaceId)))
      .where(and(inArray(purchaseCostRefunds.id, refundIds.slice(offset, offset + 400)), eq(purchaseCostRefunds.hubbuyAccountId, account.id))).all();
    for (const row of rows) {
      if (row.kind !== "original" || !row.paidAt) continue;
      // These snapshots cover the entire item/person, not each cancelled range.
      const cost: PaidOriginCost = { scope: "item", principalBrlCents: addCost(row.product, row.china), feeBrlCents: row.fee, totalBrlCents: addCost(row.product, row.china, row.fee), newMoneyBrlCents: row.method ? addCost(row.product, row.china, row.fee) : null, previousBalanceCnyMinor: row.method ? 0 : null, previousBalanceHistoricalBrlCents: row.method ? 0 : null };
      const key = `${row.costItemId}:${row.personId}`, previous = legacyCosts.get(key);
      legacyCosts.set(key, { costItemId: row.costItemId, personId: row.personId, cost: previous && JSON.stringify(previous.cost) !== JSON.stringify(cost) ? null : cost });
    }
  }
  for (const row of legacyCosts.values()) if (row.cost) costs.push({ ...row, cost: row.cost });
  const costIds = [...new Set(products.map(row => row.costItemId))];
  for (let offset = 0; offset < costIds.length; offset += 400) {
    const rows = await tx.select({ costItemId: purchaseItemCosts.id, personId: purchasePaymentAllocations.personId, source: purchasePaymentComponents.sourceType, cny: purchasePaymentAllocations.cnyMinor, principal: purchasePaymentAllocations.principalBrlCents, fee: purchasePaymentAllocations.feeBrlCents })
      .from(purchaseItemCosts)
      .innerJoin(purchaseCostOrders, and(eq(purchaseCostOrders.id, purchaseItemCosts.orderId), eq(purchaseCostOrders.trackingId, purchaseItemCosts.trackingId), eq(purchaseCostOrders.accountId, account.id), eq(purchaseCostOrders.kind, "additional")))
      .innerJoin(purchaseCostTrackings, and(eq(purchaseCostTrackings.id, purchaseCostOrders.trackingId), eq(purchaseCostTrackings.workspaceId, account.workspaceId)))
      .innerJoin(purchasePaymentComponents, eq(purchasePaymentComponents.orderId, purchaseCostOrders.id))
      .innerJoin(purchaseCostCharges, and(eq(purchaseCostCharges.id, purchasePaymentComponents.chargeId), eq(purchaseCostCharges.orderId, purchaseCostOrders.id), eq(purchaseCostCharges.paymentStatus, "paid")))
      .innerJoin(purchasePaymentAllocations, and(eq(purchasePaymentAllocations.componentId, purchasePaymentComponents.id), eq(purchasePaymentAllocations.costItemId, purchaseItemCosts.id)))
      .where(inArray(purchaseItemCosts.id, costIds.slice(offset, offset + 400))).all();
    const totals = new Map<string, { costItemId: string; personId: string; cost: PaidOriginCost }>();
    for (const row of rows) {
      const key = `${row.costItemId}:${row.personId}`;
      const total = totals.get(key) ?? { costItemId: row.costItemId, personId: row.personId, cost: { scope: "item", principalBrlCents: 0, feeBrlCents: 0, totalBrlCents: 0, newMoneyBrlCents: 0, previousBalanceCnyMinor: 0, previousBalanceHistoricalBrlCents: 0 } };
      total.cost.principalBrlCents = addCost(total.cost.principalBrlCents, row.principal); total.cost.feeBrlCents = addCost(total.cost.feeBrlCents, row.fee); total.cost.totalBrlCents = addCost(total.cost.totalBrlCents, row.principal, row.fee);
      if (row.source === "balance") { total.cost.previousBalanceCnyMinor = addCost(total.cost.previousBalanceCnyMinor!, row.cny); total.cost.previousBalanceHistoricalBrlCents = addCost(total.cost.previousBalanceHistoricalBrlCents!, row.principal); }
      else total.cost.newMoneyBrlCents = addCost(total.cost.newMoneyBrlCents!, row.principal, row.fee);
      totals.set(key, total);
    }
    costs.push(...totals.values());
  }
  return { products, adjustments, costs, operations: operations.map(row => ({ ...row, recordedAt: iso(row.recordedAt), occurredAt: iso(row.occurredAt) })), destinations: destinations.flatMap(row => {
    const label = row.originalName ?? row.additionalName;
    return label ? [{ allocationId: row.allocationId, beneficiaryId: row.beneficiaryId, beneficiaryName: row.beneficiaryName, label, orderReference: row.orderReference ?? row.orderId }] : [];
  }) };
}
