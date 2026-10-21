import { describe, expect, it } from "vitest";
import { user, workspaceMembers } from "@/lib/db/schema";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import { packageCostServices } from "@/lib/domain/package-cost-services";
import { fixture } from "./helpers";

// Investigation only: every write targets fixture()'s explicit :memory: database.
async function scenario(corrections: boolean) {
  const f = await fixture(":memory:");
  try {
    const now = new Date();
    await f.db.insert(user).values({ id: "carol", name: "carol", email: "carol@test.local", emailVerified: true, createdAt: now, updatedAt: now }).run();
    await f.db.insert(workspaceMembers).values({ workspaceId: "workspace", userId: "carol", createdAt: now }).run();
    const people = ["alice", "bob", "carol"];
    const purchase = await f.alice.savePurchase({ name: "Synthetic traceability audit" });
    for (const [name, price] of [["RAM alpha", 19857], ["RAM beta", 25900]] as const) {
      await f.alice.saveManualItem({ name, url: "https://example.test/ram", quantity: 1, unitPriceCents: price, sharingMode: "equal", participants: people.map(personId => ({ personId })) });
    }
    await f.alice.finalizePurchase(purchase!.id, true);
    const service = packageCostServices(f.db, "alice");
    const tracking = await service.startTracking(purchase!.id);
    let detail = await service.getTracking(tracking.id);
    for (const item of detail.items) {
      detail = await service.saveItemCosts(tracking.id, { expectedRevision: detail.tracking.revision, itemId: item.id, effectivePriceState: "known", effectivePriceUnitCents: item.original.name === "RAM alpha" ? 19857 : 25900, chinaFreightState: "no_charge", chinaFreightUnitCents: null });
    }
    detail = await service.saveCharge(tracking.id, detail.productsCharge!.id, { expectedRevision: detail.tracking.revision, chargeType: "products", paymentMethod: "pix" });
    detail = await service.markChargePaid(tracking.id, detail.productsCharge!.id, { expectedRevision: detail.tracking.revision });
    const accounts = hubbuyBalanceServices(f.db, "alice");
    const account = await accounts.createAccount({ workspaceId: "workspace", idempotencyKey: "audit-account", label: "Synthetic audit only", confirmZeroBalance: true });
    for (const [name, cny, brl] of [["RAM alpha", 24984, 18756], ["RAM beta", 31979, 24007]] as const) {
      const item = detail.items.find(row => row.original.name === name)!;
      detail = await service.requestRefund(tracking.id, { expectedRevision: detail.tracking.revision, costItemId: item.id, quantity: 1, requestedProductCents: brl, requestedChinaCents: 0, reason: "Synthetic cancellation", packageRemovals: [{ packageId: detail.packages[0].id, quantity: 1 }], unassignedQuantity: 0 });
      const refund = detail.refunds.find(row => row.costItemId === item.id)!;
      detail = await service.receiveRefund(tracking.id, refund.id, { expectedRevision: detail.tracking.revision, receivedProductCents: brl, receivedChinaCents: 0, destination: "hubbuy", accountId: account.accountId, receivedProductCnyMinor: cny, receivedChinaCnyMinor: 0, nativeEvidence: "Synthetic receipt", confirmed: true });
    }
    const initial = await accounts.getAccountBalance(account.accountId);
    async function add(product: number, china = 0, quantity = 1) {
      detail = await service.getTracking(tracking.id);
      const order = await service.createAdditionalOrder(tracking.id, { expectedRevision: detail.tracking.revision, idempotencyKey: crypto.randomUUID(), accountId: account.accountId, items: [{ name: "Synthetic strings", url: "https://example.test/strings", platform: "Taobao", visualKey: "generic", quantity, itemOrder: 0, nativeProductState: "known", nativeProductCnyMinor: product, nativeChinaState: china ? "known" : "no_charge", nativeChinaCnyMinor: china || null, participants: people.map(personId => ({ personId, weightMode: "equal", weight: 1 })) }] });
      detail = await service.getTracking(tracking.id);
      await service.recordAdditionalOrderMixedPayment(tracking.id, order.orderId, { expectedRevision: detail.tracking.revision, idempotencyKey: crypto.randomUUID(), useOwnBalance: true, external: null });
      return order.orderId;
    }
    async function correct(orderId: string, product: number, china = 0, quantity = 1) {
      detail = await service.getTracking(tracking.id);
      const order = detail.productOrders.find(row => row.id === orderId)!;
      const balance = await accounts.getAccountBalance(account.accountId);
      const input = { expectedRevision: detail.tracking.revision, expectedAccountRevision: balance.account.revision, idempotencyKey: crypto.randomUUID(), reason: "Synthetic correction", confirmedIncorrectRegistration: true, itemId: order.items[0].cost.id, name: "Synthetic strings", url: "https://example.test/strings", variant: null, notes: null, quantity, nativeProductCnyMinor: product, nativeChinaCnyMinor: china, composition: { mode: "equal", participants: people.map(personId => ({ personId, weight: 1 })) }, useOwnBalance: true, external: null };
      const result = await service.correctAdditionalOrder(tracking.id, orderId, input);
      expect(await service.correctAdditionalOrder(tracking.id, orderId, input)).toMatchObject({ replayed: true, replacementOrderId: result.replacementOrderId });
      return result.replacementOrderId;
    }
    const cap = await add(1902, 0, corrections ? 2 : 1);
    if (corrections) await correct(cap, 1902);
    await add(3074);
    if (corrections) {
      let order = await add(1806, 1000, 2);
      order = await correct(order, 1806, 2000, 2);
      order = await correct(order, 3612, 2000, 2);
      await add(3612, 1000, 2);
      await correct(order, 3612, 1000, 2);
    } else {
      await add(3612, 1000, 2);
      await add(3612, 1000, 2);
    }
    const final = await accounts.getAccountBalance(account.accountId);
    return {
      initial: initial.rights.map(row => [row.personId, row.availableCnyMinor]),
      balance: final.ledgerBalanceCnyMinor,
      rights: final.rights.map(row => [row.personId, row.availableCnyMinor]).sort(),
      brl: final.rights.map(row => [row.personId, row.availableHistoricalBrlCents]).sort(),
      origins: final.rights.flatMap(row => row.origins.map(origin => ({ person: row.personId, label: origin.label, kind: origin.kind, cny: origin.availableCnyMinor }))),
    };
  } finally { f.client.close(); }
}

