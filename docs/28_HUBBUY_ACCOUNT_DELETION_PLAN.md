# Plano faseado — exclusão de contas HubBuy

Data: 17/10/2026. Status: **fases 1–5 concluídas e validadas localmente; sem publicação ou migração remota**.

## 1. Escopo e diagnóstico

Este plano trata de remover um cadastro de conta HubBuy **dentro do Loti**. Encerrar a conta no serviço externo HubBuy está fora deste escopo; essa possibilidade não foi investigada.

No estado local inspecionado na Fase 1, não existia exclusão de conta. Existia arquivamento, que mantém o cadastro e o histórico. A tabela abaixo registra esse baseline, anterior à implementação:

| Camada | Evidência atual |
| --- | --- |
| Interface | `src/components/packages/hubbuy-accounts-panel.tsx` oferece “Arquivar conta”; não oferece excluir. O botão aparece para conta ativa cujo saldo carregado esteja conciliado e zerado. |
| API | `src/app/api/hubbuy/accounts/[accountId]/route.ts` exporta GET e POST. O POST aceita conciliação, ativação em zero e `archive`; não aceita exclusão e não há handler DELETE. |
| Domínio | `hubbuyBalanceServices()` exporta `archiveAccount`, sem comando de exclusão. O servidor verifica associação ao workspace, revisão, conciliação e saldo zero ao arquivar. |
| Listagem | `listAccounts()` inclui contas arquivadas; arquivar não retira o cadastro da lista. `package-cost-reading.ts` também lê contas diretamente. |
| Banco | `drizzle/0008_hubbuy_balance_ledger.sql`, linha 142, cria `hubbuy_accounts_no_delete`, que rejeita DELETE físico de qualquer conta por retenção de auditoria. |
| Histórico | Pedidos, pacotes, componentes de pagamento, refunds, ledger e conciliação referenciam a conta. Operações financeiras também guardam seu identificador em contexto JSON. |
| Testes existentes | `tests/integration/hubbuy-balance-services.test.ts` cobre arquivamento de conta zerada e rejeição de revisão desatualizada; não representa cobertura da funcionalidade proposta. |

A verificação foi estática, sobre o diretório de trabalho atual, incluindo alterações locais anteriores. Não confirma a versão publicada nem o schema aplicado em produção. Não houve acesso ao HubBuy, exclusão real, execução de migrations ou registro financeiro.

## 2. Política proposta

Política adotada na execução solicitada após a Fase 1. Complementa os planos [26](26_HUBBUY_BALANCE_AND_MIXED_PAYMENTS_PLAN.md) e [27](27_HUBBUY_ACCOUNT_CREATION_UX_PLAN.md), sem alterar titularidade econômica.

- **Excluir cadastro sem uso:** retirar uma conta criada por engano da listagem e dos seletores por exclusão lógica, preservando sua identificação e auditoria mínima no banco.
- **Conta com histórico ou vínculo:** não permitir exclusão; manter o arquivamento existente quando elegível. Saldo zero sozinho não significa ausência de histórico.
- **Conta com saldo ou divergência:** bloquear exclusão; orientar para os fluxos de saldo/conciliação existentes, sem zerar, transferir ou perdoar valores automaticamente.
- **Sem exclusão física:** preservar `hubbuy_accounts_no_delete` e os registros append-only. Não adicionar cascatas nem apagar referências para fazer a conta parecer vazia.
- **Permissão:** seguir a associação ao workspace usada hoje por `archiveAccount`; não criar uma regra baseada no criador da conta nem um papel administrativo novo.

### Elegibilidade para exclusão

Verificar todas as condições no servidor, na mesma transação da alteração:

1. Conta acessível ao membro autenticado, ainda não excluída e com revisão esperada atual.
2. Cache de saldo e saldo derivado do ledger iguais a zero, estado consistente e nenhum direito individual remanescente.
3. Nenhuma entrada de ledger, mesmo quando créditos e débitos se anulam; consequentemente, nenhum consumo ou adiantamento associado.
4. Nenhuma execução ou evento de conciliação iniciado, mesmo sem saldo final.
5. Nenhum pedido, pacote, componente de pagamento ou refund referenciando a conta, inclusive rascunhos, cancelados, anulados e recebimentos de valor zero.
6. Nenhum evento operacional que evidencie uso anterior. Permitir apenas auditoria de criação, ativação explícita em zero e arquivamento sem uso; manter esses registros. Inventariar também referências em JSON e eventos históricos, além das FKs.

