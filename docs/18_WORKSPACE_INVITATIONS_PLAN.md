# Plano de implementação — convites para o grupo

Status: implementado e validado localmente. Fluxo autorizado pelo usuário em 5 de outubro de 2026. Publicação não executada.

## Objetivo

Permitir o fluxo **Meu grupo → informar email → gerar link de convite → compartilhar → pessoa define nome e senha → vínculo ao grupo → Favoritos**, sem depender de comandos para cada novo membro.

Preservar Better Auth, autorização no servidor, espaço único, cadastro público desabilitado, colaboração atual e as três áreas principais da navegação. Usar a camada de persistência existente no checkout; esta mudança não inclui migração de infraestrutura.

## Decisões propostas

- Qualquer membro do grupo pode criar e revogar convites pendentes. Não introduzir papéis administrativos nesta entrega.
- Convites são individuais, vinculados ao email e ao workspace, válidos por sete dias e aceitos uma única vez.
- Compartilhamento manual por link. Não configurar envio automático de email nesta entrega.
- Pessoas novas definem nome e senha no aceite. Contas existentes autenticam com sua senha atual; o aceite nunca redefine credenciais.
- O link é uma credencial: quem o recebe consegue criar a conta do email convidado. O aceite não prova acesso à caixa de email; verificação por email seria uma evolução separada.
- O workspace vem da sessão de quem convida e do convite durante o aceite, nunca de um campo controlado pelo navegador.
- Após aceite, a pessoa ganha os mesmos direitos colaborativos dos demais membros e acessa os dados já existentes do grupo.
- Não incluir remoção de membros, transferência de propriedade, múltiplos workspaces ou recuperação de senha nesta entrega.

## Experiência e rotas

### Quem convida

1. Abrir o perfil pelo avatar e selecionar **Meu grupo** (`/group`).
2. Ver nome do grupo, membros atuais e convites pendentes.
3. Selecionar **Convidar pessoa** e preencher somente o email.
4. Receber confirmação, validade e link com **Copiar link**; oferecer compartilhamento nativo quando disponível, com cópia como alternativa.
5. Compartilhar o link pelo canal que já usa com o grupo.

Usar lista compacta, componentes existentes, labels explícitos e feedback de carregamento, erro e sucesso. Manter a navegação mobile com três itens; Meu grupo é uma área secundária acessível pelo perfil.

Convites pendentes exibem email, quem convidou e validade, com ações **Gerar novo link** e **Revogar**. Gerar novo link invalida imediatamente o anterior e reinicia os sete dias. Depois de fechar a confirmação, o link original não pode ser recuperado: o banco guarda somente seu hash. Informar isso na interface e permitir regeneração.

Email já membro: mostrar **Esta pessoa já faz parte do grupo**, sem criar convite. Email com convite pendente: mostrar o existente e oferecer regeneração explícita, sem trocar o link silenciosamente. Estados expirado, revogado e aceito não aparecem como convites pendentes utilizáveis.

### Quem recebe

Rota pública `/invite/[token]`, independente do layout que exige associação ao workspace.

- Convite válido: apresentar grupo, email fixo, validade e explicação breve sobre o acesso compartilhado.
- Pessoa nova: formulário de nome, senha e confirmação; mostrar a regra de 12–128 caracteres antes do envio e permitir visualizar a senha.
- Conta existente: orientar entrar para aceitar; preservar o destino do convite por caminho interno validado. Não listar contas nem expor existência de emails sem um convite válido.
- Sessão com o email convidado: **Aceitar convite**; não pedir nova senha.
- Sessão com outro email: explicar que o convite é para outro endereço e oferecer **Trocar de conta**, preservando o convite.
- Pessoa já membro: informar que o acesso já está disponível e oferecer **Ir para Favoritos**.
- Token inválido, expirado, revogado ou já usado: mensagem específica quando possível, sem revelar dados do convite inválido; orientar pedir um novo link.
- Sucesso: estabelecer ou manter sessão, confirmar entrada e redirecionar para `/favorites` sem onboarding adicional.

O login comum permanece direcionando a Favoritos. Redirecionamento para o convite só ocorre quando há destino interno permitido, sem aceitar URLs externas.

