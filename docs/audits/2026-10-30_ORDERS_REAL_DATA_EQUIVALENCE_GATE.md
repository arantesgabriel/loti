# Equivalência dos dados reais — gate anterior à publicação de feat/orders

Registro encerrado em **30/10/2026, 23:50 BRT** (31/10/2026, 02:50 UTC).

**Decisão: BLOQUEADO para aprovação de publicação; equivalência real INCONCLUSIVA.** A avaliação parou no gate de proveniência/isolamento exigido pelo usuário. Isso não constitui demonstração de perda de dados, aprovação técnica integral da branch ou autorização de migration/deploy.

## 1. Checkout confirmado

| Referência | SHA observado localmente |
| --- | --- |
| Branch | `feat/orders` |
| HEAD alvo | `452929b61d5faa99ca5270d435e471df3c568fce` |
| Implementação de Pacotes | `c41a6688c1553dd85fa796d68cec377a72a7a869` |
| `origin/feat/orders` | `3f70d005360953d723eb909a7c5c9b3a188b3afe` |
| `origin/main` | `6f0d10b67e4f22259fa5b67f4e565029d55272db` |
| Produção efetivamente implantada | **Não confirmado pelo responsável nem por evidência de deployment** |
| Base de comparação produção → alvo | **Indeterminada** |

As referências `origin/*` são as referências já existentes no checkout; não houve fetch. Nenhuma delas foi tratada como prova do código servido em produção.

No início, nenhum arquivo rastreado estava modificado. Os únicos arquivos sem track eram `reset-password.sh` e `tests/e2e/packages-mobile-list.spec.ts`. Ambos foram preservados; seus SHA-256 continuaram iguais na reconferência anterior à criação deste relatório. A única escrita de arquivo desta avaliação é este relatório redigido.

## 2. Fontes e alcance efetivo

Foram consultados `AGENTS.md`, `PROMPT_ONE_SHOT.md`, plano 39, `ORDERS_TRANSITION_EXECUTION.md`, `ORDERS_TRANSITION_FINALIZATION.md`, `PACKAGES_P6_P7_FINALIZATION.md`, relatório sintético `2026-10-27_ORDERS_TRANSITION_BASELINE.md`, journal Drizzle, SQL de 0023–0028 e os runners/guards da fixture.

O diff resumido `origin/feat/orders...HEAD` contém 13 arquivos, 3.710 inserções e 303 remoções. É apenas o incremento local em relação àquela referência: **não é o diff em relação à produção**. A revisão integral de todos os arquivos entre produção e alvo, seus imports, serviços, permissões e APIs não foi concluída, pois o SHA implantado é desconhecido. Não há aprovação de autorização/isolamento entre workspaces nesta avaliação.

## 3. Inspeção atual de produção, somente leitura

O usuário autorizou explicitamente a leitura da sessão aberta em `https://useloti.com/packages`. Foram lidas a listagem e a página de detalhe do acompanhamento por navegação normal. Não foram acionados botões de gravação, confirmação, edição, importação, pagamento, cancelamento ou manutenção. Não houve E2E em produção, exportação, consulta SQL remota ou acesso a credenciais. Não foram abertas galerias nem manipulados objetos QC/R2.

Os resultados dos controles de navegador foram reduzidos a rótulos genéricos, contagens e estados antes de serem emitidos. Nomes, emails, IDs, links de recursos privados, valores individuais e conteúdo bruto da conta não foram registrados neste relatório; não foram persistidos screenshots/dumps reais.

| Agregado visível no acompanhamento atual | Observação |
| --- | --- |
| Acompanhamentos abertos na listagem | 1 |
| Acompanhamentos encerrados na listagem | 0 |
| Unidades compradas no detalhe | 41 |
| Unidades canceladas no detalhe | 10 |
| Unidades vigentes no detalhe | 31 |
| Seção de pacotes | 1 pacote / 31 unidades |
| Estado logístico visível do pacote | Em preparação |

**Diferença material de representatividade:** a fixture histórica documentada usa 26 unidades no pacote e cinco fora dele. A seção de pacotes atual mostra 31 unidades. A fixture antiga não representa a composição operacional atual. Isso é diferença entre cenário sintético e observação atual, não um delta causado por migration nesta avaliação. A inspeção não atribui quando nem por qual ação ocorreu essa mudança.

