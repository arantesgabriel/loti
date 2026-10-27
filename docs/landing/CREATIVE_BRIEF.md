# LOTI — FASE 7 | BRIEFING CRIATIVO MESTRE

**Versão de trabalho:** 0.1 — atualizada com a aprovação dos Anexos C e D  
**Data da revisão:** 23/10/2026  
**Situação:** Fase 7 iniciada por autorização explícita do responsável; briefing em elaboração, não aprovado.  
**Escopo:** consolidação estratégica, narrativa, visual e motion para futura implementação; sem desenvolvimento, publicação nem alterações no Loti.

## 1. Governança e rastreabilidade

| Fase | Estado de referência |
| --- | --- |
| 1 — Descoberta e benchmarking | Encerrada conforme histórico de aprovação |
| 2 — Estratégia e posicionamento | Encerrada conforme histórico de aprovação |
| 3 — Direção criativa | Encerrada conforme histórico de aprovação |
| 4 — Narrativa e arquitetura de conteúdo | Aprovada e encerrada formalmente |
| 5 — Motion e linguagem 2D | Aprovada e encerrada formalmente |
| 6 — Exploração visual | **Aprovada e encerrada formalmente** em 22/10/2026 durante a Rodada 1 da Fase 7 |
| 7 — Consolidação | **Iniciada explicitamente** pelo usuário; documentação em andamento |

**Nota de controle:** o início da Fase 7 foi autorizado primeiro; na Rodada 1, o responsável ratificou explicitamente o aceite e o encerramento da Fase 6. Os dois atos estão registrados separadamente.

## 2. Síntese executiva

O Loti será apresentado como um **ecossistema de organização para quem importa**, com seu **gerenciador** como produto principal. O benefício central é reunir favoritos, compras e custos em uma experiência mais clara, para uso individual ou em grupo. Ferramentas gratuitas constituem uma via complementar de descoberta; a diretriz de acesso é pública e sem cadastro **quando efetivamente disponíveis**.

**Conceito criativo:** “Da bagunça à clareza”.  
**Promessa estratégica:** “Suas importações, tudo em um só lugar.”  
**Ação principal:** “Criar conta grátis”.  
**Ação secundária discreta:** “Explorar ferramentas gratuitas”, condicionada à disponibilidade.

**Públicos de aquisição:** iniciantes absolutos e pessoas que já importam; nenhum ICP prioritário está comprovado. **Cenários de uso:** individual e compartilhado, com peso equivalente. Não posicionar o Loti como curso, operador de importação ou sistema que automaticamente executa compras.

## 3. Princípios criativos congelados como direção

1. **Clareza editorial:** composição limpa desde o início, com hierarquia forte, conteúdo curto e bom respiro visual.
2. **Interface autêntica como prova:** mostrar telas reais da aplicação e somente recursos efetivamente existentes.
3. **Motion como explicação:** uma transformação principal de links/produtos dispersos encaixando-se na interface visível, controlada pelo scroll nos dois sentidos.
4. **2D funcional:** cartões, etiquetas, linhas e formas refinadas identificam conexões; não servem apenas de ornamento.
5. **3D pontual:** pequenas caixas, produtos e etiquetas, acabamento soft 3D fosco, família visual consistente, entradas suaves.
6. **Mobile autoral:** capturas reais do mobile e narrativa simplificada, nunca desktop reduzido em tamanho ilegível.
7. **Verdade e privacidade:** dados fictícios obtidos em uma conta demonstrativa, sem expor pedidos ou nomes reais do grupo.

## 4. Design system — fonte de verdade

Usar o `06_DESIGN.md` e os tokens existentes no produto. **Fonte:** Geist. **Valores de referência:** `#1C0113` marca escura; `#F77014` primária; `#E33C08` hover/pressed; `#221D21` texto principal; `#433D3D` texto secundário; `#B7AEA5` neutro; `#A30006` perigo semântico. Fundos claros seguem os neutros quentes oficiais. O laranja deve funcionar como indicação de interação, não como preenchimento decorativo indiscriminado.

Explorações anteriores com azul/roxo ou tipografia não pertencente ao sistema do Loti ficam descartadas como base de entrega. Qualquer token ausente deste documento deve ser conferido no design system original, não inventado.

## 5. Blueprint de comunicação e layout

