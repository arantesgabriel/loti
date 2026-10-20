import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { qcFailure } from "@/lib/domain/qc-http";
import { qcPreviewHeaders } from "@/lib/qc/preview-http";
import { qcServices } from "@/lib/domain/qc-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ imageId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(), { imageId } = await context.params;
    const { bytes, etag } = await qcServices(db, user.id, { signal: request.signal }).readPreview(imageId, request.headers.get("if-none-match"));
    if (!bytes) return new NextResponse(null, { status: 304, headers: { ...qcPreviewHeaders, ETag: etag } });
    const body = new Uint8Array(bytes.byteLength);
    body.set(bytes);
    return new NextResponse(body, { status: 200, headers: { ...qcPreviewHeaders, ETag: etag, "Content-Length": String(bytes.byteLength) } });
  } catch (error) { return qcFailure(error); }
}
