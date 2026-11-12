import {expect,it} from "vitest";
import {projectSettlementExcesses} from "@/lib/domain/settlement-excess-projection";
const excess=(id="over",amount=100)=>({id,versionId:"v1",debtorId:"alice",creditorId:"bob",amountBrlCents:379+amount,excessBrlCents:amount,returnsReceiptId:null});
const claim=(id:string,versionId:string,amountMinor:number,roots=["over"])=>({id,versionId,creditorId:"alice",component:"correction",amountMinor,lineageJson:JSON.stringify(roots)});
const paid=(id:string,versionId:string,amountBrlCents:number)=>({id,versionId,debtorId:"bob",creditorId:"alice",amountBrlCents,excessBrlCents:0,returnsReceiptId:null});
const version=(id:string,receiptIds:string[])=>({id,snapshotJson:JSON.stringify({receiptIds})});
it("counts partial bank returns once across multiple issued versions",()=>{
 const rows={receipts:[excess(),paid("p1","v2",40),paid("p2","v3",60)],reversals:[],claims:[claim("c2","v2",100),claim("c3","v3",60)],allocations:[{receiptId:"p1",claimId:"c2",amountBrlCents:40},{receiptId:"p2",claimId:"c3",amountBrlCents:60}],versions:[version("v3",["over","p1"]),version("v2",["over"])]};
 expect(projectSettlementExcesses(rows)[0]).toMatchObject({returnedBrlCents:100,openBrlCents:0,compensatedBrlCents:0});
 rows.reversals.push({receiptId:"p2"} as never);expect(projectSettlementExcesses(rows)[0]).toMatchObject({returnedBrlCents:40,openBrlCents:60});
});
it("does not allocate the same transfer to two original excess receipts",()=>{
 const result=projectSettlementExcesses({receipts:[excess("first",30),excess("second",70),paid("actual","v2",50)],reversals:[],claims:[claim("c","v2",100,["first","second"])],allocations:[{receiptId:"actual",claimId:"c",amountBrlCents:50}],versions:[version("v2",["first","second"])]});
 expect(result.map(row=>[row.returnedBrlCents,row.openBrlCents])).toEqual([[30,0],[20,50]]);
});
it("keeps direct returns disjoint from revision receipts and reverses them independently",()=>{
 const direct={...paid("direct","v1",20),returnsReceiptId:"over"};
 const rows={receipts:[excess(),direct,paid("revision","v2",30)],reversals:[] as {receiptId:string}[],claims:[claim("c","v2",80)],allocations:[{receiptId:"revision",claimId:"c",amountBrlCents:30}],versions:[version("v2",["over","direct"])]};
 expect(projectSettlementExcesses(rows)[0]).toMatchObject({returnedBrlCents:50,openBrlCents:50});
 rows.reversals.push({receiptId:"direct"});const result=projectSettlementExcesses(rows,true)[0];expect(result).toMatchObject({returnedBrlCents:30,openBrlCents:70,compensatedBrlCents:0,pendingReview:true});
 rows.reversals.push({receiptId:"over"});expect(projectSettlementExcesses(rows,true)[0]).toMatchObject({reversed:true,openBrlCents:0});
});
it("distinguishes a changed target compensation from an observed bank return",()=>{
 expect(projectSettlementExcesses({receipts:[excess()],reversals:[],claims:[claim("c","v2",40)],allocations:[],versions:[version("v2",["over"])]})[0]).toMatchObject({returnedBrlCents:0,openBrlCents:40,compensatedBrlCents:60});
});
it("supports a chosen centralizer while retaining lineage to the original payer",()=>{
 const receipt={...paid("actual","v2",100),debtorId:"centralizer"};
 expect(projectSettlementExcesses({receipts:[excess(),receipt],reversals:[],claims:[claim("c","v2",100)],allocations:[{receiptId:"actual",claimId:"c",amountBrlCents:100}],versions:[version("v2",["over"])]})[0]).toMatchObject({returnedBrlCents:100,openBrlCents:0});
});
it("does not invent a return from an unallocated transfer or an unrelated claim",()=>{
 expect(projectSettlementExcesses({receipts:[excess(),paid("unrelated","v2",100)],reversals:[],claims:[claim("c","v2",100,[])],allocations:[{receiptId:"unrelated",claimId:"c",amountBrlCents:100}],versions:[version("v2",["over"])]})[0].returnedBrlCents).toBe(0);
});
