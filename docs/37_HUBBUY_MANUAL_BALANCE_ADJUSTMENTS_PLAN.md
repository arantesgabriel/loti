# Plano de implementação — créditos e ajustes manuais HubBuy

Data: **21/10/2026**. Status: **implementação local; validação final em andamento**.

Base inspecionada: commit `541275a`, checkout sem alterações ao iniciar a investigação. Pedido: permitir registrar o bônus da roleta e outros ajustes comprovados sem divergir saldo, direitos individuais ou custos históricos. Este documento propõe o contrato completo para implementação posterior; não registra valores reais, não executa migrations e não autoriza publicação.

## 1. Resultado esperado e decisões propostas

Em **Contas HubBuy → conta selecionada → Ações → Registrar crédito/ajuste**, um membro registra uma entrada ou saída efetivamente ocorrida, sua origem, data, justificativa e pessoas afetadas. O servidor cria lançamentos auditáveis e atualiza a projeção do saldo na mesma transação.

Para o caso apresentado:

- Natureza: **Bônus promocional**; descrição: **Bônus da roleta HubBuy**.
- Entrada de **¥1,14**: `amountCnyMinor = 114`.
- Base histórica **R$0,00**: `historicalBrlCents = 0`, fixada pelo servidor.
- Titular escolhido explicitamente; a pessoa que registra não se torna dona automaticamente.
- Referência da transação pode ser transcrita pelo usuário. A captura não identifica o cadastro da conta, não confirma sua titularidade e não autoriza gravar o evento real.
- Saldo posterior esperado = saldo registrado anterior + ¥1,14. O saldo ¥610,66 mostrado no comprovante não deve substituir o saldo do Loti nem ser presumido como saldo atual da conta.

Políticas recomendadas para esta extensão:

| Operação | CNY | Base histórica BRL | Titularidade |
| --- | --- | --- | --- |
| Bônus promocional | Entrada positiva | Sempre zero | Uma pessoa ou parcelas explícitas |
| Outro crédito documentado | Entrada positiva | Conhecida, explícita, inclusive zero | Parcelas CNY/BRL explícitas |
| Ajuste de saída documentado | Saída positiva | Derivada dos lotes consumidos | Valores CNY explícitos por pessoa |
| Anular lançamento manual | Movimento oposto ao original | Exatamente a base original | Mesmas pessoas; sem redistribuição |

Outro crédito exige explicar sua origem e base. Não é um atalho para reembolso, recarga/pagamento externo ou transferência entre pessoas/contas. Ajuste de saída serve para uma baixa externa comprovada que não pertença a um pedido já registrado no Loti; não corrige o histórico de um produto, nem cria despesa de produto automaticamente. A interface deve explicar essa consequência antes de confirmar.

Essas políticas são propostas deste plano, incluindo saídas e anulações; não reinterpretam D1–D3 como caixa coletivo. Não há decisão humana pendente para escrever/testar uma implementação sintética com esse contrato. A titularidade e os dados de qualquer lançamento real continuam sendo informados no uso do formulário.

## 2. Evidências no código atual

