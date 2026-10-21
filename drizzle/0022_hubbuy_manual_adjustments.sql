CREATE TABLE `hubbuy_balance_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`balance_entry_id` text NOT NULL,
	`kind` text NOT NULL,
	`external_reference` text,
	`reverses_adjustment_id` text,
	FOREIGN KEY (`account_id`) REFERENCES `hubbuy_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `financial_operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`balance_entry_id`) REFERENCES `hubbuy_balance_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reverses_adjustment_id`) REFERENCES `hubbuy_balance_adjustments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "hubbuy_adjustment_kind" CHECK("hubbuy_balance_adjustments"."kind" IN ('promotional_bonus','documented_credit','documented_debit','reversal')),
	CONSTRAINT "hubbuy_adjustment_reference" CHECK("hubbuy_balance_adjustments"."external_reference" IS NULL OR length(trim("hubbuy_balance_adjustments"."external_reference")) BETWEEN 1 AND 200),
	CONSTRAINT "hubbuy_adjustment_reversal" CHECK(("hubbuy_balance_adjustments"."kind" = 'reversal' AND "hubbuy_balance_adjustments"."reverses_adjustment_id" IS NOT NULL AND "hubbuy_balance_adjustments"."external_reference" IS NULL) OR ("hubbuy_balance_adjustments"."kind" != 'reversal' AND "hubbuy_balance_adjustments"."reverses_adjustment_id" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hubbuy_adjustment_operation_idx` ON `hubbuy_balance_adjustments` (`operation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `hubbuy_adjustment_entry_idx` ON `hubbuy_balance_adjustments` (`balance_entry_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `hubbuy_adjustment_reversal_idx` ON `hubbuy_balance_adjustments` (`reverses_adjustment_id`);--> statement-breakpoint
CREATE INDEX `hubbuy_adjustment_reference_idx` ON `hubbuy_balance_adjustments` (`account_id`,`external_reference`);--> statement-breakpoint
CREATE TRIGGER hubbuy_adjustments_no_update BEFORE UPDATE ON hubbuy_balance_adjustments BEGIN SELECT RAISE(ABORT, 'adjustments are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER hubbuy_adjustments_no_delete BEFORE DELETE ON hubbuy_balance_adjustments BEGIN SELECT RAISE(ABORT, 'adjustments are append-only'); END;
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
CREATE TRIGGER hubbuy_adjustment_reference_guard BEFORE INSERT ON hubbuy_balance_adjustments
WHEN NEW.external_reference IS NOT NULL AND EXISTS (
 SELECT 1 FROM hubbuy_balance_adjustments old WHERE old.account_id = NEW.account_id AND old.external_reference = NEW.external_reference
 AND NOT EXISTS (SELECT 1 FROM hubbuy_balance_adjustments r WHERE r.reverses_adjustment_id = old.id)
) BEGIN SELECT RAISE(ABORT, 'adjustment reference already recorded'); END;
--> statement-breakpoint
DROP TRIGGER `refund_payment_allocation_workspace_guard`;--> statement-breakpoint
DROP TRIGGER `purchase_cost_refunds_live_account_insert`;--> statement-breakpoint
DROP TRIGGER `purchase_cost_refunds_live_account_update`;--> statement-breakpoint
DROP TRIGGER `hubbuy_account_delete_eligibility`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_purchase_cost_refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`tracking_id` text NOT NULL,
	`cost_item_id` text NOT NULL,
	`status` text NOT NULL,
	`quantity` integer NOT NULL,
	`requested_product_cents` integer NOT NULL,
	`requested_china_cents` integer NOT NULL,
	`requested_product_cny_minor` integer,
	`requested_china_cny_minor` integer,
	`received_product_cents` integer,
	`received_china_cents` integer,
	`refund_destination` text,
	`hubbuy_account_id` text,
	`received_product_cny_minor` integer,
	`received_china_cny_minor` integer,
	`native_evidence` text,
	`credit_operation_id` text,
	`receipt_operation_id` text,
	`reason` text NOT NULL,
	`unit_start` integer DEFAULT 0 NOT NULL,
	`original_item_quantity` integer NOT NULL,
	`original_product_unit_cents` integer NOT NULL,
	`original_china_unit_cents` integer NOT NULL,
	`original_charge_base_cents` integer,
	`original_charge_fee_cents` integer,
	`original_item_fee_cents` integer,
	`original_payment_method` text,
	`original_fee_bps` integer,
	`original_paid_at` integer,
	`original_paid_by` text,
	`requested_at` integer NOT NULL,
	`requested_by` text NOT NULL,
	`received_at` integer,
	`received_by` text,
	`voided_at` integer,
	`voided_by` text,
	`void_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`tracking_id`) REFERENCES `purchase_cost_trackings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cost_item_id`) REFERENCES `purchase_item_costs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`hubbuy_account_id`) REFERENCES `hubbuy_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`credit_operation_id`) REFERENCES `financial_operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receipt_operation_id`) REFERENCES `financial_operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`original_paid_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`received_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voided_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cost_refund_status" CHECK("__new_purchase_cost_refunds"."status" IN ('requested','received','voided')),
	CONSTRAINT "cost_refund_destination" CHECK(("__new_purchase_cost_refunds"."refund_destination" IS NULL AND "__new_purchase_cost_refunds"."hubbuy_account_id" IS NULL AND "__new_purchase_cost_refunds"."received_product_cny_minor" IS NULL AND "__new_purchase_cost_refunds"."received_china_cny_minor" IS NULL AND "__new_purchase_cost_refunds"."native_evidence" IS NULL AND "__new_purchase_cost_refunds"."credit_operation_id" IS NULL) OR ("__new_purchase_cost_refunds"."refund_destination" = 'external' AND "__new_purchase_cost_refunds"."hubbuy_account_id" IS NULL AND "__new_purchase_cost_refunds"."received_product_cny_minor" IS NULL AND "__new_purchase_cost_refunds"."received_china_cny_minor" IS NULL AND "__new_purchase_cost_refunds"."native_evidence" IS NULL AND "__new_purchase_cost_refunds"."credit_operation_id" IS NULL) OR ("__new_purchase_cost_refunds"."refund_destination" = 'hubbuy' AND "__new_purchase_cost_refunds"."hubbuy_account_id" IS NOT NULL AND typeof("__new_purchase_cost_refunds"."received_product_cny_minor") = 'integer' AND "__new_purchase_cost_refunds"."received_product_cny_minor" BETWEEN 0 AND 1000000000000 AND typeof("__new_purchase_cost_refunds"."received_china_cny_minor") = 'integer' AND "__new_purchase_cost_refunds"."received_china_cny_minor" BETWEEN 0 AND 1000000000000 AND length(trim("__new_purchase_cost_refunds"."native_evidence")) BETWEEN 3 AND 1000 AND (("__new_purchase_cost_refunds"."received_product_cny_minor" + "__new_purchase_cost_refunds"."received_china_cny_minor" = 0 AND "__new_purchase_cost_refunds"."credit_operation_id" IS NULL) OR ("__new_purchase_cost_refunds"."received_product_cny_minor" + "__new_purchase_cost_refunds"."received_china_cny_minor" > 0 AND "__new_purchase_cost_refunds"."credit_operation_id" IS NOT NULL)))),
	CONSTRAINT "cost_refund_quantity" CHECK(typeof("__new_purchase_cost_refunds"."quantity") = 'integer' AND "__new_purchase_cost_refunds"."quantity" BETWEEN 1 AND 10000),
	CONSTRAINT "cost_refund_requested_amounts" CHECK(typeof("__new_purchase_cost_refunds"."requested_product_cents") = 'integer' AND "__new_purchase_cost_refunds"."requested_product_cents" BETWEEN 0 AND 1000000000000 AND typeof("__new_purchase_cost_refunds"."requested_china_cents") = 'integer' AND "__new_purchase_cost_refunds"."requested_china_cents" BETWEEN 0 AND 1000000000000 AND (("__new_purchase_cost_refunds"."requested_product_cny_minor" IS NULL AND "__new_purchase_cost_refunds"."requested_china_cny_minor" IS NULL AND "__new_purchase_cost_refunds"."requested_product_cents" + "__new_purchase_cost_refunds"."requested_china_cents" > 0) OR (typeof("__new_purchase_cost_refunds"."requested_product_cny_minor") = 'integer' AND "__new_purchase_cost_refunds"."requested_product_cny_minor" BETWEEN 0 AND 1000000000000 AND typeof("__new_purchase_cost_refunds"."requested_china_cny_minor") = 'integer' AND "__new_purchase_cost_refunds"."requested_china_cny_minor" BETWEEN 0 AND 1000000000000 AND "__new_purchase_cost_refunds"."requested_product_cny_minor" + "__new_purchase_cost_refunds"."requested_china_cny_minor" BETWEEN 1 AND 1000000000000))),
	CONSTRAINT "cost_refund_received_state" CHECK(("__new_purchase_cost_refunds"."status" = 'requested' AND "__new_purchase_cost_refunds"."received_product_cents" IS NULL AND "__new_purchase_cost_refunds"."received_china_cents" IS NULL AND "__new_purchase_cost_refunds"."received_at" IS NULL AND "__new_purchase_cost_refunds"."received_by" IS NULL) OR ("__new_purchase_cost_refunds"."status" IN ('received','voided') AND (("__new_purchase_cost_refunds"."received_product_cents" IS NULL AND "__new_purchase_cost_refunds"."received_china_cents" IS NULL AND "__new_purchase_cost_refunds"."received_at" IS NULL AND "__new_purchase_cost_refunds"."received_by" IS NULL) OR (typeof("__new_purchase_cost_refunds"."received_product_cents") = 'integer' AND "__new_purchase_cost_refunds"."received_product_cents" BETWEEN 0 AND 1000000000000 AND typeof("__new_purchase_cost_refunds"."received_china_cents") = 'integer' AND "__new_purchase_cost_refunds"."received_china_cents" BETWEEN 0 AND 1000000000000 AND "__new_purchase_cost_refunds"."received_at" IS NOT NULL AND "__new_purchase_cost_refunds"."received_by" IS NOT NULL)))),
	CONSTRAINT "cost_refund_void_state" CHECK(("__new_purchase_cost_refunds"."status" = 'voided' AND "__new_purchase_cost_refunds"."voided_at" IS NOT NULL AND "__new_purchase_cost_refunds"."voided_by" IS NOT NULL AND length(trim("__new_purchase_cost_refunds"."void_reason")) > 0) OR ("__new_purchase_cost_refunds"."status" != 'voided' AND "__new_purchase_cost_refunds"."voided_at" IS NULL AND "__new_purchase_cost_refunds"."voided_by" IS NULL AND "__new_purchase_cost_refunds"."void_reason" IS NULL)),
	CONSTRAINT "cost_refund_original_values" CHECK(typeof("__new_purchase_cost_refunds"."original_item_quantity") = 'integer' AND "__new_purchase_cost_refunds"."original_item_quantity" BETWEEN 1 AND 10000 AND typeof("__new_purchase_cost_refunds"."original_product_unit_cents") = 'integer' AND "__new_purchase_cost_refunds"."original_product_unit_cents" BETWEEN 0 AND 1000000000000 AND typeof("__new_purchase_cost_refunds"."original_china_unit_cents") = 'integer' AND "__new_purchase_cost_refunds"."original_china_unit_cents" BETWEEN 0 AND 1000000000000),
	CONSTRAINT "cost_refund_unit_range" CHECK(typeof("__new_purchase_cost_refunds"."unit_start") = 'integer' AND "__new_purchase_cost_refunds"."unit_start" >= 0 AND "__new_purchase_cost_refunds"."unit_start" + "__new_purchase_cost_refunds"."quantity" <= "__new_purchase_cost_refunds"."original_item_quantity"),
	CONSTRAINT "cost_refund_fee_snapshot" CHECK(("__new_purchase_cost_refunds"."original_payment_method" IS NULL AND "__new_purchase_cost_refunds"."original_fee_bps" IS NULL) OR ("__new_purchase_cost_refunds"."original_payment_method" IN ('pix','card') AND typeof("__new_purchase_cost_refunds"."original_fee_bps") = 'integer' AND "__new_purchase_cost_refunds"."original_fee_bps" BETWEEN 0 AND 10000)),
	CONSTRAINT "cost_refund_reason" CHECK(length(trim("__new_purchase_cost_refunds"."reason")) BETWEEN 1 AND 1000)
);
--> statement-breakpoint
INSERT INTO `__new_purchase_cost_refunds`("id", "tracking_id", "cost_item_id", "status", "quantity", "requested_product_cents", "requested_china_cents", "requested_product_cny_minor", "requested_china_cny_minor", "received_product_cents", "received_china_cents", "refund_destination", "hubbuy_account_id", "received_product_cny_minor", "received_china_cny_minor", "native_evidence", "credit_operation_id", "receipt_operation_id", "reason", "unit_start", "original_item_quantity", "original_product_unit_cents", "original_china_unit_cents", "original_charge_base_cents", "original_charge_fee_cents", "original_item_fee_cents", "original_payment_method", "original_fee_bps", "original_paid_at", "original_paid_by", "requested_at", "requested_by", "received_at", "received_by", "voided_at", "voided_by", "void_reason", "created_at", "updated_at", "updated_by") SELECT "id", "tracking_id", "cost_item_id", "status", "quantity", "requested_product_cents", "requested_china_cents", NULL, NULL, "received_product_cents", "received_china_cents", "refund_destination", "hubbuy_account_id", "received_product_cny_minor", "received_china_cny_minor", "native_evidence", "credit_operation_id", "receipt_operation_id", "reason", "unit_start", "original_item_quantity", "original_product_unit_cents", "original_china_unit_cents", "original_charge_base_cents", "original_charge_fee_cents", "original_item_fee_cents", "original_payment_method", "original_fee_bps", "original_paid_at", "original_paid_by", "requested_at", "requested_by", "received_at", "received_by", "voided_at", "voided_by", "void_reason", "created_at", "updated_at", "updated_by" FROM `purchase_cost_refunds`;--> statement-breakpoint
DROP TABLE `purchase_cost_refunds`;--> statement-breakpoint
ALTER TABLE `__new_purchase_cost_refunds` RENAME TO `purchase_cost_refunds`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `cost_refund_tracking_status_idx` ON `purchase_cost_refunds` (`tracking_id`,`status`);--> statement-breakpoint
CREATE INDEX `cost_refund_item_status_idx` ON `purchase_cost_refunds` (`cost_item_id`,`status`);--> statement-breakpoint
CREATE INDEX `cost_refund_requested_order_idx` ON `purchase_cost_refunds` (`tracking_id`,`requested_at`,`id`);--> statement-breakpoint
CREATE TRIGGER `refund_payment_allocation_workspace_guard` BEFORE INSERT ON `purchase_refund_payment_allocations`
WHEN NOT EXISTS (
  SELECT 1 FROM `purchase_cost_refunds` r
  JOIN `purchase_cost_trackings` t ON t.id = r.tracking_id
  JOIN `financial_operations` o ON o.id = NEW.operation_id
  JOIN `workspace_members` m ON m.workspace_id = t.workspace_id AND m.user_id = NEW.person_id
  WHERE r.id = NEW.refund_id AND o.workspace_id = t.workspace_id
)
BEGIN SELECT RAISE(ABORT, 'refund allocation must match the refund workspace and member'); END;--> statement-breakpoint
CREATE TRIGGER `purchase_cost_refunds_live_account_insert` BEFORE INSERT ON `purchase_cost_refunds` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.hubbuy_account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;--> statement-breakpoint
CREATE TRIGGER `purchase_cost_refunds_live_account_update` BEFORE UPDATE OF hubbuy_account_id ON `purchase_cost_refunds` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.hubbuy_account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;--> statement-breakpoint
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
