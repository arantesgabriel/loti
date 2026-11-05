# Registro de gates — estabilização de Pedidos

Data: 29/10/2026. Não substitui nem apaga os registros históricos em `docs/audits/orders-design-freeze-2026-10-28/`.

| Bloco | Autorização | Estado |
| --- | --- | --- |
| R0 | Pedido inicial de retomada, exclusivamente auditoria | Concluída; diagnóstico entregue na conversa |
| R1 | Gabriel: **“inicie r1”** | Implementada; incluída na revisão R4 |
| R2 | Autorização combinada abaixo | Implementada junto da F4 |
| R3 | Autorização combinada abaixo | Implementada junto da F4 |
| R4 | Autorização combinada abaixo | Concluída tecnicamente: 137 testes unitários/integrados e 64 cenários Chromium distintos passaram |
| F4 | Autorização combinada abaixo; depois Gabriel: “fase 4 aprovada” | Aprovada por Gabriel |
| F5 | Gabriel: “fase 4 aprovada. implemente as fases 5 e 6” | Implementada; aguardando revisão humana da entrega |
| F6 | Mesma autorização explícita conjunta | Implementada; aguardando revisão humana da entrega |
| F7 | Nenhuma | Não iniciada; depende de autorização |

A autorização anterior de Gabriel foi: **“execute a fase 4 porém dentro dela ja efetue os ajustes citados pelo r2 e r3. Ao revisar a conclusao da fase 4, tambem faça o r4 para validar o que foi feito nas refatoracoes 1, 2 e 3.”** Ela liberou a execução combinada F4 + R2 + R3 + R4.

A autorização vigente é: **“fase 4 aprovada. implemente as fases 5 e 6”**. Ela aprova F4 e libera F5/F6 conjuntamente, substituindo a pausa intermediária entre elas. Não antecipa o aceite humano de F5/F6 nem autoriza F7, commit, PR, merge, migration de ambiente ou publicação.

Relatório e evidências R1: [R1.md](R1.md). Matriz: [matriz-paridade.md](matriz-paridade.md). Plano: [plano-correcao.md](plano-correcao.md).

## Entrega R1 — 29/10/2026

- Identidade: Geist herdada, aliases semânticos em claro/escuro, raio-base 10px, heading/topo alinhados às referências. Nenhum componente global, serviço ou entidade foi editado.
- QA novo: 12 cenários foundation + 9 cenários de identidade em Chromium passaram; quatro testes de contraste passaram; lint, typecheck, build isolado e diff check passaram. Duas execuções adicionais serviram apenas para capturas anteriores; não contam como 23 cenários de validação final.
- Comparações Penpot V2/antes/depois e Favoritos/Compra atual/Pedidos em `artifacts/qa/orders-retomada-r1/comparisons/`.
- Prévia local: http://localhost:3151/orders?search=Seis%20exemplos, com cópia sintética isolada da F3.
- Na data da entrega R1, a aprovação humana estava pendente. A mensagem combinada acima autorizou a continuação. O relatório vigente da entrega seguinte é [F4-R2-R3-R4.md](F4-R2-R3-R4.md).

## Entrega combinada — 29/10/2026

F4, R2 e R3 implementadas; R4 concluída nos cenários documentados. Lint, typecheck, build isolado e diff check passaram. Banco usado nas montagens de QA: cópia sintética identificada da F3, fora do checkout principal. Não houve commit, publicação ou alteração de ambiente de produção.

Relatório de conclusão: [F4-R2-R3-R4.md](F4-R2-R3-R4.md). Evidências em `artifacts/qa/orders-retomada-f4/`. Aceite humano desta entrega pendente. **Aguardando aprovação de Gabriel para iniciar a Fase 5.**

## Aprovação F4 e entrega F5/F6 — 29/10/2026

Gabriel aprovou F4 e autorizou expressamente a execução conjunta de F5/F6. O registro de pendência do parágrafo anterior é histórico e foi superado por essa mensagem.

Relatório vigente: [F5-F6.md](F5-F6.md). Evidências em `artifacts/qa/orders-phase56/`. A Fase 7 não foi iniciada. Aguardando revisão humana desta entrega e autorização para a auditoria final F7.
