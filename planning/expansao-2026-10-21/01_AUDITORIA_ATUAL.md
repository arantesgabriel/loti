# Loti — Fase 1: mapeamento e auditoria do sistema atual

Data: 21/10/2026, America/Sao_Paulo. Autorização: “inicie a fase 1”.
Estado: investigação concluída e submetida ao usuário; Fase 2 não iniciada.

## 1. Resultado e alcance

O checkout contém uma aplicação Next.js única, com frontend React e backend em Route Handlers/serviços de domínio, Better Auth, Drizzle SQLite/libSQL, armazenamento QC em R2 e email transacional via Resend. O produto implementado já inclui extensões relevantes posteriores ao MVP original: rateio, acompanhamento financeiro, reembolsos, direitos individuais em CNY, pagamentos mistos, pedidos adicionais, correções compensatórias, ajustes manuais de saldo, recuperação/verificação de email e temas.

A principal fronteira de acesso atual é associação ao workspace, com regras adicionais de propriedade, estado e gestor QC. Não foi encontrado modelo implementado de assinatura Free/Pro, entitlements, cobrança recorrente ou ferramentas públicas de importação no schema, dependências e rotas examinados. Uma sessão válida, isoladamente, não concede entrada na área operacional.

Há pontos concretos a estudar para crescimento: carregamento integral do workspace, lista de custos que materializa detalhes de todo o histórico e reconstrução integral de ledger. Isso não comprova lentidão atual nem insuficiência de Turso/Vercel. A escolha da arquitetura futura continua pendente das Fases 2–5.

Existe divergência entre documentação histórica, checkout local e estado remoto recente do CI/CD. O GitHub foi consultado por leitura: há um Preview com etapas de migration/publicação bem-sucedidas, uma execução recente de main que falhou antes dessas etapas e uma execução mais nova de dev ignorada por condições do workflow. Os detalhes estão no anexo `01_EVIDENCIAS_REMOTAS.md`. Nenhuma execução foi iniciada ou repetida por esta auditoria.

## 2. Método, baseline e limites

Foi utilizado o fluxo oficial Matt Pocock `grill-with-docs`, com `grilling` e `domain-modeling`, carregados na sessão. A pesquisa de fatos foi dividida em leituras de dados/finanças, autenticação/QC/infra e documentação/UI. As decisões futuras permanecem com o usuário; não houve entrevista de requisitos da Fase 2 antecipada.

Foram consultados os documentos canônicos 00–17 na ordem exigida, `PROMPT_ONE_SHOT.md`, referências locais de design, handoffs pertinentes e fontes de implementação. A leitura dirigida dos handoffs e do código cobre as áreas relevantes à expansão; não corresponde a revisão de cada linha nem a certificação de segurança ou finanças.

Baseline local: branch `dev`, HEAD `a87920ac7b9360b3b9e4da7322698b35dbd581ac`. Não houve fetch, pull, troca de branch ou atualização de refs. Antes dos novos relatórios, `git diff --stat` e `git diff --cached --stat` estavam vazios. Havia `planning/` da Fase 0 e `reset-password.sh` não rastreados; este último não foi lido, executado ou alterado.

Somente estes documentos novos foram escritos. Não foram executados aplicação, testes, typecheck, lint, build, benchmark, scripts operadores, migrations ou queries em banco. Não foram lidos `.env` reais, senhas, tokens ou dados privados de usuários. A consulta remota usou o conector GitHub em operações GET; não acessou diretamente Vercel, Turso, R2, Resend ou HubBuy.

Classificação usada nas conclusões:

- **Implementação constatada:** leitura do checkout identificado, com arquivo/linha.
- **Intenção/histórico documental:** descrição ou resultado registrado anteriormente, sem repetição nesta auditoria.
- **Estado remoto observado:** resposta GitHub datada e vinculada a SHA/run.
- **Inferência/recomendação:** consequência provável a investigar, sem aprovação ou medição operacional.

## 3. Inventário técnico

Versões abaixo são as declaradas em `package.json`, não uma auditoria dos binários instalados nem recomendação de atualização.

| Camada | Tecnologia declarada | Evidência |
|---|---|---|
| Runtime | Node `>=24 <25`; scripts npm, módulos ESM | `package.json:5` e scripts |
| Aplicação | Next.js 16.3.8, React/React DOM 19.3.0 | `package.json`, dependencies |
| Linguagem | TypeScript 6.0.3; strict; alias `@/*` para `src/*` | `tsconfig.json:11` e paths |
| UI | Tailwind 4.3.3, Radix, Lucide, Sonner, primitivas locais | `package.json`; `src/components/ui/` |
| Formulários | React Hook Form 7.89.0, Zod 4.6.5 | `package.json`; `domain/validation.ts` |
| Autenticação | Better Auth/Drizzle adapter 1.7.7 | `src/lib/auth/config.ts:17` |
| Dados | Drizzle ORM 0.45.3, `@libsql/client` 0.18.0, SQLite dialect | `src/lib/db/connection.ts:1` |
| QC | AWS S3 SDK 3.1150.0 para R2; sharp 0.35.5; ipaddr.js | `src/lib/qc/storage.ts`; `download.ts`; `image-validation.ts` |
| Email | Resend 6.34.1 | `src/lib/email/service.ts:18` |
| Testes | Vitest 5.0.3; Playwright 1.63.0, Chromium | `vitest.config.ts`; `playwright.config.ts` |
| Ferramentas offline | exceljs, tsx, drizzle-kit e scripts operadores | `package.json`; `scripts/` |

