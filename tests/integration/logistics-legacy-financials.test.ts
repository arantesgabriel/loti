import {it,expect} from "vitest";
import {migrate} from "drizzle-orm/libsql/migrator";
import {fixture} from "./helpers";
import {packageCostServices} from "@/lib/domain/package-cost-services";
import {readWorkflowFinancialSummary,projectLegacyPackageCharge} from "@/lib/domain/logistics-financials";
import {logisticsLegacyCharges} from "@/lib/db/schema";
it("preserves captured legacy charge amounts and personal rounding through the compatibility bridge",async()=>{
  const f=await fixture();
  try{
    const p=await f.alice.savePurchase({name:"Encargos legados"});
    for(let i=0;i<2;i++)await f.alice.saveManualItem({name:`Legado ${i}`,url:`https://shop.test/legacy-${i}`,quantity:i===0?3:2,unitPriceCents:1000,sharingMode:"equal",participants:[{personId:"alice"},{personId:"bob"}]});
    await f.alice.finalizePurchase(p.id,true);
    const service=packageCostServices(f.db,"alice"),t=await service.startTracking(p.id);let d=await service.getTracking(t.id);
    for(const item of d.items)d=await service.saveItemCosts(t.id,{expectedRevision:d.tracking.revision,itemId:item.id,effectivePriceState:"known",effectivePriceUnitCents:1000,chinaFreightState:"no_charge",chinaFreightUnitCents:null});
    d=await service.saveCharge(t.id,d.productsCharge!.id,{expectedRevision:d.tracking.revision,chargeType:"products",paymentMethod:"pix"});
    d=await service.markChargePaid(t.id,d.productsCharge!.id,{expectedRevision:d.tracking.revision});
    const pkg=d.packages[0];
    d=await service.saveCharge(t.id,pkg.brazilFreightCharge!.id,{expectedRevision:d.tracking.revision,chargeType:"brazil_freight",valueState:"known",amountCents:101,paymentMethod:"pix"});
    d=await service.markChargePaid(t.id,pkg.brazilFreightCharge!.id,{expectedRevision:d.tracking.revision});
    d=await service.saveCharge(t.id,pkg.customsCharge!.id,{expectedRevision:d.tracking.revision,chargeType:"customs",valueState:"known",amountCents:23});
    d=await service.markChargePaid(t.id,pkg.customsCharge!.id,{expectedRevision:d.tracking.revision});
    const before=d.calculation.summary.partialCents,people=d.memberTotals.map(p=>({personId:p.personId,totalCents:p.totalCents})).sort((a,b)=>a.personId.localeCompare(b.personId));
    await migrate(f.db,{migrationsFolder:"./drizzle"});
    const after=await readWorkflowFinancialSummary(f.db,"alice");
    expect(after.knownCents).toBe(before);expect(after.packageChargesCents).toBe(125);
    expect(after.people.map(p=>({personId:p.personId,totalCents:p.totalCents})).sort((a,b)=>a.personId.localeCompare(b.personId))).toEqual(people);
    const bridges=await f.db.select().from(logisticsLegacyCharges).all();expect(bridges).toHaveLength(2);
    expect(bridges.reduce((n,b)=>n+projectLegacyPackageCharge(b.snapshot).knownCents,0)).toBe(125);
    for(const bridge of bridges)for(const item of projectLegacyPackageCharge(bridge.snapshot).items){
      expect(item.components.reduce((n,c)=>n+(c.amountCents??0),0)).toBe(item.amountCents);
      for(const person of item.people)expect(item.components.reduce((n,c)=>n+(c.people.find(p=>p.personId===person.personId)?.amountCents??0),0)).toBe(person.amountCents);
    }
    await expect(f.client.execute("DELETE FROM logistics_legacy_charges")).rejects.toThrow("IMMUTABLE_LEGACY_CHARGE_BRIDGE");
  }finally{f.client.close();}
});
