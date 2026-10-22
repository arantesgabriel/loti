# Plano de implementação — QC HubBuy + Cloudflare R2 (V1 + V1.1)

Status: V1 + V1.1 implementadas localmente e validadas com serviços simulados; configuração externa, publicação e migration de produção continuam não autorizadas.

### Progresso restrito à seleção confirmada — 21/10/2026

A confirmação persiste no manifesto os IDs das fontes pendentes/falhas selecionadas para aquela transferência (`transferSourceIds`). Fontes prontas de importações anteriores, ocorrências ignoradas e vínculos mantidos pendentes ficam fora dessa seleção. Os lotes, a próxima foto, a lista visual e seu denominador usam a mesma seleção persistida, inclusive ao retomar. Uma associação pendente resolvida posteriormente é processada pelo fluxo próprio da ocorrência; não amplia retroativamente a fila já confirmada. A compatibilidade com manifestos antigos restringe a leitura às fontes pertencentes à própria importação e com destino válido. As fotos concluídas naquela transferência permanecem no progresso, sem serem transferidas novamente.

A interface usa a quantidade elegível devolvida pela confirmação enquanto carrega o primeiro snapshot. O teste de regressão com JSON sintético de 77 fotos confirma três produtos/10 fotos: somente dez fontes entram nos lotes e no progresso, as fontes antigas permanecem intactas e uma retomada processa zero fotos adicionais. Validação: 47 testes de integração QC, três fluxos Playwright (filtro de prévia, progresso 10/10 e associação manual), lint, typecheck e build local. Capturas desktop/390 px em `artifacts/qa/qc-selected-transfer/`. Sem alteração de schema, migration, dados reais ou publicação.

### Importação somente para produtos sem QC — 21/10/2026

Novas prévias desconsideram ocorrências sem `freePhotos` e ocorrências cujo vínculo persistido ou correspondência determinística aponta para um produto com QC pronto e não excluído. Os produtos originais e adicionais registrados que já possuem essas fotos deixam de aparecer como opções ou sugestões de associação. A prévia e o manifesto contabilizam somente as ocorrências/fotos elegíveis, informam quantas ocorrências foram desconsideradas e mostram “Nenhum QC novo para vincular neste JSON” quando não há trabalho novo.

A confirmação revalida os destinos dentro da transação e exige nova análise se algum produto selecionado passou a ter QC. A resolução de vínculos pendentes também restringe a escolha a produtos sem fotos. Transferências pendentes/falhas continuam recuperáveis pelas ações QC existentes; fotos excluídas não contam como QC disponível. Reimportar um produto que ainda tem fotos prontas não oferece restauração ou acréscimo de fotos nessa nova prévia. Manifestos anteriores mantêm seus contratos de compatibilidade, auditoria e restauração explícita. Nenhum snapshot, cálculo financeiro, schema, migration ou configuração externa é alterado.

Validação local: 46 testes de integração QC, 17 testes do parser e quatro testes de matching passaram em execuções separadas (o cache SSR temporário do Vitest falhou na execução conjunta no sandbox Windows). Lint, typecheck e build passaram. Dois fluxos Playwright passaram com banco descartável: filtro de opções/contadores/estado vazio, incluindo JSON sem fotos pelo serviço real, e associação manual/transferência/conclusão. Capturas desktop e 390 px em `artifacts/qa/qc-new-only/`. Um teste legado adicional de responsividade falhou antes de analisar o JSON: largura global de 410 px em viewport de 390 px, na página de custos por trás do drawer; essa tela não foi alterada neste ajuste. Nenhuma publicação ou operação em dados reais.

### Associação manual — 19/10/2026

Quando a análise não encontra correspondência segura, o administrador pode selecionar explicitamente qualquer produto elegível da mesma compra, inclusive um pedido adicional registrado. O seletor permanece disponível sem sugestões e informa que a escolha é manual; nenhuma opção é selecionada automaticamente. Ocorrências sem seleção continuam ignoradas. Sugestões ambíguas também permitem escolher outro produto da compra, na prévia ou na resolução de pendências. A confirmação usa a autorização, validação transacional de destino, revisão, auditoria e pipeline de fotos existentes. Conflitos de identificadores continuam bloqueando associação; correções de vínculos existentes mantêm confirmação adicional. O nome local diferente do título HubBuy não impede essa escolha nem passa a decidir o matching automático. Não há mudança de schema, cálculos, snapshots ou publicação.

O acompanhamento da transferência mostra e contabiliza somente fotos vinculadas: ocorrências ignoradas, excluídas ou ainda sem vínculo ficam fora da fila e do denominador. Quatro fotos concluídas e 88 ignoradas resultam em 4/4, 100% e “Importação concluída”. Pendências de associação de outras ocorrências permanecem acessíveis em Ações QC, sem impedir a conclusão das fotos selecionadas. A ação “Concluir” fecha a tela ao terminar, inclusive quando não há fotos vinculadas.

Validação desta correção: 61 testes QC de unidade/integração passaram; a execução geral excluindo arquivos de concorrência aprovou 273 testes, com 7 skips. Os dois fluxos Playwright focados em associação manual, fila, falha/recuperação e encerramento passaram com build local de produção e banco descartável. Capturas `artifacts/qa/qc-import-progress/manual-selected-{320,390,1440}.png` verificam quatro fotos vinculadas entre 92, 100% e fechamento com restauração de foco. Typecheck, lint e build passaram. A suíte geral não está integralmente validada: houve timeouts nos testes de concorrência de contas/reembolsos e falhas dos testes de apresentação de galerias que ainda esperam seletores da tabela anterior à refatoração de custos presente no checkout. Essas mudanças de custos foram preservadas. Nenhuma migration, dado real ou publicação foi executada.

### Capa e miniaturas na lista compacta de custos — 19/10/2026

O usuário autorizou explicitamente a apresentação QC ao lado do nome, incluindo produtos de pedidos adicionais registrados. A lista compacta usa a capa compartilhada persistida no lugar do ícone e até três miniaturas quadradas de outras fotos, sem repetir a capa. No celular, a própria capa é um único botão quadrado com o total de fotos sobreposto; não há faixa de miniaturas. Sem capa disponível, conserva o marcador e oferece um acesso compacto com contador quando há fotos. Clicar em capa ou miniatura abre aquela imagem diretamente no viewer existente; “Ver mais” abre o viewer. A primeira foto pronta continua inicializando a capa no pipeline existente; a troca pelo viewer invalida a leitura e atualiza a lista. Capas de páginas posteriores também são resolvidas por ID. Somente previews privados persistidos são carregados na lista; originais ficam restritos ao viewer. Nada muda em Histórico, Favoritos, Compra, snapshots, cálculos, schema ou migrations.

Validação: 61 testes QC e três fluxos Playwright aprovados, incluindo produto adicional registrado, capa inicial, troca de capa, ausência de duplicação, abertura exata da foto, capa na página seguinte, foco ao fechar e fallback de preview indisponível. Capturas inspecionadas em `artifacts/qa/qc-product-photos/` para desktop e 320/390/768 px. Typecheck, lint e build local passaram; nenhuma publicação ou mudança de produção.

Data: 14/10/2026. Base: inspeção do checkout e decisões do usuário nesta conversa, incluindo a revisão de segurança pré-plano. O estado do checkout contém trabalho de reembolsos do plano 23; não pressupor árvore limpa nem sobrescrever esse trabalho.

## 1. Objetivo e decisões consolidadas

Importar manualmente o JSON de pedidos HubBuy, associar suas ocorrências compradas aos itens finalizados do Loti e preservar as fotos de `goodsList[].freePhotos` em R2 privado. Exibir a CDN HubBuy como primeira opção, com backup privado autorizado como fallback.

