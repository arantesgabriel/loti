# Auditoria de autenticação — domínio oficial

Data: 20 de outubro de 2026. Branch: `codex/auth-official-domain`.

## Diagnóstico

- Better Auth e adaptador Drizzle instalados: **1.7.7**, confirmados nos pacotes locais. Referência oficial da mesma versão: [opções v1.7.7](https://github.com/better-auth/better-auth/blob/v1.7.7/docs/content/docs/reference/options.mdx). Os padrões foram conferidos também no código instalado (`context/helpers.mjs`, `cookies/index.mjs`, `api/middlewares/origin-check.mjs`).
- Servidor: `src/lib/auth/config.ts` / `index.ts`. `authOrigin()` centraliza a base do Better Auth e as verificações de origem das APIs da aplicação. `BETTER_AUTH_URL` tem prioridade; Preview usa o alias exato de branch, com fallback para a URL do deployment; localhost usa 3000 e o servidor E2E configura 3100 explicitamente.
- Cliente: `createAuthClient()` sem URL absoluta, portanto usa a origem atual. Não há `NEXT_PUBLIC_*` de autenticação ou domínio antigo no código executável.
- `trustedOrigins` adicional não estava configurado e continua desnecessário: Better Auth confia na origem da `baseURL`. Não foram adicionados domínio antigo, secundário, localhost em produção, curingas ou hosts derivados da requisição. A biblioteca também admite `BETTER_AUTH_TRUSTED_ORIGINS`; não configurar essa variável com origens adicionais para este aplicativo. Não foi feita nova inspeção das variáveis remotas nesta etapa.
- Login navega para `/favorites` ou um caminho de convite completo validado; logout navega para `/login`. Convites usam a origem central. Callbacks externos são rejeitados pelo Better Auth. OAuth, verificação automática de email e recuperação por email não estão configurados; a recuperação existente é assistida pelo operador.
- Sessões continuam no banco, duram 14 dias e têm `updateAge` de um dia. Cookie cache e `crossSubDomainCookies` não estão habilitados. Cookie HTTPS: `__Secure-better-auth.session_token`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, sem atributo `Domain`; HTTP local usa `better-auth.session_token` sem `Secure`. Sessões do domínio antigo não são transferidas ao novo.

## Alterações necessárias e realizadas

1. `src/lib/auth/origin.ts`: produção Vercel exige `BETTER_AUTH_URL` explícita e HTTPS. Antes, a ausência da variável podia selecionar silenciosamente um alias de deployment/branch; URLs com protocolos não web também eram aceitas pelo helper. Preview e portas locais mantêm seu comportamento.
2. `src/lib/auth/config.ts`: removido o override de `useSecureCookies` baseado exclusivamente em `NODE_ENV`. A versão instalada já deriva o atributo do protocolo da base explícita. Isso preserva HTTPS seguro em produção e Preview e evita tanto cookies inseguros em desenvolvimento HTTPS quanto incompatibilidade em testes de build local servido via HTTP.
3. `tests/unit/auth-origin.test.ts`: prioridade da URL oficial, falha fechada de produção, Preview e portas locais.
4. `tests/integration/auth-domain.test.ts`: cookies/expiração, identidade persistente, login/logout, rejeição de origens não autorizadas com cabeçalhos de proxy forjados e callbacks externos. A proteção de origem é habilitada no contexto apenas do teste, pois a biblioteca a desliga por padrão sob Vitest; o rate limiting real permanece habilitado e cada requisição sintética usa um IP de teste distinto.
5. `tests/e2e/auth-session.spec.ts`: persistência após refresh, entre abas e restauração de contexto com cookies persistidos apenas em memória; cookie HttpOnly inacessível ao JavaScript; logout revoga o acesso também no contexto restaurado.
6. `README.md`, `docs/13_DEPLOYMENT.md` e `docs/16_HUMAN_INPUTS.md`: domínio oficial e contrato por ambiente atualizados. Relatos históricos datados em `IMPLEMENTATION_REPORT.md` não foram reescritos como se descrevessem a configuração atual.

Preservados: cliente, callbacks/rotas relativas, regras de cadastro, hooks de perfil, rate limiting, permissões, duração/renovação de sessão, dados, IDs e schema. Nenhuma dependência adicionada. Nenhuma configuração de DNS, Vercel ou secret foi modificada. Nenhuma migration, seed ou alteração manual foi aplicada a bancos existentes; as fixtures dos testes usam somente bancos locais descartáveis e seu próprio preparo de schema/dados sintéticos.

## Verificações automatizadas

- `npm run typecheck`: passou.
- `npm run lint`: passou.
- Vitest direcionado: **37 testes passaram em 7 arquivos** (`auth-origin`, `auth-redirect`, `profile-validation`, `auth`, `auth-domain`, `profile`, `invitations`).
- Playwright Chromium: **13 testes passaram** (`auth-session`, `login`, `profile`, `invitations`). Executado contra build local com `LOTI_E2E_PRODUCTION=1` e `LOTI_E2E_DATABASE_URL=file:./data/e2e-refunds-auth-domain-20261020-0905.sqlite`; esse modo não publica o aplicativo.
- Build Next.js de produção: passou sem avisos de secret na execução final. Usou secret aleatório temporário e banco em memória somente no processo do build; nenhuma variável persistida foi alterada.
- Limitações do ambiente resolvidas: Vitest teve erro de arquivos temporários no sandbox; uma repetição de build teve EPERM em arquivos gerados `.next`. Ambos passaram fora do sandbox. Um build inicial terminou com avisos de ausência de secret local; o build final isolado passou sem esses avisos.
- A suíte completa de todos os domínios de negócio não foi executada nesta alteração restrita à autenticação.

## Verificações no navegador interno — produção atual

O operador realizou o login de uma conta existente diretamente em `https://useloti.com`. A sessão autenticada já estava disponível ao iniciar esta etapa; a senha não foi solicitada nem lida pelo agente.

- `/favorites` abriu autenticado no domínio oficial e persistiu após recarga.
- Uma segunda aba abriu `/profile` com a mesma sessão.
- `/group` exibiu o workspace existente com cinco membros; favoritos existentes continuaram visíveis. Nenhum dado de negócio foi alterado.
- Logout autorizado pelo operador retornou a `https://useloti.com/login`.
- A primeira aba, ao recarregar a rota protegida, também foi enviada ao login, demonstrando invalidação da sessão compartilhada.
- Uma tentativa com credenciais sintéticas inválidas foi rejeitada com `Email ou senha incorretos.`, permanecendo no domínio oficial.
- Nenhum redirecionamento ao domínio antigo nem erro de origem/CSRF/CORS foi observado nesses fluxos.

Os atributos completos dos cookies foram verificados nos handlers reais do Better Auth em integração (HTTPS e HTTP) e no navegador local (HTTP); não foram extraídos da sessão de produção pela API limitada do navegador interno. O navegador real do usuário não foi reiniciado; a restauração de contexto foi validada localmente. As leituras de produção confirmam acesso aos dados existentes, mas não constituem uma comparação integral do banco antes/depois.

## Implantação e resultado por frente

| Frente | Estado |
| --- | --- |
| Trusted Origins | Origem oficial e rejeições validadas localmente; proteção adicional da configuração de produção corrigida, aguardando validação após deploy. |
| Cookies e sessões | Padrões e ciclo completo validados localmente; sessão atual validada em produção. Ajuste do atributo Secure por protocolo aguarda deploy; inspeção completa dos atributos em produção e reinício real permanecem pendentes. |
| URLs e redirecionamentos | Concluída e validada nos fluxos existentes; URLs relativas e whitelist de retorno preservadas, documentação corrigida. |

As mudanças de runtime exigem novo deployment, **não realizado**. A variável Production `BETTER_AUTH_URL=https://useloti.com` já foi ajustada pelo operador e não precisa ser repetida. Nenhuma alteração adicional de variável foi identificada como necessária. Preview deve continuar com banco/secret isolados e origem exata própria, sem herdar a URL de produção. Não foi aberto um deployment Preview remoto nesta etapa.

Depois de um deployment explicitamente autorizado, repetir login de conta existente, credenciais inválidas, atributos dos cookies HTTPS, reload, abas, reinício real do navegador, logout e rejeição da sessão revogada, além de retorno seguro de convite. Não criar nem recriar contas como parte da mudança de domínio e não compartilhar cookies entre os domínios.
