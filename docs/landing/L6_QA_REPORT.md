# L6 — QA integrado e candidato local

Início em 23/10/2026, autorizado por “prossiga para a próxima etapa” após L5; retomada e fechamento desta rodada em **24/10/2026**. **Estado: rodada de QA executada; aceite integral de L6 bloqueado por 25 falhas operacionais E2E.** Quatro foram reproduzidas na base anterior à landing. Não há autorização de publicação.

## Ambiente, isolamento e candidato

Next.js em build de produção `.next-landing-l6`, Chromium instalado pelo Playwright, Windows/Node 24. Sem instalação de dependências. Preview em loopback na porta 3121 com `TURSO_DATABASE_URL=file::memory:`, token vazio e email desabilitado. O build não aplica migrations. Os bytes de `tsconfig.json` e `next-env.d.ts` foram preservados antes/depois da configuração automática de distDir do Next.

Base Git `6f0d10b67e4f22259fa5b67f4e565029d55272db`, branch `feat/landing-page`. Inventário do candidato em [CANDIDATE_FILES_L6.json](CANDIDATE_FILES_L6.json), mídia em [MEDIA_MANIFEST_L6.json](MEDIA_MANIFEST_L6.json), decisões operacionais em [L6_RELEASE_AND_ROLLBACK.md](L6_RELEASE_AND_ROLLBACK.md). A identificação local por SHA-256 não substitui congelar um commit antes de aprovar L7.

## Suíte reproduzível sem banco

Novos arquivos `playwright.landing.config.ts` e `tests/landing/landing.spec.ts`. A configuração separada aceita somente origem HTTP de loopback e visita um servidor já iniciado; não importa o webServer/seed/migrations do harness operacional. Usa Playwright e axe-core já instalados; não há nova dependência de runtime.

Com o preview iniciado, executar `npx --no-install playwright test -c playwright.landing.config.ts`. A suíte contém oito casos: cinco larguras (320/390/768/1024/1440), FAQ/destinos/head, reversão/redução ao vivo e conteúdo/navegação sem JS. Relatório JSON, screenshots e traces de falha ficam em `artifacts/qa/landing-l6/`, ignorado pelo Git.

## Resultados executados

| Verificação | Resultado / evidência |
| --- | --- |
| Lint e TypeScript | Passaram com os novos testes/configuração |
| Build final | Passou; landing e catálogo estáticos, cinco slugs SSG |
| Unitários existentes | **217/217 passaram**, sem alterar testes ou código operacional |
| Integrações autenticadas em memória | **119 passaram, 1 excluído** em nove arquivos; sem falhas. O caso excluído de lease QC exige outro arquivo de banco |
| Playwright landing no build final | **8/8 passaram**, incluindo axe WCAG A/AA nas cinco larguras |
| Jornada autenticada da landing | **2/2 passaram**: tema/view, grupo, restauração de sessão e logout pela UI atual |
| E2E operacional amplo | **39 passaram, 25 falharam, 2 ignorados**; não aprovado para release |
| Reprodução selecionada no HEAD original | Quatro casos falham com os mesmos erros, sem a landing; os demais não foram todos atribuídos |
| Axe em catálogo + cinco páginas de construção | Zero violações nas tags WCAG 2 A/AA, 2.1 AA e 2.2 AA em 320 e 1440; teste adicional de espaçamento de texto e foco visível passou |
| Motion integrado | S0/S1/S2/S3, igualdade exata no retorno, cinco larguras, resize, reduce ao vivo, zero frames contínuos em repouso/fora da cena |
| Entrada mobile | 21 amostras lentas nos dois sentidos, toque nativo, PageDown e orientação horizontal passaram |
| Navegação client | Dois ciclos landing → ferramenta → landing; observers desconectados ao sair e exatamente um par ao retornar |
| Privacidade na visita | Sem API privada ou rede externa; tema/preferência preservados; noindex mantido |
| Mídia | 11 arquivos, **377.681 bytes no inventário completo**, zero EXIF; fontes/proveniência em manifestos L2/L3/L5 |
| Browsers/dispositivos | Chromium desktop e emulação mobile; Firefox/WebKit e aparelhos físicos não disponíveis/inspecionados |