## Modelo de dados

Adicionar `workspace_invitations` por migração Drizzle aditiva:

| Campo | Finalidade |
| --- | --- |
| `id` | Identificador interno |
| `workspace_id` | Grupo de destino, com FK |
| `email` | Email normalizado para comparação consistente |
| `token_hash` | Hash único do token aleatório; não armazenar o token original |
| `created_by` | Membro que emitiu o convite, com FK |
| `created_at`, `expires_at` | Criação e validade |
| `accepted_at`, `accepted_by` | Aceite e conta vinculada, com FK quando aplicável |
| `revoked_at`, `revoked_by` | Revogação e autor |

Derivar o estado pelas datas; não persistir um `status` redundante. Impedir aceite e revogação simultâneos por constraints e atualizações condicionais. Criar índice para leitura por workspace e unicidade do hash. Garantir no máximo um convite aberto por `(workspace_id, email)`; durante substituição, fechar o anterior na mesma transação. Convites vencidos ainda abertos precisam ser fechados antes de uma nova emissão. Preservar o histórico sem depender de tarefas agendadas para impedir aceite após expiração.

Reutilizar `workspace_members` e sua chave composta para impedir vínculos duplicados. A associação existente não deve ser apagada para acomodar um convite.

## Serviços e autenticação

Centralizar em um serviço de convites as operações de listar, emitir, regenerar, revogar, consultar token e aceitar. Separar endpoints autenticados de gestão dos endpoints públicos de consulta/aceite; não adicionar exceções genéricas à autorização atual.

- Gestão exige `requireUser()` e `requireWorkspaceMember()`; acessar convite pelo ID também exige conferir seu workspace.
- Token criptograficamente aleatório, com pelo menos 32 bytes; comparar via hash e construir link usando a origem configurada da aplicação.
- Consulta pública retorna apenas dados necessários para a tela; não retorna lista de membros ou dados operacionais.
- Aceite valida token, validade e email no servidor. Para conta existente, exige sessão do mesmo email; não confiar no email enviado pelo cliente.
- Criação de conta nova usa APIs e hashing do Better Auth exclusivamente em código de servidor. Manter `disableSignUp` no handler público.
- Aplicar validação Zod, checagem de origem nas mutações, limite de tentativas nos endpoints de convite e proteção contra submissão repetida. Usar armazenamento compatível com o ambiente de execução; limite apenas em memória por instância não fornece limite global em produção.
- Impedir cache de páginas/respostas com token, evitar exposição em logs/analytics, usar política de referrer restritiva e não carregar recursos de terceiros na tela de aceite.

### Etapa técnica obrigatória antes do aceite

Confirmar, na versão instalada do Better Auth e no adapter atual, como integrar criação de conta, consumo do convite e associação na mesma transação. Não assumir que o signup já participa de uma transação externa.

O resultado obrigatório é: dois aceites simultâneos não criam contas/vínculos duplicados; token revogado ou expirado não concede acesso; falha entre criação de conta e associação admite tentativa segura. Preferir transação única para conta, vínculo e consumo. Se o adapter não permitir, desenhar uma recuperação idempotente explícita que não deixe conta sem senha acessível, não consuma o convite antes do vínculo e não exija correção manual no banco. Registrar a solução escolhida antes de implementar o endpoint.

Emitir a sessão somente depois do vínculo e consumo confirmados. Se emissão da sessão falhar após aceite, preservar o acesso concedido e orientar login normal, sem reutilizar o token. Aceite de conta existente não altera nome, senha ou outras associações.

## Entregas em ordem

| Etapa | Entrega | Critério para avançar |
| --- | --- | --- |
| 1. Contrato e documentação | Registrar regras propostas; atualizar escopo, fluxos, IA e critérios canônicos; decidir integração transacional com Better Auth | Regras e estratégia de falhas explícitas |
| 2. Persistência e serviços | Migração, emissão, consulta, regeneração, revogação e associação | Vínculo restrito ao workspace correto; token único e válido |
| 3. Meu grupo | Perfil → Meu grupo, membros, convite por email, cópia/compartilhamento e gestão de pendentes | Membro consegue gerar e compartilhar link pelo app |
| 4. Aceite | Página pública, criação de conta, login com retorno ao convite, troca de conta e estados de erro | Pessoa nova ou existente entra no grupo e chega a Favoritos |
| 5. Validação e publicação | Checks, testes de segurança/concorrência, revisão mobile/teclado, migração e deploy | Jornada completa validada sem abrir signup público |

