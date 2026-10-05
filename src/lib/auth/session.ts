import "server-only";
import { headers } from "next/headers";
import { auth } from "./index";
import { DomainError } from "../domain/errors";
export async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new DomainError("Entre na sua conta para continuar.", 401);
  return session.user;
}
