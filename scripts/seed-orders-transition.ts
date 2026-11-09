import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ordersTransitionTarget, configureOrdersTransitionEnvironment } from "./orders-transition-environment";

const flag = process.argv.indexOf("--database");
const target = ordersTransitionTarget(flag < 0 ? undefined : process.argv[flag + 1]);
configureOrdersTransitionEnvironment(target.url);
const markerPath = `${target.path}.scenario.json`;
if (existsSync(target.path)) {
  if (!existsSync(markerPath)) throw new Error("Existing database has no fixture ownership marker; choose a new path.");
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  if (marker.scenarioId !== "orders-transition-v1" || marker.databasePath !== target.path || marker.state !== "complete") throw new Error("Existing database is not a completed matching fixture; choose a new path.");
  console.log("Matching fixture already exists; no rows were added.");
} else {
  mkdirSync(dirname(target.path), { recursive: true });
  writeFileSync(markerPath, JSON.stringify({ scenarioId: "orders-transition-v1", databasePath: target.path, state: "building" }, null, 2));
  const { openDatabase } = await import("../src/lib/db/connection");
  const { migrate } = await import("drizzle-orm/libsql/migrator");
  const { createMember } = await import("./operator");
  const { buildLegacyScenario, qaPassword } = await import("../tests/fixtures/orders-transition/scenario");
  const { seedScenarioQc } = await import("../tests/fixtures/orders-transition/qc");
  // Freeze the real pre-transition schema. A future migration cannot sneak into the legacy fixture.
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  const boundary = journal.entries.findIndex((entry: { tag: string }) => entry.tag === "0022_hubbuy_manual_adjustments");
  if (boundary < 0) throw new Error("Legacy migration boundary was not found.");
  journal.entries = journal.entries.slice(0, boundary + 1);
  const folder = resolve("artifacts/qa/orders-transition/migrations-0022");
  mkdirSync(`${folder}/meta`, { recursive: true });
  writeFileSync(`${folder}/meta/_journal.json`, JSON.stringify(journal));
  for (const entry of journal.entries) copyFileSync(`drizzle/${entry.tag}.sql`, `${folder}/${entry.tag}.sql`);
  const { db, client } = openDatabase(target.url);
  try {
    await migrate(db, { migrationsFolder: folder });
    const people: string[] = [];
    for (const suffix of ["a", "b", "c", "d"]) {
      const member = await createMember(db, { name: `Pessoa ${suffix.toUpperCase()}`, email: `pessoa-${suffix}@loti.test`, password: qaPassword });
      people.push(member.id);
    }
    process.env.LOTI_ORDERS_TRANSITION_QA = "1";
    const { ordersTransitionQcStorage } = await import("../src/lib/qc/orders-transition-storage");
    const result = await buildLegacyScenario(db, people, { beforeCorrections: async identity => { await seedScenarioQc(db, identity, ordersTransitionQcStorage()!); } });
    const { compareLegacyScenario } = await import("../tests/fixtures/orders-transition/compare");
    const report = await compareLegacyScenario(db, result, { mode: "capture" });
    if (!report.passed) throw new Error(`Synthetic baseline did not reconcile: ${report.failures.join("; ")}`);
    writeFileSync(`${target.path}.baseline.json`, JSON.stringify(report, null, 2));
    writeFileSync(markerPath, JSON.stringify({ ...result, databasePath: target.path, state: "complete", schemaBoundary: "0022_hubbuy_manual_adjustments" }, null, 2));
    console.log(JSON.stringify({ ...result, database: target.url, login: "pessoa-a@loti.test", password: qaPassword }, null, 2));
  } finally { client.close(); }
}
