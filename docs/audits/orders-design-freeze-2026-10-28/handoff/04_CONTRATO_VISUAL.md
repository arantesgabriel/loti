# Contrato de interface / Penpot congelado

Este documento ajuda a localizar componentes e comportamentos. **O frame Penpot é superior a qualquer medida resumida aqui**: se houver conflito ou valores não registrados, inspecione propriedades reais na versão congelada e solicite esclarecimento em vez de inventar estilo.

## Identidade

- Tema: claro, superfícies limpas e discretas, sem profundidade/cardismo excessivo.
- Família dominante observada: **Inter Tight**.
- Texto principal observado: `#17202D`; secundário `#687385`; muted `#9AA3AF`.
- Acento laranja observado: `#E86C2C`; texto laranja escuro `#B94D18`.
- Status observado: verde `#157C4A` (recebido), azul `#3467A2` (a caminho).
- Fundo da identidade original: `#F9FAFB` com áreas brancas. Verificar preenchimentos concretos no Penpot por elemento antes de fixar token global.
- Título desktop de Pedidos cerca de **29px**, produto cerca de **14px**, metadata cerca de **11px**, cabeçalho cerca de **12px**. Esses números são extraídos de frames de referência, não licença para criar `font-size` global.
- Copiar espaçamento, raios, bordas, grid, ícones e peso tipográfico dos elementos efetivos. SVG/icon pack existente é preferível a caracteres Unicode de protótipo quando visualmente equivalente.

## Desktop — 1500×930 de referência

| Estado | Frame Penpot | Regra essencial |
| --- | --- | --- |
| **04A / preparação recolhida** | `a1bbb7fd-3432-8020-8008-dc1025ad5d01` | Lista **full-width** na área de conteúdo; toolbar expandida; CTA “Preparar pacote” |
| **04A / preparação aberta** | `a1bbb7fd-3432-8020-8008-dc0414fc70a0` | Tabela à esquerda + painel de preparação à direita, alinhado ao topo |
| **04B / detalhe JBL** | `a1bbb7fd-3432-8020-8008-dc043cdce618` | Mesmo contexto da tabela, painel de **um único item** |
| **Todos full-width** | `a1bbb7fd-3432-8020-8008-dc1025ad5d01` | 6 linhas ilustrativas |
| **No armazém full-width** | `5ca59f9e-acdb-805d-8008-dc6866fe5212` | 5 linhas ilustrativas, sem paginação fantasma |
| **Disponíveis full-width** | `5ca59f9e-acdb-805d-8008-dc686749155b` | 3 linhas ilustrativas, sem paginação fantasma |
| **04B / Anker** | `a1bbb7fd-3432-8020-8008-dc0d2b624202` | Detalhe com indisponibilidade / sem fotos |
| **04B / Baseus** | `a1bbb7fd-3432-8020-8008-dc0d2d28483a` | Detalhe de 1 disponível |
| **04B / UGREEN** | `a1bbb7fd-3432-8020-8008-dc0d2c8b2c2d` | Recebido, 0 disponíveis |
| **04B / Fender** | `a1bbb7fd-3432-8020-8008-dc0d2dadf4ce` | Recebido, 0 disponíveis |
| **04B / D’Addario** | `a1bbb7fd-3432-8020-8008-dc0d2ed9a286` | Recebido, 1 disponível |

Medições **de referência do frame**:

- Canvas `1500×930`; sidebar com aproximadamente `256px` e conteúdo iniciando em `x=280`.
- **Sem drawer**: tabela, cabeçalho, linhas e divisórias começam em `x=280` e chegam aproximadamente a `x=1472`, largura **1192px**. Posições de colunas no frame full-width: Produto `x≈298`, Etapa `x≈790`, Unidades `x≈1030`, Custo `x≈1202`, Ação `x≈1362`.
- **Com drawer**: tabela inicia em `x=280` e tem aproximadamente **800px**; coluna Produto `x≈298`, Etapa `x≈610`, Unidades `x≈758`, Custo `x≈886`, Ação `x≈1005`. Drawer começa cerca de `x=1110` e ocupa aproximadamente **390px** da direita.
- As dimensões são **referência de composição**, não valores a hardcodar independente do viewport. Implementação deve distribuir largura via grid/flex sem horizontal scrollbar ou lacuna permanente.
- Ao fechar drawer, largura e colunas devem recompor **imediatamente**, sem `width: calc(100% - drawerWidth)` residual. O mesmo vale para topo, busca, selects, contagens, paginação e QC icon.

## Elementos da listagem

1. Cabeçalho enxuto: título **Pedidos** e subtítulo curto.
2. Toolbar compacta: **Buscar produto ou pedido**, **Etapa**, botão **Filtros** e no topo **ícone de foto com `+`** (QC JSON). Estado 04A fechado também mostra acesso explícito à preparação.
3. Tabs com indicador claro: **Todos**, **No armazém**, **Disponíveis**. Não criar tabelas isoladas por filtro — um componente alimentado pela mesma fonte real.
4. Colunas: **Produto** (miniatura, nome forte, variação discreta), **Etapa** (status semântico), **Unidades** (disponibilidade), **Custo** (valor até armazém) e **Ação**. Metadados adicionais ficam em detalhe contextual, não esmagam a tabela.
5. Linha toda/nome/thumbnail abre o detalhe do **itemId**, jamais um agrupamento de compra inteiro. Ação contextual de adicionar/selecionar pacote deve ser separada da ação de abrir detalhe (cuidado com bubbling).
6. Paginação real deve vir do dataset/contrato existente. O “‹ 1 2 3 ›” no frame Todos é ilustrativo no protótipo: **não manter botões mudos**. Ao filtrar, exibir contagem coerente e paginação apenas quando necessária.

