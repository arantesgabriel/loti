# Loti — Fase 0: preparação da investigação

Data: 21/10/2026, America/Sao_Paulo.
Estado: preparação concluída; plano submetido ao usuário; Fase 1 não autorizada.
Autorização: mensagem do usuário “Instale a skill `grill-me-with-docs` / inicie a fase 0”, seguida da exigência de usar a versão de Matt Pocock.

## Objetivo e escopo

Preparar um planejamento técnico e estratégico para a expansão do Loti em uma plataforma brasileira de apoio à importação. Loti Ferramentas e Loti Gestão são divisões conceituais de um mesmo ecossistema; sua topologia técnica ainda será avaliada.

O resultado final será documentação aprovada, sem desenvolvimento. A expansão será estudada a partir do sistema atual, preservando suas funcionalidades e os acessos existentes. As cinco ferramentas são candidatas à descoberta, não especificações aprovadas: impostos de importação, custo final, conversão de moedas, referências de valores e rateio.

## Fontes consultadas e limites desta fase

- Pedido anexado pelo usuário: “LOTI — Planejamento Estratégico, Auditoria e Arquitetura para Expansão da Plataforma”.
- Instruções AGENTS.md fornecidas na conversa; o arquivo foi lido na recepção inicial, antes da delimitação completa do pedido. Também houve uma consulta inicial a `git status --short`, sem alterações. Nenhum código de aplicação foi investigado.
- Skill de instalação e arquivos oficiais de `grill-with-docs`, `grilling` e `domain-modeling`, incluindo os formatos de glossário e ADR.
- Recursos do ambiente estritamente necessários à localização e instalação das skills.

Não foram auditados código, esquema, infraestrutura, ambientes ou dados. Vercel, Turso/libSQL, Better Auth e Cloudflare R2 são contexto declarado a confirmar na Fase 1. Não há conclusão sobre capacidade, custos, segurança ou funcionamento dos pipelines.

## Verificação da skill

Origem oficial: https://github.com/mattpocock/skills.

| Recurso | Caminho na origem | Situação |
|---|---|---|
| `grill-with-docs` | `skills/engineering/grill-with-docs/SKILL.md` | Instalado e lido |
| `grilling` | `skills/productivity/grilling/SKILL.md` | Instalado e lido |
| `domain-modeling` | `skills/engineering/domain-modeling/SKILL.md` | Instalado e lido |
| Formatos | `GLOSSARY-FORMAT.md` e `ADR-FORMAT.md` em `domain-modeling` | Instalados e lidos |

Destino: `C:/Users/Gabriel/.codex/skills/`, em diretórios com os nomes oficiais acima. O nome atual na origem é `grill-with-docs`, embora o pedido inicial diga `grill-me-with-docs`. Não foi criada uma cópia renomeada da versão oficial.

Correção de instalação: uma adaptação de `arthur-debert/dodot` foi instalada inicialmente. Após a correção do usuário, foi retirada das skills ativas e preservada em `C:/Users/Gabriel/.codex/skill-backups/grill-me-with-docs-third-party-20261021`. Ela não orienta este planejamento.

A instalação oficial foi confirmada pelo instalador e pela leitura dos arquivos locais. A descoberta automática será atualizada no próximo turno; as instruções já foram carregadas explicitamente nesta sessão. A Fase 0 verifica a preparação do método; não equivale à realização das entrevistas de produto.

## Restrições de execução

1. Cada fase depende de aprovação explícita e termina com nova solicitação de autorização. A autorização da Fase 0 não abrange a Fase 1.
2. Investigação do sistema exclusivamente por leitura, apenas no escopo da fase autorizada.
3. Não alterar arquivos existentes, comportamento, rotas, componentes, autenticação, sessões, regras financeiras, QC, integrações ou configuração.
4. Não executar migrations, operações de escrita no banco, instalações de dependências do projeto, testes ou benchmarks com efeitos colaterais, deploy, commits ou PRs.
5. Não criar contas, configurar serviços, alterar ambientes remotos ou solicitar/expor credenciais secretas.
6. Criar documentação nova somente neste diretório isolado, durante fases autorizadas. Não substituir documentação canônica nem alterar glossários ou ADRs preexistentes.
7. A instalação das skills pessoais é a exceção especificamente autorizada pelo usuário; não autoriza mudanças no projeto.
8. Futuras necessidades de alteração exigem proposta com motivo, módulos/arquivos, alternativas, risco, testes, rollback e autorização individual.

