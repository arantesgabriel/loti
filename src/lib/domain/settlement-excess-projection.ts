type Receipt={id:string;versionId:string;debtorId:string;creditorId:string;amountBrlCents:number;excessBrlCents:number;returnsReceiptId:string|null};
type Claim={id:string;versionId:string;creditorId:string;component:string;amountMinor:number;lineageJson:string};
type Rows={receipts:Receipt[];reversals:{receiptId:string}[];claims:Claim[];allocations:{receiptId:string;claimId:string;amountBrlCents:number}[];versions:{id:string;snapshotJson:string}[]};

/** Attribute each real incoming cent once, oldest excess first. Revision claims
 * retain their receipt lineage; reissuing a remaining claim is not a payment.
 * Direct returns and allocated correction receipts are disjoint. Compensation
 * by a changed financial target is shown separately from actual bank returns. */
export function projectSettlementExcesses(rows:Rows,needsReview=false){
  const reversed=new Set(rows.reversals.map(row=>row.receiptId));
  const roots=rows.receipts.filter(row=>row.excessBrlCents>0&&!row.returnsReceiptId).map(row=>({receiptId:row.id,payerId:row.debtorId,excessBrlCents:row.excessBrlCents,returnedBrlCents:0,openBrlCents:0,compensatedBrlCents:0,reversed:reversed.has(row.id),pendingReview:needsReview}));
  const active=rows.receipts.filter(row=>!reversed.has(row.id));
  for(const receipt of active.filter(row=>row.returnsReceiptId)){
    const root=roots.find(row=>row.receiptId===receipt.returnsReceiptId&&!row.reversed);
    if(root)root.returnedBrlCents=Math.min(root.excessBrlCents,root.returnedBrlCents+receipt.amountBrlCents);
  }
  const lineage=new Map(rows.claims.map(row=>[row.id,new Set<string>(JSON.parse(row.lineageJson))]));
  const assign=(amount:number,claim:Claim,field:"returnedBrlCents"|"openBrlCents")=>{
    if(claim.component!=="correction")return;
    for(const root of roots){
      if(root.reversed||root.payerId!==claim.creditorId||!lineage.get(claim.id)?.has(root.receiptId))continue;
      const part=Math.min(amount,root.excessBrlCents-root.returnedBrlCents-root.openBrlCents);root[field]+=part;amount-=part;if(!amount)break;
    }
  };
  for(const receipt of active.filter(row=>!row.returnsReceiptId))for(const allocation of rows.allocations.filter(row=>row.receiptId===receipt.id)){
    const claim=rows.claims.find(row=>row.id===allocation.claimId);if(claim)assign(allocation.amountBrlCents,claim,"returnedBrlCents");
  }
  const latest=rows.versions[0],inherited=new Set<string>(latest?JSON.parse(latest.snapshotJson).receiptIds??[]:[]);
  for(const claim of rows.claims.filter(row=>row.versionId===latest?.id)){
    const paid=rows.allocations.filter(row=>row.claimId===claim.id&&active.some(receipt=>receipt.id===row.receiptId)).reduce((sum,row)=>sum+row.amountBrlCents,0);
    assign(Math.max(0,claim.amountMinor-paid),claim,"openBrlCents");
  }
  for(const root of roots){
    if(root.reversed)continue;
    if(needsReview){root.openBrlCents=root.excessBrlCents-root.returnedBrlCents;root.compensatedBrlCents=0;continue;}
    if(!inherited.has(root.receiptId))root.openBrlCents=root.excessBrlCents-root.returnedBrlCents;
    root.compensatedBrlCents=root.excessBrlCents-root.returnedBrlCents-root.openBrlCents;
  }
  return roots;
}
