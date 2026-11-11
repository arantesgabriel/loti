# Loti — plano de implementação para Pedidos, Armazém e Pacotes

**Status** — O1 (TanStack Query) e Q1 (foto ativa prioritária e miniaturas sob demanda) aprovadas. As demais decisões de interação abaixo são padrões propostos para execução.

**Resultado esperado** — navegar entre Pedidos e Pacotes sem repetir consultas frescas, registrar chegadas individuais e em massa com retorno imediato, ordenar a lista inteira de itens, reservar apenas unidades elegíveis e reduzir a espera até a primeira imagem de QC.

Antes de codificar, seguir a ordem de leitura do `AGENTS.md` e ler os handoffs [39 — Pedidos, Armazém e Pacotes](39_ORDERS_WAREHOUSE_AND_PACKAGES_PLAN.md), [40 — Workspaces pessoais](40_PERSONAL_WORKSPACES_PLAN.md), [42 — Pedidos em workspaces pessoais](42_PERSONAL_ORDERS_WAREHOUSE_PACKAGES_HANDOFF.md), [24 — QC](24_HUBBUY_QC_IMPORT_PLAN.md) e [33 — Performance do visualizador de QC](33_QC_VIEWER_PERFORMANCE_PLAN.md). Preservar histórico, origens financeiras, valores, reembolsos e as restrições do workspace ativo. Toda mudança em fotos fica dentro da galeria.

## Fase 0 · Baseline e mapa de alterações

1. Usar fixtures sintéticas de Pedidos e QC. Registrar requisições e estados visuais em Pedidos → Pacotes → Pedidos, incluindo busca, filtro, paginação, detalhe e confirmação de chegada.
2. Reproduzir latência e conflitos com dois usuários autorizados ou duas sessões. Registrar quais operações alteram a posição, a disponibilidade, o manifesto e a listagem de pacotes. Mapear edições vindas de detalhes, reembolsos, importação de QC e alterações de etapa do pacote.
3. Medir separadamente metadados, miniatura e original de QC. Capturar tempo até a primeira imagem visível, tempo até a foto selecionada, bytes e quantidade de downloads em abertura a frio, reabertura e troca rápida de foto. Repetir nas mesmas condições de rede, viewport e fixture após a implementação.
4. Revisar o estado da branch antes de editar. Durante a preparação do plano apareceram mudanças paralelas no fluxo de reserva, incluindo `orders-reservation-actions.tsx` e `open-package-picker.tsx`. Integrar seleção em massa e validação aos pontos de entrada efetivamente presentes no início da implementação.
5. Pontos de partida incluem `orders-screen.tsx`, `orders-list-state.ts`, `orders-selection.ts`, `logistics-packages-screen.tsx`, `warehouse-query.ts`, `warehouse-services.ts`, rotas de armazém/pacotes e `qc-components.tsx`. No baseline inspecionado, as listas mantêm os resultados no componente, o recebimento dispara `refreshKey` e o comando devolve apenas o ID.

## Fase 1 · Cache em memória com TanStack Query

1. Instalar TanStack Query para React e montar o `QueryClient` no layout autenticado comum a Pedidos e Pacotes. Usar uma instância estável por sessão no cliente. Manter o transporte e o tratamento de erros de `costRequest`. Adaptar o transporte para receber `AbortSignal` quando necessário.
2. Criar chaves por usuário, workspace, recurso e parâmetros normalizados. Separar lista de Pedidos, busca por IDs para detalhe e conferência de seleção, lista de Pacotes e opções de destino. Incluir filtros, ordenação, página e tamanho de página quando aplicáveis. Buscar apenas a variante que mudou ao abrir detalhe ou avançar destinos.
3. Começar com 30 segundos de frescor e descarte após 5 minutos sem observadores. Deduplicar consultas equivalentes. Renderizar imediatamente o cache fresco ao revisitar a rota. Revalidar consultas vencidas ao revisitar, recuperar conexão ou voltar ao foco, mantendo os dados visíveis e mostrando falha de atualização junto à lista. Uma consulta sem cache tem seu próprio estado de carregamento. Manter linhas da página anterior como transição apenas no mesmo escopo e impedir ações nessas linhas até a página solicitada chegar.
4. Cancelar consultas e remover dados e mutações pendentes do escopo anterior ao trocar workspace ou encerrar sessão. Ignorar respostas tardias daquele escopo. Manter a validação de autorização no servidor em toda requisição e evitar persistência do cache no navegador.
5. Substituir o refresh geral por atualização da resposta canônica ou invalidação direcionada. Documentar quais listas e detalhes cada ação afeta. Para mutações que alteram pertinência ou posição em uma página, manter o conteúdo útil, marcar apenas as consultas afetadas para reconciliação e recompor página ou totais em segundo plano quando necessário. A confirmação simples de chegada deve funcionar com a resposta da mutação, sem GET integral obrigatório.

