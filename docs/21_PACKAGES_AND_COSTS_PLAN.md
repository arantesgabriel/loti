# Plano faseado — Pacotes e custos

Status: planejamento para implementação por outro agente. A criação deste plano não implementa a funcionalidade nem autoriza publicação ou migração em produção.

Data: 07/10/2026. Base: auditoria estática do checkout e decisões do usuário nesta conversa. Estimativa: **9–14 dias úteis de desenvolvimento e validação**, supondo a base de rateio estabilizada; não é garantia de prazo.

## 1. Objetivo

Substituir o controle financeiro da antiga planilha: registrar progressivamente preço efetivo, frete até o armazém China, frete Brasil, taxa da Receita e taxa do método de pagamento; organizar os produtos em pacotes e mostrar o custo por produto e pessoa.

Criar a guia **Pacotes e custos**, acima de Histórico. Finalizar uma compra continua preservando seus produtos e liberando a próxima compra. O acompanhamento financeiro tem encerramento próprio.

## 2. Instruções ao executor

1. Ler `AGENTS.md`, a documentação na ordem indicada, `PROMPT_ONE_SHOT.md`, planos 18–20 e este plano. Conferir o estado real do rateio, schema, migrações e testes antes de trabalhar.
2. As regras abaixo são uma extensão solicitada pelo usuário. As antigas exclusões de frete, impostos e estados logísticos manuais não impedem esta extensão. Na fase 0, atualizar pontualmente a especificação para resolver os conflitos, preservando as demais exclusões.
3. Inspecionar `git status` e preservar alterações de terceiros. Durante a auditoria, o rateio foi alterado por trabalho externo: não assumir um baseline limpo nem incorporar essas mudanças em commits próprios.
4. Executar as fases em sequência e continuar autonomamente depois de verificar o incremento. Não implementar todo o módulo de uma vez nem pedir aprovação por fase.
5. Manter o app compilável e as jornadas existentes funcionais. Verificar typecheck, lint, testes e build após os incrementos pertinentes. Corrigir falhas antes de avançar. Commits dependem da autorização da tarefa executora e não devem incluir mudanças de terceiros.
6. Preservar Next.js, TypeScript, Tailwind/shadcn, Better Auth, Drizzle SQLite, Turso/libSQL, Zod, React Hook Form e Playwright. Não atualizar dependências sem necessidade comprovada.
7. Não aplicar migrações em produção nem publicar sem autorização específica. Aplicar migrações explicitamente em bancos locais descartáveis; nunca durante requests. Preparar o handoff operacional ao final.
8. Implementar apenas esta extensão: sem rastreamento automático, câmbio, integração com plataforma, transferências financeiras entre membros, pagamentos processados pelo app ou novo dashboard.

## 3. Decisões confirmadas pelo usuário

| Tema | Decisão |
| --- | --- |
| Ciclo | Compra finalizada; custos continuam abertos até encerramento próprio |
| Pacotes | Uma compra pode ter um ou vários pacotes |
| Unidades | Todas as unidades de uma linha juntas por padrão; divisão entre pacotes disponível quando necessária |
| Frete China | Valor manual por unidade; pode variar entre produtos/fornecedores |
| Frete Brasil | Total do pacote dividido igualmente entre unidades físicas |
| Receita | Total do pacote dividido igualmente entre unidades físicas, sem taxa de transação |
| Produtos | Taxa sobre valor efetivo dos produtos + respectivos fretes China |
| Frete Brasil pago | Possui sua própria taxa de transação |
| Métodos | Pix 1%; cartão 5%; padrões editáveis em Meu grupo |
| Configuração | Qualquer membro pode editar; alterações preservam percentuais de pagamentos anteriores |
| Simplicidade | Um único método no pagamento dos produtos da compra; evitar divisão dos produtos em cobranças/métodos diferentes |
| Taxa dos produtos | Distribuição proporcional à base de cada produto: produto + frete China |
| Preço efetivo | Inicializado pelo preço original, editável em Custos, sem alterar o histórico da compra |
| Compartilhamento | Preço efetivo e encargos seguem a proporção original dos participantes |
| Valores fixos | Converter valores originais em proporções; se não houver base positiva para inferir a proporção, exigir composição explícita |
| Moeda | BRL informado manualmente |
| Pagamentos | Controle manual de pendente/pago |
| Logística | Estados manuais em preparação, enviado e recebido |
| Ausência de custo | Distinguir pendente, sem cobrança e valor informado |
| Encerramento | Quando todos os valores constarem como pagos; sem cobrança resolve a obrigação sem pagamento |
| Correção | Reabertura com confirmação e motivo; registrar autor e data |
| Colaboração | Qualquer membro edita; mostrar autor e data da última alteração |
| Histórico antigo | Iniciar custos explicitamente a partir de compras existentes |
| Nome | Pacotes e custos, entre Compra atual e Histórico |

