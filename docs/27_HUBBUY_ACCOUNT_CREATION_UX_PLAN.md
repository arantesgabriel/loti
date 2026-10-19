# Plano faseado — simplificação da criação de contas HubBuy

Data: 17/10/2026. Status: **implementada localmente e validada**.

Este handoff refina somente a entrada de novas contas HubBuy e o recebimento de um reembolso HubBuy. Ele complementa [26 — saldo HubBuy e pagamentos mistos](26_HUBBUY_BALANCE_AND_MIXED_PAYMENTS_PLAN.md) e preserva o contrato de [23 — reembolsos de produtos](23_PRODUCT_REFUNDS_PLAN.md).

## 1. Problema observado

O cadastro atual sempre cria a conta como `reconciling`. Depois, a interface exige escolher um modo de conciliação, informar saldo, dividir direitos e bases históricas entre membros e descrever eventos anteriores. O recebimento do reembolso, por sua vez, só aceita contas `active`.

Esse fluxo coloca duas tarefas diferentes na mesma tela:

1. **Começar uma conta sem saldo/histórico no Loti**, para receber um crédito novo confirmado.
2. **Reconstruir um saldo que já existia**, com movimentações ou titularidade históricas que precisam ser conferidas.

O segundo caso precisa de conciliação. O primeiro não deve passar por ela. Para o cenário comum — recebimento confirmado de um reembolso HubBuy — criar a conta, sair do formulário, ativá-la e depois voltar ao reembolso é trabalho duplicado e expõe conceitos de contabilidade antes de serem necessários.

## 2. Decisões de produto já resolvidas

Não há nova decisão econômica em aberto para este ajuste:

- A carteira física fica em uma conta HubBuy, que pode ser compartilhada pelo grupo.
- Os direitos econômicos dos créditos continuam proporcionais por pessoa, conforme a composição financeira do reembolso (D1). Criar uma conta não transforma os créditos em propriedade coletiva.
- Se o saldo de uma pessoa financiar pedido de outra, o adiantamento explícito em CNY existente continua obrigatório (D2).
- Regras de acompanhamento/conta para pedidos e pacotes continuam as de D3.
- Só um recebimento efetivamente confirmado pode criar crédito. O formulário continua pedindo os valores nativos CNY e sua evidência; o Loti não converte valores BRL.

## 3. Resultado esperado

### Fluxo principal: primeira entrada é um reembolso

1. Em **Registrar recebimento**, escolher **Saldo na conta HubBuy**.
2. Selecionar uma conta ativa existente ou escolher **Criar conta HubBuy** no próprio formulário.
3. Ao criar, informar apenas o nome curto da conta. A interface deixa explícito: **“A conta começa com saldo zero; este reembolso será o primeiro crédito.”**
4. Informar os valores BRL recebidos, os valores CNY efetivamente creditados e a referência/comprovante já exigidos pelo fluxo.
5. Confirmar uma única ação: **“Registrar recebimento e creditar ¥X”**.

O servidor grava a nova conta (se necessária), o recebimento do reembolso, o crédito CNY, os direitos por pessoa e as operações de auditoria em uma única transação. Uma falha deixa todas essas partes sem efeito.

### Fluxo alternativo: cadastrar uma conta para uso futuro

O cadastro independente também fica simples: abrir **Contas HubBuy** → nome da conta → criar como **Ativa · saldo ¥0**. Não pede divisão por pessoa nem base BRL porque ainda não existe crédito. O primeiro evento financeiro cria suas próprias parcelas de titularidade.

### Área própria: Contas HubBuy

A lista, o saldo por pessoa, o extrato e a conciliação deixam de ocupar o detalhe de cada acompanhamento. Viram uma página própria em `/packages/accounts`, com um item **separado** na navbar lateral, imediatamente abaixo de **Pacotes e custos**, usando ícone de carteira. Não é filho indentado e não há menu/aba “Acompanhamentos · Contas HubBuy” nas páginas. Implementar como `src/app/(app)/packages/accounts/page.tsx`, rota estática que deve ter precedência sobre `[trackingId]`. A ilha mobile mantém os quatro destinos aprovados.

