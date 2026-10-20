import { describe, expect, it } from "vitest";
import { parseHubBuyImport, readBoundedJson } from "@/lib/domain/qc-validation";

const photoUrl = "https://scm.hubbuy.app/qc/photo.jpg?token=sample#preview";
function payload(override: Record<string, unknown> = {}) {
  return {
    code: 0,
    data: { count: 1, list: [{ orderNo: "ORD-001", goodsList: [{ orderGoodsId: "GOODS-1", orderGoodsNo: "NO-1", offerId: "OFFER-1", channel: "weidian", offerUrl: "https://weidian.com/item.html?itemID=123", skuInfo: "Black / 42", goodsName: "Tênis", quantity: 1, image: "https://not-imported.invalid/listing.jpg", freePhotos: [photoUrl], ...override }] }] },
  };
}

describe("HubBuy QC parser", () => {
  it("extracts a bounded whitelist and only freePhotos", () => {
    const result = parseHubBuyImport(payload());
    expect(result).toMatchObject({ orderCount: 1, photoCount: 1, partial: false });
    expect(result.occurrences[0]).toMatchObject({ orderGoodsId: "GOODS-1", orderGoodsNo: "NO-1", skuInfo: "Black / 42", title: "Tênis", quantity: 1, photos: [{ url: photoUrl, ordinal: 0 }] });
    expect(JSON.stringify(result)).not.toContain("not-imported.invalid");
    expect(result.occurrences[0]?.photos[0]?.urlHash).toHaveLength(64);
  });

  it("accepts the numeric channel and title field used by HubBuy responses", () => {
    const result = parseHubBuyImport(payload({ channel: 2, goodsName: null, title: "Título HubBuy" }));
    expect(result.occurrences[0]).toMatchObject({ channel: "2", title: "Título HubBuy" });
  });

  it("accepts empty freePhotos and reports a partial page without deleting absent rows", () => {
    const result = parseHubBuyImport({ code: 0, data: { count: 4, list: [{ orderNo: "1", goodsList: [{ orderGoodsNo: "NO-1", freePhotos: [] }] }] } });
    expect(result).toMatchObject({ photoCount: 0, partial: true, reportedCount: 4 });
    expect(result.occurrences[0]?.photos).toEqual([]);
  });

  it("rejects failed responses, missing string identities, duplicate IDs and conflicting image hosts", () => {
    expect(() => parseHubBuyImport({ code: 500, data: { list: [] } })).toThrow(/concluída com sucesso/);
    expect(() => parseHubBuyImport({ code: 0, data: { list: [{ goodsList: [{ goodsName: "No ID" }] }] } })).toThrow(/sem identificador/);
    expect(() => parseHubBuyImport({ code: 0, data: { list: [{ orderNo: "1", goodsList: [{ orderGoodsId: "same" }, { orderGoodsId: "same" }] }] } })).toThrow(/repete um identificador/);
    expect(() => parseHubBuyImport(payload({ freePhotos: ["https://evil.example/photo.jpg"] }))).toThrow(/host HubBuy permitido/);
  });

  it("applies occurrence and photo limits before transfer planning", () => {
    const manyPhotos = Array.from({ length: 201 }, (_, i) => `https://scm.hubbuy.app/${i}.jpg`);
    expect(() => parseHubBuyImport(payload({ freePhotos: manyPhotos }))).toThrow(/excede 200 entradas/);
  });

  it("measures streamed UTF-8 JSON bytes before parsing", async () => {
    const oversized = new Request("https://loti.test", { method: "POST", body: "x".repeat(1024 * 1024 + 1) });
    await expect(readBoundedJson(oversized)).rejects.toMatchObject({ status: 413, code: "QC_BODY_LIMIT" });
    const invalidUtf8 = new Request("https://loti.test", { method: "POST", body: new Uint8Array([0xff, 0xfe]) });
    await expect(readBoundedJson(invalidUtf8)).rejects.toMatchObject({ status: 400, code: "QC_IMPORT_INVALID" });
  });
});
