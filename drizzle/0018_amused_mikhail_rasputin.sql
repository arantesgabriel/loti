ALTER TABLE `hubbuy_accounts` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `hubbuy_accounts` ADD `deleted_by` text REFERENCES user(id);
--> statement-breakpoint
CREATE TRIGGER `hubbuy_account_tombstone_insert` BEFORE INSERT ON `hubbuy_accounts` WHEN NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL BEGIN SELECT RAISE(ABORT, 'new accounts cannot be deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_account_tombstone_update` BEFORE UPDATE ON `hubbuy_accounts` WHEN OLD.deleted_at IS NOT NULL OR NOT ((NEW.deleted_at IS NULL AND NEW.deleted_by IS NULL) OR (typeof(NEW.deleted_at) = 'integer' AND NEW.deleted_at > 0 AND NEW.deleted_by IS NOT NULL AND NEW.status = 'archived' AND NEW.balance_cny_minor = 0 AND NEW.revision = OLD.revision + 1 AND NEW.updated_by = NEW.deleted_by)) BEGIN SELECT RAISE(ABORT, 'invalid or immutable account tombstone'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_account_delete_eligibility` BEFORE UPDATE OF deleted_at ON `hubbuy_accounts` WHEN NEW.deleted_at IS NOT NULL AND (OLD.balance_cny_minor != 0 OR EXISTS (SELECT 1 FROM hubbuy_balance_entries r WHERE r.account_id = OLD.id) OR EXISTS (SELECT 1 FROM hubbuy_reconciliation_runs r WHERE r.account_id = OLD.id) OR EXISTS (SELECT 1 FROM hubbuy_reconciliation_events r WHERE r.account_id = OLD.id) OR EXISTS (SELECT 1 FROM purchase_cost_orders r WHERE r.account_id = OLD.id) OR EXISTS (SELECT 1 FROM purchase_packages r WHERE r.account_id = OLD.id) OR EXISTS (SELECT 1 FROM purchase_payment_components r WHERE r.source_account_id = OLD.id) OR EXISTS (SELECT 1 FROM purchase_cost_refunds r WHERE r.hubbuy_account_id = OLD.id) OR EXISTS (SELECT 1 FROM financial_operations o, json_tree(o.context_json) j WHERE j.type = 'text' AND j.atom = OLD.id AND o.operation_type NOT IN ('account_created','account_empty_activated_zero','account_archived')) OR EXISTS (SELECT 1 FROM purchase_cost_refund_events e, json_tree(e.details_json) j WHERE j.type = 'text' AND j.atom = OLD.id)) BEGIN SELECT RAISE(ABORT, 'account has balance, history or references'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_balance_entries_live_account_insert` BEFORE INSERT ON `hubbuy_balance_entries` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_balance_entries_live_account_update` BEFORE UPDATE OF account_id ON `hubbuy_balance_entries` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_reconciliation_runs_live_account_insert` BEFORE INSERT ON `hubbuy_reconciliation_runs` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_reconciliation_runs_live_account_update` BEFORE UPDATE OF account_id ON `hubbuy_reconciliation_runs` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_reconciliation_events_live_account_insert` BEFORE INSERT ON `hubbuy_reconciliation_events` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `hubbuy_reconciliation_events_live_account_update` BEFORE UPDATE OF account_id ON `hubbuy_reconciliation_events` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_cost_orders_live_account_insert` BEFORE INSERT ON `purchase_cost_orders` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_cost_orders_live_account_update` BEFORE UPDATE OF account_id ON `purchase_cost_orders` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_packages_live_account_insert` BEFORE INSERT ON `purchase_packages` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_packages_live_account_update` BEFORE UPDATE OF account_id ON `purchase_packages` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_payment_components_live_account_insert` BEFORE INSERT ON `purchase_payment_components` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.source_account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_payment_components_live_account_update` BEFORE UPDATE OF source_account_id ON `purchase_payment_components` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.source_account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_cost_refunds_live_account_insert` BEFORE INSERT ON `purchase_cost_refunds` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.hubbuy_account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_cost_refunds_live_account_update` BEFORE UPDATE OF hubbuy_account_id ON `purchase_cost_refunds` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a WHERE a.id = NEW.hubbuy_account_id AND a.deleted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `financial_operations_live_account_insert` BEFORE INSERT ON `financial_operations` WHEN NEW.operation_type != 'account_deleted' AND EXISTS (SELECT 1 FROM hubbuy_accounts a, json_tree(NEW.context_json) j WHERE a.deleted_at IS NOT NULL AND j.type = 'text' AND j.atom = a.id) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `refund_events_live_account_insert` BEFORE INSERT ON `purchase_cost_refund_events` WHEN EXISTS (SELECT 1 FROM hubbuy_accounts a, json_tree(NEW.details_json) j WHERE a.deleted_at IS NOT NULL AND j.type = 'text' AND j.atom = a.id) BEGIN SELECT RAISE(ABORT, 'account is deleted'); END;
