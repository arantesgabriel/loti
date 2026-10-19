DROP TRIGGER IF EXISTS `purchase_payment_allocation_capacity_guard`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `additional_order_item_recorded_no_update`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `additional_order_item_recorded_no_delete`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `additional_order_cost_recorded_no_update`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `additional_order_cost_recorded_no_delete`;
--> statement-breakpoint
CREATE TABLE `purchase_refund_payment_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`refund_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`payment_allocation_id` text,
	`cost_component` text NOT NULL,
	`source_type` text NOT NULL,
	`person_id` text NOT NULL,
	`allocation_order` integer NOT NULL,
	`cny_minor` integer NOT NULL,
	`principal_brl_cents` integer NOT NULL,
	`fee_brl_cents` integer NOT NULL,
	`historical_brl_cents` integer NOT NULL,
	FOREIGN KEY (`refund_id`) REFERENCES `purchase_cost_refunds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `financial_operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_allocation_id`) REFERENCES `purchase_payment_allocations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "refund_payment_allocation_order" CHECK(typeof("purchase_refund_payment_allocations"."allocation_order") = 'integer' AND "purchase_refund_payment_allocations"."allocation_order" >= 0),
	CONSTRAINT "refund_payment_allocation_cny" CHECK(typeof("purchase_refund_payment_allocations"."cny_minor") = 'integer' AND "purchase_refund_payment_allocations"."cny_minor" BETWEEN 0 AND 1000000000000),
	CONSTRAINT "refund_payment_allocation_brl" CHECK(typeof("purchase_refund_payment_allocations"."principal_brl_cents") = 'integer' AND "purchase_refund_payment_allocations"."principal_brl_cents" BETWEEN 0 AND 1000000000000 AND typeof("purchase_refund_payment_allocations"."fee_brl_cents") = 'integer' AND "purchase_refund_payment_allocations"."fee_brl_cents" BETWEEN 0 AND 1000000000000 AND typeof("purchase_refund_payment_allocations"."historical_brl_cents") = 'integer' AND "purchase_refund_payment_allocations"."historical_brl_cents" BETWEEN 0 AND 1000000000000),
	CONSTRAINT "refund_payment_allocation_origin" CHECK(("purchase_refund_payment_allocations"."source_type" = 'legacy_single' AND "purchase_refund_payment_allocations"."payment_allocation_id" IS NULL) OR ("purchase_refund_payment_allocations"."source_type" != 'legacy_single' AND "purchase_refund_payment_allocations"."payment_allocation_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refund_payment_allocation_order_idx` ON `purchase_refund_payment_allocations` (`refund_id`,`operation_id`,`allocation_order`);--> statement-breakpoint
CREATE INDEX `refund_payment_allocation_source_idx` ON `purchase_refund_payment_allocations` (`payment_allocation_id`,`cost_component`);--> statement-breakpoint
CREATE INDEX `refund_payment_allocation_operation_idx` ON `purchase_refund_payment_allocations` (`operation_id`,`refund_id`);--> statement-breakpoint
CREATE INDEX `refund_payment_allocation_person_idx` ON `purchase_refund_payment_allocations` (`refund_id`,`person_id`,`cost_component`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_purchase_cost_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`tracking_id` text NOT NULL,
	`kind` text NOT NULL,
	`account_id` text,
	`external_reference` text,
	`state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	`occurred_at` integer,
	`recorded_at` integer,
	`operation_id` text,
	FOREIGN KEY (`tracking_id`) REFERENCES `purchase_cost_trackings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `hubbuy_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `financial_operations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cost_order_kind" CHECK("__new_purchase_cost_orders"."kind" IN ('original','additional')),
	CONSTRAINT "cost_order_state" CHECK(("__new_purchase_cost_orders"."kind" = 'original' AND "__new_purchase_cost_orders"."state" = 'recorded') OR ("__new_purchase_cost_orders"."kind" = 'additional' AND "__new_purchase_cost_orders"."state" IN ('draft','recorded','voided'))),
	CONSTRAINT "cost_order_revision" CHECK(typeof("__new_purchase_cost_orders"."revision") = 'integer' AND "__new_purchase_cost_orders"."revision" >= 0),
	CONSTRAINT "cost_order_external_reference" CHECK("__new_purchase_cost_orders"."external_reference" IS NULL OR length(trim("__new_purchase_cost_orders"."external_reference")) BETWEEN 1 AND 200),
	CONSTRAINT "cost_order_recorded" CHECK(("__new_purchase_cost_orders"."state" = 'recorded' AND ("__new_purchase_cost_orders"."recorded_at" IS NOT NULL OR ("__new_purchase_cost_orders"."kind" = 'original' AND "__new_purchase_cost_orders"."account_id" IS NULL AND "__new_purchase_cost_orders"."operation_id" IS NULL))) OR ("__new_purchase_cost_orders"."state" != 'recorded' AND "__new_purchase_cost_orders"."recorded_at" IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_purchase_cost_orders`("id", "tracking_id", "kind", "account_id", "external_reference", "state", "revision", "created_by", "created_at", "updated_by", "updated_at", "occurred_at", "recorded_at", "operation_id") SELECT "id", "tracking_id", "kind", "account_id", "external_reference", "state", "revision", "created_by", "created_at", "updated_by", "updated_at", "occurred_at", "recorded_at", "operation_id" FROM `purchase_cost_orders`;--> statement-breakpoint
DROP TABLE `purchase_cost_orders`;--> statement-breakpoint
ALTER TABLE `__new_purchase_cost_orders` RENAME TO `purchase_cost_orders`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `cost_order_original_idx` ON `purchase_cost_orders` (`tracking_id`) WHERE "purchase_cost_orders"."kind" = 'original';--> statement-breakpoint
CREATE UNIQUE INDEX `cost_order_external_reference_idx` ON `purchase_cost_orders` (`account_id`,`external_reference`) WHERE "purchase_cost_orders"."external_reference" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `cost_order_tracking_idx` ON `purchase_cost_orders` (`tracking_id`,`state`,`created_at`);--> statement-breakpoint
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
	`reason` text NOT NULL,
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
	CONSTRAINT "cost_refund_fee_snapshot" CHECK(("__new_purchase_cost_refunds"."original_payment_method" IS NULL AND "__new_purchase_cost_refunds"."original_fee_bps" IS NULL) OR ("__new_purchase_cost_refunds"."original_payment_method" IN ('pix','card') AND typeof("__new_purchase_cost_refunds"."original_fee_bps") = 'integer' AND "__new_purchase_cost_refunds"."original_fee_bps" BETWEEN 0 AND 10000)),
	CONSTRAINT "cost_refund_reason" CHECK(length(trim("__new_purchase_cost_refunds"."reason")) BETWEEN 1 AND 1000)
);
--> statement-breakpoint
INSERT INTO `__new_purchase_cost_refunds`("id", "tracking_id", "cost_item_id", "status", "quantity", "requested_product_cents", "requested_china_cents", "received_product_cents", "received_china_cents", "refund_destination", "hubbuy_account_id", "received_product_cny_minor", "received_china_cny_minor", "native_evidence", "credit_operation_id", "reason", "original_item_quantity", "original_product_unit_cents", "original_china_unit_cents", "original_charge_base_cents", "original_charge_fee_cents", "original_item_fee_cents", "original_payment_method", "original_fee_bps", "original_paid_at", "original_paid_by", "requested_at", "requested_by", "received_at", "received_by", "voided_at", "voided_by", "void_reason", "created_at", "updated_at", "updated_by") SELECT "id", "tracking_id", "cost_item_id", "status", "quantity", "requested_product_cents", "requested_china_cents", "received_product_cents", "received_china_cents", NULL, NULL, NULL, NULL, NULL, NULL, "reason", "original_item_quantity", "original_product_unit_cents", "original_china_unit_cents", "original_charge_base_cents", "original_charge_fee_cents", "original_item_fee_cents", "original_payment_method", "original_fee_bps", "original_paid_at", "original_paid_by", "requested_at", "requested_by", "received_at", "received_by", "voided_at", "voided_by", "void_reason", "created_at", "updated_at", "updated_by" FROM `purchase_cost_refunds`;--> statement-breakpoint
DROP TABLE `purchase_cost_refunds`;--> statement-breakpoint
ALTER TABLE `__new_purchase_cost_refunds` RENAME TO `purchase_cost_refunds`;--> statement-breakpoint
CREATE INDEX `cost_refund_tracking_status_idx` ON `purchase_cost_refunds` (`tracking_id`,`status`);--> statement-breakpoint
CREATE INDEX `cost_refund_item_status_idx` ON `purchase_cost_refunds` (`cost_item_id`,`status`);--> statement-breakpoint
CREATE INDEX `cost_refund_requested_order_idx` ON `purchase_cost_refunds` (`tracking_id`,`requested_at`,`id`);
--> statement-breakpoint
CREATE TRIGGER `purchase_cost_order_recorded_no_update` BEFORE UPDATE ON `purchase_cost_orders`
WHEN OLD.state = 'recorded' AND (NEW.tracking_id IS NOT OLD.tracking_id OR NEW.kind IS NOT OLD.kind OR NEW.account_id IS NOT OLD.account_id OR NEW.external_reference IS NOT OLD.external_reference OR NEW.state IS NOT OLD.state OR NEW.occurred_at IS NOT OLD.occurred_at OR NEW.recorded_at IS NOT OLD.recorded_at OR NEW.operation_id IS NOT OLD.operation_id OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at)
BEGIN SELECT RAISE(ABORT, 'recorded purchase orders are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_cost_order_recorded_no_delete` BEFORE DELETE ON `purchase_cost_orders` WHEN OLD.state = 'recorded' BEGIN SELECT RAISE(ABORT, 'recorded purchase orders are immutable'); END;
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
CREATE TRIGGER `refund_payment_allocations_no_update` BEFORE UPDATE ON `purchase_refund_payment_allocations` BEGIN SELECT RAISE(ABORT, 'refund allocations are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `refund_payment_allocations_no_delete` BEFORE DELETE ON `purchase_refund_payment_allocations` BEGIN SELECT RAISE(ABORT, 'refund allocations are append-only'); END;
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
CREATE TRIGGER `additional_order_item_recorded_no_update` BEFORE UPDATE ON `purchase_additional_order_items`
WHEN EXISTS (SELECT 1 FROM `purchase_cost_orders` o WHERE o.id = OLD.order_id AND o.state != 'draft')
BEGIN SELECT RAISE(ABORT, 'recorded order item snapshots are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `additional_order_item_recorded_no_delete` BEFORE DELETE ON `purchase_additional_order_items`
WHEN EXISTS (SELECT 1 FROM `purchase_cost_orders` o WHERE o.id = OLD.order_id AND o.state != 'draft')
BEGIN SELECT RAISE(ABORT, 'recorded order item snapshots are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `additional_order_cost_recorded_no_update` BEFORE UPDATE ON `purchase_item_costs`
WHEN EXISTS (SELECT 1 FROM `purchase_cost_orders` o WHERE o.id = OLD.order_id AND o.kind = 'additional' AND o.state != 'draft')
BEGIN SELECT RAISE(ABORT, 'recorded order costs are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `additional_order_cost_recorded_no_delete` BEFORE DELETE ON `purchase_item_costs`
WHEN EXISTS (SELECT 1 FROM `purchase_cost_orders` o WHERE o.id = OLD.order_id AND o.kind = 'additional' AND o.state != 'draft')
BEGIN SELECT RAISE(ABORT, 'recorded order costs are immutable'); END;
