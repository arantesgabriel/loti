# Onboarding H3-C — execução local das Fases 2–8

Data: 06/11/2026. Branch: `feat/onboarding`; baseline inspecionado: `341068f`.

Autorização de desenvolvimento: pedido explícito **“execute até a fase 8 e aguarde minha aprovação”**, seguido das retomadas. Esse pedido substituiu os gates intermediários de desenvolvimento. Não autoriza deploy, migração remota, backfill de dados reais, fornecedores ou analytics. Nenhum aceite de produto é atribuído ao usuário por ausência de resposta.

Estado deste relatório: implementação local e handoff entregues, com QA automatizado documentado. O aceite visual humano e o ensaio com leitor de tela real permanecem separados dos testes automatizados. Não se declara paridade integral ou produção liberada.

## Fontes e deltas

O pacote congelado foi lido na Fase 0: README, manifesto, especificação, storyboard, estados/AC, contrato técnico, plano, critérios de paridade, inventário, pendências, rastreabilidade e os cinco originais de `fontes/`. Foram também lidos os documentos canônicos do repositório, o contrato operacional `docs/DESIGN.md`, os planos de workspace pessoal e signup/ativação, componentes reais, schema e migrador. A leitura do material não é tratada como autorização para executar operações externas.

O checkout atual prevaleceu sobre a auditoria de 05/11: Next 16.3.8, React 19.3.0, TypeScript 6.0.3, Tailwind 4.3.3, Better Auth/adapter 1.7.7, Drizzle 0.45.3, libSQL 0.18.0, Zod 4.6.5, RHF 7.89, Vitest 5.0.3 e Playwright 1.63. Geist local e `src/app/theme.css` são a fonte vigente. E0/Inter e storyboard E2 antigo não foram implementados. R8 substitui o storyboard anterior; a anotação histórica de gate não aprovado em R9 não revoga o freeze e a autorização posterior do usuário.

