# Frente 4 — Pedidos, Armazém, Pacotes e custos pessoais

Status: implementação local concluída; validação final registrada abaixo. A entrega habilita os fluxos operacionais do espaço pessoal que já são usados no espaço compartilhado. Não adiciona schema nem migration e não altera banco remoto ou serviços externos.

## Resultado

O titular pode acompanhar os pedidos de uma compra pessoal finalizada, registrar chegada de unidades, reservar unidades disponíveis em pacotes, acompanhar logística manual e custos, e administrar as próprias contas HubBuy. Os registros continuam vinculados ao workspace pessoal e isolados dos registros do grupo da mesma conta.

Finalizar uma compra continua criando o acompanhamento de custos e o pedido original, sem criar pacote automaticamente. Reservas são explícitas e limitadas às unidades recebidas e disponíveis. Cada pacote permanece dentro do workspace e de uma conta HubBuy conferida. Soltar uma unidade remove a reserva e devolve disponibilidade.

## Decisões de implementação

- Leituras e mutações operacionais usam `requireWorkspaceAccess()` ou `requireActiveWorkspaceContext()`; mutações conferem o workspace enviado dentro da transação. Rotas de detalhe também exigem que o recurso pertença ao workspace ativo. Uma aba antiga recebe conflito `WORKSPACE_CONTEXT_CHANGED` e não grava no contexto anterior.
- Workspaces pessoais não criam linhas em `workspace_members`. Consultas de participantes e membros retornam apenas o titular; `requireWorkspaceMembers()` aceita somente o proprietário no espaço pessoal. Convites, liquidações entre pessoas e demais ações compartilhadas continuam protegidas por `requireWorkspaceMember()`.
- A navegação de desktop inclui Pedidos e Pacotes no espaço pessoal. A ilha móvel apresenta Favoritos, Compra, Pedidos, Pacotes e Mais; Histórico e Contas HubBuy ficam em Mais. `/orders`, `/packages`, `/packages/accounts` e `/more` aceitam os dois tipos de workspace.
- A troca de contexto descarta estados locais, seleções, drawers e respostas atrasadas por meio da chave do conteúdo da página e do cancelamento lógico das leituras. Formulários operacionais abertos são registrados no mecanismo de rascunhos e pedem confirmação antes de descartar alterações.
- Taxas, estornos, direitos de saldo, eventos, recibos e snapshots financeiros mantêm os fluxos e invariantes existentes. Os snapshots finalizados continuam imutáveis; as alterações de favorito não alcançam pedidos históricos.
- QC segue a galeria aprovada. O titular pode importar, transferir e administrar galerias somente no workspace pessoal próprio; em workspaces compartilhados, as permissões continuam com o administrador QC configurado. Esta entrega não inclui fotos QC em linhas ou cartões operacionais, nem prepara flags ou slots para a fase 3.
- Nenhuma migration é necessária. O ensaio de migration e `db:verify` foi executado apenas em arquivo SQLite descartável local.

## Áreas alteradas

- `src/components/layout/app-shell.tsx` e layouts de Pedidos/Pacotes/Mais — navegação e acesso por tipo de workspace, redirecionamento de detalhes após troca de contexto.
- `src/components/group-screen.tsx` e `src/components/purchase/history-screen.tsx` — taxas padrão e início/listagem de custos enviam o workspace exibido.
- `src/app/(app)/orders/[orderId]/page.tsx` e `src/app/(app)/packages/accounts/page.tsx` — leitura de detalhes e apresentação de contas no contexto pessoal.
- `src/lib/domain/package-cost-reading.ts`, `package-cost-services.ts`, `purchase-cost-order-services.ts` e `purchase-order-corrections.ts` — leitura e mutação de custos/pedidos com titular owner-only e contexto ativo.
- `src/lib/domain/warehouse-services.ts`, `logistics-package-list.ts`, `logistics-package-services.ts` e `logistics-financials.ts` — armazém, listagem, detalhe e operações de pacotes isolados por workspace.
- `src/lib/domain/hubbuy-balance-services.ts` e `hubbuy-balance-adjustments.ts` — leitura e operações das contas pessoais com validação de contexto também na recuperação idempotente.
- `src/lib/domain/qc-services.ts` e `orders-qc-import.ts`, rotas `/api/**` correspondentes e clientes operacionais — contexto explícito nas consultas, importação QC e mutações.
- `src/components/orders/**`, `src/components/packages/**` e `src/components/qc/**` — envio do workspace ativo, filtro de pessoa omitido no modo pessoal, rascunhos e cópia adequada ao titular.
- `tests/integration/personal-orders-workflow.test.ts` — fluxo pessoal de custos, chegada, reserva, pacote, titular único, isolamento e conflito após troca de contexto.
- `tests/integration/orders-qc-import.test.ts` — titular pessoal comum importa, transfere, define capa e exclui foto QC sem ID de administrador global.
- `tests/e2e/workspaces.spec.ts`, `tests/e2e/packages.spec.ts` e `tests/e2e/workspace-context-contracts.spec.ts` — navegação pessoal, chegada/reserva/pacote, payload de taxas e início de custos pelo Histórico.

