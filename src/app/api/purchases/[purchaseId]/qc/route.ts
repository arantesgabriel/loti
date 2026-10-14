import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { qcFailure, qcPrivateHeaders, requireQcOrigin } from "@/lib/domain/qc-http";
import { qcServices } from "@/lib/domain/qc-services";
import { readBoundedJson } from "@/lib/domain/qc-validation";
import { DomainError } from "@/lib/domain/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
type RouteContext = { params: Promise<{ purchaseId: string }> };
const postSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("prepare"), data: z.unknown() }).strict(),
  z.object({ operation: z.literal("reconcile") }).strict(),
]);

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(), { purchaseId } = await context.params, service = qcServices(db, user.id);
    const itemId = new URL(request.url).searchParams.get("itemId");
    if (!itemId) return NextResponse.json({ data: await service.getQcSummary(purchaseId) }, { headers: qcPrivateHeaders });
    const offsetRaw = new URL(request.url).searchParams.get("offset") ?? "0";
    if (!/^\d{1,8}$/.test(offsetRaw)) throw new DomainError("Offset QC inválido.", 400, "QC_REQUEST_INVALID");
    return NextResponse.json({ data: await service.getGallery(purchaseId, itemId, 50, Number(offsetRaw)) }, { headers: qcPrivateHeaders });
  } catch (error) { return qcFailure(error); }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    requireQcOrigin(request);
    const user = await requireUser(), { purchaseId } = await context.params, service = qcServices(db, user.id);
    const body = postSchema.parse(await readBoundedJson(request));
    const data = body.operation === "prepare" ? await service.prepare(purchaseId, body.data) : await service.runBatch(purchaseId);
    return NextResponse.json({ data }, { headers: qcPrivateHeaders });
  } catch (error) { return qcFailure(error); }
}
