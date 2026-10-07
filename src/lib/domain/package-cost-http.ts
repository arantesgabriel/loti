import { NextResponse } from "next/server";
import { z } from "zod";
import { authOrigin } from "@/lib/auth/origin";
import { DomainError } from "./errors";

export const packageCostPrivateHeaders = { "Cache-Control": "private, no-store" };

export function requirePackageCostOrigin(request: Request) {
  if (request.headers.get("origin") !== authOrigin()) throw new DomainError("Origem da solicitação inválida.", 403);
}

export function packageCostFailure(error: unknown) {
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Solicitação inválida." }, { status: 400, headers: packageCostPrivateHeaders });
  if (error instanceof DomainError) return NextResponse.json({ error: error.message }, { status: error.status, headers: packageCostPrivateHeaders });
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Confira os campos informados.", fields: error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })) }, { status: 400, headers: packageCostPrivateHeaders });
  console.error("Loti package costs request failed", error);
  return NextResponse.json({ error: "Não foi possível salvar. Tente novamente." }, { status: 500, headers: packageCostPrivateHeaders });
}
