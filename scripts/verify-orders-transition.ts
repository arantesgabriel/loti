import {readFileSync} from "node:fs";
import {ordersTransitionTarget,configureOrdersTransitionEnvironment} from "./orders-transition-environment";
const flag=process.argv.indexOf("--database");
const target=ordersTransitionTarget(flag<0?undefined:process.argv[flag+1]);
const marker=JSON.parse(readFileSync(`${target.path}.scenario.json`,"utf8"));
if(!["orders-transition-v1","orders-workflow-v2"].includes(marker.scenarioId) || marker.databasePath!==target.path || marker.state!=="complete")throw new Error("Completed owned synthetic fixture required.");
configureOrdersTransitionEnvironment(target.url);
const {openDatabase}=await import("../src/lib/db/connection");
const {verifyDatabase}=await import("./database-verification");
const {client}=openDatabase(target.url);
try {console.log(JSON.stringify({...await verifyDatabase(client),database:target.url,productionTouched:false}));}finally{client.close();}
