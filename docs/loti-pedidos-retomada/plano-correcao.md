# Pedidos — estabilização R0–R4

Data: 29/10/2026. Branch: `feat/orders`. HEAD inicial: `2f547155ea31d67fa86978cca7e53329c1f05918`. Alterações locais F1–F3 preservadas; sem commits automáticos.

## Intenção

| Decisão | Registro |
| --- | --- |
| Superfície/público | Pedidos, operação do grupo privado Loti |
| Trabalho principal | Consultar os itens e sua disponibilidade sem perder o contexto |
| Direção | Identidade quente e discreta de Favoritos/Compra atual; composição V2 de Pedidos |
| Sistema | Geist, theme.css, Button, Surface/Radix, Lucide e marcadores SVG existentes |
| Evidência | Auditoria R0, código real, Penpot V2 e capturas sintéticas antes/depois |

## Autoridade

Arquivo Penpot `64ee36db-f4d2-8047-8008-dbff2f7d7205`, páginas Pedidos Loti e Pedidos · Mobile. Marcador verificado via MCP: **DESIGN FREEZE V2 · Pedidos Loti · paleta e tipografia harmonizadas com Favoritos · 29-10-2026**. Revisão atual observada: 168. Não foi restaurado o snapshot, nem comprovada igualdade integral entre a revisão atual e a versão histórica.

Composição/estados: Penpot V2. Identidade global: Favoritos e Compra atual reais. Dados/regras: domínio existente. Inter no protótipo não autoriza uma segunda fonte em Pedidos; usar Geist compartilhada. Sidebar do frame mede 230px; a aplicação existente usa 240px em 1500px. Preservar a sidebar e os breakpoints compartilhados.

## Gates

**Atualização vigente:** Gabriel autorizou expressamente F4 + R2 + R3 + R4 em uma única execução. Os gates individuais abaixo descrevem o plano da R0; foram substituídos para esses blocos pela autorização registrada em `registro-fases.md`. F5–F7 continuam bloqueadas.

**Atualização seguinte:** Gabriel aprovou F4 e autorizou F5/F6 conjuntamente. Ambas foram implementadas conforme [F5-F6.md](F5-F6.md). F7 permanece não iniciada e dependente de autorização. As referências de bloqueio anteriores são históricas.

1. **R1 — identidade e shell:** fonte e aliases semânticos; topo, título, superfícies, bordas e raio-base. Preservar grid, foco e estados atuais. Autorizada por “inicie r1”.
2. **R2 — tabela e filtros:** toolbar aberta, hierarquia/densidade, tabs, paginação, estados e lista mobile. Depende de nova aprovação.
3. **R3 — detalhe e QC existente:** hierarquia compacta 04B/M07, consulta de informações completas, superfícies inferiores nas ações já acessíveis e regressão de galerias. Sem novas regras financeiras. Depende de nova aprovação.
4. **R4 — paridade final:** nove viewports, temas, contraste, teclado/foco, múltiplos itens/QC e regressões de Favoritos, Compra atual e Pacotes. Depende de nova aprovação.

F4 foi liberada na autorização combinada. F5–F7 originais continuam bloqueadas. Sem mudanças de schema, migrations de ambiente, storage, autenticação, fórmulas ou produção. Fotografias permanecem na galeria QC; não criar slots em linhas.

## Reutilização e riscos

- Manter OrdersWorkspace, OrdersCatalog, OrderDetailPanel, Button, Surface e QcGalleryButton. Não duplicar o shell.
- Aliases somente do tema para Pedidos, sem relações circulares ou redefinição da paleta global.
- Manter a escolha do item por costItemId e os targets QC discriminados.
- Detalhe usa a resposta atual da lista; item fora dos filtros continua com feedback explícito.
- Conferir chegada e confirmação de montagem ainda usam o PackageSurface horizontal; corrigir apresentação em R3 sem antecipar negócio F4/F6.
- Regressão completa de galeria com imagens e Pacotes é gate posterior; não inferir esse aceite a partir de testes de identidade.

## QA isolado

Evidências: `artifacts/qa/orders-retomada-r1/`. A configuração `playwright.orders-identity.config.ts` usa somente localhost:3151 e não inicia seed/reset/migration. É necessário iniciar previamente a cópia isolada da aplicação com a cópia identificada da fixture F3, sem `.env` nem credenciais externas. Nesta execução a cópia fica fora do repositório, no diretório de visualizações desta conversa, `r0-build/`, reaproveitado da R0. O build nessa cópia não altera next-env ou tsconfigs do checkout original.

O harness de foundation continua independente de banco/autenticação. Sua fonte QA é o mesmo arquivo Geist local usado pela aplicação. Capturas anteriores F1–F3 não são sobrescritas.
