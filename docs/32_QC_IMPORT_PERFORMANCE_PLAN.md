# Otimização da importação QC — plano de execução

Data: 20/10/2026. Destinatário: agente executor com effort reduzido.

## 1. Missão e contrato de execução

Implementar localmente a otimização da importação QC HubBuy até a definição de pronto da seção 15. Executar as fases em ordem, verificar cada gate, corrigir falhas e continuar automaticamente para a fase seguinte. Não encerrar uma entrega após diagnóstico, primeira melhoria, testes parciais ou proposta de continuação. Não pedir aprovação entre fases.

Este arquivo é o plano solicitado pelo usuário, não evidência de implementação. Quem o redige não executou código, migrations ou benchmarks externos. Na entrega deste plano, `next-env.d.ts` já estava modificado; preservar a alteração e conferir novamente o checkout antes de trabalhar.

A execução futura deve implementar o escopo local deste plano. Publicação, configuração de secrets/Cloudflare, criação de buckets, migrations em bancos compartilhados, importação de dados reais e benchmarks contra HubBuy/R2/Turso remotos continuam fora dessa autorização. Credenciais externas não são necessárias para concluir os gates locais: usar serviços simulados e bancos descartáveis. Não tratar a ausência de credenciais como bloqueio da implementação local.

Parar somente depois de concluir todos os gates obrigatórios, ou diante de bloqueio humano real que impeça trabalho obrigatório e não tenha alternativa local. Nesse caso, terminar primeiro o trabalho independente e informar precisamente o bloqueio. Não contornar restrições de acesso. Não prometer execução remota ou continuidade depois de fechar o navegador.

Não usar subagentes, criar novos serviços, instalar dependências ou fazer refatoração financeira. Não executar este documento como autorização para reconstruir o MVP inteiro pelo `PROMPT_ONE_SHOT.md`.

## 2. Preparação obrigatória

1. Ler `AGENTS.md` e `PROMPT_ONE_SHOT.md`; ler os documentos canônicos 00–17 na ordem de `AGENTS.md` antes de escrever código.
2. Ler integralmente o plano 24, incluindo handoffs de recuperação, exclusão, capa, preview e progresso. Ler planos 23, 26 e 29 nos pontos de invariantes financeiros e elegibilidade dos pedidos adicionais; não implementar novas funcionalidades desses planos.
3. Inspecionar o código real e os testes citados abaixo. Números de linha são pistas da investigação; nomes de funções são a referência para localizar o código após mudanças.
4. Executar `git status --short` e registrar diferenças preexistentes sem imprimir segredos. Não limpar/resetar alterações alheias. Não ler ou exibir valores de `.env` para diagnosticar performance.
5. Usar Node compatível com `package.json` e dependências já instaladas. Se precisar localizar runtime, usar ferramentas disponíveis; não atualizar versões.
6. Registrar baseline dos checks e distinguir falhas preexistentes das introduzidas. Não adicionar skips, aumentar timeouts indiscriminadamente ou apagar asserções para passar.

## 3. Diagnóstico que fundamenta o plano

Confirmado no checkout em 20/10/2026, sem medição remota:

| Local | Comportamento atual |
| --- | --- |
| `src/components/qc/qc-components.tsx`: `prepare`, `confirmLinks` | JSON colado, parsing no browser, prepare servidor e confirmação manual antes de transferir |
| Mesmo arquivo: `drainImport`, `drainOccurrence` | Até 12 POSTs sequenciais; no manifesto, GET de progresso após cada POST; interrupção por falha/pendência |
| `src/app/api/purchases/[purchaseId]/qc/route.ts` | Prepare, resolve, batch por ocorrência e reconcile; sessão, origem e corpo limitado |
| `src/app/api/qc/imports/[importId]/route.ts` | GET do progresso e POST confirm/batch; revisão do manifesto |
| `src/lib/domain/qc-services.ts`: `runBatch` | Seleção `.limit(1)`, uma fonte/exclusão/preview por chamada; lease de workspace; DB sequencial |
| Mesmo arquivo: `processSource` | Download, validação, deduplicação por conteúdo, HEAD/PUT original, publicação no banco, reparo de capa e tentativa de preview |
| Mesmo arquivo: `processPreview` | GET do original R2 mesmo após upload novo, hash, geração WebP, PUT e HEAD preview |
| Mesmo arquivo: `prepare`, `confirmImport`, `getImport` | Leituras individuais de tombstones/previews, fontes e destinos; loops N+1 |
| `src/lib/qc/download.ts` | Allowlist exata, DNS público fixado no socket, TLS/SNI, redirects bloqueados, `agent: false`, buffer limitado |
| `src/lib/qc/image-validation.ts` | Magic bytes, animação, metadata e decodificação raw integral; originais preservados |
| `src/lib/qc/preview.ts` | Preview WebP versão atual, 160 px, sem ampliação, orientação EXIF, máximo 128 KiB |
| `src/lib/qc/storage.ts` | Clientes S3 reutilizados, leitura/escrita privadas, `maxAttempts: 1`, operações individuais |
| `src/lib/domain/qc-limits.ts` | 200 fotos/manifesto, 8 MiB/foto, 200 MiB acumulados, batch declarado 5 mas não usado na seleção, 12 batches/minuto |
| Rotas QC | Node.js, `maxDuration = 120`; orçamento aplicativo de 90 s e margem de 5 s |

