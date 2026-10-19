# Plano faseado — saldo HubBuy, pagamentos mistos e pedidos adicionais

Data: 17/10/2026. Status: **implementação local concluída e validada; sem migração remota ou dados reais**.

Base inspecionada: commit `3a0c5d4149dbaec801b4c656de11a20f01624844`, com trabalho local preexistente. Fundamentação: [investigação técnica e funcional](C:/Fontes/loti/docs/audits/2026-10-17_HUBBUY_BALANCE_AND_MIXED_PAYMENTS.md).

Este plano detalha a arquitetura e o registro de execução. O usuário confirmou D1–D3 em 17/10/2026, e o pedido de implementação autoriza mudanças locais e fixtures sintéticas. Isso não autoriza publicar, migrar produção, configurar serviços externos ou registrar/conferir valores financeiros reais.

## 1. Objetivo e resultado esperado

Registrar o ciclo compra original → pagamento → cancelamento/reembolso recebido → saldo CNY da conta HubBuy → novo pedido financiado integral/parcialmente com esse saldo → complemento PIX/cartão → inclusão de suas unidades em pacote existente.

A V1 deve preservar a origem do dinheiro, os direitos econômicos das pessoas, o custo histórico BRL e todos os pagamentos/taxas já suportados. A RAM não precisa ser marcada como “substituída” por cordas: o vínculo é o caminho financeiro dos créditos consumidos.

Critério final: com dados sintéticos, explicar e conciliar quem suportou cada custo, quanto entrou/saiu da conta, quais créditos financiaram o novo pedido, qual dinheiro novo foi necessário, quais taxas foram pagas e onde estão as unidades físicas. Nenhuma operação antiga muda quando a referência cambial muda.

## 2. Leitura, escopo e instruções ao executor

### 2.1 Leitura obrigatória e precedência

1. Ler `AGENTS.md`, os documentos canônicos 00–17 na ordem exigida e `PROMPT_ONE_SHOT.md`.
2. Ler integralmente os planos 20–24 e a investigação vinculada acima. Consultar planos 18/19 se tocar autenticação/grupo e plano 25 se tocar superfícies mobile compartilhadas.
3. Ler este handoff integralmente. Conferir schema/journal, símbolos e diffs antes de editar; as linhas da investigação são âncoras de uma base anterior.
4. Revalidar autorização mais recente e D1–D3. Este plano substitui as simplificações dos planos 21/23 **somente quando seu escopo de implementação for autorizado**, sem eliminar os invariantes do produto.

Não reiniciar a investigação inteira ou procurar novas referências visuais. Ajustes técnicos equivalentes são aceitáveis quando preservam contratos e ficam documentados. Mudança de propriedade do dinheiro ou escopo de pacote não é um ajuste técnico.

### 2.2 O que implementar na V1 recomendada

- Conta HubBuy identificada por FK, com uma carteira CNY por conta e várias contas possíveis por workspace.
- Ledger auditável e imutável, titularidade por participante, consumo FIFO elegível com vínculos persistidos.
- Reembolso existente com destino/moeda explícitos; somente recebido aumenta saldo.
- Custo histórico BRL carregado dos créditos e conversão capturada dos complementos externos.
- Componentes de pagamento: saldo, PIX, cartão. UI inicial: saldo + no máximo uma fonte externa, além de fonte única; schema comporta N.
- Pedido original de compatibilidade e pedidos adicionais no mesmo acompanhamento, com snapshots/cobranças próprios.
- Uso do saldo por beneficiários diferentes com adiantamento explícito, se D2 aprovar essa política.
- Reembolso parcial/total de compra mista, correções compensatórias e bloqueio de correção destrutiva com dependências.
- Inclusão no pacote existente do mesmo acompanhamento/conta enquanto o conteúdo estiver aberto; selo do conteúdo e revisão do rateio separados do pagamento externo.
- QC para item adicional por associação legítima, sem ampliar superfícies fotográficas.
- Migração versionada e fluxo de conciliação manual para os fatos RAM/Elixir já ocorridos.

### 2.3 Exclusões e limites

Sem API/scraping HubBuy, workers, queues, automação cambial, processamento real de pagamentos, estoque/revenda/lucro, doações implícitas, caixa coletivo implícito, transferências entre contas, saldo multimoeda ou contabilidade geral.

Não implementar parcelas de recebimento sobre o mesmo cancelamento, abatimento de item que continua enviável, refund pós-envio, restituição da taxa/Brasil/Receita ou custo de pacote vazio positivo. “Parcial” na V1 significa parte das unidades ou dinheiro menor que o principal das unidades canceladas; recebido zero continua permitido.

Não misturar pedidos já registrados em trackings distintos sem decisão D3 específica. Não copiar um item existente em outra compra para fingir que é pedido adicional.

Não criar infraestrutura, buckets/secrets, publicar, migrar produção ou inserir reembolsos reais como consequência da implementação local. O alvo continua Vercel + Turso/libSQL, com migrations explícitas e banco descartável nos testes.

### 2.4 Preservação do checkout

Na elaboração deste plano estavam modificados `next-env.d.ts`, `src/app/globals.css`, `src/components/packages/package-cost-detail-screen.tsx` e `src/components/packages/refunds-section.tsx`; a investigação era arquivo novo. Não sobrescrever, reverter, stagear ou atribuir essas alterações automaticamente à feature.

Rever `git status` na execução. Continuar fase a fase, registrar resultado dos gates e corrigir falhas antes de avançar. Não pedir nova autorização para rotina técnica já coberta pelo pedido de implementação; respeitar apenas pendências econômicas reais e limites operacionais explícitos.

## 3. Decisões pendentes e como prosseguir

| ID | Decisão de produto | Recomendação deste handoff | Gate afetado |
| --- | --- | --- | --- |
| D1 | Reembolso preserva direitos individuais ou vira caixa coletivo? | Direitos individuais proporcionais ao custo recuperado, conferidos na conciliação | Emissão/ativação de créditos com titularidade real e UX correspondente |
| D2 | Pode usar saldo de A para compra de B? Qual obrigação resulta e em qual moeda? | Adiantamento explícito a acertar em CNY; baixa manual registra valores reais; sem executar PIX | Uso entre titulares e devolução/acerto desse financiamento |
| D3 | Pacote deve aceitar pedido que já existe em outra compra do Loti? | V1 restrita a pedido adicional no mesmo acompanhamento; associação cruzada fica futura | Origem dos itens, conteúdo do pacote e fechamento compartilhado |

**Respostas do usuário em 17/10/2026:** D1 preserva direitos individuais proporcionais; a compra normalmente é consolidada em uma única conta HubBuy para o pedido do grupo. D2 permite financiamento com saldo de outra pessoa, registrado como adiantamento explícito em CNY e sem executar pagamento bancário. D3 restringe pacote/pedido adicional ao mesmo acompanhamento e conta.

**Tratamento:** as respostas acima resolvem os gates de titularidade, financiamento entre pessoas e origem dos pedidos. Prosseguir com essas políticas; não reinterpretar a conta HubBuy única como caixa coletivo, nem a baixa manual de um adiantamento como transferência bancária executada.

A ausência de resposta não aprova caixa coletivo, doação, dívida CNY ou associação cruzada. Também não exige parar toda a preparação local. D3, se ampliada, requer atualizar o plano físico/financeiro; não contornar removendo a validação de mesmo tracking.

Dados reais faltantes são inputs operacionais posteriores: conta, valores nativos originais/devolvidos, bases BRL, datas, titulares, pedido Elixir, usos intermediários, saldo atual e estado/encargos do pacote. Não inventá-los em fixtures ou migração.

## 4. Contrato financeiro executável

### 4.1 Invariantes

