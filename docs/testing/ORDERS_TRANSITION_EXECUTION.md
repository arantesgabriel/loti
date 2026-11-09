# Pedidos, armazém e pacotes — execução local

Data: 27/10/2026. As pendências do [handoff anterior](../HANDOFF_ORDERS_WAREHOUSE_PACKAGES_2026-10-27.md) foram tratadas; consultar a [finalização, evidências e gates atualizados](ORDERS_TRANSITION_FINALIZATION.md). A contagem de 500 testes do handoff pertence à entrega anterior. **Não é autorização de produção nem aceite humano da simulação. O reviewer da extensão permanece fechado por instrução do usuário.**

## Propriedade dos valores

| Escopo | Valores próprios | Valores que apenas apresenta | Encerramento |
| --- | --- | --- | --- |
| Pedido | Produto, frete China, taxa capturada, pagamentos, parcelas e resíduos dos reembolsos | Quantidades recebidas/reservadas e links para pacotes | Pode encerrar pago, com bases resolvidas e sem refund pendente, mesmo com unidades guardadas e sem pacote. Reabertura exige motivo. |
| Pacote | Frete Brasil, sua taxa e Receita | Parcelas dos produtos/China/taxa de suas unidades, preservando pedido e pessoas de origem | Conteúdo, financeiro, despacho e recebimento são comandos separados. Reabertura financeira não desfaz pagamento ou despacho. |
| Ledger HubBuy | Fontes, direitos, FIFO, adiantamentos, créditos efetivamente recebidos, simulação e bônus | Referências aos pedidos | Simulação não vira custo do pedido ou do pacote; bônus conserva base BRL zero. |
| Consolidado | Soma dos pedidos líquidos e dos encargos próprios dos pacotes | Custo herdado não é adicionado novamente | Parcelas pessoais e total global devem conciliar exatamente. |

Os leitores financeiros antigos continuam disponíveis explicitamente para prova histórica. A leitura operacional detecta o cutover e calcula Pedidos sem depender de cobertura por pacote. `readWorkflowFinancialSummary` consolida as origens e os encargos sem somar novamente os itens herdados.

## Persistência e compatibilidade

- `0023_orders_warehouse_packages`: identidades próprias, posições, reservas de unidades estáveis, eventos, manifestos e recibos de idempotência.
- `0024_orders_legacy_backfill`: mantém tabelas financeiras/snapshots, mapeia as quantidades antigas após excluir faixas canceladas e deixa conferência/chegada pendentes. Bloqueia escritores antigos de pacotes/alocações.
- `0025_legacy_charge_compatibility`: conserva os inputs do rateio legado em ponte imutável, vinculada ao ID original da cobrança. O alocador canônico com inteiros projeta esses inputs; a migration não faz cálculos monetários em ponto flutuante.
- `0026_logistics_charge_states`: distingue pendente, conhecido e sem cobrança. Informar valor não confirma pagamento; zero conhecido confirmado é uma decisão explícita.
- `0027_logistics_integrity_guards` e `0028_legacy_account_review_guard`: protegem auditoria, recibos, capacidades, escopo e a associação explícita de conta durante a conferência legada.

IDs, pagamentos, datas/autores capturados, refunds e imagens antigos permanecem nas tabelas de origem. Conta textual e QC não comprovam chegada. A confirmação de conteúdo legado registra a conferência atual; não fabrica uma data de ocorrência passada. As migrações nunca são chamadas em requests ou no startup do servidor.

Uma reserva tem `costItemId` e índice lógico estável. A chave única parcial impede duas reservas ativas da mesma unidade. A UI usa quantidades; não exige cadastrar uma peça visual por unidade. A retirada preserva chegada, pagamento e taxas. Cancelamento só alcança faixas fora de qualquer reserva ativa; o recebimento de uma solicitação legada válida continua permitido.

Comandos são transacionais, verificam membership, conta, origem, estado e revisão. A mesma chave recupera seu recibo; outra operação com a mesma chave é rejeitada. Manifestos e eventos anteriores permanecem imutáveis. Correções de adicionais transferem posições/reservas abertas e QC ao substituto, bloqueando dependências de conteúdo fechado/enviado.

## Cenários disponíveis

