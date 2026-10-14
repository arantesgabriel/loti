import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/connection";
import { hubbuyExternalItems, purchaseItems, qcEvents, qcImageSources, qcImages, qcImports, qcRateLimits, qcTransferLocks } from "../db/schema";
import { authorization } from "./authorization";
import { DomainError } from "./errors";
import { suggestQcMatch, type QcMatch } from "./qc-matching";
import { QC_LIMITS, QC_RATE_LIMITS, type QcRateOperation } from "./qc-limits";
import { parseHubBuyImport, type ParsedQcImport, type QcOccurrenceInput } from "./qc-validation";
import { assertQcStorageConfigured, r2QcStorage, type QcStorage } from "../qc/storage";
import { downloadHubbuyImage } from "../qc/download";
import { validateQcImage } from "../qc/image-validation";
import { validateHubbuySourceUrl } from "../qc/download";

type ManagerConfig = { managerId?: string | null; storage?: QcStorage; download?: typeof downloadHubbuyImage; validate?: typeof validateQcImage; now?: () => number };
type PreviewOccurrence = { occurrence: QcOccurrenceInput; match: QcMatch; existingId: string | null; existingRevision: number | null; existingItemId: string | null; conflict?: string };
type ImportManifest = ParsedQcImport & { rows: PreviewOccurrence[] };
type RequestBudget = { deadline: number };

const nowDate = (fn: () => number) => new Date(fn());
const internalError = (error: unknown) => error instanceof DomainError ? error : new DomainError("Não foi possível concluir a operação QC.", 500, "QC_INTERNAL");
const uniqueError = (error: unknown) => /UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/i.test(error instanceof Error ? error.message : String(error));

