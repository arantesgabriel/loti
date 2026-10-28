import {freightPaidSql} from "./logistics-package-status";
import {readDatabaseSnapshot} from "../db/read-snapshot";
import { and, eq, inArray, isNull, ne,or,asc,count,sql } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../db/connection";
import * as s from "../db/schema";
import { authorization } from "./authorization";
import { DomainError } from "./errors";
import type { CostTransaction } from "./purchase-cost-initialization";
import { logisticsTransaction } from "./logistics-transaction";
import { availableWarehouseUnits } from "./warehouse-calculations";
import {warehousePage} from "./warehouse-query";
import {readCostTracking} from "./package-cost-reading";

const id = z.string().min(1).max(200), revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const units = z.array(z.number().int().min(0).max(9999)).max(10000).refine(v => new Set(v).size === v.length,"Unidades duplicadas.");
const reason = z.string().trim().min(3).max(1000);
const selection = z.array(z.object({ costItemId: id, expectedRevision: revision, units: units.min(1) }).strict()).min(1).max(100)
  .refine(rows => new Set(rows.map(r => r.costItemId)).size === rows.length,"Itens duplicados.")
  .refine(rows => rows.reduce((n,r)=>n+r.units.length,0)<=10000,"Selecione até 10.000 unidades por operação.");
export const warehouseCommandSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("receive"), costItemId: id, expectedRevision: revision, accountId: id, units, reason }).strict(),
  z.object({ operation: z.literal("reserve"), packageId: id.optional(), name: z.string().trim().min(1).max(120).optional(), expectedRevision: revision.optional(), accountId: id, selection, reason }).strict(),
  z.object({ operation: z.literal("release"), packageId: id, expectedRevision: revision, reservationIds: z.array(id).min(1).max(10000), reason }).strict(),
]);
type Command = z.infer<typeof warehouseCommandSchema>;
export const warehouseQuerySchema=z.object({page:z.coerce.number().int().min(0).max(10000).default(0),pageSize:z.coerce.number().int().min(1).max(100).default(20),search:z.string().max(200).default(""),account:z.string().max(200).default(""),person:z.string().max(200).default(""),origin:z.enum(["","original","additional"]).default(""),status:z.enum(["","review","awaiting","warehouse","available","package","sent","received"]).default(""),trackingId:z.string().max(200).default(""),packageId:z.string().max(200).default(""),packagePage:z.coerce.number().int().min(0).max(10000).default(0)}).strict();