A simplificação posterior sobre pagamentos substitui a resposta anterior que permitia agrupar produtos em pagamentos diferentes. Não implementar pagamento parcial por unidade, parcelamento ou múltiplos métodos para os produtos. O frete Brasil tem uma cobrança por pacote, com método próprio; isso foi mantido na consolidação da auditoria.

## 4. Padrões técnicos propostos para execução

Os detalhes desta seção completam o escopo com padrões de implementação; não são respostas literais do usuário. O executor pode ajustar a representação técnica, mantendo o comportamento e os invariantes.

### 4.1 Início e snapshots

- Um acompanhamento por compra, criado atomicamente na finalização, inclusive quando houver preços pendentes. Sua criação faz parte da transação de finalização.
- Para compras anteriormente finalizadas, disponibilizar `Iniciar custos`, idempotente. Não iniciar automaticamente todas as compras antigas pela migração.
- O acompanhamento fica vinculado ao workspace da compra; múltiplos acompanhamentos podem estar abertos enquanto existe uma única compra ativa.
- Copiar preços sugeridos e composição de participantes. Preservar nulos, nomes, quantidades e referências ao snapshot original. Não consultar favoritos para montar ou recalcular custos.
- Quantidade, participantes e dados do produto finalizado não são editáveis em Custos. Corrigir apenas valor efetivo, encargos, composição proporcional quando indispensável e organização dos pacotes.
- No rateio igual, guardar pesos iguais. No percentual, guardar os pontos-base originais. No fixo, guardar os valores originais como pesos inteiros; não converter arbitrariamente para percentuais de duas casas e perder precisão.
- Valor efetivo e frete China são unitários por linha. Quantidade multiplica ambos. Produtos de fornecedores/preços distintos devem ser linhas distintas na compra; não criar um editor de preços diferentes para unidades da mesma linha nesta extensão.

### 4.2 Pacotes e quantidade

- Nome simples editável, com sugestão `Pacote 1`, `Pacote 2`. Uma seleção de itens com quantidade resolve a divisão; não exigir uma linha visual para cada unidade.
- Guardar quantidade inteira positiva de cada item em cada pacote. A soma entre pacotes nunca pode exceder a quantidade comprada. Mostrar unidades ainda não atribuídas.
- Na experiência comum, criar um pacote e adicionar todas as unidades de uma vez. Ao adicionar uma linha, sugerir todas as unidades restantes; permitir ajustar.
- Internamente, definir uma ordem estável das unidades derivada de item, ordem persistida de alocação e quantidade. Os desempates financeiros não dependem de nomes, ordenação visual ou datas mutáveis. Não acrescentar números de série ou IDs físicos na UI.
- Reorganizações que afetam encargos precisam recalcular os pacotes afetados e invalidar suas confirmações de pagamento, conforme 4.4.
- Só excluir pacote vazio, em preparação, com seus encargos ainda pendentes. Para desfazer outras situações, exigir tratamento explícito dos valores e confirmação; não apagar silenciosamente uma cobrança paga.
- Mudança logística é manual e independente do estado financeiro. Não obrigar recebido para encerrar custos. Permitir corrigir estados enquanto aberto; não anexar código de rastreio.

### 4.3 Valores, cobranças e taxas

Separar duas dimensões:

