# Investigação técnica e financeira — créditos e estornos HubBuy

Data de referência: 20/10/2026, America/Sao_Paulo. Investigação solicitada pelo usuário, sem implementação de correção.

## 1. Resumo executivo

**Os CNY 249,84 da RAM de 5200 MHz não desapareceram financeiramente.** Seu lote original foi integralmente consumido no histórico bruto, mas **CNY 141,26 foram devolvidos em quatro novos lotes de estorno**, ainda disponíveis. A interface não percorre a genealogia desses lotes e os apresenta como “Saldo restaurado por correção”. Os CNY 108,58 restantes da origem foram efetivamente gastos em pagamentos válidos. A RAM de 6000 MHz financiou outros CNY 33,42 e conserva CNY 286,37.

**Os saldos CNY individuais estão comprovados pelos registros consultados**, inclusive a titularidade dos quatro estornos. Não encontramos consumo entre pessoas diferentes nem adiantamentos neste conjunto. As parcelas restauradas coincidem exatamente, em CNY e base histórica BRL, com os proprietários dos consumos revertidos.

Há, porém, dois problemas confirmados: a apresentação perde a identidade do produto de origem; e corrigir/recomprar altera a ordem econômica dos lotes, tornando o resultado por origem diferente do lançamento direto. A reprodução pelos serviços reais encontrou também **R$ 0,03 de diferença na base histórica BRL final** entre os dois caminhos, embora os direitos CNY sejam idênticos. Portanto, equivalência financeira completa não está demonstrada e, na fixture, é refutada para BRL.

Risco geral: **alto para equivalência das bases financeiras ao corrigir repetidamente; médio para a rastreabilidade apresentada**. Não há evidência de criação/perda de saldo CNY ou de dinheiro atribuído ao participante errado no caso real examinado. Uma falha de concorrência local também permaneceu reproduzível, descrita adiante; ela não demonstra duplicação de crédito.

## 2. Método, limites e segurança

- Banco real: `loti-prod`, acessado exclusivamente pelo editor SQL do Turso já aberto no navegador interno. Somente `SELECT`, inclusive consultas ao `sqlite_schema`.
- Conta auditada: `c4e9a40a-26e1-4475-a539-b81e989ab607`. O relatório omite seu email e IDs pessoais. A sequência do ledger identifica inequivocamente as linhas dentro desta conta.
- Foram consultados ledger, parcelas, consumos, reembolsos, participantes históricos, componentes/alocações de pagamento, correções e proteções do schema.
- A primeira e a última conciliação retornaram revisão **24**, saldo **49940** unidades mínimas CNY; foram observadas 24 movimentações, sequências 0–23. As consultas foram sucessivas, não um snapshot transacional único; a revisão estável é evidência de estabilidade no período, não substitui snapshot formal para uma futura reparação.
- O teste novo usa `fixture(":memory:")`, pessoas fictícias e serviços locais reais. O helper prepara apenas esse banco descartável com o schema de testes. Nenhuma migração ou escrita foi executada no Turso, nenhum saldo real foi alterado e nenhum serviço financeiro foi modificado.
- O checkout já tinha alterações de outra tarefa. Foram acrescentados somente este relatório, as consultas de auditoria e o teste de reprodução. Nenhum commit, deploy ou alteração de configuração foi feito.
- A implementação examinada é a do checkout local; não se obteve o SHA implantado em Vercel. O comportamento observado no banco é compatível com ela. Esta auditoria valida a contabilidade persistida no Loti; não autenticou comprovantes externos da HubBuy nem a intenção humana de cada lançamento.

Uma consulta exploratória usou inicialmente uma coluna inexistente em `purchase_payment_allocations`; o editor retornou erro de schema. Ela foi substituída pelo join correto via `purchase_payment_components`. Não houve tentativa de escrita.

## 3. Arquitetura e causa-raiz

### 3.1 Entidades e responsabilidades

