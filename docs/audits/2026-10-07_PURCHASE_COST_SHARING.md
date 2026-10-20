# Auditoria: rateio de um item da compra entre participantes

Data: 07/10/2026. Escopo: auditoria do código existente e proposta técnica; nenhuma implementação da funcionalidade ou migração foi realizada.

## Conclusão

Complexidade média, com maior esforço no domínio financeiro e formulário por suportar divisão igual e desigual entre participantes escolhidos. O usuário confirmou um único item físico, estado compartilhado e somente rateio do custo, sem gestão de revenda. A arquitetura atual comporta a extensão sem trocar stack, autenticação ou infraestrutura. O esforço principal é substituir a suposição “um item = uma pessoa” por “um item = uma ou mais participações”, preservando totais, quantidade, checklist e histórico.

Estimativa preliminar atualizada: 5–8 dias de trabalho de desenvolvimento, incluindo migração, UI e testes, para divisão igual e divisão desigual por percentuais ou valores em reais. É uma estimativa de planejamento, não um prazo garantido. O usuário confirmou as duas opções de divisão desigual. O formulário precisa distinguir seus comportamentos quando preço/quantidade mudar. Controle de revenda/lucro está excluído pela resposta do usuário.

## Evidências no código

| Área | Evidência | Consequência |
| --- | --- | --- |
| Banco | `src/lib/db/schema.ts:39`: `purchase_items.person_id` obrigatório; quantidade, preço unitário e estado do carrinho ficam no item | Não há representação de participantes ou parcelas vinculadas |
| Validação | `src/lib/domain/validation.ts:9`: entrada aceita um `personId` | Precisa aceitar e validar seleção múltipla |
| Escrita | `src/lib/domain/purchase-services.ts:50`: favorito e item manual geram uma linha para uma pessoa | Criar/editar item e participações juntos, atomicamente |
| Totais | `src/lib/domain/money.ts:13`: subtotal é quantidade × preço; total por pessoa filtra `personId` | Separar custo físico e custo atribuído a cada participante |
| Formulário | `src/components/purchase/item-editor.tsx:13`: campo único “Para quem é?” | Incluir opção de dividir, seleção de participantes e prévia das parcelas |
| Compra | `src/components/purchase/purchase-screen.tsx:179`: filtros, grupos, resumos e detalhes dependem de `personId` | Exibir o mesmo ID físico em todos os grupos participantes |
| Checklist em lote | `src/lib/domain/purchase-services.ts:83`: seleciona linhas pelo `personId` | Incluir itens compartilhados e explicitar que marcar afeta todos |
| Leitura | `src/lib/domain/services.ts:22`: entrega itens e membros; `ClientData` espelha a leitura | Incluir participações na leitura autenticada e nos tipos |
| Transporte | `src/app/api/app/route.ts`, `src/components/workspace-provider.tsx` | Adaptar contratos existentes ou acrescentar operações de rateio |
| Histórico | `src/components/purchase/history-screen.tsx`: usa `purchaseSummary` e reutiliza `PurchaseView` | Rateio precisa funcionar tanto na lista quanto no detalhe finalizado |
| Favoritos | `src/components/favorites/favorites-screen.tsx:28`: identifica presença por `sourceFavoriteId` | Preservar a referência de origem em um único item |
| Importação legada | `scripts/legacy-importer.ts:76`: grava um `personId` por item | Preservar compatibilidade ou criar participação de 100% na importação |

Os caminhos e linhas acima referem-se ao checkout auditado; podem mudar em futuras alterações.

## Por que duplicar linhas não resolve adequadamente

Foi executado o cálculo real de `purchaseSummary()` com três linhas, cada uma com quantidade 1 e preço de 10.000 centavos. Resultado: total de 30.000 centavos, três pessoas e **três unidades**. O objeto comprado é uma RAM, portanto o total monetário parece correto, mas a contagem física e o progresso do HubBuy ficam incorretos. Editar/remover/marcar uma linha também não atualiza as demais.

Usar quantidade fracionária não é solução: a validação e o banco exigem quantidade inteira >= 1. Notas livres também não estabelecem vínculos ou garantem a soma das parcelas.