- Estado do valor: `pending`, `known`, `no_charge`.
- Estado de pagamento: pendente ou pago; `paid_at` registra a confirmação. Sem cobrança não possui pagamento.

Um valor zero conhecido é diferente de desconhecido. Nunca tratar null como custo zero ou permitir marcar valor desconhecido como pago. Uma Receita sem cobrança resolve a obrigação; seu método e percentual são sempre ausentes.

Existem apenas três tipos de cobrança:

1. **Produtos:** uma por acompanhamento, com base na soma de preços efetivos e fretes China. Um método, percentual capturado e uma confirmação para toda a cobrança.
2. **Frete Brasil:** uma por pacote, incluindo sua taxa de transação no valor a pagar.
3. **Receita:** uma por pacote, sem taxa de transação.

Produtos e fretes China mantêm seus estados por linha; a cobrança conjunta só pode ser confirmada se todas as bases estiverem resolvidas. Não criar flags de pagamento conflitantes em cada produto. A coluna de pagamento de cada linha deriva da cobrança conjunta.

Configuração do grupo: padrões `pix_bps = 100` e `card_bps = 500`. Exigir inteiros entre 0 e 10.000, com entrada percentual até duas casas decimais. Capturar o padrão ao escolher o método da cobrança; guardar o percentual nesse registro mesmo antes de pago. Alterar a configuração não recalcula cobranças já registradas. Para aplicar um padrão novo a uma cobrança pendente, usar ação explícita com prévia. Não implementar cadastro de métodos adicionais nesta entrega.

Mostrar método, percentual, base, taxa em reais e total da cobrança antes de marcar pago. A taxa é derivada dos valores e do percentual capturado; não usar o padrão atual do grupo para reler pagamentos antigos.

### 4.4 Edições financeiras, encerramento e reabertura

- Enquanto aberto, editar cobrança ainda pendente é normal.
- Ao editar valores, método, percentual ou composição que afete uma cobrança paga, pedir confirmação e retornar todas as cobranças afetadas a pendente atomicamente. Informar claramente que será necessária nova confirmação de pagamento. Não preservar um selo pago para um total que mudou.
- Se só mudar a proporção entre pessoas e o total cobrado não mudar, atualizar a distribuição sem invalidar o pagamento externo. Não presumir que houve novo pagamento.
- Definir cobrança paga e encerrar usando o estado atual do servidor dentro da mesma transação. Não confiar em totais enviados pelo navegador.
- Encerrar somente se todas as unidades estiverem atribuídas, as bases dos produtos estiverem resolvidas, cada encargo de cada pacote estiver conhecido/pago ou sem cobrança e não houver proporção pendente. Esta cobertura impede omitir um produto ou pacote para aparentar que tudo foi pago.
- Estado logístico recebido não é obrigatório. Confirmação de encerramento explica o bloqueio de edição.
- Encerrado significa leitura somente para todo o acompanhamento, inclusive pacotes e pagamentos. Reabrir exige motivo não vazio e confirmação; registrar cada evento de reabertura com autor/data/motivo. Não modificar `purchases.status`.
- Registrar autor/data da última alteração e eventos de reabertura; não construir um ledger completo de todas as edições.
- Usar revisão inteira do acompanhamento e rejeitar mutação baseada em revisão desatualizada, com pedido de recarregar. Isso protege marcação de pagamento e fechamento contra edição concorrente; não implementar editor de conflitos ou realtime.

## 5. Contrato financeiro

### Fórmulas

Para item `i`, quantidade `q_i`, preço efetivo unitário `p_i` e frete China unitário `c_i`:

```text
produto_i = q_i × p_i
frete_china_i = q_i × c_i
base_i = produto_i + frete_china_i
base_produtos = soma(base_i)
taxa_produtos = arredondar_centavo(base_produtos × percentual_produtos / 10.000)
taxa_frete_pacote = arredondar_centavo(frete_pacote × percentual_frete / 10.000)
custo_i = produto_i + frete_china_i + taxa_produtos_i
          + soma(frete_brasil_i + taxa_frete_i + receita_i em cada pacote)
```