| Módulo/tabelas | Responsabilidade efetiva |
| --- | --- |
| `hubbuy_accounts` | Saldo materializado CNY, status e revisão da conta |
| `financial_operations` | Recibos idempotentes, hash da carga, autoria, motivo, contexto e reversão de operação |
| `hubbuy_balance_entries` | Ledger imutável: direção, sequência, CNY, base BRL, tipo/id de fonte e `reversal_of_entry_id` |
| `hubbuy_balance_credit_shares` | Direitos originais por crédito e proprietário, ordem persistida e base BRL |
| `hubbuy_balance_consumptions` | Débito → parcela do crédito → proprietário, valor e base histórica; referência à alocação de pagamento |
| `purchase_cost_refunds`, `purchase_cost_refund_participants/events` | Recebimento, origem de produto, bases e composição histórica; eventos de correção |
| `purchase_refund_payment_allocations` | Distribuição do recebimento por componente/fonte/pessoa |
| `purchase_cost_orders`, `purchase_additional_order_items`, `purchase_item_costs`, `purchase_cost_participants` | Snapshots de pedido/item e composição do custo |
| `purchase_payment_components/allocations` | Fontes de saldo/externas e destinos por produto/China/beneficiário |
| `purchase_order_corrections` | Relação append-only entre pedido anterior e substituto |
| `member_balance_financing_entries` | Adiantamentos explícitos, acertos, offsets e reversões; zero linhas neste banco |

Âncoras do código, relativas à raiz `C:/Fontes/loti`:

- `src/lib/domain/package-cost-services.ts:225`, `createRefundHubBuyCredit()`: só o recebimento confirmado cria crédito e parcelas. Produto e China são distribuídos separadamente, ponderados pelas parcelas BRL originais de cada componente.
- `src/lib/domain/package-cost-services.ts:327`, `reverseRefundHubBuyCredit()`: estorno de **recebimento**, distinto do estorno de **compra**. Bloqueia crédito já consumido e registra débito compensatório com consumos das parcelas originais. Explica as sequências 6 e 8.
- `src/lib/domain/purchase-cost-order-services.ts:278`, `recordMixedPaymentInTransaction()`: cria alocações por beneficiário/componente e consome lotes elegíveis por pessoa.
- `src/lib/domain/hubbuy-balance-calculations.ts:227`, `previewFifoConsumption()`: FIFO por sequência e ID; consome até esgotar o lote antes do seguinte. Base BRL proporcional com metade para cima; o último consumo absorve o resto.
- `src/lib/domain/purchase-order-corrections.ts:43`, `correct()`: estorna o pagamento em operação compensatória, mantém registros anteriores e cria novo pedido/pagamento na mesma transação.
- `src/lib/domain/purchase-order-corrections.ts:93–119`: cria um novo crédito de reversão por débito; agrupa os consumos por proprietário e devolve exatamente CNY/BRL. **Não reabre as parcelas originais.** Se o débito usou múltiplas origens do mesmo proprietário, elas ficam agregadas nessa nova parcela.
- `src/lib/domain/hubbuy-balance-services.ts:112`, `calculateLedgerState()`: calcula saldo assinado e disponibilidade como parcela original menos todos os seus consumos persistidos, sem excluir consumos de débitos posteriormente estornados. A compensação entra por outro lote.
- `src/lib/domain/hubbuy-balance-services.ts:542`: consulta direitos e resolve produtos apenas dos créditos `refund_received` ainda disponíveis.
- `src/lib/domain/hubbuy-rights-reading.ts:6`: resolve o refund para o item original/adicional por joins autorizados.
- `src/lib/domain/hubbuy-rights-presentation.ts:50–58`: somente `refund_received` recebe descrição de produto. `reversal` recebe descrição genérica e referências de produto/tracking nulas; não segue `reversal_of_entry_id` e consumos anteriores.
- `src/lib/domain/hubbuy-rights-presentation.ts:66`: parcelas com CNY e BRL zerados são omitidas.
- `src/components/packages/hubbuy-individual-rights.tsx:11`: mostra inicialmente três origens, com “Ver todas”; isso não explica o desaparecimento da RAM 5200, pois suas parcelas originais realmente têm disponibilidade zero.

Rotas: `/api/hubbuy/accounts`, `/api/hubbuy/accounts/[accountId]` e `/statement`; os comandos de recebimento, pagamento e correção são encaminhados pelo handler `/api/packages/[trackingId]` aos serviços de domínio. Leitura e mutação exigem sessão/membership; a autorização é server-side. O campo `paid_by`/autor não define titularidade econômica.

### 3.2 Política de consumo e natureza dos estornos

É **FIFO por proprietário elegível**, não FIFO indiscriminado do saldo agregado. O serviço monta `lotsByPerson`, reserva saldo próprio e só aceita saldo de outra pessoa mediante `balanceFunding` explícito e registro de adiantamento. O valor de cada beneficiário é distribuído por componente a partir dos pesos persistidos. Não há consumo proporcional automático do patrimônio da conta inteira.

