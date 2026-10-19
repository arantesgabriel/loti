export type CostValueState = "pending" | "known" | "no_charge";
export type TransactionMethod = "pix" | "card";
export type PaymentState = "pending" | "paid";

export type CostValue = { state: CostValueState; amountCents: number | null };
export type CostWeight = { personId: string; allocationOrder: number; weight: number };
export type CostLineInput = {
  id: string;
  itemOrder: number;
  quantity: number;
  effectivePrice: CostValue;
  chinaFreight: CostValue;
  participants: CostWeight[];
  /** Captured BRL basis for an additional order; excludes the legacy product-charge calculation. */
  capturedProductCents?: number;
  capturedChinaCents?: number;
  capturedFeeCents?: number;
  shippingQuantity?: number;
  refunds?: {
    status: "requested" | "received" | "voided";
    quantity: number;
    requestedProductCents: number;
    requestedChinaCents: number;
    receivedProductCents: number | null;
    receivedChinaCents: number | null;
    participants: (CostWeight & { originalProductShareCents: number; originalChinaShareCents: number; originalProductFeeShareCents: number })[];
  }[];
};
export type PackageChargeInput = {
  value: CostValue;
  paymentMethod: TransactionMethod | null;
  feeBps: number | null;
  paymentStatus: PaymentState;
};
export type CostPackageInput = {
  id: string;
  name: string;
  packageOrder: number;
  logisticsStatus: "preparing" | "sent" | "received";
  items: { costItemId: string; quantity: number; allocationOrder: number }[];
  brazilFreight: PackageChargeInput;
  customs: PackageChargeInput;
};
export type ProductChargeInput = {
  paymentMethod: TransactionMethod | null;
  feeBps: number | null;
  paymentStatus: PaymentState;
};

const MAX_COST_CENTS = 1_000_000_000_000;

function checkedCents(value: bigint, label = "O total de custos excede o limite permitido.") {
  if (value < 0n || value > BigInt(MAX_COST_CENTS) || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(label);
  return Number(value);
}

function validCents(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_COST_CENTS) throw new Error(label);
}

export function roundFeeCents(baseCents: number, feeBps: number) {
  validCents(baseCents, "Base da taxa inválida.");
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) throw new Error("Percentual da taxa inválido.");
  return checkedCents((BigInt(baseCents) * BigInt(feeBps) + 5_000n) / 10_000n);
}

export function splitByWeights(totalCents: number, weights: CostWeight[]) {
  validCents(totalCents, "Valor para divisão inválido.");
  if (!weights.length) return null;
  const people = new Set<string>();
  let weightTotal = 0n;
  for (const entry of weights) {
    if (!entry.personId || people.has(entry.personId) || !Number.isInteger(entry.allocationOrder) || entry.allocationOrder < 0 || !Number.isSafeInteger(entry.weight) || entry.weight < 0 || entry.weight > MAX_COST_CENTS) throw new Error("Composição das parcelas inválida.");
    people.add(entry.personId);
    weightTotal += BigInt(entry.weight);
  }
  if (weightTotal === 0n) return null;
  const shares = weights.map((entry, index) => {
    const numerator = BigInt(totalCents) * BigInt(entry.weight);
    return { index, cents: numerator / weightTotal, remainder: numerator % weightTotal };
  });
  const centsLeft = BigInt(totalCents) - shares.reduce((sum, share) => sum + share.cents, 0n);
  shares.sort((a, b) => a.remainder === b.remainder ? weights[a.index].allocationOrder - weights[b.index].allocationOrder : a.remainder > b.remainder ? -1 : 1);
  for (let index = 0; index < Number(centsLeft); index++) shares[index].cents += 1n;
  const result: number[] = Array(weights.length).fill(0);
  for (const share of shares) result[share.index] = checkedCents(share.cents);
  return result;
}

function splitAcrossPackageUnits(totalCents: number, rows: CostPackageInput["items"]) {
  if (!rows.length) {
    if (totalCents > 0) throw new Error("Inclua unidades no pacote antes de distribuir seus encargos.");
    return new Map<string, number>();
  }
  const ordered = [...rows].sort((a, b) => a.allocationOrder - b.allocationOrder);
  const units = ordered.reduce((sum, row) => sum + row.quantity, 0);
  if (!Number.isSafeInteger(units) || units < 1) throw new Error("Quantidade do pacote inválida.");
  const base = Math.floor(totalCents / units), extraUnits = totalCents % units;
  let cursor = 0;
  const result = new Map<string, number>();
  for (const row of ordered) {
    if (!Number.isInteger(row.quantity) || row.quantity < 1 || !Number.isInteger(row.allocationOrder) || row.allocationOrder < 0) throw new Error("Alocação do pacote inválida.");
    const extra = Math.max(0, Math.min(cursor + row.quantity, extraUnits) - Math.min(cursor, extraUnits));
    result.set(row.costItemId, base * row.quantity + extra);
    cursor += row.quantity;
  }
  return result;
}

