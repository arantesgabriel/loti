# LOTI — FASE 7 | ANEXO B
## Especificações de experiência e critérios de aceite

**Versão:** 0.1 · **Status:** especificação preliminar para futura implementação · **Data:** 22/10/2026

Este documento transforma decisões criativas aprovadas em verificações observáveis. **Itens ainda não foram testados nem implementados.** Qualquer mudança no gerenciador Loti está fora do escopo desta fase.

## 1. Critérios por seção

| ID | Requisito verificável | Evidência futura de aceite |
| --- | --- | --- |
| ACE-01 — Proposta e conversão | O visitante compreende a função de organização de importações; CTA prioritário é **Criar conta grátis**, com destino funcional quando publicado. | Revisão editorial, teste de compreensão e teste do destino real do botão. |
| ACE-02 — Hero | Headline centralizada; mockup frontal quase na largura máxima, com borda discreta, sombra leve e captura de **Favoritos em grade** da aplicação real. Cards legíveis. | Revisão visual em desktop/notebook e captura do estado da conta demo. |
| ACE-03 — Transformação | UI visível inicialmente; elementos dispersos chegam à organização; movimento ligado à rolagem e **reversível ao subir**, sem bloquear navegação. Estado final compreensível sem animação. | Registro visual nos dois sentidos do scroll e verificação com movimento reduzido. |
| ACE-04 — Jornada | Seções conectam Favoritos → Compras → Pacotes e custos; grandes interfaces reais e explicações curtas com alternância de lado no desktop. | Leitura sequencial, revisão das telas e teste de compreensão do produto após visita. |
| ACE-05 — Compras contrastante | Primeiro fundo contrastante da jornada aparece **somente em Compras**, na cor `#1C0113`, com **interface clara** em moldura legível. | Inspeção visual e de contraste; checagem de consistência com design system. |
| ACE-06 — Contextos | Individual e grupo têm dois cartões simétricos e densidade similar; no mobile empilham sem perda de importância. | Comparação entre cartões e revisão responsiva. |
| ACE-07 — Ferramentas | Faixa editorial clara secundária, mas descobrível; ferramentas anunciadas como públicas devem funcionar **sem cadastro** e existir no momento da publicação. | Conferência de links e uso não autenticado; retirar alegações se não estiverem disponíveis. |
| ACE-08 — FAQ | Perguntas curtas cobrem cadastro, funcionamento, grupos e ferramentas; respostas conferidas contra o produto real. | Auditoria editorial e funcional dos textos. |
| ACE-09 — Encerramento | CTA final mantém mensagem principal e caminho de cadastro; nenhuma oferta, plano, preço ou vantagem não publicada é anunciada. | Revisão de copy e teste de navegação. |

## 2. Critérios transversais

| ID | Requisito verificável | Evidência futura de aceite |
| --- | --- | --- |
| ACE-10 — Motion | Soft 3D pequenos e foscos, etiquetas e linhas 2D explicativas; entradas suaves e microinterações discretas; sem animações concorrentes ou scroll-jacking. | Storyboard revisado e observação em execução futura. |
| ACE-11 — Identidade | Geist e tokens oficiais do Loti utilizados; laranja sinaliza interação; cores semânticas usadas por significado. | Conferência contra `06_DESIGN.md` e tokens do produto. |
| ACE-12 — Mobile | Versão mobile usa captura real da interface mobile, reduz complexidade do motion, mantém conteúdo e ações sem rolagem horizontal indesejada. | Revisão em tamanhos de tela reais a definir, incluindo toque e legibilidade. |
| ACE-13 — Acessibilidade | Conteúdo essencial acessível por teclado, foco visível, contraste verificado, textos alternativos adequados e alternativa para `prefers-reduced-motion`. | Checklist de acessibilidade e testes manuais futuros. |
| ACE-14 — Privacidade e fidelidade | Imagens públicas derivam de conta demo com dados fictícios coerentes e UI real; nenhum nome, saldo, pedido ou dado pessoal de terceiros é exposto. | Inventário de capturas e inspeção de cada asset antes da publicação. |
| ACE-15 — Desempenho | Mídias e animações não devem impedir leitura, interação e carregamento útil; optar por abordagem leve conforme validação técnica posterior. | Medições em dispositivos/rede representativos; metas numéricas definidas somente quando houver baseline. |
| ACE-16 — Escopo | A landing não exige alterações de regras, dados, auth, rotas internas ou recursos do gerenciador atual sem autorização separada. | Revisão de escopo antes do planejamento de implementação. |

## 3. Dependências antes de aceitar como pronto para construção

1. Validar a redação final do hero e FAQ; direção de benefício e CTA estão definidas, mas nem toda microcopy está congelada.
2. Preparar a conta demonstrativa e capturas reais em desktop e mobile, especialmente Favoritos em grade, Compras e Custos.
3. Confirmar quais ferramentas abertas existem e quais podem receber links públicos.
4. Confirmar funcionamento real do cadastro, destinos e condições de planos no momento de publicação.
5. Verificar todos os tokens e componentes necessários no design system original.
6. Realizar inspeção visual responsiva e validação de acessibilidade em uma futura etapa autorizada.

## 4. O que este anexo deliberadamente não determina

- Não seleciona framework, pacote de motion, mecanismo 3D ou estratégia de hospedagem.
- Não define breakpoints, durações de animação, limiares de performance ou dimensões finais sem testar conteúdo e tecnologia.
- Não demanda criação de ferramentas, endpoints, migrações, planos ou alteração do aplicativo existente.
- Não permite uso público das capturas reais exploratórias contendo dados pessoais.

## 5. Status de aceite

**Critérios documentados:** ACE-01 a ACE-16 (proposta preliminar para revisão).  
**Critérios executados ou validados:** nenhum — implementação fora do escopo.  
**Fase 7:** em andamento e dependente de aprovação formal para encerramento.
