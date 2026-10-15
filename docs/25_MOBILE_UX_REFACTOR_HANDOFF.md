# Loti — Handoff de refatoração mobile para Luna 6

## Prompt de execução

Implemente as refatorações mobile descritas neste arquivo no repositório `C:\Fontes\loti`. Execute por fases e continue autonomamente entre elas, corrigindo falhas antes de avançar. O objetivo é entregar a interface local refatorada e validada, não apenas uma análise ou plano. Não publique nem altere produção.

O usuário determinou: **no mobile, nenhum drawer deve existir sem ocupar toda a tela**. Além disso, solicitou melhorar a organização, posicionamento e espaçamento dos componentes. A auditoria de referência está em [2026-10-15_MOBILE_UX.md](audits/2026-10-15_MOBILE_UX.md).

Use a skill `frontend-design` se estiver disponível no ambiente. Na auditoria ela não estava instalada. Se continuar indisponível, registre isso e prossiga com as diretrizes visuais do Loti; não instale plugins nem bloqueie o trabalho por essa ausência.

## 1. Preparação obrigatória

1. Leia `AGENTS.md`, `PROMPT_ONE_SHOT.md` e a sequência completa de documentos canônicos exigida pelo repositório antes de escrever código.
2. Leia os planos aplicáveis: `docs/18_WORKSPACE_INVITATIONS_PLAN.md`, `docs/19_PROFILE_EDITING_PLAN.md`, `docs/20_PURCHASE_COST_SHARING_PLAN.md`, `docs/21_PACKAGES_AND_COSTS_PLAN.md`, `docs/22_PACKAGES_AND_COSTS_UX_REFACTOR_PLAN.md`, `docs/23_PRODUCT_REFUNDS_PLAN.md` e `docs/24_HUBBUY_QC_IMPORT_PLAN.md`.
3. Leia a auditoria completa. Diferencie evidências observadas de recomendações e de estados ainda não testados.
4. Inspecione `git status` e os diffs. Havia várias alterações locais existentes durante a auditoria, inclusive em Surface, CSS, QC, pacotes e reembolsos. Preserve esse trabalho; não faça reset, checkout de arquivos ou sobrescrita em massa.
5. Inspecione `package.json`, testes existentes e implementação atual. Use os scripts reais do projeto, sem inventar comandos ou pressupor que a árvore permanece igual à auditada.
6. Use o Codex Browser para conferir a interface antes e depois. Rota de exemplo: `http://localhost:3000/packages/3b39885a-cc1f-47f7-b74f-09310f74825c`. Se o registro não existir, use outro acompanhamento local adequado ou fixtures isoladas.

Este handoff delimita uma refatoração de UX. A missão geral do one-shot não amplia o escopo para reconstruir o produto ou executar deploy.

## 2. Limites de escopo

- Preserve Next.js, TypeScript, Tailwind/shadcn, Better Auth, Drizzle e Turso/libSQL; não introduza bibliotecas de interface sem necessidade concreta.
- Preserve Geist, paleta, marcadores SVG, identidade Loti e ilha flutuante mobile com quatro destinos.
- Preserve desktop funcional e visualmente coerente. Não transforme sheets desktop em telas completas por efeito colateral.
- Não altere cálculos, bases de incidência, arredondamento, proporções, autorização, snapshots finalizados, pagamentos ou regras de reembolso.
- Não altere schema nem crie migrações para resolver layout.
- Preserve o estado funcional atual do QC. Este handoff não autoriza uma nova fase de fotos operacionais, novos slots de imagem, integração, scraping, processamento em background ou mudanças de storage.
- Não configure Cloudflare/secrets, crie buckets, migre produção, publique ou faça deploy.
- Não crie dashboard, nova área principal ou redesign do login.
- Não use registros pessoais existentes para testes destrutivos. Prepare dados isolados com os mecanismos de testes do projeto; não confirme pagamento, reembolso, cancelamento ou exclusão nos registros do usuário apenas para validar aparência.

## 3. Decisões de UX para implementar

### 3.1 Superfícies mobile

Adote estes padrões:

| Conteúdo | Padrão |
| --- | --- |
| Criação/edição de objetos | Superfície contextual de tela inteira |
| Consulta extensa ou detalhamento financeiro | Superfície contextual de tela inteira |
| Consulta curta de um grupo de informações | Expansão inline |
| Confirmação breve de decisão | Dialog compacto pode permanecer |

