# Direitos individuais — composição do saldo por produto

Data: **20/10/2026**. Status: **implementado e validado localmente; suíte global com uma falha preexistente de concorrência**.

Base inspecionada: commit `5074159`, schema, serviços financeiros, endpoint da conta, painel, CSS e testes existentes. Não houve consulta ao banco de produção. A captura fornecida é referência de interface e valores; ela não permite identificar qual produto gerou o saldo real de uma pessoa.

## 1. Pedido e conclusão de viabilidade

O usuário pediu investigar a possibilidade de mostrar, em **Direitos individuais**, os produtos que compõem o saldo de cada pessoa, removendo **Última revisão** para ampliar a seção. Esta etapa autoriza investigação e plano, sem alterar a aplicação.

Após a investigação, o usuário pediu **efetue a implementacao**, autorizando a execução local deste plano. O registro abaixo descreve a etapa documental original; a seção 9 registra a implementação posterior.

**É possível com o modelo atual, sem migração para a proposta abaixo.** Créditos de reembolsos registrados pelo fluxo atual conservam o vínculo com o reembolso e, por ele, com o produto. Parcelas por titular e consumos persistidos permitem explicar o saldo remanescente em CNY e sua base histórica BRL.

A cobertura não é universal: abertura de saldo antigo, conciliação manual e determinadas compensações não têm uma identificação única e segura de produto para cada parcela restante. Devem aparecer como origens identificadas por tipo, sem inventar associação. Se futuramente for exigida atribuição exata por produto desses saldos agregados, será outra evolução de dados/reconciliação.

## 2. Evidências do código atual

| Local | Constatação | Consequência |
| --- | --- | --- |
| `src/components/packages/hubbuy-accounts-panel.tsx`, `AccountBalance` e renderização perto das linhas 308–309 | A seção mostra somente nome e totais por pessoa; Última revisão ocupa a outra coluna | A alteração visual fica concentrada no painel e no CSS |
| `src/components/packages/hubbuy-accounts.css`, `.hubbuy-account-facts` | Grade desktop com duas colunas | Substituir por seção de largura integral |
| `src/lib/domain/hubbuy-balance-services.ts`, `calculateLedgerState()` | Carrega lançamentos, parcelas e consumos; agrega direitos por pessoa | A informação por lote existe antes da agregação |
| Mesmo serviço, `getAccountBalance()` | Devolve totais e conciliação, sem composição de direitos | Estender o DTO de leitura, reutilizando a transação autorizada |
| `src/app/api/hubbuy/accounts/[accountId]/route.ts`, GET | Exige sessão e usa `getAccountBalance()` com cabeçalhos privados | Reutilizar a rota e preservar autorização |
| `src/lib/domain/package-cost-services.ts`, emissão de créditos | Grava `sourceType: refund_received`, `sourceId: refund.id` e parcelas dos titulares | Vínculo direto entre crédito recebido e reembolso |
| `src/lib/db/schema.ts`, `purchaseCostRefunds` e `purchaseItemCosts` | Refund aponta para `costItemId`; custo aponta para `purchaseItemId` ou `additionalOrderItemId` | Resolver snapshot do produto original ou adicional |
| `src/lib/domain/package-cost-reading.ts` | Já resolve produtos originais/adicionais por essas referências | Reutilizar o padrão, sem carregar o acompanhamento completo por produto |
| `src/lib/domain/purchase-order-corrections.ts` | Compensação devolve crédito por titular, agregando os consumos de um débito | Não afirmar que todo crédito restaurado equivale a um produto de origem único |

Os números de linha são referências da investigação; conferir símbolos e diff na execução.

## 3. Experiência proposta

1. Remover o bloco **Última revisão** da interface. Manter revisão e ledger no servidor e nas operações: continuam necessários para concorrência e conciliação.
2. Fazer **Direitos individuais** ocupar toda a largura disponível abaixo de Saldo atual.
3. Para cada pessoa, mostrar nome e total remanescente; abaixo, a composição em produtos/origens com os respectivos valores.
4. Desktop: lista com produto/origem à esquerda e `¥ … · R$ …` à direita. Mobile: valores abaixo do nome da origem, sem rolagem horizontal.
5. Exibir inicialmente até três origens por pessoa; acima disso, oferecer **Ver todas as origens (N)** e **Recolher**. O total da pessoa sempre inclui todas as origens. Expansão local acessível, com `aria-expanded`, sem nova consulta.
6. Mostrar uma explicação curta: **Valores disponíveis após usos do saldo. R$ representa a base histórica.**

