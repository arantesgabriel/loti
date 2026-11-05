# Loti: contrato visual operacional

> Contrato vigente de identidade de Pedidos: seção 15 (retomada R1, 29/10/2026).
> As fontes/paletas locais V1 descritas abaixo são histórico das Fases 1–3.

## 1. Produto
Grupo privado que organiza favoritos, compras e envio coletivo. Pedidos deve permitir comparar quantidades e escolher somente unidades livres. Documentação canônica: `06_DESIGN.md`, `07_PRODUCT_VISUALS.md` e plano 39. Este resumo não substitui essas fontes.

## 2. Design Read
Pedidos é uma superfície de operação para o pequeno grupo, com linguagem neutra e quente, fonte Geist, números alinhados e detalhes progressivos. Next.js e componentes existentes. V2, M2, D8.

| Decisão | Intenção |
| --- | --- |
| Superfície | Pedidos e detalhe de Pacotes |
| Trabalho principal | Comparar unidades e reservar somente a disponibilidade |
| Direção | Tabela desktop; quantidades rotuladas no mobile; movimento discreto |
| Sistema | Tokens de `src/app/theme.css`, Button, PackageSurface e galeria QC |
| Evidência | Referências A/B/C/D da primeira refatoração e relatório residual de 28/10/2026 |

## 3. Direção e limites
Divisores e colunas substituem caixas repetidas. Laranja indica seleção ou próxima ação. Quantidades recebidas são acumuladas; não somar novamente as vinculadas como estoque adicional. Fotos não comprovam chegada ou aprovação. Preservar navegação e temas.

## 4. Tokens
O código de `src/app/theme.css` permanece a fonte de verdade dos dois temas.

```design-tokens
fonts: Geist
colors: #faf8f5, #ffffff, #f5f2ee, #221d21, #625b60, #f77014, #1c0113, #e9e4df, #f8f9fb, #f2f4f7, #17202d, #687385, #e6e9ee, #e86c2c, #b94d18, #157c4a, #e8f8ef, #3467a2, #edf4fd
radii: 0, 3px, 6px, 7px, 8px, 9px, 10px, 12px, 16px, 22px, 999px
```

### Tokens locais do freeze de Pedidos (Fase 1)

Os tokens globais acima continuam vigentes fora de Pedidos. A implementação faseada aprovada por Gabriel em 28/10/2026 usa os frames 04A/04B e mobile do arquivo Penpot `64ee36db-f4d2-8047-8008-dbff2f7d7205`. Valores medidos na revisão atual 133, com os mesmos IDs do manifesto do freeze; equivalência binária com a versão histórica não foi demonstrada pela API. Não restaurar o arquivo original para obter essa prova.

```design-tokens
fonts: Loti Inter Tight, Geist
colors: #f8f9fb, #ffffff, #f2f4f7, #17202d, #687385, #e6e9ee, #e86c2c, #b94d18, #157c4a, #e8f8ef, #3467a2, #edf4fd
radii: 0, 3px, 7px, 8px, 9px, 22px
```

| Decisão | Fase 1 |
| --- | --- |
| Superfície/público | Pedidos, operação do grupo privado |
| Trabalho principal | Preparar composição responsiva para os fluxos de listar, consultar e selecionar |
| Direção | Fonte Inter Tight local, superfícies claras discretas, sem coluna reservada com painel fechado |
| Sistema | Button, Surface/Radix e marcadores existentes; tokens restritos a `.orders-foundation`; cores dark derivadas do tema existente |
| Evidência | 04A fechado/aberto, 04B e M03 do handoff `audits/orders-design-freeze-2026-10-28/handoff/` |

Título desktop 29/700 e mobile 25/700; painel 22/700. Painel de 390px participa do grid a partir de 1200px; abaixo, sobreposição vertical inferior com raio superior de 22px. Entrada 220ms e saída 160ms, `translateY`, sem movimento reduzido. Usar Button preserva os estados/contraste existentes; não alterar cores de sidebar ou outras rotas. A variante não é ligada a dados reais na Fase 1: o harness sintético fica somente em testes, sem rota na aplicação. Listagem, tabs conectadas, 04B e montagem são fases posteriores; o conteúdo operacional antigo é preservado dentro do novo container.

