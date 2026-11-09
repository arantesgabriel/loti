# Loti — Fase 2: descoberta de produto

Data de início: 21/10/2026. Autorização: “prossiga para a fase 2”.
Estado: descoberta concluída e entregáveis submetidos à aprovação final da Fase 2; Q43 respondida. Fase 3 não iniciada. Nenhuma implementação autorizada.

## Objetivo e fontes

Construir com o usuário os requisitos das cinco ferramentas candidatas, seus fluxos, regras, erros, necessidades compartilhadas, critérios de aceitação e prioridade inicial. Usar o pedido original, as evidências da Fase 1 e a skill oficial Matt Pocock `grill-with-docs`, com `grilling` e `domain-modeling`.

Preservar integralmente as funcionalidades atuais. Esta autorização não aprova uma arquitetura futura nem resolve automaticamente a separação Free/Pro e a monetização, que terão sua fase própria.

Não usar subagentes, conforme `02_REGRAS_DE_EXECUCAO.md`. A investigação de fatos será feita diretamente pelo agente principal; fatos consultáveis não serão transferidos ao usuário como perguntas.

## Árvore inicial de decisões

1. Público: definido como misto, atendendo leigos e pessoas que já importam e querem utilizar diretamente a ferramenta. Não adotar iniciante/ocasional como principal com experiente secundário.
2. Problema central: aprovado custo total explicável em reais antes de comprometer dinheiro.
3. Após 1 e 2: cenários concretos por ferramenta, fronteiras entre impostos/custo final/câmbio/rateio/referências e prioridade por valor.
4. Após cenários: entradas, saídas, estados desconhecidos, arredondamentos, fontes, validade e falhas.
5. Após contratos: autenticação necessária, salvamento, compartilhamento e eventual transferência conceitual para Gestão. Nenhuma escrita na Gestão está aprovada.
6. Após definição de valor e fluxos: critérios de aceitação, métricas de sucesso propostas e matriz consolidada para aprovação.

Decisões comerciais dependentes ficam registradas para a Fase 3, sem presumir assinatura individual ou coletiva. Capacidade, contratação e arquitetura detalhada permanecem para a Fase 4.

## Rodada 1 — questões independentes

### Q1 — Público prioritário

Pergunta: podemos priorizar no primeiro lançamento a pessoa física que importa para uso próprio pela HubBuy, sobretudo iniciante ou ocasional, atendendo usuários frequentes como público secundário?

Alternativas: iniciante/ocasional; importador frequente; organizador de compras coletivas. Todas podem continuar no horizonte, mas cada prioridade altera linguagem, complexidade e os cenários que precisam funcionar primeiro.

Recomendação de produto, ainda não aprovada: iniciante/ocasional como público principal. Favorece entradas explicáveis e resultados úteis sem exigir domínio prévio de custos/importação. Consequência: análises recorrentes e operações coletivas mais complexas podem não orientar a primeira versão. Não há pesquisa de demanda que confirme essa escolha nesta fase.

Resposta do usuário: deseja um meio-termo, atrativo tanto para leigos em importação quanto para quem já importa e só quer usar a ferramenta.

Estado: resolvida com ajuste à recomendação. A prioridade hierárquica proposta entre iniciante e experiente não foi aprovada. Organização específica da interface, ajuda opcional ou modos de uso ainda não foram definidos.

### Q2 — Problema central

Pergunta: podemos tratar “entender quanto a importação deve custar em reais e de onde vem cada parcela, antes de comprometer dinheiro” como o principal problema a resolver pelas novas ferramentas?

Alternativas: estimar o custo total; entender os tributos; organizar/dividir custos compartilhados. São problemas relacionados, mas cada um conduz a uma experiência inicial diferente.

Recomendação de produto, ainda não aprovada: custo total explicável como problema principal. Permite avaliar como impostos e conversão contribuem para uma decisão concreta e testar se as cinco candidatas merecem ferramentas independentes ou experiências conectadas. Consequência: é necessário distinguir claramente estimativa de custo efetivo e explicitar valores ainda desconhecidos. Isso não aprova uma calculadora unificada nem determina a ordem de lançamento.

Resposta do usuário: “q2 sim”.

Estado: aprovada. O problema principal é entender quanto a importação deve custar em reais e de onde vem cada parcela, antes de comprometer dinheiro.

## Rodada 2 — ferramentas e cenários

### Q3 — Entrada direta e conexão entre ferramentas

Pergunta: cada ferramenta deve poder ser usada diretamente, sem passar por um assistente obrigatório, com a opção de aproveitar seus valores no simulador de custo final?

Alternativas: ferramentas independentes sem reaproveitamento; ferramentas com entrada direta e conexão opcional; jornada guiada obrigatória.

Recomendação ainda não aprovada: entrada direta com conexão opcional, orientação acessível sob demanda e campos essenciais visíveis. Isso atende a intenção de uso direto e permite apoio para quem precisa. Reaproveitamento exige mapear campos, moedas, origem dos valores e diferenças entre resultados; não implica salvamento, conta, sincronização automática ou integração com Gestão. A especificação de navegação e UI será refinada na Fase 5.

Resposta do usuário: “concordo com ambas”, referente a Q3 e Q4.

Estado: aprovada entrada direta com conexão opcional entre ferramentas. Não aprova conta, persistência, sincronização automática ou escrita em Gestão.

### Q4 — Momentos atendidos pelo simulador de custo final

Pergunta: o simulador deve atender tanto a estimativa antes da compra quanto a atualização antes do envio, quando o produto já foi comprado e alguns custos reais já são conhecidos?