- Arredondar cada taxa de cobrança uma única vez, metade para cima, com aritmética inteira. Exemplo: base de R$ 0,50 a 1% produz taxa de R$ 0,01.
- Distribuir a taxa dos produtos proporcionalmente às bases dos itens, pelo maior resto; empate pela ordem estável. Se a base total conhecida for zero, a taxa é zero e não ocorre divisão por zero.
- Frete Brasil, sua taxa e Receita são componentes separados distribuídos por unidade física do pacote, com centavos restantes em ordem estável. Somar as parcelas de unidades para mostrar o total da linha naquele pacote.
- Distribuir cada componente de custo do item entre participantes pelos pesos preservados, com maior resto e desempate pela ordem dos participantes. Somar componentes para obter total por pessoa; não arredondar separadamente um total agregado que contradiga o detalhamento.
- Usar centavos/pesos inteiros e intermediários seguros (`BigInt`, por exemplo). Serializar apenas números inteiros seguros. Validar limites de cada entrada e das somas; encargos podem superar o limite atual de preço unitário, portanto definir limites explícitos para custos de pacote e totais.
- Se base de taxa estiver incompleta, mostrar a taxa como pendente; não apresentar uma taxa parcial como valor final. Mostrar soma dos componentes conhecidos como total parcial, com pendências visíveis.
- Coluna **Taxa de pagamento** soma taxa dos produtos e taxas de frete Brasil atribuídas ao item; o detalhe discrimina as etapas. A Receita não recebe percentual.
- Resumos gerais contam cada unidade e cada custo uma vez. Resumos pessoais mostram a parcela correspondente sem duplicar a compra.

Invariantes: soma de parcelas = componente integral; soma dos componentes = custo final; soma por pessoa = total geral; nenhuma taxa sobre Receita ou sobre a própria taxa.

## 6. Modelo e pontos de integração

Representação sugerida; validar nomes finais na fase 0:

| Entidade | Campos/regras principais |
| --- | --- |
| `workspace_cost_settings` | workspace PK/FK; percentuais Pix/cartão; autor/data da alteração |
| `purchase_cost_trackings` | compra única FK; workspace; aberto/encerrado; revisão; datas; autor/data última alteração |
| `purchase_item_costs` | acompanhamento + item únicos; preço efetivo unitário; frete China unitário; estado de cada valor; ordem financeira |
| `purchase_cost_participants` | item de custos + pessoa únicos; peso inteiro; ordem estável; composição capturada independente |
| `purchase_packages` | acompanhamento; nome; estado manual; ordem estável; datas |
| `purchase_package_items` | pacote + item de custos únicos; quantidade; ordem; validação de mesma compra |
| `purchase_cost_charges` | acompanhamento; tipo; pacote opcional; valor/estado para frete/Receita; método/percentual; pago em/por |
| `purchase_cost_reopenings` | acompanhamento; autor; data; motivo |

Usar FKs, CHECKs de inteiros/estados, índices de leitura e unicidade da cobrança de produtos por acompanhamento e de frete/Receita por pacote. Validar somas e relações entre linhas no serviço transacional, não apenas em CHECKs de linha. Evitar campos redundantes para totais derivados e para estado pago; dinheiro informado pelo usuário e percentuais/pesos capturados são persistidos.

Pontos existentes a revalidar:

- `src/lib/db/schema.ts`, `drizzle/`, `scripts/verify-database.ts`: migração aditiva e verificação.
- `src/lib/domain/purchase-services.ts`: criação atômica do acompanhamento na finalização; sem permitir editar os produtos depois.
- `src/lib/domain/authorization.ts`: helpers para membro autorizado e acompanhamento aberto, separados de `requireEditablePurchase`.
- `src/lib/domain/cost-sharing.ts` e `money.ts`: reutilizar princípios e parsers; adicionar cálculo por pesos sem mudar o contrato fixo do histórico.
- `src/lib/domain/services.ts`, `src/app/api/app/route.ts`, `src/components/workspace-provider.tsx`: leituras/tipos/operações. Avaliar endpoints de detalhe para evitar carregar todos os pacotes no payload global; manter um único mecanismo de atualização coerente.
- `src/components/layout/app-shell.tsx` e `src/app/globals.css`: quarta guia e ilha mobile.
- `src/components/group-screen.tsx`, `src/app/api/group/route.ts`: configurações, preservando os contratos de convites. Usar endpoint dedicado se simplificar a separação.
- `src/components/purchase/history-screen.tsx`: iniciar/abrir acompanhamento antigo e link no detalhe.
- Rotas sugeridas: `/packages` e `/packages/[trackingId]`.

