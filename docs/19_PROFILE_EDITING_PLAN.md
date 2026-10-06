# Plano de implementação — edição de perfil

Status: implementado e verificado localmente em 6 de outubro de 2026. A validação/deploy de Preview permanece pendente de acesso Vercel/Turso. Plano original elaborado em 5 de outubro de 2026.

## 1. Objetivo e premissa de escopo

Permitir que um membro autenticado altere seu nome completo, incluindo sobrenomes, e sua senha pela página `/profile`.

Este plano adota a recomendação da avaliação: um campo **Nome completo**, persistido no `user.name` existente, e um formulário independente para **Alterar senha**. A escolha é uma premissa deste plano, não uma confirmação de que o usuário exige nome e sobrenome armazenados separadamente. A seção 12 descreve a alternativa com campos separados e seu impacto.

Entrega principal:

- Editar o próprio nome completo, com validação no navegador e no servidor.
- Trocar a própria senha informando senha atual, nova senha e confirmação.
- Encerrar as outras sessões após a troca, mantendo o navegador que fez a alteração conectado por meio da sessão renovada pelo Better Auth.
- Atualizar nome e iniciais nas superfícies que usam o perfil, sem exigir logout.
- Manter os acessos **Meu grupo** e **Sair da conta** na página.
- Cobrir autorização, persistência, falhas, teclado e responsividade.

Fora desta entrega: alteração de email, upload de avatar, recuperação de senha esquecida, email transacional, administração de perfis de outras pessoas, MFA e snapshots de nomes históricos. Nenhuma nova dependência ou mudança de infraestrutura está prevista.

## 2. Situação atual verificada

| Área | Código atual | Consequência para a implementação |
| --- | --- | --- |
| Perfil | `src/app/(app)/profile/page.tsx` | Exibe avatar, nome, email, Meu grupo e logout; ainda não tem edição |
| Usuário | `src/lib/db/schema.ts` | `user.name` é obrigatório; não há `firstName` nem `lastName` |
| Credenciais | `src/lib/auth/config.ts` | Better Auth com email/senha, adapter Drizzle SQLite e senha de 12–128 caracteres |
| Cliente de autenticação | `src/lib/auth/client.ts` | `createAuthClient()` já fornece os métodos necessários |
| Endpoints | `src/app/api/auth/[...all]/route.ts` | O handler nativo já publica `/update-user` e `/change-password` |
| Autorização | `src/lib/auth/session.ts` e `src/lib/domain/authorization.ts` | Sessão e associação ao workspace já têm helpers centrais |
| Dados do app | `src/components/workspace-provider.tsx` | Estado próprio inicializado uma vez; atualização por mutação ou foco da janela |
| Leituras de identidade | `src/lib/domain/services.ts` | `currentUser` e `members` consultam `user.name`; relações usam IDs |
| Grupo | `src/components/group-screen.tsx` | Tem estado próprio inicializado com dados da página; verificar atualização ao entrar no grupo |
| Histórico | `src/components/purchase/purchase-screen.tsx` | Nomes de pessoas vêm de `members`, inclusive no modo somente leitura |
| Testes | `tests/integration/auth.test.ts`, `tests/e2e/helpers.ts`, `scripts/e2e-server.ts` | Há fixtures e servidor isolados; cenários existentes compartilham algumas contas seed |

A versão instalada consultada do Better Auth é `1.7.7`. Seu código confirma:

- `updateUser` determina o alvo pela sessão, atualiza o usuário e o cookie correspondente.
- `changePassword` usa sessão verificada no banco, confere a senha atual e aplica os limites configurados à nova senha.
- Com `revokeOtherSessions: true`, a implementação remove as sessões anteriores e cria uma nova para o navegador atual; há rotação do token.
- O middleware da troca de senha exige sessão válida autoritativa; não é o middleware de idade máxima da sessão. Não adicionar exigência de login recente por suposição.
- O endpoint nativo de atualização de nome não substitui as regras próprias do Loti para nome não vazio, limite e associação ao workspace. Essas regras precisam ser acrescentadas no servidor.
- O rate limiter existente inclui regra específica para troca de senha, mas usa memória por instância. Preservá-lo e tratar HTTP 429; esta entrega não promete limitação global entre instâncias Vercel.

