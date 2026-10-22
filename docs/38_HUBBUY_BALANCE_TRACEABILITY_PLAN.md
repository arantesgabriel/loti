# Saldo HubBuy — histórico por pessoa, produto e origem

Data: **21/10/2026**. Status: **implementado localmente; resultados de validação na seção 10**.

## 1. Objetivo e autorização

O usuário pediu um plano para enxergar quanto pagou por um produto, quanto recebeu de reembolso, quanto desse crédito foi utilizado e quanto resta, inclusive quando o crédito já acabou. O exemplo motivador é a RAM 5200 MHz que deixou de aparecer na composição do disponível.

Esta etapa autoriza documentação. Não autoriza implementar a aplicação, corrigir os valores da auditoria HubBuy × Loti, modificar dados financeiros, migrar ou publicar produção. A investigação anterior identificou divergências de dados; esta interface deve mostrar os registros existentes, sem aplicar correções implícitas.

**Resultado recomendado:** substituir a composição restrita ao disponível por uma seção de histórico de saldo por pessoa, com todas as origens por padrão, valores recebidos/consumidos/restantes e detalhes dos destinos. O disponível atual continua destacado e mantém exatamente o significado atual.

Este plano amplia a apresentação do plano [34](34_HUBBUY_INDIVIDUAL_RIGHTS_ORIGINS_PLAN.md): a regra antiga de esconder lotes e pessoas zerados deixa de valer nesta seção. Permanecem o ledger, as regras financeiras e a apresentação honesta de origens restauradas.

## 2. Preparação da implementação

Antes de escrever código, ler `AGENTS.md`, `PROMPT_ONE_SHOT.md` e os canônicos 00–17 na ordem exigida. Depois ler os planos 23, 26, 29, 30, 34 e 37; consultar 21/24/25 para custos, imagens e mobile. Conferir os símbolos na base efetiva.

Na elaboração deste plano, `git status --short` mostrava `planning/` e `reset-password.sh` como arquivos não rastreados. Preservar esses arquivos e quaisquer mudanças posteriores. Não fazer reset/clean nem incluir trabalho alheio em commit.

## 3. Evidências e viabilidade

| Local | Comportamento atual | Mudança necessária |
| --- | --- | --- |
| `hubbuy-balance-services.ts`, `calculateLedgerState()` | Carrega todos os lançamentos, parcelas e consumos; deriva os disponíveis | Reutilizar essas fontes, sem novo FIFO |
| Mesmo arquivo, `getAccountBalance()` | Resolve produtos somente de créditos com saldo restante | Carregar contexto também dos créditos esgotados |
| `hubbuy-rights-presentation.ts`, `presentIndividualRights()` | Descarta parcela com CNY e BRL disponíveis iguais a zero | Manter a projeção disponível e criar projeção histórica própria |
| `hubbuy-individual-rights.tsx`, `HubBuyIndividualRights()` | Oculta pessoas zeradas; mostra só valores restantes | Mostrar pessoas com histórico e origens esgotadas |
| `hubbuy-rights-reading.ts` | Resolve snapshot original/adicional com autorização em lotes | Ampliar contexto mínimo para pagamentos e histórico |
| `purchase-order-corrections.ts` | Restaura consumos antigos em novos créditos por titular | Mostrar a ligação débito → restauração → novo uso |
| `purchase_cost_refund_participants` | Guarda bases históricas individuais de produto, China e taxa | Usar snapshots, observando o escopo das unidades |
| `purchase_payment_allocations` | Guarda fonte, beneficiário e valores de pagamentos adicionais | Explicar custo, saldo utilizado e dinheiro novo separadamente |

**Expectativa da V1: nenhuma migration ou escrita financeira.** Os recebimentos, parcelas originais e consumos não são apagados quando o disponível zera. A mudança é uma projeção de leitura e sua interface.

Existe um teste de caracterização em `tests/integration/hubbuy-credit-traceability-audit.test.ts` que documenta mudanças na composição de origens após correções e diferenças de centavos BRL entre cenários. Ele foi lido, mas não executado nesta etapa. Não transformar seu comportamento em nova regra financeira nem corrigi-lo incidentalmente nesta tarefa.

## 4. Experiência proposta

### 4.1 Local e hierarquia

Manter `/packages/accounts`, seletor de conta, saldo atual, ações e extrato existentes. Não criar seção primária de navegação, dashboard ou página separada.

