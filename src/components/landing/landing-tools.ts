export const landingTools = [
  { slug: "simulador-de-custo-final", title: "Simulador de Custo Final", description: "Reúna produtos, fretes e taxas para estimar o custo da sua importação.", icon: "calculator" },
  { slug: "calculadora-de-impostos", title: "Calculadora de Impostos", description: "Entenda os impostos que entram no planejamento da sua importação.", icon: "receipt" },
  { slug: "conversor-de-moedas", title: "Conversor de Moedas", description: "Compare valores em moedas diferentes antes de decidir sua compra.", icon: "currencies" },
  { slug: "calculadora-de-rateio", title: "Calculadora de Rateio", description: "Planeje a divisão dos custos de uma compra entre os participantes.", icon: "people" },
  { slug: "tabela-de-referencias", title: "Tabela de Referências", description: "Consulte referências para apoiar o planejamento da sua importação.", icon: "table" },
] as const;

export type LandingTool = (typeof landingTools)[number];
export const toolHref = (tool: LandingTool) => `/ferramentas/${tool.slug}`;
