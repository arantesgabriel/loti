# Finalização local — Pedidos, armazém e pacotes

Data: 27/10/2026. Complementa o [handoff anterior](../HANDOFF_ORDERS_WAREHOUSE_PACKAGES_2026-10-27.md) e o [plano 39](../39_ORDERS_WAREHOUSE_AND_PACKAGES_PLAN.md). Aceite humano e abertura do reviewer continuam pendentes. Não houve commit, PR, publicação, configuração externa ou migration de produção.

## Pendências do handoff tratadas

1. **Distribuição dos encargos:** Pacotes discrimina frete Brasil, taxa do frete e Receita por item/unidade/pessoa. A ponte legada apresenta suas parcelas originais por componente e pessoa. O texto distingue prévia em montagem de manifesto capturado; o histórico permanece preservado. Nenhuma foto foi adicionada aos pacotes.
2. **Consolidado e propriedade:** uma alteração registrada em `logistics_events` transfere permanentemente a propriedade do encargo para o novo pacote. Esse marcador já persistido e imutável vale mesmo ao voltar a `pending`; não exige migration ou regravação de dados antigos. A ponte permanece para auditoria, mas deixa de contribuir no encargo substituído. A mesma regra vale para pagamento/gates, filtros e apresentação. Somatórios validam inteiros seguros. As leituras usam uma transação libSQL explicitamente `read`: o adaptador Drizzle instalado ignora a opção SQLite de comportamento e abre transações de escrita por padrão. Há prova com escritor em processo independente.
3. **Verificação operacional:** o verificador reutilizável mantém as verificações financeiras existentes e acrescenta sete tabelas logísticas, 36 guards, oito índices e oito invariantes de capacidade, escopo, cancelamentos, posições e substituições. O runner de QA valida destino/marker antes de importar conexões; não lê `.env` nem executa migration implicitamente.
4. **Paginação:** filtros e paginação das identidades de Pedidos ocorrem no SQL, antes da carga de posições/reservas/produtos/participantes/QC. Apenas as origens visíveis recebem projeção financeira. A lista de Pacotes tem endpoint próprio, 20 resultados por página e contagem SQL de unidades. O seletor de pacotes em montagem pagina de 100 em 100, mantendo os vínculos da página visível. Seleções entre páginas preservam IDs e revisões; a transação de reserva continua validando a seleção inteira. O teste de escala usa 10.002 posições sintéticas e alcança a página 501.
5. **Ações finais:** correção de cobrança, reabertura financeira e nova confirmação de pagamento continuam cobertas no fluxo integrado. Foram acrescentados casos enviados/recebidos legados sem data conhecida: confirmar conteúdo registra a conferência atual, conserva datas de despacho/recebimento desconhecidas e não fabrica pagamentos. A disputa de conferência legada também exige recuperação com a mesma chave após `LOGISTICS_BUSY`, uma única revisão e um único evento.
6. **Regressão e simulação:** evidências finais abaixo; os cenários humanos novos não foram usados nos testes que alteram o ciclo do pacote.

As projeções financeiras ainda calculam integralmente cada origem visível, pois pagamentos, refunds e arredondamento pertencem à origem. Listas leves de contas/origens continuam disponíveis para os filtros. Não se promete custo constante para origens arbitrariamente grandes.

## Evidências

Todos os logs estão em `artifacts/qa/orders-transition/`.

| Verificação | Evidência |
| --- | --- |
| Regressão Vitest serializada, incluindo disputas e rollback | `finalization-all-tests.log` — 507 aprovados e sete ignorados; 78 arquivos aprovados e um ignorado; saída zero |
| Sete casos adicionais de finalização, escala e snapshot concorrente | `finalization-targeted.log` — sete aprovados |
| Typecheck isolado | `finalization-typecheck.log` — aprovado |
| Lint | `finalization-lint.log` — aprovado |
| Build isolado, incluindo TypeScript e geração de rotas | `finalization-build.log` — aprovado |
| Upgrade repetido e comparação da baseline original | `finalization-upgrade.log`, `finalization-comparison.log` — `passed: true`, sem diferenças |
| Auditoria operacional dos cenários legado e humano | `finalization-verify-legacy.log`, `finalization-verify-human.log` — aprovadas, zero violações FK |
| Estado inicial humano conservado | `finalization-human-state.log` — cinco compradas, quatro recebidas, duas reservadas e duas livres; frete/Receita pendentes, conteúdo aberto e nenhum despacho |
| Chromium: navegação e ciclo completo novo | `finalization-browser.log` — dois cenários aprovados; claro/escuro, 320/390/768/1024/1440 |
| Chromium: legado, links, QC privado e saldo | `finalization-legacy-browser.log` — um cenário aprovado |
| Chromium: seleção entre páginas, cancelamento e rollback de seleção desatualizada | `finalization-pagination-browser.log` — um cenário aprovado; GET paginado sinteticamente e mutação validada pelo servidor real |
| Rateios inspecionados visualmente em desktop/mobile | `new-package-charges-{light,dark}-{390,1440}.png` |