Os controles visíveis não forneceram prova suficiente do fechamento de conteúdo nem do pagamento específico do frete. A presença da palavra genérica “Pago” em outra parte da página não foi usada para inferir frete pago. Não foi comprovada, linha a linha, a ausência de unidades sem pacote.

Esta navegação não é uma leitura transacional única do banco. Não prova integridade SQL, estado completo de histórico, relações, centavos, autoria, snapshots, ledger ou privacidade efetiva das APIs. Não identifica SHA implantado ou schema. O estado pode mudar após a observação.

## 4. Snapshot, destino e versão do banco

| Pré-condição | Situação |
| --- | --- |
| Snapshot consistente aprovado, criado pelo mecanismo oficial do provedor | Não disponibilizado/identificado |
| Instante, origem e confirmação do workspace do snapshot | Ausentes |
| Versão real de schema/migrations declarada no banco de produção | Não coletada |
| Lista/hash das migrations aplicadas no mesmo instante do snapshot | Ausentes |
| Caminho privado do snapshot e prova de isolamento | Ausentes |
| Código histórico correspondente ao deploy para executar leituras antes/depois | Base implantada não identificada |

O journal do repositório termina em `0028_legacy_account_review_guard`; isso descreve o alvo, **não o banco de produção**.

O usuário esclareceu que `localhost:3000` usa **`loti-dev` remoto no Turso** e autorizou alterações especificamente nesse ambiente. Essa autorização não transforma esse banco existente em clone local isolado nem prova sua equivalência com produção. O banco não foi alterado. A página local de Pacotes foi consultada sem gravação. Não se copiou/recriou a conta real na demonstração.

Nenhum snapshot foi criado ou copiado. Nenhuma conexão de banco foi aberta pela avaliação. Não houve leitura de `.env`, impressão de tokens, uso de credenciais de escrita ou comandos de provedor.

## 5. Migrations: leitura estática e contrato preliminar

A sequência **exata necessária permanece indeterminada** até conhecer o journal/schema real. Abaixo estão os efeitos previstos pelos SQL candidatos lidos, não deltas aprovados/observados nos dados reais.

| Migration candidata | Efeito previsto a conferir em clones |
| --- | --- |
| 0023 | Criar seis tabelas logísticas, FKs, índices e checks; nenhuma alteração de registro financeiro antigo esperada |
| 0024 | Criar posições com conferência pendente/recebimento vazio; mapear pacotes legados e reservas por unidade excluindo faixas canceladas; assert de quantidade; instalar guards de cutover, escopo e capacidade |
| 0025 | Criar ponte imutável de inputs das cobranças legadas, preservando referência ao ID original; criar índices |
| 0026 | Acrescentar estados/metadados de cobrança à tabela logística nova e atualizar seus estados conforme nulidade dos valores; criar guard |
| 0027 | Acrescentar guards de auditoria/recibos, capacidade, escopo, overlaps e dinheiro seguro |
| 0028 | Substituir um guard de capacidade para tratar associação explícita de conta durante revisão legada |

**Impacto operacional concreto a ensaiar:** 0024 deixa posições/pacotes legados em `pending_review` e instala triggers que rejeitam INSERT/UPDATE/DELETE nos pacotes/alocações antigos, além de UPDATE em cobranças de pacote antigas. Novas reservas e novas solicitações de refund recebem travas adicionais. Preservação física de linhas não garante continuidade operacional imediata dos pacotes próximos de envio. A compatibilidade do binário implantado, da nova versão e das conferências necessárias precisa ser demonstrada no clone atual.

Backfill não deve fabricar chegada, conta verificada, pagamento ou despacho. Campos de novas linhas, IDs derivados e timestamps de migração devem ser comparados pelo contrato específico, sem exigir que duas execuções em instantes distintos gerem timestamps iguais. Nenhuma divergência em registro antigo é automaticamente autorizada por esse motivo.

## 6. Matriz de comparação — execução bloqueada

