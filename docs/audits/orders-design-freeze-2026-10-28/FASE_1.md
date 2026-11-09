# Fase 1 · Fundação visual e shell — entrega para aprovação

Data: 28/10/2026. Autorização de Gabriel: **“prossiga pra fase 1”**, após a entrega da F0. Branch `feat/orders`; baseline SHA `2f547155ea31d67fa86978cca7e53329c1f05918`. Fase 2 **não iniciada**. Sem commit, PR, deploy, migration de ambiente ou mudança em serviços financeiros/QC.

## Implementado

1. **Container responsivo `OrdersWorkspace`** com cabeçalho do freeze, espaços semânticos para toolbar, navegação por etapas, conteúdo e rodapé. A tela operacional existente agora está dentro desse container, com fonte Inter Tight auto-hospedada e tokens locais. Os filtros, tabela, seleção e ações atuais mantêm sua lógica.
2. **Painel desktop integrado ao grid**, de 390px, que só cria a segunda coluna quando aberto. No harness de 1500px, a lista ocupa **1192px fechada / 800px aberta**, com painel começando em **x=1110**. Fechar devolve toda a largura imediatamente, sem refresh. Teclado Escape, foco no título e retorno ao disparador estão implementados.
3. **Base de bottom sheet** abaixo de 1200px: ancoragem inferior, raio superior de 22px, backdrop, safe areas, rolagem própria, foco contido e bloqueio de scroll pelo Radix já existente. Movimento exclusivamente vertical: deslizar (slide in), entrada 220ms e saída 160ms; nenhuma animação com reduced motion.
4. **Primitives locais** de badge semântico, feedback e botão de ícone com tooltip acessível por foco/hover, dismissível por Escape. Button, Surface, Lucide e marcadores SVG existentes são reutilizados. Não há novo slot de foto operacional nem importação QC fictícia na aplicação.
5. **Estado de painel tipado**: `closed`, `prepare`, `item-detail(itemId)`. Filtros e seleção ficam fora desse estado. A implementação conserva apenas a apresentação durante os 160ms de saída, sem duplicar dados de domínio.
6. **Retorno de foco entre breakpoints**: `Surface` recebeu somente a prop opcional `returnFocusTo`. Consumidores anteriores conservam o comportamento padrão; a base de Pedidos usa o mesmo disparador ao trocar de painel desktop para sheet. Confirmações aninhadas recebem Escape sem fechar também o painel pai.

Os painéis novos **não estão ligados a dados reais nesta fase**, conforme bloco 1.3 do roadmap. Eles são exercitados em harness sintético independente, sem rota/API dentro do produto. A tela real recebeu o container e a identidade local; a nova listagem, tabs conectadas, 04B, preparação e importador seguem nas fases 2–6. Não foram adicionados botões decorativos/inoperantes à toolbar de produção.

## Referência e diferenças para o Penpot

- Reinspecionados os nós dos frames `a1bbb7fd-3432-8020-8008-dc1025ad5d01` (fechado), `a1bbb7fd-3432-8020-8008-dc0414fc70a0` (preparação), `a1bbb7fd-3432-8020-8008-dc043cdce618` (detalhe) e `a1bbb7fd-3432-8020-8008-dc06d69dc9f7` (M03). Fonte dominante Inter Tight, títulos 29px desktop / 25px mobile, painel 22px, fundo `#F8F9FB`, borda `#E6E9EE`, acento `#E86C2C`.
- **Fonte e cores limitadas a Pedidos**; sidebar, branding, ilha mobile e outras páginas preservados. Tema escuro reaproveita tokens existentes; o freeze fornecido é claro.
- **Escopo da fase:** a tabela/filtros antigos permanecem na aplicação. A composição final de cinco colunas e os novos fluxos não são declarados prontos nesta entrega. A prévia sintética demonstra infraestrutura e estados; não representa montagem/QC funcionando.
- **Botões:** o componente existente mantém sua cor de texto com contraste, em vez de impor texto branco pequeno sobre o laranja do protótipo. Nenhuma mudança global de Button foi feita.
- **Proveniência histórica:** o MCP forneceu a revisão atual **133**, com os mesmos IDs do manifesto; o rótulo histórico foi confirmado na F0. A API não demonstrou igualdade de conteúdo com o snapshot manual. Nenhuma versão do Penpot foi restaurada ou alterada. A aprovação para F1 foi registrada sem inventar uma confirmação histórica adicional.

## Evidências e reprodução

### Prévia da infraestrutura

Servidor local disponível em **http://localhost:3141**. Não usa banco, autenticação, dados reais ou endpoints do produto. Para iniciar novamente, se estiver parado:

```powershell
node --import tsx scripts/qa-orders-foundation.ts
```

