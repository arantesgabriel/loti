# Loti — Fase 2: matriz de funcionalidades e requisitos de produto

Consolidado em 22/10/2026. Estado: descoberta concluída, aguardando aprovação dos entregáveis; sem implementação. Fonte das decisões: Q1–Q43 em `02_DESCOBERTA_PRODUTO.md`. As respostas e correções prevalecem sobre as recomendações originais rejeitadas. Fase 3 não iniciada.

## 1. Objetivo, resultado e limites da fase

Foram definidas com o usuário as novas ferramentas públicas de apoio à importação, destinadas tanto a leigos quanto a importadores experientes. O problema principal aprovado é entender quanto a importação deve custar em reais e explicar cada parcela antes de comprometer dinheiro. O uso inicial será sem login e gratuito no Beta; administração editorial será autenticada.

Entrevistas seguiram as skills oficiais Matt Pocock, com perguntas agrupadas por contexto e registro das respostas. Após a instrução do usuário, não foram mais usados subagentes. A investigação complementar foi direta, por leitura de documentos/código e fontes oficiais. Nenhum teste, build, query em banco, migration, instalação de dependências do projeto, endpoint, tela, commit ou deploy foi realizado nesta fase.

O primeiro lançamento visa quatro ferramentas: custo final, tributos fora do PRC, conversor e rateio. A tabela de referências permanece no produto, mas só entra quando cumprir a condição de dados/contexto aprovada. A fase não decide fornecedores, preços/limites Free/Pro, arquitectura de hospedagem ou mudança no acesso dos atuais membros.

Observação do workspace ao final desta consolidação: `git status` também mostrou modificações em `next-env.d.ts` e `tsconfig.json`, além de `planning/` e `reset-password.sh` não rastreados. O diff textual de `next-env.d.ts` aponta tipos em `.next-qc-title-fix`; não há diff textual de `tsconfig.json` na consulta. Essas mudanças não foram produzidas pelas operações desta fase, que só escreveram documentação em `planning/`; não foram revertidas ou modificadas.

## 2. Matriz completa de escopo

| Funcionalidade | Categoria / estado | Acesso no lançamento Beta | Dados / relação com Gestão | Referência |
|---|---|---|---|---|
| Login, sessões, recuperação, convites e perfil atuais | Existente preservada | Contrato atual | Nenhuma alteração | Auditoria Fase 1 |
| Favoritos, coleções, compra ativa e histórico | Existente preservada | Membership e ownership atuais | Snapshots e direitos intactos | Auditoria Fase 1 |
| Pacotes/custos, contas/saldos CNY, direitos, adicionais, correções e refunds | Existente preservada | Contrato atual | Nenhuma mudança de cálculo, ledger ou pagamento | Auditoria Fase 1 |
| Importação/visualização QC e apresentação atual | Existente preservada | Contrato atual | Sem alterações em objetos, estados ou superfícies | Auditoria Fase 1 |
| Simulador de custo final | Nova confirmada; alvo do lançamento | Público, sem login e gratuito | Cenário manual; sem mutations na Gestão | Q2–Q13, Q36–Q42 |
| Calculadora de impostos fora do PRC | Nova confirmada; alvo do lançamento | Público, sem login e gratuito | Resultado estimado, separado de cobrança real | Q7, Q12–Q13, Q40 |
| Conversor CNY/USD/BRL | Nova confirmada; alvo do lançamento | Público, sem login e gratuito | Taxa de referência/personalizada; não recota ledger | Q8–Q9, Q37–Q40 |
| Calculadora de rateio | Nova confirmada; alvo do lançamento | Público, sem login e gratuito | Produtos/pessoas locais, sem membership obrigatório | Q14–Q20, Q39–Q42 |
| Tabela de referências de apoio à declaração | Nova confirmada; lançamento condicionado | Consulta pública no Beta; edição autenticada | Dados editoriais, sem leitura automática de compras privadas | Q21–Q31, Q40 |
| Editor da plataforma | Nova necessidade confirmada | Autenticado, cargo específico | Supervisão/manutenção das novas ferramentas; poderes exatos pendentes | Q23, Q27, Q32, Q34–Q35 |
| Proprietário/Administrador/Membro por workspace | Nova necessidade confirmada; não autorizada a implantação | Matriz futura na Fase 3 | Política de migração de direitos atuais pendente | Q27, Q33–Q35 |
| Rascunho local opcional e exclusão | Nova confirmada | Sem login | Um cenário ativo por ferramenta, sem sync entre dispositivos | Q36, Q41 |
| Reaproveitar dados entre ferramentas com confirmação | Nova confirmada | Público | Sem transferência para Gestão | Q3, Q39 |
| Copiar resumo textual | Nova confirmada | Público | Compartilhamento manual; sem link persistido | Q20, Q42 |
| Pagamentos parciais no simulador | Adiada no primeiro lançamento | — | Não reduzir capacidades já existentes na Gestão | Q10 |
| Rateio personalizado de um produto entre pessoas | Adiado no primeiro lançamento público | — | Rateio igual aprovado; modos atuais da Gestão preservados | Q16 |
| Vários pacotes no mesmo cenário | Fora do lançamento inicial | — | Um pacote por simulação aprovado | Q13 |
| Comparação simultânea de cenários | Adiada | — | Um cenário editável ativo | Q41 |
| PDF/Excel e links públicos persistidos | Adiados | — | Cópia textual aprovada | Q20, Q42 |
| Contribuições abertas da comunidade à tabela | Adiadas | — | Editor autorizado pode manter referências | Q24 |
| Histórico em conta, sincronização remota, integração de escrita com Gestão | Ideias pendentes, não aprovadas | — | Salvamento local não autoriza essas capacidades | Q3, Q36 |
| Cenários PRC, múltiplos regimes, importação formal, bagagem e PJ | Não incluídos como cobertura inicial aprovada | — | Recorte tributário suportado deve ser explícito | Q12–Q13; anexo técnico |
| Frete automático, volumetria, tracking e comparação de envios | Ideias futuras não aprovadas | — | Valores de frete e pesos são manuais | Pedido original |
| Scraping, API HubBuy, IA, workers/filas ou processamento de pagamentos | Fora do escopo aprovado | — | Nenhuma integração adicionada | Pedido e preservação |

