# Plano faseado — Reembolsos de produtos em Pacotes e custos

Data: 14/10/2026. Status: **implementado, validado e revisado localmente**.

Base auditada: commit `a60af6680b6921b6459ae581a64ac542cc29d334`, com alterações locais de outra tarefa. A análise consultou código e documentação; **não consultou nem alterou os dados de produção de Compra Outubro/2026**.

Objetivo: registrar cancelamentos e reembolsos antes do envio ao Brasil, retirar as unidades canceladas da organização de envio e corrigir o custo líquido sem perder o pagamento original, a taxa Pix já paga ou os snapshots da compra finalizada.

Estimativa preliminar: 4–6 dias úteis de implementação e validação; os casos de correção, migração e concorrência podem aumentar esse esforço. A sequência abaixo é por dependência técnica, não por promessa de prazo.

## 1. Como usar este handoff

1. Ler as instruções obrigatórias de `AGENTS.md` e `PROMPT_ONE_SHOT.md`. Este documento não dispensa essa leitura.
2. Para esta extensão, usar este plano junto de [21 — regras financeiras](21_PACKAGES_AND_COSTS_PLAN.md) e [22 — experiência progressiva](22_PACKAGES_AND_COSTS_UX_REFACTOR_PLAN.md). O plano 23 substitui somente as regras explicitamente modificadas aqui.
3. Usar o mapa da seção 4 para abrir diretamente os arquivos/símbolos relevantes. As linhas são do baseline auditado; símbolos são as âncoras estáveis quando as linhas mudarem.
4. Executar as fases em sequência, continuar entre fases e corrigir falhas antes de avançar. Não abrir uma nova pesquisa de arquitetura ou de referências visuais.
5. Não publicar, migrar produção nem registrar reembolsos reais como parte da implementação local. Entregar código, migração, evidências e handoff operacional.
6. Nomes novos, DTOs e políticas descritos como propostas são defaults executáveis deste plano, não código existente nem respostas literais adicionais do usuário. Ajustes técnicos equivalentes são permitidos se mantiverem os invariantes e forem documentados.

## 2. Decisões e limites

### 2.1 Confirmado pelo usuário nesta conversa

| Tema | Decisão |
| --- | --- |
| Valor | Sugerir o integral, permitindo informar o valor manualmente quando necessário |
| Andamento | Acompanhar solicitado e recebido |
| Taxa Pix já paga | Valor integral preservado; parcela permanece com os participantes originais |
| Momento do cancelamento | Somente antes do envio ao Brasil |
| Problema concreto | Itens cancelados não podem continuar entre os produtos a enviar de Compra Outubro/2026 |

### 2.2 Defaults de produto propostos para execução

- Selecionar unidades canceladas e registrar separadamente valores de **produto** e **frete China**. A quantidade cancelada não deriva do valor reembolsado.
- Remover unidades do envio ao registrar a solicitação. Somente valores **recebidos** reduzem o custo líquido; solicitados aparecem como **A receber**.
- Solicitação pendente impede encerrar os custos. Custos já encerrados exigem a reabertura existente, com motivo.
- Exigir cobrança dos produtos paga, bases conhecidas/sem cobrança e divisão válida antes de registrar o primeiro reembolso. Se o pagamento real já ocorreu mas falta sua confirmação no app, confirmar primeiro pelo fluxo existente.
- Usar `requested`, `received`, `voided`; o terceiro estado serve apenas para anular um registro incorreto com motivo, preservando seu histórico.
- Permitir vários registros por produto para cancelamentos de unidades diferentes, respeitando o saldo. Não implementar parcelas de recebimento, devoluções extras sobre as mesmas unidades ou crédito comercial superior ao valor original.
- Recebimento único com valores finais manuais, inclusive menores ou maiores que os solicitados, limitados ao valor original das unidades canceladas em cada componente. Recebimento zero pode encerrar uma tentativa sem devolução: confirmação explica que o custo integral permanece.
- Motivo obrigatório, com 1–1000 caracteres após trim, na solicitação, correção e anulação. Datas dos eventos vêm do servidor; sem retrodatação nesta entrega.
- Correção financeira de recebido exige confirmação e motivo; não muda unidades ou participantes. Anulação libera as unidades para futura alocação, sem restaurar automaticamente os pacotes antigos.
- Congelar as bases e o método/percentual da cobrança de produtos enquanto existir qualquer reembolso não anulado no acompanhamento. Congelar a divisão dos itens com reembolso não anulado. Esta restrição é deliberada para preservar a taxa paga sem introduzir um ledger de pagamentos nesta extensão; a UI deve explicá-la.
- Manter a mesma semântica para pagamento por cartão, já suportado, sem ampliar métodos ou criar restituição da taxa. O caso motivador continua sendo Pix.

### 2.3 Fora do escopo

Reembolsar unidades enviadas/recebidas no Brasil; restituir taxa de pagamento, frete Brasil ou Receita; receber parcelas; créditos acima do custo original; devolução de mercadoria; integração HubBuy/banco; pagamentos reais; saldo entre membros; câmbio; notificações; dashboard; alterar compra finalizada/favoritos; criar uma seção primária de navegação.

Um abatimento financeiro em produto que continuará sendo enviado também não é este fluxo: **registrar reembolso aqui cancela unidades**. Não inferir cancelamento apenas a partir de um valor digitado.

## 3. Diagnóstico do código atual

1. `purchase_item_costs` não possui quantidade própria nem estado de cancelamento. A leitura usa `purchase_items.quantity` como quantidade física e financeira.
2. `calculateCostTracking()` calcula a taxa sobre todos os preços efetivos + fretes China originais do acompanhamento, arredondando uma vez e rateando por base. Não existe crédito/reembolso.
3. `saveItemCosts()` invalida a confirmação de produtos quando preço/frete mudam. Zerar valores para representar devolução reduziria a taxa e mudaria o pagamento original.
4. `saveAllocations()` valida a soma contra a quantidade comprada; retirar unidades deixa pendências. `closeTracking()` exige todas as unidades originais atribuídas.
5. Mudar o conteúdo de pacote com cobranças pagas invalida suas confirmações. Isso é diferente do pagamento conjunto dos produtos e deve continuar separado.
6. Pacote vazio com encargo positivo é rejeitado pelo cálculo: não há unidade para receber o rateio. O reembolso precisa tratar esse bloqueio antes da escrita.
7. A UI possui três seções recolhidas, componentes locais no mesmo arquivo e confirmação genérica acionada por texto contendo `Confirme`. Um novo conflito de reembolso não pode disparar por engano o reset de pagamento de produtos.
8. O schema limita dinheiro a inteiros não negativos; não representar créditos como preços negativos. O crédito deve ser um componente financeiro próprio, com magnitude positiva.

## 4. Mapa de código e referências de leitura direta

Todos os caminhos são relativos à raiz do repositório. Abrir apenas os trechos associados à fase; evitar indexar todo o projeto novamente. Conferir `git status` e a permanência dos símbolos antes de editar.

