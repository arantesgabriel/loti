import { describe, expect, it } from "vitest";
import { additionalProductTotal, productPriceEntry, productPriceSummary } from "@/lib/domain/additional-product-pricing";
import { MAX_FINANCIAL_MINOR } from "@/lib/domain/financial-money";
import { subtotal } from "@/lib/domain/money";
import { calculateCostTracking } from "@/lib/domain/package-cost-calculations";

describe("additional product unit-price entry", () => {
  it("multiplies the reported Elixir unit price using exact minor units", () => {
    expect(additionalProductTotal("18,06", 2, "unit")).toBe(3612);
    expect(additionalProductTotal("18.06", 3, "unit")).toBe(5418);
    expect(additionalProductTotal("0,01", 3, "unit")).toBe(3);
    expect(productPriceSummary(3612, 2)).toBe("2 × ¥ 18,06 = ¥ 36,12 no total");
  });

  it("restores divisible historical totals without multiplying them again", () => {
    const entry = productPriceEntry(3612, 2);
    expect(entry).toEqual({ basis: "unit", value: "18,06" });
    expect(additionalProductTotal(entry.value, 2, entry.basis)).toBe(3612);
    expect(productPriceEntry(null, 2)).toEqual({ basis: "unit", value: "" });
  });

  it("preserves totals which cannot be represented by a two-decimal unit price", () => {
    const entry = productPriceEntry(100, 3);
    expect(entry).toEqual({ basis: "total", value: "1,00" });
    expect(additionalProductTotal(entry.value, 3, entry.basis)).toBe(100);
    expect(productPriceSummary(100, 3)).toBe("3 unidades · ¥ 1,00 no total");
    expect(additionalProductTotal("18,06", 2, "total")).toBe(1806);
  });

  it("distinguishes empty and zero and rejects invalid or overflowing totals", () => {
    expect(additionalProductTotal("", 2, "unit")).toBeNull();
    expect(additionalProductTotal("0,00", 2, "unit")).toBe(0);
    for (const quantity of [0, -1, 1.5, 10001, NaN]) expect(() => additionalProductTotal("1", quantity, "unit")).toThrow();
    for (const input of ["-1", "18,061", "abc"]) expect(() => additionalProductTotal(input, 2, "unit")).toThrow();
    expect(additionalProductTotal("10000000000", 1, "unit")).toBe(MAX_FINANCIAL_MINOR);
    expect(() => additionalProductTotal("10000000000", 2, "unit")).toThrow(/limite/);
  });

  it("keeps normal purchase and normal tracking unit-price multiplication", () => {
    expect(subtotal({ quantity: 2, unitPriceCents: 1806 })).toBe(3612);
    const result = calculateCostTracking({ items: [{ id: "original", itemOrder: 0, quantity: 2, effectivePrice: { state: "known", amountCents: 1806 }, chinaFreight: { state: "known", amountCents: 1000 }, participants: [{ personId: "a", allocationOrder: 0, weight: 1 }] }], packages: [], productsCharge: { paymentMethod: "pix", feeBps: 0, paymentStatus: "paid" } });
    expect(result.productsCharge.baseCents).toBe(5612);
    expect(result.items[0].components[0].amountCents).toBe(3612);
  });
});