`NV` significa **não verificado**, e não zero ou igualdade. Não há contagens/hashes/agregados de banco antes/depois disponíveis. A matriz integral por tabela, campos e chaves estáveis depende do schema de origem e ainda não foi produzida; os grupos abaixo delimitam a cobertura faltante.

| Tabela/escopo | Antes: contagem/hash/agregado | Depois: contagem/hash/agregado | Contrato a provar / resultado |
| --- | --- | --- | --- |
| `purchases` | NV | NV | Linhas, snapshots e estado histórico equivalentes / pendente |
| `purchase_items` | NV | NV | IDs, origem, quantidade, campos capturados, autoria/datas equivalentes / pendente |
| `purchase_item_participants` | NV | NV | Pessoas, pesos, parcelas e genealogia equivalentes / pendente |
| `purchase_cost_trackings` | NV | NV | Vínculos, revisão e fechamento preservados / pendente |
| `purchase_cost_orders` | NV | NV | Original/adicionais, conta e estado preservados / pendente |
| `purchase_additional_order_items` | NV | NV | Snapshots, quantidade e origem preservados / pendente |
| `purchase_order_corrections` | NV | NV | Cadeia anterior/substituto e auditoria preservadas / pendente |
| `purchase_item_costs` | NV | NV | Bases produto/China, origem e revisões preservadas / pendente |
| `purchase_cost_participants` | NV | NV | Pesos, ordem, pessoa e valores derivados equivalentes / pendente |
| `purchase_packages` | NV | NV | Registros legados, selo e estado preservados / pendente |
| `purchase_package_items` | NV | NV | Quantidade/vínculos legados preservados e mapeados por unidade / pendente |
| `purchase_cost_charges` | NV | NV | Valores, status, método, taxa, confirmação, autor e datas preservados / pendente |
| `purchase_cost_refunds` e relações/eventos | NV | NV | Faixas, status, recibos e snapshots sem novo crédito / pendente |
| Tabelas de pagamentos mistos/fontes/consumos/ledger/direitos/adiantamentos | NV | NV | CNY e BRL exatos por origem/titular; nenhuma duplicação / pendente |
| Tabelas QC/imports/ocorrências/imagens/auditoria/tombstones | NV | NV | Proveniência, vínculos, chaves privadas e conteúdo capturado preservados / pendente |
| Workspaces/memberships/contas e demais tabelas do schema real | NV | NV | Identidade/isolamento e campos protegidos equivalentes / pendente |
| `order_warehouse_positions` | NV | NV | Backfill novo por item, sem inventar chegada / pendente |
| `logistics_packages` | NV | NV | Mapa unívoco de pacote legado, revisão pendente, estado/selo de origem / pendente |
| `logistics_reservations` | NV | NV | Backfill por unidade não cancelada, sem duplicação / pendente |
| `logistics_legacy_charges` | NV | NV | Ponte por cobrança legada, inputs/somas exatos / pendente |
| `logistics_events` | NV | NV | Nenhuma movimentação operacional fabricada pela migration / pendente |
| `logistics_commands` | NV | NV | Nenhum comando operacional fabricado pela migration / pendente |
| `logistics_manifests` | NV | NV | Nenhum fechamento novo inferido pela migration / pendente |

### Pedidos e pacotes abertos/próximos de envio

| Recurso/risco atual | Evidência disponível | Prova faltante |
| --- | --- | --- |
| Acompanhamento aberto | 41 compradas − 10 canceladas = 31 vigentes na UI | Identidade/valor/relação de cada unidade antes/depois |
| Pacote em preparação | Seção atual informa 1 pacote / 31 unidades | Manifesto/conteúdo efetivo, conta/workspace, reserva unívoca e custo por unidade |
| Diferença para fixture de 26 + 5 | A composição atual difere do cenário documentado | Snapshot atual e comparação de todos os vínculos |
| Fechamento e envio próximo | Estado visível não prova os gates completos | Conferência legada, conteúdo, frete informado versus pago e transições em clone |
| Pagamentos/refunds/ledger | Sem equivalência SQL coletada | Bases/taxas/recibos, consumo FIFO, créditos e genealogia exatos |
| QC dos itens atuais | Nenhuma mídia manipulada | Mesmas referências privadas, permissões e origens; nenhum remapeamento indevido |

