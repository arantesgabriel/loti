import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { packageCostServices } from "@/lib/domain/package-cost-services";
import { packageCostFailure, packageCostPrivateHeaders, requirePackageCostOrigin } from "@/lib/domain/package-cost-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { const workspaceId = new URL(request.url).searchParams.get("workspaceId") ?? undefined; return NextResponse.json({ data: await packageCostServices(db, (await requireUser()).id).list(workspaceId) }, { headers: packageCostPrivateHeaders }); }
  catch (error) { return packageCostFailure(error); }
}

export async function POST(request: Request) {
  try {
    requirePackageCostOrigin(request);
    const user = await requireUser();
    const body = z.object({ operation: z.literal("start"), workspaceId: z.string().min(1), purchaseId: z.string().min(1) }).strict().parse(await request.json());
    const service = packageCostServices(db, user.id, undefined, body.workspaceId), tracking = await service.startTracking(body.purchaseId);
    return NextResponse.json({ tracking, data: await service.list(body.workspaceId) }, { headers: packageCostPrivateHeaders });
  } catch (error) { return packageCostFailure(error); }
}
