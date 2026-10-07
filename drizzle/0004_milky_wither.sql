CREATE TABLE `purchase_cost_charges` (
	`id` text PRIMARY KEY NOT NULL,
	`tracking_id` text NOT NULL,
	`package_id` text,
	`charge_type` text NOT NULL,
	`value_state` text,
	`amount_cents` integer,
	`payment_method` text,
	`fee_bps` integer,
	`payment_status` text DEFAULT 'pending' NOT NULL,
	`paid_by` text,
	`paid_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tracking_id`) REFERENCES `purchase_cost_trackings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`package_id`) REFERENCES `purchase_packages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`paid_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cost_charge_package_scope" CHECK(("purchase_cost_charges"."charge_type" = 'products' AND "purchase_cost_charges"."package_id" IS NULL AND "purchase_cost_charges"."value_state" IS NULL AND "purchase_cost_charges"."amount_cents" IS NULL) OR ("purchase_cost_charges"."charge_type" IN ('brazil_freight','customs') AND "purchase_cost_charges"."package_id" IS NOT NULL)),
	CONSTRAINT "cost_charge_value_state" CHECK("purchase_cost_charges"."charge_type" = 'products' OR ("purchase_cost_charges"."value_state" = 'known' AND typeof("purchase_cost_charges"."amount_cents") = 'integer' AND "purchase_cost_charges"."amount_cents" BETWEEN 0 AND 1000000000000) OR ("purchase_cost_charges"."value_state" IN ('pending','no_charge') AND "purchase_cost_charges"."amount_cents" IS NULL)),
	CONSTRAINT "cost_charge_fee" CHECK(("purchase_cost_charges"."fee_bps" IS NULL AND "purchase_cost_charges"."payment_method" IS NULL) OR (typeof("purchase_cost_charges"."fee_bps") = 'integer' AND "purchase_cost_charges"."fee_bps" BETWEEN 0 AND 10000 AND "purchase_cost_charges"."payment_method" IN ('pix','card'))),
	CONSTRAINT "cost_charge_customs_fee" CHECK("purchase_cost_charges"."charge_type" != 'customs' OR ("purchase_cost_charges"."fee_bps" IS NULL AND "purchase_cost_charges"."payment_method" IS NULL)),
	CONSTRAINT "cost_charge_paid" CHECK(("purchase_cost_charges"."payment_status" = 'pending' AND "purchase_cost_charges"."paid_at" IS NULL AND "purchase_cost_charges"."paid_by" IS NULL) OR ("purchase_cost_charges"."payment_status" = 'paid' AND "purchase_cost_charges"."paid_at" IS NOT NULL AND "purchase_cost_charges"."paid_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cost_charge_products_idx` ON `purchase_cost_charges` (`tracking_id`) WHERE "purchase_cost_charges"."charge_type" = 'products';--> statement-breakpoint