Todas as leituras e mutações exigem sessão/membership. Resolver o workspace pelo recurso autorizado; não confiar em `workspaceId` do payload. Validar Zod, origem confiável e relações compra/item/pacote/participantes no servidor. IDs externos, encerramento e revisão divergente devem falhar sem gravação parcial.

## 7. Experiência de uso

Lista: acompanhamentos abertos/encerrados, nome da compra, número de pacotes, total conhecido/parcial e pendências. Não adicionar dashboard.

Detalhe: visão geral da compra, pagamento dos produtos, lista de produtos/custos, pacotes e resumo por pessoa. No desktop, tabela com produto/variação, quantidade, valor efetivo, frete China, taxa de pagamento, frete Brasil, Receita e total. Método/percentual ficam junto à cobrança e no detalhamento.

No mobile, resumo compacto por produto e formulário/detalhe em drawer; não comprimir todas as colunas da planilha numa tela estreita. Usar os marcadores SVG existentes, labels claros, teclado, erros acessíveis e estados pendentes explícitos. Preservar a ilha arredondada; nome curto mobile pode ser `Pacotes`, com label acessível completo `Pacotes e custos`.

Pacote: selecionar itens/quantidades, editar frete Brasil, escolher método, registrar Receita e pagamentos, alterar etapa manual. Resumo por pessoa inclui parcelas dos produtos e encargos, com acesso ao detalhamento; não confundir com saldo de dívida ou acerto entre pessoas.

## 8. Fases de implementação

### Fase 0 — baseline e contrato coerente

**Entrega:** baseline conhecido e especificação sem conflitos.

- Ler os documentos e mapear mudanças em andamento. Confirmar a versão estabilizada do rateio e migrações aplicadas em teste.
- Atualizar `AGENTS.md`, `PROMPT_ONE_SHOT.md` e docs 01–05, 08–09, 11–12 e 15 apenas onde necessário para reconhecer esta extensão. Referenciar o plano, sem duplicar todos os detalhes ou desfazer o escopo anterior de outras funcionalidades.
- Fixar entradas/leituras, estados, limites financeiros, revisão, cobrança conjunta e desempates. Documentar que parcelas fixas históricas não são reescritas.
- Executar baseline de lint/typecheck/testes/build. Registrar e resolver impedimentos; não atribuir falhas anteriores à feature.

**Aceite:** contratos e padrões conhecidos; nenhuma dúvida sobre linha versus unidade, custos versus histórico ou pagamento externo versus acerto pessoal.

### Fase 1 — acompanhamento e preço efetivo de ponta a ponta

**Entrega:** uma compra finalizada aparece em Pacotes e custos com preço efetivo editável.

- Criar migração aditiva para acompanhamento, custos por item e pesos capturados; manter os registros antigos intactos.
- Implementar início idempotente em compra antiga e criação atômica na finalização de nova compra.
- Implementar autorização, revisão, leitura e edição de preço efetivo/frete China por unidade.
- Criar lista/detalhe básicos e quarta guia; ligar Histórico ao acompanhamento.
- Provar isolamento, preservação de snapshot, nulo/zero, quantidade e rateio capturado.

**Aceite:** editar Custos não muda favorito, compra ou preço original; finalizar libera próxima compra; iniciar duas vezes cria um só acompanhamento. App e jornadas anteriores passam.

### Fase 2 — taxa e pagamento dos produtos

**Entrega:** cobrança conjunta de produtos completa, com taxa configurável e parcelas por pessoa.