1. Em desktop, clicar Preparar pacote: a tabela contrai; fechar/X/Escape devolve largura e foco. Buscar JBL antes de abrir: a busca permanece após fechar.
2. Abrir detalhe sintético: usa o mesmo espaço de painel, com identidade de estado própria.
3. Em 390px, abrir preparação: sheet entra por baixo; testar Tab/Shift+Tab, Escape, backdrop e Alternar conteúdo longo.
4. Abrir confirmação de teste dentro do painel desktop: Escape fecha apenas a confirmação. Redimensionar para 768px e fechar: foco retorna ao disparador original.
5. O ícone da prévia é identificado como teste; não está conectado à importação real de QC.

### Tela real com fixture sintética

Build local em **http://localhost:3139/orders**. Banco já existente e identificado por manifesto como `orders-workflow-v2`: `data/orders-transition-stage5-20261028-ui-refinements.sqlite`. Nenhum seed/reset/migration foi executado para a demonstração. Login QA: `pessoa-a@loti.test` / `Loti-Orders-QA-Only-2026!`. Esses dados são somente sintéticos. Login cria a sessão de teste; o roteiro de UI não faz mutações de domínio.

O runner de verificação registrou `sidebarUnchanged: true`, zero erros JavaScript e **zero POST de warehouse/packages/QC/logistics**. Navegou Favoritos → Pedidos → Favoritos, verificou a fonte local, carregamento da lista e busca existente. Medições após a transição da sidebar, sem confundir frames intermediários de resize com overflow permanente.

| Evidência local | O que demonstra |
| --- | --- |
| `artifacts/qa/orders-freeze-phase1/desktop-closed-1500.png` | Container full-width da prévia |
| `artifacts/qa/orders-freeze-phase1/desktop-prepare-1500.png` | Painel integrado e largura restante |
| `artifacts/qa/orders-freeze-phase1/desktop-detail-1500.png` | Mesmo slot com estado de detalhe |
| `artifacts/qa/orders-freeze-phase1/mobile-prepare-390.png` | Sheet inferior, backdrop e foco |
| `artifacts/qa/orders-freeze-phase1/mobile-long-390.png` | Conteúdo longo com scroll próprio e ação alcançável |
| `artifacts/qa/orders-freeze-phase1/panel-{320,360,390,430,768,1024,1280,1500,1920}.png` | Matriz responsiva e reduced motion |
| `artifacts/qa/orders-freeze-phase1/shell-dark-{largura}.png` | Continuidade do tema escuro |
| `artifacts/qa/orders-freeze-phase1/app-orders-{320,390,768,1024,1500}.png` | Tela real, com conteúdo operacional preservado |
| `artifacts/qa/orders-freeze-phase1/app-metrics.json` | Medições da tela real, fonte, erros e isolamento da sidebar |

As capturas foram abertas e inspecionadas em desktop, 320/390px e tablet/dark. A primeira revisão encontrou fallback tipográfico inválido no harness quando não havia a variável Geist; o fallback foi corrigido e a fonte passou a ser verificada no navegador. A revisão de foco encontrou perda do disparador ao redimensionar com painel aberto; corrigida e coberta por cenário dedicado. Não há falha pendente nesses checks.

## Validações executadas

Logs locais em `artifacts/qa/orders-freeze-phase1/`.

| Comando/verificação | Resultado |
| --- | --- |
| `npm run lint` | PASSOU, exit 0; `lint-final.log` |
| `npm run typecheck` | PASSOU, exit 0, após restaurar os metadados anteriores; `typecheck-final.log` |
| `npm run build` com saída `.next-orders-transition-freeze-phase1` e configuração sintética | PASSOU, exit 0; `build-final.log` |
| `npx playwright test --config playwright.orders-foundation.config.ts` | **12/12 PASSARAM**; `browser-final.log` |
| Mesmo Playwright com `--grep 'desktop reallocates'`, após adicionar asserts geométricos exatos | **1/1 PASSOU**; `geometry-final.log` |
| Vitest direcionado, pool threads e um worker | **5 arquivos / 73 testes PASSARAM**; `regression.log` |
| Browser na aplicação final, cinco larguras e navegação de regressão | PASSOU; `app-browser-final.log` / `app-metrics.json` |
| `git diff --check` | PASSOU; avisos locais de conversão LF/CRLF não são erros de whitespace |

