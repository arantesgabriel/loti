# Loti: contrato visual operacional

## 1. Produto
Grupo privado que organiza favoritos, compras e envio coletivo. Pedidos deve permitir comparar quantidades e escolher somente unidades livres. Documentação canônica: `06_DESIGN.md`, `07_PRODUCT_VISUALS.md` e plano 39. Este resumo não substitui essas fontes.

## 2. Design Read
Pedidos é uma superfície de operação para o pequeno grupo, com linguagem neutra e quente, fonte Geist, números alinhados e detalhes progressivos. Next.js e componentes existentes. V2, M2, D8.

| Decisão | Intenção |
| --- | --- |
| Superfície | Pedidos e detalhe de Pacotes |
| Trabalho principal | Comparar unidades e reservar somente a disponibilidade |
| Direção | Tabela desktop; quantidades rotuladas no mobile; movimento discreto |
| Sistema | Tokens de `src/app/theme.css`, Button, PackageSurface e galeria QC |
| Evidência | Referências A/B/C/D da primeira refatoração e relatório residual de 28/10/2026 |

## 3. Direção e limites
Divisores e colunas substituem caixas repetidas. Laranja indica seleção ou próxima ação. Quantidades recebidas são acumuladas; não somar novamente as vinculadas como estoque adicional. Fotos não comprovam chegada ou aprovação. Preservar navegação e temas.

## 4. Tokens
O código de `src/app/theme.css` permanece a fonte de verdade dos dois temas.

```design-tokens
fonts: Geist
colors: #faf8f5, #ffffff, #f5f2ee, #221d21, #625b60, #f77014, #1c0113, #e9e4df
radii: 0, 6px, 8px, 10px, 12px, 16px, 999px
```

## 5. Tipografia
Fonte Geist existente. Texto operacional de 13 px, metadados e cabeçalhos de 11–12 px; inputs mobile de 16 px. Quantidades e dinheiro com `tabular-nums`.

## 6. Espaçamento e layout
Escala existente de 4/8/12/16/24 px. Em largura insuficiente, a tabela assume linhas com quatro contagens rotuladas; não esconder dados nem criar rolagem global. Controles preservam altura mínima de 44 px.

## 7. Componentes
Reutilizar Button, Surface, ProductCategoryMarker e QcGalleryButton. Detalhes abrem na própria linha; chegada usa drawer existente. Encerrar custos é secundário às tarefas logísticas, sem mudar seus gates.

## 8. Movimento
Surgir (fade in), 180 ms, ease-out, somente no detalhamento recém-aberto. A abertura e o fechamento continuam imediatos; `prefers-reduced-motion` remove a animação. Nenhuma animação de números, seleção ou digitação.

## 9. Imagens e conteúdo
Marcadores de categoria de 24 px na tabela, SVG de 20 px. Fotos QC somente na galeria aberta explicitamente. Nenhuma capa ou preview novo na listagem.

## 10. Regras práticas
Comparar compradas, recebidas, disponíveis e vinculadas; revelar cancelamentos e quantidades por destino no detalhe. Manter pagamento e fotos identificáveis separadamente. Não converter ausência de fotos em avaliação de QC.

## 11. Decisões de 28/10/2026
Tabela semântica no desktop, layout rotulado abaixo de 1100 px, expansão por botão com estado anunciado. Com os mesmos 20 itens em 1440×900, meta mínima de duas vezes mais linhas completas visíveis. Evidência e limitações em `audits/UI_RESIDUAL_CORRECTIONS_2026-10-28.md`.

## 12. Referências
`design/PACKAGES_AND_COSTS_REFERENCES.md`: A (alinhamento financeiro), B (logística), C (formulários), D (mobile). `22_PACKAGES_AND_COSTS_UX_REFACTOR_PLAN.md`: resumo, descoberta, detalhe e edição contextual. Nenhuma identidade externa foi importada.