A primeira tentativa unitária no sandbox falhou ao abrir arquivos temporários SSR do Vitest (ENOENT). A mesma suíte no host local passou integralmente. Nenhum teste foi editado para contornar a falha; o log inicial foi preservado separadamente.

Os checks de acessibilidade automatizados não comprovam conformidade integral. Leitura por tecnologia assistiva e avaliação criativa/compreensão com pessoas continuam pendentes. As capturas reais, layout e copy já revisados em L2–L5 permanecem intactos; L6 acrescenta QA e documentação, sem mudar o produto.

## Baseline de desempenho

Três navegações frias por cenário, cache de rede desabilitado, build de produção, sem outras requisições externas. Desktop 1440×900: CPU normal, 20 ms de latência, download de 10 Mb/s. Mobile 390×844: CPU emulada 4× mais lenta, latência de 150 ms, download de 1,6 Mb/s. Resource Timing/PerformanceObserver e CDP locais, sem coletor de campo.

| Medida | Desktop | Mobile limitado |
| --- | --- | --- |
| LCP observado | 280–296 ms | 1.000–1.012 ms |
| CLS observado | 0,00038 | 0,01942 |
| Transferência inicial, incluindo HTML | 389.313 bytes | 296.555 bytes |
| Scripts iniciais | 141.324 bytes transferidos / 467.270 descomprimidos | Igual |
| Imagens iniciais | Duas imagens, variantes desktop somente | Duas imagens, variantes mobile somente |
| Clique real no FAQ até dois rAF | 28–29 ms | 15–19 ms |

A medida do FAQ é uma aproximação de pintura em laboratório; não é INP. O clique é real do navegador para não contar a expansão esperada do acordeão como deslocamento involuntário. O PNG social não é carregado como imagem visível da landing. Imagens seguintes são lazy, com dimensões reservadas; a captura reutilizada por transformação/jornada usa a mesma URL.

O responsável aprovou em LT40 o orçamento local de LCP ≤ 2,5 s, CLS ≤ 0,1 e transferência inicial ≤ 350 KB mobile / 450 KB desktop. As amostras ficam abaixo desses valores, mas **o orçamento foi aprovado pelo responsável em LT40**. Métricas de campo, INP real e metas para aparelhos físicos não foram estabelecidos.

## Matriz de aceite do Anexo B

“Passa tecnicamente” registra evidência local, não homologação humana nem autorização de lançamento. Alterações autorizadas de contrato ficam explícitas.

| Critério | Estado no candidato / evidência |
| --- | --- |
| ACE-01 Proposta/conversão | Ajustado por LT27: Acessar Loti → login funcional. Cadastro público e teste de compreensão não entregues nesta frente |
| ACE-02 Hero | Passa tecnicamente: headline, prova frontal real de Cards, fontes desktop/mobile e proporções conferidas |
| ACE-03 Transformação | Passa: scroll reversível, UI visível, labels sem sobreposição, equivalente estático/reduce |
| ACE-04 Jornada | Passa tecnicamente: Favoritos → Compras → custos/Pacotes, provas reais e alternância desktop; compreensão humana pendente |
| ACE-05 Contraste | Passa: somente Compras em `#1C0113`, interface clara, contraste de texto verificado |
| ACE-06 Contextos | Passa: cartões equivalentes e empilhados no mobile; FAQ esclarece acesso atual por grupo |
| ACE-07 Ferramentas | Ajustado por LT37: catálogo + cinco páginas de construção reais e públicas. Ferramentas ainda não fazem cálculos/consultas; isso impede afirmar o requisito original de operação plena |
| ACE-08 FAQ | Passa: seis respostas factuais, details/summary nativos, teclado e sem JS |
| ACE-09 Encerramento | Ajustado por LT27: CTA de acesso privado em vez de cadastro aberto, sem oferta comercial inexistente |
| ACE-10 Motion | Passa tecnicamente: etiquetas 2D e pequena caixa fosca SVG, sem loop/scroll-jacking; revisão criativa final pendente |
| ACE-11 Identidade | Passa: Geist local, tokens Loti e boundary claro preservados |
| ACE-12 Mobile | Passa em emulação: cinco larguras, toque, orientação, proporções e ausência de overflow |
| ACE-13 Acessibilidade | Checks locais passaram; avaliação com tecnologia assistiva e aparelhos reais permanece limite declarado |
| ACE-14 Privacidade | Passa: dataset sintético e mídia real de L2/L3, nomes fictícios, hashes/proveniência e zero EXIF |
| ACE-15 Desempenho | Passa no orçamento de laboratório aprovado em LT40: 6/6 amostras dentro dos limites |
| ACE-16 Escopo | Código operacional preservado; regressão executada, com falhas que bloqueiam o aceite integral |

