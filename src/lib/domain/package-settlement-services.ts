import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../db/connection";
import * as s from "../db/schema";
import * as f from "../db/freight-schema";
import * as t from "../db/topup-schema";
import { authorization } from "./authorization";
import { DomainError } from "./errors";
import { allocateFreightComponent } from "./package-freight-calculations";
import { compensateSettlementPositions, convertSettlementPositions, directSettlementClaims, settlementPositionsFromClaims } from "./package-settlement-calculations";
import { convertByCapturedPair } from "./financial-money";
import { financialCommandBase, financialConflict, financialHash, freightContent, freightContext, freightMinor, freightWrite } from "./freight-context";
import { netFreightSources } from "./freight-refunds";

const policySchema = z.discriminatedUnion("mode", [z.object({ mode: z.literal("direct") }).strict(), z.object({ mode: z.literal("centralized"), centralizerId: z.string().min(1), confirmedCompensation: z.literal(true) }).strict()]);
const pairSchema = z.object({ fromCnyMinor: freightMinor.min(1), toBrlCents: freightMinor.min(1), date: z.iso.datetime({ offset: true }), reason: z.string().trim().min(3).max(1000), topupId: z.string().min(1).nullable() }).strict();
const issueSchema = z.object({ ...financialCommandBase, expectedSettlementSequence: z.number().int().nonnegative(), contentHash: z.string().length(64), policy: policySchema, pair: pairSchema.nullable(), confirmedRevisionWithReceipts: z.boolean() }).strict();
const receiptSchema = z.object({ ...financialCommandBase, versionId: z.string().min(1), debtorId: z.string().min(1), creditorId: z.string().min(1), amountBrlCents: freightMinor.min(1), allocations: z.array(z.object({ claimId: z.string().min(1), amountBrlCents: freightMinor.min(1) }).strict()).max(1000), confirmedExcess: z.boolean(), returnsReceiptId: z.string().min(1).nullable(), externalReference: z.string().trim().min(1).max(200).nullable() }).strict();
const reversalSchema = z.object({ ...financialCommandBase, receiptId: z.string().min(1), confirmedRegistrationError: z.literal(true) }).strict();
export type SettlementIssueCommand = z.infer<typeof issueSchema>;
export type SettlementReceiptCommand = z.infer<typeof receiptSchema>;
type Claim = { debtorId: string; creditorId: string; currency: "CNY" | "BRL"; amountMinor: number; component: "principal" | "fee" | "net" | "correction"; lineage: string[] };

async function readSettlementRows(db: Pick<AppDatabase, "select">, packageId: string) {
  const versions = await db.select().from(f.settlementVersions).where(eq(f.settlementVersions.packageId, packageId)).orderBy(desc(f.settlementVersions.sequence));
  const receipts = await db.select().from(f.settlementReceipts).where(eq(f.settlementReceipts.packageId, packageId));
  const reversals = receipts.length ? await db.select().from(f.settlementReceiptReversals).where(inArray(f.settlementReceiptReversals.receiptId, receipts.map(row => row.id))) : [];
  const claims = versions.length ? await db.select().from(f.settlementClaims).where(inArray(f.settlementClaims.versionId, versions.map(row => row.id))) : [];
  const allocations = receipts.length ? await db.select().from(f.settlementReceiptAllocations).where(inArray(f.settlementReceiptAllocations.receiptId, receipts.map(row => row.id))) : [];
  return { versions, receipts, reversals, claims, allocations, activeReceipts: receipts.filter(row => !reversals.some(reverse => reverse.receiptId === row.id)) };
}
function outstanding(claim: typeof f.settlementClaims.$inferSelect, rows: Awaited<ReturnType<typeof readSettlementRows>>) {
  return claim.amountMinor - rows.allocations.filter(row => row.claimId === claim.id && rows.activeReceipts.some(receipt => receipt.id === row.receiptId)).reduce((sum, row) => sum + row.amountBrlCents, 0);
}

