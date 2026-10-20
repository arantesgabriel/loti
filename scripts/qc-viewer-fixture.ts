// Disposable E2E fixture; never imported by application code.
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { openDatabase } from "../src/lib/db/connection";
import { createServices } from "../src/lib/domain/services";
import { packageCostServices } from "../src/lib/domain/package-cost-services";
import { hubbuyBalanceServices } from "../src/lib/domain/hubbuy-balance-services";
import { user, purchases, hubbuyExternalItems, qcImages, qcImagePreviews, qcPresentations, qcAdditionalPresentations, qcRateLimits } from "../src/lib/db/schema";

export async function startQcViewerFixture() {
  if (process.env.VERCEL || !process.env.TURSO_DATABASE_URL?.startsWith("file:./data/e2e-refunds-")) throw new Error("QC fixture requires an explicitly disposable local database");
  const connection = openDatabase(), { db } = connection;
  await connection.client.execute("PRAGMA journal_mode=WAL");
  const actor = (await db.select().from(user).where(eq(user.email, "gabriel@loti.test")).get())!;
  const app = createServices(db, actor.id);
  const active = await db.select().from(purchases).where(eq(purchases.status, "active")).get();
  if (active) await app.finalizePurchase(active.id, true);
  const purchase = (await app.savePurchase({ name: "QC viewer performance synthetic" }))!;
  const targets: { key: string; id: string; additional?: boolean }[] = [];
  for (let index = 0; index < 25; index++) {
    const item = (await app.saveManualItem({ name: `QC performance product ${String(index + 1).padStart(2, "0")}`, url: `https://weidian.com/item.html?itemID=${1000 + index}`, personId: actor.id, quantity: 1, unitPriceCents: 2500 }))!;
    targets.push({ key: `purchase:${item.id}`, id: item.id });
  }
  await app.finalizePurchase(purchase.id, true);
  const workspaceId = (await db.select().from(purchases).where(eq(purchases.id, purchase.id)).get())!.workspaceId;
  const packages = packageCostServices(db, actor.id), tracking = await packages.startTracking(purchase.id);
  const account = await hubbuyBalanceServices(db, actor.id).createAccount({ workspaceId, idempotencyKey: "qc-perf-account", label: "QC synthetic account", confirmZeroBalance: true });
  let detail = await packages.getTracking(tracking.id);
  const order = await packages.createAdditionalOrder(tracking.id, { expectedRevision: detail.tracking.revision, idempotencyKey: "qc-perf-order", accountId: account.accountId, items: [{ name: "QC performance additional product", url: "https://weidian.com/item.html?itemID=9000", platform: "Weidian", visualKey: "generic", quantity: 1, itemOrder: 0, nativeProductState: "known", nativeProductCnyMinor: 1000, nativeChinaState: "no_charge", nativeChinaCnyMinor: null, participants: [{ personId: actor.id, weightMode: "equal", weight: 1 }] }] });
  detail = await packages.getTracking(tracking.id);
  const additional = detail.productOrders.find(row => row.id === order.orderId)!.items[0]!.item!;
  await packages.recordAdditionalOrderPayment(tracking.id, order.orderId, { expectedRevision: detail.tracking.revision, idempotencyKey: "qc-perf-payment", paymentMethod: "pix", principalBrlCents: 1500, conversionCnyMinor: 1000, conversionBrlCents: 1500 });
  targets.push({ key: `additional:${additional.id}`, id: additional.id, additional: true });
  const bytes = await sharp({ create: { width: 160, height: 120, channels: 3, background: "#84b895" } }).webp().toBuffer();
  const hash = createHash("sha256").update(bytes).digest("hex"), stamp = new Date(), keys = new Set<string>();
  for (const [index, target] of targets.entries()) {
    if (index % 5 === 4) continue;
    const externalId = `qc-perf-external-${index}`;
    await db.insert(hubbuyExternalItems).values({ id: externalId, workspaceId, purchaseId: purchase.id, ...(target.additional ? { additionalOrderItemId: target.id } : { purchaseItemId: target.id }), title: "Synthetic QC", createdAt: stamp, updatedAt: stamp }).run();
    const count = index === 0 ? 14 : 4;
    for (let photo = 0; photo < count; photo++) {
      const id = `qc-perf-image-${index}-${photo}`, key = `qc/previews/fixture/${id}.webp`;
      keys.add(key);
      await db.insert(qcImages).values({ id, externalItemId: externalId, sourceUrl: `https://scm.hubbuy.app/qc/${id}.webp`, sourceUrlHash: createHash("sha256").update(id).digest("hex"), contentSha256: createHash("sha256").update(`content-${id}`).digest("hex"), r2Key: `qc/original/${id}`, status: "ready", deleteState: "none", mimeType: "image/webp", byteSize: bytes.length, width: 160, height: 120, ordinal: photo, createdBy: actor.id, createdAt: stamp, updatedAt: stamp }).run();
      await db.insert(qcImagePreviews).values({ imageId: id, r2Key: key, transformVersion: "qc-preview-v1", status: "ready", deleteState: "none", sha256: hash, byteSize: bytes.length, width: 160, height: 120, revision: 1, createdAt: stamp, updatedAt: stamp }).run();
    }
    const primaryImageId = `qc-perf-image-${index}-${count - 1}`;
    if (target.additional) await db.insert(qcAdditionalPresentations).values({ additionalOrderItemId: target.id, primaryImageId, updatedAt: stamp }).run();
    else await db.insert(qcPresentations).values({ purchaseItemId: target.id, primaryImageId, updatedAt: stamp }).run();
  }
  connection.client.close();
  let gets = 0, transferredBytes = 0;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url!, "http://localhost:3102");
    if (url.pathname === "/fixture") { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ purchaseId: purchase.id, trackingId: tracking.id, targets, gets, transferredBytes })); return; }
    if (["/reset", "/limits"].includes(url.pathname) && request.method === "POST") {
      if (url.pathname === "/reset") { gets = 0; transferredBytes = 0; }
      const reset = openDatabase();
      try { await reset.db.delete(qcRateLimits).run(); response.end("ok"); }
      catch { response.writeHead(503).end("fixture reset busy"); }
      finally { reset.client.close(); }
      return;
    }
    const key = decodeURIComponent(url.pathname.replace(/^\/qc-fixture\//, ""));
    if (request.method === "DELETE") { keys.delete(key); response.writeHead(204).end(); return; }
    if (request.method !== "GET" || !keys.has(key)) { response.writeHead(404).end(); return; }
    gets++; transferredBytes += bytes.length;
    await new Promise(resolve => setTimeout(resolve, 50));
    response.writeHead(200, { "Content-Type": "image/webp", "Content-Length": bytes.length }); response.end(bytes);
  });
  await new Promise<void>(resolve => server.listen(3102, "localhost", resolve));
  process.env.LOTI_QC_TEST_S3_ENDPOINT = "http://localhost:3102";
  process.env.R2_ACCOUNT_ID = "0".repeat(32); process.env.R2_BUCKET_NAME = "qc-fixture";
  for (const name of ["R2_WRITE_ACCESS_KEY_ID", "R2_WRITE_SECRET_ACCESS_KEY", "R2_READ_ACCESS_KEY_ID", "R2_READ_SECRET_ACCESS_KEY"]) process.env[name] = "disposable-test-only";
  return () => { server.close(); };
}