Uma foto nova com preview novo normalmente faz: GET HubBuy; HEAD original, PUT original, GET original, PUT preview e HEAD preview no R2. Não existe endpoint de upload multiobjeto nesse caminho. Multipart não é upload de várias fotos e não deve ser introduzido.

Reimportar a mesma URL já pronta **já evita download e PUT**. Outra URL com os mesmos bytes exige download para descobrir o hash. Deduplicação por conteúdo é por ocorrência, não global. Não inventar deduplicação entre workspaces/ocorrências.

A foto referencia ocorrência → item da compra ou item adicional elegível. Não há propriedade direta por pacote. Preservar essa estrutura.

## 4. Escopo fechado e decisões para o executor

Implementar obrigatoriamente:

1. Métricas locais/testáveis por etapa e benchmark sintético reproduzível.
2. Reuso do original validado em memória na geração de preview, com fallback R2 para recuperação.
3. Consultas agrupadas na preparação, confirmação e progresso, sem perder revalidação transacional.
4. Até 5 fontes por batch e pipeline limitado, com uploads individuais sobrepostos entre destinos independentes.
5. No máximo 3 pipelines de foto ativos por request; no máximo 1 operação pesada de imagem ativa por request.
6. Exclusão mútua de acesso ao cliente DB durante seções concorrentes e transações completas, sem segurar DB durante I/O remoto.
7. Processamento em ordem por destino Loti, para proteger deduplicação e capa.
8. Progresso incluído na resposta do batch do manifesto; GET mantido para retomada/reconciliação.
9. Continuação automática entre batches enquanto a superfície de importação estiver montada, sem parada artificial após 12 chamadas.
10. Rate limit estruturado, espera automática limitada, retries seguros e controle de ciclos sem progresso.

Decisões fixadas para evitar improvisação:

- `QC_LIMITS.batch` continua 5; usar a constante na seleção.
- Concorrência padrão de pipelines: 3; validação e geração de preview compartilham um semáforo pesado de capacidade 1.
- Configuração servidora opcional `LOTI_QC_PIPELINE_CONCURRENCY`: inteiro entre 1 e 3, padrão 3. Valor inválido falha com erro sanitizado de configuração; nunca aceitar valor do browser. Não alterar configuração do ambiente hospedado.
- Injeção de teste/benchmark pode aceitar 1, 2, 3, 5 e 10, com teto 10 e serviços simulados. Não habilitar 5/10 em produção por causa de benchmark local.
- Não implementar ajuste adaptativo de concorrência em runtime nesta entrega.
- Manter DNS fixado e `agent: false`. Pooling HubBuy fica fora de escopo: não comprometer proteção SSRF.
- Manter decodificação integral, algoritmos de hash, formato dos originais e parâmetros/versionamento do preview. Compartilhar o buffer, não remover validação nem fundir decoders nesta entrega.
- Manter HEADs e protocolo de PUT incerto. Só remover o GET redundante do original no caminho com buffer validado disponível.
- Não criar schema/migration para scheduler, retries, telemetria ou checkpoint. Usar estados existentes e contexto efêmero por execução. Se descobrir necessidade inevitável de migration, documentar por que o contrato não pode ser cumprido com schema atual antes de ampliar o escopo.
- Não mudar galeria, lightbox, capa manual, layout operacional, cálculos ou snapshots. Texto do callout que diz “em sequência” deve ser corrigido para descrever lotes sem expor parâmetros técnicos ao usuário.

## 5. Arquitetura alvo e invariantes

```text
Browser: preparar → confirmar vínculos
  → POST batch (sempre só um POST ativo por superfície)
Servidor: autorizar → rate limit → adquirir lease → selecionar até 5 fontes
  → scheduler: até 3 fotos, destinos diferentes, DB coordenado, decoder 1
  → download → validar → deduplicar → HEAD/PUT original → salvar original
  → preview a partir dos bytes em memória → PUT/HEAD preview → salvar preview
  → aguardar TODOS os trabalhos iniciados → revisar/contar/auditar
  → incrementar revisão uma vez → retornar resultados + snapshot persistido
  → liberar lease apenas depois de terminar todos os trabalhos iniciados
Browser: atualizar progresso da resposta → próximo lote automaticamente
  → ou aguardar rate limit → ou encerrar/pausar com motivo recuperável
```

### 5.1 Três controles distintos

**Slots de pipeline:** limitar fotos admitidas, incluindo as esperando decoder ou DB. Cada slot segura no máximo um original limitado e um preview limitado. Não baixar o manifesto inteiro antes de enviar. Não manter lista ilimitada de buffers.

