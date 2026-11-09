# Prompt mestre para agente — Handoff e planejamento de implementação da landing do Loti

> **Modo de trabalho solicitado:** investigação, preservação do contexto, documentação no projeto e planejamento por fases. **Não iniciar implementação nesta execução.**

## Sua missão

Você é responsável pelo handoff técnico-criativo da futura landing page do **Loti**. Receberá o ZIP `Loti_Landing_Briefing_e_Handoff.zip`, com o briefing criativo, anexos aprovados e fontes históricas. Sua missão é:

1. Ler integralmente o material fornecido e os documentos pertinentes do repositório.
2. Reconstruir as decisões aprovadas, limites de escopo e dependências de publicação, preservando a rastreabilidade.
3. Investigar, **somente em leitura**, o estado real da aplicação, stack, rotas, componentes, design system, autenticação, fluxos de cadastro, assets, deploy e limitações técnicas.
4. **Registrar no projeto** o contexto consolidado e um plano detalhado de implementação em fases, com riscos, dependências, critérios de aceite e checkpoints de aprovação.
5. Apresentar os resultados ao responsável para revisão. **Parar antes de qualquer implementação.**

## Fontes e precedência

No pacote, leia:

- `01_FASE_7/` — briefing mestre; Anexo A (decisões), B (especificações e aceite), C (Copy Deck) e D (Storyboard).
- `02_FASES_ANTERIORES/` — Estratégia e Posicionamento (Fase 2); Narrativa e Arquitetura de Conteúdo (Fase 4); Exploração Visual (Fase 6).
- `03_PRODUTO_E_IDENTIDADE/` — `00_CONTEXT.md`, `01_PRODUCT.md` e `06_DESIGN.md`.
- `README_PACOTE.md` — manifesto e status das aprovações.

**Estado formal**: Fases 1–6 encerradas conforme decisões anteriores; a Fase 6 foi formalmente ratificada. Na Fase 7, o usuário aprovou expressamente o **Anexo C (Copy Deck)** e o **Anexo D (Storyboard)**. A **Fase 7 permanece aberta**: o briefing mestre completo e o pacote de handoff ainda não receberam aprovação formal de encerramento. O pedido atual autoriza **documentação no repositório e planejamento**, não a implementação.

Use a seguinte precedência: (1) instruções de segurança e `AGENTS.md` do repositório; (2) código e comportamento existentes como prova de disponibilidade técnica; (3) decisões explícitas mais recentes do responsável; (4) briefing/anexos aprovados; (5) fontes históricas e explorações. Quando o código real conflitar com uma promessa editorial, **não alterar silenciosamente o produto nem inventar o recurso**: registrar o conflito, propor ajuste de comunicação ou dependência e solicitar decisão.

## Decisões de produto e posicionamento — obrigatórias

- O Loti é uma ferramenta para **organizar importações**, não um operador de importação, curso, marketplace, ERP ou serviço que efetua compras automaticamente.
- O **gerenciador** é o núcleo da proposta: Favoritos → Compras → Pacotes e Custos. A mensagem de aquisição é unificada, com exemplos equilibrados para uso **individual** e **em grupo**.
- Conceito criativo: **“Da bagunça à clareza”**. Copy principal aprovada editorialmente no Anexo C, incluindo proposta de H1 **“Suas importações, tudo em um só lugar.”** e CTA **“Criar conta grátis”**.
- Ferramentas gratuitas têm **faixa própria, clara e editorial**, mas são secundárias ao gerenciador. A intenção é acesso público sem cadastro; **não divulgar nomes, CTA, FAQ ou promessas de ferramentas sem confirmar que estão funcionais e públicas**.
- Não publicar preço ou condições do **Loti Pro** enquanto não houver oferta efetivamente disponível e validada. Existe planejamento estratégico Free + Pro, mas planejamento **não equivale a produto publicado**.
- Credibilidade deve vir de **demonstrações autênticas** e transparência: sem depoimentos fictícios, métricas inventadas, números de clientes fabricados ou funcionalidades demonstradas como reais quando não existem.

## Direção visual e motion aprovada — obrigatória

