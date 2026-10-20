import { describe, expect, it } from "vitest";
import {
  allocateExactMinor,
  allocateRefundAcrossSources,
  calculatePaymentFunding,
  previewFifoConsumption,
} from "@/lib/domain/hubbuy-balance-calculations";

describe("HubBuy balance calculations", () => {
  it("conciles a balance plus PIX or card without charging the balance", () => {
    const targets = [
      { id: "balance-item", order: 0, cnyMinor: 30_000, eligibleSourceIds: ["balance"] },
      { id: "external-item", order: 1, cnyMinor: 20_000, eligibleSourceIds: ["pix"] },
    ];
    const pix = calculatePaymentFunding({
      targets,
      sources: [
        { id: "balance", order: 0, kind: "balance", cnyMinor: 30_000, principalBrlCents: 21_000, feeBps: 0 },
        { id: "pix", order: 1, kind: "pix", cnyMinor: 20_000, principalBrlCents: 15_000, feeBps: 100 },
      ],
    });
    expect(pix.targets).toEqual([
      { targetId: "balance-item", cnyMinor: 30_000, costBrlCents: 21_000, newMoneyBrlCents: 0 },
      { targetId: "external-item", cnyMinor: 20_000, costBrlCents: 15_150, newMoneyBrlCents: 15_150 },
    ]);
    expect(pix.allocations.reduce((sum, row) => sum + row.feeBrlCents, 0)).toBe(150);

    const card = calculatePaymentFunding({
      targets: [targets[0], { ...targets[1], eligibleSourceIds: ["card"] }],
      sources: [
        { id: "balance", order: 0, kind: "balance", cnyMinor: 30_000, principalBrlCents: 21_000, feeBps: 0 },
        { id: "card", order: 1, kind: "card", cnyMinor: 20_000, principalBrlCents: 15_000, feeBps: 500 },
      ],
    });
    expect(card.targets.reduce((sum, row) => sum + row.costBrlCents, 0)).toBe(36_750);
    expect(card.targets.reduce((sum, row) => sum + row.newMoneyBrlCents, 0)).toBe(15_750);
    expect(card.allocations.filter(row => row.sourceId === "balance").every(row => row.feeBrlCents === 0)).toBe(true);
  });

  it("uses a deterministic, capacity-limited payment matrix and rejects infeasible routes", () => {
    const result = calculatePaymentFunding({
      sources: [
        { id: "source-a", order: 0, kind: "pix", cnyMinor: 40, principalBrlCents: 400, feeBps: 0 },
        { id: "source-b", order: 1, kind: "card", cnyMinor: 60, principalBrlCents: 600, feeBps: 0 },
      ],
      targets: [
        { id: "target-a", order: 0, cnyMinor: 60, eligibleSourceIds: ["source-a", "source-b"] },
        { id: "target-b", order: 1, cnyMinor: 40, eligibleSourceIds: ["source-b"] },
      ],
    });
    expect(result.allocations.map(row => [row.sourceId, row.targetId, row.cnyMinor])).toEqual([
      ["source-a", "target-a", 40],
      ["source-b", "target-a", 20],
      ["source-b", "target-b", 40],
    ]);
    expect(() => calculatePaymentFunding({
      sources: [{ id: "source", order: 0, kind: "pix", cnyMinor: 100, principalBrlCents: 100, feeBps: 0 }],
      targets: [{ id: "target", order: 0, cnyMinor: 100, eligibleSourceIds: [] }],
    })).toThrow(/inviável/);
    expect(() => calculatePaymentFunding({
      sources: [{ id: "balance", order: 0, kind: "balance", cnyMinor: 100, principalBrlCents: 100, feeBps: 100 }],
      targets: [{ id: "target", order: 0, cnyMinor: 100 }],
    })).toThrow(/não pode receber taxa/);
  });

  it("previews FIFO across available lots and leaves the final historical cent in the last consumption", () => {
    const fifo = previewFifoConsumption(25_000, [
      { creditId: "ram", sequence: 0, availableCnyMinor: 10_000, availableHistoricalBrlCents: 7_000 },
      { creditId: "socks", sequence: 1, availableCnyMinor: 5_000, availableHistoricalBrlCents: 4_000 },
      { creditId: "other", sequence: 2, availableCnyMinor: 20_000, availableHistoricalBrlCents: 15_000 },
    ]);
    expect(fifo.consumptions).toEqual([
      { creditId: "ram", sequence: 0, cnyMinor: 10_000, historicalBrlCents: 7_000 },
      { creditId: "socks", sequence: 1, cnyMinor: 5_000, historicalBrlCents: 4_000 },
      { creditId: "other", sequence: 2, cnyMinor: 10_000, historicalBrlCents: 7_500 },
    ]);
    expect(fifo.historicalBrlCents).toBe(18_500);
    expect(() => previewFifoConsumption(40_000, [{ creditId: "ram", sequence: 0, availableCnyMinor: 10_000, availableHistoricalBrlCents: 1 }])).toThrow(/insuficiente/);

    const pennies = [
      { creditId: "pennies", sequence: 0, availableCnyMinor: 3, availableHistoricalBrlCents: 2 },
    ];
    const first = previewFifoConsumption(1, pennies);
    const second = previewFifoConsumption(1, [{ creditId: "pennies", sequence: 0, availableCnyMinor: 2, availableHistoricalBrlCents: 1 }]);
    const last = previewFifoConsumption(1, [{ creditId: "pennies", sequence: 0, availableCnyMinor: 1, availableHistoricalBrlCents: 0 }]);
    expect([first.historicalBrlCents, second.historicalBrlCents, last.historicalBrlCents]).toEqual([1, 1, 0]);
  });

  it("allocates a refund proportionally across source capacities without exceeding them", () => {
    expect(allocateRefundAcrossSources(25_000, [
      { id: "balance", order: 0, remainingRefundableCnyMinor: 30_000, remainingHistoricalBrlCents: 21_000 },
      { id: "pix", order: 1, remainingRefundableCnyMinor: 20_000, remainingHistoricalBrlCents: 15_000 },
    ])).toEqual([
      { sourceId: "balance", cnyMinor: 15_000, historicalBrlCents: 10_500 },
      { sourceId: "pix", cnyMinor: 10_000, historicalBrlCents: 7_500 },
    ]);
    expect(allocateRefundAcrossSources(50_000, [
      { id: "balance", order: 0, remainingRefundableCnyMinor: 30_000, remainingHistoricalBrlCents: 21_000 },
      { id: "pix", order: 1, remainingRefundableCnyMinor: 20_000, remainingHistoricalBrlCents: 15_000 },
    ]).reduce((sum, row) => sum + row.historicalBrlCents, 0)).toBe(36_000);
    expect(() => allocateRefundAcrossSources(50_001, [
      { id: "balance", order: 0, remainingRefundableCnyMinor: 30_000, remainingHistoricalBrlCents: 21_000 },
      { id: "pix", order: 1, remainingRefundableCnyMinor: 20_000, remainingHistoricalBrlCents: 15_000 },
    ])).toThrow(/excede/);
  });

  it("splits cents exactly with stable largest-remainder ordering", () => {
    expect(allocateExactMinor(24_500, [
      { id: "alice", order: 0, weight: 60 },
      { id: "bob", order: 1, weight: 40 },
    ])).toEqual([14_700, 9_800]);
    expect(allocateExactMinor(1, [
      { id: "second", order: 1, weight: 1 },
      { id: "first", order: 0, weight: 1 },
    ])).toEqual([0, 1]);
  });
});
