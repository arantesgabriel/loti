CREATE TRIGGER logistics_event_update BEFORE UPDATE ON logistics_events BEGIN SELECT RAISE(ABORT,'IMMUTABLE_LOGISTICS_EVENT'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_event_delete BEFORE DELETE ON logistics_events BEGIN SELECT RAISE(ABORT,'IMMUTABLE_LOGISTICS_EVENT'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_command_update BEFORE UPDATE ON logistics_commands BEGIN SELECT RAISE(ABORT,'IMMUTABLE_LOGISTICS_RECEIPT'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_command_delete BEFORE DELETE ON logistics_commands BEGIN SELECT RAISE(ABORT,'IMMUTABLE_LOGISTICS_RECEIPT'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_reservation_reactivation BEFORE UPDATE OF released_at ON logistics_reservations WHEN OLD.released_at IS NOT NULL OR NEW.released_at IS NULL BEGIN SELECT RAISE(ABORT,'RELEASED_RESERVATION_IS_HISTORICAL'); END;
--> statement-breakpoint
CREATE TRIGGER warehouse_received_capacity BEFORE UPDATE OF received_units,account_id,workspace_id ON order_warehouse_positions WHEN
 json_valid(NEW.received_units)=0 OR json_type(NEW.received_units)!='array'
 OR EXISTS(SELECT 1 FROM json_each(NEW.received_units) j WHERE j.type!='integer' OR j.value<0 OR j.value >= (SELECT coalesce(i.quantity,a.quantity) FROM purchase_item_costs c LEFT JOIN purchase_items i ON i.id=c.purchase_item_id LEFT JOIN purchase_additional_order_items a ON a.id=c.additional_order_item_id WHERE c.id=NEW.cost_item_id))
 OR (SELECT count(*) FROM json_each(NEW.received_units))!=(SELECT count(DISTINCT value) FROM json_each(NEW.received_units))
 OR EXISTS(SELECT 1 FROM logistics_reservations r WHERE r.cost_item_id=NEW.cost_item_id AND r.released_at IS NULL AND NOT EXISTS(SELECT 1 FROM json_each(NEW.received_units) j WHERE j.value=r.unit_index))
 OR EXISTS(SELECT 1 FROM logistics_reservations r JOIN logistics_packages p ON p.id=r.package_id WHERE r.cost_item_id=NEW.cost_item_id AND r.released_at IS NULL AND (p.account_id IS NOT NEW.account_id OR p.workspace_id!=NEW.workspace_id))
 BEGIN SELECT RAISE(ABORT,'WAREHOUSE_RECEIVED_CAPACITY_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER warehouse_position_scope BEFORE UPDATE ON order_warehouse_positions WHEN NOT EXISTS(
 SELECT 1 FROM purchase_item_costs c JOIN purchase_cost_trackings t ON t.id=c.tracking_id WHERE c.id=NEW.cost_item_id AND t.workspace_id=NEW.workspace_id
) OR (NEW.account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hubbuy_accounts a WHERE a.id=NEW.account_id AND a.workspace_id=NEW.workspace_id AND a.deleted_at IS NULL)) BEGIN SELECT RAISE(ABORT,'WAREHOUSE_POSITION_SCOPE'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_refund_update_overlap BEFORE UPDATE OF cost_item_id,unit_start,quantity,status ON purchase_cost_refunds WHEN NEW.status!='voided' AND EXISTS(
 SELECT 1 FROM logistics_reservations r WHERE r.cost_item_id=NEW.cost_item_id AND r.released_at IS NULL AND r.unit_index>=NEW.unit_start AND r.unit_index<NEW.unit_start+NEW.quantity
) BEGIN SELECT RAISE(ABORT,'RELEASE_PACKAGE_UNITS_BEFORE_REFUND'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_safe_money BEFORE UPDATE ON logistics_packages WHEN
 (NEW.freight_cents IS NOT NULL AND (typeof(NEW.freight_cents)!='integer' OR NEW.freight_cents NOT BETWEEN 0 AND 1000000000000))
 OR (NEW.freight_fee_cents IS NOT NULL AND (typeof(NEW.freight_fee_cents)!='integer' OR NEW.freight_fee_cents NOT BETWEEN 0 AND 1000000000000))
 OR (NEW.customs_cents IS NOT NULL AND (typeof(NEW.customs_cents)!='integer' OR NEW.customs_cents NOT BETWEEN 0 AND 1000000000000))
 BEGIN SELECT RAISE(ABORT,'LOGISTICS_SAFE_MONEY_REQUIRED'); END;
