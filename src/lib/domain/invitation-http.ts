import { NextResponse } from "next/server";
import { z } from "zod";
import { authOrigin } from "../auth/origin";
import { DomainError } from "./errors";
export const privateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export function invitationFailure(error: unknown) {
  const status = error instanceof DomainError ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 500;
  const message = error instanceof DomainError ? error.message : status === 400 ? "Confira os campos informados." : "Não foi possível concluir. Tente novamente.";
  // Do not log request bodies, invitation URLs or tokens.
  return NextResponse.json({ error: message }, { status, headers: privateHeaders });
}
export function requireInvitationOrigin(request: Request) {
  const origin = authOrigin();
  if (request.headers.get("origin") !== origin) throw new DomainError("Origem da solicitação inválida.", 403);
}