O comportamento do estorno corresponde a **B no armazenamento de lotes e C no efeito econômico**: cria crédito novo, preserva titular e base, mas não preserva no próprio lote a decomposição por origem anterior. Não é um crédito sem vínculo: `reversal_of_entry_id` aponta para o débito; suas linhas de consumo continuam apontando às parcelas e aos refunds originais. Neste caso a genealogia é recuperável sem ambiguidade porque cada estorno consumiu apenas RAM 5200 e nenhum desses lotes restaurados foi reutilizado.

Após um novo gasto de um lote restaurado que agregou várias origens, o schema atual não informa qual fração de cada origem original financiou o gasto seguinte. Uma regra de decomposição terá de ser definida; não se pode apresentar uma escolha inventada como fato histórico.

### 3.3 Precisão e distribuição inicial real

Todos os valores são inteiros em centésimos de CNY ou centavos BRL. Helpers usam `BigInt` nos intermediários, maior resto com desempate pela ordem persistida/ID e arredondamento metade para cima em razões. Não há taxa cambial consultada em tempo real. CNY e base BRL coexistem e são conceitos separados.

| RAM | Pessoa, na ordem persistida | Peso produto BRL | Peso China BRL | Crédito CNY |
| --- | --- | ---: | ---: | ---: |
| 5200 | Gabriel Arantes | 6619 | 576 | 83,28 |
| 5200 | Gabriel Oliveira | 6619 | 576 | 83,28 |
| 5200 | Vinícius Alves | 6619 | 575 | 83,28 |
| 6000 | Gabriel Arantes | 8634 | 576 | 106,61 |
| 6000 | Gabriel Oliveira | 8633 | 576 | 106,59 |
| 6000 | Vinícius Alves | 8633 | 575 | 106,59 |

Todos os snapshots de participantes consultados têm `weight_mode=equal`, peso 1. Entretanto, o recebimento usa as parcelas monetárias BRL já arredondadas como pesos: ambas as RAMs receberam somente componente produto CNY, China CNY zero. Foram recebidos BRL 18756/24007 e CNY 24984/31979, respectivamente. Portanto, a divisão nativa da RAM 6000 não é uma divisão direta igual de 31979 por três. A diferença resulta da política implementada e dos dados históricos, não de uma transferência introduzida pelos estornos.

## 4. Linha do tempo real

Horários de registro em Brasília (UTC−03), todos em 20/10/2026. Não são datas presumidas da efetiva operação externa.

| Seq. | Hora | Tipo/valor CNY | Relação |
| ---: | --- | --- | --- |
| 0 | 15:30:05 | +249,84 | RAM 5200; entrada `12d9a91b…`, refund `f419c76c…` |
| 1 | 15:32:46 | +319,79 | RAM 6000; entrada `3647d953…`, refund `3e6ba8c0…` |
| 2/3 | 15:50:03 / 15:50:38 | +4,78 / +4,78 | Meias curtas, Gabriel Arantes |
| 4/5 | 15:51:02 / 15:51:19 | +4,91 / +6,32 | Meias médias/longas; Arantes/Vinícius |
| 6/7 | 15:53:38 / 15:53:40 | −4,91 / +4,92 | Correção do recebimento da meia média; nova base correta |
| 8/9 | 15:53:52 / 15:53:53 | −6,32 / +6,33 | Correção do recebimento da meia longa |
| 10 | 16:14:07 | −19,02 | Capa com quantidade 2 cadastrada; consome RAM 5200 |
| 11 | 16:15:18 | +19,02 | Estorna débito 10; novo lote `cfaa3bc4…` |
| 12 | 16:15:21 | −19,02 | Capa corrigida, quantidade 1; consome novamente RAM 5200 |
| 13 | 16:17:24 | −30,74 | Cordas, quantidade 1; RAM 5200 |
| 14 | 16:21:29 | −28,06 | Cordas, 2 unidades: produto 18,06 + China 10,00 |
| 15 | 16:22:28 | +28,06 | Estorna 14; novo lote `b765609b…` |
| 16 | 16:22:31 | −38,06 | Mesmo pedido: produto 18,06 + China 20,00 |
| 17 | 16:49:07 | +38,06 | Estorna 16; novo lote `52c6065e…` |
| 18 | 16:49:10 | −56,12 | Produto 36,12 + China 20,00 |
| 19 | 16:54:08 | −46,12 | Outro pedido: produto 36,12 + China 10,00; RAM 5200 |
| 20 | 17:11:21 | +56,12 | Estorna 18; novo lote `bc1076af…` |
| 21 | 17:11:24 | −46,12 | Correção final: 12,70 da RAM 5200 e 33,42 da RAM 6000 |
| 22 | 17:28:17 | +18,98 | Lego, Brunna |
| 23 | 17:29:51 | +31,98 | Camisa do Palmeiras, Gabriel Arantes |