- Adicionar settings e cobranças; preencher defaults 1%/5% sem alterar cobranças existentes.
- Expor configuração em Meu grupo e seleção de método no pagamento conjunto.
- Implementar cálculo puro por pesos, taxa sobre produtos + frete China, arredondamento e coluna de taxa.
- Implementar marcação pago com total confirmado e invalidação quando editar valores pagos.
- Testar preço corrigido, valores fixos convertidos em proporções, taxa pendente, zero e mudança do padrão.

**Aceite:** R$ 1.000 de base no Pix = R$ 10 de taxa e R$ 1.010 a pagar; padrão alterado não muda essa cobrança; todos os subtotais fecham em centavos.

### Fase 3 — um pacote com frete Brasil e Receita

**Entrega:** jornada comum completa, todos os itens no mesmo pacote.

- Adicionar pacote, itens por quantidade e cobranças frete/Receita com relações validadas.
- Criar ação para incluir todos os itens e sugerir quantidades restantes.
- Implementar frete Brasil/Receita por unidade, taxa própria do frete e ausência de taxa da Receita.
- Expor estados de valor, pagamento e logística manual; total por produto e pessoa.
- Testar 3 RAMs + 1 camiseta, encargos pendentes/isentos e método próprio do frete.

**Aceite:** frete de R$ 400 para quatro unidades atribui R$ 300 às RAMs e R$ 100 à camiseta; não divide em duas linhas. Receita segue o mesmo critério.

### Fase 4 — vários pacotes e divisão opcional de unidades

**Entrega:** roupas/eletrônicos em pacotes diferentes, inclusive divisão de uma linha quando necessária.

- Permitir criar vários pacotes, selecionar quantidade por item e mostrar saldo não atribuído.
- Validar soma das quantidades atomicamente; tentativas concorrentes não podem alocar a mesma quantidade duas vezes.
- Definir ordem estável para distribuição dos centavos. Preservar resultados ao recarregar ou mudar apenas nomes/ordenação visual.
- Reorganizar itens com confirmação/invalidação financeira pertinente, sem cobrar frete China ou taxa de produtos novamente.
- Provar cálculos e resumo geral com métodos e encargos diferentes por pacote.

**Aceite:** três RAMs podem ir 1+2 entre pacotes; somam três unidades, um custo original de produto e suas parcelas de encargos. Quatro unidades de uma linha de três são rejeitadas sem persistência parcial.

### Fase 5 — encerramento, reabertura e concorrência

**Entrega:** acompanhamento encerrável e corrigível sem comprometer histórico.

- Implementar fechamento validando cobertura de unidades, resolução dos valores/proporções e pagamentos.
- Bloquear todas as mutações quando encerrado, inclusive requests diretos e mudança de logística.
- Implementar reabertura com motivo/evento. Preservar flags pago enquanto seus valores não forem alterados.
- Registrar autor/data de alterações; usar revisão em todas as escritas do acompanhamento.
- Testar edição versus confirmação de pagamento/encerramento com duas conexões ao mesmo banco libSQL. Revisão desatualizada deve falhar, sem misturar estados.
- Injetar falhas na finalização/início, redistribuição e reabertura para comprovar rollback.

**Aceite:** pendência impede fechar; Receita sem cobrança permite; pacote ainda não recebido pode ter custos encerrados; reabrir não reabre a compra nem altera o histórico.

### Fase 6 — validação integrada e handoff

**Entrega:** feature revisável e pronta para publicação autorizada posteriormente.

- Executar lint, typecheck, unit/integration, Playwright e build. Conferir migração em banco vazio e banco anterior com compras ativas/finalizadas.
- Verificar jornada completa com duas pessoas, produto compartilhado, vários pacotes, preço corrigido, mudança de settings e reabertura.
- Inspecionar 320/390/768/1024/1440px, teclado, drawers, tabelas, estados e ilha de quatro destinos. Não aceitar overflow horizontal na página.
- Revisar regressões em favoritos, compra/histórico, rateio, Meu grupo/convites e perfil.
- Atualizar `docs/IMPLEMENTATION_REPORT.md` com checks reais, arquivos e limitações.
- Preparar backup, ordem de migração explícita/deploy, smoke test e estratégia de recuperação. Não usar rollback destrutivo para descartar dados novos; preferir correção em frente ou restauração coordenada com análise dos registros posteriores ao backup.

