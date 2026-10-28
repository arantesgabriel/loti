import { createHash } from "node:crypto";
import { getTableName, sql } from "drizzle-orm";
import type { AppDatabase } from "../../../src/lib/db/connection";
import { packageCostServices } from "../../../src/lib/domain/package-cost-services";
import { hubbuyBalanceServices } from "../../../src/lib/domain/hubbuy-balance-services";
import { previewFifoConsumption } from "../../../src/lib/domain/hubbuy-balance-calculations";
import * as tables from "../../../src/lib/db/schema";
import expected from "./expected.json";
import { additions, refunds as refundAnchors } from "./scenario";
import { captureScenarioPreservation, parseScenarioBaseline, preservationFailures } from "./preservation";

export type ScenarioIdentity = { trackingId: string; purchaseId: string; accountId: string; packageId: string; people: string[] };

/** Read-only inventory and exact comparisons. No tolerance, repair or inferred receipt. */
export async function compareLegacyScenario(db: AppDatabase, identity: ScenarioIdentity, comparison: { mode: "capture" } | { mode: "verify"; baseline: unknown }) {
  const baseline = comparison.mode === "verify" ? parseScenarioBaseline(comparison.baseline) : undefined;
  const actor = identity.people[0], detail = await packageCostServices(db, actor).getTracking(identity.trackingId);
  const balance = await hubbuyBalanceServices(db, actor).getAccountBalance(identity.accountId);
  const originalItems = await db.select().from(tables.purchaseItems).all();
  const entries = await db.select().from(tables.hubbuyBalanceEntries).all();
  const shares = await db.select().from(tables.hubbuyBalanceCreditShares).all();
  const uses = await db.select().from(tables.hubbuyBalanceConsumptions).all();
  const components = await db.select().from(tables.purchasePaymentComponents).all();
  const allocations = await db.select().from(tables.purchasePaymentAllocations).all();
  const active = detail.productOrders.filter(order => order.kind === "additional");
  const packageRows = detail.packages.flatMap(pkg => pkg.items);
  const logisticsActive = await db.all<{count:number}>(sql`SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='logistics_reservations'`);
  const migratedReservations = logisticsActive[0]?.count ? await db.select().from(tables.logisticsReservations).all() : null;
  const activeReservations = migratedReservations?.filter(r=>r.releasedAt===null);
  const sum = (values: number[]) => Number(values.reduce((total, value) => total + BigInt(value), 0n));
  const simulation = entries.find(entry => entry.sourceType === "manual_adjustment" && entry.direction === "debit")!;
  const originalPayment = detail.calculation.productsCharge.totalCents!;
  const actual = {
    counts: { originalLines: originalItems.length, purchasedUnits: detail.calculation.summary.purchasedUnits,
      cancelledUnits: detail.calculation.summary.cancelledUnits, shippingUnits: detail.calculation.summary.shippingUnits,
      shippingLines: detail.calculation.items.filter(item => item.shippingQuantity > 0).length, packageLines: activeReservations ? new Set(activeReservations.map(r=>`${r.packageId}:${r.costItemId}`)).size : packageRows.length,
      packageUnits: activeReservations?.length ?? sum(packageRows.map(row => row.quantity)), unassignedUnits: detail.calculation.summary.shippingUnits - (activeReservations?.length ?? detail.calculation.summary.assignedUnits),
      additionalOrders: active.length, corrections: detail.orderCorrections.length },
    money: { originalProducts: sum(originalItems.map(item => item.quantity * (item.unitPriceCents ?? 0))),
      originalBase: detail.calculation.productsCharge.baseCents, originalFee: detail.calculation.productsCharge.feeCents, originalPayment,
      additionalBrl: sum(active.map(order => order.totalCostBrlCents)), additionalCny: sum(components.filter(component => active.some(order => order.id === component.orderId)).map(component => component.cnyMinor)),
      receivedBrl: detail.refundsSummary.receivedCents, receivedCny: sum(detail.refunds.map(refund => (refund.receivedProductCnyMinor ?? 0) + (refund.receivedChinaCnyMinor ?? 0))),
      retained: detail.financialDisplay.summary.cancelledRetainedCents, remaining: detail.financialDisplay.summary.remaining.knownCents,
      net: detail.calculation.summary.partialCents, balanceCny: balance.ledgerBalanceCnyMinor,
      balanceBrl: sum(balance.rights.map(right => right.availableHistoricalBrlCents)), simulationCny: simulation?.amountCnyMinor,
      simulationBrl: simulation?.historicalBrlCents },
  };
  const failures: string[] = [];
  for (const section of ["counts", "money"] as const) for (const [key, target] of Object.entries(expected[section])) {
    const value = (actual[section] as Record<string, number | null | undefined>)[key];
    if (value !== target) failures.push(`${section}.${key}: expected ${target}, actual ${value}`);
  }
  if (!balance.reconciled || balance.account.balanceCnyMinor !== balance.ledgerBalanceCnyMinor) failures.push("Ledger/account reconciliation failed.");
  for (const addition of additions) {
    const order = active.find(order => order.items.some(row => row.item?.name === addition.name));
    const row = order?.items.find(row => row.item?.name === addition.name);
    const rowAllocations = allocations.filter(part => part.costItemId === row?.cost.id);
    if (!row || row.item?.quantity !== addition.quantity || sum(rowAllocations.map(part => part.principalBrlCents)) !== addition.brl || sum(rowAllocations.filter(part => part.costComponent === "china").map(part => part.principalBrlCents)) !== addition.china) failures.push(`Additional line anchor failed: ${addition.name}`);
  }
  for (const [name, received, retained] of refundAnchors) {
    const item = detail.items.find(row => row.original.name === name);
    const records = detail.refunds.filter(row => row.costItemId === item?.id && row.status !== "voided");
    const group = detail.financialDisplay.refundGroups.find(row => row.costItemId === item?.id);
    if (!item || records.length !== 1 || records[0].status !== "received" || records[0].quantity !== 1
      || (records[0].receivedProductCents ?? 0) + (records[0].receivedChinaCents ?? 0) !== received || group?.retainedCents !== retained) failures.push(`Refund line anchor failed: ${name}`);
  }
  for (const component of components) {
    const rows = allocations.filter(row => row.componentId === component.id);
    if (sum(rows.map(row => row.cnyMinor)) !== component.cnyMinor || sum(rows.map(row => row.principalBrlCents)) !== component.principalBrlCents || sum(rows.map(row => row.feeBrlCents)) !== component.feeBrlCents) failures.push(`Payment component did not reconcile: ${component.id}`);
  }
  // Replay every debit in sequence using the same FIFO rule. Restorations are new lots.
  const remaining = new Map<string, { creditId: string; sequence: number; personId: string; availableCnyMinor: number; availableHistoricalBrlCents: number }>();
  for (const entry of [...entries].sort((a, b) => a.sequence - b.sequence)) {
    if (entry.direction === "credit") {
      for (const share of shares.filter(row => row.creditEntryId === entry.id)) remaining.set(share.id, { creditId: share.id, sequence: entry.sequence, personId: share.personId, availableCnyMinor: share.amountCnyMinor, availableHistoricalBrlCents: share.historicalBrlCents });
      continue;
    }
    let debitCny = 0, debitBrl = 0;
    for (const use of uses.filter(row => row.debitEntryId === entry.id).sort((a, b) => a.allocationOrder - b.allocationOrder)) {
      const lot = remaining.get(use.creditShareId);
      if (!lot) { failures.push(`Missing FIFO source: ${use.id}`); continue; }
      const preview = previewFifoConsumption(use.amountCnyMinor, [...remaining.values()].filter(row => row.personId === lot.personId && row.availableCnyMinor > 0));
      if (preview.consumptions.length !== 1 || preview.consumptions[0].creditId !== lot.creditId || preview.historicalBrlCents !== use.historicalBrlCents) failures.push(`FIFO source/basis mismatch: ${use.id}`);
      lot.availableCnyMinor -= use.amountCnyMinor;
      lot.availableHistoricalBrlCents -= use.historicalBrlCents;
      debitCny += use.amountCnyMinor; debitBrl += use.historicalBrlCents;
    }
    if (debitCny !== entry.amountCnyMinor || debitBrl !== entry.historicalBrlCents) failures.push(`Debit did not reconcile: ${entry.id}`);
  }
  const personal = identity.people.map((personId, index) => {
    const cost = detail.memberTotals.find(row => row.personId === personId), right = balance.rights.find(row => row.personId === personId);
    const values = { net: cost?.totalCents ?? 0, receivedBrl: cost?.receivedRefundCents ?? 0, balanceCny: right?.availableCnyMinor ?? 0, balanceBrl: right?.availableHistoricalBrlCents ?? 0 };
    return { personId, name: `Pessoa ${String.fromCharCode(65 + index)}`, values, capacities: { personalUnits: cost?.personalUnits ?? 0, sharedItems: cost?.sharedItems ?? 0 }, differences: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value - expected.referencePeople[key as keyof typeof expected.referencePeople][index]])) };
  });
  if (sum(personal.map(row => row.values.net)) !== actual.money.net) failures.push("Personal costs do not sum to global cost.");
  const inventory: Record<string, { count: number; sha256: string }> = {};
  const existingTables = new Set((await db.all<{name:string}>(sql`SELECT name FROM sqlite_master WHERE type='table'`)).map(row => row.name));
  // Every pre-transition table is fingerprinted, including QC and financial audit.
  for (const [name, table] of Object.entries(tables)) {
    if (!table || typeof table !== "object" || !(Symbol.for("drizzle:IsDrizzleTable") in table)) continue;
    if (!existingTables.has(getTableName(table as typeof tables.user))) continue;
    // Inventory the columns actually present in this historical schema. New
    // metadata may not exist until the next explicit migration is applied.
    const rows = await db.all<Record<string,unknown>>(sql`SELECT * FROM ${table as typeof tables.user}`);
    const stable = rows.map(row => JSON.stringify(row, Object.keys(row).sort())).sort();
    inventory[name] = { count: rows.length, sha256: createHash("sha256").update(JSON.stringify(stable)).digest("hex") };
  }
  const preservation = await captureScenarioPreservation(db, identity, personal.map(({ personId, values, capacities }) => ({ personId, values, capacities })), baseline);
  if (baseline) failures.push(...preservationFailures(preservation, baseline));
  return { scenario: expected.scenario, passed: failures.length === 0, failures, actual, personal, inventory, preservation, limitations: expected.syntheticDecisions };
}
