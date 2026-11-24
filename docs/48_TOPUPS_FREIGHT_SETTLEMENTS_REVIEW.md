# Revisão local de recargas, frete e acertos

Entrega referente ao plano 47. Data: 12/11/2026. O aceite humano e qualquer liberação de produção são etapas posteriores à revisão local.

## Capacidades disponíveis

| Frente | Caminho de revisão |
| --- | --- |
| F1 — recarga | Contas HubBuy → Ações → Registrar recarga. Comprovante discriminado ou total percentual, financiadores de principal/taxa, prévia, confirmação, histórico e anulação compensatória. |
| F2 — financiamento | Pacote → Financiamento do frete. Saldo por titular/lotes, complemento externo ou BRL direto; confirmação do fato observado e de financiamento cruzado. Correção e anulação preservam os movimentos anteriores. |
| F3 — rateio | Prévia por unidade e participante; após confirmar, Histórico de financiamento e cálculo por unidade → Conferir cálculo por unidade. Leitura em páginas de até 100 parcelas. |
| F4 — obrigações | Acerto do frete → escolher obrigações diretas ou centralização com compensação explicitamente confirmada. Credores permanecem com valores a receber. |
| F5 — conversão | Revisar / converter acerto → par de uma recarga sem taxa ou par manual com data/motivo. Principal nativo CNY pode permanecer sem conversão; nesse caso não aceita baixa BRL. |
| F6 — recebimentos | Registrar transferência → valor realmente transferido e distribuição entre obrigações do mesmo par. Permite parcelas, excesso explícito, devolução real e anulação de erro de registro. |

O espaço pessoal usa apenas os direitos do titular e não exibe acerto entre pessoas. A entrada de saldo não altera custos antigos. A transferência entre participantes não altera a carteira HubBuy nem quita adiantamentos de pedidos adicionais.

## Ambiente descartável

Os scripts exigem um arquivo novo diretamente em `data/freight-review-<identificador>.sqlite`. Recusam arquivos existentes no seed e redirecionamentos por links/junctions. Configuram porta 3147, banco local, segredo sintético, email desativado e credenciais externas vazias. Não carregam um destino de banco a partir do `.env`. O Next recebe as variáveis explícitas antes de ler seus arquivos de ambiente.

```powershell
npm run dev:seed:freight-review -- --database file:./data/freight-review-minha-revisao.sqlite
npm run dev:freight-review -- --database file:./data/freight-review-minha-revisao.sqlite
```

Abrir `http://localhost:3147`. Login: `pessoa-a@loti.test`; senha exclusivamente sintética: `Loti-Freight-Review-2026!`. As pessoas B/C/D usam o mesmo padrão de email e a mesma senha. O arquivo `.scenario.json` ao lado do banco contém IDs, URL do pacote e expectativas. Não compartilhar esse padrão com dados reais.

Para testar o build em vez do servidor de desenvolvimento, parar o servidor e executar:

```powershell
npm run dev:freight-review -- --database file:./data/freight-review-minha-revisao.sqlite --build
npm run dev:freight-review -- --database file:./data/freight-review-minha-revisao.sqlite --production
```

O comando preserva os bytes de `tsconfig.json` e `next-env.d.ts` ao encerrar normalmente. Não executar dois builds/servidores usando simultaneamente `.next-freight-review`.

## Roteiro principal

1. Conferir o saldo anterior: CNY 370,34, base histórica R$ 288,68, direitos por pessoa preservados. O pacote contém 30 unidades físicas; seis são compartilhadas por A/C/D.
2. Registrar recarga CNY 398,30, total R$ 352,42 e taxa de 1%. Atribuir o comprovante a A. A prévia deve separar principal R$ 348,93 e taxa R$ 3,49. Usar uma referência sintética única.
3. No pacote, informar frete CNY 768,60. A sugestão usa saldo antigo antes da recarga. Conferir A/B/C/D: CNY 540,59 / 18,98 / 138,94 / 70,09. Autorizar os financiamentos cruzados e confirmar somente após a prévia.
4. Conferir custo histórico R$ 641,06 e sobra CNY 0,04 com base R$ 0,04. Esse custo não corresponde ao dinheiro novo da recarga nem à soma dos recebimentos.
5. Emitir primeiro o acerto CNY, escolhendo centralização por A. Conferir as posições principais A/B/C/D: −258,77 / 185,98 / −36,46 / 109,25 CNY. A deve receber de B/D e pagar a C.
6. Converter com o par explícito CNY 398,30 → R$ 348,93. A taxa fica fora do par. Registrar motivo/data. Inspecionar o cálculo por unidade e os valores a acertar.
7. Registrar uma transferência de R$ 1,00 em uma obrigação, depois o restante e as outras obrigações. As quatro baixas devem manter a sobra CNY 0,04. Conferir histórico e versão original CNY.

