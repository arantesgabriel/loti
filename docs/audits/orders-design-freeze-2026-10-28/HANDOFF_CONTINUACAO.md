# Handoff de continuidade — Pedidos Loti / Design Freeze

Atualizado em **29/10/2026**, ao encerrar a entrega da Fase 3. Este arquivo permite continuar o trabalho em outro chat no mesmo repositório, sem reiniciar a implementação nem perder as alterações locais.

## 1. Estado e autorização

- Workspace: **`C:\Fontes\loti`** (Windows / PowerShell).
- Branch conferida: **`feat/orders`**.
- HEAD conferido: **`2f547155ea31d67fa86978cca7e53329c1f05918`**.
- **Fases 0, 1, 2 e 3 implementadas/documentadas até os limites de cada fase.** F0 é diagnóstico; F1–F3 contêm implementação.
- Gabriel autorizou F1 por “prossiga pra fase 1”; depois autorizou F2 e F3, em mensagens distintas, por “prossiga para a proxima fase”. As mensagens e transições estão no registro de aprovação.
- **Fase 3 entregue para aprovação; Fase 4 NÃO iniciada e ainda NÃO autorizada.**
- A última solicitação foi gerar este handoff. Isso **não** equivale a aprovar F3/liberar F4.
- Se Gabriel autorizar F4 no novo chat, registrar a mensagem e iniciar diretamente, sem pedir confirmação repetida. Se não autorizar, é possível ler, revisar e esclarecer a entrega, mas não implementar a fase seguinte.
- O prompt mestre exige **uma fase por vez e aprovação explícita entre fases**. Essa regra específica prevalece sobre a orientação genérica de continuar autonomamente entre fases.
- Não houve commit, PR, push, merge, deploy, migration de ambiente ou configuração de serviços externos. Este handoff não concede essas autorizações.

## 2. Leia primeiro

1. `AGENTS.md` atual e instruções aplicáveis do workspace.
2. A sequência canônica `docs/00_CONTEXT.md` até `docs/17_LOGIN_ORBITAL_MOTION.md`, na ordem definida em AGENTS; `PROMPT_ONE_SHOT.md`.
3. Handoffs completos em escopo: `docs/39_ORDERS_WAREHOUSE_AND_PACKAGES_PLAN.md`, `docs/23_PRODUCT_REFUNDS_PLAN.md` e `docs/24_HUBBUY_QC_IMPORT_PLAN.md`.
4. `docs/audits/orders-design-freeze-2026-10-28/PROMPT_MESTRE.md`.
5. Todos os arquivos em `docs/audits/orders-design-freeze-2026-10-28/handoff/`, especialmente:
   - `03_ROADMAP_FASEADO.md` — escopo/gates;
   - `04_CONTRATO_VISUAL.md` — frames, comportamento e medidas;
   - `05_REGRAS_E_INTEGRACOES.md` — integridade e limites;
   - `07_PLANO_DE_TESTES.md` — matriz obrigatória;
   - `08_REGISTRO_DE_APROVACAO.md` — histórico e estado vigente;
   - `10_MANIFEST_PENPOT.json` — identificação dos frames.
6. Relatórios `FASE_0.md`, `FASE_1.md`, `FASE_2.md`, **`FASE_3.md`**, nesta pasta.
7. `docs/DESIGN.md`, especialmente seções 13 e 14, que substituem as descrições antigas da lista/expansão inline para Pedidos.

O pacote original informado por Gabriel está em `C:\Users\Gabriel\Downloads\LOTI_PEDIDOS_DESIGN_FREEZE_HANDOFF_2026-10-28`. O prompt inicialmente anexado está em `C:\Users\Gabriel\.codex\attachments\1e851b61-c3d4-41c8-a66f-e630202f2fa2\Texto colado.txt`. As cópias de trabalho/referências estão no diretório de auditoria acima; o prompt mestre fica **fora** da subpasta `handoff/`.

## 3. Preserve o trabalho local

**Toda a implementação das fases continua sem commit.** Faça `git status --short` e leia os arquivos antes de editar. Não execute reset/checkout/clean global para obter uma baseline.

Estado conferido ao escrever este arquivo:

