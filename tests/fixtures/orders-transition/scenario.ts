import { eq } from "drizzle-orm";
import type { AppDatabase } from "../../../src/lib/db/connection";
import { createServices } from "../../../src/lib/domain/services";
import { initializeLegacyPurchaseCosts } from "../../../src/lib/domain/purchase-cost-initialization";
import { packageCostServices } from "../../../src/lib/domain/package-cost-services";
import { hubbuyBalanceServices } from "../../../src/lib/domain/hubbuy-balance-services";
import { allocateExactMinor } from "../../../src/lib/domain/hubbuy-balance-calculations";
import { splitByWeights } from "../../../src/lib/domain/package-cost-calculations";
import { purchasePackages } from "../../../src/lib/db/schema";

export const scenarioId = "orders-transition-v1";
export const qaPassword = "Loti-Orders-QA-Only-2026!";
export const refunds = [
  ["Brinquedo QA", 1425, 232], ["Calçado cancelado QA", 6907, 941],
  ["Meias A QA", 294, 351], ["Meias B QA", 294, 351], ["Meias C QA", 302, 352],
  ["Camisa presente QA", 2763, 464], ["Tênis cancelado QA", 10378, 976], ["Meias D QA", 389, 352],
  ["Memória compartilhada A QA", 24007, 3896], ["Memória compartilhada B QA", 18756, 3044],
] as const;
export const additions = [
  { name: "Acessório compartilhado A", quantity: 1, cny: 1902, brl: 1428, china: 0 },
  { name: "Cordas compartilhadas B", quantity: 1, cny: 3074, brl: 2307, china: 0 },
  { name: "Cordas compartilhadas C", quantity: 2, cny: 4612, brl: 3461, china: 0 },
  { name: "Cordas compartilhadas D", quantity: 2, cny: 4612, brl: 3462, china: 0 },
  { name: "Polo QA", quantity: 1, cny: 4723, brl: 3545, china: 600 },
  { name: "Tênis QA", quantity: 1, cny: 18171, brl: 14185, china: 1414 },
  { name: "Camiseta QA", quantity: 1, cny: 2639, brl: 2242, china: 0 },
  { name: "Camiseta B QA", quantity: 1, cny: 2618, brl: 1980, china: 375 },
  { name: "Kit QA", quantity: 1, cny: 3300, brl: 2535, china: 77 },
] as const;

/** Invert the actual largest-remainder fee allocation; never adjust a paid charge. */
export function originalBases() {
  const gross = [...refunds.map(([, received, retained]) => received + retained), ...Array<number>(19).fill(4426), 4425];
  const bases = gross.map(value => Number((BigInt(value) * 10000n + 5050n) / 10100n));
  for (let attempt = 0; attempt < 100; attempt++) {
    bases[29] += 163359 - bases.reduce((sum, value) => sum + value, 0);
    const fees = splitByWeights(1634, bases.map((weight, allocationOrder) => ({ personId: String(allocationOrder), allocationOrder, weight })))!;
    if (bases.every((base, i) => base + fees[i] === gross[i])) return bases;
    for (let i = 0; i < 29; i++) bases[i] = gross[i] - fees[i];
  }
  throw new Error("Synthetic original bases did not converge.");
}

