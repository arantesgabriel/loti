import { buildCanonicalProductKey, detectPlatform } from "./urls";
import type { QcOccurrenceInput } from "./qc-validation";

export type QcMatchTarget = { id: string; name: string; url: string; variant: string | null; quantity: number };
export type QcMatch = { status: "MATCHED" | "PENDING" | "IGNORED"; targetItemId: string | null; candidates: { itemId: string; name: string; reasons: string[] }[] };
type LegacyQcMatch = { status?: unknown; targetItemId?: unknown; candidates?: unknown };
const literal = (value: string | null | undefined) => value?.trim().normalize("NFC") ?? "";
const empty = (): QcMatch => ({ status: "IGNORED", targetItemId: null, candidates: [] });
function listingIdentity(url: string | null) {
  if (!url || detectPlatform(url) === "other") return null;
  return buildCanonicalProductKey(url);
}

/**
 * Imports persisted before the explicit MATCHED/PENDING/IGNORED contract used
 * linked/suggested/manual. Normalize them whenever an old manifest is read so
 * a retry remains safe across deployments.
 */
export function normalizeQcMatch(value: LegacyQcMatch): QcMatch {
  const candidates = Array.isArray(value.candidates) ? value.candidates.filter((candidate): candidate is QcMatch["candidates"][number] => {
    if (!candidate || typeof candidate !== "object") return false;
    const row = candidate as Record<string, unknown>;
    return typeof row.itemId === "string" && typeof row.name === "string" && Array.isArray(row.reasons) && row.reasons.every(reason => typeof reason === "string");
  }) : [];
  const targetItemId = typeof value.targetItemId === "string" ? value.targetItemId : null;
  switch (value.status) {
    case "MATCHED":
    case "linked":
      return { status: "MATCHED", targetItemId, candidates };
    case "PENDING":
    case "suggested":
      return candidates.length ? { status: "PENDING", targetItemId: null, candidates } : empty();
    case "manual":
      return candidates.length ? { status: "PENDING", targetItemId: null, candidates } : empty();
    case "IGNORED":
    case "ignored":
    default:
      return empty();
  }
}

export function suggestQcMatch(occurrence: QcOccurrenceInput, targets: QcMatchTarget[], alreadyLinked?: string | null): QcMatch {
  if (alreadyLinked && targets.some(target => target.id === alreadyLinked)) return { status: "MATCHED", targetItemId: alreadyLinked, candidates: [] };
  const identity = listingIdentity(occurrence.offerUrl);
  if (!identity) return empty();
  const urlCandidates = targets.filter(target => listingIdentity(target.url) === identity);
  if (!urlCandidates.length) return empty();
  const sku = literal(occurrence.skuInfo);
  const exactVariant = sku ? urlCandidates.filter(target => literal(target.variant) === sku) : [];
  if (exactVariant.length === 1 && urlCandidates.length === 1 && exactVariant[0]!.quantity === (occurrence.quantity ?? exactVariant[0]!.quantity)) return { status: "MATCHED", targetItemId: exactVariant[0]!.id, candidates: [] };
  const candidates = (exactVariant.length ? exactVariant : urlCandidates).map(target => ({ itemId: target.id, name: target.name, reasons: ["Mesmo anúncio", ...(sku && literal(target.variant) === sku ? ["Variação idêntica"] : []), ...(occurrence.quantity !== null && target.quantity !== occurrence.quantity ? ["Quantidade diferente"] : [])] }));
  return { status: "PENDING", targetItemId: null, candidates };
}
