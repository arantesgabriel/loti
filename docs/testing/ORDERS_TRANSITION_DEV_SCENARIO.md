# Pedidos → armazém → pacotes: cenário local

Este documento conserva o roteiro da **preparação inicial do baseline**, anterior ao cutover. Para o estado atual da implementação, bancos migrados, novo fluxo e pendências, usar [execução local](ORDERS_TRANSITION_EXECUTION.md) e [handoff](../HANDOFF_ORDERS_WAREHOUSE_PACKAGES_2026-10-27.md). Não constitui aceite da extensão completa.

## Preparar e iniciar

Na raiz do repositório, com Node 24 e dependências já instaladas:

```powershell
npm run dev:seed:orders-transition -- --database file:./data/orders-transition-review-v2.sqlite
npm run dev:compare:orders-transition -- --database file:./data/orders-transition-review-v2.sqlite
npm run dev:orders-transition -- --database file:./data/orders-transition-review-v2.sqlite
```

Abrir **http://localhost:3139**. Logins: `pessoa-a@loti.test`, `pessoa-b@loti.test`, `pessoa-c@loti.test`, `pessoa-d@loti.test`. Senha exclusivamente sintética: `Loti-Orders-QA-Only-2026!`. Pessoa A administra QC; os demais membros visualizam as galerias conforme as permissões existentes.

Parar o servidor com **Ctrl+C** no terminal que o iniciou. O banco e os objetos QC continuam no disco. Os testes E2E normais não apagam este cenário. Uma segunda execução do seed reconhece o marcador do cenário e não acrescenta registros. Para reiniciar a experiência, escolher outro nome, por exemplo `file:./data/orders-transition-demo-02.sqlite`; não apagar o banco de desenvolvimento do usuário.

O runner aceita somente caminho explícito diretamente em `data/orders-transition-<id>.sqlite`, sem junction/symlink, Vercel, produção, token Turso ou credenciais de serviços externos no processo. Não carrega dotenv. O processo Next recebe valores vazios explícitos para as credenciais externas e valores sintéticos para autenticação/banco. Se houver credenciais herdadas no terminal, usar um processo local de teste sem essas variáveis; não revelar nem editar `.env`.

Arquivos do cenário:

- Banco SQLite indicado no comando.
- `<banco>.scenario.json`: identidade e estado da construção. Um banco existente sem marcador completo é recusado.
- `<banco>.baseline.json`: comparação validada e contrato de preservação versão 2 ao concluir uma nova construção. É obrigatório para verificar um cenário existente e nunca é recriado pelo comparador.
- `<banco>.qc/`: originais e previews sintéticos, com nomes derivados por hash de chave, fora de `public/`.
- `artifacts/qa/orders-transition/<banco>.report.json`: comparação somente leitura.
- `.next-orders-transition`: compilação de desenvolvimento isolada.

O runner aplica explicitamente somente as migrations reais até **0022_hubbuy_manual_adjustments**. Copia os arquivos SQL/journal correspondentes para `artifacts/qa/orders-transition/migrations-0022/`. Não executa migration ao iniciar o servidor nem em requests. O builder depende da versão anterior dos serviços; deverá ser adaptado de forma explícita antes de mudar esses serviços ou seu schema. Não há exportação de tabelas de autenticação/senhas.

## O que conferir no legado

1. Histórico: uma compra finalizada, 30 linhas originais, nenhuma compra ativa.
2. Pacotes e custos → Compra QA original: 41 unidades compradas, dez canceladas, 31 vigentes em 29 linhas.
3. Pacote QA em preparação: 24 linhas e 26 unidades. Frete Brasil e Receita continuam pendentes.
4. Sem pacote: Polo QA, Tênis QA, Camiseta QA, Camiseta B QA e Kit QA; uma unidade e QC em cada.
5. Pagamento original: base R$1.633,59, taxa Pix R$16,34, total R$1.649,93. Nove adicionais vigentes somam R$351,45. Oito substituições estão no histórico.
6. Reembolsos: R$655,15 recebidos; custo mantido R$109,59. Restantes R$1.236,64 + mantidos R$109,59 = R$1.346,23.
7. Conta QA: disponível ¥370,34, base histórica R$288,68. A simulação de frete aparece apenas no extrato: saída ¥18,00/base R$15,02.
8. QC: fotos de cores sólidas geradas localmente; uma galeria original tem 14 imagens e capa na segunda página. O vínculo do Kit QA acompanha oito correções pagas. Nenhuma foto real/CDN/R2 é usada.

O seed passa por serviços reais para compra, finalização, custos, pagamentos, cancelamentos, recebimentos, pedidos adicionais, FIFO, adiantamentos, correções e ajustes. Não ajusta saldo cache ou taxas por SQL. O único ajuste direto de apresentação renomeia o pacote sintético criado pela inicialização legada.

