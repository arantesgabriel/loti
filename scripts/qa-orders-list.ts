import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { ordersTransitionTarget, configureOrdersTransitionEnvironment } from "./orders-transition-environment";

// Snapshot ONLY an identified synthetic fixture. Never reads a default .env DB.
const source = ordersTransitionTarget("file:./data/orders-transition-stage5-20261028-ui-refinements.sqlite");
const target = ordersTransitionTarget("file:./data/orders-transition-freeze-phase2-20261028.sqlite");
const sourceMarker = JSON.parse(readFileSync(`${source.path}.scenario.json`, "utf8"));
if (sourceMarker.scenarioId !== "orders-workflow-v2" || sourceMarker.state !== "complete" || sourceMarker.databasePath !== source.path) throw new Error("A completed synthetic source is required");
configureOrdersTransitionEnvironment(target.url);
process.env.BETTER_AUTH_URL = "http://localhost:3142";
process.env.LOTI_ORDERS_TRANSITION_QA = "1";
process.env.LOTI_QC_MANAGER_USER_ID = sourceMarker.people[0];
process.env.LOTI_NEXT_DIR = ".next-orders-transition-freeze-phase2";
if (!existsSync(target.path)) {
  const { openDatabase } = await import("../src/lib/db/connection");
  const original = openDatabase(source.url);
  try { await original.client.execute({ sql: "VACUUM INTO ?", args: [target.path] }); }
  finally { original.client.close(); }
  const fixture = openDatabase(target.url);
  try {
    const { createServices } = await import("../src/lib/domain/services");
    const { warehouseServices } = await import("../src/lib/domain/warehouse-services");
    const services = createServices(fixture.db, sourceMarker.people[0]);
    const purchase = await services.savePurchase({ name: "Compra catálogo QA Fase 2" });
    for (let index = 0; index < 25; index++) await services.saveManualItem({ name: `Produto catálogo QA ${String(index).padStart(2, "0")}`, url: `https://shop.test/catalog-${index}`, variant: index === 24 ? "Modelo exclusivo QA" : "Variação de teste", quantity: 2, unitPriceCents: 100, sharingMode: "equal", participants: [{ personId: sourceMarker.people[0] }] });
    await services.finalizePurchase(purchase.id, true);
    const warehouse = warehouseServices(fixture.db, sourceMarker.people[0]);
    const row = (await warehouse.list()).rows.find(item => item.name === "Produto catálogo QA 24")!;
    await warehouse.execute(sourceMarker.workspaceId, "catalog-qa-receipt", { operation: "receive", costItemId: row.costItemId, expectedRevision: row.revision, accountId: sourceMarker.accountId, units: [0], reason: "Chegada parcial sintética do catálogo" });
    writeFileSync(`${target.path}.scenario.json`, JSON.stringify({ ...sourceMarker, databasePath: target.path, phase2CatalogReady: true, catalogPurchaseId: purchase.id }, null, 2));
  } finally { fixture.client.close(); }
}
const marker = JSON.parse(readFileSync(`${target.path}.scenario.json`, "utf8"));
if (!marker.phase2CatalogReady || marker.databasePath !== target.path) throw new Error("The target is not the phase 2 synthetic fixture; refusing reuse");
if (!process.argv.includes("--prepare-only")) {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "localhost", "-p", "3142"], { stdio: "inherit", env: process.env, windowsHide: true });
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
  child.on("exit", code => { process.exitCode = code ?? 1; });
} else process.stdout.write("Phase 2 synthetic snapshot ready; source unchanged, no migration.\n");
