import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { ordersTransitionTarget, configureOrdersTransitionEnvironment } from "./orders-transition-environment";

// Authorized explicitly by plan 39 §11.1 / §12 phase 6: a localhost environment
// with synthetic QA logins, a persistent demo database, and start/stop commands.
// No database export, authentication dump, remote host or external service.
const index = process.argv.indexOf("--database");
const target = ordersTransitionTarget(index < 0 ? undefined : process.argv[index + 1]);
const marker = JSON.parse(readFileSync(`${target.path}.scenario.json`, "utf8"));
if (!["orders-transition-v1","orders-workflow-v2"].includes(marker.scenarioId) || marker.databasePath !== target.path || marker.state !== "complete") throw new Error("A completed synthetic fixture is required. Run a synthetic seed first.");
configureOrdersTransitionEnvironment(target.url);
process.env.LOTI_ORDERS_TRANSITION_QA = "1";
process.env.LOTI_QC_MANAGER_USER_ID = marker.people[0];
process.env.LOTI_NEXT_DIR = ".next-orders-transition";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "localhost", "--port", "3139"], { env: process.env, stdio: "inherit", windowsHide: true });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
child.on("exit", code => { process.exitCode = code ?? 1; });
