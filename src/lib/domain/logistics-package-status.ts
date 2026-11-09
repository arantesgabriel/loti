import {sql} from "drizzle-orm";
/** Match the immutable-event ownership rule in packageChargeOwnership(). */
export function freightPaidSql(alias:"p"|"logistics_packages"){
  const field=(name:string)=>sql`${sql.identifier(alias)}.${sql.identifier(name)}`;
  return sql`(${field("freight_paid_at")} IS NOT NULL OR (${field("freight_state")}='pending' AND NOT EXISTS(SELECT 1 FROM logistics_events e WHERE e.workspace_id=${field("workspace_id")} AND e.resource_id=${field("id")} AND e.action IN ('record_charge','correct_charge','pay_charge') AND json_extract(e.after,'$.command.charge')='freight') AND EXISTS(SELECT 1 FROM purchase_cost_charges ch WHERE ch.package_id=${field("legacy_package_id")} AND ch.charge_type='brazil_freight' AND ch.payment_status='paid' AND ch.paid_at IS NOT NULL)))`;
}
