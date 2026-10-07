import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { packageCostServices } from "@/lib/domain/package-cost-services";
import { packageCostFailure, packageCostPrivateHeaders, requirePackageCostOrigin } from "@/lib/domain/package-cost-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json({ data: await packageCostServices(db, (await requireUser()).id).getSettings() }, { headers: packageCostPrivateHeaders }); }
  catch (error) { return packageCostFailure(error); }
}

export async function POST(request: Request) {
  try {
    requirePackageCostOrigin(request);
    const user = await requireUser(), service = packageCostServices(db, user.id);
    const data = await service.saveSettings(await request.json());
    return NextResponse.json({ data }, { headers: packageCostPrivateHeaders });
  } catch (error) { return packageCostFailure(error); }
}
