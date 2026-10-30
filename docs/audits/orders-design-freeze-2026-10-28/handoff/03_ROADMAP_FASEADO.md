# Roadmap de implementação — Loti / Pedidos

**Regra absoluta:** uma fase ativa por vez, com **gate de aprovação explícita de Gabriel** ao final. A fase seguinte é bloqueada até a aprovação. Implementar e validar os blocos dentro da fase corrente; se houver risco de perda de dados ou quebra de API, pausar naquele ponto e solicitar orientação.

## Resumo executivo

| Fase | Resultado verificável | Porte relativo | Autorização para avançar |
| --- | --- | --- | --- |
| **0** | Plano técnico ancorado no repositório e Penpot; nenhuma mudança de produto | M | Gabriel aprova plano e escopo |
| **1** | Shell e primitives do Design System de Pedidos consistentes | M | Gabriel aprova infraestrutura visual |
| **2** | Tabela/lista e filtros desktop/mobile funcionais; fullscreen horizontal sem drawer | G | Gabriel aprova listagem/responsividade |
| **3** | Detalhe de **um item** 04B, ações de leitura e QC existente | G | Gabriel aprova detalhe e galerias |
| **4** | Preparação de pacote 04A, seleção e stepper com limites; montagem real | G | Gabriel aprova seleção e montagem |
| **5** | Importação global de QC por JSON com validação e associação existente | G | Gabriel aprova importação com dados de teste |
| **6** | Chegada, editar, reembolso, origem e ações complementares integradas | G | Gabriel aprova fluxos completos |
| **7** | Auditoria e regressão final, performance, acessibilidade, entrega pronta | G | Gabriel aprova o fechamento da tela |

> Os portes são estimativas relativas, não horas. O agente deve revisá-los após inspeção do repositório na Fase 0.

## Fase 0 — Reconhecimento e plano (READ-ONLY)

**Bloco 0.1 · Repositório.** Ler `AGENTS.md`/instruções pertinentes; mapear rotas Pedidos/Pacotes, stack de UI, componentes, temas, queries, hooks, stores, domínio, API, permissões e testes. Registrar o estado do git sem modificar trabalho existente.

**Bloco 0.2 · Penpot.** Abrir versão congelada no `Loti Design System`, localizar frames 04A/04B e estados mobile, registrar hierarquia, breakpoints, fluxos de navegação e diferenças entre tabela de largura integral, tabela com preparação e detalhe 04B.

**Bloco 0.3 · Regras.** Rastrear QC (incluindo capa/galeria/associações e JSON), quantidades compradas/recebidas/disponíveis/vinculadas, custo até o armazém, seleção para pacote, reembolso, edição e chegada. Identificar garantias existentes e gaps.

**Bloco 0.4 · Plano e riscos.** Executar testes de baseline sem alterar código; propor árvore de componentes, arquivos alvo, dependências entre fases, medidas de rollback e critérios de aceite. Distinguir gap de backend de gap visual.

**Aceite:** plano e mapeamento reais, nenhuma alteração funcional, riscos identificados, lista de decisões pendentes. **Pausar.**

## Fase 1 — Fundação visual / shell

**Bloco 1.1.** Mapear estilos do Penpot aos tokens existentes. Preservar branding e sidebar; não mudar estilo global de telas fora do escopo sem aprovação.

**Bloco 1.2.** Estruturar container de Pedidos com cabeçalho, toolbar, tabs, lista, espaço de painel e rodapé de forma responsiva. Criar padrões reutilizáveis para ícone com tooltip, badge, linha, thumb, botão, estados de feedback e sheets, preferindo primitives existentes.

**Bloco 1.3.** Definir componente acessível de painel dinâmico desktop e base mobile bottom sheet (sem abrir dados reais nesta fase). Validar fechamento, foco, teclado, overlay e bloqueio de rolagem.

**Aceite:** shell fiel e sem regressão, base pronta para conectar dados, desktop/mobile sem scroll horizontal inesperado. **Pausar.**

## Fase 2 — Lista e filtros (vertical slice desktop + mobile)

**Bloco 2.1.** Implementar consulta real de itens de Pedidos: ID de item, nome, imagem/capa existente, variação, comprador se for aplicável, status, quantidades, custo até armazém, QC/status e ações. Não carregar a compra inteira como resultado principal do clique.

**Bloco 2.2.** Tabela desktop: títulos/metadata com hierarquia, colunas alinhadas, estado `Todos`, `No armazém`, `Disponíveis`, busca, etapa, filtros avançados e paginação real. Sem painel: **tabela usa toda a largura disponível**. Com painel: tabela encolhe sem overflow e sem reservar vazio.

**Bloco 2.3.** Lista mobile de 390px de referência: cards/linhas limpos, filtros compactos, bottom sheet de filtros, tabs e pesquisa. Proibir qualquer drawer lateral. Implementar variação de viewport de forma resiliente, não pixel fixo como única largura.

**Bloco 2.4.** Estados carregando, vazio, erro, retry, sem resultados, filtros persistidos/consolidados conforme comportamento atual. Testes de filtro, paginação e responsive.

**Aceite:** mobile e desktop demonstráveis com dados reais; coluna completa com drawer fechado; precisão de busca e tabs; cliques que levam ao item correto. **Pausar.**

## Fase 3 — Detalhe único do item (04B)

**Bloco 3.1.** Clicar nome, miniatura ou linha abre detalhe do **itemId**; drawer direito desktop com cabeçalho, disponibilidade, valores próprios, status, fotos QC e ações relevantes. Preservar contexto/filtros/seleção ao fechar.

