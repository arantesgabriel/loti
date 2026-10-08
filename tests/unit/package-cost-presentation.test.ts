import { describe, expect, it } from "vitest";
import type { CostTrackingView } from "@/lib/domain/package-cost-reading";
import { packageCostPresentation } from "@/lib/domain/package-cost-presentation";

function view(overrides: Record<string, unknown> = {}) {
  const base = {
    tracking: { status: "open" },
    items: [],
    packages: [],
    charges: [],
    productsCharge: { paymentStatus: "pending" },
    calculation: {
      productsCharge: { baseCents: null, feeCents: null, totalCents: null, paymentMethod: null, feeBps: null, paymentStatus: "pending" },
      summary: { partialCents: 0, totalCents: null, hasKnownAmount: false, undistributedCents: 0, unitCount: 0, assignedUnits: 0 },
    },
  };
  return { ...base, ...overrides, calculation: { ...base.calculation, ...(overrides.calculation as object | undefined) } } as unknown as CostTrackingView;
}

describe("package cost progressive presentation", () => {
  it("prioritizes the first missing product value and shows a partial known total", () => {
    const detail = view({
      items: [{ id: "shoe", effectivePriceState: "known", chinaFreightState: "pending", original: { name: "Tênis" }, participants: [] }],
      calculation: { summary: { partialCents: 12_000, totalCents: null, hasKnownAmount: true, undistributedCents: 0, unitCount: 1, assignedUnits: 1 } },
    });

    const presentation = packageCostPresentation(detail);
    expect(presentation.nextAction).toEqual({ label: "Informar frete China de Tênis", section: "products", target: "item-cost-shoe" });
    expect(presentation).toMatchObject({ isPartial: true, hasKnownAmount: true, totalCents: 12_000 });
    expect(presentation.productsSummary).toContain("Falta informar 1 frete China");
  });

  it("prioritizes a resolved products payment before package allocation", () => {
    const detail = view({
      calculation: {
        productsCharge: { baseCents: 10_000, feeCents: 100, totalCents: 10_100, paymentMethod: "pix", feeBps: 100, paymentStatus: "pending" },
        summary: { partialCents: 10_100, totalCents: null, hasKnownAmount: true, undistributedCents: 0, unitCount: 2, assignedUnits: 0 },
      },
    });

    expect(packageCostPresentation(detail).nextAction).toEqual({ label: "Confirmar pagamento dos produtos", section: "products", target: "products-paid" });
  });

  it("counts revenue payments among package follow-ups and closes only after them", () => {
    const detail = view({
      packages: [{
        id: "p1", name: "Pacote 1", brazilFreightCharge: { valueState: "no_charge", paymentStatus: "pending" },
        customsCharge: { valueState: "known", paymentStatus: "pending" },
      }],
      calculation: {
        productsCharge: { baseCents: 0, feeCents: 0, totalCents: 0, paymentMethod: null, feeBps: null, paymentStatus: "paid" },
        packages: [{ id: "p1", unitCount: 1 }],
        summary: { partialCents: 1_200, totalCents: 1_200, hasKnownAmount: true, undistributedCents: 0, unitCount: 1, assignedUnits: 1 },
      },
      productsCharge: { paymentStatus: "paid" },
    });

    const presentation = packageCostPresentation(detail);
    expect(presentation.nextAction).toEqual({ label: "Confirmar pagamento da Receita de Pacote 1", section: "packages", target: "package-customs-paid-p1", packageId: "p1" });
    expect(presentation.packagesSummary).toContain("1 pagamento pendente");
  });
});