Não implemente drawers laterais estreitos ou bottom sheets parciais no mobile. A exceção de confirmação aplica-se somente a decisões curtas, sem formulário extenso; não use o nome “dialog” para manter um formulário parcial.

“Novo favorito”, “Nova coleção”, “Criar/Editar compra”, editores de itens, pacotes, conteúdo, cobranças e reembolsos devem seguir o mesmo contrato mobile. Inclua formulários de convite/reabertura e outros consumidores de Surface no inventário para evitar inconsistência, respeitando seus fluxos existentes.

**Não crie rotas novas nesta refatoração.** A auditoria cita páginas dedicadas como alternativa futura para fluxos extensos; neste trabalho, reutilize as superfícies contextuais e etapas atuais. Não empilhe múltiplas superfícies modais quando a mesma superfície puder trocar de etapa com retorno claro.

### 3.2 Estrutura da superfície completa

- Ocupa toda a largura e altura útil mobile, sem margens externas ou cantos de drawer parcial.
- Cabeçalho compacto: título, subtítulo do objeto quando necessário e fechamento acessível. Evite títulos que concatenem ação e nome longo.
- Corpo com uma região de rolagem principal; não crie scroll aninhado sem necessidade.
- Rodapé de ações consistente, no fim da superfície para formulários curtos e alcançável em formulários longos. Use layout flex/grid; evite margens artificiais para empurrar botões.
- Respeite safe areas superior/inferior e altura dinâmica da viewport.
- A ilha não participa da interação modal nem aparece sobre seu conteúdo.
- Preserve Escape, foco contido, título/descrição acessíveis, retorno de foco e bloqueios enquanto houver operação em andamento.
- Validar teclado virtual: campo focado, mensagens de erro e ações devem continuar alcançáveis. Um rodapé fixo que cobre os campos não atende ao requisito.
- Cancelar/fechar não salva rascunhos; preserve os contratos existentes de envio, busy e validação.

Evolua `Surface` de forma explícita e pequena, distinguindo formulário/detalhe/confirm quando necessário. Não aplique uma regra global que transforme todas as confirmações em formulários completos. Migre os consumidores afetados e preserve exceções justificadas, como o visualizador QC.

## 4. Backlog obrigatório

### A. Corrigir reembolso em 320 px — prioridade máxima

Na auditoria, `.refund-amount` ficou com cerca de 13,5 px de largura e `R$ 21,84` quebrou caractere por caractere. O botão “Recolher detalhes” disputava a mesma linha.

- Reorganize o resumo mobile: produto/participante → status/data → valor/método → ação de detalhes, permitindo linhas próprias.
- Valores monetários devem permanecer inteiros; rótulos podem quebrar naturalmente.
- Não resolva com fonte minúscula, largura fixa que gera overflow, truncamento do valor ou ocultação do método.
- Teste com detalhes recolhidos/abertos, nomes longos, valores grandes e múltiplos participantes.

### B. Hierarquia inicial de Pacotes e custos

Ordem recomendada: voltar → nome/menu → estados/metadados compactos → custo líquido atual, parcial e próxima tarefa → Produtos e pagamento → Pacotes → Divisão por pessoa.

- Agrupe ações administrativas QC em menu contextual acessível. Preserve autorização, nomes compreensíveis e descoberta de pendências quando relevantes.
- As três ações QC não devem ocupar três linhas antes do resumo em 320 px.
- Total e próxima tarefa devem aparecer na primeira viewport de 320 × 640, sem colidir com a ilha.
- Preserve expansão e posição contextual após salvar. Não provoque saltos de scroll a cada atualização de dados.

### C. Reduzir excesso de caixas e repetição

- Substitua cartões individuais de base/taxa/total por linhas de rótulo e valor com divisores discretos.
- Reserve bordas e fundos para agrupamentos reais. Reduza padding acumulado; não elimine o respiro entre grupos.
- Remova títulos internos duplicados quando o cabeçalho expansível já identifica a seção.
- No pagamento, mostre crédito recebido resumido; concentre lista e detalhes na subseção de reembolsos.
- Preserve bases históricas e acesso à composição completa.

### D. Clareza de pagamentos e cobranças

