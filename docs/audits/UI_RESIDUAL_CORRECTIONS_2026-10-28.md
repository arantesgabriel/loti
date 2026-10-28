# Correções residuais de Pedidos e Pacotes

Data: 28/10/2026. Implementação e validação locais. Nenhuma publicação, migration remota ou alteração de dados reais. A homologação humana permanece pendente.

## Resultado

Pedidos agora usa tabela semântica no desktop, com cabeçalhos de quantidades associados, seleção e expansão contextual. Em 1440×900, com os mesmos 20 itens sintéticos, passaram a caber **cinco itens completos**, contra dois anteriormente: **2,5 vezes mais itens**. As linhas passaram de 237 para 109 px, mantendo texto principal de 13 px e controles de 44 px.

Compradas, recebidas, disponíveis e vinculadas ficam alinhadas. O vínculo inclui reservas em montagem e unidades em pacotes fechados/enviados/recebidos, portanto a coluna se chama **Vinculadas**. A expansão discrimina estado, quantidade e destino de cada pacote, cancelamentos, participantes e componentes financeiros. Recebidas é uma contagem acumulada, que inclui as vinculadas; não é estoque adicional.

Pagamento e fotos QC possuem indicadores separados. Ausência de fotos aparece como `Sem fotos QC`, sem inferir aprovação, pendência de inspeção ou chegada. Havendo fotos, o botão abre a galeria existente. Nenhuma foto, capa ou preview foi acrescentado à listagem.

`Encerrar custos` passa a ação secundária, conservando comando e condições do servidor. `Fechar conteúdo`, despacho e recebimento mantêm sua ênfase contextual e seus gates.

## Base reutilizada

| Fonte ou arquivo | Aplicação |
| --- | --- |
| `docs/06_DESIGN.md`, `docs/07_PRODUCT_VISUALS.md`, `src/app/theme.css` | Identidade, fonte Geist, temas, marcadores e tokens existentes |
| `docs/design/PACKAGES_AND_COSTS_REFERENCES.md` | As mesmas referências A/B/C/D da primeira refatoração: alinhamento financeiro, logística, formulários e mobile |
| `docs/22_PACKAGES_AND_COSTS_UX_REFACTOR_PLAN.md` | Resumo, descoberta, detalhamento e edição contextual |
| `src/components/orders/orders-screen.tsx`, `orders.css` | Tela de Pedidos existente, filtros, chegada e reservas preservados |
| `src/components/orders/logistics-package-detail.tsx` | Seções e ações do pacote existente |
| `Button`, `PackageSurface`, `QcGalleryButton`, `ProductCategoryMarker`, `formatMoney`, `costRequest` | Componentes e funções existentes, sem um novo sistema de UI ou financeiro |
| `tests/orders-transition/` e cenários isolados existentes | Regressões reais e fixtures sintéticas |

