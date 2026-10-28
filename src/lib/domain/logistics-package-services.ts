import {readDatabaseSnapshot} from "../db/read-snapshot";
import { createHash } from "node:crypto";
import { and,eq,inArray,isNull } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../db/connection";
import * as s from "../db/schema";
import { authorization } from "./authorization";
import { DomainError } from "./errors";
import { logisticsTransaction } from "./logistics-transaction";
import { readCostTracking } from "./package-cost-reading";
import { splitByWeights } from "./package-cost-calculations";
import { unitMinorCapacity,unitPersonMatrix } from "./warehouse-calculations";
import {projectLegacyPackageCharge,packageChargeOwnership} from "./logistics-financials";
import {countActivePackageUnitsByPackage} from "./logistics-package-reservations";

const minor = z.number().int().min(0).max(1_000_000_000_000);
const base = { expectedRevision:z.number().int().nonnegative(), reason:z.string().trim().min(3).max(1000) };
const personShare=z.object({personId:z.string(),amountCents:minor});
const manifestSchema=z.object({version:z.literal(1),packageId:z.string(),items:z.array(z.object({costItemId:z.string(),orderId:z.string(),trackingId:z.string(),valuationVersion:z.number(),quantity:z.number(),valuationKey:z.string(),participants:z.array(z.object({personId:z.string(),allocationOrder:z.number(),weight:z.number()})),components:z.array(z.object({name:z.string(),sourceAmountCents:minor,units:z.array(z.object({unitIndex:z.number().int(),amountCents:minor,people:z.array(personShare)}))}))})),charges:z.array(z.object({name:z.string(),amountCents:minor,units:z.array(z.object({costItemId:z.string(),unitIndex:z.number().int(),amountCents:minor,people:z.array(personShare)}))}))});
export const logisticsPackageCommandSchema = z.discriminatedUnion("operation",[
  z.object({...base,operation:z.literal("review"),accountId:z.string().min(1),confirmClosedContent:z.boolean().default(false),confirmed:z.literal(true)}).strict(),
  z.object({...base,operation:z.enum(["close_content","reopen_content","dispatch","receive","close_financial","reopen_financial","confirm_legacy_content"]),confirmed:z.literal(true)}).strict(),
  z.object({...base,operation:z.literal("pay_charge"),charge:z.enum(["freight","customs"]),amountCents:minor,paymentMethod:z.enum(["pix","card"]),feeBps:z.number().int().min(0).max(10000),confirmed:z.literal(true)}).strict(),
  z.object({...base,operation:z.literal("record_charge"),charge:z.enum(["freight","customs"]),valueState:z.enum(["pending","known","no_charge"]),amountCents:minor.nullable(),paymentMethod:z.enum(["pix","card"]).nullable(),feeBps:z.number().int().min(0).max(10000).nullable()}).strict(),
  z.object({...base,operation:z.literal("correct_charge"),charge:z.enum(["freight","customs"]),valueState:z.enum(["pending","known","no_charge"]),amountCents:minor.nullable(),paymentMethod:z.enum(["pix","card"]).nullable(),feeBps:z.number().int().min(0).max(10000).nullable(),confirmedPaymentReset:z.literal(true)}).strict(),
  z.object({...base,operation:z.literal("weight"),weightGrams:z.number().int().min(1).max(1_000_000_000)}).strict(),
]);

