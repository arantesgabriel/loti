import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import { packageCostFailure, packageCostPrivateHeaders, requirePackageCostOrigin } from "@/lib/domain/package-cost-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const workspaceId = new URL(request.url).searchParams.get("workspaceId") ?? undefined;
    return NextResponse.json({ data: await hubbuyBalanceServices(db, user.id).listAccounts(workspaceId) }, { headers: packageCostPrivateHeaders });
  } catch (error) { return packageCostFailure(error); }
}

export async function POST(request: Request) {
  try {
    requirePackageCostOrigin(request);
    const user = await requireUser();
    const body = z.object({ operation: z.literal("createAccount") }).passthrough().parse(await request.json());
    const payload = Object.fromEntries(Object.entries(body).filter(([key]) => key !== "operation"));
    return NextResponse.json({ data: await hubbuyBalanceServices(db, user.id).createAccount(payload) }, { headers: packageCostPrivateHeaders });
  } catch (error) { return packageCostFailure(error); }
}