1. Todos os recursos pertencem ao workspace autorizado, direta ou indiretamente. `paid_by` é autor da confirmação, não pagador econômico.
2. CNY em ¥0,01, BRL em centavos, percentuais em bps. `BigInt` nos intermediários; JSON somente com inteiros seguros e limites explícitos.
3. Saldo físico pertence à conta HubBuy; direitos pertencem aos participantes/lotes. Não somar contas para autorizar gasto.
4. Solicitação cancela unidades elegíveis e pode aparecer A receber; só recebimento confirmado no destino HubBuy cria entrada CNY.
5. Compra/favorito/participantes finalizados nunca são editados para inserir pedido ou reembolso.
6. Pedido adicional não altera base, taxa, pagamento nem refund do pedido original.
7. Custo do saldo consumido = base histórica BRL dos lotes utilizados. Referência cambial atual nunca recalcula operação confirmada.
8. Taxa do componente saldo é obrigatoriamente zero, inclusive no banco. Taxa externa incide somente sobre principal externo correspondente, sem taxa sobre taxa/Receita.
9. Soma das fontes CNY = principal CNY do pedido. Soma das alocações = cada fonte. Somas por item, produto/China e beneficiário fecham.
10. Créditos/consumos/parcelas/financiamentos confirmados não são apagados nem redistribuídos retroativamente.
11. Consumo não excede conta, lote ou titular; confirmação ocorre em transação de escrita com revisão da conta e do tracking.
12. Idempotência persistida identifica a operação; repetir a mesma chave/payload retorna o mesmo resultado financeiro, outra carga conflita.
13. Refund não supera principal remanescente das unidades elegíveis por componente/fonte. Não devolver taxa antiga por inferência.
14. Correção usa compensação vinculada e motivo. Crédito consumido não pode ser reduzido por uma edição comum.
15. Adiantamento entre pessoas é distinto do custo e do saldo físico; sua baixa por PIX não cria CNY na HubBuy.
16. Pacote aceita acréscimo somente em preparação, não selado, no mesmo tracking e conta verificada. Envio sela conteúdo.
17. Reabertura de custos não reabre manifesto. Revisão de rateio não apaga pagamento externo já ocorrido.
18. Conta/refund antigo não gera saldo automático. Histórico incompleto exige conciliação e permanece identificado como tal.

### 4.2 Fórmulas e dados capturados

```text
saldo_cny = soma(créditos_cny) - soma(débitos_cny)
custo_novo_brl = base_histórica_saldo_consumido + principal_externo_brl + taxas_externas_brl
dinheiro_novo_brl = principal_externo_brl + taxas_externas_brl
taxa_externa_brl = arredondar_metade_para_cima(principal_externo_brl × bps / 10.000)
taxa_saldo = 0
quantidade_enviável = quantidade_comprada - cancelamentos_requested/received_não_anulados
```

Capturar moeda efetiva, principal, CNY financiados, taxa, percentual, data, origem e par inteiro de conversão. `R$150 ↔ ¥200` descreve conversão efetiva; a base `R$210` carregada de `¥300` de saldo não é uma nova cotação de mercado.

Valores CNY novos e bases históricas são **totais exatos da linha/componente**, sem arredondar unitário BRL e multiplicar quantidade. O último consumo de um lote absorve seu resto de centavos. O máximo de uma correção/compensação considera o já compensado.

### 4.3 Alocação determinística

- Preservar os helpers atuais de maior resto/ordem estável para o legado.
- Novo cálculo: formar capacidades CNY por item, produto/China e beneficiário; reservar direcionamentos explícitos e saldo próprio elegível antes de distribuir complemento externo.
- Construir uma matriz limitada pelas capacidades remanescentes. Fechar primeiro os totais nativos; distribuir a base BRL e taxa de cada fonte sobre suas alocações, com desempate persistido.
- Para o default da V1 com saldo + uma fonte externa, o complemento preenche exatamente o remanescente após o saldo. Não arredondar as duas fontes independentemente contra a mesma base integral.
- Recusar composição inviável; não usar crédito de outro titular para consertar arredondamento. Guardar a matriz confirmada e os consumos exatos.
- Refund incremental usa capacidade remanescente por fonte/pessoa e não recalcula parcelas emitidas anteriormente. O adaptador legado mantém seu resultado agregado original.

### 4.4 Estados e imutabilidade

| Entidade | Estados/comportamento |
| --- | --- |
| Compra | `active/finalized` existentes; sem reabertura |
| Tracking | `open/closed` existentes; reabertura com motivo |
| Conta | `active/archived` para criação nova em saldo conhecido ¥0; `reconciling` fica reservado a contas legadas com saldo/histórico desconhecido, que exigem conciliação |
| Pedido adicional | `draft/recorded/voided`; draft não gasta nem gera unidade alocável; registrado com pagamento real exige refund/compensação para correção |
| Cobrança | Preview/pendente versus confirmação financeira imutável; método singular continua apenas no legado |
| Refund | `requested/received/voided` existentes; recebido é projeção corrente com eventos/ledger imutáveis |
| Conteúdo do pacote | Aberto/selado independente de preparing/sent/received; correção logística não remove selo |
| Adiantamento | Posição derivada de concessão, baixa, abatimento por refund e reversão; nunca saldo físico negativo |

Recebido zero gera evento, sem lançamento monetário zero. Ajuste manual é operação motivada com origem/base/titularidade, não edição do campo saldo. Divergência de conciliação bloqueia novo uso e não é resolvida por ajuste automático.

## 5. Mapa de implementação e schema

### 5.1 Arquivos existentes

| Caminho/símbolo | Uso obrigatório |
| --- | --- |
| `src/lib/db/schema.ts`, `drizzle/`, `drizzle/meta/_journal.json` | Constraints, novas relações, reconstruções pontuais e migrações versionadas |
| `src/lib/domain/purchase-cost-initialization.ts` / `initializePurchaseCosts()` | Criar pedido original e cobrança compatível na finalização/início idempotente |
| `src/lib/domain/purchase-services.ts` / `finalizePurchase()` | Preservar transação atômica e snapshots |
| `src/lib/domain/package-cost-services.ts` / `mutate()` | Reutilizar membership, status/revisão, CAS/rollback e autoria; extrair executor sem duplicar regras |
| Mesmo serviço / `saveItemCosts()`, `saveCharge()`, `markChargePaid()` | Guardar pagamentos confirmados; isolar trava por pedido; métodos/componentes por versão |
| Mesmo serviço / `requestRefund()`, `receiveRefund()`, `correctRefundReceipt()`, `voidRefund()` | Destino/moeda, crédito único, teto, fonte histórica e dependências |
| Mesmo serviço / `saveAllocations()`, `savePackage()`, `closeTracking()`, `reopenTracking()` | Admissão/selo, revisão de rateio, todos os pedidos e cobertura de enviáveis |
| `src/lib/domain/package-cost-calculations.ts` / `calculateCostTracking()` | Adaptador legado, fonte de quantidade, agrupamento por pedido e custos novos |
| `src/lib/domain/package-cost-reading.ts` / `readCostTracking()`, `listCostTrackings()` | Origem exclusiva dos itens, `productOrders[]`, saldo/financiamento e resumos conciliados |
| `src/lib/domain/package-refund-calculations.ts`, `money.ts`, `cost-sharing.ts` | Preservar helpers legados; acrescentar cálculos puros nativos/capacidades |
| `src/lib/domain/authorization.ts`, `transaction-lock.ts` | Reutilizar autorização e fila local; fila não é lock distribuído |
| `src/app/api/packages/[trackingId]/route.ts`, `packages/route.ts` | Comandos do acompanhamento e início idempotente |
| `src/lib/domain/package-cost-http.ts`, `package-cost-client.ts` | Erros tipados, origem/no-store, parsers e DTOs |
| `src/components/packages/package-cost-detail-screen.tsx` | Produtos/pagamentos, novo pedido, pacote e divisão por pessoa |
| `src/components/packages/refunds-section.tsx` | Recebimento/destino, prévia e correções sem duplicação |
| `src/lib/domain/package-cost-presentation.ts`, `src/components/packages/packages-screen.tsx` | Próxima ação, pendências e resumos |
| `src/components/group-screen.tsx` | Cadastro mínimo de contas; preservar convites/taxas |
| `src/components/purchase/history-screen.tsx`, `purchase-screen.tsx` | Anexo/link de pedidos posteriores sem reescrever total original |
| `src/lib/domain/qc-services.ts` / `getTargets()`, autorização, galeria e apresentações | Resolver item adicional sem fabricar `purchase_item` |
| `src/lib/domain/qc-matching.ts`, `qc-validation.ts`, `qc-http.ts` e rotas QC | Manter matching conservador/limites e acrescentar contexto de alvo |
| `src/components/qc/`, `src/app/globals.css`, `ui/surface.tsx` | Reutilizar galeria/drawers, foco e tokens; preservar trabalho local |
| `scripts/migrate.ts`, `scripts/verify-database.ts` | Migração explícita local e verificação de tabelas/FKs |

