import {openDatabase} from "@/lib/db/connection";
import {packageFreightServices} from "@/lib/domain/package-freight-services";
import {packageSettlementServices} from "@/lib/domain/package-settlement-services";
const url=process.env.LOTI_FREIGHT_RACE_DATABASE!;
if(!url.startsWith("file:"))throw new Error("Synthetic local database required");
const {db,client}=openDatabase(url);
try{const {packageId,action,input}=JSON.parse(process.env.LOTI_FREIGHT_RACE_COMMAND!);const data=action==="freight"?await packageFreightServices(db,"alice","workspace").confirm(packageId,input):await packageSettlementServices(db,"alice","workspace").recordReceipt(packageId,input);process.stdout.write(JSON.stringify({ok:true,data}));}catch(cause){const error=cause as {message:string;code?:string};process.stdout.write(JSON.stringify({ok:false,code:error.code,message:error.message}));}finally{client.close();}
