import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { DomainError } from "../domain/errors";
import { QC_LIMITS } from "../domain/qc-limits";

export type ValidatedQcImage = { bytes: Buffer; sha256: string; mimeType: "image/jpeg" | "image/png" | "image/webp"; extension: "jpg" | "png" | "webp"; width: number; height: number };
function magicFormat(bytes: Buffer): "jpeg" | "png" | "webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

function isAnimated(bytes: Buffer, format: "jpeg" | "png" | "webp"): boolean {
  if (format === "png") {
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      if (type === "acTL" || type === "fcTL" || type === "fdAT") return true;
      if (length > bytes.length - offset - 12) break;
      offset += 12 + length;
    }
    return false;
  }
  if (format === "webp") {
    const declaredEnd = Math.min(bytes.length, 8 + bytes.readUInt32LE(4));
    let offset = 12;
    while (offset + 8 <= declaredEnd) {
      const type = bytes.toString("ascii", offset, offset + 4);
      const length = bytes.readUInt32LE(offset + 4);
      if (type === "ANIM" || type === "ANMF") return true;
      if (type === "VP8X" && length >= 10 && offset + 9 < bytes.length && (bytes[offset + 8]! & 0x02) !== 0) return true;
      if (length > declaredEnd - offset - 8) break;
      offset += 8 + length + (length & 1);
    }
  }
  return false;
}

export async function validateQcImage(bytes: Buffer): Promise<ValidatedQcImage> {
  if (bytes.byteLength > QC_LIMITS.imageBytes || bytes.byteLength < 12) throw new DomainError("Tamanho de foto inválido.", 422, "QC_IMAGE_LIMIT");
  const magic = magicFormat(bytes);
  if (!magic) throw new DomainError("Formato de foto incompatível.", 422, "QC_IMAGE_INVALID");
  if (isAnimated(bytes, magic)) throw new DomainError("Fotos animadas não são aceitas no QC.", 422, "QC_IMAGE_ANIMATED");
  try {
    const input = sharp(bytes, { failOn: "warning", limitInputPixels: QC_LIMITS.pixels, animated: false, pages: 1, sequentialRead: true }).timeout({ seconds: 12 });
    const metadata = await input.metadata();
    if (metadata.format !== magic || metadata.pages !== undefined && metadata.pages !== 1 || metadata.width === undefined || metadata.height === undefined) throw new DomainError("A foto não é uma imagem estática válida.", 422, "QC_IMAGE_INVALID");
    if (metadata.width > QC_LIMITS.dimension || metadata.height > QC_LIMITS.dimension || metadata.width * metadata.height > QC_LIMITS.pixels) throw new DomainError("As dimensões da foto excedem o limite permitido.", 422, "QC_IMAGE_LIMIT");
    // Force a complete decoder pass before the original validated bytes can be persisted.
    const decoded = await sharp(bytes, { failOn: "warning", limitInputPixels: QC_LIMITS.pixels, animated: false, pages: 1, sequentialRead: true }).timeout({ seconds: 12 }).raw().toBuffer({ resolveWithObject: true });
    if (decoded.info.width !== metadata.width || decoded.info.height !== metadata.height || decoded.data.byteLength > QC_LIMITS.pixels * 4) throw new DomainError("A foto não pôde ser decodificada integralmente.", 422, "QC_IMAGE_INVALID");
    const format = magic;
    return {
      bytes, sha256: createHash("sha256").update(bytes).digest("hex"),
      mimeType: format === "jpeg" ? "image/jpeg" : format === "png" ? "image/png" : "image/webp",
      extension: format === "jpeg" ? "jpg" : format,
      width: metadata.width, height: metadata.height,
    };
  } catch (error) {
    if (error instanceof DomainError) throw error;
    if (error instanceof Error && /pixel limit|exceeds the pixel limit|limitInputPixels/i.test(error.message)) throw new DomainError("A imagem excede o limite de 25 megapixels.", 422, "QC_IMAGE_LIMIT");
    throw new DomainError("A foto está truncada ou é inválida.", 422, "QC_IMAGE_INVALID");
  }
}