**Constatações que não podem ser esquecidas:** o índice atual só permite uma cobrança products por tracking; bases ficam globalmente protegidas enquanto há refund; alocações são de um tracking; `saveAllocations()` hoje não bloqueia conteúdo enviado; QC só lê `purchase_items`; `formatMoney()` só formata BRL. Esses contratos precisam de transição explícita.

### 5.2 Novos módulos sugeridos

Nomes ajustáveis: `financial-operations.ts`, `hubbuy-balance-{services,reading,calculations}.ts`, `purchase-payment-{services,calculations}.ts`, `purchase-cost-order-services.ts`, `member-balance-financing.ts` e `financial-money.ts` em `src/lib/domain/`.

Manter Drizzle direto nos serviços, como no código atual. Não introduzir repository genérico, framework de workflow ou catálogo global de moedas. Extrair somente responsabilidades necessárias; não ampliar indiscriminadamente `package-cost-services.ts`.

### 5.3 Persistência proposta

Criar dez relações centrais: `hubbuy_accounts`, `financial_operations`, `hubbuy_balance_entries`, `hubbuy_balance_credit_shares`, `hubbuy_balance_consumptions`, `purchase_cost_orders`, `purchase_additional_order_items`, `purchase_payment_components`, `purchase_payment_allocations`, `purchase_refund_payment_allocations`. Adicionar `member_balance_financing_entries` se D2 confirmar adiantamento.

Campos/relações detalhados estão na seção 4 da investigação. Implementar também estes contratos explícitos:

- Conta: moeda CNY fixa, estado de conciliação e revisão. `balance_minor` é cache verificável contra ledger, não fonte independente.
- Operação: unicidade workspace/idempotency, hash de comando normalizado sem valores flutuantes, autor/data de registro, data de ocorrência separada e motivo quando compensação/ajuste.
- Ledger: sequência única por conta; origem tipada recebimento/pagamento/ajuste; compensação limitada ao original; nenhum lançamento confirmado pode ser apagado/alterado.
- Crédito: parcelas fecham CNY/base BRL e registram ordem; disponível deriva de consumos/compensações. Base desconhecida impede consumo na V1.
- Custos: `order_id` e origem exclusiva `purchase_item_id XOR additional_order_item_id`; novos valores nativos totais e versão de cálculo.
- Cobranças: produtos por pedido; Brasil/Receita por pacote, como hoje; fonte singular legada não é autoridade do misto.
- Refund: destino/conta/moeda/nativos originais e recebidos; BRL antigo preserva reversão histórica, nunca vira CNY.
- Pacote: conta verificada, selo e versões de conteúdo/distribuição/conferência. Eventos antes/depois referenciam pagamentos imutáveis.
- QC: alvo original/adicional exclusivo quando associado; itens com IDs externos iguais em contas/contextos diferentes não são fundidos.

Não criar tabelas separadas de taxa, câmbio global, wallet por pessoa ou segundo agregado Refund. É permitido agrupar migrações por incremento compilável; não criar FK para tabela ainda inexistente nem prometer migration somente com ADD COLUMN.

### 5.4 APIs e leituras propostas

Reutilizar operações existentes onde possível. Nomes de comandos novos podem ser ajustados mantendo semântica:

| Endpoint/contexto | Operações |
| --- | --- |
| `/api/hubbuy/accounts` | Listar/cadastrar/arquivar contas; membership e origem confiável |
| `/api/hubbuy/accounts/[accountId]/balance` | Ler saldo/participações e extrato paginado; conciliação e ajustes estritos com motivo |
| `/api/packages/[trackingId]` | `order.create/updateDraft`, `order.recordPayment`, `payment.correct`, `refund.*`, `package.allocations`, `package.seal/unseal`, conferência de rateio e fechamento |
| Contexto financeiro da conta/pedido | Registrar baixa de adiantamento autorizado por D2; somente registro manual, sem pagamento bancário |
| Rotas QC existentes ou contexto dedicado de pedido | Preparar/associar/ler item adicional, reaproveitando serviços privados |

Toda confirmação recebe chave idempotente; mutações do tracking recebem revisão esperada, e consumo também verifica versão/saldo da conta. UI não fornece titularidade ou parcelas calculadas como verdade: servidor revalida tudo.

Leitura nova: `productOrders[]`, componentes/alocações, custo histórico, dinheiro novo, saldo utilizado e posições de adiantamento. `productsCharge` singular pode existir como adaptador do original, mas não entra duas vezes em nenhum total. Não carregar extrato/QC inteiro em `workspace-provider`.

## 6. Fases de implementação e gates

### Fase 0 — baseline, decisões e contrato de transição

**Entrega:** base conhecida, D1–D3 identificadas e contrato de evolução coerente. Complexidade média.

Tarefas:

1. Fazer as leituras da seção 2, registrar HEAD/status, journal efetivo e alterações alheias. Revalidar os símbolos da seção 5.
2. Executar baseline de typecheck/lint/Vitest/build em ambiente apropriado; registrar falhas anteriores separadamente. Não reutilizar números desta investigação como resultado da nova implementação.
3. Resolver D1–D3 conforme seção 3. Definir os defaults técnicos restantes sem perguntar novamente por nomes, bibliotecas, FIFO ou precisão.
4. Fixar tipos, versões `legacy_single/components_v1`, origem dos itens, snapshot pago, comandos idempotentes e ponte de refund legado. Definir quais operações antigas continuam permitidas em cada versão.
5. Atualizar pontualmente contratos canônicos/prompt e planos 21/23 para reconhecer a extensão autorizada. Não declarar que o módulo já foi entregue nem remover exclusões não supersedidas.
6. Preparar fixtures sintéticas da seção 8 e plano de migração em banco isolado. Não usar nomes/valores reais como backfill.

**Gate G0:** custo, tesouraria, titularidade e financiamento distintos; transição sem dúvida de fonte da verdade; baseline e decisões registradas. Fundação neutra pode avançar com decisões pendentes, mas o gate dependente permanece aberto.

### Fase 1 — aritmética monetária, capacidades e prévias puras

**Depende:** contrato técnico de G0. **Entrega:** cálculos testáveis sem banco/UI nova. Complexidade alta.

Tarefas:

1. Criar representação nativa CNY/BRL com parsing estrito, formatação, limites e razão inteira de conversão. Reutilizar parsers quando equivalentes sem mudar a semântica BRL antiga.
2. Implementar cálculo de taxa por fonte externa e zero obrigatório do saldo; separar principal/taxa/total/dinheiro novo/base histórica.
3. Implementar alocação limitada por componente/item/beneficiário, ordem estável, divisão de base histórica de lote e resto no último consumo.
4. Implementar preview FIFO somente entre lotes/titulares elegíveis; não debitar nem persistir ainda.
5. Implementar cálculo puro de refund por capacidades restantes de fonte/unidades e reversão de base histórica; valor nativo e BRL não dependem da referência atual.
6. Manter testes legados de taxa, parcelas fixas capturadas, zero/null/no_charge e créditos agregados exatamente como antes.

Arquivos: novos módulos monetários/calculadoras; `package-cost-calculations.ts` apenas onde necessário para adaptar entradas. Não mover telas/refatorar CSS nesta fase.

Testes: entradas inválidas, overflow, taxas 1%/5%, saldo integral/misto, matriz fechando por todos os eixos, múltiplos lotes/bases, último centavo, múltiplas pessoas e taxa só em item externamente financiado.

**Gate G1:** fixtures exatas e invariantes passam; nenhuma operação usa float monetário ou cotação global; não há mudança nos resultados legados.

### Fase 2 — contas, operações imutáveis e infraestrutura do ledger

**Depende:** G1; D1 para ativar titularidade real. **Entrega:** persistência/serviços de crédito e leitura auditável, sem consumo público. Complexidade alta.

Tarefas:

1. Criar migração incremental de contas, operações, entradas e parcelas. Adiar tabelas que dependem de pagamentos até haver suas referências ou gerar migração coerente única, com código compatível.
2. Implementar helpers transacionais para operar na mesma conexão `tx`. Não abrir transação dentro de outra usando `db` externo.
3. Implementar idempotência: normalizar comando, reservar/validar chave dentro da transação e devolver operação confirmada em retry. Para retry, verificar identidade/workspace e hash antes de rejeitar revisão antiga do mesmo comando já concluído.
4. Garantir imutabilidade de lançamentos confirmados por serviço e proteção de banco apropriada. FKs/constraints/índices, sem cascade destrutiva; somas/cadeias cruzadas verificadas no serviço.
5. Implementar leitura paginada de extrato, saldo total/pessoal, conta arquivada e verificação entre projeção e ledger. Sem carregamento global.
6. Implementar estados de conciliação, cadastro mínimo/arquivamento e ajuste manual motivado. Entrada de ajuste não é substituto de crédito de refund; preservar origem/qualidade da evidência.
7. Atualizar `verify-database.ts` e testar migration vazia, upgrade desde journal anterior real e repetição. Confirmar FKs habilitadas.

