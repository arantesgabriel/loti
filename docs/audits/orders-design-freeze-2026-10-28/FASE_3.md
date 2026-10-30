# Fase 3 · Detalhe único 04B — entrega para aprovação

Data: **29/10/2026**. Autorização de Gabriel: **“prossiga para a proxima fase”**, após a entrega da F2 e a pergunta explícita sobre iniciar F3. Branch `feat/orders`; baseline SHA `2f547155ea31d67fa86978cca7e53329c1f05918`. A F4 não foi iniciada. Sem commit, PR, deploy, migration de ambiente ou configuração externa.

## Implementado por bloco

**3.1 · Um item no contexto da lista.** Nome, marcador e área da linha abrem `item-detail(costItemId)` no único slot do workspace. A expansão inline foi removida. O painel recebe exclusivamente a linha correspondente da resposta autorizada já carregada; não abre a compra inteira, não adiciona endpoint e não mantém um segundo estado financeiro. Mostra variação, etapa física, disponibilidade, compradas/recebidas/vinculadas/canceladas, participantes, conta, destinos em pacotes, composição do custo e pagamento. Quantidades e valores são apresentados uma vez no detalhe, sem accordions.

Filtros, página, busca e seleção ficam fora do estado do painel. Fechar devolve a largura da tabela e o foco ao disparador. Alternar itens atualiza a identidade, disponibilidade e custo; a instância QC tem chave por item/origem. Durante atualização/erro da listagem não se mostram dados anteriores como atuais. Se o item sair da página/filtros ou deixar de existir na resposta, aparece “Item não encontrado nesta listagem”, com orientação para fechar e revisar os filtros. Não se afirma distinguir remoção de exclusão pelo filtro, pois a API atual entrega a página da listagem.

**3.2 · Galeria QC existente.** A seção Fotos QC reaproveita `QcGalleryButton`, `QcPreviewImage`, cache privado, consulta de apresentação, navegação, ampliação, escolha de capa e permissões existentes. A apresentação combina capa e previews sem duplicar a mesma imagem. Não se mudou armazenamento, importação, URLs, associação, transações ou autorização QC. `galleryPreview` e `bottomSheet` são opções aditivas; consumidores anteriores mantêm os defaults.

Itens cujo contador real é zero mostram o estado vazio diretamente, sem consultar storage nem oferecer botão sem fotos. Previews indisponíveis conservam o placeholder do renderer; uma apresentação que não carrega em cinco segundos orienta abrir Ver fotos, cujo carregamento/erro continua no viewer existente. Salvar capa mantém a revisão esperada do contrato. Como a invalidação pode recriar os previews, o retorno de foco procura a mesma identidade de foto após a atualização e usa Ver fotos como alternativa quando necessário.

**3.3 · Desktop e mobile.** Desktop usa painel de 390px dentro do grid. Em 1500px, a tabela real ocupa 800px com painel em x=1110 e recupera 1192px ao fechar. Abaixo de 1200px, detalhe e galeria ampliada deste contexto entram pela parte inferior, com backdrop, rolagem interna e safe area. A galeria ampliada preserva o tema escuro do viewer existente. Escape, fechar, backdrop, foco contido, retorno de foco, resize e reduced motion foram exercitados. Seis exemplos com disponibilidade 0/0/1/2/0/1 usam dados de domínio consultados da fixture local.

## Referência e diferenças para o Penpot

Gabriel reconectou o arquivo após responder **“abri”**. Confirmado arquivo `64ee36db-f4d2-8047-8008-dbff2f7d7205`, páginas Pedidos Loti e Pedidos · Mobile. Lidos os nós dos seis detalhes desktop; exportados e inspecionados os frames 04B JBL e M07 nesta fase.

| Referência | Frame |
| --- | --- |
| JBL / 04B | `a1bbb7fd-3432-8020-8008-dc043cdce618` |
| Anker | `a1bbb7fd-3432-8020-8008-dc0d2b624202` |
| Baseus | `a1bbb7fd-3432-8020-8008-dc0d2d28483a` |
| UGREEN | `a1bbb7fd-3432-8020-8008-dc0d2c8b2c2d` |
| Fender | `a1bbb7fd-3432-8020-8008-dc0d2dadf4ce` |
| D’Addario | `a1bbb7fd-3432-8020-8008-dc0d2ed9a286` |
| M07 / detalhe inferior | `a1bbb7fd-3432-8020-8008-dc086358ee0a` |

Mantidos fonte/tokens locais e composição da F1. Disponibilidade e total recebem destaque; a origem é um link resumido separado. O domínio contém mais informação que o resumo ilustrativo: componentes de custo, pagamento, compradas, cancelamentos, pessoas, conta e destinos permanecem consultáveis. Isso aumenta a altura do conteúdo e exige rolagem interna, especialmente no mobile. O título do item usa o cabeçalho acessível do shell, em vez de repetir o nome ao lado do marcador.

