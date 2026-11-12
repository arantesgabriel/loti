import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../db/connection";
import * as s from "../db/schema";
import * as f from "../db/freight-schema";
import { authorization } from "./authorization";
import { DomainError } from "./errors";
import { logisticsTransaction } from "./logistics-transaction";
import type { CostTransaction } from "./purchase-cost-initialization";
import type { FreightUnit } from "./package-freight-calculations";

export const freightMinor = z.number().int().min(0).max(1_000_000_000_000);
export const financialCommandBase = {
  expectedRevision: z.number().int().nonnegative(), idempotencyKey: z.string().trim().min(1).max(200),
  occurredAt: z.iso.datetime({ offset: true }), reason: z.string().trim().min(3).max(1000),
};
export const financialHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const financialConflict = (message: string, code = "FREIGHT_REVISION_CONFLICT") => new DomainError(message, 409, code);

export async function freightContext(db: Pick<AppDatabase, "select">, actorId: string, packageId: string, workspaceId: string, sharedOnly = false) {
  const pkg = await db.select().from(s.logisticsPackages).where(eq(s.logisticsPackages.id, packageId)).get();
  if (!pkg) throw new DomainError("Pacote não encontrado.", 404);
  await authorization(db, actorId).requireActiveWorkspaceContext(pkg.workspaceId);
  if (pkg.workspaceId !== workspaceId) throw financialConflict("O espaço ativo mudou. Atualize a página.", "WORKSPACE_CONTEXT_CHANGED");
  if (sharedOnly) await authorization(db, actorId).requireWorkspaceMember(pkg.workspaceId);
  const head = await db.select().from(f.freightHeads).where(eq(f.freightHeads.packageId, packageId)).get();
  const payment = head?.paymentId ? await db.select().from(f.freightPayments).where(eq(f.freightPayments.id, head.paymentId)).get() : undefined;
  return { pkg, head, payment };
}
export async function freightContent(db: Pick<AppDatabase, "select">, packageId: string, allowEmpty = false) {
  const rows = await db.select({ reservation: s.logisticsReservations, cost: s.purchaseItemCosts,originalName:s.purchaseItems.name,additionalName:s.purchaseAdditionalOrderItems.name }).from(s.logisticsReservations)
    .innerJoin(s.purchaseItemCosts, eq(s.purchaseItemCosts.id, s.logisticsReservations.costItemId))
    .leftJoin(s.purchaseItems,eq(s.purchaseItems.id,s.purchaseItemCosts.purchaseItemId)).leftJoin(s.purchaseAdditionalOrderItems,eq(s.purchaseAdditionalOrderItems.id,s.purchaseItemCosts.additionalOrderItemId))
    .where(and(eq(s.logisticsReservations.packageId, packageId), isNull(s.logisticsReservations.releasedAt)))
    .orderBy(asc(s.logisticsReservations.costItemId), asc(s.logisticsReservations.unitIndex)).all();
  if (!rows.length && !allowEmpty) throw financialConflict("Inclua unidades no pacote antes de conferir o frete.", "FREIGHT_EMPTY_CONTENT");
  const people = await db.select({ participant: s.purchaseCostParticipants }).from(s.purchaseCostParticipants)
    .innerJoin(s.logisticsReservations, eq(s.logisticsReservations.costItemId, s.purchaseCostParticipants.costItemId))
    .where(and(eq(s.logisticsReservations.packageId, packageId), isNull(s.logisticsReservations.releasedAt)))
    .orderBy(asc(s.purchaseCostParticipants.allocationOrder)).all();
  const units: FreightUnit[] = rows.map(({ reservation }, order) => ({ costItemId: reservation.costItemId, unitIndex: reservation.unitIndex, order,
    participants: [...new Map(people.filter(p => p.participant.costItemId === reservation.costItemId).map(p => [p.participant.personId, { personId: p.participant.personId, order: p.participant.allocationOrder, weight: p.participant.weight }])).values()],
  }));
  const hash = financialHash({ version: 2, units, valuations: rows.map(row => ({ id: row.cost.id, version: row.cost.valuationVersion })) });
  return { version: 2 as const, hash, units,labels:Object.fromEntries(rows.map(row=>[row.cost.id,row.originalName??row.additionalName??"Produto"])) };
}

/** Every write shares a persistent idempotency boundary and active-context check. */
export async function freightWrite<T extends object>(db: AppDatabase, actorId: string, workspaceId: string, packageId: string,
  type: string, command: { idempotencyKey: string; occurredAt: string; reason: string },
  previewOnly: boolean, sharedOnly: boolean,
  work: (tx: CostTransaction, context: Awaited<ReturnType<typeof freightContext>>, operationId: string) => Promise<T>) {
  const hash = financialHash({ workspaceId, packageId, type, command });
  async function prior(read: Pick<AppDatabase, "select">) {
    await freightContext(read, actorId, packageId, workspaceId, sharedOnly);
    const operation = await read.select().from(s.financialOperations).where(and(eq(s.financialOperations.workspaceId, workspaceId), eq(s.financialOperations.idempotencyKey, command.idempotencyKey))).get();
    if (!operation) return null;
    if (operation.operationType !== type || operation.payloadHash !== hash) throw financialConflict("Chave já usada com outros dados.", "IDEMPOTENCY_CONFLICT");
    const saved = await read.select().from(f.financialResults).where(eq(f.financialResults.operationId, operation.id)).get();
    if (!saved) throw financialConflict("Operação sem resultado conciliado.", "FINANCIAL_RESULT_MISSING");
    return { ...(JSON.parse(saved.resultJson) as T), replayed: true };
  }
  try {
    return await logisticsTransaction(() => db.transaction(async tx => {
      const context = await freightContext(tx, actorId, packageId, workspaceId, sharedOnly);
      if (!previewOnly) { const previous = await prior(tx); if (previous) return previous; }
      const operationId = randomUUID();
      if (!previewOnly) await tx.insert(s.financialOperations).values({ id: operationId, workspaceId, operationType: type, idempotencyKey: command.idempotencyKey, payloadHash: hash, actorId, occurredAt: new Date(command.occurredAt), recordedAt: new Date(), reason: command.reason, contextJson: JSON.stringify({ packageId }) });
      // Operations are append-only: the result is recovered through normalized
      // resource relations, captured in the return-cache relation below.
      const result = await work(tx, context, operationId);
      if (!previewOnly) await tx.insert(f.financialResults).values({ operationId, resultJson: JSON.stringify(result) });
      return { ...result, replayed: false };
    }, { behavior: "immediate" }));
  } catch (error) {
    if (previewOnly || error instanceof DomainError && error.code !== "LOGISTICS_BUSY") throw error;
    const context = await freightContext(db, actorId, packageId, workspaceId, sharedOnly);
    const operation = await db.select().from(s.financialOperations).where(and(eq(s.financialOperations.workspaceId, context.pkg.workspaceId), eq(s.financialOperations.idempotencyKey, command.idempotencyKey))).get();
    if (!operation) throw error;
    if (operation.payloadHash !== hash || operation.operationType !== type) throw financialConflict("Chave já usada com outros dados.", "IDEMPOTENCY_CONFLICT");
    const saved = await db.select().from(f.financialResults).where(eq(f.financialResults.operationId, operation.id)).get();
    if (!saved) throw error;
    return { ...(JSON.parse(saved.resultJson) as T), replayed: true };
  }
}