Sob o saldo da conta, apresentar **Histórico do saldo por pessoa**. Cada pessoa mostra o disponível atual em destaque, mesmo quando zero, seguido de sua tabela de origens.

Filtros locais: **Todas** (padrão), **Com saldo** e **Esgotadas**; busca por produto/origem e seleção de pessoa. Os filtros não alteram totais nem persistem nova preferência no banco. Pessoas sem qualquer histórico ficam fora; pessoas com histórico e disponível zero permanecem acessíveis.

### 4.2 Colunas

| Coluna | Conteúdo |
| --- | --- |
| Produto / origem | Nome e variação do snapshot, contexto mínimo da compra e estado |
| Custo pago | Parcela histórica BRL da pessoa no produto/unidades indicados, com detalhes de principal e taxas |
| Creditado | Crédito original dessa origem em CNY; em origens de produto, identificar como reembolso recebido |
| Usado em compras | Consumos persistidos destinados a pagamentos, em CNY |
| Ajustes | Efeito assinado dos demais débitos sobre essa origem; visível quando existir |
| Restante | Disponível CNY e base histórica BRL restante, inclusive zero |

Sem ajustes, a coluna correspondente pode ser omitida da tabela inteira. Quando houver, não escondê-la numa fórmula que deixe de fechar. Em cada pessoa, indicar que todos os valores CNY são registros do Loti e que R$ é histórico, sem conversão de mercado.

Exemplo **sintético**, sem relação com valores reais:

| Produto | Custo pago | Reembolso recebido | Usado em compras | Restante |
| --- | ---: | ---: | ---: | ---: |
| RAM A · Esgotado | R$100,00 | ¥80,00 | ¥80,00 | ¥0,00 |
| RAM B · Parcialmente usado | R$120,00 | ¥90,00 | ¥30,00 | ¥60,00 |

A RAM A continua visível após consumo integral. O detalhe explica onde os ¥80,00 foram usados. O custo pago não é limitado ao valor reembolsado.

### 4.3 Desembolso, custo e moedas

Usar **Custo pago** como título principal, pois um produto pode ter sido financiado com saldo anterior. No detalhe, separar:

- Principal de produto e frete China, taxas efetivamente capturadas e total da parcela histórica.
- **Dinheiro novo** em BRL, quando comprovado pelo pagamento PIX/cartão.
- **Saldo anterior utilizado** em CNY e sua base histórica BRL.
- Reembolso recebido em CNY e base recuperada em BRL, sem chamar isso de saque ou dinheiro devolvido à conta bancária.

Não somar BRL com CNY. Não chamar base histórica de desembolso bancário. Quem clicou em confirmar pagamento não determina o dono econômico do dinheiro.

O custo dessa coluna cobre o pagamento do produto/China e suas taxas. Frete Brasil e Receita ficam fora, com escopo explicado no detalhe. Não introduzir um novo cálculo de custo completo da compra.

Para bônus, saldo inicial e créditos manuais sem produto, exibir custo pago **Não se aplica** ou **Não identificado**, conforme a origem. Bônus pode ter base R$0,00; desconhecido nunca vira zero.

### 4.4 Detalhes e destinos

Expandir a linha ou abrir Surface de leitura **Detalhes da origem**, sem ação de correção financeira. Não reintroduzir o antigo link genérico “Ver compra” em todas as linhas.

Mostrar:

1. Identidade do produto/origem, titular, compra/pedido e referências autorizadas.
2. Custo pago, principal, taxas e composição das fontes quando disponíveis.
3. Recebimentos por evento, com valor original, reversão/substituição e referência.
4. Cada consumo: data de registro, pedido/produto de destino, valor CNY, base BRL consumida e beneficiário quando diferente do titular.
5. Correções/anulações ligadas ao consumo e crédito restaurado correspondente.
6. Saldo restante e fórmula verificável.

Um débito pode financiar vários itens: agrupar por débito e mostrar as alocações abaixo, sem repetir seu total em cada item. Consumos sem alocação de pagamento usam a natureza persistida, como ajuste de saída ou conciliação; não inventar destino de compra.

Exibir **Data do registro** e **Ocorrência informada** separadamente. O legado pode ter salvo a hora de cadastro como ocorrência; a interface não deve promovê-la a horário comprovado pela HubBuy. A sequência do ledger governa os saldos, não uma reordenação por datas informadas.

### 4.5 Desktop, mobile e estados