- Destaque custo líquido atual e indicação de parcial onde aplicável.
- Para cobrança paga, use “Total pago” no registro original; para pendente, “Total a pagar”. Não derive o total original do líquido após reembolso.
- Troque “Pagamento confirmado” desabilitado por status de leitura quando ele não representar uma ação disponível. Preserve uma edição explícita separada.
- Cobrança desconhecida: um estado claro e uma ação “Informar frete/Receita”; evite repetir “Falta informar” em cada linha vazia.
- Cobrança conhecida: mostre base/taxa/total e estado de pagamento conforme as regras existentes. Receita não ganha taxa de transação.
- Desconhecido, zero informado e sem cobrança continuam distintos.

### E. Pacotes e ações

- Resumo legível em linhas: nome → etapa logística → unidades/pendência financeira.
- Não esconda pendência essencial em ellipsis nem use texto de 9 px.
- Ao expandir: conteúdo → cobranças → ações contextuais.
- Separe edição do pacote, edição do conteúdo e edição financeira. Exclusão de pacote vazio fica em ação secundária com confirmação existente.
- Preserve alocações de outros pacotes, estado de rascunho e validação concorrente.

### F. Espaçamento, tipografia e ilha

- Use escala existente de 4/8/12/16/24/32 px: aproximadamente 16 px nas laterais, 8 px entre rótulo/campo, 16–24 px entre grupos; ajuste conforme contexto sem criar um segundo design system.
- Metadados operacionais devem ser legíveis, preferencialmente 12–14 px. Não aumente todos os textos indistintamente.
- Controles principais e itens de menu devem ter alvo de toque de pelo menos 44 × 44 px.
- Mantenha reserva inferior suficiente para trazer o último campo/controle completamente acima da ilha e da safe area.
- Ações que abrem/focam conteúdo devem posicionar o alvo em área visível. Sobreposição transitória durante scroll não deve ser confundida com um item permanentemente inacessível.

### G. Microcopy e números

- Corrija `Crédito $R$ 21,84` para símbolo monetário único.
- Corrija flexões como `1 unidade compradas`, `1 canceladas`, `1 unidades canceladas` e `evento(s) auditável(is)`.
- Explique comprado/cancelado/enviável com rótulos claros; números soltos `1 · 1 · 0` precisam de associação inequívoca.
- Título “Composição dos custos”; nome completo do produto em subtítulo legível.
- Mova explicações secundárias longas para junto do campo ou para ajuda expansível, sem esconder avisos necessários antes de uma ação financeira.
- Padronize inputs monetários pt-BR, teclado decimal e validação. Preserve precisão e aceitação dos formatos já suportados; confira parsers antes de alterar inputs.

### H. Estado vazio de Favoritos

- Reduza competição entre filtros, ação central e FAB quando não existe nenhum favorito.
- Preserve o FAB mobile aprovado e acesso à criação; simplifique controles sem utilidade no vazio global.
- Quando houver favoritos e filtros retornarem zero, mantenha controles para corrigir/limpar o filtro.
- Não crie novas ilustrações ou superfícies editoriais para este ajuste.

## 5. Arquivos iniciais para inspeção

Os caminhos são pontos de partida, não uma obrigação de editar todos:

- `src/components/ui/surface.tsx`
- `src/app/globals.css`
- `src/components/layout/app-shell.tsx`
- `src/components/packages/package-cost-detail-screen.tsx`
- `src/components/packages/refunds-section.tsx`
- `src/components/qc/qc-components.tsx`
- `src/components/favorites/favorite-editor.tsx`
- `src/components/favorites/favorites-screen.tsx`
- `src/components/favorites/collections.tsx`
- `src/components/purchase/purchase-editor.tsx`
- `src/components/purchase/item-editor.tsx`
- `src/components/purchase/purchase-screen.tsx`
- `src/components/group-screen.tsx`
- Testes E2E de packages, refunds, QC, favorites e purchase existentes no repositório.

Evite acrescentar overrides contraditórios ao fim do CSS sem revisar as regras existentes. Prefira corrigir a responsabilidade original e usar classes semânticas de escopo restrito.

## 6. Execução por fases

