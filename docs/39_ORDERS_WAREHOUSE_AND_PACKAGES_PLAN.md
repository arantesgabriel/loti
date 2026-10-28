# Pedidos, armazém e pacotes — plano completo de implementação

Data: **27/10/2026**. Status: **pendências locais do handoff tratadas; regressão final e entrega da simulação documentadas; aceite humano e reviewer da extensão pendentes**. Estado técnico e matriz G0–G7 em `docs/testing/ORDERS_TRANSITION_FINALIZATION.md`; handoff anterior em `docs/HANDOFF_ORDERS_WAREHOUSE_PACKAGES_2026-10-27.md`; operação em `docs/testing/ORDERS_TRANSITION_EXECUTION.md`. Produção não foi alterada.

Este documento consolida as decisões do usuário nesta conversa e a inspeção somente leitura da interface de produção. Autoriza preparar a implementação, migrations, carga sintética e validação em desenvolvimento local isolado. **Não autoriza publicar, migrar produção, alterar registros reais, copiar o banco de produção ou configurar infraestrutura externa.**

## 1. Resultado e decisões fechadas

Adotar a **opção B**: separar pedidos e recebimento no armazém da montagem e envio de pacotes. Um pacote poderá reunir quantidades de pedidos de compras diferentes do mesmo workspace e da mesma conta HubBuy verificada, preservando a origem financeira de cada item.

1. Renomear **Pacotes e custos** para **Pacotes**.
2. Criar **Pedidos**, reunindo os itens pós-compra, custos até o armazém, pagamento dos produtos, recebimento físico, QC, reembolsos e histórico de correções.
3. Finalizar a Compra atual cria o acompanhamento/pedido e seus snapshots, **sem criar Pacote 1 nem alocar unidades automaticamente**. Não marcar pagamento por consequência da finalização.
4. Novas unidades entram em **Aguardando chegada ao armazém**. Chegada é manual e pode ser parcial por quantidade.
5. Pedidos exibe produto + frete China + taxa de pagamento dos produtos, total até o armazém e parcelas por pessoa. Custos futuros de envio não tornam esse subtotal pendente quando todas as suas bases já estão resolvidas.
6. Mover a entrada de importação JSON e gerenciamento QC para Pedidos. Preservar galerias, permissões, fotos e vínculos existentes.
7. Selecionar unidades disponíveis no armazém permite criar pacote ou acrescentar a pacote em montagem da mesma conta. A seleção confirmada reserva essas unidades e impede uso duplo.
8. Antes de fechar, retirar unidades do pacote devolve sua disponibilidade no armazém. Não cancela produto, não estorna pagamento e não gera crédito.
9. Somente **conteúdo fechado + frete final pago** promovem as unidades ao filtro **Em pacote**. Antes disso, continuam na etapa de armazém com o vínculo visível **Reservado no pacote X**.
10. **Enviado** exige registro manual posterior de despacho; pagamento não prova envio físico. Recebido é outra etapa manual posterior.
11. Pacotes mostra os pacotes e seus conteúdos, custo herdado dos itens, frete e sua taxa, Receita e distribuição por item/pessoa. Pacotes em montagem continuam acessíveis em filtro próprio.
12. Depois de fechado + frete pago, liberar dados complementares, inicialmente **peso do pacote em gramas**. Peso é informativo e não altera a divisão por unidade.
13. **Nova solicitação de reembolso somente de quantidades sem vínculo ativo com qualquer pacote**, inclusive reserva em montagem. Reservadas devem ser retiradas explicitamente antes; fechado/enviado conserva suas travas. Recebimento de solicitação legada válida continua possível.
14. Solicitar cancela unidades, mas somente receber confirmado reduz custo/gera o crédito adequado. Preservar pagamentos originais, taxas, fontes, direitos individuais, adiantamentos, créditos consumidos e histórico.
15. Saída da simulação/pesagem continua somente no saldo HubBuy. Não adicioná-la aos custos de pedidos ou pacotes.
16. A migração preserva registros existentes; classifica logística por evidências confirmadas. Não desmontar pacotes automaticamente nem inventar chegada, pagamento ou despacho.
17. **Carga sintética obrigatória em dev**, reproduzindo o estado operacional e os valores observados antes de considerar a implementação concluída. Entregar ambiente utilizável para simulação humana, além de testes automatizados.

### 1.1 Padrões técnicos de execução, sem nova decisão humana necessária

Os detalhes abaixo são escolhas recomendadas deste plano, não fatos observados na HubBuy. O executor pode ajustar a representação com equivalência documentada, sem reduzir os contratos:

- Usar quantidades/faixas lógicas estáveis, sem exigir cadastro visual de um objeto por peça.
- Custos/pagamentos de pedidos mantêm sua origem; pacote agrega parcelas e acrescenta encargos próprios.
- Manter a ilha mobile arredondada. Com seis destinos, usar Favoritos, Compra, Pedidos, Pacotes e **Mais**, que abre Contas HubBuy e Histórico; a navegação desktop mantém todos. Não comprimir seis alvos abaixo do tamanho acessível.
- QC nesta entrega usa **JSON e associação existentes**. Upload manual de arquivos ficou em aberto na discussão; não implementá-lo nem criar slots ocultos. Registrar como extensão separada.
- Preservar a apresentação QC já autorizada ao mover as linhas de custos para Pedidos. Fora dessas linhas equivalentes, usar marcador de categoria e acesso à galeria; não expandir fotos a Favoritos/Compra/Histórico ou criar nova apresentação de capas em Pacotes.
- Novos pedidos adicionais são criados em Pedidos com o fluxo financeiro existente e deixam as unidades aguardando chegada, sem associação imediata a pacote.
- Nenhuma sincronização de status/preços por JSON: importar QC continua sem escrever custos, pagamentos ou chegada automaticamente.

## 2. Preparação obrigatória do executor