/** Uses only public domain services; caller creates users and migrates an isolated DB first. */
export async function buildLegacyScenario(db: AppDatabase, people: string[], options: { beforeCorrections?: (identity: { trackingId: string; purchaseId: string; accountId: string; packageId: string; people: string[] }) => Promise<void> } = {}) {
  const actor = people[0], service = createServices(db, actor, initializeLegacyPurchaseCosts), costs = packageCostServices(db, actor);
  const accounts = hubbuyBalanceServices(db, actor);
  const account = await accounts.createAccount({ workspaceId: "loti", idempotencyKey: "qa-account", label: "Conta QA", confirmZeroBalance: true });
  const purchase = await service.savePurchase({ name: "Compra QA original" });
  if (!purchase) throw new Error("Purchase was not created.");
  const bases = originalBases();
  for (let i = 0; i < 30; i++) {
    const china = i < 10 ? 0 : 837 + (i < 20 ? 1 : 0);
    const participants = i === 8 || i === 9 ? people.slice(1, 4) : [people[i === 1 || i === 6 ? 0 : i < 10 ? 3 : i % 4]];
    await service.saveManualItem({ name: i < 10 ? refunds[i][0] : `Produto original QA ${i - 9}`, url: `https://shop.loti.test/original/${i}`,
      quantity: 1, unitPriceCents: bases[i] - china, sharingMode: "equal", participants: participants.map(personId => ({ personId })) });
  }
  await service.finalizePurchase(purchase.id, true);
  const tracking = await costs.startTracking(purchase.id);
  let detail = await costs.getTracking(tracking.id);
  // The legacy finalizer created this package. Do not use this builder after cutover.
  if (detail.packages.length !== 1) throw new Error("Legacy fixture requires the pre-transition finalizer.");
  const packageId = detail.packages[0].id;
  await db.update(purchasePackages).set({ name: "Pacote QA" }).where(eq(purchasePackages.id, packageId)).run();
  for (let i = 0; i < detail.items.length; i++) {
    const item = detail.items[i], n = Number(item.original.name.match(/(\d+)$/)?.[1]);
    const index = item.original.name.startsWith("Produto original QA") ? n + 9 : refunds.findIndex(row => row[0] === item.original.name);
    const china = index < 10 ? 0 : 837 + (index < 20 ? 1 : 0);
    detail = await costs.saveItemCosts(tracking.id, { expectedRevision: detail.tracking.revision, itemId: item.id,
      effectivePriceState: "known", effectivePriceUnitCents: bases[index] - china,
      chinaFreightState: china ? "known" : "no_charge", chinaFreightUnitCents: china || null });
  }
  detail = await costs.saveCharge(tracking.id, detail.productsCharge!.id, { expectedRevision: detail.tracking.revision, chargeType: "products", paymentMethod: "pix" });
  detail = await costs.markChargePaid(tracking.id, detail.productsCharge!.id, { expectedRevision: detail.tracking.revision });
  for (const [i, [name, received]] of refunds.entries()) {
    const item = detail.items.find(row => row.original.name === name)!;
    detail = await costs.requestRefund(tracking.id, { expectedRevision: detail.tracking.revision, costItemId: item.id, quantity: 1,
      requestedProductCents: received, requestedChinaCents: 0, reason: "Cancelamento sintético QA",
      packageRemovals: [{ packageId, quantity: 1 }], unassignedQuantity: 0 });
    const refund = detail.refunds.find(row => row.costItemId === item.id)!;
    const cny = i === 0 ? 2767 : i === 1 || i === 6 ? received * 2 : received;
    detail = await costs.receiveRefund(tracking.id, refund.id, { expectedRevision: detail.tracking.revision,
      receivedProductCents: received, receivedChinaCents: 0, destination: "hubbuy", accountId: account.accountId,
      receivedProductCnyMinor: cny, receivedChinaCnyMinor: 0, nativeEvidence: "Par sintético capturado, não representa câmbio de mercado", confirmed: true });
  }
  for (const [index, addition] of additions.entries()) {
    const participants = index < 4 ? people.slice(1, 4) : [people[(index - 4) % 4]];
    const chinaCny = addition.china ? Number((BigInt(addition.cny) * BigInt(addition.china) * 2n + BigInt(addition.brl)) / (2n * BigInt(addition.brl))) : 0;
    const created = await costs.createAdditionalOrder(tracking.id, { expectedRevision: detail.tracking.revision, idempotencyKey: `qa-draft-${index}`,
      accountId: account.accountId, externalReference: `QA-ORDER-${index}`, items: [{ name: addition.name, url: `https://shop.loti.test/additional/${index}`, platform: "other", visualKey: "generic", quantity: addition.quantity,
        itemOrder: 0, nativeProductState: "known", nativeProductCnyMinor: addition.cny - chinaCny,
        nativeChinaState: chinaCny ? "known" : "no_charge", nativeChinaCnyMinor: chinaCny || null,
        participants: participants.map(personId => ({ personId, weightMode: "equal", weight: 1 })) }] });
    detail = await costs.getTracking(tracking.id);
    const row = detail.productOrders.find(order => order.id === created.orderId)!.items[0];
    const funding = await planFunding(db, actor, account.accountId, row.cost.id, participants,
      [{ component: "product", cny: addition.cny - chinaCny, brl: addition.brl - addition.china }, { component: "china", cny: chinaCny, brl: addition.china }], people);
    await costs.recordAdditionalOrderMixedPayment(tracking.id, created.orderId, { expectedRevision: detail.tracking.revision,
      idempotencyKey: `qa-payment-${index}`, useOwnBalance: true, external: null, balanceFunding: funding });
    detail = await costs.getTracking(tracking.id);
    if (index < 4) {
      const allocations = [...detail.packages[0].items.map(item => ({ costItemId: item.costItemId, quantity: item.quantity })), { costItemId: row.cost.id, quantity: addition.quantity }];
      detail = await costs.saveAllocations(tracking.id, { expectedRevision: detail.tracking.revision, packageId, allocations });
    }
    if (index === 8) {
      await options.beforeCorrections?.({ trackingId: tracking.id, purchaseId: purchase.id, accountId: account.accountId, packageId, people });
      // Identical monetary replacements keep each lender's 1:2 / 1:1 lots coherent.
      let orderId = created.orderId;
      for (let correction = 0; correction < 8; correction++) {
        const current = detail.productOrders.find(order => order.id === orderId)!.items[0];
        const balance = await accounts.getAccountBalance(account.accountId);
        const corrected = await costs.correctAdditionalOrder(tracking.id, orderId, {
          expectedRevision: detail.tracking.revision, expectedAccountRevision: balance.account.revision, idempotencyKey: `qa-correction-${correction}`,
          reason: "Correção descritiva sintética, preservando os valores", confirmedIncorrectRegistration: true, itemId: current.cost.id,
          name: addition.name, url: `https://shop.loti.test/additional/${index}`, variant: `Revisão QA ${correction + 1}`, notes: null,
          quantity: addition.quantity, nativeProductCnyMinor: addition.cny - chinaCny, nativeChinaCnyMinor: chinaCny,
          composition: { mode: "equal", participants: participants.map(personId => ({ personId, weight: 1 })) }, useOwnBalance: true,
          balanceFunding: funding.map(part => ({ ...part, costItemId: current.cost.id })), external: null,
        });
        orderId = corrected.replacementOrderId;
        detail = await costs.getTracking(tracking.id);
      }
    }
  }
  // FIFO in two explicitly named holders; simulation is ledger-only.
  let balance = await accounts.getAccountBalance(account.accountId);
  await accounts.recordManualAdjustment(account.accountId, { kind: "documented_debit", expectedRevision: balance.account.revision,
    idempotencyKey: "qa-simulation", occurredAt: "2026-10-27T12:00:00Z", reason: "Simulação de frete QA — somente saldo",
    amountCnyMinor: 1800, shares: [{ personId: people[0], amountCnyMinor: 596 }, { personId: people[2], amountCnyMinor: 1204 }] });
  for (const amountCnyMinor of [229, 114]) {
    balance = await accounts.getAccountBalance(account.accountId);
    await accounts.recordManualAdjustment(account.accountId, { kind: "promotional_bonus", expectedRevision: balance.account.revision,
      idempotencyKey: `qa-bonus-${amountCnyMinor}`, occurredAt: "2026-10-27T12:00:00Z", reason: `Bônus sintético QA ${amountCnyMinor}, construção de teste`,
      amountCnyMinor, shares: [{ personId: people[3], amountCnyMinor }] });
  }
  return { scenarioId, purchaseId: purchase.id, trackingId: tracking.id, accountId: account.accountId, packageId, people };
}

