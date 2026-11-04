# Frente 3 — Compra individual e Histórico

Status: implementação local concluída. As validações focadas passaram; a suíte ampla registra falhas em testes preexistentes de concorrência e operações de custos. Não houve migração de banco, publicação ou alteração em contas reais nesta frente.

## Resultado

O espaço pessoal permite criar e editar uma compra ativa, adicionar favoritos ou itens manuais, atualizar o status do carrinho, remover itens e finalizar a compra. Compras finalizadas aparecem no Histórico pessoal como registros imutáveis. Esses dados permanecem isolados das compras e do Histórico do espaço compartilhado da mesma conta.

## Decisões de implementação

- Compra e Histórico aceitam acesso a espaço pessoal via `requireWorkspaceAccess()`. Ações específicas de compras compartilhadas continuam usando `requireWorkspaceMember()`; `requirePurchase()` permanece como a guarda compartilhada para as superfícies de custos, logística e QC ainda limitadas ao grupo.
- Uma mutação de compra usa o contexto de workspace enviado pelo cliente e confere-o contra o workspace ativo no servidor. Selecionar outro espaço também compara o contexto de origem, evitando gravação atrasada de uma aba antiga.
- No espaço pessoal, o titular é o único participante de cada item. A interface omite seleção de participantes, divisão de custos e atualização em lote por pessoa.
- A compra salva uma cópia independente do favorito. Editar ou excluir o favorito não altera o item nem o snapshot finalizado.
- A finalização inicializa, na mesma transação, o acompanhamento de custos, o pedido original e os snapshots-base de custo no workspace da compra. Essa inicialização não cria Pacote 1; criar pacotes e operar seus custos/logística continua fora desta frente.
- Não foram adicionadas tabelas, colunas ou migrations nesta frente.

## Arquivos desta frente

- `src/lib/domain/authorization.ts` — acesso a uma compra pessoal ou compartilhada e proteção de contexto/status.
- `src/lib/domain/purchase-services.ts` — compra pessoal, escopo por workspace e participante único.
- `src/lib/domain/services.ts` — validação transacional ao trocar o workspace ativo.
- `src/app/api/app/route.ts` — contexto esperado obrigatório em mutações.
- `src/components/layout/shared-workspace-only.tsx` — guardas de acesso a workspace e de membro compartilhado.
- `src/app/(app)/purchase/layout.tsx` e `src/app/(app)/history/layout.tsx` — acesso às duas rotas para titular do espaço pessoal.
- `src/app/(app)/history/[purchaseId]/page.tsx` — leitura histórica limitada ao workspace atualmente ativo.
- `src/components/layout/app-shell.tsx` — navegação pessoal com Favoritos, Compra atual e Histórico.
- `src/components/favorites/favorites-screen.tsx` — ação de adicionar favorito à compra pessoal, inclusive entrada pela compra ainda não criada.
- `src/components/purchase/purchase-screen.tsx` — apresentação pessoal sem controles de grupo e leitura histórica.
- `src/components/purchase/purchase-editor.tsx` e `src/components/purchase/item-editor.tsx` — edição pessoal e registro de rascunhos para troca de contexto.
- `src/components/purchase/history-screen.tsx` — Histórico pessoal sem ações de custos compartilhados.
- `tests/integration/personal-purchases.test.ts` — isolamento, snapshot, autorização, idempotência e conflito de contexto.
- `tests/e2e/workspaces.spec.ts` — fluxo pessoal de compra e histórico junto às verificações de espaços e responsividade.
- `docs/INDEX.md` e este handoff — índice, decisões, validações e dependências para a Frente 4.

## Validação

