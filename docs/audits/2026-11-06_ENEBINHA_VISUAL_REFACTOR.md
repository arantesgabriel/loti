# /enebinha: refatoração visual V2.1 D7

Data: 06/11/2026. Escopo: apresentação pública da rota, sem publicação, alteração de dados, dependências ou regras privadas.

## R0: diagnóstico e intenção

Superfície de consulta pública para a curadoria de @enebinha. Trabalho principal: escolher categoria, pesquisar e abrir o destino original. Linguagem quente e neutra do Loti, fonte Geist, densidade compacta, hero aberto e um CTA primário. Next.js, tokens reais, V2/M2/D5. O movimento editorial aprovado é apenas o letreiro contínuo (ticker), linear a aproximadamente 40 px/s.

| Problema | Evidência no baseline | Correção | Arquivo |
|---|---|---|---|
| Tema desconectado | CSS usava `--bg-canvas`, `--text-primary`, `--border-default` e raios inexistentes no tema atual | Usar `--background`, `--foreground`, `--border`, `--primary` etc. | enebinha.module.css |
| Molduras e superfícies aninhadas | heroCard, mascotFrame, catalogCard, sidebar e cada link tinham contorno/superfície | Hero/catalog/sidebar abertos; superfície compartilhada para linhas | enebinha.module.css |
| Seleção e campo paralelos ao kit | Tabs pretas, busca junto das abas, CTA marrom local | Padrões globais segmented/search-input/button-primary | enebinha-page.tsx |
| Entrada extensa | selectedCategory inicial `all`, seis links por grupo simultaneamente | Eletrônicos, seis links, expansão contextual reversível | enebinha-page.tsx |
| Dialog manual | Backdrop/dialog sem trap de foco nem Escape | Surface/Radix, retorno de foco e sheet inferior local | enebinha-page.tsx |
| PEND público | Texto técnico em 73 posições de logo sem arquivo | Removido texto técnico; audit permanece explícito; D7 bloqueada | supplier-marquee.tsx |

Ordem executada: shell/hero, faixa/destaques, catálogo, responsividade/temas e QA. Reutilizados Button, Surface, ThemeProvider, Radix DropdownMenu já instalado, segmented e search-input globais. O header da landing foi inspecionado: seus anchors internos de marketing não atendem a esta rota. Foram mantidos sua marca Bookmark preenchida e proporções, com ações locais de curadoria; o componente global não foi alterado. Não existe componente React global separado para Tabs/Input neste repositório; seus padrões CSS reais foram reutilizados.

Worktree começou com alterações de onboarding em andamento. Elas foram preservadas. O HEAD mudou durante a tarefa por trabalho externo; nenhum reset/checkout ou commit foi feito. Arquivos de tipos/configuração que Next gerou para QA são limpos seletivamente ao final.

## Evidências e materiais

- Prompt fornecido em Downloads/FireShot, decisão D7, especificação V2.1, inventário JSON e auditoria CSV.
- Previews PNG do handoff (incluindo composição desktop), como referência visual do PDF. O PDF binário não foi renderizado novamente nesta sessão.
- Tema e componentes do código atual, Favoritos/Compra e capturas aprovadas em `artifacts/qa/dark-mode/verified/`.
- Antes: capturas reais já existentes do QA anterior em `artifacts/qa/enebinha/`. Cópias identificadas como before em `artifacts/qa/enebinha-refactor/`. As tentativas de obter baseline novo expiraram durante compilação local; estas imagens anteriores correspondem aos problemas confirmados no código.
- Depois: capturas reais desta execução em `artifacts/qa/enebinha-refactor/`.
- Nenhuma captura adicional foi anexada ao chat. O Penpot foi consultado, mas retornou `No Penpot instance connected for user token`; não foi possível confrontar o arquivo Loti Design System.

## Matriz V01–V12

| ID | Estado | Evidência |
|---|---|---|
| V01 | Corrigido | Hero e mascote sem borda/sombra/superfície própria; imagens desktop/mobile |
| V02 | Parcial, D7 bloqueada | Nenhum PEND público; 0/73 identidades verificadas; nenhuma identidade fabricada |
| V03 | Corrigido | Uma categoria e seis links inicialmente; expandir 17/recolher 6; teste funcional |
| V04 | Corrigido | Removidas molduras de hero, catálogo, sidebar e linhas; HubBuy mantém uma superfície funcional |
| V05 | Corrigido | segmented global e seleção suave por primary-soft/primary-ink, sem laranja sólido |
| V06 | Corrigido | search-input global em linha própria, ícone 19px, limpar contextual e foco explícito |
| V07 | Corrigido | Quantidades consolidadas no cabeçalho do catálogo; títulos das abas sem repetição |
| V08 | Corrigido | Linhas com divisores dentro de superfície compartilhada; 2 colunas desktop/1 mobile |
| V09 | Corrigido | Marca proporcional ao produto, tema em menu compacto, compartilhar por ícone |
| V10 | Corrigido | button-primary global e aviso de indicação; Vitrine como linha secundária |
| V11 | Corrigido | Fonte Geist herdada, texto de linha 14px, metadados 12px, título 24–28px |
| V12 | Não reproduzido | Nenhum elemento rosa da rota no código/capturas; nenhuma ferramenta global alterada |

## D7: bloqueio de assets

