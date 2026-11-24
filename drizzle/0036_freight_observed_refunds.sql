CREATE TABLE `package_freight_refund_reversals` (
	`refund_id` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`debit_entry_id` text,
	FOREIGN KEY (`refund_id`) REFERENCES `package_freight_refunds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `financial_operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`debit_entry_id`) REFERENCES `hubbuy_balance_entries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `package_freight_refund_reversals_operation_id_unique` ON `package_freight_refund_reversals` (`operation_id`);--> statement-breakpoint
CREATE TABLE `package_freight_refund_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`refund_id` text NOT NULL,
	`source_id` text NOT NULL,
	`native_minor` integer NOT NULL,
	`historical_brl_cents` integer NOT NULL,
	FOREIGN KEY (`refund_id`) REFERENCES `package_freight_refunds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `package_freight_sources`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "freight_refund_source_values" CHECK(typeof("package_freight_refund_sources"."native_minor")='integer' AND "package_freight_refund_sources"."native_minor" BETWEEN 1 AND 1000000000000 AND typeof("package_freight_refund_sources"."historical_brl_cents")='integer' AND "package_freight_refund_sources"."historical_brl_cents" BETWEEN 0 AND 1000000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `freight_refund_source_idx` ON `package_freight_refund_sources` (`refund_id`,`source_id`);--> statement-breakpoint
CREATE TABLE `package_freight_refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`destination` text NOT NULL,
	`native_minor` integer NOT NULL,
	`historical_brl_cents` integer NOT NULL,
	`actual_brl_cents` integer,
	`credit_entry_id` text,
	`external_reference` text,
	FOREIGN KEY (`payment_id`) REFERENCES `package_freight_payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `financial_operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`credit_entry_id`) REFERENCES `hubbuy_balance_entries`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "freight_refund_values" CHECK(typeof("package_freight_refunds"."native_minor")='integer' AND "package_freight_refunds"."native_minor" BETWEEN 1 AND 1000000000000 AND typeof("package_freight_refunds"."historical_brl_cents")='integer' AND "package_freight_refunds"."historical_brl_cents" BETWEEN 0 AND 1000000000000 AND (("package_freight_refunds"."destination"='wallet' AND "package_freight_refunds"."credit_entry_id" IS NOT NULL AND "package_freight_refunds"."actual_brl_cents" IS NULL) OR ("package_freight_refunds"."destination"='external' AND "package_freight_refunds"."credit_entry_id" IS NULL AND typeof("package_freight_refunds"."actual_brl_cents")='integer' AND "package_freight_refunds"."actual_brl_cents" BETWEEN 0 AND 1000000000000)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `package_freight_refunds_operation_id_unique` ON `package_freight_refunds` (`operation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `package_freight_refunds_credit_entry_id_unique` ON `package_freight_refunds` (`credit_entry_id`);--> statement-breakpoint
CREATE INDEX `freight_refund_payment_idx` ON `package_freight_refunds` (`payment_id`);
--> statement-breakpoint
CREATE TRIGGER package_freight_refunds_no_update BEFORE UPDATE ON package_freight_refunds BEGIN SELECT RAISE(ABORT,'freight refunds are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER package_freight_refunds_no_delete BEFORE DELETE ON package_freight_refunds BEGIN SELECT RAISE(ABORT,'freight refunds are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER package_freight_refund_sources_no_update BEFORE UPDATE ON package_freight_refund_sources BEGIN SELECT RAISE(ABORT,'freight refunds are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER package_freight_refund_sources_no_delete BEFORE DELETE ON package_freight_refund_sources BEGIN SELECT RAISE(ABORT,'freight refunds are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER package_freight_refund_reversals_no_update BEFORE UPDATE ON package_freight_refund_reversals BEGIN SELECT RAISE(ABORT,'freight refunds are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER package_freight_refund_reversals_no_delete BEFORE DELETE ON package_freight_refund_reversals BEGIN SELECT RAISE(ABORT,'freight refunds are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER freight_refund_scope BEFORE INSERT ON package_freight_refunds WHEN NOT EXISTS(SELECT 1 FROM package_freight_payments p JOIN logistics_packages g ON g.id=p.package_id JOIN financial_operations o ON o.id=NEW.operation_id WHERE p.id=NEW.payment_id AND g.workspace_id=o.workspace_id AND NEW.native_minor+(SELECT coalesce(sum(r.native_minor),0) FROM package_freight_refunds r WHERE r.payment_id=p.id AND NOT EXISTS(SELECT 1 FROM package_freight_refund_reversals x WHERE x.refund_id=r.id))<=p.native_minor AND (NEW.destination!='wallet' OR (p.native_currency='CNY' AND EXISTS(SELECT 1 FROM hubbuy_balance_entries e WHERE e.id=NEW.credit_entry_id AND e.account_id=g.account_id AND e.operation_id=o.id AND e.direction='credit' AND e.amount_cny_minor=NEW.native_minor AND e.historical_brl_cents=NEW.historical_brl_cents)))) BEGIN SELECT RAISE(ABORT,'freight refund scope or capacity mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER freight_refund_source_capacity BEFORE INSERT ON package_freight_refund_sources WHEN NOT EXISTS(SELECT 1 FROM package_freight_sources s JOIN package_freight_refunds r ON r.id=NEW.refund_id WHERE s.id=NEW.source_id AND s.payment_id=r.payment_id AND NEW.native_minor+(SELECT coalesce(sum(x.native_minor),0) FROM package_freight_refund_sources x WHERE x.source_id=s.id AND NOT EXISTS(SELECT 1 FROM package_freight_refund_reversals v WHERE v.refund_id=x.refund_id))<=s.native_minor AND NEW.historical_brl_cents+(SELECT coalesce(sum(x.historical_brl_cents),0) FROM package_freight_refund_sources x WHERE x.source_id=s.id AND NOT EXISTS(SELECT 1 FROM package_freight_refund_reversals v WHERE v.refund_id=x.refund_id))<=s.principal_brl_cents) BEGIN SELECT RAISE(ABORT,'freight refund source capacity exceeded'); END;

--> statement-breakpoint
CREATE TRIGGER freight_refund_reversal_dependency BEFORE INSERT ON package_freight_refund_reversals WHEN EXISTS(SELECT 1 FROM package_freight_refunds r JOIN hubbuy_balance_credit_shares s ON s.credit_entry_id=r.credit_entry_id JOIN hubbuy_balance_consumptions c ON c.credit_share_id=s.id WHERE r.id=NEW.refund_id AND c.debit_entry_id IS NOT NEW.debit_entry_id) BEGIN SELECT RAISE(ABORT,'freight refund credit already consumed'); END;

--> statement-breakpoint
DROP TRIGGER freight_protocol_charge_guard;

--> statement-breakpoint
CREATE TRIGGER freight_protocol_charge_guard BEFORE UPDATE OF freight_cents,freight_fee_cents,freight_paid_at,freight_state ON logistics_packages WHEN EXISTS(SELECT 1 FROM package_freight_heads h WHERE h.package_id=NEW.id) AND NOT ((EXISTS(SELECT 1 FROM package_freight_heads h JOIN package_freight_payments p ON p.id=h.payment_id WHERE h.package_id=NEW.id AND NEW.freight_state='known' AND NEW.freight_cents=p.principal_brl_cents-(SELECT coalesce(sum(r.historical_brl_cents),0) FROM package_freight_refunds r WHERE r.payment_id=p.id AND NOT EXISTS(SELECT 1 FROM package_freight_refund_reversals x WHERE x.refund_id=r.id)) AND NEW.freight_fee_cents=p.fee_brl_cents AND NEW.freight_paid_at IS NOT NULL)) OR (EXISTS(SELECT 1 FROM package_freight_heads h WHERE h.package_id=NEW.id AND h.payment_id IS NULL) AND NEW.freight_state='pending' AND NEW.freight_cents IS NULL AND NEW.freight_paid_at IS NULL)) BEGIN SELECT RAISE(ABORT,'FREIGHT_PROTOCOL_REQUIRED'); END;
