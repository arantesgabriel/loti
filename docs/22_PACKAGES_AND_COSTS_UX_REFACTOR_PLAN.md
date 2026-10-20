# Plano de refatoração — descoberta progressiva em Pacotes e custos

Data: 07/10/2026. Status: refatoração executada e validada em 07/10/2026.

Este plano refina a implementação existente do [plano 21](21_PACKAGES_AND_COSTS_PLAN.md). Mantém as regras financeiras confirmadas e a escolha visual [A + B na estrutura, C nos formulários e D no mobile](design/PACKAGES_AND_COSTS_REFERENCES.md). A mudança central é organizar a experiência em **resumo → descoberta de seção → detalhamento → edição contextual**.

## 1. Objetivo e limites

Permitir que a pessoa entenda o andamento financeiro e encontre a próxima tarefa sem percorrer tabelas e formulários completos. A tela deve continuar permitindo consulta e edição em qualquer ordem; descoberta progressiva não será um assistente com etapas bloqueadas.

Escopo: detalhe do acompanhamento, seus formulários, apresentação dos valores derivados e testes das jornadas afetadas. A lista de acompanhamentos só muda se necessário para manter a terminologia consistente.

Preservar histórico imutável, autorização server-side, cálculos em centavos, percentuais capturados, rateio por unidade física, proporções dos participantes, confirmação de pagamentos, encerramento e reabertura. Não adicionar rotas, dashboard, pagamentos reais, rastreamento automático ou novas dependências de UI. Não há necessidade esperada de migração de schema.

## 2. Evidências da auditoria

A inspeção visual ocorreu no Codex Browser, em desktop e mobile, no acompanhamento `5b0a4e10-3ca1-4bc8-ad70-b1d4c5f12007`. Formulários foram abertos para análise e cancelados. Os dados desse acompanhamento são referência de observação, não uma fixture para testes.

| Problema observado | Consequência | Mudança proposta |
| --- | --- | --- |
| Pagamento, tabela financeira, pacotes e pessoas aparecem completos | Alto volume de informação antes de entender o que fazer | Três seções expansíveis com resumos úteis |
| Pagamento dos produtos aparece antes de preencher suas bases | Valores pendentes e botão desabilitado sem orientação | Colocar pagamento dentro de Produtos e pagamento; explicar o requisito faltante |
| “Finalizada” e “Em andamento” próximos | Confusão entre compra e custos | “Compra finalizada” e “Custos abertos/encerrados” |
| Total geral parcial positivo; pessoas com R$ 0,00 | Informação financeira enganosa | Expor parcelas conhecidas mesmo quando há componentes pendentes |
| Pacote abre com nome, estado e todas as quantidades editáveis | Consulta se mistura com manutenção | Resumo inicialmente fechado; conteúdo em leitura; edição explícita |
| Mobile transforma cada linha em vários pares comprimidos | Colisão de rótulos, rolagem longa e pouca hierarquia | Lista compacta própria para mobile e composição sob demanda |
| “2 pendência(s)” e produtos repetidos pouco distinguíveis | Não orienta a ação nem identifica a linha | Pendências específicas, variante e participantes identificáveis |
| “Encerrar custos” é primário desde o início | Destaca ação que ainda não pode ser concluída | Priorizar a próxima tarefa; promover encerramento quando elegível |
| Frete agrega base e taxa sem esclarecer | Comparação confusa com rateio por item | Separar base, taxa de pagamento e total a pagar |
| Formulário expõe peso, basis points e centavos técnicos | Exige conhecimento do modelo interno | Linguagem de divisão, percentuais e valores em BRL |

## 3. Contrato de experiência

### 3.1 Cabeçalho e resumo permanente

- Nome da compra, data de finalização e estados separados: compra e acompanhamento de custos.
- Total conhecido com rótulo **Total parcial** enquanto houver valores/composição por resolver; **Total final** quando todas as bases estiverem resolvidas. Pagamento pendente não torna um valor conhecido desconhecido.
- Pendências acionáveis e uma ação principal contextual, por exemplo `Preencher fretes China` ou `Conferir pagamento dos produtos`.
- Quando elegível, a ação principal passa a `Encerrar custos`. Antes disso, eventual acesso ao encerramento explica o que falta. A validação definitiva continua no servidor.
- Em acompanhamento encerrado, consulta continua disponível; reabertura mantém confirmação e motivo.

### 3.2 Três seções inicialmente recolhidas