Testes: membership/IDs cruzados, chave repetida, hash diferente, crédito/evento/projeção atômicos, proibição de UPDATE/DELETE, parcelas fechando e reconciliação divergente bloqueando uso.

**Gate G2:** não existe crédito sem origem/autoria/titularidade válida; correção não apaga histórico; migrar não cria saldo de refunds antigos. Se D1 está pendente, somente testes/fundação e leituras neutras, sem ativação de política real.

### Fase 3 — pedidos, adaptador legado e snapshot de pagamentos

**Depende:** G1/G2 e fronteira de D3. **Entrega:** pedido original de compatibilidade, dupla origem dos itens e confirmação de fonte única preservada. Complexidade alta.

Tarefas:

1. Criar `purchase_cost_orders`, snapshots adicionais e estrutura de componentes/alocações. Migrar referências de custos/cobranças com exclusividade de origem e unicidade por pedido.
2. Backfill somente pedido original/referências técnicas; não duplicar `purchase_items`, alterar datas/participantes ou criar conta por email inferido.
3. Adaptar `initializePurchaseCosts()` para inicialização atômica/idempotente do original, mantendo um tracking por compra e pacote inicial. Próxima compra ativa continua permitida após finalização.
4. Preservar cálculo BRL antigo pela versão legada; introduzir cálculo por pedidos para novos dados. Manter ordem financeira estável e totais originais do Histórico.
5. Congelar em operação/snapshot os valores de cobranças antigas pagas quando forem incorporadas ao novo domínio. Origem `legacy_recorded`: valor conhecido do app, financiador/CNY desconhecidos, sem afirmar comprovação bancária.
6. Para novas confirmações de produtos/frete/Receita, preservar base/taxa/total/autor/data em registro imutável. Draft permite edição; corrigir pago exige diferença/compensação auditada.
7. Guardar todos os caminhos antigos: `saveItemCosts()`, `saveCharge()`, `markChargePaid()`, reset genérico do cliente e edição de composição não podem alterar fontes/pagamentos confirmados em `components_v1`.
8. Isolar a trava do refund antigo ao pedido original. Novo pedido não participa de sua base/taxa, sem simplesmente remover as proteções originais.
9. Migrar leitura/DTOs e consumidores singulares para `productOrders[]`, com adaptador transitório explícito. Fechamento considera todos os pedidos efetivamente registrados, sem contar draft como unidade comprada.

Cobranças pendentes permanecem pendentes; não registrar pagamento porque existe método. Original com unidades inicialmente alocadas e pagamento pendente continua compatível com o fluxo atual; novas regras de admissão aplicam-se aos itens adicionais, sem invalidar silenciosamente dados antigos.

Testes: upgrade com tracking aberto/fechado, original pago/refund ativo, valores pendentes, fontes únicas idênticas, mesmo item contado uma vez, falha na inicialização faz rollback da finalização e tentativa por API antiga de modificar novo pagamento é rejeitada.

**Gate G3:** consulta de históricos/fechados intacta, fonte única compatível e nenhum caminho antigo pode apagar dinheiro novo. Estrutura adicional existe sem gerar snapshots falsos na compra finalizada.

### Fase 4 — reembolso com destino HubBuy e crédito em CNY

**Depende:** G2/G3, D1. **Entrega:** solicitar/receber/consultar saldo gerado pelo refund sem mexer no pagamento original. Complexidade média a alta.

Tarefas:

1. Estender inputs estritos de refund com moeda/destino/conta e valores nativos, mantendo seleção explícita de unidades/retiradas e tetos por produto/China.
2. Capturar bases históricas/nativas conhecidas. Para legado sem CNY, exigir confirmação documentada da equivalência/teto nativo ou manter conciliação pendente; nunca converter por referência atual.
3. No recebimento HubBuy: evento + projeção refund + crédito/parcelas + alocações de reversão histórica + revisões na mesma transação. Recebimento fora de HubBuy não emite crédito CNY.
4. Acrescentar tabela de alocações de refund/evento e unicidade que impeça monetizar o mesmo recebimento duas vezes.
5. Implementar ponte explícita para refund já recebido: registrar destino/CNY/carteira sem subtrair seu BRL histórico outra vez. Uma ligação já feita retorna o mesmo efeito ou conflita; não recebe de novo pela operação antiga.
6. Correção/anulação de crédito intacto usa compensação e registro correto atômicos. Preservar limites de compensação, eventos e liberação de unidades conforme o significado real do comando.
7. Adaptar formulário/resumo de refund e primeira leitura de saldo. Registrar solicitado/A receber não aumenta carteira. Recebido zero não emite entry de quantia zero.

Testes: integral/parcial/zero, destino bancário, preservação de paidAt/paidBy/taxa, vários refunds por item, ponte legada idempotente, saldo negativo proibido, rollback após crédito/auditoria e solicitado recebido uma única vez.

**Gate G4:** ciclo de crédito auditável em CNY, histórico BRL preservado, taxas antigas idênticas e nada inferido automaticamente de dados legados.

### Fase 5 — pedido adicional e pagamento externo de fonte única

**Depende:** G3/G4; D3 deve manter ou redefinir a fronteira prevista. **Entrega:** registrar novo pedido sem editar compra finalizada. Complexidade média a alta.

Tarefas:

1. Criar/editar draft de pedido no acompanhamento aberto, manual ou a partir de favorito, com conta, itens, quantidade, variante/categoria e participantes próprios.
2. Custos nativos de produto/China usam totais exatos; campos conhecidos/sem cobrança/pendentes mantêm semântica. Um item compartilhado continua uma linha física.
3. Registrar pagamento de fonte externa única com principal/taxa/BRL/CNY/conversão capturados e alocações do G1. Só confirmação completa gera estado registrado/unidades alocáveis.
4. Não criar `Purchase` adicional nem alterar rodada antiga. Detectar referência de pedido já registrada no Loti e não permitir cópia para contornar D3.
5. Exibir os pedidos no detalhe, totais/dinheiro novo e anexo/link no Histórico. Travas e encerramento incluem cada pedido.
6. Não oferecer saldo utilizável nesta fase até consumo e refund misto estarem seguros. Novo produto ainda pode ficar sem pacote, com pendência explícita.

Testes: novo beneficiário, fonte única PIX/cartão, draft excluído dos totais confirmados, confirmação idempotente, snapshot imutável, favorito editado depois, original com refund protegido e pedido adicional independente.

**Gate G5:** novo pedido existe uma só vez e tem sua cobrança; pagar esse pedido não altera um centavo do original.

### Fase 6 — consumo FIFO, pagamento misto e financiamento entre pessoas

**Depende:** G1–G5; D2 para uso alheio. **Entrega:** fontes saldo integral/saldo + PIX/cartão com consumo seguro. Complexidade alta.

Tarefas:

1. Criar consumos por parcela/lote e aplicar FIFO somente a crédito elegível na mesma conta, com sequência persistida e base histórica suficiente.
2. Mostrar prévia de saldo próprio, complemento e dinheiro novo. Fonte saldo tem bps/taxa zero; fonte externa usa percentual capturado, base somente externa e taxa calculada uma vez.
3. Confirmar em uma transação: operação idempotente, validações, componentes, alocações, débito, consumos, financiamento econômico, projeções/revisões e snapshot pago.
4. A revisão do tracking não basta: revalidar saldo/revisão da conta e capacidades pessoais/lotes dentro da mesma transação de escrita, com CAS/resultado de atualização verificado.
5. Retry limitado apenas para erro transitório reconhecido. Resultado de commit incerto consulta a operação por chave; não repetir débito com chave nova.
6. Se D2 aprovada, adicionar ledger mínimo de adiantamentos e baixa manual. Financiador distinto do beneficiário requer prévia/confirmação explícita; saldo próprio não cria dívida.
7. Baixa manual em moeda real registra quantos CNY da obrigação foram quitados e o BRL efetivo quando aplicável. Não cria entrada na HubBuy nem recalcula custo do produto.
8. Rejeitar redução/anulação de crédito com consumos ativos; não construir desfazimento automático de compras reais.

