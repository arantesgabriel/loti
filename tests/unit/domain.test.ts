import { describe, it, expect } from "vitest";
import { detectPlatform, buildCanonicalProductKey, normalizeProductUrl } from "@/lib/domain/urls";
import { resolveProductVisual, visualPath } from "@/lib/domain/visuals";
import { parseMoney, formatMoney, subtotal, purchaseSummary, personSummary } from "@/lib/domain/money";
describe("platforms", () => {
  it.each([["hubbuycn.com", "hubbuy"], ["weidian.com", "weidian"], ["item.taobao.com", "taobao"], ["detail.1688.com", "1688"], ["goofish.com", "goofish"], ["shopee.com.br", "shopee"], ["br.shein.com", "shein"], ["example.com", "other"], ["weidian.com.evil.test", "other"]])("detects %s", (host, platform) => expect(detectPlatform(`https://${host}/item`)).toBe(platform));
  it("handles invalid URLs", () => expect(detectPlatform("garbage")).toBe("other"));
  it("compares identity without mutating original", () => { const url = "https://item.taobao.com/item.htm?id=123&spm=foo&utm_source=group"; expect(buildCanonicalProductKey(url)).toBe("taobao:123"); expect(url).toContain("spm=foo"); });
  it("recognizes offer and weidian ids", () => { expect(buildCanonicalProductKey("https://detail.1688.com/offer/123.html")).toBe("1688:123"); expect(buildCanonicalProductKey("https://weidian.com/item.html?itemID=456&ref=x")).toBe("weidian:456"); });
  it("retains unknown identity parameters", () => expect(normalizeProductUrl("https://www.example.com/x?variant=2&utm_campaign=x&source=1#top")).toBe("https://example.com/x?source=1&variant=2"));
  it("does not accept unsafe schemes", () => expect(normalizeProductUrl("javascript:alert(1)")).toBeNull());
});
describe("archetypes", () => {
  it.each([["Nike Vomero 18", "sneaker"], ["Adidas Campus", "sneaker"], ["Ultraboost 5", "sneaker"], ["Crocs Bottom", "clog"], ["WD Blue SN5000 NVMe", "ssd_nvme"], ["Camiseta Uniqlo", "tshirt"], ["CALÇA", "pants"], ["Placa-mãe B650", "motherboard"], ["SSD SATA", "ssd_sata"], ["Memória RAM", "ram"], ["Ryzen 5", "cpu"], ["GeForce", "gpu"], ["Macbook", "laptop"], ["iPhone", "smartphone"], ["Apple Watch", "smartwatch"], ["Teclado", "keyboard"], ["Mouse", "mouse"], ["Fone", "headphones"], ["Controle", "controller"], ["Sandália", "sandal"], ["Moletom", "hoodie"], ["Unknown", "generic"]])("resolves %s", (name, key) => expect(resolveProductVisual(name)).toBe(key));
  it("falls back for corrupt keys", () => expect(visualPath("bad")).toBe("/product-visuals/generic.svg"));
});
describe("money and quantities", () => {
  it.each([["R$ 1.234,56", 123456], ["0", 0], ["12.30", 1230], ["", null], ["12,3", 1230]])("parses %s", (value, expected) => expect(parseMoney(value)).toBe(expected));
  it.each(["-1", "NaN", "1,999", "1e5", "1000000000"])("rejects %s", value => expect(() => parseMoney(value)).toThrow());
  it("renders null distinctly", () => { expect(formatMoney(null)).toBe("Preço pendente"); expect(formatMoney(0)).toContain("0,00"); });
  const items = [{ personId: "a", quantity: 3, unitPriceCents: 12500, cartStatus: "added" as const }, { personId: "b", quantity: 2, unitPriceCents: 100, cartStatus: "pending" as const }, { personId: "a", quantity: 1, unitPriceCents: null, cartStatus: "pending" as const }];
  it("derives subtotals", () => { expect(subtotal(items[0])).toBe(37500); expect(subtotal(items[2])).toBeNull(); });
  it("derives total and quantity-weighted progress", () => expect(purchaseSummary(items)).toEqual({ totalCents: 37700, units: 6, added: 3, pending: 3, progress: 50, people: 2, noPriceRows: 1, noPriceUnits: 1 }));
  it("derives totals per person", () => expect(personSummary(items, "a").totalCents).toBe(37500));
  it("handles empty purchases", () => { expect(purchaseSummary([]).progress).toBe(0); expect(purchaseSummary([]).totalCents).toBe(0); });
});
