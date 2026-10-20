import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { qcFailure, qcPrivateHeaders, requireQcOrigin } from "@/lib/domain/qc-http";
import { qcServices } from "@/lib/domain/qc-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ imageId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    requireQcOrigin(request);
    const user = await requireUser(), { imageId } = await context.params;
    const data = await qcServices(db, user.id).fallback(imageId);
    return NextResponse.json({ data }, { headers: qcPrivateHeaders });
  } catch (error) { return qcFailure(error); }
}
