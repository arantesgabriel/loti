# Pacotes e custos — anexos V4, 20/10/2026

## Referência e escopo

O usuário autorizou os quatro SVGs e quatro PNGs de `Downloads/FireShot/V4` como referência visual definitiva, substituindo a investigação bloqueada pela cota do Figma MCP. Foram examinados os estados desktop/mobile expandidos e recolhidos. Os SVGs têm dimensões nativas de 1512 × 2304, 1512 × 848, 390 × 2426 e 390 × 876; os PNGs estão exportados em escala maior.

Aplicadas as skills frontend-design e figma-design-to-code. Usados Grid/Flexbox, Geist e componentes locais; nenhum SVG de tela foi usado como imagem de implementação. Cores extraídas incluem `#211D1B`, `#766F6A`, `#E9E4E0`, `#BA561F`, `#F7F5F3`, `#367154` e `#EAF5EE`.

## Arquivos alterados

- `src/components/packages/package-cost-detail-screen.tsx`: escopo visual local, resumo líquido, registro compacto do pagamento original, pedidos adicionais individualmente expansíveis, consulta secundária das cobranças por pacote e resumo por pessoa menos verboso. Os controles originais de método, taxa, confirmação, correção e reabertura são reutilizados.
- `src/components/packages/refunds-section.tsx`: crédito confirmado na HubBuy separado dos pagamentos; tabela de seis colunas para produto, quantidade, valor do item, custo mantido, recebido e situação; título da composição do reembolso. Formulários e operações financeiras mantidos.
- `src/components/packages/package-cost-v4.css`: hierarquia e espaçamento de cabeçalho, resumo, seções, pagamentos, tabela de reembolsos e adaptação móvel. Estilos limitados à página.
- `tests/e2e/package-costs-hybrid.spec.ts`: recebimento HubBuy sintético, verificação da apresentação separada do crédito, capturas expandidas/recolhidas e ausência de overflow nas larguras solicitadas. Confere invariância do pagamento original, taxa, total e revisão ao consultar a tela.
- `tests/e2e/package-refunds.spec.ts`: nome acessível atualizado para Produtos reembolsados.
- `tests/e2e/packages.spec.ts`: expectativas da apresentação atual da cobrança: base, taxa e total; estado confirmado permanece explícito e verificável.

## QC protegido e sem alteração

- `src/components/qc/qc-components.tsx`
- `src/components/qc/qc-import-progress.tsx`
- `src/components/qc/qc-import-progress.css`
- `src/lib/qc/storage.ts`, `preview.ts`, `image-validation.ts`, `download.ts`
- `src/lib/domain/qc-validation.ts`, `qc-services.ts`, `qc-matching.ts`, `qc-limits.ts`, `qc-http.ts`
- `src/app/api/purchases/[purchaseId]/qc/route.ts`
- `src/app/api/purchases/[purchaseId]/items/[itemId]/qc-presentation/route.ts`
- `src/app/api/qc/imports/[importId]/route.ts`
- `src/app/api/qc/images/[imageId]/route.ts` e rotas `source`, `preview`, `fallback`
- `src/components/packages/product-costs-list.tsx` e `product-costs.css`, incluindo identidade, fotos e estilos específicos QC.

As instâncias existentes de QcImportPanel e QcGalleryButton na página e nos reembolsos mantêm as mesmas propriedades e callbacks. Nenhuma alteração em schema, migrations, serviços financeiros, autorização, endpoints ou armazenamento. Não houve publicação nem escrita de dados de produção.

## Verificações