## Validação

Antes das alterações, a suíte ampla foi executada em ambiente local: 534 testes passaram, 7 foram ignorados e 26 falharam em 9 arquivos. As falhas incluíram concorrência/`SQLITE_BUSY`, migration, workflow de armazém, CLI de senha e outros fluxos; este registro fornece a comparação para a execução após a implementação.

Validação de schema em banco SQLite descartável, 4 de novembro de 2026: `db:migrate` passou; `db:verify` retornou `status: ok`, 51 tabelas, 62 gatilhos do ledger, zero violações de chave estrangeira e invariantes logísticos válidos (7 tabelas, 36 gatilhos, 8 índices, 8 invariantes).

Validação final local:

- `npm run typecheck`, `npm run lint` e `npm run build` passaram. O build local exibiu avisos do Better Auth sobre segredo de build ausente durante geração estática; os avisos não impediram a geração das rotas. Os testes E2E usaram segredo efêmero local.
- A suíte ampla (`npm test -- --pool=threads --reporter=json`) registrou 544 testes aprovados, 17 falhas e 7 ignorados. O baseline anterior tinha 534 aprovados, 26 falhas e 7 ignorados. A execução ampla ainda encontra contenção SQLite (`SQLITE_BUSY`/`SQLITE_LOCKED`), timeouts de 5 s sob concorrência e verificações legadas de autorização. A falha de expectativa em `package-refunds` foi corrigida na ordem de autorização e a suíte foi repetida isoladamente: 12/12 aprovados.
- Integrações focadas aprovadas: fluxo pessoal Pedidos/Armazém/Pacotes (1), custos de pacote (7), pedidos e correções (11), armazém (2), importação QC (6), serviços QC (47), finalização logística (12), corridas de transição logística (8), saldo HubBuy (7), ajustes de saldo HubBuy (5) e reembolsos de produtos (12).
- E2E aprovados: workspaces (5) e fluxo pessoal de Pacotes/custos, incluindo chegada, reserva, montagem e frete manual (1). O fluxo de Pacotes foi executado contra build local e banco descartável.

Banco remoto, publicação, configuração Cloudflare/R2 e fotos QC em custos operacionais não fazem parte desta entrega.

## Correções após revisão (5 de novembro de 2026)

- O formulário de Meu grupo lê e salva taxas com o ID de `data.workspace`; Histórico inclui `data.workspaceId` na leitura e na ação legada de início de custos.
- O ID global `LOTI_QC_MANAGER_USER_ID` continua controlando QC em workspaces compartilhados. O titular pode administrar somente QC do próprio workspace pessoal: capacidades, importação, transferência, capa e exclusão. Nenhum acesso global é concedido por essa regra.
- Regressões aprovadas: `orders-qc-import.test.ts` 7/7, `qc-services.test.ts` 47/47 e Playwright `workspace-context-contracts.spec.ts` 2/2. `npm run typecheck`, `npm run lint` e build de produção local também passaram. O build isolado manteve os avisos já conhecidos do Better Auth sobre segredo padrão ausente durante geração estática.
