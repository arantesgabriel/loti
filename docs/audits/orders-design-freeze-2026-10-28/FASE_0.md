# Fase 0 · Pedidos — diagnóstico e plano para aprovação

Data: 28/10/2026 (America/Sao_Paulo). Autorização: prompt mestre anexado por Gabriel e pacote indicado em Downloads. **Somente Fase 0. Nenhuma fase de implementação liberada.**

Baseline: branch `feat/orders`, SHA `2f547155ea31d67fa86978cca7e53329c1f05918`. Node 24.21.0 / npm 12.2.1. Estado inicial: `next-env.d.ts` modificado e `reset-password.sh` não rastreado. Nenhum commit, PR, deploy, seed ou comando de migration de ambiente foi executado. As suítes de integração aplicam migrations nas próprias fixtures descartáveis.

## 1. Autoridade visual e evidência

Pacote original copiado para `handoff/`, sem editar os arquivos em Downloads. Prompt em `PROMPT_MESTRE.md`. A governança desta tarefa substitui a execução automática dos planos anteriores: uma fase por aprovação explícita.

MCP conectado ao arquivo **Loti Design System**, ID `64ee36db-f4d2-8047-8008-dbff2f7d7205`, revisões atuais observadas **132 e 133**, páginas **Pedidos Loti** e **Pedidos · Mobile**. `findVersions()` confirmou a presença da versão manual `DESIGN FREEZE · Pedidos Loti · 04A/04B · Desktop + Mobile · 28-10-2026`.

Foram exportados e inspecionados visualmente via MCP, nesta sessão:

| Frame | ID | Evidência observada |
| --- | --- | --- |
| 04A fechado | `a1bbb7fd-3432-8020-8008-dc1025ad5d01` | Canvas 1500×930; tabela integral; cinco colunas; tabs; foto+; preparar pacote |
| 04A aberto | `a1bbb7fd-3432-8020-8008-dc0414fc70a0` | Tabela contrai; painel integrado à direita; seleção e resumo no painel |
| 04B JBL | `a1bbb7fd-3432-8020-8008-dc043cdce618` | Um produto; disponibilidade, custo, QC, ações e origem resumida |
| M07 detalhe | `a1bbb7fd-3432-8020-8008-dc086358ee0a` | Sheet inferior arredondada; backdrop; handle; fechamento; CTA inferior |
| M01 lista | `a1bbb7fd-3432-8020-8008-dc06d1144484` | 390×844; tabs Todos/Disponíveis/A caminho; lista de quatro itens e Mais 2 pedidos; resumo inferior |
| M03 preparação | `a1bbb7fd-3432-8020-8008-dc06d69dc9f7` | 390×844; sheet inferior com dois produtos, steppers, remover, resumo e CTA |

Os exports foram exibidos no chat, não gravados como arquivos locais. IDs dos demais estados constam do manifesto copiado. A referência AS-IS visual inspecionada foi a captura sintética já existente `artifacts/qa/orders-transition/residual-legacy-orders-light-1440.png`, de 28/10, confrontada com o código atual; **não é uma captura nova desta auditoria**. Não houve sessão nova de navegador/E2E nem comparação pixel a pixel de todos os frames.

**Limite da prova histórica:** o Plugin API lista versões, mas a operação disponível para acessar seu conteúdo é `restore()`, que substitui o arquivo. Não foi usada. Assim, os exports são das revisões atuais, e não há prova de igualdade com o snapshot congelado. O plugin reportou aba suspensa; Gabriel respondeu “voltei pra tela, prossiga”, permitindo retomar a leitura de M01/M03 e propriedades. Essa resposta autoriza continuar a F0, não aprova F1. Antes de implementar visual, disponibilizar o freeze para consulta/export sem restaurar ou modificar o arquivo original. O diagnóstico de código permanece válido.

Propriedades lidas: desktop 1500×930, título Pedidos 29/700, nome na lista 14/600 e no detalhe 20/700; mobile 390×844, título 25/700 e nome 13/600. Família dominante **Inter Tight**, com Source Sans Pro em alguns controles de quantidade. Não copiar acidentalmente a segunda família para toda a tela. A diferença das tabs entre desktop e mobile é real nos frames; mapear Todos/Disponíveis/A caminho mobile para os filtros servidores, sem forçar o mesmo trio desktop. Os marcadores desenhados no protótipo não autorizam imagens de anúncio nem associação de QC por unidade.

