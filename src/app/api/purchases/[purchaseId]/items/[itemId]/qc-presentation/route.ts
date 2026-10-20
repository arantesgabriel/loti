import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { qcFailure, qcPrivateHeaders, requireQcOrigin } from "@/lib/domain/qc-http";
import { qcServices } from "@/lib/domain/qc-services";
import { readBoundedJson } from "@/lib/domain/qc-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ purchaseId: string; itemId: string }> };
const coverSchema = z.object({ imageId: z.string().min(1).max(200), expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).strict();

export async function POST(request: Request, context: RouteContext) {
  try {
    requireQcOrigin(request);
    const user = await requireUser();
    const { purchaseId, itemId } = await context.params;
    const body = coverSchema.parse(await readBoundedJson(request));
    const data = await qcServices(db, user.id).setPresentationCover(purchaseId, itemId, body.imageId, body.expectedRevision);
    return NextResponse.json({ data }, { headers: qcPrivateHeaders });
  } catch (error) { return qcFailure(error); }
}