O detalhe do acompanhamento não exibe mais a seção extensa de contas e saldo. Continua mostrando o nome da conta associada e usando o seletor de conta nos fluxos que precisam dela. O recebimento de reembolso mantém a criação inline e reduzida a um nome; gerenciamento, conciliação, extrato, titularidade e arquivamento vivem na área própria. Para a densidade não reaparecer nessa nova página, a lista inicial mostra nome, estado, saldo e ação **Gerenciar**; extrato, eventos de conciliação e formulários detalhados abrem sob demanda para a conta escolhida.

### Fluxo avançado: havia saldo antes do Loti

Na área **Contas HubBuy e saldo**, a ação de histórico aparece separada como **“Conciliar saldo que já existia”**. Ela continua oferecendo a reconstrução cronológica ou a abertura do remanescente, com direitos individuais, bases históricas e conferência final. Conta com histórico não pode ser ativada como se começasse em zero.

## 4. Fases de implementação

### Fase 0 — contrato, baseline e proteção dos dados existentes

**Entrega:** transição clara entre conta nova, recebimento atual e saldo legado. Nenhuma alteração financeira ou migratória.

1. Conferir o estado local e os símbolos citados na seção 5, preservando trabalho anterior.
2. Manter os comandos financeiros existentes como fonte da verdade: `createAccount`, `receiveRefund`, ledger, eventos e parcelas por pessoa.
3. Definir que nova conta criada pelo caminho simples representa saldo inicial conhecido de ¥0; não representa um crédito, adiantamento ou conciliação de histórico.
4. Não alterar automaticamente contas existentes `reconciling`. Oferecer caminho explícito para contas realmente vazias, validado pelo servidor.
5. Registrar no plano 26 que a conciliação é necessária para história/saldo anterior não lançado, não para uma conta nova com zero conhecido.

**Gate G0:** recebimentos ainda só criam crédito depois da confirmação; nenhuma conta existente, parcela ou snapshot muda implicitamente.

### Fase 1 — cadastro independente de conta com saldo zero

**Entrega:** adicionar uma conta nova deixa-a pronta para uso, sem abrir o editor de conciliação.

1. Fazer `createAccount` criar uma conta `active` com saldo de cache ¥0 e ledger vazio, registrando autor/data e a confirmação explícita de início em zero.
2. Garantir que o estado derivado do ledger vazio seja reconciliado com saldo ¥0 e direitos vazios.
3. Remover a transição automática para `reconcilingId` após cadastro e substituir o toast por “Conta criada · saldo ¥0”.
4. Ajustar rótulos para separar “Adicionar conta (saldo zero)” de “Conciliar saldo que já existia”.
5. Não alterar `reconciling` para contas históricas ou contas com operações já registradas.

**Gate G1:** uma conta recém-criada pode ser selecionada para novos pedidos/refunds; não há lote, direito individual ou crédito fictício no ledger.

### Fase 2 — criar a conta dentro do recebimento do reembolso

**Entrega:** caso mais comum completo em um formulário e uma confirmação.

1. No destino HubBuy do formulário de recebimento, manter o seletor de contas ativas e adicionar a opção **Criar conta HubBuy**.
2. Revelar um único campo obrigatório de nome quando essa opção for escolhida. Ocultar desse subfluxo os modos de conciliação, direitos individuais, bases históricas e eventos cronológicos.
3. Acrescentar ao comando de recebimento a escolha exclusiva entre `accountId` existente e `newAccountLabel`; validar a exclusividade no servidor.
4. No serviço financeiro, criar a conta em zero e prosseguir com o mesmo recebimento/crédito dentro da transação do refund. Não fazer uma chamada de criação separada antes de confirmar o recebimento.
5. Persistir idempotência e auditoria de modo que repetir a mesma confirmação retorne a conta/operação existentes, sem conta duplicada, crédito duplicado ou segundo evento de recebimento.
6. Calcular e persistir os direitos individuais a partir das alocações já calculadas para aquele reembolso. Não adicionar campos para dividir o saldo na tela de conta.
7. Atualizar a UI para fechar o formulário e mostrar a conta criada, o valor CNY creditado e o evento de recebimento no histórico/extrato.
8. Para recebimento zero, não criar uma conta automaticamente nem lançar crédito monetário zero.

