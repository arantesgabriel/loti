# Ensaio com snapshot de produção — fases 1 e 2

Produção confirmada pelo responsável: `6f0d10b67e4f22259fa5b67f4e565029d55272db`. Alvo local `feat/orders`: `452929b61d5faa99ca5270d435e471df3c568fce`. Fonte: exportação SQL do Turso entregue pelo responsável em 03/11/2026, identificada no nome como 10:02:51. O horário exato e o método de captura no provedor não foram verificados independentemente. SHA-256 do arquivo: `baf0078a8a1f8ff7795f15a5dc816637609511f2dbc619689ccd74cf2d21b69d`.

O SQL restaurou em memória com 23 registros no journal Drizzle, de 0000 a 0022. Os timestamps e hashes corresponderam ao checkout usando bytes locais ou a variante LF. A primeira checagem de bytes identificou essa diferença de finais de linha antes de criar clones. O diff entre os commits contém seis migrations novas e 302 arquivos ao todo. Esta etapa avaliou as migrations e a conservação dos dados, sem concluir uma revisão integral dos 302 arquivos.

Foram criadas duas cópias com `node:sqlite.backup` em pasta temporária privada do sandbox, com caminhos absolutos validados e marcador local. O ensaio chamou `migrate(drizzle(createClient({url})), {migrationsFolder: folder})`, com URL `file:` derivada exclusivamente do clone de teste e sem carregar dotenv ou fornecer token. O journal passou de 23 a 29, com hashes e timestamps esperados para 0023 a 0028. A baseline foi aberta em modo somente leitura e seu hash de arquivo permaneceu igual. O SQL original também manteve seu hash. O Windows reteve um handle do clone migrado durante a limpeza no mesmo processo. Após o encerramento do processo, o caminho temporário já estava indisponível. Nenhum dump ou clone foi gravado no repositório.

| Verificação | Resultado |
| --- | --- |
| Integridade e chaves estrangeiras antes/depois | `integrity_check` OK e zero violações em ambas as cópias |
| 53 tabelas preexistentes, excluído o journal | Contagem e hash de todas as colunas de todas as linhas iguais por tabela |
| Hash agregado das 53 tabelas antes/depois | `54f9479fa4d4ccd342181739abe0fcad6c212a1c57c777efc630716d67b8cd2b` em ambas |
| Objetos preexistentes do schema | Nenhum removido ou alterado |
| Pacotes, posições e reservas novas | 1 pacote, 48 posições, 26 reservas |
| Pontes de cobrança legada | 2, nenhuma cobrança de pacote sem ponte |
| Eventos, comandos e manifestos novos | 0 em cada tabela |
| Pacote em preparação no snapshot | 26 unidades em 24 linhas, sem selo, com conta no pacote e revisão pendente |
| Vínculos pacote–item | Zero divergências por par e quantidade, zero reservas duplicadas e zero sobreposições com cancelamentos |
| Conta por reserva | 6 unidades em 4 linhas coincidem. Em 20 unidades de 20 linhas, o pedido legado não tem conta gravada e o pacote tem. Nenhuma conta diferente nem workspace divergente no conjunto |

A divergência de conta reflete um campo ausente no legado. A migration preserva o vínculo original e deixa a confirmação explícita. Pelo serviço da branch, a revisão do pacote exige todas as posições reservadas confirmadas com a mesma conta ativa. A jornada de conferência, fechamento e despacho ainda não foi executada. A inspeção de interface de 30/10 mostrou 31 unidades na seção de pacotes. O arquivo fornecido em 03/11 contém 26 alocações em unidades. Essa diferença precisa ser reconciliada com uma leitura atual antes de tratar o snapshot como referência da operação de envio.

**Resultado:** preservação das linhas antigas e da composição do pacote comprovada para o snapshot fornecido. Aprovação de subida segue bloqueada pela conferência operacional de conta/chegada, pela diferença em relação à observação anterior e pelos testes de fluxo ainda pendentes. Nenhuma migration ou publicação foi executada em produção ou em `loti-dev`.
