CREATE TABLE `qc_image_previews` (
	`image_id` text PRIMARY KEY NOT NULL,
	`r2_key` text NOT NULL,
	`transform_version` text NOT NULL,
	`status` text NOT NULL,
	`delete_state` text DEFAULT 'none' NOT NULL,
	`sha256` text,
	`byte_size` integer,
	`width` integer,
	`height` integer,
	`revision` integer DEFAULT 0 NOT NULL,
	`claim_token` text,
	`claim_expires_at` integer,
	`error_code` text,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`image_id`) REFERENCES `qc_images`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "qc_preview_state" CHECK(("qc_image_previews"."status" = 'deleted' AND "qc_image_previews"."deleted_at" IS NOT NULL AND "qc_image_previews"."delete_state" IN ('pending','deleted')) OR ("qc_image_previews"."status" != 'deleted' AND "qc_image_previews"."deleted_at" IS NULL AND "qc_image_previews"."delete_state" = 'none')),
	CONSTRAINT "qc_preview_revision" CHECK(typeof("qc_image_previews"."revision") = 'integer' AND "qc_image_previews"."revision" >= 0),
	CONSTRAINT "qc_preview_ready" CHECK("qc_image_previews"."status" != 'ready' OR ("qc_image_previews"."sha256" IS NOT NULL AND typeof("qc_image_previews"."byte_size") = 'integer' AND "qc_image_previews"."byte_size" BETWEEN 1 AND 131072 AND typeof("qc_image_previews"."width") = 'integer' AND "qc_image_previews"."width" BETWEEN 1 AND 160 AND typeof("qc_image_previews"."height") = 'integer' AND "qc_image_previews"."height" BETWEEN 1 AND 160))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qc_image_preview_key_idx` ON `qc_image_previews` (`r2_key`);--> statement-breakpoint
CREATE INDEX `qc_preview_state_idx` ON `qc_image_previews` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `qc_presentations` (
	`purchase_item_id` text PRIMARY KEY NOT NULL,
	`primary_image_id` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`purchase_item_id`) REFERENCES `purchase_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`primary_image_id`) REFERENCES `qc_images`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "qc_presentation_revision" CHECK(typeof("qc_presentations"."revision") = 'integer' AND "qc_presentations"."revision" >= 0)
);