1. Ler AGENTS.md, PROMPT_ONE_SHOT.md e docs 00–17 na ordem canônica. Depois ler integralmente os planos 20, 21, 22, 23, 24, 26, 29, 30, 32, 33, 34, 37 e 38; consultar os demais quando tocar seus contratos. Ler este plano por inteiro.
2. Esta extensão aprovada substitui pontualmente as limitações anteriores de pacotes ao mesmo acompanhamento, criação automática de pacote e cancelamento diretamente de unidades alocadas. Não reabrir decisões de stack ou ampliar outros escopos.
3. Inspecionar git status/diff e a documentação atual. No planejamento já havia alterações de terceiros em autenticação, tsconfig, landing, planning e testes; preservar integralmente. Revalidar o checkout, sem assumir números de migration ou contagens antigas.
4. Não executar PROMPT_ONE_SHOT como um pedido de reconstrução do MVP: a tarefa é a extensão delimitada aqui.
5. Antes de código, registrar baseline local com destino descartável explícito. Não ler/exibir secrets nem deixar testes resolverem implicitamente o .env do usuário.
6. Executar fases em sequência, continuar autonomamente e corrigir falhas. Não pedir autorização por fase nem usar falta de produção como bloqueio para trabalho local.
7. Não criar commits, PRs, usar outros agentes ou publicar sem autorização aplicável. Se houver autorização de commit, usar Conventional Commits em inglês sem scopes.

## 3. Evidência da produção e seus limites

Inspeção em 27/10/2026, somente por navegação e expansão de detalhes na sessão disponibilizada pelo usuário. Nenhum endpoint de escrita, importação, correção, pagamento ou alteração de dados reais foi executado. O observado vale para o workspace acessível e não constitui auditoria SQL de toda a produção.

| Evidência | Observado na interface |
| --- | --- |
| Compra atual | Sem compra ativa |
| Histórico | Uma compra finalizada, com 30 unidades originais |
| Acompanhamento | Aberto; 41 unidades compradas incluindo adicionais, dez canceladas, 31 vigentes em 29 linhas |
| Pacote existente | Um pacote nomeado, 24 linhas/26 unidades, em preparação; frete Brasil e Receita não informados |
| Unidades sem pacote | Cinco linhas de uma unidade, todas com QC associado |
| Pagamentos vigentes | Um original + nove adicionais; adicionais pagos com saldo HubBuy |
| Correções | Oito pedidos substituídos, mantidos no histórico |
| Reembolsos | Dez produtos/dez unidades, recebimentos registrados; R$655,15 / ¥841,42 recebidos e R$109,59 mantidos |
| Pagamento original | Base R$1.633,59, Pix 1%, taxa R$16,34, total R$1.649,93 |
| Adicionais vigentes | R$351,45 somados |
| Custo atual | R$1.346,23 parcial = R$1.236,64 vigentes + R$109,59 mantidos nos reembolsos |
| Conta | Interface informa ativa e conciliada; saldo ¥370,34, base histórica R$288,68 |
| Ajuste | Saída de ¥18,00, base histórica consumida R$15,02, motivo simulação de frete |
| Bônus visível no extrato | ¥2,29, base R$0,00 |

Não presumir que QC comprova todas as unidades recebidas. Não presumir que em preparação significa não fechado externamente; só foi observado o registro do Loti. Não inferir conta financeira por email textual da compra. Não copiar nomes, emails, IDs, links de produtos, referências externas ou fotos reais para fixtures.

## 4. Mapa técnico e pontos de alteração

Revalidar símbolos no checkout da execução:

| Local atual | Trabalho necessário |
| --- | --- |
| src/lib/domain/purchase-services.ts / finalizePurchase | Preservar finalização transacional e snapshot; passar a iniciar pedido sem pacote |
| src/lib/domain/purchase-cost-initialization.ts | Hoje cria Pacote 1 + aloca todas as unidades + encargos; retirar esse comportamento para novos ciclos, mantendo inicialização financeira idempotente |
| src/lib/db/schema.ts e drizzle/ | Pedido ligado a tracking; pacote também ligado a tracking; falta recebimento de armazém/peso. Evolução compatível e migrations novas |
| package-cost-services.ts / saveAllocations, savePackage, closeTracking | Hoje mutação e fechamento são por tracking. Separar escopo de pacote, quantidades, chegada, reserva, selo e fechamento financeiro |
| package-cost-reading.ts, package-cost-calculations.ts, package-cost-display.ts | Hoje leem pacotes do tracking e tratam sem pacote como pendência. Criar projeções por pedido e por pacote, evitando dupla contagem entre acompanhamentos |
| refund-unit-capacity.ts, package-refund-calculations.ts | Há faixas estáveis e snapshots de refunds; manter identidade das unidades e arredondamento ao coexistir com reservas |
| purchase-cost-order-services.ts | Preservar fontes, FIFO, BRL histórico, financiamento; mover entrada de adicionais e limitar elegibilidade logística |
| purchase-order-corrections.ts | Hoje transfere alocações e QC ao substituto; adaptar ao novo escopo sem ressuscitar versões anteriores nem liberar unidades indevidas |
| qc-services.ts / qc-validation.ts / qc-matching.ts | QC por purchase/ocorrência original ou adicional. Mover entrada visual sem remapear fotos por pacote; ajustar busca multi-origem de forma autorizada |
| authorization.ts e APIs de packages/hubbuy/qc | Centralizar membership, recursos, conta e escopos; não aceitar vínculo cruzado por payload |
| package-cost-detail-screen.tsx e componentes packages/qc | Extrair componentes reutilizáveis, criar Pedidos e detalhe de Pacotes sem duplicar motor financeiro |
| app-shell.tsx, sidebar.css, navegação mobile | Pedidos, renomeação e ilha acessível com Mais |
| scripts/verify-database.ts, migrations, integration helpers, E2E server | Integridade nova, upgrade histórico, seed isolado, comparador e concorrência |

Não é suficiente remover a comparação trackingId em saveAllocations: leituras, autorização, encerramento, correções, encargos e refunds também dependem dela.

## 5. Modelo de domínio e persistência recomendados

### 5.1 Fronteiras

- **Compra:** seleção colaborativa; finalização continua imutável.
- **Pedido:** origem comercial/financeira dos itens. Mantém acompanhamento, snapshots, pagamentos e correções originais.
- **Posição no armazém:** quantidades recebidas e ainda disponíveis, reservadas, expedidas ou canceladas; pode estar parcialmente em cada etapa.
- **Pacote:** agrupamento logístico por workspace/conta; não é dono do pagamento do produto.
- **Reserva/alocação:** vínculo de uma quantidade/faixa elegível de item a pacote. Enquanto ativo, impede reembolso e outra reserva das mesmas unidades.
- **Fechamento do conteúdo:** congela o manifesto; diferente de pagamento do frete, envio, recebimento e encerramento financeiro.

### 5.2 Estrutura incremental

Preferir manter as tabelas financeiras atuais e acrescentar relações logísticas. Identificadores e colunas legadas permanecem compatíveis durante a migração:

1. Acrescentar workspaceId e ciclo/revisão próprios ao pacote; trackingId antigo permanece como **origem legada**, sem determinar mais seu conteúdo ou sua autorização. Para pacotes novos multi-origem, não atribuir arbitrariamente um tracking proprietário. Permitir origem legada nula ou relação equivalente explicitamente tipada.
2. Separar cobranças do pacote do dono financeiro de produto. Pode-se evoluir purchase_cost_charges com escopos disjuntos de pedido/pacote e trackingId legado opcional. Manter IDs, pagoEm/pagoPor, taxa e totais já capturados. CHECKs devem impedir cobrança sem escopo e dupla propriedade. Se tabela própria for necessária, preparar mapa unívoco e provar preservação exata; não emitir pagamentos novos na migração.
3. Criar registro de recebimento/posição por costItemId, workspace e conta verificada, com quantidades/faixas e revisão. Eventos de chegada/correção registram autor, data de registro, quantidade e motivo para correções. Não criar data de ocorrência histórica sem evidência.
4. Acrescentar às alocações faixas estáveis ou uma matriz de capacidades equivalente que identifique exatamente quais unidades e centavos pertencem a cada pacote. Preservar IDs/associações antigos quando possível. Uma unidade não pode estar em duas reservas ou reserva + cancelamento ativo.
5. Acrescentar metadados informativos como weightGrams inteiro positivo e seguro, nulo quando desconhecido, com autoria/revisão. Não reutilizar weight de participantes, que é peso financeiro e não massa física.
6. Criar estado/eventos de conferência legada por recurso (pending_review/confirmed), com origem da classificação, revisão e antes/depois. Ausência de informação não significa awaiting_arrival nem warehouse automaticamente.
7. Capturar composição financeira do manifesto ao fechamento em relações de parcelas por item/unidade/pessoa. Isso não é uma nova cobrança de produto; permite explicar a soma e impedir centavos migrarem após nova alocação. Persistir referências à fonte de valoração e revisões, sem duplicar saldo financeiro.

Ao atribuir faixas no upgrade, respeitar primeiro as faixas de refunds já persistidas; depois mapear as quantidades restantes dos pacotes pela ordem financeira estável, sem tocar nos snapshots de cancelamento. Alocação nova não pode reciclar faixa cancelada ativa. Uma anulação libera a faixa original, sem renumerar as demais. Quando um rateio legado por pessoa/componente não puder ser representado exatamente pela nova função de unidades, preservar suas parcelas capturadas em uma ponte de compatibilidade; não recalcular o histórico para ajustar centavos. O relatório deve mostrar a ponte e provar suas somas.

Money continua inteiro; CNY e BRL separados. Usar BigInt nos intermediários, limites explícitos e ordem estável. Somatórios entre linhas precisam ser validados em transação; CHECK isolado não basta. Não editar migrations aplicadas. Em rebuild SQLite, preservar FKs/índices/triggers de todas as extensões e executar foreign_key_check.

### 5.3 Ciclos financeiros independentes

- Pedidos: fechamento financeiro exige bases, composição, pagamentos e refunds resolvidos; **não exige que todas as unidades já tenham pacote**. Uma unidade pode continuar armazenada após o pedido financeiro encerrado.
- Fechar o financeiro do pedido não impede futuras reservas/envio de suas unidades. Impede alterar seu pagamento/custo sem reabertura motivada.
- Pacotes: encerramento financeiro próprio exige suas obrigações resolvidas; imposto pode continuar pendente depois de fechado + frete pago. Não exigir Receita paga para o filtro Em pacote.
- Acompanhamentos legados já encerrados preservam sua imutabilidade. Oferecer mapeamento de leitura; não reabrir por migration. Qualquer movimentação posterior que exija revisão depende de reabertura explícita do escopo adequado.
- Criar pacote ou registrar chegada nunca reabre compra finalizada ou muda pagamento do produto.

## 6. Estados, capacidades e comandos

### 6.1 Projeção por quantidade

Filtros Pedidos: Todos, Aguardando chegada, No armazém, Em pacote, Enviados e Reembolsos; Recebidos como filtro adicional quando aplicável. Conferência legada aparece claramente enquanto necessária.

Enquanto a posição legada estiver a conferir, não oferecer nova reserva, solicitação de reembolso ou promoção de etapa daquele recurso. Alocações antigas podem permanecer preservadas sem confirmação de chegada por uma exceção legada explícita e restrita; isso não libera novas reservas sem chegada. Antes de fechar/despachar esse pacote, resolver sua revisão e as unidades necessárias. Recebimentos de refunds antigos seguem sua própria validação, sem bloqueio indevido pela revisão logística.

No armazém inclui unidades livres e reservadas em montagem, com discriminação e vínculo. Só livres são selecionáveis para outra reserva/reembolso. Exemplo: 3 compradas = 1 livre + 1 reservada + 1 enviada; não atribuir um único status a toda a linha. Itens podem aparecer em filtros diferentes com quantidades explicitadas, mas os resumos globais nunca duplicam suas unidades/custos.

Capacidade total: quantidade comprada vigente = não recebidas + livres recebidas + reservas/pacotes ativos + unidades expedidas/recebidas, descontando cancelamentos ativos. Definir conjuntos disjuntos; não somar recebido acumulado com enviado como se fossem quantidades independentes. Pedidos substituídos e drafts financeiros não oferecem capacidade.

### 6.2 Comandos servidores sugeridos

- order.receipt.record / correct: chegada e correção motivada; correção não pode tornar inválida uma reserva/envio existente.
- package.createFromSelection / reserve / release: validar toda seleção na mesma transação, sem pacote vazio residual se parte falhar. Release preserva chegada e pagamento.
- package.closeContent: manifesto não vazio, contas verificadas, unidades recebidas, financiamento/bases resolvidos, revisões atuais; captura composição e congela conteúdo.
- package.freight.record / markPaid: total final e taxa explícitos, sem usar subtotal do produto como base; suporta a ordem pago→fechado ou fechado→pago com promoção somente quando ambos válidos.
- package.dispatch / receive: despacho exige conteúdo fechado + frete pago; recebimento exige despacho. Sem rastreamento automático.
- package.info.update: peso depois do gate fechado+pago, com inteiro em gramas e limite; ausência continua nula.
- legacy.review.preview / confirm: classificação motivada sem lançamento monetário; requer evidências/revisões e comparação antes/depois.
- refund.request: só unidades livres fora de qualquer pacote; mantém capacidade por produto/China e snapshots de participantes.

