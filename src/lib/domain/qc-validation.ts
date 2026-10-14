import { createHash } from "node:crypto";
import { z } from "zod";
import { DomainError } from "./errors";
import { QC_LIMITS } from "./qc-limits";

export type QcPhotoInput = { url: string; ordinal: number; urlHash: string };
export type QcOccurrenceInput = {
  externalKey: string;
  orderGoodsId: string | null;
  orderGoodsNo: string | null;
  orderNo: string | null;
  offerId: string | null;
  channel: string | null;
  offerUrl: string | null;
  skuInfo: string | null;
  title: string | null;
  quantity: number | null;
  photos: QcPhotoInput[];
};
export type ParsedQcImport = { occurrences: QcOccurrenceInput[]; orderCount: number; photoCount: number; partial: boolean; reportedCount: number | null };

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function optionalText(value: unknown, max: number, name: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > max || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) throw new DomainError(`Campo HubBuy inválido: ${name}.`, 400, "QC_IMPORT_INVALID");
  return value;
}
function optionalCount(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 10_000) throw new DomainError("Quantidade HubBuy inválida.", 400, "QC_IMPORT_INVALID");
  return value;
}
function readUrl(value: unknown): string | null {
  const url = optionalText(value, QC_LIMITS.urlChars, "URL");
  if (url === null) return null;
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new DomainError("URL de foto HubBuy inválida.", 400, "QC_IMPORT_INVALID"); }
  if (parsed.protocol !== "https:" || parsed.hostname !== "scm.hubbuy.app" || parsed.port && parsed.port !== "443" || parsed.username || parsed.password) throw new DomainError("A origem da foto não pertence ao host HubBuy permitido.", 422, "QC_SOURCE_REJECTED");
  return url;
}
const photoArraySchema = z.array(z.unknown()).max(QC_LIMITS.photos);

export function parseHubBuyImport(input: unknown): ParsedQcImport {
  const root = record(input);
  if (root.code !== 0 && root.code !== "0" && root.code !== 200 && root.code !== "200") throw new DomainError("O JSON não contém uma resposta HubBuy concluída com sucesso.", 400, "QC_IMPORT_INVALID");
  const payload = record(root.data);
  if (!Array.isArray(payload.list) || payload.list.length > QC_LIMITS.orders) throw new DomainError("A lista HubBuy está ausente ou excede 100 pedidos.", 400, "QC_IMPORT_LIMIT");
  const occurrences: QcOccurrenceInput[] = [];
  let photoCount = 0;
  for (const orderValue of payload.list) {
    const order = record(orderValue);
    const orderNo = optionalText(order.orderNo, QC_LIMITS.externalIdChars, "orderNo");
    if (!Array.isArray(order.goodsList)) throw new DomainError("Pedido HubBuy sem goodsList válido.", 400, "QC_IMPORT_INVALID");
    for (const goodsValue of order.goodsList) {
      if (occurrences.length >= QC_LIMITS.occurrences) throw new DomainError("O JSON excede 500 ocorrências HubBuy.", 400, "QC_IMPORT_LIMIT");
      const goods = record(goodsValue);
      const orderGoodsId = optionalText(goods.orderGoodsId, QC_LIMITS.externalIdChars, "orderGoodsId");
      const orderGoodsNo = optionalText(goods.orderGoodsNo, QC_LIMITS.externalIdChars, "orderGoodsNo");
      if (!orderGoodsId && !orderGoodsNo) throw new DomainError("Ocorrência sem identificador HubBuy; não é possível importá-la com segurança.", 400, "QC_IMPORT_ID_REQUIRED");
      if (orderGoodsId && orderGoodsNo && orderGoodsId === orderGoodsNo) throw new DomainError("Identificadores principal e alternativo conflitantes.", 400, "QC_IMPORT_ID_CONFLICT");
      if (goods.freePhotos !== undefined && goods.freePhotos !== null && !Array.isArray(goods.freePhotos)) throw new DomainError("freePhotos precisa ser uma lista.", 400, "QC_IMPORT_INVALID");
      const photoResult = goods.freePhotos === undefined || goods.freePhotos === null ? { success: true as const, data: [] as unknown[] } : photoArraySchema.safeParse(goods.freePhotos);
      if (!photoResult.success) throw new DomainError("A lista freePhotos excede 200 entradas.", 400, "QC_IMPORT_LIMIT");
      const rawPhotos = photoResult.data;
      photoCount += rawPhotos.length;
      if (photoCount > QC_LIMITS.photos) throw new DomainError("A importação excede 200 fotos.", 400, "QC_IMPORT_LIMIT");
      const photos = rawPhotos.map((value, ordinal) => {
        const url = readUrl(value);
        if (!url) throw new DomainError("freePhotos aceita somente URLs de foto HubBuy.", 400, "QC_IMPORT_INVALID");
        const identityUrl = new URL(url); identityUrl.hash = "";
        return { url, ordinal, urlHash: createHash("sha256").update(identityUrl.toString()).digest("hex") };
      });
      const externalKey = `${orderNo ?? "order?"}:${orderGoodsId ? `id:${orderGoodsId}` : `no:${orderGoodsNo}`}`;
      occurrences.push({
        externalKey, orderGoodsId, orderGoodsNo, orderNo,
        offerId: optionalText(goods.offerId, QC_LIMITS.externalIdChars, "offerId"),
        channel: optionalText(goods.channel, 200, "channel"),
        offerUrl: optionalText(goods.offerUrl, QC_LIMITS.urlChars, "offerUrl"),
        skuInfo: optionalText(goods.skuInfo, QC_LIMITS.skuChars, "skuInfo"),
        title: optionalText(goods.goodsName, QC_LIMITS.titleChars, "goodsName"),
        quantity: optionalCount(goods.quantity), photos,
      });
    }
  }
  const reportedCount = optionalCount(payload.count);
  const seenKeys = new Set<string>();
  for (const occurrence of occurrences) {
    if (seenKeys.has(occurrence.externalKey)) throw new DomainError("O JSON repete um identificador HubBuy na mesma conta/pedido.", 400, "QC_IMPORT_ID_CONFLICT");
    seenKeys.add(occurrence.externalKey);
  }
  return { occurrences, orderCount: payload.list.length, photoCount, reportedCount, partial: reportedCount !== null && reportedCount > payload.list.length };
}

export async function readBoundedJson(request: Request): Promise<unknown> {
  const header = request.headers.get("content-length");
  if (header && (!/^\d+$/.test(header) || Number(header) > QC_LIMITS.bodyBytes)) throw new DomainError("O JSON excede o limite de 1 MiB.", 413, "QC_BODY_LIMIT");
  if (!request.body) throw new DomainError("Corpo JSON vazio.", 400, "QC_IMPORT_INVALID");
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > QC_LIMITS.bodyBytes) { await reader.cancel(); throw new DomainError("O JSON excede o limite de 1 MiB.", 413, "QC_BODY_LIMIT"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new DomainError("O corpo precisa ser um JSON UTF-8 válido.", 400, "QC_IMPORT_INVALID"); }
}
