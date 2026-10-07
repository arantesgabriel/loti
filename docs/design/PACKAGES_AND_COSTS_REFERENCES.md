# Pacotes e custos — referências visuais aprovadas

Decisão fechada pelo usuário em **07/10/2026** após apresentação das imagens: **A + B como estrutura principal, C nos formulários e D no mobile**.

Este documento registra referências de composição e hierarquia. As imagens são dos projetos originais, não mockups do Loti. Implementar com a identidade e os componentes locais existentes. Não copiar assets nem hotlinkar estas imagens na aplicação; os embeds abaixo são apenas documentação de referência.

Contrato de telas, fases e aceite: [plano de implementação](../21_PACKAGES_AND_COSTS_PLAN.md#7-experiência-de-uso). Identidade: [design canônico](../06_DESIGN.md).

## A — Tabela financeira

**Projeto:** [B2B SaaS Invoice Table UI UX Design — QuickSuite](https://dribbble.com/shots/27562404-B2B-SaaS-Invoice-Table-UI-UX-Design-QuickSuite), Filllo — SaaS Design Agency.

![A — QuickSuite: tabela financeira, filtros com contagens e badges](https://cdn.dribbble.com/userupload/48397824/file/668c355b64366c7d5c9a7e3cc2c3c283.png?resize=1600x1200)

**Aproveitar:** alinhamento de valores, separadores discretos, filtros com contagem, badges pequenos e hierarquia de texto principal/secundário.

**Aplicação:** tabela de custos por produto no detalhe desktop; padrões financeiros da lista de acompanhamentos. Mostrar produto/variação, quantidade, produto efetivo, frete China, taxa de pagamento, frete Brasil, Receita e total. Detalhes/edição permanecem contextuais.

**Limite:** não trazer sidebar corporativa, contas a receber, pagamentos parciais, recorrência, vencimentos ou a paleta azul. Tabela completa não é o layout mobile.

## B — Organização dos pacotes

**Projeto:** [Order List Shipment Tracking Table UI](https://dribbble.com/shots/26287173-Order-List-Shipment-Tracking-Table-UI), Sohag Islam / Saasfactor.

![B — Lista de envios com linhas espaçosas e estados visíveis](https://cdn.dribbble.com/userupload/44140421/file/original-3a13340d1ab16158d5112fd6f54a3bb3.jpg?resize=2400x1800&vertical=center)

**Aproveitar:** linhas espaçosas, informação principal/secundária, estado visível e acesso ao detalhe.

**Aplicação:** lista de pacotes dentro da compra, com nome, unidades, etapa manual, frete e pendência financeira. Exemplo: `Pacote 1 · Roupas — 7 unidades — Frete R$ 550,00 — Enviado — Receita pendente`. Adaptar ao padrão de lista do Loti, sem copiar o menu superior da referência.

**Limite:** não adicionar transportadora, rastreamento, endereços, rotas, mapas ou outras funções sugeridas pelo domínio da imagem.

## C — Formulário com composição financeira

**Projeto:** [Monefy — Invoice Details](https://dribbble.com/shots/24792795-Monefy-Invoice-Details), Barly Design / Uxerflow.

![C — Monefy: campos editáveis e composição de valores](https://cdn.dribbble.com/userupload/16387742/file/still-c2eead43e253b7d9afa26ccc0b4cc9f1.png?resize=1600x1200)

**Aproveitar:** separação entre entrada e revisão do resultado, rótulos claros, quantidades/preços e subtotal/taxa/total.

**Aplicação:** drawer existente do Loti para valores e pagamentos. Campos acima; composição financeira abaixo; ação Marcar como pago junto ao total conferido. Exemplo: frete R$ 500,00 + Pix 1% R$ 5,00 = R$ 505,00.

**Limite:** não reproduzir duas faturas lado a lado, documento fiscal, envio de invoice, seletor de moeda ou marca verde. Aproveitar o princípio de prévia, adaptado à Surface local.

## D — Mobile e detalhamento de despesas

**Projeto:** [Smart Split Bill App UI for Transparent Group Payments](https://dribbble.com/shots/26292009-Smart-Split-Bill-App-UI-for-Transparent-Group-Payments-Author), Hamidatun Nisa.

![D — Mobile: linhas de produto, quantidade, composição financeira e participantes](https://cdn.dribbble.com/userupload/44155045/file/original-d2290e6cde83ceb1e54b6606608ad350.png?crop=0x0-4800x3600&resize=1600x1200)

**Aproveitar:** especialmente as telas laterais, com produto/quantidade/valor em linhas compactas e componentes financeiros abaixo. Usar também a legibilidade da lista central e a identificação de participantes.

**Aplicação:** acompanhamentos e pacotes como listas compactas; produtos com quantidade e total visíveis; composição aberta em drawer; parcelas pessoais identificadas por avatar/iniciais. Preservar a ilha de navegação do Loti, ampliada para quatro destinos.

**Limite:** não trazer cartões saturados, gradientes, decoração de recibo, fotos de produtos, dívidas entre amigos ou pagamentos pelo aplicativo.

## Síntese de implementação

Após a auditoria da tela implementada, o [plano de refatoração UX](../22_PACKAGES_AND_COSTS_UX_REFACTOR_PLAN.md) detalha a descoberta progressiva: resumo permanente, seções Produtos e pagamento, Pacotes e Divisão por pessoa inicialmente recolhidas, e edição contextual. Esse refinamento mantém A/B/C/D e orienta a hierarquia do detalhe.

| Superfície | Referência | Adaptação obrigatória |
| --- | --- | --- |
| Lista de acompanhamentos | A + B | Abertos/Encerrados com contagens; compra, pacotes, total parcial/final e pendências |
| Custos por produto desktop | A | Valores alinhados, quantidade explícita, unidade versus total rotulados |
| Lista/detalhe de pacotes | B + C | Etapa manual separada de estado financeiro; acesso contextual a itens/cobranças |
| Formulários de cobrança | C | Campos e composição base/taxa/total na Surface existente |
| Listas/detalhes mobile | D | Linhas compactas e drawer; sem tabela larga ou overflow de página |
| Parcelas por pessoa | D + A | Avatar/iniciais e total; não duplicar unidades ou sugerir dívida |

Reutilizar Geist, fundo claro quente, superfícies brancas, laranja funcional, bordas discretas, badges, botões e SVGs de categoria do Loti. Estados possuem texto além da cor; valor desconhecido nunca aparece como zero. Não criar um novo tema visual.

## Aceite visual

- Desktop tem tabela de custos e lista de pacotes distintas, com números legíveis e informação progressiva.
- Drawer mostra método, percentual capturado, base, taxa e total antes da confirmação de pagamento.
- Mobile mostra quantidade e total da linha, com detalhamento acessível e ilha de quatro destinos sem clipping.
- Total parcial, pendente, sem cobrança, pago e encerrado são reconhecíveis; enviado/recebido não se confundem com pagamento.
- Verificar 320/390/768/1024/1440px; inspecionar screenshots de lista, detalhe, pacotes e drawer em 390/1440px e comparar a coerência com o app atual.
- Essas referências encerram a escolha estrutural. Refinamentos de densidade e responsividade são trabalho normal de implementação, sem nova escolha estética obrigatória.
