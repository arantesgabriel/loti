# Loti

Aplicação privada para favoritos pessoais visíveis ao grupo, coleções pessoais, uma compra colaborativa e histórico imutável. A especificação canônica está nos documentos numerados em `docs/`; consulte também [o relatório da implementação](docs/IMPLEMENTATION_REPORT.md).

## Executar localmente

Use Node **24 LTS** e npm. SQLite usa um módulo nativo.

```sh
npm ci
cp .env.example .env
node -e 'console.log(require("node:crypto").randomBytes(48).toString("base64url"))'
```

Copie o segredo gerado para `BETTER_AUTH_SECRET` no `.env`. Mantenha `BETTER_AUTH_URL=http://localhost:3000` e `DATABASE_PATH=./data/loti.sqlite`.

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Abra `http://localhost:3000`. O seed cria Gabriel, Brunna, Amanda, Bola e Vinicius: email `<nome>@loti.test`, senha **`Loti-Dev-Only-2026!`**, seis favoritos. Credenciais exclusivamente de desenvolvimento. O seed é idempotente e bloqueado em produção.

## Estrutura e regras

Next.js App Router, TypeScript strict, Tailwind, componentes base shadcn/Radix, Geist local e Lucide. Better Auth gerencia sessões e senhas; Drizzle e `better-sqlite3` acessam o banco exclusivamente no servidor. Zod valida entradas e React Hook Form mantém os formulários. Webpack é usado explicitamente nos comandos Next.

| Caminho | Responsabilidade |
| --- | --- |
| `src/app` | Rotas protegidas, login e APIs |
| `src/components` | Shell responsivo, favoritos, compra e histórico |
| `src/lib/auth` | Better Auth e sessão obrigatória |
| `src/lib/domain` | Autorização central, serviços transacionais, dinheiro, URLs e visuais |
| `src/lib/db`, `drizzle` | Schema, conexão e migração versionada |
| `public/product-visuals` | 20 arquétipos SVG locais em tons de cinza |
| `scripts` | Migrações, seed, usuários, importação, backup e inicialização |
| `tests` | Unidade, integração SQLite e fluxos Playwright |

Favoritos e coleções só podem ser alterados pelo dono. Membros colaboram na compra ativa. Um índice parcial impede duas compras ativas por espaço. Itens guardam snapshots; editar ou excluir favoritos preserva os dados da compra. Compras finalizadas rejeitam mutações no servidor. Preços são centavos inteiros ou `null`; progresso considera quantidades. Lista/Cards persiste por usuário. Dados atualizam após mutações e ao retornar o foco à janela; atualização em tempo real fica fora do MVP.

## Banco e usuários

```sh
npm run db:generate  # desenvolvimento: gerar migração após mudar schema
npm run db:migrate   # aplicar migrações pendentes; seguro repetir
```

A conexão ativa foreign keys, WAL, synchronous NORMAL e busy timeout de 5 segundos. Desenvolvimento usa `./data/loti.sqlite`; produção exige `/data/loti.sqlite`.

Para criar uma conta privada e vinculá-la ao espaço único, forneça uma senha de 12–128 caracteres pelo ambiente. Exemplo em zsh:

```sh
read -s 'LOTI_USER_PASSWORD?Senha inicial: '
export LOTI_USER_PASSWORD
npm run user:create -- --name Gabriel --email email-real-do-membro@example.com
unset LOTI_USER_PASSWORD
```

Troque o email pelo valor real e repita para os demais membros. O comando cria o espaço se necessário; contas existentes mantêm sua senha e não duplicam associação. Não há cadastro público, nem pelo endpoint de signup. Em produção, execute dentro do container em `/app`, com o volume montado e as variáveis do serviço; `railway run` local não acessa esse volume.

## Importar a planilha original

```sh
cp legacy/mapping.example.json legacy/mapping.local.json
# Editar emails, datas, status das duas compras e estados do carrinho.
npm run import:legacy -- --mapping legacy/mapping.local.json
# Revisar legacy/import.report.json antes de gravar.
npm run import:legacy -- --mapping legacy/mapping.local.json --execute
```

O padrão é **simulação**: migra o schema e valida todas as linhas, sem inserir dados de domínio. `--source` indica outro arquivo e `--report` outro relatório. Origem padrão: `legacy/source/Favoritos_Hubbuy_original.xlsx`; disponibilize-o no ambiente do comando.

O exemplo contém placeholders intencionais. Configure emails de contas já criadas e associadas ao espaço, `createdBy`, e para cada compra: status `active` ou `finalized`, data ISO UTC de criação, data de finalização ou `null`, e `cartStatus` `pending` ou `added`. **Confirme se Compra Out26 ainda está ativa.** Não deduza datas ou estado do carrinho pelo nome da aba. `sheetOwners` resolve abas sem dono reconhecido; `qcValues` pode mapear rótulos para `not_reviewed`, `approved` ou `rejected`. Sem mapeamento, QC original fica nas notas.

