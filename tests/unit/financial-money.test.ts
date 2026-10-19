import { describe, expect, it } from "vitest";
import {
  calculateExternalFeeBrl,
  convertByCapturedPair,
  formatBrlMinor,
  formatCnyMinor,
  parseFinancialMinor,
  roundRatioHalfUp,
} from "@/lib/domain/financial-money";

describe("financial money", () => {
  it("parses exact integer minor units and distinguishes empty from zero", () => {
    expect(parseFinancialMinor("500,00", "CNY")).toBe(50_000);
    expect(parseFinancialMinor("150.50", "BRL")).toBe(15_050);
    expect(parseFinancialMinor("0", "CNY")).toBe(0);
    expect(parseFinancialMinor("", "BRL")).toBeNull();
    expect(() => parseFinancialMinor("-1", "CNY")).toThrow();
    expect(() => parseFinancialMinor("1e3", "BRL")).toThrow();
    expect(() => parseFinancialMinor("1.234", "CNY")).toThrow();
    expect(() => parseFinancialMinor("10000000000,01", "BRL")).toThrow(/limite/);
  });

  it("formats CNY and BRL without converting minor units through floating point", () => {
    expect(formatCnyMinor(35_000)).toBe("¥\u00a0350,00");
    expect(formatBrlMinor(15_050)).toBe("R$\u00a0150,50");
  });

  it("rounds ratio halves upward and charges only the captured external principal", () => {
    expect(roundRatioHalfUp(1n, 2n)).toBe(1n);
    expect(calculateExternalFeeBrl(50, 100)).toBe(1);
    expect(calculateExternalFeeBrl(15_000, 100)).toBe(150);
    expect(calculateExternalFeeBrl(15_000, 500)).toBe(750);
  });

  it("uses the captured integer pair for conversions", () => {
    expect(convertByCapturedPair(20_000, 20_000, 15_000)).toBe(15_000);
    expect(convertByCapturedPair(10_000, 20_000, 15_000)).toBe(7_500);
    expect(() => convertByCapturedPair(1, 0, 1)).toThrow(/zero/);
  });
});
