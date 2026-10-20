# Reembolsos — produtos restantes, custo atual e histórico de pagamentos

Data: **20/10/2026**. Status: **decisão de experiência aprovada; plano para implementação por outro agente**.

Este documento entrega especificação executável, não uma implementação. A tarefa que o criou não alterou código, banco, pagamentos, reembolsos ou produção. Os testes da aplicação não foram executados nesta etapa documental. Não copiar resultados de planos anteriores como validação desta mudança.

## 1. Resultado esperado e autorização

O usuário apresentou três capturas de Pacotes e custos e solicitou:

1. Adotar em Reembolsos o padrão de tabela de Produtos e custos.
2. Retirar da tabela operacional os produtos que já não fazem parte do pedido por cancelamento/reembolso.
3. Simplificar a leitura financeira, pois bases históricas, produtos cancelados, créditos e pagamentos aparecem misturados.

Antes do plano, aprovou a proposta de separar **produtos restantes**, **reembolsos e custos não devolvidos**, **custo atual** e **histórico de pagamentos**. Em seguida pediu um plano extremamente detalhado para outro agente implementar.

### 1.1 Decisões de produto aprovadas

| Tema | Comportamento a entregar |
| --- | --- |
| Tabela operacional | Somente unidades que continuam no pedido; produto totalmente cancelado sai dela |
| Cancelamento parcial | Uma linha operacional com as unidades restantes; as canceladas aparecem em Reembolsos |
| Momento da retirada | Ao registrar a solicitação, pois `requested` já cancela as unidades; não esperar `received` |
| Reembolsos | Mesmo padrão visual da tabela existente, com colunas próprias para cancelamento e devolução |
| Custos preservados | Frete/taxa/principal não devolvido continuam no custo, explicados em Reembolsos |
| Resumo principal | Produtos restantes + custos mantidos dos cancelados = custo da compra até agora |
| Pagamentos | Registro original permanece intacto, consultável em expansão `Ver pagamentos` |
| Vocabulário | Custo não significa pagamento pendente; saldo HubBuy não significa dinheiro novo |
| Pendência | Solicitação a receber não reduz o custo; somente recebimento confirmado reduz |

### 1.2 Defaults técnicos deste handoff

As decisões de agrupamento, nomes de módulos, campos de DTO e algoritmo de partição abaixo completam a proposta aprovada. Não são respostas literais adicionais do usuário. São defaults executáveis: o agente pode ajustar nomes e extrações, mantendo os comportamentos, exemplos e invariantes. Não reabrir a escolha visual nem pedir aprovação para cada fase.

## 2. Leitura, precedência e fronteiras

1. Ler `AGENTS.md`, `PROMPT_ONE_SHOT.md` e os documentos canônicos 00–17 na ordem obrigatória do repositório.
2. Ler os planos [21](21_PACKAGES_AND_COSTS_PLAN.md), [22](22_PACKAGES_AND_COSTS_UX_REFACTOR_PLAN.md), [23](23_PRODUCT_REFUNDS_PLAN.md), [26](26_HUBBUY_BALANCE_AND_MIXED_PAYMENTS_PLAN.md) e a correção de adicionais [29](29_ADDITIONAL_PRODUCT_CORRECTIONS.md).
3. Consultar [24](24_HUBBUY_QC_IMPORT_PLAN.md) para os limites das superfícies QC e [25](25_MOBILE_UX_REFACTOR_HANDOFF.md) para drawers/mobile. Esta tarefa não amplia autorização de imagens.
4. Ler [a auditoria do escopo do pagamento original](audits/2026-10-19_ORIGINAL_PAYMENT_SCOPE_FIX.md). Preservar essa correção, inclusive quando um adicional é integralmente pago com saldo.
5. Usar este plano como atualização da **apresentação** prevista em 21–23. Permanecem os contratos financeiros, estados, transações, autorização e snapshots dos planos 23/26/29. As antigas referências a três seções não obrigam desfazer as quatro seções presentes no checkout.

### 2.1 Dentro do escopo

- Projeção derivada e exata dos custos de unidades restantes e canceladas.
- Filtragem e valores da tabela operacional, tabela agrupada de reembolsos, composição financeira e histórico de pagamentos.
- Contagens, subtotais, próxima ação, retorno de foco e leitura responsiva.
- Coerência dos totais já apresentados em cabeçalho, lista de acompanhamentos e divisão por pessoa.
- Testes relevantes, capturas sintéticas e documentação de entrega.

### 2.2 Fora do escopo

- Alterar significado de solicitar/receber/anular, tetos de devolução ou elegibilidade logística.
- Reduzir bases salvas, recalcular taxa paga, marcar pagamento novamente ou transferir custo dos cancelados para outros produtos/pessoas.
- Reembolso de taxa, pós-envio, parcelamento de recebimento, perda financeira nova persistida, pagamento real, integração, câmbio automático ou novo ledger.
- Alterar favoritos, `purchase_items`, participantes finalizados ou snapshots de pedidos pagos.
- Novas rotas, navegação primária, dashboard, biblioteca genérica de tabelas ou atualização de dependências.
- Migrar/publicar produção, usar dados reais para testes, configurar Cloudflare/secrets/buckets ou registrar reembolsos reais.

**Expectativa de schema: nenhuma migração.** As faixas `unitStart`, snapshots, componentes, fontes e recebimentos já existem. Não criar coluna de total derivado, nova tabela de custos residuais nem backfill. Se a inspeção revelar dados legados sem capacidade suficiente para uma leitura correta, registrar o caso com fixture e produzir fallback honesto; não inventar bases ou alterar dados históricos para fazê-los caber.

## 3. Baseline e referências duráveis

Base auditada estaticamente: commit `6f2f2b4` **mais alterações locais não commitadas**, em 20/10/2026. A árvore estava amplamente modificada; o commit sozinho não reproduz esta auditoria.

Os arquivos centrais `product-costs-list.tsx`, `product-costs.css`, `package-cost-layout.css`, `purchase-cost-header.css` e o plano 29 estavam entre arquivos novos locais; `package-cost-detail-screen.tsx`, `refunds-section.tsx`, `package-cost-reading.ts`, `package-cost-services.ts`, schema, testes e planos 24/26 já tinham alterações. A migração local mais recente observada foi `0020_white_maginty.sql`, da correção de adicionais, **não desta tarefa**.

Ao iniciar, executar `git status --short`, conferir os diffs dos arquivos a tocar e preservar toda alteração preexistente. Não fazer reset/clean, não sobrescrever arquivos com versões do HEAD e não incluir indiscriminadamente toda a árvore em commit. Este plano não autoriza criar commit ou PR por conta própria.

### 3.1 Capturas fornecidas pelo usuário

As referências foram copiadas do diretório temporário para caminhos estáveis:

- [Anexo 1 — tabela de produtos antes](design/references/refunds-financial-readability/01-products-table-before.png).
- [Anexo 2 — reembolsos antes](design/references/refunds-financial-readability/02-refunds-before.png).
- [Anexo 3 — visão financeira antes](design/references/refunds-financial-readability/03-financial-overview-before.png).

São evidências do problema e do padrão visual escolhido, **não mockups do resultado final**. Não reproduzir a camisa na tabela operacional, os indicadores financeiros misturados nem a coluna de quantidade comprada como se fosse quantidade restante. Valores das capturas são exemplos; não são dados operacionais a inserir.

### 3.2 Achados concretos

