# Loti — relatório da implementação

Validação local em 5 de outubro de 2026. MVP funcional implementado; publicação no Railway depende dos dados de produção e acesso do operador. Não houve deploy, push ou uso de credenciais de produção.

## Implementado

- **Favoritos:** criar, consultar, editar/excluir próprios, visibilidade no grupo, Todos/Meus, busca em nome/variação/notas, filtros combinados por pessoa/plataforma/coleção/QC/preço, aviso de duplicidade, abertura do link original, inclusão na compra e preferência Lista/Cards persistida.
- **Coleções:** pessoais, criação/renomeação/exclusão, filtros e navegação dentro de Favoritos; excluir coleção preserva os favoritos.
- **Compra:** uma ativa por espaço, metadados editáveis, item de favorito como snapshot ou manual, pessoa/quantidade/variação/preço/notas, colaboração entre membros, checklist HubBuy, filtros, totais por pessoa e geral, progresso ponderado por quantidade.
- **Histórico:** confirmação explícita com avisos sobre pendências e preços ausentes, ordenação por finalização, reaproveitamento da visualização em modo leitura e rejeição de alterações no servidor.
- **Interface:** português, marca Loti, paleta canônica, Geist local, Lucide, sidebar contextual, ilha flutuante mobile com três destinos, sheets/dialogs acessíveis, foco de teclado e redução de movimento. Vinte arquétipos SVG monocromáticos locais; nenhuma foto de marketplace.
- **Operação:** usuário inicial por CLI, seed protegido, migrações, simulação/importação de legado, backup consistente, verificação de integridade, healthcheck, Docker e configuração Railway.

## Arquitetura e banco

Stack especificada: Next.js 16.3.8, React 19.3.0, TypeScript strict, Tailwind 4, fundação shadcn/Radix, Better Auth 1.7.7, Drizzle 0.45.3, `better-sqlite3` 13.0.3, Zod 4, React Hook Form e Playwright. Versões diretas exatas e lockfile npm; Node 24 LTS. ESLint e Vitest complementam a validação.

Browser → Route Handler/Server Component → sessão Better Auth → autorização central → validação Zod → serviços transacionais Drizzle → SQLite. Dados de domínio e conexões SQLite permanecem no servidor. Não foi criada infraestrutura paralela nem recurso fora do MVP.

Os comandos Next usam Webpack: o Turbopack não funcionou no ambiente de execução restrito. O build de produção Webpack passou tanto no host quanto no Docker. A alternativa SVG pseudo-3D é o fallback explicitamente autorizado pela especificação.

Onze tabelas e uma migração versionada em `drizzle/0000_lean_sir_ram.sql`. Foreign keys, WAL, synchronous NORMAL e busy timeout 5000 verificados. Índice parcial de compra ativa e checks de quantidade, preço e estados estão no banco. Histórico imutável é aplicado por todos os serviços de mutação; snapshots não dependem dos campos atuais dos favoritos.

Local: `./data/loti.sqlite`. Produção: `/data/loti.sqlite` em volume. `npm run db:generate` gera mudanças de schema em desenvolvimento; `npm run db:migrate` aplica migrações. `npm start` valida a configuração de produção, migra no volume montado e só então inicia o servidor.

## Autenticação

Login email/senha, sessão persistente, logout e rotas privadas. Signup público está desabilitado no servidor e ausente da interface. Better Auth faz hashing e mantém sua proteção de limite de tentativas; cookies de produção são Secure e HttpOnly.

`LOTI_USER_PASSWORD` recebe a senha inicial de 12–128 caracteres. Com o ambiente correto, execute `npm run user:create -- --name Gabriel --email EMAIL_REAL`; repita para os demais membros. O comando vincula cada conta ao espaço único e pode ser repetido sem alterar a senha existente. Sintaxe segura para entrada da senha e todos os comandos estão no [README](../README.md).

## Testes e evidências

| Verificação | Resultado |
| --- | --- |
| TypeScript strict | Passou |
| ESLint | Passou, sem avisos |
| Unidade | **52 passaram**: plataformas, canonicalização, arquétipos, dinheiro e progresso |
| Integração SQLite | **38 passaram**: permissões, coleções, snapshots, estados/constraints e legado |
| Playwright Chromium | **7 cenários passaram**, última execução completa em 47,1 s |
| Build Next.js de produção | Passou |
| Build Docker Linux | Passou; dependências de desenvolvimento removidas da imagem final |
| Migrações em banco vazio e repetição | Passaram |
| Seed de desenvolvimento | Passou: cinco membros e seis favoritos; repetição idempotente |
| CLI de usuário | Passou duas vezes: uma conta e uma associação, senha preservada |
| Importador CLI | Simulação, execução e repetição passaram em banco isolado |
| Backup/restauração | Integridade `ok`, zero violações de FK; cópia restaurada verificada |
| Auditoria de dependências de produção | Zero vulnerabilidades reportadas |

Os E2E cobrem os oito fluxos obrigatórios distribuídos em sete cenários: login/favorito, visibilidade e proibição de edição por outro membro, favorito → compra/totais, item para outra pessoa, colaboração, checklist/filtros, finalização/histórico, preferência e navegação mobile. Também verificam rotas privadas, API sem sessão, signup desabilitado, preservação após excluir coleção e foco em diálogos aninhados.

QA responsivo em 320, 390, 768, 1024 e 1440 px: sem overflow horizontal, ilha arredondada, navegação selecionada correta, visuais locais e sem erros JavaScript. As quatro capturas foram inspecionadas em `artifacts/qa/favorites-desktop.png`, `favorites-mobile.png`, `purchase-desktop.png` e `purchase-mobile.png`, comparando hierarquia com os mockups aprovados. Dados, contagens e ordenação seguem o domínio, não os textos acidentais das imagens.