**Gate** — Pedidos → Pacotes → Pedidos dentro do período de frescor gera zero GETs adicionais para as listas já visitadas. Filtro e página têm cache independente. Mudança de usuário ou workspace nunca mostra os dados anteriores.

## Fase 2 · Chegada individual e atualização otimista

### Contexto 3 · Modal e contrato do servidor

1. Separar o registro incremental da correção de posição. O modal de registro mostra produto, unidades já registradas, quantidade que chegou agora e total após confirmação. Preencher a quantidade com o saldo elegível de unidades ainda sem chegada registrada, excluindo canceladas. Aceitar valores inteiros positivos até esse saldo e permitir recebimento parcial. Para posição legada a conferir, mostrar que a chegada está sem registro e exigir confirmação explícita da quantidade informada.
2. Sugerir a conta ativa compatível vinculada à origem ou posição. Na ausência de vínculo, usar a conta elegível mais frequente nos registros de chegada bem-sucedidos do usuário no workspace, desempatar pela mais recente e, por último, pelo ID. Sugerir a única conta elegível quando não houver histórico. Se houver várias sem histórico, pedir escolha. Validar a conta novamente no servidor.
3. Criar contrato explícito de registro incremental com item, revisão esperada, conta, quantidade, descrição opcional e chave idempotente. Normalizar descrição em branco como ausente. Preservar o contrato existente de correção e seu motivo obrigatório. Reusar autorização, validação de unidades e auditoria transacional. Se a persistência da auditoria exigir motivo, registrar uma descrição de sistema para a operação, separada semanticamente da observação do usuário.
4. Dentro da transação, verificar vigência, revisão e compatibilidade de conta, preservar unidades já recebidas e reservadas, excluir cancelamentos e selecionar unidades elegíveis em ordem determinística. Gravar posição, auditoria e recibo idempotente juntos. Retornar os dados canônicos necessários à UI, com IDs afetados, conta, revisão, unidades recebidas e disponíveis e demais campos usados para atualizar as projeções. Definir como a repetição da mesma chave obtém uma resposta reconciliável sem reaplicar a chegada, inclusive se a revisão já avançou. Reuso da chave com outro payload ou ator continua sendo conflito.

### Contexto 1 · Projeção e reconciliação

1. Em `useMutation`, registrar a projeção pendente por operação e por item, separada dos dados confirmados. Mostrar a nova quantidade/etapa com indicação de confirmação pendente. Bloquear outra chegada ou correção concorrente na mesma linha e impedir que unidades pendentes habilitem reserva.
2. Em sucesso, aplicar o retorno canônico às consultas com o item e aos detalhes pertinentes, respeitando a revisão mais recente, e remover a projeção. Recalcular etapa e ações a partir da projeção de domínio. Se a linha deixar de corresponder ao filtro, removê-la da página. Reconciliar apenas as variantes cujo total ou ordenação já não possa ser determinado com os dados em cache.
3. Em rejeição definitiva, remover apenas a projeção daquela operação, manter o que o usuário digitou e mostrar o erro. Em conflito de revisão, consultar os IDs afetados, mostrar o estado atual e exigir revisão antes de novo envio. Em timeout, queda de rede ou resposta ambígua após envio, oferecer retomada com a mesma chave e payload. Manter a operação pendente no escopo da sessão ao navegar entre as rotas. Não restaurar uma página inteira no rollback, pois isso pode apagar outras mutações confirmadas.

**Gate** — A linha responde antes do POST terminar. Uma chegada parcial atualiza a linha e o detalhe sem reset da tabela. Uma falha definitiva restaura apenas o item afetado. Uma resposta perdida após commit não duplica unidades nem eventos quando retomada.

## Fase 3 · Seleção em massa e elegibilidade

