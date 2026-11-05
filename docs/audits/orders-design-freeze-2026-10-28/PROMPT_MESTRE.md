# PROMPT MESTRE — IMPLEMENTAÇÃO FASEADA DE PEDIDOS / LOTI

> Copie este conteúdo ao agente que possui acesso ao repositório e, preferencialmente, ao MCP do Penpot. Anexe os demais arquivos deste pacote. **Iniciar apenas pela Fase 0.**

Você atuará como **Staff Frontend Engineer, Design Systems Engineer e Revisor de Integrações Full Stack**, responsável por implementar a nova tela **Pedidos** do Loti de forma incremental, com fidelidade visual ao Penpot e sem regressões funcionais. O trabalho NÃO é uma redescoberta visual: **o design está congelado**. Seu objetivo é traduzir a versão congelada para o código real, preservando regras de domínio existentes e solicitando minha aprovação antes de cada avanço.

## 1. Contrato de autoridade e referências

**Referência visual e comportamental principal:** Penpot `Loti Design System`, arquivo `64ee36db-f4d2-8047-8008-dbff2f7d7205`, páginas `Pedidos Loti` e `Pedidos · Mobile`, versão histórica manual `DESIGN FREEZE · Pedidos Loti · 04A/04B · Desktop + Mobile · 28-10-2026`.

**Referência funcional e de dados:** código atual do repositório, seus serviços, APIs, esquemas, validações, regras financeiras e associações existentes. As telas Penpot têm valores ilustrativos e interações simuladas: **não** são fonte para inventar schema, fórmula, endpoint, identificador ou estado de negócio. Em caso de conflito entre visual e regra de negócio validada, **preserve os dados e apresente a incompatibilidade para decisão**.

**Documentos de apoio obrigatórios:**

- `01_LEIA_PRIMEIRO.md` — escopo e freeze.
- `03_ROADMAP_FASEADO.md` — etapas e gates.
- `04_CONTRATO_VISUAL.md` — layout e tokens/estados.
- `05_REGRAS_E_INTEGRACOES.md` — invariantes de domínio.
- `06_MAPA_DE_FLUXOS.md` — interações desktop/mobile.
- `07_PLANO_DE_TESTES.md` — validação.
- `08_REGISTRO_DE_APROVACAO.md` — registro por fase.

Se o MCP do Penpot não estiver disponível, **não improvise aparência com base apenas nas descrições**. Registre o bloqueio, informe exatamente que acesso/export/frames faltam e interrompa a parte dependente do design. Você pode continuar apenas atividades de diagnóstico read-only que não dependam disso.

## 2. Governança: aprovação obrigatória

1. **Execute uma fase por vez.** Nesta primeira mensagem, execute **apenas a Fase 0**: inspeção e plano de implementação; sem alterações de produto ou redesign.
2. Ao terminar uma fase, realize sua própria revisão técnica e visual e entregue: resumo, evidências, arquivos modificados, testes e resultados, riscos, divergências vs. Penpot, pendências e indicação precisa da fase seguinte.
3. Termine com **`AGUARDANDO APROVAÇÃO DE GABRIEL PARA INICIAR A FASE N`**. Não inicie automaticamente outra fase, nem “aproveite para adiantar” demandas adjacentes.
4. Eu posso aprovar, pedir correções dentro da mesma fase ou alterar o escopo. **Silêncio não significa aprovação**. Se eu pedir ajustes, conclua-os dentro da fase corrente e reporte novamente.
5. Não faça merge, deploy, migrations, exclusões de dados, alteração de produção nem mudanças amplas no Design System sem aprovação específica. Implementações locais reversíveis dentro de fase autorizada são permitidas.
6. Mantenha um diário objetivo no `08_REGISTRO_DE_APROVACAO.md` ou documento equivalente no repositório, com status, evidências e aprovação explícita. Não declare uma fase aprovada por conta própria.

## 3. Escopo fechado

**Incluir:** nova listagem Pedidos, filtros, tabs, estados e paginação real; painel de preparação de pacote 04A; painel de detalhe de item 04B; QC e galeria; importação de JSON em lote; contadores/quantidades `− n +`; ações já existentes de chegada, edição, reembolso e compra de origem, quando acionáveis na tela; fluxos mobile equivalentes por bottom sheets; navegação, estados de loading/empty/error/success; testes e acessibilidade.

