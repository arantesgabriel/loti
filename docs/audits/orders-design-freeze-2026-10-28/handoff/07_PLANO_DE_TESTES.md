# Plano de validação e critérios de aceite — Pedidos Loti

**Regra de evidência:** cada teste deve citar como reproduzir (rota, estado, dados de teste), resultado esperado/observado e arquivo de evidência se disponível. Resultados devem separar **passou**, **falhou**, **não executado** e **bloqueado**. Não marcar como verde só porque o elemento aparece corretamente no Penpot.

## 1. Portões de QA por fase

| Fase | Verificações indispensáveis |
| --- | --- |
| 0 | Inventário real, baseline de lint/typecheck/test/build, riscos e dependências; **nenhum código de produto alterado** |
| 1 | Tokens/local styles, shell e base de drawer/sheet; foco/fechamento; nenhum efeito nas demais páginas |
| 2 | Filtros, consulta, tabela sem painel ocupando toda largura; mobile sem overflow; paginação real |
| 3 | ItemId correto, dados/QC corretos, 04B e bottom sheet, retorno à lista sem perda de estado |
| 4 | Stepper limites, resumo/valores, seleção e montagem reais, concorrência, min/max, mobile |
| 5 | JSON global, preview, validações e associação QC existente; imagens/capa preservadas |
| 6 | Chegada, edição, reembolso, origem, permissão, modais/sheets e regressão financeira |
| 7 | Auditoria visual final, a11y, fluxo E2E completo e não regressão Pacotes/QC |

## 2. Grade de viewport e layouts

| Viewport de teste | Conferir |
| --- | --- |
| **320×700** | Nenhum controle cortado; sheet inferior com rolagem interna, safe-area |
| **360×800** | Texto, badges e stepper sem colisão; filtro e QC ícone alcançáveis |
| **390×844** | Comparação 1:1 com frames M01–M59 relevantes; **zero drawer lateral** |
| **430×932** | Elementos escalam sem gaps artificiais e sem aumentar demais a largura da sheet |
| **768×1024** | Breakpoint deliberado, sem UI desktop espremida nem painel lateral em modo mobile |
| **1024×768** | Tabela e toolbar não cortam; desenho de transição de layout sem lacuna |
| **1280×800** | Drawer desktop cabe e tabela restante é utilizável; se inviável, breakpoint apropriado |
| **1500×930** | Comparação visual com board Penpot; coluna full-width até `x≈1472` no estado fechado |
| **1920×1080** | Conteúdo cresce/limita de forma intencional; sem reservatório vazio de drawer fechado |

> Breakpoints finais devem seguir a implementação/Design System e o comportamento visual do Penpot; testar esses tamanhos é obrigatório, mas não força um breakpoint arbitrário.

## 3. Matriz funcional mínima (E2E/manual automatizável)

