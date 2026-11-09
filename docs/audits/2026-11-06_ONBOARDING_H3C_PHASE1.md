# Onboarding H3-C — Fase 1

Data: 06/11/2026. Status: implementação concluída, com ressalvas de testes preexistentes reproduzidas no baseline; Gate 1 aguardando aprovação. Desenvolvimento autorizado pelo pedido “prossiga” após o Gate 0. A autorização cobre esta fase; elegibilidade/bootstrap no app, UI, motion, M1/M2 e produção continuam nos gates seguintes.

## Entrega

Persistência operacional independente para perfil, introdução e ajuda. Nenhuma dependência, SDK, analytics externo ou evento de navegação foi adicionado. O layout/provider/shell e as telas operacionais não foram integrados nesta fase. Nenhuma ação cria favorito, compra, pacote, membership ou marco.

### Dados

- `onboarding_enrollments`: chave usuário/fluxo, cohort `existing|new`, versão inicial e data do registro. A classificação é imutável no banco. Não é registro de exposição, elegibilidade, início ou conclusão.
- `user_guidance_profiles`: respostas opcionais e revisão global do usuário. `usage_intent=undecided` é a resposta explícita “Ainda não decidi”; `unspecified` é ausência/limpeza de resposta. Sem escolhas automáticas.
- `onboarding_runs`: usuário/fluxo/versão, status, passo estável, revisão e datas independentes de início, fechamento, pulo e conclusão. Ausência significa `not_started`, nunca “conta nova”. Fechar preserva status não terminal; `intro.start` repetido não reabre uma apresentação fechada. Retomada é explícita.
- `onboarding_help_preferences`: usuário/orientação/versão, preferência proativa e revisão própria. A dispensa global prevalece sobre preferências de dicas; `manualHelpAvailable` permanece verdadeiro. Versões futuras herdam a preferência anterior até escolha explícita.

Migração `0032_onboarding_state.sql`: quatro tabelas aditivas, constraints, FKs e trigger de classificação imutável. Classifica todas as contas já presentes como `existing`, sem criar respostas, execuções, ajuda dispensada ou marcos. `created_at` é a data do registro de classificação, não uma data histórica inventada. Contas públicas/convidadas posteriores podem receber cohort `new` no primeiro comando durável; contas sem essa origem continuam `existing`. Essa classificação sozinha não autoriza apresentação automática: as regras pós-auth/convite pertencem à Fase 2.

Leituras são snapshots sem escrita. Mesmo uma preferência de workspace inválida é resolvida sem tentativa de reparo dentro desse snapshot. Mutações revalidam ativação, acesso e contexto ativo na própria transação.

### Contrato HTTP

`GET /api/onboarding?workspaceId=<contexto-atual>` retorna somente estado do usuário autenticado no contexto autorizado. Não cria progresso. Identidade, email, tokens, produtos, valores e dados dos colegas não entram no DTO.

`POST /api/onboarding` exige sessão ativa, origem canônica e JSON estrito de até 4096 bytes, conferidos também durante leitura do stream. Usa limite persistente de 60 solicitações por usuário/minuto, com chave HMAC no namespace `onboarding:` de `auth_limits`. Leituras continuam disponíveis quando o limite de comandos é atingido.

| Comando | Campos específicos |
| --- | --- |
| `profile.save` | `workspaceId`, `expectedRevision`, `patch` parcial com experiência/intenção |
| `intro.start/close/resume/skip/complete` | `workspaceId`, `flowVersion: 1`, `expectedRevision` |
| `intro.progress` | Os campos acima e `stepId: introduction|personalization|entry` |
| `help.set` | `workspaceId`, `helpId`, `helpVersion: 1`, `proactive`, `expectedRevision` |
| `help.reopen` | `workspaceId`, `helpId`; consulta sem alterar preferência ou execução |

IDs de ajuda aceitos: `all`, `favorites.first-action`, `purchase.first-item`. São identificadores operacionais, sem novo conteúdo/interface nesta fase.

Revisões começam em zero na ausência de registro. Escritas usam revisão condicional e unicidade; compare-and-set conflitante retorna `409 ONBOARDING_REVISION_CONFLICT`. Repetir o mesmo estado com a revisão atual é no-op. Repetir com revisão antiga retorna conflito inclusive após perda de resposta: reler o estado confirmado antes de decidir nova tentativa. Não há retry cego de intenção nem confirmação falsa. Contenção SQLite repete somente transação revertida, com espera limitada; esgotamento retorna `503 ONBOARDING_BUSY`.

Respostas, inclusive erros, são `private, no-store`, `Vary: Cookie`, `Referrer-Policy: no-referrer`. Falhas inesperadas têm mensagem sanitizada e logs sem SQL, corpo ou parâmetros de negócio. O cliente não pode selecionar `userId`, milestone, role, cohort ou versão futura.

## Arquivos

