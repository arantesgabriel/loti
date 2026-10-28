# Relatório — Resend e segurança da autenticação

## Validação de Dev — 22/10/2026

O usuário informou que as migrações já foram aplicadas e solicitou validar em `https://dev.useloti.com`, sem ler o arquivo `.env`. Nenhum `.env` foi lido nesta rodada; testes locais usaram uma cópia do Git em `artifacts/qa/auth-validation-20261022/source`, sem esse arquivo e com `DOTENV_CONFIG_PATH` apontando para caminho inexistente. Nenhuma migração foi executada nem houve alteração em produção.

A solicitação inicial em Dev retornou HTTP 403 na função de autenticação, com firewall Allowed. Foi configurado um override de `BETTER_AUTH_URL=https://dev.useloti.com` somente no Preview da branch `dev`, preservando a verificação estrita de origem. Também foram criados `LOTI_EMAIL_MODE=resend` e `LOTI_EMAIL_TEST_RECIPIENTS` nesse mesmo escopo. A chave de Preview foi criada e preenchida pelo usuário; não foi revelada pelo agente. Após republicar o Preview, a solicitação para endereço sem conta passou a retornar a resposta genérica esperada.

O usuário confirmou encaminhamento Spaceship de `noreply@useloti.com` para seu Gmail e informou que o remetente não possui conta no app. A allowlist foi então substituída pelo endereço da conta existente de Dev autorizado pelo usuário. Somente esse destinatário fica permitido; o remetente permanece `Loti <noreply@useloti.com>`.

Validação local desta rodada: **43 testes passaram em oito arquivos**, cobrindo recuperação, tokens, sessões, convites, cotas, concorrência, origem e templates. Playwright local: tratamento mobile/link inválido passou; jornada completa ficou bloqueada por timeout de navegação antes do formulário de recuperação em compilação dev isolada. Não contabilizar essa jornada como aprovada nesta rodada. Os resultados anteriores sobre build estável permanecem históricos.

Evidências: `artifacts/qa/auth-dev-reset-403-20261022.png`, `auth-dev-invalid-token-20261022.png`, `auth-dev-email-config-20261022.png`, `auth-dev-generic-success-20261022.png`. Entrega real e conclusão da troca de senha serão registradas após o teste controlado e a participação do usuário na definição da nova senha.

A publicação Preview `8NdebAH4s7BY82yduviDcovD6mSr` ficou Ready com a allowlist atualizada. A primeira tentativa para a conta existente gerou os eventos `auth_email_budget` (daily/monthly 1) e `auth_email` reset/failed; nenhuma mensagem apareceu na Resend. O usuário informou ter corrigido a chave diretamente na Vercel. Foi iniciada nova republicação apenas do Preview para carregar o segredo corrigido, sem revelar ou ler seu valor.

Após a correção, o Preview **ytcvbB1Ngp8ty5kajca1iR3bQ4GD** ficou **Ready**, associado a `dev.useloti.com`. Uma nova solicitação para a conta autorizada resultou em **Delivered** na Resend. **Uma mensagem real entregue** nesta rodada. Remetente e assunto corretos; o link do template usa a origem HTTPS de Dev e informa validade de 30 minutos e uso único. Não foram registrados tokens, credenciais ou URLs de recuperação neste relatório.

Evidências finais de envio: `artifacts/qa/auth-dev-email-delivered-20261022.png` e `auth-dev-corrected-key-ready-20261022.png`. A definição de nova senha, login com ela e confirmação de que o link não pode ser reutilizado dependem da participação do usuário. Foi solicitado que conclua a troca diretamente pelo email e informe o resultado sem compartilhar senha ou link. **Não declarar recuperação 100% validada antes dessa confirmação.** Nenhum código funcional foi alterado nesta rodada; apenas configurações do Preview e este relatório. Não houve push, commit ou publicação de produção pelo agente nesta rodada.

**Confirmação do usuário em 22/10/2026:** “o reset funcionou”, após o teste com email real entregue. A troca de senha pelo fluxo publicado em Dev está confirmada pelo usuário. O retorno não discrimina login com a nova senha, revogação de sessões anteriores ou tentativa de reutilizar o link; esses comportamentos têm cobertura automatizada local, mas não foram confirmados separadamente no ambiente remoto. A validação de Dev não equivale a uma validação operacional de produção. Nenhuma senha ou link foi solicitado ou registrado.

Data: 20/10/2026. **Implementação local validada; configuração externa e aprovação de publicação pendentes.** Contrato: [31 — emails e segurança](31_AUTH_EMAIL_SECURITY_PLAN.md).

## Atualização após as autorizações externas

