# Riscos e gates de liberação da landing

Este documento protege o gerenciador e torna a aprovação futura verificável. Nenhum gate abaixo foi executado nesta auditoria. As únicas verificações realizadas agora são documentais, conforme o [índice](README.md).

## Registro de riscos

| ID | Risco | Gravidade / estágio bloqueado | Evidência e mitigação proposta | Evidência para liberar |
| --- | --- | --- | --- | --- |
| R01 | CTA de cadastro/gratuidade sem produto público | Crítica, bloqueia publicação da copy atual | `auth/config.ts` desabilita signup; C §3/01/07 e FAQ 1 são condicionais. Frente separada de produto, ou nova versão editorial aprovada. | Jornada anônima completa até workspace autorizado, oferta/limites verdadeiros e texto aceito; não basta abrir login. |
| R02 | Anunciar ferramentas planejadas | Alta, bloqueia faixa/nav/CTA/FAQ e condição estratégica de lançamento | Inventário não contém ferramentas públicas; planning é descoberta sem implementação. | Destino funcional sem cadastro e disponibilidade confirmada. Se omitir, aceite explícito da mudança de lançamento em todas as chamadas. |
| R03 | Prometer uso individual independente e privado | Alta, bloqueia alegação de autonomia | Favorites mostra dados de workspace; filtro Meus não limita visibilidade; não existe onboarding independente. | Política de acesso e fluxo individual aprovados e demonstrados, ou texto factual revisado. |
| R04 | Expor identidades, pedidos, saldos ou credenciais em mídia | Crítica, bloqueia produção/uso de capturas | App privado tem dados operacionais; screenshot público é copiável e persistente. Nunca capturar conta do grupo real. | Dataset sintético, autorização do ambiente, revisão de todos os pixels/metadados e manifesto aprovado. |
| R05 | Importar contexto privado na landing | Crítica, bloqueia integração | `(app)/layout` e `WorkspaceProvider` carregam dados, APIs e estados QC. | Grafo de imports e rede pública sem auth/DB/API privada por iniciativa da landing; nenhuma serialização de DTO privado. |
| R06 | Publicar/migrar involuntariamente com push | Crítica, bloqueia preview hospedado e release | Workflow em `.github/workflows/migrations.yml` roda migrations/deploy em dev/main, inclusive documentação. `vercel.json` não desliga todos os possíveis branches. | Gatilho real, environment, proteções e comandos revisados; autorização específica para cada efeito; artefato exato. Nenhum push nesta execução. |
| R07 | Compartilhar DB/segredos entre demo, preview e produção | Crítica, bloqueia demo/QA remoto | Driver abre conexão no import e scripts leem dotenv; testes provisionam schema. | Ambiente explicitamente identificado, recursos isolados e sem credenciais reais; sem defaults implícitos. |
| R08 | Motion captura scroll, cobre CTA ou muda significado | Alta, bloqueia L4/L6 | S0–S3 requer controller novo, login não é equivalente. | Teste bidirecional/resize/toque/teclado/no-JS/reduce e compreensão sem sugerir sincronização. |
| R09 | Reduced motion incompleto em JavaScript | Alta, bloqueia L4/L6 | CSS global cancela animações CSS, não loops JS novos. | Sem processamento espacial contínuo em reduce; mudança de preferência ao vivo respeitada; conteúdo estático equivalente. |
| R10 | Contraste e primeira faixa escura inconsistentes | Alta, bloqueia visual/QA | Tema global muda tokens; `--brand` dark é claro; hover/secundário divergem do briefing. | Mapa de tokens e boundary editorial aprovados, pares de contraste medidos, UI clara em Compras e demais blocos claros. |
| R11 | Capturas pesadas ou minúsculas no mobile | Alta, bloqueia QA | Não há assets finais/baseline; Cards mobile é uma coluna. | Fontes mobile autênticas, dimensões/sizes e recortes legíveis, carregamento e perfil de scroll medidos em condições declaradas. |
| R12 | Abrir indexação do produto privado ao corrigir SEO | Alta, bloqueia L5/L7 | Root tem noindex global; novas rotas podem herdar ou sobrescrever indevidamente. | Head/headers por rota e sitemap allowlist; privadas/auth/convites continuam noindex e autorizadas; previews noindex. |
| R13 | Mudança global afeta finanças, snapshots, QC ou sessões | Crítica, bloqueia integração/release | Mesmo root/CSS/build; invariantes em autorização e serviços transacionais. | Diff sem alterações indevidas; regressão autorizada com comparação de fixtures e histórico imutável; nenhuma mudança de regras. |
| R14 | Tratar relatos antigos de testes/deploy como resultado atual | Média, bloqueia declaração de prontidão | Cânone tem validações históricas e discrepância login/branch de produção. | Resultados contemporâneos do candidato, ambiente e escopo explicitados. Unknown não vira existente em produção. |
| R15 | Misturar alterações locais de outra frente ao publicar | Alta, bloqueia commit/release futuro | Working tree inicial já modificado; planning não rastreado. | Diff/artefato selecionado e revisado, preservação das mudanças do usuário, nenhuma inclusão ampla por `git add .`. |