| Arquivo e âncora no baseline | Papel atual e mudança necessária |
| --- | --- |
| [`src/lib/db/schema.ts`](../src/lib/db/schema.ts), `purchaseItemCosts` L107, `purchaseCostParticipants` L123 aprox., `purchasePackageItems` L153 aprox., `purchaseCostCharges` L167 | Adicionar as três tabelas da seção 7; não mudar snapshots ou quantidades originais |
| [`drizzle/0004_milky_wither.sql`](../drizzle/0004_milky_wither.sql) e [`drizzle/meta/_journal.json`](../drizzle/meta/_journal.json) | Última migração auditada: índice 4. Gerar a próxima aditiva; não editar migrações aplicadas |
| [`src/lib/domain/package-cost-services.ts`](../src/lib/domain/package-cost-services.ts), schemas L11–59, `mutate()` L75 | Validação, transação, membership, aberto/encerrado, revisão e autor/data. Reutilizar para todas as novas operações |
| Mesmo serviço, `saveItemCosts()` L125 | Inserir proteção de bases de produtos e composição quando houver reembolso não anulado |
| Mesmo serviço, `deletePackage()` L166 | Exclusão apenas vazio/em preparação/cobranças pendentes; preservar regra, sem apagar reembolsos auditados |
| Mesmo serviço, `saveAllocations()` L182 | Usar quantidade enviável e reaproveitar sua regra de confirmação de encargos de pacote |
| Mesmo serviço, `savePackage()` L224, `saveCharge()` L233 | Revalidar status logístico na transação de solicitação concorrente; proteger alterações da cobrança de produtos |
| Mesmo serviço, `markChargePaid()` L260, `closeTracking()` L284, `reopenTracking()` L305 | Pagamento original fica preservado; fechamento usa quantidade enviável e exige ausência de solicitados; reabertura existente permanece |
| [`src/lib/domain/package-cost-calculations.ts`](../src/lib/domain/package-cost-calculations.ts), tipos L1–34 | Estender tipos com reembolsos e separar quantidade comprada/enviável/cancelada |
| Mesmo cálculo, `checkedCents()` L38, `roundFeeCents()` L47, `splitByWeights()` L53 | Reutilizar segurança em centavos e maior resto. Não enviar dinheiro negativo ao helper atual |
| Mesmo cálculo, `splitAcrossPackageUnits()` L76, `packageChargeTotal()` L111 | Encargos continuam sobre unidades realmente alocadas; tratar pacote vazio positivo antes de persistir |
| Mesmo cálculo, `calculateCostTracking()` L123, taxa L150, pendência de unidade L195 | Calcular taxa na base bruta, créditos separados, pendência sobre enviáveis e totais líquidos conciliados |
| [`src/lib/domain/package-cost-reading.ts`](../src/lib/domain/package-cost-reading.ts), `readCostTracking()` L16, construção de input L49 aprox., `memberTotals` L98 aprox., `CostTrackingView` L128, `listCostTrackings()` L130 | Ler reembolsos/participantes/eventos em lote, enriquecer DTO, agregar bruto/crédito/líquido por pessoa; lista usa a mesma leitura |
| [`src/lib/domain/package-cost-presentation.ts`](../src/lib/domain/package-cost-presentation.ts), `CostSectionKey` L3, `nextAction()` L18, `packageCostPresentation()` L69 | Preservar três seções; incluir pendência de reembolso dentro de produtos, contagens enviáveis e próximo CTA contextual |
| [`src/lib/domain/purchase-cost-initialization.ts`](../src/lib/domain/purchase-cost-initialization.ts), `initializePurchaseCosts()` L7 | Novos acompanhamentos começam sem reembolsos. Não inferir reembolso, nem modificar a finalização atômica |
| [`src/app/api/packages/[trackingId]/route.ts`](../src/app/api/packages/%5BtrackingId%5D/route.ts), `bodySchema`, `POST()`/switch | Acrescentar operações da seção 8 no endpoint existente |
| [`src/app/api/packages/route.ts`](../src/app/api/packages/route.ts), `GET()` L11 | Lista herda totais corretos; não criar endpoint/listagem paralela |
| [`src/lib/domain/package-cost-http.ts`](../src/lib/domain/package-cost-http.ts), `requirePackageCostOrigin`, `packageCostFailure` | Reutilizar origin/no-store/status; acrescentar código de erro de domínio legível pelo cliente se necessário |
| [`src/components/packages/package-cost-client.ts`](../src/components/packages/package-cost-client.ts), `CostTrackingSummary` L3, `costRequest()` L6 | Estender DTO/erro sem perder compatibilidade com operações atuais; centralizar parser de custos extraído da tela |
| [`src/components/packages/package-cost-detail-screen.tsx`](../src/components/packages/package-cost-detail-screen.tsx), `centsInput()` L42, `PackageCostDetailScreen()` L49, `mutate()` L89, `confirmReset()` L104 | Estados de editores/erro/preview; distinguir confirmação de encargos de pacote da preservação do pagamento original |
| Mesma tela, `saveAllocations()` L132, `openNextAction()` dentro da tela, pagamento L211–230 aprox. | Usar enviáveis e novo alvo de reembolso; mostrar pagamento original + devoluções, sem renomear líquido como valor original pago |
| Mesma tela, `ProductCostsList()` L284, `ItemBreakdownSurface()` L321 | Ação de reembolso, contagens compradas/canceladas/envio, crédito/residual; tirar linhas totalmente canceladas da lista operacional |
| Mesma tela, `PackageCard()` L338, editor de conteúdo L418 aprox., `ChargeSummary()` L433 | Máximo alocável enviável; preview da retirada e efeitos sobre frete/Receita; não descartar alocações de outros pacotes |
| Mesma tela, `ItemCostSurface()` L454, `ChargeSurface()` L509 | Explicar travas financeiras decorrentes de reembolso; não oferecer bypass silencioso |
| [`src/components/packages/packages-screen.tsx`](../src/components/packages/packages-screen.tsx), `PackagesScreen()` L13 | Pendência inclui solicitados; totais líquidos e unidades enviáveis; normalizar datas JSON com `new Date(...)` se tocar na ordenação atual que usa `.getTime()` |
| [`src/components/ui/surface.tsx`](../src/components/ui/surface.tsx), `Surface()` L6, `Confirm()` L13 | Primitivas existentes para sheet/modal, foco e confirmação |
| [`src/components/shared.tsx`](../src/components/shared.tsx), `Avatar`, `ProductCategoryMarker` | Reutilizar identificação e marcadores; não adicionar imagens de produtos |
| [`src/app/globals.css`](../src/app/globals.css), `.cost-progressive` L3367, `.cost-summary-card` L3425, `.cost-allocation-edit-row` L4265, `.cost-people-list` L4301, `.cost-editor-preview` L4377, breakpoint 1199px L4499 | Acrescentar estilos locais de reembolso preservando hierarquia e lista mobile; não refatorar CSS global alheio |
| [`src/lib/domain/authorization.ts`](../src/lib/domain/authorization.ts), `requireWorkspaceMember()` L7 | Boundary central; recurso resolve workspace, nunca payload |
| [`src/lib/domain/transaction-lock.ts`](../src/lib/domain/transaction-lock.ts), `serializeDomainTransaction()` | Fila apenas do processo; não substitui transação/compare-and-swap no banco em Vercel |
| [`src/lib/db/connection.ts`](../src/lib/db/connection.ts), `openDatabase()` | Abrir bancos explícitos isolados para migração/testes; driver libSQL existente |
| [`scripts/migrate.ts`](../scripts/migrate.ts), `migrateDatabase()` | Aplicação explícita; carrega dotenv. Sempre fornecer destino local no ambiente de teste |
| [`scripts/verify-database.ts`](../scripts/verify-database.ts), array `tables` | Acrescentar novas tabelas e verificar schema após migrar |
| [`src/lib/domain/money.ts`](../src/lib/domain/money.ts), `formatMoney` L21, `moneyInput` L22 | Reutilizar apresentação BRL. `parseMoney` limita a 100.000.000 centavos, menor que o domínio de custos: não usá-lo sem ajuste explícito e localizado |

### 4.1 Testes e referências visuais já disponíveis

| Arquivo | Reutilização |
| --- | --- |
| [`tests/unit/package-cost-calculations.test.ts`](../tests/unit/package-cost-calculations.test.ts) | Helpers `known`, `noCharge`, `equal`, `packageCharge`; taxas, unidades, pesos, parcial e centavos |
| [`tests/unit/package-cost-presentation.test.ts`](../tests/unit/package-cost-presentation.test.ts) | Helper `view()` e prioridades de ação; atualizar fixtures com novo summary |
| [`tests/unit/package-cost-client.test.ts`](../tests/unit/package-cost-client.test.ts) | Parsers/formatadores do cliente; acrescentar valores BRL de reembolso |
| [`tests/integration/package-costs.test.ts`](../tests/integration/package-costs.test.ts) | `finalizedPurchase()` L11; cenário de reset de produtos L57; distribuição/fechamento/reabertura L104 aprox. |
| [`tests/integration/helpers.ts`](../tests/integration/helpers.ts), `fixture()` | libSQL em memória migrado, Alice/Bob membros, outsider sem grupo e foreign em outro workspace |
| [`tests/integration/purchase-sharing-migration.test.ts`](../tests/integration/purchase-sharing-migration.test.ts) | Padrão de journal anterior, fixtures pré-migração e upgrade com preservação de snapshots |
| [`tests/integration/invitation-concurrency.test.ts`](../tests/integration/invitation-concurrency.test.ts) | Duas conexões no mesmo banco temporário; fechar clients antes de remover diretório |
| [`tests/e2e/packages.spec.ts`](../tests/e2e/packages.spec.ts) | Criação por API, origem localhost:3100, seções, editores, cancelamento, foco, widths e captures |
| [`scripts/e2e-server.ts`](../scripts/e2e-server.ts), [`playwright.config.ts`](../playwright.config.ts) | Banco isolado `file:./data/e2e.sqlite`, porta 3100, Chromium, um worker, seed/test users |
| [`vitest.config.ts`](../vitest.config.ts) | Inclui unit/integration em ambiente Node; sem novas dependências |
| [Referências A/B/C/D](design/PACKAGES_AND_COSTS_REFERENCES.md), [plano UX 22](22_PACKAGES_AND_COSTS_UX_REFACTOR_PLAN.md) | Usar o design existente; não buscar referências externas novas |
| `artifacts/qa/packages-costs-ux/` | Capturas locais já documentadas no plano 22; consultar quando disponíveis, sem tratá-las como fixtures financeiras |

