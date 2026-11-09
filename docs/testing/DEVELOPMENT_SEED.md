# Seed de uso único pelo Turso CLI

O seed é um arquivo SQL descartável, aplicado **diretamente pelo Turso Cloud CLI em `loti-dev`**. Não há workflow de seed. O workflow de migrations existente permanece separado e não foi alterado.

## Arquivos prontos

Arquivos locais ignorados pelo Git:

- `artifacts/development-seed/loti-dev-seed.sql`: carga completa, sem senha em texto aberto;
- `artifacts/development-seed/loti-dev-seed.sql.credentials.json`: logins e senha gerada para as cinco contas;
- `artifacts/development-seed/loti-dev-seed.sql.summary.json`: resumo da carga.

O SQL já foi gerado nesta tarefa. A senha aparece somente no arquivo de credenciais. Não foi aplicado remotamente. Esses arquivos podem ser apagados após a importação e a conferência.

## Aplicar uma única vez

1. Aguardar as migrations de **dev** corresponderem ao checkout que gerou o SQL. O arquivo não executa migrations e recusa uma versão/hash incompatível.
2. Usar o CLI **Turso Cloud** já autenticado. Conferir o destino:

```powershell
turso auth login
turso db show loti-dev
```

3. Em **PowerShell 7**, na raiz do repositório, importar o arquivo:

```powershell
Get-Content -LiteralPath '.\artifacts\development-seed\loti-dev-seed.sql' -Raw -Encoding utf8 | turso db shell loti-dev
```

Alternativa para Bash/WSL:

```bash
turso db shell loti-dev < artifacts/development-seed/loti-dev-seed.sql
```

Esta forma de importação por stdin é documentada pelo [Turso Cloud CLI](https://docs.turso.tech/cli/db/shell#load-from-dump).

Não precisa gerar token de banco, configurar secrets do GitHub ou executar o seeder Node contra o Turso. A autenticação remota é a do Turso CLI. O comando de destino é literalmente **loti-dev**. Um arquivo SQL não consegue identificar o nome do banco remoto: ele não deve ser enviado a `loti-prod` ou a outro destino.

4. Conferir:

```powershell
turso db shell loti-dev "SELECT name FROM workspaces WHERE id='loti-development-v1';"
turso db shell loti-dev "SELECT count(*) AS favoritos FROM favorites WHERE workspace_id='loti-development-v1';"
turso db shell loti-dev "SELECT count(*) AS pacotes FROM logistics_packages WHERE workspace_id='loti-development-v1';"
turso db shell loti-dev "PRAGMA foreign_key_check;"
```

Resultados esperados: grupo `Compras entre amigos`, 50 favoritos, seis pacotes e nenhuma violação FK. Conferir também `$LASTEXITCODE` após a importação; zero indica sucesso do processo. Se o CLI retornar erro, não ignorar nem executar manualmente as linhas restantes.

5. Entrar em `https://dev.useloti.com/login` com `gabriel.almeida@loti.test` e a senha do arquivo de credenciais. Bruna, Amanda, Vinícius e Rafael têm contas equivalentes listadas nesse arquivo. O grupo é próprio do cenário; as contas pessoais existentes mantêm seu grupo e seus dados.

6. Depois de conferir e guardar a senha onde preferir, apagar os arquivos locais:

```powershell
Remove-Item -LiteralPath '.\artifacts\development-seed\loti-dev-seed.sql', '.\artifacts\development-seed\loti-dev-seed.sql.credentials.json', '.\artifacts\development-seed\loti-dev-seed.sql.summary.json'
```

Apagar os arquivos locais não apaga os dados importados.

## Conteúdo

| Área | Dados |
| --- | --- |
| Meu grupo / Perfil | Gabriel Almeida, Bruna Martins, Amanda Costa, Vinícius Rocha e Rafael Lima; dois convites pendentes |
| Favoritos | 50 favoritos e 18 coleções pessoais; listas/cards, preços preenchidos/pendentes e três estados de avaliação |
| Compra atual | Dez produtos, quantidades de 1 a 4, quatro itens adicionados ao carrinho, divisão individual e 60%/40%, um preço pendente |
| Histórico | Quatro compras finalizadas, 34 linhas históricas; 44 linhas e 87 unidades contando a compra atual |
| Pedidos | 35 linhas incluindo adicional pago, preços/China pendentes, pagamentos Pix/cartão, chegadas parciais e 22 unidades livres |
| Pacotes | Seis pacotes: dois em montagem, um fechado com frete pago, um fechado com frete pendente, um enviado e um recebido/encerrado |
| Reembolsos | Um solicitado e um recebido parcialmente na conta HubBuy, com pagamento/taxa original preservados |
| Contas HubBuy | Duas ativas e uma arquivada; reembolso, bônus, simulação/pesagem e adicional pago com saldo; saldo final ¥537,00 |
| Adicionais | Um pago com saldo e outro em rascunho |

Produtos/modelos reais: Nike Vomero 18, Adidas Campus 00s, WD Blue SN5000, Ryzen 7 7700, Kingston Fury Beast, Logitech MX Master 3S, Keychron K2, Sony WH-1000XM5, roupas Uniqlo, cabos Anker, palhetas Fender e outros. Pessoas são fictícias, com nomes completos. Valores/quantidades são representativos; não são cotações atuais ou dados copiados da produção. Os emails reservados `@loti.test` não recebem mensagens. As fotos QC ficam vazias; nenhum acesso a R2/Cloudflare, download, scraping ou envio de email é realizado.

## Como o SQL foi gerado e protegido

A geração ocorre em banco libSQL novo **em memória**, com as migrations locais e os serviços reais da Loti. O exportador captura as escritas na ordem em que foram executadas. Isso preserva autenticação Better Auth, trilha financeira, atualizações de saldo, snapshots, reservas, eventos e gates sem desativar triggers ou FKs. Não é um dump de banco existente. O SQL omite `RETURNING`, para o CLI não imprimir hashes de credenciais ou registros completos.

O arquivo tem uma transação explícita. Antes das escritas de aplicação, valida a última migration/hash, o namespace do grupo e colisões com os cinco emails. Ao final valida contagens e FKs. Uma segunda importação é recusada; não existe `INSERT OR REPLACE`, reset ou sobrescrita de grupos existentes. As tabelas auxiliares `loti_dev_seed_runs`/`loti_dev_seed_steps` acompanham a carga já gerada e não integram migrations de produção.

Para gerar outro arquivo, se necessário:

```powershell
npm run db:seed:dev:sql -- --output artifacts/development-seed/outro-seed.sql
```

Sempre gera localmente; não conecta ao banco remoto. Pode receber `LOTI_DEV_SEED_PASSWORD` antes da geração para usar uma senha escolhida; sem essa variável, cria uma senha aleatória. Recusa sobrescrever SQL, credenciais ou resumo existentes. Gerar outro arquivo não libera uma segunda importação no mesmo grupo.

## Validação

```powershell
npx vitest run --maxWorkers=1 tests/integration/development-seed-sql.test.ts tests/integration/development-seed.test.ts tests/unit/development-seed-target.test.ts
npm run typecheck
```

O SQL pronto foi reaplicado localmente em libSQL com todas as triggers/FKs, produzindo 50 favoritos, 35 linhas de pedidos, seis pacotes e saldo conciliado de ¥537,00. Os testes também verificam senha Better Auth válida, Unicode/apóstrofos, ausência de senha em texto aberto, recusa de reaplicação e preservação de dados preexistentes. O Turso CLI remoto não foi executado nesta tarefa.
