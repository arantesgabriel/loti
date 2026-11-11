# Plano de correção do code review — Pedidos e Pacotes

Execute em três etapas, na ordem abaixo. Use o [plano aprovado](45_ORDERS_PACKAGES_PERFORMANCE_AND_BULK_PLAN.md) como contrato e siga a ordem de leitura do `AGENTS.md` antes de codificar. A implementação revisada estava no diretório de trabalho. Comece conferindo `git status` e o diff atual para integrar as correções às alterações existentes.

## 1 · P1 · Exigir nova revisão após conflito de chegada em massa

**Pontos de entrada** — `orders-screen.tsx`, `orders-bulk-actions.tsx` e `warehouse-services.ts`.

1. Reproduzir com duas sessões. Abrir um lote que inclui um item com saldo de três unidades e informar uma chegada de uma unidade. Na segunda sessão, registrar essa mesma chegada. Na primeira, enviar a revisão antiga, receber o 409 e tentar confirmar novamente. O bug ocorre porque o formulário troca a revisão silenciosamente e reaproveita a quantidade anterior.
2. Para conflito de revisão, buscar as linhas atuais por ID. Manter os valores digitados como rascunho e mostrar, por linha afetada, o total recebido atualizado, o saldo restante e a conta compatível. Mostrar separadamente a quantidade informada antes do conflito.
3. Bloquear o reenvio até o usuário revisar e confirmar explicitamente as quantidades afetadas. Permitir ajustar ou retirar uma linha que ficou inelegível. Se a consulta de reconciliação falhar, manter o bloqueio e oferecer nova tentativa de carregar os dados. Depois da revisão, enviar as revisões atuais com uma nova chave idempotente.
4. Distinguir conflito definitivo de resposta ambígua. Em timeout ou perda de conexão após envio, oferecer retomada com a mesma chave e o mesmo payload, pois o commit pode ter ocorrido. Preservar a validação de revisão e a atomicidade do lote no servidor.

**Aceite** — O primeiro conflito não grava nenhuma linha do lote. Um segundo clique no formulário sem revisão explícita não envia novo POST. Depois da revisão, apenas as quantidades confirmadas são registradas. Se a resposta de um lote gravado se perder, o replay não duplica unidades nem eventos.

## 2 · P2 · Impedir que um GET anterior ao commit restaure dados antigos

**Pontos de entrada** — `orders-screen.tsx` e `logistics-query.tsx`.

1. Reproduzir com um GET sem cache iniciado antes do commit da chegada. Reter o snapshot antigo do GET, devolver primeiro a resposta canônica do POST e liberar o GET depois. Cobrir a lista padrão e o detalhe, incluindo navegação enquanto o POST está pendente.
2. Na reconciliação do sucesso, considerar consultas em andamento do escopo de usuário e workspace, inclusive aquelas que ainda não têm dados no cache. Para detalhes, identificar os IDs pela chave de consulta. Para listas em andamento cuja pertinência não seja conhecida, cancelar e revalidar somente as consultas potencialmente afetadas. Verificar que o transporte consome o `AbortSignal` e que uma resposta tardia não repovoa o cache.
3. Aplicar a resposta canônica onde houver dados suficientes, respeitando a revisão mais recente. Manter a lista visível ao reconciliar filtros, ordenação ou paginação. Uma confirmação simples com cache estável deve atualizar a linha sem disparar GET integral. Preservar a limpeza na troca de workspace e impedir que uma operação de um escopo anterior alimente o atual.

**Aceite** — Após o POST confirmado, liberar a resposta antiga não regride quantidade, etapa ou disponibilidade na lista e no detalhe. A ida e volta entre rotas com cache fresco continua sem novos GETs. Consultas de outros workspaces e páginas que podem ser corrigidas localmente não recebem revalidação desnecessária.

## 3 · P2 · Reduzir o custo da ordenação financeira

**Pontos de entrada** — `warehouse-query.ts`, `warehouse-services.ts` e `package-cost-reading.ts`.

1. Montar uma fixture com vários acompanhamentos e mais de uma página. Incluir itens originais e adicionais, custos parciais, reembolsos, valores empatados e custo indefinido. Registrar contagem de consultas e duração da listagem ordenada por custo antes da mudança.
2. Substituir o laço que chama `readCostTracking` para cada acompanhamento por uma leitura em lote dos dados necessários para calcular as chaves de custo. Reusar o cálculo canônico e manter autorização e consistência do snapshot. Limitar o volume por lote conforme os limites do banco. Reservar a projeção completa das linhas para os IDs da página resultante.
3. Ordenar globalmente antes de paginar. Usar os centavos exibidos na interface, com o valor conhecido quando o custo for parcial. Manter custo indefinido no fim em ambas as direções e desempatar por identidade estável. Confirmar que busca e filtros são aplicados antes da ordenação.

**Aceite** — Para cada item, a chave de ordenação equivale ao custo exibido. A sequência é estável entre páginas nas duas direções. A leitura das chaves não monta uma projeção financeira completa por acompanhamento e a comparação com a fixture demonstra a redução no número de consultas.

## Verificação e handoff

- Adicionar testes de integração para conflito e replay de chegada e para paridade da ordenação. Adicionar casos Playwright para a revisão do lote após 409 e para o GET atrasado durante a confirmação.
- Rodar `npm run lint`, `npm run typecheck`, as suítes de integração de armazém, listagem e workspace pessoal, os cenários Playwright de Pedidos e Pacotes e `npm run build`. A revisão original já passou em typecheck e seis testes de integração. Os cenários novos precisam demonstrar a falha original e a correção.
- Entregar os resultados por achado e a comparação de volume de consultas da ordenação. Manter Q1 e o visualizador de QC fora do escopo das correções.