Não exigir nova aprovação de pagamento bancário: o app registra o que ocorreu. Isso não elimina a confirmação de atribuição econômica exigida pelo produto.

Testes: saldo integral, saldo + PIX, saldo + cartão, capacidades pessoais, lotes com bases diferentes, última fração, dois trackings disputando conta, titular errado, conta arquivada/em conciliação, payload/revisão stale e falha após cada escrita.

**Gate G6:** conta/lotes/direitos nunca negativos; prova de corrida multiprocesso entre trackings; dinheiro novo exclui saldo; taxa zero do saldo em todas as camadas. Uso alheio não fica disponível se D2 não foi resolvida. Mesmo com G6, não ativar o novo regime para uso real sem G7.

### Fase 7 — refund de compra mista, adiantamento e compensações

**Depende:** G6. **Entrega:** fechar o ciclo financeiro dos novos pedidos. Complexidade alta.

Tarefas:

1. Derivar máximo refundável das unidades/componentes e alocações de pagamento confirmadas, descontando devoluções anteriores. Não usar método singular/valor atual da conta.
2. Default parcial: proporção das fontes originalmente aplicadas ao componente; permitir direcionamento comprovado dentro da capacidade de cada fonte, com evidência descritiva/motivo.
3. Reverter BRL histórico das frações devolvidas, mantendo taxa original. Se recebido como saldo, emitir novo crédito com nova sequência e genealogia até o pagamento/refund.
4. Conservar origem de financiamento: uso próprio restaura direito próprio. Em adiantamento aberto, refund pode abater a posição e devolver parcela ao financiador na mesma operação com prévia explícita.
5. Se adiantamento já foi quitado, não devolver novamente ao financiador. Distribuir recuperação conforme quem suporta a parcela após acertos; validar abatimento máximo por origem.
6. Registrar correções antes/depois e compensações limitadas. Proibir ciclos/compensação duplicada e anulação simplista de crédito já gasto.
7. Se a plataforma retirou saldo real já consumido, manter incidente/pendência de conciliação e bloquear novos gastos, sem criar dinheiro fictício nem implementar passivo genérico fora de escopo.
8. Garantir que crédito novo não modifica FIFO/valoração de consumos anteriores. Centavos pessoais já lançados não são redistribuídos.

Testes: parcial/total misto, refund de saldo integral, taxa preservada, vários refunds/unidades, bases CNY/BRL distintas, adiantamento aberto/parcialmente quitado/quitado, zero recebido e correção × consumo/recebimento concorrentes.

**Gate G7:** RAM → crédito → novo pedido → novo refund concilia fontes, custos e direitos sem taxa duplicada, saldo artificial ou restituição duplicada ao financiador.

### Fase 8 — inclusão no pacote, selo e rateio de encargos pagos

**Depende:** G5/G7 e D3. **Entrega:** novo pedido entra no mesmo pacote legitimamente. Complexidade média a alta.

Tarefas:

1. Reutilizar `purchase_package_items` para itens adicionais; resolver quantidade por origem exclusiva, sem criar pacote/item duplicado.
2. No comando de admissão, exigir pedido adicional registrado/pago, unidades enviáveis disponíveis, mesmo tracking/conta, pacote em preparação e não selado.
3. Introduzir selo de conteúdo. Enviar sela atomicamente; corrigir status não remove selo. Desfazer selo pré-envio exige motivo/revisão e nova conferência.
4. Para pacotes legados já enviados/recebidos, migrar estado protegido com origem de migração e data de registro, sem inventar timestamp real de fechamento. Preservar logística/conteúdo existentes.
5. Adaptar `saveAllocations()` por operações/contexto para que payload de substituição total não remova itens ocultos/novos nem desfaça conteúdo selado. Preservar alocações de pacotes não afetados.
6. Calcular Brasil/Receita por unidades como antes, com nova versão de distribuição e eventuais centavos na ordem persistida.
7. Preservar fato pago e snapshot de encargos; mudança só de divisão pede reconferência do rateio, não retorna pagamento a pendente. Mudança real de total gera complemento/compensação auditada.
8. Atualizar `requestRefund()` para respeitar selo/unidades elegíveis e aplicar a mesma política de distribuição paga. Não deixar um caminho antigo limpar paidAt/paidBy para encargo já incorporado ao ledger.
9. Revalidar `closeTracking()`/reabertura: unidades enviáveis de todos os pedidos registrados; nenhum draft contado; selo independente; adiantamento fora da obrigação externa não vira bloqueio artificial de custo.

Pacote em preparação com conteúdo selado só muda por correção pré-envio explícita. Não ampliar refund pós-envio. Pacote vazio com custo positivo continua bloqueio explicado, sem zerar custo real.

Testes: item comprado depois, mesmo pacote/ID, unidades divididas em dois pacotes, item compartilhado contado uma vez, frete pago redistribuído sem novo pagamento, inclusão × envio/selo, refund × conteúdo, IDs cruzados e pacote enviado rejeitado.

**Gate G8:** pacote anterior recebe novo pedido sem duplicação; pagamento de produtos continua intacto; rateio de encargo explica revisão sem apagar o pagamento; fechado/selado rejeita bypass por request direto.

### Fase 9 — QC adicional, UX completa e conciliação local

**Depende:** G4–G8. **Entrega:** fluxo legível e revisável ponta a ponta. Complexidade média a alta.

Tarefas:

1. Estender alvos QC a item adicional com origem explícita. Revalidar autorização de compra/tracking/pedido, ocorrência, imagem e apresentação em cada rota, inclusive preview/fallback/capa/exclusão.
2. Manter matching conservador, múltiplas ocorrências por item, identidades por contexto/conta, quotas, tombstones e R2 privado. Nenhuma operação QC altera financeiro; nenhuma movimentação de pacote move objetos.
3. Reutilizar galeria/visualizador. Não criar novos thumbnails, slots ou superfícies de fase 3 por consequência deste plano; observar a autorização visual efetiva mais recente e não ampliá-la.
4. Completar resumo de saldo/conta e histórico paginado, formulário misto, recebimento/destino, pedidos separados, dinheiro novo e detalhes pessoais/adiantamento.
5. Preservar seções progressivas, estado de expansão, drafts, foco, erros tipados e contexto do pacote. Não usar texto “Confirme” como detector genérico de compensação monetária.
6. Adicionar conciliação manual em conta `reconciling`: mapear recebimentos legados e registrar usos posteriores sintéticos com data real informada/data de registro. Comparar saldo e direitos antes de ativar a conta.
7. Não permitir dupla abertura: escolher reconstrução cronológica ou abertura somente do remanescente, com eventos anteriores marcados como abrangidos. Conferir que ponte legada não reduz custo duas vezes.
8. Capturar telas/fluxos em 320/390/768/1024/1440 px; testar teclado/foco/reduced motion, erros de saldo, conflito e campos monetários claros.

Componentes sugeridos: resumo/extrato de saldo, editor de pedido, composição de pagamento, detalhe de origem e posições econômicas. Reutilizar `Surface`, `Confirm`, tokens e marcadores, sem nova navegação principal/dashboard.

**Gate G9:** usuário entende CNY, base BRL, referência opcional, dinheiro novo e origem sem abrir uma tela contábil; QC funciona no adicional com autorização idêntica; conciliação sintética evita saldo duplicado.

### Fase 10 — validação integrada, revisão e handoff operacional

**Depende:** G0–G9 e decisões necessárias resolvidas. **Entrega:** implementação local pronta para revisão/publicação posteriormente autorizada. Complexidade alta em validação.

Tarefas:

1. Executar lint/typecheck/suíte Vitest/build e Playwright pertinente. Repetir migration vazia/upgrade/reaplicação após última mudança de schema; verificar FKs/índices/constraints e comparação dos campos antigos.
2. Executar corridas com processos/conexões independentes, sem a fila local mascarar disputa; banco arquivo descartável explícito. Cobrir dois trackings usando a mesma conta.
3. Revisar todos os mutadores antigos, raw APIs e caminhos de correção/void para provar que não contornam imutabilidade, selo ou revisão da conta.
4. Revisão técnica específica de dinheiro/razões/alocações/dependências e revisão de migração/rollback. Corrigir achados antes da entrega; não limitar validação a screenshots ou teste feliz.
5. Atualizar `docs/IMPLEMENTATION_REPORT.md`, este plano e contratos canônicos com status real, decisões finais, migrations geradas, testes executados/ignorados/falhos e limites conhecidos.
6. Entregar checklist de reconciliação real RAM/Elixir, backup, ordem de migração/deploy, incompatibilidade com escritores antigos e recuperação. Não executar produção nesta fase.
7. Confirmar que o histórico das compras finalizadas, taxa antiga e destinos visuais não foram reescritos. Relatar dados reais ainda faltantes separadamente de pendências técnicas.

