import {freightPaidSql} from "./logistics-package-status";
import {readDatabaseSnapshot} from "../db/read-snapshot";
import { and, eq, inArray, isNull, ne, or, asc, count, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../db/connection";
import * as s from "../db/schema";
import { authorization } from "./authorization";
import { DomainError } from "./errors";
import type { CostTransaction } from "./purchase-cost-initialization";
import { logisticsTransaction } from "./logistics-transaction";
import { availableWarehouseUnits } from "./warehouse-calculations";
import {warehousePage} from "./warehouse-query";
import {readCostTracking,readWarehouseCostKeys} from "./package-cost-reading";

const id = z.string().min(1).max(200), revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const units = z.array(z.number().int().min(0).max(9999)).max(10000).refine(v => new Set(v).size === v.length,"Unidades duplicadas.");
const reason = z.string().trim().min(3).max(1000);
const selection = z.array(z.object({ costItemId: id, expectedRevision: revision, units: units.min(1) }).strict()).min(1).max(100)
  .refine(rows => new Set(rows.map(r => r.costItemId)).size === rows.length,"Itens duplicados.")
  .refine(rows => rows.reduce((n,r)=>n+r.units.length,0)<=10000,"Selecione até 10.000 unidades por operação.");
const arrival = z.object({
  costItemId: id, expectedRevision: revision, accountId: id,
  quantity: z.number().int().min(1).max(10000),
  description: z.string().trim().max(1000).optional().transform(value => value || undefined),
}).strict();
const arrivals = z.array(arrival).min(1).max(100)
  .refine(rows => new Set(rows.map(row => row.costItemId)).size === rows.length, "Itens duplicados.")
  .refine(rows => rows.reduce((total, row) => total + row.quantity, 0) <= 10000, "Registre até 10.000 unidades por operação.");
export const warehouseCommandSchema = z.discriminatedUnion("operation", [
  arrival.extend({ operation: z.literal("register-arrival") }),
  z.object({ operation: z.literal("register-arrivals"), arrivals }).strict(),
  z.object({ operation: z.literal("receive"), costItemId: id, expectedRevision: revision, accountId: id, units, reason }).strict(),
  z.object({ operation: z.literal("reserve"), packageId: id.optional(), name: z.string().trim().min(1).max(120).optional(), expectedRevision: revision.optional(), accountId: id, selection, reason }).strict(),
  z.object({ operation: z.literal("release"), packageId: id, expectedRevision: revision, reservationIds: z.array(id).min(1).max(10000), reason }).strict(),
  z.object({ operation: z.literal("move"), packageId: id, targetPackageId: id, expectedRevision: revision, targetRevision: revision, reservationIds: z.array(id).min(1).max(10000), reason }).strict(),
]);
type Command = z.infer<typeof warehouseCommandSchema>;
const itemIdsQuery = z.string().max(20099).default("").refine(value => !value || (value.split(",").length <= 100 && value.split(",").every(id => id.length > 0 && id.length <= 200) && new Set(value.split(",")).size === value.split(",").length), "Selecione até 100 itens distintos.");
export const warehouseQuerySchema=z.object({workspaceId:z.string().min(1).max(200).optional(),itemIds:itemIdsQuery,sort:z.enum(["","product","stage","units","cost"]).default(""),direction:z.enum(["asc","desc"]).default("asc"),page:z.coerce.number().int().min(0).max(10000).default(0),pageSize:z.coerce.number().int().min(1).max(100).default(20),search:z.string().trim().max(200).default(""),account:z.string().max(200).default(""),person:z.string().max(200).default(""),origin:z.enum(["","original","additional"]).default(""),view:z.enum(["all","warehouse","available","awaiting"]).default("all"),status:z.enum(["","review","awaiting","warehouse","available","package","sent","received"]).default(""),trackingId:z.string().max(200).default(""),packageOptions:z.enum(["include","exclude","only"]).default("include"),packageId:z.string().max(200).default(""),packageAccountId:z.string().max(200).default(""),packageSearch:z.string().trim().max(200).default(""),packagePage:z.coerce.number().int().min(0).max(10000).default(0)}).strict();

export function warehouseServices(db: AppDatabase, userId: string) {
  async function list(query?:z.infer<typeof warehouseQuerySchema>, expectedWorkspaceId?:string) {
    return readDatabaseSnapshot(db,tx=>readList(tx,query,expectedWorkspaceId));
  }
  async function readList(db:Pick<AppDatabase,"select"|"all">,query?:z.infer<typeof warehouseQuerySchema>,expectedWorkspaceId?:string) {
    if (expectedWorkspaceId && query?.workspaceId && expectedWorkspaceId !== query.workspaceId) throw new DomainError("O espaço ativo mudou. Atualize a tela antes de continuar.",409,"WORKSPACE_CONTEXT_CHANGED");
    const access = await authorization(db,userId).requireWorkspaceAccess(expectedWorkspaceId ?? query?.workspaceId);
    await authorization(db,userId).requireActiveWorkspaceContext(access.workspaceId);
    const { workspaceId } = access;
    const pageResult = query?.packageOptions === "only" ? { ids: [], total: 0 } : query ? await warehousePage(db, workspaceId, query, trackingIds => readWarehouseCostKeys(db, workspaceId, trackingIds)) : null;
    const positions = pageResult ? pageResult.ids.length ? await db.select().from(s.orderWarehousePositions).where(inArray(s.orderWarehousePositions.costItemId,pageResult.ids)).all() : [] : await db.select().from(s.orderWarehousePositions).where(eq(s.orderWarehousePositions.workspaceId,workspaceId)).all();
    const positionIds=positions.map(p=>p.costItemId);
    const reservations = positionIds.length ? await db.select().from(s.logisticsReservations).where(and(inArray(s.logisticsReservations.costItemId,positionIds),isNull(s.logisticsReservations.releasedAt))).all() : [];
    const eligible=and(eq(s.logisticsPackages.workspaceId,workspaceId),eq(s.logisticsPackages.stage,"preparing"),eq(s.logisticsPackages.reviewState,"confirmed"),isNull(s.logisticsPackages.contentClosedAt),isNull(s.logisticsPackages.financialClosedAt));
    const packageOptionsFilter = and(
      eligible,
      query?.packageAccountId ? eq(s.logisticsPackages.accountId, query.packageAccountId) : undefined,
      query?.packageSearch ? sql`instr(lower(${s.logisticsPackages.name}), lower(${query.packageSearch})) > 0` : undefined,
    );
    const candidates=query?.packageOptions === "exclude" ? [] : await db.select({pkg:s.logisticsPackages,freightConfirmed:sql<boolean>`${freightPaidSql("logistics_packages")}`}).from(s.logisticsPackages).where(packageOptionsFilter).orderBy(asc(s.logisticsPackages.name),asc(s.logisticsPackages.id)).limit(100).offset((query?.packagePage??0)*100).all();
    const candidateCount=query?.packageOptions === "exclude" ? undefined : await db.select({total:count()}).from(s.logisticsPackages).where(packageOptionsFilter).get();
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
    const activeAccounts = new Set(accounts.filter(account => account.status === "active").map(account => account.id));
    const arrivalAccounts = await db.all<{ accountId: string }>(sql`
      SELECT json_extract("after", '$.accountId') AS accountId
      FROM logistics_events
      WHERE workspace_id = ${workspaceId} AND actor_id = ${userId} AND action = 'register-arrival'
      GROUP BY accountId
      ORDER BY count(*) DESC, max(created_at) DESC, accountId ASC
    `);
    const suggestedArrivalAccountId = arrivalAccounts.find(row => activeAccounts.has(row.accountId))?.accountId ?? null;
    const origins=await db.select({trackingId:s.purchaseCostTrackings.id,purchaseId:s.purchases.id,name:s.purchases.name}).from(s.purchaseCostTrackings).innerJoin(s.purchases,eq(s.purchases.id,s.purchaseCostTrackings.purchaseId)).where(eq(s.purchaseCostTrackings.workspaceId,workspaceId)).all();
    const page=query?.page??0,pageSize=query?.pageSize??rows.length;
    const visible=pageResult?[...rows].sort((a,b)=>pageResult.ids.indexOf(a.costItemId)-pageResult.ids.indexOf(b.costItemId)):rows;
    const financials=new Map<string,Awaited<ReturnType<typeof readCostTracking>>>();
    if(query)for(const trackingId of new Set(visible.map(r=>r.cost.trackingId)))financials.set(trackingId,await readCostTracking(db,userId,trackingId,"order"));
    const targets=visible.flatMap(r=>[r.cost.purchaseItemId,r.cost.additionalOrderItemId]).filter((i):i is string=>!!i);
    const qc=targets.length?await db.select({purchaseItemId:s.hubbuyExternalItems.purchaseItemId,additionalOrderItemId:s.hubbuyExternalItems.additionalOrderItemId}).from(s.qcImages).innerJoin(s.hubbuyExternalItems,eq(s.qcImages.externalItemId,s.hubbuyExternalItems.id)).where(and(eq(s.hubbuyExternalItems.workspaceId,workspaceId),or(inArray(s.hubbuyExternalItems.purchaseItemId,targets),inArray(s.hubbuyExternalItems.additionalOrderItemId,targets)),eq(s.qcImages.status,"ready"),isNull(s.qcImages.deletedAt))).all():[];
    const enriched=visible.map(r=>{const detail=financials.get(r.cost.trackingId),display=detail?.financialDisplay.items.find(i=>i.costItemId===r.costItemId);return {...r,financial:display?.remaining??null,unitComponents:detail?.calculation.items.find(i=>i.id===r.costItemId)?.components??null,paymentStatus:detail?.charges.find(c=>c.orderId===r.order.id && c.chargeType==="products")?.paymentStatus??null,qcCount:qc.filter(i=>r.cost.purchaseItemId?i.purchaseItemId===r.cost.purchaseItemId:i.additionalOrderItemId===r.cost.additionalOrderItemId).length};});
    return { rows:enriched,origins,suggestedArrivalAccountId,pagination:{page,pageSize,total:pageResult?.total??rows.length,hasMore:(page+1)*pageSize<(pageResult?.total??rows.length)},packages,packageOptions:{page:query?.packagePage??0,total:candidateCount?.total??0,hasMore:((query?.packagePage??0)+1)*100<(candidateCount?.total??0)},reservations,accounts: accounts.map(a => ({ id:a.id,label:a.label,status:a.status })) };
  }

  async function execute(workspaceId: string, key: string, raw: unknown) {
    id.parse(key); const command = warehouseCommandSchema.parse(raw), payload = JSON.stringify(command);
    const arrivalRows = command.operation === "register-arrival" ? [command] : command.operation === "register-arrivals" ? command.arrivals : null;
    return logisticsTransaction(() => db.transaction(async tx => {
      await authorization(tx,userId).requireActiveWorkspaceContext(workspaceId);
      const prior = await tx.select().from(s.logisticsCommands).where(and(eq(s.logisticsCommands.workspaceId,workspaceId),eq(s.logisticsCommands.key,key))).get();
      const result = async (id: string) => {
        if (!arrivalRows) return { id };
        const query = warehouseQuerySchema.parse({ itemIds: arrivalRows.map(row => row.costItemId).join(","), pageSize: 100, packageOptions: "exclude" });
        const { rows } = await readList(tx, query, workspaceId);
        return { id, rows };
      };
      if (prior) {
        if (prior.payload !== payload || prior.actorId !== userId) throw new DomainError("A chave já foi usada em outra operação.",409);
        return result(prior.resultId);
      }
      let resultId: string;
      if (arrivalRows) {
        for (const row of arrivalRows) {
          try {
            await receive(tx, workspaceId, row);
          } catch (error) {
            if (arrivalRows.length === 1 || !(error instanceof DomainError)) throw error;
            throw new DomainError(`Item ${row.costItemId}: ${error.message}`, error.status, error.code);
          }
        }
        resultId = arrivalRows[0].costItemId;
      } else if (command.operation !== "register-arrival" && command.operation !== "register-arrivals") {
        resultId = await apply(tx, workspaceId, command);
      } else {
        throw new Error("Comando de chegada sem itens.");
      }
      await tx.insert(s.logisticsCommands).values({ id:crypto.randomUUID(), workspaceId,key,payload,resultId,actorId:userId,createdAt:new Date() }).run();
      return result(resultId);
    }, { behavior:"immediate" }));
  }

  async function account(tx: CostTransaction, workspaceId: string, accountId: string) {
    const row = await tx.select().from(s.hubbuyAccounts).where(and(eq(s.hubbuyAccounts.id,accountId),eq(s.hubbuyAccounts.workspaceId,workspaceId),isNull(s.hubbuyAccounts.deletedAt))).get();
    if (!row || row.status !== "active") throw new DomainError("Escolha uma conta HubBuy ativa neste grupo.",409);
  }
  async function event(tx: CostTransaction, workspaceId: string, resourceId: string, command: { operation: string; reason: string }, before: unknown, after: unknown) {
    await tx.insert(s.logisticsEvents).values({id:crypto.randomUUID(),workspaceId,resourceId,action:command.operation,reason:command.reason,before,after,actorId:userId,createdAt:new Date()}).run();
  }
  async function receive(tx: CostTransaction, workspaceId: string, command: Extract<Command, { operation: "receive" }> | z.infer<typeof arrival>) {
    const now = new Date();
    await account(tx,workspaceId,command.accountId);
    const position = await tx.select().from(s.orderWarehousePositions).where(and(eq(s.orderWarehousePositions.costItemId,command.costItemId),eq(s.orderWarehousePositions.workspaceId,workspaceId))).get();
    if (!position) throw new DomainError("Posição não encontrada.",404);
    if (position.revision !== command.expectedRevision) throw new DomainError("A posição mudou. Confira a chegada registrada antes de enviar novamente.",409,"WAREHOUSE_REVISION_CONFLICT");
    const item = await itemContext(tx,command.costItemId);
    if (item.superseded || item.order.state !== "recorded") throw new DomainError("Este pedido não está vigente.",409);
    if (item.order.accountId && item.order.accountId !== command.accountId) throw new DomainError("A conta diverge da origem financeira.",409);
    const reservations = await tx.select().from(s.logisticsReservations).where(and(eq(s.logisticsReservations.costItemId,command.costItemId),isNull(s.logisticsReservations.releasedAt))).all();
    const reservedPackages=reservations.length?await tx.select().from(s.logisticsPackages).where(inArray(s.logisticsPackages.id,[...new Set(reservations.map(r=>r.packageId))])).all():[];
    if(reservedPackages.some(p=>p.accountId!==null && p.accountId!==command.accountId))throw new DomainError("A conta diverge de um pacote já vinculado.",409);
    const incremental = "quantity" in command;
    if (incremental && position.accountId && position.accountId !== command.accountId) throw new DomainError("A conta diverge da posição no armazém.", 409);
    const refunds = await tx.select().from(s.purchaseCostRefunds).where(and(eq(s.purchaseCostRefunds.costItemId,command.costItemId),ne(s.purchaseCostRefunds.status,"voided"))).all();
    const isCancelled = (unit: number) => refunds.some(r => unit >= r.unitStart && unit < r.unitStart + r.quantity);
    const recorded = position.reviewState === "confirmed" ? position.receivedUnits.filter(unit => !isCancelled(unit)) : [];
    const recordedSet = new Set(recorded);
    const reserved = new Set(reservations.map(row => row.unitIndex));
    const eligible = incremental ? Array.from({ length: item.quantity }, (_, index) => index)
      .filter(unit => !isCancelled(unit) && !recordedSet.has(unit))
      .sort((left, right) => Number(reserved.has(right)) - Number(reserved.has(left))) : [];
    if (incremental && command.quantity > eligible.length) throw new DomainError("A quantidade supera o saldo a receber.", 409);
    const receivedUnits = incremental ? [...recorded, ...eligible.slice(0, command.quantity)].sort((a, b) => a - b) : command.units;
    if (reservations.some(r => !receivedUnits.includes(r.unitIndex)) || (reservations.length && position.accountId && position.accountId !== command.accountId)) throw new DomainError("Retire as reservas antes de corrigir a chegada ou conta.",409);
    availableWarehouseUnits(item.quantity,receivedUnits,[],[]);
    if (receivedUnits.some(isCancelled)) throw new DomainError("Unidades canceladas não podem chegar ao armazém.",409);
    const after = { receivedUnits,accountId:command.accountId,reviewState:"confirmed" as const,revision:position.revision+1,updatedBy:userId,updatedAt:now };
    await tx.update(s.orderWarehousePositions).set(after).where(eq(s.orderWarehousePositions.costItemId,position.costItemId)).run();
    await event(tx,workspaceId,position.costItemId,incremental ? { operation: "register-arrival", reason: "Chegada registrada no armazém." } : command,position,incremental ? { ...after, description: command.description } : after); return position.costItemId;
  }
  async function apply(tx: CostTransaction, workspaceId: string, command: Exclude<Command, { operation: "register-arrival" | "register-arrivals" }>): Promise<string> {
    const now = new Date();
    if (command.operation === "receive") return receive(tx, workspaceId, command);
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
    if (command.operation === "move") {
      if (!pkg) throw new DomainError("Pacote de origem não encontrado.",404);
      if (pkg.id === command.targetPackageId) throw new DomainError("Escolha outro pacote de destino.",400);
      const target = await tx.select().from(s.logisticsPackages).where(and(eq(s.logisticsPackages.id,command.targetPackageId),eq(s.logisticsPackages.workspaceId,workspaceId))).get();
      if (!target) throw new DomainError("Pacote de destino não encontrado.",404);
      if (target.revision !== command.targetRevision || target.reviewState !== "confirmed" || target.contentClosedAt || target.stage !== "preparing" || target.financialClosedAt) throw new DomainError("O pacote de destino não está mais aberto para montagem. Atualize as opções.",409);
      if (!pkg.accountId || target.accountId !== pkg.accountId) throw new DomainError("A troca só pode ocorrer entre pacotes da mesma conta HubBuy conferida.",409);
      await account(tx,workspaceId,target.accountId);
      const rows = await tx.select().from(s.logisticsReservations).where(and(eq(s.logisticsReservations.packageId,pkg.id),inArray(s.logisticsReservations.id,command.reservationIds),isNull(s.logisticsReservations.releasedAt))).all();
      if (rows.length !== command.reservationIds.length) throw new DomainError("A seleção de reservas mudou.",409);
      const costItemIds = [...new Set(rows.map(row => row.costItemId))];
      const positions = costItemIds.length ? await tx.select().from(s.orderWarehousePositions).where(and(eq(s.orderWarehousePositions.workspaceId,workspaceId),inArray(s.orderWarehousePositions.costItemId,costItemIds))).all() : [];
      const refunds = costItemIds.length ? await tx.select().from(s.purchaseCostRefunds).where(and(inArray(s.purchaseCostRefunds.costItemId,costItemIds),ne(s.purchaseCostRefunds.status,"voided"))).all() : [];
      for (const costItemId of costItemIds) {
        const position = positions.find(row => row.costItemId === costItemId);
        if (!position || position.reviewState !== "confirmed" || position.accountId !== target.accountId) throw new DomainError("A chegada ou conta deste produto mudou. Atualize os pedidos.",409);
        const item = await itemContext(tx,costItemId);
        if (item.superseded || item.order.state !== "recorded") throw new DomainError("Este pedido não está mais vigente.",409);
        const validReceived = availableWarehouseUnits(item.quantity,position.receivedUnits,refunds.filter(refund => refund.costItemId === costItemId),[]);
        if (rows.some(row => row.costItemId === costItemId && !validReceived.includes(row.unitIndex))) throw new DomainError("Uma das unidades deixou de estar disponível para montagem.",409);
      }
      const now = new Date();
      await tx.update(s.logisticsReservations).set({releasedAt:now}).where(inArray(s.logisticsReservations.id,rows.map(row => row.id))).run();
      for (let offset=0;offset<rows.length;offset+=100) await tx.insert(s.logisticsReservations).values(rows.slice(offset,offset+100).map(row => ({id:crypto.randomUUID(),packageId:target.id,costItemId:row.costItemId,unitIndex:row.unitIndex,createdBy:userId,createdAt:now}))).run();
      for (const costItemId of costItemIds) await bumpPosition(tx,costItemId);
      const updatedSource = await tx.update(s.logisticsPackages).set({revision:pkg.revision+1}).where(and(eq(s.logisticsPackages.id,pkg.id),eq(s.logisticsPackages.revision,command.expectedRevision))).run();
      const updatedTarget = await tx.update(s.logisticsPackages).set({revision:target.revision+1}).where(and(eq(s.logisticsPackages.id,target.id),eq(s.logisticsPackages.revision,command.targetRevision))).run();
      if (updatedSource.rowsAffected !== 1 || updatedTarget.rowsAffected !== 1) throw new DomainError("Um dos pacotes mudou. Atualize a montagem.",409);
      await event(tx,workspaceId,pkg.id,command,pkg,{targetPackageId:target.id,reservations:rows});
      await event(tx,workspaceId,target.id,command,target,{sourcePackageId:pkg.id,reservations:rows});
      return target.id;
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
