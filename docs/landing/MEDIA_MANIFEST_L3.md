# Capturas da jornada — L3

Produzidas em **23/10/2026** na execução de L3, autorizada por “prossiga para a L3”. Estado: inspeção técnica concluída e candidata à revisão humana, sem publicação autorizada. O [manifesto de L2](MEDIA_MANIFEST.md) continua válido para o hero; seus arquivos não foram alterados nesta fase.

## Origem

Aplicação operacional real da base `6f0d10b67e4f22259fa5b67f4e565029d55272db`, compilada em `.next-landing-l1`, sem alterações nos componentes do produto. Mesmo banco local sintético de L2, ampliado com os serviços existentes: Mariana Silva, Lucas Oliveira e Camila Santos; uma compra ativa, uma finalizada e seu acompanhamento separado de custos. Não foram usadas identidades, credenciais, pedidos ou valores reais do grupo.

Login normal em localhost, tema claro, fonte Geist carregada, escala de dispositivo 1 e movimento reduzido. Viewports de captura: desktop **1200×1000** e mobile **390×1000**. Favoritos desktop usa as duas colunas reais dessa largura; o hero de L2 mantém sua captura própria de três colunas. Mobile usa a interface de uma coluna, sem desktop miniaturizado. Rede fora do localhost foi bloqueada; email, QC e R2 permaneceram desativados.

Somente marcadores SVG operacionais, sem fotos de produtos. Autoria da interface, marcadores e ícones: materiais do próprio Loti e suas dependências já presentes; dados e capturas preparados nesta execução. Nenhum asset externo ou licença nova foi introduzido. Fonte Geist mantém a licença existente no repositório.

## Exports e recortes

| Arquivo em public/landing/ | Dimensões | Bytes | Origem do recorte |
| --- | --- | ---: | --- |
| [journey-favorites-desktop.webp](../../public/landing/journey-favorites-desktop.webp) | 880×590 | 38.346 | Viewport 1200×1000, x=280, y=190. Busca e quatro Cards reais. |
| [journey-favorites-mobile.webp](../../public/landing/journey-favorites-mobile.webp) | 390×610 | 19.496 | Viewport 390×1000, x=0, y=240. Busca, coleção e Cards de uma coluna. |
| [journey-purchase-desktop.webp](../../public/landing/journey-purchase-desktop.webp) | 880×710 | 41.310 | Viewport 1200×1000, x=280, y=32. Cabeçalho, total/progresso, participantes e primeiro grupo. |
| [journey-purchase-mobile.webp](../../public/landing/journey-purchase-mobile.webp) | 350×810 | 34.134 | Viewport 390×1000, x=20, y=99. Compra mobile real e item compartilhado. |
| [journey-costs-desktop.webp](../../public/landing/journey-costs-desktop.webp) | 880×815 | 47.076 | Viewport 1200×1000, x=280, y=110. Compra finalizada, custo total e tabela real dos produtos. |
| [journey-costs-mobile.webp](../../public/landing/journey-costs-mobile.webp) | 350×740 | 26.410 | Viewport 390×1000, x=20, y=171. Cabeçalho, total e custos mobile. |
| [journey-packages-desktop.webp](../../public/landing/journey-packages-desktop.webp) | 880×198 | 10.150 | Captura integral da seção real Pacotes da mesma rodada. |
| [journey-packages-mobile.webp](../../public/landing/journey-packages-mobile.webp) | 350×285 | 7.918 | Captura integral da seção mobile real Pacotes. |

Os oito exports somam **224.840 bytes**, incluindo as duas variantes. A visita usa apenas a variante selecionada de cada figura; as quatro figuras da jornada carregam nativamente sob demanda. Os PNGs de origem e dados completos de recorte ficam em `artifacts/qa/landing-l3/`, ignorados pelo Git. Os hashes completos e a inspeção estão no [inventário JSON](MEDIA_MANIFEST_L3.json).

Processamento limitado a recorte retangular e export WebP qualidade 90, sem EXIF. Não houve montagem de Cards, alteração de números, remoção de controles ou reconstrução de telas. As capturas de custos e de Pacotes aparecem em **duas figuras separadas**, cada uma com legenda; não simulam uma única tela recomposta.

## Coerência dos exemplos

- “Próxima compra”: três produtos físicos, quatro unidades e três participantes; total R$ 696,00. Tênis e teclado estão adicionados, enquanto duas unidades de fone compartilhado permanecem pendentes: progresso 50%. O total por pessoa é R$ 318,00, R$ 249,00 e R$ 129,00, sem multiplicar o item compartilhado no total físico.
- “Compra de outubro”: outra rodada, já finalizada, com os mesmos exemplos de produto e bases físicas. Produtos R$ 696,00; China R$ 40,00; taxa Pix dos produtos R$ 7,36; frete Brasil R$ 60,00 e taxa R$ 0,60; Receita R$ 30,00. Total calculado R$ 833,96. Produtos e frete têm confirmação manual fictícia; Receita permanece conhecida e ainda não paga, coerente com “1 custo pendente”.
- O pacote está em preparação, com quatro unidades distribuídas. Não há tracking automático, recebimento real, transferência ou pagamento executado pelo Loti.
- O snapshot da rodada finalizada foi comparado antes/depois dos registros de custo e da criação da próxima compra e permaneceu idêntico. O hero de L2 representa um momento anterior; o recorte de Favoritos em L3 já mostra os itens selecionados como “Na compra”.

## Revisão e integração

Originais e exports inspecionados; nenhuma identidade do grupo, token, senha, saldo ou imagem privada. As seleções de foto da jornada vêm de `picture/source`, com dimensões explícitas e proporções originais. Até 1100 px, a jornada empilha texto e imagem mobile; acima disso, alterna texto/imagem no desktop. O hero preserva seu breakpoint de 900 px. Alt e legendas descrevem a condição de cada exemplo, distinguindo compra ativa, rodada finalizada e etapas manuais.

QA visual e automatizado em 320/390/768/1024/1440 px verificou carregamento, proporções, leitura, contraste e ausência de overflow. A revisão humana da seleção das imagens e a aprovação da composição de L3 continuam sendo o próximo gate. Nenhuma publicação ou aceite completo de performance/acessibilidade é presumido.
