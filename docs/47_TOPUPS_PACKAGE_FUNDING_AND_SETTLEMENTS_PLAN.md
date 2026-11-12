# Recargas, pagamento do frete com saldo e acertos entre pessoas

Data: **12/11/2026**. Status: **plano para implementação futura; nenhuma funcionalidade implementada por este documento**.

## 1. Pedido, autorização e resultado

Planejar integralmente seis funcionalidades: (F1) recarga com taxa e financiadores; (F2) pagamento do frete com consumo de saldo; (F3) divisão do frete e da taxa por unidade; (F4) posição financeira individual; (F5) conversão explícita do acerto para BRL; (F6) registro manual de pagamentos/recebimentos entre participantes.

O pedido atual autoriza **documentação e investigação local**, não código de aplicação, migration executada, lançamento real, commit, publicação ou configuração externa. A execução futura depende de pedido de implementação. Credenciais e dados de produção não devem ser incluídos em fixtures ou no repositório. Acesso anterior ao browser foi somente leitura e não constitui autorização para gravar fatos financeiros.

Resultado final: registrar uma recarga efetivamente recebida, financiar o frete com os lotes corretos, distribuir os encargos pelas unidades físicas e participantes, explicar quem financiou cada parcela e registrar os acertos reais sem planilha. Não processar PIX nem movimentar dinheiro externamente.

### 1.1 Fontes e preparação do executor

Ler AGENTS.md, PROMPT_ONE_SHOT.md e documentos 00–17 na ordem canônica. Depois ler integralmente 20, 21, 23, 26, 28, 29, 34, 37, 38, 39, 40 e 42; consultar 24, 45 e 46 para preservar QC, paginação, seleção e contratos de conflito. Ler este plano completo e revalidar os símbolos no checkout.

Este plano amplia pontualmente a exclusão de recarga com taxa do plano 37 e de acerto de frete entre pessoas dos planos 21/39. Preserva direitos individuais, bases históricas, imutabilidade, autorização e logística. Não reabrir compra finalizada, não reconstruir o MVP e não reaplicar restrições antigas já superadas pelos planos 39/42.

No planejamento, `next-env.d.ts` e `tsconfig.json` estavam modificados; `reset-password.sh` e `tmp/` eram não rastreados. Preservar trabalho alheio. Não ler/exibir `.env`, copiar produção ou assumir que alterações existentes pertencem a esta entrega.

## 2. Regras confirmadas e propostas que exigem escolha explícita

### 2.1 Confirmado pelo usuário

- O saldo anterior deve abater a parte individual no frete; não é caixa coletivo sem titular.
- O usuário financiou a recarga nova e quer saber quanto cada participante deve transferir ou receber.
- Frete e taxa são distribuídos **por unidade física**, não por preço, massa, número de pessoas ou número de linhas. Dez unidades de duas pessoas, cinco de cada, dividem R$100 em R$50 para cada.
- Produtos compartilhados contam uma vez; a parcela de cada unidade segue os pesos de participantes preservados do item.
- O fluxo é manual e analítico; não há autorização para alterar registros reais.

### 2.2 Propostas de produto deste plano

Não apresentar estas propostas como decisões já aprovadas na conversa. Implementá-las como escolhas explícitas na prévia, sem gravar um default silencioso. A preparação sintética pode usar o perfil proposto abaixo; a operação real precisa confirmar seus parâmetros.

| Escolha | Proposta | Alternativa integralmente suportada |
| --- | --- | --- |
| Quanto do saldo usar | Selecionar titulares e valores; sugerir saldo antigo elegível antes da recarga nova | Uso parcial por pessoa, preservando o restante |
| Saldo alheio | Exibir e confirmar financiamentos cruzados e respectivos credores/devedores | Rejeitar o uso quando não autorizado; permitir rever a composição |
| Forma de acerto | Centralizar em uma pessoa escolhida, com compensação multilateral explícita e rastreável | Manter obrigações diretas por par, sem compensação central |
| Cotação do acerto | Par inteiro efetivo da recarga selecionada, excluindo taxa | Par BRL/CNY manual com data, motivo e confirmação |
| Conversão | Confirmar uma versão de conversão antes de registrar PIX BRL | Manter obrigação em CNY enquanto não houver referência escolhida |
| Resto na conta | Pertence aos titulares dos lotes efetivamente não consumidos | Não presumir titular pelo extrato agregado |

A escolha da referência de acerto **não reavalia** a base BRL de créditos antigos. A autorização de uso do saldo de outra pessoa deve existir no comando e no histórico. O autor do registro, o financiador e a pessoa centralizadora são campos diferentes.

Não há necessidade de aprovação adicional para cada fase de implementação local depois de um pedido de implementação. Dúvidas sobre valores reais não bloqueiam código e testes sintéticos. Sem escolha econômica confirmada, a interface mantém a prévia pendente e não emite obrigação convertida automaticamente.

## 3. Evidência técnica e reaproveitamento

Inspeção local em 12/11/2026; revalidar antes de implementar:

| Área existente | Constatação | Consequência |
| --- | --- | --- |
| `hubbuy-balance-services.ts`, `hubbuy-balance-adjustments.ts` | Ledger, parcelas individuais, FIFO, revisão, conciliação, ajustes e reversões já existem | Reutilizar; não registrar recarga como bônus ou ajuste genérico |
| `purchase-cost-order-services.ts` / `recordMixedPaymentInTransaction` | Consome saldo com base histórica e gera financiamento de adicionais | Extrair apenas primitivas compartilháveis; não criar pedido fictício para pagar frete |
| `member_balance_financing_entries` | Consumo obrigatório e obrigações CNY de adicionais; baixa existente | Não serve diretamente para taxa BRL e dinheiro novo sem consumo; evitar duplicar a mesma dívida |
| `package-cost-services.ts` / `settleAdditionalOrderAdvance` | Liquidação manual por consumo já implementada | Preservar integralmente; integrar leitura por origem, sem baixar obrigação antiga como efeito de acerto de pacote |
| `logistics-package-services.ts` | Encargos `record_charge/pay_charge/correct_charge`, método PIX/cartão, taxa sobre BRL informado | Criar protocolo de financiamento real do frete; `paidAt` não basta para debitar saldo |
| `logisticsManifests`, `warehouse-calculations.ts` | Manifestos, unidades e matriz pessoa/unidade existem | Versionar o snapshot financeiro e preservar manifestos anteriores |
| `logistics-financials.ts` | Encargos novos e ponte de legado têm propriedade financeira explícita | Acrescentar terceiro modo, sem somar legado + escalar + financiamento novo |
| `hubbuy-balance-traceability*.ts` | Destinos de compras e outros débitos têm tratamentos diferentes | Mostrar recarga e pacote como origens/destinos próprios, sem chamar frete de ajuste |
| Autorização e plano 42 | Operação pessoal aceita somente titular, compartilhada exige membership | F1–F3 funcionam nos dois; F4–F6 entre pessoas são shared-only |
| `financial-money.ts` | Inteiros, BigInt, limites, taxa e conversão por par capturado | Reutilizar; acrescentar cálculo assinado/compensação sem usar formatador não negativo indevidamente |

O journal local termina em `0033_onboarding_milestones`; não reservar número de migration neste plano. Usar o próximo número disponível no momento da execução. Não editar migrations aplicadas.

## 4. Modelo financeiro: três projeções, sem dupla contagem

### 4.1 Saldo físico e direitos

```text
saldo_conta_CNY = créditos_CNY - débitos_CNY
direito_pessoa_CNY = parcelas_creditadas - consumos_dos_seus_lotes
soma(direitos_disponíveis_CNY) = saldo_conta_CNY
```

Uma recarga aumenta o saldo físico uma vez. Pagar o frete o reduz uma vez. Um PIX entre pessoas não altera o saldo HubBuy. Acerto registrado não torna o saldo de outra pessoa propriedade do autor da operação.

### 4.2 Custo histórico do pacote

```text
custo_histórico_frete_BRL = base_principal_BRL_dos_lotes_consumidos
                          + principal_BRL_externo_direto_se_houver
                          + taxas_BRL_atribuídas_uma_vez
```

Recarga não é despesa de produto/frete no momento em que entra. A base principal entra no custo quando consumida. A taxa fica identificada separadamente, nunca embutida na base principal e cobrada de novo. Bases antigas podem ser zero por bônus; desconhecida não vira zero. A simulação/pesagem já registrada permanece despesa/saída separada do saldo e não reaparece no frete.

Distribuir o custo histórico agregado de cada encargo por unidades e pesos, preservando somas e genealogia. A base histórica transportada pelo financiador e a parcela de custo atribuída ao beneficiário são dimensões diferentes; registrar os vínculos, não presumir que sejam iguais por pessoa. Não alterar o cálculo dos pagamentos antigos de produtos.

### 4.3 Obrigação e financiamento do acerto

Para cada pessoa, com sinal positivo indicando que precisa pagar:

```text
posição_principal_CNY = obrigação_frete_CNY - saldo_próprio_consumido_CNY
posição_taxa_BRL = taxa_atribuída_BRL - taxa_financiada_BRL
```

`saldo_próprio_consumido` inclui recargas financiadas pela pessoa e créditos antigos. A soma das posições principais é zero em pagamento integral com saldo; a soma das posições de taxa também é zero. Nos métodos externos diretos, registrar o financiador equivalente e converter apenas a parcela necessária, com referências explícitas.

No modo misto com total nativo CNY conhecido, `posição_principal_CNY = obrigação_CNY - saldo_próprio_consumido_CNY - CNY_financiados_diretamente_pela_pessoa`. A parcela externa tem par comprovado e base histórica próprios; a referência de acerto é selecionada separadamente. No modo externo legado apenas BRL, manter principal/financiamento/obrigação em BRL, sem inventar total CNY. Não permitir somar principal BRL desse modo com principal CNY convertido da mesma obrigação. Cada acerto declara a moeda nativa e sua modalidade; o conversor só atua nas obrigações nativas CNY. Taxas diretas e taxas de recarga possuem fontes diferentes e não podem financiar a mesma parcela duas vezes.

Uma posição negativa é valor a receber, não desconto perdido, saldo físico novo ou principal negativo no ledger. Armazenar obrigação com devedor/credor e magnitude positiva; usar sinal apenas nas projeções. Não truncar valores negativos para zero. A parte própria do centralizador não é recebível contra ele mesmo.

O custo histórico BRL e o acerto convertido BRL podem diferir. Mostrar ponte explicativa de fontes/pares históricos versus par do acerto. Não fabricar ganho, perda ou ajuste de saldo para igualar essas duas visões e não somá-las no consolidado.

## 5. F1 — recarga com taxa e financiadores

Entrada em **Contas HubBuy → Ações → Registrar recarga**. Campos:

- Conta ativa e conciliada, ocorrência com offset/data explícita, referência externa e motivo/descrição.
- CNY efetivamente recebidos, principal em BRL e taxa em BRL; método PIX/cartão e percentual capturado quando aplicável.
- Modo de entrada `principal + taxa` ou `total com taxa`. Ambos mostram principal, taxa e total antes de confirmar.
- Financiadores com parcelas explícitas de principal BRL, CNY e taxa BRL. Default de UI pode ser usuário atual, mas o servidor não infere titular por `actorId`.
- Taxa percentual ou valor efetivo conhecido; divergência entre comprovante e cálculo exige modo de taxa efetiva e motivo, não arredondamento escondido.