## 2. Mapa real do projeto

Stack instalada: Next 16.3.8, React 19.3.0, TypeScript 6.0.3 strict, Tailwind 4, Radix Dialog/Dropdown, componentes locais shadcn, Better Auth 1.7.7, Drizzle 0.45.3, `@libsql/client` 0.18, Zod 4, React Hook Form, Vitest 5 e Playwright 1.63. Estilos operacionais combinam CSS global/tokens semânticos e CSS local. Fonte atual Geist, ícones Lucide, marcadores SVG internos. Não atualizar dependências por consequência desta tarefa.

| Área/arquivo | Contrato atual e uso planejado |
| --- | --- |
| `src/app/(app)/orders/page.tsx` | Lê querystring e valida filtros iniciais; manter links e paginação |
| `src/components/orders/orders-screen.tsx` | Coordena busca, filtros, linhas, seleção, chegada e reserva; principal área de decomposição |
| `src/components/orders/orders.css` | Estilos locais e tabela/lista responsiva; principal área visual |
| `src/app/(app)/orders/[orderId]/page.tsx` | Resolve order/tracking e abre `PackageCostDetailScreen` completo, com foco no item; preservar como destino de origem/links antigos |
| `src/app/api/warehouse/route.ts` | GET paginado / POST comando, sessão, origem, Zod e respostas privadas |
| `src/lib/domain/warehouse-services.ts` | Leitor de posições e comandos `receive`, `reserve`, `release`; reutilizar |
| `warehouse-query.ts` / `warehouse-calculations.ts` | Filtros SQL, saldo de unidades e capacidades em centavos; não reproduzir em JSX |
| `src/lib/db/schema.ts` | Entidades reais descritas abaixo; nenhuma migration proposta para shell/lista |
| `src/lib/domain/package-cost-reading.ts`, `package-cost-display.ts` | Projeção financeira por origem/item; fonte de custo e pendências |
| `src/components/packages/package-cost-detail-screen.tsx` | Editores financeiros, pagamentos, adicionais e ponto atual de importação QC; extrair adaptadores pequenos quando necessário |
| `src/components/packages/refunds-section.tsx` | Solicitação/recebimento/correções auditadas; reaproveitar sem duplicar regras |
| `src/components/qc/qc-components.tsx`, `qc-reading-hooks.ts`, `qc-preview-cache.ts` | Importador, viewer, capas, previews e invalidação; manter pipeline |
| `src/components/ui/surface.tsx`, `packages/package-surface.tsx` | Radix, portal, foco, Escape e retorno; reutilizar comportamento com variante local |
| `src/components/layout/app-shell.tsx` e estilos de sidebar | Shell existente e ilha mobile com Mais; preservar navegação e tema |
| `src/components/orders/logistics-*` e `/api/logistics/packages` | Fluxo de Pacotes existente; só verificar integração e links |

Não existe query-cache generalista na tela: consulta via `costRequest`, estado React, guard para respostas de consulta antigas, `refreshKey`, querystring e `history.replaceState`. QC tem caches próprios. Evitar introduzir outra store ou biblioteca de dados sem necessidade.

### Identidade e dados

`purchase_cost_orders` é a origem comercial, original/adicional; `purchase_cost_trackings` liga à compra finalizada. `purchase_item_costs.id` (**costItemId**) identifica a linha operacional. O snapshot é `purchase_items` OU `purchase_additional_order_items`, nunca ambos. Participantes vêm de `purchase_cost_participants`; não inventar um comprador exclusivo para item compartilhado. Conta é FK verificada de `hubbuy_accounts`, não texto de email.

`order_warehouse_positions` guarda recebimentos por índices, conta, conferência e revisão; `logistics_reservations` liga cada unidade a `logistics_packages`. Refunds, pagamentos e ledger continuam nas tabelas existentes. QC usa destinos discriminados `purchase:<id>` e `additional:<id>`. **costItemId, orderId, trackingId, purchaseId e target QC não são intercambiáveis.**

