import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { purchaseCostTrackings, purchaseItemCosts, purchasePackageItems, purchasePackages, purchaseItems } from "@/lib/db/schema";
import { packageCostServices } from "@/lib/domain/package-cost-services";
import { fixture, type Fixture } from "./helpers";

let f: Fixture;
beforeEach(async () => { f = await fixture(); });
afterEach(() => f.client.close());

async function finalizedPurchase(quantity = 1, unitPriceCents: number | null = 1_000) {
  const purchase = await f.alice.savePurchase({ name: "Hubbuy agosto" });
  const item = await f.bob.saveManualItem({
    name: "Tênis", url: "https://example.com/tenis", quantity, unitPriceCents,
    ...(quantity === 3 ? { sharingMode: "equal" as const, participants: [{ personId: "alice" }, { personId: "bob" }] } : { personId: "bob" }),
  });
  await f.alice.finalizePurchase(purchase!.id, true);
  return { purchase: purchase!, item: item! };
}

describe("package and cost tracking", () => {
  it("creates an open tracking atomically on finalization without changing the purchase snapshot", async () => {
    const { purchase, item } = await finalizedPurchase(3, 12_875);
    const [tracking] = await f.db.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.purchaseId, purchase.id)).all();
    const cost = await f.db.select().from(purchaseItemCosts).where(eq(purchaseItemCosts.purchaseItemId, item.id)).get();
    const assignment = await f.db.select().from(purchasePackageItems).where(eq(purchasePackageItems.costItemId, cost!.id)).get();
    const original = await f.db.select().from(purchaseItems).where(eq(purchaseItems.id, item.id)).get();
    expect(tracking).toMatchObject({ status: "open", revision: 0 });
    expect(cost).toMatchObject({ effectivePriceState: "known", effectivePriceUnitCents: 12_875, chinaFreightState: "pending" });
    expect(assignment?.quantity).toBe(3);
    expect(original?.unitPriceCents).toBe(12_875);
  });

  it("starts costs for legacy finalized purchases idempotently and enforces workspace access", async () => {
    const { purchase } = await finalizedPurchase();
    const service = packageCostServices(f.db, "alice");
    const first = await service.startTracking(purchase.id);
    const second = await service.startTracking(purchase.id);
    expect(second.id).toBe(first.id);
    expect(await f.db.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.purchaseId, purchase.id)).all()).toHaveLength(1);
    await expect(packageCostServices(f.db, "outsider").getTracking(first.id)).rejects.toThrow();
    await expect(packageCostServices(f.db, "foreign").getTracking(first.id)).rejects.toThrow();
  });

  it("shows each person's known partial while another cost component remains pending", async () => {
    const { purchase } = await finalizedPurchase(3, 1_000);
    const service = packageCostServices(f.db, "alice");
    const tracking = await service.startTracking(purchase.id);
    const detail = await service.getTracking(tracking.id);

    expect(detail.items[0].participants.map(person => person.partialShareCents)).toEqual([1_500, 1_500]);
    expect(detail.items[0].participants.map(person => person.shareCents)).toEqual([null, null]);
    expect(detail.memberTotals.map(person => [person.totalCents, person.pending])).toEqual([[1_500, true], [1_500, true]]);
    expect(detail.calculation.summary.partialCents).toBe(3_000);
  });

  it("captures configured fees and requires confirmation before invalidating a paid product charge", async () => {
    const { purchase, item } = await finalizedPurchase();
    const service = packageCostServices(f.db, "alice"), tracking = await service.startTracking(purchase.id);
    let detail = await service.getTracking(tracking.id);
    const costItem = detail.items[0], products = detail.productsCharge!;
    detail = await service.saveItemCosts(tracking.id, {
      expectedRevision: detail.tracking.revision, itemId: costItem.id,
      effectivePriceState: "known", effectivePriceUnitCents: 1_100,
      chinaFreightState: "known", chinaFreightUnitCents: 100,
    });
    detail = await service.saveCharge(tracking.id, products.id, {
      expectedRevision: detail.tracking.revision, chargeType: "products", paymentMethod: "pix",
    });
    expect(detail.productsCharge?.feeBps).toBe(100);
    detail = await service.markChargePaid(tracking.id, products.id, { expectedRevision: detail.tracking.revision });
    await expect(service.saveItemCosts(tracking.id, {
      expectedRevision: detail.tracking.revision, itemId: costItem.id,
      effectivePriceState: "known", effectivePriceUnitCents: 1_200,
      chinaFreightState: "known", chinaFreightUnitCents: 100,
    })).rejects.toThrow(/Confirme a edição/);
    detail = await service.saveItemCosts(tracking.id, {
      expectedRevision: detail.tracking.revision, itemId: costItem.id,
      effectivePriceState: "known", effectivePriceUnitCents: 1_200,
      chinaFreightState: "known", chinaFreightUnitCents: 100, confirmPaymentReset: true,
    });
    expect(detail.productsCharge?.paymentStatus).toBe("pending");
    expect((await f.alice.getData()).items.find(row => row.id === item.id)?.unitPriceCents).toBe(1_000);
  });

  it("uses group fee defaults for new charges and keeps captured rates unchanged", async () => {
    const { purchase } = await finalizedPurchase();
    const service = packageCostServices(f.db, "alice");
    expect(await service.getSettings()).toMatchObject({ pixBps: 100, cardBps: 500 });
    await service.saveSettings({ pixBps: 175, cardBps: 750 });
    const tracking = await service.startTracking(purchase.id);
    let detail = await service.getTracking(tracking.id);
    const item = detail.items[0];
    detail = await service.saveItemCosts(tracking.id, { expectedRevision: detail.tracking.revision, itemId: item.id, effectivePriceState: "known", effectivePriceUnitCents: 1_000, chinaFreightState: "known", chinaFreightUnitCents: 0 });
    detail = await service.saveCharge(tracking.id, detail.productsCharge!.id, { expectedRevision: detail.tracking.revision, chargeType: "products", paymentMethod: "pix" });
    expect(detail.productsCharge?.feeBps).toBe(175);
    await service.saveSettings({ pixBps: 300, cardBps: 900 });
    detail = await service.getTracking(tracking.id);
    expect(detail.productsCharge?.feeBps).toBe(175);
    expect(detail.calculation.productsCharge.feeCents).toBe(18);
  });

  it("splits item units across packages, blocks unresolved close, then closes and reopens with an audit reason", async () => {
    const { purchase, item } = await finalizedPurchase(3, 1_000);
    const service = packageCostServices(f.db, "alice"), tracking = await service.startTracking(purchase.id);
    let detail = await service.getTracking(tracking.id);
    const costItem = detail.items[0], products = detail.productsCharge!, initialPackage = detail.packages[0];
    detail = await service.saveItemCosts(tracking.id, {
      expectedRevision: detail.tracking.revision, itemId: costItem.id,
      effectivePriceState: "known", effectivePriceUnitCents: 1_000,
      chinaFreightState: "known", chinaFreightUnitCents: 0,
    });
    detail = await service.saveCharge(tracking.id, products.id, { expectedRevision: detail.tracking.revision, chargeType: "products", paymentMethod: "pix" });
    const firstPackage = detail.packages[0];
    detail = await service.createPackage(tracking.id, { expectedRevision: detail.tracking.revision, name: "Pacote 2" });
    const packages = await f.db.select().from(purchasePackages).where(eq(purchasePackages.trackingId, tracking.id)).all();
    const secondPackage = packages.find(pkg => pkg.name === "Pacote 2")!;
    detail = await service.saveAllocations(tracking.id, {
      expectedRevision: detail.tracking.revision,
      allocations: [
        { packageId: firstPackage.id, costItemId: costItem.id, quantity: 1 },
        { packageId: secondPackage.id, costItemId: costItem.id, quantity: 2 },
      ],
    });
    expect(detail.calculation.summary.assignedUnits).toBe(3);
    expect(detail.packages.find(pkg => pkg.id === firstPackage.id)?.items[0]?.quantity).toBe(1);
    expect(detail.packages.find(pkg => pkg.id === secondPackage.id)?.items[0]?.quantity).toBe(2);
    await expect(service.closeTracking(tracking.id, { expectedRevision: detail.tracking.revision, confirmed: true })).rejects.toThrow(/Confirme o pagamento dos produtos/);

    detail = await service.markChargePaid(tracking.id, products.id, { expectedRevision: detail.tracking.revision });
    for (const pkg of detail.packages) {
      detail = await service.saveCharge(tracking.id, pkg.brazilFreightCharge!.id, {
        expectedRevision: detail.tracking.revision, chargeType: "brazil_freight", valueState: "known", amountCents: 0, paymentMethod: null,
      });
      detail = await service.saveCharge(tracking.id, pkg.customsCharge!.id, {
        expectedRevision: detail.tracking.revision, chargeType: "customs", valueState: "no_charge", amountCents: null,
      });
    }
    for (const pkg of detail.packages) detail = await service.markChargePaid(tracking.id, pkg.brazilFreightCharge!.id, { expectedRevision: detail.tracking.revision });
    detail = await service.closeTracking(tracking.id, { expectedRevision: detail.tracking.revision, confirmed: true });
    expect(detail.tracking.status).toBe("closed");
    await expect(service.savePackage(tracking.id, firstPackage.id, { expectedRevision: detail.tracking.revision, name: "Alterado", logisticsStatus: "sent" })).rejects.toThrow(/encerrados/);
    detail = await service.reopenTracking(tracking.id, { expectedRevision: detail.tracking.revision, confirmed: true, reason: "Ajuste da taxa do pacote" });
    expect(detail.tracking.status).toBe("open");
    expect(detail.reopenings[0]?.reason).toBe("Ajuste da taxa do pacote");
    await expect(service.savePackage(tracking.id, firstPackage.id, { expectedRevision: 0, name: "Stale", logisticsStatus: "sent" })).rejects.toThrow(/outra sessão/);
    expect((await f.alice.getData()).items.find(row => row.id === item.id)?.unitPriceCents).toBe(1_000);
    expect(initialPackage.id).toBe(firstPackage.id);
  });
});