No modo total com taxa, não dividir silenciosamente por um decimal: procurar principal inteiro `p` tal que `p + roundHalfUp(p × bps/10000) = total`. Se houver ambiguidade/ausência de solução, pedir os valores discriminados. Exemplo: 35242 = 34893 + 349 a 100 bps.

A confirmação grava operação tipada de recarga, crédito no ledger, parcelas de titularidade e metadados de taxa na mesma transação. A soma de CNY fecha com o crédito; a soma de principal/taxa fecha com o comprovante. `historicalBrlCents` do lote contém apenas principal. Nenhuma dívida de grupo nasce só por recarregar.

Taxas têm capacidade própria por recarga. Default sugerido ao consumir parcialmente: parcela proporcional ao CNY da recarga consumido, pelo acumulado consumido, com resto absorvido no último consumo. Permitir atribuição explícita de taxa a destinos autorizados, sempre limitada ao total ainda não atribuído e visível na prévia. Não cobrar a taxa inteira em cada pacote. Registrar cada financiamento da taxa por pessoa.

Anular recarga não consumida restaura exatamente principal, CNY e taxa ainda livre; registrar compensação. Se parcialmente consumida ou com taxa já atribuída, bloquear anulação comum e orientar correção das operações dependentes. Não editar crédito original.

Nesse contexto, restaurar significa retornar à posição anterior ao registro: debitar o crédito incorreto, compensar seus metadados e retirar a taxa pendente. Não registrar entrada bancária ou retirada real da HubBuy por consequência da anulação de um erro de cadastro.

## 6. F2 — financiamento do frete com saldo

Em **Pacotes → detalhe → Frete Brasil**, separar `informar encargo`, `conferir financiamento` e `confirmar pagamento observado`. Suportar:

1. Saldo HubBuy integral, incluindo saldo previamente recarregado.
2. PIX/cartão direto já suportado, mantendo compatibilidade e financiador explícito no protocolo novo.
3. Saldo + complemento direto efetivamente pago fora da carteira. Não criar crédito de recarga se esse complemento não entrou na carteira.

Selecionar lotes/titulares e quantidades CNY com sugestão do servidor. Usar FIFO **dentro do titular selecionado** por sequência persistida, nunca reordenar pela ocorrência de um lançamento tardio. A prévia exibe saldo antes/depois por pessoa/conta, bases BRL, taxas, financiamentos cruzados e composição por unidade.

Transação: autorizar recursos e contexto → recuperar idempotência → validar revisões de conta, pacote, conteúdo e taxas → conferir pagamento anterior/legado → recomputar prévia → gravar operação, fontes, débito, consumos, parcelas e taxa atribuída → atualizar projeções/CAS → verificar invariantes → commit. Qualquer falha desfaz tudo. Pagamento com saldo não gera `purchase_payment` fictício de produtos.

Pagamento pode preceder fechamento do conteúdo, como hoje. Nesse caso capturar composição financeira provisória explícita: mudanças de conteúdo invalidam o rateio/acerto corrente e exigem revisão; pagamento e débito físico permanecem. Não emitir acerto liquidável enquanto conteúdo estiver aberto. Fechar conteúdo captura o vínculo definitivo; fechar sozinho ou pagar sozinho não promove a etapa. Despachar continua exigindo fechado+pago. Nenhum pagamento prova despacho.

Pagamento externo direto e pagamento com saldo possuem referências disjuntas para impedir duplicata. `no_charge` não gera débito nem pagamento monetário de zero. `pending` não pode ser confirmado sem valor. Frete pago já existente exige tratamento de compatibilidade, nunca novo débito automático.

## 7. F3 — rateio determinístico por unidade

- Unidade elegível: `(costItemId, unitIndex)` da reserva ativa no pacote; contar apenas uma vez. Linha de quantidade 5 tem peso físico 5; kit comprado com quantidade 1 continua uma unidade operacional, sem inferir número de peças pelo nome.
- Etapa 1: distribuir total CNY do frete pelas unidades físicas, pelo maior resto e ordem estável persistida.
- Etapa 2: distribuir parcela de cada unidade pelos pesos de participantes preservados, com matriz de margens exatas. Percentuais/valores fixos de origem tornam-se pesos financeiros conforme regras atuais, não massa física.
- Etapa 3: distribuir encargos históricos BRL e taxa atribuída usando as mesmas unidades/participantes, cada moeda separadamente. Não arredondar um preço unitário e multiplicá-lo.
- Persistir margens por fonte, encargo, unidade e pessoa. Somas de parcelas fecham total global, por encargo e por fonte; centavos não mudam ao filtrar, renomear ou paginar.
- Para taxa de recarga de outro destino, não incluir aqui. Para taxa já atribuída ao pacote, não aplicar novamente `freightFeeBps` sobre o frete total.
- Manifesto financeiro novo tem versão própria, referências de valoração/fontes e hash de conteúdo. Leitor versionado preserva V1; não editar JSON histórico.

A UI informa a regra e permite abrir o cálculo por unidade/pessoa, sem criar novos modos de rateio por massa/preço nesta extensão. O peso informativo do pacote continua sem efeito nos custos.

## 8. F4/F5 — obrigações, compensação e conversão

### 8.1 Prévia e emissão do acerto

Mostrar por pessoa: unidades equivalentes, obrigação CNY, saldo próprio efetivamente consumido, taxa devida/financiada, valores a pagar/receber e fontes. Apresentar frações de unidade apenas como equivalência financeira, não como estoque fracionário.