Pedidos 10/14/16/18 são substituídos; 12/13/19/21 são válidos. Os quatro custos finais são 19,02 + 30,74 + 46,12 + 46,12 = **142,00**. A quantidade errada da capa não alterava o total persistido do componente, que já era 19,02.

### 4.1 Esgotamento exato da RAM 5200

| Débito seq. | Consumo RAM 5200 | Remanescente bruto original |
| ---: | ---: | ---: |
| Inicial | — | 249,84 |
| 10 | 19,02 | 230,82 |
| 12 | 19,02 | 211,80 |
| 13 | 30,74 | 181,06 |
| 14 | 28,06 | 153,00 |
| 16 | 38,06 | 114,94 |
| 18 | 56,12 | 58,82 |
| 19 | 46,12 | 12,70 |
| 21 | 12,70 | **0,00** |

Na sequência 21, os remanescentes por titular da RAM 5200 eram Arantes 4,21, Oliveira 4,23 e Vinícius 4,26. O mesmo pagamento consumiu da RAM 6000, respectivamente, 11,17 / 11,14 / 11,11. Cada pessoa usou seus próprios lotes.

O lote original está esgotado **no histórico bruto**, mas não por 249,84 de gastos finais válidos. Excluir os débitos estornados sem contabilizar seus créditos novos duplicaria o dinheiro; manter só o lote original sem seguir as reversões ocultaria 141,26 de sua origem.

### 4.2 Cada restauração e seu destino

| Crédito seq. | Débito revertido | Arantes CNY | Oliveira CNY | Vinícius CNY | Total | BRL restaurado por titular (centavos) |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 11 | 10 (`8ccf33f0…`) | 6,34 | 6,34 | 6,34 | 19,02 | 476 / 476 / 476 |
| 15 | 14 (`f5d3861b…`) | 9,36 | 9,35 | 9,35 | 28,06 | 703 / 702 / 702 |
| 17 | 16 (`726eeb6d…`) | 12,69 | 12,69 | 12,68 | 38,06 | 953 / 953 / 952 |
| 20 | 18 (`d1c8e6ea…`) | 18,71 | 18,71 | 18,70 | 56,12 | 1405 / 1405 / 1404 |
| Total | | **47,10** | **47,09** | **47,07** | **141,26** | **3537 / 3536 / 3534** |

As doze parcelas foram comparadas aos consumos originais: coincidência exata de proprietário, CNY e BRL. Todos esses consumos vinham da RAM 5200. Nenhum desses novos lotes teve consumo posterior. Cada crédito tem FK ao débito revertido, e este possui consumos com FK às parcelas da RAM. O refund não é FK direta no novo crédito: é alcançado por essa cadeia. Há quatro relações de correção de pedidos e quatro créditos de restauração; nenhuma duplicação de `reversal_of_entry_id` foi encontrada.

## 5. Auditoria individual

Reconstrução independente: somar parcelas originais e subtrair consumos por `credit_share_id`, sem copiar projeções da UI.

| Participante | Atual informado | Reconstruído CNY | Diferença | Situação |
| --- | ---: | ---: | ---: | --- |
| Gabriel Arantes | 189,00 | **189,00** | 0,00 | Confere com parcelas e consumos |
| Vinícius Alves | 148,88 | **148,88** | 0,00 | Confere com parcelas e consumos |
| Gabriel Oliveira | 142,54 | **142,54** | 0,00 | Confere com parcelas e consumos |
| Brunna | 18,98 | **18,98** | 0,00 | Confere com refund individual |
| Total | 499,40 | **499,40** | 0,00 | Confere independentemente do saldo armazenado |