CREATE UNIQUE INDEX `cost_charge_package_type_idx` ON `purchase_cost_charges` (`package_id`,`charge_type`) WHERE "purchase_cost_charges"."charge_type" IN ('brazil_freight','customs');--> statement-breakpoint
CREATE INDEX `cost_charge_tracking_idx` ON `purchase_cost_charges` (`tracking_id`,`charge_type`);--> statement-breakpoint
CREATE TABLE `purchase_cost_participants` (
	`cost_item_id` text NOT NULL,
	`person_id` text NOT NULL,
	`allocation_order` integer NOT NULL,
	`weight_mode` text NOT NULL,
	`weight` integer NOT NULL,
	PRIMARY KEY(`cost_item_id`, `person_id`),
	FOREIGN KEY (`cost_item_id`) REFERENCES `purchase_item_costs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cost_participant_order" CHECK(typeof("purchase_cost_participants"."allocation_order") = 'integer' AND "purchase_cost_participants"."allocation_order" >= 0),
	CONSTRAINT "cost_participant_weight" CHECK(typeof("purchase_cost_participants"."weight") = 'integer' AND "purchase_cost_participants"."weight" BETWEEN 0 AND 1000000000000),
	CONSTRAINT "cost_participant_weight_mode" CHECK("purchase_cost_participants"."weight_mode" IN ('equal','percentage','fixed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cost_participant_order_idx` ON `purchase_cost_participants` (`cost_item_id`,`allocation_order`);--> statement-breakpoint
CREATE INDEX `cost_participant_person_idx` ON `purchase_cost_participants` (`person_id`);--> statement-breakpoint
CREATE TABLE `purchase_cost_reopenings` (
	`id` text PRIMARY KEY NOT NULL,
	`tracking_id` text NOT NULL,
	`reopened_by` text NOT NULL,
	`reopened_at` integer NOT NULL,
	`reason` text NOT NULL,
	FOREIGN KEY (`tracking_id`) REFERENCES `purchase_cost_trackings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reopened_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cost_reopening_reason" CHECK(length(trim("purchase_cost_reopenings"."reason")) > 0)
);
--> statement-breakpoint
CREATE INDEX `cost_reopening_tracking_idx` ON `purchase_cost_reopenings` (`tracking_id`,`reopened_at`);--> statement-breakpoint
CREATE TABLE `purchase_cost_trackings` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	`closed_by` text,
	`closed_at` integer,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`closed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cost_tracking_state" CHECK(("purchase_cost_trackings"."status" = 'open' AND "purchase_cost_trackings"."closed_at" IS NULL AND "purchase_cost_trackings"."closed_by" IS NULL) OR ("purchase_cost_trackings"."status" = 'closed' AND "purchase_cost_trackings"."closed_at" IS NOT NULL AND "purchase_cost_trackings"."closed_by" IS NOT NULL)),
	CONSTRAINT "cost_tracking_revision" CHECK(typeof("purchase_cost_trackings"."revision") = 'integer' AND "purchase_cost_trackings"."revision" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cost_tracking_purchase_idx` ON `purchase_cost_trackings` (`purchase_id`);--> statement-breakpoint
CREATE INDEX `cost_tracking_workspace_idx` ON `purchase_cost_trackings` (`workspace_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `purchase_item_costs` (
	`id` text PRIMARY KEY NOT NULL,
	`tracking_id` text NOT NULL,
	`purchase_item_id` text NOT NULL,
	`item_order` integer NOT NULL,
	`effective_price_state` text NOT NULL,
	`effective_price_unit_cents` integer,
	`china_freight_state` text DEFAULT 'pending' NOT NULL,
	`china_freight_unit_cents` integer,
	FOREIGN KEY (`tracking_id`) REFERENCES `purchase_cost_trackings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_item_id`) REFERENCES `purchase_items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cost_item_order" CHECK(typeof("purchase_item_costs"."item_order") = 'integer' AND "purchase_item_costs"."item_order" >= 0),
	CONSTRAINT "cost_item_effective_price_state" CHECK(("purchase_item_costs"."effective_price_state" = 'known' AND typeof("purchase_item_costs"."effective_price_unit_cents") = 'integer' AND "purchase_item_costs"."effective_price_unit_cents" BETWEEN 0 AND 1000000000000) OR ("purchase_item_costs"."effective_price_state" IN ('pending','no_charge') AND "purchase_item_costs"."effective_price_unit_cents" IS NULL)),
	CONSTRAINT "cost_item_china_freight_state" CHECK(("purchase_item_costs"."china_freight_state" = 'known' AND typeof("purchase_item_costs"."china_freight_unit_cents") = 'integer' AND "purchase_item_costs"."china_freight_unit_cents" BETWEEN 0 AND 1000000000000) OR ("purchase_item_costs"."china_freight_state" IN ('pending','no_charge') AND "purchase_item_costs"."china_freight_unit_cents" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cost_item_tracking_item_idx` ON `purchase_item_costs` (`tracking_id`,`purchase_item_id`);--> statement-breakpoint
CREATE INDEX `cost_item_tracking_order_idx` ON `purchase_item_costs` (`tracking_id`,`item_order`);--> statement-breakpoint
CREATE TABLE `purchase_package_items` (
	`package_id` text NOT NULL,
	`cost_item_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`allocation_order` integer NOT NULL,
	PRIMARY KEY(`package_id`, `cost_item_id`),
	FOREIGN KEY (`package_id`) REFERENCES `purchase_packages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cost_item_id`) REFERENCES `purchase_item_costs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "package_item_quantity" CHECK(typeof("purchase_package_items"."quantity") = 'integer' AND "purchase_package_items"."quantity" >= 1),
	CONSTRAINT "package_item_order" CHECK(typeof("purchase_package_items"."allocation_order") = 'integer' AND "purchase_package_items"."allocation_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `package_item_order_idx` ON `purchase_package_items` (`package_id`,`allocation_order`);--> statement-breakpoint
CREATE INDEX `package_item_cost_item_idx` ON `purchase_package_items` (`cost_item_id`);--> statement-breakpoint
CREATE TABLE `purchase_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`tracking_id` text NOT NULL,
	`name` text NOT NULL,
	`package_order` integer NOT NULL,
	`logistics_status` text DEFAULT 'preparing' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tracking_id`) REFERENCES `purchase_cost_trackings`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cost_package_name" CHECK(length(trim("purchase_packages"."name")) > 0),
	CONSTRAINT "cost_package_order" CHECK(typeof("purchase_packages"."package_order") = 'integer' AND "purchase_packages"."package_order" >= 0),
	CONSTRAINT "cost_package_logistics" CHECK("purchase_packages"."logistics_status" IN ('preparing','sent','received'))
);
--> statement-breakpoint
CREATE INDEX `cost_package_tracking_idx` ON `purchase_packages` (`tracking_id`,`package_order`);--> statement-breakpoint
CREATE TABLE `workspace_cost_settings` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`pix_bps` integer DEFAULT 100 NOT NULL,
	`card_bps` integer DEFAULT 500 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cost_settings_pix_bps" CHECK(typeof("workspace_cost_settings"."pix_bps") = 'integer' AND "workspace_cost_settings"."pix_bps" BETWEEN 0 AND 10000),
	CONSTRAINT "cost_settings_card_bps" CHECK(typeof("workspace_cost_settings"."card_bps") = 'integer' AND "workspace_cost_settings"."card_bps" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_purchase_item_participants` (
	`purchase_item_id` text NOT NULL,
	`person_id` text NOT NULL,
	`allocation_order` integer NOT NULL,
	`percentage_bps` integer,
	`amount_cents` integer,
	PRIMARY KEY(`purchase_item_id`, `person_id`),
	FOREIGN KEY (`purchase_item_id`) REFERENCES `purchase_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "item_participant_order" CHECK(typeof("__new_purchase_item_participants"."allocation_order") = 'integer' AND "__new_purchase_item_participants"."allocation_order" >= 0),
	CONSTRAINT "item_participant_percentage" CHECK("__new_purchase_item_participants"."percentage_bps" IS NULL OR (typeof("__new_purchase_item_participants"."percentage_bps") = 'integer' AND "__new_purchase_item_participants"."percentage_bps" BETWEEN 0 AND 10000)),
	CONSTRAINT "item_participant_amount" CHECK("__new_purchase_item_participants"."amount_cents" IS NULL OR (typeof("__new_purchase_item_participants"."amount_cents") = 'integer' AND "__new_purchase_item_participants"."amount_cents" BETWEEN 0 AND 1000000000000)),
	CONSTRAINT "item_participant_one_value" CHECK("__new_purchase_item_participants"."percentage_bps" IS NULL OR "__new_purchase_item_participants"."amount_cents" IS NULL)
);
--> statement-breakpoint
INSERT INTO `__new_purchase_item_participants`("purchase_item_id", "person_id", "allocation_order", "percentage_bps", "amount_cents") SELECT "purchase_item_id", "person_id", "allocation_order", "percentage_bps", "amount_cents" FROM `purchase_item_participants`;--> statement-breakpoint
DROP TABLE `purchase_item_participants`;--> statement-breakpoint
ALTER TABLE `__new_purchase_item_participants` RENAME TO `purchase_item_participants`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `item_participant_order_idx` ON `purchase_item_participants` (`purchase_item_id`,`allocation_order`);--> statement-breakpoint
CREATE INDEX `item_participant_person_idx` ON `purchase_item_participants` (`person_id`);