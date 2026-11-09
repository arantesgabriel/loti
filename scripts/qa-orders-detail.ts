import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { ordersTransitionTarget, configureOrdersTransitionEnvironment } from "./orders-transition-environment";

const source = ordersTransitionTarget("file:./data/orders-transition-freeze-phase2-20261028.sqlite");
const target = ordersTransitionTarget("file:./data/orders-transition-freeze-phase3-20261029.sqlite");
const originalMarker = JSON.parse(readFileSync(`${source.path}.scenario.json`, "utf8"));
if (!originalMarker.phase2CatalogReady || originalMarker.databasePath !== source.path) throw new Error("Identified synthetic F2 fixture required");
configureOrdersTransitionEnvironment(target.url);
process.env.BETTER_AUTH_URL = "http://localhost:3143";
process.env.LOTI_ORDERS_TRANSITION_QA = "1";
process.env.LOTI_QC_MANAGER_USER_ID = originalMarker.people[0];
process.env.LOTI_NEXT_DIR = ".next-orders-transition-freeze-phase3";
if (!existsSync(target.path)) {
  const { openDatabase } = await import("../src/lib/db/connection");
  const original = openDatabase(source.url);
  try { await original.client.execute({ sql: "VACUUM INTO ?", args: [target.path] }); }
  finally { original.client.close(); }
  const fixture = openDatabase(target.url);
  try {
    const { createServices } = await import("../src/lib/domain/services");
    const { warehouseServices, warehouseQuerySchema } = await import("../src/lib/domain/warehouse-services");
    const services = createServices(fixture.db, originalMarker.people[0]);
    const purchase = await services.savePurchase({ name: "Seis exemplos QA do detalhe F3" });
    const examples = [
      { name: "Anker USB-C Cable", quantity: 1, received: 0, reserved: 0 },
      { name: "UGREEN Nexode 65W", quantity: 1, received: 1, reserved: 1 },
      { name: "Baseus Blade Power Bank", quantity: 2, received: 2, reserved: 1 },
      { name: "JBL Flip 6", quantity: 3, received: 3, reserved: 1 },
      { name: "Fender 351 Premium Picks", quantity: 2, received: 2, reserved: 2 },
      { name: "D’Addario EXL110", quantity: 1, received: 1, reserved: 0 },
    ];
    for (const [index, item] of examples.entries()) await services.saveManualItem({ name: item.name, url: `https://shop.test/detail-example-${index}`, variant: `Variação QA ${index}`, quantity: item.quantity, unitPriceCents: (index + 1) * 1000, sharingMode: "equal", participants: [{ personId: originalMarker.people[0] }] });
    await services.finalizePurchase(purchase.id, true);
    const warehouse = warehouseServices(fixture.db, originalMarker.people[0]);
    for (const [index, item] of examples.entries()) {
      if (!item.received) continue;
      let row = (await warehouse.list(warehouseQuerySchema.parse({ search: item.name }))).rows.find(row => row.name === item.name)!;
      await warehouse.execute(originalMarker.workspaceId, `detail-receive-${index}`, { operation: "receive", costItemId: row.costItemId, expectedRevision: row.revision, accountId: originalMarker.accountId, units: Array.from({ length: item.received }, (_, index) => index), reason: "Chegada sintética dos exemplos F3" });
      if (item.reserved) {
        row = (await warehouse.list(warehouseQuerySchema.parse({ search: item.name }))).rows.find(row => row.name === item.name)!;
        await warehouse.execute(originalMarker.workspaceId, `detail-reserve-${index}`, { operation: "reserve", accountId: originalMarker.accountId, name: `Pacote QA F3 ${index}`, selection: [{ costItemId: row.costItemId, expectedRevision: row.revision, units: row.availableUnits.slice(0, item.reserved) }], reason: "Reserva sintética dos exemplos F3" });
      }
    }
    writeFileSync(`${target.path}.scenario.json`, JSON.stringify({ ...originalMarker, databasePath: target.path, phase3DetailReady: true, detailPurchaseId: purchase.id, examples }, null, 2));
  } finally { fixture.client.close(); }
}
const marker = JSON.parse(readFileSync(`${target.path}.scenario.json`, "utf8"));
if (!marker.phase3DetailReady || marker.databasePath !== target.path) throw new Error("Refusing unidentified F3 target");
if (!process.argv.includes("--prepare-only")) {
  const build = process.argv.includes("--build");
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", ...(build ? ["build", "--webpack"] : ["start", "-H", "localhost", "-p", "3143"])], { stdio: "inherit", env: process.env, windowsHide: true });
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
  child.on("exit", code => { process.exitCode = code ?? 1; });
} else process.stdout.write("F3 synthetic snapshot ready; no environment migration.\n");
