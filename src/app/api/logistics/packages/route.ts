import {NextResponse} from "next/server";
import {requireUser} from "@/lib/auth/session";
import {db} from "@/lib/db";
import {listLogisticsPackages,packageListQuerySchema} from "@/lib/domain/logistics-package-list";
import {packageCostFailure,packageCostPrivateHeaders} from "@/lib/domain/package-cost-http";
export const runtime="nodejs",dynamic="force-dynamic";
export async function GET(request:Request){
  try{const user=await requireUser();const query=packageListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));return NextResponse.json({data:await listLogisticsPackages(db,user.id,query)},{headers:packageCostPrivateHeaders});}catch(error){return packageCostFailure(error);}
}