```text
Modificados rastreados:
docs/DESIGN.md
next-env.d.ts
src/app/(app)/orders/[orderId]/page.tsx
src/app/(app)/orders/page.tsx
src/components/orders/orders-screen.tsx
src/components/qc/qc-components.tsx
src/components/ui/surface.tsx
src/lib/domain/warehouse-query.ts
src/lib/domain/warehouse-services.ts

Não rastreados relevantes:
docs/audits/orders-design-freeze-2026-10-28/
playwright.orders-foundation.config.ts
playwright.orders-list.config.ts
playwright.orders-detail.config.ts
public/fonts/
scripts/qa-orders-foundation.ts
scripts/qa-orders-list.ts
scripts/qa-orders-detail.ts
src/components/orders/orders-workspace.tsx
src/components/orders/orders-workspace.css
src/components/orders/orders-catalog.tsx
src/components/orders/orders-catalog.css
src/components/orders/orders-filter-surface.tsx
src/components/orders/orders-list-state.ts
src/components/orders/order-detail-panel.tsx
src/components/orders/order-detail-panel.css
tests/fixtures/orders-freeze/
tests/orders-foundation/
tests/orders-list/
tests/orders-detail/
tests/integration/orders-list-query.test.ts

Não relacionado, preexistente: reset-password.sh
```

`next-env.d.ts` já estava modificado no início da descoberta. A F0 o regenerou durante build; não foi possível assegurar preservação byte a byte da versão anterior à F0. Na F3, esse arquivo e os dois tsconfigs foram restaurados exatamente ao estado do início da F3. Não confundir o diff acumulado com mudanças feitas somente na última fase.

## 4. O que já existe

### Fase 1 — shell e primitives

- `OrdersWorkspace`: container de Pedidos com tokens locais, fonte Inter Tight auto-hospedada, painel integrado ao grid e sheet inferior abaixo de 1200px.
- Estado discriminado: `closed | prepare | item-detail(itemId)`.
- O estado visual do painel é independente dos filtros e da seleção.
- Desktop não reserva coluna quando fechado; mobile usa Radix/foco/portal/scroll lock do `Surface` existente.
- `OrdersBadge`, `OrdersFeedback`, `OrdersIconButton`, `OrdersBottomSheet` e hook `useOrdersCompact`.
- `Surface` recebeu a prop opcional `returnFocusTo`; defaults de consumidores anteriores foram preservados.
- Fonte local em `public/fonts/inter-tight/`, com licença OFL.
- A preparação da F1 é apenas infraestrutura/harness; não representa o novo 04A funcionando na aplicação.

### Fase 2 — lista e filtros

- `OrdersCatalog`: cinco colunas desktop — Produto, Etapa, Unidades, Custo, Ação — e linhas compactas mobile. Apenas marcadores SVG funcionais, sem fotos nas linhas.
- Busca com debounce de 300ms/Enter; etapa; filtros avançados; tabs; URL persistida; paginação real de 20; contagem, carregamento, vazio, erro/retry e normalização de página fora do intervalo.
- `/api/warehouse` existente recebeu `view` opcional (`all`, `warehouse`, `available`, `awaiting`), combinado por AND com `status` e demais filtros. Busca SQL parametrizada por produto, variante, pedido e compra de origem.
- Desktop: Todos / No armazém / Disponíveis. Mobile: Todos / Disponíveis / A caminho. Tab ativa continua visível ao redimensionar.
- `orders-list-state.ts` contém filtros/URL e `orderStage()`: etapas físicas, quantidades mistas, cancelamentos, reservas e promoção logística. QC/pagamento não inferem chegada.
- Seleção local é preservada entre filtros/páginas. O comando antigo de reserva/preparação continua em uso até a F4.
- A expansão inline entregue temporariamente na F2 foi **substituída pelo painel na F3**.

### Fase 3 — detalhe único 04B e QC

