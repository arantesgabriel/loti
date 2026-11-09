import "server-only";
import { headers } from "next/headers";
import { isAPIError } from "better-auth/api";
import { auth } from "./index";
import { db } from "../db";
import { activationState } from "./activation";
import { DomainError } from "../domain/errors";
export async function requireUser(options: { allowPendingActivation?: boolean } = {}) {
  const requestHeaders = await headers();
  let session;
  try {
    session = await auth.api.getSession({ headers: requestHeaders });
  } catch (error) {
    if (!isAPIError(error)) throw error;
    if (error.statusCode === 401) throw new DomainError("Entre na sua conta para continuar.", 401);
    if (error.statusCode >= 500) {
      console.error("Loti session unavailable", { code: error.body?.code, status: error.statusCode });
      throw new DomainError("Não foi possível verificar sua sessão. Tente novamente em instantes.", 503, "SESSION_UNAVAILABLE");
    }
    throw error;
  }
  if (!session) throw new DomainError("Entre na sua conta para continuar.", 401);
  if (!options.allowPendingActivation && (await activationState(db, session.user.id)).pending) {
    throw new DomainError("Confirme seu email para acessar o Loti.", 403, "EMAIL_ACTIVATION_REQUIRED");
  }
  return session.user;
}