Gravidades são avaliação desta auditoria, não incidentes observados em produção. Responsabilidade final por produto/oferta/publicação é do responsável pelo Loti; a futura implementação deve produzir evidências técnicas para revisão.

## Procedimento seguro proposto para dados e capturas demo

**Nenhum dado foi criado ou capturado agora.** Antes de executar qualquer item, autorizar explicitamente o ambiente, criação de contas/workspace, dados sintéticos e produção de mídia. Isso não autoriza produção, banco remoto, R2, emails reais ou migrations por consequência.

1. **Alvo isolado e identificado.** Preferir ambiente local descartável com schema previamente preparado e autorizado. Verificar a URL selecionada sem exibir segredos. Não clonar banco real, exportar registros do grupo ou reutilizar `.env` implicitamente. Se o schema exigir migrations locais, solicitar autorização específica para o alvo; `seed.ts` e `e2e-server.ts` as executam e não são atalhos permitidos.
2. **Identidades sintéticas.** Usar pessoas claramente fictícias com iniciais neutras, por exemplo Pessoa A/B/C e endereços `@loti.test`, sem reutilizar nomes/avatares do grupo inicial. Credenciais geradas só para a sessão local, nunca em Git, screenshot, log ou documento público. Transporte de email local/mocado; sem envio Resend. Não enfraquecer auth para facilitar captura.
3. **Dataset coerente e mínimo.** Favoritos com categorias funcionais, coleções genéricas e alguns preços conhecidos/pendentes. Uma compra atual e outra finalizada com acompanhamento de custos separado; nunca duas ativas no mesmo workspace. Itens e valores de ambas devem corresponder à história narrada, sem editar snapshots finalizados. Usar um participante para explicar item pessoal e múltiplos participantes para grupo, sem alegar fluxo pessoal independente ainda inexistente.
4. **Valores explicáveis.** Usar, por exemplo, preço de R$ 100,00 por unidade e quantidade 2 no dataset, com fretes/custos manuais coerentes e parcelas fechando em centavos pelo cálculo real do app. Manter estados desconhecido, conhecido, sem cobrança e pagamento manual distintos. Não editar a screenshot para inventar totais perfeitos; se precisar mudar exemplo, corrigir os dados no ambiente isolado por fluxo permitido antes de recapturar. Não executar transferências, pagamentos ou reembolsos reais.
5. **QC fora dos assets públicos.** Não importar JSON real, chamar HubBuy, acionar R2, usar foto do grupo, URL assinada ou cache de preview. As demonstrações de Favorites/Purchase/Costs usam marcadores e dados fictícios; não implementar ou preparar QC Phase 3 para esta finalidade. Se uma versão futura quiser demonstrar galeria QC, abrir pedido separado com mídia sintética/licenciada e autorização específica, sem extrapolar os gates atuais.
6. **Captura da aplicação real.** Fotografar a UI desktop/mobile real em tema claro no ambiente autorizado; Cards mobile mantém uma coluna se essa interpretação for aceita. Viewports iniciais propostos: 1440×900 e 390×844 para mídia principal; 320/768/1024 para QA. São propostas de validação herdadas dos testes existentes, não dimensões criativas congeladas.
7. **Remoções permitidas.** Cortar chrome do browser e margens desnecessárias sem alterar conteúdo, campos, status, colunas, logos ou totais. Não reconstruir UI, agregar cards de capturas diferentes para inventar mosaico, ocultar condição relevante de um valor ou apresentar preview desenhado do login como produto real.
8. **Manifesto e revisão humana.** Para cada arquivo: nome, hash, origem/versão do app, dataset/estado, viewport/tema, seção de destino, dimensões/peso, descrição alternativa proposta, autoria/licença, revisor e status de aceite. Sem email/ID/token de verdade. Conferir todos os pixels: cabeçalho, avatar, conta HubBuy, tooltip, toast, notas, links e identificadores. Inspecionar metadados embutidos e nomes de arquivos.
9. **Publicação de mídia.** Somente exports aprovados entram em `public/landing/`; originais de trabalho ficam fora do conteúdo público. Assets não aprovados não entram em OG/sitemap/página. Sem hotlink de galeria privada ou criação de bucket público.
10. **Encerramento do ambiente.** Descartar só recursos sintéticos pelo procedimento autorizado e após reter os exports aprovados. Não propor limpeza de DB/arquivos reais do usuário; sem exclusões recursivas genéricas.