## 3. AS-IS → freeze

| Antes | Depois previsto | Por quê / risco |
| --- | --- | --- |
| Tabela já ocupa sua largura, com nove colunas | Cinco colunas do freeze; informação completa no item | Reduzir densidade sem ocultar conferência, reservas, pagamentos e situações mistas |
| Clique navega para compra e custos completos | `item-detail(costItemId)` integrado à listagem | Resolver exatamente origem e target QC; sem vazamento entre itens |
| Detalhes expandem inline | Painel 04B / sheet inferior | Preservar acesso à composição e destinos das unidades |
| Campo `input type=number` | Stepper − n + | Limites reais; não alterar o comando servidor |
| Seleção em barra e confirmação em Surface | Preparação 04A persistente / sheet | A seleção precisa sobreviver a detalhe, filtros e páginas |
| Filtros avançados inline; sem tabs principais | Tabs e filtros compactos desktop/mobile | Reutilizar SQL; não filtrar somente a página carregada |
| Importador dentro da compra | Ícone foto+ global e contexto de origem explícito | Backend QC atual é por purchaseId |
| Surface compartilhada fixa à direita e `slide-in` horizontal | Painel desktop que participa do grid; bottom sheet local | Drawer em portal sobreposto não contrai tabela; mobile atual não satisfaz o freeze |
| Geist e cores globais quentes | Tipografia/cores do freeze restritas a Pedidos | Handoff menciona Inter Tight e outro laranja; não mudar tema global ou sidebar |

Não presumir que um item tem uma única etapa: recebidas, livres, reservadas e enviadas podem coexistir. `warehouse` inclui reservas em montagem; `available` exige saldo livre confirmado. `received` no filtro atual significa recebido no ciclo do pacote, não simplesmente chegada ao armazém. O badge do protótipo não pode eliminar essas distinções. Manter resumo operacional legível e explicação no detalhe.

A busca SQL atual cobre nome, enquanto o freeze diz produto **ou pedido**. Se isso incluir referência/ID de pedido, a F2 precisa de ajuste mínimo analisado no leitor existente. Não preencher com busca simulada. Não há contagem de todas as tabs independente da consulta atual; não inventar contadores globais a partir de 20 linhas.

## 4. Inventário QC

- Entrada atual: `QcImportPanel` na tela de compra/custos; `POST /api/purchases/[purchaseId]/qc` com `prepare`, `resolve`, `batch`, `reconcile`. `GET` oferece resumo, galerias e apresentações limitadas. Manifests: `/api/qc/imports/[importId]` para confirmação, progresso e lotes.
- Parser real `parseHubBuyImport`: `code` de sucesso, `data.list[].goodsList[]`, IDs `orderGoodsId`/`orderGoodsNo`, `orderNo`, URL e SKU. Apenas `freePhotos`; ignora imagem do anúncio. Limites: corpo 1 MiB, 100 pedidos externos, 500 ocorrências e 200 fotos antes da deduplicação. Foto: 8 MiB, 8192 px/eixo, 25 MP. Não existe upload arbitrário de fotos; entrada de arquivo JSON pode alimentar o parser existente.
- Matching conserva associação prévia; novo auto-match exige anúncio conhecido, variante literal não vazia, candidato inequívoco e quantidade coerente. Nome não decide vínculo. Confirmação refaz autorização/revisões e aceita destino discriminado.
- Ocorrência pertence à compra/workspace, pode associar várias ocorrências ao mesmo item. Foto não identifica uma unidade física. Reservar, cancelar ou mover pacote não move objetos nem altera QC.
- `hubbuy_external_items`, `qc_images`, `qc_image_sources`, `qc_imports`, eventos/limites; capa em `qc_presentations` ou `qc_additional_presentations`; previews em `qc_image_previews`. Dedupe por URL/conteúdo dentro da ocorrência, aliases, claims e tombstones. Ausência no JSON não apaga foto.
- `prepare()` atual trabalha com `emptyTargetsOnly: true`: itens já fotografados são ignorados; `skippedOccurrenceCount` informa exclusões. **“Atualizar todos os itens já com QC” não é o contrato atual.** Reimportar não equivale a substituir/adicionar indiscriminadamente fotos.
- Primeira imagem pronta inicia capa; fotos posteriores não substituem capa manual válida. Exclusão/rematch repara apresentação transacionalmente. Viewer usa galeria paginada de 12, previews privados e um original selecionado, com source/fallback autorizado. Não reimplementar cache, assinatura, download ou ordenação.
- Toda leitura exige sessão/membership/compra finalizada; gestão exige o ID exato de `LOTI_QC_MANAGER_USER_ID`. Origem confiável, DTO estrito, quotas e lease persistidas. Storage privado R2; sem segredo no cliente. Nenhuma configuração externa lida ou alterada nesta auditoria.
- Testes existentes: `qc-validation`, `qc-matching`, `qc-http`, `qc-download`, `qc-image-validation`, `qc-concurrency`, `qc-client-state`, previews/cache; integração `qc-services`, `qc-migration`; E2E `hubbuy-qc`, `qc-viewer-performance`.

