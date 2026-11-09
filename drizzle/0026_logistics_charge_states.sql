ALTER TABLE `logistics_packages` ADD `freight_state` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `logistics_packages` ADD `customs_state` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `logistics_packages` ADD `freight_payment_method` text;--> statement-breakpoint
ALTER TABLE `logistics_packages` ADD `freight_fee_bps` integer;
--> statement-breakpoint
UPDATE logistics_packages SET freight_state=CASE WHEN freight_cents IS NOT NULL THEN 'known' ELSE 'pending' END,customs_state=CASE WHEN customs_cents IS NOT NULL THEN 'known' ELSE 'pending' END;
--> statement-breakpoint
CREATE TRIGGER logistics_charge_state_guard BEFORE UPDATE ON logistics_packages WHEN
 NEW.freight_state NOT IN ('pending','known','no_charge') OR NEW.customs_state NOT IN ('pending','known','no_charge')
 OR (NEW.freight_state='known' AND NEW.freight_cents IS NULL) OR (NEW.freight_state!='known' AND NEW.freight_cents IS NOT NULL)
 OR (NEW.customs_state='known' AND NEW.customs_cents IS NULL) OR (NEW.customs_state!='known' AND NEW.customs_cents IS NOT NULL)
 OR (NEW.freight_fee_bps IS NOT NULL AND (typeof(NEW.freight_fee_bps)!='integer' OR NEW.freight_fee_bps NOT BETWEEN 0 AND 10000))
 BEGIN SELECT RAISE(ABORT,'LOGISTICS_CHARGE_STATE_INVALID'); END;