**Free/Pro:** as capacidades públicas acima são gratuitas no Beta. Ainda não está definido quais serão permanentemente Free, quais serão Pro ou quais partes permanecerão públicas após a transição. A manutenção das rotas públicas e uma assinatura única continuam como base aprovada; não implica prometer cálculo premium irrestrito para sempre. Essa classificação pertence à Fase 3.

## 3. Contrato comum e principais fluxos

### Acesso e experiência

- Visitante abre diretamente uma ferramenta, preenche os dados essenciais e recebe resultado explicável. Orientação sob demanda atende quem precisa; não há assistente obrigatório.
- Um cenário ativo por ferramenta; edição de valores não cria registros operacionais nem histórico financeiro.
- O usuário pode salvar opcionalmente no navegador, restaurar nesse navegador e apagar. Não há conta necessária para isso nem sincronização entre dispositivos.
- Transferir resultado: ação explícita → resumo de valores, moedas e contexto → confirmar substituição se houver dados preenchidos → recalcular no destino. Não somar entradas agregadas e detalhadas do mesmo custo.
- Copiar resumo: resultado → copiar texto com premissas relevantes e pendências → compartilhar pelo canal escolhido pelo usuário. A ferramenta não envia mensagens a terceiros.
- Beta e condição de estimativa devem ser compreensíveis; rotas/layouts definitivos ficam na Fase 5.

### Fluxos centrais

1. **Antes da compra:** total de produtos ou lista → moeda/cotação → despesas conhecidas/estimadas → tributos estimados → custo completo e restante, com pendências explícitas.
2. **Antes do envio:** produtos já pagos e desembolso BRL informado → frete/seguro e tributos previstos → mostrar custo completo e quanto falta pagar, sem recotar o que já foi efetivamente pago.
3. **Tributos direto:** dados do pacote e enquadramento suportado → base e conversão fiscal estimadas → II/ICMS separados → detalhamento → eventual reaproveitamento no simulador.
4. **Conversão direta:** valor, moeda de origem/destino e taxa de referência ou personalizada → resultado, fonte/data → copiar ou reaproveitar.
5. **Rateio direto:** produtos/quantidades/pessoas → pesos opcionais → despesas e produtos atingidos → critério de cada despesa → totais por produto/pessoa → copiar resumo.
6. **Referência pública:** categoria → contexto/características → valor/faixa com moeda/unidade e estado de revisão. Não substitui automaticamente a base de uma operação específica.
7. **Edição de referência:** conta com Editor → rascunho → publicar explicitamente → histórico/autoria → revisão em três meses e sinalização de desatualização. Concessão/revogação do cargo depende da Fase 3.