## Regressão autenticada e pontos pendentes

O responsável autorizou em LT39 os testes locais descartáveis. Foram executadas migrations existentes apenas nas fixtures em memória e no novo arquivo `data/e2e-refunds-landing-l6-20261023.sqlite`, com seed fictício do harness, fake email local em `localhost:3101` e R2 desativado. Não há alvo real. Integrações: 119 passaram, 1 caso de lease QC que exigiria outro arquivo foi excluído explicitamente. Auth, email por transporte fake, favoritos, convites, compras, pacotes/custos, refunds, perfil e QC foram cobertos.

A suíte E2E original concluiu 66 casos no build de produção: **39 passaram, 25 falharam e 2 foram ignorados**. A triagem está em [L6_OPERATIONAL_FINDINGS.md](L6_OPERATIONAL_FINDINGS.md); o resultado não permite aprovar o candidato para publicação. Nenhum teste existente nem código de domínio foi modificado para acomodar falhas.

Dois testes novos em `tests/e2e/landing.spec.ts` foram executados em fixture nova e passaram. Usam a UI atual de Configurações/Ações da conta e verificam o retorno da landing ao gerenciador, persistência de view/tema, acesso ao grupo, sessão restaurada e logout nas outras abas. São checks complementares, não substituição silenciosa da suíte herdada. Os dois casos ignorados da suíte ampla exigem a fixture S3 opt-in, mantida desativada conforme o escopo autorizado.

A comparação por Git confirma que fontes operacionais, schema, scripts e E2E existentes são idênticos ao HEAD base. `baseline-source-proof.json` registra nove blobs relevantes, incluindo perfil, auth, root/CSS e testes afetados. Uma cópia íntegra do HEAD foi exportada para artefato ignorado e compilada, sem alterar o checkout. Quatro casos selecionados foram executados nessa base e reproduziram os mesmos erros do candidato: perfil/sessão, geometria dos Cards, exclusão de conta e capa QC. Os outros 21 casos não foram todos reproduzidos isoladamente; a comparação de fontes não permite atribuí-los automaticamente nem declarar ausência de regressões. A tela de perfil já usa “Configurações” e agrupa logout em “Ações da conta” no HEAD, enquanto alguns E2E procuram o heading “Seu perfil” ou logout sem escolher a aba.

O orçamento de laboratório foi aprovado em LT40 e suas seis amostras passaram. Permanecem a revisão visual humana, o aceite de lançamento para conversão/páginas de construção e o congelamento do SHA Git exato. Nenhum push, merge, PR, preview hospedado, banco real ou publicação ocorreu. L7 exige autorização própria e alvo/artefato/rollback concretos.

Os processos E2E foram encerrados e as fixtures arquivadas em artefatos ignorados; o arquivo autorizado não permanece em `data/`. O preview restaurado responde HTTP 200/noindex em `/landing`, `/ferramentas` e no destino de construção conferido. A aplicação operacional e as alterações preexistentes do usuário foram preservadas.

**Próximo gate:** tratar os achados operacionais antes de aprovar o candidato. O plano L6 determina não “corrigir domínio fora do escopo sem nova autorização”. Não se altera regra financeira, ledger, pagamento, snapshot ou apresentação QC Phase 3 para obter aprovação de testes. Nenhum resultado desta rodada autoriza L7 automaticamente.