Exemplo ilustrativo, sem afirmar a origem real dos valores da captura:

```text
Direitos individuais
Valores disponíveis após usos do saldo. R$ representa a base histórica.

Brunna Pereira Borges Arantes                  ¥ 18,98 · R$ 14,25
  Produto X · Reembolso recebido               ¥ 18,98 · R$ 14,25

Outra pessoa                                  ¥ 50,00 · R$ 37,00
  Produto Y · Reembolso recebido               ¥ 30,00 · R$ 22,00
  Saldo inicial conciliado                     ¥ 20,00 · R$ 15,00
```

Nome/variação vêm do snapshot da compra, nunca do favorito atual. Mesmo nome em pedidos diferentes não implica o mesmo produto. Para origem de reembolso validada, oferecer link **Ver compra** para `/packages/[trackingId]`; não prometer abrir um refund específico sem suporte existente para isso. Sem fotografias: texto basta; caso seja usado marcador, seguir `resolveProductCategory()` e a biblioteca SVG interna.

Estados: carregando, erro com tentativa novamente, nenhuma origem remanescente e conta não conciliada. Respeitar o tratamento atual de falhas; ausência de resposta não pode parecer saldo zero. Se houver divergência, identificar os direitos como não conciliados e não apresentar a composição como confirmada.

## 4. Regras de composição

### 4.1 Valores restantes, sem novo rateio

Para cada `hubbuy_balance_credit_shares.id`:

```text
CNY disponível = amountCnyMinor − soma(consumptions.amountCnyMinor)
BRL histórico disponível = historicalBrlCents − soma(consumptions.historicalBrlCents)
```

Usar os consumos persistidos, inclusive os de compensação. Não recalcular FIFO, câmbio, proporção do refund ou base BRL restante a partir de uma taxa média. Reutilizar a redução já feita por `calculateLedgerState()` ou extrair um helper puro compartilhado, preservando seu resultado financeiro.

Agrupar somente após calcular cada parcela. Cada parcela pertence exatamente a uma origem. A soma das origens precisa fechar, em ambas as moedas, com o direito da pessoa; a soma CNY dos direitos deve fechar com o ledger quando conciliado. Usar inteiros e `BigInt` nos intermediários, com as validações existentes antes da serialização.

Ocultar parcelas com ambos os valores zerados. Caso exista CNY zero e base BRL positiva, não descartá-la silenciosamente: preservar a reconciliação da composição e sinalizar o estado conforme a validação financeira existente. CNY positivo com BRL zero é possível e deve ser exibido.

### 4.2 Identificação das origens

| Tipo do crédito | Apresentação proposta |
| --- | --- |
| `refund_received`, vínculo válido | Produto e variação do snapshot, rótulo Reembolso recebido e referência da compra |
| `opening_balance` | Saldo inicial conciliado; sem produto atribuído |
| `manual_adjustment` ligado a evento de conciliação | Crédito de conciliação; descrição validada do evento como contexto opcional, nunca interpretada como ID de produto |
| `reversal` que devolve saldo após correção de pedido | Saldo restaurado por correção; referência do pedido/acompanhamento somente quando validada |
| Tipo não reconhecido ou referência indisponível | Origem não identificada, preservando o valor e sem link inválido |

Para reembolsos, seguir o caminho:

```text
creditShare.creditEntryId → balanceEntry(sourceType = refund_received)
balanceEntry.sourceId → purchaseCostRefunds.id
refund.costItemId → purchaseItemCosts
  → purchaseItems (original)
  ou purchaseAdditionalOrderItems (adicional)
```

Conferir também a relação custo → tracking → workspace autorizado e conta do lançamento. `sourceId` é texto polimórfico, sem FK direta para refund; não confiar somente na coincidência do ID. Referências de outro workspace não podem vazar nome, valores contextuais nem links.

Não filtrar a projeção apenas por `refund.status`: correções/anulações preservam lançamentos antigos e os compensam com novos registros. O saldo restante vem de parcelas menos consumos; o refund serve para resolver a descrição. Solicitação pendente, recebimento zero ou devolução externa não geram uma origem de saldo fictícia.

Vários créditos remanescentes da mesma pessoa e do mesmo `costItemId` podem ser somados numa linha, mantendo internamente os IDs dos lotes/refunds contribuintes. Produtos de `costItemId` diferentes continuam separados. Para origens não ligadas a produto, manter uma linha por lançamento; não colapsar todos os ajustes numa descrição genérica única. Ordenar pela menor sequência contribuinte, com desempate por ID.