Pacote sem cobrança de frete não deve falsificar paidAt para atender ao gate. Como padrão, known zero confirmado como pago pode cumprir o gate; no_charge isolado não promove automaticamente. Se houver caso operacional real de frete isento, tratar com resolução explícita auditada e sem inventar pagamento.

### 6.3 Reembolso e correções

1. request/updateRequest valida faixa livre e sem pacote no servidor. Não remover alocações silenciosamente como fazia o fluxo antigo; UI orienta retirar primeiro quando elegível.
2. Prevenir corrida refund × reserve × correção de pedido. Atualização de pedido já solicitado não pode incluir unidades adicionais alocadas.
3. receive/correctReceipt de solicitação legada preserva o cancelamento já feito e não exige que o usuário refaça sua solicitação. Gate novo não invalida recebimentos válidos antigos.
4. Anular refund não restaura automaticamente pacote antigo: libera as unidades e põe a localização em conferência quando não houver evidência de chegada preservada. Não presumir que devolução física anulada significa item de volta no armazém.
5. Retirar item de pacote fechado exige fluxo explícito de reabertura do conteúdo antes de envio, motivo e revisão de rateio; não pode apagar pagamento do frete, devolver saldo ou reduzir total pago automaticamente. Após enviado, impedir retirada comum. Não implementar devolução pós-envio.
6. Mudança só do rateio preserva fato do pagamento externo, mas exige reconferência. Mudança de total pago usa o contrato de correção financeira existente/compensação explícita, nunca UPDATE silencioso em histórico pago.
7. Correção de pedido adicional substituído preserva genealogia, restaurações, FIFO, QC e participantes. Rejeitar correção se unidades em pacotes fechados/enviados impedirem substituição segura; não afrouxar proteção para viabilizar a tela.

## 7. Contrato dos valores e da apresentação

```text
base_ate_armazem = produto + frete_china + taxa_capturada_dos_produtos
base_itens_do_pacote = soma(parcelas das unidades efetivamente selecionadas)
total_do_pacote = base_itens_do_pacote + frete_internacional
                 + taxa_do_pagamento_do_frete + receita
custo_liquido_global = produtos/China/taxas originais e adicionais vigentes
                       - reembolsos efetivamente recebidos + encargos de pacotes
```

- Não somar novamente base_itens_do_pacote ao consolidado que já contém os pedidos. Pacote é outra visão das mesmas bases.
- Resíduos de refunds ficam atribuídos a seus titulares/pedido, fora da base herdada das unidades enviáveis. Continuam no custo global e por pessoa; não desaparecer nem distribuir compulsoriamente ao pacote.
- A despesa de simulação altera saldo e base histórica disponível; não vira encargo do pacote.
- Taxa original de produto não muda ao reservar/retirar/adiar envio. Novos itens de outro pedido trazem sua própria taxa capturada.
- Frete Brasil, taxa do frete e Receita continuam divididos por unidade física do pacote; cada componente depois segue os participantes preservados do item. Peso não altera essa regra.
- Divisão de uma linha por vários pacotes precisa preservar centavos/pessoas exatos. Não recalcular cada pacote isoladamente por porcentagem arredondada nem mover restos após renomear/ordenar. Somar parcelas persistidas para o global.
- Desconhecido/nulo, known zero e no_charge continuam distintos. Mostrar subtotal até o armazém resolvido mesmo quando envio futuro não existe; mostrar custo final parcial quando faltam encargos do pacote.
- BRL histórico de créditos consumidos não é conversão atual do CNY. Não consultar câmbio ou reavaliar saldo.

## 8. Interface, navegação e QC

- Desktop: Favoritos → Compra atual → Pedidos → Pacotes → Contas HubBuy → Histórico. Preservar tema, Geist, tokens, densidade e identidade Loti.
- Pedidos: filtros de etapa, pessoa, conta e compra/origem; busca e seleção múltipla com quantidade; agrupamento por pedido sem exigir entrar em cada compra para montar pacote.
- Linha: nome/variação, quantidade por posição, pessoas, custo até o armazém, situação de pagamento e QC; composição em drawer. Mostrar dados originais e adicionais com origem, sem confundir registros substituídos.
- Seleção: só quantidades elegíveis, total de unidades/base herdada, conta e destino; criação/reserva confirma seleção completa. Seleção entre contas falha com mensagem antes da escrita.
- Pacotes: filtros Em montagem, Fechados, Enviados, Recebidos; principal destaca fechados. Detalhe mostra itens e compras de origem, encargos por item/pessoa, fatos de fechamento/pagamento e dados complementares. Contas diferentes nunca se misturam.
- Controles com ações financeiras preservam prévia/confirmação existente; abrir drawer ou cancelar não grava. Quantidade e filtros não submetem mutação implicitamente.
- Mover Importar QC para Pedidos e selecionar pedido/compra de origem ou resolver cada ocorrência por escopo autorizado. Um JSON com várias compras exige vínculo explícito por ocorrência; não escolher pelo nome nem misturar IDs estrangeiros. Pode processar grupos de origem pelo pipeline existente, com fila/limites preservados.
- Filtro atual de importação ignora produtos com QC pronto e ocorrências sem freePhotos; não usar essa lista para inferir todo o estoque ou atualizar chegada. Reimportar não duplica fotos nem reclassifica logística.
- Histórico conserva acesso de leitura ao QC e aos snapshots. Não copiar objetos R2 ou trocar suas chaves ao reservar/mover pacote.
- Links antigos /packages/[trackingId] precisam resolver para o acompanhamento legado/origens correspondentes, sem tratar trackingId como packageId. Usar rota inequívoca de detalhe de pacote, por exemplo /packages/detail/[packageId], e /orders/[orderId]. Preservar /packages/accounts. Testar links salvos e navegação de retorno.

Listagens novas devem ter paginação/limites e índices por workspace, conta e posição. Não carregar todos os acompanhamentos, fotos ou extratos no workspace-provider. Seleção entre páginas mantém IDs/quantidades explícitos e é revalidada no servidor; selecionar tudo não pode incluir itens ocultos/ineligíveis silenciosamente.

## 9. Segurança, concorrência e compatibilidade

Todas as mutações exigem sessão, origem confiável, membership, relações de recurso verificadas, Zod estrito e respostas privadas/no-store. A conta vem dos recursos autorizados, não do payload de workspace. Conta textual legada não equivale a FK verificada; enquanto ambígua, bloquear novas reservas entre compras e oferecer associação explícita sem reavaliar valores.

