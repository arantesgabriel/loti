# Mídia da landing — L2

Capturas produzidas em 23/10/2026 após autorização específica do responsável para preparar o novo banco local `data/landing-l2-demo-20261023.sqlite`, criar três pessoas fictícias e usar Cards mobile em uma coluna. Estado: **inspeção técnica concluída; candidata à revisão humana de L2, sem publicação autorizada**.

## Origem e fidelidade

Aplicação real do repositório, base operacional `6f0d10b67e4f22259fa5b67f4e565029d55272db`, compilada em `.next-landing-l1`; os arquivos operacionais não foram alterados nas fases de landing. Captura por Chromium em `/favorites`, após login normal da conta sintética Mariana Silva, tema claro, Cards persistido, fonte Geist carregada, escala de dispositivo 1 e movimento reduzido. Qualquer pedido externo ao localhost da demo foi bloqueado; não houve abertura de marketplace, envio de email ou acesso a R2/QC.

Dataset: Mariana Silva, Lucas Oliveira e Camila Santos; nove favoritos genéricos; três coleções; preços sintéticos e uma ausência de preço. Nenhuma compra, pacote, conta HubBuy, saldo, pagamento, refund ou galeria foi necessária. Não há dados pessoais do grupo, tokens ou credenciais nas imagens. Os pequenos marcadores de categoria pertencem à UI real; não há fotografias operacionais.

Autoria: interface e marcadores originais do Loti presentes no próprio repositório; dados e captura preparados nesta execução. Não se usaram imagens de marketplaces, avatares de terceiros ou assets externos. A fonte preserva a licença Geist existente em `src/assets/Geist-LICENSE.txt`.

## Inventário de exports

| Arquivo público local | Viewport de origem | Export | Bytes | Recorte e destino |
| --- | --- | --- | ---: | --- |
| [favorites-cards-desktop.webp](../../public/landing/favorites-cards-desktop.webp) | 1440×900 | 1440×900 WebP | 94.872 | Viewport integral, sem chrome do navegador; hero acima de 900 px. |
| [favorites-cards-mobile.webp](../../public/landing/favorites-cards-mobile.webp) | 390×844 | 390×609 WebP | 20.964 | Recorte original x=0, y=235, largura=390, altura=609; começa antes da busca e preserva Cards reais em uma coluna. Hero até 900 px. |

Desktop SHA-256: `73f410965ad5f4b33f6db561986c25fc5bbe0be687f391018e09b243acbc0071`.

Mobile SHA-256: `b175d4fc1fde94f1e1f04f6301547ea5f1748f69cf3e6b315ed04000e1ca606c`.

Os PNGs integrais, o manifesto automático com dimensões/hashes e os roteiros locais de provisionamento/captura ficam em `artifacts/qa/landing-l2/`, ignorados pelo Git. Credenciais e segredo sintéticos também permanecem somente em armazenamento local ignorado e não são reproduzidos nesta documentação.

Processamento: somente recorte retangular e export WebP de qualidade 90, sem montagem, alteração de textos, valores, colunas, controles ou conteúdo. Os exports não contêm EXIF; os originais integrais permitem conferir o recorte. A altura correta de cada fonte está declarada em HTML, sem deformar a imagem.

## Integração e revisão

Revisão solicitada pelo responsável após L2: os nomes com “Demo” foram substituídos por Mariana Silva, Lucas Oliveira e Camila Santos, mantendo identidades e dados inteiramente fictícios. As duas capturas foram regeneradas pela aplicação real; dimensões e recorte foram preservados e os bytes/hashes acima atualizados. Nenhuma migration foi executada nessa revisão.

O componente usa `picture/source`, com uma única fonte baixada por viewport; não são duas imagens escondidas por CSS. A imagem inicial tem prioridade alta. Em tablet/mobile a moldura tem largura limitada para preservar leitura. O texto alternativo descreve Favoritos, Cards, campos e dados fictícios; a legenda identifica a demonstração.

Inspeção técnica dos originais/exports e da integração: somente identidades fictícias, nenhuma credencial, token ou dado do grupo; UI autêntica; metadados privados ausentes; proporções preservadas; desktop três colunas, mobile uma. Teste com imagem atrasada preservou a altura antes/depois em 390 e 1440 px. O responsável ainda deve revisar e aceitar a seleção de capturas e a composição de L2. Não há alegação de aceite de publicação ou de auditoria completa de acessibilidade/performance.
