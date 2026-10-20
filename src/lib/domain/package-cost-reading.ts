import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import { financialOperations, hubbuyAccounts, hubbuyBalanceConsumptions, hubbuyBalanceEntries, hubbuyReconciliationEvents, hubbuyReconciliationRuns, memberBalanceFinancingEntries, purchaseAdditionalOrderItems, purchaseCostCharges, purchaseCostOrders, purchaseOrderCorrections, purchaseCostPackageEvents, purchaseCostParticipants, purchaseCostRefundEvents, purchaseCostRefundParticipants, purchaseCostRefunds, purchaseCostReopenings, purchaseCostTrackings, purchaseItemCosts, purchaseItems, purchasePackageItems, purchasePackages, purchasePaymentAllocations, purchasePaymentComponents, purchases, user, workspaceMembers, workspaceCostSettings } from "../db/schema";
import { authorization } from "./authorization";
import { DomainError } from "./errors";
import { calculateCostTracking } from "./package-cost-calculations";
import { projectCostFinancialDisplay } from "./package-cost-display";
import { CostTransaction } from "./purchase-cost-initialization";

type CostReadDatabase = Pick<AppDatabase, "select">;
type CostDatabase = CostReadDatabase | CostTransaction;

function pendingPackageCharge() {
  return { value: { state: "pending" as const, amountCents: null }, paymentMethod: null, feeBps: null, paymentStatus: "pending" as const };
}