| Seção | Exemplo de resumo | Conteúdo ao abrir |
| --- | --- | --- |
| Produtos e pagamento | 8 produtos · 8 unidades · 7 fretes China por informar · Pagamento pendente | Produtos compactos, composição dos custos e pagamento dos produtos |
| Pacotes | 1 pacote · 8/8 unidades distribuídas · 2 pagamentos pendentes | Lista de pacotes; conteúdo e cobranças por pacote |
| Divisão por pessoa | 5 participantes · Valores parciais | Totais conhecidos por pessoa e detalhamento da composição |

Os números acima são ilustrativos: calcular produtos, unidades, participantes e pendências com os dados reais. Não confundir quantidade de linhas com unidades físicas. Pessoas sem participação não precisam ocupar a lista de divisão.

Cada seção pode abrir independentemente. Atualizações dos dados preservam a expansão e o contexto de navegação; não fechar tudo após salvar. A ação principal abre a seção correta e posiciona o foco no alvo relevante. Fazer isso após ação explícita, sem deslocar a página em cada atualização.

Cabeçalhos são botões acessíveis com `aria-expanded`, `aria-controls`, título, resumo e indicador de abertura. O recolhimento remove os controles internos da ordem de foco. Conteúdo essencial do resumo permanece visível em 320px, podendo quebrar linhas.

### 3.3 Vocabulário de estados

- **Por informar**: falta um valor ou método necessário.
- **A pagar**: valor resolvido, pagamento ainda não confirmado.
- **Pago**: confirmação manual registrada.
- **Sem cobrança**: custo explicitamente inexistente; não exige confirmação de pagamento.
- **Parcial**: soma apenas dos componentes conhecidos, com pendências indicadas.
- **Em preparação / Enviado / Recebido**: somente estado logístico.

Não usar apenas cor para distinguir estados. Nunca substituir valor desconhecido por zero. Zero informado e sem cobrança mantêm suas próprias semânticas.

## 4. Pontos atuais de alteração

| Arquivo | Responsabilidade na refatoração |
| --- | --- |
| `src/components/packages/package-cost-detail-screen.tsx` | Hierarquia, expansão, próxima ação, produtos, pacotes, divisão e formulários |
| `src/components/packages/package-cost-client.ts` | Tipos de leitura e formatação/parsing, se necessário |
| `src/lib/domain/package-cost-calculations.ts` | Parcelas parciais conhecidas, preservando o rateio por componente |
| `src/lib/domain/package-cost-reading.ts` | Agregação por pessoa e dados derivados para resumos |
| `src/app/globals.css` | Layout das seções, listas, tabela detalhada, formulários e mobile |
| `tests/unit/package-cost-calculations.test.ts` | Soma parcial por participante e arredondamento |
| `tests/integration/package-costs.test.ts` | Contrato de leitura, estados financeiros e invariantes |
| `tests/e2e/packages.spec.ts` | Descoberta, edição contextual e jornada responsiva |

Extrair componentes pequenos por responsabilidade conforme as fases: seção expansível, seção de produtos, resumo/detalhe de pacote e divisão por pessoa. Manter carregamento e coordenação de mutações na tela. Reutilizar Surface e Confirm existentes; usar apresentação contextual em sheet onde o componente permitir. Não criar um framework de formulários ou duplicar cálculo financeiro no cliente.

## 5. Execução faseada

### Fase 0 — Baseline e contrato de apresentação

1. Ler AGENTS.md, PROMPT_ONE_SHOT.md, documentação canônica e planos 20–22. Conferir o código real antes de alterar.
2. Inspecionar o diff e preservar trabalho de terceiros. Registrar os checks existentes e suas falhas anteriores à refatoração.
3. Capturar baseline desktop/mobile e identificar estados disponíveis em fixtures: valores pendentes, conhecidos, sem cobrança, pagos, múltiplos pacotes, compartilhamento e encerrado.
4. Definir dados derivados necessários aos resumos e à próxima ação; usar identificadores estáveis para seus alvos.

**Saída:** mapa das alterações e fixtures reutilizáveis. Nenhuma migração ou alteração de produção.

### Fase 1 — Corrigir totais parciais e pendências

O cálculo já distribui componentes conhecidos, mas retorna a parcela completa como `null` quando há componente pendente. A leitura agrega somente parcelas completas; essa combinação pode produzir R$ 0,00 por pessoa indevidamente.

1. Expor separadamente parcela conhecida e parcela final por participante; preservar `null` na parcela final enquanto não for determinável.
2. Somar parcelas conhecidas por pessoa a partir do rateio de cada componente. Manter ordenação estável e distribuição exata dos centavos; não ratear novamente o total agregado.
3. Se a proporção estiver indefinida, sinalizar parcela ainda não determinável. Mostrar a existência de valores não distribuídos; não atribuir zero a uma pessoa nem prometer que todos os totais pessoais já conciliam.
4. Quando todas as proporções forem válidas, exigir soma das parcelas conhecidas = total geral conhecido. Garantir a conciliação final quando resolvido.
5. Produzir resumos específicos de dados faltantes e pagamentos pendentes. Contar também Receita conhecida e ainda não paga, hoje omitida do resumo de pagamento do pacote.