Um acerto liquidável exige conteúdo fechado, pagamento confirmado e fontes/taxas resolvidas. Não exigir Receita resolvida para acertar frete; o escopo é `freight`, não todo o financeiro do pacote. Nova Receita não altera acerto do frete confirmado.

Capturar snapshot das obrigações e fontes com versão, IDs de participantes, política, ordem estável e centralizador opcional. A prévia de compensação mostra obrigações diretas e equivalência do resultado centralizado; confirmar a compensação é um evento próprio, sem transferir saldo físico. Pessoa que excede sua parte mantém crédito e aparece como credora. Sem compensação confirmada, conservar os pares diretos.

Não gravar simultaneamente o mesmo financiamento em `member_balance_financing_entries` e no novo livro de acertos de pacote. Esse livro será a fonte única para F4–F6 de pacote; os adiantamentos antigos de pedidos mantêm sua fonte atual. A leitura consolidada identifica o escopo de cada obrigação, sem quitação cruzada automática.

### 8.2 Conversão e arredondamento

- Par capturado `{fromCnyMinor > 0, toBrlCents > 0}`, data, origem e motivo. Cotação de mercado/API ou recálculo automático não fazem parte do escopo.
- Taxa de recarga não entra no par: principal BRL / CNY creditados. Taxa é obrigação BRL separada.
- Várias recargas não autorizam escolher cotação média escondida: selecionar uma referência de acerto ou informar par manual; mostrar a escolha.
- Congelar principal convertido e taxa por pessoa antes da emissão BRL. Conservar obrigação CNY e referências para auditoria; BRL emitido governa as baixas PIX, sem reconversão a cada parcela.
- Calcular valores assinados por BigInt/racionais. Aplicar **maior resto balanceado**: piso matemático inclusive para negativos, distribuir centavos pela fração e ordem estável até a soma-alvo. Converter vetor de posições cuja soma é zero com alvo BRL zero; não arredondar cada ponta de uma dívida independentemente.
- Alocar taxa BRL em vetor próprio com soma zero (devido menos financiado); então somar principal e taxa. Exibir ajuste de centavos quando a visualização de valores intermediários arredondados não explicar a soma.
- No modo por pares, converter cada obrigação uma vez e compartilhar o mesmo valor entre devedor/credor. Não prometer equivalência centavo a centavo com modo centralizado; a política/ordem escolhida fica congelada e visível.

Os resultados numéricos da conversa eram uma proposta com arredondamento final independente. Não congelá-los como fixtures sem este contrato: o cálculo balanceado pode mudar um centavo. Aceite exige conservar total e explicar o ajuste, não adulterar arredondamento para reproduzir texto anterior.

### 8.3 Revisões

Antes de qualquer baixa, substituir uma versão de acerto com motivo e evento compensatório; a versão anterior permanece consultável. Depois de baixa parcial/total, correção emite somente diferença ligada à versão anterior, podendo inverter credor/devedor. Não reapresentar o valor integral como dívida nova e não apagar PIX já recebido.

Mudar centralizador/política após pagamentos exige correção explícita e reaproveitamento rastreado dos valores já liquidados; bloquear alteração simples. Reabrir financeiro/logística não reabre nem desfaz o acerto automaticamente.

## 9. F6 — registrar transferências reais

Surface **Registrar pagamento recebido/realizado**, sempre vinculada a obrigação/versão autorizada: devedor, credor, BRL efetivamente transferido, data de ocorrência, referência opcional e motivo. O autor pode registrar fatos do grupo conforme direitos colaborativos existentes; não se confunde com pagador econômico.

- Suportar parcial, integral e várias transferências. Alocar recibo a obrigações específicas com capacidade restante; não cruzar workspace, conta, moedas ou escopos automaticamente.
- Bloquear sobrepagamento no fluxo normal e mostrar o restante; excesso real requer registro explícito separado de crédito a devolver no acerto, com titular, nunca saldo HubBuy ou perda do excedente.
- Não aceitar auto-obrigação. No espaço pessoal, ocultar e rejeitar rotas de liquidação entre pessoas.
- Recibo confirmado é append-only. Anular recibo incorreto registra compensação e reabre capacidade exata. A anulação do registro não afirma que houve devolução bancária.
- Devolução efetivamente realizada usa novo recibo com direção e vínculo ao crédito a devolver. Receber PIX não altera o custo histórico nem `freightPaidAt`.
- Estados derivados: a pagar, a receber, parcialmente acertado, acertado, crédito a devolver e revisão pendente. Pedido, pacote logístico, custo e acerto têm encerramentos independentes.
- Mostrar histórico com ocorrência, registro, autor e vínculos de correção. Não coletar chave PIX/dados bancários, enviar cobrança, integrar banco ou gerar comprovante de transferência executada pelo Loti.

## 10. Persistência proposta e integridade

Nomes finais podem ser ajustados com equivalência documentada. Não usar JSON como única garantia de valores e relações financeiras. `financial_operations` mantém idempotência, autoria, ocorrência/registro, motivo, versão e hash normalizado.

