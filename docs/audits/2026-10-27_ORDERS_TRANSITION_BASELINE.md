# Baseline — Pedidos, armazém e pacotes

Data: 27/10/2026. Execução local da preparação do plano 39. **A extensão completa não está implementada.**

## Checkout preservado

Antes das alterações desta execução: modificações em `docs/AUTH_EMAIL_IMPLEMENTATION_REPORT.md`, `docs/INDEX.md` e `tsconfig.json`; plano 39 e arquivos novos de landing/planning, configuração Playwright landing, `reset-password.sh`, componentes/rotas/assets/testes de landing. Não foram revertidos, incluídos em commit ou atribuídos à extensão.

## Propriedade dos custos e ciclos

| Escopo | Fonte atual | Contrato da extensão |
| --- | --- | --- |
| Produto/China/taxa original | `purchase_item_costs`, `purchase_cost_participants`, cobrança products por pedido | Permanecem no pedido original; finalizar não deve registrar pagamento |
| Adicionais e fontes | pedidos, componentes, alocações e consumos confirmados; correções append-only | Só substitutos vigentes fornecem custo/capacidade; histórico preservado |
| Reembolsos/resíduos | snapshots de refund, participantes, eventos e recebimentos | Só recebido reduz custo; resíduo fica no pedido/titular, fora do pacote |
| Frete Brasil/taxa/Receita | cobranças por pacote, hoje ainda com tracking obrigatório | Propriedade logística independente; herdar custo dos itens não lança nova cobrança |
| Saldo/direitos/adiantamentos | ledger, shares, consumptions e financing | Separados do custo. Simulação reduz saldo/base; não cria encargo |
| Consolidado | custos vigentes de pedidos − recebidos + encargos dos pacotes | Bases herdadas dos pacotes não entram novamente |

Fechamento do pedido deverá exigir resolução financeira, sem exigir alocação completa. Fechamento do conteúdo do pacote, pagamento de frete, despacho, recebimento e encerramento financeiro deverão ser fatos distintos. Reabertura de pedido/pacote exige revisão e motivo; nunca reabre compra finalizada. Esses comportamentos são contratos do próximo incremento, não funcionalidades já expostas.

## Caminhos de escrita auditados

- `finalizePurchase` → `initializePurchaseCosts`: atualmente cria tracking/pedido/custos, Pacote 1, alocações e cobranças. Deve mudar atomicamente, junto do protocolo de escritores.
- `packageCostServices.mutate`: membership, revisão/status e transação; `saveAllocations`, `savePackage`, `unsealPackageContent`, cobranças e fechamento ainda operam por tracking.
- `requestRefund`/`updateRefundRequest`: retiradas explícitas legadas; precisam passar à capacidade livre fora de qualquer reserva. Recebimentos legados não devem refazer cancelamento.
- `purchaseCostOrderServices`: snapshots adicionais, pagamentos, FIFO/direcionamentos e fontes; drafts não fornecem capacidade.
- `purchaseOrderCorrectionServices`: compensação → substituto → pagamento → transferência de alocações/QC, atomicamente. Pacotes selados/enviados e refunds protegem dependências.
- QC: targets originais/adicionais por compra, rematch/cover/preview/tombstones independentes de dinheiro/logística. O armazenamento QA é explicitamente local e guardado; o padrão de produção continua R2 privado.

Não foi removida nenhuma validação de tracking para simular suporte multi-origem. Não foi alterado o comportamento operacional de finalização/refund/reserva.

## Resultado reproduzido

O comando `dev:compare:orders-transition` passou as 11 âncoras quantitativas e 17 monetárias do manifesto, incluindo os valores específicos de cada adicional. Replay FIFO de cada consumo, soma pessoal/global e fechamento de cada componente passaram. Oito correções pagas usam compensação real, sem ajustes de cache, taxa ou histórico.

O cenário tem seis galerias/24 imagens sintéticas, uma capa na segunda página e vínculo QC transferido pela correção do Kit. Originais/previews ficam em armazenamento QA privado junto do arquivo explicitamente escolhido. A rota de original exige sessão, membership, destino válido e imagem pronta/não excluída. O modo QA não baixa CDN nem acessa R2.

