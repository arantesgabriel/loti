import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { financialOperations, hubbuyAccounts, hubbuyBalanceAdjustments, hubbuyBalanceConsumptions, hubbuyBalanceCreditShares, hubbuyBalanceEntries } from "@/lib/db/schema";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import { packageCostServices } from "@/lib/domain/package-cost-services";
import { fixture, type Fixture } from "./helpers";

let f: Fixture;
beforeEach(async () => { f = await fixture(); });
afterEach(() => f.client.close());
const command = (revision = 0, amount = 114) => ({ expectedRevision: revision, idempotencyKey: crypto.randomUUID(), kind: "promotional_bonus" as const, amountCnyMinor: amount, occurredAt: "2026-10-21T10:00:00-03:00", reason: "Bônus sintético da roleta", externalReference: "roulette-qa", shares: [{ personId: "alice", amountCnyMinor: amount }] });
async function account() {
  const service = hubbuyBalanceServices(f.db, "alice");
  const result = await service.createAccount({ workspaceId: "workspace", label: "Ajustes QA", idempotencyKey: crypto.randomUUID(), confirmZeroBalance: true });
  return { service, id: result.accountId };
}

describe("manual HubBuy balance adjustments", () => {
  it("previews without writes and records the bonus with zero basis, origins, dates and stable replay", async () => {
    const { service, id } = await account(), input = command();
    expect(await service.previewManualAdjustment(id, input)).toMatchObject({ balanceBeforeCnyMinor: 0, balanceAfterCnyMinor: 114, historicalBrlCents: 0 });
    expect(await f.db.select().from(hubbuyBalanceEntries)).toHaveLength(0);
    const result = await service.recordManualAdjustment(id, input);
    expect(await service.recordManualAdjustment(id, input)).toEqual({ ...result, replayed: true });
    expect(await service.getAccountBalance(id)).toMatchObject({ reconciled: true, account: { balanceCnyMinor: 114, revision: 1 }, rights: [{ personId: "alice", availableHistoricalBrlCents: 0, origins: [{ kind: "promotional_bonus" }] }] });
    const statement = await service.readStatement(id);
    expect(statement.entries[0]).toMatchObject({ actorName: "alice", historicalBrlCents: 0, adjustment: { externalReference: "roulette-qa", canReverse: true }, balanceAfterCnyMinor: 114 });
    expect(statement.entries[0].occurredAt?.toISOString()).toBe("2026-10-21T13:00:00.000Z");
    await expect(service.recordManualAdjustment(id, { ...input, reason: "different" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(service.recordManualAdjustment(id, { ...command(1), externalReference: "roulette-qa" })).rejects.toMatchObject({ code: "ADJUSTMENT_REFERENCE_DUPLICATE" });
    const reversal = await service.reverseManualAdjustment(id, { expectedRevision: 1, idempotencyKey: crypto.randomUUID(), adjustmentId: result.adjustmentId, reason: "Anular teste", occurredAt: input.occurredAt });
    expect(reversal.balanceAfterCnyMinor).toBe(0);
    expect(await service.recordManualAdjustment(id, input)).toEqual({ ...result, replayed: true });
    await service.recordManualAdjustment(id, { ...command(2), externalReference: "roulette-qa" });
    expect((await service.readStatement(id)).entries.map(row => row.balanceAfterCnyMinor)).toEqual([114, 0, 114]);
  });

  it("rejects invalid ownership, unknown basis, zero values, archived accounts and cross-workspace access", async () => {
    const { service, id } = await account();
    for (const input of [
      { ...command(), shares: [{ personId: "alice", amountCnyMinor: 113 }] },
      { ...command(), shares: [{ personId: "alice", amountCnyMinor: 57 }, { personId: "alice", amountCnyMinor: 57 }] },
      { ...command(), shares: [{ personId: "foreign", amountCnyMinor: 114 }] },
      { ...command(), shares: [{ personId: "alice", amountCnyMinor: 114, historicalBrlCents: 1 }] },
      { ...command(), kind: "documented_credit" }, command(0, 0),
    ]) await expect(service.recordManualAdjustment(id, input)).rejects.toThrow();
    await expect(hubbuyBalanceServices(f.db, "foreign").recordManualAdjustment(id, command())).rejects.toThrow();
    await service.archiveAccount(id, { expectedRevision: 0, idempotencyKey: crypto.randomUUID(), reason: "QA" });
    await expect(service.recordManualAdjustment(id, command(1))).rejects.toMatchObject({ code: "BALANCE_RECONCILIATION_REQUIRED" });
    expect(await f.db.select().from(hubbuyBalanceEntries)).toHaveLength(0);
  });

  it("consumes FIFO only for the selected owner and restores exact debit ownership on reversal", async () => {
    const { service, id } = await account();
    const bonus = await service.recordManualAdjustment(id, command(0, 3));
    await service.recordManualAdjustment(id, { ...command(1, 10), kind: "documented_credit", externalReference: "credit-qa", shares: [{ personId: "alice", amountCnyMinor: 5, historicalBrlCents: 3 }, { personId: "bob", amountCnyMinor: 5, historicalBrlCents: 4 }] });
    await expect(service.recordManualAdjustment(id, { ...command(2, 6), kind: "documented_debit", externalReference: null, shares: [{ personId: "bob", amountCnyMinor: 6 }] })).rejects.toMatchObject({ code: "BALANCE_INSUFFICIENT" });
    const debit = await service.recordManualAdjustment(id, { ...command(2, 6), kind: "documented_debit", externalReference: null });
    expect(debit).toMatchObject({ historicalBrlCents: 2, balanceAfterCnyMinor: 7, shares: [{ personId: "alice", historicalBrlCents: 2 }] });
    expect(await f.db.select().from(hubbuyBalanceConsumptions)).toHaveLength(2);
    await expect(service.reverseManualAdjustment(id, { expectedRevision: 3, idempotencyKey: crypto.randomUUID(), adjustmentId: bonus.adjustmentId, reason: "QA", occurredAt: command().occurredAt })).rejects.toMatchObject({ code: "ADJUSTMENT_CREDIT_CONSUMED" });
    const reverseInput = { expectedRevision: 3, idempotencyKey: crypto.randomUUID(), adjustmentId: debit.adjustmentId, reason: "Saída registrada incorretamente", occurredAt: command().occurredAt };
    const reversal = await service.reverseManualAdjustment(id, reverseInput);
    expect(reversal).toMatchObject({ historicalBrlCents: 2, balanceAfterCnyMinor: 13, shares: [{ personId: "alice", amountCnyMinor: 6, historicalBrlCents: 2 }] });
    expect(await service.reverseManualAdjustment(id, reverseInput)).toMatchObject({ replayed: true, operationId: reversal.operationId });
    await expect(service.reverseManualAdjustment(id, { ...reverseInput, expectedRevision: 4, idempotencyKey: crypto.randomUUID() })).rejects.toMatchObject({ code: "ADJUSTMENT_ALREADY_REVERSED" });
    expect((await service.getAccountBalance(id)).rights.map(row => [row.personId, row.availableCnyMinor, row.availableHistoricalBrlCents])).toEqual([["alice", 8, 3], ["bob", 5, 4]]);
    await expect(service.deleteAccount(id, { expectedRevision: 4, idempotencyKey: crypto.randomUUID(), reason: "QA" })).rejects.toThrow();
  });

  it("rolls back all records on a write failure and retains append-only database guards", async () => {
    const { service, id } = await account();
    await f.client.execute("CREATE TRIGGER qa_fail_adjustment BEFORE UPDATE OF balance_cny_minor ON hubbuy_accounts BEGIN SELECT RAISE(ABORT, 'QA failure'); END");
    await expect(service.recordManualAdjustment(id, command())).rejects.toThrow();
    for (const table of [hubbuyBalanceEntries, hubbuyBalanceCreditShares, hubbuyBalanceAdjustments]) expect(await f.db.select().from(table)).toHaveLength(0);
    expect(await f.db.select().from(financialOperations)).toHaveLength(1);
    await f.client.execute("DROP TRIGGER qa_fail_adjustment");
    const added = await service.recordManualAdjustment(id, command());
    await expect(f.db.update(hubbuyBalanceAdjustments).set({ kind: "documented_credit" }).where(eq(hubbuyBalanceAdjustments.id, added.adjustmentId))).rejects.toThrow();
    await expect(f.db.delete(hubbuyBalanceAdjustments)).rejects.toThrow();
    expect((await f.client.execute("PRAGMA foreign_key_check")).rows).toHaveLength(0);
  });

  it("finances a zero-BRL additional order, requests native cancellation and restores CNY only on receipt", async () => {
    const { service, id } = await account();
    await service.recordManualAdjustment(id, command());
    const p = await f.alice.savePurchase({ name: "Original QA" });
    await f.alice.saveManualItem({ name: "Original", url: "https://example.test/original", quantity: 1, unitPriceCents: 100, personId: "alice" });
    await f.alice.finalizePurchase(p!.id, true);
    const costs = packageCostServices(f.db, "alice"), tracking = await costs.startTracking(p!.id);
    let d = await costs.getTracking(tracking.id);
    const draft = await costs.createAdditionalOrder(tracking.id, { expectedRevision: d.tracking.revision, idempotencyKey: crypto.randomUUID(), accountId: id, items: [{ name: "Item bônus", url: "https://example.test/bonus", platform: "other", visualKey: "generic", quantity: 1, itemOrder: 0, nativeProductState: "known", nativeProductCnyMinor: 114, nativeChinaState: "no_charge", nativeChinaCnyMinor: null, participants: [{ personId: "alice", weightMode: "equal", weight: 1 }] }] });
    d = await costs.getTracking(tracking.id);
    const paid = await costs.recordAdditionalOrderMixedPayment(tracking.id, draft.orderId, { expectedRevision: d.tracking.revision, idempotencyKey: crypto.randomUUID(), useOwnBalance: true, external: null });
    expect(paid).toMatchObject({ historicalBrlCents: 0, principalBrlCents: 0, feeBrlCents: 0 });
    d = await costs.getTracking(tracking.id);
    const costItemId = d.productOrders.find(row => row.id === draft.orderId)!.items[0].cost.id;
    const req = { expectedRevision: d.tracking.revision, costItemId, quantity: 1, requestedProductCents: 0, requestedChinaCents: 0, requestedProductCnyMinor: 114, requestedChinaCnyMinor: 0, reason: "Cancelamento nativo sintético", packageRemovals: [], unassignedQuantity: 1 };
    await expect(costs.requestRefund(tracking.id, { ...req, requestedProductCnyMinor: 115 })).rejects.toThrow();
    d = await costs.requestRefund(tracking.id, req);
    expect((await service.getAccountBalance(id)).account.balanceCnyMinor).toBe(0);
    const refund = d.refunds.find(row => row.costItemId === costItemId)!;
    expect(refund).toMatchObject({ requestedProductCnyMinor: 114, requestedProductCents: 0 });
    d = await costs.receiveRefund(tracking.id, refund.id, { expectedRevision: d.tracking.revision, receivedProductCents: 0, receivedChinaCents: 0, destination: "hubbuy", accountId: id, receivedProductCnyMinor: 114, receivedChinaCnyMinor: 0, nativeEvidence: "Recebimento sintético confirmado", confirmed: true });
    expect(d.refunds.find(row => row.id === refund.id)).toMatchObject({ status: "received", receivedProductCents: 0 });
    expect(await service.getAccountBalance(id)).toMatchObject({ reconciled: true, account: { balanceCnyMinor: 114 }, rights: [{ availableHistoricalBrlCents: 0 }] });
    expect((await f.db.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, id)).get())!.revision).toBe(3);
  });
});