| Relação sugerida | Conteúdo e restrições principais |
| --- | --- |
| `hubbuy_topups` | Conta, operação/crédito únicos, método, principal, taxa efetiva/bps, referência e metadados; valores inteiros; ligação inequívoca a operação/crédito |
| `hubbuy_topup_funders` | Recarga/pessoa, parcela CNY/principal/taxa; soma fecha comprovante; parcela aponta ao creditShare real |
| `package_freight_payments` | Pacote, versão/operação, moeda/total observado, modo, referência, versão de conteúdo e compensação; no máximo um pagamento vigente por escopo |
| `package_freight_sources` | Fonte saldo/externa, conta e débito/consumo ou principal externo, financiador, nativos e base histórica; XOR das fontes |
| `package_freight_allocations` | Pagamento/versão, encargo, unidade, pessoa, CNY/BRL e referências de fonte; margens validadas |
| `topup_fee_allocations` | Taxa de recarga → destino tipado (frete ou pedido), versão/operação e parcelas; capacidade não excede taxa original |
| `package_settlement_versions` | Pacote/escopo, revisão, snapshot financeiro, política, centralizador, par/data/versão de conversão e ligação à versão substituída |
| `package_settlement_claims` | Versão, devedor/credor distintos, principal CNY, principal BRL convertido, taxa BRL, total emitido e genealogia de compensação; magnitudes positivas |
| `package_settlement_receipts` | Operação, pessoas, moeda/valor real, ocorrência/referência e reversão/retorno explícito |
| `package_settlement_receipt_allocations` | Recibo → claims, valores liquidados; soma e tetos; recibo não pode ser usado duas vezes |

Cabeçalhos podem consolidar relações quando não perderem constraints e rastreabilidade. Reutilizar `hubbuy_balance_entries/credit_shares/consumptions`; acrescentar origens tipadas `topup` e `package_freight_payment` ou discriminador relacional equivalente. Se enum/CHECK/triggers precisarem de rebuild SQLite, preservar **todos** os guards e referências posteriores; não usar apenas DDL antigo. Consumptions de frete têm vínculo próprio, não `purchase_payment_allocation` fictício.

Taxa não consumida de recarga precisa acompanhar também usos em pedidos existentes: integrar atribuição da taxa na nova operação de pagamento de pedido que consumir recarga. Sem isso, F1 fica incompleta e a taxa desaparece quando saldo é gasto fora de pacote. Não reescrever parcelas antigas; adaptar somente operações novas com recarga tipada.

Guards mínimos no banco: FKs, unicidades de operação/revisão/referência ativa e reversão única; valores inteiros/limites; append-only; workspace/conta coerentes; financiadores/participantes autorizados; margem e capacidade verificadas em transação. Referência externa deduplica eventos financeiros entre protocolos/rotas quando semanticamente iguais; sem referência, exigir conferência e não prometer deduplicação por valor/data.

Saldo cache, revisão e ledger são atualizados atomicamente; divergência interna bloqueia nova mutação. Paginação e índices por workspace/pacote/conta/operação/pessoa. Verificação de somas relacionais no serviço e no verificador de integridade; CHECK de linha não substitui esse controle.

## 11. APIs, serviços e segurança

Módulos sugeridos: `hubbuy-topup-{calculations,services}.ts`, `package-freight-{calculations,services,reading}.ts`, `package-settlement-{calculations,services,reading}.ts`. Extrair primitivas de FIFO/idempotência/ledger sem circularidade e sem framework financeiro genérico.

Contratos de comando, nomes indicativos:

| Comando | Contrato |
| --- | --- |
| `topup.preview/record/reverse` | Revisão conta/taxa, parcelas e comprovante normalizados; reversão consulta dependências |
| `freight.payment.preview/confirm/correct` | Revisões conta/pacote/conteúdo/fontes, parcelas e uso cruzado explícito |
| `settlement.preview/confirm/revise` | Snapshot de pagamento/conteúdo, política e versão; prévia não reserva nem grava |
| `settlement.conversion.preview/confirm` | Par capturado e obrigação-fonte vigente; reconversão não substitui versão baixada |
| `settlement.receipt.preview/record/reverse/return` | Pessoas, claims, moeda, valor efetivo, data, referência e revisão |

Localizar rotas sob `/api/hubbuy/accounts/[accountId]` e `/api/logistics/packages/[packageId]` ou subrotas inequívocas. Zod estrito, sessão, origem confiável, respostas privadas/no-store, limites e erros tipados. Revalidar workspace persistido em cada recurso e contexto ativo dentro da transação; não confiar em IDs do navegador. `requireWorkspaceAccess()` para finanças pessoais/compartilhadas, `requireWorkspaceMember()` para obrigações entre pessoas, `requireWorkspaceMembers()` para todas as partes.

Idempotência inclui tipo, recurso, workspace, revisões, datas, valores e política. Retry com mesma chave retorna resposta confirmada antes de verificar revisão atual, mas depois de autorizar recurso/contexto. Mesma chave e payload diferente falham. Não usar fila em memória como garantia; testar conexões e processos independentes.

### 11.1 Escritores antigos e estados legados

Toda rota antiga de frete precisa passar por dispatcher que identifica modo financeiro legado/escalar/novo. Aba antiga não pode marcar pago ou corrigir um pagamento novo sem seu débito/compensação. Não basta esconder botão. Método desconhecido/versão antiga retorna conflito solicitando atualização.

Estados de importação legada não significam conta ativa conciliada. Confirmar revisão logística não cria recarga, pagamento ou débito. Se o pacote foi pago antes da entrega e o saldo já foi baixado como ajuste, oferecer associação auditada a evento existente, comprovadamente sem outro destino, em vez de novo débito; manter classificação original e ligação explícita. Não relabelar o ledger antigo por UPDATE.

## 12. Correções, reembolsos e preservação