async function planFunding(db: AppDatabase, actor: string, accountId: string, costItemId: string, participants: string[], components: { component: "product" | "china"; cny: number; brl: number }[], people: string[]) {
  const balance = await hubbuyBalanceServices(db, actor).getAccountBalance(accountId);
  const available = new Map(balance.rights.map(row => [row.personId, row.availableCnyMinor]));
  const funding: { costItemId: string; costComponent: "product" | "china"; beneficiaryId: string; lenderId: string; cnyMinor: number }[] = [];
  for (const component of components) {
    if (!component.cny) continue;
    let low = 2 * (component.cny - component.brl);
    const capacities = allocateExactMinor(component.cny, participants.map((id, order) => ({ id, order, weight: 1 })));
    for (const [index, beneficiaryId] of participants.entries()) {
      const lowAmount = Math.min(low, capacities[index] - capacities[index] % 2);
      if (lowAmount) { funding.push({ costItemId, costComponent: component.component, beneficiaryId, lenderId: people[0], cnyMinor: lowAmount }); low -= lowAmount; }
      let high = capacities[index] - lowAmount;
      for (const lenderId of people.slice(1, 3)) {
        const amount = Math.min(high, available.get(lenderId) ?? 0);
        if (amount) { funding.push({ costItemId, costComponent: component.component, beneficiaryId, lenderId, cnyMinor: amount }); available.set(lenderId, available.get(lenderId)! - amount); high -= amount; }
      }
      if (high) throw new Error("Synthetic high-basis funding exhausted.");
    }
    if (low) throw new Error("Synthetic low-basis funding did not fit the participant capacities.");
  }
  return funding.filter(part => part.lenderId !== part.beneficiaryId);
}
