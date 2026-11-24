-- A debit has one bounded restitution budget, including adopted legacy debits.
CREATE TRIGGER debit_restitution_capacity BEFORE INSERT ON hubbuy_balance_entries
WHEN NEW.direction='credit' AND NEW.reversal_of_entry_id IS NOT NULL AND EXISTS(SELECT 1 FROM hubbuy_balance_entries d WHERE d.id=NEW.reversal_of_entry_id AND d.direction='debit') AND NOT EXISTS(
 SELECT 1 FROM hubbuy_balance_entries d WHERE d.id=NEW.reversal_of_entry_id AND d.account_id=NEW.account_id
 AND NEW.amount_cny_minor+(SELECT coalesce(sum(e.amount_cny_minor),0) FROM hubbuy_balance_entries e WHERE e.direction='credit' AND e.reversal_of_entry_id=d.id)<=d.amount_cny_minor
 AND NEW.historical_brl_cents+(SELECT coalesce(sum(e.historical_brl_cents),0) FROM hubbuy_balance_entries e WHERE e.direction='credit' AND e.reversal_of_entry_id=d.id)<=d.historical_brl_cents
) BEGIN SELECT RAISE(ABORT,'DEBIT_RESTITUTION_CAPACITY'); END;
--> statement-breakpoint
CREATE TRIGGER freight_adoption_uncompensated BEFORE INSERT ON package_freight_sources
WHEN NEW.kind='balance' AND EXISTS(SELECT 1 FROM hubbuy_balance_consumptions c JOIN hubbuy_balance_entries r ON r.reversal_of_entry_id=c.debit_entry_id AND r.direction='credit' WHERE c.id=NEW.consumption_id)
BEGIN SELECT RAISE(ABORT,'FREIGHT_DEBIT_ALREADY_RESTORED'); END;
--> statement-breakpoint
CREATE TRIGGER debit_restitution_share_capacity BEFORE INSERT ON hubbuy_balance_credit_shares
WHEN EXISTS(SELECT 1 FROM hubbuy_balance_entries r JOIN hubbuy_balance_entries d ON d.id=r.reversal_of_entry_id AND d.direction='debit' WHERE r.id=NEW.credit_entry_id)
AND NOT EXISTS(SELECT 1 FROM hubbuy_balance_entries r JOIN hubbuy_balance_entries d ON d.id=r.reversal_of_entry_id AND d.direction='debit' WHERE r.id=NEW.credit_entry_id
 AND NEW.amount_cny_minor+(SELECT coalesce(sum(s.amount_cny_minor),0) FROM hubbuy_balance_entries x JOIN hubbuy_balance_credit_shares s ON s.credit_entry_id=x.id WHERE x.reversal_of_entry_id=d.id AND x.direction='credit' AND s.person_id=NEW.person_id)<=(SELECT coalesce(sum(c.amount_cny_minor),0) FROM hubbuy_balance_consumptions c JOIN hubbuy_balance_credit_shares s ON s.id=c.credit_share_id WHERE c.debit_entry_id=d.id AND s.person_id=NEW.person_id)
 AND NEW.historical_brl_cents+(SELECT coalesce(sum(s.historical_brl_cents),0) FROM hubbuy_balance_entries x JOIN hubbuy_balance_credit_shares s ON s.credit_entry_id=x.id WHERE x.reversal_of_entry_id=d.id AND x.direction='credit' AND s.person_id=NEW.person_id)<=(SELECT coalesce(sum(c.historical_brl_cents),0) FROM hubbuy_balance_consumptions c JOIN hubbuy_balance_credit_shares s ON s.id=c.credit_share_id WHERE c.debit_entry_id=d.id AND s.person_id=NEW.person_id)
) BEGIN SELECT RAISE(ABORT,'DEBIT_RESTITUTION_OWNER_CAPACITY'); END;
--> statement-breakpoint
CREATE TRIGGER freight_restitution_owner BEFORE INSERT ON hubbuy_balance_entries
WHEN NEW.direction='credit' AND NEW.reversal_of_entry_id IS NOT NULL AND EXISTS(SELECT 1 FROM hubbuy_balance_consumptions c JOIN package_freight_sources s ON s.consumption_id=c.id WHERE c.debit_entry_id=NEW.reversal_of_entry_id)
AND NOT EXISTS(SELECT 1 FROM hubbuy_balance_consumptions c JOIN package_freight_sources s ON s.consumption_id=c.id JOIN package_freight_payments p ON p.id=s.payment_id JOIN logistics_packages g ON g.id=p.package_id JOIN financial_operations o ON o.id=NEW.operation_id WHERE c.debit_entry_id=NEW.reversal_of_entry_id AND NEW.source_type='reversal' AND NEW.source_id=p.id AND o.workspace_id=g.workspace_id AND o.operation_type IN ('package_freight_reversed','package_freight_payment'))
BEGIN SELECT RAISE(ABORT,'ADJUSTMENT_FREIGHT_DEPENDENCY'); END;
--> statement-breakpoint
CREATE TRIGGER adopted_adjustment_reversal_guard BEFORE INSERT ON hubbuy_balance_adjustments
WHEN NEW.kind='reversal' AND EXISTS(SELECT 1 FROM hubbuy_balance_adjustments a JOIN hubbuy_balance_consumptions c ON c.debit_entry_id=a.balance_entry_id JOIN package_freight_sources s ON s.consumption_id=c.id WHERE a.id=NEW.reverses_adjustment_id)
BEGIN SELECT RAISE(ABORT,'ADJUSTMENT_FREIGHT_DEPENDENCY'); END;
--> statement-breakpoint
CREATE VIEW hubbuy_full_restitution_edges AS
SELECT DISTINCT c.credit_share_id original_share_id, restored.id restored_share_id,c.debit_entry_id, original.person_id
FROM hubbuy_balance_consumptions c
JOIN hubbuy_balance_credit_shares original ON original.id=c.credit_share_id
JOIN hubbuy_balance_entries d ON d.id=c.debit_entry_id AND d.direction='debit'
JOIN hubbuy_balance_entries r ON r.reversal_of_entry_id=d.id AND r.direction='credit' AND r.source_type='reversal' AND r.account_id=d.account_id AND r.sequence>d.sequence
JOIN hubbuy_balance_credit_shares restored ON restored.credit_entry_id=r.id AND restored.person_id=original.person_id
WHERE d.amount_cny_minor=(SELECT coalesce(sum(x.amount_cny_minor),0) FROM hubbuy_balance_entries x WHERE x.reversal_of_entry_id=d.id AND x.direction='credit' AND x.source_type='reversal')
AND d.historical_brl_cents=(SELECT coalesce(sum(x.historical_brl_cents),0) FROM hubbuy_balance_entries x WHERE x.reversal_of_entry_id=d.id AND x.direction='credit' AND x.source_type='reversal')
AND (SELECT coalesce(sum(x.amount_cny_minor),0) FROM hubbuy_balance_consumptions x JOIN hubbuy_balance_credit_shares s ON s.id=x.credit_share_id WHERE x.debit_entry_id=d.id AND s.person_id=original.person_id)=(SELECT coalesce(sum(s.amount_cny_minor),0) FROM hubbuy_balance_entries x JOIN hubbuy_balance_credit_shares s ON s.credit_entry_id=x.id WHERE x.reversal_of_entry_id=d.id AND x.direction='credit' AND x.source_type='reversal' AND s.person_id=original.person_id)
AND (SELECT coalesce(sum(x.historical_brl_cents),0) FROM hubbuy_balance_consumptions x JOIN hubbuy_balance_credit_shares s ON s.id=x.credit_share_id WHERE x.debit_entry_id=d.id AND s.person_id=original.person_id)=(SELECT coalesce(sum(s.historical_brl_cents),0) FROM hubbuy_balance_entries x JOIN hubbuy_balance_credit_shares s ON s.credit_entry_id=x.id WHERE x.reversal_of_entry_id=d.id AND x.direction='credit' AND x.source_type='reversal' AND s.person_id=original.person_id);
--> statement-breakpoint
DROP TRIGGER topup_reversal_scope_guard;
--> statement-breakpoint
CREATE TRIGGER topup_reversal_scope_guard BEFORE INSERT ON hubbuy_topup_reversals
WHEN NOT EXISTS(
 WITH RECURSIVE reachable(id,person_id) AS (
  SELECT s.id,s.person_id FROM hubbuy_balance_credit_shares s JOIN hubbuy_topups t ON t.credit_entry_id=s.credit_entry_id WHERE t.id=NEW.topup_id
  UNION
  SELECT e.restored_share_id,e.person_id FROM reachable r JOIN hubbuy_full_restitution_edges e ON e.original_share_id=r.id AND e.person_id=r.person_id
 )
 SELECT 1 FROM hubbuy_topups t JOIN hubbuy_balance_entries d ON d.id=NEW.debit_entry_id JOIN financial_operations o ON o.id=NEW.operation_id
 WHERE t.id=NEW.topup_id AND d.account_id=t.account_id AND d.operation_id=o.id AND d.direction='debit' AND d.source_type='reversal' AND d.source_id=t.id AND d.reversal_of_entry_id=t.credit_entry_id
 AND d.amount_cny_minor=t.cny_minor AND d.historical_brl_cents=t.principal_brl_cents AND o.operation_type='hubbuy_topup_reversed' AND o.reversal_of_id=t.operation_id
 AND d.amount_cny_minor=(SELECT coalesce(sum(amount_cny_minor),0) FROM hubbuy_balance_consumptions WHERE debit_entry_id=d.id)
 AND d.historical_brl_cents=(SELECT coalesce(sum(historical_brl_cents),0) FROM hubbuy_balance_consumptions WHERE debit_entry_id=d.id)
 AND NOT EXISTS(SELECT 1 FROM hubbuy_balance_credit_shares original WHERE original.credit_entry_id=t.credit_entry_id AND (original.amount_cny_minor!=(SELECT coalesce(sum(c.amount_cny_minor),0) FROM hubbuy_balance_consumptions c WHERE c.credit_share_id=original.id) OR original.historical_brl_cents!=(SELECT coalesce(sum(c.historical_brl_cents),0) FROM hubbuy_balance_consumptions c WHERE c.credit_share_id=original.id)))
 AND NOT EXISTS(SELECT 1 FROM hubbuy_balance_consumptions c WHERE c.debit_entry_id=d.id AND c.credit_share_id NOT IN(SELECT id FROM reachable))
 AND NOT EXISTS(SELECT 1 FROM hubbuy_topup_funders f WHERE f.topup_id=t.id AND (f.cny_minor!=(SELECT coalesce(sum(c.amount_cny_minor),0) FROM hubbuy_balance_consumptions c JOIN hubbuy_balance_credit_shares s ON s.id=c.credit_share_id WHERE c.debit_entry_id=d.id AND s.person_id=f.person_id) OR f.principal_brl_cents!=(SELECT coalesce(sum(c.historical_brl_cents),0) FROM hubbuy_balance_consumptions c JOIN hubbuy_balance_credit_shares s ON s.id=c.credit_share_id WHERE c.debit_entry_id=d.id AND s.person_id=f.person_id)))
 AND NOT EXISTS(SELECT 1 FROM reachable r JOIN hubbuy_balance_consumptions c ON c.credit_share_id=r.id WHERE c.debit_entry_id!=d.id AND NOT EXISTS(SELECT 1 FROM hubbuy_topup_reversals x WHERE x.debit_entry_id=c.debit_entry_id) AND NOT EXISTS(SELECT 1 FROM hubbuy_full_restitution_edges e WHERE e.original_share_id=r.id AND e.debit_entry_id=c.debit_entry_id))
) BEGIN SELECT RAISE(ABORT,'invalid topup reversal or active economic consumption'); END;
