PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_purchase_refund_payment_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`refund_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`payment_allocation_id` text,
	`balance_consumption_id` text,
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
	FOREIGN KEY (`balance_consumption_id`) REFERENCES `hubbuy_balance_consumptions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "refund_payment_allocation_order" CHECK(typeof("__new_purchase_refund_payment_allocations"."allocation_order") = 'integer' AND "__new_purchase_refund_payment_allocations"."allocation_order" >= 0),
	CONSTRAINT "refund_payment_allocation_cny" CHECK(typeof("__new_purchase_refund_payment_allocations"."cny_minor") = 'integer' AND "__new_purchase_refund_payment_allocations"."cny_minor" BETWEEN 0 AND 1000000000000),
	CONSTRAINT "refund_payment_allocation_brl" CHECK(typeof("__new_purchase_refund_payment_allocations"."principal_brl_cents") = 'integer' AND "__new_purchase_refund_payment_allocations"."principal_brl_cents" BETWEEN 0 AND 1000000000000 AND typeof("__new_purchase_refund_payment_allocations"."fee_brl_cents") = 'integer' AND "__new_purchase_refund_payment_allocations"."fee_brl_cents" BETWEEN 0 AND 1000000000000 AND typeof("__new_purchase_refund_payment_allocations"."historical_brl_cents") = 'integer' AND "__new_purchase_refund_payment_allocations"."historical_brl_cents" BETWEEN 0 AND 1000000000000),
	CONSTRAINT "refund_payment_allocation_origin" CHECK(("__new_purchase_refund_payment_allocations"."source_type" = 'legacy_single' AND "__new_purchase_refund_payment_allocations"."payment_allocation_id" IS NULL) OR ("__new_purchase_refund_payment_allocations"."source_type" != 'legacy_single' AND "__new_purchase_refund_payment_allocations"."payment_allocation_id" IS NOT NULL)),
	CONSTRAINT "refund_payment_allocation_consumption" CHECK("__new_purchase_refund_payment_allocations"."balance_consumption_id" IS NULL OR ("__new_purchase_refund_payment_allocations"."source_type" = 'balance' AND "__new_purchase_refund_payment_allocations"."payment_allocation_id" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_purchase_refund_payment_allocations`("id", "refund_id", "operation_id", "payment_allocation_id", "balance_consumption_id", "cost_component", "source_type", "person_id", "allocation_order", "cny_minor", "principal_brl_cents", "fee_brl_cents", "historical_brl_cents") SELECT "id", "refund_id", "operation_id", "payment_allocation_id", NULL, "cost_component", "source_type", "person_id", "allocation_order", "cny_minor", "principal_brl_cents", "fee_brl_cents", "historical_brl_cents" FROM `purchase_refund_payment_allocations`;--> statement-breakpoint
DROP TABLE `purchase_refund_payment_allocations`;--> statement-breakpoint
ALTER TABLE `__new_purchase_refund_payment_allocations` RENAME TO `purchase_refund_payment_allocations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `refund_payment_allocation_order_idx` ON `purchase_refund_payment_allocations` (`refund_id`,`operation_id`,`allocation_order`);--> statement-breakpoint
CREATE INDEX `refund_payment_allocation_source_idx` ON `purchase_refund_payment_allocations` (`payment_allocation_id`,`cost_component`);--> statement-breakpoint
CREATE INDEX `refund_payment_allocation_operation_idx` ON `purchase_refund_payment_allocations` (`operation_id`,`refund_id`);--> statement-breakpoint
CREATE INDEX `refund_payment_allocation_person_idx` ON `purchase_refund_payment_allocations` (`refund_id`,`person_id`,`cost_component`);--> statement-breakpoint
CREATE TRIGGER `refund_payment_allocation_workspace_guard` BEFORE INSERT ON `purchase_refund_payment_allocations`
WHEN NOT EXISTS (
  SELECT 1 FROM `purchase_cost_refunds` r
  JOIN `purchase_cost_trackings` t ON t.id = r.tracking_id
  JOIN `financial_operations` o ON o.id = NEW.operation_id
  JOIN `workspace_members` m ON m.workspace_id = t.workspace_id AND m.user_id = NEW.person_id
  WHERE r.id = NEW.refund_id AND o.workspace_id = t.workspace_id
)
BEGIN SELECT RAISE(ABORT, 'refund allocation must match the refund workspace and member'); END;--> statement-breakpoint
CREATE TRIGGER `refund_payment_allocations_no_update` BEFORE UPDATE ON `purchase_refund_payment_allocations` BEGIN SELECT RAISE(ABORT, 'refund allocations are append-only'); END;--> statement-breakpoint
CREATE TRIGGER `refund_payment_allocations_no_delete` BEFORE DELETE ON `purchase_refund_payment_allocations` BEGIN SELECT RAISE(ABORT, 'refund allocations are append-only'); END;