export function warehouseServices(db: AppDatabase, userId: string) {
  async function list(query?:z.infer<typeof warehouseQuerySchema>) {
    return readDatabaseSnapshot(db,tx=>readList(tx,query));
  }
  async function readList(db:Pick<AppDatabase,"select"|"all">,query?:z.infer<typeof warehouseQuerySchema>) {
    const { workspaceId } = await authorization(db,userId).requireWorkspaceMember();
    const pageResult=query?await warehousePage(db,workspaceId,query):null;
    const positions = pageResult ? pageResult.ids.length ? await db.select().from(s.orderWarehousePositions).where(inArray(s.orderWarehousePositions.costItemId,pageResult.ids)).all() : [] : await db.select().from(s.orderWarehousePositions).where(eq(s.orderWarehousePositions.workspaceId,workspaceId)).all();
    const positionIds=positions.map(p=>p.costItemId);
    const reservations = positionIds.length ? await db.select().from(s.logisticsReservations).where(and(inArray(s.logisticsReservations.costItemId,positionIds),isNull(s.logisticsReservations.releasedAt))).all() : [];
    const eligible=and(eq(s.logisticsPackages.workspaceId,workspaceId),eq(s.logisticsPackages.stage,"preparing"),eq(s.logisticsPackages.reviewState,"confirmed"),isNull(s.logisticsPackages.contentClosedAt),isNull(s.logisticsPackages.financialClosedAt));
    const candidates=await db.select({pkg:s.logisticsPackages,freightConfirmed:sql<boolean>`${freightPaidSql("logistics_packages")}`}).from(s.logisticsPackages).where(eligible).orderBy(asc(s.logisticsPackages.id)).limit(100).offset((query?.packagePage??0)*100).all();
    const candidateCount=await db.select({total:count()}).from(s.logisticsPackages).where(eligible).get();
    const linkedIds=[...new Set(reservations.map(r=>r.packageId))];
    const linked=linkedIds.length?await db.select({pkg:s.logisticsPackages,freightConfirmed:sql<boolean>`${freightPaidSql("logistics_packages")}`}).from(s.logisticsPackages).where(inArray(s.logisticsPackages.id,linkedIds)).all():[];
    const packages=[...new Map([...candidates,...linked].map(p=>[p.pkg.id,{...p.pkg,freightConfirmed:!!p.freightConfirmed}])).values()];
    const costIds=positions.map(p=>p.costItemId);
    const costs=costIds.length?await db.select().from(s.purchaseItemCosts).where(inArray(s.purchaseItemCosts.id,costIds)).all():[];
    const orderIds=[...new Set(costs.map(c=>c.orderId))],originalIds=costs.flatMap(c=>c.purchaseItemId?[c.purchaseItemId]:[]),additionalIds=costs.flatMap(c=>c.additionalOrderItemId?[c.additionalOrderItemId]:[]);
    const [orders,originals,additionals,corrections,allRefunds,allParticipants]=await Promise.all([
      orderIds.length?db.select().from(s.purchaseCostOrders).where(inArray(s.purchaseCostOrders.id,orderIds)).all():[],
      originalIds.length?db.select().from(s.purchaseItems).where(inArray(s.purchaseItems.id,originalIds)).all():[],
      additionalIds.length?db.select().from(s.purchaseAdditionalOrderItems).where(inArray(s.purchaseAdditionalOrderItems.id,additionalIds)).all():[],
      orderIds.length?db.select().from(s.purchaseOrderCorrections).where(inArray(s.purchaseOrderCorrections.previousOrderId,orderIds)).all():[],
      costIds.length?db.select().from(s.purchaseCostRefunds).where(and(inArray(s.purchaseCostRefunds.costItemId,costIds),ne(s.purchaseCostRefunds.status,"voided"))).all():[],
      costIds.length?db.select().from(s.purchaseCostParticipants).where(inArray(s.purchaseCostParticipants.costItemId,costIds)).all():[],
    ]);
    const rows = [];
    for (const position of positions) {
      const cost=costs.find(c=>c.id===position.costItemId),order=orders.find(o=>o.id===cost?.orderId);
      if(!cost || !order || order.state!=="recorded" || corrections.some(c=>c.previousOrderId===order.id))continue;
      const source=cost.purchaseItemId?originals.find(i=>i.id===cost.purchaseItemId):additionals.find(i=>i.id===cost.additionalOrderItemId);
      if(!source)throw new DomainError("Origem do pedido não encontrada.",409);
      const item={cost,order,source,participants:allParticipants.filter(p=>p.costItemId===cost.id),quantity:source.quantity,name:source.name,superseded:false};
      const refunds = allRefunds.filter(r=>r.costItemId===position.costItemId);
      const assigned = reservations.filter(r => r.costItemId === position.costItemId);
      rows.push({ ...position, ...item, cancelledUnits: refunds.flatMap(r => Array.from({length:r.quantity},(_,i) => r.unitStart+i)),
        availableUnits: position.reviewState === "confirmed" ? availableWarehouseUnits(item.quantity,position.receivedUnits,refunds,assigned.map(r => r.unitIndex)) : [], reservations: assigned });
    }
    const accounts = await db.select().from(s.hubbuyAccounts).where(and(eq(s.hubbuyAccounts.workspaceId,workspaceId),isNull(s.hubbuyAccounts.deletedAt))).all();
    const origins=await db.select({trackingId:s.purchaseCostTrackings.id,purchaseId:s.purchases.id,name:s.purchases.name}).from(s.purchaseCostTrackings).innerJoin(s.purchases,eq(s.purchases.id,s.purchaseCostTrackings.purchaseId)).where(eq(s.purchaseCostTrackings.workspaceId,workspaceId)).all();
    const page=query?.page??0,pageSize=query?.pageSize??rows.length;
    const visible=pageResult?[...rows].sort((a,b)=>pageResult.ids.indexOf(a.costItemId)-pageResult.ids.indexOf(b.costItemId)):rows;
    const financials=new Map<string,Awaited<ReturnType<typeof readCostTracking>>>();
    if(query)for(const trackingId of new Set(visible.map(r=>r.cost.trackingId)))financials.set(trackingId,await readCostTracking(db,userId,trackingId,"order"));
    const targets=visible.flatMap(r=>[r.cost.purchaseItemId,r.cost.additionalOrderItemId]).filter((i):i is string=>!!i);
    const qc=targets.length?await db.select({purchaseItemId:s.hubbuyExternalItems.purchaseItemId,additionalOrderItemId:s.hubbuyExternalItems.additionalOrderItemId}).from(s.qcImages).innerJoin(s.hubbuyExternalItems,eq(s.qcImages.externalItemId,s.hubbuyExternalItems.id)).where(and(eq(s.hubbuyExternalItems.workspaceId,workspaceId),or(inArray(s.hubbuyExternalItems.purchaseItemId,targets),inArray(s.hubbuyExternalItems.additionalOrderItemId,targets)),eq(s.qcImages.status,"ready"),isNull(s.qcImages.deletedAt))).all():[];
    const enriched=visible.map(r=>{const detail=financials.get(r.cost.trackingId),display=detail?.financialDisplay.items.find(i=>i.costItemId===r.costItemId);return {...r,financial:display?.remaining??null,unitComponents:detail?.calculation.items.find(i=>i.id===r.costItemId)?.components??null,paymentStatus:detail?.charges.find(c=>c.orderId===r.order.id && c.chargeType==="products")?.paymentStatus??null,qcCount:qc.filter(i=>r.cost.purchaseItemId?i.purchaseItemId===r.cost.purchaseItemId:i.additionalOrderItemId===r.cost.additionalOrderItemId).length};});
    return { rows:enriched,origins,pagination:{page,pageSize,total:pageResult?.total??rows.length,hasMore:(page+1)*pageSize<(pageResult?.total??rows.length)},packages,packageOptions:{page:query?.packagePage??0,total:candidateCount?.total??0,hasMore:((query?.packagePage??0)+1)*100<(candidateCount?.total??0)},reservations,accounts: accounts.map(a => ({ id:a.id,label:a.label,status:a.status })) };
  }

  async function execute(workspaceId: string, key: string, raw: unknown) {
    id.parse(key); const command = warehouseCommandSchema.parse(raw), payload = JSON.stringify(command);
    return logisticsTransaction(() => db.transaction(async tx => {
      await authorization(tx,userId).requireWorkspaceMember(workspaceId);
      const prior = await tx.select().from(s.logisticsCommands).where(and(eq(s.logisticsCommands.workspaceId,workspaceId),eq(s.logisticsCommands.key,key))).get();
      if (prior) {
        if (prior.payload !== payload || prior.actorId !== userId) throw new DomainError("A chave já foi usada em outra operação.",409);
        return { id:prior.resultId };
      }
      const resultId = await apply(tx,workspaceId,command);
      await tx.insert(s.logisticsCommands).values({ id:crypto.randomUUID(), workspaceId,key,payload,resultId,actorId:userId,createdAt:new Date() }).run();
      return { id:resultId };
    }, { behavior:"immediate" }));
  }

  async function account(tx: CostTransaction, workspaceId: string, accountId: string) {
    const row = await tx.select().from(s.hubbuyAccounts).where(and(eq(s.hubbuyAccounts.id,accountId),eq(s.hubbuyAccounts.workspaceId,workspaceId),isNull(s.hubbuyAccounts.deletedAt))).get();
    if (!row || row.status !== "active") throw new DomainError("Selecione uma conta HubBuy ativa e conferida deste espaço.",409);
  }
  async function event(tx: CostTransaction, workspaceId: string, resourceId: string, command: Command, before: unknown, after: unknown) {
    await tx.insert(s.logisticsEvents).values({id:crypto.randomUUID(),workspaceId,resourceId,action:command.operation,reason:command.reason,before,after,actorId:userId,createdAt:new Date()}).run();
  }
  async function apply(tx: CostTransaction, workspaceId: string, command: Command): Promise<string> {
    const now = new Date();
    if (command.operation === "receive") {
      await account(tx,workspaceId,command.accountId);
      const position = await tx.select().from(s.orderWarehousePositions).where(and(eq(s.orderWarehousePositions.costItemId,command.costItemId),eq(s.orderWarehousePositions.workspaceId,workspaceId))).get();
      if (!position) throw new DomainError("Posição não encontrada.",404);
      if (position.revision !== command.expectedRevision) throw new DomainError("A posição mudou. Atualize a página.",409);
      const item = await itemContext(tx,command.costItemId);
      if (item.superseded || item.order.state !== "recorded") throw new DomainError("Este pedido não está vigente.",409);
      if (item.order.accountId && item.order.accountId !== command.accountId) throw new DomainError("A conta diverge da origem financeira.",409);
      const reservations = await tx.select().from(s.logisticsReservations).where(and(eq(s.logisticsReservations.costItemId,command.costItemId),isNull(s.logisticsReservations.releasedAt))).all();
      const reservedPackages=reservations.length?await tx.select().from(s.logisticsPackages).where(inArray(s.logisticsPackages.id,[...new Set(reservations.map(r=>r.packageId))])).all():[];
      if(reservedPackages.some(p=>p.accountId!==null && p.accountId!==command.accountId))throw new DomainError("A conta diverge de um pacote já vinculado.",409);
      if (reservations.some(r => !command.units.includes(r.unitIndex)) || (reservations.length && position.accountId && position.accountId !== command.accountId)) throw new DomainError("Retire as reservas antes de corrigir a chegada ou conta.",409);
      availableWarehouseUnits(item.quantity,command.units,[],[]);
      const refunds = await tx.select().from(s.purchaseCostRefunds).where(and(eq(s.purchaseCostRefunds.costItemId,command.costItemId),ne(s.purchaseCostRefunds.status,"voided"))).all();
      if (command.units.some(unit => refunds.some(r => unit>=r.unitStart && unit<r.unitStart+r.quantity))) throw new DomainError("Unidades canceladas não podem chegar ao armazém.",409);
      const after = { receivedUnits:command.units,accountId:command.accountId,reviewState:"confirmed" as const,revision:position.revision+1,updatedBy:userId,updatedAt:now };
      await tx.update(s.orderWarehousePositions).set(after).where(eq(s.orderWarehousePositions.costItemId,position.costItemId)).run();
      await event(tx,workspaceId,position.costItemId,command,position,after); return position.costItemId;
    }
    let pkg = command.packageId ? await tx.select().from(s.logisticsPackages).where(and(eq(s.logisticsPackages.id,command.packageId),eq(s.logisticsPackages.workspaceId,workspaceId))).get() : undefined;
    if (command.packageId && !pkg) throw new DomainError("Pacote não encontrado.",404);
    if (pkg && (pkg.revision !== command.expectedRevision || pkg.reviewState !== "confirmed" || pkg.contentClosedAt || pkg.stage !== "preparing" || pkg.financialClosedAt)) throw new DomainError("Confira o pacote ou atualize sua revisão antes de alterar o conteúdo.",409);
    if (command.operation === "release") {
      if (!pkg) throw new DomainError("Pacote não encontrado.",404);
      const rows = await tx.select().from(s.logisticsReservations).where(and(eq(s.logisticsReservations.packageId,pkg.id),inArray(s.logisticsReservations.id,command.reservationIds),isNull(s.logisticsReservations.releasedAt))).all();
      if (rows.length !== command.reservationIds.length) throw new DomainError("A seleção de reservas mudou.",409);
      await tx.update(s.logisticsReservations).set({releasedAt:now}).where(inArray(s.logisticsReservations.id,rows.map(r => r.id))).run();
      await tx.update(s.logisticsPackages).set({revision:pkg.revision+1}).where(eq(s.logisticsPackages.id,pkg.id)).run();
      for (const costItemId of new Set(rows.map(r => r.costItemId))) await bumpPosition(tx,costItemId);
      await event(tx,workspaceId,pkg.id,command,pkg,rows); return pkg.id;
    }
    await account(tx,workspaceId,command.accountId);
    if (pkg && pkg.accountId !== command.accountId) throw new DomainError("O pacote pertence a outra conta.",409);
    if (!pkg) {
      if (!command.name) throw new DomainError("Informe o nome do pacote.",400);
      pkg = await tx.insert(s.logisticsPackages).values({id:crypto.randomUUID(),workspaceId,accountId:command.accountId,name:command.name,reviewState:"confirmed",stage:"preparing",createdBy:userId,createdAt:now}).returning().get();
    }
    for (const selected of command.selection) {
      const position = await tx.select().from(s.orderWarehousePositions).where(and(eq(s.orderWarehousePositions.costItemId,selected.costItemId),eq(s.orderWarehousePositions.workspaceId,workspaceId))).get();
      if (!position || position.revision !== selected.expectedRevision || position.reviewState !== "confirmed" || position.accountId !== command.accountId) throw new DomainError("A seleção mudou ou pertence a outra conta. Atualize os pedidos.",409);
      const item = await itemContext(tx,selected.costItemId);
      if (item.superseded || item.order.state !== "recorded") throw new DomainError("O pedido selecionado não está vigente.",409);
      const refunds = await tx.select().from(s.purchaseCostRefunds).where(and(eq(s.purchaseCostRefunds.costItemId,selected.costItemId),ne(s.purchaseCostRefunds.status,"voided"))).all();
      const reserved = await tx.select().from(s.logisticsReservations).where(and(eq(s.logisticsReservations.costItemId,selected.costItemId),isNull(s.logisticsReservations.releasedAt))).all();
      const free = availableWarehouseUnits(item.quantity,position.receivedUnits,refunds,reserved.map(r => r.unitIndex));
      if (selected.units.some(i => !free.includes(i))) throw new DomainError("Estas unidades já estão reservadas, canceladas ou aguardando chegada.",409);
      for(let offset=0;offset<selected.units.length;offset+=100)await tx.insert(s.logisticsReservations).values(selected.units.slice(offset,offset+100).map(unitIndex => ({id:crypto.randomUUID(),packageId:pkg!.id,costItemId:selected.costItemId,unitIndex,createdBy:userId,createdAt:now}))).run();
      await bumpPosition(tx,selected.costItemId);
    }
    await tx.update(s.logisticsPackages).set({revision:pkg.revision+1}).where(eq(s.logisticsPackages.id,pkg.id)).run();
    await event(tx,workspaceId,pkg.id,command,pkg,command.selection); return pkg.id;
  }
  async function bumpPosition(tx: CostTransaction,costItemId: string) {
    const position = await tx.select().from(s.orderWarehousePositions).where(eq(s.orderWarehousePositions.costItemId,costItemId)).get();
    if (!position) throw new DomainError("Posição não encontrada.",409);
    await tx.update(s.orderWarehousePositions).set({revision:position.revision+1,updatedBy:userId,updatedAt:new Date()}).where(eq(s.orderWarehousePositions.costItemId,costItemId)).run();
  }
  return { list,execute };
}

async function itemContext(db: Pick<AppDatabase,"select">,costItemId: string) {
  const cost = await db.select().from(s.purchaseItemCosts).where(eq(s.purchaseItemCosts.id,costItemId)).get();
  if (!cost || !cost.orderId) throw new DomainError("Item não encontrado.",404);
  const order = await db.select().from(s.purchaseCostOrders).where(eq(s.purchaseCostOrders.id,cost.orderId)).get();
  const source = cost.purchaseItemId ? await db.select().from(s.purchaseItems).where(eq(s.purchaseItems.id,cost.purchaseItemId)).get() : cost.additionalOrderItemId ? await db.select().from(s.purchaseAdditionalOrderItems).where(eq(s.purchaseAdditionalOrderItems.id,cost.additionalOrderItemId)).get() : null;
  if (!order || !source) throw new DomainError("Origem do pedido não encontrada.",409);
  const correction = await db.select().from(s.purchaseOrderCorrections).where(eq(s.purchaseOrderCorrections.previousOrderId,order.id)).get();
  const participants=await db.select().from(s.purchaseCostParticipants).where(eq(s.purchaseCostParticipants.costItemId,costItemId)).all();
  return {cost,order,source,participants,quantity:source.quantity,name:source.name,superseded:!!correction};
}