**Gate G2:** conta, recibo, entrada de ledger e parcelas individuais confirmam ou falham juntos; taxas e custo histórico continuam com as regras originais.

### Fase 3 — área própria de contas HubBuy

**Entrega:** separar gerenciamento de conta do detalhe financeiro da compra; a sidebar tem um item próprio, enquanto a ilha mobile conserva os quatro destinos.

1. Criar a página **Contas HubBuy** e seu próprio item visível na navbar lateral, como destino separado imediatamente após **Pacotes e custos**, com ícone pertinente e estado ativo acessível.
2. Criar `src/app/(app)/packages/accounts/page.tsx` para `/packages/accounts`, garantindo que a rota estática não seja interpretada como `trackingId`; se a estrutura atual pedir outro caminho, manter a relação pai/filho com `/packages`.
3. Mover para essa página a lista de contas, estado e saldo, direitos por membro, extrato, cadastro com saldo zero, conciliação histórica e arquivamento. Mostrar primeiro resumo e ação **Gerenciar**; abrir extrato e formulários detalhados só para a conta selecionada.
4. Remover o painel detalhado `Contas HubBuy e saldo` do detalhe do acompanhamento. Preservar ali apenas o contexto mínimo da conta usada e links/ações contextuais para a área de contas.
5. Manter o seletor de conta nos refunds e pedidos adicionais. A criação inline do recebimento não deve abrir nem exigir a página de gerenciamento.
6. Reutilizar `HubBuyAccountsPanel` extraindo-o para a nova página; passar permissões e dados pelo servidor com autorização do workspace. Não copiar a lógica financeira para um segundo componente/serviço.
7. Não adicionar abas/submenus “Acompanhamentos” e “Contas HubBuy” nas páginas. O item próprio da sidebar não altera a ilha mobile, que continua com quatro destinos.

**Gate G3:** área de gestão é independente do detalhe da compra e aparece como item próprio logo abaixo de Pacotes e custos na sidebar; a ilha mobile e seus quatro destinos e todos os deep links financeiros continuam funcionando.

### Fase 4 — recuperação segura de contas vazias já cadastradas

**Entrega:** quem iniciou o fluxo antigo, mas não registrou histórico, consegue concluir sem repetir todo o cadastro.

1. Permitir que uma conta antiga em `reconciling` seja tratada como nova/zero somente quando estiver sem entradas de ledger, sem eventos de conciliação e sem execução/modo de reconstrução iniciado.
2. Exigir confirmação explícita de que não havia saldo nem movimentações anteriores à entrada que será registrada.
3. Se o usuário escolher receber um refund nessa conta vazia, ativar e creditar na mesma transação, sem criar um lançamento de abertura ou duplicar o crédito.
4. Oferecer ação **“Ativar com saldo zero”** para conta realmente vazia usada apenas para pedidos futuros, também com confirmação explícita.
5. Rejeitar esse atalho se existir qualquer entrada, evento, execução de conciliação ou saldo observado diferente de zero. Direcionar o usuário para a conciliação existente.
6. Fazer todas as condições serem validadas no serviço, não apenas esconder/mostrar botões no cliente.

**Gate G4:** contas com histórico incompleto continuam bloqueadas para gasto até conciliação; nenhuma validação aceita zerar diferença ou atribuir titularidade por inferência.

### Fase 5 — verificação e fechamento do handoff

