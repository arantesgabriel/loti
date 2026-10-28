import {spawn} from "node:child_process";
import {ordersTransitionTarget,configureOrdersTransitionEnvironment} from "./orders-transition-environment";
const flag=process.argv.indexOf("--database"),target=ordersTransitionTarget(flag<0?undefined:process.argv[flag+1]);
configureOrdersTransitionEnvironment(target.url);
process.env.LOTI_NEXT_DIR=".next-orders-transition-build";
const child=spawn(process.execPath,["node_modules/next/dist/bin/next","build","--webpack"],{env:process.env,stdio:"inherit",windowsHide:true});
child.on("exit",code=>{process.exitCode=code??1;});
