# Plano faseado — rateio de itens da compra

Status: planejamento pronto para execução por outro agente. Nenhuma funcionalidade implementada neste documento.

Data: 07/10/2026. Base: `docs/audits/2026-10-07_PURCHASE_COST_SHARING.md` e respostas do usuário.

## 1. Objetivo e escopo confirmado

Permitir que um único produto físico da compra atual apareça nos itens de todas as pessoas que participam de seu custo, mostrando a parcela correspondente em cada grupo pessoal.

Exemplo obrigatório: uma RAM, quantidade 1, preço R$ 300, dividida igualmente entre Gabriel e dois amigos. Cada pessoa vê a RAM e R$ 100 em seus itens; a compra inteira tem R$ 300 e **uma unidade**.

O usuário confirmou:

- Divisão igual e desigual.
- Divisão desigual tanto por percentuais quanto por valores em reais.
- Um único item compartilhado: editar, remover e marcar no HubBuy afeta todos os participantes.
- Apenas ratear o custo. Não registrar revenda, estoque, receita, lucro, pagamentos, frete ou impostos.

Preservar stack, autenticação, autorização centralizada, snapshots, compra ativa única, histórico somente leitura, marcadores SVG e navegação existentes. Não criar nova seção principal, dashboard ou cadastro público.

Estimativa preliminar global: 5–8 dias de desenvolvimento e validação. Não é um prazo garantido.

## 2. Instruções para o agente executor

1. Ler `AGENTS.md`, os documentos na ordem nele indicada, `PROMPT_ONE_SHOT.md`, a auditoria e este plano. Conferir também os planos 18 e 19 ao tocar código compartilhado.
2. Este plano descreve uma extensão solicitada ao comportamento atual de compra; não é autorização para implementar todo o MVP novamente. Atualizar os documentos canônicos na fase 0 para registrar a extensão e resolver a antiga regra de um destinatário único.
3. Inspecionar o checkout e preservar alterações de terceiros. Revalidar caminhos e contratos: as linhas da auditoria são referências ao checkout de 07/10/2026.
4. Executar as fases em sequência e continuar autonomamente quando seus critérios passarem. Não interromper para aprovação a cada fase.
5. Manter cada incremento compilável e testado; corrigir regressões antes de continuar. Usar commits por entrega quando houver autorização e acesso ao Git; não incluir mudanças de terceiros.
6. Não aplicar migrações em produção nem publicar o app sem autorização específica. Preparar os artefatos e instruções de publicação ao final. A implementação e os testes locais não dependem de credenciais de produção.
7. Não construir camadas genéricas, novos padrões de arquitetura ou refatorações fora do trecho de compra necessário ao rateio.

## 3. Regras propostas para executar sem ambiguidades

As quatro decisões de escopo acima são respostas expressas do usuário. Os padrões abaixo são decisões propostas neste plano para completar os detalhes de implementação, podendo ser alterados por instrução posterior.

### Modos e participantes

- Usar três modos explícitos por item: `equal`, `percentage`, `fixed`.
- Item pessoal é um item com um participante; normalizar para `equal` nesse caso.
- Exigir pelo menos um participante, sem IDs repetidos, todos pertencentes ao workspace da compra.
- Nunca usar implicitamente todos os membros do grupo. Novos convites não alteram participantes de itens existentes.
- Manter a pessoa padrão atual ao adicionar favorito: seu dono. No item manual: usuário atual. Dividir é uma opção adicional do formulário.
- Permitir converter item pessoal existente em compartilhado e vice-versa, apenas enquanto a compra estiver ativa.
- Editar participantes no mesmo formulário do item. Remover um participante não remove o produto; remover o produto remove suas participações.
- Em modo desigual, adicionar/remover pessoa exige recompor percentuais ou valores antes de salvar. Não redistribuir silenciosamente.

### Dinheiro, quantidade e arredondamento

