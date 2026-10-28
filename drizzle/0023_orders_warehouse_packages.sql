CREATE TABLE `logistics_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`key` text NOT NULL,
	`payload` text NOT NULL,
	`result_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `logistics_command_key_idx` ON `logistics_commands` (`workspace_id`,`key`);--> statement-breakpoint
CREATE TABLE `logistics_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`action` text NOT NULL,
	`reason` text NOT NULL,
	`before` text,
	`after` text,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `logistics_manifests` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`revision` integer NOT NULL,
	`snapshot` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `logistics_packages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `logistics_manifest_revision_idx` ON `logistics_manifests` (`package_id`,`revision`);--> statement-breakpoint
CREATE TABLE `logistics_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`account_id` text,
	`legacy_package_id` text,
	`name` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`review_state` text NOT NULL,
	`stage` text DEFAULT 'preparing' NOT NULL,
	`content_closed_at` integer,
	`freight_cents` integer,
	`freight_fee_cents` integer,
	`freight_paid_at` integer,
	`customs_cents` integer,
	`customs_paid_at` integer,
	`weight_grams` integer,
	`dispatched_at` integer,
	`received_at` integer,
	`financial_closed_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `hubbuy_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`legacy_package_id`) REFERENCES `purchase_packages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "logistics_stage" CHECK("logistics_packages"."stage" IN ('preparing','sent','received')),
	CONSTRAINT "logistics_review" CHECK("logistics_packages"."review_state" IN ('pending_review','confirmed')),
	CONSTRAINT "logistics_weight" CHECK("logistics_packages"."weight_grams" IS NULL OR (typeof("logistics_packages"."weight_grams") = 'integer' AND "logistics_packages"."weight_grams" BETWEEN 1 AND 1000000000)),
	CONSTRAINT "logistics_money" CHECK(("logistics_packages"."freight_cents" IS NULL OR "logistics_packages"."freight_cents" >= 0) AND ("logistics_packages"."freight_fee_cents" IS NULL OR "logistics_packages"."freight_fee_cents" >= 0) AND ("logistics_packages"."customs_cents" IS NULL OR "logistics_packages"."customs_cents" >= 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `logistics_packages_legacy_package_id_unique` ON `logistics_packages` (`legacy_package_id`);--> statement-breakpoint
CREATE TABLE `logistics_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`cost_item_id` text NOT NULL,
	`unit_index` integer NOT NULL,
	`released_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `logistics_packages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cost_item_id`) REFERENCES `purchase_item_costs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "logistics_unit_index" CHECK("logistics_reservations"."unit_index" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `logistics_active_unit_idx` ON `logistics_reservations` (`cost_item_id`,`unit_index`) WHERE "logistics_reservations"."released_at" IS NULL;--> statement-breakpoint
CREATE TABLE `order_warehouse_positions` (
	`cost_item_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`account_id` text,
	`review_state` text NOT NULL,
	`received_units` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`cost_item_id`) REFERENCES `purchase_item_costs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `hubbuy_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "warehouse_review" CHECK("order_warehouse_positions"."review_state" IN ('pending_review','confirmed')),
	CONSTRAINT "warehouse_revision" CHECK("order_warehouse_positions"."revision" >= 0)
);