| Pessoa | Créditos iniciais RAM | Consumos válidos | RAM remanescente | Outros refunds líquidos | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Arantes | 189,89 | 47,35 | 142,54 | 46,46 | 189,00 |
| Oliveira | 189,87 | 47,33 | 142,54 | 0,00 | 142,54 |
| Vinícius | 189,87 | 47,32 | 142,55 | 6,33 | 148,88 |
| Brunna | 0,00 | 0,00 | 0,00 | 18,98 | 18,98 |

Os consumos válidos por pessoa são os das sequências 12/13/19/21. Arantes: 6,34 + 10,25 + 15,38 + 15,38 = 47,35; Oliveira: 6,34 + 10,25 + 15,37 + 15,37 = 47,33; Vinícius: 6,34 + 10,24 + 15,37 + 15,37 = 47,32. As duas últimas linhas se dividem por produto/China antes do arredondamento. Assim, não se deve repartir 142,00 uma única vez e substituir as alocações registradas.

Outros créditos de Arantes: meias 4,78 + 4,78 + 4,92 e camisa 31,98 = 46,46. Vinícius: meia 6,33. Brunna: Lego 18,98. As versões antigas 4,91/6,32 foram integralmente anuladas; não compõem esses direitos.

Bases históricas BRL atuais reconstruídas: Arantes R$143,54; Oliveira R$107,02; Vinícius R$110,91; Brunna R$14,25. São bases contábeis, não saldos bancários nem conversão atual dos CNY.

## 6. Auditoria por origem e conciliação em três níveis

### Nível 1 — conta

Ledger bruto: **793,89 − 294,49 = 499,40 CNY**, igual ao campo materializado. Normalizando as correções sem duplicar os valores: créditos efetivos **641,40**, compras válidas **142,00**, saldo **499,40**. Os créditos brutos incluem 141,26 de restaurações e 11,23 de versões de recebimentos posteriormente anuladas.

### Nível 2 — titulares

**189,00 + 148,88 + 142,54 + 18,98 = 499,40 CNY**. Zero consumos com proprietário diferente do beneficiário de pagamento; zero linhas de financiamento.

### Nível 3 — cada lote e cada origem econômica

| Crédito seq. / origem | Original CNY | Consumido bruto | Remanescente do lote |
| --- | ---: | ---: | ---: |
| 0 RAM 5200 | 249,84 | 249,84 | 0,00 |
| 1 RAM 6000 | 319,79 | 33,42 | 286,37 |
| 2 meia curta preta | 4,78 | 0,00 | 4,78 |
| 3 meia curta branca | 4,78 | 0,00 | 4,78 |
| 4 meia média, versão antiga | 4,91 | 4,91 (anulação) | 0,00 |
| 5 meia longa, versão antiga | 6,32 | 6,32 (anulação) | 0,00 |
| 7 meia média, corrigida | 4,92 | 0,00 | 4,92 |
| 9 meia longa, corrigida | 6,33 | 0,00 | 6,33 |
| 11 reversão da compra 10 | 19,02 | 0,00 | 19,02 |
| 15 reversão da compra 14 | 28,06 | 0,00 | 28,06 |
| 17 reversão da compra 16 | 38,06 | 0,00 | 38,06 |
| 20 reversão da compra 18 | 56,12 | 0,00 | 56,12 |
| 22 Lego | 18,98 | 0,00 | 18,98 |
| 23 camisa | 31,98 | 0,00 | 31,98 |

Todos os 14 lotes fecham como original = consumo bruto + remanescente. A identidade econômica não deve contar o estorno como um segundo refund:

- **RAM 5200: 249,84 = 108,58 de consumo líquido válido + 141,26 disponível nos lotes descendentes.**
- **RAM 6000: 319,79 = 33,42 válido + 286,37 disponível.**
- **RAMs: 569,63 = 142,00 válido + 427,63 disponível.**
- Outras origens líquidas: **71,77**, total disponível **499,40**.

Composição por titular das RAMs: Arantes 95,44 (6000) + 47,10 (descendentes 5200) = 142,54; Oliveira 95,45 + 47,09 = 142,54; Vinícius 95,48 + 47,07 = 142,55.

**Os três níveis são demonstráveis neste caso.** Não se classifica a genealogia persistida como completamente perdida: ela foi reconstruída. O que falha é sua projeção na interface e a equivalência de consumo por origem após correções.

## 7. Teste de equivalência e reprodução isolada