## Checklist de não regressão do gerenciador

Esta é uma lista de verificação **futura**, não resultado de testes. Usar apenas ambientes e efeitos autorizados.

| Área protegida | Verificação mínima |
| --- | --- |
| Entrada/root | Enquanto em construção, `/` mantém redirect atual. Na promoção, comportamento para membro e visitante corresponde à decisão explícita. `/favorites` continua destino pós-login. |
| Login/recovery/verify/convites | Formulário, Enter, erros/loading, sessão/logout e retorno de convite preservados; criação continua token-gated até frente de expansão separada; verificação antes de novo membership. Não restaurar órbita ou alterar histórias como parte da landing. |
| Workspace/permissões | Visitante não lê APIs privadas; membro estrangeiro/outsider continua negado; Favorites owner-only nas mutações. |
| Favoritos | List/Cards, preferência, coleções e marcadores preservados; sem introduzir imagens operacionais ou alterar o layout para melhorar screenshot. |
| Compra/histórico | Uma ativa por workspace; snapshot independente; itens compartilhados contados uma vez; finalizados rejeitam mutação. |
| Pacotes/finanças/refunds | Valores, taxas capturadas, pagamentos, quantidades/parcelas, pedido/recebimento de refund e fechamento separados permanecem iguais nas fixtures. Não alterar bases nem cálculos para narrativa. |
| QC/R2 | Rotas privadas, cache/fallback e acesso por sessão preservados; nenhuma chamada de QC na landing, nenhuma capa/preview público criado ou layout Phase 3 adicionado. |
| Tema/mobile | Preferência de browser e drafts do app preservados após entrar/sair da landing; ilha mobile, drawer/foco e safe area sem regressão. |

