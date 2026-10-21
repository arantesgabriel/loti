-- Investigation evidence: only SELECT statements.
-- Readable equivalents of the queries executed through the Turso browser editor.
-- CNY and BRL values below remain integer minor units.

-- 1. Account projection versus independent ledger totals.
SELECT a.id, a.revision, a.balance_cny_minor,
       SUM(CASE e.direction WHEN 'credit' THEN e.amount_cny_minor ELSE -e.amount_cny_minor END) AS ledger_minor,
       SUM(CASE WHEN e.direction='credit' THEN e.amount_cny_minor ELSE 0 END) AS credits_minor,
       SUM(CASE WHEN e.direction='debit' THEN e.amount_cny_minor ELSE 0 END) AS debits_minor
FROM hubbuy_accounts a
LEFT JOIN hubbuy_balance_entries e ON e.account_id=a.id
GROUP BY a.id;

-- 2. Full chronological ledger, without credentials or account email.
SELECT sequence, id, direction, amount_cny_minor, historical_brl_cents,
       source_type, source_id, reversal_of_entry_id,
       datetime(created_at/1000,'unixepoch') AS recorded_utc
FROM hubbuy_balance_entries
ORDER BY account_id, sequence;

-- 3. Every original lot closes independently.
SELECT e.sequence, u.name AS owner, s.amount_cny_minor AS original_minor,
       COALESCE(SUM(c.amount_cny_minor),0) AS consumed_minor,
       s.amount_cny_minor-COALESCE(SUM(c.amount_cny_minor),0) AS available_minor,
       s.historical_brl_cents-COALESCE(SUM(c.historical_brl_cents),0) AS available_brl_cents
FROM hubbuy_balance_credit_shares s
JOIN hubbuy_balance_entries e ON e.id=s.credit_entry_id
JOIN user u ON u.id=s.person_id
LEFT JOIN hubbuy_balance_consumptions c ON c.credit_share_id=s.id
GROUP BY s.id
ORDER BY e.account_id,e.sequence,s.allocation_order;

-- 4. Actual path from debit to credit origin and owner.
SELECT d.sequence AS debit_sequence, e.sequence AS origin_sequence,
       u.name AS owner, SUM(c.amount_cny_minor) AS consumed_minor
FROM hubbuy_balance_consumptions c
JOIN hubbuy_balance_entries d ON d.id=c.debit_entry_id
JOIN hubbuy_balance_credit_shares s ON s.id=c.credit_share_id
JOIN hubbuy_balance_entries e ON e.id=s.credit_entry_id
JOIN user u ON u.id=s.person_id
GROUP BY d.id,e.id,s.person_id
ORDER BY d.account_id,d.sequence,e.sequence,s.allocation_order;

-- 5. Restoration shares must equal original consumed rights, CNY and BRL.
SELECT r.sequence AS restoration_sequence, d.sequence AS debit_sequence,
       u.name AS owner, s.amount_cny_minor AS restored_minor,
       o.cny AS original_consumed_minor,
       s.historical_brl_cents AS restored_brl_cents, o.brl AS original_consumed_brl_cents
FROM hubbuy_balance_entries r
JOIN hubbuy_balance_entries d ON d.id=r.reversal_of_entry_id
JOIN hubbuy_balance_credit_shares s ON s.credit_entry_id=r.id
JOIN user u ON u.id=s.person_id
LEFT JOIN (
  SELECT c.debit_entry_id,s.person_id,
         SUM(c.amount_cny_minor) AS cny,SUM(c.historical_brl_cents) AS brl
  FROM hubbuy_balance_consumptions c
  JOIN hubbuy_balance_credit_shares s ON s.id=c.credit_share_id
  GROUP BY c.debit_entry_id,s.person_id
) o ON o.debit_entry_id=d.id AND o.person_id=s.person_id
WHERE r.direction='credit' AND r.source_type='reversal'
ORDER BY r.account_id,r.sequence,s.allocation_order;

-- 6. Independent owner balance, calculated from persisted lots and uses.
SELECT u.name AS owner,
       SUM(s.amount_cny_minor) AS original_credits_minor,
       SUM(COALESCE(c.cny,0)) AS consumed_minor,
       SUM(s.amount_cny_minor-COALESCE(c.cny,0)) AS available_minor,
       SUM(s.historical_brl_cents-COALESCE(c.brl,0)) AS available_brl_cents
FROM hubbuy_balance_credit_shares s
JOIN user u ON u.id=s.person_id
LEFT JOIN (
  SELECT credit_share_id,SUM(amount_cny_minor) AS cny,SUM(historical_brl_cents) AS brl
  FROM hubbuy_balance_consumptions GROUP BY credit_share_id
) c ON c.credit_share_id=s.id
GROUP BY s.person_id;

-- 7. Refund product association and historical ownership inputs.
SELECT e.sequence,r.id AS refund_id,COALESCE(i.name,a.name) AS product,
       u.name AS owner,p.allocation_order,p.weight_mode,p.weight,
       p.original_product_share_cents,p.original_china_share_cents,
       s.amount_cny_minor,
       r.received_product_cny_minor,r.received_china_cny_minor,
       r.received_product_cents,r.received_china_cents
