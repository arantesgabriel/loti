# Performance de exibição QC — plano de implementação

Data: 20/10/2026.

Status: implementação local executada em 20/10/2026, com 102 testes QC aprovados, build/typecheck/lint aprovados e benchmark/segurança HTTP em Chromium validados. A suíte geral mantém falhas preexistentes de concorrência financeira SQLite. Evidências e limites: [relatório de execução](audits/2026-10-20_QC_VIEWER_PERFORMANCE.md). Este arquivo não autoriza publicação, configuração de infraestrutura ou acesso a dados reais.

## 1. Objetivo e limites

Reduzir a espera das capas e miniaturas QC em Pacotes e custos ao abrir a tela, recolher/reabrir seções e recarregar a página. Reaproveitar previews privados já baixados, reduzir consultas individuais e priorizar imagens visíveis. Preservar o viewer, a capa compartilhada, exclusões, associação manual e pedidos adicionais registrados.

Não alterar cálculos, pagamentos, reembolsos, snapshots finalizados, dimensões/layout das fotos ou regras de elegibilidade. Não adicionar fotos a novas superfícies. A apresentação de capas/miniaturas em custos já foi autorizada no handoff de 19/10 do plano 24; este plano otimiza essa apresentação existente.

Sem novas dependências, migrations, buckets, CDN pública, workers, filas externas, service worker, IndexedDB ou localStorage de fotos. Sem alterar o pipeline de importação do plano 32, os parâmetros WebP ou o armazenamento dos originais. Sem prefetch de originais. Não usar o otimizador público de imagens do Next.js para os previews privados.

## 2. Preparação para executar

1. Ler `AGENTS.md`, `PROMPT_ONE_SHOT.md` e canônicos 00–17 na ordem exigida antes de escrever código.
2. Ler integralmente o plano 24 e este plano. Conferir os planos 23, 26 e 29 quanto à elegibilidade dos pedidos adicionais e invariantes financeiros; conferir o plano 32 para preservar suas mudanças.
3. Registrar `git status --short`, diferenças preexistentes e baseline de lint, typecheck, testes e build. Preservar alterações alheias; não ler/exibir secrets de `.env`.
4. Usar Node compatível com `package.json`, banco libSQL descartável e armazenamento simulado. Credenciais remotas não são necessárias para cumprir os gates locais.
5. Implementar por fases, corrigir falhas e continuar entre fases quando a execução for solicitada. Não ampliar o trabalho para reconstruir o MVP. Não usar subagentes.

## 3. Diagnóstico confirmado no checkout

Inspeção estática em 20/10/2026, sem waterfall ou tempos de produção:

| Local | Comportamento e consequência |
| --- | --- |
| `src/lib/qc/preview.ts` | WebP persistido, até 160 px, qualidade 72, máximo 128 KiB. Não há geração durante a leitura. |
| `CostSection`, em `src/components/packages/package-cost-detail-screen.tsx` | `{open && ...}` desmonta o conteúdo ao recolher. Não manter todas as seções montadas como solução geral. |
| `previewBlob`, em `src/components/qc/qc-components.tsx` | `previewRequests` deduplica somente operações pendentes e remove a entrada ao concluir. `fetch` usa `no-store`. |
| `QcPreviewImage` | Cria URL de Blob por montagem e revoga no cleanup. Faz fetch antes de renderizar o `<img loading="lazy">`; o atributo não controla esse download. |
| `useQcSummary` / `costGalleryPages` | Resumo em memória por cinco segundos; galerias associadas à identidade do objeto de resumo. Novo resumo pode provocar novas galerias. |
| `QcGalleryButton` | Resumo → galeria individual por produto → downloads; capa fora da primeira página pode exigir mais uma consulta. Abrir o viewer também invalida o resumo. |
| `src/components/packages/product-costs-list.tsx` | Desktop e mobile montam identidades QC separadas, mesmo quando uma apresentação está escondida por CSS. |
| `getPreview`, em `src/lib/domain/qc-services.ts` | Resolve imagem/destino, autoriza, incrementa limite persistido, consulta preview, faz GET R2 e verifica tamanho/hash em cada download. |
| Rota `/api/qc/images/[imageId]/preview` | Resposta `private, no-store`, sem ETag/304. |
| `getQcPresentations` e GET `/api/purchases/[purchaseId]/qc?itemIds=...` | Existe leitura em lote de até 20 IDs de itens originais. Ainda não atende as chaves `purchase:` / `additional:` usadas na lista nem elimina a capa das três miniaturas. |