| Tema | Contrato desta entrega |
| --- | --- |
| Escopo | V1 manual + V1.1 de matching determinístico, sugestões e reconciliação manual |
| Administração | Somente o ID persistido do usuário autorizado pode importar, confirmar/corrigir vínculos, excluir e repetir operações administrativas |
| Leitura | Membros com acesso à compra, com validação no servidor |
| Local principal | Detalhe de Pacotes e custos, depois da finalização da compra |
| Histórico | Mesma visibilidade já existente para itens de compras finalizadas, sem nova condição logística exclusiva para QC |
| Estado financeiro | Encerrar/reabrir custos não bloqueia nem habilita gerenciamento QC; são ciclos independentes |
| Propriedade | QC pertence ao `purchaseItem` por meio de suas ocorrências HubBuy; não pertence a pacote, participante ou favorito |
| Cardinalidade | Várias ocorrências HubBuy podem apontar para um item Loti; uma ocorrência tem um destino Loti por vez |
| Reimportação | Aditiva, idempotente; ausência de foto no JSON não remove uma foto existente |
| Exclusão | Oculta imediatamente após persistir tombstone; remove backup R2 e permite retry seguro; nova análise + confirmação explícita restaura apenas fotos incluídas após a limpeza completa |
| Armazenamento | Turso cataloga e controla estados; R2 guarda bytes; nunca descobrir imagens com `ListObjects` |
| Renderização | `sourceUrl` pública HubBuy primeiro; fallback R2 privado apenas depois de autorização |
| Imutabilidade | Não alterar campos do snapshot, favoritos, participantes, carrinho, pagamentos, reembolsos ou cálculos |

A regra de Histórico acima consolida a revisão mais recente do usuário e substitui a proposta anterior de esperar o primeiro pacote enviado. Reorganizar/dividir pacotes não move, duplica ou exclui arquivos. Reembolso/cancelamento de unidades não apaga QCs; eles continuam documentando a ocorrência comprada, sem inferir qual unidade física aparece na foto.

Fora do escopo: autenticação HubBuy, scraping, bookmarklet, extensão, sincronização automática, IA/LLM, notificações, filas distribuídas, workers, uploads arbitrários, fotos de anúncios como thumbnails, restauração automática de exclusões e identificação visual de unidades físicas. A restauração é somente consequência de uma nova análise e confirmação explícita do JSON. Não criar seção primária de navegação.

## 2. Instruções ao executor

1. Ler `AGENTS.md`, `PROMPT_ONE_SHOT.md`, os documentos canônicos na ordem exigida e planos 18–24. Conferir o código real antes de implementar.
2. Registrar `git status` e baseline dos checks; preservar mudanças alheias. O plano 23 está sendo implementado no mesmo checkout. Gerar a migration sobre o journal/schema efetivos; não reservar seu número antecipadamente.
3. Esta é uma extensão solicitada pelo usuário. Atualizar pontualmente os contratos canônicos para permitir QC e backup externo, preservando as demais exclusões e os snapshots finalizados.
4. Executar as fases em sequência e continuar autonomamente entre gates. Não iniciar V1.2+. Não fazer refatoração ampla de Pacotes e custos ou do backend.
5. Usar Node.js no servidor, Better Auth, Drizzle SQLite/Turso e Zod existentes. Não usar disco persistente de produção, nem migração em request. Dependências novas precisam atender necessidades concretas: S3, decodificação de imagens e classificação confiável de IPs.
6. Validar com bancos descartáveis e serviços simulados. Não usar o `.env` local implicitamente para testes/migrations. Não publicar, criar buckets, configurar secrets ou migrar produção sem autorização específica.
7. Nunca incorporar JSON real privado, URLs de fotos do usuário, secrets ou dados de produção em fixtures, logs ou commits. Criar amostras sintéticas.

## 3. Mapa do código atual e integração proposta

| Arquivo/módulo existente | Uso na implementação |
| --- | --- |
| `src/lib/auth/session.ts` | Resolver sessão Better Auth em cada endpoint |
| `src/lib/auth/origin.ts` | Reutilizar origem confiável em mutações e emissão de fallback por POST |
| `src/lib/domain/authorization.ts` | Membership e acesso à compra; acrescentar helper específico QC, sem afrouxar `requireEditablePurchase()` |
| `src/lib/db/schema.ts`, `drizzle/` | Novas tabelas, constraints, índices e migration aditiva |
| `src/lib/domain/urls.ts` | Reutilizar identidade conservadora de marketplaces; wrappers HubBuy desconhecidos não viram identidade inventada |
| `src/lib/domain/invitations.ts` | Padrão de contador persistente atômico; não misturar convites e permissões QC |
| `src/lib/domain/transaction-lock.ts` | Fila local de transações; insuficiente para coordenação entre instâncias |
| `src/lib/domain/package-cost-reading.ts` | Item de custos referencia `purchaseItemId`; manter cálculos e snapshots independentes |
| `src/components/packages/package-cost-detail-screen.tsx` | Entrada Importar QC, acesso por produto e acesso pelo conteúdo do pacote |
| `src/components/purchase/purchase-screen.tsx` | Galeria acionada no detalhe histórico; não habilitar edições comerciais |
| `src/components/purchase/history-screen.tsx` | Preservar a regra existente de compra finalizada |
| `src/components/ui/surface.tsx` | Dialog/sheet e confirmação com foco e acessibilidade |
| `src/lib/domain/services.ts`, `workspace-provider.tsx` | Não colocar fotos, manifests e assinaturas no carregamento global do workspace |
| `src/lib/domain/errors.ts`, `package-cost-http.ts` | Padrão de códigos/erros; criar tradução QC sanitizada sem logar erros externos brutos |
| `scripts/migrate.ts`, `scripts/verify-database.ts` | Migração explícita e verificação; conferir mudanças do plano 23 antes de tocar |
| `tests/integration/helpers.ts`, configs Vitest/Playwright | Banco isolado, serviços testáveis e E2E com identidades descartáveis |

Organização sugerida, ajustável sem mudar os contratos:

- `src/lib/domain/qc-{validation,matching,authorization,services,reading,http,limits}.ts`.
- `src/lib/qc/{config,download,image-validation,storage}.ts`, com `server-only` nos módulos de I/O/secrets.
- `src/components/qc/{qc-import-surface,qc-gallery,qc-client}.tsx` ou equivalentes pequenos.
- Endpoints dedicados descritos na seção 8; não transformar a API financeira em uma API de transferência de arquivos.

## 4. Segurança e configurações

### 4.1 Autorização e fronteiras

Default deny. Gerenciamento exige: sessão válida → membership na compra → compra finalizada → ID do usuário autorizado. Leituras exigem sessão/membership/acesso, independentemente de quem criou o item. Verificar relações entre workspace, compra, item, importação, ocorrência e imagem; não confiar nos IDs por estarem no mesmo payload.

O ID autorizado é configuração servidora `LOTI_QC_MANAGER_USER_ID`. Nome/email de exibição não concedem autorização. Configuração ausente ou usuário sem membership não habilita administração. Seed de testes usa ID de teste, nunca o ID real.

DTOs de mutação são estritos. O JSON HubBuy contém campos adicionais legítimos: validar sua estrutura necessária e extrair uma whitelist de dados, descartando o restante; não fazer merge genérico de objetos não confiáveis. Frontend pode pré-validar para UX, mas o servidor refaz parsing, limites, matching e autorização.

Não confiar em `canManageQc`, candidatos, hashes, MIME, dimensões, chaves ou URLs calculadas pelo frontend. URLs administrativas/fallback usam IDs internos; o backend resolve chaves e origem no banco. Não emitir assinaturas para registros pendentes, falhos ou tombstoned.

### 4.2 R2 e ambientes

Buckets distintos: `loti-qc-dev` para desenvolvimento/Preview e `loti-qc-prod` para produção. Tokens diferentes por ambiente, exclusivos do projeto e restritos ao bucket. Sem tokens administrativos Cloudflare, sem `r2.dev`, sem acesso público e sem URL pública permanente do backup.

Configuração servidora proposta:

| Variável | Finalidade |
| --- | --- |
| `LOTI_QC_MANAGER_USER_ID` | Identidade autorizada a administrar |
| `R2_ACCOUNT_ID`, `R2_BUCKET_NAME` | Conta e bucket do ambiente; derivar endpoint HTTPS confiável da configuração |
| `R2_WRITE_ACCESS_KEY_ID`, `R2_WRITE_SECRET_ACCESS_KEY` | Token Object Read & Write para upload, HEAD de recuperação e DELETE |
| `R2_READ_ACCESS_KEY_ID`, `R2_READ_SECRET_ACCESS_KEY` | Token Object Read only para assinatura de GET |

