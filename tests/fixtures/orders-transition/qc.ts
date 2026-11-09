import sharp from "sharp";
import type { AppDatabase } from "../../../src/lib/db/connection";
import { qcServices } from "../../../src/lib/domain/qc-services";
import type { QcStorage } from "../../../src/lib/qc/storage";
import type { ScenarioIdentity } from "./compare";

export async function seedScenarioQc(db: AppDatabase, identity: ScenarioIdentity, storage: QcStorage) {
  const actor = identity.people[0];
  const qc = qcServices(db, actor, { managerId: actor, storage, download: async url => {
    const id = Number(new URL(url).pathname.match(/photo-(\d+)/)?.[1] ?? 0);
    return sharp({ create: { width: 360, height: 480, channels: 3, background: { r: 80 + id * 7 % 150, g: 100 + id * 11 % 120, b: 120 + id * 13 % 110 } } }).png().toBuffer();
  } });
  const targets = await qc.getTargets(identity.purchaseId);
  const selected = [targets.find(target => target.id.startsWith("purchase:"))!, ...targets.filter(target => ["Polo QA", "Tênis QA", "Camiseta QA", "Camiseta B QA", "Kit QA"].includes(target.name))];
  const payload = { code: 0, data: { count: 1, list: [{ orderNo: "QA-QC-ORDER", goodsList: selected.map((target, index) => ({
    orderGoodsId: `QA-QC-${index}`, offerUrl: "https://weidian.com/item.html?itemID=999999", skuInfo: "QA synthetic", goodsName: target.name, quantity: 1,
    freePhotos: Array.from({ length: index === 0 ? 14 : 2 }, (_, photo) => `https://scm.hubbuy.app/qa-synthetic/photo-${index * 20 + photo}.png`),
  })) }] } };
  const prepared = await qc.prepare(identity.purchaseId, payload);
  const confirmed = await qc.confirmImport(prepared.importId, prepared.revision, prepared.rows.map((row, index) => ({ externalKey: row.externalKey, targetKey: selected[index].id })));
  let revision = confirmed.revision;
  for (let batch = 0; batch < 20; batch++) {
    const result = await qc.runImportBatch(prepared.importId, revision);
    if (result.complete) break;
    if (result.revision === undefined) throw new Error("QC batch lost its revision.");
    revision = result.revision;
    if (batch === 19) throw new Error("Synthetic QC did not complete.");
  }
  const first = await qc.getGallery(identity.purchaseId, selected[0].id);
  const later = await qc.getGallery(identity.purchaseId, selected[0].id, 12, 12);
  if (!later.images.length) throw new Error("QC later page was not generated.");
  await qc.setPresentationCover(identity.purchaseId, selected[0].id, later.images[0].id, first.presentationRevision);
  return { targetCount: selected.length, importId: prepared.importId };
}