Inventário de arquivos por leitura: 15 `page.tsx`, 18 Route Handlers `route.ts`, 53 declarações `sqliteTable`, 23 migrations SQL (0000–0022), 29 arquivos unitários, 38 de integração e 26 specs E2E. Contagens de arquivos não são quantidade de casos nem resultados de testes.

### Organização e fluxo de dados

`src/app/` contém páginas/layouts e `api/`; `src/components/` concentra telas e estado React; `src/lib/auth/` autenticação; `src/lib/domain/` autorização, serviços, validação e cálculo; `src/lib/db/` schema/driver; `src/lib/qc/` download, decoder, armazenamento e concorrência; `src/lib/email/` envio/templates. Não há um serviço backend separado no checkout.

Fluxo constatado: navegador → Route Handler/Server Component → sessão → membership/ownership/estado → validação → serviço → Drizzle/libSQL. Cliente recebe DTOs, não conexão de banco. `src/lib/db/index.ts:3` abre a conexão ao avaliar o módulo; por isso a auditoria não importou módulos do app para inspeção em runtime.

O layout protegido é dinâmico e carrega `getData()` antes de montar `WorkspaceProvider` (`src/app/(app)/layout.tsx:8–20`). Esse conjunto contém membros, favoritos, coleções, todas as compras do workspace, seus itens e participantes (`src/lib/domain/services.ts:21–44`). GET `/api/app` retorna esse mesmo conjunto; POST aplica a operação e retorna novamente os dados (`src/app/api/app/route.ts:20–46`). O provider atualiza no foco da janela e após mutação (`src/components/workspace-provider.tsx:24–48`); não há realtime nessa experiência.

## 4. Mapa dos módulos e pontos de integração a estudar

Os pontos da última coluna são possibilidades de investigação, não autorização de reutilização ou alteração.

| Módulo | Propósito e implementação constatada | Dependências e fronteiras a preservar | Possível relação com expansão |
|---|---|---|---|
| Identidade e sessão | Login privado, logout, perfil, senha e recuperação | Better Auth; IDs estáveis; origem exata; sessões em banco | Conta pública e assinante devem ser discutidos separadamente de membership |
| Grupo e convites | Email/token, emissão, revogação/regeneração, verificação e aceite | `invitations.ts:82–108`; token, email verificado, commit de membership/preferência/consumo | Não transformar convite existente em cadastro geral implicitamente |
| Favoritos | Propriedade pessoal, visibilidade do grupo, filtros e Lista/Cards | `services.ts:47–77`; `favorites-screen.tsx:18–35`; categoria e URL original | Simulações salvas e favoritos são conceitos distintos até definição de produto |
| Coleções | Organização pessoal dentro de Favoritos | Owner para alteração; remoção preserva favoritos | Evitar criar coleção como substituto de histórico de simulações |
| Compra ativa | Uma rodada colaborativa; itens físicos e checklist HubBuy | `purchase-services.ts:40–151`; uma ativa/workspace; snapshot na cópia | Importar resultado de uma ferramenta exigirá fluxo e contrato específicos |
| Rateio | Igual, percentual e fixo; parcelas sem duplicar unidades | `cost-sharing.ts:25–87`; ordem estável; bps/centavos e BigInt | Referência para futura calculadora; domínio público não deve receber mutations de compras |
| Histórico | Compras finalizadas e itens independentes de favoritos | Estado finalizado no servidor; nomes atuais de pessoas não são snapshots históricos de identidade | Separar histórico de simulação de compra registrada |
| Pacotes e custos | Acompanhamento pós-finalização, valores/encargos/pagamentos e logística manual | `package-cost-services.ts:185–217`; revisão, estado aberto/encerrado e transação | Custo estimado não deve alterar custo efetivo ou confirmar pagamento |
| Pedidos adicionais | Itens/pagamentos em acompanhamento e conta elegíveis | `purchase-cost-order-services.ts:72–139`; pagamento registrado habilita unidades | Não criar compras históricas artificiais para representar simulações |
| Correções de adicionais | Prévia, confirmação, compensação/substituição auditada | `purchase-order-corrections.ts`; revisões e retenção dos fatos antigos | Nova integração deve respeitar writers e snapshots já ampliados |
| Reembolsos | Cancelamento de unidades, solicitação, recebimento e anulação | `package-cost-calculations.ts:170,255–263`; bases/taxas e crédito separado | Projeção pública não equivale a crédito confirmado |
| Contas HubBuy | Registro local, conciliação, saldo físico, direitos, extrato e ciclo de vida | `hubbuy-balance-services.ts:115–175`; ledger e direitos individuais | Evitar confundir conta HubBuy, usuário, workspace e assinatura |
| Pagamento misto e adiantamento | Combina saldo/direitos com principal externo e taxa capturada | `purchase-cost-order-services.ts`; consumo FIFO, par CNY/BRL, operação idempotente | Fonte para entender custo efetivo; não é processador de pagamento nem câmbio de mercado |
| Ajustes manuais | Bônus/crédito documentado, saída e anulação compensatória | `hubbuy-balance-adjustments.ts:20–27,54–164`; sem edição livre de saldo | Preservar direitos, base histórica e auditabilidade |
| QC | JSON colado, matching, backup, previews, galeria e apresentação existente | `qc-services.ts`; IDs, tombstones, limites e gestão por usuário configurado | Não reaproveitar importador como scraping/API sync ou upload genérico |
| Email | Convite, recuperação e verificação | `email/service.ts:18–76`; quotas, reservas, allowlist e estado de envio | Crescimento de cadastros pode consumir orçamento compartilhado |
| UI/temas | Tokens, tema por navegador, sidebar e ilha mobile | `theme.ts`; `app-shell.tsx:16–18`; superfícies acessíveis | Nova experiência pública deve ser planejada sem substituir shell operacional |
| Operação/legado | Bootstrap e importação pontual de planilha | `scripts/`; comandos podem escrever e foram apenas lidos | Não são endpoints ou ferramentas públicas reutilizáveis sem decisão |