export function packageSettlementServices(db: AppDatabase, actorId: string, workspaceId: string) {
  async function issue(packageId: string, input: unknown, previewOnly = false) {
    const command = issueSchema.parse(input);
    return freightWrite(db, actorId, workspaceId, packageId, command.pair ? "freight_settlement_converted" : "freight_settlement_issued", command, previewOnly, true, async (tx, context, operationId) => {
      const rows = await readSettlementRows(tx, packageId), latest = rows.versions[0];
      if (context.pkg.revision !== command.expectedRevision || (latest?.sequence ?? 0) !== command.expectedSettlementSequence) throw financialConflict("O acerto mudou. Confira uma nova prévia.");
      const content = await freightContent(tx, packageId);
      if (content.hash !== command.contentHash || !context.pkg.contentClosedAt) throw financialConflict("Feche e confira o conteúdo antes de emitir um acerto.", "SETTLEMENT_CONTENT_PENDING");
      const reversedPayment = !context.payment && context.head && latest ? await tx.select().from(f.freightPayments).where(eq(f.freightPayments.id, latest.paymentId)).get() : undefined;
      const payment = context.payment ?? reversedPayment;
      if (!payment || context.payment && !context.pkg.freightPaidAt) throw financialConflict("Confirme o pagamento do frete antes do acerto.", "SETTLEMENT_PAYMENT_PENDING");
      if (rows.activeReceipts.length && !command.confirmedRevisionWithReceipts) throw new DomainError("Confira a compensação dos pagamentos já registrados antes de revisar.", 400);
      if (rows.activeReceipts.length && payment.nativeCurrency === "CNY" && !command.pair) throw financialConflict("Mantenha ou confirme uma referência de conversão para preservar os pagamentos BRL.");
      if (command.pair?.topupId) {
        const topup = await tx.select().from(t.hubbuyTopups).where(and(eq(t.hubbuyTopups.id, command.pair.topupId), eq(t.hubbuyTopups.accountId, context.pkg.accountId!))).get();
        if (!topup || topup.cnyMinor !== command.pair.fromCnyMinor || topup.principalBrlCents !== command.pair.toBrlCents) throw financialConflict("O par selecionado não corresponde ao principal desta recarga.", "SETTLEMENT_PAIR_INVALID");
      }
      if (payment.nativeCurrency === "BRL" && command.pair) throw new DomainError("O frete nativo BRL não recebe conversão CNY.", 400);
      const net=context.payment?await netFreightSources(tx,payment.id):{sources:[],active:[]};
      const sources=net.sources;
      const people = [...new Set([...content.units.flatMap(unit => unit.participants.map(person => person.personId)), ...sources.map(source => source.personId), ...rows.activeReceipts.flatMap(row => [row.debtorId, row.creditorId]), ...(command.policy.mode === "centralized" ? [command.policy.centralizerId] : [])])].sort().map((personId, order) => ({ personId, order }));
      await authorization(tx, actorId).requireWorkspaceMembers(people.map(row => row.personId), workspaceId);
      const components = (["principal", "fee"] as const).map(component => {
        const allocation = sources.length ? allocateFreightComponent({ units: content.units, sources: sources.map((source, order) => ({ sourceId: source.id, order, amountMinor: component === "principal" ? source.nativeMinor : source.feeBrlCents })) }) : { totalMinor: 0, allocations: [] };
        const cells=directSettlementClaims(allocation.allocations.map((cell, index) => ({ id: `${component}:${index}`, sourceId: cell.sourceId, funderId: sources.find(source => source.id === cell.sourceId)!.personId, beneficiaryId: cell.personId, amountMinor: cell.amountMinor })));
        const grouped=new Map<string,typeof cells[number]>();
        for(const cell of cells){const key=JSON.stringify([cell.sourceId,cell.debtorId,cell.creditorId]),prior=grouped.get(key);grouped.set(key,{...cell,amountMinor:cell.amountMinor+(prior?.amountMinor??0)});}
        const claims=[...grouped.values()];
        return { component, allocation, claims, positions: settlementPositionsFromClaims(people, claims) };
      });
      const principal = components[0], fees = components[1];
      const peopleSummary=people.map(person=>({personId:person.personId,equivalentMicrounits:content.units.reduce((sum,unit)=>{const member=unit.participants.find(row=>row.personId===person.personId),total=unit.participants.reduce((n,row)=>n+BigInt(row.weight),0n);return sum+(member&&total?Number(BigInt(member.weight)*1000000n/total):0);},0),obligationNativeMinor:principal.allocation.allocations.filter(row=>row.personId===person.personId).reduce((sum,row)=>sum+row.amountMinor,0),ownFundingNativeMinor:sources.filter(row=>row.personId===person.personId).reduce((sum,row)=>sum+row.nativeMinor,0),feeDueBrlCents:fees.allocation.allocations.filter(row=>row.personId===person.personId).reduce((sum,row)=>sum+row.amountMinor,0),feeFundedBrlCents:sources.filter(row=>row.personId===person.personId).reduce((sum,row)=>sum+row.feeBrlCents,0)}));
      let claims: Claim[];
      if (command.policy.mode === "centralized") {
        const nativePositions = principal.positions;
        const converted = payment.nativeCurrency === "CNY" && command.pair ? convertSettlementPositions(nativePositions, command.pair) : nativePositions;
        if (payment.nativeCurrency === "CNY" && !command.pair) {
          claims = [...compensateSettlementPositions(nativePositions, command.policy).map(row => ({ ...row, currency: "CNY" as const, component: "principal" as const, lineage: sources.map(row => row.id) })), ...compensateSettlementPositions(fees.positions, command.policy).map(row => ({ ...row, currency: "BRL" as const, component: "fee" as const, lineage: sources.map(row => row.id) }))];
        } else {
          const totals = converted.map((row, index) => ({ ...row, amountMinor: row.amountMinor + fees.positions[index].amountMinor }));
          claims = compensateSettlementPositions(totals, command.policy).map(row => ({ ...row, currency: "BRL", component: "net", lineage: sources.map(row => row.id) }));
        }
      } else {
        claims = components.flatMap(component => component.claims.map(row => ({ debtorId: row.debtorId, creditorId: row.creditorId, currency: component.component === "fee" || payment.nativeCurrency === "BRL" || command.pair ? "BRL" as const : "CNY" as const, amountMinor: component.component === "principal" && payment.nativeCurrency === "CNY" && command.pair ? convertByCapturedPair(row.amountMinor, command.pair.fromCnyMinor, command.pair.toBrlCents) : row.amountMinor, component: component.component, lineage: [row.sourceId] }))).filter(row => row.amountMinor > 0);
      }
      const targetClaims = claims.map(row => ({ ...row }));
      if (rows.activeReceipts.length) {
        if (command.policy.mode === "centralized") {
          const positions = settlementPositionsFromClaims(people, claims);
          const paid = settlementPositionsFromClaims(people, rows.activeReceipts.map(row => ({ debtorId: row.debtorId, creditorId: row.creditorId, amountMinor: row.amountBrlCents })));
          claims = compensateSettlementPositions(positions.map((row, index) => ({ ...row, amountMinor: row.amountMinor - paid[index].amountMinor })), command.policy).map(row => ({ ...row, currency: "BRL", component: "correction", lineage: rows.activeReceipts.map(row => row.id) }));
        } else {
          // Preserve pairs without silently centralizing or netting other people.
          const signed = new Map<string, { a: string; b: string; amount: number; lineage: string[] }>();
          const add = (debtorId: string, creditorId: string, amount: number, lineage: string[]) => {
            const [a, b] = [debtorId, creditorId].sort(), key = JSON.stringify([a, b]), row = signed.get(key) ?? { a, b, amount: 0, lineage: [] };
            row.amount += debtorId === a ? amount : -amount; row.lineage.push(...lineage); signed.set(key, row);
          };
          for (const claim of claims) add(claim.debtorId, claim.creditorId, claim.amountMinor, claim.lineage);
          for (const receipt of rows.activeReceipts) add(receipt.debtorId, receipt.creditorId, -receipt.amountBrlCents, [receipt.id]);
          claims = [...signed.values()].filter(row => row.amount !== 0).map(row => ({ debtorId: row.amount > 0 ? row.a : row.b, creditorId: row.amount > 0 ? row.b : row.a, amountMinor: Math.abs(row.amount), currency: "BRL", component: "correction", lineage: row.lineage }));
        }
      }
      const valuationHash=financialHash({contentHash:content.hash,paymentId:context.payment?.id??null,refundIds:net.active.map(row=>row.id).sort()});
      const snapshot = { version: 2, content, valuationHash,people:peopleSummary,paymentId: context.payment?.id ?? null, refundIds:net.active.map(row=>row.id).sort(), nativeCurrency: payment.nativeCurrency, principalPositions: principal.positions, feePositions: fees.positions, policy: command.policy, pair: command.pair, targetClaims, receiptIds: rows.activeReceipts.map(row => row.id), claims };
      const versionId = randomUUID();
      if (!previewOnly) {
        const existingCells=await tx.select({id:f.freightAllocations.id}).from(f.freightAllocations).where(and(eq(f.freightAllocations.paymentId,payment.id),eq(f.freightAllocations.contentHash,valuationHash))).limit(1);
        if(sources.length&&!existingCells.length)for(const component of ["native","historical","fee"] as const){
          const matrix=allocateFreightComponent({units:content.units,sources:sources.map((source,order)=>({sourceId:source.id,order,amountMinor:component==="native"?source.nativeMinor:component==="historical"?source.principalBrlCents:source.feeBrlCents}))});
          const cells=matrix.allocations.map(cell=>({id:randomUUID(),paymentId:payment.id,contentHash:valuationHash,component,...cell}));
          for(let index=0;index<cells.length;index+=50)await tx.insert(f.freightAllocations).values(cells.slice(index,index+50));
        }
        await tx.insert(f.settlementVersions).values({ id: versionId, packageId, paymentId: payment.id, operationId, sequence: (latest?.sequence ?? 0) + 1, previousId: latest?.id ?? null, contentHash: content.hash, policy: command.policy.mode, centralizerId: command.policy.mode === "centralized" ? command.policy.centralizerId : null, fromCnyMinor: command.pair?.fromCnyMinor ?? null, toBrlCents: command.pair?.toBrlCents ?? null, pairDate: command.pair?.date ?? null, pairReason: command.pair?.reason ?? null, pairTopupId: command.pair?.topupId ?? null, snapshotJson: JSON.stringify(snapshot) });
        if (claims.length) await tx.insert(f.settlementClaims).values(claims.map(row => ({ id: randomUUID(), versionId, debtorId: row.debtorId, creditorId: row.creditorId, currency: row.currency, amountMinor: row.amountMinor, component: row.component, lineageJson: JSON.stringify(row.lineage) })));
        await tx.update(s.logisticsPackages).set({ revision: context.pkg.revision + 1 }).where(eq(s.logisticsPackages.id, packageId));
      }
      return { ...snapshot, versionId: previewOnly ? null : versionId, sequence: (latest?.sequence ?? 0) + 1 };
    });
  }
  async function receipt(packageId: string, input: unknown, previewOnly = false) {
    const command = receiptSchema.parse(input);
    return freightWrite(db, actorId, workspaceId, packageId, command.returnsReceiptId ? "freight_excess_returned" : "freight_receipt_recorded", command, previewOnly, true, async (tx, context, operationId) => {
      const rows = await readSettlementRows(tx, packageId), latest = rows.versions[0];
      if (context.pkg.revision !== command.expectedRevision || !latest || latest.id !== command.versionId) throw financialConflict("O acerto mudou. Confira a versão vigente.");
      const content = await freightContent(tx, packageId), snapshot = JSON.parse(latest.snapshotJson) as { paymentId: string | null; nativeCurrency: string; receiptIds: string[];refundIds:string[] };
      const refunds=context.payment?(await netFreightSources(tx,context.payment.id)).active.map(row=>row.id).sort():[];
      if(financialHash(refunds)!==financialHash(snapshot.refundIds??[]))throw financialConflict("Uma devolução do frete mudou. Revise o acerto antes da baixa.","SETTLEMENT_REVIEW_REQUIRED");
      if (!context.pkg.contentClosedAt || content.hash !== latest.contentHash || snapshot.paymentId !== (context.payment?.id ?? null) || snapshot.receiptIds.some(id => rows.reversals.some(row => row.receiptId === id))) throw financialConflict("O fundamento financeiro mudou. Revise o acerto antes da baixa.", "SETTLEMENT_REVIEW_REQUIRED");
      if (snapshot.nativeCurrency === "CNY" && !latest.fromCnyMinor) throw financialConflict("Confirme a conversão do acerto antes de registrar BRL.", "SETTLEMENT_CONVERSION_REQUIRED");
      await authorization(tx, actorId).requireWorkspaceMembers([command.debtorId, command.creditorId], workspaceId);
      if (command.debtorId === command.creditorId) throw new DomainError("Pagador e recebedor devem ser diferentes.", 400);
      if (new Set(command.allocations.map(row => row.claimId)).size !== command.allocations.length) throw new DomainError("Não repita uma obrigação na baixa.", 400);
      let allocated = 0;
      for (const selected of command.allocations) {
        const claim = rows.claims.find(row => row.id === selected.claimId && row.versionId === latest.id);
        if (!claim || claim.currency !== "BRL" || claim.debtorId !== command.debtorId || claim.creditorId !== command.creditorId || selected.amountBrlCents > outstanding(claim, rows)) throw financialConflict("A baixa supera o aberto ou pertence a outro par/versão.", "SETTLEMENT_CAPACITY_EXCEEDED");
        allocated += selected.amountBrlCents;
      }
      const excess = command.amountBrlCents - allocated;
      if (excess < 0 || excess > 0 && !command.confirmedExcess && !command.returnsReceiptId) throw new DomainError("Distribua o valor entre obrigações ou confirme o excesso real como crédito a devolver.", 400);
      if (command.returnsReceiptId) {
        const original = rows.activeReceipts.find(row => row.id === command.returnsReceiptId);
        if (original && original.versionId !== latest.id) throw financialConflict("O excesso já integra a compensação desta versão. Registre a transferência nas obrigações vigentes para evitar uma devolução duplicada.", "SETTLEMENT_RETURN_REVISED");
        const returned = rows.activeReceipts.filter(row => row.returnsReceiptId === command.returnsReceiptId).reduce((sum, row) => sum + row.amountBrlCents, 0);
        if (!original || command.allocations.length || original.returnsReceiptId || original.debtorId !== command.creditorId || original.creditorId !== command.debtorId || command.amountBrlCents > original.excessBrlCents - returned) throw financialConflict("A devolução supera o excesso real ainda aberto.", "SETTLEMENT_RETURN_CAPACITY");
      }
      if (command.externalReference && rows.receipts.some(row => row.externalReference === command.externalReference)) throw financialConflict("Esta transferência já foi registrada.", "FINANCIAL_REFERENCE_DUPLICATE");
      const receiptId = randomUUID();
      if (!previewOnly) {
        await tx.insert(f.settlementReceipts).values({ id: receiptId, packageId, versionId: latest.id, operationId, debtorId: command.debtorId, creditorId: command.creditorId, amountBrlCents: command.amountBrlCents, excessBrlCents: command.returnsReceiptId ? 0 : excess, returnsReceiptId: command.returnsReceiptId, externalReference: command.externalReference });
        if (command.allocations.length) await tx.insert(f.settlementReceiptAllocations).values(command.allocations.map(row => ({ id: randomUUID(), receiptId, claimId: row.claimId, amountBrlCents: row.amountBrlCents })));
        await tx.update(s.logisticsPackages).set({ revision: context.pkg.revision + 1 }).where(eq(s.logisticsPackages.id, packageId));
      }
      return { receiptId: previewOnly ? null : receiptId, amountBrlCents: command.amountBrlCents, allocatedBrlCents: allocated, excessBrlCents: command.returnsReceiptId ? 0 : excess };
    });
  }
  async function reverseReceipt(packageId: string, input: unknown, previewOnly = false) {
    const command = reversalSchema.parse(input);
    return freightWrite(db, actorId, workspaceId, packageId, "freight_receipt_reversed", command, previewOnly, true, async (tx, context, operationId) => {
      const rows = await readSettlementRows(tx, packageId), original = rows.activeReceipts.find(row => row.id === command.receiptId);
      if (context.pkg.revision !== command.expectedRevision || !original) throw financialConflict("O recibo mudou ou já foi anulado.");
      if (rows.activeReceipts.some(row => row.returnsReceiptId === original.id)) throw financialConflict("Anule primeiro os registros de devolução dependentes.");
      if (!previewOnly) {
        await tx.insert(f.settlementReceiptReversals).values({ receiptId: original.id, operationId });
        await tx.update(s.logisticsPackages).set({ revision: context.pkg.revision + 1 }).where(eq(s.logisticsPackages.id, packageId));
      }
      return { receiptId: original.id, reopenedBrlCents: original.amountBrlCents };
    });
  }
  async function get(packageId: string) {
    return db.transaction(async tx => {
      const context = await freightContext(tx, actorId, packageId, workspaceId, true), content = await freightContent(tx, packageId,true), rows = await readSettlementRows(tx, packageId);
      const latest = rows.versions[0], snapshot = latest ? JSON.parse(latest.snapshotJson) as { paymentId: string | null; receiptIds: string[];refundIds:string[] } : null;
      const refundIds=context.payment?(await netFreightSources(tx,context.payment.id)).active.map(row=>row.id).sort():[];
      const needsReview = !!latest && (!context.pkg.contentClosedAt || latest.contentHash !== content.hash || snapshot?.paymentId !== (context.payment?.id ?? null) || snapshot.receiptIds.some(id => rows.reversals.some(row => row.receiptId === id))) || !!snapshot && financialHash(refundIds)!==financialHash(snapshot.refundIds??[]);
      const operationIds=[...rows.versions.map(row=>row.operationId),...rows.receipts.map(row=>row.operationId),...rows.reversals.map(row=>row.operationId)];
      const operations = operationIds.length?await tx.select().from(s.financialOperations).where(inArray(s.financialOperations.id,operationIds)):[];
      return { ...rows, latest: latest ?? null, needsReview, claims: rows.claims.map(row => ({ ...row, outstandingMinor: outstanding(row, rows), current: row.versionId === latest?.id })), operations: operations.filter(operation => rows.versions.some(row => row.operationId === operation.id) || rows.receipts.some(row => row.operationId === operation.id) || rows.reversals.some(row => row.operationId === operation.id)) };
    });
  }
  return { get, preview: (packageId: string, input: unknown) => issue(packageId, input, true), confirm: issue, previewReceipt: (packageId: string, input: unknown) => receipt(packageId, input, true), recordReceipt: receipt, previewReceiptReversal: (packageId: string, input: unknown) => reverseReceipt(packageId, input, true), reverseReceipt };
}
