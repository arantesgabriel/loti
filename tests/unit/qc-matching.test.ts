import { describe, expect, it } from "vitest";
import { normalizeQcMatch, suggestQcMatch } from "@/lib/domain/qc-matching";
import type { QcOccurrenceInput } from "@/lib/domain/qc-validation";

const occurrence = (overrides: Partial<QcOccurrenceInput> = {}): QcOccurrenceInput => ({ externalKey: "order:id:1", orderGoodsId: "1", orderGoodsNo: null, orderNo: "order", offerId: "offer", channel: "weidian", offerUrl: "https://weidian.com/item.html?itemID=123&spm=x", skuInfo: "Black / 42", title: "Tênis parecido", quantity: 1, photos: [], ...overrides });
const target = { id: "item-1", name: "Título diferente", url: "https://weidian.com/item.html?itemID=123", variant: "Black / 42", quantity: 1 };

describe("conservative QC matching", () => {
  it("auto-links only the sole known listing with a literal nonempty variant and matching quantity", () => {
    expect(suggestQcMatch(occurrence(), [target])).toMatchObject({ status: "MATCHED", targetItemId: "item-1" });
    expect(suggestQcMatch(occurrence({ quantity: 2 }), [target])).toMatchObject({ status: "PENDING", targetItemId: null });
    expect(suggestQcMatch(occurrence({ skuInfo: "" }), [target])).toMatchObject({ status: "PENDING", targetItemId: null });
  });

  it("does not infer from titles, identifiers, or unknown HubBuy wrappers", () => {
    expect(suggestQcMatch(occurrence({ offerUrl: null, skuInfo: null, title: "Título diferente" }), [target]).status).toBe("IGNORED");
    expect(suggestQcMatch(occurrence({ offerUrl: "https://scm.hubbuy.app/product/123", skuInfo: "Black / 42" }), [target]).status).toBe("IGNORED");
    expect(suggestQcMatch(occurrence({ offerUrl: "https://weidian.com/item.html?itemID=999" }), [target]).status).toBe("IGNORED");
  });

  it("suggests rather than auto-selects ambiguous candidates and reuses confirmed links", () => {
    expect(suggestQcMatch(occurrence(), [target, { ...target, id: "item-2", name: "Outro" }])).toMatchObject({ status: "PENDING", targetItemId: null, candidates: [{ itemId: "item-1" }, { itemId: "item-2" }] });
    expect(suggestQcMatch(occurrence({ offerUrl: null }), [target], "item-1")).toMatchObject({ status: "MATCHED", targetItemId: "item-1" });
  });

  it("normalizes manifests created with the previous status names", () => {
    expect(normalizeQcMatch({ status: "linked", targetItemId: "item-1", candidates: [] })).toMatchObject({ status: "MATCHED", targetItemId: "item-1" });
    expect(normalizeQcMatch({ status: "suggested", targetItemId: null, candidates: [{ itemId: "item-1", name: "Item", reasons: ["Mesmo anúncio"] }] })).toMatchObject({ status: "PENDING", targetItemId: null });
    expect(normalizeQcMatch({ status: "manual", targetItemId: null, candidates: [] })).toMatchObject({ status: "IGNORED", targetItemId: null, candidates: [] });
  });
});
