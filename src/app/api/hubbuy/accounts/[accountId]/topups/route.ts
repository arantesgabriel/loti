import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { hubbuyTopupServices } from "@/lib/domain/hubbuy-topup-services";
import { packageCostFailure, packageCostPrivateHeaders, requirePackageCostOrigin } from "@/lib/domain/package-cost-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ accountId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    requirePackageCostOrigin(request);
    const user = await requireUser(), { accountId } = await params;
    const envelope = z.object({ operation: z.enum(["preview", "record", "reversal.preview", "reverse"]), workspaceId: z.string().min(1), command: z.unknown() }).strict().parse(await request.json());
    const service = hubbuyTopupServices(db, user.id, envelope.workspaceId);
    const result = envelope.operation === "preview" ? await service.preview(accountId, envelope.command)
      : envelope.operation === "record" ? await service.record(accountId, envelope.command)
      : envelope.operation === "reversal.preview" ? await service.previewReversal(accountId, envelope.command)
      : await service.reverse(accountId, envelope.command);
    return NextResponse.json({ data: result }, { headers: packageCostPrivateHeaders });
  } catch (error) { return packageCostFailure(error); }
}