Alternativas: somente planejamento antes da compra; planejamento antes da compra e antes do envio; também apuração após conclusão da importação.

Recomendação ainda não aprovada: os dois primeiros momentos, distinguindo valores informados como reais de estimativas e despesas desconhecidas. Exemplo: permitir avaliar uma compra ainda não paga ou estimar o restante de uma compra já no armazém. É necessário evitar dupla contagem de despesas já pagas. Apuração pós-conclusão pode acrescentar sobreposição com Gestão e permanece pendente, sem exclusão definitiva.

Resposta do usuário: “concordo com ambas”, referente a Q3 e Q4.

Estado: aprovados os momentos antes da compra e antes do envio, distinguindo valores conhecidos/reais informados, estimativas e despesas desconhecidas. Apuração pós-conclusão não foi incluída nesta decisão.

## Rodada 3 — produtos e resultado financeiro da simulação

### Q5 — Entrada rápida e detalhamento por produto

Pergunta: o simulador deve aceitar tanto um valor total de produtos quanto uma lista detalhada, com quantidade e preço unitário por produto?

Alternativas: somente total agregado; somente lista de produtos; total agregado com detalhamento opcional.

Recomendação ainda não aprovada: total agregado com detalhamento opcional. Permite cálculo rápido para quem já tem o total e exploração de uma cesta para quem precisa montar a compra. Na entrada detalhada, os subtotais devem gerar a base dos produtos sem somar novamente um total agregado. Campos exatos, moedas e tratamento de nomes serão definidos nas rodadas seguintes; não há inclusão de cadastro de produtos, fotos ou importação de pedidos.

Resposta do usuário: “concordo”, em resposta à rodada Q5/Q6.

Estado: aprovada entrada por total agregado ou detalhamento opcional por quantidade/preço unitário; não somar ambos.

### Q6 — Custo completo e desembolso restante

Pergunta: além do custo total estimado, o simulador deve mostrar quanto ainda falta pagar, com marcação opcional das despesas já pagas dentro da própria simulação?

Alternativas: somente custo completo; custo completo e restante a pagar mediante informação manual.

Recomendação ainda não aprovada: custo completo e restante a pagar, com informação manual e opcional. Exemplo: se produtos/taxas já foram pagos e restam frete internacional e tributos, o custo completo continua incluindo tudo e o restante considera apenas o que ainda não foi pago. Não autoriza confirmar pagamentos reais na Gestão nem processar transferências. Pagamentos parciais e eventuais diferenças entre moeda original e desembolso BRL exigirão definição específica caso essa capacidade seja aprovada.

Resposta do usuário: “concordo”, em resposta à rodada Q5/Q6.

Estado: aprovado mostrar custo completo e restante a pagar com informação manual opcional de despesas pagas. Pagamento parcial e captura de desembolso BRL permanecem pendentes.

## Rodada 4 — composição dos custos e moedas

### Q7 — Componentes do simulador

Pergunta: podemos decompor o custo em produtos, frete na China, serviços/taxas da intermediadora, frete internacional, seguro, tributos, taxas de pagamento e despesas adicionais identificadas pelo usuário?

Alternativas: poucos totais agregados; composição explícita com detalhes opcionais; formulário obrigatório de todas as despesas.

Recomendação ainda não aprovada: composição explícita com detalhes opcionais. Permite explicar o total e corrigir somente uma parcela. Fretes são valores informados manualmente nesta proposta; não inclui simulador automático de frete. Campo desconhecido preserva a incompletude aprovada na Q4 e não vira zero. Detalhes de taxas percentuais, bases de incidência e tributos ainda precisam de requisitos e fontes oficiais; não são fórmulas aprovadas por essa lista.

Resposta do usuário: “sim”, em resposta à rodada Q7/Q8.

Estado: aprovada a composição proposta, com detalhes opcionais, fretes manuais e pendências explícitas. Bases de taxas e regras tributárias continuam pendentes.

### Q8 — Moedas e cotação de referência versus personalizada

Pergunta: podemos aceitar CNY, USD e BRL, permitindo selecionar a moeda de cada despesa e usar uma cotação de referência consultada automaticamente ou uma taxa personalizada?

Alternativas: somente taxa manual; somente referência automática; referência automática com substituição explícita pela taxa do usuário.

Recomendação ainda não aprovada: referência automática com taxa personalizada. Isso oferece uso rápido sem perder a possibilidade de representar a taxa efetiva da intermediadora/pagamento. A origem e o momento de cada cotação devem ser visíveis. Seleção de fornecedor, licença, custo, frequência, cache e contingência ainda serão investigados e decididos; não há API já escolhida ou integração autorizada. O efeito em despesas já pagas deve ser tratado na próxima rodada se esse comportamento for aprovado, preservando desembolso histórico informado.

Resposta do usuário: “sim”, em resposta à rodada Q7/Q8.

Estado: aprovadas moedas CNY/USD/BRL por despesa e referência automática com possibilidade de taxa personalizada, mostrando origem/data. Fonte, frequência, cache, contingência e aplicação em pagamentos informados continuam pendentes; não há integração autorizada.

## Rodada 5 — valores pagos e limite dos estados de pagamento

### Q9 — Preservação do desembolso real informado

Pergunta: para uma despesa já paga, podemos usar o valor efetivamente pago em BRL informado pelo usuário, preservando-o quando a cotação de referência for atualizada?

Alternativas: recalcular também as despesas pagas pela cotação de referência; preservar o desembolso real e usar câmbio apenas nas estimativas ainda aplicáveis.