- `OrdersScreen` coordena `panel` por **`costItemId`** e deriva a linha da resposta atual. Não foi criada API de detalhe independente nem novo estado financeiro.
- Clique no nome, marcador ou linha abre um único detalhe; Adicionar/Remover não propaga clique para abrir detalhe.
- `OrderDetailPanel` mostra disponibilidade, quantidades, variação, etapa, pessoas/conta, destinos em pacotes, custo próprio com composição e estado parcial/desconhecido, pagamento e origem resumida.
- Durante atualização/erro, o painel mostra feedback. Se o item não estiver mais na resposta da página/filtros, mostra “Item não encontrado nesta listagem”; não conserva dados obsoletos como atuais. A API atual não distingue remoção de exclusão pelo filtro nesse caso.
- Fechar preserva URL/seleção e devolve largura e foco. A troca de item também atualiza o disparador usado no retorno de foco.
- Campo numérico atual de quantidade continua acessível até a substituição pelo stepper na F4; chegada existente continua acessível. Editar/reembolso estão desabilitados com explicação, aguardando F6.
- `QcGalleryButton` recebeu **opções aditivas** `galleryPreview` e `bottomSheet`. Reutiliza renderer/cache/URLs/associações/permissões/capa existentes; **nenhum pipeline QC foi refatorado**.
- A seção QC combina capa e previews sem duplicar imagem. Contador zero mostra vazio diretamente. Após cinco segundos sem apresentação, orienta usar Ver fotos. O viewer conserva seus estados e recuperação existentes.
- Troca de capa pode recriar os previews: o retorno de foco usa identidade da foto e fallback no botão Ver fotos. Refs são lidos em efeitos/eventos; lint React passou sem desabilitar regras.
- Galeria ampliada deste contexto usa sheet vertical no mobile e conserva o tema escuro do viewer existente. Outros consumidores mantêm os defaults.

## 5. Penpot e limites visuais

- Arquivo: **Loti Design System**, ID `64ee36db-f4d2-8047-8008-dbff2f7d7205`.
- Páginas: **Pedidos Loti** e **Pedidos · Mobile**.
- Marcador histórico encontrado na F0: `DESIGN FREEZE · Pedidos Loti · 04A/04B · Desktop + Mobile · 28-10-2026`.
- Leituras anteriores observaram revisões 132/133. Na F3, o MCP foi reconectado após Gabriel responder “abri”; foram reinspecionados os seis detalhes desktop e exports reais 04B JBL/M07.
- **Não foi comprovada igualdade entre o conteúdo atual e o snapshot histórico.** Não inventar essa confirmação, não restaurar versão histórica para fazer inspeção e não alterar o Penpot por iniciativa própria.
- Caso o MCP esteja desconectado, solicitar reconexão enquanto continua trabalho independente com handoff/evidências. Preferir ferramentas Penpot disponíveis ao browser.

Frames principais:

| Estado | ID |
| --- | --- |
| 04A fechado | `a1bbb7fd-3432-8020-8008-dc1025ad5d01` |
| 04A preparação | `a1bbb7fd-3432-8020-8008-dc0414fc70a0` |
| 04B JBL | `a1bbb7fd-3432-8020-8008-dc043cdce618` |
| M01 lista | `a1bbb7fd-3432-8020-8008-dc06d1144484` |
| M03 preparação | `a1bbb7fd-3432-8020-8008-dc06d69dc9f7` |
| M04 quantidade | `a1bbb7fd-3432-8020-8008-dc06d6e9639a` |
| M06 revisar pacote | `a1bbb7fd-3432-8020-8008-dc06d78ee689` |
| M07 detalhe | `a1bbb7fd-3432-8020-8008-dc086358ee0a` |

Em 1500px: tabela fechada **1192px**, x=280; aberta **800px**, painel **390px** em x=1110. São referências para grid responsivo, não largura fixa universal. Testar também 320, 360, 390, 430, 768, 1024, 1280 e 1920px. Nenhum drawer lateral mobile.

O painel conserva dados obrigatórios que o protótipo resume (composição de custos, quantidades, conta/pessoas/destinos); isso aumenta a altura e exige scroll interno. O título usa o cabeçalho acessível do shell. O retorno para preparação e o CTA final de ajuste dependem da F4. Diferenças e limites estão detalhados no relatório F3.

## 6. Próxima implementação: Fase 4, SOMENTE após autorização

Ler integralmente os blocos 4.1–4.4 do roadmap e regras de integração antes de editar.