| ID | Cenário | Resultado de aceite |
| --- | --- | --- |
| **DESK-01** | Abrir Pedidos sem drawer | Tabela ocupa toda largura disponível, sem faixa vazia à direita |
| **DESK-02** | Abrir preparação 04A | Tabela contrai sem cortar status, valores ou botões; drawer não se sobrepõe |
| **DESK-03** | Fechar preparação | Tabela expande novamente no mesmo ciclo de UI, sem refresh |
| **DESK-04** | Abrir detalhe 04B do JBL | Dados pertencem só ao JBL, não à compra inteira; painel ajustado |
| **DESK-05** | Fechar detalhe/voltar | Estado de filtro, scroll e seleção anterior preservados |
| **LIST-01** | Tabs Todos / Armazém / Disponíveis | Conjuntos distintos corretos; contador correto; texto de filtro consistente |
| **LIST-02** | Busca por nome, variação, identificador suportado | Resultados e clear/reset coerentes; zero resultados bem tratado |
| **LIST-03** | Filtros avançados e etapa | Combinação, limpar, voltar e permissões; nenhum select desproporcional |
| **LIST-04** | Página 2/3, quando houver | Navegação verdadeira, resultados e foco, nunca botão mudo |
| **ITEM-01** | Clicar linha, título ou miniatura | Mesmo itemId, um único evento, sem redirecionamento para pedido maior |
| **ITEM-02** | Item sem QC | Estado vazio legível, sem foto quebrada ou botão falso |
| **ITEM-03** | Item com 3 fotos QC | Miniaturas corretas, gallery/zoom, retorno à mesma posição |
| **ITEM-04** | Alternar dois itens rapidamente | Sem foto, valor ou status vazado do item anterior |
| **QTY-01** | Quantidade inicial `0`, clicar `−` | Permanece 0; botão disabled; nenhuma requisição negativa |
| **QTY-02** | Disponibilidade `1`, clicar `+` em 0 e em 1 | Atinge 1; `+` desabilitado; não chega a 2 |
| **QTY-03** | Disponibilidade `2`, sequência `+ + + −` | Vai 0→1→2→2→1; totais corretos |
| **QTY-04** | Remover item da seleção | Volta a 0 e recalcula produtos/unidades sem desvincular pacote histórico |
| **QTY-05** | Saldo diminui após seleção / 2 sessões | Front reconcilia; servidor impede overbooking; erro recuperável |
| **PKG-01** | Montar pacote sem unidades | Ação indisponível com motivo acessível |
| **PKG-02** | Montar pacote com 2+ produtos | Revisão correta, uma confirmação, resultado e vínculo reais |
| **PKG-03** | Duplo clique/retry de montagem | Sem pacote/unidades duplicados |
| **QC-01** | Acionar ícone foto+ | Abre fluxo global; só ícone visível no topo; tooltip e aria-label |
| **QC-02** | JSON válido com vários itens | Prévia e atualização dos itens corretos, sem operação item a item |
| **QC-03** | JSON inválido / esquema errado | Erro claro, nada persistido indevidamente |
| **QC-04** | JSON com duplicados ou item ausente | Feedback granular; associações existentes não se corrompem |
| **QC-05** | Reimportar mesmo JSON | Não duplica fotos ou vínculos quando contrato prevê idempotência |
| **QC-06** | Item com capa manual | Capa preservada conforme regra atual; fotos novas visíveis |
| **ACTION-01** | Registrar chegada | Status/quantidades persistidos dentro das regras existentes |
| **ACTION-02** | Editar item | Salva o item correto com validação e feedback |
| **ACTION-03** | Reembolso | Respeita fórmula/saldo/moeda/permite cancelamento; não altera outro item |
| **ACTION-04** | Compra de origem | Mostra vínculo resumido sem perder contexto do item |
| **MOB-01** | Abrir qualquer detalhe no mobile | **Entra pela parte inferior**; nunca pela esquerda/direita |
| **MOB-02** | Abrir filtros, preparação, ações, refund, QC no mobile | Bottom sheet ou fluxo mobile vertical previsto, nunca drawer lateral |
| **MOB-03** | Bottom sheet grande + teclado virtual | Conteúdo rolável, CTA alcançável, safe-area e backdrop corretos |
| **MOB-04** | Fechar sheet (X, voltar, ESC/back quando houver) | Volta à mesma lista/filtro/scroll sem “tela preta” ou overlay órfão |
| **MOB-05** | Stepper na sheet | Alvos tocáveis e min/max corretos; feedback e totais sincronizados |

## 4. Visual QA granular

- **Grid/alinhamento:** setas de select centradas; títulos e valores em linhas base; cada coluna com alinhamento consistente; ícone foto+ no topo; CTA e contadores não flutuam aleatoriamente.
- **Densidade:** tabela sem espaço em branco artificial, títulos de produto dominam metadata; badges legíveis; valores corretos e não duplicados em 04B.
- **Estados da tela:** `closed`, `prepare`, `item-detail`, busca/sem resultado, tabs filtradas, QC empty/3 fotos, pacote vazio/parcial/cheio.
- **Overflow:** textos longos/nomes/variações, moeda com milhar, 200% de zoom, viewport estreita, rolagem vertical, safe-area, dinâmica de teclado.
- **Cor/contraste:** acento laranja controlado, disabled distinguível de disponível, status não comunicado apenas por cor, foco visível.
- **Acessibilidade:** tab order, trap de foco em modal, retorno do foco no fechamento, ESC, roles/labels, aria-expanded para estados, stepper com rótulo de item e valor, ícone QC com aria-label, não disparar clique duplo em nested handlers.
- **Animação:** mudança de largura não gera salto visual desnecessário; no mobile a transição do painel é **vertical**; respeitar `prefers-reduced-motion`.
- **QC:** thumbnail/capa e galeria iguais ao mecanismo atual; upload e import não reusam URLs expiradas ou mostram fotos de outro comprador.

## 5. Regressão além de Pedidos

1. Tela de **Pacotes** anterior permanece operacional; itens montados a partir de Pedidos aparecem corretamente nas associações já existentes.
2. Fluxo original de QC fora desta tela continua funcionando, inclusive seleção de capa e ampliação.
3. Custos, totalizações, reembolsos, taxas e moedas históricos não mudam só por causa da refatoração de UI.
4. Permissões e separação de contas/compradores permanecem intactas.
5. Nenhuma alteração inadvertida de filtros de outras telas, sidebar, tema, rotas ou componentes globais.

## 6. Critério do fechamento (Fase 7)

**Aprovável** somente com: bugs críticos/altos resolvidos; testes existentes aprovados (ou falhas preexistentes documentadas); cenário E2E completo demonstrado; comparação real com o Penpot congelado; estados desktop full-width e drawer abertos; bottom sheets mobile sem qualquer entrada lateral; QC associando itens corretamente; stepper limite e servidor íntegros; relatório claro de mudanças/rollback. Mesmo assim, o **merge/deploy requer autorização separada**.