### 4.3 Limite explícito das compensações

Uma correção de adicional pode juntar, num novo crédito por titular, saldo originalmente consumido de vários produtos/lotes. Após usos posteriores desse crédito agregado, a persistência não define qual suborigem interna foi consumida primeiro. Distribuir esse remanescente entre os produtos antigos criaria uma regra nova.

Nesta proposta, **Saldo restaurado por correção** é uma origem completa e honesta que fecha os totais. Não reconstruir uma atribuição exata inexistente nem relacionar o crédito restaurado somente ao produto que havia sido comprado com ele. Não expandir a investigação para um novo ledger de genealogia.

## 5. Contrato e desenho técnico

Estender aditivamente cada elemento de `rights` com `origins`, preservando `personId`, `availableCnyMinor` e `availableHistoricalBrlCents`. Tipo sugerido:

```ts
type RightOrigin = {
  id: string; // estável: refund-product:<costItemId> ou entry:<entryId>
  kind: "refund_product" | "opening_balance" | "reconciliation" | "restored_balance" | "unknown";
  label: string;
  variant: string | null;
  trackingId: string | null;
  costItemId: string | null;
  availableCnyMinor: number;
  availableHistoricalBrlCents: number;
};
```

IDs internos contribuintes podem permanecer apenas no servidor/testes. Não devolver ledger completo, payloads de operações, evidências privadas ou objetos brutos de banco para montar esta seção. Não é necessário endpoint por pessoa/produto.

Na mesma transação de `getAccountBalance()`:

1. Autorizar conta/workspace e reconstruir o estado como hoje.
2. Derivar parcelas remanescentes e selecionar apenas suas origens.
3. Buscar refunds, custos, snapshots e contexto autorizado em lotes de IDs únicos, com projeções mínimas. Particionar `IN` quando necessário para respeitar o limite de parâmetros SQLite/libSQL.
4. Montar mapas, resolver origens e agrupar. Evitar buscas SQL por pessoa/produto e chamadas repetidas a `readCostTracking()`.
5. Validar somas antes de devolver totais e origens do mesmo estado transacional.

Arquivo sugerido para a projeção: `src/lib/domain/hubbuy-rights-presentation.ts`, com função pura que recebe parcelas/consumos/contextos já carregados. Alternativa equivalente é helper no serviço, desde que não duplique a aritmética. Definir contrato compartilhado server/client sem importar dependências de banco no navegador.

## 6. Fases de implementação futura

### Fase 0 — preparação

Ler `AGENTS.md`, `PROMPT_ONE_SHOT.md` e canônicos 00–17 na ordem exigida antes de código. Ler os planos 23, 26 e 29 integralmente; consultar 21/30 para apresentação e limites financeiros. Conferir mudanças correntes e preservar trabalho de outras tarefas. Nesta investigação já existiam mudanças em `docs/INDEX.md` e o arquivo novo `docs/33_QC_VIEWER_PERFORMANCE_PLAN.md`; não reverter nem assumir autoria.

### Fase 1 — projeção e API

Implementar cálculo de origens remanescentes e consultas em lote; ampliar DTO/GET; validar autorização e somas com fixtures sintéticas em banco descartável. Nenhuma alteração de schema, migração ou comando financeiro prevista.

### Fase 2 — interface

Remover Última revisão e o ícone/import que ficar sem uso. Refazer a grade em largura integral; renderizar pessoas, totais, produtos e demais origens, expansão e estados. Preservar extrato, ações de conta, conciliação, seleção de conta e revisões dos comandos.

### Fase 3 — validação e entrega

Executar testes direcionados, typecheck, lint e build; validar Playwright desktop/mobile com dados sintéticos. Registrar screenshots e resultado dos gates. Entregar resumo dos arquivos alterados e limitações. Sem produção, publicação ou registro financeiro real.

## 7. Casos de teste e aceite