## Proposta recomendada para o escopo confirmado

Manter `purchase_items` como o produto físico e seu snapshot: nome, link, categoria, variação, notas, quantidade, preço unitário, origem e estado único de carrinho. Acrescentar `purchase_item_participants` para vincular item e pessoas. Uma pessoa deve aparecer no máximo uma vez por item, com chave composta ou índice único `(purchase_item_id, person_id)`.

O modelo final usa essa relação também para itens pessoais, com um participante e 100% do custo. A migração deve preencher as participações existentes a partir de `person_id`, inclusive no histórico, sem mudar produtos, preços, quantidades ou estados. Durante a transição, `person_id` pode ser mantido para compatibilidade; deve haver uma fonte única para determinar participantes e evitar divergência entre dois modelos. Remover ou tornar opcional esse campo requer ajustar importação, fixtures, escrita e demais consumidores.

Armazenar também o modo de rateio e a participação desigual. Se a entrada for percentual, preferir pesos inteiros ou pontos-base, evitando cálculos com percentuais em ponto flutuante; validar que a composição fecha no total exigido. Se a entrada for valor fixo, guardar as parcelas em centavos e validar soma igual ao subtotal do produto. Valores fixos são uma decisão financeira explícita, não um cache de subtotal. Mudança de preço exige uma regra própria nesse modo.

Para divisão igual, armazenar membros e uma ordem estável de distribuição dos centavos. Não é necessário armazenar um subtotal redundante. Calcular parcelas no módulo de domínio e usar a mesma regra na leitura/servidor e na prévia da UI. Ordenar por nome atual não é adequado: uma alteração de nome poderia transferir o centavo restante no histórico.

Exemplo: um item de 300 reais, quantidade 1, três participantes. Total geral = R$ 300; quantidade geral = 1; cada participante vê o produto e parcela de R$ 100. Um item de R$ 100 dividido por três gera R$ 33,34, R$ 33,33 e R$ 33,33, em ordem persistida, somando exatamente R$ 100.

Para proporções desiguais, distribuir os centavos pelo maior resto, usando a ordem persistida para desempates. Exemplo: R$ 300 com 50%/30%/20% gera R$ 150/R$ 90/R$ 60. A soma atribuída precisa ser exatamente igual ao subtotal.

O rateio deve partir do **subtotal físico** (quantidade × preço unitário), não de um preço unitário artificial por participante. Para duas RAMs de R$ 300 divididas por três, o subtotal é R$ 600 e cada parcela é R$ 200; a quantidade geral continua sendo 2.

Na UI, mostrar “Sua parte: R$ 100 · dividido entre 3 pessoas” e, nos detalhes, o valor total e os participantes. Não apresentar a parcela como se fosse o preço integral de uma unidade. O resumo pessoal deve distinguir participação em um produto compartilhado de unidades exclusivamente pessoais.

## Regras e riscos relevantes

- Escolher pessoas específicas do workspace; nunca dividir automaticamente por todos os membros atuais. Convites futuros não podem mudar parcelas de itens existentes.
- Rejeitar participantes duplicados, lista vazia e pessoas externas ao workspace. Um único participante corresponde a um item pessoal.
- Preço ausente mantém parcela pendente; zero continua sendo um valor conhecido.
- Alterar preço ou quantidade recalcula parcelas proporcionais enquanto a compra estiver ativa. Se forem valores fixos, exigir nova composição que feche no subtotal, salvo outra regra expressamente escolhida. Ao retirar/adicionar participante em divisão desigual, a UI deve exigir revisão das proporções/valores, sem assumir uma redistribuição arbitrária.
- Sob a hipótese de um item físico compartilhado, editar/remover/marcar é uma ação global desse item, inclusive quando iniciada na aba de uma pessoa. Remover apenas um participante exige uma ação distinta e recalcula o restante.
- “Selecionar tudo” de uma pessoa também afetará o estado do item nas abas dos coparticipantes; a interface precisa tornar isso compreensível.
- Totais gerais, quantidade física, pendências e progresso contam cada item uma vez. Totais pessoais somam parcelas e a união dos participantes determina a contagem de pessoas.
- Finalização deve congelar tanto os itens quanto a composição do rateio. Não recalcular o histórico com membros atuais do workspace.
- Produto e participações devem ser criados/editados numa transação, sem estado parcial em caso de falha.
- Atenção a concorrência: hoje várias mutações consultam `requireEditablePurchase()` e depois escrevem separadamente. Há uma janela estrutural para uma finalização ocorrer entre a verificação e a escrita; não foi reproduzida nesta auditoria. A nova escrita transacional precisa garantir a verificação de compra ativa dentro da operação protegida, e merece teste concorrente com finalização.
- A especificação atual exclui gestão de estoque/revenda (`docs/02_MVP_SCOPE.md`). Ratear o custo pode ser uma extensão pequena da compra; registrar venda, receita, margem ou distribuição de lucro é escopo adicional.