export function logisticsPackageServices(db:AppDatabase,userId:string) {
  async function get(packageId:string) {
    return readDatabaseSnapshot(db,snapshot=>getSnapshot(snapshot,packageId));
  }
  async function getSnapshot(db:Pick<AppDatabase,"select">,packageId:string) {
    const pkg = await db.select().from(s.logisticsPackages).where(eq(s.logisticsPackages.id,packageId)).get();
    if (!pkg) throw new DomainError("Pacote não encontrado.",404);
    await authorization(db,userId).requireWorkspaceMember(pkg.workspaceId);
    const current=await detail(db,pkg);
    let valuation:Awaited<ReturnType<typeof manifest>>|null=null,valuationError:string|null=null;
    try {
      const latest=[...current.manifests].sort((a,b)=>b.revision-a.revision)[0];
      valuation=pkg.contentClosedAt && latest ? manifestSchema.parse(latest.snapshot) : await manifest(db,pkg,current.reservations);
    }catch(error){if(error instanceof DomainError)valuationError=error.message;else throw error;}
    return {...current,valuation,valuationError};
  }
  async function detail(tx:Pick<AppDatabase,"select">,pkg:typeof s.logisticsPackages.$inferSelect) {
    const reservations = await tx.select().from(s.logisticsReservations).where(and(eq(s.logisticsReservations.packageId,pkg.id),isNull(s.logisticsReservations.releasedAt))).all();
    const unitCount=(await countActivePackageUnitsByPackage(tx,[pkg.id])).get(pkg.id)??0;
    const manifests = await tx.select().from(s.logisticsManifests).where(eq(s.logisticsManifests.packageId,pkg.id)).all();
    const events = await tx.select().from(s.logisticsEvents).where(and(eq(s.logisticsEvents.workspaceId,pkg.workspaceId),eq(s.logisticsEvents.resourceId,pkg.id))).all();
    const legacyCharges = pkg.legacyPackageId ? await tx.select().from(s.purchaseCostCharges).where(eq(s.purchaseCostCharges.packageId,pkg.legacyPackageId)).all() : [];
    const bridges=await tx.select().from(s.logisticsLegacyCharges).where(eq(s.logisticsLegacyCharges.packageId,pkg.id)).all();
    const ownership=packageChargeOwnership(pkg,events);
    const legacyProjections=bridges.map(b=>{const projection=projectLegacyPackageCharge(b.snapshot);return {legacyChargeId:b.legacyChargeId,...projection,active:!ownership[projection.chargeType==="brazil_freight"?"freight":"customs"]};});
    const legacyFreight=legacyCharges.find(c=>c.chargeType==="brazil_freight");
    return {pkg,reservations,unitCount,manifests,events,legacyCharges,legacyProjections,ownership,inPackage:!!pkg.contentClosedAt && !!(ownership.freight?pkg.freightPaidAt:legacyFreight?.paymentStatus==="paid"?legacyFreight.paidAt:null)};
  }
  async function execute(packageId:string,key:string,input:unknown) {
    z.string().min(1).max(200).parse(key);
    const command = logisticsPackageCommandSchema.parse(input), payload=JSON.stringify({packageId,...command});
    return logisticsTransaction(() => db.transaction(async tx => {
      const pkg = await tx.select().from(s.logisticsPackages).where(eq(s.logisticsPackages.id,packageId)).get();
      if (!pkg) throw new DomainError("Pacote não encontrado.",404);
      await authorization(tx,userId).requireWorkspaceMember(pkg.workspaceId);
      const prior = await tx.select().from(s.logisticsCommands).where(and(eq(s.logisticsCommands.workspaceId,pkg.workspaceId),eq(s.logisticsCommands.key,key))).get();
      if (prior) {
        if (prior.payload !== payload || prior.actorId !== userId) throw new DomainError("Chave de operação já utilizada.",409);
        return {id:prior.resultId};
      }
      if (pkg.revision !== command.expectedRevision) throw new DomainError("O pacote mudou. Atualize a página.",409);
      if (pkg.financialClosedAt && !["dispatch","receive","weight","reopen_financial"].includes(command.operation)) throw new DomainError("Este pacote está encerrado financeiramente.",409);
      if (command.operation !== "review" && pkg.reviewState !== "confirmed") throw new DomainError("Confira o legado antes de alterar o pacote.",409);
      const now = new Date(), patch:Partial<typeof s.logisticsPackages.$inferInsert>={revision:pkg.revision+1};
      const current = await detail(tx,pkg);
      const legacyFreight=current.legacyCharges.find(c=>c.chargeType==="brazil_freight");
      const legacyCustoms=current.legacyCharges.find(c=>c.chargeType==="customs");
      const freightPaid=current.ownership.freight?pkg.freightPaidAt:legacyFreight?.paymentStatus==="paid"?legacyFreight.paidAt:null;
      const customsPaid=current.ownership.customs?pkg.customsPaidAt:legacyCustoms?.paymentStatus==="paid"?legacyCustoms.paidAt:null;
      if (command.operation === "review") {
        if (pkg.reviewState !== "pending_review") throw new DomainError("O pacote já foi conferido.",409);
        const account = await tx.select().from(s.hubbuyAccounts).where(and(eq(s.hubbuyAccounts.id,command.accountId),eq(s.hubbuyAccounts.workspaceId,pkg.workspaceId),isNull(s.hubbuyAccounts.deletedAt))).get();
        if (!account || account.status !== "active") throw new DomainError("A conta precisa estar ativa e conferida.",409);
        const positions = current.reservations.length ? await tx.select().from(s.orderWarehousePositions).where(inArray(s.orderWarehousePositions.costItemId,[...new Set(current.reservations.map(r=>r.costItemId))])).all() : [];
        if (positions.some(p => p.reviewState !== "confirmed" || p.accountId !== account.id)) throw new DomainError("Confira primeiro a chegada e conta de todos os itens reservados.",409);
        patch.accountId=account.id; patch.reviewState="confirmed";
        if(command.confirmClosedContent && !pkg.contentClosedAt){
          if(!current.reservations.length)throw new DomainError("Confira um conteúdo não vazio antes de confirmar seu fechamento.",409);
          const snapshot=await manifest(tx,{...pkg,accountId:account.id},current.reservations);
          await tx.insert(s.logisticsManifests).values({id:crypto.randomUUID(),packageId,revision:pkg.revision+1,snapshot,createdBy:userId,createdAt:now}).run();
          patch.contentClosedAt=now; // Current explicit confirmation, never an inferred historical occurrence.
        }
      } else if(command.operation==="confirm_legacy_content"){
        if(!pkg.legacyPackageId || pkg.contentClosedAt || !current.reservations.length)throw new DomainError("Este pacote não precisa de confirmação legada de conteúdo.",409);
        const snapshot=await manifest(tx,pkg,current.reservations);
        await tx.insert(s.logisticsManifests).values({id:crypto.randomUUID(),packageId,revision:pkg.revision+1,snapshot,createdBy:userId,createdAt:now}).run();
        patch.contentClosedAt=now;
      } else if (command.operation === "close_content") {
        if (pkg.stage !== "preparing" || pkg.contentClosedAt || !current.reservations.length) throw new DomainError("O pacote deve estar em montagem e conter unidades.",409);
        const snapshot = await manifest(tx,pkg,current.reservations);
        await tx.insert(s.logisticsManifests).values({id:crypto.randomUUID(),packageId,revision:pkg.revision+1,snapshot,createdBy:userId,createdAt:now}).run();
        patch.contentClosedAt=now;
      } else if (command.operation === "reopen_content") {
        if (pkg.stage !== "preparing" || !pkg.contentClosedAt) throw new DomainError("Só é possível reabrir antes do despacho.",409);
        patch.contentClosedAt=null;
      } else if (command.operation === "pay_charge" || command.operation === "record_charge" || command.operation==="correct_charge") {
        if (!current.reservations.length) throw new DomainError("Inclua unidades antes de pagar o encargo.",409);
        const already = command.charge === "freight" ? pkg.freightPaidAt : pkg.customsPaidAt;
        const legacy = current.legacyCharges.find(c=>c.chargeType===(command.charge==="freight"?"brazil_freight":"customs"));
        const ownsCharge=current.ownership[command.charge];
        if (command.operation!=="correct_charge" && (already || !ownsCharge && legacy?.paymentStatus === "paid")) throw new DomainError("O encargo já tem pagamento confirmado. Use a correção explícita para preservar o registro original.",409);
        const valueState=command.operation==="pay_charge"?"known":command.valueState;
        if((valueState==="known")!==(command.amountCents!==null))throw new DomainError("Informe o valor conhecido ou deixe a cobrança pendente/isenta.",400);
        const feeCents=valueState==="no_charge"?0:command.amountCents!==null && command.feeBps!==null ? Number((BigInt(command.amountCents)*BigInt(command.feeBps)+5000n)/10000n):null;
        if (command.charge === "customs" && command.feeBps !== 0 && command.feeBps!==null) throw new DomainError("Receita não recebe taxa de pagamento.",400);
        if (command.charge === "freight") Object.assign(patch,{freightState:valueState,freightCents:command.amountCents,freightFeeCents:feeCents,freightPaymentMethod:command.paymentMethod,freightFeeBps:command.feeBps,...(command.operation==="pay_charge"?{freightPaidAt:now}:{})});
        else Object.assign(patch,{customsState:valueState,customsCents:command.amountCents,...(command.operation==="pay_charge"?{customsPaidAt:now}:{})});
        if(command.operation==="correct_charge"){
          if(valueState==="pending")throw new DomainError("A correção deve informar um valor conhecido ou isenção explícita.",400);
          if(command.charge==="freight")patch.freightPaidAt=null;else patch.customsPaidAt=null;
        }
      } else if (command.operation === "dispatch") {
        if (pkg.stage !== "preparing" || !pkg.contentClosedAt || !freightPaid) throw new DomainError("Feche o conteúdo e confirme o frete antes do despacho.",409);
        patch.stage="sent"; patch.dispatchedAt=now;
      } else if (command.operation === "receive") {
        if (pkg.stage !== "sent") throw new DomainError("Registre o despacho antes do recebimento.",409);
        patch.stage="received"; patch.receivedAt=now;
      } else if (command.operation === "weight") {
        if (!pkg.contentClosedAt || !freightPaid) throw new DomainError("Peso disponível após conteúdo fechado e frete pago.",409);
        patch.weightGrams=command.weightGrams;
      } else if (command.operation === "close_financial") {
        if (!pkg.contentClosedAt || !freightPaid || !(customsPaid || pkg.customsState==="no_charge" || !current.ownership.customs && legacyCustoms?.valueState==="no_charge")) throw new DomainError("Resolva conteúdo, frete e Receita antes de encerrar.",409);
        patch.financialClosedAt=now;
      } else if(command.operation==="reopen_financial"){
        if(!pkg.financialClosedAt)throw new DomainError("Os custos já estão abertos.",409);
        patch.financialClosedAt=null;
      }
      if(command.operation==="pay_charge" || command.operation==="record_charge" || command.operation==="correct_charge"){
        const snapshot=await manifest(tx,{...pkg,...patch},current.reservations);
        await tx.insert(s.logisticsManifests).values({id:crypto.randomUUID(),packageId,revision:pkg.revision+1,snapshot,createdBy:userId,createdAt:now}).run();
      }
      await tx.update(s.logisticsPackages).set(patch).where(and(eq(s.logisticsPackages.id,packageId),eq(s.logisticsPackages.revision,command.expectedRevision))).run();
      await tx.insert(s.logisticsEvents).values({id:crypto.randomUUID(),workspaceId:pkg.workspaceId,resourceId:packageId,action:command.operation,reason:command.reason,before:pkg,after:{...patch,command},actorId:userId,createdAt:now}).run();
      await tx.insert(s.logisticsCommands).values({id:crypto.randomUUID(),workspaceId:pkg.workspaceId,key,payload,resultId:packageId,actorId:userId,createdAt:now}).run();
      return {id:packageId};
    },{behavior:"immediate"}));
  }
  async function manifest(tx:Pick<AppDatabase,"select">,pkg:typeof s.logisticsPackages.$inferSelect,reservations:typeof s.logisticsReservations.$inferSelect[]) {
    const result:z.infer<typeof manifestSchema>["items"]=[];
    for (const costItemId of [...new Set(reservations.map(r=>r.costItemId))].sort()) {
      const cost=await tx.select().from(s.purchaseItemCosts).where(eq(s.purchaseItemCosts.id,costItemId)).get();
      if (!cost) throw new DomainError("Origem financeira ausente.",409);
      const position=await tx.select().from(s.orderWarehousePositions).where(eq(s.orderWarehousePositions.costItemId,costItemId)).get();
      if (!position || position.reviewState!=="confirmed" || position.accountId!==pkg.accountId) throw new DomainError("Confira as posições antes de fechar.",409);
      const detail=await readCostTracking(tx,userId,cost.trackingId,"order"), line=detail.calculation.items.find(i=>i.id===costItemId);
      const item=detail.items.find(i=>i.id===costItemId)??detail.productOrders.flatMap(o=>o.items).find(i=>i.cost.id===costItemId);
      const productPayment=detail.charges.find(c=>c.orderId===cost.orderId && c.chargeType==="products");
      if(productPayment?.paymentStatus!=="paid")throw new DomainError("Confirme o financiamento dos produtos no pedido antes de fechar o conteúdo.",409);
      if (!line || !item || line.components.some(c=>c.amountCents===null) || line.undistributedCents!==0) throw new DomainError("Resolva as bases e parcelas do pedido antes de fechar o conteúdo.",409);
      const selected=reservations.filter(r=>r.costItemId===costItemId).sort((a,b)=>a.unitIndex-b.unitIndex);
      const components=line.components.map(component=>{
        const amount=component.amountCents!;
        const weights=item.participants.map(p=>({personId:p.personId,allocationOrder:p.allocationOrder,weight:p.weight}));
        const shares=splitByWeights(amount,weights);
        if (!shares) throw new DomainError("Composição financeira inválida.",409);
        const matrix=unitPersonMatrix(Array.from({length:line.quantity},(_,i)=>unitMinorCapacity(amount,line.quantity,i)),weights.map((p,i)=>({personId:p.personId,amountCents:shares[i]})));
        return {name:component.name,sourceAmountCents:amount,units:selected.map(r=>({unitIndex:r.unitIndex,amountCents:unitMinorCapacity(amount,line.quantity,r.unitIndex),people:matrix[r.unitIndex]}))};
      });
      const source={costItemId,orderId:cost.orderId,trackingId:cost.trackingId,valuationVersion:cost.valuationVersion,quantity:line.quantity,participants:item.participants.map(p=>({personId:p.personId,allocationOrder:p.allocationOrder,weight:p.weight})),components};
      result.push({...source,valuationKey:createHash("sha256").update(JSON.stringify({cost,participants:item.participants,components:line.components})).digest("hex")});
    }
    const allUnits=result.flatMap(item=>(item.components[0]?.units??[]).map(u=>({costItemId:item.costItemId,unitIndex:u.unitIndex,participants:item.participants})));
    const charges=[{name:"Frete Brasil",amountCents:pkg.freightState==="no_charge"?0:pkg.freightCents},{name:"Taxa do frete",amountCents:pkg.freightState==="no_charge"?0:pkg.freightFeeCents},{name:"Receita",amountCents:pkg.customsState==="no_charge"?0:pkg.customsCents}].filter((c):c is {name:string;amountCents:number}=>c.amountCents!==null).map(c=>{
      const values=allUnits.map((unit,index)=>({...unit,amountCents:unitMinorCapacity(c.amountCents,allUnits.length,index)}));
      const units=result.flatMap(item=>{
        const rows=values.filter(u=>u.costItemId===item.costItemId),total=rows.reduce((n,u)=>n+u.amountCents,0),shares=splitByWeights(total,item.participants);
        if(!shares)throw new DomainError("Não foi possível distribuir o encargo.",409);
        const matrix=unitPersonMatrix(rows.map(u=>u.amountCents),item.participants.map((p,i)=>({personId:p.personId,amountCents:shares[i]})));
        return rows.map((u,i)=>({costItemId:u.costItemId,unitIndex:u.unitIndex,amountCents:u.amountCents,people:matrix[i]}));
      });
      return {name:c.name,amountCents:c.amountCents,units};
    });
    return manifestSchema.parse({version:1,packageId:pkg.id,items:result,charges});
  }
  return {get,execute};
}
