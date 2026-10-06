import { NextResponse } from "next/server";
import { z } from "zod";
import { authOrigin } from "@/lib/auth/origin";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { invitationService, limitInvitations } from "@/lib/domain/invitations";
import { invitationFailure, privateHeaders, requireInvitationOrigin } from "@/lib/domain/invitation-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const bodySchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("issue"), email: z.string(), previousId: z.string().min(1).optional() }),
  z.object({ operation: z.literal("revoke"), id: z.string().min(1) }),
]);
export async function GET() {
  try { return NextResponse.json(await invitationService(db).group((await requireUser()).id), { headers: privateHeaders }); }
  catch (error) { return invitationFailure(error); }
}
export async function POST(request: Request) {
  try {
    requireInvitationOrigin(request);
    const member = await requireUser();
    await limitInvitations(db, `manage:${member.id}`, 15);
    const body = bodySchema.parse(await request.json()), service = invitationService(db);
    if (body.operation === "revoke") { await service.revoke(member.id, body.id); return NextResponse.json({ ok: true }, { headers: privateHeaders }); }
    const result = await service.issue(member.id, body.email, body.previousId);
    const origin = authOrigin();
    return NextResponse.json({ link: `${origin}/invite/${result.token}`, expiresAt: result.expiresAt }, { headers: privateHeaders });
  } catch (error) { return invitationFailure(error); }
}