1. `productCostRows()` reúne itens originais e adicionais gravados, mas não filtra `shippingQuantity === 0`; expõe quantidade comprada e cálculo líquido da linha inteira.
2. O rodapé de `ProductCostsList` mostra o total geral do acompanhamento. Isso já inclui custos de cancelados, não apenas o subtotal da tabela visível.
3. `RefundsSection` renderiza um `article` por registro de reembolso. Vários registros do mesmo produto repetem o produto; um residual por registro duplicaria custos.
4. O pagamento original mostra base/taxa do pedido original junto de `grossPartialCents` e `receivedRefundCents` de todo o acompanhamento. São escopos distintos colocados lado a lado.
5. A leitura já isola a cobrança original por `orderId`; adicionais não devem substituí-la.
6. A leitura já exclui pedidos substituídos por correções do cálculo e de `productOrders`. Conservar essa exclusão na nova projeção.
7. `refundQuantityCapacity()` no serviço já divide totais exatos em faixas persistidas `unitStart`, usando quociente e resto. Adicionais não podem ser reconstruídos por preço unitário BRL arredondado.
8. `RefundDetails` ainda calcula uma base exibida por `quantity × original*UnitCents`; esse valor pode perder centavos em adicionais. Reutilizar a capacidade exata da nova projeção na apresentação.
9. O cálculo de crédito pessoal agrega recebimentos por componente/item antes do rateio; não mudar isso para rateio isolado por evento.
10. `memberTotals` na leitura observada percorre somente `items` originais. Verificar e cobrir os adicionais antes de afirmar que a divisão pessoal concilia com o total geral.
11. O CSS local observado usa breakpoint de 1100px, enquanto existem testes/referências anteriores usando 1200px. Auditar a cascata real; não copiar pressupostos antigos de viewport.

## 4. Contrato de experiência e hierarquia

Conservar o detalhe em `/packages/[trackingId]`, com as seções atuais Produtos e custos, Pagamentos e reembolsos, Pacotes e Divisão por pessoa. Não criar uma quinta seção primária.

### 4.1 Resumo permanente do custo

No bloco de resumo existente, substituir `Custo líquido atual` por:

```text
Custo da compra até agora                      R$ 27,66
Parcial — há custos pendentes de informar

Produtos que continuam no pedido               R$ 19,27
Custos de itens cancelados                       R$ 8,39
```

Quando tudo estiver resolvido, usar `Custo final da compra` e estado Final. Pagamento pendente de valor já conhecido não transforma custo conhecido em desconhecido. Reembolso solicitado mantém o acompanhamento parcial conforme regra atual, mesmo se os demais valores estiverem resolvidos.

Regras:

- A soma das duas linhas explica o destaque. Não adicionar uma terceira subtração de reembolso: o desconto já foi considerado no custo dos cancelados.
- Sem cancelamentos, omitir a linha de cancelados e a decomposição redundante; manter uma apresentação simples do custo dos produtos.
- Com cancelamentos, mostrar o bloco de cancelados mesmo quando R$ 0,00: zero é informação de resolução, não ausência de dado.
- Se não existe valor conhecido, mostrar `Falta informar`, não R$ 0,00. Conhecido zero deve continuar R$ 0,00.
- Se há solicitação, acrescentar `Reembolso a receber: R$ X. Esse valor ainda está incluído no custo.` O valor não é descontado nem usado como previsão do total.
- Distinguir `Há custos pendentes de informar`, `Há unidades sem pacote`, `Há divisão por pessoa pendente` e `Há reembolso aguardando recebimento`. Não explicar todas as situações com o mesmo texto sobre preço.
- Manter próxima tarefa e estado de custos abertos/encerrados. Custo final não significa acompanhamento encerrado.
- Nenhum total neste bloco recebe o rótulo `A pagar`.

### 4.2 Produtos e custos

Manter o padrão da tabela do anexo 1:

| Produto | Qtd. no pedido | Preço dos produtos | Encargos | Custo atual | Situação e detalhes |
| --- | --- | --- | --- | --- | --- |
| Capa para cordas… · Gabriel · Pedido adicional | 1 | R$ 19,27 | conforme estado conhecido | R$ 19,27 | Parcial · Ver composição |

Especificação:

1. Renderizar somente linhas com unidades restantes > 0. Usar `shippingQuantity` como quantidade que continua no pedido, inclusive para unidades já enviadas/recebidas; o nome técnico não significa que o produto deva sumir após envio.
2. A coluna Preço soma somente o principal de produto das unidades restantes, não inclui China e não exibe o preço bruto das unidades canceladas.
3. Encargos incluem China e taxa de produtos das unidades restantes, mais Brasil/taxa Brasil/Receita atualmente alocados a elas. Mostrar `Parciais` quando faltar componente; conhecido zero continua zero.
4. Custo atual da linha = soma conhecida dos componentes restantes. Não aplicar novamente créditos de cancelados sobre ela.
5. No cancelamento parcial, usar nota discreta `X unidades canceladas · Ver reembolsos`. Não usar `Reembolso recebido` como situação principal do produto que permanece.
6. Estado principal fala das unidades restantes: Completo ou Parcial, com pendências específicas na composição. A pendência de receber do cancelado aparece na seção correspondente, não como cobrança pendente do produto restante.
7. Rodapé: `Subtotal dos produtos no pedido` / `Subtotal parcial dos produtos no pedido`. Somar somente linhas visíveis. Não mostrar R$ 27,66 sob uma tabela que contém só R$ 19,27.
8. Resumo da seção usa quantidade de linhas restantes e unidades restantes; exemplo `1 produto · 1 unidade no pedido`. Contagens históricas ficam nos detalhes e em Reembolsos.
9. Se todos foram cancelados: `Nenhum produto permanece no pedido. Consulte os reembolsos e os custos mantidos abaixo.` Manter ação existente Adicionar produto e caminho para Reembolsos.
10. Linha parcial continua com ações válidas de editar/associar/reembolsar saldo de unidades. Não calcular elegibilidade no cliente ignorando travas do servidor.
11. Associação de pacote, drawer e `Ver composição` usam identidade estável do custo (`costItemId`); não alterar snapshots nem quantidade comprada para ajustar a UI.

Na composição principal, todos os valores ostensivos correspondem às unidades restantes. Se for útil consultar a base histórica integral, colocá-la em bloco explicitamente intitulado `Histórico do item`, sem somá-la ao subtotal restante.

### 4.3 Reembolsos — uma linha por item de custo

Agrupar registros não anulados por `costItemId`, nunca por nome, URL, participante ou categoria. Não unir itens diferentes com o mesmo nome. Um item parcialmente cancelado pode aparecer nas duas tabelas: cada uma representa unidades distintas, e isso deve ser explícito.

Tabela desktop:

| Produto | Qtd. cancelada | Reembolso | Custo mantido | Situação e detalhes |
| --- | --- | --- | --- | --- |
| Camisa Santos Third · Gabriel | 1 | R$ 30,58 recebidos | R$ 8,39 | Recebido · Ver composição |

Na célula Reembolso, distinguir duas linhas se necessário: `Recebido R$ X` e `A receber R$ Y`. Nunca somá-las em um valor sem estado. Na coluna Custo mantido, explicar `Até agora` se houver solicitado; no caso resolvido, detalhar que corresponde ao custo não devolvido.

Estados do grupo:

| Registros ativos | Estado mostrado |
| --- | --- |
| Só requested | Aguardando reembolso |
| Só received, nenhum requested | Recebimento registrado |
| Received e requested | Parte recebida · parte a receber |
| Só voided | Somente em Histórico anulado, fora dos totais ativos |

Não usar `Reembolsado integralmente` só porque o status é received: o recebido pode ser menor ou zero. Para zero, `Recebimento encerrado sem devolução` no registro e custo mantido integral. Se houver vários registros resolvidos, o grupo pode usar `Recebimentos registrados`.

Resumo da seção:

- Contar produtos distintos e unidades canceladas, não chamar número de eventos de número de produtos.
- Total recebido ativo e, separadamente, total solicitado ainda a receber.
- Total de custos de cancelados, rotulado como mantido até agora quando há pendência.
- Uma nota curta: `Só recebimentos confirmados reduzem o custo. Taxas e valores não devolvidos continuam contabilizados.`

### 4.4 Composição de Reembolsos

Ao expandir o grupo, mostrar primeiro a conciliação das **unidades canceladas desse item**, seguida dos registros individuais:

```text
Camisa Santos Third — 1 unidade cancelada
Produto das unidades canceladas                R$ 30,58
Frete China dessas unidades                     R$ 8,00
Taxa do pagamento dessas unidades                R$ 0,39
Recebido de volta                              −R$ 30,58
Custo não devolvido                              R$ 8,39
```

