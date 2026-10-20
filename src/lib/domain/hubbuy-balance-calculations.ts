import { calculateExternalFeeBrl, roundRatioHalfUp, MAX_FINANCIAL_MINOR } from "./financial-money";

export type FundingSourceKind = "balance" | "pix" | "card";

export type FundingSourceInput = {
  id: string;
  order: number;
  kind: FundingSourceKind;
  cnyMinor: number;
  /** Historical base for balance; actual principal for PIX/card. */
  principalBrlCents: number;
  /** Balance must use 0. External sources capture their own rate. */
  feeBps: number;
};

export type FundingTargetInput = {
  id: string;
  order: number;
  cnyMinor: number;
  /** Omit to allow every source; otherwise this is an explicit routing constraint. */
  eligibleSourceIds?: string[];
};

export type FundingAllocation = {
  sourceId: string;
  targetId: string;
  cnyMinor: number;
  principalBrlCents: number;
  feeBrlCents: number;
  costBrlCents: number;
  newMoneyBrlCents: number;
};

function assertMinor(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_FINANCIAL_MINOR) throw new Error(label);
}

function ordered<T extends { id: string; order: number }>(values: T[], label: string): T[] {
  const ids = new Set<string>();
  for (const value of values) {
    if (!value.id || ids.has(value.id) || !Number.isInteger(value.order) || value.order < 0) throw new Error(label);
    ids.add(value.id);
  }
  return [...values].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

type FlowEdge = { to: number; reverse: number; residual: bigint; initial: bigint };

function addEdge(graph: FlowEdge[][], from: number, to: number, capacity: bigint): FlowEdge {
  const forward: FlowEdge = { to, reverse: graph[to].length, residual: capacity, initial: capacity };
  const backward: FlowEdge = { to: from, reverse: graph[from].length, residual: 0n, initial: 0n };
  graph[from].push(forward);
  graph[to].push(backward);
  return forward;
}

function buildFundingMatrix(sources: FundingSourceInput[], targets: FundingTargetInput[]) {
  const sourceTotal = sources.reduce((sum, row) => sum + BigInt(row.cnyMinor), 0n);
  const targetTotal = targets.reduce((sum, row) => sum + BigInt(row.cnyMinor), 0n);
  if (sourceTotal !== targetTotal) throw new Error("As fontes de pagamento não fecham o principal CNY do pedido.");
  if (sourceTotal > BigInt(MAX_FINANCIAL_MINOR)) throw new Error("O total CNY excede o limite permitido.");
  if (sourceTotal === 0n) return sources.map(() => targets.map(() => 0));

  const sourceStart = 1;
  const targetStart = sourceStart + sources.length;
  const sink = targetStart + targets.length;
  const graph: FlowEdge[][] = Array.from({ length: sink + 1 }, () => []);
  const allocationEdges: FlowEdge[][] = sources.map(() => targets.map(() => ({ to: 0, reverse: 0, residual: 0n, initial: 0n })));

  sources.forEach((source, sourceIndex) => addEdge(graph, 0, sourceStart + sourceIndex, BigInt(source.cnyMinor)));
  targets.forEach((target, targetIndex) => addEdge(graph, targetStart + targetIndex, sink, BigInt(target.cnyMinor)));
  sources.forEach((source, sourceIndex) => {
    const eligible = sourceTargets(source, targets);
    targets.forEach((target, targetIndex) => {
      if (!eligible.has(target.id)) return;
      allocationEdges[sourceIndex][targetIndex] = addEdge(
        graph,
        sourceStart + sourceIndex,
        targetStart + targetIndex,
        BigInt(Math.min(source.cnyMinor, target.cnyMinor)),
      );
    });
  });

  let flow = 0n;
  while (flow < sourceTotal) {
    const parentNode = Array<number>(graph.length).fill(-1);
    const parentEdge = Array<number>(graph.length).fill(-1);
    const queue = [0];
    parentNode[0] = 0;
    for (let cursor = 0; cursor < queue.length && parentNode[sink] === -1; cursor++) {
      const node = queue[cursor];
      graph[node].forEach((edge, edgeIndex) => {
        if (edge.residual > 0n && parentNode[edge.to] === -1) {
          parentNode[edge.to] = node;
          parentEdge[edge.to] = edgeIndex;
          queue.push(edge.to);
        }
      });
    }
    if (parentNode[sink] === -1) throw new Error("A composição das fontes por produto é inviável.");
    let increment = sourceTotal - flow;
    for (let node = sink; node !== 0; node = parentNode[node]) {
      increment = increment < graph[parentNode[node]][parentEdge[node]].residual
        ? increment
        : graph[parentNode[node]][parentEdge[node]].residual;
    }
    for (let node = sink; node !== 0; node = parentNode[node]) {
      const edge = graph[parentNode[node]][parentEdge[node]];
      edge.residual -= increment;
      graph[node][edge.reverse].residual += increment;
    }
    flow += increment;
  }

  return allocationEdges.map(row => row.map(edge => Number(edge.initial - edge.residual)));
}

function sourceTargets(source: FundingSourceInput, targets: FundingTargetInput[]) {
  return new Set(targets
    .filter(target => target.eligibleSourceIds === undefined || target.eligibleSourceIds.includes(source.id))
    .map(target => target.id));
}

function splitExact(total: number, weights: { id: string; order: number; weight: number }[]) {
  assertMinor(total, "O total a distribuir é inválido.");
  if (!weights.length) {
    if (total !== 0) throw new Error("Não há destino para distribuir o valor.");
    return [];
  }
  for (const row of weights) {
    if (!row.id || !Number.isSafeInteger(row.order) || row.order < 0) throw new Error("Ordem de distribuição inválida.");
    if (!Number.isSafeInteger(row.weight) || row.weight < 0 || row.weight > MAX_FINANCIAL_MINOR) throw new Error("Peso de distribuição inválido.");
  }
  if (new Set(weights.map(row => row.id)).size !== weights.length) throw new Error("Os destinos da distribuição devem ser únicos.");
  const totalWeight = weights.reduce((sum, row) => sum + BigInt(row.weight), 0n);
  if (totalWeight === 0n) {
    if (total !== 0) throw new Error("Não há base para distribuir o valor.");
    return weights.map(() => 0);
  }
  const shares = weights.map((row, index) => {
    const numerator = BigInt(total) * BigInt(row.weight);
    return { index, value: numerator / totalWeight, remainder: numerator % totalWeight };
  });
  let left = BigInt(total) - shares.reduce((sum, row) => sum + row.value, 0n);
  const ranked = [...shares].sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
    return weights[a.index].order - weights[b.index].order || weights[a.index].id.localeCompare(weights[b.index].id);
  });
  if (left > BigInt(ranked.length)) throw new Error("O arredondamento da distribuição excede sua precisão.");
  for (let index = 0; left > 0n; index++, left--) ranked[index].value += 1n;
  const result = Array<number>(weights.length).fill(0);
  shares.forEach(row => {
    if (row.value > BigInt(MAX_FINANCIAL_MINOR)) throw new Error("A parcela distribuída excede o limite permitido.");
    result[row.index] = Number(row.value);
  });
  return result;
}