function valueTotal(value: CostValue, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10_000) throw new Error("Quantidade inválida.");
  if (value.state === "pending") {
    if (value.amountCents !== null) throw new Error("Um valor pendente não pode conter quantia.");
    return null;
  }
  if (value.state === "no_charge") {
    if (value.amountCents !== null) throw new Error("Um valor sem cobrança não pode conter quantia.");
    return 0;
  }
  if (value.amountCents === null) throw new Error("Informe o valor conhecido.");
  validCents(value.amountCents, "Valor informado inválido.");
  return checkedCents(BigInt(value.amountCents) * BigInt(quantity));
}

function lineProductTotal(line: CostLineInput) {
  if (line.capturedProductCents !== undefined || line.capturedChinaCents !== undefined || line.capturedFeeCents !== undefined) {
    if (line.capturedProductCents === undefined || line.capturedChinaCents === undefined || line.capturedFeeCents === undefined) throw new Error("A base BRL capturada do pedido adicional está incompleta.");
    validCents(line.capturedProductCents, "Base BRL do produto inválida.");
    validCents(line.capturedChinaCents, "Base BRL do frete China inválida.");
    validCents(line.capturedFeeCents, "Taxa BRL capturada inválida.");
    return line.capturedProductCents;
  }
  return valueTotal(line.effectivePrice, line.quantity);
}

function lineChinaTotal(line: CostLineInput) {
  if (line.capturedProductCents !== undefined || line.capturedChinaCents !== undefined || line.capturedFeeCents !== undefined) {
    if (line.capturedProductCents === undefined || line.capturedChinaCents === undefined || line.capturedFeeCents === undefined) throw new Error("A base BRL capturada do pedido adicional está incompleta.");
    validCents(line.capturedChinaCents, "Base BRL do frete China inválida.");
    return line.capturedChinaCents;
  }
  return valueTotal(line.chinaFreight, line.quantity);
}

function isCapturedLine(line: CostLineInput) {
  return line.capturedProductCents !== undefined || line.capturedChinaCents !== undefined || line.capturedFeeCents !== undefined;
}

function packageChargeTotal(charge: PackageChargeInput, packageUnits: number) {
  if (charge.value.state === "pending") return { base: null, fee: null, total: null };
  if (charge.value.state === "no_charge") return { base: 0, fee: 0, total: 0 };
  if (charge.value.amountCents === null) throw new Error("Informe o valor da cobrança.");
  validCents(charge.value.amountCents, "Valor da cobrança inválido.");
  if (packageUnits === 0 && charge.value.amountCents > 0) throw new Error("Inclua unidades no pacote antes de distribuir seus encargos.");
  if (charge.value.amountCents === 0) return { base: 0, fee: 0, total: 0 };
  if (charge.feeBps === null || charge.paymentMethod === null) return { base: charge.value.amountCents, fee: null, total: null };
  const fee = roundFeeCents(charge.value.amountCents, charge.feeBps);
  return { base: charge.value.amountCents, fee, total: checkedCents(BigInt(charge.value.amountCents) + BigInt(fee)) };
}

