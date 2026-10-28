import {it,expect} from "vitest";
import {eq} from "drizzle-orm";
import {migrate} from "drizzle-orm/libsql/migrator";
import {fixture} from "./helpers";
import * as s from "@/lib/db/schema";
import {packageCostServices} from "@/lib/domain/package-cost-services";
import {warehouseServices,warehouseQuerySchema} from "@/lib/domain/warehouse-services";
import {warehousePage} from "@/lib/domain/warehouse-query";
import {logisticsPackageServices} from "@/lib/domain/logistics-package-services";
import {hubbuyBalanceServices} from "@/lib/domain/hubbuy-balance-services";
import {readWorkflowFinancialSummary,addWorkflowMoney} from "@/lib/domain/logistics-financials";
import {listLogisticsPackages} from "@/lib/domain/logistics-package-list";
import {verifyDatabase} from "../../scripts/database-verification";
import {randomUUID} from "node:crypto";
import {execFile} from "node:child_process";
import {promisify} from "node:util";

async function legacy(stage:"preparing"|"sent"|"received"="preparing",url=":memory:"){
  const f=await fixture(url,"legacy",{localConcurrency:1});
  const purchase=await f.alice.savePurchase({name:"Legado financeiro QA"});
  await f.alice.saveManualItem({name:"Item compartilhado QA",url:"https://shop.test/qa",quantity:2,unitPriceCents:101,sharingMode:"equal",participants:[{personId:"alice"},{personId:"bob"}]});
  await f.alice.finalizePurchase(purchase.id,true);
  const costs=packageCostServices(f.db,"alice"),t=await costs.startTracking(purchase.id);let d=await costs.getTracking(t.id);
  d=await costs.saveItemCosts(t.id,{expectedRevision:d.tracking.revision,itemId:d.items[0].id,effectivePriceState:"known",effectivePriceUnitCents:101,chinaFreightState:"no_charge",chinaFreightUnitCents:null});
  d=await costs.saveCharge(t.id,d.productsCharge!.id,{expectedRevision:d.tracking.revision,chargeType:"products",paymentMethod:"pix"});
  d=await costs.markChargePaid(t.id,d.productsCharge!.id,{expectedRevision:d.tracking.revision});
  d=await costs.saveCharge(t.id,d.packages[0].brazilFreightCharge!.id,{expectedRevision:d.tracking.revision,chargeType:"brazil_freight",valueState:"known",amountCents:101,paymentMethod:"pix"});
  // Synthetic pre-cutover historical bootstrap: no known date to manufacture.
  if(stage!=="preparing")await f.db.update(s.purchasePackages).set({logisticsStatus:stage,contentSealSource:"legacy_locked",contentSealedAt:null,contentSealedBy:null}).where(eq(s.purchasePackages.id,d.packages[0].id)).run();
  const {accountId}=await hubbuyBalanceServices(f.db,"alice").createAccount({workspaceId:"workspace",idempotencyKey:"account-qa",label:"Conta QA",confirmZeroBalance:true});
  await migrate(f.db,{migrationsFolder:"./drizzle"});
  const warehouse=warehouseServices(f.db,"alice"),packages=logisticsPackageServices(f.db,"alice"),row=(await warehouse.list()).rows[0];
  await warehouse.execute("workspace","arrival",{operation:"receive",costItemId:row.costItemId,expectedRevision:row.revision,accountId,units:[0,1],reason:"Chegada conferida agora"});
  let pkg=await packages.get(d.packages[0].id);
  await packages.execute(pkg.pkg.id,"review",{operation:"review",expectedRevision:pkg.pkg.revision,accountId,reason:"Conta e conteúdo conferidos agora",confirmed:true});
  pkg=await packages.get(pkg.pkg.id);
  return {...f,warehouse,packages,pkg,accountId};
}