**Gate G10:** matriz da seção 8 aprovada, nenhum blocker financeiro conhecido omitido, evidências locais completas e implantação/reconciliação pendentes claramente separadas. Não declarar integração remota ou saldo real validado com base em fixtures.

### Dependências e ativação

```text
G0 → G1 → G2 → G3 → G4 → G5 → G6 → G7 → G8 → G9 → G10
```

D1 condiciona emissão com titularidade na fase 4; D2 condiciona uso alheio e seu refund nas fases 6/7; D3 define a fronteira de pedidos/pacotes antes das fases 3/5/8. Consultar a tabela da seção 3 em vez de supor aprovação por ter concluído uma fase técnica.

A sequência é por segurança e compatibilidade, não promessa de prazo. É possível preparar cálculos/testes neutros enquanto decisões são respondidas. Não disponibilizar consumo real no meio da sequência apenas porque o cenário feliz de pagamento funciona: G7/G8 asseguram o ciclo de correção/refund e a consequência física.

## 7. Migração, compatibilidade e conciliação

### 7.1 Migrações por incremento

Durante a preparação do plano, o journal analisado terminava em `0007_young_zodiak`; por isso `0008` foi conferida antes da criação. A implementação local gerou migrations aditivas `0008`–`0017`; não edite migration que já tenha sido aplicada a um alvo.

| Momento | Alteração esperada | Dados que não podem ser inventados |
| --- | --- | --- |
| Fase 2 | Contas, operações e créditos/parcelas; FK/índices/verificação | Contas reais, saldo inicial, titularidade e créditos de refunds antigos |
| Fase 3 | Pedidos, segunda origem de custos, cobranças por pedido, componentes/alocações e versões | CNY do pagamento legado, cotação, pagador real e nova data de pagamento |
| Fase 4 | Moeda/destino nativo e alocações/eventos de refund | Destino assumido, saldo ainda disponível e segunda redução de custo |
| Fase 6 | Consumos, capacidades e posições de financiamento | Consumo anterior inferido de produto/nome ou dívida entre pessoas sem confirmação |
| Fase 8 | Conta/selo/versão do pacote e snapshot dos pagamentos afetados | Data real antiga de manifesto e nova quitação de encargo já pago |
| Fase 9 | Alvos QC adicionais e associações compatíveis | Compra/item original falso ou nova autorização de exposição de fotos |

Agrupar etapas adjacentes é permitido se constraints/referências exigirem, mantendo migração verificável e código intermediário compilável. Reconstrução SQLite de tabela é aceitável quando necessária para origem exclusiva/índices; conservar todos os IDs/valores anteriores e executar `foreign_key_check` e comparações.

### 7.2 Fonte única legada

- Toda compra existente mantém seus snapshots, participantes, quantidade, preços originais e status.
- Cada tracking recebe um pedido original de compatibilidade; itens/cobrança apontam para ele, sem copiar o produto físico.
- Cobrança paga incorporada ao novo regime recebe snapshot/componentes legados com BRL conhecido do app, CNY/conversão/financiador desconhecidos e autoria original preservada.
- Cobrança pendente continua editável no caminho correspondente até confirmação explícita. Não transformar existência de método em pagamento ocorrido.
- Manter resultados anteriores exatamente por versão de cálculo. Adicionar nova operação não reconstrói centavos dos refunds antigos com algoritmo novo.
- Adoção do regime confirmado é unidirecional para aquela obrigação: endpoints legados não podem voltar a editar valores pagos e limpar autores/datas.
- Reflexos econômicos novos vão para novos registros/operações; não converter valores atuais de `*_cents` em CNY nem reinterpretar `person_id`/`paid_by`.
- Após primeiros lançamentos novos, escritores antigos não são seguros, mesmo que novas tabelas sejam aditivas. Planejar corte coordenado de escrita.

### 7.3 Conciliação de refund antigo recebido

Criar comando explícito e idempotente de associação financeira, separado de `refund.receive` comum. Validar membership, estado real do refund, ausência de ponte anterior, conta e valores conferidos. Emitir crédito/parcelas com origem no evento antigo e operação de associação; manter o abatimento BRL já existente exatamente uma vez.

Se já houve consumo desse dinheiro fora do app, a conta fica em conciliação enquanto os usos são registrados. Registrar crédito integral não significa liberar tudo para gastar novamente. Só ativar após comparar entradas/saídas/participações com saldo informado/conferido.

### 7.4 Reconstrução RAM/Elixir

Fluxo operacional preparado e exercitado **somente com fixtures nesta implementação local**:

1. Cadastrar/mapear a conta em conciliação.
2. Conferir recebimentos das RAMs/meias/outros itens e ligar cada crédito ao evento correto, sem novo desconto BRL.
3. Registrar o pedido Elixir já realizado, suas pessoas, valor nativo, fontes e data conhecida; consumir lotes em ordem consolidada.
4. Registrar outros usos intermediários conhecidos e comparar saldo CNY remanescente e direitos pessoais.
5. Conferir taxa residual antiga e ausência de taxa nova sobre saldo.
6. Incluir unidades adicionais no pacote aberto elegível; se pacote já foi enviado/selado, não falsificar estado para encaixá-las.
7. Aprovar conciliação e ativar a conta somente quando não houver diferença inexplicada.

Alternativa explícita: abertura apenas do remanescente atual, identificando a história abrangida, quando reconstrução não for possível. Não permitir abertura do remanescente + entrada novamente dos refunds integrais históricos. Incerteza de base/titularidade não se resolve por cotação de hoje ou pelo usuário que confirmou pagamento.

`occurred_at` vem da data real conhecida informada; `recorded_at` é servidor. Data desconhecida fica identificada, sem retrodatação fictícia. A sequência FIFO consolidada não muda posteriormente quando alguém corrige rótulo/data descritiva.

## 8. Fixtures numéricas e matriz de aceite

Todas as fixtures são sintéticas. Resolver frete/Receita como sem cobrança quando o exemplo tratar somente produto/China; não usar pendente como zero para obter total final.

### 8.1 Fixtures exatas

