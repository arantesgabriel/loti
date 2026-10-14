import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import type { AppDatabase } from "../src/lib/db/connection";
import { account, session, user } from "../src/lib/db/schema";

export const passwordResetSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(12).max(128),
});

export function resetDatabaseUrl(env: Record<string, string | undefined>) {
  const url = env.TURSO_DATABASE_URL?.trim();
  if (!url || !/^(?:libsql:\/\/|https:\/\/|file:)/.test(url)) {
    throw new Error("Defina TURSO_DATABASE_URL explicitamente (libsql://, https:// ou file:). Nenhum banco foi alterado.");
  }
  if (!url.startsWith("file:") && !env.TURSO_AUTH_TOKEN?.trim()) {
    throw new Error("Defina TURSO_AUTH_TOKEN com permissão de escrita no banco remoto.");
  }
  return url;
}

export async function resetMemberPassword(db: AppDatabase, input: { email: string; password: string }) {
  const { email, password } = passwordResetSchema.parse(input);
  const hash = await hashPassword(password);
  return db.transaction(async tx => {
    const member = await tx.select({ id: user.id }).from(user).where(eq(user.email, email)).get();
    if (!member) throw new Error("Usuário não encontrado. Nenhuma conta foi criada.");
    const credentials = await tx.select({ id: account.id }).from(account)
      .where(and(eq(account.userId, member.id), eq(account.providerId, "credential"))).all();
    if (credentials.length !== 1) throw new Error("O usuário precisa ter exatamente uma conta de email/senha. Operação cancelada.");

    const updated = await tx.update(account).set({ password: hash, updatedAt: new Date() })
      .where(eq(account.id, credentials[0].id)).returning({ id: account.id }).all();
    if (updated.length !== 1) throw new Error("Não foi possível atualizar a conta. Operação cancelada.");
    const revoked = await tx.delete(session).where(eq(session.userId, member.id)).returning({ id: session.id }).all();
    return { email, revokedSessions: revoked.length };
  });
}
