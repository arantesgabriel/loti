-- Retain original reconciliation and credits; permit only an audited, fully compensated incorrect registration without operational use.
DROP TRIGGER `hubbuy_account_delete_eligibility`;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_account_delete_eligibility` BEFORE UPDATE OF deleted_at ON `hubbuy_accounts` WHEN NEW.deleted_at IS NOT NULL AND (OLD.balance_cny_minor != 0 OR EXISTS (SELECT 1 FROM hubbuy_balance_entries r WHERE r.account_id = OLD.id) OR EXISTS (SELECT 1 FROM hubbuy_reconciliation_runs r WHERE r.account_id = OLD.id) OR EXISTS (SELECT 1 FROM hubbuy_reconciliation_events r WHERE r.account_id = OLD.id) OR EXISTS (SELECT 1 FROM purchase_cost_orders r WHERE r.account_id = OLD.id) OR EXISTS (SELECT 1 FROM purchase_packages r WHERE r.account_id = OLD.id) OR EXISTS (SELECT 1 FROM purchase_payment_components r WHERE r.source_account_id = OLD.id) OR EXISTS (SELECT 1 FROM purchase_cost_refunds r WHERE r.hubbuy_account_id = OLD.id) OR EXISTS (SELECT 1 FROM financial_operations o, json_tree(o.context_json) j WHERE j.type = 'text' AND j.atom = OLD.id AND o.operation_type NOT IN ('account_created','account_empty_activated_zero','account_archived')) OR EXISTS (SELECT 1 FROM purchase_cost_refund_events e, json_tree(e.details_json) j WHERE j.type = 'text' AND j.atom = OLD.id)) AND NOT (EXISTS (
 SELECT 1 FROM financial_operations fix
 WHERE fix.operation_type = 'account_registration_discarded'
 AND fix.workspace_id = OLD.workspace_id AND fix.actor_id = NEW.deleted_by
 AND fix.reason IS NOT NULL AND length(trim(fix.reason)) > 0
 AND json_extract(fix.context_json, '$.accountId') = OLD.id
 AND json_extract(fix.context_json, '$.accountRevision') = OLD.revision
 AND json_extract(fix.context_json, '$.confirmedIncorrectRegistration') = 1
 AND NOT EXISTS (SELECT 1 FROM purchase_cost_orders r WHERE r.account_id = OLD.id) AND NOT EXISTS (SELECT 1 FROM purchase_packages r WHERE r.account_id = OLD.id) AND NOT EXISTS (SELECT 1 FROM purchase_payment_components r WHERE r.source_account_id = OLD.id) AND NOT EXISTS (SELECT 1 FROM purchase_cost_refunds r WHERE r.hubbuy_account_id = OLD.id)
 AND EXISTS (SELECT 1 FROM hubbuy_reconciliation_runs r WHERE r.account_id = OLD.id)
 AND NOT EXISTS (SELECT 1 FROM hubbuy_reconciliation_events e WHERE e.account_id = OLD.id AND (e.event_type != 'legacy_receipt' OR e.source_reference IS NOT NULL))
 AND NOT EXISTS (SELECT 1 FROM purchase_cost_refund_events e, json_tree(e.details_json) j WHERE j.type = 'text' AND j.atom = OLD.id)
 AND NOT EXISTS (SELECT 1 FROM financial_operations o, json_tree(o.context_json) j WHERE j.type = 'text' AND j.atom = OLD.id AND o.operation_type NOT IN ('account_created','account_empty_activated_zero','account_archived','account_reconciliation_started','account_reconciliation_event','account_reconciled','account_registration_discarded'))
 AND NOT EXISTS (SELECT 1 FROM hubbuy_balance_entries e JOIN financial_operations o ON o.id = e.operation_id WHERE e.account_id = OLD.id AND NOT (
   (e.direction = 'credit' AND e.source_type IN ('opening_balance','manual_adjustment') AND o.operation_type IN ('account_reconciled','account_reconciliation_event') AND e.reversal_of_entry_id IS NULL)
   OR (e.direction = 'debit' AND e.source_type = 'reversal' AND e.operation_id = fix.id AND EXISTS (SELECT 1 FROM hubbuy_balance_entries c WHERE c.id = e.reversal_of_entry_id AND c.account_id = OLD.id AND c.direction = 'credit' AND c.amount_cny_minor = e.amount_cny_minor AND c.historical_brl_cents = e.historical_brl_cents))
 ))
 AND NOT EXISTS (SELECT 1 FROM hubbuy_balance_entries e WHERE e.account_id = OLD.id AND e.direction = 'credit' AND (
   (SELECT count(*) FROM hubbuy_balance_entries d WHERE d.reversal_of_entry_id = e.id AND d.operation_id = fix.id) != 1
   OR (SELECT coalesce(sum(s.amount_cny_minor),0) FROM hubbuy_balance_credit_shares s WHERE s.credit_entry_id = e.id) != e.amount_cny_minor
   OR (SELECT coalesce(sum(s.historical_brl_cents),0) FROM hubbuy_balance_credit_shares s WHERE s.credit_entry_id = e.id) != e.historical_brl_cents
 ))
 AND NOT EXISTS (SELECT 1 FROM hubbuy_balance_consumptions c JOIN hubbuy_balance_credit_shares s ON s.id = c.credit_share_id JOIN hubbuy_balance_entries e ON e.id = s.credit_entry_id JOIN hubbuy_balance_entries d ON d.id = c.debit_entry_id WHERE e.account_id = OLD.id AND (d.operation_id != fix.id OR d.reversal_of_entry_id != e.id OR c.payment_allocation_id IS NOT NULL))
 AND NOT EXISTS (SELECT 1 FROM hubbuy_balance_credit_shares s JOIN hubbuy_balance_entries e ON e.id = s.credit_entry_id WHERE e.account_id = OLD.id AND (
   (SELECT coalesce(sum(c.amount_cny_minor),0) FROM hubbuy_balance_consumptions c WHERE c.credit_share_id = s.id) != s.amount_cny_minor
   OR (SELECT coalesce(sum(c.historical_brl_cents),0) FROM hubbuy_balance_consumptions c WHERE c.credit_share_id = s.id) != s.historical_brl_cents
 ))
 AND NOT EXISTS (SELECT 1 FROM member_balance_financing_entries f JOIN hubbuy_balance_consumptions c ON c.id = f.consumption_id JOIN hubbuy_balance_credit_shares s ON s.id = c.credit_share_id JOIN hubbuy_balance_entries e ON e.id = s.credit_entry_id WHERE e.account_id = OLD.id)
 AND (SELECT coalesce(sum(CASE WHEN e.direction = 'credit' THEN e.amount_cny_minor ELSE -e.amount_cny_minor END),0) FROM hubbuy_balance_entries e WHERE e.account_id = OLD.id) = 0
)) BEGIN SELECT RAISE(ABORT, 'account has balance, history or references'); END;
