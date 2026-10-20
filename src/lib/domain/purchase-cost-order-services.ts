import { createHash } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../db/connection";
import type { CostTransaction } from "./purchase-cost-initialization";
import {
  financialOperations, favorites, hubbuyAccounts, hubbuyBalanceConsumptions, hubbuyBalanceEntries, memberBalanceFinancingEntries, purchaseAdditionalOrderItems, purchaseCostCharges,
  purchaseCostOrders, purchaseCostParticipants, purchaseCostTrackings, purchaseItemCosts,
  purchasePaymentAllocations, purchasePaymentComponents, workspaceMembers, workspaceCostSettings,
} from "../db/schema";
import { authorization } from "./authorization";
import { DomainError } from "./errors";
import { allocateExactMinor, calculatePaymentFunding, previewFifoConsumption } from "./hubbuy-balance-calculations";
import { calculateExternalFeeBrl, MAX_FINANCIAL_MINOR } from "./financial-money";
import { serializeDomainTransaction } from "./transaction-lock";
import { resolveProductCategory } from "./categories";
import { calculateHubBuyBalanceState } from "./hubbuy-balance-services";

const maxMinor = MAX_FINANCIAL_MINOR;
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const itemSchema = z.object({
  sourceFavoriteId: z.string().min(1).nullable().optional(),
  name: z.string().trim().min(1).max(200), url: z.string().url().max(2048), platform: z.string().trim().min(1).max(100),
  visualKey: z.string().trim().min(1).max(100), variant: z.string().max(500).nullable().optional(), notes: z.string().max(2000).nullable().optional(),
  quantity: z.number().int().min(1).max(10_000), itemOrder: z.number().int().min(0).max(10_000),
  nativeProductState: z.enum(["unknown", "known", "no_charge"]), nativeProductCnyMinor: z.number().int().min(0).max(maxMinor).nullable(),
  nativeChinaState: z.enum(["unknown", "known", "no_charge"]), nativeChinaCnyMinor: z.number().int().min(0).max(maxMinor).nullable(),
  participants: z.array(z.object({ personId: z.string().min(1), weightMode: z.enum(["equal", "percentage", "fixed"]), weight: z.number().int().min(0).max(maxMinor) }).strict()).min(1).max(100),
}).strict();
const createSchema = z.object({
  expectedRevision: revision, idempotencyKey: z.string().trim().min(1).max(200), accountId: z.string().min(1),
  externalReference: z.string().trim().min(1).max(200).nullable().optional(), occurredAt: z.coerce.date().nullable().optional(),
  items: z.array(itemSchema).min(1).max(100),
}).strict();
const updateDraftSchema = z.object({
  expectedRevision: revision, idempotencyKey: z.string().trim().min(1).max(200), accountId: z.string().min(1),
  item: z.object({
    name: z.string().trim().min(1).max(200), url: z.string().url().max(2048), platform: z.string().trim().min(1).max(100),
    variant: z.string().max(500).nullable(), quantity: z.number().int().min(1).max(10_000),
    nativeProductState: z.enum(["unknown", "known", "no_charge"]), nativeProductCnyMinor: z.number().int().min(0).max(maxMinor).nullable(),
    nativeChinaState: z.enum(["unknown", "known", "no_charge"]), nativeChinaCnyMinor: z.number().int().min(0).max(maxMinor).nullable(),
    participants: z.array(z.object({ personId: z.string().min(1), weightMode: z.enum(["equal", "percentage", "fixed"]), weight: z.number().int().min(0).max(maxMinor) }).strict()).min(1).max(100),
  }).strict(),
}).strict();
const paymentSchema = z.object({
  expectedRevision: revision, idempotencyKey: z.string().trim().min(1).max(200),
  paymentMethod: z.enum(["pix", "card"]), principalBrlCents: z.number().int().min(1).max(maxMinor),
  conversionCnyMinor: z.number().int().min(1).max(maxMinor), conversionBrlCents: z.number().int().min(1).max(maxMinor),
  feeBps: z.number().int().min(0).max(10_000).optional(),
}).strict();
const mixedPaymentSchema = z.object({
  expectedRevision: revision, idempotencyKey: z.string().trim().min(1).max(200), useOwnBalance: z.boolean().default(true),
  external: z.object({ paymentMethod: z.enum(["pix", "card"]), principalBrlCents: z.number().int().min(1).max(maxMinor), conversionCnyMinor: z.number().int().min(1).max(maxMinor), conversionBrlCents: z.number().int().min(1).max(maxMinor), feeBps: z.number().int().min(0).max(10_000).optional() }).strict().nullable().optional(),
  balanceFunding: z.array(z.object({ costItemId: z.string().min(1), costComponent: z.enum(["product", "china"]), beneficiaryId: z.string().min(1), lenderId: z.string().min(1), cnyMinor: z.number().int().min(1).max(maxMinor) }).strict()).max(10_000).default([]),
}).strict();
const voidOrderSchema = z.object({ expectedRevision: revision, idempotencyKey: z.string().trim().min(1).max(200), reason: z.string().trim().min(1).max(1000) }).strict();

function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function assertValue(state: "unknown" | "known" | "no_charge", amount: number | null, label: string) {
  if (state === "known" && amount === null) throw new DomainError(`Informe o valor CNY de ${label}.`, 400);
  if (state !== "known" && amount !== null) throw new DomainError(`O valor CNY de ${label} deve ficar vazio quando estiver pendente ou sem cobrança.`, 400);
}

async function updateTracking(tx: Parameters<Parameters<AppDatabase["transaction"]>[0]>[0], trackingId: string, expectedRevision: number, actorId: string) {
  const row = await tx.update(purchaseCostTrackings).set({ revision: expectedRevision + 1, updatedBy: actorId, updatedAt: new Date() })
    .where(and(eq(purchaseCostTrackings.id, trackingId), eq(purchaseCostTrackings.revision, expectedRevision), eq(purchaseCostTrackings.status, "open"))).returning().get();
  if (!row) throw new DomainError("Os custos foram alterados em outra sessão. Atualize a tela e tente novamente.", 409);
  return row;
}