Referências dos testes existentes e efeitos dos harnesses: [auditoria §8](CURRENT_STATE_AUDIT.md#8-qualidade-efeitos-e-deploy). Não invocar suites de integração/E2E nesta tarefa documental. Numa fase futura, autorização de executar a suite deve incluir seu provisionamento local ou usar uma estratégia alternativa previamente revisada.

## Gates de liberação e evidências exigidas

| Gate | Aprovação/evidência mínima | Bloqueio se ausente |
| --- | --- | --- |
| G-doc / L0 | Aceite do plano, decisões/condições registradas e estado da Fase criativa 7 explícito | Não começar L1 por aprovação implícita. |
| G-isolamento / L1 | Autorização de execução L1; diff/imports/rotas/tema locais revisados | Nenhum componente dependente de dados privados na rota pública. |
| G-demo / L2 | Autorização do ambiente, dados/capturas/assets e, se necessária, preparação de schema isolado separada | Não criar conta, seed, fixture, screenshot ou mídia final. |
| G-visual / L2–L3 | H1/copy factual/mapa de tokens, hero, mídia autêntica, cinco larguras e cartões simétricos aceitos | Não tratar grade fictícia ou demo ilegível como aceita. |
| G-motion / L4 | Estados S0–S3 e reversão; reduce/no-JS/teclado/toque; perfil de custo e cleanup | Manter candidato estático revisável; não publicar motion reprovado. |
| G-verdade / L5 | Oferta/CTA real, entrada individual verdadeira, ferramentas efetivas ou redução editorial formal, FAQ/links/SEO conferidos | Versão de aquisição completa não publicável. |
| G-QA / L6 | Baseline e comandos autorizados, resultados, assets revisados, a11y/performance, sem regressão atribuível à landing | Não declarar candidato pronto por testes históricos ou só compilação. |
| G-preview hospedado | Autorização específica do ambiente/commit/pipeline, Preview sem DB prod/segredo prod e noindex | Não fazer push/PR ou deploy para obter URL por conveniência. |
| G-release / L7 | Autorização separada com alvo/artefato, nenhuma migration acidental, comportamento final de `/`, URL/canonical e rollback aprovados | Nenhuma promoção/domínio/push release. |

## SEO, acessibilidade e desempenho antes do release

**SEO:** conferir HTML/head final de cada rota afetada. A landing pode permitir indexação em produção depois do aceite; login, convites, reset/verify, app e previews mantêm proteção de indexação pertinente. Sitemap por allowlist, sem IDs operacionais/tokens. Canonical/OG pertencem à URL e versão aprovadas; sem `AggregateRating`, depoimentos ou métricas inventadas. Não há autorização para redigir políticas legais ou habilitar analytics por inferência.

**Acessibilidade:** um H1, sequência de headings, regiões semânticas, link para conteúdo se necessário, alt útil em provas de UI e vazio em decoração, foco visível e não encoberto, tab/Shift+Tab/Enter/Space/Escape quando aplicável, toque confortável, zoom/reflow, FAQ com estado e conteúdo acessíveis. Validar contraste após escolher tokens reais; preservar texto e informação sem animação/JS. Movimento não aciona live region a cada frame e não impõe rolagem. Confirmar em revisão manual o significado transmitido pela metáfora.

**Desempenho:** medir baseline no início de implementação autorizada e fixar orçamento com o responsável, como pede B ACE-15. Registrar dispositivo, rede, build e estado de cache. Medir LCP/CLS, interações representativas, bytes de imagens/fontes/JS/CSS, CPU/paint e comportamento com viewport offscreen; distinguir laboratório de dados de campo. Reservar dimensões de mídia; só a prova inicial relevante ganha prioridade; demais capturas carregam depois. Não duplicar downloads desktop/mobile inadvertidamente nem servir originais enormes. Não instalar coletor/analytics para medir campo sem autorização própria.

## Condições operacionais de release e rollback

O workflow atual executa migrations e deploy em `dev`/`main`; confirmação booleana em dispatch manual **não impede push automático**. A configuração remota de approvals de GitHub Environments/Vercel não foi inspecionada e não pode ser presumida. `vercel.json` desabilita Git deploy desses dois branches, mas o workflow usa CLI/API e outros branches não estão explicitamente desabilitados ali.

A landing proposta não requer migration, Turso/R2 novos, mudança de segredo/origem ou infraestrutura. Antes de liberar, verificar o conjunto completo de migrations pendentes e escolher um caminho de publicação especificamente autorizado que não aplique efeitos de outra frente por acidente. Se o processo atual não permitir isso, registrar o bloqueio e pedir uma decisão separada de release/CI; não modificar infra por conta própria nem executar migrations “porque o pipeline pede”.

Registrar candidato/commit exato, diff incluído, artefato/deployment anterior e responsável pela reversão. Rollback da landing é retorno ao artefato anterior e ao comportamento prévio de `/`, sem rollback de dados. Não misturar mudanças locais preexistentes nem liberar dependências de expansão junto com marketing sem aceite próprio. Depois da publicação autorizada, conferir URL, CTA, login e acesso privado pelo roteiro de smoke aprovado, sem criar operações financeiras reais.

## Ponto de parada desta entrega

O material está pronto para **revisão do planejamento**, não para execução ou publicação. Pedir aprovação documental e decisões do lote 1; manter o lote 2 visível. O usuário pode aprovar o plano sem autorizar fase técnica alguma. Qualquer execução futura deve identificar explicitamente a fase autorizada, seus efeitos e o ambiente.