**0/73 logos/avatares de fornecedores verificados. Todos os 73 faltam.** O manifest mantém 35 avatares bloqueados e 38 ativos pendentes (3 avatares e 35 logos). O handoff contém somente o mascote e as 20 marcas editoriais, que não identificam os vendedores. As origens e nomes de cada fornecedor estão em `docs/handoffs/enebinha-v2-1-d7/supplier-logo-audit.csv`; esse CSV é a lista completa de pendências. Não foi alterado nem reclassificado como concluído.

As tentativas de inspeção pública nesta sessão não disponibilizaram o perfil Goofish nem o catálogo Yupoo. Nenhum novo asset foi obtido ou autenticado. São necessários os arquivos oficiais de cada conta/fornecedor, com correspondência ao supplier_id e URL de proveniência, para concluir D7. A faixa permanece temporariamente com nomes, sem placeholders técnicos ou espaços vazios. Isso é uma limitação explícita da entrega, não conformidade D7. A estrutura aceita somente identidades com status verificado; a ausência não impede consultar os 73 links estáticos.

## Integridade

Manifest e inventário não foram editados. Os testes conferem as URLs literais, parâmetros HubBuy, 73 fornecedores/7 categorias, Vitrine, oito guias, seis links comunitários, HubBuy e 20 marcas editoriais. Nenhum asset original foi alterado.

SHA-256 do mascote confirmado: `487929fe8501456317095c37c8cafd808db8a8733ae64b85f07aa6013bf096bf`. Dimensões 780×355, object-fit contain, sem filtros ou recortes.

## QA

Baseline: typecheck/lint e seis testes de integridade passaram. Build inicial compilou/validou TypeScript, mas falhou em mkdir de `.next/server/app/login.segments/login` por EPERM; também emitiu aviso do segredo default de Better Auth. A repetição usa `.next-enebinha-build` e segredo sintético apenas no processo, sem gravar env/secrets.

- Unitários: 39 arquivos, **257 testes passaram**, com um worker. A primeira tentativa em sandbox falhou no cache temporário; repetição isolada passou.
- Typecheck e lint globais passaram após a implementação.
- **Build final isolado passou** (`.next-enebinha-final`), incluindo compilação, TypeScript, geração de páginas e traces.
- **E2E final: 8/8 passaram no build de produção local**, 21,4 s; zero violações axe nos cinco breakpoints em claro/escuro, zero overflow horizontal.
- Testes de axe incluem WCAG A/AA em 320, 390, 768, 1440 e 1920 px, temas light/dark, sem filtros de supressão. Testes cobrem URLs integrais, expansão/recolhimento, busca fora da categoria inicial, vazio/limpar, tabs por teclado, sheet/Escape/retorno de foco, reduced motion e Sistema seguindo o SO. O teste de zoom usa viewport equivalente a 200% (720×450 para desktop 1440×900); não é controle manual de zoom do navegador.
- Ajustes guiados por QA: sublinhado no link de rodapé; cores simultâneas nas seleções durante mudança de tema para evitar contraste transitório; fundo Canvas de esquema claro apenas nos assets editoriais para manter logos pretos legíveis.
- Lint visual: sem erros. Avisos de marquee/máscara são intencionais e exigidos no prompt; pontuação em textos existentes foi preservada. Raios locais seguem 06_DESIGN.md e Surface; não foram criados tokens globais.

## Revisão local e capturas

Rodar `npm run dev` e abrir `/enebinha`. Nesta sessão, servidor de revisão isolado: `http://localhost:3204/enebinha`.

| Largura | Antes (QA anterior) | Depois (esta execução) |
|---|---|---|
| 390 | `artifacts/qa/enebinha-refactor/before-390.png` | `artifacts/qa/enebinha-refactor/enebinha-390x844-light.png` |
| 1440 | `artifacts/qa/enebinha-refactor/before-1440.png` | `artifacts/qa/enebinha-refactor/enebinha-1440x900-light.png` |

Capturas adicionais cobrem 320/768/1920, light/dark, e reduced motion. Chromium apenas; Safari/Firefox e dispositivo físico não foram verificados. Sem deploy, merge, push, migração, alteração de banco ou mudança intencional em áreas privadas.


## Arquivos entregues

- `src/components/enebinha/enebinha-page.tsx`: padrões globais, hero, catálogo progressivo, busca integral, tema compacto e Surface.
- `src/components/enebinha/enebinha.module.css`: estilos locais com tokens atuais, superfícies e responsividade.
- `src/components/enebinha/supplier-marquee.tsx`: remoção dos placeholders públicos sem inventar ativos.
- `tests/e2e/enebinha.spec.ts`: regressões e matriz visual/acessível da rota.
- Este relatório, com diagnóstico R0, aceite V01–V12 e bloqueio D7.

Medição real do ticker: sequência 7965,02 px / 199 s = **40,03 px/s**; deslocamento de **−20,68 px em aproximadamente 500 ms**, pausa manual e fora da viewport confirmadas. Evidência JSON em `artifacts/qa/enebinha-refactor/motion.json`. Loop tem duas sequências de igual largura, gap incluído em cada sequência e tradução de −50% da pista; clone decorativo sem tab stops. Reduced motion mantém sequência única rolável, sem autoplay.

Verificação final de código: lint global e typecheck passaram; checagem de whitespace passou. Removidas somente entradas `.next-enebinha-*` adicionadas automaticamente ao tsconfig, imports de tipos Next gerados pelo QA e três linhas de log produzidas pelo navegador. Nenhuma alteração de onboarding foi desfeita.