1. **Baseline:** inventarie consumidores de Surface, registre estado atual e checks; reproduza a quebra do reembolso. Confira as dimensões CSS efetivas do navegador, não só o tamanho solicitado ao override.
2. **Fundação:** implemente contrato de tela completa e rodapé, migre formulários e confira confirms/QC/desktop. Corrija a quebra financeira em 320 px.
3. **Pacotes:** reorganize cabeçalho/QC, pagamento, pacotes, reembolsos e divisão; reduza repetição e caixas.
4. **Coerência mobile:** ajuste tipografia, toque, ilha, microcopy, inputs e vazio de Favoritos. Inspecione também superfícies equivalentes em Compra, Histórico, Grupo e Perfil.
5. **Validação e handoff:** execute checks, corrija regressões, capture evidências e atualize documentação.

Continue entre fases sem pedir confirmação de escolhas rotineiras. Pare apenas diante de bloqueio humano real. Não amplie para redesign de áreas sem relação com os problemas descritos.

## 7. Validação obrigatória

### Visual e interação

- Mobile: 320 × 640, 360 × 800, 390 × 844 e 430 × 932 CSS px.
- Transição: 768 px. Desktop: 1440 px.
- Formulários curtos/longos, título longo, erros, busy, cancelar, salvar e reabrir.
- Foco visível, Escape, retorno ao gatilho, conteúdo de fundo inerte e reduced motion.
- Início/fim de scroll e posicionamento contextual próximo à ilha.
- Se possível, dispositivo físico e teclado virtual. Se indisponíveis, registre limitação; emulação de viewport não prova comportamento do teclado real.
- Favoritos preenchidos, busca sem resultados, coleção vazia e múltiplos membros.
- Compra com itens pessoais/compartilhados, criação/edição e Histórico somente leitura.
- Pacotes múltiplos e vazios; cobranças desconhecidas/conhecidas/pagas/sem cobrança; acompanhamento encerrado.
- Reembolso solicitado/recebido/anulado, nomes longos e valores grandes.
- Importador, associação e visualizador QC preservados.

### Checks automatizados

- Rode lint, typecheck, testes unitários/integrados pertinentes, E2E afetados e build com os scripts do projeto.
- Acrescente regressões úteis para o valor de reembolso em 320 px, formulários completos e controles finais alcançáveis. Não teste apenas existência de classes CSS.
- Reutilize fixtures isoladas. Não escreva testes que alteram o registro pessoal fornecido como exemplo.
- Não crie testes redundantes para cada ajuste de margem; priorize comportamento, acessibilidade e regressões observáveis.
- Se houver falha anterior ao trabalho, documente baseline e evidência; corrija falhas introduzidas e não declare todos os checks aprovados quando não foram executados.

### Critérios de aceite

- [ ] Nenhum drawer parcial no mobile; formulários/detalhes extensos são completos.
- [ ] Nova coleção e Criar/Editar compra seguem o padrão de formulário completo.
- [ ] Confirmações breves permanecem acessíveis e não herdam layout inadequado.
- [ ] Valor monetário não quebra internamente nem disputa coluna inviável com botão em 320 px.
- [ ] Total e próxima tarefa visíveis e legíveis na primeira viewport mínima.
- [ ] Ações administrativas QC organizadas sem perder acesso ou permissões.
- [ ] Sem títulos/estados repetidos desnecessários e sem cadeia de cartões excessiva.
- [ ] Pago, pendente, parcial, zero, sem cobrança e logística mantêm significados distintos.
- [ ] Sem overflow horizontal de página nas larguras verificadas.
- [ ] Último controle pode ficar totalmente acima da ilha/rodapé; foco e erros alcançáveis.
- [ ] Desktop, QC, snapshots e regras financeiras preservados.
- [ ] Checks executados e resultados reais registrados.

## 8. Entrega esperada

- Implementação local completa e revisável; não apenas recomendações.
- Atualize documentos de design/arquitetura de informação apenas onde o novo contrato mobile exigir, distinguindo comportamento mobile de desktop.
- Registre resultado em `docs/IMPLEMENTATION_REPORT.md`, preservando o histórico existente, e/ou em relatório específico de conclusão dentro de `docs/audits/` com link no relatório principal.
- Inclua arquivos alterados, mudanças por fluxo, comandos/checks e resultados, limitações e evidências visuais antes/depois.
- Salve screenshots em diretório de artefatos já utilizado pelo projeto; cubra ao menos reembolso 320 px, primeira tela de Pacotes 390 px, formulário curto completo, formulário longo e desktop.
- Na resposta final, resuma resultado, validação e eventuais pendências reais. Não declare a interface validada em dispositivo físico ou teclado virtual se isso não aconteceu.
