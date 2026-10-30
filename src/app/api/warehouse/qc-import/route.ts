import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { qcFailure, qcPrivateHeaders, requireQcOrigin } from "@/lib/domain/qc-http";
import { readBoundedJson } from "@/lib/domain/qc-validation";
import { ordersQcImport, ordersQcInput } from "@/lib/domain/orders-qc-import";

export const runtime = "nodejs", dynamic = "force-dynamic", maxDuration = 120;
export async function GET() {
  try { const user = await requireUser(); return NextResponse.json({ data: await ordersQcImport(db, user.id).capabilities() }, { headers: qcPrivateHeaders }); }
  catch (error) { return qcFailure(error); }
}
export async function POST(request: Request) {
  try {
    requireQcOrigin(request);
    const user = await requireUser(), body = ordersQcInput.parse(await readBoundedJson(request)), service = ordersQcImport(db, user.id);
    return NextResponse.json({ data: body.operation === "preview" ? await service.preview(body.data) : await service.prepare(body.data, body.choices) }, { headers: qcPrivateHeaders });
  } catch (error) { return qcFailure(error); }
}
