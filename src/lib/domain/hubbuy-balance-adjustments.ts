import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../db/connection";
import { financialOperations, hubbuyAccounts, hubbuyBalanceAdjustments, hubbuyBalanceConsumptions, hubbuyBalanceCreditShares, hubbuyBalanceEntries } from "../db/schema";
import { authorization } from "./authorization";
import { DomainError } from "./errors";
import { MAX_FINANCIAL_MINOR } from "./financial-money";
import { previewFifoConsumption } from "./hubbuy-balance-calculations";
import type { calculateHubBuyBalanceState } from "./hubbuy-balance-services";
import type { CostTransaction } from "./purchase-cost-initialization";

const minor = z.number().int().min(0).max(MAX_FINANCIAL_MINOR);
const positive = minor.min(1);
const share = z.object({ personId: z.string().min(1), amountCnyMinor: positive }).strict();
const common = {
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  idempotencyKey: z.string().trim().min(1).max(200),
  occurredAt: z.iso.datetime({ offset: true }), reason: z.string().trim().min(1).max(1000),
};
const original = { ...common, amountCnyMinor: positive, externalReference: z.string().trim().min(1).max(200).nullable().optional() };
const commandSchema = z.discriminatedUnion("kind", [
  z.object({ ...original, kind: z.literal("promotional_bonus"), shares: z.array(share).min(1).max(100) }).strict(),
  z.object({ ...original, kind: z.literal("documented_credit"), shares: z.array(share.extend({ historicalBrlCents: minor }).strict()).min(1).max(100) }).strict(),
  z.object({ ...original, kind: z.literal("documented_debit"), shares: z.array(share).min(1).max(100) }).strict(),
]);
const reversalSchema = z.object({ ...common, adjustmentId: z.string().min(1) }).strict();
export type AdjustmentCommand = z.infer<typeof commandSchema>;
export type AdjustmentReversalCommand = z.infer<typeof reversalSchema>;
export type AdjustmentPreview = {
  accountId: string; accountRevision: number; kind: AdjustmentCommand["kind"] | "reversal";
  direction: "credit" | "debit"; amountCnyMinor: number; historicalBrlCents: number;
  balanceBeforeCnyMinor: number; balanceAfterCnyMinor: number;
  shares: { personId: string; amountCnyMinor: number; historicalBrlCents: number }[];
  reason: string; occurredAt: string; externalReference: string | null;
};
type State = Awaited<ReturnType<typeof calculateHubBuyBalanceState>>;
type Consumption = { creditShareId: string; amountCnyMinor: number; historicalBrlCents: number };
type Prepared = { preview: AdjustmentPreview; consumptions: Consumption[]; original?: typeof hubbuyBalanceAdjustments.$inferSelect };
type Result = AdjustmentPreview & { operationId: string; adjustmentId: string; balanceEntryId: string; replayed: boolean };
type Transact = <T>(fn: (tx: CostTransaction) => Promise<T>) => Promise<T>;

function bounded(value: bigint) {
  if (value < 0n || value > BigInt(MAX_FINANCIAL_MINOR)) throw new DomainError("O ajuste excede os limites financeiros da conta.", 400);
  return Number(value);
}
const fail = (message: string, code: string) => new DomainError(message, 409, code);

