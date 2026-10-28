# LOTI — FASE 7 | ANEXO D
## Storyboard de motion, linguagem 2D/3D e adaptação responsiva

**Versão:** 0.1 · **Estado:** direção criativa aprovada pelo responsável em 22/10/2026; não implementada · **Data original:** 22/10/2026  
**Origem:** Fases 3, 5 e 6; decisão D-7.05.  
**Limite:** roteiro de estados e interações, **sem código**, escolha de biblioteca, keyframes definitivos ou duração técnica inventada.

## 1. Intenção e princípios

**Ideia-mãe:** “Da bagunça à clareza”. O movimento deve fazer o usuário **entender o que o Loti organiza**, transmitindo suavidade, precisão e encaixes naturais.

- Hero começa limpo; a interface real é a protagonista.
- Uma transformação marcante, curta e pontual é o único momento de motion narrativo mais intenso.
- Outros movimentos são discretos: revelação suave, destaque de áreas reais e microinterações.
- Objetos soft 3D têm mesmo material/família, mas formas diferentes ao longo da página: pequenas caixas, produtos e etiquetas, acabamento fosco refinado e iluminação delicada.
- Linhas e etiquetas 2D explicam relações; nunca escondem informação da aplicação.
- O usuário conserva controle natural do scroll: **sem scroll-jacking**, loops de distração ou travamento da página.
- Movimento reduzido recebe um estado estático informativo equivalente.

## 2. Storyboard principal — transformação de Favoritos

**Cenário:** seção 02, após o hero, antes de Compras. A **interface de Favoritos do Loti já está visível** quando a cena começa. Os itens externos representam visualmente links dispersos, não um recurso de importação automática.

| Estado | Composição desktop | Transição ao avançar no scroll | Adaptação mobile | Equivalência sem motion |
| --- | --- | --- | --- | --- |
| **S0 — Preparação** | Janela frontal de Favoritos ocupa o foco. Poucos cartões/etiquetas 2D ficam ao redor, com espaçamento e contraste controlados. | Nenhuma animação obrigatória antes de a cena estar em vista. | UI mobile real ao centro; apenas 2–3 elementos externos, sem cruzar textos ou CTA. | Exibir interface organizada e título descritivo da transformação. |
| **S1 — Aproximação** | Elementos dispersos começam a percorrer trajetórias suaves em direção a regiões correspondentes da grade visível. | Progresso vinculado à rolagem; deslocamento e eventual ajuste discreto de opacidade/escala, sem rotações teatrais. | Trajetórias mais curtas, preferencialmente verticais; menos elementos simultâneos. | Manter a relação por etiquetas/legenda estática. |
| **S2 — Encaixe** | Cartões encontram posições na composição; linhas e etiquetas explicativas acompanham, sem sugerir novo botão ou ação. | Encaixe preciso, com finalização natural; evitar salto, explosão, overshoot exagerado ou confete. | Composição simples com entradas sequenciais sem mascarar itens reais. | Já mostrar estado final da grade e benefício escrito. |
| **S3 — Clareza** | Interface real fica plenamente legível; ornamentos diminuem importância e texto reforça centralização. | Movimento termina e a página continua naturalmente para a jornada do gerenciador. | Captura mobile pode ocupar quase toda a largura disponível, sem deformar proporções. | Mesmo conteúdo e hierarquia do estado final. |
| **S3 → S0 — Retorno** | Ao subir a página, cada passo pode ser desfeito, mantendo correspondência visual. | A transformação **acompanha o scroll em ambos os sentidos** e recupera o estado anterior sem reiniciar do nada. | Reversão dos poucos elementos usados no mobile. | Nenhuma reversão necessária na apresentação estática. |

### Observações de consistência

1. A interface não precisa mudar de dados para simular inserção real. A animação é um recurso narrativo; os produtos exibidos na UI devem existir na captura real da conta demo.
2. Evitar tratar a movimentação de links como sincronização real entre HubBuy, Goofish ou sites externos.
3. Se o espaço vertical disponível no mobile não permitir um encaixe claro, simplificar ainda mais a trajetória, preservando começo, transformação e resultado.
4. Não associar posição do scroll a um intervalo técnico fixo antes de testar composição e legibilidade.

## 3. Motion por seção — restante da landing

