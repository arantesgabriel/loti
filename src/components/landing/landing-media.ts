export type LandingCapture = {
  desktop: { src: string; width: number; height: number };
  mobile: { src: string; width: number; height: number };
  alt: string;
  caption: string;
};

export const landingMedia = {
  hero: {
    desktop: { src: "/landing/favorites-cards-desktop.webp", width: 1440, height: 900 },
    mobile: { src: "/landing/favorites-cards-mobile.webp", width: 390, height: 609 },
    alt: "Favoritos do Loti em Cards: produtos com nome, variação, preço e pessoa responsável, com acesso às coleções e ações de compra. Interface real com dados fictícios.",
    caption: "Interface real do Loti, com dados de demonstração.",
  },
  favorites: {
    desktop: { src: "/landing/journey-favorites-desktop.webp", width: 880, height: 590 },
    mobile: { src: "/landing/journey-favorites-mobile.webp", width: 390, height: 610 },
    alt: "Recorte real de Favoritos com busca, seleção de Cards, nomes, preços e responsáveis fictícios. Os produtos selecionados aparecem como Na compra.",
    caption: "Favoritos organizados em Cards, com dados fictícios.",
  },
  purchase: {
    desktop: { src: "/landing/journey-purchase-desktop.webp", width: 880, height: 710 },
    mobile: { src: "/landing/journey-purchase-mobile.webp", width: 350, height: 810 },
    alt: "Compra fictícia em andamento: quatro unidades, três participantes, R$ 696,00 e duas de quatro unidades marcadas como adicionadas ao carrinho. Um item é compartilhado.",
    caption: "Uma compra em andamento, com itens pessoais e compartilhados.",
  },
  costs: {
    desktop: { src: "/landing/journey-costs-desktop.webp", width: 880, height: 815 },
    mobile: { src: "/landing/journey-costs-mobile.webp", width: 350, height: 740 },
    alt: "Outra rodada fictícia, já finalizada, com custos abertos: total de R$ 833,96 e custos por produto após o registro manual de fretes e taxas.",
    caption: "Uma rodada finalizada, com custos registrados manualmente.",
  },
  packages: {
    desktop: { src: "/landing/journey-packages-desktop.webp", width: 880, height: 198 },
    mobile: { src: "/landing/journey-packages-mobile.webp", width: 350, height: 285 },
    alt: "Pacote fictício em preparação, com três produtos associados, quatro de quatro unidades distribuídas e um custo pendente de pagamento.",
    caption: "O pacote da mesma rodada, em uma etapa logística manual.",
  },
} satisfies Record<string, LandingCapture>;