Esta atualização substitui os estados preliminares de DNS e autorização descritos abaixo. Os quatro registros (DKIM, CNAMEs `rsend` e `send`, DMARC `p=none`) foram salvos na Spaceship. A zona recarregada contém nove registros, com os cinco anteriores preservados. As quatro adições foram confirmadas no DNS público via 1.1.1.1. A Resend confirmou **Verified**, incluindo DKIM e os dois CNAMEs.

A chave **Loti Production 2026-10** foi criada com **Sending access** restrito a **useloti.com** e salva somente como segredo **RESEND_API_KEY**, ambiente **Production**, projeto **loti** da Vercel. O painel confirmou a gravação e informou que um novo deploy é necessário para surtir efeito. A chave não foi salva em arquivo, Git ou chat. Não foi habilitado o modo de envio nem acionado Redeploy.

A consulta agregada a `loti-prod` também foi autorizada. A proteção do script interrompeu a execução antes da conexão porque o ambiente aponta para `loti-dev`. O console Turso está sem sessão; foi solicitado ao usuário autenticar na aba aberta. Nenhuma consulta foi executada nem foram expostos dados pessoais ou credenciais. Não houve migração ou deploy de produção, e continuam zero envios reais.

Evidências adicionais: `artifacts/qa/auth-email-dns-saved.png`, `resend-domain-verified.png`, `resend-key-restricted.png` e `vercel-resend-secret-saved.png`. Próximo passo já autorizado: executar a auditoria após autenticação no Turso. Migração e publicação continuam dependendo de autorização separada. Testes reais de email continuam pendentes; a autorização de armazenamento da chave foi limitada à Vercel, sem criar cópia local para testes.

## Integração Resend

- Equipe observada: `useloti`. O domínio não constava no painel inicial; foi cadastrado `useloti.com`, região São Paulo, conforme o guia autorizado.
- O domínio está em **Not Started**, aguardando verificação DNS. Foram identificados os registros exigidos e preparado o TXT DKIM na interface, **sem salvar os registros DNS**. Os novos CNAMEs solicitados pelo painel são `rsend → rsend-sae1.forge.rmta.net` e `send → send.forge.rmta.net`; o TXT DKIM é `resend._domainkey`. DMARC proposto: `_dmarc`, `v=DMARC1; p=none;`.
- DNS autoritativo confirmado por consulta pública: `launch1.spaceship.net` e `launch2.spaceship.net`. Zona atual inspecionada na Spaceship: A/CNAME da Vercel e MX/SPF de Email Forwarding Free. Nenhum deles foi removido, substituído ou editado.
- Plano gratuito confirmado no painel: **100 emails/dia, 3.000/mês**, limite de API exibido de 10 req/s. Uso exibido: zero. Nenhum upgrade ou recurso pago ativado.
- Existe uma chave `Onboarding` com Sending access. Ela não foi revelada, copiada, alterada ou revogada. A nova chave restrita ao domínio aguarda confirmação de segurança do navegador.
- Busca exata nas variáveis do projeto `loti` da Vercel não encontrou `RESEND_API_KEY`. Nenhuma variável remota foi criada ou alterada.
- Remetente implementado: `Loti <noreply@useloti.com>`. Reply-To fica vazio até confirmar recebimento pelo endereço escolhido.
- Variáveis documentadas no `.env.example`: `RESEND_API_KEY`, `LOTI_EMAIL_MODE`, `LOTI_EMAIL_REPLY_TO`, `LOTI_EMAIL_TEST_RECIPIENTS` e limites `LOTI_*`. Transporte desabilitado por padrão. Preview/local exigem allowlist exata para envio real.
- **Zero emails reais enviados.** O destinatário autorizado pelo usuário é `noreply@useloti.com`; entrega/recebimento e aparência em cliente real ainda não foram testados. Todos os envios automatizados foram simulados para identidades `@loti.test`.

Evidências locais: `artifacts/qa/resend-dns-review.png`, `resend-domain-status.png`, `resend-usage.png` e `auth-recovery-generic.png`. As imagens são artefatos ignorados pelo Git, sem credenciais.

## Better Auth e jornadas

