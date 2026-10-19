CREATE TABLE `purchase_cost_package_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tracking_id` text NOT NULL,
	`package_id` text NOT NULL,
	`event_order` integer NOT NULL,
	`event_type` text NOT NULL,
	`content_revision` integer NOT NULL,
	`actor_id` text NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tracking_id`) REFERENCES `purchase_cost_trackings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`package_id`) REFERENCES `purchase_packages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cost_package_event_type" CHECK("purchase_cost_package_events"."event_type" IN ('content_sealed','content_changed','content_unsealed')),
	CONSTRAINT "cost_package_event_order" CHECK(typeof("purchase_cost_package_events"."event_order") = 'integer' AND "purchase_cost_package_events"."event_order" >= 0),
	CONSTRAINT "cost_package_event_revision" CHECK(typeof("purchase_cost_package_events"."content_revision") = 'integer' AND "purchase_cost_package_events"."content_revision" >= 0),
	CONSTRAINT "cost_package_event_reason" CHECK(("purchase_cost_package_events"."event_type" = 'content_unsealed' AND length(trim("purchase_cost_package_events"."reason")) BETWEEN 1 AND 1000) OR ("purchase_cost_package_events"."event_type" != 'content_unsealed' AND "purchase_cost_package_events"."reason" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cost_package_event_order_idx` ON `purchase_cost_package_events` (`package_id`,`event_order`);--> statement-breakpoint
CREATE INDEX `cost_package_event_tracking_idx` ON `purchase_cost_package_events` (`tracking_id`,`package_id`,`event_order`);--> statement-breakpoint
CREATE TRIGGER `purchase_cost_package_events_no_update` BEFORE UPDATE ON `purchase_cost_package_events` BEGIN SELECT RAISE(ABORT, 'purchase_cost_package_events are immutable'); END;--> statement-breakpoint
CREATE TRIGGER `purchase_cost_package_events_no_delete` BEFORE DELETE ON `purchase_cost_package_events` BEGIN SELECT RAISE(ABORT, 'purchase_cost_package_events are immutable'); END;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_purchase_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`tracking_id` text NOT NULL,
	`name` text NOT NULL,
	`package_order` integer NOT NULL,
	`logistics_status` text DEFAULT 'preparing' NOT NULL,
	`account_id` text,
	`content_revision` integer DEFAULT 0 NOT NULL,
	`content_sealed_at` integer,
	`content_sealed_by` text,
	`content_seal_source` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tracking_id`) REFERENCES `purchase_cost_trackings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `hubbuy_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`content_sealed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cost_package_name" CHECK(length(trim("__new_purchase_packages"."name")) > 0),
	CONSTRAINT "cost_package_order" CHECK(typeof("__new_purchase_packages"."package_order") = 'integer' AND "__new_purchase_packages"."package_order" >= 0),
	CONSTRAINT "cost_package_logistics" CHECK("__new_purchase_packages"."logistics_status" IN ('preparing','sent','received')),
	CONSTRAINT "cost_package_content_revision" CHECK(typeof("__new_purchase_packages"."content_revision") = 'integer' AND "__new_purchase_packages"."content_revision" >= 0),
	CONSTRAINT "cost_package_content_seal" CHECK(("__new_purchase_packages"."content_seal_source" IS NULL AND "__new_purchase_packages"."content_sealed_at" IS NULL AND "__new_purchase_packages"."content_sealed_by" IS NULL) OR ("__new_purchase_packages"."content_seal_source" = 'legacy_locked' AND "__new_purchase_packages"."content_sealed_at" IS NULL AND "__new_purchase_packages"."content_sealed_by" IS NULL) OR ("__new_purchase_packages"."content_seal_source" = 'user' AND "__new_purchase_packages"."content_sealed_at" IS NOT NULL AND "__new_purchase_packages"."content_sealed_by" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_purchase_packages`("id", "tracking_id", "name", "package_order", "logistics_status", "account_id", "content_revision", "content_sealed_at", "content_sealed_by", "content_seal_source", "created_at", "updated_at") SELECT "id", "tracking_id", "name", "package_order", "logistics_status", "account_id", "content_revision", "content_sealed_at", "content_sealed_by", CASE WHEN "content_sealed_at" IS NOT NULL OR "content_sealed_by" IS NOT NULL THEN 'user' WHEN "logistics_status" IN ('sent','received') THEN 'legacy_locked' ELSE NULL END, "created_at", "updated_at" FROM `purchase_packages`;--> statement-breakpoint
DROP TABLE `purchase_packages`;--> statement-breakpoint
ALTER TABLE `__new_purchase_packages` RENAME TO `purchase_packages`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `cost_package_tracking_idx` ON `purchase_packages` (`tracking_id`,`package_order`);