- **Fonte de verdade da identidade:** `06_DESIGN.md` e tokens reais do produto. Tipografia **Geist**; referências cromáticas conhecidas `#1C0113`, `#F77014`, `#E33C08`, `#221D21`, `#433D3D`, `#B7AEA5`; usar os neutros quentes oficiais. Não introduzir azul/roxo ou outra tipografia como identidade paralela.
- **Hero central**, composição editorial limpa, texto centralizado e captura real de **Favoritos em grade**, janela frontal, quase na largura máxima, com borda discreta e sombra muito suave.
- Capturas de **conta demonstrativa com dados fictícios**, porém da **aplicação real** (desktop e mobile). Nunca mostrar dados pessoais, pedidos ou saldos reais.
- A primeira faixa de fundo fortemente contrastante aparece **somente na seção Compras**, em `#1C0113`, com **interface clara** por cima.
- Jornada do gerenciador com interface dominante, texto compacto e alternância de posições. Uso individual e em grupo como **dois cartões simétricos**.
- Poucos objetos **soft 3D** pequenos, foscos e pontuais (caixas, produtos, etiquetas); cartões, linhas e etiquetas 2D somente quando explicarem relações.
- Transformação principal: itens/links dispersos se encaixam visualmente na interface de Favoritos já presente, com estados **S0 → S1 → S2 → S3**, reversíveis no scroll em ambas as direções. **É metáfora, não promessa de sincronização automática.**
- Mobile mantém a narrativa com interface mobile real, menos elementos e movimentos simplificados. Respeitar `prefers-reduced-motion`; evitar scroll-jacking, animações contínuas e perda de legibilidade.
- Demais movimentos: revelações suaves, foco discreto em áreas reais da UI e microinterações sutis.

## Proibições e limites desta execução

1. **Não implementar** landing, páginas, componentes, estilos, animações, rotas, APIs, integrações, migrations, testes de produto ou scripts de deploy.
2. **Não alterar** funcionalidades existentes, fluxo de cadastro/login, lógica financeira, permissões, QC, armazenamento, configuração de Vercel/Turso/R2 ou dependências.
3. **Não criar** conta demo nem inserir registros no banco sem autorização explícita; nesta etapa, descrever o procedimento seguro e requisitos dos dados de demonstração.
4. **Não instalar** bibliotecas, gerar assets finais nem coletar/ativar analytics.
5. **Não publicar**, abrir PR, efetuar merge, commit remoto ou deploy automaticamente.
6. A escrita autorizada restringe-se a **documentação de handoff e planejamento** em uma pasta apropriada do repositório, após avaliar convenções existentes. Preservar documentação prévia; não sobrescrever alterações do usuário. Se um conflito exigir modificação de arquivo existente, apresentar a proposta antes.
7. Cada fase de implementação proposta terá um **gate de aprovação explícita**. **Não interpretar aprovação do planejamento como autorização para executar qualquer fase.**

## Etapa 1 — Leitura e registro das decisões

- Verifique se o ZIP foi extraído corretamente e leia todos os documentos relevantes por inteiro.
- Produza uma matriz com: requisito/decisão; fonte exata e seção; situação (**aprovado**, **condicional**, **hipótese**, **dependente de confirmação**); consequência na implementação; critério de aceite.
- Preserve decisões anteriores e documente claramente qualquer inconsistência entre arquivos; não decida silenciosamente em casos de conflito.
- Registre especificamente que **Copy Deck e Storyboard estão aprovados como direção**, mas ainda exigem conferência de veracidade, acessibilidade e viabilidade no produto existente.

## Etapa 2 — Auditoria de código e viabilidade (somente leitura)

Investigue **o que realmente existe hoje** no projeto. Sem pressupor tecnologias além das constatadas:

1. **Arquitetura e rotas:** framework efetivo, roteamento, estrutura de pastas, layouts, páginas públicas/protegidas e compatibilidade da futura landing com a aplicação existente.
2. **Design system:** arquivos fonte dos tokens, Geist, componentes reutilizáveis, estados de hover/foco, temas, CSS e responsividade; identificar reaproveitamento seguro.
3. **Autenticação e CTA:** fluxo real de cadastro, convites, verificação de e-mail, login e redirecionamentos. Esclarecer se “Criar conta grátis” já é verdadeiro para visitantes externos.
4. **Demonstrações reais:** telas atuais de Favoritos (grade), Compra Atual, Pacotes e Custos e seus estados mobile; o que pode ser capturado em conta demo sem expor dados reais.
5. **Ferramentas gratuitas:** quais estão de fato implementadas, quais acessam dados/sessão e se há acesso público sem cadastro. Diferenciar roadmap de disponibilidade.
6. **Planos/comercial:** verificar o que está operacional e publicável; não antecipar Free/Pro ou preço planejado.
7. **SEO e desempenho:** infraestrutura de metadados, sitemap/robots quando aplicável, mídia, fonts, imagens responsivas, Core Web Vitals, arquitetura de renderização e limitações de motion.
8. **Acessibilidade e motion:** viabilidade de scroll reversível sem capturar a rolagem, reduced motion, navegação por teclado, contraste, anúncios e foco.
9. **Qualidade/deploy:** testes, lint, build, previews de branch, CI/CD e critérios de não regressão; identificar mudanças potencialmente perigosas em `main`/produção.