O rateio de taxa primeiro fixa os centavos por unidade física e depois os participantes de cada item. Por isso as margens individuais podem diferir do exemplo agregado do plano 47. Os IDs gerados fixam a ordem daquele banco; nomes, ordenação visual e paginação não a alteram. O verificador calcula independentemente a margem esperada a partir das unidades persistidas, sem substituir a matriz pelos valores agregados da conversa.

Na fixture entregue `freight-review-complete.sqlite`, a taxa A/B/C/D foi R$ 1,31 / 0,88 / 0,47 / 0,83. O acerto convertido foi B → A R$ 163,81; D → A R$ 96,54; A → C R$ 31,47. As três obrigações já estão acertadas por quatro registros sintéticos. Esse é o esperado daquela matriz persistida; uma fixture nova pode distribuir os centavos por outra ordem de IDs. Para acompanhar esse estado, abrir `/packages/detail/f445e31a-c52f-44ff-b652-5357ad02fb25` no servidor local. Para executar o roteiro desde o início, criar uma fixture nova.

```powershell
npm run dev:verify:freight-review -- --database file:./data/freight-review-minha-revisao.sqlite
```

Esse comparador verifica o roteiro principal, sem alterações posteriores nos valores ou nas 30 unidades. Para experimentar correções/devoluções, usar outra fixture e conferir as invariantes gerais com `verifyDatabase`, além das prévias e históricos. Não apagar ou sobrescrever um banco de revisão para reiniciá-lo: escolher outro identificador.

## Correções e dependências

Correções da revisão dos quatro achados: ver `audits/2026-11-12_TOPUPS_FOUR_FINDINGS_REVIEW_FIXES.md`. Exigem a migration nova 0038, aplicada explicitamente ao destino local de teste. A associação de débito transfere o caminho de anulação ao financiamento de frete; a recarga recuperada pode ser anulada pelos créditos descendentes comprovados; excesso devolvido por claims de revisão é projetado no servidor; o histórico passa a identificar frete e pacote sem reclassificar o ledger antigo.

- Cancelar ou abrir uma prévia não grava. Uma revisão concorrente exige nova prévia.
- Resposta perdida conserva a mesma tentativa na sessão. “Conferir tentativa pendente” recupera a operação com a mesma chave; não cria outro pagamento.
- Anular um registro compensa seus efeitos contábeis. Não afirma que o banco ou a HubBuy devolveram dinheiro.
- Devolução recebida do frete é outro fato, com referência, destino e capacidade próprios. Crédito na carteira retorna aos financiadores originais com a base histórica correspondente. Consumo posterior impede anulação simples desse crédito.
- Uma revisão de acerto preserva recibos anteriores e emite somente o restante ou o crédito a devolver. Se um excesso anterior já integra essa compensação, a devolução é registrada nas obrigações vigentes, evitando um segundo retorno pelo recibo original.
- Conteúdo aberto mantém rateio provisório; novas baixas exigem conteúdo fechado e fundamento vigente. Frete legado pago exige comprovar débito existente ou confirmar fato ainda não registrado. Associar débito existente não cria outra baixa.
- Encerramento financeiro e envio mantêm as restrições existentes. Não reabrir conteúdo enviado para contornar uma correção financeira.

## Ensaio automatizado

Preparar uma fixture nova e iniciar o servidor com ela. O teste completo consome a fixture; não repetir no mesmo banco.

```powershell
$env:FREIGHT_REVIEW_MANIFEST='data/freight-review-minha-revisao.sqlite.scenario.json'
# Se necessário neste Windows, apontar para os navegadores já instalados:
$env:PLAYWRIGHT_BROWSERS_PATH='C:/Users/Gabriel/AppData/Local/ms-playwright'
npm run test:freight-review
```

O ensaio cobre cancelamento sem alteração de revisão/saldo, resposta perdida e replay, conflito real de revisão, financiamento, emissão nativa, conversão, parcelas persistidas, recebimento parcial/restante e screenshots nas larguras 320/390/768/1024/1440, além de mobile escuro. Evidências ficam em `artifacts/freight-review`; não contêm dados reais.

## Migração, cutover e recuperação

Migrations 0034–0037 são explícitas; não executar dentro de requisições. Não criam movimentos monetários nem inventam financiadores de registros antigos. A 0034 preserva o ledger e seus guards; 0035–0037 acrescentam financiamento, taxas, acertos, devoluções e integridade do protocolo. Os guards pessoais reconhecem o titular sem criar membership.

Uma implantação futura exige autorização específica, backup restaurável, suspensão dos writers, inventário fresco do banco, aplicação explícita das migrations, verificador/FKs e comparação dos dados protegidos antes de liberar escrita. Depois de novos movimentos financeiros, reverter apenas o código é inseguro. Preferir correção em frente com escrita suspensa; restaurar backup exige reconciliar todos os movimentos posteriores.

Nenhum deploy, migration remota, serviço externo ou transferência real faz parte deste ensaio. Registrar o aceite humano somente depois da revisão efetiva.
