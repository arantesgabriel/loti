# Matriz de fluxos e estados — Pedidos 04A/04B

O Penpot contém estados de protótipo navegáveis. **No código, eles devem se tornar um conjunto coerente de componentes + estado real, não dezenas de páginas duplicadas.** Use os frames para reproduzir aparência, transições e feedback; vincule ações às APIs/rotas existentes.

## Máquina de estados recomendada da UI (não do domínio)

| Estado de painel | Desktop | Mobile | Dados preservados |
| --- | --- | --- | --- |
| `closed` | Tabela full-width, toolbar expandida | Lista ocupando a viewport | Busca, filtro, paginação, seleção |
| `prepare` | Drawer direito de preparação, tabela reduzida | **Bottom sheet** de preparação | Seleção com contadores e stepper |
| `item-detail(itemId)` | Drawer direito de detalhe, tabela reduzida | **Bottom sheet** de detalhe do item | ItemId, QC, seleção prévia |
| `filters` | Popover/dialog coerente com Penpot | **Bottom sheet** de filtros | Valores aplicados/temporários |
| `qc-import` | Modal de importação com preview | **Bottom sheet** ou fluxo vertical previsto | Arquivo, validação, preview |
| `qc-gallery` | Overlay de imagem/gallery | Overlay/mobile flow previsto, jamais drawer lateral | Foto atual e itemId |
| `edit` / `refund` / `origin` | Modal/overlay contextual | Bottom sheet ou tela full-screen vertical prevista | ItemId, permissões, volta correta |

**Regra:** no desktop a área da tabela é flexível; `closed` ocupa a largura total. Estados `prepare` e `item-detail` são mutuamente exclusivos na área direita, mas a seleção em memória deve permanecer ao alternar. No mobile qualquer estado transitório do tipo painel deve entrar/fechar verticalmente a partir do **rodapé**.

## Fluxos desktop essenciais

| Ação do usuário | Estado/destino esperado | Referência Penpot | Fase de implementação |
| --- | --- | --- | --- |
| Entrar em Pedidos | Lista `Todos` com drawer fechado ou estado inicial coerente | `04A · Estado / preparação recolhida` | 2 |
| Clicar “Preparar pacote” | `prepare`, tabela recolhe e drawer abre | `04A · WORKSPACE / PREPARAÇÃO` | 4 |
| Fechar preparação | `closed`, **tabela reocupa 100%** do conteúdo | `04A · Estado / preparação recolhida` | 2/4 |
| Tabs Todos / No armazém / Disponíveis sem drawer | Filtra dados; permanece full-width | `04A · Tabela completa / No armazém` e `/ Disponíveis` | 2 |
| Buscar / Etapa / Filtros | Entrada compacta, estado aplicado/limpo, atualização dos resultados | `INTERAÇÃO · Buscar pedidos`; `INTERAÇÃO · Escolher etapa`; `INTERAÇÃO · Filtros avançados` | 2 |
| Clicar no nome/foto/linha de um produto | `item-detail(itemId)` único, sem navegação para compra inteira | `04B · WORKSPACE / DETALHE DO ITEM` e seis variações | 3 |
| Fechar detalhe / voltar para seleção | Reabre preparação quando aplicável ou retorna à lista mantendo contexto | 04B / 04A | 3/4 |
| Abrir foto/galeria QC | Galeria do **item atual**, navegação entre fotos | `INTERAÇÃO · Galeria QC`, `QC / segunda foto` | 3 |
| Editar / reembolsar | Formulário do item contextual e confirmação | `INTERAÇÃO · Editar item`, `Registrar reembolso`, `Motivo do reembolso` | 6 |
| Compra de origem | Resumo/ligações da compra sem substituir detalhe | `INTERAÇÃO · Compra de origem` | 6 |
| Foto com `+` no topo | Importação global de QC JSON, preview, confirmação | `INTERAÇÃO · Importação de QC / JSON`, `QC / JSON validado`, `QC / concluído` | 5 |
| Stepper quantidade | Atualiza item/total; respeita min e max | `INTERAÇÃO · Selecionar unidades`, variantes 04A | 4 |
| Remover item | Quantidade zero e recomputação de resumo | Estados `somente JBL`, `somente Baseus`, `somente D’Addario` | 4 |
| Montar pacote | Revisão, confirmação e feedback de conclusão | `INTERAÇÃO · Revisar pacote`, `INTERAÇÃO · Pacote preparado` | 4 |

### Frame IDs críticos desktop