Uma conta legada em `reconciling` só poderá ser excluída se estiver realmente vazia conforme essas condições. Não ativá-la nem marcá-la como conciliada para permitir exclusão. Contas arquivadas nunca usadas também poderão ser excluídas pelo mesmo contrato.

## 3. Fases e gates

### Fase 1 — investigação e contrato, sem editar código

**Entrega nesta solicitação:** diagnóstico, política proposta, mapa de arquivos e critérios verificáveis neste documento.

- Inspecionar interface, API, serviço, dependências e bloqueios do banco.
- Distinguir exclusão do cadastro local, arquivamento e encerramento externo.
- Registrar casos permitidos e proibidos e preservar o trabalho local já existente.
- Encerrar após documentar o plano. Não iniciar as fases seguintes automaticamente nesta solicitação.

**Gate G1:** plano disponível; nenhum código, teste, schema, migration, configuração ou dado alterado.

### Fase 2 — persistência e comando de domínio

**Entrega futura:** exclusão lógica atômica, autorizada e auditada.

1. Antes de escrever código, ler a sequência canônica exigida em `AGENTS.md` e os handoffs 21, 23, 24, 26 e 27 pertinentes; conferir novamente o diff e o journal, que já têm trabalho local.
2. Adicionar `deletedAt` e `deletedBy` nulos por padrão à conta, com FK de autor e consistência entre os dois campos. Preferir manter o enum atual: exclusão lógica também define `status = archived`, sem transformar conta excluída em conta ativa para clientes antigos. Registrar a diferença entre arquivada e excluída pelos metadados.
3. Criar migration aditiva na próxima posição livre do journal real, sem assumir que a numeração atual permanecerá a mesma. Preservar o trigger de bloqueio de DELETE físico e todas as proteções append-only. Não marcar contas antigas automaticamente.
4. Criar uma verificação central de elegibilidade reutilizável, com motivos estáveis de bloqueio. Não confiar em `canDelete` enviado pelo navegador e não executar uma consulta por conta na listagem.
5. Implementar `deleteAccount(accountId, { expectedRevision, idempotencyKey, reason })`, com Zod, autorização centralizada e operação auditada `account_deleted`. Inventariar e ajustar eventuais restrições de tipos de operação.
6. Na mesma transação: autorizar, validar idempotência, recalcular elegibilidade, inserir auditoria, atualizar metadados/status e incrementar revisão com atualização condicional. Falha deve desfazer tudo.
7. Repetir a mesma chave e payload retorna a mesma operação, inclusive após a exclusão; outra carga com a mesma chave gera conflito. Autorizar o acesso ao registro retido antes de devolver um replay. Uma nova tentativa sobre conta já excluída não cria outro evento.
8. Tratar retries de criação/ativação de conta após exclusão: nunca restaurar a conta nem apresentá-la como ativa. Um replay financeiro anterior continua sendo auditoria, sem efeitos novos; qualquer novo comando deve recusar a conta excluída.

**Gate G2:** somente cadastros sem uso são excluídos logicamente; exclusão física continua proibida; registros existentes e valores financeiros permanecem iguais.

### Fase 3 — API, leituras e proteção de todos os escritores

**Entrega futura:** conta excluída deixa de circular pelos fluxos operacionais.

1. Acrescentar `operation: delete` ao POST existente de conta e encaminhar ao comando central. Não criar um DELETE físico nem um segundo caminho de regras.
2. Preservar sessão, validação de origem, headers privados e tratamento de erros atuais. Retornar conflitos de revisão/elegibilidade sem expor dados de outro workspace.
3. Excluir registros com `deletedAt` da listagem padrão e de todos os seletores, inclusive as leituras diretas de `package-cost-reading.ts`. Contas apenas arquivadas continuam distinguíveis.
4. Oferecer capacidade derivada `canDelete` e motivos de bloqueio para a UI. GET comum de conta excluída deve seguir a convenção de recurso indisponível; replay autorizado e auditoria interna continuam conseguindo localizar o registro retido.
5. Revisar todos os escritores: pedido adicional/rascunho, pacote, componentes de pagamento, refund, ativação, conciliação e arquivamento. Validar a conta utilizável e não excluída dentro da transação; não depender apenas do seletor ou da revisão no comando de exclusão.
6. Cobrir concorrência com escritores que criam referências sem alterar a revisão da conta. Usar transações e predicados apropriados ao libSQL; se necessário, acrescentar restrições/triggers específicos. O lock JavaScript do processo isoladamente não prova segurança em múltiplas instâncias Vercel.

