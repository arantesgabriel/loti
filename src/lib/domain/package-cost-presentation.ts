import type { CostTrackingView } from "./package-cost-reading";

export type CostSectionKey = "products" | "payments" | "packages" | "people";
export type CostNextAction = { label: string; section: CostSectionKey; target: string; packageId?: string };

function countedUnits(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function packageLabel(name: string) {
  return name.toLocaleLowerCase("pt-BR").startsWith("pacote") ? name : `Pacote ${name}`;
}

function missingValueLabel(count: number, singular: string, plural: string) {
  return `Falta informar ${count} ${count === 1 ? singular : plural}`;
}

function nextAction(detail: CostTrackingView): CostNextAction | null {
  if (detail.tracking.status === "closed") return null;

  const operationalIds = new Set(detail.financialDisplay.items.filter(item => item.remainingQuantity > 0).map(item => item.costItemId));
  for (const item of detail.items.filter(item => operationalIds.has(item.id))) {
    if (item.effectivePriceState === "pending") return { label: `Informar preço efetivo de ${item.original.name}`, section: "products", target: `item-cost-${item.id}` };
    if (item.chinaFreightState === "pending") return { label: `Informar frete China de ${item.original.name}`, section: "products", target: `item-cost-${item.id}` };
    if (item.calculation?.pendingComponents.includes("divisão por pessoa pendente")) return { label: `Ajustar divisão de ${item.original.name}`, section: "products", target: `item-cost-${item.id}` };
  }

  const products = detail.calculation.productsCharge;
  if (products.baseCents !== null && products.baseCents > 0 && (products.paymentMethod === null || products.feeBps === null)) {
    return { label: "Conferir pagamento dos produtos", section: "payments", target: "products-method" };
  }
  if (products.totalCents !== null && products.paymentStatus === "pending") {
    return { label: "Confirmar pagamento dos produtos", section: "payments", target: "products-paid" };
  }

  if (detail.workflow !== "orders-v2" && detail.calculation.summary.assignedUnits < detail.calculation.summary.shippingUnits) {
    const targetPackage = detail.packages[0];
    return targetPackage
      ? { label: "Distribuir unidades nos pacotes", section: "packages", target: `package-content-${targetPackage.id}`, packageId: targetPackage.id }
      : { label: "Criar um pacote para distribuir as unidades", section: "packages", target: "package-create" };
  }

  for (const pkg of detail.packages) {
    const name = packageLabel(pkg.name);
    const freight = pkg.brazilFreightCharge;
    if (!freight || freight.valueState === "pending") return { label: `Informar frete Brasil de ${name}`, section: "packages", target: `package-freight-${pkg.id}`, packageId: pkg.id };
    if (freight.valueState === "known" && (freight.paymentMethod === null || freight.feeBps === null) && freight.amountCents !== 0) {
      return { label: `Conferir pagamento do frete de ${name}`, section: "packages", target: `package-freight-${pkg.id}`, packageId: pkg.id };
    }
    if (freight.valueState === "known" && freight.paymentStatus === "pending") {
      return { label: `Confirmar pagamento do frete de ${name}`, section: "packages", target: `package-freight-paid-${pkg.id}`, packageId: pkg.id };
    }

    const customs = pkg.customsCharge;
    if (!customs || customs.valueState === "pending") return { label: `Informar Receita de ${name}`, section: "packages", target: `package-customs-${pkg.id}`, packageId: pkg.id };
    if (customs.valueState === "known" && customs.paymentStatus === "pending") {
      return { label: `Confirmar pagamento da Receita de ${name}`, section: "packages", target: `package-customs-paid-${pkg.id}`, packageId: pkg.id };
    }
  }

  const requested = detail.refunds.find(refund => refund.status === "requested");
  if (requested) {
    const originalName = detail.items.find(item => item.id === requested.costItemId)?.original.name;
    const additionalName = detail.productOrders.flatMap(order => order.items).find(item => item.cost.id === requested.costItemId)?.item?.name;
    return { label: `Conferir reembolso de ${originalName ?? additionalName ?? "produto"}`, section: "payments", target: `refund-group-${requested.costItemId}` };
  }

  return { label: "Encerrar custos", section: "products", target: "close-costs" };
}

export function packageCostPresentation(detail: CostTrackingView) {
  const operationalItems = detail.financialDisplay.items.filter(item => item.remainingQuantity > 0);
  const pricePending = operationalItems.filter(item => item.remaining.product.finalCents === null).length;
  const chinaPending = operationalItems.filter(item => item.remaining.china.finalCents === null).length;
  const additionalItems = (detail.productOrders ?? []).filter(order => order.kind === "additional" && order.state === "recorded").flatMap(order => order.items);
  const activeOperationalIds = new Set(operationalItems.map(item => item.costItemId));
  const productCount = operationalItems.length;
  const distinctParticipants = new Set([
    ...detail.items.filter(item => activeOperationalIds.has(item.id)).flatMap(item => item.participants.map(person => person.personId)),
    ...additionalItems.filter(item => activeOperationalIds.has(item.cost.id)).flatMap(item => item.participants.map(person => person.personId)),
  ]);
  const packageCharges = detail.packages.flatMap(pkg => [pkg.brazilFreightCharge, pkg.customsCharge]).filter(Boolean);
  const pendingPackagePayments = packageCharges.filter(charge => charge?.valueState === "known" && charge.paymentStatus === "pending").length;
  const pendingPackageValues = packageCharges.filter(charge => !charge || charge.valueState === "pending").length;
  const pendingPackageCosts = pendingPackagePayments + pendingPackageValues;
  const totalCents = detail.calculation.summary.totalCents ?? detail.calculation.summary.partialCents;
  const isPartial = detail.calculation.summary.totalCents === null;
  const packageCount = detail.packages.length;
  const assignedUnits = detail.calculation.summary.assignedUnits;
  const unitCount = operationalItems.reduce((sum, item) => sum + item.remainingQuantity, 0);
  const shippingUnits = detail.calculation.summary.shippingUnits;

  return {
    nextAction: nextAction(detail),
    totalCents,
    hasKnownAmount: detail.calculation.summary.hasKnownAmount,
    isPartial,
    productsSummary: [
      `${productCount} ${productCount === 1 ? "produto" : "produtos"}`,
      countedUnits(unitCount, "unidade no pedido", "unidades no pedido"),
      ...(detail.financialDisplay.refundGroups.length ? ["Unidades canceladas em Reembolsos"] : []),
      ...(detail.refundsSummary.requestedCount ? [`${detail.refundsSummary.requestedCount} ${detail.refundsSummary.requestedCount === 1 ? "reembolso solicitado" : "reembolsos solicitados"}`] : []),
      ...(pricePending ? [missingValueLabel(pricePending, "preço efetivo", "preços efetivos")] : []),
      ...(chinaPending ? [missingValueLabel(chinaPending, "frete China", "fretes China")] : []),
    ].join(" · "),
    packagesSummary: [
      `${packageCount} ${packageCount === 1 ? "pacote" : "pacotes"}`,
      `${assignedUnits}/${shippingUnits} unidades distribuídas`,
      ...(pendingPackageCosts ? [`${pendingPackageCosts} ${pendingPackageCosts === 1 ? "custo pendente" : "custos pendentes"}`] : []),
    ].join(" · "),
    peopleSummary: [
      `${distinctParticipants.size} ${distinctParticipants.size === 1 ? "participante" : "participantes"}`,
      isPartial ? "Valores parciais" : "Valores finais",
      ...(detail.calculation.summary.undistributedCents > 0 ? ["Há valores sem divisão definida"] : []),
    ].join(" · "),
  };
}
