# Recargas e acertos — implementação e revisão local

Data: 12/11/2026. Contrato: `docs/47_TOPUPS_PACKAGE_FUNDING_AND_SETTLEMENTS_PLAN.md`.

## Estado real da entrega

O checkpoint solicitado foi registrado em `ad6b412` (`feat: add typed topup ledger transactions and migration guards`), após `2ea5585`. A continuação implementou F1–F6 com serviços, rotas, formulários, prévias, históricos, correções, recebimentos e ambiente sintético navegável. O roteiro operacional é `docs/48_TOPUPS_FREIGHT_SETTLEMENTS_REVIEW.md`. Os registros anteriores abaixo descrevem os checkpoints históricos; suas pendências foram tratadas pela continuação documentada ao final.

Migrations 0034–0037 foram ensaiadas somente em bancos sintéticos descartáveis. Nenhum serviço externo ou dado real foi alterado. Publicação, migration remota e aceite humano não foram realizados.

## Código entregue

| Arquivo | Contrato executável |
| --- | --- |
| `src/lib/domain/hubbuy-topup-calculations.ts` | Inversão exata de total com taxa, discriminação de comprovante, financiadores independentes, validação de somas, par sem taxa, capacidade cumulativa de taxa e atribuição explícita limitada |
| `src/lib/domain/package-freight-calculations.ts` | Unidades físicas únicas, ordem explícita, pesos capturados, margens fonte/unidade/pessoa, moedas/componentes separados e independência da composição de fontes sobre a obrigação dos beneficiários |
| `src/lib/domain/package-settlement-calculations.ts` | Obrigações diretas com origem, posições assinadas, piso matemático para negativos, conversão balanceada de soma zero e compensação explicitamente selecionada |
| `scripts/verify-topups-settlement-contract.ts` | Ensaio puro sintético com 30 unidades, seis compartilhadas A/C/D e as âncoras CNY/BRL do plano; sem dotenv, banco ou serviço externo |
| `tests/unit/topups-settlements.test.ts` | Comprovante, capacidade, conversão, obrigações diretas, credores, limites e propriedades determinísticas |
| `tests/unit/package-freight-calculations.test.ts` | Unidades, compartilhamento, margens exatas, fontes independentes e invariância à ordem de entrada |

Compensação por pares (`pairwise_netting`) também exige escolha explícita. Ela não representa o modo sem compensação: esse modo conserva as obrigações de `directSettlementClaims()`, incluindo pares opostos. A conversão de um vetor compensado não deve ser reutilizada como conversão independente de cada obrigação direta.

## Inventário de integração revalidado

| Ponto | Situação e próximo trabalho |
| --- | --- |
| `hubbuyBalanceServices()` / `calculateHubBuyBalanceState()` | Reconstrução do ledger, direitos e sequência existentes; integrar recarga tipada e consumo de frete na mesma transação, sem usar ajuste genérico |
| `purchase-cost-order-services.ts` / `recordMixedPaymentInTransaction()` | Consumo de pedidos existente; novos consumos de recarga também precisam atribuir taxa e preservar suas capacidades |
| `package-cost-services.ts` / `settleAdditionalOrderAdvance()` | Fonte independente dos adiantamentos antigos; não quitar esses registros pelo acerto de pacote |
| `logistics-package-services.ts` / `execute()` | Writers `record_charge`, `pay_charge`, `correct_charge` atuais não representam financiamento com carteira; adicionar dispatcher e proteção de abas antigas antes de habilitar o protocolo novo |
| `logistics-package-services.ts` / `manifest()` | Parser aceita somente versão 1; adicionar versão financeira nova e preservar leitor V1 |
| `logistics-financials.ts` / `packageChargeOwnership()` | Propriedade atual legado/escalar; o terceiro modo precisa substituir apenas o escopo correspondente, sem somar o frete duas vezes |
| `hubbuyBalanceEntries.sourceType` | CHECK/enum ainda não contém `topup`/`package_freight_payment`; migration precisa preservar todos os guards posteriores, não apenas reconstruir o DDL de 0008 |
| `hubbuyBalanceConsumptions.paymentAllocationId` | Vínculo atual com alocação de pedido; frete exige relação própria e nenhum pedido fictício |
| `authorization.ts` | Operações pessoais usam acesso/contexto ativo; acertos entre pessoas exigirão contexto compartilhado e validação de todas as partes |
| `drizzle/meta/_journal.json` | Última migration observada: `0033_onboarding_milestones`; revalidar próximo índice ao iniciar a fase 1 |

## Contrato sintético e arredondamento

Executar `node --import tsx scripts/verify-topups-settlement-contract.ts`.

Ordem física persistida do ensaio: nove unidades de A, oito de B, duas de C, cinco de D, seis compartilhadas igualmente por A/C/D. Equivalências 11/8/4/7; total físico 30. Pessoas, IDs e fontes são sintéticos.

