# Loti — relatório da migração Vercel + Turso

## Pedidos, armazém e pacotes — execução em 27/10/2026

A extensão tem implementação local de Pedidos, chegada parcial, reservas multi-compra, pacotes independentes, encargos, manifestos, despacho, peso, conferência legada e adaptação de refunds/correções/QC. Foram acrescentadas migrations 0023–0028, guards de cutover, ponte financeira legada e cenários sintéticos separados. **Esta etapa está encerrada com handoff para finalização; aceite humano e reviewer da extensão não foram obtidos.**

Por solicitação do usuário, esta etapa será encerrada com [handoff para o próximo agente](HANDOFF_ORDERS_WAREHOUSE_PACKAGES_2026-10-27.md), incluindo os pontos de finalização ainda necessários. Não considerar todos os gates do plano 39 concluídos.

O roteiro completo de Pacotes passou no Chromium, incluindo cotação sem pagamento, fechamento, frete pago, peso, Receita, despacho e recebimento. A suíte completa do estado entregue passou com **500 testes aprovados e sete ignorados**; typecheck isolado, lint e build isolado também passaram. O último upgrade sintético e a comparação da baseline passaram sem diferenças. Há pontos de finalização de produto/operação explicitamente listados no handoff; aprovação dos testes não significa aceite humano ou liberação. A execução final, os limites e o runbook estão em [execução e operação local](testing/ORDERS_TRANSITION_EXECUTION.md).

### Registro histórico da preparação inicial

**Entrega parcial: somente baseline legado. A extensão do plano 39 não está completa.** Estão disponíveis manifesto versionado, builder sintético pelos serviços reais, comandos locais explícitos de seed/comparação/dev, armazenamento QC privado guardado para QA e cenário Chromium dedicado. As âncoras globais e somas FIFO/pagamentos/pessoas conciliam. O schema e o fluxo operacional anterior permanecem; migrations e novo ciclo de pedidos/pacotes estão pendentes. Não foi solicitado nem obtido aceite humano do novo fluxo.

Ver [carga e comandos](testing/ORDERS_TRANSITION_DEV_SCENARIO.md) e [auditoria/evidências](audits/2026-10-27_ORDERS_TRANSITION_BASELINE.md). Nenhum banco remoto, dado financeiro real, configuração externa, publicação, commit ou PR foi alterado. A exportação integral de tabelas foi rejeitada pela revisão automática e não foi aplicada; os dados continuam sendo gerados pelos serviços. A tentativa inicial de atualizar AGENTS/PROMPT foi rejeitada; após autorização explícita do usuário, somente as referências ao plano 39 foram acrescentadas.

Após code review, o comparador passou a exigir a baseline persistida e verificar snapshots, parcelas/capacidades pessoais, pagamentos, ledger e proveniência QC completa. O contrato v2 inclui `qcImports`; os dez refunds são conferidos individualmente. Dezoito testes dirigidos, typecheck/lint e o seed/CLI em banco novo passaram. A terceira revisão Sol 6.1 high não encontrou achados de código nos eixos Standards e Spec deste incremento. Isso fecha os achados do comparador, sem declarar G1–G7 ou a extensão completa atendidos.

Atualizado em 5 de outubro de 2026. **Loti está publicado em https://loti-omega.vercel.app**, no projeto Vercel `loti`, conectado ao Turso `loti-prod`. Os dois bancos remotos receberam migrations; login, sessão após recarga, gravação/leitura de favorito e logout foram verificados na URL pública. Usuários reais e importação da planilha aguardam as identidades e decisões do legado.

## Implementado

- Aplicação Next.js sem estado local em produção, configurada para Vercel e Turso/libSQL.
- Banco usa Drizzle `libsql` e `@libsql/client`; as operações de domínio, autorização, autenticação, rotas e ferramentas de operador agora são assíncronas.
- Configuração de produção exige `TURSO_DATABASE_URL` e token remoto. Credenciais ficam somente no servidor. `BETTER_AUTH_SECRET` pode ser gerado pelo operador; `BETTER_AUTH_URL` usa a origem final do Vercel.
- Migrações são aplicadas explicitamente antes do deploy. Healthcheck verifica conectividade com o banco sem expor detalhes de falha.
- Seed bloqueia bancos remotos/de produção. Dados locais existentes foram preservados; os testes de seed e usuário usam bancos descartáveis.
- Removidos o driver nativo `better-sqlite3`, o start que migrava automaticamente, o backup de arquivo SQLite, Dockerfile e configuração Railway.
- Atualizados `AGENTS.md`, `PROMPT_ONE_SHOT.md`, README e documentação canônica de arquitetura, esquema, operação, implantação, decisões e entradas humanas.
- Registrada a decisão em [VERCEL_TURSO_ARCHITECTURE.md](decisions/VERCEL_TURSO_ARCHITECTURE.md).

