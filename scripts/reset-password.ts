import "dotenv/config";
import { parseArgs } from "node:util";
import { z } from "zod";
import { openDatabase } from "../src/lib/db/connection";
import {
  passwordResetSchema,
  resetDatabaseUrl,
  resetMemberPassword,
} from "./password-reset";

let connection: ReturnType<typeof openDatabase> | undefined;
try {
  const { values } = parseArgs({
    options: { email: { type: "string" }, help: { type: "boolean" } },
  });
  if (values.help) {
    console.log(
      "Uso: npm run user:reset-password -- --email pessoa@example.com\nDefina TURSO_DATABASE_URL, TURSO_AUTH_TOKEN (remoto) e LOTI_USER_PASSWORD (12–128 caracteres).\nO comando redefine a senha e encerra todas as sessões do usuário, sem executar migrações.",
    );
  } else {
    const input = passwordResetSchema.parse({
      email: values.email,
      password: process.env.LOTI_USER_PASSWORD,
    });
    delete process.env.LOTI_USER_PASSWORD;
    const url = resetDatabaseUrl(process.env);
    console.log(
      `Banco selecionado: ${url.startsWith("file:") ? url : new URL(url).host}`,
    );
    connection = openDatabase(url);
    const result = await resetMemberPassword(connection.db, input);
    console.log(
      `Senha redefinida para ${result.email}. Sessões encerradas: ${result.revokedSessions}.`,
    );
  }
} catch (error) {
  // Never print Zod input, connection details, hashes or passwords.
  const message =
    error instanceof z.ZodError
      ? "Informe --email válido e LOTI_USER_PASSWORD com 12 a 128 caracteres."
      : error instanceof Error &&
          (error.message.startsWith("Defina ") ||
            error.message.startsWith("Usuário ") ||
            error.message.startsWith("O usuário ") ||
            error.message.startsWith("Não foi possível atualizar"))
        ? error.message
        : "Falha no reset. Verifique os argumentos, a conexão, o token de escrita e se o banco já possui as migrações do Loti.";
  console.error(message);
  process.exitCode = 1;
} finally {
  delete process.env.LOTI_USER_PASSWORD;
  connection?.client.close();
}
