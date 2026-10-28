import { describe,it,expect } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { fixture,favorite } from "./helpers";
import * as s from "@/lib/db/schema";
import { warehouseServices } from "@/lib/domain/warehouse-services";
import { logisticsPackageServices } from "@/lib/domain/logistics-package-services";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import { packageCostServices } from "@/lib/domain/package-cost-services";
import { eq } from "drizzle-orm";
import {readWorkflowFinancialSummary} from "@/lib/domain/logistics-financials";
import {listLogisticsPackages} from "@/lib/domain/logistics-package-list";

describe("orders warehouse workflow",() => {
  it("finalizes without packages or payment and reserves only explicitly received units",async () => {
    const f = await fixture(":memory:","orders");
    try {
      const purchase = await f.alice.savePurchase({name:"Orders QA"});
      const fav = await f.alice.saveFavorite(favorite);
      await f.alice.addFavoriteToPurchase({favoriteId:fav.id,personId:"alice",quantity:2,unitPriceCents:favorite.priceCents});
      await f.alice.finalizePurchase(purchase.id,true);
      expect(await f.db.select().from(s.purchasePackages).all()).toEqual([]);
      expect(await f.db.select().from(s.logisticsPackages).all()).toEqual([]);
      expect((await f.db.select().from(s.purchaseCostCharges).all()).map(c => c.paymentStatus)).toEqual(["pending"]);
      const service = warehouseServices(f.db,"alice"), initial = await service.list();
      expect(initial.rows).toHaveLength(1);
      expect(initial.rows[0].receivedUnits).toEqual([]);
      await expect(warehouseServices(f.db,"outsider").list()).rejects.toMatchObject({status:403});
      await migrate(f.db,{migrationsFolder:"./drizzle"});
      expect((await service.list()).rows).toHaveLength(1);
      expect((await f.client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
    } finally {f.client.close();}
  });
  it("combines purchases, replays reservations and separates content, freight, dispatch and financial closure",async()=>{
    const f=await fixture(":memory:","orders");
    try {
      const account=await hubbuyBalanceServices(f.db,"alice").createAccount({workspaceId:"workspace",idempotencyKey:"warehouse-account",label:"Conta QA",confirmZeroBalance:true});
      const service=warehouseServices(f.db,"alice"),financial=packageCostServices(f.db,"alice");
      for(let i=0;i<2;i++){
        const p=await f.alice.savePurchase({name:`Compra ${i}`});
        await f.alice.saveManualItem({name:`Item ${i}`,url:`https://shop.test/item-${i}`,unitPriceCents:101,quantity:3,sharingMode:"equal",participants:[{personId:"alice"},{personId:"bob"}]});
        await f.alice.finalizePurchase(p.id,true);
        const t=await financial.startTracking(p.id);let d=await financial.getTracking(t.id);
        d=await financial.saveItemCosts(t.id,{expectedRevision:d.tracking.revision,itemId:d.items[0].id,effectivePriceState:"known",effectivePriceUnitCents:101,chinaFreightState:"no_charge",chinaFreightUnitCents:null});
        d=await financial.saveCharge(t.id,d.productsCharge!.id,{expectedRevision:d.tracking.revision,chargeType:"products",paymentMethod:"pix"});
        d=await financial.markChargePaid(t.id,d.productsCharge!.id,{expectedRevision:d.tracking.revision});
        expect(d.calculation.summary.totalCents).not.toBeNull();
        // Product financial closure does not require any package.
        await financial.closeTracking(t.id,{expectedRevision:d.tracking.revision,confirmed:true});
      }
      let rows=(await service.list()).rows;
      for(const row of rows)await service.execute("workspace",`receive-${row.costItemId}`,{operation:"receive",costItemId:row.costItemId,expectedRevision:row.revision,accountId:account.accountId,units:[0,2],reason:"Chegada parcial conferida"});
      rows=(await service.list()).rows;
      const command={operation:"reserve",accountId:account.accountId,name:"Duas compras",selection:rows.map(r=>({costItemId:r.costItemId,expectedRevision:r.revision,units:[2]})),reason:"Envio conjunto conferido"};
      const reserved=await service.execute("workspace","reserve-once",command);
      expect(await service.execute("workspace","reserve-once",command)).toEqual(reserved);
      await expect(service.execute("workspace","reserve-again",command)).rejects.toMatchObject({status:409});
      expect((await service.list()).reservations).toHaveLength(2);
      const packages=logisticsPackageServices(f.db,"alice");let pkg=await packages.get(reserved.id);
      const preparingList=await listLogisticsPackages(f.db,"alice",{page:0,filter:"preparing"});
      expect(preparingList.rows.find(row=>row.pkg.id===reserved.id)?.unitCount).toBe(pkg.unitCount);
      expect(pkg.unitCount).toBe(pkg.reservations.length);
      await expect(packages.execute(reserved.id,"early-dispatch",{operation:"dispatch",expectedRevision:pkg.pkg.revision,reason:"Tentativa antecipada",confirmed:true})).rejects.toMatchObject({status:409});
      await packages.execute(reserved.id,"seal",{operation:"close_content",expectedRevision:pkg.pkg.revision,reason:"Manifesto conferido",confirmed:true});
      pkg=await packages.get(reserved.id);expect(pkg.inPackage).toBe(false);
      const contentClosedList=await listLogisticsPackages(f.db,"alice",{page:0,filter:"content_closed"});
      expect(contentClosedList.rows.find(row=>row.pkg.id===reserved.id)?.unitCount).toBe(pkg.unitCount);
      expect(pkg.unitCount).toBe(pkg.reservations.length);
      await expect(service.execute("workspace","sealed-release",{operation:"release",packageId:reserved.id,expectedRevision:pkg.pkg.revision,reservationIds:pkg.reservations.map(r=>r.id),reason:"Retirada bloqueada"})).rejects.toMatchObject({status:409});
      await packages.execute(reserved.id,"freight-paid",{operation:"pay_charge",expectedRevision:pkg.pkg.revision,charge:"freight",amountCents:101,paymentMethod:"pix",feeBps:100,reason:"Comprovante sintético",confirmed:true});
      pkg=await packages.get(reserved.id);expect(pkg.inPackage).toBe(true);expect(pkg.pkg.stage).toBe("preparing");
      await packages.execute(reserved.id,"customs-zero",{operation:"pay_charge",expectedRevision:pkg.pkg.revision,charge:"customs",amountCents:0,paymentMethod:"pix",feeBps:0,reason:"Isenção conferida",confirmed:true});
      pkg=await packages.get(reserved.id);
      await packages.execute(reserved.id,"close-money",{operation:"close_financial",expectedRevision:pkg.pkg.revision,reason:"Custos conferidos",confirmed:true});
      pkg=await packages.get(reserved.id);
      const financiallyClosedList=await listLogisticsPackages(f.db,"alice",{page:0,filter:"closed"});
      expect(financiallyClosedList.rows.find(row=>row.pkg.id===reserved.id)?.unitCount).toBe(pkg.unitCount);
      expect(pkg.unitCount).toBe(pkg.reservations.length);
      await packages.execute(reserved.id,"dispatch",{operation:"dispatch",expectedRevision:pkg.pkg.revision,reason:"Despacho manual conferido",confirmed:true});
      pkg=await packages.get(reserved.id);expect(pkg.pkg.stage).toBe("sent");
      expect((await listLogisticsPackages(f.db,"alice",{page:0,filter:"sent"})).rows.find(row=>row.pkg.id===reserved.id)?.unitCount).toBe(pkg.unitCount);
      expect(pkg.unitCount).toBe(pkg.reservations.length);
      await packages.execute(reserved.id,"received",{operation:"receive",expectedRevision:pkg.pkg.revision,reason:"Entrega manual conferida",confirmed:true});
      pkg=await packages.get(reserved.id);expect(pkg.pkg.stage).toBe("received");
      expect((await listLogisticsPackages(f.db,"alice",{page:0,filter:"received"})).rows.find(row=>row.pkg.id===reserved.id)?.unitCount).toBe(pkg.unitCount);
      expect(pkg.unitCount).toBe(pkg.reservations.length);
      const summary=await readWorkflowFinancialSummary(f.db,"alice");
      expect(summary.ordersCents).toBe(612);
      expect(summary.packageChargesCents).toBe(102);
      expect(summary.knownCents).toBe(714);
      expect(summary.people.reduce((n,p)=>n+p.totalCents,0)).toBe(summary.knownCents);
      const beforeCorrection=await packages.get(reserved.id);
      await packages.execute(reserved.id,"reopen-money",{operation:"reopen_financial",expectedRevision:beforeCorrection.pkg.revision,reason:"Conferência de comprovante corrigido",confirmed:true});
      pkg=await packages.get(reserved.id);
      await packages.execute(reserved.id,"correct-freight",{operation:"correct_charge",expectedRevision:pkg.pkg.revision,charge:"freight",valueState:"known",amountCents:103,paymentMethod:"pix",feeBps:100,reason:"Correção explícita do comprovante de frete",confirmedPaymentReset:true});
      pkg=await packages.get(reserved.id);
      expect(pkg.pkg.stage).toBe("received");expect(pkg.pkg.freightPaidAt).toBeNull();
      expect(pkg.manifests.filter(m=>beforeCorrection.manifests.some(old=>old.id===m.id))).toEqual(beforeCorrection.manifests);
      await packages.execute(reserved.id,"confirm-corrected-freight",{operation:"pay_charge",expectedRevision:pkg.pkg.revision,charge:"freight",amountCents:103,paymentMethod:"pix",feeBps:100,reason:"Conferência do comprovante corrigido",confirmed:true});
      expect((await packages.get(reserved.id)).pkg.stage).toBe("received");
      const corrected=await readWorkflowFinancialSummary(f.db,"alice");expect(corrected.ordersCents).toBe(612);expect(corrected.packageChargesCents).toBe(104);
      expect((await f.db.select().from(s.logisticsManifests).all()).length).toBeGreaterThan(0);
      await expect(f.db.update(s.logisticsManifests).set({snapshot:{}}).where(eq(s.logisticsManifests.packageId,reserved.id)).run()).rejects.toThrow();
      expect((await f.client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
    }finally{f.client.close();}
  });
});
