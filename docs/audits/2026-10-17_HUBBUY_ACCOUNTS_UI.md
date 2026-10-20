# Contas HubBuy — refatoração da interface

Implementação local em 17/10/2026, baseada na proposta `refatoracao_contas_hubbuy_loti.md` e na imagem fornecida pelo usuário. Escopo: apresentação da página `/packages/accounts`.

## Alterações

- Desktop: lista compacta **Minhas contas**, busca local por nome/email e detalhe da conta selecionada. A primeira conta abre inicialmente; criar uma conta seleciona o novo cadastro e limpa a busca.
- Tablet/mobile, até 1100 px: fluxo vertical com seletor nativo de conta. Esse breakpoint evita comprimir o conteúdo quando a navegação geral ainda ocupa parte da tela. Busca e lista ficam na versão desktop.
- Saldo CNY como principal destaque, com ondas SVG estáticas e base histórica BRL imediatamente abaixo. Não se apresentou a base histórica como cotação ou conversão atual.
- Revisão/ledger e direitos de todos os membros abaixo do saldo, sem nomes fixos. Aviso contextual conserva a mensagem e a condição de bloqueio devolvidas pelo servidor.
- Menu Radix **Ações** no cabeçalho: somente as ações antes existentes e nas mesmas condições de elegibilidade. Exclusão, anulação de cadastro incorreto e ativação em zero conservam suas confirmações, motivos, idempotência e restrições. O menu libera o foco antes de abrir a confirmação; cancelar retorna ao acionador.
- Extrato aberto para a conta selecionada, com tabela semântica, datas real/registrada, crédito/uso, descrição, CNY, base histórica BRL e saldo após. No tablet/mobile, a tabela tem rolagem interna e instrução visível.
- Formulário único de criação abaixo do extrato. O CTA da lista leva/foca esse campo.
- Estados de ausência de contas, busca vazia, saldo zero, carregamento e erro com retry. A paginação conserva as linhas já carregadas quando uma próxima página falha.

## Fontes de dados e regras preservadas

| Informação | Origem existente |
| --- | --- |
| Nome, email, status, saldo CNY, revisão e capacidades | `initialAccounts` / GET `/api/hubbuy/accounts` |
| Ledger e direitos por pessoa | GET `/api/hubbuy/accounts/[accountId]` |
| BRL remanescente da conta | Soma das bases históricas disponíveis dos direitos retornados |
| Nome da pessoa | Lista de membros autorizada no servidor |
| Extrato, BRL por movimento, datas e saldo após | GET `/api/hubbuy/accounts/[accountId]/statement` |

O extrato já retorna `historicalBrlCents`; apenas sua tipagem/apresentação cliente foi acrescentada. Não houve alteração de serviço, autorização, API, schema, migration, cálculo financeiro, pagamento, refund ou snapshot. A revisão continua sendo a revisão atual da conta, como na interface anterior; nenhuma data de revisão foi inventada.

O endpoint existente pagina por sequência e não oferece filtro por período. A tela mantém essa paginação e indica a ordem dos registros, sem criar um seletor que filtraria apenas parte do histórico. Não foram acrescentadas dependências, imagens rasterizadas, superfícies QC ou mudanças em outras páginas.

## Arquivos desta tarefa

- `src/components/packages/hubbuy-accounts-panel.tsx`: layout, seleção, busca, leituras e estados de apresentação.
- `src/components/packages/hubbuy-accounts.css`: estilos locais usando tokens existentes e responsividade.
- `tests/e2e/hubbuy-account-deletion.spec.ts`: novo menu e retorno de foco após cancelamento.
- `tests/e2e/hubbuy-account-discard.spec.ts`: seleção da conta e ação de correção no menu.
- `tests/e2e/hubbuy-balance.spec.ts`: extrato automático, direitos, ações bloqueadas e capturas responsivas.
- `tests/e2e/hubbuy-accounts-ui.spec.ts`: busca, troca de conta por teclado/seletor, carregamento, erros, retry, paginação e foco do cadastro.
- Este relatório.

O repositório já continha trabalho local extenso, inclusive o painel e os três testes HubBuy como arquivos não rastreados. Esse trabalho foi preservado; esta lista descreve somente os arquivos editados/criados nesta tarefa.

## Validação

| Check | Resultado |
| --- | --- |
| `npm run typecheck` | Passou |
| `npm run lint` | Passou |
| `npm run build` | Passou após o ajuste final de tablet/mobile |
| `npm test -- --maxWorkers=1 --no-file-parallelism --no-isolate --pool=threads --testTimeout=45000` | 290 testes passaram, 7 skips; 40 arquivos passaram, 1 skip |
| Playwright Chromium, quatro arquivos HubBuy listados acima | 4 cenários passaram no build final |
| Larguras | Ausência de overflow da página em 320/390/768/1024/1440 px |
| QA visual | Capturas desktop, tablet e mobile inspecionadas |
| `git diff --check` | Passou |

Playwright foi executado com `LOTI_E2E_PRODUCTION=1`, `LOTI_CAPTURE_HUBBUY_QA=1` e um novo `LOTI_E2E_DATABASE_URL=file:./data/e2e-refunds-accounts-ui-<uuid>.sqlite` por execução. O nome “production” nesse harness significa somente usar o build local, sem publicação. Todas as identidades e movimentações são sintéticas. O primeiro ciclo do navegador encontrou seletores de teste ambíguos, corrigidos para localizar o textbox pelo papel acessível. As execuções seguintes passaram.

O sandbox bloqueou sockets localhost e, em um build, a criação de diretório gerado em `.next` com `EPERM`. Os comandos correspondentes passaram com execução local ampliada, mantendo os mesmos limites de dados sintéticos. Nenhum recurso remoto foi consultado ou alterado.

## Revisão manual

Capturas: `artifacts/qa/hubbuy-account-creation/accounts-overview-{320,390,768,1440}.png`. Conferir principalmente a hierarquia do saldo, o seletor compacto e a rolagem do extrato no celular. A validação automatizada de navegador foi feita em Chromium; Safari e Firefox não foram executados. Publicação e aplicação de migrations de produção não fizeram parte desta tarefa.