| Grandeza | A / B / C / D, em unidades monetárias mínimas |
| --- | --- |
| Obrigação frete CNY | 28182 / 20496 / 10248 / 17934 |
| Posição principal CNY | -25877 / 18598 / -3646 / 10925 |
| Principal convertido BRL | -22670 / 16293 / -3194 / 9571 |
| Taxa por matriz física BRL | 130 / 96 / 46 / 77 |
| Posição final BRL da matriz física | -22889 / 16389 / -3148 / 9648 |
| Taxa do exemplo agregado §16.1 | 128 / 93 / 47 / 81 |
| Posição final do exemplo agregado §16.1 | -22891 / 16386 / -3147 / 9652 |

A matriz física primeiro distribui 349 pelas 30 unidades: as primeiras 19 recebem 12, as demais 11. Os totais por origem física são 108/96/24/55/66; a última origem compartilha 22 para A/C/D. Logo 130/96/46/77. Esse expected é derivado independentemente, não ajustado para igualar o exemplo agregado. Ambos os exemplos fecham em zero; não intercambiar suas margens. O ensaio preserva ordem explícita e não depende de nome ou DOM.

Comprovante: 34893 principal + 349 taxa = 35242 BRL cents; 39830 CNY recebidos. Consumo 39826 CNY, base 34889 BRL, sobra 4 CNY/base 4 BRL. Custo histórico do frete: 28868 + 34889 + 349 = **64106 BRL cents**. Esse custo não deve ser somado às transferências entre pessoas.

## Validação executada

- `npm run typecheck`: passou no baseline, após os três módulos iniciais e após o script/contrato de pares diretos.
- `npm run lint`: passou após os três módulos iniciais; ESLint direcionado dos seis arquivos novos de código/testes também passou após o script/contrato de pares diretos.
- Suíte focada inicial com helpers existentes: **27 passaram em 5 arquivos**.
- `npm run test:unit -- --maxWorkers=1 --pool=threads`: **271 passaram em 41 arquivos**, antes da inclusão do teste de pares diretos.
- Suíte focada após pares diretos e correção das margens por fonte: **15 passaram em 2 arquivos**.
- Script de contrato sintético: passou, com os valores da matriz física acima.
- Primeira execução da suíte ampla retornou código 1 sem diagnóstico no transporte; não é evidência de aprovação nem de falha específica de domínio. A repetição com relatório JSON não produziu relatório nem saída de conclusão durante a espera e foi interrompida. Gate global permanece não validado.
- Repetição final da suíte focada: **15 passaram em 2 arquivos** após a validação explícita de campo opcional de taxa.
- `git diff --check`: passou, com avisos de normalização LF/CRLF dos arquivos de configuração preexistentes.

Build, E2E, ensaio navegável, novas migrations, upgrade populado, falhas injetadas e concorrência da extensão **não estão validados**. Cálculos puros aprovados não constituem aprovação desses gates.

## Continuidade obrigatória

Concluir G0 com baseline descartável, depois executar fases 1–10 do plano. Implementar persistência e guards, serviços/transações, APIs, interfaces de prévia/confirmacão, histórico/correções, integração da taxa nos pedidos, versões de manifesto, recibos e capacidades. Depois entregar carga navegável, E2E, QA visual e runbook. Não declarar F1–F6 prontas com base nestes módulos.

Preservar alterações prévias observadas: `docs/INDEX.md`, `next-env.d.ts`, `tsconfig.json`, plano 47 não rastreado, `reset-password.sh` e `tmp/`. Não atribuir esses arquivos à execução atual nem revertê-los.

## Continuação autorizada: commit e início da persistência de F1

Pedido: efetuar o commit da primeira entrega e iniciar F1–F6. Commit realizado: `2ea5585` (`feat: add topup and freight settlement calculation contracts`), somente com os sete arquivos produzidos na primeira entrega. O plano 47 e demais alterações preexistentes foram mantidos fora desse commit. As mudanças descritas nesta seção são posteriores a ele.

Entregas iniciadas:

- Migration `0034_topup_financing_foundation.sql`, snapshot e journal: origem `topup` no ledger, origem reservada para o pagamento tipado de frete, tabelas de recarga/financiadores/anulações, índices e guards de imutabilidade, escopo, capacidade e referência externa. A migration não cria lançamentos monetários.
- Reconstrução do ledger preserva os 103 gatilhos anteriores. O guard de parcelas foi deliberadamente adaptado depois da restauração: titular no espaço pessoal, membership no compartilhado. Os demais 102 foram comparados literalmente no teste de upgrade.
- `hubbuyTopupServices()`: prévia sem escrita, recarga com comprovante discriminado ou total percentual, financiadores separados do autor, taxa fora da base histórica, checagem de contexto ativo, revisão/CAS, idempotência, referência duplicada e reversão compensatória de registro incorreto sem consumo.
- Resposta de commit incerta: consulta a operação persistida somente depois de reautorizar conta/contexto e comparar tipo/hash. Nenhum sucesso é inferido apenas pelo valor do saldo.
- Rota autenticada `POST /api/hubbuy/accounts/[accountId]/topups`, com envelope estrito, origem confiável e respostas privadas. Operações `preview`, `record`, `reversal.preview`, `reverse`.
- Leitura de direitos identifica a origem como **Recarga**. O verificador inclui tabelas, guards e margens crédito/comprovante/financiadores.

Verificações executadas nesta continuação:

- Integração F1: sete cenários, incluindo espaço pessoal sem membership, financiador diferente do autor, taxa financiada por outra pessoa, idempotência, isolamento, anulação, consumo dependente, referência cruzada com ajuste antigo e rollback após escrita parcial.
- Upgrade populado/reaplicação: dados antigos exatos, gatilhos preservados e zero violações FK. O teste também injeta falha após DDL para verificar rollback da migration.
- Concorrência em processos independentes: mesma chave recupera uma única operação; chaves diferentes com a mesma revisão permitem somente uma gravação.
- Execução dirigida conjunta de cálculo/origens/rastreabilidade/recarga/migration/concorrência: **35 testes passaram em sete arquivos**.
- Typecheck e lint passaram após a implementação do serviço e da suíte de concorrência.
- O ensaio de migration com falha de DDL foi repetido isoladamente: **1 teste passou**, incluindo rollback, upgrade e reaplicação.
- Migration explícita e `scripts/verify-database.ts` em arquivo SQLite novo descartável: `status: ok`, 54 tabelas verificadas, 74 guards financeiros requeridos, zero violações FK; logística: sete tabelas, 36 guards, oito índices e oito invariantes.
- Build Next.js passou em `.next-topup-foundation`, com banco em memória, segredo sintético efêmero e credenciais externas desabilitadas. Configurações `tsconfig.json` e `next-env.d.ts` foram preservadas byte a byte antes/depois do comando.
- Fronteira HTTP: **9 testes passaram**, cobrindo quatro comandos, origem inválida, falta de sessão e envelope indevido; nenhuma chamada de serviço nos casos rejeitados.
- Regressão executada por arquivo: contas **7/7**, ajustes **5/5**, origens **5/5**, créditos de refund **10/10**, fluxo pessoal de pedidos/armazém/pacotes **1/1**, finalização logística **12/12**. As tentativas conjuntas ficaram sem conclusão ou encerraram sem resumo; não foram consideradas aprovação. As repetições isoladas acima terminaram com código zero e resumo completo.
- ESLint direcionado final dos serviços/schema/testes/verificador passou. `git diff --check` passou.

Estado naquele checkpoint: faltavam formulários, históricos e integração F2–F6. Essa descrição é histórica e não representa a continuação abaixo.

## Continuação F1–F6

| Frente | Implementação |
| --- | --- |
| F1 | Formulário e histórico paginado; total com taxa ou discriminação; financiadores separados do autor; crédito e taxa separados; reversão compensatória. Novos pedidos adicionais atribuem a taxa com prévia/aceite e preservam dinheiro novo separado. |
| F2 | Saldo por titular e lotes, FIFO, fontes externas/mistas/BRL, baixa tipada sem compra artificial, revisão de conta/pacote, confirmação cruzada, compensação, correção e adoção de débito legado sem outra baixa. |
| F3 | Matriz fonte/unidade/pessoa por moeda/componente, fontes independentes das margens dos beneficiários, células persistidas e consulta paginada. Leitores de logística adicionam o encargo uma única vez. |
| F4 | Claims diretas com genealogia ou centralização explicitamente escolhida; posições assinadas; versões imutáveis; deltas preservam recebimentos anteriores. |
| F5 | Par explícito da recarga sem taxa ou manual com data/motivo; conversão BigInt de vetor zero-sum; sem reavaliação de bases antigas; recebimento BRL bloqueado sem conversão. |
| F6 | Recebimentos reais parciais/totais, distribuição entre claims do mesmo par, capacidade transacional, excesso explícito, devolução real, anulação e histórico. Nenhuma baixa altera saldo HubBuy. |

Migrations 0035–0037 acrescentam tabelas de resultados idempotentes, financiamento, fontes, parcelas, taxa/destinos, versões/claims/recibos e devoluções reais. O verificador adiciona 17 tabelas, 32 guards de imutabilidade e oito invariantes de margens/capacidades. Os dois guards antigos de pagamento/refund foram adaptados deliberadamente para titular pessoal ou membership compartilhado, mantendo suas checagens anteriores de capacidade e escopo.