Para cada afirmação técnica, forneça **arquivo e caminho reais do repositório**, símbolo/rota/componente quando pertinente e evidência observada. Classifique **existente**, **parcial**, **ausente**, **desconhecido**. Faça apenas verificações que não provoquem escrita ou efeitos externos.

## Etapa 3 — Gap analysis e decisões a confirmar

- Compare cada seção e animação do briefing com o código observado; identifique o que pode ser reutilizado, criado isoladamente, depende de decisão comercial ou exige validação do responsável.
- Crie uma matriz **requisito → evidência no código → gap → impacto → risco → proposta**.
- Considere alternativas arquiteturais **somente se houver necessidade fundamentada**, com impacto estimado em Vercel, banco Turso, armazenamento R2, autenticação e build. Não propor migrações ou infraestrutura nova por preferência pessoal.
- **Priorize a preservação absoluta do gerenciador em produção**, suas regras financeiras, QC, sessões e dados. Prefira isolamento de páginas/rotas e componentes da landing quando isso for compatível com o código.
- Se houver perguntas que alterem materialmente o escopo, apresente-as em pequenos lotes, com recomendação e trade-offs. Se a skill `grill-me-with-docs` estiver disponível no seu ambiente, use-a para perguntas e decisões de produto; não invente sua existência caso não esteja instalada.

## Etapa 4 — Propor fases de implementação, sem executá-las

Monte uma **proposta de roadmap** (ajuste as fases após a auditoria; não trate esta lista como cronograma já aprovado):

- **Preparação e isolamento:** ambiente, rota pública, composição de layout, preservação de auth e integração segura ao deploy atual.
- **Base visual e conteúdo:** tokens/componentes, navegação, hero e seções editoriais, conteúdo validado, dados mockados seguros ou capturas reais da conta demo após autorização.
- **Jornada do gerenciador e responsividade:** Favorites → Compras → Pacotes e Custos, cartões individual/grupo, capturas desktop/mobile.
- **Motion/2D/3D:** transformação S0–S3 reversível, entradas leves e variações mobile/reduced motion, observando performance.
- **Ferramentas/SEO e conversão:** integrar apenas ferramentas públicas efetivas; garantir CTAs funcionais, FAQ verdadeiro, metadados e acessibilidade.
- **QA, revisão e publicação controlada:** auditoria visual e funcional, testes de regressão, performance/a11y, preview e checklist de aceite; publicar somente após autorização separada.

**Para cada fase**, entregue: objetivo e resultado visível; escopo e exclusões; entregáveis; dependências; componentes/arquivos prováveis; sequência técnica; avaliação de complexidade (P/M/G ou equivalente, justificada); riscos e mitigação; critérios de aceite testáveis; testes e evidências; possibilidade de rollback; **gate explícito de aprovação**. Identifique caminho crítico e fases paralelizáveis, mas não execute nenhuma.

## Artefatos a salvar no repositório

Respeitando a organização já existente, prefira uma pasta como `docs/landing/` **somente se não houver convenção superior**. Produza documentação clara e versionável:

1. `README.md` — índice do pacote, estado formal das aprovações, links para fontes.
2. `CREATIVE_BRIEF.md` ou cópia versionada do briefing mestre — sem reescrever decisões.
3. `DECISIONS_AND_TRACEABILITY.md` — decisões, fontes, hipóteses, pendências e conflitos.
4. `CURRENT_STATE_AUDIT.md` — auditoria de código com evidências e classificação de disponibilidade.
5. `GAP_ANALYSIS.md` — matriz de requisitos e lacunas.
6. `PHASED_IMPLEMENTATION_PLAN.md` — roadmap proposto, fases e gates de aceite.
7. `RISKS_AND_RELEASE_GATES.md` — proteção de dados, privacidade, SEO, acessibilidade, testes, preview e condições de publicação.

Mantenha os anexos **C e D integrais** e o Anexo B associado ao briefing. Se houver instruções do projeto exigindo nomes/pastas diferentes, adapte os caminhos e explique. **Não modifique arquivos fora do escopo documental.**

## Formato da entrega ao responsável

Ao terminar, responda em português com:

1. **Resumo executivo**: o que o projeto já suporta e onde há lacunas.
2. **Matriz de aderência** (por seção da landing), com evidências no código.
3. **Roadmap proposto por fases**, com complexidade e dependências.
4. **Arquivos documentais criados/alterados** e caminho no repositório.
5. **Riscos bloqueantes** e decisões pendentes, com recomendação crítica.
6. **Próximo gate de aprovação**: peça autorização para o plano antes de qualquer fase de implementação.

**Critério absoluto de parada:** após salvar e apresentar a documentação e o plano, encerre a execução. Não implemente a landing, não modifique o produto, não publique e não avance para a primeira fase técnica sem autorização explícita do responsável.
