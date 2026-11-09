# L6 — Achados da regressão operacional

Execução principal concluída em 23/10/2026; retomada e triagem em **24/10/2026**. Candidato local sobre o HEAD `6f0d10b67e4f22259fa5b67f4e565029d55272db`, build `.next-landing-l6`. **39 testes passaram, 25 falharam, 2 foram ignorados**, em 66 casos do harness existente. Não se trata de uma suíte aprovada para release.

O provisionamento foi autorizado em LT39: banco descartável com pessoas fictícias, email fake em localhost e R2 desativado. Os dois casos ignorados dependem da fixture S3 privada opt-in, que não foi ativada. O resultado integral está em `artifacts/qa/landing-l6/app-e2e-results.json`; a lista de casos/erros sanitizados para triagem está em `app-e2e-triage.json`, na mesma pasta ignorada.

Nenhum teste existente, CSS global, fluxo operacional ou cálculo foi alterado para acomodar a execução. As fontes e os testes afetados correspondem ao HEAD original. Isso ajuda a delimitar o escopo, mas não prova sozinho a origem de todas as falhas; a suíte também compartilha fixtures entre casos e falhas anteriores podem afetar casos posteriores.

## O que os resultados permitem concluir

- A suíte pública da landing passou em 8/8 casos, com cinco larguras, axe, motion, FAQ e versão sem JS. As 217 verificações unitárias e 119 integrações selecionadas passaram; um teste de lease QC em arquivo adicional foi excluído.
- A suíte operacional ampla **não está verde**. Há seletores claramente incompatíveis com a navegação atual, falhas de dimensões/overflow e expectativas financeiras que exigem investigação específica.
- A ausência de capa QC em uma linha de custo não autoriza implementar apresentação Phase 3. O gate específico de QC continua vigente; atualizar essa expectativa exige revisar o contrato aprovado, não inserir uma capa para satisfazer o teste.
- A divergência de saldo observada não autoriza alterar bases, ledger, pagamento, fee ou refund. Primeiro verificar fixture, ordem dos casos e expectativa contra a regra vigente.

## Inventário das 25 falhas

As linhas indicam o início do caso, não necessariamente o ponto exato da asserção. “Investigar” não significa defeito de produto já comprovado.

| Caso existente | Observação inicial |
| --- | --- |
| `auth-session.spec.ts:4` | Procura heading “Seu perfil”; o HEAD usa “Configurações” |
| `favorite-card-layout.spec.ts:4` | Uma asserção geométrica recebe false; identificar elemento/largura antes de corrigir |
| `favorites.spec.ts:21` | Logout aguardado sem selecionar a aba atual Ações da conta |
| `hubbuy-account-deletion.spec.ts:6` | Asserção booleana de layout/foco falha; investigar geometria mobile |
| `hubbuy-account-discard.spec.ts:9` | Asserção booleana falha no fluxo operacional; investigar separadamente |
| `hubbuy-accounts-ui.spec.ts:6` | Timeout aguardando combobox “Conta selecionada” |
| `hubbuy-balance-adjustments.spec.ts:83` | Espera saldo CNY minor 115 e recebe 0; investigar regra/fixture/estado compartilhado |
| `hubbuy-balance.spec.ts:6` | Texto esperado não encontrado na região Direitos individuais |
| `hubbuy-qc.spec.ts:308` | Espera `.qc-product-cover` na linha/card de custo; confrontar com gate Phase 3 |
| `hubbuy-qc.spec.ts:497` | Limite de 390 px, dimensão observada de 480 px |
| `hubbuy-qc.spec.ts:565` | Espera atributo de capa QC que não está presente na linha/card |
| `invitations.spec.ts:10` | Procura link antigo “Meu grupo” sem navegar pela aba atual |
| `invitations.spec.ts:61` | Logout aguardado sem escolher Ações da conta |
| `invitations.spec.ts:105` | Timeout; conferir seletor/etapa no trace antes de atribuir causa |
| `login.spec.ts:140` | Timeout no fluxo que inclui logout; conferir aba atual |
| `package-costs-hybrid.spec.ts:7` | Espera imagem `.qc-import-primary img` com asset específico; elemento ausente |
| `packages.spec.ts:6` | Limite de 320 px, dimensão observada de 336 px |
| `profile.spec.ts:4` | Timeout aguardando label “Nome completo”, divergente da UI atual |
| `purchase.spec.ts:10` | Asserção booleana falha; investigar passo e estado deixado por casos anteriores |
| `purchase.spec.ts:45` | Overflow explicitamente detectado em 320 px |
| `theme.spec.ts:34` | Timeout; navegação de preferências/logout deve considerar as abas atuais |
| `theme.spec.ts:65` | Timeout no teste de portal/tema entre abas; conferir controles atuais |
| `theme.spec.ts:87` | Timeout no teste de storage bloqueado; conferir acesso à categoria Aparência |
| `theme.spec.ts:99` | Timeout no teste de cobertura de rotas/temas; conferir acesso à categoria Aparência |
| `theme.spec.ts:119` | Timeout aguardando radio Escuro sem selecionar Aparência; não chegou a comprovar regressão financeira |

## Comparação com a base e checks complementares

Foi exportada uma cópia intacta do HEAD para `artifacts/qa/landing-l6/baseline-head/`, com dependências locais reutilizadas sem instalação. A pasta data dessa cópia aponta ao mesmo diretório autorizado; o harness continua limitado ao nome descartável autorizado, sem novo alvo de banco. O build da base passou e os quatro casos selecionados falharam com os mesmos erros do candidato: sessão (`auth-session.spec.ts:4`), Cards (`favorite-card-layout.spec.ts:4`), exclusão de conta (`hubbuy-account-deletion.spec.ts:6`) e capa QC (`hubbuy-qc.spec.ts:308`). Evidências: `baseline-e2e-results.json` e `baseline-comparison.json`. Esses quatro casos estão comprovadamente presentes sem a landing; os outros 21 não foram todos reproduzidos isoladamente e continuam sem atribuição conclusiva.

Foram acrescentados dois testes novos em `tests/e2e/landing.spec.ts`, sem alterar os existentes: preservação de tema/view entre landing e gerenciador, acesso ao grupo pela navegação atual e restauração/logout de sessão pela aba Ações da conta. **Os dois passaram**, em fixture nova no mesmo alvo autorizado. Evidência: `landing-authenticated-results.json`. Isso comprova esses fluxos pela UI atual, sem apagar os resultados dos testes herdados ou afirmar que todos os 25 casos foram resolvidos.

Os servidores de fixtures foram encerrados. Os bancos descartáveis foram arquivados nos artefatos ignorados para diagnóstico; o alvo E2E não permaneceu em `data/`. O preview da landing foi restaurado em `http://localhost:3121/landing`, com banco em memória e email desabilitado.

## Encaminhamento

Manter o candidato sem publicação. Resolver primeiro a triagem de seletores/contratos, depois os problemas de UI reproduzidos e as divergências financeiras, com escopo próprio aprovado quando envolver domínio operacional. Não reduzir asserções financeiras, aumentar timeouts indiscriminadamente nem implementar QC Phase 3 para tornar a suíte verde. Após correções legítimas, repetir os casos relevantes e verificar isolamento/cleanup das fixtures antes de rodar novamente a suíte ampla.