Os limites são por request, não uma garantia global de memória da instância Vercel. A lease limita importação por workspace, mas workspaces diferentes e leituras podem compartilhar processo. Registrar essa limitação, medir RSS e manter o teto conservador; não anunciar que três pipelines garantem memória máxima conhecida.

**Semáforo de imagem:** envolver `validate()` e `makePreview()` com o mesmo semáforo. Liberar em `finally`. Rechecar deadline depois de adquirir a vaga; espera em fila consome tempo do request. Não mudar `sharp.concurrency()` global.

**Fila DB local:** por chamada de `qcServices`, compartilhada pelos pipelines desse batch. Executar cada comando e a transação completa sob a mesma exclusão mútua. Não fazer `Promise.all` de transações no cliente libSQL. Não envolver função inteira `processSource`/`processPreview` no lock de DB, pois isso serializaria os downloads e uploads.

Criar helper pequeno e explícito, por exemplo `src/lib/qc/concurrency.ts`, com semáforo e fila serial. No serviço, usar `withQcDb(() => db.transaction(...))` ou `withQcDb(() => query...)`. Toda operação DB alcançável pelos pipelines precisa respeitar essa fila, inclusive reservas, falhas, reparo de apresentação, restauração e compensações. Dentro de callback transacional já protegido, usar `tx` diretamente e não adquirir novamente a fila: evitar deadlock por lock não reentrante. Não usar Proxy genérico do ORM, conexão extra por foto ou lock global de processo como coordenação distribuída.

A fila local não substitui `qcTransferLocks`, claims, revisão ou constraints. A lease persistida continua coordenando instâncias diferentes.

### 5.2 Ordem por destino e identidades

- Chave de faixa: `purchase:<id>` ou `additional:<id>`, resolvida no servidor.
- Só um pipeline do mesmo destino pode executar por vez, incluindo todas as ocorrências vinculadas a ele.
- Dentro da faixa, executar fontes na ordem da seleção atual: atualização, criação e ordinal; preservar desempate existente ou documentar desempate estável.
- O scheduler pode preencher vagas com outros destinos selecionados, sem reordenar fontes dentro de uma faixa.
- Resultados na resposta devem manter a ordem de seleção, mesmo se terminarem em outra ordem.
- A primeira foto pronta continua inicializando a capa como no fluxo anterior. Foto mais rápida do mesmo produto não pode passar à frente. Capa manual nunca é substituída.
- Deduplicação entre aliases da mesma ocorrência passa pela mesma faixa e permanece protegida por índice único e reconsulta.
- Um lote com um único destino pode executar serialmente; isso é deliberado. Ainda ganha com menos HTTP/DB e reuso dos bytes. Não afirmar ganho de paralelismo nesse cenário.

### 5.3 Segurança, quotas e falhas parciais

Preservar sessão Better Auth, ID persistido do manager, membership, compra finalizada, origem confiável e validação de destino. Cache de leitura local nunca autoriza sozinho uma gravação.

Preservar reservas e liquidações transacionais. A quota existente cobra download e upload do original; não reinterpretar como somente tamanho dos arquivos armazenados. Ao usar concorrência, impedir duas reservas de observar e gastar o mesmo saldo. Reservar máximo antes do download, liquidar consumo real quando conhecido e manter cobrança conservadora de execução incerta. Não zerar gastos ao retomar.

Nenhum upload pode ocorrer antes da validação completa. Nenhum resultado `ready` antes da confirmação exigida pelo protocolo atual. Manter `QC_PUT_IN_FLIGHT`, `QC_PUT_CONFIRMED`, seus equivalentes de preview, tombstones, geração/chave capturada e compensação de escrita tardia.

Uma falha não desfaz fotos concluídas. Todos os trabalhos admitidos precisam terminar ou ser abortados e liquidados antes de retornar e liberar lease. `Promise.race` que abandona PUT/decoder vivo não é cancelamento. Usar `allSettled`/drenagem e tratamento por foto; nunca liberar lease quando outro pipeline ainda pode escrever.

## 6. Fase 0 — baseline e mapa de preservação

**Arquivos:** somente leitura do código/testes; registro no relatório final de implementação.

1. Concluir seção 2.
2. Localizar todas as chamadas DB alcançadas por `processSource`, `processPreview`, `reserveBytes`, `accountReservation`, `markSourceFailure`, compensações, restauração e apresentação. Listar quais precisam da fila.
3. Ler os testes completos `tests/integration/qc-services.test.ts`, `tests/unit/qc-download.test.ts`, `tests/unit/qc-image-validation.test.ts` e `tests/e2e/hubbuy-qc.spec.ts`.
4. Rodar typecheck, lint e testes QC direcionados com isolamento conforme seção 14; não executar migrator no banco configurado por `.env`.
5. Registrar fatos da baseline: batch de uma fonte, cap de 12 chamadas, contagens R2 normal/reimportação e parâmetros existentes de preview.

