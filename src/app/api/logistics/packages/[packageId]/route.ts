import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { logisticsPackageServices } from "@/lib/domain/logistics-package-services";
import { packageCostFailure,packageCostPrivateHeaders,requirePackageCostOrigin } from "@/lib/domain/package-cost-http";
export const runtime="nodejs",dynamic="force-dynamic";
type Context={params:Promise<{packageId:string}>};
export async function GET(_request:Request,context:Context) {
  try {return NextResponse.json({data:await logisticsPackageServices(db,(await requireUser()).id).get((await context.params).packageId)},{headers:packageCostPrivateHeaders});}
  catch(error){return packageCostFailure(error);}
}
export async function POST(request:Request,context:Context) {
  try {
    requirePackageCostOrigin(request); const user=await requireUser();
    const body=z.object({idempotencyKey:z.string().min(1).max(200),command:z.unknown()}).strict().parse(await request.json());
    const service=logisticsPackageServices(db,user.id),{packageId}=await context.params;
    await service.execute(packageId,body.idempotencyKey,body.command);
    return NextResponse.json({data:await service.get(packageId)},{headers:packageCostPrivateHeaders});
  }catch(error){return packageCostFailure(error);}
}