### 4.2 Alterações locais preexistentes a preservar

No início desta auditoria estavam modificados `.env.example`, `README.md`, `docs/INDEX.md`, `next-env.d.ts`, `package-lock.json`, `package.json`; novos arquivos de outra tarefa: `docs/RESET_PASSWORD.md`, `scripts/password-reset.ts`, `scripts/reset-password.ts`, `tests/integration/password-reset-cli.test.ts`, `tests/integration/password-reset.test.ts`.

Rever o status real na execução. Não sobrescrever, reverter ou incluir essas mudanças como parte da feature. Este plano acrescenta sua própria entrada ao índice documental sem remover a entrada de reset de senha.

## 5. Contrato financeiro e de quantidade

### 5.1 Quantidade comprada, cancelada e enviável

Por item `i`:

```text
Qcomprada_i = purchase_items.quantity, sempre imutável
Qcancelada_i = soma(quantity) de refunds requested + received, excluindo voided
Qenvio_i = Qcomprada_i - Qcancelada_i
Qalocada_i = soma das alocações atuais em todos os pacotes
0 <= Qalocada_i <= Qenvio_i <= Qcomprada_i
QsemPacote_i = Qenvio_i - Qalocada_i
```

`requested` já cancela fisicamente as unidades. `received` só muda a dimensão financeira. A soma não pode contar solicitado e recebido duas vezes.

Na criação, especificar as retiradas dos pacotes em preparação e, se necessário, unidades atualmente sem pacote. `sum(packageRemovals.quantity) + unassignedQuantity = quantity`. Não escolher arbitrariamente de qual pacote retirar. Linhas em pacotes enviados/recebidos ficam indisponíveis, mesmo se existirem outras unidades da mesma linha ainda em preparação.

Registrar a retirada de forma atômica com o reembolso. Conservar as alocações dos outros produtos/pacotes e sua ordem de rateio. Ao anular, a quantidade enviável sobe, mas as unidades voltam **sem pacote**: o usuário decide para onde enviá-las.

**Limite de confiança logística:** os estados são manuais e o app permite corrigi-los enquanto aberto. A elegibilidade usa o estado atual autorizado do pacote dentro da transação: preparar é elegível; enviado/recebido não é. Não acrescentar rastreamento físico nem histórico de unidades para esta feature. A UI deve explicar que o cancelamento se destina somente a unidades que efetivamente ainda não foram enviadas; corrigir/reorganizar um estado manual continua sob responsabilidade do grupo. Não prometer recuperar um envio anterior que o modelo atual não registra. O evento de solicitação captura os pacotes de origem e seu estado no momento da retirada.

### 5.2 Preservar o bruto e descontar apenas o recebido

```text
ProdutoBruto_i = Qcomprada_i × precoEfetivoUnitario_i
ChinaBruto_i = Qcomprada_i × freteChinaUnitario_i
BaseBruta = soma(ProdutoBruto_i + ChinaBruto_i)
TaxaProdutos = roundFeeCents(BaseBruta, feeBps capturado)

BrutoConhecido = soma dos componentes conhecidos de produtos + China + taxas + Brasil + Receita
ReembolsoRecebido = soma(receivedProductCents + receivedChinaCents) de refunds received
LiquidoAtual = BrutoConhecido - ReembolsoRecebido
AReceber = soma(requestedProductCents + requestedChinaCents) de refunds requested
```

- Não recalcular a base bruta com `Qenvio`. A quantidade enviável afeta somente alocação e encargos de pacote.
- Não descontar `AReceber` do líquido atual. Mostrar esse valor separado; não chamar expectativa de devolução de dinheiro recebido.
- Recebido preserva `paymentStatus`, `paidAt`, `paidBy`, método, percentual e taxa dos produtos. Não chamar `saveItemCosts()` nem `saveCharge()` para simular o reembolso.
- Encargos de Brasil/Receita continuam rateados exclusivamente entre unidades remanescentes nos respectivos pacotes. Se o conteúdo mudar, tratar suas confirmações conforme seção 6.3.
- O líquido inclui custos conhecidos ainda a pagar, conforme a semântica atual de Custos; não é extrato bancário nem saldo entre pessoas. Rotular **Custo bruto**, **Reembolso recebido**, **A receber** e **Custo líquido atual**.
- `partialCents` passa a representar o custo líquido conhecido; acrescentar `grossPartialCents` e `receivedRefundCents` para composição. `totalCents` continua null enquanto houver componente/composição/unidade pendente **ou reembolso solicitado**. Quando tudo for resolvido, será o líquido final.
- Uma linha totalmente cancelada pode ter custo residual: taxa e diferença não devolvida. Continua nos cálculos, ainda que saia da lista operacional.
- Snapshots repetidos da taxa/base original em vários registros são referências de auditoria, **não componentes somáveis**. A taxa da linha e da cobrança entram no custo uma única vez, pelo cálculo bruto existente.

### 5.3 Limites de valores

- Todos os valores do payload são magnitudes positivas ou zero em centavos inteiros seguros, limite `1_000_000_000_000`; somas e multiplicações verificadas com BigInt, seguindo o módulo atual.
- Para uma solicitação de `q` unidades: produto solicitado/recebido <= `q × precoUnitarioOriginalCapturado`; China solicitado/recebido <= `q × freteChinaUnitarioOriginalCapturado`.
- Sem cobrança equivale a teto zero para aquele componente. Nulo pendente não equivale a zero e bloqueia solicitação.
- Solicitação total deve ser > 0. Recebimento final pode ser zero, com confirmação específica. Nunca permitir magnitude negativa, fração de centavo, NaN, Infinity ou quantia acima do teto.
- Recebido pode exceder o solicitado dentro do teto original, para corrigir estimativa inicial, mantendo ambos auditáveis. Pode também ser menor: o não devolvido permanece custo, não pendência automática.
- Limites por registro e soma de quantidades evitam reembolsar duas vezes a mesma capacidade. Nenhum teto inclui a taxa de transação, Brasil ou Receita.

### 5.4 Divisão por pessoa e centavos

1. Capturar participantes, pesos, modo e ordem do item na criação. Participantes não são alteráveis em um registro de reembolso.
2. A taxa original permanece distribuída nas mesmas parcelas originais; nenhuma parte migra para outros produtos/pessoas por causa de reembolso.
3. Separar a divisão de produto, China e taxa, como já faz o cálculo por componentes. Nunca aplicar um percentual ao líquido geral novamente.
4. Para cada item/componente, primeiro obter as parcelas brutas originais com `splitByWeights` e os pesos originais. Guardar essas parcelas no snapshot dos participantes do refund para consulta histórica.
5. Agregar os valores recebidos de todos os refunds não anulados do mesmo item, **por componente**, antes de distribuí-los entre pessoas. Usar as parcelas brutas originais daquele componente como pesos inteiros de devolução. Isso respeita a divisão original até o centavo e limita a devolução individual ao que foi atribuído originalmente. Se componente bruto é zero, devolução só pode ser zero, sem divisão por zero.
6. Não ratear cada pequeno recebimento isoladamente: múltiplos centavos poderiam ser devolvidos repetidamente ao primeiro participante, gerando custo negativo individual. Não usar o peso do frete/taxa de outro componente para resolver esse empate.
7. Por pessoa: `liquido = bruto conhecido - credito recebido alocado`. Somar as parcelas por componente, mantendo a taxa intacta. O snapshot de todos os refunds ativos do item deve coincidir; rejeitar corrupção/inconsistência em vez de escolher silenciosamente um deles.
8. A UI apresenta créditos agregados por item/pessoa; o registro individual mostra seus valores e participantes, sem prometer parcelas independentes por recebimento que depois somem diferente do agregado.

