import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import { packageCostFailure, packageCostPrivateHeaders } from "@/lib/domain/package-cost-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ accountId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const user = await requireUser(), { accountId } = await params;
    const search = new URL(request.url).searchParams;
    const afterRaw = search.get("afterSequence"), limitRaw = search.get("limit");
    const afterSequence = afterRaw === null ? undefined : Number(afterRaw);
    const order = search.get("order") ?? "desc";
    if (order !== "asc" && order !== "desc") return NextResponse.json({ error: "Ordenação inválida." }, { status: 400, headers: packageCostPrivateHeaders });
    const limit = limitRaw === null ? undefined : Number(limitRaw);
    return NextResponse.json({ data: await hubbuyBalanceServices(db, user.id).readStatement(accountId, { afterSequence, limit, order }) }, { headers: packageCostPrivateHeaders });
  } catch (error) { return packageCostFailure(error); }
}