## 4. Requisitos funcionais por ferramenta

### CF — Simulador de custo final

**Problema/público:** planejar o custo e o desembolso restante, para pessoas com diferentes níveis de experiência.

**Entradas aprovadas:** produtos por total agregado ou lista com quantidade/preço unitário; frete China; serviços/taxas da intermediadora; frete internacional; seguro; tributos; taxas de pagamento; outras despesas identificadas. CNY/USD/BRL por despesa, cotação de referência ou personalizada. Indicação opcional de despesa paga e desembolso real BRL informado.

**Regras aprovadas:** CF01 não duplicar total agregado com lista; CF02 separar valores conhecidos, estimados e desconhecidos; CF03 custo completo e restante separados; CF04 preservar desembolso real ao mudar cotação; CF05 despesa paga/não paga, sem parcial inicialmente; CF06 fretes manuais; CF07 taxas fixas ou percentuais com base explícita; CF08 um pacote e um cenário ativo.

**Saídas:** decomposição do custo em BRL, total completo quando determinável, parcela pendente e restante a pagar. Se faltarem valores, identificar incompletude em vez de chamar soma parcial de total definitivo. A taxonomia exata de rótulos é recomendação de UX a validar na Fase 5.

**Casos especiais/erros:** zero conhecido e sem cobrança diferem de campo não informado; despesas que já incluem taxa não devem recebê-la novamente; taxa inválida, moeda incompatível, overflow e quantidade inválida têm erro contextual. Pagamento parcial deve ser reconhecido como não suportado, sem instruir o usuário a falsificar o estado. Bases específicas das taxas permanecem no anexo como contrato recomendado.

**Persistência/acesso:** público no Beta; rascunho local opcional; não lê nem grava compras/pagamentos da Gestão. Free/Pro depois do Beta pendente.

### TR — Calculadora de impostos

**Problema/público:** compreender tributos estimados de uma remessa no cenário fora do PRC solicitado pelo usuário.

**Entradas de produto:** dados de um pacote com total ou produtos, frete, seguro, moeda/conversão e destino estadual. A presença de estado de destino veio da proposta tributária original; não foi discutida sua retirada. Especificar claramente o enquadramento efetivamente suportado, em vez de assumir certificação de intermediadora pelo nome.

**Regras aprovadas:** TR01 foco fora do PRC; TR02 um pacote por cenário; TR03 resultado é estimativa; TR04 conexão opcional com custo final. O usuário confirmou explicitamente um pacote na Q13, não uma cobertura irrestrita de todos os regimes/públicos.

**Contrato recomendado, sujeito a fechamento técnico:** primeira cobertura de compras comuns elegíveis ao RTS; base de mercadorias/frete/seguro separada das demais despesas econômicas; conversão fiscal estimada distinta da taxa efetiva de pagamento; aplicação de regra por vigência/UF. Ver `02_CALCULOS_E_FONTES.md`.

**Saídas:** II estimado, ICMS estimado, soma, base e premissas, conversão e data/referência da regra. Campos de fonte/versionamento das regras tributárias são documentação da calculadora, não os campos obrigatórios rejeitados para a tabela editorial.

**Casos especiais/erros:** regime/mercadoria fora da cobertura, limite excedido, UF sem regra confirmada ou câmbio indisponível não recebem resultado de regra genérica apresentado como válido. Pedir entradas ausentes, preservar rascunho e explicar o limite. Recomenda-se não calcular tratamento excepcional sem regra validada.

**Persistência/acesso:** público gratuito no Beta, cenário local e cópia textual. Sem consultar declarações reais, pagar impostos ou registrar DIR. Recorte final de elegibilidade é condição da especificação técnica antes da implementação.