export function purchaseCostOrderServices(db: AppDatabase, actorId: string) {
  async function createDraft(trackingId: string, input: unknown) {
    const value = createSchema.parse(input);
    const normalized = { ...value, externalReference: value.externalReference?.trim() || null, items: [...value.items].sort((a, b) => a.itemOrder - b.itemOrder) };
    if (new Set(normalized.items.map(item => item.itemOrder)).size !== normalized.items.length) throw new DomainError("A ordem dos itens do pedido precisa ser única.", 400);
    for (const item of normalized.items) {
      if (new Set(item.participants.map(row => row.personId)).size !== item.participants.length) throw new DomainError("Cada participante deve aparecer uma única vez por produto.", 400);
      const totalWeight = item.participants.reduce((sum, row) => sum + BigInt(row.weightMode === "equal" ? 1 : row.weight), 0n);
      if (item.participants.some(row => row.weightMode !== item.participants[0].weightMode) || totalWeight === 0n) throw new DomainError("A divisão do item precisa usar uma única modalidade e ter peso positivo.", 400);
      if (item.participants[0].weightMode === "percentage" && totalWeight !== 10_000n) throw new DomainError("Os percentuais do item precisam somar 100%.", 400);
      assertValue(item.nativeProductState, item.nativeProductCnyMinor, "produto");
      assertValue(item.nativeChinaState, item.nativeChinaCnyMinor, "frete China");
    }
    return serializeDomainTransaction(() => db.transaction(async tx => {
      const tracking = await tx.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.id, trackingId)).get();
      if (!tracking) throw new DomainError("Acompanhamento de custos não encontrado.", 404);
      await authorization(tx, actorId).requireWorkspaceMember(tracking.workspaceId);
      const prior = await tx.select().from(financialOperations).where(and(eq(financialOperations.workspaceId, tracking.workspaceId), eq(financialOperations.idempotencyKey, value.idempotencyKey))).get();
      const payloadHash = hash({ trackingId, ...normalized });
      if (prior) {
        if (prior.operationType !== "additional_order_draft" || prior.payloadHash !== payloadHash) throw new DomainError("Esta chave já foi usada com outros dados.", 409, "IDEMPOTENCY_CONFLICT");
        const context = JSON.parse(prior.contextJson) as { orderId: string };
        return { orderId: context.orderId, replayed: true };
      }
      if (tracking.status !== "open" || tracking.revision !== value.expectedRevision) throw new DomainError("Os custos foram alterados ou encerrados. Atualize a tela.", 409);
      const account = await tx.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, value.accountId)).get();
      if (!account || account.deletedAt || account.workspaceId !== tracking.workspaceId || account.status !== "active") throw new DomainError("Escolha uma conta HubBuy ativa e conciliada deste espaço.", 409, "HUBBUY_ACCOUNT_UNAVAILABLE");
      if (normalized.externalReference && await tx.select().from(purchaseCostOrders).where(and(eq(purchaseCostOrders.accountId, value.accountId), eq(purchaseCostOrders.externalReference, normalized.externalReference))).get()) {
        throw new DomainError("Esta referência de pedido já foi registrada nesta conta.", 409, "ORDER_REFERENCE_DUPLICATE");
      }
      await authorization(tx, actorId).requireWorkspaceMembers([...new Set(normalized.items.flatMap(item => item.participants.map(person => person.personId)))], tracking.workspaceId);
      const operationId = crypto.randomUUID(), orderId = crypto.randomUUID(), now = new Date();
      await tx.insert(financialOperations).values({
        id: operationId, workspaceId: tracking.workspaceId, operationType: "additional_order_draft", idempotencyKey: value.idempotencyKey,
        payloadHash, actorId, occurredAt: value.occurredAt ?? null, recordedAt: now, reason: null, reversalOfId: null,
        contextJson: JSON.stringify({ accountId: account.id, orderId, trackingId }),
      }).run();
      await tx.insert(purchaseCostOrders).values({
        id: orderId, trackingId, kind: "additional", accountId: account.id, externalReference: normalized.externalReference, state: "draft", revision: 0,
        createdBy: actorId, createdAt: now, updatedBy: actorId, updatedAt: now, occurredAt: value.occurredAt ?? null, recordedAt: null, operationId,
      }).run();
      for (const [position, item] of normalized.items.entries()) {
        const favorite = item.sourceFavoriteId ? await tx.select().from(favorites).where(eq(favorites.id, item.sourceFavoriteId)).get() : null;
        if (item.sourceFavoriteId && (!favorite || favorite.workspaceId !== tracking.workspaceId)) throw new DomainError("O favorito de origem não pertence a este espaço.", 403);
        const itemId = crypto.randomUUID(), costItemId = crypto.randomUUID();
        await tx.insert(purchaseAdditionalOrderItems).values({
          id: itemId, orderId, sourceFavoriteId: favorite?.id ?? null, name: favorite?.name ?? item.name,
          url: favorite?.url ?? item.url, platform: favorite?.platform ?? item.platform, visualKey: favorite?.visualKey ?? resolveProductCategory(item.name),
          variant: favorite?.variant ?? item.variant ?? null, notes: favorite?.notes ?? item.notes ?? null, quantity: item.quantity,
          itemOrder: position, createdBy: actorId, createdAt: now,
        }).run();
        await tx.insert(purchaseItemCosts).values({
          id: costItemId, trackingId, orderId, purchaseItemId: null, additionalOrderItemId: itemId, itemOrder: position,
          effectivePriceState: "pending", effectivePriceUnitCents: null, chinaFreightState: "pending", chinaFreightUnitCents: null,
          nativeProductState: item.nativeProductState, nativeProductCnyMinor: item.nativeProductCnyMinor,
          nativeChinaState: item.nativeChinaState, nativeChinaCnyMinor: item.nativeChinaCnyMinor, valuationVersion: 2,
        }).run();
        await tx.insert(purchaseCostParticipants).values(item.participants.map((person, allocationOrder) => ({
          costItemId, personId: person.personId, allocationOrder, weightMode: person.weightMode,
          weight: person.weightMode === "equal" ? 1 : person.weight,
        }))).run();
      }
      await tx.insert(purchaseCostCharges).values({
        id: crypto.randomUUID(), trackingId, orderId, packageId: null, chargeType: "products", paymentModel: "components_v1",
        valueState: null, amountCents: null, paymentMethod: null, feeBps: null, paymentStatus: "pending", paidBy: null,
        paidAt: null, createdAt: now, updatedAt: now,
      }).run();
      await updateTracking(tx, trackingId, value.expectedRevision, actorId);
      return { orderId, replayed: false };
    }));
  }

  async function updateDraft(trackingId: string, orderId: string, input: unknown) {
    const value = updateDraftSchema.parse(input);
    const normalized = { ...value, item: { ...value.item, variant: value.item.variant?.trim() || null } };
    const item = normalized.item;
    if (new Set(item.participants.map(row => row.personId)).size !== item.participants.length) throw new DomainError("Cada participante deve aparecer uma única vez por produto.", 400);
    const totalWeight = item.participants.reduce((sum, row) => sum + BigInt(row.weightMode === "equal" ? 1 : row.weight), 0n);
    if (item.participants.some(row => row.weightMode !== item.participants[0].weightMode) || totalWeight === 0n) throw new DomainError("A divisão do item precisa usar uma única modalidade e ter peso positivo.", 400);
    if (item.participants[0].weightMode === "percentage" && totalWeight !== 10_000n) throw new DomainError("Os percentuais do item precisam somar 100%.", 400);
    assertValue(item.nativeProductState, item.nativeProductCnyMinor, "produto");
    assertValue(item.nativeChinaState, item.nativeChinaCnyMinor, "frete China");

    return serializeDomainTransaction(() => db.transaction(async tx => {
      const tracking = await tx.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.id, trackingId)).get();
      if (!tracking) throw new DomainError("Acompanhamento de custos não encontrado.", 404);
      await authorization(tx, actorId).requireWorkspaceMember(tracking.workspaceId);
      const payloadHash = hash({ trackingId, orderId, ...normalized });
      const prior = await tx.select().from(financialOperations).where(and(eq(financialOperations.workspaceId, tracking.workspaceId), eq(financialOperations.idempotencyKey, value.idempotencyKey))).get();
      if (prior) {
        if (prior.operationType !== "additional_order_draft_updated" || prior.payloadHash !== payloadHash) throw new DomainError("Esta chave já foi usada com outros dados.", 409, "IDEMPOTENCY_CONFLICT");
        return { operationId: prior.id, replayed: true };
      }
      if (tracking.status !== "open" || tracking.revision !== value.expectedRevision) throw new DomainError("Os custos foram alterados ou encerrados. Atualize a tela.", 409);
      const order = await tx.select().from(purchaseCostOrders).where(and(eq(purchaseCostOrders.id, orderId), eq(purchaseCostOrders.trackingId, trackingId))).get();
      if (!order || order.kind !== "additional" || order.state !== "draft" || !order.accountId) throw new DomainError("Somente um rascunho ainda não pago pode ser editado.", 409);
      const account = await tx.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, value.accountId)).get();
      if (!account || account.deletedAt || account.workspaceId !== tracking.workspaceId || account.status !== "active") throw new DomainError("Escolha uma conta HubBuy ativa e conciliada deste espaço.", 409, "HUBBUY_ACCOUNT_UNAVAILABLE");
      if (order.externalReference) {
        const duplicateReference = await tx.select().from(purchaseCostOrders).where(and(eq(purchaseCostOrders.accountId, account.id), eq(purchaseCostOrders.externalReference, order.externalReference))).get();
        if (duplicateReference && duplicateReference.id !== order.id) throw new DomainError("Esta referência de pedido já foi registrada nesta conta.", 409, "ORDER_REFERENCE_DUPLICATE");
      }
      await authorization(tx, actorId).requireWorkspaceMembers([...new Set(item.participants.map(person => person.personId))], tracking.workspaceId);
      const [charge, costs] = await Promise.all([
        tx.select().from(purchaseCostCharges).where(and(eq(purchaseCostCharges.orderId, orderId), eq(purchaseCostCharges.chargeType, "products"))).get(),
        tx.select().from(purchaseItemCosts).where(eq(purchaseItemCosts.orderId, orderId)).orderBy(asc(purchaseItemCosts.itemOrder)).all(),
      ]);
      if (!charge || charge.paymentStatus !== "pending" || costs.length !== 1 || !costs[0].additionalOrderItemId) throw new DomainError("Este rascunho não pode ser editado neste fluxo.", 409);
      const operationId = crypto.randomUUID(), now = new Date(), cost = costs[0], itemId = cost.additionalOrderItemId;
      if (!itemId) throw new DomainError("Este rascunho não pode ser editado neste fluxo.", 409);
      await tx.insert(financialOperations).values({
        id: operationId, workspaceId: tracking.workspaceId, operationType: "additional_order_draft_updated", idempotencyKey: value.idempotencyKey,
        payloadHash, actorId, occurredAt: null, recordedAt: now, reason: null, reversalOfId: null,
        contextJson: JSON.stringify({ accountId: account.id, orderId, trackingId, itemId }),
      }).run();
      const updatedItem = await tx.update(purchaseAdditionalOrderItems).set({
        name: item.name, url: item.url, platform: item.platform, variant: item.variant, quantity: item.quantity,
      }).where(eq(purchaseAdditionalOrderItems.id, itemId)).returning().get();
      if (!updatedItem) throw new DomainError("O produto deste rascunho não foi encontrado.", 409);
      await tx.update(purchaseItemCosts).set({
        nativeProductState: item.nativeProductState, nativeProductCnyMinor: item.nativeProductCnyMinor,
        nativeChinaState: item.nativeChinaState, nativeChinaCnyMinor: item.nativeChinaCnyMinor,
      }).where(eq(purchaseItemCosts.id, cost.id)).run();
      await tx.delete(purchaseCostParticipants).where(eq(purchaseCostParticipants.costItemId, cost.id)).run();
      await tx.insert(purchaseCostParticipants).values(item.participants.map((person, allocationOrder) => ({
        costItemId: cost.id, personId: person.personId, allocationOrder,
        weightMode: person.weightMode, weight: person.weightMode === "equal" ? 1 : person.weight,
      }))).run();
      const updatedOrder = await tx.update(purchaseCostOrders).set({
        accountId: account.id, revision: order.revision + 1, operationId, updatedBy: actorId, updatedAt: now,
      }).where(and(eq(purchaseCostOrders.id, orderId), eq(purchaseCostOrders.revision, order.revision), eq(purchaseCostOrders.state, "draft"))).returning().get();
      if (!updatedOrder) throw new DomainError("O rascunho foi alterado em outra sessão. Atualize a tela.", 409);
      await updateTracking(tx, trackingId, value.expectedRevision, actorId);
      return { operationId, replayed: false };
    }));
  }

  async function recordExternalPayment(trackingId: string, orderId: string, input: unknown) {
    const value = paymentSchema.parse(input);
    return serializeDomainTransaction(() => db.transaction(async tx => {
      const tracking = await tx.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.id, trackingId)).get();
      if (!tracking) throw new DomainError("Acompanhamento de custos não encontrado.", 404);
      await authorization(tx, actorId).requireWorkspaceMember(tracking.workspaceId);
      const payloadHash = hash({ trackingId, orderId, ...value });
      const prior = await tx.select().from(financialOperations).where(and(eq(financialOperations.workspaceId, tracking.workspaceId), eq(financialOperations.idempotencyKey, value.idempotencyKey))).get();
      if (prior) {
        if (prior.operationType !== "order_payment_recorded" || prior.payloadHash !== payloadHash) throw new DomainError("Esta chave já foi usada com outros dados.", 409, "IDEMPOTENCY_CONFLICT");
        return { operationId: prior.id, replayed: true };
      }
      if (tracking.status !== "open" || tracking.revision !== value.expectedRevision) throw new DomainError("Os custos foram alterados ou encerrados. Atualize a tela.", 409);
      const order = await tx.select().from(purchaseCostOrders).where(and(eq(purchaseCostOrders.id, orderId), eq(purchaseCostOrders.trackingId, trackingId))).get();
      if (!order || order.kind !== "additional" || order.state !== "draft" || !order.accountId) throw new DomainError("Este pedido não está em rascunho para pagamento.", 409);
      const account = await tx.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, order.accountId)).get();
      if (!account || account.deletedAt || account.workspaceId !== tracking.workspaceId || account.status !== "active") throw new DomainError("A conta HubBuy do pedido não está ativa e conciliada.", 409);
      const [charge, costs] = await Promise.all([
        tx.select().from(purchaseCostCharges).where(and(eq(purchaseCostCharges.orderId, orderId), eq(purchaseCostCharges.chargeType, "products"))).get(),
        tx.select().from(purchaseItemCosts).where(eq(purchaseItemCosts.orderId, orderId)).orderBy(asc(purchaseItemCosts.itemOrder)).all(),
      ]);
      if (!charge || charge.paymentStatus !== "pending" || !costs.length) throw new DomainError("O pedido não tem uma cobrança pendente válida.", 409);
      if (costs.some(cost => cost.nativeProductState === "unknown" || cost.nativeChinaState === "unknown")) throw new DomainError("Informe os valores em CNY ou marque sem cobrança antes de registrar o pedido.", 409, "ORDER_COSTS_UNRESOLVED");
      const orderCny = costs.reduce((sum, cost) => sum + BigInt(cost.nativeProductCnyMinor ?? 0) + BigInt(cost.nativeChinaCnyMinor ?? 0), 0n);
      if (orderCny <= 0n || orderCny > BigInt(maxMinor) || Number(orderCny) !== value.conversionCnyMinor || value.principalBrlCents !== value.conversionBrlCents) throw new DomainError("O principal e o par de conversão precisam fechar com o total exato do pedido.", 409, "ORDER_PAYMENT_CONVERSION_MISMATCH");
      const settings = await tx.select().from(workspaceCostSettings).where(eq(workspaceCostSettings.workspaceId, tracking.workspaceId)).get();
      const feeBps = value.feeBps ?? settings?.[value.paymentMethod === "pix" ? "pixBps" : "cardBps"] ?? (value.paymentMethod === "pix" ? 100 : 500);
      const feeBrlCents = calculateExternalFeeBrl(value.principalBrlCents, feeBps);
      const members = await tx.select({ id: workspaceMembers.userId }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, tracking.workspaceId)).all();
      const memberIds = new Set(members.map(member => member.id));
      const participantRows = costs.length ? await tx.select().from(purchaseCostParticipants).where(inArray(purchaseCostParticipants.costItemId, costs.map(cost => cost.id))).orderBy(asc(purchaseCostParticipants.allocationOrder)).all() : [];
      const byCost = new Map<string, typeof participantRows>();
      for (const row of participantRows) byCost.set(row.costItemId, [...(byCost.get(row.costItemId) ?? []), row]);
      const targets: { id: string; order: number; costItemId: string; costComponent: "product" | "china"; personId: string; cnyMinor: number }[] = [];
      let targetOrder = 0;
      for (const cost of costs) {
        const people = byCost.get(cost.id) ?? [];
        if (!people.length || people.some(person => !memberIds.has(person.personId))) throw new DomainError("Defina participantes válidos para cada item do pedido.", 409);
        for (const [component, amount] of [["product", cost.nativeProductCnyMinor ?? 0], ["china", cost.nativeChinaCnyMinor ?? 0]] as const) {
          if (amount <= 0) continue;
          const shares = allocateExactMinor(amount, people.map(person => ({ id: person.personId, order: person.allocationOrder, weight: person.weight })));
          people.forEach((person, index) => { if (shares[index] > 0) targets.push({ id: `${cost.id}:${component}:${person.personId}`, order: targetOrder++, costItemId: cost.id, costComponent: component, personId: person.personId, cnyMinor: shares[index] }); });
        }
      }
      if (targets.reduce((sum, target) => sum + BigInt(target.cnyMinor), 0n) !== orderCny) throw new DomainError("A divisão por pessoa não fecha o principal nativo.", 409);
      const principalShares = allocateExactMinor(value.principalBrlCents, targets.map(target => ({ id: target.id, order: target.order, weight: target.cnyMinor })));
      const feeShares = allocateExactMinor(feeBrlCents, targets.map((target, index) => ({ id: target.id, order: target.order, weight: principalShares[index] })));
      const operationId = crypto.randomUUID(), componentId = crypto.randomUUID(), now = new Date();
      await tx.insert(financialOperations).values({
        id: operationId, workspaceId: tracking.workspaceId, operationType: "order_payment_recorded", idempotencyKey: value.idempotencyKey,
        payloadHash, actorId, occurredAt: order.occurredAt, recordedAt: now, reason: null, reversalOfId: null,
        contextJson: JSON.stringify({ accountId: account.id, orderId, trackingId, source: value.paymentMethod, cnyMinor: Number(orderCny), principalBrlCents: value.principalBrlCents, feeBrlCents }),
      }).run();
      await tx.insert(purchasePaymentComponents).values({
        id: componentId, orderId, chargeId: charge.id, operationId, componentOrder: 0, sourceType: value.paymentMethod, sourceCurrency: "BRL",
        sourceAccountId: null, principalAmountMinor: value.principalBrlCents, cnyMinor: Number(orderCny), principalBrlCents: value.principalBrlCents,
        feeBps, feeBrlCents, conversionCnyMinor: value.conversionCnyMinor, conversionBrlCents: value.conversionBrlCents,
        confirmedBy: actorId, confirmedAt: now, createdAt: now,
      }).run();
      await tx.insert(purchasePaymentAllocations).values(targets.map((target, index) => ({
        id: crypto.randomUUID(), componentId, costItemId: target.costItemId, costComponent: target.costComponent, personId: target.personId,
        allocationOrder: target.order, cnyMinor: target.cnyMinor, principalBrlCents: principalShares[index], feeBrlCents: feeShares[index], historicalBrlCents: principalShares[index],
      }))).run();
      await tx.update(purchaseCostCharges).set({ paymentModel: "components_v1", paymentMethod: value.paymentMethod, feeBps, paymentStatus: "paid", paidBy: actorId, paidAt: now, updatedAt: now }).where(eq(purchaseCostCharges.id, charge.id)).run();
      await tx.update(purchaseCostOrders).set({ state: "recorded", revision: order.revision + 1, operationId, recordedAt: now, updatedBy: actorId, updatedAt: now }).where(and(eq(purchaseCostOrders.id, orderId), eq(purchaseCostOrders.revision, order.revision), eq(purchaseCostOrders.state, "draft"))).run();
      await updateTracking(tx, trackingId, value.expectedRevision, actorId);
      return { operationId, replayed: false, cnyMinor: Number(orderCny), principalBrlCents: value.principalBrlCents, feeBrlCents };
    }));
  }

  async function recordMixedPaymentInTransaction(tx: CostTransaction, trackingId: string, orderId: string, input: unknown) {
    const value = mixedPaymentSchema.parse(input);
    const balanceFunding = [...value.balanceFunding].sort((a, b) => a.costItemId.localeCompare(b.costItemId) || a.costComponent.localeCompare(b.costComponent) || a.beneficiaryId.localeCompare(b.beneficiaryId) || a.lenderId.localeCompare(b.lenderId));
    const normalized = { ...value, balanceFunding };
      const tracking = await tx.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.id, trackingId)).get();
      if (!tracking) throw new DomainError("Acompanhamento de custos não encontrado.", 404);
      await authorization(tx, actorId).requireWorkspaceMember(tracking.workspaceId);
      const payloadHash = hash({ trackingId, orderId, ...normalized });
      const prior = await tx.select().from(financialOperations).where(and(eq(financialOperations.workspaceId, tracking.workspaceId), eq(financialOperations.idempotencyKey, value.idempotencyKey))).get();
      if (prior) {
        if (prior.operationType !== "order_payment_recorded" || prior.payloadHash !== payloadHash) throw new DomainError("Esta chave já foi usada com outros dados.", 409, "IDEMPOTENCY_CONFLICT");
        return { operationId: prior.id, replayed: true };
      }
      if (tracking.status !== "open" || tracking.revision !== value.expectedRevision) throw new DomainError("Os custos foram alterados ou encerrados. Atualize a tela.", 409);
      const order = await tx.select().from(purchaseCostOrders).where(and(eq(purchaseCostOrders.id, orderId), eq(purchaseCostOrders.trackingId, trackingId))).get();
      if (!order || order.kind !== "additional" || order.state !== "draft" || !order.accountId) throw new DomainError("Este pedido não está em rascunho para pagamento.", 409);
      const account = await tx.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, order.accountId)).get();
      if (!account || account.deletedAt || account.workspaceId !== tracking.workspaceId || account.status !== "active") throw new DomainError("A conta HubBuy do pedido não está ativa e conciliada.", 409, "HUBBUY_ACCOUNT_UNAVAILABLE");
      const [charge, costs] = await Promise.all([
        tx.select().from(purchaseCostCharges).where(and(eq(purchaseCostCharges.orderId, orderId), eq(purchaseCostCharges.chargeType, "products"))).get(),
        tx.select().from(purchaseItemCosts).where(eq(purchaseItemCosts.orderId, orderId)).orderBy(asc(purchaseItemCosts.itemOrder)).all(),
      ]);
      if (!charge || charge.paymentStatus !== "pending" || !costs.length) throw new DomainError("O pedido não tem uma cobrança pendente válida.", 409);
      if (costs.some(cost => cost.nativeProductState === "unknown" || cost.nativeChinaState === "unknown")) throw new DomainError("Informe os valores em CNY ou marque sem cobrança antes de registrar o pedido.", 409, "ORDER_COSTS_UNRESOLVED");
      const orderCnyBig = costs.reduce((sum, cost) => sum + BigInt(cost.nativeProductCnyMinor ?? 0) + BigInt(cost.nativeChinaCnyMinor ?? 0), 0n);
      if (orderCnyBig <= 0n || orderCnyBig > BigInt(maxMinor)) throw new DomainError("O pedido precisa ter um principal CNY positivo dentro do limite permitido.", 409);
      const orderCny = Number(orderCnyBig);
      const memberRows = await tx.select({ id: workspaceMembers.userId }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, tracking.workspaceId)).all();
      const memberIds = new Set(memberRows.map(member => member.id));
      const participantRows = await tx.select().from(purchaseCostParticipants).where(inArray(purchaseCostParticipants.costItemId, costs.map(cost => cost.id))).orderBy(asc(purchaseCostParticipants.costItemId), asc(purchaseCostParticipants.allocationOrder)).all();
      const participantsByCost = new Map<string, typeof participantRows>();
      for (const row of participantRows) participantsByCost.set(row.costItemId, [...(participantsByCost.get(row.costItemId) ?? []), row]);
      const targets: { id: string; order: number; costItemId: string; costComponent: "product" | "china"; personId: string; cnyMinor: number }[] = [];
      let targetOrder = 0;
      for (const cost of costs) {
        const people = participantsByCost.get(cost.id) ?? [];
        if (!people.length || people.some(person => !memberIds.has(person.personId))) throw new DomainError("Defina participantes válidos para cada item do pedido.", 409);
        for (const [component, amount] of [["product", cost.nativeProductCnyMinor ?? 0], ["china", cost.nativeChinaCnyMinor ?? 0]] as const) {
          if (amount <= 0) continue;
          const shares = allocateExactMinor(amount, people.map(person => ({ id: person.personId, order: person.allocationOrder, weight: person.weight })));
          people.forEach((person, index) => { if (shares[index] > 0) targets.push({ id: `${cost.id}:${component}:${person.personId}`, order: targetOrder++, costItemId: cost.id, costComponent: component, personId: person.personId, cnyMinor: shares[index] }); });
        }
      }
      if (targets.reduce((sum, target) => sum + BigInt(target.cnyMinor), 0n) !== orderCnyBig) throw new DomainError("A divisão por pessoa não fecha o principal nativo.", 409);
      const targetsByKey = new Map(targets.map(target => [`${target.costItemId}:${target.costComponent}:${target.personId}`, target]));
      const requested = new Map<string, typeof balanceFunding>();
      for (const funding of balanceFunding) {
        if (funding.lenderId === funding.beneficiaryId) throw new DomainError("O adiantamento só registra saldo de outra pessoa; o saldo próprio é reservado automaticamente.", 400);
        const targetKey = `${funding.costItemId}:${funding.costComponent}:${funding.beneficiaryId}`;
        if (!targetsByKey.has(targetKey) || !memberIds.has(funding.lenderId)) throw new DomainError("O direcionamento de saldo referencia um beneficiário, financiador ou item inválido.", 403);
        requested.set(targetKey, [...(requested.get(targetKey) ?? []), funding]);
      }
      for (const [key, rows] of requested) {
        if (new Set(rows.map(row => row.lenderId)).size !== rows.length) throw new DomainError("Combine os valores do mesmo financiador em uma única linha.", 400);
        const target = targetsByKey.get(key)!;
        if (rows.reduce((sum, row) => sum + BigInt(row.cnyMinor), 0n) > BigInt(target.cnyMinor)) throw new DomainError("O saldo direcionado supera o custo nativo deste beneficiário.", 409);
      }
      const balanceState = await calculateHubBuyBalanceState(tx, account.id);
      if (balanceState.account.status !== "active" || !balanceState.reconciled || balanceState.ledgerBalanceCnyMinor !== account.balanceCnyMinor) throw new DomainError("A conta precisa de conciliação antes de usar o saldo.", 409, "BALANCE_RECONCILIATION_REQUIRED");
      const entrySequence = new Map(balanceState.entries.filter(entry => entry.direction === "credit").map(entry => [entry.id, entry.sequence]));
      const consumedByShare = new Map<string, { cny: bigint; brl: bigint }>();
      for (const consumption of balanceState.consumptions) {
        const current = consumedByShare.get(consumption.creditShareId) ?? { cny: 0n, brl: 0n };
        current.cny += BigInt(consumption.amountCnyMinor); current.brl += BigInt(consumption.historicalBrlCents);
        consumedByShare.set(consumption.creditShareId, current);
      }
      const sharesByCredit = new Map<string, typeof balanceState.shares>();
      for (const share of balanceState.shares) sharesByCredit.set(share.creditEntryId, [...(sharesByCredit.get(share.creditEntryId) ?? []), share]);
      const lotsByPerson = new Map<string, { creditId: string; sequence: number; availableCnyMinor: number; availableHistoricalBrlCents: number }[]>();
      for (const entry of balanceState.entries.filter(row => row.direction === "credit").sort((a, b) => a.sequence - b.sequence)) {
        for (const share of sharesByCredit.get(entry.id) ?? []) {
          const used = consumedByShare.get(share.id) ?? { cny: 0n, brl: 0n };
          const cny = BigInt(share.amountCnyMinor) - used.cny, brl = BigInt(share.historicalBrlCents) - used.brl;
          if (cny <= 0n) continue;
          if (brl < 0n || cny > BigInt(maxMinor) || brl > BigInt(maxMinor)) throw new DomainError("Os direitos do lote estão inconsistentes e precisam de conciliação.", 409, "BALANCE_RECONCILIATION_REQUIRED");
          lotsByPerson.set(share.personId, [...(lotsByPerson.get(share.personId) ?? []), { creditId: share.id, sequence: entrySequence.get(entry.id)!, availableCnyMinor: Number(cny), availableHistoricalBrlCents: Number(brl) }]);
        }
      }
      const balanceAssignments: { id: string; order: number; target: typeof targets[number]; lenderId: string; cnyMinor: number; historicalBrlCents: number; consumptions: { creditId: string; sequence: number; cnyMinor: number; historicalBrlCents: number }[] }[] = [];
      const consumeFor = (target: typeof targets[number], lenderId: string, amountCnyMinor: number) => {
        if (amountCnyMinor <= 0) return;
        const lots = lotsByPerson.get(lenderId) ?? [];
        let preview;
        try { preview = previewFifoConsumption(amountCnyMinor, lots); }
        catch { throw new DomainError(`${lenderId === target.personId ? "O saldo próprio" : "O saldo direcionado"} é insuficiente para o pedido.`, 409, "BALANCE_INSUFFICIENT"); }
        const lotsById = new Map(lots.map(lot => [lot.creditId, lot]));
        for (const used of preview.consumptions) {
          const lot = lotsById.get(used.creditId)!;
          lot.availableCnyMinor -= used.cnyMinor;
          lot.availableHistoricalBrlCents -= used.historicalBrlCents;
        }
        balanceAssignments.push({ id: `balance:${target.id}:${lenderId}`, order: balanceAssignments.length, target, lenderId, cnyMinor: amountCnyMinor, historicalBrlCents: preview.historicalBrlCents, consumptions: preview.consumptions });
      };
      const crossByTarget = new Map<string, bigint>();
      for (const [key, rows] of requested) crossByTarget.set(key, rows.reduce((sum, row) => sum + BigInt(row.cnyMinor), 0n));
      if (value.useOwnBalance) for (const target of targets) {
        const key = `${target.costItemId}:${target.costComponent}:${target.personId}`;
        const requestedCross = crossByTarget.get(key) ?? 0n;
        const ownAmount = Math.min(target.cnyMinor - Number(requestedCross), (lotsByPerson.get(target.personId) ?? []).reduce((sum, lot) => sum + lot.availableCnyMinor, 0));
        consumeFor(target, target.personId, ownAmount);
      }
      for (const target of targets) {
        const key = `${target.costItemId}:${target.costComponent}:${target.personId}`;
        for (const funding of requested.get(key) ?? []) consumeFor(target, funding.lenderId, funding.cnyMinor);
      }
      const fundedByTarget = new Map<string, number>();
      for (const source of balanceAssignments) fundedByTarget.set(source.target.id, (fundedByTarget.get(source.target.id) ?? 0) + source.cnyMinor);
      const balanceTotal = balanceAssignments.reduce((sum, source) => sum + BigInt(source.cnyMinor), 0n);
      const externalCny = orderCny - Number(balanceTotal);
      const external = value.external ?? null;
      if (externalCny > 0 && !external) throw new DomainError("Informe o complemento externo que cobre o restante do pedido.", 409, "EXTERNAL_PAYMENT_REQUIRED");
      if (externalCny === 0 && external) throw new DomainError("Não há complemento externo porque o saldo cobre o pedido inteiro.", 409);
      if (external && (external.conversionCnyMinor !== externalCny || external.conversionBrlCents !== external.principalBrlCents)) throw new DomainError("O par de conversão precisa representar exatamente o complemento externo em CNY e BRL.", 409, "ORDER_PAYMENT_CONVERSION_MISMATCH");
      const settings = await tx.select().from(workspaceCostSettings).where(eq(workspaceCostSettings.workspaceId, tracking.workspaceId)).get();
      const feeBps = external ? external.feeBps ?? settings?.[external.paymentMethod === "pix" ? "pixBps" : "cardBps"] ?? (external.paymentMethod === "pix" ? 100 : 500) : 0;
      const externalFee = external ? calculateExternalFeeBrl(external.principalBrlCents, feeBps) : 0;
      const externalSourceId = "external:order";
      const sources = [
        ...balanceAssignments.map(source => ({ id: source.id, order: source.order, kind: "balance" as const, cnyMinor: source.cnyMinor, principalBrlCents: source.historicalBrlCents, feeBps: 0 })),
        ...(external ? [{ id: externalSourceId, order: balanceAssignments.length, kind: external.paymentMethod, cnyMinor: externalCny, principalBrlCents: external.principalBrlCents, feeBps }] : []),
      ];
      const targetsWithSources = targets.map(target => ({
        ...target,
        eligibleSourceIds: [
          ...balanceAssignments.filter(source => source.target.id === target.id).map(source => source.id),
          ...(external ? [externalSourceId] : []),
        ],
      }));
      let fundingResult;
      try { fundingResult = calculatePaymentFunding({ sources, targets: targetsWithSources }); }
      catch (error) { throw new DomainError(error instanceof Error ? error.message : "A composição das fontes é inviável.", 409, "PAYMENT_COMPOSITION_INVALID"); }
      const allocationBySourceAndTarget = new Map(fundingResult.allocations.map(row => [`${row.sourceId}:${row.targetId}`, row]));
      for (const source of balanceAssignments) if (allocationBySourceAndTarget.get(`${source.id}:${source.target.id}`)?.cnyMinor !== source.cnyMinor) throw new DomainError("A matriz de saldo não preservou o direcionamento aprovado.", 409);
      if (external && targetsWithSources.some(target => fundingResult.allocations.filter(row => row.sourceId === externalSourceId && row.targetId === target.id).reduce((sum, row) => sum + row.cnyMinor, 0) !== target.cnyMinor - (fundedByTarget.get(target.id) ?? 0))) throw new DomainError("O complemento externo não fechou com os direcionamentos de saldo.", 409);

      const operationId = crypto.randomUUID(), now = new Date();
      const balanceHistoricalBrl = balanceAssignments.reduce((sum, source) => sum + BigInt(source.historicalBrlCents), 0n);
      await tx.insert(financialOperations).values({
        id: operationId, workspaceId: tracking.workspaceId, operationType: "order_payment_recorded", idempotencyKey: value.idempotencyKey,
        payloadHash, actorId, occurredAt: order.occurredAt, recordedAt: now, reason: null, reversalOfId: null,
        contextJson: JSON.stringify({ accountId: account.id, orderId, trackingId, balanceCnyMinor: Number(balanceTotal), externalCnyMinor: externalCny, externalPrincipalBrlCents: external?.principalBrlCents ?? 0, externalFeeBrlCents: externalFee, financing: balanceAssignments.filter(row => row.lenderId !== row.target.personId).map(row => ({ lenderId: row.lenderId, beneficiaryId: row.target.personId, cnyMinor: row.cnyMinor })) }),
      }).run();
      let debitEntryId: string | null = null;
      if (balanceTotal > 0n) {
        debitEntryId = crypto.randomUUID();
        const sequence = Math.max(-1, ...balanceState.entries.map(entry => entry.sequence)) + 1;
        await tx.insert(hubbuyBalanceEntries).values({ id: debitEntryId, accountId: account.id, operationId, sequence, direction: "debit", amountCnyMinor: Number(balanceTotal), historicalBrlCents: Number(balanceHistoricalBrl), sourceType: "purchase_payment", sourceId: orderId, reversalOfEntryId: null, createdAt: now }).run();
      }
      const componentIdBySource = new Map<string, string>();
      const componentRows = sources.map(source => {
        const id = crypto.randomUUID(); componentIdBySource.set(source.id, id);
        const isBalance = source.kind === "balance";
        const funding = fundingResult.allocations.filter(row => row.sourceId === source.id);
        const sourceCny = funding.reduce((sum, row) => sum + row.cnyMinor, 0);
        const sourceBrl = funding.reduce((sum, row) => sum + row.principalBrlCents, 0);
        const sourceFee = funding.reduce((sum, row) => sum + row.feeBrlCents, 0);
        const ext = isBalance ? null : external!;
        return {
          id, orderId, chargeId: charge.id, operationId, componentOrder: source.order, sourceType: source.kind,
          sourceCurrency: isBalance ? "CNY" as const : "BRL" as const, sourceAccountId: isBalance ? account.id : null,
          principalAmountMinor: isBalance ? sourceCny : sourceBrl, cnyMinor: sourceCny, principalBrlCents: sourceBrl,
          feeBps: isBalance ? 0 : feeBps, feeBrlCents: sourceFee,
          conversionCnyMinor: ext ? externalCny : null, conversionBrlCents: ext ? ext.conversionBrlCents : null,
          confirmedBy: actorId, confirmedAt: now, createdAt: now,
        };
      });
      for (let index = 0; index < componentRows.length; index += 100) await tx.insert(purchasePaymentComponents).values(componentRows.slice(index, index + 100)).run();
      const allocationIdBySourceTarget = new Map<string, string>();
      const paymentAllocations = fundingResult.allocations.map((allocation, allocationOrder) => {
        const targetRow = targets.find(row => row.id === allocation.targetId)!;
        const id = crypto.randomUUID(); allocationIdBySourceTarget.set(`${allocation.sourceId}:${allocation.targetId}`, id);
        return {
          id, componentId: componentIdBySource.get(allocation.sourceId)!, costItemId: targetRow.costItemId, costComponent: targetRow.costComponent,
          personId: targetRow.personId, allocationOrder, cnyMinor: allocation.cnyMinor, principalBrlCents: allocation.principalBrlCents,
          feeBrlCents: allocation.feeBrlCents, historicalBrlCents: allocation.principalBrlCents,
        };
      });
      for (let index = 0; index < paymentAllocations.length; index += 100) await tx.insert(purchasePaymentAllocations).values(paymentAllocations.slice(index, index + 100)).run();
      if (balanceTotal > 0n) {
        const consumptionRows: { id: string; debitEntryId: string; creditShareId: string; allocationOrder: number; amountCnyMinor: number; historicalBrlCents: number; paymentAllocationId: string; createdAt: Date }[] = [];
        const financingRows: { id: string; operationId: string; consumptionId: string; entryType: "advance"; lenderId: string; beneficiaryId: string; amountCnyMinor: number; historicalBrlCents: number; settledAmountCents: null; settledCurrency: null; occurredAt: Date | null; recordedAt: Date }[] = [];
        let consumptionOrder = 0;
        for (const source of balanceAssignments) {
          const paymentAllocationId = allocationIdBySourceTarget.get(`${source.id}:${source.target.id}`)!;
          for (const used of source.consumptions) {
            const consumptionId = crypto.randomUUID();
            consumptionRows.push({ id: consumptionId, debitEntryId: debitEntryId!, creditShareId: used.creditId, allocationOrder: consumptionOrder++, amountCnyMinor: used.cnyMinor, historicalBrlCents: used.historicalBrlCents, paymentAllocationId, createdAt: now });
            if (source.lenderId !== source.target.personId) financingRows.push({ id: crypto.randomUUID(), operationId, consumptionId, entryType: "advance", lenderId: source.lenderId, beneficiaryId: source.target.personId, amountCnyMinor: used.cnyMinor, historicalBrlCents: used.historicalBrlCents, settledAmountCents: null, settledCurrency: null, occurredAt: order.occurredAt, recordedAt: now });
          }
        }
        for (let index = 0; index < consumptionRows.length; index += 100) await tx.insert(hubbuyBalanceConsumptions).values(consumptionRows.slice(index, index + 100)).run();
        for (let index = 0; index < financingRows.length; index += 100) await tx.insert(memberBalanceFinancingEntries).values(financingRows.slice(index, index + 100)).run();
        const updatedAccount = await tx.update(hubbuyAccounts).set({ balanceCnyMinor: account.balanceCnyMinor - Number(balanceTotal), revision: account.revision + 1, updatedBy: actorId, updatedAt: now })
          .where(and(eq(hubbuyAccounts.id, account.id), eq(hubbuyAccounts.revision, account.revision), eq(hubbuyAccounts.status, "active"))).returning().get();
        if (!updatedAccount) throw new DomainError("O saldo mudou durante a confirmação. Atualize a tela e tente novamente.", 409, "BALANCE_REVISION_CONFLICT");
      }
      await tx.update(purchaseCostCharges).set({ paymentModel: "components_v1", paymentMethod: external?.paymentMethod ?? null, feeBps: external ? feeBps : null, paymentStatus: "paid", paidBy: actorId, paidAt: now, updatedAt: now }).where(eq(purchaseCostCharges.id, charge.id)).run();
      await tx.update(purchaseCostOrders).set({ state: "recorded", revision: order.revision + 1, operationId, recordedAt: now, updatedBy: actorId, updatedAt: now }).where(and(eq(purchaseCostOrders.id, orderId), eq(purchaseCostOrders.revision, order.revision), eq(purchaseCostOrders.state, "draft"))).run();
      await updateTracking(tx, trackingId, value.expectedRevision, actorId);
      return { operationId, replayed: false, cnyMinor: orderCny, balanceCnyMinor: Number(balanceTotal), historicalBrlCents: Number(balanceHistoricalBrl), externalCnyMinor: externalCny, principalBrlCents: external?.principalBrlCents ?? 0, feeBrlCents: externalFee };
  }

  async function recordMixedPayment(trackingId: string, orderId: string, input: unknown) {
    return serializeDomainTransaction(() => db.transaction(tx => recordMixedPaymentInTransaction(tx, trackingId, orderId, input)));
  }

  async function voidDraft(trackingId: string, orderId: string, input: unknown) {
    const value = voidOrderSchema.parse(input);
    const payloadHash = hash({ trackingId, orderId, ...value });
    return serializeDomainTransaction(() => db.transaction(async tx => {
      const tracking = await tx.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.id, trackingId)).get();
      if (!tracking) throw new DomainError("Acompanhamento de custos não encontrado.", 404);
      await authorization(tx, actorId).requireWorkspaceMember(tracking.workspaceId);
      const prior = await tx.select().from(financialOperations).where(and(eq(financialOperations.workspaceId, tracking.workspaceId), eq(financialOperations.idempotencyKey, value.idempotencyKey))).get();
      if (prior) {
        if (prior.operationType !== "additional_order_voided" || prior.payloadHash !== payloadHash) throw new DomainError("Esta chave já foi usada com outros dados.", 409, "IDEMPOTENCY_CONFLICT");
        return { operationId: prior.id, replayed: true };
      }
      if (tracking.status !== "open" || tracking.revision !== value.expectedRevision) throw new DomainError("Os custos foram alterados ou encerrados. Atualize a tela.", 409);
      const order = await tx.select().from(purchaseCostOrders).where(and(eq(purchaseCostOrders.id, orderId), eq(purchaseCostOrders.trackingId, trackingId))).get();
      if (!order || order.kind !== "additional" || order.state !== "draft") throw new DomainError("Somente um rascunho ainda não pago pode ser descartado.", 409);
      const operationId = crypto.randomUUID(), now = new Date();
      await tx.insert(financialOperations).values({
        id: operationId, workspaceId: tracking.workspaceId, operationType: "additional_order_voided", idempotencyKey: value.idempotencyKey,
        payloadHash, actorId, occurredAt: null, recordedAt: now, reason: value.reason, reversalOfId: null,
        contextJson: JSON.stringify({ orderId, trackingId }),
      }).run();
      await tx.update(purchaseCostOrders).set({ state: "voided", revision: order.revision + 1, updatedBy: actorId, updatedAt: now })
        .where(and(eq(purchaseCostOrders.id, order.id), eq(purchaseCostOrders.state, "draft"), eq(purchaseCostOrders.revision, order.revision))).run();
      await updateTracking(tx, trackingId, value.expectedRevision, actorId);
      return { operationId, replayed: false };
    }));
  }

  return { createDraft, updateDraft, recordExternalPayment, recordMixedPayment, recordMixedPaymentInTransaction, voidDraft };
}
