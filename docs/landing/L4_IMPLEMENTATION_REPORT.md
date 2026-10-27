# L4 — Transformação de Favoritos por scroll

Implementação local em 23/10/2026, na branch `feat/landing-page`. O pedido “prossiga”, após a entrega de L3 e seu próximo gate, autoriza L4 (LT35). Pronta para revisão visual humana; não representa homologação criativa ou autorização de L5/publicação.

## Resultado e escolhas

A seção Produto agora apresenta a captura real de Favoritos e três etiquetas editoriais. Em S0 elas estão dispersas; S1 aproxima, S2 alinha e S3 conserva a interface organizada com o ornamento menos presente. A composição se desfaz ao subir a página. As etiquetas se alinham na margem superior da janela: nunca entram sobre produtos, filtros ou números, nem simulam inserção/sincronização automática. A legenda explicita que cada link é salvo pelo usuário.

O tratamento usa a tipografia e os tokens locais já aprovados, cartões 2D discretos e uma pequena caixa vetorial com faces em tons foscos. Esse objeto é uma ilustração editorial original em SVG inline, sem novo bitmap, biblioteca, dependência ou requisição de mídia. Não se reutilizou o movimento orbital do login. As outras seções conservam a composição de L3, sem adicionar entradas repetidas ou loops.

No mobile há três etiquetas, trajetórias somente verticais e menores, com captura mobile real em uma coluna. A captura existente de L3 é reutilizada sem alteração de arquivo ou dados; o navegador pode reaproveitar a mesma URL na jornada seguinte. A figura mantém proporções, alt, legenda e lazy loading. O hero e seus CTAs continuam independentes da cena.

## Implementação e versão estática

`favorites-transformation.tsx` é a única ilha client nova. Recebe a figura renderizada no servidor como children. O progresso deriva da posição atual da cena na viewport, sem estado acumulado, timers ou controle de wheel/touch. O intervalo foi ajustado para começar com parte da interface já visível. A interpolação suave usa apenas transform nas etiquetas e opacity na caixa; não há alteração animada das dimensões ou dos dados da captura.

Um IntersectionObserver limita o processamento à cena visível. Eventos passivos de scroll/resize solicitam no máximo um rAF pendente, sem agendamento recursivo. ResizeObserver, carregamento de imagem e fontes recalculam a geometria. O cleanup foi inspecionado no código: cancela frame, desconecta os dois observers, remove listeners e impede execução tardia da promessa de fontes. Não foi feito teste de montagem/desmontagem isolada em um harness React.

Sem JS, o HTML/CSS já mostra etiquetas alinhadas, interface e explicação. `prefers-reduced-motion` é respeitado no CSS e no controlador JS, incluindo alteração ao vivo: cancela o frame pendente, retira estilos dinâmicos e conserva a composição estática. Nenhum ornamento é focável ou anunciado por frame. Não há sticky, scroll-jacking, autoplay, WebGL ou animação financeira.

Arquivos novos: `src/components/landing/favorites-transformation.tsx` e `transformation.module.css`. A integração altera somente `landing-outline.tsx`. Nenhum arquivo operacional, autenticação, cálculo, snapshot, tema global ou banco foi modificado nesta fase.

## Verificações locais

- Lint, TypeScript e build de produção passaram. `/landing` continua pré-renderizada, com `noindex, nofollow`; trace sem dependências de libSQL, Better Auth, Drizzle, QC ou email.
- Chromium, larguras 320, 390, 768, 1024 e 1440: amostras S0/S1/S2/S3, retorno com igualdade exata das transformações, resize cruzando breakpoint, imagem carregada e etiquetas sem sobreposição à captura. Sem overflow ou erros de página.
- Teste adicional mobile: 21 posições lentas em cada sentido com igualdade dos estados; arrasto por eventos nativos touch, PageDown e orientação horizontal. O comando inicial de gesto sintetizado do Chromium não deslocou a página; eventos touchStart/touchMove/touchEnd validaram o scroll nativo.
- Contagem instrumentada de rAF: nenhum frame contínuo no repouso ou fora da cena; nenhum novo frame da cena durante scroll com redução ativa. Mudança ao vivo para reduce e retorno à preferência normal passaram.
- Regressão: tema escuro/preferência do app preservados, contraste da jornada, ordem e responsividade das capturas, igualdade individual/grupo, âncoras, skip link, FAQ e acesso `/login`. Sem JS, figura e texto estáticos visíveis e navegação funcional.
- A visita não fez chamadas a API privada ou rede externa. `/` mantém redirect para `/favorites`; visitante anônimo continua redirecionado de `/favorites` para `/login`.
- Perfil CDP da sequência de teste: aproximadamente 0,110–0,125 s de tarefas, 0,011–0,014 s de layout e 0,0028–0,0034 s de script por viewport, incluindo os comandos de inspeção, screenshots e resize. São medições locais dessa sequência, não benchmark de dispositivo real ou promessa de FPS.
- Os 13 originais do handoff conservam SHA-256. Comparação dos arquivos preexistentes confirma alterações limitadas à integração e aos documentos de acompanhamento. Capturas e aplicação operacional intactas.

Evidências ignoradas pelo Git em `artifacts/qa/landing-l4/`: `motion.mjs`, `motion-results.json`, `input.mjs`, `input-results.json`, `smoke.mjs`, `smoke-results.json`, imagens S0–S3 por largura e versão sem JS. Revisão visual local de desktop S0 e mobile S3 confirmou a interface descoberta e a caixa discreta. Validação em aparelhos físicos e revisão criativa humana continuam pendentes.

O preview local está em `http://localhost:3121/landing`, com banco em memória e email desabilitado. Nenhuma migration, instalação, commit, push ou publicação ocorreu. L5–L7 mantêm seus gates; ferramentas públicas e cadastro não foram implementados. Rollback: retirar a ilha da seção Produto, conservando a jornada estática de L3.