### CV — Conversor

**Problema/público:** converter rapidamente CNY, USD e BRL com taxa visível e possibilidade de representar taxa personalizada.

**Entradas:** valor não negativo, origem/destino entre as três moedas, cotação de referência ou personalizada. Unidade/orientação da taxa precisa ser explícita. Não inserir IOF, spread ou comissão implicitamente numa cotação apresentada como referência simples.

**Regras aprovadas:** CV01 referência automática ou taxa personalizada; CV02 origem/data visíveis; CV03 cenário estável até atualizar; CV04 contingência manual ou última referência utilizável identificada; CV05 um cenário ativo e cópia textual.

**Saídas:** valor convertido, moedas, taxa utilizada, origem/data e indicação de referência/personalizada/desatualizada. Resultados não representam taxa garantida da HubBuy ou desembolso histórico.

**Casos especiais/erros:** origem igual ao destino admite identidade sem cotação externa; taxa zero/negativa/ausente ou resposta inconsistente não produz NaN/Infinity ou número inventado. Provedor fora do ar não impede uso manual; cache vencido além da política futura deve ser recusado como referência utilizável. Não trocar silenciosamente taxa personalizada quando houver atualização da fonte.

**Persistência/acesso:** público no Beta; rascunho local opcional. Provedor, licença, precisão, frequência e idade máxima permanecem para Fase 4; não há fornecedor contratado ou integração autorizada.

### RT — Calculadora de rateio

**Problema/público:** distribuir custos de uma compra compartilhada de maneira conferível sem precisar ingressar num workspace.

**Entradas aprovadas:** pessoas da simulação, produtos com quantidade/valor, peso opcional por unidade, participantes do produto; despesas com critério e produtos atingidos. Pessoas podem ser identificadas localmente sem criar usuários ou contatos externos.

**Regras aprovadas:** RT01 produto físico contado uma vez; RT02 igual/valor/peso entre produtos por despesa, sendo igual por unidade física e não por linha (Q43); RT03 selecionar todos ou parte dos produtos, todos como padrão; RT04 peso unitário × quantidade; RT05 um produto compartilhado divide igualmente seu custo entre pessoas selecionadas; RT06 modos personalizados entre participantes adiados; RT07 peso não é estimado; RT08 resultado total e composição por pessoa/produto.

**Contrato recomendado:** rateio em duas etapas, despesa → produtos selecionados → participantes do produto; somas fecham exatamente na unidade monetária mínima, com desempate estável. O contrato não modifica o rateio atual da Gestão. Ver exemplos no anexo.

**Saídas:** subtotal dos produtos, parcela de cada despesa e total por produto e por pessoa, com detalhes expansíveis e resumo textual copiável.

**Casos especiais/erros:** participante duplicado, produto sem responsável, seleção vazia para despesa positiva, base proporcional zero ou peso ausente devem ser explicados, sem inventar pesos ou distribuição. Zero conhecido não é ausência de informação. Remover produto/pessoa que participa de uma despesa deve expor necessidade de recomposição antes de apresentar resultado atualizado como completo.

**Persistência/acesso:** cenário público local; sem acessar dados de grupos, ledger, transferências ou quitação entre pessoas. Shared costs não duplicam quantidade por participante. Multi-moeda usa o contrato comum e deve converter para base de comparação explícita antes da alocação.

### RF — Referências de apoio à declaração

**Finalidade esclarecida:** responsáveis experientes pesquisam valores de apoio e os inserem manualmente. Não foi aprovada a substituição dessa finalidade por uma ferramenta apenas de pesquisa de preços de aquisição ou apenas de descrições/comprovantes. O usuário esclareceu que os valores não serão artificiais.

**Entradas aprovadas:** categoria/características/contexto, valor único ou faixa, moeda e unidade. Campos obrigatórios de fonte, data da pesquisa e justificativa foram rejeitados na Q29; não reintroduzi-los como aprovação implícita. Publicação e alterações têm autoria/histórico, independentes desses campos editoriais.