- Com requested, trocar o último rótulo por `Custo mantido até agora` e separar a expectativa a receber; não chamar a expectativa de desconto.
- Com cancelamento parcial, apresentar apenas o principal/China/taxa atribuídos às canceladas, nunca o líquido da linha inteira incluindo remanescentes.
- Não colocar frete Brasil, taxa Brasil ou Receita nesta composição: o fluxo vigente só cancela unidades antes do envio e os encargos de pacote são rateados entre as remanescentes.
- Listar cada solicitação sob a composição agregada, com quantidade, valores solicitados/recebidos por produto e China, destino, autor/data/motivo e histórico de eventos.
- Ações Receber, Editar solicitação, Corrigir e Anular continuam vinculadas ao `refundId` específico. O grupo não tem um novo botão que receba/anule vários registros silenciosamente.
- Mostrar a base exata da faixa de cada registro quando consultada; não multiplicar preço unitário arredondado de adicionais.
- Não repetir a taxa inteira nem o residual inteiro por evento. Taxa e residual do grupo aparecem uma vez.
- Histórico anulado mantém dados e eventos próprios, mas não entra em quantidade, créditos, custo mantido nem contagens ativas. Um produto com só anulados volta à tabela operacional conforme o cálculo, sem pacote restaurado automaticamente.
- Para correção/anulação que o ledger existente bloqueie por crédito já consumido, preservar o bloqueio e sua explicação. A refatoração não cria bypass.

### 4.5 Pagamentos — consulta progressiva e escopo explícito

Dentro de Pagamentos e reembolsos, substituir a faixa de quatro métricas por uma entrada compacta `Ver pagamentos`. Reembolsos permanece visível nessa seção sem exigir abrir o histórico de pagamentos.

Ao expandir Ver pagamentos:

1. `Pedido original — R$ 38,97 — Pago — Pix`, com base de R$ 38,58 e taxa de R$ 0,39 na composição.
2. Cada pedido adicional vigente, identificado, com custo histórico, dinheiro novo e fontes saldo/Pix/cartão pertinentes.
3. Cobranças de frete Brasil e Receita por pacote em consulta compacta ou link focável para o bloco existente do pacote. Não somar essas cobranças duas vezes ao custo.
4. Referência aos reembolsos recebidos, se necessária para a leitura cronológica, com destino e link para a composição do grupo. Esses valores são informativos no histórico; não são um segundo abatimento.
5. Correções de adicionais sob histórico próprio: pedido anterior/substituto e compensações consultáveis, sem incluir ambos nos custos vigentes.

Regras adicionais:

- Um registro original pago continua mostrando o valor integral pago e data/autor originais após request, receive, correct ou void.
- Base/taxa do original vêm de `calculation.productsCharge` e `productsCharge` do pedido original. `totalCostBrlCents` de um original legado sem `paymentComponents` não substitui essa fonte, pois pode não representar a cobrança histórica.
- Adicionais usam `paymentComponents`, `historicalBrlCents`, `principalBrlCents`, `feeBrlCents`, `totalCostBrlCents` e `newMoneyBrlCents` já capturados no seu pedido. Não usar taxa/método do original.
- Não chamar histórico de todas as entradas de `Total pago` se incluir saldo reaproveitado. Não criar um grande total somando entrada do saldo e uso desse mesmo saldo como dois desembolsos.
- Não mostrar seletores/editoração no resumo fechado. Configuração, taxa e confirmação existentes ficam acessíveis na composição da cobrança, conforme estado/travas.
- A próxima tarefa abre `payments`, expande Ver pagamentos e posiciona foco no controle original necessário. Não esconder a ação atrás de expansão que o CTA não consegue abrir.
- Não implementar edição paga adicional por lógica nova: preservar o fluxo auditado do plano 29.
- A entrada Ver pagamentos pode indicar `X cobranças a confirmar` e `Há valores por informar`, derivados por escopo. Não prometer saldo global a pagar desconhecido.

### 4.6 BRL, CNY e origem dos fundos

- Resumo de custo usa BRL histórico; crédito HubBuy é mostrado em CNY como informação separada no recebimento.
- R$ recebido representa redução da base histórica no custo; CNY recebido representa entrada de saldo. Não somar moedas e não converter com referência atual.
- `Saldo recebido neste reembolso` não é `Saldo disponível da conta`: parte pode ter sido consumida depois. Usar os direitos/contas existentes quando for necessário consultar disponibilidade, sem derivá-la por subtração local de uma linha.
- Adicional integralmente com saldo: custo conhecido positivo, dinheiro novo R$ 0,00, taxa externa zero. Exemplo R$ 19,27 continua sendo custo do produto.
- Adicional misto: distinguir base histórica do saldo e principal/taxa externos. O custo inclui ambos; dinheiro novo inclui somente principal externo + taxa externa.
- Não criar total global de dívida entre pessoas. Acertos/adiantamentos já existentes continuam no fluxo do plano 26.

## 5. Contrato financeiro da projeção

Esta refatoração acrescenta uma **partição de apresentação**. O cálculo financeiro existente continua como fonte de verdade do líquido geral, cobrança, crédito e rateio pessoal. Não trocar as regras para fazer a nova UI fechar.

### 5.1 Símbolos e identidades

Para cada item de custo vigente `i`:

```text
Q = quantidade comprada do snapshot vigente
R = refunds do item com status requested ou received
C = soma da quantity de R
S = Q − C = shippingQuantity
P = principal BRL de produto da linha inteira
H = principal BRL de China da linha inteira
F = taxa dos produtos já atribuída à linha inteira
K = encargos conhecidos de pacotes atualmente atribuídos à linha
D = soma de produto + China efetivamente recebidos dos refunds received
E = soma de produto + China solicitados dos refunds requested

P_c, H_c, F_c = parcelas das unidades canceladas
P_s = P − P_c ; H_s = H − H_c ; F_s = F − F_c

custo_restante_i = P_s + H_s + F_s + K
custo_cancelado_i = P_c + H_c + F_c − D
liquido_i = custo_restante_i + custo_cancelado_i
          = P + H + F + K − D

custo_restante_geral = soma(custo_restante_i)
custo_cancelado_geral = soma(custo_cancelado_i)
custo_atual_geral = custo_restante_geral + custo_cancelado_geral
                 = calculation.summary.partialCents
```

Essas fórmulas numéricas valem para componentes conhecidos. Nulos permanecem pendentes; a soma conhecida não prova que o total seja final. `E` não aparece em nenhuma subtração.

Se `C = 0`, todas as parcelas canceladas são zero. Se `S = 0`, todas as parcelas de produto/China/taxa restantes são zero e `K` deve ser zero pela alocação vigente válida. Não esconder inconsistência de pacote com unidades canceladas; preservar erro de domínio.

### 5.2 Partição exata por faixas persistidas

Não usar `Math.round(total * C / Q)`, não arredondar um valor unitário e multiplicar e não distribuir restos conforme ordenação visual.

Para um componente inteiro `T >= 0`, quantidade `Q > 0` e faixa persistida `[start, start + count)`:

```text
b = T div Q
r = T mod Q
range(T,Q,start,count) = b × count
                        + min(start + count, r) − min(start, r)
```

As primeiras `r` posições lógicas recebem um centavo adicional. A implementação existente em `refundQuantityCapacity()` já segue essa regra.

1. Para cada refund ativo, usar `unitStart` e `quantity` salvos. `unitStart` não deve ser reconstituído por ordem de nome/data/id.
2. Validar limites e ausência de sobreposição entre faixas ativas do mesmo item; faixas anuladas não reservam capacidade. As posições são uma convenção financeira já existente, não identificação física/rastreio de unidades.
3. Somar `range(P,...)`, `range(H,...)` e `range(F,...)` das faixas ativas para obter `P_c`, `H_c`, `F_c`.
4. Calcular restantes por complemento, garantindo soma exata, inclusive depois de anular um registro intermediário.
5. Para adicionais, `P/H/F` vêm dos componentes BRL capturados/alocações vigentes, não de `originalProductUnitCents × Q`.
6. Para o original legado com bases unitárias exatas, o resultado coincide com unidade × quantidade; taxa continua vindo do rateio original da linha, não de um novo percentual.
7. Taxa capturada é particionada apenas para a leitura. Não recalcular `F`, a cobrança original nem os snapshots de taxa por participante.
8. Empregar BigInt nos intermediários, limites vigentes de custos e JSON com inteiros seguros. Não gerar array por centavo ou por unidade para implementar uma faixa.
9. Extração recomendada: tornar o helper de faixa uma função pura compartilhada, importável pelo serviço e pela projeção. Os testes do serviço devem provar equivalência antes/depois. Não importar o módulo de serviços/banco no cliente.