/** Largest-remainder allocation for CNY units or BRL cents, with stable persisted ordering. */
export function allocateExactMinor(total: number, destinations: { id: string; order: number; weight: number }[]) {
  const sorted = ordered(destinations, "Os destinos da distribuição devem ser únicos e ordenados.");
  const shares = splitExact(total, sorted);
  const sharesById = new Map(sorted.map((destination, index) => [destination.id, shares[index]]));
  return destinations.map(destination => sharesById.get(destination.id)!);
}

export function calculatePaymentFunding(input: { sources: FundingSourceInput[]; targets: FundingTargetInput[] }) {
  const sources = ordered(input.sources, "As fontes de pagamento devem ser únicas e ordenadas.");
  const targets = ordered(input.targets, "Os destinos do pagamento devem ser únicos e ordenados.");
  if (!sources.length || !targets.length) throw new Error("Informe as fontes e os destinos do pagamento.");
  for (const source of sources) {
    assertMinor(source.cnyMinor, "Principal CNY da fonte inválido.");
    assertMinor(source.principalBrlCents, "Principal BRL da fonte inválido.");
    if (!Number.isInteger(source.feeBps) || source.feeBps < 0 || source.feeBps > 10_000) throw new Error("Percentual de taxa inválido.");
    if (source.kind === "balance" && source.feeBps !== 0) throw new Error("A fonte de saldo não pode receber taxa de pagamento.");
    if ((source.kind === "pix" || source.kind === "card") && source.cnyMinor > 0 && source.principalBrlCents === 0) throw new Error("Informe o principal BRL da fonte externa.");
    if (source.cnyMinor === 0 && (source.principalBrlCents !== 0 || source.feeBps !== 0)) throw new Error("Uma fonte sem principal CNY não pode carregar valores BRL ou taxa.");
  }
  for (const target of targets) {
    assertMinor(target.cnyMinor, "Principal CNY do destino inválido.");
    if (target.eligibleSourceIds && new Set(target.eligibleSourceIds).size !== target.eligibleSourceIds.length) throw new Error("As fontes elegíveis de um destino devem ser únicas.");
    if (target.eligibleSourceIds?.some(id => !sources.some(source => source.id === id))) throw new Error("O destino referencia uma fonte de pagamento desconhecida.");
  }

  const matrix = buildFundingMatrix(sources, targets);
  const allocations: FundingAllocation[] = [];
  sources.forEach((source, sourceIndex) => {
    const targetRows = targets.map((target, targetIndex) => ({ target, cnyMinor: matrix[sourceIndex][targetIndex] })).filter(row => row.cnyMinor > 0);
    const principalShares = splitExact(source.principalBrlCents, targetRows.map(row => ({ id: row.target.id, order: row.target.order, weight: row.cnyMinor })));
    const feeTotal = source.kind === "balance" ? 0 : calculateExternalFeeBrl(source.principalBrlCents, source.feeBps);
    const feeShares = splitExact(feeTotal, principalShares.map((principalBrlCents, index) => ({ id: targetRows[index].target.id, order: targetRows[index].target.order, weight: principalBrlCents })));
    targetRows.forEach((row, index) => {
      const principalBrlCents = principalShares[index];
      const feeBrlCents = feeShares[index];
      allocations.push({
        sourceId: source.id,
        targetId: row.target.id,
        cnyMinor: row.cnyMinor,
        principalBrlCents,
        feeBrlCents,
        costBrlCents: principalBrlCents + feeBrlCents,
        newMoneyBrlCents: source.kind === "balance" ? 0 : principalBrlCents + feeBrlCents,
      });
    });
  });

  const byTarget = targets.map(target => {
    const rows = allocations.filter(row => row.targetId === target.id);
    const cnyMinor = rows.reduce((sum, row) => sum + row.cnyMinor, 0);
    const costBrlCents = rows.reduce((sum, row) => sum + row.costBrlCents, 0);
    const newMoneyBrlCents = rows.reduce((sum, row) => sum + row.newMoneyBrlCents, 0);
    if (cnyMinor !== target.cnyMinor) throw new Error("As alocações CNY do destino não fecham.");
    return { targetId: target.id, cnyMinor, costBrlCents, newMoneyBrlCents };
  });
  return { allocations, targets: byTarget };
}