Recomendação ainda não aprovada: preservar o desembolso real informado em BRL. Se a pessoa não souber esse valor, manter a lacuna explícita, sem apresentar uma conversão atual como valor efetivamente pago. A simulação pode conter estimativas, mas deve identificá-las como tal. A relação entre principal e taxa de pagamento deve evitar contagem duplicada e ainda terá contrato específico; este comportamento não lê ou altera pagamentos da Gestão.

Resposta do usuário: “cnocordo”, interpretada no contexto como concordância com Q9 e Q10.

Estado: aprovado preservar o desembolso BRL real informado, sem recálculo pela nova cotação; falta do valor real permanece explícita.

### Q10 — Pagamentos parciais no primeiro lançamento

Pergunta: podemos limitar a primeira versão a despesas totalmente pagas ou ainda não pagas, adiando o controle de pagamentos parciais?

Alternativas: estado pago/não pago; incluir também estado parcial com valores e saldo remanescente por despesa.

Recomendação ainda não aprovada: começar sem pagamento parcial. Simplifica o preenchimento e o cálculo do restante, mas não representa integralmente adiantamentos ou parcelamentos. Caso esses cenários sejam centrais para o público pretendido, incluir parcial exigirá definir valor pago, moeda/base do saldo, taxas e comportamento do restante. Não sugerir que uma despesa parcialmente paga seja marcada incorretamente como totalmente paga ou não paga.

Resposta do usuário: “cnocordo”, interpretada no contexto como concordância com Q9 e Q10.

Estado: aprovado adiar pagamentos parciais no primeiro lançamento; a simulação contempla despesa integralmente paga ou ainda não paga. Não reinterpretar pagamento parcial como um desses estados.

## Rodada 6 — taxas e escopo tributário

### Q11 — Entrada das taxas não tributárias

Pergunta: podemos permitir serviços/taxas da intermediadora e taxas de pagamento como valor fixo informado ou percentual, deixando explícita a base usada no percentual?

Alternativas: somente valor fixo; valor fixo ou percentual com base explícita; aplicar automaticamente um percentual padrão da intermediadora.

Recomendação ainda não aprovada: valor fixo ou percentual com base explícita. Ajuda quem conhece o total cobrado e quem está estimando a partir de uma tabela de taxas. Se o valor informado já incluir a taxa, o contrato precisa impedir somá-la novamente. Não há percentual padrão, fornecedor ou fórmula de base previamente aprovado; os detalhes serão resolvidos após a escolha do comportamento.

Resposta do usuário em 22/10/2026: “q11 concordo”.

Estado: aprovado valor fixo ou percentual com base explícita; permanece pendente definir as bases disponíveis e a entrada de valores que já incluem taxas.

### Q12 — Abrangência inicial da calculadora de tributos

Pergunta: podemos focar a primeira versão em compras de pessoas físicas recebidas por remessa internacional, cobrindo os cenários dentro e fora do Programa Remessa Conforme, com enquadramento aplicável e estado de destino explícitos?

Alternativas: somente cenário fora do PRC; remessas para pessoa física dentro/fora do PRC; incluir também outras modalidades e públicos desde o início.

Recomendação ainda não aprovada: remessas para pessoa física dentro/fora do PRC. Amplia utilidade sem abranger inicialmente importação formal, bagagem ou regras específicas para pessoas jurídicas. Exige manutenção de mais de um cenário e orientação para identificar o enquadramento real; não inferir PRC apenas do nome da intermediadora. Cada resultado deve expor premissas e limites. A seleção de alíquotas/UF, data de vigência, fontes normativas, critérios de elegibilidade e comportamento fora do limite do regime ainda precisam de investigação e especificação; a aprovação de escopo não aprova fórmulas.

Resposta do usuário em 22/10/2026: “q12 todas as imporações nao sao do Programa Remessa Conforme”.

Estado: recomendação ajustada. O contexto de importações que o usuário deseja atender é fora do PRC; cenários dentro do PRC não fazem parte do escopo inicial solicitado. Isso registra o contexto/escopo declarado pelo usuário, sem afirmar que toda importação no Brasil está fora do programa ou certificar o enquadramento de uma empresa. O recorte pessoa física/remessa e a unidade de simulação serão explicitados na Q13. Não foram aprovadas fórmulas ou alíquotas.

### Evidência oficial inicial para Q12

Consulta em 21/10/2026, pelo agente principal. A [Receita Federal distingue os cenários certificados e não certificados no PRC](https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/manuais/remessas-postal-e-expressa/preciso-pagar-impostos-nas-compras-internacionais/quais-sao-os-impostos-devidos) e descreve RTS, valor aduaneiro e impostos federal/estadual. A [página da calculadora oficial](https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/manuais/remessas-postal-e-expressa/calculadora-de-impostos-portal-aduana-e-comercio-exterior) alerta para diferenças de ICMS entre estados e remete à tabela do Comsefaz. Essa tabela e normas/vigências específicas ainda não foram validadas nesta rodada. Não foram fixadas alíquotas neste documento, escolhida API tributária ou presumida certificação da HubBuy.

## Rodada 7 — unidade tributária da simulação e critérios de rateio

### Q13 — Remessa para pessoa física como unidade inicial

Pergunta: no contexto fora do PRC, podemos focar a primeira versão em remessas de compras para pessoa física, calculando uma remessa/pacote por vez, que pode conter vários produtos?

Alternativas: uma remessa por simulação; várias remessas independentes em um mesmo cenário; incluir desde o início importação formal e outros públicos/modalidades.