Não usar prefixo `NEXT_PUBLIC_*`, fallback de Preview para produção ou seleção de bucket pelo browser. Falhar fechado se faltarem configurações necessárias. Separar clientes de leitura/escrita; o mesmo backend possui ambos, portanto não anunciar isolamento completo contra comprometimento do servidor.

Rotação: substituir token do ambiente, redeploy, verificar acesso, revogar token anterior. Documentar separação também do Turso. `.gitignore` atualmente ignora `.env*` exceto `.env.example`; revisar arquivos rastreados, bundles, respostas e logs na entrega. Não afirmar auditoria completa do histórico Git sem realizá-la.

### 4.3 SSRF e conteúdo

Allowlist inicial fechada: `https://scm.hubbuy.app`, hostname exato e porta 443/padrão. Rejeitar userinfo, IP literal, outros protocolos, hosts parecidos, subdomínios e URLs inválidas. Não remover parâmetros desconhecidos de forma que altere a origem da foto. Fragmento não participa da requisição/identidade; preservar URL original como metadado limitado.

Redirects automáticos desabilitados; rejeitar toda resposta 3xx nesta entrega. Aceitar novo host ou redirect somente por revisão explícita, com teste e validação de cada salto/destino.

Resolver DNS e classificar todos os endereços IPv4/IPv6 com regras confiáveis de endereços públicos. Bloquear privados, loopback, link-local, CGNAT, multicast, não especificados, reservados e formas IPv4-mapped/IPv6 que contornem a classificação. Conectar ao endereço efetivamente validado preservando TLS/SNI/validação de certificado do hostname original. Usar transporte Node com resolução fixada por requisição, por exemplo `node:https` com `lookup` controlado; não validar DNS e depois chamar `fetch` que resolve novamente. Não usar proxy de ambiente ou pooling que contorne essa política.

Não enviar cookies, tokens, headers HubBuy ou credenciais R2 ao host de origem. Aceitar somente resposta HTTP 200 para download completo; sem range automático. Limitar bytes efetivamente lidos, inclusive respostas sem Content-Length e expansão por codificação de transferência/conteúdo. Não confiar em Content-Length como único limite.

Permitir JPEG/JPG/JFIF, PNG e WebP estáticos. Rejeitar SVG, outros formatos e animações. Identificar por bytes, ler dimensões e validar decodificação completa com limites de pixels, memória/tempo e quadros. Arquivo truncado ou malformado falha mesmo com assinatura válida. Fazer a validação antes do upload; extensão e MIME R2 são derivados do formato validado. Avaliar `sharp` como dependência direta para decoder limitado; não depender casualmente de pacote transitivo de Next.js. Preservar bytes originais validados e usar seu SHA-256, sem transformação silenciosa ou geração de thumbnails nesta entrega.

### 4.4 Limites fixados para baseline

| Recurso | Limite inicial |
| --- | --- |
| Corpo JSON total do endpoint prepare | 1 MiB, inclusive envelope e medido durante leitura |
| Pedidos / ocorrências | 100 / 500 |
| Entradas `freePhotos` por importação | 200, contando antes da deduplicação |
| Campos | ID externo até 200 caracteres; SKU até 2.000; título até 2.000; URL até 4.000; não truncar identidades silenciosamente |
| Foto individual | 8 MiB de bytes efetivamente consumidos |
| Dimensões | Até 8.192 px por eixo e 25 megapixels; um quadro |
| Transferência acumulada por importação | 200 MiB, incluindo tentativas/downloads parciais |
| Timeout de download / upload | 15 s / 15 s, operações completas, sem retries SDK implícitos que multipliquem o prazo |
| Lote HTTP / concorrência | Até 5 fotos / 2 transferências, um lote ativo por administrador/workspace |
| Prazo aplicativo do lote | 90 s; abortar trabalho restante e persistir resultado recuperável |
| Runtime de transferência | Node.js; `maxDuration` de 120 s, verificar suporte na configuração Vercel antes do teste remoto |
| Manifest de importação | Expira após 24 h; preparar novo JSON para continuar depois disso |
| GET assinado | TTL de 120 s; uma assinatura por imagem solicitada, nunca por toda a compra |

Aplicar limites também a arrays/propriedades antes de loops/downloads, à profundidade do processamento e ao tamanho dos DTOs de associação. Reservar quota de bytes atomicamente antes de transferências concorrentes; liquidar pelo consumo real quando conhecido e manter cobrança conservadora quando uma execução morrer sem resultado. Interromper ao exceder o orçamento e explicar que a próxima importação deve conter uma seleção menor. Não resetar quota implicitamente em retry do mesmo manifest.

O exemplo original tem aproximadamente 113 KB, 17 pedidos, 24 ocorrências e 85 fotos. Cabe no limite estrutural; tamanhos/pixels reais ainda precisam de validação. Ajustes de limites na fase 0 exigem evidência e documentação, nunca remoção das proteções. Não prometer importar todas as fotos numa única execução Vercel.

### 4.5 Rate limiting, auditoria e browser

| Operação | Limite por minuto |
| --- | --- |
| Preparar/analisar JSON | 5 por usuário/workspace |
| Confirmar/corrigir vínculos | 20 por usuário/workspace |
| Executar lotes | 12 por usuário/workspace |
| Excluir/repetir remoção | 20 por usuário/workspace |
| Emitir fallback | 60 por usuário e 300 por workspace |

Contadores atômicos persistentes Turso, namespace QC e limites combinados; sem confiar em memória de processo. Uma nova importação não cria orçamento ilimitado de frequência. Associar chaves a identidades autorizadas, não a IDs arbitrários enviados pelo atacante. Retornar 429 e tempo para nova tentativa. Reusar o padrão de convites, sem alterar suas quotas.

Auditar `QC_IMPORT`, `QC_MATCH`, `QC_DELETE` e resultados relevantes de fallback/negações: ator quando conhecido, workspace/compra/item/ocorrência/imagem quando validados, timestamp, código de resultado, contagens e mudança de vínculo anterior/novo. Eventos administrativos transacionais com a alteração correspondente; download/upload ocorre fora da transação. Falhas externas produzem código sanitizado, não erro SDK bruto.

Não armazenar response HubBuy completo ou logar secrets, cookies, Authorization, tokens, URLs assinadas completas e corpos de requests. URLs de origem também não precisam aparecer em logs; registrar identificadores/hashes. Eventos de sucesso, falha parcial e compensação devem ser distinguíveis. Manter auditoria administrativa; limpar manifests expirados e contadores antigos sem remover tombstones necessários à idempotência.

Browser fala com Loti para toda operação administrativa. R2 só recebe GET assinado de exibição. Não abrir `Access-Control-Allow-Origin: *`. `<img>` não exige CORS de administração; não criar canvas/download cross-origin nesta entrega. Usar `referrerPolicy="no-referrer"` na galeria e no acesso ao backup; respostas Loti sensíveis com `Cache-Control: private, no-store`. Não enviar todas as assinaturas antecipadamente.

## 5. Modelo de dados proposto

Modelo conceitual; nomes finais podem seguir convenções Drizzle, mantendo os invariantes:

```text
PurchaseItem 1 ── N HubBuyExternalItem 1 ── N QCImage ── objeto R2 privado
                          │                  │
                          └── QCImageSource ─┘
                                             └── tombstone/remoção pendente
QCImport → manifest limitado + resultados/claims
QCEvent  → auditoria
QCLimit  → contadores persistentes
```

### `hubbuy_external_items`

- ID interno, purchase/workspace, `purchaseItemId` nullable enquanto não associado, origem `hubbuy`.
- `orderGoodsId` principal quando disponível, `orderGoodsNo` alternativo, `orderNo`, `offerId`, canal/origem do anúncio, `offerUrl`, `skuInfo`, título apenas para leitura e quantidade externa como evidência.
- Identidade única dentro da compra/contexto, nunca global presumida entre contas. Identificadores são strings, sem conversão numérica.
- Autor/data/revisão de confirmação do vínculo. Mesmo `orderGoodsId` com `orderGoodsNo` conflitante não cria segundo registro silenciosamente: sinalizar conflito.
- Se uma importação posterior trouxer o ID principal para ocorrência já conhecida pelo alternativo, promover/reconciliar atomicamente, preservando fotos e vínculos. Não duplicar a ocorrência.
- Ambos os IDs ausentes: linha recusada com motivo, sem ID sintético por nome/índice.

