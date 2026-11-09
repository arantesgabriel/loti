# L5 — Conversão, ferramentas, FAQ e metadados

Implementação local em 23/10/2026, branch `feat/landing-page`. Autorização: “prossiga para a l5”. Durante a execução, o responsável confirmou os cinco nomes e determinou que os links levassem aos paths definitivos, com páginas próprias e cuidadas de **Em construção** (LT36–LT37). Essa decisão substitui a restrição anterior de integrar somente ferramentas já operacionais, para permitir as páginas de apresentação explicitamente solicitadas. Não autoriza desenvolver calculadoras nem publicar.

## Entrega

A landing agora apresenta as cinco ferramentas em uma faixa editorial clara, com ícones funcionais, descrição curta e links reais. O catálogo está em `landing-tools.ts`; `ToolsList` é compartilhada com a página `/ferramentas`. O CTA secundário do hero abre esse catálogo. A navegação da landing mantém a âncora da seção para descoberta local. A conversão principal, o cabeçalho e o rodapé mantêm `/login`, sem alegar cadastro aberto.

Cada ferramenta tem uma página estática própria com seu nome, ícone, mensagem de construção e caminhos para outras ferramentas ou para conhecer o Loti. Não há formulário, calculadora fictícia, progresso inventado, captura de email ou promessa de data. A página do catálogo e o FAQ esclarecem a indisponibilidade atual. Os links usam Next Link sem prefetch; continuam âncoras funcionais sem JavaScript. Os paths abaixo são o contrato local adotado, para futura substituição do conteúdo pelas ferramentas.

| Nome confirmado | Path | Situação atual |
| --- | --- | --- |
| Simulador de Custo Final | `/ferramentas/simulador-de-custo-final` | Página própria de construção |
| Calculadora de Impostos | `/ferramentas/calculadora-de-impostos` | Página própria de construção |
| Conversor de Moedas | `/ferramentas/conversor-de-moedas` | Página própria de construção |
| Calculadora de Rateio | `/ferramentas/calculadora-de-rateio` | Página própria de construção |
| Tabela de Referências | `/ferramentas/tabela-de-referencias` | Página própria de construção |

O acesso às seis páginas novas é anônimo e não depende de banco. `generateStaticParams` pré-renderiza somente os cinco slugs; `dynamicParams = false` e `notFound()` recusam nomes desconhecidos. Todos ficam dentro do boundary claro de marketing, sem mudar o tema do gerenciador.

## FAQ e verdade funcional

`landing-faq.tsx` conserva details/summary nativos. As seis respostas cobrem acesso por conta/convite, organização, itens pessoais e compras em grupo, compra manual no site de origem, registro manual de custos e páginas públicas de ferramentas ainda em construção. Não se promete workspace independente, gratuidade permanente, Pro, cadastro público, câmbio automático ou tracking.

| Texto/ação | Prova local | Destino/resultado |
| --- | --- | --- |
| Acessar Loti / Entrar | Página existente de login; signup público desabilitado em `src/lib/auth/config.ts` | `/login`, HTTP 200 anônimo |
| Explorar ferramentas gratuitas | Catálogo público de apresentação autorizado, ainda sem cálculos | `/ferramentas`, HTTP 200 anônimo |
| Cinco ferramentas | Catálogo confirmado pelo responsável | Cinco páginas HTTP 200, com Em construção |
| Novos participantes por convite | Fluxo de convites existente, sem expor token | FAQ; nenhum convite criado ou aceito nos testes |
| Custos informados manualmente | Serviços e provas reais já registrados em L3 | FAQ; nenhum cálculo operacional alterado |

O catálogo de expansão encontrado em `planning/expansao-2026-10-21/02_MATRIZ_E_REQUISITOS.md` forneceu contexto; a resposta direta nesta tarefa fixa os nomes apresentados e autoriza o estado de construção. A redação é candidata local, sem reescrever os originais do Copy Deck.

## SEO local e compartilhamento

