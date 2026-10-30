# Matriz de paridade — retomada Pedidos

R0 concluída em 29/10/2026. R1 entregue para aprovação; resultados detalhados em R1.md. Status abaixo distingue escopo visual de funcionamento já existente.

| IDs | AS-IS na R0 | TO-BE / gate |
| --- | --- | --- |
| F1-01, F1-02 | Paleta fria V1 e Inter Tight exclusiva | R1: Geist e tema compartilhados |
| F1-03 | Button/Surface existentes com identidade alterada por overrides | R1: herdar tokens e raio-base; sem clones |
| F1-04 | Base grid/sheet já existente, validada parcialmente | R1: verificar nove larguras, claro/escuro, retorno de foco |
| F1-05 | Heading 29/25, topo 40/24, escala distinta das referências | R1: heading 30/27, topo 32/22; refinamentos de toolbar/grid ficam R2 |
| F2-01 | Grid fechado ocupa largura útil, sem coluna fantasma | Preservar e testar; R2 confirma paridade de composição |
| F2-02 | Cinco colunas funcionais; toolbar com detalhe aberto quebra linha | R2: ajustar alinhamento/densidade e toolbar |
| F2-03 | Item e variação pela costItemId; marcadores sem fotografias | Preservar |
| F2-04, F2-05 | SQL/filtros/URL/paginação e feedback existentes | R2: manter lógica e corrigir apresentação |
| F2-06, F2-07 | Lista mobile própria e filtro inferior existentes | R2: comparação com M01/M16/M17 e testes dos controles |
| F3-01, F3-05 | JBL/Baseus alternam dados próprios | Preservar e repetir na regressão R3 |
| F3-02 | Painel 390px no grid; fecha e devolve largura | Preservar |
| F3-03 | Composição detalhada empurra QC/origem para baixo | R3: hierarquia compacta sem eliminar dados obrigatórios |
| F3-04 | Galeria/renderer/cache/serviços reaproveitados | R3: testes com/sem QC e permissões; pipeline intacto |
| F3-06 | Detalhe inferior, mas chegada usa slide-in horizontal | R3: adaptar apenas apresentação de ações existentes |
| F3-07, F3-08 | Parte dos casos/foco verificados; aceite completo pendente | R3/R4: variantes, textos longos, scroll, Escape e contexto |
| REG-01, REG-02 | Referências visuais/código de Favoritos e Compra atual | R1 mede identidade; R4 completa regressão funcional |
| REG-03 | Serviços QC existentes; Pacotes não alterado | R4: regressão completa sem nova importação real |
| REG-04 | R0: lint/typecheck/build e 67 testes direcionados passaram | Registrar checks novos por bloco, sem acumular contagens antigas |

## Frames de referência inspecionados na R0

Desktop: 04A fechado `a1bbb7fd-3432-8020-8008-dc1025ad5d01`; 04A preparação `a1bbb7fd-3432-8020-8008-dc0414fc70a0`; 04B JBL `a1bbb7fd-3432-8020-8008-dc043cdce618`; Anker `a1bbb7fd-3432-8020-8008-dc0d2b624202`; Baseus `a1bbb7fd-3432-8020-8008-dc0d2d28483a`.

Mobile: M01 `a1bbb7fd-3432-8020-8008-dc06d1144484`; M07 `a1bbb7fd-3432-8020-8008-dc086358ee0a`; M12 `a1bbb7fd-3432-8020-8008-dc09daadba75`; M13 `a1bbb7fd-3432-8020-8008-dc09db842368`; M14 `a1bbb7fd-3432-8020-8008-dc09dc03b0c0`; M16 `a1bbb7fd-3432-8020-8008-dc0ac2aff7b8`; M17 `a1bbb7fd-3432-8020-8008-dc0ac4f85156`.

04A fechado, 04B JBL, M01 e M07 foram também exportados e inspecionados visualmente na R0. A R1 reconfirmou o arquivo, marcador V2, revisão 168 e propriedades de fundo/fonte/título de 04A fechado via MCP antes da edição.

## Resultado R1