| Seção | Movimento proposto | O que **não** deve acontecer | Mobile / movimento reduzido |
| --- | --- | --- | --- |
| **01 — Hero** | Texto e captura chegam com revelação sutil e curta; um ou dois objetos 3D discretos podem entrar suavemente. | Não deixar CTA esperando uma animação, nem usar objetos flutuando continuamente diante do produto. | Priorizar conteúdo estático e captura mobile real; nenhuma entrada obrigatória. |
| **03A — Favoritos** | Área funcional real recebe realce suave quando explicada; texto curto acompanha a captura. | Não inventar cliques, filtros ou funcionalidades; não repetir grande transformação do scroll. | Destaque simples com recorte que caiba na tela; estado estático equivalente. |
| **03B — Compras** | Entrada suave da janela clara na faixa `#1C0113`, com foco visual em um conjunto reconhecível de produtos da compra. | Não animar a cor para efeitos de espetáculo, nem usar interface escura ou contraste insuficiente. | Janela clara com margens e texto legível; foco pode ser estático. |
| **03C — Pacotes e custos** | Realce de campos ou blocos relevantes da interface; no máximo uma revelação sutil. | Não inventar totais, gráficos ou números animados que pareçam dados financeiros reais. | Priorizar recorte correto e legível; sem transições de tabelas complexas. |
| **04 — Individual/grupo** | Entrada equivalente dos dois cartões, sem um deles parecer prioritário. | Não atribuir mais tempo, brilho ou tamanho a um público sem aprovação. | Cartões empilhados com mesma hierarquia, revelação simplificada. |
| **05 — Ferramentas públicas** | Microinteração do link e possível detalhe 2D explicativo. | Não animar ferramentas ainda inexistentes ou simular resultados não disponíveis. | Sem motion essencial; seção só aparece se pública e funcional. |
| **06 — FAQ** | Expansão de conteúdo clara, se houver controle de acordeão futuramente. | Não ocultar respostas por movimento, nem impor interação inacessível. | Conteúdo acessível por toque e teclado, sem dependência de animação. |
| **07 — CTA final** | Mudança suave de profundidade/posição do botão no hover; foco visível. | Não aplicar motion insistente ou pulsante ao CTA. | Estado de toque/pressionado claro e estável. |

## 4. Linguagem 2D e família soft 3D

| Elemento | Função visual | Material / tratamento | Uso |
| --- | --- | --- | --- |
| Cartão 2D | Representar link ou produto disperso | Bordas e sombras discretas; neutros da marca | Principalmente S0–S2 da transformação |
| Etiqueta 2D | Sinalizar correspondência ou etapa | Texto curto, hierarquia secundária | Apenas onde acrescentar compreensão |
| Linha 2D | Mostrar ligação causal ou deslocamento | Fina, sem excesso de setas/ícones | Pontual nas transições |
| Caixa soft 3D | Remeter ao universo de importação | Fosco, luz delicada, escala pequena | Uma ou outra seção, sem encobrir UI |
| Produto soft 3D | Dar concretude sem competir com a captura | Mesma família de material e acabamento | Pontual no hero ou jornada |
| Etiqueta física soft 3D | Conectar metáfora logística e produto | Refinada, baixo contraste relativo | Pontual, próxima de uma explicação real |

**Atenção:** não usar o 3D como substituto da interface. A identidade cromática é a do `06_DESIGN.md`; não introduzir uma nova cor de apoio forte como identidade paralela.

## 5. Microinterações e estados de controle

- **Primário:** o botão usa a cor de interação aprovada e transita discretamente para o estado hover (`#E33C08` quando aplicável no sistema oficial); foco perceptível para teclado.
- **Secundário:** link com sinalização sutil de hover e foco; não usar microanimações como único indício de clicabilidade.
- **Cartões funcionais:** responder apenas se forem realmente interativos; cartões puramente explicativos não devem parecer botões.
- **Pressionado / loading:** estados só serão especificados após confirmação do comportamento real do link/ação.

## 6. Verificações de acessibilidade e desempenho

- O título, CTA e conteúdo essencial permanecem visíveis sem esperar animações.
- A versão com `prefers-reduced-motion` preserva mesma mensagem, hierarquia e links, substituindo movimento espacial por estado estático adequado.
- Teclado e foco nunca dependem da posição da cena no scroll.
- Evitar transformação que prenda rolagem, provoque layout shift ou esconda partes legíveis de capturas.
- Validar tamanho/peso dos assets antes de escolher técnica. Não definir bibliotecas, formatos finais ou metas numéricas sem contexto de implementação.
- Quando movimento e captura entrarem em conflito, **priorizar a leitura da interface real**.

## 7. Critérios de aceite do storyboard — documentação

- [x] Estados S0–S3 e retorno S3→S0 aceitos como roteiro conceitual.
- [x] Adaptação mobile descrita e aceita como direção.
- [x] Alternativa sem movimento prevista no storyboard.
- [x] Foco de cada seção descrito sobre a interface real, sem funcionalidade fictícia.
- [x] Linguagem 2D e 3D aceita como direção.
- [x] Geist e paleta oficial adotados como referências obrigatórias.
- [x] Nenhuma implementação realizada nesta fase.

**Importante:** essas marcações registram a aprovação documental da direção; não representam teste de acessibilidade, medição de desempenho ou homologação de uma animação executável.

**Status:** storyboard revisado e aprovado como direção de motion. Não implementado nem homologado tecnicamente. Fase 7 permanece aberta.
