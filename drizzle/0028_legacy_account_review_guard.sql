DROP TRIGGER warehouse_received_capacity;
--> statement-breakpoint
CREATE TRIGGER warehouse_received_capacity BEFORE UPDATE OF received_units,account_id,workspace_id ON order_warehouse_positions WHEN
 json_valid(NEW.received_units)=0 OR json_type(NEW.received_units)!='array'
 OR EXISTS(SELECT 1 FROM json_each(NEW.received_units) j WHERE j.type!='integer' OR j.value<0 OR j.value >= (SELECT coalesce(i.quantity,a.quantity) FROM purchase_item_costs c LEFT JOIN purchase_items i ON i.id=c.purchase_item_id LEFT JOIN purchase_additional_order_items a ON a.id=c.additional_order_item_id WHERE c.id=NEW.cost_item_id))
 OR (SELECT count(*) FROM json_each(NEW.received_units))!=(SELECT count(DISTINCT value) FROM json_each(NEW.received_units))
 OR EXISTS(SELECT 1 FROM logistics_reservations r WHERE r.cost_item_id=NEW.cost_item_id AND r.released_at IS NULL AND NOT EXISTS(SELECT 1 FROM json_each(NEW.received_units) j WHERE j.value=r.unit_index))
 OR EXISTS(SELECT 1 FROM logistics_reservations r JOIN logistics_packages p ON p.id=r.package_id WHERE r.cost_item_id=NEW.cost_item_id AND r.released_at IS NULL AND ((p.account_id IS NOT NEW.account_id AND (p.account_id IS NOT NULL OR p.review_state!='pending_review')) OR p.workspace_id!=NEW.workspace_id))
 BEGIN SELECT RAISE(ABORT,'WAREHOUSE_RECEIVED_CAPACITY_INVALID'); END;