### 5.3 Pendências e custo mantido

| Situação | Parcela de cancelados apresentada |
| --- | --- |
| Requested, nenhum recebido | Toda a base cancelada e taxa continuam no custo; expectativa em linha separada |
| Received integral do produto, sem China devolvido | China + taxa ficam no custo |
| Received menor que solicitado | Base cancelada + taxa − recebido real; diferença não vira nova pendência automática |
| Received maior que solicitado, dentro do teto | Usar o recebido final, preservando solicitado no histórico |
| Received zero | Base cancelada + taxa integrais; recebimento resolvido sem devolução |
| Múltiplos requested/received | Somar ativos uma vez; custo mantido até agora enquanto houver requested |
| Voided | Não descontar, não reservar unidades; manter só histórico |

Não denominar custo mantido como `Saldo a receber`, `Dívida` ou perda definitiva enquanto houver solicitado. Não esconder taxa porque principal foi integralmente devolvido.

### 5.4 Rateio por pessoa

O plano não exige decompor cada pessoa em restantes/cancelados na visão principal. Exige que o total pessoal atual existente continue correto e conciliável.

- Preservar parcelas brutas por componente, snapshots originais de participantes e crédito agregado por componente/item.
- Não ratear cada evento separadamente nem usar a nova divisão de unidades para redistribuir créditos pessoais históricos.
- A partição visual da taxa por unidades não muda quem suporta a taxa original.
- Se a divisão pessoal mostrar linha totalmente cancelada, classificá-la como custo de item cancelado, com acesso ao reembolso; não apresentá-la como produto a receber.
- Incluir adicionais vigentes uma vez na agregação pessoal se a lacuna observada ainda existir. Usar `calculation.items[].shares` como referência para total/credito, unindo metadados originais/adicionais por `costItemId`.
- Evitar iterar `detail.items` e também o pedido original de `productOrders`, o que duplicaria os originais.
- Com divisão resolvida: soma dos totais pessoais conhecidos = líquido geral conhecido. Quando houver custo sem divisão, mostrar o montante não distribuído e não inventar parcelas iguais.
- Não impor nova partição pessoal restantes/cancelados por percentuais arredondados: isso poderia produzir centavos divergentes ou parcelas negativas sem mudar o total. Se houver necessidade posterior, será uma matriz de partição própria, fora desta entrega.

## 6. Exemplos obrigatórios e oráculos

Todos os exemplos são sintéticos. Estados de custo de pacote devem ser explicitamente conhecidos/sem cobrança para um total final; unidade sem pacote e pacote vazio pendente mantêm parcial conforme cálculo vigente.

### A. Reprodução dos anexos

```text
Camisa: produto 3.058 + China 800 + taxa 39 = 3.897 centavos
Cancelamento de 1/1; recebido produto 3.058; China recebido 0
Cancelados: 3.897 − 3.058 = 839
Adicional vigente: custo 1.927, integralmente financiado com saldo
Restantes: 1.927
Geral conhecido: 1.927 + 839 = 2.766
Bruto histórico conhecido: 5.824, consultável se necessário
Pagamento original: 3.897, pago e intacto
Dinheiro novo do adicional: 0
```

Aceite visual: camisa ausente dos produtos; cordas presentes por R$ 19,27; subtotal operacional R$ 19,27; reembolso da camisa R$ 30,58; custo mantido R$ 8,39; geral R$ 27,66. Não exibir R$ 27,66 como a pagar. Base original R$ 38,58 e taxa R$ 0,39 só na composição do pagamento original.

### B. Só solicitado no mesmo exemplo

Antes de confirmar o recebimento de R$ 30,58: camisa já ausente da tabela operacional; restantes R$ 19,27; cancelados mantidos até agora R$ 38,97; geral conhecido R$ 58,24; a receber R$ 30,58 em separado. Após received, geral cai para R$ 27,66 sem outra retirada de unidades.

### C. Duas unidades, uma cancelada

`Q=2, P=20.000, H=2.000, F=220`, uma faixa cancelada de quantidade 1, recebido `10.000` de produto e zero de China; sem K:

- Restante: produto 10.000 + China 1.000 + taxa 110 = **11.110**.
- Cancelada: produto 10.000 + China 1.000 + taxa 110 − recebido 10.000 = **1.110**.
- Geral: **12.220**. Tabela operacional mostra quantidade 1, não 2.

### D. Centavos em total capturado adicional

`Q=3, P=100, H=2, F=1`. Capacidades por posição: P `[34,33,33]`; H `[1,1,0]`; F `[1,0,0]`.

Cancelamento `[start=1,count=1]`, recebimento produto 33 e China 1:

- Cancelada: 33 + 1 + 0 − 34 = **0**.
- Restantes: P 67 + H 1 + F 1 = **69**.
- Geral: **69**, bruto 103 − recebido 34.

Não apresentar base do registro como 33 + 0 por multiplicar os pisos unitários. Se depois cancelar `[0,1]` e receber P34/H1, mantido agregado passa a 1 da taxa. Se anular a faixa `[1,1]`, liberar exatamente aquela capacidade, sem deslocar a faixa `[0,1]` nem seus centavos.

### E. Taxa e encargos de pacote não migram para cancelados

Dois itens com P=10.000 cada, China zero, taxa de produtos de 1% (100 por linha). Cancelar um inteiro e receber P10.000. O remanescente recebe Brasil 4.000 + taxa Brasil 40, Receita sem cobrança:

- Restantes: 10.000 + 100 + 4.000 + 40 = **14.140**.
- Cancelados: taxa de produtos **100**.
- Geral: **14.240**. Não transferir esses 100 para a taxa do outro produto.

### F. Devolução menor e zero

Item P10.000/H1.000/F110 totalmente cancelado: received P7.000/H0 → mantido **4.110**; received P0/H0 confirmado → mantido **11.110**, sem a receber. Não chamar nenhum dos dois de devolução integral.

### G. Saldo e misto

Adicional: base histórica de saldo 1.200 + principal externo 800 + taxa externa 8 → custo **2.008**, dinheiro novo **808**. Refunds de outro item não viram um segundo desconto sobre esses 2.008. Mostrar CNY capturado separadamente, sem inventar cotação de hoje.

### H. Todos cancelados e reembolso total do principal

Uma linha P10.000/H0/F100, received P10.000: nenhum produto operacional; cancelados 100; geral 100. Pode encerrar quando não houver solicitação nem obrigação de pacote pendente. Não mostrar estado vazio que esconda a taxa.

## 7. Arquitetura e contrato de dados sugeridos

### 7.1 Estratégia

Acrescentar uma projeção pura server-side após o cálculo e a identificação dos pedidos vigentes. Manter `calculation` compatível: totais, contratos usados por serviços e créditos não mudam. O cliente recebe valores derivados prontos, sem uma segunda implementação financeira em JSX.

Arquivos novos sugeridos:

- `src/lib/domain/package-cost-display.ts`: projeção de itens/restantes/cancelados, capacidades e resumo.
- `src/lib/domain/refund-unit-capacity.ts`: helper puro de faixa, se extraído do serviço.
- `src/components/packages/cost-financial-summary.tsx`: resumo principal, se a extração simplificar a tela.
- `src/components/packages/payment-history.tsx`: consulta progressiva por cobrança/pedido.
- `src/components/packages/refunds-section.css`: estilos locais da nova tabela, compartilhando tokens com a tabela operacional.

São nomes propostos, não arquivos existentes. Não criar todos se uma extração menor mantiver responsabilidades claras.

### 7.2 Forma ilustrativa do DTO