**Gate G3:** nenhum novo vínculo ou movimento pode ser gravado após a exclusão. Em uma corrida, se o uso vencer, a exclusão é recusada; se a exclusão vencer, o uso é recusado. Não pode haver sucesso de ambos.

### Fase 4 — interface em Contas HubBuy

**Entrega futura:** ação contextual clara e acessível em `/packages/accounts`.

1. Em “Gerenciar”, oferecer “Excluir conta” para cadastros elegíveis, inclusive legados vazios e arquivados sem uso.
2. Quando bloqueada, explicar o motivo: por exemplo, “Esta conta tem histórico. Para retirá-la de uso, arquive quando o saldo estiver conciliado e zerado”. Não recomendar arquivamento como solução universal para toda conta bloqueada.
3. Reutilizar `Confirm` com ação destrutiva explícita e motivo: “Excluir cadastro do Loti? A conta sairá da lista. A auditoria será preservada. Isso não encerra sua conta no HubBuy”. Cancelar não produz chamada de mutação.
4. Desabilitar confirmação em andamento, manter a chave de idempotência no retry do mesmo envio e tratar conflito com atualização dos dados/motivo do bloqueio.
5. Após sucesso, atualizar a lista, limpar seleção, formulários e caches de saldo/extrato da conta e devolver o foco a um elemento adequado. Se era a última, mostrar o estado vazio existente.
6. Preservar ilha mobile e galeria QC; conferir teclado, foco e ausência de overflow em 320 px.

**Gate G4:** excluir cadastro vazio funciona sem recarregar a página; contas com histórico mantêm informação e alternativa corretas; cancelamento e erro não removem a linha localmente.

### Fase 5 — validação e handoff operacional

**Entrega futura:** evidência em dados sintéticos e documentação final.

- Integração: conta nova vazia, legada vazia e arquivada sem uso; bloqueios por saldo, divergência, ledger líquido zero, conciliação iniciada e cada classe de vínculo, incluindo refund zero e pedido anulado.
- Segurança: sem sessão, outro workspace e acesso direto por ID; validação de origem na API; nenhum replay vaza informação ou ressuscita cadastro.
- Atomicidade/idempotência: rollback após falha injetada, mesma chave/payload, chave reutilizada com outros dados, revisão antiga e dupla confirmação.
- Concorrência em conexões/processos independentes: exclusão contra recebimento de refund, criação de pedido, vínculo a pacote, ativação/conciliação e outra exclusão.
- Migration: banco vazio e upgrade de fixture anterior, preservação de dados/triggers/FKs, metadados nulos em contas existentes e reaplicação pelo runner sem duplicação. `db:verify` deve refletir o novo contrato.
- E2E: criar e excluir, cancelar, conta bloqueada com histórico, última conta, retry e fluxo por teclado/mobile.
- Executar testes direcionados durante implementação e `npm run check` no fechamento; Playwright e gates de migration são separados, sempre com banco descartável explicitamente configurado. Não usar o destino padrão de dotenv para QA migratório.
- Atualizar docs de regras, schema, critérios, índice e relatório somente com o comportamento efetivamente entregue. Não afirmar validação futura como já realizada.

**Gate G5:** checks aprovados e limitações registradas. Deploy e migration de produção exigem autorização operacional específica, backup e corte coordenado de versões antigas; não fazem parte desta entrega de planejamento.

## 4. Mapa de implementação futura

| Arquivo/área | Responsabilidade |
| --- | --- |
| `src/lib/db/schema.ts`, próxima migration e snapshots/journal | Metadados de exclusão, constraints e retenção física. |
| `src/lib/domain/hubbuy-balance-services.ts` | Elegibilidade, comando, auditoria, revisão, idempotência, leituras e proteção de conta excluída. |
| `src/app/api/hubbuy/accounts/[accountId]/route.ts` | Nova operação POST com proteção HTTP existente. |
| `src/app/api/hubbuy/accounts/route.ts`, página de contas | DTO e listagem autorizada sem excluídas. |
| `src/lib/domain/package-cost-reading.ts` | Remover excluídas das leituras operacionais diretas. |
| `src/lib/domain/purchase-cost-order-services.ts`, `package-cost-services.ts` e escritores encontrados no inventário | Impedir novos vínculos/uso de conta excluída na própria transação. |
| `src/components/packages/hubbuy-accounts-panel.tsx` | Ação, confirmação, bloqueios, atualização e foco. |
| `scripts/verify-database.ts`, testes HubBuy/refund/pedidos e novo cenário de concorrência | Comprovar integridade, upgrade e ausência de regressões financeiras. |

