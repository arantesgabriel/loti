import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { ordersTransitionTarget, configureOrdersTransitionEnvironment } from "./orders-transition-environment";

const index = process.argv.indexOf("--database");
const target = ordersTransitionTarget(index < 0 ? undefined : process.argv[index + 1]);
if (!existsSync(target.path)) throw new Error("Existing synthetic database is required for comparison.");
const identity = JSON.parse(readFileSync(`${target.path}.scenario.json`, "utf8"));
if (identity.scenarioId !== "orders-transition-v1" || identity.databasePath !== target.path || identity.state !== "complete") throw new Error("Completed fixture ownership marker is required.");
configureOrdersTransitionEnvironment(target.url);
const { openDatabase } = await import("../src/lib/db/connection");
const { compareLegacyScenario } = await import("../tests/fixtures/orders-transition/compare");
const { parseScenarioBaseline } = await import("../tests/fixtures/orders-transition/preservation");
if (!existsSync(`${target.path}.baseline.json`)) throw new Error("Missing baseline; create a fresh synthetic scenario instead of recapturing current data.");
let baseline: unknown;
try { baseline = JSON.parse(readFileSync(`${target.path}.baseline.json`, "utf8")); }
catch { throw new Error("Invalid baseline JSON; create a fresh synthetic scenario instead of recapturing current data."); }
parseScenarioBaseline(baseline); // Reject legacy/malformed files before opening the DB.
const { db, client } = openDatabase(target.url);
try {
  const result = await compareLegacyScenario(db, identity, { mode: "verify", baseline });
  const foreignKeys = await client.execute("PRAGMA foreign_key_check");
  if (foreignKeys.rows.length) { result.passed = false; result.failures.push("Foreign key violations."); }
  const path = resolve(`artifacts/qa/orders-transition/${basename(target.path)}.report.json`);
  mkdirSync(resolve("artifacts/qa/orders-transition"), { recursive: true });
  writeFileSync(path, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ passed: result.passed, failures: result.failures, actual: result.actual, personal: result.personal, report: path }, null, 2));
  if (!result.passed) process.exitCode = 1;
} finally { client.close(); }