- Quantidade continua inteira >= 1 e representa unidades físicas. Não usar frações de quantidade para representar participação.
- Base do rateio = `quantity * unitPriceCents`. Nunca substituir o preço unitário integral pela parcela pessoal.
- Centavos e percentuais persistidos são inteiros. Percentuais têm até duas casas decimais: 100% = 10.000 pontos-base.
- Percentuais devem somar exatamente 10.000. Aceitar participação de 0% explicitamente; a pessoa selecionada continua participante.
- Em divisão igual, distribuir o resto dos centavos pela ordem persistida dos participantes.
- Em percentuais, usar o método do maior resto: calcular parcelas exatas, atribuir a parte inteira, distribuir os centavos restantes pelos maiores restos e desempatar pela ordem persistida.
- Em valores fixos, guardar o valor de cada parcela em centavos e exigir soma exatamente igual ao subtotal. Permitir zero, rejeitar negativos.
- Respeitar os limites atuais de quantidade e preço. Os produtos intermediários de subtotal por pontos-base podem ultrapassar a precisão segura de `number`; usar aritmética inteira segura, por exemplo `BigInt` internamente, convertendo somente resultados seguros. Nunca enviar `BigInt` diretamente em JSON.
- Se preço for nulo, `equal` e `percentage` preservam a composição e mostram parcelas pendentes. `fixed` exige preço definido. Preço zero é conhecido e admite parcelas de zero.
- Exibir prévia de parcelas e de fechamento da soma antes de salvar. A validação do servidor é obrigatória mesmo quando a prévia está correta.

### Edição e estado compartilhado

- Mudança de preço/quantidade em `equal` e `percentage` recalcula as parcelas.
- Em `fixed`, mudar preço/quantidade mantém os valores digitados como rascunho e bloqueia o salvamento enquanto a soma não fechar. Não normalizar valores automaticamente.
- Trocar de modo exige uma composição válida e prévia. Não converter valores fixos em percentuais arredondados sem mostrar o resultado.
- A ordem usada para desempate é estável, independente de nome de usuário e ordem alfabética da lista de membros. Preservar a ordem dos participantes mantidos; acrescentar novos ao final.
- Existe um único `cartStatus`. Marcar em qualquer grupo pessoal atualiza todas as exibições do item.
- Marcar todos os itens de uma pessoa também marca os produtos compartilhados dos quais ela participa. Explicar esse efeito com texto curto no controle ou feedback existente, sem confirmação extra para cada marcação.
- Remover um produto compartilhado pede confirmação que informa que a remoção vale para todos.
- Edição, remoção, status e alteração de rateio são proibidos depois de finalizar, inclusive por requisição direta.
- A atualização entre sessões mantém o mecanismo atual de resposta à mutação, reload e foco da janela. Não adicionar realtime ou prometer atualização instantânea em outros dispositivos.

## 4. Modelo e contratos recomendados

### Persistência

Manter `purchase_items` como registro físico e snapshot único. Adicionar `sharing_mode`, enum validado por CHECK, com padrão `equal`.

Adicionar `purchase_item_participants`:

| Campo | Regra |
| --- | --- |
| `purchase_item_id` | FK para item; remoção do item elimina suas participações |
| `person_id` | FK para usuário; membership validado no domínio |
| `allocation_order` | Inteiro >= 0, estável por item |
| `percentage_bps` | Nulo ou inteiro de 0 a 10.000 |
| `amount_cents` | Nulo ou inteiro >= 0, dentro do limite de subtotal admitido |

Chave primária composta `(purchase_item_id, person_id)`, unicidade `(purchase_item_id, allocation_order)` e índice por pessoa. Não permitir os dois campos financeiros preenchidos simultaneamente. No domínio, exigir os campos correspondentes ao modo e a soma correta; CHECK de uma linha não valida a soma de várias participações.

Escolha de compatibilidade para esta entrega: conservar `purchase_items.person_id` obrigatório como **espelho legado do primeiro participante por ordem**, escrito somente pela rotina central de gravação. Depois da transição, esse campo não decide destinatários, filtros, autorização ou totais. A relação de participantes é a fonte única dessas regras. Adiar a remoção da coluna para outra migração; não acrescentar uma reconstrução da tabela sem necessidade nesta feature.