export type AvailableCreditLot = {
  creditId: string;
  sequence: number;
  availableCnyMinor: number;
  availableHistoricalBrlCents: number;
};

/** The caller must pass only lots already authorized for this account and financing policy. */
export function previewFifoConsumption(amountCnyMinor: number, eligibleLots: AvailableCreditLot[]) {
  assertMinor(amountCnyMinor, "O consumo CNY é inválido.");
  const lots = [...eligibleLots].sort((a, b) => a.sequence - b.sequence || a.creditId.localeCompare(b.creditId));
  const ids = new Set<string>(), sequences = new Set<number>();
  for (const lot of lots) {
    assertMinor(lot.availableCnyMinor, "O saldo CNY do lote é inválido.");
    assertMinor(lot.availableHistoricalBrlCents, "A base histórica do lote é inválida.");
    if (!lot.creditId || ids.has(lot.creditId) || !Number.isSafeInteger(lot.sequence) || lot.sequence < 0 || sequences.has(lot.sequence)) {
      throw new Error("Os lotes de crédito devem ter IDs e sequências únicos.");
    }
    ids.add(lot.creditId);
    sequences.add(lot.sequence);
  }
  const totalAvailable = lots.reduce((sum, lot) => sum + BigInt(lot.availableCnyMinor), 0n);
  if (BigInt(amountCnyMinor) > totalAvailable) throw new Error("O saldo elegível da conta é insuficiente.");
  let remaining = amountCnyMinor;
  const consumptions: { creditId: string; sequence: number; cnyMinor: number; historicalBrlCents: number }[] = [];
  for (const lot of lots) {
    if (remaining === 0) break;
    // Earlier payment components may have exhausted this lot in the same transaction.
    if (lot.availableCnyMinor === 0) continue;
    const cnyMinor = Math.min(remaining, lot.availableCnyMinor);
    const historicalBrlCents = cnyMinor === lot.availableCnyMinor
      ? lot.availableHistoricalBrlCents
      : Number(roundRatioHalfUp(BigInt(cnyMinor) * BigInt(lot.availableHistoricalBrlCents), BigInt(lot.availableCnyMinor)));
    consumptions.push({ creditId: lot.creditId, sequence: lot.sequence, cnyMinor, historicalBrlCents });
    remaining -= cnyMinor;
  }
  return {
    consumptions,
    consumedCnyMinor: amountCnyMinor,
    historicalBrlCents: consumptions.reduce((sum, row) => sum + row.historicalBrlCents, 0),
  };
}

