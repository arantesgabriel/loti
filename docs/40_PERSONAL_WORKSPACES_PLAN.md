# Frente 1 — Espaço pessoal, banco e autorização

Status: base local implementada; migração explícita ainda precisa ser aplicada ao banco alvo antes de publicar qualquer código que dependa dela. Esta frente não autoriza migração remota, provisionamento de contas reais ou publicação.

## Objetivo

Permitir que cada conta tenha um espaço privado próprio sem pertencer a um grupo. Uma conta também pode participar de um ou mais espaços compartilhados. O espaço ativo é contexto de navegação, não prova de acesso: o servidor valida a titularidade ou membership antes de ler ou gravar.

Nesta frente, favoritos e coleções pessoais passam a funcionar no backend. A tela de seleção de espaço, signup público e adaptação dos fluxos operacionais de compra, pedidos, armazém, pacotes, QC e custos pertencem a frentes posteriores. A interface atual continua exibindo apenas o contexto ativo.

## Modelo de dados

`workspaces` recebe:

- `kind`: `personal` ou `shared`, com default `shared` para compatibilidade;
- `owner_user_id`: FK Better Auth, obrigatório em `personal` e nulo em `shared`.

O índice parcial único `workspace_personal_owner_idx` garante no máximo um espaço pessoal por conta. Guardas SQLite validam a combinação tipo/titular, mantêm essa identidade imutável e impedem registros em `workspace_members` para espaços pessoais. Dados existentes, IDs, referências, memberships, convites e preferências são preservados; todo espaço existente é compartilhado após a migração.

## Provisionamento e preferência

`ensurePersonalWorkspace(userId)` cria ou recupera o espaço pelo índice único. A gravação do espaço e a inicialização/ajuste de `user_preferences` são atômicas. Uma preferência ativa ainda autorizada é preservada junto com `favorites_view`; sem uma seleção válida, uma única associação compartilhada continua ativa por compatibilidade, enquanto contas sem grupo ou com grupos ambíguos usam o espaço pessoal. Chamadas repetidas e concorrentes convergem para o mesmo ID.

O comando de operador `npm run workspace:provision-personal` percorre as contas já existentes sem aplicar migrações. Execute-o apenas depois de aplicar a migração revisada ao banco intencional. O serviço será a base para o signup privado quando esse fluxo for implementado.

## Autorização

- `requireWorkspaceAccess(workspaceId?)`: para espaço pessoal, exige `owner_user_id === session.user.id`; para compartilhado, exige membership real. Sem ID, resolve a preferência ativa após validá-la.
- `requireWorkspaceMember(workspaceId?)`: exige espaço compartilhado e membership. Continua sendo a guarda de compras colaborativas, convites de grupo e fluxos financeiros/logísticos existentes.
- `requireWorkspaceMembers(userIds, workspaceId)`: em espaço pessoal, aceita somente o titular; em compartilhado, valida todos os usuários como membros.
- Favoritos e coleções são autorizados pelo espaço persistido no recurso. A criação pessoal não aceita um collection ID de outro espaço.
- Ações com recursos de contextos diferentes falham antes de qualquer gravação. Um favorito pessoal não pode ser associado a uma compra compartilhada.
- Aceite, emissão, revogação e listagem de convites continuam limitados a espaços compartilhados.
- Perfil Better Auth aceita o titular de um espaço pessoal ou um membro compartilhado; conta sem espaço autorizado segue bloqueada.

## Resolução do contexto ativo

1. Usar `active_workspace_id` somente se o usuário ainda tiver acesso àquele espaço.
2. Descartar preferência inválida e consultar espaços autorizados.
3. Se houver exatamente um grupo compartilhado, preservá-lo para contas legadas.
4. Se houver espaço pessoal e nenhum grupo ou vários grupos sem preferência válida, usar o pessoal.
5. Sem espaço pessoal e com vários grupos ambíguos, falhar fechado até provisionamento/seleção válida.

## Entregas desta frente

1. `drizzle/0029_massive_owl.sql` acrescenta as colunas, índice e guardas sem reconstruir `workspaces` ou alterar IDs de outros registros.
2. A resolução central separa acesso a dados de membership compartilhado.
3. O provisionamento idempotente registra a preferência ativa na mesma transação.
4. O operador pode provisionar contas existentes repetidamente.
5. `getData()` e gravações de favoritos/coleções funcionam no espaço pessoal, com o titular como único membro representado para a interface de favoritos.
6. Convites e operações de grupo mantêm autorização compartilhada.

## Critérios de aceite

- Uma conta sem grupo é provisionada sem linha de membership, carrega o estado vazio e salva um favorito privado pelo serviço.
- Outra conta não lê o espaço, seus favoritos ou coleções por preferência ativa nem por ID de recurso.
- Repetição e chamadas concorrentes retornam o mesmo espaço; preferências válidas de grupo e modo de Favoritos permanecem intactas.
- Usuário com grupo e espaço pessoal pode operar em cada contexto autorizado e misturar recursos dos dois contextos é rejeitado antes de gravar.
- Espaço pessoal não é destino de convite; grupo sem contexto de grupo ativo não passa pelas guardas compartilhadas.
- Migração vazia, upgrade populado, repetição e `PRAGMA foreign_key_check` passam sem alterar IDs, referências, histórico, convites ou preferências válidas.

## Validação e limite operacional

Cobertura implementada em `tests/integration/personal-workspaces.test.ts` e `tests/integration/personal-workspace-migration.test.ts`, incluindo serviço pessoal, isolamento, participantes, convites, mistura entre espaços, concorrência com duas conexões e upgrade de banco.

Antes de usar uma conta de destino, aplique `npm run db:migrate` explicitamente e confira `npm run db:verify`. Em seguida, rode `npm run workspace:provision-personal`. Essas operações não rodam em requisições. Esta implementação não executou migração nem provisionamento em `loti-dev`, `loti-prod` ou qualquer banco remoto.