Recomendação ainda não aprovada: uma remessa para pessoa física por simulação, com total agregado ou vários produtos no mesmo envio. Dá uma unidade clara para frete, seguro e estimativa tributária. Não somar itens de envios diferentes como se constituíssem uma única remessa. Planejar divisão de produtos entre vários pacotes em uma mesma simulação acrescenta escopo; permanece pendente. Esta decisão é de abrangência de produto; elegibilidade, limites e tratamento de exceções serão verificados em fontes oficiais, sem presumir que qualquer pacote use o mesmo regime.

Resposta do usuário: “q13 concordo com um unico pacote inicialmente por vez”.

Estado: aprovado um pacote por simulação inicialmente. A resposta confirma explicitamente a unidade; não é aprovação de fórmulas, limites tributários ou outras modalidades.

### Q14 — Critérios da ferramenta de rateio

Pergunta: podemos permitir ratear cada despesa igualmente, proporcionalmente ao valor dos produtos ou ao peso informado, escolhendo o critério por despesa?

Alternativas: um único critério para tudo; escolha por despesa entre igual/valor/peso; adicionar desde o início percentuais e valores livres por participante.

Recomendação ainda não aprovada: igual/valor/peso com escolha por despesa. Por exemplo, frete por peso e outra despesa por valor. Peso é entrada manual opcional, não cálculo automático de frete ou peso volumétrico. Só habilitar um critério quando houver as informações necessárias, sem inventar pesos ou tratar ausência como zero. A associação entre produtos e pessoas, rateios personalizados e regras para bases nulas/zero/ausentes ainda serão definidos; os métodos atuais da Gestão permanecem inalterados.

Resposta do usuário: “q14 concordo”.

Estado: aprovados igual/valor/peso informado, com critério por despesa e disponibilidade condicionada aos dados necessários.

### Esclarecimento de escopo solicitado pelo usuário

As rodadas tratam das novas ferramentas de Loti Ferramentas, sem modificar a Gestão existente. O pedido original estabelece ferramentas básicas públicas e Beta gratuito inclusive para capacidades destinadas a Pro. Gratuidade no Beta não implica que todas as capacidades serão gratuitas permanentemente ou sem conta: salvamento, histórico e outros recursos ainda dependem da descoberta e da matriz de acesso da Fase 3. A expectativa expressa agora é uso inicial fora da área logada e gratuito; manter o cálculo básico como experiência pública, deixando possíveis capacidades autenticadas explicitamente separadas para decisão, sem aprová-las automaticamente.

Estimativa de condução, não limite fixo: cerca de 8–12 perguntas adicionais para fechar os principais ramos de produto, agrupadas por assunto. Investigações factuais, fórmulas e verificação de fontes serão feitas pelo agente principal; perguntas extras somente para decisões relevantes ou conflitos. Esta estimativa não abrange as fases posteriores de monetização, arquitetura e experiência.

## Rodada 8 — calculadora pública de rateio (Q15–Q20)

Resposta do usuário ao conjunto: “concordo com todas”. Recomendações aceitas abaixo, sem alterações no rateio da Gestão:

| Questão | Decisão aprovada | Limite / consequência |
|---|---|---|
| Q15 — Produtos e pessoas | Produtos com quantidade, valor e peso opcional, associados à pessoa responsável | Mostrar custo por produto e total por pessoa; não exige cadastro de usuários |
| Q16 — Produto compartilhado | Um produto pode ser dividido igualmente entre várias pessoas | Percentuais e valores personalizados por participante adiados na primeira versão da ferramenta pública |
| Q17 — Peso | Informar peso por unidade e multiplicar pela quantidade | Peso manual, unidade explícita, sem inferência pelo tipo de produto |
| Q18 — Abrangência da despesa | Cada despesa pode atingir todos os produtos ou somente os selecionados | Todos como padrão, seleção explícita para despesas específicas |
| Q19 — Resultado | Por produto e pessoa: valor dos produtos, parcela de cada despesa e total | Totais diretos com detalhes expansíveis |
| Q20 — Compartilhamento | Copiar resumo em texto, adequado a compartilhamento manual | Sem link público persistido inicialmente; exportações e links sujeitos a decisão separada |

A recomendação inicialmente formulada na Q16 mencionava igual/percentual/valor como alternativas; foi aprovada a recomendação de somente divisão igual entre os participantes de um mesmo produto. Isso não restringe os modos já existentes na Gestão nem elimina a escolha igual/valor/peso entre produtos para cada despesa (Q14).

## Rodada 9 — tabela de referências de valores

As questões abaixo são propostas pendentes. Não pressupõem que exista uma base adequada, nem autorizam reutilizar dados privados da Gestão ou publicar registros reais.

- **Q21 — Finalidade:** usar a tabela para pesquisar preços reais de aquisição e apoiar planejamento, sem tratá-la como tabela de valores a declarar. Recomendação: esse propósito, coerente com a restrição original a referências rastreáveis e declarações corretas.
- **Q22 — Granularidade:** categorias como ponto de entrada, distinguindo tipo/modelo, condição e características relevantes dentro delas. Recomendação: evitar uma faixa única que misture produtos muito diferentes; categorias iniciais e profundidade ainda dependem dos dados disponíveis.
- **Q23 — Origem/manutenção:** começar com curadoria manual de fontes identificáveis, separando preços anunciados de compras efetivamente realizadas. Recomendação: base pequena e verificável; sem scraping, coleta da Gestão ou publicação automática. Fontes concretas e capacidade de manutenção continuam pendentes de validação.
- **Q24 — Contribuições:** adiar envio de dados pela comunidade no primeiro lançamento. Recomendação: reduzir custo de revisão e controle de qualidade; desvantagem é crescimento mais lento da amostra. Receber contribuições depois exigirá política de evidência, privacidade e moderação.
- **Q25 — Condição de lançamento:** publicar a tabela apenas quando houver amostra contextualizada suficiente, podendo lançar as outras ferramentas antes. Recomendação: evitar uma tabela sem sustentação; limiar por grupo, atualidade e origem devem ser especificados antes de aprovar o conteúdo. A viabilidade da ferramenta permanece condicionada aos dados reais.

