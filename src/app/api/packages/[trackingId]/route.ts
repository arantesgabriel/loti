import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { packageCostServices } from "@/lib/domain/package-cost-services";
import { packageCostFailure, packageCostPrivateHeaders, requirePackageCostOrigin } from "@/lib/domain/package-cost-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ trackingId: string }> };

const bodySchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("item.save"), input: z.unknown() }).strict(),
  z.object({ operation: z.literal("package.create"), input: z.unknown() }).strict(),
  z.object({ operation: z.literal("package.delete"), packageId: z.string().min(1), input: z.unknown() }).strict(),
  z.object({ operation: z.literal("package.allocations"), input: z.unknown() }).strict(),
  z.object({ operation: z.literal("package.save"), packageId: z.string().min(1), input: z.unknown() }).strict(),
  z.object({ operation: z.literal("charge.save"), chargeId: z.string().min(1), input: z.unknown() }).strict(),
  z.object({ operation: z.literal("charge.paid"), chargeId: z.string().min(1), input: z.unknown() }).strict(),
  z.object({ operation: z.literal("tracking.close"), input: z.unknown() }).strict(),
  z.object({ operation: z.literal("tracking.reopen"), input: z.unknown() }).strict(),
]);

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser(), { trackingId } = await context.params;
    return NextResponse.json({ data: await packageCostServices(db, user.id).getTracking(trackingId) }, { headers: packageCostPrivateHeaders });
  } catch (error) { return packageCostFailure(error); }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    requirePackageCostOrigin(request);
    const user = await requireUser(), { trackingId } = await context.params;
    const body = bodySchema.parse(await request.json()), service = packageCostServices(db, user.id);
    switch (body.operation) {
      case "item.save": await service.saveItemCosts(trackingId, body.input); break;
      case "package.create": await service.createPackage(trackingId, body.input); break;
      case "package.delete": await service.deletePackage(trackingId, body.packageId, body.input); break;
      case "package.allocations": await service.saveAllocations(trackingId, body.input); break;
      case "package.save": await service.savePackage(trackingId, body.packageId, body.input); break;
      case "charge.save": await service.saveCharge(trackingId, body.chargeId, body.input); break;
      case "charge.paid": await service.markChargePaid(trackingId, body.chargeId, body.input); break;
      case "tracking.close": await service.closeTracking(trackingId, body.input); break;
      case "tracking.reopen": await service.reopenTracking(trackingId, body.input); break;
    }
    return NextResponse.json({ data: await service.getTracking(trackingId) }, { headers: packageCostPrivateHeaders });
  } catch (error) { return packageCostFailure(error); }
}
