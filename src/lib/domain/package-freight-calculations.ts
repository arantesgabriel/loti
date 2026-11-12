import { allocateExactMinor } from "./hubbuy-balance-calculations";
import { MAX_FINANCIAL_MINOR } from "./financial-money";
import { unitPersonMatrix } from "./warehouse-calculations";

export type FreightUnit = {
  costItemId: string;
  unitIndex: number;
  order: number;
  participants: { personId: string; order: number; weight: number }[];
};
export type FreightAmount = { sourceId: string; order: number; amountMinor: number };

function minor(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_FINANCIAL_MINOR) throw new Error("Valor do rateio inválido.");
}

/** Allocate ONE currency/component at a time. Captured order is independent of
 * display names, pagination and query ordering. No quantities are inferred from names.
 */
export function allocateFreightComponent(input: { units: FreightUnit[]; sources: FreightAmount[] }) {
  if (!input.units.length || input.units.length > 10000 || !input.sources.length) throw new Error("Informe unidades e fontes para o rateio.");
  const units = [...input.units].sort((a, b) => a.order - b.order);
  const sources = [...input.sources].sort((a, b) => a.order - b.order);
  const unitIds = new Set<string>(), unitOrders = new Set<number>(), sourceIds = new Set<string>(), sourceOrders = new Set<number>();
  const compositions = new Map<string, string>();
  for (const unit of units) {
    const key = JSON.stringify([unit.costItemId, unit.unitIndex]);
    if (!unit.costItemId || !Number.isSafeInteger(unit.unitIndex) || unit.unitIndex < 0 || !Number.isSafeInteger(unit.order) || unit.order < 0 || unitIds.has(key) || unitOrders.has(unit.order)) throw new Error("Unidades ou ordem do rateio inválidas.");
    unitIds.add(key); unitOrders.add(unit.order);
    if (!unit.participants.length || unit.participants.length > 100) throw new Error("Participantes do rateio inválidos.");
    const people = new Set<string>(), orders = new Set<number>();
    let weight = 0n;
    for (const participant of unit.participants) {
      minor(participant.weight);
      if (!participant.personId || people.has(participant.personId) || !Number.isSafeInteger(participant.order) || participant.order < 0 || orders.has(participant.order)) throw new Error("Participantes ou ordem duplicados.");
      people.add(participant.personId); orders.add(participant.order); weight += BigInt(participant.weight);
    }
    if (!weight) throw new Error("Resolva os pesos dos participantes antes do rateio.");
    const composition = JSON.stringify([...unit.participants].sort((a, b) => a.order - b.order));
    if (compositions.has(unit.costItemId) && compositions.get(unit.costItemId) !== composition) throw new Error("Unidades da mesma origem têm composições diferentes.");
    compositions.set(unit.costItemId, composition);
  }
  let total = 0n;
  for (const source of sources) {
    minor(source.amountMinor);
    if (!source.sourceId || sourceIds.has(source.sourceId) || !Number.isSafeInteger(source.order) || source.order < 0 || sourceOrders.has(source.order)) throw new Error("Fontes ou ordem do rateio inválidas.");
    sourceIds.add(source.sourceId); sourceOrders.add(source.order); total += BigInt(source.amountMinor);
  }
  if (total > BigInt(MAX_FINANCIAL_MINOR)) throw new Error("O total do rateio excede o limite permitido.");
  const unitTotals = allocateExactMinor(Number(total), units.map(unit => ({ id: JSON.stringify([unit.costItemId, unit.unitIndex]), order: unit.order, weight: 1 })));
  // Treat sources as transport columns: both source and physical-unit margins close.
  const sourceMatrix = unitPersonMatrix(unitTotals, sources.map(source => ({ personId: source.sourceId, amountCents: source.amountMinor })));
  const allocations: { sourceId: string; costItemId: string; unitIndex: number; personId: string; amountMinor: number }[] = [];
  for (const costItemId of compositions.keys()) {
    const selected = units.map((unit, index) => ({ unit, index })).filter(row => row.unit.costItemId === costItemId);
    const participants = [...selected[0].unit.participants].sort((a, b) => a.order - b.order);
    const values = selected.map(row => unitTotals[row.index]);
    const itemTotal = values.reduce((sum, value) => sum + value, 0);
    const personal = allocateExactMinor(itemTotal, participants.map(person => ({ id: person.personId, order: person.order, weight: person.weight })));
    const peopleMatrix = unitPersonMatrix(values, participants.map((person, index) => ({ personId: person.personId, amountCents: personal[index] })));
    selected.forEach((row, index) => {
      // Source routing must never move a cent between beneficiaries. Transport
      // within this unit preserves its already-established personal margins.
      const routed = unitPersonMatrix(peopleMatrix[index].map(person => person.amountCents), sourceMatrix[row.index]);
      routed.forEach((sourceShares, personIndex) => sourceShares.forEach(source => {
        if (source.amountCents) allocations.push({ sourceId: source.personId, costItemId, unitIndex: row.unit.unitIndex, personId: participants[personIndex].personId, amountMinor: source.amountCents });
      }));
    });
  }
  return {
    totalMinor: Number(total),
    units: units.map((unit, index) => ({ costItemId: unit.costItemId, unitIndex: unit.unitIndex, order: unit.order, amountMinor: unitTotals[index] })),
    allocations,
  };
}
