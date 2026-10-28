import {openDatabase} from "../../src/lib/db/connection";
import {warehouseServices} from "../../src/lib/domain/warehouse-services";
import {logisticsPackageServices} from "../../src/lib/domain/logistics-package-services";
import {packageCostServices} from "../../src/lib/domain/package-cost-services";
const target=process.env.LOTI_WAREHOUSE_TEST_DATABASE??"";
if(!/^file:\.\/data\/orders-transition-race-[a-f0-9-]+\.sqlite$/.test(target) || process.env.TURSO_AUTH_TOKEN)throw new Error("Explicit disposable race database required");
// Each actor owns one connection; concurrency is between OS processes, not an
// extra embedded-client pool competing inside the same actor.
const {db,client}=openDatabase(target,{localConcurrency:1});
try{
  const input=JSON.parse(process.env.LOTI_WAREHOUSE_TEST_COMMAND??"null"),key=process.env.LOTI_WAREHOUSE_TEST_KEY!;
  const financial=packageCostServices(db,"alice"),action=process.env.LOTI_WAREHOUSE_TEST_ACTION;
  const result=action==="refund"?await financial.requestRefund(process.env.LOTI_WAREHOUSE_TEST_TRACKING!,input):action==="receipt_correction"?await financial.correctRefundReceipt(process.env.LOTI_WAREHOUSE_TEST_TRACKING!,process.env.LOTI_WAREHOUSE_TEST_REFUND!,input):action==="order_correction"?await financial.correctAdditionalOrder(process.env.LOTI_WAREHOUSE_TEST_TRACKING!,process.env.LOTI_WAREHOUSE_TEST_ORDER!,input):process.env.LOTI_WAREHOUSE_TEST_PACKAGE?await logisticsPackageServices(db,"alice").execute(process.env.LOTI_WAREHOUSE_TEST_PACKAGE,key,input):await warehouseServices(db,"alice").execute("workspace",key,input);
  console.log(JSON.stringify({ok:true,result:result && typeof result==="object" && "id" in result?{id:result.id}:undefined}));
}catch(error){console.log(JSON.stringify({ok:false,message:error instanceof Error?error.message:"Unknown error",code:error && typeof error==="object" && "code" in error?error.code:null}));}
finally{client.close();}
