import { sql } from "drizzle-orm";
import { sqliteTable,text,integer,index,uniqueIndex,check } from "drizzle-orm/sqlite-core";
import { financialOperations,hubbuyBalanceEntries } from "./schema";
import { freightPayments,freightSources } from "./freight-schema";
export const freightRefunds=sqliteTable("package_freight_refunds",{
  id:text("id").primaryKey(),paymentId:text("payment_id").notNull().references(()=>freightPayments.id),operationId:text("operation_id").notNull().unique().references(()=>financialOperations.id),
  destination:text("destination",{enum:["wallet","external"]}).notNull(),nativeMinor:integer("native_minor").notNull(),historicalBrlCents:integer("historical_brl_cents").notNull(),actualBrlCents:integer("actual_brl_cents"),
  creditEntryId:text("credit_entry_id").unique().references(()=>hubbuyBalanceEntries.id),externalReference:text("external_reference"),
},t=>[index("freight_refund_payment_idx").on(t.paymentId),check("freight_refund_values",sql`typeof(${t.nativeMinor})='integer' AND ${t.nativeMinor} BETWEEN 1 AND 1000000000000 AND typeof(${t.historicalBrlCents})='integer' AND ${t.historicalBrlCents} BETWEEN 0 AND 1000000000000 AND ((${t.destination}='wallet' AND ${t.creditEntryId} IS NOT NULL AND ${t.actualBrlCents} IS NULL) OR (${t.destination}='external' AND ${t.creditEntryId} IS NULL AND typeof(${t.actualBrlCents})='integer' AND ${t.actualBrlCents} BETWEEN 0 AND 1000000000000))`)]);
export const freightRefundSources=sqliteTable("package_freight_refund_sources",{
  id:text("id").primaryKey(),refundId:text("refund_id").notNull().references(()=>freightRefunds.id),sourceId:text("source_id").notNull().references(()=>freightSources.id),nativeMinor:integer("native_minor").notNull(),historicalBrlCents:integer("historical_brl_cents").notNull(),
},t=>[uniqueIndex("freight_refund_source_idx").on(t.refundId,t.sourceId),check("freight_refund_source_values",sql`typeof(${t.nativeMinor})='integer' AND ${t.nativeMinor} BETWEEN 1 AND 1000000000000 AND typeof(${t.historicalBrlCents})='integer' AND ${t.historicalBrlCents} BETWEEN 0 AND 1000000000000`)]);
export const freightRefundReversals=sqliteTable("package_freight_refund_reversals",{
  refundId:text("refund_id").primaryKey().references(()=>freightRefunds.id),operationId:text("operation_id").notNull().unique().references(()=>financialOperations.id),debitEntryId:text("debit_entry_id").references(()=>hubbuyBalanceEntries.id),
});
