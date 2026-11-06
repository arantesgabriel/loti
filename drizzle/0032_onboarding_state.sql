CREATE TABLE `onboarding_enrollments` (
	`user_id` text NOT NULL,
	`flow_key` text NOT NULL,
	`cohort` text NOT NULL,
	`initial_flow_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `flow_key`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "onboarding_flow_key" CHECK("onboarding_enrollments"."flow_key" = 'h3c'),
	CONSTRAINT "onboarding_cohort" CHECK("onboarding_enrollments"."cohort" IN ('existing','new')),
	CONSTRAINT "onboarding_initial_version" CHECK(typeof("onboarding_enrollments"."initial_flow_version") = 'integer' AND "onboarding_enrollments"."initial_flow_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE `onboarding_help_preferences` (
	`user_id` text NOT NULL,
	`help_id` text NOT NULL,
	`help_version` integer NOT NULL,
	`proactive` integer NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `help_id`, `help_version`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "onboarding_help_id" CHECK("onboarding_help_preferences"."help_id" IN ('all','favorites.first-action','purchase.first-item')),
	CONSTRAINT "onboarding_help_version" CHECK(typeof("onboarding_help_preferences"."help_version") = 'integer' AND "onboarding_help_preferences"."help_version" >= 1),
	CONSTRAINT "onboarding_help_revision" CHECK(typeof("onboarding_help_preferences"."revision") = 'integer' AND "onboarding_help_preferences"."revision" >= 1),
	CONSTRAINT "onboarding_help_proactive" CHECK("onboarding_help_preferences"."proactive" IN (0,1))
);
--> statement-breakpoint
CREATE TABLE `onboarding_runs` (
	`user_id` text NOT NULL,
	`flow_key` text NOT NULL,
	`flow_version` integer NOT NULL,
	`status` text NOT NULL,
	`current_step_id` text NOT NULL,
	`started_at` integer,
	`closed_at` integer,
	`completed_at` integer,
	`skipped_at` integer,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `flow_key`, `flow_version`),
	FOREIGN KEY (`user_id`,`flow_key`) REFERENCES `onboarding_enrollments`(`user_id`,`flow_key`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "onboarding_run_version" CHECK(typeof("onboarding_runs"."flow_version") = 'integer' AND "onboarding_runs"."flow_version" >= 1),
	CONSTRAINT "onboarding_run_revision" CHECK(typeof("onboarding_runs"."revision") = 'integer' AND "onboarding_runs"."revision" >= 1),
	CONSTRAINT "onboarding_run_step" CHECK("onboarding_runs"."current_step_id" IN ('introduction','personalization','entry')),
	CONSTRAINT "onboarding_run_state" CHECK(
    ("onboarding_runs"."status" = 'in_progress' AND "onboarding_runs"."completed_at" IS NULL AND "onboarding_runs"."skipped_at" IS NULL)
    OR ("onboarding_runs"."status" = 'completed' AND "onboarding_runs"."completed_at" IS NOT NULL AND "onboarding_runs"."skipped_at" IS NULL AND "onboarding_runs"."closed_at" IS NULL)
    OR ("onboarding_runs"."status" = 'skipped' AND "onboarding_runs"."skipped_at" IS NOT NULL AND "onboarding_runs"."completed_at" IS NULL AND "onboarding_runs"."closed_at" IS NULL)
  )
);
--> statement-breakpoint
CREATE TABLE `user_guidance_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`experience` text DEFAULT 'unspecified' NOT NULL,
	`usage_intent` text DEFAULT 'unspecified' NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "guidance_experience" CHECK("user_guidance_profiles"."experience" IN ('unspecified','never','sometimes','frequent','expert')),
	CONSTRAINT "guidance_usage_intent" CHECK("user_guidance_profiles"."usage_intent" IN ('unspecified','individual','group','both','undecided')),
	CONSTRAINT "guidance_profile_revision" CHECK(typeof("user_guidance_profiles"."revision") = 'integer' AND "user_guidance_profiles"."revision" >= 1)
);
--> statement-breakpoint
-- A rollout classification is not an introduction, an exposure or a milestone.
-- Every account present when this migration runs keeps manual-only discovery.
INSERT INTO `onboarding_enrollments` (`user_id`, `flow_key`, `cohort`, `initial_flow_version`, `created_at`)
SELECT `id`, 'h3c', 'existing', 1, CAST(strftime('%s', 'now') AS integer) * 1000 FROM `user`;
--> statement-breakpoint
CREATE TRIGGER `onboarding_enrollment_immutable` BEFORE UPDATE ON `onboarding_enrollments`
BEGIN SELECT RAISE(ABORT, 'onboarding enrollment is immutable'); END;
