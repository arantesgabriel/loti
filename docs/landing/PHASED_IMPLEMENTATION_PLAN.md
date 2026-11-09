# Plano de implementação por fases da landing

**Planejamento aprovado como base em 23/10/2026.** Posteriormente, L1, L2, L3, L4 e L5 receberam autorização explícita e foram implementadas localmente; ver [relatório L1](L1_IMPLEMENTATION_REPORT.md), [relatório L2](L2_IMPLEMENTATION_REPORT.md), [relatório L3](L3_IMPLEMENTATION_REPORT.md), [relatório L4](L4_IMPLEMENTATION_REPORT.md), [relatório L5](L5_IMPLEMENTATION_REPORT.md) e [decisões posteriores](DECISIONS_AND_TRACEABILITY.md#decisões-posteriores-do-responsável--23102026). O responsável também autorizou especificamente o banco local novo e a captura mobile de uma coluna descritos no [plano demo](L2_DEMO_PLAN.md); L3 reutiliza esse ambiente sintético, sem migration nova. L4 acrescenta motion local sem novos dados; L5 inclui as páginas de construção autorizadas em LT37; L6 recebeu autorização de QA, provisionamento descartável e orçamento (LT38–LT40); a regressão ampla identificou bloqueios. L7 continua sem autorização. A numeração **L0–L7** é técnica e independente das Fases criativas 1–7 do pacote. O aceite documental inicial não autorizava implementação ou preparação de dados; as autorizações posteriores se limitam às fases e ao alvo identificados, sem preview hospedado ou publicação.

O resultado proposto é uma landing no mesmo Next.js, sem dependência de banco na visita pública, com provas reais e isolamento do gerenciador. Cadastro público, ferramentas, onboarding e planos permanecem dependências de produto fora deste roadmap.

## Visão de fases e complexidade

P = pequena, poucos arquivos e interação simples; M = média, composição/integração e revisão multidispositivo; G = grande, coreografia/QA e riscos cruzados. São estimativas relativas, **sem prazo ou esforço numérico aprovado**. Complexidade de construir signup/ferramentas não está embutida.

| Fase | Resultado visível | Porte e justificativa | Dependências principais |
| --- | --- | --- | --- |
| L0 — Decisões e aceite documental | Contrato de lançamento revisado | M: resolve conflitos de produto/identidade/release | Revisão desta pasta; decisões CF01–10. |
| L1 — Preparação e isolamento | Estrutura pública isolada, revisão local sem mudar `/` | M: limites de layout, tema e build compartilhados | Autorização explícita L1 e decisões de rota/tema. |
| L2 — Base visual, conteúdo e mídia demo | Header, hero e estrutura editorial estática | M: copy factual, capturas seguras e tokens | L1 aceito; copy/tema aprovados; autorização explícita para demo e assets. |
| L3 — Jornada e responsividade | Fluxo Favoritos → Compras → Pacotes e cartões individual/grupo | M: recortes reais e conteúdo equivalente em cinco larguras | L2 aceito; provas reais e interpretação de Cards mobile. |
| L4 — Motion e linguagem 2D/3D | S0–S3 com reversão e alternativas equivalentes | G: geometria, resize, acessibilidade e custo móvel | L3 aceito e composição/mídia estáveis. |
| L5 — Conversão, ferramentas e SEO | Links verdadeiros, FAQ e head público preparados | M: disponibilidade externa ao roadmap e indexação seletiva | L2/L3 aceitos; decisões de lançamento e destinos funcionais. |
| L6 — QA e revisão final | Candidato revisável com relatório visual/funcional | G: regressão ampla e evidências de acessibilidade/performance | L4/L5 aceitos; ambiente de QA explicitamente autorizado. |
| L7 — Publicação controlada | Landing acessível na URL final aprovada | M: pipeline capaz de migrar/publicar app inteiro | L6 aceito + autorização separada de publicação/alvo. |

## L0 — Fechar decisões documentais e condições de lançamento

**Objetivo e entregáveis:** revisar esta auditoria e fixar o contrato factual da primeira versão em um registro de aceite: CTA, gratuidade/limites, entrada individual, ferramentas, rota final, política de tema, uso de Cards mobile e ambiente demo. Decidir separadamente o encerramento da Fase criativa 7. Resultado visível: pacote documental aceito ou com alterações pontuais registradas.

**Escopo/exclusões:** apenas decisão e documentação. Não habilitar signup, corrigir login, criar ferramentas, plano comercial, seed ou ambiente remoto. Arquivos prováveis: apenas esta pasta e futura ata de aceite dentro dela.

**Sequência:** revisar lote 1 de decisões do registro; definir lançamento completo ou revisão editorial reduzida; revisar lote 2; aprovar conteúdo que poderá entrar em preview; registrar bloqueios externos e o gate que cada um impede.

**Riscos e mitigação:** confundir direção aprovada com disponibilidade. Manter condições explícitas por frase/link; não considerar login um substituto de signup. Não prometer espaço privado pessoal a partir de filtro Meus.

**Aceite e evidências:** cada pendência recebe uma decisão ou bloqueio formal; C/D originais continuam íntegros; desvio editorial tem texto proposto aprovado; lista de capacidades não publicáveis permanece visível. Validação documental por links/diff, sem testes de produto.

**Rollback:** versionar ajuste de decisão na documentação, sem tocar produto. **Gate de saída:** aprovação do planejamento; **L1 ainda exige autorização explícita própria.**

## L1 — Preparação e isolamento

**Objetivo/resultado visível:** uma rota editorial isolada e inicialmente não indexável, que possa receber a composição sem alterar a entrada atual do produto.

**Escopo e entregáveis:** boundary de marketing, estrutura sem dados privados, política de tema aceita e registro de baseline. Recomendação: `src/app/(marketing)/landing/page.tsx` → `/landing`, `src/app/(marketing)/layout.tsx`, `src/components/landing/landing-page.tsx` e CSS Module próprio. São **caminhos futuros**, inexistentes nesta entrega. Continuar usando root/font/tokens e primitivas existentes. Não criar outra rota `/` conflitante com `src/app/page.tsx`.

**Dependências:** aceite L0; autorização L1; ambiente local definido sem herdar banco real; confirmação de que a preparação não aciona pipeline. Nenhuma biblioteca nova é presumida.

**Sequência técnica:**

1. Registrar HEAD, working tree e alterações de terceiros; limitar o diff aos caminhos aprovados.
2. Inspecionar imports e estabelecer rota fora de `(app)` e sem `WorkspaceProvider`, auth, banco, serviços ou QC.
3. Aplicar boundary de tema aprovado sem mudar `<html>`, `loti.theme` ou `setThemePreference()`; manter página inicialmente noindex.
4. Preservar `/` → `/favorites`, login/convites e deep links; não abrir PR/push só para obter preview.
5. Executar apenas checks locais autorizados sem migration. Se um baseline falhar por alteração preexistente fora do escopo, registrar e solicitar tratamento separado; não corrigi-la silenciosamente.

**Complexidade M:** App Router facilita isolamento, mas global CSS/ThemeProvider continuam compartilhados. **Riscos:** vazamento de import server, override global de tema e mudança involuntária do root. Mitigar por revisão de grafo de imports e diff, seletores locais e teste de rotas.

**Critérios de aceite:** `/landing` renderiza anonimamente sem chamadas a `/api/app`, packages/QC ou sessão por código próprio; nenhuma consulta de banco pela landing; root e privadas preservados; indexação bloqueada no candidato; nenhuma dependência/migration/infra alterada.

**Testes/evidências futuros:** lint, typecheck e build locais autorizados; HTML/head e network da rota; smoke de redirect/root/login. Não rodar E2E atual nesta fase se não houver autorização para seu provisionamento. Registrar antes/depois de CSS/tema e arquivos afetados.

**Rollback:** reverter apenas novos arquivos/imports de marketing; redirect raiz ainda intacto. **Gate:** apresentar o isolamento e obter aceite L1; aguardar autorização explícita L2.

## L2 — Base visual, conteúdo e demonstrações seguras

**Objetivo/resultado visível:** header, hero central e esqueleto completo da landing em modo estático, com H1 aprovado, apoio, botões factuais e primeiras capturas reais aprovadas.

**Escopo/entregáveis:** mapa de tokens atuais versus briefing aceito; copy factual em módulo editorial próprio; header/hero/footer mínimo; inventário de mídia com versão, viewport, origem e licença. Caminhos futuros prováveis: `src/components/landing/{landing-header,landing-hero,landing-footer}.tsx`, `landing-content.ts`, `landing.module.css`, `public/landing/` e documentação de assets nesta pasta. `Button` pode usar `asChild` com Link. Não importar cenas desenhadas de login como prova real.

**Dependências:** L1 aceito; texto publicável ou claramente restrito a revisão interna; decisão Cards mobile; **autorização explícita para criar conta/workspace demo, inserir dados e produzir capturas/assets**. Sem essa autorização, mídia final fica bloqueada; não preencher com screenshot real de amigos ou UI inventada.

**Sequência:**

1. Aprovar o dataset/procedimento do documento de riscos, ambiente descartável e proibição de email/R2 reais.
2. Usar schema já preparado no ambiente autorizado. Se preparar DB exigir migration, pedir autorização específica para esse alvo local antes; não contornar a proibição usando seed/E2E.
3. Criar dados sintéticos e capturar Favorites Cards desktop e mobile real em tema claro; registrar rastreabilidade e inspecionar privacidade.
4. Construir conteúdo server-side, hero frontal amplo, borda leve, sombra mínima e ações disponíveis independentemente de motion.
5. Produzir ou reaproveitar poucos assets editoriais somente no escopo aprovado; registrar autoria/licença e dimensões. Sem WebGL/modelos runtime por padrão.

**Complexidade M:** composição central e dados demo exigem curadoria. **Riscos/mitigação:** PII ou números reais, CTA enganoso e paleta divergente; revisão de cada asset e frase; manter C integral e revisão factual separada. Se cadastro não existe, não declarar o CTA aprovado como pronto; eventual preview textual não equivale a fluxo testado.

**Aceite testável:** B ACE-01/02/11/14 no escopo verificável; H1 único; CTA não espera animação; fonte Geist local; screenshot autêntico sem foto operacional ou dado de produção; nenhuma mutação por visitante; destinos aprovados ou bloqueio de publicação registrado, sem botão funcional falso.

**Testes/evidências:** revisão visual a 1440 e notebook 1024, mobile 390 e 320; tab/foco/alt/heading; network sem dados privados; checks de compilação/lint autorizados; manifesto e aprovações de capturas. Responsividade fina continua L3.

**Rollback:** reverter componentes e mídia novos; conta/DB demo permanecem isolados até limpeza explicitamente combinada, sem remoção de dados reais. **Gate:** aceite do hero/copy/inventário e autorização separada L3.

## L3 — Jornada do gerenciador e responsividade

**Objetivo/resultado visível:** página estática completa com Favoritos → Compras → Pacotes e custos e dois cartões equivalentes de uso, legível em desktop/mobile.

**Escopo e entregáveis:** seções reais, primeira faixa forte somente em Compras com UI clara, Custos de volta ao claro, texto compacto e alternância desktop. Caminhos futuros: `src/components/landing/{manager-journey,use-cases,product-capture}.tsx`, CSS Module e assets aprovados desktop/mobile. Sem reproduzir componentes financeiros ou toda a tela privada em DOM público.

**Dependências:** L2 aceito; dataset com uma compra ativa e um ciclo finalizado coerente; capturas de custos/compra autorizadas; decisão factual sobre uso individual. Finalizados e custos continuam entidades distintas.

**Sequência:** capturar a UI real de compra/custos no dataset autorizado; selecionar recortes que preservem nomes/valores relevantes; montar ordem e alternância; criar cartões simétricos; trabalhar quebras de conteúdo com cinco viewports; validar narrativa sem motion/JS essencial.

**Complexidade M:** tabelas/custos precisam recorte cuidadoso, não redução indiscriminada. **Riscos:** capture desktop minúscula em celular, promessa de sincronização, custos mostrados em fase errada ou tema escuro herdado. Mitigar com sources mobile reais, texto explícito e boundary editorial.

**Critérios de aceite:** B ACE-04/05/06/12/14; 320/390/768/1024/1440 sem overflow de página; Cards mobile real em uma coluna se aprovado; conteúdo/ações equivalentes; leitura dos dados de UI preservada; só Compras escura; nenhum preenchimento financeiro ou recurso inventado. Cartão individual não promete onboarding inexistente.

**Testes/evidências:** screenshots por breakpoint, inspeção lado a lado, tab e zoom/reflow, teste curto de compreensão autorizado, validação do manifesto de capturas e coerência numérica demo. Comparar com C/D/B e imagens reais, não antigos mockups com Importa/renders. Checks estáticos de código conforme escopo autorizado.

**Rollback:** reverter seções/mídia locais à landing, mantendo base aprovada L2. **Gate:** aceite da composição estática; autorização explícita L4.

## L4 — Motion S0–S3, 2D e 3D pontuais

**Objetivo/resultado visível:** uma transformação curta, precisa e reversível por scroll, preservando interface e controle natural da página. Mobile com 2–3 elementos externos e trajetórias simples; reduced motion estático informativo.

**Escopo/entregáveis:** pequena ilha client, por exemplo `src/components/landing/favorites-transformation.tsx`, controlador/hook local se necessário, estilos escopados e poucos elementos de mídia. Revelações e microinterações restantes discretas. Não copiar autoplay/timers de login, interromper wheel/touch, alterar carrossel de compra ou adicionar loops de ornamento.

**Dependências:** L3 aceito, imagens/layout estáveis e técnica validável sem novas dependências. Se uma biblioteca se mostrar necessária, apresentar evidência e aprovação específica de dependência antes de instalar; ela não faz parte da autorização padrão.

**Sequência técnica proposta, sujeita a protótipo autorizado:**

1. Estado base em HTML/CSS mostra resultado organizado legível e CTAs disponíveis; decoração não é conteúdo essencial.
2. Derivar progresso normalizado da geometria da cena e posição real de scroll; mapear S0 preparação → S1 aproximação → S2 encaixe → S3 clareza. Não usar etapa acumulativa que perde reversibilidade.
3. Atualizar transform/opacity em rAF somente enquanto necessário/em viewport; listeners passivos; reagir a resize/imagem/font carregada e desmontar observers/listeners/frames.
4. Mobile simplifica trajetórias, não elimina mensagem; mudança de breakpoint recalcula composição sem mexer no scroll. Sticky só se a leitura demonstrar necessidade, com scroll nativo preservado.
5. `prefers-reduced-motion` em CSS **e JS**, inclusive mudança ao vivo: interromper processamento e manter equivalente estático. Sem anúncio de leitor de tela por frame e sem controles decorativos focáveis.
6. Ajustar revelar/foco de seções e objetos soft 3D pontuais, sem CTA pulsante ou números financeiros animados.

**Complexidade G:** movimento depende de dimensões e tem riscos reais em mobile/retorno/resize. **Riscos/mitigação:** jitter/layout shift, CPU ociosa, scroll preso e UI coberta; dimensões reservadas, teste de rolagem lenta/rápida/nos dois sentidos, no-JS e redução ao vivo. Se falhar o orçamento ou entendimento, simplificar a composição e reapresentar; não trocar por vídeo/autoplay sem aceite.

**Aceite testável:** B ACE-03/10/12/13/15; ao retornar à mesma posição recupera mesma composição; S3→S0 sem reset súbito; nenhum preventDefault de wheel/touch para conduzir narrativa; CTA/foco/âncoras funcionam em qualquer estado; sem animação espacial em reduce; sem frames contínuos fora da cena; UI íntegra antes/durante/depois. Legibilidade prevalece sobre efeito.

**Testes/evidências:** registros nos dois sentidos por desktop/mobile, amostras visuais S0/S1/S2/S3, teclado/PageDown/hash links/resize/orientação, preferência ao vivo e sem JS; perfil de main thread/paint e mídia. Testes de controlador só se comprovarem reversibilidade/cleanup essenciais; não espelhar constantes de implementação sem valor.

**Rollback:** desligar/remover apenas ilha de animação e conservar versão estática L3; nenhuma alteração de dados ou API. **Gate:** revisão criativa/técnica do motion e autorização explícita L5, quando sequencial.

## L5 — Conversão, ferramentas disponíveis, FAQ e SEO

**Atualização de execução — LT36/LT37:** L5 foi autorizada. O responsável determinou exibir Simulador de Custo Final, Calculadora de Impostos, Conversor de Moedas, Calculadora de Rateio e Tabela de Referências, com links para paths definitivos e páginas próprias de construção. Essa instrução substitui, nesta implementação local, a restrição original abaixo de integrar somente destinos operacionais. Autoriza o catálogo e as páginas de construção, sem desenvolver as ferramentas nem liberar publicação. Ver [relatório L5](L5_IMPLEMENTATION_REPORT.md).

**Objetivo/resultado visível:** narrativa com destinos verdadeiros, FAQ validado e metadados preparados para publicação seletiva.

**Escopo/entregáveis:** integrar **somente** ferramentas já públicas e testáveis; revisar condições de conta gratuita/individual; links de acesso; FAQ nativo ou componente acessível; title/description/canonical/OG aprovados. Caminhos futuros: `src/components/landing/{tools-section,landing-faq}.tsx`, módulo editorial, metadata na rota, `src/app/sitemap.ts`/`robots.ts` somente se necessários e aprovados, mídia OG local. Não adicionar nomes/flags/layout oculto para ferramentas futuras; catálogo ausente não justifica implementação. Sem analytics/billing/onboarding.

**Dependências:** decisões L0; produto de aquisição e ferramentas entregues/validados fora deste roadmap, ou revisão editorial reduzida explicitamente aceita. L2/L3 aceitos. Pode preparar head/FAQ sem depender do motion, mas não declarar a fase aceita com CTA fictício. Nenhum dado de conta demo deve alimentar conteúdo indexável em JSON.

**Sequência:** conferir em sessão anônima cada destino; aprovar texto factual final com condições de gratuidade; incluir/omitir conjunto coerente de seção/nav/CTA/FAQ de ferramentas conforme decisão; implementar SEO local sem retirar noindex de privadas/auth; canonical e URLs absolutas com domínio confirmado; manter preview noindex e root atual até L7. Termos/privacidade/contato só entram se destinos reais e conteúdo aprovado existirem.

**Complexidade M:** bloqueios são disponibilidade e governança, não tamanho da seção. **Riscos/mitigação:** SEO global abre app à indexação, promessas comerciais falsas e CTA de cadastro caindo em login; testes de head por rota e sessão anônima, revisão editorial rastreável, sem bypass de convites.

**Aceite:** B ACE-01/07/08/09/13/16; todo CTA tem destino verdadeiro no escopo aprovado; ferramenta anunciada funciona sem login; sem preços/Pro inexistentes; FAQ mantém respostas acessíveis; `robots` efetivos da landing/preview/privadas corretos; sitemap só permite URLs públicas aprovadas; nenhum token/ID privado em OG, schema ou URLs. Nenhuma alegação de cadastro aberto até prova externa de produto.

**Testes/evidências:** matriz texto→prova→URL→resultado anônimo, HTML/head em ambiente autorizado, link check, FAQ por teclado e sem motion; revisão OG/alt/canonical. Não validar ferramentas novas executando importações ou registros reais. **Rollback:** reverter somente links/seções/head novos para último candidato aprovado; jamais trocar cadastro por login sem decisão. **Gate:** aceite factual/SEO e autorização explícita L6. Bloqueios comerciais impedem aceite de lançamento da versão completa.

## L6 — QA integrado, revisão e candidato de release

**Atualização de execução — LT38:** a continuidade após L5 autorizou L6. A suíte pública sem banco, os testes unitários, a auditoria de acessibilidade e o baseline foram executados. O provisionamento e o orçamento foram posteriormente autorizados em LT39/LT40. A regressão ampla foi executada e identificou falhas; revisão/triagem em 24/10/2026, sem autorização de publicação. Ver [relatório de QA](L6_QA_REPORT.md).

**Objetivo/resultado visível:** candidato completo revisável, com evidências de aderência B ACE-01–16, regressão e limites conhecidos, sem publicar.

**Escopo/entregáveis:** testes apropriados, relatório de QA, capturas desktop/mobile, inventário final de mídia, bundle/performance/a11y e roteiro de release/rollback com commit exato. Caminhos futuros: `tests/e2e/landing.spec.ts`, relatório/manifesto nesta pasta e artefatos QA ignorados pelo Git. Não editar testes financeiros para acomodar falhas da landing nem corrigir domínio fora do escopo sem nova autorização.

**Dependências:** L4 e L5 aceitos; autorização explícita dos testes, fixtures e ambiente. **O harness atual faz migrations.** Para rodar integration/E2E, obter autorização específica de provisionamento descartável ou um harness revisado/ambiente pronto cuja estratégia seja aprovada; não apontar para `.env` real. Preview hospedado, se necessário, requer permissão separada e confirmação prévia dos gatilhos CI/CD.

**Sequência:** registrar baseline e escopo do diff; executar lint/typecheck/build sem install novo; testes unitários adequados; regressões de auth/convites/theme/favorites/purchase/packages/history/QC/refunds no ambiente aprovado; QA visual e teclado; medir carregamento/motion nos cenários combinados; fechar bloqueios; apresentar candidato. Não executar `npm run check` indiscriminadamente: inclui integrações e build; explicitar efeitos antes de autorizar.

**Complexidade G:** a aplicação inteira compartilha root/CSS/build; mudança pequena de marketing pode afetar navegação/tema. **Riscos/mitigação:** usar DB real, mudança de snapshot financeiro, teste herdado falho ou custo de mídia ignorado. Comparar DTOs/snapshots em fixture, manter baseline preexistente explícito e não extrapolar um teste Chromium para todos os browsers.

**Aceite:** matriz B ACE-01–16 preenchida com evidência ou bloqueio que impede release; zero regressão atribuível à landing em auth/permissões/snapshots/custos/refunds/QC/tema; cinco larguras e estados motion cobertos; links/SEO/privacidade aprovados; metas de desempenho aprovadas após baseline cumpridas; nenhum comportamento depende de animação; diffs sem schema, secrets ou infraestrutura não autorizados.

**Evidências mínimas:** logs de comandos e ambiente sanitizados; snapshots visuais, network sem API privada na visita pública, resultados de regressão, teste anônimo/teclado/reduced/no-JS, medições com condições de rede/dispositivo, diff e inventário aprovado. Medição lab não equivale a CWV de campo; INP de campo exige tráfego real e autorização de medição separada.

**Rollback:** candidato continua não publicado; reverter apenas o diff da landing ou conservar L3 estático se motion for rejeitado. Não restaurar banco nem alterar produção para corrigir QA. **Gate:** aceite do candidato L6 não autoriza deploy; solicitar autorização separada L7 com alvo/commit/URL e plano operacional concreto.

## L7 — Publicação controlada e verificação

**Objetivo/resultado visível:** publicar somente a versão e URL aprovadas, preservando sessões, dados e todas as rotas internas.

**Escopo/entregáveis:** promoção de `/landing` para `/` se aceita, metadados indexáveis apenas na URL pública final, publicação e relatório de smoke. Arquivo provável de promoção: **o atual** `src/app/page.tsx` passa a renderizar composição editorial; isso é mudança autorizável de navegação, não parte da preparação L1. Decidir destino de `/landing` para evitar duplicidade/canonical conflitante. O login continua redirecionando a `/favorites` conforme política existente.

**Dependências:** L6 aceito; cadastro/ferramentas e condições comerciais verdadeiros na versão aprovada; autorização explícita de publicação com ambiente/commit. Confirmar pipeline real: push `main`/`dev` executa migrations/deploy. Landing não deve necessitar migration; se workflow ainda as executar, **não usar esse caminho sem autorização específica ou revisão separada do processo**. Não alterar workflow nesta fase por inferência de autorização para publicar.

**Sequência:** confirmar artefato, diff, ambiente, domínio e gatilhos; verificar que nenhuma migration pendente de outra frente será aplicada acidentalmente; preparar forma de rollback do artefato anterior; apresentar ação concreta para aprovação final; somente então executar publicação autorizada; smoke público e autenticado nos roteiros aprovados, sem usar dados reais para criar compras; confirmar head/noindex privado e versão final do asset; registrar resultado.

**Complexidade M:** publicar mesmo app exige controle do candidato e pipeline. **Riscos:** release involuntário de outras alterações locais, migration pendente, troca de domínio/origem e perda de acesso. Mitigar com artefato e escopo exatos, configuração existente preservada e release separado de expansão/infra.

**Aceite/evidências:** URL e HEAD aprovados, CTA real e app interno acessível; `/favorites`, login, convite e rotas sensíveis preservados; nenhum segredo ou dado pessoal em mídia/head; indexação só das páginas autorizadas; nenhum schema/config alterado pela landing; relatório de smoke e observações operacionais sanitizadas. Qualquer checagem com efeitos reais precisa estar explicitamente no roteiro autorizado.

**Rollback:** restaurar o artefato anterior por mecanismo do hosting autorizado, incluindo antigo comportamento de `/`; manter DB intacto, pois a landing não migra schema nem escreve dados. Nunca “rollback de banco” para desfazer página editorial. A promoção anterior e o operador responsável devem estar definidos antes da publicação. **Gate final:** aceite do release; nenhuma evolução subsequente por aprovação implícita.

## Caminho crítico e trabalho que poderia ocorrer em paralelo

**Caminho visual:** L0 → L1 → L2 → L3 → L4 → L6 → L7. **Caminho de aquisição:** decisão de cadastro/individual + oferta válida + entrega de ferramentas fora deste roadmap → L5 → L6 → L7. O segundo pode dominar o prazo, mesmo com a página visual pronta.

Com autorizações explícitas de ambas as fases, a preparação factual/SEO de L5 pode ocorrer após L2/L3 enquanto L4 trabalha motion; inventário/copy e definição de dataset podem avançar como documentação sem criar dados. A execução de signup/ferramentas pode ocorrer numa frente independente, jamais como subfase implícita. QA do motion pode ser incremental, mas aceite final L6 espera todos os contratos. Esta observação não inicia trabalho paralelo nem delega agentes.

Se optar por lançamento reduzido, registrar quais ACE/textos deixam de se aplicar e por quê; obter nova aprovação editorial. Não declarar a versão originalmente aprovada cumprida removendo silenciosamente seções ou trocando CTA.
