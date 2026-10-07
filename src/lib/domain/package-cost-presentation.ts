import type { CostTrackingView } from "./package-cost-reading";

export type CostSectionKey = "products" | "packages" | "people";
export type CostNextAction = { label: string; section: CostSectionKey; target: string; packageId?: string };

function unitsLabel(count: number) {
  return `${count} ${count === 1 ? "unidade" : "unidades"}`;
}

function packageLabel(name: string) {
  return name.toLocaleLowerCase("pt-BR").startsWith("pacote") ? name : `Pacote ${name}`;
}

function nextAction(detail: CostTrackingView): CostNextAction | null {
  if (detail.tracking.status === "closed") return null;

  for (const item of detail.items) {
    if (item.effectivePriceState === "pending") return { label: `Informar preço efetivo de ${item.original.name}`, section: "products", target: `item-cost-${item.id}` };
    if (item.chinaFreightState === "pending") return { label: `Informar frete China de ${item.original.name}`, section: "products", target: `item-cost-${item.id}` };
    if (item.calculation?.pendingComponents.includes("divisão por pessoa pendente")) return { label: `Ajustar divisão de ${item.original.name}`, section: "products", target: `item-cost-${item.id}` };
  }

  const products = detail.calculation.productsCharge;
  if (products.baseCents !== null && products.baseCents > 0 && (products.paymentMethod === null || products.feeBps === null)) {
    return { label: "Conferir pagamento dos produtos", section: "products", target: "products-method" };
  }
  if (products.totalCents !== null && products.paymentStatus === "pending") {
    return { label: "Confirmar pagamento dos produtos", section: "products", target: "products-paid" };
  }

  if (detail.calculation.summary.assignedUnits < detail.calculation.summary.unitCount) {
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

  return { label: "Encerrar custos", section: "products", target: "close-costs" };
}

function pendingProductPayment(detail: CostTrackingView) {
  const charge = detail.productsCharge;
  if (!charge) return "Pagamento pendente";
  return charge.paymentStatus === "paid" ? "Produtos pagos" : "Pagamento pendente";
}

export function packageCostPresentation(detail: CostTrackingView) {
  const pricePending = detail.items.filter(item => item.effectivePriceState === "pending").length;
  const chinaPending = detail.items.filter(item => item.chinaFreightState === "pending").length;
  const distinctParticipants = new Set(detail.items.flatMap(item => item.participants.map(person => person.personId)));
  const packageCharges = detail.packages.flatMap(pkg => [pkg.brazilFreightCharge, pkg.customsCharge]).filter(Boolean);
  const pendingPackagePayments = packageCharges.filter(charge => charge?.valueState === "known" && charge.paymentStatus === "pending").length;
  const pendingPackageValues = packageCharges.filter(charge => !charge || charge.valueState === "pending").length;
  const totalCents = detail.calculation.summary.totalCents ?? detail.calculation.summary.partialCents;
  const isPartial = detail.calculation.summary.totalCents === null;
  const packageCount = detail.packages.length;
  const assignedUnits = detail.calculation.summary.assignedUnits;
  const unitCount = detail.calculation.summary.unitCount;

  return {
    nextAction: nextAction(detail),
    totalCents,
    hasKnownAmount: detail.calculation.summary.hasKnownAmount,
    isPartial,
    productsSummary: [
      `${detail.items.length} ${detail.items.length === 1 ? "produto" : "produtos"}`,
      unitsLabel(unitCount),
      ...(pricePending ? [`${pricePending} ${pricePending === 1 ? "preço efetivo por informar" : "preços efetivos por informar"}`] : []),
      ...(chinaPending ? [`${chinaPending} ${chinaPending === 1 ? "frete China por informar" : "fretes China por informar"}`] : []),
      pendingProductPayment(detail),
    ].join(" · "),
    packagesSummary: [
      `${packageCount} ${packageCount === 1 ? "pacote" : "pacotes"}`,
      `${assignedUnits}/${unitCount} unidades distribuídas`,
      ...(pendingPackageValues ? [`${pendingPackageValues} ${pendingPackageValues === 1 ? "valor por informar" : "valores por informar"}`] : []),
      ...(pendingPackagePayments ? [`${pendingPackagePayments} ${pendingPackagePayments === 1 ? "pagamento pendente" : "pagamentos pendentes"}`] : []),
    ].join(" · "),
    peopleSummary: [
      `${distinctParticipants.size} ${distinctParticipants.size === 1 ? "participante" : "participantes"}`,
      isPartial ? "Valores parciais" : "Valores finais",
      ...(detail.calculation.summary.undistributedCents > 0 ? ["Há valores sem divisão definida"] : []),
    ].join(" · "),
  };
}
