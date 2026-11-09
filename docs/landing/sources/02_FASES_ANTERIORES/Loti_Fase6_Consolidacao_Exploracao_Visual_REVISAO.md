# Loti — Consolidação formal da Fase 6
## Exploração Visual | Consolidação aprovada

**Data:** 22/10/2026  
**Status:** APROVADA E ENCERRADA FORMALMENTE pelo responsável em 22/10/2026, na confirmação da Rodada 1 da Fase 7.  
**Próxima fase:** Fase 7 — iniciada por autorização expressa do responsável.

## 1. Objetivo da fase

Traduzir a direção criativa aprovada e a narrativa da landing page do Loti em uma proposta visual coerente para desktop e mobile, definindo hierarquia, composição, comportamento visual e tratamento de capturas reais, sem iniciar implementação.

O conceito é **“Da bagunça à clareza”**: mostrar que favoritos e links dispersos podem ser organizados, e que essa organização prossegue para compras, pacotes e custos. A experiência deve ser limpa desde a primeira dobra, com contraste expressivo e movimentos pontuais.

## 2. Decisões ratificadas nesta validação final

| ID | Decisão formal | Análise crítica e condição de execução visual |
| --- | --- | --- |
| D-6.16 | **Hero:** captura real de Favoritos em **grade**. | A grade evidencia a organização visual e conversa diretamente com a metáfora de encaixe. A janela deve ser larga o suficiente para os cartões continuarem identificáveis; não sacrificar legibilidade para exibir muitos cartões. |
| D-6.17 | **Capturas:** usar **conta demonstrativa com dados fictícios**. | É a opção correta para permitir telas autênticas sem divulgar nomes, contas, saldos ou dados de amigos reais. Os dados são fictícios, mas a interface e as interações mostradas devem ser reais. |
| D-6.18 | **Compras:** interface **clara**, sobre fundo `#1C0113`. | Cria contraste forte sem mudar o tema da interface dentro da captura. Exige espaçamento generoso, contorno discreto e composição que não pareça uma janela branca simplesmente colada no fundo escuro. |
| D-6.19 | **Públicos:** duas situações práticas em **cartões simétricos** (individual e grupo). | A simetria evita sugerir que um público é secundário; títulos, quantidade de conteúdo e peso visual devem ser equivalentes. No mobile, os cartões ficam empilhados. |
| D-6.20 | **Ferramentas gratuitas:** **faixa editorial clara**. | Mantém o gerenciador como produto principal. A faixa precisa ser perceptível e oferecer acesso compreensível sem virar uma vitrine concorrente do hero; somente ferramentas realmente disponíveis podem ser chamadas de utilizáveis. |

## 3. Decisões anteriores incorporadas — D-6.01 a D-6.15

- **Direção A — Clareza editorial:** composição arejada, hierarquia tipográfica evidente, fundo majoritariamente claro e contraste com intenção narrativa.
- **Hero centralizado:** headline, apoio e CTA centralizados; captura frontal real de Favoritos, quase na largura máxima do container; mínima perspectiva, borda sutil e sombra leve.
- **Jornada visual:** Favoritos → Compras → Pacotes e custos, com telas reais dominantes e textos curtos alternando de posição.
- **Primeira e única faixa escura na jornada:** seção de **Compras**, após a demonstração de organização de Favoritos. A seção de Custos retorna ao claro.
- **Mobile:** demonstração feita com captura autêntica da interface mobile, nunca com versão desktop apenas reduzida.
- **Soft 3D:** objetos pequenos, foscos, refinados e pontuais, inspirados em caixas, produtos e etiquetas; não competir com as telas reais.
- **Tipografia e identidade:** preservar rigorosamente o `06_DESIGN.md`, sem substituição de fonte ou introdução de paleta independente.

## 4. Sistema visual de referência

**Fonte principal:** Geist, com fallback sans-serif de sistema.

| Papel | Valor de referência | Regra |
| --- | --- | --- |
| Escuro da marca | `#1C0113` | Fundo da seção Compras e ênfases institucionais pontuais. |
| Primária / CTA | `#F77014` | Ações prioritárias e elementos interativos com propósito. |
| Hover / pressed | `#E33C08` | Estado de interação, não nova cor de decoração. |
| Texto principal | `#221D21` | Títulos e conteúdo no tema claro. |
| Texto secundário | `#433D3D` | Explicações curtas e suporte. |
| Neutro auxiliar | `#B7AEA5` | Linhas, divisores ou etiquetas discretas quando pertinente. |
| Perigo | `#A30006` | Apenas estados semânticos de perigo; não usar na estética promocional. |

