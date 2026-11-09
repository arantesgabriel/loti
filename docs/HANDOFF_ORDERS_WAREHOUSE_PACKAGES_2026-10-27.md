# Handoff — Pedidos, armazém e pacotes

Data: 27/10/2026. Workspace: `C:\Fontes\loti`. Plano: `docs/39_ORDERS_WAREHOUSE_AND_PACKAGES_PLAN.md`.

## Objetivo do próximo agente

Finalizar a extensão aprovada do plano 39, conferir os pontos pendentes abaixo, concluir os gates técnicos e entregar a simulação para aceite humano. **Não considerar a extensão liberada nem todos os gates aprovados com base neste handoff.**

O usuário pediu expressamente este arquivo para outro agente finalizar. **Não abrir o reviewer Sol 6.1 high sem nova aprovação explícita do usuário.** Nenhum reviewer foi aberto para esta implementação. As revisões Sol anteriores trataram somente o incremento inicial do comparador/baseline, não as fases novas.

Não publicar, migrar produção, configurar serviços/secrets externos, criar commits ou PRs. Não copiar dados reais para fixtures. Não executar o one-shot como reconstrução do MVP. Ler AGENTS.md, PROMPT_ONE_SHOT.md, a sequência canônica e o plano 39; os planos financeiros/QC referenciados continuam válidos, salvo substituições explícitas do plano 39.

## Checkout e preservação

- HEAD observado no fechamento: `8509ccd` — `feat: implement Loti landing page and tool previews`. Não foi criado por este trabalho. O checkout avançou por outro trabalho durante a implementação.
- As alterações desta extensão estão no working tree e incluem arquivos novos ainda untracked. Não executar reset/clean, nem tratar apenas `git diff` como todo o escopo: examinar também `git status --short` e os arquivos untracked.
- Havia alterações independentes em autenticação/documentação, tsconfig/next-env, landing/planning e `reset-password.sh`. Preservá-las. Não atribuir todo o diff ao trabalho de Pedidos/Pacotes.
- `docs/39_ORDERS_WAREHOUSE_AND_PACKAGES_PLAN.md` já era um arquivo novo do planejamento. As referências em AGENTS/PROMPT tiveram autorização específica anterior.

## Implementado no working tree

| Área | Implementação |
| --- | --- |
| Baseline | Builder pelos serviços reais, quatro pessoas sintéticas, pagamentos, FIFO, dez refunds, oito correções e QC privado. Comparador exige baseline persistida v2 e protege snapshots/proveniência; nunca recaptura para mascarar diferenças. |
| Persistência | Migrations 0023–0028: posições, pacote por workspace/conta, reservas por índice estável, eventos, manifestos, comandos idempotentes, ponte de encargos legados, estados de cobrança e guards. |
| Finalização | Pedido/snapshots e cobrança de produto pendente, sem Pacote 1 ou reservas automáticas. Inicializador histórico é dependência explícita usada pelas fixtures pre-cutover. |
| Custos | Leitura de pedido dispensa cobertura por pacote. Consolidado soma pedidos líquidos + encargos próprios dos pacotes, sem adicionar bases herdadas novamente. Ponte imutável conserva inputs do rateio legado para o alocador canônico. |
| Armazém | Chegada parcial/correção motivada, conta explícita, seleção por unidades estáveis, reserva/retirada transacionais, CAS e idempotência. Não infere chegada de QC ou de estado legado. |
| Pacotes | Multi-compra da mesma conta, conteúdo fechado, cotação separada de pagamento, frete/Receita, manifesto, despacho/recebimento manual, peso pós-gate e encerramento/reabertura financeira. Correção explícita de cobrança preserva histórico e pede nova confirmação de pagamento. |
| Refunds/correções | Nova solicitação só alcança faixas sem reserva. Recebimento de solicitação legada continua possível. Substituição paga transfere posições/reservas abertas e QC; bloqueia dependências fechadas/enviadas. |
| UI | Pedidos global com filtros e seleção entre páginas, linhas de custos/QC reaproveitadas no detalhe, Pacotes independente, links legados redirecionados, desktop com seis destinos e ilha mobile com Mais. |
| QA | Bancos sintéticos separados, scripts explícitos, testes de conservação/migrations/serviços, oito disputas multiprocesso, rollback por trigger após escritas e Chromium claro/escuro em cinco larguras. |

Arquivos centrais: `src/lib/domain/warehouse-services.ts`, `warehouse-calculations.ts`, `logistics-package-services.ts`, `logistics-financials.ts`, `logistics-transaction.ts`; `src/components/orders/`; APIs `warehouse` e `logistics/packages`; alterações em inicialização, leitura/cálculo de custos, refunds e correções existentes.

### Estado dos gates do plano