| Caso | Resultado esperado |
| --- | --- |
| Um produto/uma pessoa | Total do direito igual à única origem; exemplo sintético de ¥18,98/R$14,25 |
| Vários produtos/pessoas e produto compartilhado | Soma exata por titular; mesma origem pode contribuir para pessoas distintas |
| Consumo parcial e total FIFO | Mostrar somente remanescente persistido, sem repetir valor integral recebido; esgotado sai da composição |
| Centavos e BRL zero | Preservar centavos sem conversão nova; CNY positivo/BRL zero continua visível |
| Mesmo nome em compras distintas | Linhas distintas por identidade do custo, com contexto de compra |
| Vários refunds do mesmo produto | Agrupar por custo, preservando soma e ordenação estável |
| Pedido adicional e refund com financiamento | Snapshot correto e titular do crédito persistido, inclusive financiador; não inferir titular pelos participantes atuais |
| Correção/anulação de recebimento | Crédito antigo compensado não reaparece como disponível; nenhuma dupla contagem |
| Correção de adicional com origens misturadas | Saldo restaurado por correção, valores exatos; sem inventar produto de origem |
| Conciliação antiga | Rótulo de saldo inicial/crédito de conciliação com total íntegro |
| Referência ausente ou inválida | Origem não identificada; sem sumir dinheiro, falhar toda a página ou vazar outro workspace |
| Requested, externo, zero | Nenhuma origem de crédito fictícia |
| Sem sessão/outro workspace/conta excluída | Acesso negado conforme contrato existente |
| Leitura concorrente a uso do saldo | Totais e composição vêm do mesmo snapshot transacional |
| Muitos lotes | Consultas em lote, sem N+1 e sem exceder limite de parâmetros; expansão não corta o total |
| Seleção, refresh e falha de API | Não misturar origens entre contas nem apresentar falha como zero |
| Desktop e mobile | Última revisão ausente; nova seção de largura integral; 1440, 1024, 768, 390 e 320 px sem overflow |
| Acessibilidade | Expansão e links com teclado, foco visível e nome acessível |

Estender `tests/integration/hubbuy-balance-services.test.ts`, `tests/integration/package-refund-hubbuy.test.ts`, os testes existentes de correção de adicionais e `tests/e2e/hubbuy-accounts-ui.spec.ts`. Adicionar testes unitários da projeção para os casos financeiros/agrupamento. Testar também que a consulta não altera lançamentos, parcelas, consumos ou revisões.

Comandos de referência: `npm run typecheck`, `npm run lint`, `npx vitest run <arquivos reais alterados>`, `npx playwright test tests/e2e/hubbuy-accounts-ui.spec.ts` e `npm run build`. Substituir o placeholder antes da execução. Confirmar o isolamento de testes antes de comandos que usem banco; não executar migrations apenas para validar esta proposta.

## 8. Resultado desta investigação

Criado somente este plano. Aplicação, saldos, reembolsos e banco não foram alterados; testes da aplicação não foram executados nesta etapa documental. A remoção de Última revisão faz parte da implementação futura solicitada. A origem real do saldo da Brunna não foi verificada em dados reais.

## 9. Implementação local — 20/10/2026

- Projeção `hubbuy-rights-presentation.ts`: agrupa parcelas remanescentes por produto e titular, mantém origens desconhecidas/conciliadas/restauradas e verifica fechamento CNY/BRL contra os totais individuais.
- Leitura `hubbuy-rights-reading.ts`: resolve snapshots originais/adicionais por consultas em lotes de até 400 IDs, com validação de conta, workspace, compra, pedido e acompanhamento. Usa projeções mínimas, sem devolver payloads financeiros brutos.
- `calculateLedgerState()` expõe as parcelas disponíveis já calculadas. As consultas de parcelas/consumos usam joins por conta para evitar limites de parâmetros; nenhuma regra de FIFO, taxa ou conversão foi alterada. Resíduo BRL em lote sem CNY e divergência entre direitos/ledger são sinalizados como não conciliados.
- `getAccountBalance()` entrega `rights[].origins` aditivamente, na mesma transação autorizada dos totais.
- Interface em `hubbuy-individual-rights.tsx`: seção em largura integral, produtos/variações, valores remanescentes, links para compra, três origens iniciais e expansão acessível. Última revisão e seu CSS foram removidos; revisões financeiras continuam preservadas no servidor.
- Não há migração, backfill, escrita financeira por leitura, mudança de snapshots, publicação ou configuração externa nesta entrega.

### Validação executada

