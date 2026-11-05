# Mensagens prontas para liberar cada fase

Estas mensagens são **complementos** ao `02_PROMPT_MESTRE.md`, dentro do mesmo chat do agente. Só envie a mensagem de uma fase **depois de analisar e aprovar a fase anterior**. Se houver correções, peça correções na própria fase e **não** envie a próxima mensagem.

## Mensagem inicial (Fase 0)

> Considere `02_PROMPT_MESTRE.md` e todos os anexos do handoff como instruções de trabalho. O Penpot `Loti Design System`, versão `DESIGN FREEZE · Pedidos Loti · 04A/04B · Desktop + Mobile · 28-10-2026`, é a referência visual principal. Faça **exclusivamente a Fase 0 — reconhecimento e plano**, sem alterar a implementação. Mapeie a arquitetura atual, QC, montagem de pacote, quantidades e riscos, valide o baseline de testes e apresente o plano técnico e evidências. Ao final, pause para minha aprovação da Fase 1.

## Após aprovação formal da Fase 0 → Fase 1

> **Aprovo a Fase 0** e autorizo **somente a Fase 1 — fundação visual e shell**. Execute os blocos 1.1–1.3 do roadmap, reutilize os componentes existentes e traduza o Penpot congelado para primitives sem alterar regras de domínio. Mostre evidências desktop/mobile, testes e diffs. Não avance para a Fase 2 sem minha aprovação.

## Após aprovação formal da Fase 1 → Fase 2

> **Aprovo a Fase 1** e autorizo **somente a Fase 2 — listagem e filtros desktop/mobile**. A tabela deve ocupar toda a área disponível quando não houver drawer no desktop; quando houver, contrair dinamicamente. Implemente listagem real, tabs, busca, filtros, paginação real e bottom sheet de filtros no mobile. Compare os estados com os frames 04A e M01/M02/M16/M17. Valide os critérios LIST/DESK/MOB pertinentes e pare para aprovação.

## Após aprovação formal da Fase 2 → Fase 3

> **Aprovo a Fase 2** e autorizo **somente a Fase 3 — detalhe 04B e QC de leitura**. Clicar no produto deve carregar o item específico (não a compra inteira) com seus custos, quantidades, fotos QC e ações contextuais sem duplicação. Desktop: drawer direito; mobile: bottom sheet inferior, nunca lateral. Preserve integralmente as associações, capa e galeria QC atuais. Demonstre o comportamento com itens com/sem QC e disponibilidade e pare para aprovação.

## Após aprovação formal da Fase 3 → Fase 4

> **Aprovo a Fase 3** e autorizo **somente a Fase 4 — preparação 04A, stepper e montagem de pacote**. Implemente seleção por item, resumo, abrir/fechar drawer e expansão da tabela no desktop; bottom sheet no mobile. O seletor deve ser `− n +`, mínimo zero, máximo saldo disponível real, com estados disabled e validação backend. Integre revisão/commit sem duplicar vínculos, teste concorrência e preserve regras de pacote existentes. Mostre evidências e pause para aprovação.

## Após aprovação formal da Fase 4 → Fase 5

> **Aprovo a Fase 4** e autorizo **somente a Fase 5 — importação global de fotos QC via JSON**. A toolbar deve mostrar exclusivamente o ícone foto com `+`, com label acessível. Um JSON único deve atualizar vários itens elegíveis, usando o parser/armazenamento/associações já existentes, com validação, preview, deduplicação, feedback por item e preservação de capas manuais. Desktop e mobile completos, sem drawer lateral no mobile. Teste casos válidos/inválidos/duplicados e pause para aprovação.

## Após aprovação formal da Fase 5 → Fase 6

> **Aprovo a Fase 5** e autorizo **somente a Fase 6 — ações contextuais integradas**. Conecte chegada, edição, reembolso, origem da compra, gallery/ações complementares conforme contratos existentes. Não altere cálculos financeiros, saldos, moedas ou regras de reembolso sem autorização. No mobile, todas as superfícies transitórias devem respeitar bottom sheets/entrada vertical, nunca drawer lateral. Traga testes de regressão, evidências e pause para aprovação.

## Após aprovação formal da Fase 6 → Fase 7

> **Aprovo a Fase 6** e autorizo **somente a Fase 7 — auditoria final de UI/UX, integração, regressão e handoff**. Compare as telas com o Penpot congelado, teste viewports 320–1920, stepper min/max, tabela expandida, bottom sheets mobile, QC JSON/associações, editar/chegada/reembolso, acessibilidade e integridade de Pacotes. Corrija falhas bloqueantes **dentro desta fase**, documente divergências e produza um relatório final com evidências. **Não faça merge nem deploy**. Pause para minha aprovação do fechamento.

## Pedido de correção (em qualquer fase)

> **Ainda não aprovo a Fase [N].** Corrija **somente** os pontos abaixo dentro da fase corrente, preservando o freeze do Penpot, as regras de negócio e os demais itens já aprovados. Para cada correção, mostre evidência desktop/mobile e regressão. Não avance de fase. **Pontos:** [colar aqui].

## Fechamento de Pedidos (apenas após Fase 7)

> **Aprovo a Fase 7 e o fechamento visual/funcional da tela de Pedidos**, conforme evidências anexadas. Congele a implementação concluída em um commit/registro de handoff e prepare o sumário técnico, mas **não faça merge ou deploy até autorização separada**. A próxima iniciativa de design, Pacotes, será planejada em outro escopo.