Backfill: cada item existente ganha uma participação `equal`, com seu `person_id` atual e ordem 0. Não modificar preço, quantidade, status, datas ou snapshots, nem mesmo em compras finalizadas. A migração muda a representação, não o significado histórico.

### Módulo de cálculo

Criar uma função pura com interface pequena, por exemplo `allocateItemCost(item, participants)`, que devolva subtotal físico e parcelas por pessoa, incluindo nulos quando o preço estiver pendente. Centralizar validação financeira e arredondamento; reutilizar na prévia e na leitura do servidor. Não duplicar fórmulas em componentes.

Manter distintos:

- Resumo geral: subtotal integral, unidades físicas, pendências e progresso; cada item contado uma vez.
- Resumo pessoal: parcelas do participante; quantidade de itens pessoais e participações compartilhadas identificadas separadamente.

Os modos do carrossel Todos/Pendentes/Adicionados continuam filtrando o estado físico único antes de somar.

### Escrita e leitura

Estender `item.favorite` e `item.save` para receber modo e participantes. Aceitar temporariamente a entrada antiga com `personId` e convertê-la em participante único, para preservar chamadas e testes existentes. Rejeitar payloads ambíguos que misturem os dois formatos. Restringir o formato novo com Zod; não confiar em parcelas calculadas enviadas pelo navegador para modos proporcionais.

Item e participações são persistidos na mesma transação. Validar membership, compra ativa e item alvo usando a conexão transacional. Nunca salvar metade da composição.

Adicionar participantes e parcelas derivadas ao contrato de leitura de `getData()`/`ClientData`, agrupados por item ou em coleção própria. Escolher uma representação e documentá-la; evitar consulta por item. Filtrar pelo workspace por meio das compras autorizadas.

Não depender de `person_id` para `setPersonItemsStatus`: selecionar os IDs físicos via participações, sem multiplicar atualizações por joins.

## 5. Fases de implementação

### Fase 0 — baseline e contrato

**Entrega:** especificação curta consistente com este plano e mapa dos consumidores do formato antigo.

- Conferir schema, serviços, formulário, compra, histórico, favoritos, importador legado e fixtures.
- Registrar os modos, tipos de entrada/leitura, regras de edição e semântica dos resumos pessoais.
- Atualizar pontualmente `PROMPT_ONE_SHOT.md` e docs 01, 02, 03, 04, 09, 11, 12 e 15 para registrar a extensão onde necessário; usar referências ao plano para evitar reproduzir todos os detalhes.
- Executar baseline de typecheck, lint, testes e build. Registrar falhas anteriores sem atribuí-las à feature; resolver as que impedirem a implementação dentro do escopo necessário.

**Aceite:** não existe dúvida sobre produto físico versus parcela; contratos e padrões propostos estão explícitos; aplicação atual funciona. Não escrever a feature inteira nesta fase.

### Fase 1 — migração compatível e cálculo

**Entrega:** modelo novo disponível sem alterar a experiência pessoal atual.

- Criar schema Drizzle e migração aditiva com backfill; conferir o SQL e metadados gerados. Não alterar migrações já aplicadas.
- Testar banco vazio e banco na versão anterior com compra ativa e histórica.
- Criar o módulo puro de rateio, com os três modos, nulo/zero, limites e determinismo.
- Ajustar importador e rotinas de criação para gravar a participação individual e o espelho legado atomicamente; preservar dry-run e idempotência da importação.
- Acrescentar a tabela ao verificador de banco, se necessário.
- Adaptar leitura e tipos de forma aditiva; o fluxo pessoal permanece funcionando antes de expor compartilhamento.

**Aceite:** cada item antigo tem uma participação; totais/histórico permanecem iguais; toda nova escrita pessoal cria item e participação juntos; testes financeiros passam. Aplicar a migração apenas em bancos locais descartáveis explicitamente selecionados.