- Correção de pagamento: manter lançamento original, compensar exatamente lotes/bases/titulares e taxas atribuídas, registrar substituto, recomputar delta de acerto. Conta/consumos posteriores podem impedir correção simples; apresentar dependências, nunca saldo negativo temporário ou ajuste forçado.
- Pagamento corrigido que já tem recibos preserva baixas; a diferença se torna obrigação complementar/crédito a devolver. Uma mudança de taxa não altera principal CNY ou saldo da carteira.
- Estorno de pagamento de frete registrado incorretamente não afirma reembolso real na HubBuy. Recebimento real de devolução de frete, quando necessário para corrigir cenário real, tem operação explícita com valor e referência, vínculo ao pagamento, tetos por fontes/titulares e créditos proporcionais. Não implementar reembolso automático nem pós-envio de produtos.
- Reabrir conteúdo antes do despacho exige motivo. Não alterar pagamento confirmado; gerar prévia de novo rateio e acerto complementar, com versão e baixa preservadas. Após envio, manter restrições logísticas existentes.
- Refunds de produto/China e correções de adicionais preservam origem, taxas capturadas e capacidades. Crédito antigo já consumido no frete impede correção destrutiva da sua origem e exige o fluxo compensatório de dependências.
- Histórico de compra, favoritos, QC, estado de pacote e bases de pedidos não mudam por recarga, conversão ou PIX do acerto.

## 13. Interface completa

Sem nova seção primária ou dashboard. Reutilizar Contas HubBuy e detalhe de Pacotes, Surfaces e ilha mobile.

**Contas:** ação Registrar recarga; prévia principal/taxa/total; financiadores; detalhes do crédito, taxa atribuída/pendente e saldo remanescente. Histórico reconhece origem Recarga e destino Frete do pacote, inclusive lotes esgotados e reversões. Nunca classificar frete como compra ou ajuste genérico.

**Pacote:** ação Conferir pagamento do frete; total CNY/BRL observado, fontes e taxa; rateio por produto/unidade/pessoa. Nova seção contextual **Acerto do frete**, mostrando o que cada um deve pagar/receber, regra e par usados, pendências, histórico e botões de registro manual. Detalhe separa custo histórico, dinheiro novo e obrigação de transferência. Trocar rótulos ambíguos apenas nas superfícies tocadas, por exemplo Custo dos itens, sem redesenho não solicitado.

**Recibos:** direção clara (quem pagou e quem recebeu), saldo a acertar, prévia da baixa, parcial/total, anulação e devolução de excesso. Reversão/correção mostra efeito antes/depois.

**Estados:** loading, erro/retry, saldo insuficiente por titular, conta não conciliada, conteúdo mudou, referência duplicada, acerto sem conversão, histórico incompleto, conflito de revisão e resposta perdida. Não trocar revisão automaticamente e reenviar valores antigos. Atualizar dados e exigir nova prévia quando mudar o fundamento financeiro.

**QA visual futura:** light/dark, 320/390/768/1024/1440 px, teclado, foco/retorno, leitores de tela, rótulos de moeda e valores negativos, mobile sem overflow global. Cancelar/abrir não grava. Não criar fotos operacionais, integração HubBuy, upload/OCR, notificação ou animação nova por consequência desta entrega.

## 14. Migração e operação existente

1. Registrar baseline em banco sintético descartável e inventário de writers, migrations, triggers e verificadores.
2. Migration aditiva cria metadados/relações e estende origens; mantém IDs, snapshots, ledger, pagamentos e recibos antigos. Nenhum crédito/débito/dívida é criado por migration.
3. Pagamentos legados mantêm cálculos capturados e flags de propriedade. Marcar como origem financeira legada **sem dados de financiador** quando desconhecida. Não inventar quem pagou pela autoria do evento.
4. Para adotar um pacote legado pago, prévia exige valor, conta/fontes e prova do débito já existente ou do fato ainda não registrado. Novo registro tardio entra na próxima sequência do ledger, sem reexecutar o passado por data.
5. Checar se movimentos posteriores consumiram os lotes necessários. Se a reconstrução da ocorrência histórica não puder ser feita com a capacidade atual, bloquear regularização simples e entregar diagnóstico de dependências; não adulterar FIFO/direitos nem adicionar saldo artificial.
6. Ensaio vazio, upgrade populado, repetição, falha/rollback e `foreign_key_check`; comparar hashes/valores protegidos por pessoa/conta/pacote antes/depois.
7. Runbook futuro: backup restaurável → suspender writers antigos → inventário fresco → migration explícita → verificador/comparador → versão compatível → smoke somente leitura → liberar operações autorizadas. Produção precisa de autorização específica posterior.

Após primeira recarga/baixa nova, rollback de código isolado é inseguro: preferir correção em frente com escrita suspensa. Restaurar backup exige conciliar lançamentos posteriores; anular registro no Loti não desfaz PIX externo.

## 15. Fases de execução e gates