## 7. Execuções e comandos

**Migrations executadas: nenhuma. Clones criados: nenhum. Testes unitários/integrados/E2E/build/lint/typecheck executados nesta avaliação: nenhum.** Não se acionou nenhum runner que importe conexão ou carregue ambiente da aplicação. Não foi testada reaplicação, rollback, upgrade interrompido ou ciclo de escrita no estado real.

Os 539 aprovados/7 ignorados e os checks verdes são resultados anteriores descritos em `PACKAGES_P6_P7_FINALIZATION.md`, não uma nova execução nem evidência de equivalência real. Os sete skips dependem de workbook legado privado.

Comandos de identificação efetivamente usados, somente leitura:

```powershell
git status --short
git branch --show-current
git rev-parse HEAD
git rev-parse origin/feat/orders
git rev-parse origin/main
git log -3 --format="%H %s"
git ls-files --others --exclude-standard
git diff --stat origin/feat/orders...HEAD
git check-ignore data artifacts
Get-FileHash -LiteralPath reset-password.sh, tests/e2e/packages-mobile-list.spec.ts -Algorithm SHA256
```

Também foram usados `Get-Content`, `Select-Object` e `rg` para as fontes/caminhos descritos acima, sem acessar dados de banco. A leitura de `.vercel/project.json` foi tentada como metadado local; o arquivo não existe. Não se leu configuração remota ou segredos para contornar essa ausência.

Os scripts `upgrade-orders-transition.ts`, `compare-orders-transition.ts`, `verify-orders-transition.ts` e `orders-transition-environment.ts` foram apenas lidos: exigem destino `file:` no padrão sintético, marker completo compatível e, conforme o runner, baseline versionada; rejeitam produção/Vercel/tokens/credenciais externas e redirecionamentos de filesystem. **Não devem ser adaptados nem receber marcador forjado para aceitar dados reais.** O comparador também escreve relatório de fixture; não é um comparador seguro de conta real por redirecionamento.

## 8. Pré-condições para retomar e para futura revisão

1. Identificar o deployment efetivamente servido e obter confirmação do SHA pelo responsável, sem usar uma branch como substituto.
2. Disponibilizar snapshot privado consistente aprovado pelo mecanismo oficial do provedor, com instante, origem/workspace confirmados e journal/schema daquele estado. Não enviar dump, token ou registros reais ao chat.
3. Preparar destinos privados novos, fora do Git/artefatos compartilhados; validar caminhos absolutos, marker de isolamento e ambiente sem tokens remotos antes de cada operação. O `loti-dev` remoto existente não atende essa etapa.
4. Determinar o diff e a sequência exata de migrations; revisar todos os arquivos/imports e definir contrato permitido por tabela/campo antes de migrar.
5. Comparar baseline intocada e clone migrado por chaves estáveis, campos, hashes e agregados; discriminar inserts de backfill de alterações/deleções antigas. Ensaiar FKs/guards, reaplicação, falha/interrupção e recuperação em clones adicionais.
6. Testar em clone separado os fluxos que escrevem estado, principalmente as 31 unidades hoje mostradas no pacote, pagamentos/refunds/mistos, contas, QC, fechamento, envio e recebimento. Provar que baseline e produção não foram tocadas.
7. Revalidar frescor: alterações reais após o snapshot exigem explicar/reavaliar a diferença; sem isso, nenhuma aprovação de dados atuais.
8. Resolver divergências e pendências de aceite/review com evidências. Eventual publicação/migration real continua exigindo autorização explícita separada e plano operacional próprio. Não foi solicitado lock nem janela de manutenção nesta avaliação.

**Conclusão:** não há evidência suficiente para afirmar que a subida preservará a conta e permitirá continuar sem impacto nos pacotes próximos de envio. Há uma diferença atual de composição em relação à fixture e uma mudança operacional explícita de cutover/conferência no SQL. Nenhum dano foi reproduzido, mas a aprovação fica bloqueada até o ensaio com dados reais em clones isolados.
