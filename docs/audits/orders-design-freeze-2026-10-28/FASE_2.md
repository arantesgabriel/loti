# Fase 2 · Listagem e filtros — entrega para aprovação

Autorização de Gabriel: **“prossiga para a proxima fase”**, após a entrega da F1. Branch `feat/orders`; baseline SHA `2f547155ea31d67fa86978cca7e53329c1f05918`. Esta entrega abrange somente a F2. A F3 depende de nova aprovação. Sem commit, PR, deploy, migration de ambiente ou configuração externa.

## Implementado

- Listagem semântica com cinco colunas: Produto, Etapa, Unidades, Custo e Ação. Marcadores SVG pequenos; nenhuma foto operacional. Composição compacta no mobile, preservando sidebar e ilha de navegação existentes.
- Busca com debounce de 300ms e Enter, etapa, tabs, filtros avançados com aplicar/cancelar, indicadores dos filtros ativos, contagem e paginação real de 20 itens. URL preserva os filtros; mudanças de filtro reiniciam a página. Página fora do intervalo é normalizada após a resposta.
- Busca parametrizada por produto, variante, referência/ID do pedido e nome da compra de origem. Novo parâmetro opcional `view` no endpoint existente `/api/warehouse`: `all`, `warehouse`, `available`, `awaiting`. Tab e etapa são condições cumulativas. Sem endpoint, tabela ou migration novos.
- Estados de carregamento, vazio, erro e tentar novamente. Seleção local permanece ao filtrar ou paginar. Adicionar uma unidade não abre o detalhe; erros de seleção não ocultam a lista.
- Etapas físicas derivadas das quantidades existentes, incluindo cancelamentos, reservas e pacotes. Itens distribuídos aparecem como “Etapas diferentes”, com discriminação das quantidades. Pagamento/QC não implicam chegada ao armazém. Custos mantêm a projeção financeira existente, inclusive valores desconhecidos/parciais.
- Filtros abrem em modal no desktop e sheet inferior abaixo de 1200px, com Escape, backdrop, contenção e retorno de foco. Temas claro/escuro e nove larguras verificados.
- Clique no produto abre o detalhe inline do item correto. “Compra de origem” permanece um link separado, com a identidade do item de origem. O custo oculto na linha compacta mobile continua acessível no detalhe.

## Referência e diferenças por fase

Leitura real do Penpot `64ee36db-f4d2-8047-8008-dbff2f7d7205`, revisão atual **133**. Frames: fechado `a1bbb7fd-3432-8020-8008-dc1025ad5d01`, painel `a1bbb7fd-3432-8020-8008-dc0414fc70a0`, M01 `a1bbb7fd-3432-8020-8008-dc06d1144484`, filtros M02 `a1bbb7fd-3432-8020-8008-dc06d64b2cf2`.

Em 1500px, a tabela real ocupa 1192px, começando em x=280. A verificação de encaixe do slot de painel reduz a tabela a 800px e devolve 1192px ao fechar; esse teste altera apenas o estado de apresentação do container e **não representa integração funcional do novo painel**.

O detalhe inline existente permanece até a F3 (04B). A confirmação atual de preparação e o campo numérico de quantidade permanecem até a F4; o importador QC global pertence à F5. As demais ações legadas e seus surfaces ainda não foram convertidos (F6). Somente o novo fluxo de filtros é declarado verificado como sheet nesta entrega. Não se declara toda a aplicação livre de drawers laterais.

Tabs desktop: Todos / No armazém / Disponíveis. Mobile: Todos / Disponíveis / A caminho. Ao redimensionar, a tab ativa continua visível. A fonte local e os tokens da F1 permanecem; tema escuro usa as convenções existentes, pois o freeze fornecido é claro.

**Proveniência:** a revisão 133 usa os IDs do manifesto e o rótulo histórico foi confirmado na F0. A API não comprovou igualdade com o snapshot manual congelado. Nenhum restore ou alteração do Penpot foi executado. A autorização para avançar não foi registrada como prova dessa igualdade.

## Evidências e reprodução

Prévia local: **http://localhost:3142/orders**. Login sintético: `pessoa-a@loti.test`, senha `Loti-Orders-QA-Only-2026!`.

O servidor usa exclusivamente `file:./data/orders-transition-freeze-phase2-20261028.sqlite`, cópia consistente da fixture sintética validada `orders-transition-stage5-20261028-ui-refinements.sqlite`. A origem permanece intacta. Somente na cópia, os serviços existentes criam uma compra finalizada com 25 produtos QA e confirmam uma unidade recebida do produto 24. Com os dois itens originais, são 27 linhas: duas páginas de 20 e 7. O marcador da fixture evita duplicação ao reiniciar. Credenciais e integrações externas ficam desabilitadas pelo ambiente QA.