Invariantes obrigatórios: soma das pessoas = líquido geral quando a composição estiver resolvida; soma dos créditos pessoais = recebido geral; nenhuma parcela de devolução excede o componente bruto pessoal; nenhuma taxa sobre reembolso; zero não desaparece como desconhecido.

## 6. Operações, elegibilidade e correções

### 6.1 Máquina de estados

| Operação | Origem → destino | Efeito |
| --- | --- | --- |
| Solicitar | inexistente → requested | Cancela unidades, retira alocações, captura participantes/base/taxa de referência, registra valores solicitados |
| Editar solicitação | requested → requested | Ajusta valores solicitados/motivo, sem mudar quantidade ou retiradas |
| Confirmar recebido | requested → received | Registra valores finais de produto/China, autor/data; reduz líquido, preserva originais solicitados |
| Corrigir recebido | received → received | Muda somente valores finais, exige motivo/confirmação e evento antes/depois |
| Anular registro | requested ou received → voided | Ignora cancelamento/crédito no cálculo, libera quantidade sem pacote, exige motivo/confirmação |
| Editar anulado/receber de novo | voided → qualquer | Rejeitar; criar novo registro se ainda elegível |

Somente acompanhamento aberto aceita essas mutações. Receber/corrigir uma solicitação anterior pode acontecer depois que **outros itens** foram enviados; a restrição antes do Brasil se aplica ao cancelamento das unidades, não à chegada do dinheiro. Não bloquear recebimento porque os pacotes remanescentes avançaram.

### 6.2 Regras para criação e edição

- Dentro de `mutate()`, carregar tracking autorizado, item do tracking, cobrança conjunta paga, bases/divisão válidas, refunds não anulados, alocações e pacotes relevantes.
- Validar `expectedRevision` antes de decisões. Recomputar saldo de unidades, tetos e elegibilidade no servidor. Não confiar nos totais, participantes ou descontos apresentados pelo navegador.
- Somente unidades de pacotes atualmente em preparação e unidades sem pacote podem ser canceladas. Revalidar o estado dentro da transação, inclusive quando outra sessão estiver marcando o pacote como enviado. Preservar os fluxos manuais de correção logística anteriores, sem adicionar uma trava permanente de envio.
- A criação preserva o total e a confirmação do pagamento de produtos. Bases de produto/China de **todo o acompanhamento** e método/percentual de produtos ficam protegidos enquanto houver refund não anulado; caso contrário o rateio da taxa original poderia variar até ao editar outra linha.
- Composição de item com refund não anulado fica protegida. Composição de outros itens pode continuar seguindo a regra anterior se não mudar total externo nem a parcela de taxa do item reembolsado.
- Configurações Pix/cartão de Meu grupo continuam editáveis; o percentual capturado não muda. Valores e pagamentos de frete Brasil/Receita continuam com seu fluxo próprio.
- Alterações iguais às atuais são no-op, não motivo para rejeitar ou invalidar pagamento.
- A edição de um solicitado não altera quantidade. Para corrigir a quantidade, anular e registrar novamente; a UI deve orientar a nova seleção de unidades sem pacote.
- Correção de recebido não exige unidades novamente em preparação: é correção de um cancelamento anterior, não devolução de unidade enviada. Preservar o snapshot e o evento de solicitação.

### 6.3 Encargos de pacote e pacote vazio

- Retirada de unidades redistribui Frete Brasil, taxa de frete e Receita entre as remanescentes, com valores totais dos encargos preservados.
- Se um pacote afetado tiver encargo pago, prévia deve listar os encargos e pedir confirmação explícita para voltá-los a pendente, como `saveAllocations()` já faz. **Pagamento dos produtos permanece pago**. Não invalidar pacotes não afetados.
- Pacote que ficaria vazio com qualquer encargo positivo conhecido é bloqueio de validação **antes de gravar**: não existe destino de rateio. Informar qual pacote/encargo precisa de tratamento. Não zerar, transferir ou apagar taxa/frete realmente pago para fazer a ação passar; custos irrecuperáveis sem unidades exigem extensão separada.
- Pacote vazio com encargos pendentes/zero/sem cobrança pode permanecer. Ele continua sujeito às regras atuais de encerrar custos: pendentes precisam ser resolvidos explicitamente; zero conhecido precisa de confirmação de pagamento; sem cobrança dispensa pagamento.
- Mesmo sem linhas físicas, encargos de pacote pendentes precisam aparecer nos resumos/próxima ação e manter o custo final indefinido. Não usar apenas `results.every(...)` das linhas para declarar tudo resolvido quando um pacote vazio ainda tem obrigação sem valor.
- Pacote vazio, em preparação, com ambos os encargos pendentes pode ser excluído pela ação existente. Retiradas auditadas ficam no evento como snapshot, sem FK que impeça a exclusão de pacote vazio.
- Se todas as unidades forem canceladas, `Qenvio = 0` é válido. Fechamento não exige criar pacote; remover pacotes vazios elegíveis ou resolver seus encargos. Taxa residual e reembolsos continuam visíveis.

### 6.4 Anulação segura

Anular não apaga registro/eventos e não reabre a compra. Se recebido, desfaz seu crédito no líquido; se solicitado, remove A receber. Nos dois casos, as unidades liberadas ficam sem pacote e impedem fechamento até alocação/cancelamento correto. Nenhuma alteração automática de conteúdo de pacote já enviado. A confirmação deve mostrar valor que voltará ao custo e unidades que precisarão ser organizadas.

Enquanto houver outro refund não anulado no acompanhamento, as travas de bases de produtos continuam. Quando todos forem anulados, o fluxo antigo de correção/invalidação de pagamento pode voltar a funcionar. Eventos históricos continuam com seus snapshots originais.

## 7. Modelo de dados proposto e migração

Migração aditiva: três novas tabelas. Não alterar `purchase_items`, favoritos, composição histórica, logística existente ou valores/pagamento dos produtos preexistentes.

### 7.1 `purchase_cost_refunds`

| Campo | Tipo/regra |
| --- | --- |
| `id` | text PK, UUID do servidor |
| `tracking_id` | FK purchase_cost_trackings, obrigatório |
| `cost_item_id` | FK purchase_item_costs, obrigatório; relação com tracking validada no serviço |
| `status` | requested / received / voided, CHECK |
| `quantity` | inteiro 1–10.000, CHECK; imutável após criação |
| `requested_product_cents`, `requested_china_cents` | inteiros >= 0 e limitados, total solicitado > 0 |
| `received_product_cents`, `received_china_cents` | null enquanto requested; inteiros >= 0 quando received; preservar valores anteriores em voided se já recebidos |
| `reason` | texto não vazio, 1–1000 após trim |
| `original_item_quantity` | quantidade comprada capturada |
| `original_product_unit_cents`, `original_china_unit_cents` | bases resolvidas capturadas, no_charge representado como zero neste snapshot financeiro |
| `original_charge_base_cents`, `original_charge_fee_cents`, `original_item_fee_cents` | snapshot financeiro de referência da cobrança paga, não nova fonte de cálculo da compra |
| `original_payment_method`, `original_fee_bps`, `original_paid_at`, `original_paid_by` | referência do pagamento existente; método/bps podem ser nulos apenas conforme contrato vigente de base zero |
| `requested_at`, `requested_by` | servidor/user FK |
| `received_at`, `received_by` | ambos null antes do recebimento; ambos preenchidos após |
| `voided_at`, `voided_by`, `void_reason` | somente quando voided; dados de recebimento anterior preservados |
| `created_at`, `updated_at`, `updated_by` | padrão timestamp_ms/autor |

Índices: `(tracking_id, status)`, `(cost_item_id, status)`, `(tracking_id, requested_at, id)` para ordem estável. CHECKs de tipo inteiro, faixas, estados e combinações de campos de terminalidade. Não usar unique por item: vários cancelamentos de unidades diferentes são permitidos.

### 7.2 `purchase_cost_refund_participants`

PK `(refund_id, person_id)`, FK para refund/user; `allocation_order` único por refund; `weight_mode`, `weight` capturados; `original_product_share_cents`, `original_china_share_cents`, `original_product_fee_share_cents` não negativos. CHECKs e limites seguem participantes/custos atuais. Snapshots são do componente bruto da **linha inteira comprada**, não apenas das unidades canceladas, para permitir agregação e limite por pessoa.

Não aceitar participantes, pesos ou parcelas no payload. Capturá-los a partir do item autorizado e do cálculo servidor. Não reconstruir registros antigos com composição atual após anulação e futura edição do item.