## 5. Rotas existentes

### Páginas

| Superfície | Rotas | Acesso constatado |
|---|---|---|
| Raiz | `/` | Redireciona para `/favorites` (`src/app/page.tsx:2`) |
| Autenticação | `/login`, `/forgot-password`, `/reset-password`, `/verify-email` | Fora do layout operacional; tokens/sessão conforme a ação |
| Convite | `/invite/[token]` | Público com capacidade limitada pelo convite; não entrega dados do workspace |
| Operação | `/favorites`, `/purchase`, `/history`, `/history/[purchaseId]` | Sessão e membership via layout/serviços |
| Custos/contas | `/packages`, `/packages/[trackingId]`, `/packages/accounts` | Sessão, membership e validações do recurso |
| Pessoa/grupo | `/profile`, `/group` | Sessão e membership |

### APIs

- `/api/auth/[...all]`: handler Better Auth com envoltório transacional para finalizações sensíveis.
- `/api/app`: leitura agregada e operações favoritas/coleções/preferência/compra/item.
- `/api/group` e `/api/invitations/[token]`: gestão autenticada e consulta/aceite controlados.
- `/api/packages`, `/api/packages/[trackingId]`, `/api/cost-settings`: acompanhamento, pacotes, encargos, pagamentos, adicionais, correções, refunds e fechamento/reabertura.
- `/api/hubbuy/accounts`, `/api/hubbuy/accounts/[accountId]`, `/api/hubbuy/accounts/[accountId]/statement`: contas, ciclo de vida, conciliação, ajustes e extrato.
- `/api/purchases/[purchaseId]/qc`, `/api/purchases/[purchaseId]/items/[itemId]/qc-presentation`, `/api/qc/imports/[importId]`: QC por destino, apresentação e processamento manual.
- `/api/qc/images/[imageId]` e seus sufixos `/source`, `/preview`, `/fallback`: imagem, preview e acesso autorizado às fontes.
- `/api/health`: SELECT mínimo de saúde do banco, sem sessão (`src/app/api/health/route.ts:6`). Não foi chamado nesta auditoria.

Route Handlers usam runtime Node. Auth declara 30 s; rotas de importação QC declaram 120 s. São configurações de código, não confirmação do limite contratado Vercel. Não há rotas implementadas das cinco calculadoras propostas, assinatura ou checkout comercial entre as 18 examinadas.

## 6. Banco, relacionamentos e invariantes

### Persistência e tabelas

`src/lib/db/connection.ts:22–36` seleciona URL configurada, admite libSQL remoto e arquivo local; no Vercel, ausência de URL falha, e acesso remoto exige token. Credenciais permanecem no servidor. A extensão de instrumentação QC envolve chamadas do driver em contexto local de request; não significa monitoramento geral de produção.

As 53 declarações em `src/lib/db/schema.ts` se distribuem assim:

| Grupo | Quantidade | Tabelas |
|---|---:|---|
| Better Auth | 4 | `user`, `session`, `account`, `verification` |
| Workspace/preferências | 3 | `workspaces`, `workspace_members`, `user_preferences` |
| Favoritos/coleções | 2 | `favorites`, `collections` |
| Compra/participação | 3 | `purchases`, `purchase_items`, `purchase_item_participants` |
| Convites | 2 | `workspace_invitations`, `invitation_limits` |
| Segurança/email | 2 | `auth_limits`, `auth_email_deliveries` |
| Configuração de custos | 1 | `workspace_cost_settings` |
| Custos/pacotes/refunds | 17 | `purchase_cost_trackings`, `purchase_cost_orders`, `purchase_order_corrections`, `purchase_additional_order_items`, `purchase_item_costs`, `purchase_cost_participants`, `purchase_packages`, `purchase_cost_package_events`, `purchase_package_items`, `purchase_cost_charges`, `purchase_payment_components`, `purchase_payment_allocations`, `purchase_cost_reopenings`, `purchase_cost_refunds`, `purchase_refund_payment_allocations`, `purchase_cost_refund_participants`, `purchase_cost_refund_events` |
| QC | 10 | `qc_imports`, `hubbuy_external_items`, `qc_images`, `qc_presentations`, `qc_additional_presentations`, `qc_image_previews`, `qc_image_sources`, `qc_events`, `qc_rate_limits`, `qc_transfer_locks` |
| Contas/ledger | 9 | `hubbuy_accounts`, `hubbuy_reconciliation_runs`, `financial_operations`, `hubbuy_balance_entries`, `hubbuy_balance_adjustments`, `hubbuy_reconciliation_events`, `hubbuy_balance_credit_shares`, `hubbuy_balance_consumptions`, `member_balance_financing_entries` |

Isso descreve schema de código. Nenhum catálogo ou contagem de registros de banco local/remoto foi consultado.

### Relações e proteção dos dados

- `workspace_members` tem chave composta workspace/usuário e não tem coluna de papel (`schema.ts:23–25`). Uma pessoa pode possuir mais de uma membership; `user_preferences.active_workspace_id` seleciona contexto, sujeito a membership, sem UI geral de gestão de múltiplos espaços.
- Favorito/coleção pertencem a workspace e owner. Compras pertencem ao workspace; itens apontam à compra; participações apontam ao item e usuário. O índice parcial em `schema.ts:38` garante uma compra ativa por workspace.
- Itens copiam seus campos de produto e `visual_key`; `source_favorite_id` pode virar null sem perder o snapshot (`schema.ts:40`; `purchase-services.ts:82–90`). `person_id` é espelho legado; a composição financeira vem da relação de participantes.
- Finalização e criação do acompanhamento de custos ocorrem juntas (`purchase-services.ts:144–151`). Custos capturam participantes e bases em estrutura própria (`purchase-cost-initialization.ts:7–89`). Encerrar/reabrir custos não reabre compra.
- Um custo aponta exclusivamente ao item original ou adicional (`schema.ts:164–191`). Adicionais e correções têm identidade financeira própria; não modificam o snapshot da compra finalizada.
- Componentes/alocações de pagamento preservam principal, taxa, CNY e par capturado (`schema.ts:284–320`). A conta HubBuy tem moeda fixa CNY; ledger, parcelas individuais e consumos são relações diferentes (`schema.ts:523–664`).
- Contas excluídas mantêm tombstone e auditoria. Não há autorização para apagar histórico: o ciclo de vida é protegido por serviços e triggers (`hubbuy-account-lifecycle.ts`; migrations 0018/0019).
- FKs/CHECKs e índices complementam a autorização; somas entre linhas, membership e cadeia de propriedade exigem serviços transacionais. Isso não é RLS nem banco exposto ao navegador.

### Precisão, conversão e concorrência

Centavos BRL, unidades menores CNY e bps são inteiros. `cost-sharing.ts:25–87` usa BigInt para subtotal/proporções e distribuição determinística. `package-cost-calculations.ts:61–88` possui taxa com metade para cima e maior resto. `financial-money.ts:44–59` converte por par inteiro capturado da operação; não consulta preço de mercado. FIFO preserva a base histórica e os restos no consumo final.

Os parsers têm contratos distintos: preço de favorito até 100.000.000 centavos (`validation.ts:5`); operações financeiras têm outro teto (`financial-money.ts:1`). Similaridade de nome ou fórmula não autoriza reutilização direta em ferramentas públicas.

`transaction-lock.ts:1–11` serializa transações por processo, sem lock distribuído. Custos combinam transação, retries restritos a BUSY, revisão esperada e atualização condicional (`package-cost-services.ts:185–217`). Operações financeiras têm chave idempotente única por workspace e hash de payload (`schema.ts:552–560`). Segurança entre instâncias depende das invariantes persistidas; a fila local não é prova suficiente isoladamente.

Triggers SQL fazem parte do contrato além de `schema.ts`: append-only do ledger, consistência da projeção de saldo, capacidade de alocação, contas excluídas, correções e ajustes. Exemplos: migrations 0009, 0018, 0019, 0020 e 0022. Uma futura reconstrução de tabela ou mudança de writer precisa preservar essas regras.

