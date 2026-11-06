import type { GuidanceProfile } from "./contracts";
export function guidanceCopy(profile: GuidanceProfile, context: { kind: "favorites" | "purchase"; shared: boolean; populated: boolean }) {
  if (context.kind === "purchase") return {
    title: profile.experience === "expert" ? "Continue pela Compra atual" : "Adicione seu primeiro item real",
    description: profile.experience === "never" ? "Reúna um produto que você pretende comprar. Você pode usar um favorito ou preencher os dados manualmente. Criar a compra não adiciona itens." : "Use um favorito ou preencha os dados de um produto. Criar a compra não adiciona itens.",
  };
  const title = context.shared && context.populated ? "Salve uma descoberta sua" : profile.experience === "expert" ? "Seu próximo achado" : "Comece salvando um favorito";
  const description = context.shared ? "Os favoritos do grupo já estão disponíveis. Você pode salvar suas próprias descobertas ou seguir pela Compra atual."
    : profile.usageIntent === "group" ? "Guarde suas descobertas aqui. Para importar com um grupo, entre pelo convite recebido."
    : profile.usageIntent === "both" ? "Guarde suas descobertas para compras individuais ou em grupo. Você também pode começar pela Compra atual."
    : profile.experience === "never" ? "Salve o link de um produto que encontrou. Os detalhes podem ficar para depois."
    : "Guarde uma descoberta sua. Você também pode começar pela Compra atual.";
  return { title, description };
}