**F5 proposta:** um único JSON de entrada, prévia com origem Loti explícita por ocorrência ambígua, agrupar por purchaseId autorizado e executar os manifests existentes sequencialmente, respeitando limites/lease por workspace. Informar sucesso parcial e retomada por grupo; não prometer uma transação global cobrindo R2 e várias compras. Não criar novo endpoint/schema antes da análise e aceite do contrato. Itens sem correspondência e contas incompatíveis permanecem pendentes/ignorados, nunca associados por nome.

## 5. Seleção e montagem

Saldo real: `availableWarehouseUnits(quantity, receivedUnits, refunds, reservedIndexes)`. Retorna índices recebidos sem cancelamento ativo ou reserva ativa, ordenados e estáveis. `pending_review` expõe disponibilidade vazia. Mínimo da seleção 0; máximo `availableUnits.length`. Quantidade comprada não é esse máximo.

Hoje `selected[costItemId]` guarda quantidade e cópia de row. O comando usa `availableUnits.slice(0,n)`, conta, motivo, revisões de posição e de pacote quando existente. Nova preparação deve manter IDs/índices e reconciliar dados atualizados; cópia antiga de row não pode ser autoridade permanente. Resumo selecionado atual calcula centavos em JSX com helper de capacidade: mover a composição para função pura/adaptador testável, preservando exatamente a lógica existente.

Servidor: POST warehouse → `execute()` → membership → recibo de `logistics_commands` → transação immediate/retries → conta ativa/conferida → pacote aberto/mesma conta → posição e revisão → origem recorded e vigente → saldo atualizado → reservas → revisões/evento/recibo. Limites: 100 linhas / 10 mil unidades por comando. Índice único parcial `logistics_active_unit_idx(costItemId,unitIndex)` impede duas reservas ativas. Falha numa linha faz rollback inclusive do pacote novo.

A chave idempotente atual é criada a cada `submit`. Na F4, manter a mesma chave e payload durante retry de resposta perdida; nova chave somente para uma nova intenção. Conflito de disponibilidade preserva seleção, recarrega/revisa unidades e identifica os itens afetados. Atual erro é textual agregado; detalhamento por item exige pré-validação/readback ou contrato mínimo aceito, sem alegar que já existe.

Montagem atual permite **criar novo pacote ou adicionar a existente**, requer nome quando novo, conta e motivo. O freeze simplifica esses campos: preservar na revisão contextual, sem remover validações de servidor. `release` libera unidades sem cancelar produto/gerar crédito. Refund novo só pode usar unidades fora de qualquer reserva; confirmar recebimento de refund antigo continua separado.

Testes existentes: `warehouse-calculations`, `warehouse-workflow`, `warehouse-concurrency`, `logistics-transition-races`, `logistics-finalization`, `orders-transition-baseline/comparison`; E2E em `tests/orders-transition/`, incluindo paginação, navegação e novo fluxo.

## 6. Plano por aprovação