```powershell
node --conditions=react-server --import tsx scripts/qa-orders-list.ts
```

Evidências em `artifacts/qa/orders-freeze-phase2/` (arquivos locais de QA):

- [Desktop 1500](../../../artifacts/qa/orders-freeze-phase2/list-desktop-1500.png)
- [Mobile claro 390](../../../artifacts/qa/orders-freeze-phase2/list-light-390.png)
- [Desktop escuro 1500](../../../artifacts/qa/orders-freeze-phase2/list-dark-1500.png)
- [Filtros mobile](../../../artifacts/qa/orders-freeze-phase2/filters-mobile-390.png)
- [Vazio](../../../artifacts/qa/orders-freeze-phase2/list-empty-1500.png) e [erro](../../../artifacts/qa/orders-freeze-phase2/list-error-1500.png)

Também há capturas claras/escuras em 320, 360, 390, 430, 768, 1024, 1280, 1500 e 1920px. Inspecionadas visualmente as capturas finais mobile clara e desktop escura.

## Validação

| Verificação | Resultado / evidência |
| --- | --- |
| Chromium na aplicação real | **14 cenários passaram**, `browser-complete.log` |
| Vitest direcionado, arquivos executados isoladamente | **82 testes passaram**: 24 unitários, 2 warehouse, 47 QC, 1 consulta de listagem e 8 logística |
| Consulta com serviços/SQL reais | Paginação sem repetição, busca, interseção de filtros, reserva, isolamento de workspace, autorização e `view` inválida cobertos |
| Lint / TypeScript / build | Passaram; `lint-final.log`, `typecheck-final.log`, `build-complete.log` |
| Lint visual | Zero ocorrências nos três arquivos inspecionados, `design-lint.log` |
| Diff | `git diff --check` passou; apenas avisos de conversão LF/CRLF |
| Metadados gerados | `next-env.d.ts`, `tsconfig.json` e `tsconfig.orders-transition.json` restaurados byte a byte ao início da F2 |

O comando Vitest combinado terminou com falha nativa Windows `0xC0000005`, sem relatório. Os arquivos foram depois executados isoladamente e passaram. **Não se declara suíte global verde**. Tentativas iniciais do navegador falharam em seletores e no limite legítimo de logins repetidos; os testes usam agora um login compartilhado entre contextos novos, sem desativar o limite. O relatório final de 14 cenários é o da versão final compilada.

## Arquivos da F2

- `src/components/orders/orders-catalog.tsx`, `orders-catalog.css`, `orders-filter-surface.tsx`, `orders-list-state.ts`: composição e estados da listagem/filtros.
- `src/components/orders/orders-screen.tsx`: integração com os fluxos existentes. `orders-workspace.tsx`: exportação do hook responsivo para reutilização.
- `src/app/(app)/orders/page.tsx`, `src/app/(app)/orders/[orderId]/page.tsx`: estado `view` e retorno seguro.
- `src/lib/domain/warehouse-query.ts`, `warehouse-services.ts`: busca e filtro opcionais, mantendo fronteiras de autorização existentes.
- `scripts/qa-orders-list.ts`, `playwright.orders-list.config.ts`, `tests/orders-list/list.spec.ts`, `tests/integration/orders-list-query.test.ts`: fixture e verificações.
- `docs/DESIGN.md`, este relatório e registro de aprovação: decisões e evidências.

Mudanças da F1 continuam sem commit e não são contabilizadas como implementação nova da F2. `reset-password.sh` preexistente preservado. Não houve agentes auxiliares, migration de ambiente, dados reais, publicação ou operação de produção.

## Aceite

| Critério | Status |
| --- | --- |
| Cinco colunas, marcadores funcionais e composição mobile | OK |
| Busca, tabs, filtros cumulativos, URL e paginação reais | OK |
| Quantidades/etapas mistas, custos e seleção preservados | OK |
| Carregamento, vazio, erro e recuperação | OK |
| Largura integral fechada, encaixe do slot e ausência de overflow | OK |
| Sheet de filtros, foco, teclado e temas | OK |
| Painel de detalhe único 04B conectado | PENDENTE — F3 |
| Preparação 04A e stepper finais | PENDENTE — F4 |
| Aprovação humana da F2 | PENDENTE |

Gabriel aprova a Fase 2 entregue para iniciar a Fase 3, com os limites e evidências acima?

**AGUARDANDO APROVAÇÃO DE GABRIEL PARA INICIAR A FASE 3.**
