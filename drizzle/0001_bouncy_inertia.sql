CREATE TABLE `invitation_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspace_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`accepted_by` text,
	`revoked_at` integer,
	`revoked_by` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`accepted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`revoked_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "invitation_terminal_state" CHECK("workspace_invitations"."accepted_at" IS NULL OR "workspace_invitations"."revoked_at" IS NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_invitations_token_hash_unique` ON `workspace_invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invitation_workspace_idx` ON `workspace_invitations` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_open_email_idx` ON `workspace_invitations` (`workspace_id`,`email`) WHERE "workspace_invitations"."accepted_at" IS NULL AND "workspace_invitations"."revoked_at" IS NULL;