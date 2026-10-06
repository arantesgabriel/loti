# Loti

Aplicação privada para favoritos pessoais visíveis ao grupo, coleções pessoais, uma compra colaborativa e histórico imutável. A especificação canônica está em `docs/`; veja também [o relatório da migração](docs/IMPLEMENTATION_REPORT.md).

## Executar localmente

Use Node 24 LTS e npm. Copie o exemplo de ambiente, defina um segredo local Better Auth e escolha uma base libSQL:

```sh
npm ci
cp .env.example .env
node -e 'console.log(require("node:crypto").randomBytes(48).toString("base64url"))'
```

Coloque o segredo gerado em `BETTER_AUTH_SECRET`. Para desenvolvimento offline, `TURSO_DATABASE_URL=file:./data/loti.sqlite` usa um arquivo local pelo mesmo `@libsql/client`. Também é possível apontar para `loti-dev` com `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN`.

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Abra `http://localhost:3000`. O seed cria cinco identidades de desenvolvimento `@loti.test` com credenciais exclusivas de teste. Ele é idempotente e bloqueia qualquer banco remoto.

## Arquitetura

Next.js App Router, TypeScript strict, Tailwind, base shadcn/Radix, Geist local e Lucide. Better Auth gerencia sessões e senhas. Drizzle usa o dialeto SQLite e `@libsql/client` acessa Turso/libSQL exclusivamente no servidor. Todas as operações de banco são assíncronas. Zod valida entradas e React Hook Form mantém os formulários.

| Caminho | Responsabilidade |
| --- | --- |
| `src/app` | Rotas protegidas, login e APIs |
| `src/components` | Shell responsivo, favoritos, compra e histórico |
| `src/lib/auth` | Better Auth e sessão obrigatória |
| `src/lib/domain` | Autorização central, serviços, dinheiro, URLs e categorias |
| `src/lib/db`, `drizzle` | Schema SQLite, conexão libSQL e migrações versionadas |
| `scripts` | Migrações, seed, usuários, verificação e importação |
| `tests` | Unidade, integração libSQL e fluxos Playwright |

Favoritos e coleções só podem ser alterados pelo dono. Membros colaboram na compra ativa. Um índice parcial impede duas compras ativas por espaço. Itens guardam snapshots; editar ou excluir favoritos preserva dados da compra. Compras finalizadas rejeitam mutações no servidor. Preços são centavos inteiros ou `null`; progresso considera quantidades. Lista/Cards persiste por usuário.

## Banco e usuários

```sh
npm run db:generate  # gerar migração após alterar schema
npm run db:migrate   # aplicar migrações revisadas ao banco escolhido
npm run db:verify    # validar conexão e presença das tabelas
```

Produção usa `loti-prod`; Preview usa `loti-dev`. Configure `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `BETTER_AUTH_SECRET` e `BETTER_AUTH_URL` no servidor. Não use prefixo `NEXT_PUBLIC_` e não configure migrações para cada requisição.

Para criar uma conta privada e vinculá-la ao espaço único, use uma senha inicial segura pelo ambiente:

```sh
read -s 'LOTI_USER_PASSWORD?Senha inicial: '
export LOTI_USER_PASSWORD
npm run user:create -- --name Gabriel --email email-real-do-membro@example.com
unset LOTI_USER_PASSWORD
```

Repita para os demais membros com emails reais. O comando cria o espaço se necessário; contas existentes mantêm a senha e não duplicam associação. Signup público permanece desabilitado.

## Importar a planilha original

```sh
cp legacy/mapping.example.json legacy/mapping.local.json
# Preencher o mapeamento com usuários já criados e revisar datas/status.
npm run import:legacy -- --mapping legacy/mapping.local.json
# Revisar legacy/import.report.json antes de gravar.
npm run import:legacy -- --mapping legacy/mapping.local.json --execute
```

O padrão é simulação. A origem é `legacy/source/Favoritos_Hubbuy_original.xlsx`; disponibilize esse arquivo privado no ambiente operador. O mapping deve usar contas existentes e confirmar se `Compra Out26` ainda está ativa. A execução é transacional e idempotente, e não altera itens de compras finalizadas.

## Validação

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

O E2E usa uma base local isolada em `data/e2e.sqlite`. Testes de legado usam o workbook privado fornecido localmente. Playwright cobre fluxos de login, permissões, favoritos, compra, totais, checklist, histórico, preferência e navegação mobile.

## Publicar no Vercel

Produção atual: [loti-omega.vercel.app](https://loti-omega.vercel.app). Projeto `loti`, produção na branch `feat/mvp`; bancos `loti-prod` e `loti-dev` na região AWS São Paulo. As migrations estão aplicadas e as variáveis server-side estão configuradas. Usuários reais precisam ser provisionados pelo operador.

Importe o repositório GitHub como projeto Next.js no Vercel. Crie `loti-prod` e `loti-dev` no Turso, aplique migrações a cada banco e configure variáveis server-side. A URL final do projeto será a origem de `BETTER_AUTH_URL`; após ajustá-la, faça novo deploy. Verifique `/login`, `/api/health`, sessão e uma leitura/escrita contra `loti-prod`. O guia completo está em [docs/13_DEPLOYMENT.md](docs/13_DEPLOYMENT.md).

Use a restauração/backup do Turso para a base remota. O runtime não depende de arquivos SQLite, volumes persistentes ou Docker.

## Login e visuais

A tela de login mantém a cena editorial Loti com objetos e avatares locais, órbitas CSS e fallback estático para reduced motion. Favoritos, Compra e Histórico usam marcadores funcionais SVG pequenos e neutros via `resolveProductCategory()`; sem fotos, thumbnails ou renders 3D operacionais. Veja [17_LOGIN_ORBITAL_MOTION.md](docs/17_LOGIN_ORBITAL_MOTION.md) e [07_PRODUCT_VISUALS.md](docs/07_PRODUCT_VISUALS.md).
