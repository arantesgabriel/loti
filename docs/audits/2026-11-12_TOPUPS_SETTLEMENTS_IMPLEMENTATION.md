# Recargas e acertos — execução local parcial

Data: 12/11/2026. Contrato: `docs/47_TOPUPS_PACKAGE_FUNDING_AND_SETTLEMENTS_PLAN.md`.

## Estado real da entrega

A execução começou pela fase 0. **As seis funcionalidades ainda não estão implementadas de ponta a ponta.** Os módulos novos são cálculos puros, sem chamadas pelas telas, APIs ou serviços de escrita existentes. G0 permanece parcial: falta o baseline persistido descartável e o ensaio completo de compatibilidade. Fases 1–10 estão pendentes.

Nenhum schema, migration, ledger, pagamento, direito individual, compra finalizada, QC, serviço externo ou dado real foi alterado. A ausência de acesso a produção não é um bloqueio desta implementação local. Não há necessidade de nova autorização entre as fases locais.

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