Desktop: tabela compacta, valores alinhados, cabeçalhos explícitos e marcador funcional pequeno. Mobile: cada linha vira bloco textual compacto com rótulos e valores, preservando a sequência das informações e os mesmos totais. Sem fotos de produtos, cards ilustrados ou imagens QC nesta seção.

Mostrar inicialmente até dez linhas por pessoa e oferecer **Mostrar mais** e **Recolher**, sem ocultar permanentemente esgotadas. Não repetir o limite atual de três origens remanescentes como se representasse todo o histórico.

Prever loading, erro/retry, histórico vazio, nenhum resultado dos filtros, origem parcial e inconsistência contábil. Falha nunca aparece como zero. Seleção de outra conta invalida detalhes e respostas atrasadas; foco e expansão têm nomes acessíveis, `aria-expanded` e suporte a teclado.

## 5. Regras da projeção financeira

### 5.1 Unidade e fechamento

A unidade auditável é `creditShareId`: uma parcela de um crédito atribuída a uma pessoa. Manter todos os lotes, inclusive disponíveis zero.

```text
creditado = creditShare.amountCnyMinor
usado_em_compras = soma dos consumos cujo débito é purchase_payment
outros_debitos = soma de todos os demais consumos desse lote
ajustes = -outros_debitos
restante = creditado - usado_em_compras + ajustes

base_brl_restante = base_brl_creditada - soma das bases BRL dos consumos
```

Classificar débitos pelo lançamento vinculado, não pela presença casual de um texto ou de uma referência externa. Validar a conta e o titular de cada relação. Incluir consumos de pagamentos posteriormente substituídos no histórico bruto e marcá-los claramente como substituídos.

**Usado em compras é consumo registrado do lote, não gasto definitivo.** Havendo reversão, mostrar o valor restaurado em crédito separado e o vínculo no detalhe. O resumo de pagamentos vigentes, se apresentado, deve excluir os pedidos substituídos pelas relações de correção existentes; nunca somar pagamentos antigos e substitutos como despesa atual.

Somar disponíveis de todos os lotes, incluindo créditos restaurados, deve produzir exatamente o disponível atual da pessoa e da conta. Validar CNY e BRL separadamente com inteiros/BigInt e limites seguros.

### 5.2 Agrupamento sem duplicidade

Agrupar origens de refund por `(personId, costItemId)` depois de calcular os lotes. Preservar contribuintes por `creditEntryId`, `refundId` e `operationId` nos detalhes. Nunca agrupar pelo nome do produto.

A coluna Creditado é o total histórico bruto desses lotes. Estornos de recebimento aparecem em Ajustes e identificam eventos substituídos; o detalhe mostra o recebimento válido atual separadamente. Isso mantém a equação mesmo quando o refund foi corrigido. Não usar apenas os valores atuais de `purchase_cost_refunds` para apagar recebimentos antigos.

Não repetir o custo original para cada recebimento/correção. Custo pago pertence ao produto/escopo de unidades por pessoa; eventos de crédito ficam subordinados. Não oferecer somatório geral de Custo pago nesta V1, evitando dupla contagem em cadeias de produtos financiados com saldo.

No resumo da conta, manter Disponível. Se houver indicadores históricos adicionais, separar **Reembolsos recebidos válidos**, **Outras entradas** e **Restaurações internas**. Nunca chamar a soma de todos os créditos do ledger de “Total reembolsado”.

### 5.3 Correções e limite da genealogia

Uma correção devolve um débito como novo crédito por titular. Esse crédito pode reunir saldo de várias origens antigas. Os consumos seguintes não identificam qual suborigem daquele agregado foi gasta.

Na V1:

- Conservar a RAM original, mesmo esgotada, com os consumos que efetivamente saíram de seu lote.
- Mostrar **Saldo restaurado por correção** como linha própria, com entrada, usos posteriores e restante.
- Mostrar ligações comprovadas `reversalOfEntryId` → débito anterior → consumos de origem, bem como pedido original/substituto validado.
- Não retornar o crédito ao lote antigo na apresentação nem escolher uma distribuição proporcional/FIFO fictícia entre suborigens.
- Informar, no detalhe do agregado: **Este saldo reúne créditos anteriores. O restante é identificado nesta restauração; não há divisão persistida por produto de origem.**