Arquivo Penpot **Loti Design System**, página **Onboarding**: [referência canônica](https://design.penpot.app/?screen=workspace&team-id=b839a783-207b-8182-8008-dbfebb1cb6ba&file-id=64ee36db-f4d2-8047-8008-dbff2f7d7205&page-id=597f3ed5-eb73-8048-8008-e67db5f2d933&layout=layers).

Foram inspecionados os 20 boards do inventário, árvores, textos, geometria, propriedades e 41 interações nativas. Os quatro boards finais, variantes R7, tokens/storyboard R8 e matriz R9 orientaram a implementação. Não há catálogo formal de tokens no arquivo; os valores do protótipo foram reconciliados com tokens semânticos reais, sem editar o tema global.

| Referência | ID |
| --- | --- |
| H3-C 320 | `e510b18a-e299-80b8-8008-e781470d095a` |
| H3-C 390 | `e510b18a-e299-80b8-8008-e77cf919777a` |
| H3-C 1440 | `e510b18a-e299-80b8-8008-e77cb73b4c31` |
| H3-C 1920 | `e510b18a-e299-80b8-8008-e7816bb7714b` |
| Primeira ação real | `e510b18a-e299-80b8-8008-e77a089b4290` |
| R7 Compra mobile | `e510b18a-e299-80b8-8008-e7859a8ff7b7` |
| R7 Pacotes mobile | `e510b18a-e299-80b8-8008-e7859ae25f04` |
| R8 storyboard / tokens | `e510b18a-e299-80b8-8008-e7865be68052` / `e510b18a-e299-80b8-8008-e78698496734` |
| R9 | `e510b18a-e299-80b8-8008-e787fb41bd6a` |

Exports canônicos PNG em `artifacts/qa/onboarding/reference/`: 320, 390, 1440, 1920 e duas variantes R7 mobile. O primeiro export de 1920 falhou com timeout do serviço Penpot; uma nova tentativa conectada funcionou. Foram preservados os pixels exportados, sem geração de imagem ou redesenho da referência.

## Fase 2 — elegibilidade e bootstrap

Status: implementação concluída localmente; aceite humano não presumido.

`src/lib/onboarding/eligibility.ts` concentra a política pura. `src/lib/onboarding/services.ts` retorna somente a presença de convite pendente, sem expor email, token ou conteúdo do convite. Convites aceitos, expirados ou revogados não são confundidos com pendentes.

`src/app/(app)/layout.tsx` mantém sessão, ativação e autorização existentes antes de montar `OnboardingProvider`. Não há consulta de analytics/funil no layout. O bootstrap client consulta um pequeno snapshot operacional privado. Falha desse snapshot deixa o app utilizável.

A introdução automática exige cohort novo, versão inicial compatível, ausência de execução anterior, convite pendente e interação/edição; só aparece na entrada comum de `/favorites`, sem query/hash. Respostas tardias não interrompem uma operação já iniciada. Deep links, rascunhos, editores e troca de espaço têm prioridade. Um fluxo iniciado/fechado não reaparece automaticamente.

`WorkspaceProvider` expõe a existência de editores registrados, inclusive antes de o formulário ficar dirty. A proteção de descarte continua usando o estado dirty original. O contexto de orientação remonta por usuário/espaço e descarta respostas HTTP de gerações anteriores.

Critérios: AC-01/02/11/15; T01–T04, T19–T21 e T27 em combinação com os testes existentes de auth/convite/workspace. Evidência: testes de elegibilidade, integração de convite pendente e regressões; browser de conta pendente, legada e editor durante bootstrap. O aceite completo de convite também foi exercitado no browser com o provedor de email falso local: verificação e membership precedem H3-C, e dados do grupo não geram marco para quem os visualiza. Nenhum signup ou fluxo paralelo foi criado.

Tradeoff: a leitura de onboarding é posterior ao app autorizado. Uma interação durante a espera adia a oferta automática; não há overlay bloqueando trabalho. Introdução e ajuda manual continuam recuperáveis.

## Fase 3 — H3-C estático e entradas reais

Status: implementação concluída localmente; comparação visual entregue para aceite.

Arquivos: `src/components/onboarding/{introduction,onboarding-provider,context-help,guidance-preferences}.tsx`, CSS namespaced e integrações pequenas em Favoritos, Compra Atual e Perfil.

Composição em camadas, fonte Geist, duas perguntas opcionais sem seleção inicial, copy por breakpoint, controles de cartão e CTA reproduzem os boards finais. O palco desktop de 1440×900 fica centralizado em 1920×1080. Há adaptação em 768 e interpolação verificada em 1024. O shell operacional mobile permanece o existente, sem drawer adicional.

O CTA salva somente respostas confirmadas e segue para Favoritos. “Entrar sem responder” não confirma o rascunho de respostas. Pular e fechar têm comandos distintos. A primeira ação acontece nos formulários reais existentes. Favoritos oferece a alternativa explícita de Compra Atual; nenhum clique cria produto, compra, membership ou pacote de demonstração.

Perfil permite editar/limpar respostas e controlar ajuda proativa. Rascunhos participam da proteção de descarte. Conflitos mantêm escolhas locais e exigem recarregar o estado confirmado, sem sobrescrita automática.

Critérios: AC-03/04/08/09/12/14; T05–T10/T18/T23/T24/T26. Evidências: capturas por largura, tema, estado parcial, zoom/reflow e comparação com os quatro exports canônicos.

Deltas explícitos para revisão: o status bar de dispositivo desenhado no Penpot não é duplicado no app; “Expert” segue o pedido do usuário, em vez do “Sou expert” histórico desktop; “Fechar por agora” aparece no rodapé como ação distinta exigida pelo contrato, ausente como controle independente em alguns boards. Indicadores pequenos do deck são decorativos; a navegação real usa controles de 44px e anúncio do cartão ativo. A ajuda contextual reutiliza a linguagem operacional do app.

## Fase 4 — motion R8

Status: implementação concluída localmente; evidências runtime entregues, aceite humano pendente.

SSoT de tempos/curvas nos custom properties do CSS H3-C: entrada 720ms com escalonamento de 50/90ms, troca 360ms, chips 180ms, CTA 140ms, saída 400ms, ambiente opcional 3200ms e 2px. A composição usa transform/opacity; seleção usa feedback de cor e semântica de radio. CSS e WAAPI bastaram; nenhuma biblioteca foi instalada.

Trocas cancelam a animação WAAPI anterior no cleanup. A entrada não impede interação. Saída tem cleanup temporal independente de `animationend`; navegação ocorre sem esperar a animação. Ambiente para em página oculta/hover/foco e fica desligado com movimento reduzido, save-data ou hardware limitado. Reduced-motion preserva todo o conteúdo e as opções, sem ambiente/parallax.

Critérios: AC-14, V04/V05; T23–T26. Browser: cartões, seleções, cliques repetidos, resize, saída/unmount e modos normal/reduzido nos cinco viewports. Vídeos e capturas são locais, com contas sintéticas. As durações capturadas e o perfil CDP são evidência laboratorial, não INP de campo.

## Fase 5 — M1/M2 e preexisting

Status: implementação e provas locais concluídas. Backfill real e migração remota não executados.

Migração aditiva `drizzle/0033_onboarding_milestones.sql`, snapshot e journal. A tabela guarda apenas usuário, M1/M2, contexto do primeiro marco, tipo de origem, evidência e datas operacionais. PK usuário/marco deduplica globalmente em qualquer workspace ou instância. Contexto fica preservado no banco; o DTO não expõe IDs de outros espaços.

`recordCommittedInsert` é uma dependência confiável do servidor injetada pelo endpoint de negócio. Os pontos de chamada ficam nas branches de insert de `saveFavorite`, `addFavoriteToPurchase` e `saveManualItem`, dentro da mesma transação dos dados e participantes. Identidade vem da sessão. Editar, excluir, visualizar, cancelar, errar ou agir como colega/participante não cria marco para o observador. Exclusão posterior de um produto não apaga o fato de que o usuário já criou algo.

Seeds, importadores e fixtures históricas não recebem o recorder. A animação e o frontend não podem emitir marcos. Para os três inserts interativos, contenção SQLite tem retry limitado somente da transação revertida; esgotamento retorna 503 explícito. Falha do marco reverte a inserção de negócio. Erro de rede com commit incerto não é repetido automaticamente como novo insert.

`scripts/backfill-onboarding.ts` exige banco local explicitamente nomeado em `data/onboarding-backfill-*.sqlite` e manifesto revisado. Dry-run valida e reverte tudo; `--apply` é separado. `recordPreexisting` verifica referência, autoria persistida (`ownerId`/`createdBy`) e workspace. Não usa `personId` como ator. A revisão do manifesto deve excluir seeds, testes e importações com autoria ambígua: a FK sozinha não comprova uma ação humana histórica. Evidência `preexisting` mantém `occurredAt=null`, sem evento histórico inventado, e não substitui evidência live já confirmada.

Critérios: AC-05/06/07/10/11/13; T11–T17/T19/T21/T22. Provas: rollback injetado, ator diferente do participante, snapshot preservado, deduplicação em espaços distintos, disputa em processos independentes, recuperação após 503 e CLI de backfill dry-run/apply/repetição/rejeição de remoto.

Tradeoff de integração: novos pontos de escrita interativa deverão receber explicitamente a mesma capacidade de evidência. A API pública de comandos não aceita flag de teste/proveniência ou autoria fornecida pelo browser.

## Fase 6 — ajuda contextual e retomada

Status: implementação concluída localmente.

`ContextHelp` oferece ajuda inline nas rotas reais, com entrada manual disponível após pulo/dispensa. A dispensa de uma dica e a dispensa global persistem separadamente. Reabrir ajuda não reativa proatividade e não reinicia introdução terminal. Perfil permite reativar dicas explicitamente.

`help-copy.ts` ajusta somente orientação às respostas confirmadas e ao workspace real. Um grupo populado não é tratado como vazio, nem os produtos dos colegas viram conquistas do usuário. A resposta “Em grupo” não cria espaço, convite ou membership. M1/M2 confirmados silenciam a ajuda proativa correspondente; o cliente relê estado após resposta de negócio confirmada, sem fabricar marco.

A ajuda adia sobre query/deep link, editor, mutação ou troca de espaço. O provider é isolado por contexto. Confirmações usam revisão do rascunho, não uma revisão atualizada silenciosamente pelo foco de outra aba.

Critérios: AC-04/08/09/11/12/13; T05–T22 conforme matriz abaixo. Provas de browser: fechar/recarregar/retomar/pular/dispensar/reabrir, conflito real entre sessões, editor aberto durante bootstrap e navegação alternativa para compra.

## Fase 7 — QA transversal

Status: parcial quanto ao aceite final: implementação e verificações automatizadas entregues; aceite humano de paridade e ensaio com leitor de tela real pendentes. Não declarar release aprovado.

| Verificação | Resultado comprovado |
| --- | --- |
| Fundação de onboarding | 31 testes em 8 arquivos passaram; mais 1 teste novo de personalização passou separadamente |
| Regressões de auth/signup/convite/Favoritos/workspaces | 59 testes em 7 arquivos passaram |
| Suíte completa | 102 arquivos: 98 passaram, 3 falharam, 1 ignorado; 594 testes passaram, 15 falharam, 7 ignorados |
| Comparação com baseline sem onboarding | Conjunto dos 15 nomes de falha idêntico; `acceptance.json` registra a comparação |
| Browser | 12 cenários da matriz H3-C + 1 proteção de convite pós-introdução + 2 jornadas completas de signup/convite passaram, em três execuções locais isoladas |
| Build isolado | Passou com `.next-onboarding-release`; inclui o ajuste de alvo touch |
| Lint e TypeScript | Passaram; alterações adicionais de teste verificadas novamente |
| Migração local 0032/0033, duas aplicações | Passou em `data/onboarding-phase8-76665e3f.sqlite` |
| Verificação desse banco | Zero violações FK, 62 triggers financeiros e invariantes logísticos preservados |

As falhas amplas são as 9 de `hubbuy-account-deletion-concurrency.test.ts`, 5 de `package-refund-concurrency.test.ts` e 1 de `personal-orders-workflow.test.ts`, já reproduzidas sem o onboarding. Há contenção/timeouts nos testes financeiros e expectativa 409 versus 403 no teste pessoal. Nenhum teste foi desabilitado e esses módulos não foram alterados para mascarar o baseline. A suíte global não está verde.

Contraste foi medido no browser em claro/escuro, com cores estabilizadas e transição reduzida. Entre os seletores amostrados, o mínimo foi 5,91:1 no claro e 6,85:1 no escuro. O CTA mediu 6,85:1 nos dois temas. O relatório JSON identifica os seletores; essa amostra não certifica todos os pares possíveis do produto. Teclado usa radios nativos agrupados, foco visível, anúncio do cartão e destino após saída; grupos e estados foram verificados automaticamente. Isso não equivale a afirmar ensaio auditivo com NVDA/VoiceOver.

O perfil CDP de três trocas registrou 62,4ms de TaskDuration agregada, 8,0ms de script, 1,6ms de layout, 6,7ms de recálculo de estilo e 3 layouts. Não se confunde esse total com INP ou duração de um frame. A observação da jornada completa registrou soma de layout shifts sem input de 0 a 0,00199. Com CPU 4× e 2 núcleos simulados, ambiente permaneceu desligado; apareceram long tasks de até 192ms durante a jornada que inclui login/bootstrap, não atribuídas exclusivamente ao motion. Em condições normais houve long tasks isoladas de até 79ms. As medidas não substituem ensaio em aparelho físico.

Âncoras finais medidas: em 390, cartão `(61,273.125,218,79)` contra `(61,273,218,79)` e CTA `(24,710.625,342,49)` contra `(24,711,342,49)`; em 1440, cartão `(75,501.594,327,253)` contra `(75,502,327,253)` e CTA y=693,297 contra 692; em 320, cartão y=304,438 contra 304 e CTA y=824,938 contra 826. Em 1920 a composição recebe o deslocamento `(240,90)`. Isso comprova proximidade dessas âncoras, não igualdade de todos os pixels, sombras ou glyphs.

Zoom foi verificado pelo reflow equivalente de 1440px a 200% para 720 CSS px. Não se confunde `style.zoom` com zoom de browser: aquele não atualiza media queries. Há também screenshots nos cinco viewports, 1024 intermediário, dois temas e dois modos de movimento. Nenhum deles apresentou rolagem horizontal nos cenários aprovados.

### Rastreabilidade de cenários

| Cenários | Prova e limite |
| --- | --- |
| T01–T04 | Auth/ativação/convites existentes + snapshot + browser de conta pendente, signup e convite com email falso local; expiração/revogação cobertas nos serviços |
| T05–T10 | Browser de respostas opcionais, fechamento, retomada, pulo e ajuda; CAS em processos/sessões distintas |
| T11–T15 | Integração transacional e browser/API real; nenhuma atribuição ao participante/observador |
| T16–T17 | Copy por contexto, isolamento e backfill revisado sintético; nenhum backfill real executado |
| T18–T20 | Exploração sem produto, preservação de permissões, troca em serviços e deep link/editor no browser |
| T21 | Duas sessões de browser e múltiplos processos com revisão/uniqueness |
| T22 | UI/domínio sem SDK ou transmissão de analytics |
| T23/T25/T26 | Matriz automatizada de tamanhos, temas e movimento; capturas/vídeos |
| T24 | Radios/teclado/foco/reflow automatizados; leitor de tela real permanece pendência de aceite |
| T27 | Cohort imutável, execução de outra versão e política pura; não reimpor introdução |

AC-01–AC-15 têm provas no nível descrito por fase e cenário; AC-14 ainda requer o ensaio humano de tecnologia assistiva. V01–V08 têm implementação e evidências, com os deltas visuais declarados e sem aprovação de produto presumida.

### Artefatos

Em `artifacts/qa/onboarding/`: exports `reference/`, `browser-*.png`, `matrix-*.png`, `compare-{320,390,1440,1920}.{html,png}`, `comparisons.json`, `layout-measurements.json`, `contrast.json`, `card-motion.json`, `motion-performance.json`, `foundation.json`, `regressions.json`, `full-suite.json`, `acceptance.json` e `playwright.json`. Os vídeos de cada cenário ficam nos diretórios de `test-results/` apontados pelo relatório Playwright. São artefatos locais ignorados pelo git, com dados sintéticos.

As duas jornadas adicionais têm relatório `auth-browser.json` e saídas próprias em `auth-test-results/`. O teste de convite pós-introdução tem `pending-invitation-browser.json` e diretório próprio, preservando os 12 vídeos da matriz. `tests/e2e/signup.spec.ts` e o caso de novo convidado em `invitations.spec.ts` passaram a reconhecer explicitamente a introdução após a autorização; o helper de emissão foi atualizado para o `workspaceId` exigido pelo contrato atual. Não foi declarada execução de toda a suíte antiga de browser. O ensaio novo de convite respeita o intervalo de um segundo entre emails do provedor, sem desabilitar rate limits.

Comandos reproduzíveis (bancos/alvos sempre locais): `node node_modules/vitest/vitest.mjs run --maxWorkers=1`; `npm run lint`; `node node_modules/typescript/bin/tsc --noEmit --incremental false`; `LOTI_NEXT_DIR=.next-onboarding-release npm run build` com origem/segredo sintéticos, banco file explícito e email/R2 desabilitados; servidor `node --conditions=react-server --import tsx scripts/onboarding-qa-server.ts` com `LOTI_ONBOARDING_QA_PRODUCTION=1`; browser `node node_modules/playwright/cli.js test --config playwright.onboarding.config.ts`. No PowerShell, variáveis são atribuídas com `$env:NOME=...`, não com a sintaxe POSIX do exemplo de build.

O sandbox Windows negou sockets de loopback e criou EPERM em diretórios de build. Servidor/browser e a compilação final foram executados após revisão automática fora dessas restrições, com escopo local sintético. Houve ainda uma interrupção por limite de uso do revisor automático; a ação não foi executada naquele momento e foi retomada depois da liberação. Nenhuma proteção foi desabilitada, nenhum serviço remoto foi usado. O lint visual teve zero erros; advertências de eyebrow e sombras correspondem ao H3-C congelado, e a faixa de erro representa erro real. O heading de foco programático não é controle interativo; botões/radios mantêm foco visível.

## Fase 8 — handoff e decisão de release

Status: handoff entregue; produção não executada. A aprovação do resultado local não implica autorização de migrar/deployar.

Changelog: persistência de perfil/introdução/ajuda; elegibilidade pós-auth/convite; H3-C responsivo e motion; entradas reais; M1/M2 transacionais; reconhecimento preexisting revisável; ajuda recuperável; QA e evidências. Não há novo pacote, SDK, dashboard, cadastro, integração de importação, alteração financeira ou tema global.

### Ordem de rollout proposta, ainda não executada

1. Aprovar resultado local e deltas explícitos; resolver/aceitar conscientemente o baseline de testes; concluir ensaio humano de leitor de tela e revisão visual dos pares/vídeos.
2. Autorizar explicitamente o alvo remoto, backup, migrações, backfill real e deploy. Validar o plano em staging e registrar os responsáveis. Nenhuma credencial é necessária para revisar este handoff.
3. Fazer backup e aplicar **0032 e 0033** no alvo explicitamente autorizado, mantendo a versão anterior do app. Não aplicar migração no request lifecycle.
4. Preparar/revisar referências reais de preexisting, excluindo autoria ambígua/testes/seeds. Validar em cópia local autorizada. O CLI atual é deliberadamente local; uma execução remota exige ferramenta/plano e autorização próprios. Concluir o backfill comprovável antes de habilitar os hooks live, evitando classificar uma primeira ação pós-release como M1 de uma conta que já tinha evidência anterior.
5. Verificar FKs, unicidade e invariantes financeiros/logísticos; confirmar classificação de contas existentes e que não há introdução obrigatória para elas. Só então habilitar o código novo por deploy autorizado.
6. Smoke tests de ativação, convite, conta antiga, conta nova, pulo, criação real, troca de espaço e ajuda. A política automática já é restrita ao cohort novo; rollout percentual exigiria decisão/flag adicional, que não foi criada.
7. Se houver regressão, redeployar a versão anterior do app. Manter as tabelas aditivas e os registros; não fazer down migration destrutiva ou apagar evidências/dados de negócio. Investigar e corrigir antes de nova habilitação.

Analytics externo continua fora do release. Fornecedor, SDK, coleta, retenção, base legal e dashboards precisam de decisão específica. Qualquer proposta futura deve usar uma allowlist mínima e não exportar email, tokens, URLs de produto, QC, nomes, preços, quantidades ou dados de grupo. O domínio e a UI funcionam inteiramente sem isso.

### Escopo do diff e preservação do checkout

Arquivos novos principais: `src/lib/onboarding/*`, `src/components/onboarding/*`, `src/lib/domain/insert-evidence.ts`, rota `/api/onboarding`, migrações 0032/0033 e metadados, testes `onboarding-*`, configs Playwright específicas, CLI de backfill e servidor QA sintético. O chunk de layout autenticado compilado mediu 27.884 bytes sem compressão; inclui o shell e não representa um delta isolado do onboarding, porque há mudanças concorrentes nesse shell.

Integrações: layout autenticado; provider de workspace; Favoritos; Compra Atual; Perfil; factory e branches de insert dos serviços; endpoint `/api/app`. Nenhuma tela de Pedidos/Pacotes ou cálculo financeiro foi editado.

As mudanças preexistentes de `package.json`, scripts de dev, AppShell/sidebar, categorias de configurações, Enebinhas e demais diretórios concorrentes foram preservadas. O diff total desses arquivos não deve ser atribuído ao onboarding. Nenhum commit/reset, deploy, `.env`, segredo ou dado real foi alterado. Saídas temporárias geradas pelo build são removidas pontualmente do diff ao finalizar, sem restaurar alterações de terceiros.

Próximo gate: revisão e aprovação explícita do resultado local pelo responsável. O Gate 8 de produção continua separado e fechado.

## Diagnóstico posterior — 503 na conta demo Enebinha

Consulta somente de metadados confirmou que o banco configurado `loti-dev-arantesgabzz.aws-sa-east-1.turso.io` estava na migração `0031_referral_attributions`, sem as cinco tabelas de onboarding. Estão pendentes `0032_onboarding_state` e `0033_onboarding_milestones`. Nenhuma migração remota foi executada durante o diagnóstico.

O handler agora reconhece a ausência dessas tabelas e retorna `503 ONBOARDING_SCHEMA_REQUIRED`, com mensagem útil e log sanitizado, sem SQL ou identidade. Teste em memória removendo a tabela de marcos reproduziu o caso; os cinco testes HTTP passaram. Isso melhora o diagnóstico, mas não substitui aplicar as migrações no ambiente autorizado. A conta demo, criada por operador, permanece existente e acessa o H3-C manualmente pelo Perfil, sem mudar cohort, permissões ou dados sintéticos.
