# Correções dos quatro achados de recargas e frete

Contrato: plano 47. Escopo: corrigir os quatro achados da revisão, sem novas funcionalidades ou alterações de política econômica. Não houve commit, publicação, banco remoto ou uso de dados reais nesta correção.

## Causas e correções

### P1 — dupla restituição de débito associado

A associação preservava a natureza `manual_adjustment` do ledger, mas o serviço de ajustes continuava autorizando sua anulação e a associação não verificava compensações anteriores. O frete possuía outro caminho de restituição para os mesmos consumos.

O serviço de frete rejeita débito já compensado e valida novamente antes de restituir. O serviço público de ajustes, usado pela rota antiga, bloqueia anulação independente quando qualquer consumo foi associado a frete; essa propriedade permanece após anular o frete. O extrato recebe a mesma elegibilidade, e o seletor de débitos exclui compensados ou já associados. A autoria e a classificação original continuam imutáveis.

A migration **0038_freight_review_restitution_guards.sql** acrescenta tetos de restituição CNY/BRL por débito e titular, proteção da associação e propriedade compensatória do frete. Os guards também impedem contornar o serviço com INSERTs inconsistentes. Não inserem movimentos nem corrigem silenciosamente dados antigos.

### P2 — anulação de recarga recuperada

A verificação antiga considerava qualquer consumo persistido como dependência definitiva. Ela não distinguia consumo econômico ativo de consumo cuja restituição já estava disponível em novos créditos.

`topup-recovery.ts` percorre o grafo de compensações completas, com mesma conta, titular, CNY e base histórica. Primeiro retira o remanescente ainda disponível dos lotes originais; depois seleciona somente créditos descendentes restaurados, nas quantidades/bases exatas ainda necessárias. Nunca reutiliza capacidade original gasta nem créditos desconectados. Pools com várias origens conservam os direitos e as bases; anulações auditadas de outras recargas retiram apenas suas raízes.

Consumo ativo, restituição parcial, fundos posteriores consumidos ou taxa ainda atribuída mantêm o bloqueio. Uma restituição aninhada completa pode voltar a tornar a raiz elegível. O serviço e a lista de recargas usam a mesma projeção; `canReverse` e o principal recuperável vêm do servidor. O guard de anulação de recarga foi substituído na migration nova por validação recursiva equivalente, sem remover os controles de escopo, valores, titularidade e taxa.

### P3 — excesso devolvido pela revisão

O componente subtraía apenas recibos com `returnsReceiptId`. Recebimentos que quitavam claims de correção tinham outra genealogia e não eram reconhecidos.

`settlement-excess-projection.ts` projeta o excesso no servidor a partir de recibos ativos, alocações, linhagem das claims e versão vigente. Cada centavo de uma transferência real é atribuído uma única vez, com ordem persistida de registro para excessos anteriores; emitir novamente uma obrigação restante não equivale a pagar. Devolução direta e baixa de claim são caminhos disjuntos. O DTO separa devolvido, aberto, compensado por mudança do alvo, anulado e pendente de revisão. A UI apenas apresenta esses valores, preservando a diferença entre correção do registro e devolução bancária real.

### P4 — rastreabilidade de frete

O leitor só resolvia `paymentAllocationId` de pedidos. Os consumos de frete, inclusive ajustes associados, permaneciam sem destino e eram somados como ajustes.

A leitura agora resolve fontes e matriz original do pagamento por relações de conta/workspace, com agregação por consumo, beneficiário e componente. O histórico identifica pacote, pagamento, financiador, beneficiários, CNY e bases BRL. O frete tem subtotal separado e deixa de ser apresentado como ajuste de saída. O ledger original não é reclassificado por UPDATE. O extrato também identifica o pacote e sinaliza débito legado associado.

As restituições de fretes com várias origens usam uma matriz com margens exatas para apresentar os vínculos de ida/volta sem repetir o crédito completo em cada lote. Os totais dos destinos são conferidos contra os consumos originais; inconsistências geram diagnóstico em vez de sumir com dinheiro.

## Arquivos principais

- Serviços: `package-freight-services.ts`, `hubbuy-balance-adjustments.ts`, `hubbuy-topup-services.ts`, `package-settlement-services.ts`, `hubbuy-balance-services.ts`.
- Projeções: `topup-recovery.ts`, `settlement-excess-projection.ts`, `hubbuy-balance-traceability.ts`, `hubbuy-balance-traceability-reading.ts`.
- UI: `hubbuy-topups.tsx`, `freight-finance-panel.tsx`, `hubbuy-accounts-panel.tsx`, `hubbuy-individual-rights.tsx`. Componentes e tokens existentes foram preservados.
- Banco: migration 0038, snapshot/journal e `scripts/freight-database-verification.ts`.
- Testes: `freight-settlements.test.ts`, `freight-worker.ts`, `freight-review-migration.test.ts`, `settlement-excess-projection.test.ts`, `topup-recovery.test.ts`, `tests/freight-review/corrections.spec.ts`.