**Bloco 3.2.** Reaproveitar renderer das fotos QC: thumbnails, múltiplas fotos, visualização ampliada, seleção/capa existente, ausência de fotos, links e carregamento. A origem da compra aparece como referência resumida, sem dominar a tela.

**Bloco 3.3.** Mobile com bottom sheet **ancorado embaixo**; nenhum slide da direita. Fazer versão para os seis exemplos de itens (com/sem QC; com/sem unidades). Ações ainda não integradas na Fase 6 devem estar corretamente indicadas como pendentes, não falsamente operacionais.

**Aceite:** item certo, dados certos, ausência de duplicidade desnecessária, QC intacto, fechamento retornando à mesma lista. **Pausar.**

## Fase 4 — Preparação 04A, stepper e montagem

**Bloco 4.1.** Estado de seleção por item; cálculo de quantidade e resumo, sincronização com estado real da tela. Abrir/fechar painel de preparação, sem perder seleção e com expansão/retração da tabela.

**Bloco 4.2.** Stepper `− n +`, mínimo `0`, máximo **disponível efetivo** (incluindo reservas/vínculos atuais segundo backend). Desabilitar decremento em 0 e incremento no limite; tratar atualização assíncrona ou disponibilidade que muda entre cliques.

**Bloco 4.3.** Remover item, revisar pacote e confirmar montagem com ação real e feedback. Bloquear operação sem unidades; confirmar elegibilidade e idempotência no servidor; mostrar erros de concorrência sem perder o contexto.

**Bloco 4.4.** Preparação mobile via bottom sheet, com sumário e stepper, safe-area, teclado/foco e rolagem. Incluir testes da transição entre dois ou mais produtos e limite por produto.

**Aceite:** seletor consistente, nunca menos que 0/nunca acima do disponível, totais corretos, pacote criado/associado sem duplicidade; desktop e mobile funcionais. **Pausar.**

## Fase 5 — QC JSON em lote

**Bloco 5.1.** Gatilho global de ícone **foto +** no topo desktop/mobile, com tooltip/aria-label. Inspecionar mecanismo já existente de JSON/importação e contratos de fotos.

**Bloco 5.2.** Upload/colar JSON, validação sintática, validação por item, preview do total de encontrados/alterados/ignorados/erros, detecção de ambiguidades e tratamento de arquivos grandes; nenhuma associação por mero nome de produto se houver identificador estável.

**Bloco 5.3.** Confirmar importação com feedback granular e segurança contra reprocessamento/duplicação. Preservar foto de capa e associações por item, sem sobrescrever customizações de capa indevidamente; atualizar UI e caches após sucesso.

**Bloco 5.4.** Mobile com bottom sheet e tratamento dos mesmos estados; testes com JSON válido, inválido, parcial, duplicado e item inexistente.

**Aceite:** a importação do **JSON único** atualiza apenas os pedidos elegíveis/correspondentes, com rastreabilidade, sem apagar ou recriar associações existentes. **Pausar.**

## Fase 6 — Ações complementares reais

**Bloco 6.1.** Chegada no armazém, se aplicável ao item e etapa; atualizar quantidades/status sem violar vínculos.

**Bloco 6.2.** Edição e reembolso a partir do detalhe, preservando validações, saldos, vínculos, moedas e fórmulas atuais. Exibir ação de reembolso de forma contextual e condicional.

**Bloco 6.3.** Compra de origem resumida (ação contextual), galeria QC, alteração de capa/visualização, confirmação e retorno ao mesmo item e filtros. Não reintroduzir accordion→modal→drawer em cascata.

**Bloco 6.4.** Mobile para todas as ações com **bottom sheets** ou fluxos full-screen previstos, sempre sem drawer lateral. Testes de permissão, erros de API e retorno/escape.

**Aceite:** todos os controles reais têm consequência correta, erros são recuperáveis, nenhuma alteração silenciosa de regra financeira. **Pausar.**

## Fase 7 — Auditoria final e handoff

**Bloco 7.1.** Comparação visual frame a frame com Penpot congelado em desktop e mobile, incluindo estados abertos e fechados. Checklist de grids, setas, labels, QC icon, badges, fontes, truncamento, sobreposição e responsividade.

**Bloco 7.2.** Testes unitários/integrados/E2E dos caminhos principais, limites do stepper, JSON em lote, seleção e concorrência. Verificar histórico/reembolso/custos, integrações com Pacotes e permissões, sem implementar uma nova tela de Pacotes.

**Bloco 7.3.** Acessibilidade (teclado, foco, escape, labels, aria, contraste, reduced-motion), erros/empty/loading, performance e regressão multi-breakpoint.

**Bloco 7.4.** Relatório final, dívida técnica não-bloqueante, riscos, migrações necessárias, documentação e roteiro de homologação. **Sem merge/deploy automático.**

**Aceite:** nenhum blocker crítico, evidência reproduzível, paridade com freeze, aprovação expressa de Gabriel para encerrar Pedidos. **Pausar.**

## Regras de correção dentro das fases

- Bug de fase vigente: consertar nela e reapresentar para aprovação.
- Regressão descoberta de fase anterior: corrigir antes de continuar, registrando o impacto; não usar a próxima fase para ocultar pendências.
- Divergência de design: registrar referência do frame Penpot e pedir autorização para mudança. Não “otimizar” o visual por conta própria.
- Impossibilidade técnica real: documentar alternativas viáveis, custo/risco, recomendação e decisão pendente, sem simular sucesso.
