import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { validateQcImage } from "@/lib/qc/image-validation";
import { generateQcPreview, QC_PREVIEW } from "@/lib/qc/preview";

async function fixture(format: "jpeg" | "png" | "webp" = "png", width = 2, height = 2) {
  const image = sharp({ create: { width, height, channels: 3, background: { r: 70, g: 40, b: 20 } } });
  return format === "jpeg" ? image.jpeg().toBuffer() : format === "webp" ? image.webp().toBuffer() : image.png().toBuffer();
}

describe("real QC image decoder", () => {
  it.each(["jpeg", "png", "webp"] as const)("validates and hashes static %s bytes without rewriting them", async format => {
    const bytes = await fixture(format), result = await validateQcImage(bytes);
    expect(result.bytes).toEqual(bytes);
    expect(result.sha256).toHaveLength(64);
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
  });

  it("rejects fake magic, truncated content, SVG and decoder failures", async () => {
    await expect(validateQcImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).rejects.toMatchObject({ code: "QC_IMAGE_INVALID" });
    await expect(validateQcImage(Buffer.from([0xff, 0xd8, 0xff, ...new Array(50).fill(0)]))).rejects.toMatchObject({ code: "QC_IMAGE_INVALID" });
    const full = await fixture("jpeg");
    await expect(validateQcImage(full.subarray(0, full.length - 8))).rejects.toMatchObject({ code: "QC_IMAGE_INVALID" });
  });

  it("rejects APNG and animated WebP containers before decoding", async () => {
    const apng = Buffer.alloc(20);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(apng);
    apng.writeUInt32BE(0, 8);
    apng.write("acTL", 12, "ascii");
    await expect(validateQcImage(apng)).rejects.toMatchObject({ code: "QC_IMAGE_ANIMATED" });

    const webp = Buffer.alloc(30);
    webp.write("RIFF", 0, "ascii"); webp.writeUInt32LE(22, 4); webp.write("WEBP", 8, "ascii");
    webp.write("VP8X", 12, "ascii"); webp.writeUInt32LE(10, 16); webp[20] = 0x02;
    await expect(validateQcImage(webp)).rejects.toMatchObject({ code: "QC_IMAGE_ANIMATED" });
  });

  it("rejects images beyond the 25 megapixel cap before decoding raw pixels", async () => {
    const large = await fixture("png", 5_001, 5_000);
    await expect(validateQcImage(large)).rejects.toMatchObject({ code: "QC_IMAGE_LIMIT" });
  });
});

describe("private QC previews", () => {
  it.each([[640, 320, 160, 80], [320, 640, 80, 160], [2, 3, 2, 3]])("keeps aspect ratio and does not upscale %sx%s input", async (width, height, expectedWidth, expectedHeight) => {
    const original = await sharp({ create: { width, height, channels: 3, background: { r: 45, g: 70, b: 110 } } }).png().toBuffer();
    const preview = await generateQcPreview(original);
    const metadata = await sharp(preview.bytes).metadata();
    expect(metadata.format).toBe("webp");
    expect([preview.width, preview.height]).toEqual([expectedWidth, expectedHeight]);
    expect(preview.width).toBeLessThanOrEqual(QC_PREVIEW.dimension);
    expect(preview.height).toBeLessThanOrEqual(QC_PREVIEW.dimension);
    expect(preview.bytes.byteLength).toBeLessThanOrEqual(QC_PREVIEW.maxBytes);
    expect(preview.sha256).toHaveLength(64);
  });

  it("applies EXIF orientation before generating the preview", async () => {
    const original = await sharp({ create: { width: 300, height: 120, channels: 3, background: { r: 45, g: 70, b: 110 } } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const preview = await generateQcPreview(original);
    expect(preview.height).toBeGreaterThan(preview.width);
  });
});
