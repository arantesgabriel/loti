# L2 — Base visual, conteúdo e mídia demo

Execução local em **23/10/2026**, autorizada por “prossiga para l2”. O responsável autorizou separadamente o banco demo novo e Cards mobile em uma coluna, conforme [plano e registro](L2_DEMO_PLAN.md). Estado: **implementação e verificações técnicas concluídas; candidata à revisão do responsável**. L3–L7 e publicação não foram iniciadas.

## Entrega

- Header com marca Loti, Produto/Como funciona/Ferramentas por âncoras reais e Entrar → `/login`. No mobile a navegação permanece disponível sem menu dependente de JavaScript.
- Hero central com H1 e apoio do Anexo C, CTA temporário **Acessar Loti** → `/login`, chamada secundária para a seção editorial de ferramentas e captura autêntica ampla de Favoritos Cards.
- Mídia responsiva real: desktop três colunas; mobile uma coluna, com recorte que começa na busca para revelar os Cards mais cedo. Bordas discretas, sombra leve e nenhuma UI inventada. Origem, tratamento, hashes e revisão no [manifesto](MEDIA_MANIFEST.md).
- Módulo de conteúdo independente, estrutura estática de transformação, jornada, individual/grupo, ferramentas, FAQ inicial factual e encerramento; rodapé sem links legais, preços, depoimentos ou números inventados.
- Skip link, um H1, regiões semânticas, FAQ nativo `details/summary`, foco e links utilizáveis sem JavaScript.

Arquivos em `src/components/landing/`: `landing-header.tsx`, `landing-hero.tsx`, `product-capture.tsx`, `landing-outline.tsx`, `landing-footer.tsx`, `landing-content.ts`, composição em `landing-page.tsx` e CSS Module próprio. Os únicos ajustes fora desse diretório são o mapa de tokens no CSS Module de marketing, os dois exports em `public/landing/` e esta documentação.

## Escopo editorial e fases posteriores

Esta é a base estática de L2. A jornada ainda é uma estrutura textual; suas capturas dominantes alternadas, a faixa `#1C0113` somente em Compras e a composição completa dos contextos entram em L3. Nenhuma dessas entregas foi declarada pronta. S0–S3, soft 3D e motion ficam para L4, sem autoplay ou dependência nova nesta fase.

A estrutura editorial de ferramentas segue a decisão explícita LT28 de construir a versão completa antes de disponibilizá-las. A âncora leva à seção, **não a uma ferramenta funcional**. Não há catálogo inventado, calculadora falsa, resultado simulado, endpoint, link morto ou chamada “em breve”. Sua integração e o aceite factual permanecem bloqueios de L5/publicação. Não foi criada uma versão reduzida de lançamento.

O CTA candidato “Acessar Loti” reflete o destino temporário aprovado; o header preserva “Entrar”. O texto “Criar conta grátis” não é usado como se cadastro público estivesse disponível. A FAQ inicial usa a resposta factual de organização do Anexo C e uma pergunta sobre execução manual das compras; perguntas condicionais sobre gratuidade e ferramentas serão finalizadas em L5. Copy e composição novas continuam sujeitas à revisão humana, sem editar as fontes recebidas. O fluxo de espaço individual independente não foi implementado ou demonstrado.

## Identidade e tema

Geist local e paleta clara atual mantidas. Ao mapa de L1 foram adicionados somente border `#e9e4df`, border-control `#998b80`, border-emphasis `#d8cec6` e shadow-menu `rgb(28 1 19 / .08)`, com os mesmos valores de `theme.css`. O símbolo da marca usa o laranja existente; títulos, copy e superfícies permanecem neutros. As cores de hover/secundário antigas do briefing não substituem os tokens atuais.

Nenhum estilo global ou preferência do browser foi alterado. Na revisão visual, o summary da FAQ herdava laranja do produto; o CSS local foi corrigido para texto principal. O tema claro da landing continua local mesmo quando o app está em dark.

## Ambiente e dados

O provisionamento foi executado somente depois da autorização específica. Aplicou as migrations existentes ao novo arquivo `data/landing-l2-demo-20261023.sqlite`, com recusa de arquivo pré-existente. Não gerou migration nem mudou schema. Criou três contas sintéticas, nove favoritos e três coleções pelos serviços existentes; Cards foi persistido para cada pessoa. Nenhum dado financeiro ou QC foi criado.

