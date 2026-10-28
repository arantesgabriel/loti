# L2 — Ambiente e dataset de demonstração

Plano preparado em 23/10/2026 após a autorização de avançar a L2. A preparação do schema requer confirmação específica, conforme a sequência de [L2](PHASED_IMPLEMENTATION_PLAN.md#l2--base-visual-conteúdo-e-demonstrações-seguras). Nenhum banco de trabalho ou produção é reutilizado.

## Alvo proposto

- Novo banco local: `file:./data/landing-l2-demo-20261023.sqlite`. A existência prévia do arquivo causa recusa; não há sobrescrita ou limpeza automática.
- Aplicar exclusivamente as migrations existentes em `drizzle/` nesse alvo novo. Não gerar nem alterar schema/migrations. Sem banco remoto, credencial real ou alteração de infraestrutura.
- Três contas sintéticas: Mariana Silva, Lucas Oliveira e Camila Santos; emails `pessoa-a@loti.test`, `pessoa-b@loti.test`, `pessoa-c@loti.test`. Credenciais e segredo são gerados aleatoriamente e ficam somente em arquivo local ignorado pelo Git, sem impressão no terminal ou inclusão em mídia.
- Nove favoritos: tênis, teclado, fone, camiseta, SSD NVMe, moletom, mouse, sandália e controle. Preços de exemplo entre R$ 59 e R$ 329, com sandália sem preço. Coleções Dia a dia, Tecnologia e Presentes. Nenhum pedido, saldo, refund, pagamento, pacote ou QC é necessário em L2.
- Capturas da aplicação real em Cards, desktop 1440×900 e mobile 390×844 com uma coluna. Nenhuma alteração no layout operacional para obter a mídia.

## Procedimento preparado

O roteiro local `artifacts/qa/landing-l2/provision.ts` exige `--prepare-local-demo` e o URL exato acima, recusa Vercel e arquivo existente, sobrescreve configurações de auth/email para o ambiente sintético e aplica o migrator diretamente à conexão explícita. Não importa `dotenv/config`, `scripts/seed.ts` ou `scripts/e2e-server.ts`. Usa os serviços reais para salvar favoritos e preferências.

Um servidor local separado na porta 3122 usará esse banco e o código operacional já compilado em L1, que não recebeu mudanças em L2. Email fica desativado e configurações R2/QC ficam vazias. A captura acessará `/login` e `/favorites` normalmente; qualquer pedido de rede fora desse localhost será bloqueado. Nenhum link de marketplace será aberto.

Os originais PNG e o manifesto de captura ficam em `artifacts/qa/landing-l2/`, ignorados pelo Git. Exports WebP sem metadados privados serão inspecionados antes de integrar o hero. Somente esses exports ficam em `public/landing/`; não há acesso runtime ao banco demo pela landing. Capturas, copy e composição permanecem candidatas à revisão humana, sem publicação autorizada.

O destino do CTA continua `/login`. A seção de ferramentas compõe a estrutura editorial completa por decisão LT28; nesta fase não há links ou resultados funcionais de ferramentas. A integração real e seu aceite pertencem a L5.

## Autorização específica

O responsável selecionou explicitamente **“Autorizar ambiente demo local e Cards em uma coluna”**, em resposta à pergunta que identificava o arquivo novo, as migrations existentes, as três pessoas fictícias e a ausência de email, R2 e acesso a bancos reais. Após essa resposta, o roteiro foi executado e as capturas desktop/mobile foram produzidas. A autorização geral de L2 não foi tratada como autorização implícita dessa preparação de schema. Esta confirmação específica não autoriza migrations remotas ou publicação.