| Arquivo/símbolo inspecionado | Constatação e consequência |
| --- | --- |
| `src/lib/db/schema.ts`: `financialOperations`, `hubbuyBalanceEntries`, `hubbuyBalanceCreditShares`, `hubbuyBalanceConsumptions` | Operações, lançamentos, parcelas e consumos já existem. `manual_adjustment` já é uma origem permitida. Valores são inteiros; base BRL zero é válida. Reutilizar esse ledger. |
| `src/lib/domain/hubbuy-balance-services.ts`: `calculateLedgerState()`, `calculateHubBuyBalanceState()` | Saldo deriva de créditos menos débitos; direitos derivam de parcelas menos consumos. Um débito sem consumos deixa a conta não conciliada. Saldo cache precisa fechar com o ledger. |
| Mesmo serviço: `recordReconciliationEvent()` e `reconcileAccount()` | `manual_adjustment` hoje é usado na reconstrução legada. Esses métodos rejeitam contas ativas. Não remover essa validação para acomodar bônus. |
| Mesmo serviço: `getAccountBalance()`, `readStatement()` | Ponto de leitura dos direitos e extrato paginado por sequência. Extrato já traz motivo, tipo da operação e datas, mas falta descrição tipada de ajuste, referência, autor e vínculo de anulação no DTO público. |
| `src/app/api/hubbuy/accounts/[accountId]/route.ts` | POST só admite conciliação, ativação zero, arquivamento e exclusão. Ainda não existe comando de ajuste ativo. Preservar origin check, sessão e headers privados. |
| `src/components/packages/hubbuy-accounts-panel.tsx` | Possui menu Ações, carregamento de conta/direitos/extrato, revisão e `costRequest()`. `hasActions` precisa incluir ajuste. O rótulo “Ativa e conciliada” hoje depende só de `status`, sem conferir a resposta de conciliação. |
| Mesmo painel: renderização do extrato | Fallback compara `sourceType === "refund"`, mas a origem persistida é `refund_received`. Corrigir no mapeamento compartilhado da apresentação. |
| `src/lib/domain/hubbuy-rights-presentation.ts`: `describeOrigin()` | Todo `manual_adjustment` é apresentado como conciliação. Um bônus ficaria com origem incorreta sem enriquecer a leitura. |
| `src/lib/domain/hubbuy-balance-calculations.ts`: `previewFifoConsumption()`, `allocateFunding()` | Consumo carrega BRL histórico, inclusive zero. PIX/cartão com CNY positivo exigem principal BRL positivo; saldo não tem essa exigência e tem taxa zero. |
| `src/lib/domain/purchase-cost-order-services.ts`: `recordMixedPaymentInTransaction()` | Pagamento usa lotes e direitos persistidos, reserva saldo próprio/direcionado e grava consumos e adiantamentos. Bônus deve entrar nesse mesmo caminho. |
| `src/lib/domain/package-cost-services.ts`: `assertRefundRangeAmounts()`, `requestRefund()`, `updateRefundRequest()` | Solicitação com BRL total zero é rejeitada, inclusive quando o item foi pago com saldo de base zero. Recebimento adicional já trabalha com capacidades CNY e base histórica por fonte. |
| `src/lib/db/schema.ts`: `cost_refund_requested_amounts`; `drizzle/0011_refund_hubbuy_credits.sql` | Banco também exige solicitação BRL positiva. Só ajustar formulário/serviço não resolve o cancelamento de compra financiada inteiramente com bônus. |
| `src/components/packages/refunds-section.tsx`: `RefundRequestSurface()` | `valid` exige produto + China em BRL maior que zero. Pedido, detalhes e resumo precisam reconhecer solicitação nativa com BRL zero. |
| `src/lib/domain/purchase-order-corrections.ts` | Já restaura saldo em novos créditos com base e titulares originais. É referência de compensação, sem editar consumos antigos. |
| `src/lib/domain/hubbuy-account-lifecycle.ts`; migrations 0018/0019 | Exclusão e descarte incorreto têm proteções também no banco. Operações manuais reais devem impedir descarte de cadastro, mesmo após anulação. |
| `src/lib/domain/transaction-lock.ts` | Serializa apenas o processo local. Revisão, transação, unicidade e testes em conexões/processos independentes continuam necessários. |

## 3. Escopo e invariantes

1. Qualquer membro autorizado do workspace pode registrar e anular ajustes, como nas operações colaborativas atuais. Não introduzir função de administrador nem reutilizar a autorização exclusiva do gestor QC.
2. Apenas contas existentes, ativas, não excluídas, conciliadas e com saldo cache igual ao ledger recebem novas mutações. Contas arquivadas/reconciling não são recuperadas implicitamente.
3. Não aceitar edição direta de `balanceCnyMinor`. A entrada é uma diferença documentada, nunca “definir saldo final”. Divergência interna exige investigação, não ajuste para escondê-la.
4. Nenhuma escrita em compra finalizada, favorito, preço original, taxa capturada, pagamento confirmado, manifesto, pacote ou refund por consequência direta do ajuste.
5. CNY e BRL em inteiros, limite existente `MAX_FINANCIAL_MINOR`; intermediários e somas com `BigInt`. `null` não significa zero. JSON recebe apenas inteiros seguros.
6. Soma das parcelas CNY e BRL de entrada fecha com o lançamento; saída fecha com os consumos e não excede os direitos das pessoas selecionadas. Saldo global suficiente não autoriza consumir direito de outra pessoa.
7. Bônus não gera taxa, cotação, dinheiro novo pago, renda/lucro, desconto retroativo ou crédito negativo de produto. Quando consumido, transfere base BRL zero ao novo pagamento.
8. Data de ocorrência é metadado auditável. Inserir lançamento tardio na próxima sequência do ledger; não reordenar FIFO ou saldos após pela data externa.
9. Nenhum lançamento confirmado pode ser editado/apagado. Correção usa anulação compensatória e novo registro; um crédito parcialmente consumido não pode ser anulado pela operação comum.
10. Não há integração HubBuy, upload de comprovante, OCR, câmbio automático, recarga externa com taxa, transferência, notificação, novo dashboard ou alteração de QC.

## 4. Persistência proposta

### 4.1 Ledger existente

Para ajuste original, manter `sourceType = manual_adjustment`, `sourceId = manual-adjustment:<id>`, `reversalOfEntryId = null`. Para anulação, usar `sourceType = reversal` e `reversalOfEntryId` apontando ao lançamento original. Não ampliar o enum de origem do ledger nem reconstruir suas tabelas sem necessidade.

Tipos novos em `financial_operations.operation_type`:

- `account_manual_credit_recorded`;
- `account_manual_debit_recorded`;
- `account_manual_adjustment_reversed`.

Preencher `actorId`, `occurredAt`, `recordedAt`, `reason` e `contextJson` normalizado. Contexto inclui `accountId`, ajuste, lançamento, classificação, parcelas/consumos, revisão e resultado original; anulação preenche `reversalOfId` com a operação original. O contexto permite reentregar o resultado confirmado após perda de resposta, sem reconstruí-lo a partir do saldo atual.

