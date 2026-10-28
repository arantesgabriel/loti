import {existsSync,readFileSync,writeFileSync} from "node:fs";
import {ordersTransitionTarget,configureOrdersTransitionEnvironment} from "./orders-transition-environment";
const flag=process.argv.indexOf("--database");
const target=ordersTransitionTarget(flag<0?undefined:process.argv[flag+1]);
const markerPath=`${target.path}.scenario.json`;
const marker=JSON.parse(readFileSync(markerPath,"utf8"));
if(marker.scenarioId!=="orders-transition-v1" || marker.databasePath!==target.path || marker.state!=="complete")throw new Error("Only a completed owned synthetic legacy fixture may be upgraded.");
if(!existsSync(`${target.path}.baseline.json`))throw new Error("A preserved baseline is required.");
const baseline=JSON.parse(readFileSync(`${target.path}.baseline.json`,"utf8"));
configureOrdersTransitionEnvironment(target.url);
const {parseScenarioBaseline}=await import("../tests/fixtures/orders-transition/preservation");
parseScenarioBaseline(baseline);
const {openDatabase}=await import("../src/lib/db/connection"),{migrate}=await import("drizzle-orm/libsql/migrator");
const {compareLegacyScenario}=await import("../tests/fixtures/orders-transition/compare");
const {db,client}=openDatabase(target.url);
try {
  const before=await compareLegacyScenario(db,marker,{mode:"verify",baseline});
  if(!before.passed)throw new Error(`Pre-upgrade baseline mismatch: ${before.failures.join("; ")}`);
  await migrate(db,{migrationsFolder:"./drizzle"});
  const after=await compareLegacyScenario(db,marker,{mode:"verify",baseline});
  if(!after.passed)throw new Error(`Post-upgrade baseline mismatch: ${after.failures.join("; ")}`);
  if((await client.execute("PRAGMA foreign_key_check")).rows.length)throw new Error("Foreign key check failed.");
  writeFileSync(markerPath,JSON.stringify({...marker,workflow:"orders-v2"},null,2));
  console.log(JSON.stringify({passed:true,database:target.url,workflow:"orders-v2",baseline:"preserved",productionTouched:false}));
}finally{client.close();}