### Fase 2 — rateio igual completo

**Entrega:** o exemplo RAM R$ 300/3 funciona de ponta a ponta.

- Adaptar validação, criação manual, cópia do favorito e edição ao novo contrato.
- Implementar transação única para item/participantes e autorização de todos os IDs.
- Atualizar resumos, pessoas visíveis, filtros e agrupamentos para ler participações.
- Implementar seleção de várias pessoas e prévia de divisão igual no formulário existente.
- Exibir parcela pessoal, indicador de compartilhamento e subtotal físico nos detalhes.
- Adaptar status individual, status em lote e remoção global.
- Adaptar a tela compartilhada de compra/histórico e a lista de histórico; preservar a indicação de favorito já presente na compra.
- Testar conversão pessoal/compartilhado, edição de preço/quantidade e remoção de participante.

**Aceite:** uma RAM aparece em três grupos, cada um com R$ 100; total R$ 300, uma unidade; marcar em um grupo afeta os três; remover elimina o mesmo item de todos; itens pessoais e favoritos não regridem.

### Fase 3 — divisão por percentuais

**Entrega:** modo desigual proporcional acessível no mesmo formulário.

- Oferecer campos de percentual por pessoa com até duas casas decimais e validação de soma 100%.
- Usar parsing decimal exato para pontos-base, independente da aritmética de ponto flutuante.
- Mostrar total percentual preenchido, erro de fechamento e prévia das parcelas.
- Preservar percentuais quando preço/quantidade mudar.
- Em composição alterada, exigir revisão; não completar automaticamente um percentual restante sem ação explícita.
- Testar maior resto, empate, 0%, 100%, falta de preço e limites.

**Aceite:** R$ 300 com 50%/30%/20% gera R$ 150/R$ 90/R$ 60; mudar para R$ 600 gera R$ 300/R$ 180/R$ 120; composição de 99%/101% é rejeitada tanto na UI quanto no servidor.

### Fase 4 — divisão por valores em reais

**Entrega:** modo desigual com parcelas fixas e revisão explícita após mudanças.

- Oferecer campos de dinheiro por pessoa, reutilizando parsing/formatação existentes.
- Mostrar valor já distribuído e diferença para o subtotal. Exigir fechamento exato.
- Persistir parcelas fixas e validar a soma no servidor.
- Impedir modo fixo sem preço, com mensagem explicativa; zero é permitido.
- Ao mudar preço/quantidade, preservar rascunho e exigir ajuste das parcelas antes de salvar.
- Permitir trocar modos, cancelar e reabrir sem perda de dados salvos; composição inválida não persiste.

**Aceite:** R$ 300 dividido em R$ 120/R$ 100/R$ 80 funciona; R$ 299,99 ou R$ 300,01 de parcelas é rejeitado; alterar subtotal exige revisão. Os modos anteriores permanecem funcionais.

### Fase 5 — histórico, atomicidade e concorrência

**Entrega:** composição financeira íntegra diante de falhas e finalização.

- Auditar todas as mutações de compra afetadas: criação de item, edição, exclusão, status, status em lote e finalização.
- Eliminar a janela entre consulta de compra ativa e gravação usando a estratégia transacional suportada pelo adapter libSQL instalado. Não verificar fora da transação e assumir que ela protege a consulta anterior.
- Comprovar ordenação consistente entre edição e finalização usando duas conexões ao mesmo banco de teste. Se finalizar primeiro, a mutação falha; se editar primeiro, a compra finaliza com a composição nova completa.
- Injetar falha entre escrita do item e participantes e verificar rollback total.
- Verificar que falhas não deixam participantes órfãos, item sem composição ou parcelas parciais.
- Preservar o comportamento colaborativo atual de edição concorrente: última transação válida vence integralmente, sem misturar composições. Não introduzir editor de conflitos ou realtime nesta entrega.
- Requisições diretas contra compra finalizada devem retornar erro e preservar itens/participantes; edição posterior de favorito, nome de pessoa ou lista de membros não muda parcelas históricas.
- Não recalcular o histórico a partir dos membros atuais. Atualizar nome de exibição pode continuar como hoje, sem mudar IDs ou distribuição dos centavos.

