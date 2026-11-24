import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../db/connection";
import * as s from "../db/schema";
import * as t from "../db/topup-schema";
import { authorization } from "./authorization";
import { DomainError } from "./errors";
import { calculateHubBuyBalanceState } from "./hubbuy-balance-services";
import { calculateTopup, principalFromTopupTotal } from "./hubbuy-topup-calculations";
import { MAX_FINANCIAL_MINOR } from "./financial-money";
import type { CostTransaction } from "./purchase-cost-initialization";
import { serializeDomainTransaction } from "./transaction-lock";
import {recoverTopupPrincipal} from "./topup-recovery";
import { topupFeeAllocations } from "../db/freight-schema";
import { usesFreightFinance } from "./orders-workflow";

const minor = z.number().int().min(0).max(MAX_FINANCIAL_MINOR);
const common = {
  expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1),
  idempotencyKey: z.string().trim().min(1).max(200), occurredAt: z.iso.datetime({ offset: true }),
  reason: z.string().trim().min(1).max(1000),
};
const fee = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("percentage"), bps: z.number().int().min(0).max(10000) }).strict(),
  z.object({ mode: z.literal("effective"), reason: z.string().trim().min(1).max(1000) }).strict(),
]);
const recordSchema = z.object({
  ...common, cnyMinor: minor.min(1), method: z.enum(["pix", "card"]),
  receipt: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("principal_and_fee"), principalBrlCents: minor.min(1), feeBrlCents: minor }).strict(),
    z.object({ mode: z.literal("total_with_fee"), totalBrlCents: minor.min(1) }).strict(),
  ]), fee,
  funders: z.array(z.object({ personId: z.string().min(1), cnyMinor: minor, principalBrlCents: minor, feeBrlCents: minor }).strict()).min(1).max(100),
  externalReference: z.string().trim().min(1).max(200).nullable(),
  confirmedNoReference: z.boolean(), confirmedReceived: z.literal(true),
}).strict();
const reverseSchema = z.object({ ...common, topupId: z.string().min(1), confirmedRegistrationError: z.literal(true) }).strict();
export type TopupCommand = z.infer<typeof recordSchema>;
export type TopupReverseCommand = z.infer<typeof reverseSchema>;
const conflict = (message: string, code: string) => new DomainError(message, 409, code);

function busy(error: unknown, seen = new Set<unknown>()): boolean {
  if (!error || typeof error !== "object" || seen.has(error)) return false;
  seen.add(error);
  const value = error as { code?: string; message?: string; cause?: unknown };
  return /SQLITE_BUSY|SQLITE_LOCKED|database is locked/.test(`${value.code} ${value.message}`) || busy(value.cause, seen);
}