### Respostas da rodada 9 e conflito a resolver

Em 22/10/2026, o usuário respondeu:

- Q21: rejeita o propósito proposto de pesquisa de preços de aquisição. Deseja sugestões de “valores ideais a se declarar” fornecidas por importadores experientes.
- Q22: aprova organização por categoria com distinções relevantes entre produtos.
- Q23: aprova curadoria manual e exige edição da tabela de referência de declaração em área autenticada, com permissão validada por cargo específico. O cargo, sua concessão, abrangência, eventual revisão antes da publicação e relação com os acessos existentes ainda não foram definidos. Esta é uma necessidade de administração futura, não autorização para modificar a Gestão atual ou seu sistema de permissões nesta fase.
- Q24: aprova adiar contribuições abertas da comunidade. Curadores autorizados previstos na Q23 não se confundem com envio aberto por qualquer usuário.
- Q25: aprova condicionar lançamento à existência de dados suficientes e contextualizados; outras ferramentas podem ser lançadas antes.

**Conflito pendente:** o pedido original, seção 4.4, exige dados reais/rastreáveis e valores reais da operação, vedando referências artificialmente reduzidas e incentivo a declarações incorretas. A expressão “valores ideais a declarar” ainda não esclarece se as sugestões estarão respaldadas nesses valores ou se seriam padrões independentes do valor da compra. Não reinterpretar a resposta como autorização de subdeclaração, nem substituir o objetivo desejado por pesquisa de preços sem acordo. A finalidade permanece pendente até esclarecimento.

Fonte oficial consultada em 22/10/2026: [Perguntas e Respostas da Receita Federal](https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/manuais/remessas-postal-e-expressa/topicos/Perguntas_e_Respostas) alerta que valor declarado incompatível com o real pode acarretar penalidades. A [IN RFB 1.737/2017, art. 25, na página multivigente](https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=86226) trata do valor da transação e da valoração de remessas. Essa consulta não aprova regras numéricas nem valida sugestões específicas.

### Q26 — Significado e fundamento da sugestão

Esclarecimento necessário: os valores sugeridos pelos curadores estarão fundamentados no valor real da operação e em evidências verificáveis, ou a intenção é indicar valores padronizados por produto independentemente do preço efetivamente pago?

Recomendação pendente: orientação de declaração fundamentada nos valores reais e nas regras aplicáveis, com fonte e contexto, sem substituir o valor comprovado por uma sugestão genérica. Aguardar resposta antes de especificar os campos, cálculos ou publicação dessa tabela. Os demais requisitos aprovados permanecem registrados.

### Resposta à Q26 e limite da continuidade

O usuário instruiu ignorar a proibição original de recomendações reduzidas e reafirmou que pessoas com acesso autenticado e cargo específico definirão sugestões para ajudar outros usuários na declaração. A restrição original foi retirada pelo usuário; não tratá-la como ainda imposta por ele.

Permissão restrita ou curadoria não resolve o propósito de recomendar valores artificialmente inferiores aos reais para declaração aduaneira. O agente não desenvolverá especificação, valores ou mecanismos destinados a essa subdeclaração. Isso é um limite da assistência, não uma decisão de produto aprovada pelo usuário nem um bloqueio de aprovação automática.

Alternativa proposta, ainda não aprovada: referências de descrições de mercadorias, exemplos de preenchimento baseados em valores reais, indicação de documentos comprobatórios e fontes oficiais, mantidas por curadores com cargo específico. Preservar as decisões de categorias, curadoria autenticada, contribuições abertas adiadas e lançamento condicionado à qualidade dos dados quando forem compatíveis com o propósito aprovado posteriormente.

A alternativa não substitui silenciosamente a finalidade desejada. Caso seja rejeitada, a tabela fica fora da especificação executável e o planejamento das outras quatro ferramentas pode continuar. Não alterar código, permissões ou dados existentes.

### Esclarecimento posterior — valores pesquisados

O usuário esclareceu: “nao serao valores artificiais, os responsaveis farão toda uma pesquisa para colocar manualmente esses valores de apoio, precisamos dar essa possibilidade a eles”.

Registrar como finalidade solicitada: referências de apoio à declaração, pesquisadas e inseridas manualmente por curadores autorizados. Não presumir pesquisa de preços de compra como único objetivo nem atribuir intenção de produzir valores artificiais após esse esclarecimento. O planejamento pode avançar nos controles editoriais, fontes, contexto e exibição de referências pesquisadas.

O esclarecimento não transforma referências gerais em prova do valor de uma operação específica. Não especificar substituição automática do valor real de uma compra por referência da tabela, nem recursos destinados a declarações inexatas. A alternativa anterior de restringir a ferramenta apenas a descrições e comprovantes não foi aceita e não deve constar como decisão aprovada.

## Rodada 10 — curadoria e apresentação das referências

Todas as propostas abaixo aguardam resposta; não são mudanças autorizadas no sistema existente.

