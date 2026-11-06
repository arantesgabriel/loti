CREATE TABLE `referral_attributions` (
	`id` text PRIMARY KEY NOT NULL,
	`link_id` text NOT NULL,
	`referrer_user_id` text NOT NULL,
	`referred_user_id` text NOT NULL,
	`captured_at` integer NOT NULL,
	`confirmed_at` integer,
	FOREIGN KEY (`link_id`) REFERENCES `referral_links`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`referrer_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`referred_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "referral_not_self" CHECK("referral_attributions"."referrer_user_id" <> "referral_attributions"."referred_user_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `referral_attributions_referred_user_id_unique` ON `referral_attributions` (`referred_user_id`);
--> statement-breakpoint
CREATE INDEX `referral_referrer_idx` ON `referral_attributions` (`referrer_user_id`);
--> statement-breakpoint
CREATE TABLE `referral_links` (
	`id` text PRIMARY KEY NOT NULL,
	`referrer_user_id` text NOT NULL,
	`token` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`referrer_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `referral_links_referrer_user_id_unique` ON `referral_links` (`referrer_user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `referral_links_token_unique` ON `referral_links` (`token`);
--> statement-breakpoint
CREATE UNIQUE INDEX `referral_links_token_hash_unique` ON `referral_links` (`token_hash`);
--> statement-breakpoint
CREATE TRIGGER `referral_attribution_immutable` BEFORE UPDATE ON `referral_attributions`
WHEN OLD.confirmed_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'confirmed referral attribution is immutable'); END;
