CREATE TABLE `qc_additional_presentations` (
	`additional_order_item_id` text PRIMARY KEY NOT NULL,
	`primary_image_id` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`additional_order_item_id`) REFERENCES `purchase_additional_order_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`primary_image_id`) REFERENCES `qc_images`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "qc_additional_presentation_revision" CHECK(typeof("qc_additional_presentations"."revision") = 'integer' AND "qc_additional_presentations"."revision" >= 0)
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hubbuy_external_items` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`purchase_id` text NOT NULL,
	`purchase_item_id` text,
	`additional_order_item_id` text,
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
	FOREIGN KEY (`additional_order_item_id`) REFERENCES `purchase_additional_order_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`confirmed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "qc_external_target_origin" CHECK(NOT ("__new_hubbuy_external_items"."purchase_item_id" IS NOT NULL AND "__new_hubbuy_external_items"."additional_order_item_id" IS NOT NULL)),
	CONSTRAINT "qc_external_revision" CHECK(typeof("__new_hubbuy_external_items"."revision") = 'integer' AND "__new_hubbuy_external_items"."revision" >= 0),
	CONSTRAINT "qc_external_quantity" CHECK("__new_hubbuy_external_items"."quantity" IS NULL OR (typeof("__new_hubbuy_external_items"."quantity") = 'integer' AND "__new_hubbuy_external_items"."quantity" BETWEEN 0 AND 10000))
);
--> statement-breakpoint
INSERT INTO `__new_hubbuy_external_items`("id", "workspace_id", "purchase_id", "purchase_item_id", "additional_order_item_id", "order_goods_id", "order_goods_no", "order_no", "offer_id", "channel", "offer_url", "sku_info", "title", "quantity", "revision", "confirmed_by", "confirmed_at", "created_at", "updated_at") SELECT "id", "workspace_id", "purchase_id", "purchase_item_id", NULL, "order_goods_id", "order_goods_no", "order_no", "offer_id", "channel", "offer_url", "sku_info", "title", "quantity", "revision", "confirmed_by", "confirmed_at", "created_at", "updated_at" FROM `hubbuy_external_items`;--> statement-breakpoint
DROP TABLE `hubbuy_external_items`;--> statement-breakpoint
ALTER TABLE `__new_hubbuy_external_items` RENAME TO `hubbuy_external_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `qc_external_purchase_order_goods_idx` ON `hubbuy_external_items` (`purchase_id`,`order_no`,`order_goods_id`) WHERE "hubbuy_external_items"."order_goods_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `qc_external_purchase_goods_no_idx` ON `hubbuy_external_items` (`purchase_id`,`order_no`,`order_goods_no`) WHERE "hubbuy_external_items"."order_goods_no" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `qc_external_purchase_item_idx` ON `hubbuy_external_items` (`purchase_item_id`);--> statement-breakpoint
CREATE INDEX `qc_external_additional_item_idx` ON `hubbuy_external_items` (`additional_order_item_id`);
