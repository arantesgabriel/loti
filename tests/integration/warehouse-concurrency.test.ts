import {it,expect} from "vitest";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {randomUUID} from "node:crypto";
import {fixture} from "./helpers";
import {warehouseServices} from "@/lib/domain/warehouse-services";
import {hubbuyBalanceServices} from "@/lib/domain/hubbuy-balance-services";
it("arbitrates two independent processes reserving the last unit without an empty loser package",async()=>{
  const target=`file:./data/orders-transition-race-${randomUUID()}.sqlite`,f=await fixture(target,"orders");
  try{
    const purchase=await f.alice.savePurchase({name:"Corrida sintética"});
    await f.alice.saveManualItem({name:"Última unidade",url:"https://shop.test/race",quantity:1,unitPriceCents:100,personId:"alice"});
    await f.alice.finalizePurchase(purchase.id,true);
    const {accountId}=await hubbuyBalanceServices(f.db,"alice").createAccount({workspaceId:"workspace",idempotencyKey:"race-account",label:"Conta corrida",confirmZeroBalance:true});
    const service=warehouseServices(f.db,"alice");let row=(await service.list()).rows[0];
    await service.execute("workspace","race-arrival",{operation:"receive",costItemId:row.costItemId,expectedRevision:row.revision,accountId,units:[0],reason:"Conferência sintética"});
    row=(await service.list()).rows[0];
    const command={operation:"reserve",accountId,name:"Pacote concorrente",selection:[{costItemId:row.costItemId,expectedRevision:row.revision,units:[0]}],reason:"Reserva concorrente sintética"};
    const run=async(key:string)=>{
      const result=await promisify(execFile)(process.execPath,["--import","tsx","tests/integration/warehouse-concurrent-worker.ts"],{env:{...process.env,TURSO_AUTH_TOKEN:"",LOTI_WAREHOUSE_TEST_DATABASE:target,LOTI_WAREHOUSE_TEST_KEY:key,LOTI_WAREHOUSE_TEST_COMMAND:JSON.stringify(command)},timeout:30000,windowsHide:true});
      return JSON.parse(result.stdout) as {ok:boolean;message?:string};
    };
    const results=await Promise.all([run("race-a"),run("race-b")]);
    expect(results.filter(r=>r.ok)).toHaveLength(1);
    const after=await service.list();expect(after.reservations).toHaveLength(1);expect(after.packages).toHaveLength(1);
    expect((await f.client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  }finally{f.client.close();}
},60000);