Referências oficiais de apoio: [gestão de usuários e senhas](https://better-auth.com/docs/concepts/users-accounts) e [hooks de autenticação](https://better-auth.com/docs/concepts/hooks). Na execução, os contratos da versão instalada têm prioridade sobre exemplos de outras versões.

## 3. Regras funcionais

### 3.1 Nome completo

1. Somente o titular autenticado pode editar sua identidade; o ID vem da sessão.
2. A pessoa precisa ter associação válida ao workspace ativo, pelo helper existente.
3. Aceitar de 1 a 200 caracteres após remover espaços das extremidades, seguindo o limite já usado na criação de contas.
4. Não exigir duas palavras: nomes compostos, acentos, apóstrofos, hífens e pessoas identificadas por um único nome continuam válidos.
5. Não separar sobrenomes automaticamente nem alterar capitalização. O valor fornecido pela pessoa é a referência.
6. Não aceitar nome vazio ou apenas espaços; não confiar somente em `required` ou `maxLength` do HTML.
7. Nome igual ao valor salvo não gera uma nova requisição pela UI.
8. Email permanece identificado como dado da conta, sem controle de edição.
9. A alteração é global à conta: o mesmo nome será exibido nos grupos aos quais ela pertence.
10. Nenhuma relação de favoritos, coleções, compras, convites ou membros muda, pois essas relações usam IDs.

### 3.2 Senha

1. Campos: **Senha atual**, **Nova senha** e **Confirmar nova senha**.
2. Nova senha entre 12 e 128 caracteres, com regra visível antes do envio.
3. Não aplicar `trim`, mudar espaços ou normalizar a senha.
4. A confirmação deve coincidir exatamente com a nova senha. Ela é uma proteção de digitação no formulário; o endpoint nativo recebe somente senha atual e nova senha.
5. Bloquear reutilização imediata da mesma senha, no cliente e no servidor, com mensagem clara.
6. Verificação da senha atual, hashing e persistência ficam sob responsabilidade do Better Auth.
7. Encerrar as outras sessões como política da entrega. Forçar essa política no servidor; não depender de um booleano que o cliente possa omitir ou enviar como `false`.
8. Informar antes do envio: **Após a troca, você continuará conectado neste dispositivo. As outras sessões serão encerradas.**
9. Limpar os campos após sucesso e ao sair do fluxo. Não persistir senhas em localStorage, sessionStorage, URLs, logs ou dados do workspace.
10. Senha atual incorreta não altera credenciais nem encerra sessões.
11. A pessoa que não conhece sua senha atual continua usando o suporte operacional existente. Trocar senha autenticado não resolve recuperação de senha esquecida.

### 3.3 Histórico e colaboração

A identidade da pessoa continua ligada ao mesmo `user.id`. Compras finalizadas e itens não recebem nenhum `UPDATE` pela alteração de perfil. Seus produtos, preços, quantidades, variações e vínculos permanecem estáveis.

Como a interface atual resolve a identidade pelo cadastro da pessoa, o novo nome também aparece nos detalhes históricos após atualização dos dados. Esta entrega documenta esse comportamento sem criar snapshot de nome. Preservar a grafia do nome na data da compra exigiria outra decisão e uma alteração de schema.

Outros membros verão o novo nome nas leituras seguintes. Usar os mecanismos atuais de foco, navegação e recarga; não introduzir realtime, polling ou notificações.

## 4. Experiência proposta em `/profile`

### Estrutura

Preservar o título **Seu perfil**, a identidade resumida e as ações existentes. Acrescentar duas seções compactas:

1. **Dados pessoais**: campo Nome completo preenchido com o valor salvo e botão **Salvar nome**.
2. **Segurança**: ação **Alterar senha**, que expande o formulário na própria página. O formulário contém os três campos, regra de tamanho, aviso sobre sessões, **Salvar nova senha** e **Cancelar**.

Usar componentes e tokens existentes, Geist, Lucide e superfícies operacionais discretas. Não criar rota adicional, novas ilustrações ou quarto destino de navegação. Em telas estreitas, as seções ficam em uma coluna, com espaço suficiente para a ilha móvel e teclado virtual.

### Estados e feedback

| Estado | Nome | Senha |
| --- | --- | --- |
| Inicial | Valor salvo; botão indisponível sem alteração | Formulário recolhido, campos vazios ao abrir |
| Edição | Botão ativo para valor válido diferente | Validação de tamanho e confirmação |
| Envio | **Salvando…**, `aria-busy`, prevenção de envio duplicado | Mesmo comportamento; bloquear a outra gravação e logout enquanto pendente |
| Sucesso | **Nome atualizado** e novo valor no app | **Senha alterada. Outras sessões foram encerradas.**; limpar e recolher formulário |
| Validação inválida | Mensagem associada ao campo | Mensagem no campo correspondente |
| Falha da operação | Preservar nome digitado para correção | Mensagem traduzida; nunca preencher senhas vindas do servidor |
| Sessão inválida | Redirecionar para login com aviso apropriado | Limpar campos e solicitar login |
| Atualização dos dados falhou após salvar | Informar que salvou e que é preciso atualizar a tela | Não apresentar a troca confirmada como falha de senha |

O nome e a senha têm submits independentes. Alterar um não deve salvar o outro. Nome digitado ainda não salvo não pode ser descartado ao concluir a troca de senha ou ao atualizar dados em segundo plano.

### Acessibilidade

- Labels explícitos e IDs distintos dos usados no login/convites.
- `autocomplete="name"`, `current-password` e `new-password` nos campos correspondentes.
- Botões para mostrar/ocultar senha com `type="button"`, nome acessível e `aria-pressed`.
- Erros com `aria-invalid`, `aria-describedby` e anúncio por `role="alert"`; levar foco ao primeiro erro.
- Enter submete apenas o formulário em foco; mostrar/ocultar e Cancelar nunca submetem.
- Abrir Segurança leva foco à senha atual; Cancelar limpa os campos e devolve foco a Alterar senha.
- Foco visível, alvos de toque confortáveis e sucesso compreensível sem depender só de cor/toast.
- Preservar reduced motion e navegação por teclado.

## 5. Arquitetura e contratos

### 5.1 Reutilizar endpoints nativos

Fluxo de nome:

```text
ProfileNameForm
  → authClient.updateUser({ name })
  → POST /api/auth/update-user
  → hook Loti: sessão + membership + Zod
  → Better Auth / adapter Drizzle
  → user.name + cookie atualizado
  → sincronização do WorkspaceProvider
```

Fluxo de senha:

```text
ProfilePasswordForm
  → authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })
  → POST /api/auth/change-password
  → hook Loti: sessão + membership + política da troca
  → Better Auth verifica/hash/persiste
  → revoga sessões anteriores e estabelece novo cookie
  → limpa formulário e confirma sucesso
```

Não criar `profile.save` dentro de `/api/app` nem duplicar hashing, escrita de credenciais ou emissão de cookies. A rota catch-all de autenticação continua encaminhando aos handlers da biblioteca.

### 5.2 Validação e autorização no servidor

Criar schemas compartilháveis de perfil e um hook restrito aos caminhos `/update-user` e `/change-password` na configuração do Better Auth:

- Nome: objeto estrito `{ name }`, trim e limite de 1–200. Rejeitar campos de alvo (`id`, `userId`) e alterações de email, imagem ou outros dados não previstos nesta entrega.
- Senha: senha atual obrigatória, com máximo de 128; nova senha com 12–128; comparar igualdade sem normalização; aceitar o campo nativo opcional `revokeOtherSessions`, mas forçar seu valor para `true` antes de executar o endpoint.
- Resolver a sessão autoritativa pelo mecanismo exportado da versão instalada (`getAuthoritativeSessionFromCtx`), sem importar `next/headers` dentro da fábrica `createAuth` usada por scripts e testes.
- Reutilizar `authorization(db, session.user.id).requireWorkspaceMember()` para validar o contexto do membro. Pessoa vinculada a outro grupo pode editar seu próprio perfil; não pode escolher o alvo de outra conta.
- Não assumir que `ctx.context.session` já está preenchido num hook `before`; comprovar a resolução da sessão em testes do handler real.
- Preservar proteções de origem/CSRF do Better Auth e a origem derivada de `authOrigin()`. Testar a chamada HTTP externa, não apenas `auth.api` em processo.
- Nas chamadas HTTP desses dois caminhos, exigir o header Origin igual a `authOrigin()`, seguindo as demais mutações do Loti; origem ausente ou diferente é recusada. A checagem adicional não se aplica às chamadas internas sem Request. Testar separadamente esses dois contextos.
- Usar `APIError` com código e mensagem controlados para erros do Loti. Não propagar um `ZodError` contendo valores de senha, nem registrar request/contexto/headers completos.
- Escopar os hooks por caminho; signup privado transacional, login, logout e aceite de convites mantêm seus contratos.

Esta etapa precisa deixar a validação efetiva nos endpoints nativos. Adicionar um endpoint separado e validar só nele deixaria uma rota alternativa sem as regras do Loti.

### 5.3 Atualização do estado do app

O `WorkspaceProvider` mantém `data` por `useState(initialData)`. `router.refresh()` isolado não garante que esse estado seja substituído.

Proposta:

1. Expor uma operação pequena `refresh(): Promise<resultado>` no contexto, com resultado que diferencie sucesso, sessão inválida e indisponibilidade.
2. Após confirmação da alteração do nome pelo servidor, aplicar o valor normalizado a `currentUser.name` e ao membro correspondente por ID no estado local, para atualizar imediatamente sidebar/avatar.
3. Refazer `GET /api/app` com `cache: "no-store"`, trazendo a ordenação e os dados atuais do grupo. Não mudar filtros, preferências ou workspace ativo.
4. Impedir que uma leitura anterior em voo sobrescreva o nome recém-salvo; usar cancelamento ou controle de versão das leituras deste provider.
5. Se a leitura falhar após gravação bem-sucedida, manter o nome confirmado localmente e apresentar aviso específico; não convidar a repetir a alteração como se ela não tivesse ocorrido.
6. Atualizar o valor-base do formulário apenas quando apropriado. Uma leitura de foco não deve apagar alterações ainda não enviadas.
7. Verificar entrada em `/group`, cuja tela mantém estado próprio. Garantir leitura atual na navegação; sincronizar `initialData` com cuidado se o componente for reaproveitado. Alterar GroupScreen somente se a verificação revelar dados obsoletos.

Não aplicar alteração otimista antes do servidor confirmar, nem expor tokens/credenciais no provider. Após troca de senha, aguardar a resposta/cookie nativo antes de refazer chamadas autenticadas.

### 5.4 Falhas com resultado parcialmente confirmado

Nome salvo e refetch indisponível são operações distintas; comunicar separadamente.

Na versão instalada, a troca de senha, exclusão de sessões e criação da nova sessão são etapas sequenciais. Não prometer atomicidade entre elas sem teste. Cobrir:

- Falha antes da gravação: senha anterior permanece válida; apresentar erro e permitir correção.
- Falha de sessão após a gravação: a senha pode já ter mudado; orientar login com a nova senha e limpar os campos. Não tentar reverter o hash manualmente.
- Queda de rede sem resposta: resultado desconhecido. Informar que a alteração não pôde ser confirmada, oferecer retorno ao login e não reenviar automaticamente. Não afirmar categoricamente que a senha permaneceu antiga.
- Limite de tentativas: mensagem de aguardar; respeitar `Retry-After` quando disponível, sem desabilitar o limiter para fazer os testes passarem.

Confirmar no teste de falha injetada que o usuário consegue retomar por login. Se for necessário adaptar a resposta de erro para distinguir falha após gravação, fazê-lo no hook/handler nativo com código controlado, sem nova lógica própria de credenciais.

## 6. Arquivos previstos

| Arquivo | Mudança planejada |
| --- | --- |
| `src/app/(app)/profile/page.tsx` | Compor identidade, formulários e ações existentes |
| `src/components/profile/profile-name-form.tsx` (novo) | React Hook Form para nome, validação e feedback |
| `src/components/profile/profile-password-form.tsx` (novo) | Expansão de Segurança, campos, visibilidade e estados |
| `src/lib/auth/profile-validation.ts` (novo) | Schemas e regras compartilháveis sem dependência de servidor |
| `src/lib/auth/profile-hooks.ts` (novo) | Hook de servidor restrito aos dois endpoints; autorização e política |
| `src/lib/auth/config.ts` | Registrar o hook mantendo configuração atual |
| `src/components/workspace-provider.tsx` | Atualização explícita e coerente dos dados após nome salvo |
| `src/app/globals.css` | Estilos de perfil escopados e responsivos, reutilizando tokens |
| `tests/unit/profile-validation.test.ts` (novo) | Regras próprias de nome/senha, incluindo ausência de normalização de senha |
| `tests/integration/profile.test.ts` (novo) | Handler real, cookies, autorização e persistência |
| `tests/e2e/profile.spec.ts` (novo) | Jornada completa e estados visuais/acessíveis |
| `scripts/e2e-server.ts` | Conta(s) exclusiva(s) de QA do perfil, com membership válido |
| Documentação canônica | Escopo, regras, fluxos, arquitetura, critérios, testes e decisão |

Os nomes de arquivos novos são orientações, não obrigação de multiplicar componentes sem necessidade. Se a implementação ficar pequena e clara, concentrar partes relacionadas é aceitável.

Não há migração nem alteração de schema no caminho principal. Não modificar lockfile nem atualizar Better Auth como parte da feature.

## 7. Execução por etapas

### Etapa 1 — Baseline e contrato

1. Registrar `git status` e preservar mudanças já existentes. Na elaboração deste plano havia mudanças em `src/components/layout/app-shell.tsx` e um novo `src/app/icon.svg`; não sobrescrevê-las nem revertê-las.
2. Reconfirmar a versão instalada, endpoints, formato de erros e comportamento dos cookies/sessões.
3. Executar baseline de lint, typecheck e testes. Registrar falhas preexistentes separadamente, sem atribuí-las à feature.
4. Atualizar documentação canônica durante a implementação: `02`, `03`, `04`, `05`, `08`, `11`, `12` e `15`, com referência a este plano, e acrescentar a extensão de perfil ao `PROMPT_ONE_SHOT.md` para manter a prioridade das fontes coerente. Incluir instruções operacionais em `13` se necessárias.
5. Implementar primeiro uma comprovação de contrato em banco isolado: criar membro com credenciais, login, mudar nome, mudar senha e verificar token/sessões em duas instâncias de autenticação.

Critério para avançar: o contrato nativo funciona no adapter real, e estão definidos os códigos de erro e o comportamento das sessões.

### Etapa 2 — Regras e limite de autorização

1. Criar os schemas e suas mensagens.
2. Acrescentar os hooks específicos, usando os helpers centrais.
3. Aplicar `revokeOtherSessions: true` no servidor e impedir senha nova igual à atual.
4. Validar chamadas HTTP autenticadas, anônimas, sem membership, com campos de alvo e com origem externa.
5. Confirmar que convites e conta sem grupo ainda conseguem fazer login e aceitar um convite; apenas a edição do perfil exige membership.

Critério para avançar: chamadas diretas à API não contornam as regras; outras rotas de auth mantêm comportamento.

### Etapa 3 — Nome completo e sincronização

1. Implementar formulário de nome com valor inicial e dirty state.
2. Integrar `authClient.updateUser` e mensagens controladas.
3. Implementar atualização do provider após sucesso, refetch e prevenção de resposta obsoleta.
4. Confirmar persistência após recarga, logout/login e navegação para Favoritos, Compra, Histórico e Meu grupo.
5. Testar falha na leitura posterior à gravação, preservando sucesso e nome confirmado.

Critério para avançar: identidade muda em toda a sessão atual sem logout e sem alterar relações ou preferências.

### Etapa 4 — Troca de senha

1. Implementar formulário independente e visibilidade dos campos.
2. Integrar `authClient.changePassword` com política de sessões informada na interface.
3. Tratar senha incorreta, inválida, igual, confirmação diferente, 429, sessão expirada e rede indisponível.
4. Limpar dados sensíveis, bloquear envios simultâneos e manter o foco previsível.
5. Comprovar renovação da sessão atual, invalidação da segunda sessão, recusa da senha antiga e aceitação da nova.
6. Injetar falha após alteração de credenciais para comprovar recuperação por login, sem intervenção manual no banco.

Critério para avançar: troca funciona, sessão atual permanece utilizável e sessões anteriores realmente deixam de autorizar chamadas.

### Etapa 5 — QA, regressões e entrega

1. Completar Playwright em desktop e mobile com usuários exclusivos do perfil.
2. Inspecionar capturas em 390×844 e 1440×900; testar ausência de overflow em 320, 768 e 1024 px.
3. Revisar teclado, foco, anúncios de erros, autocomplete e layout com nome longo.
4. Executar a suíte completa e build. Corrigir regressões antes de concluir.
5. Revisar diff, documentação e ausência de senhas/segredos em artefatos.
6. Preparar publicação em Preview usando banco de desenvolvimento; validar gravação real e cookies HTTPS. Produção é etapa operacional posterior à implementação e à revisão.

Critério de conclusão: critérios de aceite abaixo verificados, checks aprovados e relatório com resultados efetivamente executados.

Continuar entre etapas sem solicitar aprovação intermediária. Esta solicitação é de planejamento; executar o plano será uma tarefa posterior.

## 8. Plano de testes

### Unitários — regras próprias

- Nome vazio, espaços, limite de 200 e valor com 201 caracteres.
- Trim nas extremidades sem capitalização ou divisão automática.
- Um único nome, nomes compostos, acentos, hífen e apóstrofo.
- Rejeição de campos não autorizados no payload de nome.
- Nova senha com 11, 12, 128 e 129 caracteres.
- Espaços nas extremidades da senha preservados.
- Senha nova igual à atual e confirmação divergente no schema do formulário.
- Rejeição de tipos inválidos em chamadas diretas.

Não testar internamente o algoritmo de hash da biblioteca. O comportamento de credenciais é comprovado por autenticação real nos testes de integração.

### Integração — Better Auth + Drizzle + libSQL

Usar banco isolado e fixture com contas de credenciais criadas pelo fluxo de operador, seguida de membership. As contas atuais de `tests/integration/helpers.ts` não têm senha por padrão; criar credenciais válidas para esta suíte sem alterar o contrato das demais fixtures.

| Cenário | Evidência esperada |
| --- | --- |
| Sem sessão | Ambos os endpoints recusam a mutação |
| Sessão sem membership | Hooks recusam edição; login e convites continuam acessíveis |
| Nome válido | Só `user.name` do titular é alterado; timestamp e leitura de sessão coerentes |
| Nome inválido via HTTP | Rejeição antes da escrita, inclusive sem validação de navegador |
| Tentativa de alvo B pela sessão A | Rejeição do payload; B intacto |
| Email/imagem no payload | Campos fora do escopo recusados |
| Outra conta ou outro grupo | Perfil e dados dessa conta permanecem intactos |
| Origem não confiável | Chamada HTTP recusada; checagem real de origem preservada |
| Senha atual incorreta | Hash/sessões continuam utilizáveis como antes |
| Senha curta, longa ou igual | Nenhuma alteração de credenciais |
| Troca bem-sucedida | Senha antiga falha no login; nova senha autentica |
| Política omitida ou enviada como false | Outras sessões encerradas mesmo em chamada direta |
| Cookie novo | Navegador recebe token novo e mantém acesso; token anterior deixa de funcionar |
| Segunda sessão | `getSession` e leitura protegida deixam de autorizar; não verificar apenas redirecionamento da UI |
| Duas instâncias de auth | Ambas observam as credenciais e revogações persistidas no mesmo banco |
| Senha da conta B | Continua válida; sessões de B preservadas |
| Relações e histórico | IDs, itens, totais, preferências, memberships e snapshots inalterados |
| Falha após escrita da senha | Login com nova senha permite retomar; erro não produz falsa garantia de rollback |
| Signup público | Continua recusado |

### E2E — Playwright

1. Membro abre Perfil pelo avatar, edita nome, salva e vê nome/iniciais novos na sidebar e no próprio perfil.
2. Reload e novo login preservam o nome. Favoritos e agrupamento da Compra usam o nome atualizado; Meu grupo lê a nova identidade.
3. Nome inválido mostra mensagem/foco; submissão pendente impede clique duplo; resposta de erro preserva o texto digitado.
4. Falha do GET posterior ao POST não transforma uma gravação confirmada em erro de gravação nem reverte visualmente o nome.
5. Abrir/Cancelar Segurança limpa os campos; Enter e toggles funcionam sem submits indevidos.
6. Senha atual incorreta, limite e confirmação divergente mostram mensagens adequadas.
7. Troca válida mantém o contexto atual conectado; outro browser context da mesma conta perde acesso. Login com antiga senha falha e com nova funciona.
8. Simular resposta perdida/erro de sessão e comprovar mensagem de retomada, sem reenvio automático.
9. Desktop/mobile, nomes longos, teclado e largura estreita preservam layout e as três áreas primárias.
10. Login, logout e fluxo de convites seguem funcionando com a conta e senha novas.

**Isolamento obrigatório:** não trocar a senha de Gabriel/Brunna nem alterar nomes que outras specs selecionam por texto. Criar contas exclusivas por cenário destrutivo no setup E2E e vinculá-las ao workspace adequado. Usar credenciais exclusivamente de teste. Não depender da ordem das specs nem de restaurar senha no fim de um teste que pode falhar. Preservar o rate limiter real; respeitar janelas/identidade de cliente na montagem dos cenários.

Capturas sugeridas: `artifacts/qa/profile-{mobile,desktop}.png`, `profile-password-mobile.png` e `profile-validation-mobile.png`. Capturar campos de senha ocultos/vazios. Reter somente artefatos de QA com identidades de teste.

### Comandos de validação

Por etapa, rodar lint, typecheck e a cobertura relevante:

```sh
npm run typecheck
npm run lint
npm exec vitest run tests/unit/profile-validation.test.ts tests/integration/profile.test.ts
npm exec playwright test tests/e2e/profile.spec.ts
```

Ao concluir:

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

A suíte usa as migrações existentes no banco isolado. No caminho principal não gerar/aplicar migração nova nem rodar migrations em produção apenas por adicionar formulários.

## 9. Critérios de aceite

- [x] Perfil oferece edição de nome completo e troca de senha separadas.
- [x] Nome inclui sobrenomes livremente, com 1–200 caracteres após trim.
- [x] Validação de nome ocorre no servidor, inclusive pelos endpoints nativos.
- [x] Apenas o titular com membership válido modifica seu perfil; payload não escolhe outra conta.
- [x] Nome/iniciais atualizam sem logout; reload e login novo mantêm o valor.
- [x] Favoritos, compra e grupo exibem a identidade atual após atualização dos dados.
- [x] Nenhum ID, membership, preferência ou snapshot de produto é alterado pelo perfil.
- [x] Nova senha segue 12–128, confirmação exata e não reutiliza imediatamente a atual.
- [x] Senha atual incorreta não altera credenciais nem sessões.
- [x] Sessão atual é renovada e permanece utilizável após sucesso.
- [x] Outras sessões são encerradas mesmo se o cliente omitir ou negar a opção.
- [x] Antiga senha deixa de autenticar; nova senha autentica.
- [x] Falhas de rede e de sessão têm recuperação clara, sem reenvio automático de credenciais.
- [x] Senhas não aparecem em storage, URLs, logs, respostas de erro ou estado compartilhado.
- [x] Meu grupo, logout, convites e ausência de signup público permanecem funcionais.
- [x] Teclado, foco, mensagens e mobile foram verificados.
- [x] Lint, typecheck, testes completos e build passaram; relatório descreve os resultados reais.

## 10. Publicação e reversão

O caminho principal usa o schema e as variáveis já existentes de Vercel/Turso. Não exige novo serviço, segredo, provedor de email ou migração.

Após implementação:

1. Validar Preview com banco de desenvolvimento, origem configurada e identidades de teste.
2. Conferir cookies HTTPS, persistência do nome, troca de senha e perda de acesso em segunda sessão.
3. Preparar publicação do código pelo fluxo Git/Vercel existente. Não usar contas reais para cenários destrutivos de QA.
4. Após publicação, fazer smoke de Perfil, navegação e login com conta de teste aprovada para o ambiente.

Reversão de código remove a nova UI/hooks sem desfazer nomes ou senhas legitimamente alterados. Nunca restaurar hashes antigos ou recriar sessões revogadas para reverter a feature. Operações de recuperação de banco são independentes e devem seguir o procedimento existente.

## 11. Esforço e riscos concretos

Estimativa preliminar de esforço para o caminho principal, não prazo garantido:

| Trabalho | Faixa |
| --- | --- |
| Contrato, schemas e hooks | 1,5–2,5 h |
| Formulários e sincronização | 2–3 h |
| Integração/E2E, falhas e QA | 2–3 h |
| Documentação e verificações finais | 0,5–1,5 h |
| **Total** | **6–10 h** |

A maior atenção técnica é a coerência entre cookies/sessões do Better Auth e o estado local do provider. Também há risco de contaminar testes compartilhados e de interpretar falha após gravação de senha como rollback. Os testes de contrato e falhas vêm cedo para reduzir essas incertezas.

Os limites de autenticação hoje usam memória por instância. A implementação mantém essa característica; limite distribuído persistente para auth seria uma melhoria separada, sem ser pré-requisito inventado para esta entrega.

## 12. Alternativa: nome e sobrenome em campos independentes

Se o requisito for dois campos independentes na UI e no banco, trocar explicitamente a premissa da seção 1 e ajustar o plano antes da implementação. Não apresentar dois inputs e depois dividi-los/reuni-los de forma ambígua sem definir a fonte de verdade.

Proposta para essa variante:

1. Adicionar `first_name` e `last_name` ao `user` por migração aditiva e configurar os additional fields do Better Auth/cliente.
2. Preservar `user.name` como nome de exibição composto, para compatibilidade com todas as leituras atuais. Definir os limites de cada campo e do valor composto sem exceder os 200 caracteres atuais.
3. Atualizar nome de exibição e partes na mesma operação. O servidor deriva `name`; o navegador não pode enviar um nome composto conflitante. Restringir o endpoint nativo aos campos previstos para evitar divergência.
4. Para contas existentes, não inferir separação como dado factual. Preservar o nome completo atual, deixar partes novas inicialmente sem preenchimento e solicitar que a pessoa as informe ao editar o perfil.
5. Definir se sobrenome é opcional; o MVP atual aceita nomes únicos e não deve bloquear silenciosamente contas existentes.
6. Adaptar signup por convite e tooling de operador, incluindo contrato de dados e validação. Manter compatibilidade dos comandos antigos ou documentar a alteração de forma explícita.
7. Testar upgrade de banco com usuários, credenciais, memberships e compras existentes, repetição da migração e compatibilidade das leituras de nome.
8. Aplicar a migração explicitamente ao banco de destino antes do código dependente. Nunca executá-la por request.

Estimativa total da variante: **10–16 horas**, com esforço adicional em migração, consistência dos três campos e adaptação dos fluxos de criação de contas. Nenhuma alteração de senha ou de identidade deve ocorrer como efeito colateral da migração.

## 13. Resultado da implementação — 6 de outubro de 2026

- O nome completo usa `user.name`; não foi criada migração nem alterado o schema.
- Os formulários usam os endpoints nativos Better Auth, com validação Zod, sessão autoritativa, membership e origem confiável nos hooks. A política de revogação é forçada no servidor.
- A atualização do provider preserva o nome confirmado mesmo quando o refetch falha e descarta leituras antigas em voo.
- Verificações concluídas: `npm run typecheck`, `npm run lint`, `npm test` (11 arquivos, 114 testes), `npm run test:e2e` (21 cenários Chromium) e `npm run build`.
- O Preview não foi implantado: os CLIs `vercel` e `turso` e o vínculo local de projeto Vercel não estão disponíveis neste ambiente. Para continuar essa etapa, o operador precisa conectar o projeto Vercel e fornecer ao Preview as credenciais do banco de desenvolvimento `loti-dev` e as variáveis Better Auth correspondentes. Nenhuma publicação externa foi feita.