- **Q27 — Cargo:** cargo Curador de referências concedido/revogado pelo responsável pela plataforma; permissões editoriais próprias, sem conceder acesso aos dados privados dos grupos. Recomendação: escopo de plataforma, não confundir com membro de workspace ou gestor QC. Meio operacional de concessão ainda será planejado, sem presumir painel administrativo novo.
- **Q28 — Formato:** permitir valor de referência único ou faixa dos valores encontrados, sempre com moeda, unidade e contexto do produto. Recomendação: suportar ambos conforme a pesquisa, sem apresentar a referência como garantia ou valor efetivo de qualquer compra.
- **Q29 — Rastreabilidade:** cada publicação conter responsável, data da pesquisa/revisão, fontes e justificativa breve. Recomendação: esses campos como requisito editorial; decidir depois quais dados de evidência serão públicos e quais ficam restritos, sem upload de comprovantes aprovado.
- **Q30 — Publicação:** rascunho e ação explícita de publicar; curador autorizado pode publicar sem segunda aprovação obrigatória inicialmente. Recomendação: permitir revisão do conteúdo antes de torná-lo público, com histórico de versões e autoria; não adicionar fluxo de revisão por duas pessoas sem necessidade aprovada.
- **Q31 — Atualidade:** curador define data de próxima revisão; vencida, a referência é sinalizada e deixa de aparecer como atual. Recomendação: conservar histórico e não inventar atualização automática. Prazo, visibilidade de versões antigas e eventual despublicação ainda precisam de definição posterior.

### Respostas da rodada 10

- Q27: usuário solicita dois escopos de cargos: internos ao workspace/grupo de amigos e externos ao workspace, na plataforma. Rejeita nome limitado a curadoria da tabela, pois o cargo terá outras responsabilidades ainda não descritas. Não presumir quais poderes adicionais foram autorizados.
- Q28: aprovado valor único ou faixa pesquisada, com moeda, unidade e contexto do produto.
- Q29: usuário considera desnecessário exigir fontes, data da pesquisa e justificativa breve no cadastro. Esses campos obrigatórios não foram aprovados. Isso não revoga automaticamente autoria/histórico de alterações aprovados na Q30, nem a revisão da Q31. Os critérios de qualidade e contexto da Q25 continuam válidos; não inventar pesquisas ou comprovação inexistente.
- Q30: aprovado rascunho, publicação explícita pelo próprio editor autorizado, sem segunda aprovação obrigatória inicialmente, com histórico de alterações e autoria.
- Q31: aprovado sinalizar referências desatualizadas, com intervalo de três meses. Marco inicial/renovação do prazo e eventual visibilidade de versões antigas ainda serão especificados; não confundir prazo com atualização automática dos valores.

## Rodada 11 — responsabilidades e nomes dos cargos

Esta rodada levanta requisitos de produto solicitados pelo usuário; desenho técnico, matriz completa e implementação pertencem a fases posteriores. Não alterar papéis ou direitos dos usuários atuais da Gestão.

- **Q32 — Nome do cargo da plataforma:** proposta Editor da plataforma para quem mantém conteúdos/referências e configurações editoriais das ferramentas públicas. Se as responsabilidades incluírem gestão de usuários/permissões, distinguir Administrador da plataforma. Nomes e separação propostos, ainda não aprovados.
- **Q33 — Organização interna:** proposta de três cargos por workspace: Proprietário, Administrador e Membro. Alternativa menor: Administrador e Membro. O usuário deve escolher a necessidade; não presumir existência de um proprietário com poderes retroativos no sistema atual.
- **Q34 — Responsabilidades externas:** esclarecer quais tarefas além da tabela devem ser atribuídas ao cargo. Opções a discutir: conteúdo/configuração editorial das ferramentas; moderação; gestão de usuários/cargos; outras atribuições indicadas pelo usuário. Isso não aprova novas funcionalidades nem um painel administrativo por enumeração.
- **Q35 — Independência dos escopos:** proposta de cargo da plataforma não conceder automaticamente leitura/alteração de compras, saldos ou outros dados privados de workspaces; membro/admin de workspace também não se torna editor da plataforma automaticamente. Poderes excepcionais de suporte, caso desejados, exigirão definição própria.

### Respostas da rodada 11

- Q32: nome aprovado **Editor**, sem sufixo obrigatório.
- Q33: cargos internos ao workspace aprovados: **Proprietário, Administrador e Membro**. Atribuições, criação/transferência de propriedade, atribuição inicial e proteção dos membros existentes serão definidas na Fase 3; não alterar direitos atuais.
- Q34: Editor deverá supervisionar e modificar as novas funcionalidades gratuitas no Beta e destinadas a cobrança posterior. A resposta define a área de responsabilidade, mas não enumera operações permitidas. Não inferir poder para editar código, fórmulas tributárias, billing, preços comerciais, infraestrutura ou dados privados; delimitar permissões operacionais na Fase 3.
- Q35: aprovada independência dos escopos. Cargo de plataforma não concede acesso automático aos dados privados dos workspaces; cargo interno não concede poderes globais.

A referência a funcionalidades gratuitas no Beta e pagas posteriormente mantém o contexto de recursos planejados como Pro. Não considerar automaticamente revogada a previsão de recursos permanentemente Free; a matriz e a transição comercial ainda serão decididas na Fase 3.

## Rodada 12 — continuidade e atualização da experiência pública

Propostas abaixo aguardam resposta:

- **Q36 — Rascunho local:** permitir salvar opcionalmente a simulação no próprio navegador, sem login, com ação para apagar. Recomendação: sim, explicando que não sincroniza entre dispositivos e que dados devem poder ser descartados. Escolha de armazenamento, retenção e tratamento de falhas pendentes; não aprova conta/histórico remoto.
- **Q37 — Mudança de cotação:** manter a cotação usada no resultado até ação explícita de atualizar, mostrando origem/data e a existência de referência mais recente quando disponível. Recomendação: preservar a estabilidade do cenário durante a análise; não atualizar custos reais pagos já informados. Não aprova consulta contínua ou notificações.
- **Q38 — Indisponibilidade:** permitir taxa manual; quando houver referência anterior utilizável, oferecê-la com data e indicação de desatualização. Recomendação: não interromper todo uso por falha da fonte, sem inventar taxa ou apresentar dados antigos como atuais. Licença/cache, idade máxima e casos de indisponibilidade total serão definidos na avaliação da integração.
- **Q39 — Conexão entre ferramentas:** ao levar valores ao simulador/rateio, mostrar resumo do que será aproveitado e pedir confirmação antes de substituir dados já preenchidos. Recomendação: preservar rascunhos e impedir somas duplicadas. Não transfere nada para a Gestão e não implica link público persistido.

### Respostas da rodada 12

Resposta do usuário ao conjunto Q36–Q39: “concordo com todas”.

- Q36 aprovada: salvamento opcional no navegador, sem login, com exclusão pelo usuário; sem sincronização entre dispositivos.
- Q37 aprovada: cotação do cenário mantida até atualização explícita, com origem/data visíveis; valores efetivamente pagos não são recotados.
- Q38 aprovada: cotação manual e referência anterior identificada quando utilizável; idade máxima/licença/cache dependem da fonte e permanecem para avaliação técnica.
- Q39 aprovada: transferência entre ferramentas públicas com resumo e confirmação antes de sobrescrever dados preenchidos; sem dupla contagem nem mutação na Gestão.

## Rodada 13 — fechamento do escopo do primeiro lançamento

Propostas pendentes; objetivo é encerrar os principais ramos de produto antes da consolidação, não abrir funcionalidades extras.

- **Q40 — Conjunto inicial:** disponibilizar simulador de custo final, calculadora tributária fora do PRC, conversor e rateio no primeiro lançamento público; tabela entra quando cumprir a condição de dados/contexto já aprovada. Recomendação: esse conjunto como alvo do lançamento; não implica desenvolvimento simultâneo, prazo ou autorização de implementação. Alternativa: um lançamento menor com priorização definida pelo usuário.
- **Q41 — Comparação de cenários:** primeiro lançamento trabalha com um cenário ativo por ferramenta, que pode ser alterado e guardado localmente; comparação lado a lado de cenários fica para depois. Recomendação: adiar comparação simultânea, preservando as alternativas de preenchimento já aprovadas. Número de rascunhos locais/histórico ainda precisa de contrato compatível com esse recorte.
- **Q42 — Exportação inicial:** estender a cópia de resumo textual aprovada para rateio aos resultados das outras calculadoras/conversor, sem PDF/Excel ou links públicos persistidos inicialmente. Recomendação: compartilhar o resultado com premissas/cotação e pendências quando aplicável; redação exata pode ser definida na especificação sem nova feature.

Após essas respostas, consolidar matriz, requisitos, critérios de aceitação e pendências técnicas. Investigar diretamente fontes/fórmulas e registrar incompatibilidades relevantes que precisem de decisão; não presumir encerramento se restar conflito material. A matriz de cargos, transição Free/Pro e monetização continuam na Fase 3.

### Respostas da rodada 13

Resposta do usuário ao conjunto Q40–Q42: “concordo com todas”.

- Q40 aprovada: primeiro lançamento público com custo final, impostos fora do PRC, conversor e rateio; tabela condicionada aos critérios de dados/contexto. A execução poderá ser incremental; não há prazo ou autorização para desenvolvimento.
- Q41 aprovada: uma simulação ativa por ferramenta, editável e guardada localmente; comparação simultânea de cenários adiada.
- Q42 aprovada: copiar resumo textual das ferramentas; PDF, Excel e links públicos persistidos adiados.

Consolidação: `02_MATRIZ_E_REQUISITOS.md` contém matriz, fluxos, requisitos, aceitação, priorização e relatório de conclusão; `02_CALCULOS_E_FONTES.md` separa evidências oficiais e propostas de contrato técnico. Recomendações técnicas nesses documentos não se tornam decisões aprovadas por esta anotação.

## Q43 — Ambiguidade encontrada na consolidação: igual por linha ou unidade

A Q14 aprovou critério igual entre produtos, mas não explicitou como a quantidade afeta esse critério. Exemplo: uma linha com três camisetas, outra com um tênis, despesa de R$ 40.

- Igual por linha: R$ 20 para cada linha de produto.
- Igual por unidade física: R$ 10 por unidade; camisetas recebem R$ 30 e tênis R$ 10.

Recomendação ainda não aprovada: igual por unidade física, pois separar/agrupar as três camisetas em linhas não muda sua parcela total. Divisão igual entre pessoas de um mesmo produto (Q16) é outra etapa e permanece aprovada.

Após explicação dos dois critérios, o usuário respondeu “concordo” à recomendação por unidade física.

Estado: aprovada divisão igual por unidade física. No exemplo, camisetas recebem R$ 30 e tênis R$ 10. O agrupamento das mesmas unidades em linhas não deve alterar sua parcela total, ressalvada a política determinística de centavos a especificar.

## Registro de decisões

