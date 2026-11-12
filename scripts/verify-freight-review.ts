import {readFileSync} from "node:fs";
import {freightReviewEnvironment} from "./freight-review-environment";
const flag=process.argv.indexOf("--database"),target=freightReviewEnvironment(flag<0?undefined:process.argv[flag+1]);
const marker=JSON.parse(readFileSync(`${target.path}.scenario.json`,"utf8"));
if(marker.databasePath!==target.path||marker.scenarioId!=="freight-review-v1")throw new Error("Invalid synthetic fixture marker.");
const [{openDatabase},{verifyDatabase},{packageFreightServices},{packageSettlementServices},{hubbuyTopupServices}]=await Promise.all([import("../src/lib/db/connection"),import("./database-verification"),import("../src/lib/domain/package-freight-services"),import("../src/lib/domain/package-settlement-services"),import("../src/lib/domain/hubbuy-topup-services")]);
const {db,client}=openDatabase(target.url);
try{
 const check=await verifyDatabase(client),freight=await packageFreightServices(db,marker.people[0],marker.workspaceId).get(marker.packageId),settlement=await packageSettlementServices(db,marker.people[0],marker.workspaceId).get(marker.packageId),topups=await hubbuyTopupServices(db,marker.people[0],marker.workspaceId).list(marker.accountId);
 const assert=(condition:boolean,message:string)=>{if(!condition)throw new Error(message);};
 assert(freight.content.units.length===30,"Physical unit baseline changed.");
 if(freight.payment){assert(freight.payment.nativeMinor===76860,"Freight differs from review fixture.");assert(freight.payment.principalBrlCents+freight.payment.feeBrlCents===64106,"Historical freight mismatch.");assert(freight.account?.account.balanceCnyMinor===4,"Wallet remainder mismatch.");assert(freight.account?.rights.reduce((sum,row)=>sum+row.availableHistoricalBrlCents,0)===4,"Historical basis remainder mismatch.");}
 assert(topups.items.length<=1,"Duplicate review topup.");
 const latest=settlement.latest?JSON.parse(settlement.latest.snapshotJson):null;
 if(latest){
  const expected=[-25877,18598,-3646,10925];for(let index=0;index<4;index++)assert(latest.principalPositions.find((row:{personId:string})=>row.personId===marker.people[index])?.amountMinor===expected[index],`Native position mismatch for person ${index}.`);
  // Independent oracle: 349 cents = 30 units × 11 + 19 stable-order cents.
  // Group the physical unit margins, then split that item's beneficiary quota.
  const fees=new Map<string,number>();
  for(const costItemId of new Set(freight.content.units.map(row=>row.costItemId))){
   const units=freight.content.units.filter(row=>row.costItemId===costItemId),total=units.reduce((sum,row)=>sum+11+(row.order<19?1:0),0),people=[...units[0].participants].sort((a,b)=>a.order-b.order),weight=people.reduce((sum,row)=>sum+BigInt(row.weight),0n);
   const parts=people.map(row=>({personId:row.personId,order:row.order,amount:Number(BigInt(total)*BigInt(row.weight)/weight),remainder:BigInt(total)*BigInt(row.weight)%weight}));
   let left=total-parts.reduce((sum,row)=>sum+row.amount,0);for(const row of [...parts].sort((a,b)=>a.remainder===b.remainder?a.order-b.order:a.remainder>b.remainder?-1:1)){if(left-->0)row.amount++;}
   for(const row of parts)fees.set(row.personId,(fees.get(row.personId)??0)+row.amount);
  }
  for(const row of latest.people)assert(row.feeDueBrlCents===fees.get(row.personId),"Independent physical-unit fee oracle differs.");
 }
 console.log(JSON.stringify({check,state:freight.payment?"funded":"baseline",walletCnyMinor:freight.account?.account.balanceCnyMinor,historicalCostBrlCents:freight.payment?freight.payment.principalBrlCents+freight.payment.feeBrlCents:null,topups:topups.items.length,versions:settlement.versions.length,receipts:settlement.activeReceipts.length,people:latest?.people,claims:settlement.claims.filter(row=>row.current).map(row=>({debtor:marker.people.indexOf(row.debtorId),creditor:marker.people.indexOf(row.creditorId),currency:row.currency,amountMinor:row.amountMinor,outstandingMinor:row.outstandingMinor}))},null,2));
}finally{client.close();}