- Mantidos Better Auth/adapter 1.7.7, IDs, segredo existente, duração de sessão, origem oficial e permissões atuais. Não foi introduzido organization, cargo ou cadastro público.
- `/forgot-password` solicita recuperação com resposta genérica; `/reset-password` define/confirma a senha e trata link inválido/expirado/utilizado. O botão do login agora abre essa jornada.
- Recuperação usa token e hashing nativos, validade de 30 minutos, identificador persistido com hash e uso único. A finalização HTTP vincula o Better Auth a uma transação externa para consumo de token, atualização de senha e revogação de todas as sessões. Não autentica automaticamente após reset.
- A emissão de convite tenta enviar o email e mantém cópia/compartilhamento manual se o envio não for confirmado. A transação de criação de conta não envia email nem depende do provedor.
- Novo convidado cria uma conta pendente, autentica, solicita confirmação nativa e não recebe associação ao grupo. Após verificar, retorna ao convite e aceita autenticado. O email verificado é consultado no banco dentro da transação de aceite; não é confiado um booleano da sessão ou navegador.
- A confirmação nativa tem validade de 30 minutos e reivindicação persistente de uso único. Confirmação e consumo ficam na transação externa. Verificar o endereço não concede associação automaticamente nem torna válido um convite expirado/revogado.
- Contas existentes verificadas apenas autenticam/aceitam. Não verificadas confirmam antes de um novo vínculo. Membros antigos preservam seus vínculos e seu acesso; não foi habilitada obrigatoriedade global nem atualizado artificialmente `email_verified`.
- Falha de sessão após cadastro preserva a conta pendente e permite retorno por login. Falha de associação preserva a conta verificada e desfaz o consumo do convite. Repetir o aceite pela mesma identidade autenticada não duplica o vínculo.
- A auditoria de produção não foi executada: a revisão automática rejeitou o alvo implícito do ambiente. Foi solicitado consentimento específico para `loti-prod`, ainda pendente. O script `auth:audit -- --target loti-prod` agora exige alvo explícito e confere a correspondência do hostname antes de conectar. Ele só retorna contagens agregadas e não mostra identidades.

## Segurança e operação

- `auth_limits` usa UPSERT condicional atômico. `customStorage.consume` substitui memória no Better Auth. Hooks adicionais cobrem login/recuperação internos; a política do emissor cobre todas as chamadas de envio.
- Antes do Resend, uma transação reivindica o ID da entrega e reserva todas as dimensões de cota. Rejeições desfazem a reserva inteira; chamadas duplicadas não repetem a entrega. O SDK também recebe uma chave de idempotência.
- Limites padrão: login 30/email/h e 100/IP/h, recuperação 3/email/h e 5/IP/h, verificação 2/email/h e 5/email/dia, convite 3/destinatário/dia e 10/workspace/dia, convite global 20/dia. Cooldown completo de 60 segundos por tipo/destinatário; no máximo uma chamada de envio por segundo.
- Cota própria: 60/dia e 1.800/mês, com reserva exclusiva de 20/dia e 600/mês para recuperação. Calendário UTC para mês; janelas fixas para hora/dia. HMAC protege email/IP nas chaves.
- Na Vercel, usa somente o IP encaminhado pelo edge em `x-vercel-forwarded-for`. Fora dela, apenas desenvolvimento/HTTP localhost aceita o header de proxy de teste; produção remota sem IP confiável usa fallback conservador. IP não é a única dimensão.
- Falhas e resultados incertos mantêm a cota; não há retry automático, worker ou fila. Uma queda após reserva pode deixar estado `reserved`, sem reenviar. Timeout do SDK de oito segundos. O reset HTTP usa Next `after`/Vercel `waitUntil`, com a tarefa aguardando o envio; chamadas internas aguardam diretamente.
- Logs estruturados incluem tipo/status, contagens agregadas e alerta de aproximação de 80% do orçamento, sem senhas, secrets, cookies, tokens ou links. Não foi criado serviço externo de alertas. Não há consulta à API de usage por requisição.
- Rotas de tokens e respostas de autenticação têm no-store/no-referrer; páginas têm noindex. URLs completas ainda podem aparecer em logs de infraestrutura: a retenção/redação desses caminhos precisa fazer parte da operação. O app não adiciona analytics nessas páginas.
- Limitações: dependência do provedor/DNS e da invocação serverless; sem fila durável, uma interrupção pode exigir nova solicitação manual após cooldown. Limites por IP podem afetar redes compartilhadas. O contador visual de reenvio indica o cooldown mínimo; limites por hora/dia continuam aplicados no servidor e podem exigir espera maior.

## Código e migração

Novos módulos: `src/lib/auth/security-limits.ts`, `handler.ts`; `src/lib/email/service.ts`, `templates.ts`; `src/components/auth-email-screen.tsx`; páginas `forgot-password`, `reset-password`, `verify-email`; `scripts/audit-auth.ts`.

Alterados: configuração e handler Better Auth; serviço/API/UI de convites; link de recuperação no login; cabeçalhos Next; schema; verificador de banco; servidor E2E; scripts/package lock; documentação canônica e README. ESLint ignora os diretórios `.next-*` usados para QA isolado. Alterações geradas em `next-env.d.ts` e `tsconfig.json` foram removidas após os builds.