Árvore proposta em `src/components/orders/`: manter `orders-screen` como coordenador; separar `orders-toolbar`, `orders-list`/`order-row`, `order-detail-panel`, `order-preparation-panel`, `orders-bottom-sheet`, `quantity-stepper` e adaptadores tipados. Nomes finais ajustáveis sem ampliar escopo. Estado de painel discriminado `closed | prepare | item-detail(costItemId)`; overlays secundários e rascunhos separados, seleção e filtros independentes. Desktop grid de uma coluna quando fechado e duas somente quando aberto. Sheet mobile com Radix/foco/portal já existentes e CSS local vertical.

| Fase | Porte | Blocos / dependência | Critério verificável |
| --- | --- | --- | --- |
| 1 | M | Confirmar conteúdo congelado; mapear tokens locais; shell e painel/sheet acessível; sem novos dados/backends | 320–1920 sem overflow; fechar restitui largura; foco/ESC; movimento vertical no mobile; outras telas preservadas |
| 2 | G | F1 aprovada; lista real, filtros/tabs/querystring/paginação; revisar busca por pedido | Resultados por SQL e total real, sem paginação fantasma; full-width desktop; lista mobile; loading/empty/error/retry |
| 3 | G | F2 aprovada; 04B por costItemId e adaptador de origem/QC; galerias existentes | Dois itens alternados sem vazamento; originais/adicionais; sem QC; contexto/foco preservados; sem navegar à compra inteira |
| 4 | G | F3 aprovada; seleção entre páginas; stepper; revisão conta/destino/motivo; reserve real | 0/max; uma conta; criação e acréscimo; resposta perdida com mesma chave; duas sessões/rollback; total exato |
| 5 | G | F4 aprovada; aceitar contrato de escopo global; arquivo/colar → prévia → grupos/manifests existentes | JSON inválido/duplicado/ambíguo/parcial; permissões; sem sobrescrever capa; sem duplicar vínculos; retomada granular |
| 6 | G | F5 aprovada; adaptar chegada/edição/refund/origem aos painéis, sem motor financeiro novo | Validações atuais; cancelamento sem escrita; reserva impede refund; pagamento/taxa/snapshots iguais; mobile vertical |
| 7 | G | F6 aprovada; QA visual com freeze, integração/E2E e regressão/a11y | Viewports 320/360/390/430/768/1024/1280/1500/1920; light/dark sem regressão; foco/teclado/reduced-motion; aceite humano explícito |

Cada fase pode formar um diff/PR próprio **se autorizado posteriormente**; nenhum PR/commit criado agora. Rollback de UI: reverter apenas os componentes/adaptadores da fase, preservando backend e dados; não desfazer reservas reais por rollback de interface. Schema permanece intacto no plano inicial. Se surgir necessidade de migration, apresentar impacto, rollback e autorização separados.

## 7. Baseline e limites

Logs desta execução nesta pasta. Nenhuma falha foi corrigida em código, pois a Fase 0 é diagnóstico.