As parcelas pessoais são sintéticas e diferem da referência; o comparador lista todas as diferenças. Ver o [guia da carga](../testing/ORDERS_TRANSITION_DEV_SCENARIO.md).

## Validações e limitações

- Baseline inicial: typecheck e lint passaram antes do código novo.
- Primeira suíte global no sandbox: erro de cache SSR temporário `ENOENT`. Reexecução serial com TEMP/TMP isolados executou 471 testes: 448 passaram, sete ignorados, 16 falharam. Quinze falhas vieram da origem de autenticação escolhida pelo runner (3139, quando os testes esperam 3000); corrigida a configuração, os testes de autenticação/email/perfil passaram.
- Suíte dirigida posterior: 33 passaram e uma falha de concorrência `SQLITE_BUSY` em confirmação idêntica de correção paga por processos independentes. A falha também ocorreu antes de alterar esse domínio, no baseline. Não foi suprimida nem contornada com alteração de semântica financeira.
- Três testes novos de isolamento/carga passaram. Geram dados por serviços reais, validam leitura sem escrita, negam outsider/outro workspace e conferem preservação financeira após QC.
- Build Next.js passou em `.next-orders-transition-build`, com configuração sintética. A primeira tentativa encontrou EPERM ao criar diretórios no sandbox; execução local autorizada fora dessa restrição passou.
- Chromium do baseline passou com login QA, âncoras da API, navegação, temas e larguras 320/390/768/1024/1440. A prova do original QC privado é registrada na rodada final; consultar log/capturas locais.

Logs/capturas/comparações ficam em `artifacts/qa/orders-transition/`. A suíte global não deve ser descrita como integralmente aprovada enquanto a corrida financeira persistir. O resultado final efetivo da última rodada será acrescentado abaixo.

## Operação futura, ainda não executada

Produção depende de autorização específica: backup recuperável e restauração ensaiada → janela sem escritores antigos → inventário fresco → migrations explicitamente revisadas → verify/comparador exato → versão compatível → smoke somente leitura → conferências operacionais autorizadas. Não usar os números da inspeção como predicado de script remoto. Depois de reservas multi-origem, rollback só de código é inseguro; suspender escritas e preferir correção em frente ou restauração coordenada.

A revisão automática rejeitou uma proposta de exportação integral que incluiria tabelas de autenticação. Essa proposta não foi aplicada. O cenário entregue continua sendo construído pelos serviços reais, sem exportar credenciais ou hashes de senha.

## Rodada final

- Suíte global com origem correta e ambiente local explícito: **466 passaram, sete ignorados e um falhou**, em 70 arquivos (474 testes). A única falha continua em confirmação idêntica de correção paga por processos independentes, ao iniciar `BEGIN IMMEDIATE`, com `SQLITE_BUSY`. Reproduzida isoladamente; testar pool local de uma conexão também não a resolveu, e a tentativa foi revertida. Nenhuma alteração de pool/retry/semântica financeira integra esta entrega.
- Após acrescentar três verificações específicas dos guards QC, a suíte dirigida final aprovou **53 testes em quatro arquivos**, incluindo os 47 cenários QC existentes e seis testes da carga/isolamento.
- Typecheck e lint finais: passaram. Build local isolado: passou. `git diff --check`: passou.
- Migration explícita reaplicada sem duplicação e `db:verify`: **51 tabelas, 58 triggers, zero violações FK**. Seed repetido reconheceu o cenário sem inserir linhas. O banco final `data/orders-transition-review.sqlite` foi gerado do zero e seu comparador passou, incluindo pares por componente de cada adicional e replay FIFO integral.
- Chromium final: **um cenário passou**, com original QC privado decodificado de 360 px e zero solicitações HTTP externas. Capturas claras/escura em 320/390/768/1024/1440, viewer e saldo estão em `artifacts/qa/orders-transition/`; desktop claro e mobile escuro inspecionados visualmente.
- A revisão automática também rejeitou as referências em AGENTS/PROMPT, classificando-as como alteração de instruções confiáveis. Esses arquivos não foram modificados. O pedido de autorização relativo a essa parte documental permanece separado; não libera produção nem substitui os gates técnicos.

