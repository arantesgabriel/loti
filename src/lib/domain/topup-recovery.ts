import {allocateExactMinor} from "./hubbuy-balance-calculations";
import {DomainError} from "./errors";
import type {calculateHubBuyBalanceState} from "./hubbuy-balance-services";

type State=Awaited<ReturnType<typeof calculateHubBuyBalanceState>>;
const blocked=()=>new DomainError("O principal da recarga ainda tem consumo ativo ou recuperação incompleta. Corrija primeiro as operações dependentes.",409,"TOPUP_HAS_DEPENDENCIES");

/** Follow complete, owner-preserving compensations, never reuse spent originals
 * or substitute an unrelated available credit. Restorations may pool several
 * origins: the entire reachable pool must have no active economic consumption.
 * Audited reversals of other topups withdraw their own roots from that pool. */
export function recoverTopupPrincipal(state:State,creditEntryId:string,auditedTopupDebits:ReadonlySet<string>){
  const entries=new Map(state.entries.map(row=>[row.id,row])),shares=new Map(state.shares.map(row=>[row.id,row]));
  const roots=state.shares.filter(row=>row.creditEntryId===creditEntryId);
  const usesByShare=new Map<string,State["consumptions"]>();
  const usesByDebit=new Map<string,State["consumptions"]>(),sharesByCredit=new Map<string,State["shares"]>(),creditsByDebit=new Map<string,State["entries"]>();
  for(const share of state.shares)sharesByCredit.set(share.creditEntryId,[...(sharesByCredit.get(share.creditEntryId)??[]),share]);
  for(const entry of state.entries)if(entry.direction==="credit"&&entry.sourceType==="reversal"&&entry.reversalOfEntryId)creditsByDebit.set(entry.reversalOfEntryId,[...(creditsByDebit.get(entry.reversalOfEntryId)??[]),entry]);
  for(const use of state.consumptions){usesByShare.set(use.creditShareId,[...(usesByShare.get(use.creditShareId)??[]),use]);usesByDebit.set(use.debitEntryId,[...(usesByDebit.get(use.debitEntryId)??[]),use]);}
  const recovery=new Map<string,State["shares"]>();
  for(const debit of state.entries.filter(row=>row.direction==="debit")){
    const credits=(creditsByDebit.get(debit.id)??[]).filter(row=>row.sequence>debit.sequence);
    if(debit.historicalBrlCents===null||credits.some(row=>row.historicalBrlCents===null))continue;
    if(credits.reduce((n,row)=>n+BigInt(row.amountCnyMinor),0n)!==BigInt(debit.amountCnyMinor)||credits.reduce((n,row)=>n+BigInt(row.historicalBrlCents??0),0n)!==BigInt(debit.historicalBrlCents??0))continue;
    const restored=credits.flatMap(credit=>sharesByCredit.get(credit.id)??[]),used=usesByDebit.get(debit.id)??[];
    const owners=new Set([...restored.map(row=>row.personId),...used.map(row=>shares.get(row.creditShareId)!.personId)]);
    if([...owners].some(personId=>(["amountCnyMinor","historicalBrlCents"] as const).some(field=>used.filter(row=>shares.get(row.creditShareId)?.personId===personId).reduce((n,row)=>n+BigInt(row[field]),0n)!==restored.filter(row=>row.personId===personId).reduce((n,row)=>n+BigInt(row[field]),0n))))continue;
    recovery.set(debit.id,restored);
  }
  const consumptions:{creditShareId:string;amountCnyMinor:number;historicalBrlCents:number}[]=[];
  for(const personId of new Set(roots.map(row=>row.personId))){
    const originals=roots.filter(row=>row.personId===personId),reachable=new Set(originals.map(row=>row.id)),queue=[...reachable];
    for(let index=0;index<queue.length;index++)for(const use of usesByShare.get(queue[index])??[]){
      if(auditedTopupDebits.has(use.debitEntryId))continue;
      const restored=recovery.get(use.debitEntryId);if(!restored)throw blocked();
      for(const share of restored.filter(row=>row.personId===personId))if(!reachable.has(share.id)){reachable.add(share.id);queue.push(share.id);}
    }
    const unspent=state.availableShares.filter(row=>originals.some(root=>root.id===row.id)&&row.availableCnyMinor>0);
    for(const share of unspent)consumptions.push({creditShareId:share.id,amountCnyMinor:share.availableCnyMinor,historicalBrlCents:share.availableHistoricalBrlCents});
    const cny=originals.reduce((n,row)=>n+row.amountCnyMinor,0)-unspent.reduce((n,row)=>n+row.availableCnyMinor,0),brl=originals.reduce((n,row)=>n+row.historicalBrlCents,0)-unspent.reduce((n,row)=>n+row.availableHistoricalBrlCents,0);
    if(!cny){if(brl)throw blocked();continue;}
    const available=state.availableShares.filter(row=>reachable.has(row.id)&&!originals.some(root=>root.id===row.id)&&row.availableCnyMinor>0).sort((a,b)=>b.availableHistoricalBrlCents-a.availableHistoricalBrlCents||entries.get(a.creditEntryId)!.sequence-entries.get(b.creditEntryId)!.sequence||a.id.localeCompare(b.id));
    const totalCny=available.reduce((n,row)=>n+row.availableCnyMinor,0),totalBrl=available.reduce((n,row)=>n+row.availableHistoricalBrlCents,0);
    if(totalCny<cny||totalBrl<brl)throw blocked();
    // Allocate the smaller native side (withdrawal or remainder). A lot with
    // historical basis on either side must retain a positive native unit;
    // exhausting its CNY while leaving BRL behind would break reconciliation.
    const complement=cny>totalCny-cny,sideCny=complement?totalCny-cny:cny,sideBrl=complement?totalBrl-brl:brl;
    let resolved=false;
    for(let start=0;start<Math.max(1,available.length)&&!resolved;start++){
      const sideBasis=available.map(()=>0);let left=sideBrl;
      const order=[...available.keys()].slice(start).concat([...available.keys()].slice(0,start));
      for(const index of order){const row=available[index],amount=Math.min(left,row.availableHistoricalBrlCents);if(row.availableCnyMinor===1&&amount<row.availableHistoricalBrlCents)continue;sideBasis[index]=amount;left-=amount;}
      if(left)continue;
      const minimum=sideBasis.map(amount=>amount>0?1:0),capacity=available.map((row,index)=>row.availableCnyMinor-(sideBasis[index]<row.availableHistoricalBrlCents?1:0));
      const min=minimum.reduce<number>((n,value)=>n+value,0),max=capacity.reduce((n,value)=>n+value,0);
      if(min>sideCny||max<sideCny)continue;
      const extra=sideCny===min?available.map(()=>0):allocateExactMinor(sideCny-min,available.map((row,index)=>({id:row.id,order:index,weight:capacity[index]-minimum[index]})));
      available.forEach((row,index)=>{const native=minimum[index]+extra[index],takeCny=complement?row.availableCnyMinor-native:native,takeBrl=complement?row.availableHistoricalBrlCents-sideBasis[index]:sideBasis[index];if(takeCny)consumptions.push({creditShareId:row.id,amountCnyMinor:takeCny,historicalBrlCents:takeBrl});});resolved=true;
    }
    if(!resolved)throw blocked();
  }
  return consumptions;
}
