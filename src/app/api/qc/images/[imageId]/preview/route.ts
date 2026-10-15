import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { qcFailure, qcPrivateHeaders } from "@/lib/domain/qc-http";
import { qcServices } from "@/lib/domain/qc-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ imageId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser(), { imageId } = await context.params;
    const bytes = await qcServices(db, user.id).getPreview(imageId);
    const body = new Uint8Array(bytes.byteLength);
    body.set(bytes);
    return new NextResponse(body, { status: 200, headers: { ...qcPrivateHeaders, "Content-Type": "image/webp", "Content-Length": String(bytes.byteLength), "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch (error) { return qcFailure(error); }
}