**Gate:** mapa real confirmado, alterações alheias identificadas e baseline registrada. Continuar, sem pedir aprovação.

## 7. Fase 1 — observabilidade e benchmark baseline

**Arquivos previstos:** `src/lib/qc/metrics.ts` (novo), hooks limitados em `qc-services.ts`, `scripts/benchmark-qc-import.ts` (novo), testes específicos; script npm `benchmark:qc`.

1. Implementar coletor injetável por execução. Usar relógio monotônico para durações; conservar relógio injetado existente para deadlines/leases.
2. Contar fotos selecionadas/importadas/existentes/falhas/pendentes, chamadas DB, DNS/download, HEAD/GET/PUT/DELETE, bytes efetivamente observados, tentativas/retries e interrupções por deadline/quota.
3. Medir parsing, matching/associação, DB, download, validação, preview, R2 e total. Distinguir soma das durações sobrepostas de tempo de parede; não somar spans concorrentes e chamar isso de duração total.
4. Medir RSS/external/arrayBuffers no processo do benchmark; chamar o resultado de pico amostrado, não máximo exato. Não usar só `heapUsed`, pois buffers e sharp usam memória nativa.
5. Não adicionar queries por foto só para telemetria. Não enviar métricas ou segredos a serviço externo. Produção usa coletor no-op por padrão; benchmark injeta coletor.
6. Benchmark: fixtures sintéticas, banco `file:` descartável explicitamente escolhido, storage/DNS/download simulados, bytes gerados localmente. Bloquear URL remota de DB; não carregar `.env` no script. Para medir tempo de parede, usar atrasos sintéticos controlados; apresentar resultado como simulação.
7. Rodar 10, 50 e 100 imagens, fotos distintas para não deduplicar acidentalmente; reimportar o mesmo manifesto. Testar 300 em um manifesto como rejeição antes de I/O; testar carga total de 300 em manifests 200+100 com orçamento compatível. Usar também casos com um destino e múltiplos destinos.
8. Salvar baseline em `artifacts/benchmarks/qc-import/` com metadados de runtime, parâmetros, quantidade, resolução e tamanho; nenhum dado privado. Repetir pelo menos 5 vezes por cenário de tempo, reportando mediana/faixa e total de chamadas. Não comparar números de hosts distintos como ganho comprovado.
9. Separar benchmark de processamento do teste de controle de fluxo: no primeiro, avançar relógio de domínio entre janelas para não esperar minutos por quotas sintéticas, registrando esse fato e sem chamar o tempo resultante de tempo fim a fim real. No segundo, usar timers falsos e exercer os 429/esperas/revisões pelo protocolo real. Não desabilitar limites no código de produção para viabilizar benchmark; não esconder espera do usuário em uma projeção de throughput.

**Gate:** benchmark existente executável e baseline reproduzível. Métricas não mudam decisões de negócio e não contêm URLs/credenciais.

## 8. Fase 2 — remover GET redundante do original

**Arquivos:** `qc-services.ts`, testes de serviços e preview.

1. Estender internamente `processPreview` com argumento opcional de original validado `{ imageId, bytes, sha256 }` ou tipo equivalente estrito.
2. Passar bytes do `ValidatedQcImage` somente quando a imagem pronta corresponde ao mesmo ID e hash. Revalidar estado/claim/tombstone normalmente.
3. Se houver buffer confiável correspondente, gerar preview desse buffer. Caso contrário, conservar GET R2 + verificação do hash antes de gerar.
4. Não usar URL do cliente nem buffer não validado; não antecipar geração em leituras GET.
5. Preservar prioridade da recuperação de preview já pronto/PUT incerto antes de gerar novamente. Reuso não deve repetir PUT de preview existente.
6. Liberar referências ao original ao terminar a foto; não colocar buffers em cache global ou resposta JSON.

**Testes obrigatórios:** nova foto sem GET do original; preview equivalente em dimensões/formato/hash na mesma versão; retry sem buffer usa R2; hash errado não é aceito; tombstone durante geração; preview falho não invalida original; preview já pronto não gera PUT novo.

**Gate:** todos os testes QC passam e benchmark registra uma leitura de original a menos por foto nova no caminho normal. Não remover HEADs.

## 9. Fase 3 — eliminar leituras N+1 e otimizar reimportação

**Arquivos:** `qc-services.ts`, testes de serviços.