Usar revisão própria de pacote e revisões dos itens/posições envolvidos. Transação com CAS e ordem estável dos recursos evita reserva dupla entre pacotes/acompanhamentos. Idempotência persistida com hash de comando e resposta recuperável protege createFromSelection, fechamento, pagamentos, migração/revisão e operações financeiras. Uma chave repetida com comando diferente deve falhar.

Fila em memória não é garantia em Vercel. Testar processos independentes sobre libSQL local e injetar falha após parte das escritas para provar rollback. Retry somente para erro transitório reconhecido, sem criar nova chave ou duplicar pagamento.

Endpoints legados também devem usar as novas regras; ocultar botão não protege requests de abas antigas. Após cutover, rejeitar protocolo antigo de mutações com orientação de atualizar, inclusive finalização que criaria pacote automático. Bloquear escritores antigos durante janela operacional; um flag apenas no frontend é insuficiente.

## 10. Migração conservadora e conferência do legado

### 10.1 Expandir e comparar antes de ativar

1. Migration estrutural mantém todas as linhas financeiras e snapshots. Backfill somente de fatos determinísticos e chaves de vínculo inequivocamente válidas; registrar versão/mapa. Não inserir pagamentos, créditos, consumos ou confirmações de chegada.
2. Gerar relatório somente leitura com contagens, quantidades, hashes de campos imutáveis, componentes/parcelas, saldo por conta/pessoa, referências QC e problemas de integridade. Comparação de centavos exatos, não tolerância percentual.
3. Prévia de classificação mostra situação antiga, vínculos preservados, proposta e evidência ausente; confirmada por recurso/revisão, sem inferências de produto/nome/email.
4. Sent/received antigos preservam o estado e o selo, mesmo quando dados antigos de frete estiverem incompletos. Não fabricar paidAt para atender à regra nova: registrar compatibilidade legada explícita somente leitura, bloquear novas transições incoerentes e apresentar pendência real.
5. Pacotes preparing existentes mantêm o conteúdo. Se sem selo/frete registrado, proposta é em montagem com revisão logística pendente; não inferir chegada de todas as unidades nem desfazer as reservas existentes. Gate de novas operações só se libera após conferência necessária.
6. Itens sem pacote vão a Pedidos em posição a conferir. QC pode aparecer como evidência, sem confirmar recebimento automaticamente.
7. Refunds continuam cancelados/recebidos conforme registros; não redistribuir parcelas antigas. Pedidos substituídos não fornecem unidades. Drafts financeiros não entram no estoque.
8. Migração repetida/conferência repetida não cria duplicatas, não incrementa dinheiro e não desfaz decisão já confirmada. Conflito de revisão exige nova prévia.

### 10.2 Aplicação ao cenário observado (somente proposta; não executar em produção)

- Preservar o pacote existente com suas 26 unidades/24 linhas; não promover a fechado/pago/enviado, pois a UI não registrava esses fatos.
- Preservar as cinco linhas sem pacote. A camiseta já está fora; não executar retirada ou refund artificial.
- Preservar dez cancelamentos, R$655,15 recebidos e R$109,59 residuais; recebimentos não viram créditos novamente.
- Manter um pagamento original, nove adicionais vigentes e oito substituídos no histórico. Não recriar pedidos adicionais a partir da lista de produtos.
- Conservar saldo ¥370,34/base R$288,68 e saída ¥18/base R$15,02; alteração de tela não é movimento financeiro.

### 10.3 Cutover futuro, condicionado à autorização específica

Backup recuperável com restauração ensaiada → janela sem escritores antigos → inventário fresco e revisão das diferenças desde 27/10 → migration explícita → db:verify + comparador → publicar versão compatível → smoke somente leitura → habilitar novas operações e realizar conferências autorizadas.

Não usar IDs/valores desta inspeção como predicado de script remoto. Produção pode ter mudado. A conferência real é operacional e precisa de autorização própria.

Depois da primeira reserva multi-origem ou novo estado de armazém, rollback só de código é inseguro. Preferir correção em frente com escritas suspensas. Restauração de backup precisa incluir banco/código compatíveis e conciliação de ações posteriores, pois backup anterior perde registros novos.

## 11. Carga sintética obrigatória — contrato de dados

### 11.1 Entrega e isolamento

Criar builder versionado, script de seed específico e manifesto de expectativas, por exemplo:

- tests/fixtures/orders-transition/scenario.ts;
- tests/fixtures/orders-transition/expected.json;
- tests/fixtures/orders-transition/qc/ com imagens sintéticas locais;
- scripts/seed-orders-transition.ts e scripts/compare-orders-transition.ts;
- comando npm **dev:seed:orders-transition** e documentação **docs/testing/ORDERS_TRANSITION_DEV_SCENARIO.md**.

Nomes podem variar com justificativa. Não substituir db:seed genérico nem reutilizar o data/e2e.sqlite padrão apagado pelo servidor E2E.

Aceitar apenas destino local explícito novo, resolvido e validado dentro de data/orders-transition-<id>.sqlite. Recusar remoto, produção, Vercel, caminho existente não identificado como fixture e ausência de parâmetro explícito. Não importar singleton de banco antes de fixar o destino; dotenv não pode reativar credenciais reais. Recusar TURSO_AUTH_TOKEN real e serviços externos no runner da fixture. Ambiente dev remoto/Preview não está autorizado automaticamente.

Uma repetição no mesmo cenário deve reconhecer seu identificador e não duplicar registros; reset deve criar outro arquivo por padrão, sem apagar o banco de dev do usuário. Credenciais só @loti.test, nomes Pessoa A/B/C/D e Conta QA. Grupo estrangeiro/outsider em fixture adicional. Banco para demonstração humana não é apagado pelo teardown dos testes; entregar comando/URL localhost e login de teste, sem segredos reais.

### 11.2 Quantidades e genealogia obrigatórias