### 7.3 `purchase_cost_refund_events`

`id` PK, `refund_id` FK, `event_type` (`requested`, `request_updated`, `received`, `receipt_corrected`, `voided`), `actor_id` FK user, `created_at`, `reason` quando necessário e `details_json` com snapshot validado da mudança. Usar estruturas JSON definidas em TypeScript/Zod por tipo de evento, contendo valores anteriores/novos e, na criação, retiradas `{packageId, packageName, quantity}`/quantidade sem pacote. Não registrar payload livre, credenciais, URL de produto ou dados pessoais adicionais. Ordenar por data + ID/ordem estável; caso a ordem no mesmo milissegundo importe, acrescentar `event_order` inteiro por refund com unicidade.

Eventos são somente append; registro e evento sempre na mesma transação. Isso é auditoria restrita a reembolsos, não ledger de todas as edições do app. Datas/valores do registro corrente são a fonte operacional; eventos explicam as alterações.

### 7.4 Migração e compatibilidade

- Gerar a próxima migração a partir de `schema.ts`; a sequência auditada termina em `0004_milky_wither`. Não reservar um número cegamente se outro trabalho adicionar migração antes.
- Não criar refunds automaticamente nem pelo nome Compra Outubro/2026. Os itens/valores reais serão selecionados manualmente após publicação autorizada.
- Sem refunds, cálculos/pagamentos/quantidades/logística mantêm o comportamento anterior.
- Atualizar `scripts/verify-database.ts` e documentação de schema. Repetir migrator não duplica dados.
- Testar upgrade desde a migração 0004 com tracking aberto/encerrado, pagamento de produtos pago, dois pacotes e histórico finalizado; comparar todas as colunas anteriores e taxa antes/depois.

## 8. Contrato de serviço, API e leitura

### 8.1 Serviço e transação

Reutilizar a closure `mutate()` em `package-cost-services.ts`. É permitido extrair um executor transacional compartilhado e criar `package-cost-refund-services.ts` para evitar crescimento excessivo; nunca criar um caminho de escrita que pule membership, status, revisão ou atualização de autor/data.

Fluxo de solicitação: autorização/revisão → carregar estado → validar quantidades/bases/tetos/divisão/logística/encargos → capturar snapshots → inserir refund/participantes → retirar alocações → invalidar somente encargos de pacote confirmados explicitamente → inserir evento → incrementar revisão por CAS → ler DTO atualizado. Uma falha em qualquer etapa faz rollback de tudo, inclusive revisão e pagamentos.

### 8.2 Operações no POST existente

Todos os inputs Zod estritos; IDs resolvidos dentro do tracking autorizado. Novo envelope segue `{operation, refundId?, input}`. Valores omitidos não são inferidos de null/undefined silenciosamente.

```ts
// Proposto; não é código já existente.
type RefundRequestInput = {
  expectedRevision: number;
  costItemId: string;
  quantity: number;
  requestedProductCents: number;
  requestedChinaCents: number;
  reason: string;
  packageRemovals: { packageId: string; quantity: number }[];
  unassignedQuantity: number; // 0 permitido
  confirmPackagePaymentReset?: boolean;
};
// refund.request -> requestRefund(trackingId, input)
// refund.update -> updateRefundRequest(trackingId, refundId, {
//   expectedRevision, requestedProductCents, requestedChinaCents, reason
// })
// refund.receive -> receiveRefund(trackingId, refundId, {
//   expectedRevision, receivedProductCents, receivedChinaCents, confirmed: true
// })
// refund.correct -> correctRefundReceipt(trackingId, refundId, {
//   expectedRevision, receivedProductCents, receivedChinaCents,
//   reason, confirmed: true
// })
// refund.void -> voidRefund(trackingId, refundId, {
//   expectedRevision, reason, confirmed: true
// })
```

Rejeitar IDs repetidos de pacote, retiradas zero/negativas, quantity divergente da soma, participantes/workspace/total/taxa extras e transições repetidas. Duplo clique/retry com revisão antiga retorna conflito e não duplica registro/crédito. Se request foi gravado e a resposta se perdeu, recarregar mostra o registro; não refazer com revisão nova automaticamente.

Conflitos distinguíveis por `code`, preservando `error` textual: `REVISION_CONFLICT`, `REFUND_PACKAGE_PAYMENT_RESET_REQUIRED`, `REFUND_PRODUCTS_LOCKED`, `REFUND_INELIGIBLE_UNITS`, `REFUND_EMPTY_PACKAGE_WITH_CHARGES`, `REFUND_PENDING`. Acrescentar `code` opcional ao erro de domínio/serialização com compatibilidade para consumidores existentes; se usar erro específico de custos, manter status HTTP de DomainError e Zod. A confirmação genérica baseada em `includes("Confirme")` não deve capturar conflitos de refund.

### 8.3 Leitura/DTO

Estender `CostTrackingView` e os tipos puros com:

- `refunds[]`: dados correntes, participantes capturados e eventos ordenados, todos limitados ao tracking autorizado;
- por item: `purchasedQuantity`, `cancelledQuantity`, `shippingQuantity`, `unassignedShippingQuantity`, `canRequestRefund`/motivo, `financialEditLocked`, bruto, recebido, A receber, líquido conhecido/final;
- por cálculo/summary: `purchasedUnits`, `cancelledUnits`, `shippingUnits`, `assignedUnits`, `requestedRefundCount`, `requestedRefundCents`, `receivedRefundCents`, `grossPartialCents`, `partialCents` líquido e `totalCents` líquido final/null;
- `productsCharge.baseCents/feeCents/totalCents` mantêm os **valores brutos originais**, com status pago. Não reutilizar esses campos para líquido;
- `memberTotals`: bruto conhecido, crédito recebido e A receber agregados, líquido conhecido/final e indicadores de pendência; quantidade pessoal usa enviáveis, com canceladas separadas quando necessário;
- `refundsSummary`/resumo necessário à lista, evitando inventar contagens diferentes no cliente.

Manter `summary.unitCount` como quantidade comprada para compatibilidade interna inicial e adicionar `shippingUnits`; migrar **todos os consumidores de alocação/fechamento/apresentação** para shippingUnits explicitamente. Não mudar unitCount de significado silenciosamente. A seção 4 lista os consumidores conhecidos; usar uma busca pontual por `summary.unitCount`, `original.quantity`, `assignedUnits`, `pendingComponents` como verificação final de cobertura.

Ler refunds, participantes e eventos em lote com `inArray`, após autorização; não adicionar uma query por item. `listCostTrackings()` já chama a leitura completa por tracking: não iniciar uma refatoração de performance não relacionada; se necessário, devolver somente resumo de refunds na lista sem duplicar cálculo.

## 9. Experiência e componentes

Preservar três portas de entrada: Produtos e pagamento, Pacotes, Divisão por pessoa. **Reembolsos** é uma subseção independente dentro de Produtos e pagamento, sem nova rota/aba principal. A refatoração aprovada em 15/10/2026 usa resumo + lista compacta: aparece somente quando há registros, com detalhes recolhidos por reembolso.

### 9.1 Fluxo de solicitação

1. Na linha/detalhe do produto: ação `Registrar reembolso`; indisponibilidade explica pagamento/divisão/envio/encargos pendentes de tratamento.
2. Surface com nome/variante/participantes, quantidade disponível para cancelar e seleção dos pacotes de origem quando houver mais de um. Pré-selecionar todas as unidades elegíveis no caso comum, deixando ajuste explícito.
3. Campos **Valor solicitado do produto** e **Valor solicitado do frete China**, valores totais das unidades selecionadas, sem ambiguidade unitário/total. Sugerir integral; respeitar manualmente digitado ao mudar outro campo, com ação explícita `Usar valor integral`.
4. Motivo obrigatório. Prévia: unidades retiradas por pacote, valor A receber, taxa original mantida, participantes e eventual reset de encargos de pacote. Confirmar `Registrar solicitação`.
5. Salvar mantém expansão e foco. Cancelar/fechar não escreve. Conflito de revisão mantém rascunho e oferece recarregar/revisar; não fazer merge silencioso de quantidades.

### 9.2 Consultar e receber