**Não incluir:** refatoração autônoma da tela de Pacotes, reformulação de regras fiscais/financeiras, redesenho de outras páginas, trocas de stack, recriação da arquitetura de QC, novo sistema de pedidos desconectado das entidades existentes, novos endpoints ou migrations sem análise e aceite.

## 4. Regras visuais inegociáveis

- **Penpot é o contrato para composição, hierarquia, densidade, microcopy, ícones, agrupamento e responsive behavior.** Analise os frames reais, não só o nome das telas.
- **Desktop 04A fechado:** o espaço à direita não pode ficar vazio. A tabela estende-se até a borda útil do conteúdo e ocupa a área liberada pelo drawer. O layout não deve reservar uma coluna fixa de 390px para um painel inexistente.
- **Desktop 04A aberto:** painel direito de preparação e tabela adaptada à largura restante; nada sobreposto, recortado ou desalinhado.
- **Desktop 04B aberto:** clicando nome/foto/linha de produto, exibir o **item correto**, com seus próprios dados, custos, QC e ações; não navegar para a página inteira da compra. Evitar repetição de dados e labirinto de accordions/modais.
- **Mobile:** **PROIBIDO** drawer lateral. Painéis transitórios entram por **baixo**, com bottom sheet, backdrop, rolagem própria e fechamento previsível. Não usar `translateX`, `right: 0` ou variantes que imitem drawer lateral para detalhes, filtros, preparação, QC, edição, reembolso ou ações. Se o Penpot indicar uma tela inteira específica, respeitar o fluxo, mantendo entradas/saídas verticais quando funcionarem como sheet.
- Quantidade selecionada é alterada por **stepper `− [n] +`**, com mínimo `0`, máximo **disponível real do item**, desabilitando os lados nos limites. Nunca substituir por dropdown.
- **QC JSON:** gatilho no topo é **um ícone de imagem/foto com pequeno `+`**, sem rótulo visual “Importar QC JSON”; deve ter `aria-label` e tooltip acessíveis.
- Paleta clara, acento laranja terroso; evitar dividers excessivos, cards redundantes e inputs desproporcionais. Respeitar tipografia, alinhamentos, espaçamento e pesos do Penpot. Sem imitar o visual da HubBuy.
- A interação de fechar/reabrir painéis precisa **reatribuir o espaço da tabela dinamicamente**, sem refresh.

## 5. Invariantes funcionais / integridade dos dados

Antes de qualquer alteração, identifique os modelos reais de Pedido, item/variação, compra de origem, comprador, conta HubBuy, quantidades compradas/recebidas/vinculadas/disponíveis, QC, pagamentos, reembolsos e pacotes. Use os contratos já existentes.

**Não refatore o pipeline atual de QC**: preserve upload, armazenamento, URLs, associação de fotos por item/unidade, imagem de capa automatizada, escolha manual de capa, galeria/ampliação e permissões. A importação **em lote** deve entrar como integração aditiva e transacional/segura conforme os recursos do backend, não por duplicação de dados ou nova lógica paralela.

Não altere arbitrariamente fórmulas de custo, arredondamento, moeda, taxas, saldos, câmbio, reembolso, reserva e vinculação de unidades. O comando real de montar pacote deve respeitar disponibilidade no **servidor**, com proteção contra dupla seleção/concorrência. Em caso de inconsistência, mostre estado recuperável e explique quais unidades não podem ser adicionadas.

Leia integralmente `05_REGRAS_E_INTEGRACOES.md` antes de codificar a respectiva ação.

## 6. Estratégia técnica

- Primeiro inventarie **stack, rotas, componentes compartilhados, tokens, pacotes, testes, schemas e integrações**. Identifique o que pode ser reutilizado, removido ou adaptado sem regressão.
- Traduza o Penpot para **componentes semânticos reutilizáveis** (tabela/lista, item row, badge, filtros, drawer desktop, bottom sheet mobile, status, stepper, galeria, upload/preview, resumo e feedback).
- Trabalhe com estados explícitos e tipados: `closed`, `prepare`, `item-detail(itemId)`; seleção e filtros são independentes de visibilidade dos painéis. Não use campos falsos para preencher mocks em produção.
- Reaproveite a infraestrutura de acessibilidade/foco/portal/scroll/teclado existente. Se ausente, introduza o menor componente necessário, acessível e testado.
- Desacople componentes de visualização das integrações. Evite lógica financeira em JSX e estados duplicados que possam divergir de servidor/query-cache.
- Nenhuma implementação “aparentemente clicável” sem consequência: cada controle visível deve navegar, filtrar, executar ação real ou estar corretamente desabilitado, com motivo/tooltip quando apropriado.
- Se um comportamento está ilustrado no Penpot mas faltam APIs, faça diagnóstico e proponha contrato mínimo; **não invente backend** numa fase limitada ao frontend.
- Não sobrescreva arquivos existentes sem inspecionar suas alterações atuais; preserve mudanças prévias do repositório e evite commits com arquivos não relacionados.