**Fluxo e regras aprovadas:** RF01 consulta pública no Beta; RF02 edição autenticada por Editor; RF03 rascunho/publicação explícita; RF04 sem segunda aprovação obrigatória; RF05 revisão a cada três meses com sinalização de desatualização; RF06 contribuições abertas adiadas; RF07 lançamento depende de dados suficientes/contextualizados, podendo ocorrer após as outras ferramentas.

**Saídas:** referências por produto/categoria e contexto, com moeda/unidade e estado atual/desatualizado. Não preencher automaticamente o valor de uma compra/tributo com uma referência da tabela. A pesquisa não torna uma referência prova do valor de toda operação.

**Recomendações pendentes:** prazo de três meses contado da publicação ou última revisão explícita, em meses de calendário; mera abertura de tela não renova prazo. Classificação de faixas, versões antigas e retirada de publicação ainda precisam de especificação. Não coletar dados privados da Gestão como fonte automática.

**Condição de viabilidade:** hoje não há dataset verificado, fornecedor ou pesquisa apresentada. A rejeição de evidências obrigatórias deixa pendente como demonstrar qualidade/contexto para o gate de lançamento; a recomendação é avaliação editorial documentada, sem impor formulário de fonte que o usuário rejeitou. Não declarar a tabela pronta por existir um cargo Editor.

## 5. Requisitos não funcionais e integração controlada

| Área | Requisito / condição | Estado |
|---|---|---|
| Preservação | Ferramentas não escrevem nos registros atuais; finalized snapshots, custos, saldo, refunds e QC permanecem intactos | Restrição aprovada |
| Acesso | Cálculos públicos sem login no Beta; permissões editoriais servidoras; scopes de plataforma/workspace independentes | Aprovado; matriz detalhada na Fase 3 |
| Privacidade | Rascunho opcional e apagável, sem login/sync; transferência/copiar por ação explícita | Aprovado; retenção e storage exatos pendentes |
| Dinheiro | Aritmética decimal exata/inteira, nenhuma perda de centavos, conversões versionadas e exibição explícita de unidade | Recomendação técnica derivada do domínio existente; validar no fechamento técnico |
| Resiliência | Não inventar taxa, não zerar desconhecido, preservar rascunho em erro e oferecer contingência aprovada | Parte aprovada; fluxos de falha detalhados propostos |
| Validação | Inputs limitados; erros de campo compreensíveis; nenhuma autorização por flag do cliente | Restrição técnica/recomendação; limites numéricos novos não escolhidos |
| Desempenho | Cálculos simples e resultados sem chamadas externas desnecessárias; limites para produtos/pessoas e corpos | Recomendações a dimensionar na Fase 4; sem meta de latência aprovada |
| Responsividade/acessibilidade | Manter identidade Loti, tokens, teclado, foco, reduzida animação e uso mobile | Compatibilidade requerida; UI detalhada na Fase 5 |
| Observabilidade | Eventos técnicos mínimos e erros sem conteúdo de rascunho/segredos; medição de interesse depende de decisão de analytics | Recomendação; sem contratação ou coleta nova aprovada |
| Versionamento | Resultado explicável deve identificar regras/taxa usadas; versões antigas de rascunho não são migradas silenciosamente | Recomendação para Fases 4/6 |

Não escolher biblioteca ou extrair código crítico apenas por semelhança. `cost-sharing.ts` e `financial-money.ts` são evidências de técnicas existentes, não autorização de importação direta ou refatoração. O domínio financeiro atual não aceita USD em todos os contratos e possui limites específicos; ferramenta pública precisa de contrato próprio revisado.

## 6. Critérios de aceitação consolidados

Critérios abaixo materializam decisões e propostas técnicas; os propostos não devem ser apresentados como já testados ou aprovados individualmente. Não houve execução nesta fase.