## 7. Autenticação, permissões, email e exposição pública

Better Auth usa `provider: "sqlite"`, signup público desabilitado e sessões de 14 dias com atualização diária (`auth/config.ts:17–57`). Criação privada de usuários utiliza instância operador. `requireUser()` consulta sessão no servidor e distingue indisponibilidade de ausência de autenticação (`auth/session.ts:6–22`). Não foram inspecionados cookies reais.

Membership é verificada pelos helpers centrais; dono é necessário para favoritos/coleções e compra ativa para mutação de seus itens (`domain/authorization.ts:7–34`). O gestor QC exige, adicionalmente, ID de usuário configurado, sem inferência por nome/email. Não há papel comercial Pro nesses helpers.

Convites persistem hash de token de 32 bytes aleatórios e duram sete dias. Uma pessoa nova pode ter identidade pendente, mas não ganha membership antes da verificação nativa do email e aceite autenticado. Membros atuais não perdem acesso por falta de verificação (`invitations.ts:96–107`; `auth/config.ts:24–25`). Recuperação/verificação usam TTL de 30 minutos; finalização HTTP sensível passa por transação externa (`auth/handler.ts:11–24`).

Origem exata é centralizada: produção exige `BETTER_AUTH_URL` HTTPS, Preview deriva alias configurado e local usa localhost (`auth/origin.ts:1–18`). Não há política de sessão compartilhada entre subdomínios constatada. Novas rotas/subdomínios e retorno de login exigem discussão futura; não são configuração já pronta para cadastro público.

### Controles existentes e limites

| Canal | Implementação constatada | Limitação para a expansão |
|---|---|---|
| Auth | Limites persistidos; HMAC de identificadores; login 30/email e 100/IP por hora por padrão | Não equivalem a quotas de ferramentas públicas; writes do limiter entram no custo |
| Convite | Gestão 15/min por usuário; inspeção global 240/min; aceite global 60/min e 10/token | Limites globais de um produto privado precisam ser reavaliados com o fluxo futuro |
| Email | Resend central, timeout 8 s, chave de idempotência, sem retry automático; padrão 60/dia e 1.800/mês com reserva de reset | São defaults do código, não plano contratado, configuração ativa ou capacidade comercial |
| QC | Limites persistidos, leases, quotas de bytes, lotes e limites de leitura | Não constituem limitador geral para APIs de câmbio ou calculadoras |
| `/api/app` e health | Sessão/origem/validação quando aplicáveis; não foi identificado limiter de aplicação nessas rotas | Não prova ausência de WAF/limites na hospedagem; exposição pública futura precisa de análise própria |

Evidências: `auth/config.ts:66–76`, `auth/security-limits.ts:11–61`, `email/service.ts:18–76`, `api/group/route.ts:23`, `api/invitations/[token]/route.ts:13–27`, `domain/qc-limits.ts` e `api/app/route.ts`.

O modo padrão de envio é desabilitado; fora de produção há allowlist. Implementação de Resend não prova que envio, domínio, SPF/DKIM ou credenciais estejam ativos. O futuro crescimento não deve consumir inadvertidamente a reserva de recuperação de conta.

## 8. QC, storage e integrações existentes

QC é importação manual de JSON colado; só `freePhotos` elegíveis entram no fluxo. Não é sincronização de API ou scraping. O transporte exige HTTPS no host exato permitido, valida todos os IPs DNS, fixa IP público no socket, mantém TLS/SNI, rejeita redirects e não envia credenciais HubBuy (`qc/download.ts:26–110`). MIME/magic bytes, limites, animação e decode integral são verificados antes do armazenamento (`qc/image-validation.ts:41–65`).

R2 usa clientes de leitura/escrita separados e keys geradas no servidor; originais e previews têm estados/claims e tombstones. URLs assinadas são curtas e emitidas após autorização (`qc/storage.ts:25–41,81–86`). Um preview inalterado ainda passa por autorização e limiter antes do 304 (`domain/qc-services.ts:397–408`). Cache não zera o trabalho de controle.

Limites de código incluem JSON 1 MiB, até 100 pedidos/500 ocorrências/200 fotos, foto 8 MiB, orçamento 200 MiB por importação, lote 5 e dimensões/pixels limitados (`domain/qc-limits.ts:1–26`). Processamento tem lanes, semáforo de decoder e fila curta de banco, com lease persistida por workspace. Limites locais de request/processo não garantem memória global entre instâncias Vercel.

Fotos já aparecem em linhas de custos e na composição de reembolsos do checkout (`product-costs-list.tsx:173`; `refunds-section.tsx:49–62`; `qc-components.tsx:568–578`). Essa é uma constatação de estado, preservado pela auditoria. O conflito com instruções antigas de gate está registrado abaixo; nenhuma nova superfície foi autorizada.