## Sequência de implementação e esforço preliminar

| Etapa | Conteúdo | Estimativa |
| --- | --- | --- |
| Modelo e migração | Relação de participantes, compatibilidade, importação e backfill | 0,5–1 dia |
| Domínio e contratos | Rateio igual/desigual em centavos, fechamento da soma, validação, escrita atômica, leitura, totais e checklist | 1,5–2,5 dias |
| Interface | Seleção múltipla, modos percentual/valor, prévia, revisão após alteração, erros de fechamento, grupos pessoais, detalhes e histórico | 1,5–2,5 dias |
| Verificação | Migração com dados antigos, casos de rateio/desigualdade, integração, E2E e verificações do projeto | 1–1,5 dias |

Faixas condicionadas a divisão igual e dois modos de divisão desigual, estado compartilhado e ausência de gestão de revenda. Algumas etapas se sobrepõem; a previsão global arredondada é 5–8 dias. O porte é de uma extensão que atravessa banco, domínio e UI; não exige refazer o aplicativo.

## Verificações realizadas

Comando: `npm exec -- vitest run tests/unit/domain.test.ts tests/integration/purchases.test.ts`.

Resultado: **2 arquivos e 72 testes passaram**. A fixture de integração aplica as migrações existentes em libSQL em memória. Esses testes verificam o comportamento atual; não demonstram funcionamento de um rateio ainda não implementado. Não foram executados build, lint, E2E ou migrações contra banco de produção nesta auditoria.

Testes necessários para a implementação: exemplo de R$ 300/3; divisão desigual e composição inválida; pesos/percentuais e desempate; revisão de valores fixos após mudar o preço, se esse modo for escolhido; centavos restantes; várias unidades; preço nulo e zero; alteração de participantes/preço; total pessoal e geral; quantidade e progresso físicos; status individual e em lote sincronizado; participantes externos/duplicados; rollback; concorrência com finalização; histórico imutável; backfill de compras antigas; favorito editado/deletado; fluxos manual e originado de favorito; interface móvel.

## Respostas confirmadas e decisões pendentes

O usuário confirmou durante a auditoria:

1. Suportar divisão igual e desigual.
2. Um único item compartilhado; editar, remover ou marcar atualiza todos os participantes.
3. Apenas ratear o custo da compra; sem registrar revenda ou lucro.
4. Divisão desigual tanto por percentuais quanto por valores em reais.

As duas opções de divisão desigual foram confirmadas. Recomenda-se um modo explícito por item: igual, percentual ou valor em reais. Percentuais preservam as proporções ao alterar preço/quantidade; parcelas fixas exigem revisão para fechar o novo subtotal. Ao trocar de modo, mostrar prévia antes de salvar; não arredondar a conversão silenciosamente. Para valores fixos, o preço deve estar definido; itens sem preço podem usar divisão igual/proporcional com parcelas pendentes. Essas regras de edição são propostas técnicas, ainda não respostas expressas do usuário.

Outras decisões de UX podem usar padrões propostos, a confirmar antes da implementação: permitir converter item existente enquanto ativo; permitir retirar participantes com revisão do rateio desigual; distribuir centavos determinísticamente com prévia explícita. Essas propostas não representam respostas confirmadas.
