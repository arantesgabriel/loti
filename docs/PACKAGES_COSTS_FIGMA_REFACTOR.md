# Pacotes e custos — refatoração Figma

Referência: arquivo `tEJXHLbnQegfBbFG8VfqMz`, página `11:2`. Inspecionados via MCP os frames finais `31:2`/`31:359`, Auto Layout `24:2`/`24:247` e recolhidos `19:2`/`14:158`.

## Investigação e plano

- `package-cost-detail-screen.tsx` coordena carregamento, revisão, mutações e drawers. Manter esses contratos e separar Produtos e custos de Pagamentos e reembolsos.
- Extrair a apresentação dos produtos: tabela de seis colunas no desktop e lista compacta no mobile, ambas com composição contextual e ações existentes.
- `additional-orders-panel.tsx` já integra adicionais com pagamento próprio e associação; preservar o trabalho local e seus snapshots.
- `refunds-section.tsx` mantém solicitação, recebimento, correção e anulação. Reutilizar dentro da seção financeira; abrir a seção ao solicitar pela linha.
- `package-cost-reading.ts` fornece cálculos, participantes, cobranças e refunds. `package-cost-calculations.ts` continua sendo a origem dos valores; nenhuma alteração em serviços financeiros, APIs ou schema.
- `package-cost-presentation.ts` orienta próxima tarefa; adaptar apenas destino e resumos à nova arquitetura.
- Reutilizar Geist, tokens de fundo/superfície/borda/laranja/verde, Button, Avatar, Surface e marcadores internos. Espaços de 8/12/16/24 px, valores tabulares e alinhados à direita.
- CSS próprio da tela para a nova composição, sem alterar a navegação global. Comparar capturas com Figma em 1440/1280/768/390/360/320 px, testar expansão, ações e regressão financeira.

## Divergências de domínio preservadas

- O mockup mostra produto reembolsado excluído do total. Exibir o custo líquido residual real, inclusive taxa e principal não devolvido, sem forçar zero.
- Pagamento original não inclui pedidos adicionais. Estes mantêm os próprios pagamentos e detalhamento financeiro.
- Valores pendentes não são zero; sem cobrança permanece explícito. Dados ilustrativos do Figma não entram no app.
- Fotos e definição de capa continuam exclusivamente na galeria QC. Não habilitar Phase 3, nem trocar a navegação existente pelo menu ilustrativo do Figma.

## Entrega local — 19/10/2026

Skill `frontend-design` instalada de `anthropics/skills`, lida e aplicada junto com `figma-design-to-code`. Os seis frames indicados foram consultados pelo MCP; os renders dos frames finais desktop/mobile orientaram a comparação visual.

Arquivos desta refatoração:

- `src/components/packages/package-cost-detail-screen.tsx`: quatro seções independentes, próxima tarefa com expansão/foco corretos, valores pessoais alinhados e associação de produto original usando a operação de alocação existente.
- `src/components/packages/product-costs-list.tsx`: identidade, tabela/lista, situação, expansão, composição, ações e toolbar dos produtos originais/adicionais. Linhas totalmente canceladas continuam consultáveis com seu residual real.
- `src/components/packages/product-costs.css`: estilos da composição híbrida, métricas financeiras, controles agrupados, pessoas e adaptação mobile.
- `src/components/packages/refunds-section.tsx`: lista de operações diretamente visível dentro da seção financeira, sem um segundo resumo que escondia os registros. A instância permanece estável durante solicitação/recebimento para preservar expansão e dialogs.
- `src/lib/domain/package-cost-presentation.ts`: destinos de próxima tarefa separados para pagamentos e contagem de produtos/participantes incluindo adicionais registrados; nenhuma fórmula financeira alterada.
- `tests/e2e/package-costs-hybrid.spec.ts`: novo cenário sintético de cinco produtos, completo/parcial, zero legítimo, sem cobrança, reembolso residual, QC, associação/cancelamento, leitura sem gravação e todas as larguras solicitadas.
- `tests/e2e/packages.spec.ts`, `package-refunds.spec.ts`, `hubbuy-balance.spec.ts`, `hubbuy-qc.spec.ts` e `tests/unit/package-cost-presentation.test.ts`: adaptação dos seletores, destinos e expectativas à arquitetura nova. A fixture de encerramento conserva o pacote com histórico de conteúdo e resolve suas obrigações como sem cobrança.

