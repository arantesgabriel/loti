CREATE TABLE `purchase_order_corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`tracking_id` text NOT NULL,
	`previous_order_id` text NOT NULL,
	`replacement_order_id` text NOT NULL,
	`operation_id` text NOT NULL,
	FOREIGN KEY (`tracking_id`) REFERENCES `purchase_cost_trackings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`previous_order_id`) REFERENCES `purchase_cost_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`replacement_order_id`) REFERENCES `purchase_cost_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `financial_operations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "order_correction_distinct" CHECK("purchase_order_corrections"."previous_order_id" != "purchase_order_corrections"."replacement_order_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_correction_previous_idx` ON `purchase_order_corrections` (`previous_order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `order_correction_replacement_idx` ON `purchase_order_corrections` (`replacement_order_id`);--> statement-breakpoint
CREATE INDEX `order_correction_tracking_idx` ON `purchase_order_corrections` (`tracking_id`);
--> statement-breakpoint
CREATE TRIGGER `order_corrections_no_update` BEFORE UPDATE ON `purchase_order_corrections` BEGIN SELECT RAISE(ABORT, 'order corrections are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `order_corrections_no_delete` BEFORE DELETE ON `purchase_order_corrections` BEGIN SELECT RAISE(ABORT, 'order corrections are append-only'); END;
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
