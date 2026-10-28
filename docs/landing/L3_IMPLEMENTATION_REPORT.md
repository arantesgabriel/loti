# L3 — Jornada visual e responsividade

Implementação local em **23/10/2026**, autorizada por “prossiga para a L3”. Estado: **concluída tecnicamente e pronta para revisão humana**. Branch `feat/landing-page`, base `6f0d10b67e4f22259fa5b67f4e565029d55272db`. L4–L7 e publicação não foram executadas.

## Resultado

Favoritos → Compras → Pacotes e custos agora é uma jornada visual com capturas reais grandes e textos curtos. Favoritos e custos ficam claros; somente Compras recebe a faixa `#1C0113`, com a UI da captura em tema claro. No desktop, Favoritos/custos têm texto à esquerda e prova à direita; Compras inverte a composição. As capturas de custos e da seção Pacotes são figuras independentes e pertencem à mesma rodada fictícia.

Até 1100 px, a jornada usa texto antes da imagem mobile autêntica para preservar leitura. As imagens mantêm proporção e não se transformam em desktop reduzido. O hero de L2, seu CTA temporário e sua captura de Favoritos continuam preservados, com breakpoint de 900 px.

Individual e grupo agora têm dois cartões equivalentes: mesma largura, hierarquia, iconografia, três benefícios por cartão e altura equivalente no desktop; mobile os empilha com a mesma importância. Não se promete privacidade por pessoa dentro do grupo nem se cria onboarding/cadastro independente. Essa evolução de produto permanece uma frente separada.

Os textos curtos adicionais tornam explícitos o salvamento por link, a compra no site de origem, a marcação manual de itens e o registro de custos após finalização. Nenhum passo sugere scraping, sincronização, tracking ou compra automática. A estrutura editorial de ferramentas continua candidata para revisão conforme LT28; não há destinos funcionais novos ou catálogo fictício. Motion S0–S3 não foi iniciado.

## Arquivos e identidade

Novos: `manager-journey.tsx`, `use-cases.tsx`, `landing-media.ts` em `src/components/landing/`, oito exports WebP em `public/landing/` e documentação de L3. `landing-outline.tsx` integra a jornada e os cartões; `product-capture.tsx` passa a aceitar fonte/alt/legenda, breakpoint e prioridade. Somente o hero é eager/high; as quatro figuras da jornada usam lazy nativo.

O CSS Module da landing passa a permitir faixa de largura total com containers internos, sem hacks de `100vw` que causem overflow. Nenhum CSS global foi alterado. O boundary claro acrescenta surface-muted `#f5f2ee` do tema existente, contraste fixo `#1c0113`, texto sobre contraste `#fff` e secundário `#d9cdd5`; a preferência do app permanece intacta. Geist e marcadores do produto são preservados.

## Dados e prova real

O mesmo banco local descartável de L2 foi ampliado pelos serviços de domínio existentes, sem nova migration. Mariana Silva, Lucas Oliveira e Camila Santos continuam fictícios. Foram criadas uma rodada finalizada e uma próxima compra ativa, nunca duas ativas ao mesmo tempo. Finalização inicializou o acompanhamento separado normalmente; preços/fretes/taxas foram registrados pelos serviços com revisões e validações reais.

A compra ativa tem quatro unidades físicas, total de R$ 696,00 e progresso de 50%. O fone tem duas unidades e divisão igual entre Mariana e Camila; os totais pessoais não duplicam seu subtotal no total geral. A rodada finalizada calcula R$ 833,96 após os componentes manuais de custo. As bases e o estado de pagamento estão descritos no [manifesto de L3](MEDIA_MANIFEST_L3.md).

Uma comparação serializada de purchase e purchase_items antes/depois dos custos e da criação da próxima rodada confirmou o snapshot finalizado idêntico. Não houve edição direta de snapshot, cálculo ou componente operacional para ajustar a narrativa.