- Typecheck e lint passaram.
- Build de produção local passou. O sandbox causou EPERM na primeira tentativa; a execução local autorizada passou. O ambiente de build emitiu avisos preexistentes de Better Auth sobre secret padrão; nenhuma credencial foi alterada.
- Vitest completo: 313 passaram, 7 ignorados, 1 falhou por SQLITE_BUSY em concorrência de correções de pedidos adicionais. Reexecução isolada desse arquivo: 8/8 passaram. Não se declara uma execução completa inteiramente verde.
- Playwright do build final: passaram apresentação híbrida, solicitação/recebimento/correção/anulação, múltiplos reembolsos/residuais, pagamento/pacote/encerramento/reabertura, associação manual QC e fila QC com falha/recuperação. A capa QC passou nas primeiras execuções, mas teve uma falha posterior no seletor da capa móvel; registrada como intermitência.
- A execução final desses sete cenários terminou com seis aprovados e a falha intermitente da capa. Reexecução isolada posterior: capa QC desktop/mobile e apresentação híbrida aprovadas, 2/2 em 20,5 segundos. As capturas finais incluem scroll no topo para posicionar corretamente a navegação fixa.
- A tentativa ampla dos testes QC legados encontrou expectativas incompatíveis com o código existente: marcador esperado de 40 px contra CSS de 36 px, seletores `.qc-cost-photo-strip` e `.qc-cost-photo` ausentes e fixture de associação com opção indisponível. A tentativa foi interrompida após essas falhas. Esses testes e o sistema QC não foram refatorados.
- Serviços QC, validação, download, matching, imagem e migração estão incluídos na execução Vitest; a única falha dessa execução foi o teste de concorrência financeira descrito acima.

## Evidências visuais

Capturas em `artifacts/qa/packages-figma/`, com dados sintéticos reais da aplicação:

- `hybrid-{1440,1280,768,390,360,320}.png`
- `v4-collapsed-{1440,1280,768,390,360}.png`
- `v4-refund-expanded-{1440,1280,768,390,360}.png`
- `package-expanded-{1440,390}.png`

Capturas desktop e mobile examinadas contra os anexos: hierarquia do resumo, seções independentes, linhas financeiras, faixa de crédito e composição do reembolso. As verificações automatizadas não encontraram overflow horizontal nas larguras acima.

## Diferenças e limites preservados

- QC, navegação global e ilha móvel mantêm a implementação existente, mesmo quando os anexos mostram controles diferentes.
- Dados sintéticos têm mais produtos e pacotes que os exemplos; nomes, datas, valores e alturas resultantes variam. Não foram fixados valores ilustrativos.
- Mantidos rótulos de valor parcial, sem cobrança e residual real, incluindo principal não devolvido e taxa histórica.
- O destaque HubBuy soma apenas recebimentos confirmados com esse destino. É um resumo de recebimentos históricos BRL, não uma estimativa de saldo disponível CNY; nenhum crédito é considerado automaticamente consumido por um pedido adicional.
- A composição de refund mantém os registros e ações operacionais existentes, acrescentando conteúdo em relação ao exemplo visual. Os controles QC permanecem na posição relativa original.
- Verificação visual e de interface em Chromium; sem validação Safari/Firefox e sem acesso a armazenamento privado real. Não se afirma equivalência pixel a pixel nem que toda a suíte QC passou.

## Limpeza solicitada após revisão dos anexos

- Frete Brasil e Receita deixou de ser um dropdown. O botão de texto abre a seção Pacotes, rola até ela e transfere o foco para o cabeçalho; não apresenta seta ou lista intermediária.
- Removidos o título Registros deste produto e os cards/accordions internos dos reembolsos ativos. A composição é seguida por metadados, destino, crédito CNY, histórico de eventos e ações, em uma apresentação plana.
- Nome, proprietário, QC, bases e taxa não se repetem para um único registro. O acesso QC original permanece na identidade do produto; a instância redundante do card interno deixa de ser renderizada nesse contexto. Componentes, estilos específicos, serviços e endpoints QC não foram alterados.
- Quando existem vários registros, suas quantidades e composições individuais continuam distinguíveis. Solicitação divergente do recebido permanece explícita. Registros anulados conservam sua consulta histórica existente.
- Os testes de interface foram adaptados para verificar ações diretamente acessíveis, ausência de toggles internos e navegação/foco corretos para Pacotes.
- Validação desta revisão: lint, typecheck e build passaram; seis cenários Chromium passaram em 47,5 segundos (apresentação/navegação, ciclo completo de refund, múltiplos refunds e três cenários QC). Capturas desktop/mobile da composição plana revisadas visualmente.