| Momento | Objetivo | Tratamento visual | Motion / ressalvas |
| --- | --- | --- | --- |
| 01. Hero | Comunicar promessa e oferecer cadastro | Composição central; mockup frontal quase na largura máxima; **Favoritos em grade** real; borda fina e sombra leve | Poucos elementos 3D discretos. Cabeçalho e CTA legíveis antes do scroll. |
| 02. Transformação | Provar visualmente a organização | Links/etiquetas dispersos se encaixam na UI já visível | Uma única coreografia curta, scroll bidirecional, alternativa estática para reduced motion. |
| 03. Jornada | Mostrar continuidade Favoritos → Compras → Pacotes e custos | Alternância de texto compacto e telas dominantes | **Só Compras** usa faixa contrastante `#1C0113` com interface clara; demais blocos predominantemente claros; realce suave de áreas relevantes. |
| 04. Contextos | Gerar identificação individual e em grupo | Dois cartões simétricos no desktop, empilhados com importância igual no mobile | Entradas suaves e sem efeitos concorrentes. |
| 05. Ferramentas gratuitas | Apresentar utilidade secundária | Faixa editorial clara com acesso visível, subordinada ao gerenciador | Links e promessas condicionados à existência real de ferramentas públicas. |
| 06. FAQ | Resolver dúvidas principais | Curto, direto, sobre cadastro, funcionamento, grupos e ferramentas | Sem depender de motion. |
| 07. Conversão final | Recuperar benefício e incentivar cadastro | CTA “Criar conta grátis”, sem novos assuntos | Não divulgar plano ou preço inexistente. |

## 6. Responsividade, acessibilidade e desempenho

- Em desktop, preservar leitura dos cartões da grade sem miniaturizar conteúdo ou empurrar CTA para fora da primeira dobra habitual.
- Em mobile, usar uma captura da **grade real de Favoritos na versão mobile**, com recorte compatível com a composição; não reduzir o mockup desktop.
- A transformação continua compreensível sem animação; respeitar `prefers-reduced-motion`, foco visível e contraste de texto/CTA.
- Evitar scroll-jacking, loops contínuos, excesso de parallax e ornamentos que gerem distração ou custo de carregamento desnecessário.
- Formato final dos assets e técnicas de animação são assuntos de viabilidade para o trabalho posterior; nenhuma tecnologia é prescrita ou implementada aqui.

## 7. Inventário de provas e assets

| Asset / fonte | Estado | Observação |
| --- | --- | --- |
| Design system `06_DESIGN.md` | Referência autoritativa conhecida | Conferir tokens completos antes da produção. |
| Explorações de wireframe e imagens das rodadas | Material conceitual | Não tratar mockups gerados como telas reais. |
| Captura desktop Favoritos em grade | Referência explorada | **Substituir por conta demonstrativa fictícia** antes de uso público. |
| Captura mobile Favoritos em grade | Referência explorada | **Substituir por conta demonstrativa fictícia** antes de uso público. |
| Capturas de Compras e Pacotes e custos | Dependente de produção demo | Capturar estados reais e relevantes da aplicação. |
| Família soft 3D / etiquetas 2D | Linguagem definida, assets finais pendentes | Não confundir direção de arte com modelagem final. |
| Copy Deck completo, por seção (Anexo C) | **Aprovado como referência editorial** | Conferir verdade funcional, planos, ferramentas e destinos dos links antes de publicar. |
| Storyboard desktop/mobile e movimento reduzido (Anexo D) | **Aprovado como direção criativa de motion** | Não equivale a protótipo funcional, animação pronta ou decisão de tecnologia. |

## 8. Hipóteses, riscos e itens não aprovados como fatos

**Hipóteses a validar:** clareza instantânea do hero em grade; efetividade da promessa unificada para públicos com experiência diferente; percepção de continuidade da jornada; equilíbrio de identificação individual/grupo; descoberta da faixa de ferramentas; qualidade de experiência no mobile; contribuição de motion à compreensão.

**Riscos a monitorar:** legibilidade em telas pequenas, excesso de peso de mídia, contraste mal aplicado, capturas contendo informações pessoais, divulgação prematura de ferramentas/planos, interpretação de que o Loti ensina ou realiza importações, e CTA que não funcione no lançamento.

