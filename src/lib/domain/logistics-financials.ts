import {readDatabaseSnapshot} from "../db/read-snapshot";
import {eq} from "drizzle-orm";
import {z} from "zod";
import type {AppDatabase} from "../db/connection";
import * as s from "../db/schema";
import {DomainError} from "./errors";
import {authorization} from "./authorization";
import {readCostTracking} from "./package-cost-reading";
import {calculateCostTracking,splitByWeights} from "./package-cost-calculations";
const minor=z.number().int().min(0).max(1_000_000_000_000);
const legacyChargeSchema=z.object({version:z.literal(1),chargeType:z.enum(["brazil_freight","customs"]),value:z.object({state:z.enum(["pending","known","no_charge"]),amountCents:minor.nullable()}),paymentMethod:z.enum(["pix","card"]).nullable(),feeBps:z.number().int().nullable(),paymentStatus:z.enum(["paid","pending"]),items:z.array(z.object({costItemId:z.string(),quantity:z.number().int().positive(),allocationOrder:z.number().int().nonnegative(),participants:z.array(z.object({personId:z.string(),allocationOrder:z.number().int().nonnegative(),weight:minor}))}))});
/** Exact compatibility bridge: use captured pre-cutover inputs and the old allocator. */
export function projectLegacyPackageCharge(snapshot:unknown){
  const saved=legacyChargeSchema.parse(snapshot),free={value:{state:"no_charge" as const,amountCents:null},paymentMethod:null,feeBps:null,paymentStatus:"pending" as const};
  const charge={value:saved.value,paymentMethod:saved.paymentMethod,feeBps:saved.feeBps,paymentStatus:saved.paymentStatus};
  const projection=calculateCostTracking({requirePackageCoverage:false,items:saved.items.map(i=>({id:i.costItemId,itemOrder:i.allocationOrder,quantity:i.quantity,effectivePrice:free.value,chinaFreight:free.value,participants:i.participants})),productsCharge:{paymentMethod:"pix",feeBps:0,paymentStatus:"paid"},packages:[{id:"legacy",name:"Encargo legado",packageOrder:0,logisticsStatus:"preparing",items:saved.items,brazilFreight:saved.chargeType==="brazil_freight"?charge:free,customs:saved.chargeType==="customs"?charge:free}]});
  return {chargeType:saved.chargeType,knownCents:projection.summary.partialCents,finalCents:projection.summary.totalCents,items:projection.items.map(i=>({costItemId:i.id,amountCents:i.partialCents,components:i.components.filter(c=>c.name.includes(" · ") && (saved.chargeType==="customs"?c.name.startsWith("Receita"):!c.name.startsWith("Receita"))).map(c=>({name:c.name.split(" · ")[0],amountCents:c.amountCents,people:saved.items.find(x=>x.costItemId===i.id)!.participants.map((p,index)=>({personId:p.personId,amountCents:c.amountCents===null?null:splitByWeights(c.amountCents,saved.items.find(x=>x.costItemId===i.id)!.participants)?.[index]??null}))})),people:i.shares.map(p=>({personId:p.personId,amountCents:p.partialAmountCents??0}))}))};
}