| Gate | Estado da entrega |
| --- | --- |
| G0 | Baseline sintético, preservação e comparador implementados e exercitados. |
| G1 | Schema/cutover/backfill e upgrade exercitados; integração do verificador operacional ainda pendente. |
| G2 | Cálculos/ponte/manifestos implementados; finalizar os pontos de consolidado/ownership e apresentação das parcelas próprios abaixo. |
| G3 | Ciclo logístico implementado, com testes de estado, rollback e disputa; revalidar após alterações do próximo agente. |
| G4 | Refunds, recebimentos legados, substituições e transferência QC exercitados. |
| G5 | Fluxos principais e responsividade exercitados; apresentação financeira detalhada do pacote ainda precisa de fechamento. |
| G6 | Cargas e roteiro disponíveis; aceite humano não obtido. |
| G7 | Handoff/runbook entregues; validação operacional ampliada, conferência final e reviewer condicionado à aprovação ainda pendentes. |

## Pontos que o próximo agente deve finalizar

1. **Distribuição financeira na UI de Pacotes.** O manifesto persiste `charges` com parcelas por unidade/pessoa, mas a interface mostra detalhadamente apenas as parcelas herdadas dos itens. Apresentar também frete, taxa e Receita por item/pessoa; a ponte legada está em `legacyProjections`. Manter distinção entre prévia em montagem e rateio capturado. Não adicionar fotos aos novos cards de pacotes.
2. **Consolidado e ownership da ponte.** Em `logistics-financials.ts`, conferir leitura consistente durante escritores concorrentes e somas com limites seguros. Testar a sequência de cobrança legada conhecida → novo valor informado → voltar a pendente: o ownership atual usa o estado `pending` para decidir se a ponte legada está ativa, podendo exigir um marcador explícito de substituição para não reativar um valor histórico inadvertidamente.
3. **Verificação operacional.** `scripts/verify-database.ts` ainda verifica o conjunto anterior. Acrescentar tabelas/índices/guards logísticos e invariantes de reserva/cancelamento, sem executar o script contra `.env`/destino real implicitamente. Separar um verificador reutilizável da CLI se necessário; o runner QA deve validar o destino sintético antes de importar conexões.
4. **Limites e paginação.** A API pagina a resposta de Pedidos e enriquece financeiramente só as origens visíveis. Ainda reúne posições/reservas/metadados do workspace antes de filtrar (posições limitadas a 10.000). Rever o custo da consulta e o limite de pacotes; não quebrar seleção entre páginas ou validação de toda a seleção na transação.
5. **Cobertura das últimas ações.** Executar testes da correção explícita de cobrança, reabertura financeira e confirmação de conteúdo legado sem data histórica. O último teste de fluxo recebeu a correção de cobrança no fechamento desta entrega; conferir o resultado final registrado abaixo. Ampliar o caso legado enviado/recebido com data desconhecida, sem fabricar pagamento ou despacho.
6. **Regressão final e documentação.** Reexecutar build/typecheck/lint/testes após qualquer correção do próximo agente, atualizar resultados e a matriz do plano 39. O aceite humano da simulação segue pendente. O reviewer externo segue condicionado à aprovação do usuário.

Esses pontos são parte da finalização autorizada; não exigem autorização por fase. Produção e reviewer continuam com seus gates separados.

## Testes e problemas observados

- `artifacts/qa/orders-transition/orders-final-tests.log`: execução anterior com **491 aprovados, sete ignorados**, 76 arquivos aprovados e um ignorado. Houve alterações posteriores; essa contagem não certifica o código final.
- `new-workflow-qa.spec.ts` passou em Chromium: cotação sem pagamento → conteúdo fechado → frete pago → peso → Receita isenta → fechamento financeiro → despacho → recebimento. Screenshots em `artifacts/qa/orders-transition/new-package-*.png`.
- `legacy-qa.spec.ts` e `navigation-qa.spec.ts` passaram anteriormente com QC privado, links legados, cinco destinos mobile e temas/larguras. Reexecutar após as últimas alterações de apresentação.
- O teste multiprocesso inicialmente expôs `SQLITE_BUSY` e falha nativa Windows `3221225477` com pools embutidos concorrentes. O harness agora usa WAL e uma conexão por ator/observador; a configuração é injetada em `openDatabase`, sem alterar o default de produção. As disputas continuam ocorrendo entre processos independentes. Contenção limitada pode retornar `LOGISTICS_BUSY`; o teste de correção de recibo verifica a recuperação com **a mesma chave**, depois que o outro processo encerra.
- Após esse ajuste, oito casos de disputa e três testes de cálculo passaram juntos (**11 aprovados**). O cálculo também verifica margens por unidade/pessoa e floor/ceiling de cada parcela, evitando atribuir vários centavos residuais à mesma célula.
- A disputa financeira preexistente de confirmação idêntica foi corrigida concentrando autorização e recibo na transação de `purchase-order-corrections.ts`; houve execução completa aprovada depois dessa correção.
- `npm run typecheck` encontrou sintaxe corrompida em tipos gerados de outro `.next` ativo. Não apagar ou sobrescrever caches de outros trabalhos. `tsconfig.orders-transition.json` e `npm run typecheck:orders-transition` isolam esta validação; o build QA também seleciona esse config.
- A revisão automática chegou a impedir um comando por limite de uso. O horário de renovação passou e as execuções voltaram a ser autorizadas. Não houve rejeição de segurança do teste nem tentativa de contornar a revisão.