Integrações constatadas no código: Turso/libSQL, R2 via protocolo S3, Resend e download público controlado das fotos HubBuy. GitHub/Vercel compõem o deploy. Não foi encontrada integração de cotações de mercado, motor tributário atualizado, tracking automático, cobrança de assinatura ou serviço de analytics entre as fontes examinadas. A ausência no código não exclui serviços configurados fora do repositório.

## 9. Infraestrutura, ambientes, migrations e recuperação

| Elemento | O que foi confirmado | O que permanece sem verificação |
|---|---|---|
| GitHub | Repositório e branches via conector; runs e etapas recentes; workflow local e remoto versionados | Regras completas de proteção, aprovadores de environments e conteúdo de secrets |
| Vercel | Next.js/Node e config `vercel.json`; steps de deploy em Actions | Projeto ativo, plano, configuração aplicada, deployment servido no domínio, métricas e limites |
| Turso | Driver/schema/migrator; workflow com etapas de migration/verify em Preview registradas como sucesso | Catálogo real, plano, token scopes, volume, saldo/integridade reais e backup executado |
| R2 | Implementação privada e separação de clientes/credenciais no código | Bucket/políticas/CORS/permissões efetivos, volumes e custo |
| Resend | Emissor/quota/templates implementados | Ativação, domínio verificado, DNS e entrega real |
| Domínio/DNS | `useloti.com` como origem documentada; `dev.useloti.com` em workflow remoto recente | Zona DNS atual, provedor, certificados e roteamento efetivamente servido |

Não há ferramenta conectada Vercel/Turso/Cloudflare/Resend nesta investigação. Não foram usados tokens locais como substituto. A limitação não impede o inventário da Fase 1; impede certificar o estado hospedado e fechar estimativas de capacidade da Fase 4.

### Deploy: três estados que não devem ser confundidos

1. **Documentação histórica:** `docs/16_HUMAN_INPUTS.md` menciona `feat/mvp` como branch de produção. `docs/13_DEPLOYMENT.md` descreve migrations explícitas e validação/publicação separadas. Esses textos não provam a configuração atual.
2. **Checkout local a87920a:** workflow dispara em push dev/main; valida typecheck, lint e unitários; build → migrate → verify → deploy prebuilt. Mapeia main para Production e dev para Development/Preview; `vercel.json:5–7` desabilita deploy Git nativo dessas duas branches. Não executa integração/E2E nesse gate. Não foi alterado nem acionado.
3. **GitHub observado:** main e dev estão em SHAs mais novos. O workflow de dev remoto adicionou staging/inspeção/alias/promoção e confirmação manual de Production, mas restringe `validate` a main com `workflow_dispatch`; o run de push dev foi ignorado. O run anterior de dev teve sucesso. O run recente de main falhou em validação de configuração antes de migration e deploy. Anexo contém URLs e ressalvas.

Assim, existe evidência de execução real, mas não uma validação geral de pipeline nem confirmação de que Production recebeu o código auditado. Não foi investigada a causa exata da falha de configuração por logs; nomes de etapas são a evidência disponível, sem dedução sobre qual secret faltou.

### Migrations e verificação

Há 23 migrations versionadas até `0022_hubbuy_manual_adjustments`, também registradas no journal. `scripts/migrate.ts:6–10` aplica Drizzle migrator explicitamente, carregando dotenv e destino configurado ou local. Não foi encontrada migration em ciclo de request; o acionamento automático pelo CI é um caminho separado, presente no workflow local.

`scripts/verify-database.ts:6–11` verifica tabelas selecionadas, FKs, triggers e guards. A lista atual inclui auth/email, mas não enumera `workspace_invitations` nem `invitation_limits`; portanto o sucesso dessa etapa não certifica todas as 53 tabelas por nome. Não foi executado. A presença de `SELECT 1` em health também não certifica schema ou regras de negócio.

Backup/restore tem orientação geral no documento 13, sem evidência de rotina exercitada, RPO/RTO definido ou automação de restauração no workflow lido. Não há rollback coordenado app/schema/objetos demonstrado. Retornar apenas código pode ser incompatível com writers, triggers, pagamentos e participantes novos; eventual recuperação exige planejamento e autorização próprios.

## 10. Fronteiras de preservação para qualquer proposta futura

