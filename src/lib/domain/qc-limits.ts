export const QC_LIMITS = {
  bodyBytes: 1 * 1024 * 1024,
  orders: 100,
  occurrences: 500,
  photos: 200,
  externalIdChars: 200,
  skuChars: 2_000,
  titleChars: 2_000,
  urlChars: 4_000,
  imageBytes: 8 * 1024 * 1024,
  importBytes: 200 * 1024 * 1024,
  dimension: 8_192,
  pixels: 25_000_000,
  batch: 5,
  manifestMs: 24 * 60 * 60 * 1000,
  signedUrlSeconds: 120,
  requestMs: 90_000,
  requestSafetyMs: 5_000,
  dnsMs: 5_000,
  transferMs: 15_000,
  imageValidationMs: 24_000,
  lockMs: 180_000,
} as const;

export type QcRateOperation = "prepare" | "match" | "batch" | "delete" | "fallback" | "preview";
export const QC_RATE_LIMITS: Record<QcRateOperation, { count: number; windowMs: number }> = {
  prepare: { count: 5, windowMs: 60_000 },
  match: { count: 20, windowMs: 60_000 },
  batch: { count: 12, windowMs: 60_000 },
  delete: { count: 20, windowMs: 60_000 },
  fallback: { count: 60, windowMs: 60_000 },
  preview: { count: 180, windowMs: 60_000 },
};
