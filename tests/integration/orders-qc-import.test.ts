import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { fixture, type Fixture } from "./helpers";
import { purchases, purchaseItems, qcImports, hubbuyExternalItems } from "@/lib/db/schema";
import { ordersQcImport } from "@/lib/domain/orders-qc-import";
import { qcServices } from "@/lib/domain/qc-services";
import type { QcStorage } from "@/lib/qc/storage";

let f: Fixture;
beforeEach(async () => { f = await fixture(); });
afterEach(() => f.client.close());
async function purchase(id: string, listing: string, workspaceId = "workspace", variant = "Blue") {
  const now = new Date();
  await f.db.insert(purchases).values({ id, workspaceId, name: `Compra ${id}`, status: "finalized", createdBy: "alice", createdAt: now, finalizedAt: now }).run();
  await f.db.insert(purchaseItems).values({ id: `${id}-item`, purchaseId: id, personId: "alice", createdBy: "alice", name: "Mesmo nome", url: `https://weidian.com/item.html?itemID=${listing}`, platform: "weidian", visualKey: "box", variant, quantity: 1, unitPriceCents: 100, cartStatus: "added", sharingMode: "equal", createdAt: now, updatedAt: now }).run();
}
const goods = (id: string, listing: string, variant = "Blue", count = 1) => ({ orderGoodsId: id, orderGoodsNo: `${id}-alt`, goodsName: "Mesmo nome", offerUrl: `https://weidian.com/item.html?itemID=${listing}`, skuInfo: variant, quantity: 1, freePhotos: Array.from({ length: count }, (_, i) => `https://scm.hubbuy.app/qc/${id}-${i}.png`) });
const payload = (...rows: ReturnType<typeof goods>[]) => ({ code: 0, data: { count: 2, list: [{ orderNo: "ORDER", goodsList: rows }] } });
function config(): NonNullable<Parameters<typeof qcServices>[2]> {
  const bytes = new Map<string, Buffer>();
  const storage: QcStorage = { put: async object => { bytes.set(object.key, object.bytes); }, head: async key => ({ exists: bytes.has(key) }), get: async key => bytes.get(key)!, delete: async key => { bytes.delete(key); }, signRead: async key => `https://private.test/${key}` };
  const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  return { managerId: "alice", storage, download: async (url: string) => Buffer.from(url), validate: async (bytes: Buffer) => ({ bytes, sha256: hash(bytes), mimeType: "image/png", extension: "png", width: 2, height: 2 }), makePreview: async (bytes: Buffer) => ({ bytes, sha256: hash(bytes), width: 2, height: 2 }) };
}

it("routes one JSON across purchases by stable listing/variant, ignores missing items and never matches names", async () => {
  await purchase("one", "101"); await purchase("two", "202");
  const service = ordersQcImport(f.db, "alice", config());
  const preview = await service.preview(payload(goods("a", "101"), goods("b", "202"), goods("missing", "999")));
  expect(preview.partial).toBe(true);
  expect(preview.rows.map(row => row.status)).toEqual(["matched", "matched", "ignored"]);
  expect(preview.rows.map(row => row.targetKey)).toEqual(["purchase:one-item", "purchase:two-item", null]);
  expect(await f.db.select().from(qcImports).all()).toHaveLength(0);
  expect(await f.db.select().from(hubbuyExternalItems).all()).toHaveLength(0);
});

it("requires explicit choice for the same listing in two purchases and rejects forged targets", async () => {
  await purchase("one", "101"); await purchase("two", "101");
  const service = ordersQcImport(f.db, "alice", config()), data = payload(goods("a", "101"));
  const preview = await service.preview(data); expect(preview.rows[0].status).toBe("ambiguous"); expect(preview.rows[0].targetKey).toBeNull();
  await expect(service.prepare(data, [{ externalKey: preview.rows[0].externalKey, targetKey: "purchase:foreign-item" }])).rejects.toMatchObject({ status: 409 });
  const prepared = await service.prepare(data, [{ externalKey: preview.rows[0].externalKey, targetKey: "purchase:two-item" }]);
  expect(prepared.groups).toHaveLength(1); expect(prepared.groups[0].purchaseId).toBe("two"); expect(prepared.groups[0].importId).toBeTruthy();
  await expect(service.prepare(data, [{ externalKey: "forged", targetKey: "purchase:one-item" }])).rejects.toMatchObject({ status: 400 });
});