O limite `preview` atual é 180 operações por minuto por usuário/workspace e também é usado na consulta da origem do viewer. Repetições podem causar 429; isso é uma possibilidade, não uma ocorrência medida. Não aumentar/remover limites para esconder tráfego redundante.

## 4. Arquitetura alvo

```text
Seção aberta + linhas próximas da área visível
  → coordenador por usuário/workspace/compra
  → metadados em lotes de até 20 destinos
  → capa + até três previews distintos, com versão persistida
  → cache de Blobs em memória ou fila limitada de downloads
  → endpoint privado com sessão + autorização + ETag
      → 304: navegador reaproveita os bytes; sem GET R2
      → 200: GET R2 limitado + validação de integridade
  → URL de Blob com ciclo de vida controlado → imagem
```

Galeria completa continua paginada e independente dos metadados compactos. Só o original selecionado passa pelo fluxo HubBuy → fallback privado existente. Não colocar manifests/fotos no carregamento global de `/api/app`.

## 5. Fase 0 — baseline reproduzível

Criar fixture sintética com 26 produtos, parte sem QC, produtos originais e adicionais registrados, capa em página posterior e ao menos quatro fotos em produtos selecionados. Incluir dados suficientes para testar itens fora da área visível.

Medir em navegador local com build de produção e R2 simulado com latência fixa documentada: primeira abertura, cinco ciclos de recolher/reabrir, reload normal, rolagem e mudança de viewport. Registrar pedidos de resumo/apresentação/galeria/preview, GETs R2, bytes transferidos e tempo até a primeira capa e até as capas visíveis. Separar cache frio e quente. Não registrar URLs privadas ou JSON real.

Gate: baseline e procedimento reproduzíveis. Não prometer redução percentual ou latência remota antes de medir.

## 6. Fase 1 — metadados compactos em lote

- Adaptar o endpoint existente de apresentação para destinos originais e adicionais usando o parsing/elegibilidade centralizados de `getGallery` / `resolveTarget`. Manter compatibilidade com os IDs originais sem prefixo já aceitos; entradas novas usam chaves discriminadas. Validar limite 20, unicidade após normalização, comprimentos e vínculo à compra. Compra/destino estrangeiro deve falhar fechado.
- Consultar contagens, apresentações e previews agrupados por tipo de destino. Evitar loops com query por produto; o número de consultas deve depender dos tipos presentes, não do tamanho do lote.
- Retornar chave do destino, contagem, revisão da apresentação, capa privada e até três miniaturas prontas diferentes da capa. Excluir a capa antes de limitar a três, inclusive se a capa estiver em página posterior.
- Retornar uma versão de conteúdo do preview baseada nos campos persistidos já existentes: hash, versão de transformação e geração/revisão apropriada. Não usar somente `imageId` ou revisão da capa como versão dos bytes. Exclusão/restauração com o mesmo ID deve ser distinguível.
- Atualizar o cliente para não consultar `getGallery` por produto apenas para desenhar a lista. Buscar a galeria completa somente quando abrir o viewer.
- Compartilhar pedidos de metadados entre componentes desktop/mobile e outras instâncias da mesma identidade. Cache de metadados: TTL de 30 s, limite de 200 destinos no escopo ativo, deduplicação em andamento e invalidação por destino/compra. Revalidar destinos visíveis ao expirar e no retorno de foco, com deduplicação; não criar polling global.

Gate: capa correta em qualquer página; pedidos adicionais elegíveis funcionam; três miniaturas sem duplicar capa; nenhum GET de galeria individual na renderização compacta.

## 7. Fase 2 — cache de Blobs e ciclo de vida

Extrair helper cliente pequeno, por exemplo `src/components/qc/qc-preview-cache.ts`, compartilhado por lista e thumbnails do viewer.

