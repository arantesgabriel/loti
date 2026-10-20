import { NextResponse } from "next/server";
import { z } from "zod";
import { authOrigin } from "../auth/origin";
import { DomainError } from "./errors";
import { QcDomainError } from "./qc-errors";

export const qcPrivateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie, Origin" };
export function requireQcOrigin(request: Request) {
  if (request.headers.get("origin") !== authOrigin()) throw new DomainError("Origem da solicitação inválida.", 403, "QC_ORIGIN_REJECTED");
}
export function qcFailure(error: unknown) {
  if (error instanceof QcDomainError) {
    const headers = { ...qcPrivateHeaders, ...(error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : {}) };
    return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}), ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}), ...(error.upstreamStatus ? { upstreamStatus: error.upstreamStatus } : {}) }, { status: error.status, headers });
  }
  if (error instanceof DomainError) return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status, headers: qcPrivateHeaders });
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Confira a operação QC e seus campos.", code: "QC_REQUEST_INVALID" }, { status: 400, headers: qcPrivateHeaders });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Corpo JSON inválido.", code: "QC_REQUEST_INVALID" }, { status: 400, headers: qcPrivateHeaders });
  // Do not serialize provider errors, request bodies, URLs or credential-bearing SDK fields.
  console.error("Loti QC request failed", error instanceof Error ? error.name : "UnknownError");
  return NextResponse.json({ error: "Não foi possível concluir a operação QC.", code: "QC_INTERNAL" }, { status: 500, headers: qcPrivateHeaders });
}