it("never reactivates legacy money or payment after known -> pending, including read-only operational verification",async()=>{
  const f=await legacy();try{
    expect((await readWorkflowFinancialSummary(f.db,"alice")).packageChargesCents).toBe(102);
    for(const [valueState,amountCents] of [["known",203],["pending",null]] as const){
      const pkg=await f.packages.get(f.pkg.pkg.id);
      await f.packages.execute(pkg.pkg.id,`charge-${valueState}`,{operation:"record_charge",expectedRevision:pkg.pkg.revision,charge:"freight",valueState,amountCents,paymentMethod:amountCents===null?null:"pix",feeBps:amountCents===null?null:100,reason:"Cotação revisada explicitamente"});
      const summary=await readWorkflowFinancialSummary(f.db,"alice");
      expect(summary.packageChargesCents).toBe(amountCents===null?0:205);
      expect(summary.people.reduce((n,p)=>n+p.totalCents,0)).toBe(summary.knownCents);
    }
    const detail=await f.packages.get(f.pkg.pkg.id);
    expect(detail.ownership.freight).toBe(true);
    expect(detail.legacyProjections.find(c=>c.chargeType==="brazil_freight")?.active).toBe(false);
    expect(detail.inPackage).toBe(false);
    expect((await readWorkflowFinancialSummary(f.db,"alice")).finalCents).toBeNull();
    expect((await verifyDatabase(f.client)).logistics.invariants).toBeGreaterThan(0);
    await f.client.execute("DROP TRIGGER logistics_refund_overlap");
    await expect(verifyDatabase(f.client)).rejects.toThrow("Missing logistics trigger");
  }finally{f.client.close();}
});

it.each(["sent","received"] as const)("confirms %s legacy content with unknown dates without inventing dispatch or payment",async stage=>{
  const f=await legacy(stage);try{
    const before=await f.db.select().from(s.purchaseCostCharges).all();
    expect(f.pkg.pkg.dispatchedAt).toBeNull();expect(f.pkg.pkg.receivedAt).toBeNull();
    await f.packages.execute(f.pkg.pkg.id,"confirm-content",{operation:"confirm_legacy_content",expectedRevision:f.pkg.pkg.revision,reason:"Conteúdo conferido na data atual",confirmed:true});
    const after=await f.packages.get(f.pkg.pkg.id);
    expect(after.pkg.stage).toBe(stage);expect(after.pkg.contentClosedAt).toBeInstanceOf(Date);
    expect(after.pkg.dispatchedAt).toBeNull();expect(after.pkg.receivedAt).toBeNull();expect(after.pkg.freightPaidAt).toBeNull();
    expect(await f.db.select().from(s.purchaseCostCharges).all()).toEqual(before);
    expect(after.inPackage).toBe(false);
    expect((await verifyDatabase(f.client)).status).toBe("ok");
  }finally{f.client.close();}
});

it("pages package candidates and package summaries without workspace reservations in each response",async()=>{
  const f=await legacy();try{
    await f.db.insert(s.logisticsPackages).values(Array.from({length:105},(_,i)=>({id:`qa-package-${String(i).padStart(3,"0")}`,workspaceId:"workspace",accountId:f.accountId,name:`Pacote QA ${i}`,reviewState:"confirmed" as const,createdAt:new Date()}))).run();
    const first=await listLogisticsPackages(f.db,"alice",{page:0,filter:"preparing"});
    const second=await listLogisticsPackages(f.db,"alice",{page:1,filter:"preparing"});
    expect(first.rows).toHaveLength(20);expect(second.rows).toHaveLength(20);expect(first.pagination.total).toBe(106);
    expect(new Set([...first.rows,...second.rows].map(r=>r.pkg.id)).size).toBe(40);
    const options=await f.warehouse.list(warehouseQuerySchema.parse({pageSize:1}));
    expect(options.packageOptions.hasMore).toBe(true);expect(options.packages.length).toBeLessThanOrEqual(101);
    const later=await f.warehouse.list(warehouseQuerySchema.parse({pageSize:1,packagePage:1}));
    expect(later.packageOptions.hasMore).toBe(false);
    expect(later.rows[0].costItemId).toBe(options.rows[0].costItemId);
    const empty=await f.warehouse.list(warehouseQuerySchema.parse({search:"does-not-exist"}));
    expect(empty.rows).toEqual([]);expect(empty.reservations).toEqual([]);expect(empty.pagination.total).toBe(0);
    await expect(listLogisticsPackages(f.db,"outsider",{page:0,filter:"preparing"})).rejects.toMatchObject({status:403});
    await f.db.update(s.logisticsPackages).set({name:"Renamed"}).where(eq(s.logisticsPackages.id,first.rows[0].pkg.id));
    expect((await listLogisticsPackages(f.db,"alice",{page:0,filter:"preparing"})).rows.map(r=>r.pkg.id)).toEqual(first.rows.map(r=>r.pkg.id));
  }finally{f.client.close();}
});

