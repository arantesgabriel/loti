import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { DomainError } from "../domain/errors";
import { QC_LIMITS } from "../domain/qc-limits";

export const QC_PREVIEW = { version: "qc-preview-v1", dimension: 160, maxBytes: 128 * 1024 } as const;
export type GeneratedQcPreview = { bytes: Buffer; sha256: string; width: number; height: number };

export async function generateQcPreview(source: Buffer): Promise<GeneratedQcPreview> {
  try {
    const pipeline = sharp(source, {
      failOn: "warning",
      limitInputPixels: QC_LIMITS.pixels,
      animated: false,
      pages: 1,
      sequentialRead: true,
    })
      .timeout({ seconds: 10 })
      .rotate()
      .resize({
        width: QC_PREVIEW.dimension,
        height: QC_PREVIEW.dimension,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 72, effort: 3, smartSubsample: true });
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    if (info.format !== "webp" || info.width < 1 || info.height < 1 || info.width > QC_PREVIEW.dimension || info.height > QC_PREVIEW.dimension || data.byteLength < 1 || data.byteLength > QC_PREVIEW.maxBytes) {
      throw new DomainError("O preview QC excedeu os limites permitidos.", 422, "QC_PREVIEW_LIMIT");
    }
    const bytes = Buffer.from(data);
    return { bytes, sha256: createHash("sha256").update(bytes).digest("hex"), width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("Não foi possível gerar o preview QC.", 422, "QC_PREVIEW_FAILED");
  }
}