| Fase | Entrega integral | Dependências | Gate para avançar |
| --- | --- | --- | --- |
| **0 — baseline e contrato** | Ler fontes, mapear writers, congelar invariantes, políticas propostas, algoritmo assinado e fixtures anônimas; relatório de compatibilidade | Pedido futuro de implementação | G0: contrato executável e baseline local; escolhas econômicas identificadas, sem defaults silenciosos |
| **1 — schema e integridade** | Novas relações, origens, guards, índices, journal/snapshots, verificador e adaptadores legados | 0 | G1: vazio/upgrade/repetição/FKs; dinheiro e snapshots antigos idênticos |
| **2 — F1 recarga completa** | Cálculo puro, serviço, rotas, formulário/prévia, financiadores, crédito, taxa, histórico e reversão; integração de taxa em novos consumos por pedidos | 1 | G2: principal/taxa/CNY fecham; titular correto; recarga parcial não perde/duplica taxa; cancelar não grava |
| **3 — F2 financiamento do frete** | Fontes saldo/externo/misto, débito/FIFO, prévia, confirmação, reversão/correção e compatibilidade de writers | 2 | G3: conta e direitos conciliados; uma baixa por evento; concorrência e rollback reais |
| **4 — F3 rateio e leitores** | Matriz unidade/pessoa/moeda, histórico BRL, manifesto versionado e projeções sem dupla contagem | 3 | G4: margens fecham, compartilhados contam uma vez, legado preservado, filtros não mudam centavos |
| **5 — F4 obrigações** | Posições nativas, pares diretos/compensação central explícita, credores negativos, versões e deltas; UI de prévia | 4 | G5: soma posições zero, nenhum crédito perdido, nenhuma dívida duplicada com adicionais |
| **6 — F5 conversão** | Par efetivo/manual, prévia, BigInt assinado, arredondamento balanceado, emissão BRL e travas de revisão | 5 | G6: obrigações convertidas fecham a zero; taxas fora do par; bases antigas intactas |
| **7 — F6 baixas** | Recibos parciais/totais, histórico, anulação, excesso real e devolução; capacidades e permissões | 6 | G7: baixas exatas, sem dupla quitação, sobrepagamento explícito, saldo HubBuy intacto |
| **8 — correções e legado ponta a ponta** | Deltas após pagamento, conteúdo revisto, reversões, devolução real de frete, dependências de créditos e regularização tardia | 2–7 | G8: nenhuma perda de histórico/recibo, protocolo antigo protegido, nenhum backfill monetário automático |
| **9 — ensaio navegável e regressão** | Seed local sintético, roteiro humano, comparação, E2E, estados de erro, mobile/dark/light, performance e isolamento pessoal | 8 | G9: seis funcionalidades acessíveis e testadas ponta a ponta, relatório numérico e ambiente entregue |
| **10 — documentação e handoff** | Operação, migração/cutover/recuperação, evidências reais de checks, limitações e prompt de continuidade | 9 | G10: DoD completo local; publicação/produção e aceite humano identificados separadamente |

Cada fase inclui testes adequados e interface funcional para sua capacidade, não apenas backend. Fases 2–7 não são entregas finais independentes: todas devem estar concluídas para declarar as seis funcionalidades prontas. Continuar autonomamente entre fases após autorização de implementação; corrigir falhas antes de avançar. Não usar ausência de acesso a produção como bloqueio local.

## 16. Fixture principal e números de referência

Usar pessoas sintéticas A/B/C/D e referências fictícias; não incluir emails, IDs, links, fotos ou comprovantes reais. Valores abaixo reproduzem o cenário discutido, não constituem seed de produção nem lançamentos autorizados.

| Pessoa sintética | Papel | Unidades equivalentes | Saldo antigo CNY minor | Base histórica BRL cents |
| --- | --- | ---: | ---: | ---: |
| A | Financia recarga e taxa; centralizador proposto | 11 | 14233 | 10406 |
| B | Participante | 8 | 1898 | 1425 |
| C | Participante com saldo superior à parte | 4 | 13894 | 10432 |
| D | Participante | 7 | 7009 | 6605 |

Construir 30 unidades válidas, incluindo seis unidades compartilhadas igualmente por A/C/D. Não cadastrar equivalentes como estoque fracionário. O conjunto tem 37034 CNY minor e 28868 BRL cents históricos antes da recarga. Bônus/lotes e seus consumos devem ter genealogia sintética válida; não forçar cache por UPDATE.

Recarga: CNY 39830, principal BRL 34893, taxa 349, total 35242, financiador A. Frete: CNY 76860. Política sintética explícita: consumir todo saldo antigo e 39826 da recarga; sobra 4 CNY minor no lote de A. A base principal usada da recarga é 34889 BRL cents, sobra 4 BRL cents pelo FIFO proporcional inteiro; taxa atribuída proporcional arredondada é 349. Custo histórico do encargo = 28868 + 34889 + 349 = **64106 BRL cents**. Não confundir com dinheiro novo de 35242 nem com transferências do acerto.

Obrigações de frete CNY A/B/C/D: **28182 / 20496 / 10248 / 17934**. Complementos após saldo antigo: **13949 / 18598 / -3646 / 10925**; somam 39826. Incluindo a parte consumida da recarga como financiamento de A, as posições principais A/B/C/D são **-25877 / 18598 / -3646 / 10925**, soma zero.

### 16.1 Perfil numérico proposto para arredondamento

No teste puro agregado, ordem estável A/B/C/D, par 39830 → 34893, maior resto assinado com alvo zero: principal convertido = **-22670 / 16293 / -3194 / 9571** BRL cents. Taxa devida pela equivalência 11/8/4/7, maior resto de 349 = **128 / 93 / 47 / 81**; menos financiamento integral por A resulta **-221 / 93 / 47 / 81**.

Posições totais: **-22891 / 16386 / -3147 / 9652**, soma zero. B paga 16386 a A; D paga 9652 a A; A paga 3147 a C. Parte própria do dinheiro novo aplicado ao frete = 35242 - 22891 - 4 = **12347**; sobra 4 BRL cents de base da recarga na carteira. Esse contrato difere um centavo da proposta informal anterior para A/C e explica por quê.

Se a alocação canônica por unidade produzir uma margem individual de taxa distinta por um centavo em outra ordem de unidades, persistir a ordem e derivar o esperado correto: o exemplo agregado não autoriza sobrescrever a matriz. Fixar a fixture de unidades para obter as margens acima ou registrar o expected alternativo calculado independentemente. Nunca depender da ordem de nomes/DOM. Acrescentar teste metamórfico de renomeação, paginação e troca de ordenação.

## 17. Matriz mínima de testes

