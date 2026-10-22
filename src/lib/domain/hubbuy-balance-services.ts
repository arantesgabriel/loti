import { createHash } from "node:crypto";
import { and, asc, desc, lt, eq, getTableColumns, gt, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../db/connection";
import {
  financialOperations,
  hubbuyAccounts,
  hubbuyBalanceConsumptions,
  hubbuyBalanceCreditShares,
  hubbuyBalanceEntries,
  hubbuyBalanceAdjustments,
  hubbuyReconciliationEvents,
  hubbuyReconciliationRuns,
  user,
} from "../db/schema";
import { authorization } from "./authorization";
import { DomainError } from "./errors";
import type { CostTransaction } from "./purchase-cost-initialization";
import { serializeDomainTransaction } from "./transaction-lock";
import { previewFifoConsumption } from "./hubbuy-balance-calculations";
import { accountDeletionBlockCode, accountDeletionBlockMessage, accountDiscardEligible } from "./hubbuy-account-lifecycle";
import { presentIndividualRights, type AvailableCreditShare } from "./hubbuy-rights-presentation";
import { readRefundProductOrigins } from "./hubbuy-rights-reading";
import { presentBalanceTraceability } from "./hubbuy-balance-traceability";
import { readBalanceTraceContext } from "./hubbuy-balance-traceability-reading";
import { manualBalanceAdjustmentServices } from "./hubbuy-balance-adjustments";

const MAX_MINOR = 1_000_000_000_000;
const minorSchema = z.number().int().min(0).max(MAX_MINOR);
const revisionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const idempotencySchema = z.string().trim().min(1).max(200);
const reasonSchema = z.string().trim().min(1).max(1000);
const createAccountSchema = z.object({
  workspaceId: z.string().min(1),
  idempotencyKey: idempotencySchema,
  label: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(320).nullable().optional(),
  confirmZeroBalance: z.literal(true),
}).strict();
const activateZeroSchema = z.object({
  expectedRevision: revisionSchema,
  idempotencyKey: idempotencySchema,
  confirmedNoPriorBalance: z.literal(true),
}).strict();
const reconciliationSchema = z.object({
  expectedRevision: revisionSchema,
  idempotencyKey: idempotencySchema,
  mode: z.enum(["chronological", "remainder"]).default("remainder"),
  observedBalanceCnyMinor: z.number().int().min(0).max(MAX_MINOR),
  occurredAt: z.coerce.date().nullable().optional(),
  priorActivityDescription: z.string().trim().min(1).max(1000).nullable().optional(),
  priorActivityOccurredAt: z.coerce.date().nullable().optional(),
  reason: reasonSchema,
  shares: z.array(z.object({ personId: z.string().min(1), amountCnyMinor: z.number().int().min(1).max(MAX_MINOR), historicalBrlCents: minorSchema }).strict()).max(100),
}).strict();
const startReconciliationSchema = z.object({ expectedRevision: revisionSchema, idempotencyKey: idempotencySchema, mode: z.literal("chronological") }).strict();
const reconciliationEventSchema = z.object({
  expectedRevision: revisionSchema, idempotencyKey: idempotencySchema, eventType: z.enum(["legacy_receipt", "synthetic_use"]),
  description: z.string().trim().min(1).max(1000), sourceReference: z.string().trim().min(1).max(200).nullable().optional(),
  occurredAt: z.coerce.date(), amountCnyMinor: z.number().int().min(1).max(MAX_MINOR),
  shares: z.array(z.object({ personId: z.string().min(1), amountCnyMinor: z.number().int().min(1).max(MAX_MINOR), historicalBrlCents: minorSchema }).strict()).max(100).default([]),
}).strict();
const archiveSchema = z.object({ expectedRevision: revisionSchema, idempotencyKey: idempotencySchema, reason: reasonSchema }).strict();
const discardSchema = archiveSchema.extend({ confirmedIncorrectRegistration: z.literal(true) }).strict();

type Transaction = CostTransaction;
type Account = typeof hubbuyAccounts.$inferSelect;

function hashPayload(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isUniqueConstraint(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; message?: string; cause?: unknown };
  return /unique|constraint/i.test(`${value.code ?? ""} ${value.message ?? ""}`) || isUniqueConstraint(value.cause);
}

function isDatabaseBusy(error: unknown, seen = new Set<unknown>()): boolean {
  if (!error || typeof error !== "object" || seen.has(error)) return false;
  seen.add(error);
  const candidate = error as { code?: string; message?: string; cause?: unknown };
  return candidate.code === "SQLITE_BUSY" || /SQLITE_BUSY|database is locked/i.test(candidate.message ?? "") || isDatabaseBusy(candidate.cause, seen);
}

function assertIdempotent(existing: typeof financialOperations.$inferSelect, operationType: string, payloadHash: string) {
  if (existing.operationType !== operationType || existing.payloadHash !== payloadHash) {
    throw new DomainError("Esta chave de operação já foi usada com outros dados.", 409, "IDEMPOTENCY_CONFLICT");
  }
  return existing;
}

function readAccountIdFromOperation(operation: typeof financialOperations.$inferSelect) {
  let context: unknown;
  try { context = JSON.parse(operation.contextJson); } catch { throw new DomainError("O registro da operação está inconsistente.", 500); }
  if (!context || typeof context !== "object" || typeof (context as { accountId?: unknown }).accountId !== "string") {
    throw new DomainError("O registro da operação não aponta para uma conta válida.", 500);
  }
  return (context as { accountId: string }).accountId;
}

async function findIdempotentOperation(db: Pick<AppDatabase, "select">, workspaceId: string, idempotencyKey: string) {
  return db.select().from(financialOperations).where(and(
    eq(financialOperations.workspaceId, workspaceId),
    eq(financialOperations.idempotencyKey, idempotencyKey),
  )).get();
}

async function requireAccount(tx: Transaction, userId: string, accountId: string, includeDeleted = false) {
  const account = await tx.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, accountId)).get();
  if (!account) throw new DomainError("Conta HubBuy não encontrada.", 404);
  await authorization(tx, userId).requireWorkspaceMember(account.workspaceId);
  if (account.deletedAt && !includeDeleted) throw new DomainError("Conta HubBuy não encontrada.", 404);
  return account;
}