Aplicar a migração ao banco de destino antes do deploy que depende da tabela. Validar primeiro em ambiente isolado com identidades de teste. Não invalidar sessões ou alterar associações existentes. Manter o comando operador como bootstrap e alternativa operacional.

## Critérios de aceite e testes

- Membro gera link por email e compartilha sem acesso ao terminal.
- Visitante e pessoa de outro workspace não conseguem gerir convites nem enumerar membros.
- Novo usuário define suas credenciais e entra no workspace do convite.
- Usuário existente aceita autenticado com o email correto, preservando senha e dados.
- Sessão de outro email não aceita; troca de conta retorna ao convite.
- Email já membro não gera duplicação; convite pendente não é substituído silenciosamente.
- Link antigo deixa de funcionar imediatamente após regeneração; expirado/revogado não cria vínculo.
- Submissões repetidas, dois aceites concorrentes e corrida entre revogar/regenerar/aceitar não concedem acesso indevido.
- Falhas antes/depois da criação da conta, associação e sessão têm retomada previsível.
- Cadastro público continua recusado; favoritos, compras e histórico preservam autorização atual.
- Compartilhamento/cópia tem fallback; erros são anunciados; foco, teclado, mobile e retorno de login funcionam.

Cobertura: testes unitários das regras/estados; integração no adapter real de conta/vínculo/token/transação e concorrência; Playwright para pessoa nova, conta existente, email incorreto, link inutilizável e jornada mobile. Executar lint, typecheck, testes relevantes, migração em base vazia e existente, e build. Para concorrência, exercitar conexões independentes ao banco e não somente chamadas sequenciais.

## Limites desta entrega

Recuperação de senha continua sendo uma lacuna independente. Não apresentar o convite como mecanismo de recuperação de contas existentes. Registrar o problema como próxima entrega, com redefinição real e fluxo de suporte. Nesta implementação, mensagens devem explicar corretamente o comportamento disponível.

Estimativa por dimensão: uma tabela nova; serviços/endpoints de convite; uma área secundária autenticada; uma página pública de aceite; ajustes de login/perfil; documentação e testes. A maior incerteza técnica é a transação com Better Auth, por isso ela deve ser resolvida na primeira etapa.

## Decisões confirmadas na implementação

Better Auth usa um adapter vinculado à transação Drizzle externa; seu auto sign-in é desabilitado nessa instância privada. A transação contém conta/credencial, vínculo, preferência de workspace ativo e consumo. O cliente usa o endpoint normal de login após commit, com fallback para login manual se a sessão falhar. A seleção do workspace aceito é persistida sem apagar vínculos anteriores ou alterar a preferência Lista/Cards.

Além da tabela de convites, a implementação usa `invitation_limits` para limites persistentes e adiciona `active_workspace_id` a `user_preferences`. As duas migrações aditivas precisam preceder o deploy.

## Validação concluída

- Lint e TypeScript: passaram.
- Vitest: 106 testes passaram, incluindo rollback, limites persistentes, seleção do workspace, migração de base existente e concorrência em conexões independentes.
- Playwright Chromium: suíte completa de 19 cenários passou; o cenário adicional de falha de sessão e recuperação por login passou em execução específica (20 cenários no total).
- Build Next.js de produção: passou com as novas rotas.
- Migrações: passaram em bases isoladas vazias e em base com schema anterior/dados existentes; repetição preservou os registros.
- Revisão visual: capturas desktop/mobile de Meu grupo e aceite mobile inspecionadas. Mobile exibe o texto Convidar pessoa, mantendo a navegação de três itens.

Nenhum banco de produção foi alterado, nenhuma conta real foi criada e nenhum deploy foi executado. A publicação exige aplicar as duas migrações ao banco de destino antes do deploy. Não são necessárias credenciais de provedor de email. Recuperação de senha de contas existentes permanece uma entrega separada.