FROM hubbuy_balance_entries e
JOIN purchase_cost_refunds r ON r.id=e.source_id
JOIN purchase_item_costs c ON c.id=r.cost_item_id
LEFT JOIN purchase_items i ON i.id=c.purchase_item_id
LEFT JOIN purchase_additional_order_items a ON a.id=c.additional_order_item_id
JOIN purchase_cost_refund_participants p ON p.refund_id=r.id
JOIN user u ON u.id=p.person_id
JOIN hubbuy_balance_credit_shares s ON s.credit_entry_id=e.id AND s.person_id=p.person_id
WHERE e.source_type='refund_received'
ORDER BY e.account_id,e.sequence,p.allocation_order;

-- 8. Final versus superseded additional order snapshots.
SELECT DISTINCT d.sequence,i.name,i.quantity,c.native_product_cny_minor,c.native_china_cny_minor,
       EXISTS(SELECT 1 FROM purchase_order_corrections x WHERE x.previous_order_id=pc.order_id) AS superseded
FROM hubbuy_balance_entries d
JOIN purchase_payment_components pc ON pc.operation_id=d.operation_id
JOIN purchase_item_costs c ON c.order_id=pc.order_id
JOIN purchase_additional_order_items i ON i.id=c.additional_order_item_id
WHERE d.source_type='purchase_payment'
ORDER BY d.sequence;

-- 9. Beneficiary distributions; join through the payment component.
SELECT d.sequence,u.name AS beneficiary,SUM(pa.cny_minor) AS amount_minor
FROM hubbuy_balance_entries d
JOIN purchase_payment_components pc ON pc.operation_id=d.operation_id
JOIN purchase_payment_allocations pa ON pa.component_id=pc.id
JOIN user u ON u.id=pa.person_id
WHERE d.source_type='purchase_payment'
GROUP BY d.id,pa.person_id
ORDER BY d.account_id,d.sequence,u.name;

-- 10. Diagnostic counts. None of these statements modifies data.
SELECT
 (SELECT COUNT(*) FROM member_balance_financing_entries) AS financing_rows,
 (SELECT COUNT(*) FROM hubbuy_balance_consumptions c
  JOIN hubbuy_balance_credit_shares s ON s.id=c.credit_share_id
  JOIN purchase_payment_allocations p ON p.id=c.payment_allocation_id
  WHERE s.person_id<>p.person_id) AS cross_owner_uses,
 (SELECT COUNT(*) FROM (
  SELECT reversal_of_entry_id FROM hubbuy_balance_entries
  WHERE reversal_of_entry_id IS NOT NULL
  GROUP BY reversal_of_entry_id HAVING COUNT(*)>1
 )) AS duplicate_reversal_targets,
 (SELECT COUNT(*) FROM hubbuy_balance_consumptions c
  LEFT JOIN hubbuy_balance_credit_shares s ON s.id=c.credit_share_id
  LEFT JOIN hubbuy_balance_entries d ON d.id=c.debit_entry_id
  WHERE s.id IS NULL OR d.id IS NULL) AS orphan_uses,
 (SELECT COUNT(*) FROM hubbuy_balance_credit_shares s
  LEFT JOIN user u ON u.id=s.person_id
  LEFT JOIN hubbuy_balance_entries e ON e.id=s.credit_entry_id
  WHERE u.id IS NULL OR e.id IS NULL) AS orphan_shares;

SELECT e.id FROM hubbuy_balance_entries e
LEFT JOIN hubbuy_balance_credit_shares s ON s.credit_entry_id=e.id
WHERE e.direction='credit'
GROUP BY e.id
HAVING e.amount_cny_minor<>COALESCE(SUM(s.amount_cny_minor),0)
    OR e.historical_brl_cents<>COALESCE(SUM(s.historical_brl_cents),0);

SELECT e.id FROM hubbuy_balance_entries e
LEFT JOIN hubbuy_balance_consumptions c ON c.debit_entry_id=e.id
WHERE e.direction='debit'
GROUP BY e.id HAVING e.amount_cny_minor<>COALESCE(SUM(c.amount_cny_minor),0);

SELECT s.id FROM hubbuy_balance_credit_shares s
LEFT JOIN hubbuy_balance_consumptions c ON c.credit_share_id=s.id
GROUP BY s.id
HAVING SUM(c.amount_cny_minor)>s.amount_cny_minor OR SUM(c.historical_brl_cents)>s.historical_brl_cents;

SELECT name,type FROM sqlite_schema
WHERE (type='index' AND (name LIKE '%idempotency%' OR name LIKE '%order_correction%' OR name LIKE '%balance_sequence%'))
   OR (type='trigger' AND (name LIKE '%balance%no_%' OR name LIKE '%consumption%no_%' OR name LIKE '%credit_share%no_%' OR name LIKE '%corrections%' OR name='hubbuy_account_balance_matches_ledger'))
ORDER BY type,name;
