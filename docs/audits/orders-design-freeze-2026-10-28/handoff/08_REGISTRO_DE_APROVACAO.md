# Registro de execução e aprovações — Pedidos Loti

> Modelo para manter no repositório como documento vivo durante a implementação. O agente deve preencher evidências, não substituir **“PENDENTE”** por **“APROVADO”** sem mensagem explícita de Gabriel.

## Baseline congelada

- Arquivo visual: `Loti Design System`, Penpot `64ee36db-f4d2-8047-8008-dbff2f7d7205`.
- Versão: `DESIGN FREEZE · Pedidos Loti · 04A/04B · Desktop + Mobile · 28-10-2026`.
- Escopo: **Pedidos**, componentes/ações diretamente relacionados; **Pacotes** preservado.
- Validação estrutural do Penpot no freeze: **zero erros**.
- Versão do código: branch `feat/orders`, SHA `2f547155ea31d67fa86978cca7e53329c1f05918`.

## Aprovações

| Fase | Status inicial | Evidência / PR / SHA | Data / aprovação de Gabriel |
| --- | --- | --- | --- |
| **0 · Descoberta** | AVANÇO PARA F1 AUTORIZADO; LIMITES REGISTRADOS | [Relatório F0](../FASE_0.md) | 28/10/2026: “prossiga pra fase 1” |
| **1 · Fundação visual** | AVANÇO PARA F2 AUTORIZADO | [Relatório F1](../FASE_1.md) | Gabriel: “prossiga para a proxima fase”, após entrega da F1 |
| **2 · Listagem + filtros** | AVANÇO PARA F3 AUTORIZADO | [Relatório F2](../FASE_2.md) | 29/10/2026, Gabriel: “prossiga para a proxima fase”, após entrega da F2 |
| **3 · Detalhe único 04B** | ENTREGUE PARA APROVAÇÃO | [Relatório F3](../FASE_3.md) | 29/10/2026, início autorizado pela mensagem acima; aceite da entrega pendente |
| **4 · Preparação 04A + montagem** | BLOQUEADA POR F3 | — | — |
| **5 · QC JSON em lote** | BLOQUEADA POR F4 | — | — |
| **6 · Demais ações** | BLOQUEADA POR F5 | — | — |
| **7 · QA e handoff** | BLOQUEADA POR F6 | — | — |

## Template de registro de fase

### Fase [N] — [nome]

- **Data/hora:** [ ]
- **Branch / SHA / PR:** [ ]
- **Fase aprovada para iniciar por Gabriel?** [mensagem/link/data exata]
- **Blocos executados:** [ ]
- **Frames Penpot comparados:** [ ]
- **Arquivos afetados:** [ ]
- **Testes executados e resultado:** [ ]
- **Evidências desktop:** [ ]
- **Evidências mobile:** [ ]
- **Divergências do freeze:** [nenhuma / detalhes + decisão]
- **Riscos / pendências:** [ ]
- **Decisão de Gabriel:** [APROVADO / SOLICITADAS CORREÇÕES / REJEITADO / NÃO RESPONDEU]
- **Mensagem/data da decisão:** [ ]
- **Próxima fase liberada?** [SIM somente com aprovação explícita]

## Controle de mudanças ao design congelado

| ID | Desvio solicitado | Frame(s) afetado(s) | Justificativa | Impacto/risco | Decisão de Gabriel |
| --- | --- | --- | --- | --- | --- |
| — | Nenhuma mudança autorizada no freeze inicial | — | — | — | — |

**Regra:** alterações de requisitos devem ganhar ID e decisão explícita; não substituir silenciosamente o Penpot de referência. Se Gabriel aprovar uma nova versão visual, registrar novo marcador no histórico e atualizar estas referências antes da próxima fase.

## Execução Fase 0 — 28/10/2026

- Início autorizado pelo prompt mestre anexado por Gabriel; somente diagnóstico.
- Penpot: arquivo correto, rótulo freeze presente, seis exports reais inspecionados das revisões atuais 132/133. Igualdade com snapshot histórico não comprovada; não foi usado restore.
- Gabriel reativou a aba suspensa e autorizou prosseguir com a inspeção. Essa mensagem não libera Fase 1.
- Código: rotas, entidades, filtros, concorrência, montagem, QC e integrações mapeados no relatório.
- Checks: lint/typecheck/build passaram; build precisou de retry por EPERM. 24 unitários e 49 integrações direcionadas passaram. Suíte completa falhou no runner/arquivos temporários e depois não produziu relatório final (processo retornou 0xC0000005); não declarar baseline global verde. E2E não executado nesta auditoria.
- Mudanças: documentação e logs; includes automáticos do tsconfig retirados. `next-env.d.ts`, já modificado ao iniciar, foi regenerado pelo Next para o build isolado; não foi possível garantir preservação byte a byte da versão inicial. `reset-password.sh` intacto. Nenhuma implementação, migration de ambiente, commit, PR ou publicação.
- Decisão de Gabriel: **PENDENTE**.
- Próxima fase liberada: **NÃO**. Requer aprovação e referência histórica consultável, conforme relatório.

