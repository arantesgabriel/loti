CREATE TABLE `hubbuy_reconciliation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`balance_entry_id` text NOT NULL,
	`event_type` text NOT NULL,
	`source_reference` text,
	`description` text NOT NULL,
	`amount_cny_minor` integer NOT NULL,
	`historical_brl_cents` integer NOT NULL,
	`occurred_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `hubbuy_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `financial_operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`balance_entry_id`) REFERENCES `hubbuy_balance_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "hubbuy_reconciliation_event_type" CHECK("hubbuy_reconciliation_events"."event_type" IN ('legacy_receipt','synthetic_use')),
	CONSTRAINT "hubbuy_reconciliation_event_description" CHECK(length(trim("hubbuy_reconciliation_events"."description")) BETWEEN 1 AND 1000),
	CONSTRAINT "hubbuy_reconciliation_event_reference" CHECK("hubbuy_reconciliation_events"."source_reference" IS NULL OR length(trim("hubbuy_reconciliation_events"."source_reference")) BETWEEN 1 AND 200),
	CONSTRAINT "hubbuy_reconciliation_event_amount" CHECK(typeof("hubbuy_reconciliation_events"."amount_cny_minor") = 'integer' AND "hubbuy_reconciliation_events"."amount_cny_minor" BETWEEN 1 AND 1000000000000),
	CONSTRAINT "hubbuy_reconciliation_event_basis" CHECK(typeof("hubbuy_reconciliation_events"."historical_brl_cents") = 'integer' AND "hubbuy_reconciliation_events"."historical_brl_cents" BETWEEN 0 AND 1000000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hubbuy_reconciliation_event_operation_idx` ON `hubbuy_reconciliation_events` (`operation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `hubbuy_reconciliation_event_entry_idx` ON `hubbuy_reconciliation_events` (`balance_entry_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `hubbuy_reconciliation_source_reference_idx` ON `hubbuy_reconciliation_events` (`account_id`,`source_reference`) WHERE "hubbuy_reconciliation_events"."source_reference" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `hubbuy_reconciliation_event_order_idx` ON `hubbuy_reconciliation_events` (`account_id`,`occurred_at`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `hubbuy_reconciliation_runs` (
	`account_id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`prior_activity_description` text,
	`prior_activity_occurred_at` integer,
	`started_by` text NOT NULL,
	`started_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `hubbuy_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`started_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "hubbuy_reconciliation_mode" CHECK(("hubbuy_reconciliation_runs"."mode" = 'chronological' AND "hubbuy_reconciliation_runs"."prior_activity_description" IS NULL) OR ("hubbuy_reconciliation_runs"."mode" = 'remainder' AND length(trim("hubbuy_reconciliation_runs"."prior_activity_description")) BETWEEN 1 AND 1000))
);
--> statement-breakpoint
CREATE TRIGGER `hubbuy_reconciliation_runs_no_update` BEFORE UPDATE ON `hubbuy_reconciliation_runs` BEGIN SELECT RAISE(ABORT, 'HubBuy reconciliation runs are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_reconciliation_runs_no_delete` BEFORE DELETE ON `hubbuy_reconciliation_runs` BEGIN SELECT RAISE(ABORT, 'HubBuy reconciliation runs are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_reconciliation_events_no_update` BEFORE UPDATE ON `hubbuy_reconciliation_events` BEGIN SELECT RAISE(ABORT, 'HubBuy reconciliation events are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_reconciliation_events_no_delete` BEFORE DELETE ON `hubbuy_reconciliation_events` BEGIN SELECT RAISE(ABORT, 'HubBuy reconciliation events are append-only'); END;