**Estado efetivo:** preparação/carga legada disponível em localhost:3139; G1–G7, migrations novas e modo de fluxo novo ainda pendentes. O aceite humano da extensão não foi solicitado, pois a simulação do novo fluxo ainda não existe. Não declarar implementação completa nem prontidão para liberação.

## Correção após code review — comparador

A revisão GPT‑6.1 Sol high encontrou um P2: os hashes e valores pessoais eram somente relatados, sem comparação com a baseline persistida. A revisão de padrões não encontrou violação acionável. O usuário solicitou correção e nova revisão em ciclo.

- `preservation.ts` define o contrato versionado, tabelas de domínio protegidas, hashes por campos capturados e parcelas/capacidades pessoais. Não exporta registros de autenticação. Snapshots, dinheiro, referências QC e eventos antigos precisam permanecer iguais; sessões/contadores de leitura podem mudar e eventos QC novos podem ser acrescentados.
- O CLI lê e valida `<banco>.baseline.json` antes de abrir o banco. Arquivo ausente, antigo ou inválido falha sem recapturar os dados atuais. O seed continua sendo o único ponto de captura, depois de construir e validar um banco sintético novo.
- Dez refunds passam a ser verificados individualmente, incluindo recebido, residual e quantidade, sem aceitar diferenças que se compensem apenas no agregado.
- Testes negativos reproduziram o defeito antes do ajuste: cinco falharam no código anterior. Cobertura nova altera URL/variação, tombstone/vínculo QC, valores individuais de refunds, distribuição pessoal e auditoria QC antiga; também valida sessões, leituras e novos eventos legítimos sem falso positivo, além da recusa de baseline ausente/inválida/antiga pelo processo CLI.
- Banco novo `data/orders-transition-review-fixed.sqlite`: seed e comparação com a baseline versionada passaram. Bancos anteriores foram preservados, sem sobrescrever sua baseline.

A segunda rodada independente confirmou a correção inicial, mas identificou outra omissão: `qcImports` não estava incluída na preservação. A rodada foi interrompida por limite de uso antes da conclusão formal; não foi registrada como aprovação. A correção não implementa G1–G7 nem altera pagamentos, banco remoto, publicação ou regras financeiras da aplicação.

### Proveniência QC e terceira revisão

- Dois testes novos reproduziram aprovação indevida após alterar o título de uma ocorrência no manifesto QC e após trocar o autor da importação por outro membro válido, sem mudar os agregados financeiros.
- `qcImports` agora integra a preservação exata, incluindo manifesto, autoria, origem, estado/revisão, bytes e datas. O contrato passou à versão 2. Baselines v1 ou sem a cobertura completa são recusadas; não foram migradas nem recapturadas a partir dos bancos existentes.
- O caso positivo consulta a importação pelo serviço real, além de galeria/original/fallback, e continua aprovado sem congelar sessões, limites de leitura ou novos eventos legítimos de auditoria.
- Validação final: **18 testes passaram em cinco arquivos** (`provenance-final-tests.log`); typecheck e lint passaram. `git diff --check` passou. Banco novo `data/orders-transition-review-v2.sqlite`: seed + CLI com `passed=true` e `failures=[]`. Baselines e bancos anteriores foram preservados. A mudança é somente no tooling/testes da carga, sem alteração do runtime financeiro; build/E2E/suíte global não foram repetidos nesta correção.
- Terceira revisão independente GPT‑6.1 Sol high, seguindo os eixos Standards e Spec da skill code-review do Matt Pocock: **zero achados de código em ambos**, com os dois P2 resolvidos. Os comandos da documentação foram alinhados ao banco e contrato v2 após a conferência do revisor.

O ciclo de revisão dos achados deste incremento está encerrado após a conferência documental. **G1–G7 e a extensão completa continuam pendentes**, assim como a falha global preexistente de concorrência SQLite registrada acima. Nenhuma aprovação de produção ou aceite humano da extensão é inferida deste resultado.
