# Loti — anexo da Fase 1: evidências remotas de GitHub e deploy

Consulta em 21/10/2026, aproximadamente 11h35–11h40, America/Sao_Paulo. Fontes: conector GitHub, GET de metadados, branches, workflows e jobs. Não houve fetch/pull local, execução/reexecução de Actions, mutation GitHub, consulta de secrets, acesso direto Vercel ou alteração remota.

## 1. Baselines diferentes

| Fonte | Branch | Commit |
|---|---|---|
| Checkout auditado | dev | `a87920ac7b9360b3b9e4da7322698b35dbd581ac` |
| Cache local de origin/dev | dev | `a87920ac7b9360b3b9e4da7322698b35dbd581ac` |
| GitHub consultado | dev | `734be0072a813889f1772d74b2c98f375bf04189` |
| GitHub consultado | main | `ba16963b35f45f325ed1efd199a47f89aa2e9998` |

O repositório consultado é `arantesgabriel/loti`, com branch padrão main. O endpoint de branches retornou main protegida e dev não protegida. Não foram consultadas todas as regras de proteção, rulesets ou aprovadores dos GitHub Environments; “protegida” não comprova gate de testes/aprovação específico.

Fontes: [main](https://api.github.com/repos/arantesgabriel/loti/branches/main), [dev](https://api.github.com/repos/arantesgabriel/loti/branches/dev). Links de branch são mutáveis; os SHAs acima identificam o instante auditado.

## 2. Execuções observadas

Foram consultados até três runs recentes de dev e dois de main; isso não é histórico exaustivo.

| Branch / SHA | Run | Criação em São Paulo | Conclusão GitHub | Evidência de etapas |
|---|---|---|---|---|
| main / `ba16963` | [39604151819](https://github.com/arantesgabriel/loti/actions/runs/39604151819) | 21/10, 09h59 | failure | Validate: typecheck, lint e unitários com sucesso. Deploy falhou em “Validar configurações”; build, migrations, verify e publicação foram ignorados |
| main / `2b472d9` | [39601543651](https://github.com/arantesgabriel/loti/actions/runs/39601543651) | 21/10, 09h40 | failure | Apenas estado agregado consultado; não foi diagnosticado |
| dev / `734be00` | [39616558966](https://github.com/arantesgabriel/loti/actions/runs/39616558966) | 21/10, 11h24 | skipped | “Validar aplicação” e “Build, migrations e publicação” ignorados; sem steps executados nesses jobs |
| dev / `fc986f7` | [39612146365](https://github.com/arantesgabriel/loti/actions/runs/39612146365) | 21/10, 10h54 | success | Validate passou; job de build/migrations/deploy passou, incluindo “Executar migrations”, “Verificar integridade do banco” e “Publicar Preview via API Vercel” |
| dev / `17fcbe7` | [39610030955](https://github.com/arantesgabriel/loti/actions/runs/39610030955) | 21/10, 10h40 | failure | Apenas estado agregado consultado; não foi diagnosticado |

Os jobs consultados são os da tentativa mais recente retornada pelo conector. Nenhum teste novo foi executado pela auditoria. “Success” é estado do runner para aquele commit, não certificação de dados reais, de todos os fluxos ou do deployment hoje servido ao usuário. Não foram lidos logs brutos para procurar causa de configuração ou URLs/credenciais.

Uma consulta inicial aos wrappers de status e runs de PR para o SHA local retornou listas vazias. O wrapper de runs de commit é restrito a eventos de PR; por isso as evidências acima foram obtidas diretamente nas coleções GET por branch. Listas vazias desses wrappers não foram interpretadas como ausência de CI.

## 3. Workflow local versus revisões remotas

### Checkout local e main remoto consultado

O arquivo local `.github/workflows/migrations.yml` dispara por push dev/main e por workflow_dispatch, com jobs validate e deploy. A revisão de main em `ba16963` mantém o fluxo de build local Vercel, migration, verify e deploy prebuilt.

O validate configura Node 24, instala por npm ci e executa typecheck, lint e unitários. Não inclui integração ou E2E. O deploy mapeia main → Production, dev → Development/Preview. No checkout, usa `vercel@latest`, valida presença de variáveis e compara credenciais do banco obtidas da Vercel com o ambiente GitHub antes de build/migration. Esses são comportamentos de configuração, não ações executadas nesta fase.

Fonte versionada de main: [workflow em ba16963](https://github.com/arantesgabriel/loti/blob/ba16963b35f45f325ed1efd199a47f89aa2e9998/.github/workflows/migrations.yml).

### dev remoto em 734be00

O workflow mais novo observado em dev tem diferenças materiais:

- Linhas 12–16: input `confirm_production` para execução manual.
- Linha 28: validate só roda se `github.ref_name == 'main' && github.event_name == 'workflow_dispatch'`.
- Linhas 34–43: execução de main exige confirmação verdadeira.
- Linhas 66–67: deploy depende de validate e admite refs dev/main.
- Há validação de HEAD da branch, destino Turso esperado e versão Vercel CLI fixada em 65.0.0.
- Faz deployment remoto, em Production com `--skip-domain`, inspeciona projeto/ambiente/READY, depois aplica migration e verify (linhas 213–216) e verifica novamente HEAD antes de alias/promoção.
- Linhas 228–248: caminho Preview associa o domínio `dev.useloti.com` via API.
- Linhas 250–274: caminho Production solicita promoção por API; o próprio resumo pede conferir conclusão no dashboard.

Fonte versionada: [workflow em 734be00](https://github.com/arantesgabriel/loti/blob/734be0072a813889f1772d74b2c98f375bf04189/.github/workflows/migrations.yml).

**Inferência estática corroborada pelo run:** push dev não satisfaz a condição de validate, e deploy depende desse job. Isso explica os dois jobs ignorados no run 39616558966. Não foi feita correção, sugestão de patch operacional ou reexecução. A confirmação manual de Production existe nessa revisão de dev, mas não deve ser atribuída automaticamente à revisão de main consultada.

O workflow remoto que teve sucesso em `fc986f7` é uma revisão anterior. Seus steps observados comprovam que o runner registrou migration/verify e publicação Preview naquele run, sem provar que a revisão atual faça o mesmo. A auditoria não abriu a aplicação publicada para verificar conteúdo, domínio ou banco.

## 4. Conclusões permitidas e limites

É possível concluir que há CI/CD real recente e que o caminho passou por alterações além do cache Git local. Também é possível localizar a falha recente de main na etapa de validação de configuração, antes de migrations/publicação, e a ausência de execução no push dev mais novo.

Não é possível concluir qual variável causou a falha, se Production está indisponível, qual deployment está ativo, se o projeto Vercel usa main como branch configurada, se todos os schemas remotos estão atualizados, quais são os planos contratados ou se DNS/R2/Resend estão corretamente configurados. O runner de Preview bem-sucedido não substitui essas verificações.

A política futura de migrations, gates e rollback deve considerar esse estado real antes de qualquer implementação/publicação autorizada. Este anexo é evidência de planejamento; não autoriza alterar o pipeline nem atualizar o checkout.