| Invariante existente | Evidência principal | O que uma expansão não pode fazer implicitamente |
|---|---|---|
| Membership e propriedade no servidor | `authorization.ts:7–34` | Dar acesso operacional a todo cadastrado ou assinante |
| Direitos atuais preservados | Pedido de expansão; `invitations.ts` e auth atual | Ativar verificação global ou paywall retroativo sem política aprovada |
| Uma compra ativa por workspace | `schema.ts:38`; `purchase-services.ts:40–60` | Trocar por uma compra ativa global ou por assinante |
| Item físico e participantes separados | `schema.ts:39–54`; `cost-sharing.ts` | Multiplicar unidades/totais por pessoa ou novo integrante |
| Compra finalizada imutável | `purchase-services.ts:62–151` | “Salvar simulação” ou corrigir favorito reescrevendo o histórico |
| Acompanhamento financeiro independente | `purchase-cost-initialization.ts`; `package-cost-services.ts` | Reabrir compra ao reabrir custos |
| Estimado, pendente, zero, sem cobrança e pago distintos | `package-cost-calculations.ts`; validações de charge | Transformar estimativa em pagamento ou zero em ausência de informação |
| Reembolso solicitado não é recebido | `package-cost-calculations.ts:255–263` | Criar crédito por projeção ou pedido de reembolso |
| CNY físico, direito individual e base BRL distintos | `hubbuy-balance-services.ts:115–175`; `financial-money.ts` | Atualizar custo histórico com cotação atual ou consumir direito alheio implicitamente |
| Ledger e compensações auditáveis | migrations 0009/0018/0020/0022 | Apagar movimentos ou editar saldo como forma de correção |
| QC independente de finanças | `qc-services.ts`; handoff 24 | Alterar pacote, quantidade, refund, pagamento ou snapshot ao importar/remarcar foto |
| Leitura privada de imagens | `qc-services.ts:94–147,397–408` | Tornar previews/originais públicos por usar a mesma marca/domínio |
| Tema e preferências com escopos próprios | `theme.ts`; `user_preferences` | Confundir configuração do navegador com benefício da assinatura |

Essas são fronteiras constatadas/documentadas para orientar propostas, não garantia experimental contra regressão. Não houve alteração que exigisse teste de regressão nesta fase.

## 11. Riscos e recomendações ainda não aprovadas

Criticidade abaixo significa impacto potencial na expansão, não incidente atual confirmado.

| ID | Evidência/risco | Impacto e criticidade | Recomendação para investigar, sem execução |
|---|---|---|---|
| R01 | `getData()` carrega compras/itens/participantes históricos completos e filtros de favoritos ficam no cliente | Crescimento de payload, consultas e memória por workspace; média/alta | Na Fase 4, modelar dados por grupo e comparar leituras segmentadas/paginadas antes de mudar tecnologia |
| R02 | `package-cost-reading.ts:379–382` monta cada acompanhamento integralmente em Promise.all | Amplificação de consultas/cálculos com histórico; média/alta | Avaliar resumo de listagem e detalhe separado, preservando contratos atuais; não refatorar agora |
| R03 | Conta reconstrói ledger/parcelas/consumos; extrato paginado consulta histórico adicional (`hubbuy-balance-services.ts:115–127,565–582`) | Custo crescente por conta, mesmo com paginação visual; média | Dimensionar por eventos/conta e avaliar alternativas somente com volume/latência reais |
| R04 | Fila de transações por processo e serialização de domínio | Espera entre grupos e falsa impressão de lock global; alta se reutilizada como defesa única | Preservar CAS/uniqueness/transações e distinguir controles locais de globais na arquitetura futura |
| R05 | Autenticado, membro, titular de direito e gestor QC têm papéis distintos | Vazamento ou alteração indevida se Pro substituir membership; alta | Definir unidade comercial e compor autorização futura sem ampliar acesso existente |
| R06 | Quotas de convite/email/auth foram desenhadas para acesso privado | Limitação de onboarding ou consumo da reserva de recuperação; alta | Planejar com demanda e orçamento; não elevar quotas automaticamente |
| R07 | Helpers financeiros já distinguem custo histórico e conversão capturada | Histórico incorreto se cotação de mercado for usada como atualização financeira; alta | Definir contratos de estimativa/captura e pontos de integração antes de reutilizar código |
| R08 | Divergências de branches/workflows/documentação e runs recentes heterogêneos | Publicar ou aplicar schema pelo caminho errado; alta | Antes de futura entrega autorizada, reconciliar baseline remoto, estratégia de migrations e gates; sem corrigir pipeline nesta tarefa |
| R09 | verify não enumera as duas tabelas de convites e CI consultado executa só unitários | Sucesso de pipeline interpretado como cobertura total; média/alta | Usar evidências por etapa e planejar validação específica da futura mudança |
| R10 | Backup, recursos/planos, volumes e observabilidade hospedada não verificados | Projeções e recuperação sem base operacional; alta | Na Fase 4 obter evidências não secretas de plano/uso/retenção, sem restore nem benchmark nesta autorização |
| R11 | Contas/ledger têm leitura de vínculos em JSON (`hubbuy-account-lifecycle.ts:16–18,36–39`) | Trabalho dependente do histórico global; média | Avaliar consultas/plano de execução apenas em futura investigação autorizada; não afirmar scan concreto sem EXPLAIN |
| R12 | Proteções de auth/QC são específicas; `/api/app`/health não têm limiter geral identificado | Não há proteção pública genérica comprovada; alta antes de lançamento público | Projetar rate limiting/cache/custos das novas ferramentas na Fase 4, sem assumir ausência de WAF hospedado |