O retorno “Preparar pacote”, o stepper e o CTA final Ajustar no pacote dependem da F4. Nesta fase permanece o campo numérico existente para não retirar seleção de múltiplas unidades. A conferência de chegada existente continua acessível; sua adaptação final é F6. Editar item e Registrar reembolso estão desabilitados com motivo explícito. Não são declarados novos fluxos financeiros completos. Outros surfaces legados e confirmação de exclusão QC não foram convertidos nesta fase.

**Proveniência histórica:** permanece a limitação registrada em F0–F2. As leituras anteriores observaram revisão 133 e rótulo freeze; esta reconexão confirmou nós/exports do arquivo atual, sem comprovar igualdade com o snapshot histórico. Não houve restore nem alteração no Penpot.

**Limite de fotos:** os novos previews ficam exclusivamente na seção da galeria QC do detalhe. Nenhuma foto foi adicionada à linha de Pedidos nem a Pacotes/custos. A F3 deste roadmap não habilita o gate separado de fotos em linhas operacionais do plano HubBuy QC.

## Evidências e reprodução

Prévia: **http://localhost:3143/orders?search=Seis%20exemplos**. Login sintético: `pessoa-a@loti.test`, senha `Loti-Orders-QA-Only-2026!`.

```powershell
# Compilar, se necessário
node --conditions=react-server --import tsx scripts/qa-orders-detail.ts --build
# Abrir o servidor local
node --conditions=react-server --import tsx scripts/qa-orders-detail.ts
# Repetir o QA, com o servidor de revisão parado
npx playwright test --config playwright.orders-detail.config.ts
```

O script valida a fixture F2 identificada e cria, por `VACUUM INTO`, somente `data/orders-transition-freeze-phase3-20261029.sqlite`. Na cópia, serviços existentes criam/finalizam a compra de seis exemplos e registram recebimentos/reservas sintéticos. A origem F2 permanece intacta. O marcador impede duplicação no reinício. São 33 linhas no total, incluindo as 27 da origem; nenhum dado de produção é usado. Email e credenciais externas ficam desabilitados pelo ambiente QA. Nenhuma migration de ambiente é aplicada.

| Exemplo sintético | Compradas | Recebidas | Vinculadas | Disponíveis |
| --- | ---: | ---: | ---: | ---: |
| Anker | 1 | 0 | 0 | 0 |
| UGREEN | 1 | 1 | 1 | 0 |
| Baseus | 2 | 2 | 1 | 1 |
| JBL | 3 | 3 | 1 | 2 |
| Fender | 2 | 2 | 2 | 0 |
| D’Addario | 1 | 1 | 0 | 1 |

1. Buscar Seis exemplos; selecionar JBL e abrir pelo nome/marcador/linha. Conferir disponibilidade, valores próprios e pacote vinculado.
2. Trocar para Baseus, fechar por X/Escape e verificar a lista integral com os mesmos filtros e seleção.
3. Em 390px, abrir os seis itens; percorrer a sheet, alcançar a origem e fechar. Em reduced motion a animação é removida.
4. Para o cenário de três fotos, rodar os testes QC. Eles interceptam somente o transporte no navegador com respostas e WebP sintéticos locais. A fixture persistida da prévia apresenta **sem QC**; não se importaram fotos fictícias como se fossem reais.

Capturas locais em `artifacts/qa/orders-freeze-phase3/`:

- [Detalhe desktop real](../../../artifacts/qa/orders-freeze-phase3/detail-real-desktop-1500.png)
- [Mobile claro](../../../artifacts/qa/orders-freeze-phase3/detail-light-390.png) e [desktop escuro](../../../artifacts/qa/orders-freeze-phase3/detail-dark-1500.png)
- [Seção QC sintética mobile](../../../artifacts/qa/orders-freeze-phase3/detail-qc-390.png) e [desktop](../../../artifacts/qa/orders-freeze-phase3/detail-qc-1500.png)
- [Galeria ampliada mobile](../../../artifacts/qa/orders-freeze-phase3/qc-viewer-390.png) e [desktop](../../../artifacts/qa/orders-freeze-phase3/qc-viewer-1500.png)

Há capturas claras/escuras nas nove larguras do plano (320, 360, 390, 430, 768, 1024, 1280, 1500 e 1920px). As capturas mobile, desktop e galeria foram inspecionadas visualmente. Mídia QC dos testes é uma imagem neutra sintética, sem dados sensíveis.

## Validações executadas