1. `prepare`: consultar tombstones e previews de ocorrências relevantes em grupos, montar mapas. Substituir `Promise.all` de leituras por ocorrência por consultas limitadas. Manter os mesmos conflitos de IDs, restore snapshots e decisões de matching.
2. `confirmImport`: pré-carregar fontes e imagens relevantes dentro da transação, montar mapa por `(externalItemId, sourceUrlHash)`. Atualizar mapas após cada insert/update para tratar URLs repetidas no JSON. Revalidar destinos em grupos dentro da transação, respeitando estado recorded e correções dos pedidos adicionais.
3. Inserir fontes novas em grupos quando não dependerem de resultado individual anterior. Usar chunks conservadores (por exemplo, 20 linhas por insert) e respeitar número de parâmetros por linha; não assumir limite SQLite/Turso ilimitado.
4. Não trocar gravações de estado por upsert genérico que restaure tombstone, sobrescreva claim, vínculo ou orçamento. Fluxos de restauração/PUT incerto permanecem explícitos.
5. `getImport`: resolver conjunto de destinos válidos em poucas leituras; mapas para ocorrência e fonte em vez de `.find` repetido por foto. Preservar ordem original e DTO sanitizado.
6. Reutilizar helper de snapshot autorizado no batch, sem executar novamente autenticação/queries de rate por foto. Manter a mesma autorização em GET independente.
7. Não adicionar índices nesta fase. Caso consultas continuem ruins, registrar `EXPLAIN QUERY PLAN` no banco descartável e proposta específica para revisão futura. A entrega deste plano não depende de migration nova.

**Testes obrigatórios:** comparação de DTOs antes/depois; mesma URL repetida; ocorrência com ID alternativo/conflito; orderNo ausente; 200 fotos; destinos adicionais inválidos; rematch explícito; exclusão/restauração; reimportação completa com zero downloads e zero PUTs. Contagem de consultas das leituras agrupadas não cresce uma vez por foto; não exigir que todas as escritas de estado sejam O(1).

**Gate:** reimportação conserva dados e reduz consultas demonstravelmente. Gates de integridade passam.

## 10. Fase 4 — primitivas de concorrência e orçamento

**Arquivos:** `src/lib/qc/concurrency.ts` (novo), `qc-services.ts`, `qc-limits.ts`, testes unitários/integrados.

1. Implementar semáforo FIFO com capacidade validada e fila serial DB; liberar sempre em `finally`, inclusive quando callbacks falharem.
2. Preparar contexto por batch: lease, deadline, abort controller do request, slots, semáforo pesado, fila DB, métricas e conjunto de fontes admitidas.
3. Envolver operações DB mapeadas na fase 0. Não aninhar locks DB; não segurar DB esperando slot, DNS, HTTP, storage ou sharp.
4. Manter `requireRequestBudget` antes de operações, também depois de espera em semáforo/DB. Não iniciar nova fonte se seu primeiro estágio não couber; resultado deve informar fonte não iniciada e manter estado retomável sem cobrar download que não começou.
5. Propagar sinal/deadline opcional pelo transporte e storage sem quebrar mocks atuais: operação respeita menor prazo entre timeout individual e restante do batch. Manter timer ativo até consumir o corpo de GET, não apenas receber headers.
6. Sharp conserva seus timeouts reais. Não fingir abortar sharp com Promise.race; aguardar trabalho iniciado e não publicar bytes inválidos. Orçamento de admissão e margem precisam considerar decoder/compensação. Não remover margem para “caber mais fotos”.
7. No encerramento, parar admissões, abortar I/O que deve ser interrompido, preservar evidência de PUT iniciado e drenar todas as tarefas antes de liberar lease. Não iniciar compensação se não couber; persistir pendência conforme protocolo existente.

**Testes obrigatórios:** capacidades respeitadas, erro libera vaga, nenhuma transação sobreposta no cliente, fila sem deadlock, expiração enquanto aguarda vaga, soma de reservas nunca excede quota e nenhuma tarefa escreve após resposta/liberação da lease.

**Gate:** ainda com concorrência 1, funcionalidade e todos os testes existentes passam. Só então habilitar scheduler concorrente.

## 11. Fase 5 — batches reais e scheduler por destino

**Arquivos:** `qc-services.ts`, `concurrency.ts`, testes de serviços/concor­rência.

1. No caminho de fontes, selecionar até `QC_LIMITS.batch` com escopo existente de manifesto/ocorrência/compra. Não transferir fonte ignorada, tombstoned ou sem destino elegível.
2. Montar faixas por destino validado e despachar até 3 pipelines, um por faixa. Ao liberar vaga, admitir próxima fonte selecionada elegível. Revalidar destino antes de gravações críticas; não confiar só no preload.
3. Manter operações originais e de preview como PUTs individuais. Pipelines de destinos distintos podem sobrepor downloads/uploads, sempre respeitando semáforo pesado e fila DB.
4. Não executar novamente fonte falha no mesmo batch. Usar conjunto de IDs admitidos. Contabilizar resultados reais e fontes não iniciadas por orçamento separadamente.
5. Manter exclusões e reparos isolados em chamadas de reconciliação, sem paralelizá-los com importação neste primeiro escopo. Preservar escolha justa por data: se exclusão/preview mais antigo ganha, processar uma unidade como hoje; se fonte ganha, processar lote de fontes. Filtrar tombstone de trabalho físico por `deleteState = pending`, para não repetir uma exclusão já concluída nem bloquear fontes.
6. Recalcular contagens e remaining após drenar trabalhos. Incrementar revisão do manifesto uma única vez por batch, nunca por worker. Snapshot precisa refletir revisão já persistida e resultados completos.
7. Preservar `complete` do fluxo de importação quanto a originais vinculados; preview é falha isolada como hoje. Expor separadamente pendências de preview quando necessário, sem transformar original pronto em falho. Reconciliação geral continua contando seus reparos/exclusões.
8. Auditar um resumo do batch sem URLs/keys/buffers. Manter eventos transacionais correspondentes a mutações administrativas.