Arquivo: `tests/integration/hubbuy-credit-traceability-audit.test.ts`. Usa duas fixtures independentes em memória, cria duas RAMs fictícias compartilhadas, confirma pagamento original e dois recebimentos pelo serviço, depois cria/corrige pedidos adicionais pelos mesmos serviços da aplicação. Valores nativos e bases equivalentes ao caso, sem IDs/nome/email de produção. O teste também repete cada confirmação com a mesma chave, verificando replay.

- A: registrar diretamente 19,02; 30,74; 36,12 + 10,00; 36,12 + 10,00.
- B: capa com quantidade errada → corrigir; 30,74; 18,06 + 10,00 → 18,06 + 20,00 → 36,12 + 20,00; outro 36,12 + 10,00; corrigir o anterior para 36,12 + 10,00.

| Critério | A | B | Resultado |
| --- | --- | --- | --- |
| Saldo CNY das RAMs | 427,63 | 427,63 | Equivalente |
| Titulares alice/bob/carol CNY | 142,54 / 142,54 / 142,55 | mesmos valores | Equivalente |
| RAM alpha em saldo | 107,84 | 0,00 no lote; 141,26 em reversões | Não equivalente por lote |
| RAM beta em saldo | 319,79 | 286,37 | Não equivalente |
| Novos lotes de correção | nenhum | 4, total 141,26 | São compensações, não dinheiro duplicado |
| Base BRL alice/bob/carol | 107,00 / 107,01 / 107,01 | 107,01 / 107,02 / 107,02 | B conserva R$0,03 a mais |
| Genealogia na UI | Produtos | Produto beta + rótulos genéricos | Falha de apresentação |
| Retry mesma chave | não aplicável | replay sem segunda correção | Passa na execução sequencial |

A divergência BRL vem da compensação voltar ao fim do FIFO e de novos consumos/arredondamentos, não de uma conversão externa. O teste caracteriza explicitamente o defeito com asserções de desigualdade e dos valores observados; passa **porque reproduz o comportamento atual**, não porque o comportamento atende à equivalência desejada. Após uma correção aprovada, essas asserções deverão ser substituídas pelo contrato de equivalência e de genealogia adotado.

### Validação executada

- Reprodução nova: passou; execução pelos serviços reais, duas fixtures em memória.
- ESLint do arquivo novo: passou.
- `npm run typecheck`: passou.
- Suíte existente `purchase-order-corrections.test.ts`: 8 passaram, 1 falhou. O teste com dois processos retornou um sucesso e um `SQLITE_BUSY: database is locked`; a repetição isolada reproduziu a mesma falha. Não modificar a lógica financeira para esconder essa falha nesta investigação.
- Uma execução conjunta sofreu também `ENOENT` no cache SSR temporário do Vitest, impedindo três arquivos de iniciar. Não conta como validação desses arquivos. A reprodução nova foi executada isoladamente com sucesso depois disso.
- Não foi feito build/deploy ou teste contra a UI de produção. O relatório não usa uma suíte verde completa como evidência inexistente.

## 8. Integridade, concorrência e severidade

| Risco/problema | Estado | Severidade e evidência |
| --- | --- | --- |
| Titular CNY errado nos quatro estornos reais | Não observado | Doze parcelas comparadas; CNY e BRL iguais aos proprietários originais |
| Saldo total divergente/projeção incorreta | Não observado | Ledger, lotes e campo materializado fecham; revisão 24 |
| Origem mostrada como genérica | Confirmado | Médio: `describeOrigin()` ignora cadeia de reversão |
| Correção muda prioridade FIFO/origem final | Confirmado | Médio: RAM 6000 consumida em B, intacta em A |
| Base BRL depende do caminho de correção | Confirmado na fixture | Alto: R$0,03 a mais no saldo histórico de B; pode mudar custos históricos/pessoais seguintes. Não é prova de R$0,03 de dinheiro bancário criado |
| Mistura de várias origens em um lote restaurado | Confirmado na implementação; não ocorrido nesses estornos | Médio: agrupamento somente por dono; reutilização parcial pode tornar a decomposição histórica ambígua |
| Estorno duplicado por retry | Não observado | Chave/hash persistidos, unique de pedido anterior/substituto, transação, revisão de conta/tracking; replay sequencial passa |
| Confirmações concorrentes ambas reconhecidas | Falha local confirmada | Médio: um processo recebe SQLITE_BUSY; não prova crédito duplicado ou falha equivalente no Turso remoto |
| Consumos simultâneos maiores que saldo | Potencial, não demonstrado | Transação/CAS e validações reduzem risco; não houve teste de carga remoto e a fila em memória não é lock distribuído |
| Escrita parcial após falha | Não observada no caso | Correção inteira em transação, validação final e rollback. A suíte existente cobre rejeições sem mudança parcial; o caso concorrente falha antes das asserções finais |
| Crédito/consumo órfão | Não observado | Zero em joins; FKs e triggers presentes |
| Valor consumido maior que parcela | Não observado | Zero parcelas com consumo CNY ou BRL acima do original |
| Ledger sem parcelas/consumos completos | Não observado | Zero créditos com soma CNY/BRL divergente; zero débitos com soma CNY divergente |
| Centavos mudarem de pessoa por renomear | Não observado | IDs/ordem persistidos são desempate; nenhum uso entre titulares nesta conta |
| Composição alterada em uma correção | Potencial funcional | A correção permite novos pesos entre os mesmos participantes; isso representa novo rateio explícito, não licença para transferir saldo já consumido. Neste caso as alocações confirmam equal |
| Edição/exclusão de favorito alterar histórico | Não observado na arquitetura | Snapshots independentes; origens de produto vêm dos itens históricos/custos, não do favorito mutável |