```ts
type KnownMoney = {
  knownCents: number;
  hasKnownAmount: boolean;
  finalCents: number | null;
  pendingReasons: string[];
};

type ItemCostDisplay = {
  costItemId: string;
  orderId: string;
  origin: "purchase" | "additional";
  purchasedQuantity: number;
  remainingQuantity: number;
  cancelledQuantity: number;
  remaining: {
    product: KnownMoney;
    china: KnownMoney;
    productFee: KnownMoney;
    packageCosts: KnownMoney;
    total: KnownMoney;
  };
  cancelled: {
    productCents: number;
    chinaCents: number;
    productFeeCents: number;
    receivedCents: number;
    requestedCents: number;
    retainedCents: number;
    awaitingReceipt: boolean;
  } | null;
};

type RefundDisplayGroup = {
  costItemId: string;
  activeRefundIds: string[];
  cancelledQuantity: number;
  receivedCents: number;
  requestedCents: number;
  retainedCents: number;
  awaitingReceipt: boolean;
};

type CostFinancialDisplay = {
  items: ItemCostDisplay[]; // originais e adicionais vigentes, cada custo uma vez
  refundGroups: RefundDisplayGroup[];
  refundsById: Record<string, {
    productCapacityCents: number;
    chinaCapacityCents: number;
    // capacidade exata para consulta, não novo teto aceito do navegador
  }>;
  summary: {
    remaining: KnownMoney;
    cancelledRetainedCents: number;
    cancelledAwaitingReceipt: boolean;
    current: KnownMoney;
    requestedRefundCents: number;
  };
};
```

Cuidados com o contrato:

- `finalCents` de remaining pode estar resolvido mesmo se existe requested somente na parcela cancelada. Já o total geral mantém o parcial vigente. Não copiar indiscriminadamente `line.totalCents === null` para todas as subparcelas.
- `hasKnownAmount` distingue zero conhecido de ausência de componentes conhecidos. Ausência estrutural de parcelas canceladas/quantidade restante zero não inventa valor financeiro para uma linha desconhecida.
- Nos dados válidos, cancelamento só ocorre com bases e pagamento resolvidos, portanto cancelados usa centavos resolvidos. Se faltar dado legado necessário, não converter para zero: tratar explicitamente inconsistência/fallback parcial.
- IDs e metadados podem referenciar as estruturas existentes em vez de repetir objetos inteiros. Não expor dados privados além do DTO autorizado atual.
- A projeção deve aceitar entradas normalizadas do cálculo e refunds com faixa, não depender de React, DB, `Date.now`, locale, ordenação por nome ou chamadas externas.
- Se adicionar `financialDisplay` ao retorno de `readCostTracking`, rever `CostTrackingView`, fixtures e consumidores. `CostTrackingSummary` é um Pick; incluir o campo só se a lista precisar dele.

### 7.3 Invariantes automáticos de projeção

Para cada item válido e no agregado:

```text
remainingQuantity + cancelledQuantity = purchasedQuantity
remaining conhecido + cancelled retained = partialCents canônico
sum(refundGroups.receivedCents) = refundsSummary.receivedCents
sum(refundGroups.requestedCents) = refundsSummary.requestedCents
sum(refundGroups.retainedCents) = summary.cancelledRetainedCents
sum(linhas visíveis restantes) = subtotal operacional
summary.current.knownCents = calculation.summary.partialCents
summary.current.finalCents = calculation.summary.totalCents
```

Taxa de linha/cobrança e snapshots são idênticos antes/depois da introdução da projeção. Não usar `Math.max(0, ...)` para esconder resultado negativo, `?? 0` para dado histórico ausente ou um valor de ajuste artificial para forçar igualdade. Falha deve ser reproduzida por fixture e corrigida na leitura/partição, sem mutação de dados.

## 8. Mapa de alteração por arquivo e símbolo

As âncoras abaixo foram verificadas no checkout; conferir novamente pois há trabalho local concorrente. Números de linha são deliberadamente omitidos para não ficarem inválidos após extrações.

| Caminho / âncora | Trabalho previsto |
| --- | --- |
| `src/lib/domain/package-cost-calculations.ts` / `calculateCostTracking`, `CostLineInput`, `splitByWeights` | Fonte do líquido, componentes, quantities e shares. Preservar semântica; só expor campos estruturados mínimos se a projeção precisar |
| `src/lib/domain/package-cost-reading.ts` / `readCostTracking` | Normalizar originais + adicionais vigentes, vincular refunds/faixas, criar projeção após cálculo e retornar DTO |
| Mesmo / `supersededOrderIds`, `recordedAdditionalOrderIds`, `calculatedCostItems` | Excluir rascunhos e substituídos; não excluir originais só porque cancelados |
| Mesmo / `productCharge`, `productOrders`, `allocationTotal` | Manter isolamento do original e totais capturados dos adicionais |
| Mesmo / `memberTotals` | Cobrir adicionais uma vez se lacuna persistir; conciliar com shares canônicos sem alterar política de crédito |
| `src/lib/domain/package-cost-services.ts` / `refundQuantityCapacity`, `refundCapacityForPosition` | Possível extração pura da função, com equivalência testada. Não mudar transações, tetos, revisão ou payloads |
| `src/lib/domain/package-refund-calculations.ts` / `allocateRefundCredit`, `refundRequestedQuantity` | Preservar agregação e capacidades pessoais. Não reutilizar partição por evento para créditos pessoais |
| `src/lib/domain/package-cost-presentation.ts` / `packageCostPresentation`, `nextAction` | Contagem operacional, nomes, pendências, alvos de reembolso inclusive adicional e abertura de pagamentos |
| `src/components/packages/product-costs-list.tsx` / `productCostRows`, `productStatus`, `rowTotal`, `RowComposition`, `ProductCostsList` | Filtrar restantes, usar parcelas derivadas e subtotal visível, nota parcial com link a reembolsos |
| `src/components/packages/refunds-section.tsx` / `RefundsSection`, `RefundRow`, `RefundDetails` | Grupos por custo, tabela/mobile, composição agregada e preservação de formulários/ações por registro |
| `src/components/packages/package-cost-detail-screen.tsx` / `PackageCostDetailScreen`, `openNextAction`, `ProgressiveSection` | Resumo, expansão Ver pagamentos, estado/foco após retirada de linha, seção payments e navegação contextual |
| Mesmo / `ItemBreakdownSurface`, detalhes de pessoa/produto | Evitar descrever cancelado como produto a entregar; dados históricos rotulados; preservar consulta fechada |
| `src/components/packages/package-cost-client.ts` / `CostTrackingSummary`, `costRequest` | Compatibilidade do DTO; não alterar parser ou mutações sem necessidade |
| `src/components/packages/packages-screen.tsx` | Termos custo parcial/final coerentes; manter total canônico e link existente |
| `src/components/packages/additional-orders-panel.tsx` e `additional-product-editor.tsx` | Preservar compra adicional, financiamento e correção. Só integrar abertura/consulta necessária |
| `src/components/packages/product-costs.css`, `package-cost-layout.css`, `purchase-cost-header.css`, `src/app/globals.css` | Estilos de tabela, resumo e foco; extrair seletivamente regras de reembolsos. Não refatorar CSS global alheio |
| `src/components/qc/qc-components.tsx` / `QcGalleryButton` e apresentação existente | Reutilizar abertura autorizada da galeria com item original/adicional correto; sem pipeline/slot visual novo |
| `src/components/ui/surface.tsx` / `Surface`, `Confirm` | Reutilizar modais/drawers e confirmações; preservar foco/Escape/mobile |
| `tests/unit/package-cost-presentation.test.ts` | Contagens e CTA; complementar com testes de projeção |
| `tests/integration/package-refunds.test.ts`, `package-refund-hubbuy.test.ts`, `purchase-additional-orders.test.ts` | Estados completos, leitura nova e preservação de pagamentos/ledger |
| `tests/integration/purchase-order-corrections.test.ts` | Pedido substituído não reaparece no resumo nem em produtos/reembolsos ativos |
| `tests/e2e/package-refunds.spec.ts`, `package-costs-hybrid.spec.ts`, `packages.spec.ts`, `hubbuy-balance.spec.ts` | Atualizar expectativas deliberadamente alteradas, mantendo asserts financeiros e fluxos |
| `tests/e2e/additional-product-edit.spec.ts` | Garantir Editar adicional continua acessível após mudança de linha/composição |

Não criar o arquivo inexistente `purchase-cost-order-reading.ts` como se fosse dependência atual: a leitura auditada está concentrada em `package-cost-reading.ts`.

## 9. Execução faseada com critérios de saída

### Fase 0 — baseline e contrato fechado

