# Edição de produtos de pedidos adicionais

Autorização: 20/10/2026, nesta conversa. O usuário pediu reutilizar a ação
**Editar** dos produtos normais e confirmou edição dos custos pagos com
correção financeira. Implementação local; sem autorização de produção.

## Fluxo

Pacotes e custos → composição do produto adicional → **Editar** → corrigir
dados e pagamento observado → informar motivo → conferir a prévia →
confirmar correção. A interface usa o mesmo `ProductCostActions` dos produtos
originais, tanto na tabela quanto nos cartões mobile.

São editáveis nome, link, variação, observações, quantidade, preço do produto em
CNY, frete China total, modalidade/proporções entre as pessoas originais e fontes do
pagamento. O formulário usa preço por unidade por padrão e mostra quantidade ×
preço = total; permite informar explicitamente o total das unidades. O frete China
é sempre o total da linha. API e persistência continuam recebendo totais CNY.
Saldo carrega a base BRL
histórica; principal externo, conversão efetiva e taxa são informados novamente.
Saldo alheio exige direcionamento explícito. Participantes originais são mantidos.

O usuário declara que corrige um registro incorreto. Devolução real continua
no fluxo de reembolso. A prévia mostra custo anterior/corrigido, saldo antes/
depois, base histórica, principal externo e taxa; não persiste nenhuma alteração.

## Persistência e compensação

- Migração aditiva `0020_white_maginty.sql`: relação append-only
  `purchase_order_corrections`, com pedido anterior, substituto e operação.
- O pedido pago anterior, seus produtos, custos, componentes, parcelas e
  consumos continuam imutáveis. Não se remove nenhuma trava antiga.
- Uma operação motivada compensa o débito original com crédito novo para cada
  titular original, usando os CNY e a base histórica exatos consumidos.
- Um pedido substituto captura os dados corrigidos e um novo pagamento usando
  as validações existentes de FIFO, direitos individuais e taxa externa.
- Somente o substituto entra nos custos/unidades operacionais. O anterior
  continua consultável no histórico de correções, incluindo valores/fontes/taxas.
- Adiantamentos ainda não acertados do pagamento substituído deixam a projeção
  ativa pelo vínculo de correção. Só são recriados por nova autorização explícita;
  não se usa o tipo `reversal` de financiamento, que já tem outra semântica.
- As alocações em pacotes abertos são transferidas às novas ocorrências,
  incrementando revisão/evento de conteúdo. Encargos e pagamentos do pacote não
  são apagados. Unidades extras ficam sem pacote; reduzir abaixo do já alocado
  exige retirar antes as unidades excedentes.
- Associações e capa QC existentes acompanham a nova ocorrência na mesma
  transação. Fotos, objetos privados e conteúdo do histórico finalizado não mudam.
- Pagamento, taxa, bases e snapshots da compra original permanecem intactos.

Compensação, substituição, pagamento, ledger, direitos, pacotes, QC, auditoria e
revisões são uma única transação. Idempotência persistida permite reconhecer
confirmações repetidas e respostas perdidas, inclusive após encerramento.

## Dependências protegidas

O servidor rejeita correção em acompanhamento fechado, revisão stale, conta
inativa/divergente, pedido original/estrangeiro/já substituído, divisão inválida,
pagamento sem cobertura, reembolso não anulado, pacote enviado/recebido/selado
ou adiantamento com acerto/compensação posterior. A correção comum não inventa
reversão de acerto externo. Motivo e confirmação são obrigatórios.

O pagamento abrange o pedido inteiro. Quando há mais de um produto, os demais
dados/proporções são copiados, e a prévia/pagamento corrigido cobrem o conjunto.
Não se misturam contas ou acompanhamentos.

## Validação e operação

Testes em `purchase-order-corrections.test.ts` cobrem prévia sem escrita, saldo,
Pix, misto, correção repetida, direitos, adiantamento explícito, pacotes, QC,
snapshot original, idempotência, autorização, limites e rollback injetado.
Concorrência usa processos independentes e banco descartável em WAL; o driver
libSQL local apresentou contenção de commit com journal rollback. Retry é limitado
a SQLite BUSY; revisão e idempotência continuam decidindo o resultado.

`purchase-order-correction-migration.test.ts` verifica upgrade 0019 → 0020,
reaplicação, preservação de dados e FKs. A jornada Playwright
`additional-product-edit.spec.ts` verifica ação existente, cancelamento, prévia,
confirmação, reload, saldo e cobrança original, com desktop/mobile. Capturas
opt-in: `LOTI_CAPTURE_CORRECTION_QA=1`, pasta
`artifacts/qa/additional-product-edit/`.

Publicação futura requer backup recuperável, migração explícita do alvo
autorizado, verify e versão compatível sem escritores antigos concorrentes.
Depois da primeira correção, versões anteriores ignoram a substituição e não
podem voltar a receber tráfego: contariam os dois pedidos. Não fazer rollback
isolado do código; preferir correção em frente ou restauração coordenada.
Não registrar correções reais automaticamente.

### Resultado dos gates locais — 20/10/2026

