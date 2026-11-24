import {readFileSync,writeFileSync} from "node:fs";
import {spawn} from "node:child_process";
import {freightReviewEnvironment} from "./freight-review-environment";
const flag=process.argv.indexOf("--database"),target=freightReviewEnvironment(flag<0?undefined:process.argv[flag+1]);
const marker=JSON.parse(readFileSync(`${target.path}.scenario.json`,"utf8"));
if(marker.scenarioId!=="freight-review-v1"||marker.databasePath!==target.path||marker.state!=="complete")throw new Error("Seed a synthetic freight-review fixture first.");
const build=process.argv.includes("--build"),production=process.argv.includes("--production");
const saved=["tsconfig.json","next-env.d.ts"].map(path=>({path,bytes:readFileSync(path)}));
const args=build?["build","--webpack"]:production?["start","--hostname","localhost","--port","3147"]:["dev","--webpack","--hostname","localhost","--port","3147"];
const child=spawn(process.execPath,["node_modules/next/dist/bin/next",...args],{env:process.env,stdio:"inherit",windowsHide:true});
for(const signal of ["SIGINT","SIGTERM"] as const)process.on(signal,()=>child.kill(signal));
try{process.exitCode=await new Promise<number>((resolve,reject)=>{child.on("error",reject);child.on("exit",code=>resolve(code??1));});}finally{for(const file of saved)writeFileSync(file.path,file.bytes);}
