import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { hubbuyExternalItems, purchaseItems, purchases, qcEvents, qcImagePreviews, qcImageSources, qcImages, qcImports, qcPresentations, qcTransferLocks } from "@/lib/db/schema";
import { openDatabase, type AppDatabase } from "@/lib/db/connection";
import { qcServices } from "@/lib/domain/qc-services";
import { QcDomainError } from "@/lib/domain/qc-errors";
import { QC_LIMITS } from "@/lib/domain/qc-limits";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import { packageCostServices } from "@/lib/domain/package-cost-services";
import type { QcObject, QcStorage } from "@/lib/qc/storage";
import { fixture, type Fixture } from "./helpers";

const sourceUrl = "https://scm.hubbuy.app/qc/synthetic.png";
const rawPhoto = Buffer.from("synthetic-image-bytes");
const external = { code: 0, data: { count: 1, list: [{ orderNo: "ORDER-1", goodsList: [{ orderGoodsId: "GOODS-1", orderGoodsNo: "ALT-1", offerUrl: "https://weidian.com/item.html?itemID=123", skuInfo: "Black / 42", goodsName: "Tênis", quantity: 1, freePhotos: [sourceUrl] }] }] } };
function photoImport(count: number, skuInfo = "Black / 42", orderGoodsId = "GOODS-MULTI") {
  return { code: 0, data: { count: 1, list: [{ orderNo: "ORDER-MULTI", goodsList: [{ orderGoodsId, offerUrl: "https://weidian.com/item.html?itemID=123", skuInfo, goodsName: "Tênis", quantity: 1, freePhotos: Array.from({ length: count }, (_, index) => `https://scm.hubbuy.app/qc/photo-${index}.png`) }] }] } };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function mockStorage(options: { holdPut?: { started: () => void; release: Promise<void> }; holdPreviewPut?: { started: () => void; release: Promise<void> }; deleteFails?: boolean } = {}) {
  const objects = new Map<string, { bytes: Buffer; sha256: string }>();
  const calls = { put: vi.fn(async (object: QcObject) => { if (object.key.startsWith("qc/previews/")) { options.holdPreviewPut?.started(); if (options.holdPreviewPut) await options.holdPreviewPut.release; } else { options.holdPut?.started(); if (options.holdPut) await options.holdPut.release; } objects.set(object.key, { bytes: object.bytes, sha256: object.sha256 }); }), head: vi.fn(async (key: string) => { const value = objects.get(key); return value ? { exists: true, sha256: value.sha256 } : { exists: false }; }), get: vi.fn(async (key: string, maxBytes: number) => { const value = objects.get(key); if (!value || value.bytes.byteLength > maxBytes) throw new Error("synthetic object unavailable"); return value.bytes; }), delete: vi.fn(async (key: string) => { if (options.deleteFails) throw new Error("simulated delete failure"); objects.delete(key); }), signRead: vi.fn(async (key: string) => `https://private-r2.test/${key}?signature=synthetic`) };
  return { storage: calls satisfies QcStorage, objects, calls };
}

async function seedFinalizedPurchase(f: Fixture, id = "qc-purchase") {
  const now = new Date("2026-10-14T12:00:00.000Z");
  await f.db.insert(purchases).values({ id, workspaceId: "workspace", name: "Compra finalizada", status: "finalized", createdBy: "alice", createdAt: now, finalizedAt: now }).run();
  await f.db.insert(purchaseItems).values({ id: `${id}-item`, purchaseId: id, sourceFavoriteId: null, personId: "alice", createdBy: "alice", name: "Tênis preto", url: "https://weidian.com/item.html?itemID=123", platform: "weidian", visualKey: "shoe", variant: "Black / 42", notes: null, quantity: 1, unitPriceCents: 12000, cartStatus: "added", sharingMode: "equal", createdAt: now, updatedAt: now }).run();
  return { id, itemId: `${id}-item` };
}

function services(f: Fixture, storage: QcStorage, who = "alice", managerId = "alice") {
  return qcServices(f.db, who, { managerId, storage, download: async () => rawPhoto, validate: async bytes => ({ bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png", extension: "png", width: 2, height: 2 }) });
}

function distinctPhotoServices(f: Fixture, storage: QcStorage) {
  return qcServices(f.db, "alice", {
    managerId: "alice",
    storage,
    download: async url => Buffer.from(new URL(url).pathname),
    validate: async bytes => ({ bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png", extension: "png", width: 2, height: 2 }),
  });
}

describe("HubBuy QC persistence and permissions", () => {
  let f: Fixture;
  beforeEach(async () => { f = await fixture(); await seedFinalizedPurchase(f); });
  afterEach(() => f.client.close());

  it("requires the exact manager ID while workspace members can only read", async () => {
    const fake = mockStorage(), alice = services(f, fake.storage), bob = services(f, fake.storage, "bob");
    await expect(bob.prepare("qc-purchase", external)).rejects.toMatchObject({ status: 403, code: "QC_FORBIDDEN" });
    await expect(services(f, fake.storage, "foreign", "foreign").getQcSummary("qc-purchase")).rejects.toMatchObject({ status: 403 });
    expect(await bob.getQcSummary("qc-purchase")).toMatchObject({ purchaseId: "qc-purchase", canManage: false, counts: [] });
    await expect(alice.prepare("missing-purchase", external)).rejects.toMatchObject({ status: 404 });
  });

  it("links, views, and authorizes QC photos for a recorded additional order item", async () => {
    const balance = hubbuyBalanceServices(f.db, "alice");
    const account = await balance.createAccount({ workspaceId: "workspace", idempotencyKey: "qc-additional-account", label: "Conta QC adicional", confirmZeroBalance: true });
    const packages = packageCostServices(f.db, "alice"), tracking = await packages.startTracking("qc-purchase");
    let detail = await packages.getTracking(tracking.id);
    const draft = await packages.createAdditionalOrder(tracking.id, {
      expectedRevision: detail.tracking.revision, idempotencyKey: "qc-additional-draft", accountId: account.accountId,
      items: [{ name: "Moletom azul", url: "https://weidian.com/item.html?itemID=987", platform: "Weidian", visualKey: "hoodie", quantity: 1, itemOrder: 0,
        nativeProductState: "known", nativeProductCnyMinor: 1_000, nativeChinaState: "no_charge", nativeChinaCnyMinor: null,
        variant: "Blue / L", participants: [{ personId: "alice", weightMode: "equal", weight: 1 }] }],
    });
    detail = await packages.getTracking(tracking.id);
    const additional = detail.productOrders.find(order => order.id === draft.orderId)!.items[0]!.item!;
    await packages.recordAdditionalOrderPayment(tracking.id, draft.orderId, {
      expectedRevision: detail.tracking.revision, idempotencyKey: "qc-additional-payment", paymentMethod: "pix",
      principalBrlCents: 1_500, conversionCnyMinor: 1_000, conversionBrlCents: 1_500,
    });

    const payload = { code: 0, data: { count: 1, list: [{ orderNo: "ADD-ORDER-QC", goodsList: [{ orderGoodsId: "ADD-GOODS-QC", offerUrl: "https://weidian.com/item.html?itemID=987", skuInfo: "Blue / L", goodsName: "Moletom azul", quantity: 1, freePhotos: [sourceUrl] }] }] } };
    const fake = mockStorage(), previewBytes = Buffer.from("synthetic-additional-preview"), previewHash = createHash("sha256").update(previewBytes).digest("hex");
    const makeService = (who: string) => qcServices(f.db, who, {
      managerId: "alice", storage: fake.storage, download: async () => rawPhoto,
      validate: async bytes => ({ bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png", extension: "png", width: 2, height: 2 }),
      makePreview: async () => ({ bytes: previewBytes, sha256: previewHash, width: 2, height: 2 }),
    });
    const alice = makeService("alice"), bob = makeService("bob");
    const prepared = await alice.prepare("qc-purchase", payload);
    expect(prepared.rows[0]?.match).toMatchObject({ status: "MATCHED", targetItemId: `additional:${additional.id}` });
    const confirmed = await alice.confirmImport(prepared.importId, prepared.revision, []);
    expect(confirmed).toMatchObject({ linked: 1, sources: 1 });
    expect(await alice.runImportBatch(prepared.importId, confirmed.revision)).toMatchObject({ imported: 1, complete: true });
    expect(fake.calls.get).not.toHaveBeenCalled();

    const targetKey = `additional:${additional.id}`;
    const image = (await bob.getGallery("qc-purchase", targetKey)).images[0]!;
    expect(image).toMatchObject({ previewUrl: expect.stringContaining("/preview") });
    expect(await bob.getPreview(image.id)).toEqual(previewBytes);
    expect(await alice.setPresentationCover("qc-purchase", targetKey, image.id, 0)).toMatchObject({ targetKey, primaryImageId: image.id, revision: 1 });
    expect(await bob.getGallery("qc-purchase", targetKey)).toMatchObject({ primaryImageId: image.id, presentationRevision: 1, images: [{ id: image.id }] });
    expect(await bob.fallback(image.id)).toMatchObject({ url: expect.stringContaining("private-r2.test"), expiresIn: 120 });
    expect(await alice.getQcSummary("qc-purchase")).toMatchObject({ counts: [{ itemId: targetKey, count: 1 }] });
  });

  it("uses validated upload bytes for a new preview and falls back to R2 for preview repair", async () => {
    const fake = mockStorage();
    const previewBytes = Buffer.from("synthetic-preview");
    const previewHash = createHash("sha256").update(previewBytes).digest("hex");
    const alice = qcServices(f.db, "alice", {
      managerId: "alice", storage: fake.storage, download: async () => rawPhoto,
      validate: async bytes => ({ bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png", extension: "png", width: 2, height: 2 }),
      makePreview: async () => ({ bytes: previewBytes, sha256: previewHash, width: 2, height: 2 }),
    });
    const prepared = await alice.prepare("qc-purchase", external);
    const confirmed = await alice.confirmImport(prepared.importId, prepared.revision, []);
    await expect(alice.runImportBatch(prepared.importId, confirmed.revision)).resolves.toMatchObject({ imported: 1, complete: true });
    expect(fake.calls.get).not.toHaveBeenCalled();

    const image = (await f.db.select().from(qcImages).all())[0]!;
    await f.db.delete(qcImagePreviews).where(eq(qcImagePreviews.imageId, image.id)).run();
    await expect(alice.runBatch("qc-purchase")).resolves.toMatchObject({ previews: 1 });
    expect(fake.calls.get).toHaveBeenCalledTimes(1);
  });

  it("finishes an empty reconciliation without requiring unconfigured R2", async () => {
    const names = ["R2_ACCOUNT_ID", "R2_BUCKET_NAME", "R2_WRITE_ACCESS_KEY_ID", "R2_WRITE_SECRET_ACCESS_KEY", "R2_READ_ACCESS_KEY_ID", "R2_READ_SECRET_ACCESS_KEY"] as const;
    const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
    try {
      for (const name of names) process.env[name] = "";
      const result = await qcServices(f.db, "alice", { managerId: "alice" }).runBatch("qc-purchase");
      expect(result).toMatchObject({ processed: 0, imported: 0, deleted: 0, partial: false });
    } finally {
      for (const name of names) {
        const value = previous[name];
        if (value === undefined) delete process.env[name]; else process.env[name] = value;
      }
    }
  });

  it("returns a batch snapshot at its persisted revision", async () => {
    const fake = mockStorage(), alice = services(f, fake.storage);
    const prepared = await alice.prepare("qc-purchase", external);
    const confirmed = await alice.confirmImport(prepared.importId, prepared.revision, []);
    const result = await alice.runImportBatch(prepared.importId, confirmed.revision);
    expect(result.snapshot).toMatchObject({ importId: prepared.importId, revision: result.revision, photos: [{ state: "ready" }] });
    expect(result.snapshot!.revision).toBe((await alice.getImport(prepared.importId)).revision);
  });

  it("aborts an active PUT on request cancellation and releases its lease only after uncertain state is persisted", async () => {
    const controller = new AbortController(), putStarted = deferred();
    const storage: QcStorage = {
      async put(_object, signal) {
        putStarted.resolve();
        await new Promise<void>((_resolve, reject) => {
          if (signal?.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
          signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        });
      },
      async head() { return { exists: false }; }, async get() { throw new Error("unused"); }, async delete() {}, async signRead() { return "unused"; },
    };
    const alice = qcServices(f.db, "alice", {
      managerId: "alice", storage, signal: controller.signal, download: async () => rawPhoto,
      validate: async bytes => ({ bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png", extension: "png", width: 2, height: 2 }),
    });
    const prepared = await alice.prepare("qc-purchase", external);
    const confirmed = await alice.confirmImport(prepared.importId, prepared.revision, []);
    const batchPromise = alice.runImportBatch(prepared.importId, confirmed.revision);
    await putStarted.promise;
    expect((await f.db.select().from(qcTransferLocks).where(eq(qcTransferLocks.scope, "workspace")).get())?.leaseUntil).toBeGreaterThan(Date.now());
    controller.abort();
    await expect(batchPromise).resolves.toMatchObject({ pending: 1, complete: false, stopReason: "recovery", results: [{ status: "pending" }] });
    const image = (await f.db.select().from(qcImages).all())[0]!;
    const source = (await f.db.select().from(qcImageSources).all())[0]!;
    expect(image).toMatchObject({ status: "pending", errorCode: "QC_PUT_IN_FLIGHT" });
    expect(image.claimToken).toBeTruthy();
    expect(source).toMatchObject({ state: "pending", errorCode: "QC_PENDING_RECOVERY" });
    expect((await f.db.select().from(qcTransferLocks).where(eq(qcTransferLocks.scope, "workspace")).get())?.leaseUntil).toBe(0);
  });

  it("enforces structured QC rate limits with Retry-After", async () => {
    const alice = qcServices(f.db, "alice", { managerId: "alice", now: () => Date.parse("2026-10-20T12:00:00.000Z") });
    for (let call = 0; call < 12; call++) await alice.rate("qc-purchase", "batch");
    await expect(alice.rate("qc-purchase", "batch")).rejects.toMatchObject({ status: 429, code: "QC_RATE_LIMIT", retryAfterSeconds: expect.any(Number) });
  });

  it("retries one transient source GET with a fresh quota reservation", async () => {
    const fake = mockStorage(), metrics = (await import("@/lib/qc/metrics")).createQcMetricCollector();
    let downloads = 0;
    const previewBytes = Buffer.from("retry-preview"), previewHash = createHash("sha256").update(previewBytes).digest("hex");
    const alice = qcServices(f.db, "alice", {
      managerId: "alice", storage: fake.storage, metrics, sleep: async () => {}, random: () => 0,
      download: async () => { downloads++; if (downloads === 1) throw new QcDomainError("temporary", 502, "QC_SOURCE_UNAVAILABLE", { upstreamStatus: 503 }); return rawPhoto; },
      validate: async bytes => ({ bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png", extension: "png", width: 2, height: 2 }),
      makePreview: async () => ({ bytes: previewBytes, sha256: previewHash, width: 2, height: 2 }),
    });
    const prepared = await alice.prepare("qc-purchase", external);
    const confirmed = await alice.confirmImport(prepared.importId, prepared.revision, []);
    const result = await alice.runImportBatch(prepared.importId, confirmed.revision);
    expect(result).toMatchObject({ imported: 1, complete: true });
    expect(downloads).toBe(2);
    expect(metrics.snapshot().counters.downloadRetries).toBe(1);
    const manifest = await f.db.select().from(qcImports).where(eq(qcImports.id, prepared.importId)).get();
    expect(manifest?.bytesReserved).toBe(0);
    expect(manifest?.bytesConsumed).toBeGreaterThanOrEqual(QC_LIMITS.imageBytes);
  });

  it("reads real per-photo progress and queue order without leaking storage or changing snapshots", async () => {
    const fake = mockStorage(), alice = distinctPhotoServices(f, fake.storage);
    const before = await f.db.select().from(purchaseItems).all();
    const prepared = await alice.prepare("qc-purchase", photoImport(4));
    const confirmed = await alice.confirmImport(prepared.importId, prepared.revision, []);
    const initial = await alice.getImport(prepared.importId);
    expect(initial.photos).toHaveLength(4);
    expect(initial.photos.every(photo => photo.state === "pending")).toBe(true);
    const first = await alice.runImportBatch(prepared.importId, confirmed.revision);
    expect(first.results[0]?.sourceId).toBe(initial.nextSourceId);
    const progress = await alice.getImport(prepared.importId);
    expect(first).toMatchObject({ processed: 4, imported: 4, remaining: 0, complete: true });
    expect(progress.photos.filter(photo => photo.state === "ready")).toHaveLength(4);
    expect(progress.photos.filter(photo => photo.state === "pending")).toHaveLength(0);
    expect(progress.nextSourceId).toBeNull();
    expect(progress.photos[0]).toMatchObject({ name: "photo-0.png", state: "ready", byteSize: expect.any(Number) });
    expect(JSON.stringify(progress)).not.toMatch(/r2Key|signature|contentSha256|sourceUrl/);
    await expect(services(f, fake.storage, "bob").getImport(prepared.importId)).rejects.toMatchObject({ status: 403 });
    await expect(services(f, fake.storage, "foreign", "foreign").getImport(prepared.importId)).rejects.toMatchObject({ status: 403 });
    expect(await f.db.select().from(purchaseItems).all()).toEqual(before);
    const storedSources = await f.db.select().from(qcImageSources).orderBy(qcImageSources.ordinal).all();
    await f.db.update(qcImageSources).set({ state: "failed", errorCode: "QC_IMAGE_FAILED" }).where(eq(qcImageSources.id, storedSources[1]!.id)).run();
    await f.db.update(qcImageSources).set({ state: "pending", errorCode: "QC_PUT_UNCERTAIN" }).where(eq(qcImageSources.id, storedSources[2]!.id)).run();
    const interrupted = await alice.getImport(prepared.importId);
    expect(interrupted.photos[1]).toMatchObject({ state: "failed", errorCode: "QC_IMAGE_FAILED", previewUrl: null });
    expect(interrupted.photos[2]).toMatchObject({ state: "pending", errorCode: "QC_PUT_UNCERTAIN", previewUrl: null });
    // A fresh manifest must recognize ready sources kept under an older import.
    const repeated = await alice.prepare("qc-purchase", photoImport(4));
    await alice.confirmImport(repeated.importId, repeated.revision, []);
    expect((await alice.getImport(repeated.importId)).photos.filter(photo => photo.state === "ready")).toHaveLength(4);
  });

  it("runs up to three destination lanes while serializing decoders and retaining result order", async () => {
    const fake = mockStorage(), releaseDownloads = deferred(), threeDownloadsStarted = deferred();
    const now = new Date("2026-10-14T12:00:00.000Z");
    const purchaseId = "qc-purchase";
    const extraItems = Array.from({ length: 5 }, (_, index) => ({
      id: `qc-parallel-item-${index}`, purchaseId, sourceFavoriteId: null, personId: "alice", createdBy: "alice",
      name: `Parallel item ${index}`, url: `https://weidian.com/item.html?itemID=parallel-${index}`, platform: "weidian", visualKey: "generic",
      variant: `Parallel ${index}`, notes: null, quantity: 1, unitPriceCents: 100, cartStatus: "added" as const, sharingMode: "equal" as const, createdAt: now, updatedAt: now,
    }));
    await f.db.insert(purchaseItems).values(extraItems).run();
    const sourceUrls = Array.from({ length: 5 }, (_, index) => `https://scm.hubbuy.app/qc/parallel-${index}.png`);
    const input = { code: 0, data: { list: [{ orderNo: "PARALLEL", goodsList: Array.from({ length: 5 }, (_, index) => ({
      orderGoodsId: `PARALLEL-${index}`, offerUrl: `https://weidian.com/item.html?itemID=parallel-${index}`, skuInfo: `Parallel ${index}`, goodsName: `Parallel item ${index}`,
      quantity: 1, freePhotos: [sourceUrls[index]!],
    })) }] } };
    let activeDownloads = 0, peakDownloads = 0, activeDecoders = 0, peakDecoders = 0;
    const decode = async (bytes: Buffer) => { activeDecoders++; peakDecoders = Math.max(peakDecoders, activeDecoders); await Promise.resolve(); activeDecoders--; return { bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png" as const, extension: "png" as const, width: 2, height: 2 }; };
    const alice = qcServices(f.db, "alice", {
      managerId: "alice", storage: fake.storage, pipelineConcurrency: 3, download: async url => {
        activeDownloads++; peakDownloads = Math.max(peakDownloads, activeDownloads);
        if (activeDownloads === 3) threeDownloadsStarted.resolve();
        await releaseDownloads.promise;
        activeDownloads--;
        return Buffer.from(new URL(url).pathname);
      }, validate: decode,
      makePreview: async () => { activeDecoders++; peakDecoders = Math.max(peakDecoders, activeDecoders); activeDecoders--; return { bytes: Buffer.from("parallel-preview"), sha256: createHash("sha256").update("parallel-preview").digest("hex"), width: 2, height: 2 }; },
    });
    const prepared = await alice.prepare(purchaseId, input);
    const confirmed = await alice.confirmImport(prepared.importId, prepared.revision, []);
    const selectedOrder = await f.db.select({ id: qcImageSources.id }).from(qcImageSources).innerJoin(hubbuyExternalItems, eq(qcImageSources.externalItemId, hubbuyExternalItems.id)).where(eq(hubbuyExternalItems.purchaseId, purchaseId)).orderBy(qcImageSources.updatedAt, qcImageSources.createdAt, qcImageSources.ordinal, qcImageSources.id).all();
    const batchPromise = alice.runImportBatch(prepared.importId, confirmed.revision);
    await threeDownloadsStarted.promise;
    expect(peakDownloads).toBe(3);
    releaseDownloads.resolve();
    const batch = await batchPromise;
    expect(batch).toMatchObject({ processed: 5, imported: 5, complete: true, remaining: 0, revision: confirmed.revision + 1 });
    expect(batch.results.map(result => result.sourceId)).toEqual(selectedOrder.map(source => source.id));
    expect(peakDecoders).toBe(1);
  });

  it("imports, authorizes fallback, deletes, and restores photos only after a fresh explicit confirmation", async () => {
    const fake = mockStorage(), alice = services(f, fake.storage), bob = services(f, fake.storage, "bob");
    const before = await f.db.select().from(purchaseItems).where(eq(purchaseItems.id, "qc-purchase-item")).get();
    const prepared = await alice.prepare("qc-purchase", external);
    expect(prepared.rows[0]?.match).toMatchObject({ status: "MATCHED", targetItemId: "purchase:qc-purchase-item" });
    const confirmed = await alice.confirmImport(prepared.importId, prepared.revision, []);
    expect(confirmed).toMatchObject({ revision: 1, linked: 1, sources: 1 });
    const batch = await alice.runImportBatch(prepared.importId, 1);
    expect(batch).toMatchObject({ imported: 1, processed: 1, partial: false, revision: 2 });
    expect(fake.calls.put).toHaveBeenCalledTimes(1);
    const row = (await f.db.select().from(qcImages).all())[0]!;
    expect((await bob.getGallery("qc-purchase", "qc-purchase-item")).images).toHaveLength(1);
    expect(await bob.fallback(row.id)).toMatchObject({ url: expect.stringContaining("private-r2.test"), expiresIn: 120 });
    await expect(bob.deleteImage(row.id)).rejects.toMatchObject({ status: 403, code: "QC_FORBIDDEN" });
    expect(await alice.deleteImage(row.id)).toMatchObject({ status: "deleted" });
    expect((await f.db.select().from(qcImages).where(eq(qcImages.id, row.id)).get())?.status).toBe("deleted");
    await expect(bob.fallback(row.id)).rejects.toMatchObject({ status: 404, code: "QC_IMAGE_NOT_FOUND" });
    expect((await bob.getGallery("qc-purchase", "qc-purchase-item")).images).toHaveLength(0);

    const repeated = await alice.prepare("qc-purchase", external);
    const restored = await alice.confirmImport(repeated.importId, repeated.revision, []);
    expect(restored).toMatchObject({ linked: 1, sources: 1, eligibleSources: 1, restored: 1 });
    const resumed = await alice.runImportBatch(repeated.importId, restored.revision);
    expect(resumed).toMatchObject({ processed: 1, imported: 1, deleted: 0, complete: true });
    const restoredImage = (await f.db.select().from(qcImages).where(eq(qcImages.id, row.id)).get())!;
    expect(restoredImage).toMatchObject({ status: "ready", deleteState: "none" });
    expect(restoredImage.r2Key).not.toBe(row.r2Key);
    expect((await alice.getGallery("qc-purchase", "qc-purchase-item")).images).toHaveLength(1);
    expect(fake.calls.put).toHaveBeenCalledTimes(2);
    expect(await alice.getQcSummary("qc-purchase")).toMatchObject({ pendingMatching: 0, pendingTransfers: 0, pendingDeletes: 0 });
    const after = await f.db.select().from(purchaseItems).where(eq(purchaseItems.id, "qc-purchase-item")).get();
    expect(after).toEqual(before);
    expect(await f.db.select().from(hubbuyExternalItems).all()).toHaveLength(1);
    expect((await f.db.select().from(qcImageSources).all())[0]?.state).toBe("ready");
    expect(await f.db.select().from(qcEvents).where(eq(qcEvents.resultCode, "REIMPORT_QUEUED")).all()).toHaveLength(1);
  });

  it("restores every included photo and private preview after deletion, then remains idempotent", async () => {
    const fake = mockStorage(), previewBytes = Buffer.from("synthetic-reimport-preview"), previewHash = createHash("sha256").update(previewBytes).digest("hex");
    const alice = qcServices(f.db, "alice", {
      managerId: "alice", storage: fake.storage,
      download: async url => Buffer.from(new URL(url).pathname),
      validate: async bytes => ({ bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png", extension: "png", width: 2, height: 2 }),
      makePreview: async () => ({ bytes: previewBytes, sha256: previewHash, width: 2, height: 2 }),
    });
    const payload = photoImport(4);
    const preview = await alice.prepare("qc-purchase", payload);
    expect(preview.rows[0]?.match).toMatchObject({ status: "MATCHED", targetItemId: "purchase:qc-purchase-item" });
    const confirmed = await alice.confirmImport(preview.importId, preview.revision, []);
    expect(confirmed).toMatchObject({ linked: 1, ignored: 0, sources: 4, eligibleSources: 4 });

    let revision = confirmed.revision;
    const finalBatch = await alice.runImportBatch(preview.importId, revision);
    expect(finalBatch).toMatchObject({ processed: 4, imported: 4, failed: 0, pending: 0, remaining: 0, complete: true });
    revision = finalBatch.revision!;
    const originalImages = await f.db.select().from(qcImages).orderBy(qcImages.ordinal).all();
    const originalPreviews = await f.db.select().from(qcImagePreviews).all();
    expect(originalImages).toHaveLength(4);
    expect(originalPreviews).toHaveLength(4);
    expect(originalPreviews.every(preview => preview.status === "ready" && preview.deleteState === "none")).toBe(true);
    expect((await alice.getGallery("qc-purchase", "qc-purchase-item")).images).toHaveLength(4);
    const originalKeys = new Set([...originalImages.map(image => image.r2Key), ...originalPreviews.map(preview => preview.r2Key)]);
    for (const image of originalImages) expect(await alice.deleteImage(image.id)).toMatchObject({ status: "deleted" });
    expect((await alice.getGallery("qc-purchase", "qc-purchase-item")).images).toHaveLength(0);
    expect((await alice.getQcPresentations("qc-purchase", ["qc-purchase-item"])).items[0]).toMatchObject({ primaryImageId: null, coverPreview: null });

    const restoredPreview = await alice.prepare("qc-purchase", payload);
    const restoredConfirmation = await alice.confirmImport(restoredPreview.importId, restoredPreview.revision, []);
    expect(restoredConfirmation).toMatchObject({ linked: 1, sources: 4, eligibleSources: 4, restored: 4 });
    const restoredImagesBeforeTransfer = await f.db.select().from(qcImages).orderBy(qcImages.ordinal).all();
    const restoredPreviewsBeforeTransfer = await f.db.select().from(qcImagePreviews).all();
    expect(restoredImagesBeforeTransfer).toHaveLength(4);
    expect(restoredImagesBeforeTransfer.every(image => image.status === "pending" && !originalKeys.has(image.r2Key))).toBe(true);
    expect(restoredPreviewsBeforeTransfer.every(preview => preview.status === "pending" && !originalKeys.has(preview.r2Key))).toBe(true);
    revision = restoredConfirmation.revision;
    const restoredBatch = await alice.runImportBatch(restoredPreview.importId, revision);
    expect(restoredBatch).toMatchObject({ processed: 4, imported: 4, failed: 0, pending: 0, remaining: 0, complete: true });
    revision = restoredBatch.revision!;
    expect((await alice.getGallery("qc-purchase", "qc-purchase-item")).images).toHaveLength(4);
    expect((await f.db.select().from(qcImagePreviews).all()).every(preview => preview.status === "ready" && preview.deleteState === "none")).toBe(true);
    expect((await alice.getQcPresentations("qc-purchase", ["qc-purchase-item"])).items[0]).toMatchObject({ primaryImageId: expect.any(String), qcCount: 4, coverPreview: { imageId: expect.any(String) } });
    expect(await alice.getQcSummary("qc-purchase")).toMatchObject({ pendingMatching: 0, pendingTransfers: 0, pendingDeletes: 0 });

    const repeated = await alice.prepare("qc-purchase", payload);
    const repeatedConfirmation = await alice.confirmImport(repeated.importId, repeated.revision, []);
    expect(repeatedConfirmation).toMatchObject({ linked: 1, sources: 0, eligibleSources: 0 });
    expect(await alice.runImportBatch(repeated.importId, repeatedConfirmation.revision)).toMatchObject({ processed: 0, complete: true, remaining: 0 });
    expect(await f.db.select().from(hubbuyExternalItems).all()).toHaveLength(1);
    expect(await f.db.select().from(qcImageSources).all()).toHaveLength(4);
    expect(await f.db.select().from(qcImages).all()).toHaveLength(4);
    expect(fake.calls.put).toHaveBeenCalledTimes(16);
  });

  it("restores only deleted photos still included in the newly confirmed JSON", async () => {
    const fake = mockStorage(), alice = distinctPhotoServices(f, fake.storage), complete = photoImport(4);
    const initial = await alice.prepare("qc-purchase", complete);
    const confirmed = await alice.confirmImport(initial.importId, initial.revision, []);
    const revision = confirmed.revision;
    await alice.runImportBatch(initial.importId, revision);
    const images = await f.db.select().from(qcImages).orderBy(qcImages.ordinal).all();
    for (const image of images) await alice.deleteImage(image.id);

    const selected = await alice.prepare("qc-purchase", photoImport(2));
    const selectedConfirmation = await alice.confirmImport(selected.importId, selected.revision, []);
    expect(selectedConfirmation).toMatchObject({ sources: 2, eligibleSources: 2, restored: 2 });
    expect(await f.db.select().from(qcImages).where(eq(qcImages.status, "pending")).all()).toHaveLength(2);
    expect(await f.db.select().from(qcImages).where(eq(qcImages.status, "deleted")).all()).toHaveLength(2);
    await alice.runImportBatch(selected.importId, selectedConfirmation.revision);
    expect((await alice.getGallery("qc-purchase", "qc-purchase-item")).images).toHaveLength(2);
    expect((await f.db.select().from(qcImages).where(eq(qcImages.status, "deleted")).all()).map(image => image.ordinal)).toEqual([2, 3]);
  });

  it("restores a tombstoned image by content hash when a fresh import includes a URL alias", async () => {
    const fake = mockStorage(), alice = services(f, fake.storage);
    const initial = await alice.prepare("qc-purchase", external);
    const confirmed = await alice.confirmImport(initial.importId, initial.revision, []);
    await alice.runImportBatch(initial.importId, confirmed.revision);
    const image = (await f.db.select().from(qcImages).get())!;
    const previousKey = image.r2Key;
    await alice.deleteImage(image.id);

    const aliasPayload = { code: 0, data: { list: [{ orderNo: "ORDER-1", goodsList: [{ orderGoodsId: "GOODS-1", offerUrl: "https://weidian.com/item.html?itemID=123", skuInfo: "Black / 42", goodsName: "Tênis", quantity: 1, freePhotos: ["https://scm.hubbuy.app/qc/alias.png"] }] }] } };
    const alias = await alice.prepare("qc-purchase", aliasPayload);
    const aliasConfirmation = await alice.confirmImport(alias.importId, alias.revision, []);
    expect(aliasConfirmation).toMatchObject({ sources: 1, eligibleSources: 1, restored: 0 });
    expect(await alice.runImportBatch(alias.importId, aliasConfirmation.revision)).toMatchObject({ imported: 1, complete: true });

    const currentImage = (await f.db.select().from(qcImages).get())!;
    expect(currentImage).toMatchObject({ id: image.id, status: "ready", deleteState: "none" });
    expect(currentImage.r2Key).not.toBe(previousKey);
    expect(await f.db.select().from(qcImages).all()).toHaveLength(1);
    expect(await f.db.select().from(qcImageSources).all()).toHaveLength(2);
    expect((await alice.getGallery("qc-purchase", "qc-purchase-item")).images).toHaveLength(1);
    expect(fake.objects.size).toBe(1);
  });

  it("rejects a prepared-before-deletion manifest and leaves the tombstone recoverable", async () => {
    const fake = mockStorage(), alice = services(f, fake.storage);
    const initial = await alice.prepare("qc-purchase", external);
    const confirmed = await alice.confirmImport(initial.importId, initial.revision, []);
    const imported = await alice.runImportBatch(initial.importId, confirmed.revision);
    const stalePreview = await alice.prepare("qc-purchase", external);
    const image = (await f.db.select().from(qcImages).get())!;
    await alice.deleteImage(image.id);

    await expect(alice.confirmImport(stalePreview.importId, stalePreview.revision, [])).rejects.toMatchObject({ status: 409, code: "QC_REIMPORT_PREPARE_REQUIRED" });
    expect((await f.db.select().from(qcImages).where(eq(qcImages.id, image.id)).get())).toMatchObject({ status: "deleted", deleteState: "deleted", r2Key: image.r2Key });
    expect((await f.db.select().from(qcImageSources).get())?.state).toBe("deleted");
    expect(await alice.runImportBatch(initial.importId, imported.revision!)).toMatchObject({ processed: 0, complete: true });
    expect((await f.db.select().from(qcImages).where(eq(qcImages.id, image.id)).get())?.status).toBe("deleted");

    const fresh = await alice.prepare("qc-purchase", external);
    const freshConfirmation = await alice.confirmImport(fresh.importId, fresh.revision, []);
    expect(freshConfirmation).toMatchObject({ sources: 1, eligibleSources: 1, restored: 1 });
  });

  it("blocks restoration during failed physical cleanup, then requires a fresh preview after retry", async () => {
    const fake = mockStorage(), alice = services(f, fake.storage);
    const initial = await alice.prepare("qc-purchase", external);
    const confirmed = await alice.confirmImport(initial.importId, initial.revision, []);
    await alice.runImportBatch(initial.importId, confirmed.revision);
    const image = (await f.db.select().from(qcImages).get())!;
    fake.calls.delete.mockImplementationOnce(async () => { throw new Error("synthetic delete failure"); });
    expect(await alice.deleteImage(image.id)).toMatchObject({ status: "pending" });

    const pendingCleanupPreview = await alice.prepare("qc-purchase", external);
    await expect(alice.confirmImport(pendingCleanupPreview.importId, pendingCleanupPreview.revision, [])).rejects.toMatchObject({ status: 409, code: "QC_REIMPORT_CLEANUP_PENDING" });
    expect((await f.db.select().from(qcImages).where(eq(qcImages.id, image.id)).get())).toMatchObject({ status: "deleted", deleteState: "pending" });

    expect(await alice.deleteImage(image.id)).toMatchObject({ status: "deleted" });
    await expect(alice.confirmImport(pendingCleanupPreview.importId, pendingCleanupPreview.revision, [])).rejects.toMatchObject({ status: 409, code: "QC_REIMPORT_PREPARE_REQUIRED" });
    const cleanPreview = await alice.prepare("qc-purchase", external);
    expect(await alice.confirmImport(cleanPreview.importId, cleanPreview.revision, [])).toMatchObject({ sources: 1, eligibleSources: 1, restored: 1 });
  });

  it("keeps one shared cover, serves private previews to members, and repairs the cover after deletion", async () => {
    const fake = mockStorage(), previewBytes = Buffer.from("synthetic-private-webp-preview");
    const previewHash = createHash("sha256").update(previewBytes).digest("hex");
    const alice = qcServices(f.db, "alice", {
      managerId: "alice", storage: fake.storage, download: async url => Buffer.from(new URL(url).pathname),
      validate: async bytes => ({ bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png", extension: "png", width: 2, height: 2 }),
      makePreview: async () => ({ bytes: previewBytes, sha256: previewHash, width: 2, height: 2 }),
    });
    const bob = qcServices(f.db, "bob", { managerId: "alice", storage: fake.storage });
    const prepared = await alice.prepare("qc-purchase", photoImport(2));
    const confirmed = await alice.confirmImport(prepared.importId, prepared.revision, []);
    await alice.runImportBatch(prepared.importId, confirmed.revision);
    await alice.runImportBatch(prepared.importId, confirmed.revision + 1);
    const images = await f.db.select().from(qcImages).orderBy(qcImages.ordinal).all();
    expect(images).toHaveLength(2);
    expect(await f.db.select().from(qcImagePreviews).all()).toHaveLength(2);
    expect((await f.db.select().from(qcPresentations).get())?.primaryImageId).toBe(images[0]!.id);
    expect(await bob.getPreview(images[0]!.id)).toEqual(previewBytes);
    await expect(bob.setPresentationCover("qc-purchase", "qc-purchase-item", images[1]!.id, 0)).rejects.toMatchObject({ status: 403, code: "QC_FORBIDDEN" });
    expect(await alice.getQcPresentations("qc-purchase", ["qc-purchase-item"])).toMatchObject({ items: [{ purchaseItemId: "qc-purchase-item", qcCount: 2, primaryImageId: images[0]!.id, coverPreview: { imageId: images[0]!.id, previewUrl: `/api/qc/images/${images[0]!.id}/preview`, width: 2, height: 2, occurrence: "Black / 42" }, canSetCover: true, previews: [{ imageId: images[0]!.id }, { imageId: images[1]!.id }], remainingCount: 0 }] });
    await expect(alice.getQcPresentations("qc-purchase", Array.from({ length: 21 }, (_, index) => `item-${index}`))).rejects.toMatchObject({ status: 400, code: "QC_PRESENTATION_BATCH_INVALID" });

    expect(await alice.setPresentationCover("qc-purchase", "qc-purchase-item", images[1]!.id, 0)).toMatchObject({ primaryImageId: images[1]!.id, revision: 1 });
    expect(await alice.getQcPresentations("qc-purchase", ["qc-purchase-item"])).toMatchObject({ items: [{ primaryImageId: images[1]!.id, coverPreview: { imageId: images[1]!.id } }] });
    expect((await alice.getGallery("qc-purchase", "qc-purchase-item")).primaryImageId).toBe(images[1]!.id);
    await alice.deleteImage(images[1]!.id);
    const gallery = await alice.getGallery("qc-purchase", "qc-purchase-item");
    expect(gallery).toMatchObject({ totalCount: 1, primaryImageId: images[0]!.id, presentationRevision: 2 });
    expect(await alice.getQcPresentations("qc-purchase", ["qc-purchase-item"])).toMatchObject({ items: [{ primaryImageId: images[0]!.id, coverPreview: { imageId: images[0]!.id } }] });
    const deletion = await f.db.select().from(qcEvents).where(eq(qcEvents.resultCode, "TOMBSTONED")).get();
    expect(JSON.parse(deletion!.contextJson)).toMatchObject({ coverChanges: [{ fromImageId: images[1]!.id, toImageId: images[0]!.id }] });
  });

  it("moves a ready cover on an explicitly confirmed rematch and rejects same-purchase cross-item image IDs", async () => {
    const secondItemId = "qc-purchase-second-item", now = new Date("2026-10-14T12:00:00.000Z");
    await f.db.insert(purchaseItems).values({ id: secondItemId, purchaseId: "qc-purchase", sourceFavoriteId: null, personId: "alice", createdBy: "alice", name: "Tênis azul", url: "https://weidian.com/item.html?itemID=123", platform: "weidian", visualKey: "shoe", variant: "Blue / 42", notes: null, quantity: 1, unitPriceCents: 12000, cartStatus: "added", sharingMode: "equal", createdAt: now, updatedAt: now }).run();
    const fake = mockStorage(), previewBytes = Buffer.from("synthetic-rematch-preview"), previewHash = createHash("sha256").update(previewBytes).digest("hex");
    const alice = qcServices(f.db, "alice", { managerId: "alice", storage: fake.storage, download: async () => rawPhoto, validate: async bytes => ({ bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png", extension: "png", width: 2, height: 2 }), makePreview: async () => ({ bytes: previewBytes, sha256: previewHash, width: 2, height: 2 }) });
    const initial = await alice.prepare("qc-purchase", external);
    const confirmed = await alice.confirmImport(initial.importId, initial.revision, [{ externalKey: initial.rows[0]!.externalKey, purchaseItemId: "qc-purchase-item" }]);
    await alice.runImportBatch(initial.importId, confirmed.revision);
    const image = (await f.db.select().from(qcImages).get())!;
    expect((await alice.getGallery("qc-purchase", "qc-purchase-item")).primaryImageId).toBe(image.id);
    await expect(alice.setPresentationCover("qc-purchase", secondItemId, image.id, 0)).rejects.toMatchObject({ status: 422, code: "QC_COVER_IMAGE_INVALID" });

    const correction = await alice.prepare("qc-purchase", external);
    const remapped = await alice.confirmImport(correction.importId, correction.revision, [{ externalKey: correction.rows[0]!.externalKey, purchaseItemId: secondItemId, correctExisting: true, expectedItemId: "qc-purchase-item" }]);
    expect(remapped.corrected).toBe(1);
    expect(await alice.getGallery("qc-purchase", "qc-purchase-item")).toMatchObject({ totalCount: 0, primaryImageId: null });
    expect(await alice.getGallery("qc-purchase", secondItemId)).toMatchObject({ totalCount: 1, primaryImageId: image.id });
  });

  it("keeps the ready original and cover when preview generation fails, then retries the preview during reconciliation", async () => {
    const fake = mockStorage(), previewBytes = Buffer.from("synthetic-recovered-preview"), previewHash = createHash("sha256").update(previewBytes).digest("hex");
    let failPreview = true;
    const alice = qcServices(f.db, "alice", { managerId: "alice", storage: fake.storage, download: async () => rawPhoto, validate: async bytes => ({ bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png", extension: "png", width: 2, height: 2 }), makePreview: async () => { if (failPreview) throw new Error("synthetic preview decoder failure"); return { bytes: previewBytes, sha256: previewHash, width: 2, height: 2 }; } });
    const prepared = await alice.prepare("qc-purchase", external);
    const confirmed = await alice.confirmImport(prepared.importId, prepared.revision, []);
    expect(await alice.runImportBatch(prepared.importId, confirmed.revision)).toMatchObject({ imported: 1, failed: 0 });
    const image = (await f.db.select().from(qcImages).get())!;
    expect(image.status).toBe("ready");
    expect((await alice.getGallery("qc-purchase", "qc-purchase-item")).primaryImageId).toBe(image.id);
    expect(await alice.getQcPresentations("qc-purchase", ["qc-purchase-item"])).toMatchObject({ items: [{ primaryImageId: image.id, coverPreview: null }] });
    expect((await f.db.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, image.id)).get())).toMatchObject({ status: "failed", errorCode: "QC_INTERNAL" });

    failPreview = false;
    expect(await alice.runBatch("qc-purchase")).toMatchObject({ previews: 1, processed: 1, complete: true, remaining: 0 });
    expect((await f.db.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, image.id)).get())).toMatchObject({ status: "ready", deleteState: "none" });
    expect(await alice.getQcPresentations("qc-purchase", ["qc-purchase-item"])).toMatchObject({ items: [{ primaryImageId: image.id, coverPreview: { imageId: image.id } }] });
  });

  it("bounds gallery pages, opens a requested image beyond page one, and caps batch previews at three", async () => {
    const now = new Date("2026-10-14T12:00:00.000Z");
    await f.db.insert(hubbuyExternalItems).values({ id: "qc-page-external", workspaceId: "workspace", purchaseId: "qc-purchase", purchaseItemId: "qc-purchase-item", orderGoodsId: "page-goods", orderGoodsNo: null, orderNo: "page-order", offerId: null, channel: null, offerUrl: null, skuInfo: "Blue / 40", title: "Tênis", quantity: 13, revision: 0, confirmedBy: "alice", confirmedAt: now, createdAt: now, updatedAt: now }).run();
    const images = Array.from({ length: 13 }, (_, index) => ({ id: `qc-page-image-${index + 1}`, externalItemId: "qc-page-external", sourceUrl: `https://scm.hubbuy.app/qc/page-${index + 1}.png`, sourceUrlHash: `page-source-${index + 1}`, contentSha256: `${String(index + 1).padStart(64, "a")}`, r2Key: `qc/page-${index + 1}.png`, status: "ready" as const, deleteState: "none" as const, mimeType: "image/png", byteSize: 100, width: 640, height: 480, ordinal: index, revision: 1, claimToken: null, claimExpiresAt: null, errorCode: null, createdBy: "alice", createdAt: new Date(now.getTime() + index * 1_000), updatedAt: new Date(now.getTime() + index * 1_000), deletedAt: null, deletedBy: null }));
    await f.db.insert(qcImages).values(images).run();
    await f.db.insert(qcImagePreviews).values(images.map(image => ({ imageId: image.id, r2Key: `qc/previews/v1/${image.id}.webp`, transformVersion: "qc-preview-v1", status: "ready" as const, deleteState: "none" as const, sha256: "b".repeat(64), byteSize: 200, width: 160, height: 120, revision: 1, claimToken: null, claimExpiresAt: null, errorCode: null, deletedAt: null, createdAt: now, updatedAt: now }))).run();
    const service = services(f, mockStorage().storage);
    const firstPage = await service.getGallery("qc-purchase", "qc-purchase-item");
    expect(firstPage).toMatchObject({ pageOffset: 0, totalCount: 13, nextOffset: 12 });
    expect(firstPage.images).toHaveLength(12);
    expect(firstPage.images[0]).not.toHaveProperty("sourceUrl");
    const direct = await service.getGallery("qc-purchase", "qc-purchase-item", 12, 0, "qc-page-image-13");
    expect(direct).toMatchObject({ pageOffset: 12, totalCount: 13 });
    expect(direct.images.map(image => image.id)).toEqual(["qc-page-image-13"]);
    const presentations = await service.getQcPresentations("qc-purchase", ["qc-purchase-item"]);
    expect(presentations.items[0]).toMatchObject({ qcCount: 13, remainingCount: 10 });
    expect(presentations.items[0]?.previews).toHaveLength(3);
  });

  it("ignores a photo-bearing occurrence with no matching listing and creates no QC rows", async () => {
    const fake = mockStorage(), alice = services(f, fake.storage);
    const irrelevant = { code: 0, data: { list: [{ orderNo: "ORDER-OTHER", goodsList: [{ orderGoodsId: "GOODS-OTHER", offerUrl: "https://weidian.com/item.html?itemID=999", skuInfo: "Navy / L", goodsName: "Outro produto", quantity: 1, freePhotos: [sourceUrl] }] }] } };
    const preview = await alice.prepare("qc-purchase", irrelevant);
    expect(preview.rows[0]?.match).toMatchObject({ status: "IGNORED", targetItemId: null, candidates: [] });
    const confirmed = await alice.confirmImport(preview.importId, preview.revision, []);
    expect(confirmed).toMatchObject({ linked: 0, pendingMatching: 0, ignored: 1, sources: 0, eligibleSources: 0 });
    expect(await f.db.select().from(hubbuyExternalItems).all()).toHaveLength(0);
    expect(await f.db.select().from(qcImageSources).all()).toHaveLength(0);
    expect(await f.db.select().from(qcImages).all()).toHaveLength(0);
    expect(fake.calls.put).not.toHaveBeenCalled();
    expect(await alice.getQcSummary("qc-purchase")).toMatchObject({ pendingMatching: 0, pendingTransfers: 0 });
  });

  it("manually links an ignored occurrence, transfers its photos and reuses the confirmed link", async () => {
    const fake = mockStorage(), alice = services(f, fake.storage);
    const payload = { code: 0, data: { list: [{ orderNo: "ORDER-MANUAL", goodsList: [{ orderGoodsId: "GOODS-MANUAL", goodsName: "Synthetic football jersey", skuInfo: "Green / 3XL", quantity: 1, freePhotos: [sourceUrl] }] }] } };
    const before = await f.db.select().from(purchaseItems).all();
    const preview = await alice.prepare("qc-purchase", payload);
    expect(preview.rows[0]?.match).toMatchObject({ status: "IGNORED", candidates: [] });
    const choices = [{ externalKey: preview.rows[0]!.externalKey, targetKey: "purchase:qc-purchase-item" }];
    await expect(services(f, fake.storage, "bob").confirmImport(preview.importId, preview.revision, choices)).rejects.toMatchObject({ status: 403 });
    const other = await seedFinalizedPurchase(f, "qc-other");
    await expect(alice.confirmImport(preview.importId, preview.revision, [{ ...choices[0]!, targetKey: `purchase:${other.itemId}` }])).rejects.toMatchObject({ status: 403, code: "QC_ITEM_CROSS_PURCHASE" });
    const confirmed = await alice.confirmImport(preview.importId, preview.revision, choices);
    expect(confirmed).toMatchObject({ linked: 1, ignored: 0, sources: 1, eligibleSources: 1 });
    expect(fake.calls.put).not.toHaveBeenCalled();
    expect(await alice.runImportBatch(preview.importId, confirmed.revision)).toMatchObject({ imported: 1, complete: true });
    expect((await alice.getGallery("qc-purchase", "qc-purchase-item")).images).toHaveLength(1);
    expect(await f.db.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, "qc-purchase")).all()).toEqual(before);
    expect(await f.db.select().from(qcEvents).all()).toEqual(expect.arrayContaining([expect.objectContaining({ eventType: "QC_MATCH", resultCode: "LINKED" })]));
    expect((await alice.prepare("qc-purchase", payload)).rows[0]?.match).toMatchObject({ status: "MATCHED", targetItemId: "purchase:qc-purchase-item" });
  });

  it("accepts an explicit target outside the suggested candidates", async () => {
    const now = new Date();
    await f.db.insert(purchaseItems).values({ id: "qc-manual-target", purchaseId: "qc-purchase", personId: "alice", createdBy: "alice", name: "Synthetic jersey", url: "https://weidian.com/item.html?itemID=999", platform: "weidian", visualKey: "tshirt", quantity: 1, cartStatus: "added", sharingMode: "equal", createdAt: now, updatedAt: now }).run();
    const alice = services(f, mockStorage().storage);
    const preview = await alice.prepare("qc-purchase", photoImport(1, "Different SKU"));
    expect(preview.rows[0]?.match).toMatchObject({ status: "PENDING", candidates: [{ itemId: "purchase:qc-purchase-item" }] });
    const confirmed = await alice.confirmImport(preview.importId, preview.revision, [{ externalKey: preview.rows[0]!.externalKey, targetKey: "purchase:qc-manual-target" }]);
    expect(confirmed).toMatchObject({ linked: 1, pendingMatching: 0, eligibleSources: 1 });
    expect((await f.db.select().from(hubbuyExternalItems).all())[0]?.purchaseItemId).toBe("qc-manual-target");
    const pending = await alice.prepare("qc-purchase", photoImport(1, "Different SKU", "GOODS-PENDING-MANUAL"));
    expect(await alice.confirmImport(pending.importId, pending.revision, [])).toMatchObject({ pendingMatching: 1 });
    const occurrence = (await alice.getQcSummary("qc-purchase")).pendingRows![0]!;
    expect(await alice.resolvePendingOccurrence("qc-purchase", occurrence.externalItemId, occurrence.revision, "purchase:qc-manual-target")).toMatchObject({ purchaseItemId: "qc-manual-target", pendingSources: 1 });
  });

  it("does not surface legacy null-linked sources without a plausible purchase-item candidate", async () => {
    const now = new Date(), externalItemId = "legacy-irrelevant-occurrence";
    await f.db.insert(hubbuyExternalItems).values({ id: externalItemId, workspaceId: "workspace", purchaseId: "qc-purchase", purchaseItemId: null, orderGoodsId: "LEGACY-IRRELEVANT", orderGoodsNo: null, orderNo: "LEGACY-ORDER", offerId: null, channel: null, offerUrl: "https://weidian.com/item.html?itemID=999", skuInfo: "Navy / L", title: "Produto ausente", quantity: 1, revision: 0, confirmedBy: null, confirmedAt: null, createdAt: now, updatedAt: now }).run();
    await f.db.insert(qcImageSources).values({ id: "legacy-irrelevant-source", importId: null, externalItemId, imageId: null, sourceUrl: "https://scm.hubbuy.app/qc/legacy-irrelevant.png", sourceUrlHash: "legacy-irrelevant-hash", ordinal: 0, state: "pending", attempts: 0, bytesReserved: 0, bytesConsumed: 0, errorCode: null, createdAt: now, updatedAt: now }).run();
    const summary = await services(f, mockStorage().storage).getQcSummary("qc-purchase");
    expect(summary).toMatchObject({ pendingMatching: 0, pendingRows: [], pendingTransfers: 0, pendingDeletes: 0 });
    expect((await services(f, mockStorage().storage).runBatch("qc-purchase")).processed).toBe(0);
  });

  it("counts ambiguous photos as one pending match and transfers all photos only after selection", async () => {
    const now = new Date("2026-10-14T12:00:00.000Z");
    await f.db.insert(purchaseItems).values({ id: "qc-purchase-second-item", purchaseId: "qc-purchase", sourceFavoriteId: null, personId: "alice", createdBy: "alice", name: "Tênis azul", url: "https://weidian.com/item.html?itemID=123", platform: "weidian", visualKey: "shoe", variant: "Blue / 42", notes: null, quantity: 1, unitPriceCents: 12000, cartStatus: "added", sharingMode: "equal", createdAt: now, updatedAt: now }).run();
    const fake = mockStorage(), alice = distinctPhotoServices(f, fake.storage), payload = photoImport(4, "Navy / L");
    const preview = await alice.prepare("qc-purchase", payload);
    expect(preview.rows[0]?.match).toMatchObject({ status: "PENDING", targetItemId: null, candidates: [{ itemId: "purchase:qc-purchase-item" }, { itemId: "purchase:qc-purchase-second-item" }] });
    const confirmed = await alice.confirmImport(preview.importId, preview.revision, []);
    expect(confirmed).toMatchObject({ linked: 0, pendingMatching: 1, ignored: 0, sources: 4, eligibleSources: 0 });
    const pendingProgress = await alice.getImport(preview.importId);
    expect(pendingProgress.photos.every(photo => photo.state === "matching")).toBe(true);
    expect(pendingProgress.nextSourceId).toBeNull();
    const summary = await alice.getQcSummary("qc-purchase");
    expect(summary.pendingMatching).toBe(1);
    expect(summary.pendingRows).toHaveLength(1);
    expect(summary.pendingRows?.[0]).toMatchObject({ photoCount: 4, candidates: [{ itemId: "purchase:qc-purchase-item" }, { itemId: "purchase:qc-purchase-second-item" }] });
    expect(summary.pendingTransfers).toBe(0);
    const occurrence = (await f.db.select().from(hubbuyExternalItems).all())[0]!;
    expect(occurrence.purchaseItemId).toBeNull();
    expect(await f.db.select().from(qcImages).all()).toHaveLength(0);

    const resolved = await alice.resolvePendingOccurrence("qc-purchase", occurrence.id, occurrence.revision, "qc-purchase-second-item");
    expect(resolved).toMatchObject({ purchaseItemId: "qc-purchase-second-item", revision: 1, pendingSources: 4 });
    await expect(alice.resolvePendingOccurrence("qc-purchase", occurrence.id, occurrence.revision, "qc-purchase-item")).rejects.toMatchObject({ status: 409, code: "QC_REVISION_CONFLICT" });
    const lastBatch = await alice.runBatch("qc-purchase", undefined, undefined, occurrence.id);
    expect(lastBatch).toMatchObject({ processed: 4, imported: 4, failed: 0, pending: 0, remaining: 0, complete: true });
    expect((await alice.getGallery("qc-purchase", "qc-purchase-second-item")).images).toHaveLength(4);
    expect(await alice.getQcSummary("qc-purchase")).toMatchObject({ pendingMatching: 0, pendingTransfers: 0 });
    expect(await f.db.select().from(qcEvents).all()).toEqual(expect.arrayContaining([expect.objectContaining({ resultCode: "RESOLVED" })]));
  });

  it("normalizes legacy manifests and does not let empty manual matches become pending", async () => {
    const fake = mockStorage(), alice = services(f, fake.storage);
    const linked = await alice.prepare("qc-purchase", external);
    const linkedRow = await f.db.select().from(qcImports).where(eq(qcImports.id, linked.importId)).get();
    const linkedManifest = JSON.parse(linkedRow!.manifestJson);
    linkedManifest.rows[0].match = { status: "linked", targetItemId: "qc-purchase-item", candidates: [] };
    await f.db.update(qcImports).set({ manifestJson: JSON.stringify(linkedManifest) }).where(eq(qcImports.id, linked.importId)).run();
    expect((await alice.getImport(linked.importId)).rows[0]?.match).toMatchObject({ status: "MATCHED", targetItemId: "qc-purchase-item" });
    expect(await alice.confirmImport(linked.importId, linked.revision, [])).toMatchObject({ linked: 1, sources: 1, eligibleSources: 1 });

    const manual = await alice.prepare("qc-purchase", { code: 0, data: { list: [{ orderNo: "ORDER-MANUAL", goodsList: [{ orderGoodsId: "GOODS-MANUAL", offerUrl: "https://weidian.com/item.html?itemID=999", goodsName: "Sem candidato", freePhotos: ["https://scm.hubbuy.app/qc/irrelevant.png"] }] }] } });
    const manualRow = await f.db.select().from(qcImports).where(eq(qcImports.id, manual.importId)).get();
    const manualManifest = JSON.parse(manualRow!.manifestJson);
    manualManifest.rows[0].match = { status: "manual", targetItemId: null, candidates: [] };
    await f.db.update(qcImports).set({ manifestJson: JSON.stringify(manualManifest) }).where(eq(qcImports.id, manual.importId)).run();
    expect((await alice.getImport(manual.importId)).rows[0]?.match).toMatchObject({ status: "IGNORED", targetItemId: null, candidates: [] });
    expect(await alice.confirmImport(manual.importId, manual.revision, [])).toMatchObject({ ignored: 1, pendingMatching: 0, sources: 0, eligibleSources: 0 });
    expect((await alice.getImport(manual.importId)).photos[0]).toMatchObject({ state: "ignored", sourceId: null, previewUrl: null });
    expect(await f.db.select().from(hubbuyExternalItems).all()).toHaveLength(1);
    expect(await f.db.select().from(qcImageSources).all()).toHaveLength(1);
  });

  it("reports remaining work after a failed photo and allows a later explicit resume", async () => {
    const fake = mockStorage();
    let failFirst = true;
    const service = qcServices(f.db, "alice", { managerId: "alice", storage: fake.storage, download: async url => { if (failFirst && url.endsWith("photo-0.png")) throw new Error("source unavailable"); return Buffer.from(new URL(url).pathname); }, validate: async bytes => ({ bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png", extension: "png", width: 2, height: 2 }) });
    const preview = await service.prepare("qc-purchase", photoImport(2));
    const confirmed = await service.confirmImport(preview.importId, preview.revision, []);
    const failed = await service.runImportBatch(preview.importId, confirmed.revision);
    expect(failed).toMatchObject({ imported: 1, failed: 1, processed: 2, remaining: 1, hasMore: true, complete: false, partial: true, revision: 2 });
    expect(failed.results[0]).toMatchObject({ status: "failed" });
    expect((await service.getQcSummary("qc-purchase")).pendingTransfers).toBe(1);
    failFirst = false;
    const resumed = await service.runImportBatch(preview.importId, failed.revision!);
    expect(resumed).toMatchObject({ imported: 1, failed: 0, processed: 1, remaining: 0, hasMore: false, complete: true, partial: false, revision: 3 });
  });

  it("recovers a confirmed R2 object before using HubBuy or charging another byte", async () => {
    const fake = mockStorage();
    const prepared = await services(f, fake.storage).prepare("qc-purchase", external);
    await services(f, fake.storage).confirmImport(prepared.importId, prepared.revision, []);
    const source = (await f.db.select().from(qcImageSources).all())[0]!;
    const contentSha256 = createHash("sha256").update(rawPhoto).digest("hex");
    const imageId = randomUUID(), r2Key = `qc/workspace/qc-purchase/${source.externalItemId}/${contentSha256}.png`;
    await f.db.insert(qcImages).values({ id: imageId, externalItemId: source.externalItemId, sourceUrl: source.sourceUrl, sourceUrlHash: source.sourceUrlHash, contentSha256, r2Key, status: "pending", deleteState: "none", mimeType: "image/png", byteSize: rawPhoto.byteLength, width: 2, height: 2, ordinal: source.ordinal, revision: 0, claimToken: null, claimExpiresAt: null, errorCode: "QC_PUT_IN_FLIGHT", createdBy: "alice", createdAt: new Date(), updatedAt: new Date(), deletedAt: null, deletedBy: null }).run();
    await f.db.update(qcImageSources).set({ imageId, state: "failed" }).where(eq(qcImageSources.id, source.id)).run();
    fake.objects.set(r2Key, { bytes: rawPhoto, sha256: contentSha256 });
    const download = vi.fn(async () => { throw new Error("CDN must not be requested for a known object"); });
    const alice = qcServices(f.db, "alice", { managerId: "alice", storage: fake.storage, download, validate: async bytes => ({ bytes, sha256: contentSha256, mimeType: "image/png", extension: "png", width: 2, height: 2 }) });
    const recovered = await alice.runImportBatch(prepared.importId, 1);
    expect(recovered).toMatchObject({ existing: 1, processed: 1, partial: false });
    expect(download).not.toHaveBeenCalled();
    expect(fake.calls.put).not.toHaveBeenCalled();
    expect((await f.db.select().from(qcImages).where(eq(qcImages.id, imageId)).get())?.status).toBe("ready");
    expect((await f.db.select().from(qcImageSources).where(eq(qcImageSources.id, source.id)).get())?.state).toBe("ready");
  });

  it("never retries a PUT when an earlier remote write remains ambiguous", async () => {
    const fake = mockStorage();
    const alice = services(f, fake.storage);
    const prepared = await alice.prepare("qc-purchase", external);
    await alice.confirmImport(prepared.importId, prepared.revision, []);
    const source = (await f.db.select().from(qcImageSources).all())[0]!;
    const contentSha256 = createHash("sha256").update(rawPhoto).digest("hex");
    const imageId = randomUUID(), r2Key = `qc/workspace/qc-purchase/${source.externalItemId}/${contentSha256}.png`;
    await f.db.insert(qcImages).values({ id: imageId, externalItemId: source.externalItemId, sourceUrl: source.sourceUrl, sourceUrlHash: source.sourceUrlHash, contentSha256, r2Key, status: "failed", deleteState: "none", mimeType: "image/png", byteSize: rawPhoto.byteLength, width: 2, height: 2, ordinal: source.ordinal, revision: 0, claimToken: null, claimExpiresAt: null, errorCode: "QC_PUT_IN_FLIGHT", createdBy: "alice", createdAt: new Date(), updatedAt: new Date(), deletedAt: null, deletedBy: null }).run();
    await f.db.update(qcImageSources).set({ imageId, state: "failed" }).where(eq(qcImageSources.id, source.id)).run();
    const download = vi.fn(async () => rawPhoto);
    const service = qcServices(f.db, "alice", { managerId: "alice", storage: fake.storage, download, validate: async bytes => ({ bytes, sha256: contentSha256, mimeType: "image/png", extension: "png", width: 2, height: 2 }) });

    const absent = await service.runImportBatch(prepared.importId, 1);
    expect(absent).toMatchObject({ pending: 1, processed: 1, partial: true, revision: 2 });
    expect(download).not.toHaveBeenCalled();
    expect(fake.calls.put).not.toHaveBeenCalled();
    expect((await f.db.select().from(qcImages).where(eq(qcImages.id, imageId)).get())).toMatchObject({ status: "failed", errorCode: "QC_PUT_IN_FLIGHT" });

    fake.objects.set(r2Key, { bytes: rawPhoto, sha256: contentSha256 });
    const found = await service.runImportBatch(prepared.importId, 2);
    expect(found).toMatchObject({ existing: 1, processed: 1, partial: false, revision: 3 });
    expect(download).not.toHaveBeenCalled();
    expect(fake.calls.put).not.toHaveBeenCalled();
    expect((await f.db.select().from(qcImages).where(eq(qcImages.id, imageId)).get())).toMatchObject({ status: "ready", errorCode: "QC_PUT_IN_FLIGHT" });
  });

  it("blocks a new URL alias from starting a writer for an uncertain content hash", async () => {
    const fake = mockStorage(), alice = services(f, fake.storage);
    const manifest = { code: 0, data: { list: [{ orderNo: "ORDER-1", goodsList: [{ orderGoodsId: "GOODS-1", orderGoodsNo: "ALT-1", offerUrl: "https://weidian.com/item.html?itemID=123", skuInfo: "Black / 42", goodsName: "Tênis", quantity: 1, freePhotos: ["https://scm.hubbuy.app/alias.png"] }] }] } };
    const prepared = await alice.prepare("qc-purchase", manifest);
    await alice.confirmImport(prepared.importId, prepared.revision, []);
    const source = (await f.db.select().from(qcImageSources).all())[0]!;
    const contentSha256 = createHash("sha256").update(rawPhoto).digest("hex");
    const imageId = randomUUID(), r2Key = `qc/workspace/qc-purchase/${source.externalItemId}/${contentSha256}.png`;
    await f.db.insert(qcImages).values({ id: imageId, externalItemId: source.externalItemId, sourceUrl: "https://scm.hubbuy.app/earlier.png", sourceUrlHash: "earlier-url-hash", contentSha256, r2Key, status: "failed", deleteState: "none", mimeType: "image/png", byteSize: rawPhoto.byteLength, width: 2, height: 2, ordinal: 0, revision: 0, claimToken: null, claimExpiresAt: null, errorCode: "QC_PUT_IN_FLIGHT", createdBy: "alice", createdAt: new Date(), updatedAt: new Date(), deletedAt: null, deletedBy: null }).run();
    const download = vi.fn(async () => rawPhoto);
    const service = qcServices(f.db, "alice", { managerId: "alice", storage: fake.storage, download, validate: async bytes => ({ bytes, sha256: contentSha256, mimeType: "image/png", extension: "png", width: 2, height: 2 }) });
    const absent = await service.runImportBatch(prepared.importId, 1);
    expect(absent).toMatchObject({ pending: 1, processed: 1, partial: true, revision: 2 });
    expect(fake.calls.put).not.toHaveBeenCalled();
    expect((await f.db.select().from(qcImageSources).where(eq(qcImageSources.id, source.id)).get())).toMatchObject({ imageId, state: "pending" });

    fake.objects.set(r2Key, { bytes: rawPhoto, sha256: contentSha256 });
    expect(await service.runImportBatch(prepared.importId, 2)).toMatchObject({ existing: 1, processed: 1, partial: false });
    expect(download).toHaveBeenCalledTimes(1);
    expect(fake.calls.put).not.toHaveBeenCalled();
  });

  it("stops before a recovery HEAD that cannot fit in the shared request deadline", async () => {
    let clock = 1_000;
    const fake = mockStorage();
    const storage: QcStorage = {
      ...fake.storage,
      head: vi.fn(async key => { clock += QC_LIMITS.transferMs; return fake.storage.head(key); }),
      put: vi.fn(async () => { clock += QC_LIMITS.transferMs; throw new Error("simulated uncertain PUT timeout"); }),
    };
    const manifest = { code: 0, data: { list: [{ orderNo: "ORDER-1", goodsList: [{ orderGoodsId: "GOODS-1", orderGoodsNo: "ALT-1", offerUrl: "https://weidian.com/item.html?itemID=123", skuInfo: "Black / 42", goodsName: "Tênis", quantity: 1, freePhotos: [sourceUrl] }] }] } };
    const previewService = qcServices(f.db, "alice", { managerId: "alice", storage, download: async () => rawPhoto, validate: async bytes => ({ bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png", extension: "png", width: 2, height: 2 }) });
    const prepared = await previewService.prepare("qc-purchase", manifest);
    await previewService.confirmImport(prepared.importId, prepared.revision, []);
    const service = qcServices(f.db, "alice", { managerId: "alice", storage, download: async () => { clock += QC_LIMITS.dnsMs + QC_LIMITS.transferMs; return rawPhoto; }, validate: async bytes => { clock += QC_LIMITS.imageValidationMs; return { bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png", extension: "png", width: 2, height: 2 }; }, now: () => clock });
    const result = await service.runImportBatch(prepared.importId, 1);
    expect(result).toMatchObject({ pending: 1, processed: 1, partial: true });
    expect(storage.head).toHaveBeenCalledTimes(1);
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(clock).toBeLessThan(1_000 + QC_LIMITS.requestMs);
    expect((await f.db.select().from(qcImages).all())[0]?.errorCode).toBe("QC_PUT_IN_FLIGHT");
  });

  it("does not start a preview PUT when the queued marker write consumes the remaining request budget", async () => {
    let clock = 1_000;
    const fake = mockStorage();
    const previewBytes = Buffer.from("synthetic-preview");
    const previewSha256 = createHash("sha256").update(previewBytes).digest("hex");
    const delayedMarkerDb = new Proxy(f.db, {
      get(target, property) {
        const original = Reflect.get(target, property, target) as unknown;
        if (property !== "update" || typeof original !== "function") return typeof original === "function" ? original.bind(target) : original;
        return (...args: unknown[]) => {
          const query = Reflect.apply(original, target, args) as object;
          const wrap = (builder: object, watchesMarker: boolean): object => new Proxy(builder, {
            get(builderTarget, builderProperty) {
              const method = Reflect.get(builderTarget, builderProperty, builderTarget) as unknown;
              if (typeof method !== "function") return method;
              return (...methodArgs: unknown[]) => {
                const result = Reflect.apply(method, builderTarget, methodArgs) as unknown;
                const markerWrite = builderProperty === "set" && (methodArgs[0] as { errorCode?: string } | undefined)?.errorCode === "QC_PREVIEW_PUT_IN_FLIGHT";
                if (builderProperty === "get" || builderProperty === "run") {
                  return Promise.resolve(result).then(value => { if (watchesMarker) clock += 25_000; return value; });
                }
                return result && typeof result === "object" ? wrap(result as object, watchesMarker || markerWrite) : result;
              };
            },
          });
          return wrap(query, false);
        };
      },
    }) as AppDatabase;
    const service = qcServices(delayedMarkerDb, "alice", {
      managerId: "alice", storage: fake.storage, download: async () => rawPhoto,
      validate: async bytes => ({ bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png", extension: "png", width: 2, height: 2 }),
      makePreview: async () => {
        clock += QC_LIMITS.requestMs - QC_LIMITS.imageValidationMs - QC_LIMITS.transferMs - QC_LIMITS.requestSafetyMs - 1;
        return { bytes: previewBytes, sha256: previewSha256, width: 1, height: 1 };
      },
      now: () => clock,
    });
    const prepared = await service.prepare("qc-purchase", external);
    await service.confirmImport(prepared.importId, prepared.revision, []);
    await service.runImportBatch(prepared.importId, 1);
    expect(clock).toBeGreaterThan(1_000 + QC_LIMITS.requestMs - QC_LIMITS.transferMs - QC_LIMITS.requestSafetyMs);
    expect(fake.calls.put.mock.calls.map(([object]) => object.key)).toEqual(expect.not.arrayContaining([expect.stringContaining("qc/previews/")]));
    expect(fake.calls.put).toHaveBeenCalledTimes(1);
  });

  it("moves selected failed sources to a smaller manifest without erasing old quota spend", async () => {
    const fake = mockStorage(), alice = services(f, fake.storage);
    const first = await alice.prepare("qc-purchase", external);
    await alice.confirmImport(first.importId, first.revision, []);
    const source = (await f.db.select().from(qcImageSources).all())[0]!;
    await f.db.update(qcImports).set({ bytesConsumed: QC_LIMITS.importBytes }).where(eq(qcImports.id, first.importId)).run();
    await f.db.update(qcImageSources).set({ state: "failed", errorCode: "QC_IMPORT_BYTES_LIMIT" }).where(eq(qcImageSources.id, source.id)).run();

    const smaller = await alice.prepare("qc-purchase", external);
    const confirmed = await alice.confirmImport(smaller.importId, smaller.revision, []);
    expect(confirmed.sources).toBe(1);
    expect((await f.db.select().from(qcImports).where(eq(qcImports.id, first.importId)).get())?.bytesConsumed).toBe(QC_LIMITS.importBytes);
    expect((await f.db.select().from(qcImageSources).where(eq(qcImageSources.id, source.id)).get())?.importId).toBe(smaller.importId);
    expect(await alice.runImportBatch(smaller.importId, 1)).toMatchObject({ imported: 1, processed: 1, partial: false });
    expect((await f.db.select().from(qcImports).where(eq(qcImports.id, first.importId)).get())?.bytesConsumed).toBe(QC_LIMITS.importBytes);
  });

  it("keeps import transfers scoped to their photos and leaves tombstone cleanup to reconciliation", async () => {
    const fake = mockStorage();
    const manifest = { code: 0, data: { list: [{ orderNo: "ORDER-1", goodsList: [{ orderGoodsId: "GOODS-1", offerUrl: "https://weidian.com/item.html?itemID=123", goodsName: "Tênis", quantity: 1, freePhotos: ["https://scm.hubbuy.app/broken-1.png", "https://scm.hubbuy.app/broken-2.png", "https://scm.hubbuy.app/good.png"] }] }] } };
    const preview = await services(f, fake.storage).prepare("qc-purchase", manifest);
    await services(f, fake.storage).confirmImport(preview.importId, preview.revision, []);
    const sources = await f.db.select().from(qcImageSources).all();
    await f.db.update(hubbuyExternalItems).set({ purchaseItemId: "qc-purchase-item" }).where(eq(hubbuyExternalItems.id, sources[0]!.externalItemId)).run();
    await f.db.update(qcImageSources).set({ state: "failed", updatedAt: new Date(0) }).where(eq(qcImageSources.id, sources[0]!.id)).run();
    await f.db.update(qcImageSources).set({ state: "failed", updatedAt: new Date(0) }).where(eq(qcImageSources.id, sources[1]!.id)).run();
    const externalId = sources[0]!.externalItemId, tombstoneId = randomUUID(), tombstoneKey = `qc/workspace/qc-purchase/${externalId}/tombstone.png`;
    await f.db.insert(qcImages).values({ id: tombstoneId, externalItemId: externalId, sourceUrl: "https://scm.hubbuy.app/tombstone.png", sourceUrlHash: "tombstone-url-hash", contentSha256: null, r2Key: tombstoneKey, status: "deleted", deleteState: "pending", mimeType: null, byteSize: null, width: null, height: null, ordinal: 10, revision: 0, claimToken: null, claimExpiresAt: null, errorCode: null, createdBy: "alice", createdAt: new Date(), updatedAt: new Date(), deletedAt: new Date(), deletedBy: "alice" }).run();
    fake.objects.set(tombstoneKey, { bytes: Buffer.from("deleted"), sha256: "deleted" });
    const downloadedUrls: string[] = [];
    const alice = qcServices(f.db, "alice", { managerId: "alice", storage: fake.storage, download: async url => { downloadedUrls.push(url); if (url.includes("broken")) throw new Error("source removed"); return rawPhoto; }, validate: async bytes => ({ bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png", extension: "png", width: 2, height: 2 }) });

    let revision = 1, sawImport = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await alice.runImportBatch(preview.importId, revision++);
      expect(result.processed).toBeLessThanOrEqual(QC_LIMITS.batch);
      expect(result.deleted).toBe(0);
      sawImport ||= result.imported > 0;
    }
    expect(sawImport).toBe(true);
    expect(fake.objects.has(tombstoneKey)).toBe(true);
    expect(downloadedUrls).toContain("https://scm.hubbuy.app/good.png");
    expect((await f.db.select().from(qcImageSources).all()).map(row => row.state)).toEqual(expect.arrayContaining(["failed", "failed", "ready"]));
    let sawDelete = false;
    for (let attempt = 0; attempt < 8 && !sawDelete; attempt++) sawDelete = (await alice.runBatch("qc-purchase")).deleted > 0;
    expect(sawDelete).toBe(true);
    expect(fake.objects.has(tombstoneKey)).toBe(false);
  });

  it("keeps an uncertain PUT tombstoned until its writer finishes and compensates it", async () => {
    let clock = Date.now();
    let release!: () => void, started!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; }), putStarted = new Promise<void>(resolve => { started = resolve; });
    const fake = mockStorage({ holdPut: { started, release: held } });
    const alice = qcServices(f.db, "alice", { managerId: "alice", storage: fake.storage, download: async () => rawPhoto, validate: async bytes => ({ bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png", extension: "png", width: 2, height: 2 }), now: () => clock });
    try {
      const prepared = await alice.prepare("qc-purchase", external);
      await alice.confirmImport(prepared.importId, prepared.revision, []);
      const batch = alice.runImportBatch(prepared.importId, 1);
      await putStarted;
      const image = (await f.db.select().from(qcImages).all())[0]!;
      expect(image.errorCode).toBe("QC_PUT_IN_FLIGHT");
      clock += QC_LIMITS.lockMs + 1;
      expect(await alice.deleteImage(image.id)).toMatchObject({ status: "pending" });
      expect((await f.db.select().from(qcImages).where(eq(qcImages.id, image.id)).get())).toMatchObject({ status: "deleted", deleteState: "pending", errorCode: "QC_PUT_IN_FLIGHT" });
      release();
      await expect(batch).resolves.toMatchObject({ pending: 1, partial: true, complete: false });
      let tombstone = (await f.db.select().from(qcImages).where(eq(qcImages.id, image.id)).get())!;
      expect(tombstone).toMatchObject({ status: "deleted", deleteState: "pending", errorCode: "QC_DELETE_PENDING", claimToken: null });
      expect(fake.objects.has(tombstone.r2Key)).toBe(true);
      expect(await alice.deleteImage(image.id)).toMatchObject({ status: "deleted" });
      tombstone = (await f.db.select().from(qcImages).where(eq(qcImages.id, image.id)).get())!;
      expect(tombstone).toMatchObject({ status: "deleted", deleteState: "deleted", errorCode: null, claimToken: null });
      expect(fake.objects.has(tombstone.r2Key)).toBe(false);
    } finally { release(); }
  });

  it("keeps an uncertain preview PUT tombstoned until its writer finishes before allowing reimport", async () => {
    let release!: () => void, started!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; }), previewPutStarted = new Promise<void>(resolve => { started = resolve; });
    const fake = mockStorage({ holdPreviewPut: { started, release: held } });
    const previewBytes = Buffer.from("synthetic-held-preview"), previewHash = createHash("sha256").update(previewBytes).digest("hex");
    const alice = qcServices(f.db, "alice", { managerId: "alice", storage: fake.storage, download: async () => rawPhoto, validate: async bytes => ({ bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png", extension: "png", width: 2, height: 2 }), makePreview: async () => ({ bytes: previewBytes, sha256: previewHash, width: 2, height: 2 }) });
    try {
      const prepared = await alice.prepare("qc-purchase", external);
      const confirmed = await alice.confirmImport(prepared.importId, prepared.revision, []);
      const batch = alice.runImportBatch(prepared.importId, confirmed.revision);
      await previewPutStarted;
      const image = (await f.db.select().from(qcImages).get())!;
      const preview = (await f.db.select().from(qcImagePreviews).get())!;
      expect(preview).toMatchObject({ status: "pending", errorCode: "QC_PREVIEW_PUT_IN_FLIGHT" });

      await f.db.update(qcTransferLocks).set({ leaseUntil: Date.now() - 1 }).where(eq(qcTransferLocks.scope, "workspace")).run();
      expect(await alice.deleteImage(image.id)).toMatchObject({ status: "pending" });
      expect((await f.db.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, image.id)).get())).toMatchObject({ status: "deleted", deleteState: "pending", errorCode: "QC_PREVIEW_PUT_IN_FLIGHT" });
      const stalePrepare = await alice.prepare("qc-purchase", external);
      await expect(alice.confirmImport(stalePrepare.importId, stalePrepare.revision, [])).rejects.toMatchObject({ status: 409, code: "QC_REIMPORT_CLEANUP_PENDING" });

      release();
      await batch;
      await expect(alice.deleteImage(image.id)).resolves.toMatchObject({ status: "deleted" });
      expect((await f.db.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, image.id)).get())).toMatchObject({ status: "deleted", deleteState: "deleted", errorCode: null, claimToken: null });
      const fresh = await alice.prepare("qc-purchase", external);
      const restored = await alice.confirmImport(fresh.importId, fresh.revision, []);
      expect(restored).toMatchObject({ restored: 1, eligibleSources: 1 });
      const result = await alice.runImportBatch(fresh.importId, restored.revision);
      expect(result).toMatchObject({ imported: 1, complete: true });
      const readyImage = (await f.db.select().from(qcImages).where(eq(qcImages.id, image.id)).get())!;
      const readyPreview = (await f.db.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, image.id)).get())!;
      expect(readyImage.r2Key).not.toBe(image.r2Key);
      expect(readyPreview.r2Key).not.toBe(preview.r2Key);
      expect(readyPreview).toMatchObject({ status: "ready", deleteState: "none", transformVersion: expect.any(String) });
      expect(fake.objects.has(readyImage.r2Key)).toBe(true);
      expect(fake.objects.has(readyPreview.r2Key)).toBe(true);
      expect(fake.objects.has(preview.r2Key)).toBe(false);
    } finally { release(); }
  });

  it("lets a late delete remove only captured old-generation keys after reimport", async () => {
    const fake = mockStorage(), previewBytes = Buffer.from("synthetic-late-delete-preview"), previewHash = createHash("sha256").update(previewBytes).digest("hex");
    const alice = qcServices(f.db, "alice", { managerId: "alice", storage: fake.storage, download: async () => rawPhoto, validate: async bytes => ({ bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png", extension: "png", width: 2, height: 2 }), makePreview: async () => ({ bytes: previewBytes, sha256: previewHash, width: 2, height: 2 }) });
    const prepared = await alice.prepare("qc-purchase", external);
    const confirmed = await alice.confirmImport(prepared.importId, prepared.revision, []);
    await alice.runImportBatch(prepared.importId, confirmed.revision);
    const image = (await f.db.select().from(qcImages).get())!;
    const preview = (await f.db.select().from(qcImagePreviews).get())!;
    const oldKeys = [image.r2Key, preview.r2Key];
    let release!: () => void, started!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; }), deleteStarted = new Promise<void>(resolve => { started = resolve; });
    fake.calls.delete.mockImplementationOnce(async key => { started(); await held; fake.objects.delete(key); });
    const staleDelete = alice.deleteImage(image.id);
    try {
      await deleteStarted;
      await f.db.update(qcTransferLocks).set({ leaseUntil: Date.now() - 1 }).where(eq(qcTransferLocks.scope, "workspace")).run();
      await expect(alice.deleteImage(image.id)).resolves.toMatchObject({ status: "deleted" });

      const fresh = await alice.prepare("qc-purchase", external);
      const restored = await alice.confirmImport(fresh.importId, fresh.revision, []);
      expect(restored).toMatchObject({ restored: 1, eligibleSources: 1 });
      await alice.runImportBatch(fresh.importId, restored.revision);
      const currentImage = (await f.db.select().from(qcImages).where(eq(qcImages.id, image.id)).get())!;
      const currentPreview = (await f.db.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, image.id)).get())!;
      expect(currentImage.r2Key).not.toBe(image.r2Key);
      expect(currentPreview.r2Key).not.toBe(preview.r2Key);

      release();
      await expect(staleDelete).resolves.toMatchObject({ status: "deleted" });
      expect(fake.objects.has(currentImage.r2Key)).toBe(true);
      expect(fake.objects.has(currentPreview.r2Key)).toBe(true);
      expect((await alice.getGallery("qc-purchase", "qc-purchase-item")).images).toHaveLength(1);
      expect(fake.calls.delete.mock.calls.map(([key]) => key)).not.toEqual(expect.arrayContaining([currentImage.r2Key, currentPreview.r2Key]));
      expect(oldKeys).not.toContain(currentImage.r2Key);
      expect(oldKeys).not.toContain(currentPreview.r2Key);
    } finally { release(); await staleDelete; }
  });

  it("preserves uncertain preview PUT evidence through HEAD failure and adoption", async () => {
    const fake = mockStorage(), previewBytes = Buffer.from("synthetic-uncertain-preview"), previewHash = createHash("sha256").update(previewBytes).digest("hex");
    const alice = qcServices(f.db, "alice", { managerId: "alice", storage: fake.storage, download: async () => rawPhoto, validate: async bytes => ({ bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png", extension: "png", width: 2, height: 2 }), makePreview: async () => ({ bytes: previewBytes, sha256: previewHash, width: 2, height: 2 }) });
    const prepared = await alice.prepare("qc-purchase", external);
    const confirmed = await alice.confirmImport(prepared.importId, prepared.revision, []);
    await alice.runImportBatch(prepared.importId, confirmed.revision);
    const image = (await f.db.select().from(qcImages).get())!;
    let preview = (await f.db.select().from(qcImagePreviews).get())!;
    const originalPutCount = fake.calls.put.mock.calls.length;
    await f.db.update(qcImagePreviews).set({ status: "pending", errorCode: "QC_PREVIEW_PUT_IN_FLIGHT", claimToken: randomUUID(), claimExpiresAt: new Date(0), revision: preview.revision + 1 }).where(eq(qcImagePreviews.imageId, image.id)).run();

    fake.calls.head.mockImplementationOnce(async () => { throw new Error("temporary HEAD failure"); });
    await alice.runBatch("qc-purchase");
    preview = (await f.db.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, image.id)).get())!;
    expect(preview).toMatchObject({ status: "pending", errorCode: "QC_PREVIEW_PUT_IN_FLIGHT", claimToken: expect.any(String) });
    expect(fake.calls.put).toHaveBeenCalledTimes(originalPutCount);

    await alice.runBatch("qc-purchase");
    preview = (await f.db.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, image.id)).get())!;
    expect(preview).toMatchObject({ status: "ready", deleteState: "none", errorCode: "QC_PREVIEW_PUT_IN_FLIGHT", claimToken: expect.any(String) });
    expect(fake.calls.put).toHaveBeenCalledTimes(originalPutCount);
    expect(await alice.deleteImage(image.id)).toMatchObject({ status: "pending" });
    expect((await f.db.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, image.id)).get())).toMatchObject({ status: "deleted", deleteState: "pending", errorCode: "QC_PREVIEW_PUT_IN_FLIGHT" });
  });

  it("rejects cross-purchase item IDs and unconfirmed remaps", async () => {
    const other = await seedFinalizedPurchase(f, "other-purchase"), fake = mockStorage(), alice = services(f, fake.storage);
    const preview = await alice.prepare("qc-purchase", external);
    await expect(alice.confirmImport(preview.importId, preview.revision, [{ externalKey: preview.rows[0]!.externalKey, purchaseItemId: other.itemId }])).rejects.toMatchObject({ status: 403, code: "QC_ITEM_CROSS_PURCHASE" });
    await alice.confirmImport(preview.importId, preview.revision, []);
    const correction = await alice.prepare("qc-purchase", external);
    // A new preview reuses the confirmed link; changing it requires an explicit expected destination.
    await expect(alice.confirmImport(correction.importId, correction.revision, [{ externalKey: correction.rows[0]!.externalKey, purchaseItemId: null }])).rejects.toMatchObject({ status: 409, code: "QC_REMAP_CONFIRMATION_REQUIRED" });
  });

  it("rejects a stale preview when a concurrent confirmation inserted an occurrence without orderNo", async () => {
    const alice = services(f, mockStorage().storage);
    const noOrderNo = { code: 0, data: { list: [{ goodsList: [{ orderGoodsNo: "ALT-NO-ORDER", offerUrl: "https://weidian.com/item.html?itemID=123", skuInfo: "Purple / 99", goodsName: "Product without orderNo", quantity: 1, freePhotos: [] }] }] } };
    const first = await alice.prepare("qc-purchase", noOrderNo);
    const stale = await alice.prepare("qc-purchase", noOrderNo);
    await alice.confirmImport(first.importId, first.revision, []);
    await expect(alice.confirmImport(stale.importId, stale.revision, [])).rejects.toMatchObject({ status: 409, code: "QC_REVISION_CONFLICT" });
    expect(await f.db.select().from(hubbuyExternalItems).all()).toHaveLength(1);
  });

  it("uses a shared lease to reject overlapping batches from another DB connection", async () => {
    const dbUrl = `file:./data/qc-lock-${randomUUID()}.sqlite`, first = await fixture(dbUrl);
    const otherConnection = openDatabase(dbUrl);
    let release!: () => void, started!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; }), putStarted = new Promise<void>(resolve => { started = resolve; });
    const fake = mockStorage({ holdPut: { started, release: held } });
    try {
      await seedFinalizedPurchase(first);
      const firstService = services(first, fake.storage);
      const prepared = await firstService.prepare("qc-purchase", external);
      await firstService.confirmImport(prepared.importId, prepared.revision, []);
      const active = firstService.runImportBatch(prepared.importId, 1);
      await putStarted;
      const secondService = qcServices(otherConnection.db, "alice", { managerId: "alice", storage: fake.storage, download: async () => rawPhoto, validate: async bytes => ({ bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png", extension: "png", width: 2, height: 2 }) });
      await expect(secondService.runImportBatch(prepared.importId, 1)).rejects.toMatchObject({ status: 409, code: "QC_TRANSFER_ACTIVE" });
      release();
      await expect(active).resolves.toMatchObject({ imported: 1 });
    } finally {
      release();
      await Promise.all([first.client.close(), otherConnection.client.close()]);
    }
  });
});
