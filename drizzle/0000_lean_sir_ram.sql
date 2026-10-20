CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "collection_name" CHECK(length(trim("collections"."name")) > 0)
);
--> statement-breakpoint
CREATE INDEX `collections_workspace_idx` ON `collections` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `favorites` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`collection_id` text,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`platform` text NOT NULL,
	`canonical_product_key` text,
	`price_cents` integer,
	`variant` text,
	`notes` text,
	`qc_status` text DEFAULT 'not_reviewed' NOT NULL,
	`visual_key` text DEFAULT 'generic' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "favorite_price" CHECK("favorites"."price_cents" IS NULL OR (typeof("favorites"."price_cents") = 'integer' AND "favorites"."price_cents" >= 0)),
	CONSTRAINT "favorite_qc" CHECK("favorites"."qc_status" IN ('not_reviewed','approved','rejected')),
	CONSTRAINT "favorite_name" CHECK(length(trim("favorites"."name")) > 0)
);
--> statement-breakpoint
CREATE INDEX `favorite_workspace_idx` ON `favorites` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `favorite_owner_idx` ON `favorites` (`owner_id`);--> statement-breakpoint
CREATE INDEX `favorite_collection_idx` ON `favorites` (`collection_id`);--> statement-breakpoint
CREATE INDEX `favorite_key_idx` ON `favorites` (`canonical_product_key`);--> statement-breakpoint
CREATE INDEX `favorite_created_idx` ON `favorites` (`created_at`);--> statement-breakpoint
CREATE TABLE `purchase_items` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_id` text NOT NULL,
	`source_favorite_id` text,
	`person_id` text NOT NULL,
	`created_by` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`platform` text NOT NULL,
	`visual_key` text NOT NULL,
	`variant` text,
	`notes` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_price_cents` integer,
	`cart_status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_favorite_id`) REFERENCES `favorites`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`person_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "item_quantity" CHECK(typeof("purchase_items"."quantity") = 'integer' AND "purchase_items"."quantity" >= 1),
	CONSTRAINT "item_price" CHECK("purchase_items"."unit_price_cents" IS NULL OR (typeof("purchase_items"."unit_price_cents") = 'integer' AND "purchase_items"."unit_price_cents" >= 0)),
	CONSTRAINT "item_status" CHECK("purchase_items"."cart_status" IN ('pending','added'))
);
--> statement-breakpoint
CREATE INDEX `item_purchase_idx` ON `purchase_items` (`purchase_id`);--> statement-breakpoint
CREATE INDEX `item_person_idx` ON `purchase_items` (`person_id`);--> statement-breakpoint
CREATE INDEX `item_cart_idx` ON `purchase_items` (`cart_status`);--> statement-breakpoint
CREATE INDEX `item_source_idx` ON `purchase_items` (`source_favorite_id`);--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`hubbuy_account` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`finalized_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "purchase_status" CHECK("purchases"."status" IN ('active','finalized')),
	CONSTRAINT "purchase_finalized_date" CHECK(("purchases"."status" = 'active' AND "purchases"."finalized_at" IS NULL) OR ("purchases"."status" = 'finalized' AND "purchases"."finalized_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_active_purchase_per_workspace` ON `purchases` (`workspace_id`) WHERE "purchases"."status" = 'active';--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`favorites_view` text DEFAULT 'list' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "preference_view" CHECK("user_preferences"."favorites_view" IN ('list','cards'))
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
