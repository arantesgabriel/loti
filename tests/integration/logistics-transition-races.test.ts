import {it,expect} from "vitest";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {randomUUID} from "node:crypto";
import {migrate} from "drizzle-orm/libsql/migrator";
import {fixture} from "./helpers";
import {warehouseServices} from "@/lib/domain/warehouse-services";
import {logisticsPackageServices} from "@/lib/domain/logistics-package-services";
import {packageCostServices} from "@/lib/domain/package-cost-services";
import {hubbuyBalanceServices} from "@/lib/domain/hubbuy-balance-services";
import * as tables from "@/lib/db/schema";

async function setup(legacy=false,quantity=1){
  const target=`file:./data/orders-transition-race-${randomUUID()}.sqlite`,f=await fixture(target,legacy?"legacy":"orders",{localConcurrency:1});
  await f.client.execute("PRAGMA journal_mode=WAL");
  const p=await f.alice.savePurchase({name:"Transição concorrente"});
  await f.alice.saveManualItem({name:"Peça concorrente",url:"https://shop.test/transition",quantity,unitPriceCents:100,personId:"alice"});await f.alice.finalizePurchase(p.id,true);
  const financial=packageCostServices(f.db,"alice"),tracking=await financial.startTracking(p.id);let d=await financial.getTracking(tracking.id);
  d=await financial.saveItemCosts(tracking.id,{expectedRevision:d.tracking.revision,itemId:d.items[0].id,effectivePriceState:"known",effectivePriceUnitCents:100,chinaFreightState:"no_charge",chinaFreightUnitCents:null});
  d=await financial.saveCharge(tracking.id,d.productsCharge!.id,{expectedRevision:d.tracking.revision,chargeType:"products",paymentMethod:"pix"});
  d=await financial.markChargePaid(tracking.id,d.productsCharge!.id,{expectedRevision:d.tracking.revision});
  const {accountId}=await hubbuyBalanceServices(f.db,"alice").createAccount({workspaceId:"workspace",idempotencyKey:"transition-account",label:"Conta transição QA",confirmZeroBalance:true});
  if(legacy)await migrate(f.db,{migrationsFolder:"./drizzle"});
  const warehouse=warehouseServices(f.db,"alice"),packages=logisticsPackageServices(f.db,"alice");let row=(await warehouse.list()).rows[0];
  await warehouse.execute("workspace","arrival",{operation:"receive",costItemId:row.costItemId,expectedRevision:row.revision,accountId,units:Array.from({length:quantity},(_,i)=>i),reason:"Chegada sintética conferida"});row=(await warehouse.list()).rows[0];
  const reserve={operation:"reserve",accountId,name:"Pacote transição",selection:[{costItemId:row.costItemId,expectedRevision:row.revision,units:[0]}],reason:"Reserva sintética conferida"};
  async function run(key:string,command:unknown,options:{packageId?:string;action?:string;refundId?:string;orderId?:string}={}){
    const result=await promisify(execFile)(process.execPath,["--import","tsx","tests/integration/warehouse-concurrent-worker.ts"],{env:{...process.env,TURSO_AUTH_TOKEN:"",LOTI_WAREHOUSE_TEST_DATABASE:target,LOTI_WAREHOUSE_TEST_KEY:key,LOTI_WAREHOUSE_TEST_COMMAND:JSON.stringify(command),LOTI_WAREHOUSE_TEST_PACKAGE:options.packageId??"",LOTI_WAREHOUSE_TEST_ACTION:options.action??"",LOTI_WAREHOUSE_TEST_TRACKING:tracking.id,LOTI_WAREHOUSE_TEST_REFUND:options.refundId??"",LOTI_WAREHOUSE_TEST_ORDER:options.orderId??""},timeout:30000,windowsHide:true});
    return JSON.parse(result.stdout) as {ok:boolean;message?:string;code?:string};
  }
  return {...f,target,financial,tracking,detail:d,warehouse,packages,accountId,row,reserve,run};
}

it("arbitrates reservation against refund without reserving a cancelled range",async()=>{
  const f=await setup();try{
    const results=await Promise.all([f.run("reserve",f.reserve),f.run("refund",{expectedRevision:f.detail.tracking.revision,costItemId:f.row.costItemId,quantity:1,requestedProductCents:100,requestedChinaCents:0,reason:"Cancelamento concorrente",packageRemovals:[],unassignedQuantity:1},{action:"refund"})]);
    expect(results.filter(r=>r.ok),JSON.stringify(results)).toHaveLength(1);
    const state=await f.warehouse.list(),refunds=await f.db.select().from(tables.purchaseCostRefunds).all();
    expect(state.reservations.length+refunds.length).toBe(1);expect(state.packages.length).toBe(state.reservations.length);
  }finally{f.client.close();}
},60000);

