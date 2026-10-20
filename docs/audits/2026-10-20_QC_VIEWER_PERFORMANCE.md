# QC — cache privado e performance de exibição

Data: 20/10/2026. Implementação local do [plano 33](../33_QC_VIEWER_PERFORMANCE_PLAN.md). Sem publicação, migration nova, acesso a fotos reais ou configuração de serviços externos.

## Resultado funcional

- A lista consulta apresentações em lotes de até 20 destinos, incluindo itens originais e adicionais registrados elegíveis. Não consulta uma galeria por linha. A capa é resolvida independentemente da página e não se repete nas três miniaturas.
- URLs binárias levam versão opaca do preview persistido. Respostas bem-sucedidas usam `private, no-cache`, ETag por usuário/versão e revalidação obrigatória. Um 304 exige sessão, membership, destino elegível, estados ativos e rate limit; não busca bytes no R2. Erros, originais, fallback e outras APIs QC continuam `no-store`.
- Blobs são compartilhados por usuário/workspace/compra/imagem/versão: LRU, cinco minutos de TTL absoluto, 200 entradas, 16 MiB e quatro downloads ativos. Capas têm prioridade. Object URLs pertencem aos consumidores e são revogadas no cleanup.
- Metadados têm TTL de 30 segundos e limite de 200 destinos, incluindo pendências. Revalidação acompanha as linhas próximas e o retorno de foco. Desktop/mobile escondidos não iniciam carregamento. Linhas já descobertas conservam previews ao cruzar a margem de 300 px, evitando ciclos de desmontagem/cancelamento na borda da tela.
- Troca de capa invalida metadados e conserva bytes inalterados. Exclusão/importação/rematch invalidam também os bytes da compra; gerações antigas não podem repovoar o cache. Logout, sessão expirada, mudança de usuário/workspace e desmontagem do contexto autenticado limpam o escopo. Abrir o viewer não invalida toda a compra.
- O carregamento global de `/api/app` recebeu apenas o ID do workspace para particionar o cache. Não recebeu fotos, manifests, URLs ou assinaturas.

## Procedimento de medição

Chromium/Playwright, build Next.js de produção local, libSQL descartável, desktop de 1440 × 900. Fixture de 26 produtos: 25 originais e um adicional registrado, alguns sem QC, quatro fotos por produto com QC e 14 no primeiro original, cuja capa está na segunda página da galeria. O WebP sintético é uma cor sólida de 160 × 120 px e 112 bytes; não representa tamanho/compressão de fotos reais.

O servidor S3 local espera 50 ms por GET e conta objetos/bytes. Better Auth, APIs QC, consultas e autorização são os caminhos reais da aplicação. Nenhuma rota é interceptada pelo Playwright no benchmark: isso desabilitaria o cache HTTP do navegador e invalidaria o ensaio de reload.

Cinco rodadas independentes: limpar cache HTTP → abrir a tela → esperar a primeira capa e rede ociosa → recolher/reabrir cinco vezes → reload normal. Antes de cada rodada, o navegador passa por Favoritos para desmontar o contexto e limpar o cache em memória. `networkidle` inclui a janela de 500 ms do Playwright; não é um indicador de renderização de todas as linhas fora da tela. O tempo de cinco ciclos inclui os cliques e verificações.

O baseline foi executado com o código anterior de leitura/renderização e apenas a infraestrutura sintética adicionada. A opção `LOTI_QC_VIEWER_BASELINE=1` desativa as asserções de otimização; ela não transforma código novo em código antigo. No baseline, o teste limpa o contador de rate limit entre ciclos para medir repetições sem bloquear na quota de 180/minuto. Essa limpeza existe apenas no servidor de fixture, fora das rotas de aplicação. A implementação mantém a quota real.

## Medianas de cinco rodadas

| Métrica | Antes | Depois |
| --- | ---: | ---: |
| Primeira capa visível | 1.816 ms | 447 ms |
| Abertura até rede ociosa | 2.027 ms | 1.468 ms |
| Consultas de galeria na lista | 22 | 0 |
| Consultas de apresentação em lote | 0 | 1 |
| Previews / GETs S3 na abertura | 84 | 32 |
| Bytes S3 na abertura | 9.408 | 3.584 |
| Cinco recolhimentos/reaberturas | 4.771 ms | 909 ms |
| GETs S3 adicionais nesses cinco ciclos | 290 | 0 |
| Pedidos repetidos de preview nesses ciclos | presentes | 0 |
| Reload até rede ociosa | 1.996 ms | 1.067 ms |
| GETs S3 no reload | 84 | 0 |
| Bytes S3 no reload | 9.408 | 0 |

O resumo administrativo da compra continua fazendo uma leitura em ambos os casos. Os 32 previews iniciais cobrem as linhas visíveis/próximas; outras linhas carregam quando são alcançadas. Não apresentar essa redução como perda de imagens ou afirmar que 26 produtos são carregados integralmente em 447 ms.

A primeira rodada otimizada intermediária teve mediana de 710 ms para primeira capa e 2.121 ms até rede ociosa. A rodada final acima foi repetida após a revisão de visibilidade/cache e sem repetir a suíte geral em paralelo. Os números são observações locais sujeitas à carga do host, não garantia de latência em Vercel/Turso/R2. O resultado determinístico mais relevante é a eliminação de leituras repetidas e a redução do número de pedidos iniciais.