**Aceite:** matriz abaixo passa; ausência de alteração nos snapshots históricos; nenhuma feature além deste plano.

## 9. Matriz mínima de testes

| Cenário | Resultado obrigatório |
| --- | --- |
| Nova compra finalizada | Acompanhamento único aberto e próxima compra permitida |
| Compra antiga / início repetido | Um acompanhamento; preços iniciais preservados; encargos pendentes |
| Falha ao iniciar durante finalização | Rollback da finalização e da criação do acompanhamento |
| 3 RAMs a R$ 100 + frete China unitário R$ 10 | Base R$ 330; Pix R$ 3,30; pagamento R$ 333,30 |
| Frete Brasil R$ 500 Pix | Taxa R$ 5; pagamento R$ 505 |
| Receita R$ 100 | Pagamento R$ 100, sem taxa; método/percentual rejeitados |
| 3 RAMs + camiseta, frete R$ 400 | RAMs R$ 300 e camiseta R$ 100 |
| R$ 100 entre 3 unidades | R$ 33,34 + R$ 33,33 + R$ 33,33, ordem estável |
| Base R$ 0,50 × 1% | Taxa R$ 0,01, metade para cima |
| Taxa proporcional em bases desiguais | Soma exata da taxa da cobrança; maior resto determinístico |
| RAMs 1+2 em pacotes | Três unidades; produto/China/taxa de produtos contados uma vez |
| Soma de pacotes excede quantidade | Rejeição, inclusive concorrente |
| Parcela original fixa 120/80; preço real 180 | Produto 108/72; encargos 60%/40% |
| Peso fixo total zero ou base ausente | Exigir composição explícita; não inferir divisão silenciosa |
| Custos incompletos | Total parcial e campos pendentes; pagamento/finalização bloqueados |
| Zero versus sem cobrança | Estados distintos, valores conhecidos; sem pagamento obrigatório para sem cobrança |
| Padrão Pix muda de 1% para 2% | Cobrança registrada mantém 1%; nova seleção utiliza 2% |
| Valor de cobrança paga muda | Confirmação; pagamentos afetados retornam a pendente atomicamente |
| Apenas proporção pessoal muda | Total externo e pagamento preservados |
| Tudo pago; pacote enviado | Encerramento permitido independentemente de recebido |
| Unidade não atribuída / encargo pendente | Encerramento rejeitado |
| Acompanhamento encerrado | Toda mutação rejeitada até reabertura autorizada |
| Reabertura sem motivo | Rejeição; com motivo registra evento e preserva compra finalizada |
| IDs de outro workspace/compra | Rejeição no servidor sem vazamento/gravação |
| Revisão desatualizada | Conflito com orientação para recarregar; nenhuma escrita parcial |
| Nome de pessoa/favorito muda | Pesos, parcelas e dados de produto capturados preservados |
| Valores máximos / overflow | Validação explícita e aritmética segura |
| Mobile e desktop | Navegação acessível, unidades legíveis, sem imagens grandes ou página larga |

Não considerar totais da imagem da planilha como fixtures exatas: há divergências visíveis entre alguns componentes e valores finais. Usar as regras e exemplos deste plano como fonte das expectativas financeiras.

## 10. Prompt de execução sugerido

> Implemente a extensão descrita em `docs/21_PACKAGES_AND_COSTS_PLAN.md`. Leia primeiro `AGENTS.md` e os documentos exigidos, confira as mudanças existentes e estabilize o baseline de rateio sem sobrescrever trabalho de terceiros. Execute as fases em sequência, em incrementos verificáveis, atualizando os documentos canônicos na fase 0 para reconhecer o escopo aprovado. Continue autonomamente entre fases; rode os checks adequados e corrija falhas antes de avançar. Preserve os snapshots das compras finalizadas e a stack existente. Não publique nem aplique migrações em produção sem autorização específica. Entregue a implementação local, evidências de validação e instruções operacionais.