- `npm run typecheck` — passou.
- `npm run lint` — passou.
- Testes de integração focados (`purchases`, `purchase-sharing-concurrency`, `personal-workspaces` e `personal-purchases`) — 4 arquivos, 36 testes passaram.
- E2E focado `tests/e2e/workspaces.spec.ts` — os 4 cenários passaram: isolamento de Favoritos (1/1), aba/contexto atrasados (2/2) e fluxo pessoal completo (1/1). Após os últimos ajustes de navegação, Favoritos e o fluxo pessoal foram repetidos separadamente e passaram. O fluxo pessoal levou 1,4 min no servidor Next de desenvolvimento e recebeu timeout de 90s; inclui desktop, viewport mobile, criação do item pelo Favorito, edição/remoção, Histórico e isolamento de URL direta.
- Regressão Playwright de troca de espaço a partir do detalhe do Histórico — 1/1 passou; confirma o espaço compartilhado antes da troca, a seleção do espaço pessoal, a URL `/history`, a lista pessoal sem a compra do grupo e o mesmo resultado após recarregar.
- E2E `tests/e2e/purchase.spec.ts`, executado após o teste de Favoritos que prepara o fixture — 2/2 passaram.
- `npm run build` — passou com saída isolada `.next-frente3-build`, segredo Better Auth temporário, banco SQLite local descartável e um worker. A saída temporária e o banco foram removidos ao final.
- Suíte ampla `npm test -- --pool=threads` — 546 passaram, 7 ignorados e 14 falharam em 7 arquivos: concorrência de exclusão de conta HubBuy, concorrência de estorno de pacote, CLI de redefinição de senha, migration de ajustes de saldo, auditoria de rastreabilidade de créditos, migration de QC e workflow de Armazém. Os testes concorrentes incluem timeouts de 5s e erros `SQLITE_BUSY`; a falha da CLI atingiu o timeout de 20s. Essas falhas não foram comparadas com uma versão anterior e, portanto, não estão classificadas como preexistentes. A repetição sequencial também falhou nas suítes que executam processos Node independentes.
- Uma execução E2E mais ampla com 11 casos também mostrou timeouts nos cenários de rotas/signup privado e preferência de visualização/logout da suíte de Favoritos. Os dois testes da Compra e os quatro testes de Workspace passaram nas execuções focadas finais.

## Dependências para a Frente 4 — Pedidos, Armazém, Pacotes e custos

- A base de workspaces pessoais da Frente 1 precisa estar aplicada e provisionada nos ambientes de destino antes de publicar código que dependa dela. Esta entrega não aplica a migration `0029` nem provisiona usuários fora da base local descartável.
- Os acompanhamentos de custo originados ao finalizar uma compra pessoal já têm `workspaceId`; portanto, consultas da Frente 4 devem continuar isolando tracking, pedido, itens, participante, custos, eventos e auditoria por esse mesmo workspace.
- Nesta entrega, as rotas de Pacotes, Pedidos e Armazém continuam compartilhadas e protegidas por membership; os serviços de custos/logística/refundos/QC também preservam suas guardas compartilhadas. A Frente 4 deve decidir e implementar o suporte pessoal de forma explícita nas rotas, carregamento de dados e autorização, sem presumir que a existência de um tracking pessoal autoriza acesso aos fluxos compartilhados.
- A inicialização de tracking pessoal não cria pacote. Se a Frente 4 habilitar pacotes pessoais, deve definir o momento e a regra de criação dos pacotes, mantendo custos e itens vinculados ao workspace e sem alterar snapshots históricos.
- Não há membros de workspace pessoal em `workspace_members`. Não use essa tabela para inferir o titular; use a resolução centralizada de workspace e a autorização owner-only estabelecidas pela Frente 1.
- A Frente 4 deve manter a comparação do workspace esperado em toda mutação e preservar o bloqueio de gravações de abas cujo contexto ativo mudou.
- Regressões devem cobrir histórico/custos do grupo e pessoal simultâneos, isolamento entre workspaces da mesma conta, snapshots de itens após mudanças em favoritos e ausência de criação duplicada de tracking/pedido em finalizações concorrentes.