it("keeps package list and detail unit counts aligned for active, partially released, and released reservations",async()=>{
  const f=await legacy();
  try{
    const packageId=f.pkg.pkg.id;
    const packages=logisticsPackageServices(f.db,"alice");
    await f.db.insert(s.logisticsPackages).values(Array.from({length:20},(_,i)=>({
      id:`!qa-package-${String(i).padStart(3,"0")}`,
      workspaceId:"workspace",
      name:`Pacote de paginação ${i}`,
      reviewState:"confirmed" as const,
      createdAt:new Date(),
    }))).run();

    const financialState=async()=>({
      summary:await readWorkflowFinancialSummary(f.db,"alice"),
      purchases:await f.db.select().from(s.purchases).all(),
      purchaseItems:await f.db.select().from(s.purchaseItems).all(),
      purchaseParticipants:await f.db.select().from(s.purchaseItemParticipants).all(),
      trackings:await f.db.select().from(s.purchaseCostTrackings).all(),
      itemCosts:await f.db.select().from(s.purchaseItemCosts).all(),
      costParticipants:await f.db.select().from(s.purchaseCostParticipants).all(),
      charges:await f.db.select().from(s.purchaseCostCharges).all(),
      refunds:await f.db.select().from(s.purchaseCostRefunds).all(),
      refundParticipants:await f.db.select().from(s.purchaseCostRefundParticipants).all(),
      refundEvents:await f.db.select().from(s.purchaseCostRefundEvents).all(),
    });
    const before=await financialState();
    const detailBefore=await packages.get(packageId);
    expect(detailBefore.unitCount).toBe(2);
    expect(detailBefore.reservations).toHaveLength(2);

    const firstPage=await listLogisticsPackages(f.db,"alice",{page:0,filter:"preparing"});
    const secondPage=await listLogisticsPackages(f.db,"alice",{page:1,filter:"preparing"});
    expect(firstPage.rows).toHaveLength(20);
    expect(firstPage.pagination.hasMore).toBe(true);
    const packageOnSecondPage=secondPage.rows.find(row=>row.pkg.id===packageId);
    expect(packageOnSecondPage?.unitCount).toBe(detailBefore.unitCount);
    expect(secondPage.pagination.hasMore).toBe(false);

    const releasedReservation=detailBefore.reservations[0];
    await f.warehouse.execute("workspace","release-one-unit",{
      operation:"release",packageId,expectedRevision:detailBefore.pkg.revision,
      reservationIds:[releasedReservation.id],reason:"Retirada parcial sintética",
    });
    const partialDetail=await packages.get(packageId);
    const partialList=await listLogisticsPackages(f.db,"alice",{page:1,filter:"preparing"});
    expect(partialDetail.unitCount).toBe(1);
    expect(partialDetail.reservations).toHaveLength(1);
    expect(partialList.rows.find(row=>row.pkg.id===packageId)?.unitCount).toBe(1);
    expect((await f.db.select().from(s.logisticsReservations).where(eq(s.logisticsReservations.id,releasedReservation.id)).get())?.releasedAt).toBeInstanceOf(Date);

    await f.warehouse.execute("workspace","release-remaining-units",{
      operation:"release",packageId,expectedRevision:partialDetail.pkg.revision,
      reservationIds:partialDetail.reservations.map(row=>row.id),reason:"Retirada integral sintética",
    });
    const releasedDetail=await packages.get(packageId);
    const releasedList=await listLogisticsPackages(f.db,"alice",{page:1,filter:"preparing"});
    expect(releasedDetail.unitCount).toBe(0);
    expect(releasedDetail.reservations).toHaveLength(0);
    expect(releasedList.rows.find(row=>row.pkg.id===packageId)?.unitCount).toBe(0);
    expect((await f.db.select().from(s.logisticsReservations).where(eq(s.logisticsReservations.packageId,packageId)).all()).every(row=>row.releasedAt instanceof Date)).toBe(true);
    expect(await financialState()).toEqual(before);
  }finally{f.client.close();}
});

it("rejects unsafe consolidated money before losing precision",()=>{
  expect(addWorkflowMoney(Number.MAX_SAFE_INTEGER-1,1)).toBe(Number.MAX_SAFE_INTEGER);
  expect(()=>addWorkflowMoney(Number.MAX_SAFE_INTEGER,1)).toThrow();
  expect(()=>addWorkflowMoney(1.5,0)).toThrow();
});