**Aceite:** rollback e concorrência passam com libSQL; não há alteração posterior à finalização; reabrir/recarregar preserva modo, pessoas, parcelas e valores físicos.

### Fase 6 — validação integrada e handoff

**Entrega:** implementação revisável, evidências e instruções de publicação.

- Executar os checks finais e jornadas Playwright dos três modos.
- Conferir desktop e mobile, teclado, labels dos campos, erros acessíveis e listas com o mesmo item em vários grupos.
- Revisar texto de quantidade: participantes não são unidades adicionais. Sugestão de resumo pessoal: “2 unidades pessoais · 1 item compartilhado”, com total da pessoa separado.
- Conferir carrossel, filtros, ações em lote e avisos de finalização com preços pendentes.
- Atualizar relatório de implementação com arquivos/migrações, comandos, resultados reais e limitações.
- Preparar checklist operacional: snapshot/backup do banco, versão do schema, migração explícita do alvo, deploy e smoke test. Não executar produção nesta tarefa sem autorização.
- Documentar que, após novos itens compartilhados, voltar para a aplicação antiga exibiria somente o espelho legado e valores errados por pessoa. Não sugerir rollback cego para a versão antiga; priorizar correção em frente ou restauração coordenada de app/banco com plano para dados criados após o backup.

**Aceite:** todos os critérios abaixo passam; nenhuma mudança de infraestrutura; nenhuma feature fora do escopo; entrega local pronta para revisão e publicação posterior.

## 6. Matriz mínima de aceite e testes

| Cenário | Resultado esperado |
| --- | --- |
| R$ 300, quantidade 1, três pessoas iguais | R$ 100 cada; total R$ 300; uma unidade |
| Duas unidades de R$ 300, três pessoas | R$ 200 cada; total R$ 600; duas unidades |
| R$ 100/3 | R$ 33,34 + R$ 33,33 + R$ 33,33, ordem estável |
| R$ 0,01/3 | Um centavo atribuído uma vez; total preservado |
| R$ 300, 50%/30%/20% | R$ 150/R$ 90/R$ 60 |
| 33,33%/33,33%/33,34% | Soma 100%; maior resto sem perda de centavos |
| R$ 300, valores 120/100/80 | Parcelas exatas e total preservado |
| Percentuais ou valores não fecham | Rejeição sem gravação parcial |
| Limites máximos atuais | Aritmética segura; nenhuma perda por precisão |
| Participante repetido, vazio ou externo | Rejeição pelo servidor |
| Nulo em igual/percentual | Parcela pendente; não mostrar R$ 0 |
| Nulo em fixo | Rejeição até informar preço |
| Preço zero | Parcelas conhecidas de zero |
| Alteração de preço/quantidade | Recalcula proporções; fixo exige recomposição |
| Conversão de pessoal e retirada de participante | IDs físicos preservados; totais atualizados |
| Marcar/desmarcar em uma pessoa | Mesmo estado em todas as exibições |
| Marcar todos de uma pessoa | Atualiza seus itens físicos distintos, inclusive compartilhados |
| Totais Pendentes/Adicionados | Subtotal físico contado uma vez em cada estado |
| Finalização versus mutação concorrente | Estado íntegro; nada editável após finalizar |
| Falha ao gravar participantes | Rollback do item e da composição |
| Favorito editado/deletado | Snapshot e rateio preservados |
| Renomear pessoa ou convidar novo membro | Parcelas e desempates históricos inalterados |
| Migração de compra antiga | Mesmo total, estado, quantidade e pessoa original |
| Importação legada repetida | Não duplica item nem participação |
| Mobile e teclado | Formulário utilizável sem overflow; labels e erros claros |