Não há evidência nesta fase que justifique migrar Turso, separar bancos, introduzir workers/filas/microsserviços ou trocar frameworks. Também não há medição que permita afirmar que a infraestrutura atual suporta um número específico de usuários simultâneos. Ambas as conclusões exigem a Fase 4.

## 12. Divergências documentais e terminologia

| Tema | Estado encontrado | Tratamento nesta auditoria |
|---|---|---|
| Login orbital | Documento 17 e instruções gerais descrevem órbitas; `login/page.tsx:10,59` usa `LoginStoriesCarousel`. Documento 35 reconhece carrossel existente | Preservado o checkout; não reconstruir login neste planejamento |
| Fotografias operacionais | Instruções antigas descrevem gate fechado; handoff 24 e docs33 registram autorização anterior e código mostra capas/previews em custos e reembolsos | Registrar o descompasso, sem remover nem autorizar novas superfícies |
| Recuperação/email | Passagens antigas dizem operador/manual; início dos docs atualizados, plano31 e código têm Resend e verificação | Tratar como evolução implementada, sem assumir ativação remota |
| Navegação | Trechos antigos falam em três/quatro destinos; shell atual tem cinco no mobile, com Contas HubBuy separada | Preservar shell atual; não restaurar número antigo |
| Conversão | Exclusões originais dizem “sem câmbio”; financeiro atual converte por par capturado | Diferenciar conversão histórica de cotação pública, sem chamar ambas de uma mesma regra |
| Plano37 | Header diz validação em andamento; seção12 registra conclusão local e resultados históricos | Não repetir o header como falha atual nem apresentar testes históricos como executados agora |
| Plano30 | Texto ainda se apresenta como plano; partes da apresentação operacional já existem no código | Conferir cada alegação com implementação; não inferir estado por título ou status antigo |
| Deploy | feat/mvp na documentação; dev/main e diferentes revisões de workflow no código/GitHub | Usar snapshots identificados; não ajustar docs canônicos nem branch nesta fase |

Termos a manter separados na entrevista: identidade Better Auth; membership/workspace; conta HubBuy; participante do item; titular de direito em CNY; gestor QC; futuro assinante. Da mesma forma: preço do favorito, snapshot da compra, custo efetivo do acompanhamento, valor estimado e cotação. São distinções evidenciadas pelo modelo; a unidade de assinatura e seus benefícios ainda precisam de decisão humana. O glossário da Fase 0 não foi sobrescrito.

## 13. Decisões aprovadas, pendências e próxima fase

### Decisões aprovadas nesta fase

Somente a autorização para executar a auditoria por leitura. Permanecem válidas as decisões estratégicas do pedido e o registro da Fase 0. Nenhuma ferramenta, política Free/Pro, arquitetura futura, mudança de autorização, infraestrutura, correção de pipeline ou uso adicional de fotos foi aprovado por esta auditoria. Não foi criado ADR de escolha técnica futura.

### Questões pendentes para as fases seguintes

1. Fase 2: problema/público prioritário, escopo de cada candidata, cenários, entradas/saídas, exceções, salvamento, compartilhamento, critérios de sucesso e aceitação. Fatos técnicos já encontrados devem informar perguntas, não ser perguntados novamente ao usuário.
2. Fase 3: unidade da assinatura e extensão a convidados/grupos; limites Free; acesso público versus conta; direitos dos atuais; Beta, aviso prévio/fundadores e início eventual da cobrança.
3. Fase 4: orçamento, demanda/volume por workspace e conta, planos efetivos, métricas não secretas, limites de duração, storage/email, backups e requisitos de recuperação. Não confundir 4 mil interessados com 4 mil simultâneos.
4. Antes de eventual implementação: reconciliar as divergências documentais e a revisão remota escolhida, sem alterar a referência atual enquanto o trabalho for somente planejamento.

Nenhuma dessas pendências impede fechar o mapeamento dirigido da Fase 1; elas impedem tratar produto, capacidade ou estado de produção como definidos.

### Próxima fase proposta: Fase 2 — descoberta de produto e matriz de funcionalidades

Objetivo: definir com o usuário o que será oferecido, a partir das cinco candidatas e das fronteiras levantadas. Atividades: entrevistas em rodadas segundo a skill oficial, cenários concretos, análise das necessidades compartilhadas, registro de respostas e separação entre existente preservado, novo confirmado e ideia futura. Consultas: pedido original, este inventário, evidências já encontradas e fontes oficiais adicionais quando a questão exigir verificação, sem implementação.

Entregáveis: matriz de funcionalidades, definição conceitual e fluxos por ferramenta, requisitos funcionais/não funcionais, regras aprovadas, critérios de aceitação, prioridade por valor/esforço/dependências e pendências explícitas.

Solicitação pendente: aprovação do resultado da Fase 1 e autorização explícita para iniciar a Fase 2. A auditoria encerra aqui; não foi iniciada uma rodada de decisões de produto sem essa aprovação.