Resultados da última execução deste handoff são registrados ao final deste arquivo. Logs de falhas anteriores permanecem como diagnóstico, não como evidência de aprovação.

## Bancos e comandos seguros

Ver instruções completas e propriedade de custos em `docs/testing/ORDERS_TRANSITION_EXECUTION.md`.

- Legado migrado: `data/orders-transition-implementation-v2.sqlite`; baseline original ao lado em `.baseline.json` e marker em `.scenario.json`. Reaplicar **explicitamente** o upgrade para levar o cenário às migrations mais recentes antes de navegar.
- Novo fluxo humano: `data/orders-transition-newflow-final.sqlite`. Foi criado antes do último guard 0028; preparar preferencialmente outro arquivo novo para finalizar a validação, sem sobrescrever este.
- `orders-transition-browser-01.sqlite` e `orders-transition-browser-02.sqlite` foram alterados pelos testes UI; não são o estado inicial para aceite.
- Não há garantia de servidor ativo. Os servidores de QA foram parados antes dos testes finais; iniciar um único processo em localhost:3139.
- Credenciais **somente sintéticas**: `pessoa-a@loti.test` / `Loti-Orders-QA-Only-2026!`. Pessoas B/C/D usam emails equivalentes.

```powershell
npm run dev:compare:orders-transition -- --database file:./data/orders-transition-implementation-v2.sqlite
npm run dev:upgrade:orders-transition -- --database file:./data/orders-transition-implementation-v2.sqlite

# Escolher nome ainda inexistente, sem apagar ou reaproveitar dados do usuário.
npm run dev:seed:orders-workflow -- --database file:./data/orders-transition-handoff-<id>.sqlite
npm run dev:orders-transition -- --database file:./data/orders-transition-handoff-<id>.sqlite

npm run typecheck:orders-transition
npm run lint
npm test -- --maxWorkers=1 --testTimeout=30000
node --import tsx scripts/build-orders-transition.ts --database file:./data/orders-transition-handoff-<id>.sqlite

$env:LOTI_ORDERS_TRANSITION_DATABASE='file:./data/orders-transition-handoff-<id>.sqlite'
npx playwright test --config playwright.orders-transition.config.ts new-workflow-qa.spec.ts
```

O comparador só aceita o cenário legado com baseline válida; não aplicá-lo ao novo fluxo, que tem outras âncoras. Os scripts recusam destinos remotos, tokens e credenciais externas. Nenhuma migration deve rodar no startup/request. Não usar o E2E server genérico, que tem outro banco/porta.

## Critério de encerramento pelo próximo agente

Concluir os pontos pendentes, provar quantidades/centavos/pessoas/ledger/QC, executar a matriz atualizada e entregar o ambiente concreto para aceite. Solicitar autorização do reviewer somente quando o usuário decidir abri-lo. Não afirmar produção migrada, liberação aprovada ou aceite humano sem evidência.

## Última validação desta entrega

- Suíte completa do estado entregue: **500 testes aprovados, sete ignorados; 77 arquivos aprovados e um ignorado**, saída zero. Comando: `npm test -- --maxWorkers=1 --testTimeout=30000`. Evidência: `artifacts/qa/orders-transition/handoff-final-tests.log`.
- Typecheck isolado e lint: **aprovados**, saída zero. Evidências: `handoff-typecheck.log` e `handoff-lint.log` na mesma pasta.
- `git diff --check`: sem erros de whitespace; o Git informa apenas normalização LF/CRLF em alguns arquivos.
- Build isolado: **aprovado**, saída zero, com `tsconfig.orders-transition.json` e `.next-orders-transition-build`. Evidência: `handoff-build.log`.
- Upgrade do último guard e comparação do legado: **aprovados**, `passed: true`, `failures: []`; baseline original preservada e `productionTouched: false`. Evidências: `handoff-upgrade.log` e `handoff-comparison.log`.
- Esta etapa está encerrada e entregue ao próximo agente. Os checks aprovados não dispensam os pontos de finalização e o aceite/reviewer descritos neste handoff. Nenhum commit, PR, deploy ou migration de produção foi executado.


## Aditivo de finalizacao - 27/10/2026

As pendencias desta entrega foram retomadas e tratadas. O estado atualizado, evidencias, gates e comandos estao em [ORDERS_TRANSITION_FINALIZATION.md](testing/ORDERS_TRANSITION_FINALIZATION.md). Este handoff permanece como registro da etapa anterior; suas contagens e lista de pendencias nao substituem o relatorio final. Aceite humano e reviewer continuam pendentes; producao nao foi alterada.