## 5. Limites desta evolução

Não encerrar contas no HubBuy externo, integrar API, apagar dados de terceiros, limpar ledger, eliminar saldos, redistribuir direitos, remover adiantamentos, alterar refunds ou snapshots finalizados. Não acrescentar restauração, lixeira, expurgo físico ou novos serviços nesta primeira implementação. Exclusão lógica é remoção operacional do cadastro e não apagamento integral de dados pessoais.

Na Fase 1, somente documentação foi alterada e nenhum teste foi executado. O usuário solicitou posteriormente a execução das fases pendentes.

## 6. Registro da execução local

- Migration aditiva `0018_amused_mikhail_rasputin.sql`, snapshot/journal e 19 novas proteções de ciclo de vida. Os metadados de exclusão são pareados por triggers, evitando reconstruir a tabela e preservando os triggers anteriores. Exclusão física continua proibida.
- `deleteAccount` exige associação ao workspace, motivo, revisão e idempotência, revalida elegibilidade e grava tombstone + auditoria atomicamente. Uma leitura de recuperação verifica a operação persistida após erro transitório/commit incerto; nunca repete uma exclusão com chave nova automaticamente.
- A capacidade de exclusão usa uma consulta com EXISTS correlacionados. Examina FKs e valores textuais exatos em árvores JSON de operações e eventos de refunds. Eventos de pacote não têm JSON de conta; seu vínculo é pelo pacote, que já bloqueia exclusão. Não se criou um extrato adicional.
- POST `operation: delete` reutiliza sessão/origem/no-store; contas excluídas saem da gestão e das leituras financeiras e são recusadas pelos escritores e pelo banco. GET comum não expõe o registro retido. Replay de criação de cadastro excluído retorna indisponível, sem recriação.
- Gerenciar → Excluir conta usa `Confirm`, motivo, mensagem de escopo local, erro acessível, chave estável no retry e retorno de foco ao cadastro. Contas bloqueadas mostram o motivo, preservando o fluxo de arquivamento.
- Suites novas de serviço, upgrade e sete corridas entre processos; E2E de exclusão/perda de resposta e regressão da criação/crédito. As fixtures antigas de migração foram ajustadas para não executar leitores atuais sobre schema anterior: inserção histórica explícita no teste do ledger e cópia das colunas antigas no teste de QC.
- O harness E2E agora aceita `LOTI_E2E_PRODUCTION=1` para usar um build local já gerado. Este modo continua provisionando banco e identidades descartáveis, sem recurso remoto ou publicação.

### Handoff operacional

Validação local em 17/10/2026:

| Gate | Resultado |
| --- | --- |
| TypeScript, lint e build | Passaram após a última alteração de código. |
| Vitest completo, um worker/threads | 278 testes passaram; 7 skips; 38 arquivos passaram e 1 foi ignorado. Inclui as sete corridas em processos independentes. |
| Playwright Chromium | Dois cenários passaram: exclusão/cancelamento/retry/foco e criação/crédito/pedido misto; confirma bloqueio da exclusão de conta com saldo. |
| Migration e `db:verify`, SQLite descartável explícito | 47 tabelas verificadas, 51 triggers requeridos e zero violações FK. Upgrade anterior e reaplicação também cobertos na suíte. |
| QA visual | Capturas 320/1440 px inspecionadas em `artifacts/qa/hubbuy-account-deletion/confirmation-{320,1440}.png`; sem overflow da página. |
| Diff | `git diff --check` sem erros de whitespace. |

O runner paralelo reproduziu o `ENOENT` de cache SSR já documentado no Windows. A repetição serial com threads passou, sem remover testes. Artefatos `.next` e limpeza de bancos temporários exigiram execução local fora do sandbox restrito por `EPERM`. Um primeiro E2E no Next dev falhou por JSON de manifest incompleto; o build de produção local eliminou a dependência de recompilação. A corrida com chave idêntica expôs commit incerto do driver local; a recuperação por operação persistida foi adicionada e a suíte completa repetida passou.

