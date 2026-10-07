export type SharingMode = "equal" | "percentage" | "fixed";

export type CostParticipant = {
  personId: string;
  percentageBps?: number | null;
  amountCents?: number | null;
};

export type CostAllocation = {
  subtotalCents: number | null;
  participants: { personId: string; allocationOrder: number; amountCents: number | null }[];
};

type CostItem = { quantity: number; unitPriceCents: number | null; sharingMode: SharingMode };

const MAX_SUBTOTAL_CENTS = 1_000_000_000_000;

function assertSafeCents(value: bigint) {
  if (value < 0n || value > BigInt(MAX_SUBTOTAL_CENTS) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Subtotal acima do limite permitido.");
  }
  return Number(value);
}

export function allocateItemCost(item: CostItem, participants: CostParticipant[]): CostAllocation {
  if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10_000) throw new Error("Quantidade inválida.");
  if (item.unitPriceCents !== null && (!Number.isSafeInteger(item.unitPriceCents) || item.unitPriceCents < 0 || item.unitPriceCents > 100_000_000)) throw new Error("Preço unitário inválido.");
  if (!participants.length) throw new Error("Selecione ao menos uma pessoa.");

  const people = new Set<string>();
  for (const participant of participants) {
    if (!participant.personId || people.has(participant.personId)) throw new Error("As pessoas selecionadas devem ser únicas.");
    people.add(participant.personId);
  }

  const subtotalCents = item.unitPriceCents === null
    ? null
    : assertSafeCents(BigInt(item.quantity) * BigInt(item.unitPriceCents));
  const result = participants.map((participant, allocationOrder) => ({ personId: participant.personId, allocationOrder, amountCents: null as number | null }));

  if (item.sharingMode === "fixed") {
    if (subtotalCents === null) throw new Error("Informe o preço para dividir valores fixos.");
    let sum = 0n;
    participants.forEach((participant, index) => {
      const amount = participant.amountCents;
      if (!Number.isSafeInteger(amount) || amount! < 0 || amount! > MAX_SUBTOTAL_CENTS) throw new Error("Informe um valor válido para cada pessoa.");
      sum += BigInt(amount!);
      result[index].amountCents = amount!;
    });
    if (sum !== BigInt(subtotalCents)) throw new Error("Os valores precisam somar exatamente o subtotal do item.");
    return { subtotalCents, participants: result };
  }

  if (item.sharingMode === "percentage") {
    let basisPoints = 0;
    participants.forEach(participant => {
      const value = participant.percentageBps;
      if (!Number.isInteger(value) || value! < 0 || value! > 10_000) throw new Error("Informe um percentual válido para cada pessoa.");
      basisPoints += value!;
    });
    if (basisPoints !== 10_000) throw new Error("Os percentuais precisam somar 100%.");
    if (subtotalCents === null) return { subtotalCents: null, participants: result };

    const denominator = 10_000n;
    const allocations = participants.map((participant, index) => {
      const numerator = BigInt(subtotalCents) * BigInt(participant.percentageBps!);
      return { index, amount: numerator / denominator, remainder: numerator % denominator };
    });
    const assigned = allocations.reduce((sum, allocation) => sum + allocation.amount, 0n);
    const centsRemaining = BigInt(subtotalCents) - assigned;
    allocations.sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
    for (let i = 0; i < Number(centsRemaining); i++) allocations[i].amount += 1n;
    for (const allocation of allocations) result[allocation.index].amountCents = assertSafeCents(allocation.amount);
    return { subtotalCents, participants: result };
  }

  if (participants.some(participant => participant.percentageBps != null || participant.amountCents != null)) {
    throw new Error("A divisão igual não aceita valores individuais.");
  }
  if (subtotalCents !== null) {
    const total = BigInt(subtotalCents), count = BigInt(participants.length), base = total / count, remainder = Number(total % count);
    result.forEach((participant, index) => { participant.amountCents = assertSafeCents(base + (index < remainder ? 1n : 0n)); });
  }
  return { subtotalCents, participants: result };
}