- Quatro participantes financeiros sintéticos; opcional quinto membro sem operações para testar seletores.
- Uma compra finalizada original com **30 linhas de uma unidade** e nenhuma compra ativa no baseline.
- Dez linhas originais canceladas/recebidas; vinte originais vigentes.
- Nove pedidos adicionais vigentes com quantidades **1,1,2,2,1,1,1,1,1** = 11 unidades/9 linhas.
- Total econômico vigente comprado: **41 unidades**, dez canceladas, **31 enviáveis/29 linhas**.
- Pacote QA em preparação com vinte linhas originais e quatro linhas adicionais compartilhadas (1,1,2,2): **24 linhas/26 unidades**.
- Cinco adicionais de uma unidade sem pacote; todos com QC. Papéis sintéticos: Camiseta QA, Polo QA, Camiseta B QA, Tênis QA, Kit QA.
- Oito substituições de pedidos, com compensações e consumos coerentes. Versões substituídas não entram na contagem 41/31 nem nos nove adicionais vigentes. Criar as correções pela lógica real quando possível; caso precise bootstrap histórico, justificar e validar todas as relações/ledger.
- Refunds incluindo duas linhas compartilhadas entre três pessoas, crédito consumido em novos pedidos, restos de centavos, recebimento parcial em relação à base e resíduos mantidos.
- QC original/adicional, capa em página posterior, um vínculo corrigido e imagens sintéticas; sem acessar CDN HubBuy, fotos reais ou R2 remoto. Usar storage/download injetados e rotas privadas de dev guardadas, nunca tornar buckets públicos.

### 11.3 Âncoras financeiras globais (inteiros)

| Grandeza | BRL centavos | CNY minor quando aplicável |
| --- | ---: | ---: |
| Produtos originais no histórico | 146609 | não inferido |
| Base original com China | 163359 | não inferido |
| Taxa Pix original 1% | 1634 | — |
| Pagamento original | 164993 | — |
| Nove adicionais vigentes | 35145 | 45651 |
| Refunds recebidos | 65515 | 84142 |
| Resíduos dos cancelados | 10959 | não representa saldo novo |
| Produtos/encargos vigentes até armazém | 123664 | não reavaliar por cotação |
| Custo líquido atual parcial | 134623 | — |
| Saldo disponível da conta | 28868 de base histórica | 37034 |
| Saída de simulação | 1502 de base consumida | 1800 |
| Bônus visível | 0 | 229 |

Equações obrigatórias: 164993 + 35145 - 65515 = 134623; 123664 + 10959 = 134623. Frete/Receita permanecem **pending**, não zero conhecido.

O extrato completo, a decomposição CNY de cada refund e todas as matrizes internas não foram lidos. Para fechar a fixture CNY há diferença líquida de **114 minor** entre as entradas/saídas listadas e o saldo-alvo: 84142 - 45651 + 229 - 1800 = 36920. Pode-se usar **um bônus adicional sintético de ¥1,14/base zero**, explicitamente identificado como construção de teste, para alcançar 37034. Isso NÃO afirma que esse foi um lançamento real em produção. Compensações/correções sintéticas devem fechar em líquido no CNY, com bases consistentes. Não adulterar saldo cache nem criar ajuste inexplicado para forçar a asserção.

### 11.4 Nove adicionais (nomes e referências fictícios)

| Papel de teste | Quantidade | CNY total produto+China | Base histórica BRL total | Alocação inicial |
| --- | ---: | ---: | ---: | --- |
| Acessório compartilhado A | 1 | 19,02 | 14,28 | pacote |
| Cordas compartilhadas B | 1 | 30,74 | 23,07 | pacote |
| Cordas compartilhadas C | 2 | 46,12 | 34,61 | pacote |
| Cordas compartilhadas D | 2 | 46,12 | 34,62 | pacote |
| Polo QA | 1 | 47,23 | 35,45 | sem pacote |
| Tênis QA | 1 | 181,71 | 141,85 | sem pacote |
| Camiseta QA | 1 | 26,39 | 22,42 | sem pacote |
| Camiseta B QA | 1 | 26,18 | 19,80 | sem pacote |
| Kit QA | 1 | 33,00 | 25,35 | sem pacote |

Cinco sem pacote: bases BRL produto/China respectivamente 29,45/6,00; 127,71/14,14; 22,42/0; 16,05/3,75; 24,58/0,77. Taxas desses pagamentos por saldo são zero. Preservar essas âncoras sem converter pela cotação exibida da HubBuy.

### 11.5 Dez refunds e resíduos

| Papel de teste | Recebido BRL | Custo mantido BRL |
| --- | ---: | ---: |
| Brinquedo QA | 14,25 | 2,32 |
| Calçado cancelado QA | 69,07 | 9,41 |
| Meias A QA | 2,94 | 3,51 |
| Meias B QA | 2,94 | 3,51 |
| Meias C QA | 3,02 | 3,52 |
| Camisa presente QA | 27,63 | 4,64 |
| Tênis cancelado QA | 103,78 | 9,76 |
| Meias D QA | 3,89 | 3,52 |
| Memória compartilhada A QA | 240,07 | 38,96 |
| Memória compartilhada B QA | 187,56 | 30,44 |

Criar bases produto/China/taxa válidas que somem os recebidos + resíduos com pagamento original preservado. A atribuição exata interna não observada deve ser sintética e documentada; nunca alterar taxa total original para encaixar o cenário. O conjunto de vinte linhas originais ativas deve somar **R$885,19** até o armazém, fechando com os adicionais.

### 11.6 Valores pessoais e limites da reprodução

Âncoras observadas, para o relatório de referência: custo líquido A/B/C/D = **39496 / 25268 / 39375 / 30484**; créditos recebidos BRL = **24815 / 14254 / 25021 / 1425**; saldo CNY = **14233 / 13894 / 7009 / 1898**; bases disponíveis BRL = **10406 / 10432 / 6605 / 1425**. A ordem A/B/C/D corresponde apenas à ordem sintética definida no manifesto.

Buscar reproduzir essas parcelas com pesos/fontes sintéticos válidos; o obrigatório é preservar centavos e capacidades por pessoa antes/depois. Não forçar valores por UPDATE ou relaxamento de regras. Se a reconstrução completa dessas parcelas não for viável sem detalhes não observados, manter âncoras globais exatas, documentar a distribuição sintética escolhida e a diferença em relação à referência, sem alegar cópia exata. Isso não dispensa o cenário compartilhado/FIFO nem o comparador pessoal. O gate humano deve exibir essa limitação antes do aceite.

### 11.7 Dois modos da carga

**Legado:** gerar banco no schema imediatamente anterior às migrations desta entrega com os fatos acima; migrar e comparar. Usar migrations até o limite escolhido, não gravar tabelas novas fingindo upgrade antigo.

**Fluxo novo:** partir de banco vazio e executar compra → pedido sem pacote → recebimentos parciais → reserva → retirada → montagem multi-compra → fechamento → frete pago → despacho → recebimento, inclusive a camiseta retida para compra futura. O mesmo manifesto informa os resultados esperados em cada etapa.