## Arquitetura

```text
Browser → Next.js/Vercel → Better Auth → autorização central → Drizzle/libSQL → Turso
```

O esquema continua SQLite e Better Auth continua usando o adaptador Drizzle com `provider: "sqlite"`. O runtime Vercel falha com erro de configuração se a URL ou o token do banco remoto estiverem ausentes. Desenvolvimento pode usar `file:./data/loti.sqlite`; navegador nunca acessa o banco. O runtime de produção não depende de arquivo gravável, volume de aplicação ou número fixo de réplicas.

## Banco de dados

- Uma migração existente cria as 11 tabelas do domínio e autenticação; `npm run db:generate` não detectou mudança de esquema.
- Comandos: `npm run db:generate`, `npm run db:migrate`, `npm run db:verify`.
- Migrations aplicadas a um arquivo libSQL temporário vazio e reaplicadas sem erro; verificação confirmou leitura das 11 tabelas. O banco local original continua intacto.
- Bancos `loti-prod` e `loti-dev` criados na organização `arantesgabzz`, plano Free, grupo `default`, região AWS São Paulo (`aws-sa-east-1`). Ambos receberam a migração versionada e tiveram as 11 tabelas mais o journal Drizzle verificadas por conexão remota. Proteção contra exclusão está ativa em produção.

## Autenticação e usuários

Signup público continua desabilitado. Após configurar a origem e o segredo no ambiente do Vercel, o comando `npm run user:create -- --name '<nome>' --email '<email>'`, com `LOTI_USER_PASSWORD` no ambiente, cria usuário e associação ao único workspace. O comando foi validado em banco temporário e pode ser repetido. Senhas não devem ir para Git nem ser impressas.

Os cinco endereços reais dos membros ainda não foram fornecidos. O seed não foi promovido. Uma conta descartável com senha aleatória foi criada exclusivamente para smoke test de produção e removida, junto com o favorito temporário, após validar logout. Produção está pronta para o bootstrap dos membros reais.

## Testes e verificações

| Verificação | Resultado |
| --- | --- |
| TypeScript (`npm run typecheck`) | Passou |
| ESLint (`npm run lint`) | Passou sem avisos |
| Vitest (`npm test`) | **93 testes passaram**, 5 arquivos |
| Playwright Chromium (`npm run test:e2e`) | **15 cenários passaram** |
| Build (`npm run build`) | Passou |
| Migração em banco vazio + repetição | Passou |
| `db:verify` | Passou; 11 tabelas acessíveis |
| Seed e criação de usuário | Passaram em banco temporário |
| Produção sem URL/token | Ambos rejeitados antes de conectar |
| Migrations Turso produção/desenvolvimento | Aplicadas; conexão e 11 tabelas verificadas |
| Smoke test público | Login, sessão após reload, gravação/leitura e logout passaram |
| Healthcheck público | HTTP 200, `status: ok`, `database: ok` |
| Segurança pública | API sem sessão HTTP 401; signup HTTP 400/desabilitado |

Os E2E cobrem login privado e signup bloqueado, favoritos, permissões, preferências de visualização, coleções, compra colaborativa, histórico imutável, responsividade e reduced motion. O smoke test público confirmou autenticação real e persistência Turso. Evidências locais estão em `artifacts/deploy/` (fora do Git).

## Migração do legado

A planilha de origem contém 125 favoritos, 3 coleções e 26 itens de compra. Ela permanece local e fora do Git. Não foi importada para produção. Antes de importar, mapear os responsáveis para emails reais e confirmar se `Compra Out26` é ativa ou histórica. Validar o relatório de simulação e então executar:

```sh
npm run import:legacy -- --mapping legacy/mapping.local.json --execute
```

O caminho do mapping acima é ilustrativo: o mapping de exemplo é deliberadamente incompleto. Não execute contra produção até substituir pelos usuários/status aprovados e revisar o dry-run.

## Implantação