### 4.2 Nova relação pequena para metadados e integridade

Adicionar `hubbuy_balance_adjustments`, sem duplicar valores financeiros do ledger:

| Campo | Contrato |
| --- | --- |
| `id` | PK textual |
| `account_id` | FK conta; indexado |
| `operation_id` | FK operação, UNIQUE |
| `balance_entry_id` | FK lançamento, UNIQUE |
| `kind` | `promotional_bonus`, `documented_credit`, `documented_debit`, `reversal` |
| `external_reference` | Opcional, trim, 1–200; nulo em reversão |
| `reverses_adjustment_id` | FK para ajuste original, UNIQUE quando presente; obrigatório apenas para `reversal` |

Motivo, datas e autoria vêm da operação; magnitude, direção e BRL vêm do lançamento; titulares vêm das parcelas/consumos. Evitar um segundo campo de saldo ou um estado editável `voided`.

Constraints/triggers da nova relação:

- Somente append; proibir UPDATE/DELETE.
- Validar conta/operação/lançamento do mesmo workspace e mesma conta, conta viva, tipo de operação, direção e `sourceId` coerentes.
- Bônus obrigatoriamente crédito com base zero; crédito documentado exige base conhecida; débito documentado exige base derivada conhecida.
- Reversão referencia ajuste original da mesma conta, com direção oposta, magnitude/base iguais e operação compensada coerente; proibir reversão de reversão e segunda anulação.
- Para referência externa não nula, impedir dois ajustes originais **não anulados** da mesma conta com a mesma referência, independentemente de membro/chave idempotente. Usar índice `(account_id, external_reference)` e trigger com `NOT EXISTS` de reversão, pois índice parcial não pode consultar outra linha. Testar concorrência real. Comparação por referência exata após trim, sem alterar letras/identificadores HubBuy.
- Após anular, permitir novo lançamento corrigido com a mesma referência; o extrato conserva ambos e sua compensação. Sem referência, não prometer deduplicação semântica; proteção é a chave idempotente.

Gerar migration nova após o último journal existente (hoje 0021), com snapshot/journal coerentes. Nunca editar migrations aplicadas. Validar base vazia e atualização de base populada.

### 4.3 Reembolso de item com base BRL zero

Adicionar em `purchase_cost_refunds` campos opcionais `requested_product_cny_minor` e `requested_china_cny_minor`, inteiros não negativos. Servem para capturar a solicitação nativa; não criam saldo ou recebimento.

- Legado conserva os dois campos nulos e a regra BRL positiva existente.
- Nova solicitação nativa requer os dois campos presentes e soma CNY positiva. Permitir solicitação BRL zero somente nessa forma; se ambos os BRL forem zero, a base recuperável das unidades selecionadas deve ser efetivamente zero, validada no serviço contra pagamentos por componentes.
- Só aceitar campos nativos quando o item tiver pagamento por componentes com fonte CNY verificada. Não liberar refund vazio para produto sem custo/fonte comprovados.
- Validar por produto/China, faixa de unidades e capacidades remanescentes. Reutilizar o algoritmo de faixas inteiras e as alocações persistidas; não multiplicar valor unitário arredondado e não exceder nativos pagos.
- Atualização de solicitação mantém os mesmos limites e autoria. Receber/anular/corrigir preserva esses snapshots de solicitação e os limites do fluxo existente.
- Reescrever `cost_refund_requested_amounts` para aceitar BRL positivo legado ou solicitação nativa positiva, com validação integral dos novos campos. CHECK não pode consultar outra tabela: a elegibilidade por pagamento pertence ao serviço e, se houver guard relacional adicional, a trigger.
- A reconstrução SQLite de `purchase_cost_refunds` deve preservar todos os dados, índices, FKs e triggers introduzidos nas migrations posteriores a 0011. Não copiar cegamente o DDL antigo. Conferir `PRAGMA foreign_key_check` após upgrade e o comportamento das referências de tabelas filhas.

Não acrescentar esses campos como saldo, cotação ou direito individual. A redução do custo BRL continua zero e a entrada CNY só nasce no recebimento confirmado.

## 5. Serviços, prévia e comandos HTTP

### 5.1 Organização

Manter `hubbuyBalanceServices()` como fachada. Criar `src/lib/domain/hubbuy-balance-adjustments.ts` para schemas/serviços e `hubbuy-balance-adjustment-calculations.ts` para prévias puras, se a separação reduzir o serviço atual. Extrair apenas helpers comuns necessários de transação/idempotência; evitar dependência circular e duplicação das regras de ledger.

Métodos sugeridos: `previewManualAdjustment()`, `recordManualAdjustment()`, `previewManualAdjustmentReversal()` e `reverseManualAdjustment()`. Uma única rotina de validação/cálculo deve atender prévia e confirmação. Prévia não cria registros, reservas ou operações financeiras.

### 5.2 Entrada

