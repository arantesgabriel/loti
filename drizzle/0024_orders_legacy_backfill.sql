INSERT INTO order_warehouse_positions (cost_item_id,workspace_id,account_id,review_state,received_units,revision,updated_at)
SELECT c.id,t.workspace_id,o.account_id,'pending_review','[]',0,unixepoch()*1000
FROM purchase_item_costs c JOIN purchase_cost_trackings t ON t.id=c.tracking_id LEFT JOIN purchase_cost_orders o ON o.id=c.order_id;
--> statement-breakpoint
INSERT INTO logistics_packages (id,workspace_id,account_id,legacy_package_id,name,revision,review_state,stage,content_closed_at,created_at)
SELECT p.id,t.workspace_id,p.account_id,p.id,p.name,0,'pending_review',p.logistics_status,p.content_sealed_at,p.created_at
FROM purchase_packages p JOIN purchase_cost_trackings t ON t.id=p.tracking_id;
--> statement-breakpoint
WITH RECURSIVE units(cost_item_id,unit_index,quantity) AS (
 SELECT c.id,0,coalesce(i.quantity,a.quantity) FROM purchase_item_costs c
 LEFT JOIN purchase_items i ON i.id=c.purchase_item_id LEFT JOIN purchase_additional_order_items a ON a.id=c.additional_order_item_id
 UNION ALL SELECT cost_item_id,unit_index+1,quantity FROM units WHERE unit_index+1<quantity
), available AS (
 SELECT cost_item_id,unit_index,row_number() OVER(PARTITION BY cost_item_id ORDER BY unit_index) AS ordinal
 FROM units u WHERE NOT EXISTS(SELECT 1 FROM purchase_cost_refunds r WHERE r.cost_item_id=u.cost_item_id AND r.status!='voided' AND u.unit_index>=r.unit_start AND u.unit_index<r.unit_start+r.quantity)
), allocations AS (
 SELECT a.*,sum(a.quantity) OVER(PARTITION BY a.cost_item_id ORDER BY p.package_order,p.id ROWS UNBOUNDED PRECEDING) AS ending
 FROM purchase_package_items a JOIN purchase_packages p ON p.id=a.package_id
)
INSERT INTO logistics_reservations(id,package_id,cost_item_id,unit_index,created_at)
SELECT 'legacy:'||a.package_id||':'||u.cost_item_id||':'||u.unit_index,a.package_id,u.cost_item_id,u.unit_index,unixepoch()*1000
FROM allocations a JOIN available u ON u.cost_item_id=a.cost_item_id AND u.ordinal>a.ending-a.quantity AND u.ordinal<=a.ending;
--> statement-breakpoint
CREATE TEMP TABLE orders_backfill_assertion (ok INTEGER CHECK(ok=1));
--> statement-breakpoint
INSERT INTO orders_backfill_assertion SELECT CASE WHEN
 (SELECT coalesce(sum(quantity),0) FROM purchase_package_items)=(SELECT count(*) FROM logistics_reservations)
 THEN 1 ELSE 0 END;