it("reuses manifests and transfers, then preserves photos and a manually selected cover on reimport", async () => {
  await purchase("one", "101"); await purchase("two", "202");
  const cfg = config(), service = ordersQcImport(f.db, "alice", cfg), qc = qcServices(f.db, "alice", cfg);
  const data = payload(goods("a", "101", "Blue", 2), goods("b", "202"));
  const preview = await service.preview(data), prepared = await service.prepare(data, preview.rows.map(row => ({ externalKey: row.externalKey, targetKey: row.targetKey })));
  expect(prepared.groups).toHaveLength(2);
  for (const group of prepared.groups) { expect(group.error).toBeNull(); const result = await qc.confirmImport(group.importId!, group.revision, group.choices); await qc.runImportBatch(group.importId!, result.revision); }
  const gallery = await qc.getGallery("one", "purchase:one-item"); expect(gallery.images).toHaveLength(2);
  const presentation = (await qc.getQcPresentations("one", ["purchase:one-item"])).items[0];
  await qc.setPresentationCover("one", "purchase:one-item", gallery.images[1].id, presentation.presentationRevision);
  expect((await service.preview(data)).rows.map(row => row.status)).toEqual(["unchanged", "unchanged"]);
  expect((await qc.getQcPresentations("one", ["purchase:one-item"])).items[0].primaryImageId).toBe(gallery.images[1].id);
  expect((await qc.getGallery("one", "purchase:one-item")).images).toHaveLength(2);
});

it("enforces manager and workspace scope, rejects malformed/duplicate/unsafe source data", async () => {
  await purchase("one", "101");
  await expect(ordersQcImport(f.db, "bob", config()).preview(payload(goods("a", "101")))).rejects.toMatchObject({ status: 403 });
  await expect(ordersQcImport(f.db, "outsider", config()).capabilities()).rejects.toMatchObject({ status: 403 });
  const service = ordersQcImport(f.db, "alice", config());
  await expect(service.preview({ code: 0 })).rejects.toMatchObject({ status: 400 });
  await expect(service.preview(payload(goods("a", "101"), goods("a", "101")))).rejects.toMatchObject({ code: "QC_IMPORT_ID_CONFLICT" });
  const unsafe = goods("a", "101"); unsafe.freePhotos = ["https://evil.test/photo.png"];
  await expect(service.preview(payload(unsafe))).rejects.toMatchObject({ code: "QC_SOURCE_REJECTED" });
  const foreign = ordersQcImport(f.db, "foreign", { ...config(), managerId: "foreign" });
  expect((await foreign.preview(payload(goods("a", "101")))).rows[0].status).toBe("ignored");
});

it("prioritizes confirmed external IDs and flags conflicting aliases instead of remapping", async () => {
  await purchase("one", "101"); await purchase("two", "202");
  const cfg = config(), qc = qcServices(f.db, "alice", cfg), service = ordersQcImport(f.db, "alice", cfg);
  const initial = await qc.prepare("one", payload(goods("a", "101")));
  await qc.confirmImport(initial.importId, initial.revision, []);
  const changedListing = await service.preview(payload(goods("a", "202")));
  expect(changedListing.rows[0].targetKey).toBe("purchase:one-item");
  const conflicting = goods("a", "202"); conflicting.orderGoodsNo = "different-alias";
  const preview = await service.preview(payload(conflicting));
  expect(preview.rows[0].status).toBe("error"); expect(preview.rows[0].targetKey).toBeNull();
});

it("reports per-purchase preparation failures without associating any photos silently", async () => {
  for (let i = 0; i < 6; i++) await purchase(`purchase-${i}`, String(100 + i));
  const service = ordersQcImport(f.db, "alice", config());
  const data = payload(...Array.from({ length: 6 }, (_, i) => goods(`goods-${i}`, String(100 + i))));
  const preview = await service.preview(data);
  const prepared = await service.prepare(data, preview.rows.map(row => ({ externalKey: row.externalKey, targetKey: row.targetKey })));
  expect(prepared.groups.filter(group => !!group.importId)).toHaveLength(5);
  expect(prepared.groups.filter(group => !!group.error)).toHaveLength(1);
  expect(await f.db.select().from(hubbuyExternalItems).all()).toHaveLength(0);
});
