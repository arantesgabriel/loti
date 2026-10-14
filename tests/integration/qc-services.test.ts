import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { hubbuyExternalItems, purchaseItems, purchases, qcEvents, qcImageSources, qcImages, qcImports } from "@/lib/db/schema";
import { openDatabase } from "@/lib/db/connection";
import { qcServices } from "@/lib/domain/qc-services";
import { QC_LIMITS } from "@/lib/domain/qc-limits";
import type { QcObject, QcStorage } from "@/lib/qc/storage";
import { fixture, type Fixture } from "./helpers";

const sourceUrl = "https://scm.hubbuy.app/qc/synthetic.png";
const rawPhoto = Buffer.from("synthetic-image-bytes");
const external = { code: 0, data: { count: 1, list: [{ orderNo: "ORDER-1", goodsList: [{ orderGoodsId: "GOODS-1", orderGoodsNo: "ALT-1", offerUrl: "https://weidian.com/item.html?itemID=123", skuInfo: "Black / 42", goodsName: "Tênis", quantity: 1, freePhotos: [sourceUrl] }] }] } };

function mockStorage(options: { holdPut?: { started: () => void; release: Promise<void> }; deleteFails?: boolean } = {}) {
  const objects = new Map<string, { bytes: Buffer; sha256: string }>();
  const calls = { put: vi.fn(async (object: QcObject) => { options.holdPut?.started(); if (options.holdPut) await options.holdPut.release; objects.set(object.key, { bytes: object.bytes, sha256: object.sha256 }); }), head: vi.fn(async (key: string) => { const value = objects.get(key); return value ? { exists: true, sha256: value.sha256 } : { exists: false }; }), delete: vi.fn(async (key: string) => { if (options.deleteFails) throw new Error("simulated delete failure"); objects.delete(key); }), signRead: vi.fn(async (key: string) => `https://private-r2.test/${key}?signature=synthetic`) };
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

  it("imports a confirmed occurrence, authorizes fallback, tombstones deletion and prevents reimport resurrection", async () => {
    const fake = mockStorage(), alice = services(f, fake.storage), bob = services(f, fake.storage, "bob");
    const before = await f.db.select().from(purchaseItems).where(eq(purchaseItems.id, "qc-purchase-item")).get();
    const prepared = await alice.prepare("qc-purchase", external);
    expect(prepared.rows[0]?.match).toMatchObject({ status: "linked", targetItemId: "qc-purchase-item" });
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
    await alice.confirmImport(repeated.importId, repeated.revision, []);
    const resumed = await alice.runImportBatch(repeated.importId, 1);
    expect(resumed).toMatchObject({ processed: 1, deleted: 1, imported: 0 });
    expect(fake.calls.put).toHaveBeenCalledTimes(1);
    const after = await f.db.select().from(purchaseItems).where(eq(purchaseItems.id, "qc-purchase-item")).get();
    expect(after).toEqual(before);
    expect(await f.db.select().from(hubbuyExternalItems).all()).toHaveLength(1);
    expect((await f.db.select().from(qcImageSources).all())[0]?.state).toBe("deleted");
    expect(await f.db.select().from(qcEvents).all()).toHaveLength(9);
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

  it("rotates past failed sources and cleans tombstones while photo work remains", async () => {
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

    let revision = 1, sawDelete = false, sawImport = false;
    for (let attempt = 0; attempt < 6 && !(sawDelete && sawImport); attempt++) {
      const result = await alice.runImportBatch(preview.importId, revision++);
      expect(result.processed).toBeLessThanOrEqual(2);
      sawDelete ||= result.deleted > 0;
      sawImport ||= result.imported > 0;
    }
    expect(sawDelete).toBe(true);
    expect(sawImport).toBe(true);
    expect(fake.objects.has(tombstoneKey)).toBe(false);
    expect(downloadedUrls).toContain("https://scm.hubbuy.app/good.png");
    expect((await f.db.select().from(qcImageSources).all()).map(row => row.state)).toEqual(expect.arrayContaining(["failed", "failed", "ready"]));
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
      await expect(batch).resolves.toMatchObject({ pending: 1 });
      let tombstone = (await f.db.select().from(qcImages).where(eq(qcImages.id, image.id)).get())!;
      expect(tombstone).toMatchObject({ status: "deleted", deleteState: "pending", errorCode: "QC_DELETE_PENDING", claimToken: null });
      expect(fake.objects.has(tombstone.r2Key)).toBe(true);
      expect(await alice.deleteImage(image.id)).toMatchObject({ status: "deleted" });
      tombstone = (await f.db.select().from(qcImages).where(eq(qcImages.id, image.id)).get())!;
      expect(tombstone).toMatchObject({ status: "deleted", deleteState: "deleted", errorCode: null, claimToken: null });
      expect(fake.objects.has(tombstone.r2Key)).toBe(false);
    } finally { release(); }
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
    const noOrderNo = { code: 0, data: { list: [{ goodsList: [{ orderGoodsNo: "ALT-NO-ORDER", goodsName: "Product without orderNo", freePhotos: [] }] }] } };
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
