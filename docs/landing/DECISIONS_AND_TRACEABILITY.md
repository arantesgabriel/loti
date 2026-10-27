# Decisões e rastreabilidade da landing

Os IDs de fonte estão vinculados no [índice](README.md#fontes-preservadas-e-convenção-de-citação). O estado abaixo distingue aprovação de direção, condição de publicação e inferência técnica. Propostas deste documento não alteram decisões recebidas.

## Aceite documental do planejamento — 23/10/2026

O responsável respondeu “aprovo” à pergunta “Você aprova este planejamento como base para a landing?”, acompanhada da ressalva explícita de que o aceite seria documental e cada fase de implementação dependeria de autorização própria. Registra-se a aprovação da auditoria e do roadmap como base de trabalho. Nenhuma fase técnica foi autorizada por esse aceite; as perguntas dos lotes 1 e 2 continuam sem resposta específica. Não se presume encerramento da Fase criativa 7, abertura de cadastro, lançamento de ferramentas, autorização de dados demo ou publicação.

## Decisões posteriores do responsável — 23/10/2026

Este registro atualiza as pendências do lote 1 descritas no aceite inicial e nas matrizes abaixo. As fontes criativas integrais permanecem preservadas.

| ID | Decisão explícita | Consequência e limites |
| --- | --- | --- |
| LT27 | Conversão: “até criarmos o cadastro publico, leve para login”. | O destino temporário da conversão será `/login`. Não habilita cadastro público nem muda autenticação. O responsável definiu o destino, mas não escolheu explicitamente um novo rótulo para o CTA; “Criar conta grátis” continua sendo a direção editorial futura, sem cadastro aberto disponível. |
| LT28 | Ferramentas: construir a landing completa, como se todas estivessem prontas; sua disponibilidade está prevista para quando a landing estiver terminada. | Manter no escopo futuro de construção a seção, navegação, CTA secundário e FAQ de ferramentas. Não adotar versão editorial reduzida. A construção visual pode anteceder a disponibilidade das ferramentas; isso não comprova funcionamento nem autoriza links/resultados fictícios como funcionais. A integração e o aceite factual de L5, o QA final e a publicação continuam dependentes dos destinos reais. Esta decisão não autoriza implementar ferramentas nesta frente nem iniciar fases técnicas. |
| LT29 | Uso individual: o responsável pediu esclarecimento (“não entendi”). | Decisão ainda aberta: distinguir produtos pessoais dentro de um workspace compartilhado de um espaço independente para uma pessoa. Não presumir aprovação de onboarding, workspace independente ou promessa de privacidade. |

Nenhuma autorização explícita de execução de L1–L7, produção demo ou publicação foi dada nesta rodada. O próximo passo é esclarecer uso individual e confirmar as decisões de integração aplicáveis a L1 antes de solicitar sua execução.

### Confirmação posterior — uso individual

O responsável respondeu “sim” à pergunta: “A ideia para o futuro do Loti é essa segunda opção: a pessoa pode começar sozinha e convidar outras pessoas depois?”.

**LT30 — Direção de produto confirmada:** uso individual significa um espaço independente, com favoritos e compras separados de outros grupos, no qual a pessoa pode começar sozinha e convidar outras pessoas depois. Esta confirmação resolve a dúvida registrada em LT29 e a alternativa de uso individual do lote 1. Não equivale à existência desse fluxo no código nem autoriza implementar cadastro público, onboarding ou criação de workspace nesta frente. A copy de aquisição sobre essa experiência depende da entrega e validação do fluxo em uma frente própria; o destino temporário continua `/login`, conforme LT27.

Permanecem pendentes as confirmações de composição/integração (Cards mobile real em uma coluna, rota isolada `/landing`, tema claro local e ambiente demo) e a autorização explícita de L1. A escolha do rótulo temporário do CTA também permanece aberta; LT27 definiu apenas seu destino.

### Autorização e execução de L1 — 23/10/2026

**LT31 — Autorização explícita:** o responsável solicitou “inicie a implementacao de L1”, após a proposta de rota isolada `/landing`, tema claro local e preservação da entrada atual. L1 executa essas escolhas de integração, os checks locais de lint/typecheck/build e uma conferência anônima de rota/tema/rede, sem migrations ou dados persistidos. O link mínimo usa **Entrar**, texto já previsto em LT06, com o destino `/login` de LT27; não se presume escolha do rótulo final de conversão das fases editoriais.

Resultado técnico e limites estão no [relatório L1](L1_IMPLEMENTATION_REPORT.md). A interpretação de Cards mobile e o ambiente/dataset/capturas de L2 continuam por confirmar; nenhuma demonstração de produto foi produzida. L2–L7 e publicação não foram autorizadas. O encerramento formal da Fase criativa 7 não é presumido pela autorização técnica de L1.

### Autorização e execução de L2 — 23/10/2026

**LT32 — Avanço explícito:** o responsável solicitou “prossiga para l2”, autorizando a base visual, conteúdo e preparação de mídia de L2 após revisar a entrega de L1. Essa instrução não autoriza L3–L7 ou publicação.

**LT33 — Ambiente e composição mobile:** em resposta à pergunta que especificava o alvo `data/landing-l2-demo-20261023.sqlite`, migrations existentes, três pessoas fictícias, favoritos, ausência de email/R2/bancos reais e Cards mobile em uma coluna, o responsável selecionou **“Autorizar ambiente demo local e Cards em uma coluna”**. Esse alvo novo foi preparado e capturado conforme o [plano demo](L2_DEMO_PLAN.md). Não se presume autorização para qualquer outro banco, configuração externa ou recurso remoto.

O hero usa capturas reais do ambiente sintético, com desktop de três colunas e recorte mobile de uma coluna. A versão local inclui a estrutura editorial de ferramentas solicitada em LT28; não há ferramenta funcional, endpoint público ou resultado simulado. O CTA principal candidato usa “Acessar Loti” → `/login`, distinguindo o acesso temporário de cadastro aberto. O rótulo é uma escolha editorial desta implementação, sujeito à revisão do responsável, sem alterar a fonte C.

Ver [relatório L2](L2_IMPLEMENTATION_REPORT.md) e [manifesto de mídia](MEDIA_MANIFEST.md). Capturas, copy e composição estão tecnicamente revisadas e aguardam aceite humano. O próximo gate é a revisão de L2 e autorização separada de L3; a Fase criativa 7 e os demais gates não são encerrados por inferência.

### Autorização e execução de L3 — 23/10/2026

**LT34 — Avanço explícito:** o responsável solicitou “prossiga para a L3”, após a revisão de nomes das capturas de L2. A execução cobre a jornada estática, a faixa contrastante de Compras, os cartões equivalentes e as capturas reais de compra/custos no ambiente fictício local já preparado. Os nomes Mariana Silva, Lucas Oliveira e Camila Santos foram preservados.

O dataset local foi ampliado pelos serviços existentes com uma rodada finalizada e outra em andamento, sem migrations ou alterações de regras. O registro manual de custos permaneceu separado do snapshot finalizado, com comparação de integridade. A landing usa somente exports de capturas, sem importar componentes, serviços ou dados privados. Ver [relatório L3](L3_IMPLEMENTATION_REPORT.md) e [manifesto de mídia L3](MEDIA_MANIFEST_L3.md).

A implementação e a inspeção técnica estão concluídas para revisão humana. L4–L7, encerramento da Fase criativa 7, integração de ferramentas/cadastro e publicação não são autorizados por esse avanço.

## Matriz de decisões

| ID | Requisito ou decisão | Fonte exata e seção | Situação | Consequência futura | Critério de aceite |
| --- | --- | --- | --- | --- | --- |
| LT01 | Organizar importações; gerenciador como núcleo | M §2; F2 §1–4; C §5 | Aprovado como direção | Favoritos → Compras → Pacotes e custos; explicitar ações manuais quando necessário | Visitante descreve organização, sem atribuir compras/desembaraço/curso ao Loti. B ACE-01/04. |
| LT02 | Mensagem unificada para iniciantes e recorrentes | F2 §3; A H-7.01 | Direção aprovada; eficácia é hipótese | Sem ICP vencedor, métricas de adesão ou eficiência inventadas | Revisão de compreensão com ambos os perfis em etapa autorizada. |
| LT03 | “Da bagunça à clareza” | M §3; F4 §1; D §1 | Aprovado | Uma transformação principal; UI dominante desde o início | B ACE-03/10; mesma mensagem estática. |
| LT04 | H1 “Suas importações, tudo em um só lugar.” | C §3 / Seção 01; M D-7.06 | Aprovado editorialmente | Preservar texto primário; B/C alternativos não selecionados | Um H1, apoio legível e nenhuma promessa de automação. |
| LT05 | “Criar conta grátis” no header, hero e final | C §2; §3 / Seções 01/07 e FAQ 1; F2 §7 | Condicional; indisponível no código | Bloquear publicação como cadastro aberto até fluxo e condições reais; alternativa de CTA precisa novo aceite | Destino cria conta e contexto autorizado para visitante externo sem convite, se esse produto vier a ser aprovado. |
| LT06 | Entrar | C §2 | Existente localmente; direção aprovada | Link relativo `/login` | Login e retorno continuam intactos; nenhum link de convite genérico. |
| LT07 | Hero central, janela frontal ampla, Favoritos Cards | M §5; F6 D-6.16; B ACE-02 | Aprovado | Captura real; borda discreta e sombra suave, sem recadastro da UI em HTML | Cards identificáveis e CTA disponível antes de motion, desktop e notebook. |
| LT08 | Capturas de conta demo fictícia | F6 D-6.17 / §6; B ACE-14 | Aprovado como exigência; execução depende de autorização | Dataset isolado, UI autêntica, inspeção de todos os assets | Nenhum nome/conta/pedido/saldo real ou token nas imagens. |
| LT09 | Captura mobile real do modo Cards | M §6; D §2; B ACE-12 | Aprovado; interpretação a confirmar | Cards atual é uma coluna em mobile; não fabricar mosaico | Recorte real de uma coluna ou revisão explícita do requisito; nenhum redesenho do gerenciador. |
| LT10 | S0 → S1 → S2 → S3 e reversão | D §2, tabela e observações | Aprovado como storyboard; técnica pendente | Progresso deriva da posição do scroll; sem autoplay narrativo | Subir reproduz os mesmos estados, resize não salta e scroll não é capturado. |
| LT11 | Transformação é metáfora | C §3 / Seção 02; D §2 / observações 1–2 | Aprovado | Captura não muda dados; nenhum conector/scraper simulado | Teste de compreensão não atribui sincronização entre sites à cena. |
| LT12 | Jornada com texto compacto e telas dominantes alternadas | M §5; F4 D-4.08/13/14/18; B ACE-04 | Aprovado | Contar transição manual e finalização antes dos custos | Telas mostradas correspondem a estados reais; sem automatismo inventado. |
| LT13 | Primeiro fundo forte só em Compras, #1C0113, UI clara | F6 D-6.18 / §3; D §3 / 03B; B ACE-05 | Aprovado | Token local de seção estável; Costs retorna ao claro | Hero/transformação claros; única faixa escura da jornada em Compras. |
| LT14 | Individual e grupo em cartões simétricos | F6 D-6.19; C §3 / Seção 04; B ACE-06 | Direção aprovada; acesso individual independente não confirmado | Distinguir item pessoal no workspace de criar espaço próprio | Mesma hierarquia e densidade; texto não promete privacidade pessoal que o workspace não oferece. |
| LT15 | Ferramentas públicas sem cadastro em faixa clara | F6 D-6.20; C §3 / Seção 05 e FAQ 4; B ACE-07 | Condicional; ausente na implementação | Não divulgar catálogo, link, CTA ou FAQ sem destino pronto | Pelo menos um destino real funciona em sessão anônima; estado comercial validado. |
| LT16 | Ferramentas operantes no lançamento estratégico | F2 §1 / Ferramentas e §7; C §3 / Seção 05 | Dependente de decisão de cronograma | Remover seção não resolve automaticamente o lançamento estratégico | Aceite explícito para adiar landing ou lançar versão editorial reduzida; nunca “em breve” automático. |
| LT17 | FAQ curto e verdadeiro | C §3 / Seção 06; B ACE-08 | Editorial aprovado; perguntas 1/3/4 dependem de veracidade | Revisar conta grátis, autonomia individual e ferramentas | Respostas conferidas com fluxos reais; teclado/sem JS mantêm acesso. |
| LT18 | Encerramento retoma benefício sem novo assunto | C §3 / Seção 07; B ACE-09 | Aprovado, CTA condicional | Sem tabela Pro ou nova promessa | Mesmo destino validado do hero, sem oferta indisponível. |
| LT19 | Não publicar preço/Pro inexistente | C §1/2/5; F4 D-4.12 | Aprovado como restrição | Não converter plano estratégico em oferta | Ausência de preço, cobrança e benefícios não homologados. |
| LT20 | Geist, neutros quentes e tokens reais | M §4; I06 / Canonical palette e Themes; B ACE-11 | Aprovado; divergências de valores a revisar | Reutilizar `theme.css`; nenhum ajuste global para coincidir com referência antiga | Mapa de tokens aceito e contraste medido; Geist local permanece. |
| LT21 | Poucos 3D foscos e 2D explicativo | D §4; F6 §7; B ACE-10 | Aprovado como linguagem; assets finais ausentes | Avaliar SVGs locais como referência, criar mídia só após autorização | UI e CTA não encobertos; sem modelos WebGL ou loops por conveniência. |
| LT22 | Reduced motion estático, sem scroll-jacking | D §1/2/6; B ACE-03/12/13 | Aprovado | CSS e controlador JS devem respeitar preferência, inclusive alteração ao vivo | Nenhum deslocamento espacial obrigatório; teclado, toque e hash links preservados. |
| LT23 | Credibilidade autêntica | M §3/8; F4 D-4.16; C §5 | Aprovado | Sem depoimento, logo de cliente, gráfico, economia ou número inventado | Toda imagem e alegação possui evidência e revisão de privacidade. |
| LT24 | SEO opcional do Copy Deck | C §4 | Proposta opcional, não publicação autorizada | Metadados próprios na rota pública, sem retirar noindex geral | HTML/head revisados, canonical e OG corretos; rotas privadas continuam noindex. |
| LT25 | Cadastro como resultado principal; ativação por definir | M §9; F2 §5 | Direção aprovada; medição é dependente de confirmação | Não instalar analytics nesta frente por inferência | Plano de medição separado se solicitado; nenhuma meta numérica alegada. |
| LT26 | L1–L7 e release com autorização separada | P / Proibições 1–7 e critério de parada; pedido do usuário | Aprovado como limite desta tarefa | Só documentação agora, execução futura sempre explícita | Diff exclusivamente documental; nenhum deploy/migration/teste de produto. |

## Conflitos preservados para decisão

| ID | Fontes em tensão | Evidência atual e encaminhamento |
| --- | --- | --- |
| CF01 | Cadastro aberto/grátis do Copy Deck × produto privado | `createAuth()` em `src/lib/auth/config.ts` usa `disableSignUp: !operator`; convites não são aquisição pública. Recomenda-se aguardar uma frente separada de expansão. Trocar por “Entrar”/acesso por convite seria uma revisão editorial expressa, com objetivo de aquisição diferente. Não habilitar signup como parte da landing. |
| CF02 | Autonomia individual da comunicação × workspace compartilhado | `authorization.requireWorkspaceMember()` e `createServices.getData()` exigem associação; todos os favoritos do workspace são visíveis. `scripts/operator.ts` associa ao primeiro workspace. Há itens pessoais e filtro Meus, sem onboarding pessoal. Não anunciar espaço individual privado como existente. |
| CF03 | Ferramentas como condição de lançamento × código sem catálogo | `planning/expansao-2026-10-21/02_MATRIZ_E_REQUISITOS.md` declara descoberta aguardando aprovação, sem implementação. Custo final, tributos, conversor, rateio e referências são planejamento, não links publicáveis. Decidir sincronizar lançamentos ou aprovar versão reduzida. |
| CF04 | Grade mobile × Cards em uma coluna | `globals.css`, `.favorites-content.cards`, media queries ≤900 e ≤767. Usar captura real do modo Cards de uma coluna é a recomendação, sujeita a aceite da composição; não mudar colunas do produto para servir à landing. |
| CF05 | Referência #E33C08 / texto #433D3D × tokens reais | `theme.css :root`: `--primary-hover: #d93807`, `--muted: #625b60`; no escuro são diferentes novamente. Priorizar identidade semântica atual, com mapa explícito aprovado, sem sobrescrever `theme.css`. |
| CF06 | Página editorial predominantemente clara × tema por browser | Bootstrap raiz aplica `loti.theme`, inclusive a visitantes que retornam em dark. Recomenda-se boundary claro local para a landing, com tokens semânticos documentados e `color-scheme` local, sem chamar `setThemePreference()` ou regravar storage. Confirmar política antes da implementação. |
| CF07 | Login orbital canônico × carrossel realmente importado | `src/app/login/page.tsx` importa `LoginStoriesCarousel`; `tests/e2e/login.spec.ts` testa histórias e ocultação mobile. `docs/17_LOGIN_ORBITAL_MOTION.md`/AGENTS descrevem órbita. Auditoria não resolve autoridade nem restaura órbita; manter login fora do diff e não apresentar previews desenhados como screenshot real. |
| CF08 | Topologia descrita em docs × workflow atual | `docs/16_HUMAN_INPUTS.md` cita `feat/mvp` como produção; `.github/workflows/migrations.yml` opera `main`/`dev`. Configuração efetiva no serviço não foi consultada. Tratar pushes em ambas como potencial release e confirmar controle remoto antes de publicar. |
| CF09 | História de aprovações × status antigos | F2 Word ainda diz Fase 2 aberta; F4 diz Fase 5 não autorizada; M/A mantêm linhas históricas pendentes de C/D. R + M D-7.06 + A §1.2 registram o estado posterior. Conservar originais e usar o manifesto de aprovações, sem apagar histórico. |
| CF10 | Fotos de QC em descrições canônicas diferentes | AGENTS mantém gate separado para QC Phase 3; documentos 05/07/24 contêm descrições posteriores de apresentação em custos. O componente atual `ProductCostsList` usa marker e botão de galeria. Nenhum asset ou layout QC novo é necessário: demo da landing fica sem fotografia operacional e não invoca esse gate. |
| CF11 | Fonte I01 do pacote × evolução posterior do produto | O `docs/01_PRODUCT.md` local inclui saldo/pagamento misto; a cópia recebida não tem toda a evolução. Usar código e docs locais para disponibilidade; não transformar essa ampliação em promessa de simulador público ou pagamento processado. |

## Decisões pendentes em dois lotes para a revisão

As perguntas são registradas para a revisão do plano, sem suspender a documentação e sem presumir respostas.

| Lote | Decisão | Recomendação e trade-off |
| --- | --- | --- |
| 1 — Produto e lançamento | Manter “Criar conta grátis” e aguardar aquisição pública, ou revisar o CTA para acesso privado? | Manter direção aprovada e bloquear publicação de aquisição até a frente de produto estar pronta. É mais fiel ao objetivo de cadastros; implica espera. Um CTA privado permite apresentação institucional antecipada, mas requer nova copy e não entrega aquisição aberta. |
| 1 | A landing estreia com as ferramentas ou uma versão reduzida será aprovada? | Sincronizar com pelo menos uma ferramenta efetivamente pública. Omitir faixa/nav/FAQ é tecnicamente simples, mas muda a condição estratégica F2 e exige aceite explícito. Não implementar ferramentas nesta frente. |
| 1 | “Individual” significa item pessoal no grupo ou workspace independente? | Para aquisição, exigir contrato separado de workspace/onboarding independente. Até lá, restringir qualquer alegação à experiência demonstrável e revisar FAQ 3. |
| 2 — Composição e integração | Aceitar Cards mobile em uma coluna? | Sim, captura real e recorte legível; evita alterar o gerenciador. Um mosaico exigiria outra decisão de produto/visual. |
| 2 | Desenvolver isolado em `/landing` e promover para `/` só no release? | Sim; preservar o redirect atual durante construção. A URL final `/` depende de aceite explícito e teste da chegada de membros autenticados. |
| 2 | Landing sempre clara com boundary local e tokens atuais? | Sim, alinhada ao briefing e sem modificar preferências do app. Se desejar tema escuro público, fazer direção e QA próprios antes de ampliar escopo. |
| 2 | Confirmar regra de release de main/dev e ambiente demo? | Revisar configuração sem mudar infraestrutura; autorizar posteriormente apenas um ambiente demo descartável. Nenhum push agora. |

## Hipóteses que permanecem abertas

A H-7.01–09, F6 H-6.01–06 e F4 H-4.01–09 continuam hipóteses de compreensão, descoberta e conversão. Não foram realizados testes com visitantes, medições de carga, provas de melhoria comercial ou validação de ICP nesta auditoria. Durações, técnica de scroll, dimensões finais e metas de mídia serão propostas com composição real, não herdadas do login.

Não foi encontrada a skill específica `grill-me-with-docs` no catálogo disponível. Nenhuma skill de entrevistas foi inventada ou acionada por aproximação de nome. A revisão acima deriva das evidências e do pedido de planejamento.

### Autorização e execução de L4 — 23/10/2026

**LT35 — Continuidade para a fase seguinte:** o responsável solicitou “prossiga” após a entrega de L3 e a indicação de que L4 aguardava autorização. O avanço cobre somente L4: transformação S0–S3 reversível pelo scroll, três etiquetas editoriais, pequena caixa vetorial, adaptação mobile e equivalente estático. O encaixe ocorre acima da captura real, sem encobrir ou simular alteração de dados do produto.

A implementação local e as verificações estão concluídas para revisão humana; ver [relatório L4](L4_IMPLEMENTATION_REPORT.md). Sem novas dependências, migrations ou alterações de banco. L5–L7, ferramentas, cadastro público e publicação continuam com seus gates próprios.

### Autorização e decisões de L5 — 23/10/2026

**LT36 — Avanço explícito:** o responsável solicitou “prossiga para a l5”, autorizando a revisão de conversão/FAQ/metadados e integração editorial de ferramentas. A conversão principal continua temporariamente em `/login` (LT27).

**LT37 — Catálogo e destinos de construção:** o responsável determinou: “os redirecionamentos devem levar para os paths que serao os das ferramentas, e nessa pagina das ferramentas deve ter uma pagina propria e cuidada dizendo que ainda está em construcao”. Confirmou os nomes **Simulador de Custo Final, Calculadora de Impostos, Conversor de Moedas, Calculadora de Rateio e Tabela de Referências**. Isso autoriza exibir os cinco itens e criar destinos reais de construção mesmo sem calculadoras operacionais, substituindo a restrição anterior de L5. Não autoriza desenvolver cálculos, dados editoriais, APIs ou publicar. Os paths escolhidos são `/ferramentas/{simulador-de-custo-final,calculadora-de-impostos,conversor-de-moedas,calculadora-de-rateio,tabela-de-referencias}` e o catálogo `/ferramentas`.

A implementação, o domínio documental adotado para metadados, as condições do FAQ e os limites estão no [relatório L5](L5_IMPLEMENTATION_REPORT.md). Todas as páginas permanecem noindex. L6/L7, signup público, operação real das ferramentas e publicação mantêm seus gates.

### Autorização e andamento de L6 — 23/10/2026

**LT38 — Próxima etapa:** o responsável solicitou “prossiga para a próxima etapa” após a entrega de L5 e a identificação de L6 como QA integrado. Isso autoriza a revisão integrada local, suíte própria de landing sem banco, testes unitários, build e preparação do candidato. Não autoriza publicação/L7 por inferência.

Foram solicitadas duas decisões específicas: (1) provisionamento descartável para regressão autenticada, com integração em memória e novo arquivo E2E `data/e2e-refunds-landing-l6-20261023.sqlite`, email local simulado e R2 desativado; (2) orçamento de laboratório após o baseline: LCP ≤ 2,5 s, CLS ≤ 0,1 e transferência inicial ≤ 350 KB mobile / 450 KB desktop. Respostas continuam pendentes; nenhum provisionamento ou aceite de orçamento é presumido.

Ver [L6_QA_REPORT.md](L6_QA_REPORT.md) e [roteiro de release/rollback](L6_RELEASE_AND_ROLLBACK.md). O candidato local tem fingerprint e inventário de bytes; ainda não foi congelado em commit de release.

### Decisões complementares de L6 — 23/10/2026

**LT39 — Regressão descartável autorizada:** em resposta à descrição explícita de migrations/fixtures, o responsável selecionou “Autorizar os testes locais descartáveis”. A autorização cobre integração em memória e E2E no arquivo novo `data/e2e-refunds-landing-l6-20261023.sqlite`, pessoas fictícias, email simulado em localhost e R2 desativado. Nenhum banco ou serviço real integra o alvo. A integração exclui o único teste de QC que abriria um arquivo adicional de banco.

**LT40 — Orçamento local aprovado:** o responsável selecionou “Adotar esse orçamento de laboratório”: LCP ≤ 2,5 s, CLS ≤ 0,1, transferência inicial ≤ 350 KB mobile / 450 KB desktop, sob as condições de CPU/rede registradas no relatório L6. Não é promessa para aparelhos reais nem validação de INP/CWV de campo.
### Retomada e resultado da rodada L6 — 24/10/2026

**LT41 — Continuidade da etapa atual:** o responsável solicitou “prossiga de onde parou”. A execução retomou L6 com as autorizações LT39/LT40 preservadas, sem pedir novamente provisionamento ou orçamento. A suíte ampla finalizou com 39 aprovações, 25 falhas e 2 casos ignorados. Quatro falhas reproduziram no HEAD original; dois testes novos da jornada autenticada da landing passaram. Os achados e limites estão em [L6_OPERATIONAL_FINDINGS.md](L6_OPERATIONAL_FINDINGS.md).

Esta rodada de QA está registrada, mas o aceite integral de L6 e a publicação permanecem bloqueados pela triagem operacional. Não houve alteração de teste existente, domínio financeiro, QC, auth, schema ou infraestrutura para contornar resultados. A continuidade não autoriza L7 nem implementação de QC Phase 3. As fixtures foram arquivadas e o preview local restaurado.