- Lista compacta: capa QC privada compartilhada quando disponível (fallback de categoria existente), produto/variante, participantes capturados, status textual, data/motivo reais, valor e método do pagamento original quando capturado. O total soma somente recebimentos confirmados; solicitações ficam separadas como A receber. A contagem de itens recebidos usa linhas de produto distintas, sem duplicar um produto com vários registros. O escopo é o acompanhamento da compra, incluindo cancelamentos sem pacote; o texto usa “nesta compra”.
- `Registrar recebimento` abre formulário com campos reais preenchidos pela solicitação, editáveis; prévia do líquido após recebimento e lembrete de taxa preservada. Exigir confirmação antes de registrar zero.
- “Ver detalhes” expande inline a base original das unidades, quantidade cancelada, componentes solicitado/recebido, custo líquido da linha e histórico de eventos, com teclado, aria-expanded, foco visível e reduced motion. Ações de alteração ficam nesse detalhe e são ocultadas quando os custos estão encerrados. `Corrigir valores recebidos` e `Anular registro` exigem motivo/confirmação com impacto visível.
- Anulados ficam em histórico secundário recolhido; não somam A receber, canceladas nem créditos.
- Próxima tarefa pode ser `Conferir reembolso de <produto>` depois das pendências existentes de valores/pagamentos/alocação/pacotes e antes de encerrar. Abre a subseção, sem marcar como recebido automaticamente.

### 9.3 Produtos, totais e pessoas

- Lista operacional usa itens com shippingQuantity > 0. Linha parcialmente cancelada mostra `3 compradas · 1 cancelada · 2 para envio` e seu custo líquido, incluindo residual das canceladas; detalhe explica a composição.
- Item totalmente cancelado sai dessa lista, mas sua composição/custo residual fica acessível na subseção Reembolsos. Sem unidades enviáveis, não renderizar o bloco Custos por produto nem tabela/empty state. Totais continuam incluindo a linha uma vez.
- Pagamento dos produtos mostra **Pagamento original**, base/taxa/total originais e pago. Abaixo, composição de bruto, reembolso recebido, A receber e líquido atual. Não exibir líquido como nova cobrança a pagar.
- Em Divisão por pessoa, exibir líquido conhecido/final e crédito/A receber sob demanda; quem ficou apenas com taxa/residual ainda aparece. Não omitir pessoas só por zero unidades de envio.
- Resumo geral e lista de acompanhamentos mostram líquido parcial/final com solicitado pendente explícito. Não marcar como concluído apenas porque produtos estão pagos.
- Conteúdo dos pacotes só contém unidades enviáveis. Editor exibe comprado/cancelado/neste pacote/outros/disponível; inserir máximo correto no input e validar no servidor.

### 9.4 Organização sugerida dos componentes

Criar `src/components/packages/refund-request-surface.tsx`, `refund-receipt-surface.tsx` e `refunds-section.tsx` se isso mantiver responsabilidades claras. Coordenar carregamento/mutações na tela existente. Compartilhar tipos e parser de centavos via `package-cost-client.ts`; extrair o parser de custos já existente e testá-lo, sem relaxar o limite global de preços de favoritos.

No parser extraído, aceitar entrada com vírgula ou ponto decimal e até duas casas, diferenciar vazio de zero e rejeitar expoentes/negativos. Validar o teto numérico em vez de copiar cegamente o regex de dez dígitos inteiros da tela: `10.000.000.000,00` é o teto de 1.000.000.000.000 centavos e requer onze dígitos inteiros. Se aceitar separadores de milhar, normalizá-los explicitamente antes da validação; cobrir `100,00`, `100.00`, `0`, vazio, teto exato e acima do teto.

Reutilizar Surface/Confirm, tokens, fonte Geist, Lucide e marcadores SVG. Inputs de valores totais em BRL, status textuais, ações com área de toque de pelo menos 44px, labels, erros acessíveis e foco restaurado. Respeitar reduced motion e breakpoint de lista mobile existente; não adicionar tabela larga no mobile.

## 10. Fases de implementação e gates

### Fase 0 — contrato e baseline

**Entrega:** baseline conhecido, fixtures definidas e especificação coerente.

- Conferir git status/commit e referências da seção 4 por símbolo. Ler planos 21/22, sem reabrir escolhas A/B/C/D.
- Atualizar pontualmente AGENTS.md/PROMPT_ONE_SHOT e docs 01–05, 08–09, 11–12, 15 com referência à extensão: cancelamento em custos não edita histórico, taxa original, líquido, unidades enviáveis e acompanhamento de recebido. Documentar o limite da elegibilidade baseada em logística manual.
- Registrar os defaults propostos da seção 2.2 como decisões técnicas do plano, sem atribuí-los como falas do usuário.
- Rodar baseline typecheck/lint/unit/integration/build. Criar fixtures descartáveis com produtos pagos, shared item, vários pacotes em preparo e um enviado.

**Gate:** falhas preexistentes identificadas; nenhuma alteração de outro trabalho sobrescrita; novas regras não conflitam com finalização/histórico.

### Fase 1 — persistência, snapshots e migração

**Entrega:** schema aditivo e leitura de refunds vazia compatível.

- Criar tabelas, CHECKs, FKs e índices; gerar migração/journal/snapshot Drizzle.
- Estender leitura/tipos com arrays vazios/defaults zero; novos acompanhamentos não criam refunds.
- Criar `tests/integration/package-refund-migration.test.ts`; atualizar db:verify.

**Gate:** migração em banco vazio e desde 0004, repetição idempotente, valores/paidAt/pesos/snapshots intactos; build/typecheck/lint e testes afetados passam. Nenhuma escrita remota.

### Fase 2 — cálculo puro de bruto, crédito e enviáveis

**Entrega:** contrato financeiro provado antes de expor gravações.

- Estender cálculo ou extrair `package-refund-calculations.ts` puro para validar quantidades/valores/agrupar créditos.
- Preservar BaseBruta/TaxaProdutos usando quantidade comprada. Usar enviáveis para cobertura de alocação e encargos atuais.
- Implementar agregação por componente/pessoa com proteção de centavos da seção 5.4; nunca subtrair esperado.
- Adaptar memberTotals, resumos e null/parcial, mantendo sem refunds igual ao baseline.
- Acrescentar fixtures numéricas da seção 11 em unitários; verificar totais por pessoa e geral.

**Gate:** taxa original idêntica antes/depois, créditos e líquido conciliam, nenhum custo individual negativo, all-cancelled válido; testes antigos de taxa/rateio continuam passando.

### Fase 3 — solicitar, retirar unidades e expor API

**Entrega:** criação transacional segura via serviço/API.

- Implementar refund.request, snapshots, retiradas explícitas, evento, revisão e validações de pacote vazio/encargos/logística.
- Implementar travas de bases/método/composição e máximo enviável em saveAllocations; preservar pacote não afetado.
- Acrescentar operação Zod/switch e códigos de erro HTTP; diferenciar confirmação de encargos de pacote da cobrança dos produtos.
- Criar `tests/integration/package-refunds.test.ts` com autorização, rollback por falha injetada, quantidades e não duplicação.

**Gate:** cancelar parcialmente em dois pacotes não muda cobrança original nem snapshot; conflito/erro não deixa crédito, retirada, reset ou revisão parcialmente gravados. Solicitar de unidade enviada é rejeitado no servidor.

### Fase 4 — recebimento, correções e encerramento

**Entrega:** ciclo financeiro completo e invariantes globais.

- Implementar update/receive/correct/void e eventos, incluindo recebido zero confirmado e valor real diferente do solicitado.
- closeTracking usa shippingUnits e bloqueia requested; reabertura existente continua independente da compra.
- Anulação desfaz crédito/cancelamento sem restaurar pacotes, mantendo evento original e exigindo alocação posterior.
- Criar `tests/integration/package-refund-concurrency.test.ts`; validar receive × receive, request × allocation, request × envio, receive × close, correct × void e duas solicitações do mesmo saldo.
- Usar transação e CAS no banco; duas conexões locais são mínimo, mas incluir pelo menos um teste com processos/isolates independentes se a fila global mascarar concorrência real. Não introduzir lock local como garantia em produção.

**Gate:** recebimento único, nenhuma dupla devolução, revisão stale rejeitada, encerrado somente leitura, taxa paga e histórico intactos após correções/reabertura.

### Fase 5 — interface completa e descoberta progressiva

**Entrega:** ação, formulários e leitura desktop/mobile.

