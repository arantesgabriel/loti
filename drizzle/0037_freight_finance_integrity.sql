DROP TRIGGER `purchase_payment_allocation_capacity_guard`;
--> statement-breakpoint

CREATE TRIGGER `purchase_payment_allocation_capacity_guard` BEFORE INSERT ON `purchase_payment_allocations`
WHEN NOT EXISTS (
  SELECT 1 FROM `purchase_payment_components` c
  JOIN `purchase_cost_orders` o ON o.id = c.order_id
  JOIN `purchase_cost_trackings` t ON t.id = o.tracking_id
  JOIN `workspaces` w ON w.id=t.workspace_id
  JOIN `purchase_item_costs` i ON i.id = NEW.cost_item_id AND i.order_id = c.order_id
  WHERE ((w.kind='personal' AND w.owner_user_id=NEW.person_id) OR (w.kind='shared' AND EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=w.id AND m.user_id=NEW.person_id))) AND c.id = NEW.component_id
    AND ((NEW.cost_component = 'product' AND i.native_product_state = 'known' AND COALESCE((SELECT SUM(cny_minor) FROM `purchase_payment_allocations` WHERE cost_item_id = NEW.cost_item_id AND cost_component = NEW.cost_component), 0) + NEW.cny_minor <= i.native_product_cny_minor)
      OR (NEW.cost_component = 'china' AND i.native_china_state = 'known' AND COALESCE((SELECT SUM(cny_minor) FROM `purchase_payment_allocations` WHERE cost_item_id = NEW.cost_item_id AND cost_component = NEW.cost_component), 0) + NEW.cny_minor <= i.native_china_cny_minor))
)
BEGIN SELECT RAISE(ABORT, 'payment allocation exceeds item capacity or workspace membership'); END;

--> statement-breakpoint
DROP TRIGGER `refund_payment_allocation_workspace_guard`;
--> statement-breakpoint

CREATE TRIGGER `refund_payment_allocation_workspace_guard` BEFORE INSERT ON `purchase_refund_payment_allocations`
WHEN NOT EXISTS (
  SELECT 1 FROM `purchase_cost_refunds` r
  JOIN `purchase_cost_trackings` t ON t.id = r.tracking_id
  JOIN `financial_operations` o ON o.id = NEW.operation_id
  JOIN `workspaces` w ON w.id=t.workspace_id
  WHERE ((w.kind='personal' AND w.owner_user_id=NEW.person_id) OR (w.kind='shared' AND EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=w.id AND m.user_id=NEW.person_id))) AND r.id = NEW.refund_id AND o.workspace_id = t.workspace_id
)
BEGIN SELECT RAISE(ABORT, 'refund allocation must match the refund workspace and member'); END;

--> statement-breakpoint
CREATE TRIGGER topup_fee_funder_scope BEFORE INSERT ON topup_fee_funders WHEN NOT EXISTS(SELECT 1 FROM topup_fee_allocations a JOIN hubbuy_topup_funders p ON p.topup_id=a.topup_id AND p.person_id=NEW.person_id WHERE a.id=NEW.fee_allocation_id AND (a.reverses_id IS NULL OR EXISTS(SELECT 1 FROM topup_fee_funders old WHERE old.fee_allocation_id=a.reverses_id AND old.person_id=NEW.person_id AND old.amount_brl_cents=NEW.amount_brl_cents)) AND NEW.amount_brl_cents+(SELECT coalesce(sum(x.amount_brl_cents),0) FROM topup_fee_funders x WHERE x.fee_allocation_id=a.id)<=a.amount_brl_cents) BEGIN SELECT RAISE(ABORT,'topup fee funder mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER topup_fee_order_share_scope BEFORE INSERT ON topup_fee_order_shares WHEN NOT EXISTS(SELECT 1 FROM topup_fee_allocations a JOIN purchase_item_costs c ON c.id=NEW.cost_item_id AND c.order_id=a.order_id JOIN purchase_cost_participants p ON p.cost_item_id=c.id AND p.person_id=NEW.person_id WHERE a.id=NEW.fee_allocation_id AND (a.reverses_id IS NULL OR EXISTS(SELECT 1 FROM topup_fee_funders old WHERE old.fee_allocation_id=a.reverses_id AND old.person_id=NEW.person_id AND old.amount_brl_cents=NEW.amount_brl_cents)) AND NEW.amount_brl_cents+(SELECT coalesce(sum(x.amount_brl_cents),0) FROM topup_fee_order_shares x WHERE x.fee_allocation_id=a.id)<=a.amount_brl_cents) BEGIN SELECT RAISE(ABORT,'topup fee beneficiary mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER freight_reversal_scope BEFORE INSERT ON package_freight_reversals WHEN NOT EXISTS(SELECT 1 FROM package_freight_payments p JOIN logistics_packages g ON g.id=p.package_id JOIN financial_operations o ON o.id=NEW.operation_id WHERE p.id=NEW.payment_id AND o.workspace_id=g.workspace_id) BEGIN SELECT RAISE(ABORT,'financial reversal workspace mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER freight_refund_reversal_scope BEFORE INSERT ON package_freight_refund_reversals WHEN NOT EXISTS(SELECT 1 FROM package_freight_refunds p JOIN package_freight_payments x ON x.id=p.payment_id JOIN logistics_packages g ON g.id=x.package_id JOIN financial_operations o ON o.id=NEW.operation_id WHERE p.id=NEW.refund_id AND o.workspace_id=g.workspace_id) BEGIN SELECT RAISE(ABORT,'financial reversal workspace mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER settlement_receipt_reversal_scope BEFORE INSERT ON package_settlement_receipt_reversals WHEN NOT EXISTS(SELECT 1 FROM package_settlement_receipts p JOIN logistics_packages g ON g.id=p.package_id JOIN financial_operations o ON o.id=NEW.operation_id WHERE p.id=NEW.receipt_id AND o.workspace_id=g.workspace_id) BEGIN SELECT RAISE(ABORT,'financial reversal workspace mismatch'); END;