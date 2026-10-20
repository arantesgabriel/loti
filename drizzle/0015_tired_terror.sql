PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP TRIGGER IF EXISTS `refund_payment_allocation_workspace_guard`;--> statement-breakpoint
CREATE TABLE `__new_purchase_cost_refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`tracking_id` text NOT NULL,
	`cost_item_id` text NOT NULL,
	`status` text NOT NULL,
	`quantity` integer NOT NULL,
	`requested_product_cents` integer NOT NULL,
	`requested_china_cents` integer NOT NULL,
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
	CONSTRAINT "cost_refund_requested_amounts" CHECK(typeof("__new_purchase_cost_refunds"."requested_product_cents") = 'integer' AND "__new_purchase_cost_refunds"."requested_product_cents" BETWEEN 0 AND 1000000000000 AND typeof("__new_purchase_cost_refunds"."requested_china_cents") = 'integer' AND "__new_purchase_cost_refunds"."requested_china_cents" BETWEEN 0 AND 1000000000000 AND "__new_purchase_cost_refunds"."requested_product_cents" + "__new_purchase_cost_refunds"."requested_china_cents" > 0),
	CONSTRAINT "cost_refund_received_state" CHECK(("__new_purchase_cost_refunds"."status" = 'requested' AND "__new_purchase_cost_refunds"."received_product_cents" IS NULL AND "__new_purchase_cost_refunds"."received_china_cents" IS NULL AND "__new_purchase_cost_refunds"."received_at" IS NULL AND "__new_purchase_cost_refunds"."received_by" IS NULL) OR ("__new_purchase_cost_refunds"."status" IN ('received','voided') AND (("__new_purchase_cost_refunds"."received_product_cents" IS NULL AND "__new_purchase_cost_refunds"."received_china_cents" IS NULL AND "__new_purchase_cost_refunds"."received_at" IS NULL AND "__new_purchase_cost_refunds"."received_by" IS NULL) OR (typeof("__new_purchase_cost_refunds"."received_product_cents") = 'integer' AND "__new_purchase_cost_refunds"."received_product_cents" BETWEEN 0 AND 1000000000000 AND typeof("__new_purchase_cost_refunds"."received_china_cents") = 'integer' AND "__new_purchase_cost_refunds"."received_china_cents" BETWEEN 0 AND 1000000000000 AND "__new_purchase_cost_refunds"."received_at" IS NOT NULL AND "__new_purchase_cost_refunds"."received_by" IS NOT NULL)))),
	CONSTRAINT "cost_refund_void_state" CHECK(("__new_purchase_cost_refunds"."status" = 'voided' AND "__new_purchase_cost_refunds"."voided_at" IS NOT NULL AND "__new_purchase_cost_refunds"."voided_by" IS NOT NULL AND length(trim("__new_purchase_cost_refunds"."void_reason")) > 0) OR ("__new_purchase_cost_refunds"."status" != 'voided' AND "__new_purchase_cost_refunds"."voided_at" IS NULL AND "__new_purchase_cost_refunds"."voided_by" IS NULL AND "__new_purchase_cost_refunds"."void_reason" IS NULL)),
	CONSTRAINT "cost_refund_original_values" CHECK(typeof("__new_purchase_cost_refunds"."original_item_quantity") = 'integer' AND "__new_purchase_cost_refunds"."original_item_quantity" BETWEEN 1 AND 10000 AND typeof("__new_purchase_cost_refunds"."original_product_unit_cents") = 'integer' AND "__new_purchase_cost_refunds"."original_product_unit_cents" BETWEEN 0 AND 1000000000000 AND typeof("__new_purchase_cost_refunds"."original_china_unit_cents") = 'integer' AND "__new_purchase_cost_refunds"."original_china_unit_cents" BETWEEN 0 AND 1000000000000),
	CONSTRAINT "cost_refund_unit_range" CHECK(typeof("__new_purchase_cost_refunds"."unit_start") = 'integer' AND "__new_purchase_cost_refunds"."unit_start" >= 0 AND "__new_purchase_cost_refunds"."unit_start" + "__new_purchase_cost_refunds"."quantity" <= "__new_purchase_cost_refunds"."original_item_quantity"),
	CONSTRAINT "cost_refund_fee_snapshot" CHECK(("__new_purchase_cost_refunds"."original_payment_method" IS NULL AND "__new_purchase_cost_refunds"."original_fee_bps" IS NULL) OR ("__new_purchase_cost_refunds"."original_payment_method" IN ('pix','card') AND typeof("__new_purchase_cost_refunds"."original_fee_bps") = 'integer' AND "__new_purchase_cost_refunds"."original_fee_bps" BETWEEN 0 AND 10000)),
	CONSTRAINT "cost_refund_reason" CHECK(length(trim("__new_purchase_cost_refunds"."reason")) BETWEEN 1 AND 1000)
);
--> statement-breakpoint
INSERT INTO `__new_purchase_cost_refunds`("id", "tracking_id", "cost_item_id", "status", "quantity", "requested_product_cents", "requested_china_cents", "received_product_cents", "received_china_cents", "refund_destination", "hubbuy_account_id", "received_product_cny_minor", "received_china_cny_minor", "native_evidence", "credit_operation_id", "receipt_operation_id", "reason", "unit_start", "original_item_quantity", "original_product_unit_cents", "original_china_unit_cents", "original_charge_base_cents", "original_charge_fee_cents", "original_item_fee_cents", "original_payment_method", "original_fee_bps", "original_paid_at", "original_paid_by", "requested_at", "requested_by", "received_at", "received_by", "voided_at", "voided_by", "void_reason", "created_at", "updated_at", "updated_by") SELECT "id", "tracking_id", "cost_item_id", "status", "quantity", "requested_product_cents", "requested_china_cents", "received_product_cents", "received_china_cents", "refund_destination", "hubbuy_account_id", "received_product_cny_minor", "received_china_cny_minor", "native_evidence", "credit_operation_id", "receipt_operation_id", "reason", CASE WHEN source."status" IN ('requested','received') THEN COALESCE((SELECT SUM(prior."quantity") FROM "purchase_cost_refunds" prior WHERE prior."cost_item_id" = source."cost_item_id" AND prior."status" IN ('requested','received') AND (prior."requested_at" < source."requested_at" OR (prior."requested_at" = source."requested_at" AND prior."id" < source."id"))), 0) ELSE 0 END, "original_item_quantity", "original_product_unit_cents", "original_china_unit_cents", "original_charge_base_cents", "original_charge_fee_cents", "original_item_fee_cents", "original_payment_method", "original_fee_bps", "original_paid_at", "original_paid_by", "requested_at", "requested_by", "received_at", "received_by", "voided_at", "voided_by", "void_reason", "created_at", "updated_at", "updated_by" FROM `purchase_cost_refunds` source;--> statement-breakpoint
DROP TABLE `purchase_cost_refunds`;--> statement-breakpoint
ALTER TABLE `__new_purchase_cost_refunds` RENAME TO `purchase_cost_refunds`;--> statement-breakpoint
CREATE TRIGGER `refund_payment_allocation_workspace_guard` BEFORE INSERT ON `purchase_refund_payment_allocations`
WHEN NOT EXISTS (
  SELECT 1 FROM `purchase_cost_refunds` r
  JOIN `purchase_cost_trackings` t ON t.id = r.tracking_id
  JOIN `financial_operations` o ON o.id = NEW.operation_id
  JOIN `workspace_members` m ON m.workspace_id = t.workspace_id AND m.user_id = NEW.person_id
  WHERE r.id = NEW.refund_id AND o.workspace_id = t.workspace_id
)
BEGIN SELECT RAISE(ABORT, 'refund allocation must match the refund workspace and member'); END;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `cost_refund_tracking_status_idx` ON `purchase_cost_refunds` (`tracking_id`,`status`);--> statement-breakpoint
CREATE INDEX `cost_refund_item_status_idx` ON `purchase_cost_refunds` (`cost_item_id`,`status`);--> statement-breakpoint
CREATE INDEX `cost_refund_requested_order_idx` ON `purchase_cost_refunds` (`tracking_id`,`requested_at`,`id`);