- Implementar componentes sugeridos, campos manuais, preview, status e histórico; valores padrão integrais não sobrescrevem o manual silenciosamente.
- Adaptar lista operacional, composição, pagamento original, lista de acompanhamentos, pessoas e contadores.
- Mostrar travas de edição e bloqueios acionáveis, inclusive pacote vazio positivo. Nenhum pedido do app envolve autorização de pagamento real.
- Preservar expansão, rascunhos, foco e seleção de pacote. Confirmar apenas encargos de pacote explicitamente afetados.
- Atualizar testes de presentation/client e criar E2E dos fluxos novos sem usar dados reais.

**Gate:** usuário solicita/recebe/corrige/anula sem editar preço original; itens cancelados saem do envio, residual permanece consultável; pagamentos de produtos continuam pagos; cancelar qualquer modal não grava.

### Fase 6 — validação integrada, documentação e handoff

**Entrega:** implementação local revisável, evidências e publicação operacional preparada.

- Rodar gate completo da seção 12. Verificar migração sobre cópia isolada do schema anterior e sem refunds, mantendo contratos antigos.
- Inspecionar 320/390/768/1024/1440px, teclado, foco, erro, loading, reduced motion e no horizontal overflow.
- Capturar imagens desktop/mobile de solicitação manual, solicitado, recebido com residual, pessoas e totalmente cancelado. Salvar em `artifacts/qa/package-refunds/`.
- Atualizar docs canônicos necessários, este plano com status real e docs/IMPLEMENTATION_REPORT.md com checks/contagens reais, migração, arquivos e limitações.
- Entregar ordem backup → migração explícita → verificação → deploy autorizado → smoke test; não executar produção sem autorização específica.

**Gate:** matriz abaixo passa, documentação e UI conciliam, migração revisada, nenhuma alteração em Compra Outubro/2026 realizada automaticamente.

## 11. Fixtures numéricas e matriz de testes

### 11.1 Exemplos exatos em BRL

| Fixture | Esperado |
| --- | --- |
| Produto 100 + China 10, Pix 1%, uma unidade; pedido integral 110 | Pagamento original 111,10; taxa 1,10; solicitado: líquido atual 111,10 e A receber 110; recebido: líquido 1,10 |
| Mesmo produto; recebido produto 80 + China 10 | Crédito 90; líquido 21,10 = produto não devolvido 20 + taxa 1,10 |
| 3 unidades a 100 + China 10/unidade; cancelar 1 integral | Base 330, taxa 3,30, bruto 333,30; shippingUnits 2; recebido 110; líquido 223,30; taxa continua 3,30 |
| Item 100 + China 10, pesos Alice/Bob 60/40; recebido 80 + 10 | Bruto pessoal 66,66/44,44; crédito 54/36; líquido 12,66/8,44; soma 21,10 |
| Produto de 0,02, China 0, três pessoas iguais, taxa zero; dividir devolução em correção de 0,01 para 0,02 | Parcela original 0,01/0,01/0; crédito agregado 0,02 dá 0,01/0,01/0, sem líquido negativo |
| Duas unidades de 0,01, China zero, três pessoas; dois refunds de uma unidade e 0,01 cada | Crédito agregado final 0,02, parcelas 0,01/0,01/0; não 0,02/0/0 |
| Duas linhas 100 cada + China zero, frete Brasil 40 e taxa própria 1%; cancelar uma linha integral antes de envio | Taxa produtos 2 preservada, crédito 100; linha remanescente recebe Brasil 40 + taxa Brasil 0,40; geral 142,40; cancelada conserva taxa produtos 1 |
| Solicitado produto 70 + China 5; recebido produto 80 + China 10 sobre base original 100 + 10 | Aceitar dentro dos tetos; manter solicitado 75 e recebido 90 separados |
| Solicitado 110, recebido zero confirmado | Sem A receber; crédito zero; líquido 111,10 e perda não devolvida consultável; pode fechar se demais regras resolvidas |

Nos exemplos sem frete Brasil/Receita, resolver explicitamente os encargos como sem cobrança ou remover pacote vazio elegível; não tratar pendente como zero para obter total final.

### 11.2 Matriz obrigatória

| Área/caso | Resultado obrigatório |
| --- | --- |
| Sem refunds | Cálculos anteriores idênticos, incluindo null/zero/no_charge e taxa capturada |
| Total ou parcial das unidades | Quantity comprada intacta; só enviáveis podem ser alocadas |
| Reembolso monetário parcial | Retira as unidades escolhidas integralmente; diferença não devolvida continua custo |
| Solicitado/recebido | Esperado separado; desconto somente quando recebido; transição não duplica quantity |
| Vários refunds no item | Saldo cancelável correto; créditos agregados por componente; zero duplicação de centavos |
| Componentes separados | Produto/China respeitam próprios tetos; taxa/Brasil/Receita nunca reembolsados neste fluxo |
| Taxa/pagamento original | Método, bps, feeCents, paidAt/paidBy/status iguais antes/depois de request/receive/correct |
| Configuração Pix muda | Nenhum refund ou taxa original é recalculado pelo padrão novo |
| Bases após refund | Mudança real de preço/China de qualquer item ou taxa/método de produtos rejeitada enquanto houver não anulado |
| Divisão original | Sem mover taxa para remanescentes; bloquear recomposição de item com refund não anulado |
| Participante com peso zero | Não recebe crédito nem custo; não remover participante original do snapshot |
| Uma unidade em enviado + duas em preparo | Pode cancelar somente as duas elegíveis e suas retiradas; envio anterior protegido |
| Logística manual | Reembolso rejeita retiradas de pacote atualmente enviado/recebido; correções logísticas antigas continuam disponíveis, sem promessa de rastreabilidade física |
| Encargos pagos no pacote afetado | Confirmação prévia, reset só desses encargos; produtos continuam pagos |
| Pacote não afetado | Conteúdo, cobranças e confirmações intactos |
| Esvaziar pacote com encargo positivo | Rejeitar antes de escrever e explicar encargo; nunca apagar custo pago |
| Pacote vazio pendente/zero/no_charge | Continua explícito; fechamento mantém regra de obrigações; exclusão existente só quando elegível |
| Todas canceladas | shippingUnits zero permitido; taxa/residual e pessoas visíveis; fechamento possível após recebido/obrigações |
| Anulação de solicitado | Sem crédito/A receber; unidades liberadas sem pacote; motivo e eventos mantidos |
| Anulação de recebido | Crédito retirado do líquido; quantidade liberada sem restaurar enviado; confirmação do impacto |
| Correção financeira | Eventos antes/depois; snapshot de participantes preservado; sem recriar cancelamento |
| Encerramento/reabertura | Solicitado bloqueia; encerrado rejeita toda escrita; reabrir não altera purchase.status |
| Recebimento após envio dos remanescentes | Aceitar para cancelamento previamente válido; não criar reembolso de enviados |
| IDs estrangeiros | Rejeição sem vazamento/escrita; item/refund/pacote pertencem ao mesmo tracking autorizado |
| Payload/origem/sessão | Zod estrito, origin/session/membership obrigatórios; no-store em respostas |
| Revisão/double submit | Uma transação vence; nenhuma escrita parcial; reload revela sucesso cuja resposta se perdeu |
| Falha em evento/participantes/CAS | Rollback de refund, alocações, reset e revisão; injetar falha real por trigger/helper de teste |
| Dinheiro inválido/overflow | Rejeitar negativo, fracionário, acima de teto/limite e soma insegura |
| Centavos e composição | Soma pessoal = geral; crédito pessoal <= bruto do componente; ordem estável após reload/renomeação |
| Snapshot histórico | Favorito, purchase_items e purchase_item_participants intactos após todos os estados |
| UX cancelamento/erro | Fechar modal não escreve; erro mantém rascunho; conflito pede revisão sem repetir mutação |
| UI responsiva/acessível | Sem overflow, três seções, foco correto e nenhum controle oculto focável |
| Migração antiga/repetida | Nenhum refund automático; pagamentos/histórico/logística intactos |

## 12. Comandos de validação e cuidados operacionais

Scripts atuais, sem necessidade de atualizar dependências:

```text
npm run typecheck
npm run lint
npx vitest run tests/unit/package-cost-calculations.test.ts tests/unit/package-cost-presentation.test.ts tests/unit/package-cost-client.test.ts
npx vitest run tests/integration/package-costs.test.ts tests/integration/package-refunds.test.ts tests/integration/package-refund-migration.test.ts tests/integration/package-refund-concurrency.test.ts
npx playwright test tests/e2e/packages.spec.ts tests/e2e/package-refunds.spec.ts
npm run check
npm run test:e2e
```