O domínio `https://useloti.com` vem de `docs/13_DEPLOYMENT.md`. A landing usa o título absoluto proposto no Anexo C, descrição sem ferramentas/planos não disponíveis, canonical de `/landing`, Open Graph website/pt_BR e Twitter summary_large_image. Os canonicals das páginas de ferramentas apontam para seus paths no mesmo domínio. São metadados preparados localmente; não foi feita requisição ou alteração no site publicado. Ao promover a landing para `/` em L7 será necessário revisar canonical e OG URL para a URL final.

`public/landing/social-card.png` é uma composição editorial original 1200×630, com Geist local, marca, headline e domínio. Não inclui UI, dados sintéticos de membros, tokens ou IDs. Renderizada localmente com Chromium, sem rede; PNG de 37.005 bytes, SHA-256 `321F0EBA1B418122E5E21A15B713D6BEB5234E5D1463A745C1D57263B1598A8D`. O script reproduzível fica em `artifacts/qa/landing-l5/create-social-card.mjs`. A tentativa inicial com ImageResponse não suportou a fonte WOFF2; o export final usa a mesma fonte do produto via navegador.

`noindex, nofollow` permanece na landing, catálogo, páginas de construção e rotas de autenticação. Não foram adicionados sitemap, robots globais, JSON-LD, analytics ou metadata global. Os metadados de marketing não são herdados por login/recuperação.

## Validação e limites

Evidências de testes e screenshots ficam em `artifacts/qa/landing-l5/`, ignorado pelo Git. O preview usa banco em memória, email desabilitado e nenhum alvo real. Resultados finais:

- Lint, TypeScript e build passaram. Landing e catálogo estáticos; cinco páginas de construção geradas por SSG. Os três traces de marketing têm 151 arquivos cada, sem libSQL, Better Auth, Drizzle, QC ou Resend.
- `content.mjs`: todos os hrefs locais válidos; destinos anônimos HTTP 200, seis FAQs abrem/fecham por Enter/Space, navegação sem JS, canonical/OG/Twitter e PNG 1200×630 corretos. Login, recuperação, redefinição e verificação preservam noindex e não recebem canonical/imagem da landing.
- `tools.mjs`: os cinco nomes/paths verificados em 320/390/1440 px, sem overflow, erro de página ou chamada a API privada. Links de ida/volta funcionam com e sem JS. Não há input/formulário/botão simulando uma calculadora. Slug desconhecido retorna HTTP 404.
- `smoke.mjs`: regressão passou em 320/390/768/1024/1440 px, com capturas reais carregadas, ordem da jornada, faixa escura, contraste, hierarquia individual/grupo, tema/preferência preservados, âncoras, skip link, FAQ e rotas privadas. A visita não fez chamadas privadas nem externas. `/` continua redirecionando para `/favorites`, que leva o visitante anônimo a `/login`.
- `navigation-cleanup.mjs`: dois ciclos de navegação client entre landing e ferramenta, com o mesmo documento preservado. Ambos os observers da transformação são desconectados ao sair, e exatamente um par é criado ao voltar. Isso complementa a inspeção de cleanup registrada em L4.
- Revisão visual dos screenshots de construção mobile e seção de ferramentas desktop confirmou mensagem legível, navegação clara e identidade preservada. A imagem social foi inspecionada em 1200×630.
- Os 13 originais do handoff preservam SHA-256. Comparação do baseline de arquivos preexistentes confirma somente quatro arquivos de implementação de marketing e três documentos de acompanhamento alterados, além dos arquivos novos desta fase. Arquivos operacionais, capturas anteriores, configurações e mudanças preexistentes foram preservados. `git diff --check` passou.

O preview final está disponível em `http://localhost:3121/landing`, com catálogo em `http://localhost:3121/ferramentas`. A revisão criativa humana continua pendente; estes testes não substituem L6 nem comprovam operação das ferramentas finais.

L5 entrega apresentação, navegação, construção autorizada e metadados para revisão. As ferramentas ainda não fazem cálculos/consultas, e o cadastro público continua externo ao escopo. O aceite técnico das páginas de construção não comprova disponibilidade das ferramentas finais nem liberação de lançamento. L6 e L7 mantêm autorização própria. Nenhuma migration, instalação, commit, push, configuração remota ou publicação foi executada.
