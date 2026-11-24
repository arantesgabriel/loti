-- Preserved pre-0034 triggers: drop during ledger rebuild, restore verbatim.
DROP TRIGGER `additional_order_cost_recorded_no_delete`;
--> statement-breakpoint
DROP TRIGGER `additional_order_cost_recorded_no_update`;
--> statement-breakpoint
DROP TRIGGER `additional_order_item_recorded_no_delete`;
--> statement-breakpoint
DROP TRIGGER `additional_order_item_recorded_no_update`;
--> statement-breakpoint
DROP TRIGGER `financial_operations_live_account_insert`;
--> statement-breakpoint
DROP TRIGGER `financial_operations_no_delete`;
--> statement-breakpoint
DROP TRIGGER `financial_operations_no_update`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_account_balance_matches_ledger`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_account_delete_eligibility`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_account_tombstone_insert`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_account_tombstone_update`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_accounts_no_delete`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_adjustment_reference_guard`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_adjustment_scope_guard`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_adjustments_no_delete`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_adjustments_no_update`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_balance_consumptions_no_delete`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_balance_consumptions_no_update`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_balance_credit_shares_no_delete`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_balance_credit_shares_no_update`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_balance_entries_live_account_insert`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_balance_entries_live_account_update`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_balance_entries_no_delete`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_balance_entries_no_update`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_balance_entry_workspace_guard`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_consumption_guard`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_credit_share_guard`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_reconciliation_events_live_account_insert`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_reconciliation_events_live_account_update`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_reconciliation_events_no_delete`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_reconciliation_events_no_update`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_reconciliation_runs_live_account_insert`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_reconciliation_runs_live_account_update`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_reconciliation_runs_no_delete`;
--> statement-breakpoint
DROP TRIGGER `hubbuy_reconciliation_runs_no_update`;
--> statement-breakpoint
DROP TRIGGER `legacy_allocation_delete_cutover`;
--> statement-breakpoint
DROP TRIGGER `legacy_allocation_insert_cutover`;
--> statement-breakpoint
DROP TRIGGER `legacy_allocation_update_cutover`;
--> statement-breakpoint
DROP TRIGGER `legacy_package_delete_cutover`;
--> statement-breakpoint
DROP TRIGGER `legacy_package_insert_cutover`;
--> statement-breakpoint
DROP TRIGGER `legacy_package_update_cutover`;
--> statement-breakpoint
DROP TRIGGER `logistics_account_deletion`;
--> statement-breakpoint
DROP TRIGGER `logistics_charge_cutover`;
--> statement-breakpoint
DROP TRIGGER `logistics_charge_state_guard`;
--> statement-breakpoint
DROP TRIGGER `logistics_command_delete`;
--> statement-breakpoint
DROP TRIGGER `logistics_command_update`;
--> statement-breakpoint
DROP TRIGGER `logistics_cost_basis_lock`;
--> statement-breakpoint
DROP TRIGGER `logistics_event_delete`;
--> statement-breakpoint
DROP TRIGGER `logistics_event_update`;
--> statement-breakpoint
DROP TRIGGER `logistics_legacy_charge_delete`;
--> statement-breakpoint
DROP TRIGGER `logistics_legacy_charge_update`;
--> statement-breakpoint
DROP TRIGGER `logistics_manifest_immutable_delete`;
--> statement-breakpoint
DROP TRIGGER `logistics_manifest_immutable_update`;
--> statement-breakpoint
DROP TRIGGER `logistics_order_basis_lock`;
--> statement-breakpoint
DROP TRIGGER `logistics_package_account_scope`;
--> statement-breakpoint
DROP TRIGGER `logistics_package_account_update_scope`;
--> statement-breakpoint
DROP TRIGGER `logistics_participant_delete_lock`;
--> statement-breakpoint
DROP TRIGGER `logistics_participant_update_lock`;
--> statement-breakpoint
DROP TRIGGER `logistics_product_fee_lock`;
--> statement-breakpoint
DROP TRIGGER `logistics_refund_overlap`;
--> statement-breakpoint
DROP TRIGGER `logistics_refund_review`;
--> statement-breakpoint
DROP TRIGGER `logistics_refund_update_overlap`;
--> statement-breakpoint
DROP TRIGGER `logistics_reservation_identity`;
--> statement-breakpoint
DROP TRIGGER `logistics_reservation_reactivation`;
--> statement-breakpoint
DROP TRIGGER `logistics_reservation_refund_overlap`;
--> statement-breakpoint
DROP TRIGGER `logistics_reservation_scope`;
--> statement-breakpoint
DROP TRIGGER `logistics_safe_money`;
--> statement-breakpoint
DROP TRIGGER `logistics_sealed_release`;
--> statement-breakpoint
DROP TRIGGER `member_balance_financing_entries_no_delete`;
--> statement-breakpoint
DROP TRIGGER `member_balance_financing_entries_no_update`;
--> statement-breakpoint
DROP TRIGGER `onboarding_enrollment_immutable`;
--> statement-breakpoint
DROP TRIGGER `order_corrections_no_delete`;
--> statement-breakpoint
DROP TRIGGER `order_corrections_no_update`;
--> statement-breakpoint
DROP TRIGGER `order_corrections_scope_guard`;
--> statement-breakpoint
DROP TRIGGER `purchase_cost_order_recorded_no_delete`;
--> statement-breakpoint
DROP TRIGGER `purchase_cost_order_recorded_no_update`;
--> statement-breakpoint
DROP TRIGGER `purchase_cost_orders_live_account_insert`;
--> statement-breakpoint
DROP TRIGGER `purchase_cost_orders_live_account_update`;
--> statement-breakpoint
DROP TRIGGER `purchase_cost_package_events_no_delete`;
--> statement-breakpoint
DROP TRIGGER `purchase_cost_package_events_no_update`;
--> statement-breakpoint
DROP TRIGGER `purchase_cost_refunds_live_account_insert`;
--> statement-breakpoint
DROP TRIGGER `purchase_cost_refunds_live_account_update`;
--> statement-breakpoint
DROP TRIGGER `purchase_packages_live_account_insert`;
--> statement-breakpoint
DROP TRIGGER `purchase_packages_live_account_update`;
--> statement-breakpoint
DROP TRIGGER `purchase_payment_allocation_capacity_guard`;
--> statement-breakpoint
DROP TRIGGER `purchase_payment_allocation_no_delete`;
--> statement-breakpoint
DROP TRIGGER `purchase_payment_allocation_no_update`;
--> statement-breakpoint
DROP TRIGGER `purchase_payment_component_no_delete`;
--> statement-breakpoint
DROP TRIGGER `purchase_payment_component_no_update`;
--> statement-breakpoint
DROP TRIGGER `purchase_payment_components_live_account_insert`;
--> statement-breakpoint
DROP TRIGGER `purchase_payment_components_live_account_update`;
--> statement-breakpoint
DROP TRIGGER `referral_attribution_immutable`;
--> statement-breakpoint
DROP TRIGGER `refund_events_live_account_insert`;
--> statement-breakpoint
DROP TRIGGER `refund_payment_allocation_workspace_guard`;
--> statement-breakpoint
DROP TRIGGER `refund_payment_allocations_no_delete`;
--> statement-breakpoint
DROP TRIGGER `refund_payment_allocations_no_update`;
--> statement-breakpoint
DROP TRIGGER `warehouse_new_cost`;
--> statement-breakpoint
DROP TRIGGER `warehouse_position_scope`;
--> statement-breakpoint
DROP TRIGGER `warehouse_received_capacity`;
--> statement-breakpoint
DROP TRIGGER `workspace_identity_immutable`;
--> statement-breakpoint
DROP TRIGGER `workspace_kind_owner_insert_guard`;
--> statement-breakpoint
DROP TRIGGER `workspace_member_shared_insert_guard`;
--> statement-breakpoint
DROP TRIGGER `workspace_member_shared_update_guard`;
--> statement-breakpoint
CREATE TABLE `hubbuy_topup_funders` (
	`topup_id` text NOT NULL,
	`person_id` text NOT NULL,
	`credit_share_id` text,
	`cny_minor` integer NOT NULL,
	`principal_brl_cents` integer NOT NULL,
	`fee_brl_cents` integer NOT NULL,
	PRIMARY KEY(`topup_id`, `person_id`),
	FOREIGN KEY (`topup_id`) REFERENCES `hubbuy_topups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`credit_share_id`) REFERENCES `hubbuy_balance_credit_shares`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "topup_funder_amounts" CHECK(typeof("hubbuy_topup_funders"."cny_minor") = 'integer' AND "hubbuy_topup_funders"."cny_minor" BETWEEN 0 AND 1000000000000 AND typeof("hubbuy_topup_funders"."principal_brl_cents") = 'integer' AND "hubbuy_topup_funders"."principal_brl_cents" BETWEEN 0 AND 1000000000000 AND typeof("hubbuy_topup_funders"."fee_brl_cents") = 'integer' AND "hubbuy_topup_funders"."fee_brl_cents" BETWEEN 0 AND 1000000000000 AND "hubbuy_topup_funders"."cny_minor" + "hubbuy_topup_funders"."principal_brl_cents" + "hubbuy_topup_funders"."fee_brl_cents" > 0),
	CONSTRAINT "topup_funder_share" CHECK(("hubbuy_topup_funders"."cny_minor" > 0 AND "hubbuy_topup_funders"."credit_share_id" IS NOT NULL) OR ("hubbuy_topup_funders"."cny_minor" = 0 AND "hubbuy_topup_funders"."principal_brl_cents" = 0 AND "hubbuy_topup_funders"."credit_share_id" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `topup_funder_share_idx` ON `hubbuy_topup_funders` (`credit_share_id`);--> statement-breakpoint
CREATE TABLE `hubbuy_topup_reversals` (
	`topup_id` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`debit_entry_id` text NOT NULL,
	FOREIGN KEY (`topup_id`) REFERENCES `hubbuy_topups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `financial_operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`debit_entry_id`) REFERENCES `hubbuy_balance_entries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `topup_reversal_operation_idx` ON `hubbuy_topup_reversals` (`operation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `topup_reversal_debit_idx` ON `hubbuy_topup_reversals` (`debit_entry_id`);--> statement-breakpoint
CREATE TABLE `hubbuy_topups` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`credit_entry_id` text NOT NULL,
	`cny_minor` integer NOT NULL,
	`principal_brl_cents` integer NOT NULL,
	`fee_brl_cents` integer NOT NULL,
	`method` text NOT NULL,
	`fee_mode` text NOT NULL,
	`fee_bps` integer,
	`fee_reason` text,
	`external_reference` text,
	FOREIGN KEY (`account_id`) REFERENCES `hubbuy_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `financial_operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`credit_entry_id`) REFERENCES `hubbuy_balance_entries`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "topup_amounts" CHECK(typeof("hubbuy_topups"."cny_minor") = 'integer' AND "hubbuy_topups"."cny_minor" BETWEEN 1 AND 1000000000000 AND typeof("hubbuy_topups"."principal_brl_cents") = 'integer' AND "hubbuy_topups"."principal_brl_cents" BETWEEN 1 AND 1000000000000 AND typeof("hubbuy_topups"."fee_brl_cents") = 'integer' AND "hubbuy_topups"."fee_brl_cents" BETWEEN 0 AND 1000000000000 AND "hubbuy_topups"."principal_brl_cents" + "hubbuy_topups"."fee_brl_cents" <= 1000000000000),
	CONSTRAINT "topup_method" CHECK("hubbuy_topups"."method" IN ('pix','card')),
	CONSTRAINT "topup_fee_mode" CHECK(("hubbuy_topups"."fee_mode" = 'percentage' AND typeof("hubbuy_topups"."fee_bps") = 'integer' AND "hubbuy_topups"."fee_bps" BETWEEN 0 AND 10000 AND "hubbuy_topups"."fee_reason" IS NULL) OR ("hubbuy_topups"."fee_mode" = 'effective' AND "hubbuy_topups"."fee_bps" IS NULL AND length(trim("hubbuy_topups"."fee_reason")) BETWEEN 1 AND 1000)),
	CONSTRAINT "topup_reference" CHECK("hubbuy_topups"."external_reference" IS NULL OR length(trim("hubbuy_topups"."external_reference")) BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `topup_operation_idx` ON `hubbuy_topups` (`operation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `topup_credit_idx` ON `hubbuy_topups` (`credit_entry_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `topup_external_reference_idx` ON `hubbuy_topups` (`account_id`,`external_reference`);--> statement-breakpoint
CREATE INDEX `topup_account_idx` ON `hubbuy_topups` (`account_id`,`id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hubbuy_balance_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`direction` text NOT NULL,
	`amount_cny_minor` integer NOT NULL,
	`historical_brl_cents` integer,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`reversal_of_entry_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `hubbuy_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `financial_operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reversal_of_entry_id`) REFERENCES `hubbuy_balance_entries`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "hubbuy_balance_entry_sequence" CHECK(typeof("__new_hubbuy_balance_entries"."sequence") = 'integer' AND "__new_hubbuy_balance_entries"."sequence" >= 0),
	CONSTRAINT "hubbuy_balance_entry_direction" CHECK("__new_hubbuy_balance_entries"."direction" IN ('credit','debit')),
	CONSTRAINT "hubbuy_balance_entry_amount" CHECK(typeof("__new_hubbuy_balance_entries"."amount_cny_minor") = 'integer' AND "__new_hubbuy_balance_entries"."amount_cny_minor" BETWEEN 1 AND 1000000000000),
	CONSTRAINT "hubbuy_balance_entry_basis" CHECK("__new_hubbuy_balance_entries"."historical_brl_cents" IS NULL OR (typeof("__new_hubbuy_balance_entries"."historical_brl_cents") = 'integer' AND "__new_hubbuy_balance_entries"."historical_brl_cents" BETWEEN 0 AND 1000000000000)),
	CONSTRAINT "hubbuy_balance_entry_source" CHECK("__new_hubbuy_balance_entries"."source_type" IN ('refund_received','manual_adjustment','opening_balance','purchase_payment','refund_offset','reversal','topup','package_freight_payment') AND length(trim("__new_hubbuy_balance_entries"."source_id")) BETWEEN 1 AND 200)
);
--> statement-breakpoint
INSERT INTO `__new_hubbuy_balance_entries`("id", "account_id", "operation_id", "sequence", "direction", "amount_cny_minor", "historical_brl_cents", "source_type", "source_id", "reversal_of_entry_id", "created_at") SELECT "id", "account_id", "operation_id", "sequence", "direction", "amount_cny_minor", "historical_brl_cents", "source_type", "source_id", "reversal_of_entry_id", "created_at" FROM `hubbuy_balance_entries`;--> statement-breakpoint
DROP TABLE `hubbuy_balance_entries`;--> statement-breakpoint
ALTER TABLE `__new_hubbuy_balance_entries` RENAME TO `hubbuy_balance_entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `hubbuy_balance_sequence_idx` ON `hubbuy_balance_entries` (`account_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `hubbuy_balance_operation_source_idx` ON `hubbuy_balance_entries` (`operation_id`,`account_id`,`direction`,`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `hubbuy_balance_account_order_idx` ON `hubbuy_balance_entries` (`account_id`,`sequence`);
--> statement-breakpoint
CREATE TRIGGER `additional_order_cost_recorded_no_delete` BEFORE DELETE ON `purchase_item_costs`
WHEN EXISTS (SELECT 1 FROM `purchase_cost_orders` o WHERE o.id = OLD.order_id AND o.kind = 'additional' AND o.state != 'draft')
BEGIN SELECT RAISE(ABORT, 'recorded order costs are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `additional_order_cost_recorded_no_update` BEFORE UPDATE ON `purchase_item_costs`
WHEN EXISTS (SELECT 1 FROM `purchase_cost_orders` o WHERE o.id = OLD.order_id AND o.kind = 'additional' AND o.state != 'draft')
BEGIN SELECT RAISE(ABORT, 'recorded order costs are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `additional_order_item_recorded_no_delete` BEFORE DELETE ON `purchase_additional_order_items`
WHEN EXISTS (SELECT 1 FROM `purchase_cost_orders` o WHERE o.id = OLD.order_id AND o.state != 'draft')
BEGIN SELECT RAISE(ABORT, 'recorded order item snapshots are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `additional_order_item_recorded_no_update` BEFORE UPDATE ON `purchase_additional_order_items`
WHEN EXISTS (SELECT 1 FROM `purchase_cost_orders` o WHERE o.id = OLD.order_id AND o.state != 'draft')
BEGIN SELECT RAISE(ABORT, 'recorded order item snapshots are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `financial_operations_live_account_insert` BEFORE INSERT ON `financial_operations` WHEN NEW.operation_type != 'account_deleted' AND EXISTS (SELECT 1 FROM hubbuy_accounts a, json_tree(NEW.context_json) j WHERE a.deleted_at IS NOT NULL AND j.type = 'text' AND j.atom = a.id) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `financial_operations_no_delete` BEFORE DELETE ON `financial_operations` BEGIN SELECT RAISE(ABORT, 'financial operations are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `financial_operations_no_update` BEFORE UPDATE ON `financial_operations` BEGIN SELECT RAISE(ABORT, 'financial operations are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_account_balance_matches_ledger` BEFORE UPDATE OF `balance_cny_minor` ON `hubbuy_accounts`
WHEN NEW.balance_cny_minor != COALESCE((SELECT SUM(CASE direction WHEN 'credit' THEN amount_cny_minor ELSE -amount_cny_minor END) FROM `hubbuy_balance_entries` WHERE account_id = NEW.id), 0)
BEGIN SELECT RAISE(ABORT, 'account balance projection must match the ledger'); END;
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
--> statement-breakpoint
CREATE TRIGGER `hubbuy_account_tombstone_insert` BEFORE INSERT ON `hubbuy_accounts` WHEN NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL BEGIN SELECT RAISE(ABORT, 'new accounts cannot be deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_account_tombstone_update` BEFORE UPDATE ON `hubbuy_accounts` WHEN OLD.deleted_at IS NOT NULL OR NOT ((NEW.deleted_at IS NULL AND NEW.deleted_by IS NULL) OR (typeof(NEW.deleted_at) = 'integer' AND NEW.deleted_at > 0 AND NEW.deleted_by IS NOT NULL AND NEW.status = 'archived' AND NEW.balance_cny_minor = 0 AND NEW.revision = OLD.revision + 1 AND NEW.updated_by = NEW.deleted_by)) BEGIN SELECT RAISE(ABORT, 'invalid or immutable account tombstone'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_accounts_no_delete` BEFORE DELETE ON `hubbuy_accounts` BEGIN SELECT RAISE(ABORT, 'HubBuy accounts are retained for audit'); END;
--> statement-breakpoint
CREATE TRIGGER hubbuy_adjustment_reference_guard BEFORE INSERT ON hubbuy_balance_adjustments
WHEN NEW.external_reference IS NOT NULL AND EXISTS (
 SELECT 1 FROM hubbuy_balance_adjustments old WHERE old.account_id = NEW.account_id AND old.external_reference = NEW.external_reference
 AND NOT EXISTS (SELECT 1 FROM hubbuy_balance_adjustments r WHERE r.reverses_adjustment_id = old.id)
) BEGIN SELECT RAISE(ABORT, 'adjustment reference already recorded'); END;
--> statement-breakpoint
CREATE TRIGGER hubbuy_adjustment_scope_guard BEFORE INSERT ON hubbuy_balance_adjustments
WHEN NOT EXISTS (
 SELECT 1 FROM hubbuy_accounts a JOIN financial_operations o ON o.id = NEW.operation_id
 JOIN hubbuy_balance_entries e ON e.id = NEW.balance_entry_id
 WHERE a.id = NEW.account_id AND a.deleted_at IS NULL AND a.status = 'active'
 AND a.workspace_id = o.workspace_id AND e.account_id = a.id AND e.operation_id = o.id
 AND e.historical_brl_cents IS NOT NULL AND o.reason IS NOT NULL AND o.occurred_at IS NOT NULL
 AND ((e.direction = 'credit'
   AND e.amount_cny_minor = (SELECT coalesce(sum(s.amount_cny_minor),0) FROM hubbuy_balance_credit_shares s WHERE s.credit_entry_id = e.id)
   AND e.historical_brl_cents = (SELECT coalesce(sum(s.historical_brl_cents),0) FROM hubbuy_balance_credit_shares s WHERE s.credit_entry_id = e.id))
 OR (e.direction = 'debit'
   AND e.amount_cny_minor = (SELECT coalesce(sum(c.amount_cny_minor),0) FROM hubbuy_balance_consumptions c WHERE c.debit_entry_id = e.id)
   AND e.historical_brl_cents = (SELECT coalesce(sum(c.historical_brl_cents),0) FROM hubbuy_balance_consumptions c WHERE c.debit_entry_id = e.id)))
 AND json_extract(o.context_json, '$.accountId') = a.id
 AND e.source_id = 'manual-adjustment:' || NEW.id
 AND ((NEW.kind IN ('promotional_bonus','documented_credit') AND e.direction = 'credit' AND e.source_type = 'manual_adjustment' AND e.reversal_of_entry_id IS NULL AND o.operation_type = 'account_manual_credit_recorded' AND (NEW.kind != 'promotional_bonus' OR e.historical_brl_cents = 0))
 OR (NEW.kind = 'documented_debit' AND e.direction = 'debit' AND e.source_type = 'manual_adjustment' AND e.reversal_of_entry_id IS NULL AND o.operation_type = 'account_manual_debit_recorded')
 OR (NEW.kind = 'reversal' AND e.source_type = 'reversal' AND o.operation_type = 'account_manual_adjustment_reversed' AND EXISTS (
   SELECT 1 FROM hubbuy_balance_adjustments original JOIN hubbuy_balance_entries old ON old.id = original.balance_entry_id
   WHERE original.id = NEW.reverses_adjustment_id AND original.account_id = a.id AND original.kind != 'reversal'
   AND e.reversal_of_entry_id = old.id AND o.reversal_of_id = original.operation_id AND e.direction != old.direction
   AND e.amount_cny_minor = old.amount_cny_minor AND e.historical_brl_cents = old.historical_brl_cents
   AND (old.direction != 'credit' OR (
     NOT EXISTS (SELECT 1 FROM hubbuy_balance_consumptions c JOIN hubbuy_balance_credit_shares s ON s.id = c.credit_share_id WHERE s.credit_entry_id = old.id AND c.debit_entry_id != e.id)
     AND NOT EXISTS (SELECT 1 FROM hubbuy_balance_consumptions c JOIN hubbuy_balance_credit_shares s ON s.id = c.credit_share_id WHERE c.debit_entry_id = e.id AND s.credit_entry_id != old.id)
   ))
   AND (old.direction != 'debit' OR (
     NOT EXISTS (SELECT 1 FROM hubbuy_balance_credit_shares restored WHERE restored.credit_entry_id = e.id AND (
       restored.amount_cny_minor != (SELECT coalesce(sum(c.amount_cny_minor),0) FROM hubbuy_balance_consumptions c JOIN hubbuy_balance_credit_shares s ON s.id = c.credit_share_id WHERE c.debit_entry_id = old.id AND s.person_id = restored.person_id)
       OR restored.historical_brl_cents != (SELECT coalesce(sum(c.historical_brl_cents),0) FROM hubbuy_balance_consumptions c JOIN hubbuy_balance_credit_shares s ON s.id = c.credit_share_id WHERE c.debit_entry_id = old.id AND s.person_id = restored.person_id)
     ))
   ))
 )))
) BEGIN SELECT RAISE(ABORT, 'invalid adjustment scope or source'); END;
--> statement-breakpoint
CREATE TRIGGER hubbuy_adjustments_no_delete BEFORE DELETE ON hubbuy_balance_adjustments BEGIN SELECT RAISE(ABORT, 'adjustments are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER hubbuy_adjustments_no_update BEFORE UPDATE ON hubbuy_balance_adjustments BEGIN SELECT RAISE(ABORT, 'adjustments are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_balance_consumptions_no_delete` BEFORE DELETE ON `hubbuy_balance_consumptions` BEGIN SELECT RAISE(ABORT, 'balance consumptions are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_balance_consumptions_no_update` BEFORE UPDATE ON `hubbuy_balance_consumptions` BEGIN SELECT RAISE(ABORT, 'balance consumptions are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_balance_credit_shares_no_delete` BEFORE DELETE ON `hubbuy_balance_credit_shares` BEGIN SELECT RAISE(ABORT, 'credit shares are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_balance_credit_shares_no_update` BEFORE UPDATE ON `hubbuy_balance_credit_shares` BEGIN SELECT RAISE(ABORT, 'credit shares are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_balance_entries_live_account_insert` BEFORE INSERT ON `hubbuy_balance_entries` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_balance_entries_live_account_update` BEFORE UPDATE OF account_id ON `hubbuy_balance_entries` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_balance_entries_no_delete` BEFORE DELETE ON `hubbuy_balance_entries` BEGIN SELECT RAISE(ABORT, 'balance entries are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_balance_entries_no_update` BEFORE UPDATE ON `hubbuy_balance_entries` BEGIN SELECT RAISE(ABORT, 'balance entries are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_balance_entry_workspace_guard` BEFORE INSERT ON `hubbuy_balance_entries`
WHEN (SELECT workspace_id FROM `hubbuy_accounts` WHERE id = NEW.account_id) IS NOT (SELECT workspace_id FROM `financial_operations` WHERE id = NEW.operation_id)
BEGIN SELECT RAISE(ABORT, 'balance account and operation workspace mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_consumption_guard` BEFORE INSERT ON `hubbuy_balance_consumptions`
WHEN NOT EXISTS (
  SELECT 1 FROM `hubbuy_balance_entries` d
  JOIN `hubbuy_balance_credit_shares` s ON s.id = NEW.credit_share_id
  JOIN `hubbuy_balance_entries` c ON c.id = s.credit_entry_id
  WHERE d.id = NEW.debit_entry_id AND d.direction = 'debit' AND c.direction = 'credit' AND c.account_id = d.account_id
    AND COALESCE((SELECT SUM(amount_cny_minor) FROM `hubbuy_balance_consumptions` WHERE credit_share_id = s.id), 0) + NEW.amount_cny_minor <= s.amount_cny_minor
    AND COALESCE((SELECT SUM(historical_brl_cents) FROM `hubbuy_balance_consumptions` WHERE credit_share_id = s.id), 0) + NEW.historical_brl_cents <= s.historical_brl_cents
)
BEGIN SELECT RAISE(ABORT, 'balance consumption exceeds its credit share or crosses accounts'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_credit_share_guard` BEFORE INSERT ON `hubbuy_balance_credit_shares`
WHEN NOT EXISTS (
  SELECT 1 FROM `hubbuy_balance_entries` e
  JOIN `hubbuy_accounts` a ON a.id = e.account_id
  JOIN `workspace_members` m ON m.workspace_id = a.workspace_id AND m.user_id = NEW.person_id
  WHERE e.id = NEW.credit_entry_id AND e.direction = 'credit'
)
BEGIN SELECT RAISE(ABORT, 'credit share must belong to a workspace member and credit entry'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_reconciliation_events_live_account_insert` BEFORE INSERT ON `hubbuy_reconciliation_events` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_reconciliation_events_live_account_update` BEFORE UPDATE OF account_id ON `hubbuy_reconciliation_events` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_reconciliation_events_no_delete` BEFORE DELETE ON `hubbuy_reconciliation_events` BEGIN SELECT RAISE(ABORT, 'HubBuy reconciliation events are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_reconciliation_events_no_update` BEFORE UPDATE ON `hubbuy_reconciliation_events` BEGIN SELECT RAISE(ABORT, 'HubBuy reconciliation events are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_reconciliation_runs_live_account_insert` BEFORE INSERT ON `hubbuy_reconciliation_runs` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_reconciliation_runs_live_account_update` BEFORE UPDATE OF account_id ON `hubbuy_reconciliation_runs` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_reconciliation_runs_no_delete` BEFORE DELETE ON `hubbuy_reconciliation_runs` BEGIN SELECT RAISE(ABORT, 'HubBuy reconciliation runs are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_reconciliation_runs_no_update` BEFORE UPDATE ON `hubbuy_reconciliation_runs` BEGIN SELECT RAISE(ABORT, 'HubBuy reconciliation runs are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER legacy_allocation_delete_cutover BEFORE DELETE ON purchase_package_items BEGIN SELECT RAISE(ABORT,'ORDERS_WORKFLOW_UPGRADE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER legacy_allocation_insert_cutover BEFORE INSERT ON purchase_package_items BEGIN SELECT RAISE(ABORT,'ORDERS_WORKFLOW_UPGRADE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER legacy_allocation_update_cutover BEFORE UPDATE ON purchase_package_items BEGIN SELECT RAISE(ABORT,'ORDERS_WORKFLOW_UPGRADE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER legacy_package_delete_cutover BEFORE DELETE ON purchase_packages BEGIN SELECT RAISE(ABORT,'ORDERS_WORKFLOW_UPGRADE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER legacy_package_insert_cutover BEFORE INSERT ON purchase_packages BEGIN SELECT RAISE(ABORT,'ORDERS_WORKFLOW_UPGRADE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER legacy_package_update_cutover BEFORE UPDATE ON purchase_packages BEGIN SELECT RAISE(ABORT,'ORDERS_WORKFLOW_UPGRADE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_account_deletion BEFORE UPDATE OF deleted_at ON hubbuy_accounts WHEN NEW.deleted_at IS NOT NULL AND (
 EXISTS(SELECT 1 FROM order_warehouse_positions w WHERE w.account_id=OLD.id) OR EXISTS(SELECT 1 FROM logistics_packages p WHERE p.account_id=OLD.id)
) BEGIN SELECT RAISE(ABORT,'ACCOUNT_HAS_LOGISTICS_REFERENCES'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_charge_cutover BEFORE UPDATE ON purchase_cost_charges WHEN OLD.package_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'ORDERS_WORKFLOW_UPGRADE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_charge_state_guard BEFORE UPDATE ON logistics_packages WHEN
 NEW.freight_state NOT IN ('pending','known','no_charge') OR NEW.customs_state NOT IN ('pending','known','no_charge')
 OR (NEW.freight_state='known' AND NEW.freight_cents IS NULL) OR (NEW.freight_state!='known' AND NEW.freight_cents IS NOT NULL)
 OR (NEW.customs_state='known' AND NEW.customs_cents IS NULL) OR (NEW.customs_state!='known' AND NEW.customs_cents IS NOT NULL)
 OR (NEW.freight_fee_bps IS NOT NULL AND (typeof(NEW.freight_fee_bps)!='integer' OR NEW.freight_fee_bps NOT BETWEEN 0 AND 10000))
 BEGIN SELECT RAISE(ABORT,'LOGISTICS_CHARGE_STATE_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_command_delete BEFORE DELETE ON logistics_commands BEGIN SELECT RAISE(ABORT,'IMMUTABLE_LOGISTICS_RECEIPT'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_command_update BEFORE UPDATE ON logistics_commands BEGIN SELECT RAISE(ABORT,'IMMUTABLE_LOGISTICS_RECEIPT'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_cost_basis_lock BEFORE UPDATE ON purchase_item_costs WHEN EXISTS (
 SELECT 1 FROM logistics_reservations r JOIN logistics_packages p ON p.id=r.package_id WHERE r.cost_item_id=OLD.id AND r.released_at IS NULL AND (p.content_closed_at IS NOT NULL OR p.stage!='preparing')
) AND (OLD.effective_price_state IS NOT NEW.effective_price_state OR OLD.effective_price_unit_cents IS NOT NEW.effective_price_unit_cents OR OLD.china_freight_state IS NOT NEW.china_freight_state OR OLD.china_freight_unit_cents IS NOT NEW.china_freight_unit_cents)
BEGIN SELECT RAISE(ABORT,'PACKAGE_VALUATION_LOCKED'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_event_delete BEFORE DELETE ON logistics_events BEGIN SELECT RAISE(ABORT,'IMMUTABLE_LOGISTICS_EVENT'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_event_update BEFORE UPDATE ON logistics_events BEGIN SELECT RAISE(ABORT,'IMMUTABLE_LOGISTICS_EVENT'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_legacy_charge_delete BEFORE DELETE ON logistics_legacy_charges BEGIN SELECT RAISE(ABORT,'IMMUTABLE_LEGACY_CHARGE_BRIDGE'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_legacy_charge_update BEFORE UPDATE ON logistics_legacy_charges BEGIN SELECT RAISE(ABORT,'IMMUTABLE_LEGACY_CHARGE_BRIDGE'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_manifest_immutable_delete BEFORE DELETE ON logistics_manifests BEGIN SELECT RAISE(ABORT,'IMMUTABLE_MANIFEST'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_manifest_immutable_update BEFORE UPDATE ON logistics_manifests BEGIN SELECT RAISE(ABORT,'IMMUTABLE_MANIFEST'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_order_basis_lock BEFORE UPDATE ON purchase_item_costs WHEN (OLD.effective_price_state IS NOT NEW.effective_price_state OR OLD.effective_price_unit_cents IS NOT NEW.effective_price_unit_cents OR OLD.china_freight_state IS NOT NEW.china_freight_state OR OLD.china_freight_unit_cents IS NOT NEW.china_freight_unit_cents) AND EXISTS(
 SELECT 1 FROM purchase_item_costs c JOIN logistics_reservations r ON r.cost_item_id=c.id JOIN logistics_packages p ON p.id=r.package_id WHERE c.order_id=OLD.order_id AND r.released_at IS NULL AND (p.content_closed_at IS NOT NULL OR p.stage!='preparing')
) BEGIN SELECT RAISE(ABORT,'PACKAGE_VALUATION_LOCKED'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_package_account_scope BEFORE INSERT ON logistics_packages WHEN NEW.account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hubbuy_accounts a WHERE a.id=NEW.account_id AND a.workspace_id=NEW.workspace_id AND a.deleted_at IS NULL AND a.status='active') BEGIN SELECT RAISE(ABORT,'PACKAGE_ACCOUNT_SCOPE'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_package_account_update_scope BEFORE UPDATE OF account_id,workspace_id ON logistics_packages WHEN NEW.account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hubbuy_accounts a WHERE a.id=NEW.account_id AND a.workspace_id=NEW.workspace_id AND a.deleted_at IS NULL AND a.status='active') BEGIN SELECT RAISE(ABORT,'PACKAGE_ACCOUNT_SCOPE'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_participant_delete_lock BEFORE DELETE ON purchase_cost_participants WHEN EXISTS (
 SELECT 1 FROM logistics_reservations r JOIN logistics_packages p ON p.id=r.package_id WHERE r.cost_item_id=OLD.cost_item_id AND r.released_at IS NULL AND (p.content_closed_at IS NOT NULL OR p.stage!='preparing')
) BEGIN SELECT RAISE(ABORT,'PACKAGE_VALUATION_LOCKED'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_participant_update_lock BEFORE UPDATE ON purchase_cost_participants WHEN EXISTS (
 SELECT 1 FROM logistics_reservations r JOIN logistics_packages p ON p.id=r.package_id WHERE r.cost_item_id=OLD.cost_item_id AND r.released_at IS NULL AND (p.content_closed_at IS NOT NULL OR p.stage!='preparing')
) BEGIN SELECT RAISE(ABORT,'PACKAGE_VALUATION_LOCKED'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_product_fee_lock BEFORE UPDATE ON purchase_cost_charges WHEN OLD.charge_type='products' AND (OLD.payment_method IS NOT NEW.payment_method OR OLD.fee_bps IS NOT NEW.fee_bps) AND EXISTS (
 SELECT 1 FROM purchase_item_costs c JOIN logistics_reservations r ON r.cost_item_id=c.id JOIN logistics_packages p ON p.id=r.package_id
 WHERE c.order_id=OLD.order_id AND r.released_at IS NULL AND (p.content_closed_at IS NOT NULL OR p.stage!='preparing')
) BEGIN SELECT RAISE(ABORT,'PACKAGE_VALUATION_LOCKED'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_refund_overlap BEFORE INSERT ON purchase_cost_refunds WHEN NEW.status!='voided' AND EXISTS (
 SELECT 1 FROM logistics_reservations r WHERE r.cost_item_id=NEW.cost_item_id AND r.released_at IS NULL AND r.unit_index>=NEW.unit_start AND r.unit_index<NEW.unit_start+NEW.quantity
) BEGIN SELECT RAISE(ABORT,'RELEASE_PACKAGE_UNITS_BEFORE_REFUND'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_refund_review BEFORE INSERT ON purchase_cost_refunds WHEN NOT EXISTS(SELECT 1 FROM order_warehouse_positions w WHERE w.cost_item_id=NEW.cost_item_id AND w.review_state='confirmed') BEGIN SELECT RAISE(ABORT,'WAREHOUSE_REVIEW_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_refund_update_overlap BEFORE UPDATE OF cost_item_id,unit_start,quantity,status ON purchase_cost_refunds WHEN NEW.status!='voided' AND EXISTS(
 SELECT 1 FROM logistics_reservations r WHERE r.cost_item_id=NEW.cost_item_id AND r.released_at IS NULL AND r.unit_index>=NEW.unit_start AND r.unit_index<NEW.unit_start+NEW.quantity
) BEGIN SELECT RAISE(ABORT,'RELEASE_PACKAGE_UNITS_BEFORE_REFUND'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_reservation_identity BEFORE UPDATE OF package_id,cost_item_id,unit_index ON logistics_reservations BEGIN SELECT RAISE(ABORT,'RESERVATION_IDENTITY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_reservation_reactivation BEFORE UPDATE OF released_at ON logistics_reservations WHEN OLD.released_at IS NOT NULL OR NEW.released_at IS NULL BEGIN SELECT RAISE(ABORT,'RELEASED_RESERVATION_IS_HISTORICAL'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_reservation_refund_overlap BEFORE INSERT ON logistics_reservations WHEN NEW.released_at IS NULL AND EXISTS (
 SELECT 1 FROM purchase_cost_refunds r WHERE r.cost_item_id=NEW.cost_item_id AND r.status!='voided' AND NEW.unit_index>=r.unit_start AND NEW.unit_index<r.unit_start+r.quantity
) BEGIN SELECT RAISE(ABORT,'CANCELLED_UNIT_CANNOT_BE_RESERVED'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_reservation_scope BEFORE INSERT ON logistics_reservations WHEN NEW.released_at IS NULL AND NOT EXISTS (
 SELECT 1 FROM order_warehouse_positions w JOIN logistics_packages p ON p.id=NEW.package_id
 JOIN purchase_item_costs c ON c.id=w.cost_item_id JOIN purchase_cost_orders o ON o.id=c.order_id
 WHERE w.cost_item_id=NEW.cost_item_id AND w.workspace_id=p.workspace_id AND w.account_id=p.account_id
 AND w.review_state='confirmed' AND p.review_state='confirmed' AND p.stage='preparing' AND p.content_closed_at IS NULL AND p.financial_closed_at IS NULL
 AND o.state='recorded' AND NOT EXISTS(SELECT 1 FROM purchase_order_corrections x WHERE x.previous_order_id=o.id)
 AND EXISTS(SELECT 1 FROM json_each(w.received_units) j WHERE j.value=NEW.unit_index)
) BEGIN SELECT RAISE(ABORT,'WAREHOUSE_RESERVATION_INELIGIBLE'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_safe_money BEFORE UPDATE ON logistics_packages WHEN
 (NEW.freight_cents IS NOT NULL AND (typeof(NEW.freight_cents)!='integer' OR NEW.freight_cents NOT BETWEEN 0 AND 1000000000000))
 OR (NEW.freight_fee_cents IS NOT NULL AND (typeof(NEW.freight_fee_cents)!='integer' OR NEW.freight_fee_cents NOT BETWEEN 0 AND 1000000000000))
 OR (NEW.customs_cents IS NOT NULL AND (typeof(NEW.customs_cents)!='integer' OR NEW.customs_cents NOT BETWEEN 0 AND 1000000000000))
 BEGIN SELECT RAISE(ABORT,'LOGISTICS_SAFE_MONEY_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_sealed_release BEFORE UPDATE OF released_at ON logistics_reservations WHEN EXISTS (
 SELECT 1 FROM logistics_packages p WHERE p.id=OLD.package_id AND (p.content_closed_at IS NOT NULL OR p.stage!='preparing' OR p.financial_closed_at IS NOT NULL)
) BEGIN SELECT RAISE(ABORT,'PACKAGE_CONTENT_LOCKED'); END;
--> statement-breakpoint
CREATE TRIGGER `member_balance_financing_entries_no_delete` BEFORE DELETE ON `member_balance_financing_entries` BEGIN SELECT RAISE(ABORT, 'financing entries are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `member_balance_financing_entries_no_update` BEFORE UPDATE ON `member_balance_financing_entries` BEGIN SELECT RAISE(ABORT, 'financing entries are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `onboarding_enrollment_immutable` BEFORE UPDATE ON `onboarding_enrollments`
BEGIN SELECT RAISE(ABORT, 'onboarding enrollment is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `order_corrections_no_delete` BEFORE DELETE ON `purchase_order_corrections` BEGIN SELECT RAISE(ABORT, 'order corrections are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `order_corrections_no_update` BEFORE UPDATE ON `purchase_order_corrections` BEGIN SELECT RAISE(ABORT, 'order corrections are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `order_corrections_scope_guard` BEFORE INSERT ON `purchase_order_corrections`
WHEN NOT EXISTS (
 SELECT 1 FROM purchase_cost_orders p JOIN purchase_cost_orders n ON n.id = NEW.replacement_order_id
 JOIN purchase_cost_trackings t ON t.id = NEW.tracking_id
 JOIN financial_operations f ON f.id = NEW.operation_id
 WHERE p.id = NEW.previous_order_id AND p.tracking_id = t.id AND n.tracking_id = t.id
 AND p.kind = 'additional' AND n.kind = 'additional' AND p.state = 'recorded' AND n.state = 'recorded'
 AND p.account_id = n.account_id AND f.workspace_id = t.workspace_id AND f.operation_type = 'additional_order_corrected'
)
BEGIN SELECT RAISE(ABORT, 'invalid order correction scope'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_cost_order_recorded_no_delete` BEFORE DELETE ON `purchase_cost_orders` WHEN OLD.state = 'recorded' BEGIN SELECT RAISE(ABORT, 'recorded purchase orders are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_cost_order_recorded_no_update` BEFORE UPDATE ON `purchase_cost_orders`
WHEN OLD.state = 'recorded' AND (NEW.tracking_id IS NOT OLD.tracking_id OR NEW.kind IS NOT OLD.kind OR NEW.account_id IS NOT OLD.account_id OR NEW.external_reference IS NOT OLD.external_reference OR NEW.state IS NOT OLD.state OR NEW.occurred_at IS NOT OLD.occurred_at OR NEW.recorded_at IS NOT OLD.recorded_at OR NEW.operation_id IS NOT OLD.operation_id OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at)
BEGIN SELECT RAISE(ABORT, 'recorded purchase orders are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_cost_orders_live_account_insert` BEFORE INSERT ON `purchase_cost_orders` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_cost_orders_live_account_update` BEFORE UPDATE OF account_id ON `purchase_cost_orders` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_cost_package_events_no_delete` BEFORE DELETE ON `purchase_cost_package_events` BEGIN SELECT RAISE(ABORT, 'purchase_cost_package_events are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_cost_package_events_no_update` BEFORE UPDATE ON `purchase_cost_package_events` BEGIN SELECT RAISE(ABORT, 'purchase_cost_package_events are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_cost_refunds_live_account_insert` BEFORE INSERT ON `purchase_cost_refunds` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.hubbuy_account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_cost_refunds_live_account_update` BEFORE UPDATE OF hubbuy_account_id ON `purchase_cost_refunds` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.hubbuy_account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_packages_live_account_insert` BEFORE INSERT ON `purchase_packages` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_packages_live_account_update` BEFORE UPDATE OF account_id ON `purchase_packages` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_payment_allocation_capacity_guard` BEFORE INSERT ON `purchase_payment_allocations`
WHEN NOT EXISTS (
  SELECT 1 FROM `purchase_payment_components` c
  JOIN `purchase_cost_orders` o ON o.id = c.order_id
  JOIN `purchase_cost_trackings` t ON t.id = o.tracking_id
  JOIN `workspace_members` m ON m.workspace_id = t.workspace_id AND m.user_id = NEW.person_id
  JOIN `purchase_item_costs` i ON i.id = NEW.cost_item_id AND i.order_id = c.order_id
  WHERE c.id = NEW.component_id
    AND ((NEW.cost_component = 'product' AND i.native_product_state = 'known' AND COALESCE((SELECT SUM(cny_minor) FROM `purchase_payment_allocations` WHERE cost_item_id = NEW.cost_item_id AND cost_component = NEW.cost_component), 0) + NEW.cny_minor <= i.native_product_cny_minor)
      OR (NEW.cost_component = 'china' AND i.native_china_state = 'known' AND COALESCE((SELECT SUM(cny_minor) FROM `purchase_payment_allocations` WHERE cost_item_id = NEW.cost_item_id AND cost_component = NEW.cost_component), 0) + NEW.cny_minor <= i.native_china_cny_minor))
)
BEGIN SELECT RAISE(ABORT, 'payment allocation exceeds item capacity or workspace membership'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_payment_allocation_no_delete` BEFORE DELETE ON `purchase_payment_allocations` BEGIN SELECT RAISE(ABORT, 'payment allocations are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_payment_allocation_no_update` BEFORE UPDATE ON `purchase_payment_allocations` BEGIN SELECT RAISE(ABORT, 'payment allocations are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_payment_component_no_delete` BEFORE DELETE ON `purchase_payment_components` BEGIN SELECT RAISE(ABORT, 'payment components are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_payment_component_no_update` BEFORE UPDATE ON `purchase_payment_components` BEGIN SELECT RAISE(ABORT, 'payment components are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_payment_components_live_account_insert` BEFORE INSERT ON `purchase_payment_components` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.source_account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_payment_components_live_account_update` BEFORE UPDATE OF source_account_id ON `purchase_payment_components` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.source_account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `referral_attribution_immutable` BEFORE UPDATE ON `referral_attributions`
WHEN OLD.confirmed_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'confirmed referral attribution is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `refund_events_live_account_insert` BEFORE INSERT ON `purchase_cost_refund_events` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a, json_tree(NEW.details_json) j WHERE a.deleted_at IS NOT NULL AND j.type = 'text' AND j.atom = a.id) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `refund_payment_allocation_workspace_guard` BEFORE INSERT ON `purchase_refund_payment_allocations`
WHEN NOT EXISTS (
  SELECT 1 FROM `purchase_cost_refunds` r
  JOIN `purchase_cost_trackings` t ON t.id = r.tracking_id
  JOIN `financial_operations` o ON o.id = NEW.operation_id
  JOIN `workspace_members` m ON m.workspace_id = t.workspace_id AND m.user_id = NEW.person_id
  WHERE r.id = NEW.refund_id AND o.workspace_id = t.workspace_id
)
BEGIN SELECT RAISE(ABORT, 'refund allocation must match the refund workspace and member'); END;
--> statement-breakpoint
CREATE TRIGGER `refund_payment_allocations_no_delete` BEFORE DELETE ON `purchase_refund_payment_allocations` BEGIN SELECT RAISE(ABORT, 'refund allocations are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `refund_payment_allocations_no_update` BEFORE UPDATE ON `purchase_refund_payment_allocations` BEGIN SELECT RAISE(ABORT, 'refund allocations are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER warehouse_new_cost AFTER INSERT ON purchase_item_costs BEGIN
 INSERT INTO order_warehouse_positions(cost_item_id,workspace_id,account_id,review_state,received_units,revision,updated_at)
 SELECT NEW.id,t.workspace_id,o.account_id,'confirmed','[]',0,unixepoch()*1000 FROM purchase_cost_trackings t LEFT JOIN purchase_cost_orders o ON o.id=NEW.order_id WHERE t.id=NEW.tracking_id;
END;
--> statement-breakpoint
CREATE TRIGGER warehouse_position_scope BEFORE UPDATE ON order_warehouse_positions WHEN NOT EXISTS(
 SELECT 1 FROM purchase_item_costs c JOIN purchase_cost_trackings t ON t.id=c.tracking_id WHERE c.id=NEW.cost_item_id AND t.workspace_id=NEW.workspace_id
) OR (NEW.account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hubbuy_accounts a WHERE a.id=NEW.account_id AND a.workspace_id=NEW.workspace_id AND a.deleted_at IS NULL)) BEGIN SELECT RAISE(ABORT,'WAREHOUSE_POSITION_SCOPE'); END;
--> statement-breakpoint
CREATE TRIGGER warehouse_received_capacity BEFORE UPDATE OF received_units,account_id,workspace_id ON order_warehouse_positions WHEN
 json_valid(NEW.received_units)=0 OR json_type(NEW.received_units)!='array'
 OR EXISTS(SELECT 1 FROM json_each(NEW.received_units) j WHERE j.type!='integer' OR j.value<0 OR j.value >= (SELECT coalesce(i.quantity,a.quantity) FROM purchase_item_costs c LEFT JOIN purchase_items i ON i.id=c.purchase_item_id LEFT JOIN purchase_additional_order_items a ON a.id=c.additional_order_item_id WHERE c.id=NEW.cost_item_id))
 OR (SELECT count(*) FROM json_each(NEW.received_units))!=(SELECT count(DISTINCT value) FROM json_each(NEW.received_units))
 OR EXISTS(SELECT 1 FROM logistics_reservations r WHERE r.cost_item_id=NEW.cost_item_id AND r.released_at IS NULL AND NOT EXISTS(SELECT 1 FROM json_each(NEW.received_units) j WHERE j.value=r.unit_index))
 OR EXISTS(SELECT 1 FROM logistics_reservations r JOIN logistics_packages p ON p.id=r.package_id WHERE r.cost_item_id=NEW.cost_item_id AND r.released_at IS NULL AND ((p.account_id IS NOT NEW.account_id AND (p.account_id IS NOT NULL OR p.review_state!='pending_review')) OR p.workspace_id!=NEW.workspace_id))
 BEGIN SELECT RAISE(ABORT,'WAREHOUSE_RECEIVED_CAPACITY_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_identity_immutable
BEFORE UPDATE OF kind, owner_user_id ON workspaces
WHEN NEW.kind IS NOT OLD.kind OR NEW.owner_user_id IS NOT OLD.owner_user_id
BEGIN
  SELECT RAISE(ABORT, 'WORKSPACE_IDENTITY_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER workspace_kind_owner_insert_guard
BEFORE INSERT ON workspaces
WHEN NEW.kind NOT IN ('personal', 'shared')
  OR (NEW.kind = 'personal' AND NEW.owner_user_id IS NULL)
  OR (NEW.kind = 'shared' AND NEW.owner_user_id IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'WORKSPACE_KIND_OWNER_INVALID');
END;
--> statement-breakpoint
CREATE TRIGGER workspace_member_shared_insert_guard
BEFORE INSERT ON workspace_members
WHEN (SELECT kind FROM workspaces WHERE id = NEW.workspace_id) IS NOT 'shared'
BEGIN
  SELECT RAISE(ABORT, 'WORKSPACE_MEMBER_REQUIRES_SHARED_WORKSPACE');
END;
--> statement-breakpoint
CREATE TRIGGER workspace_member_shared_update_guard
BEFORE UPDATE OF workspace_id, user_id ON workspace_members
WHEN (SELECT kind FROM workspaces WHERE id = NEW.workspace_id) IS NOT 'shared'
BEGIN
  SELECT RAISE(ABORT, 'WORKSPACE_MEMBER_REQUIRES_SHARED_WORKSPACE');
END;
--> statement-breakpoint
CREATE TRIGGER topups_no_update BEFORE UPDATE ON hubbuy_topups BEGIN SELECT RAISE(ABORT, 'topups are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER topups_no_delete BEFORE DELETE ON hubbuy_topups BEGIN SELECT RAISE(ABORT, 'topups are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER topup_funders_no_update BEFORE UPDATE ON hubbuy_topup_funders BEGIN SELECT RAISE(ABORT, 'topup funders are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER topup_funders_no_delete BEFORE DELETE ON hubbuy_topup_funders BEGIN SELECT RAISE(ABORT, 'topup funders are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER topup_reversals_no_update BEFORE UPDATE ON hubbuy_topup_reversals BEGIN SELECT RAISE(ABORT, 'topup reversals are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER topup_reversals_no_delete BEFORE DELETE ON hubbuy_topup_reversals BEGIN SELECT RAISE(ABORT, 'topup reversals are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER topup_scope_guard BEFORE INSERT ON hubbuy_topups WHEN NOT EXISTS (
 SELECT 1 FROM hubbuy_accounts a JOIN financial_operations o ON o.id=NEW.operation_id
 JOIN hubbuy_balance_entries e ON e.id=NEW.credit_entry_id
 WHERE a.id=NEW.account_id AND a.deleted_at IS NULL AND a.status='active' AND a.workspace_id=o.workspace_id
 AND o.operation_type='hubbuy_topup_recorded' AND o.reason IS NOT NULL AND o.occurred_at IS NOT NULL
 AND e.account_id=a.id AND e.operation_id=o.id AND e.source_type='topup' AND e.source_id=NEW.id AND e.direction='credit'
 AND e.amount_cny_minor=NEW.cny_minor AND e.historical_brl_cents=NEW.principal_brl_cents
 AND e.amount_cny_minor=(SELECT coalesce(sum(amount_cny_minor),0) FROM hubbuy_balance_credit_shares WHERE credit_entry_id=e.id)
 AND e.historical_brl_cents=(SELECT coalesce(sum(historical_brl_cents),0) FROM hubbuy_balance_credit_shares WHERE credit_entry_id=e.id)
 AND ((NEW.fee_mode='percentage' AND NEW.fee_bps IS NOT NULL AND NEW.fee_brl_cents=(NEW.principal_brl_cents*NEW.fee_bps+5000)/10000)
 OR (NEW.fee_mode='effective' AND NEW.fee_reason IS NOT NULL AND length(trim(NEW.fee_reason)) BETWEEN 1 AND 1000))
) BEGIN SELECT RAISE(ABORT, 'invalid topup scope or receipt'); END;
--> statement-breakpoint
CREATE TRIGGER topup_funder_scope_guard BEFORE INSERT ON hubbuy_topup_funders WHEN NOT EXISTS (
 SELECT 1 FROM hubbuy_topups t JOIN hubbuy_accounts a ON a.id=t.account_id JOIN workspaces w ON w.id=a.workspace_id
 WHERE t.id=NEW.topup_id AND NOT EXISTS(SELECT 1 FROM hubbuy_topup_reversals r WHERE r.topup_id=t.id)
 AND ((w.kind='personal' AND w.owner_user_id=NEW.person_id) OR (w.kind='shared' AND EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=w.id AND m.user_id=NEW.person_id)))
 AND (NEW.credit_share_id IS NULL OR EXISTS(SELECT 1 FROM hubbuy_balance_credit_shares s WHERE s.id=NEW.credit_share_id AND s.credit_entry_id=t.credit_entry_id AND s.person_id=NEW.person_id AND s.amount_cny_minor=NEW.cny_minor AND s.historical_brl_cents=NEW.principal_brl_cents))
 AND NEW.cny_minor+(SELECT coalesce(sum(cny_minor),0) FROM hubbuy_topup_funders WHERE topup_id=t.id)<=t.cny_minor
 AND NEW.principal_brl_cents+(SELECT coalesce(sum(principal_brl_cents),0) FROM hubbuy_topup_funders WHERE topup_id=t.id)<=t.principal_brl_cents
 AND NEW.fee_brl_cents+(SELECT coalesce(sum(fee_brl_cents),0) FROM hubbuy_topup_funders WHERE topup_id=t.id)<=t.fee_brl_cents
) BEGIN SELECT RAISE(ABORT, 'invalid topup funder'); END;
--> statement-breakpoint
CREATE TRIGGER topup_reversal_scope_guard BEFORE INSERT ON hubbuy_topup_reversals WHEN NOT EXISTS (
 SELECT 1 FROM hubbuy_topups t JOIN hubbuy_balance_entries d ON d.id=NEW.debit_entry_id JOIN financial_operations o ON o.id=NEW.operation_id
 WHERE t.id=NEW.topup_id AND d.account_id=t.account_id AND d.operation_id=o.id AND d.direction='debit'
 AND d.source_type='reversal' AND d.source_id=t.id AND d.reversal_of_entry_id=t.credit_entry_id
 AND d.amount_cny_minor=t.cny_minor AND d.historical_brl_cents=t.principal_brl_cents
 AND o.operation_type='hubbuy_topup_reversed' AND o.reversal_of_id=t.operation_id
 AND d.amount_cny_minor=(SELECT coalesce(sum(amount_cny_minor),0) FROM hubbuy_balance_consumptions WHERE debit_entry_id=d.id)
 AND d.historical_brl_cents=(SELECT coalesce(sum(historical_brl_cents),0) FROM hubbuy_balance_consumptions WHERE debit_entry_id=d.id)
 AND NOT EXISTS(SELECT 1 FROM hubbuy_balance_consumptions c JOIN hubbuy_balance_credit_shares s ON s.id=c.credit_share_id WHERE s.credit_entry_id=t.credit_entry_id AND c.debit_entry_id!=d.id)
 AND NOT EXISTS(SELECT 1 FROM hubbuy_balance_consumptions c JOIN hubbuy_balance_credit_shares s ON s.id=c.credit_share_id WHERE c.debit_entry_id=d.id AND s.credit_entry_id!=t.credit_entry_id)
) BEGIN SELECT RAISE(ABORT, 'invalid topup reversal or dependent consumption'); END;
--> statement-breakpoint
CREATE TRIGGER topup_reference_guard BEFORE INSERT ON hubbuy_topups WHEN NEW.external_reference IS NOT NULL AND (
 EXISTS(SELECT 1 FROM hubbuy_balance_adjustments a WHERE a.account_id=NEW.account_id AND a.external_reference=NEW.external_reference)
 OR EXISTS(SELECT 1 FROM hubbuy_reconciliation_events e WHERE e.account_id=NEW.account_id AND e.source_reference=NEW.external_reference)
) BEGIN SELECT RAISE(ABORT, 'financial reference already recorded'); END;
--> statement-breakpoint
CREATE TRIGGER topup_adjustment_reference_guard BEFORE INSERT ON hubbuy_balance_adjustments WHEN NEW.external_reference IS NOT NULL AND EXISTS(SELECT 1 FROM hubbuy_topups t WHERE t.account_id=NEW.account_id AND t.external_reference=NEW.external_reference) BEGIN SELECT RAISE(ABORT, 'financial reference already recorded'); END;
--> statement-breakpoint
CREATE TRIGGER topup_reconciliation_reference_guard BEFORE INSERT ON hubbuy_reconciliation_events WHEN NEW.source_reference IS NOT NULL AND EXISTS(SELECT 1 FROM hubbuy_topups t WHERE t.account_id=NEW.account_id AND t.external_reference=NEW.source_reference) BEGIN SELECT RAISE(ABORT, 'financial reference already recorded'); END;
--> statement-breakpoint
DROP TRIGGER hubbuy_credit_share_guard;
--> statement-breakpoint
CREATE TRIGGER hubbuy_credit_share_guard BEFORE INSERT ON hubbuy_balance_credit_shares
WHEN NOT EXISTS (
 SELECT 1 FROM hubbuy_balance_entries e JOIN hubbuy_accounts a ON a.id=e.account_id JOIN workspaces w ON w.id=a.workspace_id
 WHERE e.id=NEW.credit_entry_id AND e.direction='credit'
 AND ((w.kind='personal' AND w.owner_user_id=NEW.person_id)
 OR (w.kind='shared' AND EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=w.id AND m.user_id=NEW.person_id)))
) BEGIN SELECT RAISE(ABORT, 'credit share must belong to an authorized workspace owner or member and credit entry'); END;