async function calculateLedgerState(tx: Transaction, account: Account) {
  const entries = await tx.select().from(hubbuyBalanceEntries)
    .where(eq(hubbuyBalanceEntries.accountId, account.id))
    .orderBy(asc(hubbuyBalanceEntries.sequence)).all();
  const shares = await tx.select(getTableColumns(hubbuyBalanceCreditShares)).from(hubbuyBalanceCreditShares)
    .innerJoin(hubbuyBalanceEntries, eq(hubbuyBalanceEntries.id, hubbuyBalanceCreditShares.creditEntryId))
    .where(and(eq(hubbuyBalanceEntries.accountId, account.id), eq(hubbuyBalanceEntries.direction, "credit")))
    .orderBy(asc(hubbuyBalanceCreditShares.allocationOrder)).all();
  const consumptions = await tx.select(getTableColumns(hubbuyBalanceConsumptions)).from(hubbuyBalanceConsumptions)
    .innerJoin(hubbuyBalanceCreditShares, eq(hubbuyBalanceCreditShares.id, hubbuyBalanceConsumptions.creditShareId))
    .innerJoin(hubbuyBalanceEntries, eq(hubbuyBalanceEntries.id, hubbuyBalanceCreditShares.creditEntryId))
    .where(and(eq(hubbuyBalanceEntries.accountId, account.id), eq(hubbuyBalanceEntries.direction, "credit"))).all();
  const signedBalance = entries.reduce((sum, entry) => sum + (entry.direction === "credit" ? BigInt(entry.amountCnyMinor) : -BigInt(entry.amountCnyMinor)), 0n);
  if (signedBalance < 0n || signedBalance > BigInt(MAX_MINOR)) throw new DomainError("O ledger da conta está divergente ou negativo.", 409, "BALANCE_RECONCILIATION_REQUIRED");
  const sharesByCredit = new Map<string, typeof shares>();
  for (const share of shares) sharesByCredit.set(share.creditEntryId, [...(sharesByCredit.get(share.creditEntryId) ?? []), share]);
  const consumedByShare = new Map<string, { cny: bigint; brl: bigint }>();
  const consumedByDebit = new Map<string, bigint>();
  for (const consumption of consumptions) {
    const current = consumedByShare.get(consumption.creditShareId) ?? { cny: 0n, brl: 0n };
    current.cny += BigInt(consumption.amountCnyMinor);
    current.brl += BigInt(consumption.historicalBrlCents);
    consumedByShare.set(consumption.creditShareId, current);
    consumedByDebit.set(consumption.debitEntryId, (consumedByDebit.get(consumption.debitEntryId) ?? 0n) + BigInt(consumption.amountCnyMinor));
  }
  let reconciled = true;
  for (const entry of entries) {
    if (entry.direction === "credit") {
      const entryShares = sharesByCredit.get(entry.id) ?? [];
      const shareCny = entryShares.reduce((sum, share) => sum + BigInt(share.amountCnyMinor), 0n);
      const shareBrl = entryShares.reduce((sum, share) => sum + BigInt(share.historicalBrlCents), 0n);
      if (shareCny !== BigInt(entry.amountCnyMinor) || entry.historicalBrlCents === null || shareBrl !== BigInt(entry.historicalBrlCents)) reconciled = false;
    } else if ((consumedByDebit.get(entry.id) ?? 0n) !== BigInt(entry.amountCnyMinor)) {
      reconciled = false;
    }
  }
  const balances = new Map<string, { personId: string; availableCnyMinor: bigint; availableHistoricalBrlCents: bigint }>();
  const availableShares: AvailableCreditShare[] = [];
  for (const share of shares) {
    const consumed = consumedByShare.get(share.id) ?? { cny: 0n, brl: 0n };
    const availableCnyMinor = BigInt(share.amountCnyMinor) - consumed.cny;
    const availableHistoricalBrlCents = BigInt(share.historicalBrlCents) - consumed.brl;
    if (availableCnyMinor < 0n || availableHistoricalBrlCents < 0n) throw new DomainError("O consumo excedeu os direitos de um lote.", 409, "BALANCE_RECONCILIATION_REQUIRED");
    if (availableCnyMinor === 0n && availableHistoricalBrlCents > 0n) reconciled = false;
    availableShares.push({ id: share.id, creditEntryId: share.creditEntryId, personId: share.personId, availableCnyMinor: Number(availableCnyMinor), availableHistoricalBrlCents: Number(availableHistoricalBrlCents) });
    const current = balances.get(share.personId) ?? { personId: share.personId, availableCnyMinor: 0n, availableHistoricalBrlCents: 0n };
    current.availableCnyMinor += availableCnyMinor;
    current.availableHistoricalBrlCents += availableHistoricalBrlCents;
    balances.set(share.personId, current);
  }
  if ([...balances.values()].reduce((sum, row) => sum + row.availableCnyMinor, 0n) !== signedBalance) reconciled = false;
  return {
    ledgerBalanceCnyMinor: Number(signedBalance),
    reconciled,
    rights: [...balances.values()].map(row => ({ personId: row.personId, availableCnyMinor: Number(row.availableCnyMinor), availableHistoricalBrlCents: Number(row.availableHistoricalBrlCents) })),
    entries,
    shares,
    consumptions,
    availableShares,
  };
}

export async function calculateHubBuyBalanceState(tx: Transaction, accountId: string) {
  const account = await tx.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, accountId)).get();
  if (!account || account.deletedAt) throw new DomainError("Conta HubBuy não encontrada.", 404);
  return { account, ...(await calculateLedgerState(tx, account)) };
}

export async function createHubbuyZeroBalanceAccountInTransaction(tx: Transaction, userId: string, input: unknown) {
  const value = createAccountSchema.parse(input);
  const normalized = { ...value, label: value.label.trim(), email: value.email?.trim().toLowerCase() ?? null };
  const payloadHash = hashPayload(normalized);
  await authorization(tx, userId).requireWorkspaceMember(value.workspaceId);
  const existing = await findIdempotentOperation(tx, value.workspaceId, value.idempotencyKey);
  if (existing) {
    const operation = assertIdempotent(existing, "account_created", payloadHash);
    const retained = await requireAccount(tx, userId, readAccountIdFromOperation(operation));
    return { accountId: retained.id, operationId: operation.id, replayed: true };
  }

  const now = new Date(), accountId = crypto.randomUUID(), operationId = crypto.randomUUID();
  await tx.insert(hubbuyAccounts).values({
    id: accountId, workspaceId: value.workspaceId, label: normalized.label, email: normalized.email, currency: "CNY",
    status: "active", balanceCnyMinor: 0, revision: 0, createdBy: userId, createdAt: now,
    updatedBy: userId, updatedAt: now, reconciledBy: userId, reconciledAt: now,
  }).run();
  await tx.insert(financialOperations).values({
    id: operationId, workspaceId: value.workspaceId, operationType: "account_created", idempotencyKey: value.idempotencyKey,
    payloadHash, actorId: userId, occurredAt: null, recordedAt: now, reason: "Saldo inicial conhecido em ¥0", reversalOfId: null,
    contextJson: JSON.stringify({ accountId, initialBalance: "known_zero" }),
  }).run();
  return { accountId, operationId, replayed: false };
}

