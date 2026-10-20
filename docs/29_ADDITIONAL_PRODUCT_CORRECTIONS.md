# Edição de produtos de pedidos adicionais

Autorização: 20/10/2026, nesta conversa. O usuário pediu reutilizar a ação
**Editar** dos produtos normais e confirmou edição dos custos pagos com
correção financeira. Implementação local; sem autorização de produção.

## Fluxo

Pacotes e custos → composição do produto adicional → **Editar** → corrigir
dados e pagamento observado → informar motivo → conferir a prévia →
confirmar correção. A interface usa o mesmo `ProductCostActions` dos produtos
originais, tanto na tabela quanto nos cartões mobile.

São editáveis nome, link, variação, observações, quantidade, totais CNY de
produto/China, modalidade/proporções entre as pessoas originais e fontes do
pagamento. CNY é total da linha, não preço unitário. Saldo carrega a base BRL
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
