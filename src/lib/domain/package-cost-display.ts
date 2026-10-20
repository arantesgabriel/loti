import { refundUnitRangeCapacityCents } from "./refund-unit-capacity";

export type DisplayComponentInput = {
  name: string;
  state: "pending" | "known" | "no_charge";
  amountCents: number | null;
};

export type CostDisplayRefundInput = {
  id: string;
  status: "requested" | "received" | "voided";
  quantity: number;
  unitStart: number;
  originalItemQuantity: number;
  requestedProductCents: number;
  requestedChinaCents: number;
  receivedProductCents: number | null;
  receivedChinaCents: number | null;
  originalItemFeeCents: number | null;
  originalProductShareCents: number | null;
  originalChinaShareCents: number | null;
};

export type CostDisplayItemInput = {
  costItemId: string;
  orderId: string;
  itemOrder: number;
  origin: "purchase" | "additional";
  purchasedQuantity: number;
  product: DisplayComponentInput;
  china: DisplayComponentInput;
  productFee: DisplayComponentInput;
  packageCosts: DisplayComponentInput[];
  pendingReasons: string[];
  refunds: CostDisplayRefundInput[];
};

export type DisplayMoney = {
  knownCents: number;
  hasKnownAmount: boolean;
  finalCents: number | null;
  pendingReasons: string[];
  state: "pending" | "partial" | "known" | "no_charge";
};

export type CostFinancialDisplay = {
  items: {
    costItemId: string;
    orderId: string;
    itemOrder: number;
    origin: "purchase" | "additional";
    purchasedQuantity: number;
    remainingQuantity: number;
    cancelledQuantity: number;
    remaining: {
      product: DisplayMoney;
      china: DisplayMoney;
      productFee: DisplayMoney;
      packageCosts: DisplayMoney;
      total: DisplayMoney;
    };
    cancelled: {
      productCents: number;
      chinaCents: number;
      productFeeCents: number;
      receivedCents: number;
      requestedCents: number;
      retainedCents: number;
      awaitingReceipt: boolean;
    } | null;
  }[];
  refundGroups: {
    costItemId: string;
    cancelledQuantity: number;
    receivedCents: number;
    requestedCents: number;
    retainedCents: number;
    awaitingReceipt: boolean;
    activeRefundIds: string[];
  }[];
  refundsById: Record<
    string,
    {
      productCapacityCents: number | null;
      chinaCapacityCents: number | null;
      productFeeCapacityCents: number | null;
    }
  >;
  summary: {
    remaining: DisplayMoney;
    cancelledRetainedCents: number;
    cancelledAwaitingReceipt: boolean;
    current: DisplayMoney;
    requestedRefundCents: number;
  };
};

type CanonicalSummary = {
  partialCents: number;
  totalCents: number | null;
  hasKnownAmount: boolean;
  requestedRefundCents: number;
  receivedRefundCents: number;
};

const MAX_DISPLAY_CENTS = 1_000_000_000_000;

function checkedCents(value: bigint, label: string) {
  if (value < 0n || value > BigInt(MAX_DISPLAY_CENTS) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(label);
  }
  return Number(value);
}

function validateMoneyComponent(component: DisplayComponentInput) {
  if (component.state === "pending") {
    if (component.amountCents !== null) throw new Error(`${component.name}: valor pendente inconsistente.`);
    return null;
  }
  if (component.state === "no_charge") {
    if (component.amountCents !== null) throw new Error(`${component.name}: valor sem cobrança inconsistente.`);
    return 0;
  }
  if (
    component.amountCents === null ||
    !Number.isSafeInteger(component.amountCents) ||
    component.amountCents < 0 ||
    component.amountCents > MAX_DISPLAY_CENTS
  ) {
    throw new Error(`${component.name}: valor conhecido inválido.`);
  }
  return component.amountCents;
}

function moneyFromComponents(
  components: DisplayComponentInput[],
  extraPendingReasons: string[] = [],
  emptyIsKnown = false,
): DisplayMoney {
  let knownCents = 0n;
  let hasKnownAmount = components.length === 0 && emptyIsKnown;
  const pendingReasons = new Set(extraPendingReasons);
  let hasKnownCharge = false;
  let hasOnlyNoCharge = components.length > 0;

  for (const component of components) {
    const amount = validateMoneyComponent(component);
    if (amount === null) {
      pendingReasons.add(component.name);
      hasOnlyNoCharge = false;
      continue;
    }
    hasKnownAmount = true;
    knownCents += BigInt(amount);
    if (component.state === "known") hasKnownCharge = true;
    if (component.state !== "no_charge") hasOnlyNoCharge = false;
  }

  const known = checkedCents(knownCents, "O total da projeção excede o limite permitido.");
  const reasons = [...pendingReasons];
  const finalCents = reasons.length ? null : known;
  const state = reasons.length
    ? hasKnownAmount
      ? "partial"
      : "pending"
    : hasOnlyNoCharge && !hasKnownCharge && components.length > 0
      ? "no_charge"
      : "known";
  return { knownCents: known, hasKnownAmount, finalCents, pendingReasons: reasons, state };
}