Adicionar segunda compra/pedido QA na mesma conta e terceiro em conta diferente; são cenários derivados e não alteram o baseline de 41 unidades. Criar também snapshots legados enviados/recebidos e encerrados em cenários separados.

## 12. Fases de implementação e gates

### Fase 0 — auditoria, baseline e contrato executável

- Ler fontes, mapear tabelas/triggers/APIs legadas e caminhos de escrita, inclusive correções/refunds/QC.
- Registrar alterações de terceiros e checks reais. Atualizar pontualmente AGENTS/PROMPT/docs canônicos para referenciar a extensão aprovada, sem reescrever as regras históricas.
- Escrever cenário/manifesto/gerador legado e comparador antes de mudar o modelo. Demonstrar baseline sintético válido e documentar todos os detalhes construídos.
- Entregar uma tabela de propriedade de custos: pedido, pacote, ledger e consolidados; listar encerramento/reabertura por escopo.

**Gate G0:** baseline financeiro e de quantidades reproduzido em banco isolado, sem acesso externo; fixtures não contêm dados identificáveis reais; nenhuma mudança de produção.

### Fase 1 — schema compatível, migração e relatório

- Implementar estruturas do §5, constraints, índices, eventos, revisões e estados de revisão legada.
- Criar migrations novas, Drizzle journal/snapshots, verify e relatório preview/compare.
- Ensaiar vazio, upgrade populado, reaplicação, falha/interrupção e FKs/triggers; sem classificação física automática.

**Gate G1:** IDs/pagamentos/taxas/ledger/QC/snapshots preservados; 26/5/10 quantidades continuam corretas; comparação monetária não apresenta diferença; registros ambíguos visíveis e protegidos.

### Fase 2 — projeções financeiras e quantidades

- Separar total até o armazém, parcelas de unidades, total do pacote e consolidado global.
- Criar leitores por pedido/pacote, suporte multi-origem, estados por quantidade e custos residuais de refunds.
- Definir e testar arredondamento/snapshot de unidades/pessoas compatível com refund-unit-capacity; impedir reatribuição de centavos já capturados.
- Separar encerramento financeiro do pedido e do pacote, sem obrigar envio de unidades armazenadas.

**Gate G2:** soma pessoal = global; soma de bases alocadas + livres = base enviável; encargos contam uma vez; cinco sem pacote têm subtotal até armazém resolvido; saldo e custo global antigos idênticos.

### Fase 3 — serviços de chegada, reserva e ciclo do pacote

- Implementar comandos §6, gates por estado/conta e transações multi-item com idempotência.
- Atualizar finalização e adicionais para não criar pacote/reserva automática.
- Implementar conferência legada preview/confirm, liberação/retirada sem dinheiro, selo/pago independentes, despacho, recebimento e peso pós-gate.
- Proteger APIs legadas e abas antigas; atualização concorrente não pode liberar unidades duas vezes.

**Gate G3:** cross-purchase da mesma conta funciona; conta estrangeira falha sem escrita; fechado+pago promove e liberam campos; fechar sozinho/pagar sozinho não; rollback e concorrência passam.

### Fase 4 — refunds, correções e QC

- Aplicar reembolso apenas a faixas livres fora de pacote, preservar recebimentos legados e correções financeiras.
- Adaptar substituição de pedidos com posição/reservas e restrições de pacotes fechados/enviados; preservar histórico e QC.
- Mover gerenciamento JSON/QC para Pedidos com origens autorizadas e pipeline existente, sem import financeiro/logístico implícito nem upload manual.

**Gate G4:** reserva × refund só uma vence; refund recebido antigo não duplica crédito; substituídos não reaparecem; fotos/capa/tombstones mantidos; simulação ¥18 continua apenas no saldo.

### Fase 5 — interface completa e compatibilidade de links

- Construir Pedidos, seleção/quantidades, pacotes e revisão legada, reutilizando componentes extraídos.
- Renomear navegação; implementar ilha mobile com Mais; preservar temas, teclado, foco e rascunhos.
- Exibir histórico original/adicional/correções/refunds sem novo dashboard; links legados funcionam.

**Gate G5:** fluxos completos acessíveis em desktop/mobile; cancelar modal não grava; seleção inválida não cria pacote parcial; não há imagem real em superfícies não autorizadas ou controles administrativos QC para membro comum.

### Fase 6 — carga dev e simulação humana obrigatória

- Preparar banco de dev local com a carga baseline legada migrada, acessível por login QA. Demonstrar também cenário novo/multi-compra derivado em banco separado.
- Rodar roteiro guiado: conferir 26 vinculadas/5 livres/10 canceladas → confirmar chegada sintética → conservar camiseta → montar pacote com outros itens → pagar/fechar → verificar Em pacote → nova compra e envio posterior da camiseta → conferir saldos/custos.
- Guardar relatórios antes/depois e capturas sintéticas em artifacts/qa/orders-transition/. Documentar URL localhost, credenciais QA, comandos de iniciar/parar, localização dos bancos, reset não destrutivo e resultados esperados.
- Solicitar validação do usuário sobre a simulação **somente após o ambiente concreto estar pronto**, sem pedir autorização para criar os dados sintéticos já solicitados. Se usuário indisponível, concluir gates técnicos e entregar pendência de aceite humano explicitamente; não declarar aceite obtido.

**Gate G6:** carga criada e navegável, relatórios conciliados, roteiro técnico completo; implementação só é considerada pronta para liberação após aceite humano da simulação ou dispensa explícita dele. Disponibilização remota exige autorização adicional se necessária.

### Fase 7 — regressão, documentação e handoff operacional

- Completar matriz §13 e gates existentes de autenticação/favoritos/compra/histórico/contas/QC.
- Revisar código financeiro/autorização/migration, corrigir achados e registrar evidências reais, sem copiar contagens de planos anteriores.
- Atualizar docs/IMPLEMENTATION_REPORT.md, este plano com estado das fases e documentação de operação/compatibilidade/rollback.
- Entregar arquivos/migrations, riscos remanescentes, relatório sintético, pendências humanas e runbook de produção condicionado à autorização.

**Gate G7:** checks passam; carga dev entregue; nenhum serviço/banco externo foi alterado; produção continua sem migration/publicação nesta tarefa.

## 13. Matriz mínima de validação