1. Conectar seleção real ao painel **04A**, usando o mesmo slot do workspace. Abrir/fechar preparação e consultar detalhe não devem perder seleção. Implementar o retorno entre preparação e detalhe conforme Penpot, sem dois painéis concorrentes.
2. Substituir o campo numérico temporário pelo stepper **`− n +`**, mínimo 0, máximo disponível efetivo do servidor. Limites e disabled reais; seleção em 0 deixa de compor o resumo. Produtos distintos e unidades são contadores separados.
3. Reconciliar disponibilidade que muda após consulta/seleção. Não usar apenas quantidade comprada/recebida como máximo; reservas, cancelamentos, conta e conferência importam. Não deixar seleção obsoleta gerar overbooking.
4. Reutilizar o comando de reserva/montagem existente. Inspecionar `prepareSelection`, `submit`, seleção, `selectedBase` e confirmação atual em `orders-screen.tsx`; serviços em `warehouse-services.ts`, `warehouse-calculations.ts` e transação logística.
5. Revisar pacote e confirmar criação/associação real em **fixture sintética**. Preservar validações server-side, revisão esperada, idempotência, proteção a duplo clique/retry, restrição de conta e limites. Inspecionar o comportamento atual de geração de idempotencyKey antes de decidir como preservar uma tentativa recuperável.
6. Erros de concorrência/indisponibilidade devem ser recuperáveis sem perder contexto. Não alterar fórmulas financeiras ou regras de Pacotes para acomodar o frontend.
7. Mobile: preparação/revisão em sheet inferior, resumo/stepper, CTA alcançável, safe area, foco, teclado, Escape e scroll interno.
8. Testar 0, 1, 2+, min/max, remoção, pelo menos dois produtos, mudança de saldo, duas sessões, montagem repetida, erro/retry, largura fechada/aberta e contexto preservado. Usar os cenários existentes sempre que possível.
9. Entregar F4 com relatório, capturas, comandos/resultados, arquivos, riscos e critérios OK/PENDENTE/BLOQUEADO. Atualizar o registro sem autoaprovar e **parar antes da F5**.

Mensagem final exigida para F4: **`AGUARDANDO APROVAÇÃO DE GABRIEL PARA INICIAR A FASE 5.`**

As fases posteriores permanecem: F5 importação global QC JSON; F6 demais ações (edição, chegada, reembolso, origem e adaptação final); F7 auditoria final. Não antecipar esses fluxos na F4.

## 7. Invariantes indispensáveis

- Manter a stack existente e autorização server-side. Não substituir arquitetura, banco, autenticação ou storage.
- Compra finalizada é imutável; itens são snapshots. Não recalcular histórico ou modificar taxas, saldos, reembolsos e bases financeiras.
- Seleção só admite unidades efetivamente livres/elegíveis; servidor revalida reserva e conta. Preserve revisões, auditoria e idempotência existentes.
- **Fotos apenas na galeria QC** nesta implementação. A F3 do roadmap visual **não** autoriza o gate separado de fotos em linhas/cards de Pacotes e custos do plano HubBuy QC. Não criar slots/flags para antecipá-lo.
- Não refatorar importação/armazenamento/associação QC nem implementar scraping, sync, workers ou integração externa.
- Sem migration de ambiente, dados reais, buckets, secrets, publicação ou operações de produção sem autorização específica.
- Não fazer commits automaticamente; se forem pedidos, seguir Conventional Commits sem escopo entre parênteses, descrição em inglês, e separar trabalho não relacionado.

## 8. QA local e evidências

### Resultado mais recente da F3

- **15 cenários Chromium passaram** em `artifacts/qa/orders-freeze-phase3/browser-delivery.log`.
- Repetição dos dois cenários QC para capturas também passou em `browser-qc-captures.log`; são os mesmos cenários, não 17 casos distintos.
- **47 integrações QC passaram** em `qc-service-retry.log`.
- **16 unitários de cache/estado/rota privada passaram** em `qc-client-retry.log`.
- Lint, typecheck geral e isolado, build e diff passaram. Logs: `lint-delivery.log`, `typecheck-delivery.log`, `typecheck-isolated.log`, `build-delivery.log`.
- Lint visual: zero ocorrências nos três arquivos de apresentação inspecionados, `design-lint-final.log`.
- **Não foi rodada a suíte global completa nem o E2E completo de Pacotes.** F2 teve 14 cenários de navegador e 82 testes direcionados; não contá-los como reexecutados na F3. Testes de listagem tiveram seletores adaptados ao painel.

Capturas: `detail-real-desktop-1500.png`, `detail-light-390.png`, `detail-dark-1500.png`, `detail-qc-390.png`, `detail-qc-1500.png`, `qc-viewer-390.png`, `qc-viewer-1500.png` e matriz clara/escura nas nove larguras, dentro do mesmo diretório de artefatos.

### Prévia da F3

URL: **http://localhost:3143/orders?search=Seis%20exemplos**.

Credenciais **exclusivamente sintéticas**: `pessoa-a@loti.test` / `Loti-Orders-QA-Only-2026!`.

