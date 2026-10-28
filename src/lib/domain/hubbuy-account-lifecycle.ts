import { sql } from "drizzle-orm";

// Narrow recovery for a mistakenly entered reconciliation, before any real use.
// Values and original entries remain in the append-only audit after reversal.
export const accountDiscardEligible = sql<number>`(
  "hubbuy_accounts"."deleted_at" IS NULL
  AND (EXISTS (SELECT 1 FROM hubbuy_reconciliation_runs r WHERE r.account_id = "hubbuy_accounts"."id"))
  AND NOT EXISTS (SELECT 1 FROM purchase_cost_orders r WHERE r.account_id = "hubbuy_accounts"."id")
  AND NOT EXISTS (SELECT 1 FROM purchase_packages r WHERE r.account_id = "hubbuy_accounts"."id")
  AND NOT EXISTS (SELECT 1 FROM purchase_payment_components r WHERE r.source_account_id = "hubbuy_accounts"."id")
  AND NOT EXISTS (SELECT 1 FROM purchase_cost_refunds r WHERE r.hubbuy_account_id = "hubbuy_accounts"."id")
  AND NOT EXISTS (SELECT 1 FROM hubbuy_balance_entries e WHERE e.account_id = "hubbuy_accounts"."id" AND (e.direction != 'credit' OR e.source_type NOT IN ('opening_balance','manual_adjustment')))
  AND NOT EXISTS (SELECT 1 FROM hubbuy_balance_consumptions c JOIN hubbuy_balance_credit_shares s ON s.id = c.credit_share_id JOIN hubbuy_balance_entries e ON e.id = s.credit_entry_id WHERE e.account_id = "hubbuy_accounts"."id")
  AND NOT EXISTS (SELECT 1 FROM hubbuy_reconciliation_events e WHERE e.account_id = "hubbuy_accounts"."id" AND (e.event_type != 'legacy_receipt' OR e.source_reference IS NOT NULL))
  AND NOT EXISTS (SELECT 1 FROM financial_operations o, json_tree(o.context_json) j WHERE j.type = 'text' AND j.atom = "hubbuy_accounts"."id" AND o.operation_type NOT IN ('account_created','account_empty_activated_zero','account_archived','account_reconciliation_started','account_reconciliation_event','account_reconciled'))
  AND NOT EXISTS (SELECT 1 FROM purchase_cost_refund_events e, json_tree(e.details_json) j WHERE j.type = 'text' AND j.atom = "hubbuy_accounts"."id")
  AND NOT EXISTS (SELECT 1 FROM hubbuy_balance_entries e JOIN financial_operations o ON o.id = e.operation_id WHERE e.account_id = "hubbuy_accounts"."id" AND o.operation_type NOT IN ('account_reconciled','account_reconciliation_event'))
)`;


// Correlated EXISTS keeps capability reads bounded to one query for the whole list.
// Lifecycle migration enforces this same policy at the write boundary as well.
export const accountDeletionBlockCode = sql<string | null>`CASE
  WHEN "hubbuy_accounts"."deleted_at" IS NOT NULL THEN 'ACCOUNT_DELETED'
  WHEN "hubbuy_accounts"."balance_cny_minor" != 0 THEN 'ACCOUNT_HAS_BALANCE'
  WHEN EXISTS (SELECT 1 FROM hubbuy_balance_entries e WHERE e.account_id = "hubbuy_accounts"."id") THEN 'ACCOUNT_HAS_LEDGER'
  WHEN EXISTS (SELECT 1 FROM hubbuy_reconciliation_runs r WHERE r.account_id = "hubbuy_accounts"."id")
    OR EXISTS (SELECT 1 FROM hubbuy_reconciliation_events e WHERE e.account_id = "hubbuy_accounts"."id") THEN 'ACCOUNT_HAS_RECONCILIATION'
  WHEN EXISTS (SELECT 1 FROM purchase_cost_orders o WHERE o.account_id = "hubbuy_accounts"."id")
    OR EXISTS (SELECT 1 FROM purchase_packages p WHERE p.account_id = "hubbuy_accounts"."id")
    OR EXISTS (SELECT 1 FROM purchase_payment_components p WHERE p.source_account_id = "hubbuy_accounts"."id")
    OR EXISTS (SELECT 1 FROM purchase_cost_refunds r WHERE r.hubbuy_account_id = "hubbuy_accounts"."id") THEN 'ACCOUNT_HAS_REFERENCES'
  WHEN EXISTS (SELECT 1 FROM financial_operations o, json_tree(o.context_json) j
    WHERE j.type = 'text' AND j.atom = "hubbuy_accounts"."id"
    AND o.operation_type NOT IN ('account_created', 'account_empty_activated_zero', 'account_archived'))
    OR EXISTS (SELECT 1 FROM purchase_cost_refund_events e, json_tree(e.details_json) j WHERE j.type = 'text' AND j.atom = "hubbuy_accounts"."id")
    THEN 'ACCOUNT_HAS_HISTORY'
  ELSE NULL END`;

export function accountDeletionBlockMessage(code: string | null): string | null {
  if (!code) return null;
  if (code === "ACCOUNT_DELETED") return "Este cadastro já foi excluído do Loti.";
  if (code === "ACCOUNT_HAS_BALANCE") return "Esta conta tem saldo. Confira o saldo e os direitos individuais antes de retirá-la de uso.";
  if (code === "ACCOUNT_HAS_RECONCILIATION") return "Esta conta tem conciliação iniciada. Conclua a conferência; depois, poderá arquivá-la se o saldo estiver zerado.";
  return "Esta conta tem histórico ou vínculos. Preserve os registros e arquive a conta quando o saldo estiver conciliado e zerado.";
}

export function accountLifecycleExpressions(ordersWorkflow:boolean){
  if(!ordersWorkflow)return {deletion:accountDeletionBlockCode,discard:accountDiscardEligible};
  const references=sql`(EXISTS(SELECT 1 FROM order_warehouse_positions w WHERE w.account_id="hubbuy_accounts"."id") OR EXISTS(SELECT 1 FROM logistics_packages p WHERE p.account_id="hubbuy_accounts"."id"))`;
  return {deletion:sql<string|null>`CASE WHEN ${references} THEN 'ACCOUNT_HAS_REFERENCES' ELSE ${accountDeletionBlockCode} END`,discard:sql<number>`(${accountDiscardEligible}) AND NOT ${references}`};
}