As regras deste trabalho prevalecem sobre a execução autônoma entre fases prevista nas instruções gerais do repositório. O estudo de cadastro público, câmbio ou outras extensões não autoriza mudar as exclusões do MVP atual. Divergências entre proposta futura e regra vigente serão explicitadas, sem alteração do sistema.

## Método de investigação e participação

### Entrevista segundo a versão oficial

- Mapear uma árvore de decisões e suas dependências.
- Em cada rodada, apresentar as questões cujos pré-requisitos já estão resolvidos. Questões dependentes de respostas ainda abertas ficam para a rodada seguinte.
- Numerar as perguntas, apresentar contexto, alternativas, vantagens, desvantagens, custos/consequências e uma recomendação fundamentada. Redigir de modo que “sim” aceite a recomendação.
- Aguardar as respostas e recalcular as próximas questões. Nenhuma recomendação se torna decisão por ausência de resposta.
- Levantar fatos consultáveis em vez de transferir essa tarefa ao usuário. A skill prevê subagentes para fatos do ambiente; qualquer investigação delegada ficará restrita à leitura e à fase autorizada. Nenhum subagente foi necessário nesta preparação.
- Discutir cenários concretos e ambiguidades de linguagem; registrar termos resolvidos no glossário isolado e decisões quando aprovadas.
- Encerrar a entrevista quando não houver ramos silenciosamente presumidos e o usuário confirmar o entendimento comum.

O procedimento oficial atual usa rodadas, não a regra de uma pergunta por vez da adaptação retirada. Não serão executados comandos de log, ferramentas ou fluxos de entrega da adaptação anterior.

### Evidências e documentação

Na Fase 1, ler primeiro a documentação canônica na ordem determinada em AGENTS.md, o prompt de execução e os handoffs aplicáveis, antes de cruzar alegações com código e configurações. Não editar esses documentos. Evidenciar funcionalidades preservadas, regras de autorização, snapshots históricos, finanças e QC como fronteiras da expansão.

Cada fato técnico será acompanhado de arquivo/linha ou fonte verificável e limitação da consulta. Separar: declaração do usuário, intenção documentada, implementação constatada e estado remoto efetivamente verificado. Arquivo de pipeline não prova execução bem-sucedida; configuração no repositório não prova o estado de produção.

Nas fases pertinentes, pesquisar legislação, preços, limites e APIs em fontes oficiais, registrando data, modalidade/plano e condições de uso. Não inferir API oficial nem capacidade contratada. Consultas remotas serão de leitura, dentro do escopo autorizado e dos acessos disponíveis.

Estimativas terão premissas explícitas, fórmulas, faixas e sensibilidade. Distinguir cadastros, MAU, DAU, requisições e simultaneidade. A comunidade de mais de 4 mil pessoas é público potencial declarado, não evidência de carga.

## Sequência e critérios de conclusão

| Fase | Atividades e consultas previstas | Entregáveis | Critério de conclusão |
|---|---|---|---|
| 0 — Preparação | Pedido, restrições, origem oficial da skill e método | Este plano, registro inicial e glossário | Skill verificada; escopo, limites, pendências e próximos passos explícitos |
| 1 — Mapeamento e auditoria | Docs canônicos e handoffs, estrutura, dependências, módulos, rotas, schema, autorização, finanças, QC, configs e evidências de deploy; sem executar o sistema | Inventário técnico, mapa de módulos e integrações, arquitetura atual, fronteiras de preservação, riscos e lacunas | Compreensão suficiente para a expansão, com evidências e limitações; sem alegar auditoria exaustiva |
| 2 — Descoberta de produto | Entrevistas sobre as cinco candidatas e necessidades compartilhadas, apoiadas na auditoria | Matriz de funcionalidades, conceitos, fluxos, requisitos, regras aprovadas, aceitação e prioridade inicial | Separação clara entre existente, novo aprovado e ideia futura; decisões pendentes visíveis |
| 3 — Free/Pro e monetização | Acesso público/autenticado, Beta, limites, permissões, assinatura, provedores brasileiros e proteção dos atuais | Matriz Free/Pro, modelo conceitual de acesso, política de transição e cobrança preliminar | Unidade de assinatura e direitos discutidos sem presumir extensão de benefícios ao grupo; sem contratar/configurar serviços |
| 4 — Capacidade e arquitetura | Banco, backend, storage, integrações, cache, segurança, LGPD, observabilidade, backup, cenários de uso e custos verificáveis | Diagnóstico, demanda estimada, custos fixos/variáveis, alternativas, riscos, arquitetura recomendada e evolução gradual | Comparar manter, ajustar e mudar; classificar necessário/opcional/adiado com evidências; recomendações submetidas ao usuário |
| 5 — Experiência pública | Entrevistas sobre rotas, navegação, Beta/Pro, cadastro, salvamento, integração com Gestão e desktop/mobile | Arquitetura de informação, jornadas, rotas propostas, requisitos de UX e pontos de integração | Experiência proposta avaliada sem desenvolver telas nem alterar navegação |
| 6 — Consolidação | Revisar consistência entre evidências, respostas e aprovações | PRD macro, especificações por ferramenta aprovada, arquitetura, Free/Pro, roadmap e decisões | Documentos rastreáveis, dependências e aprovações de implementação explícitas; aprovação final solicitada |