export async function activateEmptyHubbuyAccountAtZeroInTransaction(tx: Transaction, userId: string, accountId: string, input: unknown) {
  const value = activateZeroSchema.parse(input);
  const account = await requireAccount(tx, userId, accountId);
  const payloadHash = hashPayload({ accountId, ...value });
  const existing = await findIdempotentOperation(tx, account.workspaceId, value.idempotencyKey);
  if (existing) {
    assertIdempotent(existing, "account_empty_activated_zero", payloadHash);
    return { accountId, operationId: existing.id, account, replayed: true };
  }
  if (account.status !== "reconciling") throw new DomainError("Somente uma conta aguardando conciliação pode ser ativada com saldo zero.", 409, "ACCOUNT_ZERO_ACTIVATION_INELIGIBLE");
  if (account.revision !== value.expectedRevision) throw new DomainError("A conta mudou em outra sessão. Atualize a tela e tente novamente.", 409, "ACCOUNT_REVISION_CONFLICT");
  const [state, run, events] = await Promise.all([
    calculateLedgerState(tx, account),
    tx.select({ id: hubbuyReconciliationRuns.accountId }).from(hubbuyReconciliationRuns).where(eq(hubbuyReconciliationRuns.accountId, accountId)).get(),
    tx.select({ id: hubbuyReconciliationEvents.id }).from(hubbuyReconciliationEvents).where(eq(hubbuyReconciliationEvents.accountId, accountId)).limit(1).get(),
  ]);
  if (account.balanceCnyMinor !== 0 || state.ledgerBalanceCnyMinor !== 0 || !state.reconciled || state.entries.length || run || events || state.rights.length) {
    throw new DomainError("Esta conta tem saldo ou histórico. Use a conciliação do saldo que já existia.", 409, "ACCOUNT_ZERO_ACTIVATION_INELIGIBLE");
  }
  const now = new Date(), operationId = crypto.randomUUID();
  await tx.insert(financialOperations).values({
    id: operationId, workspaceId: account.workspaceId, operationType: "account_empty_activated_zero", idempotencyKey: value.idempotencyKey,
    payloadHash, actorId: userId, occurredAt: null, recordedAt: now,
    reason: "Confirmação explícita de que não havia saldo nem movimentações anteriores", reversalOfId: null,
    contextJson: JSON.stringify({ accountId, initialBalance: "known_zero" }),
  }).run();
  const updated = await tx.update(hubbuyAccounts).set({
    status: "active", balanceCnyMinor: 0, revision: account.revision + 1,
    reconciledBy: userId, reconciledAt: now, updatedBy: userId, updatedAt: now,
  }).where(and(eq(hubbuyAccounts.id, accountId), eq(hubbuyAccounts.revision, value.expectedRevision), eq(hubbuyAccounts.status, "reconciling"))).returning().get();
  if (!updated) throw new DomainError("A conta mudou durante a ativação. Atualize a tela e tente novamente.", 409, "ACCOUNT_REVISION_CONFLICT");
  return { accountId, operationId, account: updated, replayed: false };
}