| ID | Entrada | Resultado obrigatório |
| --- | --- | --- |
| F1 — refund legado | Produto R$100 + China R$10, PIX 1%; refund recebido produto R$80 + China R$10 | Pagamento original R$111,10 e taxa R$1,10 intactos; crédito histórico R$90; líquido residual R$21,10. Solicitação anterior não diminui custo nem aumenta wallet |
| F2 — duas RAMs | Duas unidades, produto total ¥350/base histórica R$245, China sem cobrança; PIX original R$2,45; Alice/Bob 60/40; refund integral em saldo | Entrada ¥350/base R$245; direitos ¥210/R$147 e ¥140/R$98; residual da compra R$2,45 dividido R$1,47/R$0,98; quantidade original 2, enviável 0 |
| F3 — Elixir com saldo | Após F2, novo pedido de cinco kits, total ¥250, Alice/Bob 60/40, só saldo | Consumo Alice ¥150/R$105 e Bob ¥100/R$70; custo novo R$175, taxa zero, dinheiro novo zero; saldo restante ¥100/base R$70, direitos ¥60/R$42 e ¥40/R$28 |
| F4 — misto PIX | Pedido ¥500; saldo ¥300 com base R$210; complemento ¥200 com principal R$150, PIX 1% | Custo R$361,50; dinheiro novo R$151,50; débito ¥300; taxa sobre saldo zero; taxa PIX R$1,50 |
| F5 — misto cartão | Mesmo F4, cartão 5% no complemento | Custo R$367,50; dinheiro novo R$157,50; taxa cartão R$7,50; base de saldo não recebe 5% |
| F6 — refund misto | Após F4, devolução proporcional de metade do principal, destino saldo | Entrada ¥250/base histórica R$180 = ¥150/R$105 de origem saldo + ¥100/R$75 externa; taxa original R$1,50 permanece; residual do novo pedido R$181,50 |
| F7 — FIFO | Créditos ¥100/base R$70 RAM, ¥50/base R$40 meia, ¥200/base R$150 outro; consumir ¥250 | Vínculos ¥100 + ¥50 + ¥100, base levada R$185; saldo ¥100/base R$75 do terceiro lote; ordens estáveis após reload/renomeação |
| F8 — taxa por destino | Dois itens ¥100 cada; primeiro só saldo, segundo só PIX com principal R$75, taxa 1% | Primeiro recebe taxa nova zero; segundo R$0,75; total da taxa R$0,75, sem ratear sobre os dois por base global |
| F9 — centavos de lote | Lote ¥0,03/base R$0,02 consumido em três operações de ¥0,01; metade para cima sobre base remanescente | Bases levadas R$0,01/R$0,01/R$0,00; soma R$0,02; nunca gerar R$0,03 nem saldo/base negativos |
| F10 — saldo próprio | Alice/Bob têm ¥150 cada; pedido ¥500 com custo nativo 50/50, cada qual usa seu saldo | Custo ¥250 por pessoa; principal novo ¥100 por pessoa; não cobrar novamente os ¥150. Taxa externa acompanha somente o complemento |
| F11 — adiantamento | Crédito de Alice ¥100/base R$70 financia produto somente de Bob; D2 aprovada | Custo de Bob R$70; débito ¥100 de Alice; posição Bob → Alice ¥100; nenhum direito apagado/doado nem entrada bancária presumida |
| F12 — refund do adiantamento | Após F11 sem acerto, refund ¥40/base R$28 e prévia confirma abatimento | Nova entrada/direito de Alice ¥40/R$28; posição aberta ¥60; custo residual de Bob R$42; nenhuma dupla restituição |
| F13 — adiantamento já acertado | Após F11, Bob acertou integralmente fora de HubBuy e baixa foi registrada; depois refund ¥40/R$28 | Crédito pertence economicamente a Bob; Alice não recebe novamente; baixa externa não criou saldo CNY |
| F14 — acerto parcial | Após F11, obrigação ¥80 já quitada, aberta ¥20; refund ¥40/R$28 | No abatimento confirmado, máximo ¥20/R$14 ao financiador, restante ¥20/R$14 ao beneficiário; posição encerra sem ficar negativa |
| F15 — pacote pago | Frete R$40 + taxa paga R$0,40 para quatro unidades; adicionar quinta no mesmo pacote aberto | Mantém pagamentos R$40,40, autor/data; nova divisão R$8 + taxa R$0,08 por unidade; versão/conferência mudam, sem cobrar frete novamente |
| F16 — taxa mínima | Principal externo R$0,50, PIX 1% | Taxa R$0,01, arredondada uma vez; saldo equivalente não participa da base |

Composição econômica e valores BRL de acerto são separados. Se CNY/BRL varia no acerto, guardar valor efetivo registrado sem reavaliar preço histórico do produto. Não implementar apuração fiscal de ganho/perda cambial.

### 8.2 Matriz funcional/técnica mínima

| Área/caso | Esperado |
| --- | --- |
| Sem nova feature / legado | Totais, snapshots, taxas, QC e estados antigos idênticos |
| Sem sessão / outro workspace | Negação no servidor, sem saldo/IDs vazados ou escrita |
| Conta divergente | Não financiar nem alocar usando conta de outro contexto |
| Solicitação repetida / recebimento repetido | Nenhuma unidade ou crédito duplicado; operação identificável |
| Mesma chave e mesmo comando após timeout | Mesmo efeito confirmado, mesmo debit/credit; revisão stale não provoca retry com chave nova |
| Mesma chave com outro comando | Conflito, sem efeito parcial |
| Dados nativos inválidos | Rejeitar negativo, fração além da precisão, overflow, moeda/taxa incompatíveis e extras no DTO |
| Saldo total suficiente, titular insuficiente | Bloquear ou exigir financiamento explícito aprovado; nunca FIFO global alheio |
| Duas contas com saldos parciais | Não somar implicitamente para pagar uma obrigação |
| Dois trackings disputando o último saldo | Um vence; outro conflita/revalida, sem negativo |
| Consumo × correção/void | Só resultado consistente permitido; crédito utilizado não desaparece |
| Falha depois do debit/consumo/auditoria | Rollback total, inclusive estado pago/revisões/adiantamento |
| Refund parcial/total/zero | Unidades e dinheiro independentes, principal limitado e taxa preservada |
| Compra mista reembolsada | Fontes/base histórica/direitos corretos, sem nova conversão atual |
| Refund e posição de adiantamento | Abatimento limitado ao aberto; já acertado não recebe duas vezes |
| Referência cambial alterada | Somente aproximação muda; hashes/valores financeiros antigos intactos |
| Original com refund ativo + pedido adicional | Original continua congelado; adicional tem pagamento próprio |
| Draft adicional | Não gasta saldo, não produz unidade alocável ou total confirmado |
| Pedido já presente em outra compra | Não duplicar; explicar limite D3 |
| Inclusão × selo/envio | Apenas uma operação vence; conteúdo enviado/selado imutável pela operação comum |
| Mudar só distribuição de frete pago | Pagamento preservado; nova revisão para conferência |
| Mudança real de encargo pago | Complemento/compensação explícitos, sem apagar pago original |
| Cancelamento esvaziaria pacote positivo | Bloqueio antes de escrever, com motivo acionável |
| Tracking fechado | Mutação comum rejeitada; retry de operação já concluída continua idempotente após autorização |
| Reabertura financeira | Motivo/evento; manifesto permanece selado e compra finalizada |
| QC adicional | Matching conservador e leitura/gerenciamento autorizados, arquivos preservados |
| QC/refund/pacote | Nenhuma ação QC muda dinheiro; mover/cancelar não duplica nem apaga foto |
| Fonte única migrada | Não inventa CNY/pagador; método/fee/paidAt preservados |
| Ponte de refund antigo | Crédito único; custo BRL não é descontado novamente |
| Abertura + créditos históricos | Impedir dupla contagem de eventos abrangidos pela abertura |
| Exclusão/arquivo com dependência | Preservar ledger e origens; arquivo não apaga saldo |
| Responsividade/acessibilidade | Sem overflow a 320 px; foco/teclado/erros e reduced motion corretos |

### 8.3 Suítes e evidências sugeridas

Reutilizar `tests/integration/helpers.ts` com bancos explícitos. Criar/estender testes por responsabilidade, por exemplo:

- Unit: `financial-money`, `hubbuy-balance-calculations`, `purchase-payment-calculations`, `refund-funding-calculations` e apresentação/cliente de custos.
- Integração: contas/ledger, idempotência, pedidos, pagamentos mistos, refund de fontes mistas, financiamento pessoal, pacote/selo, QC adicional e migração.
- Concorrência: processos independentes sobre mesmo arquivo libSQL; padrões existentes de `package-refund-concurrency.test.ts`, com trackings diferentes compartilhando conta.
- E2E: jornadas em arquivos de saldo/pagamento misto e extensão dos cenários packages/refunds/QC. Não duplicar criação de infraestrutura; R2/DNS/download continuam simulados.

Salvar screenshots/trace pertinentes em `artifacts/qa/hubbuy-balance/`, com opt-in documentado. Testes não devem exportar extratos, JSON real, URL privada, credenciais ou dados de membros para fixtures/logs.

## 9. Comandos e cuidados de validação

Scripts usados na implementação local e disponíveis para validação:

```text
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
npm run db:generate
npm run db:migrate
npm run db:verify
```

Durante cada fase, executar suítes direcionadas aos arquivos reais criados. No gate final, `npm run check` reúne typecheck/lint/Vitest/build; não repetir os mesmos checks completos sem nova mudança/falha. Playwright e upgrades de banco são gates separados. Geração/aplicação de migration só ocorre quando houver código/schema sendo implementado, não para validar este documento.

Na investigação anterior passaram 59 testes direcionados mais 5 de concorrência multiprocesso. Isso é referência de baseline, **não evidência da implementação futura**. Houve `ENOENT` de cache SSR no sandbox Windows; repetição serial sem isolamento com pool threads passou os 59. Se o mesmo erro ocorrer, diagnosticar e registrar a limitação, sem suprimir testes financeiros:

```text
npx vitest run <arquivos-direcionados-reais> --maxWorkers=1 --no-isolate --pool=threads
```

O placeholder deve ser substituído, não executado literalmente. Suites multiprocesso devem continuar exercitando conexões/processos independentes mesmo com runner serializado.

