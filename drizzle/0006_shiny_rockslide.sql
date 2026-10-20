CREATE TABLE `hubbuy_external_items` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`purchase_id` text NOT NULL,
	`purchase_item_id` text,
	`order_goods_id` text,
	`order_goods_no` text,
	`order_no` text,
	`offer_id` text,
	`channel` text,
	`offer_url` text,
	`sku_info` text,
	`title` text,
	`quantity` integer,
	`revision` integer DEFAULT 0 NOT NULL,
	`confirmed_by` text,
	`confirmed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_item_id`) REFERENCES `purchase_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`confirmed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "qc_external_revision" CHECK(typeof("hubbuy_external_items"."revision") = 'integer' AND "hubbuy_external_items"."revision" >= 0),
	CONSTRAINT "qc_external_quantity" CHECK("hubbuy_external_items"."quantity" IS NULL OR (typeof("hubbuy_external_items"."quantity") = 'integer' AND "hubbuy_external_items"."quantity" BETWEEN 0 AND 10000))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qc_external_purchase_order_goods_idx` ON `hubbuy_external_items` (`purchase_id`,`order_no`,`order_goods_id`) WHERE "hubbuy_external_items"."order_goods_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `qc_external_purchase_goods_no_idx` ON `hubbuy_external_items` (`purchase_id`,`order_no`,`order_goods_no`) WHERE "hubbuy_external_items"."order_goods_no" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `qc_external_purchase_item_idx` ON `hubbuy_external_items` (`purchase_item_id`);--> statement-breakpoint
CREATE TABLE `qc_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`purchase_id` text NOT NULL,
	`actor_id` text,
	`event_type` text NOT NULL,
	`result_code` text NOT NULL,
	`context_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "qc_event_context_json" CHECK(json_valid("qc_events"."context_json"))
);
--> statement-breakpoint
CREATE INDEX `qc_event_purchase_idx` ON `qc_events` (`purchase_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `qc_image_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`import_id` text,
	`external_item_id` text NOT NULL,
	`image_id` text,
	`source_url` text NOT NULL,
	`source_url_hash` text NOT NULL,
	`ordinal` integer NOT NULL,
	`state` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`bytes_reserved` integer DEFAULT 0 NOT NULL,
	`bytes_consumed` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`import_id`) REFERENCES `qc_imports`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`external_item_id`) REFERENCES `hubbuy_external_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`image_id`) REFERENCES `qc_images`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "qc_source_ordinal" CHECK(typeof("qc_image_sources"."ordinal") = 'integer' AND "qc_image_sources"."ordinal" BETWEEN 0 AND 199),
	CONSTRAINT "qc_source_attempts" CHECK(typeof("qc_image_sources"."attempts") = 'integer' AND "qc_image_sources"."attempts" >= 0),
	CONSTRAINT "qc_source_budget" CHECK(typeof("qc_image_sources"."bytes_reserved") = 'integer' AND "qc_image_sources"."bytes_reserved" BETWEEN 0 AND 8388608 AND typeof("qc_image_sources"."bytes_consumed") = 'integer' AND "qc_image_sources"."bytes_consumed" BETWEEN 0 AND 209715200)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qc_source_external_hash_idx` ON `qc_image_sources` (`external_item_id`,`source_url_hash`);--> statement-breakpoint
CREATE INDEX `qc_source_work_idx` ON `qc_image_sources` (`state`,`updated_at`);--> statement-breakpoint
CREATE TABLE `qc_images` (
	`id` text PRIMARY KEY NOT NULL,
	`external_item_id` text NOT NULL,
	`source_url` text NOT NULL,
	`source_url_hash` text NOT NULL,
	`content_sha256` text,
	`r2_key` text NOT NULL,
	`status` text NOT NULL,
	`delete_state` text DEFAULT 'none' NOT NULL,
	`mime_type` text,
	`byte_size` integer,
	`width` integer,
	`height` integer,
	`ordinal` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`claim_token` text,
	`claim_expires_at` integer,
	`error_code` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`external_item_id`) REFERENCES `hubbuy_external_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "qc_image_state" CHECK(("qc_images"."status" = 'deleted' AND "qc_images"."deleted_at" IS NOT NULL AND "qc_images"."deleted_by" IS NOT NULL AND "qc_images"."delete_state" IN ('pending','deleted')) OR ("qc_images"."status" != 'deleted' AND "qc_images"."deleted_at" IS NULL AND "qc_images"."deleted_by" IS NULL AND "qc_images"."delete_state" = 'none')),
	CONSTRAINT "qc_image_ready" CHECK("qc_images"."status" != 'ready' OR ("qc_images"."content_sha256" IS NOT NULL AND "qc_images"."mime_type" IN ('image/jpeg','image/png','image/webp') AND typeof("qc_images"."byte_size") = 'integer' AND "qc_images"."byte_size" BETWEEN 1 AND 8388608 AND typeof("qc_images"."width") = 'integer' AND "qc_images"."width" BETWEEN 1 AND 8192 AND typeof("qc_images"."height") = 'integer' AND "qc_images"."height" BETWEEN 1 AND 8192)),
	CONSTRAINT "qc_image_ordinal" CHECK(typeof("qc_images"."ordinal") = 'integer' AND "qc_images"."ordinal" BETWEEN 0 AND 199)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qc_image_external_content_idx` ON `qc_images` (`external_item_id`,`content_sha256`) WHERE "qc_images"."content_sha256" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `qc_image_external_source_idx` ON `qc_images` (`external_item_id`,`source_url_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `qc_image_r2_key_idx` ON `qc_images` (`r2_key`);--> statement-breakpoint
CREATE INDEX `qc_image_external_state_idx` ON `qc_images` (`external_item_id`,`status`,`ordinal`);--> statement-breakpoint
CREATE TABLE `qc_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`purchase_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`manifest_json` text NOT NULL,
	`status` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`bytes_reserved` integer DEFAULT 0 NOT NULL,
	`bytes_consumed` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "qc_import_manifest_json" CHECK(json_valid("qc_imports"."manifest_json")),
	CONSTRAINT "qc_import_status" CHECK("qc_imports"."status" IN ('prepared','confirmed','expired')),
	CONSTRAINT "qc_import_revision" CHECK(typeof("qc_imports"."revision") = 'integer' AND "qc_imports"."revision" >= 0),
	CONSTRAINT "qc_import_bytes" CHECK(typeof("qc_imports"."bytes_reserved") = 'integer' AND "qc_imports"."bytes_reserved" BETWEEN 0 AND 209715200 AND typeof("qc_imports"."bytes_consumed") = 'integer' AND "qc_imports"."bytes_consumed" BETWEEN 0 AND 209715200)
);
--> statement-breakpoint
CREATE INDEX `qc_import_purchase_idx` ON `qc_imports` (`purchase_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `qc_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL,
	CONSTRAINT "qc_rate_count" CHECK(typeof("qc_rate_limits"."count") = 'integer' AND "qc_rate_limits"."count" >= 0)
);
--> statement-breakpoint
CREATE TABLE `qc_transfer_locks` (
	`scope` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`version` integer NOT NULL,
	`lease_until` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "qc_transfer_lock_version" CHECK(typeof("qc_transfer_locks"."version") = 'integer' AND "qc_transfer_locks"."version" >= 0)
);
