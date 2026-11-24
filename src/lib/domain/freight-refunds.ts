import {randomUUID} from "node:crypto";
import {eq,inArray} from "drizzle-orm";
import {z} from "zod";
import type {AppDatabase} from "../db/connection";
import * as s from "../db/schema";
import * as f from "../db/freight-schema";
import * as r from "../db/freight-refund-schema";
import {financialCommandBase,financialConflict,freightMinor,freightWrite} from "./freight-context";
import {calculateHubBuyBalanceState} from "./hubbuy-balance-services";
import {allocateRefundAcrossSources} from "./hubbuy-balance-calculations";
export async function netFreightSources(db:Pick<AppDatabase,"select">,paymentId:string){
  const sources=await db.select().from(f.freightSources).where(eq(f.freightSources.paymentId,paymentId));
  const refunds=await db.select().from(r.freightRefunds).where(eq(r.freightRefunds.paymentId,paymentId));
  const reversals=refunds.length?await db.select().from(r.freightRefundReversals).where(inArray(r.freightRefundReversals.refundId,refunds.map(row=>row.id))):[];
  const active=refunds.filter(row=>!reversals.some(reverse=>reverse.refundId===row.id));
  const refunded=active.length?await db.select().from(r.freightRefundSources).where(inArray(r.freightRefundSources.refundId,active.map(row=>row.id))):[];
  return {refunds,reversals,active,sources:sources.map(source=>({...source,nativeMinor:source.nativeMinor-refunded.filter(row=>row.sourceId===source.id).reduce((sum,row)=>sum+row.nativeMinor,0),principalBrlCents:source.principalBrlCents-refunded.filter(row=>row.sourceId===source.id).reduce((sum,row)=>sum+row.historicalBrlCents,0)}))};
}
const refundCommand=z.object({...financialCommandBase,expectedAccountRevision:z.number().int().nonnegative(),nativeMinor:freightMinor.min(1),destination:z.enum(["wallet","external"]),actualBrlCents:freightMinor.nullable(),externalReference:z.string().trim().min(1).max(200),confirmedReceived:z.literal(true)}).strict();
const reverseCommand=z.object({...financialCommandBase,expectedAccountRevision:z.number().int().nonnegative(),refundId:z.string().min(1),confirmedRegistrationError:z.literal(true)}).strict();
export function freightRefundServices(db:AppDatabase,actorId:string,workspaceId:string){
  async function record(packageId:string,input:unknown,previewOnly=false){
    const command=refundCommand.parse(input);
    return freightWrite(db,actorId,workspaceId,packageId,"freight_refund_received",command,previewOnly,false,async(tx,context,operationId)=>{
      if(!context.payment||!context.pkg.accountId||context.pkg.revision!==command.expectedRevision||context.pkg.financialClosedAt)throw financialConflict("O pagamento mudou ou os custos estão encerrados.");
      const payment=context.payment,state=await calculateHubBuyBalanceState(tx,context.pkg.accountId),net=await netFreightSources(tx,payment.id);
      if(state.account.revision!==command.expectedAccountRevision||!state.reconciled||state.account.status!=="active")throw financialConflict("Confira a conta antes de registrar o recebimento.");
      if(net.refunds.some(row=>row.externalReference===command.externalReference))throw financialConflict("Esta devolução já foi registrada.","FINANCIAL_REFERENCE_DUPLICATE");
      if(command.destination==="wallet"&&(payment.nativeCurrency!=="CNY"||command.actualBrlCents!==null))throw financialConflict("Crédito na carteira exige recebimento CNY; BRL externo tem destino próprio.");
      if(command.destination==="external"&&(!command.actualBrlCents||command.actualBrlCents<=0))throw financialConflict("Informe o BRL efetivamente recebido fora da carteira.");
      const eligible=net.sources.filter(row=>row.kind!=="topup_fee"&&row.nativeMinor>0).sort((a,b)=>a.id.localeCompare(b.id));
      const portions=allocateRefundAcrossSources(command.nativeMinor,eligible.map((source,order)=>({id:source.id,order,remainingRefundableCnyMinor:source.nativeMinor,remainingHistoricalBrlCents:source.principalBrlCents}))).filter(row=>row.cnyMinor>0);
      const historicalBrlCents=portions.reduce((sum,row)=>sum+row.historicalBrlCents,0),refundId=randomUUID();
      const balances=portions.map(row=>({personId:eligible.find(source=>source.id===row.sourceId)!.personId,cnyMinor:row.cnyMinor,historicalBrlCents:row.historicalBrlCents}));
      if(!previewOnly){
        let creditEntryId:string|null=null;
        if(command.destination==="wallet"){
          creditEntryId=randomUUID();
          await tx.insert(s.hubbuyBalanceEntries).values({id:creditEntryId,accountId:context.pkg.accountId,operationId,sequence:(state.entries.at(-1)?.sequence??-1)+1,direction:"credit",amountCnyMinor:command.nativeMinor,historicalBrlCents,sourceType:"refund_received",sourceId:`freight-refund:${refundId}`,createdAt:new Date()});
          await tx.insert(s.hubbuyBalanceCreditShares).values([...new Set(balances.map(row=>row.personId))].map((personId,allocationOrder)=>({id:randomUUID(),creditEntryId:creditEntryId!,personId,allocationOrder,amountCnyMinor:balances.filter(row=>row.personId===personId).reduce((sum,row)=>sum+row.cnyMinor,0),historicalBrlCents:balances.filter(row=>row.personId===personId).reduce((sum,row)=>sum+row.historicalBrlCents,0)})));
          await tx.update(s.hubbuyAccounts).set({balanceCnyMinor:state.account.balanceCnyMinor+command.nativeMinor,revision:state.account.revision+1,updatedAt:new Date(),updatedBy:actorId}).where(eq(s.hubbuyAccounts.id,context.pkg.accountId));
        }
        await tx.insert(r.freightRefunds).values({id:refundId,paymentId:payment.id,operationId,destination:command.destination,nativeMinor:command.nativeMinor,historicalBrlCents,actualBrlCents:command.actualBrlCents,creditEntryId,externalReference:command.externalReference});
        await tx.insert(r.freightRefundSources).values(portions.map(row=>({id:randomUUID(),refundId,sourceId:row.sourceId,nativeMinor:row.cnyMinor,historicalBrlCents:row.historicalBrlCents})));
        await tx.update(s.logisticsPackages).set({freightCents:net.sources.reduce((sum,row)=>sum+row.principalBrlCents,0)-historicalBrlCents,revision:context.pkg.revision+1}).where(eq(s.logisticsPackages.id,packageId));
      }
      return {refundId:previewOnly?null:refundId,nativeMinor:command.nativeMinor,nativeCurrency:payment.nativeCurrency,principalBrlCents:historicalBrlCents,feeBrlCents:0,balanceBeforeCnyMinor:state.account.balanceCnyMinor,balanceAfterCnyMinor:state.account.balanceCnyMinor+(command.destination==="wallet"?command.nativeMinor:0),owners:balances};
    });
  }
  async function reverse(packageId:string,input:unknown,previewOnly=false){
    const command=reverseCommand.parse(input);
    return freightWrite(db,actorId,workspaceId,packageId,"freight_refund_reversed",command,previewOnly,false,async(tx,context,operationId)=>{
      if(!context.payment||!context.pkg.accountId||context.pkg.revision!==command.expectedRevision||context.pkg.financialClosedAt)throw financialConflict("O pagamento mudou ou os custos estão encerrados.");
      const net=await netFreightSources(tx,context.payment.id),refund=net.active.find(row=>row.id===command.refundId);
      if(!refund)throw financialConflict("Recebimento já anulado ou de outro pagamento.");
      const state=await calculateHubBuyBalanceState(tx,context.pkg.accountId);
      if(state.account.revision!==command.expectedAccountRevision||!state.reconciled||state.account.status!=="active")throw financialConflict("Confira a revisão da conta.");
      const shares=state.shares.filter(row=>row.creditEntryId===refund.creditEntryId);
      if(shares.some(share=>state.consumptions.some(use=>use.creditShareId===share.id)))throw financialConflict("O crédito da devolução já foi consumido. Corrija primeiro as operações dependentes.","FREIGHT_REFUND_CONSUMED");
      if(!previewOnly){
        let debitEntryId:string|null=null;
        if(refund.creditEntryId){debitEntryId=randomUUID();await tx.insert(s.hubbuyBalanceEntries).values({id:debitEntryId,accountId:context.pkg.accountId,operationId,sequence:(state.entries.at(-1)?.sequence??-1)+1,direction:"debit",amountCnyMinor:refund.nativeMinor,historicalBrlCents:refund.historicalBrlCents,sourceType:"reversal",sourceId:refund.id,reversalOfEntryId:refund.creditEntryId,createdAt:new Date()});await tx.insert(s.hubbuyBalanceConsumptions).values(shares.map((share,allocationOrder)=>({id:randomUUID(),debitEntryId:debitEntryId!,creditShareId:share.id,allocationOrder,amountCnyMinor:share.amountCnyMinor,historicalBrlCents:share.historicalBrlCents,createdAt:new Date()})));await tx.update(s.hubbuyAccounts).set({balanceCnyMinor:state.account.balanceCnyMinor-refund.nativeMinor,revision:state.account.revision+1,updatedAt:new Date(),updatedBy:actorId}).where(eq(s.hubbuyAccounts.id,context.pkg.accountId));}
        await tx.insert(r.freightRefundReversals).values({refundId:refund.id,operationId,debitEntryId});
        await tx.update(s.logisticsPackages).set({freightCents:net.sources.reduce((sum,row)=>sum+row.principalBrlCents,0)+refund.historicalBrlCents,revision:context.pkg.revision+1}).where(eq(s.logisticsPackages.id,packageId));
      }
      return {refundId:refund.id,balanceBeforeCnyMinor:state.account.balanceCnyMinor,balanceAfterCnyMinor:state.account.balanceCnyMinor-(refund.creditEntryId?refund.nativeMinor:0)};
    });
  }
  return {record,preview:(packageId:string,input:unknown)=>record(packageId,input,true),reverse,previewReversal:(packageId:string,input:unknown)=>reverse(packageId,input,true)};
}