## Painel 04A — preparação

- Contextual, direito, título “Preparar pacote”, lista de produtos escolhidos, miniatura, nome, variação, stepper `− n +`, ação **Remover**, resumo de unidades e CTA **Montar pacote**.
- Seleção se mantém ao abrir, fechar, consultar detalhe e voltar; respeitar as regras de aplicação existentes.
- Disponibilidade real limita stepper; criar estados disabled e feedback para mudanças simultâneas de estoque/vínculos.
- Não confundir “3 unidades” (selecionadas) com “2 produtos” (linhas/distintos).

## Painel 04B — detalhes do item

- Identificação do item, variação, status, disponibilidade, quantidades relevantes, custo até armazém, fotos QC (galeria), ações do item, origem como link resumido.
- Mostrar **uma vez** cada informação importante; nenhuma repetição de custos/quantidades em múltiplos accordions. A compra de origem pode ser consultada, mas não substitui o item aberto.
- Ações de **Editar item**, **Registrar reembolso**, **Ajustar seleção**, **Ver fotos** e **Compra de origem** devem usar lógica existente e contexto correto.

## Mobile — 390×844 de referência

| Estado | Frame Penpot | Observação |
| --- | --- | --- |
| Lista principal | `a1bbb7fd-3432-8020-8008-dc06d1144484` | M01, compacta, navegação inferior contextual |
| Filtros | `a1bbb7fd-3432-8020-8008-dc06d64b2cf2` | M02, bottom sheet |
| Preparação | `a1bbb7fd-3432-8020-8008-dc06d69dc9f7` | M03, bottom sheet |
| Quantidade | `a1bbb7fd-3432-8020-8008-dc06d6e9639a` | M04, stepper com limites |
| Importar QC | `a1bbb7fd-3432-8020-8008-dc06d73aaecd` | M05, importação iniciada por ícone foto+ |
| Revisar pacote | `a1bbb7fd-3432-8020-8008-dc06d78ee689` | M06 |
| Detalhe JBL | `a1bbb7fd-3432-8020-8008-dc086358ee0a` | M07, **bottom sheet inferior** |
| Fotos QC | `a1bbb7fd-3432-8020-8008-dc086547896c` | M08 |
| Ações do item | `a1bbb7fd-3432-8020-8008-dc08652ad98a` | M09 |
| Editar item | `a1bbb7fd-3432-8020-8008-dc086564f6ad` | M10 |
| Reembolso | `a1bbb7fd-3432-8020-8008-dc0865820d1d` | M11 |
| Anker | `a1bbb7fd-3432-8020-8008-dc09daadba75` | M12, detalhe sem QC |
| Baseus | `a1bbb7fd-3432-8020-8008-dc09db842368` | M13 |
| D’Addario | `a1bbb7fd-3432-8020-8008-dc09dc03b0c0` | M14 |
| Disponíveis | `a1bbb7fd-3432-8020-8008-dc0ac2aff7b8` | M16 |
| A caminho | `a1bbb7fd-3432-8020-8008-dc0ac4f85156` | M17 |
| UGREEN | `a1bbb7fd-3432-8020-8008-dc10663cb087` | M33 |
| Fender | `a1bbb7fd-3432-8020-8008-dc10670f2557` | M34 |

**Proibição:** nenhum drawer lateral em 320px, 360px, 390px, 430px ou tablet/mobile. Para sobreposições usar `bottom: 0`, largura disponível, `max-height` apropriado, safe-area inferior, backdrop, `overflow-y: auto` dentro da sheet, fechamento previsível. Evitar painel fora do viewport horizontal e scroll duplo. Teclado virtual não pode esconder botão essencial.

## Exemplo de dados do protótipo (NÃO fixtures de produção)

Os seis itens ilustrativos da tabela são Anker USB-C Cable, UGREEN Nexode 65W, Baseus Blade Power Bank, JBL Flip 6, Fender 351 Premium Picks e D’Addario EXL110. Quantidades de exemplo disponíveis: **0, 0, 1, 2, 0, 1**. Todos os valores monetários e imagens exemplificam o estado visual; **a implementação recebe dados reais das APIs atuais**.

## Regra de precedência

1. Penpot congelado = **aparência, composição e interação esperada**.
2. Código/regras atualmente vigentes = **entidades, dados, cálculo, associação QC, permissão e segurança**.
3. Estes documentos = **guia de navegação e aceite**.

Se a referência visual simplifica dados obrigatórios, preserve a integridade e solicite decisão sobre apresentação, sem descartar dados por conveniência estética.