As capturas dedicadas de rateio ocultam somente a navegação fixa durante a captura, para ela não cobrir o recorte longo; os testes de navegação e overflow usam a interface normal. O Vitest usa `TEMP`/`TMP` em `artifacts/qa/orders-transition/runtime-temp` para evitar perda do cache temporário entre processos do sandbox. As primeiras tentativas bloqueadas pelo ambiente/cache não certificam os checks finais. Chromium usa a instalação local existente em `C:\Users\Gabriel\AppData\Local\ms-playwright`.

Uma execução completa anterior encontrou `LOGISTICS_BUSY` na disputa de conferência legada, sem escrita. O teste passou a comprovar recuperação pela mesma chave/payload após o encerramento dos dois processos e unicidade de revisão/evento. A execução final acima inclui essa recuperação; não houve relaxamento da capacidade nem alteração do retry de produção. Os sete testes ignorados dependem do workbook privado legado, ausente nesta validação; nenhum dado real foi copiado para habilitá-los.

## Gates atualizados

| Gate | Estado técnico e pendência |
| --- | --- |
| G0 | Baseline original conservada, comparador aprovado; diferenças pessoais sintéticas documentadas no relatório de baseline |
| G1 | Schema/backfill existentes e upgrade preservados; verificador operacional logístico integrado e executado nos destinos sintéticos |
| G2 | Encargos por componente/pessoa apresentados; propriedade legada, somas seguras e snapshot concorrente cobertos |
| G3 | Ciclo, seleção integral, contenção/idempotência, concorrência e rollback revalidados |
| G4 | Refunds, correções, fontes e QC incluídos na regressão; baseline monetária e genealogia preservadas |
| G5 | Quatro jornadas Chromium, dois temas e cinco larguras; rateios conferidos visualmente; sem novas fotos em Pacotes |
| G6 | Ambiente concreto e roteiro disponíveis; **aceite humano pendente** |
| G7 | Documentação/runbook e checks técnicos entregues; **reviewer fechado até autorização do usuário**, produção não executada |

## Simulação humana

O banco inicial novo é `data/orders-transition-finalization-human-01.sqlite`, com marker próprio. Contém duas compras da mesma conta, cinco unidades compradas, quatro recebidas, duas reservadas no pacote conjunto, duas livres e uma aguardando chegada. O pacote começa em montagem, com frete/Receita pendentes e sem pagamento de frete, fechamento, despacho ou recebimento. O cenário é inteiramente sintético.

```powershell
npm run dev:verify:orders-transition -- --database file:./data/orders-transition-finalization-human-01.sqlite
npm run dev:orders-transition -- --database file:./data/orders-transition-finalization-human-01.sqlite
```

Abrir `http://localhost:3139/orders`. Login: `pessoa-a@loti.test`; senha: `Loti-Orders-QA-Only-2026!`. As pessoas B/C/D usam emails equivalentes e a mesma senha de teste. Só um servidor ocupa 3139; parar com Ctrl+C no terminal correspondente antes de trocar de cenário.

Seguir o [roteiro humano](ORDERS_TRANSITION_EXECUTION.md#roteiro-humano-de-aceite). O legado preservado permanece em `data/orders-transition-implementation-v2.sqlite`; seu total líquido é R$1.346,23, saldo ¥370,34/base R$288,68, com 41−10=31=26+5 unidades. As parcelas pessoais são construções sintéticas válidas, com suas diferenças em relação à observação explicadas no [relatório de baseline](../audits/2026-10-27_ORDERS_TRANSITION_BASELINE.md). Não alegar reprodução exata das parcelas pessoais observadas.

Os bancos `finalization-browser-01` e `finalization-browser-02` foram alterados pelos testes e não são o estado inicial de aceite. Para repetir a simulação, criar outro nome ainda inexistente com `dev:seed:orders-workflow`; não apagar/reutilizar bancos anteriores nem recapturar a baseline legada. Para verificar o legado, usar o runner explícito e o comparador, sem promover um banco novo ao papel de baseline.

O [runbook de produção](ORDERS_TRANSITION_EXECUTION.md#runbook-de-produção--não-executado) continua condicionado aos gates humanos. Não executado nesta entrega.