| Área | Casos obrigatórios |
| --- | --- |
| Recarga | Um/vários financiadores, taxa zero/percentual/efetiva, total com taxa, principal inválido/ambíguo, limites, referência repetida, crédito perdido na rede e reversão sem/com dependências |
| Taxa de recarga | Uso parcial em dois pacotes e pedido; restante de CNY e taxa; consumo final; taxa paga por pessoa diferente do principal; soma atribuída nunca excede comprovante |
| Fontes | Saldo integral, externo direto e misto; bônus base zero; saldo global suficiente mas titular insuficiente; lote parcialmente usado; conta divergente/arquivada/excluída |
| Rateio | 5+5 unidades em R$100 → R$50 cada; linhas quantidade 1/5; seis compartilhadas; porcentagens e pesos de origem; uma unidade em cada pacote; 0,01/0,02; sem unidades rejeitado |
| Acerto | Financiador com/sem produto; participante credor; sem centralização; compensação confirmada; soma zero; titular não participante com crédito selecionado explicitamente; obrigação nunca desaparece por sinal negativo |
| Conversão | Par recarga/manual; várias recargas sem média implícita; negativos; maior resto; nenhum uso de floats; taxa fora do par; mudança de default não altera snapshots; reconversão após baixa bloqueada/compensada |
| Recibos | Parcial/integral/múltiplos, baixa em várias claims, concorrência, idempotência, excesso explícito/retorno, anulação simples/repetida, registro não executa banco nem carteira |
| Correção | Conteúdo antes/depois do fechamento/envio; frete já pago; alteração de taxa/principal; recebimentos já baixados; devolução real parcial do frete; crédito com consumo posterior; rollback após escrita parcial |
| Compatibilidade | Frete legado pago sem fonte; ajuste anterior associado sem novo débito; origem só textual; pacote com duas compras; modo antigo não contorna novo; leitores antigos não somam encargo duplicado |
| Autorização | Conta/pacote/claim/recibo/pessoa de outro workspace; recurso do próprio usuário em outro contexto ativo; pessoal sem membros; liquidação compartilhada negada no pessoal; erro privado sem dados estrangeiros |
| Migration | Vazio, populado, repetida, interrupção, FKs/índices/triggers, hashes de snapshots/ledger antigo, zero movimento monetário automático |
| E2E | Recarga → chegada/reserva → frete → fechamento → acerto → conversão → PIX parcial → restante → correção/anulação → histórico; ambos modos de workspace; perda de resposta/retry e cancelar sem escrita |

Concorrência multiprocesso: pagamento×pagamento da mesma conta em pacotes diferentes; pagamento×pedido; pagamento×ajuste; pagamento×arquivamento; duas atribuições da mesma taxa; correção×pagamento; conteúdo×confirmação; conversão×revisão; dois recibos sobre a mesma capacidade; recibo×reversão; adoção legada×writer antigo. Usar falhas injetadas depois de gravações e provar rollback integral, não só erro anterior ao INSERT.

Propriedades: créditos−débitos=saldo; direitos=saldo; fontes=pagamento; parcelas=encargos; taxa atribuída+livre=original; posições somam zero; baixas+aberto=emitido ajustado; recibo não alocado explicitamente identificado; todos os valores dentro dos limites; snapshots antigos invariantes.

## 18. Comandos, evidências e Definition of Done

Na execução futura: `npm run typecheck`, `npm run lint`, suites focadas Vitest, concorrência, `npm run build`, migrations vazia/upgrade e `npm run db:verify` em banco **local descartável explícito**. Rodar regressão ampla e Playwright antes da entrega. Não usar `.env` padrão para destino de migration/testes; token remoto ausente e serviços externos desativados no processo isolado. Não copiar contagens de sucesso de docs antigos; registrar baseline e resultados reais. Falhas financeiras/autorização da extensão não podem ser aceitas como flake.

Criar scripts de seed/verificação próprios, manifesto e comparador em diretório de teste; documentar porta, comandos, banco e credenciais sintéticas locais. Evitar o servidor E2E padrão se ele apagar banco compartilhado; usar isolamento por banco/porta/build. Comparar contagens e centavos exatos por pessoa/conta/pacote, além de tempos/limites de leitura. Listagens não devem carregar todos os pedidos/extratos/fotos no provider; abordar os travamentos observados de Pacotes com medição local, sem atribuir causa não comprovada.

Entregáveis finais da implementação:

1. F1–F6 disponíveis integralmente, com serviços, rotas, interface, histórico e correções; nenhum botão sem caminho servidor funcional.
2. Migrations novas e verificador, compatibilidade e proteção de writers antigos.
3. Cálculos puros com fixtures independentes, testes de propriedade/concorrência, integração e E2E.
4. Ambiente local navegável com fixture sintética, roteiro de conferência e resultados esperados, incluindo diferenças de arredondamento em relação à conversa.
5. Evidências de light/dark/mobile, conflitos, cancelamento, retry e perdas de resposta.
6. Documentação de regras/limites, operação, cutover e recuperação, estado de cada fase e decisões econômicas confirmadas ou pendentes.
7. Revisão final financeira/segurança/migration; aceite humano do ensaio registrado somente se efetivamente realizado. Se ainda pendente, declarar pronto tecnicamente para revisão, não liberado para produção.

Não declarar concluído apenas por build verde ou backend pronto. Produção, dados reais e transferências externas permanecem fora desta entrega até autorização específica.

## 19. Prompt de execução futura

> Implemente integralmente as seis funcionalidades descritas em docs/47_TOPUPS_PACKAGE_FUNDING_AND_SETTLEMENTS_PLAN.md. Leia as fontes obrigatórias, revalide o checkout e preserve trabalho alheio. Execute todas as fases locais em sequência, incluindo interfaces, correções, compatibilidade, migrations descartáveis, carga navegável, verificador e testes. Conserve bases históricas e direitos individuais; separe custo, financiamento e acerto; não duplique obrigações de adicionais. Trate conversão/centralização/consumo de saldos como escolhas explícitas nas prévias, sem alegar aprovação prévia dos números da conversa. Não publique, não migre produção, não use credenciais externas nem registre dados reais. Entregue as seis funcionalidades completas e o handoff operacional; relate somente validações efetivamente executadas.
