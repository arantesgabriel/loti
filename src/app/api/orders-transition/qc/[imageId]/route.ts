import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { qcImages } from "@/lib/db/schema";
import { qcServices } from "@/lib/domain/qc-services";
import { qcFailure, qcPrivateHeaders } from "@/lib/domain/qc-http";
import { ordersTransitionQcStorage } from "@/lib/qc/orders-transition-storage";
import { DomainError } from "@/lib/domain/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ imageId: string }> }) {
  try {
    const storage = ordersTransitionQcStorage();
    if (!storage) throw new DomainError("Recurso indisponível.", 404);
    const user = await requireUser(), { imageId } = await context.params;
    await qcServices(db, user.id).getOriginalSource(imageId); // full session, target, tombstone and membership checks
    const image = await db.select().from(qcImages).where(and(eq(qcImages.id, imageId), eq(qcImages.status, "ready"), eq(qcImages.deleteState, "none"))).get();
    if (!image) throw new DomainError("Imagem indisponível.", 404);
    const bytes = await storage.get(image.r2Key, 8 * 1024 * 1024);
    return new NextResponse(new Uint8Array(bytes), { headers: { ...qcPrivateHeaders, "Content-Type": image.mimeType!, "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return qcFailure(error); }
}