export function allocateRefundAcrossSources(
  refundCnyMinor: number,
  sources: {
    id: string;
    order: number;
    remainingRefundableCnyMinor: number;
    remainingHistoricalBrlCents: number;
  }[],
) {
  assertMinor(refundCnyMinor, "O reembolso CNY é inválido.");
  const orderedSources = ordered(sources, "As fontes do reembolso devem ser únicas e ordenadas.");
  orderedSources.forEach(source => {
    assertMinor(source.remainingRefundableCnyMinor, "A capacidade de reembolso da fonte é inválida.");
    assertMinor(source.remainingHistoricalBrlCents, "A base histórica restante da fonte é inválida.");
    if (source.remainingRefundableCnyMinor === 0 && source.remainingHistoricalBrlCents !== 0) {
      throw new Error("Uma fonte sem principal CNY restante não pode manter base histórica restituível.");
    }
  });
  const capacity = orderedSources.reduce((sum, source) => sum + BigInt(source.remainingRefundableCnyMinor), 0n);
  if (BigInt(refundCnyMinor) > capacity) throw new Error("O reembolso excede o principal CNY restante das fontes.");
  if (refundCnyMinor === 0) return orderedSources.map(source => ({ sourceId: source.id, cnyMinor: 0, historicalBrlCents: 0 }));
  const shares = splitExact(refundCnyMinor, orderedSources.map(source => ({ id: source.id, order: source.order, weight: source.remainingRefundableCnyMinor })));
  return orderedSources.map((source, index) => {
    if (shares[index] > source.remainingRefundableCnyMinor) throw new Error("A parcela de reembolso excede a capacidade da fonte.");
    const historicalBrlCents = shares[index] === source.remainingRefundableCnyMinor
      ? source.remainingHistoricalBrlCents
      : source.remainingRefundableCnyMinor === 0
        ? 0
        : Number(roundRatioHalfUp(
            BigInt(shares[index]) * BigInt(source.remainingHistoricalBrlCents),
            BigInt(source.remainingRefundableCnyMinor),
          ));
    return { sourceId: source.id, cnyMinor: shares[index], historicalBrlCents };
  });
}
