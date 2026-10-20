CREATE TABLE `purchase_cost_refund_events` (
	`id` text PRIMARY KEY NOT NULL,
	`refund_id` text NOT NULL,
	`event_order` integer NOT NULL,
	`event_type` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`reason` text,
	`details_json` text NOT NULL,
	FOREIGN KEY (`refund_id`) REFERENCES `purchase_cost_refunds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cost_refund_event_order" CHECK(typeof("purchase_cost_refund_events"."event_order") = 'integer' AND "purchase_cost_refund_events"."event_order" >= 0),
	CONSTRAINT "cost_refund_event_type" CHECK("purchase_cost_refund_events"."event_type" IN ('requested','request_updated','received','receipt_corrected','voided')),
	CONSTRAINT "cost_refund_event_json" CHECK(json_valid("purchase_cost_refund_events"."details_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cost_refund_event_order_idx` ON `purchase_cost_refund_events` (`refund_id`,`event_order`);--> statement-breakpoint
CREATE INDEX `cost_refund_event_refund_idx` ON `purchase_cost_refund_events` (`refund_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `purchase_cost_refund_participants` (
	`refund_id` text NOT NULL,
	`person_id` text NOT NULL,
	`allocation_order` integer NOT NULL,
	`weight_mode` text NOT NULL,
	`weight` integer NOT NULL,
	`original_product_share_cents` integer NOT NULL,
	`original_china_share_cents` integer NOT NULL,
	`original_product_fee_share_cents` integer NOT NULL,
	PRIMARY KEY(`refund_id`, `person_id`),
	FOREIGN KEY (`refund_id`) REFERENCES `purchase_cost_refunds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cost_refund_participant_order" CHECK(typeof("purchase_cost_refund_participants"."allocation_order") = 'integer' AND "purchase_cost_refund_participants"."allocation_order" >= 0),
	CONSTRAINT "cost_refund_participant_weight" CHECK(typeof("purchase_cost_refund_participants"."weight") = 'integer' AND "purchase_cost_refund_participants"."weight" BETWEEN 0 AND 1000000000000),
	CONSTRAINT "cost_refund_participant_mode" CHECK("purchase_cost_refund_participants"."weight_mode" IN ('equal','percentage','fixed')),
	CONSTRAINT "cost_refund_participant_shares" CHECK(typeof("purchase_cost_refund_participants"."original_product_share_cents") = 'integer' AND "purchase_cost_refund_participants"."original_product_share_cents" BETWEEN 0 AND 1000000000000 AND typeof("purchase_cost_refund_participants"."original_china_share_cents") = 'integer' AND "purchase_cost_refund_participants"."original_china_share_cents" BETWEEN 0 AND 1000000000000 AND typeof("purchase_cost_refund_participants"."original_product_fee_share_cents") = 'integer' AND "purchase_cost_refund_participants"."original_product_fee_share_cents" BETWEEN 0 AND 1000000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cost_refund_participant_order_idx` ON `purchase_cost_refund_participants` (`refund_id`,`allocation_order`);--> statement-breakpoint
CREATE TABLE `purchase_cost_refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`tracking_id` text NOT NULL,
	`cost_item_id` text NOT NULL,
	`status` text NOT NULL,
	`quantity` integer NOT NULL,
	`requested_product_cents` integer NOT NULL,
	`requested_china_cents` integer NOT NULL,
	`received_product_cents` integer,
	`received_china_cents` integer,
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
	FOREIGN KEY (`original_paid_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`received_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voided_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cost_refund_status" CHECK("purchase_cost_refunds"."status" IN ('requested','received','voided')),
	CONSTRAINT "cost_refund_quantity" CHECK(typeof("purchase_cost_refunds"."quantity") = 'integer' AND "purchase_cost_refunds"."quantity" BETWEEN 1 AND 10000),
	CONSTRAINT "cost_refund_requested_amounts" CHECK(typeof("purchase_cost_refunds"."requested_product_cents") = 'integer' AND "purchase_cost_refunds"."requested_product_cents" BETWEEN 0 AND 1000000000000 AND typeof("purchase_cost_refunds"."requested_china_cents") = 'integer' AND "purchase_cost_refunds"."requested_china_cents" BETWEEN 0 AND 1000000000000 AND "purchase_cost_refunds"."requested_product_cents" + "purchase_cost_refunds"."requested_china_cents" > 0),
	CONSTRAINT "cost_refund_received_state" CHECK(("purchase_cost_refunds"."status" = 'requested' AND "purchase_cost_refunds"."received_product_cents" IS NULL AND "purchase_cost_refunds"."received_china_cents" IS NULL AND "purchase_cost_refunds"."received_at" IS NULL AND "purchase_cost_refunds"."received_by" IS NULL) OR ("purchase_cost_refunds"."status" IN ('received','voided') AND (("purchase_cost_refunds"."received_product_cents" IS NULL AND "purchase_cost_refunds"."received_china_cents" IS NULL AND "purchase_cost_refunds"."received_at" IS NULL AND "purchase_cost_refunds"."received_by" IS NULL) OR (typeof("purchase_cost_refunds"."received_product_cents") = 'integer' AND "purchase_cost_refunds"."received_product_cents" BETWEEN 0 AND 1000000000000 AND typeof("purchase_cost_refunds"."received_china_cents") = 'integer' AND "purchase_cost_refunds"."received_china_cents" BETWEEN 0 AND 1000000000000 AND "purchase_cost_refunds"."received_at" IS NOT NULL AND "purchase_cost_refunds"."received_by" IS NOT NULL)))),
	CONSTRAINT "cost_refund_void_state" CHECK(("purchase_cost_refunds"."status" = 'voided' AND "purchase_cost_refunds"."voided_at" IS NOT NULL AND "purchase_cost_refunds"."voided_by" IS NOT NULL AND length(trim("purchase_cost_refunds"."void_reason")) > 0) OR ("purchase_cost_refunds"."status" != 'voided' AND "purchase_cost_refunds"."voided_at" IS NULL AND "purchase_cost_refunds"."voided_by" IS NULL AND "purchase_cost_refunds"."void_reason" IS NULL)),
	CONSTRAINT "cost_refund_original_values" CHECK(typeof("purchase_cost_refunds"."original_item_quantity") = 'integer' AND "purchase_cost_refunds"."original_item_quantity" BETWEEN 1 AND 10000 AND typeof("purchase_cost_refunds"."original_product_unit_cents") = 'integer' AND "purchase_cost_refunds"."original_product_unit_cents" BETWEEN 0 AND 1000000000000 AND typeof("purchase_cost_refunds"."original_china_unit_cents") = 'integer' AND "purchase_cost_refunds"."original_china_unit_cents" BETWEEN 0 AND 1000000000000),
	CONSTRAINT "cost_refund_fee_snapshot" CHECK(("purchase_cost_refunds"."original_payment_method" IS NULL AND "purchase_cost_refunds"."original_fee_bps" IS NULL) OR ("purchase_cost_refunds"."original_payment_method" IN ('pix','card') AND typeof("purchase_cost_refunds"."original_fee_bps") = 'integer' AND "purchase_cost_refunds"."original_fee_bps" BETWEEN 0 AND 10000)),
	CONSTRAINT "cost_refund_reason" CHECK(length(trim("purchase_cost_refunds"."reason")) BETWEEN 1 AND 1000)
);
--> statement-breakpoint
CREATE INDEX `cost_refund_tracking_status_idx` ON `purchase_cost_refunds` (`tracking_id`,`status`);--> statement-breakpoint
CREATE INDEX `cost_refund_item_status_idx` ON `purchase_cost_refunds` (`cost_item_id`,`status`);--> statement-breakpoint
CREATE INDEX `cost_refund_requested_order_idx` ON `purchase_cost_refunds` (`tracking_id`,`requested_at`,`id`);