| Critério | Resultado no escopo de R1 | Evidência |
| --- | --- | --- |
| F1-01, F1-02 | OK: fonte, foreground e heading iguais às duas referências; fundo igual ao tema | `tests/orders-identity/identity.spec.ts`, nove cenários, dois temas |
| F1-03 | OK na base: aliases semânticos e raio-base; Button/Surface/marcadores preservados | CSS e capturas comparativas; sem novos componentes |
| F1-04 | OK nos cenários verificados: sem overflow global, painel contido e foco retornado | Nove larguras de identidade + 12 cenários foundation |
| F1-05 | Topo e escala corrigidos; alinhamentos de tabela/toolbar continuam R2 | Recorte das três páginas e comparações antes/depois |
| REG-01, REG-02 | Identidade e shell preservados; arquivos das referências não alterados | Comparação de estilos/shell; hashes de seis fontes compartilhadas |
| REG-03 | Sem alteração de QC/Pacotes; regressão completa não executada em R1 | Escopo CSS apenas; pendência R3/R4 |
| REG-04 | Lint/typecheck/build/diff, 21 cenários Chromium e 4 testes de contraste passaram | Logs de `artifacts/qa/orders-retomada-r1/` |

R1 não aprova a paridade integral F1–F3. Pendências de densidade/lista, toolbar aberta, hierarquia 04B e superfícies horizontais preexistentes permanecem nos gates R2/R3/R4. Não há aceite humano presumido.

## Entrega combinada F4 + R2/R3, revisão R4

Atualização de 29/10/2026: autorização explícita combinada de Gabriel registrada em `registro-fases.md`. A tabela abaixo atualiza o estado anterior; relatório/evidências em [F4-R2-R3-R4.md](F4-R2-R3-R4.md).

| Critérios | Resultado verificado |
| --- | --- |
| F1-01 a F1-05 | Identidade R1 revalidada em nove resoluções, dois temas; Geist, tokens e shell compartilhados preservados |
| F2-01, F2-02 | Tabela fechada com 1192px e aberta com 800px em viewport 1500px; painel 390px; toolbar sem CTA em segunda linha |
| F2-03 a F2-07 | Identidade por item, filtros AND, URL, paginação, estados e lista mobile: 14 cenários da fixture F2 passaram |
| F3-01 a F3-03, F3-05 | Seis exemplos reais distintos; hierarquia compacta, total visível e informações completas em disclosures; origem e CTA acessíveis |
| F3-04 | QC existente: preview, zoom, capa, troca de foto, recuperação de erro e target adicional distintos; fotos confinadas à galeria |
| F3-06 a F3-08 | Sheets inferiores no compacto, inclusive chegada; movimento vertical/reduced motion, rolagem, resize, Escape, backdrop e foco revalidados |
| F4.1 a F4.4 | Preparação, stepper, remoção, revisão, consulta exata, falha de leitura, conta incompatível, conflito, retry e montagem/associação reais na cópia sintética |
| REG-01, REG-02 | Referências visuais Favoritos/Compra atual em nove resoluções/dois temas; 54 testes integrados de favoritos, compras, finalização e correções |
| REG-03 | Galeria existente e regressões de domínio financeiro preservadas; pacote real criado/associado/aberto no navegador local |
| REG-04 | 137 unitários/integrados + 64 cenários Chromium distintos passaram; lint, typecheck, build isolado, hashes e diff check passaram |

R4 concluída tecnicamente no escopo documentado. Não equivale a comparação pixel a pixel integral do arquivo histórico, certificação geral de acessibilidade ou execução da suíte global inteira. Não há aceite humano presumido. F5–F7 não foram iniciadas.

## Continuação F5/F6

Após a aprovação explícita de F4, Gabriel autorizou F5 e F6 conjuntamente. A importação global QC e as ações contextuais reais foram implementadas; o estado histórico de F5/F6 não iniciadas acima foi superado. O relatório [F5-F6.md](F5-F6.md) contém escopo, referências MCP, limites, resultados e evidências. A auditoria final F7 ainda não foi iniciada.
