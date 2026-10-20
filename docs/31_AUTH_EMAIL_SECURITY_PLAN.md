# Emails transacionais e segurança da autenticação

Autorização: 20 de outubro de 2026, guia anexado pelo usuário. Escopo: recuperação autônoma, limitação persistente e verificação de email nos convites (prioridades 1, 2 e 5 da avaliação). Nenhuma publicação ou migração de produção está autorizada nesta entrega.

## Auditoria e decisões

- Better Auth e adapter Drizzle **1.7.7**; Resend SDK **6.34.1**. Convites são personalizados, sem plugin organization.
- Preservar origem oficial `https://useloti.com`, IDs, sessões, associações existentes, ownership, permissões e domínio financeiro. Não rotacionar `BETTER_AUTH_SECRET`.
- O signup público continua desabilitado. A instância privada cria somente conta/credencial pendentes sob um convite válido. A pessoa pode autenticar essa conta para confirmar o email, mas não tem dados do grupo enquanto não houver associação.
- A obrigatoriedade é aplicada à **nova associação** no serviço de convites. `requireEmailVerification` global permanece falso para preservar membros antigos não verificados. Nenhuma conta antiga é marcada artificialmente como verificada.
- Novos convidados registram conta, autenticam, solicitam a verificação nativa, confirmam o email e voltam ao convite. O backend consulta `user.email_verified` dentro da transação antes de adicionar a associação e consumir o convite. Usuários existentes não verificados passam pela mesma confirmação; verificados apenas autenticam e aceitam. Convite revogado/expirado continua sem conceder associação após a confirmação do endereço.
- O registro pendente permanece se o envio falhar. A pessoa pode entrar novamente pelo convite e reenviar. Um resultado incerto nunca provoca retentativa automática. Aceite repetido pelo mesmo usuário autenticado retorna sucesso sem duplicar associação; leitura pública de convite consumido continua indicando uso anterior.

## Recuperação e verificação

Rotas públicas: `/forgot-password`, `/reset-password`, `/verify-email`; usam as superfícies compactas existentes. O login mantém sua composição editorial.

Recuperação usa o token nativo de Better Auth, validade **30 minutos**, identificador armazenado com hashing, uso único e revogação de todas as sessões. O usuário faz login normalmente após a troca. A política continua 12–128 caracteres, preservando espaços. `redirectTo` é fixado no servidor para a página local.

A versão instalada consome o token antes das gravações restantes. Por isso o handler HTTP de `/reset-password` executa o Better Auth vinculado a uma transação Drizzle externa; qualquer resposta de erro provoca rollback de token, senha e revogação de sessões. Não há outro mecanismo de hashing ou tokens de recuperação.

A confirmação usa JWT nativo com validade **30 minutos**. Seu hash é registrado em `auth_email_deliveries`; antes da verificação o backend exige registro não consumido e não expirado, e o hook nativo reivindica o registro para aquele usuário. Validação, consumo e atualização do email ficam numa transação externa. Reuso, inclusive após outra confirmação, é rejeitado. Não há login automático após a confirmação.

O endpoint de reenvio exige sessão autoritativa e o próprio email; não envia para terceiros. O callback é construído no servidor, preservando somente um caminho interno de convite validado. Nenhum login dispara reenvio automático.

Respostas de recuperação são genéricas para contas existentes/inexistentes, inclusive quando o provedor ou a cota impedem o envio. O handler aplica um piso de 1,5 segundo. Em HTTP, o envio usa `after` do Next.js, que utiliza `waitUntil` na Vercel, com duração máxima de 30 segundos e timeout do provedor de 8 segundos. A tarefa aguarda todo o envio e captura falhas; não é uma Promise desacoplada. Chamadas internas sem scheduler aguardam o envio diretamente. Sem fila persistente, interrupções de infraestrutura podem perder um envio; o usuário solicita outro após o cooldown.

## Serviço central e cotas

`src/lib/email/service.ts` é o único emissor. Templates conhecidos em HTML e texto, conteúdo escapado, links da origem canônica, remetente fixo `Loti <noreply@useloti.com>`. `Reply-To` é opcional e só deve ser configurado se receber mensagens. Não há endpoint genérico, marketing, rastreamento adicional, retentativa automática ou escolha de remetente pelo cliente.

Migração **0021_fine_puppet_master.sql**: cria apenas `auth_limits` e `auth_email_deliveries`, índices e checks. Não atualiza usuários, convites antigos, associações ou tabelas financeiras. Aplicar explicitamente antes de publicar o código; nunca em requisições.

Contadores são UPSERTs condicionais no Turso/libSQL. Múltiplas dimensões e reserva do envio ficam na mesma transação, reivindicando o ID do envio primeiro. Uma rejeição desfaz a reserva inteira. Emails/IPs são identificados por HMAC com o secret existente. O ID de entrega é hash do tipo e token; nenhum token ou corpo é persistido nessa tabela.

| Controle | Padrão |
| --- | --- |
| Login por email / por IP | 30 / 100 por hora, além do limiter nativo |
| Recuperação por email / por IP | 3 / 5 por hora |
| Verificação por email | 2 por hora e 5 por dia |
| Cooldown entre envios do mesmo tipo/destinatário | 60 segundos completos |
| Convite por destinatário / workspace | 3 / 10 por dia |
| Convites globais | 20 por dia |
| Total de emails | 60 por dia / 1.800 por mês |
| Reserva exclusiva para recuperação | 20 por dia / 600 por mês |
| Chamadas ao provedor | No máximo uma por segundo, sem fila |