| Área/caso | Resultado obrigatório |
| --- | --- |
| Finalizar compra nova | Histórico intacto; pedido criado atomicamente; nenhum pacote/reserva/pagamento automático |
| Preço/China pendentes | Valor desconhecido explícito; gate de pagamento/fechamento não usa zero implícito |
| Chegada parcial/correção | Quantidades e autoria corretas; não reduzir abaixo das reservas/expedições |
| 3 unidades em posições distintas | Filtros e totais sem duplicação; seleção só da capacidade livre |
| Reserva em dois pacotes concorrentes | Só capacidade válida vence; nenhuma reserva dupla ou pacote vazio residual |
| Retirar de montagem | Volta ao armazém; saldos/pagamentos/produtos/taxas intactos |
| Cross-purchase mesma conta | Mesmo pacote recebe duas origens; cada base preservada, encargos somam uma vez |
| Conta/workspace estrangeiros | Rejeição no servidor e rollback integral, sem vazamento |
| Conta legada só textual | Conferência exigida; nome/email não concedem vínculo financeiro |
| Fechado sem frete pago / pago sem fechar | Não promove; reserva protegida e situação visível |
| Fechado + pago | Em pacote, dados adicionais liberados, ainda não Enviado |
| Imposto desconhecido | Não impede Em pacote; mantém financeiro parcial e encerramento bloqueado |
| Peso | Inteiro gramas, limite/nulo; edição só no gate; não altera frete/rateio |
| Despachar/receber | Gates e sequência válidos; sem alteração de pagamentos; pós-envio não libera reembolso |
| Reabrir conteúdo pré-envio | Motivo/auditoria; pagamento preservado; rateio revisto; alteração de total tem tratamento explícito |
| Reembolso livre/reservado/fechado/enviado | Só livre solicita; UI e request direto concordam; sem remoção silenciosa de pacote |
| Refund legado solicitado | Recebe normalmente sem cancelar novamente; crédito único; histórico intacto |
| Refund parcial/zero recebido/base BRL zero | Contratos existentes preservados; nativo CNY e bônus continuam corretos |
| Correção de pedido adicional | Só substituto vigente; oito anteriores fora do estoque; fontes/parcelas/QC/reservas coerentes |
| Centavos 0,01/0,02 e quantidade repartida | Soma pessoal/unidades/pacotes fecha; renomeação/filtro não muda restos |
| FIFO, saldo próprio/alheio, adiantamento | Genealogia preservada; conta sem saldo suficiente falha sem novas parcelas |
| Simulação e bônus | Saída só no ledger, bônus base zero; sem custo de pacote artificial |
| QC import/reimport/delete/cover | Origens válidas, mesmas imagens e permissões; sem inferir chegada ou custo |
| Migration vazio/populado/repetida | Dados antigos intactos, FKs/triggers válidos; sem backfill monetário/logístico inventado |
| Conferência legada concorrente | Revisão stale rejeitada; confirmar duas vezes não duplica evento/capacidade |
| Encerramentos independentes | Pedido pago pode guardar item; pacote enviado com Receita pendente não encerra financeiro |
| Idempotência/resposta perdida | Mesma operação recuperada; chave com payload diferente rejeitada |
| Falha injetada após escrita parcial | Rollback de pacote/reserva/evento/revisão; nenhuma inconsistência |
| API legada/aba antiga | Não contorna novo gate nem cria pacote automático após cutover |
| Links salvos e contas | URLs antigas resolvem corretamente, nunca colisão trackingId/packageId |
| UI 320/390/768/1024/1440 | Sem overflow global; ações acessíveis, foco/teclado, dark/light, reduced motion |
| Baseline dev | 41−10=31=26+5; pagamentos 164993+35145−65515=134623; saldo 37034/base28868 |

Concorrência multiprocesso mínima: reserve×reserve entre compras, reserve×refund, closeContent×release, markPaid×conteúdo, dispatch×reopen, receiptCorrection×reserve, orderCorrection×reserve, reviewLegacy×mutation. Provar rollback por falha real de trigger/helper e não somente mocks que lançam antes de escrever.

## 14. Comandos, evidências e entrega

Comandos existentes: npm run typecheck, npm run lint, npm test, npm run build, npm run check, npm run test:e2e, npm run db:migrate, npm run db:verify. npm run check agrega typecheck/lint/Vitest/build; evitar repetição sem alteração ou falha. Scripts novos de carga/comparação precisam constar do package.json e da documentação.

Criar testes dedicados de projeção/estados, serviços, migration/upgrade, concorrência e E2E. Reexecutar os testes existentes de custos/refunds/correções/balance/QC impactados. Usar isolamento de banco/porta/build para não conflitar com trabalhos de landing no checkout. Preferir runner específico; o E2E server atual usa porta 3100, pode apagar data/e2e.sqlite e carrega seed genérico — não reaproveitar sem isolamento explícito.

Para toda migration/teste: destino local novo conhecido, TURSO_DATABASE_URL explícito, TURSO_AUTH_TOKEN ausente no processo isolado e credenciais externas desativadas. Antes de apagar qualquer artefato de teste, resolver o caminho absoluto e comprovar que está dentro do diretório descartável pretendido. Nunca rodar db:migrate confiando no .env padrão. Migração somente explícita, nunca em request/startup da aplicação.

Entregar:

- implementação local e migrations novas;
- relatório do baseline e compatibilidade por tabela/escopo;
- carga sintética navegável + manifesto + comparador + roteiro de simulação;
- diferenças entre observação e construção sintética documentadas;
- testes e capturas reais, incluindo ambos os temas e celular;
- checklist de aceite humano preenchido ou explicitamente pendente;
- runbook de backup/cutover/verificação/recuperação com produção ainda não executada.

Não declarar esta extensão concluída apenas porque build passa: a carga e a simulação do legado são requisitos expressos do usuário.

## 15. Prompt sugerido para iniciar o agente executor

> Implemente a extensão Pedidos → Armazém → Pacotes conforme docs/39_ORDERS_WAREHOUSE_AND_PACKAGES_PLAN.md. Leia as instruções e fontes obrigatórias, preserve alterações de terceiros e execute todas as fases locais em sequência. Comece pela carga sintética legada e comparação, mantendo as âncoras numéricas, antes de alterar o modelo. Entregue migrations, implementação, testes, ambiente dev navegável com dados de teste, roteiro de simulação humana e runbook. Não publique, não migre produção, não altere dados reais nem use credenciais externas. Não declare o aceite humano realizado sem resposta do usuário. Registre claramente qualquer diferença entre a fixture sintética e os fatos observados; pedidos substituídos, refunds, créditos consumidos e QC devem manter sua genealogia.