**Descartes ou alternativas não selecionadas:** hero de lista como padrão principal; excesso de objetos 3D; uso generalizado de seções escuras; interface escura na seção Compras; estética alheia à paleta/tipografia original; credibilidade artificial por depoimentos, números ou recursos inventados.

## 9. Resultado de negócio e validação futura

Objetivo principal: cadastro concluído. Indicador de qualidade: ativação no gerenciador (a ser definida formalmente). Indicadores secundários: uso real de ferramentas gratuitas e trajetória ferramenta → cadastro; aprender diferenças entre iniciantes e importadores recorrentes. **Não há metas numéricas aprovadas** nem autorização para instalar rastreamento nesta fase.

## 10. Decisões formais — Fase 7, Rodadas 1 e 2 e aceite subsequente

| ID | Decisão | Implicação de documentação |
| --- | --- | --- |
| D-7.01 | **Briefing mestre com anexos** | O mestre registra visão e regras de precedência; anexos contêm detalhes rastreáveis, sem versões conflitantes. |
| D-7.02 | **Direção criativa com especificações e critérios de aceite** | O handoff será verificável por uma futura equipe de design/desenvolvimento, sem prescrever implementação nem alterar o produto. |
| D-7.03 | **Aprovação e encerramento formal da Fase 6** | Marco registrado em 22/10/2026; documento da Fase 6 passa a ter estado aprovado. |
| D-7.04 | **Copy Deck com redação completa por seção, ainda revisável** | Anexo C apresenta títulos, descrições, CTAs e FAQ como propostas de texto; nenhuma copy publicável é presumida aprovada ou factual sem checagem. |
| D-7.05 | **Storyboard de motion por estados com desktop/mobile** | Anexo D descreve S0–S3, scroll reversível, variações responsivas e movimento reduzido; sem código, execução ou parâmetros técnicos arbitrários. |
| D-7.06 | **Aprovação explícita dos Anexos C e D** | O responsável declarou ambos revisados e aprovados em 22/10/2026. Aprovação documental/editorial e criativa, sem aceite de disponibilidade funcional, publicação, implementação ou encerramento da Fase 7. |

**Avaliação crítica:** a redação integral expõe lacunas antes invisíveis em títulos isolados, especialmente disponibilidade do cadastro gratuito, ferramentas públicas e condições comerciais; nenhum desses pontos deve ser preenchido com promessas inventadas. O storyboard organizado por estados dá clareza à intenção sem transformar direção criativa em especificação de engenharia. Não fixar breakpoints, durações, métricas de velocidade, bibliotecas ou comportamentos não validados.

### Estrutura documental de trabalho

- **Briefing mestre (este arquivo):** posicionamento, conceito, narrativa, direção visual, princípios e controle de versões.
- **Anexo A — Registro de decisões e rastreabilidade:** decisões, alternativas descartadas, justificativas, hipóteses e fontes.
- **Anexo B — Especificações e critérios de aceite:** checklist verificável por seção, mobile, motion, acessibilidade, privacidade e veracidade.
- **Anexo C — Copy Deck (v0.1, aprovado editorialmente):** redação integral por seção, alternativas não selecionadas, condições de publicação, FAQ e SEO opcional.
- **Anexo D — Storyboard de motion (v0.1, aprovado criativamente):** estados da transformação, retorno no scroll, tratamento das seções, desktop, mobile e movimento reduzido.
- **Anexos posteriores, se necessários:** inventário detalhado de assets e capturas reais. Eles serão preparados dentro da Fase 7, não como nova fase.

### Pendências de definição e validação

1. **Concluído:** revisão e aprovação editorial do Anexo C e criativa do Anexo D.
2. Conferir ferramentas, planos e fluxos realmente publicáveis antes de aprovar material como pronto para produção.
3. Definir evidências mínimas de revisão para capturas de conta demonstrativa, breakpoints reais e acessibilidade.
4. Reunir inventário definitivo dos assets/capturas e verificar a consistência do conjunto documental antes de solicitar encerramento da Fase 7.

## 11. Critério de encerramento da Fase 7

Apresentar versão final revisável do briefing, matriz decisões/hipóteses/descartes, arquitetura seção a seção, guia visual/motion responsivo, inventário de materiais e dependências, riscos e checklist de aceite. **A fase só termina com aprovação explícita do usuário.** Aprovar o briefing não autoriza, por si só, desenvolvimento, mudanças no gerenciador, configuração técnica ou publicação da landing.
