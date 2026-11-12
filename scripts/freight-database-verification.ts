import type {Client} from "@libsql/client";
export async function verifyFreightDatabase(client:Pick<Client,"execute">){
 const tables=["financial_operation_results","package_freight_payments","package_freight_heads","package_freight_reversals","package_freight_sources","package_freight_allocations","topup_fee_allocations","topup_fee_funders","topup_fee_order_shares","package_settlement_versions","package_settlement_claims","package_settlement_receipts","package_settlement_receipt_allocations","package_settlement_receipt_reversals","package_freight_refunds","package_freight_refund_sources","package_freight_refund_reversals"];
 let triggers=0;
 for(const table of tables){await client.execute(`SELECT count(*) FROM ${table}`);if(table==="package_freight_heads")continue;
  const prefix=table;
  for(const action of ["update","delete"]){const found=await client.execute({sql:"SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?",args:[`${prefix}_no_${action}`]});if(!found.rows.length)throw new Error(`Missing freight immutability guard: ${prefix}_no_${action}`);triggers++;}
 }
 const invariants=[
  ["freight funding margins",`SELECT p.id FROM package_freight_payments p LEFT JOIN package_freight_sources s ON s.payment_id=p.id GROUP BY p.id HAVING p.native_minor!=coalesce(sum(s.native_minor),0) OR p.principal_brl_cents!=coalesce(sum(s.principal_brl_cents),0) OR p.fee_brl_cents!=coalesce(sum(s.fee_brl_cents),0)`],
  ["fee funder margins",`SELECT a.id FROM topup_fee_allocations a LEFT JOIN topup_fee_funders f ON f.fee_allocation_id=a.id WHERE a.reverses_id IS NULL GROUP BY a.id HAVING a.amount_brl_cents!=coalesce(sum(f.amount_brl_cents),0)`],
  ["order fee beneficiary margins",`SELECT a.id FROM topup_fee_allocations a LEFT JOIN topup_fee_order_shares s ON s.fee_allocation_id=a.id WHERE a.order_id IS NOT NULL AND a.reverses_id IS NULL GROUP BY a.id HAVING a.amount_brl_cents!=coalesce(sum(s.amount_brl_cents),0)`],
  ["topup fee budget",`SELECT t.id FROM hubbuy_topups t JOIN topup_fee_allocations a ON a.topup_id=t.id GROUP BY t.id HAVING sum(CASE WHEN a.reverses_id IS NULL THEN a.amount_brl_cents ELSE -a.amount_brl_cents END)>t.fee_brl_cents OR sum(CASE WHEN a.reverses_id IS NULL THEN a.amount_brl_cents ELSE -a.amount_brl_cents END)<0`],
  ["freight refund margins",`SELECT r.id FROM package_freight_refunds r LEFT JOIN package_freight_refund_sources s ON s.refund_id=r.id GROUP BY r.id HAVING r.native_minor!=coalesce(sum(s.native_minor),0) OR r.historical_brl_cents!=coalesce(sum(s.historical_brl_cents),0)`],
  ["receipt allocation margins",`SELECT r.id FROM package_settlement_receipts r LEFT JOIN package_settlement_receipt_allocations a ON a.receipt_id=r.id WHERE r.returns_receipt_id IS NULL GROUP BY r.id HAVING r.amount_brl_cents!=r.excess_brl_cents+coalesce(sum(a.amount_brl_cents),0)`],
  ["active claim capacity",`SELECT c.id FROM package_settlement_claims c JOIN package_settlement_receipt_allocations a ON a.claim_id=c.id WHERE NOT EXISTS(SELECT 1 FROM package_settlement_receipt_reversals x WHERE x.receipt_id=a.receipt_id) GROUP BY c.id HAVING sum(a.amount_brl_cents)>c.amount_minor`],
  ["freight heads",`SELECT h.package_id FROM package_freight_heads h JOIN package_freight_payments p ON p.id=h.payment_id WHERE p.package_id!=h.package_id OR EXISTS(SELECT 1 FROM package_freight_reversals r WHERE r.payment_id=p.id)`],
 ] as const;
 for(const [name,sql] of invariants){if((await client.execute(sql)).rows.length)throw new Error(`Financial invariant failed: ${name}`);}
 return {tables:tables.length,triggers,invariants:invariants.length};
}
