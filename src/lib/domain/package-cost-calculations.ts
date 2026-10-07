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
  for (const line of lines) {
    const price = valueTotal(line.effectivePrice, line.quantity);
    const china = valueTotal(line.chinaFreight, line.quantity);
    components.set(line.id, [
      { name: "Preço efetivo", value: price ?? 0, pending: price === null },
      { name: "Frete China", value: china ?? 0, pending: china === null },
    ]);
  }

  const productBases = lines.map(line => {
    const price = valueTotal(line.effectivePrice, line.quantity), china = valueTotal(line.chinaFreight, line.quantity);
    return { line, base: price === null || china === null ? null : checkedCents(BigInt(price) + BigInt(china)) };
  });
  const productsBaseKnown = productBases.every(entry => entry.base !== null);
  const productsBaseCents = checkedCents(productBases.reduce((sum, entry) => sum + BigInt(entry.base ?? 0), 0n));
  let productsFeeCents: number | null = null;
  let productsFeeByLine = new Map<string, number>();
  if (productsBaseKnown) {
    if (productsBaseCents === 0) {
      productsFeeCents = 0;
      productsFeeByLine = new Map(lines.map(line => [line.id, 0]));
    } else if (input.productsCharge.feeBps !== null && input.productsCharge.paymentMethod !== null) {
      productsFeeCents = roundFeeCents(productsBaseCents, input.productsCharge.feeBps);
      const feeShares = splitByWeights(productsFeeCents, productBases.map((entry, index) => ({ personId: entry.line.id, allocationOrder: index, weight: entry.base ?? 0 })));
      productsFeeByLine = new Map(lines.map((line, index) => [line.id, feeShares?.[index] ?? 0]));
    }
  }
  for (const line of lines) {
    const fee = productsFeeByLine.get(line.id);
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
      if (!Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > line.quantity) throw new Error("Quantidade do pacote inválida.");
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

  const results = lines.map(line => {
    const allocatedQuantity = assignedByLine.get(line.id) ?? 0;
    if (allocatedQuantity > line.quantity) throw new Error("A quantidade alocada excede o item comprado.");
    const pendingComponents = components.get(line.id)!.filter(component => component.pending).map(component => component.name);
    if (allocatedQuantity < line.quantity) pendingComponents.push(`${line.quantity - allocatedQuantity} unidades sem pacote`);
    const knownTotal = checkedCents(components.get(line.id)!.reduce((sum, component) => sum + BigInt(component.value), 0n));
    const weightTotal = line.participants.reduce((sum, participant) => sum + BigInt(participant.weight), 0n);
    const compositionReady = line.participants.length > 0 && weightTotal > 0n;
    const shareByComponent = components.get(line.id)!.map(component => component.pending ? null : splitByWeights(component.value, line.participants));
    const shares = line.participants.map((participant, index) => {
      const partialAmountCents = compositionReady
        ? checkedCents(shareByComponent.reduce((sum, component) => sum + BigInt(component?.[index] ?? 0), 0n))
        : null;
      return { personId: participant.personId, partialAmountCents, amountCents: partialAmountCents !== null && pendingComponents.length === 0 ? partialAmountCents : null };
    });
    const undistributedCents = compositionReady ? 0 : knownTotal;
    if (!compositionReady) pendingComponents.push("divisão por pessoa pendente");
    return {
      id: line.id,
      itemOrder: line.itemOrder,
      quantity: line.quantity,
      allocatedQuantity,
      productBaseCents: productBases.find(entry => entry.line.id === line.id)?.base ?? null,
      components: components.get(line.id)!.map(component => ({ name: component.name, amountCents: component.pending ? null : component.value })),
      partialCents: knownTotal,
      hasKnownAmount: components.get(line.id)!.some(component => !component.pending),
      undistributedCents,
      totalCents: pendingComponents.length ? null : knownTotal,
      pendingComponents,
      shares,
    };
  });
  const partialCents = checkedCents(results.reduce((sum, line) => sum + BigInt(line.partialCents), 0n));
  const undistributedCents = checkedCents(results.reduce((sum, line) => sum + BigInt(line.undistributedCents), 0n));
  const allValuesResolved = results.every(line => line.pendingComponents.length === 0);
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
      hasKnownAmount: results.some(line => line.hasKnownAmount),
      undistributedCents,
      totalCents: allValuesResolved ? partialCents : null,
      unitCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      assignedUnits: results.reduce((sum, line) => sum + line.allocatedQuantity, 0),
      pendingItemCount: results.filter(line => line.pendingComponents.length > 0).length,
      allValuesResolved,
    },
  };
}
