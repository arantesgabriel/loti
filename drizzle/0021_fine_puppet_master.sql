CREATE TABLE `auth_email_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`recipient_key` text NOT NULL,
	`user_id` text,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "auth_email_kind" CHECK("auth_email_deliveries"."kind" IN ('reset','verification','invitation')),
	CONSTRAINT "auth_email_state" CHECK("auth_email_deliveries"."state" IN ('reserved','sent','failed','uncertain'))
);
--> statement-breakpoint
CREATE INDEX `auth_email_expiry_idx` ON `auth_email_deliveries` (`expires_at`);--> statement-breakpoint
CREATE TABLE `auth_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "auth_limit_count" CHECK("auth_limits"."count" > 0)
);
--> statement-breakpoint
CREATE INDEX `auth_limit_expiry_idx` ON `auth_limits` (`expires_at`);