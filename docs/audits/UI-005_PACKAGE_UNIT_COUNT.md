# UI-005 — contagem de unidades do pacote

Data: 27/10/2026. Escopo: corrigir e validar somente a divergência entre a lista e o detalhe de Pacotes. Nenhuma alteração visual de UI-001, UI-003, UI-006 ou UI-007 foi feita.

## Diagnóstico confirmado

O repositório mantém duas superfícies para esse fluxo:

- `/packages` renderiza `LogisticsPackagesScreen`, que consulta `listLogisticsPackages()` por `/api/logistics/packages`.
- `/packages/detail/[packageId]` renderiza `LogisticsPackageDetail`, que consulta `logisticsPackageServices().get()` por `/api/logistics/packages/[packageId]`.
- A rota antiga `/packages/[trackingId]` continua como compatibilidade e redireciona para `/orders/[trackingId]`, onde permanece a tela financeira original.

As telas novas reutilizam a infraestrutura compartilhada da implementação original: `Button`, `PackageSurface` (wrapper de `Surface`), `costRequest`, `parseCostCents`, `formatMoney` e `useWorkspace`. A lista financeira original e `ProductCostsList` não são usadas para compor a nova lista de pacotes. Antes da correção, também não havia uma leitura compartilhada de reservas para os dois resumos.

Na lista, `logistics-package-list.ts` gerava a projeção:

```sql
(SELECT count(*) FROM logistics_reservations r
 WHERE r.package_id="id" AND r.released_at IS NULL)
```

O interpolador do Drizzle emitia `p.id` como a coluna não qualificada `"id"`. Como `logistics_reservations` também tem uma coluna `id`, SQLite resolvia esse identificador dentro da subconsulta, comparando `r.package_id` com `r.id`. O identificador da reserva não é o do pacote, então a projeção retornava zero. O detalhe filtrava as reservas ativas por `package_id` e contava as linhas resultantes; cada linha representa uma unidade física.

Reprodução antes da mudança, usando fixture e banco `:memory:`: uma reserva ativa produziu `unitCount: 0` na lista e `reservations.length: 1` no detalhe. O SQL foi inspecionado por `toSQL()`, que confirmou a referência não qualificada.

## Correção aplicada

`countActivePackageUnitsByPackage()` executa uma agregação agrupada por `package_id`, limitada aos IDs solicitados e com `released_at IS NULL`. A lista passa os até 20 pacotes da página; o detalhe inclui `unitCount` no DTO e a interface usa esse campo no resumo. O conteúdo e os controles de retirada continuam baseados nas mesmas reservas ativas.

Não houve migração nem escrita financeira. A retirada segue atualizando apenas a reserva e os eventos logísticos existentes.

## Regressão e preservação do domínio

Foram adicionadas verificações de integração que:

1. valida o pacote com duas reservas ativas na segunda página da lista;
2. libera uma unidade e verifica que lista e detalhe passam a mostrar uma;
3. libera a unidade restante e verifica que ambas as leituras mostram zero, com os dois registros históricos preservados como liberados;
4. percorre montagem, conteúdo fechado, encerramento financeiro, despacho e recebimento, comparando lista e detalhe em cada filtro de estado e conferindo que a contagem do detalhe coincide com suas reservas ativas;
5. compara antes/depois o resumo financeiro, compra e itens finalizados, participantes, acompanhamento/custos, cobranças e registros de refund após as retiradas.

Na retirada, as contagens observadas são `2 → 1 → 0`; ao fechar o conteúdo e encerrar os custos, permanecem iguais em lista e detalhe. O snapshot financeiro e histórico permanece exatamente igual após as retiradas.

## Verificações executadas

- Reprodução isolada pré-correção: confirmou lista `0` versus detalhe `1` para uma reserva ativa.
- `npm run test -- --maxWorkers=1 tests/integration/logistics-finalization.test.ts`: 8 testes passaram.
- `npm run test -- --maxWorkers=1 tests/integration/warehouse-workflow.test.ts`: 2 testes passaram, incluindo montagem, conteúdo fechado, encerramento financeiro, despacho e recebimento.
- `npm run test -- --maxWorkers=1 tests/integration/package-refunds.test.ts`: 12 testes passaram.
- `npm run test -- --maxWorkers=1 tests/integration/package-costs.test.ts`: 7 testes passaram.
- `npm run typecheck`: passou.
- ESLint nos arquivos alterados: passou.

Build: `npm run build` não concluiu porque o Windows retornou `EPERM` ao criar diretórios no `.next` existente. O build isolado compilou o bundle e concluiu TypeScript, mas falhou durante prerender com outro `EPERM` ao criar a saída de `/login`; também emitiu mensagens indicando que `BETTER_AUTH_SECRET` não está configurado no ambiente local. Nenhum segredo real foi adicionado ou exibido. As referências temporárias geradas em `tsconfig.json` e `next-env.d.ts` foram removidas/restauradas ao estado anterior, e o diretório isolado desta tentativa foi removido.

## Aceite e limites

- Lista e detalhe usam a mesma definição de unidade ativa.
- Reservas ativas, liberação parcial, liberação total e paginação estão cobertas por integração.
- Valores de custos, confirmações de pagamento, compras finalizadas, snapshots, cobranças e refunds permanecem iguais após retirada de unidades.
- Não houve alteração nos dados/serviços de produção, publicação ou migração.
- A correção é pequena e local; a consulta da lista inclui uma agregação adicional limitada aos pacotes da página.
- E2E visual não foi executado porque nenhuma mudança visual foi feita. O build completo permanece limitado pelos erros locais de `EPERM` e configuração de auth descritos acima.