O cenário inicial recomendado após a finalização é `data/orders-transition-finalization-human-01.sqlite`. Ele permanece separado dos bancos alterados pelos testes; comandos e resultados esperados estão no [relatório final](ORDERS_TRANSITION_FINALIZATION.md#simulação-humana). O legado preservado abaixo continua válido.

Todos os dados, emails, senhas e imagens desta seção são **sintéticos**. Não usar as credenciais em produção.

| Cenário | Banco local | Uso |
| --- | --- | --- |
| Legado migrado | `data/orders-transition-implementation-v2.sqlite` | Baseline 41−10=31=26+5, histórico financeiro e QC privado. Sua baseline original fica em `.baseline.json`, sem recaptura. |
| Novo fluxo para simulação humana | `data/orders-transition-newflow-final.sqlite` | Camiseta retida e compra posterior; duas origens da mesma conta, pacote em montagem e outras unidades disponíveis/aguardando chegada. |
| Teste de navegador | `data/orders-transition-browser-02.sqlite` | Já foi alterado pelo roteiro automatizado. Não confundir seu estado final com o cenário humano inicial. |

Login local: `pessoa-a@loti.test`. Senha de QA: `Loti-Orders-QA-Only-2026!`. Também há pessoas B, C e D com emails equivalentes e a mesma senha sintética.

```powershell
# Preparar um legado novo: escolha sempre um nome descartável ainda inexistente.
npm run dev:seed:orders-transition -- --database file:./data/orders-transition-<novo-id>.sqlite
npm run dev:upgrade:orders-transition -- --database file:./data/orders-transition-<novo-id>.sqlite
npm run dev:compare:orders-transition -- --database file:./data/orders-transition-<novo-id>.sqlite

# Criar um novo fluxo independente sem sobrescrever qualquer banco anterior.
npm run dev:seed:orders-workflow -- --database file:./data/orders-transition-<outro-id>.sqlite

# Iniciar um cenário concreto; apenas um servidor pode ocupar a porta 3139.
npm run dev:orders-transition -- --database file:./data/orders-transition-newflow-final.sqlite
```

Verificação operacional somente leitura, com validação de destino sintético antes de abrir conexões:

```powershell
npm run dev:verify:orders-transition -- --database file:./data/orders-transition-finalization-human-01.sqlite
npm run dev:orders-transition -- --database file:./data/orders-transition-finalization-human-01.sqlite
```

URL: `http://localhost:3139/orders`. Parar com Ctrl+C no terminal que iniciou o processo. Para reiniciar a simulação, criar outro arquivo com os comandos de seed; não apagar o banco de desenvolvimento do usuário. Os guards recusam destinos remotos, tokens, credenciais externas, Vercel, produção e redirecionamentos de filesystem.

## Roteiro humano de aceite

1. No legado, conferir 26 unidades vinculadas e cinco sem pacote, dez canceladas, R$1.346,23 líquidos e saldo ¥370,34/base histórica R$288,68. Não interpretar conferência pendente como chegada.
2. Conferir a chegada e a conta de itens sintéticos com evidência e quantidade. Conferir o pacote legado separadamente. Alterações intencionais de operação devem usar um novo cenário quando for necessário repetir a comparação intocada da baseline.
3. No novo fluxo, abrir Pedidos, verificar as duas compras, os participantes, pagamento e parcelas até o armazém. Filtrar conta/pessoa/origem/etapa e selecionar quantidades disponíveis.
4. Conservar uma camiseta no armazém, montar ou acrescentar outras unidades a um pacote da mesma conta. Retirar uma reserva e verificar que ela volta a ficar disponível sem gerar crédito.
5. Informar frete e verificar que não foi marcado como pago. Fechar conteúdo e verificar que só o fechamento não promove para Em pacote.
6. Confirmar frete efetivamente pago, verificar Em pacote e informar peso em gramas. Conferir que peso não muda os valores. Registrar despacho e recebimento manualmente.
7. Deixar Receita pendente e verificar o bloqueio do encerramento financeiro. Informar/confirmar Receita ou registrar isenção explícita; encerrar custos. Conferir o histórico e as parcelas por pessoa.
8. Conferir o caso de envio posterior da camiseta com a compra posterior já preparada. A mesma unidade não pode pertencer a dois pacotes ou ser reembolsada enquanto reservada.

**Aceite humano ainda não obtido.** Não substituir esse aceite por screenshots ou testes automatizados. Abertura do reviewer Sol requer a aprovação separada solicitada pelo usuário.

## Verificação e evidências

- Testes de domínio, conservação financeira e upgrade: `tests/integration/warehouse-workflow.test.ts`, `logistics-legacy-financials.test.ts`, `orders-transition-baseline.test.ts`.
- Refunds e substituições com o novo esquema: `package-refunds.test.ts` e `purchase-order-corrections.test.ts`.
- Disputas entre processos e rollback real após escritas: `warehouse-concurrency.test.ts` e `logistics-transition-races.test.ts`.
- Navegador: `tests/orders-transition/`, com configs/bancos/porta próprios; temas claro/escuro e larguras 320/390/768/1024/1440.
- Evidências e screenshots: `artifacts/qa/orders-transition/`. A suíte `orders-final-tests.log` registra uma execução de 491 aprovados e sete ignorados anterior aos últimos testes adicionais; não tratar essa contagem como validação das alterações posteriores.
- Typecheck isolado: `npm run typecheck:orders-transition`. Inclui fontes/testes/scripts e tipos do build de QA; não modifica caches `.next` de outros trabalhos simultâneos.

## Runbook de produção — não executado

1. Exigir aceite humano da simulação, aprovação do reviewer e autorização específica de migration/publicação.
2. Preparar backup consistente do Turso e confirmar um procedimento de restauração verificável. Registrar revisão do código, migrations aplicadas e contagens/valores de referência sem exportar secrets ou dumps reais para fixtures.
3. Interromper temporariamente escritores antigos e sessões operacionais durante a janela aprovada. Aplicar migrations explicitamente ao destino autorizado, antes de habilitar o novo código.
4. Conferir FKs, triggers, quantidades, fontes financeiras, pagamentos, refund ranges, QC e saldos. O backfill deve abortar se perder quantidade; não corrigir divergências inventando registros.
5. Habilitar a versão compatível; verificar autenticação, permissões, links salvos, Orders/Pacotes e leitura privada de QC. Abas antigas recebem conflito e não contornam os guards.
6. Em falha, suspender novas escritas e recuperar pelo backup/plano autorizado. Não derrubar tabelas, remover guards ou voltar a um binário antigo que escreva alocações após o cutover. Reconciliar qualquer escrita ocorrida após o backup antes da restauração.

Nenhuma destas etapas remotas foi executada nesta tarefa. Também não foram criados commits ou PRs.