export function qcServices(db: AppDatabase, userId: string, config: ManagerConfig = {}) {
  const now = config.now ?? Date.now;
  const storage = config.storage ?? r2QcStorage;
  const download = config.download ?? downloadHubbuyImage;
  const validate = config.validate ?? validateQcImage;
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
    const purchase = await authorizedPurchase(purchaseId, operation !== "fallback");
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

  async function getTargets(purchaseId: string) {
    const rows = await db.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, purchaseId)).orderBy(asc(purchaseItems.createdAt)).all();
    return rows.map(row => ({ id: row.id, name: row.name, url: row.url, variant: row.variant, quantity: row.quantity }));
  }

  async function getQcSummary(purchaseId: string) {
    await authorizedPurchase(purchaseId);
    const manage = !!managerId && managerId === userId;
    const [external, images, sources, pendingDeletes] = await Promise.all([
      db.select().from(hubbuyExternalItems).where(eq(hubbuyExternalItems.purchaseId, purchaseId)).all(),
      db.select({ externalItemId: qcImages.externalItemId, status: qcImages.status, deleteState: qcImages.deleteState }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).where(eq(hubbuyExternalItems.purchaseId, purchaseId)).all(),
      manage ? db.select({ state: qcImageSources.state }).from(qcImageSources).innerJoin(hubbuyExternalItems, eq(qcImageSources.externalItemId, hubbuyExternalItems.id)).where(eq(hubbuyExternalItems.purchaseId, purchaseId)).all() : Promise.resolve([]),
      manage ? db.select({ id: qcImages.id }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).where(and(eq(hubbuyExternalItems.purchaseId, purchaseId), eq(qcImages.status, "deleted"), eq(qcImages.deleteState, "pending"))).all() : Promise.resolve([]),
    ]);
    const counts = new Map<string, number>();
    for (const image of images) if (image.status === "ready" && image.deleteState === "none") {
      const itemId = external.find(row => row.id === image.externalItemId)?.purchaseItemId;
      if (itemId) counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
    }
    return { purchaseId, canManage: manage, counts: [...counts].map(([itemId, count]) => ({ itemId, count })), ...(manage ? { pending: sources.filter(row => row.state === "pending" || row.state === "failed").length, pendingDeletes: pendingDeletes.length } : {}) };
  }

  async function getGallery(purchaseId: string, itemId: string, limit = 50, offset = 0) {
    await authorizedPurchase(purchaseId);
    const item = await db.select({ id: purchaseItems.id }).from(purchaseItems).where(and(eq(purchaseItems.id, itemId), eq(purchaseItems.purchaseId, purchaseId))).get();
    if (!item) throw new DomainError("Produto não encontrado nesta compra.", 404, "QC_ITEM_NOT_FOUND");
    const external = await db.select().from(hubbuyExternalItems).where(and(eq(hubbuyExternalItems.purchaseId, purchaseId), eq(hubbuyExternalItems.purchaseItemId, itemId))).all();
    if (!external.length) return { itemId, images: [], nextOffset: null };
    const ids = external.map(row => row.id);
    const rows = await db.select().from(qcImages).where(and(inArray(qcImages.externalItemId, ids), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).orderBy(asc(qcImages.ordinal), asc(qcImages.createdAt)).limit(Math.min(50, limit)).offset(Math.max(0, offset)).all();
    const imageIds = rows.map(row => row.id);
    const sourceRows = imageIds.length ? await db.select({ imageId: qcImageSources.imageId, sourceUrl: qcImageSources.sourceUrl }).from(qcImageSources).where(and(inArray(qcImageSources.imageId, imageIds), eq(qcImageSources.state, "ready"))).orderBy(asc(qcImageSources.createdAt)).all() : [];
    const sourcesByImage = new Map<string, string>();
    for (const source of sourceRows) if (source.imageId && !sourcesByImage.has(source.imageId)) sourcesByImage.set(source.imageId, source.sourceUrl);
    return { itemId, images: rows.map(row => ({ id: row.id, sourceUrl: validateHubbuySourceUrl(sourcesByImage.get(row.id) ?? row.sourceUrl).toString(), width: row.width, height: row.height, mimeType: row.mimeType, occurrence: external.find(value => value.id === row.externalItemId)?.skuInfo ?? external.find(value => value.id === row.externalItemId)?.title ?? "Ocorrência HubBuy" })), nextOffset: rows.length === Math.min(50, limit) ? offset + rows.length : null };
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
      if (conflicting) return { occurrence, match: { status: "manual", targetItemId: null, candidates: [] }, existingId: null, existingRevision: null, existingItemId: null, conflict: "IDs HubBuy conflitantes" };
      const found = combined[0];
      const match = suggestQcMatch(occurrence, targets, found?.purchaseItemId);
      if (found && !found.purchaseItemId && match.status === "manual") return { occurrence, match: { ...match, status: "manual" as const }, existingId: found.id, existingRevision: found.revision, existingItemId: null };
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
    return { importId: row.id, purchaseId: row.purchaseId, revision: row.revision, status: row.status, expiresAt: row.expiresAt, bytesReserved: row.bytesReserved, bytesConsumed: row.bytesConsumed, rows: manifest.rows.map(entry => ({ externalKey: entry.occurrence.externalKey, skuInfo: entry.occurrence.skuInfo, title: entry.occurrence.title, photoCount: entry.occurrence.photos.length, match: entry.match, conflict: entry.conflict ?? null })) };
  }

  async function confirmImport(importId: string, expectedRevision: number, choices: Array<{ externalKey: string; purchaseItemId: string | null; correctExisting?: boolean; expectedItemId?: string | null }>) {
    const row = await db.select().from(qcImports).where(eq(qcImports.id, importId)).get();
    if (!row) throw new DomainError("Importação QC não encontrada.", 404, "QC_IMPORT_NOT_FOUND");
    const purchase = await rate(row.purchaseId, "match");
    const current = nowDate(now);
    if (row.status !== "prepared" || !row.expiresAt || row.expiresAt.getTime() <= now()) throw new DomainError("A prévia expirou ou já foi confirmada. Prepare o JSON novamente.", 409, "QC_IMPORT_EXPIRED");
    if (row.revision !== expectedRevision) throw new DomainError("A prévia ficou desatualizada. Atualize e revise novamente.", 409, "QC_REVISION_CONFLICT");
    const manifest = JSON.parse(row.manifestJson) as ImportManifest;
    if (choices.length > manifest.rows.length || new Set(choices.map(choice => choice.externalKey)).size !== choices.length || choices.some(choice => !manifest.rows.some(entry => entry.occurrence.externalKey === choice.externalKey))) throw new DomainError("Escolhas QC duplicadas ou excessivas.", 400, "QC_MATCH_INVALID");
    const choicesByKey = new Map(choices.map(choice => [choice.externalKey, choice]));
    const targets = await db.select({ id: purchaseItems.id }).from(purchaseItems).where(eq(purchaseItems.purchaseId, row.purchaseId)).all();
    const allowedTargetIds = new Set(targets.map(target => target.id));
    const destinationIds = choices.map(choice => choice.purchaseItemId).filter((id): id is string => id !== null);
    if (destinationIds.some(id => !allowedTargetIds.has(id))) throw new DomainError("O produto selecionado não pertence a esta compra.", 403, "QC_ITEM_CROSS_PURCHASE");
    const result = { linked: 0, ignored: 0, sources: 0, corrected: 0 };
    const lock = await acquireLock(purchase.workspaceId);
    try { await db.transaction(async tx => {
      const activeLock = await tx.select().from(qcTransferLocks).where(eq(qcTransferLocks.scope, lock.scope)).get();
      if (activeLock?.ownerId !== lock.ownerId || activeLock.version !== lock.version || activeLock.leaseUntil <= now()) throw new DomainError("A operação QC perdeu sua concessão antes de confirmar os vínculos.", 409, "QC_TRANSFER_LEASE_LOST");
      const fresh = await tx.select().from(qcImports).where(eq(qcImports.id, importId)).get();
      if (!fresh || fresh.revision !== expectedRevision || fresh.status !== "prepared") throw new DomainError("A prévia foi alterada em outra solicitação.", 409, "QC_REVISION_CONFLICT");
      await authorization(tx, userId).requirePurchase(row.purchaseId);
      for (const entry of manifest.rows) {
        const choice = choicesByKey.get(entry.occurrence.externalKey);
        const destinationId = choice ? choice.purchaseItemId : entry.match.targetItemId;
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
        if (destinationId) result.linked++; else result.ignored++;
        if (entry.existingItemId !== destinationId) await tx.insert(qcEvents).values({ id: randomUUID(), workspaceId: purchase.workspaceId, purchaseId: row.purchaseId, actorId: userId, eventType: "QC_MATCH", resultCode: entry.existingItemId ? "CORRECTED" : destinationId ? "LINKED" : "IGNORED", contextJson: JSON.stringify({ externalItemId: externalId, fromItemId: entry.existingItemId, toItemId: destinationId }), createdAt: current }).run();
        for (const photo of entry.occurrence.photos) {
          const prior = await tx.select().from(qcImageSources).where(and(eq(qcImageSources.externalItemId, externalId), eq(qcImageSources.sourceUrlHash, photo.urlHash))).get();
          if (prior) {
            if (prior.state === "ready" || prior.state === "deleted" || prior.importId === importId) continue;
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
            continue;
          }
          await tx.insert(qcImageSources).values({ id: randomUUID(), importId, externalItemId: externalId, imageId: null, sourceUrl: photo.url, sourceUrlHash: photo.urlHash, ordinal: photo.ordinal, state: "pending", attempts: 0, bytesReserved: 0, bytesConsumed: 0, errorCode: null, createdAt: current, updatedAt: current }).run();
          result.sources++;
        }
      }
      const updated = await tx.update(qcImports).set({ status: "confirmed", revision: expectedRevision + 1, updatedAt: current }).where(and(eq(qcImports.id, importId), eq(qcImports.revision, expectedRevision))).returning({ id: qcImports.id }).get();
      if (!updated) throw new DomainError("A importação foi alterada em outra solicitação.", 409, "QC_REVISION_CONFLICT");
      await tx.insert(qcEvents).values({ id: randomUUID(), workspaceId: purchase.workspaceId, purchaseId: row.purchaseId, actorId: userId, eventType: "QC_IMPORT", resultCode: "CONFIRMED", contextJson: JSON.stringify({ importId, linked: result.linked, ignored: result.ignored, sources: result.sources }), createdAt: current }).run();
    }); } finally { await releaseLock(lock); }
    return { importId, revision: expectedRevision + 1, ...result, partial: manifest.partial };
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
              return true;
            });
            if (ready) return { sourceId, status: "existing" as const };
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
        await db.update(qcImageSources).set({ imageId: known.id, state: "ready", errorCode: null, updatedAt: nowDate(now) }).where(eq(qcImageSources.id, sourceId)).run();
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
        await tx.insert(qcEvents).values({ id: randomUUID(), workspaceId: external.workspaceId, purchaseId, actorId: userId, eventType: "QC_DELETE", resultCode: "TOMBSTONED", contextJson: JSON.stringify({ imageId, externalItemId: external.id }), createdAt: stamp }).run();
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
      if (writerUncertain) {
        await db.update(qcImages).set({ deleteState: "pending", updatedAt: nowDate(now) }).where(and(eq(qcImages.id, imageId), eq(qcImages.status, "deleted"))).run();
        return { imageId, status: "pending" as const, message: "A escrita do backup teve resultado incerto; a exclusão permanece pendente até a reconciliação da gravação." };
      }
      await db.update(qcImages).set({ deleteState: "deleted", claimToken: null, claimExpiresAt: null, errorCode: null, updatedAt: nowDate(now) }).where(and(eq(qcImages.id, imageId), eq(qcImages.status, "deleted"))).run();
      return { imageId, status: "deleted" as const };
    } catch {
      await db.update(qcImages).set({ deleteState: "pending", updatedAt: nowDate(now) }).where(and(eq(qcImages.id, imageId), eq(qcImages.status, "deleted"))).run();
      return { imageId, status: "pending" as const, message: "A imagem foi removida do Loti; a exclusão física do backup aguarda nova tentativa." };
    }
  }

  async function runBatch(purchaseId: string, importId?: string, expectedRevision?: number) {
    const budget = { deadline: now() + QC_LIMITS.requestMs };
    const purchase = await rate(purchaseId, "batch");
    if (!managerId || managerId !== userId) throw new DomainError("Você não pode administrar QC.", 403, "QC_FORBIDDEN");
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
      const eligible = await db.select({ id: qcImageSources.id, updatedAt: qcImageSources.updatedAt }).from(qcImageSources).innerJoin(hubbuyExternalItems, eq(qcImageSources.externalItemId, hubbuyExternalItems.id)).where(and(eq(hubbuyExternalItems.purchaseId, purchaseId), inArray(qcImageSources.state, ["pending", "failed"]), ...(importId ? [eq(qcImageSources.importId, importId)] : []), sql`${hubbuyExternalItems.purchaseItemId} IS NOT NULL`)).orderBy(asc(qcImageSources.updatedAt), asc(qcImageSources.createdAt), asc(qcImageSources.ordinal)).limit(1).all();
      const pendingDeletes = await db.select({ id: qcImages.id, updatedAt: qcImages.updatedAt }).from(qcImages).innerJoin(hubbuyExternalItems, eq(qcImages.externalItemId, hubbuyExternalItems.id)).where(and(eq(hubbuyExternalItems.purchaseId, purchaseId), eq(qcImages.status, "deleted"))).orderBy(asc(qcImages.updatedAt)).limit(1).all();
      const deleteFirst = !!pendingDeletes[0] && (!eligible[0] || (pendingDeletes[0].updatedAt?.getTime() ?? 0) <= (eligible[0].updatedAt?.getTime() ?? 0));
      const selectedImage = !deleteFirst ? eligible[0] : undefined;
      const selectedDelete = deleteFirst ? pendingDeletes[0] : undefined;
      if ((selectedImage || selectedDelete) && !config.storage) assertQcStorageConfigured();
      const results: { sourceId?: string; imageId?: string; status: string; code?: string; message?: string }[] = [];
      if (selectedDelete) {
        await rate(purchaseId, "delete");
        results.push(await removeTombstone(selectedDelete.id, purchaseId, lock, budget));
      } else if (selectedImage) {
        results.push(await processSource(selectedImage.id, lock, budget));
      }
      const counts = { imported: results.filter(row => row.status === "imported").length, existing: results.filter(row => row.status === "existing").length, deleted: results.filter(row => row.status === "deleted").length, failed: results.filter(row => row.status === "failed").length, pending: results.filter(row => row.status === "pending").length };
      await addEvent(purchaseId, purchase.workspaceId, "QC_IMPORT", counts.failed || counts.pending ? "PARTIAL" : "BATCH_COMPLETE", { importId: importId ?? null, ...counts, processed: results.length });
      let revision: number | undefined;
      if (importId && expectedRevision !== undefined) {
        const updated = await db.update(qcImports).set({ revision: expectedRevision + 1, updatedAt: nowDate(now) }).where(and(eq(qcImports.id, importId), eq(qcImports.revision, expectedRevision))).returning({ revision: qcImports.revision }).get();
        if (!updated) throw new DomainError("O progresso mudou durante o lote; as fotos concluídas foram preservadas.", 409, "QC_REVISION_CONFLICT");
        revision = updated.revision;
      }
      if (!importId) await db.update(qcImports).set({ status: "expired", updatedAt: nowDate(now) }).where(and(eq(qcImports.purchaseId, purchaseId), inArray(qcImports.status, ["prepared", "confirmed"]), lte(qcImports.expiresAt, nowDate(now)))).run();
      return { ...counts, processed: results.length, partial: counts.failed + counts.pending > 0, results, ...(revision === undefined ? {} : { revision }) };
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

  return { authorizedPurchase, rate, addEvent, getTargets, getQcSummary, getGallery, prepare, getImport, confirmImport, runBatch, runImportBatch, deleteImage, fallback, managerId, storage, download, validate, now };
}
