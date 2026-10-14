import { buildCanonicalProductKey, detectPlatform } from "./urls";
import type { QcOccurrenceInput } from "./qc-validation";

export type QcMatchTarget = { id: string; name: string; url: string; variant: string | null; quantity: number };
export type QcMatch = { status: "linked" | "suggested" | "manual" | "ignored"; targetItemId: string | null; candidates: { itemId: string; name: string; reasons: string[] }[] };
const literal = (value: string | null | undefined) => value?.trim().normalize("NFC") ?? "";
function listingIdentity(url: string | null) {
  if (!url || detectPlatform(url) === "other") return null;
  return buildCanonicalProductKey(url);
}

export function suggestQcMatch(occurrence: QcOccurrenceInput, targets: QcMatchTarget[], alreadyLinked?: string | null): QcMatch {
  if (alreadyLinked && targets.some(target => target.id === alreadyLinked)) return { status: "linked", targetItemId: alreadyLinked, candidates: [] };
  const identity = listingIdentity(occurrence.offerUrl);
  if (!identity) return { status: "manual", targetItemId: null, candidates: [] };
  const urlCandidates = targets.filter(target => listingIdentity(target.url) === identity);
  if (!urlCandidates.length) return { status: "manual", targetItemId: null, candidates: [] };
  const sku = literal(occurrence.skuInfo);
  const exactVariant = sku ? urlCandidates.filter(target => literal(target.variant) === sku) : [];
  if (exactVariant.length === 1 && urlCandidates.length === 1 && exactVariant[0]!.quantity === (occurrence.quantity ?? exactVariant[0]!.quantity)) return { status: "linked", targetItemId: exactVariant[0]!.id, candidates: [] };
  const candidates = (exactVariant.length ? exactVariant : urlCandidates).map(target => ({ itemId: target.id, name: target.name, reasons: ["Mesmo anúncio", ...(sku && literal(target.variant) === sku ? ["Variação idêntica"] : []), ...(occurrence.quantity !== null && target.quantity !== occurrence.quantity ? ["Quantidade diferente"] : [])] }));
  return { status: "suggested", targetItemId: null, candidates };
}
