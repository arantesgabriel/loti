CREATE TABLE `financial_operation_results` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`result_json` text NOT NULL,
	FOREIGN KEY (`operation_id`) REFERENCES `financial_operations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "financial_result_json" CHECK(json_valid("financial_operation_results"."result_json"))
);
--> statement-breakpoint
CREATE TABLE `package_freight_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`source_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`cost_item_id` text NOT NULL,
	`unit_index` integer NOT NULL,
	`person_id` text NOT NULL,
	`component` text NOT NULL,
	`amount_minor` integer NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `package_freight_payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `package_freight_sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cost_item_id`) REFERENCES `purchase_item_costs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "freight_allocation_amount" CHECK(typeof("package_freight_allocations"."amount_minor")='integer' AND "package_freight_allocations"."amount_minor" BETWEEN 1 AND 1000000000000 AND typeof("package_freight_allocations"."unit_index")='integer' AND "package_freight_allocations"."unit_index">=0 AND "package_freight_allocations"."component" IN ('native','historical','fee'))
);
--> statement-breakpoint
CREATE INDEX `freight_allocation_read_idx` ON `package_freight_allocations` (`payment_id`,`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `freight_allocation_cell_idx` ON `package_freight_allocations` (`payment_id`,`content_hash`,`source_id`,`cost_item_id`,`unit_index`,`person_id`,`component`);--> statement-breakpoint
CREATE TABLE `package_freight_heads` (
	`package_id` text PRIMARY KEY NOT NULL,
	`payment_id` text,
	FOREIGN KEY (`package_id`) REFERENCES `logistics_packages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `package_freight_payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `package_freight_heads_payment_id_unique` ON `package_freight_heads` (`payment_id`);--> statement-breakpoint
CREATE TABLE `package_freight_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`native_currency` text NOT NULL,
	`native_minor` integer NOT NULL,
	`principal_brl_cents` integer NOT NULL,
	`fee_brl_cents` integer NOT NULL,
	`content_hash` text NOT NULL,
	`content_json` text NOT NULL,
	`external_reference` text,
	`replaces_payment_id` text,
	FOREIGN KEY (`package_id`) REFERENCES `logistics_packages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `financial_operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`replaces_payment_id`) REFERENCES `package_freight_payments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "freight_payment_currency" CHECK("package_freight_payments"."native_currency" IN ('CNY','BRL')),
	CONSTRAINT "freight_payment_amounts" CHECK(typeof("package_freight_payments"."native_minor")='integer' AND "package_freight_payments"."native_minor" BETWEEN 1 AND 1000000000000 AND typeof("package_freight_payments"."principal_brl_cents")='integer' AND "package_freight_payments"."principal_brl_cents" BETWEEN 0 AND 1000000000000 AND typeof("package_freight_payments"."fee_brl_cents")='integer' AND "package_freight_payments"."fee_brl_cents" BETWEEN 0 AND 1000000000000 AND "package_freight_payments"."principal_brl_cents"+"package_freight_payments"."fee_brl_cents"<=1000000000000),
	CONSTRAINT "freight_payment_content" CHECK(json_valid("package_freight_payments"."content_json") AND length("package_freight_payments"."content_hash")=64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `package_freight_payments_operation_id_unique` ON `package_freight_payments` (`operation_id`);--> statement-breakpoint
CREATE INDEX `freight_payment_package_idx` ON `package_freight_payments` (`package_id`,`id`);--> statement-breakpoint
CREATE TABLE `package_freight_reversals` (
	`payment_id` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`credit_entry_id` text,
	FOREIGN KEY (`payment_id`) REFERENCES `package_freight_payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `financial_operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`credit_entry_id`) REFERENCES `hubbuy_balance_entries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `package_freight_reversals_operation_id_unique` ON `package_freight_reversals` (`operation_id`);--> statement-breakpoint
CREATE TABLE `package_freight_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`person_id` text NOT NULL,
	`kind` text NOT NULL,
	`native_minor` integer NOT NULL,
	`principal_brl_cents` integer NOT NULL,
	`fee_brl_cents` integer NOT NULL,
	`consumption_id` text,
	`fee_allocation_id` text,
	`fee_bps` integer,
	FOREIGN KEY (`payment_id`) REFERENCES `package_freight_payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`consumption_id`) REFERENCES `hubbuy_balance_consumptions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fee_allocation_id`) REFERENCES `topup_fee_allocations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "freight_source_amounts" CHECK(typeof("package_freight_sources"."native_minor")='integer' AND "package_freight_sources"."native_minor" BETWEEN 0 AND 1000000000000 AND typeof("package_freight_sources"."principal_brl_cents")='integer' AND "package_freight_sources"."principal_brl_cents" BETWEEN 0 AND 1000000000000 AND typeof("package_freight_sources"."fee_brl_cents")='integer' AND "package_freight_sources"."fee_brl_cents" BETWEEN 0 AND 1000000000000),
	CONSTRAINT "freight_source_origin" CHECK(("package_freight_sources"."kind"='balance' AND "package_freight_sources"."native_minor">0 AND "package_freight_sources"."consumption_id" IS NOT NULL AND "package_freight_sources"."fee_allocation_id" IS NULL AND "package_freight_sources"."fee_brl_cents"=0) OR ("package_freight_sources"."kind" IN ('pix','card') AND "package_freight_sources"."native_minor">0 AND "package_freight_sources"."principal_brl_cents">0 AND "package_freight_sources"."consumption_id" IS NULL AND "package_freight_sources"."fee_allocation_id" IS NULL) OR ("package_freight_sources"."kind"='topup_fee' AND "package_freight_sources"."native_minor"=0 AND "package_freight_sources"."principal_brl_cents"=0 AND "package_freight_sources"."fee_brl_cents">0 AND "package_freight_sources"."fee_allocation_id" IS NOT NULL AND "package_freight_sources"."consumption_id" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `package_freight_sources_consumption_id_unique` ON `package_freight_sources` (`consumption_id`);--> statement-breakpoint
CREATE INDEX `freight_source_payment_idx` ON `package_freight_sources` (`payment_id`);--> statement-breakpoint
CREATE TABLE `package_settlement_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`debtor_id` text NOT NULL,
	`creditor_id` text NOT NULL,
	`currency` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`component` text NOT NULL,
	`lineage_json` text NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `package_settlement_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`debtor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creditor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "settlement_claim_amount" CHECK("package_settlement_claims"."debtor_id"!="package_settlement_claims"."creditor_id" AND "package_settlement_claims"."currency" IN ('CNY','BRL') AND typeof("package_settlement_claims"."amount_minor")='integer' AND "package_settlement_claims"."amount_minor" BETWEEN 1 AND 1000000000000 AND json_valid("package_settlement_claims"."lineage_json"))
);
--> statement-breakpoint
CREATE INDEX `settlement_claim_version_idx` ON `package_settlement_claims` (`version_id`);--> statement-breakpoint
CREATE TABLE `package_settlement_receipt_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`amount_brl_cents` integer NOT NULL,
	FOREIGN KEY (`receipt_id`) REFERENCES `package_settlement_receipts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`claim_id`) REFERENCES `package_settlement_claims`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "receipt_allocation_amount" CHECK(typeof("package_settlement_receipt_allocations"."amount_brl_cents")='integer' AND "package_settlement_receipt_allocations"."amount_brl_cents" BETWEEN 1 AND 1000000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipt_claim_pair_idx` ON `package_settlement_receipt_allocations` (`receipt_id`,`claim_id`);--> statement-breakpoint
CREATE INDEX `receipt_claim_capacity_idx` ON `package_settlement_receipt_allocations` (`claim_id`);--> statement-breakpoint
CREATE TABLE `package_settlement_receipt_reversals` (
	`receipt_id` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	FOREIGN KEY (`receipt_id`) REFERENCES `package_settlement_receipts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `financial_operations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `package_settlement_receipt_reversals_operation_id_unique` ON `package_settlement_receipt_reversals` (`operation_id`);--> statement-breakpoint
CREATE TABLE `package_settlement_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`version_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`debtor_id` text NOT NULL,
	`creditor_id` text NOT NULL,
	`amount_brl_cents` integer NOT NULL,
	`excess_brl_cents` integer NOT NULL,
	`returns_receipt_id` text,
	`external_reference` text,
	FOREIGN KEY (`package_id`) REFERENCES `logistics_packages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `package_settlement_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `financial_operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`debtor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creditor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`returns_receipt_id`) REFERENCES `package_settlement_receipts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "settlement_receipt_amount" CHECK("package_settlement_receipts"."debtor_id"!="package_settlement_receipts"."creditor_id" AND typeof("package_settlement_receipts"."amount_brl_cents")='integer' AND "package_settlement_receipts"."amount_brl_cents" BETWEEN 1 AND 1000000000000 AND typeof("package_settlement_receipts"."excess_brl_cents")='integer' AND "package_settlement_receipts"."excess_brl_cents" BETWEEN 0 AND "package_settlement_receipts"."amount_brl_cents")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `package_settlement_receipts_operation_id_unique` ON `package_settlement_receipts` (`operation_id`);--> statement-breakpoint
CREATE INDEX `settlement_receipt_package_idx` ON `package_settlement_receipts` (`package_id`);--> statement-breakpoint
CREATE TABLE `package_settlement_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`previous_id` text,
	`content_hash` text NOT NULL,
	`policy` text NOT NULL,
	`centralizer_id` text,
	`from_cny_minor` integer,
	`to_brl_cents` integer,
	`pair_date` text,
	`pair_reason` text,
	`pair_topup_id` text,
	`snapshot_json` text NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `logistics_packages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `package_freight_payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `financial_operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`previous_id`) REFERENCES `package_settlement_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`centralizer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pair_topup_id`) REFERENCES `hubbuy_topups`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "settlement_version_policy" CHECK(("package_settlement_versions"."policy"='direct' AND "package_settlement_versions"."centralizer_id" IS NULL) OR ("package_settlement_versions"."policy"='centralized' AND "package_settlement_versions"."centralizer_id" IS NOT NULL)),
	CONSTRAINT "settlement_version_snapshot" CHECK(json_valid("package_settlement_versions"."snapshot_json") AND typeof("package_settlement_versions"."sequence")='integer' AND "package_settlement_versions"."sequence">0),
	CONSTRAINT "settlement_version_pair" CHECK(("package_settlement_versions"."from_cny_minor" IS NULL AND "package_settlement_versions"."to_brl_cents" IS NULL) OR (typeof("package_settlement_versions"."from_cny_minor")='integer' AND "package_settlement_versions"."from_cny_minor" BETWEEN 1 AND 1000000000000 AND typeof("package_settlement_versions"."to_brl_cents")='integer' AND "package_settlement_versions"."to_brl_cents" BETWEEN 1 AND 1000000000000 AND "package_settlement_versions"."pair_date" IS NOT NULL AND "package_settlement_versions"."pair_reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `package_settlement_versions_operation_id_unique` ON `package_settlement_versions` (`operation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `settlement_version_sequence_idx` ON `package_settlement_versions` (`package_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `topup_fee_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`topup_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`freight_payment_id` text,
	`order_id` text,
	`amount_brl_cents` integer NOT NULL,
	`reverses_id` text,
	FOREIGN KEY (`topup_id`) REFERENCES `hubbuy_topups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `financial_operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`freight_payment_id`) REFERENCES `package_freight_payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `purchase_cost_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reverses_id`) REFERENCES `topup_fee_allocations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "topup_fee_destination" CHECK(("topup_fee_allocations"."freight_payment_id" IS NOT NULL AND "topup_fee_allocations"."order_id" IS NULL) OR ("topup_fee_allocations"."freight_payment_id" IS NULL AND "topup_fee_allocations"."order_id" IS NOT NULL)),
	CONSTRAINT "topup_fee_amount" CHECK(typeof("topup_fee_allocations"."amount_brl_cents")='integer' AND "topup_fee_allocations"."amount_brl_cents" BETWEEN 1 AND 1000000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `topup_fee_allocations_reverses_id_unique` ON `topup_fee_allocations` (`reverses_id`);--> statement-breakpoint
CREATE INDEX `topup_fee_capacity_idx` ON `topup_fee_allocations` (`topup_id`);--> statement-breakpoint
CREATE INDEX `topup_fee_order_idx` ON `topup_fee_allocations` (`order_id`);--> statement-breakpoint
CREATE TABLE `topup_fee_funders` (
	`id` text PRIMARY KEY NOT NULL,
	`fee_allocation_id` text NOT NULL,
	`person_id` text NOT NULL,
	`amount_brl_cents` integer NOT NULL,
	FOREIGN KEY (`fee_allocation_id`) REFERENCES `topup_fee_allocations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "topup_fee_funder_amount" CHECK(typeof("topup_fee_funders"."amount_brl_cents")='integer' AND "topup_fee_funders"."amount_brl_cents" BETWEEN 1 AND 1000000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `topup_fee_funder_person_idx` ON `topup_fee_funders` (`fee_allocation_id`,`person_id`);--> statement-breakpoint
CREATE TABLE `topup_fee_order_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`fee_allocation_id` text NOT NULL,
	`cost_item_id` text NOT NULL,
	`person_id` text NOT NULL,
	`amount_brl_cents` integer NOT NULL,
	FOREIGN KEY (`fee_allocation_id`) REFERENCES `topup_fee_allocations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cost_item_id`) REFERENCES `purchase_item_costs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "topup_fee_share_amount" CHECK(typeof("topup_fee_order_shares"."amount_brl_cents")='integer' AND "topup_fee_order_shares"."amount_brl_cents" BETWEEN 1 AND 1000000000000)
);
--> statement-breakpoint
CREATE INDEX `topup_fee_item_idx` ON `topup_fee_order_shares` (`cost_item_id`);
--> statement-breakpoint
CREATE TRIGGER financial_operation_results_no_update BEFORE UPDATE ON financial_operation_results BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER financial_operation_results_no_delete BEFORE DELETE ON financial_operation_results BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER package_freight_payments_no_update BEFORE UPDATE ON package_freight_payments BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER package_freight_payments_no_delete BEFORE DELETE ON package_freight_payments BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER package_freight_reversals_no_update BEFORE UPDATE ON package_freight_reversals BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER package_freight_reversals_no_delete BEFORE DELETE ON package_freight_reversals BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER package_freight_sources_no_update BEFORE UPDATE ON package_freight_sources BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER package_freight_sources_no_delete BEFORE DELETE ON package_freight_sources BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER package_freight_allocations_no_update BEFORE UPDATE ON package_freight_allocations BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER package_freight_allocations_no_delete BEFORE DELETE ON package_freight_allocations BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER topup_fee_allocations_no_update BEFORE UPDATE ON topup_fee_allocations BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER topup_fee_allocations_no_delete BEFORE DELETE ON topup_fee_allocations BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER topup_fee_funders_no_update BEFORE UPDATE ON topup_fee_funders BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER topup_fee_funders_no_delete BEFORE DELETE ON topup_fee_funders BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER topup_fee_order_shares_no_update BEFORE UPDATE ON topup_fee_order_shares BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER topup_fee_order_shares_no_delete BEFORE DELETE ON topup_fee_order_shares BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER package_settlement_versions_no_update BEFORE UPDATE ON package_settlement_versions BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER package_settlement_versions_no_delete BEFORE DELETE ON package_settlement_versions BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER package_settlement_claims_no_update BEFORE UPDATE ON package_settlement_claims BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER package_settlement_claims_no_delete BEFORE DELETE ON package_settlement_claims BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER package_settlement_receipts_no_update BEFORE UPDATE ON package_settlement_receipts BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER package_settlement_receipts_no_delete BEFORE DELETE ON package_settlement_receipts BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER package_settlement_receipt_allocations_no_update BEFORE UPDATE ON package_settlement_receipt_allocations BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER package_settlement_receipt_allocations_no_delete BEFORE DELETE ON package_settlement_receipt_allocations BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER package_settlement_receipt_reversals_no_update BEFORE UPDATE ON package_settlement_receipt_reversals BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER package_settlement_receipt_reversals_no_delete BEFORE DELETE ON package_settlement_receipt_reversals BEGIN SELECT RAISE(ABORT,'financial records are append-only'); END;

--> statement-breakpoint
CREATE TRIGGER freight_head_scope_insert BEFORE INSERT ON package_freight_heads WHEN NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM package_freight_payments p WHERE p.id=NEW.payment_id AND p.package_id=NEW.package_id) BEGIN SELECT RAISE(ABORT,'freight head scope mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER freight_head_scope_update BEFORE UPDATE ON package_freight_heads WHEN NEW.package_id!=OLD.package_id OR (NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM package_freight_payments p WHERE p.id=NEW.payment_id AND p.package_id=NEW.package_id AND NOT EXISTS(SELECT 1 FROM package_freight_reversals r WHERE r.payment_id=p.id))) BEGIN SELECT RAISE(ABORT,'freight head scope mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER freight_head_no_delete BEFORE DELETE ON package_freight_heads BEGIN SELECT RAISE(ABORT,'freight protocol ownership is permanent'); END;

--> statement-breakpoint
CREATE TRIGGER freight_payment_scope BEFORE INSERT ON package_freight_payments WHEN NOT EXISTS(SELECT 1 FROM logistics_packages p JOIN hubbuy_accounts a ON a.id=p.account_id JOIN financial_operations o ON o.id=NEW.operation_id WHERE p.id=NEW.package_id AND p.workspace_id=o.workspace_id AND a.workspace_id=p.workspace_id AND a.deleted_at IS NULL AND a.status='active' AND o.operation_type='package_freight_payment') BEGIN SELECT RAISE(ABORT,'freight payment scope mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER freight_source_scope BEFORE INSERT ON package_freight_sources WHEN NOT EXISTS(SELECT 1 FROM package_freight_payments p JOIN logistics_packages g ON g.id=p.package_id JOIN workspaces w ON w.id=g.workspace_id WHERE p.id=NEW.payment_id AND ((w.kind='personal' AND w.owner_user_id=NEW.person_id) OR (w.kind='shared' AND EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=w.id AND m.user_id=NEW.person_id))) AND (NEW.kind!='balance' OR EXISTS(SELECT 1 FROM hubbuy_balance_consumptions c JOIN hubbuy_balance_credit_shares s ON s.id=c.credit_share_id JOIN hubbuy_balance_entries e ON e.id=s.credit_entry_id WHERE c.id=NEW.consumption_id AND e.account_id=g.account_id AND s.person_id=NEW.person_id AND c.amount_cny_minor=NEW.native_minor AND c.historical_brl_cents=NEW.principal_brl_cents AND c.payment_allocation_id IS NULL)) AND (NEW.kind!='topup_fee' OR EXISTS(SELECT 1 FROM topup_fee_allocations a JOIN topup_fee_funders x ON x.fee_allocation_id=a.id WHERE a.id=NEW.fee_allocation_id AND a.freight_payment_id=p.id AND x.person_id=NEW.person_id AND x.amount_brl_cents=NEW.fee_brl_cents))) BEGIN SELECT RAISE(ABORT,'freight source scope mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER freight_allocation_scope BEFORE INSERT ON package_freight_allocations WHEN NOT EXISTS(SELECT 1 FROM package_freight_sources s JOIN package_freight_payments p ON p.id=s.payment_id JOIN logistics_packages g ON g.id=p.package_id JOIN purchase_item_costs i ON i.id=NEW.cost_item_id JOIN purchase_cost_trackings t ON t.id=i.tracking_id WHERE s.id=NEW.source_id AND s.payment_id=NEW.payment_id AND t.workspace_id=g.workspace_id) BEGIN SELECT RAISE(ABORT,'freight allocation scope mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER topup_fee_capacity BEFORE INSERT ON topup_fee_allocations WHEN NOT EXISTS(SELECT 1 FROM hubbuy_topups t JOIN hubbuy_accounts a ON a.id=t.account_id JOIN financial_operations o ON o.id=NEW.operation_id WHERE t.id=NEW.topup_id AND a.workspace_id=o.workspace_id AND NOT EXISTS(SELECT 1 FROM hubbuy_topup_reversals r WHERE r.topup_id=t.id) AND ((NEW.reverses_id IS NULL AND NEW.amount_brl_cents+(SELECT coalesce(sum(CASE WHEN reverses_id IS NULL THEN amount_brl_cents ELSE -amount_brl_cents END),0) FROM topup_fee_allocations WHERE topup_id=t.id)<=t.fee_brl_cents) OR EXISTS(SELECT 1 FROM topup_fee_allocations old WHERE old.id=NEW.reverses_id AND old.topup_id=t.id AND old.reverses_id IS NULL AND old.amount_brl_cents=NEW.amount_brl_cents AND old.order_id IS NEW.order_id AND old.freight_payment_id IS NEW.freight_payment_id)) AND ((NEW.order_id IS NOT NULL AND EXISTS(SELECT 1 FROM purchase_cost_orders d JOIN purchase_cost_trackings c ON c.id=d.tracking_id WHERE d.id=NEW.order_id AND d.account_id=a.id AND c.workspace_id=a.workspace_id)) OR (NEW.freight_payment_id IS NOT NULL AND EXISTS(SELECT 1 FROM package_freight_payments p JOIN logistics_packages g ON g.id=p.package_id WHERE p.id=NEW.freight_payment_id AND g.account_id=a.id AND g.workspace_id=a.workspace_id)))) BEGIN SELECT RAISE(ABORT,'topup fee capacity or destination mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER topup_reversal_fee_dependency BEFORE INSERT ON hubbuy_topup_reversals WHEN (SELECT coalesce(sum(CASE WHEN reverses_id IS NULL THEN amount_brl_cents ELSE -amount_brl_cents END),0) FROM topup_fee_allocations WHERE topup_id=NEW.topup_id)>0 BEGIN SELECT RAISE(ABORT,'topup fee has dependent destinations'); END;

--> statement-breakpoint
CREATE TRIGGER receipt_allocation_capacity BEFORE INSERT ON package_settlement_receipt_allocations WHEN NOT EXISTS(SELECT 1 FROM package_settlement_receipts r JOIN package_settlement_claims c ON c.id=NEW.claim_id WHERE r.id=NEW.receipt_id AND r.version_id=c.version_id AND c.currency='BRL' AND r.debtor_id=c.debtor_id AND r.creditor_id=c.creditor_id AND NEW.amount_brl_cents+(SELECT coalesce(sum(a.amount_brl_cents),0) FROM package_settlement_receipt_allocations a WHERE a.claim_id=c.id AND NOT EXISTS(SELECT 1 FROM package_settlement_receipt_reversals x WHERE x.receipt_id=a.receipt_id))<=c.amount_minor AND NEW.amount_brl_cents+(SELECT coalesce(sum(a.amount_brl_cents),0) FROM package_settlement_receipt_allocations a WHERE a.receipt_id=r.id)<=r.amount_brl_cents-r.excess_brl_cents) BEGIN SELECT RAISE(ABORT,'settlement capacity exceeded'); END;

--> statement-breakpoint
CREATE TRIGGER settlement_version_scope BEFORE INSERT ON package_settlement_versions WHEN NOT EXISTS(SELECT 1 FROM package_freight_payments p JOIN logistics_packages g ON g.id=p.package_id JOIN financial_operations o ON o.id=NEW.operation_id JOIN workspaces w ON w.id=g.workspace_id WHERE p.id=NEW.payment_id AND p.package_id=NEW.package_id AND o.workspace_id=g.workspace_id AND w.kind='shared') BEGIN SELECT RAISE(ABORT,'settlement version scope mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER settlement_claim_scope BEFORE INSERT ON package_settlement_claims WHEN NOT EXISTS(SELECT 1 FROM package_settlement_versions v JOIN logistics_packages p ON p.id=v.package_id JOIN workspace_members a ON a.workspace_id=p.workspace_id AND a.user_id=NEW.debtor_id JOIN workspace_members b ON b.workspace_id=p.workspace_id AND b.user_id=NEW.creditor_id WHERE v.id=NEW.version_id) BEGIN SELECT RAISE(ABORT,'settlement claim scope mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER settlement_receipt_scope BEFORE INSERT ON package_settlement_receipts WHEN NOT EXISTS(SELECT 1 FROM package_settlement_versions v JOIN logistics_packages p ON p.id=v.package_id JOIN financial_operations o ON o.id=NEW.operation_id JOIN workspace_members a ON a.workspace_id=p.workspace_id AND a.user_id=NEW.debtor_id JOIN workspace_members b ON b.workspace_id=p.workspace_id AND b.user_id=NEW.creditor_id WHERE v.id=NEW.version_id AND v.package_id=NEW.package_id AND o.workspace_id=p.workspace_id) BEGIN SELECT RAISE(ABORT,'settlement receipt scope mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER freight_protocol_charge_guard BEFORE UPDATE OF freight_cents,freight_fee_cents,freight_paid_at,freight_state ON logistics_packages WHEN EXISTS(SELECT 1 FROM package_freight_heads h WHERE h.package_id=NEW.id) AND NOT ((EXISTS(SELECT 1 FROM package_freight_heads h JOIN package_freight_payments p ON p.id=h.payment_id WHERE h.package_id=NEW.id AND NEW.freight_state='known' AND NEW.freight_cents=p.principal_brl_cents AND NEW.freight_fee_cents=p.fee_brl_cents AND NEW.freight_paid_at IS NOT NULL)) OR (EXISTS(SELECT 1 FROM package_freight_heads h WHERE h.package_id=NEW.id AND h.payment_id IS NULL) AND NEW.freight_state='pending' AND NEW.freight_cents IS NULL AND NEW.freight_paid_at IS NULL)) BEGIN SELECT RAISE(ABORT,'FREIGHT_PROTOCOL_REQUIRED'); END;

--> statement-breakpoint
CREATE TRIGGER freight_legacy_charge_guard BEFORE UPDATE ON purchase_cost_charges WHEN OLD.charge_type='brazil_freight' AND EXISTS(SELECT 1 FROM logistics_packages p JOIN package_freight_heads h ON h.package_id=p.id WHERE p.legacy_package_id=OLD.package_id) BEGIN SELECT RAISE(ABORT,'FREIGHT_PROTOCOL_REQUIRED'); END;
