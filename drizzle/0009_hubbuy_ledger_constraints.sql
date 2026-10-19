PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hubbuy_balance_entries` (
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
	CONSTRAINT "hubbuy_balance_entry_sequence" CHECK(typeof("__new_hubbuy_balance_entries"."sequence") = 'integer' AND "__new_hubbuy_balance_entries"."sequence" >= 0),
	CONSTRAINT "hubbuy_balance_entry_direction" CHECK("__new_hubbuy_balance_entries"."direction" IN ('credit','debit')),
	CONSTRAINT "hubbuy_balance_entry_amount" CHECK(typeof("__new_hubbuy_balance_entries"."amount_cny_minor") = 'integer' AND "__new_hubbuy_balance_entries"."amount_cny_minor" BETWEEN 1 AND 1000000000000),
	CONSTRAINT "hubbuy_balance_entry_basis" CHECK("__new_hubbuy_balance_entries"."historical_brl_cents" IS NULL OR (typeof("__new_hubbuy_balance_entries"."historical_brl_cents") = 'integer' AND "__new_hubbuy_balance_entries"."historical_brl_cents" BETWEEN 0 AND 1000000000000)),
	CONSTRAINT "hubbuy_balance_entry_source" CHECK("__new_hubbuy_balance_entries"."source_type" IN ('refund_received','manual_adjustment','opening_balance','purchase_payment','refund_offset','reversal') AND length(trim("__new_hubbuy_balance_entries"."source_id")) BETWEEN 1 AND 200)
);
--> statement-breakpoint
INSERT INTO `__new_hubbuy_balance_entries`("id", "account_id", "operation_id", "sequence", "direction", "amount_cny_minor", "historical_brl_cents", "source_type", "source_id", "reversal_of_entry_id", "created_at") SELECT "id", "account_id", "operation_id", "sequence", "direction", "amount_cny_minor", "historical_brl_cents", "source_type", "source_id", "reversal_of_entry_id", "created_at" FROM `hubbuy_balance_entries`;--> statement-breakpoint
DROP TABLE `hubbuy_balance_entries`;--> statement-breakpoint
ALTER TABLE `__new_hubbuy_balance_entries` RENAME TO `hubbuy_balance_entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `hubbuy_balance_sequence_idx` ON `hubbuy_balance_entries` (`account_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `hubbuy_balance_operation_source_idx` ON `hubbuy_balance_entries` (`operation_id`,`account_id`,`direction`,`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `hubbuy_balance_account_order_idx` ON `hubbuy_balance_entries` (`account_id`,`sequence`);
--> statement-breakpoint
CREATE TRIGGER `hubbuy_balance_entry_workspace_guard` BEFORE INSERT ON `hubbuy_balance_entries`
WHEN (SELECT workspace_id FROM `hubbuy_accounts` WHERE id = NEW.account_id) IS NOT (SELECT workspace_id FROM `financial_operations` WHERE id = NEW.operation_id)
BEGIN SELECT RAISE(ABORT, 'balance account and operation workspace mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_balance_entries_no_update` BEFORE UPDATE ON `hubbuy_balance_entries` BEGIN SELECT RAISE(ABORT, 'balance entries are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_balance_entries_no_delete` BEFORE DELETE ON `hubbuy_balance_entries` BEGIN SELECT RAISE(ABORT, 'balance entries are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_credit_share_guard` BEFORE INSERT ON `hubbuy_balance_credit_shares`
WHEN NOT EXISTS (
  SELECT 1 FROM `hubbuy_balance_entries` e
  JOIN `hubbuy_accounts` a ON a.id = e.account_id
  JOIN `workspace_members` m ON m.workspace_id = a.workspace_id AND m.user_id = NEW.person_id
  WHERE e.id = NEW.credit_entry_id AND e.direction = 'credit'
)
BEGIN SELECT RAISE(ABORT, 'credit share must belong to a workspace member and credit entry'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_balance_credit_shares_no_update` BEFORE UPDATE ON `hubbuy_balance_credit_shares` BEGIN SELECT RAISE(ABORT, 'credit shares are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_balance_credit_shares_no_delete` BEFORE DELETE ON `hubbuy_balance_credit_shares` BEGIN SELECT RAISE(ABORT, 'credit shares are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_account_balance_matches_ledger` BEFORE UPDATE OF `balance_cny_minor` ON `hubbuy_accounts`
WHEN NEW.balance_cny_minor != COALESCE((SELECT SUM(CASE direction WHEN 'credit' THEN amount_cny_minor ELSE -amount_cny_minor END) FROM `hubbuy_balance_entries` WHERE account_id = NEW.id), 0)
BEGIN SELECT RAISE(ABORT, 'account balance projection must match the ledger'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_consumption_guard` BEFORE INSERT ON `hubbuy_balance_consumptions`
WHEN NOT EXISTS (
  SELECT 1 FROM `hubbuy_balance_entries` d
  JOIN `hubbuy_balance_credit_shares` s ON s.id = NEW.credit_share_id
  JOIN `hubbuy_balance_entries` c ON c.id = s.credit_entry_id
  WHERE d.id = NEW.debit_entry_id AND d.direction = 'debit' AND c.direction = 'credit' AND c.account_id = d.account_id
    AND COALESCE((SELECT SUM(amount_cny_minor) FROM `hubbuy_balance_consumptions` WHERE credit_share_id = s.id), 0) + NEW.amount_cny_minor <= s.amount_cny_minor
    AND COALESCE((SELECT SUM(historical_brl_cents) FROM `hubbuy_balance_consumptions` WHERE credit_share_id = s.id), 0) + NEW.historical_brl_cents <= s.historical_brl_cents
)
BEGIN SELECT RAISE(ABORT, 'balance consumption exceeds its credit share or crosses accounts'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_balance_consumptions_no_update` BEFORE UPDATE ON `hubbuy_balance_consumptions` BEGIN SELECT RAISE(ABORT, 'balance consumptions are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_balance_consumptions_no_delete` BEFORE DELETE ON `hubbuy_balance_consumptions` BEGIN SELECT RAISE(ABORT, 'balance consumptions are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `member_balance_financing_entries_no_update` BEFORE UPDATE ON `member_balance_financing_entries` BEGIN SELECT RAISE(ABORT, 'financing entries are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `member_balance_financing_entries_no_delete` BEFORE DELETE ON `member_balance_financing_entries` BEGIN SELECT RAISE(ABORT, 'financing entries are append-only'); END;
