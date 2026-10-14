import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { qcFailure, qcPrivateHeaders, requireQcOrigin } from "@/lib/domain/qc-http";
import { qcServices } from "@/lib/domain/qc-services";
import { readBoundedJson } from "@/lib/domain/qc-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
type RouteContext = { params: Promise<{ importId: string }> };
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const choice = z.object({ externalKey: z.string().min(1).max(500), purchaseItemId: z.string().min(1).nullable(), correctExisting: z.boolean().optional(), expectedItemId: z.string().min(1).nullable().optional() }).strict();
const postSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("confirm"), expectedRevision: revision, choices: z.array(choice).max(500) }).strict(),
  z.object({ operation: z.literal("batch"), expectedRevision: revision }).strict(),
]);

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser(), { importId } = await context.params;
    return NextResponse.json({ data: await qcServices(db, user.id).getImport(importId) }, { headers: qcPrivateHeaders });
  } catch (error) { return qcFailure(error); }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    requireQcOrigin(request);
    const user = await requireUser(), { importId } = await context.params, service = qcServices(db, user.id);
    const body = postSchema.parse(await readBoundedJson(request));
    const data = body.operation === "confirm" ? await service.confirmImport(importId, body.expectedRevision, body.choices) : await service.runImportBatch(importId, body.expectedRevision);
    return NextResponse.json({ data }, { headers: qcPrivateHeaders });
  } catch (error) { return qcFailure(error); }
}
