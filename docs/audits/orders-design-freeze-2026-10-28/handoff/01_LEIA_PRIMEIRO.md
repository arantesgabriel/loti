# Loti · Pedidos — pacote de handoff / Design Freeze

**Status:** design de Pedidos congelado para implementação controlada. **Data:** 28/10/2026 (Brasil). **Responsável pelas aprovações:** Gabriel.

## Fonte única de verdade visual

- Plataforma: **Penpot** (`https://design.penpot.app/`).
- Arquivo: **Loti Design System**.
- ID do arquivo: `64ee36db-f4d2-8047-8008-dbff2f7d7205`.
- Página desktop: **Pedidos Loti**, ID `64ee36db-f4d2-8047-8008-dbff2f7d7206`.
- Página mobile: **Pedidos · Mobile**, ID `a1bbb7fd-3432-8020-8008-dc06a4172c3f`.
- Versão manual criada no histórico em 28/10/2026: **`DESIGN FREEZE · Pedidos Loti · 04A/04B · Desktop + Mobile · 28-10-2026`**.
- Validação interna do arquivo Penpot no instante do freeze: **zero erros**. O protótipo permanece uma referência de interação simulada, não prova de integração com backend.

## O que está aprovado

1. **04A**: listagem de Pedidos com painel de preparação de pacote à direita no desktop. Quando fechado, a **tabela ocupa toda a área livre**, incluindo o espaço previamente ocupado pelo painel.
2. **04B**: painel direito para o **pedido/item específico** clicado; nenhuma navegação involuntária para a compra inteira e nenhuma duplicação desnecessária de dados.
3. **Mobile**: nenhuma drawer lateral, em nenhuma ação. Usar bottom sheets a partir da parte inferior para detalhes e demais painéis; respeitar os fluxos mobile desenhados.
4. **Quantidade**: stepper **`− [n] +`**, não dropdown; mínimo zero e máximo igual ao número de unidades efetivamente selecionáveis, respeitando as unidades já vinculadas/reservadas.
5. **Importar QC**: no topo, **somente ícone de foto com `+`**; a ação suporta **JSON único para atualização em lote** na implementação real, reaproveitando o sistema atual de associação de fotos.
6. Tema claro e composição minimalista, fontes, pesos, status e alinhamentos como no Penpot. **Pacotes** é uma iniciativa futura, fora do escopo desta implementação, exceto integrações indispensáveis para montar pacote a partir de Pedidos.

## Como usar este pacote

1. Fornecer ao agente implementador este pacote e acesso de leitura ao **Penpot congelado** e ao **repositório existente**.
2. Copiar `02_PROMPT_MESTRE.md` como instrução principal ao agente.
3. Executar **somente a Fase 0 (investigação)** e pedir o relatório. **Não autorizar a Fase 1 automaticamente.**
4. Após aprovar cada fase, autorizar explicitamente a fase seguinte; usar `03_ROADMAP_FASEADO.md`, `04_CONTRATO_VISUAL.md`, `05_REGRAS_E_INTEGRACOES.md`, `06_MAPA_DE_FLUXOS.md` e `07_PLANO_DE_TESTES.md` como critérios de referência.
5. O agente preenche `08_REGISTRO_DE_APROVACAO.md` a cada etapa. O design fica congelado; qualquer desvio relevante vira uma **solicitação de mudança**, nunca uma alteração silenciosa.

## Índice

| Arquivo | Função |
| --- | --- |
| `02_PROMPT_MESTRE.md` | Instrução integral, comportamento do agente, governança e formato de entrega |
| `03_ROADMAP_FASEADO.md` | Fases 0–7, blocos e gates para aprovação |
| `04_CONTRATO_VISUAL.md` | Regras de visual, responsividade e referências de frames |
| `05_REGRAS_E_INTEGRACOES.md` | Invariantes do domínio, QC, quantidade, pacote e reembolso |
| `06_MAPA_DE_FLUXOS.md` | Transições, eventos e estados desktop/mobile |
| `07_PLANO_DE_TESTES.md` | QA visual, funcional, acessibilidade e regressão |
| `08_REGISTRO_DE_APROVACAO.md` | Modelo vivo de rastreabilidade fase a fase |
| `09_PROMPTS_DE_CONTINUACAO.md` | Mensagens prontas para liberar cada fase após aprovação |
| `10_MANIFEST_PENPOT.json` | IDs e regras essenciais para consulta automatizada |

## Fronteira da aprovação

O freeze aprova **direção visual, layout, componentes e comportamento de interface**, não valida automaticamente uma implementação técnica, uma integração real de JSON, política de segurança, cálculo financeiro ou deployment. Essas áreas devem ser investigadas e testadas contra o código real, preservando o que já funciona.