- Typecheck e lint passaram, sem avisos de código.
- Suíte completa: **302 passaram, 7 ignorados**, 42 arquivos passaram e 1 foi
  ignorado. Inclui upgrade, rollback injetado e concorrência multiprocesso.
- Build passou com segredo efêmero de teste e libSQL em memória, sem usar
  credenciais reais. O sandbox recebeu EPERM em `.next`; a verificação final
  fora dele passou. Nenhum arquivo de ambiente foi editado.
- Playwright: **1 cenário Chromium passou**, em build de produção local,
  com banco exclusivo descartável e viewports 1440, 390 e 320 px. O primeiro
  teste em desenvolvimento revelou um seletor que ignorava o nome acessível
  completo do botão; o seletor foi corrigido. Nenhum comportamento da aplicação
  foi removido para contornar o teste.
- Migração explícita + `db:verify` em banco descartável: 48 tabelas verificadas,
  54 triggers e zero violações FK. Upgrade/reaplicação também passaram.
- Capturas desktop/mobile inspecionadas; prévia focada ao concluir o cálculo,
  controles de confirmação acessíveis e ausência de overflow em 320/390 px.
- `git diff --check` passou. Trabalho anterior de interface/QC foi preservado.

Sem publicação, migração remota, alteração de contas/saldos reais ou
configuração de infraestrutura. A migração do ambiente utilizado pelo usuário
permanece um passo operacional explícito antes de ativar este código.

### Correção de preço por unidade — 20 de outubro de 2026

Inclusão, edição de rascunho e correção paga compartilham a entrada de preço:
duas unidades a ¥18,06 geram produto total ¥36,12, somado ao frete China total
informado. A composição explicita unitário, quantidade e total. A conversão usa
inteiros/BigInt com limite financeiro; pagamento, saldo, rateio e refunds continuam
consumindo os totais existentes, sem multiplicação adicional no domínio.

Ao reabrir um registro, um total divisível pela quantidade recupera o unitário
exato; os demais abrem no modo total, preservando cada centavo. Trocar para
unitário quando não há divisão exata exige informar um novo preço. Nenhum dado
antigo é recalculado automaticamente; corrigir valores reais exige o fluxo pago
motivado e a confirmação do pagamento observado. Produtos normais mantêm seus
cálculos unitários. Esta mudança não exige schema/migração ou publicação.

O drawer de inclusão também permanece montado quando o primeiro produto é
confirmado em um acompanhamento sem unidades restantes (por cancelamentos),
permitindo continuar para a associação ao pacote. O teste de saldo usa a
composição agrupada de reembolsos da interface atual.

Validação local desta correção: typecheck, lint e build passaram; 44 testes
direcionados passaram. A suíte completa executou 381 testes: 372 passaram,
7 foram ignorados e 2 falharam com SQLite BUSY nos cenários multiprocesso
de correção paga e descarte de conta (`purchase-order-corrections.test.ts` e
`hubbuy-account-deletion-concurrency.test.ts`). Esses serviços não foram
alterados por esta correção; o primeiro já falhava na investigação. Não
considerar o gate global aprovado enquanto essas pendências persistirem.

Chromium: `additional-product-edit.spec.ts` e `hubbuy-balance.spec.ts` passaram
com o build local de produção e bancos descartáveis exclusivos. Cobertura:
preço total histórico não divisível, cancelamento sem escrita, correção paga,
2 × ¥18,06, alternância unitário/total, edição de rascunho para 3 e 2 unidades,
pagamento misto, recarga, preservação da cobrança original e associação do
primeiro produto após cancelamentos. Seletores antigos de reembolso/etiqueta
foram alinhados à interface atual. Capturas inspecionadas em
`artifacts/qa/additional-product-edit/unit-price-{320,390,1440}.png` e
`correction-preview-{desktop,mobile}.png`; sem overflow nos tamanhos verificados.
Nenhuma publicação, migração ou alteração de dados reais foi executada.

### Correção do consumo FIFO ao editar frete — 20 de outubro de 2026

O pagamento distribui saldo entre produtos e frete China sequencialmente. Um
lote esgotado pelo produto permanecia na lista em memória e gerava um consumo
CNY zero ao calcular o frete seguinte, rejeitado pelo CHECK
`hubbuy_consumption_cny`. O cálculo FIFO agora ignora lotes sem CNY disponível;
consumos positivos com base histórica BRL zero continuam válidos.

A regressão unitária cobre lotes esgotados e a integração reproduz uma segunda
correção paga com frete China, prévia sem escrita, fechamento dos valores CNY/BRL,
saldo restante, cobrança original preservada e replay idempotente. A correção é
de código, sem alteração de schema ou necessidade de migração. A publicação
continua sendo uma ação operacional separada.

Validação local: regressão reproduzida antes do ajuste; 25 testes direcionados
passaram (o caso multiprocesso foi excluído dessa execução), typecheck, lint e
build passaram. Suíte completa: 375 passaram, 7 ignorados e 1 falhou no caso
preexistente de confirmações em processos independentes com `SQLITE_BUSY`.
O gate global permanece com essa pendência; ela não é o CHECK de consumo zero.
