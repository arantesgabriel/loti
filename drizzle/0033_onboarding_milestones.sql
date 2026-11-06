CREATE TABLE `onboarding_milestones` (
	`user_id` text NOT NULL,
	`milestone` text NOT NULL,
	`workspace_id` text,
	`evidence` text NOT NULL,
	`source` text NOT NULL,
	`occurred_at` integer,
	`recorded_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `milestone`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "onboarding_milestone_key" CHECK("onboarding_milestones"."milestone" IN ('M1','M2')),
	CONSTRAINT "onboarding_milestone_source" CHECK("onboarding_milestones"."source" IN ('favorite','purchase_item') AND ("onboarding_milestones"."milestone" <> 'M2' OR "onboarding_milestones"."source" = 'purchase_item')),
	CONSTRAINT "onboarding_milestone_evidence" CHECK(("onboarding_milestones"."evidence" = 'committed' AND "onboarding_milestones"."occurred_at" IS NOT NULL) OR ("onboarding_milestones"."evidence" = 'preexisting' AND "onboarding_milestones"."occurred_at" IS NULL))
);
