# Frente 6 — Links de indicação e atribuição

Implementação local da Frente 6. Nenhuma migração remota, publicação, alteração de conta real ou envio para destinatários reais foi executado.

## Regras

- Conta autenticada e com email confirmado gera um único link reutilizável, independente do espaço ativo.
- O identificador do link é aleatório (32 bytes), não contém dados pessoais e não autoriza leitura de dados. Uma indicação pode originar várias contas.
- O cadastro público aceita somente o token no parâmetro `ref`; o servidor resolve o hash para o indicador. Link inválido, desconhecido ou autoindicação não atribui, mas não impede cadastro.
- Apenas a criação pública efetiva grava captura. A transação de cadastro inclui a conta, ativação, espaço pessoal e captura. A restrição `UNIQUE(referred_user_id)` fixa a primeira criação persistida; duplicatas não modificam a captura. Contas legadas e contas de convite não recebem atribuição.
- A verificação nativa válida confirma a atribuição na mesma transação externa que consome o token e marca o email. Falha reverte ambos; token inválido/expirado/reutilizado não confirma.
- A atribuição confirmada não tem API de consulta/alteração e uma trigger impede alterações no banco. Indicação não cria membership nem muda contexto de workspace. Convites de grupo seguem inalterados.

## Decisões e persistência

`referral_links` tem um link por indicador, token opaco recuperável para compartilhar e hash único para resolução. `referral_attributions` registra link, indicador, conta indicada, captura e confirmação. FK, unicidade e check de autoindicação são de banco. A migração aditiva explícita é `drizzle/0031_referral_attributions.sql`; a aplicação local é `npm run db:migrate` contra o alvo previamente selecionado. SQL foi revisado incluindo separadores de instruções para o migrador libSQL.

## Arquivos alterados

- `src/lib/db/schema.ts`, `drizzle/0031_referral_attributions.sql`, `drizzle/meta/_journal.json`
- `drizzle/meta/0031_snapshot.json` (snapshot Drizzle reconciliado com a migração)
- `src/lib/domain/referrals.ts`, `src/lib/auth/activation.ts`, `src/lib/auth/registration.ts`, `src/lib/auth/config.ts`
- `src/app/api/referrals/link/route.ts`, `src/components/profile/referral-link.tsx`, `src/app/(app)/profile/page.tsx`, `src/components/signup-screen.tsx`, `src/app/globals.css`
- `tests/integration/referrals.test.ts`, `tests/e2e/referrals.spec.ts`

## Validação

- `npm run typecheck`: passou.
- `npm run lint`: passou.
- Testes focados de indicação, migração, cadastro e email: 4 arquivos, 16 testes passando. Incluem token malformado, que agora permite cadastro sem atribuição. `npm run test:unit`: 35 arquivos, 243 testes passando.
- `npm run db:generate`: executado após adicionar `0031_snapshot.json`; retornou “No schema changes, nothing to migrate” e não criou SQL adicional.
- Migração em base limpa `0031` + `npm run db:verify`: 51 tabelas, 0 violações de FK; migração de upgrade a partir do schema 0030 populado também passou, preservando associação, convite, snapshot e registro financeiro sintético.
- Playwright `tests/e2e/referrals.spec.ts`: 1 cenário passou, exercitando geração/idempotência no desktop e celular e preservação do token no formulário com erro de validação. Usa somente banco descartável e servidor de email local falso.
- `npm run build`: passou. O primeiro build ultrapassou o limite inicial de 120s durante a etapa TypeScript; repetido com 240s completou. Better Auth imprimiu aviso de segredo padrão no build local, sem falha; nenhuma credencial real foi usada.
- `npm run test:integration`: 51 arquivos/310 testes passaram, 1 ignorado; 18 falhas preexistentes/fora desta frente em testes concorrentes multiprocesso por timeout/`SQLITE_BUSY`, regressão de workflow pessoal e CLI de reset. Os handoffs anteriores já documentavam instabilidade semelhante no Windows. Testes focados desta frente passaram isoladamente.

Nenhuma migração remota, publicação, conta real ou mensagem real foi usada.

## Limites

Não há estatísticas, lista de indicados, comissões, pagamentos, tracking/cookies ou painel administrativo. O token opaco fica persistido para que chamadas idempotentes possam devolver o mesmo link; a URL não revela IDs internos nem email. A migração remota e publicação exigem autorização específica.