**Testes obrigatórios:** cinco fontes em uma chamada quando rápidas; concorrência observada >1 em destinos diferentes; teto 3; decoder teto 1; mesmo destino em ordem; aliases de conteúdo não duplicam; capa inicial idêntica à serial; capa manual intacta; um erro preserva outros sucessos; quota insuficiente não dá overspend; deadlines deixam trabalho recuperável; duas conexões continuam disputando uma lease; exclusão/PUT tardio passa testes existentes.

**Gate:** concorrência efetiva comprovada por testes com barreiras/eventos, não só por inspeção de Promise.all. Nunca usar sleeps longos para demonstrar ordem.

## 12. Fase 6 — protocolo de progresso e falhas estruturadas

**Arquivos:** rotas QC, `qc-http.ts`, helper de erros QC, `qc-components.tsx` e tipos compartilhados QC apropriados.

Contrato aditivo do batch do manifesto (nomes podem seguir convenções locais; sem campos privados):

```ts
type BatchReply = {
  revision: number;
  processed: number;
  imported: number;
  existing: number;
  failed: number;
  pending: number;
  remaining: number;
  complete: boolean;
  hasMore: boolean;
  results: Array<{ sourceId?: string; imageId?: string; status: string; code?: string }>;
  snapshot: QcTransferSnapshot; // estado persistido; mesma forma do GET
  stopReason?: "deadline" | "quota" | "recovery" | "failure";
};
```

1. Resposta não contém sourceUrl completa, R2 key, bucket, hash, tokens ou URL assinada. Conservar estados já mostrados no drawer.
2. `snapshot` é produzido após revisão e resultados persistidos, antes de liberar lease, sem download ou geração de preview durante leitura.
3. Erros de rate limit retornam HTTP 429, `code`, `retryAfterSeconds` positivo e header `Retry-After`. Estender erro QC localmente; não mudar indiscriminadamente o contrato financeiro de `DomainError`.
4. `qcRequest` precisa preservar status, código e retryAfter em erro tipado; não reduzir tudo a string. Não extrair prazo por regex da mensagem traduzida.
5. Download conserva status externo sanitizado para distinguir 429/408/5xx de validação permanente. Não enviar body/header bruto do provedor ao browser/log.
6. GET do manifesto permanece disponível para recuperar revisão após resposta perdida. Um 409 de revisão obriga refetch antes de próximo POST, não repetição com revisão antiga.

**Gate:** testes de rota/contrato validam autorização, no-store, corpo limitado, 429, campos sanitizados e GET de recuperação. E2E mocks são atualizados para o contrato real, sem esconder regressões do servidor.

## 13. Fase 7 — continuação automática, retry seguro e UX preservada

### 13.1 Retry no servidor

**Arquivos:** helper `src/lib/qc/retry.ts` (se necessário), download/storage/services.

- No máximo 2 tentativas totais por GET transitório (original + 1 retry), somente quando ambos timeout e backoff cabem no deadline. Backoff de base 500 ms com jitter limitado; injetar sleep/random nos testes.
- 429 respeita Retry-After se válido e limitado pelo deadline; se não couber, retornar resultado retomável e prazo sanitizado, sem iniciar tentativa.
- Erro permanente de host, IP, redirect, imagem inválida, limite, vínculo ou autorização não recebe retry.
- Cada nova tentativa de download usa novamente validação de DNS/IP e reserva/liquidação correta. Downloads parciais sem contagem precisa continuam cobrados conservadoramente.
- PUT com resultado incerto nunca recebe retry cego nem `maxAttempts` SDK maior que 1. Usar HEAD e máquina de recuperação existente. Na dúvida, manter pendência explícita.
- Não multiplicar retry em helper, storage e scheduler. Definir um único dono por operação e contar tentativas.

### 13.2 Continuação no browser

**Arquivos:** `qc-components.tsx`, controlador/hook QC pequeno se ajudar, `qc-import-progress.tsx`.