## 7. Sequência obrigatória

Leia e aplique `03_ROADMAP_FASEADO.md`:

**Fase 0** Descoberta, levantamento de impactos e baseline de testes (somente diagnóstico) → **Fase 1** Infraestrutura visual e shell → **Fase 2** Listagem, filtros e responsive → **Fase 3** Item 04B + QC/ações de leitura → **Fase 4** Preparação 04A + stepper + montagem → **Fase 5** Importação QC JSON em lote → **Fase 6** Edição/chegada/reembolso/ações complementares → **Fase 7** QA final, acessibilidade, regressão e handoff.

Cada fase inclui **desktop e mobile** onde fizer sentido. Não deixe o mobile como um polimento opcional de última hora. A ordem pode mudar SOMENTE após você justificar uma dependência real e eu aprovar a alteração.

## 8. Entregável obrigatório da Fase 0 (primeira resposta)

Sem modificar a implementação ainda, produza:

1. **Mapa do projeto:** arquivos/rotas/components afetados, tecnologias, estilo e API real.
2. **Comparação AS-IS vs. Penpot:** o que já existe, o que falta, o que será reutilizado, divergências e componentes de alto risco.
3. **Inventário do QC:** pontos de entrada, JSON existente (se houver), associações de fotos, dados imutáveis, permissões, tratamento de duplicidade e testes já presentes.
4. **Mapeamento da seleção:** origem do saldo disponível, vínculo a pacote, máximo/mínimo, concorrência e lógica atual de montagem.
5. **Plano faseado revisado:** tarefas por bloco, dependências, ordem de PRs se útil, estimativa relativa (P/M/G) e critérios verificáveis.
6. **Baseline de qualidade:** lint, typecheck, testes, build disponíveis; resultados executados com logs resumidos. Se não for possível rodar, diga por quê.
7. **Riscos e perguntas bloqueantes:** apenas decisões que realmente dependam de mim; proponha opções e trade-offs.

Encerre com a frase: **`FASE 0 CONCLUÍDA — AGUARDANDO APROVAÇÃO DE GABRIEL PARA INICIAR A FASE 1.`**

## 9. Modelo de resposta obrigatório em toda fase implementada

**Fase N · [nome] — Entrega para aprovação**

- **Implementado** (por bloco; comportamento e valor entregue).
- **Diferenças para o Penpot** (idealmente nenhuma; se houver, listar e justificar).
- **Evidências** (capturas comparativas desktop/mobile e roteiro de reprodução; não produzir imagens com dados sensíveis reais).
- **Validações executadas** (comando, resultado, cobertura, casos-limite e falhas preexistentes separadas).
- **Arquivos/áreas alteradas** e eventual migração (sem “limpeza” fora do escopo).
- **Riscos, pendências e dívida técnica** (separar bloqueadores de observações).
- **Critérios de aceite** da fase, cada um marcado `OK`, `PENDENTE` ou `BLOQUEADO` com evidência.
- **Aprovação requerida**: pergunta objetiva e explícita, seguida de **`AGUARDANDO APROVAÇÃO DE GABRIEL PARA INICIAR A FASE N+1.`**

## 10. Critério de conclusão total

Somente declarar a tela de Pedidos concluída após **Fase 7 aprovada por mim**, evidência visual nos principais tamanhos de viewport, cenários felizes/erros/limites, paridade desktop/mobile, zero drawers laterais no mobile, expansão integral da tabela no desktop sem drawer, stepper com limites, QC JSON real e associação preservada, ações de detalhe de um único item, acessibilidade básica e ausência de regressões críticas nas funcionalidades atuais. Deploy/merge continuam dependentes de autorização distinta.