O capturador usou a aplicação real em localhost, login normal, tema claro, fonte carregada, viewports 1200×1000 e 390×1000. Bloqueou qualquer rede externa. Email, QC/R2 e suas configurações ficaram desativados. Apenas PNGs sintéticos locais foram recortados e exportados; não se montou UI ou mosaico fictício. O servidor de captura foi encerrado; o banco sintético permanece local, e a prévia na porta 3121 usa somente banco em memória.

## Verificações realizadas

- Lint, typecheck e build passaram. Build isolado em `.next-landing-l3`, sem dados reais ou migrations; `/landing` permanece estática e `noindex, nofollow`. Alterações automáticas de Next em tsconfig/next-env foram restauradas aos bytes preexistentes.
- Trace da rota: 148 arquivos, sem libSQL, Better Auth, Drizzle, QC ou email. Os novos componentes são estáticos e não importam WorkspaceProvider, banco, sessão ou APIs privadas.
- Chromium em **320, 390, 768, 1024 e 1440 px**: um H1, ordem semântica correta, capturas carregadas, fontes responsivas corretas, alt descritivo, proporções preservadas, zero overflow, erro JS, falha HTTP, chamada `/api/*` ou pedido externo na landing.
- Fundo de Compras medido em `rgb(28, 1, 19)`; Favoritos e custos em `rgb(250, 248, 245)`; molduras das capturas claras em `rgb(255, 255, 255)`. A inversão de lados foi conferida em desktop; texto antes da imagem, nas larguras empilhadas.
- Contraste medido: títulos claros 15,65:1 e texto secundário 6,22:1; títulos de Compras 19,75:1 e texto secundário 12,83:1. Isso verifica esses pares, não uma auditoria completa de conformidade.
- Cartões individual/grupo: mesmo tamanho de título e quantidade de benefícios; larguras e alturas equivalentes no desktop, empilhamento preservado no mobile. Conteúdo essencial não depende de interação ou animação.
- Preferência, storage e root permaneceram dark enquanto a landing se manteve clara. Reduced motion teve zero animações. Skip link moveu foco ao main, âncoras apontam a IDs existentes e sem JavaScript as imagens/conteúdo, FAQ e acesso ao login continuam disponíveis.
- `/` preserva 307 para `/favorites`; visitante sem sessão em `/favorites` preserva 307 para `/login`. Auth, finanças, refunds, QC, snapshots e rotas do produto não receberam alterações de código.
- Capturas de QA completas e de cada seção foram geradas nas cinco larguras; originais e exports foram inspecionados em desktop/mobile. Não houve pesquisa com visitantes ou declaração de compreensão validada com usuários externos.

Roteiros/evidências ignorados em `artifacts/qa/landing-l3/`: preparação sintética, inventário de hashes, estado numérico, originais, export/manifesto de mídia e smoke/results. Não se executou a suite integration/E2E do produto ou seu provisionador. Não houve instalação, migration remota, segredo novo em serviço externo, commit, push, PR, preview hospedado ou deploy.

O inventário SHA-256 dos 465 arquivos preexistentes encontrou alterações somente nos sete caminhos previstos: três documentos de controle, CSS Module de marketing e três arquivos da landing. Os 13 originais recebidos e os exports do hero de L2 permaneceram íntegros; os oito novos exports de L3 conferem com seu manifesto. Alterações locais preexistentes em auth report, tsconfig, planning e reset-password foram preservadas.

## Limites e próximo gate

Revisar composição, recortes, equivalência individual/grupo e sequência da jornada. **L4 requer autorização explícita própria** para transformar a base estática em S0–S3 reversível por scroll, com reduced motion equivalente. Ferramentas, conversão pública e SEO factual continuam com os gates posteriores; não se declara candidato de release pronto.

Rollback visual consiste em restaurar apenas as alterações de landing e remover os novos componentes/exports de L3. Nenhum dado real ou configuração precisa ser revertido. O dataset local deve ser preservado ou descartado somente pelo procedimento autorizado, sem rollback de banco para desfazer uma página editorial.