1. Substituir `for (call < 12)` de `drainImport` e `drainOccurrence` por loop condicionado a estado, não número de chamadas. Reconcile pode manter ação explícita, mas deve usar o backend otimizado.
2. Um único POST em voo por execução. Usar `runId`/ref e cleanup para impedir loop duplicado por render, duplo clique, remount ou troca de importId.
3. Usar snapshot do batch para atualizar progresso; GET inicial/retomada/erro de resposta continua permitido. Não fazer GET obrigatório depois de todo POST bem-sucedido.
4. Em sucesso com remaining e sem impedimento, iniciar próximo batch automaticamente. Não exigir clique por ter passado de 12 chamadas ou por rate limit temporário.
5. Rate limit 12/min permanece. Em HTTP 429, aguardar `retryAfterSeconds` com pequeno jitter e continuar; espera é cancelável e não trava UI. Para evitar espera infinita sob disputa, parar com motivo claro após 3 respostas 429 consecutivas sem progresso; sucesso real reinicia contador.
6. Em erro de transporte ou 502/503/504 do endpoint, fazer no máximo 2 tentativas de recuperação do ciclo (1 s e 2 s + jitter). Antes de qualquer novo POST, buscar snapshot/revisão. Não repetir POST cegamente: o anterior pode ter persistido ou ainda estar executando. Se lease ativa, respeitar tratamento abaixo.
7. `QC_TRANSFER_ACTIVE`: aguardar uma vez o prazo estruturado da lease, com máximo de `lockMs`, refazer GET; se continuar ativa, mostrar pendência e encerrar loop local. Nenhuma competição em polling apertado. Manter o bloqueio entre instâncias.
8. 401/403, expirado, quota, conteúdo inválido, associação necessária, PUT incerto ou falha individual não resolvida: pausar com motivo existente/sanitizado, sem sucesso falso. Outros trabalhos já admitidos pelo batch terminam e seus resultados aparecem.
9. Se batch não processar nada nem reduzir remaining: deadline conhecido permite 1 novo batch; reincidência pausa. Demais motivos pausam imediatamente. Nunca usar while infinito em fonte irrecuperável.
10. Fechar/unmount/trocar usuário invalida runId, cancela timers/fetch local e impede novos batches ou setState antigo. Cancelar fetch não garante cancelamento do servidor: próxima abertura busca estado persistido. Preservar gate atual de fechamento durante operação se ele for necessário; não criar promessa de background.
11. Não persistir buffer, URL privada ou sessão em localStorage. Retomada utiliza endpoints e identificadores autorizados existentes.
12. Não fingir saber quais três fotos estão ativas sem sinal do servidor. No início do batch mostrar estado de lote geral; não marcar apenas a primeira como única em processamento. Manter estrutura visual; se necessário remover destaque individual impreciso e preservar status persistido.
13. Atualizar callout para “As fotos são transferidas em pequenos grupos. Os vínculos são confirmados antes de iniciar a transferência.” Não alterar galeria/lightbox ou criar painel técnico.
14. Barra continua baseada em estados persistidos. Falhas podem contar como processadas, nunca como importadas com sucesso. Ignoradas/excluídas/sem vínculo ficam fora do denominador conforme contrato atual.

**Testes obrigatórios:** mais de 12 batches termina sem clique; 92 novas fotos em lotes sintéticos; 429 aguarda e segue; 429 repetido não gira infinitamente; resposta perdida com revisão avançada recupera sem duplicar; lease ativa não permite POST concorrente; erro permanente pausa; mesmo snapshot repetido pausa; cleanup cancela timer; four selected + 88 ignored termina em 4/4; teclado/foco/concluir preservados.

**Gate:** usuário só precisa retomar após problema real, fechamento ou pausa explicada. Quantidade de chamadas por si só não interrompe.

## 14. Fase 8 — regressão, benchmark final e comandos seguros

### 14.1 Isolamento obrigatório

- `tests/integration/helpers.ts` usa migração em banco de fixture; executar apenas em memória ou arquivo descartável explicitamente criado. Isso não autoriza migrar banco local de uso diário, dev compartilhado ou produção.
- Executar Vitest em processo com `TURSO_DATABASE_URL=file::memory:` e token remoto ausente. Não executar `npm run db:migrate`, `db:seed` ou `db:verify` com ambiente herdado de `.env`.
- E2E usa `scripts/e2e-server.ts`, que importa dotenv e depois define banco/credenciais de teste. Revisar esse script antes de executar: escolher `LOTI_E2E_DATABASE_URL=file:./data/e2e-refunds-qc-performance-<id-novo>.sqlite` conforme allowlist existente; arquivo precisa não existir. Definir `TURSO_AUTH_TOKEN` vazio no processo filho. Não reutilizar servidor real na porta 3100.
- O servidor E2E limpa R2 e usa provider de email local sintético. Manter isso. Tests QC que mockam HTTP no browser não provam pipeline real: isso é responsabilidade dos testes de serviço e benchmark.
- Usar diretório de build isolado `.next-qc-performance` via `LOTI_NEXT_DIR`; E2E de produção deve usar `LOTI_E2E_NEXT_DIR` correspondente e `LOTI_E2E_PRODUCTION=1` somente após build bem-sucedido.
- Se criar processo filho PowerShell, passar ambiente explicitamente ou restaurar variáveis em finally. Não imprimir tokens. No Windows, antes de remover diretório de artefatos temporários verificar caminho absoluto dentro do workspace e usar Remove-Item -LiteralPath; não apagar dados genéricos.