O arquivo fornecido contém 125 favoritos, três coleções e 26 itens em duas compras. Seis entradas auxiliares são ignoradas com motivo; quatro avisos registram hyperlinks divergentes e preços provenientes de fórmulas salvas. O relatório apresenta contagens por pessoa/coleção, totais, preços ausentes, avisos e bloqueios. Mapeamento incompleto impede inserções. A execução é transacional; IDs estáveis de aba/célula tornam a repetição idempotente. O importador não atualiza registros existentes, não reabre compras nem acrescenta novas linhas a um histórico já finalizado. Preserve a estrutura do arquivo original ao repetir a importação.

## Verificar

```sh
npm run check       # typecheck + lint + testes + build
npx playwright install chromium
npm run test:e2e    # servidor/banco isolados na porta 3100
```

Os sete cenários cobrem login, permissões, favorito → compra para outra pessoa, colaboração, quantidades/preços, checklist, finalização, histórico, preferência e ilha mobile. O teste responsivo verifica 320, 390, 768, 1024 e 1440 px, teclado e erros JavaScript; salva quatro capturas em `artifacts/qa/`. HTML/trace de falhas ficam em `playwright-report/` e `test-results/`. O servidor E2E reinicia **apenas** `data/e2e.sqlite`, nunca o banco de desenvolvimento. Os sete testes de legado usam a planilha privada fornecida localmente em `legacy/source/`; sem esse arquivo, são reportados como skipped e os demais 83 testes continuam executando. A planilha não é versionada nem incluída na imagem Docker.

## Publicar no Railway

1. Autentique sua conta e conecte este repositório/branch a um serviço Railway.
2. Anexe um volume persistente ao serviço em **`/data`**.
3. Configure `BETTER_AUTH_SECRET` aleatório com pelo menos 32 caracteres, `BETTER_AUTH_URL=https://dominio-real`, e `DATABASE_PATH=/data/loti.sqlite`. Use o domínio público do Railway ou o seu. O segredo e a URL temporários de build não são configuração de produção.
4. Publique com `Dockerfile` e `railway.json`. Mantenha **uma réplica** e uma região. A imagem compila dependências nativas e remove ferramentas de desenvolvimento após o build. `npm start` valida o ambiente e aplica migrações após montar o volume, antes de servir tráfego. Não configure migrações em pre-deploy.
5. Confira `GET /api/health` → `{"status":"ok"}`; crie as cinco contas pelo comando de operador dentro do container. Faça login pelo domínio HTTPS e valide uma rodada com dados de teste antes do uso real.
6. Para importar, disponibilize a planilha e o mapping revisado no container. Faça backup, simule, revise e execute.
7. Ative backups e ensaie a restauração abaixo.

O serviço escuta `PORT` e `0.0.0.0`. Healthcheck verifica o schema sem divulgar usuários ou dados. Reinícios preservam o banco no volume. Conta, domínio, volume e agendamentos dependem da configuração do operador.

Referências: [volumes](https://docs.railway.com/volumes), [configuração por arquivo](https://docs.railway.com/config-as-code/reference), [backups](https://docs.railway.com/volumes/backups).

## Backup e restauração

Na aba **Backups** do serviço, habilite os agendamentos diário, semanal e mensal conforme seu plano. Para recuperar, escolha um backup pela data, use **Restore**, confira a troca de volume proposta em **Details** e aplique **Deploy**. Guarde o volume anterior até verificar a recuperação. Faça esse ensaio em ambiente de teste antes do uso real.

Para uma cópia SQLite consistente, inclusive com WAL aberto:

```sh
npm run db:backup -- --output /data/backup-pre-import.sqlite
```

Destino deve ser diferente do banco ativo e ficar em diretório existente. Guarde cópias importantes fora do mesmo volume, em local protegido. Ensaio local:

```sh
mkdir -p data
DATABASE_PATH=./data/loti.sqlite npm run db:backup -- --output ./data/backup.sqlite
cp ./data/backup.sqlite ./data/restored.sqlite
DATABASE_PATH=./data/restored.sqlite npm run db:verify
```

Para substituir um banco em uso por uma cópia, pare todas as conexões. Guarde a versão atual e seus `-wal`/`-shm`, coloque a cópia no caminho configurado, remova apenas os sidecars antigos desse destino e reinicie. Nunca copie somente o arquivo principal de um SQLite ativo: use a API de backup ou o restore do volume. Após restaurar, confira integridade, foreign keys, healthcheck, login e uma compra histórica. A restauração também retrocede dados e sessões salvos após aquele backup.