### `qc_images`

- ID interno, ocorrência, URL primária validada, hash de origem e SHA-256 dos bytes, `r2Key` gerada no servidor, ordem estável, MIME, bytes, largura/altura, autor/data.
- Estados separados de disponibilidade e exclusão: pendente de upload, pronta, falha recuperável; `deletedAt/deletedBy` e remoção R2 pendente/concluída. Tombstone sempre prevalece.
- Unicidade do conteúdo por ocorrência; hashes/tombstones continuam participando da comparação após exclusão.
- Chave conceitual estável: `qc/<workspaceId>/<purchaseId>/<externalItemInternalId>/<contentSha256>.<ext>`; usar IDs internos gerados e extensão validada. Não usar `purchaseItemId` na chave: corrigir associação não deve exigir mover objeto.
- Não compartilhar objetos entre ocorrências distintas; isso evita referência contada e exclusão cruzada. Uma foto representa evidência da ocorrência, não uma unidade física serializada.

### `qc_image_sources`

- Identidade única por ocorrência + hash da URL validada; URL preservada, ordem de origem, referência à imagem quando conhecida.
- Registra também aliases: URL nova com bytes já conhecidos aponta para a mesma imagem, inclusive se excluída. Não criar uma segunda cópia do mesmo conteúdo na mesma ocorrência.
- Pode representar download pendente/falho antes de existir hash de conteúdo. Claim/revisão protege concorrência.
- Justificativa da pequena relação adicional: impedir que mudança de URL contorne deduplicação/tombstone, preservando todas as identidades já observadas sem arrays não controlados no registro principal.

### `qc_imports`, eventos e limites

- Importação: ID, compra/workspace, ator, manifest JSON normalizado estritamente limitado, datas/expiração, progresso/resultados, orçamento de bytes e claim do lote.
- Manifest contém apenas campos necessários e identidades de origem; não é o response original. Não constitui fila distribuída: processamento é iniciado explicitamente pelo administrador em requests limitados.
- Ao preparar uma ocorrência conhecida, o manifest registra no servidor as revisões/chaves das fotos e previews já tombstonados. Só uma confirmação nova pode autorizar fotos incluídas; manifest antigo ou preparado antes da exclusão não concede restauração.
- Persistir lease/versão e contador de tentativas suficientes para reconhecer execução interrompida; nunca confiar num status enviado pelo browser.
- A exclusividade de lote por administrador/workspace deve usar uma linha de lock compartilhada nesse escopo, adquirida por CAS/transação, não apenas uma lease por importação. Usar lease inicial de 180 s para request de até 120 s; requests antigos não podem confirmar estado após perder a versão. Expiração permite recuperação, mas não comprova conclusão de PUT remoto.
- Eventos administrativos e limites têm namespace próprio. Ajustar granularidade de tabelas se necessário, sem acrescentar framework de jobs ou ledger financeiro.

FKs/constraints, índices e transações devem garantir unicidades e estado coerente. Validar invariantes cruzados no serviço. Não apagar tombstones via cascade de manifest expirado; não oferecer delete de compra/ocorrência com cascade para backups. Não criar colunas de subtotais ou modificar estados financeiros.

## 6. Matching e experiência de reconciliação

1. Extrair `data.list[].goodsList[]`; validar `code` de sucesso, arrays/limites e identidades. `freePhotos: []` é válido e não remove fotos. `data.count` pode indicar paginação: informar que só o JSON colado está presente; não consultar a API nem apagar ausentes.
2. Resolver ocorrências existentes por ID principal/alternativo e reutilizar associação confirmada. Não substituir vínculo porque o favorito ou título mudou.
3. Para primeira associação, calcular identidade do anúncio com origem conhecida a partir de URL/offerId/canal. Reusar helpers existentes sem considerar URLs HubBuy wrappers desconhecidas equivalentes automaticamente.
4. Autoassociar novo vínculo somente se identidade de anúncio conhecida, variante não vazia equivalente por comparação conservadora e conjunto de candidatos apontar inequivocamente a uma linha Loti. Não traduzir SKU, inferir cor/tamanho, usar semelhança de títulos ou tratar variante vazia como confirmação. Divergência de quantidade/IDs ou duplicatas candidatas transforma o caso em sugestão/manual.
5. Evidências fortes porém incompletas sugerem candidatos ordenados, com razões legíveis (mesmo anúncio, URL correspondente, variante literal). Nome é rótulo, não score decisivo.
6. Na prévia, separar associado, sugerido, requer seleção, ignorado, sem fotos e conflito. Mostrar nome amigável Loti e SKU/identificadores HubBuy lado a lado; seleção pode escolher qualquer item da compra autorizada ou ignorar.
7. Confirmar no servidor as escolhas e revisões. Várias ocorrências podem selecionar o mesmo item; não fundir linhas Loti nem multiplicar quantidade. Recalcular/revalidar vínculos quando salvar, rejeitando prévia desatualizada.
8. Corrigir associação requer ação explícita, confirmação e evento com destino anterior/novo. Bloquear correção durante lote ativo que usa revisão antiga; não mover bytes R2. Atualizar contagens/galerias após correção.

Matching não autentica a informação HubBuy: dados colados são afirmações não confiáveis, e confirmação apenas registra a decisão interna do administrador. Guardar IDs externos no favorito não é requisito nem fonte da verdade histórica.

## 7. Transferência, idempotência e exclusão

### Importação e retomada

- Depois da confirmação, cada lote usa somente fontes/associações persistidas e autorizadas. Limitar um lote ativo por administrador/workspace com claim atômico; IDs/URLs novos não entram via endpoint de lote.
- Verificar identidade de URL/tombstone antes de baixar. Se repetida/pronta, ignorar sem PUT; se excluída, restaurar somente com autorização de uma preparação nova que registrou a revisão tombstonada e cuja confirmação inclua a foto.
- Baixar/validar/calcular hash fora da transação. Consultar hash dentro da ocorrência, inclusive tombstones. Alias de conteúdo existente não cria objeto.
- Reservar metadados/chave e claim no Turso antes de qualquer PUT. Upload usa chave de geração nova ao restaurar; depois marcar pronta por atualização condicional de revisão/claim, com tombstone ausente. Somente `ready` entra na galeria.
- Retries SDK automáticos ficam desabilitados/limitados dentro do prazo. Retry da interface repete apenas faltantes/falhas, não toda a importação já concluída. Ordem existente é preservada; fotos novas são anexadas em ordem determinística, não conforme velocidade dos downloads.
- Verificar sessão/autorização em cada request de retomada. Manifest expirado exige nova preparação; ocorrências, fotos, tombstones e resultados anteriores não desaparecem.

### Falhas entre R2 e Turso

| Falha | Resultado e recuperação |
| --- | --- |
| Reserva Turso falha | Não iniciar upload |
| Reserva OK, upload falha | Metadado recuperável, indisponível; guardar erro sanitizado e permitir retry |
| Upload OK, confirmação Turso falha | Chave já rastreada; recuperar por HEAD/verificação de metadados/checksum do objeto conhecido e confirmação condicional |
| Timeout com PUT de resultado incerto | Tratar como pendente, não presumir ausência; reconciliar pela chave persistida |
| Upload concorrente da mesma foto | Unicidade/claim no banco controla vencedor; repetição não cria outra chave para o mesmo conteúdo |
| Browser fecha/execução morre | Lease expira; estado persistido permite retomar e verificar o objeto conhecido |
| Compensação falha | Registrar pendência durável de limpeza, apresentar retry; não perder a chave necessária à recuperação |

Não compensar um erro apagando indiscriminadamente objeto que outra tentativa válida usa. Preferir recuperação do registro reservado. Não manter downloads dentro da fila/transação financeira. Coordenar com constraints/CAS no banco: `serializeDomainTransaction()` sozinho não protege instâncias diferentes.

Fornecer reconciliação manual restrita ao administrador, acionada pela interface, para pendências conhecidas de upload/remoção. Percorrer registros Turso, usar HEAD/DELETE em suas chaves, nunca ListObjects. Sem cron, workers ou scan do bucket. Não declarar consistência instantânea entre os dois serviços nem retry automático após fechar o browser.