No banco real foram verificados índices de idempotência, sequência e correção anterior/substituta; triggers imutáveis de entradas, parcelas, consumos e correções; e `hubbuy_account_balance_matches_ledger`. O schema não possui unique global de `reversal_of_entry_id`; a unicidade do fluxo de correção depende também da operação idempotente e de `purchase_order_corrections`. Não se deduz daí que uma requisição normal consegue duplicar estorno: há outras barreiras transacionais.

## 9. Proposta de correção — NÃO EXECUTADA

### Alternativa 1: genealogia apenas na leitura

Resolver reversão → débito → consumos → parcelas → refund e agrupar os lotes restaurados sob o produto original. É a menor intervenção para a apresentação deste caso, preservando os quatro lotes, todos os saldos, BRL e auditoria. Não resolve por si só a mudança de FIFO/base BRL nem misturas ambíguas futuras. Pode ser a primeira entrega, explicitamente rotulada como recuperação de apresentação e não equivalência contábil completa.

### Alternativa 2: compensação por parcela de origem e disponibilidade econômica

Recomendação para resolver a causa financeira de forma localizada: registrar reversões por **consumo/parcela de origem**, com CNY e BRL exatos; calcular a disponibilidade do lote raiz como crédito menos usos mais devoluções vinculadas, conservando sua prioridade econômica. O ledger de caixa permanece append-only; uma compensação não deve simultaneamente ser somada como novo direito independente e como restauração da raiz.

Uma tabela aditiva de alocações da reversão pode conter crédito de reversão, consumo original, parcela raiz, proprietário, CNY, BRL e ordem; constraints/uniques e guards devem impedir compensar o mesmo consumo acima do disponível ou misturar contas/titulares. Pode-se resolver a raiz por encadeamento autorizado e limitado. Avaliar reaproveitar referências existentes antes de exigir schema novo, mas não usar somente um `root_credit_id` se um débito puder conter múltiplas origens.

Evitar simplesmente trocar o label ou dar a todos os lotes genéricos o nome RAM 5200. Também não excluir o débito original do cálculo mantendo o crédito compensatório como direito: isso duplicaria saldo.

### Histórico existente

Pré-condições: aprovação específica, identificação do deploy e banco, snapshot/backup recuperável, janela sem escritores incompatíveis e coleta transacional do estado/revisões. Escopo desta conta: quatro créditos de estorno, suas doze parcelas, quatro débitos e respectivos consumos; raízes de produto e correções preservadas.

Para esses registros, o backfill de genealogia é inequívoco: cada estorno contém somente RAM 5200, dono conhecido, CNY/BRL comparáveis e nenhum consumo descendente. Criar metadados de genealogia não requer redistribuir saldo nem converter sua identidade em nova entrada financeira.

**Não recomputar retroativamente as compras válidas como se os erros nunca tivessem ocorrido.** Isso alteraria origens consumidas e possivelmente bases BRL já confirmadas. Preservar snapshots e referências históricas; qualquer mudança econômica retroativa precisa de uma decisão explícita e uma proposta financeira separada, com o antes/depois por titular e por origem.

