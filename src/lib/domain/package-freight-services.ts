import { randomUUID } from "node:crypto";
import { and, asc,desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../db/connection";
import * as s from "../db/schema";
import * as f from "../db/freight-schema";
import { authorization } from "./authorization";
import { DomainError } from "./errors";
import { calculateHubBuyBalanceState } from "./hubbuy-balance-services";
import { previewFifoConsumption } from "./hubbuy-balance-calculations";
import { calculateExternalFeeBrl } from "./financial-money";
import { allocateFreightComponent } from "./package-freight-calculations";
import { financialCommandBase, financialConflict, freightContent, freightContext, freightMinor, freightWrite } from "./freight-context";
import { assignTopupFees, previewTopupFees, releaseTopupFees } from "./topup-fee-services";
import type { CostTransaction } from "./purchase-cost-initialization";
import { netFreightSources } from "./freight-refunds";

const paymentCommand = z.object({ ...financialCommandBase,
  expectedAccountRevision: z.number().int().nonnegative(), contentHash: z.string().length(64),
  nativeCurrency: z.enum(["CNY", "BRL"]), nativeMinor: freightMinor.min(1),
  balance: z.array(z.object({ personId: z.string().min(1), cnyMinor: freightMinor.min(1), creditShareIds: z.array(z.string().min(1)).min(1).max(1000).optional() }).strict()).max(100),
  external: z.array(z.object({ personId: z.string().min(1), method: z.enum(["pix", "card"]), nativeMinor: freightMinor.min(1), principalBrlCents: freightMinor.min(1), feeBps: z.number().int().min(0).max(10000) }).strict()).max(100),
  topupFees: z.array(z.object({ topupId: z.string().min(1), amountBrlCents: freightMinor }).strict()).max(100),
  confirmedCrossFunding: z.boolean(), confirmedObservedPayment: z.literal(true),
  externalReference: z.string().trim().min(1).max(200).nullable(), confirmedNoReference: z.boolean(),
  replacesPaymentId: z.string().min(1).nullable(),
  legacy: z.discriminatedUnion("mode", [z.object({ mode: z.literal("unrecorded"), confirmed: z.literal(true) }).strict(), z.object({ mode: z.literal("existing_debit"), debitEntryId: z.string().min(1) }).strict()]).nullable(),
}).strict();
const reverseCommand = z.object({ ...financialCommandBase, expectedAccountRevision: z.number().int().nonnegative(), paymentId: z.string().min(1), confirmedRegistrationError: z.literal(true) }).strict();
export type FreightPaymentCommand = z.infer<typeof paymentCommand>;

export function packageFreightServices(db: AppDatabase, actorId: string, workspaceId: string) {
  async function reverseInTransaction(tx: CostTransaction, payment: typeof f.freightPayments.$inferSelect, accountId: string, operationId: string) {
    if (await tx.select().from(f.freightReversals).where(eq(f.freightReversals.paymentId, payment.id)).get()) throw financialConflict("O pagamento já foi compensado.");
    const sources = await tx.select().from(f.freightSources).where(eq(f.freightSources.paymentId, payment.id));
    const balance = sources.filter(source => source.kind === "balance");
    let creditEntryId: string | null = null;
    if (balance.length) {
      const state = await calculateHubBuyBalanceState(tx, accountId);
      creditEntryId = randomUUID();
      const total = balance.reduce((sum, row) => sum + row.nativeMinor, 0), basis = balance.reduce((sum, row) => sum + row.principalBrlCents, 0);
      const originalUse=state.consumptions.find(use=>use.id===balance[0].consumptionId);
      await tx.insert(s.hubbuyBalanceEntries).values({ id: creditEntryId, accountId, operationId, sequence: (state.entries.at(-1)?.sequence ?? -1) + 1, direction: "credit", amountCnyMinor: total, historicalBrlCents: basis, sourceType: "reversal", sourceId: payment.id, reversalOfEntryId:originalUse?.debitEntryId??null, createdAt: new Date() });
      const owners = [...new Set(balance.map(row => row.personId))];
      await tx.insert(s.hubbuyBalanceCreditShares).values(owners.map((personId, allocationOrder) => ({ id: randomUUID(), creditEntryId: creditEntryId!, personId, allocationOrder, amountCnyMinor: balance.filter(row => row.personId === personId).reduce((sum, row) => sum + row.nativeMinor, 0), historicalBrlCents: balance.filter(row => row.personId === personId).reduce((sum, row) => sum + row.principalBrlCents, 0) })));
      await tx.update(s.hubbuyAccounts).set({ balanceCnyMinor: state.account.balanceCnyMinor + total, revision: state.account.revision + 1, updatedBy: actorId, updatedAt: new Date() }).where(eq(s.hubbuyAccounts.id, accountId));
    }
    await releaseTopupFees(tx, operationId, { freightPaymentId: payment.id });
    await tx.insert(f.freightReversals).values({ paymentId: payment.id, operationId, creditEntryId });
  }
  async function payment(packageId: string, input: unknown, previewOnly = false) {
    const parsed = paymentCommand.parse(input);
    const command = { ...parsed, occurredAt: new Date(parsed.occurredAt).toISOString() };
    return freightWrite(db, actorId, workspaceId, packageId, "package_freight_payment", command, previewOnly, false, async (tx, context, operationId) => {
      const { pkg } = context;
      if (pkg.revision !== command.expectedRevision || pkg.financialClosedAt || pkg.reviewState !== "confirmed") throw financialConflict("O pacote mudou ou está encerrado. Confira uma nova prévia.");
      if (!pkg.accountId) throw financialConflict("Confira a conta do pacote antes de pagar.");
      const content = await freightContent(tx, packageId);
      if (content.hash !== command.contentHash) throw financialConflict("O conteúdo mudou. Confira o rateio novamente.", "FREIGHT_CONTENT_CHANGED");
      let state = await calculateHubBuyBalanceState(tx, pkg.accountId);
      const walletBeforeCnyMinor=state.account.balanceCnyMinor;
      const restoredPreview: {personId:string;cnyMinor:number;principalBrlCents:number}[]=[];
      if (state.account.workspaceId !== workspaceId || state.account.status !== "active" || !state.reconciled || state.account.revision !== command.expectedAccountRevision) throw financialConflict("A conta mudou ou precisa de conciliação.", "BALANCE_REVISION_CONFLICT");
      if (!command.externalReference && !command.confirmedNoReference) throw new DomainError("Confirme a ausência de referência externa.", 400);
      if (context.payment) {
        if((await netFreightSources(tx,context.payment.id)).active.length)throw financialConflict("Este pagamento tem devoluções reais. Confira ou corrija os recebimentos dependentes antes de substituir o financiamento.","FREIGHT_REFUND_DEPENDENCY");
        if (command.replacesPaymentId !== context.payment.id) throw financialConflict("O frete já tem financiamento. Use a correção explícita.", "FREIGHT_ALREADY_PAID");
        if (pkg.stage !== "preparing") throw financialConflict("O pagamento de pacote despachado exige tratamento de devolução, sem reabrir seu conteúdo.");
        if(previewOnly){const old=await tx.select().from(f.freightSources).where(eq(f.freightSources.paymentId,context.payment.id));for(const source of old.filter(row=>row.kind==="balance"))restoredPreview.push({personId:source.personId,cnyMinor:source.nativeMinor,principalBrlCents:source.principalBrlCents});}
        if (!previewOnly) { await reverseInTransaction(tx, context.payment, pkg.accountId, operationId); state = await calculateHubBuyBalanceState(tx, pkg.accountId); }
      } else if (command.replacesPaymentId) throw financialConflict("O pagamento selecionado não está vigente.");
      const legacyPaid = pkg.freightPaidAt || (pkg.legacyPackageId && (await tx.select().from(s.purchaseCostCharges).where(and(eq(s.purchaseCostCharges.packageId, pkg.legacyPackageId), eq(s.purchaseCostCharges.chargeType, "brazil_freight"))).get())?.paymentStatus === "paid");
      if (!context.head && legacyPaid && !command.legacy) throw financialConflict("Frete legado já pago: confira se o débito já está registrado antes de regularizar.", "LEGACY_FREIGHT_REVIEW_REQUIRED");
      if(command.externalReference){
        const previous=await tx.select({payment:f.freightPayments}).from(f.freightPayments).innerJoin(s.logisticsPackages,eq(s.logisticsPackages.id,f.freightPayments.packageId)).where(eq(s.logisticsPackages.accountId,pkg.accountId));
        if(previous.some(row=>row.payment.externalReference===command.externalReference&&row.payment.id!==command.replacesPaymentId))throw financialConflict("Esta referência de frete já foi registrada na conta.","FINANCIAL_REFERENCE_DUPLICATE");
        const old=await tx.select().from(s.hubbuyBalanceAdjustments).where(and(eq(s.hubbuyBalanceAdjustments.accountId,pkg.accountId),eq(s.hubbuyBalanceAdjustments.externalReference,command.externalReference)));
        if(old.some(row=>row.kind==="documented_debit")&&command.legacy?.mode!=="existing_debit")throw financialConflict("Há um débito com esta referência. Associe o evento existente após conferência.","FINANCIAL_REFERENCE_DUPLICATE");
      }
      if (command.nativeCurrency === "BRL" && command.balance.length) throw new DomainError("Saldo CNY exige total nativo CNY conhecido.", 400);
      const participants = [...new Set([...content.units.flatMap(unit => unit.participants.map(p => p.personId)), ...command.balance.map(row => row.personId), ...command.external.map(row => row.personId)])];
      await authorization(tx, actorId).requireWorkspaceMembers(participants, workspaceId);
      if (new Set(command.balance.map(row => row.personId)).size !== command.balance.length) throw new DomainError("Combine os valores do mesmo titular.", 400);
      type Source = { id: string; personId: string; kind: "balance" | "pix" | "card" | "topup_fee"; nativeMinor: number; principalBrlCents: number; feeBrlCents: number; creditShareId?: string; consumptionId?: string; feeAllocationId?: string; feeBps?: number };
      const sources: Source[] = [];
      const consumed: { creditShareId: string; amountCnyMinor: number; historicalBrlCents: number; id: string }[] = [];
      if (command.legacy?.mode === "existing_debit") {
        const debitId = command.legacy.debitEntryId;
        const debit = state.entries.find(row => row.id === debitId && row.direction === "debit");
        if (!debit || debit.sourceType !== "manual_adjustment" || debit.amountCnyMinor !== command.nativeMinor || command.external.length || command.nativeCurrency !== "CNY") throw financialConflict("O débito existente não corresponde integralmente ao frete.", "LEGACY_DEBIT_INELIGIBLE");
        const uses = state.consumptions.filter(row => row.debitEntryId === debit.id);
        for (const use of uses) {
          if (use.paymentAllocationId || await tx.select().from(f.freightSources).where(eq(f.freightSources.consumptionId, use.id)).get()) throw financialConflict("O débito já tem outro destino.", "LEGACY_DEBIT_INELIGIBLE");
          const owner = state.shares.find(row => row.id === use.creditShareId)!;
          sources.push({ id: randomUUID(), personId: owner.personId, kind: "balance", nativeMinor: use.amountCnyMinor, principalBrlCents: use.historicalBrlCents, feeBrlCents: 0, consumptionId: use.id });
        }
      } else {
        for (const selection of command.balance) {
          const lots = state.availableShares.filter(row => row.personId === selection.personId && (!selection.creditShareIds || selection.creditShareIds.includes(row.id))).map(row => ({ creditId: row.id, sequence: state.entries.find(entry => entry.id === row.creditEntryId)!.sequence, availableCnyMinor: row.availableCnyMinor, availableHistoricalBrlCents: row.availableHistoricalBrlCents }));
          const restored=restoredPreview.filter(row=>row.personId===selection.personId);
          if(restored.length && !selection.creditShareIds)lots.push({creditId:`restored:${selection.personId}`,sequence:(state.entries.at(-1)?.sequence??-1)+1,availableCnyMinor:restored.reduce((sum,row)=>sum+row.cnyMinor,0),availableHistoricalBrlCents:restored.reduce((sum,row)=>sum+row.principalBrlCents,0)});
          let fifo;
          try { fifo = previewFifoConsumption(selection.cnyMinor, lots); } catch { throw financialConflict("O saldo elegível deste titular é insuficiente.", "BALANCE_INSUFFICIENT"); }
          for (const use of fifo.consumptions) {
            const id = randomUUID(); consumed.push({ creditShareId: use.creditId, amountCnyMinor: use.cnyMinor, historicalBrlCents: use.historicalBrlCents, id });
            sources.push({ id: randomUUID(), personId: selection.personId, kind: "balance", nativeMinor: use.cnyMinor, principalBrlCents: use.historicalBrlCents, feeBrlCents: 0, consumptionId: id, creditShareId: use.creditId });
          }
        }
      }
      for (const external of command.external) {
        if (command.nativeCurrency === "BRL" && external.nativeMinor !== external.principalBrlCents) throw new DomainError("No modo BRL, o principal nativo corresponde ao comprovante BRL.", 400);
        sources.push({ id: randomUUID(), personId: external.personId, kind: external.method, nativeMinor: external.nativeMinor, principalBrlCents: external.principalBrlCents, feeBrlCents: calculateExternalFeeBrl(external.principalBrlCents, external.feeBps), feeBps: external.feeBps });
      }
      if (sources.reduce((sum, row) => sum + BigInt(row.nativeMinor), 0n) !== BigInt(command.nativeMinor)) throw new DomainError("As fontes precisam fechar exatamente o total nativo do frete.", 400);
      const fees = await previewTopupFees(tx, pkg.accountId, consumed, command.topupFees,command.replacesPaymentId??undefined);
      for (const fee of fees) for (const funder of fee.funders) sources.push({ id: randomUUID(), personId: funder.personId, kind: "topup_fee", nativeMinor: 0, principalBrlCents: 0, feeBrlCents: funder.amountBrlCents, feeAllocationId: fee.topupId });
      await authorization(tx, actorId).requireWorkspaceMembers([...new Set(sources.map(source => source.personId))], workspaceId);
      const calculated = (["native", "historical", "fee"] as const).map(component => ({ component, ...allocateFreightComponent({ units: content.units, sources: sources.map((source, order) => ({ sourceId: source.id, order, amountMinor: component === "native" ? source.nativeMinor : component === "historical" ? source.principalBrlCents : source.feeBrlCents })) }) }));
      const crosses = calculated.flatMap(component => component.component === "historical" ? [] : component.allocations.filter(row => row.personId !== sources.find(source => source.id === row.sourceId)!.personId).map(row => ({ component: component.component, funderId: sources.find(source => source.id === row.sourceId)!.personId, beneficiaryId: row.personId, amountMinor: row.amountMinor })));
      if (!previewOnly && crosses.length && !command.confirmedCrossFunding) throw new DomainError("Confira e autorize explicitamente o financiamento entre pessoas.", 400);
      const principalBrlCents = sources.reduce((sum, row) => sum + row.principalBrlCents, 0), feeBrlCents = sources.reduce((sum, row) => sum + row.feeBrlCents, 0);
      if (principalBrlCents + feeBrlCents > 1_000_000_000_000) throw new DomainError("O frete excede o limite financeiro.", 400);
      const preview = { packageId, content, sources, fees, crosses, allocations: calculated, nativeCurrency: command.nativeCurrency, nativeMinor: command.nativeMinor, principalBrlCents, feeBrlCents, historicalCostBrlCents: principalBrlCents + feeBrlCents, balanceBeforeCnyMinor: walletBeforeCnyMinor, balanceAfterCnyMinor: state.account.balanceCnyMinor + restoredPreview.reduce((sum,row)=>sum+row.cnyMinor,0) - consumed.reduce((sum, row) => sum + row.amountCnyMinor, 0), provisional: !pkg.contentClosedAt };
      if (previewOnly) return { ...preview, paymentId: null as string | null, operationId: null as string | null };
      const paymentId = randomUUID(), now = new Date();
      await tx.insert(f.freightPayments).values({ id: paymentId, packageId, operationId, nativeCurrency: command.nativeCurrency, nativeMinor: command.nativeMinor, principalBrlCents, feeBrlCents, contentHash: content.hash, contentJson: JSON.stringify(content), externalReference: command.externalReference, replacesPaymentId: command.replacesPaymentId });
      if (consumed.length) {
        const debitEntryId = randomUUID();
        await tx.insert(s.hubbuyBalanceEntries).values({ id: debitEntryId, accountId: pkg.accountId, operationId, sequence: (state.entries.at(-1)?.sequence ?? -1) + 1, direction: "debit", amountCnyMinor: consumed.reduce((sum, row) => sum + row.amountCnyMinor, 0), historicalBrlCents: consumed.reduce((sum, row) => sum + row.historicalBrlCents, 0), sourceType: "package_freight_payment", sourceId: paymentId, createdAt: now });
        await tx.insert(s.hubbuyBalanceConsumptions).values(consumed.map((row, allocationOrder) => ({ ...row, debitEntryId, allocationOrder, paymentAllocationId: null, createdAt: now })));
        await tx.update(s.hubbuyAccounts).set({ balanceCnyMinor: preview.balanceAfterCnyMinor, revision: state.account.revision + 1, updatedBy: actorId, updatedAt: now }).where(and(eq(s.hubbuyAccounts.id, pkg.accountId), eq(s.hubbuyAccounts.revision, state.account.revision)));
      }
      const assigned = await assignTopupFees(tx, operationId, fees, { freightPaymentId: paymentId });
      await tx.insert(f.freightSources).values(sources.map(source => ({ id:source.id,personId:source.personId,kind:source.kind,nativeMinor:source.nativeMinor,principalBrlCents:source.principalBrlCents,feeBrlCents:source.feeBrlCents,consumptionId:source.consumptionId??null,feeBps:source.feeBps??null,paymentId,feeAllocationId: source.kind === "topup_fee" ? assigned.find(row => row.topupId === source.feeAllocationId)!.id : null })));
      const cells = calculated.flatMap(component => component.allocations.map(row => ({ id: randomUUID(), paymentId, contentHash: content.hash, component: component.component, ...row })));
      for (let index = 0; index < cells.length; index += 50) await tx.insert(f.freightAllocations).values(cells.slice(index, index + 50));
      await tx.insert(f.freightHeads).values({ packageId, paymentId }).onConflictDoUpdate({ target: f.freightHeads.packageId, set: { paymentId } });
      const updated = await tx.update(s.logisticsPackages).set({ freightState: "known", freightCents: principalBrlCents, freightFeeCents: feeBrlCents, freightPaymentMethod: null, freightFeeBps: null, freightPaidAt: now, revision: pkg.revision + 1 }).where(and(eq(s.logisticsPackages.id, packageId), eq(s.logisticsPackages.revision, command.expectedRevision))).returning({ id: s.logisticsPackages.id }).all();
      if (!updated.length || !(await calculateHubBuyBalanceState(tx, pkg.accountId)).reconciled) throw financialConflict("O pagamento não conciliou a conta.", "FREIGHT_INTEGRITY");
      await tx.insert(s.logisticsEvents).values({ id: randomUUID(), workspaceId, resourceId: packageId, action: "freight_funding_confirmed", reason: command.reason, before: pkg, after: { paymentId, contentHash: content.hash, principalBrlCents, feeBrlCents }, actorId, createdAt: now });
      return { ...preview, paymentId, operationId };
    });
  }
  async function reverse(packageId: string, input: unknown, previewOnly = false) {
    const command = reverseCommand.parse(input);
    return freightWrite(db, actorId, workspaceId, packageId, "package_freight_reversed", command, previewOnly, false, async (tx, context, operationId) => {
      const { pkg, payment } = context;
      if (!payment || payment.id !== command.paymentId || pkg.revision !== command.expectedRevision || pkg.financialClosedAt || pkg.stage !== "preparing" || !pkg.accountId) throw financialConflict("O pagamento mudou ou não pode ser anulado neste estado.");
      const state = await calculateHubBuyBalanceState(tx, pkg.accountId);
      if (!state.reconciled || state.account.status !== "active" || state.account.revision !== command.expectedAccountRevision) throw financialConflict("Confira a conta antes de anular.");
      const sources = await tx.select().from(f.freightSources).where(eq(f.freightSources.paymentId, payment.id));
      if((await netFreightSources(tx,payment.id)).active.length)throw financialConflict("Confira as devoluções reais dependentes antes de anular o registro.","FREIGHT_REFUND_DEPENDENCY");
      const restoredCnyMinor = sources.filter(row => row.kind === "balance").reduce((sum, row) => sum + row.nativeMinor, 0);
      if (!previewOnly) {
        await reverseInTransaction(tx, payment, pkg.accountId, operationId);
        await tx.update(f.freightHeads).set({ paymentId: null }).where(eq(f.freightHeads.packageId, packageId));
        await tx.update(s.logisticsPackages).set({ freightPaidAt: null, freightState: "pending", freightCents: null, freightFeeCents: null, revision: pkg.revision + 1 }).where(eq(s.logisticsPackages.id, packageId));
      }
      return { paymentId: payment.id, restoredCnyMinor, operationId: previewOnly ? null : operationId };
    });
  }
  async function get(packageId: string) {
    return db.transaction(async tx => {
      const context = await freightContext(tx, actorId, packageId, workspaceId), content = await freightContent(tx, packageId,true);
      const payments = await tx.select().from(f.freightPayments).where(eq(f.freightPayments.packageId, packageId));
      const paymentReversals=payments.length?await tx.select().from(f.freightReversals).where(inArray(f.freightReversals.paymentId,payments.map(row=>row.id))):[];
      const net=context.payment?await netFreightSources(tx,context.payment.id):{sources:[],refunds:[],active:[],reversals:[]};
      const sources=net.sources;
      const operationIds=[...payments.map(row=>row.operationId),...paymentReversals.map(row=>row.operationId),...net.refunds.map(row=>row.operationId),...net.reversals.map(row=>row.operationId)];
      const operations=operationIds.length?await tx.select().from(s.financialOperations).where(inArray(s.financialOperations.id,operationIds)):[];
      const account = context.pkg.accountId ? await calculateHubBuyBalanceState(tx, context.pkg.accountId) : null;
      const eligibleLegacyDebits=account?account.entries.filter(row=>row.direction==="debit" && row.sourceType==="manual_adjustment").map(row=>({id:row.id,sequence:row.sequence,amountCnyMinor:row.amountCnyMinor,historicalBrlCents:row.historicalBrlCents})):[];
      return { ...context, content, payments,paymentReversals, sources, operations,refunds:net.refunds,refundReversals:net.reversals,activeRefundIds:net.active.map(row=>row.id),eligibleLegacyDebits, account: account ? { account: account.account, rights: account.rights, availableShares: account.availableShares.map(row => ({ ...row, sequence: account.entries.find(entry => entry.id === row.creditEntryId)!.sequence })), reconciled: account.reconciled } : null };
    });
  }
  async function allocations(packageId:string,paymentId:string,offset=0){
    z.number().int().min(0).max(10000000).parse(offset);
    return db.transaction(async tx=>{
      await freightContext(tx,actorId,packageId,workspaceId);
      const payment=await tx.select().from(f.freightPayments).where(and(eq(f.freightPayments.id,paymentId),eq(f.freightPayments.packageId,packageId))).get();
      if(!payment)throw new DomainError("Pagamento não encontrado.",404);
      const latest=await tx.select().from(f.settlementVersions).where(eq(f.settlementVersions.paymentId,paymentId)).orderBy(desc(f.settlementVersions.sequence)).get();
      const snapshot=latest?JSON.parse(latest.snapshotJson):null,hash=snapshot?.valuationHash??payment.contentHash;
      const rows=await tx.select().from(f.freightAllocations).where(and(eq(f.freightAllocations.paymentId,paymentId),eq(f.freightAllocations.contentHash,hash))).orderBy(asc(f.freightAllocations.costItemId),asc(f.freightAllocations.unitIndex),asc(f.freightAllocations.personId),asc(f.freightAllocations.component),asc(f.freightAllocations.sourceId)).limit(101).offset(offset);
      return {paymentId,nativeCurrency:payment.nativeCurrency,contentHash:hash,labels:(snapshot?.content??JSON.parse(payment.contentJson)).labels as Record<string,string>,items:rows.slice(0,100),nextOffset:rows.length>100?offset+100:null};
    });
  }
  return { get,allocations, preview: (packageId: string, input: unknown) => payment(packageId, input, true), confirm: payment, reverse, previewReversal: (packageId: string, input: unknown) => reverse(packageId, input, true) };
}
