CREATE TABLE `logistics_legacy_charges` (
	`legacy_charge_id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`snapshot` text NOT NULL,
	FOREIGN KEY (`legacy_charge_id`) REFERENCES `purchase_cost_charges`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`package_id`) REFERENCES `logistics_packages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `warehouse_workspace_account_idx` ON `order_warehouse_positions` (`workspace_id`,`account_id`,`cost_item_id`);
--> statement-breakpoint
-- Capture inputs, not floating-point arithmetic. The canonical BigInt allocator
-- projects these immutable historical inputs even after a later unit is released.
INSERT INTO logistics_legacy_charges(legacy_charge_id,package_id,snapshot)
SELECT c.id,p.id,json_object(
 'version',1,'chargeType',c.charge_type,
 'value',json_object('state',c.value_state,'amountCents',c.amount_cents),
 'paymentMethod',c.payment_method,'feeBps',c.fee_bps,'paymentStatus',c.payment_status,
 'items',json((SELECT json_group_array(json_object('costItemId',a.cost_item_id,'quantity',a.quantity,'allocationOrder',a.allocation_order,
 'participants',json((SELECT json_group_array(json_object('personId',w.person_id,'allocationOrder',w.allocation_order,'weight',w.weight)) FROM purchase_cost_participants w WHERE w.cost_item_id=a.cost_item_id ORDER BY w.allocation_order))))
 FROM purchase_package_items a WHERE a.package_id=p.legacy_package_id ORDER BY a.allocation_order))
)
FROM logistics_packages p JOIN purchase_cost_charges c ON c.package_id=p.legacy_package_id;
--> statement-breakpoint
CREATE TRIGGER logistics_legacy_charge_update BEFORE UPDATE ON logistics_legacy_charges BEGIN SELECT RAISE(ABORT,'IMMUTABLE_LEGACY_CHARGE_BRIDGE'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_legacy_charge_delete BEFORE DELETE ON logistics_legacy_charges BEGIN SELECT RAISE(ABORT,'IMMUTABLE_LEGACY_CHARGE_BRIDGE'); END;
--> statement-breakpoint
CREATE INDEX logistics_packages_workspace_account_idx ON logistics_packages(workspace_id,account_id,stage);
--> statement-breakpoint
CREATE INDEX logistics_reservations_package_idx ON logistics_reservations(package_id,released_at,cost_item_id,unit_index);
--> statement-breakpoint
CREATE INDEX logistics_events_resource_idx ON logistics_events(workspace_id,resource_id,created_at);
