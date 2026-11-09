import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { qcFailure, qcPrivateHeaders, requireQcOrigin } from "@/lib/domain/qc-http";
import { readBoundedJson } from "@/lib/domain/qc-validation";
import { ordersQcImport, ordersQcInput } from "@/lib/domain/orders-qc-import";

export const runtime = "nodejs", dynamic = "force-dynamic", maxDuration = 120;
export async function GET(request: Request) {
  try { const user = await requireUser(), workspaceId = new URL(request.url).searchParams.get("workspaceId") ?? undefined; return NextResponse.json({ data: await ordersQcImport(db, user.id, {}, workspaceId).capabilities() }, { headers: qcPrivateHeaders }); }
  catch (error) { return qcFailure(error); }
}
export async function POST(request: Request) {
  try {
    requireQcOrigin(request);
    const user = await requireUser(), raw = z.object({ workspaceId: z.string().min(1) }).passthrough().parse(await readBoundedJson(request));
    const { workspaceId, ...command } = raw, body = ordersQcInput.parse(command), service = ordersQcImport(db, user.id, {}, workspaceId);
    return NextResponse.json({ data: body.operation === "preview" ? await service.preview(body.data) : await service.prepare(body.data, body.choices) }, { headers: qcPrivateHeaders });
  } catch (error) { return qcFailure(error); }
}