Fonte auto-hospedada em `public/fonts/inter-tight/`, com licença SIL OFL e origem no [repositório oficial Google Fonts](https://github.com/google/fonts/tree/main/ofl/intertight). Não há requisição de fonte a terceiros no runtime. Não importar imagens de produto do protótipo.

## 5. Tipografia
Fonte Geist existente. Texto operacional de 13 px, metadados e cabeçalhos de 11–12 px; inputs mobile de 16 px. Quantidades e dinheiro com `tabular-nums`.

## 6. Espaçamento e layout
Escala existente de 4/8/12/16/24 px. Em largura insuficiente, a tabela assume linhas com quatro contagens rotuladas; não esconder dados nem criar rolagem global. Controles preservam altura mínima de 44 px.

## 7. Componentes
Reutilizar Button, Surface, ProductCategoryMarker e QcGalleryButton. Detalhes abrem na própria linha; chegada usa drawer existente. Encerrar custos é secundário às tarefas logísticas, sem mudar seus gates.

## 8. Movimento
Surgir (fade in), 180 ms, ease-out, somente no detalhamento recém-aberto. A abertura e o fechamento continuam imediatos; `prefers-reduced-motion` remove a animação. Nenhuma animação de números, seleção ou digitação.

## 9. Imagens e conteúdo
Marcadores de categoria de 24 px na tabela, SVG de 20 px. Fotos QC somente na galeria aberta explicitamente. Nenhuma capa ou preview novo na listagem.

## 10. Regras práticas
Comparar compradas, recebidas, disponíveis e vinculadas; revelar cancelamentos e quantidades por destino no detalhe. Manter pagamento e fotos identificáveis separadamente. Não converter ausência de fotos em avaliação de QC.

## 11. Decisões de 28/10/2026
Tabela semântica no desktop, layout rotulado abaixo de 1100 px, expansão por botão com estado anunciado. Com os mesmos 20 itens em 1440×900, meta mínima de duas vezes mais linhas completas visíveis. Evidência e limitações em `audits/UI_RESIDUAL_CORRECTIONS_2026-10-28.md`.

## 12. Referências
`design/PACKAGES_AND_COSTS_REFERENCES.md`: A (alinhamento financeiro), B (logística), C (formulários), D (mobile). `22_PACKAGES_AND_COSTS_UX_REFACTOR_PLAN.md`: resumo, descoberta, detalhe e edição contextual. Nenhuma identidade externa foi importada.

## 13. Freeze de Pedidos, Fase 2 (28/10/2026)

Para a listagem de Pedidos, esta seção substitui a composição anterior de nove colunas/quatro contagens visíveis. As demais superfícies mantêm os contratos anteriores. Referência: mesmos frames 04A fechado, M01 e M02 do manifesto do freeze, revisão atual 133 inspecionada via MCP.

Desktop: Produto / Etapa / Unidades / Custo / Ação, tabela integral de 1192px em 1500px com a sidebar existente. Mobile: linhas compactas com marcador funcional, identificação, etapa e disponibilidade; custo completo no detalhamento contextual. O marcador pode usar tile de 44px para reproduzir a composição do frame, mantendo SVG neutro de 22px, sem foto operacional.

Tabs desktop Todos / No armazém / Disponíveis; mobile Todos / Disponíveis / A caminho. O filtro ativo continua visível ao trocar viewport, sem limpar a consulta. `view` e etapa (`status`) são filtros distintos combinados no servidor. Filtros avançados abrem diálogo desktop e sheet inferior em tablet/mobile, com campos de etapa, conta, pessoa, origem e compra. Digitação busca após 300ms; Enter aplica imediatamente. A paginação é de 20 itens pelo leitor existente, com total SQL real e sem botões quando só há uma página.

Estados mistos têm badge “Etapas diferentes” e quantidades explicativas. Reserva em montagem continua no armazém, mas não está disponível para outra seleção. Conferência legada não ganha badge verde por possuir QC ou pagamento. Ausência financeira permanece “A conferir” ou “Parcial”, sem fabricar zero. Nenhuma fórmula, custo ou snapshot é refeito no componente.

Na F2 o clique em nome/marcador/linha revela os detalhes inline existentes do item correto. O link de compra de origem é explícito e separado. O novo 04B é F3; preparação/stepper são F4; gatilho global de QC é F5. Não antecipar esses fluxos nem criar controles decorativos na listagem.

## 14. Freeze de Pedidos, Fase 3 (29/10/2026)

Gabriel autorizou a próxima fase após a entrega da F2. O clique em nome/marcador/linha agora controla `item-detail(costItemId)` no único slot de painel; esta decisão substitui a expansão inline descrita acima. Nenhuma compra inteira é carregada como destino principal do clique. O painel deriva os dados da mesma resposta autorizada da listagem, sem novo endpoint ou estado financeiro paralelo. Durante atualização, erro ou ausência do item na página/filtros atuais, exibe feedback em vez de dados obsoletos.

| Intenção | Decisão |
| --- | --- |
| Superfície/público | Detalhe operacional para o grupo privado Loti |
| Tarefa principal | Conferir a disponibilidade, o custo e o QC de um único item sem perder a lista |
| Direção | 04B compacto; disponibilidade e total em destaque; origem resumida |
| Sistema | Tokens locais, marcador SVG, grid desktop e Radix/sheet inferior da F1 |
| Evidência | Frame 04B JBL e seis variantes; M07/M08 do Penpot reconectado; capturas reais em nove larguras |

Desktop mantém painel de 390px no grid; mobile/tablet abaixo de 1200px usa sheet inferior com rolagem interna. Seleção e filtros não dependem da visibilidade do painel. Preview e capa ficam exclusivamente na seção **Fotos QC**, usando cache, URLs privadas, renderer e galeria existentes. Não há foto na linha operacional. A galeria ampliada conserva a apresentação escura existente e recebe sheet vertical somente quando acionada neste contexto mobile; outros consumidores mantêm o padrão.

Quantidades compradas, recebidas, vinculadas e canceladas, participantes, conta e destinos continuam consultáveis; valores desconhecidos/parciais preservam o contrato do leitor. São informações adicionais do domínio em relação ao resumo ilustrativo do freeze. O campo numérico existente e a conferência de chegada continuam acessíveis; stepper/preparação final são F4 e os fluxos complementares finais são F6. Controles pendentes de edição/reembolso aparecem desabilitados com explicação. Sem nova API, migration, regra financeira ou pipeline QC.

## 15. Retomada V2 — R1, identidade e shell (29/10/2026)

Gabriel autorizou exclusivamente R1 por **“inicie r1”**, após a R0. Não há liberação de R2, R3, R4 ou F4. O registro vigente está em [loti-pedidos-retomada/registro-fases.md](loti-pedidos-retomada/registro-fases.md).

Pedidos herda a fonte Geist já carregada pelo layout, em desktop e mobile. A declaração `@font-face` local de Inter Tight foi retirada; seus arquivos preexistentes não foram excluídos. O Penpot V2 usa Inter: esse delta é deliberado conforme o contrato que prioriza a identidade real de Favoritos/Compra atual para tipografia global. Não se altera o Penpot nem a fonte de outras páginas.

Os aliases `--orders-*` recebem os tokens semânticos de `src/app/theme.css` em uma única direção. Não sobrescrevem mais `--background`, `--foreground`, `--primary` e demais tokens compartilhados. Assim, superfícies, bordas, controles, hover e estados de claro/escuro usam o mesmo sistema, inclusive nos portais Radix. Status continuam verde/azul pelos papéis `success`/`info`; o viewer QC conserva seus próprios tokens escuros existentes.

Cabeçalho: 30px/680 desktop e 27px/680 mobile, iguais às páginas de referência; subtítulo 14px/13px. Topo de 32px desktop e 22px mobile; separação de 26px/22px após o heading. O raio-base de controles é 10px. A largura útil integral, o painel de 390px e o breakpoint de 1200px permanecem. A sidebar, a ilha mobile e seus componentes não foram editados.

R1 não reorganiza tabela/filtros (R2), conteúdo do 04B/QC e superfícies de ações existentes (R3), nem libera stepper, preparação final ou importação global. Essas pendências continuam explícitas na matriz de paridade. Validação e evidências efetivas são registradas no relatório de R1, sem declarar paridade final antes de R4.

## 16. Entrega combinada F4 + R2/R3 e revisão R4 (29/10/2026)

Gabriel autorizou expressamente a F4 com R2/R3 incorporadas e R4 na conclusão. Esta autorização substitui os gates intermediários da seção anterior; F5–F7 permanecem bloqueadas. Ver `docs/loti-pedidos-retomada/F4-R2-R3-R4.md` e o registro vigente de fases.

Preparação reutiliza o único slot do workspace: 390px no desktop, sheet inferior abaixo de 1200px. Seleção por costItemId atravessa páginas/filtros; steppers respeitam 0 e disponibilidade efetiva. Leituras exatas limitadas e autorizadas do armazém reconferem seleção/revisões. A revisão permite criar pacote ou escolher um pacote elegível da mesma conta. A montagem usa o comando transacional existente, preservando a chave e o payload ao repetir uma tentativa sem resposta. O retorno abre o identificador real do pacote.

A toolbar com painel aberto ocupa uma linha, sem duplicar o CTA da preparação. O detalhe prioriza disponibilidade, total e galeria QC; quantidades, vínculos e componentes financeiros continuam em disclosures. O CTA de adição permanece no rodapé. Conferência de chegada existente usa sheet inferior no compacto. A fonte e os tokens são os mesmos de Favoritos/Compra atual. Fotografias permanecem exclusivamente na galeria QC.

## 17. F5/F6 — importação global e ações contextuais (29/10/2026)

Gabriel aprovou F4 e autorizou conjuntamente F5/F6. Esta mensagem supera o bloqueio desses dois blocos nos registros anteriores; F7 continua dependente de aprovação. Relatório vigente: [loti-pedidos-retomada/F5-F6.md](loti-pedidos-retomada/F5-F6.md).

O cabeçalho de Pedidos inclui foto+ exclusivamente para o gestor QC existente. A entrada aceita um JSON, mostra destinos por compra/data/conta/variação e exige confirmação de ambiguidades. O roteamento global compõe os manifests e lotes QC existentes; não há outra implementação de storage, deduplicação ou associação de mídia. Produtos que já possuem QC permanecem sem alteração conforme a política atual. Falhas parciais e retomada ficam explícitas por compra.

As ações do detalhe abrem formulários reais de custos, correção adicional e reembolso, com apresentação inferior no compacto. Snapshots originais continuam imutáveis; custos/divisão e correções usam os contratos existentes. A retirada de reservas para cancelar unidades é explícita. O resumo de origem preserva o item como contexto principal e oferece navegação completa somente por link secundário explícito. Não há imagens QC fora da galeria.