## Evidências já executadas

- **Antes da correção:** quatro regressões novas falharam, uma para cada achado. Log: `artifacts/freight-review-four-findings-before.log`.
- **Depois:** as quatro reproduções passaram. A cobertura foi ampliada para associação de débito compensado, dupla restituição por INSERT, referência duplicada, replay, recuperação parcial/aninhada, dois principais em pool, consumo posterior, escopo/contexto e espaços pessoais.
- **Concorrência nova em processos independentes:** associação versus anulação manual e anulação de recarga versus consumo posterior. Um único vencedor, saldo/direitos conciliados e replay preservado. Também permanece o teste de concorrência de confirmação/recebimento do frete.
- **Projeção de excesso:** seis testes novos cobrem pagamentos parciais, versões sucessivas, recibos anulados, múltiplos excessos sem dupla atribuição, compensação distinta de retorno bancário e mudança de centralizador.
- **Migration:** banco vazio local explícito; upgrade populado 0037; falha após DDL com rollback; hashes das linhas financeiras protegidas idênticos; reaplicação sem movimento; `foreign_key_check` zero. Dois testes passaram.
- **Execução focada inicial:** 26 testes passaram em três arquivos: serviços/corridas, migration e excesso. Log: `artifacts/freight-review-corrections-final-focused.log`.
- **Regressão financeira final:** 56 testes passaram em oito arquivos, incluindo recargas, ajustes, origens, correções de pedidos, as novas reproduções e corridas e o caso de pool fragmentado sem base residual em CNY esgotado. Log: `artifacts/freight-review-corrections-final-regression.log`.
- **Unitários finais:** 307 testes passaram em 45 arquivos. Log: `artifacts/freight-review-corrections-unit-final.log`.
- **Integração ampla:** 386 testes passaram em 68 arquivos; sete casos de um arquivo legado continuam ignorados por dependerem de planilha privada. Log: `artifacts/freight-review-corrections-integration.log`.

A repetição dos testes anteriores não foi usada como evidência suficiente: as quatro falhas foram reproduzidas antes das correções e receberam regressões próprias. O primeiro E2E novo passou pelo bloqueio da rota antiga, identificação do frete no extrato/detalhes, anulação de frete, elegibilidade e anulação de recarga recuperada, excesso baixado parcialmente por claims e revisões sucessivas.

O **E2E no build final passou**, incluindo anular um recibo de devolução, reabrir R$ 0,60 e registrar nova baixa, sem dupla contagem. A anulação da recarga também confirmou o lote original esgotado e a base histórica anterior integralmente preservada. Log: `artifacts/freight-review-corrections-e2e-final.log`; screenshot mobile inspecionada em `artifacts/freight-review/corrections-390.png`. Typecheck, lint e build final passaram.

O verificador final registrou `status: ok`, zero violações FK, dez invariantes do protocolo de frete, saldo/direitos CNY 0,04 e base R$ 0,04. A recarga anulada ficou com zero no lote original; o excesso R$ 1,00 ficou integralmente devolvido, aberto zero, com três versões, quatro recibos e três recibos ativos. Relatório: `artifacts/freight-review-corrections-verification.json`.

Para repetir o E2E, criar uma fixture nova pelos comandos do roteiro 48 e iniciar o servidor com ela. Selecionar esse manifesto, definir `$env:FREIGHT_REVIEW_CORRECTIONS='1'` e executar `npm run test:freight-review -- --grep 'review corrections'`. O opt-in mantém esse cenário separado do ensaio original, pois ambos consomem fatos financeiros sintéticos e não devem compartilhar a mesma fixture durante uma execução completa. Todos os destinos são arquivos locais explícitos; o `.env` não resolve o banco de teste.

## Limites operacionais

Banco remoto e dados reais permanecem intocados. Se já houver uma dupla restituição em algum banco existente, os guards não desfazem esse fato: o verificador acusa a inconsistência para tratamento auditado específico. Nenhum backfill monetário foi criado.

Após compensar uma recarga com pools mistos, uma dependência econômica ainda ativa no pool bloqueia sua anulação; dinheiro de outro lote disponível não substitui essa dependência. Isso evita afirmar uma recuperação que a genealogia não comprova. A UI mantém a pendência de revisão quando uma anulação torna o fundamento de um acerto antigo desatualizado.