export function calculateCostTracking(input: { items: CostLineInput[]; packages: CostPackageInput[]; productsCharge: ProductChargeInput }) {
  const lines = [...input.items].sort((a, b) => a.itemOrder - b.itemOrder);
  const lineById = new Map(lines.map(line => [line.id, line]));
  if (lineById.size !== lines.length) throw new Error("Produto duplicado no acompanhamento.");
  const components = new Map<string, { name: string; value: number; pending: boolean }[]>();
  const purchasedQuantities = new Map<string, number>();
  const shippingQuantities = new Map<string, number>();
  const cancelledQuantities = new Map<string, number>();
  for (const line of lines) {
    const cancelledQuantity = (line.refunds ?? []).reduce((sum, refund) => sum + (refund.status === "voided" ? 0 : refund.quantity), 0);
    const shippingQuantity = line.shippingQuantity ?? line.quantity - cancelledQuantity;
    if (!Number.isInteger(shippingQuantity) || shippingQuantity < 0 || shippingQuantity > line.quantity || cancelledQuantity + shippingQuantity !== line.quantity) throw new Error("Quantidade enviável inválida para o produto.");
    purchasedQuantities.set(line.id, line.quantity);
    shippingQuantities.set(line.id, shippingQuantity);
    cancelledQuantities.set(line.id, cancelledQuantity);
    const price = lineProductTotal(line);
    const china = lineChinaTotal(line);
    components.set(line.id, [
      { name: "Preço efetivo", value: price ?? 0, pending: price === null },
      { name: "Frete China", value: china ?? 0, pending: china === null },
    ]);
  }

  const legacyLines = lines.filter(line => !isCapturedLine(line));
  const productBases = legacyLines.map(line => {
    const price = lineProductTotal(line), china = lineChinaTotal(line);
    return { line, base: price === null || china === null ? null : checkedCents(BigInt(price) + BigInt(china)) };
  });
  const productsBaseKnown = productBases.every(entry => entry.base !== null);
  const productsBaseCents = checkedCents(productBases.reduce((sum, entry) => sum + BigInt(entry.base ?? 0), 0n));
  let productsFeeCents: number | null = null;
  let productsFeeByLine = new Map<string, number>();
  if (productsBaseKnown) {
    if (productsBaseCents === 0) {
      productsFeeCents = 0;
      productsFeeByLine = new Map(legacyLines.map(line => [line.id, 0]));
    } else if (input.productsCharge.feeBps !== null && input.productsCharge.paymentMethod !== null) {
      productsFeeCents = roundFeeCents(productsBaseCents, input.productsCharge.feeBps);
      const feeShares = splitByWeights(productsFeeCents, productBases.map((entry, index) => ({ personId: entry.line.id, allocationOrder: index, weight: entry.base ?? 0 })));
      productsFeeByLine = new Map(legacyLines.map((line, index) => [line.id, feeShares?.[index] ?? 0]));
    }
  }
  for (const line of lines) {
    const fee = isCapturedLine(line) ? line.capturedFeeCents! : productsFeeByLine.get(line.id);
    components.get(line.id)!.push({ name: "Taxa dos produtos", value: fee ?? 0, pending: fee === undefined });
  }

  const packages = [...input.packages].sort((a, b) => a.packageOrder - b.packageOrder);
  const assignedByLine = new Map(lines.map(line => [line.id, 0]));
  const chargeSummaries = packages.map(pkg => {
    const rows = [...pkg.items].sort((a, b) => a.allocationOrder - b.allocationOrder);
    let unitCount = 0;
    for (const row of rows) {
      const line = lineById.get(row.costItemId);
      if (!line) throw new Error("O pacote contém um produto de outro acompanhamento.");
      if (!Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > (shippingQuantities.get(line.id) ?? line.quantity)) throw new Error("A quantidade do pacote excede as unidades disponíveis para envio.");
      unitCount += row.quantity;
      assignedByLine.set(line.id, (assignedByLine.get(line.id) ?? 0) + row.quantity);
    }
    const freight = packageChargeTotal(pkg.brazilFreight, unitCount);
    const customs = packageChargeTotal(pkg.customs, unitCount);
    const freightBaseByLine = freight.base === null ? new Map<string, number>() : splitAcrossPackageUnits(freight.base, rows);
    const freightFeeByLine = freight.fee === null ? new Map<string, number>() : splitAcrossPackageUnits(freight.fee, rows);
    const customsByLine = customs.base === null ? new Map<string, number>() : splitAcrossPackageUnits(customs.base, rows);
    for (const row of rows) {
      const target = components.get(row.costItemId)!;
      target.push({ name: `Frete Brasil · ${pkg.name}`, value: freightBaseByLine.get(row.costItemId) ?? 0, pending: freight.base === null });
      target.push({ name: `Taxa do frete · ${pkg.name}`, value: freightFeeByLine.get(row.costItemId) ?? 0, pending: freight.fee === null });
      target.push({ name: `Receita · ${pkg.name}`, value: customsByLine.get(row.costItemId) ?? 0, pending: customs.base === null });
    }
    return {
      id: pkg.id, name: pkg.name, unitCount, logisticsStatus: pkg.logisticsStatus,
      freight, customs,
      freightPaymentTotalCents: freight.total,
      customsPaymentTotalCents: customs.base,
    };
  });

  let requestedRefundCount = 0;
  let requestedRefundCents = 0;
  let receivedRefundCents = 0;
  const results = lines.map(line => {
    const allocatedQuantity = assignedByLine.get(line.id) ?? 0;
    const shippingQuantity = shippingQuantities.get(line.id) ?? line.quantity;
    const cancelledQuantity = cancelledQuantities.get(line.id) ?? 0;
    if (allocatedQuantity > shippingQuantity) throw new Error("A quantidade alocada excede as unidades disponíveis para envio.");
    const pendingComponents = components.get(line.id)!.filter(component => component.pending).map(component => component.name);
    if (allocatedQuantity < shippingQuantity) pendingComponents.push(`${shippingQuantity - allocatedQuantity} unidades sem pacote`);
    const grossKnownTotal = checkedCents(components.get(line.id)!.reduce((sum, component) => sum + BigInt(component.value), 0n));
    const weightTotal = line.participants.reduce((sum, participant) => sum + BigInt(participant.weight), 0n);
    const compositionReady = line.participants.length > 0 && weightTotal > 0n;
    const refunds = (line.refunds ?? []).filter(refund => refund.status !== "voided");
    const activeSnapshots = refunds.map(refund => refund.participants);
    if (activeSnapshots.length > 1 && activeSnapshots.some(snapshot => JSON.stringify(snapshot.map(row => [row.personId, row.allocationOrder, row.weight, row.originalProductShareCents, row.originalChinaShareCents, row.originalProductFeeShareCents])) !== JSON.stringify(activeSnapshots[0].map(row => [row.personId, row.allocationOrder, row.weight, row.originalProductShareCents, row.originalChinaShareCents, row.originalProductFeeShareCents])))) throw new Error("Os snapshots de participantes dos reembolsos deste produto divergem.");
    const requestedProduct = refunds.filter(refund => refund.status === "requested").reduce((sum, refund) => sum + BigInt(refund.requestedProductCents), 0n);
    const requestedChina = refunds.filter(refund => refund.status === "requested").reduce((sum, refund) => sum + BigInt(refund.requestedChinaCents), 0n);
    const requestedForLine = checkedCents(requestedProduct + requestedChina);
    const receivedProduct = refunds.filter(refund => refund.status === "received").reduce((sum, refund) => sum + BigInt(refund.receivedProductCents ?? 0), 0n);
    const receivedChina = refunds.filter(refund => refund.status === "received").reduce((sum, refund) => sum + BigInt(refund.receivedChinaCents ?? 0), 0n);
    const receivedForLine = checkedCents(receivedProduct + receivedChina);
    requestedRefundCount += refunds.filter(refund => refund.status === "requested").length;
    requestedRefundCents = checkedCents(BigInt(requestedRefundCents) + BigInt(requestedForLine));
    receivedRefundCents = checkedCents(BigInt(receivedRefundCents) + BigInt(receivedForLine));
    const priceTotal = lineProductTotal(line);
    const chinaTotal = lineChinaTotal(line);
    const originalProductShares = priceTotal === null ? null : splitByWeights(priceTotal, line.participants);
    const originalChinaShares = chinaTotal === null ? null : splitByWeights(chinaTotal, line.participants);
    const snapshot = activeSnapshots[0] ?? [];
    const shares = line.participants.map((participant, index) => {
      const grossPartial = compositionReady
        ? checkedCents(components.get(line.id)!.reduce((sum, component) => {
          const values = component.pending ? null : splitByWeights(component.value, line.participants);
          return sum + BigInt(values?.[index] ?? 0);
        }, 0n))
        : null;
      const personSnapshot = snapshot.find(row => row.personId === participant.personId);
      const productCapacity = personSnapshot?.originalProductShareCents ?? originalProductShares?.[index] ?? 0;
      const chinaCapacity = personSnapshot?.originalChinaShareCents ?? originalChinaShares?.[index] ?? 0;
      const productCredits = compositionReady && snapshot.length ? (splitByWeights(checkedCents(receivedProduct), snapshot.map(row => ({ personId: row.personId, allocationOrder: row.allocationOrder, weight: row.originalProductShareCents })) ?? [])?.[snapshot.findIndex(row => row.personId === participant.personId)] ?? 0) : 0;
      const chinaCredits = compositionReady && snapshot.length ? (splitByWeights(checkedCents(receivedChina), snapshot.map(row => ({ personId: row.personId, allocationOrder: row.allocationOrder, weight: row.originalChinaShareCents })) ?? [])?.[snapshot.findIndex(row => row.personId === participant.personId)] ?? 0) : 0;
      const productRequested = compositionReady && snapshot.length ? (splitByWeights(checkedCents(requestedProduct), snapshot.map(row => ({ personId: row.personId, allocationOrder: row.allocationOrder, weight: row.originalProductShareCents })) ?? [])?.[snapshot.findIndex(row => row.personId === participant.personId)] ?? 0) : 0;
      const chinaRequested = compositionReady && snapshot.length ? (splitByWeights(checkedCents(requestedChina), snapshot.map(row => ({ personId: row.personId, allocationOrder: row.allocationOrder, weight: row.originalChinaShareCents })) ?? [])?.[snapshot.findIndex(row => row.personId === participant.personId)] ?? 0) : 0;
      if (productCredits > productCapacity || chinaCredits > chinaCapacity) throw new Error("O crédito recebido excede a parcela original do participante.");
      const credit = checkedCents(BigInt(productCredits) + BigInt(chinaCredits));
      const partialAmountCents = grossPartial === null ? null : checkedCents(BigInt(grossPartial) - BigInt(credit));
      return { personId: participant.personId, grossPartialAmountCents: grossPartial, receivedRefundCents: credit, requestedRefundCents: checkedCents(BigInt(productRequested) + BigInt(chinaRequested)), partialAmountCents, amountCents: partialAmountCents !== null && pendingComponents.length === 0 && !refunds.some(refund => refund.status === "requested") ? partialAmountCents : null };
    });
    const creditWithinLine = shares.reduce((sum, share) => sum + BigInt(share.receivedRefundCents), 0n);
    if (compositionReady && creditWithinLine !== receivedProduct + receivedChina) throw new Error("As parcelas pessoais do reembolso não conciliam com o recebido.");
    const knownTotal = checkedCents(BigInt(grossKnownTotal) - (compositionReady ? creditWithinLine : BigInt(receivedForLine)));
    const undistributedCents = compositionReady ? 0 : knownTotal;
    if (!compositionReady) pendingComponents.push("divisão por pessoa pendente");
    if (refunds.some(refund => refund.status === "requested")) pendingComponents.push("reembolso solicitado");
    return {
      id: line.id,
      itemOrder: line.itemOrder,
      quantity: line.quantity,
      purchasedQuantity: line.quantity,
      cancelledQuantity,
      shippingQuantity,
      allocatedQuantity,
      productBaseCents: productBases.find(entry => entry.line.id === line.id)?.base ?? null,
      components: components.get(line.id)!.map(component => ({ name: component.name, amountCents: component.pending ? null : component.value })),
      partialCents: knownTotal,
      grossPartialCents: grossKnownTotal,
      receivedRefundCents: receivedForLine,
      requestedRefundCents: requestedForLine,
      refundCount: refunds.length,
      hasKnownAmount: components.get(line.id)!.some(component => !component.pending),
      undistributedCents,
      totalCents: pendingComponents.length ? null : knownTotal,
      pendingComponents,
      shares,
    };
  });
  const partialCents = checkedCents(results.reduce((sum, line) => sum + BigInt(line.partialCents), 0n));
  const grossPartialCents = checkedCents(results.reduce((sum, line) => sum + BigInt(line.grossPartialCents), 0n));
  const undistributedCents = checkedCents(results.reduce((sum, line) => sum + BigInt(line.undistributedCents), 0n));
  const packageValuesResolved = chargeSummaries.every(pkg => pkg.freight.total !== null && pkg.customs.base !== null);
  const allValuesResolved = results.every(line => line.pendingComponents.length === 0) && packageValuesResolved && requestedRefundCount === 0;
  return {
    items: results,
    packages: chargeSummaries,
    productsCharge: {
      baseCents: productsBaseKnown ? productsBaseCents : null,
      feeCents: productsFeeCents,
      totalCents: productsBaseKnown && productsFeeCents !== null ? checkedCents(BigInt(productsBaseCents) + BigInt(productsFeeCents)) : null,
      paymentStatus: input.productsCharge.paymentStatus,
      paymentMethod: input.productsCharge.paymentMethod,
      feeBps: input.productsCharge.feeBps,
    },
    summary: {
      partialCents,
      grossPartialCents,
      receivedRefundCents,
      requestedRefundCents,
      requestedRefundCount,
      hasKnownAmount: results.some(line => line.hasKnownAmount),
      undistributedCents,
      totalCents: allValuesResolved ? partialCents : null,
      unitCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      purchasedUnits: lines.reduce((sum, line) => sum + line.quantity, 0),
      cancelledUnits: results.reduce((sum, line) => sum + line.cancelledQuantity, 0),
      shippingUnits: results.reduce((sum, line) => sum + line.shippingQuantity, 0),
      assignedUnits: results.reduce((sum, line) => sum + line.allocatedQuantity, 0),
      pendingItemCount: results.filter(line => line.pendingComponents.length > 0).length,
      allValuesResolved,
    },
  };
}
