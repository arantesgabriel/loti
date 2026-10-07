import { describe, expect, it } from "vitest";
import { basisPointsFromPercent, percentFromBasisPoints, percentInputFromBasisPoints } from "@/components/packages/package-cost-client";

describe("package cost percentage presentation", () => {
  it("formats visible percentages using pt-BR while keeping numeric inputs machine-friendly", () => {
    expect(percentFromBasisPoints(100)).toBe("1,00");
    expect(percentInputFromBasisPoints(100)).toBe("1.00");
  });

  it("accepts decimal comma and dot at the input boundary", () => {
    expect(basisPointsFromPercent("1,25")).toBe(125);
    expect(basisPointsFromPercent("1.25")).toBe(125);
  });
});