Os fundos claros devem continuar seguindo os neutros quentes e tokens do Loti. A distribuição aproximada de 80% de neutros, 15% de marca/primária e 5% de cores semânticas é uma orientação de parcimônia, não meta de medição literal. A cor laranja sinaliza interação. Não introduzir azul/roxo ou tipografia serifada como nova identidade.

## 5. Arquitetura visual consolidada

### 01. Hero — Clareza imediata

- Composição central, headline proposta **“Suas importações, tudo em um só lugar.”**
- Texto auxiliar breve e concreto; CTA principal **“Criar conta grátis”**.
- Chamada secundária discreta **“Explorar ferramentas gratuitas”**.
- Abaixo, janela ampla, frontal, com captura **real de Favoritos em grade**, produzida por uma conta demonstrativa.
- Borda fina, sombra suave; no máximo detalhes 2D/3D pontuais que não atrapalhem títulos e produtos.

### 02. Transformação — Links dispersos → Favoritos organizados

- Interface do Loti visível desde o início, recebendo itens de fora para dentro.
- Curta coreografia vinculada ao scroll em ambos os sentidos, com encaixes suaves e precisos.
- Um único momento marcante: não criar outras animações intensas competindo com ele.
- Conteúdo compreensível mesmo sem movimento ou quando a preferência por reduzir animações está ativa.

### 03. Jornada do gerenciador — Favoritos → Compras → Custos

- **Favoritos:** fundo claro; telas reais com destaque para coleções e organização. Texto compacto.
- **Compras:** primeira faixa contrastante, fundo `#1C0113`, janela do Loti em interface clara, conteúdo funcional demonstrado por recorte real.
- **Pacotes e custos:** volta ao fundo claro, com visão da interface real e realces suaves de informações relevantes; não apresentar cálculos ou recursos futuros como já existentes.
- Entre seções, alternância de posição do texto e das telas; a interface mantém dominância visual.

### 04. Contextos de uso — Individual e em grupo

- Dois cartões de igual largura, densidade e hierarquia no desktop.
- Exemplo individual: favoritos, compra e acompanhamento de seus próprios produtos.
- Exemplo em grupo: visualizar participantes, dividir organização da compra e acompanhar custos por pessoa, desde que fiel às funcionalidades demonstradas.
- Empilhar no mobile sem reduzir um dos públicos a nota de rodapé.

### 05. Ferramentas gratuitas

- Faixa editorial clara com título breve, texto orientado a benefício e acesso visível.
- **Diretriz aprovada de acesso:** ferramentas gratuitas públicas, sem exigir cadastro, **quando estiverem efetivamente disponíveis**. Este é um requisito de comunicação e produto planejado, não uma alegação de que já estão publicadas.
- Navegação da landing mantém descoberta das ferramentas, sem disputar o protagonismo do gerenciador.
- Não prometer catálogo, ferramentas, acesso livre ou preço até conferir sua disponibilidade efetiva no momento da publicação.

### 06. FAQ

- Seção curta sobre cadastro, funcionamento, grupos e ferramentas; linguagem direta e honesta.
- Respostas não presumem funcionalidades planejadas como se estivessem implantadas.

### 07. Encerramento e CTA

- Retomar a proposta principal com poucas palavras e CTA **“Criar conta grátis”**.
- Não apresentar preço ou plano Pro não disponível como oferta ativa.

## 6. Regras para capturas e demonstrações

1. Criar e usar uma **conta de demonstração** com pessoas, grupos, favoritos, pedidos e números fictícios, mas coerentes.
2. Produzir as imagens **da aplicação real** nas visualizações e breakpoints adequados: desktop grade para hero e mobile real para a versão mobile.
3. Não recriar a interface com elementos inventados, funcionalidades inexistentes, fotografias que não constem na experiência real ou dados financeiros sem contexto.
4. Não reproduzir informações identificáveis dos prints exploratórios enviados pelo usuário. As capturas preexistentes servem apenas de referência interna.
5. Remover barras do navegador e elementos de captura que confundam o mockup, sem alterar o conteúdo de produto de modo enganoso.
6. Fazer conferência final de nomenclatura, dados, permissões e privacidade antes de eventual publicação.