### Exclusão

1. Receber apenas `qcImageId`; resolver ocorrência/compra/chave no servidor e validar toda a autorização.
2. Persistir tombstone e evento atomicamente, invalidando confirmação tardia de upload. Ocultar foto da CDN e do fallback em todas as superfícies Loti.
3. Se houver PUT ainda em andamento/resultado incerto, manter remoção pendente até sua conclusão ou recuperação segura. A expiração de uma lease não prova por si só que a escrita remota terminou.
4. Excluir a chave conhecida; registrar conclusão somente após resultado confirmado e tratamento dos uploads em curso. Excluir objeto já ausente é sucesso idempotente.
5. Falha mantém tombstone e chave de limpeza; informar que a imagem saiu do Loti mas o backup aguarda remoção. Retry não repete efeitos financeiros nem restaura visibilidade.
6. Tentativa de upload que observa exclusão após PUT deve remover seu objeto e manter/registrar pendência se essa compensação falhar. Recuperação futura verifica chaves de tombstones para resolver gravações tardias.

Uma restauração explícita só pode ocorrer após uma nova preparação e confirmação que inclua a foto. A preparação registra a revisão e a chave do original e do preview privado; confirmação exige que ambas permaneçam iguais, excluídas e com remoção física concluída. Fotos omitidas continuam excluídas. Se uma PUT/DELETE ainda estiver incerta ou pendente, a confirmação falha com uma pendência recuperável. Cada restauração usa chaves de geração novas e de tamanho limitado; retry antigo, alias não incluído e escrita tardia só podem limpar a chave/claim da geração que observaram. URL HubBuy pública e cópias já carregadas por navegador permanecem fora do controle de exclusão do Loti; não prometer revogá-las.

## 8. Contrato de API e leitura

Rotas sugeridas, todas no runtime Node.js e sem cache compartilhado:

| Rota/operação | Contrato |
| --- | --- |
| `GET /api/purchases/[purchaseId]/qc` | Resumo/contagens por item e capacidade de gerenciamento; validar compra finalizada/acesso; pendências administrativas só para o administrador |
| `POST /api/purchases/[purchaseId]/qc` | União estrita de preparar importação e reconciliar pendências conhecidas da compra; corpo limitado; preparação extrai/valida JSON HubBuy no servidor |
| `GET /api/qc/imports/[importId]` | Administrador consulta prévia, progresso, falhas e retomada |
| `POST /api/qc/imports/[importId]` | União estrita de confirmar/corrigir associação, processar lote e reconciliar pendências; revisão obrigatória nas mudanças de estado |
| `GET /api/purchases/[purchaseId]/qc?itemId=...` | Galeria paginada/sob demanda, até 50 fotos por página; validar item pertence à compra; incluir só imagens prontas não excluídas |
| `DELETE /api/qc/images/[qcImageId]` | Excluir ou repetir remoção idempotente; nenhum path/chave no corpo |
| `POST /api/qc/images/[qcImageId]/fallback` | Autorizar leitura do registro ativo e emitir GET assinado de 120 s |

O backend escolhe as próximas até duas fontes elegíveis por chamada, dentro do máximo estrutural de cinco do contrato. O browser não fornece URLs/chaves/hashes para executá-las. Confirmação aceita somente IDs de ocorrência/destino e revisão; relações são verificadas novamente. Códigos consistentes: 400 estrutura, 401 sessão, 403 acesso/origem, 404 recurso não visível, 409 conflito, 413 limites de corpo, 422 fonte/conteúdo incompatível, 429 frequência, 502/504 falha externa conforme caso. Resultado parcial distingue importadas, existentes, tombstoned, ignoradas e falhas; não retornar um sucesso integral quando restam falhas.

Reconciliação pela compra continua disponível após expirar o manifest e usa as chaves/pendências persistidas das imagens; não exige colar o JSON novamente. Conta no limite de lotes e adquire o mesmo lock de transferência/limpeza. Retry de exclusão por ID conta no limite de exclusões. Rotinas administrativas só percorrem a compra autorizada, em lotes limitados.

Resposta de galeria inclui URL HubBuy validada, metadados necessários e ID para fallback; nunca credenciais, assinaturas antecipadas ou chave como parâmetro administrativo. O path visível numa URL assinada não é segredo de autorização: a segurança depende da assinatura e das verificações servidoras.

## 9. Interface e comportamento

- **Pacotes e custos:** ação Importar QC visível somente ao administrador, inclusive quando financeiro estiver encerrado. A API continua sendo autoridade. Não renderizar essa ação na Compra atual ativa.
- **Prévia:** textarea limitada, erro de formato claro, resumo do conteúdo, sugestões com razões e seletores por ocorrência. Confirmar seleção antes da rede de imagens; permitir ignorar linhas. Mostrar fotos sem vínculo, conflitos e itens sem `freePhotos` sem silenciar problemas.
- **Processamento:** progresso por fotos, resultado parcial, estados de quota/429 e ação Continuar/tentar novamente. Não usar `busy` global para travar toda a aplicação durante uma importação.
- **Produto/pacote:** botão compacto Ver QC com contagem; galeria por item e agrupamento por ocorrência/SKU. Item compartilhado tem uma galeria, mesmo aparecendo em vários grupos. No pacote, mostrar a galeria do item sem alegar que as fotos são exclusivamente das unidades daquele pacote.
- **Histórico:** mesmo componente de galeria no detalhe do item, consultado sob demanda; snapshots continuam somente leitura. Gerenciamento administrativo fica em Pacotes e custos, inclusive para correções/exclusões.
- **Galeria:** carregamento lazy, navegação por teclado, foco/restauração, texto alternativo baseado no nome e posição, estados vazios/erro. Imagem falhou na CDN → solicitar fallback uma vez; não entrar em loop source/fallback. Assinatura expirada permite tentativa explícita de renovação sujeita a rate limit; falha também no R2 mostra estado indisponível.
- **Exclusão:** confirmação explica remoção do Loti/backup e preservação do tombstone, sem prometer apagar a CDN externa. Atualizar galeria/contagens após tombstone; mostrar retry quando remoção física estiver pendente.
- Preservar ícones de categoria, listas sem thumbnails e hierarquia aprovada. Fotografias somente na galeria QC específica. A foto da listagem `goodsList[].image` não é QC e não deve ser importada/exibida como tal.
- Não acrescentar navegação, login, roles genéricos, rastreamento automático nem bloqueios para fechar custos por ausência de QC.

## 10. Fases e gates

### Fase 0 — baseline e contratos canônicos

Conferir alterações do plano 23, registrar falhas preexistentes e reler schema/journal/API/componentes. Consolidar permissões, exceção de fotos e Histórico nos documentos pertinentes (`AGENTS`, prompt, produto/escopo/regras, fluxos/IA, visuais, arquitetura/schema, testes/aceite, deployment/decisões/inputs). Atualizar somente trechos necessários, preservando trabalho alheio. Confirmar recursos Vercel e limites antes de qualquer validação remota; nenhum acesso à conta externa é necessário para testes simulados.

**Gate:** contratos sem conflito e mapa de integração atualizado. Não iniciar implementação com baseline desconhecido. ID real e R2 não bloqueiam desenvolvimento isolado; registrá-los como inputs operacionais.

### Fase 1 — parser, identidade, matching e limites puros

Implementar validação de payload, extração whitelist, identidades principal/alternativa e critérios conservadores de matching. Definir constantes de limites, resultados e erros. Cobrir variantes repetidas, wrappers desconhecidos, campos ausentes, códigos HubBuy, conflitos e promoção de ID alternativo.

**Gate:** testes de unidade demonstram que nomes/IDs de anúncio sozinhos não decidem vínculo e nenhuma ambiguidade é autoaceita.

### Fase 2 — persistência, autorização, auditoria e quotas

Adicionar schema/migration sobre o baseline real, estados/constraints, autorização por ID, manifests limitados, contadores persistentes, eventos e claims/revisões. Construir preparação/confirmação/leitura sem I/O real. Validar migração vazia e upgrade sobre schema com reembolsos, acompanhamento aberto/encerrado e histórico.

**Gate:** servidor rejeita acesso indevido/IDs cruzados; vínculos e eventos são atômicos; unicidades, quotas e claims funcionam entre conexões; campos preexistentes permanecem iguais.