Assim, a pessoa consegue seguir o caminho até o saldo restaurado sem uma falsa afirmação de “quanto ainda resta da RAM” após mistura de origens. Uma futura genealogia exata exigiria decisão/modelagem própria; não criar schema ou backfill especulativo nesta entrega.

### 5.4 Origem do custo pago

Resolver pagamentos históricos originais e adicionais, com a mesma autorização dos demais dados. Para adicionais, usar componentes e alocações confirmados; para legado, usar snapshots de pagamento/refund e helpers existentes, respeitando o escopo real de cada campo.

Os `original*ShareCents` de `purchase_cost_refund_participants` não devem ser tratados automaticamente como custo somente das unidades canceladas: a implementação captura bases do item e guarda a faixa em `unitStart`/quantidade. Reutilizar as capacidades exatas por faixa dos módulos de refund e conferir esse comportamento com fixtures parciais. Não multiplicar preço unitário BRL arredondado por quantidade.

Não somar snapshots repetidos de refunds de um mesmo item nem recalcular pesos a partir dos participantes atuais. Se só houver evidência para uma faixa de unidades, rotular explicitamente esse escopo. Se faltar base histórica segura, devolver `null` e explicar a ausência; os créditos e usos continuam visíveis.

O titular que recebe um crédito pode ser um financiador, diferente do beneficiário do produto. Exibir esses papéis separadamente, sem atribuir automaticamente ao titular o custo integral do beneficiário.

## 6. Desenho técnico

Preservar `rights` e a projeção disponível existentes para compatibilidade. Acrescentar contrato próprio `traceability` ao GET da conta, contendo `personId`, totais disponíveis e grupos históricos. Não apenas remover filtros do DTO antigo: suas invariantes descrevem exclusivamente disponível.

Contrato sugerido para cada grupo:

```ts
type BalanceOriginHistory = {
  id: string;
  kind: RightOrigin["kind"];
  label: string;
  variant: string | null;
  costItemId: string | null;
  paidCost: null | {
    scope: "item" | "refunded_units";
    principalBrlCents: number;
    feeBrlCents: number;
    totalBrlCents: number;
    newMoneyBrlCents: number | null;
    previousBalanceCnyMinor: number | null;
  };
  creditedCnyMinor: number;
  purchaseConsumedCnyMinor: number;
  adjustmentDeltaCnyMinor: number; // assinado
  availableCnyMinor: number;
  availableHistoricalBrlCents: number;
  state: "available" | "partially_used" | "exhausted" | "adjusted";
  detailKey: string;
};
```

Tipos são uma proposta de implementação, não campos novos no banco. `null` distingue desconhecido de zero. Incluir os eventos de detalhe em projeção mínima, sem payload financeiro bruto, tokens, URLs privadas de QC ou dados pessoais desnecessários.

Executar a leitura na mesma transação autorizada de `getAccountBalance()`. Buscar contexto em lotes, aproveitar joins por conta, limitar parâmetros SQLite/libSQL e montar mapas; não usar `readCostTracking()` por produto nem SQL por pessoa/linha.

O GET retorna grupos e detalhes compactos de todos os lotes desta conta, permitindo expansão/filtros locais consistentes com o mesmo snapshot. Medir payload e número de consultas com fixture longa antes de concluir. Não truncar silenciosamente históricos. Se o volume demonstrar necessidade de paginação de servidor, definir contrato com revisão/snapshot e totais independentes antes de alterar a estratégia; não misturar páginas de revisões distintas.

Arquivos previstos:

- Novo helper puro `src/lib/domain/hubbuy-balance-traceability.ts` para projeção e invariantes.
- Novo leitor `src/lib/domain/hubbuy-balance-traceability-reading.ts`, ou extensão pequena do leitor de origens, para contexto em lote e autorização.
- `hubbuy-balance-services.ts`: integrar a nova leitura no GET, mantendo cálculos/comandos.
- Contrato compartilhado sem imports de banco no navegador.
- `hubbuy-individual-rights.tsx`, `hubbuy-accounts-panel.tsx` e `hubbuy-accounts.css`: tabela, filtros e Surface de leitura, aproveitando componentes existentes.
- Endpoint GET existente: extensão aditiva; nenhuma rota de escrita nova.

## 7. Fases e gates

### Fase 0 — especificação dos dados e baseline

Ler documentos, verificar árvore/diffs, identificar helpers de custo por faixa e criar fixtures sintéticas para créditos totalmente consumidos, parcialmente usados, corrigidos e misturados. Registrar os resultados atuais dos testes relevantes sem presumir falhas antigas.