export async function readCostTracking(db: CostDatabase, userId: string, trackingId: string) {
  const tracking = await db.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.id, trackingId)).get();
  if (!tracking) throw new DomainError("Acompanhamento de custos não encontrado.", 404);
  await authorization(db, userId).requireWorkspaceMember(tracking.workspaceId);
  const purchase = await db.select().from(purchases).where(eq(purchases.id, tracking.purchaseId)).get();
  if (!purchase || purchase.workspaceId !== tracking.workspaceId) throw new DomainError("Acompanhamento de custos inválido.", 404);

  const [itemCosts, packages, charges, members, reopenings, refunds, orders] = await Promise.all([
    db.select().from(purchaseItemCosts).where(eq(purchaseItemCosts.trackingId, trackingId)).orderBy(asc(purchaseItemCosts.itemOrder)).all(),
    db.select().from(purchasePackages).where(eq(purchasePackages.trackingId, trackingId)).orderBy(asc(purchasePackages.packageOrder)).all(),
    db.select().from(purchaseCostCharges).where(eq(purchaseCostCharges.trackingId, trackingId)).orderBy(asc(purchaseCostCharges.chargeType)).all(),
    db.select({ id: user.id, name: user.name, email: user.email }).from(user).innerJoin(workspaceMembers, eq(workspaceMembers.userId, user.id)).where(eq(workspaceMembers.workspaceId, tracking.workspaceId)).orderBy(asc(user.name)).all(),
    db.select().from(purchaseCostReopenings).where(eq(purchaseCostReopenings.trackingId, trackingId)).orderBy(desc(purchaseCostReopenings.reopenedAt)).all(),
    db.select().from(purchaseCostRefunds).where(eq(purchaseCostRefunds.trackingId, trackingId)).orderBy(asc(purchaseCostRefunds.requestedAt), asc(purchaseCostRefunds.id)).all(),
    db.select().from(purchaseCostOrders).where(eq(purchaseCostOrders.trackingId, trackingId)).orderBy(asc(purchaseCostOrders.createdAt), asc(purchaseCostOrders.id)).all(),
  ]);
  const corrections = await db.select().from(purchaseOrderCorrections).innerJoin(financialOperations, eq(purchaseOrderCorrections.operationId, financialOperations.id)).where(eq(purchaseOrderCorrections.trackingId, trackingId)).all();
  const supersededOrderIds = new Set(corrections.map(row => row.purchase_order_corrections.previousOrderId));
  const legacyCostItems = itemCosts.filter(item => item.purchaseItemId !== null && item.additionalOrderItemId === null);
  const costIds = itemCosts.map(item => item.id), purchaseItemIds = legacyCostItems.map(item => item.purchaseItemId!), packageIds = packages.map(pkg => pkg.id);
  const refundIds = refunds.map(refund => refund.id);
  const orderIds = orders.map(order => order.id);
  const [purchaseItemRows, additionalItemRows, participantRows, assignmentRows, refundParticipantRows, refundEventRows, packageEventRows, componentRows, allocationRows, accountRows] = await Promise.all([
    purchaseItemIds.length ? db.select().from(purchaseItems).where(inArray(purchaseItems.id, purchaseItemIds)).all() : Promise.resolve([]),
    orderIds.length ? db.select().from(purchaseAdditionalOrderItems).where(inArray(purchaseAdditionalOrderItems.orderId, orderIds)).orderBy(asc(purchaseAdditionalOrderItems.itemOrder)).all() : Promise.resolve([]),
    costIds.length ? db.select().from(purchaseCostParticipants).where(inArray(purchaseCostParticipants.costItemId, costIds)).orderBy(asc(purchaseCostParticipants.costItemId), asc(purchaseCostParticipants.allocationOrder)).all() : Promise.resolve([]),
    packageIds.length ? db.select().from(purchasePackageItems).where(inArray(purchasePackageItems.packageId, packageIds)).orderBy(asc(purchasePackageItems.packageId), asc(purchasePackageItems.allocationOrder)).all() : Promise.resolve([]),
    refundIds.length ? db.select().from(purchaseCostRefundParticipants).where(inArray(purchaseCostRefundParticipants.refundId, refundIds)).orderBy(asc(purchaseCostRefundParticipants.refundId), asc(purchaseCostRefundParticipants.allocationOrder)).all() : Promise.resolve([]),
    refundIds.length ? db.select().from(purchaseCostRefundEvents).where(inArray(purchaseCostRefundEvents.refundId, refundIds)).orderBy(asc(purchaseCostRefundEvents.refundId), asc(purchaseCostRefundEvents.eventOrder)).all() : Promise.resolve([]),
    packageIds.length ? db.select().from(purchaseCostPackageEvents).where(inArray(purchaseCostPackageEvents.packageId, packageIds)).orderBy(asc(purchaseCostPackageEvents.eventOrder)).all() : Promise.resolve([]),
    orderIds.length ? db.select().from(purchasePaymentComponents).where(inArray(purchasePaymentComponents.orderId, orderIds)).orderBy(asc(purchasePaymentComponents.componentOrder)).all() : Promise.resolve([]),
    orderIds.length ? db.select().from(purchasePaymentAllocations).innerJoin(purchasePaymentComponents, eq(purchasePaymentAllocations.componentId, purchasePaymentComponents.id)).where(inArray(purchasePaymentComponents.orderId, orderIds)).orderBy(asc(purchasePaymentAllocations.allocationOrder)).all() : Promise.resolve([]),
    db.select().from(hubbuyAccounts).where(and(eq(hubbuyAccounts.workspaceId, tracking.workspaceId), isNull(hubbuyAccounts.deletedAt))).orderBy(asc(hubbuyAccounts.createdAt)).all(),
  ]);
  const accountIds = accountRows.map(account => account.id);
  const [accountEntries, accountRuns, accountEvents] = accountIds.length ? await Promise.all([
    db.select({ accountId: hubbuyBalanceEntries.accountId }).from(hubbuyBalanceEntries).where(inArray(hubbuyBalanceEntries.accountId, accountIds)).all(),
    db.select({ accountId: hubbuyReconciliationRuns.accountId }).from(hubbuyReconciliationRuns).where(inArray(hubbuyReconciliationRuns.accountId, accountIds)).all(),
    db.select({ accountId: hubbuyReconciliationEvents.accountId }).from(hubbuyReconciliationEvents).where(inArray(hubbuyReconciliationEvents.accountId, accountIds)).all(),
  ]) : [[], [], []];
  const accountEntryIds = new Set(accountEntries.map(row => row.accountId));
  const accountRunIds = new Set(accountRuns.map(row => row.accountId));
  const accountEventIds = new Set(accountEvents.map(row => row.accountId));
  const accountRowsWithEligibility = accountRows.map(account => ({
    ...account,
    canActivateWithZero: account.status === "reconciling" && account.balanceCnyMinor === 0 &&
      !accountEntryIds.has(account.id) && !accountRunIds.has(account.id) && !accountEventIds.has(account.id),
  }));
  const balanceConsumptions = allocationRows.length
    ? await db.select().from(hubbuyBalanceConsumptions).where(inArray(hubbuyBalanceConsumptions.paymentAllocationId, allocationRows.map(row => row.purchase_payment_allocations.id))).all()
    : [];
  const financingEntries = balanceConsumptions.length
    ? await db.select().from(memberBalanceFinancingEntries).where(inArray(memberBalanceFinancingEntries.consumptionId, balanceConsumptions.map(row => row.id))).orderBy(asc(memberBalanceFinancingEntries.recordedAt), asc(memberBalanceFinancingEntries.id)).all()
    : [];
  const purchaseItemsById = new Map(purchaseItemRows.map(item => [item.id, item]));
  const peopleById = new Map(members.map(member => [member.id, member]));
  const participantsByCostItem = new Map<string, typeof participantRows>();
  for (const participant of participantRows) participantsByCostItem.set(participant.costItemId, [...(participantsByCostItem.get(participant.costItemId) ?? []), participant]);
  const assignmentsByPackage = new Map<string, typeof assignmentRows>();
  for (const assignment of assignmentRows) assignmentsByPackage.set(assignment.packageId, [...(assignmentsByPackage.get(assignment.packageId) ?? []), assignment]);
  const refundParticipantsById = new Map<string, typeof refundParticipantRows>();
  for (const participant of refundParticipantRows) refundParticipantsById.set(participant.refundId, [...(refundParticipantsById.get(participant.refundId) ?? []), participant]);
  const refundEventsById = new Map<string, typeof refundEventRows>();
  for (const event of refundEventRows) refundEventsById.set(event.refundId, [...(refundEventsById.get(event.refundId) ?? []), event]);
  const packageEventsById = new Map<string, typeof packageEventRows>();
  for (const event of packageEventRows) packageEventsById.set(event.packageId, [...(packageEventsById.get(event.packageId) ?? []), event]);
  const refundsByCostItem = new Map<string, typeof refunds>();
  for (const refund of refunds) refundsByCostItem.set(refund.costItemId, [...(refundsByCostItem.get(refund.costItemId) ?? []), refund]);
  const refundCalculationRows = (costItemId: string) => (refundsByCostItem.get(costItemId) ?? []).map(refund => ({
    status: refund.status, quantity: refund.quantity,
    requestedProductCents: refund.requestedProductCents, requestedChinaCents: refund.requestedChinaCents,
    receivedProductCents: refund.receivedProductCents, receivedChinaCents: refund.receivedChinaCents,
    participants: (refundParticipantsById.get(refund.id) ?? []).map(person => ({
      personId: person.personId, allocationOrder: person.allocationOrder, weight: person.weight,
      originalProductShareCents: person.originalProductShareCents, originalChinaShareCents: person.originalChinaShareCents,
      originalProductFeeShareCents: person.originalProductFeeShareCents,
    })),
  }));
  const enrichRefund = (refund: typeof refunds[number]) => ({
    ...refund,
    participants: (refundParticipantsById.get(refund.id) ?? []).map(person => ({ ...person, name: peopleById.get(person.personId)?.name ?? "Membro" })),
    events: (refundEventsById.get(refund.id) ?? []).map(event => ({ ...event, actorName: peopleById.get(event.actorId)?.name ?? "Membro", details: safeEventDetails(event.detailsJson) })),
  });
  const chargeByScope = new Map(charges.filter(charge => charge.packageId !== null).map(charge => [`${charge.packageId}:${charge.chargeType}`, charge]));
  const originalOrder = orders.find(order => order.kind === "original");
  const productCharge = charges.find(charge => charge.chargeType === "products" && charge.orderId === originalOrder?.id);
  const recordedAdditionalOrderIds = new Set(orders.filter(order => order.kind === "additional" && order.state === "recorded" && !supersededOrderIds.has(order.id)).map(order => order.id));
  const calculatedCostItems = itemCosts.filter(cost => cost.purchaseItemId !== null || cost.additionalOrderItemId !== null && recordedAdditionalOrderIds.has(cost.orderId));
  const calculatedCostItemIds = new Set(calculatedCostItems.map(cost => cost.id));
  const allocationsByCostItem = new Map<string, typeof allocationRows>();
  for (const row of allocationRows) {
    const allocation = row.purchase_payment_allocations;
    allocationsByCostItem.set(allocation.costItemId, [...(allocationsByCostItem.get(allocation.costItemId) ?? []), row]);
  }
  const allocationTotal = (costItemId: string, component: "product" | "china", field: "principalBrlCents" | "historicalBrlCents" | "feeBrlCents") =>
    (allocationsByCostItem.get(costItemId) ?? []).filter(row => row.purchase_payment_allocations.costComponent === component).reduce((sum, row) => sum + row.purchase_payment_allocations[field], 0);
  const costItemByPaymentAllocation = new Map(allocationRows.map(row => [row.purchase_payment_allocations.id, row.purchase_payment_allocations.costItemId]));
  const financingEntriesByConsumption = new Map<string, typeof financingEntries>();
  for (const entry of financingEntries) financingEntriesByConsumption.set(entry.consumptionId, [...(financingEntriesByConsumption.get(entry.consumptionId) ?? []), entry]);
  const financingPositionsForItem = (costItemId: string) => balanceConsumptions.filter(consumption => costItemByPaymentAllocation.get(consumption.paymentAllocationId ?? "") === costItemId).flatMap(consumption => {
    const rows = financingEntriesByConsumption.get(consumption.id) ?? [];
    const pairs = new Map<string, typeof rows>();
    for (const entry of rows) {
      const key = `${entry.lenderId}:${entry.beneficiaryId}`;
      pairs.set(key, [...(pairs.get(key) ?? []), entry]);
    }
    return [...pairs.entries()].flatMap(([, pair]) => {
      const advance = pair.filter(row => row.entryType === "advance");
      if (!advance.length) return [];
      const advancedCnyMinor = advance.reduce((sum, row) => sum + row.amountCnyMinor, 0);
      const advancedHistoricalBrlCents = advance.reduce((sum, row) => sum + row.historicalBrlCents, 0);
      const settledCnyMinor = pair.filter(row => row.entryType === "settlement").reduce((sum, row) => sum + row.amountCnyMinor, 0);
      const settledHistoricalBrlCents = pair.filter(row => row.entryType === "settlement").reduce((sum, row) => sum + row.historicalBrlCents, 0);
      const offsetCnyMinor = pair.filter(row => row.entryType === "refund_offset").reduce((sum, row) => sum + row.amountCnyMinor, 0);
      const offsetHistoricalBrlCents = pair.filter(row => row.entryType === "refund_offset").reduce((sum, row) => sum + row.historicalBrlCents, 0);
      const reversedCnyMinor = pair.filter(row => row.entryType === "reversal").reduce((sum, row) => sum + row.amountCnyMinor, 0);
      const reversedHistoricalBrlCents = pair.filter(row => row.entryType === "reversal").reduce((sum, row) => sum + row.historicalBrlCents, 0);
      return [{
        consumptionId: consumption.id, lenderId: advance[0].lenderId, beneficiaryId: advance[0].beneficiaryId,
        advancedCnyMinor, advancedHistoricalBrlCents, settledCnyMinor, settledHistoricalBrlCents,
        offsetCnyMinor, offsetHistoricalBrlCents, reversedCnyMinor, reversedHistoricalBrlCents,
        openCnyMinor: advancedCnyMinor - settledCnyMinor - offsetCnyMinor + reversedCnyMinor,
        openHistoricalBrlCents: advancedHistoricalBrlCents - settledHistoricalBrlCents - offsetHistoricalBrlCents + reversedHistoricalBrlCents,
        events: pair,
      }];
    });
  });
  let calculation: ReturnType<typeof calculateCostTracking>;
  try { calculation = calculateCostTracking({
    items: calculatedCostItems.map(cost => {
      const original = cost.purchaseItemId ? purchaseItemsById.get(cost.purchaseItemId) : null;
      const additional = cost.additionalOrderItemId ? additionalItemRows.find(item => item.id === cost.additionalOrderItemId) : null;
      const quantity = original?.quantity ?? additional?.quantity;
      if (quantity === undefined) throw new DomainError("Um item do acompanhamento não existe no snapshot do pedido.", 409);
      const base = {
        id: cost.id, itemOrder: cost.itemOrder, quantity,
        effectivePrice: { state: cost.effectivePriceState, amountCents: cost.effectivePriceUnitCents },
        chinaFreight: { state: cost.chinaFreightState, amountCents: cost.chinaFreightUnitCents },
        participants: (participantsByCostItem.get(cost.id) ?? []).map(person => ({ personId: person.personId, allocationOrder: person.allocationOrder, weight: person.weight })),
      };
      if (cost.additionalOrderItemId) return {
        ...base,
        capturedProductCents: allocationTotal(cost.id, "product", "principalBrlCents"),
        capturedChinaCents: allocationTotal(cost.id, "china", "principalBrlCents"),
        capturedFeeCents: allocationTotal(cost.id, "product", "feeBrlCents") + allocationTotal(cost.id, "china", "feeBrlCents"),
        refunds: refundCalculationRows(cost.id),
      };
      return {
        ...base,
        refunds: refundCalculationRows(cost.id),
      };
    }),
    packages: packages.map(pkg => {
      const freight = chargeByScope.get(`${pkg.id}:brazil_freight`), customs = chargeByScope.get(`${pkg.id}:customs`);
      return {
        id: pkg.id,
        name: pkg.name,
        packageOrder: pkg.packageOrder,
        logisticsStatus: pkg.logisticsStatus,
        items: (assignmentsByPackage.get(pkg.id) ?? []).filter(row => calculatedCostItemIds.has(row.costItemId)).map(row => ({ costItemId: row.costItemId, quantity: row.quantity, allocationOrder: row.allocationOrder })),
        brazilFreight: freight ? { value: { state: freight.valueState!, amountCents: freight.amountCents }, paymentMethod: freight.paymentMethod, feeBps: freight.feeBps, paymentStatus: freight.paymentStatus } : pendingPackageCharge(),
        customs: customs ? { value: { state: customs.valueState!, amountCents: customs.amountCents }, paymentMethod: customs.paymentMethod, feeBps: customs.feeBps, paymentStatus: customs.paymentStatus } : pendingPackageCharge(),
      };
    }),
    productsCharge: { paymentMethod: productCharge?.paymentMethod ?? null, feeBps: productCharge?.feeBps ?? null, paymentStatus: productCharge?.paymentStatus ?? "pending" },
  }); }
  catch (error) { throw new DomainError(error instanceof Error ? error.message : "Não foi possível calcular este acompanhamento.", 409); }
  const calculatedItems = new Map(calculation.items.map(item => [item.id, item]));
  const calculatedPackages = new Map(calculation.packages.map(pkg => [pkg.id, pkg]));
  const additionalItemById = new Map(additionalItemRows.map(item => [item.id, item]));
  const financialDisplay = (() => {
    try {
      return projectCostFinancialDisplay(calculatedCostItems.map(cost => {
        const original = cost.purchaseItemId ? purchaseItemsById.get(cost.purchaseItemId) : null;
        const additional = cost.additionalOrderItemId ? additionalItemById.get(cost.additionalOrderItemId) : null;
        const item = calculatedItems.get(cost.id);
        if (!item || (!original && !additional)) throw new Error("Um item da projeção não existe no acompanhamento.");
        const amount = (name: string) => item.components.find(component => component.name === name)?.amountCents ?? null;
        const displayComponent = (name: string, state: string) => {
          const cents = amount(name);
          return cents === null
            ? { name, state: "pending" as const, amountCents: null }
            : state === "no_charge"
              ? { name, state: "no_charge" as const, amountCents: null }
              : { name, state: "known" as const, amountCents: cents };
        };
        const packageComponents = item.components
          .filter(component => component.name.startsWith("Frete Brasil · ") || component.name.startsWith("Taxa do frete · ") || component.name.startsWith("Receita · "))
          .map(component => ({ name: component.name, state: component.amountCents === null ? "pending" as const : "known" as const, amountCents: component.amountCents }));
        const refundRows = refundsByCostItem.get(cost.id) ?? [];
        const refundsInput = refundRows.map(refund => {
          const snapshot = refundParticipantsById.get(refund.id) ?? [];
          return {
            id: refund.id,
            status: refund.status,
            quantity: refund.quantity,
            unitStart: refund.unitStart,
            originalItemQuantity: refund.originalItemQuantity,
            requestedProductCents: refund.requestedProductCents,
            requestedChinaCents: refund.requestedChinaCents,
            receivedProductCents: refund.receivedProductCents,
            receivedChinaCents: refund.receivedChinaCents,
            originalItemFeeCents: refund.originalItemFeeCents,
            originalProductShareCents: snapshot.length ? snapshot.reduce((sum, person) => sum + person.originalProductShareCents, 0) : null,
            originalChinaShareCents: snapshot.length ? snapshot.reduce((sum, person) => sum + person.originalChinaShareCents, 0) : null,
          };
        });
        const pendingReasons = item.pendingComponents.filter(reason => reason !== "reembolso solicitado" && reason !== "divisão por pessoa pendente");
        return {
          costItemId: cost.id,
          orderId: cost.orderId,
          itemOrder: cost.itemOrder,
          origin: original ? "purchase" as const : "additional" as const,
          purchasedQuantity: original?.quantity ?? additional!.quantity,
          product: displayComponent("Preço efetivo", cost.effectivePriceState),
          china: displayComponent("Frete China", cost.chinaFreightState),
          productFee: displayComponent("Taxa dos produtos", "known"),
          packageCosts: packageComponents,
          pendingReasons,
          refunds: refundsInput,
        };
      }), {
        partialCents: calculation.summary.partialCents,
        totalCents: calculation.summary.totalCents,
        hasKnownAmount: calculation.summary.hasKnownAmount,
        requestedRefundCents: calculation.summary.requestedRefundCents,
        receivedRefundCents: calculation.summary.receivedRefundCents,
      });
    } catch (error) {
      throw new DomainError(error instanceof Error ? error.message : "Não foi possível projetar a leitura financeira.", 409);
    }
  })();
  const items = legacyCostItems.map(cost => {
    const original = purchaseItemsById.get(cost.purchaseItemId!)!;
    const participants = participantsByCostItem.get(cost.id) ?? [];
    return {
      ...cost,
      refunds: (refundsByCostItem.get(cost.id) ?? []).map(enrichRefund),
      original: { id: original.id, name: original.name, variant: original.variant, visualKey: original.visualKey, quantity: original.quantity, originalUnitPriceCents: original.unitPriceCents },
      participants: participants.map(participant => {
        const share = calculatedItems.get(cost.id)?.shares.find(value => value.personId === participant.personId);
        return {
          ...participant,
          name: peopleById.get(participant.personId)?.name ?? "Membro",
          partialShareCents: share?.partialAmountCents ?? null,
          shareCents: share?.amountCents ?? null,
          grossPartialCents: share?.grossPartialAmountCents ?? null,
          receivedRefundCents: share?.receivedRefundCents ?? 0,
          requestedRefundCents: share?.requestedRefundCents ?? 0,
        };
      }),
      calculation: calculatedItems.get(cost.id),
    };
  });
  const packageData = packages.map(pkg => ({
    ...pkg,
    contentEvents: (packageEventsById.get(pkg.id) ?? []).map(event => ({ ...event, actorName: peopleById.get(event.actorId)?.name ?? "Membro" })),
    items: assignmentsByPackage.get(pkg.id) ?? [],
    brazilFreightCharge: chargeByScope.get(`${pkg.id}:brazil_freight`) ?? null,
    customsCharge: chargeByScope.get(`${pkg.id}:customs`) ?? null,
    calculation: calculatedPackages.get(pkg.id),
  }));
  const accountsById = new Map(accountRows.map(account => [account.id, account]));
  const allocationsByComponent = new Map<string, typeof allocationRows>();
  for (const row of allocationRows) allocationsByComponent.set(row.purchase_payment_allocations.componentId, [...(allocationsByComponent.get(row.purchase_payment_allocations.componentId) ?? []), row]);
  const productOrders = orders.filter(order => !supersededOrderIds.has(order.id)).map(order => {
    const orderCosts = itemCosts.filter(cost => cost.orderId === order.id);
    const paymentComponents = componentRows.filter(component => component.orderId === order.id).map(component => ({
      ...component,
      allocations: (allocationsByComponent.get(component.id) ?? []).map(row => ({
        ...row.purchase_payment_allocations,
        memberName: peopleById.get(row.purchase_payment_allocations.personId)?.name ?? "Membro",
      })),
    }));
    const nativeTotal = orderCosts.reduce((sum, cost) => sum + BigInt(cost.nativeProductCnyMinor ?? 0) + BigInt(cost.nativeChinaCnyMinor ?? 0), 0n);
    const principalBrlCents = paymentComponents.filter(component => component.sourceType !== "balance").reduce((sum, component) => sum + component.principalBrlCents, 0);
    const historicalBrlCents = paymentComponents.filter(component => component.sourceType === "balance").reduce((sum, component) => sum + component.principalBrlCents, 0);
    const feeBrlCents = paymentComponents.reduce((sum, component) => sum + component.feeBrlCents, 0);
    return {
      ...order,
      account: order.accountId ? accountsById.get(order.accountId) ?? null : null,
      charge: charges.find(charge => charge.orderId === order.id) ?? null,
      nativeCnyMinor: nativeTotal <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(nativeTotal) : null,
      principalBrlCents, historicalBrlCents, feeBrlCents, totalCostBrlCents: principalBrlCents + historicalBrlCents + feeBrlCents, newMoneyBrlCents: principalBrlCents + feeBrlCents,
      items: orderCosts.map(cost => {
        const item = cost.additionalOrderItemId ? additionalItemById.get(cost.additionalOrderItemId) ?? null : cost.purchaseItemId ? purchaseItemsById.get(cost.purchaseItemId) ?? null : null;
        const participants = participantsByCostItem.get(cost.id) ?? [];
        return {
          cost,
          item,
          quantity: item?.quantity ?? 0,
          calculation: calculatedItems.get(cost.id),
          participants: participants.map(person => ({ ...person, name: peopleById.get(person.personId)?.name ?? "Membro" })),
          refunds: (refundsByCostItem.get(cost.id) ?? []).map(enrichRefund),
          financingPositions: financingPositionsForItem(cost.id),
        };
      }),
      paymentComponents,
    };
  });
  const memberTotals = new Map<string, { personId: string; name: string; totalCents: number; grossCents: number; receivedRefundCents: number; requestedRefundCents: number; hasKnownAmount: boolean; pending: boolean; personalUnits: number; sharedItems: number }>();
  for (const cost of calculatedCostItems) {
    const calculationItem = calculatedItems.get(cost.id);
    const participants = participantsByCostItem.get(cost.id) ?? [];
    for (const participant of participants) {
      const share = calculationItem?.shares.find(value => value.personId === participant.personId);
      const current = memberTotals.get(participant.personId) ?? { personId: participant.personId, name: peopleById.get(participant.personId)?.name ?? "Membro", totalCents: 0, grossCents: 0, receivedRefundCents: 0, requestedRefundCents: 0, hasKnownAmount: false, pending: false, personalUnits: 0, sharedItems: 0 };
      if (share?.partialAmountCents == null) current.pending = true;
      else { current.totalCents += share.partialAmountCents; current.hasKnownAmount = true; }
      current.receivedRefundCents += share?.receivedRefundCents ?? 0;
      current.requestedRefundCents += share?.requestedRefundCents ?? 0;
      current.grossCents += share?.grossPartialAmountCents ?? 0;
      if (share?.amountCents === null || share === undefined) current.pending = true;
      if (participants.length > 1) current.sharedItems += 1;
      else current.personalUnits += calculationItem?.shippingQuantity ?? 0;
      memberTotals.set(participant.personId, current);
    }
  }
  const settings = await db.select().from(workspaceCostSettings).where(eq(workspaceCostSettings.workspaceId, tracking.workspaceId)).get();
  return {
    tracking,
    purchase,
    items,
    productOrders,
    orderCorrections: corrections.map(row => {
      const previousId = row.purchase_order_corrections.previousOrderId;
      const previousComponents = componentRows.filter(component => component.orderId === previousId);
      return {
        ...row.purchase_order_corrections,
        reason: row.financial_operations.reason, recordedAt: row.financial_operations.recordedAt,
        actorId: row.financial_operations.actorId, actorName: peopleById.get(row.financial_operations.actorId)?.name ?? "Membro",
        previousOrder: orders.find(order => order.id === previousId),
        previousItems: additionalItemRows.filter(item => item.orderId === previousId),
        previousComponents,
        previousTotalBrlCents: previousComponents.reduce((sum, component) => sum + component.principalBrlCents + component.feeBrlCents, 0),
      };
    }),
    hubbuyAccounts: accountRowsWithEligibility,
    packages: packageData,
    charges,
    productsCharge: productCharge ?? null,
    members,
    memberTotals: [...memberTotals.values()],
    refunds: refunds.map(enrichRefund),
    refundsSummary: {
      requestedCount: refunds.filter(row => row.status === "requested").length,
      requestedCents: refunds.filter(row => row.status === "requested").reduce((sum, row) => sum + row.requestedProductCents + row.requestedChinaCents, 0),
      receivedCents: refunds.filter(row => row.status === "received").reduce((sum, row) => sum + (row.receivedProductCents ?? 0) + (row.receivedChinaCents ?? 0), 0),
    },
    reopenings: reopenings.map(event => ({ ...event, name: peopleById.get(event.reopenedBy)?.name ?? "Membro" })),
    settings: { pixBps: settings?.pixBps ?? 100, cardBps: settings?.cardBps ?? 500 },
    calculation,
    financialDisplay,
  };
}

function safeEventDetails(value: string) {
  try { return JSON.parse(value) as unknown; } catch { throw new DomainError("O histórico de reembolsos está inconsistente.", 409); }
}

export type CostTrackingView = Awaited<ReturnType<typeof readCostTracking>>;

export async function listCostTrackings(db: CostReadDatabase, userId: string) {
  const membership = await authorization(db, userId).requireWorkspaceMember();
  const rows = await db.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.workspaceId, membership.workspaceId)).orderBy(desc(purchaseCostTrackings.updatedAt)).all();
  return Promise.all(rows.map(row => readCostTracking(db, userId, row.id)));
}
