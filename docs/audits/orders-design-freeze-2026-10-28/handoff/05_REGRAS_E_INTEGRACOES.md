# Regras funcionais e integrações — preservar o domínio existente

**Importante:** as regras abaixo são invariantes e objetivos de segurança de UX. Fórmulas exatas, DTOs, campos, endpoints, políticas e transações devem ser **confirmados no repositório atual na Fase 0**. Não tratar o protótipo Penpot como contrato de API.

## 1. Identidade do item versus compra de origem

- Pedido/item deve ser identificado por chave estável do domínio (`itemId` ou equivalente real) e manter sua variação/sku, comprador, conta HubBuy, origem e demais relacionamentos.
- Clicar no produto abre **o item específico**. A compra de origem pode conter vários itens, mas é apenas um vínculo contextual consultável; não deve substituí-lo.
- O estado `item-detail` deve carregar o item correspondente e não uma agregação impessoal de compra. Se houver item inválido/removido, mostrar “Item não encontrado” e retorno à listagem.
- Trocar de item não deve preservar indevidamente fotos, preço, nome, disponibilidade ou ações do item anterior.

## 2. Quantidades e disponibilidade

Campos visualizados originalmente: **Compradas, Recebidas, Disponíveis, Vinculadas**. O backend atual determina quais contam para cada total e se há reservas/interdições.

- `selecionadas` é inteiro não negativo.
- `maxSelectable` vem do **saldo disponível real para pacote**: não assumir simplesmente `compradas` ou `recebidas` se já existem vínculos/reservas.
- Invariante do frontend: `0 ≤ selecionadas ≤ maxSelectable`.
- Stepper `− n +`: decremento indisponível em 0; incremento indisponível no limite. Os controles têm estado `disabled` real, inclusive teclado/aria, além de aparência.
- Ao atingir zero, linha deixa de compor seleção/resumo. Se a seleção é mantida em store local, ele deve permanecer consistente com contador/rodapé/painel.
- Em mudança assíncrona do saldo durante seleção, reconciliar com servidor, bloquear conflito e indicar que a disponibilidade mudou; nunca criar pacote com quantidade excedente.
- Item ainda não recebido, já integralmente vinculado, indisponível ou bloqueado não pode ser selecionado apenas porque consta na lista.
- `n` unidades de um item e `m` produtos distintos são contadores diferentes. Evitar totais incorretos ao selecionar itens duplicados por variação.
- Lógica de “Montar pacote” verifica novamente elegibilidade **server-side**, com prevenção de clique duplo e repetição de requisição. Resposta de sucesso atualiza vínculos, disponibilidade, cache, UI e rota conforme fluxo existente.
- Testes obrigatórios: zero, máximo, incremento além do limite, decremento abaixo de zero, disponibilidade que muda entre seleção e commit, duas abas simultâneas, produto sem saldo, cancelamento e retorno.

## 3. Custos e pagamentos

- A coluna “Custo” refere-se ao **custo até o armazém** tal como calculado hoje; não confundir com frete Brasil, custo total final de pacote ou preço unitário na moeda de origem.
- Preservar moeda original, câmbio e arredondamento, rateios, taxas de processamento, descontos, compras pagas com saldo HubBuy e reembolsos conforme regras existentes.
- Não recalcular valores em componente de UI; usar dados/serviços já existentes e apenas formatar corretamente (BRL quando for a unidade da propriedade). Mostrar “a conferir”/não disponível quando faltar dado real, não inventar zero.
- Reembolsos podem envolver parte de unidades/valor, saldo em CNY e compras substitutas. Essa integração não deve receber algoritmo novo sem levantamento e aprovação específica.
- A presença de reembolso é **condicional** conforme o item/domínio; não poluir visual de todos os itens com uma seção de refund vazia.
- Em edição/reembolso, manter confirmação, validações e auditoria atuais; se alguma ação tem efeito financeiro irreversível, solicitar confirmação explícita do usuário final e preservar permissões de backend.

## 4. QC / fotos — área de preservação estrita

**As imagens QC e suas associações já funcionam no Loti. Não refatorar o mecanismo existente como parte do redesign de Pedidos.**

