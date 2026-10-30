import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Run only inside an explicitly prepared disposable copy. No dotenv or migrations.
const url = process.env.TURSO_DATABASE_URL;
if (!url || !/^file:\.\/data\/orders-phase56(?:-[a-z0-9]+)?\.sqlite$/.test(url) || process.env.TURSO_AUTH_TOKEN || process.env.VERCEL || !process.env.LOTI_ORDERS_ACTIONS_QA) throw new Error("Explicit synthetic F5/F6 database required.");
const databasePath = resolve(url.slice(5));
const markerPath = `${databasePath}.scenario.json`;
const marker = JSON.parse(readFileSync(markerPath, "utf8"));
if (marker.databasePath !== databasePath || marker.scenarioId !== "orders-workflow-v2") throw new Error("Synthetic ownership marker required.");
if (marker.phase56Ready) throw new Error("This synthetic copy is already prepared; use a new copy instead of resetting it.");
const { openDatabase } = await import("../src/lib/db/connection");
const { createServices } = await import("../src/lib/domain/services");
const { packageCostServices } = await import("../src/lib/domain/package-cost-services");
const { warehouseServices, warehouseQuerySchema } = await import("../src/lib/domain/warehouse-services");
const fixture = openDatabase(url);
try {
  const actor = marker.people[0], services = createServices(fixture.db, actor), warehouse = warehouseServices(fixture.db, actor), costs = packageCostServices(fixture.db, actor);
  const scenarios = [];
  for (const [index, name] of ["F56 Cabo azul", "F56 Carregador branco"].entries()) {
    const purchase = await services.savePurchase({ name: `F56 Compra ${index + 1}` });
    await services.saveManualItem({ name, url: `https://weidian.com/item.html?itemID=${56001 + index}`, variant: index ? "White" : "Blue", quantity: 3, unitPriceCents: 1000, sharingMode: "equal", participants: [{ personId: actor }] });
    await services.finalizePurchase(purchase.id, true);
    const row = (await warehouse.list(warehouseQuerySchema.parse({ search: name }))).rows[0];
    let detail = await costs.getTracking(row.cost.trackingId);
    detail = await costs.saveItemCosts(detail.tracking.id, { expectedRevision: detail.tracking.revision, itemId: row.costItemId, effectivePriceState: "known", effectivePriceUnitCents: 1000, chinaFreightState: "no_charge", chinaFreightUnitCents: null });
    detail = await costs.saveCharge(detail.tracking.id, detail.productsCharge!.id, { expectedRevision: detail.tracking.revision, chargeType: "products", paymentMethod: "pix" });
    await costs.markChargePaid(detail.tracking.id, detail.productsCharge!.id, { expectedRevision: detail.tracking.revision });
    await warehouse.execute(marker.workspaceId, `f56-arrival-${index}`, { operation: "receive", costItemId: row.costItemId, expectedRevision: row.revision, accountId: marker.accountId, units: [0,1,2], reason: "Conferência sintética F5/F6" });
    scenarios.push({ purchaseId: purchase.id, costItemId: row.costItemId, trackingId: row.cost.trackingId, name });
  }
  const trackingId = scenarios[0].trackingId;
  let detail = await costs.getTracking(trackingId);
  const draft = await costs.createAdditionalOrder(trackingId, { expectedRevision: detail.tracking.revision, idempotencyKey: "f56-additional-draft", accountId: marker.accountId,
    items: [{ name: "F56 Adicional verde", url: "https://weidian.com/item.html?itemID=56003", platform: "Weidian", visualKey: "box", variant: "Green", quantity: 2, itemOrder: 0, nativeProductState: "known", nativeProductCnyMinor: 1000, nativeChinaState: "no_charge", nativeChinaCnyMinor: null, participants: [{ personId: actor, weightMode: "equal", weight: 1 }] }] });
  detail = await costs.getTracking(trackingId);
  await costs.recordAdditionalOrderPayment(trackingId, draft.orderId, { expectedRevision: detail.tracking.revision, idempotencyKey: "f56-additional-payment", paymentMethod: "pix", principalBrlCents: 1500, conversionCnyMinor: 1000, conversionBrlCents: 1500 });
  const additional = (await warehouse.list(warehouseQuerySchema.parse({ search: "F56 Adicional verde" }))).rows[0];
  await warehouse.execute(marker.workspaceId, "f56-additional-arrival", { operation: "receive", costItemId: additional.costItemId, expectedRevision: additional.revision, accountId: marker.accountId, units: [0,1], reason: "Conferência sintética do adicional" });
  writeFileSync(markerPath, JSON.stringify({ ...marker, phase56Ready: true, phase56Scenarios: scenarios, phase56Additional: additional.costItemId }, null, 2));
  console.log("Synthetic F5/F6 fixture ready: two paid purchases and one recorded additional order.");
} finally { fixture.client.close(); }