- `npm run lint`: PASSOU, exit 0 (`lint.log`).
- `npm run typecheck`: PASSOU, exit 0 (`typecheck.log`).
- `npm run build`: primeira tentativa EPERM ao criar diretório no sandbox (`build.log`); retry local autorizado pelo mecanismo de revisão automática PASSOU, exit 0 (`build-retry.log`). Saída isolada `.next-orders-freeze-phase0`, URL de banco local explícita sem token, auth sintética. Nenhum deploy.
- Next gerou referências em `next-env.d.ts` e adicionou includes ao tsconfig durante build. Os includes adicionados foram retirados; `next-env.d.ts`, já modificado no início, ficou regenerado apontando ao build isolado. Não alegar preservação byte a byte desse arquivo gerado; não houve mudança de produto. `reset-password.sh` não foi tocado.
- `npm test`: FALHOU no ambiente inicial: 70 arquivos falharam / 12 passaram; 11 testes falharam / 73 passaram, com erros ENOENT de cache SSR temporário, arquivos de fixture e timeouts (`tests.log`). Não concluir defeito funcional a partir dessa execução.
- Retries com 2 workers e serialização no pool padrão tiveram timeouts ou ficaram sem produzir resultado; interrompidos (`tests-isolated.log`, `tests-retry.log`, `tests-serial.log`).
- Diagnóstico com `--pool=threads --maxWorkers=1 --no-file-parallelism`: 3 arquivos / 24 testes de disponibilidade, parser e matching PASSARAM (`tests-targeted.log`). Integração direcionada `warehouse-workflow.test.ts` + `qc-services.test.ts`: 2 arquivos / 49 testes PASSARAM, 25,81 s (`tests-integration-targeted.log`). A suíte completa com threads não produziu relatório final; ao encerrar a sessão, o processo retornou **-1073741819 (0xC0000005)** (`tests-threads.log`). Baseline global de testes permanece inconclusivo por falha do processo; não há evidência suficiente para atribuí-la ao domínio. Os 73 testes direcionados não substituem a suíte completa.
- Playwright/E2E: NÃO EXECUTADO nesta auditoria. Existe runner específico `playwright.orders-transition.config.ts`, porta padrão 3139, banco sintético obrigatório e sem webServer automático. Não iniciar o runner genérico implicitamente: seu fallback usa/apaga `data/e2e.sqlite`. Nenhum teste de navegador ou operação em banco existente foi disparado.
- Build lê arquivos `.env` por comportamento do Next; o destino de banco/auth foi sobrescrito explicitamente para valores sintéticos no processo. Não foram exibidos conteúdos desses arquivos nem realizadas operações externas de storage/email.

## 8. Riscos e decisões

**Para iniciar F1:** aprovação de Gabriel e acesso verificável ao conteúdo do snapshot congelado. A presença do rótulo no histórico não prova que os exports da revisão atual sejam idênticos. A inspeção pendente deve ser retomada sem restaurar o original.

**Antes da respectiva fase, não bloqueiam diagnóstico/shell:**

1. F5: confirmar preservação de `emptyTargetsOnly` (recomendado, comportamento atual) versus permitir novas fotos em itens já fotografados (mudança de regra e testes). Também aceitar processamento por grupos com falhas parciais explícitas; atomicidade global não existe hoje.
2. F2/F3: freeze simplifica etapas e quantidades; manter estados mistos, conferência legada e custos parciais verdadeiros. Resolver apresentação usando frames adicionais, sem falsos badges/zero financeiro.
3. F1: Inter Tight e paleta do freeze divergem do global Geist. Proposta: estilos/fonte locais de Pedidos, sem mudar sidebar, login ou tema geral; confirmar medidas nos nós reais antes de fixar tokens.
4. F4: revisão exige conta, novo/existente, nome e motivo ausentes do painel resumido do protótipo. Preservá-los no passo de confirmação; se o frame de revisão não comportar os obrigatórios, apresentar adaptação para decisão antes de implementar.

Observações técnicas: extrair editores do arquivo grande de custos aumenta superfície de regressão; fazer adaptadores mínimos. Não carregar fotos/custos de todo workspace antecipadamente. Não ampliar a exceção de previews para outras superfícies. Não associar fotos a unidades inventadas. Falhas de runner precisam de classificação antes de afirmar baseline verde.

## 9. Aceite da Fase 0

| Critério | Estado | Evidência |
| --- | --- | --- |
| Mapa de rotas, domínio, QC, seleção e APIs reais | OK | Seções 2–5 e símbolos do checkout |
| Plano de fases, portes e critérios | OK | Seção 6 |
| Lint, typecheck e build executados | OK | Logs locais; retries explicitados |
| Testes executados e limitações identificadas | OK | Seção 7; não equivale a todos aprovados |
| Inspeção de frames reais desktop/mobile | PARCIAL | Seis exports atuais; demais estados/histórico pendentes |
| Igualdade com snapshot histórico congelado | BLOQUEADO | API sem leitura histórica; aba suspensa |
| Alteração funcional, deploy, migration de ambiente | NENHUMA | Somente diagnóstico/documentação/logs e geração de build |
| Aprovação para F1 | PENDENTE | Apenas Gabriel pode conceder |

**Fase 0 entregue para revisão; Fase 1 não iniciada.**