Ao concluir cada fase: informar o que foi investigado, descobertas com evidências, decisões aprovadas, recomendações, riscos, pendências e proposta da próxima fase. Não iniciar a próxima antes da resposta.

## Registro inicial de decisões e hipóteses

### Decisões já aprovadas no pedido

| ID | Definição | Origem |
|---|---|---|
| D01 | Preservação integral do sistema e dos acessos atuais; desenvolvimento fora do escopo | Seções 2 e 3.5 |
| D02 | Evoluir para plataforma brasileira de apoio à importação, inicialmente com foco HubBuy e abertura futura a outros intermediadores | Seção 3.1 |
| D03 | Mesma marca, domínio `useloti.com` e ecossistema; Ferramentas/Gestão são divisões conceituais | Seção 3.2 |
| D04 | Somente Free e Pro; Pro como assinatura única da plataforma | Seção 3.3 |
| D05 | Novas ferramentas inicialmente gratuitas no Beta, inclusive recursos destinados a Pro; cobrança exige decisão futura | Seção 3.4 |
| D06 | Preservar rotas públicas após o Beta; transição por autorização/permissões e comunicação antecipada | Seção 3.4 |
| D07 | Referências de valores devem ser rastreáveis e contextualizadas, sem incentivar subdeclaração | Seção 4.4 |
| D08 | Aprovação individual de fases e decisões relevantes com o usuário | Seções 2.2 e 2.3 |
| D09 | Usar a skill original do Matt Pocock; instalação e início da Fase 0 autorizados | Mensagens desta conversa |

Essas definições vêm do usuário. Não houve aprovação adicional de funcionalidade, arquitetura ou política comercial nesta fase.

### Hipóteses a validar

- H01: R$ 19,90/mês como preço-alvo, sem autorização para cobrança.
- H02: parceria possível com Eneba para pesquisa, validação e divulgação; não há parceria confirmada nem autorização para contato.
- H03: comunidade declarada de mais de 4 mil pessoas como canal potencial; adoção, frequência e simultaneidade desconhecidas.
- H04: valor e viabilidade das cinco ferramentas candidatas; escopo, prioridade e regras ainda não aprovados.
- H05: suficiência da infraestrutura atual e eventual necessidade de extensão; nenhuma conclusão técnica nesta fase.

### Recomendações ainda não aprovadas

- R01: usar primeiro a auditoria para delimitar o que preservar e só depois decidir integrações ou reutilização de lógica.
- R02: comparar custos e riscos de manutenção da arquitetura com ajustes incrementais antes de propor separações estruturais.
- R03: em cada ferramenta, avaliar demanda, custo recorrente de manutenção e qualidade das fontes antes de priorizar a implementação.

## Árvore inicial de questões pendentes

Este é um mapa para as fases futuras, não um questionário a responder agora. Cada ramo será refinado após a auditoria e as respostas anteriores.