```text
04A open/prepare    a1bbb7fd-3432-8020-8008-dc0414fc70a0
04A closed/full     a1bbb7fd-3432-8020-8008-dc1025ad5d01
04A warehouse/full  5ca59f9e-acdb-805d-8008-dc6866fe5212
04A available/full  5ca59f9e-acdb-805d-8008-dc686749155b
04B JBL             a1bbb7fd-3432-8020-8008-dc043cdce618
QC import           a1bbb7fd-3432-8020-8008-dc0d983244ec
QC preview          a1bbb7fd-3432-8020-8008-dc0d99f849de
QC gallery          a1bbb7fd-3432-8020-8008-dc0de566dfcd
Edit item           a1bbb7fd-3432-8020-8008-dc0de671e55e
Refund              a1bbb7fd-3432-8020-8008-dc0de90b4c2d
Advanced filters    a1bbb7fd-3432-8020-8008-dc0dc74518cb
Review package      a1bbb7fd-3432-8020-8008-dc0db047241b
```

## Fluxos mobile essenciais

| De → ação | Para (frame de referência) | Comportamento |
| --- | --- | --- |
| M01 Lista → pesquisar | **M15** Busca por produto | Busca contextual, volta à mesma lista |
| M01 Lista → filtros | **M02** Filtros; **M23** opções | Sheet inferior, campos alinhados |
| M01 Lista → tab Disponíveis | **M16** Disponíveis | Conjunto correto de produtos |
| M01 Lista → tab A caminho | **M17** A caminho | Conjunto correto de produtos |
| M01 Lista → ícone foto+ | **M05** Importar QC; **M21** QC importado | Upload/preview/resultado |
| M01 Lista → preparar | **M03** Preparar pacote | Sheet inferior, não lateral |
| M03 → editar quantidade | **M04**, **M18**, **M26**, variantes M41–M55 | `− n +`, limite por produto |
| M03 → revisar | **M06**, M42/M43/M45/M47/M50/M51/M56–M59 | Sumário correto dos itens e quantidades |
| M06 → confirmar | **M22** Pacote montado | Resultado real do backend |
| M01/M16/M17/M32 → item | **M07** JBL, **M12** Anker, **M13** Baseus, **M14** D’Addario, **M33** UGREEN, **M34** Fender | Detalhe inferior do item específico |
| M07/M13/M14 → fotos | **M08**, **M25** | Galeria de fotos QC e navegação |
| Detalhe → ações | **M09**, **M27**–**M29**, **M35**–**M36** | Sheet de ações contextual por item |
| Detalhe → editar | **M10** | Edição no contexto do item |
| Detalhe → reembolso | **M11**, **M24** | Confirmações e motivo conforme domínio |
| Detalhe → compra origem | **M20** | Resumo contextual, sem trocar contexto principal |
| Busca/filtros/ações → fechar | Retornar ao estado anterior | Preservar scroll/filtros e foco |

**Alerta visual de QA:** algumas telas mobile são montagens de estado com todo o fundo da lista mais a sheet. A implementação deve usar **uma lista real abaixo de uma sheet que entra por baixo**, não copiar o frame inteiro como uma nova rota com layout lateral.

## Cobertura mínima de itens/dados no protótipo

| Item exemplo | Disponíveis ilustrativas | Fluxo relevante |
| --- | ---: | --- |
| Anker USB-C Cable | 0 | Sem seleção, sem fotos QC |
| UGREEN Nexode 65W | 0 | Recebido mas indisponível |
| Baseus Blade Power Bank | 1 | Seleção 0→1 e + desabilitado em 1 |
| JBL Flip 6 | 2 | Seleção 0→1→2, −/+, fotos QC e detalhe |
| Fender 351 Premium Picks | 0 | Recebido, indisponível |
| D’Addario EXL110 | 1 | Adicionar/remover e composição de pacote |

> Esses valores e produtos são **dados de demonstração**. Em produção, deve haver equivalência de estados conforme dados reais, sem dependência de nomes fixos.

## Casos que não podem regredir

- Fechar drawer desktop **expande** tabela e demais controles do grid; abrir novamente **contrai**.
- Alternar item selecionado abre o item certo, não reaproveita custo/QC anterior.
- Mobile **nunca** gera painel lateral: testar todas as ações dos M01–M59, inclusive filtros e formulários.
- Seleção não se perde ao consultar item, fotos, filtros ou voltar.
- Click target/teclado em ícone, nome, miniatura e linha não dispara simultaneamente duas ações.
- Nenhum botão de paginação ou menu meramente decorativo em implementação. O protótipo Penpot tem estados ilustrativos; conectar à lógica verdadeira.