Verificar e preservar:

1. Armazenamento, caminho/URL, autenticação/autorização, expiração e rendering das fotos.
2. Associação de fotos ao **item correto**, inclusive múltiplos itens na mesma compra e a mesma imagem compartilhada/associada quando suportado.
3. Comportamento atual de capa automática após associação e opção de trocar manualmente a imagem principal.
4. Gallery/lightbox, ampliação, thumbnails, placeholders, no-QC e erros de mídia.
5. Upload e importação unitários existentes, sua lógica de ordenação, deduplicação e estado.
6. Edição, remoção, reassociação e permissão, se atualmente suportadas.

### QC JSON global em lote

- Gatilho no topo de Pedidos: **ícone de foto +**; nome acessível “Importar fotos QC via JSON”. Não mostrar texto longo ao lado na toolbar.
- Entrada: **um arquivo JSON** que possa importar/atualizar múltiplos pedidos comprados/elegíveis numa única operação de usuário. Usar o formato e a lógica já existente quando houver; não criar schema paralelo sem diagnóstico.
- Validação: tamanho/tipo/parse/estrutura, identificador de origem/conta/compra/item, permissões, links/imagens válidos conforme contratos e relacionamento com o item.
- Associação deve usar identificadores confiáveis; **não associar fotos somente por texto de nome**, pois produtos e variações podem repetir.
- Preview antes de confirmar: correspondidos, ignorados/sem alteração, ambiguidades, erros por item; o usuário precisa saber o que será atualizado.
- Processamento: idempotente ou deduplicado segundo arquitetura; proteger contra requisição repetida e importação parcial inadvertida. Se backend suporta sucesso parcial, explicitar quais itens foram atualizados e quais falharam. Se é tudo-ou-nada, comunicar antes do commit.
- Não sobrescrever capas escolhidas manualmente sem regra preexistente/aprovação; não apagar fotos antigas silenciosamente; não misturar imagens entre compradores ou contas.
- Atualizar lista/detalhe/galeria após confirmação e lidar com falha/retry sem reinicializar informações do usuário.
- Logs não devem expor tokens, conteúdo sensível do JSON ou URLs secretas.

## 5. Etapa logística e chegada

- Etapas/taxonomia de status e transições vêm do backend. O protótipo mostra **A caminho** e **Recebido/No armazém**, entre outros estados existentes; não limitar domínio a esses rótulos.
- Registrar chegada apenas quando operação for permitida e com a quantidade correta, mantendo compatibilidade com recebimentos parciais e vínculos a pacote.
- Filtros **Todos / No armazém / Disponíveis** podem representar conjuntos diferentes: “recebido” e “possui saldo disponível” não são sinônimos.
- O filtro por etapa/conta/pessoa/origem/compra deve preservar regras e permissões já implementadas, mesmo que controles secundários apareçam condensados.

## 6. Estados e erros obrigatórios

- Consulta: carregando/skeleton, lista vazia, busca sem resultados, erro remoto, retry.
- Ação: pending/disabled, sucesso confirmável, erro com mensagem compreensível, perda de conexão, autenticação expirada, permissão negada.
- Fotos: sem QC, carregando thumbnail, inválida/404, diversas fotos, expansão e seleção de capa se já houver suporte.
- Quantidade: min, max, excedente por concorrência, pacote já vinculado, mudança no saldo.
- Importação: JSON inválido, origem desconhecida, item sem correspondência, várias correspondências, duplicado, sucesso parcial, confirmação/abandono.
- Fechamento de painel: ESC, clique em backdrop quando apropriado, X/Voltar, foco restaurado no disparador; não perder seleção nem filtros.

## 7. Limites de implementação sem aprovação

Não executar migrations, alterar índices/constraints, renomear entidades, reprocessar arquivos QC, desvincular fotos, recalcular pagamentos históricos, excluir dados, introduzir novo provedor de storage, alterar autenticação/autorização ou modificar regras de Pacotes por iniciativa própria. Caso qualquer item seja essencial, apresente **plano de mudança separado** com impacto, rollback, testes e aprovação necessária.