### Fase 3 — fronteira de rede e validação das imagens

Implementar download HTTPS fixado a IP público validado, rejeição de redirects e limites reais de bytes/prazo. Integrar decoder limitado para formatos permitidos e hashes. Usar DNS/transporte/decoder substituíveis em testes, com fixtures sintéticas, sem acessar URL real ou serviço de metadata.

**Gate:** testes bloqueiam SSRF, rebinding simulado, formatos falsificados, bombas de pixels, SVG, truncamento, animação, streaming excessivo e timeout; nenhum PUT ocorre para arquivo inválido.

### Fase 4 — R2, lotes, deduplicação e recuperação

Implementar clientes servidores separados e storage testável, reserva antes de PUT, confirmação condicional, deduplicação origem/conteúdo e orçamento por importação. Executar lotes acionados pela interface/API, com retomada e recuperação de objeto conhecido. Não usar ListObjects.

**Gate:** repetir importação não aumenta registros/objetos válidos; kill/timeout simulado e falhas R2/Turso deixam estado rastreável; nenhuma transação cobre a rede; acesso financeiro não depende do progresso QC.

### Fase 5 — exclusão e fallback autorizados

Implementar tombstone, DELETE/retry, concorrência com upload/rematch e reconciliação das chaves conhecidas. Implementar emissão de fallback sob demanda com ID, autorização, quota e TTL. Garantir logs/respostas sanitizados.

**Gate:** upload tardio e retry antigo nunca reativam um tombstone; uma preparação nova + confirmação explícita restaura somente as fotos incluídas depois da limpeza integral; falha de DELETE mantém pendência recuperável; fallback nega IDs cruzados, pendentes e excluídos; browser não controla chaves.

### Fase 6 — interface Pacotes/Histórico

Conectar prévia/matching/progresso/retomada e galeria compartilhada, com acesso por item/pacote e Histórico. Tratar custos encerrados, itens compartilhados/divididos/reembolsados e fallback real simulado. Manter visuais/listas e formulários financeiros existentes.

**Gate:** jornadas E2E passam em desktop/mobile e teclado; fotos não aparecem como thumbnails operacionais; correção de vínculo atualiza os dois itens sem mover backups; nenhum cálculo/reembolso/pagamento muda.

### Fase 7 — validação completa e handoff operacional

Rodar typecheck, lint, unidade/integração, Playwright pertinente e build. Repetir migração vazia/upgrade se a migration mudar. Inspecionar telas 390/1440 px e ausência de overflow em 320 px. Verificar bundles/respostas/logs e arquivos rastreados quanto a secrets. Entregar diagnóstico de falhas preexistentes separado dos resultados QC.

Após autorização de configuração externa, validar bucket de desenvolvimento com credenciais do projeto, objetos sintéticos, exclusão/retry, MIME, fallback de 120 s e ausência de acesso público. Sem essas credenciais, entregar validação simulada e declarar que integração real ainda não foi verificada; não declarar funcionalidade validada em produção.

**Gate:** evidências locais completas e checklist operacional explícito; nenhuma publicação/migração em produção executada por consequência deste plano.

## 11. Matriz mínima de testes

| Área | Cenários obrigatórios |
| --- | --- |
| Sessão/permissão | Sem sessão; membro não administrador; administrador sem membership; outro workspace; ID autorizado ausente; nome/email forjados |
| Acesso direto | POST/DELETE/fallback sem UI; origem incorreta/ausente; IDs de outra compra/item/ocorrência/importação |
| Payload | JSON inválido/excessivo; arrays/strings além do limite; campos inesperados no DTO; `r2Key`, bucket, hash, MIME e destino injetados |
| Extração | `code` de erro; `freePhotos` vazio; campos opcionais ausentes; paginação parcial; mesmo ID com metadados conflitantes |
| Identidade | IDs como strings; principal/alternativo; promoção posterior; mesmo anúncio em canais/variantes diferentes |
| Matching | Vínculo confirmado reutilizado; única correspondência conservadora; sugestão não confirmada não importa; nomes similares não decidem; rematch explícito |
| Cardinalidade | Duas ocorrências para um item; linha compartilhada não duplica fotos; divisão/reorganização de pacotes não move bytes |
| SSRF sintático | HTTP; userinfo; IP literal; hostname semelhante; subdomínio; porta não permitida; URL malformada |
| SSRF de rede | Redirect 3xx; DNS privado/loopback/link-local/metadata; IPv6/IPv4-mapped; resolução pública depois privada; conexão usa IP validado |
| Conteúdo | JPEG/JFIF, PNG, WebP válidos; MIME falso; magic bytes falsos; SVG; truncamento; animação; decoder falha; pixels/dimensões excessivos |
| Transferência | Sem Content-Length; tamanho declarado falso; stream/decompressão excessivos; timeout/abort; HTTP não 200; concorrência e orçamento acumulado |
| Idempotência | Mesmo JSON; ordem diferente; alias de URL com mesmos bytes; dois requests/conexões; pronto não sofre PUT repetido |
| Falhas parciais | Reserva falha; upload falha; upload OK/confirmar banco falha; PUT incerto; crash; compensation falha; recuperar por chave conhecida |
| Exclusão/restauração | Só administrador; ID interno; objeto ausente; DELETE falha; retry; reimportação explícita após limpeza; foto omitida segue excluída; manifest antigo; tombstone por URL/hash; upload tardio; rematch concorrente; geração antiga não apaga nova |
| Fallback | CDN falha; autorização por imagem; expiração curta; sem assinatura persistida/logada; imagem pendente/excluída; R2 indisponível; sem loops |
| Rate limit | Limites combinados; 429/retry; persistência entre conexões/instâncias; novo manifest não contorna quota; uma lease ativa |
| Auditoria/secrets | Ator/contexto/resultado corretos; eventos atômicos; erros SDK redigidos; nenhuma chave/cookie/assinatura completa em DTO/log/bundle |
| Financeiro/histórico | Custos abertos/encerrados; compra finalizada imutável; reembolsos preservados; sem mudança em preço/rateio/pagamento/quantidades; leitura antes/depois do envio |
| Migração | Banco vazio; upgrade com plano 23; repetir migrator; FKs/constraints; comparação de dados anteriores; sem backfill automático de QC |
| UX | Colar → confirmar → importar → ver → fallback → excluir → reimportar; falha parcial/retomada; outro usuário só visualiza; teclado/390/1440/320 px |

Usar Vitest/libSQL isolado e Playwright existentes. Testes de concorrência usam conexões independentes, não apenas fila local. Simular clocks/DNS/R2/HTTP sem sleeps longos ou chamadas a IPs proibidos. Não apontar E2E para bucket/banco de produção.

## 12. Comandos, inputs e entrega

Na implementação: `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`, `npm run build`. Rodar suites direcionadas por fase; ampliar quando houver mudança/falha relevante. Não rodar build/migrations apenas para validar este documento.

Para migrations de teste, chamar o migrator com URL `file:` explícita em diretório temporário descartável, usando `migrateDatabase()` existente quando compatível; não herdar alvo de `.env`. Gerar a migration somente na fase 2. Criar relatório das alterações e schema antes/depois do upgrade.

Inputs humanos na execução operacional:

- ID Better Auth real do administrador, obtido/verificado por procedimento autorizado, nunca inferido de nome.
- Conta/buckets e tokens limitados de desenvolvimento e produção; autorização específica antes de configurá-los.
- Verificação dos limites reais Vercel e das características das fotos em amostra autorizada, sem persistir conteúdo privado no repo.

Entrega esperada: feature local, migration, testes/evidências, documentação canônica coerente e checklist de configuração/deploy/rotação/recuperação. Não existem dúvidas bloqueantes de produto para iniciar a implementação isolada.

Checklist operacional após autorização: criar/verificar bucket privado do ambiente → configurar tokens/ID servidores → migration explícita no alvo escolhido → deploy correspondente → testar importação sintética/fallback/exclusão → verificar ausência de credenciais de produção em Preview. Produção requer ação/autorização própria; nunca é consequência automática do smoke test de desenvolvimento.

## 13. Referências externas de suporte