1. Fazer as leituras da seção 2 e revisar status/diffs reais.
2. Confirmar todas as âncoras e o formato atual de `CostTrackingView`, `unitStart`, componentes e correções. Ler testes existentes antes de escolher fixtures.
3. Identificar consumidores de totais e contagens via `rg`: tabela, resumo, rodapé, lista, pessoas, drawers, próxima ação e E2E.
4. Registrar baseline de typecheck/lint/testes direcionados em ambiente sintético. Falha anterior precisa ter evidência; não tratá-la automaticamente como alheia.
5. Preparar fixtures A–H da seção 6 sem inserir nomes/dados reais em banco do usuário.
6. Conferir o efeito real do CSS em 1099/1100 e 1199/1200px; documentar breakpoint adotado coerente para as duas tabelas.

**Saída:** mapa atualizado, baseline e fixtures. Nenhuma mutação de produção e nenhuma alteração de schema desta feature.

### Fase 1 — partição financeira pura

1. Extrair/reutilizar helper exato de faixas, incluindo validações e limites.
2. Definir entradas normalizadas de componentes e refunds. Evitar dependência em strings de rótulos quando houver campo estrutural; se o cálculo atual só tiver nomes, centralizar a tradução em um único adaptador testado.
3. Implementar partição original/adicional, totais restantes, custo cancelado, agrupamento e capacidades por registro.
4. Separar estado de valor, de quantidade, de reembolso e de pagamento. Não criar um `isPaid` por produto ou `isFinal` global copiado em todos os campos.
5. Validar identidades e limites com testes A–H, múltiplos registros e anulação de faixa intermediária.
6. Demonstrar que o cálculo anterior e seus snapshots permanecem iguais; não adaptar o canônico ao novo resumo.

**Gate:** testes unitários de projeção e de cálculos/reembolsos passam; nenhuma diferença monetária nos cenários sem refunds.

### Fase 2 — leitura e compatibilidade

1. Construir a projeção dentro de `readCostTracking` depois do cálculo, usando somente entidades autorizadas já lidas em lote.
2. Original entra uma vez; adicional somente gravado e não substituído. Rascunho pode continuar no fluxo de criação, fora de totais operacionais.
3. Preservar vínculo exato de `costItemId`, `orderId`, id do produto original/adicional e refunds.
4. Adicionar DTO e atualizar fixtures tipadas. Não fazer cast generalizado para silenciar ausência do campo.
5. Conferir `memberTotals`: corrigir inclusão dos adicionais se necessária, apoiada em shares canônicos e metadados, sem recalcular o crédito do domínio.
6. Provar em integração que uma leitura não produz escritas: revisão, ledger, cobranças, snapshots e eventos permanecem iguais.
7. Cobrir autorização (outsider/outro workspace) no acesso aos dados derivados. Não criar endpoint paralelo nem consulta N+1 por grupo.

**Gate:** integração passa nos estados requested/received/voided, saldo/misto e correção de adicional; total derivado coincide com cálculo existente.

### Fase 3 — produtos restantes

1. Alterar `productCostRows`/consumidores para usar a projeção, sem excluir linhas do DTO canônico usado por refunds e auditoria.
2. Quantidade/preço/encargos/total correspondem às unidades restantes. `rowTotal` não usa mais o líquido integral para item parcialmente cancelado.
3. Atualizar composição, subtotal e contagens. Manter ações existentes e origem adicional.
4. Adicionar navegação `Ver reembolsos` do item parcialmente cancelado, abrindo a seção e grupo corretos.
5. Tratar todos cancelados e item anulado voltando com unidades sem pacote.
6. Resolver retorno de foco: se o trigger da solicitação deixou de existir, focar o grupo de reembolso recém-criado, abrindo payments; não deixar foco no body/elemento removido.

**Gate:** E2E prova saída na solicitação, retorno após anulação e ausência de subtotal misturado. Adicionar/editar/associar produto continua funcional.

### Fase 4 — tabela de reembolsos e composição

1. Substituir artigos individuais principais por grupos/tabela sem alterar os forms e schemas de mutação existentes.
2. Criar equivalente compacto mobile com os mesmos dados; não espremer cinco colunas em 320px.
3. Reaproveitar tokens visuais: borda, superfície de cabeçalho, tipografia, alinhamento numérico, separadores, status textual e toggle de composição.
4. Renderizar valor recebido e a receber separados; custo mantido agregado; grupos ativos estáveis por itemOrder/id. Registros internos seguem ordem persistida estável.
5. Mostrar composição do grupo antes dos registros e suas ações. Conservar dados de solicitado original após received.
6. Histórico anulado recolhido e fora do resumo ativo. Não reaproveitar snapshots anulados para calcular valores atuais depois que o item foi corrigido.
7. Galeria QC continua acessível para cancelados, com identidade correta e autorização existente. Por padrão usar marcador SVG + botão Ver QC nesta nova tabela. As fotos do anexo não autorizam novas capas/miniaturas em Reembolsos. Não expandir a exceção QC das linhas já aprovadas.
8. Preservar formulários abertos/rascunhos/erros em correção, conflito e falha de rede; nunca repetir mutação automaticamente.

**Gate:** E2E cobre um/vários grupos e múltiplos registros do mesmo item, com teclado, pedido adicional e consulta encerrada. Nenhum custo residual duplicado.

### Fase 5 — resumo e pagamentos progressivos

1. Substituir os quatro indicadores misturados; instalar resumo conciliável da seção 4.1 sem replicar vários grandes totais na página.
2. Criar expansão Ver pagamentos, registros originais/adicionais e links de cobranças de pacote.
3. Preservar seleção de método, edição de taxa, confirmação, explicações das travas, autor/data e distinção pendente/sem cobrança.
4. Ajustar `openNextAction` para abrir expansão/grupo antes de focar alvos; CTA de reembolso encontra nome original ou adicional.
5. Manter subtotal dos produtos separado do geral e acesso aos valores históricos, sem perder campos úteis.
6. Garantir custo/novo desembolso/saldo distintos e evitar total de desembolso duplamente contado por uso de crédito.
7. Revisar terminologia da listagem `/packages`, pessoas e drawers diretamente afetados. Não redesenhar áreas sem relação.

**Gate:** exemplo A fecha em todos os pontos da tela, original pago intacto e adicional com saldo mostra dinheiro novo zero. Dados pendentes não aparecem como zero/pago.

### Fase 6 — QA, regressão e entrega

1. Executar matriz da seção 10, gates da seção 11 e inspeção visual.
2. Atualizar seletores deliberadamente alterados nos testes, sem remover cobertura de taxa/pagamento/quantidade/correções.
3. Conferir diff de schema/migrations: esta feature não acrescenta migração. Não remover migrações locais de outras tarefas.
4. Atualizar relatório com arquivos, fórmulas finais, desvios técnicos equivalentes e evidências reais.
5. Acrescentar registro de implementação neste documento e ajustes pontuais nos docs 03/05/06/11/12/15/23 somente quando o comportamento estiver implementado, preservando os aditivos de 26/29. Não declarar pronto na documentação antes dos gates.
6. Entregar instruções de smoke test e limites operacionais. Publicação permanece separada, sem mudanças de dados reais.

**Gate final:** critérios da seção 12 cumpridos, testes e capturas reportados, nenhum custo perdido/duplicado e nenhum snapshot alterado.

## 10. Matriz de testes obrigatórios

### 10.1 Unitários — domínio e apresentação

Arquivo novo sugerido: `tests/unit/package-cost-display.test.ts`. Complementar os arquivos existentes, não duplicar cada teste do cálculo legado.