Vitest executado:

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/warehouse-calculations.test.ts tests/unit/qc-validation.test.ts tests/unit/qc-matching.test.ts tests/integration/warehouse-workflow.test.ts tests/integration/qc-services.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism
```

Os testes de integração usam suas próprias fixtures descartáveis. Nenhum `db:migrate` foi chamado contra o banco da demonstração ou outro ambiente. O estado inconclusivo da suíte completa na F0 continua explicitado; não se afirma que todos os testes do projeto passaram. Chromium e subprocessos de QA/build precisaram executar fora do sandbox local após problemas do runner, com revisão automática autorizando as operações locais. Nenhuma ação foi rejeitada pelo mecanismo de aprovação.

## Arquivos/áreas alterados

- `src/components/orders/orders-workspace.tsx`: container, região desktop, base mobile e primitives.
- `src/components/orders/orders-workspace.css`: tokens locais, fonte, grid, sheets e estados.
- `src/components/orders/orders-screen.tsx`: substitui somente o wrapper/cabeçalho pelo container; lógica existente intacta.
- `src/components/ui/surface.tsx`: retorno de foco opcional, preservando o padrão dos consumidores anteriores.
- `public/fonts/inter-tight/InterTight-variable.ttf` e `OFL.txt`: fonte auto-hospedada com licença SIL OFL. Origem: [Google Fonts oficial](https://github.com/google/fonts/tree/main/ofl/intertight). SHA-256 da fonte: `B81B73DCB64DF3C230CABADE7DF6C5773BF863233F24C9EE51087519F1F88B6F`.
- `scripts/qa-orders-foundation.ts`, `tests/fixtures/orders-freeze/foundation.tsx`, `tests/orders-foundation/workspace.spec.ts`, `playwright.orders-foundation.config.ts`: harness/testes separados da aplicação, sem nova rota de produto.
- `docs/DESIGN.md`, este relatório e registro de aprovação: contrato local, evidências e gate.

`next-env.d.ts`, `tsconfig.json` e `tsconfig.orders-transition.json` foram salvos antes do build e restaurados ao estado exato do início da F1. O diff preexistente de `next-env.d.ts` continua pertencendo à F0; `reset-password.sh` não foi tocado. Não houve modificação de schema, migrations, dependências, auth ou pipeline QC.

## Critérios de aceite

| Critério da F1 | Estado | Evidência |
| --- | --- | --- |
| Tokens locais e fonte do design | OK | Propriedades do Penpot + fonte carregada em Chromium |
| Container com regiões de toolbar/tabs/lista/painel/rodapé | OK | `OrdersWorkspace` e harness; apenas header/container ligados à tela atual |
| Coluna liberada quando painel fecha | OK | 1192 → 800 → 1192px em 1500px; teste geométrico |
| Painel desktop sem sobreposição | OK | Grid, bounding boxes, screenshot |
| Base mobile inferior, foco, backdrop e scroll | OK | Cenários 2 e 3 + nove viewports |
| Escape, foco restaurado e modal aninhado | OK | Testes com e sem mudança de breakpoint |
| Sem overflow horizontal inesperado | OK | Harness 320–1920 e aplicação 320/390/768/1024/1500 |
| Sidebar, temas e lógica atual preservados | OK no escopo verificado | Comparação de estilos, navegação e 73 testes direcionados |
| Nova listagem e painéis conectados a dados | PENDENTE por fase | F2, F3 e F4; não antecipados |
| Igualdade histórica do snapshot via MCP | PENDENTE de proveniência | Limitação da F0 mantida; sem restore do arquivo |
| Aprovação para F2 | PENDENTE | Aguardando Gabriel |

## Riscos, pendências e próxima fase

- A nova base foi validada isoladamente e não substitui ainda os drawers antigos de chegada/edição/QC. A migração desses fluxos ocorre nas fases autorizadas correspondentes. Não declarar “zero drawer lateral em todo o produto” com base apenas nos testes da infraestrutura.
- A tabela antiga ainda tem nove colunas e os filtros antigos; F2 fará o vertical slice da listagem sem remover informações de domínio. Não abrir a tabela antiga dentro do painel novo antes dessa adaptação.
- Os snapshots históricos e todos os cálculos continuam intocados. As decisões F5 sobre importação global/`emptyTargetsOnly` e F4 sobre revisão de conta/destino/motivo permanecem para seus gates.
- A versão histórica continua sem comparação programática. Não se atribui ao usuário uma aprovação de divergência visual que ele não deu.
- Os dois servidores locais de revisão foram deixados ativos: prévia sintética 3141 e aplicação QA 3139. Seus scripts ficam restritos ao ambiente local; não são serviços de produção. Parar com Ctrl+C no terminal que os iniciou. Não iniciar outro runner na mesma porta sem pará-los.

**Próxima fase proposta:** Fase 2, listagem, filtros e responsive com dados reais, somente após aprovação de Gabriel. Esta entrega não aprova a si própria.

**AGUARDANDO APROVAÇÃO DE GABRIEL PARA INICIAR A FASE 2.**