Janelas por hora/dia são fixas em UTC; mês é calendário UTC. Cooldown e espaçamento do provedor usam vencimento deslizante. Limites configuráveis estão no `.env.example`. Limites excedidos retornam 429 nos pedidos explícitos; falhas/cota de entrega não revelam existência de conta no reset.

O limiter nativo usa `customStorage.consume` atômico. Hooks de email/login e a política central também cobrem chamadas internas, pois o limiter nativo não cobre `auth.api`. Em Vercel, somente `x-vercel-forwarded-for` é aceito como IP encaminhado; ausência usa um bucket conservador compartilhado. Headers arbitrários do cliente não substituem o IP do edge. IP não é a única dimensão. Redes compartilhadas dividem o limite por IP; os padrões podem ser ajustados após observação.

Idempotência local e `Idempotency-Key` do Resend impedem repetição da mesma entrega. Falhas e respostas incertas **mantêm** a cota reservada, de forma conservadora. Um envio fica `reserved` se houver interrupção antes da confirmação; não é reenviado automaticamente. Os estados são `reserved`, `sent`, `failed`, `uncertain`; registros vencidos há mais de 30 dias são removidos durante novos envios, e contadores expirados são limpos no limiter.

Logs estruturados incluem tipo/status e rejeição do limiter, sem email, senha, URL, token, cookie, secret ou informações privadas do grupo. Consultas operacionais podem agregar cotas no banco; não são feitas consultas à API de usage em cada requisição. Não há serviço de alertas contratado nem automação criada.

## Ambientes e operação

Atualização externa em 20/10/2026: as quatro adições DNS foram autorizadas, salvas e confirmadas no DNS público, preservando os registros anteriores. A Resend confirmou Verified. A chave Loti Production 2026-10 foi criada com Sending access somente para useloti.com e salva como segredo RESEND_API_KEY em Production no projeto loti da Vercel. Auditoria de `loti-prod` autorizada, aguardando sessão no console Turso; o script recusou o ambiente `loti-dev` antes de conectar. Nenhuma migração ou publicação foi autorizada, nenhum modo de envio foi ativado e não houve envio real.

- `RESEND_API_KEY`: backend, chave de envio restrita ao domínio; nunca no Git/chat/frontend.
- `LOTI_EMAIL_MODE=disabled` por padrão; `resend` habilita o transporte.
- Fora de Vercel Production, `LOTI_EMAIL_TEST_RECIPIENTS` deve listar cada destinatário autorizado. Sem allowlist, o transporte não chama o Resend. Produção e Preview devem usar chaves separadas quando habilitados.
- `LOTI_EMAIL_REPLY_TO` deve ficar vazio até comprovar recebimento.
- E2E usa um provedor HTTP simulado em localhost e apenas endereços `@loti.test`. O override local é recusado na Vercel e não altera o provedor real. Nenhum endpoint de caixa postal de teste é publicado pelo aplicativo.
- O operador mantém `user:reset-password` como alternativa segura. `auth:audit` faz somente consultas agregadas, exige banco explicitamente selecionado e não aplica migrações. Consultas de produção dependem da autorização do alvo.

Preparação externa observada: equipe Resend `useloti`, domínio cadastrado na região São Paulo, aguardando DNS. DNS autoritativo identificado em `launch1.spaceship.net` / `launch2.spaceship.net`. MX e SPF atuais pertencem ao encaminhamento Spaceship e devem permanecer intactos. Resend solicitou TXT `resend._domainkey` e CNAMEs `rsend`/`send`; seguir os valores exibidos pelo painel, não exemplos antigos com MX de outra região. DMARC está ausente na consulta inicial; a adição proposta é `v=DMARC1; p=none;`, sem alterar encaminhamentos. Configuração final, estado de verificação e testes reais serão registrados no relatório.

Não publicar antes de revisar contagens, verificar domínio, configurar segredo e modo nos ambientes corretos, aplicar a migração com autorização e aprovar a publicação. Contas antigas continuam com acesso; confirmação voluntária pode ser regularizada no endpoint próprio sem alterar vínculos. Nenhum bulk update de `email_verified` é permitido.

## Validação e fontes

Testes cobrem recuperação, token inválido/expirado/reutilizado, revogação e rollback, pendência sem associação, confirmação nativa, reenvio, sessões incorretas, convites revogados, preservação de identidades, rate limits, concorrência, cotas, idempotência, falha/incerteza e bloqueio de envio em Preview. Playwright usa provedor simulado e inclui a jornada completa e mobile. Registrar resultados executados no relatório, distinguindo mocks de envios reais e produção.

Fontes consultadas, confrontadas com o código instalado: [Better Auth email/password](https://better-auth.com/docs/authentication/email-password), [limiter atômico](https://better-auth.com/docs/concepts/rate-limit), [Resend send API](https://resend.com/docs/api-reference/emails/send-email), [idempotência](https://resend.com/changelog/idempotency-keys), [Next after / waitUntil](https://nextjs.org/docs/app/api-reference/functions/after), [headers Vercel](https://vercel.com/docs/headers/request-headers).
