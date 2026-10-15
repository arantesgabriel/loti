import { and, asc, count, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/connection";
import { hubbuyExternalItems, purchaseItems, qcEvents, qcImagePreviews, qcImageSources, qcImages, qcImports, qcPresentations, qcRateLimits, qcTransferLocks } from "../db/schema";
import { authorization } from "./authorization";
import { DomainError } from "./errors";
import { normalizeQcMatch, suggestQcMatch, type QcMatch } from "./qc-matching";
import { QC_LIMITS, QC_RATE_LIMITS, type QcRateOperation } from "./qc-limits";
import { parseHubBuyImport, type ParsedQcImport, type QcOccurrenceInput } from "./qc-validation";
import { assertQcStorageConfigured, r2QcStorage, type QcStorage } from "../qc/storage";
import { downloadHubbuyImage } from "../qc/download";
import { validateQcImage } from "../qc/image-validation";
import { validateHubbuySourceUrl } from "../qc/download";
import { generateQcPreview, QC_PREVIEW, type GeneratedQcPreview } from "../qc/preview";

type ManagerConfig = { managerId?: string | null; storage?: QcStorage; download?: typeof downloadHubbuyImage; validate?: typeof validateQcImage; makePreview?: typeof generateQcPreview; now?: () => number };
type PreviewOccurrence = { occurrence: QcOccurrenceInput; match: QcMatch; existingId: string | null; existingRevision: number | null; existingItemId: string | null; conflict?: string };
type ImportManifest = ParsedQcImport & { rows: PreviewOccurrence[] };
type RequestBudget = { deadline: number };

function occurrenceFromExternal(row: typeof hubbuyExternalItems.$inferSelect): QcOccurrenceInput {
  return {
    externalKey: `${row.orderNo ?? "order?"}:${row.orderGoodsId ? `id:${row.orderGoodsId}` : `no:${row.orderGoodsNo ?? row.id}`}`,
    orderGoodsId: row.orderGoodsId,
    orderGoodsNo: row.orderGoodsNo,
    orderNo: row.orderNo,
    offerId: row.offerId,
    channel: row.channel,
    offerUrl: row.offerUrl,
    skuInfo: row.skuInfo,
    title: row.title,
    quantity: row.quantity,
    photos: [],
  };
}

const nowDate = (fn: () => number) => new Date(fn());
const internalError = (error: unknown) => error instanceof DomainError ? error : new DomainError("Não foi possível concluir a operação QC.", 500, "QC_INTERNAL");
const uniqueError = (error: unknown) => /UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/i.test(error instanceof Error ? error.message : String(error));

export function qcServices(db: AppDatabase, userId: string, config: ManagerConfig = {}) {
  const now = config.now ?? Date.now;
  const storage = config.storage ?? r2QcStorage;
  const download = config.download ?? downloadHubbuyImage;
  const validate = config.validate ?? validateQcImage;
  const makePreview = config.makePreview ?? generateQcPreview;
  const managerId = config.managerId ?? process.env.LOTI_QC_MANAGER_USER_ID ?? null;

  function requireRequestBudget(budget: RequestBudget, operationMaximumMs: number) {
    if (budget.deadline - now() < operationMaximumMs + QC_LIMITS.requestSafetyMs) throw new DomainError("O lote QC atingiu o orçamento de tempo; a pendência pode ser retomada.", 503, "QC_REQUEST_BUDGET");
  }

  async function authorizedPurchase(purchaseId: string, manage = false) {
    const purchase = await authorization(db, userId).requirePurchase(purchaseId);
    if (purchase.status !== "finalized") throw new DomainError("O QC só pode ser gerenciado em compras finalizadas.", 409, "QC_PURCHASE_NOT_FINALIZED");
    if (manage && (!managerId || userId !== managerId)) throw new DomainError("Você não pode administrar QC.", 403, "QC_FORBIDDEN");
    return purchase;
  }

  async function rate(purchaseId: string, operation: QcRateOperation) {
    const purchase = await authorizedPurchase(purchaseId, operation !== "fallback" && operation !== "preview");
    const spec = QC_RATE_LIMITS[operation], windowStart = Math.floor(now() / spec.windowMs) * spec.windowMs;
    const scopes = operation === "fallback" ? [{ scope: `user:${userId}`, count: 60 }, { scope: `workspace:${purchase.workspaceId}`, count: 300 }] : [{ scope: `user:${userId}:workspace:${purchase.workspaceId}`, count: spec.count }];
    for (const { scope, count } of scopes) {
      const key = createHash("sha256").update(`qc:${operation}:${scope}`).digest("hex");
      await db.insert(qcRateLimits).values({ key, windowStart, count: 1 }).onConflictDoUpdate({
        target: qcRateLimits.key,
        set: {
          windowStart: sql`CASE WHEN ${qcRateLimits.windowStart} < ${windowStart} THEN ${windowStart} ELSE ${qcRateLimits.windowStart} END`,
          count: sql`CASE WHEN ${qcRateLimits.windowStart} < ${windowStart} THEN 1 ELSE ${qcRateLimits.count} + 1 END`,
        },
      }).run();
      const current = await db.select().from(qcRateLimits).where(eq(qcRateLimits.key, key)).get();
      if (current && current.count > count) {
        const seconds = Math.max(1, Math.ceil((windowStart + spec.windowMs - now()) / 1000));
        throw new DomainError(`Limite QC atingido. Tente novamente em ${seconds} s.`, 429, "QC_RATE_LIMIT");
      }
    }
    return purchase;
  }

  async function addEvent(purchaseId: string, workspaceId: string, eventType: "QC_IMPORT" | "QC_MATCH" | "QC_DELETE" | "QC_FALLBACK", resultCode: string, context: unknown) {
    await db.insert(qcEvents).values({ id: randomUUID(), workspaceId, purchaseId, actorId: userId, eventType, resultCode, contextJson: JSON.stringify(context), createdAt: nowDate(now) }).run();
  }

  async function repairPresentation(tx: Pick<AppDatabase, "select" | "insert" | "update">, purchaseId: string, itemIds: Array<string | null | undefined>, stamp = nowDate(now)) {
    const changes: { itemId: string; fromImageId: string | null; toImageId: string | null }[] = [];
    const uniqueIds = [...new Set(itemIds.filter((value): value is string => !!value))];
    for (const itemId of uniqueIds) {
      const item = await tx.select({ id: purchaseItems.id }).from(purchaseItems).where(and(eq(purchaseItems.id, itemId), eq(purchaseItems.purchaseId, purchaseId))).get();
      if (!item) continue;
      const current = await tx.select().from(qcPresentations).where(eq(qcPresentations.purchaseItemId, itemId)).get();
      if (current?.primaryImageId) {
        const valid = await tx.select({ id: qcImages.id }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).where(and(eq(qcImages.id, current.primaryImageId), eq(hubbuyExternalItems.purchaseId, purchaseId), eq(hubbuyExternalItems.purchaseItemId, itemId), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).get();
        if (valid) continue;
      }
      const fallback = await tx.select({ id: qcImages.id }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).where(and(eq(hubbuyExternalItems.purchaseId, purchaseId), eq(hubbuyExternalItems.purchaseItemId, itemId), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).orderBy(asc(qcImages.ordinal), asc(qcImages.createdAt), asc(qcImages.id)).limit(1).get();
      if (current) {
        if (current.primaryImageId === (fallback?.id ?? null)) continue;
        await tx.update(qcPresentations).set({ primaryImageId: fallback?.id ?? null, revision: current.revision + 1, updatedBy: userId, updatedAt: stamp }).where(and(eq(qcPresentations.purchaseItemId, itemId), eq(qcPresentations.revision, current.revision))).run();
        changes.push({ itemId, fromImageId: current.primaryImageId, toImageId: fallback?.id ?? null });
      } else if (fallback) {
        await tx.insert(qcPresentations).values({ purchaseItemId: itemId, primaryImageId: fallback.id, revision: 0, updatedBy: userId, updatedAt: stamp }).onConflictDoNothing().run();
      }
    }
    return changes;
  }

  async function getTargets(purchaseId: string) {
    const rows = await db.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, purchaseId)).orderBy(asc(purchaseItems.createdAt)).all();
    return rows.map(row => ({ id: row.id, name: row.name, url: row.url, variant: row.variant, quantity: row.quantity }));
  }

  async function getQcSummary(purchaseId: string) {
    await authorizedPurchase(purchaseId);
    const manage = !!managerId && managerId === userId;
    const [external, images, sources, pendingDeletes, previewWork] = await Promise.all([
      db.select().from(hubbuyExternalItems).where(eq(hubbuyExternalItems.purchaseId, purchaseId)).all(),
      db.select({ externalItemId: qcImages.externalItemId, status: qcImages.status, deleteState: qcImages.deleteState }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).where(eq(hubbuyExternalItems.purchaseId, purchaseId)).all(),
      manage ? db.select({ externalItemId: qcImageSources.externalItemId, state: qcImageSources.state }).from(qcImageSources).innerJoin(hubbuyExternalItems, eq(qcImageSources.externalItemId, hubbuyExternalItems.id)).where(eq(hubbuyExternalItems.purchaseId, purchaseId)).all() : Promise.resolve([]),
      manage ? db.select({ id: qcImages.id }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).where(and(eq(hubbuyExternalItems.purchaseId, purchaseId), eq(qcImages.status, "deleted"), eq(qcImages.deleteState, "pending"))).all() : Promise.resolve([]),
      manage ? db.select({ id: qcImages.id }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).leftJoin(qcImagePreviews, eq(qcImagePreviews.imageId, qcImages.id)).where(and(eq(hubbuyExternalItems.purchaseId, purchaseId), eq(qcImages.status, "ready"), or(isNull(qcImagePreviews.imageId), inArray(qcImagePreviews.status, ["pending", "failed"])))).all() : Promise.resolve([]),
    ]);
    const counts = new Map<string, number>();
    for (const image of images) if (image.status === "ready" && image.deleteState === "none") {
      const itemId = external.find(row => row.id === image.externalItemId)?.purchaseItemId;
      if (itemId) counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
    }
    let pendingRows: { externalItemId: string; revision: number; orderNo: string | null; orderGoodsId: string | null; orderGoodsNo: string | null; skuInfo: string | null; title: string | null; quantity: number | null; photoCount: number; candidates: QcMatch["candidates"] }[] = [];
    let pendingTransfers = 0;
    if (manage) {
      const targets = await getTargets(purchaseId);
      const targetIds = new Set(targets.map(target => target.id));
      pendingRows = external.flatMap(row => {
        if (row.purchaseItemId !== null) return [];
        const match = suggestQcMatch(occurrenceFromExternal(row), targets);
        if (match.status !== "PENDING" || match.candidates.length === 0) return [];
        const candidates = match.candidates.filter(candidate => targetIds.has(candidate.itemId));
        return candidates.length ? [{ externalItemId: row.id, revision: row.revision, orderNo: row.orderNo, orderGoodsId: row.orderGoodsId, orderGoodsNo: row.orderGoodsNo, skuInfo: row.skuInfo, title: row.title, quantity: row.quantity, photoCount: sources.filter(source => source.externalItemId === row.id).length, candidates }] : [];
      });
      const linkedExternalIds = new Set(external.filter(row => row.purchaseItemId !== null).map(row => row.id));
      pendingTransfers = sources.filter(row => linkedExternalIds.has(row.externalItemId) && (row.state === "pending" || row.state === "failed")).length;
    }
    return {
      purchaseId,
      canManage: manage,
      counts: [...counts].map(([itemId, count]) => ({ itemId, count })),
      ...(manage ? { pendingMatching: pendingRows.length, pendingRows, pendingTransfers, pendingDeletes: pendingDeletes.length, pendingPreviews: previewWork.length } : {}),
    };
  }

  async function getGallery(purchaseId: string, itemId: string, limit = 12, requestedOffset = 0, targetImageId?: string) {
    await authorizedPurchase(purchaseId);
    const item = await db.select({ id: purchaseItems.id }).from(purchaseItems).where(and(eq(purchaseItems.id, itemId), eq(purchaseItems.purchaseId, purchaseId))).get();
    if (!item) throw new DomainError("Produto não encontrado nesta compra.", 404, "QC_ITEM_NOT_FOUND");
    const safeLimit = Math.min(12, Math.max(1, limit));
    let offset = Math.max(0, requestedOffset);
    if (targetImageId) {
      const target = await db.select({ id: qcImages.id, ordinal: qcImages.ordinal, createdAt: qcImages.createdAt }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).where(and(eq(qcImages.id, targetImageId), eq(hubbuyExternalItems.purchaseId, purchaseId), eq(hubbuyExternalItems.purchaseItemId, itemId), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).get();
      if (!target) throw new DomainError("Imagem QC não encontrada para este produto.", 404, "QC_IMAGE_NOT_FOUND");
      const before = await db.select({ value: count() }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).where(and(eq(hubbuyExternalItems.purchaseId, purchaseId), eq(hubbuyExternalItems.purchaseItemId, itemId), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"), or(sql`${qcImages.ordinal} < ${target.ordinal}`, and(eq(qcImages.ordinal, target.ordinal), sql`${qcImages.createdAt} < ${target.createdAt}`), and(eq(qcImages.ordinal, target.ordinal), eq(qcImages.createdAt, target.createdAt), sql`${qcImages.id} < ${target.id}`)))).get();
      offset = Math.floor(Number(before?.value ?? 0) / safeLimit) * safeLimit;
    }
    const rows = await db.select({ image: qcImages, occurrence: sql<string>`coalesce(${hubbuyExternalItems.skuInfo}, ${hubbuyExternalItems.title}, 'Ocorrência HubBuy')` }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).where(and(eq(hubbuyExternalItems.purchaseId, purchaseId), eq(hubbuyExternalItems.purchaseItemId, itemId), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).orderBy(asc(qcImages.ordinal), asc(qcImages.createdAt), asc(qcImages.id)).limit(safeLimit).offset(offset).all();
    const totalRow = await db.select({ value: count() }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).where(and(eq(hubbuyExternalItems.purchaseId, purchaseId), eq(hubbuyExternalItems.purchaseItemId, itemId), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).get();
    const totalCount = Number(totalRow?.value ?? 0);
    const presentation = await db.select({ revision: qcPresentations.revision, imageId: sql<string | null>`CASE WHEN ${hubbuyExternalItems.id} IS NOT NULL THEN ${qcImages.id} ELSE NULL END` }).from(qcPresentations).leftJoin(qcImages, and(eq(qcPresentations.primaryImageId, qcImages.id), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).leftJoin(hubbuyExternalItems, and(eq(qcImages.externalItemId, hubbuyExternalItems.id), eq(hubbuyExternalItems.purchaseId, purchaseId), eq(hubbuyExternalItems.purchaseItemId, itemId))).where(eq(qcPresentations.purchaseItemId, itemId)).get();
    const imageIds = rows.map(row => row.image.id);
    const previews = imageIds.length ? await db.select({ imageId: qcImagePreviews.imageId }).from(qcImagePreviews).where(and(inArray(qcImagePreviews.imageId, imageIds), eq(qcImagePreviews.status, "ready"), eq(qcImagePreviews.deleteState, "none"))).all() : [];
    const previewIds = new Set(previews.map(row => row.imageId));
    const manage = !!managerId && managerId === userId;
    return { itemId, pageOffset: offset, totalCount, presentationRevision: presentation?.revision ?? 0, primaryImageId: presentation?.imageId ?? null, canSetCover: manage, images: rows.map(row => ({ id: row.image.id, previewUrl: previewIds.has(row.image.id) ? `/api/qc/images/${encodeURIComponent(row.image.id)}/preview` : null, width: row.image.width, height: row.image.height, occurrence: row.occurrence })), nextOffset: offset + rows.length < totalCount ? offset + rows.length : null };
  }

  async function getQcPresentations(purchaseId: string, itemIds: string[]) {
    await authorizedPurchase(purchaseId);
    if (!Array.isArray(itemIds) || itemIds.length > 20 || itemIds.some(id => typeof id !== "string" || !id || id.length > 200) || new Set(itemIds).size !== itemIds.length) throw new DomainError("A solicitação de capas QC deve conter até 20 produtos distintos.", 400, "QC_PRESENTATION_BATCH_INVALID");
    if (!itemIds.length) return { purchaseId, items: [] };
    const owned = await db.select({ id: purchaseItems.id }).from(purchaseItems).where(and(eq(purchaseItems.purchaseId, purchaseId), inArray(purchaseItems.id, itemIds))).all();
    if (owned.length !== itemIds.length) throw new DomainError("Um produto não pertence a esta compra.", 404, "QC_ITEM_NOT_FOUND");
    const counts = await db.select({ itemId: hubbuyExternalItems.purchaseItemId, total: count() }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).where(and(eq(hubbuyExternalItems.purchaseId, purchaseId), inArray(hubbuyExternalItems.purchaseItemId, itemIds), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).groupBy(hubbuyExternalItems.purchaseItemId).all();
    const coverRows = await db.select({
      itemId: qcPresentations.purchaseItemId,
      revision: qcPresentations.revision,
      imageId: sql<string | null>`CASE WHEN ${hubbuyExternalItems.id} IS NOT NULL THEN ${qcImages.id} ELSE NULL END`,
      width: qcImages.width,
      height: qcImages.height,
      occurrence: sql<string>`coalesce(${hubbuyExternalItems.skuInfo}, ${hubbuyExternalItems.title}, 'Ocorrência HubBuy')`,
    }).from(qcPresentations)
      .leftJoin(qcImages, and(eq(qcPresentations.primaryImageId, qcImages.id), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none")))
      .leftJoin(hubbuyExternalItems, and(eq(qcImages.externalItemId, hubbuyExternalItems.id), eq(hubbuyExternalItems.purchaseId, purchaseId), eq(hubbuyExternalItems.purchaseItemId, qcPresentations.purchaseItemId)))
      .where(inArray(qcPresentations.purchaseItemId, itemIds)).all();
    const idsSql = sql.join(itemIds.map(id => sql`${id}`), sql`, `);
    const previewRows = await db.all(sql<{ purchase_item_id: string; image_id: string; width: number | null; height: number | null; occurrence: string }>`WITH ranked AS (
      SELECT h.purchase_item_id, q.id AS image_id, q.width, q.height, coalesce(h.sku_info, h.title, 'Ocorrência HubBuy') AS occurrence,
        row_number() OVER (PARTITION BY h.purchase_item_id ORDER BY q.ordinal, q.created_at, q.id) AS row_number
      FROM qc_images q JOIN hubbuy_external_items h ON h.id = q.external_item_id
      JOIN qc_image_previews p ON p.image_id = q.id AND p.status = 'ready' AND p.delete_state = 'none'
      WHERE h.purchase_id = ${purchaseId} AND h.purchase_item_id IN (${idsSql}) AND q.status = 'ready' AND q.delete_state = 'none'
    ) SELECT purchase_item_id, image_id, width, height, occurrence FROM ranked WHERE row_number <= 3 ORDER BY purchase_item_id, row_number`) as { purchase_item_id: string; image_id: string; width: number | null; height: number | null; occurrence: string }[];
    const countsByItem = new Map(counts.map(row => [row.itemId!, Number(row.total)]));
    const covers = new Map(coverRows.map(row => [row.itemId, { revision: row.revision, imageId: row.imageId }]));
    const coverImageIds = [...new Set(coverRows.flatMap(row => row.imageId ? [row.imageId] : []))];
    const readyCoverIds = coverImageIds.length ? await db.select({ imageId: qcImagePreviews.imageId }).from(qcImagePreviews).where(and(inArray(qcImagePreviews.imageId, coverImageIds), eq(qcImagePreviews.status, "ready"), eq(qcImagePreviews.deleteState, "none"))).all() : [];
    const readyCoverIdSet = new Set(readyCoverIds.map(row => row.imageId));
    const previewsByItem = new Map<string, typeof previewRows>();
    for (const row of previewRows) {
      const list = previewsByItem.get(row.purchase_item_id) ?? [];
      list.push(row); previewsByItem.set(row.purchase_item_id, list);
    }
    const canSetCover = !!managerId && managerId === userId;
    return { purchaseId, items: itemIds.map(itemId => {
      const previews = previewsByItem.get(itemId) ?? [];
      const total = countsByItem.get(itemId) ?? 0;
      const cover = covers.get(itemId);
      const selectedCover = coverRows.find(row => row.itemId === itemId && row.imageId === cover?.imageId);
      return { purchaseItemId: itemId, qcCount: total, primaryImageId: cover?.imageId ?? null, presentationRevision: cover?.revision ?? 0, coverPreview: cover?.imageId && readyCoverIdSet.has(cover.imageId) && selectedCover ? { imageId: cover.imageId, previewUrl: `/api/qc/images/${encodeURIComponent(cover.imageId)}/preview`, occurrence: selectedCover.occurrence, width: selectedCover.width, height: selectedCover.height } : null, canSetCover, previews: previews.map(row => ({ imageId: row.image_id, previewUrl: `/api/qc/images/${encodeURIComponent(row.image_id)}/preview`, occurrence: row.occurrence, width: row.width, height: row.height })), remainingCount: Math.max(0, total - previews.length) };
    }) };
  }

  async function getOriginalSource(imageId: string) {
    const image = await db.select().from(qcImages).where(and(eq(qcImages.id, imageId), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).get();
    const external = image ? await db.select().from(hubbuyExternalItems).where(eq(hubbuyExternalItems.id, image.externalItemId)).get() : null;
    if (!image || !external?.purchaseItemId) throw new DomainError("Imagem QC não encontrada.", 404, "QC_IMAGE_NOT_FOUND");
    await rate(external.purchaseId, "preview");
    const sources = await db.select({ sourceUrl: qcImageSources.sourceUrl }).from(qcImageSources).where(and(eq(qcImageSources.imageId, imageId), eq(qcImageSources.state, "ready"))).orderBy(asc(qcImageSources.createdAt)).limit(1).get();
    return { sourceUrl: validateHubbuySourceUrl(sources?.sourceUrl ?? image.sourceUrl).toString() };
  }

  async function getPreview(imageId: string) {
    const image = await db.select().from(qcImages).where(and(eq(qcImages.id, imageId), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).get();
    const external = image ? await db.select().from(hubbuyExternalItems).where(eq(hubbuyExternalItems.id, image.externalItemId)).get() : null;
    if (!image || !external?.purchaseItemId) throw new DomainError("Preview QC não encontrado.", 404, "QC_IMAGE_NOT_FOUND");
    await rate(external.purchaseId, "preview");
    const preview = await db.select().from(qcImagePreviews).where(and(eq(qcImagePreviews.imageId, imageId), eq(qcImagePreviews.status, "ready"), eq(qcImagePreviews.deleteState, "none"))).get();
    if (!preview || !preview.sha256 || !preview.byteSize) throw new DomainError("Preview QC ainda não está disponível.", 404, "QC_PREVIEW_NOT_FOUND");
    const bytes = await storage.get(preview.r2Key, QC_PREVIEW.maxBytes);
    if (bytes.byteLength !== preview.byteSize || createHash("sha256").update(bytes).digest("hex") !== preview.sha256) throw new DomainError("O preview QC falhou na verificação de integridade.", 502, "QC_PREVIEW_INVALID");
    return bytes;
  }

  async function setPresentationCover(purchaseId: string, itemId: string, imageId: string, expectedRevision: number) {
    const purchase = await authorizedPurchase(purchaseId, true);
    const validImage = await db.select({ id: qcImages.id }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).where(and(eq(qcImages.id, imageId), eq(hubbuyExternalItems.purchaseId, purchaseId), eq(hubbuyExternalItems.purchaseItemId, itemId), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).get();
    if (!validImage) throw new DomainError("Escolha uma foto QC disponível deste produto.", 422, "QC_COVER_IMAGE_INVALID");
    const stamp = nowDate(now);
    await db.transaction(async tx => {
      await authorization(tx, userId).requirePurchase(purchaseId);
      const item = await tx.select({ id: purchaseItems.id }).from(purchaseItems).where(and(eq(purchaseItems.id, itemId), eq(purchaseItems.purchaseId, purchaseId))).get();
      if (!item) throw new DomainError("Produto não encontrado nesta compra.", 404, "QC_ITEM_NOT_FOUND");
      const current = await tx.select().from(qcPresentations).where(eq(qcPresentations.purchaseItemId, itemId)).get();
      const revision = current?.revision ?? 0;
      if (revision !== expectedRevision) throw new DomainError("A capa mudou. Atualize a galeria e tente novamente.", 409, "QC_REVISION_CONFLICT");
      const stillValid = await tx.select({ id: qcImages.id }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).where(and(eq(qcImages.id, imageId), eq(hubbuyExternalItems.purchaseId, purchaseId), eq(hubbuyExternalItems.purchaseItemId, itemId), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).get();
      if (!stillValid) throw new DomainError("A foto QC mudou antes de salvar a capa.", 409, "QC_COVER_IMAGE_INVALID");
      if (current) {
        const changed = await tx.update(qcPresentations).set({ primaryImageId: imageId, revision: revision + 1, updatedBy: userId, updatedAt: stamp }).where(and(eq(qcPresentations.purchaseItemId, itemId), eq(qcPresentations.revision, revision))).returning({ revision: qcPresentations.revision }).get();
        if (!changed) throw new DomainError("A capa mudou em outra solicitação.", 409, "QC_REVISION_CONFLICT");
      } else {
        await tx.insert(qcPresentations).values({ purchaseItemId: itemId, primaryImageId: imageId, revision: 1, updatedBy: userId, updatedAt: stamp }).run();
      }
      await tx.insert(qcEvents).values({ id: randomUUID(), workspaceId: purchase.workspaceId, purchaseId, actorId: userId, eventType: "QC_MATCH", resultCode: "COVER_SET", contextJson: JSON.stringify({ itemId, imageId, previousImageId: current?.primaryImageId ?? null, revision: revision + 1 }), createdAt: stamp }).run();
    });
    return { purchaseItemId: itemId, primaryImageId: imageId, revision: expectedRevision + 1 };
  }

  async function prepare(purchaseId: string, raw: unknown) {
    const purchase = await rate(purchaseId, "prepare");
    const parsed = parseHubBuyImport(raw);
    const targets = await getTargets(purchaseId);
    const existing = await db.select().from(hubbuyExternalItems).where(eq(hubbuyExternalItems.purchaseId, purchaseId)).all();
    const rows: PreviewOccurrence[] = parsed.occurrences.map(occurrence => {
      const main = occurrence.orderGoodsId ? existing.filter(row => row.orderNo === occurrence.orderNo && row.orderGoodsId === occurrence.orderGoodsId) : [];
      const alternate = occurrence.orderGoodsNo ? existing.filter(row => row.orderNo === occurrence.orderNo && row.orderGoodsNo === occurrence.orderGoodsNo) : [];
      const combined = [...new Map([...main, ...alternate].map(row => [row.id, row])).values()];
      const conflicting = combined.length > 1 || main.some(row => row.orderGoodsNo && occurrence.orderGoodsNo && row.orderGoodsNo !== occurrence.orderGoodsNo) || alternate.some(row => row.orderGoodsId && occurrence.orderGoodsId && row.orderGoodsId !== occurrence.orderGoodsId);
      if (conflicting) return { occurrence, match: { status: "IGNORED", targetItemId: null, candidates: [] }, existingId: null, existingRevision: null, existingItemId: null, conflict: "IDs HubBuy conflitantes" };
      const found = combined[0];
      const match = suggestQcMatch(occurrence, targets, found?.purchaseItemId);
      return { occurrence, match, existingId: found?.id ?? null, existingRevision: found?.revision ?? null, existingItemId: found?.purchaseItemId ?? null };
    });
    const manifest: ImportManifest = { ...parsed, rows };
    const id = randomUUID(), date = nowDate(now), expires = new Date(now() + QC_LIMITS.manifestMs);
    const json = JSON.stringify(manifest);
    if (Buffer.byteLength(json, "utf8") > QC_LIMITS.bodyBytes) throw new DomainError("O manifesto QC excede 1 MiB.", 413, "QC_BODY_LIMIT");
    await db.transaction(async tx => {
      await tx.insert(qcImports).values({ id, workspaceId: purchase.workspaceId, purchaseId, actorId: userId, manifestJson: json, status: "prepared", revision: 0, bytesReserved: 0, bytesConsumed: 0, expiresAt: expires, createdAt: date, updatedAt: date }).run();
      await tx.insert(qcEvents).values({ id: randomUUID(), workspaceId: purchase.workspaceId, purchaseId, actorId: userId, eventType: "QC_IMPORT", resultCode: "PREPARED", contextJson: JSON.stringify({ importId: id, orders: parsed.orderCount, occurrences: rows.length, photos: parsed.photoCount }), createdAt: date }).run();
    });
    return { importId: id, revision: 0, expiresAt: expires.toISOString(), partial: parsed.partial, orderCount: parsed.orderCount, photoCount: parsed.photoCount, rows: rows.map(row => ({ externalKey: row.occurrence.externalKey, orderNo: row.occurrence.orderNo, orderGoodsId: row.occurrence.orderGoodsId, orderGoodsNo: row.occurrence.orderGoodsNo, offerId: row.occurrence.offerId, skuInfo: row.occurrence.skuInfo, title: row.occurrence.title, quantity: row.occurrence.quantity, photoCount: row.occurrence.photos.length, match: row.match, existingItemId: row.existingItemId, conflict: row.conflict ?? null })) };
  }

  async function getImport(importId: string) {
    const row = await db.select().from(qcImports).where(eq(qcImports.id, importId)).get();
    if (!row) throw new DomainError("Importação QC não encontrada.", 404, "QC_IMPORT_NOT_FOUND");
    await authorizedPurchase(row.purchaseId, true);
    const manifest = JSON.parse(row.manifestJson) as ImportManifest;
    manifest.rows = manifest.rows.map(entry => ({ ...entry, match: normalizeQcMatch(entry.match) }));
    return { importId: row.id, purchaseId: row.purchaseId, revision: row.revision, status: row.status, expiresAt: row.expiresAt, bytesReserved: row.bytesReserved, bytesConsumed: row.bytesConsumed, rows: manifest.rows.map(entry => ({ externalKey: entry.occurrence.externalKey, skuInfo: entry.occurrence.skuInfo, title: entry.occurrence.title, photoCount: entry.occurrence.photos.length, match: normalizeQcMatch(entry.match), conflict: entry.conflict ?? null })) };
  }

  async function confirmImport(importId: string, expectedRevision: number, choices: Array<{ externalKey: string; purchaseItemId: string | null; correctExisting?: boolean; expectedItemId?: string | null }>) {
    const row = await db.select().from(qcImports).where(eq(qcImports.id, importId)).get();
    if (!row) throw new DomainError("Importação QC não encontrada.", 404, "QC_IMPORT_NOT_FOUND");
    const purchase = await rate(row.purchaseId, "match");
    const current = nowDate(now);
    if (row.status !== "prepared" || !row.expiresAt || row.expiresAt.getTime() <= now()) throw new DomainError("A prévia expirou ou já foi confirmada. Prepare o JSON novamente.", 409, "QC_IMPORT_EXPIRED");
    if (row.revision !== expectedRevision) throw new DomainError("A prévia ficou desatualizada. Atualize e revise novamente.", 409, "QC_REVISION_CONFLICT");
    const manifest = JSON.parse(row.manifestJson) as ImportManifest;
    manifest.rows = manifest.rows.map(entry => ({ ...entry, match: normalizeQcMatch(entry.match) }));
    if (choices.length > manifest.rows.length || new Set(choices.map(choice => choice.externalKey)).size !== choices.length || choices.some(choice => !manifest.rows.some(entry => entry.occurrence.externalKey === choice.externalKey))) throw new DomainError("Escolhas QC duplicadas ou excessivas.", 400, "QC_MATCH_INVALID");
    const choicesByKey = new Map(choices.map(choice => [choice.externalKey, choice]));
    const targets = await db.select({ id: purchaseItems.id }).from(purchaseItems).where(eq(purchaseItems.purchaseId, row.purchaseId)).all();
    const allowedTargetIds = new Set(targets.map(target => target.id));
    const destinationIds = choices.map(choice => choice.purchaseItemId).filter((id): id is string => id !== null);
    if (destinationIds.some(id => !allowedTargetIds.has(id))) throw new DomainError("O produto selecionado não pertence a esta compra.", 403, "QC_ITEM_CROSS_PURCHASE");
    const result = { linked: 0, pendingMatching: 0, ignored: 0, sources: 0, eligibleSources: 0, corrected: 0 };
    const lock = await acquireLock(purchase.workspaceId);
    try { await db.transaction(async tx => {
      const activeLock = await tx.select().from(qcTransferLocks).where(eq(qcTransferLocks.scope, lock.scope)).get();
      if (activeLock?.ownerId !== lock.ownerId || activeLock.version !== lock.version || activeLock.leaseUntil <= now()) throw new DomainError("A operação QC perdeu sua concessão antes de confirmar os vínculos.", 409, "QC_TRANSFER_LEASE_LOST");
      const fresh = await tx.select().from(qcImports).where(eq(qcImports.id, importId)).get();
      if (!fresh || fresh.revision !== expectedRevision || fresh.status !== "prepared") throw new DomainError("A prévia foi alterada em outra solicitação.", 409, "QC_REVISION_CONFLICT");
      await authorization(tx, userId).requirePurchase(row.purchaseId);
      for (const entry of manifest.rows) {
        const choice = choicesByKey.get(entry.occurrence.externalKey);
        const match = normalizeQcMatch(entry.match);
        const destinationId = choice ? choice.purchaseItemId : match.targetItemId;
        if (entry.conflict) {
          if (!choice) throw new DomainError("Confirme explicitamente o descarte da ocorrência conflitante.", 409, "QC_EXTERNAL_CONFLICT");
          if (destinationId) throw new DomainError("Resolva o conflito de identificadores HubBuy antes de associar.", 409, "QC_EXTERNAL_CONFLICT");
          result.ignored++;
          continue;
        }
        if (!entry.existingId) {
          const aliases = [entry.occurrence.orderGoodsId, entry.occurrence.orderGoodsNo].filter((value): value is string => !!value).flatMap(value => [eq(hubbuyExternalItems.orderGoodsId, value), eq(hubbuyExternalItems.orderGoodsNo, value)]);
          const orderCondition = entry.occurrence.orderNo === null ? isNull(hubbuyExternalItems.orderNo) : eq(hubbuyExternalItems.orderNo, entry.occurrence.orderNo);
          const appearedAfterPreview = await tx.select({ id: hubbuyExternalItems.id }).from(hubbuyExternalItems).where(and(eq(hubbuyExternalItems.purchaseId, row.purchaseId), orderCondition, or(...aliases))).get();
          if (appearedAfterPreview) throw new DomainError("A ocorrência mudou desde a prévia. Analise o JSON novamente antes de confirmar.", 409, "QC_REVISION_CONFLICT");
        }
        const currentExternal = entry.existingId ? await tx.select().from(hubbuyExternalItems).where(eq(hubbuyExternalItems.id, entry.existingId)).get() : null;
        if (entry.existingId && entry.existingRevision !== null) {
          if (!currentExternal || currentExternal.revision !== entry.existingRevision) throw new DomainError("A ocorrência HubBuy mudou desde a prévia.", 409, "QC_REVISION_CONFLICT");
          if (currentExternal.purchaseItemId !== destinationId && currentExternal.purchaseItemId !== null) {
            if (!choice?.correctExisting || choice.expectedItemId !== currentExternal.purchaseItemId) throw new DomainError("Corrigir um vínculo existente exige confirmação explícita e revisão atual.", 409, "QC_REMAP_CONFIRMATION_REQUIRED");
            result.corrected++;
          }
        }
        if (match.status === "IGNORED") {
          if (destinationId) throw new DomainError("Esta ocorrência não possui candidatos seguros para associação.", 422, "QC_MATCH_INVALID");
          // A legacy ignored row can already have an unlinked occurrence and
          // source records. Leave those tombstone/history records intact, but
          // never add new irrelevant rows or let them become transfer work.
          result.ignored++;
          continue;
        }
        if (match.status === "PENDING" && destinationId && !match.candidates.some(candidate => candidate.itemId === destinationId)) throw new DomainError("Escolha um dos produtos candidatos desta ocorrência.", 422, "QC_MATCH_INVALID");
        const pendingMatch = match.status === "PENDING" && match.candidates.length > 0;
        const explicitUnlink = currentExternal?.purchaseItemId !== null && currentExternal?.purchaseItemId !== undefined && destinationId === null && !!choice?.correctExisting;
        if (!destinationId && !pendingMatch && !explicitUnlink) {
          result.ignored++;
          continue;
        }
        let externalId = entry.existingId;
        const externalValues = { orderGoodsId: entry.occurrence.orderGoodsId ?? currentExternal?.orderGoodsId ?? null, orderGoodsNo: entry.occurrence.orderGoodsNo ?? currentExternal?.orderGoodsNo ?? null, orderNo: entry.occurrence.orderNo, offerId: entry.occurrence.offerId ?? currentExternal?.offerId ?? null, channel: entry.occurrence.channel ?? currentExternal?.channel ?? null, offerUrl: entry.occurrence.offerUrl ?? currentExternal?.offerUrl ?? null, skuInfo: entry.occurrence.skuInfo ?? currentExternal?.skuInfo ?? null, title: entry.occurrence.title ?? currentExternal?.title ?? null, quantity: entry.occurrence.quantity ?? currentExternal?.quantity ?? null, purchaseItemId: destinationId, confirmedBy: destinationId ? userId : null, confirmedAt: destinationId ? current : null, updatedAt: current };
        if (externalId) {
          const updated = await tx.update(hubbuyExternalItems).set({ ...externalValues, revision: entry.existingRevision! + 1 }).where(and(eq(hubbuyExternalItems.id, externalId), eq(hubbuyExternalItems.revision, entry.existingRevision!))).returning({ id: hubbuyExternalItems.id }).get();
          if (!updated) throw new DomainError("Conflito ao salvar a ocorrência HubBuy.", 409, "QC_REVISION_CONFLICT");
        } else {
          externalId = randomUUID();
          try { await tx.insert(hubbuyExternalItems).values({ id: externalId, workspaceId: purchase.workspaceId, purchaseId: row.purchaseId, ...externalValues, revision: 0, createdAt: current }).run(); }
          catch (error) { if (uniqueError(error)) throw new DomainError("Esta ocorrência HubBuy já foi importada com identificadores diferentes.", 409, "QC_EXTERNAL_CONFLICT"); throw error; }
        }
        await repairPresentation(tx, row.purchaseId, [currentExternal?.purchaseItemId, destinationId], current);
        if (destinationId) result.linked++; else if (pendingMatch) result.pendingMatching++; else result.ignored++;
        if (entry.existingItemId !== destinationId || !entry.existingId) await tx.insert(qcEvents).values({ id: randomUUID(), workspaceId: purchase.workspaceId, purchaseId: row.purchaseId, actorId: userId, eventType: "QC_MATCH", resultCode: entry.existingItemId ? "CORRECTED" : destinationId ? "LINKED" : pendingMatch ? "PENDING" : "IGNORED", contextJson: JSON.stringify({ externalItemId: externalId, fromItemId: entry.existingItemId, toItemId: destinationId }), createdAt: current }).run();
        if (!destinationId && !pendingMatch) continue;
        for (const photo of entry.occurrence.photos) {
          const prior = await tx.select().from(qcImageSources).where(and(eq(qcImageSources.externalItemId, externalId), eq(qcImageSources.sourceUrlHash, photo.urlHash))).get();
          if (prior) {
            if (prior.state === "ready" || prior.state === "deleted") continue;
            if (prior.importId === importId) {
              if (destinationId && (prior.state === "pending" || prior.state === "failed")) result.eligibleSources++;
              continue;
            }
            const priorImage = prior.imageId ? await tx.select().from(qcImages).where(eq(qcImages.id, prior.imageId)).get() : null;
            if (priorImage?.status === "deleted") {
              await tx.update(qcImageSources).set({ state: "deleted", updatedAt: current }).where(eq(qcImageSources.id, prior.id)).run();
              continue;
            }
            if (priorImage?.status === "ready") {
              await tx.update(qcImageSources).set({ state: "ready", updatedAt: current }).where(eq(qcImageSources.id, prior.id)).run();
              continue;
            }
            if (priorImage?.claimToken && priorImage.claimExpiresAt && priorImage.claimExpiresAt.getTime() > now()) throw new DomainError("A mesma foto está em processamento; tente confirmar a nova seleção novamente.", 409, "QC_IMAGE_BUSY");
            // Moving a retry to a smaller manifest preserves all spend on the old
            // manifest. Any unsettled reservation is charged there conservatively.
            if (prior.bytesReserved > 0 && prior.importId) {
              await tx.update(qcImports).set({ bytesReserved: sql`max(0, ${qcImports.bytesReserved} - ${prior.bytesReserved})`, bytesConsumed: sql`${qcImports.bytesConsumed} + ${prior.bytesReserved}`, updatedAt: current }).where(eq(qcImports.id, prior.importId)).run();
            }
            await tx.update(qcImageSources).set({ importId, state: "pending", bytesReserved: 0, bytesConsumed: 0, errorCode: null, updatedAt: current }).where(eq(qcImageSources.id, prior.id)).run();
            result.sources++;
            if (destinationId) result.eligibleSources++;
            continue;
          }
          await tx.insert(qcImageSources).values({ id: randomUUID(), importId, externalItemId: externalId, imageId: null, sourceUrl: photo.url, sourceUrlHash: photo.urlHash, ordinal: photo.ordinal, state: "pending", attempts: 0, bytesReserved: 0, bytesConsumed: 0, errorCode: null, createdAt: current, updatedAt: current }).run();
          result.sources++;
          if (destinationId) result.eligibleSources++;
        }
      }
      const updated = await tx.update(qcImports).set({ status: "confirmed", revision: expectedRevision + 1, updatedAt: current }).where(and(eq(qcImports.id, importId), eq(qcImports.revision, expectedRevision))).returning({ id: qcImports.id }).get();
      if (!updated) throw new DomainError("A importação foi alterada em outra solicitação.", 409, "QC_REVISION_CONFLICT");
      await tx.insert(qcEvents).values({ id: randomUUID(), workspaceId: purchase.workspaceId, purchaseId: row.purchaseId, actorId: userId, eventType: "QC_IMPORT", resultCode: "CONFIRMED", contextJson: JSON.stringify({ importId, linked: result.linked, ignored: result.ignored, sources: result.sources }), createdAt: current }).run();
    }); } finally { await releaseLock(lock); }
    return { importId, revision: expectedRevision + 1, ...result, partial: manifest.partial };
  }

  async function resolvePendingOccurrence(purchaseId: string, externalItemId: string, expectedRevision: number, purchaseItemId: string) {
    const purchase = await rate(purchaseId, "match");
    const lock = await acquireLock(purchase.workspaceId);
    try {
      return await db.transaction(async tx => {
        const activeLock = await tx.select().from(qcTransferLocks).where(eq(qcTransferLocks.scope, lock.scope)).get();
        if (activeLock?.ownerId !== lock.ownerId || activeLock.version !== lock.version || activeLock.leaseUntil <= now()) throw new DomainError("A operação QC perdeu sua concessão antes de confirmar o vínculo.", 409, "QC_TRANSFER_LEASE_LOST");
        await authorization(tx, userId).requirePurchase(purchaseId);
        const external = await tx.select().from(hubbuyExternalItems).where(and(eq(hubbuyExternalItems.id, externalItemId), eq(hubbuyExternalItems.purchaseId, purchaseId))).get();
        if (!external) throw new DomainError("Ocorrência HubBuy não encontrada nesta compra.", 404, "QC_EXTERNAL_NOT_FOUND");
        if (external.revision !== expectedRevision || external.purchaseItemId !== null) throw new DomainError("A ocorrência mudou desde que as pendências foram carregadas.", 409, "QC_REVISION_CONFLICT");
        const target = await tx.select({ id: purchaseItems.id }).from(purchaseItems).where(and(eq(purchaseItems.id, purchaseItemId), eq(purchaseItems.purchaseId, purchaseId))).get();
        if (!target) throw new DomainError("O produto selecionado não pertence a esta compra.", 403, "QC_ITEM_CROSS_PURCHASE");
        const targets = await tx.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, purchaseId)).orderBy(asc(purchaseItems.createdAt)).all();
        const match = suggestQcMatch(occurrenceFromExternal(external), targets.map(item => ({ id: item.id, name: item.name, url: item.url, variant: item.variant, quantity: item.quantity })));
        if (match.status !== "PENDING" || match.candidates.length === 0) throw new DomainError("Esta ocorrência já não possui candidatos de associação pendentes.", 409, "QC_MATCH_NOT_PENDING");
        if (!match.candidates.some(candidate => candidate.itemId === purchaseItemId)) throw new DomainError("Escolha um dos produtos candidatos desta ocorrência.", 422, "QC_MATCH_INVALID");
        const stamp = nowDate(now);
        const updated = await tx.update(hubbuyExternalItems).set({ purchaseItemId, confirmedBy: userId, confirmedAt: stamp, revision: expectedRevision + 1, updatedAt: stamp }).where(and(eq(hubbuyExternalItems.id, externalItemId), eq(hubbuyExternalItems.purchaseId, purchaseId), eq(hubbuyExternalItems.revision, expectedRevision), isNull(hubbuyExternalItems.purchaseItemId))).returning({ id: hubbuyExternalItems.id, revision: hubbuyExternalItems.revision }).get();
        if (!updated) throw new DomainError("A ocorrência mudou em outra solicitação.", 409, "QC_REVISION_CONFLICT");
        await repairPresentation(tx, purchaseId, [purchaseItemId], stamp);
        await tx.insert(qcEvents).values({ id: randomUUID(), workspaceId: purchase.workspaceId, purchaseId, actorId: userId, eventType: "QC_MATCH", resultCode: "RESOLVED", contextJson: JSON.stringify({ externalItemId, fromItemId: null, toItemId: purchaseItemId }), createdAt: stamp }).run();
        const pendingSources = await tx.select({ id: qcImageSources.id }).from(qcImageSources).where(and(eq(qcImageSources.externalItemId, externalItemId), inArray(qcImageSources.state, ["pending", "failed"]))).all();
        return { externalItemId, purchaseItemId, revision: updated.revision, pendingSources: pendingSources.length };
      });
    } finally { await releaseLock(lock); }
  }

  async function acquireLock(workspaceId: string) {
    const ownerId = randomUUID(), leaseUntil = now() + QC_LIMITS.lockMs, current = nowDate(now);
    const acquired = await db.insert(qcTransferLocks).values({ scope: workspaceId, ownerId, version: 1, leaseUntil, updatedAt: current }).onConflictDoUpdate({
      target: qcTransferLocks.scope,
      set: { ownerId, version: sql`${qcTransferLocks.version} + 1`, leaseUntil, updatedAt: current },
      setWhere: lte(qcTransferLocks.leaseUntil, now()),
    }).returning({ ownerId: qcTransferLocks.ownerId, version: qcTransferLocks.version }).get();
    if (!acquired || acquired.ownerId !== ownerId) throw new DomainError("Há uma transferência QC ativa neste espaço.", 409, "QC_TRANSFER_ACTIVE");
    return { scope: workspaceId, ownerId, version: acquired.version };
  }

  async function assertLock(lock: { scope: string; ownerId: string; version: number }) {
    const current = await db.select().from(qcTransferLocks).where(eq(qcTransferLocks.scope, lock.scope)).get();
    if (!current || current.ownerId !== lock.ownerId || current.version !== lock.version || current.leaseUntil <= now()) throw new DomainError("A operação QC perdeu sua concessão compartilhada.", 409, "QC_TRANSFER_LEASE_LOST");
  }

  async function releaseLock(lock: { scope: string; ownerId: string; version: number }) {
    await db.update(qcTransferLocks).set({ leaseUntil: 0, updatedAt: nowDate(now) }).where(and(eq(qcTransferLocks.scope, lock.scope), eq(qcTransferLocks.ownerId, lock.ownerId), eq(qcTransferLocks.version, lock.version))).run();
  }

  async function markSourceFailure(sourceId: string, errorCode: string, uncertain = false) {
    await db.transaction(async tx => {
      const source = await tx.select().from(qcImageSources).where(eq(qcImageSources.id, sourceId)).get();
      if (!source || source.state === "deleted" || source.state === "ready") return;
      if (source.bytesReserved > 0 && source.importId) {
        const charge = source.bytesReserved;
        await tx.update(qcImports).set({ bytesReserved: sql`max(0, ${qcImports.bytesReserved} - ${charge})`, bytesConsumed: sql`${qcImports.bytesConsumed} + ${charge}`, updatedAt: nowDate(now) }).where(eq(qcImports.id, source.importId)).run();
        await tx.update(qcImageSources).set({ bytesReserved: 0, bytesConsumed: source.bytesConsumed + charge, state: uncertain ? "pending" : "failed", errorCode: uncertain ? "QC_PENDING_RECOVERY" : errorCode, updatedAt: nowDate(now) }).where(eq(qcImageSources.id, sourceId)).run();
      } else await tx.update(qcImageSources).set({ state: uncertain ? "pending" : "failed", errorCode: uncertain ? "QC_PENDING_RECOVERY" : errorCode, updatedAt: nowDate(now) }).where(eq(qcImageSources.id, sourceId)).run();
    });
  }

  async function accountReservation(sourceId: string, consumed: number) {
    await db.transaction(async tx => {
      const source = await tx.select().from(qcImageSources).where(eq(qcImageSources.id, sourceId)).get();
      if (!source || source.bytesReserved <= 0) return;
      const charge = Math.min(source.bytesReserved, Math.max(0, consumed));
      if (source.importId) await tx.update(qcImports).set({ bytesReserved: sql`max(0, ${qcImports.bytesReserved} - ${source.bytesReserved})`, bytesConsumed: sql`${qcImports.bytesConsumed} + ${charge}`, updatedAt: nowDate(now) }).where(eq(qcImports.id, source.importId)).run();
      await tx.update(qcImageSources).set({ bytesReserved: 0, bytesConsumed: source.bytesConsumed + charge, updatedAt: nowDate(now) }).where(and(eq(qcImageSources.id, sourceId), eq(qcImageSources.bytesReserved, source.bytesReserved))).run();
    });
  }

  async function reserveBytes(sourceId: string, expected: number) {
    await db.transaction(async tx => {
      const source = await tx.select().from(qcImageSources).where(eq(qcImageSources.id, sourceId)).get();
      if (!source || source.state === "deleted" || source.state === "ready") throw new DomainError("A fonte QC não está disponível para transferência.", 409, "QC_SOURCE_STATE");
      const previousReservation = source.bytesReserved;
      if (source.importId) {
        const manifest = await tx.select().from(qcImports).where(eq(qcImports.id, source.importId)).get();
        if (!manifest || manifest.bytesConsumed + manifest.bytesReserved + expected > QC_LIMITS.importBytes) throw new DomainError("A importação atingiu o limite acumulado de 200 MiB; selecione menos fotos numa nova importação.", 413, "QC_IMPORT_BYTES_LIMIT");
        await tx.update(qcImports).set({ bytesReserved: sql`max(0, ${qcImports.bytesReserved} - ${previousReservation}) + ${expected}`, bytesConsumed: sql`${qcImports.bytesConsumed} + ${previousReservation}`, updatedAt: nowDate(now) }).where(eq(qcImports.id, source.importId)).run();
      }
      await tx.update(qcImageSources).set({ bytesReserved: expected, bytesConsumed: source.bytesConsumed + previousReservation, state: "pending", attempts: source.attempts + 1, errorCode: null, updatedAt: nowDate(now) }).where(eq(qcImageSources.id, sourceId)).run();
    });
  }

  async function processPreview(imageId: string, lock: { scope: string; ownerId: string; version: number }, budget: RequestBudget) {
    let claimToken: string | null = null, putStarted = false, putConfirmed = false;
    try {
      await assertLock(lock);
      const image = await db.select().from(qcImages).where(and(eq(qcImages.id, imageId), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).get();
      if (!image) return { imageId, status: "deleted" as const };
      const existing = await db.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, imageId)).get();
      if (existing?.status === "ready" && existing.transformVersion === QC_PREVIEW.version && existing.deleteState === "none") return { imageId, status: "existing" as const };
      if (existing?.status === "deleted") return { imageId, status: "deleted" as const };
      const key = existing?.transformVersion === QC_PREVIEW.version ? existing.r2Key : `qc/previews/${QC_PREVIEW.version}/${imageId}.webp`;
      const previewClaimToken = randomUUID();
      claimToken = previewClaimToken;
      const stamp = nowDate(now);
      if (existing) {
        const claimed = await db.update(qcImagePreviews).set({ status: "pending", r2Key: key, claimToken: previewClaimToken, claimExpiresAt: new Date(now() + QC_LIMITS.lockMs), errorCode: null, updatedAt: stamp }).where(and(eq(qcImagePreviews.imageId, imageId), eq(qcImagePreviews.revision, existing.revision), inArray(qcImagePreviews.status, ["pending", "failed", "ready"]), eq(qcImagePreviews.deleteState, "none"))).returning({ imageId: qcImagePreviews.imageId }).get();
        if (!claimed) throw new DomainError("O preview QC está sendo processado.", 409, "QC_PREVIEW_BUSY");
      } else {
        await db.insert(qcImagePreviews).values({ imageId, r2Key: key, transformVersion: QC_PREVIEW.version, status: "pending", deleteState: "none", revision: 0, claimToken: previewClaimToken, claimExpiresAt: new Date(now() + QC_LIMITS.lockMs), createdAt: stamp, updatedAt: stamp }).run();
      }
      const claimedRow = await db.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, imageId)).get();
      if (!claimedRow || claimedRow.claimToken !== previewClaimToken) throw new DomainError("O preview QC perdeu sua concessão.", 409, "QC_PREVIEW_BUSY");
      if (claimedRow.sha256 && claimedRow.transformVersion === QC_PREVIEW.version) {
        requireRequestBudget(budget, QC_LIMITS.transferMs);
        const object = await storage.head(key);
        if (object.exists && object.sha256 === claimedRow.sha256 && claimedRow.width && claimedRow.height && claimedRow.byteSize) {
          await assertLock(lock);
          const adopted = await db.update(qcImagePreviews).set({ status: "ready", deleteState: "none", claimToken: null, claimExpiresAt: null, errorCode: null, revision: claimedRow.revision + 1, updatedAt: nowDate(now) }).where(and(eq(qcImagePreviews.imageId, imageId), eq(qcImagePreviews.claimToken, previewClaimToken), eq(qcImagePreviews.status, "pending"))).returning({ imageId: qcImagePreviews.imageId }).get();
          if (adopted) return { imageId, status: "existing" as const };
        }
      }
      requireRequestBudget(budget, QC_LIMITS.transferMs + QC_LIMITS.imageValidationMs);
      const original = await storage.get(image.r2Key, QC_LIMITS.imageBytes);
      if (!image.contentSha256 || createHash("sha256").update(original).digest("hex") !== image.contentSha256) throw new DomainError("O original QC falhou na verificação antes da geração do preview.", 502, "QC_OBJECT_CONFLICT");
      const generated: GeneratedQcPreview = await makePreview(original);
      await db.update(qcImagePreviews).set({ sha256: generated.sha256, byteSize: generated.bytes.byteLength, width: generated.width, height: generated.height, transformVersion: QC_PREVIEW.version, updatedAt: nowDate(now) }).where(and(eq(qcImagePreviews.imageId, imageId), eq(qcImagePreviews.claimToken, previewClaimToken), eq(qcImagePreviews.status, "pending"))).run();
      await assertLock(lock);
      requireRequestBudget(budget, QC_LIMITS.transferMs);
      putStarted = true;
      await storage.put({ key, bytes: generated.bytes, mimeType: "image/webp", sha256: generated.sha256 });
      putConfirmed = true;
      requireRequestBudget(budget, QC_LIMITS.transferMs);
      const head = await storage.head(key);
      if (!head.exists || head.sha256 !== generated.sha256) throw new DomainError("A gravação do preview QC aguarda reconciliação.", 502, "QC_STORAGE_UNAVAILABLE");
      await assertLock(lock);
      const ready = await db.transaction(async tx => {
        const sourceStillReady = await tx.select({ id: qcImages.id }).from(qcImages).where(and(eq(qcImages.id, imageId), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).get();
        const activeLock = await tx.select().from(qcTransferLocks).where(eq(qcTransferLocks.scope, lock.scope)).get();
        const currentPreview = await tx.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, imageId)).get();
        if (!sourceStillReady || !currentPreview || currentPreview.claimToken !== previewClaimToken || currentPreview.status === "deleted" || activeLock?.ownerId !== lock.ownerId || activeLock.version !== lock.version || activeLock.leaseUntil <= now()) return false;
        await tx.update(qcImagePreviews).set({ status: "ready", deleteState: "none", claimToken: null, claimExpiresAt: null, errorCode: null, revision: currentPreview.revision + 1, updatedAt: nowDate(now) }).where(and(eq(qcImagePreviews.imageId, imageId), eq(qcImagePreviews.claimToken, previewClaimToken))).run();
        return true;
      });
      return { imageId, status: ready ? "generated" as const : "pending" as const };
    } catch (error) {
      const normalized = internalError(error);
      const current = await db.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, imageId)).get();
      if (current && current.status !== "deleted" && (!claimToken || current.claimToken === claimToken)) {
        const uncertain = putStarted && !putConfirmed || putConfirmed;
        await db.update(qcImagePreviews).set({ status: uncertain ? "pending" : "failed", claimToken: uncertain ? claimToken : null, claimExpiresAt: uncertain ? new Date(now() + QC_LIMITS.lockMs) : null, errorCode: normalized.code ?? "QC_PREVIEW_FAILED", revision: current.revision + 1, updatedAt: nowDate(now) }).where(eq(qcImagePreviews.imageId, imageId)).run();
      }
      return { imageId, status: "failed" as const, code: normalized.code ?? "QC_PREVIEW_FAILED" };
    }
  }

  async function processSource(sourceId: string, lock: { scope: string; ownerId: string; version: number }, budget: RequestBudget) {
    let imageId: string | null = null, claimToken: string | null = null, putStarted = false, putConfirmed = false, priorPutUncertainImageId: string | null = null, knownObjectCheckedAbsent: string | null = null;
    try {
      let source = await db.select().from(qcImageSources).where(eq(qcImageSources.id, sourceId)).get();
      if (!source) throw new DomainError("Fonte QC não encontrada.", 404, "QC_SOURCE_NOT_FOUND");
      const external = await db.select().from(hubbuyExternalItems).where(eq(hubbuyExternalItems.id, source.externalItemId)).get();
      if (!external?.purchaseItemId) throw new DomainError("Associe esta ocorrência a um produto finalizado antes de enviar fotos.", 409, "QC_MATCH_REQUIRED");

      const expectedImageId = source.imageId;
      if (expectedImageId) {
        let reserved = await db.select().from(qcImages).where(eq(qcImages.id, expectedImageId)).get();
        if (reserved?.errorCode === "QC_PUT_IN_FLIGHT") priorPutUncertainImageId = reserved.id;
        if (reserved?.status === "deleted" || reserved?.deleteState !== undefined && reserved.deleteState !== "none") {
          await db.update(qcImageSources).set({ state: "deleted", errorCode: null, updatedAt: nowDate(now) }).where(eq(qcImageSources.id, sourceId)).run();
          return { sourceId, status: "deleted" as const };
        }
        if (reserved?.status === "ready") {
          await db.update(qcImageSources).set({ state: "ready", errorCode: null, updatedAt: nowDate(now) }).where(eq(qcImageSources.id, sourceId)).run();
          return { sourceId, status: "existing" as const };
        }
        if (reserved?.contentSha256) {
          if (reserved.claimToken && reserved.claimExpiresAt && reserved.claimExpiresAt.getTime() > now()) throw new DomainError("A mesma foto está em processamento.", 409, "QC_IMAGE_BUSY");
          imageId = reserved.id;
          claimToken = randomUUID();
          const claimed = await db.update(qcImages).set({ status: "pending", claimToken, claimExpiresAt: new Date(now() + QC_LIMITS.lockMs), revision: reserved.revision + 1, updatedAt: nowDate(now) }).where(and(eq(qcImages.id, reserved.id), eq(qcImages.revision, reserved.revision), inArray(qcImages.status, ["pending", "failed"]), eq(qcImages.deleteState, "none"))).returning({ id: qcImages.id }).get();
          if (!claimed) throw new DomainError("A foto mudou durante a recuperação.", 409, "QC_REVISION_CONFLICT");
          reserved = await db.select().from(qcImages).where(eq(qcImages.id, reserved.id)).get();
          if (!reserved) throw new DomainError("A reserva da foto QC desapareceu.", 500, "QC_IMAGE_RESERVATION_FAILED");
          requireRequestBudget(budget, QC_LIMITS.transferMs);
          const object = await storage.head(reserved.r2Key);
          if (object.exists) {
            if (object.sha256 !== reserved.contentSha256) throw new DomainError("A chave R2 reservada contém dados inconsistentes.", 502, "QC_OBJECT_CONFLICT");
            await assertLock(lock);
            const uncertainWrite = reserved.errorCode === "QC_PUT_IN_FLIGHT";
            const ready = await db.transaction(async tx => {
              const currentImage = await tx.select().from(qcImages).where(eq(qcImages.id, reserved!.id)).get();
              const activeLock = await tx.select().from(qcTransferLocks).where(eq(qcTransferLocks.scope, lock.scope)).get();
              if (!currentImage || currentImage.status === "deleted" || currentImage.deletedAt || currentImage.claimToken !== claimToken || activeLock?.ownerId !== lock.ownerId || activeLock.version !== lock.version || activeLock.leaseUntil <= now()) return false;
              await tx.update(qcImages).set({ status: "ready", claimToken: uncertainWrite ? claimToken : null, claimExpiresAt: uncertainWrite ? new Date(now() + QC_LIMITS.lockMs) : null, errorCode: uncertainWrite ? "QC_PUT_IN_FLIGHT" : null, revision: currentImage.revision + 1, updatedAt: nowDate(now) }).where(and(eq(qcImages.id, currentImage.id), eq(qcImages.claimToken, claimToken!))).run();
              await tx.update(qcImageSources).set({ state: "ready", errorCode: null, updatedAt: nowDate(now) }).where(eq(qcImageSources.id, sourceId)).run();
              await repairPresentation(tx, external.purchaseId, [external.purchaseItemId], nowDate(now));
              return true;
            });
            if (ready) { await processPreview(reserved.id, lock, budget); return { sourceId, status: "existing" as const }; }
            const tombstone = await db.select().from(qcImages).where(eq(qcImages.id, reserved.id)).get();
            if (tombstone?.status === "deleted") return { sourceId, status: "deleted" as const };
            throw new DomainError("A gravação QC perdeu sua concessão durante a recuperação.", 409, "QC_TRANSFER_LEASE_LOST");
          }
          await assertLock(lock);
          await db.update(qcImages).set({ status: "failed", claimToken: null, claimExpiresAt: null, errorCode: reserved.errorCode === "QC_PUT_IN_FLIGHT" ? "QC_PUT_IN_FLIGHT" : "QC_OBJECT_MISSING", revision: sql`${qcImages.revision} + 1`, updatedAt: nowDate(now) }).where(and(eq(qcImages.id, reserved.id), eq(qcImages.claimToken, claimToken), eq(qcImages.status, "pending"))).run();
          if (reserved.errorCode === "QC_PUT_IN_FLIGHT") {
            // HEAD absence cannot prove that a timed-out remote PUT will never
            // land. Keep the key reserved for reconciliation; never start a
            // second writer that could erase the first write's uncertainty.
            await markSourceFailure(sourceId, "QC_PUT_UNCERTAIN", true);
            return { sourceId, status: "pending" as const, code: "QC_PUT_UNCERTAIN" };
          }
          knownObjectCheckedAbsent = reserved.id;
          imageId = null;
          claimToken = null;
        }
      }

      await reserveBytes(sourceId, QC_LIMITS.imageBytes);
      source = await db.select().from(qcImageSources).where(eq(qcImageSources.id, sourceId)).get();
      if (!source) throw new DomainError("Fonte QC não encontrada.", 404, "QC_SOURCE_NOT_FOUND");
      requireRequestBudget(budget, QC_LIMITS.dnsMs + QC_LIMITS.transferMs);
      const downloaded = await download(source.sourceUrl);
      await accountReservation(sourceId, downloaded.byteLength);
      requireRequestBudget(budget, QC_LIMITS.imageValidationMs);
      const image = await validate(downloaded);
      await assertLock(lock);
      if (expectedImageId) {
        const expectedImage = await db.select().from(qcImages).where(eq(qcImages.id, expectedImageId)).get();
        if (expectedImage?.contentSha256 && expectedImage.contentSha256 !== image.sha256) throw new DomainError("A fonte mudou de conteúdo desde a reserva QC; revise o manifesto.", 409, "QC_SOURCE_CONTENT_CHANGED");
      }
      let known = await db.select().from(qcImages).where(and(eq(qcImages.externalItemId, external.id), eq(qcImages.contentSha256, image.sha256))).get();
      if (known?.errorCode === "QC_PUT_IN_FLIGHT") priorPutUncertainImageId = known.id;
      if (known?.status === "deleted" || known?.deleteState !== undefined && known.deleteState !== "none") {
        await db.update(qcImageSources).set({ imageId: known.id, state: "deleted", errorCode: null, updatedAt: nowDate(now) }).where(eq(qcImageSources.id, sourceId)).run();
        return { sourceId, status: "deleted" as const };
      }
      if (known?.status === "ready") {
        await db.transaction(async tx => {
          await tx.update(qcImageSources).set({ imageId: known!.id, state: "ready", errorCode: null, updatedAt: nowDate(now) }).where(eq(qcImageSources.id, sourceId)).run();
          await repairPresentation(tx, external.purchaseId, [external.purchaseItemId], nowDate(now));
        });
        await processPreview(known.id, lock, budget);
        return { sourceId, status: "existing" as const };
      }
      const key = `qc/${external.workspaceId}/${external.purchaseId}/${external.id}/${image.sha256}.${image.extension}`;
      claimToken = randomUUID();
      const current = nowDate(now);
      if (known) {
        if (known.status === "pending" && known.claimExpiresAt && known.claimExpiresAt.getTime() > now()) throw new DomainError("A mesma foto está em processamento.", 409, "QC_IMAGE_BUSY");
        const claimed = await db.update(qcImages).set({ status: "pending", sourceUrl: source.sourceUrl, sourceUrlHash: source.sourceUrlHash, claimToken, claimExpiresAt: new Date(now() + QC_LIMITS.lockMs), errorCode: known.errorCode === "QC_PUT_IN_FLIGHT" ? "QC_PUT_IN_FLIGHT" : null, revision: known.revision + 1, updatedAt: current }).where(and(eq(qcImages.id, known.id), eq(qcImages.revision, known.revision), eq(qcImages.status, known.status))).returning({ id: qcImages.id }).get();
        if (!claimed) throw new DomainError("A foto mudou durante a recuperação.", 409, "QC_REVISION_CONFLICT");
        imageId = known.id;
      } else {
        imageId = randomUUID();
        await db.transaction(async tx => {
          await tx.insert(qcImages).values({ id: imageId!, externalItemId: external.id, sourceUrl: source.sourceUrl, sourceUrlHash: source.sourceUrlHash, contentSha256: image.sha256, r2Key: key, status: "pending", deleteState: "none", mimeType: image.mimeType, byteSize: image.bytes.byteLength, width: image.width, height: image.height, ordinal: source.ordinal, revision: 0, claimToken, claimExpiresAt: new Date(now() + QC_LIMITS.lockMs), errorCode: null, createdBy: userId, createdAt: current, updatedAt: current, deletedAt: null, deletedBy: null }).run();
          await tx.update(qcImageSources).set({ imageId, updatedAt: current }).where(eq(qcImageSources.id, sourceId)).run();
        });
        known = await db.select().from(qcImages).where(eq(qcImages.id, imageId)).get();
      }
      if (!known) known = await db.select().from(qcImages).where(eq(qcImages.id, imageId)).get();
      if (!known) throw new DomainError("A reserva da foto QC desapareceu.", 500, "QC_IMAGE_RESERVATION_FAILED");
      requireRequestBudget(budget, QC_LIMITS.transferMs);
      const existingObject = knownObjectCheckedAbsent === known.id ? { exists: false } : await storage.head(known.r2Key);
      let uncertainWrite = known.errorCode === "QC_PUT_IN_FLIGHT";
      if (existingObject.exists) {
        if (existingObject.sha256 !== image.sha256) throw new DomainError("A chave R2 reservada contém dados inconsistentes.", 502, "QC_OBJECT_CONFLICT");
      } else if (uncertainWrite) {
        await db.update(qcImages).set({ status: "failed", claimToken: null, claimExpiresAt: null, errorCode: "QC_PUT_IN_FLIGHT", revision: sql`${qcImages.revision} + 1`, updatedAt: nowDate(now) }).where(and(eq(qcImages.id, known.id), eq(qcImages.claimToken, claimToken), eq(qcImages.status, "pending"))).run();
        await db.update(qcImageSources).set({ imageId: known.id, updatedAt: nowDate(now) }).where(eq(qcImageSources.id, sourceId)).run();
        await markSourceFailure(sourceId, "QC_PUT_UNCERTAIN", true);
        return { sourceId, status: "pending" as const, code: "QC_PUT_UNCERTAIN" };
      } else {
        await reserveBytes(sourceId, image.bytes.byteLength);
        requireRequestBudget(budget, QC_LIMITS.transferMs);
        const started = await db.update(qcImages).set({ errorCode: "QC_PUT_IN_FLIGHT", updatedAt: nowDate(now) }).where(and(eq(qcImages.id, known.id), eq(qcImages.claimToken, claimToken), eq(qcImages.status, "pending"))).returning({ id: qcImages.id }).get();
        if (!started) throw new DomainError("A reserva da foto mudou antes do backup.", 409, "QC_REVISION_CONFLICT");
        try {
          requireRequestBudget(budget, QC_LIMITS.transferMs);
          putStarted = true;
          await storage.put({ key: known.r2Key, bytes: image.bytes, mimeType: image.mimeType, sha256: image.sha256 });
          putConfirmed = true;
          uncertainWrite = false;
          await db.update(qcImages).set({ errorCode: "QC_PUT_CONFIRMED", updatedAt: nowDate(now) }).where(and(eq(qcImages.id, known.id), eq(qcImages.claimToken, claimToken), eq(qcImages.status, "pending"))).run();
        } catch (putError) {
          if (putConfirmed) throw putError;
          await accountReservation(sourceId, image.bytes.byteLength);
          requireRequestBudget(budget, QC_LIMITS.transferMs);
          const recovered = await storage.head(known.r2Key);
          if (!recovered.exists || recovered.sha256 !== image.sha256) throw new DomainError("O envio do backup QC teve resultado incerto e será reconciliado.", 502, "QC_STORAGE_UNAVAILABLE");
          uncertainWrite = true;
        }
        if ((await db.select().from(qcImageSources).where(eq(qcImageSources.id, sourceId)).get())?.bytesReserved) await accountReservation(sourceId, image.bytes.byteLength);
      }
      await assertLock(lock);
      const ready = await db.transaction(async tx => {
        const currentImage = await tx.select().from(qcImages).where(eq(qcImages.id, imageId!)).get();
        const activeLock = await tx.select().from(qcTransferLocks).where(eq(qcTransferLocks.scope, lock.scope)).get();
        if (!currentImage || currentImage.status === "deleted" || currentImage.deletedAt || currentImage.claimToken !== claimToken || activeLock?.ownerId !== lock.ownerId || activeLock.version !== lock.version || activeLock.leaseUntil <= now()) return false;
        await tx.update(qcImages).set({ status: "ready", deleteState: "none", contentSha256: image.sha256, mimeType: image.mimeType, byteSize: image.bytes.byteLength, width: image.width, height: image.height, claimToken: uncertainWrite ? claimToken : null, claimExpiresAt: uncertainWrite ? new Date(now() + QC_LIMITS.lockMs) : null, errorCode: uncertainWrite ? "QC_PUT_IN_FLIGHT" : null, revision: currentImage.revision + 1, updatedAt: nowDate(now) }).where(and(eq(qcImages.id, imageId!), eq(qcImages.claimToken, claimToken!))).run();
        await tx.update(qcImageSources).set({ imageId, state: "ready", errorCode: null, updatedAt: nowDate(now) }).where(eq(qcImageSources.id, sourceId)).run();
        await repairPresentation(tx, external.purchaseId, [external.purchaseItemId], nowDate(now));
        return true;
      });
      if (!ready) {
        const tombstone = await db.select().from(qcImages).where(eq(qcImages.id, imageId)).get();
        if (tombstone?.status === "deleted") {
          let compensated = false;
          try {
            requireRequestBudget(budget, QC_LIMITS.transferMs);
            await storage.delete(tombstone.r2Key);
            requireRequestBudget(budget, QC_LIMITS.transferMs);
            if ((await storage.head(tombstone.r2Key)).exists) throw new Error("QC tombstone compensation did not remove the object");
            await db.update(qcImages).set({ deleteState: "deleted", claimToken: null, claimExpiresAt: null, errorCode: null, updatedAt: nowDate(now) }).where(and(eq(qcImages.id, tombstone.id), eq(qcImages.status, "deleted"), eq(qcImages.claimToken, claimToken))).run();
            compensated = true;
          }
          catch {
            if (putConfirmed) await db.update(qcImages).set({ deleteState: "pending", claimToken: null, claimExpiresAt: null, errorCode: "QC_DELETE_PENDING", updatedAt: nowDate(now) }).where(and(eq(qcImages.id, tombstone.id), eq(qcImages.status, "deleted"), eq(qcImages.claimToken, claimToken))).run();
          }
          await db.update(qcImageSources).set({ state: "deleted", updatedAt: nowDate(now) }).where(eq(qcImageSources.id, sourceId)).run();
          return compensated ? { sourceId, status: "deleted" as const } : { sourceId, status: "pending" as const, code: "QC_DELETE_PENDING" };
        }
        throw new DomainError("A gravação tardia não confirmou a foto QC.", 409, "QC_TRANSFER_LEASE_LOST");
      }
      await processPreview(imageId, lock, budget);
      return { sourceId, status: "imported" as const };
    } catch (error) {
      const normalized = internalError(error);
      if (putConfirmed && imageId && claimToken) {
        const tombstone = await db.select().from(qcImages).where(eq(qcImages.id, imageId)).get();
        if (tombstone?.status === "deleted") {
          try {
            requireRequestBudget(budget, QC_LIMITS.transferMs);
            await storage.delete(tombstone.r2Key);
            requireRequestBudget(budget, QC_LIMITS.transferMs);
            if ((await storage.head(tombstone.r2Key)).exists) throw new Error("QC tombstone compensation did not remove the object");
            await db.update(qcImages).set({ deleteState: "deleted", claimToken: null, claimExpiresAt: null, errorCode: null, updatedAt: nowDate(now) }).where(and(eq(qcImages.id, imageId), eq(qcImages.status, "deleted"), eq(qcImages.claimToken, claimToken))).run();
            await db.update(qcImageSources).set({ state: "deleted", updatedAt: nowDate(now) }).where(and(eq(qcImageSources.imageId, imageId), eq(qcImageSources.state, "deleted"))).run();
          } catch {
            // This writer's PUT promise has resolved, so its in-flight risk is
            // over even if this request has no time left for compensation.
            await db.update(qcImages).set({ deleteState: "pending", claimToken: null, claimExpiresAt: null, errorCode: "QC_DELETE_PENDING", updatedAt: nowDate(now) }).where(and(eq(qcImages.id, imageId), eq(qcImages.status, "deleted"), eq(qcImages.claimToken, claimToken))).run();
          }
          return { sourceId, status: "pending" as const, code: "QC_DELETE_PENDING" };
        }
      }
      const uncertainWrite = putStarted && !putConfirmed;
      const recoverable = uncertainWrite || putConfirmed || normalized.code === "QC_STORAGE_UNAVAILABLE" || normalized.code === "QC_TRANSFER_LEASE_LOST" || normalized.code === "QC_IMAGE_BUSY" || normalized.code === "QC_REQUEST_BUDGET";
      if (imageId && claimToken && !recoverable) await db.update(qcImages).set({ status: "failed", claimToken: null, claimExpiresAt: null, errorCode: normalized.code ?? "QC_IMAGE_FAILED", revision: sql`${qcImages.revision} + 1`, updatedAt: nowDate(now) }).where(and(eq(qcImages.id, imageId), eq(qcImages.claimToken, claimToken), eq(qcImages.status, "pending"))).run();
      else if (imageId && claimToken && putConfirmed) await db.update(qcImages).set({ status: "pending", claimToken: null, claimExpiresAt: null, errorCode: "QC_PUT_CONFIRMED", revision: sql`${qcImages.revision} + 1`, updatedAt: nowDate(now) }).where(and(eq(qcImages.id, imageId), eq(qcImages.claimToken, claimToken), eq(qcImages.status, "pending"))).run();
      else if (imageId && claimToken && normalized.code === "QC_REQUEST_BUDGET" && !putStarted) await db.update(qcImages).set({ status: "failed", claimToken: null, claimExpiresAt: null, errorCode: priorPutUncertainImageId === imageId ? "QC_PUT_IN_FLIGHT" : "QC_REQUEST_BUDGET", revision: sql`${qcImages.revision} + 1`, updatedAt: nowDate(now) }).where(and(eq(qcImages.id, imageId), eq(qcImages.claimToken, claimToken), eq(qcImages.status, "pending"))).run();
      await markSourceFailure(sourceId, normalized.code ?? "QC_IMAGE_FAILED", recoverable);
      return { sourceId, status: recoverable ? "pending" as const : "failed" as const, code: normalized.code ?? "QC_IMAGE_FAILED" };
    }
  }

  async function removeTombstone(imageId: string, purchaseId: string, lock: { scope: string; ownerId: string; version: number }, budget: RequestBudget) {
    await assertLock(lock);
    const image = await db.select().from(qcImages).where(eq(qcImages.id, imageId)).get();
    if (!image) return { imageId, status: "missing" as const };
    if (image.status !== "deleted") {
      const external = await db.select().from(hubbuyExternalItems).where(eq(hubbuyExternalItems.id, image.externalItemId)).get();
      if (!external || external.purchaseId !== purchaseId) throw new DomainError("Imagem QC não encontrada nesta compra.", 404, "QC_IMAGE_NOT_FOUND");
      const stamp = nowDate(now);
      await db.transaction(async tx => {
        const current = await tx.select().from(qcImages).where(eq(qcImages.id, imageId)).get();
        if (!current || current.status === "deleted") return;
        const writerUncertain = current.errorCode === "QC_PUT_IN_FLIGHT" || !!current.claimToken && !!current.claimExpiresAt && current.claimExpiresAt.getTime() > now();
        await tx.update(qcImages).set({ status: "deleted", deleteState: "pending", deletedAt: stamp, deletedBy: userId, claimToken: writerUncertain ? current.claimToken : null, claimExpiresAt: writerUncertain ? current.claimExpiresAt : null, errorCode: writerUncertain ? "QC_PUT_IN_FLIGHT" : current.errorCode, revision: current.revision + 1, updatedAt: stamp }).where(and(eq(qcImages.id, imageId), eq(qcImages.revision, current.revision))).run();
        await tx.update(qcImageSources).set({ state: "deleted", updatedAt: stamp }).where(eq(qcImageSources.imageId, imageId)).run();
        const preview = await tx.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, imageId)).get();
        if (preview && preview.status !== "deleted") {
          const previewWriterUncertain = !!preview.claimToken && !!preview.claimExpiresAt && preview.claimExpiresAt.getTime() > now();
          await tx.update(qcImagePreviews).set({ status: "deleted", deleteState: "pending", deletedAt: stamp, claimToken: previewWriterUncertain ? preview.claimToken : null, claimExpiresAt: previewWriterUncertain ? preview.claimExpiresAt : null, errorCode: previewWriterUncertain ? "QC_PREVIEW_PUT_IN_FLIGHT" : preview.errorCode, revision: preview.revision + 1, updatedAt: stamp }).where(and(eq(qcImagePreviews.imageId, imageId), eq(qcImagePreviews.revision, preview.revision))).run();
        }
        const coverChanges = await repairPresentation(tx, purchaseId, [external.purchaseItemId], stamp);
        await tx.insert(qcEvents).values({ id: randomUUID(), workspaceId: external.workspaceId, purchaseId, actorId: userId, eventType: "QC_DELETE", resultCode: "TOMBSTONED", contextJson: JSON.stringify({ imageId, externalItemId: external.id, coverChanges }), createdAt: stamp }).run();
      });
    }
    const tombstone = await db.select().from(qcImages).where(eq(qcImages.id, imageId)).get();
    if (!tombstone) return { imageId, status: "deleted" as const };
    try {
      // Tombstoned keys remain known forever. HEAD + DELETE also repairs a late
      // remote PUT after a prior successful DELETE, without scanning the bucket.
      requireRequestBudget(budget, QC_LIMITS.transferMs);
      const object = await storage.head(tombstone.r2Key);
      if (object.exists) {
        requireRequestBudget(budget, QC_LIMITS.transferMs);
        await storage.delete(tombstone.r2Key);
      }
      requireRequestBudget(budget, QC_LIMITS.transferMs);
      if ((await storage.head(tombstone.r2Key)).exists) throw new Error("QC tombstone object remains after DELETE");
      const writerUncertain = tombstone.errorCode === "QC_PUT_IN_FLIGHT" || !!tombstone.claimToken && !!tombstone.claimExpiresAt && tombstone.claimExpiresAt.getTime() > now();
      const preview = await db.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, imageId)).get();
      let previewPending = false;
      if (preview?.status === "deleted" && preview.deleteState !== "deleted") {
        const previewWriterUncertain = preview.errorCode === "QC_PREVIEW_PUT_IN_FLIGHT" || !!preview.claimToken && !!preview.claimExpiresAt && preview.claimExpiresAt.getTime() > now();
        requireRequestBudget(budget, QC_LIMITS.transferMs);
        const previewObject = await storage.head(preview.r2Key);
        if (previewObject.exists) { requireRequestBudget(budget, QC_LIMITS.transferMs); await storage.delete(preview.r2Key); }
        requireRequestBudget(budget, QC_LIMITS.transferMs);
        if ((await storage.head(preview.r2Key)).exists) throw new Error("QC preview tombstone object remains after DELETE");
        if (previewWriterUncertain) previewPending = true;
        else await db.update(qcImagePreviews).set({ deleteState: "deleted", claimToken: null, claimExpiresAt: null, errorCode: null, updatedAt: nowDate(now) }).where(and(eq(qcImagePreviews.imageId, imageId), eq(qcImagePreviews.status, "deleted"))).run();
      }
      if (writerUncertain || previewPending) {
        await db.update(qcImages).set({ deleteState: "pending", updatedAt: nowDate(now) }).where(and(eq(qcImages.id, imageId), eq(qcImages.status, "deleted"))).run();
        return { imageId, status: "pending" as const, message: writerUncertain ? "A escrita do backup teve resultado incerto; a exclusão permanece pendente até a reconciliação da gravação." : "A remoção do preview privado aguarda reconciliação." };
      }
      await db.update(qcImages).set({ deleteState: "deleted", claimToken: null, claimExpiresAt: null, errorCode: null, updatedAt: nowDate(now) }).where(and(eq(qcImages.id, imageId), eq(qcImages.status, "deleted"))).run();
      return { imageId, status: "deleted" as const };
    } catch {
      await db.update(qcImagePreviews).set({ deleteState: "pending", updatedAt: nowDate(now) }).where(and(eq(qcImagePreviews.imageId, imageId), eq(qcImagePreviews.status, "deleted"))).run();
      await db.update(qcImages).set({ deleteState: "pending", updatedAt: nowDate(now) }).where(and(eq(qcImages.id, imageId), eq(qcImages.status, "deleted"))).run();
      return { imageId, status: "pending" as const, message: "A imagem foi removida do Loti; a exclusão física do backup aguarda nova tentativa." };
    }
  }

  async function runBatch(purchaseId: string, importId?: string, expectedRevision?: number, externalItemId?: string) {
    const budget = { deadline: now() + QC_LIMITS.requestMs };
    const purchase = await rate(purchaseId, "batch");
    if (!managerId || managerId !== userId) throw new DomainError("Você não pode administrar QC.", 403, "QC_FORBIDDEN");
    if (externalItemId) {
      const external = await db.select({ id: hubbuyExternalItems.id }).from(hubbuyExternalItems).where(and(eq(hubbuyExternalItems.id, externalItemId), eq(hubbuyExternalItems.purchaseId, purchaseId), sql`${hubbuyExternalItems.purchaseItemId} IS NOT NULL`)).get();
      if (!external) throw new DomainError("Ocorrência QC não encontrada ou ainda não associada.", 404, "QC_EXTERNAL_NOT_FOUND");
    }
    if (importId) {
      const manifest = await db.select().from(qcImports).where(and(eq(qcImports.id, importId), eq(qcImports.purchaseId, purchaseId))).get();
      if (!manifest) throw new DomainError("Importação QC não encontrada nesta compra.", 404, "QC_IMPORT_NOT_FOUND");
      if (manifest.status !== "confirmed" || manifest.expiresAt && manifest.expiresAt.getTime() <= now()) throw new DomainError("A importação expirou. Use reconciliar pendências da compra.", 409, "QC_IMPORT_EXPIRED");
      if (expectedRevision !== undefined && manifest.revision !== expectedRevision) throw new DomainError("O progresso da importação mudou. Atualize antes de tentar novamente.", 409, "QC_REVISION_CONFLICT");
    }
    const lock = await acquireLock(purchase.workspaceId);
    try {
      // One potentially slow image pipeline fits the 90 s application budget
      // even on the known-object recovery path (which may perform an extra HEAD).
      // Selection is recency-fair across calls; DB work stays sequential for
      // compatibility with the single-connection libSQL adapter.
      const eligibleWhere = and(eq(hubbuyExternalItems.purchaseId, purchaseId), inArray(qcImageSources.state, ["pending", "failed"]), ...(importId ? [eq(qcImageSources.importId, importId)] : []), ...(externalItemId ? [eq(qcImageSources.externalItemId, externalItemId)] : []), sql`${hubbuyExternalItems.purchaseItemId} IS NOT NULL`);
      const eligible = await db.select({ id: qcImageSources.id, updatedAt: qcImageSources.updatedAt }).from(qcImageSources).innerJoin(hubbuyExternalItems, eq(qcImageSources.externalItemId, hubbuyExternalItems.id)).where(eligibleWhere).orderBy(asc(qcImageSources.updatedAt), asc(qcImageSources.createdAt), asc(qcImageSources.ordinal)).limit(1).all();
      const pendingDeletes = importId || externalItemId ? [] : await db.select({ id: qcImages.id, updatedAt: qcImages.updatedAt }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).where(and(eq(hubbuyExternalItems.purchaseId, purchaseId), eq(qcImages.status, "deleted"))).orderBy(asc(qcImages.updatedAt)).limit(1).all();
      const previewWork = importId || externalItemId ? [] : await db.select({ id: qcImages.id, updatedAt: qcImages.updatedAt }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).leftJoin(qcImagePreviews, eq(qcImagePreviews.imageId, qcImages.id)).where(and(eq(hubbuyExternalItems.purchaseId, purchaseId), eq(qcImages.status, "ready"), or(isNull(qcImagePreviews.imageId), inArray(qcImagePreviews.status, ["pending", "failed"]), and(eq(qcImagePreviews.status, "ready"), sql`${qcImagePreviews.transformVersion} != ${QC_PREVIEW.version}`)))).orderBy(asc(qcImages.updatedAt), asc(qcImages.createdAt), asc(qcImages.id)).limit(1).all();
      const sourceAt = eligible[0]?.updatedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const deleteAt = pendingDeletes[0]?.updatedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const previewAt = previewWork[0]?.updatedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const selectedDelete = deleteAt <= sourceAt && deleteAt <= previewAt ? pendingDeletes[0] : undefined;
      const selectedImage = !selectedDelete && sourceAt <= previewAt ? eligible[0] : undefined;
      const selectedPreview = !selectedDelete && !selectedImage ? previewWork[0] : undefined;
      if ((selectedImage || selectedDelete || selectedPreview) && !config.storage) assertQcStorageConfigured();
      const results: { sourceId?: string; imageId?: string; status: string; code?: string; message?: string }[] = [];
      if (selectedDelete) {
        await rate(purchaseId, "delete");
        results.push(await removeTombstone(selectedDelete.id, purchaseId, lock, budget));
      } else if (selectedImage) {
        results.push(await processSource(selectedImage.id, lock, budget));
      } else if (selectedPreview) {
        const result = await processPreview(selectedPreview.id, lock, budget);
        results.push({ imageId: result.imageId, status: result.status === "generated" ? "previewed" : result.status, ...("code" in result ? { code: result.code } : {}) });
      }
      const counts = { imported: results.filter(row => row.status === "imported").length, previews: results.filter(row => row.status === "previewed").length, existing: results.filter(row => row.status === "existing").length, deleted: results.filter(row => row.status === "deleted").length, failed: results.filter(row => row.status === "failed").length, pending: results.filter(row => row.status === "pending").length };
      const remainingSources = await db.select({ count: sql<number>`count(*)` }).from(qcImageSources).innerJoin(hubbuyExternalItems, eq(qcImageSources.externalItemId, hubbuyExternalItems.id)).where(eligibleWhere).get();
      const remainingDeletes = importId || externalItemId ? { count: 0 } : await db.select({ count: sql<number>`count(*)` }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).where(and(eq(hubbuyExternalItems.purchaseId, purchaseId), eq(qcImages.status, "deleted"), eq(qcImages.deleteState, "pending"))).get();
      const remainingPreviews = importId || externalItemId ? { value: 0 } : await db.select({ value: count() }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).leftJoin(qcImagePreviews, eq(qcImagePreviews.imageId, qcImages.id)).where(and(eq(hubbuyExternalItems.purchaseId, purchaseId), eq(qcImages.status, "ready"), or(isNull(qcImagePreviews.imageId), inArray(qcImagePreviews.status, ["pending", "failed"]), and(eq(qcImagePreviews.status, "ready"), sql`${qcImagePreviews.transformVersion} != ${QC_PREVIEW.version}`)))).get();
      const remaining = Number(remainingSources?.count ?? 0) + Number(remainingDeletes?.count ?? 0) + Number(remainingPreviews?.value ?? 0);
      const hasMore = remaining > 0;
      const complete = !hasMore && counts.failed === 0 && counts.pending === 0;
      await addEvent(purchaseId, purchase.workspaceId, "QC_IMPORT", counts.failed || counts.pending || hasMore ? "PARTIAL" : "BATCH_COMPLETE", { importId: importId ?? null, externalItemId: externalItemId ?? null, ...counts, processed: results.length, remaining });
      let revision: number | undefined;
      if (importId && expectedRevision !== undefined) {
        const updated = await db.update(qcImports).set({ revision: expectedRevision + 1, updatedAt: nowDate(now) }).where(and(eq(qcImports.id, importId), eq(qcImports.revision, expectedRevision))).returning({ revision: qcImports.revision }).get();
        if (!updated) throw new DomainError("O progresso mudou durante o lote; as fotos concluídas foram preservadas.", 409, "QC_REVISION_CONFLICT");
        revision = updated.revision;
      }
      if (!importId) await db.update(qcImports).set({ status: "expired", updatedAt: nowDate(now) }).where(and(eq(qcImports.purchaseId, purchaseId), inArray(qcImports.status, ["prepared", "confirmed"]), lte(qcImports.expiresAt, nowDate(now)))).run();
      return { ...counts, processed: results.length, remaining, hasMore, complete, partial: !complete, results, ...(revision === undefined ? {} : { revision }) };
    } finally { await releaseLock(lock); }
  }

  async function deleteImage(imageId: string) {
    const budget = { deadline: now() + QC_LIMITS.requestMs };
    const image = await db.select().from(qcImages).where(eq(qcImages.id, imageId)).get();
    if (!image) throw new DomainError("Imagem QC não encontrada.", 404, "QC_IMAGE_NOT_FOUND");
    const external = await db.select().from(hubbuyExternalItems).where(eq(hubbuyExternalItems.id, image.externalItemId)).get();
    if (!external) throw new DomainError("Imagem QC não encontrada.", 404, "QC_IMAGE_NOT_FOUND");
    const purchase = await rate(external.purchaseId, "delete");
    const lock = await acquireLock(purchase.workspaceId);
    try { return await removeTombstone(imageId, external.purchaseId, lock, budget); }
    finally { await releaseLock(lock); }
  }

  async function fallback(imageId: string) {
    const image = await db.select().from(qcImages).where(and(eq(qcImages.id, imageId), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).get();
    if (!image) throw new DomainError("Imagem QC não encontrada.", 404, "QC_IMAGE_NOT_FOUND");
    const external = await db.select().from(hubbuyExternalItems).where(eq(hubbuyExternalItems.id, image.externalItemId)).get();
    if (!external?.purchaseItemId) throw new DomainError("Imagem QC não encontrada.", 404, "QC_IMAGE_NOT_FOUND");
    const purchase = await rate(external.purchaseId, "fallback");
    const lock = await acquireLock(purchase.workspaceId);
    try {
      const activeImage = await db.select().from(qcImages).where(and(eq(qcImages.id, imageId), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).get();
      if (!activeImage || activeImage.externalItemId !== external.id) throw new DomainError("Imagem QC não encontrada.", 404, "QC_IMAGE_NOT_FOUND");
      const activeExternal = await db.select().from(hubbuyExternalItems).where(eq(hubbuyExternalItems.id, external.id)).get();
      if (!activeExternal?.purchaseItemId || activeExternal.purchaseId !== purchase.id) throw new DomainError("Imagem QC não encontrada.", 404, "QC_IMAGE_NOT_FOUND");
      const url = await storage.signRead(activeImage.r2Key);
      await addEvent(external.purchaseId, purchase.workspaceId, "QC_FALLBACK", "SIGNED", { imageId });
      return { url, expiresIn: QC_LIMITS.signedUrlSeconds };
    } finally { await releaseLock(lock); }
  }

  async function runImportBatch(importId: string, expectedRevision: number) {
    const row = await db.select().from(qcImports).where(eq(qcImports.id, importId)).get();
    if (!row) throw new DomainError("Importação QC não encontrada.", 404, "QC_IMPORT_NOT_FOUND");
    await authorizedPurchase(row.purchaseId, true);
    if (row.revision !== expectedRevision) throw new DomainError("O progresso da importação mudou. Atualize antes de tentar novamente.", 409, "QC_REVISION_CONFLICT");
    return runBatch(row.purchaseId, importId, expectedRevision);
  }

  return { authorizedPurchase, rate, addEvent, getTargets, getQcSummary, getGallery, getQcPresentations, getOriginalSource, getPreview, setPresentationCover, prepare, getImport, confirmImport, resolvePendingOccurrence, runBatch, runImportBatch, deleteImage, fallback, managerId, storage, download, validate, now };
}
