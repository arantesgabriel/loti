import { createHash } from "node:crypto";
import { getTableColumns } from "drizzle-orm";
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import type { AppDatabase } from "../../../src/lib/db/connection";
import * as schema from "../../../src/lib/db/schema";

// Explicit domain-only allowlist. Never persist authentication records or their values.
const protectedTables = {
  purchases: schema.purchases, purchaseItems: schema.purchaseItems, purchaseItemParticipants: schema.purchaseItemParticipants,
  purchaseCostTrackings: schema.purchaseCostTrackings, purchaseCostOrders: schema.purchaseCostOrders,
  purchaseAdditionalOrderItems: schema.purchaseAdditionalOrderItems, purchaseItemCosts: schema.purchaseItemCosts,
  purchaseCostParticipants: schema.purchaseCostParticipants, purchasePackages: schema.purchasePackages,
  purchasePackageItems: schema.purchasePackageItems, purchaseCostPackageEvents: schema.purchaseCostPackageEvents,
  purchaseCostCharges: schema.purchaseCostCharges, purchasePaymentComponents: schema.purchasePaymentComponents,
  purchasePaymentAllocations: schema.purchasePaymentAllocations, purchaseCostRefunds: schema.purchaseCostRefunds,
  purchaseCostRefundParticipants: schema.purchaseCostRefundParticipants, purchaseCostRefundEvents: schema.purchaseCostRefundEvents,
  purchaseRefundPaymentAllocations: schema.purchaseRefundPaymentAllocations, purchaseCostReopenings: schema.purchaseCostReopenings,
  purchaseOrderCorrections: schema.purchaseOrderCorrections, financialOperations: schema.financialOperations,
  hubbuyAccounts: schema.hubbuyAccounts, hubbuyBalanceEntries: schema.hubbuyBalanceEntries,
  hubbuyBalanceCreditShares: schema.hubbuyBalanceCreditShares, hubbuyBalanceConsumptions: schema.hubbuyBalanceConsumptions,
  memberBalanceFinancingEntries: schema.memberBalanceFinancingEntries, hubbuyBalanceAdjustments: schema.hubbuyBalanceAdjustments,
  hubbuyReconciliationRuns: schema.hubbuyReconciliationRuns, hubbuyReconciliationEvents: schema.hubbuyReconciliationEvents,
  hubbuyExternalItems: schema.hubbuyExternalItems, qcImports: schema.qcImports, qcImages: schema.qcImages, qcImageSources: schema.qcImageSources,
  qcImagePreviews: schema.qcImagePreviews, qcPresentations: schema.qcPresentations,
  qcAdditionalPresentations: schema.qcAdditionalPresentations, qcEvents: schema.qcEvents,
};

const id = z.string().min(1).max(200);
const minor = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const identitySchema = z.object({ trackingId: id, purchaseId: id, accountId: id, packageId: id, people: z.array(id).length(4) }).strict();
const personalValuesSchema = z.object({ net: minor, receivedBrl: minor, balanceCny: minor, balanceBrl: minor }).strict();
const personalSchema = z.object({ personId: id, values: personalValuesSchema, capacities: z.object({ personalUnits: minor, sharedItems: minor }).strict() }).strict();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const fingerprintSchema = z.object({
  mode: z.enum(["exact", "append_only"]), fields: z.array(id).min(1).max(200), count: minor, sha256: digest,
  rowHashes: z.array(digest).max(100000).optional(),
}).strict();
const preservationSchema = z.object({
  version: z.literal(2), identity: identitySchema, personal: z.array(personalSchema).length(4),
  tables: z.record(z.string(), fingerprintSchema),
}).strict();
export type ScenarioPreservation = z.infer<typeof preservationSchema>;
export type PreservedPerson = z.infer<typeof personalSchema>;

export function parseScenarioBaseline(value: unknown): ScenarioPreservation {
  const parsed = z.object({ scenario: z.literal("orders-transition-v1"), passed: z.literal(true), preservation: preservationSchema }).safeParse(value);
  if (!parsed.success) throw new Error("Invalid or missing versioned baseline; create a fresh synthetic scenario instead of recapturing current data.");
  const baseline = parsed.data.preservation;
  const names = Object.keys(protectedTables).sort();
  if (JSON.stringify(Object.keys(baseline.tables).sort()) !== JSON.stringify(names)) throw new Error("Invalid baseline protected-table coverage.");
  if (new Set(baseline.identity.people).size !== 4 || baseline.personal.some((person, index) => person.personId !== baseline.identity.people[index])) throw new Error("Invalid baseline personal identities.");
  for (const [name, table] of Object.entries(protectedTables)) {
    const fingerprint = baseline.tables[name], fields = Object.keys(getTableColumns(table));
    if (fingerprint.fields.some(field => !fields.includes(field)) || new Set(fingerprint.fields).size !== fingerprint.fields.length) throw new Error(`Invalid baseline fields: ${name}.`);
    if (fingerprint.mode !== (name === "qcEvents" ? "append_only" : "exact") || fingerprint.mode === "append_only" && fingerprint.rowHashes?.length !== fingerprint.count) throw new Error(`Invalid baseline comparison mode: ${name}.`);
  }
  return baseline;
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function captureScenarioPreservation(db: AppDatabase, identity: ScenarioPreservation["identity"], personal: PreservedPerson[], baseline?: ScenarioPreservation) {
  const tables: ScenarioPreservation["tables"] = {};
  for (const [name, table] of Object.entries(protectedTables)) {
    // For an additive migration compare the original columns, not newly added metadata.
    const fields = baseline?.tables[name].fields ?? Object.keys(getTableColumns(table)).sort();
    const rows: Record<string, unknown>[] = await db.select().from(table as AnySQLiteTable).all();
    const rowHashes = rows.map(row => hash(JSON.stringify(Object.fromEntries(fields.map(field => [field, row[field]]))))).sort();
    tables[name] = { mode: name === "qcEvents" ? "append_only" : "exact", fields, count: rows.length, sha256: hash(JSON.stringify(rowHashes)), ...(name === "qcEvents" ? { rowHashes } : {}) };
  }
  const { trackingId, purchaseId, accountId, packageId, people } = identity;
  return { version: 2 as const, identity: { trackingId, purchaseId, accountId, packageId, people: [...people] }, personal, tables };
}

export function preservationFailures(current: ScenarioPreservation, baseline: ScenarioPreservation) {
  const failures: string[] = [];
  if (JSON.stringify(current.identity) !== JSON.stringify(baseline.identity)) failures.push("Baseline identity mismatch.");
  for (const person of current.personal) {
    const previous = baseline.personal.find(row => row.personId === person.personId);
    if (!previous || JSON.stringify(person) !== JSON.stringify(previous)) failures.push(`Personal baseline mismatch: ${person.personId}.`);
  }
  for (const [name, previous] of Object.entries(baseline.tables)) {
    const actual = current.tables[name];
    if (previous.mode === "exact") {
      if (actual.count !== previous.count || actual.sha256 !== previous.sha256) failures.push(`Protected baseline mismatch: ${name}.`);
    } else {
      const remaining = new Map<string, number>();
      for (const value of actual.rowHashes ?? []) remaining.set(value, (remaining.get(value) ?? 0) + 1);
      for (const value of previous.rowHashes ?? []) {
        const count = remaining.get(value) ?? 0;
        if (!count) { failures.push(`Protected audit baseline mismatch: ${name}.`); break; }
        remaining.set(value, count - 1);
      }
    }
  }
  return failures;
}