Dados brutos e capturas locais, sem dados pessoais: `artifacts/qa/qc-viewer-performance/baseline.json`, `optimized.json` e `{320,390,768,1024,1440}.png`. Diretório de artifacts continua ignorado pelo Git; esta tabela preserva as medianas no repositório.

## Validação

- Typecheck e lint passaram, sem warnings de código. Build de produção passou com segredo efêmero e banco em memória explicitamente selecionados; nenhum `.env` foi editado.
- Suíte QC: **102 testes passaram em 13 arquivos**, incluindo cache, metadados, headers/ETag, limite de quatro downloads, cancelamento compartilhado, expiração/LRU, isolamento, invalidação tardia, segurança do fixture, serviços e upgrade/reaplicação da migration existente.
- Benchmark e segurança via HTTP real: **2 cenários Chromium passaram**. Reload reutiliza bytes após revalidação, tombstone retorna 404 `no-store`, sessão expirada retorna 401 `no-store` e reload sem sessão volta ao login. Um 304 explícito não faz GET S3.
- Regressões em Chromium: **14 cenários passaram na rodada consolidada**, verificando importação manual, mais de 12 batches, falha/recuperação, matching pendente, capa manual e em página posterior, exclusão/restauração, abertura exata, teclado, swipe/foco, fallback e Histórico somente leitura, além de edição de adicional e reembolsos. Somados aos dois cenários HTTP/performance, são **16 cenários aprovados**. Os mocks foram atualizados para chaves discriminadas e apresentação em lote; seletores antigos de `.qc-cost-*`, marcador 40 px, payload antigo de matching e mensagem anterior foram alinhados ao código já existente, sem mudar o produto para satisfazê-los.
- QA inspecionada em 320/390/768/1024/1440 px: dimensões preservadas, capa com contador no mobile, miniaturas distintas no desktop, sem overflow horizontal. A mídia sintética verde é proposital; não há foto de usuário nas evidências.
- `git diff --check` passou. Nenhum schema, cálculo, pagamento, refund, snapshot finalizado ou dado remoto foi alterado.

### Pendência preexistente do gate geral

O primeiro `npm test` sofreu ENOENT nos arquivos temporários do Vitest no sandbox Windows. Com runner serializado e diretório temporário no workspace, o baseline executou 383 testes: **366 passaram, 10 falharam e 7 foram ignorados**, em três arquivos com concorrência multiprocesso financeira.

A execução geral após as mudanças executou 401 testes: **379 passaram, 15 falharam e 7 foram ignorados**. As falhas continuam nos mesmos arquivos, por `SQLITE_BUSY` e timeout em processos independentes:

- `tests/integration/hubbuy-account-deletion-concurrency.test.ts`;
- `tests/integration/package-refund-concurrency.test.ts`;
- `tests/integration/purchase-order-corrections.test.ts` (caso multiprocesso).

A variação no número de falhas acompanha a contenção do host; não foi removido teste, adicionado skip ou aumentado timeout. O teste novo de isolamento do fixture foi acrescentado depois dessa rodada geral e passou na rodada QC final. Não declarar o gate geral aprovado. Estes serviços financeiros não foram modificados por esta entrega.

## Comandos reproduzíveis

PowerShell; usar um sufixo novo para cada banco descartável:

```powershell
$env:TEMP = 'C:\Fontes\loti\artifacts\vitest-temp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
npx vitest run qc- --maxWorkers=1 --no-file-parallelism
npm run typecheck
npm run lint

$env:BETTER_AUTH_SECRET = 'qc-viewer-disposable-build-secret-2026-local-only'
$env:TURSO_DATABASE_URL = 'file::memory:'
npm run build
$env:LOTI_E2E_PRODUCTION = '1'
$env:LOTI_E2E_QC_VIEWER = '1'
$env:LOTI_E2E_DATABASE_URL = 'file:./data/e2e-refunds-qc-viewer-unique.sqlite'
npx playwright test tests/e2e/qc-viewer-performance.spec.ts
```

Para as regressões, executar em outro processo PowerShell, sem `LOTI_E2E_QC_VIEWER`, com outro banco novo e `LOTI_E2E_PRODUCTION=1`: `npx playwright test tests/e2e/hubbuy-qc.spec.ts tests/e2e/additional-product-edit.spec.ts tests/e2e/package-refunds.spec.ts`.

O endpoint S3 de teste só é aceito com opt-in, banco descartável de nome validado, origem `http://localhost:3100`, endpoint exato `http://localhost:3102`, bucket `qc-fixture` e ausência de Vercel. Não aceita destino remoto ou caminho que escape da pasta de testes. Só o script E2E monta a fixture; a aplicação não expõe endpoints de reset.

## Limites e operação

O primeiro acesso frio continua dependendo do banco e do R2. Revalidações ainda consultam autorização/estados e contam na quota. O navegador pode descartar seu cache; hard reload/cache desabilitado pode baixar bytes novamente. O cache em memória é por aba e seu orçamento não representa toda a memória de imagens já montadas. Metadados de outro membro convergem na revalidação das linhas próximas/retorno de foco, sem realtime ou revogação de bytes já recebidos.

Não é necessária migration para esta mudança. Nenhuma publicação, criação de bucket, alteração de secrets, importação real ou teste remoto foi executado. Alterações de outros contextos foram preservadas fora dos commits desta entrega.