- Chave: usuário + workspace + compra + imagem + versão do preview. Não compartilhar bytes entre usuários ou confiar somente na URL estável do endpoint.
- Cache LRU de Blobs: TTL absoluto de 5 min, até 200 entradas e até 16 MiB, contabilizando `Blob.size`. Expiração não é renovada a cada acesso. Remover falhas imediatamente. Limitar pedidos de download ativos a quatro por aba; contar downloads em andamento separadamente do cache concluído.
- Continuar deduplicando a Promise em andamento, mas guardar resultados bem-sucedidos após conclusão. Não permitir que uma resposta de escopo/geração invalidada repovoe o cache.
- Cada consumidor cria/revoga sua própria object URL a partir do Blob compartilhado; cache guarda Blob, não URL. Cleanup de uma imagem não pode quebrar outro consumidor. Não manter object URLs sem dono. Ignorar resultados após desmontagem.
- Cancelar trabalhos ainda na fila quando não houver consumidores. Uma requisição compartilhada não deve ser abortada por apenas um consumidor. Abort/cancelamento não vira falha permanente na interface.
- Desacoplar a função de callback de erro de dependências que reiniciem downloads sem mudança real da imagem.

Gate: cinco ciclos imediatos de recolher/reabrir, dentro do TTL e do orçamento, não fazem novos downloads de previews já vistos; expiração, pressão de memória e falhas têm comportamento testado.

## 8. Fase 3 — cache HTTP privado e revalidação

Alterar exclusivamente o caminho de preview bem-sucedido. Manter `qcPrivateHeaders` com `no-store` nas demais rotas e nos erros. Não alterar cache dos originais ou das assinaturas R2.

- Resposta 200/304 de preview: `Cache-Control: private, no-cache`, `Vary: Cookie, Origin`, ETag e headers de proteção compatíveis. ETag forte deve representar os bytes/versão persistidos, podendo incluir escopo opaco do usuário; não expor tokens, bucket ou chave R2.
- Separar resolução/autorização dos metadados e leitura dos bytes em `getPreview`, sem duplicar regras de acesso. Verificar sessão, membership, elegibilidade do destino, imagem pronta, preview pronto e ausência de tombstone **antes** de considerar `If-None-Match`.
- Se o validador corresponder ao preview atual autorizado, retornar 304 sem corpo e sem GET R2. Manter rate limit das leituras condicionais; consolidar consultas redundantes se possível sem remover controles. Se não corresponder, baixar e verificar tamanho/hash como hoje e retornar 200.
- Interpretar `If-None-Match` conforme HTTP, incluindo listas e comparação fraca para GET; não comparar texto bruto de header ou tratar entrada do cliente como caminho/chave de storage.
- Ajustar o `fetch` cliente para permitir cache HTTP com revalidação, removendo `no-store` apenas dos previews. Usar URL com versão opaca derivada dos metadados para separar gerações, sem aceitar essa versão como autoridade no servidor.
- Falha de sessão/permissão/exclusão retorna erro com `no-store`; nunca 304 para foto excluída ou usuário sem acesso. Não adicionar `public`, `s-maxage` ou `immutable`.

Gate: após reload normal no mesmo navegador, previews inalterados geram revalidação e zero GETs R2, enquanto alteração/exclusão/negação jamais reutiliza resposta autorizada antiga. Testar cache HTTP real sem interceptação Playwright que desabilite o cache: usar servidor/storage local simulado e contadores no servidor. Hard reload com cache desabilitado pode baixar bytes novamente; não exigir o contrário.

## 9. Fase 4 — visibilidade e invalidação

- Usar IntersectionObserver antes de buscar metadados/bytes; margem inicial de 300 px, com prioridade para capa e depois miniaturas. Aplicar ao elemento da linha/identidade para observar também visibilidade CSS. A versão desktop/mobile escondida não deve provocar downloads. Mudanças de viewport devem ativar a apresentação correta sem duplicar bytes.
- Não atrasar a capa visível com lazy loading redundante após o Blob estar pronto. Manter placeholders do mesmo tamanho, nomes, foco e abertura exata da imagem.
- Ao abrir viewer, não invalidar metadados de toda a compra sem mutação. A leitura autoritativa da galeria continua independente.
- Capa alterada: invalidar apresentação do destino e atualizar controles; preservar Blobs dos conteúdos inalterados. Exclusão: retirar imagem de todas as visualizações e caches em memória imediatamente após confirmação servidora; impedir que Promises antigas a restaurem. Importação/restauração/rematch: invalidar os destinos afetados ou a compra quando a resposta não permitir escopo menor; versão nova não reutiliza bytes antigos.
- Limpar estado e invalidar requisições ao logout, troca de usuário/workspace, desmontagem do contexto autenticado e resposta de sessão expirada. Inspecionar os caminhos reais de logout e o WorkspaceProvider; não depender apenas da montagem de outro botão QC. Falhas 403/404 também removem entrada local afetada.
- Não usar Blobs com metadados vencidos para recriar imagens antes da revalidação. Atualizações feitas por outra pessoa tornam-se visíveis na revalidação dos destinos visíveis em até 30 s enquanto a tela está ativa, ou no retorno de foco. Não prometer revogação instantânea de pixels já exibidos ou bytes já recebidos.