**Aceite:** custos conhecidos aparecem na divisão mesmo com taxas pendentes; desconhecidos continuam distintos de zero; testes cobrem mistura de conhecido/pendente/sem cobrança, proporção indefinida e sobra de centavos. Nenhuma alteração das bases de incidência das taxas.

### Fase 2 — Resumo e descoberta das seções

1. Implementar cabeçalho com estados separados, total e próxima ação.
2. Agrupar os conteúdos nas três seções e recolhê-las inicialmente, com resumos suficientes para localizar a informação.
3. Ordenar a próxima ação de forma previsível: bases de produto/China e composição faltantes; método dos produtos; pagamento dos produtos; unidades sem pacote; valores/métodos dos pacotes; pagamentos dos pacotes; encerramento. Todos os demais acessos permanecem disponíveis.
4. Centralizar essa escolha em uma função derivada dos dados, sem lógica de cobrança duplicada. Retornar texto e alvo da ação, sem efetuar mutação.
5. Preservar expansão após salvar e restaurar foco ao fechar formulários. Explicar botões impedidos por dados faltantes.

**Aceite:** a primeira viewport permite entender estado, total e próxima tarefa; acionar o CTA apenas abre/foca o destino. Navegação por teclado funciona. Nenhum pagamento é confirmado automaticamente.

### Fase 3 — Produtos e pagamento contextual

1. Exibir inicialmente marcador SVG, nome, variante, quantidade, participantes e total parcial/final da linha, com pendência específica.
2. Disponibilizar `Ver composição dos custos`. No desktop, manter tabela financeira detalhada com números alinhados; no mobile, abrir composição legível em detalhe contextual, sem reproduzir todos os campos na lista.
3. Identificar linhas repetidas pela variante e participação; não unir snapshots distintos pelo nome.
4. Posicionar pagamento após os produtos e mostrar base = produtos + fretes China, taxa capturada e total a pagar. Se a base estiver incompleta, indicar os campos que faltam.
5. Separar edição de preço/frete de leitura. Rotular explicitamente valores por unidade e total da linha.
6. Ocultar controles de divisão quando há apenas uma pessoa. Em compartilhados, oferecer `Ajustar divisão` sob demanda, preservando a proporção original.

**Aceite:** nenhuma alteração no snapshot; mudança de base paga mantém a confirmação existente de retorno a pagamento pendente; cancelar edição não altera dados. A lista mobile permanece compacta e sem colisões de texto.

### Fase 4 — Pacotes como consulta com edição explícita

1. Iniciar cada pacote recolhido. Resumo: nome, estado logístico, unidades e pendências financeiras específicas.
2. Ao abrir, mostrar conteúdo em leitura e cobranças Frete Brasil/Receita. Distinguir valor-base, taxa de pagamento e total a pagar; Receita não recebe taxa de transação.
3. Introduzir ações explícitas `Editar pacote`, `Editar conteúdo` e `Informar/Editar frete` ou `Informar/Editar Receita`. Não deixar toda a grade de quantidades aberta por padrão.
4. No editor de conteúdo, mostrar comprado, neste pacote, nos outros pacotes e disponível. Permitir divisão por unidades sem torná-la obrigatória.
5. Preservar o contrato atual de salvamento das alocações globais: editar um pacote não pode apagar as atribuições dos demais. Manter validação atômica de quantidade e revisão no servidor.
6. Isolar rascunhos de edição da atualização geral da tela; salvar outra cobrança não pode descartar silenciosamente quantidades ainda não salvas. Oferecer salvar/cancelar explícitos.

**Aceite:** consultar um pacote não expõe um formulário completo; cancelar não gera gravação. Testes cobrem vários pacotes, divisão 1+2 de uma linha com 3 unidades, preservação de atribuições e conflito de revisão.

### Fase 5 — Divisão, linguagem e responsividade

1. Mostrar pessoa, unidades pessoais/participações compartilhadas quando úteis, total conhecido e indicação de parcial. Abrir detalhamento por produtos e componentes sob demanda.
2. Explicar proporções em linguagem humana. Percentuais em porcentagem; proporção derivada de valores fixos identificada como proporção original, sem sugerir que a parcela continuará fixa quando os custos mudarem.
3. Usar BRL e percentuais no padrão pt-BR. Separar helpers de exibição dos valores internos dos inputs; conferir consumidores existentes antes de alterar helpers exportados. Aceitar vírgula conforme os parsers do app, mantendo validação exata.
4. Resolver espaçamento, quebra de rótulos, alinhamento e áreas de toque de pelo menos 44px nos controles principais. Separar lista mobile e tabela detalhada sem duplicar fórmulas ou criar controles ocultos focáveis.
5. Dar nome acessível às ações com ícones, especialmente encerramento. Garantir foco visível, retorno de foco, leitura dos estados e reduced-motion em transições.

