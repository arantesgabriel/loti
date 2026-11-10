import { describe,it,expect } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { fixture,favorite } from "./helpers";
import * as s from "@/lib/db/schema";
import { warehouseServices, warehouseQuerySchema } from "@/lib/domain/warehouse-services";
import { logisticsPackageServices } from "@/lib/domain/logistics-package-services";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import { packageCostServices } from "@/lib/domain/package-cost-services";
import { eq } from "drizzle-orm";
import {readWorkflowFinancialSummary} from "@/lib/domain/logistics-financials";
import {listLogisticsPackages} from "@/lib/domain/logistics-package-list";
import { orderStage } from "@/components/orders/orders-list-state";

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
  it("searches open package destinations and moves reservations atomically",async()=>{
    const f=await fixture(":memory:","orders");
    try{
      const account=await hubbuyBalanceServices(f.db,"alice").createAccount({workspaceId:"workspace",idempotencyKey:"move-account",label:"Conta de montagem",confirmZeroBalance:true});
      const purchase=await f.alice.savePurchase({name:"Pedido para trocar de pacote"});
      await f.alice.saveManualItem({name:"Produto reservado",url:"https://shop.test/reserved",unitPriceCents:250,quantity:3,sharingMode:"equal",participants:[{personId:"alice"}]});
      await f.alice.finalizePurchase(purchase.id,true);
      const service=warehouseServices(f.db,"alice");
      let row=(await service.list()).rows[0];
      await service.execute("workspace","move-receive",{operation:"receive",costItemId:row.costItemId,expectedRevision:row.revision,accountId:account.accountId,units:[0,1,2],reason:"Chegada conferida"});
      row=(await service.list()).rows[0];
      const sourceId=(await service.execute("workspace","move-source",{operation:"reserve",accountId:account.accountId,name:"Pacote origem",selection:[{costItemId:row.costItemId,expectedRevision:row.revision,units:[0]}],reason:"Montagem inicial"})).id;
      row=(await service.list()).rows[0];
      const targetId=(await service.execute("workspace","move-target",{operation:"reserve",accountId:account.accountId,name:"Pacote destino novembro",selection:[{costItemId:row.costItemId,expectedRevision:row.revision,units:[1]}],reason:"Montagem de destino"})).id;

      const options=await service.list(warehouseQuerySchema.parse({packageAccountId:account.accountId,packageSearch:"DESTINO NOVEMBRO"}));
      expect(options.packageOptions).toMatchObject({total:1,hasMore:false});
      expect(options.packages.find(pkg=>pkg.id===targetId)?.name).toBe("Pacote destino novembro");
      expect(orderStage((await service.list()).rows[0],(await service.list()).packages).label).toBe("Vinculado");

      const packages=logisticsPackageServices(f.db,"alice");
      const source=await packages.get(sourceId),target=await packages.get(targetId);
      const sourceReservation=source.reservations.find(reservation=>reservation.unitIndex===0)!;
      const command={operation:"move",packageId:sourceId,targetPackageId:targetId,expectedRevision:source.pkg.revision,targetRevision:target.pkg.revision,reservationIds:[sourceReservation.id],reason:"Consolidar no pacote de novembro"};
      const moved=await service.execute("workspace","move-once",command);
      expect(moved).toEqual({id:targetId});
      expect(await service.execute("workspace","move-once",command)).toEqual(moved);
      const after=await service.list();
      expect(after.rows[0].reservations.map(reservation=>[reservation.packageId,reservation.unitIndex]).sort()).toEqual([[targetId,0],[targetId,1]]);
      expect((await packages.get(sourceId)).reservations).toHaveLength(0);
      expect((await packages.get(targetId)).reservations).toHaveLength(2);
      expect((await f.db.select().from(s.logisticsEvents).all()).filter(event=>event.action==="move")).toHaveLength(2);
      const searched=await service.list(warehouseQuerySchema.parse({packageAccountId:account.accountId,packageSearch:"origem"}));
      expect(searched.packageOptions.total).toBe(1);
      expect(searched.packages.some(pkg=>pkg.id===sourceId)).toBe(true);
    }finally{f.client.close();}
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
      const sentList=await listLogisticsPackages(f.db,"alice",{page:0,filter:"sent"});
      expect(sentList.rows.find(row=>row.pkg.id===reserved.id)?.unitCount).toBe(pkg.unitCount);
      expect(sentList.counts.sent).toBeGreaterThanOrEqual(1);
      expect(pkg.unitCount).toBe(pkg.reservations.length);
      await packages.execute(reserved.id,"received",{operation:"receive",expectedRevision:pkg.pkg.revision,reason:"Entrega manual conferida",confirmed:true});
      pkg=await packages.get(reserved.id);expect(pkg.pkg.stage).toBe("received");
      const receivedList=await listLogisticsPackages(f.db,"alice",{page:0,filter:"received"});
      expect(receivedList.rows.find(row=>row.pkg.id===reserved.id)?.unitCount).toBe(pkg.unitCount);
      expect(receivedList.counts.received).toBeGreaterThanOrEqual(1);
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

describe("incremental warehouse arrivals", () => {
  it("rolls back the batch, registers partial arrivals, and returns the latest position on replay", async () => {
    const f = await fixture(":memory:", "orders");
    try {
      const { accountId } = await hubbuyBalanceServices(f.db, "alice").createAccount({ workspaceId: "workspace", idempotencyKey: "arrival-account", label: "Conta de chegada", confirmZeroBalance: true });
      const purchase = await f.alice.savePurchase({ name: "Chegadas em lote" });
      for (const name of ["Álbum", "Bota"]) {
        await f.alice.saveManualItem({ name, url: "https://shop.test/item", unitPriceCents: 250, quantity: 3, sharingMode: "equal", participants: [{ personId: "alice" }] });
      }
      await f.alice.finalizePurchase(purchase.id, true);
      const service = warehouseServices(f.db, "alice");
      const query = warehouseQuerySchema.parse({ sort: "product", pageSize: 1 });
      const first = (await service.list(query)).rows[0];
      const second = (await service.list({ ...query, page: 1 })).rows[0];
      expect([first.name, second.name]).toEqual(["Álbum", "Bota"]);
      const arrivals = [first, second].map(row => ({ costItemId: row.costItemId, expectedRevision: row.revision, accountId, quantity: 1 }));
      const eventsBefore = (await f.db.select().from(s.logisticsEvents).all()).length;
      await expect(service.execute("workspace", "invalid-batch", { operation: "register-arrivals", arrivals: [arrivals[0], { ...arrivals[1], quantity: 4 }] })).rejects.toMatchObject({ status: 409 });
      expect((await service.list()).rows.every(row => row.receivedUnits.length === 0)).toBe(true);
      expect(await f.db.select().from(s.logisticsEvents).all()).toHaveLength(eventsBefore);
      const batch = { operation: "register-arrivals", arrivals };
      const registered = await service.execute("workspace", "arrival-batch", batch);
      expect(registered.rows).toHaveLength(2);
      expect(registered.rows?.map(row => row.availableUnits)).toEqual([[0], [0]]);
      const next = await service.execute("workspace", "arrival-single", { operation: "register-arrival", ...arrivals[0], expectedRevision: first.revision + 1, description: "  " });
      expect(next.rows?.[0].receivedUnits).toEqual([0, 1]);
      await expect(service.execute("workspace", "stale-batch", {
        operation: "register-arrivals",
        arrivals: [{ ...arrivals[1], expectedRevision: second.revision + 1 }, arrivals[0]],
      })).rejects.toMatchObject({ status: 409, code: "WAREHOUSE_REVISION_CONFLICT" });
      expect((await service.list()).rows.find(row => row.costItemId === second.costItemId)?.receivedUnits).toEqual([0]);
      const replay = await service.execute("workspace", "arrival-batch", batch);
      expect(replay.rows?.find(row => row.costItemId === first.costItemId)?.receivedUnits).toEqual([0, 1]);
      expect((await service.list()).suggestedArrivalAccountId).toBe(accountId);
      expect(await f.db.select().from(s.logisticsEvents).all()).toHaveLength(eventsBefore + 3);
      await expect(service.execute("workspace", "arrival-batch", { ...batch, arrivals: [arrivals[0]] })).rejects.toMatchObject({ status: 409 });
      const byUnits = await service.list(warehouseQuerySchema.parse({ sort: "units", direction: "desc", pageSize: 1 }));
      expect(byUnits.rows[0].costItemId).toBe(first.costItemId);
      const byStage = await service.list(warehouseQuerySchema.parse({ sort: "stage", pageSize: 1 }));
      expect(orderStage(byStage.rows[0], byStage.packages).label).toBe("Etapas diferentes");
      const byCost = await service.list(warehouseQuerySchema.parse({ sort: "cost", direction: "desc" }));
      expect(byCost.rows.map(row => row.financial?.total.knownCents)).toEqual(
        [...byCost.rows.map(row => row.financial?.total.knownCents ?? -1)].sort((left, right) => right - left),
      );
    } finally { f.client.close(); }
  });
});