- Aprovado: iniciar a Fase 2; não usar mais subagentes neste chat.
- Mantido: posicionamento, marca/domínio, Free/Pro único, Beta inicialmente gratuito, proteção dos atuais e demais decisões explícitas do pedido.
- Aprovado — D2-01: público misto, atendendo leigos e importadores experientes; rejeitada a hierarquia iniciante principal/experiente secundário proposta na Q1.
- Aprovado — D2-02: custo total explicável em reais antes de comprometer dinheiro como problema principal (Q2).
- Aprovado — D2-03: ferramentas com entrada direta, conexão opcional e orientação sob demanda, sem jornada obrigatória (Q3).
- Aprovado — D2-04: simulador antes da compra e antes do envio, com distinção entre valores conhecidos, estimados e desconhecidos (Q4).
- Aprovado — D2-05: entrada por total dos produtos ou lista detalhada com quantidade/preço unitário, sem dupla contagem (Q5).
- Aprovado — D2-06: custo total e restante a pagar, com informação manual opcional das despesas pagas; sem escrita em Gestão (Q6).
- Aprovado — D2-07: componentes de custo explícitos com detalhes opcionais, fretes manuais e sinalização de valores desconhecidos (Q7).
- Aprovado — D2-08: CNY/USD/BRL por despesa; cotação automática de referência ou personalizada, com origem/data visíveis; fornecedor e regras operacionais pendentes (Q8).
- Aprovado — D2-09: preservar o valor BRL efetivamente pago informado; não atualizá-lo por nova cotação nem converter desconhecido em valor real (Q9).
- Aprovado — D2-10: pagamentos parciais adiados no primeiro lançamento (Q10).
- Aprovado — D2-11: taxas da intermediadora/pagamento em valor fixo ou percentual com base explícita; detalhamento das bases pendente (Q11).
- Aprovado — D2-12: foco inicial nas importações fora do PRC descritas pelo usuário; retirada a proposta de incluir cenários dentro do PRC nesta primeira versão (Q12).
- Aprovado — D2-13: um pacote por simulação no primeiro lançamento (Q13).
- Aprovado — D2-14: rateio igual, por valor ou peso manual, com escolha por despesa (Q14).
- Aprovado — D2-15 a D2-20: decisões da rodada 8 registradas na tabela acima, incluindo produto/pessoa, compartilhamento igual, peso unitário, seleção dos produtos atingidos, resultado detalhado e cópia de resumo textual.
- Aprovado — D2-22: organização por categorias e características relevantes (Q22).
- Aprovado — D2-23: curadoria manual com edição autenticada restrita a cargo específico, cujo contrato ainda será definido (Q23).
- Aprovado — D2-24: adiar contribuições abertas da comunidade (Q24).
- Aprovado — D2-25: lançamento da tabela condicionado a dados suficientes/contextualizados; independência do lançamento das outras ferramentas (Q25).
- Esclarecido — Q21/Q26: usuário deseja referências de apoio à declaração pesquisadas, não artificiais, inseridas manualmente por responsáveis com cargo específico. Continuar planejamento de curadoria/rastreabilidade; não substituir valores reais de operações por padrões da tabela. A proposta original de pesquisa de preços como finalidade única e a alternativa apenas de descrições/comprovantes não foram aprovadas.
- Aprovado — D2-27: separar cargos do workspace de cargos da plataforma; nome e atribuições ainda pendentes (Q27).
- Aprovado — D2-28: valor único ou faixa pesquisada, moeda/unidade/contexto (Q28).
- Rejeitado — Q29: obrigatoriedade de fontes, data da pesquisa e justificativa no cadastro.
- Aprovado — D2-30: rascunho/publicação explícita pelo editor autorizado, sem dupla aprovação inicial, com autoria/histórico (Q30).
- Aprovado — D2-31: intervalo de revisão de três meses, com sinalização de desatualização (Q31).
- Aprovado — D2-32: cargo de plataforma chamado Editor (Q32).
- Aprovado — D2-33: Proprietário, Administrador e Membro por workspace (Q33).
- Aprovado — D2-34: Editor supervisiona e modifica as novas funcionalidades no contexto Beta/futuro Pro; operações exatas dependem da matriz de permissões, sem concessão implícita de acesso a código/billing/infraestrutura (Q34).
- Aprovado — D2-35: independência entre cargos de plataforma e workspace, sem acesso privado implícito (Q35).
- Aprovado — D2-36: salvamento opcional no navegador com exclusão, sem login/sincronização (Q36).
- Aprovado — D2-37: atualização explícita da cotação usada no cenário e preservação do desembolso real (Q37).
- Aprovado — D2-38: contingência com taxa manual e referência anterior identificada quando utilizável (Q38).
- Aprovado — D2-39: resumo/confirmação para transferência de valores entre ferramentas, sem sobrescrita silenciosa ou escrita na Gestão (Q39).
- Aprovado — D2-40: conjunto inicial público com quatro ferramentas e tabela com lançamento condicionado aos dados (Q40).
- Aprovado — D2-41: um cenário ativo por ferramenta e comparação simultânea adiada (Q41).
- Aprovado — D2-42: cópia textual nas ferramentas; arquivos e links persistidos adiados (Q42).
- Aprovado — D2-43: divisão igual da despesa por unidade física entre os produtos selecionados; soma ponderada pela quantidade, independente do agrupamento em linhas (Q43).
- Pendências de aprovação/especificação: listadas nos entregáveis consolidados; cargos/acesso/Beta na Fase 3; fontes/cache/limites técnicos na Fase 4; experiência detalhada na Fase 5; fechamento das especificações na Fase 6.

## Entregáveis ao concluir a fase

Matriz separando existente preservado, novo confirmado e ideia futura; definição conceitual e fluxos de cada ferramenta aprovada; requisitos funcionais e não funcionais; regras e critérios de aceitação; necessidades compartilhadas; priorização por valor/esforço/dependências com incertezas explícitas; questões pendentes.

A fase só será encerrada após as rodadas necessárias e confirmação do entendimento comum. A Fase 3 dependerá de autorização explícita separada.
