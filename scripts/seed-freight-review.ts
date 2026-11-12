import {existsSync,mkdirSync,writeFileSync} from "node:fs";
import {dirname} from "node:path";
import {eq} from "drizzle-orm";
import {freightReviewEnvironment,freightReviewPassword} from "./freight-review-environment";
const flag=process.argv.indexOf("--database"),target=freightReviewEnvironment(flag<0?undefined:process.argv[flag+1]);
if(existsSync(target.path)||existsSync(`${target.path}.scenario.json`))throw new Error("Choose a new synthetic database; existing files are never overwritten.");
mkdirSync(dirname(target.path),{recursive:true});
const {openDatabase}=await import("../src/lib/db/connection"),{migrate}=await import("drizzle-orm/libsql/migrator"),{createMember}=await import("./operator"),s=await import("../src/lib/db/schema"),{createServices}=await import("../src/lib/domain/services"),{packageCostServices}=await import("../src/lib/domain/package-cost-services"),{hubbuyBalanceServices}=await import("../src/lib/domain/hubbuy-balance-services"),{warehouseServices}=await import("../src/lib/domain/warehouse-services"),{logisticsPackageServices}=await import("../src/lib/domain/logistics-package-services"),{verifyDatabase}=await import("./database-verification");
const {db,client}=openDatabase(target.url);
try{
  await migrate(db,{migrationsFolder:"./drizzle"});
  const people=[];for(const suffix of ["a","b","c","d"]){const member=await createMember(db,{name:`Pessoa ${suffix.toUpperCase()}`,email:`pessoa-${suffix}@loti.test`,password:freightReviewPassword});people.push(member.id);}
  const workspace=(await db.select().from(s.workspaces).where(eq(s.workspaces.kind,"shared")))[0];
  const service=createServices(db,people[0]),purchase=await service.savePurchase({name:"Ensaio F1–F6 · 30 unidades"});
  for(const [index,quantity]of [9,8,2,5,6].entries())await service.saveManualItem({name:index===4?"Produto compartilhado A/C/D":`Produto sintético ${"ABCD"[index]}`,url:`https://synthetic.invalid/item-${index}`,quantity,unitPriceCents:100,sharingMode:"equal",participants:(index===4?[people[0],people[2],people[3]]:[people[index]]).map(personId=>({personId}))});
  await service.finalizePurchase(purchase.id,true);
  const tracking=(await db.select().from(s.purchaseCostTrackings).where(eq(s.purchaseCostTrackings.purchaseId,purchase.id)))[0],costs=packageCostServices(db,people[0],undefined,workspace.id);
  let detail=await costs.getTracking(tracking.id);
  for(const item of detail.items)detail=await costs.saveItemCosts(tracking.id,{expectedRevision:detail.tracking.revision,itemId:item.id,effectivePriceState:"known",effectivePriceUnitCents:100,chinaFreightState:"no_charge",chinaFreightUnitCents:null});
  detail=await costs.saveCharge(tracking.id,detail.productsCharge!.id,{expectedRevision:detail.tracking.revision,chargeType:"products",paymentMethod:"pix"});
  await costs.markChargePaid(tracking.id,detail.productsCharge!.id,{expectedRevision:detail.tracking.revision});
  const accounts=hubbuyBalanceServices(db,people[0],workspace.id),account=await accounts.createAccount({workspaceId:workspace.id,idempotencyKey:"review-account",label:"Conta sintética · F1–F6",confirmZeroBalance:true});
  for(const [index,cny]of [14233,1898,13894,7009].entries())await accounts.recordManualAdjustment(account.accountId,{expectedRevision:index,idempotencyKey:`synthetic-old-${index}`,kind:"documented_credit",occurredAt:`2026-11-01T0${index}:00:00Z`,reason:`Crédito anterior sintético da Pessoa ${"ABCD"[index]}`,amountCnyMinor:cny,externalReference:`synthetic-old-${index}`,shares:[{personId:people[index],amountCnyMinor:cny,historicalBrlCents:[10406,1425,10432,6605][index]}]});
  const warehouse=warehouseServices(db,people[0]);
  for(const row of (await warehouse.list()).rows)await warehouse.execute(workspace.id,`arrival:${row.costItemId}`,{operation:"receive",costItemId:row.costItemId,expectedRevision:row.revision,accountId:account.accountId,units:Array.from({length:row.quantity},(_,i)=>i),reason:"Chegada sintética conferida"});
  const stock=await warehouse.list();
  const reserved=await warehouse.execute(workspace.id,"reserve-review",{operation:"reserve",accountId:account.accountId,name:"Pacote sintético · revisão F1–F6",selection:stock.rows.map(row=>({costItemId:row.costItemId,expectedRevision:row.revision,units:row.availableUnits})),reason:"Reserva sintética de 30 unidades"});
  const logistics=logisticsPackageServices(db,people[0]),pkg=await logistics.get(reserved.id);
  await logistics.execute(reserved.id,"close-review-content",{operation:"close_content",expectedRevision:pkg.pkg.revision,confirmed:true,reason:"Conteúdo sintético de 30 unidades conferido"});
  const check=await verifyDatabase(client);
  const marker={scenarioId:"freight-review-v1",databasePath:target.path,workspaceId:workspace.id,people,packageId:reserved.id,accountId:account.accountId,trackingId:tracking.id,login:"pessoa-a@loti.test",password:freightReviewPassword,url:`http://localhost:3147/packages/detail/${reserved.id}`,baseline:{cnyMinor:37034,historicalBrlCents:28868,physicalUnits:30},topup:{cnyMinor:39830,principalBrlCents:34893,feeBrlCents:349,funder:people[0]},payment:{cnyMinor:76860,oldAndNewSelections:[54059,1898,13894,7009],historicalCostBrlCents:64106,remainingCnyMinor:4,remainingBrlCents:4},check,state:"complete"};
  writeFileSync(`${target.path}.scenario.json`,JSON.stringify(marker,null,2));console.log(JSON.stringify(marker,null,2));
}finally{client.close();}
