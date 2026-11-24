import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { authorization } from "@/lib/domain/authorization";
import { packageFreightServices } from "@/lib/domain/package-freight-services";
import { packageSettlementServices } from "@/lib/domain/package-settlement-services";
import { freightRefundServices } from "@/lib/domain/freight-refunds";
import { packageCostFailure, packageCostPrivateHeaders, requirePackageCostOrigin } from "@/lib/domain/package-cost-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ packageId: string }> };
export async function GET(request: Request, { params }: Context) {
  try {
    const user = await requireUser(), { packageId } = await params;
    const query=new URL(request.url).searchParams;
    const workspaceId = z.string().min(1).parse(query.get("workspaceId"));
    const access = await authorization(db, user.id).requireActiveWorkspaceContext(workspaceId);
    if(query.get("view")==="allocations")return NextResponse.json({data:await packageFreightServices(db,user.id,workspaceId).allocations(packageId,z.string().min(1).parse(query.get("paymentId")),z.coerce.number().int().nonnegative().parse(query.get("offset")??0))},{headers:packageCostPrivateHeaders});
    const freight = await packageFreightServices(db, user.id, workspaceId).get(packageId);
    const settlement = access.kind === "shared" ? await packageSettlementServices(db, user.id, workspaceId).get(packageId) : null;
    return NextResponse.json({ data: { freight, settlement } }, { headers: packageCostPrivateHeaders });
  } catch (error) { return packageCostFailure(error); }
}
export async function POST(request: Request, { params }: Context) {
  try {
    requirePackageCostOrigin(request);
    const user = await requireUser(), { packageId } = await params;
    const body = z.object({ workspaceId: z.string().min(1), operation: z.enum(["freight.preview", "freight.confirm", "freight.reversal.preview", "freight.reverse", "settlement.preview", "settlement.confirm", "conversion.preview", "conversion.confirm", "receipt.preview", "receipt.record", "receipt.reversal.preview", "receipt.reverse","refund.preview","refund.record","refund.reversal.preview","refund.reverse"]), command: z.unknown() }).strict().parse(await request.json());
    const freight = packageFreightServices(db, user.id, body.workspaceId), settlement = packageSettlementServices(db, user.id, body.workspaceId);
    const refund=freightRefundServices(db,user.id,body.workspaceId);
    const result = body.operation === "refund.preview"?await refund.preview(packageId,body.command)
      :body.operation === "refund.record"?await refund.record(packageId,body.command)
      :body.operation === "refund.reversal.preview"?await refund.previewReversal(packageId,body.command)
      :body.operation === "refund.reverse"?await refund.reverse(packageId,body.command)
      :body.operation === "freight.preview" ? await freight.preview(packageId, body.command)
      : body.operation === "freight.confirm" ? await freight.confirm(packageId, body.command)
      : body.operation === "freight.reversal.preview" ? await freight.previewReversal(packageId, body.command)
      : body.operation === "freight.reverse" ? await freight.reverse(packageId, body.command)
      : body.operation === "settlement.preview" || body.operation === "conversion.preview" ? await settlement.preview(packageId, body.command)
      : body.operation === "settlement.confirm" || body.operation === "conversion.confirm" ? await settlement.confirm(packageId, body.command)
      : body.operation === "receipt.preview" ? await settlement.previewReceipt(packageId, body.command)
      : body.operation === "receipt.record" ? await settlement.recordReceipt(packageId, body.command)
      : body.operation === "receipt.reversal.preview" ? await settlement.previewReceiptReversal(packageId, body.command)
      : await settlement.reverseReceipt(packageId, body.command);
    return NextResponse.json({ data: result }, { headers: packageCostPrivateHeaders });
  } catch (error) { return packageCostFailure(error); }
}
