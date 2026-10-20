CREATE TABLE `financial_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`operation_type` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`payload_hash` text NOT NULL,
	`actor_id` text NOT NULL,
	`occurred_at` integer,
	`recorded_at` integer NOT NULL,
	`reason` text,
	`reversal_of_id` text,
	`context_json` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "financial_operation_key" CHECK(length(trim("financial_operations"."idempotency_key")) BETWEEN 1 AND 200),
	CONSTRAINT "financial_operation_hash" CHECK(length("financial_operations"."payload_hash") = 64),
	CONSTRAINT "financial_operation_context" CHECK(json_valid("financial_operations"."context_json")),
	CONSTRAINT "financial_operation_reason" CHECK("financial_operations"."reason" IS NULL OR length(trim("financial_operations"."reason")) BETWEEN 1 AND 1000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `financial_operation_idempotency_idx` ON `financial_operations` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `financial_operation_type_idx` ON `financial_operations` (`workspace_id`,`operation_type`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `hubbuy_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`label` text NOT NULL,
	`email` text,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`status` text DEFAULT 'reconciling' NOT NULL,
	`balance_cny_minor` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	`reconciled_by` text,
	`reconciled_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reconciled_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "hubbuy_account_label" CHECK(length(trim("hubbuy_accounts"."label")) BETWEEN 1 AND 100),
	CONSTRAINT "hubbuy_account_currency" CHECK("hubbuy_accounts"."currency" = 'CNY'),
	CONSTRAINT "hubbuy_account_status" CHECK("hubbuy_accounts"."status" IN ('reconciling','active','archived')),
	CONSTRAINT "hubbuy_account_balance" CHECK(typeof("hubbuy_accounts"."balance_cny_minor") = 'integer' AND "hubbuy_accounts"."balance_cny_minor" BETWEEN 0 AND 1000000000000),
	CONSTRAINT "hubbuy_account_revision" CHECK(typeof("hubbuy_accounts"."revision") = 'integer' AND "hubbuy_accounts"."revision" >= 0),
	CONSTRAINT "hubbuy_account_reconciled" CHECK(("hubbuy_accounts"."status" = 'active' AND "hubbuy_accounts"."reconciled_at" IS NOT NULL AND "hubbuy_accounts"."reconciled_by" IS NOT NULL) OR ("hubbuy_accounts"."status" != 'active'))
);
--> statement-breakpoint
CREATE INDEX `hubbuy_account_workspace_idx` ON `hubbuy_accounts` (`workspace_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `hubbuy_balance_consumptions` (
	`id` text PRIMARY KEY NOT NULL,
	`debit_entry_id` text NOT NULL,
	`credit_share_id` text NOT NULL,
	`allocation_order` integer NOT NULL,
	`amount_cny_minor` integer NOT NULL,
	`historical_brl_cents` integer NOT NULL,
	`payment_allocation_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`debit_entry_id`) REFERENCES `hubbuy_balance_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`credit_share_id`) REFERENCES `hubbuy_balance_credit_shares`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "hubbuy_consumption_order" CHECK(typeof("hubbuy_balance_consumptions"."allocation_order") = 'integer' AND "hubbuy_balance_consumptions"."allocation_order" >= 0),
	CONSTRAINT "hubbuy_consumption_cny" CHECK(typeof("hubbuy_balance_consumptions"."amount_cny_minor") = 'integer' AND "hubbuy_balance_consumptions"."amount_cny_minor" BETWEEN 1 AND 1000000000000),
	CONSTRAINT "hubbuy_consumption_brl" CHECK(typeof("hubbuy_balance_consumptions"."historical_brl_cents") = 'integer' AND "hubbuy_balance_consumptions"."historical_brl_cents" BETWEEN 0 AND 1000000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hubbuy_consumption_order_idx` ON `hubbuy_balance_consumptions` (`debit_entry_id`,`allocation_order`);--> statement-breakpoint
CREATE INDEX `hubbuy_consumption_share_idx` ON `hubbuy_balance_consumptions` (`credit_share_id`);--> statement-breakpoint
CREATE TABLE `hubbuy_balance_credit_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`credit_entry_id` text NOT NULL,
	`person_id` text NOT NULL,
	`allocation_order` integer NOT NULL,
	`amount_cny_minor` integer NOT NULL,
	`historical_brl_cents` integer NOT NULL,
	FOREIGN KEY (`credit_entry_id`) REFERENCES `hubbuy_balance_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "hubbuy_credit_share_order" CHECK(typeof("hubbuy_balance_credit_shares"."allocation_order") = 'integer' AND "hubbuy_balance_credit_shares"."allocation_order" >= 0),
	CONSTRAINT "hubbuy_credit_share_cny" CHECK(typeof("hubbuy_balance_credit_shares"."amount_cny_minor") = 'integer' AND "hubbuy_balance_credit_shares"."amount_cny_minor" BETWEEN 1 AND 1000000000000),
	CONSTRAINT "hubbuy_credit_share_brl" CHECK(typeof("hubbuy_balance_credit_shares"."historical_brl_cents") = 'integer' AND "hubbuy_balance_credit_shares"."historical_brl_cents" BETWEEN 0 AND 1000000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hubbuy_credit_share_person_idx` ON `hubbuy_balance_credit_shares` (`credit_entry_id`,`person_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `hubbuy_credit_share_order_idx` ON `hubbuy_balance_credit_shares` (`credit_entry_id`,`allocation_order`);--> statement-breakpoint
CREATE INDEX `hubbuy_credit_share_person_order_idx` ON `hubbuy_balance_credit_shares` (`person_id`,`credit_entry_id`);--> statement-breakpoint
CREATE TABLE `hubbuy_balance_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`direction` text NOT NULL,
	`amount_cny_minor` integer NOT NULL,
	`historical_brl_cents` integer,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`reversal_of_entry_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `hubbuy_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `financial_operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reversal_of_entry_id`) REFERENCES `hubbuy_balance_entries`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "hubbuy_balance_entry_sequence" CHECK(typeof("hubbuy_balance_entries"."sequence") = 'integer' AND "hubbuy_balance_entries"."sequence" >= 0),
	CONSTRAINT "hubbuy_balance_entry_direction" CHECK("hubbuy_balance_entries"."direction" IN ('credit','debit')),
	CONSTRAINT "hubbuy_balance_entry_amount" CHECK(typeof("hubbuy_balance_entries"."amount_cny_minor") = 'integer' AND "hubbuy_balance_entries"."amount_cny_minor" BETWEEN 1 AND 1000000000000),
	CONSTRAINT "hubbuy_balance_entry_basis" CHECK("hubbuy_balance_entries"."historical_brl_cents" IS NULL OR (typeof("hubbuy_balance_entries"."historical_brl_cents") = 'integer' AND "hubbuy_balance_entries"."historical_brl_cents" BETWEEN 0 AND 1000000000000)),
	CONSTRAINT "hubbuy_balance_entry_source" CHECK("hubbuy_balance_entries"."source_type" IN ('refund_received','manual_adjustment','opening_balance','purchase_payment','refund_offset','reversal') AND length(trim("hubbuy_balance_entries"."source_id")) BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hubbuy_balance_sequence_idx` ON `hubbuy_balance_entries` (`account_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `hubbuy_balance_operation_source_idx` ON `hubbuy_balance_entries` (`operation_id`,`account_id`,`direction`,`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `hubbuy_balance_account_order_idx` ON `hubbuy_balance_entries` (`account_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `member_balance_financing_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`consumption_id` text NOT NULL,
	`entry_type` text NOT NULL,
	`lender_id` text NOT NULL,
	`beneficiary_id` text NOT NULL,
	`amount_cny_minor` integer NOT NULL,
	`historical_brl_cents` integer NOT NULL,
	`settled_amount_cents` integer,
	`settled_currency` text,
	`occurred_at` integer,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`operation_id`) REFERENCES `financial_operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`consumption_id`) REFERENCES `hubbuy_balance_consumptions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lender_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`beneficiary_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "member_financing_type" CHECK("member_balance_financing_entries"."entry_type" IN ('advance','settlement','refund_offset','reversal')),
	CONSTRAINT "member_financing_people" CHECK("member_balance_financing_entries"."lender_id" != "member_balance_financing_entries"."beneficiary_id"),
	CONSTRAINT "member_financing_cny" CHECK(typeof("member_balance_financing_entries"."amount_cny_minor") = 'integer' AND "member_balance_financing_entries"."amount_cny_minor" BETWEEN 1 AND 1000000000000),
	CONSTRAINT "member_financing_basis" CHECK(typeof("member_balance_financing_entries"."historical_brl_cents") = 'integer' AND "member_balance_financing_entries"."historical_brl_cents" BETWEEN 0 AND 1000000000000),
	CONSTRAINT "member_financing_settlement" CHECK(("member_balance_financing_entries"."settled_amount_cents" IS NULL AND "member_balance_financing_entries"."settled_currency" IS NULL) OR (typeof("member_balance_financing_entries"."settled_amount_cents") = 'integer' AND "member_balance_financing_entries"."settled_amount_cents" BETWEEN 0 AND 1000000000000 AND "member_balance_financing_entries"."settled_currency" IN ('BRL','CNY')))
);
--> statement-breakpoint
CREATE INDEX `member_financing_people_idx` ON `member_balance_financing_entries` (`lender_id`,`beneficiary_id`,`recorded_at`);--> statement-breakpoint
CREATE INDEX `member_financing_consumption_idx` ON `member_balance_financing_entries` (`consumption_id`,`entry_type`);
--> statement-breakpoint
CREATE TRIGGER `financial_operations_no_update` BEFORE UPDATE ON `financial_operations` BEGIN SELECT RAISE(ABORT, 'financial operations are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `financial_operations_no_delete` BEFORE DELETE ON `financial_operations` BEGIN SELECT RAISE(ABORT, 'financial operations are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_accounts_no_delete` BEFORE DELETE ON `hubbuy_accounts` BEGIN SELECT RAISE(ABORT, 'HubBuy accounts are retained for audit'); END;