## Construções sintéticas e diferenças pessoais

Todas as identidades, links `shop.loti.test`, referências e fotos são fictícios. O manifesto versionado é `tests/fixtures/orders-transition/expected.json`; as bases originais e os pares históricos CNY/BRL estão em `scenario.ts`.

Para obter as bases exatas dos adicionais por FIFO, dois refunds da Pessoa A têm par histórico 2 CNY minor por centavo BRL. Os refunds compartilhados entre B/C/D usam par 1:1. Os pedidos combinam esses direitos por direcionamentos explícitos, preservando adiantamentos. Estes pares descrevem **apenas a construção de teste**, não câmbio de mercado nem transações observadas na HubBuy. O Brinquedo QA recebe ¥27,67 sintéticos para fechar a matriz nativa; demais valores não observados estão identificados no manifesto.

Há dois bônus sem base BRL: ¥2,29 e ¥1,14. O segundo é o complemento sintético expressamente admitido pelo plano; não representa inferência de um lançamento real.

Distribuição atual A/B/C/D de custo líquido: **30127 / 42180 / 30239 / 32077** centavos. Créditos recebidos BRL: **17285 / 14255 / 14254 / 19721**. Saldo CNY: **12962 / 0 / 2666 / 21406**; bases remanescentes BRL: **6481 / 0 / 2666 / 19721**. O comparador informa valores e diferenças assinadas contra a referência do plano. As somas globais são exatas; a distribuição pessoal não pretende reproduzir detalhes não observados.

## Verificação automatizada

```powershell
npx vitest run tests/unit/orders-transition-environment.test.ts tests/unit/orders-transition-storage.test.ts tests/integration/orders-transition-baseline.test.ts tests/integration/orders-transition-comparison.test.ts tests/integration/orders-transition-comparison-cli.test.ts --maxWorkers=1 --no-file-parallelism --no-isolate --pool=threads
$env:LOTI_ORDERS_TRANSITION_DATABASE='file:./data/orders-transition-review-v2.sqlite'
npx playwright test --config playwright.orders-transition.config.ts
```

O servidor acima precisa estar iniciado para o teste Chromium. O teste usa somente localhost e rejeita qualquer solicitação HTTP externa. Valida login real, âncoras pela API, navegação, temas/larguras, original QC privado e saldo. Não realiza movimentos financeiros. Screenshots e traces ficam em `artifacts/qa/orders-transition/`.

O comparador verifica cada adicional, cada um dos dez refunds, soma pessoal/global, componentes de pagamento, todos os débitos e replay FIFO dos consumos e saldo cache/ledger. Também exige a baseline aprovada para comparar os snapshots, pagamentos, ledger, referências QC e parcelas/capacidades pessoais sintéticas. Diferenças de centavos ou hashes protegidos fazem `passed` ser falso. A divergência documentada em relação às referências pessoais observadas em produção continua permitida; a exigência de preservação usa a distribuição sintética efetivamente capturada.

O contrato de preservação v2 contém apenas metadados e hashes de uma lista explícita de tabelas de domínio, sem registros/valores de autenticação. Inclui os registros de importação QC com manifesto, autor, origem e demais campos persistidos, além das fotos, apresentações e vínculos. Sessões, nomes atuais de perfil e contadores/leases de leitura não são congelados. Eventos QC existentes precisam permanecer intactos; novos eventos legítimos de leitura podem ser acrescentados. A comparação de um upgrade aditivo usa os campos originalmente capturados, sem exigir igualdade de novas colunas de metadados. O inventário geral por tabela continua sendo diagnóstico, separado dessas regras de aprovação.

`PRAGMA foreign_key_check` é executado no comando de comparação. Falhas são relatadas com diferença exata; o comparador não repara dados nem sobrescreve a baseline. Arquivos de baseline antigos (inclusive contrato v1), sem o contrato versionado, ausentes ou inválidos são recusados antes de abrir o banco. Para esses cenários, gerar **outro arquivo SQLite novo**; não aprovar o estado atual recapturando sua baseline. O banco `orders-transition-review-v2.sqlite` foi criado do zero com o contrato v2; os bancos anteriores foram preservados.

## Próximos gates e aceite

- G0: baseline legado financeiro e quantitativo reproduzido; roteiro local disponível. Conferência visual registrada no relatório de auditoria.
- G1–G5: migrations da extensão, posições/conferência legada, reservas multi-compra, pacotes independentes, novas APIs e interface **pendentes**.
- Modo novo da fixture e simulação completa da camiseta retida: **pendentes**.
- G6/aceite humano da extensão: **não solicitado nem obtido**. Só solicitar após entregar o novo fluxo concreto.
- Produção, migração remota, contas reais, publicação e configuração externa: **não executadas**.