Schema estrito: `expectedRevision`, `idempotencyKey` na confirmação, `kind`, `amountCnyMinor > 0`, `occurredAt` ISO com offset, `reason` 1–1000, referência opcional e `shares` com pessoas únicas. Classificação discrimina os demais campos:

- Bônus: parcelas `{personId, amountCnyMinor}`; servidor atribui BRL zero, rejeita base BRL enviada.
- Crédito documentado: parcelas `{personId, amountCnyMinor, historicalBrlCents}` e explicação da base no motivo. Total BRL derivado das parcelas, sem cotação inferida. Base desconhecida não é aceita como zero.
- Entre 1 e 100 titulares, todos membros do workspace; CNY positivo por parcela. Somar e validar no servidor. Ordenação estável por ID normalizado para hash/desempate.

O formulário pode oferecer divisão igual via helper inteiro de maior resto. O payload sempre carrega as parcelas finais visíveis, sem percentuais flutuantes nem divisão automática não confirmada.

### 5.3 Saída

Schema de débito recebe a magnitude CNY, data/motivo/referência e `{personId, amountCnyMinor}` por titular afetado. Não recebe base BRL, lote escolhido pelo navegador ou `paymentAllocationId`.

Calcular FIFO **dentro dos direitos de cada pessoa escolhida**, por sequência e ordem persistidas. `previewFifoConsumption()` fornece base histórica, inclusive resto de centavos no consumo final. Gravar débito e consumos com `paymentAllocationId = null`. Não criar adiantamento, pagamento de pedido, quitação entre pessoas ou refund. UI apresenta a base retirada como base histórica baixada, sem somá-la ao custo de produtos.

### 5.4 Transação de confirmação

1. Validar schema, normalizar nulos/textos/datas e hash do comando; incluir conta, tipo, revisão e todos os campos relevantes. Nunca hash de dinheiro em float.
2. Dentro de transação de escrita, autorizar conta/workspace e procurar idempotência persistida. Mesma chave/tipo/hash devolve resultado original antes da checagem de revisão atual; outra carga retorna conflito.
3. Para comando novo: exigir conta ativa/viva, revisão esperada e conciliação completa. Validar pessoas, referência, direitos/capacidades e limites de CNY/BRL agregados.
4. Recomputar prévia no servidor. Se a revisão mudou, devolver conflito; não aplicar automaticamente contra o saldo novo.
5. Gravar operação, lançamento na próxima sequência, parcelas ou consumos e metadados. A ordem de INSERT deve respeitar os guards, inclusive `sourceId` e anulação.
6. Atualizar saldo/revisão/autoria com compare-and-swap por ID/revisão/status/conta viva. O trigger existente exige cache igual ao ledger já inserido.
7. Recalcular estado dentro da transação; conferir soma CNY dos direitos = saldo, parcelas/bases e ausência de saldo negativo. Se falhar, rollback integral.
8. Retornar resultado tipado com IDs, revisão confirmada, saldos anterior/posterior, total CNY/base e `replayed`. Erro após confirmação na rede não gera nova chave ao tentar novamente.

Reutilizar estratégia atual de transação e tratamento de busy. Em recuperação de violação UNIQUE, consultar operação, reautorizar acesso e validar **tipo e hash** antes de devolver replay. Não interpretar qualquer constraint como sucesso ou duplicidade de referência. Outros conflitos devem ter códigos específicos e nenhum detalhe de outra conta/workspace.

### 5.5 Anulação e correção

- Crédito: permitir anulação integral apenas quando **nenhuma parcela original tiver consumo persistido**, ainda que a pessoa possua outros créditos suficientes. Não consumir outro lote para fingir estorno do original. Gravar débito compensatório e consumir exatamente todas as parcelas originais, com suas bases.
- Débito: criar crédito compensatório com magnitude/base exatamente iguais ao débito, parcelas por titulares originais reconstruídas de seus consumos. Nunca apagar consumos; o crédito restaurado entra numa nova sequência, sem tentar recuperar a posição antiga no FIFO.
- Não anular ajuste de conciliação, refund, pagamento ou correção de pedido pelo novo endpoint. Eles mantêm seus próprios fluxos.
- Uma reversão por ajuste, com motivo/data e vínculos de operação/lançamento. Não admitir anulação parcial ou anulação de anulação nesta versão.
- Para corrigir dado/valor/titular: anular o ajuste elegível e registrar outro. São dois fatos auditáveis; cancelar a segunda etapa mantém o saldo já compensado e a UI explica isso. Não prometer substituição atômica sem implementar comando específico.
- Crédito consumido: explicar bloqueio e apontar o histórico para investigação. Um débito avulso não apaga o erro nem corrige pagamentos posteriores; não sugeri-lo como bypass.

### 5.6 Rotas e respostas

Estender o POST existente `/api/hubbuy/accounts/[accountId]` com operações discriminadas:

- `adjustment.preview` e `adjustment.record`;
- `adjustment.reversal.preview` e `adjustment.reverse`.

