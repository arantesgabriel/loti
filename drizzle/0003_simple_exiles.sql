ALTER TABLE `purchase_items` ADD COLUMN `sharing_mode` text NOT NULL DEFAULT 'equal' CHECK (`sharing_mode` IN ('equal','percentage','fixed'));
--> statement-breakpoint
CREATE TABLE `purchase_item_participants` (
  `purchase_item_id` text NOT NULL,
  `person_id` text NOT NULL,
  `allocation_order` integer NOT NULL,
  `percentage_bps` integer,
  `amount_cents` integer,
  PRIMARY KEY (`purchase_item_id`, `person_id`),
  CONSTRAINT `item_participant_order` CHECK(typeof(`allocation_order`) = 'integer' AND `allocation_order` >= 0),
  CONSTRAINT `item_participant_percentage` CHECK(`percentage_bps` IS NULL OR (typeof(`percentage_bps`) = 'integer' AND `percentage_bps` BETWEEN 0 AND 10000)),
  CONSTRAINT `item_participant_amount` CHECK(`amount_cents` IS NULL OR (typeof(`amount_cents`) = 'integer' AND `amount_cents` BETWEEN 0 AND 1000000000000)),
  CONSTRAINT `item_participant_one_value` CHECK(`percentage_bps` IS NULL OR `amount_cents` IS NULL),
  FOREIGN KEY (`purchase_item_id`) REFERENCES `purchase_items`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`person_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `item_participant_order_idx` ON `purchase_item_participants` (`purchase_item_id`, `allocation_order`);
--> statement-breakpoint
CREATE INDEX `item_participant_person_idx` ON `purchase_item_participants` (`person_id`);
--> statement-breakpoint
INSERT INTO `purchase_item_participants` (`purchase_item_id`, `person_id`, `allocation_order`, `percentage_bps`, `amount_cents`)
SELECT `id`, `person_id`, 0, NULL, NULL FROM `purchase_items`;