it.each(["close_release","pay_close","dispatch_reopen"] as const)("arbitrates %s on the package revision",async(kind)=>{
  const f=await setup();try{
    const {id}=await f.warehouse.execute("workspace","reserve",f.reserve);let pkg=await f.packages.get(id);
    if(kind==="dispatch_reopen"){
      await f.packages.execute(id,"close",{operation:"close_content",expectedRevision:pkg.pkg.revision,reason:"Conteúdo conferido",confirmed:true});pkg=await f.packages.get(id);
      await f.packages.execute(id,"pay",{operation:"pay_charge",expectedRevision:pkg.pkg.revision,charge:"freight",amountCents:100,paymentMethod:"pix",feeBps:100,reason:"Pagamento conferido",confirmed:true});pkg=await f.packages.get(id);
    }
    const common={expectedRevision:pkg.pkg.revision,reason:"Transição concorrente conferida",confirmed:true};
    const a=kind==="dispatch_reopen"?{...common,operation:"dispatch"}:kind==="pay_close"?{...common,operation:"pay_charge",charge:"freight",amountCents:100,paymentMethod:"pix",feeBps:100}:{...common,operation:"close_content"};
    const results=await Promise.all([f.run("a",a,{packageId:id}),kind==="close_release"?f.run("b",{operation:"release",packageId:id,expectedRevision:pkg.pkg.revision,reservationIds:pkg.reservations.map(r=>r.id),reason:"Retirada concorrente conferida"}):f.run("b",{...common,operation:kind==="pay_close"?"close_content":"reopen_content"},{packageId:id})]);
    expect(results.filter(r=>r.ok),JSON.stringify(results)).toHaveLength(1);
    const after=await f.packages.get(id);expect(after.pkg.revision).toBe(pkg.pkg.revision+1);
    if(kind==="pay_close")expect(after.inPackage).toBe(false);
    if(kind==="dispatch_reopen")expect(after.pkg.stage==="sent"?!!after.pkg.contentClosedAt:after.pkg.contentClosedAt===null).toBe(true);
    expect((await f.client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  }finally{f.client.close();}
},60000);

it("requires legacy review and rejects a concurrent stale mutation",async()=>{
  const f=await setup(true);try{
    const pkg=(await f.warehouse.list()).packages[0],reservations=(await f.warehouse.list()).reservations;
    const review={operation:"review",expectedRevision:pkg.revision,accountId:f.accountId,reason:"Conferência do legado com evidência",confirmed:true};
    const results=await Promise.all([f.run("review",review,{packageId:pkg.id}),f.run("release",{operation:"release",packageId:pkg.id,expectedRevision:pkg.revision,reservationIds:reservations.map(r=>r.id),reason:"Tentativa durante conferência"})]);
    // Bounded lock contention may exhaust retries. Recover only with the exact
    // same receipt key/payload once both independent contenders have exited.
    if(results[0].code==="LOGISTICS_BUSY"){
      expect(results[1].ok).toBe(false);
      expect((await f.packages.get(pkg.id)).pkg.revision).toBe(pkg.revision);
      results[0]=await f.run("review",review,{packageId:pkg.id});
    }
    expect(results.filter(r=>r.ok),JSON.stringify(results)).toHaveLength(1);expect((await f.packages.get(pkg.id)).pkg.reviewState).toBe("confirmed");expect((await f.warehouse.list()).reservations).toHaveLength(1);
    expect(await f.run("review",review,{packageId:pkg.id})).toMatchObject({ok:true});
    const after=await f.packages.get(pkg.id);expect(after.pkg.revision).toBe(pkg.revision+1);expect(after.events.filter(e=>e.action==="review")).toHaveLength(1);
  }finally{f.client.close();}
},60000);

it("rolls back package, units, command and revisions when an audit trigger fails after inserts",async()=>{
  const f=await setup();try{
    await f.client.execute("CREATE TRIGGER fail_logistics_event BEFORE INSERT ON logistics_events BEGIN SELECT RAISE(ABORT,'INJECTED_LOGISTICS_AUDIT_FAILURE'); END");
    await expect(f.warehouse.execute("workspace","rollback",f.reserve)).rejects.toThrow();
    const after=await f.warehouse.list();expect(after.packages).toEqual([]);expect(after.reservations).toEqual([]);expect(after.rows[0].revision).toBe(f.row.revision);
    expect((await f.db.select().from(tables.logisticsCommands).all()).map(c=>c.key)).not.toContain("rollback");
  }finally{f.client.close();}
});

it("keeps a receipt correction independent from reservation of a different stable unit",async()=>{
  const f=await setup(false,2);try{
    let d=await f.financial.requestRefund(f.tracking.id,{expectedRevision:f.detail.tracking.revision,costItemId:f.row.costItemId,quantity:1,requestedProductCents:100,requestedChinaCents:0,reason:"Cancelar a primeira posição",packageRemovals:[],unassignedQuantity:1});
    const refundId=d.refunds[0].id;
    d=await f.financial.receiveRefund(f.tracking.id,refundId,{expectedRevision:d.tracking.revision,receivedProductCents:50,receivedChinaCents:0,confirmed:true});
    const reservation={...f.reserve,selection:[{costItemId:f.row.costItemId,expectedRevision:f.row.revision,units:[1]}]};
    const results=await Promise.all([f.run("reserve-second",reservation),f.run("correct-receipt",{expectedRevision:d.tracking.revision,receivedProductCents:60,receivedChinaCents:0,reason:"Comprovante corrigido da posição cancelada",confirmed:true},{action:"receipt_correction",refundId})]);
    expect(results[1].ok,JSON.stringify(results)).toBe(true);
    if(!results[0].ok){
      // An independent file-backed writer may exhaust the bounded lock wait.
      // Its retryable conflict must recover with the SAME key after contention.
      expect(results[0].code).toBe("LOGISTICS_BUSY");
      expect((await f.run("reserve-second",reservation)).ok).toBe(true);
    }
    const state=await f.warehouse.list();expect(state.reservations.map(r=>r.unitIndex)).toEqual([1]);
    expect((await f.financial.getTracking(f.tracking.id)).refunds[0].receivedProductCents).toBe(60);
    expect(await f.db.select().from(tables.hubbuyBalanceEntries).all()).toEqual([]);
  }finally{f.client.close();}
},60000);

it("serializes paid-order replacement with a reservation and keeps exactly one current unit",async()=>{
  const f=await setup();try{
    const created=await f.financial.createAdditionalOrder(f.tracking.id,{expectedRevision:f.detail.tracking.revision,idempotencyKey:"race-additional",accountId:f.accountId,items:[{name:"Adicional da disputa",url:"https://shop.test/additional-race",platform:"Taobao",visualKey:"generic",quantity:1,itemOrder:0,nativeProductState:"known",nativeProductCnyMinor:1000,nativeChinaState:"no_charge",nativeChinaCnyMinor:null,participants:[{personId:"alice",weightMode:"equal",weight:1}]}]});
    let d=await f.financial.getTracking(f.tracking.id);
    await f.financial.recordAdditionalOrderMixedPayment(f.tracking.id,created.orderId,{expectedRevision:d.tracking.revision,idempotencyKey:"race-additional-payment",useOwnBalance:false,external:{paymentMethod:"pix",principalBrlCents:1000,conversionCnyMinor:1000,conversionBrlCents:1000,feeBps:100}});
    let row=(await f.warehouse.list()).rows.find(r=>r.order.id===created.orderId)!;
    await f.warehouse.execute("workspace","additional-arrived",{operation:"receive",costItemId:row.costItemId,expectedRevision:row.revision,accountId:f.accountId,units:[0],reason:"Chegada do adicional conferida"});
    row=(await f.warehouse.list()).rows.find(r=>r.order.id===created.orderId)!;d=await f.financial.getTracking(f.tracking.id);
    const balance=await hubbuyBalanceServices(f.db,"alice").getAccountBalance(f.accountId);
    const correction={expectedRevision:d.tracking.revision,expectedAccountRevision:balance.account.revision,idempotencyKey:"replace-race",reason:"Correção sintética concorrente",confirmedIncorrectRegistration:true,itemId:row.costItemId,name:"Adicional corrigido",url:"https://shop.test/additional-corrected",variant:"",notes:"",quantity:1,nativeProductCnyMinor:800,nativeChinaCnyMinor:0,composition:{mode:"equal",participants:[{personId:"alice",weight:1}]},useOwnBalance:false,external:{paymentMethod:"pix",principalBrlCents:800,conversionCnyMinor:800,conversionBrlCents:800,feeBps:100}};
    const results=await Promise.all([f.run("reserve-additional",{...f.reserve,selection:[{costItemId:row.costItemId,expectedRevision:row.revision,units:[0]}]}),f.run("correct-additional",correction,{action:"order_correction",orderId:created.orderId})]);
    expect(results[1].ok,JSON.stringify(results)).toBe(true);
    const state=await f.warehouse.list();expect(state.rows.some(r=>r.order.id===created.orderId)).toBe(false);
    expect(state.rows.filter(r=>r.order.kind==="additional")).toHaveLength(1);expect(state.reservations.length).toBe(results[0].ok?1:0);
    expect(state.reservations.every(r=>r.costItemId===state.rows.find(r=>r.order.kind==="additional")!.costItemId)).toBe(true);
    expect((await f.client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  }finally{f.client.close();}
},60000);
