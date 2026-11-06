import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { authOrigin } from "@/lib/auth/origin";
import { db } from "@/lib/db";
import { referralService } from "@/lib/domain/referrals";
import { DomainError } from "@/lib/domain/errors";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== authOrigin()) throw new DomainError("Origem inválida.", 403);
    const member = await requireUser();
    const body = z.object({}).strict().parse(await request.json()); void body;
    const { token } = await referralService(db).getOrCreate(member.id);
    return NextResponse.json({ url: `${authOrigin()}/signup?ref=${token}` }, { headers });
  } catch (error) {
    const status = error instanceof DomainError ? error.status : error instanceof SyntaxError ? 400 : 401;
    return NextResponse.json({ error: error instanceof DomainError ? error.message : "Não foi possível gerar seu link agora." }, { status, headers });
  }
}