**Gate:** cada coluna tem fonte e equação; ausência de informação tem fallback explícito; nenhuma escrita por leitura.

### Fase 1 — projeção e leitura

Implementar contratos, lotes completos, destinos, bases históricas, ajustes e vínculos de restauração. Integrar ao GET com contexto em lote. Manter o disponível anterior idêntico.

**Gate:** todos os lotes fecham; grupos/pessoas/conta fecham; autorização e snapshot consistentes; esgotados presentes; nenhuma migration.

### Fase 2 — interface

Entregar tabela por pessoa, Todas como padrão, filtros, histórico esgotado e detalhe dos destinos. Manter saldo atual, ações e extrato. Implementar apresentação mobile e estados de erro/ausência.

**Gate:** uma pessoa consegue responder quanto pagou, quanto recebeu, onde usou e quanto resta sem consultar SQL; dados indisponíveis são reconhecíveis.

### Fase 3 — validação e entrega

Executar testes unitários/integrados direcionados, typecheck, lint, E2E relevantes e build com banco sintético isolado. Conferir visualmente 1440/1024/768/390/320 px, light/dark, teclado e leitor de tela. Não executar testes contra Turso de produção nem rodar migrations como efeito colateral.

**Gate:** relatório de arquivos, comandos/resultados, capturas sintéticas, invariantes, limitações de genealogia e ausência de alteração financeira. Implementação local não implica publicação.

## 8. Matriz mínima de testes

| Caso | Resultado esperado |
| --- | --- |
| Refund → consumo total | Produto e titular continuam visíveis com recebido integral, usados e restante zero |
| Refund → consumo parcial | Colunas e detalhes fecham em CNY/BRL histórico |
| Pessoa com conta pessoal zerada | Histórico presente; filtro Com saldo pode ocultar somente a visualização |
| Crédito compartilhado | Cada pessoa vê sua parcela, sem repetir total do grupo |
| Vários destinos em um débito | Total contado uma vez; alocações de destino fecham |
| Correção de refund | Recebimento antigo, anulação e substituto visíveis; sem somar bruto como recebido válido |
| Correção de adicional | Débito antigo, restauração e pagamento substituto vinculados; sem gasto vigente duplicado |
| Restauração de múltiplas origens | Crédito separado; nenhuma atribuição inventada de restante por produto antigo |
| Refund parcial e múltiplas faixas | Custo e taxas sem duplicar item nem perder centavos |
| Bônus/base zero | CNY preservado; BRL zero conhecido distinto de ausência |
| Pagamento misto/financiamento | Custo, dinheiro novo, saldo e papéis econômicos separados |
| Ajuste manual/abertura/conciliação | Tipos próprios; nenhum produto fictício |
| Fonte incompleta | Origem/base não identificada; valores do ledger preservados |
| Refund requested/externo/recebido zero | Sem crédito fictício na carteira |
| Mesmo nome em compras diferentes | Identidades distintas, sem fusão por texto |
| Outro workspace/conta/tombstone | Sem vazamento de nomes, destinos ou valores |
| Concorrência/filtros/troca de conta | Mesmo snapshot; sem resposta atrasada aplicada à conta errada |
| Muitos lotes | Consultas em lote, payload medido, sem limite silencioso ou N+1 |
| Pureza da leitura | Tabelas financeiras e revisões idênticas antes/depois do GET |
| Regressão do disponível | Mesmo saldo CNY e mesma base BRL do contrato anterior |

Estender `tests/unit/hubbuy-rights-presentation.test.ts` quando aplicável, criar teste unitário da nova projeção e ampliar `tests/integration/hubbuy-rights-origins.test.ts`, `hubbuy-balance-services.test.ts`, `package-refund-hubbuy.test.ts` e `purchase-order-corrections.test.ts`. Usar o teste de auditoria de rastreabilidade como caso de caracterização, sem mudar os seus resultados por conveniência. Ampliar `tests/e2e/hubbuy-accounts-ui.spec.ts` para esgotados, filtros e detalhe.

## 9. Limites e entrega desta etapa

O histórico proposto representa os registros persistidos no Loti; não certifica automaticamente a conciliação externa. A diferença de ¥5,86 e as diferenças históricas que se compensam permanecem fora da implementação visual. Não criar ajustes para fazer a nova tabela coincidir com a HubBuy.