export function manualBalanceAdjustmentServices(db: AppDatabase, actorId: string, transact: Transact, readState: typeof calculateHubBuyBalanceState) {
  async function accountState(tx: CostTransaction, accountId: string) {
    const account = await tx.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, accountId)).get();
    if (!account || account.deletedAt) throw new DomainError("Conta HubBuy não encontrada.", 404);
    await authorization(tx, actorId).requireWorkspaceMember(account.workspaceId);
    return readState(tx, accountId);
  }
  function editable(state: State, revision: number) {
    if (state.account.revision !== revision) throw fail("A conta mudou. Atualize e confira uma nova prévia.", "BALANCE_REVISION_CONFLICT");
    if (state.account.status !== "active" || !state.reconciled || state.ledgerBalanceCnyMinor !== state.account.balanceCnyMinor) throw fail("A conta precisa estar ativa e conciliada para registrar ajustes.", "BALANCE_RECONCILIATION_REQUIRED");
  }
  async function prepare(tx: CostTransaction, state: State, value: AdjustmentCommand | AdjustmentReversalCommand): Promise<Prepared> {
    editable(state, value.expectedRevision);
    let kind: AdjustmentPreview["kind"], direction: "credit" | "debit", externalReference: string | null = null;
    let amount: number, shares: AdjustmentPreview["shares"] = [], consumptions: Consumption[] = [];
    let originalAdjustment: Prepared["original"];
    if ("adjustmentId" in value) {
      kind = "reversal";
      originalAdjustment = await tx.select().from(hubbuyBalanceAdjustments).where(and(eq(hubbuyBalanceAdjustments.id, value.adjustmentId), eq(hubbuyBalanceAdjustments.accountId, state.account.id))).get();
      if (!originalAdjustment || originalAdjustment.kind === "reversal") throw fail("Este lançamento não é um ajuste manual elegível.", "ADJUSTMENT_INELIGIBLE");
      if (await tx.select().from(hubbuyBalanceAdjustments).where(eq(hubbuyBalanceAdjustments.reversesAdjustmentId, originalAdjustment.id)).get()) throw fail("Este ajuste já foi anulado.", "ADJUSTMENT_ALREADY_REVERSED");
      const entry = state.entries.find(row => row.id === originalAdjustment!.balanceEntryId);
      if (!entry || entry.historicalBrlCents === null) throw fail("A origem do ajuste está inconsistente.", "ADJUSTMENT_INELIGIBLE");
      amount = entry.amountCnyMinor;
      direction = entry.direction === "credit" ? "debit" : "credit";
      if (entry.direction === "credit") {
        const originals = state.shares.filter(row => row.creditEntryId === entry.id);
        if (state.consumptions.some(row => originals.some(s => s.id === row.creditShareId))) throw fail("Este crédito já foi consumido e não pode ser anulado. Confira os pagamentos no histórico.", "ADJUSTMENT_CREDIT_CONSUMED");
        shares = originals.map(row => ({ personId: row.personId, amountCnyMinor: row.amountCnyMinor, historicalBrlCents: row.historicalBrlCents }));
        consumptions = originals.map(row => ({ creditShareId: row.id, amountCnyMinor: row.amountCnyMinor, historicalBrlCents: row.historicalBrlCents }));
      } else {
        const owners = new Map<string, AdjustmentPreview["shares"][number]>();
        for (const use of state.consumptions.filter(row => row.debitEntryId === entry.id)) {
          const owner = state.shares.find(row => row.id === use.creditShareId);
          if (!owner) throw fail("O titular original não foi encontrado.", "ADJUSTMENT_INELIGIBLE");
          const row = owners.get(owner.personId) ?? { personId: owner.personId, amountCnyMinor: 0, historicalBrlCents: 0 };
          row.amountCnyMinor = bounded(BigInt(row.amountCnyMinor) + BigInt(use.amountCnyMinor));
          row.historicalBrlCents = bounded(BigInt(row.historicalBrlCents) + BigInt(use.historicalBrlCents));
          owners.set(owner.personId, row);
        }
        shares = [...owners.values()];
      }
      if (shares.reduce((sum, row) => sum + BigInt(row.amountCnyMinor), 0n) !== BigInt(amount) || shares.reduce((sum, row) => sum + BigInt(row.historicalBrlCents), 0n) !== BigInt(entry.historicalBrlCents)) throw fail("As parcelas originais não fecham com o ajuste.", "ADJUSTMENT_INELIGIBLE");
    } else {
      kind = value.kind; amount = value.amountCnyMinor; externalReference = value.externalReference ?? null;
      direction = kind === "documented_debit" ? "debit" : "credit";
      if (new Set(value.shares.map(row => row.personId)).size !== value.shares.length || value.shares.reduce((sum, row) => sum + BigInt(row.amountCnyMinor), 0n) !== BigInt(amount)) throw fail("As parcelas individuais devem fechar exatamente o valor CNY, sem pessoas repetidas.", "BALANCE_SHARES_MISMATCH");
      await authorization(tx, actorId).requireWorkspaceMembers(value.shares.map(row => row.personId), state.account.workspaceId);
      if (externalReference) {
        const adjustments = await tx.select().from(hubbuyBalanceAdjustments).where(eq(hubbuyBalanceAdjustments.accountId, state.account.id)).all();
        if (adjustments.some(row => row.externalReference === externalReference && !adjustments.some(reverse => reverse.reversesAdjustmentId === row.id))) throw fail("Esta referência já foi registrada nesta conta.", "ADJUSTMENT_REFERENCE_DUPLICATE");
      }
      for (const part of value.shares) {
        if (direction === "credit") {
          shares.push({ ...part, historicalBrlCents: "historicalBrlCents" in part ? part.historicalBrlCents : 0 });
        } else {
          const entryOrder = new Map(state.entries.map(row => [row.id, row.sequence]));
          const lots = state.availableShares.filter(row => row.personId === part.personId).sort((a, b) => (entryOrder.get(a.creditEntryId)! - entryOrder.get(b.creditEntryId)!) || a.id.localeCompare(b.id));
          let fifo: ReturnType<typeof previewFifoConsumption>;
          try { fifo = previewFifoConsumption(part.amountCnyMinor, lots.map((row, sequence) => ({ creditId: row.id, sequence, availableCnyMinor: row.availableCnyMinor, availableHistoricalBrlCents: row.availableHistoricalBrlCents }))); }
          catch { throw fail("O saldo disponível de uma das pessoas é insuficiente para esta saída.", "BALANCE_INSUFFICIENT"); }
          shares.push({ ...part, historicalBrlCents: fifo.historicalBrlCents });
          consumptions.push(...fifo.consumptions.map(row => ({ creditShareId: row.creditId, amountCnyMinor: row.cnyMinor, historicalBrlCents: row.historicalBrlCents })));
        }
      }
    }
    shares.sort((a, b) => a.personId.localeCompare(b.personId));
    const historicalBrlCents = bounded(shares.reduce((sum, row) => sum + BigInt(row.historicalBrlCents), 0n));
    if (direction === "credit") {
      bounded(state.rights.reduce((sum, row) => sum + BigInt(row.availableHistoricalBrlCents), 0n) + BigInt(historicalBrlCents));
      await authorization(tx, actorId).requireWorkspaceMembers(shares.map(row => row.personId), state.account.workspaceId);
    }
    const balanceAfterCnyMinor = bounded(BigInt(state.account.balanceCnyMinor) + (direction === "credit" ? BigInt(amount) : -BigInt(amount)));
    return { original: originalAdjustment, consumptions, preview: { accountId: state.account.id, accountRevision: state.account.revision, kind, direction, amountCnyMinor: amount, historicalBrlCents, balanceBeforeCnyMinor: state.account.balanceCnyMinor, balanceAfterCnyMinor, shares, reason: value.reason, occurredAt: value.occurredAt, externalReference } };
  }
  function parse(input: unknown, reverse: boolean) {
    if (reverse) { const command = reversalSchema.parse(input); return { ...command, occurredAt: new Date(command.occurredAt).toISOString() }; }
    const command = commandSchema.parse(input);
    return { ...command, occurredAt: new Date(command.occurredAt).toISOString(), externalReference: command.externalReference ?? null, shares: [...command.shares].sort((a, b) => a.personId.localeCompare(b.personId)) } as AdjustmentCommand;
  }
  async function execute(accountId: string, input: unknown, reverse: boolean, previewOnly: boolean): Promise<AdjustmentPreview | Result> {
    const value = parse(input, reverse);
    const payloadHash = createHash("sha256").update(JSON.stringify({ accountId, ...value })).digest("hex");
    const operationType = reverse ? "account_manual_adjustment_reversed" : "kind" in value && value.kind === "documented_debit" ? "account_manual_debit_recorded" : "account_manual_credit_recorded";
    async function replay(tx: Pick<AppDatabase, "select">, workspaceId: string): Promise<Result | null> {
      const existing = await tx.select().from(financialOperations).where(and(eq(financialOperations.workspaceId, workspaceId), eq(financialOperations.idempotencyKey, value.idempotencyKey))).get();
      if (!existing) return null;
      if (existing.operationType !== operationType || existing.payloadHash !== payloadHash) throw fail("Esta chave já foi usada com outros dados.", "IDEMPOTENCY_CONFLICT");
      const context = JSON.parse(existing.contextJson) as { result: Result };
      return { ...context.result, replayed: true };
    }
    return transact(async tx => {
      const state = await accountState(tx, accountId);
      if (!previewOnly) { const prior = await replay(tx, state.account.workspaceId); if (prior) return prior; }
      const prepared = await prepare(tx, state, value);
      if (previewOnly) return prepared.preview;
      const now = new Date(), operationId = crypto.randomUUID(), adjustmentId = crypto.randomUUID(), balanceEntryId = crypto.randomUUID();
      const { preview, consumptions } = prepared;
      const result: Result = { ...preview, accountRevision: state.account.revision + 1, operationId, adjustmentId, balanceEntryId, replayed: false };
      await tx.insert(financialOperations).values({ id: operationId, workspaceId: state.account.workspaceId, operationType, idempotencyKey: value.idempotencyKey, payloadHash, actorId, occurredAt: new Date(value.occurredAt), recordedAt: now, reason: value.reason, reversalOfId: prepared.original?.operationId ?? null, contextJson: JSON.stringify({ accountId, result }) }).run();
      await tx.insert(hubbuyBalanceEntries).values({ id: balanceEntryId, accountId, operationId, sequence: Math.max(-1, ...state.entries.map(row => row.sequence)) + 1, direction: preview.direction, amountCnyMinor: preview.amountCnyMinor, historicalBrlCents: preview.historicalBrlCents, sourceType: reverse ? "reversal" : "manual_adjustment", sourceId: `manual-adjustment:${adjustmentId}`, reversalOfEntryId: prepared.original?.balanceEntryId ?? null, createdAt: now }).run();
      if (preview.direction === "credit") await tx.insert(hubbuyBalanceCreditShares).values(preview.shares.map((row, allocationOrder) => ({ ...row, id: crypto.randomUUID(), creditEntryId: balanceEntryId, allocationOrder }))).run();
      else await tx.insert(hubbuyBalanceConsumptions).values(consumptions.map((row, allocationOrder) => ({ ...row, id: crypto.randomUUID(), debitEntryId: balanceEntryId, allocationOrder, paymentAllocationId: null, createdAt: now }))).run();
      await tx.insert(hubbuyBalanceAdjustments).values({ id: adjustmentId, accountId, operationId, balanceEntryId, kind: preview.kind, externalReference: preview.externalReference, reversesAdjustmentId: prepared.original?.id ?? null }).run();
      const updated = await tx.update(hubbuyAccounts).set({ balanceCnyMinor: preview.balanceAfterCnyMinor, revision: result.accountRevision, updatedBy: actorId, updatedAt: now }).where(and(eq(hubbuyAccounts.id, accountId), eq(hubbuyAccounts.revision, value.expectedRevision), eq(hubbuyAccounts.status, "active"), isNull(hubbuyAccounts.deletedAt))).returning().get();
      if (!updated) throw fail("A conta mudou durante o registro. Confira uma nova prévia.", "BALANCE_REVISION_CONFLICT");
      const checked = await readState(tx, accountId);
      if (!checked.reconciled || checked.ledgerBalanceCnyMinor !== updated.balanceCnyMinor) throw fail("O ajuste não conciliou o saldo e os direitos.", "BALANCE_RECONCILIATION_REQUIRED");
      return result;
    }).catch(async error => {
      // A competing commit can win a UNIQUE constraint; only its exact command is a replay.
      if (previewOnly || error instanceof DomainError || error instanceof z.ZodError) throw error;
      const account = await db.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, accountId)).get();
      if (!account || account.deletedAt) throw error;
      await authorization(db, actorId).requireWorkspaceMember(account.workspaceId);
      const prior = await replay(db, account.workspaceId);
      if (prior) return prior;
      if (String(error).includes("adjustment reference already recorded") || String((error as { cause?: unknown }).cause).includes("adjustment reference already recorded")) throw fail("Esta referência já foi registrada nesta conta.", "ADJUSTMENT_REFERENCE_DUPLICATE");
      throw error;
    });
  }
  return {
    previewManualAdjustment: (id: string, input: unknown) => execute(id, input, false, true) as Promise<AdjustmentPreview>,
    recordManualAdjustment: (id: string, input: unknown) => execute(id, input, false, false) as Promise<Result>,
    previewManualAdjustmentReversal: (id: string, input: unknown) => execute(id, input, true, true) as Promise<AdjustmentPreview>,
    reverseManualAdjustment: (id: string, input: unknown) => execute(id, input, true, false) as Promise<Result>,
  };
}