Transação de recuperação: verificar IDs/revisões/hash de evidência, validar somas por consumo/dono/raiz/CNY/BRL, inserir apenas alocações ainda ausentes, auditar a execução e comparar todas as projeções antes/depois. Usar chave idempotente e unicidade por vínculo; rejeitar correspondência ambígua em vez de estimar. Falha reverte tudo. Rollback operacional deve remover/reverter apenas metadados novos ainda sem uso, ou restaurar snapshot em ambiente apropriado; nunca apagar ledger financeiro para voltar o saldo. Validar restauração do backup em cópia antes da execução real.

## 10. Plano de implementação sujeito a aprovação

1. Fixar os critérios: propriedade CNY, origem, prioridade FIFO e base BRL; decidir tratamento explícito de história antiga e de créditos mistos já reutilizados.
2. Expandir o teste novo para o contrato desejado, incluindo mais de uma origem por débito, gasto parcial do estorno, correções em cadeia, fontes externas e adiantamentos.
3. Alterar pontualmente `purchase-order-corrections.ts`, `hubbuy-balance-services.ts`, `purchase-cost-order-services.ts` e helpers para restaurar disponibilidade com a decomposição exata. Se necessário, schema/migração aditiva apenas de genealogia, sem backfill automático pelo nome do produto.
4. Atualizar `hubbuy-rights-reading.ts`, `hubbuy-rights-presentation.ts` e a apresentação individual para mostrar produto raiz, saldo, titular e histórico de reversão separadamente. Não recalcular finanças no frontend.
5. Investigar separadamente o SQLITE_BUSY dos dois processos, inclusive a posição de leituras/replay antes do bloco de retry; provar idempotência e rollback por conexões/processos independentes. Não remover verificações de revisão para tornar o teste verde.
6. Preparar dry-run read-only de genealogia histórica, conjunto exato afetado, relatório de ambiguidades e hash/revisão. Submeter a recuperação real à aprovação posterior.
7. Aceite: A/B equivalentes em CNY por pessoa e origem sob a política aprovada, BRL por pessoa e totais; nenhuma compensação duplicada; vínculo de cada fração e estorno navegável; snapshots/fees/custos/pacotes anteriores preservados; falha parcial sem escrita; retry e concorrência verificados.
8. Antes de qualquer publicação/migração real: backup, validação em cópia, aprovação específica e validação de todos os níveis antes/depois. Esta investigação não autoriza execução desse plano.

## 11. Respostas finais às oito perguntas

1. **Onde foram os 249,84?** 108,58 de consumo líquido válido e 141,26 disponíveis nos quatro lotes restaurados, integralmente derivados da RAM 5200.
2. **Por que ela sumiu?** Seu lote bruto chegou a zero na seq.21; os descendentes disponíveis são rotulados como reversões genéricas.
3. **Os 141,26 restauraram a raiz?** Criaram lotes novos, com os donos e bases exatos, ligados aos débitos. Não reabriram as parcelas originais.
4. **Alguém recebeu dinheiro de outra pessoa?** Não nos registros deste caso: doze restaurações exatas, zero usos cruzados, zero financiamentos.
5. **Os saldos CNY atuais são corretos?** Sim, em relação aos créditos/proprietários/pagamentos persistidos. Não se infere daí equivalência das bases BRL ou comprovação externa dos recebimentos.
6. **A origem se preserva ao editar repetidamente?** Há cadeia auditável neste caso, mas a UI não a mostra; a nova ordem dos lotes muda origens consumidas e bases BRL. Misturas reutilizadas podem exigir regra adicional não persistida hoje.
7. **Pode acontecer novamente?** Sim: cada correção a saldo cria novos lotes `reversal` e a leitura continua sem resolver raízes.
8. **Menor correção segura?** Primeiro recuperar a apresentação por genealogia sem tocar valores; para corrigir a causa financeira, compensar/alocar por origem e preservar prioridade/base, com testes de equivalência e recuperação histórica aprovada separadamente.

Nada do plano foi implementado e nenhum dado real foi alterado.

Consultas reproduzíveis: [SQL somente leitura](2026-10-20_CREDIT_REFUND_TRACEABILITY_READONLY.sql). As consultas executadas no navegador usaram também versões compactadas com `group_concat` para evitar truncamento da interface. O arquivo apresenta as mesmas relações em formato tabular legível; contém somente SELECTs e não deve ser confundido com uma migração ou script de reparação.