**Entrega:** comportamento e fluxo visual conferidos em banco sintético/local.

1. Adicionar/atualizar testes de unidade/integração para estados de conta, recebimento atômico, direitos D1, idempotência e negações da seção 6.
2. Cobrir em E2E a criação inline, confirmação de reembolso, visualização do crédito e seleção posterior da mesma conta.
3. Conferir keyboard/foco, mensagens de validação, overflow em 320 px e texto do caminho avançado.
4. Executar lint, typecheck, testes e build seguindo `AGENTS.md`; usar banco descartável. Não alterar banco de produção, configurar serviços, publicar ou registrar valores reais.
5. Atualizar `docs/26_HUBBUY_BALANCE_AND_MIXED_PAYMENTS_PLAN.md`, `docs/23_PRODUCT_REFUNDS_PLAN.md` apenas nos trechos necessários, o índice e o relatório de implementação, marcando este ajuste como concluído quando for de fato validado.

**Gate G5:** sucesso no caminho principal e nos casos de bloqueio, sem regressão nos refunds, pagamentos mistos, conciliação cronológica ou navegação.

## 5. Mapa de implementação

| Arquivo/símbolo | Mudança esperada |
| --- | --- |
| `src/components/packages/hubbuy-accounts-panel.tsx` — `createAccount`, `reconcile`, `return` | Conta nova inicia ativa em zero; remover autoabertura da conciliação; separar ações de saldo novo e saldo legado; oferecer tratamento explícito de conta vazia antiga. |
| `src/app/(app)/packages/page.tsx`, `src/app/(app)/packages/accounts/page.tsx` e `src/components/packages/packages-screen.tsx` | Criar a rota de gestão própria e seu link standalone na sidebar; não criar abas “Acompanhamentos” ou “Contas HubBuy” no conteúdo da página. Reutilizar o painel e as leituras autorizadas; preservar a precedência da rota estática sobre `[trackingId]`. |
| `src/components/packages/refunds-section.tsx` — `RefundActionSurface` | Criar conta inline somente quando o destino for HubBuy; CTA único; manter campos CNY/evidência e fluxo de conta existente. |
| `src/components/packages/package-cost-detail-screen.tsx` | Retirar a seção extensa de contas; preservar apenas o contexto da conta ligada ao acompanhamento e links contextuais necessários. |
| `src/lib/domain/hubbuy-balance-services.ts` — `createAccount`, estado do ledger | Registrar criação em zero e verificar ativação de conta vazia antiga dentro de transação. |
| `src/lib/domain/package-cost-services.ts` — `receiveRefund`, bloco de crédito HubBuy | Aceitar conta existente ou nome novo; transação atômica/idempotente; projetar crédito e parcelas D1 sem recalcular custos antigos. |
| `src/app/api/hubbuy/accounts/route.ts`, `src/app/api/packages/[trackingId]/route.ts` | Atualizar schemas/dispatch sem aceitar workspace, conta, titularidade ou valores não autorizados como verdade do cliente. |
| `src/lib/domain/package-cost-reading.ts`, `package-cost-client.ts` | Alterar DTO somente se a UI precisar distinguir conta ativa em zero, vazia pendente e conciliação iniciada. Não carregar extrato completo na página. |
| `tests/integration/hubbuy-balance-services.test.ts`, `package-refunds.test.ts`, `package-refund-hubbuy.test.ts`, `package-refund-concurrency.test.ts` | Acrescentar fixtures sintéticas para conta inicial em zero, recebimento atômico e recuperação de conta vazia. |
| `tests/e2e/hubbuy-balance.spec.ts` ou novo E2E de refund | Confirmar jornada de ponta a ponta e responsividade. |
| `docs/05_INFORMATION_ARCHITECTURE.md`, `docs/26_HUBBUY_BALANCE_AND_MIXED_PAYMENTS_PLAN.md`, `docs/INDEX.md`, `docs/IMPLEMENTATION_REPORT.md` | Documentar a página secundária, manter contrato, índice e execução coerentes após concluir implementação. |