## Execução Fase 1 — 28/10/2026

- Autorização humana: **“prossiga pra fase 1”**. Essa mensagem autoriza a implementação delimitada da F1; não autoriza F2 nem equivale a uma afirmação sobre o conteúdo histórico do Penpot.
- Entregue: container/tokens/fonte locais, painel desktop em grid, bottom sheet inferior, tooltip/badges/feedback, retorno de foco e harness sintético.
- A tela atual usa o container; os novos painéis não recebem dados reais nesta fase, conforme roadmap 1.3. Nenhuma nova API/migration/regra financeira.
- Validações: lint/typecheck/build passaram, 12 cenários Chromium passaram, assert geométrico adicional passou, 73 testes Vitest direcionados passaram; tela real capturada em cinco larguras, sem erro JavaScript ou POST de domínio e com sidebar preservada.
- Evidências, arquivos, divergências por fase e riscos no relatório F1. Metadados gerados pelo build restaurados ao início desta fase; trabalho preexistente preservado.
- F1 aprovada por Gabriel? **PENDENTE**.
- F2 liberada? **NÃO**. Aguardar aprovação explícita.

## Atualização após entrega da F1

- Gabriel enviou **“prossiga para a proxima fase”**. Essa mensagem libera a F2 após a entrega da F1, substituindo a pendência de avanço registrada acima. Não libera fases posteriores nem comprova igualdade entre a revisão atual do Penpot e o snapshot histórico.

## Execução Fase 2 — Listagem e filtros

- Autorização humana: **“prossiga para a proxima fase”**.
- Entregue: cinco colunas, composição mobile, busca, tabs, filtros cumulativos, URL, paginação real, estados de requisição e seleção preservada. Detalhe inline permanece até a F3; preparação atual até a F4.
- Penpot: leitura da revisão 133 e frames desktop/M01/M02; limite de proveniência histórica preservado no relatório.
- Validações finais: 14 cenários Chromium, 82 testes Vitest direcionados executados isoladamente, lint, typecheck, build e diff passaram. Comando combinado Vitest apresentou falha nativa Windows; não declarar suíte global verde.
- Prévia: http://localhost:3142/orders, exclusivamente com cópia de fixture sintética de 27 linhas. Nenhuma migration de ambiente, dado real, commit, PR ou deploy.
- Evidências, arquivos, riscos e aceite por critério: [Relatório F2](../FASE_2.md).
- Decisão de Gabriel sobre a entrega F2: **PENDENTE**.
- F3 liberada? **NÃO**. Aguardar aprovação explícita.

## Atualização após entrega da F2 — 29/10/2026

- Gabriel enviou **“prossiga para a proxima fase”** após o relatório da F2 e a pergunta de aprovação para F3. Essa mensagem libera somente a F3 e substitui a pendência de avanço registrada acima.
- O Penpot foi reconectado após Gabriel responder **“abri”**. Inspecionados novamente o arquivo correto, os seis detalhes desktop e exports reais 04B JBL/M07. A limitação de igualdade com a versão histórica permanece registrada; nenhum restore foi realizado.
- A F4 continua bloqueada até a entrega e aprovação explícita da F3.

## Execução Fase 3 — 29/10/2026

- Entregue: detalhe único por `costItemId` no slot desktop, sheet inferior mobile/tablet, dados próprios do item, origem resumida, QC existente com previews/ampliação/capa, contexto e retorno de foco preservados. Removida a expansão inline. Nenhum serviço/API/schema/cálculo financeiro foi alterado nesta fase.
- Validações: 15 cenários Chromium passaram no build final; 47 integrações QC e 16 testes de cache/estado/rota privada passaram. Lint, typecheck geral e isolado, build e diff passaram. Lint visual: zero ocorrências em três arquivos.
- Reparado cache gerado inválido em `.next/dev/types`, com cópias dos arquivos anteriores nos artefatos. Os três metadados de configuração foram restaurados ao início da F3. Tentativas intermediárias e limitações de teste constam do relatório; não se declara suíte global nem E2E completo de Pacotes verde.
- Prévia: http://localhost:3143/orders?search=Seis%20exemplos. Cópia sintética com 33 linhas; seis exemplos usam serviços reais, fotos de navegador usam transporte simulado. Nenhuma mídia/dado de produção foi acessado.
- Evidências desktop/mobile, diferenças por fase, arquivos e aceite: [Relatório F3](../FASE_3.md).
- Decisão de Gabriel sobre a entrega F3: **PENDENTE**.
- F4 liberada? **NÃO**. Aguardar aprovação explícita.