| Caso | Verificação essencial |
| --- | --- |
| Sem cancelamentos | Restantes = líquido canônico; cancelados zero/ausente; sem regressão de null/zero |
| A e B | 1.927/839/2.766 depois de recebido; 1.927/3.897/5.824 antes |
| C | Quantidade restante 1; subtotal 11.110 e cancelados 1.110 |
| D | Faixas exatas, base correta adicional, sem piso unitário repetido |
| E | Encargos de pacote só restantes; taxa original preservada |
| F | Recebido menor/zero não gera nova expectativa automaticamente |
| Múltiplos refunds do mesmo item | Uma linha/grupo, sem taxa/custo repetido |
| Requested + received | Quantidades sem duplicação; recebido e esperado separados |
| Anulação intermediária | Só faixa anulada volta; centavos das demais não se deslocam |
| Só anulados | Nenhum grupo ativo; item operacional completo; histórico mantido |
| Faixas inválidas/sobrepostas | Erro explícito; não custo ajustado artificialmente |
| Limites e zero | BigInt intermediário, inteiro seguro, Q>0, componente zero sem divisão por zero |
| Ordem visual muda | Totais idênticos após renomear/ordenar, desempate não depende do nome |
| Divisão pessoal com vários centavos | Crédito agregado segue contrato anterior e soma pessoal concilia |
| Pending/no_charge/known0 | Estados distintos e valores conhecidos parciais preservados |
| Pacote vazio pendente | Geral não é declarado final por ausência de linhas físicas |
| Original + adicional + substituição | Originais uma vez, só adicional vigente, sem rascunho ou substituído |
| G | Custo 2.008 e dinheiro novo 808 distintos |
| Todos cancelados | Resumo mantém residual e acesso aos reembolsos |
| Próxima tarefa | Abre seção/expansão/alvo realmente existente, inclusive adicional |

### 10.2 Integração — persistência preservada

Reutilizar fixtures e serviços reais de `tests/integration/helpers.ts`; banco isolado migrado, nunca `.env`/banco remoto implícito.

1. Guardar snapshot antes/depois: `purchase_items`, participantes finalizados, cobrança original (base/taxa/método/bps/status/paidAt/paidBy), componentes de pagamento e eventos existentes.
2. Request remove unidades/alocações pelas regras atuais; nova leitura particiona sem outras escritas. Confirmar received altera somente o que o serviço vigente já deve alterar.
3. Cancelamento parcial conserva conteúdo e custos de pacotes remanescentes; pacote alheio intacto.
4. Received/correct/void atualizam projeção e ledger conforme regras existentes; ação bloqueada não deixa projeção/saldo parcialmente persistido.
5. HubBuy: recebido CNY cria crédito uma vez, consumo por adicional permanece igual, leitura não cria/consome/reverte saldo. Destino externo não cria CNY.
6. Correção de adicional: substituído ausente de quantidades e custo ativo, histórico/compensações íntegros, original inalterado. Não autorizar correção de adicional com refund se o domínio já bloqueia.
7. Compartilhamento: originais/adicionais, participante com peso zero, centavos indivisíveis, sem divisão definida. Totais pessoais + não distribuído conciliam com geral conhecido quando aplicável.
8. Closed: consulta de grupos/histórico funciona; escritas continuam rejeitadas. Reabrir não muda purchase.status.
9. Workspace estrangeiro/outsider: sem leitura de DTO, valores, QC ou nomes privados.
10. Extração de helper não modifica tetos aceitos/rejeitados do serviço. Reexecutar a cobertura de limites e concorrência já existente se tocar esse módulo.

### 10.3 E2E — jornadas e acessibilidade

Novo arquivo sugerido: `tests/e2e/refunds-financial-readability.spec.ts`, ou casos bem separados em `package-refunds.spec.ts`.

1. Preparar compra sintética análoga a A por APIs/serviços de teste com origem válida e sessão local. Abrir detalhe; conferir totais antes da solicitação.
2. Solicitar cancelamento integral. Produto some de Produtos e custos imediatamente, aparece em Reembolsos como aguardando, total ainda bruto. Verificar foco e anúncio de sucesso.
3. Receber produto sem China. Conferir 19,27/8,39/27,66, pagamento original 38,97 pago, adicional com saldo sem dinheiro novo.
4. Expandir composição de reembolso: 30,58 + 8,00 + 0,39 − 30,58 = 8,39. Abrir histórico de pagamento e voltar sem perder expansão.
5. Parcial de duas unidades: produto restante com quantidade e custos restantes, nota de cancelamento abre grupo correto, sem duplicar residual no subtotal.
6. Dois refunds para um item: um grupo, registros e ações separadas, requested/received distinguíveis. Anular registro elegível e verificar retorno das unidades, sem pacote restaurado.
7. Received menor/zero: rótulos honestos e custo preservado. Correção com erro/revisão stale preserva formulário e não repete envio.
8. Todos cancelados: estado vazio correto, reembolsos/QC/histórico acessíveis, residual visível; encerramento respeita pendências de pacote/solicitação.
9. Original e adicional com mesmo nome: identidade/grupos/ações distintos. Adicional corrigido não duplica produto nem pagamento vigente.
10. Próxima ação alcança método/confirmação mesmo com Ver pagamentos fechado; CTA de reembolso alcança grupo adicional.
11. Consulta encerrada sem mutações, com todos os valores e expansão. Editar adicional vigente continua no fluxo existente enquanto aberto.
12. Recarregar a página preserva dados, totais e estados financeiros. Persistência de expansão entre reloads não é requisito novo; preservar apenas o comportamento já existente.
13. Teclado: Tab/Shift+Tab, Enter/Space nos toggles, Escape nos drawers, foco contido e restaurado; painel recolhido sem controles focáveis; foco de trigger removido vai para grupo/heading previsível.
14. Leitor de tela: caption de tabela, th/scope corretos, nome do produto nas ações, status textual, aria-expanded/aria-controls, IDs únicos desktop/mobile e feedback anunciado.
15. Reduced motion: sem dependência de animação para foco/conteúdo; conteúdo continua disponível.

### 10.4 Visual e responsividade

Inspecionar 320, 390, 768, 1024 e 1440px, além dos limites do breakpoint realmente adotado. No mobile, usar lista compacta correspondente à tabela, como já ocorre em Produtos. O padrão aprovado é visual/semântico, não obrigação de uma tabela larga no telefone.

- Sem overflow horizontal de página, números cortados ou nome/motivo longo cobrindo ações.
- Valores com alinhamento/tabular nums e rótulos legíveis; não reduzir tipografia para caber todas as colunas.
- Nome/participantes/variante e flag adicional preservados; uma flag de origem basta.
- Toggles e ações principais com alvos confortáveis, foco visível e sem ações apenas por hover.
- Controles de modal não se misturam à ilha de navegação; safe areas preservadas.
- Nenhuma nova foto de produto fora das superfícies previamente autorizadas; galeria dos cancelados ainda abre.
- Mesmos tokens de borda/cabeçalho/espaçamento nas duas tabelas. Não copiar larguras `nth-child` da tabela de seis colunas para a tabela de cinco colunas sem ajuste local.

Capturas opt-in sugeridas: `LOTI_CAPTURE_REFUND_READABILITY_QA=1`, em `artifacts/qa/refunds-financial-readability/`:

```text
01-requested-desktop.png
02-received-overview-desktop.png
03-refund-composition-desktop.png
04-payments-expanded-desktop.png
05-partial-cancellation-desktop.png
06-multiple-refunds-desktop.png
07-all-cancelled-desktop.png
08-received-mobile-320.png
09-received-mobile-390.png
10-pending-mobile-390.png
11-refund-composition-mobile.png
12-closed-readonly.png
```

Usar mídia QC simulada/fixtures autorizadas, sem acessar storage remoto. Capturas não substituem asserts; inspecioná-las e registrar o que foi conferido.

## 11. Comandos de validação e ambiente

Os nomes novos abaixo devem corresponder aos arquivos efetivamente criados. Ajustar a lista se houver outra divisão de testes e documentar o comando real.

### 11.1 Gates direcionados

```text
npm run typecheck
npm run lint
npx vitest run tests/unit/package-cost-display.test.ts tests/unit/package-cost-calculations.test.ts tests/unit/package-refund-calculations.test.ts tests/unit/package-cost-presentation.test.ts
npx vitest run tests/integration/package-refunds.test.ts tests/integration/package-refund-hubbuy.test.ts tests/integration/purchase-additional-orders.test.ts tests/integration/purchase-order-corrections.test.ts
npx playwright test tests/e2e/refunds-financial-readability.spec.ts tests/e2e/package-refunds.spec.ts tests/e2e/package-costs-hybrid.spec.ts tests/e2e/packages.spec.ts tests/e2e/hubbuy-balance.spec.ts tests/e2e/additional-product-edit.spec.ts
```