it("filters unit stages in SQL and pages beyond ten thousand positions before enrichment",async()=>{
  const f=await legacy();try{
    const q=(status:string)=>warehouseQuerySchema.parse({status});
    expect((await f.warehouse.list(q("warehouse"))).pagination.total).toBe(1);
    expect((await f.warehouse.list(q("available"))).pagination.total).toBe(0);
    expect((await f.warehouse.list(q("package"))).pagination.total).toBe(0);
    expect((await f.warehouse.list(q("awaiting"))).pagination.total).toBe(0);
    expect((await f.warehouse.list(q("sent"))).pagination.total).toBe(0);
    expect((await f.warehouse.list(q("received"))).pagination.total).toBe(0);
    const row=(await f.warehouse.list()).rows[0];
    // Synthetic scale fixture: clone only explicit QA rows, with independent IDs.
    for(const [table,source] of [["purchase_items",row.cost.purchaseItemId!],["purchase_item_costs",row.costItemId]] as const){
      const columns=(await f.client.execute(`PRAGMA table_info(${table})`)).rows.map(c=>String(c.name));
      const fields=columns.map(c=>c==="id"?`'scale-${table}-'||n.x`:table==="purchase_item_costs" && c==="purchase_item_id"?`'scale-purchase_items-'||n.x`:`original."${c}"`);
      await f.client.execute({sql:`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<10001) INSERT INTO ${table} (${columns.map(c=>`"${c}"`).join(",")}) SELECT ${fields.join(",")} FROM n CROSS JOIN ${table} original WHERE original.id=?`,args:[source]});
    }
    const page=await warehousePage(f.db,"workspace",warehouseQuerySchema.parse({page:500,pageSize:20}));
    expect(page.total).toBe(10002);expect(page.ids).toHaveLength(2);
    expect((await warehousePage(f.db,"other",warehouseQuerySchema.parse({}))).total).toBe(0);
    const onlyReview=await warehousePage(f.db,"workspace",q("review"));expect(onlyReview.total).toBe(0);
  }finally{f.client.close();}
});

it("keeps the financial read on one snapshot while an independent process replaces a legacy charge",async()=>{
  const target=`file:./data/orders-transition-race-${randomUUID()}.sqlite`,f=await legacy("preparing",target);
  try{
    await f.client.execute("PRAGMA journal_mode=WAL");
    const before=await readWorkflowFinancialSummary(f.db,"alice");
    let written=false;
    const intercepted=new Proxy(f.db,{get(db,key){
      if(key!=="$client")return Reflect.get(db,key);
      return new Proxy(f.client,{get(client,method){
        if(method!=="transaction")return Reflect.get(client,method);
        return async (...args:Parameters<typeof client.transaction>)=>{
          const transaction=await client.transaction(...args),execute=transaction.execute.bind(transaction);
          transaction.execute=async statement=>{
            const result=await execute(statement),query=typeof statement==="string"?statement:statement.sql;
            if(!written && query.includes('from "logistics_packages"')){
              written=true;
              const writer=await promisify(execFile)(process.execPath,["--import","tsx","tests/integration/warehouse-concurrent-worker.ts"],{env:{...process.env,TURSO_AUTH_TOKEN:"",LOTI_WAREHOUSE_TEST_DATABASE:target,LOTI_WAREHOUSE_TEST_KEY:"snapshot-writer",LOTI_WAREHOUSE_TEST_PACKAGE:f.pkg.pkg.id,LOTI_WAREHOUSE_TEST_COMMAND:JSON.stringify({operation:"record_charge",expectedRevision:f.pkg.pkg.revision,charge:"freight",valueState:"known",amountCents:203,paymentMethod:"pix",feeBps:100,reason:"Concurrent synthetic charge"})},windowsHide:true,timeout:30000});
              expect(JSON.parse(writer.stdout),writer.stdout).toMatchObject({ok:true});
            }
            return result;
          };
          return transaction;
        };
      }});
    }});
    const during=await readWorkflowFinancialSummary(intercepted,"alice");
    expect(written).toBe(true);expect(during).toEqual(before);
    expect((await readWorkflowFinancialSummary(f.db,"alice")).packageChargesCents).toBe(205);
  }finally{f.client.close();}
},60000);