1. Adicionar checkboxes acessíveis às tabelas de itens de Pedidos/Armazém, com nomes por produto e seleção parcial no cabeçalho. O cabeçalho atua sobre a página visível. Seleções explícitas persistem entre páginas da mesma consulta, com contagem e ação para limpar. Ao mudar filtros ou ordenação, limpar a seleção e informar o usuário. Sempre limpar na troca de escopo. Manter a seleção de linhas separada das quantidades e reaproveitar a revisão de unidades existente.
2. Oferecer **Registrar chegada ao armazém** e **Adicionar a um pacote** com regras de habilitação distintas. Para uma seleção mista, identificar as linhas incompatíveis e exigir ajuste antes de confirmar. Mostrar produtos, contas e unidades na revisão. O lote de chegada aceita quantidades e contas por item e reusa a validação do registro individual.
3. Implementar chegada em massa como um comando com uma chave idempotente, uma revisão esperada por item e uma transação para todo o lote. Adotar como teto inicial os limites da seleção de reserva existente (100 itens e 10.000 unidades por operação). Rejeitar IDs duplicados e limites inválidos. Se uma linha falhar, devolver os conflitos identificáveis e manter o lote sem gravação. Preservar os campos informados na revisão para que o usuário possa corrigir o lote.
4. Para **Adicionar a um pacote**, reaproveitar a reserva existente para pacote novo ou em montagem. Exigir unidades efetivamente recebidas, livres, vigentes e confirmadas na mesma conta ativa do destino. Se a seleção envolver contas distintas, apresentar a incompatibilidade para o usuário dividir o lote. Não dividir ou escolher destinos silenciosamente.
5. Auditar todos os pontos de entrada para adicionar conteúdo, incluindo chamadas diretas à API e edição de pacote. Reusar a validação transacional existente. Conferir revisão do item e do destino, etapa e abertura do pacote, compatibilidade de workspace/conta e disponibilidade de cada unidade na transação. Uma chegada parcial libera apenas o subconjunto recebido e livre. QC e pagamento não alteram elegibilidade. Oferecer motivo acionável na UI para bloqueios por chegada, conta, reserva ou estado do destino.

**Gate** — Um item inválido impede a gravação do lote de chegada inteiro. Duas reservas concorrentes para a mesma unidade têm apenas uma vencedora. A rota de escrita rejeita uma tentativa direta de reservar unidades sem chegada.

## Fase 4 · Ordenação das tabelas de itens

1. Adicionar campo de ordenação e direção à URL, estado de filtros, schema da API e chave de cache. Preservar a ordem atual quando a URL omitir esses parâmetros. Resetar a página ao mudar ordenação. Manter o seletor próprio da lista de pacotes, onde as colunas descrevem pacotes.
2. Ordenar antes de paginar. `warehouse-query.ts` hoje pagina identidades antes de carregar projeções. Definir chaves canônicas de ordenação na consulta do servidor ou em projeção reutilizável. Para custo e etapa, testar paridade com a projeção exibida. Evitar carregar todos os detalhes em memória apenas para ordenar e evitar SQL interpolado a partir de parâmetros livres.
3. Usar comparação textual adequada ao português para Produto, ordem logística explícita para Etapa, número exibido para Unidades e valor monetário exibido em centavos para Custo. Proposta de precedência de etapa crescente: chegada sem registro, a caminho, recebido no armazém, em pacote, enviado e recebido no Brasil. Etapas mistas, cancelados e indefinidos formam grupos finais estáveis. Custo indefinido permanece ao fim nas duas direções. Manter desempate por identidade estável.
4. Usar botões acionáveis por teclado nos cabeçalhos e `aria-sort` na coluna ativa. Alternar crescente/decrescente. Ações não recebe controle de ordenação. Onde a tabela vira cartões no mobile, usar os mesmos parâmetros em um seletor acessível.

**Gate** — Os resultados são ordenados entre páginas, incluindo valores iguais e indefinidos. URL direta e navegação voltar/avançar restauram filtro, coluna, direção e página.

## Fase 5 · QC com foto ativa prioritária

1. Reusar o cache de Blobs, as miniaturas WebP, as rotas autenticadas, a revalidação privada com `ETag` e o fallback privado existente. Preservar invalidação por mudança de capa, exclusão e troca de escopo.
2. Na abertura e troca de foto, usar a miniatura já disponível como imagem temporária no painel principal. Se necessário, solicitar a miniatura ativa com prioridade no cache existente. Reservar as dimensões do painel e iniciar a resolução do original selecionado assim que houver o ID ativo, sem esperar a faixa de miniaturas carregar. Substituir a miniatura quando o original estiver pronto para exibição. Em falha, preservar a miniatura e oferecer o fluxo de recuperação existente.
3. Carregar as miniaturas da faixa ao entrar na área visível do contêiner, com margem curta e o limite de concorrência existente. Usar observação de visibilidade para controlar a aquisição dos Blobs, pois `loading="lazy"` no elemento final não posterga um fetch iniciado pelo componente. Preservar foco, rolagem para a miniatura selecionada e dimensões dos placeholders. Cancelar trabalho obsoleto quando possível e descartar respostas cujo ID ou escopo já mudou. O único original elegível para download é o da foto selecionada.
4. Comparar com o baseline da fase 0. Registrar separadamente o ganho na primeira imagem visível e o tempo até o original. Se a latência dominante estiver no original e persistir, registrar a evidência para decisão posterior sobre uma versão intermediária privada.