Comandos finais: `npm run typecheck`, `npm run lint`, `npm run build`, `npm test -- --maxWorkers=1 --no-file-parallelism --no-isolate --pool=threads --testTimeout=45000`, e os dois arquivos Playwright com `LOTI_E2E_PRODUCTION=1` e banco descartável explícito. Os gates equivalentes de `npm run check` passaram separadamente; o comando agregado inicial com o runner padrão não passou pelo problema de cache descrito.

Após autorização específica: confirmar alvo e backup recuperável → coordenar o bloqueio de escritores antigos → aplicar o journal até `0018` explicitamente → `npm run db:verify` → publicar a versão compatível → smoke de exclusão de cadastro sintético autorizado, bloqueio por histórico e regressão de refund/pedido. Nenhuma dessas ações remotas foi executada nesta tarefa.

Depois de existir tombstone, rollback apenas do código pode voltar a mostrar contas retidas nas telas antigas; seus novos vínculos continuam bloqueados pelos triggers. Preferir correção em frente, ou recuperação coordenada com análise dos eventos posteriores ao backup. Não remover triggers ou auditar menos para contornar um erro.

## 7. Correção de cadastro e conciliação informados por engano

O usuário esclareceu que informou um saldo apenas para tentar liberar a exclusão, após orientação equivocada para concluir a conciliação. O valor não representa saldo real. Este aditivo permite desfazer esse erro de entrada sem apagar a conciliação nem inventar um uso externo do dinheiro.

Caminho separado: **Gerenciar → Corrigir cadastro e excluir → motivo + confirmação explícita de valores incorretos → Anular e excluir**. A exclusão comum continua exigindo ausência de histórico. A nova operação `discard.incorrect` exige `confirmedIncorrectRegistration: true` e não executa transferências nem encerra conta externa.

Elegibilidade: conta com execução de conciliação, ainda sem pedido (inclusive draft/voided), pacote, componente de pagamento, refund, evento histórico de refund ou qualquer uso/consumo/adiantamento. Seus créditos devem ter origem exclusivamente na abertura ou nos eventos de recebimento da própria conciliação, sem referência a um refund legado. Nenhum débito ou recebimento de refund real pode ser estornado por esse atalho. Contas com apenas conciliação iniciada e sem valores também são elegíveis. A confirmação de que os valores não representam saldo real é declaração explícita do membro; o app não consulta a HubBuy para inferi-la.

Na transação, o servidor valida permissão/revisão/idempotência e consistência dos lotes, registra `account_registration_discarded` com autor, motivo, confirmação, revisão e IDs originais, cria um débito de reversão para cada crédito incorreto e liga suas parcelas CNY/BRL integralmente aos direitos originais. Somente depois de conferir ledger e direitos zerados marca o tombstone e remove o cadastro da lista. Originais, parcelas, eventos e conciliação permanecem imutáveis; não há crédito fictício, doação de direitos, nova taxa ou edição de snapshot.

A migration **`0019_discard_incorrect_hubbuy_registration.sql`** substitui somente o guard de elegibilidade da exclusão. A exceção exige operação auditada da revisão/autor atuais, nenhuma referência operacional, origens permitidas e reversão integral de cada crédito e de suas parcelas. Um marcador de auditoria sem os estornos não permite excluir a conta. Os demais triggers permanecem; `db:verify` também confirma a presença dessa versão do guard. Rollback/falha desfaz auditoria, reversões, consumos e tombstone juntos.

Esta alteração é implementação local; a conta mostrada pelo usuário não foi consultada nem alterada. Migration remota e publicação continuam ações operacionais separadas. Aplicar o journal até `0019` ao ambiente autorizado antes de disponibilizar a ação; não orientar o usuário a lançar uso sintético, refund, valor zero ou outro movimento inventado para contornar o bloqueio.

Validação do aditivo: TypeScript, lint e build passaram; suíte completa teve **290 testes aprovados e 7 skips**, em 40 arquivos aprovados e 1 ignorado. Os nove testes de concorrência usam processos independentes; os dois novos casos cobrem retry de anulação e corrida contra novo pedido. **Três cenários Chromium passaram**, incluindo anulação de conciliação cronológica sintética ¥50/R$43, cancelamento sem gravação, confirmação obrigatória, foco e retenção do crédito original mais seu estorno. Upgrade de 0018 e reaplicação preservam os registros; migration/verify em SQLite descartável verificaram 47 tabelas, 51 triggers e zero violações FK. Capturas do aditivo em `artifacts/qa/hubbuy-account-deletion/discard-{320,1440}.png`. Os números da seção 6 registram o gate anterior à correção.
