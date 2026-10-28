import {existsSync,mkdirSync,writeFileSync} from "node:fs";
import {dirname} from "node:path";
import {ordersTransitionTarget,configureOrdersTransitionEnvironment} from "./orders-transition-environment";
const flag=process.argv.indexOf("--database"),target=ordersTransitionTarget(flag<0?undefined:process.argv[flag+1]);
if(existsSync(target.path) || existsSync(`${target.path}.scenario.json`))throw new Error("Choose a new disposable synthetic database; this seed never overwrites existing data.");
configureOrdersTransitionEnvironment(target.url);
mkdirSync(dirname(target.path),{recursive:true});
const marker={scenarioId:"orders-workflow-v2",databasePath:target.path,state:"building"};
writeFileSync(`${target.path}.scenario.json`,JSON.stringify(marker,null,2));
const {openDatabase}=await import("../src/lib/db/connection"),{migrate}=await import("drizzle-orm/libsql/migrator");
const {createMember}=await import("./operator"),{qaPassword}=await import("../tests/fixtures/orders-transition/scenario");
const {buildOrdersWorkflowScenario}=await import("../tests/fixtures/orders-transition/new-workflow");
const {db,client}=openDatabase(target.url);
try{
  await migrate(db,{migrationsFolder:"./drizzle"});
  const people=[];
  for(const suffix of ["a","b","c","d"]){const member=await createMember(db,{name:`Pessoa ${suffix.toUpperCase()}`,email:`pessoa-${suffix}@loti.test`,password:qaPassword});people.push(member.id);}
  const scenario=await buildOrdersWorkflowScenario(db,people);
  if((await client.execute("PRAGMA foreign_key_check")).rows.length)throw new Error("Foreign key violations");
  writeFileSync(`${target.path}.scenario.json`,JSON.stringify({...scenario,databasePath:target.path,state:"complete"},null,2));
  console.log(JSON.stringify({database:target.url,login:"pessoa-a@loti.test",password:qaPassword,...scenario},null,2));
}finally{client.close();}