## 7. Diretrizes de motion e acessibilidade

- Transformação principal vinculada ao scroll, reversível, breve e sem bloquear rolagem natural.
- Demais motions restritos a revelações suaves, realces funcionais e microinterações de cor/profundidade/posição.
- Etiquetas e linhas 2D têm função explicativa, não meramente decorativa; objetos 3D entram suavemente e são pequenos.
- Mobile preserva narrativa com menos elementos, movimentos simplificados e capturas adequadas à largura da tela.
- Preferência `prefers-reduced-motion`: versão estática equivalente com a mensagem preservada.
- As informações essenciais e CTAs são legíveis sem animações, com contraste e foco visível; não usar movimento como única forma de transmitir uma informação.
- Validar desempenho e carregamento de mídia antes de escolher formato/técnica de animação; isso não autoriza implementação nesta fase.

## 8. Hipóteses de design a validar — não são decisões confirmadas nem métricas

| ID | Hipótese | Como verificar futuramente |
| --- | --- | --- |
| H-6.01 | A grade no hero comunica organização mais rapidamente que a lista. | Teste de compreensão de 5 segundos com usuários. |
| H-6.02 | A captura quase full-width permanece legível sem empurrar excessivamente o CTA. | Inspeção em desktop comum, notebooks e mobile. |
| H-6.03 | Fundo escuro apenas em Compras cria ritmo e melhora a passagem da narrativa. | Avaliação de contraste, foco e continuidade entre seções. |
| H-6.04 | Cartões simétricos fazem visitantes individuais e grupos perceberem relevância equivalente. | Teste de identificação de público, sem instruções prévias. |
| H-6.05 | Faixa editorial clara torna as ferramentas encontráveis sem reduzir a prioridade do gerenciador. | Teste de localização do link e da ação principal. |
| H-6.06 | Conta demonstrativa fictícia melhora privacidade e consistência entre desktop e mobile. | Auditoria dos assets e de cada valor exibido. |

## 9. Pendências e dependências para eventual execução

- Confirmar o conteúdo efetivamente disponibilizado no gerenciador, nos planos e nas ferramentas públicas no momento da publicação.
- Preparar conta demonstrativa sem dados pessoais reais e capturas em tema claro da grade de Favoritos e de Compras/Custos.
- Revisar desktop/mobile lado a lado, legibilidade da grade, balanço da faixa escura e contraste da tipografia.
- Usar os tokens completos e componentes existentes do Loti como referência autoritativa; valores não listados aqui não devem ser inventados.
- Refinar texto final e acessibilidade antes da construção, preservando a narrativa aprovada na Fase 4.

## 10. Critérios de aceite da Fase 6

- [ ] Identidade Geist e paleta original respeitadas.
- [ ] Hero central com Favoritos em grade real, amplo e legível.
- [ ] Capturas e exemplos preparados com dados fictícios em produto real.
- [ ] Seção Compras é a faixa contrastante em `#1C0113`, com interface clara.
- [ ] Jornada Favoritos → Compras → Custos coesa e com texto compacto.
- [ ] Individual e grupo têm importância visual equivalente.
- [ ] Ferramentas aparecem em faixa editorial clara subordinada ao gerenciador.
- [ ] Composição mobile concebida com captura mobile real.
- [ ] Diretrizes de motion, redução de movimento e privacidade preservadas.
- [x] Revisão e aprovação explícitas do responsável — 22/10/2026.

## 11. Controle de aprovação

**Resultado atual:** consolidação aprovada formalmente, sem modificar as decisões técnicas ou criativas listadas acima.  
**Fase 6:** encerrada formalmente em 22/10/2026.  
**Fase 7:** iniciada por autorização expressa; seu encerramento depende de revisão e aprovação próprias.  
**Nenhum desenvolvimento, alteração de aplicativo ou publicação autorizado por este documento.**

**Registro da decisão:** “Aprovo formalmente a consolidação e o encerramento da Fase 6”, comunicado pelo responsável na Rodada 1 da Fase 7. Esta aprovação não significa que todos os assets finais estejam prontos nem autoriza implementação.
