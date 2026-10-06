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
