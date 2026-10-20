# Taxa original após adicionar produto

## Causa

`readCostTracking` indexava cobranças de produto pela chave
`purchase:products`, ignorando `order_id`. Como cada pedido adicional também
possui uma cobrança de produtos sem `package_id`, ele podia substituir a
cobrança original na leitura. Um adicional só com saldo tem método e taxa
nulos na cobrança e taxa zero nas fontes capturadas; esses campos acabavam
sendo usados para apresentar e calcular o pagamento original.

O registro original não é apagado por essa leitura. Não é necessário migrar
ou regravar os dados para corrigir esse caso. Dados reais não foram acessados.

## Correção

- A cobrança original é selecionada pelo ID do pedido de tipo `original`.
- O índice por pacote contém somente cobranças vinculadas a pacotes.
- Edição de custos e leitura da cobrança para reembolso usam o pedido do item,
  sem depender da primeira cobrança de produtos encontrada no acompanhamento.

## Regressão

`tests/integration/purchase-additional-orders.test.ts` reproduz camisa de
R$30,58 + China R$8,00 + Pix 1% confirmado (R$0,39), seguida por adicional
de R$19,27 pago integralmente com saldo e sem China. Verifica a cobrança
original completa (inclusive autor/data/status), cálculo original, taxa do
item, adicional sem taxa nova e total parcial R$58,24 após nova leitura.
Também verifica a preservação enquanto o adicional ainda é rascunho.

A correção é de código, sem alteração de schema, publicação ou operação em
produção. Alterações preexistentes de interface/QC e outros trabalhos foram
preservadas.

## Validação local

- Typecheck, lint e build passaram.
- Suíte completa serial com threads: 293 passaram, 7 ignorados (40 arquivos
  passaram e 1 ignorado). A execução padrão apresentou o erro de cache SSR
  temporário `ENOENT` já documentado no plano 26; a repetição serial passou.
- Gate direcionado a pedidos adicionais, custos, refunds, refunds HubBuy e
  cálculos: 39 testes passaram em 5 arquivos.
- Não houve mudança de schema nem execução E2E nesta correção de domínio.