Skills aplicadas: antiwebslop já disponível localmente, [UI Craft Loop](https://github.com/brunobertolini/skills/blob/develop/skills/ui-craft-loop/SKILL.md) e [Biblioteca de Motion](https://github.com/apenasdouglas/ai-motion-library). Os textos consultados das duas últimas estão em `planning/refactor-skills/`. Movimento utilizado: **Surgir / fade in**, 180 ms no detalhamento, removido para movimento reduzido. Não foi acrescentada dependência de animação. Contrato e decisões em `docs/DESIGN.md`.

## Matriz do relatório recebido

| ID | Resultado desta rodada |
| --- | --- |
| UI-001 | Tabela desktop implementada; densidade medida com os mesmos 20 itens e viewport: 2 → 5 itens completos |
| UI-002 | Aplicação combinada e limpeza de filtros, estado de rascunho e preservação da seleção passaram no navegador |
| UI-003 | Quatro colunas de quantidades; expansão com quantidade por destino; limite da seleção e rejeição de revisão obsoleta verificados |
| UI-004 | URL contextual, foco no produto e retorno com filtros verificados no navegador |
| UI-005 | Testes de contagem compartilhada de lista/detalhe, retirada e etapas logísticas passaram; contagem do pacote conferida durante o fluxo |
| UI-006 | Apenas Fechar conteúdo é primário em montagem; Encerrar custos é secundário. Pagamentos, fechamento, despacho e recebimento continuaram funcionando |
| UI-007 | Dois produtos, participantes, centavos 0,01/0,00 e rateios de encargos verificados no navegador; integração financeira aprovada |
| UI-008 | Drawer contextual, foco, Escape, rejeição local e HTTP 409 de chegada incompatível com reserva; armazém e custos idênticos após rejeição |
| UI-009 | Indicadores separados; estado sem fotos e abertura real da galeria testados; nenhuma imagem na linha operacional |
| UI-010 | Mensagens e ações vazias por etapa, inclusive presença/ausência de pacotes em montagem, verificadas |
| UI-011 | Vocabulário e valores individuais/compartilhados conferidos no navegador e cálculo coberto por integração |
| UI-012 | 48 capturas: quatro telas × dois temas × 320/390/768/1024/1440/1920 px; teclado, foco, loading, erro/retry, seleção, alvos de toque e movimento reduzido verificados |
| QC-01 | HTTP 500 histórico **não reproduzido**. Consultas atuais sem fotos e com fotos retornaram 200; galeria abriu e armazém/custos ficaram idênticos. Causa histórica continua indeterminada; nenhuma correção especulativa de domínio foi aplicada |

## Medição reproduzível

O teste `density-qa.spec.ts` replica alternadamente os dois itens reais da fixture de fluxo novo para formar 20 linhas de apresentação, com nomes/IDs sintéticos distintos. O payload completo permanece idêntico antes/depois. As réplicas interceptam somente a leitura GET do navegador; nunca são enviadas a comandos de reserva ou chegada.

| Medida | Antes | Depois |
| --- | ---: | ---: |
| Viewport | 1440×900 | 1440×900 |
| Linhas no payload | 20 | 20 |
| Altura da linha | 237 px | 109 px |
| Topo da primeira linha | 277 px | 316 px (inclui cabeçalho da tabela) |
| Linhas integralmente dentro do viewport | 2 | 5 |

Evidências locais em `artifacts/qa/orders-transition/`:

- `density-before-1440.png`, `density-after-1440.png`;
- `density-before.json`, `density-after.json`, incluindo o payload usado na comparação;
- `residual-<tela>-<tema>-<largura>.png`, 48 capturas finais;
- `package-distribution-products-<tema>-390.png`, `package-distribution-charges-<tema>-390.png` e capturas `new-package-*` do fluxo financeiro;
- `qc-http-empty.json`, `qc-http-photos.json`: consultas por origem e estado HTTP, abertura da galeria e comparação do armazém;
- `orders-transition-audit-qc-01.sqlite.report.json`: comparação integral do legado.

A inspeção visual encontrou e corrigiu clipping das ações em 320 px e quebra de palavras nos rótulos de quantidade. A rodada final não apresentou overflow global. O layout mobile mantém os dados rotulados e a ilha de navegação existente; a meta quantitativa de densidade foi medida no desktop solicitado.

## Verificações

- `npm run typecheck` e `npm run lint`: passaram.
- Build isolado via `scripts/build-orders-transition.ts`: passou. Uma repetição no sandbox encontrou `EPERM` de criação de diretório; a execução local autorizada fora dessa restrição passou.
- Vitest: **90 testes distintos aprovados em oito arquivos**. Rodada de 68 casos em seis arquivos, seguida de 25 em três arquivos, com três casos de armazém repetidos. Cobertura: cálculos de armazém/custos, fluxo de armazém, finalização logística, financeiro legado, serviços QC, custos e refunds.
- Chromium: **sete execuções aprovadas** na rodada final: densidade, paginação, quantidades/teclado, QC vazio, matriz de refinamentos, fluxo financeiro/logístico completo e QC com fotos em banco legado separado.
- Migration explícita em legado sintético novo: preservação aprovada. Verificação: 51 tabelas, 58 triggers de ledger, sete tabelas/36 triggers logísticos, zero violações FK. Nenhuma migration nova foi criada para esta correção de UI.
- Comparador legado: `passed=true`, `failures=[]`; 41 compradas − 10 canceladas = 31 vigentes = 26 vinculadas + 5 livres de vínculo. Custo líquido 134623 centavos; saldo CNY 37034 e base histórica BRL 28868 preservados. Parcelas pessoais continuam sendo a construção sintética documentada no cenário, sem alegação de reprodução das parcelas reais observadas.
- `git diff --check`: passou. Antiwebslop não apontou erros; o aviso remanescente é a borda neutra preexistente que indica hierarquia no detalhamento do rateio legado. Os dois informes restantes se referem ao resumo de quantidades e ao título existente de Pacotes.

O Vitest inicialmente encontrou o erro conhecido de cache SSR temporário `ENOENT` no sandbox. A rodada efetiva passou com TEMP/TMP isolados e um worker. Essas falhas de infraestrutura não foram mascaradas por alterações de testes ou domínio.

## Ambiente para conferência

Servidor local desta entrega: `http://localhost:3139/orders`, com o legado sintético `data/orders-transition-audit-qc-01.sqlite`. Login: `pessoa-a@loti.test`; senha exclusivamente de QA: `Loti-Orders-QA-Only-2026!`.

```powershell
npm run dev:orders-transition -- --database file:./data/orders-transition-audit-qc-01.sqlite
```

O banco `data/orders-transition-audit-fixes-01.sqlite` foi alterado pelo fluxo automatizado de fechamento/pagamento/despacho/recebimento. Não é o estado inicial para repetir esse teste ou para comparar novamente a densidade usando a leitura original. Para repetir o roteiro completo, gere outro arquivo com nome novo pelo seed existente; não sobrescreva nem apague bancos anteriores.

As validações são de Chromium local e dados sintéticos. O antigo HTTP 500 permanece sem causa histórica confirmada. Aceite humano da extensão e autorização de produção não são inferidos dos testes.