Servidor deixado em execução ao final da implementação, com log `artifacts/qa/orders-freeze-phase3/review-server.log`. Verifique se ainda está vivo; não assuma persistência entre chats e não encerre servidores de outros trabalhos.

```powershell
# Preparar a cópia identificada sem iniciar servidor
node --conditions=react-server --import tsx scripts/qa-orders-detail.ts --prepare-only

# Build isolado
node --conditions=react-server --import tsx scripts/qa-orders-detail.ts --build

# Servidor de revisão
node --conditions=react-server --import tsx scripts/qa-orders-detail.ts

# Testes de navegador: exigem porta 3143 livre, pois iniciam seu próprio servidor
npx playwright test --config playwright.orders-detail.config.ts

npm run lint
npm run typecheck
npm run typecheck:orders-transition
```

O script cria cópia consistente da fixture F2 em **`file:./data/orders-transition-freeze-phase3-20261029.sqlite`**, valida os marcadores e não usa o banco padrão do `.env`. Usa build **`.next-orders-transition-freeze-phase3`**. Na cópia, os serviços existentes criam/finalizam seis exemplos e registram recebimentos/reservas. São **33 linhas** (27 herdadas + 6). Fonte F2 intacta; reiniciar não duplica o seed. Email e credenciais externas são desabilitados pelo ambiente QA.

Disponibilidades dos seis exemplos: Anker 0, UGREEN 0, Baseus 1, JBL 2, Fender 0, D’Addario 1. Valores monetários são sintéticos, não cópias dos valores ilustrativos do Penpot.

**A prévia persistida não contém fotos QC.** Os testes de três fotos, capa e target adicional interceptam o transporte no navegador com respostas/WebP sintéticos locais. Nenhuma foto real foi importada. A integração QC de domínio é testada separadamente com os testes existentes. Não apresentar esses cenários como homologação com storage/mídia de produção.

Outras prévias históricas podem ainda ocupar 3141 (harness F1), 3142 (F2) e 3139 (QA anterior). Não são automaticamente a versão atual nem devem ser encerradas sem identificar sua propriedade/uso.

### Problemas de execução já encontrados

- Next/Chromium podem precisar de execução local autorizada fora das restrições do sandbox: houve EPERM criando a saída do build. Não confundir falha de permissão com falha do produto.
- Vitest combinado já teve falha nativa Windows `0xC0000005` em fases anteriores. Na F3, um unitário perdeu temporário; passou com TEMP/TMP em subpasta local de artefatos. Se necessário, executar arquivos separadamente com `--maxWorkers=1`, mantendo resultado real e logs.
- Não desativar rate limits de autenticação para os testes. O Playwright faz um login no beforeAll e compartilha cookies em contextos novos, evitando múltiplos logins desnecessários.
- O cache exige previews **WebP privados de até 128KiB**. PNG usado inicialmente no teste foi corretamente rejeitado; não relaxar essa validação.
- `.next/dev/types/routes.d.ts` e `validator.ts` apresentaram conteúdo gerado inválido durante a F3. Foram preservados em `dev-routes.invalid.before.txt` / `dev-validator.invalid.before.txt` e reparados com os tipos válidos do build. O validator em `.next/dev/types` precisa de imports `../../../src/`, pois a profundidade difere da pasta de build. O typecheck geral passou após o reparo.
- Antes de builds, preservar `next-env.d.ts`, `tsconfig.json` e `tsconfig.orders-transition.json`; restaurar somente alterações geradas pelo build, sem apagar mudanças legítimas de outro trabalho. Snapshots da F3 estão nos artefatos. Não substituir a situação atual por esses snapshots automaticamente no próximo chat: primeiro comparar e preservar o estado que encontrar.

## 9. Prompt sugerido para abrir o próximo chat

Anexe este arquivo e envie uma mensagem indicando se a F4 está autorizada. Exemplo sem conceder aprovação:

> Continue o projeto Loti no repositório C:\Fontes\loti a partir deste handoff. Leia as instruções e os relatórios, preserve todo o trabalho local e confirme o ponto de retomada. A Fase 3 foi entregue; aguarde minha autorização explícita antes de implementar a Fase 4. Não reinicie as fases anteriores nem faça deploy, migration ou commit.

Se Gabriel decidir aprovar a entrega, pode acrescentar explicitamente: **“Aprovo a Fase 3 e autorizo iniciar a Fase 4 conforme o handoff.”** Essa aprovação ainda **não foi dada neste chat**.