- [R2 — autenticação e permissões de tokens](https://developers.cloudflare.com/r2/api/tokens/).
- [R2 — URLs assinadas e validade](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).
- [R2 — API compatível com S3](https://developers.cloudflare.com/r2/get-started/s3/).
- [Vercel — limites de Functions](https://vercel.com/docs/functions/limitations).

Revalidar documentação/configuração antes do teste remoto. Este plano não afirma que contas, buckets, credenciais ou recursos de produção foram inspecionados/configurados.

## 14. Registro de implementação e handoff — 2026-10-14

Escopo entregue neste ciclo: V1 + V1.1 local, com persistência additiva, endpoints autenticados, painel/galeria QC e a migration `0006_shiny_rockslide.sql`. V1.2+ não foi iniciada. A alteração não modifica snapshots de compra, quantidades, rateios, pagamentos, custos, reembolsos ou seus cálculos.

Decisões operacionais da implementação:

- O `LOTI_QC_MANAGER_USER_ID` é comparado com o ID Better Auth da sessão; permanece sem valor real no ambiente. Membros autorizados podem ler galeria/fallback, enquanto importação, associação, lotes e exclusão ficam restritos ao administrador configurado.
- R2 usa clientes S3 privados distintos de leitura e escrita, `maxAttempts: 1`, URLs de leitura sob demanda com TTL de 120 s e `Cache-Control: private, no-store`. Credenciais, bucket, ACLs e endpoint não foram configurados nem criados.
- O lote processa uma única foto ou exclusão por chamada. Cada DNS/download, validação de imagem, HEAD, PUT e DELETE só começa quando seu limite individual cabe no prazo compartilhado de 90 s, preservando 5 s para salvar o estado. A validação reserva 24 s para suas duas passagens do decoder. Se uma etapa seguinte não couber, a reserva fica recuperável e a operação termina antes de exceder o prazo; não se inicia uma segunda foto no mesmo request. Fontes e tombstones elegíveis disputam a próxima vaga pela data de atualização, e uma falha recebe nova data para não bloquear as demais.
- DNS valida todas as respostas públicas e conecta ao IP aprovado preservando TLS/SNI; redirect não é seguido. A validação de conteúdo aceita apenas JPEG/PNG/WebP estáticos, com magic bytes, inspeção de animação, decodificação completa e limites de bytes/pixels/dimensões.
- Uma fonte pendente/falha que já tem `imageId` tenta recuperar a chave R2 e conferir o SHA-256 antes de baixar outra vez da CDN ou reservar bytes. Ao selecionar a mesma fonte numa nova importação menor, a confirmação move a fonte pendente/falha para esse orçamento; gastos confirmados/ambíguos permanecem debitados no orçamento anterior, e uma reserva não liquidada é cobrada conservadoramente antes da transferência.
- O serviço persiste `QC_PUT_IN_FLIGHT` antes do PUT e só libera a exclusão do tombstone quando o writer confirma e compensa a gravação. Se o processo original morrer sem conseguir confirmar um PUT ambíguo, uma HEAD ausente não autoriza iniciar outro PUT para a mesma chave — inclusive quando outro URL aponta para o mesmo hash. A fonte segue pendente e o tombstone permanece pendente até o objeto aparecer e ser removido ou haver reconciliação operacional. Não há worker/fila que resolva automaticamente uma escrita remota cuja conclusão não possa ser determinada.
- Migration foi aplicada somente a banco libSQL descartável local e executada repetidamente no teste de upgrade. Nenhuma migration de ambiente compartilhado/produção foi executada.
- A baseline era o commit `bb3449f` (`feat: add product refund tracking`). `docs/INDEX.md` já estava modificado e `docs/24_HUBBUY_QC_IMPORT_PLAN.md` já existia como arquivo não rastreado; a alteração preexistente no índice foi preservada sem stage.
- A suíte de concorrência do plano 23 reproduziu `SQLITE_BUSY` entre processos no recebimento de reembolso. Foi ampliado somente o backoff de retries transitórios do serviço de custos; revisão otimista ainda escolhe uma única gravação. A jornada de reembolsos e seus snapshots/cálculos não mudaram.

Resultado dos gates locais: typecheck e lint passaram; 104 testes unitários e 98 testes de integração passaram, com 7 casos de integração skipped pelos marcadores já existentes. Playwright passou 25/25 incluindo QC e reembolso. O build de produção passou em saída isolada `.next-qc-final-20261014`. A migration foi aplicada e verificada em libSQL descartável; o teste de upgrade usa trilha aberta, trilha encerrada, custos pagos e reembolso recebido, compara os dados anteriores/depois e reaplica a migration. Suites Vitest foram serializadas neste host Windows para evitar falhas do cache SSR efêmero do runner; o teste de concorrência multiprocesso de reembolso também passou isoladamente.

Handoff operacional após autorização específica: verificar o ID real do administrador; obter bucket privado e tokens limitados do ambiente; conferir suporte efetivo a `maxDuration=120` na configuração Vercel; então configurar ambiente de desenvolvimento e aplicar migration explicitamente antes do smoke test remoto. Produção exige autorização própria para secrets, migration e publicação. Até esses inputs existirem, armazenamento remoto, CDN/fallback real e execução hospedada não estão validados; a suite utiliza R2/HTTP simulados e banco descartável.

## 14. Evolução de capa compartilhada e visualizador — fases 1 e 2

Esta evolução acrescenta uma apresentação compartilhada por item finalizado e um visualizador paginado, sem alterar favoritos, snapshots, pacotes, custos, pagamentos, reembolsos ou totais.

### Fundação

- `qc_presentations` guarda uma única imagem de capa por `purchaseItemId`, a revisão otimista e os dados de auditoria. A associação da imagem é sempre revalidada pela cadeia compra → item comprado → ocorrência HubBuy → imagem QC pronta; a FK sozinha não autoriza o vínculo.
- A primeira imagem pronta vinculada define a capa quando ainda não existe uma capa válida. Fotos posteriores não substituem uma capa manual. Ordem de fallback: `ordinal`, criação e ID.
- Excluir a capa cria tombstone e escolhe atomicamente a primeira imagem restante, ou limpa a capa. Remapeamento de ocorrência repara a apresentação do item de origem e do destino. Nenhuma chave é movida no R2.
- `qc_image_previews` cataloga o preview WebP privado e versionado (até 160×160, sem ampliação, com orientação EXIF aplicada e limite de 128 KiB). A chave é criada no servidor. O preview é gerado no mesmo pipeline manual de QC, com falha isolada do original; GET não gera arquivos.
- Uma gravação R2 incerta continua pendente e recuperável por chave conhecida e HEAD. Tombstone do original ou preview continua ocultando o arquivo e a limpeza é repetida sem `ListObjects`.
- A leitura binária exige sessão e autorização de compra; não retorna URL assinada nem aceita chave, bucket, transformação ou tamanho do cliente. A apresentação em lote aceita até 20 itens e retorna no máximo três previews por item, contagem e revisão, sem carregar a galeria completa.

### Visualizador

- O botão “Ver QC” conserva a posição aprovada dentro do detalhe de custos ou da leitura de Histórico. A galeria busca páginas de 12 imagens, ordenadas por `ordinal`, criação e ID. É possível abrir diretamente um `imageId` de páginas posteriores.
- A galeria usa previews privados. O visualizador carrega o original somente para a imagem selecionada, primeiro da CDN HubBuy validada e depois do fallback privado autorizado. Anterior/próxima, teclado, toque, contador, ocorrência, carregamento, vazio, erro, foco e safe areas são parte do contrato.
- Somente o administrador QC pode definir capa e excluir no visualizador de Pacotes e custos. Histórico continua somente leitura. A exclusão remove a imagem do estado local imediatamente, atualiza contagem/capa e informa quando a remoção física ainda está pendente.
- Respostas de original e erros continuam privadas e `no-store`; previews binários bem-sucedidos usam `private, no-cache` e ETag com revalidação autorizada, conforme o plano 33. URLs assinadas não são persistidas em cache cliente. Reabertura revalida a galeria, e estado em memória é isolado pela sessão, compra e imagem.

### Fase 3 — apresentação da capa em custos (autorizada pelo usuário)

Em 15/10/2026, o usuário autorizou esta fase. A entrega fica restrita às linhas de produto da tabela desktop e aos cartões responsivos de custos em **Pacotes e custos**:

- Mostrar a capa QC compartilhada atualmente selecionada no marcador do produto, usando seu preview WebP privado já persistido. Exibir também até três previews WebP privados em miniaturas quadradas com borda, sob o proprietário do produto; quando o cover selecionado não estiver entre os três previews iniciais, incluí-lo e completar a faixa com os dois primeiros. Não buscar o original, gerar preview durante leitura, emitir URL assinada ou usar `goodsList[].image`.
- O lote de apresentações continua limitado a 20 IDs por requisição. A resposta inclui separadamente o preview da capa selecionada, mesmo quando ela não está entre as três primeiras imagens da galeria.
- O preview mantém autorização de sessão/membership por item e é carregado pela rota binária privada, com `private, no-cache`, ETag e `no-referrer` (plano 33). Erros continuam `no-store`. Falta de capa, preview ausente/falho, remoção ou falha de leitura preservam o marcador funcional de categoria.
- Seleção de capa, exclusão/fallback e correção de vínculo invalidam e recarregam a apresentação de custos. O usuário sem acesso QC continua vendo o mesmo gate de autorização da rota de preview.
- O botão “Ver mais” abre diretamente a primeira foto no visualizador, sem uma grade intermediária. Cada miniatura abre sua própria imagem, inclusive quando estiver em uma página posterior. O visualizador prioriza a imagem inteira sobre fundo escuro, com contador discreto, setas sobrepostas, miniaturas e ações compactas de capa/exclusão. A seção separada “Controle de qualidade” foi removida. Nenhuma foto é adicionada à Compra atual, Histórico, Favoritos, drawers de produto ou outros cartões/listas. A galeria e o visualizador continuam sendo as únicas superfícies que exibem fotos fora das linhas/cartões de custos explicitamente autorizadas.
- O visualizador mantém a proporção intrínseca da foto e limita largura/altura à área disponível, sem cortar o conteúdo para preencher o card.
- Nenhum dado financeiro, snapshot, refund, pagamento, quantidade, alocação, estado logístico ou schema/migration é alterado por esta apresentação.

### Drawer de importação — refatoração visual de 15/10/2026

O acompanhamento de transferências usa a referência visual fornecida pelo usuário: composição leve com ícones Lucide existentes, título humano, barra verde, fila de fotos e callout discreto. A confirmação de vínculos continua antes de qualquer transferência. Preparação, associação, lotes sequenciais, limite de chamadas, interrupção e retomada mantêm as regras anteriores.

- `GET /api/qc/imports/:importId` acrescenta uma leitura autorizada dos registros persistidos: identificação da foto, nome da origem, ocorrência, estado, código de falha, tamanho já registrado e preview privado disponível. A próxima fonte usa a mesma ordenação de atualização/criação/ordinal do lote. Não expõe chaves de storage, hashes ou URLs assinadas, nem busca ou gera imagens durante essa leitura.
- A interface mantém a ordem original do manifesto, identifica a fonte em processamento e distingue Importada, Já existente, Aguardando, Falha, Pendente, Sem vínculo, Ignorada e Excluída. Fotos prontas de uma importação anterior continuam reconhecidas. Tamanho é omitido quando ausente; nomes ausentes usam “Foto N”. Miniaturas deste acompanhamento usam apenas os previews privados já persistidos, com placeholder neutro quando indisponíveis; essa autorização é restrita ao drawer de importação.
- A barra deriva das fotos prontas e das tentativas com falha registradas, sem timers ou avanço artificial. Uma falha contabilizada como processada continua explicitamente sinalizada e nunca gera mensagem de sucesso. Fotos que aguardam recuperação ou vínculo permanecem pendentes. A conclusão com sucesso exige todas as fotos prontas; conclusão parcial e ausência de fotos têm mensagens próprias.
- Header e ações ficam acessíveis; a lista tem rolagem interna e foco para teclado. O layout funciona de 320 a 1440 px, com tratamento de telas baixas, nomes truncados, estados com ícone e texto, região de anúncio, valores ARIA do progresso e animações desativadas com movimento reduzido.

Validação local: typecheck, lint e build de produção passaram; suíte Vitest com 226 testes aprovados e 7 skips preexistentes; sete cenários Playwright de QC aprovados. Verificações adicionais cobrem início em 0%, progresso intermediário, conclusão em 100%, previews disponíveis, foto existente, falha, recuperação, vínculo pendente, retomada e teclado em 320×480. Capturas sintéticas ficam em `artifacts/qa/qc-import-progress/`. Os testes usam banco descartável e mídia/storage simulados. Nenhum schema, migration, segredo, recurso remoto ou publicação foi alterado para esta refatoração.

### Otimização de performance da importação — implementação local em 20/10/2026

O plano [32 — QC import performance](32_QC_IMPORT_PERFORMANCE_PLAN.md) atualiza o caminho de transferência descrito acima. Cada POST de manifesto seleciona até `QC_LIMITS.batch` fontes (5), processa até três destinos independentes em paralelo e preserva a ordem dentro de cada destino. A validação e a geração de preview compartilham uma vaga de processamento pesado por request. Uma fila serial local protege comandos e transações libSQL curtas; downloads e operações R2 permanecem fora dessa fila. A lease persistida continua sendo a coordenação entre instâncias.

`LOTI_QC_PIPELINE_CONCURRENCY` é uma configuração de servidor opcional, inteira de 1 a 3, com padrão 3; valor inválido interrompe a operação com erro QC sanitizado. O browser não escolhe a concorrência. Valores 5 e 10 são aceitos apenas por serviços injetados em benchmark/testes sintéticos, nunca pelo caminho de produção. Não foi alterado ambiente hospedado.

Quando os bytes validados da imagem original ainda estão disponíveis, o preview usa esse mesmo buffer e elimina o GET R2 redundante do original. Recuperação sem esse buffer continua lendo e verificando o hash do objeto privado. PUTs incertos, tombstones, quotas, claims, deduplicação por ocorrência, reparo de capa, snapshots e cálculos financeiros conservam seus contratos. Os trabalhos iniciados drenam ou são abortados e liquidados antes de a lease ser liberada.

Uma resposta de batch de manifesto inclui a revisão persistida e um snapshot sanitizado de progresso; o GET de progresso permanece para abertura, retomada e recuperação de resposta perdida. A interface continua batches enquanto estiver montada, espera rate limit estruturado com limite, e faz GET antes de tentar novamente quando a resposta de transporte é incerta. A apresentação da galeria e a exceção visual de Fase 3 não mudam. Não há novo schema, migration, worker, fila persistida ou telemetria externa.


### Performance de exibição — implementação do plano 33

A lista compacta lê apresentações em lotes de até 20 destinos discriminados, com suporte a itens originais e adicionais registrados/elegíveis. A capa vem separada de até três miniaturas distintas, inclusive quando está em página posterior. URLs de preview incluem versão opaca derivada dos dados persistidos, sem expor chave R2. A galeria completa continua sendo consultada somente ao abrir o viewer.

Previews bem-sucedidos usam `private, no-cache` e ETag por usuário/conteúdo. A sessão, membership, destino, estados e rate limit são verificados antes de um 304 sem corpo/GET R2. Erros, originais, assinaturas e outras APIs QC conservam `no-store`. O navegador pode guardar bytes privados para revalidar após reload; não há CDN pública, cache compartilhado ou armazenamento offline.

No cliente, Blobs ficam em LRU por usuário/workspace/compra/imagem/versão, com TTL absoluto de cinco minutos, 200 entradas, 16 MiB e quatro downloads ativos. Cada consumidor gerencia sua object URL. Metadados têm TTL de 30 segundos e limite de 200 destinos. Linhas próximas da tela começam o carregamento; a apresentação desktop/mobile escondida não busca fotos. Linhas já descobertas conservam seus previews quando saem da área próxima, evitando oscilação; a revalidação periódica se limita às linhas próximas. Abrir o viewer não invalida toda a compra. Mutações, exclusão/restauração, troca de sessão e respostas tardias respeitam invalidação e isolamento.

Sem mudança de schema, migração, importação, fotos originais ou cálculos financeiros. Evidências e limites de validação ficam no [relatório local](audits/2026-10-20_QC_VIEWER_PERFORMANCE.md).
