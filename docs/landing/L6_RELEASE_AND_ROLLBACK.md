# Candidato local e roteiro de release/rollback

Preparação de L6 em 23/10/2026. Este documento não autoriza L7, push, merge, preview hospedado, migration ou deploy.

**Revisão de 24/10/2026:** publicação bloqueada. A suíte ampla teve 25 falhas; quatro reproduziram no HEAD original. Os checks públicos e os dois fluxos autenticados específicos da landing passaram. Resolver a triagem de [L6_OPERATIONAL_FINDINGS.md](L6_OPERATIONAL_FINDINGS.md) antes de congelar/aprovar um commit de release.

## Identificação reproduzível

- Branch local: `feat/landing-page`.
- Commit base: `6f0d10b67e4f22259fa5b67f4e565029d55272db`.
- Código/mídia/testes do candidato: 37 arquivos, enumerados com SHA-256 em [CANDIDATE_FILES_L6.json](CANDIDATE_FILES_L6.json).
- Fingerprint da lista ordenada: `59ab41dbfdf25a5beccf45122162360471453c4f79de6280106d3fd819fd6f73`.
- Build local: `.next-landing-l6`, ID `QGrQZd-Eo5CApd05-h36h`.
- Preview: `http://localhost:3121/landing`, banco em memória e email desabilitado.

O fingerprint identifica os bytes locais; não é um commit Git nem um artefato publicável já aprovado. Não foi criado commit nesta fase. Antes de qualquer aprovação de release, congelar somente o escopo de marketing/testes/documentação correspondente em commit local, executar os checks aplicáveis a esse commit e apresentar o SHA exato e o alvo. As alterações preexistentes em `docs/AUTH_EMAIL_IMPLEMENTATION_REPORT.md`, `tsconfig.json`, `planning/` e `reset-password.sh` não pertencem ao candidato. Não incluí-las por um `git add .`.

## Comportamento atual e decisões pendentes de L7

| Área | Candidato atual | Exigência antes de promover |
| --- | --- | --- |
| `/` | Redirect existente para `/favorites` | Confirmar promoção da landing para `/`, incluindo comportamento esperado de membros autenticados |
| `/landing` | Composição editorial, noindex, canonical para `https://useloti.com/landing` | Escolher redirecionamento para `/` ou outra política sem duplicidade; revisar canonical e OG URL |
| Login | CTAs levam a `/login`; sessão mantém fluxo existente | Confirmar manutenção do acesso temporário ou validar aquisição pública entregue em outra frente |
| Ferramentas | Catálogo e cinco páginas próprias de construção, anônimas e noindex | Confirmar publicação desse estado ou substituir pelas ferramentas funcionais; LT37 autorizou construção local, não publicação |
| SEO privado | Root/auth/app continuam noindex | Liberar indexação somente nas URLs explicitamente aprovadas; manter convites/reset/verify/app privados |
| Gerenciador | Código e contratos preservados | Concluir regressões autorizadas e manter fixtures/ambientes reais separados |

## Pipeline e ação concreta a preparar para autorização

Leitura local de `.github/workflows/migrations.yml` confirma que push em `dev` ou `main` dispara validação e o job **Build, migrations e publicação**. O booleano de confirmação protege apenas o dispatch manual em `main`. `vercel.json` desabilita Git deploy para essas branches, mas não impede o workflow por CLI. Não usar push/merge como forma de obter preview ou publicar a landing.

O candidato não muda schema e não precisa de migration. Antes da execução de L7:

1. Resolver os pontos da tabela e os gates de [L6_QA_REPORT.md](L6_QA_REPORT.md). Congelar o commit exato, livre de mudanças de outras frentes.
2. Identificar com o operador o ambiente/alvo Vercel, URL final e deployment anterior saudável, com identificador recuperável e responsável pelo rollback. Esses dados remotos não foram consultados nesta fase.
3. Conferir migrations pendentes no alvo por procedimento especificamente autorizado. Não presumir que o schema remoto acompanha o checkout nem executar `db:migrate` por consequência do release.
4. Preparar uma publicação de artefato de aplicação que preserve o banco. Se o mecanismo disponível executar migrations obrigatoriamente, pedir uma decisão específica sobre esse efeito ou uma frente separada para o pipeline; não alterar CI/infra por inferência.
5. Apresentar para aprovação final: SHA, alvo, URL, comportamento de `/`/`/landing`, páginas indexáveis, mecanismo de publicação, efeitos exatos, deployment de retorno e roteiro de smoke. Só depois executar a ação autorizada.

Não há comando de deploy pronto neste documento porque alvo remoto, artefato anterior e política final de rotas ainda não foram aprovados. Nenhum segredo deve ser copiado para relatório, mídia ou argumentos registrados.

## Smoke de release proposto

Após uma publicação especificamente autorizada, conferir HTTP/head de cada URL pública aprovada; CTAs; cinco destinos; FAQ; imagens; ausência de chamadas privadas na visita anônima; login e navegação autenticada de leitura. Conferir acesso negado anônimo a Favorites/Purchase/History/Packages e cache/noindex de autenticação/convites. Não criar compra, importar QC, movimentar saldo ou aceitar convite real para testar marketing.

## Rollback

Se o smoke reprovar, retornar ao deployment saudável previamente identificado usando o mecanismo autorizado do hosting. Conferir restauração do comportamento anterior de `/`, login, sessão, rotas internas e noindex. O banco permanece intacto: a landing não exige rollback de dados. Não usar reset de banco, reversão de migrations ou limpeza de R2 para desfazer marketing.

No preview local, pode-se retirar apenas a composição de marketing ou voltar à jornada estática de L3 se o motion for rejeitado. Não apagar arquivos preexistentes nem reverter todo o checkout para desfazer este trabalho.