Se testes novos forem separados em outros arquivos, incluir seus caminhos no gate. `npm run check` já executa typecheck + lint + todos os testes Vitest + build; evitar repetir o mesmo gate sem mudança/falha que justifique. Baseline desta tarefa de planejamento não executou checks da aplicação; não copiar números do plano 22 como evidência desta extensão.

Para migração/verify locais em PowerShell, definir **destino descartável explícito** antes dos comandos, restaurando o ambiente depois:

```powershell
$refundPreviousDbUrl = $env:TURSO_DATABASE_URL
$refundPreviousDbToken = $env:TURSO_AUTH_TOKEN
try {
  # Usar um caminho novo por execução; não sobrescrever banco local do usuário.
  $env:TURSO_DATABASE_URL = 'file:./data/refunds-migration-qa-<id-unico>.sqlite'
  Remove-Item Env:TURSO_AUTH_TOKEN -ErrorAction SilentlyContinue
  npm run db:migrate
  if ($LASTEXITCODE -ne 0) { throw 'Falha na migração local' }
  npm run db:verify
  if ($LASTEXITCODE -ne 0) { throw 'Falha na verificação local' }
} finally {
  $env:TURSO_DATABASE_URL = $refundPreviousDbUrl
  $env:TURSO_AUTH_TOKEN = $refundPreviousDbToken
}
```

O `<id-unico>` é placeholder a substituir; não usar destino remoto nem `.env` implicitamente. Testes de upgrade devem criar diretório/banco temporário próprios, fechar conexões e validar o caminho antes de qualquer remoção recursiva. Não exibir credenciais salvas no terminal.

Capturas E2E: seguir o padrão opt-in existente `LOTI_CAPTURE_PACKAGES_QA`; para o arquivo novo, usar `LOTI_CAPTURE_REFUNDS_QA=1` e pasta `artifacts/qa/package-refunds/`, documentando o nome efetivamente implementado.

## 13. Publicação e uso em Compra Outubro/2026

1. Handoff local inclui migração gerada, regras revisadas, gates reais e instrução de backup/recuperação.
2. Quando houver autorização específica, verificar banco/ambiente corretos e backup recuperável; aplicar migração explicitamente, rodar verify e publicar código dependente. Nenhuma migração durante request/startup.
3. Código anterior deve tolerar tabelas/coluna aditivas, mas **não pode continuar recebendo escritas depois do primeiro refund**: ele ignora cancelamentos e travas. Coordenar deploy sem escritores antigos concorrentes; não considerar rollback apenas de código seguro após novos registros. Preferir correção em frente ou bloquear escritas até versão compatível.
4. Smoke test em ambiente isolado: login → custos com produtos pagos → solicitação → retirada → recebido → taxa idêntica → pessoas conciliadas → fechamento/reabertura.
5. Em produção, abrir Compra Outubro/2026 e conferir as linhas/quantidades reais, preços/fretes China e pagamento original. Informar manualmente os itens cancelados e valores; não fazer script de backfill pelo nome da compra.
6. Se já recebeu o dinheiro, registrar solicitado e imediatamente recebido, com valores reais. As datas serão de registro no app; motivo pode explicar que o reembolso ocorreu anteriormente, sem inventar timestamp.
7. Conferir taxa Pix antes/depois, valor devolvido, líquido por pessoa, conteúdo dos pacotes e ausência de unidades canceladas como pendência de envio. Dados financeiros não devem ser alterados para contornar uma validação.

Limitações conscientes: sem tracking de unidades individuais; elegibilidade baseada no estado logístico manual atual, sem recuperar envios anteriores corrigidos pelo grupo; pacote sem unidades com custo positivo não é coberto; sem reembolso parcelado/superior ao original; bases de produtos ficam protegidas enquanto houver reembolso válido. Registrar isso na entrega sem prometer capacidade além do implementado.

## 14. Registro de execução — 14 de outubro de 2026

Fases 0–6 executadas sequencialmente. O mapa da seção 4 e os planos 21/22 foram usados como contexto; nenhuma decisão visual foi reaberta e nenhum snapshot finalizado foi editado.

- **Fase 0:** regras incorporadas pontualmente nos documentos canônicos; baseline conhecido. `npm run typecheck`, `npm run lint` e a suíte Vitest completa passam no workspace Windows. Testes que não verificam persistência usam libSQL em memória compartilhada; o teste de concorrência de reembolsos usa processos Node independentes sobre um banco local descartável.
- **Fase 1:** migração aditiva `drizzle/0005_fancy_shooting_star.sql`, journal/snapshot Drizzle, tabelas verificadas por `db:verify`; upgrade 0004 e repetição passam sem criar reembolsos nem alterar pagamentos/snapshots.
- **Fase 2:** bruto, taxa, crédito recebido e solicitado, enviáveis, canceladas e centavos pessoais conciliam nas fixtures puras e na integração. Pagamento/taxa original permanecem; valores solicitados não são subtraídos.
- **Fase 3:** request transacional, retirada por pacote/unidades sem pacote, autorização, revisão, trava de edição, reset confirmado apenas dos encargos afetados, pacote vazio positivo, rollback por trigger e disputa entre processos cobertos.
- **Fase 4:** received, recebido zero, correção auditada inclusive a zero com confirmação na UI, void, stale revision e bloqueio de fechamento com solicitação pendente cobertos. Corridas entre processos cobrem requests duplicados, request × allocation, request × envio, receive × close e correct × void. Retry limitado de `SQLITE_BUSY` permite que CAS decida a operação vencedora. Fechamento/reabertura continuam sem alterar `purchase.status`.
- **Fase 5:** resumo progressivo, histórico, formulários manuais, valores diferentes do solicitado, confirmação, foco inicial, cancelamento sem escrita e abertura do residual/composição após cancelamento integral exercitados no E2E. O cenário Chromium passa sem overflow a 320/390/768/1024/1440 px.
- **Fase 6:** capturas inspecionadas em `artifacts/qa/package-refunds/`: `refund-request-form-desktop.png`, `refund-requested-desktop.png`, `refund-requested-mobile.png`, `refund-receipt-form-desktop.png`, `refund-received-desktop.png`, `refund-void-confirmation-mobile.png`, `refund-all-cancelled-desktop.png`, `refund-people-desktop.png`. A migração e `db:verify` foram executados em SQLite local descartável; nenhuma base remota/produção foi acessada.
- **Validação/revisão final:** `npm run typecheck`, `npm run lint` sem avisos, `npm test -- --maxWorkers=1` (168 passaram, 7 ignorados), `npm run build`, E2E de custos + reembolsos (2 cenários), migração/verify (23 tabelas) e code review GPT‑6.1 Sol medium passaram. O Vitest paralelo teve um erro de cache SSR temporário `ENOENT` no sandbox Windows; repetir com um worker passou integralmente.

**Handoff operacional:** backup/snapshot aprovado → definir explicitamente `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` do alvo autorizado → executar `npm run db:migrate` → `npm run db:verify` → publicar somente com autorização específica e sem escritores antigos concorrentes → smoke test autenticado isolado. Não executar em produção nesta tarefa. Não registrar dados de Compra Outubro/2026.


## 15. Refatoração visual aprovada — 15 de outubro de 2026

Implementada a Proposta 1, resumo + lista compacta, em `refunds-section.tsx`, com linha e detalhe separados no mesmo módulo e tokens existentes. A seção não ocupa espaço quando não há registros, e Custos por produto só aparece com unidades enviáveis. Capas reutilizam a apresentação QC privada existente; nenhuma regra financeira, schema, snapshot ou cálculo foi alterado.

Validação local: lint e typecheck; 226 testes Vitest passaram, 7 ignorados; build de produção passou; três cenários Playwright de Reembolsos/Pacotes passaram. A matriz cobre nenhum/um/vários registros, vários produtos e múltiplos reembolsos da mesma linha, cancelamento parcial/total, recebido menor que a base, recebido zero, correção/anulação, leitura após encerramento, teclado, reduced motion e ausência de overflow em 320/390/768/1024/1440 px. Capturas desktop/mobile inspecionadas: `artifacts/qa/package-refunds/refunds-summary-{320,390,768,1024,1440}.png`.

O Playwright final usou um build de produção local, porta 3107 e banco descartável exclusivos para evitar falhas intermitentes de manifests do servidor Next em desenvolvimento durante trabalhos simultâneos. Os scripts/configs temporários foram removidos. Nenhum ambiente remoto, produção, publicação ou migração de produção foi usado.