Depois dos incrementos direcionados, executar uma vez o gate completo pertinente:

```text
npm run check
npm run test:e2e
```

`npm run check` já executa typecheck + lint + Vitest completo + build. Não repetir o mesmo gate sem mudança/falha que justifique. Se o módulo transacional for tocado para extrair helper, incluir testes existentes de concorrência/refund no gate direcionado antes do completo.

Há registros de falha intermitente de cache SSR do Vitest em Windows com paralelismo. Somente diante dessa falha, repetir a suíte com um worker (`npm test -- --maxWorkers=1`), preservar o log original e relatar a limitação. Não ignorar falhas de assertion como se fossem ambiente.

### 11.2 Banco e servidor de teste

- Testes usam libSQL local/em memória ou banco descartável específico, com migrações existentes. Não executar scripts apontando implicitamente para credenciais reais.
- Conferir `scripts/e2e-server.ts` e `playwright.config.ts`: configuração auditada usa porta 3100, um worker, `reuseExistingServer: false`. Não matar nem reutilizar servidor do usuário.
- Se a porta/build estiver ocupado por outra tarefa, usar configuração temporária local própria com porta, diretório Next e banco exclusivos, mantendo baseURL/Origin consistentes. Não editar a configuração compartilhada só para competir pela mesma porta.
- Não introduzir migração desta feature. A preparação do banco descartável aplica explicitamente as migrações já presentes, inclusive as locais de outras tarefas de que o checkout depende.
- Build com variáveis sintéticas adequadas; não imprimir secrets nem alterar `.env` do usuário. Verificar scripts para impedir que dotenv selecione acidentalmente um alvo remoto.
- Para remover temporários, fechar conexões/processos e conferir caminho absoluto contido no diretório descartável; usar um único shell e operações nativas seguras.
- Não iniciar validação autenticada em produção. Credenciais reais não são necessárias para implementar e validar esta mudança.

## 12. Critérios finais de aceite

- [ ] Produto totalmente cancelado não aparece em Produtos e custos, desde requested.
- [ ] Cancelamento parcial mostra somente quantidade/preço/encargos/custo das unidades restantes.
- [ ] Tabela de Reembolsos usa padrão visual coerente e agrupa por item, com ações por registro.
- [ ] Recebido e a receber são visivelmente distintos e não somados sem estado.
- [ ] Custos não devolvidos continuam contabilizados e sua composição é compreensível.
- [ ] Enquanto há requested, o custo mantido é apresentado como atual, sem afirmar perda definitiva.
- [ ] Subtotal de produtos soma somente a tabela visível; custo geral inclui cancelados uma vez.
- [ ] Exemplo dos anexos apresenta R$ 19,27 + R$ 8,39 = R$ 27,66 após recebido.
- [ ] Antes do recebido, exemplo apresenta R$ 19,27 + R$ 38,97 = R$ 58,24, com R$ 30,58 a receber separado.
- [ ] Pagamento original R$ 38,97 continua pago, com base R$ 38,58 e taxa R$ 0,39 preservadas.
- [ ] Nenhum total de custo é chamado de a pagar; adicional com saldo distingue custo e dinheiro novo.
- [ ] CNY, BRL histórico, crédito recebido e saldo disponível não são confundidos.
- [ ] Todos cancelados mantém acesso a custos, reembolsos, histórico e pendências reais.
- [ ] Anulação libera a faixa correta sem apagar eventos/restaurar pacotes e sem deslocar centavos de outras faixas.
- [ ] Múltiplos refunds não repetem taxa/residual nem alteram o rateio agregado de crédito pessoal.
- [ ] Adicionais vigentes entram uma vez; substituídos/rascunhos não entram no custo ativo.
- [ ] Pessoas conciliam com geral conhecido ou exibem explicitamente o custo sem divisão.
- [ ] Próxima tarefa, foco, drawers, edição, QC existente e consulta encerrada continuam funcionais.
- [ ] Responsividade e teclado validados com capturas inspecionadas.
- [ ] Testes/gates documentados com resultados reais, sem números herdados de outro plano.
- [ ] Nenhuma alteração em snapshots finalizados, valores persistidos, schema ou produção por esta refatoração.

## 13. Riscos concretos e como resolvê-los

| Risco | Tratamento obrigatório |
| --- | --- |
| Só esconder a linha cancelada perde a explicação do custo | Particionar antes da UI e mostrar cancelados no resumo e na composição |
| Tirar item de `detail.items` quebra refunds/auditoria | Filtrar apenas a projeção operacional; manter dados canônicos completos |
| Principal/taxa da linha inteira usados na linha parcial | Consumir parcela restante derivada, sem recalcular a cobrança |
| Cada refund replica o residual | Grupo por costItemId, residual/taxa uma vez |
| Bases adicionais não divisíveis por Q | Faixas exatas com quociente/resto e unitStart persistido |
| Requested tratado como desconto | Expectativa separada, custo só reduz em received |
| Pagamento antigo trocado por adicional | Isolar original por orderId e usar snapshots/fontes próprios |
| Uso do saldo contado como novo pagamento | Diferenciar custo histórico e dinheiro novo; sem grande total duplicado de desembolso |
| Foco retorna a produto que sumiu | Abrir/focar grupo de reembolso ou heading previsível |
| CSS compartilhado de seis colunas afeta nova tabela | Tokens comuns, estrutura/larguras específicas e QA de breakpoint |
| Nova aparência remove ação financeira bloqueada | Conservar forms, revisão, confirmações e erros de domínio |
| Docs divergem de QC existente | Preservar escopo previamente autorizado; não usar este plano como autorização de imagem nova |
| Trabalho local concorrente muda símbolos | Reinspecionar diff antes de cada fase e integrar sem sobrescrita |

## 14. Handoff operacional e mensagem pronta para o executor

Ao concluir, entregar: resumo de comportamento, arquivos alterados por esta tarefa, oráculos financeiros conferidos, comandos/resultados reais, capturas inspecionadas, limitações encontradas e ausência de migração desta feature. Se algum gate não puder executar, informar qual, por quê e o que falta; não afirmar validação completa.

Smoke local: entrar com usuário sintético → acompanhamento com produto pago → solicitar integral → conferir saída operacional sem desconto antecipado → registrar recebimento → conferir residual e geral → consultar pagamento original → adicionar com saldo/misto → conferir custo vs dinheiro novo → testar parcial/zero/anulação elegível → consultar encerrado.

Publicação futura depende de autorização específica. Esta mudança de apresentação não demanda migração própria nem entrada automática de dados reais. Se o checkout contiver migração de outra feature ainda não aplicada, coordenar essa dependência separadamente; não tratá-la como migração da refatoração.

> Implemente `docs/30_REFUNDS_FINANCIAL_READABILITY_PLAN.md` sobre o checkout atual, lendo primeiro AGENTS.md, PROMPT_ONE_SHOT.md, docs canônicos e handoffs indicados. Preserve alterações locais de outras tarefas. A experiência está aprovada: produtos restantes na tabela operacional, cancelados agrupados em Reembolsos, custo atual conciliado entre restantes e custos mantidos, pagamento original em consulta progressiva. Comece pela projeção financeira exata e seus testes; depois integre leitura, tabela operacional, reembolsos e pagamentos. Use as faixas unitStart persistidas e as bases históricas exatas dos adicionais; não altere cálculos, cobranças, crédito pessoal, ledger ou snapshots para ajustar a apresentação. Execute as fases autonomamente, valide os exemplos e a matriz, preserve acesso a ações e foco e entregue capturas desktop/mobile e evidências reais dos gates. Não publique, não migre produção, não configure recursos externos nem registre dados reais. Não amplie o escopo de imagens QC.

## 15. Registro desta etapa de planejamento

- Inspeção estática de componentes, leitura/cálculo/serviços, testes existentes, documentação e estado Git.
- Três referências do usuário preservadas no repositório para não depender de arquivos temporários.
- Plano e entrada no índice documental; nenhuma implementação iniciada.
- Validação desta etapa limitada à integridade documental e referências locais. Lint/typecheck/Vitest/Playwright/build da aplicação serão executados pelo agente de implementação, não foram reivindicados aqui.
