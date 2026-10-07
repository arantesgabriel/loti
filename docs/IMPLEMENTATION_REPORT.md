# Loti — relatório da migração Vercel + Turso

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