Schemas estritos no domínio após retirar o discriminante. Reutilizar `requireUser()`, `requirePackageCostOrigin()`, `packageCostPrivateHeaders` e `packageCostFailure()`. Nenhuma migration no request. A conta vem do path; autor e workspace vêm da sessão/relação autorizada.

Códigos propostos: `BALANCE_REVISION_CONFLICT`, `BALANCE_RECONCILIATION_REQUIRED`, `BALANCE_SHARES_MISMATCH`, `BALANCE_INSUFFICIENT`, `ADJUSTMENT_REFERENCE_DUPLICATE`, `ADJUSTMENT_ALREADY_REVERSED`, `ADJUSTMENT_CREDIT_CONSUMED`, `ADJUSTMENT_INELIGIBLE`, `IDEMPOTENCY_CONFLICT`. Usar 400 para carga inválida, 403/404 conforme política existente de acesso e 409 para conflito/estado/capacidade.

## 6. Leitura e interface

### 6.1 Formulário

Reutilizar `Surface` em um componente dedicado `src/components/packages/hubbuy-balance-adjustment-surface.tsx`, aberto pelo menu Ações. Ajustar `hasActions` e tornar a ação disponível somente após carregar a conta/direitos conciliados; erro de leitura não pode parecer saldo zero ou permitir confirmação.

Campos: natureza, valor CNY, data/hora, referência opcional, motivo e pessoas/parcelas. Para bônus, mostrar **Sem desembolso · base R$0,00**, sem campo de câmbio. Crédito documentado revela base BRL por pessoa. Saída revela seleção de pessoas e base FIFO somente na prévia.

Prévia server-side antes de confirmar: conta, saldo antes/depois, direção/valor, origem, pessoas, CNY e BRL de cada parcela, data e referência. Informar que o registro documenta algo já ocorrido e não movimenta dinheiro na HubBuy. Débito exige confirmação explícita das pessoas afetadas; anulação mostra o lançamento original e efeito oposto.

Usar `parseFinancialMinor()` e formatadores existentes. Converter `datetime-local` para ISO com offset/instante conhecido; exibir fuso no formulário. Não presumir o fuso da data do comprovante HubBuy. BRL vazio não vira zero; zero precisa ser informado quando permitido.

Manter uma chave idempotente por comando confirmado; preservar a mesma chave/payload em falha de conexão, inclusive após a requisição ter sido recebida pelo servidor. Ao editar qualquer campo que altere o comando, invalidar prévia e gerar nova chave. Após 409 por revisão, recarregar e exigir nova prévia/confirmação. Não fazer retry financeiro automático com revisão nova.

Persistir o comando pendente por conta em `sessionStorage` antes do envio e removê-lo após resultado confirmado; na reabertura, oferecer retomar/conferir com a mesma chave. Fazer isso somente no cliente, vinculado a usuário/workspace, sem tokens ou credenciais. Limpar/ignorar rascunho de outro usuário. Sem referência, recarregar a página não pode transformar uma tentativa incerta em novo lançamento silencioso.

Após sucesso, atualizar lista, saldo/direitos e reiniciar paginação do extrato. Controlar respostas atrasadas por conta/revisão para não trocar o contexto do drawer. Reutilizar toasts, erros inline, estado ocupado e foco do padrão atual do menu.

### 6.2 Extrato e direitos

- Enriquecer `readStatement()` em lote com metadados de ajustes, autoria mínima autorizada, referência e vínculos de anulação; manter `balanceAfterCnyMinor` pela sequência original e paginação existente.
- Rótulos distintos: Bônus promocional, Crédito manual, Ajuste de saída e Anulação de ajuste. Corrigir `refund_received`; preservar descrições de eventos legados.
- Detalhes mostram quem registrou, quando ocorreu, quando foi registrado, motivo, referência, pessoas, valores e anulação relacionada. Ação Anular só para ajuste elegível; servidor sempre reconfere.
- Enriquecer `getAccountBalance()` em lote apenas com origens manuais remanescentes. Estender `RightOrigin.kind` e `describeOrigin()` para bônus/crédito manual/saldo restaurado por anulação; verificar relação conta/workspace antes de resolver descrição. `manual_adjustment` legado de conciliação mantém rótulo de conciliação.
- CNY positivo com BRL zero continua visível. Não usar truthiness para ocultar base, pessoa, origem ou pagamento. Não associar bônus a produto.
- Badge “Ativa e conciliada” depende da conciliação efetiva; em carregamento/erro/divergência, mostrar o estado correto e bloquear ajuste.
- Revisar texto de criação de conta: primeiro crédito pode vir de reembolso recebido **ou crédito manual**, sem alterar criação inicial em zero.
- Sem rota primária nova, redesign ou imagens. Respeitar tokens light/dark, desktop/mobile, foco, teclado, redução de movimento e dimensões de toque.

## 7. Integrações financeiras que devem funcionar antes de concluir

