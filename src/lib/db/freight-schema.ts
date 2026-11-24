import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, uniqueIndex, check, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import * as s from "./schema";
import { hubbuyTopups } from "./topup-schema";

export const financialResults = sqliteTable("financial_operation_results", {
  operationId: text("operation_id").primaryKey().references(() => s.financialOperations.id), resultJson: text("result_json").notNull(),
}, t => [check("financial_result_json", sql`json_valid(${t.resultJson})`)]);

export const freightPayments = sqliteTable("package_freight_payments", {
  id: text("id").primaryKey(), packageId: text("package_id").notNull().references(() => s.logisticsPackages.id),
  operationId: text("operation_id").notNull().unique().references(() => s.financialOperations.id),
  nativeCurrency: text("native_currency", { enum: ["CNY", "BRL"] }).notNull(), nativeMinor: integer("native_minor").notNull(),
  principalBrlCents: integer("principal_brl_cents").notNull(), feeBrlCents: integer("fee_brl_cents").notNull(),
  contentHash: text("content_hash").notNull(), contentJson: text("content_json").notNull(),
  externalReference: text("external_reference"), replacesPaymentId: text("replaces_payment_id").references((): AnySQLiteColumn => freightPayments.id),
}, t => [index("freight_payment_package_idx").on(t.packageId, t.id),
  check("freight_payment_currency", sql`${t.nativeCurrency} IN ('CNY','BRL')`),
  check("freight_payment_amounts", sql`typeof(${t.nativeMinor})='integer' AND ${t.nativeMinor} BETWEEN 1 AND 1000000000000 AND typeof(${t.principalBrlCents})='integer' AND ${t.principalBrlCents} BETWEEN 0 AND 1000000000000 AND typeof(${t.feeBrlCents})='integer' AND ${t.feeBrlCents} BETWEEN 0 AND 1000000000000 AND ${t.principalBrlCents}+${t.feeBrlCents}<=1000000000000`),
  check("freight_payment_content", sql`json_valid(${t.contentJson}) AND length(${t.contentHash})=64`),
]);
export const freightHeads = sqliteTable("package_freight_heads", {
  packageId: text("package_id").primaryKey().references(() => s.logisticsPackages.id),
  paymentId: text("payment_id").unique().references(() => freightPayments.id),
});
export const freightReversals = sqliteTable("package_freight_reversals", {
  paymentId: text("payment_id").primaryKey().references(() => freightPayments.id),
  operationId: text("operation_id").notNull().unique().references(() => s.financialOperations.id),
  creditEntryId: text("credit_entry_id").references(() => s.hubbuyBalanceEntries.id),
});
export const topupFeeAllocations = sqliteTable("topup_fee_allocations", {
  id: text("id").primaryKey(), topupId: text("topup_id").notNull().references(() => hubbuyTopups.id),
  operationId: text("operation_id").notNull().references(() => s.financialOperations.id),
  freightPaymentId: text("freight_payment_id").references(() => freightPayments.id),
  orderId: text("order_id").references(() => s.purchaseCostOrders.id),
  amountBrlCents: integer("amount_brl_cents").notNull(),
  reversesId: text("reverses_id").unique().references((): AnySQLiteColumn => topupFeeAllocations.id),
}, t => [index("topup_fee_capacity_idx").on(t.topupId), index("topup_fee_order_idx").on(t.orderId),
  check("topup_fee_destination", sql`(${t.freightPaymentId} IS NOT NULL AND ${t.orderId} IS NULL) OR (${t.freightPaymentId} IS NULL AND ${t.orderId} IS NOT NULL)`),
  check("topup_fee_amount", sql`typeof(${t.amountBrlCents})='integer' AND ${t.amountBrlCents} BETWEEN 1 AND 1000000000000`),
]);
export const topupFeeOrderShares = sqliteTable("topup_fee_order_shares", {
  id: text("id").primaryKey(), feeAllocationId: text("fee_allocation_id").notNull().references(() => topupFeeAllocations.id),
  costItemId: text("cost_item_id").notNull().references(() => s.purchaseItemCosts.id),
  personId: text("person_id").notNull().references(() => s.user.id),
  amountBrlCents: integer("amount_brl_cents").notNull(),
}, t => [index("topup_fee_item_idx").on(t.costItemId), check("topup_fee_share_amount", sql`typeof(${t.amountBrlCents})='integer' AND ${t.amountBrlCents} BETWEEN 1 AND 1000000000000`)]);
export const topupFeeFunders = sqliteTable("topup_fee_funders", {
  id: text("id").primaryKey(), feeAllocationId: text("fee_allocation_id").notNull().references(() => topupFeeAllocations.id),
  personId: text("person_id").notNull().references(() => s.user.id), amountBrlCents: integer("amount_brl_cents").notNull(),
}, t => [uniqueIndex("topup_fee_funder_person_idx").on(t.feeAllocationId, t.personId), check("topup_fee_funder_amount", sql`typeof(${t.amountBrlCents})='integer' AND ${t.amountBrlCents} BETWEEN 1 AND 1000000000000`)]);
export const freightSources = sqliteTable("package_freight_sources", {
  id: text("id").primaryKey(), paymentId: text("payment_id").notNull().references(() => freightPayments.id),
  personId: text("person_id").notNull().references(() => s.user.id),
  kind: text("kind", { enum: ["balance", "pix", "card", "topup_fee"] }).notNull(),
  nativeMinor: integer("native_minor").notNull(), principalBrlCents: integer("principal_brl_cents").notNull(), feeBrlCents: integer("fee_brl_cents").notNull(),
  consumptionId: text("consumption_id").unique().references(() => s.hubbuyBalanceConsumptions.id),
  feeAllocationId: text("fee_allocation_id").references(() => topupFeeAllocations.id),
  feeBps: integer("fee_bps"),
}, t => [index("freight_source_payment_idx").on(t.paymentId),
  check("freight_source_amounts", sql`typeof(${t.nativeMinor})='integer' AND ${t.nativeMinor} BETWEEN 0 AND 1000000000000 AND typeof(${t.principalBrlCents})='integer' AND ${t.principalBrlCents} BETWEEN 0 AND 1000000000000 AND typeof(${t.feeBrlCents})='integer' AND ${t.feeBrlCents} BETWEEN 0 AND 1000000000000`),
  check("freight_source_origin", sql`(${t.kind}='balance' AND ${t.nativeMinor}>0 AND ${t.consumptionId} IS NOT NULL AND ${t.feeAllocationId} IS NULL AND ${t.feeBrlCents}=0) OR (${t.kind} IN ('pix','card') AND ${t.nativeMinor}>0 AND ${t.principalBrlCents}>0 AND ${t.consumptionId} IS NULL AND ${t.feeAllocationId} IS NULL) OR (${t.kind}='topup_fee' AND ${t.nativeMinor}=0 AND ${t.principalBrlCents}=0 AND ${t.feeBrlCents}>0 AND ${t.feeAllocationId} IS NOT NULL AND ${t.consumptionId} IS NULL)`),
]);
export const freightAllocations = sqliteTable("package_freight_allocations", {
  id: text("id").primaryKey(), paymentId: text("payment_id").notNull().references(() => freightPayments.id),
  sourceId: text("source_id").notNull().references(() => freightSources.id),
  contentHash: text("content_hash").notNull(), costItemId: text("cost_item_id").notNull().references(() => s.purchaseItemCosts.id),
  unitIndex: integer("unit_index").notNull(), personId: text("person_id").notNull().references(() => s.user.id),
  component: text("component", { enum: ["native", "historical", "fee"] }).notNull(), amountMinor: integer("amount_minor").notNull(),
}, t => [index("freight_allocation_read_idx").on(t.paymentId, t.contentHash),
  uniqueIndex("freight_allocation_cell_idx").on(t.paymentId, t.contentHash, t.sourceId, t.costItemId, t.unitIndex, t.personId, t.component),
  check("freight_allocation_amount", sql`typeof(${t.amountMinor})='integer' AND ${t.amountMinor} BETWEEN 1 AND 1000000000000 AND typeof(${t.unitIndex})='integer' AND ${t.unitIndex}>=0 AND ${t.component} IN ('native','historical','fee')`),
]);
export const settlementVersions = sqliteTable("package_settlement_versions", {
  id: text("id").primaryKey(), packageId: text("package_id").notNull().references(() => s.logisticsPackages.id),
  paymentId: text("payment_id").notNull().references(() => freightPayments.id), operationId: text("operation_id").notNull().unique().references(() => s.financialOperations.id),
  sequence: integer("sequence").notNull(), previousId: text("previous_id").references((): AnySQLiteColumn => settlementVersions.id),
  contentHash: text("content_hash").notNull(), policy: text("policy", { enum: ["direct", "centralized"] }).notNull(),
  centralizerId: text("centralizer_id").references(() => s.user.id),
  fromCnyMinor: integer("from_cny_minor"), toBrlCents: integer("to_brl_cents"), pairDate: text("pair_date"), pairReason: text("pair_reason"), pairTopupId: text("pair_topup_id").references(() => hubbuyTopups.id),
  snapshotJson: text("snapshot_json").notNull(),
}, t => [uniqueIndex("settlement_version_sequence_idx").on(t.packageId, t.sequence),
  check("settlement_version_policy", sql`(${t.policy}='direct' AND ${t.centralizerId} IS NULL) OR (${t.policy}='centralized' AND ${t.centralizerId} IS NOT NULL)`),
  check("settlement_version_snapshot", sql`json_valid(${t.snapshotJson}) AND typeof(${t.sequence})='integer' AND ${t.sequence}>0`),
  check("settlement_version_pair", sql`(${t.fromCnyMinor} IS NULL AND ${t.toBrlCents} IS NULL) OR (typeof(${t.fromCnyMinor})='integer' AND ${t.fromCnyMinor} BETWEEN 1 AND 1000000000000 AND typeof(${t.toBrlCents})='integer' AND ${t.toBrlCents} BETWEEN 1 AND 1000000000000 AND ${t.pairDate} IS NOT NULL AND ${t.pairReason} IS NOT NULL)`),
]);
export const settlementClaims = sqliteTable("package_settlement_claims", {
  id: text("id").primaryKey(), versionId: text("version_id").notNull().references(() => settlementVersions.id),
  debtorId: text("debtor_id").notNull().references(() => s.user.id), creditorId: text("creditor_id").notNull().references(() => s.user.id),
  currency: text("currency", { enum: ["CNY", "BRL"] }).notNull(), amountMinor: integer("amount_minor").notNull(),
  component: text("component", { enum: ["principal", "fee", "net", "correction"] }).notNull(), lineageJson: text("lineage_json").notNull(),
}, t => [index("settlement_claim_version_idx").on(t.versionId), check("settlement_claim_amount", sql`${t.debtorId}!=${t.creditorId} AND ${t.currency} IN ('CNY','BRL') AND typeof(${t.amountMinor})='integer' AND ${t.amountMinor} BETWEEN 1 AND 1000000000000 AND json_valid(${t.lineageJson})`)]);
export const settlementReceipts = sqliteTable("package_settlement_receipts", {
  id: text("id").primaryKey(), packageId: text("package_id").notNull().references(() => s.logisticsPackages.id),
  versionId: text("version_id").notNull().references(() => settlementVersions.id), operationId: text("operation_id").notNull().unique().references(() => s.financialOperations.id),
  debtorId: text("debtor_id").notNull().references(() => s.user.id), creditorId: text("creditor_id").notNull().references(() => s.user.id),
  amountBrlCents: integer("amount_brl_cents").notNull(), excessBrlCents: integer("excess_brl_cents").notNull(),
  returnsReceiptId: text("returns_receipt_id").references((): AnySQLiteColumn => settlementReceipts.id), externalReference: text("external_reference"),
}, t => [index("settlement_receipt_package_idx").on(t.packageId), check("settlement_receipt_amount", sql`${t.debtorId}!=${t.creditorId} AND typeof(${t.amountBrlCents})='integer' AND ${t.amountBrlCents} BETWEEN 1 AND 1000000000000 AND typeof(${t.excessBrlCents})='integer' AND ${t.excessBrlCents} BETWEEN 0 AND ${t.amountBrlCents}`)]);
export const settlementReceiptAllocations = sqliteTable("package_settlement_receipt_allocations", {
  id: text("id").primaryKey(), receiptId: text("receipt_id").notNull().references(() => settlementReceipts.id),
  claimId: text("claim_id").notNull().references(() => settlementClaims.id), amountBrlCents: integer("amount_brl_cents").notNull(),
}, t => [uniqueIndex("receipt_claim_pair_idx").on(t.receiptId, t.claimId), index("receipt_claim_capacity_idx").on(t.claimId), check("receipt_allocation_amount", sql`typeof(${t.amountBrlCents})='integer' AND ${t.amountBrlCents} BETWEEN 1 AND 1000000000000`)]);
export const settlementReceiptReversals = sqliteTable("package_settlement_receipt_reversals", {
  receiptId: text("receipt_id").primaryKey().references(() => settlementReceipts.id), operationId: text("operation_id").notNull().unique().references(() => s.financialOperations.id),
});
