import { createHash } from "node:crypto";

export function qcPreviewVersion(preview: { sha256: string | null; transformVersion: string; r2Key: string; revision: number }) {
  return createHash("sha256").update(JSON.stringify([preview.sha256, preview.transformVersion, preview.r2Key, preview.revision])).digest("hex");
}

export function qcPreviewEtag(userId: string, version: string) {
  return `"${createHash("sha256").update(JSON.stringify([userId, version])).digest("hex")}"`;
}

// GET uses weak comparison. Parse a complete field, including quoted commas;
// a malformed field is ignored rather than accidentally matching a fragment.
const entityTags = /(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"/g;
const entityTagList = /^(?:\s*(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"\s*)(?:,\s*(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"\s*)*$/;
export function matchesQcEtag(header: string | null, etag: string) {
  if (!header || header.length > 8192) return false;
  if (header.trim() === "*") return true;
  if (!entityTagList.test(header)) return false;
  return header.match(entityTags)!.some(token => token.replace(/^W\//, "") === etag);
}

export const qcPreviewHeaders = {
  "Cache-Control": "private, no-cache",
  Vary: "Cookie, Origin",
  "Content-Type": "image/webp",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Referrer-Policy": "no-referrer",
};