1. **Consumo integral de bônus:** pedido de ¥1,14 pago com esse lote produz custo histórico R$0,00, dinheiro novo R$0,00 e taxa zero, mantendo CNY financiado e titular visíveis.
2. **Mistura de lotes:** bônus e refund oneroso do mesmo titular seguem FIFO por sequência. Usar apenas parte do bônus não pode carregar base de outro lote; o último consumo oneroso absorve seus centavos.
3. **Complemento externo:** taxa incide só no principal PIX/cartão. Nenhuma cotação é aplicada ao bônus.
4. **Saldo de outra pessoa:** direcionamento explícito continua criando adiantamento CNY, mesmo com base BRL zero. O bônus não se torna coletivo.
5. **Reembolso de compra com bônus:** permitir solicitar em CNY com base BRL zero, cancelar unidades elegíveis e receber CNY com base zero; solicitado não gera crédito. Recebido zero é permitido pelas regras existentes e não cria lançamento monetário.
6. **Misto e reembolso parcial:** preservar tetos por unidade/produto/China/fonte e por consumo, sem restituir taxa. Base BRL zero não significa capacidade CNY zero.
7. **Correção de pedido adicional:** restaura valores/titulares conforme snapshots, inclusive lote de bônus; não apagar o consumo do bônus original para liberar sua anulação. A origem restaurada continua identificada honestamente como correção.
8. **Fechamento e histórico:** bônus isolado na conta não modifica tracking; pedidos/refunds posteriores usam os gates existentes. Compra finalizada permanece igual antes/depois do ajuste.
9. **Exclusão/descarte:** nova operação deve bloquear exclusão/descarte de cadastro incorreto; após anulação e saldo zero, preservar histórico e permitir apenas arquivamento conforme regras atuais. Testar guard SQL, não só botão.

Se o cenário de reembolso com base zero exigir ajuste em apresentação/cálculo além dos pontos conhecidos, fazê-lo com fixtures reproduzíveis e escopo limitado. Não declarar a feature pronta apenas porque o bônus entrou no saldo.

## 8. Arquivos e testes

| Área | Alterações previstas |
| --- | --- |
| Persistência | `src/lib/db/schema.ts`, nova migration, snapshot, journal; `scripts/verify-database.ts` para nova tabela/guards |
| Serviços | `hubbuy-balance-services.ts`, módulos pequenos de ajustes/cálculo; `hubbuy-account-lifecycle.ts` apenas se necessário para manter capabilities coerentes |
| HTTP | `src/app/api/hubbuy/accounts/[accountId]/route.ts`; reaproveitar GET e statement existentes |
| Origens | `hubbuy-rights-presentation.ts`, leitura de metadados em lote e tipos serializáveis compartilhados; evitar duplicar DTOs no painel |
| UI | `hubbuy-accounts-panel.tsx`, novo Surface de ajuste, `hubbuy-accounts.css`, `hubbuy-individual-rights.tsx` se novos rótulos exigirem |
| Zero BRL | `package-cost-services.ts`, schemas de pedido/atualização de refund, leitura/cálculo/apresentação de refund e `refunds-section.tsx`; preservar fluxos legados |
| Documentação | Este plano, `docs/INDEX.md`, aditivos a 26/34 e critérios/testes pertinentes quando houver implementação |

Testes novos sugeridos:

- `tests/unit/hubbuy-balance-adjustment-calculations.test.ts`: somas/limites, parcelas, bônus zero, divisão de ¥1,14 entre cinco pessoas com centavos fechados, FIFO próprio e reversão exata.
- `tests/integration/hubbuy-balance-adjustments.test.ts`: serviços reais, autoria, datas, direitos, cache/ledger, saída, anulações, reference duplicate, payloads estritos, autorização e rollback.
- `tests/integration/hubbuy-balance-adjustments-concurrency.test.ts` e worker: processos/conexões independentes sobre arquivo libSQL temporário; não testar apenas a fila local.
- `tests/integration/hubbuy-balance-adjustments-migration.test.ts`: banco vazio/upgrade, dados financeiros preservados, novos constraints/triggers e verificação de FKs.
- `tests/e2e/hubbuy-balance-adjustments.spec.ts`: fluxo completo, prévia, confirmação, anulação, conexão incerta, teclado e responsividade.
- Ampliar testes existentes de `hubbuy-rights-presentation`, `hubbuy-rights-origins`, `hubbuy-balance-calculations`, `package-refund-hubbuy` e pagamentos/correções de adicionais com base zero.

Matriz mínima de integração:

| Caso | Resultado obrigatório |
| --- | --- |
| ¥1,14 de bônus, um titular | +114 CNY minor; BRL 0; origem correta; uma operação |
| Bônus com BRL enviado ou crédito com base ausente | Rejeição; nenhuma escrita |
| Entrada com titulares repetidos, externos ou soma divergente | Rejeição no servidor |
| Débito de ¥1 quando conta tem ¥10, titular só ¥0,50 | Rejeição sem consumir outra pessoa |
| Débito com múltiplos lotes | Consumos por titular fecham CNY/BRL; sem financiamento fictício |
| Anular crédito intacto | Débito dirigido às parcelas originais; saldo/direitos exatos |
| Crédito usado parcialmente, mesmo com saldo global suficiente | Anulação bloqueada |
| Anular débito | Novo crédito com pessoas/bases originais; consumos antigos intactos |
| Anulação repetida | Mesmo comando replay; chave nova conflito; um estorno |
| Referência repetida em conta igual/diferente | Conflito na mesma conta; permitido em outra conta autorizada |
| Referência reutilizada após anulação | Permitida; histórico conserva original/anulação/substituto |
| Mesmo comando simultâneo | Um efeito; retries devolvem resultado original |
| Mesma chave com natureza/valor/titular/motivo diferente | `IDEMPOTENCY_CONFLICT`, inclusive recuperação de UNIQUE |
| Duas operações com revisão igual | Só uma confirma; outra recebe conflito sem resíduo |
| Ajuste × pagamento/refund/archive/delete/discard | Estado serializável e direitos consistentes; nenhuma escrita em conta excluída |
| Anulação de crédito × consumo | Uma transição válida por revisão; impossível consumir e anular a mesma capacidade |
| Falha entre operação/entry/shares/metadados/CAS | Rollback de todas as escritas |
| Conta divergente/arquivada/reconciling/excluída | Comando novo rejeitado; retry confirmado respeita autorização/idempotência |
| Ocorrência anterior ao último evento | Nova sequência, sem reprecificar ou reordenar histórico |
| Bônus → compra inteiramente sem BRL → refund nativo | Fluxo completo sem fabricar BRL ou bloquear cancelamento elegível |
| Migration sobre refund antigo e referências filhas | Dados e semântica legada idênticos; zero FKs inválidas |

## 9. Execução faseada e gates

### Fase 0 — conferir base

Ler instruções canônicas e contratos 21/23/26/27/28/34 aplicáveis; verificar `git status`, journal, schema e símbolos na base efetiva. Preservar alterações preexistentes. Registrar baseline das verificações locais; não abrir credenciais ou consultar saldo real para testes.

**Gate:** escopo e políticas deste documento explícitos, testes/fixtures identificados e nenhum conflito com invariantes.

### Fase 1 — schema, cálculo e migration

Criar metadados/guards e suporte de solicitação nativa para base zero; implementar cálculo puro de prévia/consumo/anulação. Atualizar verificador e testes de migration.

**Gate:** banco vazio e upgrade preservados; guards e FKs validados; aritmética exata e zero distinguido de desconhecido.

### Fase 2 — serviços e HTTP

Implementar comandos, autorização, idempotência persistida, CAS, rollback, duplicidade de referência e compensações. Integrar solicitação nativa e validar pagamentos/refunds com bônus usando serviços reais.

**Gate:** integração e concorrência independentes passam, incluindo ciclos de base zero; nenhum caminho altera snapshots ou transfere direito implicitamente.

### Fase 3 — leitura e UX

Adicionar Surface, prévia/confirmar, detalhes de extrato, anulação, recuperação de tentativa incerta e origens individuais. Ajustar status de conciliação e texto de criação. Adaptar solicitação/detalhes de refunds nativos com base zero.

**Gate:** E2E de bônus → uso → cancelamento/recebimento, anulação elegível e falhas/retries; revisão visual em 390/768/1440 px, light/dark, teclado e foco sem overflow.

### Fase 4 — regressão e handoff

Executar `npm run lint`, `npm run typecheck`, `npm test`, E2E pertinentes e `npm run build`. Testar migrations explicitamente em banco descartável com ambiente de teste, incluindo reaplicação idempotente e `npm run db:verify`. Não rodar `db:migrate` sem apontar/verificar o alvo local temporário.

Reexecutar suítes financeiras, direitos, conta/exclusão/descarte, pagamentos/correções e refunds. Registrar falhas preexistentes com reprodução/evidência; uma menção antiga em documentação não prova baseline atual. Não contornar falhas novas para concluir.

**Gate final:** relatório com comandos/resultados, migration gerada, capturas sintéticas, critérios atendidos e limites operacionais. Publicação/migração remota e registro do bônus real ficam para autorização específica posterior.

## 10. Critérios de aceite

- Um membro consegue registrar +¥1,14 de bônus numa conta ativa pelo produto, sem acesso direto ao banco.
- O saldo aumenta exatamente ¥1,14; a base histórica não aumenta; direitos refletem os titulares escolhidos.
- Extrato e composição identificam bônus, motivo, referência e autoria; conciliação legada não é confundida com ajuste novo.
- Entrada, saída e anulação mantêm ledger, cache e direitos consistentes, com proteção de concorrência e idempotência.
- Erro de conexão ou retry não duplica crédito; conflito de revisão exige conferência de nova prévia.
- Anulação de crédito consumido é bloqueada; anulação permitida conserva histórico e valores originais.
- Bônus pode financiar pedido de custo BRL zero, inclusive com posterior cancelamento/recebimento CNY elegível, sem câmbio ou taxa artificial.
- Nenhum valor, taxa, pagamento, pacote ou snapshot anterior é alterado por registrar ajuste avulso.
- Migration é explícita, compatível com dados existentes e validada localmente; nenhuma operação de produção ocorre na elaboração/execução local do plano.