function inputComponentMoney(component: DisplayComponentInput) {
  return moneyFromComponents([component]);
}

function partitionedComponent(
  component: DisplayComponentInput,
  totalQuantity: number,
  activeRanges: Pick<CostDisplayRefundInput, "unitStart" | "quantity">[],
) {
  const total = validateMoneyComponent(component);
  if (total === null) {
    if (activeRanges.length) {
      throw new Error(`${component.name}: há cancelamentos sem uma base histórica conhecida.`);
    }
    return { remaining: inputComponentMoney(component), cancelledCents: 0 };
  }

  const cancelled = activeRanges.reduce(
    (sum, range) =>
      sum + BigInt(refundUnitRangeCapacityCents(total, totalQuantity, range.unitStart, range.quantity)),
    0n,
  );
  const cancelledCents = checkedCents(cancelled, `${component.name}: faixa cancelada inválida.`);
  const remainingCents = checkedCents(
    BigInt(total) - cancelled,
    `${component.name}: as faixas canceladas excedem a base histórica.`,
  );
  const state = component.state === "no_charge" ? "no_charge" : "known";
  return {
    remaining: moneyFromComponents([{ name: component.name, state, amountCents: state === "no_charge" ? null : remainingCents }]),
    cancelledCents,
  };
}

function validateRefundAmount(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_DISPLAY_CENTS) throw new Error(`${label} inválido.`);
  return value;
}

function activeRefundRanges(item: CostDisplayItemInput) {
  const active = item.refunds
    .filter(refund => refund.status !== "voided")
    .sort((a, b) => a.unitStart - b.unitStart || a.id.localeCompare(b.id));
  let previousEnd = 0;
  for (const refund of active) {
    if (
      refund.originalItemQuantity !== item.purchasedQuantity ||
      !Number.isSafeInteger(refund.unitStart) ||
      !Number.isSafeInteger(refund.quantity) ||
      refund.quantity < 1 ||
      refund.unitStart < 0 ||
      BigInt(refund.unitStart) + BigInt(refund.quantity) > BigInt(item.purchasedQuantity) ||
      refund.unitStart < previousEnd
    ) {
      throw new Error(`As faixas ativas de reembolso do produto ${item.costItemId} são inválidas ou sobrepostas.`);
    }
    previousEnd = refund.unitStart + refund.quantity;
  }
  return active;
}

function historicalRefundCapacities(refund: CostDisplayRefundInput) {
  const quantity = refund.originalItemQuantity;
  const productTotal = refund.originalProductShareCents === null ? null : validateRefundAmount(refund.originalProductShareCents, "Base histórica do produto");
  const chinaTotal = refund.originalChinaShareCents === null ? null : validateRefundAmount(refund.originalChinaShareCents, "Base histórica do frete China");
  const feeTotal = refund.originalItemFeeCents === null ? null : validateRefundAmount(refund.originalItemFeeCents, "Taxa histórica do produto");
  return {
    productCapacityCents: productTotal === null ? null : refundUnitRangeCapacityCents(productTotal, quantity, refund.unitStart, refund.quantity),
    chinaCapacityCents: chinaTotal === null ? null : refundUnitRangeCapacityCents(chinaTotal, quantity, refund.unitStart, refund.quantity),
    productFeeCapacityCents: feeTotal === null ? null : refundUnitRangeCapacityCents(feeTotal, quantity, refund.unitStart, refund.quantity),
  };
}

