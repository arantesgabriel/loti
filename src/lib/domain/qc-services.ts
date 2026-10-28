import { and, asc, count, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { AppDatabase } from "../db/connection";
import { hubbuyExternalItems, purchaseAdditionalOrderItems, purchaseCostOrders, purchaseOrderCorrections, purchaseCostTrackings, purchaseItems, qcAdditionalPresentations, qcEvents, qcImagePreviews, qcImageSources, qcImages, qcImports, qcPresentations, qcRateLimits, qcTransferLocks } from "../db/schema";
import { authorization } from "./authorization";
import { DomainError } from "./errors";
import { QcDomainError } from "./qc-errors";
import { normalizeQcMatch, suggestQcMatch, type QcMatch } from "./qc-matching";
import { QC_LIMITS, QC_RATE_LIMITS, type QcRateOperation } from "./qc-limits";
import { parseHubBuyImport, type ParsedQcImport, type QcOccurrenceInput } from "./qc-validation";
import { assertQcStorageConfigured, r2QcStorage, type QcStorage } from "../qc/storage";
import { downloadHubbuyImage } from "../qc/download";
import { validateQcImage } from "../qc/image-validation";
import { validateHubbuySourceUrl } from "../qc/download";
import { generateQcPreview, QC_PREVIEW, type GeneratedQcPreview } from "../qc/preview";
import { measureQcStage, noopQcMetrics, withQcMetricContext, type QcMetricCollector } from "../qc/metrics";
import { FifoSemaphore, SerialQueue, withQcDatabaseQueueContext } from "../qc/concurrency";
import { matchesQcEtag, qcPreviewEtag, qcPreviewVersion } from "../qc/preview-http";
import { ordersTransitionQcStorage } from "../qc/orders-transition-storage";

type ManagerConfig = { managerId?: string | null; storage?: QcStorage; download?: typeof downloadHubbuyImage; validate?: typeof validateQcImage; makePreview?: typeof generateQcPreview; now?: () => number; metrics?: QcMetricCollector; pipelineConcurrency?: number; sleep?: (ms: number) => Promise<void>; random?: () => number; signal?: AbortSignal };
type QcRestoreSnapshot = { imageId: string; revision: number; r2Key: string; sourceUrlHash: string; contentSha256: string | null; preview: { revision: number; r2Key: string } | null };
type PreviewOccurrence = { occurrence: QcOccurrenceInput; match: QcMatch; existingId: string | null; existingRevision: number | null; existingItemId: string | null; restoreSnapshots?: QcRestoreSnapshot[]; conflict?: string };
type ImportManifest = ParsedQcImport & { rows: PreviewOccurrence[]; emptyTargetsOnly?: boolean; transferSourceIds?: string[] };
type RequestBudget = { deadline: number };
type QcTargetRef = { origin: "purchase" | "additional"; id: string; key: string };

function parseTargetKey(key: string): QcTargetRef {
  if (key.startsWith("purchase:")) return { origin: "purchase", id: key.slice("purchase:".length), key };
  if (key.startsWith("additional:")) return { origin: "additional", id: key.slice("additional:".length), key };
  // Older import manifests contain a raw purchase item ID.
  return { origin: "purchase", id: key, key: `purchase:${key}` };
}

function targetKeyForExternal(row: Pick<typeof hubbuyExternalItems.$inferSelect, "purchaseItemId" | "additionalOrderItemId">) {
  if (row.purchaseItemId) return `purchase:${row.purchaseItemId}`;
  if (row.additionalOrderItemId) return `additional:${row.additionalOrderItemId}`;
  return null;
}

const qcSourceMapKey = (externalItemId: string, sourceUrlHash: string) => `${externalItemId}\u0000${sourceUrlHash}`;

function targetCondition(target: QcTargetRef) {
  return target.origin === "purchase"
    ? eq(hubbuyExternalItems.purchaseItemId, target.id)
    : eq(hubbuyExternalItems.additionalOrderItemId, target.id);
}

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
const internalError = (error: unknown) => error instanceof DomainError ? error : error instanceof DOMException && error.name === "AbortError" ? new DomainError("A solicitação QC foi cancelada.", 503, "QC_REQUEST_ABORTED") : new DomainError("Não foi possível concluir a operação QC.", 500, "QC_INTERNAL");
const uniqueError = (error: unknown) => /UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/i.test(error instanceof Error ? error.message : String(error));

export function qcServices(db: AppDatabase, userId: string, config: ManagerConfig = {}) {
  const now = config.now ?? Date.now;
  const metrics = config.metrics ?? noopQcMetrics;
  const configuredConcurrency = config.pipelineConcurrency ?? (process.env.LOTI_QC_PIPELINE_CONCURRENCY ? Number(process.env.LOTI_QC_PIPELINE_CONCURRENCY) : 3);
  const syntheticOverridesPresent = !!config.storage && !!config.download && !!config.validate && !!config.makePreview;
  if (!Number.isSafeInteger(configuredConcurrency) || configuredConcurrency < 1 || configuredConcurrency > (config.pipelineConcurrency !== undefined && syntheticOverridesPresent ? 10 : 3)
    || configuredConcurrency > 3 && ![5, 10].includes(configuredConcurrency)) {
    throw new DomainError("A configuração de concorrência QC é inválida.", 500, "QC_CONFIGURATION_INVALID");
  }
  const pipelineSlots = new FifoSemaphore(configuredConcurrency);
  const imageSemaphore = new SerialQueue();
  const databaseQueue = new SerialQueue();
  const localQaStorage = config.storage ? null : ordersTransitionQcStorage();
  const rawStorage = config.storage ?? localQaStorage ?? r2QcStorage;
  const storage: QcStorage = {
    async put(object, signal) { metrics.increment("putCalls"); metrics.increment("bytesObserved", object.bytes.byteLength); return measureQcStage(metrics, "storage", () => rawStorage.put(object, signal ?? config.signal)); },
    async head(key, signal) { metrics.increment("headCalls"); return measureQcStage(metrics, "storage", () => rawStorage.head(key, signal ?? config.signal)); },
    async get(key, maxBytes, signal) { metrics.increment("getCalls"); const bytes = await measureQcStage(metrics, "storage", () => rawStorage.get(key, maxBytes, signal ?? config.signal)); metrics.increment("bytesObserved", bytes.byteLength); return bytes; },
    async delete(key, signal) { metrics.increment("deleteCalls"); return measureQcStage(metrics, "storage", () => rawStorage.delete(key, signal ?? config.signal)); },
    signRead(key) { return rawStorage.signRead(key); },
  };
  const download = config.download ?? (localQaStorage ? async () => { throw new DomainError("A carga QA não acessa imagens externas.", 403, "QC_QA_NETWORK_DISABLED"); } : downloadHubbuyImage);
  const validate = config.validate ?? validateQcImage;
  const makePreview = config.makePreview ?? generateQcPreview;
  const sleep = config.sleep ?? ((milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds)));
  const random = config.random ?? Math.random;
  const managerId = config.managerId ?? process.env.LOTI_QC_MANAGER_USER_ID ?? null;

  function requireRequestBudget(budget: RequestBudget, operationMaximumMs: number) {
    if (config.signal?.aborted) throw new DomainError("A solicitação QC foi cancelada.", 503, "QC_REQUEST_ABORTED");
    if (budget.deadline - now() < operationMaximumMs + QC_LIMITS.requestSafetyMs) { metrics.increment("deadlineInterruptions"); throw new DomainError("O lote QC atingiu o orçamento de tempo; a pendência pode ser retomada.", 503, "QC_REQUEST_BUDGET"); }
  }

  function requestBudgetSignal(budget: RequestBudget, operationMaximumMs = QC_LIMITS.transferMs) {
    const remainingMs = Math.max(1, budget.deadline - now() - QC_LIMITS.requestSafetyMs);
    const timeout = AbortSignal.timeout(Math.min(operationMaximumMs, remainingMs));
    return config.signal ? AbortSignal.any([config.signal, timeout]) : timeout;
  }

  async function authorizedPurchase(purchaseId: string, manage = false) {
    const purchase = await authorization(db, userId).requirePurchase(purchaseId);
    if (purchase.status !== "finalized") throw new DomainError("O QC só pode ser gerenciado em compras finalizadas.", 409, "QC_PURCHASE_NOT_FINALIZED");
    if (manage && (!managerId || userId !== managerId)) throw new DomainError("Você não pode administrar QC.", 403, "QC_FORBIDDEN");
    return purchase;
  }

  async function resolveTarget(source: Pick<AppDatabase, "select">, purchaseId: string, targetKey: string) {
    const target = parseTargetKey(targetKey);
    if (!target.id) return null;
    if (target.origin === "purchase") {
      return source.select({ id: purchaseItems.id }).from(purchaseItems).where(and(eq(purchaseItems.id, target.id), eq(purchaseItems.purchaseId, purchaseId))).get();
    }
    return source.select({ id: purchaseAdditionalOrderItems.id }).from(purchaseAdditionalOrderItems)
      .innerJoin(purchaseCostOrders, eq(purchaseAdditionalOrderItems.orderId, purchaseCostOrders.id))
      .innerJoin(purchaseCostTrackings, eq(purchaseCostOrders.trackingId, purchaseCostTrackings.id))
      .where(and(eq(purchaseAdditionalOrderItems.id, target.id), additionalTargetCondition(purchaseId))).get();
  }

  function additionalTargetCondition(purchaseId: string) {
    return and(eq(purchaseCostOrders.kind, "additional"), eq(purchaseCostOrders.state, "recorded"), sql`NOT EXISTS (SELECT 1 FROM ${purchaseOrderCorrections} WHERE ${purchaseOrderCorrections.previousOrderId} = ${purchaseCostOrders.id})`, eq(purchaseCostTrackings.purchaseId, purchaseId));
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
        throw new QcDomainError(`Limite QC atingido. Tente novamente em ${seconds} s.`, 429, "QC_RATE_LIMIT", { retryAfterSeconds: seconds });
      }
    }
    return purchase;
  }

  async function addEvent(purchaseId: string, workspaceId: string, eventType: "QC_IMPORT" | "QC_MATCH" | "QC_DELETE" | "QC_FALLBACK", resultCode: string, context: unknown) {
    await db.insert(qcEvents).values({ id: randomUUID(), workspaceId, purchaseId, actorId: userId, eventType, resultCode, contextJson: JSON.stringify(context), createdAt: nowDate(now) }).run();
  }

  async function repairPresentation(tx: Pick<AppDatabase, "select" | "insert" | "update">, purchaseId: string, itemIds: Array<string | null | undefined>, stamp = nowDate(now)) {
    const changes: { itemId: string; fromImageId: string | null; toImageId: string | null }[] = [];
    const uniqueIds = [...new Set(itemIds.filter((value): value is string => !!value).map(value => parseTargetKey(value).key))];
    for (const itemKey of uniqueIds) {
      const target = parseTargetKey(itemKey);
      const item = await resolveTarget(tx, purchaseId, target.key);
      if (!item) continue;
      const current = target.origin === "purchase"
        ? await tx.select().from(qcPresentations).where(eq(qcPresentations.purchaseItemId, target.id)).get()
        : await tx.select().from(qcAdditionalPresentations).where(eq(qcAdditionalPresentations.additionalOrderItemId, target.id)).get();
      if (current?.primaryImageId) {
        const valid = await tx.select({ id: qcImages.id }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).where(and(eq(qcImages.id, current.primaryImageId), eq(hubbuyExternalItems.purchaseId, purchaseId), targetCondition(target), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).get();
        if (valid) continue;
      }
      const fallback = await tx.select({ id: qcImages.id }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).where(and(eq(hubbuyExternalItems.purchaseId, purchaseId), targetCondition(target), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).orderBy(asc(qcImages.ordinal), asc(qcImages.createdAt), asc(qcImages.id)).limit(1).get();
      if (current) {
        if (current.primaryImageId === (fallback?.id ?? null)) continue;
        if (target.origin === "purchase") await tx.update(qcPresentations).set({ primaryImageId: fallback?.id ?? null, revision: current.revision + 1, updatedBy: userId, updatedAt: stamp }).where(and(eq(qcPresentations.purchaseItemId, target.id), eq(qcPresentations.revision, current.revision))).run();
        else await tx.update(qcAdditionalPresentations).set({ primaryImageId: fallback?.id ?? null, revision: current.revision + 1, updatedBy: userId, updatedAt: stamp }).where(and(eq(qcAdditionalPresentations.additionalOrderItemId, target.id), eq(qcAdditionalPresentations.revision, current.revision))).run();
        changes.push({ itemId: target.key, fromImageId: current.primaryImageId, toImageId: fallback?.id ?? null });
      } else if (fallback) {
        if (target.origin === "purchase") await tx.insert(qcPresentations).values({ purchaseItemId: target.id, primaryImageId: fallback.id, revision: 0, updatedBy: userId, updatedAt: stamp }).onConflictDoNothing().run();
        else await tx.insert(qcAdditionalPresentations).values({ additionalOrderItemId: target.id, primaryImageId: fallback.id, revision: 0, updatedBy: userId, updatedAt: stamp }).onConflictDoNothing().run();
      }
    }
    return changes;
  }

  async function requeueSource(tx: Pick<AppDatabase, "select" | "update">, source: typeof qcImageSources.$inferSelect, importId: string, stamp: Date) {
    if (source.bytesReserved > 0 && source.importId) {
      await tx.update(qcImports).set({ bytesReserved: sql`max(0, ${qcImports.bytesReserved} - ${source.bytesReserved})`, bytesConsumed: sql`${qcImports.bytesConsumed} + ${source.bytesReserved}`, updatedAt: stamp }).where(eq(qcImports.id, source.importId)).run();
    }
    const updated = await tx.update(qcImageSources).set({ importId, state: "pending", bytesReserved: 0, bytesConsumed: 0, errorCode: null, updatedAt: stamp }).where(and(eq(qcImageSources.id, source.id), source.importId === null ? isNull(qcImageSources.importId) : eq(qcImageSources.importId, source.importId), eq(qcImageSources.externalItemId, source.externalItemId), inArray(qcImageSources.state, ["deleted", "pending", "failed"]))).returning({ id: qcImageSources.id }).get();
    if (!updated) throw new DomainError("A fonte QC mudou durante a restauração. Analise o JSON novamente.", 409, "QC_REIMPORT_PREPARE_REQUIRED");
  }

  async function restoreDeletedImage(tx: Pick<AppDatabase, "select" | "update" | "insert">, entry: PreviewOccurrence, source: typeof qcImageSources.$inferSelect, image: typeof qcImages.$inferSelect, importId: string, stamp: Date, previewOverride?: typeof qcImagePreviews.$inferSelect | null) {
    const included = entry.occurrence.photos.some(photo => photo.urlHash === source.sourceUrlHash);
    const snapshot = entry.restoreSnapshots?.find(candidate => candidate.imageId === image.id);
    if (!included || !snapshot || snapshot.revision !== image.revision || snapshot.r2Key !== image.r2Key || snapshot.contentSha256 !== image.contentSha256) {
      throw new DomainError("Esta foto foi excluída depois da prévia. Analise o mesmo JSON novamente para confirmar a restauração.", 409, "QC_REIMPORT_PREPARE_REQUIRED");
    }
    if (image.status !== "deleted" || image.deleteState !== "deleted" || image.claimToken || image.claimExpiresAt || image.errorCode) {
      throw new DomainError("A remoção física desta foto ainda está sendo conciliada. Repita a remoção e analise o JSON novamente.", 409, "QC_REIMPORT_CLEANUP_PENDING");
    }
    const preview = previewOverride === undefined ? await tx.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, image.id)).get() : previewOverride ?? undefined;
    if ((snapshot.preview === null) !== (preview === undefined) || (preview && (snapshot.preview?.revision !== preview.revision || snapshot.preview.r2Key !== preview.r2Key))) {
      throw new DomainError("O preview QC mudou depois da prévia. Analise o mesmo JSON novamente para confirmar a restauração.", 409, "QC_REIMPORT_PREPARE_REQUIRED");
    }
    if (preview && (preview.status !== "deleted" || preview.deleteState !== "deleted" || preview.claimToken || preview.claimExpiresAt || preview.errorCode)) {
      throw new DomainError("A remoção do preview privado ainda está sendo conciliada. Repita a remoção e analise o JSON novamente.", 409, "QC_REIMPORT_CLEANUP_PENDING");
    }

    const generation = randomUUID();
    const external = await tx.select().from(hubbuyExternalItems).where(eq(hubbuyExternalItems.id, image.externalItemId)).get();
    if (!external) throw new DomainError("A ocorrência QC desta foto não foi encontrada.", 409, "QC_REIMPORT_PREPARE_REQUIRED");
    const extension = image.mimeType === "image/jpeg" ? "jpg" : image.mimeType === "image/webp" ? "webp" : "png";
    const imageKey = `qc/${external.workspaceId}/${external.purchaseId}/${external.id}/${image.id}-g${generation}.${extension}`;
    const restored = await tx.update(qcImages).set({
      status: "pending", deleteState: "none", r2Key: imageKey,
      deletedAt: null, deletedBy: null, claimToken: null, claimExpiresAt: null, errorCode: null,
      revision: image.revision + 1, updatedAt: stamp,
    }).where(and(eq(qcImages.id, image.id), eq(qcImages.revision, image.revision), eq(qcImages.r2Key, image.r2Key), eq(qcImages.status, "deleted"), eq(qcImages.deleteState, "deleted"))).returning({ id: qcImages.id }).get();
    if (!restored) throw new DomainError("A foto QC mudou durante a restauração. Analise o JSON novamente.", 409, "QC_REIMPORT_PREPARE_REQUIRED");
    if (preview) {
      const previewRestored = await tx.update(qcImagePreviews).set({
        status: "pending", deleteState: "none", r2Key: `qc/previews/${QC_PREVIEW.version}/${image.id}-g${generation}.webp`,
        transformVersion: QC_PREVIEW.version, sha256: null, byteSize: null, width: null, height: null, deletedAt: null,
        claimToken: null, claimExpiresAt: null, errorCode: null, revision: preview.revision + 1, updatedAt: stamp,
      }).where(and(eq(qcImagePreviews.imageId, image.id), eq(qcImagePreviews.revision, preview.revision), eq(qcImagePreviews.r2Key, preview.r2Key), eq(qcImagePreviews.status, "deleted"), eq(qcImagePreviews.deleteState, "deleted"))).returning({ imageId: qcImagePreviews.imageId }).get();
      if (!previewRestored) throw new DomainError("O preview QC mudou durante a restauração. Analise o JSON novamente.", 409, "QC_REIMPORT_PREPARE_REQUIRED");
    }
    await requeueSource(tx, source, importId, stamp);
    const linkedSource = await tx.update(qcImageSources).set({ imageId: image.id, updatedAt: stamp }).where(and(eq(qcImageSources.id, source.id), eq(qcImageSources.importId, importId), eq(qcImageSources.state, "pending"))).returning({ id: qcImageSources.id }).get();
    if (!linkedSource) throw new DomainError("A fonte QC mudou durante a restauração. Analise o JSON novamente.", 409, "QC_REIMPORT_PREPARE_REQUIRED");
    await tx.insert(qcEvents).values({ id: randomUUID(), workspaceId: external.workspaceId, purchaseId: external.purchaseId, actorId: userId, eventType: "QC_IMPORT", resultCode: "REIMPORT_QUEUED", contextJson: JSON.stringify({ importId, externalItemId: external.id, imageId: image.id, previousRevision: image.revision }), createdAt: stamp }).run();
    return image.id;
  }

  async function getRestoreEntry(importId: string | null, external: typeof hubbuyExternalItems.$inferSelect, sourceUrlHash: string) {
    if (!importId) return null;
    const row = await db.select().from(qcImports).where(eq(qcImports.id, importId)).get();
    if (!row || row.purchaseId !== external.purchaseId || row.status !== "confirmed") return null;
    const manifest = JSON.parse(row.manifestJson) as ImportManifest;
    return manifest.rows.find(entry => {
      const occurrence = entry.occurrence;
      const sameIdentity = entry.existingId === external.id || occurrence.orderNo === external.orderNo && (
        !!occurrence.orderGoodsId && occurrence.orderGoodsId === external.orderGoodsId ||
        !!occurrence.orderGoodsNo && occurrence.orderGoodsNo === external.orderGoodsNo
      );
      return sameIdentity && occurrence.photos.some(photo => photo.urlHash === sourceUrlHash);
    }) ?? null;
  }

  function hasRestoreGrant(entry: PreviewOccurrence | null, imageId: string, sourceUrlHash: string) {
    return !!entry && entry.occurrence.photos.some(photo => photo.urlHash === sourceUrlHash) && !!entry.restoreSnapshots?.some(snapshot => snapshot.imageId === imageId);
  }

  async function getTargets(purchaseId: string, source: Pick<AppDatabase, "select"> = db) {
    const rows = await source.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, purchaseId)).orderBy(asc(purchaseItems.createdAt)).all();
    const additional = await source.select({ id: purchaseAdditionalOrderItems.id, name: purchaseAdditionalOrderItems.name, url: purchaseAdditionalOrderItems.url, variant: purchaseAdditionalOrderItems.variant, quantity: purchaseAdditionalOrderItems.quantity, createdAt: purchaseAdditionalOrderItems.createdAt })
      .from(purchaseAdditionalOrderItems).innerJoin(purchaseCostOrders, eq(purchaseAdditionalOrderItems.orderId, purchaseCostOrders.id))
      .innerJoin(purchaseCostTrackings, eq(purchaseCostOrders.trackingId, purchaseCostTrackings.id))
      .where(and(eq(purchaseCostTrackings.purchaseId, purchaseId), eq(purchaseCostOrders.kind, "additional"), eq(purchaseCostOrders.state, "recorded"), sql`NOT EXISTS (SELECT 1 FROM ${purchaseOrderCorrections} WHERE ${purchaseOrderCorrections.previousOrderId} = ${purchaseCostOrders.id})`))
      .orderBy(asc(purchaseAdditionalOrderItems.createdAt)).all();
    return [
      ...rows.map(row => ({ id: `purchase:${row.id}`, origin: "purchase" as const, name: row.name, url: row.url, variant: row.variant, quantity: row.quantity })),
      ...additional.map(row => ({ id: `additional:${row.id}`, origin: "additional" as const, name: row.name, url: row.url, variant: row.variant, quantity: row.quantity })),
    ];
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
      const itemKey = targetKeyForExternal(external.find(row => row.id === image.externalItemId) ?? { purchaseItemId: null, additionalOrderItemId: null });
      if (itemKey) counts.set(itemKey, (counts.get(itemKey) ?? 0) + 1);
    }
    let pendingRows: { externalItemId: string; revision: number; orderNo: string | null; orderGoodsId: string | null; orderGoodsNo: string | null; skuInfo: string | null; title: string | null; quantity: number | null; photoCount: number; candidates: QcMatch["candidates"] }[] = [];
    let pendingTransfers = 0;
    if (manage) {
      const targets = await getTargets(purchaseId);
      const targetIds = new Set(targets.map(target => target.id));
      pendingRows = external.flatMap(row => {
        if (targetKeyForExternal(row) !== null) return [];
        const match = suggestQcMatch(occurrenceFromExternal(row), targets);
        if (match.status !== "PENDING" || match.candidates.length === 0) return [];
        const candidates = match.candidates.filter(candidate => targetIds.has(candidate.itemId));
        return candidates.length ? [{ externalItemId: row.id, revision: row.revision, orderNo: row.orderNo, orderGoodsId: row.orderGoodsId, orderGoodsNo: row.orderGoodsNo, skuInfo: row.skuInfo, title: row.title, quantity: row.quantity, photoCount: sources.filter(source => source.externalItemId === row.id).length, candidates }] : [];
      });
      const linkedExternalIds = new Set(external.filter(row => targetKeyForExternal(row) !== null).map(row => row.id));
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
    const target = parseTargetKey(itemId);
    const item = await resolveTarget(db, purchaseId, target.key);
    if (!item) throw new DomainError("Produto não encontrado nesta compra.", 404, "QC_ITEM_NOT_FOUND");
    const scope = targetCondition(target);
    const safeLimit = Math.min(12, Math.max(1, limit));
    let offset = Math.max(0, requestedOffset);
    if (targetImageId) {
      const targetImage = await db.select({ id: qcImages.id, ordinal: qcImages.ordinal, createdAt: qcImages.createdAt }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).where(and(eq(qcImages.id, targetImageId), eq(hubbuyExternalItems.purchaseId, purchaseId), scope, eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).get();
      if (!targetImage) throw new DomainError("Imagem QC não encontrada para este produto.", 404, "QC_IMAGE_NOT_FOUND");
      const before = await db.select({ value: count() }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).where(and(eq(hubbuyExternalItems.purchaseId, purchaseId), scope, eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"), or(sql`${qcImages.ordinal} < ${targetImage.ordinal}`, and(eq(qcImages.ordinal, targetImage.ordinal), sql`${qcImages.createdAt} < ${targetImage.createdAt}`), and(eq(qcImages.ordinal, targetImage.ordinal), eq(qcImages.createdAt, targetImage.createdAt), sql`${qcImages.id} < ${targetImage.id}`)))).get();
      offset = Math.floor(Number(before?.value ?? 0) / safeLimit) * safeLimit;
    }
    const rows = await db.select({ image: qcImages, occurrence: sql<string>`coalesce(${hubbuyExternalItems.skuInfo}, ${hubbuyExternalItems.title}, 'Ocorrência HubBuy')` }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).where(and(eq(hubbuyExternalItems.purchaseId, purchaseId), scope, eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).orderBy(asc(qcImages.ordinal), asc(qcImages.createdAt), asc(qcImages.id)).limit(safeLimit).offset(offset).all();
    const totalRow = await db.select({ value: count() }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).where(and(eq(hubbuyExternalItems.purchaseId, purchaseId), scope, eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).get();
    const totalCount = Number(totalRow?.value ?? 0);
    const presentation = target.origin === "purchase"
      ? await db.select({ revision: qcPresentations.revision, imageId: sql<string | null>`CASE WHEN ${hubbuyExternalItems.id} IS NOT NULL THEN ${qcImages.id} ELSE NULL END` }).from(qcPresentations).leftJoin(qcImages, and(eq(qcPresentations.primaryImageId, qcImages.id), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).leftJoin(hubbuyExternalItems, and(eq(qcImages.externalItemId, hubbuyExternalItems.id), eq(hubbuyExternalItems.purchaseId, purchaseId), eq(hubbuyExternalItems.purchaseItemId, target.id))).where(eq(qcPresentations.purchaseItemId, target.id)).get()
      : await db.select({ revision: qcAdditionalPresentations.revision, imageId: sql<string | null>`CASE WHEN ${hubbuyExternalItems.id} IS NOT NULL THEN ${qcImages.id} ELSE NULL END` }).from(qcAdditionalPresentations).leftJoin(qcImages, and(eq(qcAdditionalPresentations.primaryImageId, qcImages.id), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).leftJoin(hubbuyExternalItems, and(eq(qcImages.externalItemId, hubbuyExternalItems.id), eq(hubbuyExternalItems.purchaseId, purchaseId), eq(hubbuyExternalItems.additionalOrderItemId, target.id))).where(eq(qcAdditionalPresentations.additionalOrderItemId, target.id)).get();
    const imageIds = rows.map(row => row.image.id);
    const previews = imageIds.length ? await db.select().from(qcImagePreviews).where(and(inArray(qcImagePreviews.imageId, imageIds), eq(qcImagePreviews.status, "ready"), eq(qcImagePreviews.deleteState, "none"))).all() : [];
    const previewVersions = new Map(previews.map(row => [row.imageId, qcPreviewVersion(row)]));
    const manage = !!managerId && managerId === userId;
    return { itemId: target.key, pageOffset: offset, totalCount, presentationRevision: presentation?.revision ?? 0, primaryImageId: presentation?.imageId ?? null, canSetCover: manage, images: rows.map(row => ({ id: row.image.id, previewVersion: previewVersions.get(row.image.id) ?? null, previewUrl: previewVersions.has(row.image.id) ? `/api/qc/images/${encodeURIComponent(row.image.id)}/preview?v=${previewVersions.get(row.image.id)}` : null, width: row.image.width, height: row.image.height, occurrence: row.occurrence })), nextOffset: offset + rows.length < totalCount ? offset + rows.length : null };
  }

  async function getQcPresentations(purchaseId: string, itemIds: string[]) {
    await authorizedPurchase(purchaseId);
    if (!Array.isArray(itemIds) || itemIds.length > 20 || itemIds.some(id => typeof id !== "string" || !id || id.length > 220)) throw new DomainError("A solicitação de capas QC deve conter até 20 produtos distintos.", 400, "QC_PRESENTATION_BATCH_INVALID");
    const targets = itemIds.map(parseTargetKey);
    if (targets.some(target => !target.id || target.id.length > 200) || new Set(targets.map(target => target.key)).size !== targets.length) throw new DomainError("Destinos QC inválidos ou repetidos.", 400, "QC_PRESENTATION_BATCH_INVALID");
    if (!targets.length) return { purchaseId, items: [] };
    const originalIds = targets.filter(target => target.origin === "purchase").map(target => target.id);
    const additionalIds = targets.filter(target => target.origin === "additional").map(target => target.id);
    const owned = originalIds.length ? await db.select({ id: purchaseItems.id }).from(purchaseItems).where(and(eq(purchaseItems.purchaseId, purchaseId), inArray(purchaseItems.id, originalIds))).all() : [];
    const additional = additionalIds.length ? await db.select({ id: purchaseAdditionalOrderItems.id }).from(purchaseAdditionalOrderItems)
      .innerJoin(purchaseCostOrders, eq(purchaseAdditionalOrderItems.orderId, purchaseCostOrders.id))
      .innerJoin(purchaseCostTrackings, eq(purchaseCostOrders.trackingId, purchaseCostTrackings.id))
      .where(and(inArray(purchaseAdditionalOrderItems.id, additionalIds), additionalTargetCondition(purchaseId))).all() : [];
    if (owned.length + additional.length !== targets.length) throw new DomainError("Um produto não pertence a esta compra.", 404, "QC_ITEM_NOT_FOUND");
    const keys = JSON.stringify(targets.map(target => target.key));
    // Bounded sets per kind, never one gallery/query per product.
    const targetKey = sql`CASE WHEN h.purchase_item_id IS NOT NULL THEN 'purchase:' || h.purchase_item_id ELSE 'additional:' || h.additional_order_item_id END`;
    const counts = await db.all<{ item_key: string; total: number }>(sql`
      SELECT ${targetKey} AS item_key, count(*) AS total FROM qc_images q JOIN hubbuy_external_items h ON h.id = q.external_item_id
      WHERE h.purchase_id = ${purchaseId} AND ${targetKey} IN (SELECT value FROM json_each(${keys})) AND q.status = 'ready' AND q.delete_state = 'none'
      GROUP BY item_key`);
    const presentations = await db.all<{ item_key: string; image_id: string | null; revision: number }>(sql`
      WITH presentations AS (
        SELECT 'purchase:' || purchase_item_id AS item_key, primary_image_id, revision FROM qc_presentations
        UNION ALL SELECT 'additional:' || additional_order_item_id, primary_image_id, revision FROM qc_additional_presentations
      ) SELECT p.item_key, CASE WHEN h.id IS NOT NULL THEN q.id ELSE NULL END AS image_id, p.revision
      FROM presentations p LEFT JOIN qc_images q ON q.id = p.primary_image_id AND q.status = 'ready' AND q.delete_state = 'none'
      LEFT JOIN hubbuy_external_items h ON h.id = q.external_item_id AND h.purchase_id = ${purchaseId} AND ${targetKey} = p.item_key
      WHERE p.item_key IN (SELECT value FROM json_each(${keys}))`);
    const rows = await db.all<{ item_key: string; image_id: string; width: number; height: number; occurrence: string; sha256: string; transform_version: string; r2_key: string; revision: number }>(sql`
      WITH presentations AS (
        SELECT 'purchase:' || purchase_item_id AS item_key, primary_image_id FROM qc_presentations
        UNION ALL SELECT 'additional:' || additional_order_item_id, primary_image_id FROM qc_additional_presentations
      ), ranked AS (
        SELECT ${targetKey} AS item_key, q.id AS image_id, p.width, p.height,
          coalesce(h.sku_info, h.title, 'Ocorrência HubBuy') AS occurrence, p.sha256, p.transform_version, p.r2_key, p.revision,
          row_number() OVER (PARTITION BY ${targetKey} ORDER BY CASE WHEN q.id = c.primary_image_id THEN 0 ELSE 1 END, q.ordinal, q.created_at, q.id) AS position
        FROM qc_images q JOIN hubbuy_external_items h ON h.id = q.external_item_id
        JOIN qc_image_previews p ON p.image_id = q.id AND p.status = 'ready' AND p.delete_state = 'none'
        LEFT JOIN presentations c ON c.item_key = ${targetKey}
        WHERE h.purchase_id = ${purchaseId} AND ${targetKey} IN (SELECT value FROM json_each(${keys})) AND q.status = 'ready' AND q.delete_state = 'none'
      ) SELECT * FROM ranked WHERE position <= 4 ORDER BY item_key, position`);
    const countsByKey = new Map(counts.map(row => [row.item_key, Number(row.total)]));
    const covers = new Map(presentations.map(row => [row.item_key, row]));
    return { purchaseId, items: targets.map(target => {
      const presentation = covers.get(target.key), total = countsByKey.get(target.key) ?? 0;
      const previews = rows.filter(row => row.item_key === target.key).map(row => {
        const previewVersion = qcPreviewVersion({ sha256: row.sha256, transformVersion: row.transform_version, r2Key: row.r2_key, revision: row.revision });
        return { imageId: row.image_id, previewVersion, previewUrl: `/api/qc/images/${encodeURIComponent(row.image_id)}/preview?v=${previewVersion}`, width: row.width, height: row.height, occurrence: row.occurrence };
      });
      const coverPreview = previews.find(row => row.imageId === presentation?.image_id) ?? null;
      const thumbnails = previews.filter(row => row.imageId !== presentation?.image_id).slice(0, 3);
      return { itemId: target.key, purchaseItemId: target.id, qcCount: total, primaryImageId: presentation?.image_id ?? null, presentationRevision: presentation?.revision ?? 0, coverPreview, canSetCover: !!managerId && managerId === userId, previews: thumbnails, remainingCount: Math.max(0, total - thumbnails.length - (coverPreview ? 1 : 0)) };
    }) };
  }

  async function getOriginalSource(imageId: string) {
    const image = await db.select().from(qcImages).where(and(eq(qcImages.id, imageId), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).get();
    const external = image ? await db.select().from(hubbuyExternalItems).where(eq(hubbuyExternalItems.id, image.externalItemId)).get() : null;
    if (!image || !external || !targetKeyForExternal(external) || !await resolveTarget(db, external.purchaseId, targetKeyForExternal(external)!)) throw new DomainError("Imagem QC não encontrada.", 404, "QC_IMAGE_NOT_FOUND");
    await rate(external.purchaseId, "preview");
    const sources = await db.select({ sourceUrl: qcImageSources.sourceUrl }).from(qcImageSources).where(and(eq(qcImageSources.imageId, imageId), eq(qcImageSources.state, "ready"))).orderBy(asc(qcImageSources.createdAt)).limit(1).get();
    return { sourceUrl: localQaStorage ? `/api/orders-transition/qc/${encodeURIComponent(imageId)}` : validateHubbuySourceUrl(sources?.sourceUrl ?? image.sourceUrl).toString() };
  }

  async function readPreview(imageId: string, ifNoneMatch: string | null = null) {
    const image = await db.select().from(qcImages).where(and(eq(qcImages.id, imageId), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).get();
    const external = image ? await db.select().from(hubbuyExternalItems).where(eq(hubbuyExternalItems.id, image.externalItemId)).get() : null;
    if (!image || !external || !targetKeyForExternal(external) || !await resolveTarget(db, external.purchaseId, targetKeyForExternal(external)!)) throw new DomainError("Preview QC não encontrado.", 404, "QC_IMAGE_NOT_FOUND");
    await rate(external.purchaseId, "preview");
    const preview = await db.select().from(qcImagePreviews).where(and(eq(qcImagePreviews.imageId, imageId), eq(qcImagePreviews.status, "ready"), eq(qcImagePreviews.deleteState, "none"))).get();
    if (!preview || !preview.sha256 || !preview.byteSize) throw new DomainError("Preview QC ainda não está disponível.", 404, "QC_PREVIEW_NOT_FOUND");
    const etag = qcPreviewEtag(userId, qcPreviewVersion(preview));
    if (matchesQcEtag(ifNoneMatch, etag)) return { etag, bytes: null };
    const bytes = await storage.get(preview.r2Key, QC_PREVIEW.maxBytes, config.signal);
    if (bytes.byteLength !== preview.byteSize || createHash("sha256").update(bytes).digest("hex") !== preview.sha256) throw new DomainError("O preview QC falhou na verificação de integridade.", 502, "QC_PREVIEW_INVALID");
    return { etag, bytes };
  }

  async function getPreview(imageId: string) {
    return (await readPreview(imageId)).bytes!;
  }

  async function setPresentationCover(purchaseId: string, itemId: string, imageId: string, expectedRevision: number) {
    const purchase = await authorizedPurchase(purchaseId, true);
    const target = parseTargetKey(itemId);
    if (!await resolveTarget(db, purchaseId, target.key)) throw new DomainError("Produto não encontrado nesta compra.", 404, "QC_ITEM_NOT_FOUND");
    const validImage = await db.select({ id: qcImages.id }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).where(and(eq(qcImages.id, imageId), eq(hubbuyExternalItems.purchaseId, purchaseId), targetCondition(target), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).get();
    if (!validImage) throw new DomainError("Escolha uma foto QC disponível deste produto.", 422, "QC_COVER_IMAGE_INVALID");
    const stamp = nowDate(now);
    await db.transaction(async tx => {
      await authorization(tx, userId).requirePurchase(purchaseId);
      const item = await resolveTarget(tx, purchaseId, target.key);
      if (!item) throw new DomainError("Produto não encontrado nesta compra.", 404, "QC_ITEM_NOT_FOUND");
      const current = target.origin === "purchase"
        ? await tx.select().from(qcPresentations).where(eq(qcPresentations.purchaseItemId, target.id)).get()
        : await tx.select().from(qcAdditionalPresentations).where(eq(qcAdditionalPresentations.additionalOrderItemId, target.id)).get();
      const revision = current?.revision ?? 0;
      if (revision !== expectedRevision) throw new DomainError("A capa mudou. Atualize a galeria e tente novamente.", 409, "QC_REVISION_CONFLICT");
      const stillValid = await tx.select({ id: qcImages.id }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).where(and(eq(qcImages.id, imageId), eq(hubbuyExternalItems.purchaseId, purchaseId), targetCondition(target), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).get();
      if (!stillValid) throw new DomainError("A foto QC mudou antes de salvar a capa.", 409, "QC_COVER_IMAGE_INVALID");
      if (current) {
        const changed = target.origin === "purchase"
          ? await tx.update(qcPresentations).set({ primaryImageId: imageId, revision: revision + 1, updatedBy: userId, updatedAt: stamp }).where(and(eq(qcPresentations.purchaseItemId, target.id), eq(qcPresentations.revision, revision))).returning({ revision: qcPresentations.revision }).get()
          : await tx.update(qcAdditionalPresentations).set({ primaryImageId: imageId, revision: revision + 1, updatedBy: userId, updatedAt: stamp }).where(and(eq(qcAdditionalPresentations.additionalOrderItemId, target.id), eq(qcAdditionalPresentations.revision, revision))).returning({ revision: qcAdditionalPresentations.revision }).get();
        if (!changed) throw new DomainError("A capa mudou em outra solicitação.", 409, "QC_REVISION_CONFLICT");
      } else {
        if (target.origin === "purchase") await tx.insert(qcPresentations).values({ purchaseItemId: target.id, primaryImageId: imageId, revision: 1, updatedBy: userId, updatedAt: stamp }).run();
        else await tx.insert(qcAdditionalPresentations).values({ additionalOrderItemId: target.id, primaryImageId: imageId, revision: 1, updatedBy: userId, updatedAt: stamp }).run();
      }
      await tx.insert(qcEvents).values({ id: randomUUID(), workspaceId: purchase.workspaceId, purchaseId, actorId: userId, eventType: "QC_MATCH", resultCode: "COVER_SET", contextJson: JSON.stringify({ targetKey: target.key, imageId, previousImageId: current?.primaryImageId ?? null, revision: revision + 1 }), createdAt: stamp }).run();
    });
    return { targetKey: target.key, primaryImageId: imageId, revision: expectedRevision + 1 };
  }

  async function photographedTargetKeys(purchaseId: string, source: Pick<AppDatabase, "select"> = db) {
    const images = await source.select({ purchaseItemId: hubbuyExternalItems.purchaseItemId, additionalOrderItemId: hubbuyExternalItems.additionalOrderItemId })
      .from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id))
      .where(and(eq(hubbuyExternalItems.purchaseId, purchaseId), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).all();
    return new Set(images.flatMap(image => { const key = targetKeyForExternal(image); return key ? [key] : []; }));
  }

  async function prepare(purchaseId: string, raw: unknown) {
    const purchase = await rate(purchaseId, "prepare");
    const parsed = await measureQcStage(metrics, "parse", () => parseHubBuyImport(raw));
    const targets = await getTargets(purchaseId);
    const photographed = await photographedTargetKeys(purchaseId);
    const eligibleTargets = targets.filter(target => !photographed.has(target.id));
    const existing = await db.select().from(hubbuyExternalItems).where(eq(hubbuyExternalItems.purchaseId, purchaseId)).all();
    const preliminary = await measureQcStage(metrics, "matching", () => parsed.occurrences.map(occurrence => {
      const main = occurrence.orderGoodsId ? existing.filter(row => row.orderNo === occurrence.orderNo && row.orderGoodsId === occurrence.orderGoodsId) : [];
      const alternate = occurrence.orderGoodsNo ? existing.filter(row => row.orderNo === occurrence.orderNo && row.orderGoodsNo === occurrence.orderGoodsNo) : [];
      const combined = [...new Map([...main, ...alternate].map(row => [row.id, row])).values()];
      const conflicting = combined.length > 1 || main.some(row => row.orderGoodsNo && occurrence.orderGoodsNo && row.orderGoodsNo !== occurrence.orderGoodsNo) || alternate.some(row => row.orderGoodsId && occurrence.orderGoodsId && row.orderGoodsId !== occurrence.orderGoodsId);
      if (conflicting) return { occurrence, match: { status: "IGNORED" as const, targetItemId: null, candidates: [] }, existing: null, existingId: null, existingRevision: null, existingItemId: null, conflict: "IDs HubBuy conflitantes" };
      const found = combined[0];
      const existingTargetKey = found ? targetKeyForExternal(found) : null;
      const match = suggestQcMatch(occurrence, targets, existingTargetKey);
      return { occurrence, match, existing: found ?? null, existingId: found?.id ?? null, existingRevision: found?.revision ?? null, existingItemId: existingTargetKey };
    }).filter(entry => eligibleTargets.length > 0 && entry.occurrence.photos.length > 0
      && !(entry.existingItemId && photographed.has(entry.existingItemId))
      && !(entry.match.targetItemId && photographed.has(entry.match.targetItemId)))
      .map(entry => ({ ...entry, match: normalizeQcMatch({ ...entry.match, candidates: entry.match.candidates.filter(candidate => !photographed.has(candidate.itemId)) }) })));
    const matchedExternalIds = [...new Set(preliminary.flatMap(entry => entry.existingId ? [entry.existingId] : []))];
    const tombstones = matchedExternalIds.length ? await db.select().from(qcImages).where(and(inArray(qcImages.externalItemId, matchedExternalIds), eq(qcImages.status, "deleted"))).all() : [];
    const tombstoneIds = tombstones.map(image => image.id);
    const previews = tombstoneIds.length ? await db.select().from(qcImagePreviews).where(inArray(qcImagePreviews.imageId, tombstoneIds)).all() : [];
    const previewByImageId = new Map(previews.map(preview => [preview.imageId, preview]));
    const tombstonesByExternalId = new Map<string, QcRestoreSnapshot[]>();
    for (const image of tombstones) {
      const snapshot = { imageId: image.id, revision: image.revision, r2Key: image.r2Key, sourceUrlHash: image.sourceUrlHash, contentSha256: image.contentSha256, preview: previewByImageId.get(image.id) ? { revision: previewByImageId.get(image.id)!.revision, r2Key: previewByImageId.get(image.id)!.r2Key } : null };
      const prior = tombstonesByExternalId.get(image.externalItemId) ?? [];
      prior.push(snapshot);
      tombstonesByExternalId.set(image.externalItemId, prior);
    }
    const rows: PreviewOccurrence[] = preliminary.map(({ existing, ...entry }) => {
      const restoreSnapshots = existing ? tombstonesByExternalId.get(existing.id) ?? [] : [];
      return { ...entry, ...(restoreSnapshots.length ? { restoreSnapshots } : {}) };
    });
    const photoCount = rows.reduce((total, entry) => total + entry.occurrence.photos.length, 0);
    const orderCount = new Set(rows.map(entry => entry.occurrence.orderNo)).size;
    const skippedOccurrenceCount = parsed.occurrences.length - rows.length;
    const manifest: ImportManifest = { ...parsed, occurrences: rows.map(entry => entry.occurrence), orderCount, photoCount, rows, emptyTargetsOnly: true };
    const id = randomUUID(), date = nowDate(now), expires = new Date(now() + QC_LIMITS.manifestMs);
    const json = JSON.stringify(manifest);
    if (Buffer.byteLength(json, "utf8") > QC_LIMITS.bodyBytes) throw new DomainError("O manifesto QC excede 1 MiB.", 413, "QC_BODY_LIMIT");
    await db.transaction(async tx => {
      await tx.insert(qcImports).values({ id, workspaceId: purchase.workspaceId, purchaseId, actorId: userId, manifestJson: json, status: "prepared", revision: 0, bytesReserved: 0, bytesConsumed: 0, expiresAt: expires, createdAt: date, updatedAt: date }).run();
      await tx.insert(qcEvents).values({ id: randomUUID(), workspaceId: purchase.workspaceId, purchaseId, actorId: userId, eventType: "QC_IMPORT", resultCode: "PREPARED", contextJson: JSON.stringify({ importId: id, orders: orderCount, occurrences: rows.length, photos: photoCount, skippedOccurrenceCount }), createdAt: date }).run();
    });
    return { importId: id, revision: 0, expiresAt: expires.toISOString(), partial: parsed.partial, orderCount, photoCount, skippedOccurrenceCount, eligibleTargetKeys: eligibleTargets.map(target => target.id), rows: rows.map(row => ({ externalKey: row.occurrence.externalKey, orderNo: row.occurrence.orderNo, orderGoodsId: row.occurrence.orderGoodsId, orderGoodsNo: row.occurrence.orderGoodsNo, offerId: row.occurrence.offerId, skuInfo: row.occurrence.skuInfo, title: row.occurrence.title, quantity: row.occurrence.quantity, photoCount: row.occurrence.photos.length, match: row.match, existingItemId: row.existingItemId, conflict: row.conflict ?? null })) };
  }

  async function getImport(importId: string) {
    const row = await db.select().from(qcImports).where(eq(qcImports.id, importId)).get();
    if (!row) throw new DomainError("Importação QC não encontrada.", 404, "QC_IMPORT_NOT_FOUND");
    await authorizedPurchase(row.purchaseId, true);
    const manifest = JSON.parse(row.manifestJson) as ImportManifest;
    manifest.rows = manifest.rows.map(entry => ({ ...entry, match: normalizeQcMatch(entry.match) }));
    // Progress belongs to the confirmed transfer, not every photo in the pasted
    // JSON or in the purchase's existing galleries. Completed work in this same
    // transfer stays visible when the drawer is reopened.
    const externals = await db.select().from(hubbuyExternalItems).where(eq(hubbuyExternalItems.purchaseId, row.purchaseId)).all();
    const validTargetKeys = new Set<string>();
    const purchaseTargetIds = [...new Set(externals.flatMap(external => external.purchaseItemId ? [external.purchaseItemId] : []))];
    const additionalTargetIds = [...new Set(externals.flatMap(external => external.additionalOrderItemId ? [external.additionalOrderItemId] : []))];
    if (purchaseTargetIds.length) {
      const valid = await db.select({ id: purchaseItems.id }).from(purchaseItems).where(and(eq(purchaseItems.purchaseId, row.purchaseId), inArray(purchaseItems.id, purchaseTargetIds))).all();
      for (const target of valid) validTargetKeys.add(`purchase:${target.id}`);
    }
    if (additionalTargetIds.length) {
      const valid = await db.select({ id: purchaseAdditionalOrderItems.id }).from(purchaseAdditionalOrderItems)
        .innerJoin(purchaseCostOrders, eq(purchaseAdditionalOrderItems.orderId, purchaseCostOrders.id))
        .innerJoin(purchaseCostTrackings, eq(purchaseCostOrders.trackingId, purchaseCostTrackings.id))
        .where(and(inArray(purchaseAdditionalOrderItems.id, additionalTargetIds), eq(purchaseCostOrders.kind, "additional"), eq(purchaseCostOrders.state, "recorded"), sql`NOT EXISTS (SELECT 1 FROM ${purchaseOrderCorrections} WHERE ${purchaseOrderCorrections.previousOrderId} = ${purchaseCostOrders.id})`, eq(purchaseCostTrackings.purchaseId, row.purchaseId))).all();
      for (const target of valid) validTargetKeys.add(`additional:${target.id}`);
    }
    const validExternalIds = new Set(externals.flatMap(external => { const targetKey = targetKeyForExternal(external); return targetKey && validTargetKeys.has(targetKey) ? [external.id] : []; }));
    const hashes = [...new Set(manifest.rows.flatMap(entry => entry.occurrence.photos.map(photo => photo.urlHash)))];
    const sources = hashes.length ? await db.select({ source: qcImageSources, image: qcImages, preview: qcImagePreviews }).from(qcImageSources)
      .innerJoin(hubbuyExternalItems, eq(qcImageSources.externalItemId, hubbuyExternalItems.id))
      .leftJoin(qcImages, eq(qcImageSources.imageId, qcImages.id))
      .leftJoin(qcImagePreviews, eq(qcImages.id, qcImagePreviews.imageId))
      .where(and(eq(hubbuyExternalItems.purchaseId, row.purchaseId), eq(qcImageSources.importId, importId), inArray(qcImageSources.sourceUrlHash, hashes), ...(manifest.transferSourceIds ? [inArray(qcImageSources.id, manifest.transferSourceIds)] : [])))
      .orderBy(asc(qcImageSources.updatedAt), asc(qcImageSources.createdAt), asc(qcImageSources.ordinal)).all() : [];
    const externalByIdentity = new Map<string, typeof externals[number]>();
    for (const external of externals) {
      if (external.orderGoodsId) externalByIdentity.set(`${external.orderNo ?? ""}\u0000id\u0000${external.orderGoodsId}`, external);
      if (external.orderGoodsNo) externalByIdentity.set(`${external.orderNo ?? ""}\u0000no\u0000${external.orderGoodsNo}`, external);
    }
    const storedByExternalAndHash = new Map(sources.map(candidate => [`${candidate.source.externalItemId}\u0000${candidate.source.sourceUrlHash}`, candidate]));
    const seenSources = new Set<string>();
    const progressCounts = new Map<string, number>();
    const photos = manifest.rows.flatMap(entry => {
      const occurrence = entry.occurrence;
      const external = entry.conflict ? undefined : occurrence.orderGoodsId
        ? externalByIdentity.get(`${occurrence.orderNo ?? ""}\u0000id\u0000${occurrence.orderGoodsId}`)
        : occurrence.orderGoodsNo ? externalByIdentity.get(`${occurrence.orderNo ?? ""}\u0000no\u0000${occurrence.orderGoodsNo}`) : undefined;
      return occurrence.photos.flatMap(photo => {
        const stored = external ? storedByExternalAndHash.get(`${external.id}\u0000${photo.urlHash}`) : undefined;
        const linked = !!external && validExternalIds.has(external.id);
        if (!linked || !stored || stored.source.state === "deleted" || stored.image?.status === "deleted" || seenSources.has(stored.source.id)) return [];
        seenSources.add(stored.source.id);
        progressCounts.set(occurrence.externalKey, (progressCounts.get(occurrence.externalKey) ?? 0) + 1);
        const ready = linked && stored?.source.state === "ready" && stored.image?.status === "ready" && stored.image.deleteState === "none";
        const state = ready ? "ready" : stored.source.state === "ready" ? "pending" : stored.source.state;
        let name = "";
        try { name = decodeURIComponent(new URL(photo.url).pathname.split("/").pop() ?? "").slice(0, 180); } catch { /* A readable fallback is provided by the UI. */ }
        return [{ id: `${occurrence.externalKey}:${photo.ordinal}`, sourceId: stored.source.id, name, occurrence: occurrence.title || occurrence.skuInfo || occurrence.orderNo,
          state, errorCode: stored?.source.errorCode ?? null, byteSize: ready ? stored!.image!.byteSize : null,
          imageId: ready ? stored!.image!.id : null,
          previewUrl: ready && stored.preview?.status === "ready" && stored.preview.deleteState === "none" && stored.preview.transformVersion === QC_PREVIEW.version ? `/api/qc/images/${stored.image!.id}/preview` : null }];
      });
    });
    const nextSourceId = sources.find(({ source }) => source.importId === importId && (source.state === "pending" || source.state === "failed") && validExternalIds.has(source.externalItemId))?.source.id ?? null;
    return { importId: row.id, purchaseId: row.purchaseId, revision: row.revision, status: row.status, expiresAt: row.expiresAt, bytesReserved: row.bytesReserved, bytesConsumed: row.bytesConsumed, photos, nextSourceId, rows: manifest.rows.filter(entry => row.status === "prepared" || progressCounts.has(entry.occurrence.externalKey)).map(entry => ({ externalKey: entry.occurrence.externalKey, skuInfo: entry.occurrence.skuInfo, title: entry.occurrence.title, photoCount: row.status === "prepared" ? entry.occurrence.photos.length : progressCounts.get(entry.occurrence.externalKey)!, match: normalizeQcMatch(entry.match), conflict: entry.conflict ?? null })) };
  }

  async function confirmImport(importId: string, expectedRevision: number, choices: Array<{ externalKey: string; targetKey?: string | null; purchaseItemId?: string | null; correctExisting?: boolean; expectedTargetKey?: string | null; expectedItemId?: string | null }>) {
    const row = await db.select().from(qcImports).where(eq(qcImports.id, importId)).get();
    if (!row) throw new DomainError("Importação QC não encontrada.", 404, "QC_IMPORT_NOT_FOUND");
    const purchase = await rate(row.purchaseId, "match");
    const current = nowDate(now);
    if (row.status !== "prepared" || !row.expiresAt || row.expiresAt.getTime() <= now()) throw new DomainError("A prévia expirou ou já foi confirmada. Prepare o JSON novamente.", 409, "QC_IMPORT_EXPIRED");
    if (row.revision !== expectedRevision) throw new DomainError("A prévia ficou desatualizada. Atualize e revise novamente.", 409, "QC_REVISION_CONFLICT");
    const manifest = JSON.parse(row.manifestJson) as ImportManifest;
    manifest.rows = manifest.rows.map(entry => ({ ...entry, match: normalizeQcMatch(entry.match) }));
    const normalizedChoices = choices.map(choice => {
      const expectedTargetKey = choice.expectedTargetKey !== undefined ? choice.expectedTargetKey : choice.expectedItemId ?? null;
      return { ...choice, targetKey: choice.targetKey !== undefined ? choice.targetKey : choice.purchaseItemId ?? null, expectedTargetKey: expectedTargetKey ? parseTargetKey(expectedTargetKey).key : null };
    });
    if (normalizedChoices.length > manifest.rows.length || new Set(normalizedChoices.map(choice => choice.externalKey)).size !== normalizedChoices.length || normalizedChoices.some(choice => !manifest.rows.some(entry => entry.occurrence.externalKey === choice.externalKey))) throw new DomainError("Escolhas QC duplicadas ou excessivas.", 400, "QC_MATCH_INVALID");
    const choicesByKey = new Map(normalizedChoices.map(choice => [choice.externalKey, choice]));
    const allowedTargetIds = new Set((await getTargets(row.purchaseId)).map(target => target.id));
    const destinationIds = normalizedChoices.map(choice => choice.targetKey).filter((id): id is string => id !== null);
    if (destinationIds.some(id => !allowedTargetIds.has(parseTargetKey(id).key))) throw new DomainError("O produto selecionado não pertence a esta compra ou não está registrado.", 403, "QC_ITEM_CROSS_PURCHASE");
    const result = { linked: 0, pendingMatching: 0, ignored: 0, sources: 0, eligibleSources: 0, restored: 0, corrected: 0 };
    const lock = await acquireLock(purchase.workspaceId);
    try { await db.transaction(async tx => {
      const activeLock = await tx.select().from(qcTransferLocks).where(eq(qcTransferLocks.scope, lock.scope)).get();
      if (activeLock?.ownerId !== lock.ownerId || activeLock.version !== lock.version || activeLock.leaseUntil <= now()) throw new DomainError("A operação QC perdeu sua concessão antes de confirmar os vínculos.", 409, "QC_TRANSFER_LEASE_LOST");
      const fresh = await tx.select().from(qcImports).where(eq(qcImports.id, importId)).get();
      if (!fresh || fresh.revision !== expectedRevision || fresh.status !== "prepared") throw new DomainError("A prévia foi alterada em outra solicitação.", 409, "QC_REVISION_CONFLICT");
      await authorization(tx, userId).requirePurchase(row.purchaseId);
      const requestedTargetKeys = manifest.rows.flatMap(entry => {
        const choice = choicesByKey.get(entry.occurrence.externalKey);
        const raw = choice ? choice.targetKey : normalizeQcMatch(entry.match).targetItemId;
        return raw ? [parseTargetKey(raw).key] : [];
      });
      if (manifest.emptyTargetsOnly) {
        const photographed = await photographedTargetKeys(row.purchaseId, tx);
        if (requestedTargetKeys.some(key => photographed.has(key))) throw new DomainError("Um produto selecionado já possui fotos QC. Analise o JSON novamente para atualizar as opções.", 409, "QC_TARGET_HAS_PHOTOS");
      }
      const purchaseTargetIdsInTransaction = [...new Set(requestedTargetKeys.flatMap(key => parseTargetKey(key).origin === "purchase" ? [parseTargetKey(key).id] : []))];
      const additionalTargetIdsInTransaction = [...new Set(requestedTargetKeys.flatMap(key => parseTargetKey(key).origin === "additional" ? [parseTargetKey(key).id] : []))];
      const validTargetKeysInTransaction = new Set<string>();
      if (purchaseTargetIdsInTransaction.length) {
        const valid = await tx.select({ id: purchaseItems.id }).from(purchaseItems).where(and(eq(purchaseItems.purchaseId, row.purchaseId), inArray(purchaseItems.id, purchaseTargetIdsInTransaction))).all();
        for (const target of valid) validTargetKeysInTransaction.add(`purchase:${target.id}`);
      }
      if (additionalTargetIdsInTransaction.length) {
        const valid = await tx.select({ id: purchaseAdditionalOrderItems.id }).from(purchaseAdditionalOrderItems)
          .innerJoin(purchaseCostOrders, eq(purchaseAdditionalOrderItems.orderId, purchaseCostOrders.id))
          .innerJoin(purchaseCostTrackings, eq(purchaseCostOrders.trackingId, purchaseCostTrackings.id))
          .where(and(inArray(purchaseAdditionalOrderItems.id, additionalTargetIdsInTransaction), eq(purchaseCostOrders.kind, "additional"), eq(purchaseCostOrders.state, "recorded"), sql`NOT EXISTS (SELECT 1 FROM ${purchaseOrderCorrections} WHERE ${purchaseOrderCorrections.previousOrderId} = ${purchaseCostOrders.id})`, eq(purchaseCostTrackings.purchaseId, row.purchaseId))).all();
        for (const target of valid) validTargetKeysInTransaction.add(`additional:${target.id}`);
      }
      const externalRows = await tx.select().from(hubbuyExternalItems).where(eq(hubbuyExternalItems.purchaseId, row.purchaseId)).all();
      const externalById = new Map(externalRows.map(external => [external.id, external]));
      const relevantExternalIds = [...new Set(manifest.rows.flatMap(entry => entry.existingId ? [entry.existingId] : []))];
      const sourceRecords = relevantExternalIds.length ? await tx.select({ source: qcImageSources, image: qcImages, preview: qcImagePreviews }).from(qcImageSources)
        .leftJoin(qcImages, eq(qcImageSources.imageId, qcImages.id))
        .leftJoin(qcImagePreviews, eq(qcImages.id, qcImagePreviews.imageId))
        .where(inArray(qcImageSources.externalItemId, relevantExternalIds)).all() : [];
      type ConfirmSourceRecord = { source: typeof qcImageSources.$inferSelect; image: typeof qcImages.$inferSelect | null; preview: typeof qcImagePreviews.$inferSelect | null };
      const sourceByExternalAndHash = new Map<string, ConfirmSourceRecord>(sourceRecords.map(record => [qcSourceMapKey(record.source.externalItemId, record.source.sourceUrlHash), record]));
      const sourceRowsToInsert: Array<typeof qcImageSources.$inferInsert> = [];
      const presentationTargetKeys: string[] = [];
      const selectedExternalIds = new Set<string>();
      for (const entry of manifest.rows) {
        const choice = choicesByKey.get(entry.occurrence.externalKey);
        const match = normalizeQcMatch(entry.match);
        const rawDestinationId = choice ? choice.targetKey : match.targetItemId;
        const destinationId = rawDestinationId ? parseTargetKey(rawDestinationId).key : null;
        const destinationTarget = destinationId ? parseTargetKey(destinationId) : null;
        if (destinationTarget && !validTargetKeysInTransaction.has(destinationTarget.key)) throw new DomainError("O produto selecionado não pertence mais a esta compra ou não está registrado.", 403, "QC_ITEM_CROSS_PURCHASE");
        if (entry.conflict) {
          if (!choice) throw new DomainError("Confirme explicitamente o descarte da ocorrência conflitante.", 409, "QC_EXTERNAL_CONFLICT");
          if (destinationId) throw new DomainError("Resolva o conflito de identificadores HubBuy antes de associar.", 409, "QC_EXTERNAL_CONFLICT");
          result.ignored++;
          continue;
        }
        if (!entry.existingId) {
          const appearedAfterPreview = externalRows.some(candidate => candidate.orderNo === entry.occurrence.orderNo && (
            !!entry.occurrence.orderGoodsId && (candidate.orderGoodsId === entry.occurrence.orderGoodsId || candidate.orderGoodsNo === entry.occurrence.orderGoodsId)
            || !!entry.occurrence.orderGoodsNo && (candidate.orderGoodsId === entry.occurrence.orderGoodsNo || candidate.orderGoodsNo === entry.occurrence.orderGoodsNo)
          ));
          if (appearedAfterPreview) throw new DomainError("A ocorrência mudou desde a prévia. Analise o JSON novamente antes de confirmar.", 409, "QC_REVISION_CONFLICT");
        }
        const currentExternal = entry.existingId ? externalById.get(entry.existingId) ?? null : null;
        if (entry.existingId && entry.existingRevision !== null) {
          if (!currentExternal || currentExternal.revision !== entry.existingRevision) throw new DomainError("A ocorrência HubBuy mudou desde a prévia.", 409, "QC_REVISION_CONFLICT");
          const currentTargetKey = targetKeyForExternal(currentExternal);
          if (currentTargetKey !== destinationId && currentTargetKey !== null) {
            if (!choice?.correctExisting || choice.expectedTargetKey !== currentTargetKey) throw new DomainError("Corrigir um vínculo existente exige confirmação explícita e revisão atual.", 409, "QC_REMAP_CONFIRMATION_REQUIRED");
            result.corrected++;
          }
        }
        if (match.status === "IGNORED" && !destinationId) {
          // A legacy ignored row can already have an unlinked occurrence and
          // source records. Leave those tombstone/history records intact, but
          // never add new irrelevant rows or let them become transfer work.
          result.ignored++;
          continue;
        }
        const pendingMatch = match.status === "PENDING" && match.candidates.length > 0;
        const explicitUnlink = !!currentExternal && targetKeyForExternal(currentExternal) !== null && destinationId === null && !!choice?.correctExisting;
        if (!destinationId && !pendingMatch && !explicitUnlink) {
          result.ignored++;
          continue;
        }
        let externalId = entry.existingId;
        const externalValues = { orderGoodsId: entry.occurrence.orderGoodsId ?? currentExternal?.orderGoodsId ?? null, orderGoodsNo: entry.occurrence.orderGoodsNo ?? currentExternal?.orderGoodsNo ?? null, orderNo: entry.occurrence.orderNo, offerId: entry.occurrence.offerId ?? currentExternal?.offerId ?? null, channel: entry.occurrence.channel ?? currentExternal?.channel ?? null, offerUrl: entry.occurrence.offerUrl ?? currentExternal?.offerUrl ?? null, skuInfo: entry.occurrence.skuInfo ?? currentExternal?.skuInfo ?? null, title: entry.occurrence.title ?? currentExternal?.title ?? null, quantity: entry.occurrence.quantity ?? currentExternal?.quantity ?? null, purchaseItemId: destinationTarget?.origin === "purchase" ? destinationTarget.id : null, additionalOrderItemId: destinationTarget?.origin === "additional" ? destinationTarget.id : null, confirmedBy: destinationId ? userId : null, confirmedAt: destinationId ? current : null, updatedAt: current };
        if (externalId) {
          const updated = await tx.update(hubbuyExternalItems).set({ ...externalValues, revision: entry.existingRevision! + 1 }).where(and(eq(hubbuyExternalItems.id, externalId), eq(hubbuyExternalItems.revision, entry.existingRevision!))).returning({ id: hubbuyExternalItems.id }).get();
          if (!updated) throw new DomainError("Conflito ao salvar a ocorrência HubBuy.", 409, "QC_REVISION_CONFLICT");
          const updatedExternal = { ...currentExternal!, ...externalValues, revision: entry.existingRevision! + 1 };
          externalById.set(externalId, updatedExternal);
          const index = externalRows.findIndex(candidate => candidate.id === externalId);
          if (index >= 0) externalRows[index] = updatedExternal;
        } else {
          externalId = randomUUID();
          const insertedExternal = { id: externalId, workspaceId: purchase.workspaceId, purchaseId: row.purchaseId, ...externalValues, revision: 0, createdAt: current };
          try { await tx.insert(hubbuyExternalItems).values(insertedExternal).run(); }
          catch (error) { if (uniqueError(error)) throw new DomainError("Esta ocorrência HubBuy já foi importada com identificadores diferentes.", 409, "QC_EXTERNAL_CONFLICT"); throw error; }
          externalById.set(externalId, insertedExternal);
          externalRows.push(insertedExternal);
        }
        if (currentExternal) { const oldTargetKey = targetKeyForExternal(currentExternal); if (oldTargetKey) presentationTargetKeys.push(oldTargetKey); }
        if (destinationId) { presentationTargetKeys.push(destinationId); selectedExternalIds.add(externalId); }
        if (destinationId) result.linked++; else if (pendingMatch) result.pendingMatching++; else result.ignored++;
        if (entry.existingItemId !== destinationId || !entry.existingId) await tx.insert(qcEvents).values({ id: randomUUID(), workspaceId: purchase.workspaceId, purchaseId: row.purchaseId, actorId: userId, eventType: "QC_MATCH", resultCode: entry.existingItemId ? "CORRECTED" : destinationId ? "LINKED" : pendingMatch ? "PENDING" : "IGNORED", contextJson: JSON.stringify({ externalItemId: externalId, fromItemId: entry.existingItemId, toItemId: destinationId }), createdAt: current }).run();
        if (!destinationId && !pendingMatch) continue;
        for (const photo of entry.occurrence.photos) {
          const sourceKey = qcSourceMapKey(externalId, photo.urlHash);
          const priorRecord = sourceByExternalAndHash.get(sourceKey);
          const prior = priorRecord?.source;
          if (prior && priorRecord) {
            if (prior.state === "ready") continue;
            if (prior.importId === importId) {
              if (destinationId && (prior.state === "pending" || prior.state === "failed")) result.eligibleSources++;
              continue;
            }
            const priorImage = priorRecord.image;
            if (priorImage?.status === "deleted") {
              if (destinationId) {
                await restoreDeletedImage(tx, entry, prior, priorImage, importId, current, priorRecord.preview);
                sourceByExternalAndHash.set(sourceKey, { source: { ...prior, importId, state: "pending", bytesReserved: 0, bytesConsumed: 0, errorCode: null, updatedAt: current }, image: null, preview: null });
                result.sources++;
                result.eligibleSources++;
                result.restored++;
              } else if (pendingMatch) {
                // Keep ambiguous occurrences hidden until a member selects a
                // candidate. The current manifest carries the restore grant
                // for the subsequent, explicitly linked transfer.
                await requeueSource(tx, prior, importId, current);
                sourceByExternalAndHash.set(sourceKey, { source: { ...prior, importId, state: "pending", bytesReserved: 0, bytesConsumed: 0, errorCode: null, updatedAt: current }, image: null, preview: null });
                result.sources++;
              }
              continue;
            }
            if (priorImage?.status === "ready") {
              await tx.update(qcImageSources).set({ state: "ready", updatedAt: current }).where(eq(qcImageSources.id, prior.id)).run();
              sourceByExternalAndHash.set(sourceKey, { ...priorRecord, source: { ...prior, state: "ready", updatedAt: current } });
              continue;
            }
            if (prior.state === "deleted") continue;
            if (priorImage?.claimToken && priorImage.claimExpiresAt && priorImage.claimExpiresAt.getTime() > now()) throw new DomainError("A mesma foto está em processamento; tente confirmar a nova seleção novamente.", 409, "QC_IMAGE_BUSY");
            // Moving a retry to a smaller manifest preserves all spend on the old
            // manifest. Any unsettled reservation is charged there conservatively.
            if (prior.bytesReserved > 0 && prior.importId) {
              await tx.update(qcImports).set({ bytesReserved: sql`max(0, ${qcImports.bytesReserved} - ${prior.bytesReserved})`, bytesConsumed: sql`${qcImports.bytesConsumed} + ${prior.bytesReserved}`, updatedAt: current }).where(eq(qcImports.id, prior.importId)).run();
            }
            await tx.update(qcImageSources).set({ importId, state: "pending", bytesReserved: 0, bytesConsumed: 0, errorCode: null, updatedAt: current }).where(eq(qcImageSources.id, prior.id)).run();
            sourceByExternalAndHash.set(sourceKey, { ...priorRecord, source: { ...prior, importId, state: "pending", bytesReserved: 0, bytesConsumed: 0, errorCode: null, updatedAt: current } });
            result.sources++;
            if (destinationId) result.eligibleSources++;
            continue;
          }
          const insertedSource = { id: randomUUID(), importId, externalItemId: externalId, imageId: null, sourceUrl: photo.url, sourceUrlHash: photo.urlHash, ordinal: photo.ordinal, state: "pending" as const, attempts: 0, bytesReserved: 0, bytesConsumed: 0, errorCode: null, createdAt: current, updatedAt: current };
          sourceRowsToInsert.push(insertedSource);
          sourceByExternalAndHash.set(sourceKey, { source: insertedSource, image: null, preview: null });
          result.sources++;
          if (destinationId) result.eligibleSources++;
        }
      }
      for (let offset = 0; offset < sourceRowsToInsert.length; offset += 20) await tx.insert(qcImageSources).values(sourceRowsToInsert.slice(offset, offset + 20)).run();
      manifest.transferSourceIds = [...new Set([...sourceByExternalAndHash.values()].flatMap(({ source }) => source.importId === importId && selectedExternalIds.has(source.externalItemId) && (source.state === "pending" || source.state === "failed") ? [source.id] : []))];
      result.eligibleSources = manifest.transferSourceIds.length;
      const confirmedManifestJson = JSON.stringify(manifest);
      if (Buffer.byteLength(confirmedManifestJson, "utf8") > QC_LIMITS.bodyBytes) throw new DomainError("O manifesto QC excede 1 MiB.", 413, "QC_BODY_LIMIT");
      if (presentationTargetKeys.length) await repairPresentation(tx, row.purchaseId, presentationTargetKeys, current);
      const updated = await tx.update(qcImports).set({ manifestJson: confirmedManifestJson, status: "confirmed", revision: expectedRevision + 1, updatedAt: current }).where(and(eq(qcImports.id, importId), eq(qcImports.revision, expectedRevision))).returning({ id: qcImports.id }).get();
      if (!updated) throw new DomainError("A importação foi alterada em outra solicitação.", 409, "QC_REVISION_CONFLICT");
      await tx.insert(qcEvents).values({ id: randomUUID(), workspaceId: purchase.workspaceId, purchaseId: row.purchaseId, actorId: userId, eventType: "QC_IMPORT", resultCode: "CONFIRMED", contextJson: JSON.stringify({ importId, linked: result.linked, ignored: result.ignored, sources: result.sources, restored: result.restored }), createdAt: current }).run();
    }); } finally { await releaseLock(lock); }
    return { importId, revision: expectedRevision + 1, ...result, partial: manifest.partial };
  }

  async function resolvePendingOccurrence(purchaseId: string, externalItemId: string, expectedRevision: number, targetKey: string) {
    const purchase = await rate(purchaseId, "match");
    const lock = await acquireLock(purchase.workspaceId);
    try {
      return await db.transaction(async tx => {
        const activeLock = await tx.select().from(qcTransferLocks).where(eq(qcTransferLocks.scope, lock.scope)).get();
        if (activeLock?.ownerId !== lock.ownerId || activeLock.version !== lock.version || activeLock.leaseUntil <= now()) throw new DomainError("A operação QC perdeu sua concessão antes de confirmar o vínculo.", 409, "QC_TRANSFER_LEASE_LOST");
        await authorization(tx, userId).requirePurchase(purchaseId);
        const external = await tx.select().from(hubbuyExternalItems).where(and(eq(hubbuyExternalItems.id, externalItemId), eq(hubbuyExternalItems.purchaseId, purchaseId))).get();
        if (!external) throw new DomainError("Ocorrência HubBuy não encontrada nesta compra.", 404, "QC_EXTERNAL_NOT_FOUND");
        if (external.revision !== expectedRevision || targetKeyForExternal(external) !== null) throw new DomainError("A ocorrência mudou desde que as pendências foram carregadas.", 409, "QC_REVISION_CONFLICT");
        const target = parseTargetKey(targetKey);
        if (!await resolveTarget(tx, purchaseId, target.key)) throw new DomainError("O produto selecionado não pertence a esta compra ou não está registrado.", 403, "QC_ITEM_CROSS_PURCHASE");
        if ((await photographedTargetKeys(purchaseId, tx)).has(target.key)) throw new DomainError("Este produto já possui fotos QC. Atualize as opções de vínculo.", 409, "QC_TARGET_HAS_PHOTOS");
        const targets = await getTargets(purchaseId, tx);
        const match = suggestQcMatch(occurrenceFromExternal(external), targets);
        if (match.status !== "PENDING" || match.candidates.length === 0) throw new DomainError("Esta ocorrência já não possui candidatos de associação pendentes.", 409, "QC_MATCH_NOT_PENDING");
        const stamp = nowDate(now);
        const updated = await tx.update(hubbuyExternalItems).set({ purchaseItemId: target.origin === "purchase" ? target.id : null, additionalOrderItemId: target.origin === "additional" ? target.id : null, confirmedBy: userId, confirmedAt: stamp, revision: expectedRevision + 1, updatedAt: stamp }).where(and(eq(hubbuyExternalItems.id, externalItemId), eq(hubbuyExternalItems.purchaseId, purchaseId), eq(hubbuyExternalItems.revision, expectedRevision), isNull(hubbuyExternalItems.purchaseItemId), isNull(hubbuyExternalItems.additionalOrderItemId))).returning({ id: hubbuyExternalItems.id, revision: hubbuyExternalItems.revision }).get();
        if (!updated) throw new DomainError("A ocorrência mudou em outra solicitação.", 409, "QC_REVISION_CONFLICT");
        await repairPresentation(tx, purchaseId, [target.key], stamp);
        await tx.insert(qcEvents).values({ id: randomUUID(), workspaceId: purchase.workspaceId, purchaseId, actorId: userId, eventType: "QC_MATCH", resultCode: "RESOLVED", contextJson: JSON.stringify({ externalItemId, fromItemId: null, toItemId: target.key }), createdAt: stamp }).run();
        const pendingSources = await tx.select({ id: qcImageSources.id }).from(qcImageSources).where(and(eq(qcImageSources.externalItemId, externalItemId), inArray(qcImageSources.state, ["pending", "failed"]))).all();
        return { externalItemId, targetKey: target.key, purchaseItemId: target.origin === "purchase" ? target.id : null, additionalOrderItemId: target.origin === "additional" ? target.id : null, revision: updated.revision, pendingSources: pendingSources.length };
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
    if (!acquired || acquired.ownerId !== ownerId) {
      const active = await db.select().from(qcTransferLocks).where(eq(qcTransferLocks.scope, workspaceId)).get();
      const retryAfterSeconds = Math.max(1, Math.min(Math.ceil(QC_LIMITS.lockMs / 1000), Math.ceil(((active?.leaseUntil ?? now() + QC_LIMITS.lockMs) - now()) / 1000)));
      throw new QcDomainError("Há uma transferência QC ativa neste espaço.", 409, "QC_TRANSFER_ACTIVE", { retryAfterSeconds });
    }
    return { scope: workspaceId, ownerId, version: acquired.version };
  }

  async function assertLock(lock: { scope: string; ownerId: string; version: number }) {
    const current = await db.select().from(qcTransferLocks).where(eq(qcTransferLocks.scope, lock.scope)).get();
    if (!current || current.ownerId !== lock.ownerId || current.version !== lock.version || current.leaseUntil <= now()) throw new DomainError("A operação QC perdeu sua concessão compartilhada.", 409, "QC_TRANSFER_LEASE_LOST");
  }

  async function releaseLock(lock: { scope: string; ownerId: string; version: number }) {
    await db.update(qcTransferLocks).set({ leaseUntil: 0, updatedAt: nowDate(now) }).where(and(eq(qcTransferLocks.scope, lock.scope), eq(qcTransferLocks.ownerId, lock.ownerId), eq(qcTransferLocks.version, lock.version))).run();
  }

  async function markSourceFailure(sourceId: string, expectedImportId: string | null, errorCode: string, uncertain = false) {
    await db.transaction(async tx => {
      const source = await tx.select().from(qcImageSources).where(eq(qcImageSources.id, sourceId)).get();
      if (!source || source.importId !== expectedImportId || source.state === "deleted" || source.state === "ready") return;
      if (source.bytesReserved > 0 && source.importId) {
        const charge = source.bytesReserved;
        await tx.update(qcImports).set({ bytesReserved: sql`max(0, ${qcImports.bytesReserved} - ${charge})`, bytesConsumed: sql`${qcImports.bytesConsumed} + ${charge}`, updatedAt: nowDate(now) }).where(eq(qcImports.id, source.importId)).run();
        await tx.update(qcImageSources).set({ bytesReserved: 0, bytesConsumed: source.bytesConsumed + charge, state: uncertain ? "pending" : "failed", errorCode: uncertain ? "QC_PENDING_RECOVERY" : errorCode, updatedAt: nowDate(now) }).where(and(eq(qcImageSources.id, sourceId), source.importId === null ? isNull(qcImageSources.importId) : eq(qcImageSources.importId, source.importId))).run();
      } else await tx.update(qcImageSources).set({ state: uncertain ? "pending" : "failed", errorCode: uncertain ? "QC_PENDING_RECOVERY" : errorCode, updatedAt: nowDate(now) }).where(and(eq(qcImageSources.id, sourceId), source.importId === null ? isNull(qcImageSources.importId) : eq(qcImageSources.importId, source.importId))).run();
    });
  }

  async function accountReservation(sourceId: string, expectedImportId: string | null, consumed: number) {
    await db.transaction(async tx => {
      const source = await tx.select().from(qcImageSources).where(eq(qcImageSources.id, sourceId)).get();
      if (!source || source.importId !== expectedImportId || source.bytesReserved <= 0) return;
      const charge = Math.min(source.bytesReserved, Math.max(0, consumed));
      if (source.importId) await tx.update(qcImports).set({ bytesReserved: sql`max(0, ${qcImports.bytesReserved} - ${source.bytesReserved})`, bytesConsumed: sql`${qcImports.bytesConsumed} + ${charge}`, updatedAt: nowDate(now) }).where(eq(qcImports.id, source.importId)).run();
      await tx.update(qcImageSources).set({ bytesReserved: 0, bytesConsumed: source.bytesConsumed + charge, updatedAt: nowDate(now) }).where(and(eq(qcImageSources.id, sourceId), source.importId === null ? isNull(qcImageSources.importId) : eq(qcImageSources.importId, source.importId), eq(qcImageSources.bytesReserved, source.bytesReserved))).run();
    });
  }

  async function reserveBytes(sourceId: string, expectedImportId: string | null, expected: number) {
    await db.transaction(async tx => {
      const source = await tx.select().from(qcImageSources).where(eq(qcImageSources.id, sourceId)).get();
      if (!source || source.importId !== expectedImportId || source.state === "deleted" || source.state === "ready") throw new DomainError("A fonte QC mudou antes da transferência.", 409, "QC_REVISION_CONFLICT");
      const previousReservation = source.bytesReserved;
      if (source.importId) {
        const manifest = await tx.select().from(qcImports).where(eq(qcImports.id, source.importId)).get();
        if (!manifest || manifest.bytesConsumed + manifest.bytesReserved + expected > QC_LIMITS.importBytes) { metrics.increment("quotaInterruptions"); throw new DomainError("A importação atingiu o limite acumulado de 200 MiB; selecione menos fotos numa nova importação.", 413, "QC_IMPORT_BYTES_LIMIT"); }
        await tx.update(qcImports).set({ bytesReserved: sql`max(0, ${qcImports.bytesReserved} - ${previousReservation}) + ${expected}`, bytesConsumed: sql`${qcImports.bytesConsumed} + ${previousReservation}`, updatedAt: nowDate(now) }).where(eq(qcImports.id, source.importId)).run();
      }
      const updated = await tx.update(qcImageSources).set({ bytesReserved: expected, bytesConsumed: source.bytesConsumed + previousReservation, state: "pending", attempts: source.attempts + 1, errorCode: null, updatedAt: nowDate(now) }).where(and(eq(qcImageSources.id, sourceId), source.importId === null ? isNull(qcImageSources.importId) : eq(qcImageSources.importId, source.importId))).returning({ id: qcImageSources.id }).get();
      if (!updated) throw new DomainError("A fonte QC mudou antes da reserva de bytes.", 409, "QC_REVISION_CONFLICT");
    });
  }

  async function downloadWithRetry(sourceUrl: string, sourceId: string, importId: string | null, budget: RequestBudget, onAttemptStart: () => void = () => {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      requireRequestBudget(budget, QC_LIMITS.dnsMs + QC_LIMITS.transferMs);
      metrics.increment("downloadAttempts");
      try {
        onAttemptStart();
        return await measureQcStage(metrics, "download", () => download(sourceUrl, { onDnsLookup: () => metrics.increment("dnsCalls"), signal: config.signal }));
      } catch (error) {
        const upstreamStatus = error instanceof QcDomainError ? error.upstreamStatus : undefined;
        const transient = upstreamStatus === 408 || upstreamStatus === 429 || upstreamStatus !== undefined && upstreamStatus >= 500
          || error instanceof DomainError && error.status >= 500 && ["QC_SOURCE_TIMEOUT", "QC_SOURCE_UNAVAILABLE"].includes(error.code ?? "");
        if (!transient || attempt > 0) throw error;
        const retryAfterSeconds = error instanceof QcDomainError ? error.retryAfterSeconds ?? 0 : 0;
        const delayMs = Math.max(500 + Math.floor(Math.max(0, Math.min(1, random())) * 251), retryAfterSeconds * 1000);
        if (budget.deadline - now() < delayMs + QC_LIMITS.dnsMs + QC_LIMITS.transferMs + QC_LIMITS.requestSafetyMs) {
          throw new QcDomainError("A origem HubBuy está temporariamente indisponível; a foto pode ser retomada.", 502, "QC_SOURCE_RETRY_PENDING", { retryAfterSeconds: Math.max(1, Math.ceil(delayMs / 1000)), upstreamStatus });
        }
        // A failed/partial body has no trusted byte count, so settle the current
        // reservation conservatively before reserving quota for the retry.
        await accountReservation(sourceId, importId, QC_LIMITS.imageBytes);
        await reserveBytes(sourceId, importId, QC_LIMITS.imageBytes);
        metrics.increment("downloadRetries");
        await sleep(delayMs);
        requireRequestBudget(budget, QC_LIMITS.dnsMs + QC_LIMITS.transferMs);
      }
    }
    throw new QcDomainError("A origem HubBuy está temporariamente indisponível; a foto pode ser retomada.", 502, "QC_SOURCE_RETRY_PENDING");
  }

  async function processPreview(imageId: string, lock: { scope: string; ownerId: string; version: number }, budget: RequestBudget, trustedOriginal?: { imageId: string; bytes: Buffer; sha256: string }) {
    let claimToken: string | null = null, previewKey: string | null = null, putStarted = false, putConfirmed = false, priorPutUncertain = false;
    async function compensateDeletedPreview() {
      if (!putConfirmed || !previewKey || !claimToken) return "pending" as const;
      let current = await db.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, imageId)).get();
      if (!current || current.status !== "deleted" || current.r2Key !== previewKey || current.claimToken !== claimToken) return "stale" as const;
      try {
        requireRequestBudget(budget, QC_LIMITS.transferMs);
        await storage.delete(previewKey, requestBudgetSignal(budget));
        requireRequestBudget(budget, QC_LIMITS.transferMs);
        if ((await storage.head(previewKey, requestBudgetSignal(budget))).exists) throw new Error("QC preview tombstone compensation did not remove the object");
        current = await db.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, imageId)).get();
        if (!current || current.status !== "deleted" || current.r2Key !== previewKey || current.claimToken !== claimToken) return "stale" as const;
        const removed = await db.update(qcImagePreviews).set({ deleteState: "deleted", claimToken: null, claimExpiresAt: null, errorCode: null, revision: current.revision + 1, updatedAt: nowDate(now) }).where(and(eq(qcImagePreviews.imageId, imageId), eq(qcImagePreviews.status, "deleted"), eq(qcImagePreviews.revision, current.revision), eq(qcImagePreviews.r2Key, previewKey), eq(qcImagePreviews.claimToken, claimToken))).returning({ imageId: qcImagePreviews.imageId }).get();
        return removed ? "removed" as const : "stale" as const;
      } catch {
        current = await db.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, imageId)).get();
        if (current?.status === "deleted" && current.r2Key === previewKey && current.claimToken === claimToken) await db.update(qcImagePreviews).set({ deleteState: "pending", claimToken: null, claimExpiresAt: null, errorCode: "QC_DELETE_PENDING", revision: current.revision + 1, updatedAt: nowDate(now) }).where(and(eq(qcImagePreviews.imageId, imageId), eq(qcImagePreviews.status, "deleted"), eq(qcImagePreviews.revision, current.revision), eq(qcImagePreviews.r2Key, previewKey), eq(qcImagePreviews.claimToken, claimToken))).run();
        return "pending" as const;
      }
    }
    try {
      await assertLock(lock);
      const image = await db.select().from(qcImages).where(and(eq(qcImages.id, imageId), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).get();
      if (!image) return { imageId, status: "deleted" as const };
      const existing = await db.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, imageId)).get();
      if (existing?.status === "ready" && existing.transformVersion === QC_PREVIEW.version && existing.deleteState === "none" && existing.errorCode !== "QC_PREVIEW_PUT_IN_FLIGHT") return { imageId, status: "existing" as const };
      if (existing?.status === "deleted") return { imageId, status: "deleted" as const };
      const key = existing?.transformVersion === QC_PREVIEW.version ? existing.r2Key : `qc/previews/${QC_PREVIEW.version}/${imageId}.webp`;
      previewKey = key;
      priorPutUncertain = existing?.errorCode === "QC_PREVIEW_PUT_IN_FLIGHT";
      const previewClaimToken = randomUUID();
      claimToken = previewClaimToken;
      const stamp = nowDate(now);
      if (existing) {
        const claimed = await db.update(qcImagePreviews).set({ status: "pending", r2Key: key, claimToken: previewClaimToken, claimExpiresAt: new Date(now() + QC_LIMITS.lockMs), errorCode: priorPutUncertain ? "QC_PREVIEW_PUT_IN_FLIGHT" : null, updatedAt: stamp }).where(and(eq(qcImagePreviews.imageId, imageId), eq(qcImagePreviews.revision, existing.revision), inArray(qcImagePreviews.status, ["pending", "failed", "ready"]), eq(qcImagePreviews.deleteState, "none"))).returning({ imageId: qcImagePreviews.imageId }).get();
        if (!claimed) throw new DomainError("O preview QC está sendo processado.", 409, "QC_PREVIEW_BUSY");
      } else {
        await db.insert(qcImagePreviews).values({ imageId, r2Key: key, transformVersion: QC_PREVIEW.version, status: "pending", deleteState: "none", revision: 0, claimToken: previewClaimToken, claimExpiresAt: new Date(now() + QC_LIMITS.lockMs), createdAt: stamp, updatedAt: stamp }).run();
      }
      const claimedRow = await db.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, imageId)).get();
      if (!claimedRow || claimedRow.claimToken !== previewClaimToken) throw new DomainError("O preview QC perdeu sua concessão.", 409, "QC_PREVIEW_BUSY");
      if (priorPutUncertain) {
        requireRequestBudget(budget, QC_LIMITS.transferMs);
        const uncertainObject = await storage.head(key, requestBudgetSignal(budget));
        if (uncertainObject.exists && uncertainObject.sha256 === claimedRow.sha256 && claimedRow.sha256 && claimedRow.width && claimedRow.height && claimedRow.byteSize) {
          await assertLock(lock);
          const adopted = await db.update(qcImagePreviews).set({ status: "ready", deleteState: "none", claimToken: previewClaimToken, claimExpiresAt: new Date(now() + QC_LIMITS.lockMs), errorCode: "QC_PREVIEW_PUT_IN_FLIGHT", revision: claimedRow.revision + 1, updatedAt: nowDate(now) }).where(and(eq(qcImagePreviews.imageId, imageId), eq(qcImagePreviews.claimToken, previewClaimToken), eq(qcImagePreviews.status, "pending"), eq(qcImagePreviews.r2Key, key))).returning({ imageId: qcImagePreviews.imageId }).get();
          if (adopted) return { imageId, status: "existing" as const };
        }
        const current = await db.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, imageId)).get();
        if (current?.claimToken === previewClaimToken && current.status === "pending" && current.r2Key === key) {
          await db.update(qcImagePreviews).set({ claimToken: null, claimExpiresAt: null, errorCode: "QC_PREVIEW_PUT_IN_FLIGHT", revision: current.revision + 1, updatedAt: nowDate(now) }).where(and(eq(qcImagePreviews.imageId, imageId), eq(qcImagePreviews.revision, current.revision), eq(qcImagePreviews.claimToken, previewClaimToken), eq(qcImagePreviews.status, "pending"), eq(qcImagePreviews.r2Key, key))).run();
        }
        return { imageId, status: "pending" as const, code: uncertainObject.exists ? "QC_OBJECT_CONFLICT" : "QC_PREVIEW_PUT_UNCERTAIN" };
      }
      if (claimedRow.sha256 && claimedRow.transformVersion === QC_PREVIEW.version) {
        requireRequestBudget(budget, QC_LIMITS.transferMs);
        const object = await storage.head(key, requestBudgetSignal(budget));
        if (object.exists && object.sha256 === claimedRow.sha256 && claimedRow.width && claimedRow.height && claimedRow.byteSize) {
          await assertLock(lock);
          const adopted = await db.update(qcImagePreviews).set({ status: "ready", deleteState: "none", claimToken: null, claimExpiresAt: null, errorCode: null, revision: claimedRow.revision + 1, updatedAt: nowDate(now) }).where(and(eq(qcImagePreviews.imageId, imageId), eq(qcImagePreviews.claimToken, previewClaimToken), eq(qcImagePreviews.status, "pending"))).returning({ imageId: qcImagePreviews.imageId }).get();
          if (adopted) return { imageId, status: "existing" as const };
        }
      }
      requireRequestBudget(budget, QC_LIMITS.transferMs + QC_LIMITS.imageValidationMs);
      const canReuseValidatedOriginal = trustedOriginal?.imageId === imageId
        && !!image.contentSha256
        && trustedOriginal.sha256 === image.contentSha256
        && createHash("sha256").update(trustedOriginal.bytes).digest("hex") === trustedOriginal.sha256;
      const original = canReuseValidatedOriginal ? trustedOriginal.bytes : await storage.get(image.r2Key, QC_LIMITS.imageBytes, requestBudgetSignal(budget));
      if (!image.contentSha256 || createHash("sha256").update(original).digest("hex") !== image.contentSha256) throw new DomainError("O original QC falhou na verificação antes da geração do preview.", 502, "QC_OBJECT_CONFLICT");
      const generated: GeneratedQcPreview = await imageSemaphore.run(async () => {
        requireRequestBudget(budget, QC_LIMITS.imageValidationMs + QC_LIMITS.transferMs);
        return measureQcStage(metrics, "preview", () => makePreview(original));
      }, config.signal);
      await db.update(qcImagePreviews).set({ sha256: generated.sha256, byteSize: generated.bytes.byteLength, width: generated.width, height: generated.height, transformVersion: QC_PREVIEW.version, updatedAt: nowDate(now) }).where(and(eq(qcImagePreviews.imageId, imageId), eq(qcImagePreviews.claimToken, previewClaimToken), eq(qcImagePreviews.status, "pending"))).run();
      await assertLock(lock);
      requireRequestBudget(budget, QC_LIMITS.transferMs);
      const started = await db.update(qcImagePreviews).set({ errorCode: "QC_PREVIEW_PUT_IN_FLIGHT", updatedAt: nowDate(now) }).where(and(eq(qcImagePreviews.imageId, imageId), eq(qcImagePreviews.claimToken, previewClaimToken), eq(qcImagePreviews.status, "pending"), eq(qcImagePreviews.deleteState, "none"), eq(qcImagePreviews.r2Key, key))).returning({ imageId: qcImagePreviews.imageId }).get();
      if (!started) throw new DomainError("O preview QC mudou antes do backup.", 409, "QC_PREVIEW_BUSY");
      requireRequestBudget(budget, QC_LIMITS.transferMs);
      putStarted = true;
      await storage.put({ key, bytes: generated.bytes, mimeType: "image/webp", sha256: generated.sha256 }, requestBudgetSignal(budget));
      putConfirmed = true;
      const confirmed = await db.update(qcImagePreviews).set({ errorCode: "QC_PREVIEW_PUT_CONFIRMED", updatedAt: nowDate(now) }).where(and(eq(qcImagePreviews.imageId, imageId), eq(qcImagePreviews.claimToken, previewClaimToken), eq(qcImagePreviews.status, "pending"), eq(qcImagePreviews.r2Key, key))).returning({ imageId: qcImagePreviews.imageId }).get();
      if (!confirmed) await db.update(qcImagePreviews).set({ errorCode: "QC_PREVIEW_PUT_CONFIRMED", updatedAt: nowDate(now) }).where(and(eq(qcImagePreviews.imageId, imageId), eq(qcImagePreviews.claimToken, previewClaimToken), eq(qcImagePreviews.status, "deleted"), eq(qcImagePreviews.r2Key, key))).run();
      requireRequestBudget(budget, QC_LIMITS.transferMs);
      const head = await storage.head(key, requestBudgetSignal(budget));
      if (!head.exists || head.sha256 !== generated.sha256) throw new DomainError("A gravação do preview QC aguarda reconciliação.", 502, "QC_STORAGE_UNAVAILABLE");
      await assertLock(lock);
      const ready = await db.transaction(async tx => {
        const sourceStillReady = await tx.select({ id: qcImages.id }).from(qcImages).where(and(eq(qcImages.id, imageId), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).get();
        const activeLock = await tx.select().from(qcTransferLocks).where(eq(qcTransferLocks.scope, lock.scope)).get();
        const currentPreview = await tx.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, imageId)).get();
        if (!sourceStillReady || !currentPreview || currentPreview.claimToken !== previewClaimToken || currentPreview.status === "deleted" || activeLock?.ownerId !== lock.ownerId || activeLock.version !== lock.version || activeLock.leaseUntil <= now()) return false;
        const readyPreview = await tx.update(qcImagePreviews).set({ status: "ready", deleteState: "none", claimToken: null, claimExpiresAt: null, errorCode: null, revision: currentPreview.revision + 1, updatedAt: nowDate(now) }).where(and(eq(qcImagePreviews.imageId, imageId), eq(qcImagePreviews.revision, currentPreview.revision), eq(qcImagePreviews.r2Key, key), eq(qcImagePreviews.claimToken, previewClaimToken))).returning({ imageId: qcImagePreviews.imageId }).get();
        return !!readyPreview;
      });
      if (!ready) {
        const currentPreview = await db.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, imageId)).get();
        if (currentPreview?.status === "deleted" && currentPreview.r2Key === key && currentPreview.claimToken === previewClaimToken) {
          const compensated = await compensateDeletedPreview();
          return { imageId, status: compensated === "removed" || compensated === "stale" ? "deleted" as const : "pending" as const };
        }
      }
      return { imageId, status: ready ? "generated" as const : "pending" as const };
    } catch (error) {
      const normalized = internalError(error);
      const current = await db.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, imageId)).get();
      if (current?.status === "deleted" && current.r2Key === previewKey && current.claimToken === claimToken) {
        const compensated = await compensateDeletedPreview();
        return { imageId, status: compensated === "removed" || compensated === "stale" ? "deleted" as const : "pending" as const, code: compensated === "pending" ? "QC_DELETE_PENDING" : undefined };
      }
      if (current && current.status !== "deleted" && current.r2Key === previewKey && (!claimToken || current.claimToken === claimToken)) {
        const uncertain = priorPutUncertain || putStarted && !putConfirmed;
        await db.update(qcImagePreviews).set({ status: uncertain ? "pending" : "failed", claimToken: uncertain ? claimToken : null, claimExpiresAt: uncertain ? new Date(now() + QC_LIMITS.lockMs) : null, errorCode: uncertain ? "QC_PREVIEW_PUT_IN_FLIGHT" : normalized.code ?? (putConfirmed ? "QC_PREVIEW_PUT_CONFIRMED" : "QC_PREVIEW_FAILED"), revision: current.revision + 1, updatedAt: nowDate(now) }).where(and(eq(qcImagePreviews.imageId, imageId), eq(qcImagePreviews.revision, current.revision), eq(qcImagePreviews.r2Key, previewKey!))).run();
      }
      return { imageId, status: "failed" as const, code: normalized.code ?? "QC_PREVIEW_FAILED" };
    }
  }

  async function processSource(sourceId: string, lock: { scope: string; ownerId: string; version: number }, budget: RequestBudget) {
    let imageId: string | null = null, claimToken: string | null = null, putStarted = false, putConfirmed = false, downloadStarted = false, priorPutUncertainImageId: string | null = null, knownObjectCheckedAbsent: string | null = null, sourceImportId: string | null = null, uploadR2Key: string | null = null;
    async function compensateOwnPut(tombstone: typeof qcImages.$inferSelect) {
      if (!putConfirmed || !uploadR2Key || !claimToken) return "pending" as const;
      try {
        requireRequestBudget(budget, QC_LIMITS.transferMs);
        await storage.delete(uploadR2Key, requestBudgetSignal(budget));
        requireRequestBudget(budget, QC_LIMITS.transferMs);
        if ((await storage.head(uploadR2Key, requestBudgetSignal(budget))).exists) throw new Error("QC tombstone compensation did not remove the object");
        const currentImage = await db.select().from(qcImages).where(eq(qcImages.id, tombstone.id)).get();
        const sameGeneration = currentImage?.status === "deleted" && currentImage.r2Key === uploadR2Key && currentImage.claimToken === claimToken;
        if (sameGeneration) await db.update(qcImages).set({ deleteState: "deleted", claimToken: null, claimExpiresAt: null, errorCode: null, revision: currentImage.revision + 1, updatedAt: nowDate(now) }).where(and(eq(qcImages.id, tombstone.id), eq(qcImages.status, "deleted"), eq(qcImages.revision, currentImage.revision), eq(qcImages.r2Key, uploadR2Key), eq(qcImages.claimToken, claimToken))).run();
        if (sourceImportId !== null) await db.update(qcImageSources).set({ state: "deleted", updatedAt: nowDate(now) }).where(and(eq(qcImageSources.id, sourceId), eq(qcImageSources.importId, sourceImportId), eq(qcImageSources.imageId, tombstone.id), eq(qcImageSources.state, "deleted"))).run();
        return sameGeneration ? "removed" as const : "stale" as const;
      } catch {
        const currentImage = await db.select().from(qcImages).where(eq(qcImages.id, tombstone.id)).get();
        if (currentImage?.status === "deleted" && currentImage.r2Key === uploadR2Key && currentImage.claimToken === claimToken) await db.update(qcImages).set({ deleteState: "pending", claimToken: null, claimExpiresAt: null, errorCode: "QC_DELETE_PENDING", revision: currentImage.revision + 1, updatedAt: nowDate(now) }).where(and(eq(qcImages.id, tombstone.id), eq(qcImages.status, "deleted"), eq(qcImages.revision, currentImage.revision), eq(qcImages.r2Key, uploadR2Key), eq(qcImages.claimToken, claimToken))).run();
        return "pending" as const;
      }
    }
    try {
      let source = await db.select().from(qcImageSources).where(eq(qcImageSources.id, sourceId)).get();
      if (!source) throw new DomainError("Fonte QC não encontrada.", 404, "QC_SOURCE_NOT_FOUND");
      sourceImportId = source.importId;
      const external = await db.select().from(hubbuyExternalItems).where(eq(hubbuyExternalItems.id, source.externalItemId)).get();
      const externalTargetKey = external ? targetKeyForExternal(external) : null;
      if (!external || !externalTargetKey || !await resolveTarget(db, external.purchaseId, externalTargetKey)) throw new DomainError("Associe esta ocorrência a um produto registrado antes de enviar fotos.", 409, "QC_MATCH_REQUIRED");

      const expectedImageId = source.imageId;
      if (expectedImageId) {
        let reserved = await db.select().from(qcImages).where(eq(qcImages.id, expectedImageId)).get();
        if (reserved?.errorCode === "QC_PUT_IN_FLIGHT") priorPutUncertainImageId = reserved.id;
        if (reserved?.status === "deleted" || reserved?.deleteState !== undefined && reserved.deleteState !== "none") {
          const entry = await getRestoreEntry(source.importId, external, source.sourceUrlHash);
          if (!entry || !hasRestoreGrant(entry, reserved.id, source.sourceUrlHash) || !externalTargetKey) {
            await db.update(qcImageSources).set({ state: "deleted", errorCode: null, updatedAt: nowDate(now) }).where(and(eq(qcImageSources.id, sourceId), source.importId === null ? isNull(qcImageSources.importId) : eq(qcImageSources.importId, source.importId), inArray(qcImageSources.state, ["pending", "failed", "deleted"]))).run();
            return { sourceId, status: "deleted" as const };
          }
          await assertLock(lock);
          await db.transaction(async tx => { await restoreDeletedImage(tx, entry, source!, reserved!, source!.importId!, nowDate(now)); });
          reserved = await db.select().from(qcImages).where(eq(qcImages.id, expectedImageId)).get();
          source = await db.select().from(qcImageSources).where(eq(qcImageSources.id, sourceId)).get();
          if (!reserved || !source) throw new DomainError("A foto excluída não pôde ser preparada para restauração.", 409, "QC_REIMPORT_PREPARE_REQUIRED");
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
          const object = await storage.head(reserved.r2Key, requestBudgetSignal(budget));
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
              await repairPresentation(tx, external.purchaseId, [externalTargetKey], nowDate(now));
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
            await markSourceFailure(sourceId, sourceImportId, "QC_PUT_UNCERTAIN", true);
            return { sourceId, status: "pending" as const, code: "QC_PUT_UNCERTAIN" };
          }
          knownObjectCheckedAbsent = reserved.id;
          imageId = null;
          claimToken = null;
        }
      }

      await reserveBytes(sourceId, sourceImportId, QC_LIMITS.imageBytes);
      source = await db.select().from(qcImageSources).where(eq(qcImageSources.id, sourceId)).get();
      if (!source) throw new DomainError("Fonte QC não encontrada.", 404, "QC_SOURCE_NOT_FOUND");
      requireRequestBudget(budget, QC_LIMITS.dnsMs + QC_LIMITS.transferMs);
      const sourceUrl = source.sourceUrl;
      const downloaded = await downloadWithRetry(sourceUrl, sourceId, sourceImportId, budget, () => { downloadStarted = true; });
      metrics.increment("bytesObserved", downloaded.byteLength);
      await accountReservation(sourceId, sourceImportId, downloaded.byteLength);
      requireRequestBudget(budget, QC_LIMITS.imageValidationMs);
      const image = await imageSemaphore.run(async () => {
        requireRequestBudget(budget, QC_LIMITS.imageValidationMs);
        return measureQcStage(metrics, "validation", () => validate(downloaded));
      }, config.signal);
      await assertLock(lock);
      if (expectedImageId) {
        const expectedImage = await db.select().from(qcImages).where(eq(qcImages.id, expectedImageId)).get();
        if (expectedImage?.contentSha256 && expectedImage.contentSha256 !== image.sha256) throw new DomainError("A fonte mudou de conteúdo desde a reserva QC; revise o manifesto.", 409, "QC_SOURCE_CONTENT_CHANGED");
      }
      let known = await db.select().from(qcImages).where(and(eq(qcImages.externalItemId, external.id), eq(qcImages.contentSha256, image.sha256))).get();
      if (!known && expectedImageId) {
        const reservedWithoutHash = await db.select().from(qcImages).where(and(eq(qcImages.id, expectedImageId), eq(qcImages.externalItemId, external.id), isNull(qcImages.contentSha256), inArray(qcImages.status, ["pending", "failed"]), eq(qcImages.deleteState, "none"))).get();
        if (reservedWithoutHash) known = reservedWithoutHash;
      }
      if (known?.errorCode === "QC_PUT_IN_FLIGHT") priorPutUncertainImageId = known.id;
      if (known?.status === "deleted" || known?.deleteState !== undefined && known.deleteState !== "none") {
        const entry = await getRestoreEntry(source.importId, external, source.sourceUrlHash);
        if (!entry || !hasRestoreGrant(entry, known.id, source.sourceUrlHash) || !externalTargetKey) {
          await db.update(qcImageSources).set({ imageId: known.id, state: "deleted", errorCode: null, updatedAt: nowDate(now) }).where(and(eq(qcImageSources.id, sourceId), source.importId === null ? isNull(qcImageSources.importId) : eq(qcImageSources.importId, source.importId), inArray(qcImageSources.state, ["pending", "failed", "deleted"]))).run();
          return { sourceId, status: "deleted" as const };
        }
        await assertLock(lock);
        await db.transaction(async tx => { await restoreDeletedImage(tx, entry, source!, known!, source!.importId!, nowDate(now)); });
        known = await db.select().from(qcImages).where(eq(qcImages.id, known.id)).get();
        source = await db.select().from(qcImageSources).where(eq(qcImageSources.id, sourceId)).get();
        if (!known || !source) throw new DomainError("A foto excluída não pôde ser preparada para restauração.", 409, "QC_REIMPORT_PREPARE_REQUIRED");
      }
      if (known?.status === "ready") {
        await db.transaction(async tx => {
          await tx.update(qcImageSources).set({ imageId: known!.id, state: "ready", errorCode: null, updatedAt: nowDate(now) }).where(eq(qcImageSources.id, sourceId)).run();
          await repairPresentation(tx, external.purchaseId, [externalTargetKey], nowDate(now));
        });
        await processPreview(known.id, lock, budget, { imageId: known.id, bytes: image.bytes, sha256: image.sha256 });
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
      const existingObject = knownObjectCheckedAbsent === known.id ? { exists: false } : await storage.head(known.r2Key, requestBudgetSignal(budget));
      let uncertainWrite = known.errorCode === "QC_PUT_IN_FLIGHT";
      if (existingObject.exists) {
        if (existingObject.sha256 !== image.sha256) throw new DomainError("A chave R2 reservada contém dados inconsistentes.", 502, "QC_OBJECT_CONFLICT");
      } else if (uncertainWrite) {
        await db.update(qcImages).set({ status: "failed", claimToken: null, claimExpiresAt: null, errorCode: "QC_PUT_IN_FLIGHT", revision: sql`${qcImages.revision} + 1`, updatedAt: nowDate(now) }).where(and(eq(qcImages.id, known.id), eq(qcImages.claimToken, claimToken), eq(qcImages.status, "pending"))).run();
        await db.update(qcImageSources).set({ imageId: known.id, updatedAt: nowDate(now) }).where(eq(qcImageSources.id, sourceId)).run();
        await markSourceFailure(sourceId, sourceImportId, "QC_PUT_UNCERTAIN", true);
        return { sourceId, status: "pending" as const, code: "QC_PUT_UNCERTAIN" };
      } else {
        await reserveBytes(sourceId, sourceImportId, image.bytes.byteLength);
        requireRequestBudget(budget, QC_LIMITS.transferMs);
        const started = await db.update(qcImages).set({ errorCode: "QC_PUT_IN_FLIGHT", updatedAt: nowDate(now) }).where(and(eq(qcImages.id, known.id), eq(qcImages.claimToken, claimToken), eq(qcImages.status, "pending"))).returning({ id: qcImages.id }).get();
        if (!started) throw new DomainError("A reserva da foto mudou antes do backup.", 409, "QC_REVISION_CONFLICT");
        uploadR2Key = known.r2Key;
        try {
          requireRequestBudget(budget, QC_LIMITS.transferMs);
          putStarted = true;
          await storage.put({ key: known.r2Key, bytes: image.bytes, mimeType: image.mimeType, sha256: image.sha256 }, requestBudgetSignal(budget));
          putConfirmed = true;
          uncertainWrite = false;
          await db.update(qcImages).set({ errorCode: "QC_PUT_CONFIRMED", updatedAt: nowDate(now) }).where(and(eq(qcImages.id, known.id), eq(qcImages.claimToken, claimToken), eq(qcImages.status, "pending"))).run();
        } catch (putError) {
          if (putConfirmed) throw putError;
          await accountReservation(sourceId, sourceImportId, image.bytes.byteLength);
          requireRequestBudget(budget, QC_LIMITS.transferMs);
          const recovered = await storage.head(known.r2Key, requestBudgetSignal(budget));
          if (!recovered.exists || recovered.sha256 !== image.sha256) throw new DomainError("O envio do backup QC teve resultado incerto e será reconciliado.", 502, "QC_STORAGE_UNAVAILABLE");
          uncertainWrite = true;
        }
        if ((await db.select().from(qcImageSources).where(and(eq(qcImageSources.id, sourceId), sourceImportId === null ? isNull(qcImageSources.importId) : eq(qcImageSources.importId, sourceImportId))).get())?.bytesReserved) await accountReservation(sourceId, sourceImportId, image.bytes.byteLength);
      }
      await assertLock(lock);
      const ready = await db.transaction(async tx => {
        const currentImage = await tx.select().from(qcImages).where(eq(qcImages.id, imageId!)).get();
        const activeLock = await tx.select().from(qcTransferLocks).where(eq(qcTransferLocks.scope, lock.scope)).get();
        if (!currentImage || currentImage.status === "deleted" || currentImage.deletedAt || currentImage.claimToken !== claimToken || activeLock?.ownerId !== lock.ownerId || activeLock.version !== lock.version || activeLock.leaseUntil <= now()) return false;
        await tx.update(qcImages).set({ status: "ready", deleteState: "none", contentSha256: image.sha256, mimeType: image.mimeType, byteSize: image.bytes.byteLength, width: image.width, height: image.height, claimToken: uncertainWrite ? claimToken : null, claimExpiresAt: uncertainWrite ? new Date(now() + QC_LIMITS.lockMs) : null, errorCode: uncertainWrite ? "QC_PUT_IN_FLIGHT" : null, revision: currentImage.revision + 1, updatedAt: nowDate(now) }).where(and(eq(qcImages.id, imageId!), eq(qcImages.claimToken, claimToken!))).run();
        await tx.update(qcImageSources).set({ imageId, state: "ready", errorCode: null, updatedAt: nowDate(now) }).where(eq(qcImageSources.id, sourceId)).run();
        await repairPresentation(tx, external.purchaseId, [externalTargetKey], nowDate(now));
        return true;
      });
      if (!ready) {
        const tombstone = await db.select().from(qcImages).where(eq(qcImages.id, imageId)).get();
        if (tombstone?.status === "deleted") {
          const compensation = await compensateOwnPut(tombstone);
          if (compensation === "stale") return { sourceId, status: "deleted" as const };
          return compensation === "removed" ? { sourceId, status: "deleted" as const } : { sourceId, status: "pending" as const, code: "QC_DELETE_PENDING" };
        }
        throw new DomainError("A gravação tardia não confirmou a foto QC.", 409, "QC_TRANSFER_LEASE_LOST");
      }
      await processPreview(imageId, lock, budget, { imageId, bytes: image.bytes, sha256: image.sha256 });
      return { sourceId, status: "imported" as const };
    } catch (error) {
      const normalized = internalError(error);
      if (putConfirmed && imageId && claimToken) {
        const tombstone = await db.select().from(qcImages).where(eq(qcImages.id, imageId)).get();
        if (tombstone?.status === "deleted") {
          const compensation = await compensateOwnPut(tombstone);
          return compensation === "removed" ? { sourceId, status: "deleted" as const } : compensation === "stale" ? { sourceId, status: "deleted" as const } : { sourceId, status: "pending" as const, code: "QC_DELETE_PENDING" };
        }
      }
      const uncertainWrite = putStarted && !putConfirmed;
      const canceled = normalized.code === "QC_REQUEST_ABORTED";
      const recoverable = uncertainWrite || putConfirmed || normalized.code === "QC_STORAGE_UNAVAILABLE" || normalized.code === "QC_TRANSFER_LEASE_LOST" || normalized.code === "QC_IMAGE_BUSY" || normalized.code === "QC_REQUEST_BUDGET" || canceled;
      if (canceled && !downloadStarted) await accountReservation(sourceId, sourceImportId, 0);
      if (imageId && claimToken && !recoverable) await db.update(qcImages).set({ status: "failed", claimToken: null, claimExpiresAt: null, errorCode: normalized.code ?? "QC_IMAGE_FAILED", revision: sql`${qcImages.revision} + 1`, updatedAt: nowDate(now) }).where(and(eq(qcImages.id, imageId), eq(qcImages.claimToken, claimToken), eq(qcImages.status, "pending"))).run();
      else if (imageId && claimToken && putConfirmed) await db.update(qcImages).set({ status: "pending", claimToken: null, claimExpiresAt: null, errorCode: "QC_PUT_CONFIRMED", revision: sql`${qcImages.revision} + 1`, updatedAt: nowDate(now) }).where(and(eq(qcImages.id, imageId), eq(qcImages.claimToken, claimToken), eq(qcImages.status, "pending"))).run();
      else if (imageId && claimToken && normalized.code === "QC_REQUEST_BUDGET" && !putStarted) await db.update(qcImages).set({ status: "failed", claimToken: null, claimExpiresAt: null, errorCode: priorPutUncertainImageId === imageId ? "QC_PUT_IN_FLIGHT" : "QC_REQUEST_BUDGET", revision: sql`${qcImages.revision} + 1`, updatedAt: nowDate(now) }).where(and(eq(qcImages.id, imageId), eq(qcImages.claimToken, claimToken), eq(qcImages.status, "pending"))).run();
      else if (imageId && claimToken && canceled && !putStarted) await db.update(qcImages).set({ status: "failed", claimToken: null, claimExpiresAt: null, errorCode: priorPutUncertainImageId === imageId ? "QC_PUT_IN_FLIGHT" : "QC_REQUEST_ABORTED", revision: sql`${qcImages.revision} + 1`, updatedAt: nowDate(now) }).where(and(eq(qcImages.id, imageId), eq(qcImages.claimToken, claimToken), eq(qcImages.status, "pending"))).run();
      await markSourceFailure(sourceId, sourceImportId, normalized.code ?? "QC_IMAGE_FAILED", recoverable);
      const retryAfterSeconds = error instanceof QcDomainError ? error.retryAfterSeconds : undefined;
      const upstreamStatus = error instanceof QcDomainError ? error.upstreamStatus : undefined;
      return { sourceId, status: recoverable ? "pending" as const : "failed" as const, code: normalized.code ?? "QC_IMAGE_FAILED", ...(retryAfterSeconds ? { retryAfterSeconds } : {}), ...(upstreamStatus ? { upstreamStatus } : {}) };
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
        const coverChanges = await repairPresentation(tx, purchaseId, [targetKeyForExternal(external)], stamp);
        await tx.insert(qcEvents).values({ id: randomUUID(), workspaceId: external.workspaceId, purchaseId, actorId: userId, eventType: "QC_DELETE", resultCode: "TOMBSTONED", contextJson: JSON.stringify({ imageId, externalItemId: external.id, coverChanges }), createdAt: stamp }).run();
      });
    }
    const tombstone = await db.select().from(qcImages).where(eq(qcImages.id, imageId)).get();
    if (!tombstone) return { imageId, status: "deleted" as const };
    const tombstoneKey = tombstone.r2Key, tombstoneRevision = tombstone.revision;
    const preview = await db.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, imageId)).get();
    const previewKey = preview?.r2Key ?? null, previewRevision = preview?.revision ?? null;
    const sameImageGeneration = (current: typeof qcImages.$inferSelect | undefined) => !!current && current.status === "deleted" && current.r2Key === tombstoneKey && current.revision === tombstoneRevision;
    const samePreviewGeneration = (current: typeof qcImagePreviews.$inferSelect | undefined) => !!preview && !!current && current.status === "deleted" && current.r2Key === previewKey && current.revision === previewRevision;
    try {
      // Tombstoned keys remain known forever. HEAD + DELETE also repairs a late
      // remote PUT for this exact generation, without scanning the bucket.
      requireRequestBudget(budget, QC_LIMITS.transferMs);
      const object = await storage.head(tombstoneKey, requestBudgetSignal(budget));
      if (object.exists) {
        requireRequestBudget(budget, QC_LIMITS.transferMs);
        await storage.delete(tombstoneKey, requestBudgetSignal(budget));
      }
      requireRequestBudget(budget, QC_LIMITS.transferMs);
      if ((await storage.head(tombstoneKey, requestBudgetSignal(budget))).exists) throw new Error("QC tombstone object remains after DELETE");
      const writerUncertain = tombstone.errorCode === "QC_PUT_IN_FLIGHT" || !!tombstone.claimToken && !!tombstone.claimExpiresAt && tombstone.claimExpiresAt.getTime() > now();
      let previewPending = false;
      if (preview?.status === "deleted" && previewKey) {
        const previewWriterUncertain = preview.errorCode === "QC_PREVIEW_PUT_IN_FLIGHT" || !!preview.claimToken && !!preview.claimExpiresAt && preview.claimExpiresAt.getTime() > now();
        requireRequestBudget(budget, QC_LIMITS.transferMs);
        const previewObject = await storage.head(previewKey, requestBudgetSignal(budget));
        if (previewObject.exists) { requireRequestBudget(budget, QC_LIMITS.transferMs); await storage.delete(previewKey, requestBudgetSignal(budget)); }
        requireRequestBudget(budget, QC_LIMITS.transferMs);
        if ((await storage.head(previewKey, requestBudgetSignal(budget))).exists) throw new Error("QC preview tombstone object remains after DELETE");
        if (previewWriterUncertain) previewPending = true;
      }
      const currentImage = await db.select().from(qcImages).where(eq(qcImages.id, imageId)).get();
      if (!sameImageGeneration(currentImage)) return { imageId, status: "deleted" as const };
      const currentPreview = preview ? await db.select().from(qcImagePreviews).where(eq(qcImagePreviews.imageId, imageId)).get() : undefined;
      if (preview && !samePreviewGeneration(currentPreview)) return { imageId, status: "pending" as const, message: "A remoção do preview privado mudou durante a limpeza; tente reconciliar novamente." };
      if (tombstone.deleteState === "deleted" && (!preview || preview.deleteState === "deleted") && !writerUncertain && !previewPending) return { imageId, status: "deleted" as const };
      if (writerUncertain || previewPending) {
        if (preview && currentPreview && currentPreview.deleteState !== "deleted") await db.update(qcImagePreviews).set({ deleteState: "pending", revision: currentPreview.revision + 1, updatedAt: nowDate(now) }).where(and(eq(qcImagePreviews.imageId, imageId), eq(qcImagePreviews.revision, previewRevision!), eq(qcImagePreviews.r2Key, previewKey!), eq(qcImagePreviews.status, "deleted"))).run();
        await db.update(qcImages).set({ deleteState: "pending", revision: tombstoneRevision + 1, updatedAt: nowDate(now) }).where(and(eq(qcImages.id, imageId), eq(qcImages.status, "deleted"), eq(qcImages.revision, tombstoneRevision), eq(qcImages.r2Key, tombstoneKey))).run();
        return { imageId, status: "pending" as const, message: writerUncertain ? "A escrita do backup teve resultado incerto; a exclusão permanece pendente até a reconciliação da gravação." : "A remoção do preview privado aguarda reconciliação." };
      }
      if (preview && currentPreview && currentPreview.deleteState !== "deleted") {
        const removedPreview = await db.update(qcImagePreviews).set({ deleteState: "deleted", claimToken: null, claimExpiresAt: null, errorCode: null, revision: currentPreview.revision + 1, updatedAt: nowDate(now) }).where(and(eq(qcImagePreviews.imageId, imageId), eq(qcImagePreviews.revision, previewRevision!), eq(qcImagePreviews.r2Key, previewKey!), eq(qcImagePreviews.status, "deleted"))).returning({ imageId: qcImagePreviews.imageId }).get();
        if (!removedPreview) return { imageId, status: "pending" as const, message: "A remoção do preview privado mudou durante a limpeza; tente reconciliar novamente." };
      }
      const removedImage = await db.update(qcImages).set({ deleteState: "deleted", claimToken: null, claimExpiresAt: null, errorCode: null, revision: tombstoneRevision + 1, updatedAt: nowDate(now) }).where(and(eq(qcImages.id, imageId), eq(qcImages.status, "deleted"), eq(qcImages.revision, tombstoneRevision), eq(qcImages.r2Key, tombstoneKey))).returning({ id: qcImages.id }).get();
      if (!removedImage) return { imageId, status: "deleted" as const };
      return { imageId, status: "deleted" as const };
    } catch {
      const currentImage = await db.select().from(qcImages).where(eq(qcImages.id, imageId)).get();
      if (!sameImageGeneration(currentImage)) return { imageId, status: "deleted" as const };
      if (preview && previewKey && previewRevision !== null) await db.update(qcImagePreviews).set({ deleteState: "pending", revision: previewRevision + 1, updatedAt: nowDate(now) }).where(and(eq(qcImagePreviews.imageId, imageId), eq(qcImagePreviews.status, "deleted"), eq(qcImagePreviews.revision, previewRevision), eq(qcImagePreviews.r2Key, previewKey))).run();
      await db.update(qcImages).set({ deleteState: "pending", revision: tombstoneRevision + 1, updatedAt: nowDate(now) }).where(and(eq(qcImages.id, imageId), eq(qcImages.status, "deleted"), eq(qcImages.revision, tombstoneRevision), eq(qcImages.r2Key, tombstoneKey))).run();
      return { imageId, status: "pending" as const, message: "A imagem foi removida do Loti; a exclusão física do backup aguarda nova tentativa." };
    }
  }

  async function runBatch(purchaseId: string, importId?: string, expectedRevision?: number, externalItemId?: string) {
    const startedAt = performance.now();
    const budget = { deadline: now() + QC_LIMITS.requestMs };
    const purchase = await rate(purchaseId, "batch");
    if (!managerId || managerId !== userId) throw new DomainError("Você não pode administrar QC.", 403, "QC_FORBIDDEN");
    if (externalItemId) {
      const external = await db.select({ id: hubbuyExternalItems.id }).from(hubbuyExternalItems).where(and(eq(hubbuyExternalItems.id, externalItemId), eq(hubbuyExternalItems.purchaseId, purchaseId), or(sql`${hubbuyExternalItems.purchaseItemId} IS NOT NULL`, sql`${hubbuyExternalItems.additionalOrderItemId} IS NOT NULL`))).get();
      if (!external) throw new DomainError("Ocorrência QC não encontrada ou ainda não associada.", 404, "QC_EXTERNAL_NOT_FOUND");
    }
    let transferSourceIds: string[] | undefined;
    if (importId) {
      const manifest = await db.select().from(qcImports).where(and(eq(qcImports.id, importId), eq(qcImports.purchaseId, purchaseId))).get();
      if (!manifest) throw new DomainError("Importação QC não encontrada nesta compra.", 404, "QC_IMPORT_NOT_FOUND");
      if (manifest.status !== "confirmed" || manifest.expiresAt && manifest.expiresAt.getTime() <= now()) throw new DomainError("A importação expirou. Use reconciliar pendências da compra.", 409, "QC_IMPORT_EXPIRED");
      if (expectedRevision !== undefined && manifest.revision !== expectedRevision) throw new DomainError("O progresso da importação mudou. Atualize antes de tentar novamente.", 409, "QC_REVISION_CONFLICT");
      transferSourceIds = (JSON.parse(manifest.manifestJson) as ImportManifest).transferSourceIds;
    }
    const lock = await acquireLock(purchase.workspaceId);
    try {
      // Select a stable, bounded batch and preserve the current oldest-first order.
      const eligibleWhere = and(eq(hubbuyExternalItems.purchaseId, purchaseId), inArray(qcImageSources.state, ["pending", "failed"]), ...(importId ? [eq(qcImageSources.importId, importId)] : []), ...(transferSourceIds ? [inArray(qcImageSources.id, transferSourceIds)] : []), ...(externalItemId ? [eq(qcImageSources.externalItemId, externalItemId)] : []), or(sql`${hubbuyExternalItems.purchaseItemId} IS NOT NULL`, sql`${hubbuyExternalItems.additionalOrderItemId} IS NOT NULL`));
      const eligible = await db.select({ id: qcImageSources.id, updatedAt: qcImageSources.updatedAt, createdAt: qcImageSources.createdAt, ordinal: qcImageSources.ordinal, externalItemId: qcImageSources.externalItemId, purchaseItemId: hubbuyExternalItems.purchaseItemId, additionalOrderItemId: hubbuyExternalItems.additionalOrderItemId }).from(qcImageSources).innerJoin(hubbuyExternalItems, eq(qcImageSources.externalItemId, hubbuyExternalItems.id)).where(eligibleWhere).orderBy(asc(qcImageSources.updatedAt), asc(qcImageSources.createdAt), asc(qcImageSources.ordinal), asc(qcImageSources.id)).limit(QC_LIMITS.batch).all();
      const pendingDeletes = importId || externalItemId ? [] : await db.select({ id: qcImages.id, updatedAt: qcImages.updatedAt }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).where(and(eq(hubbuyExternalItems.purchaseId, purchaseId), eq(qcImages.status, "deleted"), eq(qcImages.deleteState, "pending"))).orderBy(asc(qcImages.updatedAt)).limit(1).all();
      const previewWork = importId || externalItemId ? [] : await db.select({ id: qcImages.id, updatedAt: qcImages.updatedAt }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).leftJoin(qcImagePreviews, eq(qcImagePreviews.imageId, qcImages.id)).where(and(eq(hubbuyExternalItems.purchaseId, purchaseId), eq(qcImages.status, "ready"), or(isNull(qcImagePreviews.imageId), inArray(qcImagePreviews.status, ["pending", "failed"]), and(eq(qcImagePreviews.status, "ready"), sql`${qcImagePreviews.transformVersion} != ${QC_PREVIEW.version}`)))).orderBy(asc(qcImages.updatedAt), asc(qcImages.createdAt), asc(qcImages.id)).limit(1).all();
      const sourceAt = eligible[0]?.updatedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const deleteAt = pendingDeletes[0]?.updatedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const previewAt = previewWork[0]?.updatedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const selectedDelete = deleteAt <= sourceAt && deleteAt <= previewAt ? pendingDeletes[0] : undefined;
      const selectedImage = !selectedDelete && sourceAt <= previewAt ? eligible[0] : undefined;
      const selectedPreview = !selectedDelete && !selectedImage ? previewWork[0] : undefined;
      if ((selectedImage || selectedDelete || selectedPreview) && !config.storage && !localQaStorage) assertQcStorageConfigured();
      const results: { sourceId?: string; imageId?: string; status: string; code?: string; message?: string; retryAfterSeconds?: number; upstreamStatus?: number }[] = [];
      let stopReason: "deadline" | "quota" | "recovery" | "failure" | undefined;
      if (selectedDelete) {
        await rate(purchaseId, "delete");
        results.push(await removeTombstone(selectedDelete.id, purchaseId, lock, budget));
      } else if (selectedImage) {
        metrics.increment("photosSelected", eligible.length);
        const orderedResults: Array<{ sourceId?: string; imageId?: string; status: string; code?: string; message?: string; retryAfterSeconds?: number; upstreamStatus?: number } | undefined> = Array(eligible.length);
        const lanes = new Map<string, Array<{ source: typeof eligible[number]; index: number }>>();
        eligible.forEach((source, index) => {
          const destination = source.purchaseItemId ? `purchase:${source.purchaseItemId}` : source.additionalOrderItemId ? `additional:${source.additionalOrderItemId}` : `external:${source.externalItemId}`;
          const lane = lanes.get(destination) ?? [];
          lane.push({ source, index });
          lanes.set(destination, lane);
        });
        const minimumFirstStageMs = QC_LIMITS.dnsMs + QC_LIMITS.transferMs + QC_LIMITS.imageValidationMs + QC_LIMITS.requestSafetyMs;
        await Promise.allSettled([...lanes.values()].map(lane => pipelineSlots.run(async () => {
          for (const { source, index } of lane) {
            if (config.signal?.aborted) {
              orderedResults[index] = { sourceId: source.id, status: "pending", code: "QC_REQUEST_ABORTED" };
              continue;
            }
            if (budget.deadline - now() < minimumFirstStageMs) {
              metrics.increment("deadlineInterruptions");
              stopReason = "deadline";
              orderedResults[index] = { sourceId: source.id, status: "pending", code: "QC_REQUEST_BUDGET" };
              continue;
            }
            try {
              orderedResults[index] = await processSource(source.id, lock, budget);
            } catch (error) {
              const normalized = internalError(error);
              orderedResults[index] = { sourceId: source.id, status: "pending", code: normalized.code ?? "QC_INTERNAL" };
              if (normalized.code === "QC_REQUEST_BUDGET") stopReason = "deadline";
              else if (normalized.code === "QC_IMPORT_BYTES_LIMIT") stopReason = "quota";
              else if (normalized.code === "QC_REQUEST_ABORTED") stopReason = "recovery";
              else stopReason ??= "failure";
            }
          }
        }, config.signal)));
        for (let index = 0; index < orderedResults.length; index++) results.push(orderedResults[index] ?? { sourceId: eligible[index]!.id, status: "pending", code: config.signal?.aborted ? "QC_REQUEST_ABORTED" : "QC_REQUEST_BUDGET" });
      } else if (selectedPreview) {
        const result = await processPreview(selectedPreview.id, lock, budget);
        results.push({ imageId: result.imageId, status: result.status === "generated" ? "previewed" : result.status, ...("code" in result ? { code: result.code } : {}) });
      }
      const counts = { imported: results.filter(row => row.status === "imported").length, previews: results.filter(row => row.status === "previewed").length, existing: results.filter(row => row.status === "existing").length, deleted: results.filter(row => row.status === "deleted").length, failed: results.filter(row => row.status === "failed").length, pending: results.filter(row => row.status === "pending").length };
      if (!stopReason) {
        if (results.some(row => row.code === "QC_REQUEST_BUDGET")) stopReason = "deadline";
        else if (results.some(row => row.code === "QC_IMPORT_BYTES_LIMIT")) stopReason = "quota";
        else if (counts.pending) stopReason = "recovery";
        else if (counts.failed) stopReason = "failure";
      }
      metrics.increment("photosImported", counts.imported);
      metrics.increment("photosExisting", counts.existing);
      metrics.increment("photosFailed", counts.failed);
      metrics.increment("photosPending", counts.pending);
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
      const snapshot = importId ? await getImport(importId) : undefined;
      const retryAfterSeconds = results.reduce((maximum, result) => Math.max(maximum, "retryAfterSeconds" in result ? result.retryAfterSeconds ?? 0 : 0), 0);
      return { ...counts, processed: results.length, remaining, hasMore, complete, partial: !complete, results, ...(stopReason ? { stopReason } : {}), ...(retryAfterSeconds ? { retryAfterSeconds } : {}), ...(snapshot ? { snapshot } : {}), ...(revision === undefined ? {} : { revision }) };
    } finally { await releaseLock(lock); metrics.observe("total", performance.now() - startedAt); }
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
    if (!external || !targetKeyForExternal(external) || !await resolveTarget(db, external.purchaseId, targetKeyForExternal(external)!)) throw new DomainError("Imagem QC não encontrada.", 404, "QC_IMAGE_NOT_FOUND");
    const purchase = await rate(external.purchaseId, "fallback");
    const lock = await acquireLock(purchase.workspaceId);
    try {
      const activeImage = await db.select().from(qcImages).where(and(eq(qcImages.id, imageId), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).get();
      if (!activeImage || activeImage.externalItemId !== external.id) throw new DomainError("Imagem QC não encontrada.", 404, "QC_IMAGE_NOT_FOUND");
      const activeExternal = await db.select().from(hubbuyExternalItems).where(eq(hubbuyExternalItems.id, external.id)).get();
      if (!activeExternal || activeExternal.purchaseId !== purchase.id || !targetKeyForExternal(activeExternal) || !await resolveTarget(db, activeExternal.purchaseId, targetKeyForExternal(activeExternal)!)) throw new DomainError("Imagem QC não encontrada.", 404, "QC_IMAGE_NOT_FOUND");
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

  const contextual = <Args extends unknown[], Result>(operation: (...args: Args) => Promise<Result>) => (...args: Args) => withQcMetricContext(metrics, () => withQcDatabaseQueueContext(databaseQueue, () => operation(...args)));
  return { authorizedPurchase: contextual(authorizedPurchase), rate: contextual(rate), addEvent: contextual(addEvent), getTargets: contextual(getTargets), getQcSummary: contextual(getQcSummary), getGallery: contextual(getGallery), getQcPresentations: contextual(getQcPresentations), getOriginalSource: contextual(getOriginalSource), getPreview: contextual(getPreview), readPreview: contextual(readPreview), setPresentationCover: contextual(setPresentationCover), prepare: contextual(prepare), getImport: contextual(getImport), confirmImport: contextual(confirmImport), resolvePendingOccurrence: contextual(resolvePendingOccurrence), runBatch: contextual(runBatch), runImportBatch: contextual(runImportBatch), deleteImage: contextual(deleteImage), fallback: contextual(fallback), managerId, storage, download, validate, now, metrics };
}