O protocolo bloqueia writers antigos após adoção detalhada. Devolução observada de frete permanece separada de anulação de registro. Crédito devolvido com consumo posterior impede reversão simples. Acertos emitidos antes de uma alteração de conteúdo/frete/refund ou de anulação de recibo herdado exigem revisão antes de novas baixas.

Respostas incertas conservam a chave/comando na sessão. A recuperação reautoriza recurso/contexto e exige hash idêntico da operação persistida. O teste entre processos encontrou `LOGISTICS_BUSY` depois de uma gravação concorrente já confirmada; a recuperação foi corrigida para consultar esse resultado durável sem repetir a baixa.

Correções realizadas durante os gates: guarda de funder compensatório; capacidade de devolução de excesso já herdado por revisão; hash de migrations com quebras de linha uniformes; leitura de pacote temporariamente vazio; ocultação dos botões legados incompatíveis; preservação de confirmação de taxa e tentativa de pagamento adicional. A distribuição de financiadores da taxa usa sua capacidade restante, evitando redução de uma parcela anterior ao recalcular maior resto cumulativo.

## Evidências da continuação

- Suite unitária: **300 testes passaram em 43 arquivos**.
- Regressão de integração sequencial: **374 testes passaram em 67 arquivos**; um arquivo/sete testes legados ignorados por exigirem planilha privada, conforme configuração existente. Comando: `vitest run tests/integration --maxWorkers=1 --testTimeout=30000 --reporter=verbose`.
- Novos serviços: oito cenários completos, incluindo espaço pessoal, misto/BRL direto, rollback após ledger/financiamento, replay/isolamento, excesso/retorno/revisão, concorrência entre processos, taxa repartida entre frete e pedido, correção depois de recibo e devolução real. Todos passaram na execução dirigida.
- Fronteira HTTP de finanças: 19 testes cobrem as 16 operações, sessão, origem, envelope estrito e ausência de acerto no espaço pessoal. Incluídos no total unitário.
- Upgrade populado, interrupção e reaplicação preservam as linhas protegidas e FKs. O teste reconhece explicitamente os três guards adaptados para proprietário pessoal.
- Leitura de chaves de custo: 15 construções SELECT no lote contra 96 lendo quatro trackings separadamente; na execução dirigida, 5,3 ms contra 23,4 ms. São medições locais desse teste, não garantia de latência de produção.
- O primeiro ensaio completo de navegador confirmou recarga, recuperação de resposta perdida, frete R$ 641,06 e emissão/conversão. O ensaio de recebimentos confirmou quatro registros e todas as três obrigações acertadas, com saldo CNY 0,04 e base R$ 0,04. Verificador: zero violações FK e oito invariantes financeiras novas aprovadas.
- Screenshots foram inspecionadas; o painel financeiro foi reposicionado após o resumo/etapas para respeitar a hierarquia mobile existente. Não foram adicionadas fotos operacionais ou animações.
- Gate final: typecheck, lint e build Next.js passaram. O ensaio integral em `freight-review-complete.sqlite` passou em 13,9 segundos no build final: cancelar sem gravação, resposta perdida/replay, conflito real de revisão de conteúdo, nova prévia, F1–F6, consulta de parcelas e quatro recebimentos. O teste auxiliar de retomada de recibos ficou intencionalmente ignorado nessa execução, pois todos os recibos já são cobertos pelo roteiro integral.
- Comparador final: uma recarga, duas versões de acerto, quatro recebimentos, custo histórico R$ 641,06, saldo CNY 0,04/base R$ 0,04, todas as claims com aberto zero, FKs e margens aprovadas. A fixture está disponível na porta 3147, pacote `f445e31a-c52f-44ff-b652-5357ad02fb25`. O banco/manifesto descartável fica em `data/freight-review-complete.sqlite`.

Relatórios locais: `artifacts/freight-review-regression-final.log`, `artifacts/freight-review-new-services.log`, `artifacts/freight-review-verification.json`, screenshots/traces em `artifacts/freight-review`. Esses artefatos descartáveis não contêm dados reais e ficam fora do commit.

## Operação e limites

O roteiro 48 documenta seed, servidor isolado na porta 3147, credenciais sintéticas, comparador independente de margens por unidade, teste de navegador e cutover/recuperação futura. O comparador principal exige as 30 unidades e valores de referência; experimentos de correção precisam de outra fixture para não confundir a comparação com o roteiro original.

O valor individual da taxa deriva da ordem persistida das unidades e de seus pesos, não do exemplo agregado. As obrigações CNY e o custo total permanecem as âncoras exatas. O relatório do comparador mostra a margem efetivamente persistida e confere uma segunda implementação independente do rateio da taxa.

Aceite humano pendente. Produção e dados reais não foram usados.