| Comando / área | Resultado |
| --- | --- |
| `npx playwright test --config playwright.orders-detail.config.ts` | **15 cenários passaram**, `browser-delivery.log`, 44s |
| `vitest run tests/integration/qc-services.test.ts --maxWorkers=1` | **47 testes passaram**, `qc-service-retry.log` (também passaram na primeira execução) |
| `vitest run tests/unit/qc-client-state.test.ts tests/unit/qc-preview-cache.test.ts tests/unit/qc-preview-route.test.ts --maxWorkers=1` | **16 testes passaram**, `qc-client-retry.log` |
| `npm run lint` | Passou, `lint-delivery.log` |
| `npm run typecheck` | Passou, `typecheck-delivery.log` |
| `npm run typecheck:orders-transition` | Passou, `typecheck-isolated.log` |
| `qa-orders-detail.ts --build` | Passou, `build-delivery.log` |
| Lint visual dos três arquivos de apresentação | Zero ocorrências, `design-lint-final.log` |
| `git diff --check` | Passou; somente avisos de conversão LF/CRLF |

O navegador cobre identidade, alternância, origem, ausência de writes ao consultar/selecionar, contexto preservado, retorno da largura, seis exemplos nas nove larguras, temas, foco, estados sem foto, três fotos, capa com revisão esperada, erro/reabertura da galeria, target QC adicional simulado, item fora da resposta, resize, keyframes verticais, backdrop e reduced motion. Os testes QC de transporte usam respostas simuladas; a integridade do serviço, capa e autorização é coberta separadamente pela integração existente. Não foi rodada a suíte global inteira nem a regressão E2E completa de Pacotes nesta fase. Os testes históricos de listagem foram adaptados ao novo detalhe; não se contabilizam novamente seus 14 casos como executados nesta entrega.

Falhas intermediárias e correções: build restrito apresentou EPERM e passou no retry local; o runner de um arquivo unitário perdeu um temporário e passou com TEMP/TMP locais. A primeira rodada encontrou consulta QC desnecessária para contador zero e o teste fornecia PNG onde o cache exige WebP; corrigidos sem relaxar a validação. A troca de capa recriava o disparador de foco; corrigida por identidade, com lint React passando sem desabilitar regras.

O typecheck geral encontrou sintaxe inválida em dois arquivos gerados de `.next/dev/types`. Eles foram copiados para `dev-routes.invalid.before.txt` e `dev-validator.invalid.before.txt` nos artefatos; o cache foi reparado com os tipos gerados pelo build, ajustando o caminho relativo do validator à profundidade de `.next/dev/types`. Não houve mudança de código de rota para contornar o erro. Depois, o typecheck geral passou. `next-env.d.ts`, `tsconfig.json` e `tsconfig.orders-transition.json` foram restaurados byte a byte ao início da F3.

## Arquivos e escopo

- Novos: `src/components/orders/order-detail-panel.tsx` e `.css`.
- Integração: `orders-screen.tsx`, `orders-catalog.tsx`, `orders-workspace.tsx`.
- Renderer compartilhado: `src/components/qc/qc-components.tsx`, opções aditivas de galeria/sheet e foco neste contexto.
- QA: `scripts/qa-orders-detail.ts`, `playwright.orders-detail.config.ts`, `tests/orders-detail/detail.spec.ts`; adaptação dos seletores de `tests/orders-list/list.spec.ts` ao painel.
- Documentação: seção 14 de `docs/DESIGN.md`, este relatório e registro de aprovação.

Nenhum serviço de domínio, schema, migration, autenticação, importador QC, cálculo financeiro ou tela de Pacotes foi alterado na F3. Trabalho sem commit das fases anteriores e `reset-password.sh` preexistente foram preservados. Nenhum agente auxiliar foi usado.

## Riscos, pendências e aceite

| Critério | Status / evidência |
| --- | --- |
| Item certo pelo nome/marcador/linha, dados próprios e origem separada | OK — navegador e leitura do contrato existente |
| Painel desktop integrado e largura integral ao fechar | OK — 800/1192px em 1500px, sem refresh |
| Contexto de filtros/página/seleção e foco | OK — identidade, alternância, fechamento e resize |
| QC vazio, previews, ampliação, capa e erro recuperável | OK — renderer existente, transporte sintético e 63 testes QC |
| Mobile inferior, backdrop, rolagem, foco e reduced motion | OK — nove larguras e keyframes reais |
| Igualdade comprovada com snapshot histórico | PENDENTE — limite de proveniência já registrado nas fases anteriores |
| Preparação 04A/stepper/CTA final de ajuste | PENDENTE — F4, não iniciada |
| Edição/reembolso e adaptação final de demais ações | PENDENTE — F6; controles indicam a pendência |
| Homologação com fotos reais e E2E global de Pacotes | PENDENTE — fora desta validação sintética |
| Aprovação humana da F3 | PENDENTE |

O detalhe acompanha a página/filtros atuais; não há nova consulta independente por item. Essa limitação é explícita no feedback quando a linha não está na resposta. O trabalho continua sem commits separados: eventual rollback deve preservar as alterações anteriores, sem reset global do diretório.

Gabriel aprova a Fase 3 entregue para iniciar a Fase 4 — preparação 04A, stepper e montagem — com as evidências e limites registrados?

**AGUARDANDO APROVAÇÃO DE GABRIEL PARA INICIAR A FASE 4.**
