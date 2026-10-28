import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { warehouseServices,warehouseQuerySchema } from "@/lib/domain/warehouse-services";
import { packageCostFailure,packageCostPrivateHeaders,requirePackageCostOrigin } from "@/lib/domain/package-cost-http";
export const runtime="nodejs", dynamic="force-dynamic";
export async function GET(request:Request) {
  try {const user=await requireUser(),query=warehouseQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));return NextResponse.json({data:await warehouseServices(db,user.id).list(query)},{headers:packageCostPrivateHeaders});}
  catch(error){return packageCostFailure(error);}
}
export async function POST(request:Request) {
  try {
    requirePackageCostOrigin(request);
    const user=await requireUser();
    const body=z.object({workspaceId:z.string().min(1),idempotencyKey:z.string().min(1).max(200),command:z.unknown()}).strict().parse(await request.json());
    return NextResponse.json({data:await warehouseServices(db,user.id).execute(body.workspaceId,body.idempotencyKey,body.command)},{headers:packageCostPrivateHeaders});
  }catch(error){return packageCostFailure(error);}
}
