import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, uniqueIndex, index, check, primaryKey } from "drizzle-orm/sqlite-core";
import { financialOperations, hubbuyAccounts, hubbuyBalanceEntries, hubbuyBalanceCreditShares, user } from "./schema";

export const hubbuyTopups = sqliteTable("hubbuy_topups", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull().references(() => hubbuyAccounts.id),
  operationId: text("operation_id").notNull().references(() => financialOperations.id),
  creditEntryId: text("credit_entry_id").notNull().references(() => hubbuyBalanceEntries.id),
  cnyMinor: integer("cny_minor").notNull(), principalBrlCents: integer("principal_brl_cents").notNull(), feeBrlCents: integer("fee_brl_cents").notNull(),
  method: text("method", { enum: ["pix", "card"] }).notNull(),
  feeMode: text("fee_mode", { enum: ["percentage", "effective"] }).notNull(), feeBps: integer("fee_bps"), feeReason: text("fee_reason"),
  externalReference: text("external_reference"),
}, t => [
  uniqueIndex("topup_operation_idx").on(t.operationId), uniqueIndex("topup_credit_idx").on(t.creditEntryId),
  uniqueIndex("topup_external_reference_idx").on(t.accountId, t.externalReference), index("topup_account_idx").on(t.accountId, t.id),
  check("topup_amounts", sql`typeof(${t.cnyMinor}) = 'integer' AND ${t.cnyMinor} BETWEEN 1 AND 1000000000000 AND typeof(${t.principalBrlCents}) = 'integer' AND ${t.principalBrlCents} BETWEEN 1 AND 1000000000000 AND typeof(${t.feeBrlCents}) = 'integer' AND ${t.feeBrlCents} BETWEEN 0 AND 1000000000000 AND ${t.principalBrlCents} + ${t.feeBrlCents} <= 1000000000000`),
  check("topup_method", sql`${t.method} IN ('pix','card')`),
  check("topup_fee_mode", sql`(${t.feeMode} = 'percentage' AND typeof(${t.feeBps}) = 'integer' AND ${t.feeBps} BETWEEN 0 AND 10000 AND ${t.feeReason} IS NULL) OR (${t.feeMode} = 'effective' AND ${t.feeBps} IS NULL AND length(trim(${t.feeReason})) BETWEEN 1 AND 1000)`),
  check("topup_reference", sql`${t.externalReference} IS NULL OR length(trim(${t.externalReference})) BETWEEN 1 AND 200`),
]);

export const hubbuyTopupFunders = sqliteTable("hubbuy_topup_funders", {
  topupId: text("topup_id").notNull().references(() => hubbuyTopups.id), personId: text("person_id").notNull().references(() => user.id),
  creditShareId: text("credit_share_id").references(() => hubbuyBalanceCreditShares.id),
  cnyMinor: integer("cny_minor").notNull(), principalBrlCents: integer("principal_brl_cents").notNull(), feeBrlCents: integer("fee_brl_cents").notNull(),
}, t => [primaryKey({ columns: [t.topupId, t.personId] }), uniqueIndex("topup_funder_share_idx").on(t.creditShareId),
  check("topup_funder_amounts", sql`typeof(${t.cnyMinor}) = 'integer' AND ${t.cnyMinor} BETWEEN 0 AND 1000000000000 AND typeof(${t.principalBrlCents}) = 'integer' AND ${t.principalBrlCents} BETWEEN 0 AND 1000000000000 AND typeof(${t.feeBrlCents}) = 'integer' AND ${t.feeBrlCents} BETWEEN 0 AND 1000000000000 AND ${t.cnyMinor} + ${t.principalBrlCents} + ${t.feeBrlCents} > 0`),
  check("topup_funder_share", sql`(${t.cnyMinor} > 0 AND ${t.creditShareId} IS NOT NULL) OR (${t.cnyMinor} = 0 AND ${t.principalBrlCents} = 0 AND ${t.creditShareId} IS NULL)`),
]);

export const hubbuyTopupReversals = sqliteTable("hubbuy_topup_reversals", {
  topupId: text("topup_id").primaryKey().references(() => hubbuyTopups.id),
  operationId: text("operation_id").notNull().references(() => financialOperations.id),
  debitEntryId: text("debit_entry_id").notNull().references(() => hubbuyBalanceEntries.id),
}, t => [uniqueIndex("topup_reversal_operation_idx").on(t.operationId), uniqueIndex("topup_reversal_debit_idx").on(t.debitEntryId)]);