Testes sugeridos: novo arquivo unitário de rateio; integração de compras compartilhadas e migração; testes de concorrência com duas conexões, usando o padrão já presente em `tests/integration/invitation-concurrency.test.ts`; E2E específico, sem enfraquecer testes pessoais existentes.

## 7. Comandos de verificação e segurança do alvo

Após cada incremento com código: `npm run typecheck`, `npm run lint`, testes relevantes e build quando a alteração o afetar. Ao fechar fases de código, executar `npm run check`; não repetir checks sem novas mudanças. Ao final, executar também `npm run test:e2e`.

A auditoria anterior executou apenas domínio/compras: 72 testes passaram. Isso não equivale a baseline completo nem a validação da nova feature.

Migrações locais de teste devem usar alvo explícito para não herdar o Turso de `.env`:

```sh
TURSO_DATABASE_URL=file:/private/tmp/loti-cost-sharing-validation.sqlite npm run db:migrate
TURSO_DATABASE_URL=file:/private/tmp/loti-cost-sharing-validation.sqlite npm run db:verify
```

Usar um caminho novo ou isolado para cada preparação de dados; não apagar bancos existentes indiscriminadamente. A fixture de integração já aplica migrações em memória; teste de migração histórica precisa preparar o schema anterior antes de aplicar a nova migração.

`npm run db:generate` deve ser usado após editar schema e produzir arquivos revisados em `drizzle/`; não substituir a migração por push de schema. Conferir scripts e variáveis antes de rodar comandos que se conectem a bancos. O E2E atual usa `data/e2e.sqlite`; manter isolamento em relação aos dados reais.

## 8. Arquivos provavelmente afetados

| Grupo | Caminhos |
| --- | --- |
| Schema e migração | `src/lib/db/schema.ts`, nova migração e metadados em `drizzle/` |
| Domínio | `src/lib/domain/money.ts`, módulo de rateio, `validation.ts`, `purchase-services.ts`, `services.ts`, autorização quando necessária |
| Contratos | `src/app/api/app/route.ts`, `src/components/workspace-provider.tsx` |
| Interface | `src/components/purchase/item-editor.tsx`, `purchase-screen.tsx`, `history-screen.tsx`, CSS pontual |
| Compatibilidade | `scripts/legacy-importer.ts`, `scripts/verify-database.ts`, fixtures e demais gravações encontradas pela busca |
| Verificação | `tests/unit/`, `tests/integration/`, `tests/e2e/` |
| Especificação | `PROMPT_ONE_SHOT.md`, docs canônicos afetados e relatório final |

## 9. Prompt pronto para entregar ao outro agente

```text
Implemente o rateio de itens da compra do Loti seguindo
docs/20_PURCHASE_COST_SHARING_PLAN.md, fase por fase.

Leia primeiro AGENTS.md e os documentos na ordem exigida, depois
PROMPT_ONE_SHOT.md e docs/audits/2026-10-07_PURCHASE_COST_SHARING.md.
O plano é uma extensão da compra existente; não reimplemente o MVP inteiro.

Escopo confirmado: um único produto físico aparece em todos os grupos
participantes com sua parcela; divisão igual ou desigual por percentuais
e valores em reais; editar/remover/marcar no HubBuy afeta o mesmo item para
todos; somente custo, sem revenda, lucro, pagamentos, estoque ou frete.

Use os padrões de edição e arredondamento propostos no plano como defaults.
Atualize pontualmente os documentos canônicos para registrar a extensão.
Preserve a stack, dados antigos, favoritos, snapshots e histórico imutável.
Não duplique produtos físicos para representar parcelas.

Continue autonomamente entre fases após cumprir seus critérios de aceite.
Mantenha o app funcional, execute checks e corrija regressões a cada entrega.
Não faça deploy nem migração em produção. Use bancos locais isolados para
verificar migrações e não exponha credenciais. Entregue código, migração,
testes, resultados reais e instruções de publicação prontas para revisão.
Pare somente diante de um bloqueio humano real e explique o impedimento.
```