export function hubbuyBalanceServices(db: AppDatabase, userId: string) {
  const transact = <T>(operation: (tx: Transaction) => Promise<T>) => serializeDomainTransaction(async () => {
    for (let attempt = 0; ; attempt++) {
      try { return await db.transaction(operation); }
      catch (error) {
        if (!isDatabaseBusy(error) || attempt >= 8) throw error;
        await new Promise(resolve => setTimeout(resolve, Math.min(2_000, 25 * 2 ** attempt)));
      }
    }
  });

  async function createAccount(input: unknown) {
    const value = createAccountSchema.parse(input);
    const payloadHash = hashPayload({ ...value, label: value.label.trim(), email: value.email?.trim().toLowerCase() ?? null });
    return transact(async tx => createHubbuyZeroBalanceAccountInTransaction(tx, userId, value)).catch(async error => {
      if (!isUniqueConstraint(error)) throw error;
      const existing = await findIdempotentOperation(db, value.workspaceId, value.idempotencyKey);
      if (!existing) throw error;
      await authorization(db, userId).requireWorkspaceMember(value.workspaceId);
      const retained = await db.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, readAccountIdFromOperation(existing))).get();
      if (!retained || retained.deletedAt) throw new DomainError("Conta HubBuy não encontrada.", 404);
      return { accountId: readAccountIdFromOperation(assertIdempotent(existing, "account_created", payloadHash)), operationId: existing.id, replayed: true };
    });
  }

  async function activateEmptyAccountAtZero(accountId: string, input: unknown) {
    const value = activateZeroSchema.parse(input);
    const result = await transact(tx => activateEmptyHubbuyAccountAtZeroInTransaction(tx, userId, accountId, value));
    return { ...result, rights: [], ledgerBalanceCnyMinor: 0, reconciled: true };
  }

  async function startReconciliation(accountId: string, input: unknown) {
    const value = startReconciliationSchema.parse(input);
    const payloadHash = hashPayload({ accountId, ...value });
    return transact(async tx => {
      const account = await requireAccount(tx, userId, accountId);
      const existing = await findIdempotentOperation(tx, account.workspaceId, value.idempotencyKey);
      if (existing) { assertIdempotent(existing, "account_reconciliation_started", payloadHash); return { accountId, operationId: existing.id, replayed: true, accountRevision: account.revision }; }
      if (account.status !== "reconciling") throw new DomainError("A reconstrução só pode começar em uma conta aguardando conciliação.", 409);
      if (account.revision !== value.expectedRevision) throw new DomainError("A conta mudou em outra sessão. Atualize a tela e tente novamente.", 409);
      const currentRun = await tx.select().from(hubbuyReconciliationRuns).where(eq(hubbuyReconciliationRuns.accountId, accountId)).get();
      if (currentRun) throw new DomainError("O modo de conciliação desta conta já foi escolhido.", 409, "RECONCILIATION_MODE_LOCKED");
      const priorEntries = await tx.select({ id: hubbuyBalanceEntries.id }).from(hubbuyBalanceEntries).where(eq(hubbuyBalanceEntries.accountId, accountId)).limit(1).get();
      if (priorEntries) throw new DomainError("Uma conta com lançamentos exige conciliação cronológica; o modo deve ser escolhido antes dos eventos.", 409, "RECONCILIATION_HISTORY_EXISTS");
      const now = new Date(), operationId = crypto.randomUUID();
      await tx.insert(financialOperations).values({
        id: operationId, workspaceId: account.workspaceId, operationType: "account_reconciliation_started", idempotencyKey: value.idempotencyKey,
        payloadHash, actorId: userId, occurredAt: null, recordedAt: now, reason: null, reversalOfId: null,
        contextJson: JSON.stringify({ accountId, mode: value.mode }),
      }).run();
      await tx.insert(hubbuyReconciliationRuns).values({ accountId, mode: "chronological", priorActivityDescription: null, priorActivityOccurredAt: null, startedBy: userId, startedAt: now }).run();
      const updated = await tx.update(hubbuyAccounts).set({ revision: account.revision + 1, updatedBy: userId, updatedAt: now })
        .where(and(eq(hubbuyAccounts.id, accountId), eq(hubbuyAccounts.revision, value.expectedRevision), eq(hubbuyAccounts.status, "reconciling"))).returning({ revision: hubbuyAccounts.revision }).get();
      if (!updated) throw new DomainError("A conta mudou durante o início da reconstrução.", 409);
      return { accountId, operationId, accountRevision: updated.revision, replayed: false };
    });
  }

  async function recordReconciliationEvent(accountId: string, input: unknown) {
    const value = reconciliationEventSchema.parse(input);
    if (new Set(value.shares.map(share => share.personId)).size !== value.shares.length) throw new DomainError("Cada pessoa deve aparecer uma única vez no recebimento legado.", 400);
    if (value.eventType === "legacy_receipt") {
      const shareTotal = value.shares.reduce((sum, share) => sum + BigInt(share.amountCnyMinor), 0n);
      if (shareTotal !== BigInt(value.amountCnyMinor)) throw new DomainError("Os direitos individuais precisam fechar o recebimento CNY.", 400, "BALANCE_SHARES_MISMATCH");
    } else if (value.shares.length) throw new DomainError("Um uso sintético consome os lotes em FIFO e não recebe direitos manuais.", 400);
    const normalized = { ...value, description: value.description.trim(), sourceReference: value.sourceReference?.trim() || null, shares: [...value.shares].sort((a, b) => a.personId.localeCompare(b.personId)) };
    const payloadHash = hashPayload({ accountId, ...normalized });
    return transact(async tx => {
      const account = await requireAccount(tx, userId, accountId);
      const existing = await findIdempotentOperation(tx, account.workspaceId, value.idempotencyKey);
      if (existing) {
        assertIdempotent(existing, "account_reconciliation_event", payloadHash);
        const context = JSON.parse(existing.contextJson) as { eventId?: string };
        return { accountId, operationId: existing.id, eventId: context.eventId ?? null, replayed: true, accountRevision: account.revision };
      }
      if (account.status !== "reconciling") throw new DomainError("Só é possível lançar eventos enquanto a conta está em conciliação.", 409);
      if (account.revision !== value.expectedRevision) throw new DomainError("A conta mudou em outra sessão. Atualize a tela e tente novamente.", 409);
      const run = await tx.select().from(hubbuyReconciliationRuns).where(eq(hubbuyReconciliationRuns.accountId, accountId)).get();
      if (!run || run.mode !== "chronological") throw new DomainError("Inicie a reconstrução cronológica antes de informar recebimentos e usos.", 409, "RECONCILIATION_MODE_REQUIRED");
      if (normalized.shares.length) await authorization(tx, userId).requireWorkspaceMembers(normalized.shares.map(share => share.personId), account.workspaceId);
      if (normalized.sourceReference && await tx.select().from(hubbuyReconciliationEvents).where(and(eq(hubbuyReconciliationEvents.accountId, accountId), eq(hubbuyReconciliationEvents.sourceReference, normalized.sourceReference))).get()) throw new DomainError("Esta referência já foi associada a outro recebimento.", 409, "RECONCILIATION_SOURCE_DUPLICATE");
      const latest = await tx.select().from(hubbuyReconciliationEvents).where(eq(hubbuyReconciliationEvents.accountId, accountId)).orderBy(asc(hubbuyReconciliationEvents.occurredAt), asc(hubbuyReconciliationEvents.recordedAt)).all();
      const latestOccurredAt = latest.at(-1)?.occurredAt ?? null;
      if (latestOccurredAt && value.occurredAt.getTime() < latestOccurredAt.getTime()) throw new DomainError("Registre os eventos em ordem cronológica; a data informada precisa ser igual ou posterior ao último evento.", 409, "RECONCILIATION_EVENT_ORDER");
      const state = await calculateLedgerState(tx, account);
      const nextSequence = state.entries.length ? state.entries.at(-1)!.sequence + 1 : 0;
      const eventId = crypto.randomUUID(), entryId = crypto.randomUUID(), operationId = crypto.randomUUID(), now = new Date();
      let historicalBrlCents: number;
      let fifoConsumption: ReturnType<typeof previewFifoConsumption> | null = null;
      if (value.eventType === "legacy_receipt") historicalBrlCents = normalized.shares.reduce((sum, share) => sum + share.historicalBrlCents, 0);
      else {
        const entryById = new Map(state.entries.map(entry => [entry.id, entry]));
        const consumedByShare = new Map<string, { cny: number; brl: number }>();
        for (const consumption of state.consumptions) {
          const current = consumedByShare.get(consumption.creditShareId) ?? { cny: 0, brl: 0 };
          current.cny += consumption.amountCnyMinor; current.brl += consumption.historicalBrlCents;
          consumedByShare.set(consumption.creditShareId, current);
        }
        const orderedShares = [...state.shares].sort((a, b) => (entryById.get(a.creditEntryId)?.sequence ?? 0) - (entryById.get(b.creditEntryId)?.sequence ?? 0) || a.allocationOrder - b.allocationOrder);
        const lots = orderedShares.map((share, sequence) => {
          const used = consumedByShare.get(share.id) ?? { cny: 0, brl: 0 };
          const availableCnyMinor = share.amountCnyMinor - used.cny;
          const availableHistoricalBrlCents = share.historicalBrlCents - used.brl;
          if (availableCnyMinor < 0 || availableHistoricalBrlCents < 0) throw new DomainError("Os direitos disponíveis estão divergentes; revise os eventos antes de continuar.", 409, "BALANCE_RECONCILIATION_REQUIRED");
          return { creditId: share.id, sequence, availableCnyMinor, availableHistoricalBrlCents };
        });
        try { fifoConsumption = previewFifoConsumption(value.amountCnyMinor, lots); }
        catch (error) { throw new DomainError(error instanceof Error ? error.message : "O saldo cronológico é insuficiente.", 409, "BALANCE_INSUFFICIENT"); }
        historicalBrlCents = fifoConsumption.historicalBrlCents;
      }
      await tx.insert(financialOperations).values({ id: operationId, workspaceId: account.workspaceId, operationType: "account_reconciliation_event", idempotencyKey: value.idempotencyKey, payloadHash, actorId: userId, occurredAt: value.occurredAt, recordedAt: now, reason: normalized.description, reversalOfId: null, contextJson: JSON.stringify({ accountId, eventId, entryId, eventType: value.eventType, amountCnyMinor: value.amountCnyMinor }) }).run();
      if (value.eventType === "legacy_receipt") {
        await tx.insert(hubbuyBalanceEntries).values({ id: entryId, accountId, operationId, sequence: nextSequence, direction: "credit", amountCnyMinor: value.amountCnyMinor, historicalBrlCents, sourceType: "manual_adjustment", sourceId: `reconciliation:${eventId}`, reversalOfEntryId: null, createdAt: now }).run();
        await tx.insert(hubbuyBalanceCreditShares).values(normalized.shares.map((share, allocationOrder) => ({ id: crypto.randomUUID(), creditEntryId: entryId, personId: share.personId, allocationOrder, amountCnyMinor: share.amountCnyMinor, historicalBrlCents: share.historicalBrlCents }))).run();
      } else {
        await tx.insert(hubbuyBalanceEntries).values({ id: entryId, accountId, operationId, sequence: nextSequence, direction: "debit", amountCnyMinor: value.amountCnyMinor, historicalBrlCents, sourceType: "manual_adjustment", sourceId: `reconciliation:${eventId}`, reversalOfEntryId: null, createdAt: now }).run();
        await tx.insert(hubbuyBalanceConsumptions).values(fifoConsumption!.consumptions.map((row, allocationOrder) => ({ id: crypto.randomUUID(), debitEntryId: entryId, creditShareId: row.creditId, allocationOrder, amountCnyMinor: row.cnyMinor, historicalBrlCents: row.historicalBrlCents, paymentAllocationId: null, createdAt: now }))).run();
      }
      await tx.insert(hubbuyReconciliationEvents).values({ id: eventId, accountId, operationId, balanceEntryId: entryId, eventType: value.eventType, sourceReference: normalized.sourceReference, description: normalized.description, amountCnyMinor: value.amountCnyMinor, historicalBrlCents, occurredAt: value.occurredAt, createdBy: userId, recordedAt: now }).run();
      const updated = await tx.update(hubbuyAccounts).set({ revision: account.revision + 1, updatedBy: userId, updatedAt: now }).where(and(eq(hubbuyAccounts.id, accountId), eq(hubbuyAccounts.revision, value.expectedRevision), eq(hubbuyAccounts.status, "reconciling"))).returning({ revision: hubbuyAccounts.revision }).get();
      if (!updated) throw new DomainError("A conta mudou ao registrar o evento; atualize a tela.", 409);
      return { accountId, operationId, eventId, balanceEntryId: entryId, historicalBrlCents, accountRevision: updated.revision, replayed: false };
    }).catch(async error => {
      if (!isUniqueConstraint(error)) throw error;
      const account = await db.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, accountId)).get();
      if (!account) throw error;
      const existing = await findIdempotentOperation(db, account.workspaceId, value.idempotencyKey);
      if (!existing) throw error;
      const context = JSON.parse(existing.contextJson) as { eventId?: string };
      return { accountId, operationId: existing.id, eventId: context.eventId ?? null, accountRevision: account.revision, replayed: true };
    });
  }

  async function reconcileAccount(accountId: string, input: unknown) {
    const value = reconciliationSchema.parse(input);
    if (new Set(value.shares.map(share => share.personId)).size !== value.shares.length) throw new DomainError("Cada pessoa deve aparecer uma única vez na participação.", 400);
    const total = value.shares.reduce((sum, share) => sum + BigInt(share.amountCnyMinor), 0n);
    const totalBasis = value.shares.reduce((sum, share) => sum + BigInt(share.historicalBrlCents), 0n);
    if (total !== BigInt(value.observedBalanceCnyMinor) || totalBasis > BigInt(MAX_MINOR)) throw new DomainError("As participações precisam fechar exatamente o saldo CNY conferido.", 400, "BALANCE_SHARES_MISMATCH");
    const normalized = { accountId, ...value, shares: [...value.shares].sort((a, b) => a.personId.localeCompare(b.personId)) };
    const payloadHash = hashPayload(normalized);
    return transact(async tx => {
      const account = await requireAccount(tx, userId, accountId);
      const existing = await findIdempotentOperation(tx, account.workspaceId, value.idempotencyKey);
      if (existing) return { accountId: readAccountIdFromOperation(assertIdempotent(existing, "account_reconciled", payloadHash)), operationId: existing.id, replayed: true };
      if (account.status !== "reconciling") throw new DomainError("Só é possível concluir a conciliação de uma conta em conferência.", 409);
      if (account.revision !== value.expectedRevision) throw new DomainError("A conta mudou em outra sessão. Atualize a tela e tente novamente.", 409);
      let run = await tx.select().from(hubbuyReconciliationRuns).where(eq(hubbuyReconciliationRuns.accountId, accountId)).get();
      if (run && run.mode !== value.mode) throw new DomainError("O modo de conciliação desta conta já foi escolhido e não pode ser trocado.", 409, "RECONCILIATION_MODE_LOCKED");
      const state = await calculateLedgerState(tx, account);
      if (value.mode === "remainder" && state.entries.length) throw new DomainError("A conta já contém eventos cronológicos. Finalize pelo saldo reconstruído para evitar dupla abertura.", 409, "RECONCILIATION_DOUBLE_OPEN");
      if (value.mode === "chronological" && (!run || run.mode !== "chronological")) throw new DomainError("Inicie a reconstrução cronológica antes de conciliar a conta.", 409, "RECONCILIATION_MODE_REQUIRED");
      if (value.shares.length) await authorization(tx, userId).requireWorkspaceMembers(value.shares.map(share => share.personId), account.workspaceId);
      const now = new Date();
      const operationId = crypto.randomUUID();
      const entryId = value.mode === "remainder" && value.observedBalanceCnyMinor > 0 ? crypto.randomUUID() : null;
      if (!run) {
        const priorActivityDescription = value.priorActivityDescription?.trim() || value.reason;
        await tx.insert(hubbuyReconciliationRuns).values({ accountId, mode: "remainder", priorActivityDescription, priorActivityOccurredAt: value.priorActivityOccurredAt ?? null, startedBy: userId, startedAt: now }).run();
        run = await tx.select().from(hubbuyReconciliationRuns).where(eq(hubbuyReconciliationRuns.accountId, accountId)).get();
      }
      if (!run) throw new DomainError("A conciliação não registrou seu modo.", 500);
      await tx.insert(financialOperations).values({
        id: operationId, workspaceId: account.workspaceId, operationType: "account_reconciled", idempotencyKey: value.idempotencyKey,
        payloadHash, actorId: userId, occurredAt: value.occurredAt ?? null, recordedAt: now, reason: value.reason,
        reversalOfId: null, contextJson: JSON.stringify({ accountId, mode: run.mode, entryId, observedBalanceCnyMinor: value.observedBalanceCnyMinor, coveredPriorActivity: run.mode === "remainder", priorActivityDescription: run.priorActivityDescription, priorActivityOccurredAt: run.priorActivityOccurredAt }),
      }).run();
      if (run.mode === "remainder" && value.observedBalanceCnyMinor > 0) {
        await tx.insert(hubbuyBalanceEntries).values({
          id: entryId!, accountId, operationId, sequence: 0, direction: "credit", amountCnyMinor: value.observedBalanceCnyMinor,
          historicalBrlCents: Number(totalBasis), sourceType: "opening_balance", sourceId: `opening:${accountId}`, reversalOfEntryId: null, createdAt: now,
        }).run();
        await tx.insert(hubbuyBalanceCreditShares).values(normalized.shares.map((share, allocationOrder) => ({
          id: crypto.randomUUID(), creditEntryId: entryId!, personId: share.personId, allocationOrder,
          amountCnyMinor: share.amountCnyMinor, historicalBrlCents: share.historicalBrlCents,
        }))).run();
      } else if (run.mode === "chronological") {
        if (!state.reconciled || state.ledgerBalanceCnyMinor !== value.observedBalanceCnyMinor) throw new DomainError("O saldo reconstruído não fecha com o saldo observado; registre os recebimentos e usos faltantes antes de ativar.", 409, "RECONCILIATION_BALANCE_MISMATCH");
        const expectedRights = new Map(normalized.shares.map(share => [share.personId, `${share.amountCnyMinor}:${share.historicalBrlCents}`]));
        const actualRights = new Map(state.rights.filter(right => right.availableCnyMinor > 0).map(right => [right.personId, `${right.availableCnyMinor}:${right.availableHistoricalBrlCents}`]));
        if (expectedRights.size !== actualRights.size || [...expectedRights].some(([personId, amount]) => actualRights.get(personId) !== amount)) throw new DomainError("Os direitos individuais informados não coincidem com os recebimentos e usos reconstruídos.", 409, "RECONCILIATION_RIGHTS_MISMATCH");
      }
      const updated = await tx.update(hubbuyAccounts).set({
        status: "active", balanceCnyMinor: value.observedBalanceCnyMinor, revision: account.revision + 1,
        reconciledBy: userId, reconciledAt: now, updatedBy: userId, updatedAt: now,
      }).where(and(eq(hubbuyAccounts.id, accountId), eq(hubbuyAccounts.revision, value.expectedRevision), eq(hubbuyAccounts.status, "reconciling"))).returning().get();
      if (!updated) throw new DomainError("A conta mudou durante a conciliação. Atualize a tela e tente novamente.", 409);
      const checked = await calculateLedgerState(tx, updated);
      if (!checked.reconciled || checked.ledgerBalanceCnyMinor !== value.observedBalanceCnyMinor) throw new DomainError("A conciliação não fechou com o ledger e os direitos individuais.", 409, "BALANCE_RECONCILIATION_REQUIRED");
      return { accountId, operationId, entryId, account: updated, rights: checked.rights, mode: run.mode, replayed: false };
    }).catch(async error => {
      if (!isUniqueConstraint(error)) throw error;
      const account = await db.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, accountId)).get();
      if (!account) throw error;
      const existing = await findIdempotentOperation(db, account.workspaceId, value.idempotencyKey);
      if (!existing) throw error;
      return { accountId: readAccountIdFromOperation(assertIdempotent(existing, "account_reconciled", payloadHash)), operationId: existing.id, replayed: true };
    });
  }

  async function archiveAccount(accountId: string, input: unknown) {
    const value = archiveSchema.parse(input);
    const payloadHash = hashPayload({ accountId, ...value });
    return transact(async tx => {
      const account = await requireAccount(tx, userId, accountId);
      const existing = await findIdempotentOperation(tx, account.workspaceId, value.idempotencyKey);
      if (existing) {
        assertIdempotent(existing, "account_archived", payloadHash);
        return { accountId, operationId: existing.id, replayed: true };
      }
      if (account.status === "archived") throw new DomainError("Esta conta já está arquivada.", 409);
      if (account.revision !== value.expectedRevision) throw new DomainError("A conta mudou em outra sessão. Atualize a tela e tente novamente.", 409);
      const state = await calculateLedgerState(tx, account);
      if (!state.reconciled || state.ledgerBalanceCnyMinor !== 0) throw new DomainError("Só é possível arquivar uma conta conciliada sem saldo CNY.", 409, "BALANCE_NOT_EMPTY");
      const now = new Date();
      const operationId = crypto.randomUUID();
      await tx.insert(financialOperations).values({
        id: operationId, workspaceId: account.workspaceId, operationType: "account_archived", idempotencyKey: value.idempotencyKey,
        payloadHash, actorId: userId, occurredAt: null, recordedAt: now, reason: value.reason,
        reversalOfId: null, contextJson: JSON.stringify({ accountId }),
      }).run();
      const updated = await tx.update(hubbuyAccounts).set({ status: "archived", revision: account.revision + 1, updatedBy: userId, updatedAt: now })
        .where(and(eq(hubbuyAccounts.id, accountId), eq(hubbuyAccounts.revision, value.expectedRevision), eq(hubbuyAccounts.status, account.status))).returning().get();
      if (!updated) throw new DomainError("A conta mudou durante o arquivamento. Atualize a tela e tente novamente.", 409);
      return { accountId, operationId, replayed: false };
    });
  }

  async function deleteAccount(accountId: string, input: unknown, discardIncorrectRegistration = false) {
    const value = discardIncorrectRegistration ? discardSchema.parse(input) : archiveSchema.parse(input);
    const operationType = discardIncorrectRegistration ? "account_registration_discarded" : "account_deleted";
    const payloadHash = hashPayload({ accountId, ...value });
    return transact(async tx => {
      const account = await requireAccount(tx, userId, accountId, true);
      const existing = await findIdempotentOperation(tx, account.workspaceId, value.idempotencyKey);
      if (existing) {
        assertIdempotent(existing, operationType, payloadHash);
        return { accountId, operationId: existing.id, replayed: true };
      }
      if (account.deletedAt) throw new DomainError("Este cadastro já foi excluído do Loti.", 409, "ACCOUNT_DELETED");
      if (account.revision !== value.expectedRevision) throw new DomainError("A conta mudou em outra sessão. Atualize a tela e tente novamente.", 409, "ACCOUNT_REVISION_CONFLICT");
      const eligibility = await tx.select({ code: accountDeletionBlockCode, canDiscard: accountDiscardEligible }).from(hubbuyAccounts).where(eq(hubbuyAccounts.id, accountId)).get();
      if (!eligibility || (discardIncorrectRegistration ? !eligibility.canDiscard : eligibility.code)) throw new DomainError(discardIncorrectRegistration ? "Esta conta tem uso, vínculo ou histórico que impede anular o cadastro. Não é possível apagar dinheiro ou movimentações reais por este caminho." : accountDeletionBlockMessage(eligibility?.code ?? "ACCOUNT_HAS_HISTORY")!, 409, discardIncorrectRegistration ? "ACCOUNT_DISCARD_INELIGIBLE" : eligibility?.code ?? "ACCOUNT_HAS_HISTORY");
      const state = await calculateLedgerState(tx, account);
      if (!state.reconciled || (!discardIncorrectRegistration && (state.ledgerBalanceCnyMinor !== 0 || state.rights.length)) || (account.status !== "reconciling" && state.ledgerBalanceCnyMinor !== account.balanceCnyMinor)) throw new DomainError("O saldo e os direitos precisam ser conferidos antes de excluir.", 409, "BALANCE_RECONCILIATION_REQUIRED");
      const now = new Date(), operationId = crypto.randomUUID();
      if (discardIncorrectRegistration) {
        await tx.insert(financialOperations).values({ id: operationId, workspaceId: account.workspaceId, operationType, idempotencyKey: value.idempotencyKey,
          payloadHash, actorId: userId, occurredAt: null, recordedAt: now, reason: value.reason, reversalOfId: null,
          contextJson: JSON.stringify({ accountId, accountRevision: account.revision, confirmedIncorrectRegistration: true, reversedCnyMinor: state.ledgerBalanceCnyMinor, originalEntryIds: state.entries.map(entry => entry.id) }) }).run();
        let sequence = state.entries.at(-1)?.sequence ?? -1;
        for (const entry of state.entries) {
          const debitId = crypto.randomUUID();
          await tx.insert(hubbuyBalanceEntries).values({ id: debitId, accountId, operationId, sequence: ++sequence, direction: "debit", amountCnyMinor: entry.amountCnyMinor,
            historicalBrlCents: entry.historicalBrlCents, sourceType: "reversal", sourceId: entry.id, reversalOfEntryId: entry.id, createdAt: now }).run();
          const shares = state.shares.filter(share => share.creditEntryId === entry.id);
          if (shares.length) await tx.insert(hubbuyBalanceConsumptions).values(shares.map((share, allocationOrder) => ({ id: crypto.randomUUID(), debitEntryId: debitId, creditShareId: share.id, allocationOrder,
            amountCnyMinor: share.amountCnyMinor, historicalBrlCents: share.historicalBrlCents, paymentAllocationId: null, createdAt: now }))).run();
        }
        const reversed = await calculateLedgerState(tx, account);
        if (!reversed.reconciled || reversed.ledgerBalanceCnyMinor !== 0 || reversed.rights.some(right => right.availableCnyMinor || right.availableHistoricalBrlCents)) throw new DomainError("O estorno da conciliação não fechou. Nenhuma alteração foi mantida.", 409, "ACCOUNT_REVERSAL_MISMATCH");
      }
      const updated = await tx.update(hubbuyAccounts).set({ status: "archived", balanceCnyMinor: 0, deletedAt: now, deletedBy: userId, updatedAt: now, updatedBy: userId, revision: account.revision + 1 })
        .where(and(eq(hubbuyAccounts.id, accountId), eq(hubbuyAccounts.revision, value.expectedRevision), isNull(hubbuyAccounts.deletedAt))).returning({ id: hubbuyAccounts.id }).get();
      if (!updated) throw new DomainError("A conta mudou durante a exclusão. Atualize a tela e tente novamente.", 409, "ACCOUNT_REVISION_CONFLICT");
      if (!discardIncorrectRegistration) await tx.insert(financialOperations).values({ id: operationId, workspaceId: account.workspaceId, operationType, idempotencyKey: value.idempotencyKey,
        payloadHash, actorId: userId, occurredAt: null, recordedAt: now, reason: value.reason, reversalOfId: null, contextJson: JSON.stringify({ accountId }) }).run();
      return { accountId, operationId, replayed: false };
    }).catch(async error => {
      // A competing identical command may have committed while this connection
      // exhausted a transient/uncertain-commit retry. Recover only its durable
      // operation, after authorization and payload verification, without writing.
      if (!isDatabaseBusy(error) && !isUniqueConstraint(error)) throw error;
      const retained = await db.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, accountId)).get();
      if (!retained) throw error;
      await authorization(db, userId).requireWorkspaceMember(retained.workspaceId);
      const existing = await findIdempotentOperation(db, retained.workspaceId, value.idempotencyKey);
      if (!existing) throw error;
      assertIdempotent(existing, operationType, payloadHash);
      if (!retained.deletedAt) throw error;
      return { accountId, operationId: existing.id, replayed: true };
    });
  }

  async function listAccounts(workspaceId?: string) {
    return db.transaction(async tx => {
      const membership = await authorization(tx, userId).requireWorkspaceMember(workspaceId);
      const rows = await tx.select({ account: hubbuyAccounts, deletionBlockCode: accountDeletionBlockCode, canDiscard: accountDiscardEligible }).from(hubbuyAccounts).where(and(eq(hubbuyAccounts.workspaceId, membership.workspaceId), isNull(hubbuyAccounts.deletedAt))).orderBy(asc(hubbuyAccounts.createdAt)).all();
      const accounts = rows.map(({ account, deletionBlockCode, canDiscard }) => ({ ...account, canDelete: deletionBlockCode === null, canDiscardIncorrectRegistration: !!canDiscard, deletionBlockCode, deletionBlockReason: accountDeletionBlockMessage(deletionBlockCode) }));
      const accountIds = accounts.map(account => account.id);
      if (!accountIds.length) return [];
      const [entries, runs, events] = await Promise.all([
        tx.select({ accountId: hubbuyBalanceEntries.accountId }).from(hubbuyBalanceEntries).where(inArray(hubbuyBalanceEntries.accountId, accountIds)).all(),
        tx.select({ accountId: hubbuyReconciliationRuns.accountId }).from(hubbuyReconciliationRuns).where(inArray(hubbuyReconciliationRuns.accountId, accountIds)).all(),
        tx.select({ accountId: hubbuyReconciliationEvents.accountId }).from(hubbuyReconciliationEvents).where(inArray(hubbuyReconciliationEvents.accountId, accountIds)).all(),
      ]);
      const withEntries = new Set(entries.map(row => row.accountId)), withRuns = new Set(runs.map(row => row.accountId)), withEvents = new Set(events.map(row => row.accountId));
      return accounts.map(account => ({ ...account, canActivateWithZero: account.status === "reconciling" && account.balanceCnyMinor === 0 && !withEntries.has(account.id) && !withRuns.has(account.id) && !withEvents.has(account.id) }));
    });
  }

  async function getAccountBalance(accountId: string) {
    return db.transaction(async tx => {
      const account = await requireAccount(tx, userId, accountId);
      const state = await calculateLedgerState(tx, account);
      const products = await readRefundProductOrigins(tx, account, state.entries.filter(entry => entry.sourceType === "refund_received").map(entry => entry.sourceId));
      const adjustments = await tx.select({ entryId: hubbuyBalanceAdjustments.balanceEntryId, kind: hubbuyBalanceAdjustments.kind, reason: financialOperations.reason }).from(hubbuyBalanceAdjustments).innerJoin(financialOperations, eq(financialOperations.id, hubbuyBalanceAdjustments.operationId)).where(eq(hubbuyBalanceAdjustments.accountId, accountId)).all();
      const reconciliation = await tx.select().from(hubbuyReconciliationRuns).where(eq(hubbuyReconciliationRuns.accountId, accountId)).get();
      const reconciliationEvents = await tx.select().from(hubbuyReconciliationEvents).where(eq(hubbuyReconciliationEvents.accountId, accountId)).orderBy(asc(hubbuyReconciliationEvents.occurredAt), asc(hubbuyReconciliationEvents.recordedAt)).all();
      return {
        account,
        ledgerBalanceCnyMinor: state.ledgerBalanceCnyMinor,
        reconciled: state.reconciled && state.ledgerBalanceCnyMinor === account.balanceCnyMinor,
        rights: presentIndividualRights(state.rights, state.availableShares, state.entries, products, adjustments),
        traceability: presentBalanceTraceability(state, await readBalanceTraceContext(tx, account, products, adjustments)),
        reconciliation: reconciliation ? { ...reconciliation, events: reconciliationEvents } : null,
      };
    });
  }

  async function readStatement(accountId: string, options: { afterSequence?: number; limit?: number; order?: "asc" | "desc" } = {}) {
    const afterSequence = options.afterSequence ?? -1;
    const limit = options.limit ?? 50;
    const descending = options.order === "desc";
    if (options.order !== undefined && options.order !== "asc" && options.order !== "desc") throw new DomainError("Ordenação inválida.", 400);
    if (!Number.isSafeInteger(afterSequence) || afterSequence < -1) throw new DomainError("Cursor de extrato inválido.", 400);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new DomainError("O limite do extrato deve ficar entre 1 e 100 linhas.", 400);
    return db.transaction(async tx => {
      const account = await requireAccount(tx, userId, accountId);
      const selected = await tx.select({ entry: hubbuyBalanceEntries, operation: financialOperations })
        .from(hubbuyBalanceEntries).leftJoin(financialOperations, eq(hubbuyBalanceEntries.operationId, financialOperations.id))
        .where(afterSequence < 0
          ? eq(hubbuyBalanceEntries.accountId, account.id)
          : and(eq(hubbuyBalanceEntries.accountId, account.id), (descending ? lt : gt)(hubbuyBalanceEntries.sequence, afterSequence)))
        .orderBy((descending ? desc : asc)(hubbuyBalanceEntries.sequence)).limit(limit + 1).all();
      const hasMore = selected.length > limit;
      const page = hasMore ? selected.slice(0, limit) : selected;
      const adjustments = await tx.select().from(hubbuyBalanceAdjustments).where(eq(hubbuyBalanceAdjustments.accountId, accountId)).all();
      const actors = page.length ? await tx.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, page.flatMap(row => row.operation ? [row.operation.actorId] : []))).all() : [];
      const uses = await tx.select({ creditEntryId: hubbuyBalanceCreditShares.creditEntryId }).from(hubbuyBalanceConsumptions).innerJoin(hubbuyBalanceCreditShares, eq(hubbuyBalanceCreditShares.id, hubbuyBalanceConsumptions.creditShareId)).innerJoin(hubbuyBalanceEntries, eq(hubbuyBalanceEntries.id, hubbuyBalanceCreditShares.creditEntryId)).where(eq(hubbuyBalanceEntries.accountId, accountId)).all();
      const previous = descending || afterSequence < 0 ? [] : await tx.select().from(hubbuyBalanceEntries).where(and(eq(hubbuyBalanceEntries.accountId, account.id), lte(hubbuyBalanceEntries.sequence, afterSequence))).all();
      const allEntries = descending ? await tx.select().from(hubbuyBalanceEntries).where(eq(hubbuyBalanceEntries.accountId, account.id)).orderBy(asc(hubbuyBalanceEntries.sequence)).all() : [];
      const balances = new Map<number, number>();
      let running = 0;
      for (const row of allEntries) { running += row.direction === "credit" ? row.amountCnyMinor : -row.amountCnyMinor; balances.set(row.sequence, running); }
      let balance = previous.reduce((sum, row) => sum + (row.direction === "credit" ? row.amountCnyMinor : -row.amountCnyMinor), 0);
      const entries = page.map(({ entry, operation }) => {
        balance += entry.direction === "credit" ? entry.amountCnyMinor : -entry.amountCnyMinor;
        const adjustment = adjustments.find(row => row.balanceEntryId === entry.id);
        const reversedBy = adjustment ? adjustments.find(row => row.reversesAdjustmentId === adjustment.id) : undefined;
        const context = adjustment && operation ? JSON.parse(operation.contextJson) as { result?: { shares?: { personId: string; amountCnyMinor: number; historicalBrlCents: number }[] } } : null;
        return { ...entry, occurredAt: operation?.occurredAt ?? null, operationRecordedAt: operation?.recordedAt ?? null, operationType: operation?.operationType ?? null, reason: operation?.reason ?? null, balanceAfterCnyMinor: descending ? balances.get(entry.sequence)! : balance,
          actorName: actors.find(row => row.id === operation?.actorId)?.name ?? null,
          adjustment: adjustment ? { ...adjustment, reversedById: reversedBy?.id ?? null, canReverse: adjustment.kind !== "reversal" && !reversedBy && account.status === "active" && (entry.direction === "debit" || !uses.some(row => row.creditEntryId === entry.id)), shares: context?.result?.shares ?? [] } : null };
      });
      return { accountId, entries, nextAfterSequence: hasMore ? page.at(-1)!.entry.sequence : null };
    });
  }

  const discardIncorrectAccount = (accountId: string, input: unknown) => deleteAccount(accountId, input, true);
  return { createAccount, activateEmptyAccountAtZero, startReconciliation, recordReconciliationEvent, reconcileAccount, archiveAccount, deleteAccount, discardIncorrectAccount, listAccounts, getAccountBalance, readStatement, ...manualBalanceAdjustmentServices(db, userId, transact, calculateHubBuyBalanceState) };
}
