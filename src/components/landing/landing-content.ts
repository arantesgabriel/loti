// Editorial candidate for local review. Public tools and independent signup
// remain release dependencies; this module never imports application data.
export const landingContent = {
  hero: {
    title: "Suas importações, tudo em um só lugar.",
    description: "Organize seus favoritos, acompanhe suas compras e tenha mais clareza sobre os custos dos seus produtos. Tudo isso em uma experiência simples, para você ou seu grupo.",
    action: "Acessar Loti",
    href: "/login",
  },
  transformation: {
    title: "Seus favoritos merecem um lugar melhor.",
    description: "Chega de procurar produtos em links espalhados. Reúna o que você quer importar em um espaço organizado, pronto para acompanhar suas próximas compras.",
  },
  journey: [
    { label: "Favoritos", title: "Salve o que interessa. Encontre quando precisar.", description: "Deixe seus produtos favoritos organizados em uma visualização clara, para comparar opções e decidir o que vai entrar na sua próxima compra." },
    { label: "Compras", title: "Da sua seleção à compra atual.", description: "Dê continuidade à organização dos seus produtos e acompanhe os itens que fazem parte de cada compra, sem perder o contexto pelo caminho." },
    { label: "Pacotes e custos", title: "Entenda os custos de cada produto.", description: "Visualize seus produtos, pacotes e valores com mais clareza para saber como os custos da importação estão distribuídos." },
  ],
  contexts: {
    title: "Do seu jeito. Com o seu grupo.",
    description: "Seja uma compra só sua ou uma importação compartilhada, o Loti ajuda você a manter os produtos e as informações organizados.",
    individual: { title: "Importando sozinho?", description: "Reúna os produtos que você quer comprar e acompanhe suas próprias importações em um só lugar." },
    group: { title: "Comprando com outras pessoas?", description: "Organize produtos por participante e acompanhe os custos compartilhados com mais clareza." },
  },
  tools: {
    title: "Ferramentas gratuitas para planejar melhor.",
    description: "Explore recursos úteis para suas decisões de importação, sem precisar criar uma conta.",
  },
  faq: [
    { question: "Como acesso o Loti?", answer: "Se você já tem uma conta, use Entrar. Novos participantes recebem um convite de alguém do grupo. O cadastro público ainda não está disponível." },
    { question: "O que posso organizar no Loti?", answer: "Você pode organizar favoritos, acompanhar compras e consultar informações de produtos, pacotes e custos em uma mesma plataforma." },
    { question: "Posso organizar produtos meus e compras em grupo?", answer: "Sim. Você pode manter seus próprios favoritos e participar de compras compartilhadas, com produtos por participante e divisão de custos. Atualmente, o acesso ao gerenciador é por convite a um grupo." },
    { question: "O Loti faz as compras por mim?", answer: "As compras são feitas por você nos sites de origem. O Loti ajuda a organizar os produtos, acompanhar os itens da compra e registrar seus custos." },
    { question: "Como os custos são registrados?", answer: "Fretes e taxas são informados manualmente em Pacotes e custos, após a finalização da compra. O Loti organiza a distribuição desses valores entre os produtos; não consulta cotações nem acompanha entregas automaticamente." },
    { question: "Preciso de uma conta para acessar as ferramentas?", answer: "As páginas das ferramentas podem ser acessadas sem conta. As cinco ferramentas ainda estão em construção. Para acessar o gerenciador de favoritos e compras, entre com sua conta do Loti." },
  ],
  closing: {
    title: "Mais organização para sua próxima importação.",
    description: "Seus favoritos, compras e custos merecem estar no mesmo lugar. Comece a organizar tudo com o Loti.",
  },
} as const;