Teste adicional da imagem de produção por HTTPS local: login com cookie Secure/HttpOnly, criação de favorito, snapshot de duas unidades, total de R$ 420,50, histórico read-only, origem externa recusada e signup recusado. Reiniciar o container preservou sessão, favorito e compra no volume. Backup da base em uso foi copiado e validado separadamente. Esses testes usam exclusivamente usuários, segredos e certificado locais de QA.

## Legado

Comando inicial: `npm run import:legacy -- --mapping legacy/mapping.local.json`. Acrescente `--execute` somente após revisar `legacy/import.report.json`. `--source` e `--report` permitem caminhos alternativos. O mapping de exemplo é deliberadamente incompleto e não cria decisões de produção.

Arquivo original inspecionado: sete abas, **151 linhas de domínio**, sendo **125 favoritos** (Gabriel 34; Brunna 91) e **26 itens** (Set26: 25; Out26: 1). Três coleções: Presentes, Build PC e Pesquisar na HubBuy. Há oito preços ausentes, seis entradas auxiliares ignoradas e quatro avisos. Hyperlinks reais prevalecem sobre texto de exibição divergente; preços de fórmulas usam resultados salvos e são avisados, sem inventar quantidade ou recalcular a planilha. Rótulos QC não mapeados ficam nas notas.

Execução isolada criou 125 favoritos, três coleções, duas compras e 26 itens; repetir criou **zero registros**, reconhecendo os 125 favoritos, duas compras e 26 itens existentes. A simulação não inseriu dados de domínio. Bloqueios de usuários/status e conflito com compra ativa foram testados sem gravações parciais. Os sete testes de legado exigem a planilha local; sem ela, ficam explicitamente skipped. Os 90 testes deste relatório passaram com o arquivo fornecido presente.

Antes de produção, fornecer mapping de rótulos para emails reais, operador/membro, datas e estados de carrinho; confirmar especialmente se **Compra Out26** é ativa ou histórica. A planilha recebida continua preservada localmente e é excluída do Git e da imagem Docker. Sua inclusão no histórico Git foi recusada pela revisão automática de aprovação por risco de exposição persistente do artefato privado. O importador é ferramenta de operador, sem UI de importação ou abertura de compras finalizadas.

## Railway e passos humanos restantes

`Dockerfile` e `railway.json` preparam um serviço Node, uma réplica, `/data/loti.sqlite`, migrações no start, `/api/health`, política de reinício e dependências nativas. A imagem e o ciclo de start foram testados localmente. O Railway real não foi acessado porque não há conta/projeto/credenciais fornecidos.

1. Conectar a branch ao serviço Railway, montar volume em `/data` e manter uma réplica/região.
2. Definir o segredo real Better Auth e a URL HTTPS final; configurar `DATABASE_PATH=/data/loti.sqlite`.
3. Publicar e conferir healthcheck; executar a criação das cinco contas no container montado, com emails/senhas reais.
4. Opcionalmente fornecer a planilha e o mapping aprovado, fazer backup, simular e importar.
5. Habilitar backups diário/semanal/mensal e ensaiar restore do volume em ambiente de teste, conferindo login e histórico após recuperar.

O [README](../README.md) contém os comandos e o procedimento de restore. [Documentação oficial de backups Railway](https://docs.railway.com/volumes/backups) orienta a escolha do snapshot, revisão da troca de volume e novo deploy. Backup local consistente foi testado; agendamentos e restore no Railway dependem do operador.

## Limitações reais e acompanhamento

- Deploy/domínio/backups Railway e usuários reais ainda dependem das entradas humanas acima.
- SQLite exige uma réplica e colaboração sem realtime; os dados atualizam ao retornar à janela ou recarregar.
- O legado exige revisão das decisões e avisos. IDs de aba/célula pressupõem o arquivo original preservado; repetição não sobrescreve registros já importados.
- A auditoria completa ainda reporta cinco avisos de severidade alta na cadeia de ferramentas ESLint/Next (braces/fast-glob), sem atualização estável compatível disponível. Essas ferramentas são removidas da imagem final; a auditoria de produção reporta zero. Overrides compatíveis corrigiram uuid/esbuild sem downgrade da stack.

Após o MVP: acompanhar as atualizações dessas ferramentas e validar regularmente a restauração de backups. Trocar os SVGs por renders locais mais refinados é opcional e preserva os mesmos nomes de arquivo. Nenhum desses itens amplia o escopo implementado.

## Refatoração do login — 5 de outubro de 2026

Cena editorial implementada em `OrbitalScene`, CSS próprio de login e doze SVGs locais (14 KB). Desktop split, mini cena elíptica em tablet/mobile, três órbitas de 44/72/108 s com sentidos alternados e contrarrotação, reações de foco/loading e composição estática para reduced motion. O handler de login foi comparado com a versão anterior e permanece idêntico; nenhuma regra, configuração, sessão, cookie ou redirect de autenticação mudou.

Validação desta refatoração: lint, typecheck, 90 testes Vitest (52 unidade + 38 integração), **12 E2E Chromium** e build de produção passaram. Migrações passaram em banco temporário vazio e em repetição. QA visual inspecionou 390/768/1024/1440 px e reduced motion; o teste também cobriu 320 px. Capturas locais `artifacts/qa/login-*.png`. Não foram repetidos Docker, deploy Railway ou testes HTTPS de produção nesta refatoração; os resultados anteriores acima pertencem ao baseline do MVP.

Componentes, sistema de motion, assets, comportamento responsivo, limites da validação e TODOS os documentos alterados estão registrados em [17_LOGIN_ORBITAL_MOTION.md](17_LOGIN_ORBITAL_MOTION.md).