--> statement-breakpoint
DROP TABLE orders_backfill_assertion;
--> statement-breakpoint
CREATE TRIGGER legacy_package_insert_cutover BEFORE INSERT ON purchase_packages BEGIN SELECT RAISE(ABORT,'ORDERS_WORKFLOW_UPGRADE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER legacy_package_update_cutover BEFORE UPDATE ON purchase_packages BEGIN SELECT RAISE(ABORT,'ORDERS_WORKFLOW_UPGRADE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER legacy_package_delete_cutover BEFORE DELETE ON purchase_packages BEGIN SELECT RAISE(ABORT,'ORDERS_WORKFLOW_UPGRADE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER legacy_allocation_insert_cutover BEFORE INSERT ON purchase_package_items BEGIN SELECT RAISE(ABORT,'ORDERS_WORKFLOW_UPGRADE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER legacy_allocation_update_cutover BEFORE UPDATE ON purchase_package_items BEGIN SELECT RAISE(ABORT,'ORDERS_WORKFLOW_UPGRADE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER legacy_allocation_delete_cutover BEFORE DELETE ON purchase_package_items BEGIN SELECT RAISE(ABORT,'ORDERS_WORKFLOW_UPGRADE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_refund_overlap BEFORE INSERT ON purchase_cost_refunds WHEN NEW.status!='voided' AND EXISTS (
 SELECT 1 FROM logistics_reservations r WHERE r.cost_item_id=NEW.cost_item_id AND r.released_at IS NULL AND r.unit_index>=NEW.unit_start AND r.unit_index<NEW.unit_start+NEW.quantity
) BEGIN SELECT RAISE(ABORT,'RELEASE_PACKAGE_UNITS_BEFORE_REFUND'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_reservation_refund_overlap BEFORE INSERT ON logistics_reservations WHEN NEW.released_at IS NULL AND EXISTS (
 SELECT 1 FROM purchase_cost_refunds r WHERE r.cost_item_id=NEW.cost_item_id AND r.status!='voided' AND NEW.unit_index>=r.unit_start AND NEW.unit_index<r.unit_start+r.quantity
) BEGIN SELECT RAISE(ABORT,'CANCELLED_UNIT_CANNOT_BE_RESERVED'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_manifest_immutable_update BEFORE UPDATE ON logistics_manifests BEGIN SELECT RAISE(ABORT,'IMMUTABLE_MANIFEST'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_manifest_immutable_delete BEFORE DELETE ON logistics_manifests BEGIN SELECT RAISE(ABORT,'IMMUTABLE_MANIFEST'); END;
--> statement-breakpoint
CREATE TRIGGER warehouse_new_cost AFTER INSERT ON purchase_item_costs BEGIN
 INSERT INTO order_warehouse_positions(cost_item_id,workspace_id,account_id,review_state,received_units,revision,updated_at)
 SELECT NEW.id,t.workspace_id,o.account_id,'confirmed','[]',0,unixepoch()*1000 FROM purchase_cost_trackings t LEFT JOIN purchase_cost_orders o ON o.id=NEW.order_id WHERE t.id=NEW.tracking_id;
END;
--> statement-breakpoint
CREATE TRIGGER logistics_reservation_scope BEFORE INSERT ON logistics_reservations WHEN NEW.released_at IS NULL AND NOT EXISTS (
 SELECT 1 FROM order_warehouse_positions w JOIN logistics_packages p ON p.id=NEW.package_id
 JOIN purchase_item_costs c ON c.id=w.cost_item_id JOIN purchase_cost_orders o ON o.id=c.order_id
 WHERE w.cost_item_id=NEW.cost_item_id AND w.workspace_id=p.workspace_id AND w.account_id=p.account_id
 AND w.review_state='confirmed' AND p.review_state='confirmed' AND p.stage='preparing' AND p.content_closed_at IS NULL AND p.financial_closed_at IS NULL
 AND o.state='recorded' AND NOT EXISTS(SELECT 1 FROM purchase_order_corrections x WHERE x.previous_order_id=o.id)
 AND EXISTS(SELECT 1 FROM json_each(w.received_units) j WHERE j.value=NEW.unit_index)
) BEGIN SELECT RAISE(ABORT,'WAREHOUSE_RESERVATION_INELIGIBLE'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_reservation_identity BEFORE UPDATE OF package_id,cost_item_id,unit_index ON logistics_reservations BEGIN SELECT RAISE(ABORT,'RESERVATION_IDENTITY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_sealed_release BEFORE UPDATE OF released_at ON logistics_reservations WHEN EXISTS (
 SELECT 1 FROM logistics_packages p WHERE p.id=OLD.package_id AND (p.content_closed_at IS NOT NULL OR p.stage!='preparing' OR p.financial_closed_at IS NOT NULL)
) BEGIN SELECT RAISE(ABORT,'PACKAGE_CONTENT_LOCKED'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_cost_basis_lock BEFORE UPDATE ON purchase_item_costs WHEN EXISTS (
 SELECT 1 FROM logistics_reservations r JOIN logistics_packages p ON p.id=r.package_id WHERE r.cost_item_id=OLD.id AND r.released_at IS NULL AND (p.content_closed_at IS NOT NULL OR p.stage!='preparing')
) AND (OLD.effective_price_state IS NOT NEW.effective_price_state OR OLD.effective_price_unit_cents IS NOT NEW.effective_price_unit_cents OR OLD.china_freight_state IS NOT NEW.china_freight_state OR OLD.china_freight_unit_cents IS NOT NEW.china_freight_unit_cents)
BEGIN SELECT RAISE(ABORT,'PACKAGE_VALUATION_LOCKED'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_participant_update_lock BEFORE UPDATE ON purchase_cost_participants WHEN EXISTS (
 SELECT 1 FROM logistics_reservations r JOIN logistics_packages p ON p.id=r.package_id WHERE r.cost_item_id=OLD.cost_item_id AND r.released_at IS NULL AND (p.content_closed_at IS NOT NULL OR p.stage!='preparing')
) BEGIN SELECT RAISE(ABORT,'PACKAGE_VALUATION_LOCKED'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_participant_delete_lock BEFORE DELETE ON purchase_cost_participants WHEN EXISTS (
 SELECT 1 FROM logistics_reservations r JOIN logistics_packages p ON p.id=r.package_id WHERE r.cost_item_id=OLD.cost_item_id AND r.released_at IS NULL AND (p.content_closed_at IS NOT NULL OR p.stage!='preparing')
) BEGIN SELECT RAISE(ABORT,'PACKAGE_VALUATION_LOCKED'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_charge_cutover BEFORE UPDATE ON purchase_cost_charges WHEN OLD.package_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'ORDERS_WORKFLOW_UPGRADE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_product_fee_lock BEFORE UPDATE ON purchase_cost_charges WHEN OLD.charge_type='products' AND (OLD.payment_method IS NOT NEW.payment_method OR OLD.fee_bps IS NOT NEW.fee_bps) AND EXISTS (
 SELECT 1 FROM purchase_item_costs c JOIN logistics_reservations r ON r.cost_item_id=c.id JOIN logistics_packages p ON p.id=r.package_id
 WHERE c.order_id=OLD.order_id AND r.released_at IS NULL AND (p.content_closed_at IS NOT NULL OR p.stage!='preparing')
) BEGIN SELECT RAISE(ABORT,'PACKAGE_VALUATION_LOCKED'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_refund_review BEFORE INSERT ON purchase_cost_refunds WHEN NOT EXISTS(SELECT 1 FROM order_warehouse_positions w WHERE w.cost_item_id=NEW.cost_item_id AND w.review_state='confirmed') BEGIN SELECT RAISE(ABORT,'WAREHOUSE_REVIEW_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_account_deletion BEFORE UPDATE OF deleted_at ON hubbuy_accounts WHEN NEW.deleted_at IS NOT NULL AND (
 EXISTS(SELECT 1 FROM order_warehouse_positions w WHERE w.account_id=OLD.id) OR EXISTS(SELECT 1 FROM logistics_packages p WHERE p.account_id=OLD.id)
) BEGIN SELECT RAISE(ABORT,'ACCOUNT_HAS_LOGISTICS_REFERENCES'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_package_account_scope BEFORE INSERT ON logistics_packages WHEN NEW.account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hubbuy_accounts a WHERE a.id=NEW.account_id AND a.workspace_id=NEW.workspace_id AND a.deleted_at IS NULL AND a.status='active') BEGIN SELECT RAISE(ABORT,'PACKAGE_ACCOUNT_SCOPE'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_package_account_update_scope BEFORE UPDATE OF account_id,workspace_id ON logistics_packages WHEN NEW.account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hubbuy_accounts a WHERE a.id=NEW.account_id AND a.workspace_id=NEW.workspace_id AND a.deleted_at IS NULL AND a.status='active') BEGIN SELECT RAISE(ABORT,'PACKAGE_ACCOUNT_SCOPE'); END;
--> statement-breakpoint
CREATE TRIGGER logistics_order_basis_lock BEFORE UPDATE ON purchase_item_costs WHEN (OLD.effective_price_state IS NOT NEW.effective_price_state OR OLD.effective_price_unit_cents IS NOT NEW.effective_price_unit_cents OR OLD.china_freight_state IS NOT NEW.china_freight_state OR OLD.china_freight_unit_cents IS NOT NEW.china_freight_unit_cents) AND EXISTS(
 SELECT 1 FROM purchase_item_costs c JOIN logistics_reservations r ON r.cost_item_id=c.id JOIN logistics_packages p ON p.id=r.package_id WHERE c.order_id=OLD.order_id AND r.released_at IS NULL AND (p.content_closed_at IS NOT NULL OR p.stage!='preparing')
) BEGIN SELECT RAISE(ABORT,'PACKAGE_VALUATION_LOCKED'); END;
