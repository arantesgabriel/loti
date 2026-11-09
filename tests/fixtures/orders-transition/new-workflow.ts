import type {AppDatabase} from "../../../src/lib/db/connection";
import {createServices} from "../../../src/lib/domain/services";
import {packageCostServices} from "../../../src/lib/domain/package-cost-services";
import {hubbuyBalanceServices} from "../../../src/lib/domain/hubbuy-balance-services";
import {warehouseServices} from "../../../src/lib/domain/warehouse-services";
export async function buildOrdersWorkflowScenario(db:AppDatabase,people:string[]){
  const actor=people[0],workspaceId="loti",service=createServices(db,actor),costs=packageCostServices(db,actor),warehouse=warehouseServices(db,actor);
  const {accountId}=await hubbuyBalanceServices(db,actor).createAccount({workspaceId,idempotencyKey:"newflow-account",label:"Conta sintética de envios",confirmZeroBalance:true});
  const purchases=[];
  for(const [index,name,quantity,unitPriceCents] of [[0,"Camiseta retida QA",2,1],[1,"Polo compra posterior QA",3,1]] as const){
    const purchase=await service.savePurchase({name:index===0?"Compra QA anterior":"Compra QA posterior"});
    await service.saveManualItem({name,url:`https://shop.test/new-workflow-${index}`,quantity,unitPriceCents,sharingMode:"equal",participants:[{personId:people[0]},{personId:people[1]}]});
    await service.finalizePurchase(purchase.id,true);
    const tracking=await costs.startTracking(purchase.id);let detail=await costs.getTracking(tracking.id);
    detail=await costs.saveItemCosts(tracking.id,{expectedRevision:detail.tracking.revision,itemId:detail.items[0].id,effectivePriceState:"known",effectivePriceUnitCents:unitPriceCents,chinaFreightState:"no_charge",chinaFreightUnitCents:null});
    detail=await costs.saveCharge(tracking.id,detail.productsCharge!.id,{expectedRevision:detail.tracking.revision,chargeType:"products",paymentMethod:"pix"});
    await costs.markChargePaid(tracking.id,detail.productsCharge!.id,{expectedRevision:detail.tracking.revision});
    const row=(await warehouse.list()).rows.find(r=>r.costItemId===detail.items[0].id)!;
    await warehouse.execute(workspaceId,`newflow-receive-${index}`,{operation:"receive",costItemId:row.costItemId,expectedRevision:row.revision,accountId,units:index===0?[0,1]:[0,1],reason:"Chegada parcial sintética conferida"});
    purchases.push({purchaseId:purchase.id,trackingId:tracking.id,orderId:row.order.id,costItemId:row.costItemId});
  }
  const rows=(await warehouse.list()).rows;
  const {id:packageId}=await warehouse.execute(workspaceId,"newflow-mixed-package",{operation:"reserve",accountId,name:"Camiseta retida + compra posterior QA",selection:purchases.map((p,index)=>{const row=rows.find(r=>r.costItemId===p.costItemId)!;return {costItemId:row.costItemId,expectedRevision:row.revision,units:[index===0?1:0]};}),reason:"Unir peça retida e compra posterior, mesma conta"});
  return {scenarioId:"orders-workflow-v2",people,workspaceId,accountId,packageId,purchases};
}
