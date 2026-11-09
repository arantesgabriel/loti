# Loti — contratos de cálculo, evidências e recomendações da Fase 2

Consulta/consolidação: 22/10/2026. Documento de planejamento, sem código executável, testes de aplicação ou mudança no sistema. Complementa `02_MATRIZ_E_REQUISITOS.md`.

**Estados:** decisões de produto são as respostas Q1–Q42; fontes oficiais são fatos consultados com cobertura limitada; fórmulas/contratos de aplicação e fixtures abaixo são propostas técnicas para revisão, não decisões comerciais nem implementação autorizada. Fonte cambial, licença, cache, limites e infraestrutura pertencem à Fase 4. O fechamento de especificações pertence à Fase 6.

## 1. Fontes primárias consultadas

| ID | Fonte | Uso e limite |
|---|---|---|
| S1 | [Receita Federal — Tributação de remessas](https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/manuais/remessas-postal-e-expressa/topicos/tributacao) | Base preliminar de cobertura RTS, regras gerais, conversão fiscal e cálculo estadual; não substitui conferência de normas/vigência no lançamento |
| S2 | [Receita Federal — Quais são os impostos?](https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/manuais/remessas-postal-e-expressa/preciso-pagar-impostos-nas-compras-internacionais/quais-sao-os-impostos-devidos) | Confirma distinção PRC/fora do programa e explicação de II/ICMS; escopo público solicitado é fora do PRC |
| S3 | [Receita Federal — Calculadora de impostos](https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/manuais/remessas-postal-e-expressa/calculadora-de-impostos-portal-aduana-e-comercio-exterior) | Referência de apresentação e alerta sobre diferenças estaduais; não copiar seu default como alíquota de todas as UFs |
| S4 | [Comsefaz — Informações fiscais](https://comsefaz.org.br/novo/informacoes-fiscais/) e [PDF vinculado na consulta](https://comsefaz.org.br/novo/wp-content/uploads/2025/12/Aliquota-ICMS-import.-RTS-por-UF-17-e-20-CV81-23-v22-12-2025.pdf) | Fonte estadual vinculada pela Receita; documento obtido tem revisão indicada de 22/12/2025. Não foi feita auditoria normativa individual das 27 UFs |
| S5 | [Receita Federal — Perguntas e respostas](https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/manuais/remessas-postal-e-expressa/topicos/Perguntas_e_Respostas) | Consulta contextual sobre declaração/documentação; não certifica valores editoriais específicos |
| S6 | [IN RFB 1.737/2017 — página multivigente](https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=86226) | Referência normativa inicial; leitura multivigente exige atenção a redações alteradas e respectivas datas |

Não foi presumida API tributária oficial. Não foram consultadas contas HubBuy, serviços autenticados de importação, documentos pessoais, comprovantes privados ou dados reais de remessas. A tabela editorial não constitui fonte normativa da calculadora.

## 2. Tributação: fatos consultados e recorte recomendado

Na orientação da Receita consultada, RTS cobre remessas elegíveis com valor aduaneiro de até US$ 3.000 equivalentes, incluindo bens, frete e seguro. A regra geral fora das específicas usa II de 60%. O ICMS é estadual, calculado por dentro e inclui II na base. A conversão fiscal considera a data do registro da declaração; não é necessariamente a taxa paga pelo comprador. Fontes: S1–S2.

O Comsefaz disponibiliza tabela por UF (S4); a página da calculadora da Receita alerta para diferenças estaduais (S3). A existência dessa tabela não prova vigência de cada linha no futuro lançamento. Revalidar a combinação UF, enquadramento e data, com versão rastreável, antes de implementar/publicar.

### Modelo preliminar para o cenário comum elegível

Proposta a verificar no fechamento técnico, com valores já expressos em BRL e sem custos duplicados:

- `A = bens + frete + seguro`, nos componentes admitidos da base aduaneira.
- `II = A × 0,60` no cenário geral fora do PRC descrito acima.
- `ICMS = (A + II) × a / (1 − a)`, sendo `a` a alíquota válida da UF/cenário.
- `Tributos = II + ICMS`.

Não aplicar automaticamente essa regra a mercadorias/regimes especiais, tratamentos de isenção, bagagem, valores fora do limite ou enquadramento não suportado. O produto precisa informar sua cobertura e suspender o resultado fiscal quando não houver regra validada. Isso não exige suspender toda a simulação de custos não tributários, desde que a parcela pendente seja visível.

### Separação entre bases

Proposta de contrato interno, sem escolher tabelas ou implementação:

1. **Valor de aquisição/origem:** preço da operação, sua moeda e componentes identificados.
2. **Conversão de planejamento:** taxa de referência ou personalizada aprovada para estimativas econômicas.
3. **Desembolso real informado:** BRL efetivamente pago, preservado; ausência não vira zero.
4. **Conversão fiscal estimada:** premissa para projetar tributos, com origem/data e distinção da taxa efetiva de pagamento.
5. **Referência editorial:** valor/faixa contextualizado para consulta, sem substituir automaticamente 1, 3 ou 4.

A composição aprovada de custos do simulador não significa que toda despesa econômica componha a mesma base tributária. Serviços, taxas de pagamento e despesas adicionais exigem classificação e conferência normativa; não somar todo o custo da importação indiscriminadamente para aplicar impostos.

O usuário confirmou um pacote por simulação; o recorte de público e as exceções elegíveis precisam constar na especificação final. Não alegar suporte a toda pessoa física/jurídica, categoria ou regime a partir dessa confirmação.

## 3. Conversão e precisão — contrato técnico proposto

- Identificar taxa por par e orientação: por exemplo, BRL por CNY. Valor de cotação não é quantia monetária com apenas duas casas; preservar precisão suficiente e definir escala/racional no contrato final.
- Usar aritmética decimal exata ou razões inteiras com limites; arredondar em fronteiras explícitas, não a cada operação intermediária por conveniência de `number`.
- Conversão direta `resultado = valor × taxa`; inversão somente se a taxa for positiva e identificada. Um resultado inverso de um valor exibido/arredondado pode ter diferença de centavos; não prometer round-trip exato a partir da exibição.
- Moedas iguais não exigem busca externa. Taxa ausente, zero, negativa ou sem par coerente não produz resultado numérico válido.
- Conversões cruzadas precisam de par/instante coerentes; não misturar uma taxa manual e uma cotação nova de modo silencioso. Não reescrever uma taxa personalizada quando a referência atualiza.
- Fonte e data são parte do contexto do cenário. Cotação de mercado não representa automaticamente a taxa da intermediadora, IOF, spread ou comissão.
- A atualização é explícita; restaurar rascunho antigo não o recota silenciosamente. Validade de cache e eventual sugestão de nova referência dependem da licença/fonte na Fase 4.
- A política final de arredondamento precisa conciliar precisão interna, moeda de saída e fórmulas oficiais. A técnica existente da Gestão é evidência, não contrato automaticamente aprovado para USD ou conversão pública.

Evidência local por leitura: `src/lib/domain/financial-money.ts:25–59` tem razão inteira/metade para cima e par capturado histórico; seu tipo de moeda atual é CNY/BRL. Não alterar ou ampliar o helper nesta fase.

## 4. Composição e estados de custo — contrato técnico proposto

### Valores e pagamentos

Manter dimensões independentes: valor conhecido/estimado/desconhecido e informação de pagamento integral/não pago. Despesa desconhecida não recebe valor zero. Um valor pode ser conhecido e ainda não pago; a cotação de planejamento não confirma pagamento.

O custo completo inclui despesas pagas e não pagas, sem duplicação. O restante é a soma das despesas não pagas determináveis, com indicador de incompletude se houver parcela pendente. Despesa paga sem BRL real informado deixa o custo completo histórico incompleto; uma conversão estimada pode ser apresentada separadamente, sem renomeá-la como desembolso real.

Não modelar saldo CNY, direitos individuais, cartão parcelado, adiantamentos ou quitação entre pessoas dentro da ferramenta pública por inferência. Esses conceitos existem na Gestão, mas não foram aprovados como parte deste simulador.

### Taxas fixas/percentuais

Recomendação de entrada: escolher valor fixo conhecido ou percentual com base nomeada e visível. Exemplos de bases a avaliar: subtotal dos produtos, frete internacional ou grupo de componentes de uma etapa. Não escolher bases arbitrárias para o usuário nem presumir taxa comercial padrão da HubBuy.

Proposta para encargos embutidos: identificar se o valor informado é principal ou total que já inclui determinada taxa. Somente derivar taxa incluída quando base/regra estiverem definidas; caso contrário, preservar o total informado e evitar adicionar a mesma parcela. Esse detalhamento ainda não foi aprovado individualmente.

Evitar fórmulas circulares, como taxa incidindo no próprio total com taxa, sem contrato específico. Não presumir taxa de pagamento sobre saldo CNY ou despesas já quitadas; a ausência de pagamento processado na ferramenta elimina necessidade de executar cobranças ou webhooks.

## 5. Rateio — contrato recomendado e exemplos de aceitação

Os métodos de produto foram aprovados: igual/valor/peso por despesa, produtos atingidos explícitos e divisão igual entre participantes de um produto. O algoritmo determinístico abaixo é recomendação técnica para fechar os totais, não mudança no domínio atual.

### Duas etapas

1. Formar os produtos elegíveis da despesa.
2. Gerar pesos: no critério igual, usar a quantidade de unidades físicas de cada produto, conforme Q43 aprovada; no critério valor, usar subtotal convertido; no critério peso, usar peso unitário × quantidade. Não dividir igualmente por linha. A política de restos deve preservar o fechamento e evitar que apenas reagrupar unidades altere indevidamente o resultado; representação e desempate exatos continuam no contrato técnico.
3. Distribuir o valor da despesa em unidades monetárias mínimas por esses pesos, usando divisão inteira, restos e desempate de ordem estável.
4. Para cada produto, repartir suas parcelas/componentes igualmente entre as pessoas selecionadas, preservando fechamento de cada componente e dos totais.
5. Somar por produto/pessoa sem multiplicar unidades ou custo físico por número de participantes.

Se a soma dos pesos for zero, uma despesa positiva não pode ser alocada proporcionalmente. Peso ausente não equivale a zero. Não trocar automaticamente para divisão igual; preservar o cenário e solicitar dados ou escolha de critério. Ordem de desempate não deve depender de ordenação por nome nem da mudança de nome.

### Fixtures propostas (conferência aritmética; nenhum teste executado)

| Caso | Entradas | Resultado esperado |
|---|---|---|
| Igual com resto | R$ 100,00 para três destinos iguais, ordem A/B/C | R$ 33,34; R$ 33,33; R$ 33,33; soma R$ 100,00 |
| Igual por unidade | Três camisetas e um tênis; despesa R$ 40 | Camisetas R$ 30, tênis R$ 10, quer as camisetas estejam numa linha com quantidade 3 ou em linhas separadas |
| Menor unidade | R$ 0,01 para três destinos iguais | Um único destino recebe R$ 0,01, sem criar centavos |
| Peso e valor combinados | Produto A: R$ 100 e 1 kg; B: R$ 200 e 3 kg; frete R$ 40 por peso; outra despesa R$ 60 por valor | Frete A/B: R$ 10/R$ 30; outra: R$ 20/R$ 40; totais A/B R$ 130/R$ 270; soma R$ 400 |
| Produto compartilhado | Produto de R$ 90,00 dividido entre duas pessoas | R$ 45 cada e um único produto físico |
| Quantidade e peso | Duas unidades, 0,5 kg por unidade | Peso total 1 kg; quantidade não é número de participantes |
| Despesa seletiva | Três produtos, despesa apenas para A e C | B recebe zero dessa despesa, sem alterar seu preço base |
| Dados insuficientes | Despesa por peso com produto elegível sem peso | Rateio incompleto/erro contextual; nenhum peso inventado |

As técnicas de inteiro/maior resto e ordem estável existem em `cost-sharing.ts:25–87` e cálculos de pacotes, mas contratos de input e modos diferem. Não importar serviços mutáveis da Gestão nem refatorar seus cálculos como parte da expansão sem autorização específica futura.

## 6. Exemplos do simulador e tributos

Fixtures sintéticas para especificação, sem vínculo com produto/pessoa ou remessa real:

- Produtos efetivamente pagos por R$ 300; despesas previstas ainda não pagas R$ 100: custo projetado R$ 400 e restante R$ 100. Uma cotação nova não altera os R$ 300 informados como reais.
- Frete internacional desconhecido: a soma dos demais valores pode ser informada, mas o custo completo permanece incompleto. Não rotular a soma como custo garantido da importação.
- Base hipotética BRL de 1.000, II de 60% e ICMS hipotético de 20%, sob regra descrita na seção 2: II 600, ICMS 400 e tributos 1.000. É exercício aritmético com premissas explícitas, não determinação de alíquota de uma UF ou cobrança real.
- Produto, frete ou seguro já agregados: a interface precisa identificar composição para não contá-los novamente na base ou no custo.
- Categoria com tratamento especial: não usar uma referência de tênis/camiseta ou um default fiscal para assegurar elegibilidade de medicamento/livro ou outra exceção. Cobertura deve ser explicitada.

## 7. Decisões técnicas pendentes e onde fechar

| Tema | Recomendações / informações faltantes | Fase de fechamento |
|---|---|---|
| Câmbio | Provedor, termos, atualização, licença/cache, idade máxima, fonte fiscal, precisão e pares cruzados | 4; contrato final em 6 |
| Tributos | Mapa vigente por UF, exceções/cobertura, data da regra e cálculos oficiais/rounding | 4/6; revisão antes do lançamento |
| Percentuais | Bases disponíveis, valores embutidos, incidência e composição por etapa | Especificação final; decisão humana se surgir alternativa relevante |
| Rateio | Unidade física aprovada na Q43; falta ordem estável de restos, representação que preserve agrupamento e fechamento dos componentes | Especificação técnica final; não reabrir a unidade já aprovada |
| Rascunho | Um slot por ferramenta como proposta, retenção, versão do formato, recovery e storage indisponível | 4–5/6 |
| Revisão de referências | Três meses de calendário; proposta de marco na publicação/última revisão explícita, fuso/data e permanência de versões antigas | 5/6 |
| Editor | Campos/configurações editáveis, concessão de cargo, publicar/despublicar e responsabilidade sobre regras críticas | 3; desenho técnico em 4 |
| Tabela | Dataset e comprovação de contexto/qualidade sem tornar obrigatórios campos rejeitados pelo usuário | Gate editorial antes do lançamento |
| Limites | Quantidade de pessoas/produtos, magnitudes, corpos, mensagens e desempenho | 4, com orçamento e demanda |

Não há neste documento contratação, implementação, configuração de segredos, planilha operacional, dataset de valores a declarar ou autorização para alterar dados reais. O anexo delimita o que é verificável e o que ainda precisa de fechamento para impedir que decisões técnicas implícitas sejam tratadas como aprovadas.