export function hubbuyTopupServices(db: AppDatabase, actorId: string, expectedWorkspaceId: string) {
  async function transact<T>(operation: (tx: CostTransaction) => Promise<T>) {
    return serializeDomainTransaction(async () => {
      for (let attempt = 0; ; attempt++) {
        try { return await db.transaction(operation); }
        catch (error) {
          if (!busy(error) || attempt >= 6) throw error;
          await new Promise(resolve => setTimeout(resolve, Math.min(500, 25 * 2 ** attempt)));
        }
      }
    });
  }
  async function state(tx: CostTransaction, accountId: string) {
    const account = await tx.select().from(s.hubbuyAccounts).where(eq(s.hubbuyAccounts.id, accountId)).get();
    if (!account || account.deletedAt) throw new DomainError("Conta HubBuy não encontrada.", 404);
    await authorization(tx, actorId).requireActiveWorkspaceContext(account.workspaceId);
    if (account.workspaceId !== expectedWorkspaceId) throw conflict("O espaço ativo mudou. Atualize a página.", "WORKSPACE_CONTEXT_CHANGED");
    return calculateHubBuyBalanceState(tx, accountId);
  }
  function editable(current: Awaited<ReturnType<typeof state>>, revision: number) {
    if (current.account.revision !== revision) throw conflict("A conta mudou. Confira uma nova prévia.", "BALANCE_REVISION_CONFLICT");
    if (current.account.status !== "active" || !current.reconciled || current.ledgerBalanceCnyMinor !== current.account.balanceCnyMinor) throw conflict("A conta precisa estar ativa e conciliada.", "BALANCE_RECONCILIATION_REQUIRED");
  }
  async function replay(tx: Pick<AppDatabase, "select">, key: string, operationType: string, hash: string) {
    const prior = await tx.select().from(s.financialOperations).where(and(eq(s.financialOperations.workspaceId, expectedWorkspaceId), eq(s.financialOperations.idempotencyKey, key))).get();
    if (!prior) return null;
    if (prior.operationType !== operationType || prior.payloadHash !== hash) throw conflict("Esta chave já foi usada com outros dados.", "IDEMPOTENCY_CONFLICT");
    return { ...JSON.parse(prior.contextJson).result, replayed: true };
  }
  async function recover(accountId: string, key: string, operationType: string, hash: string, error: unknown) {
    // A local libSQL commit may be uncertain. Recover only a durable, identical
    // operation after reauthorizing both resource and active context.
    if (!busy(error)) throw error;
    const account = await db.select().from(s.hubbuyAccounts).where(eq(s.hubbuyAccounts.id, accountId)).get();
    if (!account || account.deletedAt) throw error;
    await authorization(db, actorId).requireActiveWorkspaceContext(account.workspaceId);
    if (account.workspaceId !== expectedWorkspaceId) throw conflict("O espaço ativo mudou. Atualize a página.", "WORKSPACE_CONTEXT_CHANGED");
    const prior = await replay(db, key, operationType, hash);
    if (!prior) throw error;
    return prior;
  }
  async function record(accountId: string, input: unknown, previewOnly = false) {
    const parsed = recordSchema.parse(input);
    const value = { ...parsed, occurredAt: new Date(parsed.occurredAt).toISOString(), funders: [...parsed.funders].sort((a, b) => a.personId.localeCompare(b.personId)) };
    let receipt: { principalBrlCents: number; feeBrlCents: number };
    try {
      if (value.receipt.mode === "total_with_fee") {
        if (value.fee.mode !== "percentage") throw new Error("Discrimine principal e taxa efetiva do comprovante.");
        receipt = principalFromTopupTotal(value.receipt.totalBrlCents, value.fee.bps);
      } else receipt = value.receipt;
    } catch (error) { throw new DomainError(error instanceof Error ? error.message : "Comprovante inválido.", 400); }
    let calculated: ReturnType<typeof calculateTopup>;
    try { calculated = calculateTopup({ ...value, ...receipt }); }
    catch (error) { throw new DomainError(error instanceof Error ? error.message : "Recarga inválida.", 400); }
    if (!value.externalReference && !value.confirmedNoReference) throw new DomainError("Confira explicitamente a ausência de referência externa.", 400);
    const hash = createHash("sha256").update(JSON.stringify({ accountId, ...value })).digest("hex");
    return transact(async tx => {
      const current = await state(tx, accountId);
      if (!previewOnly) { const prior = await replay(tx, value.idempotencyKey, "hubbuy_topup_recorded", hash); if (prior) return prior; }
      editable(current, value.expectedRevision);
      await authorization(tx, actorId).requireWorkspaceMembers(value.funders.map(row => row.personId), current.account.workspaceId);
      if (value.externalReference) {
        const [topup, adjustment, event] = await Promise.all([
          tx.select({ id: t.hubbuyTopups.id }).from(t.hubbuyTopups).where(and(eq(t.hubbuyTopups.accountId, accountId), eq(t.hubbuyTopups.externalReference, value.externalReference))).get(),
          tx.select({ id: s.hubbuyBalanceAdjustments.id }).from(s.hubbuyBalanceAdjustments).where(and(eq(s.hubbuyBalanceAdjustments.accountId, accountId), eq(s.hubbuyBalanceAdjustments.externalReference, value.externalReference))).get(),
          tx.select({ id: s.hubbuyReconciliationEvents.id }).from(s.hubbuyReconciliationEvents).where(and(eq(s.hubbuyReconciliationEvents.accountId, accountId), eq(s.hubbuyReconciliationEvents.sourceReference, value.externalReference))).get(),
        ]);
        if (topup || adjustment || event) throw conflict("Esta referência já foi registrada nesta conta.", "FINANCIAL_REFERENCE_DUPLICATE");
      }
      const balanceAfter = current.account.balanceCnyMinor + calculated.cnyMinor;
      const historicalAfter = current.rights.reduce((sum, row) => sum + BigInt(row.availableHistoricalBrlCents), 0n) + BigInt(calculated.principalBrlCents);
      if (balanceAfter > MAX_FINANCIAL_MINOR || historicalAfter > BigInt(MAX_FINANCIAL_MINOR)) throw new DomainError("A recarga excede os limites da conta.", 400);
      const preview = { accountId, accountRevision: current.account.revision, balanceBeforeCnyMinor: current.account.balanceCnyMinor, balanceAfterCnyMinor: balanceAfter, ...calculated, method: value.method, fee: value.fee, occurredAt: value.occurredAt, externalReference: value.externalReference, reason: value.reason };
      if (previewOnly) return preview;
      const now = new Date(), topupId = randomUUID(), operationId = randomUUID(), creditEntryId = randomUUID();
      const result = { ...preview, topupId, operationId, creditEntryId, accountRevision: current.account.revision + 1, replayed: false };
      await tx.insert(s.financialOperations).values({ id: operationId, workspaceId: expectedWorkspaceId, operationType: "hubbuy_topup_recorded", idempotencyKey: value.idempotencyKey, payloadHash: hash, actorId, occurredAt: new Date(value.occurredAt), recordedAt: now, reason: value.reason, contextJson: JSON.stringify({ accountId, result }) }).run();
      await tx.insert(s.hubbuyBalanceEntries).values({ id: creditEntryId, accountId, operationId, sequence: (current.entries.at(-1)?.sequence ?? -1) + 1, direction: "credit", amountCnyMinor: calculated.cnyMinor, historicalBrlCents: calculated.principalBrlCents, sourceType: "topup", sourceId: topupId, createdAt: now }).run();
      const funders = value.funders.map(row => ({ ...row, shareId: row.cnyMinor ? randomUUID() : null }));
      const shares = funders.filter(row => row.shareId !== null).map((row, allocationOrder) => ({ id: row.shareId!, creditEntryId, personId: row.personId, allocationOrder, amountCnyMinor: row.cnyMinor, historicalBrlCents: row.principalBrlCents }));
      await tx.insert(s.hubbuyBalanceCreditShares).values(shares).run();
      await tx.insert(t.hubbuyTopups).values({ id: topupId, accountId, operationId, creditEntryId, cnyMinor: calculated.cnyMinor, principalBrlCents: calculated.principalBrlCents, feeBrlCents: calculated.feeBrlCents, method: value.method, feeMode: value.fee.mode, feeBps: value.fee.mode === "percentage" ? value.fee.bps : null, feeReason: value.fee.mode === "effective" ? value.fee.reason : null, externalReference: value.externalReference }).run();
      await tx.insert(t.hubbuyTopupFunders).values(funders.map(row => ({ topupId, personId: row.personId, creditShareId: row.shareId, cnyMinor: row.cnyMinor, principalBrlCents: row.principalBrlCents, feeBrlCents: row.feeBrlCents }))).run();
      const updated = await tx.update(s.hubbuyAccounts).set({ balanceCnyMinor: balanceAfter, revision: result.accountRevision, updatedAt: now, updatedBy: actorId }).where(and(eq(s.hubbuyAccounts.id, accountId), eq(s.hubbuyAccounts.revision, value.expectedRevision), eq(s.hubbuyAccounts.status, "active"), isNull(s.hubbuyAccounts.deletedAt))).returning().get();
      if (!updated || !(await calculateHubBuyBalanceState(tx, accountId)).reconciled) throw conflict("A recarga não conciliou a conta.", "BALANCE_RECONCILIATION_REQUIRED");
      return result;
    }).catch(error => recover(accountId, value.idempotencyKey, "hubbuy_topup_recorded", hash, error));
  }
  async function reverse(accountId: string, input: unknown, previewOnly = false) {
    const parsed = reverseSchema.parse(input), value = { ...parsed, occurredAt: new Date(parsed.occurredAt).toISOString() };
    const hash = createHash("sha256").update(JSON.stringify({ accountId, ...value })).digest("hex");
    return transact(async tx => {
      const current = await state(tx, accountId);
      if (!previewOnly) { const prior = await replay(tx, value.idempotencyKey, "hubbuy_topup_reversed", hash); if (prior) return prior; }
      editable(current, value.expectedRevision);
      const original = await tx.select().from(t.hubbuyTopups).where(and(eq(t.hubbuyTopups.id, value.topupId), eq(t.hubbuyTopups.accountId, accountId))).get();
      if (!original) throw new DomainError("Recarga não encontrada.", 404);
      if (await tx.select().from(t.hubbuyTopupReversals).where(eq(t.hubbuyTopupReversals.topupId, original.id)).get()) throw conflict("Esta recarga já foi anulada.", "TOPUP_ALREADY_REVERSED");
      if(await usesFreightFinance(tx)){
        const fees=await tx.select().from(topupFeeAllocations).where(eq(topupFeeAllocations.topupId,original.id));
        if(fees.reduce((sum,row)=>sum+(row.reversesId?-row.amountBrlCents:row.amountBrlCents),0)>0)throw conflict("A taxa já tem destinos. Corrija as operações dependentes antes de anular.","TOPUP_HAS_DEPENDENCIES");
      }
      const previousReversals=await tx.select().from(t.hubbuyTopupReversals).innerJoin(t.hubbuyTopups,eq(t.hubbuyTopups.id,t.hubbuyTopupReversals.topupId)).where(eq(t.hubbuyTopups.accountId,accountId));
      const recovered=recoverTopupPrincipal(current,original.creditEntryId,new Set(previousReversals.map(row=>row.hubbuy_topup_reversals.debitEntryId)));
      const preview = { accountId, topupId: original.id, accountRevision: current.account.revision, balanceBeforeCnyMinor: current.account.balanceCnyMinor, balanceAfterCnyMinor: current.account.balanceCnyMinor - original.cnyMinor, cnyMinor: original.cnyMinor, principalBrlCents: original.principalBrlCents, feeBrlCents: original.feeBrlCents, reason: value.reason, occurredAt: value.occurredAt };
      if (previewOnly) return preview;
      const now = new Date(), operationId = randomUUID(), debitEntryId = randomUUID();
      const result = { ...preview, accountRevision: current.account.revision + 1, operationId, debitEntryId, replayed: false };
      await tx.insert(s.financialOperations).values({ id: operationId, workspaceId: expectedWorkspaceId, operationType: "hubbuy_topup_reversed", idempotencyKey: value.idempotencyKey, payloadHash: hash, actorId, occurredAt: new Date(value.occurredAt), recordedAt: now, reason: value.reason, reversalOfId: original.operationId, contextJson: JSON.stringify({ accountId, result }) }).run();
      await tx.insert(s.hubbuyBalanceEntries).values({ id: debitEntryId, accountId, operationId, sequence: (current.entries.at(-1)?.sequence ?? -1) + 1, direction: "debit", amountCnyMinor: original.cnyMinor, historicalBrlCents: original.principalBrlCents, sourceType: "reversal", sourceId: original.id, reversalOfEntryId: original.creditEntryId, createdAt: now }).run();
      await tx.insert(s.hubbuyBalanceConsumptions).values(recovered.map((share, allocationOrder) => ({ id: randomUUID(), debitEntryId, ...share, allocationOrder, paymentAllocationId: null, createdAt: now }))).run();
      await tx.insert(t.hubbuyTopupReversals).values({ topupId: original.id, operationId, debitEntryId }).run();
      const updated = await tx.update(s.hubbuyAccounts).set({ balanceCnyMinor: preview.balanceAfterCnyMinor, revision: result.accountRevision, updatedAt: now, updatedBy: actorId }).where(and(eq(s.hubbuyAccounts.id, accountId), eq(s.hubbuyAccounts.revision, value.expectedRevision), isNull(s.hubbuyAccounts.deletedAt))).returning().get();
      if (!updated || !(await calculateHubBuyBalanceState(tx, accountId)).reconciled) throw conflict("A anulação não conciliou a conta.", "BALANCE_RECONCILIATION_REQUIRED");
      return result;
    }).catch(error => recover(accountId, value.idempotencyKey, "hubbuy_topup_reversed", hash, error));
  }
  async function list(accountId:string,afterSequence?:number){
    return transact(async tx=>{
      const current=await state(tx,accountId);
      const rows=await tx.select({topup:t.hubbuyTopups,sequence:s.hubbuyBalanceEntries.sequence,occurredAt:s.financialOperations.occurredAt,recordedAt:s.financialOperations.recordedAt,actorId:s.financialOperations.actorId,reason:s.financialOperations.reason}).from(t.hubbuyTopups).innerJoin(s.hubbuyBalanceEntries,eq(s.hubbuyBalanceEntries.id,t.hubbuyTopups.creditEntryId)).innerJoin(s.financialOperations,eq(s.financialOperations.id,t.hubbuyTopups.operationId)).where(and(eq(t.hubbuyTopups.accountId,accountId),afterSequence===undefined?undefined:lt(s.hubbuyBalanceEntries.sequence,afterSequence))).orderBy(desc(s.hubbuyBalanceEntries.sequence)).limit(21);
      const selected=rows.slice(0,20),ids=selected.map(row=>row.topup.id);
      const funders=ids.length?await tx.select().from(t.hubbuyTopupFunders).where(inArray(t.hubbuyTopupFunders.topupId,ids)):[];
      const reversals=ids.length?await tx.select().from(t.hubbuyTopupReversals).where(inArray(t.hubbuyTopupReversals.topupId,ids)):[];
      const fees=ids.length && await usesFreightFinance(tx)?await tx.select().from(topupFeeAllocations).where(inArray(topupFeeAllocations.topupId,ids)):[];
      const accountReversals=await tx.select().from(t.hubbuyTopupReversals).innerJoin(t.hubbuyTopups,eq(t.hubbuyTopups.id,t.hubbuyTopupReversals.topupId)).where(eq(t.hubbuyTopups.accountId,accountId));
      const auditedDebits=new Set(accountReversals.map(row=>row.hubbuy_topup_reversals.debitEntryId));
      return {accountRevision:current.account.revision,items:selected.map(row=>{
        const assignedFeeBrlCents=fees.filter(fee=>fee.topupId===row.topup.id).reduce((sum,fee)=>sum+(fee.reversesId?-fee.amountBrlCents:fee.amountBrlCents),0);
        const owners=funders.filter(person=>person.topupId===row.topup.id);
        const reversed=reversals.some(reverse=>reverse.topupId===row.topup.id);let canReverse=false,recoverableCnyMinor=0;
        try{if(!reversed){const recovered=recoverTopupPrincipal(current,row.topup.creditEntryId,auditedDebits);recoverableCnyMinor=recovered.reduce((sum,part)=>sum+part.amountCnyMinor,0);canReverse=assignedFeeBrlCents===0&&current.account.status==="active"&&current.reconciled;}}catch(error){if(!(error instanceof DomainError))throw error;}
        return {...row.topup,sequence:row.sequence,occurredAt:row.occurredAt,recordedAt:row.recordedAt,actorId:row.actorId,reason:row.reason,funders:owners,assignedFeeBrlCents,pendingFeeBrlCents:reversed?0:row.topup.feeBrlCents-assignedFeeBrlCents,reversed,canReverse,recoverableCnyMinor,availableCnyMinor:current.availableShares.filter(share=>share.creditEntryId===row.topup.creditEntryId).reduce((sum,share)=>sum+share.availableCnyMinor,0)};
      }),nextAfterSequence:rows.length>20?selected.at(-1)!.sequence:null};
    });
  }
  return { list, preview: (accountId: string, input: unknown) => record(accountId, input, true), record, previewReversal: (accountId: string, input: unknown) => reverse(accountId, input, true), reverse };
}
