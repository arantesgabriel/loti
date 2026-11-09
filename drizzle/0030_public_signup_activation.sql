CREATE TABLE `account_activation_requirements` (
	`user_id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "account_activation_source" CHECK("account_activation_requirements"."source" IN ('public_signup','invitation'))
);
