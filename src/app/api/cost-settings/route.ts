import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { packageCostServices } from "@/lib/domain/package-cost-services";
import { packageCostFailure, packageCostPrivateHeaders, requirePackageCostOrigin } from "@/lib/domain/package-cost-http";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { const workspaceId = new URL(request.url).searchParams.get("workspaceId") ?? undefined; return NextResponse.json({ data: await packageCostServices(db, (await requireUser()).id).getSettings(workspaceId) }, { headers: packageCostPrivateHeaders }); }
  catch (error) { return packageCostFailure(error); }
}

export async function POST(request: Request) {
  try {
    requirePackageCostOrigin(request);
    const user = await requireUser();
    const body = z.object({ workspaceId: z.string().min(1).max(200), pixBps: z.number().int().min(0).max(10_000), cardBps: z.number().int().min(0).max(10_000) }).strict().parse(await request.json());
    const service = packageCostServices(db, user.id, undefined, body.workspaceId);
    const data = await service.saveSettings(body);
    return NextResponse.json({ data }, { headers: packageCostPrivateHeaders });
  } catch (error) { return packageCostFailure(error); }
}