describe("investigation: credit origin after repeated corrections", () => {
  it("reproduces equal CNY ownership but different origin composition through real services", async () => {
    const direct = await scenario(false);
    const corrected = await scenario(true);
    expect(direct.balance).toBe(42763);
    expect(corrected.balance).toBe(direct.balance);
    expect(corrected.rights).toEqual(direct.rights);
    expect(corrected.rights).toEqual([["alice", 14254], ["bob", 14254], ["carol", 14255]]);
    expect(direct.origins.some(row => row.label === "RAM alpha")).toBe(true);
    expect(corrected.origins.some(row => row.label === "RAM alpha")).toBe(false);
    expect(corrected.origins.filter(row => row.kind === "restored_balance").reduce((sum, row) => sum + row.cny, 0)).toBe(14126);
    expect(corrected.origins).not.toEqual(direct.origins);
    // A correction must not silently be treated as equivalence of BRL bases.
    // These assertions characterize the current defect without fixing services.
    expect(direct.brl).toEqual([["alice", 10700], ["bob", 10701], ["carol", 10701]]);
    expect(corrected.brl).toEqual([["alice", 10701], ["bob", 10702], ["carol", 10702]]);
    console.log("AUDIT_EQUIVALENCE", JSON.stringify({ direct, corrected }));
  });
});
