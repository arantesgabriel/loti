import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import * as s from "../db/schema";
import * as t from "../db/topup-schema";
import * as f from "../db/freight-schema";
import type { CostTransaction } from "./purchase-cost-initialization";
import { previewTopupFee } from "./hubbuy-topup-calculations";
import { allocateExactMinor } from "./hubbuy-balance-calculations";
import { financialConflict } from "./freight-context";

export async function previewTopupFees(db: Pick<AppDatabase, "select">, accountId: string,
  consumptions: { creditShareId: string; amountCnyMinor: number }[], explicit: { topupId: string; amountBrlCents: number }[] = [], releasedFreightPaymentId?: string) {
  const topups = await db.select().from(t.hubbuyTopups).where(eq(t.hubbuyTopups.accountId, accountId));
  const entries=await db.select().from(s.hubbuyBalanceEntries).where(eq(s.hubbuyBalanceEntries.accountId,accountId));
  const shares=await db.select({share:s.hubbuyBalanceCreditShares}).from(s.hubbuyBalanceCreditShares).innerJoin(s.hubbuyBalanceEntries,eq(s.hubbuyBalanceEntries.id,s.hubbuyBalanceCreditShares.creditEntryId)).where(eq(s.hubbuyBalanceEntries.accountId,accountId));
  const uses=await db.select({use:s.hubbuyBalanceConsumptions}).from(s.hubbuyBalanceConsumptions).innerJoin(s.hubbuyBalanceCreditShares,eq(s.hubbuyBalanceCreditShares.id,s.hubbuyBalanceConsumptions.creditShareId)).innerJoin(s.hubbuyBalanceEntries,eq(s.hubbuyBalanceEntries.id,s.hubbuyBalanceCreditShares.creditEntryId)).where(eq(s.hubbuyBalanceEntries.accountId,accountId));
  const ignoredDebits=new Set(entries.filter(entry=>entry.direction==="debit" && entries.filter(reverse=>reverse.direction==="credit" && reverse.reversalOfEntryId===entry.id).reduce((sum,reverse)=>sum+reverse.amountCnyMinor,0)===entry.amountCnyMinor).map(entry=>entry.id));
  const releasedUses=releasedFreightPaymentId?await db.select({use:s.hubbuyBalanceConsumptions}).from(f.freightSources).innerJoin(s.hubbuyBalanceConsumptions,eq(s.hubbuyBalanceConsumptions.id,f.freightSources.consumptionId)).where(eq(f.freightSources.paymentId,releasedFreightPaymentId)):[];
  for(const row of releasedUses)ignoredDebits.add(row.use.debitEntryId);
  const originTotals=(planned:typeof consumptions)=>{
    const byShare=new Map<string,number>();
    for(const {use} of uses)if(!ignoredDebits.has(use.debitEntryId))byShare.set(use.creditShareId,(byShare.get(use.creditShareId)??0)+use.amountCnyMinor);
    for(const use of planned)byShare.set(use.creditShareId,(byShare.get(use.creditShareId)??0)+use.amountCnyMinor);
    const totals=new Map<string,number>();
    const route=(shareId:string,amount:number,seen:Set<string>)=>{
      if(!amount)return;if(seen.has(shareId))throw financialConflict("Ciclo na origem do saldo restaurado.","TOPUP_FEE_INTEGRITY");
      const chain=new Set(seen).add(shareId),share=shares.find(row=>row.share.id===shareId)?.share;
      const entry=share?entries.find(row=>row.id===share.creditEntryId):undefined;
      const topup=entry?topups.find(row=>row.creditEntryId===entry.id):undefined;
      if(topup){totals.set(topup.id,(totals.get(topup.id)??0)+amount);return;}
      const virtualPerson=shareId.startsWith("restored:")?shareId.slice(9):null;
      const originalUses=virtualPerson?releasedUses.map(row=>row.use).filter(use=>shares.find(row=>row.share.id===use.creditShareId)?.share.personId===virtualPerson):entry?.sourceType==="reversal" && entry.reversalOfEntryId?uses.map(row=>row.use).filter(use=>use.debitEntryId===entry.reversalOfEntryId && shares.find(row=>row.share.id===use.creditShareId)?.share.personId===share?.personId):[];
      if(!originalUses.length)return;
      const ordered=[...originalUses].sort((a,b)=>a.allocationOrder-b.allocationOrder||a.id.localeCompare(b.id));
      const portions=allocateExactMinor(amount,ordered.map((use,order)=>({id:use.id,order,weight:use.amountCnyMinor})));
      ordered.forEach((use,index)=>route(use.creditShareId,portions[index],chain));
    };
    for(const [id,amount]of byShare)route(id,amount,new Set());
    return totals;
  };
  const beforeTotals=originTotals([]),afterTotals=originTotals(consumptions);
  const result: { topupId: string; amountBrlCents: number; remainingBrlCents: number; funders: { personId: string; amountBrlCents: number }[] }[] = [];
  if (new Set(explicit.map(row => row.topupId)).size !== explicit.length || explicit.some(row => !topups.some(topup => topup.id === row.topupId))) throw financialConflict("Taxa selecionada não pertence à conta.", "TOPUP_FEE_SCOPE");
  for (const topup of topups) {
    if (await db.select().from(t.hubbuyTopupReversals).where(eq(t.hubbuyTopupReversals.topupId, topup.id)).get()) continue;
    const funders = await db.select().from(t.hubbuyTopupFunders).where(eq(t.hubbuyTopupFunders.topupId, topup.id));
    const newCny = (afterTotals.get(topup.id)??0)-(beforeTotals.get(topup.id)??0);
    const chosen = explicit.find(row => row.topupId === topup.id);
    const allAllocations = await db.select().from(f.topupFeeAllocations).where(eq(f.topupFeeAllocations.topupId, topup.id));
    const inherited = releasedFreightPaymentId && allAllocations.some(row=>row.freightPaymentId===releasedFreightPaymentId);
    if (!newCny && !chosen && !inherited) continue;
    const allocations = releasedFreightPaymentId ? allAllocations.filter(row=>row.freightPaymentId!==releasedFreightPaymentId) : allAllocations;
    const assigned = allocations.reduce((sum, row) => sum + (row.reversesId ? -row.amountBrlCents : row.amountBrlCents), 0);
    const fee = previewTopupFee({ creditedCnyMinor: topup.cnyMinor, originalFeeBrlCents: topup.feeBrlCents, consumedBeforeCnyMinor: beforeTotals.get(topup.id)??0, consumeCnyMinor: newCny, assignedBeforeBrlCents: assigned, explicitBrlCents: chosen?.amountBrlCents });
    if (!fee.assignedBrlCents) continue;
    const previousPeople = allocations.length ? await db.select().from(f.topupFeeFunders).where(inArray(f.topupFeeFunders.feeAllocationId, allocations.map(row => row.id))) : [];
    const ordered = [...funders].sort((a, b) => a.personId.localeCompare(b.personId));
    const remainingFunders=ordered.map(row=>({...row,remaining:row.feeBrlCents-previousPeople.filter(p=>p.personId===row.personId).reduce((sum,p)=>sum+(allocations.find(a=>a.id===p.feeAllocationId)?.reversesId?-p.amountBrlCents:p.amountBrlCents),0)}));
    if(remainingFunders.some(row=>row.remaining<0))throw financialConflict("A taxa financiada não concilia com seus destinos.","TOPUP_FEE_INTEGRITY");
    // Split only the still-unassigned funding. Recomputing a largest-remainder
    // cumulative vector can reduce a person's prior integer allocation.
    const portions=allocateExactMinor(fee.assignedBrlCents,remainingFunders.map((row,order)=>({id:row.personId,order,weight:row.remaining})));
    const people=remainingFunders.map((row,index)=>({personId:row.personId,amountBrlCents:portions[index]})).filter(row=>row.amountBrlCents>0);
    if (people.reduce((sum, row) => sum + row.amountBrlCents, 0) !== fee.assignedBrlCents) throw financialConflict("As parcelas de taxa não conciliam.", "TOPUP_FEE_INTEGRITY");
    result.push({ topupId: topup.id, amountBrlCents: fee.assignedBrlCents, remainingBrlCents: fee.remainingBrlCents, funders: people });
  }
  return result;
}
export async function assignTopupFees(tx: CostTransaction, operationId: string, fees: Awaited<ReturnType<typeof previewTopupFees>>, destination: { freightPaymentId: string; orderId?: never } | { orderId: string; freightPaymentId?: never }) {
  const result = [];
  for (const fee of fees) {
    const id = randomUUID();
    await tx.insert(f.topupFeeAllocations).values({ id, topupId: fee.topupId, operationId, ...destination, amountBrlCents: fee.amountBrlCents });
    await tx.insert(f.topupFeeFunders).values(fee.funders.map(row => ({ id: randomUUID(), feeAllocationId: id, ...row })));
    result.push({ ...fee, id });
  }
  return result;
}
export async function releaseTopupFees(tx: CostTransaction, operationId: string, destination: { freightPaymentId: string } | { orderId: string }) {
  const rows = await tx.select().from(f.topupFeeAllocations).where("freightPaymentId" in destination ? eq(f.topupFeeAllocations.freightPaymentId, destination.freightPaymentId) : eq(f.topupFeeAllocations.orderId, destination.orderId));
  for (const row of rows.filter(row => !row.reversesId && !rows.some(other => other.reversesId === row.id))) {
    const id = randomUUID();
    await tx.insert(f.topupFeeAllocations).values({ ...row, id, operationId, reversesId: row.id });
    const funders = await tx.select().from(f.topupFeeFunders).where(eq(f.topupFeeFunders.feeAllocationId, row.id));
    if (funders.length) await tx.insert(f.topupFeeFunders).values(funders.map(person => ({ ...person, id: randomUUID(), feeAllocationId: id })));
  }
}