Para migration/verify locais, usar sempre destino descartável explícito; scripts carregam dotenv e podem usar um alvo real se executados sem cuidado:

```powershell
$balanceSavedDbUrl = $env:TURSO_DATABASE_URL
$balanceSavedDbToken = $env:TURSO_AUTH_TOKEN
$balanceQaId = [guid]::NewGuid().ToString('N')
try {
  $env:TURSO_DATABASE_URL = "file:./data/hubbuy-balance-qa-$balanceQaId.sqlite"
  Remove-Item Env:TURSO_AUTH_TOKEN -ErrorAction SilentlyContinue
  npm run db:migrate
  if ($LASTEXITCODE -ne 0) { throw 'Migration local falhou' }
  npm run db:verify
  if ($LASTEXITCODE -ne 0) { throw 'Verificação local falhou' }
} finally {
  $env:TURSO_DATABASE_URL = $balanceSavedDbUrl
  $env:TURSO_AUTH_TOKEN = $balanceSavedDbToken
}
```

Não imprimir credenciais. Fechar conexões antes da limpeza e verificar caminhos absolutos antes de exclusão recursiva. Upgrade de schema exige fixture pré-migração, comparação dos dados anteriores e reaplicação idempotente, não apenas criar um banco vazio.

## 10. Entrega, limites e operação posterior

### 10.1 Entrega local obrigatória

- Código incremental completo autorizado, schema/migrations e comandos documentados.
- D1–D3 resolvidas/registradas ou área dependente explicitamente bloqueada; não alegar conclusão completa com regra econômica indefinida.
- Testes numéricos, migração, rollback, autorização, concorrência entre trackings e jornada completa.
- Evidência visual desktop/mobile e descrição de limitações reais.
- Lista de arquivos e alterações de terceiros preservadas.
- Plano de reconciliação RAM/Elixir em linguagem operacional, sem valores/identidades inventados.
- Handoff de backup/migration/deploy/smoke/recuperação; produção e dados reais permanecem ações separadas.

### 10.2 Após autorização operacional específica

1. Confirmar ambiente/banco/versão e backup recuperável; bloquear escritores antigos durante corte.
2. Aplicar migration explicitamente, verificar schema/FKs/contagens/dados e publicar versão compatível.
3. Smoke sintético autorizado em ambiente apropriado; não usar uma compra real como teste destrutivo.
4. Conferir entradas/consumos reais e executar conciliação escolhida, com a pessoa responsável fornecendo os valores.
5. Conferir taxa antiga, base BRL, CNY restante/direitos e conteúdo elegível do pacote; liberar conta após conciliação.
6. Registrar estado final e exceções. Depois de ledger novo, rollback apenas de código não é recuperação segura; preferir correção em frente ou restauração coordenada com análise de eventos posteriores.

Não configurar Cloudflare/R2, novos secrets ou buckets: essa evolução reutiliza o módulo QC existente. Testes remotos, configuração externa, publicação, migração e registro de dados financeiros reais exigem suas autorizações específicas.

## 11. Prompt pronto para o agente executor

> Implemente localmente a evolução descrita em `docs/26_HUBBUY_BALANCE_AND_MIXED_PAYMENTS_PLAN.md`, usando a investigação `docs/audits/2026-10-17_HUBBUY_BALANCE_AND_MIXED_PAYMENTS.md` como fundamentação. Leia primeiro `AGENTS.md`, os documentos obrigatórios e os planos relacionados na ordem indicada. Confira HEAD, diff, journal e símbolos atuais; preserve alterações de terceiros. Verifique se D1–D3 já foram respondidas pelo usuário; não trate recomendações como aprovações. Se faltar decisão econômica necessária, solicite-a uma vez e continue preparação técnica independente, sem ativar a política dependente. Execute as fases 0–10 em incrementos compiláveis, testando cada gate e corrigindo falhas antes de avançar. Preserve snapshots finalizados, pagamentos/taxas históricos, valores CNY/BRL e autorização centralizada; saldo não é desconto e não recebe taxa novamente. Implemente pedidos adicionais e pacote existente dentro da fronteira aprovada, sem duplicar registros ou remover validações para contornar limites. Prove atomicidade, idempotência, capacidades e concorrência entre trackings com processos independentes. Reutilize QC privado sem ampliar gates visuais. Entregue código, migrations, evidências, decisões finais e handoff operacional. Não publique, configure recursos externos, migre produção nem registre RAMs/Elixir reais sem autorização específica. Continue autonomamente entre fases; interrompa apenas trabalho dependente de decisão/credencial externa genuinamente necessária.

## 12. Registro da implementação local — 17/10/2026

### Decisões humanas confirmadas

- **D1:** créditos preservam direitos individuais proporcionais, embora o grupo normalmente consolide o pedido em uma única conta HubBuy.
- **D2:** saldo de outra pessoa pode financiar pedido somente com adiantamento explícito em CNY; o Loti registra e permite baixar o acerto efetivamente feito fora do app.
- **D3:** pedido adicional e pacote ficam no mesmo acompanhamento e conta HubBuy.

As decisões foram incorporadas a `docs/15_DECISIONS.md` e `docs/16_HUMAN_INPUTS.md`. Os valores financeiros e identidades usados na validação são sintéticos.

### Implementação entregue

- Ledger CNY append-only por conta, direitos por pessoa, reconstrução FIFO, conciliação cronológica ou abertura do saldo remanescente com período de atividade anterior explicitamente coberto, eventos históricos e extrato paginado.
- Pagamentos por componentes com saldo, PIX e cartão; taxas aplicadas somente ao dinheiro externo; consumo de créditos e direitos verificado em transação; adiantamentos CNY explícitos, baixa manual e reversões/abatimentos ligados a refunds recebidos.
- Pedidos adicionais com snapshot próprio, fontes de pagamento, pedidos no mesmo acompanhamento/conta e inclusão auditada em pacote elegível. A ordem de itens no pacote é estável entre pedido original e pedidos adicionais.
- QC vincula pedidos adicionais aos itens correspondentes e mantém fotos exclusivamente na galeria QC. A apresentação Phase 3 em linhas/cartões de custo continua bloqueada e não foi preparada.
- Migrações aditivas `0008`–`0017`, snapshots/journal Drizzle e verificações de upgrade, preservação, FKs e idempotência em banco descartável.

### Verificações executadas

| Gate | Resultado |
| --- | --- |
| `npm run typecheck` | Passou |
| `npm run lint` | Passou sem erros ou avisos |
| `npm test -- --maxWorkers=1 --no-file-parallelism --no-isolate --pool=threads --testTimeout=45000` | **253 testes passaram; 7 foram pulados.** 35 arquivos passaram e 1 foi pulado (36 total). |
| Playwright `tests/e2e/hubbuy-balance.spec.ts` | **1 cenário Chromium passou**, com conciliação CNY, uso parcial do saldo, complemento PIX, pacote e viewport 320 px |
| `npm run build` | Passou: compilação, TypeScript, páginas e traces |
| `npm run db:migrate` + `npm run db:verify` em SQLite descartável explícito | Passou; 47 tabelas de schema, 32 triggers de ledger, zero violações FK; arquivo removido após a verificação |
| `git diff --check` | Passou |
| Capturas | `artifacts/qa/hubbuy-balance/mixed-payment-desktop.png` e `artifacts/qa/hubbuy-balance/mixed-payment-320.png`, geradas com `LOTI_CAPTURE_HUBBUY_QA=1` |

O primeiro gate completo revelou uma contenção SQLite na corrida entre recebimento e encerramento; o retry limitado foi ampliado e a suíte completa repetida passou. O teste de migração QC foi atualizado para começar no schema imediatamente anterior às migrations 0016–0017 e confirmar a preservação do vínculo QC legado. O E2E também identificou e cobriu a ordem única dos itens ao combinar pedidos. As capturas mostram a jornada sintética em desktop e 320 px.

### Limites e próximo passo operacional

Nenhum saldo HubBuy real, refund antigo, RAM/Elixir, taxa, cotação, acerto entre pessoas ou pacote físico foi registrado ou conciliado. Esta execução não acessou nem alterou o banco remoto, não publicou versão, não configurou R2/Cloudflare/secrets e não executou transferências. A aplicação em produção depende de autorização operacional específica, backup recuperável, bloqueio coordenado de escritores, migração explícita, conciliação fornecida pelos responsáveis e smoke test posterior.