**Gate** — Reabrir a galeria com miniatura ativa em cache mostra imagem enquanto o original carrega. Miniaturas fora da área visível não iniciam downloads antecipados. Trocas rápidas e respostas atrasadas não exibem a imagem errada. O fluxo de recuperação do original continua funcional.

## Fase 6 · Verificação e entrega

| Cobertura | Casos mínimos |
| --- | --- |
| Unidade | Chaves e isolamento do cache, projeção otimista por operação, reconciliação por revisão, quantidade elegível, sugestão de conta, ordenação e visibilidade das miniaturas. |
| Integração | Recebimentos parciais e legado, descrição opcional no registro e motivo obrigatório na correção, rejeição atômica do lote, replay idempotente após commit, autorização em workspaces pessoal e compartilhado, cancelamento e concorrência de reservas, paginação ordenada no servidor. |
| Playwright | Ida e volta sem GET redundante, sucesso/erro/timeout com resposta lenta, filtros e ordenação pela URL, seleção entre páginas, teclado e mobile, bloqueio de reserva de unidades pendentes, galeria fria e quente, troca rápida, fallback e exclusão. |
| Regressão | Fluxo completo de montagem e envio, pagamento e reembolso, histórico imutável, rotas legadas e comportamento existente de QC fora do visualizador. |

Rodar `npm run lint`, `npm run typecheck`, testes unitários e de integração pertinentes e os suites Playwright de Pedidos, Pacotes e QC. Rodar `npm run build` antes do handoff. Se uma alteração de schema se mostrar necessária, justificar a migration, executá-la explicitamente em banco local isolado e verificar dados preexistentes. O plano não pressupõe migration, mudanças de infraestrutura ou acesso à produção.

Entregar a implementação com resultados dos gates, comparação de rede e tempos de QC, e quaisquer casos que ainda precisem de verificação manual. Implementar em fases, corrigindo regressões antes de avançar.

## Reconciliação do cache

| Mudança | Consultas afetadas |
| --- | --- |
| Chegada individual ou em lote | Atualiza por revisão as linhas e os detalhes com os IDs retornados. Revalida as listas filtradas por conta ou chegada e as listas ordenadas por unidades ou etapa. |
| Correção de chegada, reserva, remoção ou troca de pacote | Revalida as listas de pedidos e pacotes, os detalhes dos itens e os destinos. |
| Alteração de etapa, conteúdo, custos ou reembolsos | Revalida as listas de pedidos e pacotes, os detalhes dos itens e os destinos. |
| Importação de QC em Pedidos | Revalida a lista de pedidos e os detalhes dos itens. |

Pedidos e Pacotes compartilham um cache em memória com 30 segundos de frescor. A mudança de usuário ou workspace encerra o cache daquele escopo. A revalidação de uma seleção de reserva consulta os IDs marcados antes de preparar e confirmar a operação.

## Validação local

- Vitest com duas tarefas concorrentes e limite de 30 segundos por teste. 613 aprovados e 7 pulados.
- Playwright no build de produção local com bancos sintéticos. 16 testes de Pedidos, 1 de Pacotes e 3 de QC aprovados.
- Na navegação Pedidos → Pacotes → Pedidos, voltar a uma lista fresca gerou zero GETs adicionais. O lote exibiu a chegada pendente antes da resposta e atualizou as linhas sem outro GET da lista.
- No teste móvel com resposta original retida pelo Playwright, a miniatura apareceu em 224 ms e o original em 286 ms. A faixa com 12 miniaturas deixou as mais distantes sem requisição e o visualizador recuperou a falha simulada do original.
- Em cinco rodadas da medição de capas, o resultado atual teve mediana de 698 ms até a primeira capa e 32 leituras a frio (3.584 bytes), com zero leituras adicionais do armazenamento na repetição quente. O registro histórico da mesma rotina tinha 1.816 ms e 84 leituras (9.408 bytes). O baseline é histórico e não foi reexecutado lado a lado nesta rodada.