As capturas usaram uma instância localhost separada e o build operacional de L1. Email e R2/QC foram desativados, a conexão recebeu o URL local explícito e a rede externa foi bloqueada pelo capturador. O seed geral e o harness E2E do projeto não foram executados. Os roteiros e credenciais permanecem ignorados em `artifacts/qa/landing-l2/`; a landing só recebe os WebPs inspecionados. O banco demo fica local para rastreabilidade/reutilização autorizada; não houve exclusão de dados.

## Verificações

- `npm run lint`, `npm run typecheck` e `npm run build` passaram. Build isolado em `.next-landing-l2`, com banco em memória, segredo sintético, token vazio e email desativado; `/landing` continua pré-gerada como estática. Os ajustes automáticos do Next em `tsconfig.json` e `next-env.d.ts` foram restaurados aos bytes preexistentes.
- O trace de servidor da rota contém 148 arquivos e nenhuma dependência libSQL, Better Auth, Drizzle, QC ou email. Os novos componentes não importam sessão, WorkspaceProvider, banco, domínio ou APIs privadas.
- Chromium em 320/390/768/1024/1440 px: HTTP 200, um H1/main, Geist, `noindex, nofollow`, sem overflow, erros JS, falhas HTTP, requests externos ou chamadas `/api/*` na landing.
- Cada largura baixou somente o WebP correspondente: mobile até 900 px; desktop nas larguras maiores. Dimensões/proporções corretas; os arquivos têm 94.872 e 20.964 bytes. Nenhum original de trabalho ou credencial é servido pela página.
- Imagem atrasada: a altura reservada manteve-se exatamente em 530,92 px no viewport 390 e 828,75 px no viewport 1440, antes/depois do download. Isso verifica a reserva de espaço da mídia, não um resultado global de CLS/CWV.
- Cores medidas no navegador: texto secundário/fundo 6,22:1, FAQ/fundo 15,65:1 e texto/botão primário 6,85:1. Não se declara uma auditoria completa de conformidade.
- Preferência/storage/root permaneceram dark, enquanto a landing continuou clara nas cinco larguras. Reduced motion não apresentou animações. Skip link transferiu foco ao main; Tab/Enter, foco de summary, expansão da FAQ e CTA ≥44 px funcionaram. As âncoras apontam para IDs existentes.
- Sem JavaScript, FAQ e acesso ao login continuaram funcionando. `/` permanece HTTP 307 para `/favorites`; nenhum arquivo de autenticação ou rota operacional foi alterado.
- QA visual de hero e página completa em desktop/mobile, com evidências também nas demais larguras. Não foram executados o conjunto integration/E2E do produto ou operações financeiras reais.

Evidências locais: `artifacts/qa/landing-l2/smoke.mjs`, `smoke-results.json`, `capture.mjs`, `capture-manifest.json`, PNGs integrais/QA e inventário de hashes. A validação de localhost/build precisou de execução fora do sandbox; não houve rejeição de aprovação. Não houve instalação, serviço externo, migration remota, commit, push, PR, preview hospedado ou deploy.

O inventário SHA-256 dos 454 arquivos preexistentes encontrou alterações somente nos seis caminhos previstos de landing: README, plano de fases, decisões, CSS do boundary, composição e CSS da página. Os 13 originais do manifesto de fontes continuam íntegros. Alterações preexistentes em auth report, tsconfig, planning e reset-password foram preservadas. O servidor de captura na porta 3122 foi encerrado; a prévia editorial local permanece na porta 3121, usando somente banco em memória.

## Próximo gate

Revisão posterior solicitada pelo responsável: nomes do dataset e capturas alterados para Mariana Silva, Lucas Oliveira e Camila Santos, sem o sufixo “Demo”. As imagens foram recapturadas, inspecionadas e registradas no manifesto, mantendo os recortes e o caráter sintético. Não houve nova migration ou mudança no aplicativo operacional.

Revisar header/hero, rótulo temporário do CTA, conteúdo candidato e [capturas](MEDIA_MANIFEST.md). **L3 precisa de autorização explícita própria.** Capturas de Compra atual/Pacotes e custos exigem ampliar o dataset sintético, incluindo os estados coerentes de uma compra ativa e outra finalizada, sem dados reais ou alterações de snapshots. L2 não autoriza essa próxima execução por consequência.