| ID | Cenário | Resultado esperado | Base |
|---|---|---|---|
| AC01 | Visitante abre qualquer uma das quatro ferramentas | Consegue calcular sem login no Beta | Q3, Q40 |
| AC02 | Produtos inseridos por total e depois detalhados | Uma única base ativa; nenhum custo duplicado | Q5 |
| AC03 | Compra já paga com BRL real e alteração de câmbio | BRL pago permanece; estimativas elegíveis mudam apenas por ação explícita | Q9, Q37 |
| AC04 | Frete/seguro desconhecido | Resultado indica incompletude, sem apresentar zero inventado ou total garantido | Q4, Q7 |
| AC05 | Cotação indisponível | Taxa manual utilizável; cache apenas se elegível e identificado | Q38; política de cache pendente |
| AC06 | Taxa fixa ou percentual | Base/encargo expostos; taxa incluída não é somada duas vezes | Q11; base detalhada proposta |
| AC07 | Vários produtos do mesmo pacote | Apenas um cenário tributário de pacote; não soma impostos como pacotes independentes | Q13; contrato recomendado |
| AC08 | UF/regime fora da cobertura ou valor acima do limite aplicável | Não usar regra genérica como cálculo válido; explicar restrição | Recomendação técnica do anexo |
| AC09 | Conversão CNY/USD/BRL, direta e inversa | Taxa/orientação visíveis, valor consistente com precisão definida | Q8; precisão pendente |
| AC10 | Dois produtos com pesos unitários e quantidades | Peso total deriva de unidade × quantidade, sem inferência | Q17 |
| AC11 | Despesa direcionada a parte dos produtos | Só os produtos selecionados recebem parcelas | Q18 |
| AC11b | Despesa R$ 40 em divisão igual, três camisetas e um tênis | Camisetas recebem R$ 30 e tênis R$ 10; agrupar camisetas em uma linha não muda o resultado | Q43 |
| AC12 | Produto compartilhado entre pessoas | Divisão igual e físico contado uma vez; totais reconciliados | Q15–Q16, Q19 |
| AC13 | Rateio que gera resto monetário | Soma exata e desempate determinístico, sem perder/criar centavos | Contrato técnico proposto |
| AC14 | Critério por peso sem dados suficientes | Não inventar peso; orientar completar dados ou escolher outro critério | Q14 |
| AC15 | Salvar, restaurar e apagar rascunho | Opcional, no navegador, sem login/sync; não duplicar histórico operacional | Q36, Q41 |
| AC16 | Transferir para ferramenta com dados preenchidos | Resumo e confirmação antes de substituir; cancelamento preserva estado | Q39 |
| AC17 | Copiar resumo | Texto com valores, moeda e premissas/pendências aplicáveis | Q20, Q42 |
| AC18 | Pessoa sem Editor tenta editar referência por request direto | Negação servidora; sem publicação parcial | Q23; matriz final Fase 3 |
| AC19 | Editor prepara e publica referência | Rascunho, publicação explícita, autoria/histórico; sem exigir campos rejeitados na Q29 | Q28–Q30 |
| AC20 | Referência chega à revisão trimestral | Sinalização de desatualização; não inventa pesquisa ou valor atualizado | Q31; marco de prazo proposto |
| AC21 | Cargo Editor e workspace de terceiros | Cargo não concede acesso aos dados privados do grupo | Q35 |
| AC22 | Executar qualquer ferramenta pública | Nenhuma alteração em compras, ledger, pacotes, pagamentos, refunds, QC ou favoritos atuais | Preservação aprovada |

## 7. Priorização inicial por valor, esforço e dependências

Estimativas qualitativas do planejamento, não medidas, datas ou prioridade comercial aprovada. O conjunto do lançamento foi aprovado; a sequência abaixo é recomendação.

| Incremento | Valor esperado / hipótese | Esforço relativo / incerteza | Dependências e momento recomendado |
|---|---|---|---|
| Contratos comuns: valores, moedas, estados, transferências e rascunho | Evitar inconsistência entre as quatro experiências | Médio; alta importância de contrato | Definir antes dos módulos; sem extrair domínio atual nesta fase |
| Conversor | Uso direto e base de conversão dos cenários | Baixo/médio de cálculo, integração com incerteza | Fonte/licença/cache definidos na Fase 4 |
| Tributação fora do PRC | Componente central da previsão de custo | Médio/alto pela atualização e cobertura | Regras/UF/câmbio fiscal e exceções confirmados antes da implementação |
| Simulador | Resolve o problema principal aprovado | Médio/alto por composição/estados/evitar duplicações | Usa contratos comuns e resultado tributário; pode aceitar valores manuais conforme contrato final |
| Rateio | Resultado útil de compra coletiva sem conta | Médio; composições e arredondamentos | Contratos de moeda/precisão e associação produto/pessoa; integra-se ao conjunto inicial |
| Referências + gestão editorial | Valor depende da pesquisa e utilização reais | Esforço editorial desconhecido; técnico médio e permissões pendentes | Após matriz Editor e comprovação de dados/contexto; não bloqueia as quatro |