### 14.2 Checks

Executar checks direcionados após cada fase de código e corrigir falhas antes de prosseguir. Exemplos com dependências já instaladas:

```text
npm run typecheck
npm run lint
npm exec -- vitest run tests/unit/qc-validation.test.ts tests/unit/qc-matching.test.ts tests/unit/qc-download.test.ts tests/unit/qc-image-validation.test.ts tests/integration/qc-services.test.ts
npm exec -- vitest run <novos testes de concorrência, retry e métricas>
npm run benchmark:qc
```

Após fases 1–7, executar uma vez o conjunto final: unitários, integração completa, E2E QC e suíte E2E completa, build de produção isolado e typecheck/lint finais. No host Windows, se necessário serializar arquivos Vitest com `--no-file-parallelism`; manter testes internos de concorrência reais/barreiras. Se erro novo aparecer, corrigir e repetir o conjunto afetado. Falhas preexistentes exigem evidência e diagnóstico; não chamar suíte integral de aprovada se não passou.

### 14.3 Benchmark final e critérios

Comparar a mesma fixture/host/parâmetros da fase 1. Rodar concorrência 1, 2 e 3; 5 e 10 apenas como experimento local limitado, sem alterar padrão hospedado. Para casos de memória, gerar imagens compactadas e resoluções altas, não só pixels 2×2.

Critérios determinísticos obrigatórios:

- Reimportação pronta: zero download HubBuy e zero PUT original/preview.
- Nova foto normal: zero GET R2 do original para preview; GET da miniatura pelo viewer não entra nessa métrica.
- Fontes rápidas sem falha: até cinco processadas por batch; N fontes requerem `ceil(N/5)` batches se não houver corte por prazo/quota/reconciliação.
- Nenhum GET de progresso obrigatório entre batches bem-sucedidos com snapshot.
- Concorrência real entre destinos, respeitando limites; nenhuma paralelização da capa de um mesmo destino.
- Mais de 12 chamadas progride automaticamente sob relógio/rate limit simulados.
- 300 entradas no mesmo JSON continuam rejeitadas; não aumentar quota para passar benchmark.
- Quota, SSRF, tombstones, claims, autorização, snapshots e visualizador preservados.

Resultados temporais são evidência local/sintética. Reportar regressões, explicar quando CPU/DB/faixa única limita ganho e corrigir overhead introduzido. Não definir “3×” ou percentual como gate inventado. Não encerrar só com promessa de que benchmark futuro vai comprovar o que poderia ser medido localmente agora.

**Gate:** checks finais e benchmark executados, resultados reais registrados; nenhuma operação remota necessária para concluir o escopo local.

## 15. Fase 9 — documentação, revisão e definição de pronto

1. Atualizar pontualmente plano 24 e docs de arquitetura/deployment apenas nos contratos que mudaram: lote real, limites, concorrência por destino/CPU, progresso, retomada, retries e configuração opcional. Não apagar histórico nem afirmar validação remota.
2. Criar `docs/audits/2026-10-20_QC_IMPORT_PERFORMANCE.md` ou data real de execução com antes/depois, arquivos, testes, benchmark, limitações e pendências externas.
3. Revisar diff completo e git status; preservar mudanças alheias, não commitar segredos ou fixtures reais. Se houver commit autorizado no contexto do executor, Conventional Commit sem escopo e descrição em inglês; não publicar por consequência.
4. Revisar que todos os workers terminam antes de liberar lease, que nenhum novo retry ignora PUT incerto e que nenhuma associação/capa depende da velocidade de conclusão.
5. Entregar resumo final com o que mudou, checks efetivamente executados, comparação de operações/tempo/memória, limitações e instruções de futura validação remota. Não afirmar produção atualizada.

Checklist que o executor deve preencher com evidência no relatório:

- [ ] Preparação e baseline concluídas.
- [ ] Métricas e benchmark baseline/final executados localmente.
- [ ] Preview novo reutiliza original validado, recuperação continua disponível.
- [ ] Leituras N+1 reduzidas e reimportação pronta não transfere mídia.
- [ ] Batches até 5; pipelines até 3; decoder 1; DB coordenado.
- [ ] Faixas por destino preservam ordem, capa e deduplicação.
- [ ] Quota concorrente, deadlines, drenagem e lease testados.
- [ ] PUT incerto/tombstone/compensação preservados.
- [ ] Resposta contém progresso sanitizado e revisão persistida.
- [ ] Continuação automática ultrapassa 12 chamadas sem clique artificial.
- [ ] Rate limit/retries/transporte perdido não geram loop infinito ou POST concorrente.
- [ ] Galerias, financeiro, snapshots, autorização e estados ignorados preservados.
- [ ] Typecheck, lint, testes e build final executados; resultados exatos reportados.
- [ ] Nenhuma dependência/serviço/schema novo sem necessidade demonstrada.
- [ ] Nenhuma configuração, dado real, migration compartilhada, benchmark externo ou publicação executada.