| Gate | Resultado |
| --- | --- |
| TypeScript strict | Passou |
| ESLint | Passou |
| Suíte direcionada de origens, contas, reembolsos e correções | **34 passaram; 1 caso multiprocesso foi excluído desta execução direcionada**, relatado abaixo |
| Suíte Vitest completa | **410 passaram, 7 ignorados e 1 falhou**, em 60 arquivos |
| Caso multiprocesso repetido isoladamente | Passou; a intermitência global permanece registrada |
| Build Next.js | Passou, com saída isolada, banco em memória e segredo efêmero de QA |
| Chromium | **3 jornadas passaram**: seleção/erros/retry/extrato, composição/expansão/teclado/recarga/alerta de divergência e recebimento de refund/pagamento misto |
| Responsividade | 1440, 1024, 768, 390 e 320 px sem overflow da página; seção com a mesma largura do cartão de saldo |
| Inspeção visual | Capturas desktop e mobile conferidas |

O único erro da suíte completa foi `purchase-order-corrections.test.ts` → `serializes identical confirmations from independent processes without duplicate credit`, com `SQLITE_BUSY: database is locked`. O mesmo problema já consta no registro do plano 29; também ocorreu na primeira execução direcionada e passou quando repetido isoladamente. Nenhum teste novo de origens falhou. Não considerar a suíte global inteiramente aprovada nem remover o teste para ocultar a pendência.

A cobertura inclui consumo parcial com base BRL exata, correção/anulação sem dupla contagem, refund de adicional com direitos do financiador e do beneficiário, saldo restaurado, resíduos inconsistentes, origens desconhecidas, contas/workspaces distintos, mais de 400 referências e leitura sem escrita/revisão. Um teste antigo de extrato esperava data ausente apesar de a fixture fornecer a data de registro em todas as linhas; a primeira linha agora tem ambas as datas nulas, mantendo a verificação de ausência de data.

As primeiras tentativas de build/localhost encontraram restrições do sandbox Windows; os gates finais passaram com execução local autorizada, sem produção. O navegador usou portas 3120/3121, banco exclusivo `data/e2e-refunds-rights-<id>.sqlite` e diretórios de relatório próprios para evitar colisões com outra tarefa em execução. A configuração, o servidor temporário e o build `.next-rights-qa` foram removidos após os testes. As mudanças simultâneas de outra tarefa nos drawers de adicionais, CSS global, configuração gerada do Next e respectivos testes foram preservadas.

Evidências sintéticas em `artifacts/qa/hubbuy-rights/`: `origins-1440.png`, `origins-390.png`, `origins-320.png` e relatório Playwright. Não foram consultados saldos reais nem alterados favoritos, snapshots, pagamentos, taxas ou créditos de produção. Não há migração adicional para publicar esta funcionalidade; publicação não foi executada.

### Variação de apresentação — 20/10/2026

Após avaliar a primeira versão, o usuário pediu uma exibição diferente e a remoção de **Ver compra**. Essa instrução substitui a proposta de links da seção 3. A composição passa a usar uma grade responsiva de blocos neutros, com marcador de categoria pequeno, nome/variação e valores CNY/BRL próximos dentro de cada bloco. Não há links ou ações nos produtos; expansão/recolhimento continuam no grupo da pessoa. Créditos sem produto usam marcador financeiro neutro. Totais, origens persistidas e cálculos permanecem iguais.

Validação desta variação: TypeScript, lint e build passaram. A jornada Chromium de composição passou, incluindo ausência de links, expansão por teclado, recarga, divergência e larguras 1440/1024/768/390/320 px. Capturas desktop/mobile atualizadas em `artifacts/qa/hubbuy-rights/` e inspecionadas visualmente. Relatório isolado em `artifacts/qa/hubbuy-rights-ux/`. Nenhuma alteração financeira ou de schema; sem publicação.

### Refinamento de densidade — 20/10/2026

O usuário substituiu os cards por **uma linha compacta por produto**, priorizando listas longas, e pediu ícones sem o traçado ao redor. Nome/variação ficam à esquerda, com truncamento visual de textos longos e conteúdo completo preservado no título e na leitura assistiva; CNY e BRL ficam à direita, na mesma linha. Marcadores de 20 px usam apenas o ícone, sem borda, fundo ou sombra. Separadores discretos distinguem as linhas; a informação repetida de recebimento permanece acessível a leitores de tela, sem acrescentar altura visual. Continua sem Ver compra, sem alteração de valores e com expansão do grupo.

Validação: TypeScript, lint, build e a jornada Chromium de composição passaram. O teste confirma linhas de até 44 px, alinhamento vertical entre produto e valores, ausência de borda/fundo/sombra nos marcadores e ausência de overflow em 1440/1024/768/390/320 px. Capturas atualizadas e inspecionadas; execução em portas/banco descartáveis, sem publicação.