## 11. Registro desta etapa

Foi inspecionado o código citado, as migrations relevantes, testes existentes e contratos de saldo/direitos. **Nenhum teste foi executado nesta etapa documental**, pois a aplicação não foi alterada. Não houve consulta financeira remota, migration, inserção do bônus, commit ou publicação.

## 12. Registro da implementação autorizada

O pedido **“inicie a implementacao”**, em 21/10/2026, autorizou a implementação local. Durante a execução, o usuário também pediu refatorar o posicionamento dos elementos no drawer, especialmente o checkbox. As seções anteriores preservam o contrato aprovado; esta seção registra sua execução.

- Migration `0022_hubbuy_manual_adjustments`: metadados imutáveis de ajuste, proteção relacional, unicidade de anulação, referência duplicada ativa e solicitação nativa de refund. A reconstrução de refunds copia os campos históricos, inicializa os novos campos em NULL e preserva os quatro triggers existentes que dependem da tabela.
- `hubbuy-balance-adjustments.ts`: prévia e confirmação compartilham a mesma preparação/validação; crédito, débito FIFO por titular e anulação entram pela fachada de saldo. Idempotência conserva o resultado original, e o hash normaliza data ISO, parcelas e referência opcional.
- `getAccountBalance()` e `readStatement()`: origem manual identificada, autoria, referência, parcelas, vínculos e elegibilidade de anulação. Crédito de conciliação continua distinto de bônus.
- Refund nativo: criação e edição da solicitação em CNY com base BRL zero, sem crédito antes do recebimento; recebimentos adicionais respeitam a faixa nativa das unidades, além dos limites históricos e por fonte.
- Drawer: natureza/valor em primeiro plano; checkbox de 18 px com padding zero e nome ao lado, alvo clicável de 48 px; parcelas abaixo da pessoa selecionada; total distribuído; seção separada de registro; revisão e ações em rodapé fixo. Selecionar explicitamente o primeiro titular preenche sua parcela com o valor informado; nenhuma pessoa é selecionada automaticamente.
- A confirmação incerta é guardada por usuário/workspace/conta em sessionStorage e reentregue com o mesmo comando/chave. Não descartar a tentativa para gerar outra silenciosamente.
- A validação global revelou contenção em uma correção de pedido adicional já existente. O retry passou a cobrir também as leituras autorizadas do recibo e ganhou uma janela limitada maior; o comando permanece idempotente e não recalcula uma correção já confirmada.
- Os testes responsivos de contas passaram a aguardar a transição do espaçamento da sidebar antes de medir overflow, em vez de medir o estado intermediário imediatamente após redimensionar.

Banco de validação explícito: `file:./artifacts/adjustments-build.sqlite`, criado apenas para migrations/verificação/build. Aplicação da migration duas vezes e `db:verify` passaram: 58 triggers financeiros verificados, zero violações de FK. O build de produção passou em `.next-adjustments-build`, com configuração e banco sintéticos. Build e Playwright precisaram de execução fora das restrições do sandbox Windows para escrita de arquivos gerados/acesso localhost; não houve ação remota.

Os testes incluem serviços financeiros, concorrência entre processos independentes, rollback, upgrade de base com refund recebido e registros filhos, propriedades imutáveis, origens, uso integral do bônus e crédito somente após recebimento.

Validação final local:

- `npm run typecheck`: passou. `npm run lint`: sem erros; o único aviso de variável não utilizada no teste novo de migration foi corrigido e o arquivo passou novamente no ESLint.
- `npx vitest run --maxWorkers=1 --testTimeout=45000`: 66 arquivos aprovados, 1 ignorado; 442 testes aprovados e 7 ignorados. A execução com dois workers havia exposto contenção SQLite na correção de pedidos; o arquivo isolado também passou nos seus 10 testes, incluindo concorrência entre processos e retry da leitura inicial.
- Playwright: bônus e anulação em 390/768/1440 px passaram em light e dark, com medição do checkbox e overflow; os dois testes existentes de contas passaram. O fluxo de produto pago com bônus passou pela solicitação nativa, edição e recebimento com BRL zero. As rodadas intermediárias exigiram corrigir seletores do teste para o nome acessível do botão e elementos duplicados entre desktop/mobile.
- Build de produção, migration reaplicada e verificação relacional: aprovados no ambiente local sintético descrito acima.

Evidências locais ignoradas pelo Git ficam em `artifacts/`: logs `adjustments-vitest-final.log`, `adjustments-corrections-final.log`, `adjustments-native-final.log`, `adjustments-playwright-dark.log`, `adjustments-build-final.log` e capturas em `artifacts/qa/`.

Sem migration remota, cadastro financeiro real, alteração de secrets/infraestrutura ou publicação. O pedido posterior autorizou commits locais por contexto: navegação mobile, retry de correções, serviço financeiro e interface/documentação. As alterações preexistentes de navegação/layout foram incluídas em seu próprio commit; `reset-password.sh` foi explicitamente excluído.