| Ramo | Decisões a construir com o usuário | Pré-requisitos / fase |
|---|---|---|
| Público e sucesso | Qual problema e perfil priorizar? Como medir uso recorrente, qualidade e disposição a pagar? | Evidências da Fase 1; descoberta na Fase 2 |
| Cinco candidatas | Quais entram no primeiro lançamento, com quais entradas, saídas, erros, limites e critérios de aceitação? | Público/problemas; Fase 2 |
| Referências de valores | Há dados reais e manutenção viável? Qual enquadramento evita referências enganosas? | Objetivo da ferramenta, fontes oficiais e amostra; Fases 2/4 |
| Simulações e gestão | O que salvar, por quanto tempo, para quem e com qual integração futura? | Fluxos aprovados e fronteiras existentes; Fases 2/3/4 |
| Assinatura e colaboração | Pro pertence à pessoa ou ao grupo? Como tratar convidados, administradores e contas HubBuy? | Modelo atual e benefícios propostos; Fase 3 |
| Beta e proteção | Como preservar os atuais, avisar sobre cobrança e tratar fundadores? Quais limites e gatilhos para encerrar Beta? | Escopo/benefícios e modelo de acesso; Fase 3 |
| Sustentabilidade | Qual orçamento mensal aceitável, tolerância a falhas, retenção e necessidades de recuperação? | Demanda e requisitos; perguntar antes de fechar projeções na Fase 4 |
| Arquitetura | Mesma aplicação/banco ou separação parcial? Quais ajustes são realmente necessários? | Auditoria, requisitos, acesso, demanda e orçamento; Fase 4, refinamento na Fase 5 |
| Navegação | Como visitantes chegam às ferramentas e transitam para conta e Gestão? | Escopo e políticas de acesso; Fase 5 |

A lista não aprova contas públicas, integrações, automações, notificações, planos adicionais, infraestrutura nova ou ferramentas futuras. Frete, peso volumétrico, comparação de modalidades e rastreamento permanecem fora do escopo inicial até autorização específica.

## Riscos e pontos de atenção

| Risco | Impacto potencial | Criticidade inicial | Tratamento no planejamento |
|---|---|---|---|
| Expandir acessos ou compartilhar lógica crítica sem fronteiras explícitas | Regressão financeira, exposição de dados ou perda de acesso atual | Alta | Mapear invariantes e autorização na Fase 1; mudanças futuras sujeitas a autorização individual |
| Confundir divisão conceitual com separação de aplicações/bancos | Complexidade e custo sem necessidade demonstrada | Média | Comparar alternativas nas Fases 4/5 |
| Estimativas tributárias, cambiais ou de referência sem fonte/contexto | Resultados enganosos e perda de confiança | Alta | Verificação oficial e definição de atualização, limites e comunicação |
| Confundir assinatura individual com benefícios do grupo | Acesso indevido e modelo comercial incoerente | Alta | Decisão explícita na Fase 3 com cenários de convidados e participantes |
| Tratar comunidade potencial como usuários simultâneos | Custos e dimensionamento distorcidos | Média | Cenários de 100/500/1.000/4.000 ativos com premissas e picos separados |
| Falta de evidência sobre planos e ambientes remotos | Conclusões incorretas sobre capacidade, preço ou rollback | Alta | Registrar limites; solicitar apenas informação não secreta quando necessária |
| Tratar recomendação como decisão aprovada | Desenvolvimento futuro baseado em pressupostos | Alta | Registro por estado, resposta do usuário e fase de origem |

As criticidades são avaliações preliminares do planejamento, não vulnerabilidades constatadas no sistema.

## Organização dos próximos documentos

Este diretório é exclusivo do planejamento de expansão. Este arquivo registra preparação e estado inicial; `GLOSSARY.md` contém apenas termos já definidos no pedido. Relatórios de fases futuras, especificações e ADRs serão criados quando houver conteúdo e autorização, sem gerar documentos vazios nem sobrescrever os existentes.

Registro de cada nova decisão: identificador, pergunta/contexto, opções, recomendação, resposta explícita, data/fase, estado e dependências. Em caso de contradição, preservar o histórico e pedir esclarecimento. Criar ADR somente para decisão difícil de reverter, surpreendente sem contexto e resultante de uma escolha real; vinculá-lo à especificação correspondente neste diretório.

## Próxima fase proposta — aguardando autorização

Fase 1: compreender arquitetura, funcionalidades, dados, autorização, infraestrutura e deploy por leitura. Consultar a documentação canônica na ordem exigida, os handoffs aplicáveis, arquivos do projeto e evidências remotas de leitura disponíveis dentro do escopo aprovado. Priorizar fronteiras relevantes à expansão, sem auditoria linha a linha e sem executar testes, migrations ou aplicação.

Entregar inventário técnico, mapa dos módulos e integrações, arquitetura atual, regras a preservar, riscos e limitações. Nenhuma correção, refatoração ou mudança será executada mesmo que a auditoria identifique oportunidade.

Autorização pendente: aprovação do plano da Fase 0 e início da Fase 1.