/** Immutable charge events permanently transfer ownership, including a return to pending. */
export function packageChargeOwnership(pkg: typeof s.logisticsPackages.$inferSelect, events: Pick<typeof s.logisticsEvents.$inferSelect,"action"|"after">[]) {
  const changed = new Set(events.filter(e=>["record_charge","pay_charge","correct_charge"].includes(e.action)).map(e=>z.object({command:z.object({charge:z.enum(["freight","customs"])})}).parse(e.after).command.charge));
  return {freight:pkg.freightState!=="pending" || changed.has("freight"),customs:pkg.customsState!=="pending" || changed.has("customs")};
}
export function addWorkflowMoney(left:number,right:number) {
  if(!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left<0 || right<0 || !Number.isSafeInteger(left+right))throw new DomainError("O consolidado excede o limite seguro de valores.",409);
  return left+right;
}
/** Package inherited product bases are deliberately absent from this addition. */
export async function readWorkflowFinancialSummary(db:AppDatabase,userId:string){
  return readDatabaseSnapshot(db,tx=>readFinancialSnapshot(tx,userId));
}
async function readFinancialSnapshot(db:Pick<AppDatabase,"select">,userId:string){
  const {workspaceId}=await authorization(db,userId).requireWorkspaceMember();
  const trackings=await db.select().from(s.purchaseCostTrackings).where(eq(s.purchaseCostTrackings.workspaceId,workspaceId)).all();
  const packages=await db.select().from(s.logisticsPackages).where(eq(s.logisticsPackages.workspaceId,workspaceId)).all();
  const [bridgeRows,manifestRows]=await Promise.all([
    db.select({bridge:s.logisticsLegacyCharges}).from(s.logisticsLegacyCharges).innerJoin(s.logisticsPackages,eq(s.logisticsPackages.id,s.logisticsLegacyCharges.packageId)).where(eq(s.logisticsPackages.workspaceId,workspaceId)).all(),
    db.select({manifest:s.logisticsManifests}).from(s.logisticsManifests).innerJoin(s.logisticsPackages,eq(s.logisticsPackages.id,s.logisticsManifests.packageId)).where(eq(s.logisticsPackages.workspaceId,workspaceId)).all(),
  ]);
  const bridges=bridgeRows.map(r=>r.bridge),manifests=manifestRows.map(r=>r.manifest);
  const events=await db.select().from(s.logisticsEvents).where(eq(s.logisticsEvents.workspaceId,workspaceId)).all();
  const people=new Map<string,{personId:string;ordersCents:number;packageChargesCents:number}>();
  const add=(personId:string,scope:"ordersCents"|"packageChargesCents",amount:number)=>{const p=people.get(personId)??{personId,ordersCents:0,packageChargesCents:0};p[scope]=addWorkflowMoney(p[scope],amount);people.set(personId,p);};
  let ordersCents=0,packageChargesCents=0,pending=false;
  for(const tracking of trackings){const order=await readCostTracking(db,userId,tracking.id,"order");ordersCents=addWorkflowMoney(ordersCents,order.calculation.summary.partialCents);pending ||= order.calculation.summary.totalCents===null;for(const p of order.memberTotals)add(p.personId,"ordersCents",p.totalCents);}
  const chargeSnapshot=z.object({charges:z.array(z.object({amountCents:minor,units:z.array(z.object({people:z.array(z.object({personId:z.string(),amountCents:minor}))}))}))});
  for(const pkg of packages){
    const owned=packageChargeOwnership(pkg,events.filter(e=>e.resourceId===pkg.id));
    for(const bridge of bridges.filter(b=>b.packageId===pkg.id)){
      const captured=projectLegacyPackageCharge(bridge.snapshot);
      if(captured.chargeType==="brazil_freight"?owned.freight:owned.customs)continue;
      packageChargesCents=addWorkflowMoney(packageChargesCents,captured.knownCents);pending ||= captured.finalCents===null;for(const item of captured.items)for(const p of item.people)add(p.personId,"packageChargesCents",p.amountCents);
    }
    const latest=manifests.filter(m=>m.packageId===pkg.id).sort((a,b)=>b.revision-a.revision)[0];
    if(latest){const snapshot=chargeSnapshot.parse(latest.snapshot);for(const charge of snapshot.charges){packageChargesCents=addWorkflowMoney(packageChargesCents,charge.amountCents);for(const unit of charge.units)for(const p of unit.people)add(p.personId,"packageChargesCents",p.amountCents);}}
    const legacyFreight=!owned.freight && bridges.find(b=>b.packageId===pkg.id && legacyChargeSchema.parse(b.snapshot).chargeType==="brazil_freight");
    const legacyCustoms=!owned.customs && bridges.find(b=>b.packageId===pkg.id && legacyChargeSchema.parse(b.snapshot).chargeType==="customs");
    pending ||= pkg.freightState==="pending" && !legacyFreight || pkg.customsState==="pending" && !legacyCustoms || pkg.freightState==="known" && pkg.freightFeeCents===null;
  }
  return {workspaceId,ordersCents,packageChargesCents,knownCents:addWorkflowMoney(ordersCents,packageChargesCents),finalCents:pending?null:addWorkflowMoney(ordersCents,packageChargesCents),people:[...people.values()].map(p=>({...p,totalCents:addWorkflowMoney(p.ordersCents,p.packageChargesCents)}))};
}