Gate: reabertura quente sem downloads repetidos; trabalho fora da tela/versão escondida adiado; capa, exclusão, restauração, rematch e troca de sessão não exibem dados obsoletos indevidamente.

## 10. Validação obrigatória

### Unidade

Cache: LRU, TTL com relógio controlado, orçamento por bytes/entradas, deduplicação, erros recuperáveis, quatro downloads ativos, cancelamento com múltiplos consumidores, geração invalidada e isolamento por usuário/workspace/compra/versão. Validadores HTTP: ETag diferente/igual, lista, fraco e entrada malformada.

### Integração

Banco descartável e R2 em memória com contadores: 200 frio, 304 sem GET R2, preview alterado, integridade inválida, exclusão/restauração com mesmo ID, sessão ausente, não membro, compra estrangeira, pedido adicional draft/corrigido/estrangeiro, limite 20 e normalização duplicada. Preservar rate limiting, respostas de erro sem cache e asserções financeiras existentes. Comparar contagem de queries para lotes 1 e 20 com a mesma composição de tipos para detectar N+1.

### Playwright

1. Primeiro acesso e cinco recolhimentos/reaberturas; contar downloads, não só verificar presença de `<img>`.
2. Reload normal com cache HTTP real e comprovação de zero GET R2 para conteúdo inalterado.
3. Rolagem e breakpoint: apenas apresentação visível requisita imagens; capa aparece antes das miniaturas quando há fila.
4. Trocar capa fora da primeira página, abrir miniatura exata, excluir capa, restaurar foto e consultar produto adicional registrado.
5. Expirar sessão/trocar usuário e simular resposta antiga atrasada; não repovoar cache ou exibir foto de escopo anterior.
6. 429, 404 e falha R2: sem loop automático de retries; fallback visual estável e nova tentativa deliberada recuperável.
7. Viewer mantém teclado, swipe, Escape, restauração de foco, origem → fallback privado e Histórico somente leitura.

QA visual em 320/390/768/1024/1440 px, sem alteração do layout aprovado ou salto nas linhas. Guardar capturas sintéticas em `artifacts/qa/qc-viewer-performance/`.

Executar lint, typecheck, suítes QC, regressões afetadas de custos/reembolsos/pedidos adicionais, suite geral e build; Playwright em build local de produção com banco descartável. Diferenciar falhas de baseline das introduzidas; não enfraquecer asserções ou adicionar skips para aprovar. Não executar migrations em bancos compartilhados.

## 11. Entrega e definição de pronto

- Cache quente em memória evita novos downloads dentro dos limites definidos.
- Reload normal usa revalidação privada e não relê R2 para previews inalterados.
- Lista usa metadados agrupados, sem buscar galeria por linha; imagens fora da área próxima e apresentação CSS escondida não geram tráfego inicial.
- Todos os controles de autorização, integridade, elegibilidade e rate limit permanecem; originais e finanças não mudam.
- Resultados frios/quentes, pedidos/bytes/GETs R2 e tempos locais ficam registrados em `docs/audits/2026-10-20_QC_VIEWER_PERFORMANCE.md` na execução. Reportar mediana de cinco rodadas para tempos e contagens determinísticas; distinguir metas de resultados. Medição remota só com autorização específica.
- Atualizar pontualmente o plano 24 e `docs/12_TEST_PLAN.md` para substituir a exigência antiga de `no-store` no preview pelo contrato privado com revalidação, mantendo-a nas demais respostas sensíveis. Não marcar este plano como implementado antes dos gates.
- Revisar diff e registrar limitações: validação ainda consulta banco; primeiro acesso frio continua dependendo de API/R2; revalidação pode atingir rate limit; cache do browser pode ser removido; cache em memória é por aba e limitado.

Referências HTTP: [MDN — caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching), [conditional requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Conditional_requests) e [Request.cache](https://developer.mozilla.org/en-US/docs/Web/API/Request/cache).