- `src/lib/db/schema.ts`, `drizzle/0032_onboarding_state.sql`, journal e snapshot 0032.
- `src/lib/onboarding/{contracts,state,services,http}.ts` e `src/app/api/onboarding/route.ts`.
- Testes unitários de contrato/transições; integração de perfil/isolamento/rollback/ajuda; HTTP; migração; worker e disputa multiprocesso.
- Testes existentes de migração pessoal e de indicações: fronteiras históricas fixadas por tag, substituindo `slice(0, -1)`, que mudaria de significado com 0032.

Mudanças preexistentes em package.json, scripts de dev, Perfil e shell foram preservadas. Diretórios/arquivos não rastreados de Enebinhas e `docs/handoffs/` surgiram durante o trabalho e também não foram alterados por esta fase.

## Validação

| Verificação executada | Resultado |
| --- | --- |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | Passou |
| `npm run lint` | Passou |
| Suítes novas de onboarding | 5 arquivos, 22 testes passaram, incluindo 6 processos filhos em disputas de revisão |
| Migrações pessoal/indicações com fronteiras corrigidas | 2 arquivos, 3 testes passaram |
| Suíte completa Vitest, `--maxWorkers=1` | 98 arquivos: 94 passaram, 3 falharam, 1 ignorado; 579 testes passaram, 15 falharam, 7 ignorados |
| Reexecução dos casos problemáticos no HEAD `341068f`, sem esta fase | Os mesmos 15 casos falharam; comparação automatizada dos nomes confirmou conjuntos idênticos |
| CLI `scripts/migrate.ts` em arquivo local descartável novo, duas aplicações | Passou nas duas aplicações |
| CLI `scripts/verify-database.ts` nesse arquivo | Passou: zero violações de FK, 62 triggers financeiros e invariantes logísticos existentes preservados |
| `npm run build`, com `LOTI_NEXT_DIR=.next-onboarding-phase1` | Passou; inclui `/api/onboarding` como rota dinâmica |
| `git diff --check` | Passou |

As falhas amplas são 9 casos em `hubbuy-account-deletion-concurrency.test.ts`, 5 em `package-refund-concurrency.test.ts` e 1 em `personal-orders-workflow.test.ts`. Há timeouts de 5s/contenção SQLite nos dois primeiros; o último espera 409 e recebe 403. O baseline foi extraído por `git archive` para uma pasta ignorada, sem reset, alteração do worktree ou mudança nos módulos financeiros. Os casos permaneceram falhando sem schema, migração ou serviço de onboarding. Nenhum teste foi desabilitado e não se declara suíte global verde.

Evidências locais em `artifacts/qa/onboarding-phase1/`: `vitest.json` (execução completa), `baseline-vitest.json` (baseline isolado) e `acceptance.json` (comparação resumida e resultados das suítes novas). O banco CLI descartável foi `data/onboarding-phase1-9324745e7b134c2db443001972aa0610.sqlite`.

No Windows sandbox, a primeira execução Vitest encontrou ENOENT no cache temporário. As execuções finais usaram `TEMP`/`TMP` em `artifacts/qa/onboarding-phase1/tmp` e um worker. O primeiro build encontrou EPERM na criação de uma pasta de chunks; a repetição normal passou, sem elevação. As inclusões temporárias que Next gerou em `tsconfig.json` e `next-env.d.ts` foram removidas pontualmente, preservando suas configurações anteriores.

Build e CLI usaram destino local explícito; token Turso vazio. O build usou origem/segredo sintéticos e entrega de email desabilitada. Nenhum `.env`, credencial, ambiente remoto ou dado real foi alterado. Playwright, screenshots, leitor de tela e profiling visual não foram executados nesta fase sem UI; pertencem aos gates posteriores.

## Critérios e limites

Cobertura de fundação para AC-03/04/08/09/15: opcionalidade, persistência, fechamento distinto, preferência de ajuda e isolamento de versões. Os serviços/HTTP também negam conta pendente e contexto não autorizado. Testes não equivalem a aceite E2E de AC-01/02 nem à elegibilidade pós-convite da Fase 2.

T06–T10 e T21/T27 são cobertos no nível de estado/contratos. Comportamentos de formulário, outro dispositivo/browser, entradas de ajuda, foco e apresentação ainda dependem da UI. AC-05/06/07/10 relativos a M1/M2 e backfill não foram implementados.

Evidências visuais: não se aplicam a esta fase de persistência. Nenhum pixel, motion, tema, navegação ou módulo congelado foi alterado; paridade de UI não é declarada.

Gate 1: apresentar evidências, riscos e diff ao responsável antes de iniciar Fase 2. Migração remota, configuração externa, publicação e analytics exigem autorizações próprias.

Atualização posterior: o usuário autorizou explicitamente “execute até a fase 8 e aguarde minha aprovação”. A execução local das fases seguintes e suas evidências estão em `2026-11-06_ONBOARDING_H3C_PHASES2_8.md`; o gate histórico acima não deve ser interpretado como bloqueio atual de desenvolvimento. Produção e analytics continuam sem autorização.