Dependência adicionada: **`resend` 6.34.1**, sem atualizar outras dependências intencionalmente.

Migração preparada: **`0021_fine_puppet_master.sql`**, snapshot e journal. Adiciona somente `auth_limits`, `auth_email_deliveries`, índices e checks; não faz backfill nem modifica dados existentes. Aplicada apenas em fixtures e base local explicitamente descartável. **Nenhuma migração de produção executada.**

Novos testes: `auth-email`, `auth-email-limits`, `auth-email-concurrency`/worker, `email-templates`, Playwright `password-recovery` e helper de provedor simulado. Testes de convites/login foram atualizados para o novo contrato.

Alterações de interface financeira observadas simultaneamente no checkout (`product-costs.css` e `refunds-section.tsx`) não foram feitas por esta tarefa e não integram sua entrega.

## Validação executada

| Verificação | Resultado |
| --- | --- |
| Escopo completo de autenticação/emails, Vitest | **70 testes passaram, 15 arquivos** |
| Playwright Chromium sobre build de produção local | **15 cenários passaram** |
| Typecheck | Passou |
| Lint | Passou |
| Build de produção isolado | Passou; sem publicação, banco em memória, secret temporário, envio desabilitado |
| Migração local vazia + repetição | Passaram |
| db:verify após cada aplicação | 50 tabelas verificadas, 54 triggers preservados, zero violações de FK |
| npm audit --omit=dev | Zero vulnerabilidades de produção reportadas |
| Busca nos bundles de navegador | Sem referência a RESEND_API_KEY, transporte de teste ou chave sintética |
| Navegador interno | Resposta genérica com conta sintética inexistente conferida; Resend/Vercel/DNS inspecionados |

A execução ampla do Vitest encontrou uma falha financeira de concorrência em `purchase-order-corrections.test.ts`, além de uma falha no teste novo que inicialmente contava confirmações em vez de chamadas efetivas ao provedor. Este último foi corrigido e integra os 70 aprovados. A corrida financeira foi **reproduzida em uma cópia isolada de HEAD**, sem as alterações de autenticação: um processo responde `SQLITE_BUSY` onde o teste exige ambos com sucesso. A execução ampla também registrou uma queda nativa do worker Windows. Portanto, **não se declara a suíte global inteiramente verde**. O domínio financeiro não foi alterado para contornar isso. As duas outras suítes financeiras que inicialmente excederam cinco segundos passaram integralmente com timeout apropriado de 30 segundos (15 casos).

Os testes E2E verificaram registro pendente com 403 para dados do grupo, confirmação, retorno/aceite, conta existente, sessão errada, revogação/regeneração, falha de sessão, recuperação com token nativo e reuso rejeitado, perfil, persistência/logout, teclado, mobile e reduced motion. Um erro inicial de ambiente dev/hot reload e um seletor que também encontrava o anunciador de rotas foram corrigidos; a execução final sobre o build estável passou.

Não testados: entrega real Resend, recebimento no destinatário, renderização Gmail, novos endpoints no domínio oficial após publicação, contagens de produção e comportamento de limite no Turso remoto sob carga. Concorrência foi simulada com múltiplos serviços e processos locais, sem envio de carga real.

## Próximas etapas e autorizações pendentes

1. Autorizar a consulta agregada específica a `loti-prod` para documentar a transição de contas existentes.
2. Confirmar as quatro adições DNS e a chave restrita Resend → segredo na Vercel. A confirmação é exigida pela política do navegador para conceder autorização de envio e criar acesso por credencial. Nenhuma credencial deve ser enviada pelo chat.
3. Verificar propagação e estado Verified no Resend; configurar `RESEND_API_KEY`, modo e ambientes/allowlist correspondentes. Até isso ocorrer, envio permanece desabilitado por padrão.
4. Realizar até cinco envios reais ao destinatário autorizado, confirmar entrega/links/aparência e atualizar este relatório. Não usar contas reais como fixtures de testes.
5. Autorizar separadamente a aplicação da migração 0021 ao banco de destino e a publicação. Não houve push, PR, commit, deploy ou mudança de dados de produção nesta tarefa.
6. Depois da publicação, validar HTTPS, recuperação, sessões revogadas e novo convidado sem acesso antes de confirmação em `useloti.com`.

O código está disponível para revisão; a entrega externa ainda não satisfaz os critérios de domínio verificado e emails reais recebidos. A aprovação de publicação não deve ser inferida das autorizações de DNS, chave ou auditoria.
