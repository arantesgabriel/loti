# Redefinir a senha de um usuário

Use este procedimento no PowerShell para trocar uma senha sem saber a anterior.
O comando encerra **todas as sessões do usuário**, inclusive a do dispositivo atual.
Ele não cria contas, não executa migrações e não precisa de deploy ou do app rodando.

## 1. Abrir a pasta do projeto

Use Node.js 24 e as dependências instaladas:

```powershell
Set-Location C:\Fontes\loti
node --version
```

Se as dependências ainda não estiverem instaladas, execute `npm ci`.

## 2. Selecionar o banco e informar o token

Copie a URL e o token de banco correspondentes ao ambiente desejado.
Para trocar a senha do app publicado, use o banco de produção (`loti-prod`),
com token que permita escrita. `loti-dev` é uma base separada.
Não compartilhe o token nem o coloque no Git.

```powershell
$env:TURSO_DATABASE_URL = Read-Host "URL do banco Turso (libsql://...)"
$tokenProtegido = Read-Host "Token do banco Turso" -AsSecureString
$env:TURSO_AUTH_TOKEN = [System.Net.NetworkCredential]::new("", $tokenProtegido).Password
```

## 3. Informar o email e executar a troca

Confira o email e o banco antes de executar. A senha deve ter de **12 a 128 caracteres**.
Ela não aparece durante a digitação; espaços no início e no fim fazem parte da senha.

```powershell
$emailUsuario = Read-Host "Email do usuário"
$senhaProtegida = Read-Host "Nova senha (12 a 128 caracteres)" -AsSecureString
$env:LOTI_USER_PASSWORD = [System.Net.NetworkCredential]::new("", $senhaProtegida).Password

try {
    npm run user:reset-password -- --email "$emailUsuario"
    if ($LASTEXITCODE -ne 0) {
        throw "A troca falhou. Leia a mensagem acima e corrija antes de tentar novamente."
    }
} finally {
    Remove-Item Env:LOTI_USER_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:TURSO_AUTH_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:TURSO_DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Variable senhaProtegida, tokenProtegido -ErrorAction SilentlyContinue
}
```

O resultado esperado é:

```text
Banco selecionado: <host do banco>
Senha redefinida para pessoa@example.com. Sessões encerradas: <quantidade>.
```

O comando recebe a senha somente por `LOTI_USER_PASSWORD`; não existe argumento `--password`.
As variáveis acima valem apenas para este terminal e têm prioridade sobre o `.env`.
O script também lê `.env` da raiz, se existir; ele não carrega `.env.local` automaticamente.
`BETTER_AUTH_SECRET` não é necessário para este comando.

## 4. Testar o acesso

Entre no Loti com o email e a nova senha. A senha anterior deixa de funcionar.
Se precisar, o usuário pode escolher outra senha em **Perfil**.
Compartilhe a senha diretamente com o usuário por um canal privado.

## Se houver erro

- **Usuário não encontrado:** confira o email e se escolheu o banco certo.
- **Conta de email/senha ausente ou duplicada:** o comando cancela; não cria uma conta para contornar o erro.
- **Senha inválida:** informe de 12 a 128 caracteres.
- **Falha de conexão ou permissão:** confira a URL, a rede, o token de escrita e se está usando a base do Loti já migrada.

A senha e o encerramento das sessões são gravados na mesma transação.
Se a conexão cair sem confirmar o resultado, teste o login antes de repetir o comando.
Para consultar a sintaxe: `npm run user:reset-password -- --help`.