Não há nova integração, scraping, cálculo cambial, transferência, mecanismo de pagamento, genealogia financeira persistida ou superfície de fotos. Não reescrever compras finalizadas, lotes ou consumos antigos.

Nesta etapa foram feitas leituras estáticas e criado este handoff, com atualização do índice. Não foram executados testes da aplicação, consultas adicionais de produção, migrations, correções, commits ou publicação.

## 10. Implementação autorizada — 21/10/2026

O pedido posterior **“realize a implementacao”** autorizou a implementação local. A seção anterior registra somente a elaboração original do plano.

- Projeção própria `hubbuy-balance-traceability.ts`: mantém todos os lotes e titulares, inclusive zerados; agrupa por identidade de produto; separa consumo de compra de ajustes; valida fechamento CNY e BRL contra os direitos existentes. A projeção anterior `rights` permanece compatível.
- Leitor `hubbuy-balance-traceability-reading.ts`: resolve operações, snapshots de custo pago, fontes e destinos em consultas autorizadas e em lote. Custos originais usam uma base de item por pessoa, sem somar snapshots repetidos; adicionais usam alocações confirmadas. Bases conflitantes/ausentes permanecem desconhecidas.
- O GET da conta entrega `traceability` na mesma transação do saldo e da conciliação. Não há novo comando financeiro ou alteração de schema.
- Interface: tabela por pessoa com custo pago, crédito bruto, usado, ajustes condicionais e restante; Todas como padrão; filtros de disponibilidade/pessoa e busca; dez linhas iniciais e expansão. No mobile, as colunas viram campos com rótulos. Detalhes de leitura mostram custo/fontes, registros, destinos, anulações e navegação entre origens restauradas e anteriores.
- A compra aparece como contexto do produto, e destinos sem referência externa usam a referência interna autorizada. Marcadores são SVGs funcionais, sem fotos ou novos assets.
- Datas informadas e datas de registro são distintas; nenhuma é certificada como horário externo da HubBuy. Restaurações agregadas continuam separadas, sem reconstrução fictícia por produto antigo.

### Verificações e limites

- `npm run typecheck` e `npm run lint`: passaram.
- Suíte dirigida final: **34 testes passaram em 6 arquivos**, incluindo projeção anterior, histórico, contas, refunds e caracterização das correções.
- Fixture de 404 origens: todas retornadas, payload histórico abaixo de 500 KB e até 20 chamadas ao driver. As verificações de conta/workspace, leitura sem alteração e preservação do disponível passaram.
- Suíte global: **448 passaram, 7 ignorados e 1 falhou**, em 68 arquivos. Falha em `purchase-order-corrections.test.ts`, confirmação idêntica em processos independentes, com `SQLITE_BUSY`.
- A mesma falha foi reproduzida em uma cópia do **HEAD anterior**, extraída com `git archive` em `artifacts/traceability-baseline`, sem a implementação. Não foi alterado o fluxo de escrita financeira para contornar esse problema preexistente. O gate global permanece com essa pendência.
- Chromium: seleção de contas, falhas/retry e o histórico com esgotados, destino, filtros, expansão, recarga, divergência e retorno de foco passaram. Tema escuro também passou; larguras 1440/1024/768/390/320 px verificadas sem overflow. Uma medição intermediária capturou a animação da sidebar; o teste passou a aguardar a estabilização, mantendo a tolerância original.
- Build de produção com banco em memória e configuração sintética: passou. O sandbox Windows apresentou falha de cache temporário e execuções sem conclusão; as validações de navegador/build e a suíte global foram executadas fora dele, sempre com bancos locais descartáveis.
- Após os últimos refinamentos, o cenário completo do histórico passou também contra o **build final de produção local**, em 18,2 segundos com inicialização. Uma repetição no servidor de desenvolvimento havia parado no login antes de acessar a funcionalidade; o build local confirmou o fluxo completo. Capturas finais claras incluem as linhas de dados no mobile, além do contexto da página. Arquivos de tipos/configuração alterados automaticamente pelo Next durante QA foram restaurados ao estado anterior.

Capturas sintéticas inspecionadas ficam em `artifacts/qa/hubbuy-rights/`. Não houve consulta adicional aos dados financeiros de produção, migration remota, alteração de saldos reais, commit ou publicação. As diferenças da investigação HubBuy × Loti não foram corrigidas por esta entrega.