Projeto: [loti na Vercel](https://vercel.com/arantesgabriels-projects/loti). ID `prj_sJWeSCWt4miiJi3eA6TDOUa7BYKv`, plano Hobby, framework Next.js, raiz `./`, produção acompanhando `feat/mvp` do repositório `arantesgabriel/loti`. A branch `main` tem apenas o README; o primeiro build dela falhou por não conter Next.js. O código validado foi enviado à branch da aplicação e reimplantado como Production.

Produção usa URL/token de `loti-prod`; Preview usa URL/token de `loti-dev`. Tokens têm Read & Write apenas em seu respectivo banco e estão registrados como valores Secret no Vercel. `BETTER_AUTH_SECRET` aleatório está configurado como Secret. `BETTER_AUTH_URL=https://loti-omega.vercel.app` está configurado em Production. Preview deriva sua origem HTTPS das variáveis do sistema Vercel, com a mesma origem usada nos controles de mutação. A integração GitHub já tinha acesso ao repositório, que é público; não foi necessário ampliar suas permissões.

O build de Production do commit `c5a272b` ficou Ready em 1m14s. Depois da publicação, o código ganhou resolução automática de origem dos Previews; typecheck, lint, 93 testes e build passaram novamente antes do envio desse ajuste. Deploys futuros ocorrem por push em `feat/mvp`.

## Pendências reais

- Emails reais para os cinco membros e processo aprovado de credenciamento inicial.
- Mapping da planilha e decisão sobre o estado de `Compra Out26` antes da importação.
- `npm install` reportou cinco vulnerabilidades altas na etapa local anterior; a auditoria deve ser conferida separadamente. Nenhuma atualização automática de dependências foi aplicada nesta implantação.

## Fontes técnicas

- [Drizzle ORM — conexão Turso/libSQL](https://orm.drizzle.team/docs/sqlite/connect-turso)
- [Better Auth — adaptador Drizzle](https://better-auth.com/docs/adapters/drizzle)
- [Turso — integração com Vercel](https://vercel.com/marketplace/tursocloud/database)
- [Vercel — variáveis de ambiente](https://vercel.com/docs/environment-variables)

## Convites privados — 5 de outubro de 2026

Entregue o fluxo Perfil → Meu grupo → email → gerar link → compartilhar → definir nome/senha ou autenticar conta existente → vínculo → Favoritos. Membros consultam o grupo e gerenciam convites pendentes. Links duram sete dias, são de uso único e armazenados somente por hash; regeneração invalida o anterior. Cadastro público permanece bloqueado.

Aceite executa criação de conta/credencial, vínculo, seleção do workspace e consumo na mesma transação. Falha na sessão após commit tem recuperação pelo login normal. Limites persistentes, validação de origem, isolamento por workspace e estados de expiração/revogação protegem os endpoints.

Validação local: lint, typecheck, 106 testes Vitest, 19 cenários da suíte Chromium completa e um cenário adicional de recuperação de sessão (20 no total), build e migrações repetidas em bases vazias/existentes passaram. Capturas de Meu grupo desktop/mobile e formulário mobile foram inspecionadas.

Migrações novas: `0001_bouncy_inertia.sql` e `0002_loose_shocker.sql`; aplicar antes de publicar o código. Não houve migração de produção nem deploy. Detalhes: [plano e decisões](18_WORKSPACE_INVITATIONS_PLAN.md).

## Rateio colaborativo de itens — 7 de outubro de 2026

Implementada a extensão faseada descrita em [plano de rateio](20_PURCHASE_COST_SHARING_PLAN.md). Um item continua sendo uma única linha física da compra, com quantidade, subtotal, favorito de origem e estado compartilhado. A tabela `purchase_item_participants` guarda as pessoas e a ordem estável da distribuição; `sharing_mode` guarda divisão igual, percentual em pontos-base ou valor fixo em centavos. A migração `0003_simple_exiles.sql` adiciona o modo, cria a relação e converte cada item existente em uma participação igual para o `person_id` original, sem alterar preço, quantidade ou estado.

### Compatibilidade e arquivos

- As leituras autenticadas de `getData()` e `ClientData` agora expõem `participants` com a parcela calculada. `personId` continua sendo o espelho legado do primeiro participante, usado por consumidores antigos durante a transição.
- A validação de escrita aceita temporariamente o contrato pessoal antigo (`personId`) e o normaliza para uma participação; a forma nova recebe `sharingMode` e `participants`. O importador legado também grava item e participação na mesma transação.
- Os cálculos ficam em `src/lib/domain/cost-sharing.ts`; autorização de membros, persistência transacional e finalização protegida ficam em `src/lib/domain/authorization.ts` e `purchase-services.ts`.
- A tela de item permite selecionar várias pessoas, escolher um dos três modos e revisar a prévia. Grupos pessoais mostram a parcela, unidades pessoais e produtos compartilhados; o total e a quantidade física da compra contam o produto uma vez. Ações de status e remoção continuam globais para todos os participantes. Histórico reaproveita os mesmos dados em modo somente leitura.
- `PROMPT_ONE_SHOT.md`, regras, fluxos, esquema, critérios de aceite, plano de teste e decisões foram atualizados. Cobertura nova está em `tests/unit/cost-sharing.test.ts`, `tests/integration/purchase-sharing-migration.test.ts`, `tests/integration/purchase-sharing-concurrency.test.ts` e `tests/e2e/purchase.spec.ts`.

Todas as mutações de compra e a finalização são serializadas no processo e executadas dentro de transações libSQL. A verificação de compra editável ocorre dentro da transação. Isso também evita a falha de concorrência observada no adapter SQLite local quando uma transação `BEGIN IMMEDIATE` encontra outra escrita em andamento. O teste com duas conexões cobre rollback entre item e participantes e a disputa entre edição e finalização.

### Verificações desta implementação

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | Passou |
| `npm run lint` | Passou |
| `npm test` | **127 testes passaram**, 14 arquivos |
| `npm run build` | Passou |
| `npm exec -- playwright test` | **22 cenários Chromium passaram**, incluindo os três modos e layout responsivo |
| `TURSO_DATABASE_URL=file:/private/tmp/loti-cost-sharing-final-20261007-r1.sqlite npm run db:migrate` | Passou em banco local isolado vazio |
| Mesmo alvo com `npm run db:verify` | Passou; 12 tabelas de esquema verificadas |
| Migração de esquema anterior e composição financeira | Passaram nos testes de integração |

Não foi aplicada migração em produção nem feito deploy.

### Publicação e retorno de versão

Antes da publicação, fazer snapshot/backup do banco e aplicar `npm run db:migrate` explicitamente ao alvo aprovado; depois publicar o código e executar um smoke test autenticado de leitura, criação, edição, rateio e histórico. Não use o banco de produção como alvo local nem deixe a URL de `.env` escolher o destino acidentalmente.

Depois de criar itens compartilhados, uma versão antiga da aplicação lê apenas o espelho `personId` e atribui a compra somente à primeira pessoa. Não faça rollback cego do código. Se for necessário voltar, coordene restauração de banco e aplicação usando o mesmo ponto de backup; dados compartilhados criados depois dele exigem migração/correção para frente ou recuperação explícita antes da restauração.

### Reparo do banco local após validação de runtime

Em 7 de outubro, a rota `/purchase` retornou 500 porque o `data/loti.sqlite` local ainda tinha o esquema anterior: `purchase_items` não possuía `sharing_mode` e a tabela `purchase_item_participants` não existia. Confirmei que esse era o alvo local configurado pelo app e apliquei nele, explicitamente, `TURSO_DATABASE_URL=file:./data/loti.sqlite npm run db:migrate`. `npm run db:verify` passou com 12 tabelas. A chamada de domínio `getData()` que aparecia na stack passou para os cinco membros; os oito itens retornaram com participações. Nenhum banco remoto foi consultado ou alterado.

## Pacotes e custos — 7 de outubro de 2026

Implementada a extensão aprovada no [plano de pacotes e custos](21_PACKAGES_AND_COSTS_PLAN.md), para substituir o controle da planilha após a finalização. A finalização cria um acompanhamento aberto na mesma transação, copiando os itens, valores sugeridos e pesos de participantes sem alterar snapshots; compras antigas podem iniciar esse acompanhamento explicitamente e com segurança idempotente.

O acompanhamento permite editar preço efetivo e frete China por unidade, definir percentuais Pix/cartão em Meu grupo, capturar a taxa aplicada na cobrança, dividir quantidades entre pacotes, informar frete Brasil e Receita, manter pagamentos e logística manuais, ver custos por item/pessoa e encerrar ou reabrir com motivo auditável. Uma edição que altere uma cobrança paga exige confirmação e a deixa pendente novamente. A quarta guia **Pacotes e custos** fica entre Compra atual e Histórico; a tela mantém tabela financeira no desktop e linhas compactas no mobile. Os dados financeiros ficam separados da compra finalizada.

O cálculo usa centavos e pesos inteiros, `BigInt`, arredondamento metade para cima e maior resto com desempate estável. A migração `0004_milky_wither.sql` adiciona as oito tabelas do acompanhamento. Não houve migração em produção, alteração remota nem deploy. A especificação e o handoff operacional constam em `docs/21_PACKAGES_AND_COSTS_PLAN.md` e abaixo.

### Verificações desta implementação

| Verificação | Resultado |
| --- | --- |
| `npm run check` | Passou: typecheck, lint sem avisos, testes e build |
| `npm test` | **139 testes passaram**, 16 arquivos |
| `npm run test:e2e` | **23 cenários Chromium passaram**, incluindo fechamento/reabertura e layout de 320 px |
| Migração em `file:/private/tmp/loti-packages-costs-20261007-a1b3.sqlite` | Aplicada em banco temporário isolado; banco local existente preservado |
| Mesmo alvo com `npm run db:verify` | Passou; 20 tabelas acessíveis |

### Handoff de migração e publicação

Antes de publicar esta versão, gere snapshot/backup do banco Turso aprovado, aplique a migração ao alvo explicitamente autorizado e só então publique o código. Substitua os placeholders localmente; não use a URL incidental de `.env` nem registre tokens no terminal, Git ou relatório:

```sh
TURSO_DATABASE_URL="$APPROVED_TURSO_DATABASE_URL" TURSO_AUTH_TOKEN="$APPROVED_TURSO_AUTH_TOKEN" npm run db:migrate
TURSO_DATABASE_URL="$APPROVED_TURSO_DATABASE_URL" TURSO_AUTH_TOKEN="$APPROVED_TURSO_AUTH_TOKEN" npm run db:verify
```

Depois do deploy, faça smoke test autenticado de finalização, edição de preço/frete, taxa de pagamento, alocação em pacote, encerramento e reabertura. A migração ainda não foi aplicada em produção; este relatório não declara a feature publicada.

## Refatoração UX de Pacotes e custos — 7 de outubro de 2026

Executado o [plano de descoberta progressiva](22_PACKAGES_AND_COSTS_UX_REFACTOR_PLAN.md). A tela agora abre com resumo parcial/final, pendências e próxima tarefa, seguidos por Produtos e pagamento, Pacotes e Divisão por pessoa recolhidos. A ação contextual abre e focaliza o ponto de edição; a expansão se preserva durante mutações.

O cálculo agrega parcelas conhecidas por componente e mantém separado o total final pendente. Valores sem proporção definida aparecem como não distribuídos. Pacotes mostram conteúdo e cobranças em leitura até que a pessoa escolha uma ação; editores de metadados, conteúdo, preço/frete e cobrança oferecem cancelar/salvar explícitos. A tabela financeira usa lista compacta em viewports até 1199px, e valores da tabela desktop ficam alinhados à direita. Percentuais são apresentados em pt-BR sem alterar o formato dos campos numéricos.

### Verificações desta refatoração

| Verificação | Resultado |
| --- | --- |
| `npm run check` | Passou: TypeScript, ESLint, **148 testes unitários/integrados** e build |
| `npm run test:e2e` | **23 cenários Chromium passaram** |
| Jornada E2E de Pacotes e custos após o ajuste final | 1 cenário passou; inclui checagem de overflow em 320, 390, 768, 1024 e 1440px |
| Capturas desktop/mobile | Inspecionadas em `artifacts/qa/packages-costs-ux/` (9 PNGs) |
| Schema/migração/deploy | Sem alteração da refatoração UX; nenhuma migração de produção ou publicação feita |

## Reembolsos de produtos — 14 de outubro de 2026

Implementada a extensão de reembolsos em Pacotes e custos conforme [plano de reembolsos](23_PRODUCT_REFUNDS_PLAN.md), sem editar snapshots finalizados nem tratar automaticamente dados de Compra Outubro/2026. A migração aditiva `0005_fancy_shooting_star.sql` registra solicitação, recebimento e anulação com participantes e eventos auditáveis. Cancelar unidades retira apenas quantidades explícitas de pacotes elegíveis; crédito recebido reduz o custo líquido, enquanto o valor solicitado permanece “A receber”. A base, a taxa e o pagamento original dos produtos continuam preservados.

A tela permite valores manuais, recebido zero confirmado, correções auditadas, anulação e consulta da composição/resíduo mesmo quando todas as unidades estão canceladas. As divisões dos produtos ficam protegidas somente no item reembolsado; as bases e a cobrança original ficam protegidas globalmente enquanto existir um reembolso não anulado. Disputas entre processos testam revisão e CAS; retry curto de `SQLITE_BUSY` permite que a transação concorrente prossiga para a validação da revisão.

### Verificações desta implementação

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | Passou |
| `npm run lint` | Passou sem avisos |
| `npm test -- --maxWorkers=1` | **168 testes passaram**, 7 ignorados; 23 suítes passaram e 1 foi ignorada (24 total) |
| `npm run build` | Passou; rotas e páginas geradas |
| `npx playwright test tests/e2e/packages.spec.ts tests/e2e/package-refunds.spec.ts` | 2 cenários Chromium passaram; confirmou a regressão de custos anterior e, para reembolsos, foco, cancelar sem escrita, recebimento, correção inclusive a zero, anulação, composição residual e overflow em 320/390/768/1024/1440 px |
| `npm run db:migrate` em SQLite temporário isolado | Passou |
| Mesmo banco com `npm run db:verify` | Passou; 23 tabelas de esquema verificadas |
| Revisão independente GPT‑6.1 Sol, esforço médio | Aprovada sem achados acionáveis; `git diff --check` passou |

As oito capturas da jornada foram inspecionadas em `artifacts/qa/package-refunds/`: solicitação manual desktop, solicitado desktop/mobile, formulário de recebimento, recebido com residual, confirmação de anulação mobile, todas unidades canceladas e divisão por pessoa. O Vitest foi executado com um worker por arquivo para evitar um `ENOENT` do cache temporário SSR do Vitest no sandbox Windows; a repetição passou integralmente.

### Handoff de migração e publicação

Antes de publicar, faça backup/snapshot recuperável do alvo aprovado, aplique explicitamente `npm run db:migrate`, confira `npm run db:verify` e publique o código compatível sem escritores antigos concorrentes. Execute smoke test autenticado em ambiente isolado. A migração, deploy e registro de reembolsos reais continuam pendentes de autorização específica; nenhum banco remoto foi acessado ou alterado nesta tarefa.

## Refatoração de UX mobile — 15 de outubro de 2026

Concluída a refatoração do handoff [Mobile UX](25_MOBILE_UX_REFACTOR_HANDOFF.md), com a auditoria original preservada e o contrato de superfícies móveis registrado em [Design](06_DESIGN.md#mobile-surfaces). Formulários de coleção, compra, convite, item e reabertura usam superfície completa no mobile; detalhes longos e reembolso seguem a mesma estrutura rolável com safe areas e ações alcançáveis. Confirmações breves continuam compactas, e o desktop mantém a largura e o comportamento de diálogo/gaveta existentes.

Favoritos simplifica as ações no vazio global sem remover o FAB. Pacotes e custos destaca total líquido e próxima tarefa, organiza ações administrativas QC e distingue status pago/pedente de ações de edição. Resumos do reembolso mantêm valores monetários em uma linha, com o botão de detalhes abaixo; a gaveta longa usa cabeçalho e ações preservados enquanto o conteúdo rola. A mudança de apresentação mantém fórmulas, snapshots, taxas, regras de crédito, permissões e armazenamento atuais.

### Verificações desta refatoração

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | Passou |
| `npm run lint` | Passou sem avisos |
| `npm test -- --maxWorkers=1 --testTimeout=30000` | **226 testes passaram**, 7 ignorados; 29 arquivos passaram e 1 foi ignorado |
| `npm run test:e2e -- --reporter=line` | **35 cenários Chromium passaram** |
| `npm run build` | Passou; compilação, TypeScript, páginas e traces concluídos |
| Banco/schema/deploy | Nenhuma migração ou alteração de banco feita nesta refatoração; sem deploy ou publicação |

O E2E cobre 320×640, 360×800, 390×844, 430×932, 768 px e 1440 px; verifica superfície completa, foco, retorno, ausência de overflow e rodapé abaixo do último campo. As evidências antes/depois estão em [`artifacts/qa/mobile-ux/`](../artifacts/qa/mobile-ux/), incluindo resumo do reembolso em 320 px, formulário longo em 320/768/1440 px, coleção/compra e primeira tela de Pacotes e custos. A [auditoria de conclusão](audits/2026-10-15_MOBILE_UX_REFACTOR.md) relaciona os fluxos e limitações.

Na primeira passagem da suíte unitária/integrada, um dos testes de corrida entre processos recebeu `SQLITE_BUSY` ao confirmar a transação; o arquivo de concorrência passou isoladamente (5/5) e a repetição integral passou (226 testes). A validação visual usou Chromium com viewports emulados; dispositivo físico e teclado virtual do sistema não foram testados. A skill `frontend-design` não estava instalada, conforme registrado na auditoria inicial.

## Saldo HubBuy, pagamentos mistos e pedidos adicionais — 17 de outubro de 2026

Implementada localmente a evolução do [plano faseado de saldo HubBuy e pagamentos mistos](26_HUBBUY_BALANCE_AND_MIXED_PAYMENTS_PLAN.md), com as decisões D1–D3 confirmadas pelo usuário: (1) os créditos mantêm direitos proporcionais individuais mesmo com a compra consolidada em uma conta HubBuy; (2) o saldo de outra pessoa pode financiar custo com adiantamento explícito em CNY e baixa manual do acerto feito fora do app; (3) pedidos adicionais e pacote permanecem no mesmo acompanhamento/conta.

O esquema agora registra contas CNY, ledger e direitos por membro, conciliações, consumo FIFO, origens dos pagamentos, alocações financeiras, posições de adiantamento e pedidos adicionais com snapshots próprios. Pagamento misto usa saldo + PIX/cartão, cobra taxa somente no complemento externo e preserva bases históricas BRL. Refund só gera crédito após recebimento confirmado; correções, anulações e abatimentos de adiantamentos ficam auditáveis. Pedidos adicionais entram no pacote aberto elegível com ordem de itens estável. O QC associa esses itens ao pedido correspondente e mantém fotos somente na galeria; a exibição em linhas/cartões de custo da Phase 3 continua sem autorização e sem implementação.

As migrações aditivas `0008`–`0017` e seus snapshots/journal foram gerados. A suíte de migração cria schema prévio, aplica as atualizações em bancos descartáveis, verifica preservação de dados antigos, `foreign_key_check` e reaplicação idempotente. Não foi executado `db:migrate` contra produção ou qualquer alvo remoto.

### Verificações desta implementação

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | Passou |
| `npm run lint` | Passou sem erros ou avisos |
| `npm test -- --maxWorkers=1 --no-file-parallelism --no-isolate --pool=threads --testTimeout=45000` | **253 testes passaram; 7 foram pulados** (35 arquivos passaram, 1 foi pulado) |
| `npx playwright test tests/e2e/hubbuy-balance.spec.ts --reporter=list` | **1 cenário Chromium passou:** reconciliação sintética, consumo de saldo CNY, complemento PIX, inclusão no mesmo pacote e ausência de overflow em 320 px |
| `npm run build` | Passou; compilação, TypeScript, páginas e traces concluídos |
| `npm run db:migrate` + `npm run db:verify` em SQLite descartável explícito | Passou; 47 tabelas, 32 triggers de ledger, zero violações FK; arquivo temporário removido |
| `git diff --check` | Passou |
| Evidência visual | [Desktop](../artifacts/qa/hubbuy-balance/mixed-payment-desktop.png) e [320 px](../artifacts/qa/hubbuy-balance/mixed-payment-320.png), capturadas com `LOTI_CAPTURE_HUBBUY_QA=1` |

A primeira suíte completa encontrou contenção SQLite entre recebimento e encerramento; o retry limitado para `SQLITE_BUSY` foi ampliado e a repetição integral passou. O E2E identificou também uma colisão de `allocationOrder` ao atribuir itens do pedido original e de um pedido adicional ao mesmo pacote. O serviço agora cria uma sequência única e determinística, coberta pela integração e pela jornada do navegador.

### Handoff operacional

Esta implementação não registrou saldos, refunds, RAMs/Elixir, cotações, acertos ou conteúdo de pacote reais. Nenhum banco remoto foi acessado ou alterado, nenhum deploy/publicação ocorreu e nenhum recurso R2/Cloudflare ou secret foi configurado. Antes de uso real, os responsáveis precisam fornecer e conferir o histórico e saldo CNY, escolher reconstrução cronológica ou abertura do remanescente coberto, validar direitos individuais e só então autorizar separadamente backup, migração explícita, publicação e smoke test. O código local está pronto para revisão operacional, mas uma conta não deve ser ativada com dados reais antes dessa conciliação.

## Cadastro simples de contas HubBuy — 17 de outubro de 2026

Implementado localmente o [plano de simplificação da criação de contas HubBuy](27_HUBBUY_ACCOUNT_CREATION_UX_PLAN.md). “Contas HubBuy” agora é uma página própria em `/packages/accounts` e um item independente na navbar lateral, imediatamente abaixo de “Pacotes e custos”, com ícone de carteira. Não há abas “Acompanhamentos” e “Contas HubBuy” nas páginas; a ilha mobile continua com quatro destinos.

O cadastro independente cria conta ativa com saldo ¥0 e sem crédito ou direitos artificiais. O recebimento de um reembolso pode criar a conta e lançar o primeiro crédito na mesma transação; retries mantêm o mesmo resultado, e CNY zero não cria conta. Contas legadas só podem ser ativadas com confirmação explícita quando o servidor comprova ledger, direitos e histórico vazios; contas com histórico continuam exigindo conciliação. A lista mostra resumos e concentra extrato, direitos, conciliação e arquivamento na conta selecionada.

### Verificações desta implementação

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | Passou |
| `npm run lint` | Passou sem erros ou avisos |
| `npx vitest run --maxWorkers=1 --no-file-parallelism --no-isolate --pool=threads --testTimeout=45000` | **259 testes passaram; 7 foram pulados** (35 arquivos passaram, 1 foi pulado) |
| `npx playwright test tests/e2e/hubbuy-balance.spec.ts --reporter=list` | **1 cenário Chromium passou:** item independente na sidebar, conta independente com saldo zero, primeiro crédito de refund criado inline, direitos por pessoa, conta reutilizada em pedido adicional e overflow em 320 px |
| `npm run build` | Passou; compilação, TypeScript, rotas e traces concluídos |
| `git diff --check` | Passou |

O Playwright usou arquivos SQLite descartáveis exclusivos, todos removidos ao concluir a validação. Nenhuma migração foi aplicada a banco remoto, nenhum dado financeiro real foi inserido e não houve publicação ou deploy.
## Exclusão de contas HubBuy — 17/10/2026

Plano [28](28_HUBBUY_ACCOUNT_DELETION_PLAN.md) executado localmente após a fase inicial apenas documental. Em Contas HubBuy → Gerenciar, cadastros nunca usados podem ser excluídos com confirmação e motivo. A exclusão é lógica, retém auditoria e impede qualquer novo vínculo; saldo, ledger, conciliação, pedidos/pacotes/pagamentos/refunds e referências históricas bloqueiam a operação. Arquivamento permanece para contas com histórico, quando elegível. Nenhum encerramento externo é executado.

Entrega: migration aditiva `0018_amused_mikhail_rasputin.sql` e snapshot, 19 novos triggers de ciclo de vida, comando/DTO/API/UI, proteção dos leitores/escritores e recuperação idempotente após commit incerto. Alterações locais anteriores foram preservadas. Testes históricos de migration usam as colunas do schema correspondente; o harness E2E oferece servidor de build local por `LOTI_E2E_PRODUCTION=1`.

Validação: TypeScript, lint e build passaram; suíte completa serializada com threads teve **278 aprovados e 7 skips** (38 arquivos aprovados, 1 ignorado); sete corridas em processos independentes incluídas. **Dois E2Es Chromium passaram**, incluindo cancelamento, perda de resposta/retry, foco e criação/refund/pedido misto. Migration/verify em destino SQLite descartável: 47 tabelas verificadas, 51 triggers requeridos, zero violações FK. Capturas de confirmação 320/1440 px inspecionadas em `artifacts/qa/hubbuy-account-deletion/`. O runner paralelo e o Next dev apresentaram falhas de cache/manifests no Windows; o gate final usou threads serializadas e build de produção local. Não houve acesso financeiro real, migration remota, deploy ou alteração de serviços externos.

Handoff: backup e alvo autorizados → corte coordenado de escritores antigos → migration explícita até `0018` → verify → deploy autorizado → smoke sintético. Detalhes, limites e recuperação estão no plano 28.

### Aditivo — cadastro conciliado por engano

Após o usuário esclarecer que informou saldo apenas para tentar excluir uma conta, foi implementado **Corrigir cadastro e excluir**. A confirmação exige motivo e declaração explícita de valores incorretos. O serviço `discardIncorrectAccount` aceita apenas conciliação ainda sem uso ou vínculo operacional, estorna integralmente créditos e direitos CNY/BRL por lançamentos vinculados e mantém os originais antes de persistir o tombstone na mesma transação. Não existe movimentação financeira externa nem correção automática da conta real mostrada pelo usuário.

Migration `0019_discard_incorrect_hubbuy_registration.sql` mantém as proteções anteriores e exige auditoria e compensação integral para a exceção; um marcador isolado não libera a exclusão. Handoff atualizado: aplicar até `0019` somente no alvo especificamente autorizado. Validação local: **290 testes passaram e 7 foram ignorados**, incluindo nove corridas em processos independentes; **3 cenários Chromium passaram**; TypeScript, lint, build e migration/verify em banco descartável passaram (47 tabelas verificadas, 51 triggers requeridos, zero violações FK). Capturas desktop/mobile do aditivo foram inspecionadas em `artifacts/qa/hubbuy-account-deletion/discard-{320,1440}.png`. A limpeza de bancos de corrida no Windows ocorre após a saída do runner porque libSQL pode reter handles nativos durante o teardown. Nenhuma publicação, migração remota ou alteração da conta do usuário foi realizada.


## Pedidos, armazem e pacotes - finalizacao local, 27/10/2026

As seis pendencias do handoff foram tratadas: rateio dos encargos na UI, propriedade permanente da ponte legada, leitura financeira consistente e somas seguras, verificador operacional reutilizavel/runner sintetico, paginacao SQL e cobertura das acoes finais. O marcador de propriedade usa eventos imutaveis existentes; nao foi criada nova migration nesta finalizacao. As migrations 0023-0028 da extensao permanecem no working tree.

Evidencias, limites, matriz G0-G7 e ambiente concreto: [relatorio de finalizacao](testing/ORDERS_TRANSITION_FINALIZATION.md). Typecheck/lint/build isolados, comparacao/upgrade da baseline, auditoria operacional e quatro jornadas Chromium passaram. A regressao final teve 507 testes aprovados e sete ignorados, em 78 arquivos aprovados e um ignorado, com saida zero.

Aceite humano da simulacao e autorizacao do reviewer continuam pendentes. O novo cenario inicial e `data/orders-transition-finalization-human-01.sqlite`, independente dos bancos alterados pelos testes. Nenhum commit, PR, deploy, migration de producao, dado financeiro real ou configuracao externa foi realizado. Alteracoes independentes do checkout foram preservadas.