export function projectCostFinancialDisplay(
  inputs: CostDisplayItemInput[],
  canonical: CanonicalSummary,
): CostFinancialDisplay {
  const ids = new Set<string>();
  const ordered = [...inputs].sort((a, b) => a.itemOrder - b.itemOrder || a.costItemId.localeCompare(b.costItemId));
  const refundsById: CostFinancialDisplay["refundsById"] = {};
  const refundGroups: CostFinancialDisplay["refundGroups"] = [];
  const items: CostFinancialDisplay["items"] = [];
  let summaryRemainingKnown = 0n;
  let summaryRemainingHasKnown = false;
  let summaryRemainingPending = false;
  let summaryRetained = 0n;
  let summaryAwaitingReceipt = false;
  let summaryRequested = 0n;
  let sumReceived = 0n;

  for (const item of ordered) {
    if (!item.costItemId || ids.has(item.costItemId)) throw new Error("A projeção contém um item de custo duplicado ou sem identidade.");
    ids.add(item.costItemId);
    if (!Number.isSafeInteger(item.itemOrder) || item.itemOrder < 0 || !Number.isInteger(item.purchasedQuantity) || item.purchasedQuantity < 1 || item.purchasedQuantity > 10_000) {
      throw new Error(`Quantidade ou ordem inválida na projeção do produto ${item.costItemId}.`);
    }

    const active = activeRefundRanges(item);
    const cancelledQuantity = active.reduce((sum, refund) => sum + refund.quantity, 0);
    const remainingQuantity = item.purchasedQuantity - cancelledQuantity;
    const activeRanges = active.map(({ unitStart, quantity }) => ({ unitStart, quantity }));
    const product = partitionedComponent(item.product, item.purchasedQuantity, activeRanges);
    const china = partitionedComponent(item.china, item.purchasedQuantity, activeRanges);
    const productFee = partitionedComponent(item.productFee, item.purchasedQuantity, activeRanges);
    const packageCosts = moneyFromComponents(item.packageCosts, [], true);
    const remainingPendingReasons = new Set(item.pendingReasons.filter(reason => reason !== "reembolso solicitado" && reason !== "divisão por pessoa pendente"));
    for (const reason of [
      ...product.remaining.pendingReasons,
      ...china.remaining.pendingReasons,
      ...productFee.remaining.pendingReasons,
      ...packageCosts.pendingReasons,
    ]) remainingPendingReasons.add(reason);

    const remainingFields = [product.remaining, china.remaining, productFee.remaining, packageCosts];
    const remainingKnown = checkedCents(remainingFields.reduce((sum, value) => sum + BigInt(value.knownCents), 0n), "O custo restante excede o limite permitido.");
    const remainingHasKnown = remainingFields.some(value => value.hasKnownAmount);
    if (remainingQuantity === 0 && item.packageCosts.length) {
      const nonzeroPackageCost = item.packageCosts.some(component => {
        const amount = validateMoneyComponent(component);
        return amount !== null && amount > 0;
      });
      if (nonzeroPackageCost) throw new Error(`O produto ${item.costItemId} mantém encargos de pacote sem unidades restantes.`);
    }
    const remainingTotal: DisplayMoney = {
      knownCents: remainingKnown,
      hasKnownAmount: remainingHasKnown,
      finalCents: remainingPendingReasons.size ? null : remainingKnown,
      pendingReasons: [...remainingPendingReasons],
      state: remainingPendingReasons.size ? remainingHasKnown ? "partial" : "pending" : "known",
    };
    const itemRetained = active.length
      ? BigInt(product.cancelledCents) + BigInt(china.cancelledCents) + BigInt(productFee.cancelledCents)
      : 0n;
    let itemReceived = 0n;
    let itemRequested = 0n;

    for (const refund of item.refunds) {
      let capacities: CostFinancialDisplay["refundsById"][string];
      if (refund.status === "voided") {
        capacities = historicalRefundCapacities(refund);
      } else {
        const productTotal = validateMoneyComponent(item.product);
        const chinaTotal = validateMoneyComponent(item.china);
        const feeTotal = validateMoneyComponent(item.productFee);
        if (productTotal === null || chinaTotal === null || feeTotal === null) throw new Error(`O reembolso ativo ${refund.id} não possui bases financeiras conhecidas.`);
        capacities = {
          productCapacityCents: refundUnitRangeCapacityCents(productTotal, item.purchasedQuantity, refund.unitStart, refund.quantity),
          chinaCapacityCents: refundUnitRangeCapacityCents(chinaTotal, item.purchasedQuantity, refund.unitStart, refund.quantity),
          productFeeCapacityCents: refundUnitRangeCapacityCents(feeTotal, item.purchasedQuantity, refund.unitStart, refund.quantity),
        };
      }
      refundsById[refund.id] = capacities;
      const requestedProduct = validateRefundAmount(refund.requestedProductCents, "Valor solicitado do produto");
      const requestedChina = validateRefundAmount(refund.requestedChinaCents, "Valor solicitado do frete China");
      if (refund.status === "requested") {
        if (capacities.productCapacityCents === null || capacities.chinaCapacityCents === null || requestedProduct > capacities.productCapacityCents || requestedChina > capacities.chinaCapacityCents) throw new Error(`O reembolso ${refund.id} supera a base histórica das suas unidades.`);
        itemRequested += BigInt(requestedProduct) + BigInt(requestedChina);
      } else if (refund.status === "received") {
        if (refund.receivedProductCents === null || refund.receivedChinaCents === null) throw new Error(`O recebimento ${refund.id} não contém os valores finais registrados.`);
        const receivedProduct = validateRefundAmount(refund.receivedProductCents, "Valor recebido do produto");
        const receivedChina = validateRefundAmount(refund.receivedChinaCents, "Valor recebido do frete China");
        if (capacities.productCapacityCents === null || capacities.chinaCapacityCents === null || receivedProduct > capacities.productCapacityCents || receivedChina > capacities.chinaCapacityCents) throw new Error(`O recebimento ${refund.id} supera a base histórica das suas unidades.`);
        itemReceived += BigInt(receivedProduct) + BigInt(receivedChina);
      } else if (refund.receivedProductCents !== null || refund.receivedChinaCents !== null) {
        // A voided record may have had a confirmed receipt; it is historical only.
        validateRefundAmount(refund.receivedProductCents ?? 0, "Valor recebido do produto");
        validateRefundAmount(refund.receivedChinaCents ?? 0, "Valor recebido do frete China");
      }
    }

    const retained = checkedCents(itemRetained - itemReceived, `O custo mantido do produto ${item.costItemId} ficaria negativo.`);
    const requestedCents = checkedCents(itemRequested, "Os valores solicitados excedem o limite permitido.");
    const receivedCents = checkedCents(itemReceived, "Os valores recebidos excedem o limite permitido.");
    const awaitingReceipt = active.some(refund => refund.status === "requested");
    const cancelled = active.length ? {
      productCents: product.cancelledCents,
      chinaCents: china.cancelledCents,
      productFeeCents: productFee.cancelledCents,
      receivedCents,
      requestedCents,
      retainedCents: retained,
      awaitingReceipt,
    } : null;

    summaryRemainingKnown += BigInt(remainingKnown);
    summaryRemainingHasKnown ||= remainingHasKnown;
    summaryRemainingPending ||= remainingTotal.finalCents === null;
    summaryRetained += BigInt(retained);
    summaryAwaitingReceipt ||= awaitingReceipt;
    summaryRequested += BigInt(requestedCents);
    sumReceived += BigInt(receivedCents);

    items.push({
      costItemId: item.costItemId,
      orderId: item.orderId,
      itemOrder: item.itemOrder,
      origin: item.origin,
      purchasedQuantity: item.purchasedQuantity,
      remainingQuantity,
      cancelledQuantity,
      remaining: {
        product: product.remaining,
        china: china.remaining,
        productFee: productFee.remaining,
        packageCosts,
        total: remainingTotal,
      },
      cancelled,
    });
    if (active.length) refundGroups.push({
      costItemId: item.costItemId,
      cancelledQuantity,
      receivedCents,
      requestedCents,
      retainedCents: retained,
      awaitingReceipt,
      activeRefundIds: active.map(refund => refund.id),
    });
  }

  const remainingKnown = checkedCents(summaryRemainingKnown, "O subtotal de produtos restantes excede o limite permitido.");
  const retainedCents = checkedCents(summaryRetained, "O custo mantido dos itens cancelados excede o limite permitido.");
  const requestedRefundCents = checkedCents(summaryRequested, "Os reembolsos solicitados excedem o limite permitido.");
  if (requestedRefundCents !== canonical.requestedRefundCents || Number(sumReceived) !== canonical.receivedRefundCents) {
    throw new Error("A projeção de reembolsos não concilia com os totais canônicos.");
  }
  if (BigInt(remainingKnown) + BigInt(retainedCents) !== BigInt(canonical.partialCents)) {
    throw new Error("Produtos restantes e custos mantidos não conciliam com o cálculo canônico.");
  }

  const current: DisplayMoney = {
    knownCents: canonical.partialCents,
    hasKnownAmount: canonical.hasKnownAmount,
    finalCents: canonical.totalCents,
    pendingReasons: canonical.totalCents === null ? ["Valores do acompanhamento ainda pendentes"] : [],
    state: canonical.totalCents !== null ? "known" : canonical.hasKnownAmount ? "partial" : "pending",
  };
  return {
    items,
    refundGroups,
    refundsById,
    summary: {
      remaining: {
        knownCents: remainingKnown,
        hasKnownAmount: summaryRemainingHasKnown,
        finalCents: summaryRemainingPending ? null : remainingKnown,
        pendingReasons: summaryRemainingPending ? ["Há custos das unidades restantes por resolver"] : [],
        state: summaryRemainingPending ? summaryRemainingHasKnown ? "partial" : "pending" : "known",
      },
      cancelledRetainedCents: retainedCents,
      cancelledAwaitingReceipt: summaryAwaitingReceipt,
      current,
      requestedRefundCents,
    },
  };
}
