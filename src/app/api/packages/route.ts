import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { packageCostServices } from "@/lib/domain/package-cost-services";
import { packageCostFailure, packageCostPrivateHeaders, requirePackageCostOrigin } from "@/lib/domain/package-cost-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json({ data: await packageCostServices(db, (await requireUser()).id).list() }, { headers: packageCostPrivateHeaders }); }
  catch (error) { return packageCostFailure(error); }
}

export async function POST(request: Request) {
  try {
    requirePackageCostOrigin(request);
    const user = await requireUser();
    const body = z.object({ operation: z.literal("start"), purchaseId: z.string().min(1) }).strict().parse(await request.json());
    const service = packageCostServices(db, user.id), tracking = await service.startTracking(body.purchaseId);
    return NextResponse.json({ tracking, data: await service.list() }, { headers: packageCostPrivateHeaders });
  } catch (error) { return packageCostFailure(error); }
}
