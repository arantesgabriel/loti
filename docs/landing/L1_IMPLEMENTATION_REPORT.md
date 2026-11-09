# L1 — Preparação e isolamento

Implementação local em **23/10/2026**, mediante a instrução explícita “inicie a implementacao de L1”. Branch `feat/landing-page`, HEAD inicial `6f0d10b67e4f22259fa5b67f4e565029d55272db`. Estado: execução técnica concluída, aguardando revisão do responsável. Nenhuma fase posterior ou publicação foi executada.

## Resultado revisável

`/landing` é uma página pública estática fora do grupo protegido `(app)`, com `noindex, nofollow`. Contém somente uma base de composição: marca textual Loti, H1 aprovado, apoio factual e link **Entrar** para `/login`. O header/hero completos, capturas, ferramentas, FAQ, jornada e motion pertencem às próximas fases.

| Arquivo novo | Responsabilidade |
| --- | --- |
| [layout.tsx](../../src/app/(marketing)/layout.tsx) | Boundary de marketing e política inicial de não indexação. |
| [marketing.module.css](../../src/app/(marketing)/marketing.module.css) | Tema claro local, sem alterar o elemento HTML ou preferência do app. |
| [landing/page.tsx](../../src/app/(marketing)/landing/page.tsx) | Rota pública, título, descrição e não indexação explícita. |
| [landing-page.tsx](../../src/components/landing/landing-page.tsx) | Composição estática mínima e primitiva Button existente com link nativo. |
| [landing.module.css](../../src/components/landing/landing.module.css) | Espaçamento, tipografia e adaptação da base às larguras disponíveis. |

Reutiliza a Geist local e o root existentes. Não importa WorkspaceProvider, sessão, banco, serviços, APIs, finanças ou QC. A cadeia própria de imports termina em Button/Slot/cva/utils e estilos; não há fetch, client controller, leitura ou escrita de storage no código novo. O ThemeProvider e seu bootstrap compartilhados permanecem intactos.

## Política de tema

O boundary redefine apenas os papéis usados nesta base, com os valores claros atuais de `src/app/theme.css`: background `#faf8f5`, surface `#fff`, foreground `#221d21`, muted `#625b60`, brand/on-primary `#1c0113`, primary `#f77014`, hover `#d93807`, on-primary-hover `#fff` e focus-ring `#a63607`. Define `color-scheme: light` localmente.

São valores explicitamente locais porque os tokens do root mudam com a preferência dark. Não foi alterado `theme.css`, `<html>`, `loti.theme` ou `setThemePreference()`. Os valores de hover/secundário antigos do briefing não substituem a paleta atual. O mapa será ampliado somente quando novas superfícies forem necessárias em fases autorizadas.

## Baseline e verificações realizadas

- Antes da implementação, lint e typecheck passaram. O build inicial encontrou `EPERM` ao criar `.next/server/app/api`; a tentativa com diretório separado também encontrou a restrição. Com execução local fora do sandbox, o baseline compilou e concluiu normalmente usando `.next-landing-l1`.
- Após a implementação, `npm run lint`, `npm run typecheck` e `npm run build` passaram. `/landing` aparece como estática na saída do Next. A construção adicionou uma página estática ao baseline (6 → 7 na etapa de geração).
- Ambos os builds isolados usaram `TURSO_DATABASE_URL=file::memory:`, token vazio, segredo sintético local, origem localhost e email desativado. Nenhuma migration, seed, conta, workspace ou fixture de banco foi criada. Next carrega seus arquivos de ambiente pelo comportamento padrão, mas a conexão efetiva foi explicitamente sobrescrita para memória e nenhuma credencial foi exibida.
- A compilação de todo o app pode inicializar clientes de banco de outros módulos em memória. A landing não depende deles: sua renderização foi pré-gerada e o trace `page.js.nft.json` tem 148 arquivos, sem libSQL, Better Auth, Drizzle, domínio QC ou serviço de email.
- Next acrescenta automaticamente os tipos de seu diretório de saída ao tsconfig e atualiza `next-env.d.ts` durante o build. Os bytes originais desses dois arquivos foram preservados e restaurados após cada comando. A comparação SHA-256 dos **417 arquivos rastreados preexistentes** não encontrou nenhuma alteração em relação ao início desta execução, incluindo as mudanças locais preexistentes do usuário.
- Um roteiro Chromium isolado, sem o harness E2E que provisiona banco, verificou 320/390/768/1024/1440 px. Todas as visitas anônimas à landing retornaram 200, com um H1, Geist, robots corretos, nenhum overflow, erro JS, chamada `/api/*` ou pedido externo.
- Em todas essas larguras, o root e storage continuaram em dark enquanto a landing manteve fundo claro `rgb(250, 248, 245)` e texto `rgb(34, 29, 33)`. Em 1440 px, Tab/Enter abriu o login em dark e a volta manteve a landing clara e a preferência intacta. Foco visível e alvo do link de pelo menos 44 px foram conferidos.
- Reduced motion não apresentou animações; sem JavaScript, título e link continuaram utilizáveis e o link abriu `/login`. O redirect HTTP de `/` permanece 307 para `/favorites`; o acesso anônimo a `/favorites` permanece 307 para `/login`.
- Capturas de QA da **base L1**, sem demonstração de produto ou dados, foram inspecionadas a 390 e 1440 px. Não são assets públicos ou capturas finais da landing.

Evidências locais ignoradas pelo Git: `artifacts/qa/landing-l1/smoke.mjs`, `smoke-results.json`, `base-390.png`, `base-1440.png` e inventário de hashes. O roteiro usa o Chromium já instalado, sem baixar dependências. Seu acesso a localhost precisou de execução fora do sandbox após `ERR_NETWORK_ACCESS_DENIED`. Não houve rejeição do revisor de aprovação.

## Limites e próximo gate

Esta validação cobre o isolamento de L1, não uma regressão autenticada completa ou disponibilidade em produção. Não foram executados integration/E2E do projeto, migrations, seeds, operações financeiras, QC/R2, envio de email, instalação, commit, push, PR, preview hospedado ou deploy. Cadastro e ferramentas públicas continuam dependências externas ao código desta fase.

As mudanças locais iniciais em `docs/AUTH_EMAIL_IMPLEMENTATION_REPORT.md`, `tsconfig.json`, `planning/` e `reset-password.sh` foram preservadas. As fontes integrais em `docs/landing/sources/` permanecem intactas.

Próximo passo: revisão do resultado L1 e autorização explícita de **L2 — Base visual, conteúdo e mídia demo**. Antes de criar dados ou capturas do produto, definir ambiente descartável, autorização de preparação do schema caso necessária, dataset sintético e interpretação de Cards mobile em uma coluna. A Fase criativa 7 não foi encerrada por inferência.

Rollback de L1: remover somente os cinco arquivos novos de marketing listados acima. Nenhum import existente, redirect, dado ou configuração precisa ser revertido.
