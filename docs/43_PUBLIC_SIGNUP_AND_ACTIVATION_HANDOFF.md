# Frente 5 — Cadastro público e ativação por email

Autorização recebida em 5 de novembro de 2026 pelo pedido colado do usuário. Escopo desta entrega: implementação local e validação em ambientes descartáveis. Não houve migração remota, alteração de conta real, configuração externa ou publicação.

## Objetivo

Permitir que uma pessoa crie uma conta Loti e comece em um espaço pessoal, mantendo o acesso a qualquer grupo condicionado ao convite individual já existente. O cadastro público não é um mecanismo para entrar no grupo.

## Experiência

- `/login` apresenta **Criar conta** e explica que uma conta pode começar no espaço pessoal ou entrar no grupo por convite.
- `/signup` pede nome, email, senha e confirmação. Reutiliza a cena editorial e os tokens do login; a confirmação mantém o formulário simples e oferece reenvio genérico.
- O cadastro cria a conta sem iniciar sessão. Uma confirmação nativa do Better Auth, válida por 30 minutos e de uso único, ativa o endereço.
- Um login antes da confirmação abre uma tela de ativação com status, reenvio autenticado e saída; nenhum conteúdo do app é carregado.
- Depois da confirmação, a pessoa entra normalmente e abre Favoritos no espaço pessoal. Para entrar num grupo, ainda precisa aceitar um convite válido e autenticado.
- Verificar o link em outro navegador não cria sessão nele. Em seguida, a pessoa pode entrar no navegador original e continuar.

## Persistência e autorização

A migração local `0030_public_signup_activation.sql` cria `account_activation_requirements` (`user_id`, `source`, `created_at`). A presença da linha e `user.email_verified = false` representam ativação pendente. Fontes aceitas: `public_signup` e `invitation`. A ausência da linha preserva a compatibilidade de contas históricas e operacionais.

O cadastro executa Better Auth, a linha de ativação, o espaço pessoal e a preferência de espaço ativo na mesma transação Drizzle. Se o provisionamento falhar, a conta e a credencial também sofrem rollback. O espaço pessoal é exclusivo do titular e não tem linhas em `workspace_members`. Tentativas simultâneas para o mesmo email usam uma fila local indexada pelo HMAC do email; contenções `SQLITE_BUSY`/`SQLITE_LOCKED` repetem a transação até oito vezes com espera limitada. A tentativa repetida consulta a conta dentro da nova transação e responde de forma genérica se a primeira já foi criada; a operação mantém uma única conta, espaço pessoal e envio de confirmação.

`requireUser()` e a autorização central negam acesso enquanto a ativação estiver pendente. O layout consulta primeiro a sessão e o estado de ativação; só carrega dados de domínio depois de confirmar o email. A tela de ativação permite somente reenviar, consultar o estado e sair. Contas antigas não são verificadas nem migradas em lote.

Contas criadas pelo fluxo de convites também recebem uma linha `invitation` e seu espaço pessoal dentro da transação de criação. Nenhuma associação ao grupo é adicionada antes da confirmação. A aceitação autenticada posterior adiciona a associação e muda o contexto ativo para o grupo. Contas existentes mantêm senha e identidade.

## Segurança

- `POST /api/activation/signup` valida nome, email, senha de 12–128 caracteres e confirmação coincidente; exige a origem oficial.
- Limites persistentes por email e IP usam HMAC e `auth_limits`. A entrega segue o serviço transacional existente, com cooldown, cotas e IDs de token hasheados.
- Duplicatas recebem a mesma resposta genérica e não alteram nome, senha, verificação, associações ou workspaces.
- `POST /api/activation/resend` também responde de forma genérica, com limites por IP/email e cooldown; só envia para contas pessoais pendentes.
- A verificação continua no endpoint nativo `/api/auth/verify-email`, com estado consumível/expiração persistido pelo serviço existente. O endpoint direto `/api/auth/sign-up/email` permanece desabilitado no handler público.
- Não há login automático após cadastro ou confirmação. Nenhuma senha, token, link, email ou corpo privado é escrito nos logs de aplicação.

## Rotas e componentes

| Superfície | Comportamento |
| --- | --- |
| `/signup` | Formulário e confirmação genérica com reenvio |
| `/api/activation/signup` | Validação, limites e criação atômica |
| `/api/activation/resend` | Reenvio genérico de cadastro pendente |
| `/api/activation/status` | Consulta autenticada do estado atualizado |
| `/verify-email` | Confirmação nativa, com cópia adequada para cadastro ou convite |
| `(app)` layout | Bloqueia dados de domínio enquanto ativação estiver pendente |

Principais arquivos: `src/lib/auth/activation.ts`, `registration.ts`, `config.ts`, `session.ts`, `src/lib/domain/authorization.ts`, `personal-workspaces.ts`, `invitations.ts`, `src/lib/db/schema.ts` e `drizzle/0030_public_signup_activation.sql`.

## Validação desta entrega

- `npm run lint` e `npm run typecheck`: passaram.
- `npm run build`: passou em `.next-front5-qa`; o build incluiu `/signup` e as três rotas `/api/activation/*`.
- Testes unitários: 35 arquivos e 243 testes passaram.
- Regressões de cadastro, email, convites e sessão: 5 arquivos e 37 testes passaram, incluindo duplicatas simultâneas e retry de lock SQLite. Os testes focados de exclusão HubBuy e descarte com autorização também passaram: 2 arquivos e 20 testes.
- Playwright: o fluxo de cadastro, confirmação, bloqueio pendente, verificação sem sessão e entrada no espaço pessoal passou. As larguras 320, 390, 768 e 1440 px não tiveram overflow horizontal; capturas estão em `artifacts/qa/signup-*.png`.
- A suíte ampla de integração não ficou totalmente verde neste Windows: os testes multiprocesso existentes de exclusão HubBuy e reembolsos de pacote ainda atingiram o limite de 5 segundos ou `SQLITE_BUSY` (14 falhas na repetição isolada). A suíte isolada de ajustes de saldo concorrentes passou. Os dois testes de autorização que falharam na primeira execução foram corrigidos e as respectivas suítes focadas passaram.

E2E usou bancos descartáveis novos em `data/e2e-refunds-*.sqlite` e somente a caixa postal simulada local com destinatário `@loti.test`.

## Operação futura

Antes de publicar, revisar explicitamente a migração `0030`, configurar email somente nos ambientes autorizados e confirmar origem oficial, limites e tela pública. Aplicação de migração remota, envio para endereços reais, configuração externa e publicação exigem autorização separada.