**Aceite:** não há texto técnico como basis points/peso em fluxos comuns; nenhuma colisão ou overflow de página em 320/390px. Manter Geist, cores, SVGs e ilha mobile do Loti.

### Fase 6 — Validação e handoff

1. Atualizar E2E para abrir seções pelos nomes e roles; reduzir dependência de seletores de classes como `.cost-table`.
2. Validar jornada completa: compra finalizada → custos → preencher China → método → pagar produtos → distribuir unidades → frete → Receita/sem cobrança → pagamentos → encerrar → reabrir com motivo.
3. Cobrir descoberta por CTA, edição/cancelamento, preservação da expansão, fechamento de Surface e retorno de foco; testar acompanhamento encerrado em leitura.
4. Inspecionar 320/390/768/1024/1440px. Capturar screenshots 390/1440px da visão inicial, produtos, pacote aberto e formulário de cobrança.
5. Executar lint, typecheck, testes unitários/integrados afetados, E2E das jornadas afetadas e build. Ampliar checks somente diante de alteração relevante ou falha.
6. Atualizar documentação visual e relatório de implementação com resultado, evidências e limitações restantes. Não declarar pronto com divergência de total ou regressão de pagamento.

**Saída:** refatoração verificável, screenshots, checks e handoff. Nenhuma publicação ou migração em produção sem autorização específica.

## 6. Critérios finais de aceite

- A visão inicial mostra resumo e três portas de entrada, sem tabela financeira ou editor de quantidades aberto.
- A pessoa entende o que falta e chega ao alvo por uma ação; pode explorar qualquer seção em qualquer ordem.
- Totais conhecidos por pessoa conciliam com o geral quando há proporções válidas; valores não determináveis são explícitos.
- Produtos repetidos, unidades físicas e participantes são identificáveis.
- Frete-base, taxa e total a pagar não se confundem; Receita permanece sem taxa de transação.
- Alterações, cancelamentos, pagamentos, encerramento e reabertura preservam regras e confirmações existentes.
- UI mantém contexto após mutações e protege rascunhos contra descarte silencioso.
- Mobile tem listas compactas, detalhes legíveis, controles acessíveis e navegação existente sem clipping.

## 7. Instrução de handoff ao executor

> Execute este plano sobre a implementação existente, em incrementos verificáveis, preservando alterações de terceiros. Comece pela correção dos totais parciais antes de reorganizar a interface. Mantenha as regras do plano 21 e a identidade visual aprovada; a composição inicial passa a seguir descoberta progressiva. Continue entre as fases depois dos checks pertinentes. Não publique, não migre produção e não acrescente funcionalidades fora deste escopo. Entregue screenshots desktop/mobile e evidências dos testes.

## 8. Registro de execução

- Totais conhecidos por participante passaram a ser calculados componente a componente; a parcela final segue pendente quando falta valor ou proporção. Valores conhecidos sem divisão definida são exibidos separadamente, sem inventar parcelas iguais.
- A tela abre com resumo e três seções recolhidas. A próxima tarefa abre a seção e o editor correspondentes. Produtos e pagamento compartilham a seção; detalhes e edições aparecem sob demanda.
- Pacotes mostram primeiro resumo e conteúdo somente leitura. Metadados, alocações e cobranças têm ações de edição explícitas, com salvar/cancelar. Outras alocações são mantidas ao salvar uma divisão.
- Percentuais visíveis seguem pt-BR; campos numéricos continuam usando representação de entrada compatível e aceitam vírgula ou ponto no parser. A lista compacta permanece até 1199px para não ultrapassar a área útil com a tabela financeira.
- Ações de reabertura têm nome acessível; a jornada E2E cobre foco contextual, retorno de foco, cancelamento, leitura encerrada e ausência de overflow em 320/390/768/1024/1440px.
- Capturas verificadas estão em `artifacts/qa/packages-costs-ux/`: visão inicial, produtos, composição, pacote aberto e formulário de cobrança em 390/1440px.

**Verificações:** `npm run check` passou (TypeScript, ESLint, 148 testes unitários/integrados e build); `npm run test:e2e` passou (23 cenários Chromium); a jornada de Pacotes e custos também passou novamente após o último ajuste visual. A refatoração UX não alterou schema nem adicionou migração; nenhuma migração de produção ou publicação foi executada.