Preservadas as alterações que já existiam no início em `additional-orders-panel.tsx`, `globals.css`, decisões/planos e na integração dos pedidos adicionais. Nenhuma alteração nos serviços financeiros, cálculos centesimais, endpoints, schema ou migrations. Pagamento original, taxa capturada, refunds, direitos CNY, snapshots finalizados e autorização continuam nos contratos existentes.

## Verificações executadas

| Verificação | Resultado |
| --- | --- |
| TypeScript | Passou (`npm run typecheck` e TypeScript do build) |
| ESLint | Passou sem avisos |
| Vitest completo | 290 passaram, 7 ignorados; 40 arquivos passaram e 1 ignorado |
| Build Next.js de produção | Passou |
| Playwright Chromium selecionado | 6 cenários passaram em 53 segundos |
| Responsividade | 1440, 1280, 768, 390, 360 e 320 px, sem overflow horizontal |
| Estado e dinheiro | Expansão e leitura não alteram revisão/total; pagamento e taxa originais idênticos após refund, leitura e associação |
| `git diff --check` | Passou |

Comando da suíte Vitest: `npm test -- --maxWorkers=1 --no-file-parallelism --no-isolate --pool=threads --testTimeout=45000`.

Os seis cenários Playwright selecionados foram: compra finalizada → pagamento/pacote/encerramento/reabertura; solicitação/recebimento/correção/anulação; múltiplos refunds e encerramento; conta HubBuy/pedido adicional; fila de importação QC com erro/recuperação; nova apresentação híbrida. Não se afirma execução de toda a suíte E2E do repositório.

A validação usou build de produção **local**, `LOTI_E2E_PRODUCTION=1` e bancos novos `file:./data/e2e-refunds-figma-*.sqlite`, com serviços QC simulados. O sandbox inicialmente impediu a criação de diretórios do Next (`EPERM`); o build local passou com a permissão de execução aprovada. Não houve publicação, configuração externa, migration remota ou escrita de dados reais. Nenhuma migration nova é necessária para esta refatoração.

## Evidências e limites

Capturas em `artifacts/qa/packages-figma/`: `hybrid-{1440,1280,768,390,360,320}.png`, `package-expanded-{1440,390}.png` e `collapsed-320.png`. Revisadas visualmente contra os renders finais do Figma; a correção mobile mantém rótulos acima dos valores, evitando compressão vertical do texto. As capturas estáveis usam movimento reduzido; os fluxos existentes também foram exercitados com as transições normais.

As ações e os dados reais exigem mais conteúdo que o exemplo ilustrativo do Figma: metadados, pagamentos de adicionais, edição, controles de refund e histórico permanecem disponíveis. Os exemplos não viraram dados da aplicação. Limite da validação visual automatizada: Chromium; não foi realizada validação manual em Safari/Firefox ou publicação.

## Cabeçalho atualizado — 19/10/2026

Aplicada a revisão do frame `31:2`, grupo `36:24` (**REFATORADO / Cabeçalho clean**), consultado novamente pelo Figma MCP. Título e status ficam juntos; importação por ícone e menu QC ficam à direita. Data e quantidades ocupam uma linha discreta. Autor/data da atualização ficam no rodapé à esquerda, com gerenciamento de contas à direita. A conta utilizada continua visível quando informada. Em telas pequenas, os grupos quebram sem posicionamento absoluto ou corte de conteúdo.

- `package-cost-detail-screen.tsx`: cabeçalho semântico e metadados reais; horário da atualização explicitamente em America/Sao_Paulo.
- `purchase-cost-header.css`: composição desktop/mobile e hierarquia do resumo líquido, usando Geist e os tokens existentes.
- `qc-components.tsx`: opção de apresentação compacta, com nome acessível e tooltip **Importar QC**; autorização, importação, pendências e menus permanecem iguais.
- `public/icons/qc-import.svg`: ícone local do Figma, com suas dimensões originais de 19 × 19 px.
- `package-costs-hybrid.spec.ts`: verificações de alinhamento, asset/geometry e controles QC, além das capturas `header-{1440,1280,768,390,360,320}.png`.

Validação desta etapa: typecheck e lint passaram, build de produção local passou e **3 cenários Chromium passaram em 28,8 segundos** (apresentação híbrida nas seis larguras; fila/importação QC; pagamento/pacote/encerramento/reabertura). Renders inspecionados visualmente em desktop e mobile. Nenhuma alteração em cálculos, dados reais ou produção. A contagem de unidades canceladas mantém o significado do domínio; não foi renomeada indiscriminadamente para unidades reembolsadas como no exemplo ilustrativo.