Não há justificativa de produto nesta fase para microserviços, banco separado, workers, filas ou nova infraestrutura. Isso será avaliado com evidências na Fase 4, não convertido em decisão arquitetural pela priorização acima.

## 8. Decisões pendentes, riscos e critérios de fechamento

| Item | Estado / encaminhamento | Consequência |
|---|---|---|
| Unidade comercial da assinatura e alcance no workspace | Decisão humana na Fase 3 | Não presumir Pro individual/grupal |
| Benefícios Free/Pro, Beta, avisos, fundadores e direitos existentes | Fase 3 | Público gratuito agora não é promessa de gratuidade permanente de todas as capacidades |
| Permissões Editor e cargos do grupo, concessão/revogação/transferência | Fase 3 | Nomes aprovados não autorizam mudar a autorização atual |
| Provedor de câmbio, frequência, licença, idade máxima e fallback | Pesquisa/comparação na Fase 4 | Conversor automático ainda não tem integração pronta |
| Recorte fiscal exato, regras por UF/vigência e câmbio fiscal | Base preliminar no anexo; completar versão verificável antes da implementação, consolidar na Fase 6 | Calculadora não é especificação tributária universal |
| Bases percentuais e regra de encargos já incluídos | Propostas no anexo, sujeitas à aprovação do contrato final | Evitar dupla cobrança ou incidência circular |
| Qualidade e responsável operacional da tabela | Condição de lançamento; dataset ainda não apresentado | Sem fontes obrigatórias no formulário, a aprovação editorial não prova confiabilidade automaticamente |
| Início/renovação dos três meses e visibilidade de versões antigas | Recomendação no contrato da tabela; confirmar na especificação final | Não renovar apenas por acesso/edição cosmética |
| Retenção/limites/recuperação do rascunho e exportação textual | Fases 4–5 e contrato final | Guardar localmente tem limites; não prometer recuperação em outro navegador |
| Limites de produtos/pessoas/valores e metas de desempenho | Fase 4 com orçamento e cenários | Não escolher limites comerciais por conveniência técnica |
| Sucesso quantitativo do Beta | Sem metas numéricas aprovadas; Fases 3/6 | Interesse, recorrência, entendimento e qualidade são objetivos, não métricas reais coletadas |

Riscos principais: dar poder global a um papel de grupo; restringir retroativamente os atuais usuários; misturar valor de referência com desembolso ou base fiscal real; atualizar resultados sem controle; lançar fonte tributária/cambial sem manutenção; publicar tabela sem dados adequados; subestimar o esforço editorial. Nenhum desses riscos autoriza alteração do sistema existente.

As rodadas de escopo foram concluídas e consolidadas para revisão. Q43 resolveu a divisão igual por unidade física. Os entregáveis da Fase 2 estão completos para aprovação, com decisões expressamente encaminhadas às fases próprias e recomendações técnicas identificadas. Isso não declara o produto inteiro pronto para desenvolver nem a Fase 6 concluída.

## 9. Próxima fase proposta e autorização

**Fase 3 — Free/Pro, autenticação, cargos e monetização.** Objetivo: definir acesso público/autenticado, limites/benefícios, unidade da assinatura, independência de papéis, proteção dos atuais, Beta e cobrança futura. Consultas previstas: pedido original, registros desta descoberta, auditoria atual e fontes oficiais de provedores de assinatura compatíveis com o Brasil. Comparação é investigação, sem contratação/configuração.

Entregáveis: matriz Free/Pro/Beta; matriz de cargos de plataforma e workspace; regras de acesso/entitlements; transição do Beta; política de usuários existentes; contrato preliminar de assinatura e riscos de colaboração/abuso. R$ 19,90/mês continua hipótese comercial; nenhuma cobrança autorizada.

Solicitar revisão/ aprovação dos entregáveis da Fase 2 e autorização explícita para iniciar a Fase 3. A próxima fase não começa automaticamente.