Usar a rota/serviço já existentes sempre que possível. O mapa indica responsabilidades; mudanças de nomes são aceitáveis se preservarem os contratos. Nenhuma migração é esperada. Se o código exigir uma, justificar no plano de execução e manter toda aplicação explícita em banco descartável/local.

## 6. Critérios de aceite e regressão

| Cenário | Resultado obrigatório |
| --- | --- |
| Criar conta sem histórico pela área HubBuy | Conta ativa, saldo ¥0, ledger sem crédito, sem formulário de reconciliação. |
| Acessar Contas HubBuy | Disponível pela página `/packages/accounts` e por item próprio na sidebar logo abaixo de Pacotes e custos; lista e gestão não ficam embutidas em cada acompanhamento. |
| Abrir a página de contas com várias contas | A listagem mostra resumos; extrato e formulários detalhados só aparecem ao gerenciar uma conta. |
| Navbar lateral e ilha mobile | Sidebar tem item independente “Contas HubBuy” abaixo de Pacotes e custos; ilha mobile permanece com quatro destinos. |
| Abrir detalhe de acompanhamento | Mostra contexto mínimo da conta associada, sem repetir lista, extrato e conciliação completos. |
| Receber refund em conta existente ativa | Mesmo resultado e ledger anteriores, com direitos individuais calculados como hoje. |
| Receber refund e criar conta no formulário | Uma confirmação cria conta e crédito uma vez; o formulário não exige navegação para outra tela. |
| Erro ao validar/salvar recebimento com conta nova | Nenhuma conta, refund recebido ou crédito parcial fica persistido. |
| Retry idempotente após timeout | Mesmo resultado/IDs; sem nova conta, crédito, parcelas ou evento duplicado. |
| Refund creditado em conta nova | Soma CNY dos direitos = crédito; valores BRL históricos = bases recebidas atribuídas; taxa nova do saldo = zero. |
| Refund recebido externamente | Não cria nem seleciona conta HubBuy e não gera entrada CNY. |
| Recebido zero | Não cria conta nem entrada de saldo zero; custo segue a semântica existente. |
| Conta `reconciling` realmente vazia | Atalho exige confirmação do usuário e é validado dentro da transação. |
| Conta com evento/ledger/reconstrução iniciada | Atalho recusado; conciliação continua obrigatória. |
| Conta de outro workspace ou arquivada | Recusada no servidor, sem vazar estado. |
| Conta com saldo/histórico inconsistente | Sem ativação nem consumo; exige conciliação. |
| Refund já recebido/corrigido/anulado, tracking encerrado ou revisão desatualizada | Regras existentes de estado, revisão e confirmação permanecem. |
| Dois recebimentos concorrentes/mesma chave | No máximo uma operação financeira; saldo e revisão não ficam negativos ou duplicados. |
| Interface em 320 px/teclado | Sem overflow horizontal; criar, selecionar e confirmar é operável por teclado com foco visível. |

## 7. Limites

- Não converter histórico BRL em CNY nem preencher valores CNY por câmbio atual.
- Não tornar o saldo coletivo, remover direitos individuais, doar saldo ou criar adiantamento automaticamente.
- Não ativar automaticamente contas antigas que estejam aguardando conciliação.
- Não dispensar conciliação para dinheiro ou usos anteriores ao primeiro evento registrado.
- Não criar integração HubBuy, pagamento bancário, transferência, novo estado financeiro ou tabela sem necessidade comprovada.
- Não adicionar destino à ilha mobile; “Contas HubBuy” é uma página própria e um item independente da navbar lateral, logo abaixo de “Pacotes e custos”.
- Não alterar snapshots finalizados, pagamento/taxa original, refund confirmado, pacote, adiantamentos ou galeria QC.
- Sem migration de produção, configuração externa, publicação ou registro de dados reais nesta implementação local.
