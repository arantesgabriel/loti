CREATE TABLE `purchase_additional_order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`source_favorite_id` text,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`platform` text NOT NULL,
	`visual_key` text NOT NULL,
	`variant` text,
	`notes` text,
	`quantity` integer NOT NULL,
	`item_order` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `purchase_cost_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_favorite_id`) REFERENCES `favorites`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "additional_order_item_name" CHECK(length(trim("purchase_additional_order_items"."name")) BETWEEN 1 AND 200),
	CONSTRAINT "additional_order_item_quantity" CHECK(typeof("purchase_additional_order_items"."quantity") = 'integer' AND "purchase_additional_order_items"."quantity" BETWEEN 1 AND 10000),
	CONSTRAINT "additional_order_item_order" CHECK(typeof("purchase_additional_order_items"."item_order") = 'integer' AND "purchase_additional_order_items"."item_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `additional_order_item_order_idx` ON `purchase_additional_order_items` (`order_id`,`item_order`);--> statement-breakpoint
CREATE INDEX `additional_order_item_favorite_idx` ON `purchase_additional_order_items` (`source_favorite_id`);--> statement-breakpoint
CREATE TABLE `purchase_cost_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`tracking_id` text NOT NULL,
	`kind` text NOT NULL,
	`account_id` text,
	`external_reference` text,
	`state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	`occurred_at` integer,
	`recorded_at` integer,
	`operation_id` text,
	FOREIGN KEY (`tracking_id`) REFERENCES `purchase_cost_trackings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `hubbuy_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `financial_operations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cost_order_kind" CHECK("purchase_cost_orders"."kind" IN ('original','additional')),
	CONSTRAINT "cost_order_state" CHECK(("purchase_cost_orders"."kind" = 'original' AND "purchase_cost_orders"."state" = 'recorded') OR ("purchase_cost_orders"."kind" = 'additional' AND "purchase_cost_orders"."state" IN ('draft','recorded','voided'))),
	CONSTRAINT "cost_order_revision" CHECK(typeof("purchase_cost_orders"."revision") = 'integer' AND "purchase_cost_orders"."revision" >= 0),
	CONSTRAINT "cost_order_external_reference" CHECK("purchase_cost_orders"."external_reference" IS NULL OR length(trim("purchase_cost_orders"."external_reference")) BETWEEN 1 AND 200),
	CONSTRAINT "cost_order_recorded" CHECK(("purchase_cost_orders"."state" = 'recorded' AND ("purchase_cost_orders"."recorded_at" IS NOT NULL OR ("purchase_cost_orders"."kind" = 'original' AND "purchase_cost_orders"."account_id" IS NULL AND "purchase_cost_orders"."operation_id" IS NULL))) OR ("purchase_cost_orders"."state" != 'recorded' AND "purchase_cost_orders"."recorded_at" IS NULL))
);
--> statement-breakpoint
INSERT INTO `purchase_cost_orders`("id", "tracking_id", "kind", "account_id", "external_reference", "state", "revision", "created_by", "created_at", "updated_by", "updated_at", "occurred_at", "recorded_at", "operation_id")
SELECT 'legacy:' || `id`, `id`, 'original', NULL, NULL, 'recorded', 0, `created_by`, `created_at`, `updated_by`, `updated_at`, NULL, NULL, NULL FROM `purchase_cost_trackings`;
--> statement-breakpoint
CREATE UNIQUE INDEX `cost_order_original_idx` ON `purchase_cost_orders` (`tracking_id`) WHERE "purchase_cost_orders"."kind" = 'original';--> statement-breakpoint
CREATE UNIQUE INDEX `cost_order_external_reference_idx` ON `purchase_cost_orders` (`account_id`,`external_reference`) WHERE "purchase_cost_orders"."external_reference" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `cost_order_tracking_idx` ON `purchase_cost_orders` (`tracking_id`,`state`,`created_at`);--> statement-breakpoint
CREATE TABLE `purchase_payment_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`component_id` text NOT NULL,
	`cost_item_id` text NOT NULL,
	`cost_component` text NOT NULL,
	`person_id` text NOT NULL,
	`allocation_order` integer NOT NULL,
	`cny_minor` integer NOT NULL,
	`principal_brl_cents` integer NOT NULL,
	`fee_brl_cents` integer NOT NULL,
	`historical_brl_cents` integer NOT NULL,
	FOREIGN KEY (`component_id`) REFERENCES `purchase_payment_components`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cost_item_id`) REFERENCES `purchase_item_costs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payment_allocation_order" CHECK(typeof("purchase_payment_allocations"."allocation_order") = 'integer' AND "purchase_payment_allocations"."allocation_order" >= 0),
	CONSTRAINT "payment_allocation_cny" CHECK(typeof("purchase_payment_allocations"."cny_minor") = 'integer' AND "purchase_payment_allocations"."cny_minor" BETWEEN 1 AND 1000000000000),
	CONSTRAINT "payment_allocation_brl" CHECK(typeof("purchase_payment_allocations"."principal_brl_cents") = 'integer' AND "purchase_payment_allocations"."principal_brl_cents" BETWEEN 0 AND 1000000000000 AND typeof("purchase_payment_allocations"."fee_brl_cents") = 'integer' AND "purchase_payment_allocations"."fee_brl_cents" BETWEEN 0 AND 1000000000000 AND typeof("purchase_payment_allocations"."historical_brl_cents") = 'integer' AND "purchase_payment_allocations"."historical_brl_cents" BETWEEN 0 AND 1000000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_allocation_person_idx` ON `purchase_payment_allocations` (`component_id`,`cost_item_id`,`cost_component`,`person_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_allocation_order_idx` ON `purchase_payment_allocations` (`component_id`,`allocation_order`);--> statement-breakpoint
CREATE INDEX `payment_allocation_cost_item_idx` ON `purchase_payment_allocations` (`cost_item_id`,`cost_component`);--> statement-breakpoint
CREATE TABLE `purchase_payment_components` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`charge_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`component_order` integer NOT NULL,
	`source_type` text NOT NULL,
	`source_currency` text NOT NULL,
	`source_account_id` text,
	`principal_amount_minor` integer NOT NULL,
	`cny_minor` integer NOT NULL,
	`principal_brl_cents` integer NOT NULL,
	`fee_bps` integer NOT NULL,
	`fee_brl_cents` integer NOT NULL,
	`conversion_cny_minor` integer,
	`conversion_brl_cents` integer,
	`confirmed_by` text NOT NULL,
	`confirmed_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `purchase_cost_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`charge_id`) REFERENCES `purchase_cost_charges`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `financial_operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_account_id`) REFERENCES `hubbuy_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`confirmed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payment_component_order" CHECK(typeof("purchase_payment_components"."component_order") = 'integer' AND "purchase_payment_components"."component_order" >= 0),
	CONSTRAINT "payment_component_source" CHECK("purchase_payment_components"."source_type" IN ('balance','pix','card')),
	CONSTRAINT "payment_component_source_amount" CHECK(typeof("purchase_payment_components"."principal_amount_minor") = 'integer' AND "purchase_payment_components"."principal_amount_minor" BETWEEN 1 AND 1000000000000 AND typeof("purchase_payment_components"."cny_minor") = 'integer' AND "purchase_payment_components"."cny_minor" BETWEEN 1 AND 1000000000000),
	CONSTRAINT "payment_component_brl" CHECK(typeof("purchase_payment_components"."principal_brl_cents") = 'integer' AND "purchase_payment_components"."principal_brl_cents" BETWEEN 0 AND 1000000000000 AND typeof("purchase_payment_components"."fee_brl_cents") = 'integer' AND "purchase_payment_components"."fee_brl_cents" BETWEEN 0 AND 1000000000000),
	CONSTRAINT "payment_component_fee" CHECK(typeof("purchase_payment_components"."fee_bps") = 'integer' AND "purchase_payment_components"."fee_bps" BETWEEN 0 AND 10000),
	CONSTRAINT "payment_component_conversion" CHECK(("purchase_payment_components"."conversion_cny_minor" IS NULL AND "purchase_payment_components"."conversion_brl_cents" IS NULL) OR (typeof("purchase_payment_components"."conversion_cny_minor") = 'integer' AND "purchase_payment_components"."conversion_cny_minor" BETWEEN 1 AND 1000000000000 AND typeof("purchase_payment_components"."conversion_brl_cents") = 'integer' AND "purchase_payment_components"."conversion_brl_cents" BETWEEN 1 AND 1000000000000)),
	CONSTRAINT "payment_component_balance" CHECK(("purchase_payment_components"."source_type" = 'balance' AND "purchase_payment_components"."source_currency" = 'CNY' AND "purchase_payment_components"."source_account_id" IS NOT NULL AND "purchase_payment_components"."fee_bps" = 0 AND "purchase_payment_components"."fee_brl_cents" = 0 AND "purchase_payment_components"."principal_amount_minor" = "purchase_payment_components"."cny_minor") OR ("purchase_payment_components"."source_type" IN ('pix','card') AND "purchase_payment_components"."source_currency" = 'BRL' AND "purchase_payment_components"."source_account_id" IS NULL AND "purchase_payment_components"."principal_amount_minor" = "purchase_payment_components"."principal_brl_cents" AND ("purchase_payment_components"."conversion_cny_minor" IS NOT NULL)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_component_order_idx` ON `purchase_payment_components` (`order_id`,`component_order`);--> statement-breakpoint
CREATE INDEX `payment_component_charge_idx` ON `purchase_payment_components` (`charge_id`,`component_order`);--> statement-breakpoint
CREATE INDEX `payment_component_operation_idx` ON `purchase_payment_components` (`operation_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_purchase_cost_charges` (
	`id` text PRIMARY KEY NOT NULL,
	`tracking_id` text NOT NULL,
	`order_id` text,
	`package_id` text,
	`charge_type` text NOT NULL,
	`payment_model` text DEFAULT 'legacy_single' NOT NULL,
	`value_state` text,
	`amount_cents` integer,
	`payment_method` text,
	`fee_bps` integer,
	`payment_status` text DEFAULT 'pending' NOT NULL,
	`paid_by` text,
	`paid_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tracking_id`) REFERENCES `purchase_cost_trackings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `purchase_cost_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`package_id`) REFERENCES `purchase_packages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`paid_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cost_charge_package_scope" CHECK(("__new_purchase_cost_charges"."charge_type" = 'products' AND "__new_purchase_cost_charges"."order_id" IS NOT NULL AND "__new_purchase_cost_charges"."package_id" IS NULL AND "__new_purchase_cost_charges"."value_state" IS NULL AND "__new_purchase_cost_charges"."amount_cents" IS NULL) OR ("__new_purchase_cost_charges"."charge_type" IN ('brazil_freight','customs') AND "__new_purchase_cost_charges"."order_id" IS NULL AND "__new_purchase_cost_charges"."package_id" IS NOT NULL)),
	CONSTRAINT "cost_charge_value_state" CHECK("__new_purchase_cost_charges"."charge_type" = 'products' OR ("__new_purchase_cost_charges"."value_state" = 'known' AND typeof("__new_purchase_cost_charges"."amount_cents") = 'integer' AND "__new_purchase_cost_charges"."amount_cents" BETWEEN 0 AND 1000000000000) OR ("__new_purchase_cost_charges"."value_state" IN ('pending','no_charge') AND "__new_purchase_cost_charges"."amount_cents" IS NULL)),
	CONSTRAINT "cost_charge_fee" CHECK(("__new_purchase_cost_charges"."fee_bps" IS NULL AND "__new_purchase_cost_charges"."payment_method" IS NULL) OR (typeof("__new_purchase_cost_charges"."fee_bps") = 'integer' AND "__new_purchase_cost_charges"."fee_bps" BETWEEN 0 AND 10000 AND "__new_purchase_cost_charges"."payment_method" IN ('pix','card'))),
	CONSTRAINT "cost_charge_customs_fee" CHECK("__new_purchase_cost_charges"."charge_type" != 'customs' OR ("__new_purchase_cost_charges"."fee_bps" IS NULL AND "__new_purchase_cost_charges"."payment_method" IS NULL)),
	CONSTRAINT "cost_charge_paid" CHECK(("__new_purchase_cost_charges"."payment_status" = 'pending' AND "__new_purchase_cost_charges"."paid_at" IS NULL AND "__new_purchase_cost_charges"."paid_by" IS NULL) OR ("__new_purchase_cost_charges"."payment_status" = 'paid' AND "__new_purchase_cost_charges"."paid_at" IS NOT NULL AND "__new_purchase_cost_charges"."paid_by" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_purchase_cost_charges`("id", "tracking_id", "order_id", "package_id", "charge_type", "payment_model", "value_state", "amount_cents", "payment_method", "fee_bps", "payment_status", "paid_by", "paid_at", "created_at", "updated_at")
SELECT `charge`.`id`, `charge`.`tracking_id`, CASE WHEN `charge`.`charge_type` = 'products' THEN 'legacy:' || `charge`.`tracking_id` ELSE NULL END, `charge`.`package_id`, `charge`.`charge_type`, 'legacy_single', `charge`.`value_state`, `charge`.`amount_cents`, `charge`.`payment_method`, `charge`.`fee_bps`, `charge`.`payment_status`, `charge`.`paid_by`, `charge`.`paid_at`, `charge`.`created_at`, `charge`.`updated_at` FROM `purchase_cost_charges` AS `charge`;--> statement-breakpoint
DROP TABLE `purchase_cost_charges`;--> statement-breakpoint
ALTER TABLE `__new_purchase_cost_charges` RENAME TO `purchase_cost_charges`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `cost_charge_products_order_idx` ON `purchase_cost_charges` (`order_id`) WHERE "purchase_cost_charges"."charge_type" = 'products';--> statement-breakpoint
CREATE UNIQUE INDEX `cost_charge_package_type_idx` ON `purchase_cost_charges` (`package_id`,`charge_type`) WHERE "purchase_cost_charges"."charge_type" IN ('brazil_freight','customs');--> statement-breakpoint
CREATE INDEX `cost_charge_tracking_idx` ON `purchase_cost_charges` (`tracking_id`,`charge_type`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_purchase_item_costs` (
	`id` text PRIMARY KEY NOT NULL,
	`tracking_id` text NOT NULL,
	`order_id` text NOT NULL,
	`purchase_item_id` text,
	`additional_order_item_id` text,
	`item_order` integer NOT NULL,
	`effective_price_state` text NOT NULL,
	`effective_price_unit_cents` integer,
	`china_freight_state` text DEFAULT 'pending' NOT NULL,
	`china_freight_unit_cents` integer,
	`native_product_state` text DEFAULT 'unknown' NOT NULL,
	`native_product_cny_minor` integer,
	`native_china_state` text DEFAULT 'unknown' NOT NULL,
	`native_china_cny_minor` integer,
	`valuation_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`tracking_id`) REFERENCES `purchase_cost_trackings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `purchase_cost_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_item_id`) REFERENCES `purchase_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`additional_order_item_id`) REFERENCES `purchase_additional_order_items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cost_item_origin" CHECK(("__new_purchase_item_costs"."purchase_item_id" IS NOT NULL AND "__new_purchase_item_costs"."additional_order_item_id" IS NULL) OR ("__new_purchase_item_costs"."purchase_item_id" IS NULL AND "__new_purchase_item_costs"."additional_order_item_id" IS NOT NULL)),
	CONSTRAINT "cost_item_order" CHECK(typeof("__new_purchase_item_costs"."item_order") = 'integer' AND "__new_purchase_item_costs"."item_order" >= 0),
	CONSTRAINT "cost_item_effective_price_state" CHECK(("__new_purchase_item_costs"."effective_price_state" = 'known' AND typeof("__new_purchase_item_costs"."effective_price_unit_cents") = 'integer' AND "__new_purchase_item_costs"."effective_price_unit_cents" BETWEEN 0 AND 1000000000000) OR ("__new_purchase_item_costs"."effective_price_state" IN ('pending','no_charge') AND "__new_purchase_item_costs"."effective_price_unit_cents" IS NULL)),
	CONSTRAINT "cost_item_china_freight_state" CHECK(("__new_purchase_item_costs"."china_freight_state" = 'known' AND typeof("__new_purchase_item_costs"."china_freight_unit_cents") = 'integer' AND "__new_purchase_item_costs"."china_freight_unit_cents" BETWEEN 0 AND 1000000000000) OR ("__new_purchase_item_costs"."china_freight_state" IN ('pending','no_charge') AND "__new_purchase_item_costs"."china_freight_unit_cents" IS NULL)),
	CONSTRAINT "cost_item_native_product_state" CHECK(("__new_purchase_item_costs"."native_product_state" = 'known' AND typeof("__new_purchase_item_costs"."native_product_cny_minor") = 'integer' AND "__new_purchase_item_costs"."native_product_cny_minor" BETWEEN 0 AND 1000000000000) OR ("__new_purchase_item_costs"."native_product_state" IN ('unknown','no_charge') AND "__new_purchase_item_costs"."native_product_cny_minor" IS NULL)),
	CONSTRAINT "cost_item_native_china_state" CHECK(("__new_purchase_item_costs"."native_china_state" = 'known' AND typeof("__new_purchase_item_costs"."native_china_cny_minor") = 'integer' AND "__new_purchase_item_costs"."native_china_cny_minor" BETWEEN 0 AND 1000000000000) OR ("__new_purchase_item_costs"."native_china_state" IN ('unknown','no_charge') AND "__new_purchase_item_costs"."native_china_cny_minor" IS NULL)),
	CONSTRAINT "cost_item_valuation_version" CHECK(typeof("__new_purchase_item_costs"."valuation_version") = 'integer' AND "__new_purchase_item_costs"."valuation_version" IN (1,2))
);
--> statement-breakpoint
INSERT INTO `__new_purchase_item_costs`("id", "tracking_id", "order_id", "purchase_item_id", "additional_order_item_id", "item_order", "effective_price_state", "effective_price_unit_cents", "china_freight_state", "china_freight_unit_cents", "native_product_state", "native_product_cny_minor", "native_china_state", "native_china_cny_minor", "valuation_version")
SELECT `cost`.`id`, `cost`.`tracking_id`, 'legacy:' || `cost`.`tracking_id`, `cost`.`purchase_item_id`, NULL, `cost`.`item_order`, `cost`.`effective_price_state`, `cost`.`effective_price_unit_cents`, `cost`.`china_freight_state`, `cost`.`china_freight_unit_cents`, 'unknown', NULL, 'unknown', NULL, 1 FROM `purchase_item_costs` AS `cost`;--> statement-breakpoint
DROP TABLE `purchase_item_costs`;--> statement-breakpoint
ALTER TABLE `__new_purchase_item_costs` RENAME TO `purchase_item_costs`;--> statement-breakpoint
CREATE UNIQUE INDEX `cost_item_tracking_item_idx` ON `purchase_item_costs` (`tracking_id`,`purchase_item_id`) WHERE "purchase_item_costs"."purchase_item_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `cost_item_additional_order_idx` ON `purchase_item_costs` (`tracking_id`,`additional_order_item_id`) WHERE "purchase_item_costs"."additional_order_item_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `cost_item_tracking_order_idx` ON `purchase_item_costs` (`tracking_id`,`order_id`,`item_order`);--> statement-breakpoint
CREATE INDEX `cost_item_order_idx` ON `purchase_item_costs` (`order_id`,`item_order`);--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_purchase_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`tracking_id` text NOT NULL,
	`name` text NOT NULL,
	`package_order` integer NOT NULL,
	`logistics_status` text DEFAULT 'preparing' NOT NULL,
	`account_id` text,
	`content_revision` integer DEFAULT 0 NOT NULL,
	`content_sealed_at` integer,
	`content_sealed_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tracking_id`) REFERENCES `purchase_cost_trackings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `hubbuy_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`content_sealed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cost_package_name" CHECK(length(trim("__new_purchase_packages"."name")) > 0),
	CONSTRAINT "cost_package_order" CHECK(typeof("__new_purchase_packages"."package_order") = 'integer' AND "__new_purchase_packages"."package_order" >= 0),
	CONSTRAINT "cost_package_logistics" CHECK("__new_purchase_packages"."logistics_status" IN ('preparing','sent','received')),
	CONSTRAINT "cost_package_content_revision" CHECK(typeof("__new_purchase_packages"."content_revision") = 'integer' AND "__new_purchase_packages"."content_revision" >= 0),
	CONSTRAINT "cost_package_content_seal" CHECK(("__new_purchase_packages"."content_sealed_at" IS NULL AND "__new_purchase_packages"."content_sealed_by" IS NULL) OR ("__new_purchase_packages"."content_sealed_at" IS NOT NULL AND "__new_purchase_packages"."content_sealed_by" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_purchase_packages`("id", "tracking_id", "name", "package_order", "logistics_status", "account_id", "content_revision", "content_sealed_at", "content_sealed_by", "created_at", "updated_at") SELECT "id", "tracking_id", "name", "package_order", "logistics_status", NULL, 0, NULL, NULL, "created_at", "updated_at" FROM `purchase_packages`;--> statement-breakpoint
DROP TABLE `purchase_packages`;--> statement-breakpoint
ALTER TABLE `__new_purchase_packages` RENAME TO `purchase_packages`;--> statement-breakpoint
CREATE INDEX `cost_package_tracking_idx` ON `purchase_packages` (`tracking_id`,`package_order`);--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hubbuy_balance_consumptions` (
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
	FOREIGN KEY (`payment_allocation_id`) REFERENCES `purchase_payment_allocations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "hubbuy_consumption_order" CHECK(typeof("__new_hubbuy_balance_consumptions"."allocation_order") = 'integer' AND "__new_hubbuy_balance_consumptions"."allocation_order" >= 0),
	CONSTRAINT "hubbuy_consumption_cny" CHECK(typeof("__new_hubbuy_balance_consumptions"."amount_cny_minor") = 'integer' AND "__new_hubbuy_balance_consumptions"."amount_cny_minor" BETWEEN 1 AND 1000000000000),
	CONSTRAINT "hubbuy_consumption_brl" CHECK(typeof("__new_hubbuy_balance_consumptions"."historical_brl_cents") = 'integer' AND "__new_hubbuy_balance_consumptions"."historical_brl_cents" BETWEEN 0 AND 1000000000000)
);
--> statement-breakpoint
INSERT INTO `__new_hubbuy_balance_consumptions`("id", "debit_entry_id", "credit_share_id", "allocation_order", "amount_cny_minor", "historical_brl_cents", "payment_allocation_id", "created_at") SELECT "id", "debit_entry_id", "credit_share_id", "allocation_order", "amount_cny_minor", "historical_brl_cents", "payment_allocation_id", "created_at" FROM `hubbuy_balance_consumptions`;--> statement-breakpoint
DROP TABLE `hubbuy_balance_consumptions`;--> statement-breakpoint
ALTER TABLE `__new_hubbuy_balance_consumptions` RENAME TO `hubbuy_balance_consumptions`;--> statement-breakpoint
CREATE UNIQUE INDEX `hubbuy_consumption_order_idx` ON `hubbuy_balance_consumptions` (`debit_entry_id`,`allocation_order`);--> statement-breakpoint
CREATE INDEX `hubbuy_consumption_share_idx` ON `hubbuy_balance_consumptions` (`credit_share_id`);--> statement-breakpoint
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
PRAGMA foreign_keys=ON;
--> statement-breakpoint
CREATE TRIGGER `purchase_payment_component_no_update` BEFORE UPDATE ON `purchase_payment_components` BEGIN SELECT RAISE(ABORT, 'payment components are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_payment_component_no_delete` BEFORE DELETE ON `purchase_payment_components` BEGIN SELECT RAISE(ABORT, 'payment components are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_payment_allocation_no_update` BEFORE UPDATE ON `purchase_payment_allocations` BEGIN SELECT RAISE(ABORT, 'payment allocations are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_payment_allocation_no_delete` BEFORE DELETE ON `purchase_payment_allocations` BEGIN SELECT RAISE(ABORT, 'payment allocations are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_payment_allocation_capacity_guard` BEFORE INSERT ON `purchase_payment_allocations`
WHEN NOT EXISTS (
  SELECT 1 FROM `purchase_payment_components` c
  JOIN `purchase_cost_orders` o ON o.id = c.order_id
  JOIN `purchase_cost_trackings` t ON t.id = o.tracking_id
  JOIN `workspace_members` m ON m.workspace_id = t.workspace_id AND m.user_id = NEW.person_id
  JOIN `purchase_item_costs` i ON i.id = NEW.cost_item_id AND i.order_id = c.order_id
  WHERE c.id = NEW.component_id
    AND ((NEW.cost_component = 'product' AND i.native_product_state = 'known' AND COALESCE((SELECT SUM(cny_minor) FROM `purchase_payment_allocations` WHERE cost_item_id = NEW.cost_item_id AND cost_component = NEW.cost_component), 0) + NEW.cny_minor <= i.native_product_cny_minor)
      OR (NEW.cost_component = 'china' AND i.native_china_state = 'known' AND COALESCE((SELECT SUM(cny_minor) FROM `purchase_payment_allocations` WHERE cost_item_id = NEW.cost_item_id AND cost_component = NEW.cost_component), 0) + NEW.cny_minor <= i.native_china_cny_minor))
)
BEGIN SELECT RAISE(ABORT, 'payment allocation exceeds item capacity or workspace membership'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_cost_order_recorded_no_update` BEFORE UPDATE ON `purchase_cost_orders`
WHEN OLD.state = 'recorded' AND (NEW.tracking_id IS NOT OLD.tracking_id OR NEW.kind IS NOT OLD.kind OR NEW.account_id IS NOT OLD.account_id OR NEW.external_reference IS NOT OLD.external_reference OR NEW.state IS NOT OLD.state OR NEW.occurred_at IS NOT OLD.occurred_at OR NEW.recorded_at IS NOT OLD.recorded_at OR NEW.operation_id IS NOT OLD.operation_id OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at)
BEGIN SELECT RAISE(ABORT, 'recorded purchase orders are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_cost_order_recorded_no_delete` BEFORE DELETE ON `purchase_cost_orders` WHEN OLD.state = 'recorded' BEGIN SELECT RAISE(ABORT, 'recorded purchase orders are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `additional_order_item_recorded_no_update` BEFORE UPDATE ON `purchase_additional_order_items`
WHEN EXISTS (SELECT 1 FROM `purchase_cost_orders` o WHERE o.id = OLD.order_id AND o.state != 'draft')
BEGIN SELECT RAISE(ABORT, 'recorded order item snapshots are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `additional_order_item_recorded_no_delete` BEFORE DELETE ON `purchase_additional_order_items`
WHEN EXISTS (SELECT 1 FROM `purchase_cost_orders` o WHERE o.id = OLD.order_id AND o.state != 'draft')
BEGIN SELECT RAISE(ABORT, 'recorded order item snapshots are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `additional_order_cost_recorded_no_update` BEFORE UPDATE ON `purchase_item_costs`
WHEN EXISTS (SELECT 1 FROM `purchase_cost_orders` o WHERE o.id = OLD.order_id AND o.kind = 'additional' AND o.state != 'draft')
BEGIN SELECT RAISE(ABORT, 'recorded order costs are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `additional_order_cost_recorded_no_delete` BEFORE DELETE ON `purchase_item_costs`
WHEN EXISTS (SELECT 1 FROM `purchase_cost_orders` o WHERE o.id = OLD.order_id AND o.kind = 'additional' AND o.state != 'draft')
BEGIN SELECT RAISE(ABORT, 'recorded order costs are immutable'); END;
